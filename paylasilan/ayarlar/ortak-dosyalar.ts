import type { AyarTanimi } from '../ayar-tanimi.ts';

export const ORTAK_DOSYALAR_AYARLARI = {
  'ortak-dosyalar.silme-dort-goz': {
    modul: 'ortak-dosyalar',
    tur: 'boolean',
    varsayilan: false,
    baslik: "Ortak Dosyalar'da kalıcı silmeye dört göz",
    aciklama: 'Açıkken arşivdeki dosyanın kalıcı silinmesi bir istek olur; klasörde Yönetir düzeyi olan başka bir kişi onaylayınca dosya silinir. Kapalıyken (varsayılan) Yönetir düzeyi olan kişi tek başına siler.',
  },
} as const satisfies Record<string, AyarTanimi>;
