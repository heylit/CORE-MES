import type { AyarTanimi } from '../ayar-tanimi.ts';

export const GEOMETRI_AYARLARI = {
  // 1433 a: ham önerisinin varsayılan payı; ekrandaki pay kutusu bununla açılır, kullanıcı o öneri için değiştirebilir.
  'geometri.ham-payi-mm': {
    modul: 'geometri',
    tur: 'sayi',
    varsayilan: null,
    enAz: 0,
    enCok: 100,
    ondalik: 2,
    baslik: '3D Atölyesi: işleme payı (mm, her yüze)',
    aciklama: 'Ham ölçü önerisinde parçanın her yüzüne eklenen pay. Boş bırakılırsa ekran payı 0 mm ile açar ve kullanıcı yazar.',
  },
} as const satisfies Record<string, AyarTanimi>;
