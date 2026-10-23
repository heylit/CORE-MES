import { useSyncExternalStore } from 'react';
import { defaults, DURUM_ANAHTARI, durumOku, type CncDurumu } from './durum.ts';

// Prototipin kapanış düzeni korunur: durum tek nesnedir, görünümler ve hesaplar onu doğrudan okur ve yerinde değiştirir, sonra
// `save()` der (prototipteki gibi). `state` canlı bağdır: yeniden kurulumda (emir seçimi) yeni nesneyi gösterir.
// Ekran tek açılır (tek CNC Kurulum sayfası); depo modül düzeyindedir.

// Dışarıdan atanamaz (ES modül bağı salt okunurdur); yalnız durumKur değiştirir.
export let state: CncDurumu = defaults();

// Metin yazma anında üretilir: durum yüzlerce KB olabilir, her değişiklikte JSON'a çevrilmez.
export type Yazici = (anahtar: string, metin: () => string | null) => void;
let yazici: Yazici | null = null;
let surum = 0;
const dinleyiciler = new Set<() => void>();
const bildir = (): void => { surum += 1; for (const d of dinleyiciler) d(); };
const degisimDinleyicileri = new Set<() => void>();

// Kabuk açılışta ve emir seçiminden sonra çağırır: kayıt metni durum olur, kalıcı yazma bu işleve gider.
export function durumKur(metin: string | null | undefined, yaz: Yazici | null): void {
  state = durumOku(metin);
  yazici = yaz;
  for (const d of degisimDinleyicileri) d();
  bildir();
}

// Prototipin save()'i: değişiklik ekrana yansır ve yazma planlanır (yazma katmanı bekler, birleştirir, ilk eylemi bekler).
export function save(): void {
  for (const d of degisimDinleyicileri) d();
  yazici?.(DURUM_ANAHTARI, () => JSON.stringify(state));
  bildir();
}

// Yalnız ekranı yeniler (kalıcı olmayan görünüm durumu değişince); kayıt yazılmaz.
export function yenile(): void { bildir(); }

// Durum değişince önbellekler (kullanım sayımı gibi) boşalır.
export function degisinceTemizle(f: () => void): void { degisimDinleyicileri.add(f); }

const abone = (d: () => void): (() => void) => { dinleyiciler.add(d); return () => { dinleyiciler.delete(d); }; };
const anlik = (): number => surum;

// Bileşen durum değişince yeniden çizilir; dönen sayı her değişimde artar (useMemo bağımlılığı olarak kullanılır).
export function useCncSurum(): number { return useSyncExternalStore(abone, anlik, anlik); }
