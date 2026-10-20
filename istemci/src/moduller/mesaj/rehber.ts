import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/mesaj',
    ozet: 'Şirket içi sohbet, kanal, görev, toplantı takvimi ve sipariş takibi.',
    nasil: [
      'Uygulama içinde bölüm seçin: Bugün, Sohbet, İşler, Takvim, Siparişler.',
      'Takvim\'de "Görev" ya da "Toplantı", İşler\'de "Yeni iş", Sohbet\'te "Kanal" ile yeni kayıt açın.',
      'Duyuruyu okuduysanız "Okudum, anladım"a basın.',
    ],
    sinirlar: [
      'Yazmak mesaj yazma yetkisi ister.',
      'Başkası adına ileti atılamaz, başkasının iletisi silinemez; ek dosya en çok 700 KB.',
    ],
    sozcukler: ['sohbet', 'duyuru', 'görev', 'toplantı', 'kanal'],
  },
];
