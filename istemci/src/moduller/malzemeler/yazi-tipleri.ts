// Barlow ve Barlow Condensed (SIL OFL, katalog/yazi/barlow-OFL.txt): prototip yazı tipleri yerel dosyadan; dış servis yok.
import y0 from './katalog/yazi/barlow-condensed-latin-500-normal.woff2?url';
import y1 from './katalog/yazi/barlow-condensed-latin-600-normal.woff2?url';
import y2 from './katalog/yazi/barlow-condensed-latin-700-normal.woff2?url';
import y3 from './katalog/yazi/barlow-condensed-latin-ext-500-normal.woff2?url';
import y4 from './katalog/yazi/barlow-condensed-latin-ext-600-normal.woff2?url';
import y5 from './katalog/yazi/barlow-condensed-latin-ext-700-normal.woff2?url';
import y6 from './katalog/yazi/barlow-latin-400-normal.woff2?url';
import y7 from './katalog/yazi/barlow-latin-500-normal.woff2?url';
import y8 from './katalog/yazi/barlow-latin-600-normal.woff2?url';
import y9 from './katalog/yazi/barlow-latin-ext-400-normal.woff2?url';
import y10 from './katalog/yazi/barlow-latin-ext-500-normal.woff2?url';
import y11 from './katalog/yazi/barlow-latin-ext-600-normal.woff2?url';

export const YAZI_TIPLERI = [
  { aile: 'Barlow Condensed', agirlik: 500, adres: y0, aralik: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  { aile: 'Barlow Condensed', agirlik: 600, adres: y1, aralik: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  { aile: 'Barlow Condensed', agirlik: 700, adres: y2, aralik: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  { aile: 'Barlow Condensed', agirlik: 500, adres: y3, aralik: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  { aile: 'Barlow Condensed', agirlik: 600, adres: y4, aralik: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  { aile: 'Barlow Condensed', agirlik: 700, adres: y5, aralik: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  { aile: 'Barlow', agirlik: 400, adres: y6, aralik: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  { aile: 'Barlow', agirlik: 500, adres: y7, aralik: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  { aile: 'Barlow', agirlik: 600, adres: y8, aralik: 'U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD' },
  { aile: 'Barlow', agirlik: 400, adres: y9, aralik: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  { aile: 'Barlow', agirlik: 500, adres: y10, aralik: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
  { aile: 'Barlow', agirlik: 600, adres: y11, aralik: 'U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF' },
] as const;

export const yaziTipiStili = (): string => YAZI_TIPLERI.map((y) =>
  `@font-face{font-family:'${y.aile}';font-style:normal;font-weight:${y.agirlik};font-display:swap;src:url(${y.adres}) format('woff2');unicode-range:${y.aralik}}`).join('\n');
