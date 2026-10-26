import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
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
const SayfaDegistiBaglami = createContext<(() => void) | null>(null);

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

  // Hata, onu üreten sayfaya aittir: başka sayfada kalırsa o sayfanın hatası sanılır.
  const sayfaDegisti = useCallback(() => {
    kayitYaz((onceki) => (onceki.some((k) => k.ton === 'hata') ? onceki.filter((k) => k.ton !== 'hata') : onceki));
  }, []);

  useEffect(() => {
    const acik = zamanlayicilar.current;
    return () => { for (const z of acik.values()) clearTimeout(z); };
  }, []);

  const deger = useMemo(() => ({ bildir }), [bildir]);

  return (
    <BildirimBaglami.Provider value={deger}>
      <SayfaDegistiBaglami.Provider value={sayfaDegisti}>{children}</SayfaDegistiBaglami.Provider>
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

// Adresin ilk parçası sayfadır: aynı sayfanın iç görünümleri (/kalite-merkezi/x) arasında geçiş hatayı kapatmaz.
function sayfaParcasi(yol: string): string {
  return yol.split('/')[1] ?? '';
}

// Yönlendirici BildirimSaglayici'nin içinde kurulduğu için sayfa değişimini yönlendiricinin içinden bu bileşen bildirir.
export function BildirimSayfaIzleyici() {
  const sayfaDegisti = useContext(SayfaDegistiBaglami);
  const sayfa = sayfaParcasi(useLocation().pathname);
  const onceki = useRef(sayfa);
  useEffect(() => {
    if (onceki.current === sayfa) return;
    onceki.current = sayfa;
    sayfaDegisti?.();
  }, [sayfa, sayfaDegisti]);
  return null;
}
