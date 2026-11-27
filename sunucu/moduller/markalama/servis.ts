import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum, gecersiz } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import { surumluGuncelle } from '#cekirdek/surum.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ACIK_EMIR_DURUMLARI } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type {
  BirimAyrintisi, BirimDurumu, BirimlerCevabi, DogrulaGovdesi, DurumGovdesi, EmirAraCevabi, EmirOzetiCevabi, EmirSecimi, IsTanimiCevabi,
  MarkalaGovdesi, MarkalamaBirimi, MarkalamaTanimi, OnizlemeCevabi, OperasyonlarCevabi, TanimAktiflikGovdesi, TanimEkleGovdesi,
  TanimEmirleriCevabi, TanimKaydetGovdesi, TanimlarCevabi,
} from '#paylasilan/sozlesme/markalama.ts';
import type { KayitAramaSonucu } from '#paylasilan/sayfa-tanimi.ts';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { kaydaBagliBelgeler } from '../belge-merkezi/disari.ts';
import { hurdaNedeniGetir } from '../durus-nedenleri/disari.ts';
import { istasyonGetir, istasyonlar as istasyonListesi } from '../istasyonlar/disari.ts';
import { kisiAdlari } from '../kisiler/disari.ts';
import { malzemeOzeti, malzemeOzetleri } from '../malzemeler/disari.ts';
import { acikEmirler, emirAdimlari, emirNolari, parcaRevizyonuMetni, uretimEmriOzeti } from '../uretim-emirleri/disari.ts';
import {
  alanHatasi, baslangicHatasi, durumGecisi, emreOzelRevizyonHatasi, hurdaNedeniHatasi, kapsamAnahtari, normalHatasi, olcuHatasi, revizyonAnahtari,
  sablonCakismasi, sablonHatasi, seriAlaniVarMi, seriNoUret, seriUzunlukHatasi, tanimSec,
} from './kurallar.ts';
import type { SablonAdayi, TanimSecimi } from './kurallar.ts';
import * as s from './sorgular.ts';

const TANIM_YOK = 'Markalama tanımı bulunamadı.';
const BIRIM_YOK = 'Seri no bulunamadı.';
const BIRIM_LISTE_SINIRI = 500;

// Tanım rota operasyonuna bağlıdır (3250 b). Rota aynı kattadır, markalama onu ithal edemez (ADR 0006): yürürlükteki revizyonun
// operasyonlarını (bugünkü numara, numara defterindeki kayıtlı numara) rota verir, bağı sunucu/kablolama.ts kurar. Bağ yoksa tanım
// yazıldığı numarayla gösterilir; yazma bağsız geçmez (operasyonu bilinmeyen tanım sessizce eski anahtarla yazılmasın). Yetki denetlemez.
export interface MarkalamaOperasyonu { malzemeId: number; operasyonId: number; opNo: number; kayitliOpNo: number; ad?: string }
export type OperasyonCozucusu = (db: Db, malzemeIdleri: readonly number[]) => Promise<readonly MarkalamaOperasyonu[]>;
let operasyonlar: OperasyonCozucusu | null = null;
// Önceki çözücüyü döner (test kurup geri koyar).
export function operasyonCozucusuKaydet(cozucu: OperasyonCozucusu | null): OperasyonCozucusu | null {
  const onceki = operasyonlar;
  operasyonlar = cozucu;
  return onceki;
}
const yururlukteOperasyonlar = async (db: Db, malzemeIdleri: readonly number[]): Promise<readonly MarkalamaOperasyonu[]> =>
  operasyonlar === null || malzemeIdleri.length === 0 ? [] : operasyonlar(db, malzemeIdleri);
export const OPERASYON_BAGI_YOK = 'Markalama: rota operasyon çözücüsü bağlanmadı (sunucu/kablolama.ts).';
function yazmaCozucusu(): OperasyonCozucusu {
  if (operasyonlar === null) throw new Error(OPERASYON_BAGI_YOK);
  return operasyonlar;
}

