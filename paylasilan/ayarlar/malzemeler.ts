import type { AyarTanimi } from '../ayar-tanimi.ts';

export const MALZEMELER_AYARLARI = {
  'malzemeler.dort-goz': {
    modul: 'malzemeler',
    tur: 'boolean',
    varsayilan: true,
    baslik: 'Malzeme kartlarında dört göz kuralı',
    aciklama: 'Açıkken malzeme kartlarının onayında dört göz kısıtları uygulanır (gönderen, açan, düzenleyenler). Kapalıyken bu kısıtların hepsi kalkar.',
  },
} as const satisfies Record<string, AyarTanimi>;
