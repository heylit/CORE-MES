import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { Simge } from './Simge.tsx';
import './bildirim.css';

export type BildirimTonu = 'tamam' | 'bilgi' | 'hata';

// Bildirimin tek düğmesi (Geri al gibi). Basılınca iş yapılır ve bildirim kapanır.
export interface BildirimEylemi {
  etiket: string;
  yap: () => void;
}

export interface BildirimSecenegi {
  eylem?: BildirimEylemi;
}

interface Kayit {
  no: number;
  ton: BildirimTonu;
  mesaj: string;
  eylem?: BildirimEylemi;
}

interface Baglam {
  bildir: (ton: BildirimTonu, mesaj: string, secenek?: BildirimSecenegi) => void;
}

const BildirimBaglami = createContext<Baglam | null>(null);

const SIMGE: Record<BildirimTonu, SimgeAdi> = { tamam: 'check', bilgi: 'bell', hata: 'alert' };
export const BILDIRIM_SURESI_MS = 4000;
// Eylemli bildirim daha uzun kalır: düğmeye yetişmek için iletiyi okumak gerekir.
export const EYLEMLI_BILDIRIM_SURESI_MS = 8000;

export function BildirimSaglayici({ children }: { children: ReactNode }) {
  const [kayitlar, kayitYaz] = useState<Kayit[]>([]);
  const sayac = useRef(0);
  const zamanlayicilar = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const kaldir = useCallback((no: number) => {
    const z = zamanlayicilar.current.get(no);
    if (z) clearTimeout(z);
    zamanlayicilar.current.delete(no);
    kayitYaz((onceki) => onceki.filter((k) => k.no !== no));
  }, []);

  // Hata kullanıcı kapatana kadar kalır: okunmadan kaybolan hata tekrar işe yol açar.
  const bildir = useCallback((ton: BildirimTonu, mesaj: string, secenek?: BildirimSecenegi) => {
    const no = ++sayac.current;
    const eylem = secenek?.eylem;
    kayitYaz((onceki) => [...onceki, { no, ton, mesaj, eylem }]);
    const sure = eylem ? EYLEMLI_BILDIRIM_SURESI_MS : BILDIRIM_SURESI_MS;
    if (ton !== 'hata') zamanlayicilar.current.set(no, setTimeout(() => kaldir(no), sure));
  }, [kaldir]);

  useEffect(() => {
    const acik = zamanlayicilar.current;
    return () => { for (const z of acik.values()) clearTimeout(z); };
  }, []);

  const deger = useMemo(() => ({ bildir }), [bildir]);

  return (
    <BildirimBaglami.Provider value={deger}>
      {children}
      <div className="tc-bildirimler" role="region" aria-label="Bildirimler">
        {kayitlar.map((k) => (
          <div key={k.no} className={`tc-bildirim tc-bildirim-${k.ton}`} role={k.ton === 'hata' ? 'alert' : 'status'}>
            <Simge ad={SIMGE[k.ton]} />
            <p className="tc-bildirim-mesaj">{k.mesaj}</p>
            {k.eylem && (
              <button type="button" className="tc-bildirim-eylem" onClick={() => { kaldir(k.no); k.eylem?.yap(); }}>
                {k.eylem.etiket}
              </button>
            )}
            <button type="button" className="tc-bildirim-kapat" onClick={() => kaldir(k.no)} aria-label="Bildirimi kapat">
              <Simge ad="x" boyut="k" />
            </button>
          </div>
        ))}
      </div>
    </BildirimBaglami.Provider>
  );
}

export function useBildirim(): Baglam {
  const baglam = useContext(BildirimBaglami);
  if (!baglam) throw new Error('useBildirim, BildirimSaglayici içinde kullanılmalı');
  return baglam;
}
