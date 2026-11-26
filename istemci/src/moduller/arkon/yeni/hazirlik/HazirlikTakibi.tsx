import { useCallback, useEffect, useMemo, useState } from 'react';
import type { AZAMI_HAZIRLIK_EMRI as SINIR, HazirlikCevabi, HazirlikMaddesi, HazirlikOzetiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { tmiBitti } from '../../../../../../arkon/web/src/data/biten-is.ts';
import { tmiEmirId } from '../../../../../../arkon/web/src/data/tmi-adim.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { hazirlikSatirlari, type HazirlikSatiri } from '../operator/HazirlikListesi.tsx';
import type { Pkg } from './tipler.ts';

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

export const hazirlikBeklenir = (p: Pkg): boolean => !bitti(p) && tmiEmirId(p) !== null;
export function paketHazirligi(harita: ReadonlyMap<number, HazirlikCevabi>, p: Pkg): HazirlikSatiri[] | null {
  const emir = bitti(p) ? null : tmiEmirId(p);
  const v = emir === null ? undefined : harita.get(emir);
  return v ? hazirlikSatirlari(v, paketIsEmriId(p)) : null;
}

export function useHazirlikOzeti(paketler: readonly Pkg[]): { harita: ReadonlyMap<number, HazirlikCevabi>; zaman: number | null; yenile: () => void } {
  const anahtar = hazirlikEmirleri(paketler).join(',');
  // Gönderim ve geri çekme "yayın" maddesini değiştirir: paket durumu değişince özet yeniden okunur (yenilemeden "1 eksik" kalmasın).
  const durumlar = paketler.map((p) => `${p.id}:${p.status}`).sort().join('|');
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
  }, [anahtar, durumlar, n]);
  const yenile = useCallback(() => nYaz((x) => x + 1), []);
  return useMemo(() => ({ harita: d.harita, zaman: d.zaman || null, yenile }), [d, yenile]);
}

// Madde sırası (durduranlar önce): listede eksik madde çipleri bu sırayla dizilir (3606-2).
// Sıra tek kaynakta: kayıt tipi yeni maddeyi eksik bırakırsa derleme durur; test HAZIRLIK_MADDELERI ile eşitliği denetler.
export const MADDE_SIRASI: Record<HazirlikMaddesi, number> = { cnc: 0, cizim: 1, yayin: 2, rota: 3, malzeme: 4, 'takim-omru': 5, 'takim-hazirla': 6, makine: 7, talimat: 8, 'ek-madde': 9, aparat: 10, 'olcu-aleti': 11 };
