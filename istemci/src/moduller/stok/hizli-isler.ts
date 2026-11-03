import type { HizliIs } from '../../ortak/rota/hizli-isler.ts';

// Okutarak yapılan her iş (teslim et, teslim al, malzeme iste, "bu malzeme ne, nerede") üst çubuktaki Okut düğmesindedir
// (2022 b); burada masadaki depo işleri var.
export const hizliIsler: readonly HizliIs[] = [
  { anahtar: 'stok-mal-kabul', sira: 10, baslik: 'Malzeme geldi', aciklama: 'Mal kabul: gelen malzemeyi siparişe ve konuma bağlayarak stoğa alın.', simge: 'truck', yol: '/stok/mal-kabul', islem: 'stok.giris' },
  { anahtar: 'stok-hazirlik', sira: 20, baslik: 'Malzeme hazırlayıp göndereceğim', aciklama: 'Hazırlık listesi: istekler ve toplanacak malzemeler.', simge: 'list', yol: '/stok/hazirlik', islem: 'stok.transfer', veya: ['stok.toplama'] },
  { anahtar: 'stok-tasi', sira: 30, baslik: 'Malzemeyi başka yere taşıyorum', aciklama: 'Taşı: konumdan konuma ya da istasyona aktarım.', simge: 'box', yol: '/stok/sepet', islem: 'stok.transfer' },
];
