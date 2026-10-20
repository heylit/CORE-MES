import type { AyarTanimi } from '../ayar-tanimi.ts';

export const NIZAMIYE_AYARLARI = {
  'nizamiye.ziyaret-no': {
    modul: 'nizamiye', tur: 'numara', varsayilan: 'ZY-{SAYAC:6}', alanlar: [], baslik: 'Ziyaret numarası',
    aciklama: 'Yeni ziyaret kaydının numarası; var olan numaralar değişmez. Sayaç ay ya da yıl kalıpta varsa o dönemde sıfırlanır.',
  },
  // Varsayılan kapalı (289 b, ADR 0016): kapalıyken kart okuyucunun gönderdiği hiçbir şey yazılmaz.
  'nizamiye.pdks-cihaz-girisi': {
    modul: 'nizamiye', tur: 'boolean', varsayilan: false, baslik: 'Kart okuyucudan PDKS kaydı',
    aciklama: 'Açıkken kayıtlı kart okuyucular giriş-çıkış hareketlerini doğrudan TMI\'ye gönderir. Yalnız TMIV2_PDKS_CIHAZ_AGI ortam değişkenindeki kurum içi aralıktan ve cihazın kayıtlı adresiyle anahtarından gelen istek kabul edilir. Kapalıyken istek reddedilir; PDKS dosyası yine elle aktarılabilir.',
  },
} as const satisfies Record<string, AyarTanimi>;
