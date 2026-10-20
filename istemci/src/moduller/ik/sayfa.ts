import { yalitimOnBetigi } from '../../ortak/arayuz/index.ts';
import { CERCEVE_ACILISI } from './acilis.ts';

// Çerçevenin sayfası: uygulama paketi, yazı tipi ve açılış betiği tek belgede (srcDoc); yalıtılmış çerçevede açılır (opak köken:
// tarayıcı deposu yerine bellek içi depo, yalitimOnBetigi). İçerik politikası dışarıya her isteği
// kapatır (dış servis yok); veri yalnız kabukla ileti alışverişiyle gelir.
export const ICERIK_POLITIKASI =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; font-src data:; img-src data: blob:; connect-src 'none'; form-action 'none'; base-uri 'none'";

// TMI'de kapalı özellikler: örnek veri (deneme verisi girmez), yedekten geri yükleme ve tümünü silme (yedek TMI sunucusunda).
export const KAPALI_OZELLIKLER = ['ornek-veri', 'geri-yukle', 'tumunu-sil'] as const;

export interface SayfaAyari {
  koken: string;
  tema: 'dark' | 'light';
  paket: string;
  yaziTipi: string;
}

// `</script` ve `<!--` paket metninde kaçışlıdır (paket.ts üretilirken); ayar JSON'u da aynı kaçışla yazılır.
const betikIcin = (metin: string): string => metin.replace(/</g, '\\u003c');

export function sayfaKur(a: SayfaAyari): string {
  const ayar = betikIcin(JSON.stringify({ koken: a.koken, tema: a.tema, kapali: KAPALI_OZELLIKLER }));
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="${ICERIK_POLITIKASI}">
${yalitimOnBetigi()}
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>${a.yaziTipi}
html,body{margin:0;height:100%}</style>
<script>window.__TMI_IK=${ayar};</script>
</head>
<body>
<div id="ik"></div>
<script>${a.paket}</script>
<script>${CERCEVE_ACILISI}</script>
</body>
</html>`;
}
