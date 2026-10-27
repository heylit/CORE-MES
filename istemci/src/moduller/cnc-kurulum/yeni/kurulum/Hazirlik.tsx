import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { EmirSecenegi } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { Dugme } from '../../../../ortak/arayuz/Dugme.tsx';
import { Simge } from '../../../../ortak/arayuz/Simge.tsx';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { useCncSurum, yenile } from '../depo.ts';
import { clamp, num } from '../bicim.ts';
import { machine } from '../secici.ts';
import { fmtT } from '../hesap/gkod.ts';
import { PR, PR_GROUPS, PS, prFinalDone, prIsDone, prProgress, prStep, type HazirlikAdimi, type AdimSecimi } from '../hesap/hazirlik.ts';
import { gecisSecenegiAl, useGorunum, useTuslar, type HazirlikGecisi } from '../gorunum.ts';
import { Sahne } from '../sahne/Sahne.tsx';
import { emirler, seciliEmir, useCncYetkisi, useHazirlikKaydi } from '../veri.ts';
import { PRT, PRT_SPEEDS, prtApplyLife, prtFast, prtHedef, prtInit, prtSpeed, prtToggle } from './deneme.ts';
import {
  PU, izinli, kilitli, prBadges, prConfirm, prCurStep, prEnter, prFlash, prGo, prLoadFile, prMove, prOpenSim, prRail, prSelIdx, prSetOpt,
  prTitleOf, prToggle, prUI,
} from './hazirlik-eylem.ts';
import { hazirlikBirak, hazirlikCiz, sahneBasildi, sahneBirakildi, sahneKaydi, sahneSifirla } from './hazirlik-sahnesi.ts';
import { prPrint } from './hazirlik-yazdir.ts';
import { EmirKarti, HazirlikPaneli, type PanelEylemi } from './HazirlikPaneli.tsx';
import { KalemSimgesi } from './HazirlikSimgesi.tsx';
import { DegisinceGirdi, useOran } from './parcalar.tsx';
import { operasyon } from './secim.ts';
import './kurulum.css';

// Hazırlık görünümü (prototip 926-944 HTML, 21207-21590 arayüz ve olaylar). Emir satırı, onay kaydı ve seçim kilidi bugün
// köprüde (cerceve-kopru.ts 388-425, 840-960); burada görünümün parçasıdır.

const GRUP_SIMGESI: Record<string, SimgeAdi> = {
  machine: 'gear', prog: 'file', fixture: 'box', jaw: 'grid', material: 'cube', zero: 'target', tools: 'tool', cool: 'drop',
  gauges: 'ruler', cons: 'tag', final: 'check', trial: 'play',
};
const SECIM_TUSLARI = new Set(['ArrowLeft', 'ArrowRight', 'a', 'A', 'd', 'D', ' ', 'Home', 'End']);
const DOSYA_TURLERI = '.h,.H,.nc,.NC,.tap,.TAP,.mpf,.MPF,.txt,.ngc,.iso,.eia,.cnc,.gcode,.i';

// Çark kartı: konum, dönüş ve saydamlık veriden gelir; öğenin değişkenlerine yazılır. İlk çizimde kart yandan büyüyerek gelir.
function Kart({ o, off, sp, on, chk, rozetler, tikla }: {
  o: AdimSecimi['opts'][number]; off: number; sp: number; on: boolean; chk: boolean; rozetler: [string, string][]; tikla: () => void;
}) {
  const ref = useRef<HTMLButtonElement | null>(null), ilk = useRef(true);
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const yaz = (x: number, ry: number, tz: number, s: number, op: number): void => {
      el.style.setProperty('--tc-ck-x', `${String(x)}px`); el.style.setProperty('--tc-ck-ry', `${String(ry)}deg`);
      el.style.setProperty('--tc-ck-tz', `${String(tz)}px`); el.style.setProperty('--tc-ck-s', String(s)); el.style.setProperty('--tc-ck-op', String(op));
    };
    const ao = Math.abs(off);
    if (ilk.current) { ilk.current = false; yaz(off * sp * 1.6, 0, 0, 0.6, 0); void el.offsetWidth; }
    yaz(off * sp - Math.sign(off) * Math.max(0, ao - 1) * sp * 0.22, clamp(-off * 34, -62, 62), -ao * 46, off ? 0.86 : 1.06, ao > 5 ? 0 : 1 - ao * 0.14);
    el.style.setProperty('--tc-ck-zi', String(50 - ao));
  });
  return (
    <button type="button" ref={ref} className={`tc-ck-hz-kart${on ? ' on' : ''}${chk ? ' chk' : ''}`} tabIndex={on ? 0 : -1} onClick={tikla}>
      <div className="tc-ck-hz-resim"><KalemSimgesi o={o} /></div>
      <b>{o.name}</b><small>{o.code ?? ''}</small>
      <div className="tc-ck-hz-rozet">{rozetler.map(([m, t]) => <i key={m} className={t}>{m}</i>)}</div>
    </button>
  );
}

