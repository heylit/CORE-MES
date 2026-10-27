import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dugme, Sekmeler, Simge, type Sekme } from '../../../../ortak/arayuz/index.ts';
import {
  drawChart, gecisSecenegiAl, isLatheTool, isMillTool, lwDefs, num, Sahne, save, state, useCncSurum, useCncYetkisi, useGorunum, useTuslar,
  type Cizim, type OmurGecisi,
} from './cekirdek.ts';
import { lifeCompute, openAnalysis, type AnalizSonucu, type HesapliSonuc } from './analiz.ts';
import { AnalizPaneli } from './AnalizPaneli.tsx';
import { OmurCarki } from './cark-sahnesi.ts';
import { asinmaGrafigi, dagilimGrafigi, hizGrafigi } from './grafikler.ts';
import { OmurOnizlemesi, type OnizlemeSekmesi } from './onizleme-sahnesi.ts';
import { paletOku } from './renk.ts';
import { tezgahtakiKart } from './takip.ts';
import { TakipPaneli } from './TakipPaneli.tsx';
import type { CarkKarti } from './tipler.ts';
import { YenilemePaneli } from './YenilemePaneli.tsx';
import { OmurYuzeyi } from './yuzey-sahnesi.ts';
import './omur.css';

export type OmurKipi = 'track' | 'anal' | 'renew';
const SEKMELER: readonly Sekme<OmurKipi>[] = [
  { anahtar: 'track', baslik: 'Magazin takibi', simge: 'layers' },
  { anahtar: 'anal', baslik: 'Takım analizi', simge: 'chart' },
  { anahtar: 'renew', baslik: 'Ömür yenileme', simge: 'rotate' },
];
const GORUNUSLER = [['iso', 'İzometrik'], ['top', 'Üst'], ['front', 'Ön'], ['side', 'Yan']] as const;

const kipOku = (): OmurKipi => (state.life.mode === 'anal' ? 'anal' : state.life.mode === 'renew' ? 'renew' : 'track');

// Prototipin yumuşatma katsayıları: kare süresine göre hedefe yaklaşma oranı.
const yumusat = (dt: number): [number, number] => [1 - Math.pow(0.0008, dt), 1 - Math.pow(0.0002, dt)];

interface Koken { key: string; k: number; sel: string; mid: string }

