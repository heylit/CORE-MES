import type { Db } from '#cekirdek/db.ts';
import { kayitNoktasi } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type {
  AyarlarCevabi, KayitTuru, KaynakKlasoruCevabi, MevcutAcCevabi, MevcutCevabi, TopluGeriAlCevabi,
} from '#paylasilan/sozlesme/ortak-dosyalar.ts';
import { rollerVeBayraklari } from '../kisiler/disari.ts';
import {
  FIRMASIZ_PROJELER_ADI, KAYIT_ILETILERI, KOK_ADI, KOK_DUZEYLERI, SIPARISSIZ_PROJELER_ADI, adAnahtari, firmaKlasorAdi, projeKlasorAdi,
  sablonDenetle, siparisKlasorAdi, zincirKaynagi,
} from './kurallar.ts';
import type { FirmaBilgisi, KayitZinciri, SiparisBilgisi } from './kurallar.ts';
import { gorunumKur, klasorIste } from './servis.ts';
import * as s from './sorgular.ts';

// Kayda bağlı klasörler (kart 3288; 2067-4 a, ADR 0030 eki). Müşteri, sipariş ve proje açılınca kaynak modülün olayı klasörü buradan
// açtırır; dinleyici ve kaydı okuyan karşılıklar sunucu/kablolama.ts'te bağlanır (bu modül kaynak modülleri ithal etmez, onlar da bunu). Sistem yazması klasör
// düzeyine takılmaz: kayıt sahibi modülün ucunda yetki zaten denetlenmiştir. Olusturan kişi kaydı açan kişidir.

const KLASOR_KISITLARI = { ortak_dosyalar_klasor_ad_tekil: { ileti: KAYIT_ILETILERI.adCakisti, alan: 'ad' } };

interface Garanti { id: number; yeni: boolean }

async function klasorGarantile(
  db: Db, kisiId: number, topluIs: string | null, k: { kaynakTur: string; kaynakId: number | null; ustId: number; ad: string },
): Promise<Garanti> {
  const var_ = await s.kaynakKlasoru(db, k.kaynakTur, k.kaynakId);
  if (var_ !== null) return { id: var_.id, yeni: false };
  await s.klasorKilitle(db, k.ustId);
  const id = await kisitKorumali(KLASOR_KISITLARI, () => s.klasorEkle(db, {
    ustId: k.ustId, ad: k.ad, adAnahtari: adAnahtari(k.ad), ozelYetki: false, kisiId, kaynakTur: k.kaynakTur, kaynakId: k.kaynakId, topluIs,
  }));
  return { id, yeni: true };
}

// Şablon klasörleri kişi klasörüdür (sistem değil): Ekler/Yönetir düzeyindeki rol yanlarına klasör açabilir.
async function sablonuAc(db: Db, kisiId: number, ustId: number, hedef: 'siparis' | 'proje'): Promise<void> {
  for (const satir of (await s.sablonOku(db)).filter((x) => x.hedef === hedef)) {
    await kisitKorumali(KLASOR_KISITLARI, () => s.klasorEkle(db, { ustId, ad: satir.ad, adAnahtari: adAnahtari(satir.ad), ozelYetki: false, kisiId }));
  }
}

async function kokIste(db: Db): Promise<number> {
  const kok = await s.kaynakKlasoru(db, 'kok', null);
  if (kok === null) throw cakisma(KAYIT_ILETILERI.kokYok);
  return kok.id;
}

async function firmaKlasoru(db: Db, kisiId: number, topluIs: string | null, f: FirmaBilgisi): Promise<number> {
  return (await klasorGarantile(db, kisiId, topluIs, { kaynakTur: 'firma', kaynakId: f.id, ustId: await kokIste(db), ad: firmaKlasorAdi(f) })).id;
}

async function siparisKlasoru(db: Db, kisiId: number, topluIs: string | null, f: FirmaBilgisi, sp: SiparisBilgisi): Promise<number> {
  const ustId = await firmaKlasoru(db, kisiId, topluIs, f);
  // İptal siparişin klasörü arşivde açılır ve toplu işe yazılmaz: toplu işin arşivden çıkarılması onu görünür yapmasın.
  const g = await klasorGarantile(db, kisiId, sp.iptal ? null : topluIs, { kaynakTur: 'siparis', kaynakId: sp.id, ustId, ad: siparisKlasorAdi(sp) });
  if (g.yeni) {
    await sablonuAc(db, kisiId, g.id, 'siparis');
    if (sp.iptal) await s.klasorArsivYaz(db, [g.id], true, kisiId);
  }
  return g.id;
}