function SecimCarki({ st, S, kapali, onayla }: { st: HazirlikAdimi; S: AdimSecimi; kapali: boolean; onayla: () => void }) {
  const ref = useRef<HTMLDivElement | null>(null), [gen, genYaz] = useState(600), surukle = useRef<{ x: number; n: number } | null>(null);
  useEffect(() => {
    const el = ref.current; if (!el) return undefined;
    const g = new ResizeObserver(() => { genYaz(el.clientWidth || 600); }); g.observe(el);
    let accX = 0, last = 0;
    const tekerlek = (e: WheelEvent): void => {
      e.preventDefault(); e.stopPropagation(); if (kapali) return;
      let d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY; if (e.deltaMode === 1) d *= 33;
      accX += d; const now = performance.now(); if (now - last < 70) return;
      if (Math.abs(accX) >= 40) { prMove(accX > 0 ? 1 : -1); accX = 0; last = now; }
    };
    el.addEventListener('wheel', tekerlek, { passive: false });
    return () => { g.disconnect(); el.removeEventListener('wheel', tekerlek); };
  }, [kapali]);
  useEffect(() => {
    const kay = (e: PointerEvent): void => { const c = surukle.current; if (!c) return; const dx = e.clientX - c.x; if (Math.abs(dx) > 80) { prMove(dx > 0 ? -1 : 1); c.x = e.clientX; c.n++; } };
    const birak = (): void => { if (surukle.current?.n) { PU.noClick = true; setTimeout(() => { PU.noClick = false; }, 0); } surukle.current = null; };
    window.addEventListener('pointermove', kay); window.addEventListener('pointerup', birak);
    return () => { window.removeEventListener('pointermove', kay); window.removeEventListener('pointerup', birak); };
  }, []);
  const sel = prSelIdx(st, S), sp = gen < 520 ? 92 : 120, kartlar = [];
  const anahtar = `${st.key}|${machine().id}|${String(S.opts.length)}|${S.opts[0]?.id ?? ''}|${S.kind === 'single' && S.pk != null ? `${String(S.pk)}${PS().cat[`p${String(S.pk)}`] ?? ''}${PR.q[`p${String(S.pk)}`] ?? ''}` : ''}`;
  for (let i = Math.max(0, sel - 6); i <= Math.min(S.opts.length - 1, sel + 6); i++) {
    const o = S.opts[i]; if (!o) continue;
    const off = i - sel, secili = S.kind === 'multi' ? S.list().includes(o.id) : !off;
    kartlar.push(
      <Kart
        key={`${anahtar}|${o.id}`} o={o} off={off} sp={sp} on={!off} chk={S.kind === 'multi' && secili} rozetler={prBadges(st, S, o)}
        tikla={() => {
          if (PU.noClick || kapali) return;
          if (S.kind === 'multi') { if (prSelIdx(st, S) === i) prToggle(); else prSetOpt(i); return; }
          if (prSelIdx(st, S) === i) onayla(); else prSetOpt(i);
        }}
      />,
    );
  }
  return (
    <div
      ref={ref} className={`tc-ck-hz-cark${kapali ? ' kilitli' : ''}`}
      onPointerDown={(e) => { if (kapali || (e.target as HTMLElement).closest('.tc-ck-hz-ok')) return; surukle.current = { x: e.clientX, n: 0 }; }}
    >
      {!kapali && <button type="button" className="tc-ck-hz-ok l" aria-label="Önceki" onClick={() => { prMove(-1); }}><Simge ad="chev-left" /></button>}
      <div className="tc-ck-hz-kartlar">{kartlar}</div>
      {!kapali && <button type="button" className="tc-ck-hz-ok r" aria-label="Sonraki" onClick={() => { prMove(1); }}><Simge ad="chev-right" /></button>}
      <span className="tc-ck-hz-konum">{sel + 1} / {S.opts.length}</span>
    </div>
  );
}

