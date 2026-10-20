import type { HizliIs } from '../../ortak/rota/hizli-isler.ts';

export const hizliIsler: readonly HizliIs[] = [
  { anahtar: 'kalite-muayene', sira: 10, baslik: 'Parça muayene edeceğim', aciklama: 'Muayeneler: giriş, ara ve son kontrol kaydı.', simge: 'eye', yol: '/kalite-merkezi/muayeneler', islem: 'kalite-merkezi.yaz' },
  { anahtar: 'kalite-uygunsuzluk', sira: 20, baslik: 'Uygunsuz parça çıktı', aciklama: 'Uygunsuzluk (NCR) kaydı açın.', simge: 'alert', yol: '/kalite-merkezi/uygunsuzluklar', islem: 'kalite-merkezi.yaz' },
  { anahtar: 'kalite-dof', sira: 30, baslik: 'Düzeltici faaliyet başlatacağım', aciklama: 'DÖF / 8D kaydı.', simge: 'flag', yol: '/kalite-merkezi/dof', islem: 'kalite-merkezi.yaz' },
];
