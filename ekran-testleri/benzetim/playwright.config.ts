import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';
import temel from '../playwright.config.ts';
import { CALISMA_KLASORU } from '../yollar.ts';

// Test robotu ayrı yapılandırmayla koşar: `npm run ekran` ona hiç dokunmaz. Oturumlar ekran testlerinin kurulumundan gelir;
// hazırlık aynıdır (npm run goc, npm run ekran:hazirla, npm run derle:istemci). Robot sonucu TMIV2_ROBOT_SONUC'a yazar.
export default defineConfig({
  ...temel,
  testDir: '..',
  outputDir: join(CALISMA_KLASORU, 'robot-sonuc'),
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  // Temel ayardaki göreli cwd yapılandırma klasörüne göredir; sunucu depo kökünden açılır.
  webServer: { ...temel.webServer, cwd: fileURLToPath(new URL('../../', import.meta.url)) } as NonNullable<typeof temel.webServer>,
  projects: [
    { name: 'oturum', testMatch: 'oturum.kurulum.ts' },
    { name: 'robot', testMatch: 'benzetim/kosu.benzetim.ts', dependencies: ['oturum'] },
  ],
});
