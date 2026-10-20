import type { SayfaRehberi } from '../../ortak/rota/rehber.ts';

export const rehber: readonly SayfaRehberi[] = [
  {
    yol: '/ayarlar',
    ozet: 'Kurum logosu, sayfa açma-kapama, onay ve numara kuralları, bağlantılar, yetkiler, yedek ve güncelleme.',
    nasil: [
      'Sekmeler: Genel, Sayfalar, Onay kuralları, Numara kuralları, Bağlantılar, Modül ayarları, Güncelleme, Yedekler.',
      'Genel sekmesinde "Logo yükle" ile kurum logosunu değiştirin; ayarları "Kaydet" ile kaydedin.',
      'Yedekler\'de "Şimdi yedek al"; Güncelleme\'de "Paket yükle" ile .tmip paketini yükleyip "Uygula".',
      'Yetkiler ve Sayfa yetkileri sekmelerinde rol ya da kişi seçip işlemleri açın, kapatın.',
    ],
    sinirlar: [
      'Yetki değişikliğini yalnız tam yetkili rol yapabilir.',
      'Sayfa kapatmak yalnız gizler; numara kalıbı değişikliği yalnız yeni kayıtları etkiler.',
      'Güncellemeden önce yedek alınır; sorun olursa önceki sürüme dönülür.',
    ],
    sozcukler: ['ayar', 'logo', 'yedek', 'güncelleme', 'yetki', 'numara', 'karşılama'],
  },
];
