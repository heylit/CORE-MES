import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/takvim',
    ozet: 'Sipariş terminlerini, üretim emirlerinin başlangıç ve teslim günlerini, sevkleri, satın alma teslimlerini, kalibrasyon vadelerini, denetimleri, izinleri, vergi beyanlarını ve planlı duruşları tek takvimde gösterir.',
    nasil: [
      'Ay, Hafta ya da Gündem görünümünü seçin; okla önceki ve sonraki döneme geçin.',
      'Kaynak düğmeleriyle istemediğiniz kaynağı gizleyin; özet kartına basınca o kayıtlar süzülür.',
      'Bir kayda basın; ayrıntıda "ekranında aç" ile kaydın kendi ekranına gidin.',
      'İkinci menüden Tablo (sıralama ve CSV) ya da Kanban görünümüne geçin.',
    ],
    sinirlar: [
      'Yalnız okur; tarih kaydın kendi ekranında değiştirilir.',
      'Yalnız okuma yetkiniz olan kaynaklar görünür; izinlerde yetkiniz yoksa yalnız kendi izniniz görünür.',
      'Gündem, tablo ve kanban son 61 günü ve gelecek 31 günü gösterir; daha eskisi ay görünümünde gezilerek görülür.',
      'Üretim emrinin günleri emrin kendi başlangıç ve teslim tarihidir; plan çizelgesindeki adım saatleri gösterilmez.',
    ],
    sozcukler: ['termin', 'vade', 'ajanda', 'gündem', 'tarih'],
  },
];
