import { useCallback, useState } from 'react';
import type { BirimSistemi, KartKaydi } from './tipler.ts';

// K4 a (VARSAYIM, geri alma ucuz): yalnız üç kişisel kolaylık tarayıcıda kalır; ortak veri sunucudadır. Depo kapalıysa
// (gizli pencere) tercih bellekte yaşar, ekran yine çalışır.
const ANAHTAR = { birim: 'tmi-malzemeler-birim', son: 'tmi-malzemeler-son-kaliteler', taslak: 'tmi-malzemeler-yarim-taslak' } as const;

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
export const useBirimSistemi = () => useKalici<BirimSistemi>(ANAHTAR.birim, birimMi, 'met');

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
