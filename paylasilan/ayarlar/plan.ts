import type { AyarTanimi } from '../ayar-tanimi.ts';

export const PLAN_AYARLARI = {
  'plan.dort-goz': {
    modul: 'plan',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Plan onayında dört göz kuralı',
    aciklama: 'Açıkken planı onaya gönderen kişi aynı planı onaylayıp canlıya alamaz. Kapalıyken (varsayılan) canlıya alma yetkisi olan kişi kendi gönderdiğini de onaylar.',
  },
} as const satisfies Record<string, AyarTanimi>;
