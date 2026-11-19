// 3398 (surum 4 a): Stok kontrol sayfasının stok tarafı: ölçüyle arama ve kesimden kalan artık parça. Kartın biçimi ve ölçüsü
// Malzemeler'den okunur; miktar ve artık stoktadır. Arama yazmaz.
import { type Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, eskiSurum, gecersiz } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import {
  FORM_OLCULERI, OLCU_ANAHTARLARI, OLCULU_FORMLAR, type AyirmaCevabi, type AyirmaIstekleriCevabi, type ayirmaIlerletGovdesi, type ayirmaIptalGovdesi,
  type ayirmaIstekleriSorgusu, type stoktanKarsilaGovdesi, type ArtikParcaCevabi, type ArtikParcalarCevabi, type IhtiyacDurumu, type IhtiyaclarCevabi, type IhtiyacSatiri, type OlcuAdayi, type OlcuAramaCevabi, type OlculuForm,
  type OlcuAnahtari, type artikParcaGovdesi, type artikParcaKapatGovdesi, type artikParcalarSorgusu, type olcuAramaSorgusu,
} from '#paylasilan/sozlesme/stok-kontrol.ts';
import type { z } from 'zod';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { kalemiStoktanGeriAl, kalemiStoktanKarsila, stokKontroluKalemleri, type StokKontroluKalemi } from '../../satin-alma/disari.ts';
import { hammaddeStokOlculeri, malzemeOzetleri, type HammaddeStokOlcusu } from '../../malzemeler/disari.ts';
import { adaySirala, artikOlcusu, artikPayi, karsilanan, olcuEslestir, parcaIcinStok, type OlcuIstegi } from '../olcu-kurallar.ts';
import * as sorgular from '../sorgular.ts';

const olculuMu = (f: string): f is OlculuForm => (OLCULU_FORMLAR as readonly string[]).includes(f);
const sayiNesnesi = (o: Readonly<Record<string, unknown>>): Record<string, number> =>
  Object.fromEntries(Object.entries(o).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1])));
const kesitTamMi = (form: OlculuForm, o: Readonly<Record<string, unknown>>) => FORM_OLCULERI[form].kesit.every((k) => typeof o[k] === 'number' && (o[k] as number) > 0);
// Pay dışı adaylardan en çok bu kadarı gösterilir (gri, "neden olmadı" için).
const PAY_DISI_SINIRI = 3;

// onbellek: ihtiyaç kuyruğu aynı formun kartlarını her kalemde yeniden okumasın diye (form -> kartlar).
// Açık ayırma isteklerinin tuttuğu stok: malzeme başına stok biriminde miktar ve ayrılmış artıklar.
export interface Ayrilan { stok: Map<number, number>; artik: Set<number> }
async function ayrilanOku(db: Db): Promise<Ayrilan> {
  const a: Ayrilan = { stok: new Map(), artik: new Set() };
  for (const k of await sorgular.acikAyirmaKaynaklari(db)) {
    if (k.artikId !== null) a.artik.add(k.artikId);
    else if (k.stokMiktari !== null) a.stok.set(k.malzemeNo, (a.stok.get(k.malzemeNo) ?? 0) + k.stokMiktari);
  }
  return a;
}

