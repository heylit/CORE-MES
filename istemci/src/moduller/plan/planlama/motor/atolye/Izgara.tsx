import { useEffect, useLayoutEffect, useMemo, useRef, useState, type FocusEvent as ReactFocusEvent, type KeyboardEvent as ReactKeyboardEvent, type MutableRefObject, type PointerEvent as ReactPointerEvent, type TouchEvent as ReactTouchEvent } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import { etkiAcik } from '../../../../../ortak/veri/etki.ts';
import { tasimaSaati } from './gonder.ts';
import type { PlanIslemi } from '../kurallar.ts';
import { degisken } from '../ortak.tsx';
import {
  secKacis, akis, cubukYazisi, darbogaz, kisaNo, doluluklar, gercekOku, haftaHucreleri, ilerleme, kapaliAraliklar, sabitMi, satirlar, saatPiksel, sure, suzUyar, tezGrup, tz,
  ufuk, ufukSaati, zamanBasliklari, type PanoSatiri, duruslar,
} from './kurallar.ts';
import { ankraj, type Ortam } from './Pano.tsx';

// Tezgâh çizelgesi (cizPano, cizCubuk, cizOklar): gün ve saat başlığı, tezgâh ve fason satırları, kapalı saat, arıza, çubuklar, donuk bölge,
// şimdi çizgisi ve motorun ufku. Yıl ölçeğinde haftalık doluluk hücreleri. Seçili siparişin önceki-sonraki okları çubukların yerinden ölçülür.
// Çubuğu sürükleyip taşımak motor ister (357 b): çubuk seçilir, kartı açılır.
export function Izgara({ ort, pano, parla }: { ort: Ortam; pano: MutableRefObject<HTMLDivElement | null>; parla: string | null }) {
  const { c, p, cx, now, donuk, olcek, suz, secJob, secOp } = ort; const D = c.D;
  const [gen, setGen] = useState({ w: 0, e: 115 });
  const etiket = useRef<HTMLDivElement | null>(null);
  const alan = useRef<HTMLDivElement | null>(null);
  const hedef = useRef<number | null>(null);
  useLayoutEffect(() => {
    const pn = pano.current; if (!pn) return undefined;
    const olc = () => setGen({ w: pn.clientWidth, e: etiket.current?.offsetWidth || 115 });
    olc();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const g = new ResizeObserver(olc); g.observe(pn);
    return () => g.disconnect();
  }, [pano]);
  const k = saatPiksel(Math.max(0, gen.w - gen.e), olcek);
  const H = ufuk(p, olcek); const W = H * k; const yil = olcek >= 8760;
  // Ölçek değişince pano şimdinin biraz öncesine (ya da seçilen haftaya) kayar.
  useLayoutEffect(() => {
    const pn = pano.current; if (!pn) return;
    const t = hedef.current ?? Math.max(0, now - 2); hedef.current = null;
    pn.scrollLeft = Math.max(0, t * k);
  }, [olcek, gen.w > 0]);

  const bas = useMemo(() => zamanBasliklari(D, cx, H, k, olcek), [D, cx, H, k, olcek]);
  const R = useMemo(() => satirlar(D, p), [D, p]);
  const oran = useMemo(() => doluluklar(D, p, cx, now, now + olcek), [D, p, cx, now, olcek]);
  const dar = darbogaz(oran);
  const dn = duruslar(c);
  const emirTez = suz?.j ? new Set(Object.values(p.ops).filter((r) => r.job === suz.j || r.job.startsWith(`${suz.j}/`)).map((r) => r.m)) : null;
  const opsM = useMemo(() => {
    const m = new Map<string, PlanIslemi[]>();
    for (const r of Object.values(p.ops)) if (Number.isFinite(r.C)) { const l = m.get(r.m) ?? []; l.push(r); m.set(r.m, l); }
    return m;
  }, [p]);

  const satir = (S: PanoSatiri) => {
    const M = cx.M[S.m]; const ops = opsM.get(S.m) ?? [];
    const soluk = !!suz && ((suz.g && S.grup !== suz.g) || (suz.m && S.m !== suz.m) || (emirTez && !emirTez.has(S.m)));
    const o = oran[S.m] ?? 0; const darb = dar === S.m; const y = Math.round(o * 100);
    return (
      <div key={S.m} className="tc-pym-tp-satir" data-m={S.m} data-son={S.son ? '' : undefined} data-soluk={soluk ? '' : undefined}>
        <button type="button" className="tc-pym-tp-m" data-darbogaz={darb ? '' : undefined} title={`${S.ad} · görünen sürede doluluk %${y}${darb ? ' · darboğaz' : ''}`}
          onClick={(e) => ort.kartAc({ tur: 'gunluk', m: S.m }, ankraj(e))}>
          <b>{S.fason ? S.m.slice(1) : S.m}{M && <span className="tc-pym-tp-yuzde">{darb && <Simge ad="fire" boyut="k" />}{`%${y}`}</span>}</b>
          <small>{S.ad}</small>
          {M && <span className="tc-pym-tp-yuk"><i ref={degisken({ '--o': `${o * 100}%` })} /></span>}
        </button>
        <div className="tc-pym-tp-zaman" ref={degisken({ '--w': `${W}px` })}>
          {M && !yil && kapaliAraliklar(cx, S.m, H).map(([a, b]) => <div key={a} className="tc-pym-tp-kapali" ref={degisken({ '--x': `${a * k}px`, '--w': `${(b - a) * k}px` })} />)}
          {dn.filter((x) => x.m === S.m).map((x) => (
            <div key={x.from} className="tc-pym-tp-ariza" ref={degisken({ '--x': `${x.from * k}px`, '--w': `${(x.to - x.from) * k}px` })}><Simge ad="alert" boyut="k" />Arıza</div>
          ))}
          {yil ? haftaHucreleri(cx, S.m, ops, H).map((h) => (
            <button key={h.w0} type="button" className="tc-pym-tp-hafta" data-dolu={h.oran >= 0.85 ? '' : undefined} aria-label={`${tz(D, h.w0).slice(0, -6)} haftası`}
              title={`${tz(D, h.w0).slice(0, -6)} haftası · doluluk %${Math.round(h.oran * 100)} · haftaya git`}
              ref={degisken({ '--x': `${h.w0 * k}px`, '--w': `${Math.max(4, 168 * k - 1)}px`, '--yuk': `${Math.max(12, Math.round(h.oran * 100))}%` })}
              onClick={() => { hedef.current = h.w0; ort.olcekSec(168); }} />
          )) : ops.map(cubuk)}
        </div>
      </div>
    );
  };

  const [oklar, setOklar] = useState<{ w: number; h: number; yol: { d: string; kr: boolean }[]; yazi: { x: number; y: number; t: string; kr: boolean }[] } | null>(null);
  // Okların satırı çubukların çizilmiş yerinden ölçülür (cizOklar); yatay yeri planın saatinden hesaplanır: çubuğun `left` ve `width`
  // geçişi sürerken ölçülen yer ölçek değişmeden önceki yerdi, ok boşluğa düşüyordu.
  useLayoutEffect(() => {
    const al = alan.current;
    if (!al || !secJob || yil) { setOklar(null); return; }
    const A = akis(p, cx, ort.hazir, secJob); if (!A) { setOklar(null); return; }
    const ar = al.getBoundingClientRect(); const yer = new Map<string, { x0: number; x1: number; y: number }>();
    for (const x of A.L) {
      const el = al.querySelector(`[data-id="${secKacis(x.id)}"]`); const r = p.ops[x.id]; if (!el || !r) continue;
      const b = el.getBoundingClientRect(); const x0 = gen.e + r.S * k;
      yer.set(x.id, { x0, x1: x0 + Math.max(3, (r.C - r.S) * k), y: b.top - ar.top + b.height / 2 });
    }
    const yol: { d: string; kr: boolean }[] = [], yazi: { x: number; y: number; t: string; kr: boolean }[] = [];
    for (const x of A.L) for (const [pid] of cx.byId[x.id]?.pr ?? []) {
      const a = yer.get(pid), b = yer.get(x.id); if (!a || !b) continue;
      const kr = x.kritik && x.onc === pid; const dx = Math.max(24, Math.abs(b.x0 - a.x1) / 2);
      yol.push({ d: `M${a.x1},${a.y} C${a.x1 + dx},${a.y} ${b.x0 - dx},${b.y} ${b.x0 - 3},${b.y}`, kr });
      if (x.onc === pid && x.bek >= 1 && b.x0 - a.x1 > 40) yazi.push({ x: (a.x1 + b.x0) / 2, y: (a.y + b.y) / 2 - 6, t: sure(x.bek), kr });
    }
    setOklar({ w: al.offsetWidth, h: al.offsetHeight, yol, yazi });
  }, [secJob, k, H, p, cx, yil, R, gen.e]);
  // Sürükle-bırak (1981 b): yatay kayma saati, bırakılan satır tezgâhı verir; iş orada kilitlenir (sunucu komutu). Altı pikselden kısa hareket
  // dokunmadır, iş kartını açar. Uygun olmayan tezgâha bırakılan iş kendi tezgâhında kalır, yalnız saati değişir.
  // Kararlar 2081-1..5: çubuk gönderilecek saatle (çeyrek saat, şimdiden önce değil) adım adım ilerler; eski yerinde kesikli kutu kalır;
  // yanında tezgâh ve saat ipucu, başka işle üst üste binince kırmızı çerçeve (motor bırakınca yine çözer); kenara gelince çizelge kayar.
  // Klavyede oklar aynı önizlemeyi kurar, Enter taşır, Esc vazgeçer. Yardımlar ve kayma kurum ayarıyla kapanır (etki.ts).
  type Suruk = {
    id: string; m: string; S: number; C: number; x0: number; y0: number; el: HTMLElement; oldu: boolean; hedef: HTMLElement | null;
    sl0: number; px: number; py: number; hayalet: HTMLElement | null; kare: number; klavye: { dS: number; m: string } | null;
  };
  const suruk = useRef<Suruk | null>(null);
  const birakti = useRef(false);
  const yuzen = useRef<HTMLDivElement | null>(null);
  const bilgiZamani = useRef(0);
  const hedefSatir = (x: number, y: number): HTMLElement | null =>
    (typeof document.elementsFromPoint === 'function' ? document.elementsFromPoint(x, y) : []).map((e) => e.closest<HTMLElement>('.tc-pym-tp-satir[data-m]')).find((e) => e) ?? null;
  // Yüzen kart (ipucu ve iş bilgisi) panonun içinde tek öğedir; konum ölçüden gelir, tasarım değişkeni olarak yazılır.
  const yuzenGoster = (satirlar: readonly string[], x: number, y: number, ton: 'bilgi' | 'tasima' | 'cakisma') => {
    const pn = pano.current; if (!pn) return;
    let el = yuzen.current;
    if (!el) { el = document.createElement('div'); el.className = 'tc-pym-tp-yuzen'; el.setAttribute('role', 'status'); pn.appendChild(el); yuzen.current = el; }
    el.replaceChildren(...satirlar.map((t, i) => { const d = document.createElement(i === 0 ? 'b' : 'span'); d.textContent = t; return d; }));
    const pr = pn.getBoundingClientRect();
    el.style.setProperty('--yx', `${x - pr.left + pn.scrollLeft}px`); el.style.setProperty('--yy', `${y - pr.top + pn.scrollTop}px`);
    el.dataset.ton = ton; el.dataset.acik = '';
    // Sağ kenara sığmayan kart imlecin soluna açılır (dar ekranda pano dışına taşmasın).
    if (x + el.offsetWidth + 24 > pr.right && x - pr.left > pr.right - x) el.dataset.yan = 'sol'; else delete el.dataset.yan;
  };
  const yuzenGizle = () => { window.clearTimeout(bilgiZamani.current); if (yuzen.current) delete yuzen.current.dataset.acik; };
  useEffect(() => () => { window.clearTimeout(bilgiZamani.current); yuzen.current?.remove(); yuzen.current = null; }, []);
  const cakisiyor = (id: string, m: string, S: number, C: number) => (opsM.get(m) ?? []).some((o) => o.id !== id && o.S < C - 1e-9 && o.C > S + 1e-9);
  const surukBit = () => {
    const s = suruk.current; suruk.current = null; if (!s) return;
    cancelAnimationFrame(s.kare);
    delete s.el.dataset.surukle; delete s.el.dataset.cakisma; s.el.style.removeProperty('--dx'); s.el.style.removeProperty('--dy');
    s.hayalet?.remove();
    if (s.hedef) delete s.hedef.dataset.hedef;
    yuzenGizle();
  };
  // Önizleme: gönderilecek saat ve tezgâh; çubuk oraya oturur, ipucu ve çakışma ona göre yazılır.
  const onizle = (s: Suruk): { m: string; S: number } => {
    const yardim = etkiAcik('gantt-yardim');
    const adaylar = cx.byId[s.id]?.c ?? [];
    let m: string; let S: number; let dy: number; let x: number; let y: number; let uygunsuz = false;
    if (s.klavye) {
      m = s.klavye.m; S = tasimaSaati(s.S + s.klavye.dS, now);
      const kendi = s.el.closest<HTMLElement>('.tc-pym-tp-satir'); const hedef = alan.current?.querySelector<HTMLElement>(`.tc-pym-tp-satir[data-m="${secKacis(m)}"]`) ?? null;
      dy = kendi && hedef ? hedef.offsetTop - kendi.offsetTop : 0;
      if (hedef !== s.hedef) { if (s.hedef) delete s.hedef.dataset.hedef; if (hedef && m !== s.m) hedef.dataset.hedef = ''; s.hedef = m !== s.m ? hedef : null; }
      const b = s.el.getBoundingClientRect(); x = b.left + (S - s.S) * k; y = b.top + dy;
    } else {
      const kayma = (pano.current?.scrollLeft ?? s.sl0) - s.sl0;
      const hm = s.hedef?.dataset.m ?? null; m = hm && adaylar.includes(hm) ? hm : s.m; uygunsuz = hm !== null && hm !== s.m && m === s.m;
      S = tasimaSaati(s.S + (s.px - s.x0 + kayma) / k, now); dy = s.py - s.y0; x = s.px; y = s.py;
    }
    s.el.style.setProperty('--dx', `${(S - s.S) * k}px`); s.el.style.setProperty('--dy', `${dy}px`);
    const C = S + (s.C - s.S); const cak = yardim && cakisiyor(s.id, m, S, C);
    if (cak) s.el.dataset.cakisma = ''; else delete s.el.dataset.cakisma;
    if (yardim) {
      if (!s.hayalet && s.el.parentElement) {
        const h = document.createElement('div'); h.className = 'tc-pym-tp-hayalet'; h.setAttribute('aria-hidden', 'true');
        for (const v of ['--x', '--w']) h.style.setProperty(v, s.el.style.getPropertyValue(v));
        s.el.parentElement.insertBefore(h, s.el); s.hayalet = h;
      }
      yuzenGoster([`${m} · ${tz(D, S)} → ${tz(D, C)}`, ...(uygunsuz ? ['Bu tezgâha uygun değil; kendi tezgâhında kalır'] : []), ...(cak ? ['Başka işle üst üste; bırakınca motor yeniden dizer'] : []), ...(s.klavye ? ['Enter taşır, Esc vazgeçer'] : [])], x, y, cak ? 'cakisma' : 'tasima');
    }
    return { m, S };
  };
  // Kenarda kayma: imleç panonun sol (etiket sütunundan sonra) ya da sağ kenarına yaklaştıkça çizelge o yöne hızlanarak kayar.
  const KENAR = 48; const KAYMA_HIZI = 14;
  const kenarKay = (s: Suruk) => {
    const pn = pano.current; if (!pn || !etkiAcik('gantt-kayma')) return;
    const r = pn.getBoundingClientRect();
    const sol = r.left + gen.e + KENAR - s.px, sag = s.px - (r.right - KENAR);
    const hiz = sol > 0 ? -Math.min(1, sol / KENAR) * KAYMA_HIZI : sag > 0 ? Math.min(1, sag / KENAR) * KAYMA_HIZI : 0;
    cancelAnimationFrame(s.kare);
    if (hiz === 0) return;
    const adim = () => {
      if (suruk.current !== s) return;
      const once = pn.scrollLeft; pn.scrollLeft = once + hiz;
      if (pn.scrollLeft === once) return;
      onizle(s); s.kare = requestAnimationFrame(adim);
    };
    s.kare = requestAnimationFrame(adim);
  };
  const yeniSuruk = (r: PlanIslemi, el: HTMLElement, x: number, y: number): Suruk => ({
    id: r.id, m: r.m, S: r.S, C: r.C, x0: x, y0: y, el, oldu: false, hedef: null, sl0: pano.current?.scrollLeft ?? 0, px: x, py: y, hayalet: null, kare: 0, klavye: null,
  });
  const surukle = (r: PlanIslemi, acik: boolean) => (acik ? {
    onPointerDown: (e: ReactPointerEvent<HTMLElement>) => {
      if (e.button > 0 || !ort.tasi) return;
      surukBit(); yuzenGizle();
      suruk.current = yeniSuruk(r, e.currentTarget, e.clientX, e.clientY);
    },
    onPointerMove: (e: ReactPointerEvent<HTMLElement>) => {
      const s = suruk.current; if (!s || s.id !== r.id || s.klavye) return;
      const dx = e.clientX - s.x0, dy = e.clientY - s.y0;
      if (!s.oldu) { if (Math.hypot(dx, dy) < 6) return; s.oldu = true; s.el.setPointerCapture?.(e.pointerId); s.el.dataset.surukle = ''; }
      s.px = e.clientX; s.py = e.clientY;
      const h = hedefSatir(e.clientX, e.clientY);
      if (h !== s.hedef) { if (s.hedef) delete s.hedef.dataset.hedef; if (h) h.dataset.hedef = ''; s.hedef = h; }
      onizle(s); kenarKay(s);
    },
    onPointerUp: (e: ReactPointerEvent<HTMLElement>) => {
      const s = suruk.current; if (!s || s.id !== r.id || s.klavye) return;
      const oldu = s.oldu; s.px = e.clientX; s.py = e.clientY;
      const varis = oldu && Number.isFinite(e.clientX) ? onizle(s) : null;
      surukBit();
      if (!varis || !ort.tasi) return;
      birakti.current = true;
      ort.tasi(r.id, varis.m, varis.S);
    },
    onPointerCancel: surukBit,
    onKeyDown: (e: ReactKeyboardEvent<HTMLElement>) => {
      if (!ort.tasi) return;
      let s = suruk.current;
      // Fareyle sürüklerken Esc vazgeçer; ardından gelen tıklama iş kartını açmaz.
      if (e.key === 'Escape' && (s?.klavye || s?.oldu)) { e.preventDefault(); if (s.oldu) birakti.current = true; surukBit(); return; }
      if (e.key === 'Enter' && s?.klavye && s.id === r.id) {
        e.preventDefault();
        const varis = onizle(s); const degisti = varis.m !== r.m || varis.S !== tasimaSaati(r.S, now);
        surukBit();
        if (degisti) ort.tasi(r.id, varis.m, varis.S);
        return;
      }
      const yatay = e.key === 'ArrowLeft' || e.key === 'ArrowRight'; const dikey = e.key === 'ArrowUp' || e.key === 'ArrowDown';
      if (!yatay && !dikey) return;
      e.preventDefault();
      if (!s || s.id !== r.id || !s.klavye) {
        surukBit(); yuzenGizle();
        const b = e.currentTarget.getBoundingClientRect();
        s = yeniSuruk(r, e.currentTarget, b.left, b.top); s.klavye = { dS: 0, m: r.m }; s.el.dataset.surukle = ''; suruk.current = s;
      }
      const kl = s.klavye!;
      if (yatay) kl.dS += (e.key === 'ArrowRight' ? 1 : -1) * (e.shiftKey ? 1 : 0.25);
      else {
        const adaylar = R.map((x) => x.m).filter((m) => (cx.byId[r.id]?.c ?? []).includes(m) || m === r.m);
        const i = adaylar.indexOf(kl.m); const j = Math.max(0, Math.min(adaylar.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1)));
        kl.m = adaylar[j] ?? kl.m;
      }
      onizle(s);
    },
    onBlur: () => { if (suruk.current?.klavye && suruk.current.id === r.id) surukBit(); else yuzenGizle(); },
  } : { onBlur: () => { yuzenGizle(); } });
  // İş bilgisi (karar 2081-6): tarayıcı başlığı yerine tema uyumlu kart; fareyle kısa beklemede, klavye odağında ve dokunmada basılı tutunca açılır.
  // Kurum yardımları kapattıysa eski başlık kalır.
  const bilgi = (r: PlanIslemi, ad: string, il: number | null) => [`${ort.emirNo(r.job)} · ${ad}`, `${tz(D, r.S)} → ${tz(D, r.C)}`, ...(il != null ? [`İlerleme %${Math.round(il * 100)}`] : [])];
  const bilgiOlaylari = (satirlarBilgi: readonly string[]) => {
    const ac = (el: HTMLElement, gecikme: number) => {
      window.clearTimeout(bilgiZamani.current);
      bilgiZamani.current = window.setTimeout(() => {
        if (suruk.current?.oldu || suruk.current?.klavye) return;
        const b = el.getBoundingClientRect(); yuzenGoster(satirlarBilgi, b.left, b.bottom + 4, 'bilgi');
      }, gecikme);
    };
    return {
      onPointerEnter: (e: ReactPointerEvent<HTMLElement>) => { if (e.pointerType !== 'touch') ac(e.currentTarget, 350); },
      onPointerLeave: () => { if (!suruk.current?.oldu) yuzenGizle(); },
      onTouchStart: (e: ReactTouchEvent<HTMLElement>) => ac(e.currentTarget, 450),
      onTouchEnd: () => { window.setTimeout(yuzenGizle, 1500); },
      onFocus: (e: ReactFocusEvent<HTMLElement>) => { if (e.currentTarget.matches(':focus-visible')) ac(e.currentTarget, 0); },
    };
  };

  const sb = secJob ? ort.bilgi.get(secJob) : null; const A = secJob && !yil ? akis(p, cx, ort.hazir, secJob) : null;
  const ofs = gen.e;

  return (
    <div className="tc-pym-tp-pano" ref={pano}>
      <div className="tc-pym-tp-alan" ref={(el) => { alan.current = el; degisken({ '--w': `${W}px` })(el); }}>
        <div className="tc-pym-tp-olcek">
          <div className="tc-pym-tp-olcek-bos" ref={etiket}>
            <button type="button" title="İlk saatler donuk: bu bölgedeki işler taşınmaz" onClick={(e) => ort.kartAc({ tur: 'dondurma' }, ankraj(e))}>
              <Simge ad="lock" boyut="k" />{`${donuk} sa`}
            </button>
          </div>
          <div className="tc-pym-tp-zaman" ref={degisken({ '--w': `${W}px` })}>
            {bas.gunler.map((g) => (
              <div key={g.x} className="tc-pym-tp-gun" data-tatil={g.tatil ? '' : undefined} data-kisa={g.kisa ? '' : undefined} data-hafta={g.haftaBasi ? '' : undefined}
                title={g.baslik ?? undefined} ref={degisken({ '--x': `${g.x}px`, '--w': `${g.w}px` })}>{g.ad}</div>
            ))}
            {bas.saatler.map((s) => <span key={s.x} className="tc-pym-tp-saat" ref={degisken({ '--x': `${s.x}px` })}>{s.ad}</span>)}
          </div>
        </div>
        {R.map(satir)}
        <div className="tc-pym-tp-donuk" ref={degisken({ '--x': `${now * k}px`, '--w': `${donuk * k}px` })} />
        <div className="tc-pym-tp-simdi" title="Şimdi" ref={degisken({ '--x': `${now * k}px` })} />
        {H > ufukSaati() && (
          <div className="tc-pym-tp-ufuk" ref={degisken({ '--x': `${ufukSaati() * k}px` })}>
            <span><Simge ad="alert" boyut="k" />{`Motor ${Math.round(ufukSaati() / 24 / 7)} hafta planlar; ötesi için talep tahmini gerekir`}</span>
          </div>
        )}
        {oklar && (
          <svg className="tc-pym-tp-oklar" width={oklar.w} height={oklar.h} aria-hidden="true">
            <defs>
              <marker id="tc-pym-tp-uc" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker>
              <marker id="tc-pym-tp-uck" data-kritik="" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker>
            </defs>
            {sb?.due != null && <><line data-tur="termin" x1={ofs + sb.due * k} x2={ofs + sb.due * k} y1={0} y2={oklar.h} /><text data-tur="termin" x={ofs + sb.due * k + 4} y={14}>{`Termin ${secJob ?? ''}`}</text></>}
            {A?.malzeme && A.bas0 > cx.now + 0.01 && <><line data-tur="malzeme" x1={ofs + A.bas0 * k} x2={ofs + A.bas0 * k} y1={0} y2={oklar.h} /><text data-tur="malzeme" x={ofs + A.bas0 * k + 4} y={28}>Malzeme</text></>}
            {oklar.yol.map((y, i) => <path key={i} d={y.d} data-kritik={y.kr ? '' : undefined} markerEnd={`url(#tc-pym-tp-uc${y.kr ? 'k' : ''})`} />)}
            {oklar.yazi.map((y, i) => <text key={i} x={y.x} y={y.y} data-kritik={y.kr ? '' : undefined}>{y.t}</text>)}
          </svg>
        )}
      </div>
    </div>
  );

  // Çubuk bileşen değil işlevdir: her çizimde yeniden takılmasın (parlama sürsün).
  function cubuk(r: PlanIslemi) {
    const x = ort, kk = k, pr = parla === r.id;
    const w = Math.max(3, (r.C - r.S) * kk), xx = r.S * kk;
    const b = x.bilgi.get(r.job); const o = cx.byId[r.id]; const ad = o?.ad ?? ''; const ka = r.id.slice(r.job.length + 1);
    const sabit = sabitMi(r, now, donuk);
    const vur = !!secJob && secJob === r.job; const soluk = (!!secJob && !vur) || (!!suz && !suzUyar(D, suz, r));
    const g = gercekOku(c, r.id); const il = ilerleme(r, g, cx.jobs[r.job]?.adet ?? 0, now);
    const sap = g && g.plan != null ? g.S - g.plan : 0;
    const yz = cubukYazisi(r, ka, ad, w, (j) => kisaNo(x.emirNo(j)));
    const yardim = etkiAcik('gantt-yardim'); const bilgiMetni = bilgi(r, ad, il);
    return (
      <button key={r.id} type="button" className="tc-pym-tp-cubuk" data-id={r.id} data-durum={b && b.durum !== 'iyi' ? b.durum : undefined} data-sabit={sabit ? '' : undefined}
        data-fason={r.fas ? '' : undefined} data-soluk={soluk ? '' : undefined} data-vurgu={vur ? '' : undefined} data-parla={pr ? '' : undefined}
        data-grup={tezGrup(D, r.m)} aria-pressed={secOp === r.id}
        title={yardim ? undefined : bilgiMetni.join(' · ')} aria-description={yardim ? bilgiMetni.join(' · ') : undefined}
        ref={degisken({ '--x': `${xx}px`, '--w': `${w}px` })} {...(yardim ? bilgiOlaylari(bilgiMetni) : {})} {...surukle(r, !sabit && !r.fas && !!x.tasi)}
        onClick={(e) => { if (birakti.current) { birakti.current = false; return; } x.opSec(r.id, ankraj(e)); }}>
        {il != null && <span className="tc-pym-tp-ilerleme" ref={degisken({ '--o': `${Math.min(100, il * 100)}%` })} />}
        {r.su > 0 && r.Su != null && r.Su > r.S && <span className="tc-pym-tp-ayar" ref={degisken({ '--a': `${Math.min(w, (r.Su - r.S) * kk)}px` })} />}
        {yz && <span className="tc-pym-tp-yazi"><b>{yz.b}</b>{yz.ek}{yz.alt && <small>{yz.alt}</small>}</span>}
        {g && <span className="tc-pym-tp-gercek" data-sapma={sap > 0.5 ? '' : undefined} title={`Atölyeden geldi${sap > 0.5 ? `, plandan ${Math.round(sap * 60)} dk geç` : ''}`}><Simge ad="play" boyut="k" />{sap > 0.5 ? `+${Math.round(sap * 60)}dk` : ''}</span>}
        {c.locks[r.id] ? <span className="tc-pym-tp-kilit"><Simge ad="lock" boyut="k" /></span> : null}
      </button>
    );
  }
}
