import type { z } from 'zod';
import type { ayarGuncelleGovdesi, ayarSemasi } from '#paylasilan/sozlesme/finans.ts';

export type Ayar = z.infer<typeof ayarSemasi>;
export type AyarGovdesi = z.input<typeof ayarGuncelleGovdesi>;
export type AyarDegisikligi = Partial<Omit<AyarGovdesi, 'surum'>>;

const sayi = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
// Prototipte bos birakilan istege bagli tutar sifir degil "girilmedi"dir (null).
const bosIse = (v: unknown) => { const n = Number(v); return v === null || v === undefined || !Number.isFinite(n) || n === 0 ? null : n; };

/**
 * Prototipin ayarGovdesi karsiligi: kayitli ayarin butun alanlari, ustune degisiklik.
 * sirketAdi: satin almadaki ad doluysa o gonderilir (A7); caprazKurPayi yalniz degisiklikte varsa gider.
 */
export function ayarGovdesi(a: Ayar, sirketAdi: string | null, ek: AyarDegisikligi = {}): AyarGovdesi {
  return {
    sirketAdi: sirketAdi ?? a.sirketAdi, sektor: a.sektor, nakitEsigi: sayi(a.nakitEsigi),
    beklenenAylikSatis: bosIse(a.beklenenAylikSatis), beklenenTahsilGunu: a.beklenenTahsilGunu ?? null,
    riskToleransi: a.riskToleransi, simulasyonSayisi: a.simulasyonSayisi, cekKarsiliksizOlasiligi: sayi(a.cekKarsiliksizOlasiligi),
    batikGunu: a.batikGunu, anomaliEsigi: sayi(a.anomaliEsigi),
    agirlikLikidite: a.agirlikLikidite, agirlikNakit: a.agirlikNakit, agirlikKarlilik: a.agirlikKarlilik,
    agirlikVerimlilik: a.agirlikVerimlilik, agirlikBorcluluk: a.agirlikBorcluluk,
    bilancoDonen: bosIse(a.bilancoDonen), bilancoStok: bosIse(a.bilancoStok), bilancoKvb: bosIse(a.bilancoKvb),
    bilancoToplamBorc: bosIse(a.bilancoToplamBorc), bilancoOzkaynak: bosIse(a.bilancoOzkaynak), bilancoBirikmisKar: bosIse(a.bilancoBirikmisKar),
    kurulumTamam: a.kurulumTamam, surum: a.surum, ...ek,
  };
}

/** "Esigi 1 aylik sabit gidere ayarla": duzenli odemelerin toplami, 10.000'e yuvarli. */
export const onerilenEsik = (aylikSabit: number) => Math.round(aylikSabit / 10000) * 10000;