async function tanimlariKur(db: Db, satirlar: s.TanimSatiri[]): Promise<MarkalamaTanimi[]> {
  const alanlar = await s.alanlariOku(db, satirlar.map((t) => t.id));
  const emirler = await emirNolari(db, [...new Set(satirlar.flatMap((t) => (t.uretimEmriId === null ? [] : [t.uretimEmriId])))]);
  const malzemeler = await malzemeOzetleri(db, satirlar.map((t) => t.malzemeId));
  // Tanım operasyona bağlıdır; gösterilen numara rotanın bugünkü numarasıdır (3250 b), rotada olmayan operasyonda yazıldığı numara.
  const guncel = new Map((await yururlukteOperasyonlar(db, [...new Set(satirlar.map((t) => t.malzemeId))])).map((o): [number, number] => [o.operasyonId, o.opNo]));
  return satirlar.map((t) => ({
    id: t.id, malzemeId: t.malzemeId, malzemeKodu: malzemeler.get(t.malzemeId)?.kod ?? null, opNo: (t.operasyonId === null ? undefined : guncel.get(t.operasyonId)) ?? t.opNo,
    uretimEmriId: t.uretimEmriId, emirNo: t.uretimEmriId === null ? null : emirler.get(t.uretimEmriId) ?? null, cizimRevizyonKodu: t.cizimRevizyonKodu,
    seriSablonu: t.seriSablonu, sayacKapsami: t.sayacKapsami, baslangicSirasi: t.baslangicSirasi, dogrulama: t.dogrulama, aktif: t.aktif,
    model: t.modelBelgeId === null || t.modelRevizyon === null ? null : { belgeId: t.modelBelgeId, revizyon: t.modelRevizyon },
    alanlar: alanlar.get(t.id) ?? [], surum: t.surum, degismeZamani: t.degismeZamani,
  }));
}

async function varOlanTanim(db: Db, id: number): Promise<s.TanimSatiri> {
  const t = await s.tanimOku(db, id);
  if (t === null) throw bulunamadi(TANIM_YOK);
  return t;
}

export async function tanimlar(db: Db, malzemeId: number | null): Promise<TanimlarCevabi> {
  return { tanimlar: await tanimlariKur(db, await s.tanimlariOku(db, malzemeId)) };
}

export async function tanimGetir(db: Db, id: number): Promise<MarkalamaTanimi> {
  const [t] = await tanimlariKur(db, [await varOlanTanim(db, id)]);
  if (t === undefined) throw bulunamadi(TANIM_YOK);
  return t;
}

function tanimYazimi(g: TanimKaydetGovdesi | TanimEkleGovdesi): s.TanimYazimi {
  const sablon = sablonHatasi(g.seriSablonu, g.sayacKapsami);
  if (sablon !== null) throw dogrulama(sablon, 'seriSablonu');
  const alan = alanHatasi(g.alanlar);
  if (alan !== null) throw dogrulama(alan, 'alanlar');
  const normal = normalHatasi(g.alanlar);
  if (normal !== null) throw dogrulama(normal.ileti, normal.alan);
  const olcu = olcuHatasi(g.alanlar);
  if (olcu !== null) throw dogrulama(olcu.ileti, olcu.alan);
  return {
    seriSablonu: g.seriSablonu, sayacKapsami: g.sayacKapsami, baslangicSirasi: g.baslangicSirasi, dogrulama: g.dogrulama,
    modelBelgeId: g.model?.belgeId ?? null, modelRevizyon: g.model?.revizyon ?? null,
  };
}

// MRK-12: 3B model, tanımın malzemesine bağlı çizim belgesidir (yabancı anahtar Aşama 2'de). Revizyon harfi denetlenmez:
// merkez yalnız yayındaki revizyonu dışa veriyor, ekran taslak revizyonu da seçebiliyor.
async function modelDenetle(db: Db, malzemeId: number, model: TanimEkleGovdesi['model']): Promise<void> {
  if (model === null) return;
  const bagli = await kaydaBagliBelgeler(db, 'malzemeler', malzemeId);
  if (!bagli.some((b) => b.id === model.belgeId)) throw dogrulama('3B model bu malzemeye bağlı bir çizim belgesi değil.', 'model');
}

// MRK-11: kayıtta en uzun açık emrin numarasıyla denenir; emir sonradan uzarsa markalamadaki denetim yakalar.
async function seriUzunluguDenetle(db: Db, malzemeId: number, g: TanimKaydetGovdesi | TanimEkleGovdesi): Promise<void> {
  const malzeme = await malzemeOzeti(db, malzemeId);
  if (malzeme === null) return;
  const emir = (await acikEmirler(db)).filter((e) => e.malzemeNo === malzemeId).reduce((en, e) => (e.emirNo.length > en.length ? e.emirNo : en), '');
  const seriNo = seriNoUret(g.seriSablonu, { parca: malzeme.kod, emir, gun: tesisGunu(Date.now()) }, g.baslangicSirasi);
  const hata = seriUzunlukHatasi(seriNo);
  if (hata !== null) throw dogrulama(hata, 'seriSablonu');
}

