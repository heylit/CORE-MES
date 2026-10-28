import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { pad2 } from '../bicim.ts';
import { useCncSurum } from '../depo.ts';
import { useGorunum } from '../gorunum.ts';
import { fmtT } from '../hesap/gkod.ts';
import { S, useParca } from '../parca.ts';
import type { Cizim } from '../sahne/Sahne.tsx';
import { Sahne } from '../sahne/Sahne.tsx';
import { useCncYetkisi } from '../veri.ts';
import {
  camAbone, camDegisti, camGiris, camSurumu, CS, dosyaYukle, hazirligaAktar, mtSatirEtiketi, mtSimulasyonaGonder, simulasyonaGonder,
} from './is.ts';
import { MakineSimulasyonu } from './makine-sahnesi.ts';
import { msSegAt } from './makine-sim.ts';
import { FrezePaneli, KipNotu, MtPaneli, ParcaBolumu, SimPaneli, TornaPaneli, type PanelEylemleri } from './paneller.tsx';
import { RenkOrnegi } from './parcalar.tsx';
import { ISLEM_ADI, islemRengiAdi } from './renk.ts';
import { CamSahnesi } from './sahne.ts';
import './cam.css';

// Prototipin Oto-CAM görünümü (#camStage ve #camSide): solda parça, takım yolları ya da makine simülasyonu; sağda panel (860 altında
// alttan açılan çekmece). Hesap ve durum is.ts'te; sahne sahne.ts ve makine-sahnesi.ts'te.

const KABUL = '.step,.stp,.stl,.STEP,.STP,.STL';
const GORUNUSLER = [['iso', 'İzometrik'], ['top', 'Üst'], ['front', 'Ön'], ['side', 'Yan']] as const;
const HIZLAR = [1, 5, 10, 30, 100] as const;
const OLAY: Record<string, string> = { tc: 'Takım değişimi', approach: 'Karşı iş mili parçaya yanaşıyor', transfer: 'Parça karşı iş miline aktarılıyor', flip: 'Parça ters çevrilip aynaya bağlanıyor' };
const fmtMin = fmtT;
// Prototipin kare yumuşatma katsayısı.
const yumusat = (dt: number): number => 1 - Math.pow(0.0008, dt);

function Lejant() {
  const L: { ad: string; renk: string }[] = [];
  if (S.geo?.rot && CS.G) L.push({ ad: 'Torna yüzeyi', renk: 'cam-torna-lejant' }, { ad: 'Freze yüzeyi', renk: 'cam-freze-lejant' });
  const turler = (ops: { kind: string }[][]): void => {
    const kk: Record<string, 1> = {}; ops.forEach((o) => { o.forEach((x) => { kk[x.kind] = 1; }); });
    Object.keys(kk).forEach((k) => { L.push({ ad: ISLEM_ADI[k] ?? k, renk: islemRengiAdi(k) }); });
  };
  if (CS.mt) { L.push({ ad: 'Torna', renk: 'vurgu' }); turler(CS.mt.res.map((r) => r?.ops ?? [])); }
  if (CS.job) { turler(CS.job.res.map((r) => r.ops)); if (CS.job.AS?.unreach.length) L.push({ ad: 'Ulaşılamaz', renk: 'cam-ulasilamaz' }); }
  if (!L.length) return null;
  return <div className="tc-cc-lejant tc-cc-sahne-lejant">{L.map((x) => <span key={x.ad}><RenkOrnegi ad={x.renk} />{x.ad}</span>)}</div>;
}

function SimGostergesi({ ms }: { ms: MakineSimulasyonu }) {
  const B = ms.S; if (!B) return null;
  const t = Math.min(B.t, B.total - 1e-9), s = B.segs[msSegAt(B, t)], J = B.J, r = s && s.row >= 0 ? J.rows[s.row] : undefined;
  return (
    <div className="tc-cc-hud" role="status">
      <b>{r && s ? 'OP' + r.op + ' · ' + (s.row + 1) + '/' + J.rows.length : ''}</b>
      <span>{(s?.ev && OLAY[s.ev]) || (r ? r.name : '')}</span>
      <small>{r ? 'T' + pad2(r.T ?? 0) + ' · ' + r.tool.name + ' · ' + mtSatirEtiketi(r) : ''}</small>
      <em>{fmtMin(B.t)} / {fmtMin(B.total)}</em>
    </div>
  );
}

function SimCubugu({ ms }: { ms: MakineSimulasyonu }) {
  const B = ms.S, [surukle, surukleYaz] = useState<number | null>(null);
  if (!B) return null;
  const deger = surukle ?? Math.round(B.t / Math.max(1e-9, B.total) * 1000);
  const birak = (): void => {
    if (surukle === null) return;
    ms.dragging = false; surukleYaz(null); void ms.git(surukle / 1000 * B.total);
  };
  return (
    <div className="tc-cc-simcubugu">
      <Dugme simge="first" title="Başa dön" aria-label="Başa dön" onClick={() => { ms.basa(); }} />
      <Dugme simge="chev-left" title="Önceki işlem" aria-label="Önceki işlem" onClick={() => { ms.komsu(-1); }} />
      <Dugme tur="birincil" simge={ms.play ? 'pause' : 'play'} aria-label={ms.play ? 'Duraklat' : 'Oynat'} onClick={() => { ms.oynat(); }} />
      <Dugme simge="chev-right" title="Sonraki işlem" aria-label="Sonraki işlem" onClick={() => { ms.komsu(1); }} />
      <Dugme simge="last" title="Sona git" aria-label="Sona git" onClick={() => { ms.sona(); }} />
      <input
        type="range" min={0} max={1000} value={deger} aria-label="Simülasyon konumu"
        onChange={(e) => { ms.dragging = true; ms.play = false; surukleYaz(+e.target.value); }}
        onPointerUp={birak} onKeyUp={birak} onBlur={birak}
      />
      <select value={ms.speed} aria-label="Hız" onChange={(e) => { ms.speed = +e.target.value; camDegisti(); }}>
        {HIZLAR.map((h) => <option key={h} value={h}>{h}×</option>)}
      </select>
      <Dugme simge="fit" title="Görünümü sığdır" aria-label="Görünümü sığdır" onClick={() => { ms.sigdir(); }} />
    </div>
  );
}

