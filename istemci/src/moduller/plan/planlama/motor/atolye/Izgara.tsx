import { useLayoutEffect, useMemo, useRef, useState, type MutableRefObject } from 'react';
import { Simge } from '../../../../../ortak/arayuz/index.ts';
import type { PlanIslemi } from '../kurallar.ts';
import { degisken } from '../ortak.tsx';
import {
  secKacis, akis, cubukYazisi, darbogaz, doluluklar, gercekOku, haftaHucreleri, ilerleme, kapaliAraliklar, sabitMi, satirlar, saatPiksel, sure, suzUyar, tezGrup, tz,
  ufuk, UFUK_SAAT, zamanBasliklari, type PanoSatiri, duruslar,
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
  // Okların yeri çubukların çizilmiş yerinden ölçülür (cizOklar).
  useLayoutEffect(() => {
    const al = alan.current;
    if (!al || !secJob || yil) { setOklar(null); return; }
    const A = akis(p, cx, ort.hazir, secJob); if (!A) { setOklar(null); return; }
    const ar = al.getBoundingClientRect(); const yer = new Map<string, { x0: number; x1: number; y: number }>();
    for (const x of A.L) {
      const el = al.querySelector(`[data-id="${secKacis(x.id)}"]`); if (!el) continue;
      const b = el.getBoundingClientRect(); yer.set(x.id, { x0: b.left - ar.left, x1: b.right - ar.left, y: b.top - ar.top + b.height / 2 });
    }
    const yol: { d: string; kr: boolean }[] = [], yazi: { x: number; y: number; t: string; kr: boolean }[] = [];
    for (const x of A.L) for (const [pid] of cx.byId[x.id]?.pr ?? []) {
      const a = yer.get(pid), b = yer.get(x.id); if (!a || !b) continue;
      const kr = x.kritik && x.onc === pid; const dx = Math.max(24, Math.abs(b.x0 - a.x1) / 2);
      yol.push({ d: `M${a.x1},${a.y} C${a.x1 + dx},${a.y} ${b.x0 - dx},${b.y} ${b.x0 - 3},${b.y}`, kr });
      if (x.onc === pid && x.bek >= 1 && b.x0 - a.x1 > 40) yazi.push({ x: (a.x1 + b.x0) / 2, y: (a.y + b.y) / 2 - 6, t: sure(x.bek), kr });
    }
    setOklar({ w: al.offsetWidth, h: al.offsetHeight, yol, yazi });
  }, [secJob, k, H, p, cx, yil, R]);
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
        {H > UFUK_SAAT && (
          <div className="tc-pym-tp-ufuk" ref={degisken({ '--x': `${UFUK_SAAT * k}px` })}>
            <span><Simge ad="alert" boyut="k" />{`Motor ${UFUK_SAAT / 24 / 7} hafta planlar; ötesi için talep tahmini gerekir`}</span>
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
    const yz = cubukYazisi(r, ka, ad, w);
    return (
      <button key={r.id} type="button" className="tc-pym-tp-cubuk" data-id={r.id} data-durum={b && b.durum !== 'iyi' ? b.durum : undefined} data-sabit={sabit ? '' : undefined}
        data-fason={r.fas ? '' : undefined} data-soluk={soluk ? '' : undefined} data-vurgu={vur ? '' : undefined} data-parla={pr ? '' : undefined}
        data-grup={tezGrup(D, r.m)} aria-pressed={secOp === r.id}
        title={`${r.job} · ${ad} · ${tz(D, r.S)} → ${tz(D, r.C)}${il != null ? ` · ilerleme %${Math.round(il * 100)}` : ''}`}
        ref={degisken({ '--x': `${xx}px`, '--w': `${w}px` })} onClick={(e) => x.opSec(r.id, ankraj(e))}>
        {il != null && <span className="tc-pym-tp-ilerleme" ref={degisken({ '--o': `${Math.min(100, il * 100)}%` })} />}
        {r.su > 0 && r.Su != null && r.Su > r.S && <span className="tc-pym-tp-ayar" ref={degisken({ '--a': `${Math.min(w, (r.Su - r.S) * kk)}px` })} />}
        {yz && <span className="tc-pym-tp-yazi"><b>{yz.b}</b>{yz.ek}{yz.alt && <small>{yz.alt}</small>}</span>}
        {g && <span className="tc-pym-tp-gercek" data-sapma={sap > 0.5 ? '' : undefined} title={`Atölyeden geldi${sap > 0.5 ? `, plandan ${Math.round(sap * 60)} dk geç` : ''}`}><Simge ad="play" boyut="k" />{sap > 0.5 ? `+${Math.round(sap * 60)}dk` : ''}</span>}
        {c.locks[r.id] ? <span className="tc-pym-tp-kilit"><Simge ad="lock" boyut="k" /></span> : null}
      </button>
    );
  }
}
