import { useCallback, useSyncExternalStore } from 'react';

export type Tema = 'light' | 'dark';
export const TEMA_ANAHTARI = 'tmi-tema';

function okunan(): Tema {
  try {
    return localStorage.getItem(TEMA_ANAHTARI) === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

// Tema tek yerde durur: her bileşen kendi kopyasını tutsaydı kabuktaki düğme yalnız kabuğu değiştirir, temayı
// çerçeveye taşıyan modül sayfaları eski temada kalırdı.
let gecerli: Tema | null = null;
const dinleyenler = new Set<() => void>();

function temaOku(): Tema {
  if (gecerli === null) {
    gecerli = okunan();
    document.documentElement.setAttribute('data-theme', gecerli);
  }
  return gecerli;
}

export function temaYaz(yeni: Tema): void {
  gecerli = yeni;
  document.documentElement.setAttribute('data-theme', yeni);
  try { localStorage.setItem(TEMA_ANAHTARI, yeni); } catch { /* depolama kapalı olabilir */ }
  for (const dinleyen of dinleyenler) dinleyen();
}

function abone(dinleyen: () => void): () => void {
  dinleyenler.add(dinleyen);
  return () => { dinleyenler.delete(dinleyen); };
}

export function useTema(): { tema: Tema; degistir: () => void } {
  const tema = useSyncExternalStore(abone, temaOku);
  const degistir = useCallback(() => { temaYaz(temaOku() === 'dark' ? 'light' : 'dark'); }, []);
  return { tema, degistir };
}

// Yalnız testler için: modül düzeyindeki durum testler arasında taşınmasın.
export function temayiSifirla(): void {
  gecerli = null;
}
