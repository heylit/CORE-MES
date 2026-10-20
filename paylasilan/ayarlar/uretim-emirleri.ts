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
} as const satisfies Record<string, AyarTanimi>;
