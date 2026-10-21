// Derlenmiş uygulamanın (4101, `vite preview`; canlıda ters vekilin arkası) içerik güvenliği ilkesi (kart #175, kullanıcı kararı
// "Şimdilik izin"). Yalnız kendi kökeninden yükler; dış adres, CDN ve başka siteye form gönderimi kapalıdır.
// Gevşek kalanların nedeni gömülü ekranlardır: srcdoc çerçevesi bu ilkeyi devralır ve kendi ilkesiyle birlikte uygular, o yüzden
// burada izinli olmayan çerçevede de çalışmaz.
// - 'unsafe-inline' betik: on modülün ekranı satır içi betiktir; modüller ayrı dosyaya taşındıkça kalkar (ayrı kart).
// - 'unsafe-eval' ve 'wasm-unsafe-eval': STEP okuyucusunun (occt-import-js) bağlama kodu Function yapıcısı kullanır ve wasm'ı
//   bellekten derler; CNC Kurulum ve Kalite Merkezi bunu kendi çerçevesinde ya da blob çalışanında koşar.
// - blob: çalışan ve resim: Kalite Merkezi yazı tanıma ve STEP çalışanını, çizim önizlemeleri resmi blob adresinden açar.
// - 'unsafe-inline' stil: ekranların style özniteliği ve <style> öğeleri.
// Geliştirme sunucusuna (npm run gelistir:istemci) konmaz: anlık yenileme satır içi betik ve ws bağlantısı ister, yalnız
// frame-ancestors orada kalır.
export const ILKE_BASLIGI = 'Content-Security-Policy';

export const CERCEVE_ILKESI = "frame-ancestors 'self'";

// Her sayfaya eklenen iki başlık: adres başka siteye gönderilmez; kamera ve mikrofonu yalnız kendi köken (ve aynı kökenli çerçeveler)
// isteyebilir. Kamerayı QR okutma, saat eşleştirme ve Kalite Merkezi kullanır; hepsi aynı kökendendir.
export const EK_GUVENLIK_BASLIKLARI: Readonly<Record<string, string>> = {
  'Referrer-Policy': 'same-origin',
  'Permissions-Policy': 'camera=(self), microphone=(self)',
};

export const ICERIK_ILKESI = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "media-src 'self' data: blob: mediastream:",
  "connect-src 'self' data: blob:",
  "worker-src 'self' blob:",
  "frame-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
].join('; ');