export async function olcuyleAra(db: Db, s: z.output<typeof olcuAramaSorgusu>, onbellek?: Map<string, HammaddeStokOlcusu[]>, ayrilanHazir?: Ayrilan): Promise<OlcuAramaCevabi> {
  const olcu: Partial<Record<OlcuAnahtari, number>> = {};
  for (const k of OLCU_ANAHTARLARI) if (s[k] !== undefined) olcu[k] = s[k];
  const f = FORM_OLCULERI[s.form];
  if (!f.kesit.some((k) => olcu[k] !== undefined)) throw dogrulama('Kesit ölçüsü girilmeli.', f.kesit[0]);
  if (f.en !== null && s.parcaBoyu !== undefined && s.parcaEni === undefined) throw dogrulama('Levhada parçanın eni de girilmeli.', 'parcaEni');
  const istek: OlcuIstegi = {
    form: s.form, olcu, parcaBoyu: s.parcaBoyu ?? null, parcaEni: s.parcaEni ?? null, adet: s.adet ?? null,
    pay: { tur: s.pay, deger: s.payDeger, enAzMm: s.payEnAzMm }, kesmeMm: s.kesmeMm,
  };
  const butun = onbellek?.get(s.form) ?? await hammaddeStokOlculeri(db, [s.form]);
  onbellek?.set(s.form, butun);
  const kaliteler = [...new Set(butun.flatMap((k) => (k.kalite === null ? [] : [k.kalite])))].sort((x, y) => x.localeCompare(y, 'tr'));
  const kartlar = s.kalite === undefined ? butun : butun.filter((k) => k.kalite === s.kalite);
  const olcusuzKart = kartlar.filter((k) => !kesitTamMi(s.form, k.olcu)).length;
  const olculu = kartlar.filter((k) => kesitTamMi(s.form, k.olcu));
  const nolar = olculu.map((k) => k.malzemeNo);
  const stoklar = nolar.length === 0 ? [] : await sorgular.kullanilabilirStoklar(db, nolar);
  const ayrilan = ayrilanHazir ?? await ayrilanOku(db);
  const artiklar = nolar.length === 0 || s.artik !== 'evet' ? [] : await sorgular.acikArtiklar(db, nolar);
  const ozetler = await malzemeOzetleri(db, nolar);
  const kartHaritasi = new Map(olculu.map((k) => [k.malzemeNo, k]));
  const aday = (k: HammaddeStokOlcusu, a: Omit<OlcuAdayi, 'malzemeNo' | 'kod' | 'ad' | 'kalite' | 'form' | 'durum' | 'fazla' | 'fireYuzde' | 'parcaSayisi'>,
    yogunluk: number | null): OlcuAdayi | null => {
    const e = olcuEslestir(istek, { kaynak: a.kaynak, olcu: a.olcu, miktar: Number(a.miktar), birim: a.birim, yogunluk, ilkGiris: a.ilkGiris });
    return e === null ? null : { ...a, malzemeNo: k.malzemeNo, kod: k.kod, ad: k.ad, kalite: k.kalite, form: s.form, ...e };
  };
  // Artık bakiyenin parçasıdır: stok adayından artığın payı düşülür; payı hesaplanamayan malzemenin artığı ayrıca sayılmaz (çift sayma olmaz).
  const paylar = new Map<number, number | null>();
  for (const ar of artiklar) {
    const k = kartHaritasi.get(ar.malzemeId);
    if (k === undefined) continue;
    const p = artikPayi(s.form, sayiNesnesi(ar.olcu), ar.adet, ozetler.get(ar.malzemeId)?.birim ?? null, k.yogunluk);
    const once = paylar.get(ar.malzemeId);
    paylar.set(ar.malzemeId, once === null || p === null ? null : (once ?? 0) + p);
  }
  const adaylar: OlcuAdayi[] = [];
  for (const st of stoklar) {
    const k = kartHaritasi.get(st.malzemeId);
    if (k === undefined) continue;
    // Ayırma isteğinin tuttuğu stok miktarı da düşülür; ayrılmış artığın payı yukarıda zaten düşüldü.
    const pay = paylar.get(st.malzemeId) ?? 0;
    const kalan = Number(st.miktar) - (pay ?? 0) - (ayrilan.stok.get(st.malzemeId) ?? 0);
    if (kalan <= 1e-9) continue;
    const a = aday(k, {
      kaynak: 'stok', olcu: sayiNesnesi(k.olcu), miktar: String(Math.round(kalan * 10000) / 10000), birim: ozetler.get(st.malzemeId)?.birim ?? null, konumlar: st.konumlar,
      artikId: null, ilkGiris: st.ilkGiris,
    }, k.yogunluk);
    if (a !== null) adaylar.push(a);
  }
  for (const ar of artiklar) {
    const k = kartHaritasi.get(ar.malzemeId);
    if (k === undefined || paylar.get(ar.malzemeId) === null || ayrilan.artik.has(ar.id)) continue;
    const a = aday(k, {
      kaynak: 'artik', olcu: sayiNesnesi(ar.olcu), miktar: String(ar.adet), birim: 'adet', konumlar: [ar.konumKod], artikId: ar.id, ilkGiris: ar.kayitZamani,
    }, k.yogunluk);
    if (a !== null) adaylar.push(a);
  }
  const sirali = adaySirala(adaylar);
  const icinde = sirali.filter((a) => a.durum !== 'pay-disi');
  const disi = sirali.filter((a) => a.durum === 'pay-disi').slice(0, PAY_DISI_SINIRI);
  return { adaylar: [...icinde, ...disi], karsilanan: karsilanan(istek.adet, icinde), gereken: istek.adet, olcusuzKart, kaliteler };
}

