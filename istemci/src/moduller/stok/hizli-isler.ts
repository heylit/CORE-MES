import type { HizliIs } from '../../ortak/rota/hizli-isler.ts';

// Malzeme teslim et, teslim al ve malzeme iste üst çubuktaki "Malzeme · Teslim" düğmesindedir; burada depo işleri var.
export const hizliIsler: readonly HizliIs[] = [
  { anahtar: 'stok-mal-kabul', sira: 10, baslik: 'Malzeme geldi', aciklama: 'Mal kabul: gelen malzemeyi siparişe ve konuma bağlayarak stoğa alın.', simge: 'truck', yol: '/stok/mal-kabul', islem: 'stok.giris' },
  { anahtar: 'stok-hazirlik', sira: 20, baslik: 'Malzeme hazırlayıp göndereceğim', aciklama: 'Hazırlık listesi: istekler ve toplanacak malzemeler.', simge: 'list', yol: '/stok/hazirlik', islem: 'stok.transfer', veya: ['stok.toplama'] },
  { anahtar: 'stok-tasi', sira: 30, baslik: 'Malzemeyi başka yere taşıyorum', aciklama: 'Taşı: konumdan konuma ya da istasyona aktarım.', simge: 'box', yol: '/stok/sepet', islem: 'stok.transfer' },
  { anahtar: 'stok-okut', sira: 40, baslik: 'Bu malzeme ne, nerede?', aciklama: 'Okut: etiketi okutup malzemeyi ve konumunu bulun.', simge: 'scan', yol: '/stok/okut', islem: 'sayfa.stok' },
];
