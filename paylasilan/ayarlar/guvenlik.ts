import type { AyarTanimi } from '../ayar-tanimi.ts';

// Güvenlik Merkezi'nin ayarları: değeri ayarlar modülü saklar, guvenlik taraması okur.
export const GUVENLIK_AYARLARI = {
  // Varsayılan boş: VPN kişi başına ayrı adres veriyorsa muafiyet gerekmez.
  'guvenlik.vpn-adres-araligi': {
    modul: 'guvenlik',
    tur: 'metin',
    varsayilan: '',
    enUzun: 1000,
    bosOlabilir: true,
    bicim: 'ag-araligi',
    baslik: 'VPN adres aralığı',
    aciklama: 'Bilgi işleme sorun: VPN herkese aynı adresi veriyorsa o aralığı buraya yazın (örnek 10.30.0.0/16). Bu adreslerden gelen denemeler cihaza bağlı iki kuralda (G-03 bir cihazdan çok ada deneme, G-20 bir hesaba çok cihazdan deneme) sayılmaz. Her kişiye ayrı adres veriliyorsa boş bırakın.',
  },
  // GUV-6 a: eşik sahada yanlış alarm sayısına göre ayarlanır.
  'guvenlik.cok-oturum-esigi': {
    modul: 'guvenlik',
    tur: 'sayi',
    varsayilan: 4,
    enAz: 2,
    enCok: 50,
    ondalik: 0,
    baslik: 'Çok oturum alarmı eşiği',
    aciklama: 'Bir kişinin aynı anda bu kadar ya da daha çok geçerli oturumu olursa Güvenlik Merkezi orta önemli alarm açar. Bilgisayar, tablet ve telefonu birlikte kullanan kişiler yanlış alarm üretiyorsa yükseltin.',
  },
} as const satisfies Record<string, AyarTanimi>;