const ARTIK_SINIRI = 500;
export async function artikParcaListesi(db: Db, s: z.output<typeof artikParcalarSorgusu>): Promise<ArtikParcalarCevabi> {
  const l = await sorgular.artikParcalar(db, { malzemeId: s.malzemeNo ?? null, durum: s.durum }, ARTIK_SINIRI + 1);
  const satirlar = l.slice(0, ARTIK_SINIRI);
  const nolar = [...new Set(satirlar.map((r) => r.malzemeId))];
  const ozetler = await malzemeOzetleri(db, nolar);
  const kisiler = await kisiAdlari(db, [...new Set(satirlar.map((r) => r.kaydedenKisiId))]);
  const olculer = nolar.length === 0 ? [] : await hammaddeStokOlculeri(db, OLCULU_FORMLAR);
  const formlar = new Map(olculer.map((k) => [k.malzemeNo, k.form]));
  return {
    sinirli: l.length > ARTIK_SINIRI,
    satirlar: satirlar.map((r) => ({
      id: r.id, malzemeNo: r.malzemeId, kod: ozetler.get(r.malzemeId)?.kod ?? String(r.malzemeId), ad: ozetler.get(r.malzemeId)?.ad ?? null,
      form: formlar.get(r.malzemeId) ?? null, konumId: r.konumId, konumKod: r.konumKod, partiId: r.partiId, olcu: sayiNesnesi(r.olcu), adet: r.adet,
      durum: r.durum, aciklama: r.aciklama, kaydeden: kisiler.get(r.kaydedenKisiId) ?? null, kayitZamani: r.kayitZamani, surum: r.surum,
    })),
  };
}

const ARTIK_KISITLARI = {
  stok_artik_parca_parti_malzemesi: { ileti: 'Parti bu malzemenin değil.', alan: 'partiId' },
  stok_artik_parca_konum_var: { ileti: 'Konum bulunamadı.', alan: 'konumId' },
} as const;

// Kesimden kalan parçayı kaydeder. Bakiye değişmez (artık bakiyedeki malzemenin bir parçasıdır); kart aktif ölçülü hammadde olmalı.
export function artikParcaKaydet(db: Db, k: Kullanici, g: z.output<typeof artikParcaGovdesi>): Promise<ArtikParcaCevabi> {
  return kisitKorumali(ARTIK_KISITLARI, async () => {
    const kart = (await hammaddeStokOlculeri(db, OLCULU_FORMLAR)).find((x) => x.malzemeNo === g.malzemeNo);
    if (kart === undefined || !olculuMu(kart.form)) throw gecersiz('Artık parça yalnız ölçüsü girilmiş aktif hammadde kartında tutulur.');
    if (!(await sorgular.konumAktifMi(db, g.konumId))) throw dogrulama('Konum bulunamadı ya da pasif.', 'konumId');
    const o = artikOlcusu(kart.form, kart.olcu, g.boy, g.en);
    if ('hata' in o) throw dogrulama(o.hata, 'boy');
    const r = await sorgular.artikParcaEkle(db, { malzemeId: g.malzemeNo, konumId: g.konumId, partiId: g.partiId, olcu: o.olcu, adet: g.adet, aciklama: g.aciklama, kisiId: k.id });
    if (r === null) throw new Error('Artık parça yazılamadı.');
    return r;
  });
}

export async function artikParcaKapat(db: Db, k: Kullanici, id: number, g: z.output<typeof artikParcaKapatGovdesi>): Promise<ArtikParcaCevabi> {
  const r = await sorgular.artikParcaKapat(db, id, g.surum, g.durum, k.id);
  if (r !== null) return r;
  const v = await sorgular.artikParcaVarMi(db, id);
  if (v === null) throw bulunamadi('Artık parça bulunamadı.');
  if (v.durum !== 'acik') throw gecersiz('Artık parça zaten kapatılmış.');
  throw eskiSurum();
}