// Proje: siparişliyse siparişin altına, siparişsizse müşterinin "Siparişsiz projeler"ine, firmasızsa kökteki "Firmasız projeler"e.
async function projeKlasoruAc(db: Db, kisiId: number, topluIs: string | null, z: Extract<KayitZinciri, { tur: 'proje' }>): Promise<number> {
  let ustId: number;
  if (z.firma !== null && z.siparis !== null) ustId = await siparisKlasoru(db, kisiId, topluIs, z.firma, z.siparis);
  else if (z.firma !== null) {
    const firmaId = await firmaKlasoru(db, kisiId, topluIs, z.firma);
    ustId = (await klasorGarantile(db, kisiId, topluIs, { kaynakTur: 'siparissiz-projeler', kaynakId: z.firma.id, ustId: firmaId, ad: SIPARISSIZ_PROJELER_ADI })).id;
  } else {
    ustId = (await klasorGarantile(db, kisiId, topluIs, { kaynakTur: 'firmasiz-projeler', kaynakId: null, ustId: await kokIste(db), ad: FIRMASIZ_PROJELER_ADI })).id;
  }
  const g = await klasorGarantile(db, kisiId, topluIs, { kaynakTur: 'proje', kaynakId: z.proje.id, ustId, ad: projeKlasorAdi(z.proje) });
  if (g.yeni) await sablonuAc(db, kisiId, g.id, 'proje');
  return g.id;
}

function zincirAc(db: Db, kisiId: number, topluIs: string | null, z: KayitZinciri): Promise<number> {
  if (z.tur === 'firma') return firmaKlasoru(db, kisiId, topluIs, z.firma);
  if (z.tur === 'siparis') return siparisKlasoru(db, kisiId, topluIs, z.firma, z.siparis);
  return projeKlasoruAc(db, kisiId, topluIs, z);
}

export type KlasorSonucu = { tamam: true; klasorId: number } | { tamam: false; neden: string };

// KK-8 (Risk K3): kaydın kendi transaction'ında, ara noktayla çalışır. Klasör kural reddiyle açılamazsa ara noktaya dönülür, kayıt
// yazılmaya devam eder ve satır "Açılamayan klasörler"e aynı transaction'da düşer. Kural reddi dışındaki hata (süre aşımı, kilitlenme)
// kaydı da durdurur: yeniden denenince geçecek hata "açılamadı" diye saklanmaz. Günlüğe ad yazılmaz.
export async function kayitKlasoruAc(db: Db, kisiId: number, zincir: KayitZinciri, topluIs: string | null = null): Promise<KlasorSonucu> {
  const kaynak = zincirKaynagi(zincir);
  const sonuc = await kayitNoktasi(db, () => zincirAc(db, kisiId, topluIs, zincir));
  if (sonuc.tamam) {
    await s.acilamayanSil(db, kaynak.tur, kaynak.id);
    return { tamam: true, klasorId: sonuc.deger };
  }
  await s.acilamayanYaz(db, { tur: kaynak.tur, id: kaynak.id, neden: sonuc.hata.message, zincir, kisiId });
  return { tamam: false, neden: sonuc.hata.message };
}

// Kayıt adı değişince klasör adı izler (firma adı, proje adı, müşteri sipariş no). Klasörü olmayan kayıt için bir şey yapmaz.
export async function kayitKlasoruAdiniGuncelle(db: Db, kisiId: number, zincir: KayitZinciri): Promise<void> {
  const kaynak = zincirKaynagi(zincir);
  const ad = zincir.tur === 'firma' ? firmaKlasorAdi(zincir.firma) : zincir.tur === 'siparis' ? siparisKlasorAdi(zincir.siparis) : projeKlasorAdi(zincir.proje);
  const k = await s.kaynakKlasoru(db, kaynak.tur, kaynak.id);
  if (k === null) return;
  const sonuc = await kayitNoktasi(db, () => kisitKorumali(KLASOR_KISITLARI, () => s.sistemAdiYaz(db, k.id, ad, adAnahtari(ad))));
  if (!sonuc.tamam) await s.acilamayanYaz(db, { tur: kaynak.tur, id: kaynak.id, neden: sonuc.hata.message, zincir, kisiId });
}

// Sipariş iptal edilince klasör arşive kalkar, iptal geri alınınca döner (Kurgu 3). Dosya silinmez.
export async function kayitKlasoruArsivle(db: Db, kisiId: number, tur: KayitTuru, id: number, arsiv: boolean): Promise<void> {
  const k = await s.kaynakKlasoru(db, tur, id);
  if (k !== null) await s.klasorArsivYaz(db, [k.id], arsiv, kisiId);
}