// MRK-2: kural kurallar.ts sablonCakismasi'nda. Pasif tanım da sayılır: verdiği numaralar duruyor.
async function ayniSablonDenetle(db: Db, malzemeId: number, yeni: SablonAdayi): Promise<void> {
  const c = sablonCakismasi(await s.tanimlariOku(db, malzemeId), yeni);
  if (c === null) return;
  throw dogrulama(c.tur === 'baska-operasyon'
    ? `Bu malzemede bu seri şablonuyla tanım var (op ${c.onceki.opNo}); onu düzenleyin.`
    : `Aynı şablonlu tanımlar aynı sayacı kullanır (op ${c.onceki.opNo} tanımının sayacı: ${c.onceki.sayacKapsami}); sayacı aynı yapın.`, 'seriSablonu');
}

// MRK-15 (3788): emre özel tanım açık, aynı malzemenin emrine açılır; revizyonu emrin sabitlenmiş revizyonudur. Emirsiz tanımın
// revizyonu yazıldığı gibidir (gösterim kuralıyla, "Rev C" -> "C"); boşsa bütün revizyonlarda geçer.
async function tanimAnahtari(db: Db, g: TanimEkleGovdesi): Promise<s.TanimAnahtari> {
  const yazilan = parcaRevizyonuMetni(g.cizimRevizyonKodu);
  if (g.uretimEmriId === null) return { uretimEmriId: null, cizimRevizyonKodu: yazilan };
  const emir = await uretimEmriOzeti(db, g.uretimEmriId);
  if (emir === null) throw dogrulama('Üretim emri bulunamadı.', 'uretimEmriId');
  if (emir.malzemeNo !== g.malzemeId) throw dogrulama('Bu emir tanımın malzemesi için açılmamış.', 'uretimEmriId');
  if (!(ACIK_EMIR_DURUMLARI as readonly string[]).includes(emir.durum)) throw dogrulama('Emir açık değil; emre özel tanım yazılmaz.', 'uretimEmriId');
  const emrinki = parcaRevizyonuMetni(emir.parcaRevizyonKodu);
  const hata = emreOzelRevizyonHatasi(yazilan, emrinki);
  if (hata !== null) throw dogrulama(hata, 'cizimRevizyonKodu');
  return { uretimEmriId: emir.id, cizimRevizyonKodu: emrinki };
}

export async function tanimEkle(db: Db, kullanici: Kullanici, g: TanimEkleGovdesi): Promise<MarkalamaTanimi> {
  const yazim = tanimYazimi(g);
  // MRK-08: tanım var olan malzemeye açılır (rota adımı bağı Aşama 2'de yabancı anahtarla gelir).
  if ((await malzemeOzeti(db, g.malzemeId)) === null) throw dogrulama('Malzeme bulunamadı.', 'malzemeId');
  const o = (await yazmaCozucusu()(db, [g.malzemeId])).find((x) => x.opNo === g.opNo);
  const operasyon = o ? { id: o.operasyonId, kayitliOpNo: o.kayitliOpNo } : null;
  await ayniSablonDenetle(db, g.malzemeId, {
    id: null, opNo: operasyon?.kayitliOpNo ?? g.opNo, operasyonId: operasyon?.id ?? null, seriSablonu: g.seriSablonu, sayacKapsami: g.sayacKapsami,
  });
  await modelDenetle(db, g.malzemeId, g.model);
  await seriUzunluguDenetle(db, g.malzemeId, g);
  const anahtar = await tanimAnahtari(db, g);
  const ADIM_TANIMLI = anahtar.uretimEmriId !== null ? 'Bu emir ve operasyon için markalama tanımı zaten var.'
    : anahtar.cizimRevizyonKodu !== null ? `Bu operasyonun ${anahtar.cizimRevizyonKodu} revizyonu için markalama tanımı zaten var.`
      : 'Bu rota adımının revizyonsuz markalama tanımı zaten var.';
  const id = await kisitKorumali(
    { markalama_tanimi_anahtar_tekil: ADIM_TANIMLI },
    () => s.tanimEkle(db, g.malzemeId, g.opNo, operasyon, anahtar, yazim, kullanici.id),
  );
  if (id === null) throw cakisma(ADIM_TANIMLI);
  await s.alanlariYaz(db, id, g.alanlar);
  return tanimGetir(db, id);
}

