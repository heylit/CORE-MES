import type { Komut } from '../../ortak/rota/komutlar.ts';

// Ctrl K genel komutları (kart 1234, 1230 a): her biri stoğun mevcut ekranını açar; yazma ve onay o ekrandadır.
// İşlem ve yol ikinci menü maddesiyle aynıdır: maddeyi göremeyen komutu da görmez.
export const komutlar: readonly Komut[] = [
  { anahtar: 'stok-mal-kabul', sira: 10, baslik: 'Mal kabul yap', aciklama: 'Gelen malzemeyi sayarak stoğa alın.', sozcukler: ['giriş', 'irsaliye', 'teslim al'], simge: 'truck', yol: '/stok/mal-kabul', islem: 'stok.giris' },
  { anahtar: 'stok-tasi', sira: 20, baslik: 'Malzeme taşı', aciklama: 'Sepete ekleyip başka konuma ya da istasyona taşıyın.', sozcukler: ['sepet', 'transfer', 'teslim'], simge: 'box', yol: '/stok/sepet', islem: 'stok.transfer' },
  { anahtar: 'stok-okut', sira: 30, baslik: 'Kod okut', aciklama: 'Konum, parti ya da kart kodunu okutup kaydı açın.', sozcukler: ['qr', 'barkod', 'tara'], simge: 'scan', yol: '/stok/okut', islem: 'sayfa.stok' },
  { anahtar: 'stok-hazirlik', sira: 40, baslik: 'Malzeme isteklerini hazırla', aciklama: 'Bekleyen istekleri ve toplama listelerini açın.', sozcukler: ['toplama', 'istek', 'liste'], simge: 'list', yol: '/stok/hazirlik', islem: 'stok.transfer', veya: ['stok.toplama'] },
];
