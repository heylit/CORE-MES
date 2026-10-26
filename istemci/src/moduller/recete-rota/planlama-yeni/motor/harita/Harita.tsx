import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, type ReactNode } from 'react';
import type { DonemOlcegi } from '../../gorunumler.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { saatYaz, type Derleme, type OkunanPlan, type PlanIslemi } from '../kurallar.ts';
import { degisken } from '../ortak.tsx';
import { bul, ciz, type Kutu } from './ciz.ts';
import {
  bekleme, dilimNo, durusOku, gecikmeEtkisi, gecMetin, haritaGruplari, KH, KW, sahneKur, siparisRengi, sigdir, tezgahDurumu,
  yakinlas, yakinlikSiniri, yerlesim, type Aralik, type Kamera, type Sahne,
} from './kurallar.ts';
import { renkleriOku, type HaritaRenkleri } from './renk.ts';
import './harita.css';

// Tezgâh haritasının tuvali (y-atolye atBagla, atDongu, atIpucu; zm-ozet, zo-kontrol): çizim, kaydırma, iki parmakla ve tekerlekle yakınlaşma,
// seçim, ipucu, klavye ve oynatma. Özet hücresinde tekerlek sayfayı kaydırır, harita yalnız Ctrl ile yakınlaşır.
export interface HaritaSecimi { siparis: string | null; adim: string | null; tezgah: string | null }
export interface HaritaOzellikleri {
  bicim: 'ozet' | 'harita';
  c: PlanlamaCalismasi; p: OkunanPlan; cx: Derleme; olcek: DonemOlcegi; r: Aralik; now: number;
  t: number; oynat: boolean; hiz: number;
  secim: HaritaSecimi; mercek: 'durum' | 'etki'; kilavuz: string | null;
  // Yerleşimde düşülen alt pay (oynatıcı) ve sığdırmada üstteki çubukla alttaki oynatıcının kapladığı yer.
  altPay: number; paylar: () => [number, number];
  sec: (s: HaritaSecimi) => void; ciftTik: (m: string) => void; oynatDegistir: () => void; kilavuzKapat: () => void;
  zamanAkti?: (t: number) => void; oynatBitti?: (t: number) => void; yakinlikDegisti?: (yuzde: number) => void;
  ipucuZum?: () => void;
  etiket: string;
  // Önceki planla fark: karşılaştırılan plan (son canlı); kapalıysa verilmez.
  fark?: OkunanPlan | null;
}
export interface HaritaKomutu {
  yakinlas(oran: number): void; sigdir(): void; odakla(j: string): void; tezgahaUc(m: string): void; kilavuzKamera(m: string): void;
}

const az = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const kaba = () => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const tema = () => `${document.documentElement.getAttribute('data-theme') ?? ''}|${typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches}`;