// 3398-2: ihtiyaç kuyruğu. Teklif istenmeden önceki satın alma kalemleri stokla karşılaştırılır. Ölçülü hammadde kartında kartın kendi
// ölçüsü ve kalitesiyle arama yapılır (adet biriminde istenen boy kadar çubuk), ölçüsüz kartta yalnız aynı kartın stoğu. Açık ayırma
// isteklerinin tuttuğu stok düşülür.
const IHTIYAC_SINIRI = 100;
const ayniBirim = (a: string | null, b: string | null) => a !== null && b !== null && a.trim().toLocaleLowerCase('tr') === b.trim().toLocaleLowerCase('tr');
function ihtiyacDurumu(karsilanan: number | null, gereken: number): IhtiyacDurumu {
  if (karsilanan === null) return 'bilinmiyor';
  if (karsilanan + 1e-9 >= gereken) return 'karsilanir';
  return karsilanan > 0 ? 'kismen' : 'yok';
}
interface Baglam {
  kartlar: Map<number, HammaddeStokOlcusu>; onbellek: Map<string, HammaddeStokOlcusu[]>; ozetler: Awaited<ReturnType<typeof malzemeOzetleri>>;
  stoklar: Map<number, sorgular.KullanilabilirStokHam>; ayrilan: Ayrilan;
}
async function baglamKur(db: Db, nolar: number[]): Promise<Baglam> {
  const hepsi = await hammaddeStokOlculeri(db, OLCULU_FORMLAR);
  const ozetler = await malzemeOzetleri(db, nolar);
  const stoklar = new Map((await sorgular.kullanilabilirStoklar(db, nolar)).map((x) => [x.malzemeId, x]));
  return {
    kartlar: new Map(hepsi.map((k) => [k.malzemeNo, k])), onbellek: new Map(OLCULU_FORMLAR.map((f) => [f, hepsi.filter((k) => k.form === f)])),
    ozetler, stoklar, ayrilan: await ayrilanOku(db),
  };
}
// Kalemin değerlendirmesi ve karşılamada kullanılacak kaynaklar (sıra: en uygun aday önce).
interface Degerlendirme {
  satir: IhtiyacSatiri;
  // Kalemin biriminde karşılanabilecek her kaynak: ölçülü adetli kalemde parça, ötekinde stok birimi = kalem birimi.
  kaynaklar: { aday: OlcuAdayi | null; malzemeNo: number; kod: string; kapasite: number; konumlar: string[] }[];
  // Ölçülü adetli kalemde parça başına stok çevirisi için.
  parca: { form: OlculuForm; parcaBoyu: number | null; parcaEni: number | null; kesmeMm: number } | null;
}
async function kalemiDegerlendir(db: Db, k: StokKontroluKalemi, b: Baglam): Promise<Degerlendirme> {
  const kart = b.kartlar.get(k.malzemeNo);
  const ozet = b.ozetler.get(k.malzemeNo);
  const gereken = Number(k.miktar);
  const temel = {
    kaynak: 'satin-alma' as const, talepId: k.talepId, talepNo: k.talepNo, baslik: k.baslik, kalemId: k.kalemId, ad: k.ad, malzemeNo: k.malzemeNo,
    kod: ozet?.kod ?? String(k.malzemeNo), miktar: k.miktar, birim: k.birim, uretimEmriId: k.uretimEmriId, ihtiyacTarihi: k.ihtiyacTarihi,
    engel: k.engel,
  };
  if (kart === undefined || !olculuMu(kart.form) || !kesitTamMi(kart.form, kart.olcu)) {
    const st = b.stoklar.get(k.malzemeNo);
    const birimTutar = ayniBirim(ozet?.birim ?? null, k.birim);
    const eldeki = Math.max(0, Number(st?.miktar ?? 0) - (b.ayrilan.stok.get(k.malzemeNo) ?? 0));
    const karsilanan = birimTutar ? Math.min(gereken, eldeki) : null;
    return {
      satir: { ...temel, form: kart?.form ?? null, kalite: kart?.kalite ?? null, olcu: kart === undefined ? {} : sayiNesnesi(kart.olcu),
        durum: ihtiyacDurumu(karsilanan, gereken), karsilanan, enIyi: null, adaySayisi: st === undefined || eldeki <= 1e-9 ? 0 : 1 },
      kaynaklar: birimTutar && eldeki > 1e-9 ? [{ aday: null, malzemeNo: k.malzemeNo, kod: temel.kod, kapasite: eldeki, konumlar: st?.konumlar ?? [] }] : [],
      parca: null,
    };
  }
  const form = kart.form;
  const f = FORM_OLCULERI[form];
  const o = sayiNesnesi(kart.olcu);
  const adetli = ayniBirim(k.birim, 'adet') && Number.isInteger(gereken) && gereken > 0;
  const boy = f.boy === null ? undefined : o[f.boy];
  const en = f.en === null ? undefined : o[f.en];
  const sorgu: z.output<typeof olcuAramaSorgusu> = {
    form, artik: 'evet', pay: 'yuzde', payDeger: 15, payEnAzMm: 3, kesmeMm: 0,
    ...(kart.kalite === null ? {} : { kalite: kart.kalite }),
    ...Object.fromEntries(f.kesit.map((a) => [a, o[a]])),
    ...(adetli ? { adet: gereken } : {}),
    ...(adetli && boy !== undefined ? { parcaBoyu: boy } : {}),
    ...(adetli && en !== undefined ? { parcaEni: en } : {}),
  };
  const r = await olcuyleAra(db, sorgu, b.onbellek, b.ayrilan);
  const icinde = r.adaylar.filter((a) => a.durum !== 'pay-disi');
  let karsilanan: number | null = null;
  let kaynaklar: Degerlendirme['kaynaklar'] = [];
  let parca: Degerlendirme['parca'] = null;
  if (adetli && (f.boy === null || boy !== undefined)) {
    karsilanan = r.karsilanan;
    kaynaklar = icinde.flatMap((a) => (a.parcaSayisi === null || a.parcaSayisi <= 0 ? [] : [{ aday: a, malzemeNo: a.malzemeNo, kod: a.kod, kapasite: a.parcaSayisi, konumlar: a.konumlar }]));
    parca = { form, parcaBoyu: sorgu.parcaBoyu ?? null, parcaEni: sorgu.parcaEni ?? null, kesmeMm: sorgu.kesmeMm };
  } else if (icinde.length > 0 && icinde.every((a) => a.kaynak === 'stok' && ayniBirim(a.birim, k.birim))) {
    karsilanan = Math.min(gereken, icinde.reduce((t, a) => t + Number(a.miktar), 0));
    kaynaklar = icinde.map((a) => ({ aday: a, malzemeNo: a.malzemeNo, kod: a.kod, kapasite: Number(a.miktar), konumlar: a.konumlar }));
  } else if (icinde.length === 0) karsilanan = 0;
  return {
    satir: { ...temel, form, kalite: kart.kalite, olcu: o, durum: ihtiyacDurumu(karsilanan, gereken), karsilanan, enIyi: icinde[0] ?? null, adaySayisi: icinde.length },
    kaynaklar, parca,
  };
}
export async function ihtiyaclar(db: Db): Promise<IhtiyaclarCevabi> {
  const l = await stokKontroluKalemleri(db, IHTIYAC_SINIRI + 1);
  const kalemler = l.slice(0, IHTIYAC_SINIRI);
  if (kalemler.length === 0) return { satirlar: [], sinirli: false };
  const b = await baglamKur(db, [...new Set(kalemler.map((k) => k.malzemeNo))]);
  const satirlar: IhtiyacSatiri[] = [];
  for (const k of kalemler) satirlar.push((await kalemiDegerlendir(db, k, b)).satir);
  return { satirlar, sinirli: l.length > IHTIYAC_SINIRI };
}

