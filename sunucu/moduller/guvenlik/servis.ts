import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, eskiSurum, gecersiz } from '#cekirdek/hata.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import { agAraliklariniCoz } from '#paylasilan/ag-araligi.ts';
import type { AgAraligi } from '#paylasilan/ag-araligi.ts';
import type { IkinciMenuSayaclari } from '#paylasilan/sayfa-tanimi.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import type {
  Alarm, AlarmGorunumu, AlarmKapatGovdesi, AlarmOnaylaGovdesi, GirisListeCevabi, KilitAcCevabi, KilitListeCevabi, KorumaCevabi, KurallarCevabi,
  OturumlarCevabi, OzetCevabi,
} from '#paylasilan/sozlesme/guvenlik.ts';
import { SINYALLER } from '#paylasilan/sozlesme/guvenlik.ts';
import { sistemAyariOku } from '../ayarlar/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import {
  acikOturumlar, acikOturumlariSay, etkinHesapKilidiSay, etkinHesapKilitleri, girisDenemeleriListesi, girisDenemeleriniOzetle, hesapKilidiniKaldir,
  oturumuKapat, saatlikGirisDenemeleri, sonHesapKilitleri,
} from '../oturum/disari.ts';
import {
  DURMA_ESIGI_DK, HATALI_SERI, HESAP_KILIDI, SAKLAMA_GUN, SINYAL_TANIMLARI, TARAMA_ARALIGI_SN, VPN_MUAF_SINYALLER, YAYILAN_DENEME,
  alarmGuncellemesi, cokOturumBulgulari, hataliSeriBulgulari, hedefliHesapBulgulari, hesapKilidiBulgulari, kapatilabilirMi, kaynakAnahtari,
  onaylanabilirMi, taramaDurduMu, vpnDisindakiler, yayilanDenemeBulgulari,
} from './kurallar.ts';
import * as s from './sorgular.ts';

export interface TaramaSonucu { yeniAlarm: number; guncellenenAlarm: number; silinen: number }

// Ayar yazılırken doğrulanır; okunan değer bu yüzden çözülür. Boş ayar muafiyet yok demektir.
async function vpnAraliklari(db: Db): Promise<{ metin: string[]; araliklar: AgAraligi[] }> {
  const deger = await sistemAyariOku(db, 'guvenlik.vpn-adres-araligi');
  return { metin: deger.split(/[\s,]+/).filter((o) => o !== ''), araliklar: agAraliklariniCoz(deger).araliklar };
}

// Tek tarama turu (zamanlayıcı her dakika çağırır). Kilit alınamazsa hiçbir şey yazmadan null döner (G-15).
export async function taramaYap(db: Db): Promise<TaramaSonucu | null> {
  if (!(await s.taramaKilidiAl(db))) return null;
  const simdi = await s.veritabaniSaati(db);
  const kisa = await girisDenemeleriniOzetle(db, { sonSn: HATALI_SERI.pencereSn });
  const uzun = vpnDisindakiler(await girisDenemeleriniOzetle(db, { sonSn: YAYILAN_DENEME.pencereSn }), (await vpnAraliklari(db)).araliklar);
  const bulgular = [
    ...hataliSeriBulgulari(kisa),
    ...yayilanDenemeBulgulari(uzun),
    ...hedefliHesapBulgulari(uzun),
    ...cokOturumBulgulari(await acikOturumlariSay(db), simdi),
    ...hesapKilidiBulgulari(
      await sonHesapKilitleri(db, { sonSn: HESAP_KILIDI.pencereSn }),
      await s.kapanmisKilitAlarmlari(db, HESAP_KILIDI.pencereSn),
    ),
  ];
  const acik = new Map((await s.kapanmamisAlarmlar(db)).map((a) => [kaynakAnahtari(a), a]));
  let yeniAlarm = 0;
  let guncellenenAlarm = 0;
  for (const b of bulgular) {
    const mevcut = acik.get(kaynakAnahtari(b));
    if (mevcut === undefined) {
      if ((await s.alarmAc(db, b)) !== null) yeniAlarm += 1;
      continue;
    }
    const guncelleme = alarmGuncellemesi(mevcut, b);
    if (guncelleme !== null && (await s.alarmSayaclariniYaz(db, mevcut.id, guncelleme))) guncellenenAlarm += 1;
  }
  if (yeniAlarm > 0) await s.taramaDefterineYaz(db, yeniAlarm, guncellenenAlarm);
  await s.taramaDurumunuYaz(db);
  const silinen = await s.eskileriSil(db, SAKLAMA_GUN);
  return { yeniAlarm, guncellenenAlarm, silinen };
}

