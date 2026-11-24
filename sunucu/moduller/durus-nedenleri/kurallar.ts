import { SABIT_HURDA_KODLARI } from '#paylasilan/sozlesme/durus-nedenleri-sabitleri.ts';
import { KATEGORILER, KOD_DESENI } from '#paylasilan/sozlesme/durus-nedenleri.ts';
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

export interface TopluDurusGirdisi { kod: string; ad: string; kategori: Kategori; aktif: boolean }
export interface TopluHataGirdisi { kod: string; ad: string; aktif: boolean }

const AZAMI_AD = 80;

function topluAlaniniDuzenle(girdi: unknown, sira: number): { kod: string; ad: string; aktif: boolean; kategori: unknown } | string {
  const onek = `${String(sira + 1)}. satır: `;
  if (typeof girdi !== 'object' || girdi === null) return `${onek}satır biçimsiz.`;
  const { kod, ad, aktif, kategori } = girdi as Record<string, unknown>;
  const duzKod = typeof kod === 'string' ? kod.trim().toUpperCase() : '';
  if (!KOD_DESENI.test(duzKod)) return `${onek}kod en çok 12 karakter olur; büyük harf, rakam ve tire içerir.`;
  const duzAd = typeof ad === 'string' ? ad.trim() : '';
  if (duzAd === '' || duzAd.length > AZAMI_AD) return `${onek}ad 1-${String(AZAMI_AD)} karakter olur.`;
  if (typeof aktif !== 'boolean') return `${onek}aktif doğru ya da yanlış olmalı.`;
  return { kod: duzKod, ad: duzAd, aktif, kategori };
}

// Toplu eklemede bütün satırlar yazımdan önce denetlenir; biri geçersizse hiçbiri yazılmaz. Dönüş ilk hatanın iletisidir.
export function topluDurusuDuzenle(girdiler: readonly unknown[]): { satirlar: TopluDurusGirdisi[] } | { hata: string } {
  const satirlar: TopluDurusGirdisi[] = [];
  for (const [sira, girdi] of girdiler.entries()) {
    const duz = topluAlaniniDuzenle(girdi, sira);
    if (typeof duz === 'string') return { hata: duz };
    const kategori = KATEGORILER.find((k) => k === duz.kategori);
    if (kategori === undefined) return { hata: `${String(sira + 1)}. satır: kategori planli ya da plansiz olmalı.` };
    satirlar.push({ kod: duz.kod, ad: duz.ad, kategori, aktif: duz.aktif });
  }
  return { satirlar };
}

export function topluHatayiDuzenle(girdiler: readonly unknown[]): { satirlar: TopluHataGirdisi[] } | { hata: string } {
  const satirlar: TopluHataGirdisi[] = [];
  for (const [sira, girdi] of girdiler.entries()) {
    const duz = topluAlaniniDuzenle(girdi, sira);
    if (typeof duz === 'string') return { hata: duz };
    satirlar.push({ kod: duz.kod, ad: duz.ad, aktif: duz.aktif });
  }
  return { satirlar };
}
