import type { CagriEkibi, Kategori } from '#paylasilan/sozlesme/durus-nedenleri.ts';

export const DURUS_ONEKI = 'D';
export const HURDA_ONEKI = 'H';

export interface CagriDegerleri {
  kategori: Kategori;
  cagriEkibi: CagriEkibi | null;
  cagriGecikmeDk: number | null;
}

export type CagriSonucu = { hata: string } | { cagriEkibi: CagriEkibi | null; cagriGecikmeDk: number | null };

// Planlı nedende çağrı tanımlanmaz, gelen silinir (DN-07, DN-08); plansızda ekip ve gecikme birlikte dolu ya da boştur.
export function cagriyiDuzenle({ kategori, cagriEkibi, cagriGecikmeDk }: CagriDegerleri): CagriSonucu {
  if (kategori === 'planli') return { cagriEkibi: null, cagriGecikmeDk: null };
  if ((cagriEkibi === null) !== (cagriGecikmeDk === null)) {
    return { hata: 'Çağrı ekibi ile gecikmesi birlikte girilmeli ya da ikisi de boş bırakılmalı.' };
  }
  return { cagriEkibi, cagriGecikmeDk };
}

// Önek artı var olan en büyük sayının bir fazlası (DN-09); biçime uymayan kod sayılmaz.
export function kodOner(onek: string, kodlar: readonly string[]): string {
  const desen = new RegExp(`^${onek}-(\\d{1,9})$`);
  let enBuyuk = 0;
  for (const kod of kodlar) {
    const sayi = desen.exec(kod)?.[1];
    if (sayi !== undefined) enBuyuk = Math.max(enBuyuk, Number(sayi));
  }
  return `${onek}-${String(enBuyuk + 1).padStart(2, '0')}`;
}