// ---- 3398-2 a: stoktan karşıla. Depoya ayırma isteği açılır, talep kalemi karşılanan kadar azalır (tamamı karşılanırsa teklife gitmez). ----
// Emre otomatik rezerve yok: stok rezervi rota adımının statüsüne bağlıdır, statüsüz hammadde emre ayrılamaz; depo isteği "ayrıldı" diye işaretler.
const yuvarla4 = (x: number) => Math.round(x * 10000) / 10000;
export async function stoktanKarsila(db: Db, kul: Kullanici, g: z.output<typeof stoktanKarsilaGovdesi>): Promise<AyirmaCevabi> {
  await sorgular.ayirmaKilidi(db);
  const [k] = await stokKontroluKalemleri(db, 1, { talepId: g.talepId, kalemId: g.kalemId });
  if (k === undefined) throw bulunamadi('Teklif istenmemiş talepte bu kalem bulunamadı.');
  if (k.engel !== null) throw gecersiz('Bu kalem Logo, iş emri, kalıp, satış siparişi ya da teklife bağlı; stoktan karşılanamaz.');
  const b = await baglamKur(db, [k.malzemeNo]);
  const d = await kalemiDegerlendir(db, k, b);
  const istenen = Number(g.miktar);
  if (d.parca !== null && !Number.isInteger(istenen)) throw dogrulama('Parça sayısı tam sayı olmalı.', 'miktar');
  if (d.satir.karsilanan === null || istenen > d.satir.karsilanan + 1e-9) {
    throw dogrulama(d.satir.karsilanan === null ? 'Bu kalemin stoktaki karşılığı hesaplanamıyor.' : `Stoktan en çok ${d.satir.karsilanan} ${k.birim} karşılanır.`, 'miktar');
  }
  const kaynaklar: sorgular.AyirmaKaynagiHam[] = [];
  let kalan = istenen;
  for (const x of d.kaynaklar) {
    if (kalan <= 1e-9) break;
    const al = Math.min(kalan, x.kapasite);
    const artikId = x.aday?.artikId ?? null;
    let stokMiktari: number | null = null;
    if (artikId === null) {
      if (d.parca === null) stokMiktari = al;
      else if (x.aday !== null) stokMiktari = parcaIcinStok(d.parca.form, x.aday.olcu, al, d.parca, x.aday.birim, b.kartlar.get(x.malzemeNo)?.yogunluk ?? null);
      if (stokMiktari === null) throw gecersiz(`${x.kod} için ayrılacak stok miktarı hesaplanamıyor.`);
    }
    kaynaklar.push({ malzemeNo: x.malzemeNo, artikId, stokMiktari: stokMiktari === null ? null : yuvarla4(stokMiktari), karsilanan: al, konumlar: x.konumlar });
    kalan -= al;
  }
  if (kaynaklar.length === 0 || kalan > 1e-9) throw dogrulama('Stokta bu kadar karşılık kalmadı.', 'miktar');
  const azalan = await kalemiStoktanKarsila(db, g.talepId, g.kalemId, g.miktar, kul.id);
  const r = await sorgular.ayirmaIstegiEkle(db, {
    talepId: g.talepId, kalemId: g.kalemId, talepNo: k.talepNo, kalemAd: k.ad, malzemeId: k.malzemeNo, miktar: g.miktar, birim: azalan.birim,
    uretimEmriId: azalan.uretimEmriId, kaynaklar, kalemSatiri: azalan.satir, kisiId: kul.id,
  });
  if (r === null) throw new Error('Ayırma isteği yazılamadı.');
  return { ...r, durum: 'bekliyor', geriEklendi: null };
}

