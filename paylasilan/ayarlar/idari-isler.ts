import type { AyarTanimi } from '../ayar-tanimi.ts';

export const IDARI_ISLER_AYARLARI = {
  // Varsayılan kalıp ortak sayaçtan önceki numarayla aynıdır; dolu numara atlandığı için yeni talep sondakinin ardından gelir.
  'idari-isler.talep-no': {
    modul: 'idari-isler', tur: 'numara', varsayilan: 'TT-{YYYY}-{SAYAC:3}', alanlar: [], baslik: 'İdari talep numarası',
    aciklama: 'Yeni idari talebin numarası; var olan numaralar değişmez. Sayaç ay ya da yıl kalıpta varsa o dönemde sıfırlanır.',
  },
} as const satisfies Record<string, AyarTanimi>;
