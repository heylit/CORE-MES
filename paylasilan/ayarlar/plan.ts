import type { AyarTanimi } from '../ayar-tanimi.ts';

export const PLAN_AYARLARI = {
  'plan.dort-goz': {
    modul: 'plan',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Plan onayında dört göz kuralı',
    aciklama: 'Açıkken planı onaya gönderen kişi aynı planı onaylayıp canlıya alamaz. Kapalıyken (varsayılan) canlıya alma yetkisi olan kişi kendi gönderdiğini de onaylar.',
  },
  // 1477 a: motorun ufku ve zaman dilimi. Ufuk ötesindeki iş "planlanamadı (kaynak ya da ufuk)" olur; uzun ufuk ve kısa dilim çözüm
  // süresini uzatır (sunucu sınırı 60 sn).
  'plan.motor-ufuk-gun': {
    modul: 'plan',
    tur: 'sayi',
    varsayilan: 120,
    enAz: 28,
    enCok: 182,
    ondalik: 0,
    baslik: 'Plan motorunun ufku (gün)',
    aciklama: 'Motorun planladığı gün sayısı, planın başlangıç gününden. Ötesine düşen iş planlanamadı sayılır. Ufuk uzadıkça plan süresi uzar.',
  },
  'plan.motor-dilim-dk': {
    modul: 'plan',
    tur: 'secim',
    varsayilan: '15',
    secenekler: [{ deger: '15', etiket: '15 dakika' }, { deger: '30', etiket: '30 dakika' }],
    baslik: 'Plan motorunun zaman dilimi',
    aciklama: 'Kapasite bu dilimlerle sayılır. 30 dakika uzun ufukta planı hızlandırır, kısa işlerde kapasiteyi daha kaba sayar.',
  },
} as const satisfies Record<string, AyarTanimi>;
