import type { AyarTanimi } from '../ayar-tanimi.ts';

export const URETIM_EMIRLERI_AYARLARI = {
  'uretim-emirleri.emir-no': {
    modul: 'uretim-emirleri',
    tur: 'numara',
    varsayilan: '{FIRMA}-{PROJE}-{PARCA}-{YY}-{AA}-{SAYAC:3}',
    alanlar: ['FIRMA', 'PROJE', 'PARCA'],
    baslik: 'Üretim emri numarası',
    aciklama: 'Yeni üretim emrinin numarası. Firma kodu Malzeme ayarlarındandır; boş alan numaradan düşer. Sayaç ay ya da yıl kalıpta varsa o dönemde sıfırlanır. Bölünen emir üst emrin numarasına /1, /2 eklenerek numaralanır; var olan numaralar değişmez.',
  },
  // Kullanıcı kararı 14.10.2026: rotasız emir kapatılmaz, ayara bağlanır; adımları sonradan Reçete ve Rota'da eklenir. Varsayılan
  // kapalı (denetim #27, 224 ve 120 a): emir yürürlükteki revizyondan, onaylı rotayla açılır; rotasız emir bilerek açılan istisnadır.
  'uretim-emirleri.rotasiz-emir': {
    modul: 'uretim-emirleri',
    tur: 'boolean',
    varsayilan: false,
    baslik: 'Rotasız üretim emri',
    aciklama: 'Açıkken üretim emri rota seçmeden, yalnız parça, adet ve istasyonla açılabilir. Kapalıyken emir yalnız Reçete ve Rota\'dan, yürürlükteki revizyondan açılır.',
  },
  // 3272 a: sipariş onaylanınca proje ve her kalem partisi için taslak emir kendiliğinden açılır; varsayılan açık (kullanıcı isteği).
  'uretim-emirleri.siparis-onayinda-ac': {
    modul: 'uretim-emirleri',
    tur: 'boolean',
    varsayilan: true,
    baslik: 'Sipariş onayında proje ve emir aç',
    aciklama: 'Açıkken sipariş onaylanınca projesi ve her kalem partisi için taslak üretim emri açılır. Yürürlükte rotası olmayan kalemin emri "Rota bekliyor" diye adımsız açılır, rota yürürlüğe girince dolar. Kapalıyken proje ve emir elle açılır.',
  },
} as const satisfies Record<string, AyarTanimi>;