// MRK-09: başlangıç sırası her yeni sayacın ilk numarasıdır. Malzeme ve yıl kapsamında bugünkü sayaç zaten başlamışsa
// değişiklik sessizce yok sayılmasın: ileri alınırsa sayaç oraya taşınır, geri alınırsa reddedilir. Emir kapsamında sayaç
// emir başınadır; yeni değer bundan sonra açılan emirlerde geçer.
async function baslangiciUygula(db: Db, malzemeId: number, g: TanimKaydetGovdesi): Promise<void> {
  if (g.sayacKapsami === 'emir') return;
  const anahtar = kapsamAnahtari(g.sayacKapsami, 0, tesisGunu(Date.now()));
  const son = await s.sonSira(db, malzemeId, anahtar);
  const hata = baslangicHatasi(g.baslangicSirasi, son);
  if (hata !== null) throw dogrulama(hata, 'baslangicSirasi');
  if (son !== null) await s.sayaciIlerlet(db, malzemeId, anahtar, g.baslangicSirasi - 1);
}

export async function tanimKaydet(db: Db, kullanici: Kullanici, id: number, g: TanimKaydetGovdesi): Promise<MarkalamaTanimi> {
  const yazim = tanimYazimi(g);
  const eski = await varOlanTanim(db, id);
  // Değişmeyen model yeniden denetlenmez: belge bağı sonradan kalkmış tanımın başka alanı kaydedilebilsin.
  if (g.model !== null && (g.model.belgeId !== eski.modelBelgeId || g.model.revizyon !== eski.modelRevizyon)) {
    await modelDenetle(db, eski.malzemeId, g.model);
  }
  if (g.seriSablonu !== eski.seriSablonu || g.sayacKapsami !== eski.sayacKapsami) {
    await ayniSablonDenetle(db, eski.malzemeId, { id, opNo: eski.opNo, operasyonId: eski.operasyonId, seriSablonu: g.seriSablonu, sayacKapsami: g.sayacKapsami });
  }
  await seriUzunluguDenetle(db, eski.malzemeId, g);
  if (g.baslangicSirasi !== eski.baslangicSirasi) await baslangiciUygula(db, eski.malzemeId, g);
  await surumluGuncelle({
    guncelle: () => s.tanimGuncelle(db, id, { ...yazim, surum: g.surum }, kullanici.id),
    varMi: () => s.tanimVarMi(db, id),
    bulunamadiIletisi: TANIM_YOK,
  });
  await s.alanlariYaz(db, id, g.alanlar);
  return tanimGetir(db, id);
}

export async function tanimAktiflik(db: Db, kullanici: Kullanici, id: number, g: TanimAktiflikGovdesi): Promise<MarkalamaTanimi> {
  await surumluGuncelle({
    guncelle: () => s.tanimAktiflikYaz(db, id, g.aktif, g.surum, kullanici.id),
    varMi: () => s.tanimVarMi(db, id),
    bulunamadiIletisi: TANIM_YOK,
  });
  return tanimGetir(db, id);
}

interface SeriKaynagi { parca: string; emirNo: string }

// Emirsiz önizlemede emir no bilinmez; boş bırakılırsa numara gerçeğe benzer ama yanlış görünür, yer tutucu yazılır.
const EMIR_YER_TUTUCUSU = '{EMIR}';

