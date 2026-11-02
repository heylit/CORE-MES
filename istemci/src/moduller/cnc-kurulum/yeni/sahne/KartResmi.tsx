import { useEffect, useRef, useState } from 'react';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import type { Kalem } from '../veri/tipler.ts';
import { thumbUrl, thumbUrlHazir } from './gl.ts';

// Kartlı akışın 3B küçük resmi (1843). Resim bir kez çizilir ve saklanır (gl.ts); burada yalnız ekranda görünen kart için, tarayıcı
// boştayken ve her seferinde tek resim çizdirilir. Ölçümde adım değişiminde bir karede onlarca resim çizilip okunuyor, ekran
// saniyelerce donuyordu. Resim gelene kadar ve 3D açılamayan bilgisayarda simge durur.

interface Istek { opt: Kalem; bitti: (url: string | null) => void }
const kuyruk: Istek[] = [];
let calisiyor = false;
const bosta = (f: () => void): void => {
  const g = globalThis as { requestIdleCallback?: (f: () => void, o?: { timeout: number }) => number };
  if (g.requestIdleCallback) g.requestIdleCallback(f, { timeout: 300 }); else setTimeout(f, 16);
};
function isle(): void {
  const i = kuyruk.shift();
  if (i === undefined) { calisiyor = false; return; }
  let url: string | null = null;
  try { url = thumbUrl(i.opt); } catch (hata) { console.error(hata); }
  i.bitti(url);
  bosta(isle);
}
function iste(i: Istek): () => void {
  kuyruk.push(i);
  if (!calisiyor) { calisiyor = true; bosta(isle); }
  return () => { const k = kuyruk.indexOf(i); if (k >= 0) kuyruk.splice(k, 1); };
}

export function KartResmi({ opt, simge, sinif }: { opt: Kalem; simge: SimgeAdi; sinif: string }) {
  const kutu = useRef<HTMLSpanElement>(null);
  const [url, urlYaz] = useState<string | null | undefined>(() => thumbUrlHazir(opt));
  useEffect(() => {
    const hazir = thumbUrlHazir(opt);
    urlYaz(hazir);
    const el = kutu.current;
    if (hazir !== undefined || el === null) return undefined;
    let birak: (() => void) | null = null;
    const gorunce = (): void => { if (birak === null) birak = iste({ opt, bitti: (u) => { urlYaz(u); } }); };
    if (typeof IntersectionObserver === 'undefined') { gorunce(); return () => { birak?.(); }; }
    const g = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { gorunce(); g.disconnect(); } });
    g.observe(el);
    return () => { g.disconnect(); birak?.(); };
  }, [opt]);
  return (
    <span ref={kutu} className={sinif} aria-hidden="true">
      {url ? <img src={url} alt="" draggable={false} /> : <Simge ad={simge} />}
    </span>
  );
}
