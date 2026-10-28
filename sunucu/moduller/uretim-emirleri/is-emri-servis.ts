import type { Db } from '#cekirdek/db.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { sayfaliListe } from '#cekirdek/liste.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { SayfaliListe } from '#paylasilan/liste.ts';
import { AZAMI_ADIM, EMIR_TURLERI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import type {
  AcilisSecenekleri, SiradakiFasonCevabi, AdimliEmirAyrintisi, AdimliEmirOzeti, AdimliOzetCevabi, AtanabilirKaynak, RefakatKartiCevabi, EkAdim, EmirDurumu, EmirTuru, IsEmri, IsEmriKaynagi,
  ReworkAdimiGovdesi, RotasizAdimDuzenle, RotasizAdimEkle,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { firmaAra, firmaOzetleri } from '../musteri-tedarikci/disari.ts';
import { istasyonAdlari, istasyonKisiAtamalari, istasyonlar, makineGetir, operasyonTipleri } from '../istasyonlar/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { numaraAl, sistemAyariOku } from '../ayarlar/disari.ts';
import { firmaKodu, malzemeOzeti, malzemeOzetleri } from '../malzemeler/disari.ts';
import { projeGetir, projeSecenekleri } from '../projeler/disari.ts';
import { siparisAyrintisi, siparisSatiriOzetleri } from '../siparisler/disari.ts';
import {
  EMIR_YOK, IS_EMRI_YOK, KAYNAK_YOK, acikEmirIhlali, adimliOzetSay, adimliIptalIhlali, fasonDonusIhlali, fasonGidisIhlali, fasonTamamIhlali,
  gorunenDurum, guvenliUygula, oneDusenYeniAdimlar, yeniAdimOndeIletisi, isEmirleriIhlali, kaynakDegisimIhlali, kisininIstasyonu, siparisSatiriIhlali, oncelikDegisimIhlali, malzemeIhtiyaci, planaAlIhlali, siradakiIsEmri, teslimIhlali,
  BIRLESME_ADIMI_YOK, BIRLESME_PLANI_KOLDA, BOLME_ADET, BOLME_BIRLESME_ADIMI, BOLME_URETILMIS, EK_ADIM_OP, birlesmeBeklemeIhlali, birlesmePlaniIhlali, birlesmePlaniKaldirIhlali, birlestirmeIhlali, bolmeIhlali, ekAdimIhlali,
  ekAdimKaldirIhlali, kartAdimi, kartSiniri, kolBaslamaIhlali, kolEmirNo, refakatIhlali, refakatQrMetni,
  BILESEN_GECERSIZ, IS_EMRI_BAGLI_KAYIT, IS_EMRI_MALIYETI_DONDURULMUS, IS_EMRI_SIPARISE_BAGLI, IS_EMRI_STOK_HAREKETLI, ROTASIZ_EMIR_KAPALI, PROJE_GECERSIZ, PROJE_ZORUNLU, adaySatirlar, bilesenOlabilirMi, kendiligindenSatir, projeZorunluMu, rotasizAdimDegisimIhlali, rotasizAdimEkleIhlali, URETIM_YERI_BASLAMIS, uretimYeriIhlali, fasonBeklemesi, adimAdetleri,
  adimEksigi, reworkAdimiIhlali, reworkTermini,
} from './kurallar.ts';
import { emirAcildiBildir, emirBirlestiBildir, emirBittiBildir, emirIptalBildir, fasonHareketiBildir } from './emir-olaylari.ts';
import type { BolmeDurumu, FasonDurumu, IsEmriKaynakTuru, KolDurumu, UretimYeri } from './kurallar.ts';
import * as s from './sorgular.ts';
import type { AltPartiSatiri, FasonHareketiSatiri, IsEmriSatiri, IsEmriYazisi, UstEmirSatiri } from './sorgular.ts';

const URUN_DEGIL = 'Üretim emri yalnız kullanımdaki mamul ya da yarı mamul kartına açılır.';
const ADET_GECERSIZ = 'Adet 1 ile 1.000.000 arasında tam sayı olmalı.';
const ONCELIK_GECERSIZ = 'Öncelik 1 (acil) ile 4 (düşük) arasında olmalı.';
const ACIKLAMA_UZUN = 'Açıklama en çok 300 karakter olur.';
const EMIR_TURU_GECERSIZ = 'Emir türü listede yok.';
const TIP_YOK = 'Operasyon tipi bulunamadı.';
const FASON_FIRMA_YOK = 'Fason firma bulunamadı, pasif ya da fason işaretli değil.';
const KONTROL_LISTESI = `Kontrol listesi en çok ${AZAMI_ADIM} maddedir; madde adı boş olamaz, en çok 120 karakterdir.`;
const URETILEBILIR_TURLER: readonly string[] = ['mamul', 'yarimamul'];

/* ---------------- girdiler (UE1; rota baglanti.ts UretimEmriGirdisi ile birebir, ek alanlar isteğe bağlı) ---------------- */

export interface IsEmriGirdisi {
  sira: number;
  opNo: number;
  ad: string;
  operasyonTipiId: number;
  // Fason adımda kaynak finansın firmasıdır, süre yerine termin günü gelir; iş emri operatörle başlamaz (UE3).
  kaynak: { tur: IsEmriKaynakTuru; id: number } | null;
  // Kaynağı atanmamış adımın istasyonu (rota adımı istasyona bağlıysa); kaynak varsa istasyon ondan çözülür.
  istasyonId?: number | null;
  ayarSuresiDk: string | null;
  birimSureDk: string | null;
  terminGun: number | null;
  bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz';
  devirAdedi: number | null;
  talimatSurumu: number | null;
  kontrolListesi: { ad: string; aciklama: string | null }[];
  adaylar?: { kaynak: AtanabilirKaynak; ayarSuresiDk: string | null; birimSureDk: string | null }[];
  bilesenler?: { malzemeNo: number; miktar: string; fireYuzde?: string }[];
  firePayiYuzde?: string;
  makineKullanimi?: 'tek' | 'paralel';
  enKucukParca?: number | null;
  yenidenAyar?: boolean;
}

export interface UretimEmriGirdisi {
  malzemeNo: number;
  adet: number;
  teslim: string | null;
  kaynakRotaRevizyonId: number;
  isEmirleri: IsEmriGirdisi[];
  oncelik?: number;
  baslangic?: string | null;
  aciklama?: string | null;
  // Taslak emir planlanmamış öneridir; "Plana al" planlı yapar. Verilmezse emir planlı açılır (ilk sistemdeki gibi).
  taslak?: boolean;
  // Verilmezse seri (kart #699).
  emirTuru?: EmirTuru;
  // Yalnız aktif proje; proje kodu numaraya girer (kart #802). Verilmezse projesiz, numarada proje alanı düşer.
  projeId?: number | null;
  // Projenin siparişindeki onaylı satır (176 a); verilirse proje zorunludur.
  siparisSatiriId?: number | null;
  // Girdiler serbest stoktan emre ayrılsın mı (formda varsayılan açık); verilmezse ayrılmaz.
  stoktanRezerve?: boolean;
}

// Dışa açık komut işlemi kendisi arar: üst modülün ucunda aranan işlem bu komutun işlemi değildir.
function islemDenetle(kullanici: Kullanici, islemler: readonly Islem[]): number {
  if (!islemler.some((i) => islemVarMi(kullanici, i))) throw yetkiYok();
  return kullanici.id;
}

/* ---------------- kaynak çözümü (K3: makine ya da kişi, istasyon başlığı altında) ---------------- */

interface CozulmusKaynak { makineId: number | null; kisiId: number | null; fasonFirmaId: number | null; istasyonId: number | null }

async function kaynakCoz(db: Db, k: { tur: IsEmriKaynakTuru; id: number } | null): Promise<CozulmusKaynak> {
  if (k === null) return { makineId: null, kisiId: null, fasonFirmaId: null, istasyonId: null };
  if (k.tur === 'makine') {
    const m = await makineGetir(db, k.id);
    if (m === null || !m.aktif) throw dogrulama(KAYNAK_YOK, 'kaynak');
    return { makineId: m.id, kisiId: null, fasonFirmaId: null, istasyonId: m.istasyonId };
  }
  if (k.tur === 'kisi') {
    if (!(await kisiAdlari(db, [k.id])).has(k.id)) throw dogrulama(KAYNAK_YOK, 'kaynak');
    return { makineId: null, kisiId: k.id, fasonFirmaId: null, istasyonId: kisininIstasyonu(await istasyonKisiAtamalari(db, { kisiId: k.id }), k.id) };
  }
  const f = (await firmaOzetleri(db, [k.id])).get(k.id);
  if (f === undefined || !f.aktif || !f.fason) throw dogrulama(FASON_FIRMA_YOK, 'kaynak');
  return { makineId: null, kisiId: null, fasonFirmaId: f.id, istasyonId: null };
}

const kaynakTuru = (i: Pick<IsEmriSatiri, 'makineId' | 'kisiId' | 'fasonFirmaId'>): IsEmriKaynakTuru | null => {
  if (i.fasonFirmaId !== null) return 'fason';
  if (i.makineId !== null) return 'makine';
  return i.kisiId !== null ? 'kisi' : null;
};

async function yaziyaCevir(db: Db, g: IsEmriGirdisi, sira: number, tipler: Set<number>): Promise<IsEmriYazisi> {
  if (!tipler.has(g.operasyonTipiId)) throw dogrulama(TIP_YOK, 'operasyonTipiId');
  if (g.kontrolListesi.length > AZAMI_ADIM || g.kontrolListesi.some((m) => m.ad.trim() === '' || m.ad.length > 120)) {
    throw dogrulama(KONTROL_LISTESI, 'kontrolListesi');
  }
  const k = await kaynakCoz(db, g.kaynak);
  return {
    sira, opNo: g.opNo, operasyonTipiId: g.operasyonTipiId, ad: g.ad, ...k, istasyonId: k.istasyonId ?? g.istasyonId ?? null, ayarSuresiDk: g.ayarSuresiDk, birimSureDk: g.birimSureDk,
    terminGun: g.terminGun, bagimlilik: g.bagimlilik, devirAdedi: g.devirAdedi, firePayiYuzde: g.firePayiYuzde ?? '0',
    makineKullanimi: g.makineKullanimi ?? 'tek', enKucukParca: g.enKucukParca ?? null, yenidenAyar: g.yenidenAyar ?? true,
    talimatSurumu: g.talimatSurumu,
  };
}

const LISTE_ISARETLI = 'Kontrol listesi işaretlenmiş iş emri değiştirilemez.';

// Tetikleyici işaretli listenin silinmesini reddeder (soru 76); kullanıcı genel hata yerine nedenini görür.
async function listeIsaretsiz(db: Db, isEmriId: number): Promise<void> {
  if (await s.isaretliListeVar(db, isEmriId)) throw cakisma(LISTE_ISARETLI);
}
// Başka modülün kaydı iş emrine yabancı anahtarla bağlanır (satın alma siparişi satırı, 143 a): silme reddini anahtar verir,
// kullanıcı genel kısıt iletisi yerine bağı görür. Adı bilinmeyen bağ için tür yedeği.
const BAGLI_IS_EMRI = {
  satin_alma_siparis_satiri_is_emri: IS_EMRI_SIPARISE_BAGLI, stok_hareketi_is_emri_id_fkey: IS_EMRI_STOK_HAREKETLI,
  proje_maliyet_defteri_is_emri: IS_EMRI_MALIYETI_DONDURULMUS,
};
export const bekleyeniSil = async (db: Db, id: number): Promise<void> => {
  await listeIsaretsiz(db, id);
  await kisitKorumali(BAGLI_IS_EMRI, () => s.bekleyenIsEmriniSil(db, id), { BAGIMLI_KAYIT: IS_EMRI_BAGLI_KAYIT });
};
const bekleyeniGuncelle = async (db: Db, id: number, y: IsEmriYazisi): Promise<void> => { await listeIsaretsiz(db, id); await s.bekleyenIsEmriniGuncelle(db, id, y); };

async function eklerYaz(db: Db, emirId: number, isEmriId: number, g: IsEmriGirdisi): Promise<void> {
  for (const a of g.adaylar ?? []) {
    const k = await kaynakCoz(db, a.kaynak);
    await s.adayEkle(db, isEmriId, { makineId: k.makineId, kisiId: k.kisiId, ayarSuresiDk: a.ayarSuresiDk, birimSureDk: a.birimSureDk });
  }
  for (const b of g.bilesenler ?? []) await s.bilesenEkle(db, isEmriId, { malzemeNo: b.malzemeNo, miktar: b.miktar, fireYuzde: b.fireYuzde ?? '0' });
  for (const [i, m] of g.kontrolListesi.entries()) await s.adimEkle(db, emirId, i + 1, m.ad.trim(), m.aciklama?.trim() || null, isEmriId);
}

function girdiDenetle(isEmirleri: readonly IsEmriGirdisi[]): void {
  const ihlal = isEmirleriIhlali(isEmirleri.map((i) => ({
    sira: i.sira, opNo: i.opNo, kaynakTuru: i.kaynak?.tur ?? null, ayarSuresiDk: i.ayarSuresiDk, birimSureDk: i.birimSureDk,
    terminGun: i.terminGun, bagimlilik: i.bagimlilik, devirAdedi: i.devirAdedi,
  })));
  if (ihlal !== null) throw dogrulama(ihlal, 'isEmirleri');
}

const tipKimlikleri = async (db: Db): Promise<Set<number>> => new Set((await operasyonTipleri(db, { pasiflerDahil: true })).map((t) => t.id));

/* ---------------- açma ve rota uygulama (rota çağırır) ---------------- */

export async function uretimEmriAc(db: Db, kullanici: Kullanici, g: UretimEmriGirdisi): Promise<{ uretimEmriId: number; isEmriIdleri: number[] }> {
  const acanId = islemDenetle(kullanici, ['uretim-emirleri.yaz', 'rota.emre-kopyala']);
  const baslik = await basligiDenetle(db, g);
  girdiDenetle(g.isEmirleri);
  const tipler = await tipKimlikleri(db);
  const sirali = [...g.isEmirleri].sort((a, b) => a.sira - b.sira);
  const yazilar: IsEmriYazisi[] = [];
  for (const [i, ie] of sirali.entries()) yazilar.push(await yaziyaCevir(db, ie, i + 1, tipler));
  const id = await basligiYaz(db, acanId, g, baslik, g.kaynakRotaRevizyonId, yazilar[0]?.istasyonId ?? null);
  const isEmriIdleri: number[] = [];
  for (const [i, ie] of sirali.entries()) {
    const yazi = yazilar[i];
    if (yazi === undefined) continue;
    const isEmriId = await s.isEmriEkle(db, id, yazi);
    await eklerYaz(db, id, isEmriId, ie);
    isEmriIdleri.push(isEmriId);
  }
  await emirAcildiBildir(db, { uretimEmriId: id, kisiId: acanId, stoktanRezerve: g.stoktanRezerve === true });
  return { uretimEmriId: id, isEmriIdleri };
}

type EmirBasligi = Omit<UretimEmriGirdisi, 'kaynakRotaRevizyonId' | 'isEmirleri'>;
interface DenetlenmisBaslik {
  urun: { kod: string; ad: string | null };
  oncelik: number;
  baslangic: string | null;
  aciklama: string | null;
  emirTuru: EmirTuru;
  proje: { id: number; kod: string } | null;
  siparisSatiriId: number | null;
}

async function basligiDenetle(db: Db, g: EmirBasligi): Promise<DenetlenmisBaslik> {
  const urun = await malzemeOzeti(db, g.malzemeNo);
  if (urun === null || urun.onayDurumu !== 'aktif' || !URETILEBILIR_TURLER.includes(urun.tur)) throw dogrulama(URUN_DEGIL, 'malzemeNo');
  if (!Number.isInteger(g.adet) || g.adet < 1 || g.adet > 1_000_000) throw dogrulama(ADET_GECERSIZ, 'adet');
  const oncelik = g.oncelik ?? 3;
  if (!Number.isInteger(oncelik) || oncelik < 1 || oncelik > 4) throw dogrulama(ONCELIK_GECERSIZ, 'oncelik');
  const baslangic = g.baslangic ?? null;
  const tarihIhlali = teslimIhlali(baslangic, g.teslim);
  if (tarihIhlali !== null) throw dogrulama(tarihIhlali, 'teslim');
  const aciklama = g.aciklama?.trim() || null;
  if (aciklama !== null && aciklama.length > 300) throw dogrulama(ACIKLAMA_UZUN, 'aciklama');
  // Rota çağrısı sözleşme şemasından geçmez: tür burada denetlenir.
  const emirTuru = g.emirTuru ?? 'seri';
  if (!EMIR_TURLERI.includes(emirTuru)) throw dogrulama(EMIR_TURU_GECERSIZ, 'emirTuru');
  const projeId = g.projeId ?? null;
  const proje = projeId === null ? null : await projeGetir(db, projeId);
  if (projeId === null && projeZorunluMu(emirTuru)) throw dogrulama(PROJE_ZORUNLU, 'projeId');
  if (projeId !== null && proje?.durum !== 'aktif') throw dogrulama(PROJE_GECERSIZ, 'projeId');
  let siparisSatiriId = g.siparisSatiriId ?? null;
  if (siparisSatiriId === null && proje?.siparisId != null) {
    const secim = kendiligindenSatir(await siparisAyrintisi(db, proje.siparisId), g.malzemeNo);
    if ('ihlal' in secim) throw dogrulama(secim.ihlal, 'siparisSatiriId');
    siparisSatiriId = secim.satirId;
  } else if (siparisSatiriId !== null) {
    const satir = (await siparisSatiriOzetleri(db, [siparisSatiriId])).get(siparisSatiriId) ?? null;
    const ihlal = siparisSatiriIhlali(satir, proje?.siparisId, g.malzemeNo);
    if (ihlal !== null) throw cakisma(ihlal);
  }
  return { urun, oncelik, baslangic, aciklama, emirTuru, proje: proje === null ? null : { id: proje.id, kod: proje.kod }, siparisSatiriId };
}

async function basligiYaz(
  db: Db, acanId: number, g: EmirBasligi, b: DenetlenmisBaslik, kaynakRotaRevizyonId: number | null, istasyonId: number | null,
): Promise<number> {
  const parcaNo = b.urun.kod.slice(0, 60);
  // Numara ve sayaç "Numara kuralları" ayarındadır; sayaç bu işlemin içinde ilerler, emir eklenmezse geri alınır.
  const emirNo = await numaraAl(db, 'uretim-emirleri.emir-no', {
    alanlar: { FIRMA: await firmaKodu(db), PROJE: b.proje?.kod ?? null, PARCA: parcaNo },
    varMi: (no) => s.emirNoVarMi(db, no),
  });
  return s.ustEmirEkle(db, {
    parcaNo, parcaAd: (b.urun.ad ?? b.urun.kod).slice(0, 120), adet: g.adet, istasyonId,
    malzemeNo: g.malzemeNo, kaynakRotaRevizyonId, oncelik: b.oncelik, baslangic: b.baslangic, teslim: g.teslim, aciklama: b.aciklama,
    durum: g.taslak === true ? 'taslak' : 'planli', emirTuru: b.emirTuru, emirNo, projeId: b.proje?.id ?? null,
    siparisSatiriId: b.siparisSatiriId,
  }, acanId);
}

// E-1, 224: aktif projeler ve her birinin siparişinde emre bağlanabilecek satırlar; açma yetkisi uretimEmriAc'takiyle aynıdır.
export async function acilisSecenekleri(db: Db, kullanici: Kullanici, malzemeNo: number, emirTuru: EmirTuru = 'seri'): Promise<AcilisSecenekleri> {
  islemDenetle(kullanici, ['uretim-emirleri.yaz', 'rota.emre-kopyala']);
  const projeler = await projeSecenekleri(db);
  const siparisler = new Map<number, Awaited<ReturnType<typeof siparisAyrintisi>>>();
  for (const id of new Set(projeler.flatMap((p) => (p.siparisId === null ? [] : [p.siparisId])))) siparisler.set(id, await siparisAyrintisi(db, id));
  return {
    projeZorunlu: projeZorunluMu(emirTuru),
    projeler: projeler.map((p) => {
      const siparis = p.siparisId === null ? null : siparisler.get(p.siparisId) ?? null;
      return {
        id: p.id, kod: p.kod, ad: p.ad,
        satirlar: adaySatirlar(siparis, malzemeNo).map((x) => ({ id: x.id, siparisNo: siparis!.no, satirNo: x.sira, adet: x.miktar, termin: x.termin ?? siparis!.termin })),
      };
    }),
  };
}

// UE-RA-0 (B13): malzemeli emir rota seçmeden, adımsız açılır; adımları sonradan Reçete ve Rota'da eklenir. "Rotasız üretim emri"
// ayarı kapalıysa açılmaz.
export async function rotasizEmirAc(db: Db, kullanici: Kullanici, g: EmirBasligi): Promise<{ uretimEmriId: number }> {
  const acanId = islemDenetle(kullanici, ['uretim-emirleri.yaz']);
  if (!(await sistemAyariOku(db, 'uretim-emirleri.rotasiz-emir'))) throw cakisma(ROTASIZ_EMIR_KAPALI);
  return { uretimEmriId: await basligiYaz(db, acanId, g, await basligiDenetle(db, g), null, null) };
}

// UE-02 "emirlere uygula": rotanın yeni hâli güvenli kipte uygulanır. Başlamış ya da bitmiş iş emri korunur.
export async function isEmirleriniYenile(
  db: Db, kullanici: Kullanici, uretimEmriId: number, g: { kaynakRotaRevizyonId: number; isEmirleri: IsEmriGirdisi[] },
): Promise<{ degisenler: string[] }> {
  islemDenetle(kullanici, ['uretim-emirleri.yaz', 'rota.emre-kopyala']);
  const e = await kilitliUstEmir(db, uretimEmriId);
  const acik = acikEmirIhlali(e.durum, e.arsiv);
  if (acik !== null) throw cakisma(acik);
  girdiDenetle(g.isEmirleri);
  const tipler = await tipKimlikleri(db);
  const mevcut = await s.isEmirleriGetir(db, [uretimEmriId]);
  // Kola konmuş rework, tamir ya da ek adım rotada yoktur; güvenli kip onu "rotada yok" diye silerdi. Böyle kol olduğu gibi kalır.
  if (mevcut.some((i) => i.tur !== 'rota')) return { degisenler: ['Ek adımlı parti değiştirilmedi'] };
  // Kol rotanın yalnız bir dilimini taşır: bütün rota ona uygulanırsa bölünmeden önceki ve birleşmeden sonraki adımlar ikinci kez yapılırdı.
  // Açık kolu olan üstte adım silinip eklenirse kolun birleşme adımı kaybolabilir. İkisi de kol katılana dek olduğu gibi kalır.
  if (e.ustEmirId !== null || dogrudanAltPartiler(await s.altPartilerGetir(db, [uretimEmriId]), uretimEmriId).length > 0) {
    return { degisenler: ['Bölünmüş parti değiştirilmedi'] };
  }
  const plan = guvenliUygula(mevcut, g.isEmirleri);
  const onde = oneDusenYeniAdimlar(plan, g.isEmirleri);
  if (onde.length > 0) throw cakisma(yeniAdimOndeIletisi(onde));
  const rotada = new Map(g.isEmirleri.map((i) => [i.opNo, i]));
  const kimlik = new Map(mevcut.map((i) => [i.opNo, i.id]));
  const degisenler: string[] = [];
  for (const op of plan.sil) {
    const id = kimlik.get(op);
    if (id !== undefined) await bekleyeniSil(db, id);
    degisenler.push(`OP ${op} çıkarıldı`);
  }
  for (const [i, op] of plan.sira.entries()) {
    const ie = rotada.get(op);
    const id = kimlik.get(op);
    if (plan.koru.includes(op)) {
      if (id !== undefined) await s.isEmriSirasiYaz(db, id, i + 1);
    } else if (plan.guncelle.includes(op) && ie !== undefined && id !== undefined) {
      await bekleyeniGuncelle(db, id, await yaziyaCevir(db, ie, i + 1, tipler));
      await eklerYaz(db, uretimEmriId, id, ie);
    } else if (plan.ekle.includes(op) && ie !== undefined) {
      const yeni = await s.isEmriEkle(db, uretimEmriId, await yaziyaCevir(db, ie, i + 1, tipler));
      await eklerYaz(db, uretimEmriId, yeni, ie);
      degisenler.push(`OP ${op} eklendi`);
    }
  }
  if (plan.koru.some((op) => !rotada.has(op))) degisenler.push('Başlamış ya da bitmiş iş emirleri korundu');
  await s.emirKaynakRevizyonuYaz(db, uretimEmriId, g.kaynakRotaRevizyonId);
  await siradakiIstasyonuYaz(db, uretimEmriId);
  return { degisenler };
}

/* ---------------- okuma (UE19 liste ve ayrıntı) ---------------- */

interface Adlar {
  istasyon: Map<number, { id: number; kod: string | null; ad: string }>;
  tip: Map<number, { id: number; ad: string; kod: string }>;
  makine: Map<number, { kod: string; ad: string }>;
  kisi: Map<number, string>;
  firma: Map<number, { kod: string | null; ad: string }>;
  malzeme: Map<number, { id: number; kod: string | null; ad: string }>;
}

async function adlariAl(db: Db, isEmirleri: readonly IsEmriSatiri[], adaylar: readonly s.AdaySatiri[], malzemeNolari: readonly number[]): Promise<Adlar> {
  const makineIdleri = new Set([...isEmirleri.map((i) => i.makineId), ...adaylar.map((a) => a.makineId)].filter((x): x is number => x !== null));
  const makine = new Map<number, { kod: string; ad: string }>();
  for (const id of makineIdleri) {
    const m = await makineGetir(db, id);
    if (m !== null) makine.set(id, { kod: m.kod, ad: m.ad });
  }
  const kisiIdleri = [...isEmirleri.map((i) => i.kisiId), ...adaylar.map((a) => a.kisiId)].filter((x): x is number => x !== null);
  const firmaIdleri = isEmirleri.map((i) => i.fasonFirmaId).filter((x): x is number => x !== null);
  return {
    istasyon: new Map((await istasyonlar(db, { pasiflerDahil: true })).map((i) => [i.id, { id: i.id, kod: i.kod, ad: i.ad }])),
    tip: new Map((await operasyonTipleri(db, { pasiflerDahil: true })).map((t) => [t.id, { id: t.id, ad: t.ad, kod: t.kod }])),
    makine,
    kisi: await kisiAdlari(db, kisiIdleri),
    firma: new Map([...(await firmaOzetleri(db, firmaIdleri))].map(([id, f]) => [id, { kod: f.kod, ad: f.ad }])),
    malzeme: new Map([...(await malzemeOzetleri(db, [...malzemeNolari]))].map(([no, m]) => [no, { id: no, kod: m.kod, ad: m.ad ?? m.kod }])),
  };
}

// Ad bulunamazsa kimlik gösterilir; ad uydurulmaz (yabancı anahtar kaydın var olduğunu garanti eder).
function kaynakAdi(ad: Adlar, k: { makineId: number | null; kisiId: number | null; fasonFirmaId?: number | null }): IsEmriKaynagi | null {
  if (k.fasonFirmaId != null) {
    const f = ad.firma.get(k.fasonFirmaId);
    return { tur: 'fason', id: k.fasonFirmaId, kod: f?.kod ?? null, ad: f?.ad ?? `#${k.fasonFirmaId}` };
  }
  if (k.makineId !== null) {
    const m = ad.makine.get(k.makineId);
    return { tur: 'makine', id: k.makineId, kod: m?.kod ?? null, ad: m?.ad ?? `#${k.makineId}` };
  }
  if (k.kisiId !== null) return { tur: 'kisi', id: k.kisiId, kod: null, ad: ad.kisi.get(k.kisiId) ?? `#${k.kisiId}` };
  return null;
}

const istasyonAdi = (ad: Adlar, id: number | null) => (id === null ? null : ad.istasyon.get(id) ?? { id, kod: null, ad: `#${id}` });

function fasonOzeti(hareketler: readonly FasonHareketiSatiri[]) {
  let gonderilen = 0;
  let donenSaglam = 0;
  let donenHurda = 0;
  for (const h of hareketler) {
    if (h.yon === 'gidis') gonderilen += h.adet;
    else { donenSaglam += h.adet; donenHurda += h.hurdaAdet ?? 0; }
  }
  return { gonderilen, donenSaglam, donenHurda };
}

function ozet(e: UstEmirSatiri, kendi: readonly IsEmriSatiri[], ad: Adlar, altEmirIdleri: number[]): AdimliEmirOzeti {
  const sira = siradakiIsEmri(kendi);
  return {
    id: e.id, emirNo: e.emirNo, urun: { id: e.malzemeNo, kod: e.parcaNo, ad: e.parcaAd }, adet: e.adet, oncelik: e.oncelik,
    baslangic: e.baslangic, teslim: e.teslim, durum: gorunenDurum(e.durum, kendi.some((i) => i.durum !== 'bekliyor')), arsiv: e.arsiv,
    parti: { ustEmirId: e.ustEmirId, bolunmeSira: e.bolunmeSira, altEmirIdleri, birlestigiEmirId: e.birlestigiEmirId, birlesmeOpNo: e.birlesmeOpNo },
    kaynakRotaRevizyonId: e.kaynakRotaRevizyonId, emirTuru: e.emirTuru, projeId: e.projeId, siparisSatiriId: e.siparisSatiriId, adimSayisi: kendi.length, tamamAdim: kendi.filter((i) => i.durum === 'tamam').length,
    siradaki: sira === null ? null : {
      id: sira.id, opNo: sira.opNo, ad: sira.ad, durum: sira.durum, kaynak: kaynakAdi(ad, sira), istasyon: istasyonAdi(ad, sira.istasyonId),
    },
    aciklama: e.aciklama, acilma: e.acilma, surum: e.surum,
  };
}

export async function adimliListe(
  db: Db, arsiv: boolean, projeId: number | null = null, hepsi = true,
): Promise<{ emirler: AdimliEmirOzeti[] }> {
  return { emirler: await ozetle(db, await s.ustEmirler(db, arsiv, projeId, hepsi)) };
}

// Gecikmenin günü tesis saatine göredir.
export async function adimliOzet(db: Db, simdi = Date.now()): Promise<AdimliOzetCevabi> {
  return adimliOzetSay(await s.adimliOzetGruplari(db, tesisGunu(simdi)));
}

// Biten (bitmiş ya da iptal) emirler, en yeni önce, sayfalı (kart #1323).
export function adimliBitenler(db: Db, suzgec: s.BitenSuzgeci, sayfa: { sayfa: number; sayfaBoyu?: number | undefined }): Promise<SayfaliListe<AdimliEmirOzeti>> {
  return sayfaliListe(sayfa, {
    say: () => s.bitenUstEmirSay(db, suzgec),
    satirlar: async (d) => ozetle(db, await s.bitenUstEmirler(db, suzgec, d)),
  });
}

async function ozetle(db: Db, emirler: UstEmirSatiri[]): Promise<AdimliEmirOzeti[]> {
  const isEmirleri = await s.isEmirleriGetir(db, emirler.map((e) => e.id));
  const ad = await adlariAl(db, isEmirleri, [], []);
  const emreGore = new Map<number, IsEmriSatiri[]>();
  for (const i of isEmirleri) emreGore.set(i.uretimEmriId, [...(emreGore.get(i.uretimEmriId) ?? []), i]);
  const altlar = new Map<number, number[]>();
  for (const e of emirler) if (e.ustEmirId !== null && e.durum !== 'iptal') altlar.set(e.ustEmirId, [...(altlar.get(e.ustEmirId) ?? []), e.id]);
  return emirler.map((e) => ozet(e, emreGore.get(e.id) ?? [], ad, altlar.get(e.id) ?? []));
}

// Reçete ve Rota'nın emir dilimi (kart #1185): arşivdeki eski emir hariç bütün iş emirli emirler, iş emirlerinin durum ve sağlam adediyle.
// Okuma yetkisini çağıran denetler (Reçete ve Rota durum ucu); ad ve kaynak çözülmez.
export interface EmirDilimiSatiri {
  id: number;
  emirNo: string;
  malzemeNo: number;
  adet: number;
  baslangic: string | null;
  teslim: string | null;
  oncelik: number;
  aciklama: string | null;
  kaynakRotaRevizyonId: number | null;
  durum: EmirDurumu;
  emirTuru: EmirTuru;
  acilma: string;
  bitis: string | null;
  ustEmirId: number | null;
  bolunmeSira: number | null;
  birlestigiEmirId: number | null;
  birlesmeOpNo: number | null;
  surum: number;
  // saglamAdet: biten iş emrinin kapanış değeri. canliAdet: çalışan iş emrinin terminal sayacındaki sağlam adet (sayım yoksa 0); çalışmayanda null.
  // ad'dan bilesenler'e kadar alanlar rotasız emrin adımlarını Reçete ve Rota'da göstermek içindir (B13); süreler numeric metindir.
  isEmirleri: {
    sira: number; opNo: number; durum: 'bekliyor' | 'calisiyor' | 'tamam'; saglamAdet: number | null; canliAdet: number | null;
    ad: string; operasyonTipiId: number; kaynak: { tur: IsEmriKaynakTuru; id: number } | null; istasyonId: number | null;
    ayarSuresiDk: string | null; birimSureDk: string | null; terminGun: number | null; bilesenler: { malzemeId: number; miktar: string; fireYuzde: string }[];
    // 697: ek adım (rework, tamir, ek) rotada yer tutmaz; Reçete ve Rota durum anahtarını rotadaki yerle kurar.
    tur: 'rota' | 'rework' | 'tamir' | 'ek';
  }[];
}

export async function emirDilimi(db: Db): Promise<EmirDilimiSatiri[]> {
  const emirler = await s.ustEmirler(db, false);
  const isEmirleri = await s.isEmirleriGetir(db, emirler.map((e) => e.id));
  const emreGore = new Map<number, IsEmriSatiri[]>();
  for (const i of isEmirleri) emreGore.set(i.uretimEmriId, [...(emreGore.get(i.uretimEmriId) ?? []), i]);
  const baslamislar = emirler.filter((e) => (emreGore.get(e.id) ?? []).some((i) => i.durum === 'calisiyor')).map((e) => e.id);
  const sayaclar = new Map((baslamislar.length === 0 ? [] : await s.sayaclariGetir(db, baslamislar)).map((x) => [x.emirId, x.saglam]));
  const bilesenler = await s.bilesenleriGetir(db, isEmirleri.map((i) => i.id));
  return emirler.flatMap((e) => (e.malzemeNo === null ? [] : [{
    id: e.id, emirNo: e.emirNo, malzemeNo: e.malzemeNo, adet: e.adet, baslangic: e.baslangic, teslim: e.teslim, oncelik: e.oncelik, aciklama: e.aciklama,
    kaynakRotaRevizyonId: e.kaynakRotaRevizyonId, emirTuru: e.emirTuru, acilma: e.acilma, bitis: e.bitis, ustEmirId: e.ustEmirId,
    durum: gorunenDurum(e.durum, (emreGore.get(e.id) ?? []).some((i) => i.durum !== 'bekliyor')),
    bolunmeSira: e.bolunmeSira, birlestigiEmirId: e.birlestigiEmirId, birlesmeOpNo: e.birlesmeOpNo, surum: e.surum,
    isEmirleri: (emreGore.get(e.id) ?? []).map((i) => ({
      sira: i.sira, opNo: i.opNo, durum: i.durum, saglamAdet: i.saglamAdet, canliAdet: i.durum === 'calisiyor' ? sayaclar.get(e.id) ?? 0 : null,
      ad: i.ad, operasyonTipiId: i.operasyonTipiId, kaynak: mevcutKaynak(i), istasyonId: i.istasyonId, ayarSuresiDk: i.ayarSuresiDk, birimSureDk: i.birimSureDk,
      terminGun: i.terminGun, bilesenler: bilesenler.filter((b) => b.isEmriId === i.id).map((b) => ({ malzemeId: b.malzemeNo, miktar: b.miktar, fireYuzde: b.fireYuzde })),
      tur: i.tur,
    })),
  }]));
}

export async function adimliAyrinti(db: Db, id: number): Promise<AdimliEmirAyrintisi> {
  const e = await s.ustEmirBul(db, id);
  if (e === null || (e.malzemeNo === null && !e.arsiv)) throw bulunamadi(EMIR_YOK);
  const kendi = await s.isEmirleriGetir(db, [id]);
  const idler = kendi.map((i) => i.id);
  const adaylar = await s.adaylariGetir(db, idler);
  const bilesenler = await s.bilesenleriGetir(db, idler);
  const hareketler = await s.fasonHareketleriGetir(db, idler);
  const yerDegisimleri = await s.uretimYeriDegisimleriGetir(db, idler);
  const ad = await adlariAl(db, kendi, adaylar, bilesenler.map((b) => b.malzemeNo));
  const kisi = await kisiAdlari(db, [...hareketler.map((h) => h.kisiId), ...yerDegisimleri.map((d) => d.kisiId)]);
  const eski = e.arsiv ? await s.arsivSatiri(db, id) : null;
  const eksikler = await adimEksikHaritasi(db, id, kendi);
  const isEmirleri: IsEmri[] = kendi.map((i) => {
    const kendiHareketleri = hareketler.filter((h) => h.isEmriId === i.id);
    const sonYer = yerDegisimleri.filter((d) => d.isEmriId === i.id).at(-1);
    return {
      id: i.id, opNo: i.opNo, sira: i.sira, tip: ad.tip.get(i.operasyonTipiId) ?? { id: i.operasyonTipiId, ad: `#${i.operasyonTipiId}`, kod: '' }, ad: i.ad,
      tur: i.tur, ekAciklama: i.ekAciklama,
      kaynak: kaynakAdi(ad, i), istasyon: istasyonAdi(ad, i.istasyonId), ayarSuresiDk: i.ayarSuresiDk, birimSureDk: i.birimSureDk,
      terminGun: i.terminGun, bagimlilik: i.bagimlilik, devirAdedi: i.devirAdedi, talimatSurumu: i.talimatSurumu, durum: i.durum,
      baslama: i.baslama, bitis: i.bitis, saglamAdet: i.saglamAdet, eksik: eksikler.get(i.id) ?? null,
      bilesenler: bilesenler.filter((b) => b.isEmriId === i.id).map((b) => ({
        malzeme: ad.malzeme.get(b.malzemeNo) ?? { id: b.malzemeNo, kod: null, ad: `#${b.malzemeNo}` }, miktar: b.miktar, fireYuzde: b.fireYuzde,
      })),
      adaylar: adaylar.filter((a) => a.isEmriId === i.id).flatMap((a) => {
        const k = kaynakAdi(ad, a);
        return k === null ? [] : [{ kaynak: k, ayarSuresiDk: a.ayarSuresiDk, birimSureDk: a.birimSureDk }];
      }),
      fason: i.fasonFirmaId === null ? null : {
        ...fasonOzeti(kendiHareketleri),
        hareketler: kendiHareketleri.map((h) => ({
          id: h.id, yon: h.yon, adet: h.adet, hurdaAdet: h.hurdaAdet, kisi: { id: h.kisiId, ad: kisi.get(h.kisiId) ?? `#${h.kisiId}` }, zaman: h.zaman,
        })),
      },
      uretimYeriDegisimi: sonYer === undefined ? null : {
        yer: sonYer.yeniFasonFirmaId === null ? 'ic' : 'fason', kisi: { id: sonYer.kisiId, ad: kisi.get(sonYer.kisiId) ?? `#${sonYer.kisiId}` }, zaman: sonYer.zaman,
      },
    };
  });
  const altEmirIdleri = (await s.altPartilerGetir(db, [id])).filter((a) => a.ustEmirId === id && a.durum !== 'iptal').map((a) => a.id);
  return {
    ...ozet(e, kendi, ad, altEmirIdleri),
    isEmirleri,
    eski: eski === null ? null : {
      durum: eski.eskiDurum, istasyon: istasyonAdi(ad, eski.istasyonId), baslama: eski.baslama, bitis: eski.bitis, saglamAdet: eski.saglamAdet,
    },
  };
}

/* ---------------- emir komutları (ekran ve plan) ---------------- */

async function kilitliUstEmir(db: Db, id: number): Promise<UstEmirSatiri> {
  const e = await s.ustEmirBul(db, id, true);
  if (e === null || e.malzemeNo === null) throw bulunamadi(EMIR_YOK);
  return e;
}

function surumDenetle(e: UstEmirSatiri, surum: number | undefined): void {
  if (surum !== undefined && e.surum !== surum) throw eskiSurum();
}

// Planlı ya da taslak emrin satırdaki istasyonu sıradaki iş emrinin istasyonudur (terminal oradan görür).
export async function siradakiIstasyonuYaz(db: Db, emirId: number): Promise<void> {
  await s.emirIstasyonuYaz(db, emirId, siradakiIsEmri(await s.isEmirleriGetir(db, [emirId]))?.istasyonId ?? null);
}

export async function planaAl(db: Db, kullanici: Kullanici, id: number, surum?: number): Promise<void> {
  islemDenetle(kullanici, ['uretim-emirleri.yaz', 'plan.canliya-al']);
  const e = await kilitliUstEmir(db, id);
  surumDenetle(e, surum);
  const ihlal = planaAlIhlali(e.durum, e.arsiv);
  if (ihlal !== null) throw cakisma(ihlal);
  await s.planaAlYaz(db, id, e.surum);
}

export async function adimliIptal(db: Db, kullanici: Kullanici, id: number, surum?: number): Promise<void> {
  const kisiId = islemDenetle(kullanici, ['uretim-emirleri.yaz', 'plan.canliya-al']);
  const e = await kilitliUstEmir(db, id);
  surumDenetle(e, surum);
  const ihlal = adimliIptalIhlali(e.durum, e.arsiv, (await s.isEmirleriGetir(db, [id])).some((i) => i.durum !== 'bekliyor'));
  if (ihlal !== null) throw cakisma(ihlal);
  await s.ustIptalYaz(db, id, e.surum);
  await emirIptalBildir(db, { uretimEmriId: id, kisiId });
}

// P6: plan stüdyosunun canlıya alması emrin önceliğini ve tarihlerini yazar (sahibi modülün komutu).
export async function planBilgisiYaz(
  db: Db, kullanici: Kullanici, id: number, g: { oncelik?: number; baslangic?: string | null; teslim?: string | null },
): Promise<void> {
  islemDenetle(kullanici, ['uretim-emirleri.yaz', 'plan.canliya-al']);
  const e = await kilitliUstEmir(db, id);
  const acik = acikEmirIhlali(e.durum, e.arsiv);
  if (acik !== null) throw cakisma(acik);
  const oncelik = g.oncelik ?? e.oncelik;
  if (!Number.isInteger(oncelik) || oncelik < 1 || oncelik > 4) throw dogrulama(ONCELIK_GECERSIZ, 'oncelik');
  const baslangic = g.baslangic === undefined ? e.baslangic : g.baslangic;
  const teslim = g.teslim === undefined ? e.teslim : g.teslim;
  const ihlal = teslimIhlali(baslangic, teslim);
  if (ihlal !== null) throw dogrulama(ihlal, 'teslim');
  await s.planBilgisiYaz(db, id, { oncelik, baslangic, teslim });
}

// 163 a: planlama yetkisiyle başlamamış emrin önceliği doğrudan değişir; eski ve yeni değer kişi ve zamanla kayda girer.
// Plan stüdyosu (281 a) sürümsüz çağırır: deneme canlıya alınırken emrin güncel hâline yazılır; başlamış emir yine reddedilir.
export async function oncelikDegistir(db: Db, kullanici: Kullanici, id: number, oncelik: number, surum: number | null): Promise<void> {
  const kisiId = islemDenetle(kullanici, ['uretim-emirleri.yaz']);
  const e = await kilitliUstEmir(db, id);
  if (surum !== null) surumDenetle(e, surum);
  const ihlal = oncelikDegisimIhlali(e.durum, e.arsiv);
  if (ihlal !== null) throw cakisma(ihlal);
  if (e.oncelik === oncelik) return;
  if ((await s.oncelikYaz(db, id, e.surum, oncelik)) === null) throw eskiSurum();
  await s.oncelikDegisimiEkle(db, id, e.oncelik, oncelik, kisiId, await s.anAl(db));
}

async function kaynagiYaz(db: Db, e: UstEmirSatiri, isEmri: IsEmriSatiri, kaynak: AtanabilirKaynak | null): Promise<void> {
  const acik = acikEmirIhlali(e.durum, e.arsiv);
  if (acik !== null) throw cakisma(acik);
  const ihlal = kaynakDegisimIhlali({ durum: isEmri.durum, kaynakTuru: kaynakTuru(isEmri) });
  if (ihlal !== null) throw cakisma(ihlal);
  const k = await kaynakCoz(db, kaynak);
  if ((await s.isEmriKaynagiYaz(db, isEmri.id, k, null)) === null) throw cakisma(ihlal ?? 'Yalnız bekleyen iş emrinin kaynağı değişir.');
  await siradakiIstasyonuYaz(db, e.id);
}

// UE-10: tezgahsız (ya da yanlış kaynaklı) bekleyen iş emrine makine ya da kişi atanır; iş emri sıradakiyse emir o istasyonun
// terminaline düşer.
export async function adimKaynagi(db: Db, kullanici: Kullanici, id: number, opNo: number, kaynak: AtanabilirKaynak | null, surum: number): Promise<void> {
  islemDenetle(kullanici, ['uretim-emirleri.yaz']);
  const e = await kilitliUstEmir(db, id);
  surumDenetle(e, surum);
  const isEmri = (await s.isEmirleriGetir(db, [id])).find((i) => i.opNo === opNo);
  if (isEmri === undefined) throw bulunamadi(IS_EMRI_YOK);
  await kaynagiYaz(db, e, isEmri, kaynak);
}

// UE5, P3: planın yerleşimi iş emrine makine ya da kişi yazar. Planı canlıya alan da yazar (kullanıcı kararı, kart #262).
export async function isEmriKaynagiYaz(db: Db, kullanici: Kullanici, isEmriId: number, kaynak: AtanabilirKaynak): Promise<void> {
  islemDenetle(kullanici, ['uretim-emirleri.yaz', 'plan.yaz', 'plan.canliya-al']);
  const ilk = await s.isEmriBul(db, isEmriId);
  if (ilk === null) throw bulunamadi(IS_EMRI_YOK);
  // Kilit sırası emir, sonra iş emri: terminal komutlarıyla aynı.
  const e = await kilitliUstEmir(db, ilk.uretimEmriId);
  const isEmri = await s.isEmriBul(db, isEmriId, true);
  if (isEmri === null) throw bulunamadi(IS_EMRI_YOK);
  await kaynagiYaz(db, e, isEmri, kaynak);
}

/* ---------------- üretim yeri (UE-URY: açılmış emirde adım içeride ya da fasonda; rota değişmez) ---------------- */

// Fasona alınan adımın iç kaynağı ve süreleri değişim kaydında kalır; adım içeri alınınca son fasona alınıştan önceki hali geri yazılır.
// Kayıt yoksa (adım rotadan fason geldiyse) operasyon tipinin varsayılan istasyonu ve süreleri yazılır; kaynak planda atanır.
// Rota modülünün fason seçicisiyle aynı sınır; yalnız aktif fason firmalar.
const FASON_FIRMA_SINIRI = 200;
export async function fasonFirmalari(db: Db): Promise<{ id: number; kod: string | null; ad: string }[]> {
  return (await firmaAra(db, { metin: '', sinir: FASON_FIRMA_SINIRI, fason: true })).map((f) => ({ id: f.id, kod: f.kod, ad: f.ad }));
}

async function icHali(db: Db, isEmri: IsEmriSatiri): Promise<s.UretimYeriYazisi> {
  const sonFasonaAlis = (await s.uretimYeriDegisimleriGetir(db, [isEmri.id])).filter((d) => d.yeniFasonFirmaId !== null && d.eskiFasonFirmaId === null).at(-1);
  if (sonFasonaAlis !== undefined) {
    return {
      makineId: sonFasonaAlis.eskiMakineId, kisiId: sonFasonaAlis.eskiKisiId, fasonFirmaId: null, istasyonId: sonFasonaAlis.eskiIstasyonId,
      ayarSuresiDk: sonFasonaAlis.eskiAyarSuresiDk, birimSureDk: sonFasonaAlis.eskiBirimSureDk, terminGun: null,
    };
  }
  const tip = (await operasyonTipleri(db, { pasiflerDahil: true })).find((x) => x.id === isEmri.operasyonTipiId);
  return {
    makineId: null, kisiId: null, fasonFirmaId: null, istasyonId: tip?.varsayilanIstasyonId ?? null,
    ayarSuresiDk: tip?.varsayilanAyarDk ?? null, birimSureDk: tip?.varsayilanBirimDk ?? null, terminGun: null,
  };
}

export async function uretimYeriDegistir(
  db: Db, kullanici: Kullanici, id: number, g: { opNo: number; yer: UretimYeri; firmaId: number | null; terminGun: number | null; surum: number },
): Promise<void> {
  const kisiId = islemDenetle(kullanici, ['uretim-emirleri.yaz']);
  const e = await kilitliUstEmir(db, id);
  surumDenetle(e, g.surum);
  const acik = acikEmirIhlali(e.durum, e.arsiv);
  if (acik !== null) throw cakisma(acik);
  const isEmri = (await s.isEmirleriGetir(db, [id])).find((i) => i.opNo === g.opNo);
  if (isEmri === undefined) throw bulunamadi(IS_EMRI_YOK);
  const fasonHareketiVar = (await s.fasonHareketleriGetir(db, [isEmri.id])).length > 0;
  const ihlal = uretimYeriIhlali({ durum: isEmri.durum, fasonHareketiVar }, g);
  if (ihlal !== null) throw (isEmri.durum !== 'bekliyor' || fasonHareketiVar ? cakisma(ihlal) : dogrulama(ihlal, g.yer === 'fason' ? 'firmaId' : 'yer'));
  const eski: s.UretimYeriYazisi = {
    makineId: isEmri.makineId, kisiId: isEmri.kisiId, fasonFirmaId: isEmri.fasonFirmaId, istasyonId: isEmri.istasyonId,
    ayarSuresiDk: isEmri.ayarSuresiDk, birimSureDk: isEmri.birimSureDk, terminGun: isEmri.terminGun,
  };
  let yeni: s.UretimYeriYazisi;
  if (g.yer === 'fason') {
    const k = await kaynakCoz(db, { tur: 'fason', id: g.firmaId ?? 0 });
    yeni = { ...k, ayarSuresiDk: null, birimSureDk: null, terminGun: g.terminGun };
    if (eski.fasonFirmaId === yeni.fasonFirmaId && eski.terminGun === yeni.terminGun) return;
  } else {
    if (eski.fasonFirmaId === null) return;
    yeni = await icHali(db, isEmri);
  }
  if ((await s.uretimYeriYaz(db, isEmri.id, yeni)) === null) throw cakisma(URETIM_YERI_BASLAMIS);
  await s.uretimYeriDegisimiEkle(db, isEmri.id, eski, { fasonFirmaId: yeni.fasonFirmaId, terminGun: yeni.terminGun }, kisiId, await s.anAl(db));
  if ((await s.surumArtir(db, id, e.surum)) === null) throw eskiSurum();
  await siradakiIstasyonuYaz(db, id);
}

/* ---------------- fason (UE3; kullanıcı kararı c: her gidiş ve dönüş ayrı satır) ---------------- */

async function fasonBaglami(db: Db, emirId: number, isEmriId: number) {
  const e = await kilitliUstEmir(db, emirId);
  const acik = acikEmirIhlali(e.durum, e.arsiv);
  if (acik !== null) throw cakisma(acik);
  if (e.durum === 'taslak') throw cakisma('Taslak emir önce plana alınır.');
  const hepsi = await s.isEmirleriGetir(db, [emirId]);
  const isEmri = hepsi.find((i) => i.id === isEmriId);
  if (isEmri === undefined) throw bulunamadi(IS_EMRI_YOK);
  const onceki = oncekiAdim(hepsi, isEmri);
  const ozetler = fasonOzeti(await s.fasonHareketleriGetir(db, [isEmriId]));
  const durum: FasonDurumu = {
    durum: isEmri.durum, fason: isEmri.fasonFirmaId !== null, siradaki: siradakiIsEmri(hepsi)?.id === isEmriId, ...ozetler,
    gonderilebilir: (await adimaGiren(db, emirId, hepsi, isEmri)) ?? e.adet,
  };
  return { e, isEmri, durum, oncekiIsEmriId: onceki?.id ?? null };
}

const oncekiAdim = (hepsi: readonly IsEmriSatiri[], isEmri: IsEmriSatiri): IsEmriSatiri | undefined =>
  hepsi.filter((i) => i.sira < isEmri.sira).sort((a, b) => b.sira - a.sira)[0];

// Adıma giren adet: önceki adımın sağlamı, bu adımda katılan kolların sağlamı, aynı sırada bölünenler düşülür. İlk adımda null.
// Önceki adım bitmemişse (paralel adım, 639) o ana kadarki sağlamı girer.
export async function adimaGiren(db: Db, emirId: number, hepsi: readonly IsEmriSatiri[], isEmri: IsEmriSatiri): Promise<number | null> {
  const onceki = oncekiAdim(hepsi, isEmri);
  if (onceki === undefined) return null;
  const oncekiSaglam = onceki.durum === 'tamam' ? (onceki.saglamAdet ?? 0) : ((await s.adimSayaclariGetir(db, [onceki.id]))[0]?.saglam ?? 0);
  const bolunen = dogrudanAltPartiler(await s.altPartilerGetir(db, [emirId]), emirId).filter((p) => p.bolunmeSira === isEmri.sira).reduce((t, p) => t + p.adet, 0);
  return oncekiSaglam + (await birlesenGelen(db, emirId, isEmri)) - bolunen;
}

// Adım başına eksik (paralel adım 639, acikAdimSemasi.eksik ile aynı anlam): adıma giren eksi adımda sayılan (sağlam, karar bekleyen, hurda).
// Önceki adımı olmayan ya da bağımsız adımda null.
async function adimEksikHaritasi(db: Db, emirId: number, hepsi: readonly IsEmriSatiri[]): Promise<Map<number, number | null>> {
  const sonuc = new Map<number, number | null>();
  if (hepsi.length === 0) return sonuc;
  const sayac = new Map((await s.adimSayaclariGetir(db, hepsi.map((i) => i.id))).map((x) => [x.isEmriId, x]));
  for (const i of hepsi) {
    if (i.bagimlilik === 'bagimsiz') { sonuc.set(i.id, null); continue; }
    const x = sayac.get(i.id);
    sonuc.set(i.id, adimEksigi(await adimaGiren(db, emirId, hepsi, i), (x?.saglam ?? 0) + (x?.kararBekliyor ?? 0) + (x?.hurda ?? 0)));
  }
  return sonuc;
}

// Okutulan emrin sıradaki fason iş emri (kart #97): kilitlemeden okunur; gidişin kendisi `fasonGidis` ile aynı kurallarla denetlenir.
// Kapalı, arşivdeki ya da taslak emirde ve sırada fason olmayan emirde null.
export async function siradakiFason(db: Db, emirId: number): Promise<SiradakiFasonCevabi['fason']> {
  const e = await s.ustEmirBul(db, emirId);
  if (e === null || e.malzemeNo === null) throw bulunamadi(EMIR_YOK);
  if (acikEmirIhlali(e.durum, e.arsiv) !== null || e.durum === 'taslak') return null;
  const hepsi = await s.isEmirleriGetir(db, [emirId]);
  const sira = siradakiIsEmri(hepsi);
  if (sira === null || sira.fasonFirmaId === null) return null;
  const ozet = fasonOzeti(await s.fasonHareketleriGetir(db, [sira.id]));
  const firma = (await firmaOzetleri(db, [sira.fasonFirmaId])).get(sira.fasonFirmaId);
  return {
    uretimEmriId: e.id, emirNo: e.emirNo, isEmriId: sira.id, opNo: sira.opNo, ad: sira.ad, firma: firma?.ad ?? null,
    gonderilen: ozet.gonderilen, donenSaglam: ozet.donenSaglam, donenHurda: ozet.donenHurda,
    gonderilebilir: (await adimaGiren(db, emirId, hepsi, sira)) ?? e.adet,
  };
}

export async function fasonGidis(db: Db, kullanici: Kullanici, emirId: number, isEmriId: number, adet: number): Promise<{ hareketId: number }> {
  const kisiId = islemDenetle(kullanici, ['uretim-emirleri.fason']);
  return fasonGidisiKaydet(db, kisiId, emirId, isEmriId, adet, null);
}

// Sevkiyat Tüm işler (960): depo çıkışı fason gidişini bu yoldan yazar; yetki çağıranın ucunda, kurallar elle gidişle aynı.
// Olay sevk kalemini taşır: sevkiyat yeni kalem açmaz, var olan kaleme hareketi yazar.
export const fasonGidisYaz = (db: Db, kisiId: number, g: { uretimEmriId: number; isEmriId: number; adet: number; sevkKalemiId: number }): Promise<{ hareketId: number }> =>
  fasonGidisiKaydet(db, kisiId, g.uretimEmriId, g.isEmriId, g.adet, g.sevkKalemiId);

async function fasonGidisiKaydet(db: Db, kisiId: number, emirId: number, isEmriId: number, adet: number, sevkKalemiId: number | null): Promise<{ hareketId: number }> {
  const { e, isEmri, durum, oncekiIsEmriId } = await fasonBaglami(db, emirId, isEmriId);
  const ihlal = fasonGidisIhlali(durum, adet);
  if (ihlal !== null) throw cakisma(ihlal);
  if (isEmri.durum === 'bekliyor') await kolAdimiBaslarMi(db, e, isEmri);
  const an = await s.anAl(db);
  // İlk gidiş fason iş emrini başlatır.
  if (isEmri.durum === 'bekliyor') await s.isEmriBaslat(db, isEmriId, an);
  const hareketId = await s.fasonHareketiEkle(db, { isEmriId, yon: 'gidis', adet, hurdaAdet: null, kisiId, an });
  await fasonHareketiBildir(db, { hareketId, oncekiIsEmriId, kisiId, sevkKalemiId });
  return { hareketId };
}

// Fason dönüşü mal kabulden girer (kullanıcı kararı 15.10, B): stok, mal kabul yetkisiyle dönüş kaydını bu yoldan yazar; adet sınırı
// burada denetlenir, hurda stok dinleyicisiyle firmadan düşer.
export async function fasonDonusuKaydet(db: Db, kisiId: number, emirId: number, isEmriId: number, saglamAdet: number, hurdaAdet: number): Promise<{ hareketId: number }> {
  const { durum, oncekiIsEmriId } = await fasonBaglami(db, emirId, isEmriId);
  const ihlal = fasonDonusIhlali(durum, saglamAdet, hurdaAdet);
  if (ihlal !== null) throw cakisma(ihlal);
  const hareketId = await s.fasonHareketiEkle(db, { isEmriId, yon: 'donus', adet: saglamAdet, hurdaAdet, kisiId, an: await s.anAl(db) });
  await fasonHareketiBildir(db, { hareketId, oncekiIsEmriId, kisiId, sevkKalemiId: null });
  return { hareketId };
}

// Gönderilenin hepsi dönünce fason iş emri tamamlanır; sağlam adedi dönen sağlamdır. Son iş emriyse emir biter.
export async function fasonTamamla(db: Db, kullanici: Kullanici, emirId: number, isEmriId: number): Promise<void> {
  const kisiId = islemDenetle(kullanici, ['uretim-emirleri.fason']);
  await ustuOnceKilitle(db, emirId);
  const { e, isEmri, durum } = await fasonBaglami(db, emirId, isEmriId);
  const ihlal = fasonTamamIhlali(durum);
  if (ihlal !== null) throw cakisma(ihlal);
  await birlesmeAdimiBiterMi(db, emirId, isEmri);
  const an = await s.anAl(db);
  await s.isEmriBitir(db, isEmriId, durum.donenSaglam, an);
  if (siradakiIsEmri(await s.isEmirleriGetir(db, [emirId])) !== null) await siradakiIstasyonuYaz(db, emirId);
  else if (!(await kolSonuysaKatil(db, e, kisiId))) {
    await s.fasonlaBitir(db, emirId, durum.donenSaglam, an);
    await emirBittiBildir(db, { uretimEmriId: emirId, saglamAdet: durum.donenSaglam, kisiId });
  }
}

/* ---------------- parti bölme ve birleştirme (kart #262, kullanıcı kararları A ve PB-K1..K6) ---------------- */

interface DogrudanAltParti { id: number; bolunmeSira: number; adet: number; birlesmeOpNo: number | null }

// Emrin iptal olmayan doğrudan alt partileri, adetleri kendi alt partileriyle birlikte: bölündükleri sıradan önceki adımları bu emir
// onlar için de yapmıştır. İptal (birleşmiş ya da iptal edilmiş) parti sayılmaz; birleşenin adedi hedefindedir.
function dogrudanAltPartiler(agac: readonly AltPartiSatiri[], emirId: number): DogrudanAltParti[] {
  const canli = agac.filter((a) => a.durum !== 'iptal');
  const toplam = (id: number): number => (canli.find((a) => a.id === id)?.adet ?? 0)
    + canli.filter((a) => a.ustEmirId === id).reduce((t, a) => t + toplam(a.id), 0);
  return canli.filter((a) => a.ustEmirId === emirId).map((a) => ({ id: a.id, bolunmeSira: a.bolunmeSira, adet: toplam(a.id), birlesmeOpNo: a.birlesmeOpNo }));
}

// Kolun planlı birleşme adımı, üst emrin sırasıyla (malzeme ve plan adedi sırayla sayar).
const birlesmeSiralari = (partiler: readonly DogrudanAltParti[], ustIsEmirleri: readonly IsEmriSatiri[]) => partiler.map((p) => ({
  ...p, birlesmeSira: p.birlesmeOpNo === null ? null : ustIsEmirleri.find((i) => i.opNo === p.birlesmeOpNo)?.sira ?? null,
}));

// UE-PB7: bu adımda emre katılmış kolların getirdiği sağlam. Kol bu emirden aynı sırada bölündüyse adedi önceki adımın sağlamından
// çıkmıştı; çıkışı yerine konur. Hiç adım bitirmemiş kol parçalarını olduğu gibi getirir.
async function birlesenGelen(db: Db, emirId: number, adim: { sira: number; opNo: number }): Promise<number> {
  return (await s.birlesenKollarGetir(db, emirId)).filter((k) => k.birlesmeOpNo === adim.opNo)
    .reduce((t, k) => t + (k.cikis ?? k.adet) - (k.ustEmirId === emirId && k.bolunmeSira === adim.sira ? k.adet : 0), 0);
}

const isEmriYazisi = (i: IsEmriSatiri, kaynaksiz: boolean, sira = i.sira): IsEmriYazisi => ({
  sira, opNo: i.opNo, operasyonTipiId: i.operasyonTipiId, ad: i.ad,
  makineId: kaynaksiz ? null : i.makineId, kisiId: kaynaksiz ? null : i.kisiId, fasonFirmaId: i.fasonFirmaId, istasyonId: kaynaksiz ? null : i.istasyonId,
  ayarSuresiDk: i.ayarSuresiDk, birimSureDk: i.birimSureDk, terminGun: i.terminGun, bagimlilik: i.bagimlilik, devirAdedi: i.devirAdedi,
  firePayiYuzde: i.firePayiYuzde, makineKullanimi: i.makineKullanimi, enKucukParca: i.enKucukParca, yenidenAyar: i.yenidenAyar, talimatSurumu: i.talimatSurumu,
  tur: i.tur, ekAciklama: i.ekAciklama,
});

// Üst emrin iş emirleri (aday, bileşen ve kontrol listesiyle) kola kopyalanır. İlk kopyalananın makinesi ya da kişisi boş başlar
// (ilk sistemde ikinci parça atamasızdır); fason firması kalır.
async function adimlariKopyala(db: Db, kolId: number, kaynak: readonly IsEmriSatiri[], ilkSira: number): Promise<void> {
  const idler = kaynak.map((i) => i.id);
  const [adaylar, bilesenler, liste] = [await s.adaylariGetir(db, idler), await s.bilesenleriGetir(db, idler), await s.kontrolListesiGetir(db, idler)];
  for (const [n, i] of kaynak.entries()) {
    const yeni = await s.isEmriEkle(db, kolId, isEmriYazisi(i, n === 0 && i.fasonFirmaId === null, ilkSira + n));
    for (const a of adaylar.filter((x) => x.isEmriId === i.id)) await s.adayEkle(db, yeni, a);
    for (const b of bilesenler.filter((x) => x.isEmriId === i.id)) await s.bilesenEkle(db, yeni, b);
    for (const m of liste.filter((x) => x.isEmriId === i.id)) await s.adimEkle(db, kolId, m.sira, m.ad, m.aciklama, yeni);
  }
}

const acikAltPartiVar = async (db: Db, id: number): Promise<boolean> => (await s.altPartilerGetir(db, [id])).some((a) => a.ustEmirId === id && a.durum !== 'iptal');

const kolDurumu = (e: UstEmirSatiri, isEmirleri: readonly IsEmriSatiri[], altPartili: boolean): KolDurumu => ({
  ustEmirId: e.ustEmirId, birlesmeOpNo: e.birlesmeOpNo, durum: e.durum, arsiv: e.arsiv, acikAltPartiVar: altPartili, isEmirleri,
});

// UE-PB4: ek adım kolun içine girer; arkasındaki adımların sırası birer kayar (sıra kısıtı işlem sonunda denetlenir).
async function ekAdimKoy(db: Db, kol: UstEmirSatiri, ek: EkAdim, tipler: Set<number>): Promise<void> {
  const kendi = await s.isEmirleriGetir(db, [kol.id]);
  const ihlal = ekAdimIhlali(kolDurumu(kol, kendi, false), ek);
  if (ihlal === EK_ADIM_OP) throw dogrulama(ihlal, 'opNo');
  if (ihlal !== null) throw cakisma(ihlal);
  const girdi: IsEmriGirdisi = {
    sira: 1, opNo: ek.opNo, ad: ek.ad, operasyonTipiId: ek.operasyonTipiId, kaynak: ek.kaynak, ayarSuresiDk: ek.ayarSuresiDk, birimSureDk: ek.birimSureDk,
    terminGun: ek.terminGun, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  };
  girdiDenetle([girdi]);
  await adimiYerineKoy(db, kol.id, kendi, ek.oncekiOpNo, async (sira) => ({ ...(await yaziyaCevir(db, girdi, sira, tipler)), tur: ek.tur, ekAciklama: ek.aciklama }));
}

// Adım oncekiOpNo'dan sonra girer (null: başa); arkasındaki adımların sırası birer kayar (sıra kısıtı işlem sonunda denetlenir).
async function adimiYerineKoy(
  db: Db, emirId: number, kendi: readonly IsEmriSatiri[], oncekiOpNo: number | null, yazi: (sira: number) => Promise<IsEmriYazisi>,
): Promise<number> {
  const sirali = [...kendi].sort((a, b) => a.sira - b.sira);
  const yer = oncekiOpNo === null ? 0 : sirali.findIndex((i) => i.opNo === oncekiOpNo) + 1;
  for (const [n, i] of sirali.entries()) {
    const sira = n < yer ? n + 1 : n + 2;
    if (i.sira !== sira) await s.isEmriSirasiYaz(db, i.id, sira);
  }
  return s.isEmriEkle(db, emirId, await yazi(yer + 1));
}

// UE-PB2, UE-PB8, Soru 121 a: bölünen adımın üretilmemiş adedi, sonrakiler başlamamışsa önceki adımlar bitmeden de bölünür; planlı birleşmeli kol birleşme
// adımına kadar olan iş emirlerini taşır, ek adımlar kola konur. Üstün adedi düşer.
export async function partiyiBol(
  db: Db, kullanici: Kullanici, id: number,
  g: {
    adimSira: number; adet: number; surum: number; birlesmeOpNo?: number | null | undefined; emirTuru?: EmirTuru | undefined; ekAdimlar?: EkAdim[] | undefined;
  },
): Promise<{ altEmirId: number }> {
  const acanId = islemDenetle(kullanici, ['uretim-emirleri.yaz', 'plan.canliya-al']);
  const e = await kilitliUstEmir(db, id);
  surumDenetle(e, g.surum);
  const altEmirId = await kilitliEmriBol(db, acanId, e, g);
  const kol = await s.ustEmirBul(db, altEmirId);
  if (kol === null) throw bulunamadi(EMIR_YOK);
  const tipler = await tipKimlikleri(db);
  for (const ek of g.ekAdimlar ?? []) await ekAdimKoy(db, kol, ek, tipler);
  await siradakiIstasyonuYaz(db, altEmirId);
  return { altEmirId };
}

// Bölünecek adımın elde kalanı için emrin durumu (eldekiAdet): aynı sıradan bölünenler, katılan kollar ve adımda sayılan.
export async function bolmeDurumu(db: Db, e: UstEmirSatiri, kendi: readonly IsEmriSatiri[], adimSira: number): Promise<BolmeDurumu> {
  const ayniSiradanBolunen = dogrudanAltPartiler(await s.altPartilerGetir(db, [e.id]), e.id)
    .filter((p) => p.bolunmeSira === adimSira).reduce((t, p) => t + p.adet, 0);
  const bolunenAdim = kendi.find((i) => i.sira === adimSira);
  const gelen = bolunenAdim === undefined ? 0 : await birlesenGelen(db, e.id, bolunenAdim);
  // Çalışan adımda sayılan adet üstte kalır; sayım da emri kilitler, arada sayı değişmez.
  const bolunenIslenen = bolunenAdim === undefined || bolunenAdim.durum === 'bekliyor'
    ? 0 : (await s.islenenAdetleriGetir(db, [bolunenAdim.id])).get(bolunenAdim.id)?.adet ?? 0;
  return { durum: e.durum, arsiv: e.arsiv, adet: e.adet, isEmirleri: kendi, ayniSiradanBolunen, birlesenGelen: gelen, bolunenIslenen };
}

// Bölme (kilitli emir üzerinde, yetkisi çağıranda): planlamanın bölmesi ve terminalin hatalı parçası (1033 a) aynı kuralla böler.
export async function kilitliEmriBol(
  db: Db, acanId: number, e: UstEmirSatiri, g: { adimSira: number; adet: number; birlesmeOpNo?: number | null | undefined; emirTuru?: EmirTuru | undefined },
): Promise<number> {
  const id = e.id;
  const kendi = await s.isEmirleriGetir(db, [id]);
  const birlesmeOpNo = g.birlesmeOpNo ?? null;
  const ihlal = bolmeIhlali(await bolmeDurumu(db, e, kendi, g.adimSira), g.adimSira, g.adet, birlesmeOpNo);
  if (ihlal === BOLME_ADET || ihlal === BOLME_URETILMIS) throw dogrulama(ihlal, 'adet');
  if (ihlal === BOLME_BIRLESME_ADIMI) throw dogrulama(ihlal, 'birlesmeOpNo');
  if (ihlal !== null) throw cakisma(ihlal);
  if (e.malzemeNo === null || e.kaynakRotaRevizyonId === null) throw bulunamadi(EMIR_YOK);
  const altEmirId = await s.ustEmirEkle(db, {
    parcaNo: e.parcaNo, parcaAd: e.parcaAd, adet: g.adet, istasyonId: null, malzemeNo: e.malzemeNo, kaynakRotaRevizyonId: e.kaynakRotaRevizyonId,
    oncelik: e.oncelik, baslangic: e.baslangic, teslim: e.teslim, aciklama: e.aciklama, durum: e.durum === 'taslak' ? 'taslak' : 'planli',
    ustEmirId: id, bolunmeSira: g.adimSira, birlesmeOpNo, emirTuru: g.emirTuru ?? e.emirTuru, emirNo: kolEmirNo(e.emirNo, (await s.kolSayisi(db, id)) + 1), projeId: e.projeId,
    siparisSatiriId: e.siparisSatiriId,
  }, acanId);
  const birlesmeSira = birlesmeOpNo === null ? null : kendi.find((i) => i.opNo === birlesmeOpNo)?.sira ?? null;
  await adimlariKopyala(db, altEmirId, kendi.filter((i) => i.sira >= g.adimSira && (birlesmeSira === null || i.sira < birlesmeSira)), g.adimSira);
  if ((await s.adetYaz(db, id, e.adet - g.adet, e.surum)) === null) throw eskiSurum();
  return altEmirId;
}

// Hatalı parça (1034): kalite ve rework adımları kolun başına ya da emirde hatalı adımın arkasına, verilen sırayla girer. Yer ve op
// numarası çağıranın kuralındadır (hataliIhlali, araOpNolari); tip ve kaynak burada olağan yazıyla çözülür.
export interface EklenenAdim {
  opNo: number; ad: string; operasyonTipiId: number; istasyonId: number | null; tur: 'rework' | 'ek'; ekAciklama: string | null;
  bagimlilik: 'bekleyen' | 'bagimsiz'; kopya?: IsEmriSatiri;
}
export async function adimlariKoy(db: Db, emirId: number, oncekiOpNo: number | null, adimlar: readonly EklenenAdim[]): Promise<number[]> {
  const tipler = await tipKimlikleri(db);
  const idler: number[] = [];
  let onceki = oncekiOpNo;
  for (const a of adimlar) {
    const kendi = await s.isEmirleriGetir(db, [emirId]);
    idler.push(await adimiYerineKoy(db, emirId, kendi, onceki, async (sira) => {
      if (a.kopya !== undefined) return { ...isEmriYazisi(a.kopya, true, sira), opNo: a.opNo, tur: a.tur, ekAciklama: a.ekAciklama };
      const girdi: IsEmriGirdisi = {
        sira, opNo: a.opNo, ad: a.ad, operasyonTipiId: a.operasyonTipiId, kaynak: null, istasyonId: a.istasyonId, ayarSuresiDk: null, birimSureDk: null,
        terminGun: null, bagimlilik: a.bagimlilik, devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
      };
      return { ...(await yaziyaCevir(db, girdi, sira, tipler)), tur: a.tur, ekAciklama: a.ekAciklama };
    }));
    onceki = a.opNo;
  }
  return idler;
}

// Kalite "rework" dedikten sonra planlama ikinci adımı doldurur (1034): ad, tip, kaynak ve süre ya da termin (7 a). Adım bekliyor olmalı.
export async function reworkAdimiYaz(db: Db, kullanici: Kullanici, emirId: number, isEmriId: number, g: ReworkAdimiGovdesi): Promise<void> {
  islemDenetle(kullanici, ['uretim-emirleri.yaz', 'plan.canliya-al']);
  const e = await kilitliUstEmir(db, emirId);
  surumDenetle(e, g.surum);
  const acik = acikEmirIhlali(e.durum, e.arsiv);
  if (acik !== null) throw cakisma(acik);
  const adim = (await s.isEmirleriGetir(db, [emirId])).find((i) => i.id === isEmriId) ?? null;
  const kayit = await s.reworkAdimiKaydi(db, isEmriId);
  if (adim === null || kayit === null) throw bulunamadi(IS_EMRI_YOK);
  const ihlal = reworkAdimiIhlali(kayit, adim);
  if (ihlal !== null) throw cakisma(ihlal);
  const r = reworkTermini(g);
  const girdi: IsEmriGirdisi = {
    sira: adim.sira, opNo: adim.opNo, ad: r.ad, operasyonTipiId: r.operasyonTipiId, kaynak: r.kaynak, ayarSuresiDk: r.ayarSuresiDk, birimSureDk: r.birimSureDk,
    terminGun: r.terminGun, bagimlilik: adim.bagimlilik, devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  };
  girdiDenetle([girdi]);
  await bekleyeniGuncelle(db, adim.id, { ...(await yaziyaCevir(db, girdi, adim.sira, await tipKimlikleri(db))), tur: 'rework', ekAciklama: r.aciklama ?? adim.ekAciklama });
  if ((await s.surumArtir(db, emirId, e.surum)) === null) throw eskiSurum();
  await siradakiIstasyonuYaz(db, emirId);
}

export async function ekAdimEkle(db: Db, kullanici: Kullanici, id: number, g: EkAdim & { surum: number }): Promise<void> {
  islemDenetle(kullanici, ['uretim-emirleri.yaz', 'plan.canliya-al']);
  const e = await kilitliUstEmir(db, id);
  surumDenetle(e, g.surum);
  const ortak = ekAdimIhlali(kolDurumu(e, await s.isEmirleriGetir(db, [id]), await acikAltPartiVar(db, id)), g);
  if (ortak === EK_ADIM_OP) throw dogrulama(ortak, 'opNo');
  if (ortak !== null) throw cakisma(ortak);
  await ekAdimKoy(db, e, g, await tipKimlikleri(db));
  if ((await s.surumArtir(db, id, e.surum)) === null) throw eskiSurum();
  await siradakiIstasyonuYaz(db, id);
}

export async function ekAdimKaldir(db: Db, kullanici: Kullanici, id: number, g: { opNo: number; surum: number }): Promise<void> {
  islemDenetle(kullanici, ['uretim-emirleri.yaz', 'plan.canliya-al']);
  const e = await kilitliUstEmir(db, id);
  surumDenetle(e, g.surum);
  const kendi = await s.isEmirleriGetir(db, [id]);
  const ihlal = ekAdimKaldirIhlali(kolDurumu(e, kendi, await acikAltPartiVar(db, id)), g.opNo);
  if (ihlal === IS_EMRI_YOK) throw bulunamadi(ihlal);
  if (ihlal !== null) throw cakisma(ihlal);
  const kalan = [...kendi].sort((a, b) => a.sira - b.sira).filter((i) => i.opNo !== g.opNo);
  const silinen = kendi.find((i) => i.opNo === g.opNo);
  if (silinen !== undefined) await bekleyeniSil(db, silinen.id);
  for (const [n, i] of kalan.entries()) if (i.sira !== n + 1) await s.isEmriSirasiYaz(db, i.id, n + 1);
  if ((await s.surumArtir(db, id, e.surum)) === null) throw eskiSurum();
  await siradakiIstasyonuYaz(db, id);
}

/* ---------------- rotasız emrin adımları (B13; Reçete ve Rota ekler, düzenler, siler) ---------------- */

const BILESEN_YINELENDI = 'Aynı malzeme bir adımda iki kez bileşen olamaz.';

const rotasizDurumu = (e: UstEmirSatiri, isEmirleri: readonly IsEmriSatiri[]) => ({
  durum: e.durum, arsiv: e.arsiv, kaynakRotaRevizyonId: e.kaynakRotaRevizyonId, isEmirleri,
});

function rotasizIhlali(ihlal: string | null): void {
  if (ihlal === null) return;
  if (ihlal === EK_ADIM_OP) throw dogrulama(ihlal, 'opNo');
  if (ihlal === IS_EMRI_YOK) throw bulunamadi(ihlal);
  throw cakisma(ihlal);
}

type RotasizBilesen = NonNullable<RotasizAdimEkle['bilesenler']>[number];

async function bilesenleriDenetle(db: Db, bilesenler: readonly RotasizBilesen[]): Promise<void> {
  if (new Set(bilesenler.map((b) => b.malzemeId)).size !== bilesenler.length) throw dogrulama(BILESEN_YINELENDI, 'bilesenler');
  const ozetler = await malzemeOzetleri(db, bilesenler.map((b) => b.malzemeId));
  if (bilesenler.some((b) => !bilesenOlabilirMi(ozetler.get(b.malzemeId)))) throw dogrulama(BILESEN_GECERSIZ, 'bilesenler');
}

async function bilesenleriYaz(db: Db, isEmriId: number, bilesenler: readonly RotasizBilesen[]): Promise<void> {
  for (const b of bilesenler) await s.bilesenEkle(db, isEmriId, { malzemeNo: b.malzemeId, miktar: String(b.miktar), fireYuzde: String(b.fireYuzde) });
}

type RotasizAdim = Pick<RotasizAdimEkle, 'opNo' | 'ad' | 'operasyonTipiId' | 'kaynak' | 'ayarSuresiDk' | 'birimSureDk' | 'terminGun'>;

function mevcutKaynak(i: IsEmriSatiri): { tur: IsEmriKaynakTuru; id: number } | null {
  if (i.fasonFirmaId !== null) return { tur: 'fason', id: i.fasonFirmaId };
  if (i.makineId !== null) return { tur: 'makine', id: i.makineId };
  return i.kisiId === null ? null : { tur: 'kisi', id: i.kisiId };
}

const rotasizGirdi = (a: RotasizAdim): IsEmriGirdisi => ({
  sira: 1, opNo: a.opNo, ad: a.ad, operasyonTipiId: a.operasyonTipiId, kaynak: a.kaynak, ayarSuresiDk: a.ayarSuresiDk, birimSureDk: a.birimSureDk,
  terminGun: a.terminGun, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
});

// Rotadan gelmeyen adım 'ek' türündedir: açıklaması operatöre gösterilir (rota adımı açıklama taşımaz, tablo kısıtı).
async function rotasizAdimYazisi(db: Db, a: RotasizAdim, sira: number, aciklama: string | null): Promise<IsEmriYazisi> {
  return { ...(await yaziyaCevir(db, rotasizGirdi(a), sira, await tipKimlikleri(db))), tur: 'ek', ekAciklama: aciklama };
}

async function rotasizBitir(db: Db, e: UstEmirSatiri): Promise<void> {
  if ((await s.surumArtir(db, e.id, e.surum)) === null) throw eskiSurum();
  await siradakiIstasyonuYaz(db, e.id);
}

// UE-RA-1: adım rotasız emrin başlamamış bölgesine girer; yer ve op numarası kola konan ek adımınkiyle aynı kuralla denetlenir.
export async function rotasizAdimEkle(db: Db, kullanici: Kullanici, id: number, g: RotasizAdimEkle): Promise<void> {
  islemDenetle(kullanici, ['uretim-emirleri.yaz']);
  const e = await kilitliUstEmir(db, id);
  surumDenetle(e, g.surum);
  const kendi = await s.isEmirleriGetir(db, [id]);
  rotasizIhlali(rotasizAdimEkleIhlali(rotasizDurumu(e, kendi), g));
  girdiDenetle([rotasizGirdi(g)]);
  await bilesenleriDenetle(db, g.bilesenler ?? []);
  const isEmriId = await adimiYerineKoy(db, id, kendi, g.oncekiOpNo, (sira) => rotasizAdimYazisi(db, g, sira, g.aciklama));
  await bilesenleriYaz(db, isEmriId, g.bilesenler ?? []);
  await rotasizBitir(db, e);
}

// UE-RA-2: yalnız bekleyen adım düzenlenir; verilmeyen alan kalır, bilesenler verilirse listenin tamamının yerine geçer.
export async function rotasizAdimDuzenle(db: Db, kullanici: Kullanici, id: number, g: RotasizAdimDuzenle): Promise<void> {
  islemDenetle(kullanici, ['uretim-emirleri.yaz']);
  const e = await kilitliUstEmir(db, id);
  surumDenetle(e, g.surum);
  const kendi = await s.isEmirleriGetir(db, [id]);
  rotasizIhlali(rotasizAdimDegisimIhlali(rotasizDurumu(e, kendi), g.opNo));
  const i = kendi.find((x) => x.opNo === g.opNo);
  if (i === undefined) throw bulunamadi(IS_EMRI_YOK);
  const yeni: RotasizAdim = {
    opNo: i.opNo, ad: g.ad ?? i.ad, operasyonTipiId: g.operasyonTipiId ?? i.operasyonTipiId,
    kaynak: g.kaynak !== undefined ? g.kaynak : mevcutKaynak(i),
    ayarSuresiDk: g.ayarSuresiDk !== undefined ? g.ayarSuresiDk : i.ayarSuresiDk,
    birimSureDk: g.birimSureDk !== undefined ? g.birimSureDk : i.birimSureDk,
    terminGun: g.terminGun !== undefined ? g.terminGun : i.terminGun,
  };
  girdiDenetle([rotasizGirdi(yeni)]);
  if (g.bilesenler !== undefined) await bilesenleriDenetle(db, g.bilesenler);
  const eskiBilesenler = await s.bilesenleriGetir(db, [i.id]);
  const aciklama = g.aciklama !== undefined ? g.aciklama || null : i.ekAciklama;
  // Güncelleme adayları, bileşenleri ve kontrol listesini siler; verilmeyenler yeniden yazılır (rotasız adımda aday ve liste yoktur).
  await bekleyeniGuncelle(db, i.id, await rotasizAdimYazisi(db, yeni, i.sira, aciklama));
  if (i.tur === 'ek') await s.isEmriEkAciklamasiYaz(db, i.id, aciklama);
  if (g.bilesenler !== undefined) await bilesenleriYaz(db, i.id, g.bilesenler);
  else for (const b of eskiBilesenler) await s.bilesenEkle(db, i.id, b);
  await rotasizBitir(db, e);
}

// UE-RA-3: yalnız bekleyen adım silinir; rotasız emir son adımı da silinip adımsız kalabilir.
export async function rotasizAdimSil(db: Db, kullanici: Kullanici, id: number, g: { opNo: number; surum: number }): Promise<void> {
  islemDenetle(kullanici, ['uretim-emirleri.yaz']);
  const e = await kilitliUstEmir(db, id);
  surumDenetle(e, g.surum);
  const kendi = await s.isEmirleriGetir(db, [id]);
  rotasizIhlali(rotasizAdimDegisimIhlali(rotasizDurumu(e, kendi), g.opNo));
  const silinen = kendi.find((i) => i.opNo === g.opNo);
  if (silinen !== undefined) await bekleyeniSil(db, silinen.id);
  const kalan = [...kendi].sort((a, b) => a.sira - b.sira).filter((i) => i.opNo !== g.opNo);
  for (const [n, i] of kalan.entries()) if (i.sira !== n + 1) await s.isEmriSirasiYaz(db, i.id, n + 1);
  await rotasizBitir(db, e);
}

// UE-PB8: plan konunca kol birleşme adımı ve sonrasını bırakır (o adımlar üstte yapılır); plan kalkınca üstün o adımdan sonraki
// adımlarını yeniden taşır. Kilit sırası üst, sonra kol (üst her zaman önce açılmıştır, kimliği küçüktür).
export async function birlesmePlani(db: Db, kullanici: Kullanici, id: number, g: { birlesmeOpNo: number | null; surum: number }): Promise<void> {
  islemDenetle(kullanici, ['uretim-emirleri.yaz', 'plan.canliya-al']);
  const ilk = await s.ustEmirBul(db, id);
  if (ilk === null || ilk.malzemeNo === null) throw bulunamadi(EMIR_YOK);
  const ust = ilk.ustEmirId === null ? null : await kilitliUstEmir(db, ilk.ustEmirId);
  const kol = await kilitliUstEmir(db, id);
  surumDenetle(kol, g.surum);
  const kendi = await s.isEmirleriGetir(db, [id]);
  const durum = kolDurumu(kol, kendi, await acikAltPartiVar(db, id));
  const ustIsEmirleri = ust === null ? [] : await s.isEmirleriGetir(db, [ust.id]);
  if (g.birlesmeOpNo === null) {
    const ihlal = birlesmePlaniKaldirIhlali(durum);
    if (ihlal !== null) throw cakisma(ihlal);
    const kesim = ustIsEmirleri.find((i) => i.opNo === kol.birlesmeOpNo)?.sira;
    const sonSira = Math.max(0, ...kendi.map((i) => i.sira));
    if (kesim !== undefined) await adimlariKopyala(db, id, ustIsEmirleri.filter((i) => i.sira >= kesim), sonSira + 1);
  } else {
    if (ust === null) throw cakisma(BIRLESME_PLANI_KOLDA);
    const ihlal = birlesmePlaniIhlali({ ...durum, bolunmeSira: kol.bolunmeSira }, { durum: ust.durum, arsiv: ust.arsiv, isEmirleri: ustIsEmirleri }, g.birlesmeOpNo);
    if (ihlal === BIRLESME_ADIMI_YOK) throw dogrulama(ihlal, 'birlesmeOpNo');
    if (ihlal !== null) throw cakisma(ihlal);
    const sirali = [...kendi].sort((a, b) => a.sira - b.sira);
    const kesim = sirali.findIndex((i) => i.opNo === g.birlesmeOpNo);
    for (const i of sirali.slice(kesim)) await bekleyeniSil(db, i.id);
  }
  if ((await s.birlesmePlaniYaz(db, id, g.birlesmeOpNo, kol.surum)) === null) throw eskiSurum();
  await siradakiIstasyonuYaz(db, id);
}

// UE-PB2, UE-PB6a: iş emri başlamadan önce (terminal ve fason gidiş). Kol, üstün bölünme adımından önceki adımı bitmeden başlamaz;
// bekleyen birleşme adımı, ona katılacak açık kol varken başlamaz.
export async function kolAdimiBaslarMi(db: Db, e: Pick<UstEmirSatiri, 'id' | 'ustEmirId' | 'bolunmeSira'>, isEmri: Pick<IsEmriSatiri, 'opNo' | 'bagimlilik'>): Promise<void> {
  const ihlal = await kolBaslamaReddi(db, e, isEmri);
  if (ihlal !== null) throw cakisma(ihlal);
}

async function kolBaslamaReddi(db: Db, e: Pick<UstEmirSatiri, 'id' | 'ustEmirId' | 'bolunmeSira'>, isEmri: Pick<IsEmriSatiri, 'opNo' | 'bagimlilik'>): Promise<string | null> {
  const ust = e.ustEmirId === null ? null : await s.ustEmirBul(db, e.ustEmirId);
  const ustIsEmirleri = ust === null || ust.durum === 'iptal' ? null : await s.isEmirleriGetir(db, [ust.id]);
  return kolBaslamaIhlali(e.bolunmeSira, ustIsEmirleri) ?? birlesmeBeklemeIhlali(isEmri, await acikKolBirlesmeleri(db, e.id), 'baslat');
}

// UE-PB6, 6a, 6b: birleşme adımı, ona katılacak açık kol varken bitmez.
export async function birlesmeAdimiBiterMi(db: Db, emirId: number, isEmri: Pick<IsEmriSatiri, 'opNo' | 'bagimlilik'>): Promise<void> {
  const ihlal = birlesmeBeklemeIhlali(isEmri, await acikKolBirlesmeleri(db, emirId), 'bitir');
  if (ihlal !== null) throw cakisma(ihlal);
}

// B8: terminal kaydı (Arkon) yazılmadan önce aynı parti kuralları sorulur; ret operatöre hemen döner, TMI komutu kuralı yine kendisi denetler.
export async function partiKomutuReddi(db: Db, isEmriId: number, komut: 'baslat' | 'bitir'): Promise<string | null> {
  const isEmri = await s.isEmriBul(db, isEmriId);
  const e = isEmri === null ? null : await s.ustEmirBul(db, isEmri.uretimEmriId);
  if (isEmri === null || e === null) return null;
  if (komut === 'baslat') return isEmri.durum === 'bekliyor' ? kolBaslamaReddi(db, e, isEmri) : null;
  return isEmri.durum === 'tamam' ? null : birlesmeBeklemeIhlali(isEmri, await acikKolBirlesmeleri(db, e.id), 'bitir');
}

const acikKolBirlesmeleri = async (db: Db, emirId: number): Promise<number[]> => dogrudanAltPartiler(await s.altPartilerGetir(db, [emirId]), emirId)
  .map((p) => p.birlesmeOpNo).filter((op): op is number => op !== null);

// Kolun katılması üstü de yazar: komut kolu kilitlemeden önce üstü kilitler (bölme, birleştirme ve plan da üst, sonra kol sırasıyla
// kilitler; ters sıra karşılıklı beklemeye yol açardı).
export async function ustuOnceKilitle(db: Db, emirId: number): Promise<void> {
  const e = await s.ustEmirBul(db, emirId);
  if (e !== null && e.ustEmirId !== null && e.birlesmeOpNo !== null) await s.ustEmirBul(db, e.ustEmirId, true);
}

// UE-PB6c: planlı birleşmeli kolun son iş emri bitince kol üstüne katılır; adedi (sağlam ve hurdasıyla, PB-K5) üste geçer, hurda
// kolun iş emirlerinde kalır. Kol değilse ya da planı yoksa false: emir olağan yoldan biter.
export async function kolSonuysaKatil(db: Db, e: Pick<UstEmirSatiri, 'id' | 'ustEmirId' | 'birlesmeOpNo' | 'adet'>, kisiId: number): Promise<boolean> {
  if (e.ustEmirId === null || e.birlesmeOpNo === null) return false;
  await s.adetEkle(db, e.ustEmirId, e.adet);
  await s.kolKatildi(db, e.id, e.ustEmirId);
  await emirBirlestiBildir(db, { uretimEmriId: e.id, hedefEmirId: e.ustEmirId, kisiId });
  return true;
}

// Kaynak parti kapanır (iptal), adedi hedefe eklenir; katıldığı adım kaynakta kalır. Kilit sırası küçük kimlikten büyüğe: iki
// birleştirme karşılıklı beklemez.
export async function partileriBirlestir(
  db: Db, kullanici: Kullanici, hedefId: number, g: { kaynakEmirId: number; surum: number; kaynakSurum: number },
): Promise<void> {
  const kisiId = islemDenetle(kullanici, ['uretim-emirleri.yaz', 'plan.canliya-al']);
  const ilk = await kilitliUstEmir(db, Math.min(hedefId, g.kaynakEmirId));
  const ikinci = hedefId === g.kaynakEmirId ? ilk : await kilitliUstEmir(db, Math.max(hedefId, g.kaynakEmirId));
  const [hedef, kaynak] = ilk.id === hedefId ? [ilk, ikinci] : [ikinci, ilk];
  surumDenetle(hedef, g.surum);
  surumDenetle(kaynak, g.kaynakSurum);
  const isEmirleri = await s.isEmirleriGetir(db, [hedef.id, kaynak.id]);
  const taraf = (e: UstEmirSatiri, altPartili: boolean) => ({
    id: e.id, durum: e.durum, arsiv: e.arsiv, ustEmirId: e.ustEmirId, bolunmeSira: e.bolunmeSira, acikAltPartiVar: altPartili,
    isEmirleri: isEmirleri.filter((i) => i.uretimEmriId === e.id),
  });
  const ihlal = birlestirmeIhlali(taraf(kaynak, await acikAltPartiVar(db, kaynak.id)), taraf(hedef, false));
  if (ihlal !== null) throw cakisma(ihlal);
  const adim = siradakiIsEmri(isEmirleri.filter((i) => i.uretimEmriId === kaynak.id));
  if (adim === null) throw cakisma(ihlal ?? 'İki parti aynı adımda beklemeli ve o adımdan sonrası başlamamış olmalı.');
  if ((await s.adetYaz(db, hedef.id, hedef.adet + kaynak.adet, hedef.surum)) === null) throw eskiSurum();
  if ((await s.birlesenPartiyiKapat(db, kaynak.id, hedef.id, kaynak.surum, adim.opNo)) === null) throw eskiSurum();
  await emirBirlestiBildir(db, { uretimEmriId: kaynak.id, hedefEmirId: hedef.id, kisiId });
}

/* ---------------- başka modüller için okumalar (plan UE4, stok UE12-UE14) ---------------- */

export interface PlanIsEmri {
  id: number;
  uretimEmriId: number;
  emirNo: string;
  malzemeNo: number;
  adet: number;
  teslim: string | null;
  // 1 en acil, 4 en az acil.
  oncelik: number;
  // Emrin açıldığı an (ISO); plan FIFO kuralı sıralar.
  acilma: string;
  baslangic: string | null;
  kaynakRotaRevizyonId: number;
  // Bölünmüş alt partide üst emrin kimliği; plan alt partiyi ayrı emir olarak yerleştirir. Planın kendi denediği emirde yoktur.
  ustEmirId?: number | null;
  // Alt partinin üstten ayrıldığı adımın sırası; kolun ilk adımı bu sıradadır ve üstün önceki adımını bekler.
  bolunmeSira?: number | null;
  // Planlı birleşmeli kolda üste katılacağı adımın op numarası: kol o adımı taşımaz, üstteki adım kolu bekler (bekleyen) ya da gelen
  // kadar başlar (akışlı).
  birlesmeOpNo?: number | null;
  // Rotadan gelen adım 'rota'dır; kola konan rework, tamir ya da ek adım türünü taşır.
  tur?: 'rota' | 'rework' | 'tamir' | 'ek';
  // Emrin türü (seri, FAI, numune...): plan etiket olarak gösterir.
  emirTuru?: EmirTuru;
  // Emrin bağlı olduğu sipariş satırı (176): plan önceliği siparişin gecikme bedelinden okur (196 a). Planın kendi denediği emirde yoktur.
  siparisSatiriId?: number | null;
  // Bu iş emrinin işleyeceği adet: emir adedi, bu adımı kollar için de yapacaksa onların adediyle (ileri adımdan bölme ve planlı birleşme).
  adimAdedi?: number;
  sira: number;
  opNo: number;
  ad: string;
  kaynak: AtanabilirKaynak | null;
  // İş emrine yazılmış istasyon (sabit kimlik: istasyon iş emrinindir); Arkon paketi makine ya da kişiden türetmeden okur. Planın kendi
  // denediği emirde yoktur.
  istasyonId?: number | null;
  ayarSuresiDk: string | null;
  birimSureDk: string | null;
  bagimlilik: 'bekleyen' | 'akisli' | 'bagimsiz';
  devirAdedi: number | null;
  durum: 'taslak' | 'planli' | 'basladi' | 'bitti' | 'iptal';
  // İş emrinin (adımın) kendi durumu: emir başlamışken bekleyen adımı plan taşır ve sıralar. Planın kendi denediği emirde yoktur.
  adimDurumu?: 'bekliyor' | 'calisiyor' | 'tamam';
  // Ek adımda (rework, tamir, ek) operatöre gösterilen açıklama; rota adımında null.
  ekAciklama?: string | null;
  // Hemen önündeki bitmemiş fason adımların kalan süre toplamı (gün; termin, yoksa varsayılan; gönderilmişte ilk gidişten geçen gün düşülür):
  // fason plana iş olarak girmez, bu adım dönüşü bekler.
  fasonBekleGun?: number;
  // Çalışan adımın gerçekleşeni (denetim #23): adımın başladığı an, işlenen net adet (sağlam, hurda, karar bekleyen, red; düzeltme
  // dahil) ve son sayım anı. Plan çalışan adımın kalan süresini bunlardan bulur. Çalışmayan adımda yoktur.
  adimBaslama?: string | null;
  islenenAdet?: number;
  sonSayimAni?: string | null;
  // Terminalin çalıştırdığı makine (açık kullanım; 393 d): planlanan makine çalışanlar arasındaysa o, değilse ilk açılan. Makinesiz
  // çalışmada ve çalışmayan adımda yoktur.
  fiiliMakineId?: number;
}

// Termini girilmemiş fason adımların süre tahmini (takvim günü, sorgularla aynı sırada; veri yoksa null). Plan satın almanın geçmiş teslim
// tahminini verir; bu modül satın almayı ithal etmez (satın alma bu modülü okur).
export type FasonTahmini = (sorgular: readonly { malzemeNo: number; operasyonTipiId: number | null; firmaId: number; adet: number }[]) => Promise<(number | null)[]>;

// Taslak emir plana alınmadan plan çizelgesinde denenebilir; varsayılan yalnız planlı ve başlamış emirlerdir.
export const planlanacakIsEmirleri = (db: Db, secenek: { taslakDahil?: boolean; fasonTahmini?: FasonTahmini } = {}): Promise<PlanIsEmri[]> =>
  acikAdimlar(db, secenek.taslakDahil ?? false, (r): r is number => r !== null, secenek.fasonTahmini);

// Rotasız emrin (B13) açık adımları, plan satırıyla aynı biçimde (kart #1257): plan bunları yerleştirmez, Arkon Hazırlık'a iş paketi olarak alır.
export type RotasizIsEmri = Omit<PlanIsEmri, 'kaynakRotaRevizyonId'> & { kaynakRotaRevizyonId: null };
export const rotasizIsEmirleri = (db: Db): Promise<RotasizIsEmri[]> => acikAdimlar(db, false, (r): r is null => r === null);

async function acikAdimlar<R extends number | null>(
  db: Db, taslakDahil: boolean, revizyonUyar: (r: number | null) => r is R, fasonTahmini?: FasonTahmini,
): Promise<(Omit<PlanIsEmri, 'kaynakRotaRevizyonId'> & { kaynakRotaRevizyonId: R })[]> {
  const satirlar = await s.planlanacakIsEmirleriGetir(db, taslakDahil);
  const emirIdleri = [...new Set(satirlar.map((i) => i.emir.id))];
  const agac = await s.altPartilerGetir(db, emirIdleri);
  const butun = await s.isEmirleriGetir(db, emirIdleri);
  const kollar = new Map(emirIdleri.map((id) => [id, birlesmeSiralari(dogrudanAltPartiler(agac, id), butun.filter((i) => i.uretimEmriId === id))]));
  // Kol, ayrılacağı adımdan önceki ve katıldığı adımdan sonraki adımlarda üstle birlikte işlenir.
  const taban = (emirId: number, adet: number) => (sira: number) => adet + (kollar.get(emirId) ?? [])
    .filter((p) => p.bolunmeSira > sira || (p.birlesmeSira !== null && sira >= p.birlesmeSira)).reduce((t, p) => t + p.adet, 0);
  const adetler = new Map(satirlar.map((i) => [i.emir.id, i.emir.adet]));
  const adimAdedi = new Map([...adetler].map(([id, adet]) => [id, adimAdetleri(butun.filter((x) => x.uretimEmriId === id), taban(id, adet))]));
  // Termini olmayan bitmemiş fason adımlar tek çağrıda sorulur; anahtar emir ve sıra.
  const tahminler = new Map<string, number | null>();
  if (fasonTahmini) {
    const malzeme = new Map(satirlar.map((i) => [i.emir.id, i.emir.malzemeNo]));
    const sorulacak = butun.filter((x) => x.fasonFirmaId !== null && x.terminGun === null && x.durum !== 'tamam' && malzeme.get(x.uretimEmriId) != null);
    const cevap = sorulacak.length === 0 ? [] : await fasonTahmini(sorulacak.map((x) => ({
      malzemeNo: malzeme.get(x.uretimEmriId)!, operasyonTipiId: x.operasyonTipiId, firmaId: x.fasonFirmaId!,
      adet: adimAdedi.get(x.uretimEmriId)?.get(x.sira) ?? adetler.get(x.uretimEmriId)!,
    })));
    sorulacak.forEach((x, n) => tahminler.set(`${x.uretimEmriId}|${x.sira}`, cevap[n] ?? null));
  }
  const simdi = Date.now();
  const calisanlar = satirlar.filter((i) => i.durum === 'calisiyor').map((i) => i.id);
  const islenen = await s.islenenAdetleriGetir(db, calisanlar);
  const fiili = new Map<number, number[]>();
  for (const k of await s.acikMakineleriGetir(db, calisanlar)) fiili.set(k.isEmriId, [...(fiili.get(k.isEmriId) ?? []), k.makineId]);
  const fiiliMakine = (i: { id: number; makineId: number | null }): number | undefined => {
    const m = fiili.get(i.id);
    return m === undefined ? undefined : i.makineId !== null && m.includes(i.makineId) ? i.makineId : m[0];
  };
  return satirlar.flatMap((i) => {
    const e = i.emir;
    const revizyon = e.kaynakRotaRevizyonId;
    if (e.malzemeNo === null || !revizyonUyar(revizyon)) return [];
    const makine = fiiliMakine(i);
    const kaynak: AtanabilirKaynak | null = i.makineId !== null ? { tur: 'makine', id: i.makineId } : i.kisiId !== null ? { tur: 'kisi', id: i.kisiId } : null;
    return [{
      id: i.id, uretimEmriId: e.id, emirNo: e.emirNo, malzemeNo: e.malzemeNo, adet: e.adet, teslim: e.teslim, oncelik: e.oncelik, acilma: e.acilma, baslangic: e.baslangic,
      kaynakRotaRevizyonId: revizyon, ustEmirId: e.ustEmirId, bolunmeSira: e.bolunmeSira, birlesmeOpNo: e.birlesmeOpNo, tur: i.tur, emirTuru: e.emirTuru,
      siparisSatiriId: e.siparisSatiriId, adimAdedi: adimAdedi.get(e.id)?.get(i.sira) ?? e.adet,
      sira: i.sira, opNo: i.opNo, ad: i.ad, kaynak, istasyonId: i.istasyonId, ayarSuresiDk: i.ayarSuresiDk, birimSureDk: i.birimSureDk, bagimlilik: i.bagimlilik,
      devirAdedi: i.devirAdedi, durum: e.durum === 'taslak' ? 'taslak' : e.baslamis ? 'basladi' : 'planli', adimDurumu: i.durum, ekAciklama: i.ekAciklama,
      fasonBekleGun: fasonBeklemesi(butun.filter((x) => x.uretimEmriId === e.id), i.sira, (x) => tahminler.get(`${e.id}|${x.sira}`) ?? null, simdi),
      ...(i.durum === 'calisiyor' ? { adimBaslama: i.baslama, islenenAdet: islenen.get(i.id)?.adet ?? 0, sonSayimAni: islenen.get(i.id)?.sonAn ?? null } : {}),
      ...(makine === undefined ? {} : { fiiliMakineId: makine }),
    }];
  });
}

// İş emrine kopyalanan kontrol listesi (emir açılırken rotanın talimatından); Arkon paketi rotanın bugünkü talimatı yerine bunu gösterir.
// Listesi olmayan iş emri haritada yoktur.
export async function isEmriKontrolListesi(db: Db, isEmriIdleri: readonly number[]): Promise<Map<number, { sira: number; ad: string; aciklama: string | null }[]>> {
  const tekil = [...new Set(isEmriIdleri)];
  const harita = new Map<number, { sira: number; ad: string; aciklama: string | null }[]>();
  if (tekil.length === 0) return harita;
  for (const r of await s.kontrolListesiGetir(db, tekil)) harita.set(r.isEmriId, [...(harita.get(r.isEmriId) ?? []), { sira: r.sira, ad: r.ad, aciklama: r.aciklama }]);
  return harita;
}

export async function emirNolari(db: Db, idler: readonly number[]): Promise<Map<number, string>> {
  const tekil = [...new Set(idler)];
  if (tekil.length === 0) return new Map();
  return new Map((await s.emirNolariGetir(db, tekil)).map((r) => [r.id, r.emirNo]));
}

export interface IsEmriOzeti {
  id: number;
  uretimEmriId: number;
  emirNo: string;
  opNo: number;
  ad: string;
  durum: 'bekliyor' | 'calisiyor' | 'tamam';
  // Fason iş emrinde ve kaynak atanmamışken null.
  istasyonId: number | null;
  kaynak: { tur: IsEmriKaynakTuru; id: number } | null;
}

export async function isEmriOzeti(db: Db, id: number): Promise<IsEmriOzeti | null> {
  const i = await s.isEmriBul(db, id);
  if (i === null) return null;
  const no = (await emirNolari(db, [i.uretimEmriId])).get(i.uretimEmriId) ?? '';
  const tur = kaynakTuru(i);
  const kaynakId = i.fasonFirmaId ?? i.makineId ?? i.kisiId;
  return {
    id: i.id, uretimEmriId: i.uretimEmriId, emirNo: no, opNo: i.opNo, ad: i.ad, durum: i.durum, istasyonId: i.istasyonId,
    kaynak: tur === null || kaynakId === null ? null : { tur, id: kaynakId },
  };
}

export interface MalzemeIhtiyaci {
  malzemeNo: number;
  opNo: number;
  // Brüt ihtiyaç, dört haneye yuvarlanmış ondalık metin. Stoktan düşülmüş (net) ihtiyaç stok ve plan tarafındadır.
  brut: string;
}

// Emrin kendi iş emri kopyasından brüt malzeme ihtiyacı (EK "Malzeme ihtiyacı"); emir yoksa ya da arşivdeki eski emirse null.
export async function emirMalzemeIhtiyaci(db: Db, emirId: number): Promise<MalzemeIhtiyaci[] | null> {
  return (await emirlerinMalzemeIhtiyaci(db, [emirId])).get(emirId) ?? null;
}
// Toplu okuma: emir sayısından bağımsız dört sorgu (stok özeti her açık emri sayar; yük testi 2026-10-18). Ürün kartı olmayan ya da
// bulunmayan emirde null.
export async function emirlerinMalzemeIhtiyaci(db: Db, emirIdleri: readonly number[]): Promise<Map<number, MalzemeIhtiyaci[] | null>> {
  const sonuc = new Map<number, MalzemeIhtiyaci[] | null>(emirIdleri.map((id) => [id, null]));
  const emirler = (await s.ustEmirlerBul(db, [...sonuc.keys()])).filter((e) => e.malzemeNo !== null);
  if (emirler.length === 0) return sonuc;
  const ids = emirler.map((e) => e.id);
  const isEmirleri = await s.isEmirleriGetir(db, ids);
  const bilesenler = await s.bilesenleriGetir(db, isEmirleri.map((i) => i.id));
  // Birden çok kökten okunan ağaçta torun iki kez gelebilir (UNION ALL); tek kez sayılır.
  const agac = [...new Map((await s.altPartilerGetir(db, ids)).map((a) => [a.id, a])).values()];
  for (const e of emirler) {
    const kendi = isEmirleri.filter((i) => i.uretimEmriId === e.id);
    const kendiIdleri = new Set(kendi.map((i) => i.id));
    sonuc.set(e.id, malzemeIhtiyaci(
      e.adet,
      kendi.map((i) => ({ id: i.id, sira: i.sira, opNo: i.opNo, firePayiYuzde: Number(i.firePayiYuzde) })),
      bilesenler.filter((b) => kendiIdleri.has(b.isEmriId)).map((b) => ({ isEmriId: b.isEmriId, malzemeNo: b.malzemeNo, miktar: Number(b.miktar), fireYuzde: Number(b.fireYuzde) })),
      birlesmeSiralari(dogrudanAltPartiler(agac, e.id), kendi),
    ).map((m) => ({ malzemeNo: m.malzemeNo, opNo: m.opNo, brut: m.brut.toFixed(4) })));
  }
  return sonuc;
}

// Refakat kartlarının sayılanı ve sınırı (Soru 132, 136 a). Kartla verilen malzemeyi stok bilir ve çağırırken verir; bu modül stoku
// okumaz (ADR 0006). sayilan, kartla adımda tüketilen parça (hurda dahil); iş emirsiz emirde ya da adımı bulunmayan emirde harita boştur.
export interface KartSayimi { sayilan: number; sinir: number | null }
export async function refakatKartiSayimlari(
  db: Db, uretimEmriId: number, istasyonId: number | null, kartlar: readonly { id: number; malzemeNo: number | null; verilen: string }[],
): Promise<Map<number, KartSayimi>> {
  const sonuc = new Map<number, KartSayimi>();
  if (kartlar.length === 0) return sonuc;
  const adimlar = await s.isEmirleriGetir(db, [uretimEmriId]);
  const adim = kartAdimi(adimlar, istasyonId);
  if (adim === null) return sonuc;
  const girdiler = (await s.bilesenleriGetir(db, [adim.id])).map((b) => ({ isEmriId: b.isEmriId, malzemeNo: b.malzemeNo, miktar: Number(b.miktar) }));
  const sayimlar = await s.kartSayimlariGetir(db, uretimEmriId, kartlar.map((k) => k.id));
  const sayim = (kartId: number, isEmriId: number) => sayimlar.find((x) => x.kartId === kartId && x.isEmriId === isEmriId);
  for (const k of kartlar) {
    sonuc.set(k.id, {
      sayilan: sayim(k.id, adim.id)?.toplam ?? 0,
      sinir: kartSiniri(adimlar, adim.id, girdiler, { malzemeNo: k.malzemeNo, verilen: Number(k.verilen) }, (i) => sayim(k.id, i)?.saglam ?? 0),
    });
  }
  return sonuc;
}

export interface UretimEmriOzeti {
  id: number;
  emirNo: string;
  // Arşivdeki eski (adımsız) emirde null.
  malzemeNo: number | null;
  adet: number;
  durum: EmirDurumu;
  arsiv: boolean;
  oncelik: number;
  baslangic: string | null;
  teslim: string | null;
  // Yalnız bitmiş emirde dolu (son iş emrinin sağlamı); stok tamamlaması çıktıyı bununla girer.
  saglamAdet: number | null;
  // Bölünmüş partide (kol) üst emir; stok kolun refakat kartını üst emrin kartından açar (kart #126).
  ustEmirId: number | null;
  // Bitmemiş ilk iş emri; iş emirsiz ya da bitmiş emirde null.
  siradakiIsEmriId: number | null;
  // Emrin açıldığı rota revizyonu; rotasız emirde null. Statü revizyona aittir.
  kaynakRotaRevizyonId: number | null;
  // Bağlı sipariş satırı; satırsız emirde null (Proje maliyet geliri satırdan okur, 226 a).
  siparisSatiriId: number | null;
}

// 335: üretimden giriş fişine giren hurda (stok ve Logo okur). Emrin bütün adımlarındaki net hurda adedi, düzeltmeler düşülmüş; yalnız
// mamul ve yarı mamul kartlı emir döner, birim kartta yoksa null. Net hurda 0 olan emir de döner: düzeltmeyle sıfırlanan satır güncellensin.
// Yetki denetlemez, çağıran korur.
export interface EmirHurdasi { uretimEmriId: number; malzemeId: number; stokKodu: string; tur: 'mamul' | 'yarimamul'; birim: string | null; hurdaAdet: number }
export async function emirHurdalari(db: Db, emirIdleri: readonly number[]): Promise<EmirHurdasi[]> {
  if (emirIdleri.length === 0) return [];
  const satirlar = await s.kartliEmirHurdalari(db, emirIdleri);
  const kartlar = await malzemeOzetleri(db, satirlar.map((r) => r.malzemeNo));
  return satirlar.flatMap((r) => {
    const k = kartlar.get(r.malzemeNo);
    if (!k || (k.tur !== 'mamul' && k.tur !== 'yarimamul')) return [];
    return [{ uretimEmriId: r.uretimEmriId, malzemeId: r.malzemeNo, stokKodu: k.kod, tur: k.tur, birim: k.birim, hurdaAdet: r.hurda }];
  });
}

export async function uretimEmriOzeti(db: Db, id: number): Promise<UretimEmriOzeti | null> {
  const e = await s.ustEmirBul(db, id);
  if (e === null) return null;
  const kendi = await s.isEmirleriGetir(db, [id]);
  return {
    id: e.id, emirNo: e.emirNo, malzemeNo: e.malzemeNo, adet: e.adet, durum: gorunenDurum(e.durum, kendi.some((i) => i.durum !== 'bekliyor')),
    arsiv: e.arsiv, oncelik: e.oncelik, baslangic: e.baslangic, teslim: e.teslim, saglamAdet: e.saglamAdet, siradakiIsEmriId: siradakiIsEmri(kendi)?.id ?? null,
    kaynakRotaRevizyonId: e.kaynakRotaRevizyonId, siparisSatiriId: e.siparisSatiriId, ustEmirId: e.ustEmirId,
  };
}

export interface FasonHareketiOzeti {
  id: number;
  isEmriId: number;
  uretimEmriId: number;
  firmaId: number;
  yon: 'gidis' | 'donus';
  // Gidişte gönderilen, dönüşte sağlam dönen adet.
  adet: number;
  hurdaAdet: number | null;
  zaman: string;
}

export type FasonIsEmri = s.FasonIsEmri;
export const fasonIsEmirleri = (db: Db): Promise<FasonIsEmri[]> => s.fasonIsEmirleri(db);

// Sevkiyat Tüm işler (960) fason gidiş adayı: sırası gelmiş mi ve gidebilecek adet (adıma giren, ilk adımda emir adedi; gönderilen düşülmez).
// Gidiş kaydıyla aynı hesap (fasonBaglami); kilit almaz, okuma anının değeridir.
export interface FasonGonderimi { siradaki: boolean; gonderilebilir: number; gonderilen: number }
export async function fasonGonderimleri(db: Db, isler: readonly { isEmriId: number; uretimEmriId: number; adet: number }[]): Promise<Map<number, FasonGonderimi>> {
  const sonuc = new Map<number, FasonGonderimi>();
  if (isler.length === 0) return sonuc;
  const hepsi = await s.isEmirleriGetir(db, [...new Set(isler.map((x) => x.uretimEmriId))]);
  const hareketler = await s.fasonHareketleriGetir(db, isler.map((x) => x.isEmriId));
  for (const x of isler) {
    const emrin = hepsi.filter((i) => i.uretimEmriId === x.uretimEmriId);
    const isEmri = emrin.find((i) => i.id === x.isEmriId);
    if (isEmri === undefined) continue;
    const { gonderilen } = fasonOzeti(hareketler.filter((h) => h.isEmriId === x.isEmriId));
    sonuc.set(x.isEmriId, {
      siradaki: siradakiIsEmri(emrin)?.id === x.isEmriId, gonderilen, gonderilebilir: (await adimaGiren(db, x.uretimEmriId, emrin, isEmri)) ?? x.adet,
    });
  }
  return sonuc;
}
// Fason iş emri belgesi (FİE, 960): depo çıkışında basılır, kabul penceresi aynı belgeyle açılır. Şartname kütüphanesi ve emre
// dondurulmuş resim revizyonu henüz yok; ikisi de null gelir, sıfır ya da güncel revizyon yazılmaz. Fason olmayan adımda null.
export interface FasonIsEmriBelgesi {
  emir: { id: number; emirNo: string; urun: { kod: string; ad: string }; adet: number; teslim: string | null };
  adim: { isEmriId: number; opNo: number; ad: string; terminGun: number | null };
  firma: { id: number; kod: string | null; ad: string | null };
  gonderilen: number; gonderilebilir: number;
  sartnameId: null; resimRevizyonId: null;
  qr: string;
}
export async function fasonIsEmriBelgesi(db: Db, isEmriId: number): Promise<FasonIsEmriBelgesi | null> {
  const isEmri = await s.isEmriBul(db, isEmriId);
  if (isEmri === null || isEmri.fasonFirmaId === null) return null;
  const e = await s.ustEmirBul(db, isEmri.uretimEmriId);
  if (e === null) return null;
  const ihlal = refakatIhlali(e.durum);
  if (ihlal !== null) throw cakisma(ihlal);
  const hepsi = await s.isEmirleriGetir(db, [e.id]);
  const firma = (await firmaOzetleri(db, [isEmri.fasonFirmaId])).get(isEmri.fasonFirmaId);
  return {
    emir: { id: e.id, emirNo: e.emirNo, urun: { kod: e.parcaNo, ad: e.parcaAd }, adet: e.adet, teslim: e.teslim },
    adim: { isEmriId, opNo: isEmri.opNo, ad: isEmri.ad, terminGun: isEmri.terminGun },
    firma: { id: isEmri.fasonFirmaId, kod: firma?.kod ?? null, ad: firma?.ad ?? null },
    gonderilen: fasonOzeti(await s.fasonHareketleriGetir(db, [isEmriId])).gonderilen,
    gonderilebilir: (await adimaGiren(db, e.id, hepsi, isEmri)) ?? e.adet,
    sartnameId: null, resimRevizyonId: null,
    qr: refakatQrMetni(e.id),
  };
}
export const fasonGecmisi = (db: Db, secim: { firmaId?: number; malzemeNo?: number; sonGun?: number } = {}): Promise<s.FasonGecmisSatiri[]> =>
  s.fasonGecmisiGetir(db, { firmaId: secim.firmaId ?? null, malzemeNo: secim.malzemeNo ?? null, sonGun: secim.sonGun ?? null });

// Stok (K-080) fason transferini bu satırın kimliğine bağlar.
export async function fasonHareketiOzeti(db: Db, id: number): Promise<FasonHareketiOzeti | null> {
  const h = await s.fasonHareketiBul(db, id);
  if (h === null) return null;
  const i = await s.isEmriBul(db, h.isEmriId);
  if (i === null || i.fasonFirmaId === null) return null;
  return { id: h.id, isEmriId: h.isEmriId, uretimEmriId: i.uretimEmriId, firmaId: i.fasonFirmaId, yon: h.yon, adet: h.adet, hurdaAdet: h.hurdaAdet, zaman: h.zaman };
}

// Stokun eski emir özeti (EmirOzeti.istasyonId sayıdır) iş emirli emirde de dolu kalsın: satırdaki istasyon yoksa son başlamış,
// o da yoksa istasyonu olan ilk iş emrininki. Hiçbiri yoksa null (emir henüz hiçbir istasyona düşmemiştir).
export async function emrinIstasyonu(db: Db, emirId: number): Promise<number | null> {
  const kendi = await s.isEmirleriGetir(db, [emirId]);
  const baslamis = kendi.filter((i) => i.baslama !== null && i.istasyonId !== null).sort((a, b) => b.sira - a.sira)[0];
  return baslamis?.istasyonId ?? kendi.find((i) => i.istasyonId !== null)?.istasyonId ?? null;
}

// Refakat kartının verisi ayrıntıyla aynı kaynaktan gelir; alt partide üst emrin numarası da yazılır.
export async function refakatKarti(db: Db, id: number): Promise<RefakatKartiCevabi> {
  const e = await adimliAyrinti(db, id);
  const ihlal = refakatIhlali(e.durum);
  if (ihlal !== null) throw cakisma(ihlal);
  const ustId = e.parti?.ustEmirId ?? null;
  const ustEmirNo = ustId === null ? null : (await s.emirNolariGetir(db, [ustId]))[0]?.emirNo ?? null;
  return {
    emirId: e.id, qr: refakatQrMetni(e.id), emirNo: e.emirNo, urun: { kod: e.urun.kod, ad: e.urun.ad }, adet: e.adet, teslim: e.teslim,
    parti: { ustEmirNo, bolunmeSira: e.parti?.bolunmeSira ?? null },
    adimlar: e.isEmirleri.map((i) => ({
      opNo: i.opNo, ad: i.ad, yer: i.istasyon?.ad ?? (i.kaynak?.tur === 'fason' ? i.kaynak.ad : null), fason: i.kaynak?.tur === 'fason',
    })),
  };
}

// Proje maliyeti (197 a) için okuma: çağıranın db'si, yetki çağıran uçta. İstasyon adı istasyonlar modülünden.
export interface ProjeIsEmri {
  isEmriId: number; uretimEmriId: number; emirNo: string; opNo: number; istasyonId: number | null; istasyonAd: string | null;
  kaynakTur: 'makine' | 'kisi' | 'fason' | null; adet: number; saglam: number | null; birimSureDk: string | null; ayarSureDk: string | null;
  durum: 'bekliyor' | 'calisiyor' | 'tamam'; emirDurumu: s.ProjeIsEmriSatiri['emirDurumu']; bitis: string | null; siparisSatiriId: number | null;
}
export async function projeninIsEmirleri(db: Db, projeId: number): Promise<ProjeIsEmri[]> {
  const satirlar = await s.projeninIsEmirleriGetir(db, projeId);
  const adlar = await istasyonAdlari(db, [...new Set(satirlar.flatMap((x) => (x.istasyonId === null ? [] : [x.istasyonId])))]);
  return satirlar.map(({ makineId, kisiId, fasonFirmaId, ...x }) => ({
    ...x, istasyonAd: x.istasyonId === null ? null : adlar.get(x.istasyonId) ?? null,
    kaynakTur: makineId !== null ? 'makine' : kisiId !== null ? 'kisi' : fasonFirmaId !== null ? 'fason' : null,
  }));
}

export interface IsEmriSuresi { islemeSn: number; ayarSn: number | null; katilim: { kisiId: number; saniye: number }[] }
export async function isEmriSureleri(db: Db, idler: readonly number[]): Promise<Map<number, IsEmriSuresi>> {
  if (idler.length === 0) return new Map();
  return new Map((await s.isEmriSureleriGetir(db, idler)).map(({ isEmriId, ...x }) => [isEmriId, x]));
}

