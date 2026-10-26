import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as IsaretOlayi, type ReactNode } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { HaritaBagi } from '../../motor/harita/Harita.tsx';
import { ekrana, KH, KW, type Bolge, type Kamera, type Sahne } from '../../motor/harita/kurallar.ts';
import {
  atolyeKutulari, bosYer, diz, dunyaKutusu, gosterKamerasi, hepsiniSigdir, KART_ANAHTARI, kartlarOku, kartlarYaz, kartOrani, kartTanimi,
  KREF, yerlestir, type KartKaydi, type KartTuru,
} from './kurallar.ts';
import './kartlar.css';

// Kartların durumu tarayıcıda kalır (eski ANAHTAR-tk): açık kartlar, yerleri ve küçültülenler; bellek kapalıysa boş başlar.
export function useKartlar(): [KartKaydi[], (f: (l: KartKaydi[]) => KartKaydi[]) => void] {
  const [l, setL] = useState<KartKaydi[]>(() => { try { return kartlarOku(localStorage.getItem(KART_ANAHTARI)); } catch { return []; } });
  useEffect(() => { try { localStorage.setItem(KART_ANAHTARI, kartlarYaz(l)); } catch { /* tarayıcı belleği kapalı olabilir */ } }, [l]);
  return [l, setL];
}

// Reçete ve Rota kartı açıkken ürünün rotası haritada yanar (ze-rota rtCiz): adımın makineleri numarasıyla, adımlar sırayla bağlı.
export interface RotaIzi { adimlar: { k: string; yerler: string[] }[]; ust: string | null; ustM: string | null }
interface Ozellikler {
  bag: HaritaBagi; l: KartKaydi[]; degis: (f: (l: KartKaydi[]) => KartKaydi[]) => void; iz?: RotaIzi | null;
  // Doğruysa kartlar bölgelere dizilir ve hepsi ekrana sığar (tkToparla); dizilince `dizBitti` çağrılır. Harita ilk karesini çizmeden istenirse
  // ilk karede yapılır.
  dizIstegi: boolean; dizBitti: () => void;
  kapat: (t: KartTuru) => void; kucult: (t: KartTuru) => void;
  govde: (t: KartTuru) => ReactNode;
}
interface Kare { kam: Kamera; W: number; H: number; bolge: Bolge[]; ist: Sahne['ist'] }
const NS = 'http://www.w3.org/2000/svg';

