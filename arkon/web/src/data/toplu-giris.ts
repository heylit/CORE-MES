// Terminalde toplu giriş (kart #1046): operatör bir seferde N sağlam ve N hurda girer. Kayıt düzeltme değil olağan sayımdır: ekran
// sayaçları artırır, sayım satırları her zamanki fark (delta) biçimiyle gider. TMI nedensiz hurdayı kabul etmediği için
// (sunucu kurallar.ts sayimKomutu) hurda nedeni burada zorunludur; sağlam, +1 düğmesi gibi hedefi aşamaz.
export interface TopluGiris { saglam: number; hurda: number; neden: string | null }

export function topluGirisSayilari(saglam: string, hurda: string): { saglam: number; hurda: number } {
  const sayi = (metin: string): number => { const m = metin.trim(); return m === '' ? 0 : /^\d+$/.test(m) ? Number(m) : Number.NaN; };
  return { saglam: sayi(saglam), hurda: sayi(hurda) };
}

export function topluGirisHatasi(g: TopluGiris, kalanSaglam: number): string | null {
  if (![g.saglam, g.hurda].every(n => Number.isSafeInteger(n) && n >= 0)) return 'Adet tam sayı olmalı.';
  if (g.saglam + g.hurda === 0) return 'Sağlam ya da hurda adet girin.';
  if (g.hurda > 0 && !g.neden) return 'Hurda nedeni seçin.';
  if (g.saglam > Math.max(0, kalanSaglam)) return `Sağlam adet kalan ${Math.max(0, kalanSaglam)} adedi aşamaz.`;
  return null;
}
