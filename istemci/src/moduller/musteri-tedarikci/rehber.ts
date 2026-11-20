import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/musteri-tedarikci',
    ozet: 'Müşteri, tedarikçi ve fason firmaların kartını ve adreslerini tutar; öteki sayfalar firmayı buradan alır.',
    nasil: [
      'Sekmelerden süzün: Tüm firmalar, Müşteriler, Tedarikçiler, Fason firmalar.',
      '"Yeni firma" ile kart açın: kod, ad, tür, vergi no, para birimi, vade, merkez adresi.',
      'Firmaya tıklayın; kartta "Düzenle", "Pasife al" ve "Adres ekle" vardır.',
    ],
    sinirlar: [
      'Yazmak firma yazma yetkisi ister.',
      'Logo\'ya bağlanınca firmanın kodu Logo cari kodu olur, eski kod kartta kalır ve firma listesinde aranır; bağlı firmanın kodu değiştirilemez; bir firmaya en çok 50 adres eklenir.',
    ],
    sozcukler: ['firma', 'cari', 'müşteri', 'tedarikçi', 'fason', 'adres'],
  },
];
