// Web uygulaması bildirimi (manifest) ve tema rengi tek yerde durur; derleme bildirimi ve index.html'deki theme-color etiketini buradan yazar.
// Bildirim CSS değişkeni okuyamaz: renk, açılıştaki (light) temanın zemini (tokens.css --bg) ile aynı değerdir; test eşleşmeyi denetler.
export const TEMA_RENGI = '#e9e6df';

export const BILDIRIM_YOLU = '/manifest.webmanifest';
export const CALISAN_YOLU = '/sw.js';

export interface BildirimSimgesi {
  src: string;
  sizes: string;
  type: 'image/png';
  purpose: 'any' | 'maskable';
}

// Simgeler kabuktaki TMI işaretidir (sarı zemin, koyu yazı); maskelenebilir olanlarda yazı güvenli dairenin içinde kalır.
export const SIMGELER: readonly BildirimSimgesi[] = [
  { src: '/simgeler/simge-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: '/simgeler/simge-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: '/simgeler/simge-maskelenebilir-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
  { src: '/simgeler/simge-maskelenebilir-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];
export const APPLE_SIMGESI = '/apple-touch-icon.png';

export const WEB_BILDIRIMI = {
  name: 'TMI CORE',
  short_name: 'TMI CORE',
  description: 'Üretim planlama ve izlenebilirlik',
  lang: 'tr',
  id: '/',
  start_url: '/',
  scope: '/',
  display: 'standalone',
  orientation: 'any',
  theme_color: TEMA_RENGI,
  background_color: TEMA_RENGI,
  icons: SIMGELER,
} as const;

// index.html başına eklenen etiketler. Dış adres yoktur; hepsi aynı sunucudan gelir.
export function basEtiketleri(): { tag: string; attrs: Record<string, string> }[] {
  return [
    { tag: 'link', attrs: { rel: 'manifest', href: BILDIRIM_YOLU } },
    { tag: 'meta', attrs: { name: 'theme-color', content: TEMA_RENGI } },
    { tag: 'link', attrs: { rel: 'icon', type: 'image/png', sizes: '192x192', href: '/simgeler/simge-192.png' } },
    { tag: 'link', attrs: { rel: 'apple-touch-icon', href: APPLE_SIMGESI } },
    { tag: 'meta', attrs: { name: 'apple-mobile-web-app-capable', content: 'yes' } },
    { tag: 'meta', attrs: { name: 'mobile-web-app-capable', content: 'yes' } },
    { tag: 'meta', attrs: { name: 'apple-mobile-web-app-status-bar-style', content: 'default' } },
    { tag: 'meta', attrs: { name: 'apple-mobile-web-app-title', content: WEB_BILDIRIMI.short_name } },
  ];
}