export function OtoCam() {
  useCncSurum();
  useParca();
  useSyncExternalStore(camAbone, camSurumu, camSurumu);
  const { git } = useGorunum();
  const yetki = useCncYetkisi();
  const alan = useRef<HTMLDivElement>(null), dosya = useRef<HTMLInputElement>(null);
  const sahne = useRef<CamSahnesi | null>(null), sim = useRef<MakineSimulasyonu | null>(null);
  const [cekmece, cekmeceYaz] = useState(false);

  // Görünüm açılınca parça ya da tezgâh değiştiyse plan silinir (prototipin PAGES.cam.enter'i).
  useEffect(() => { camGiris(); }, []);
  useEffect(() => {
    const el = alan.current; if (!el) return undefined;
    const s = new CamSahnesi(el), m = new MakineSimulasyonu(s);
    sahne.current = s; sim.current = m; camDegisti();
    return () => { if (m.on) m.durdur(); s.dispose(); sahne.current = null; sim.current = null; };
  }, []);

  const ciz = useCallback((c: Cizim) => {
    const s = sahne.current; if (!s) return;
    sim.current?.frame(c.dt);
    s.frame(c.renderer, c.rect, yumusat(c.dt));
  }, []);

  const eylem: PanelEylemleri = {
    dosyaAc: () => { dosya.current?.click(); },
    hamaGit: () => { git('stock'); },
    simulasyona: (p, si) => { simulasyonaGonder(p, si); git('gcode'); },
    mtSimulasyona: (p) => { mtSimulasyonaGonder(p); git('gcode'); },
    hazirliga: (p) => { hazirligaAktar(p); git('prep', { adim: 'prog' }); },
  };
  const py = { yazabilir: yetki.yazabilir, takimDegistirebilir: yetki.takimDegistirebilir };

  const ms = sim.current, simde = !!ms?.on, ad = S.name || 'Parça';
  const baslik = simde ? ad + ' · makinede simülasyon'
    : CS.mt ? ad + ' · torna + freze · ' + CS.mt.rows.length + ' işlem' : CS.job ? ad + ' · ' + CS.job.setups.length + ' bağlama' : CS.lathe ? ad + ' · torna' : 'Otomatik program';
  const alt = simde ? 'Sürükle: döndür · tekerlek: yakınlaş · alt çubuk: oynat / ileri sar'
    : CS.mt ? 'Turuncu: torna (üst ön, alt arka taraf) · renkli: freze · mavi ok: takım yönü'
      : CS.job || CS.lathe ? 'Renkler işlem türü · kırmızı kutu: ulaşılamaz bölge · sürükle: döndür' : 'Parçayı yükleyin, program üretin';
  const parcaAcik = sahne.current?.part.visible !== false, hamAcik = sahne.current?.stock.visible !== false;

  return (
    <div className="tc-cc" data-page="cam">
      <div className="tc-cc-sahne">
        <div ref={alan} className="tc-cc-sahne-alan"><Sahne ciz={ciz} sinif="tc-cc-tuval" /></div>
        <div className="tc-cc-bilgi">
          <small>OTO-CAM · OTOMATİK PROGRAM</small>
          <b>{baslik}</b>
          <span>{alt}</span>
        </div>
        <div className="tc-cc-gorus">
          {GORUNUSLER.map(([v, a]) => (
            <Dugme key={v} onClick={() => { if (ms?.on) ms.sigdir(v); else sahne.current?.sigdir(v); }}>{a}</Dugme>
          ))}
          <Dugme simge="cube" aria-pressed={parcaAcik} onClick={() => { sahne.current?.goster('part'); camDegisti(); }}>Parça</Dugme>
          <Dugme simge="box" aria-pressed={hamAcik} onClick={() => { sahne.current?.goster('stock'); camDegisti(); }}>Ham</Dugme>
        </div>
        {!simde && <Lejant />}
        {simde && ms && <SimGostergesi ms={ms} />}
        {simde && ms && <SimCubugu ms={ms} />}
        {CS.busy && <div className="tc-cc-mesgul" role="status">{CS.busy}</div>}
      </div>
      <aside className={`tc-cc-yan${cekmece ? ' tc-cc-acik' : ''}`} aria-label="Oto-CAM">
        <button type="button" className="tc-cc-cekmece" onClick={() => { cekmeceYaz(!cekmece); }}>
          <Simge ad={cekmece ? 'down' : 'up'} boyut="k" /> Oto-CAM
        </button>
        <input
          ref={dosya} type="file" accept={KABUL} hidden data-testid="cam-dosya"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) dosyaYukle(f); e.target.value = ''; }}
        />
        <div className="tc-cc-yan-kaydir">
          {simde && ms ? <SimPaneli ms={ms} /> : (
            <>
              <ParcaBolumu eylem={eylem} />
              {CS.mt ? <MtPaneli J={CS.mt} yetki={py} eylem={eylem} simuleEt={() => { if (CS.mt) void ms?.baslat(CS.mt); }} />
                : CS.lathe ? <TornaPaneli L={CS.lathe} yetki={py} eylem={eylem} />
                  : CS.job ? <FrezePaneli J={CS.job} yetki={py} eylem={eylem} />
                    : S.P && S.res?.ok ? <KipNotu /> : null}
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
