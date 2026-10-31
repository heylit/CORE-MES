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
  OturumlarCevabi, OzetCevabi, RetListeCevabi, RetNedeni, SunucuDurumuCevabi,
} from '#paylasilan/sozlesme/guvenlik.ts';
import { SINYALLER } from '#paylasilan/sozlesme/guvenlik.ts';
import { pgVeriDiziniOku } from '#cekirdek/ayar.ts';
import { GUNLUK_SAKLAMA_GUN, sonHatalariOku, surecGunlukDurumu, type GunlukDurumu, type HataSatiri } from '#cekirdek/gunluk-dosyasi.ts';
import { httpsDurumuOku, izlenenSertifikaOku } from '#cekirdek/https-durumu.ts';
import { surecGuvenlikAlarmiYaz, surecOlayDurumu, type OlayDurumu } from '#cekirdek/olay-gunlugu.ts';
import { retOlaylariniBosalt } from '#cekirdek/red-kaydi.ts';
import type { GuncellemeKanali } from '#paylasilan/sozlesme/ayarlar.ts';
import { guncellemeKanaliDurumu, sistemAyariOku, yedekOrtaminiKur } from '../ayarlar/disari.ts';
import { bildirimGonder } from '../bildirim/disari.ts';
import { denetimDurumu } from '../denetim/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import {
  acikOturumlar, acikOturumlariSay, etkinHesapKilidiSay, etkinHesapKilitleri, girisDenemeleriListesi, girisDenemeleriniOzetle, hesapKilidiniKaldir,
  oturumuKapat, saatlikGirisDenemeleri, sonHesapKilitleri,
} from '../oturum/disari.ts';
import {
  ADRES_TARAMASI, RED_SAKLAMA_GUN, SAYILAN_RET_NEDENLERI, YETKI_REDDI_SERISI, adresTaramasiBulgulari, alarmDuyuruMetni, duyurulurMu,
  yetkiReddiBulgulari, type Bulgu,
  DURMA_ESIGI_DK, HATALI_SERI, denetimMaddesi, diskMaddesi, gunlukMaddesi, httpsMaddesi, imzaMaddesi, olayGunluguMaddesi, sertifikaMaddesi,
  sunucuSertifikaMaddesi, yedekMaddesi, type HttpsBilgisi, HESAP_KILIDI, SAKLAMA_GUN, SINYAL_TANIMLARI, TARAMA_ARALIGI_SN, VPN_MUAF_SINYALLER, YAYILAN_DENEME,
  alarmGuncellemesi, cokOturumBulgulari, hataliSeriBulgulari, hedefliHesapBulgulari, hesapKilidiBulgulari, kapatilabilirMi, kaynakAnahtari,
  onaylanabilirMi, taramaDurduMu, vpnDisindakiler, yayilanDenemeBulgulari,
} from './kurallar.ts';
import { diskDurumu, diskOku, surecYedegi, yedekUyarisi, type DiskOlcusu, type YedekBilgisi } from '../saglik/disari.ts';
import * as s from './sorgular.ts';

// Olay günlüğü yazıcısı testte değiştirilir; süreçte kurulmamışsa (Windows dışı) yazılmaz.
let olayaYaz: (metin: string) => void = surecGuvenlikAlarmiYaz;
export function olayYazicisiniKur(yazici: (metin: string) => void): () => void {
  const onceki = olayaYaz;
  olayaYaz = yazici;
  return () => { olayaYaz = onceki; };
}

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
  await reddedilenleriYaz(db);
  const bulgular = [
    ...yetkiReddiBulgulari(await s.kisiRetOzetleri(db, YETKI_REDDI_SERISI.pencereSn, SAYILAN_RET_NEDENLERI)),
    ...adresTaramasiBulgulari(await s.cihazTaramaOzetleri(db, ADRES_TARAMASI.pencereSn)),
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
      const id = await s.alarmAc(db, b);
      if (id === null) continue;
      yeniAlarm += 1;
      if (duyurulurMu(b)) await alarmiDuyur(db, id, b);
      continue;
    }
    const guncelleme = alarmGuncellemesi(mevcut, b);
    if (guncelleme !== null && (await s.alarmSayaclariniYaz(db, mevcut.id, guncelleme))) guncellenenAlarm += 1;
  }
  if (yeniAlarm > 0) await s.taramaDefterineYaz(db, yeniAlarm, guncellenenAlarm);
  await s.taramaDurumunuYaz(db);
  const silinen = (await s.eskileriSil(db, SAKLAMA_GUN)) + (await s.eskiRetleriSil(db, RED_SAKLAMA_GUN));
  return { yeniAlarm, guncellenenAlarm, silinen };
}

