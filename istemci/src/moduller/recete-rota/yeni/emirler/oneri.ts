import type { AcilisSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';

// 3657: yeni emir formunun miktar ve teslim önerisi. Kaynak, sunucunun bu ürün için bağlayacağı sipariş satırlarıdır
// (acilis-secenekleri); proje terminini siparişten aldığı için termin satırın terminidir. Öneri değiştirilebilir, zorunlu değer değildir.
export interface OneriAdayi {
  projeId: number; projeKod: string; siparisNo: string; satirId: number; satirNo: number;
  adet: number; acik: number; kalan: number; termin: string | null;
}

const sayi = (m: string | undefined): number => {
  const n = Number(m);
  return Number.isFinite(n) ? n : 0;
};

export function oneriAdaylari(secenekler: AcilisSecenekleri | undefined): OneriAdayi[] {
  return (secenekler?.projeler ?? []).flatMap((p) => p.satirlar.map((s) => {
    const adet = sayi(s.adet);
    const acik = sayi(s.acikEmirAdedi);
    return { projeId: p.id, projeKod: p.kod, siparisNo: s.siparisNo, satirId: s.id, satirNo: s.satirNo, adet, acik, kalan: Math.max(adet - acik, 0), termin: s.termin };
  }));
}

// Miktar önerisi kalan adettir (satır adedi eksi açık emirler); satır tamamen açılmışsa miktar önerilmez (sıfır uydurulmaz).
export function oneriDegerleri(a: OneriAdayi): { miktar: string | null; teslim: string | null } {
  return { miktar: a.kalan > 0 && Number.isInteger(a.kalan) ? String(a.kalan) : null, teslim: a.termin };
}

// Teslim satırın terminden farklıysa sunucu emri satıra bağsız açar (kalemTeslimi); ekran bunu söyler.
export const teslimBagsizMi = (teslim: string, a: OneriAdayi | null): boolean => a !== null && a.termin !== null && teslim !== a.termin;
