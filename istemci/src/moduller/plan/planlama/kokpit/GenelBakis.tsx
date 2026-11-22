import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type KeyboardEvent as TusOlayi, type PointerEvent as ImlecOlayi } from 'react';
import type { Derleme } from '../motor/kurallar.ts';
import { durusAdi, yukSinifi, type KokpitModeli } from './kurallar.ts';
import type { PencereDeposu } from './pencereDeposu.ts';
import { gecKumele, gecOzeti, gunlukDoluluk, pencereAdimi, pencereBasi, pencereDegeri, pencereSonu, pencereYazisi, seritOzeti, seritSaati, seritX, ufukCizgisi, ufukYazisi } from './yogunluk.ts';

// Dilim 3b (F): tahtanın üstünde bütün planın genel bakışı. Günlük doluluk sütunu (tahtanın yük hücresiyle aynı basamak), plan ufku, termini
// kaçan emirler ve planlı duruşlar; tahtanın görünen aralığı pencere olarak çizilir. Pencere sürüklenir, şeride basınca oraya gider; klavyede
// ok tuşları bir gün, Page Up/Down bir hafta, Home/End baş ve son; sağ kenar sürüklenince ya da Shift ve oklarla pencere daralır, genişler
// (tahtanın saat eni değişir). Tahta kaydırılınca pencere izler. Pencere depodan okunur: kaydırma Kokpit'i yeniden çizdirmez (Test B1).
export interface GenelBakisOzellikleri {
  m: KokpitModeli;
  cx: Derleme;
  ufukSonu: number;
  zaman: (t: number) => string;
  // Tahtanın görünen aralığı ve tahtayı kaydıran işlev.
  depo: PencereDeposu;
  // Görünen aralığı [S, C] yapar (saat eni değişir); yoksa kenar ve Shift çalışmaz.
  genislet?: ((S: number, C: number) => void) | null;
}

// Pencere bundan darsa kenar tutamağı dışarı taşar (pencerenin kendisi sürüklenebilsin).
const KENAR_DAR = 72;
// İki geç noktası arasında en az bu kadar piksel yoksa birleşir (sayılı nokta 16 px).
const GEC_ARALIK = 18;
const yerYaz = (el: HTMLElement | null, x: number, w?: number): void => {
  if (!el) return;
  el.style.setProperty('--x', `${String(Math.round(x * 10) / 10)}px`);
  if (w !== undefined) el.style.setProperty('--w', `${String(Math.max(1, Math.round(w * 10) / 10))}px`);
};

