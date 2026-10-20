import type { AyarTanimi } from '../ayar-tanimi.ts';

export const IK_AYARLARI = {
  'ik.dort-goz': {
    modul: 'ik',
    tur: 'boolean',
    varsayilan: true,
    baslik: 'İnsan kaynaklarında dört göz kuralı',
    aciklama: 'Açıkken kadro talebini (pozisyonu) onaya gönderen kişi aynı talebi onaylayamaz. Kapalıyken onay yetkisi olan herkes onaylar.',
  },
} as const satisfies Record<string, AyarTanimi>;