async function adlarlaAlarmlar(db: Db, satirlar: s.AlarmSatiri[]): Promise<Alarm[]> {
  const idler = satirlar.flatMap((a) => [a.kisiId, a.onaylayanKisiId, a.kapatanKisiId]).filter((id): id is number => id !== null);
  const adlar = await kisiAdlari(db, idler);
  const ad = (id: number | null): string | null => (id === null ? null : adlar.get(id) ?? null);
  return satirlar.map(({ onaylayanKisiId, kapatanKisiId, ...a }) => ({
    ...a, kisiAdi: ad(a.kisiId), onaylayanAdi: ad(onaylayanKisiId), kapatanAdi: ad(kapatanKisiId),
  }));
}

export function alarmListesi(db: Db, sorgu: { sayfa: number; sayfaBoyu?: number | undefined; gorunum: AlarmGorunumu }): Promise<SayfaliListe<Alarm>> {
  return sayfaliListe(sorgu, {
    say: () => s.alarmSay(db, sorgu.gorunum),
    satirlar: async (dilim) => adlarlaAlarmlar(db, await s.alarmSatirlari(db, sorgu.gorunum, dilim)),
  });
}

const tekAlarm = async (db: Db, satir: s.AlarmSatiri): Promise<Alarm> => {
  const [alarm] = await adlarlaAlarmlar(db, [satir]);
  if (alarm === undefined) throw new Error('Alarm adlandırılamadı.');
  return alarm;
};

export async function alarmAyrintisi(db: Db, id: number): Promise<Alarm> {
  const satir = await s.alarmBul(db, id);
  if (satir === null) throw bulunamadi('Alarm bulunamadı.');
  return tekAlarm(db, satir);
}

// Kişi ve zaman sunucudan; gövde yalnız beklenen sürümü (ve kapanışta notu) taşır.
async function durumDegistir(
  db: Db, id: number, surum: number, uygunMu: (a: s.AlarmSatiri) => boolean, red: string, yaz: () => Promise<s.AlarmSatiri | null>,
): Promise<Alarm> {
  const mevcut = await s.alarmKilitle(db, id);
  if (mevcut === null) throw bulunamadi('Alarm bulunamadı.');
  // Eski sürümle gelen istek önce sürümü öğrenir: kayıt değiştiyse durum iletisi yanıltır.
  if (mevcut.surum !== surum) throw eskiSurum();
  if (!uygunMu(mevcut)) throw gecersiz(red);
  return tekAlarm(db, await surumluGuncelle({ guncelle: yaz, varMi: () => s.alarmVarMi(db, id), bulunamadiIletisi: 'Alarm bulunamadı.' }));
}

export function alarmOnayla(db: Db, kisiId: number, id: number, govde: AlarmOnaylaGovdesi): Promise<Alarm> {
  return durumDegistir(db, id, govde.surum, (a) => onaylanabilirMi(a.durum), 'Yalnız açık alarm onaylanır.',
    () => s.alarmOnayla(db, id, govde.surum, kisiId));
}

export function alarmKapat(db: Db, kisiId: number, id: number, govde: AlarmKapatGovdesi): Promise<Alarm> {
  return durumDegistir(db, id, govde.surum, (a) => kapatilabilirMi(a.durum), 'Kapanmış alarm değiştirilemez.',
    () => s.alarmKapat(db, id, govde.surum, kisiId, govde.not.trim()));
}

const SON_ALARM_SAYISI = 5;
const GUN_SN = 24 * 60 * 60;

export async function ozet(db: Db): Promise<OzetCevabi> {
  const sayilar = await s.durumSayilari(db);
  const sonTarama = await s.sonTaramaZamani(db);
  const simdi = await s.veritabaniSaati(db);
  const gunluk = await girisDenemeleriniOzetle(db, { sonSn: GUN_SN });
  const oturumlar = await acikOturumlariSay(db);
  return {
    acikAlarm: { kritik: sayilar.kritik, yuksek: sayilar.yuksek, orta: sayilar.orta },
    onaylanmisAlarm: sayilar.onaylandi,
    sonTarama,
    taramaDurdu: taramaDurduMu(sonTarama, simdi),
    girisler: {
      basarili: gunluk.reduce((t, g) => t + g.basariliSayi, 0),
      hatali: gunluk.reduce((t, g) => t + g.hataliSayi, 0),
      kullaniciAdi: new Set(gunluk.map((g) => g.kullaniciAdi)).size,
      cihaz: new Set(gunluk.flatMap((g) => (g.ip === null ? [] : [g.ip]))).size,
    },
    saatlik: await saatlikGirisDenemeleri(db, 24),
    acikOturum: { oturum: oturumlar.reduce((t, o) => t + o.acikOturum, 0), kisi: oturumlar.length },
    kilitliHesap: await etkinHesapKilidiSay(db),
    sonAlarmlar: await adlarlaAlarmlar(db, await s.sonAlarmlar(db, SON_ALARM_SAYISI)),
  };
}

