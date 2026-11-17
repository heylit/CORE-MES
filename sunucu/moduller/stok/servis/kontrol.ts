// 3398 (surum 4 a): Stok kontrol sayfasının stok tarafı: ölçüyle arama ve kesimden kalan artık parça. Kartın biçimi ve ölçüsü
// Malzemeler'den okunur; miktar ve artık stoktadır. Arama yazmaz.
import { type Db } from '#cekirdek/db.ts';
import { bulunamadi, dogrulama, eskiSurum, gecersiz } from '#cekirdek/hata.ts';
import { kisitKorumali } from '#cekirdek/kisit.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import {
  FORM_OLCULERI, OLCU_ANAHTARLARI, OLCULU_FORMLAR, type ArtikParcaCevabi, type ArtikParcalarCevabi, type OlcuAdayi, type OlcuAramaCevabi, type OlculuForm,
  type OlcuAnahtari, type artikParcaGovdesi, type artikParcaKapatGovdesi, type artikParcalarSorgusu, type olcuAramaSorgusu,
} from '#paylasilan/sozlesme/stok-kontrol.ts';
import type { z } from 'zod';
import { kisiAdlari } from '../../kisiler/disari.ts';
import { hammaddeStokOlculeri, malzemeOzetleri, type HammaddeStokOlcusu } from '../../malzemeler/disari.ts';
import { adaySirala, artikOlcusu, artikPayi, karsilanan, olcuEslestir, type OlcuIstegi } from '../olcu-kurallar.ts';
import * as sorgular from '../sorgular.ts';

const olculuMu = (f: string): f is OlculuForm => (OLCULU_FORMLAR as readonly string[]).includes(f);
const sayiNesnesi = (o: Readonly<Record<string, unknown>>): Record<string, number> =>
  Object.fromEntries(Object.entries(o).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1])));
const kesitTamMi = (form: OlculuForm, o: Readonly<Record<string, unknown>>) => FORM_OLCULERI[form].kesit.every((k) => typeof o[k] === 'number' && (o[k] as number) > 0);
// Pay dışı adaylardan en çok bu kadarı gösterilir (gri, "neden olmadı" için).
const PAY_DISI_SINIRI = 3;

export async function olcuyleAra(db: Db, s: z.output<typeof olcuAramaSorgusu>): Promise<OlcuAramaCevabi> {
  const olcu: Partial<Record<OlcuAnahtari, number>> = {};
  for (const k of OLCU_ANAHTARLARI) if (s[k] !== undefined) olcu[k] = s[k];
  const f = FORM_OLCULERI[s.form];
  if (!f.kesit.some((k) => olcu[k] !== undefined)) throw dogrulama('Kesit ölçüsü girilmeli.', f.kesit[0]);
  if (f.en !== null && s.parcaBoyu !== undefined && s.parcaEni === undefined) throw dogrulama('Levhada parçanın eni de girilmeli.', 'parcaEni');
  const istek: OlcuIstegi = {
    form: s.form, olcu, parcaBoyu: s.parcaBoyu ?? null, parcaEni: s.parcaEni ?? null, adet: s.adet ?? null,
    pay: { tur: s.pay, deger: s.payDeger, enAzMm: s.payEnAzMm }, kesmeMm: s.kesmeMm,
  };
  const butun = await hammaddeStokOlculeri(db, [s.form]);
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