const AYIRMA_SINIRI = 200;
export async function ayirmaIstekleriListesi(db: Db, s: z.output<typeof ayirmaIstekleriSorgusu>): Promise<AyirmaIstekleriCevabi> {
  const l = await sorgular.ayirmaIstekleri(db, s.durum === 'acik', AYIRMA_SINIRI + 1);
  const satirlar = l.slice(0, AYIRMA_SINIRI);
  const nolar = [...new Set(satirlar.flatMap((r) => [r.malzemeId, ...r.kaynaklar.map((x) => x.malzemeNo)]))];
  const ozetler = await malzemeOzetleri(db, nolar);
  const kisiler = await kisiAdlari(db, [...new Set(satirlar.flatMap((r) => (r.kararKisiId === null ? [r.isteyenKisiId] : [r.isteyenKisiId, r.kararKisiId])))]);
  const kod = (n: number) => ozetler.get(n)?.kod ?? String(n);
  return {
    sinirli: l.length > AYIRMA_SINIRI,
    satirlar: satirlar.map((r) => ({
      id: r.id, kaynak: r.kaynak, talepId: r.talepId, kalemId: r.kalemId, siparisId: r.siparisId, talepNo: r.talepNo, kalemAd: r.kalemAd, malzemeNo: r.malzemeId, kod: kod(r.malzemeId), miktar: r.miktar,
      birim: r.birim, uretimEmriId: r.uretimEmriId, kaynaklar: r.kaynaklar.map((x) => ({ ...x, kod: kod(x.malzemeNo) })), durum: r.durum,
      iptalNedeni: r.iptalNedeni, geriEklendi: r.geriEklendi, isteyen: kisiler.get(r.isteyenKisiId) ?? null, istekZamani: r.istekZamani,
      karar: r.kararKisiId === null ? null : kisiler.get(r.kararKisiId) ?? null, kararZamani: r.kararZamani, surum: r.surum,
    })),
  };
}

