import type { HizliIs } from '../../ortak/rota/hizli-isler.ts';

export const hizliIsler: readonly HizliIs[] = [
  { anahtar: 'ik-izin-iste', sira: 10, baslik: 'İzin istiyorum', aciklama: 'İzinlerim: izin talebi açın, kalan izninizi görün.', simge: 'clock', yol: '/ik-islemlerim/izinlerim', islem: 'ik.izin-talep' },
  { anahtar: 'ik-bordrom', sira: 20, baslik: 'Bordromu göreceğim', aciklama: 'Bordrolarım.', simge: 'lira', yol: '/ik-islemlerim/bordrolarim', islem: 'sayfa.ik-islemlerim' },
  { anahtar: 'ik-izin-onay', sira: 30, baslik: 'Ekibimden izin talebi geldi', aciklama: 'Onaylar: bekleyen izin taleplerini onaylayın ya da reddedin.', simge: 'check', yol: '/ik-islemlerim/onaylar', islem: 'ik.izin-onay' },
  { anahtar: 'ik-yapilacaklar', sira: 40, baslik: 'İK yapılacakları', aciklama: 'İşe giriş, çıkış, belge ve eğitim işleri.', simge: 'list', yol: '/ik/yapilacaklar', islem: 'ik.personel-yaz' },
];
