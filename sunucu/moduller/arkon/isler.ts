import { isTanimi } from '#cekirdek/zamanlayici.ts';
import { zamanOlaylariniYenile } from './anomali-zaman.ts';
import { eksikIsleriYenile } from './eksik-is/servis.ts';
import { anomaliGunuKaydet, bekleyenleriYinele, kmKararlariniAynala } from './servis.ts';
import { eskiIletileriSil } from './sorgular.ts';
import { goruntuTuru } from './pdf-goruntu/servis.ts';

// Bekleyen TMI yansımaları yeni Arkon kaydı gelmese de yeniden denenir (UYUM-BORCU sınır f). Satır başına aralık ve sıra kuralları
// kayıt isteğindeki süpürmeyle aynıdır; her deneme satırda zamanı ve sonucuyla iz bırakır.
export const isler = [
  isTanimi({ ad: 'arkon-yansima-yineleyici', aralikMs: 15_000, calis: bekleyenleriYinele }),
  // Üretim anomalisi gün kaydı (kart #1306): bugünkü açık gün 15 dakikada bir yenilenir, biten gün kapanış anından sonra kesinleşir.
  // Satırlar arkon_anomali_gunu (hesaplama, kapanis) ve arkon_anomali_satiri'nda iz bırakır.
  isTanimi({ ad: 'arkon-anomali-gunu', aralikMs: 15 * 60_000, calis: (db) => anomaliGunuKaydet(db) }),
  // Zaman olayları (kart 764): geç giriş, geç teslim, sonraki işe etki ve teslim riski aynı aralıkla yenilenir; iz arkon_anomali_olayi'ndadır
  // (açılış, güncelleme, kapanış).
  isTanimi({ ad: 'arkon-anomali-olaylari', aralikMs: 15 * 60_000, calis: (db) => zamanOlaylariniYenile(db) }),
  // Eksik iş olayları (kart 2421 c): plan gerisi, kayıtsız gün, yarım iş, plansız iş, geciken emir, bayat plan; iz arkon_eksik_is_olayi'ndadır.
  isTanimi({ ad: 'arkon-eksik-is', aralikMs: 15 * 60_000, calis: (db) => eksikIsleriYenile(db) }),
  // 15 dakikadan eski cihaz iletileri dakikada bir silinir; kaçıran cihaz imleçten anlar ve yeniden yükler (servis.ts iletiler).
  isTanimi({ ad: 'arkon-ileti-budama', aralikMs: 60_000, calis: eskiIletileriSil }),
  // 798: Kalite Merkezi'nde verilen numune ve ilk parça kararı açık Arkon numune isteğine aynalanır; iz isteğin belgesindedir (degisti).
  isTanimi({ ad: 'arkon-km-karar-aynasi', aralikMs: 15_000, calis: (db) => kmKararlariniAynala(db) }),
  // ADR 0032: yayındaki paketlerin PDF sayfa görüntüleri ayrı süreçte hazırlanır; iz arkon_pdf_goruntu'dadır (görüntü ya da hata, süre).
  isTanimi({ ad: 'arkon-pdf-goruntu', aralikMs: 60_000, txDisi: async (vt, gunluk) => { await goruntuTuru(vt, gunluk); } }),
];