export function GenelBakis({ m, cx, ufukSonu, zaman, depo, genislet = null }: GenelBakisOzellikleri) {
  const kap = useRef<HTMLDivElement | null>(null);
  const [W, setW] = useState(0);
  const pencere = useSyncExternalStore(depo.abone, depo.al);
  const gunler = useMemo(() => gunlukDoluluk(cx, m), [cx, m]);
  const gec = useMemo(() => gecOzeti(m.emirler, m.bas, m.son), [m]);
  const yardimId = useId();
  const duruslar = useMemo(() => Object.entries(m.durus).flatMap(([t, l]) => l.filter((d) => !d.ariza && d.b > m.bas).map((d) => ({ t, ...d }))), [m]);
  const ufuk = ufukCizgisi(m, ufukSonu);
  const x = (t: number): number => seritX(t, m.bas, m.son, W);
  const en = pencere ? pencere.C - pencere.S : 0;
  const tut = useRef<{ fark: number; kenar: boolean } | null>(null);
  // Sürüklemede bir karede tek kaydırma (Test B1): son imleç konumu saklanır, kare başında uygulanır.
  const bekleyen = useRef<{ kare: number; clientX: number } | null>(null);
  // Kenar sürüklenirken pencerenin önizlenen sonu; bırakınca tahtaya uygulanır.
  const [kenarC, setKenarC] = useState<number | null>(null);
  useEffect(() => {
    const el = kap.current;
    if (!el) return undefined;
    setW(el.clientWidth);
    if (typeof ResizeObserver === 'undefined') return undefined;
    const izleyen = new ResizeObserver(() => { setW(el.clientWidth); });
    izleyen.observe(el);
    return () => { izleyen.disconnect(); };
  }, []);
  useEffect(() => () => { if (bekleyen.current) cancelAnimationFrame(bekleyen.current.kare); }, []);
  const saatAl = (clientX: number): number => {
    const r = kap.current?.getBoundingClientRect();
    return seritSaati(clientX - (r?.left ?? 0), m.bas, m.son, W);
  };
  const bas = (ev: ImlecOlayi<HTMLDivElement>): void => {
    if (ev.button > 0 || !pencere) return;
    const t = saatAl(ev.clientX), icinde = t >= pencere.S && t <= pencere.C;
    const kenar = genislet !== null && (ev.target as Element).closest('[data-kenar]') !== null;
    tut.current = { fark: icinde ? t - pencere.S : en / 2, kenar };
    if (kenar) { setKenarC(pencere.C); ev.currentTarget.setPointerCapture?.(ev.pointerId); return; }
    if (!icinde) depo.kaydir(pencereBasi(t - en / 2, en, m.bas, m.son));
    ev.currentTarget.setPointerCapture?.(ev.pointerId);
  };
  const surukle = (ev: ImlecOlayi<HTMLDivElement>): void => {
    if (!tut.current || !pencere) return;
    if (bekleyen.current) { bekleyen.current.clientX = ev.clientX; return; }
    bekleyen.current = {
      clientX: ev.clientX,
      kare: requestAnimationFrame(() => {
        const b = bekleyen.current, p = depo.al();
        bekleyen.current = null;
        if (!b || !tut.current || !p) return;
        if (tut.current.kenar) { setKenarC(pencereSonu(p.S, saatAl(b.clientX), m.son)); return; }
        depo.kaydir(pencereBasi(saatAl(b.clientX) - tut.current.fark, p.C - p.S, m.bas, m.son));
      }),
    };
  };
  const birak = (): void => {
    if (bekleyen.current) { cancelAnimationFrame(bekleyen.current.kare); bekleyen.current = null; }
    if (tut.current?.kenar && pencere && kenarC !== null && genislet) genislet(pencere.S, kenarC);
    tut.current = null; setKenarC(null);
  };
  const tus = (ev: TusOlayi<HTMLDivElement>): void => {
    if (!pencere) return;
    if (ev.shiftKey && genislet && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) {
      ev.preventDefault();
      genislet(pencere.S, pencereSonu(pencere.S, Math.min(pencere.C, m.son) + (ev.key === 'ArrowRight' ? 24 : -24), m.son));
      return;
    }
    const adim = ({ ArrowLeft: -24, ArrowDown: -24, ArrowRight: 24, ArrowUp: 24, PageUp: -168, PageDown: 168 } as Readonly<Record<string, number>>)[ev.key];
    const hedef = adim !== undefined ? pencere.S + adim : ev.key === 'Home' ? m.bas : ev.key === 'End' ? m.son - en : null;
    if (hedef === null) return;
    ev.preventDefault();
    depo.kaydir(pencereAdimi(pencere.S, hedef, en, m.bas, m.son));
  };
  const tarih = (g: number): string => zaman(m.bas + g * 24).slice(0, 5);
  const ozet = seritOzeti(gunler, gec, tarih, ufuk === null ? null : ufukYazisi(zaman, ufuk));
  // Değişmeyen katman (gün sütunları, haftalar, geç noktaları, duruşlar, ufuk) yalnız veri ya da en değişince çizilir; kaydırmada yalnız pencere.
  const katman = useMemo(() => {
    if (W <= 0) return null;
    const X = (t: number): number => seritX(t, m.bas, m.son, W), gEn = X(m.bas + 24) - X(m.bas);
    const tr = (g: number): string => zaman(m.bas + g * 24).slice(0, 5);
    return (
      <>
        {gunler.map((g) => {
          const s = yukSinifi({ acik: g.acik, plan: g.plan });
          return (
            <i
              key={g.gun} className="tc-pyq-genel-gun" data-yuk={s} title={`${tr(g.gun)}: ${s === 'kapali' ? 'kapalı' : `doluluk %${String(Math.round((g.plan / g.acik) * 100))} (fason dışı)`}`}
              ref={(el) => { yerYaz(el, X(m.bas + g.gun * 24), gEn - 1); el?.style.setProperty('--oran', String(g.acik > 0 ? Math.min(1, g.plan / g.acik) : 0)); }}
            />
          );
        })}
        {gunler.filter((g) => g.gun % 7 === 0).map((g) => (
          <span key={`h${String(g.gun)}`} className="tc-pyq-genel-hafta" aria-hidden="true" ref={(el) => { yerYaz(el, X(m.bas + g.gun * 24)); }}>{tr(g.gun)}</span>
        ))}
        {gecKumele(gec.gunler, gEn, GEC_ARALIK).map((k) => (
          <span
            key={`g${String(k.bas)}`} className="tc-pyq-genel-gec" data-sayi={k.sayi > 1 ? k.sayi : undefined}
            title={`${tr(k.bas)}${k.son > k.bas ? `–${tr(k.son)}` : ''}: termini kaçan ${String(k.sayi)} emir`}
            ref={(el) => { yerYaz(el, X(m.bas + ((k.bas + k.son) / 2) * 24 + 12)); }}
          >{k.sayi > 1 ? k.sayi : null}</span>
        ))}
        {duruslar.map((d, i) => <span key={`d${String(i)}`} className="tc-pyq-genel-durus" title={`${d.t} ${durusAdi(d.neden, d.baslik)} ${zaman(d.a)}`} ref={(el) => { yerYaz(el, X(Math.max(m.bas, d.a)), Math.max(4, X(d.b) - X(Math.max(m.bas, d.a)))); }} />)}
        {ufuk !== null && (
          <>
            <span className="tc-pyq-genel-ufuk-disi" aria-hidden="true" ref={(el) => { yerYaz(el, X(ufuk), W - X(ufuk)); }} />
            <span className="tc-pyq-genel-ufuk" aria-hidden="true" ref={(el) => { yerYaz(el, X(ufuk)); }}><b>{ufukYazisi(zaman, ufuk)}</b></span>
          </>
        )}
      </>
    );
  }, [W, gunler, gec, duruslar, ufuk, m.bas, m.son, zaman]);
  const deger = pencereDegeri(pencere, m.bas, m.son);
  const pencereEni = pencere ? x(kenarC ?? Math.min(pencere.C, m.son)) - x(pencere.S) : 0;
  return (
    <>
      <p className="tc-pyq-genel-lejant" data-genel-lejant="">
        <span>Sütun: günlük doluluk (fason dışı)</span>
        <span data-lej="gec">termini kaçan emir (sayı)</span>
        <span data-lej="durus">planlı duruş</span>
        <span data-lej="tarali">taralı: ufuk dışı ya da kapalı</span>
        {gec.disarida > 0 && <b data-gec-disarida="">{gec.disarida} geç emir şeridin dışında</b>}
      </p>
      <div className="tc-pyq-genel" role="group" aria-label="Plan genel bakışı" ref={kap} onPointerDown={bas} onPointerMove={surukle} onPointerUp={birak} onPointerCancel={birak} data-genel="">
        <span className="tc-gizli-etiket" data-genel-ozet="">{ozet}</span>
        <span className="tc-gizli-etiket" id={yardimId}>Ok tuşları bir gün, Page Up ve Page Down bir hafta kaydırır; Home ve End başa ve sona gider{genislet ? '; Shift ve sağ ya da sol ok daraltır, genişletir' : ''}.</span>
        {katman}
        {W > 0 && pencere && (
          <div
            className="tc-pyq-genel-pencere" role="slider" tabIndex={0} data-pencere="" aria-label="Görünen aralık" aria-describedby={yardimId}
            aria-valuemin={0} aria-valuemax={deger.max} aria-valuenow={deger.simdi}
            aria-valuetext={pencereYazisi(pencere, m.bas, m.son, (t) => zaman(t).slice(0, 5))}
            ref={(el) => { yerYaz(el, x(pencere.S), Math.max(8, pencereEni)); }}
            onKeyDown={tus} data-kenar-suruluyor={kenarC !== null ? '' : undefined} data-dar={pencereEni < KENAR_DAR ? '' : undefined}
          >
            {genislet && <i className="tc-pyq-genel-kenar" data-kenar="" title="Sürükleyin: görünen aralığı daraltır, genişletir" />}
          </div>
        )}
      </div>
    </>
  );
}
