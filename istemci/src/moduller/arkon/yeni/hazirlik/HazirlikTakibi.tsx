import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AZAMI_HAZIRLIK_EMRI as SINIR, HazirlikCevabi, HazirlikOzetiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { tmiBitti } from '../../../../../../arkon/web/src/data/biten-is.ts';
import { tmiEmirId } from '../../../../../../arkon/web/src/data/tmi-adim.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { hazirlikOzeti, hazirlikSatirlari, type HazirlikSatiri, type Ton as HazirlikTonu } from '../operator/HazirlikListesi.tsx';
import { Cip } from './denetimler.tsx';
import type { Pkg, Ton } from './tipler.ts';

// 2227: hazırlık matrisi (2060 a) Üretim Hazırlık listesinde. Kaynak emir ayrıntısındakiyle aynı uçtur; burada yalnız görünür,
// başlatma kuralı sunucuda değişmeden durur. Okunamazsa (yetki, ağ) çip çizilmez.

// Uç tek okumada en çok bu kadar emir alır; sözleşmedeki sınır değişirse tip uyuşmaz.
const AZAMI_HAZIRLIK_EMRI: typeof SINIR = 100;

// Kayıttaki değer tipine güvenilmez (eski paket): sayı değilse yok sayılır.
export const paketIsEmriId = (p: Pkg): number | null => {
  const id: unknown = p.tmi?.isEmriId;
  return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? id : null;
};
const bitti = (p: Pkg): boolean => tmiBitti(p as { tmi?: { bitti?: unknown } | null });

// Bitmiş işin hazırlığı sorulmaz; aynı emrin paketleri tek kimlik.
export function hazirlikEmirleri(paketler: readonly Pkg[]): number[] {
  const l = new Set<number>();
  for (const p of paketler) {
    const id = bitti(p) ? null : tmiEmirId(p);
    if (id !== null) l.add(id);
  }
  return [...l].sort((a, b) => a - b);
}

export function paketHazirligi(harita: ReadonlyMap<number, HazirlikCevabi>, p: Pkg): HazirlikSatiri[] | null {
  const emir = bitti(p) ? null : tmiEmirId(p);
  const v = emir === null ? undefined : harita.get(emir);
  return v ? hazirlikSatirlari(v, paketIsEmriId(p)) : null;
}

export function useHazirlikOzeti(paketler: readonly Pkg[]): { harita: ReadonlyMap<number, HazirlikCevabi>; zaman: number | null; yenile: () => void } {
  const anahtar = hazirlikEmirleri(paketler).join(',');
  const [d, dYaz] = useState<{ harita: ReadonlyMap<number, HazirlikCevabi>; zaman: number }>({ harita: new Map(), zaman: 0 });
  const [n, nYaz] = useState(0);
  useEffect(() => {
    if (anahtar === '') { dYaz({ harita: new Map(), zaman: 0 }); return; }
    let canli = true;
    const idler = anahtar.split(',');
    const parcalar: string[][] = [];
    for (let i = 0; i < idler.length; i += AZAMI_HAZIRLIK_EMRI) parcalar.push(idler.slice(i, i + AZAMI_HAZIRLIK_EMRI));
    void Promise.all(parcalar.map((p) => api.get<HazirlikOzetiCevabi>(`/adimli-emirler/hazirlik-ozeti?emirler=${p.join(',')}`).catch(() => null)))
      .then((l) => {
        if (!canli) return;
        dYaz({ harita: new Map(l.flatMap((c) => (c ? c.emirler.map((e) => [e.emirId, e.hazirlik] as const) : []))), zaman: Date.now() });
      });
    return () => { canli = false; };
  }, [anahtar, n]);
  const yenile = useCallback(() => nYaz((x) => x + 1), []);
  return useMemo(() => ({ harita: d.harita, zaman: d.zaman || null, yenile }), [d, yenile]);
}

const CIP_TONU: Readonly<Record<HazirlikTonu, Ton>> = { hata: 'stop', uyari: 'hold', tamam: 'run', pasif: 'idle' };

// Paket kartı düğmedir; çip içinde ikinci düğme olmaz, ayrıntı paketin Yayınla sekmesindedir.
export function HazirlikPaketCipi({ satirlar }: { satirlar: readonly HazirlikSatiri[] | null }) {
  if (!satirlar) return null;
  const o = hazirlikOzeti(satirlar);
  return <Cip ton={CIP_TONU[o.ton]}>{o.metin}</Cip>;
}