// Kabuk ikinci menüde açık alarm sayısını gösterir; okuma yetkisi olmayana sayı verilmez.
export async function menuSayaclari(db: Db, islemler: readonly string[]): Promise<IkinciMenuSayaclari> {
  if (!islemler.includes('guvenlik.oku')) return {};
  const sayilar = await s.durumSayilari(db);
  return { alarmlar: sayilar.kritik + sayilar.yuksek + sayilar.orta };
}

export function girisler(
  db: Db, sorgu: { sayfa: number; sayfaBoyu?: number | undefined; sonuc?: 'basarili' | 'hatali' | undefined; ara?: string | undefined },
): Promise<GirisListeCevabi> {
  return girisDenemeleriListesi(db, sorgu);
}

export async function oturumlar(db: Db, istek: { cerez(ad: string): string | null }): Promise<OturumlarCevabi> {
  const liste = await acikOturumlar(db, istek);
  const adlar = await kisiAdlari(db, liste.map((o) => o.kisiId));
  return {
    oturumlar: liste.map((o) => ({ ...o, kisiAdi: adlar.get(o.kisiId) ?? `Kişi ${o.kisiId}` })),
  };
}

export function kilitler(db: Db, sorgu: { sayfa: number; sayfaBoyu?: number | undefined }): Promise<KilitListeCevabi> {
  return etkinHesapKilitleri(db, sorgu);
}

export function kilitAc(db: Db, kisiId: number, id: number): Promise<KilitAcCevabi> {
  return hesapKilidiniKaldir(db, id, kisiId);
}

export async function oturumKapat(db: Db, id: number, istek: { cerez(ad: string): string | null }): Promise<{ id: number }> {
  const sonuc = await oturumuKapat(db, id, istek);
  if (sonuc === 'yok') throw bulunamadi('Açık oturum bulunamadı.');
  if (sonuc === 'kendi') throw gecersiz('Kendi oturumunuzu buradan kapatamazsınız; çıkış yapın.');
  return { id };
}

// Yalnız okunabilen kaynaktan durum verilir; kaynağı olmayan madde "bilinmiyor"dur, açık ya da kapalı uydurulmaz.
export async function koruma(db: Db): Promise<KorumaCevabi> {
  const sonTarama = await s.sonTaramaZamani(db);
  const durdu = taramaDurduMu(sonTarama, await s.veritabaniSaati(db));
  const etkinKilit = await etkinHesapKilidiSay(db);
  const bilinmiyor = (anahtar: string, baslik: string, aciklama: string) => ({ anahtar, baslik, aciklama, durum: 'bilinmiyor' as const, deger: null });
  return {
    maddeler: [
      {
        anahtar: 'tarama', baslik: 'Güvenlik taraması',
        aciklama: `Giriş ve oturum kayıtları her ${TARAMA_ARALIGI_SN} saniyede taranır; ${DURMA_ESIGI_DK} dakikadan uzun tarama gelmezse uyarı verilir.`,
        durum: durdu ? 'uyari' : 'acik', deger: sonTarama,
      },
      {
        anahtar: 'hesap-kilidi', baslik: 'Hesap kilidi',
        aciklama: 'Art arda hatalı denemede kullanıcı adı geçici kilitlenir; her yeni kilit alarm açar ve Oturumlar ve kilitler bölümünden açılır.',
        durum: 'acik', deger: `${String(etkinKilit)} etkin kilit`,
      },
      bilinmiyor('yedek', 'Yedek', 'Son başarılı yedeğin zamanı Sistem Ayarları modülünden okunamıyor; istek yazıldı.'),
      bilinmiyor('guncelleme-imzasi', 'Güncelleme paketi imzası', 'İmza anahtarının kurulu olup olmadığı Sistem Ayarları modülünden okunamıyor; istek yazıldı.'),
      bilinmiyor('https', 'Şifreli bağlantı (HTTPS)', 'Bağlantının şifreli olup olmadığı çekirdekten okunamıyor; istek yazıldı.'),
      bilinmiyor('sertifika', 'Sertifika süresi', 'Sunucu sertifikasının bitiş tarihi çekirdekten okunamıyor; istek yazıldı.'),
      bilinmiyor('denetim', 'Denetim kaydı', 'Denetim kaydının durumu denetim modülünden okunamıyor; kayıtlar Denetim Kaydı sayfasındadır.'),
    ],
  };
}

export async function kurallar(db: Db): Promise<KurallarCevabi> {
  const vpn = await vpnAraliklari(db);
  return {
    kurallar: SINYALLER.map((sinyal) => ({ sinyal, ...SINYAL_TANIMLARI[sinyal] })),
    saklamaGun: SAKLAMA_GUN,
    vpnAraliklari: vpn.metin,
    muafSinyaller: vpn.metin.length === 0 ? [] : [...VPN_MUAF_SINYALLER],
    taramaAraligiSn: TARAMA_ARALIGI_SN,
    durmaEsigiDk: DURMA_ESIGI_DK,
  };
}