export const Harita = forwardRef<HaritaKomutu, HaritaOzellikleri>(function Harita(o, ref) {
  const cv = useRef<HTMLCanvasElement>(null);
  const [boyut, setBoyut] = useState<[number, number] | null>(null);
  const [ipucu, setIpucu] = useState<{ h: Kutu; x: number; y: number } | null>(null);
  const oz = useRef(o); oz.current = o;
  const durum = useRef({
    kam: null as Kamera | null, kutu: [] as Kutu[], hover: null as Kutu | null, raf: 0, son: 0, t: o.t, tGelen: o.t, giris: az() ? -1 : performance.now(),
    ucus: null as { a: Kamera; b: Kamera; t0: number; d: number } | null, renk: null as { anah: string; R: HaritaRenkleri } | null,
    gecis: null as { dol: Sahne['dol']; t0: number } | null, sahne: null as Sahne | null, boyut: null as [number, number] | null, oran: 0,
    sj: null as string | null, ref: null as { s: Sahne; ops: OkunanPlan['ops'] } | null, bek: null as Record<string, number> | null, etki: null as ReturnType<typeof gecikmeEtkisi> | null, durus: [] as ReturnType<typeof durusOku>,
  });

  const gruplar = useMemo(() => haritaGruplari(o.c.D, o.p, o.cx), [o.c, o.p, o.cx]);
  // Yerleşim alanın oranına göre kurulur; oran değişince kamera yeniden sığdırılır (eski: oran = en/boy * 4).
  const oran = boyut ? Math.round(boyut[0] / Math.max(1, boyut[1]) * 4) : 0;
  const yer = useMemo(() => {
    const [W, H] = boyut ?? [1000, 600];
    return yerlesim(gruplar, Math.max(200, W), Math.max(160, H - 60 - o.altPay));
    // Yalnız oran değişince yeniden kurulur; aynı oranda boy değişikliği yerleşimi bozmaz.
  }, [gruplar, oran]);
  const sahne = useMemo(() => sahneKur(o.c.D, o.p, o.cx, yer, o.r, o.now), [o.c, o.p, o.cx, yer, o.r, o.now]);
  const fark = o.fark ?? null;
  const refSahne = useMemo(() => (fark ? { s: sahneKur(o.c.D, fark, o.cx, yer, o.r, o.now), ops: fark.ops } : null), [fark, o.c, o.cx, yer, o.r, o.now]);
  const durus = useMemo(() => durusOku(o.c), [o.c]);
  const sj = o.secim.adim && o.p.ops[o.secim.adim] ? o.p.ops[o.secim.adim]?.job ?? null : o.secim.siparis;
  const bek = useMemo(() => (sj ? bekleme(o.p, o.cx, sj) : null), [o.p, o.cx, sj]);
  const etki = useMemo(() => (o.mercek === 'etki' ? gecikmeEtkisi(o.c.D, o.p, o.cx) : null), [o.mercek, o.c, o.p, o.cx]);

  const d = durum.current;
  // Plan değişince doluluk çubukları eskisinden yenisine geçer.
  // Oran değişince kamera yeniden sığar (eski atSahne).
  if (d.sahne && d.sahne !== sahne) {
    if (d.oran !== oran) d.kam = null;
    else if (d.sahne.J !== sahne.J && !az()) d.gecis = { dol: d.sahne.dol, t0: performance.now() };
  }
  d.oran = oran; d.sahne = sahne; d.boyut = boyut; d.sj = sj; d.bek = bek; d.etki = etki; d.durus = durus; d.ref = refSahne;
  // Dışarıdan gelen zaman (imleç, Şimdi, gün seçimi) oynatmayı geçersiz kılar; oynarken zaman tuvalde akar.
  if (o.t !== d.tGelen) { d.t = o.t; d.tGelen = o.t; }

  // Bu yardımcılar yalnız ref okur: dinleyiciler bir kez bağlanır, oynatırken her karede yeniden kurulmaz.
  const sigK = (): number => { const [W, H] = d.boyut ?? [0, 0]; const [u, a] = oz.current.paylar(); return d.sahne ? sigdir(d.sahne.bolge, W, H, u, a)?.k ?? 0.4 : 0.4; };
  const yuzdeBildir = () => { const k = d.kam?.k; if (k) oz.current.yakinlikDegisti?.(Math.round(k / sigK() * 100)); };
  const sigdirYap = () => { if (!d.boyut || !d.sahne) return; const [u, a] = oz.current.paylar(); d.kam = sigdir(d.sahne.bolge, d.boyut[0], d.boyut[1], u, a); yuzdeBildir(); };
  const uc = (b: Kamera) => {
    if (!d.kam || az()) { d.kam = b; tetikle(); return; }
    d.ucus = { a: { ...d.kam }, b, t0: performance.now(), d: 600 }; tetikle();
  };

  const ciz1 = (): void => {
    const el = cv.current; if (!el || !el.isConnected) return; const W = el.clientWidth, H = el.clientHeight; if (!W || !H) return;
    const dpr = window.devicePixelRatio || 1;
    if (el.width !== Math.round(W * dpr) || el.height !== Math.round(H * dpr)) { el.width = Math.round(W * dpr); el.height = Math.round(H * dpr); }
    const g = el.getContext('2d'); if (!g) return;
    if (!d.renk || d.renk.anah !== tema()) { const R = renkleriOku(el); if (!R) return; d.renk = { anah: tema(), R }; }
    const s = d.sahne; if (!s) return;
    if (!d.kam) { const [u, a] = oz.current.paylar(); d.kam = sigdir(s.bolge, W, H, u, a); yuzdeBildir(); }
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H); if (!d.kam) return;
    const p = oz.current; const simdi = performance.now();
    if (d.ucus) {
      const u = Math.min(1, (simdi - d.ucus.t0) / d.ucus.d); const e = u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; const { a, b } = d.ucus;
      d.kam = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, k: a.k * Math.pow(b.k / a.k, e) }; if (u >= 1) { d.ucus = null; yuzdeBildir(); }
    }
    const gu = d.gecis ? Math.min(1, (simdi - d.gecis.t0) / 700) : 1; const gecis = d.gecis ? { dol: d.gecis.dol, u: gu } : null; if (gu >= 1) d.gecis = null;
    const giris = d.giris < 0 ? 1e9 : simdi - d.giris; if (giris > 2000) d.giris = -1;
    const adim: PlanIslemi | null = p.secim.adim ? p.p.ops[p.secim.adim] ?? null : null;
    const sonuc = ciz(g, {
      W, H, kam: d.kam, R: d.renk.R, s, D: p.c.D, olcek: p.olcek, r: p.r, t: d.t, durus: d.durus, sj: d.sj, adim, secTez: p.secim.tezgah,
      hover: d.hover, kilavuz: p.kilavuz, bekleme: d.bek, etki: d.sj ? null : d.etki, zaman: simdi / 1000, giris, gecis, oynat: p.oynat, az: az(),
      isRenk: (j) => d.renk?.R.is[siparisRengi(p.c.D, j)] ?? [128, 128, 128], ref: d.ref,
    });
    d.kutu = sonuc.kutu;
  };
  const dongu = (ts: number): void => {
    d.raf = 0; const el = cv.current; if (!el || !el.isConnected) return;
    const dt = d.son ? Math.min(0.1, (ts - d.son) / 1000) : 0; d.son = ts; const p = oz.current;
    if (p.oynat) {
      const son = d.sahne?.son ?? d.t; d.t = Math.min(son, d.t + p.hiz * dt); p.zamanAkti?.(d.t);
      if (d.t >= son) p.oynatBitti?.(d.t);
    }
    ciz1();
    if (!document.hidden && (p.oynat || d.ucus || d.gecis || d.giris >= 0 || !az())) d.raf = requestAnimationFrame(dongu);
  };
  function tetikle(): void { if (!d.raf && typeof requestAnimationFrame === 'function') { d.son = 0; d.raf = requestAnimationFrame(dongu); } }
  useEffect(() => { tetikle(); });
  useEffect(() => {
    const gor = () => { if (!document.hidden) tetikle(); };
    document.addEventListener('visibilitychange', gor);
    return () => { document.removeEventListener('visibilitychange', gor); if (d.raf) cancelAnimationFrame(d.raf); d.raf = 0; };
  }, []);

  // Boyut: tuval yeniden boyutlanınca çizim tazelenir; oran değişince yerleşim ve kamera yeniden kurulur.
  useEffect(() => {
    const el = cv.current; if (!el) return undefined;
    const olc = () => { const b: [number, number] = [el.clientWidth, el.clientHeight]; setBoyut((x) => (x && x[0] === b[0] && x[1] === b[1] ? x : b)); };
    olc(); if (typeof ResizeObserver !== 'function') return undefined;
    const ro = new ResizeObserver(olc); ro.observe(el); return () => ro.disconnect();
  }, []);
  // Özet hücresinin boyu değişince harita yeniden sığar (zm-ozet OZ.boy).
  useEffect(() => { if (o.bicim === 'ozet' || !d.kam) { d.kam = null; tetikle(); } }, [boyut?.[0], boyut?.[1]]);

  useImperativeHandle(ref, () => ({
    yakinlas(oran: number) {
      if (!d.kam || !d.boyut) return; d.ucus = null; d.kam = yakinlas(d.kam, d.boyut[0], d.boyut[1], oran, yakinlikSiniri(sigK())); yuzdeBildir(); tetikle();
    },
    sigdir() { d.ucus = null; sigdirYap(); tetikle(); },
    // Siparişin tezgâhlarını yan karta yer bırakarak gösterir (atOdakla).
    odakla(j: string) {
      const s = d.sahne; const l = s?.byJ[j]; if (!s || !l || !d.kam || !d.boyut) return; const [W, H] = d.boyut;
      const xs = l.map((r) => s.ist[r.m]?.x ?? 0), ys = l.map((r) => s.ist[r.m]?.y ?? 0); const kw = W >= 600 ? Math.min(340, W * 0.4) : 0;
      const k = Math.max(0.2, Math.min(d.kam.k * 1.2, 1.2, (W - 60 - kw) / (Math.max(...xs) - Math.min(...xs) + KW + 80), (H - 260) / (Math.max(...ys) - Math.min(...ys) + KH + 80)));
      uc({ x: (Math.min(...xs) + Math.max(...xs)) / 2 + kw / 2 / k, y: (Math.min(...ys) + Math.max(...ys)) / 2, k });
    },
    tezgahaUc(m: string) { const a = d.sahne?.ist[m]; if (a) uc({ x: a.x, y: a.y, k: Math.max(d.kam?.k ?? 0.6, 0.7) }); },
    // Örnek kutu kılavuz kartının ve çubukların dışındaki boş alanın ortasına gelir (atKilavuzKamera).
    kilavuzKamera(m: string) {
      const a = d.sahne?.ist[m]; if (!a || !d.boyut) return; const [W, H] = d.boyut; const dar = W < 600; const [ust, alt] = oz.current.paylar();
      const sag = dar ? W : W - Math.min(340, W * 0.4) - 16, ust2 = ust + 8, alt2 = dar ? H * 0.52 : H - alt - 8;
      const k = Math.max(0.4, Math.min(1.5, (sag - 16) / (KW + 110), (alt2 - ust2) / (KH + 70)));
      uc({ x: a.x + 10 - (sag / 2 - W / 2) / k, y: a.y - ((ust2 + alt2) / 2 - H / 2) / k, k });
    },
  }), []);

  // İşaretçi: sürükleyince kaydırır, iki parmakla yakınlaşır, dokununca seçer. Çip sürükleme motor bağlanınca açılır (459/4 a).
  useEffect(() => {
    const el = cv.current; if (!el) return undefined;
    const yer = (e: PointerEvent | WheelEvent | MouseEvent): [number, number] => { const r = el.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    let bas: { x: number; y: number; kx: number; ky: number; h: Kutu | null; pan?: boolean; pinch?: number; k?: number } | null = null; const ptr = new Map<number, [number, number]>();
    const asagi = (e: PointerEvent) => {
      el.setPointerCapture?.(e.pointerId); const [x, y] = yer(e); ptr.set(e.pointerId, [x, y]); if (!d.kam) return;
      if (ptr.size === 2) { const [a, b] = [...ptr.values()] as [[number, number], [number, number]]; bas = { x, y, kx: d.kam.x, ky: d.kam.y, h: null, pinch: Math.hypot(a[0] - b[0], a[1] - b[1]), k: d.kam.k }; return; }
      bas = { x, y, kx: d.kam.x, ky: d.kam.y, h: bul(d.kutu, x, y) };
    };
    const hareket = (e: PointerEvent) => {
      const [x, y] = yer(e); if (ptr.has(e.pointerId)) ptr.set(e.pointerId, [x, y]);
      if (bas?.pinch && ptr.size === 2 && d.kam) { const [a, b] = [...ptr.values()] as [[number, number], [number, number]]; d.kam.k = Math.max(0.15, Math.min(3, (bas.k ?? 1) * Math.hypot(a[0] - b[0], a[1] - b[1]) / bas.pinch)); yuzdeBildir(); tetikle(); return; }
      if (!bas) {
        const h = bul(d.kutu, x, y); const ad = h ? h.tur + ('m' in h ? h.m : '') + ('job' in h ? h.job : '') : ''; const once = d.hover; const oad = once ? once.tur + ('m' in once ? once.m : '') + ('job' in once ? once.job : '') : '';
        if (ad !== oad) { d.hover = h; el.style.setProperty('cursor', h ? 'pointer' : 'grab'); tetikle(); }
        setIpucu(h && !kaba() ? { h, x: e.clientX, y: e.clientY } : null); return;
      }
      const dx = x - bas.x, dy = y - bas.y;
      if (Math.hypot(dx, dy) > 5 && d.kam) { bas.pan = true; d.ucus = null; d.kam.x = bas.kx - dx / d.kam.k; d.kam.y = bas.ky - dy / d.kam.k; setIpucu(null); tetikle(); }
    };
    const bitir = (e: PointerEvent) => {
      ptr.delete(e.pointerId); if (!bas) return; const b = bas; bas = null; if (b.pinch || b.pan) return;
      const h = b.h; setIpucu(null); const p = oz.current; const s = p.secim;
      if (!h) { if (s.siparis || s.adim || s.tezgah) p.sec({ siparis: null, adim: null, tezgah: null }); return; }
      if (p.kilavuz) p.kilavuzKapat();
      if (h.tur === 'ist') { p.sec({ siparis: null, adim: null, tezgah: s.tezgah === h.m ? null : h.m }); return; }
      p.sec({ siparis: d.sj === h.job && h.tur !== 'cip' ? null : h.job, adim: h.tur === 'cip' ? h.id : null, tezgah: null });
    };
    const ayril = () => { if (!bas) { d.hover = null; setIpucu(null); tetikle(); } };
    const iptal = (e: PointerEvent) => { ptr.delete(e.pointerId); bas = null; };
    const teker = (e: WheelEvent) => {
      const p = oz.current;
      if (p.bicim === 'ozet' && !e.ctrlKey && !e.metaKey) { p.ipucuZum?.(); return; }
      e.preventDefault(); if (!d.kam || !d.boyut) return;
      let dd = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY; dd = Math.max(-120, Math.min(120, dd));
      const [x, y] = yer(e); d.ucus = null; d.kam = yakinlas(d.kam, d.boyut[0], d.boyut[1], Math.exp(-dd * 0.0018), yakinlikSiniri(sigK()), x, y); yuzdeBildir(); tetikle();
    };
    const cift = (e: MouseEvent) => { const [x, y] = yer(e); const h = bul(d.kutu, x, y); if (h?.tur === 'ist') oz.current.ciftTik(h.m); };
    const tus = (e: KeyboardEvent) => {
      if (!d.kam) return; const adim = 60 / d.kam.k; let ok = true;
      if (e.key === 'ArrowLeft') d.kam.x -= adim; else if (e.key === 'ArrowRight') d.kam.x += adim; else if (e.key === 'ArrowUp') d.kam.y -= adim; else if (e.key === 'ArrowDown') d.kam.y += adim;
      else if (e.key === '+' || e.key === '=') d.kam.k = Math.min(3, d.kam.k * 1.2); else if (e.key === '-') d.kam.k = Math.max(0.15, d.kam.k / 1.2);
      else if (e.key === ' ') { if (oz.current.bicim === 'harita') oz.current.oynatDegistir(); }
      else if (e.key === '0') sigdirYap(); else ok = false;
      if (ok) { e.preventDefault(); e.stopPropagation(); d.ucus = null; yuzdeBildir(); tetikle(); }
    };
    el.addEventListener('pointerdown', asagi); el.addEventListener('pointermove', hareket); el.addEventListener('pointerup', bitir); el.addEventListener('pointercancel', iptal);
    el.addEventListener('pointerleave', ayril); el.addEventListener('wheel', teker, { passive: false }); el.addEventListener('dblclick', cift); el.addEventListener('keydown', tus);
    return () => {
      el.removeEventListener('pointerdown', asagi); el.removeEventListener('pointermove', hareket); el.removeEventListener('pointerup', bitir); el.removeEventListener('pointercancel', iptal);
      el.removeEventListener('pointerleave', ayril); el.removeEventListener('wheel', teker); el.removeEventListener('dblclick', cift); el.removeEventListener('keydown', tus);
    };
  }, []);

  return (
    <>
      <canvas ref={cv} className="tc-pym-at-cv" tabIndex={0} role="img" aria-label={o.etiket} />
      {ipucu && <Ipucu {...ipucu}>{ipucuIcerik(ipucu.h, o, sahne, durus, d.t)}</Ipucu>}
    </>
  );
});