function Gosterge() {
  const pr = prProgress(), C = 2 * Math.PI * 26, fin = prFinalDone();
  return (
    <div className="tc-ck-hz-gosterge">
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="26" className="bg" />
        <circle cx="32" cy="32" r="26" className={`fg${fin ? ' fin' : ''}`} strokeDasharray={C} strokeDashoffset={C * (1 - pr.pct)} />
      </svg>
      <div><b>%{Math.round(pr.pct * 100)}</b><small>{pr.d} / {pr.n} adım</small></div>
    </div>
  );
}

function DenemeCubugu() {
  const p = PRT.p, tot = p ? p.total : 0, cur = p ? (p.cum[Math.min(PRT.k, p.moves.length)] ?? 0) + (p.moves[PRT.k] ? (p.moves[PRT.k]?.dur ?? 0) * PRT.frac : 0) : 0;
  const ilerleme = useOran<HTMLDivElement>(tot ? cur / tot : 0);
  return (
    <div className="tc-ck-hz-deneme">
      <button type="button" className="tc-ck-hz-tb" title="Baştan" aria-label="Baştan" onClick={() => { prtInit(); prUI(); }}><Simge ad="rotate" /></button>
      <button type="button" className="tc-ck-hz-tb buyuk" aria-label={PRT.playing ? 'Durdur' : 'Başlat'} onClick={() => { const h = prtToggle(); if (h) prFlash(h, true); else prUI(); }}><Simge ad={PRT.playing ? 'pause' : 'play'} /></button>
      <button type="button" className="tc-ck-hz-tb" title="Kalan parçaları anında hesapla" aria-label="Kalan parçaları anında hesapla" onClick={() => { prtFast(); prUI(); }}><Simge ad="last" /></button>
      <div className="tc-ck-hz-ilerleme">
        <div className="tc-ck-hz-cubuk" ref={ilerleme}><i /></div>
        <small>Parça <b>{Math.min(PRT.part + (PRT.done ? 0 : 1), PRT.target)} / {PRT.target}</b> · {fmtT(cur)} / {fmtT(tot)}{PRT.curT ? <> · <b>T{PRT.curT}</b></> : null}</small>
      </div>
      <label className="tc-ck-hz-hiz">Hız
        <select value={PRT.speed} onChange={(e) => { PRT.speed = Number(e.target.value); prUI(); }}>{PRT_SPEEDS.map((v) => <option key={v} value={v}>×{v}</option>)}</select>
      </label>
      <label className="tc-ck-hz-hiz">Parça
        <DegisinceGirdi type="number" min="1" max="9999" deger={PRT.target} isle={(x) => { prtHedef(num(x, 1)); prUI(); }} />
      </label>
    </div>
  );
}