async function acikIstek(db: Db, id: number, surum: number): Promise<sorgular.AyirmaIstegiHam> {
  const r = await sorgular.ayirmaIstegiKilitle(db, id);
  if (r === null) throw bulunamadi('Ayırma isteği bulunamadı.');
  if (r.surum !== surum) throw eskiSurum();
  return r;
}
// Depo: bekleyen isteği ayırır, ayrılanı teslim eder. Teslim stok çıkışı değildir; çıkış her zamanki stok çıkışıyla yazılır.
export async function ayirmaIlerlet(db: Db, kul: Kullanici, id: number, g: z.output<typeof ayirmaIlerletGovdesi>): Promise<AyirmaCevabi> {
  const r = await acikIstek(db, id, g.surum);
  const once = g.durum === 'ayrildi' ? 'bekliyor' : 'ayrildi';
  if (r.durum !== once) throw gecersiz(g.durum === 'ayrildi' ? 'Yalnız bekleyen istek ayrılır.' : 'Yalnız ayrılmış istek teslim edilir.');
  const y = await sorgular.ayirmaIstegiIlerlet(db, id, g.durum, kul.id);
  if (y === null) throw new Error('Ayırma isteği yazılamadı.');
  return { ...y, durum: g.durum, geriEklendi: null };
}
// İptal: ayrılan stok serbest kalır, miktar talep kalemine geri eklenir. Talep teklif aşamasına geçtiyse ya da kalem çıkarıldıysa eklenemez;
// istek yine iptal olur, cevap bunu söyler.
export async function ayirmaIptal(db: Db, kul: Kullanici, id: number, g: z.output<typeof ayirmaIptalGovdesi>): Promise<AyirmaCevabi> {
  const r = await acikIstek(db, id, g.surum);
  if (r.durum !== 'bekliyor' && r.durum !== 'ayrildi') throw gecersiz('Teslim edilmiş ya da iptal edilmiş istek iptal edilemez.');
  // Sipariş kaynağında geri eklenecek talep yoktur; sipariş kalemi yerinde kalır.
  const geriEklendi = r.kaynak === 'siparis' || r.talepId === null || r.kalemId === null
    ? false : await kalemiStoktanGeriAl(db, r.talepId, r.kalemId, r.miktar, r.kalemSatiri, kul.id);
  const y = await sorgular.ayirmaIstegiIptal(db, id, g.neden, geriEklendi, kul.id);
  if (y === null) throw new Error('Ayırma isteği yazılamadı.');
  return { ...y, durum: 'iptal', geriEklendi };
}

