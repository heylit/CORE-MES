import type { OkutCozCevabi, SepetSatiri } from '#paylasilan/sozlesme/stok.ts';

// Okutarak bırakma (1919 a): hedef okutulunca bırakma formu açılır; ardından okutulan etiket o yere giden kalemleri seçer.
// İlk etiket okutması baştaki "hepsi seçili" durumunu bırakır, yalnız okutulanlar seçili kalır; sonrakiler seçime eklenir.
// Refakat kartı kartın satırını, lot etiketi o lotun satırlarını, malzeme etiketi o malzemenin satırlarını seçer.
export function okutulanSatirlar(satirlar: readonly SepetSatiri[], c: OkutCozCevabi): number[] {
  if (c.tur !== 'malzeme') return [];
  if (c.refakat) return satirlar.filter((s) => s.refakat?.id === c.refakat!.id).map((s) => s.id);
  return satirlar.filter((s) => s.malzemeId === c.malzeme.id && (c.parti === null || s.partiId === c.parti.id)).map((s) => s.id);
}

export interface BirakmaSecimi { secili: ReadonlySet<number>; okutuldu: boolean }
export const birakmaBasi = (satirlar: readonly SepetSatiri[]): BirakmaSecimi => ({ secili: new Set(satirlar.map((s) => s.id)), okutuldu: false });
export function okutarakSec(d: BirakmaSecimi, ids: readonly number[]): BirakmaSecimi {
  if (ids.length === 0) return d;
  return { secili: new Set([...(d.okutuldu ? d.secili : []), ...ids]), okutuldu: true };
}
