import type { UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { arkonuSun } from '../arkon/sun.ts';
import { CERCEVE_ILKESI, ICERIK_ILKESI, ILKE_BASLIGI } from './src/ortak/pwa/icerik-ilkesi.ts';
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
  return { surum: paket.version, tarih: new Date().toISOString(), commit };
}

// Uygulama başka bir sitenin sayfasına gömülemez; kendi çerçeveleri (Arkon, prototip sayfaları) aynı kökendir ya da srcdoc'tur.
// Derlenmiş sürüm tam ilkeyle sunulur (icerik-ilkesi.ts); Arkon sayfası ve STEP çalışanı bunu kendi ilkeleriyle değiştirir (arkon/sun.ts).
const GELISTIRME_BASLIKLARI = { [ILKE_BASLIGI]: CERCEVE_ILKESI };
const ONIZLEME_BASLIKLARI = { [ILKE_BASLIGI]: ICERIK_ILKESI };

// vitest kendi vite kopyasını getirdiği için tipler çakışır; yapılandırma düz nesne olarak verilir.
export default {
  root: kok,
  plugins: [tembelRotalar(), react(), arkonuSun(), webUygulamasi()],
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
