import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode,
} from 'react';
import { useLocation } from 'react-router-dom';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { Simge } from './Simge.tsx';
import { etkiAcik } from '../veri/etki.ts';
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
  // Dönen numara, sonradan geçersiz kalan bildirimi (reddedilen iyimser kayıt gibi) kaldırmak içindir.
  bildir: (ton: BildirimTonu, mesaj: string, secenek?: BildirimSecenegi) => number;
  kaldir: (no: number) => void;
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
    return no;
  }, [kaldir]);

  // Hata, onu üreten sayfaya aittir: başka sayfada kalırsa o sayfanın hatası sanılır.
  const sayfaDegisti = useCallback(() => {
    kayitYaz((onceki) => (onceki.some((k) => k.ton === 'hata') ? onceki.filter((k) => k.ton !== 'hata') : onceki));
  }, []);

  useEffect(() => {
    const acik = zamanlayicilar.current;
    return () => { for (const z of acik.values()) clearTimeout(z); };
  }, []);

  const deger = useMemo(() => ({ bildir, kaldir }), [bildir, kaldir]);

  return (
    <BildirimBaglami.Provider value={deger}>
      <SayfaDegistiBaglami.Provider value={sayfaDegisti}>{children}</SayfaDegistiBaglami.Provider>
      <div className="tc-bildirimler" role="region" aria-label="Bildirimler">
        {kayitlar.map((k) => <BildirimKutusu key={k.no} kayit={k} kaldir={kaldir} />)}
      </div>
    </BildirimBaglami.Provider>
  );
}

// Yana itilen bildirim eşiği geçince kapanır, geçmezse yerine döner (kart 2090, karar 2081-15). Düğmeden başlayan itiş
// sayılmaz; dikey kaydırma tarayıcıda kalır.
const ITME_ESIGI_PX = 80;
interface Itis { x0: number; dx: number; kimlik: number }

function BildirimKutusu({ kayit: k, kaldir }: { kayit: Kayit; kaldir: (no: number) => void }) {
  const itis = useRef<Itis | null>(null);
  const basla = (o: PointerEvent<HTMLDivElement>) => {
    if (o.button !== 0 || !etkiAcik('bildirim-kayma')) return;
    if (o.target instanceof Element && o.target.closest('button')) return;
    itis.current = { x0: o.clientX, dx: 0, kimlik: o.pointerId };
    o.currentTarget.setPointerCapture?.(o.pointerId);
  };
  const sur = (o: PointerEvent<HTMLDivElement>) => {
    const i = itis.current;
    if (i?.kimlik !== o.pointerId) return;
    i.dx = o.clientX - i.x0;
    o.currentTarget.setAttribute('data-itiliyor', '');
    o.currentTarget.style.setProperty('--itme-x', `${String(i.dx)}px`);
    o.currentTarget.style.setProperty('--itme-saydam', String(Math.max(0.2, 1 - Math.abs(i.dx) / (ITME_ESIGI_PX * 2.5))));
  };
  const birak = (o: PointerEvent<HTMLDivElement>, iptal: boolean) => {
    const i = itis.current;
    if (i?.kimlik !== o.pointerId) return;
    itis.current = null;
    const el = o.currentTarget;
    el.removeAttribute('data-itiliyor');
    if (!iptal && Math.abs(i.dx) > ITME_ESIGI_PX) { kaldir(k.no); return; }
    el.style.removeProperty('--itme-x');
    el.style.removeProperty('--itme-saydam');
  };

  return (
    <div
      className={`tc-bildirim tc-bildirim-${k.ton}`}
      role={k.ton === 'hata' ? 'alert' : 'status'}
      onPointerDown={basla}
      onPointerMove={sur}
      onPointerUp={(o) => { birak(o, false); }}
      onPointerCancel={(o) => { birak(o, true); }}
    >
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
