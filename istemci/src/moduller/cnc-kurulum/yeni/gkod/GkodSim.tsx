import { useCallback, useEffect, useReducer, useRef, useState, type DragEvent } from 'react';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { fmtN, num } from '../bicim.ts';
import { save, state, useCncSurum } from '../depo.ts';
import { useGorunum, useTuslar } from '../gorunum.ts';
import { bekleyenGkodAl, gsimHazirla, SAMPLE_HEID, SAMPLE_ISO } from '../hesap/gkod.ts';
import { ileti } from '../ham/ileti.tsx';
import { useParca } from '../parca.ts';
import { machine, toolLib, tools } from '../secici.ts';
import { useCncYetkisi } from '../veri.ts';
import type { Aciklama } from './aciklama.ts';
import type { HamOrijini } from './kaynak.ts';
import {
  DegisimBolumu, GelismisAyarlar, HamBolumu, hamCipi, KontrolBolumu, kontrolSatirlari, ProgramBolumu, programCipi, TakimBolumu, takimCipi,
  type DegisimSatiri, type ProgramEylemi, type TakimSatiri,
} from './GkodPaneli.tsx';
import { KodListesi, type ListeKipi } from './KodListesi.tsx';
import { degisimZamani, gPosAt, gSpeed, zamanCizelgesi } from './oynatma.ts';
import { Oynatici, type CizelgeDilimi, type OynatmaEylemi } from './Oynatici.tsx';
import {
  bilgi, capGir, elleDegistir, gLoad, gOvMap, gPlay, gReparse, GS, gSeek, gSeekLine, gSeekMove, gSig, hamSec, ilerle, magazineYaz, orijinSec,
  takimNo, takimSec, talasIlerle, talasSifirla, yenidenHesapla,
} from './simulasyon.ts';
import { renkSinifi } from './takim.ts';
import './gkod.css';
import '../ham/ham.css';

const KABUL = '.h,.H,.nc,.NC,.tap,.TAP,.gcode,.ngc,.txt,.mpf,.MPF,.iso,.cnc,.eia,.i,.I';
// Prototipte ekran bilgisi 80 ms'de bir yenilenir; oynatirken React cizimi de bu siklikta.
const CIZIM_MS = 80;

type Anahtar = 'removal' | 'showRapid' | 'showPart' | 'compare' | 'follow';
const ANAHTARLAR: { k: Anahtar; baslik: string }[] = [
  { k: 'removal', baslik: 'Talaş' }, { k: 'showRapid', baslik: 'Hızlı hareket' }, { k: 'showPart', baslik: 'Parça' }, { k: 'compare', baslik: 'Karşılaştır' },
  { k: 'follow', baslik: 'Takımı izle' },
];