async function seriKaynagi(db: Db, t: s.TanimSatiri, emirId: number | null): Promise<SeriKaynagi> {
  const malzeme = await malzemeOzeti(db, t.malzemeId);
  if (malzeme === null) throw gecersiz('Tanımın malzemesi bulunamadı.');
  if (emirId === null) return { parca: malzeme.kod, emirNo: EMIR_YER_TUTUCUSU };
  const emir = await uretimEmriOzeti(db, emirId);
  if (emir === null) throw bulunamadi('Üretim emri bulunamadı.');
  // MRK-07: seri yalnız açık emirde ve tanımın malzemesinin emrinde verilir.
  if (emir.malzemeNo !== t.malzemeId) throw gecersiz('Bu emir tanımın malzemesi için açılmamış.');
  if (!(ACIK_EMIR_DURUMLARI as readonly string[]).includes(emir.durum)) throw gecersiz('Emir açık değil; seri verilmez.');
  // MRK-16 (3788): emre özel tanım yalnız kendi emrinde, revizyonlu tanım yalnız o revizyonla sabitlenmiş emirde seri verir.
  if (t.uretimEmriId !== null && t.uretimEmriId !== emir.id) throw gecersiz('Bu tanım başka bir emre özel; seri verilmez.');
  if (t.cizimRevizyonKodu !== null && revizyonAnahtari(t.cizimRevizyonKodu) !== revizyonAnahtari(parcaRevizyonuMetni(emir.parcaRevizyonKodu))) {
    throw gecersiz(`Bu tanım teknik resim ${t.cizimRevizyonKodu} revizyonu için; emrin revizyonu farklı, seri verilmez.`);
  }
  return { parca: malzeme.kod, emirNo: emir.emirNo };
}

export async function tanimEmirleri(db: Db, tanimId: number): Promise<TanimEmirleriCevabi> {
  const t = await varOlanTanim(db, tanimId);
  const emirler = (await acikEmirler(db)).filter((e) => e.malzemeNo === t.malzemeId);
  return { emirler: emirler.map((e) => ({ id: e.id, emirNo: e.emirNo, adet: e.adet, durum: e.durum })) };
}

const EMIR_ARAMA_SINIRI = 20;

async function emirSecimleri(db: Db, emirler: readonly { id: number; emirNo: string; malzemeNo: number; adet: number; durum: string }[]): Promise<EmirSecimi[]> {
  const malzemeler = await malzemeOzetleri(db, [...new Set(emirler.map((e) => e.malzemeNo))]);
  const sonuc: EmirSecimi[] = [];
  for (const e of emirler) {
    const ozet = await uretimEmriOzeti(db, e.id);
    sonuc.push({
      id: e.id, emirNo: e.emirNo, malzemeId: e.malzemeNo, malzemeKodu: malzemeler.get(e.malzemeNo)?.kod ?? null, adet: e.adet, durum: e.durum,
      cizimRevizyonKodu: parcaRevizyonuMetni(ozet?.parcaRevizyonKodu ?? null),
    });
  }
  return sonuc;
}

// Açık emirler emir no ya da parça no parçasıyla; malzemesi olmayan (rotasız) emir markalanmaz, listelenmez.
export async function emirAra(db: Db, metin: string): Promise<EmirAraCevabi> {
  const aranan = metin.toLocaleUpperCase('tr');
  const bulunan = (await acikEmirler(db))
    .flatMap((e) => (e.malzemeNo == null ? [] : [{ ...e, malzemeNo: e.malzemeNo }]))
    .filter((e) => e.emirNo.toLocaleUpperCase('tr').includes(aranan) || e.parcaNo.toLocaleUpperCase('tr').includes(aranan))
    .sort((a, b) => Number(b.emirNo.toLocaleUpperCase('tr') === aranan) - Number(a.emirNo.toLocaleUpperCase('tr') === aranan))
    .slice(0, EMIR_ARAMA_SINIRI);
  return { emirler: await emirSecimleri(db, bulunan) };
}

async function acikEmirSecimi(db: Db, emirId: number): Promise<EmirSecimi> {
  const emir = await uretimEmriOzeti(db, emirId);
  if (emir === null) throw bulunamadi('Üretim emri bulunamadı.');
  if (emir.malzemeNo === null) throw gecersiz('Bu emrin malzeme kartı yok; markalanmaz.');
  const [secim] = await emirSecimleri(db, [{ id: emir.id, emirNo: emir.emirNo, malzemeNo: emir.malzemeNo, adet: emir.adet, durum: emir.durum }]);
  if (secim === undefined) throw bulunamadi('Üretim emri bulunamadı.');
  return secim;
}