// ---- 3429-3 F2: satış siparişinin "Stoktan" kalemi. Onaylı siparişin her stoktan kalemi için en çok bir açık ayırma isteği olur.
// Açılacak miktar kalem miktarından teslim edilenler düşülerek bulunur ve eldeki kullanılabilir stokla (açık isteklerin tuttuğu düşülür)
// sınırlanır; stok yoksa istek açılmaz, onay reddedilmez. Açık istek varken ek istek açılmaz (kısmi istek kalır, kalan için depo ya
// da satın alma). Bekleyen istek kalanı aşarsa (miktar düştü) iptal edilip kalan kadar yeniden açılır; ayrılmış isteğe dokunulmaz.
// Depo bir isteği kendi nedeniyle iptal ettiyse o kaleme yeniden istek açılmaz. Sipariş onaylı değilse (onay geri alındı, iptal,
// kapandı) ya da kalem stoktan çıktıysa açık istek iptal olur.
export interface SiparisAyirmaKalemi { id: number; malzemeNo: number; ad: string; miktar: string; birim: string | null; stoktan: boolean }
export interface SiparisAyirmaGirdisi { siparisId: number; siparisNo: string; onayli: boolean; kalemler: readonly SiparisAyirmaKalemi[] }
export const SIPARIS_AYIRMA_NEDENI = {
  kapandi: 'Sipariş artık onaylı değil (onay geri alındı, iptal ya da kapandı).',
  yolDegisti: 'Sipariş kalemi artık stoktan karşılanmıyor.',
  miktarDegisti: 'Sipariş kaleminin miktarı azaldı; istek kalan kadar yeniden açıldı.',
} as const;
const SISTEM_NEDENLERI: readonly string[] = Object.values(SIPARIS_AYIRMA_NEDENI);
const acikMi = (r: sorgular.AyirmaIstegiHam) => r.durum === 'bekliyor' || r.durum === 'ayrildi';
export async function siparisAyirmalariniEsitle(db: Db, kisiId: number, g: SiparisAyirmaGirdisi): Promise<void> {
  await sorgular.ayirmaKilidi(db);
  const hepsi = await sorgular.siparisAyirmalari(db, g.siparisId);
  const kalemler = new Map((g.onayli ? g.kalemler.filter((k) => k.stoktan) : []).map((k) => [k.id, k]));
  const iptal = async (r: sorgular.AyirmaIstegiHam, neden: string) => {
    if ((await sorgular.ayirmaIstegiIptal(db, r.id, neden, false, kisiId)) === null) throw new Error('Ayırma isteği yazılamadı.');
  };
  const acilacak: { k: SiparisAyirmaKalemi; miktar: number }[] = [];
  for (const r of hepsi) {
    if (acikMi(r) && (r.siparisSatiriId === null || !kalemler.has(r.siparisSatiriId))) await iptal(r, g.onayli ? SIPARIS_AYIRMA_NEDENI.yolDegisti : SIPARIS_AYIRMA_NEDENI.kapandi);
  }
  for (const k of kalemler.values()) {
    const ait = hepsi.filter((r) => r.siparisSatiriId === k.id);
    if (ait.some((r) => r.durum === 'iptal' && !SISTEM_NEDENLERI.includes(r.iptalNedeni ?? ''))) continue;
    const kalan = Number(k.miktar) - ait.filter((r) => r.durum === 'teslim').reduce((t, r) => t + Number(r.miktar), 0);
    const acik = ait.find(acikMi);
    if (acik !== undefined) {
      if (acik.durum === 'ayrildi' || Number(acik.miktar) <= kalan + 1e-9) continue;
      await iptal(acik, SIPARIS_AYIRMA_NEDENI.miktarDegisti);
    }
    if (kalan > 1e-9) acilacak.push({ k, miktar: kalan });
  }
  if (acilacak.length === 0) return;
  const nolar = [...new Set(acilacak.map((a) => a.k.malzemeNo))];
  const stoklar = new Map((await sorgular.kullanilabilirStoklar(db, nolar)).map((x) => [x.malzemeId, x]));
  const ozetler = await malzemeOzetleri(db, nolar);
  const ayrilan = await ayrilanOku(db);
  for (const { k, miktar } of acilacak) {
    const st = stoklar.get(k.malzemeNo);
    const kartBirimi = ozetler.get(k.malzemeNo)?.birim ?? null;
    const birim = k.birim ?? kartBirimi;
    if (st === undefined || birim === null || !ayniBirim(kartBirimi ?? birim, birim)) continue;
    const eldeki = Math.max(0, Number(st.miktar) - (ayrilan.stok.get(k.malzemeNo) ?? 0));
    const al = yuvarla4(Math.min(miktar, eldeki));
    if (al <= 1e-9) continue;
    const r = await sorgular.siparisAyirmaIstegiEkle(db, {
      siparisId: g.siparisId, siparisSatiriId: k.id, siparisNo: g.siparisNo, kalemAd: k.ad.slice(0, 160), malzemeId: k.malzemeNo, miktar: String(al), birim,
      kaynaklar: [{ malzemeNo: k.malzemeNo, artikId: null, stokMiktari: al, karsilanan: al, konumlar: st.konumlar }], kisiId,
    });
    if (r === null) throw new Error('Ayırma isteği yazılamadı.');
    ayrilan.stok.set(k.malzemeNo, (ayrilan.stok.get(k.malzemeNo) ?? 0) + al);
  }
}