// Kart katmanı (zc-tahta tkKatman, tkKonumla, tkKartHtml): kartlar her karede kameraya göre yerleşir; başlıktan tutulup taşınır.
// Telefonda (dar) yalnız son kart haritanın altından açılır, tahtayla kaymaz.
export function KartKatmani(o: Ozellikler) {
  const kok = useRef<HTMLDivElement>(null);
  const el = useRef(new Map<KartTuru, HTMLElement>());
  const son = useRef<Kare | null>(null);
  const tut = useRef<{ tur: KartTuru; x: number; y: number } | null>(null);
  const lr = useRef(o.l); lr.current = o.l;
  const izR = useRef(o.iz ?? null); izR.current = o.iz ?? null;
  const izEl = useRef<SVGGElement>(null);
  const [dar, setDar] = useState(false);

  const olcu = useCallback((t: KartTuru) => el.current.get(t)?.offsetWidth || kartTanimi(t).w, []);
  const izCiz = useCallback((k: Kare) => {
    const g = izEl.current; if (!g) return;
    while (g.firstChild) g.removeChild(g.firstChild);
    const iz = izR.current; if (!iz || k.W < 600) return;
    const el = (ad: string, a: Record<string, string | number | boolean | null>, ust: Element = g) => {
      const e = document.createElementNS(NS, ad);
      for (const [n, v] of Object.entries(a)) if (v !== null && v !== false) e.setAttribute(n, v === true ? '' : String(v));
      ust.appendChild(e); return e;
    };
    const kk = k.kam.k; const w = KW * kk, h = KH * kk; const merkez: ([number, number] | null)[] = [];
    for (const a of iz.adimlar) {
      const sonuk = !!iz.ust && iz.ust !== a.k; let ilk: [number, number] | null = null;
      a.yerler.forEach((m, j) => {
        const s = k.ist[m]; if (!s) return; const [x, y] = ekrana(k.kam, k.W, k.H, s.x, s.y); ilk ??= [x, y];
        const vurgu = iz.ustM === m || iz.ust === a.k;
        el('rect', { class: 'tc-pyk-iz-kutu', x: x - w / 2 - 6, y: y - h / 2 - 6, width: w + 12, height: h + 12, rx: 12 * kk + 6, 'data-alt': j > 0, 'data-sonuk': sonuk, 'data-vurgu': vurgu });
        const t = el('text', { class: 'tc-pyk-iz-ad', x: x - w / 2, y: y - h / 2 - 12, 'data-alt': j > 0, 'data-sonuk': sonuk });
        t.textContent = j ? `${a.k} alt.` : `OP ${a.k}`;
      });
      merkez.push(ilk);
    }
    for (let i = 1; i < merkez.length; i++) {
      const a = merkez[i - 1], b = merkez[i]; if (!a || !b) continue;
      el('path', { class: 'tc-pyk-iz-yol', d: `M${a[0]},${a[1]} Q${(a[0] + b[0]) / 2},${Math.min(a[1], b[1]) - 40 * kk} ${b[0]},${b[1]}`, 'data-sonuk': !!iz.ust });
    }
  }, []);
  const konumla = useCallback((k: Kare) => {
    son.current = k; izCiz(k); if (k.W < 600) return;
    const [ust, alt] = o.bag.paylar();
    for (const c of lr.current) {
      const e = el.current.get(c.tur); if (!e || c.x === null || c.y === null) continue;
      const t = tut.current?.tur === c.tur ? tut.current : c;
      const [sx, sy] = ekrana(k.kam, k.W, k.H, t.x ?? 0, t.y ?? 0); const r = kartOrani(k.kam.k);
      // Kartın görünen kısmı altta kalmasın: boyu ekranın kalanına göre kısalır, tahtadaki yeri değişmez.
      const tam = kartTanimi(c.tur).boy; const mh = Math.round(Math.max(200, Math.min(tam, sy > ust ? (k.H - alt - 8 - sy) / r : tam)));
      e.style.setProperty('--x', `${Math.round(sx)}px`); e.style.setProperty('--y', `${Math.round(sy)}px`); e.style.setProperty('--o', r.toFixed(3)); e.style.setProperty('--mh', `${mh}px`);
      e.toggleAttribute('data-uzak', r < 0.55); e.toggleAttribute('data-hazir', true);
    }
  }, [o.bag, izCiz]);

  // Uzaktan bakınca kart yalnız adıyla bölge gibi görünür; basınca okunur yakınlığa gelinir (ze-rota).
  const yaklas = (c: KartKaydi, e: IsaretOlayi) => {
    const el0 = el.current.get(c.tur); const d = son.current; if (!el0?.hasAttribute('data-uzak') || !d || dar || c.x === null) return;
    e.preventDefault(); e.stopPropagation();
    const b = dunyaKutusu(c, olcu(c.tur)); const hh = Math.min(b.h * KREF, d.H * 0.8);
    o.bag.komut()?.kameraKoy({ x: b.x + b.w / 2, y: b.y + hh / 2 / KREF, k: KREF });
  };

  // Yeri olmayan kart şeridin ilk boş yerine oturur; ekranda okunur değilse kamera ona kayar (tkAc, tkGoster).
  const yerVer = useCallback((k: Kare) => {
    const l = lr.current; const yeni = l.filter((c) => c.x === null); if (!yeni.length || !k.bolge.length) return;
    const y = yerlestir(l, olcu, k.bolge); lr.current = y; o.degis(() => y);
    const t = yeni[yeni.length - 1]?.tur; const c = y.find((x) => x.tur === t);
    if (c && k.W >= 600) {
      const [u, a] = o.bag.paylar(); const kam = gosterKamerasi(dunyaKutusu(c, olcu(c.tur)), atolyeKutulari(k.bolge), k.kam, k.W, k.H, u, a);
      if (kam) o.bag.komut()?.kameraKoy(kam);
    }
  }, [o, olcu]);
  const dizYap = useCallback((d: Kare) => {
    const y = diz(lr.current, olcu, d.bolge); lr.current = y; o.degis(() => y); o.dizBitti();
    if (d.W < 600 || !y.length) return;
    const [u, a] = o.bag.paylar(); const kam = hepsiniSigdir([...atolyeKutulari(d.bolge), ...y.map((c) => dunyaKutusu(c, olcu(c.tur)))], d.W, d.H, u, a);
    if (kam) o.bag.komut()?.kameraKoy(kam);
  }, [o, olcu]);
  const dizR = useRef(o.dizIstegi); dizR.current = o.dizIstegi;
  const kare = useCallback((k: Kare) => { if (dizR.current) { dizR.current = false; dizYap(k); } else yerVer(k); konumla(k); }, [dizYap, yerVer, konumla]);
  useEffect(() => o.bag.abone((kam, W, H, bolge, ist) => kare({ kam, W, H, bolge, ist })), [o.bag, kare]);
  useLayoutEffect(() => { const d = o.bag.komut()?.durum(); if (d) kare(d); });

  useEffect(() => {
    const e = kok.current; if (!e) return undefined;
    const olc = () => setDar(e.clientWidth > 0 && e.clientWidth < 600);
    olc(); if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(olc); ro.observe(e); return () => ro.disconnect();
  }, []);

  // Başlıktan tutup taşıma; bırakınca başka kartın ya da atölyenin üstündeyse en yakın boş yere kayar (tkCozus).
  const basla = (c: KartKaydi, e: IsaretOlayi) => {
    if (dar || (e.target as HTMLElement).closest('button') || c.x === null || c.y === null || !son.current) return;
    e.preventDefault(); const x0 = e.clientX, y0 = e.clientY, cx = c.x, cy = c.y; const k = son.current.kam.k;
    tut.current = { tur: c.tur, x: cx, y: cy }; el.current.get(c.tur)?.setAttribute('data-tut', '');
    if (lr.current[lr.current.length - 1]?.tur !== c.tur) o.degis((l) => [...l.filter((x) => x.tur !== c.tur), ...l.filter((x) => x.tur === c.tur)]);
    const hareket = (ev: PointerEvent) => { tut.current = { tur: c.tur, x: cx + (ev.clientX - x0) / k, y: cy + (ev.clientY - y0) / k }; if (son.current) konumla(son.current); };
    const bit = () => {
      removeEventListener('pointermove', hareket); removeEventListener('pointerup', bit); removeEventListener('pointercancel', bit);
      const t = tut.current; tut.current = null; el.current.get(c.tur)?.removeAttribute('data-tut'); if (!t) return;
      const bolge = son.current?.bolge ?? [];
      const engel = [...atolyeKutulari(bolge), ...lr.current.filter((x) => x.tur !== c.tur && x.x !== null).map((x) => dunyaKutusu(x, olcu(x.tur)))];
      const [x, y] = bosYer(dunyaKutusu({ ...c, x: t.x, y: t.y }, olcu(c.tur)), engel);
      o.degis((l) => l.map((z) => (z.tur === c.tur ? { ...z, x, y } : z)));
    };
    addEventListener('pointermove', hareket); addEventListener('pointerup', bit); addEventListener('pointercancel', bit);
  };

  const gorunen = dar ? o.l.slice(-1) : o.l;
  return (
    <div ref={kok} className="tc-pyk" data-dar={dar ? '' : undefined}>
      <svg className="tc-pyk-iz" aria-hidden="true"><g ref={izEl} /></svg>
      {gorunen.map((c) => {
        const t = kartTanimi(c.tur);
        return (
          <section key={c.tur} className="tc-pyk-kart" data-tur={c.tur} data-kucuk={c.kucuk ? '' : undefined} aria-label={t.ad} onPointerDownCapture={(e) => yaklas(c, e)}
            ref={(e) => { if (e) el.current.set(c.tur, e); else el.current.delete(c.tur); }}>
            <header className="tc-pyk-bas" title={dar ? undefined : 'Tutup tahtada taşıyın'} onPointerDown={(e) => basla(c, e)}>
              <Simge ad={t.simge} boyut="k" /><b>{t.ad}</b><span className="tc-pym-ara" />
              <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-label={c.kucuk ? 'Aç' : 'Küçült'} title={c.kucuk ? 'Aç' : 'Küçült'} onClick={() => o.kucult(c.tur)}>
                <Simge ad={c.kucuk ? 'expand' : 'minus'} boyut="k" />
              </button>
              <button type="button" className="tc-dugme tc-pym-kucuk tc-pym-hayalet tc-pym-simge-d" aria-label="Kartı kapat" title="Kartı kapat" onClick={() => o.kapat(c.tur)}>
                <Simge ad="x" boyut="k" />
              </button>
            </header>
            {!c.kucuk && <div className="tc-pyk-govde">{o.govde(c.tur)}</div>}
          </section>
        );
      })}
    </div>
  );
}
