import { useCallback, useEffect, useRef, useState, type DragEvent } from 'react';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { fmt, fmtN } from '../bicim.ts';
import { save, state, useCncSurum } from '../depo.ts';
import { useGorunum } from '../gorunum.ts';
import { gsimHazirla } from '../hesap/gkod.ts';
import { hamCsv, hamCsvAdi, type HamAyar } from '../hesap/ham.ts';
import { download } from '../indir.ts';
import {
  hamHesapla, minBox, parcaDegisti, parcaYukle, rotateBy, S, samplePart, sBodyMesh, sSetMesh, stockMat, useParca,
} from '../parca.ts';
import { HamSahnesi } from '../sahne/ham-sahnesi.ts';
import { Ham2b } from '../sahne/ham-2b.ts';
import { CizimModuSecici, Sahne, useCizimModu, type Cizim } from '../sahne/Sahne.tsx';
import { allMaterials } from '../secici.ts';
import { useCncYetkisi } from '../veri.ts';
import { HamFormu, type HamEylemi } from './HamFormu.tsx';
import { HamSonucu, type SonucEylemi } from './HamSonucu.tsx';
import { ileti } from './ileti.tsx';
import './ham.css';

const CEYREK = Math.PI / 2;
const KABUL = '.step,.stp,.stl,.STEP,.STP,.STL';
const GORUNUSLER = [['iso', 'İzometrik'], ['top', 'Üst'], ['front', 'Ön']] as const;
const yumusat = (dt: number): number => 1 - Math.pow(0.0008, dt);

// Prototipin Ham Malzeme gorunumu (#stockStage ve #stockSide). Hesap parca.ts'te, sahne sahne/ham-sahnesi.ts'te; burada form ve eylemler.
export function HamMalzeme() {
  useCncSurum();
  useParca();
  const { git } = useGorunum();
  const { yazabilir } = useCncYetkisi();
  const dosya = useRef<HTMLInputElement>(null), alan = useRef<HTMLDivElement>(null), sahne = useRef<HamSahnesi | null>(null);
  const [cizici2b] = useState(() => new Ham2b()), mod = useCizimModu();
  const [birak, setBirak] = useState(false);
  const st = state.stock;

  // 3D sahne yalnız 3D modda kurulur: 2B modda kamera sürükleme dinleyicisi de olmaz.
  useEffect(() => {
    const el = alan.current; if (!el || mod !== '3d') return undefined;
    const s = new HamSahnesi(el); sahne.current = s;
    return () => { s.dispose(); sahne.current = null; };
  }, [mod]);
  const ciz = useCallback((c: Cizim) => { sahne.current?.frame(c.renderer, c.rect, yumusat(c.dt)); }, []);

  // Prototipin PAGES.stock.enter'i: sonuc yoksa hesaplanir.
  useEffect(() => { if (!S.res) hamHesapla(); }, []);

  const degistir = <K extends keyof HamAyar>(k: K, v: HamAyar[K]): void => {
    st[k] = v;
    if (k === 'type' || k === 'axis') S.fitPending = true;
    hamHesapla();
    save();
  };
  const malzemeSec = (id: string): void => { st.mat = id; hamHesapla(); save(); };

  const eylem = (a: HamEylemi): void => {
    if (a === 'open') dosya.current?.click();
    else if (a === 'sample') { samplePart(); save(); }
    else if (a === 'rx' || a === 'ry' || a === 'rz') rotateBy(a[1] as 'x' | 'y' | 'z', CEYREK);
    else if (a === 'rreset') { S.q.identity(); S.fitPending = true; hamHesapla(); }
    else minBox();
  };

  const sonucEylemi = (a: SonucEylemi): void => {
    const r = S.res;
    if (!r) return;
    if (a === 'toSim') { gsimHazirla().stockSrc = 'ham'; save(); git('gcode'); }
    else if (a === 'toSetup') {
      state.meta.stock = r.label + ' · ' + stockMat().name + ' · ' + fmtN(r.ms, 2) + ' kg';
      save();
      S.msg = '✓ Kurulum kartına yazıldı: ' + state.meta.stock;
      parcaDegisti();
    } else download(hamCsvAdi(S.name), hamCsv(r, S.name, stockMat().name, (x) => fmt(x)), 'text/csv;charset=utf-8');
  };

  const govdeSec = (i: number): void => {
    const b = S.bodies;
    if (!b || i === S.bodySel) return;
    S.bodySel = i;
    sSetMesh(sBodyMesh(), S.bodyFile + (i >= 0 ? ' · ' + (b[i]?.name ?? '') : ''), true);
    save();
  };

  const yukle = (f: File | undefined): void => { if (f) void parcaYukle(f).then(save); };
  const birakildi = (e: DragEvent<HTMLDivElement>): void => { e.preventDefault(); setBirak(false); yukle(e.dataTransfer.files[0]); };

  const r = S.res, mat = stockMat();
  return (
    <div className="tc-ch" data-page="stock">
      <div
        className={birak ? 'tc-ch-sahne tc-ch-sahne-birak' : 'tc-ch-sahne'}
        onDragOver={(e) => { e.preventDefault(); setBirak(true); }} onDragLeave={() => { setBirak(false); }} onDrop={birakildi}
      >
        <div ref={alan} className="tc-ch-sahne-tuval" data-sahne="stock"><Sahne cizici2b={cizici2b} ciz={ciz} sinif="tc-ch-tuval" /></div>
        <div className="tc-ch-bilgi">
          <small>HAM MALZEME HESABI</small>
          <b>{S.name || (r ? 'Elle girilen ölçü' : 'Model yok')}</b>
          {r && <span>{r.label}</span>}
        </div>
        <div className="tc-ch-gorus">
          <CizimModuSecici />
            {GORUNUSLER.map(([v, a]) => <Dugme key={v} onClick={() => { if (mod === '3d') sahne.current?.sigdir(v); else cizici2b.gorus = v; }}>{a}</Dugme>)}
          <Dugme tur="birincil" simge="upload" onClick={() => { dosya.current?.click(); }}>Yükle</Dugme>
        </div>
        {S.busy && <div className="tc-ch-mesgul" role="status">{S.busy}</div>}
        {birak && <div className="tc-ch-mesgul">STEP / STL dosyasını buraya bırakın</div>}
      </div>
      <aside className="tc-ch-panel" aria-label="Hammadde Hesabı">
        <input
          ref={dosya} type="file" accept={KABUL} hidden data-testid="ham-dosya"
          onChange={(e) => { yukle(e.target.files?.[0]); e.target.value = ''; }}
        />
        <HamFormu
          st={st} malzemeler={allMaterials()} seciliMalzeme={st.mat || state.material} varsayilanRho={mat.rho}
          modelVar={!!S.P} mesaj={ileti(S.msg)} degistir={degistir} malzemeSec={malzemeSec} eylem={eylem}
          sonuc={
            <HamSonucu
              r={r} geo={S.geo} otomatikEksen={st.axis === 'auto'} malzeme={mat.name}
              model={S.P ? { area: S.area, tris: S.tris, solids: S.solids } : null}
              govdeler={S.bodies} govdeSecili={S.bodySel} govdeSec={govdeSec} eylem={sonucEylemi} yazabilir={yazabilir}
            />
          }
        />
      </aside>
    </div>
  );
}