// Kaynak olayı (kart 3288-2): kaydın klasörü yoksa açılır; varsa adı kayda, siparişte arşiv durumu iptale eşitlenir. Olay her
// yazmada gelir; değişmeyen ad ve arşiv yazılmaz. Klasörün taşınması (kaydın firması ya da siparişi değişti) yoktur (UYUM-BORCU 10).
export async function kayitEsitle(db: Db, kisiId: number, zincir: KayitZinciri): Promise<void> {
  const kaynak = zincirKaynagi(zincir);
  const k = await s.kaynakKlasoru(db, kaynak.tur, kaynak.id);
  if (k === null) { await kayitKlasoruAc(db, kisiId, zincir); return; }
  await kayitKlasoruAdiniGuncelle(db, kisiId, zincir);
  if (zincir.tur === 'siparis' && k.arsiv !== zincir.siparis.iptal) await s.klasorArsivYaz(db, [k.id], zincir.siparis.iptal, kisiId);
}

// Mevcut kayıtların kaynağı (toplu komut): kablolama.ts kaynak modüllerin `disari.ts`'inden kurar. Bağlı değilse sayım "bağlı değil" döner.
export type KayitKaynagi = (db: Db) => Promise<KayitZinciri[]>;
let kayitKaynagi: KayitKaynagi | null = null;
export function kayitKaynagiKaydet(k: KayitKaynagi | null): void { kayitKaynagi = k; }

// Ayarlar ---------------------------------------------------------------------------------------------------------------------

const zincirEtiketi = (z: unknown): string => {
  const x = z as Partial<KayitZinciri> | null;
  if (x?.tur === 'firma' && x.firma !== undefined) return `Müşteri ${firmaKlasorAdi(x.firma)}`;
  if (x?.tur === 'siparis' && x.siparis !== undefined) return `Sipariş ${x.siparis.no}`;
  if (x?.tur === 'proje' && x.proje !== undefined) return `Proje ${x.proje.kod}`;
  return 'Kayıt';
};

export async function ayarlar(db: Db): Promise<AyarlarCevabi> {
  const kok = await s.kaynakKlasoru(db, 'kok', null);
  const sablon = await s.sablonOku(db);
  return {
    kok: kok === null ? null : { id: kok.id, ad: kok.ad },
    sablon: { siparis: sablon.filter((x) => x.hedef === 'siparis').map((x) => x.ad), proje: sablon.filter((x) => x.hedef === 'proje').map((x) => x.ad) },
    acilamayan: (await s.acilamayanlar(db)).map((a) => ({ tur: a.tur, id: a.id, etiket: zincirEtiketi(a.zincir), neden: a.neden, zaman: a.zaman })),
    topluIsler: await s.topluIsler(db),
  };
}

// Risk K1: kök göçle değil, yöneticinin komutuyla bir kez açılır. Üst düzeyde aynı adlı kişi klasörü varsa durur, iki klasörü
// birleştirmez. Rol düzeyleri 2067-5 a'dandır; yerel olarak bulunmayan rol atlanır.
export async function kokAc(db: Db, kullanici: Kullanici): Promise<AyarlarCevabi> {
  if ((await s.kaynakKlasoru(db, 'kok', null)) !== null) throw cakisma(KAYIT_ILETILERI.kokVar);
  if ((await s.kokAdiDolu(db, adAnahtari(KOK_ADI))) !== null) throw cakisma(KAYIT_ILETILERI.kokAdiDolu);
  const id = await s.klasorEkle(db, { ustId: null, ad: KOK_ADI, adAnahtari: adAnahtari(KOK_ADI), ozelYetki: true, kisiId: kullanici.id, kaynakTur: 'kok' });
  const roller = await rollerVeBayraklari(db);
  const satirlar = roller.flatMap((r) => {
    const d = KOK_DUZEYLERI[r.kod];
    return d === undefined || r.yonetici ? [] : [{ rolId: r.id, duzey: d }];
  });
  await s.yetkiSatirlariniYaz(db, id, satirlar);
  await s.klasorEkle(db, {
    ustId: id, ad: FIRMASIZ_PROJELER_ADI, adAnahtari: adAnahtari(FIRMASIZ_PROJELER_ADI), ozelYetki: false, kisiId: kullanici.id, kaynakTur: 'firmasiz-projeler',
  });
  return ayarlar(db);
}

export async function sablonKaydet(db: Db, g: { siparis: readonly string[]; proje: readonly string[] }): Promise<AyarlarCevabi> {
  for (const [hedef, adlar] of [['siparis', g.siparis], ['proje', g.proje]] as const) {
    const ret = sablonDenetle(adlar);
    if (ret !== null) throw dogrulama(ret, hedef);
    await s.sablonYaz(db, hedef, adlar.map((ad) => ({ ad: ad.trim(), adAnahtari: adAnahtari(ad) })));
  }
  return ayarlar(db);
}