// Emrin adımları sırasıyla; istasyonu markalama tipinde olan adım işaretlidir (ekran varsayılan olarak yalnız onları gösterir).
export async function emirOperasyonlari(db: Db, emirId: number): Promise<OperasyonlarCevabi> {
  if ((await uretimEmriOzeti(db, emirId)) === null) throw bulunamadi('Üretim emri bulunamadı.');
  const adimlar = await emirAdimlari(db, [emirId]);
  const istasyon = new Map((await istasyonListesi(db, { pasiflerDahil: true })).map((i) => [i.id, i]));
  return {
    operasyonlar: adimlar.map((a) => {
      const i = a.istasyonId === null ? undefined : istasyon.get(a.istasyonId);
      return { opNo: a.opNo, ad: a.ad, istasyonKodu: i?.kod ?? null, markalama: i === undefined ? null : i.tip === 'markalama' };
    }),
  };
}

// Emirsiz tanım: malzemenin yürürlükteki rotası. Rota istasyonu buradan okunmaz; markalama işareti boştur.
export async function malzemeOperasyonlari(db: Db, malzemeId: number): Promise<OperasyonlarCevabi> {
  const ops = await yururlukteOperasyonlar(db, [malzemeId]);
  return { operasyonlar: ops.map((o) => ({ opNo: o.opNo, ad: o.ad ?? `Op ${o.opNo}`, istasyonKodu: null, markalama: null })) };
}

// İşin tanımı (MRK-14): emir ve operasyon için. Terminal ve markalama terminali bununla okur; seçimi sunucu yapar.
// Operasyon numarası bugünkü rotadan okunur: tanım operasyon kimliğiyle bağlıysa numara değişse de aynı adımdadır.
// Hedef ya numaradır ya da bir tanımın kendi adımı (seri verilirken).
async function emirdekiSecim(db: Db, emir: EmirSecimi, hedef: number | s.TanimSatiri): Promise<TanimSecimi> {
  const satirlar = await s.tanimlariOku(db, emir.malzemeId);
  const guncel = new Map((await yururlukteOperasyonlar(db, [emir.malzemeId])).map((o): [number, number] => [o.operasyonId, o.opNo]));
  const no = (t: s.TanimSatiri) => (t.operasyonId === null ? undefined : guncel.get(t.operasyonId)) ?? t.opNo;
  const opNo = typeof hedef === 'number' ? hedef : no(hedef);
  return tanimSec(satirlar.filter((t) => no(t) === opNo), emir.id, emir.cizimRevizyonKodu);
}

export async function isTanimi(db: Db, emirId: number, opNo: number): Promise<IsTanimiCevabi> {
  const emir = await acikEmirSecimi(db, emirId);
  const secim = await emirdekiSecim(db, emir, opNo);
  if (secim.durum !== 'bulundu') return { durum: secim.durum, tanim: null, emir };
  return { durum: 'bulundu', tanim: await tanimGetir(db, secim.id), emir };
}

// MRK-16 (3788): seri yalnız emrin o operasyonu için seçilen tanımdan verilir; emre özel ya da revizyonlu tanım varken genel tanımla
// seri alınamaz (ekranı atlayan istek de).
async function seciliTanimDenetle(db: Db, t: s.TanimSatiri, emirId: number): Promise<void> {
  const emir = await acikEmirSecimi(db, emirId);
  const secim = await emirdekiSecim(db, emir, t);
  if (secim.durum !== 'bulundu' || secim.id !== t.id) throw gecersiz('Bu emirde bu operasyon için başka bir markalama tanımı geçerli; seri verilmez.');
}

// Sıradaki numaralar sayacı tüketmez; gün sunucunun tesis günüdür.
export async function onizleme(db: Db, tanimId: number, emirId: number | null): Promise<OnizlemeCevabi> {
  const t = await varOlanTanim(db, tanimId);
  const k = await seriKaynagi(db, t, emirId);
  const gun = tesisGunu(Date.now());
  // Emir kapsamında emirsiz önizleme, yeni açılacak bir emrin ilk numaralarıdır.
  const yeniEmir = emirId === null && t.sayacKapsami === 'emir';
  const son = yeniEmir ? null : await s.sonSira(db, t.malzemeId, kapsamAnahtari(t.sayacKapsami, emirId ?? 0, gun));
  const ilk = son === null ? t.baslangicSirasi : son + 1;
  return { numaralar: [0, 1, 2].map((i) => seriNoUret(t.seriSablonu, { parca: k.parca, emir: k.emirNo, gun }, ilk + i)) };
}

