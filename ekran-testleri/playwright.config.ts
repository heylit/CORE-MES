import { join } from 'node:path';
import { defineConfig } from '@playwright/test';
import { CALISMA_KLASORU } from './yollar.ts';

// Ekran ve davranış testleri: derlenmiş istemci (4101) ve sunucu (4100), göçleri uygulanmış boş veritabanına yüklenen örnek
// veriyle. Sıra: npm run goc, npm run ekran:hazirla, npm run derle:istemci, npm run ekran.
// Tarayıcı indirilmez: Playwright'ın kendi Chromium'u kuruluysa o (PLAYWRIGHT_BROWSERS_PATH), yoksa TMIV2_EKRAN_TARAYICI
// ile verilen kurulu Chromium ya da Chrome kullanılır.
const tarayici = process.env['TMIV2_EKRAN_TARAYICI']?.trim() || undefined;
// Görüntü karşılaştırmasının temel görüntüleri depoya girmez (depoya yalnız kod girer); klasör verilmezse o testler atlanır.
const temel = process.env['TMIV2_EKRAN_TEMEL']?.trim() || undefined;
const ci = process.env['CI'] !== undefined;

// Yükseklikler kayıttaki çekimlerle aynı (kayit/*/betik/ortak.cjs).
const GENISLIKLER = [
  { ad: 'g360', width: 360, height: 780 },
  { ad: 'g768', width: 768, height: 1024 },
  { ad: 'g1280', width: 1280, height: 800 },
] as const;

export default defineConfig({
  testDir: '.',
  outputDir: join(CALISMA_KLASORU, 'sonuc'),
  snapshotPathTemplate: join(temel ?? join(CALISMA_KLASORU, 'temel'), '{arg}-{projectName}{ext}'),
  fullyParallel: true,
  forbidOnly: ci,
  retries: 0,
  workers: ci ? 4 : '50%',
  timeout: 45_000,
  expect: { timeout: 10_000, toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled', caret: 'hide' } },
  reporter: ci ? [['list'], ['github']] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4101',
    locale: 'tr-TR',
    timezoneId: 'Europe/Istanbul',
    contextOptions: { reducedMotion: 'reduce' },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: tarayici === undefined ? {} : { executablePath: tarayici },
  },
  projects: [
    { name: 'oturum', testMatch: 'oturum.kurulum.ts' },
    ...GENISLIKLER.map((g) => ({
      name: g.ad, testMatch: '*.spec.ts', dependencies: ['oturum'], use: { viewport: { width: g.width, height: g.height } },
    })),
  ],
  // Canlıdaki gibi tek süreç: sunucu derlenmiş istemciyi 4101'den, /api ile birlikte verir (`--arayuz`, E-19).
  webServer: {
    command: 'node --import ./araclar/ortam-yukle.ts sunucu/ana.ts --arayuz',
    cwd: '..',
    url: 'http://127.0.0.1:4101/api/oturum',
    reuseExistingServer: !ci,
    timeout: 60_000,
    stdout: 'pipe',
  },
});
