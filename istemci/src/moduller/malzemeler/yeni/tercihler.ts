import { useCallback, useState, useSyncExternalStore } from 'react';
import type { Standart } from './standart-adlari.ts';
import type { BirimSistemi, KartKaydi } from './tipler.ts';

// K4 a (VARSAYIM, geri alma ucuz): yalnız üç kişisel kolaylık tarayıcıda kalır; ortak veri sunucudadır. Depo kapalıysa
// (gizli pencere) tercih bellekte yaşar, ekran yine çalışır.
const ANAHTAR = { birim: 'tmi-malzemeler-birim', standart: 'tmi-malzemeler-standart', son: 'tmi-malzemeler-son-kaliteler', taslak: 'tmi-malzemeler-yarim-taslak' } as const;

function oku<T>(anahtar: string, dogrula: (v: unknown) => v is T): T | null {
  try {
    const ham = localStorage.getItem(anahtar);
    if (ham === null) return null;
    const v: unknown = JSON.parse(ham);
    return dogrula(v) ? v : null;
  } catch {
    return null;
  }
}

function yaz(anahtar: string, deger: unknown): void {
  try {
    if (deger === null) localStorage.removeItem(anahtar);
    else localStorage.setItem(anahtar, JSON.stringify(deger));
  } catch { /* depo kapalı: bellekte kalır */ }
}

function useKalici<T>(anahtar: string, dogrula: (v: unknown) => v is T, ilk: T): [T, (v: T) => void] {
  const [deger, setDeger] = useState<T>(() => oku(anahtar, dogrula) ?? ilk);
  const degistir = useCallback((v: T) => { setDeger(v); yaz(anahtar, v); }, [anahtar]);
  return [deger, degistir];
}

const birimMi = (v: unknown): v is BirimSistemi => v === 'met' || v === 'imp';

// Birim düğmeleri üst başta, birimi kullanan ekranlar altta: hepsi aynı değeri görür (prototipte tek `UNITS`).
let birimDegeri: BirimSistemi | null = null;
const birimDinleyenler = new Set<() => void>();
const birimAnlik = (): BirimSistemi => (birimDegeri ??= oku(ANAHTAR.birim, birimMi) ?? 'met');
const birimDinle = (f: () => void) => { birimDinleyenler.add(f); return () => { birimDinleyenler.delete(f); }; };
function birimYaz(v: BirimSistemi): void {
  birimDegeri = v;
  yaz(ANAHTAR.birim, v);
  for (const f of birimDinleyenler) f();
}
export function useBirimSistemi(): [BirimSistemi, (v: BirimSistemi) => void] {
  return [useSyncExternalStore(birimDinle, birimAnlik, birimAnlik), birimYaz];
}

// 2117-1 a (VARSAYIM, geri alma ucuz): durum ve işlem adlarında önce gösterilen standart kişiye özeldir, birim gibi tarayıcıda kalır.
const standartMi = (v: unknown): v is Standart => v === 'astm' || v === 'en';
let standartDegeri: Standart | null = null;
const standartDinleyenler = new Set<() => void>();
const standartAnlik = (): Standart => (standartDegeri ??= oku(ANAHTAR.standart, standartMi) ?? 'astm');
const standartDinle = (f: () => void) => { standartDinleyenler.add(f); return () => { standartDinleyenler.delete(f); }; };
function standartYaz(v: Standart): void {
  standartDegeri = v;
  yaz(ANAHTAR.standart, v);
  for (const f of standartDinleyenler) f();
}
export function useStandartTercihi(): [Standart, (v: Standart) => void] {
  return [useSyncExternalStore(standartDinle, standartAnlik, standartAnlik), standartYaz];
}

export interface SonKullanilan { fam: string; cls: string; grade: string; t: number }
const sonListesiMi = (v: unknown): v is SonKullanilan[] => Array.isArray(v) && v.every((x) => typeof x === 'object' && x !== null && 'grade' in x);
export const SON_KULLANILAN_SINIRI = 8;
export function sonaEkle(liste: readonly SonKullanilan[], yeni: Omit<SonKullanilan, 't'>, t: number): SonKullanilan[] {
  const kalan = liste.filter((x) => !(x.fam === yeni.fam && x.cls === yeni.cls && x.grade === yeni.grade));
  return [{ ...yeni, t }, ...kalan].slice(0, SON_KULLANILAN_SINIRI);
}
export const useSonKullanilanlar = () => useKalici<SonKullanilan[]>(ANAHTAR.son, sonListesiMi, []);

export interface YarimTaslak { d: KartKaydi; adim: number }
const taslakMi = (v: unknown): v is YarimTaslak | null =>
  v === null || (typeof v === 'object' && 'd' in v && typeof (v as { adim?: unknown }).adim === 'number');
export const useYarimTaslak = () => useKalici<YarimTaslak | null>(ANAHTAR.taslak, taslakMi, null);