export async function markala(db: Db, kullanici: Kullanici, g: MarkalaGovdesi): Promise<MarkalamaBirimi> {
  const t = await varOlanTanim(db, g.tanimId);
  if (!t.aktif) throw gecersiz('Bu markalama tanımı pasif; seri verilmez.');
  const alanlar = (await s.alanlariOku(db, [t.id])).get(t.id) ?? [];
  if (!seriAlaniVarMi(alanlar)) throw gecersiz('Bu tanımda seri no taşıyan marka yok; seri verilmez.');
  const k = await seriKaynagi(db, t, g.uretimEmriId);
  await seciliTanimDenetle(db, t, g.uretimEmriId);
  // MRK-12, 2036 a: seri yalnız markalama istasyonunda verilir; istasyon zorunlu, kayıtlı, aktif ve tipi markalama (yabancı anahtar Aşama 2'de).
  // Seri alma yetkisi rol düzeyindedir (2030); hangi tezgâhta verildiğini bu kural sınırlar.
  if (g.istasyonId === null) throw dogrulama('Markalama istasyonu seçin; seri yalnız markalama istasyonunda verilir.', 'istasyonId');
  const istasyon = await istasyonGetir(db, g.istasyonId);
  if (istasyon === null) throw dogrulama('İstasyon bulunamadı.', 'istasyonId');
  if (!istasyon.aktif) throw dogrulama('İstasyon pasif; seri verilmez.', 'istasyonId');
  if (istasyon.tip !== 'markalama') throw dogrulama('Bu istasyon markalama istasyonu değil; seri verilmez.', 'istasyonId');
  const gun = tesisGunu(Date.now());
  const sira = await s.sayaciArtir(db, t.malzemeId, kapsamAnahtari(t.sayacKapsami, g.uretimEmriId, gun), t.baslangicSirasi);
  const seriNo = seriNoUret(t.seriSablonu, { parca: k.parca, emir: k.emirNo, gun }, sira);
  const uzunluk = seriUzunlukHatasi(seriNo);
  if (uzunluk !== null) throw gecersiz(uzunluk);
  const iyi = g.sonuc === 'iyi';
  const birim = await kisitKorumali(
    { markalama_birimi_seri_tekil: 'Bu seri no daha önce verilmiş; şablonu ya da başlangıç sırasını denetleyin.' },
    () => s.birimEkle(db, {
      seriNo, tanimId: t.id, malzemeId: t.malzemeId, uretimEmriId: g.uretimEmriId, istasyonId: g.istasyonId, sira,
      durum: iyi ? 'saglam' : 'hurda',
    }, kullanici.id),
  );
  await s.olayYaz(db, birim.id, iyi ? 'markalandi' : 'hatali_markalama', kullanici.id);
  return birim;
}

// MRK-06: okutulan numara bu tanımda markalanmış olmalı; hurda birim doğrulanmaz. Yinelenen okutma kaydı değiştirmez.
export async function dogrula(db: Db, kullanici: Kullanici, g: DogrulaGovdesi): Promise<MarkalamaBirimi> {
  const birim = await s.seridenBirimOku(db, g.seriNo, true);
  if (birim === null || birim.tanimId !== g.tanimId) throw bulunamadi('Bu numara bu işte markalanmamış.');
  if (birim.durum === 'hurda') throw gecersiz('Hurdaya ayrılmış birim doğrulanmaz.');
  if (birim.dogrulamaZamani !== null) return birim;
  const yeni = await s.birimDogrulandi(db, birim.id);
  if (yeni === null) throw bulunamadi(BIRIM_YOK);
  await s.olayYaz(db, birim.id, 'dogrulandi', kullanici.id);
  return yeni;
}

const OLAY_ADI = { red: 'red', rework: 'rework', kabul: 'kabul', hurda: 'hurda' } as const;