// Çekirdeğin tamponundaki reddedilen istekler tabloya geçer. Kişisi silinmiş olamaz (kişi silinmez, pasifleşir); tampon boşaltılınca
// olay ondan çıkar, transaction geri alınırsa o turun olayları kaybolur (VARSAYIM: tur seyrek düşer, kayıp en çok bir dakikalıktır).
async function reddedilenleriYaz(db: Db): Promise<void> {
  const { olaylar } = retOlaylariniBosalt();
  await s.retOlaylariniYaz(db, olaylar);
}

// 1362 a: yalnız duyuru; oturum kapatma ya da engelleme yönetici elle yapar. 1365 a: yöneticilere bildirim ve Windows olay günlüğü.
async function alarmiDuyur(db: Db, id: number, b: Bulgu): Promise<void> {
  const kisiAdi = b.kisiId === null ? null : (await kisiAdlari(db, [b.kisiId])).get(b.kisiId) ?? null;
  const metin = alarmDuyuruMetni(b, kisiAdi);
  await bildirimGonder(db, { tur: 'guvenlik.kritik-alarm', baslik: SINYAL_TANIMLARI[b.sinyal].baslik, metin, yol: '/guvenlik/alarmlar', kaynakKimlik: String(id) });
  olayaYaz(`TMI guvenlik alarmi: ${metin}`);
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

export async function reddedilenIstekler(
  db: Db, sorgu: { sayfa: number; sayfaBoyu?: number | undefined; neden?: RetNedeni | undefined; ara?: string | undefined },
): Promise<RetListeCevabi> {
  const suzgec = { neden: sorgu.neden ?? null, ara: sorgu.ara === undefined || sorgu.ara === '' ? null : sorgu.ara };
  return sayfaliListe(sorgu, {
    say: () => s.retSay(db, suzgec),
    satirlar: async (dilim) => {
      const satirlar = await s.retSatirlari(db, suzgec, dilim);
      const adlar = await kisiAdlari(db, satirlar.flatMap((r) => (r.kisiId === null ? [] : [r.kisiId])));
      return satirlar.map((r) => ({ ...r, kisiAdi: r.kisiId === null ? null : adlar.get(r.kisiId) ?? null }));
    },
  });
}

export interface KorumaKaynagi {
  yedek: (db: Db) => Promise<YedekBilgisi>;
  imza: () => Promise<GuncellemeKanali>;
  https: () => HttpsBilgisi;
}

const SUREC_KORUMA_KAYNAGI: KorumaKaynagi = { yedek: surecYedegi, imza: () => guncellemeKanaliDurumu(), https: () => httpsDurumuOku() };

// Okunamayan kaynak hatası koruma ekranını düşürmez: o madde "bilinmiyor" olur.
async function guvenliOku<T>(oku: () => T | Promise<T>): Promise<T | null> {
  try {
    return await oku();
  } catch {
    return null;
  }
}

// Yalnız okunabilen kaynaktan durum verilir; kaynağı olmayan madde "bilinmiyor"dur, açık ya da kapalı uydurulmaz.
export async function koruma(db: Db, kaynak: KorumaKaynagi = SUREC_KORUMA_KAYNAGI): Promise<KorumaCevabi> {
  const simdiMetni = await s.veritabaniSaati(db);
  const simdi = new Date(simdiMetni);
  const sonTarama = await s.sonTaramaZamani(db);
  const durdu = taramaDurduMu(sonTarama, simdiMetni);
  const etkinKilit = await etkinHesapKilidiSay(db);
  const yedek = await guvenliOku(() => kaynak.yedek(db));
  const https = await guvenliOku(kaynak.https);
  const madde = (anahtar: string, baslik: string, d: { durum: KorumaCevabi['maddeler'][number]['durum']; deger: string | null; aciklama: string }) =>
    ({ anahtar, baslik, ...d });
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
      madde('yedek', 'Yedek', yedekMaddesi(yedek, yedek === null ? null : yedekUyarisi(yedek, simdi))),
      madde('guncelleme-imzasi', 'Güncelleme paketi imzası', imzaMaddesi(await guvenliOku(kaynak.imza))),
      madde('https', 'Şifreli bağlantı (HTTPS)', httpsMaddesi(https)),
      madde('sertifika', 'Sertifika süresi', sertifikaMaddesi(https, simdi)),
      madde('denetim', 'Denetim kaydı', denetimMaddesi(await guvenliOku(() => denetimDurumu(db)))),
    ],
  };
}

export interface SunucuDurumuKaynagi {
  gunluk: () => GunlukDurumu | null;
  olay: () => OlayDurumu | null;
  windows: boolean;
  sonHatalar: (dizin: string) => HataSatiri[];
  yedek: (db: Db) => Promise<YedekBilgisi>;
  https: () => HttpsBilgisi;
  izlenenSertifika: () => { tanimli: boolean; bitis: Date | null };
  // Ölçülecek klasörler; tanımsız klasör (null) bilinmiyor sayılır.
  diskDizinleri: (db: Db, gunlukDizini: string | null) => Promise<readonly { ad: string; dizin: string | null }[]>;
  diskOku: (dizin: string) => Promise<DiskOlcusu | null>;
}

