import type { AyarTanimi } from '../ayar-tanimi.ts';

export const ROTA_AYARLARI = {
  'rota.dort-goz': {
    modul: 'rota',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Rota onayında dört göz kuralı',
    aciklama: 'Açıkken rotayı onaya gönderen ve taslağı kaydeden kişi onu onaylayamaz. Kapalıyken (varsayılan) onay yetkisi olan kişi kendi gönderdiğini de onaylar; onay kayıtta dört gözsüz olarak işaretlenir.',
  },
} as const satisfies Record<string, AyarTanimi>;