export async function durumDegistir(db: Db, kullanici: Kullanici, id: number, g: DurumGovdesi): Promise<MarkalamaBirimi> {
  const nedenHatasi = hurdaNedeniHatasi(g.komut, g.hurdaNedeniId);
  if (nedenHatasi !== null) throw dogrulama(nedenHatasi, 'hurdaNedeniId');
  const birim = await s.birimOku(db, id, true);
  if (birim === null) throw bulunamadi(BIRIM_YOK);
  if (birim.surum !== g.surum) throw eskiSurum();
  const hedef = durumGecisi(birim.durum, g.komut);
  if (hedef === null) throw cakisma(`Birim "${durumAdi(birim.durum)}" durumundayken bu kayıt girilemez.`);
  if (g.hurdaNedeniId !== null && (await hurdaNedeniGetir(db, g.hurdaNedeniId)) === null) {
    throw dogrulama('Hurda nedeni bulunamadı.', 'hurdaNedeniId');
  }
  const yeni = await s.birimDurumuYaz(db, id, hedef);
  if (yeni === null) throw bulunamadi(BIRIM_YOK);
  await s.olayYaz(db, id, OLAY_ADI[g.komut], kullanici.id, { hurdaNedeniId: g.hurdaNedeniId, aciklama: g.aciklama });
  return yeni;
}

const DURUM_ADLARI: Readonly<Record<BirimDurumu, string>> = { saglam: 'sağlam', red: 'red', rework: 'rework', hurda: 'hurda' };
const durumAdi = (d: BirimDurumu): string => DURUM_ADLARI[d];

export async function birimGetir(db: Db, id: number): Promise<BirimAyrintisi> {
  const birim = await s.birimOku(db, id);
  if (birim === null) throw bulunamadi(BIRIM_YOK);
  const emir = await uretimEmriOzeti(db, birim.uretimEmriId);
  const olaylar = await s.olaylariOku(db, id);
  const kisiler = await kisiAdlari(db, olaylar.map((o) => o.kisiId));
  const nedenIdleri = [...new Set(olaylar.flatMap((o) => (o.hurdaNedeniId === null ? [] : [o.hurdaNedeniId])))];
  const nedenler = new Map<number, string>();
  for (const nid of nedenIdleri) {
    const n = await hurdaNedeniGetir(db, nid);
    if (n !== null) nedenler.set(nid, `${n.kod} · ${n.ad}`);
  }
  return {
    ...birim, emirNo: emir?.emirNo ?? null,
    olaylar: olaylar.map((o) => ({
      ...o, kisiAd: kisiler.get(o.kisiId) ?? null, hurdaNedeni: o.hurdaNedeniId === null ? null : nedenler.get(o.hurdaNedeniId) ?? null,
    })),
  };
}

export async function birimler(
  db: Db, q: { seriNo?: string | undefined; emirId?: number | undefined; tanimId?: number | undefined; durum?: BirimDurumu | undefined },
): Promise<BirimlerCevabi> {
  return {
    birimler: await s.birimleriOku(
      db, { seriNo: q.seriNo ?? null, emirId: q.emirId ?? null, tanimId: q.tanimId ?? null, durum: q.durum ?? null }, BIRIM_LISTE_SINIRI,
    ),
  };
}

// Olmayan emrin özeti sıfırlarla dönmez: sıfır "hiç markalanmadı" demektir, emrin yokluğu bulunamadıdır.
export async function emirOzeti(db: Db, emirId: number, tanimId: number | null): Promise<EmirOzetiCevabi> {
  if ((await uretimEmriOzeti(db, emirId)) === null) throw bulunamadi('Üretim emri bulunamadı.');
  const satirlar = await s.emirSayilari(db, emirId, tanimId);
  const sayilar = { saglam: 0, red: 0, rework: 0, hurda: 0 };
  let dogrulanan = 0;
  for (const r of satirlar) { sayilar[r.durum] = r.adet; dogrulanan += r.dogrulanan; }
  return { uretimEmriId: emirId, sayilar, dogrulanan };
}

const DURUM_ACIKLAMASI: Readonly<Record<BirimDurumu, string>> = { saglam: 'Sağlam', red: 'Red', rework: 'Rework', hurda: 'Hurda' };

export async function seriKayitAra(db: Db, q: string, sinir: number): Promise<KayitAramaSonucu[]> {
  const birimler = await s.seriKayitAra(db, q, sinir);
  const nolar = await emirNolari(db, [...new Set(birimler.map((b) => b.uretimEmriId))]);
  return birimler.map((b) => ({
    anahtar: String(b.id),
    baslik: b.seriNo,
    aciklama: [nolar.get(b.uretimEmriId), DURUM_ACIKLAMASI[b.durum]].filter((x) => x !== undefined).join(' · '),
    yol: `/markalama/izleme?seri=${encodeURIComponent(b.seriNo)}`,
  }));
}