const SUREC_SUNUCU_KAYNAGI: SunucuDurumuKaynagi = {
  gunluk: surecGunlukDurumu,
  olay: surecOlayDurumu,
  windows: process.platform === 'win32',
  sonHatalar: (dizin) => sonHatalariOku(dizin, SON_HATA_SAYISI),
  yedek: surecYedegi,
  https: () => httpsDurumuOku(),
  izlenenSertifika: () => izlenenSertifikaOku(),
  diskDizinleri: async (db, gunlukDizini) => [
    { ad: 'Yedek', dizin: (await yedekOrtaminiKur(db)).dizin },
    { ad: 'Veritabanı', dizin: pgVeriDiziniOku() },
    { ad: 'Günlük', dizin: gunlukDizini },
  ],
  diskOku,
};

export const SON_HATA_SAYISI = 10;
// Ağ sürücüsündeki klasör kartı askıda tutmasın: süre dolarsa o disk bilinmiyor.
const DISK_SURESI_MS = 2000;

async function sureliOku<T>(oku: () => Promise<T>, sureMs: number): Promise<T | null> {
  let zamanlayici: NodeJS.Timeout | undefined;
  const sureDoldu = new Promise<null>((coz) => { zamanlayici = setTimeout(() => { coz(null); }, sureMs); });
  try {
    const is = guvenliOku(oku);
    return await Promise.race([is, sureDoldu]);
  } finally {
    clearTimeout(zamanlayici);
  }
}

// Okunamayan kaynak kartı düşürmez: o madde bilinmiyor olur (koruma ile aynı ilke).
export async function sunucuDurumu(db: Db, kaynak: SunucuDurumuKaynagi = SUREC_SUNUCU_KAYNAGI): Promise<SunucuDurumuCevabi> {
  const simdi = new Date(await s.veritabaniSaati(db));
  const gunluk = await guvenliOku(kaynak.gunluk);
  const yedek = await guvenliOku(() => kaynak.yedek(db));
  const dizinler = (await guvenliOku(() => kaynak.diskDizinleri(db, gunluk?.dizin ?? null))) ?? [];
  const diskler = await Promise.all(dizinler.map(async ({ ad, dizin }) => {
    const olcu = dizin === null ? null : await sureliOku(() => kaynak.diskOku(dizin), DISK_SURESI_MS);
    return { ad, disk: olcu === null ? null : diskDurumu(olcu.bos, olcu.toplam) };
  }));
  const hatalar = gunluk === null ? [] : (await guvenliOku(() => kaynak.sonHatalar(gunluk.dizin))) ?? [];
  const madde = (anahtar: string, baslik: string, d: { durum: KorumaCevabi['maddeler'][number]['durum']; deger: string | null; aciklama: string }) =>
    ({ anahtar, baslik, ...d });
  return {
    maddeler: [
      madde('gunluk', 'Sunucu günlüğü', gunlukMaddesi(gunluk, GUNLUK_SAKLAMA_GUN)),
      madde('olay-gunlugu', 'Windows olay günlüğü', olayGunluguMaddesi(await guvenliOku(kaynak.olay), kaynak.windows)),
      madde('yedek', 'Son yedek', yedekMaddesi(yedek, yedek === null ? null : yedekUyarisi(yedek, simdi))),
      madde('disk', 'Disk', diskMaddesi(diskler)),
      madde('sertifika', 'Sertifika süresi',
        sunucuSertifikaMaddesi(await guvenliOku(kaynak.https), await guvenliOku(kaynak.izlenenSertifika), simdi)),
    ],
    sonHatalar: hatalar.map((h) => ({ zaman: h.zaman.toISOString(), ileti: h.ileti, hata: h.hata, kod: h.istekKimligi })),
  };
}

export async function kurallar(db: Db): Promise<KurallarCevabi> {
  const vpn = await vpnAraliklari(db);
  return {
    kurallar: SINYALLER.map((sinyal) => ({ sinyal, ...SINYAL_TANIMLARI[sinyal] })),
    saklamaGun: SAKLAMA_GUN,
    redSaklamaGun: RED_SAKLAMA_GUN,
    vpnAraliklari: vpn.metin,
    muafSinyaller: vpn.metin.length === 0 ? [] : [...VPN_MUAF_SINYALLER],
    taramaAraligiSn: TARAMA_ARALIGI_SN,
    durmaEsigiDk: DURMA_ESIGI_DK,
  };
}
