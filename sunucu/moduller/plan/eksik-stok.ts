import type { Db } from '#cekirdek/db.ts';
import { cakisma } from '#cekirdek/hata.ts';
import { malzemeOzetleri } from '../malzemeler/disari.ts';
import { malzemeStokDurumlari } from '../stok/disari.ts';
import { emirlerinMalzemeIhtiyaci } from '../uretim-emirleri/disari.ts';
import { eksikStokIletisi, eksikStoklar, type EksikStokIsi } from './eksik-stok-kurallar.ts';
import { hedefMotorAyari } from './motor-ayari.ts';

// Canlıya almadan önce (772 a): taslağın kendi motor ayarı sürümü "dur" ise stoku bilinmeyen malzemeyi tüketen iş canlıya geçmez.
// Okumalar sunucunun içindendir: canlıya alanın malzeme ya da stok okuma yetkisi olmasa da denetim atlanmaz.
export async function eksikStokDenetle(db: Db, taslakId: number, isler: readonly EksikStokIsi[]): Promise<void> {
  if (isler.length === 0 || (await hedefMotorAyari(db, taslakId)).degerler.eksikStok !== 'dur') return;
  const ihtiyaclar = await emirlerinMalzemeIhtiyaci(db, [...new Set(isler.map((i) => i.uretimEmriId))]);
  const malzemeler = [...new Set([...ihtiyaclar.values()].flatMap((l) => (l ?? []).map((m) => m.malzemeNo)))];
  const kartlar = await malzemeOzetleri(db, malzemeler);
  const stoklu = new Set((await malzemeStokDurumlari(db, malzemeler)).keys());
  const eksik = eksikStoklar({ isler, ihtiyaclar, kartlar, stokluKartlar: stoklu });
  if (eksik.length > 0) throw cakisma(eksikStokIletisi(eksik));
}
