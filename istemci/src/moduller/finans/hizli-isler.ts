import type { HizliIs } from '../../ortak/rota/hizli-isler.ts';

// "Ne oldu?" paneli: olaylar finansın ana sayfasındaki "Kayıt gir" seçicisine ve ilgili görünümüne götürür.
export const hizliIsler: readonly HizliIs[] = [
  { anahtar: 'finans-kayit', sira: 10, baslik: 'Satış, alış, tahsilat ya da ödeme oldu', aciklama: 'Finans ana sayfasında "Kayıt gir" ile olayı seçin; kayıt doğru yere yazılır.', simge: 'lira', yol: '/finans', islem: 'finans.yaz' },
  { anahtar: 'finans-cek', sira: 20, baslik: 'Çekin ya da senedin durumu değişti', aciklama: 'Bankaya verildi, tahsil edildi, ciro edildi ya da karşılıksız çıktı.', simge: 'layers', yol: '/finans/cekler', islem: 'finans.yaz' },
  { anahtar: 'finans-ay-sonu', sira: 30, baslik: 'Ay sonu kapanışını yapacağım', aciklama: 'Banka, kasa, cari ve fatura kontrol listesi.', simge: 'check', yol: '/finans/ay-sonu', islem: 'finans.yaz' },
];
