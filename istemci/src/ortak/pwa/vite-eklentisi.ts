import type { Plugin } from 'vite';
import { fileURLToPath } from 'node:url';
import { BILDIRIM_YOLU, CALISAN_YOLU, WEB_BILDIRIMI, basEtiketleri } from './bildirim.ts';
import { onizlemeAdresi } from './dinleme.ts';
import { httpsAyari } from './https.ts';

const CALISAN_GIRISI = fileURLToPath(new URL('./sw.ts', import.meta.url));
const BILDIRIM_TURU = 'application/manifest+json; charset=utf-8';

// Bildirim ve service worker derlemede üretilir: renk ve sürüm tek kaynaktan gelir, elle kopya tutulmaz.
// Geliştirme sunucusu bildirimi sunar (localhost'ta kurulabilirlik denenebilir); service worker yalnız derlenmiş sürümde vardır.
export function webUygulamasi(): Plugin {
  let derleme = false;
  return {
    name: 'tmi-web-uygulamasi',
    // Sunucu ve önizleme açılırken HTTPS ve dinleme adresi değişkenleri okunur ve doğrulanır; derleme ve testler bunlara bakmaz.
    // Dinleme adresi yalnız önizlemeye gider: geliştirme sunucusu bu makinede kalır.
    config(_ayar, { command, mode }) {
      if (command !== 'serve' || mode === 'test' || process.env['VITEST'] !== undefined) return;
      const https = httpsAyari() ?? undefined;
      const host = onizlemeAdresi() ?? undefined;
      return { server: { https }, preview: { https, host } };
    },
    configResolved(ayar) {
      derleme = ayar.command === 'build';
    },
    buildStart() {
      if (!derleme) return;
      this.emitFile({ type: 'chunk', id: CALISAN_GIRISI, fileName: CALISAN_YOLU.slice(1) });
    },
    generateBundle(_ayar, paket) {
      // Çalışan klasik betik olarak yüklenir; istemciyle ortak parçaya ithal kalırsa tarayıcıda kurulmaz, derleme burada durur.
      const calisan = paket[CALISAN_YOLU.slice(1)];
      if (calisan?.type === 'chunk' && (calisan.imports.length > 0 || calisan.dynamicImports.length > 0)) {
        this.error(`${CALISAN_YOLU} başka parçayı ithal ediyor (${[...calisan.imports, ...calisan.dynamicImports].join(', ')}); istemciyle ortak modül kullanmamalı`);
      }
      this.emitFile({ type: 'asset', fileName: BILDIRIM_YOLU.slice(1), source: JSON.stringify(WEB_BILDIRIMI, null, 2) });
    },
    transformIndexHtml() {
      return basEtiketleri().map((e) => ({ ...e, injectTo: 'head' as const }));
    },
    configureServer(sunucu) {
      sunucu.middlewares.use(BILDIRIM_YOLU, (_istek, yanit) => {
        yanit.setHeader('Content-Type', BILDIRIM_TURU);
        yanit.end(JSON.stringify(WEB_BILDIRIMI));
      });
    },
    configurePreviewServer(sunucu) {
      // Önizleme dosyayı uzantısından türle sunar; bildirim türü açıkça verilir.
      sunucu.middlewares.use(BILDIRIM_YOLU, (_istek, yanit, sonraki) => {
        yanit.setHeader('Content-Type', BILDIRIM_TURU);
        sonraki();
      });
    },
  };
}
