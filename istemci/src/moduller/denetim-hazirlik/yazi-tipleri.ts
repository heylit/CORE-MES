// Inter ve Plus Jakarta Sans ve JetBrains Mono (SIL OFL 1.1; cerceve/yazi/*-OFL.txt, kaynak @fontsource-variable 5.3.0): prototipin değişken
// yazı tipleri yerel dosyadan; dış servis yok.
import y0 from './cerceve/yazi/inter-latin-wght-normal.woff2?url';
import y1 from './cerceve/yazi/inter-latin-ext-wght-normal.woff2?url';
import y2 from './cerceve/yazi/plus-jakarta-sans-latin-wght-normal.woff2?url';
import y3 from './cerceve/yazi/plus-jakarta-sans-latin-ext-wght-normal.woff2?url';
import y4 from './cerceve/yazi/jetbrains-mono-latin-wght-normal.woff2?url';
import y5 from './cerceve/yazi/jetbrains-mono-latin-ext-wght-normal.woff2?url';

interface YaziTipi { aile: string; agirlik: string; genislik?: string; adres: string; aralik: string }

export const YAZI_TIPLERI: readonly YaziTipi[] = [
  { aile: 'Inter', agirlik: '100 900', adres: y0, aralik: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  { aile: 'Inter', agirlik: '100 900', adres: y1, aralik: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  { aile: 'Plus Jakarta Sans', agirlik: '200 800', adres: y2, aralik: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  { aile: 'Plus Jakarta Sans', agirlik: '200 800', adres: y3, aralik: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  { aile: 'JetBrains Mono', agirlik: '100 800', adres: y4, aralik: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  { aile: 'JetBrains Mono', agirlik: '100 800', adres: y5, aralik: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
];

export const yaziTipiStili = (): string => YAZI_TIPLERI.map((y) =>
  `@font-face{font-family:'${y.aile}';font-style:normal;font-weight:${y.agirlik};${y.genislik ? `font-stretch:${y.genislik};` : ''}font-display:swap;src:url(${y.adres}) format('woff2');unicode-range:${y.aralik}}`).join('\n');

function base64(veri: Uint8Array): string {
  let ikili = '';
  for (let i = 0; i < veri.length; i += 0x8000) ikili += String.fromCharCode(...veri.subarray(i, i + 0x8000));
  return btoa(ikili);
}

// Yalıtılmış çerçeve opak kökendedir, TMI adresinden yazı tipi yükleyemez: uygulama dosyaları kendi kökeninden okur ve
// stile veri olarak gömer. Okunamayan tip atlanır; ekran yedek yazı tipiyle açılır.
export async function gomuluYaziStili(): Promise<string> {
  let stil = yaziTipiStili();
  await Promise.all(YAZI_TIPLERI.map(async (y) => {
    try {
      const cevap = await fetch(y.adres);
      if (!cevap.ok) return;
      const veri = base64(new Uint8Array(await cevap.arrayBuffer()));
      stil = stil.replace(`url(${y.adres})`, `url(data:font/woff2;base64,${veri})`);
    } catch { /* yedek yazı tipi */ }
  }));
  return stil;
}
