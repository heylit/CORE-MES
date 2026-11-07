import type { Plugin, UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { arkonuSun } from '../arkon/sun.ts';
import { CERCEVE_ILKESI, EK_GUVENLIK_BASLIKLARI, EVAL_ISTEYEN_CALISANLAR, ICERIK_ILKESI, ILKE_BASLIGI, ilkeSec } from './src/ortak/pwa/icerik-ilkesi.ts';
import { webUygulamasi } from './src/ortak/pwa/vite-eklentisi.ts';
import { tembelRotalar } from './src/ortak/rota/tembel-rotalar.ts';

const kok = fileURLToPath(new URL('.', import.meta.url));
const paylasilan = fileURLToPath(new URL('../paylasilan', import.meta.url));

// Kabuk ve Sistem Ayarları'ndaki sürüm satırı: sürüm package.json'dan, tarih derleme anından, commit ortamdan ya da git'ten.
function derlemeBilgisi(): { surum: string; tarih: string; commit: string | null } {
  const paket = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
  let commit = process.env['TMIV2_COMMIT']?.trim() || null;
  if (commit === null) {
    try {
      commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: kok, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim() || null;
    } catch { /* git yoksa commit bilinmez */ }
  }
  // Güncelleyici kurduğu yayının adını verir (araclar/guncelleyici.ts derlemeOrtami); elle kurulumda package.json sürümü kalır.
  const surum = process.env['TMIV2_SURUM']?.trim() || paket.version;
  return { surum, tarih: new Date().toISOString(), commit };
}

// Uygulama başka bir sitenin sayfasına gömülemez; kendi çerçeveleri (Arkon, prototip sayfaları) aynı kökendir ya da srcdoc'tur.
// Derlenmiş sürüm tam ilkeyle sunulur (icerik-ilkesi.ts); Arkon sayfası ve STEP çalışanı bunu kendi ilkeleriyle değiştirir (arkon/sun.ts).
const GELISTIRME_BASLIKLARI = { [ILKE_BASLIGI]: CERCEVE_ILKESI, ...EK_GUVENLIK_BASLIKLARI };
const ONIZLEME_BASLIKLARI = { [ILKE_BASLIGI]: ICERIK_ILKESI, ...EK_GUVENLIK_BASLIKLARI };

// STEP çeviricisinin çalışan dosyaları kendi ilkesiyle gider (icerik-ilkesi.ts ilkeSec). Önizleme başlıkları dosya sunulurken sabit
// yazılır; bu dosyalarda ilke başlığı yolun ilkesiyle değiştirilir. Çalışanın adı değişip ilke eşleşmesi kaçarsa STEP sessizce
// açılmazdı: derleme durur.
function calisanIlkesi(): Plugin {
  return {
    name: 'tmi-calisan-ilkesi',
    configurePreviewServer(sunucu) {
      sunucu.middlewares.use((istek, yanit, sonraki) => {
        const ilke = ilkeSec((istek.url ?? '').split('?')[0] ?? '');
        const yaz = yanit.setHeader.bind(yanit);
        yanit.setHeader = (ad, deger) => yaz(ad, ad.toLowerCase() === ILKE_BASLIGI.toLowerCase() ? ilke : deger);
        sonraki();
      });
    },
    generateBundle(_ayar, paket) {
      for (const ad of EVAL_ISTEYEN_CALISANLAR) {
        const dosya = Object.keys(paket).find((d) => d.startsWith(`assets/${ad}-`));
        if (dosya === undefined || ilkeSec(dosya) === ICERIK_ILKESI) this.error(`${ad} çalışan dosyası bulunamadı ya da adı ilke eşleşmesine uymuyor (${dosya ?? 'yok'})`);
      }
    },
  };
}

// vitest kendi vite kopyasını getirdiği için tipler çakışır; yapılandırma düz nesne olarak verilir.
export default {
  root: kok,
  plugins: [tembelRotalar(), react(), arkonuSun(), webUygulamasi(), calisanIlkesi()],
  resolve: { alias: { '#paylasilan': paylasilan } },
  define: { __TMI_DERLEME__: JSON.stringify(derlemeBilgisi()) },
  server: {
    port: 4101,
    strictPort: true,
    headers: GELISTIRME_BASLIKLARI,
    // xfwd: sunucu gerçek istemci adresini ve HTTPS'i X-Forwarded-* başlığından okur (yalnız bu vekile güvenir).
    proxy: { '/api': { target: 'http://127.0.0.1:4100', xfwd: true } },
  },
  // `npm run baslat` derlenmiş sürümü aynı kapıdan sunar; vekil server.proxy'den gelir. Ağa açılması TMIV2_ONIZLEME_ADRESI ile (kart #1280).
  preview: { port: 4101, strictPort: true, headers: ONIZLEME_BASLIKLARI },
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    // Arkon testleri Arkon kaynağını göreli yolla dinamik ithal eder; vitest 4 kök (istemci) dışına çıkan yolu kökten başlayan
    // `/arkon/web/...` adresine çevirir. Adres yalnız testte Arkon klasörüne bağlanır; derleme ve geliştirme sunucusu etkilenmez.
    alias: [{ find: /^\/arkon\/web\//, replacement: `${fileURLToPath(new URL('../arkon/web/', import.meta.url))}` }],
    environment: 'jsdom',
    // vitest 4'te megabaytlık dizi karşılaştıran testler (Arkon dosya parçaları) jsdom'da 5 saniyeye yaklaşır; sınır yük altındaki
    // CI'da da düşmesin diye 15 saniye.
    testTimeout: 15_000,
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Yalnız tema değişkenleri sayfaya işlenir: web uygulaması bildiriminin rengi tema zeminiyle hesaplanan stilden karşılaştırılır.
    css: { include: [/ortak\/tasarim\/tokens\.css$/] },
  },
} as UserConfig;
