import { lazy } from 'react';
import type { KategoriAgaciTuru } from '#paylasilan/sozlesme/kategori-agaci-sabitleri.ts';
// Başka modül ekranlarının ithal edebildiği tek dosya.
// 1480: yerleşik kalitenin yoğunluğu (g/cm³) yalnız bu modülün kalite tablosundadır; tablo büyük olduğu için ilk istekte ayrı parça
// olarak yüklenir. Aile ya da kod tabloda yoksa ya da yoğunluk yazılı değilse null.
export async function yerlesikKaliteYogunlugu(aile: string, kod: string): Promise<number | null> {
  const { FAMS } = await import('./yeni/sabitler/index.ts');
  const a = FAMS[aile];
  if (a === undefined) return null;
  for (const sinif of Object.values(a.classes)) {
    const ro = sinif.grades.find((g) => g.kod === kod)?.p?.ro;
    if (typeof ro === 'number' && Number.isFinite(ro) && ro > 0) return ro;
  }
  return null;
}

// 2465 (2459 a): kategori ağacının "Malzemeler'de düzenle" bağlantısı, türün Malzeme ayarları bölümü. Hizmet grupları yerleşiktir,
// ayarda düzenlenmez: null (bağlantı çizilmez). Yol sabit yazılır; ekran parçalarını yüklememek için sekmeler ithal edilmez (test denetler).
export function kategoriAgaciDuzenleYolu(tur: KategoriAgaciTuru): string | null {
  const bolum = KATEGORI_DUZENLEME_BOLUMU[tur];
  return bolum === null ? null : `/malzemeler/ayarlar?${new URLSearchParams({ bolum }).toString()}`;
}
const KATEGORI_DUZENLEME_BOLUMU: Readonly<Record<KategoriAgaciTuru, string | null>> = { hammadde: 'aile', sarf: 'sarf', demirbas: 'db', hizmet: null };

// 3215 c: hammaddenin biçim ve ölçüsünden ölçülü kesit çizimi (mal kabul); çizim parçası ilk kullanımda yüklenir, Suspense içinde kullanılır.
export const MalzemeKesiti = lazy(() => import('./yeni/olcu-modeli/KesitGorunumu.tsx').then((m) => ({ default: m.KesitGorunumu })));
