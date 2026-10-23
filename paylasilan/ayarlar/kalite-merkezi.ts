import type { AyarTanimi } from '../ayar-tanimi.ts';

export const KALITE_MERKEZI_AYARLARI = {
  // Varsayılan kalıp uygulamanın kendi DÖF numarasıyla aynıdır; dolu numara atlandığı için sunucunun açtığı DÖF sondakinin ardından gelir.
  'kalite-merkezi.dof-no': {
    modul: 'kalite-merkezi', tur: 'numara', varsayilan: 'DOF-{YYYY}-{SAYAC:4}', alanlar: [], baslik: 'DÖF numarası',
    aciklama: 'Başka modülün (denetim hazırlığı) açtığı DÖF\'ün numarası; var olan numaralar değişmez. Sayaç ay ya da yıl kalıpta varsa o dönemde sıfırlanır.',
  },
} as const satisfies Record<string, AyarTanimi>;
