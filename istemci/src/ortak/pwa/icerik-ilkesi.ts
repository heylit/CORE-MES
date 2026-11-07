// Derlenmiş uygulamanın (4101; canlıda ters vekilin arkası) içerik güvenliği ilkesi (kart #175; sıkılaştırma 2197-5 a).
// Yalnız kendi kökeninden yükler; dış adres, CDN ve başka siteye form gönderimi kapalıdır.
// Betik yalnız kendi kökenindeki dosyadan gelir: satır içi betik ve dizgiden kod (`eval`, Function yapıcısı) kapalıdır, XSS'te
// sayfaya yazılan betik çalışmaz. Kalan gevşeklikler ve nedenleri:
// - 'wasm-unsafe-eval': Tesseract ve OCCT ikilisi bellekten derlenir; JavaScript dizgisi değildir.
// - blob: çalışan, resim ve çerçeve: pdf.js çalışanı, yazı tanıma ve çizim önizlemeleri blob adresinden açılır. Blob ve srcdoc
//   belgeleri bu ilkeyi devralır; içlerinde de satır içi betik ve eval kapalıdır.
// - 'unsafe-inline' stil: ekranların style özniteliği ve <style> öğeleri.
// Function yapıcısı isteyen tek kod STEP çeviricisidir (occt-import-js bağlama kodu). Çevirici ayrı dosyadan yüklenen çalışanda
// koşar; URL ile yüklenen çalışan yaratanın ilkesini değil kendi cevabının ilkesini kullanır (Chrome 97 ve sonrası). O dosyalar
// `STEP_CALISANI_ILKESI` ile sunulur (`ilkeSec`); başka hiçbir dosya bu izni almaz.
// Satır içi betikli yalıtılmış çerçeveler (YalitilmisCerceve, srcdoc) bu ilkede çalışmaz; onları kullanan modüller kapalıdır
// (mesaj, portal). Açılmadan önce çerçeve kendi ilkesiyle sunulan ayrı belgeye taşınır.
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
  "script-src 'self' 'wasm-unsafe-eval'",
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

// STEP çeviricisinin çalışanı: kod ve wasm yalnız kendi kökeninden; Function yapıcısı yalnız burada. Başka hiçbir şey yüklemez.
export const STEP_CALISANI_ILKESI = "default-src 'none'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self'";

// Çalışan girişlerinin adı (`?worker` ithali, Vite çıktısı `assets/<ad>-<özet>.js`). Ad değişirse derleme durur (vite.config.ts).
export const EVAL_ISTEYEN_CALISANLAR: readonly string[] = ['step-isci', 'model-isci'];
const CALISAN_DOSYASI = new RegExp(`^/?assets/(?:${EVAL_ISTEYEN_CALISANLAR.join('|')})-[A-Za-z0-9_-]{8}\\.js$`);

// Derleme klasörüne göre dosya yoluna (`assets/step-isci-AbCd1234.js`, baştaki / olsa da olmasa da) verilecek ilke.
export function ilkeSec(yol: string): string {
  return CALISAN_DOSYASI.test(yol) ? STEP_CALISANI_ILKESI : ICERIK_ILKESI;
}
