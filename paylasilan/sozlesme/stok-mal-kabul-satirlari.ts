import { z } from 'zod';
import { listeCevapSemasi, listeSorguAlanlari } from '../liste.ts';
import { ondalikMetinSemasi } from '../ondalik.ts';
import { zamanSemasi } from '../zaman.ts';
import { irsaliyeBelgesi } from './stok-irsaliye.ts';
import { KALITE_DURUMLARI, KONUM_TURLERI, LOGO_ESLESME_DURUMLARI, MAL_KABUL_BELGE_TURLERI, partiBelgesi } from './stok.ts';

// 2890: "Mal kabulü yapılanlar" — mal kabul belgelerinin satırları tek listede, her satırın lotunun bugün nerede ve hangi kalitede
// durduğuyla. Belge düzeyi özet stok.ts'teki `/stok/mal-kabuller`dadır; bu liste satır düzeyidir. Fiyat taşımaz.
const kimlik = z.coerce.number<number>().int().min(1).max(2147483647);

export const malKabulSatirlariSorgusu = z.object({
  ...listeSorguAlanlari(['zaman']),
  // Belge no, irsaliye no, lot no ya da tedarikçi parti no içinde arar.
  metin: z.string().trim().max(40).optional(),
  malzemeId: kimlik.optional(),
  tur: z.enum(MAL_KABUL_BELGE_TURLERI).optional(),
  logoDurumu: z.enum(LOGO_ESLESME_DURUMLARI).optional(),
  baslangic: zamanSemasi.optional(),
  bitis: zamanSemasi.optional(),
});
export type MalKabulSatirlariSorgusu = z.input<typeof malKabulSatirlariSorgusu>;
export type MalKabulSatirlariListesi = z.output<typeof malKabulSatirlariSorgusu>;

// Lotun bugünkü bir bakiyesi; lot bölündüyse birden çok konumda durur. Miktarı sıfır olan bakiye gelmez.
export const malKabulLotYeri = z.object({
  konumId: z.number().int(),
  konumKod: z.string(),
  konumTur: z.enum(KONUM_TURLERI),
  miktar: ondalikMetinSemasi,
  kaliteDurumu: z.enum(KALITE_DURUMLARI),
});
export type MalKabulLotYeri = z.output<typeof malKabulLotYeri>;

export const malKabulSatirOzeti = z.object({
  id: z.number().int(),
  malKabulId: z.number().int(),
  belgeNo: z.string(),
  tur: z.enum(MAL_KABUL_BELGE_TURLERI),
  irsaliyeNo: z.string().nullable(),
  zaman: zamanSemasi,
  kisiAd: z.string().nullable(),
  sira: z.number().int(),
  malzemeId: z.number().int(),
  malzemeKod: z.string().nullable(),
  malzemeAd: z.string().nullable(),
  birim: z.string().nullable(),
  sayilanMiktar: ondalikMetinSemasi,
  partiId: z.number().int().nullable(),
  lotNo: z.string().nullable(),
  tedarikciPartiNo: z.string().nullable(),
  partiBelgeleri: z.array(partiBelgesi),
  // Kabulde yazılan konum; saf hizmet satırında null (stoğa girmez).
  ilkKonumKod: z.string().nullable(),
  // Lotun bugünkü bakiyeleri; boşsa lot depoda kalmamıştır (ya da hizmet satırıdır).
  yerler: z.array(malKabulLotYeri),
  // Fason dönüşü: gönderilen malzemenin adı; değilse null.
  fasonGidenAd: z.string().nullable(),
  gkk: z.boolean(),
  logoDurumu: z.enum(LOGO_ESLESME_DURUMLARI),
  // Belge düzeltildiyse (satırın hareketleri ters çevrildi) düzelten belgenin kimliği.
  duzeltenId: z.number().int().nullable(),
  // Sipariş no ve tedarikçi yalnız stok.giris ya da satin-alma.oku taşıyana dolu gelir; öteki okuyana null (yetki genişlemez).
  siparisNo: z.string().nullable(),
  tedarikciAdi: z.string().nullable(),
  // 3063: mal kabul belgesinin irsaliyeleri (satır değil belge düzeyi; aynı belgenin her satırında aynıdır).
  irsaliyeBelgeleri: z.array(irsaliyeBelgesi),
});
export type MalKabulSatirOzeti = z.output<typeof malKabulSatirOzeti>;
export const malKabulSatirlariCevabi = listeCevapSemasi(malKabulSatirOzeti);
export type MalKabulSatirlariCevabi = z.output<typeof malKabulSatirlariCevabi>;
