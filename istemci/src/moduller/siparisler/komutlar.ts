import type { Komut } from '../../ortak/rota/komutlar.ts';

// Ctrl K genel komutları (1242, 1230 a): yeni kayıt formunu ya da listeyi süzgeci seçili açar; kayıt ve onay ekranda yapılır.
// Durum süzgeci listenin adres anahtarıdır (SiparisListesi, TeklifListesi `durum`); listede izinli olmayan değer yok sayılır.
export const komutlar: Komut[] = [
  {
    anahtar: 'siparis-yeni', sira: 10, baslik: 'Yeni satış siparişi', aciklama: 'Müşteri siparişini taslak olarak girin.',
    sozcukler: ['siparis ac', 'musteri siparisi'], simge: 'plus', yol: '/siparisler/yeni', islem: 'siparisler.yaz',
  },
  {
    anahtar: 'teklif-yeni', sira: 20, baslik: 'Yeni teklif', aciklama: 'Müşterinin teklif talebini girin.',
    sozcukler: ['teklif talebi', 'fiyat teklifi'], simge: 'plus', yol: '/siparisler/teklifler/yeni', islem: 'siparisler.yaz',
  },
  {
    anahtar: 'siparis-onay-bekleyen', sira: 30, baslik: 'Onay bekleyen siparişler', aciklama: 'Taslak satış siparişlerini listeleyin.',
    sozcukler: ['taslak siparisler'], simge: 'clipboard-check', yol: '/siparisler?durum=taslak', islem: 'siparisler.onayla',
  },
  {
    anahtar: 'teklif-revizyon', sira: 40, baslik: 'Revizyon istenen teklifler', aciklama: 'Müşterinin değişiklik istediği teklifleri listeleyin.',
    sozcukler: ['teklif revizyon'], simge: 'edit', yol: '/siparisler/teklifler?durum=revizyon', islem: 'siparisler.oku',
  },
];