export function Hazirlik() {
  useCncSurum();
  const yetki = useCncYetkisi(), { burada, git } = useGorunum(), kayit = useHazirlikKaydi();
  const dok = useRef<HTMLDivElement | null>(null), sahne = useRef<HTMLDivElement | null>(null), dosya = useRef<HTMLInputElement | null>(null);
  const [cekmece, cekmeceYaz] = useState(false), [birak, birakYaz] = useState(false), [acikEmirler, acikEmirlerYaz] = useState<EmirSecenegi[] | null>(null);

  useEffect(() => {
    const g = gecisSecenegiAl('prep') as HazirlikGecisi | undefined;
    prEnter(g?.adim);
    emirler().then(acikEmirlerYaz, () => { /* liste alınamazsa açıklık bilinmez, uyarı gösterilmez */ });
    return () => { PRT.playing = false; hazirlikBirak(); };
  }, []);

  const st = prCurStep(), S = prStep(st), kapali = kilitli(yetki), fin = prFinalDone();
  const onayla = useCallback(() => { if (!izinli(yetki, 'ok')) return; if (prConfirm() === 'dosya') dosya.current?.click(); }, [yetki]);
  const eylem = useCallback((a: PanelEylemi) => {
    if (!izinli(yetki, a)) return;
    if (a === 'ok') onayla();
    else if (a === 'file') dosya.current?.click();
    else if (a === 'print') prPrint();
    else if (a === 'sim') prOpenSim(() => { git('gcode'); });
    else if (a === 'life') git('life');
    else if (a === 'toStock') git('stock');
    else if (a === 'toTrial') prGo(PR.seq.length - 1);
    else { const n = prtApplyLife(); prFlash(`✓ ${String(n)} takımın ömür kaydı güncellendi`); prUI(); }
  }, [yetki, git, onayla]);

  const tus = useCallback((e: KeyboardEvent) => {
    if (kilitli(yetki) && SECIM_TUSLARI.has(e.key)) { e.preventDefault(); return; }
    const k = e.key; let h = true;
    if (PRT.on && (k === 'ArrowRight' || k === 'ArrowLeft')) { prtSpeed(k === 'ArrowRight' ? 1 : -1); prUI(); e.preventDefault(); return; }
    if (k === 'ArrowRight' || k === 'd' || k === 'D') prMove(1); else if (k === 'ArrowLeft' || k === 'a' || k === 'A') prMove(-1);
    else if (k === 'ArrowDown' || k === 's' || k === 'S') prGo(PR.at + 1); else if (k === 'ArrowUp' || k === 'w' || k === 'W') prGo(PR.at - 1);
    else if (k === 'Enter') onayla();
    else if (k === ' ') { const S0 = prStep(prCurStep()); if (S0?.kind === 'multi') prToggle(); else onayla(); }
    else if (k === 'Backspace') prGo(PR.at - 1); else if (k === 'Home') prSetOpt(0); else if (k === 'End') prSetOpt(1e6);
    else h = false;
    if (h) e.preventDefault();
  }, [yetki, onayla]);
  useTuslar(burada, tus);

  // Görünüm tekerleği: dikey adım, yatay seçim (prototip 21547-21553); kilitte yatay ve Shift'li tekerlek durur.
  useEffect(() => {
    const el = sahne.current; if (!el) return undefined;
    let acc = 0, accX = 0, last = 0;
    const tekerlek = (e: WheelEvent): void => {
      e.preventDefault(); let dx = e.deltaX, dy = e.deltaY; if (e.deltaMode === 1) { dx *= 33; dy *= 33; }
      const kilit = kilitli(yetki);
      if (kilit && (Math.abs(dx) > Math.abs(dy) || e.shiftKey)) return;
      if (e.shiftKey && Math.abs(dx) < Math.abs(dy)) { dx = dy; dy = 0; }
      const now = performance.now();
      if (Math.abs(dx) > Math.abs(dy)) { accX += dx; acc = 0; if (now - last > 70 && Math.abs(accX) >= 40) { prMove(accX > 0 ? 1 : -1); accX = 0; last = now; } }
      else { acc += dy; accX = 0; if (now - last > 160 && Math.abs(acc) >= 60) { prGo(PR.at + (acc > 0 ? 1 : -1)); acc = 0; last = now; } }
    };
    el.addEventListener('wheel', tekerlek, { passive: false });
    return () => { el.removeEventListener('wheel', tekerlek); };
  }, [yetki]);

  const ciz = useCallback((c: Parameters<typeof hazirlikCiz>[0]) => {
    const dr = dok.current?.getBoundingClientRect();
    hazirlikCiz(c, dr?.height ? c.rect.top + c.rect.height - dr.top : 0, yenile);
  }, []);

  const emir = seciliEmir(), acik = emir === null || acikEmirler === null || acikEmirler.some((x) => x.id === emir.id);
  const kurulum = kayit?.kurulum ?? null;
  let alt = '';
  if (st) alt = st.g === 'trial' ? 'Enter: başlat / durdur · ◀ ▶ hız · sürükle: döndür' : prIsDone(st) ? '✓ Onaylandı — Enter ile sonraki adım' : st.g === 'final' ? 'Kontrol listesini inceleyin' : '◀ ▶ seç · Enter onayla · ▲ ▼ adım';
  if (kapali) alt = alt.replace('◀ ▶ seç · ', '');
  const okMetni = !st ? '' : st.g === 'trial' ? (PRT.playing ? 'Durdur' : PRT.done ? 'Yeniden dene' : 'Denemeyi başlat')
    : st.g === 'final' ? (prIsDone(st) ? 'Hazırlık tamam' : 'Hazırlığı tamamla') : st.key === 'prog' && PR.upFocus ? 'Dosya seç' : prIsDone(st) ? 'Sonraki adım' : 'Onayla ve devam';
  const okSimge: SimgeAdi = !st ? 'check' : st.g === 'trial' ? (PRT.playing ? 'pause' : PRT.done ? 'rotate' : 'play') : st.key === 'prog' && PR.upFocus ? 'upload' : st.g !== 'final' && prIsDone(st) ? 'down' : 'check';
  const carkVar = !!S && S.kind !== 'none' && S.opts.length > 0;

  return (
    <div className="tc-ck-hz">
      <div
        ref={sahne} className={`tc-ck-hz-sahne${birak ? ' birak' : ''}`}
        onDragOver={(e) => { e.preventDefault(); if (!kapali && !yetki.saltOnay) birakYaz(true); }}
        onDragLeave={() => { birakYaz(false); }}
        onDrop={(e) => {
          e.preventDefault(); birakYaz(false); if (kapali || yetki.saltOnay) return;
          const f = e.dataTransfer.files[0]; if (!f) return;
          const i = PR.seq.findIndex((s) => s.key === 'prog'); if (i >= 0) prGo(i); prLoadFile(f);
        }}
      >
        <div
          className="tc-ck-hz-3b"
          onPointerDown={(e) => { sahneBasildi(e.clientX, e.clientY); e.currentTarget.setPointerCapture?.(e.pointerId); }}
          onPointerMove={(e) => { sahneKaydi(e.clientX, e.clientY); }}
          onPointerUp={sahneBirakildi} onPointerCancel={sahneBirakildi} onDoubleClick={sahneSifirla}
        >
          <Sahne ciz={ciz} sinif="tc-ck-tuval" />
        </div>
        <div className="tc-ck-hz-bilgi">
          <div className="tc-ck-hz-no">HAZIRLIK · ADIM {PR.at + 1} / {PR.seq.length}</div>
          <div className="tc-ck-hz-baslik">{st ? prTitleOf(st) : ''}</div>
          <div className="tc-ck-hz-alt">{alt}</div>
          <div className="tc-ck-hz-emirsatir">
            {emir === null ? 'Üretim emri seçilmedi · Kurulum ekranında seçin'
              : <><b>{operasyon(emir)}</b> · {emir.parcaNo} {emir.parcaAd} · {emir.adet} adet{acik ? '' : ' (açık değil)'}</>}
          </div>
        </div>
        <Gosterge />
        {fin && <div className="tc-ck-hz-damga">HAZIR</div>}
        {PU.flash && <div key={PU.flash.n} className={`tc-ck-hz-flas${PU.flash.kotu ? ' kotu' : ''}`} role="status">{PU.flash.metin}</div>}
        <div className="tc-ck-hz-dok" ref={dok}>
          {st && S && carkVar && <SecimCarki st={st} S={S} kapali={kapali} onayla={onayla} />}
          {S && S.kind !== 'none' && !S.opts.length && <div className="tc-ck-hz-bos">Bu adımda seçilecek kalem yok</div>}
          {st?.g === 'trial' && <DenemeCubugu />}
          <div className="tc-ck-hz-cubukalt">
            <div className="tc-ck-hz-eylem">
              <Dugme simge="up" disabled={PR.at === 0} onClick={() => { prGo(PR.at - 1); }}>Geri</Dugme>
              {izinli(yetki, 'ok') && <Dugme tur="birincil" simge={okSimge} onClick={onayla}>{okMetni}</Dugme>}
              <Dugme simge="down" disabled={PR.at >= PR.seq.length - 1} onClick={() => { prGo(PR.at + 1); }}>İleri</Dugme>
            </div>
            <div className="tc-ck-hz-ray">
              {PR_GROUPS.map((G) => {
                const adimlar = PR.seq.filter((s) => s.g === G.g); if (!adimlar.length) return null;
                const d = adimlar.filter(prIsDone).length, on = st?.g === G.g, hepsi = d === adimlar.length;
                return (
                  <button
                    type="button" key={G.g} className={`${on ? 'on ' : ''}${hepsi ? 'dn' : d ? 'pt' : ''}`}
                    ref={(el) => { if (on && el) try { el.scrollIntoView({ block: 'nearest', inline: 'center' }); } catch { /* eski tarayıcı */ } }}
                    onClick={() => { prRail(G.g); }}
                  >
                    <span className="ic"><Simge ad={hepsi ? 'check' : GRUP_SIMGESI[G.g] ?? 'check'} boyut="k" /></span>
                    <span className="lb">{G.t}{adimlar.length > 1 && <em> {d}/{adimlar.length}</em>}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="tc-ck-hz-birakipucu">NC programını bırakın</div>
        <input ref={dosya} type="file" accept={DOSYA_TURLERI} hidden onChange={(e) => { prLoadFile(e.target.files?.[0]); e.target.value = ''; }} />
      </div>
      <aside className={`tc-ck-yan tc-ck-hz-yan${cekmece ? ' tc-ck-acik' : ''}`}>
        <button type="button" className="tc-ck-cekmece" onClick={() => { cekmeceYaz(!cekmece); }}><Simge ad={cekmece ? 'down' : 'up'} boyut="k" /> Hazırlık paneli</button>
        <EmirKarti emir={emir} acik={acik} kurulum={kurulum} />
        <div className="tc-ck-yan-kaydir">
          <HazirlikPaneli yetki={yetki} eylem={eylem} kayit={kayit} emir={emir} />
        </div>
      </aside>
    </div>
  );
}

