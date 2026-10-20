import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// İdari İşler tek sayfadır. Talep açma her personelin işidir: sayfa herkese açılır, maddeler işleme göre süzülür; personel yalnız
// "Talep aç", "Taleplerim" ve "Araç talebim"i görür. Sıra 7: Finans (5) ile Sistem Ayarları (10) arasında. Simge ana menüde tekildir.
export const IDARI_ISLER_SAYFALARI = [
  { yol: '/idari-isler', islem: 'sayfa.idari-isler', baslik: 'İdari İşler', simge: 'book', grup: 'Yönetim', sira: 7 },
] as const satisfies readonly SayfaTanimi[];

export const IDARI_ISLER_IKINCI_MENU = {
  kok: '/idari-isler',
  baslik: 'İdari İşler',
  simge: 'book',
  sayacUcu: '/idari-isler/menu-sayaclari',
  gruplar: [
    {
      maddeler: [
        { anahtar: 'bugun', baslik: 'Bugün', yol: '/idari-isler', simge: 'home', islem: 'idari-isler.oku' },
        { anahtar: 'talepler', baslik: 'Tesis talepleri', yol: '/idari-isler/talepler', simge: 'wrench', islem: 'idari-isler.oku' },
        { anahtar: 'periyodik', baslik: 'Periyodik kontroller', yol: '/idari-isler/periyodik', simge: 'clock', islem: 'idari-isler.oku' },
        { anahtar: 'yemek', baslik: 'Yemek sayısı', yol: '/idari-isler/yemek', simge: 'coffee', islem: 'idari-isler.oku' },
        { anahtar: 'zimmet', baslik: 'Demirbaş ve zimmet', yol: '/idari-isler/zimmet', simge: 'box', islem: 'idari-isler.oku' },
        { anahtar: 'filo', baslik: 'Filo', yol: '/idari-isler/filo', simge: 'truck', islem: 'idari-isler.oku' },
        { anahtar: 'arac-gorevleri', baslik: 'Araç görevleri', yol: '/idari-isler/arac-gorevleri', simge: 'route', islem: 'idari-isler.oku' },
      ],
    },
    {
      baslik: 'Talebim',
      maddeler: [
        { anahtar: 'talep-ac', baslik: 'Talep aç', yol: '/idari-isler/talep-ac', simge: 'plus', islem: 'idari-isler.talep-ac' },
        { anahtar: 'taleplerim', baslik: 'Taleplerim', yol: '/idari-isler/taleplerim', simge: 'list', islem: 'idari-isler.talep-ac' },
        {
          anahtar: 'arac-taleplerim', baslik: 'Araç talebim', yol: '/idari-isler/arac-taleplerim', simge: 'truck',
          islem: 'idari-isler.arac-talebi-ac',
        },
      ],
    },
  ],
} as const satisfies IkinciMenuTanimi;
