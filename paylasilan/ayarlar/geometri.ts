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
  // 3281-1: delik çapı bu tablodaki matkap çapına 0,05 mm içinde eşitse delik "diş adayı" olur. Boşsa ya da okunamazsa yerleşik tablo.
  'geometri.dis-matkap-tablosu': {
    modul: 'geometri',
    tur: 'metin',
    varsayilan: '',
    enUzun: 2000,
    bosOlabilir: true,
    baslik: '3D Atölyesi: diş adayı için kılavuz matkabı tablosu',
    aciklama: 'Her satır "ölçü=matkap çapı", noktalı virgülle ayrılır (örnek: M6=5; M8=6,8). Boşsa ISO metrik kaba diş için alışılmış matkap çapları kullanılır. Okunamayan satır yok sayılır.',
  },
} as const satisfies Record<string, AyarTanimi>;