// Takım Ömrü görünümü: solda sahne (ömür çarkı ya da ömür yüzeyi ve grafikler), sağda panel (768 altında altta). Üç kip:
// magazin takibi, takım analizi, ömür yenileme. Yazma düğmeleri yetkiye göre görünür; kural ve yetki sunucudadır.
export function TakimOmru() {
  const surum = useCncSurum();
  const yetki = useCncYetkisi();
  const { gorunum, git } = useGorunum();
  const [palet] = useState(paletOku);
  const [, panelYenile] = useState(0);
  const tazele = useCallback(() => panelYenile((n) => n + 1), []);
  const [cark] = useState(() => new OmurCarki(palet, tazele));
  const [onizleme] = useState(() => new OmurOnizlemesi(palet));
  const sahneKutusu = useRef<HTMLDivElement>(null);
  const yuzey = useRef<OmurYuzeyi | null>(null);
  const koken = useRef<Koken | null>(null);
  const grafik = [useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null), useRef<HTMLCanvasElement>(null)] as const;
  const kip = kipOku();
  const [cekmece, cekmeceYaz] = useState(false);
  const pv: OnizlemeSekmesi = state.life.pv === 'mag' ? 'mag' : 'model';

  const kayit = useCallback(() => { save(); }, []);

  // Çark durum değişince yeniden okunur (prototipte lwRefresh); seçili satır anahtarıyla korunur.
  useMemo(() => { if (kip !== 'anal') cark.refresh(lwDefs()); }, [cark, kip, surum]);
  // Analiz durum değişince yeniden hesaplanır (benzetim rastgeledir: yalnız değişimde).
  const res: AnalizSonucu | null = useMemo(() => (kip === 'anal' ? lifeCompute() : null), [kip, surum]);

  useEffect(() => {
    const el = sahneKutusu.current;
    if (!el) return undefined;
    const y = new OmurYuzeyi(el, palet);
    yuzey.current = y;
    return () => { y.dispose(); yuzey.current = null; };
  }, [palet]);
  useEffect(() => {
    const y = yuzey.current;
    if (!y) return;
    y.orbit.enabled = kip === 'anal';
    if (kip === 'anal') y.kur(res);
  }, [kip, res]);
  useEffect(() => () => { cark.dispose(); onizleme.dispose(); }, [cark, onizleme]);

  // Grafikler kipe girince ve genişlik değişince yeniden çizilir (prototipte 150 ms bekleme).
  useEffect(() => {
    if (kip !== 'anal' || !res || res.M.err !== undefined) return undefined;
    const r = res as HesapliSonuc;
    const ciz = (): void => {
      const [a, b, c] = grafik;
      if (a.current) drawChart(a.current, asinmaGrafigi(r, palet));
      if (b.current) drawChart(b.current, dagilimGrafigi(r, palet));
      if (c.current) drawChart(c.current, hizGrafigi(r, palet));
    };
    const z = setTimeout(ciz, 60);
    let t = 0;
    const boyut = (): void => { clearTimeout(t); t = window.setTimeout(ciz, 150); };
    window.addEventListener('resize', boyut);
    return () => { clearTimeout(z); clearTimeout(t); window.removeEventListener('resize', boyut); };
  }, [kip, res, palet, grafik]);

  // Ana Sayfa'dan tezgâh (ve cep) ile gelinince çarkta o satır seçilir (prototipte hLifeGo).
  useEffect(() => {
    const s = gecisSecenegiAl('life') as OmurGecisi | undefined;
    if (!s?.tezgah) return;
    if (kipOku() === 'anal') { state.life.mode = 'track'; kayit(); }
    cark.refresh(lwDefs());
    const cep = s.cep == null || s.cep === '' ? null : +s.cep;
    cark.sec(s.tezgah, cep !== null ? (c) => !c.depot && c.p === cep : undefined);
  }, [cark, kayit]);

  // Çark kartından analize: depo kalemi bir tezgâhta takılıysa o cep açılır (prototipin lwOpenAnal'ı).
  const analizeAc = useCallback((c0: CarkKarti) => {
    let c = c0;
    if (c.depot) { const mt = tezgahtakiKart(cark.defs, c.t); if (mt) c = mt; }
    const l = state.life;
    if (!c.depot) {
      if (state.machine !== c.m.id) state.machine = c.m.id;
      openAnalysis(c.p);
      if (c.tp) l.tp = +c.tp.toFixed(3);
    } else {
      l.sel = 't:' + c.t.id; l.vc = ''; l.f = ''; l.ap = ''; l.ae = ''; l.tp = '';
    }
    l.rel = num(l.trel, 80);
    const d0 = cark.defs[cark.active];
    koken.current = d0 ? { key: d0.key, k: cark.anim[d0.key]!.sel, sel: l.sel, mid: state.machine } : null;
    l.mode = 'anal';
    kayit();
  }, [cark, kayit]);

  // Analizden takibe dönüşte çark analizin takımına (ya da açıldığı karta) döner (prototipin lwSyncFromAnal'ı).
  const takibeDon = useCallback((hedef: OmurKipi) => {
    state.life.mode = hedef;
    cark.refresh(lwDefs(), false);
    const v = state.life.sel || '', o = koken.current;
    koken.current = null;
    // Analizin açıldığı karta dönülür; olmazsa analizin cebi ya da takımı seçilir.
    const kokeneDondu = o !== null && o.sel === v && o.mid === state.machine && cark.sec(o.key, o.k);
    if (!kokeneDondu && v.indexOf('p:') === 0) {
      const p = +v.slice(2);
      cark.sec(state.machine, (c) => !c.depot && c.p === p);
    } else if (!kokeneDondu && v.indexOf('t:') === 0) {
      const id = v.slice(2), satir = cark.defs.find((x) => (x.cards as CarkKarti[]).some((y) => y.t.id === id));
      if (satir) cark.sec(satir.key, (y) => y.t.id === id);
    }
    kayit();
  }, [cark, kayit]);

  const kipSec = useCallback((m: OmurKipi) => {
    const once = kipOku();
    if (m === once) return;
    if (m === 'anal') {
      const sc = cark.selCard();
      if (sc && (!sc.depot || isMillTool(sc.t) || isLatheTool(sc.t))) { analizeAc(sc); return; }
      state.life.mode = 'anal'; kayit(); return;
    }
    if (once === 'anal') { takibeDon(m); return; }
    state.life.mode = m; kayit();
  }, [cark, analizeAc, takibeDon, kayit]);

  const tusla = useCallback((e: KeyboardEvent) => { if (kipOku() !== 'anal') cark.tus(e); }, [cark]);
  useTuslar(gorunum === 'life', tusla);

  // Çark tekerleği sayfayı kaydırmaz (pasif olmayan dinleyici).
  useEffect(() => {
    const el = sahneKutusu.current;
    if (!el) return undefined;
    const h = (e: WheelEvent): void => { if (kipOku() !== 'anal') cark.teker(e); };
    el.addEventListener('wheel', h, { passive: false });
    return () => el.removeEventListener('wheel', h);
  }, [cark]);

  const sahneCiz = useCallback((c: Cizim) => {
    const [kk, k2] = yumusat(c.dt);
    if (kipOku() === 'anal') yuzey.current?.frame(c.renderer, c.rect, kk);
    else cark.frame(c.renderer, c.rect, kk, k2);
  }, [cark]);
  const onizlemeCiz = useCallback((c: Cizim) => {
    const d = cark.defs[cark.active];
    if (!d) return;
    const [kk] = yumusat(c.dt);
    onizleme.sync(d, cark.selCard(), state.life.pv === 'mag' ? 'mag' : 'model', cark.ver);
    onizleme.frame(c.renderer, c.rect, c.dt, kk);
  }, [cark, onizleme]);

  const d = cark.defs[cark.active], secili = cark.selCard();
  const baslik = kip === 'anal' ? 'Takım ömrü analizi' : kip === 'renew' ? 'Takım ömrü yenileme' : 'Takım ömrü çarkı';
  const alt = kip === 'anal' ? <>Ömür yüzeyi: Vc ve ilerlemeye göre · yeşil uzun, kırmızı kısa</>
    : kip === 'renew' ? <>Uç çevirme · bileme · kenar düzeltme · çarktan takım seçin</>
    : <>Tekerlek: tezgâh / depo grubu değiştir · <Simge ad="chev-left" boyut="k" /><Simge ad="chev-right" boyut="k" /> takım seç</>;

  return (
    <div className={`tc-co tc-co-kip-${kip}`}>
      <div className="tc-co-sahne">
        <div
          ref={sahneKutusu} className="tc-co-sahne-alan"
          onPointerDown={(e) => { if (kip !== 'anal') cark.basla(e.nativeEvent, e.currentTarget); }}
          onPointerMove={(e) => { if (kip !== 'anal') cark.tasi(e.nativeEvent); }}
          onPointerUp={(e) => { if (kip !== 'anal') cark.bitir(e.nativeEvent); }}
          onPointerCancel={(e) => { if (kip !== 'anal') cark.bitir(e.nativeEvent); }}
        >
          <Sahne ciz={sahneCiz} sinif="tc-co-tuval" />
        </div>
        <div className="tc-co-bilgi">
          <div className="tc-co-adim-adi">TAKIM ÖMRÜ</div>
          <div className="tc-co-baslik">{baslik}</div>
          <div className="tc-co-alt">{alt}</div>
        </div>
        {kip === 'anal' && (
          <>
            <div className="tc-co-gorunus nocam">
              {GORUNUSLER.map(([v, a]) => <Dugme key={v} onClick={() => yuzey.current?.gorunus(v)}>{a}</Dugme>)}
            </div>
            <div className="tc-co-grafikler nocam">
              {grafik.map((g, i) => <canvas key={i} ref={g} />)}
            </div>
          </>
        )}
      </div>
      <aside className={`tc-co-yan${cekmece ? ' tc-co-acik' : ''}`}>
        <button type="button" className="tc-co-cekmece" onClick={() => { cekmeceYaz(!cekmece); }}><Simge ad={cekmece ? 'down' : 'up'} boyut="k" /> Takım ömrü</button>
        <div className="tc-co-yan-kaydir">
          <Sekmeler etiket="Takım ömrü" sekmeler={SEKMELER} secili={kip} sec={kipSec} />
          {kip !== 'anal' && (
            <div className="tc-co-onizleme">
              <div
                className="tc-co-onizleme-alan"
                onPointerDown={(e) => { onizleme.drag = e.clientX; try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* yakalama yoksa da döner */ } }}
                onPointerMove={(e) => onizleme.surukle(e.clientX)}
                onPointerUp={() => { onizleme.drag = null; }}
                onPointerCancel={() => { onizleme.drag = null; }}
              >
                <Sahne ciz={onizlemeCiz} sinif="tc-co-tuval" />
              </div>
              {d && !d.depot && (
                <div className="tc-co-onizleme-sekme">
                  {(['model', 'mag'] as const).map((s) => (
                    <button key={s} type="button" aria-pressed={pv === s} onClick={() => { state.life.pv = s; kayit(); }}>{s === 'model' ? 'Tezgâh' : 'Magazin'}</button>
                  ))}
                </div>
              )}
              <div className="tc-co-onizleme-ipucu">sürükle: döndür</div>
              {d && <div className="tc-co-onizleme-etiket">{OmurOnizlemesi.etiket(d, secili, pv)}</div>}
            </div>
          )}
          {kip === 'track' && (
            <TakipPaneli
              defs={cark.defs} active={cark.active} secili={secili} yetki={yetki}
              satiraGit={(i) => cark.goRow(i)}
              tezgahaGit={(k, id) => { cark.sec(k, (y) => y.t.id === id); }}
              analiz={analizeAc} kutuphane={() => git('lib')} degisti={kayit}
            />
          )}
          {kip === 'renew' && (
            <YenilemePaneli d={d} c={secili} takimDegistirebilir={yetki.takimDegistirebilir} kartSec={(k) => cark.setSel(k)} degisti={kayit} />
          )}
          {kip === 'anal' && res && <AnalizPaneli res={res} yazabilir={yetki.yazabilir} geri={() => kipSec('track')} degisti={kayit} />}
        </div>
      </aside>
    </div>
  );
}