function Ipucu({ x, y, children }: { x: number; y: number; children: ReactNode }) {
  const el = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const e = el.current; if (!e) return;
    const w = e.offsetWidth, h = e.offsetHeight;
    degisken({ '--x': `${Math.min(window.innerWidth - w - 8, x + 14)}px`, '--y': `${Math.max(8, y - h - 10)}px` })(e);
  });
  return <div ref={el} className="tc-pym-ipucu" role="tooltip">{children}</div>;
}

function ipucuIcerik(h: Kutu, o: HaritaOzellikleri, s: Sahne, durus: ReturnType<typeof durusOku>, t: number): ReactNode {
  if (h.tur === 'ist') {
    const st = tezgahDurumu(s, durus, h.m, t); const v = s.dol[h.m]?.[dilimNo(o.r, t)];
    return (
      <>
        <b className="tc-pym-mono">{h.m}</b>
        <span>{st.dur === 'ariza' ? 'Arıza ya da bakım' : st.cal ? `Çalışıyor: ${st.cal.id}` : 'Boşta'}</span>
        <span>Bu dilimde doluluk {v == null ? 'kapalı' : `%${Math.round(v * 100)}`} · sırada {st.sira.length}{st.sira.length >= 5 ? '+' : ''}</span>
        <span className="tc-pym-kucuk-yazi">Tıklayın: ayrıntı · çift tıklayın: gün planı</span>
      </>
    );
  }
  if (h.tur === 'cip') {
    const r = o.p.ops[h.id];
    return (
      <>
        <b className="tc-pym-mono">{h.id}</b>
        <span>{o.cx.byId[h.id]?.ad ?? ''}</span>
        {r && <span className="tc-pym-mono">{saatYaz(o.c.D, r.S)} → {saatYaz(o.c.D, r.C)}</span>}
        <span className="tc-pym-kucuk-yazi">Tıklayın: siparişin yolu</span>
      </>
    );
  }
  const J = s.J[h.job]; const sp = o.c.D.siparisler.find((x) => x.id === h.job); const urun = o.c.D.urunler.find((u) => u.id === sp?.urun);
  const gec = (J?.T ?? 0) > 0.05;
  return (
    <>
      <b className="tc-pym-mono">{h.job}</b>
      <span>{urun?.ad ?? sp?.urun ?? ''}</span>
      <span data-ton={gec ? 'hata' : 'tamam'}>{gec ? `${gecMetin(J?.T ?? null)} geç` : 'Termine yetişiyor'}</span>
      <span className="tc-pym-kucuk-yazi">Tıklayın: bütün yolu</span>
    </>
  );
}

