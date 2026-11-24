import type { TezgahAyrintisiCevabi } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';

type Alan = TezgahAyrintisiCevabi['alanlar'][number];
export type Eksen = 'X' | 'Y' | 'Z';
export const EKSENLER: readonly Eksen[] = ['X', 'Y', 'Z'];
type Nokta = Alan['egri'][number];

export interface EksenSerisi {
  eksen: Eksen;
  birim: string | null;
  // Anlık değer; sayı değilse null (sıfır uydurulmaz).
  simdi: number | null;
  nokta: Nokta[];
}

// Eksen konumu: Linear bileşeninde Position türü; eksen adı bileşen adından gelir (X, Y, Z). Servis yayınlamıyorsa liste boştur.
export function eksenleriBul(alanlar: readonly Alan[]): EksenSerisi[] {
  const sonuc: EksenSerisi[] = [];
  for (const e of EKSENLER) {
    const a = alanlar.find((x) => x.tur === 'Position' && x.bilesenAdi?.toUpperCase() === e);
    if (a === undefined) continue;
    const n = a.deger === null || a.deger.trim() === '' ? Number.NaN : Number(a.deger);
    sonuc.push({ eksen: e, birim: a.birim, simdi: Number.isFinite(n) ? n : null, nokta: a.egri });
  }
  return sonuc;
}

// Geri oynatma anları: eksen eğrilerindeki dakikalık zamanların birleşimi (en eskiden yeniye).
export function oynatmaAnlari(seriler: readonly EksenSerisi[]): string[] {
  return [...new Set(seriler.flatMap((s) => s.nokta.map((p) => p.zaman)))].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
}

// O ana kadarki son bilinen değer; ilk noktadan önce değer yoktur (null).
export function anDegeri(s: EksenSerisi, zaman: string): number | null {
  const t = new Date(zaman).getTime();
  let son: number | null = null;
  for (const p of s.nokta) if (new Date(p.zaman).getTime() <= t) son = p.deger;
  return son;
}

// Çizim ölçeği son bir saatte görülen hareket aralığıdır (gerçek strok bilinmez); hareket yoksa orta.
export function oranla(deger: number | null, seri: EksenSerisi): number {
  if (deger === null) return 0.5;
  const hepsi = [...seri.nokta.map((p) => p.deger), ...(seri.simdi === null ? [] : [seri.simdi])];
  const enAz = Math.min(...hepsi);
  const enCok = Math.max(...hepsi);
  return enCok - enAz < 1e-9 ? 0.5 : (deger - enAz) / (enCok - enAz);
}

// Boşluk dakikası: o dakikanın (bir önceki dakika ile arasındaki) aralığında veri boşluğu kaydı varsa konum bilinmez; son bilinen değer gösterilmez.
export function bosluktaMi(bosluklar: readonly { zaman: string }[], an: string, onceki: string | null): boolean {
  const bitis = new Date(an).getTime();
  const baslangic = onceki === null ? bitis - 60_000 : new Date(onceki).getTime();
  return bosluklar.some((b) => {
    const t = new Date(b.zaman).getTime();
    return t > baslangic && t <= bitis;
  });
}
