// 3398 (surum 4 a): Stok kontrol sayfasının stok tarafı: ölçüyle arama ve kesimden kalan artık parça. Kartın biçimi ve ölçüsü
// Malzemeler'den okunur; miktar ve artık stoktadır. Arama yazmaz.
import { type Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, eskiSurum, gecersiz } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import {
  FORM_OLCULERI, OLCU_ANAHTARLARI, OLCULU_FORMLAR, type ArtikParcaCevabi, type ArtikParcalarCevabi, type IhtiyacDurumu, type IhtiyaclarCevabi, type IhtiyacSatiri, type OlcuAdayi, type OlcuAramaCevabi, type OlculuForm,
  type OlcuAnahtari, type artikParcaGovdesi, type artikParcaKapatGovdesi, type artikParcalarSorgusu, type olcuAramaSorgusu,
} from '#paylasilan/sozlesme/stok-kontrol.ts';
import type { z } from 'zod';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { stokKontroluKalemleri } from '../../satin-alma/disari.ts';
import { hammaddeStokOlculeri, malzemeOzetleri, type HammaddeStokOlcusu } from '../../malzemeler/disari.ts';
import { adaySirala, artikOlcusu, artikPayi, karsilanan, olcuEslestir, type OlcuIstegi } from '../olcu-kurallar.ts';
import * as sorgular from '../sorgular.ts';

const olculuMu = (f: string): f is OlculuForm => (OLCULU_FORMLAR as readonly string[]).includes(f);
const sayiNesnesi = (o: Readonly<Record<string, unknown>>): Record<string, number> =>
  Object.fromEntries(Object.entries(o).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1])));
const kesitTamMi = (form: OlculuForm, o: Readonly<Record<string, unknown>>) => FORM_OLCULERI[form].kesit.every((k) => typeof o[k] === 'number' && (o[k] as number) > 0);
// Pay dışı adaylardan en çok bu kadarı gösterilir (gri, "neden olmadı" için).
const PAY_DISI_SINIRI = 3;

// onbellek: ihtiyaç kuyruğu aynı formun kartlarını her kalemde yeniden okumasın diye (form -> kartlar).
export async function olcuyleAra(db: Db, s: z.output<typeof olcuAramaSorgusu>, onbellek?: Map<string, HammaddeStokOlcusu[]>): Promise<OlcuAramaCevabi> {
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
    const pay = paylar.get(st.malzemeId) ?? 0;
    const kalan = Number(st.miktar) - (pay ?? 0);
    if (kalan <= 1e-9) continue;
    const a = aday(k, {
      kaynak: 'stok', olcu: sayiNesnesi(k.olcu), miktar: String(Math.round(kalan * 10000) / 10000), birim: ozetler.get(st.malzemeId)?.birim ?? null, konumlar: st.konumlar,
      artikId: null, ilkGiris: st.ilkGiris,
    }, k.yogunluk);
    if (a !== null) adaylar.push(a);
  }
  for (const ar of artiklar) {
    const k = kartHaritasi.get(ar.malzemeId);
    if (k === undefined || paylar.get(ar.malzemeId) === null) continue;
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

// 3398-2: ihtiyaç kuyruğu. Teklif istenmeden önceki satın alma kalemleri stokla karşılaştırılır; yalnız okur. Ölçülü hammadde kartında
// kartın kendi ölçüsü ve kalitesiyle arama yapılır (adet biriminde istenen boy kadar çubuk), ölçüsüz kartta yalnız aynı kartın stoğu.
const IHTIYAC_SINIRI = 100;
const ayniBirim = (a: string | null, b: string | null) => a !== null && b !== null && a.trim().toLocaleLowerCase('tr') === b.trim().toLocaleLowerCase('tr');
function ihtiyacDurumu(karsilanan: number | null, gereken: number): IhtiyacDurumu {
  if (karsilanan === null) return 'bilinmiyor';
  if (karsilanan + 1e-9 >= gereken) return 'karsilanir';
  return karsilanan > 0 ? 'kismen' : 'yok';
}
export async function ihtiyaclar(db: Db): Promise<IhtiyaclarCevabi> {
  const l = await stokKontroluKalemleri(db, IHTIYAC_SINIRI + 1);
  const kalemler = l.slice(0, IHTIYAC_SINIRI);
  const nolar = [...new Set(kalemler.map((k) => k.malzemeNo))];
  if (nolar.length === 0) return { satirlar: [], sinirli: false };
  const hepsi = await hammaddeStokOlculeri(db, OLCULU_FORMLAR);
  const kartlar = new Map(hepsi.map((k) => [k.malzemeNo, k]));
  const onbellek = new Map<string, HammaddeStokOlcusu[]>(OLCULU_FORMLAR.map((f) => [f, hepsi.filter((k) => k.form === f)]));
  const ozetler = await malzemeOzetleri(db, nolar);
  const stoklar = new Map((await sorgular.kullanilabilirStoklar(db, nolar)).map((x) => [x.malzemeId, x]));
  const satirlar: IhtiyacSatiri[] = [];
  for (const k of kalemler) {
    const kart = kartlar.get(k.malzemeNo);
    const ozet = ozetler.get(k.malzemeNo);
    const gereken = Number(k.miktar);
    const temel = {
      kaynak: 'satin-alma' as const, talepId: k.talepId, talepNo: k.talepNo, baslik: k.baslik, kalemId: k.kalemId, ad: k.ad, malzemeNo: k.malzemeNo,
      kod: ozet?.kod ?? String(k.malzemeNo), miktar: k.miktar, birim: k.birim, uretimEmriId: k.uretimEmriId, ihtiyacTarihi: k.ihtiyacTarihi,
    };
    if (kart === undefined || !olculuMu(kart.form) || !kesitTamMi(kart.form, kart.olcu)) {
      const st = stoklar.get(k.malzemeNo);
      const karsilanan = ayniBirim(ozet?.birim ?? null, k.birim) ? Math.min(gereken, Number(st?.miktar ?? 0)) : null;
      satirlar.push({ ...temel, form: kart?.form ?? null, kalite: kart?.kalite ?? null, olcu: kart === undefined ? {} : sayiNesnesi(kart.olcu),
        durum: ihtiyacDurumu(karsilanan, gereken), karsilanan, enIyi: null, adaySayisi: st === undefined ? 0 : 1 });
      continue;
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
    const r = await olcuyleAra(db, sorgu, onbellek);
    const icinde = r.adaylar.filter((a) => a.durum !== 'pay-disi');
    let karsilanan: number | null = null;
    if (adetli && (f.boy === null || boy !== undefined)) karsilanan = r.karsilanan;
    else if (icinde.length > 0 && icinde.every((a) => a.kaynak === 'stok' && ayniBirim(a.birim, k.birim))) {
      karsilanan = Math.min(gereken, icinde.reduce((t, a) => t + Number(a.miktar), 0));
    } else if (icinde.length === 0) karsilanan = 0;
    satirlar.push({ ...temel, form, kalite: kart.kalite, olcu: o, durum: ihtiyacDurumu(karsilanan, gereken), karsilanan,
      enIyi: icinde[0] ?? null, adaySayisi: icinde.length });
  }
  return { satirlar, sinirli: l.length > IHTIYAC_SINIRI };
}
