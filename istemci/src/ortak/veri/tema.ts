import { useCallback, useSyncExternalStore } from 'react';
import type { TemaTercihi } from '#paylasilan/sozlesme/profil.ts';

export type { TemaTercihi };
// Taban tema: sayfa kökündeki data-theme yalnız bu iki değeri alır. Çerçeveler, teknik resim ve 3B sahne yalnız onu okur.
export type Tema = 'light' | 'dark';
export const TEMA_ANAHTARI = 'tmi-tema';

const TERCIHLER: readonly TemaTercihi[] = ['light', 'dark', 'kontrast', 'gun'];
// Yüksek kontrastlı iki tema taban temanın üstüne data-kontrast ile gelir (karar 2072 a): kontrast koyu, gün ışığı açık tabanlıdır.
const TABAN: Record<TemaTercihi, Tema> = { light: 'light', dark: 'dark', kontrast: 'dark', gun: 'light' };
const KARSI: Record<TemaTercihi, TemaTercihi> = { light: 'dark', dark: 'light', kontrast: 'gun', gun: 'kontrast' };

export const tabanTema = (t: TemaTercihi): Tema => TABAN[t];

function okunan(): TemaTercihi {
  try {
    const deger = localStorage.getItem(TEMA_ANAHTARI);
    return TERCIHLER.find((t) => t === deger) ?? 'light';
  } catch {
    return 'light';
  }
}

// Tema tek yerde durur: her bileşen kendi kopyasını tutsaydı kabuktaki düğme yalnız kabuğu değiştirir, temayı
// çerçeveye taşıyan modül sayfaları eski temada kalırdı.
let gecerli: TemaTercihi | null = null;
const dinleyenler = new Set<() => void>();
// Yalnız kişinin kendi seçimi (düğme, profil) bildirilir; sunucudan gelen tercihin uygulanması bildirilmez, geri yazılmaz.
const secimDinleyenleri = new Set<(t: TemaTercihi) => void>();

function kokeYaz(t: TemaTercihi): void {
  const kok = document.documentElement;
  kok.setAttribute('data-theme', TABAN[t]);
  if (t === 'kontrast' || t === 'gun') kok.setAttribute('data-kontrast', '');
  else kok.removeAttribute('data-kontrast');
}

function tercihOku(): TemaTercihi {
  if (gecerli === null) {
    gecerli = okunan();
    kokeYaz(gecerli);
  }
  return gecerli;
}

// Sunucudan gelen ya da cihazda seçilen tercihi uygular ve cihazda saklar (giriş ekranı cihazın son temasıyla açılır).
export function tercihUygula(yeni: TemaTercihi): void {
  if (gecerli === yeni) return;
  gecerli = yeni;
  kokeYaz(yeni);
  try { localStorage.setItem(TEMA_ANAHTARI, yeni); } catch { /* depolama kapalı olabilir */ }
  for (const dinleyen of dinleyenler) dinleyen();
}

// Kişinin kendi seçimi: uygulanır ve profile yazması için dinleyene bildirilir.
export function tercihSec(yeni: TemaTercihi): void {
  tercihUygula(yeni);
  for (const dinleyen of secimDinleyenleri) dinleyen(yeni);
}

export function temaYaz(yeni: Tema): void {
  tercihSec(yeni);
}

export function secimiDinle(dinleyen: (t: TemaTercihi) => void): () => void {
  secimDinleyenleri.add(dinleyen);
  return () => { secimDinleyenleri.delete(dinleyen); };
}

function abone(dinleyen: () => void): () => void {
  dinleyenler.add(dinleyen);
  return () => { dinleyenler.delete(dinleyen); };
}

const tabanOku = (): Tema => TABAN[tercihOku()];

// Kabuktaki düğme açık ile koyu arasında geçer; yüksek kontrast seçiliyse kontrast korunur (gün ışığı <-> yüksek kontrast).
export function useTema(): { tema: Tema; degistir: () => void } {
  const tema = useSyncExternalStore(abone, tabanOku);
  const degistir = useCallback(() => { tercihSec(KARSI[tercihOku()]); }, []);
  return { tema, degistir };
}

export function useTemaTercihi(): { tercih: TemaTercihi; sec: (t: TemaTercihi) => void } {
  const tercih = useSyncExternalStore(abone, tercihOku);
  return { tercih, sec: tercihSec };
}

// Yalnız testler için: modül düzeyindeki durum testler arasında taşınmasın.
export function temayiSifirla(): void {
  gecerli = null;
  secimDinleyenleri.clear();
  document.documentElement.removeAttribute('data-kontrast');
}
