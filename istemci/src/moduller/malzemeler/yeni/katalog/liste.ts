// Katalog listesinin saf hesapları: metin araması, süzgeç, sıra, sayaç ve seçim. Kurallar prototipin adlarıyla kurallar/'dan gelir.
import { tlc } from '../bicim.ts';
import * as K from '../kurallar/index.ts';
import type { KuralBaglami } from '../kurallar/index.ts';
import type { KatalogKarti, KartKaydi } from '../tipler.ts';

// Süzgeç seçimi prototipin `KF` biçimidir: { <faset>: [değerler], olcu: { <ölçü>: { min, max } } }.
export type OlcuAraligi = { min?: number; max?: number };
export interface FiltreSecimi { olcu?: Record<string, OlcuAraligi>; [faset: string]: string[] | Record<string, OlcuAraligi> | undefined }

export const fasetDegerleri = (sec: FiltreSecimi, k: string): string[] => {
  const v = k === 'olcu' ? undefined : sec[k];
  return Array.isArray(v) ? v : [];
};

// Kayıtlı kartın kimliği kaydın `id` alanıdır (köprüdeki gibi); listedeki kart bunu her zaman taşır.
export const kimlikOf = (x: KartKaydi): string => String(x.id ?? '');

// Birleştirilmiş kart yerine geçen kartı taşır (prototipin `yerine` alanı).
export const yerineOf = (x: KartKaydi): { id: string; kod: string } | null => {
  const y = x['yerine'] as { id?: unknown; kod?: unknown } | undefined;
  return y && typeof y.id === 'string' ? { id: y.id, kod: String(y.kod ?? '') } : null;
};

// Arama alanları prototipteki gibi: kod, ad, tedarikçi, teknik kod, ERP kodu, Açıklama 1-3.
export function metinListesi(kartlar: readonly KatalogKarti[], ara: string): KatalogKarti[] {
  const q = tlc(ara.trim());
  if (!q) return [...kartlar];
  return kartlar.filter((k) => {
    const c = k.kayit.com ?? {};
    return [c.kod, c.ad, c.ted, c.tkod, c.eskiKod, c.ac1, c.ac2, c.ac3].some((s) => tlc(String(s ?? '')).includes(q));
  });
}

export function suzulmus(kartlar: readonly KatalogKarti[], ara: string, sec: FiltreSecimi, b: KuralBaglami): KatalogKarti[] {
  const metin = metinListesi(kartlar, ara);
  const kalan = new Set(K.filtreUygula(metin.map((k) => k.kayit), sec, undefined, b).map(kimlikOf));
  return metin.filter((k) => kalan.has(k.kimlik)).sort((a, z) => (z.kayit.updatedAt ?? 0) - (a.kayit.updatedAt ?? 0));
}

export interface Sayac { toplam: number; onayda: number; talep: number }

export function sayac(kartlar: readonly KatalogKarti[], b: KuralBaglami): Sayac {
  return {
    toplam: kartlar.length,
    onayda: kartlar.filter((k) => K.onayDurum(k.kayit, b) === 'onayda').length,
    talep: kartlar.filter((k) => K.talepVar(k.kayit, b)).length,
  };
}

export function sayacMetni(s: Sayac): string {
  if (!s.toplam) return '';
  return [`${s.toplam} kart`, s.onayda ? `${s.onayda} onayda` : '', s.talep ? `${s.talep} talep` : ''].filter(Boolean).join(' · ');
}

// Seçim listede olmayan kartı taşımaz (silinen ya da yenilenen liste).
export function secimiBuda(secili: ReadonlySet<string>, kartlar: readonly KatalogKarti[]): Set<string> {
  const var_ = new Set(kartlar.map((k) => k.kimlik));
  return new Set([...secili].filter((s) => var_.has(s)));
}

export function topluOnaylanabilir(secili: ReadonlySet<string>, kartlar: readonly KatalogKarti[], b: KuralBaglami): KatalogKarti[] {
  return kartlar.filter((k) => secili.has(k.kimlik) && K.onayDurum(k.kayit, b) === 'onayda' && K.onayYetkili(k.kayit, b));
}

// Karşılaştırma 2-4 kartla açılır (prototip).
export const karsilastirilabilir = (n: number): boolean => n >= 2 && n <= 4;
