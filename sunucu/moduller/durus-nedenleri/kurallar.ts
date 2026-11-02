import { SABIT_HURDA_KODLARI } from '#paylasilan/sozlesme/durus-nedenleri-sabitleri.ts';
import type { CagriEkibi, Kategori } from '#paylasilan/sozlesme/durus-nedenleri.ts';

export { FIRMADA_HURDA_KODU, FIRMADAN_GELMEDI_KODU, SABIT_HURDA_KODLARI } from '#paylasilan/sozlesme/durus-nedenleri-sabitleri.ts';

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

// Önek artı var olan en büyük sayının bir fazlası (DN-09); biçime uymayan kod sayılmaz. Hane sınırı yok: kod 12 karakterle sınırlı
// olduğundan sayı güvenli tamsayıya sığar; sınır konursa sınırı aşan var olan kod sayılmaz ve öneri onunla çakışır.
export function kodOner(onek: string, kodlar: readonly string[]): string {
  const desen = new RegExp(`^${onek}-(\\d+)$`);
  let enBuyuk = 0;
  for (const kod of kodlar) {
    const sayi = desen.exec(kod)?.[1];
    if (sayi !== undefined) enBuyuk = Math.max(enBuyuk, Number(sayi));
  }
  return `${onek}-${String(enBuyuk + 1).padStart(2, '0')}`;
}

export const SABIT_KOD_DEGISMEZ = 'Bu hatalı türünün kodu sabittir (fason dönüşü); adı ve aktifliği değişebilir.';
export const sabitKodEngeli = (eskiKod: string, yeniKod: string): string | null =>
  SABIT_HURDA_KODLARI.includes(eskiKod) && eskiKod !== yeniKod ? SABIT_KOD_DEGISMEZ : null;
