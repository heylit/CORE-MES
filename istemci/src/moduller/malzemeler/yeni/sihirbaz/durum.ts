import { useCallback, useMemo, useRef, useState } from 'react';
import type { Taslak } from '../kurallar/index.ts';
import { sihirbazTaslagi, type SihirbazTaslagi } from './turler.ts';

// Taslak, prototipin `D` nesnesidir; jsonb biçimi sözleşmedir (alan adı değişmez). Ekran yerinde değiştirmez:
// her değişiklik kopya üzerinde yapılır ve yeni nesne yazılır. Ekran taslağı sihirbaz bakışıyla (`SihirbazTaslagi`) okur; çekirdekten
// gelen taslak `yenisiniKur` ile girer.
export type { SihirbazTaslagi, Taslak };
export type Degistirici = (d: SihirbazTaslagi) => void;

export function kopyala<T>(o: T): T {
  return structuredClone(o);
}

// Prototipte `setPath`: nokta yolundaki ara nesneler yoksa kurulur.
export function yolaYaz(d: Taslak, yol: string, deger: unknown): void {
  const parcalar = yol.split('.');
  let o = d as unknown as Record<string, unknown>;
  for (const p of parcalar.slice(0, -1)) {
    const ic = o[p];
    if (ic === null || typeof ic !== 'object') o[p] = {};
    o = o[p] as Record<string, unknown>;
  }
  const son = parcalar[parcalar.length - 1];
  if (son !== undefined) o[son] = deger;
}

export function yoldanOku(d: Taslak, yol: string): unknown {
  let o: unknown = d;
  for (const p of yol.split('.')) {
    if (o === null || typeof o !== 'object') return undefined;
    o = (o as Record<string, unknown>)[p];
  }
  return o;
}

export interface SihirbazDurumu {
  taslak: SihirbazTaslagi;
  adim: number;
  degistir: (fn: Degistirici) => void;
  yenisiniKur: (d: Taslak, adim?: number) => void;
  adimaGec: (i: number) => void;
}

// Taslak ve adım birlikte tutulur; yarım taslak (K4 a) her değişiklikte kaydedilir.
export function useSihirbazDurumu(ilk: () => { taslak: Taslak; adim: number }, kaydet: (t: Taslak, adim: number) => void): SihirbazDurumu {
  const [durum, durumYaz] = useState(() => { const o = ilk(); return { taslak: sihirbazTaslagi(o.taslak), adim: o.adim }; });
  const kaydetRef = useRef(kaydet);
  kaydetRef.current = kaydet;

  const degistir = useCallback((fn: Degistirici) => {
    durumYaz((o) => {
      const t = kopyala(o.taslak);
      fn(t);
      kaydetRef.current(t, o.adim);
      return { ...o, taslak: t };
    });
  }, []);
  const yenisiniKur = useCallback((t: Taslak, adim?: number) => {
    durumYaz((o) => {
      const a = adim ?? o.adim;
      kaydetRef.current(t, a);
      return { taslak: sihirbazTaslagi(t), adim: a };
    });
  }, []);
  const adimaGec = useCallback((i: number) => {
    durumYaz((o) => {
      kaydetRef.current(o.taslak, i);
      return { ...o, adim: i };
    });
  }, []);

  return useMemo(() => ({ taslak: durum.taslak, adim: durum.adim, degistir, yenisiniKur, adimaGec }), [durum, degistir, yenisiniKur, adimaGec]);
}