// Prototipin G-Kod Simulasyonu gorunumu (#gcodeStage ve #gSide). Hesap ve durum simulasyon.ts'te; 3B sahne iskeletin Sahne katmanini bekler.
export function GkodSim() {
  useCncSurum();
  useParca();
  const { gorunum, burada, git } = useGorunum();
  const { yazabilir } = useCncYetkisi();
  const [, ciz] = useReducer((x: number) => x + 1, 0);
  const dosya = useRef<HTMLInputElement>(null);
  const [birak, setBirak] = useState(false);
  const [kip, setKip] = useState<ListeKipi>('all');
  const gs = gsimHazirla();
  if (gs['dock'] == null) gs['dock'] = typeof window !== 'undefined' && window.innerWidth > 1100;
  const dockAcik = !!gs['dock'];

  // Prototipin PAGES.gcode.enter'i: gonderilen program, kayitli program ya da ornek; imza degistiyse yeniden hesap.
  useEffect(() => {
    const gelen = bekleyenGkodAl(GS.prog?.name ?? null);
    const kayitli = state['gsimText'] as { name: string; text: string } | null | undefined;
    if (gelen) gLoad(gelen.text, gelen.name);
    else if (!GS.prog) { if (kayitli?.text) gLoad(kayitli.text, kayitli.name); else gLoad(SAMPLE_HEID, 'ORNEK.H (Heidenhain)'); }
    else if (gSig() !== GS.sig) yenidenHesapla();
    ciz();
  }, []);

  // Oynatma ve talas dongusu (prototipte her kare). Ekran CIZIM_MS'de bir yenilenir.
  useEffect(() => {
    let kare = 0, once = performance.now(), sonCizim = 0, bekleyen = false;
    const adim = (simdi: number): void => {
      const dt = Math.min(0.1, (simdi - once) / 1000);
      once = simdi;
      if (ilerle(dt, gSpeed(GS.prog, String(gsimHazirla().speed)))) bekleyen = true;
      if (talasIlerle(GS.playing ? 18 : 40)) bekleyen = true;
      if (bekleyen && simdi - sonCizim > CIZIM_MS) { bekleyen = false; sonCizim = simdi; ciz(); }
      kare = requestAnimationFrame(adim);
    };
    kare = requestAnimationFrame(adim);
    return () => { cancelAnimationFrame(kare); };
  }, []);

  const tus = useCallback((e: KeyboardEvent) => {
    let h = true;
    if (e.key === ' ') gPlay(!GS.playing);
    else if (e.key === 'ArrowRight') gSeekMove(GS.idx + 1);
    else if (e.key === 'ArrowLeft') gSeekMove(GS.idx - (GS.frac > 0.01 ? 0 : 1));
    else if (e.key === 'Home') gSeek(0);
    else if (e.key === 'End') gSeek(1e12);
    else h = false;
    if (h) { e.preventDefault(); ciz(); }
  }, []);
  useTuslar(burada && gorunum === 'gcode', tus);

  const yap = (f: () => void) => () => { f(); ciz(); };
  const metinYukle = (f: File | undefined): void => { if (f) void f.text().then((t) => { gLoad(t, f.name); ciz(); }); };
  const birakildi = (e: DragEvent<HTMLDivElement>): void => { e.preventDefault(); setBirak(false); metinYukle(e.dataTransfer.files[0]); };
  const dock = (on: boolean): void => { gs['dock'] = on; save(); };

  const programEylemi = (a: ProgramEylemi): void => {
    if (a === 'open') { dosya.current?.click(); return; }
    gs.lathe = false;
    if (a === 'sh') gLoad(SAMPLE_HEID, 'ORNEK.H (Heidenhain)'); else gLoad(SAMPLE_ISO, 'O1001 (ISO)');
    ciz();
  };
  const oynat = (a: OynatmaEylemi): void => {
    if (a === 'play') gPlay(!GS.playing);
    else if (a === 'start') gSeek(0);
    else if (a === 'end') { gSeek(1e12); gPlay(false); }
    else if (a === 'prev') gSeekMove(GS.idx - 1);
    else gSeekMove(GS.idx + 1);
    ciz();
  };
  const satiraGit = (ln: number): void => { gSeekLine(ln); ciz(); };
  const anahtar = (k: Anahtar): void => {
    gs[k] = !gs[k];
    if (k === 'removal') talasSifirla();
    if (k === 'compare' && GS.hm) GS.hm.dirty = true;
    save();
  };

  const p = GS.prog, hm = GS.hm;
  const tezgah = machine(), magazin = tools();
  const satirlar: TakimSatiri[] = p ? p.tools.map((T) => ({ T, bilgi: bilgi(T), sure: p.stat.perTool[String(T)]?.t ?? 0, seciliId: gOvMap()[String(T)]?.id ?? '' })) : [];
  const uygulanabilir = yazabilir && satirlar.some((s) => s.bilgi.src === 'ov' && typeof s.T === 'number' && s.T <= magazin.length);
  const ilerleme = p ? Math.round(GS.t / (p.total || 1) * 100) : 0;
  const kontrol = p ? kontrolSatirlari(p, bilgi, hm?.coll ?? [], hm?.cmp ?? null, !!gs.compare, ilerleme, !!hm && hm.done >= p.moves.length - 1 && ilerleme >= 99) : null;
  const degisimler: DegisimSatiri[] = p ? GS.tcl.map((ln, k) => {
    const e = GS.ex[ln], T = e?.T, ti = T != null ? bilgi(takimNo(T)) : null;
    return { ln, sira: k + 1, baslik: ti ? 'T' + T + ' · ' + ti.name : (e?.t ?? ''), zaman: degisimZamani(p, ln), renk: ti ? ti.col : null };
  }) : [];
  const dilimler: CizelgeDilimi[] = p && p.moves.length ? zamanCizelgesi(p).map((s) => {
    const ti = bilgi(s.T);
    return { ...s, ad: ti.name, uyumsuz: ti.src !== 'mag', renkSinifi: renkSinifi(ti.col) };
  }) : [];
  const mv = p?.moves[GS.idx], konum = p && mv ? gPosAt(p, GS.idx, GS.frac) : null, ti = mv ? bilgi(mv.T) : null;
  const takimSinifi = (e: Aciklama): string | null => (e.k === 'tc' && e.T ? renkSinifi(bilgi(takimNo(e.T)).col) : null);

  return (
    <div className="tc-ch" data-page="gcode">
      <div
        className={birak ? 'tc-ch-sahne tc-ch-sahne-gkod tc-ch-sahne-birak' : 'tc-ch-sahne tc-ch-sahne-gkod'}
        onDragOver={(e) => { e.preventDefault(); setBirak(true); }} onDragLeave={() => { setBirak(false); }} onDrop={birakildi}
      >
        <div className="tc-ch-sahne-ust">
          <div className="tc-ch-sahne-tuval" data-sahne="gcode" />
          {p && mv && ti && konum && (
            <div className="tc-ch-bilgi tc-ch-hud" aria-live="off">
              <div className="tc-ch-hud-ust">
                <span className={'tc-ch-rozet ' + renkSinifi(ti.col)}>T{String(mv.T)}</span><b>{ti.name}</b>
                <span className={mv.t ? 'tc-ch-kip tc-ch-kip-kesme' : 'tc-ch-kip'}>{mv.t ? 'KESME' : 'HIZLI'}</span>
              </div>
              <div className="tc-ch-hud-satir"><span>{mv.ln + 1}</span>{p.lines[mv.ln]?.trim()}</div>
              <div className="tc-ch-hud-xyz">
                <span>X <b>{fmtN(konum[0], 3)}</b></span><span>Y <b>{fmtN(konum[1], 3)}</b></span><span>Z <b>{fmtN(konum[2], 3)}</b></span>
                <span>F <b>{mv.t ? fmtN(mv.F) : 'MAX'}</b></span>{mv.S ? <span>S <b>{fmtN(mv.S)}</b></span> : null}
              </div>
            </div>
          )}
          <div className="tc-ch-gorus" role="group" aria-label="Simülasyon görünümü">
            {ANAHTARLAR.map(({ k, baslik }) => (
              <Dugme key={k} tur={gs[k] ? 'birincil' : 'ikincil'} aria-pressed={!!gs[k]} onClick={yap(() => { anahtar(k); })}>{baslik}</Dugme>
            ))}
          </div>
          {p && dockAcik && (
            <KodListesi
              satirlar={p.lines} aciklama={GS.ex} degisimler={GS.tcl} gecerli={mv ? mv.ln : null} kip={kip} kipSec={setKip}
              bilgi={fmtN(p.lines.length) + ' satır · ' + GS.tcl.length + ' takım değişimi'} ayristirma={GS.parseT}
              satiraGit={satiraGit} kapat={() => { dock(false); }} takimSinifi={takimSinifi}
            />
          )}
          {!dockAcik && <Dugme className="tc-ch-dock-ac" simge="list" onClick={() => { dock(true); }}>Kod ve anlamı</Dugme>}
          {birak && <div className="tc-ch-mesgul">G-kod / Heidenhain programını buraya bırakın</div>}
        </div>
        <Oynatici
          oynuyor={GS.playing} zaman={GS.t} toplam={p?.total ?? 0} dilimler={dilimler} hiz={String(gs.speed)}
          hizSec={(h) => { gs.speed = h; save(); }} eylem={oynat} git={(t) => { gSeek(t); ciz(); }}
        />
      </div>
      <aside className="tc-ch-panel" aria-label="Simülasyon adımları">
        <input ref={dosya} type="file" accept={KABUL} hidden data-testid="gkod-dosya" onChange={(e) => { metinYukle(e.target.files?.[0]); e.target.value = ''; }} />
        <div className="tc-ch-form">
          <ProgramBolumu p={p} cip={p ? programCipi(p) : null} mesaj={ileti(GS.msg)} ayristirma={GS.parseT} eylem={programEylemi} />
          {p && GS.opts && (
            <HamBolumu
              secenekler={GS.opts} kullanilan={GS.used} orijin={gs.hamOrigin as HamOrijini} parcaKarsilastirmasi={!!hm?.PT} cip={hamCipi(GS.used, GS.sb)}
              sec={(k) => { hamSec(k); ciz(); }} orijinSec={(o) => { orijinSec(o); ciz(); }} elleDegistir={(k, v) => { elleDegistir(k, v); ciz(); }}
              hamSayfasi={() => { git('stock'); }}
            />
          )}
          {p && (
            <TakimBolumu
              satirlar={satirlar} kutuphane={toolLib(tezgah).filter((t) => t.kind !== 'empty' && t.kind !== 'probe')} tezgahAdi={tezgah.name}
              cip={takimCipi(p, bilgi)} uygulanabilir={uygulanabilir}
              takimSec={(T, id) => { takimSec(T, id); ciz(); }} capGir={(T, d) => { capGir(T, d); ciz(); }} uygula={() => { magazineYaz(); ciz(); }}
            />
          )}
          {kontrol && <KontrolBolumu satirlar={kontrol.satirlar} cip={kontrol.cip} satiraGit={satiraGit} />}
          {p && <DegisimBolumu satirlar={degisimler} git={(ln) => { satiraGit(ln); if (!dockAcik) dock(true); }} />}
          <GelismisAyarlar
            dialect={gs.dialect} rapid={gs.rapid} lathe={gs.lathe}
            dilSec={(d) => { gs.dialect = d; gReparse(); ciz(); }} hizliGir={(v) => { gs.rapid = num(v, 30000); gReparse(); ciz(); }}
            tornaSec={(v) => { gs.lathe = v; gReparse(); ciz(); }}
          />
        </div>
      </aside>
    </div>
  );
}

