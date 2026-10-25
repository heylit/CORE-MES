import type { IkinciMenuTanimi, SayfaTanimi } from '../sayfa-tanimi.ts';

// Satın Alma Merkezi ana menüde tek sayfa; bölümleri ikinci menüde (şartname: ikinci menü her modülde zorunlu; kullanıcı kararı 9).
// Ayarlar ikinci menüde yoktur, yalnız Sistem Ayarları'nda açılır (kullanıcı isteği 13.10.2026; ayar-ekranlari.tsx).
// Grup "Satın Alma" çekirdek isteğidir. Maddeyi kimin göreceğini işlem belirler; veri yetkisi sunucuda.
// Talep edenin ekranı "Taleplerim" Planlama grubunda ayrı sayfadır (kullanıcı isteği 12.10.2026): talep eden satın alma
// sayfasını görmez; Arkon'un Üretim Terminali gibi tek ekranlık sayfadır, ikinci menüsü yoktur.
export const SATIN_ALMA_SAYFALARI = [
  { yol: '/satin-alma', islem: 'sayfa.satin-alma', baslik: 'Satın Alma', simge: 'truck', grup: 'Satın Alma', sira: 10 },
  { yol: '/taleplerim', islem: 'sayfa.taleplerim', baslik: 'Taleplerim', simge: 'edit', grup: 'Planlama', sira: 60 },
] as const satisfies readonly SayfaTanimi[];

export const SATIN_ALMA_IKINCI_MENU = {
  kok: '/satin-alma',
  baslik: 'Satın Alma Merkezi',
  simge: 'truck',
  sayacUcu: '/satin-alma-menu-sayaclari',
  gruplar: [
    {
      maddeler: [
        { anahtar: 'is-kutusu', baslik: 'İş kutusu', yol: '/satin-alma', simge: 'bell', islem: 'satin-alma.yaz' },
        { anahtar: 'talepler', baslik: 'Talepler', yol: '/satin-alma/talepler', simge: 'list', islem: 'satin-alma.oku' },
        { anahtar: 'onaylar', baslik: 'Onaylar', yol: '/satin-alma/onaylar', simge: 'check', islem: 'satin-alma.onayla' },
        { anahtar: 'dis-operasyonlar', baslik: 'Dış operasyonlar', yol: '/satin-alma/dis-operasyonlar', simge: 'rotate', islem: 'satin-alma.oku' },
        // 534 2 a: planın olması gereken tarihi ve satın almanın termini (533 a).
        { anahtar: 'tedarik-terminleri', baslik: 'Tedarik terminleri', yol: '/satin-alma/tedarik-terminleri', simge: 'clock', islem: 'satin-alma.oku' },
      ],
    },
    {
      baslik: 'Kurumsal hafıza',
      maddeler: [
        { anahtar: 'malzemeler', baslik: 'Malzemeler', yol: '/satin-alma/malzemeler', simge: 'box', islem: 'satin-alma.oku' },
        { anahtar: 'kg-fiyatlari', baslik: 'Kg fiyatları', yol: '/satin-alma/kg-fiyatlari', simge: 'lira', islem: 'satin-alma.oku' },
        { anahtar: 'tedarikciler', baslik: 'Tedarikçiler', yol: '/satin-alma/tedarikciler', simge: 'truck', islem: 'satin-alma.oku' },
        { anahtar: 'raporlar', baslik: 'Raporlar', yol: '/satin-alma/raporlar', simge: 'chart', islem: 'satin-alma.oku' },
      ],
    },
  ],
} as const satisfies IkinciMenuTanimi;
