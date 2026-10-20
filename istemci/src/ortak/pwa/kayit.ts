import { CALISAN_YOLU } from './bildirim.ts';

export interface KayitOrtami {
  guvenli: boolean;
  uretim: boolean;
  kaydet: ((adres: string, ayar: { scope: string }) => Promise<unknown>) | null;
}

// Düz http'de tarayıcı service worker'a izin vermez (navigator.serviceWorker yoktur); kayıt sessizce atlanır.
// Geliştirme sunucusunda da kaydolmaz: orada /sw.js derlenmez.
export function servisCalisaniKaydet(ortam: KayitOrtami = tarayiciOrtami()): boolean {
  if (!ortam.guvenli || !ortam.uretim || ortam.kaydet === null) return false;
  // Kayıt başarısız olursa uygulama çalışmaya devam eder; yalnız paket dosyaları her seferinde ağdan gelir.
  void ortam.kaydet(CALISAN_YOLU, { scope: '/' }).catch(() => undefined);
  return true;
}

function tarayiciOrtami(): KayitOrtami {
  const sw = navigator.serviceWorker as ServiceWorkerContainer | undefined;
  return {
    guvenli: window.isSecureContext,
    uretim: import.meta.env.PROD,
    kaydet: sw === undefined ? null : (adres, ayar) => sw.register(adres, ayar),
  };
}
