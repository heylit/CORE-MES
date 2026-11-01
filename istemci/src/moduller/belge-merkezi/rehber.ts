import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/cizimler',
    ozet: 'Teknik resim, 3B model, sertifika ve raporları revizyonlarıyla saklar; belgeler malzemeye ve makineye bağlanır.',
    nasil: [
      'Sekmelerden tür seçin: Tüm belgeler, Teknik resimler, 3B modeller, Sertifikalar, Arşiv.',
      '"Yeni belge" ile tür, belge adı ve dosyayı seçip "Yükle"ye basın.',
      'Belgeyi açın: "Yeni revizyon", "Arşivle"; revizyon satırında "Görüntüle", "İndir", "Yayınla".',
      '"Bağlı kayıtlar" bölümünde "Malzemeye bağla"; 3B modelde "Makineyle eşleştir".',
    ],
    sinirlar: [
      'Yükleme çizim yazma, yayınlama ayrı yayın yetkisi ister.',
      'Yalnız taslak revizyon silinir; arşivdeki belge değişmez.',
      'Teknik resimde pdf ya da görsel, 3B modelde step, stl, iges, glb, gltf yüklenir.',
    ],
    sozcukler: ['çizim', 'resim', 'teknik resim', 'model', 'revizyon', 'sertifika', 'pdf'],
  },
];