export async function yenidenDene(db: Db, kullanici: Kullanici, tur: KayitTuru, id: number): Promise<AyarlarCevabi> {
  const satir = await s.acilamayanOku(db, tur, id);
  if (satir === null) throw bulunamadi(KAYIT_ILETILERI.kaynakYok);
  await kayitKlasoruAc(db, kullanici.id, satir.zincir as KayitZinciri);
  return ayarlar(db);
}

async function klasorsuzler(db: Db): Promise<KayitZinciri[]> {
  if (kayitKaynagi === null) return [];
  const var_ = new Set((await s.kaynakliKimlikler(db)).map((k) => `${k.tur}:${k.id}`));
  return (await kayitKaynagi(db)).filter((z) => { const k = zincirKaynagi(z); return !var_.has(`${k.tur}:${k.id}`); });
}

const say = (liste: readonly KayitZinciri[]) => ({
  firma: liste.filter((z) => z.tur === 'firma').length,
  siparis: liste.filter((z) => z.tur === 'siparis').length,
  proje: liste.filter((z) => z.tur === 'proje').length,
});

export async function mevcutSayim(db: Db): Promise<MevcutCevabi> {
  return { bagli: kayitKaynagi !== null, kokVar: (await s.kaynakKlasoru(db, 'kok', null)) !== null, klasorsuz: say(await klasorsuzler(db)) };
}

export const TOPLU_GRUP = 100;

// Risk K4: yeni işlem açmaz (uç `ortak-dosyalar.yetki-ver` ister); eşgüçlüdür (kısmi tekil dizin, klasörü olan atlanır); her çağrı en
// çok TOPLU_GRUP kayıt açar ve kendi transaction'ındadır; açılanlar toplu iş kimliğiyle işaretlenir. İlk çağrıda gösterilen sayı
// verilir; değişmişse durur. Açılamayan kayıt hata listesine düşer ve bu koşuda yeniden denenmez.
export async function mevcutAc(
  db: Db, kullanici: Kullanici, g: { topluIs: string; beklenen: { firma: number; siparis: number; proje: number } | null },
): Promise<MevcutAcCevabi> {
  if (kayitKaynagi === null) throw cakisma(KAYIT_ILETILERI.kaynakSaglayiciYok);
  await kokIste(db);
  const hatali = new Set((await s.acilamayanlar(db)).map((a) => `${a.tur}:${a.id}`));
  const liste = (await klasorsuzler(db)).filter((z) => { const k = zincirKaynagi(z); return !hatali.has(`${k.tur}:${k.id}`); });
  if (g.beklenen !== null) {
    const simdi = say(liste);
    if (simdi.firma !== g.beklenen.firma || simdi.siparis !== g.beklenen.siparis || simdi.proje !== g.beklenen.proje) {
      throw cakisma(KAYIT_ILETILERI.beklenenFarkli, { simdi });
    }
  }
  let acilan = 0;
  let acilamayan = 0;
  for (const z of liste.slice(0, TOPLU_GRUP)) {
    const sonuc = await kayitKlasoruAc(db, kullanici.id, z, g.topluIs);
    if (sonuc.tamam) acilan += 1; else acilamayan += 1;
  }
  return { acilan, acilamayan, kalan: Math.max(0, liste.length - TOPLU_GRUP) };
}

// Risk K4 d: toplu işin klasörleri tek komutla arşive kalkar; altında dosya olan klasör atlanır (kullanıcının yüklediği dosya
// gözden kaybolmasın). `geriAl` false: arşivden geri döner.
export async function topluArsiv(db: Db, kullanici: Kullanici, topluIs: string, arsiv: boolean): Promise<TopluGeriAlCevabi> {
  const klasorler = await s.topluIsKlasorleri(db, topluIs);
  if (klasorler.length === 0) throw bulunamadi(KAYIT_ILETILERI.topluIsYok);
  const secilen = arsiv ? klasorler.filter((k) => !k.dolu) : klasorler;
  const yazilan = await s.klasorArsivYaz(db, secilen.map((k) => k.id), arsiv, kullanici.id);
  return { arsivlenen: yazilan.length, atlanan: klasorler.length - secilen.length };
}

// Kayıt ekranındaki "Klasör" bağlantısı: klasör kişiye görünmüyorsa 404 (ADR 0030, 5); bağlantı sunucunun cevabına dayanır.
export async function kaynakKlasoruBul(db: Db, kullanici: Kullanici, tur: KayitTuru, id: number): Promise<KaynakKlasoruCevabi> {
  const k = await s.kaynakKlasoru(db, tur, id);
  if (k === null) throw bulunamadi(KAYIT_ILETILERI.kaynakYok);
  klasorIste(await gorunumKur(db, kullanici), k.id, 'gorur');
  return { klasorId: k.id };
}
