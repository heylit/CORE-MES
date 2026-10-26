import { useEffect, useRef, useState } from 'react';
import { Simge } from '../arayuz/index.ts';
import type { SimgeAdi } from '../tasarim/simgeler.ts';
import { useTema } from '../veri/tema.ts';
import { three } from './kitaplik.ts';
import type { Gorunum3B } from './model.ts';
import './cizim.css';

// STEP 3B görüntüleyici (model-3b.ts Step3D). sade: araç çubuğu yok, dokunuşla dönmez, kendi etrafında yavaşça döner (terminal büyük ekranı).
// three r147 eski Arkon'un dosyasıdır; burada kullanılan yüzü tiplenir.

interface Vektor { x: number; y: number; z: number; set(x: number, y: number, z: number): void; normalize(): Vektor; multiplyScalar(s: number): Vektor }
interface Renk { set(c: number): void }
interface Malzeme { color: Renk; visible: boolean; transparent?: boolean; opacity?: number }
interface Nesne { position: Vektor; rotation: Vektor; add(o: Nesne): void; material: Malzeme }
interface Geometri { setAttribute(ad: string, a: unknown): void; setIndex(a: unknown): void; computeVertexNormals(): void }
interface Kamera extends Nesne { up: Vektor; aspect: number; updateProjectionMatrix(): void }
interface Denetim { target: Vektor; enableDamping: boolean; dampingFactor: number; autoRotate: boolean; autoRotateSpeed: number; enabled: boolean; update(): void }
interface Cizici { domElement: HTMLCanvasElement; localClippingEnabled: boolean; outputEncoding: unknown; setPixelRatio(r: number): void; setSize(w: number, h: number): void; render(s: Nesne, k: Kamera): void; dispose(): void }
interface Duzlem { constant: number }
type Kurucu<T> = new (...a: never[]) => T;
interface Three {
  WebGLRenderer: Kurucu<Cizici>; Scene: Kurucu<Nesne>; PerspectiveCamera: Kurucu<Kamera>; OrbitControls: Kurucu<Denetim>; Plane: Kurucu<Duzlem>;
  Vector3: Kurucu<Vektor>; MeshStandardMaterial: Kurucu<Malzeme>; Group: Kurucu<Nesne>; BufferGeometry: Kurucu<Geometri>; BufferAttribute: Kurucu<unknown>;
  Mesh: Kurucu<Nesne>; LineBasicMaterial: Kurucu<Malzeme>; LineSegments: Kurucu<Nesne>; HemisphereLight: Kurucu<Nesne>; DirectionalLight: Kurucu<Nesne>;
  GridHelper: Kurucu<Nesne>; sRGBEncoding: unknown; DoubleSide: unknown;
}
const yeni = <T,>(K: Kurucu<T>, ...a: unknown[]): T => new (K as unknown as new (...x: unknown[]) => T)(...a);

type Gorus = 'front' | 'top' | 'left' | 'iso';
const GORUSLER: readonly [Gorus, string][] = [['front', 'Ön'], ['top', 'Üst'], ['left', 'Sol'], ['iso', 'İzo']];
interface Sahne {
  gorus(k: Gorus): void; denetim: Denetim; duzlem: Duzlem; malzeme: Malzeme; renklendir(): void; kapat(): void;
}

export function Model3B({ data, fa, sade = false }: { data: Gorunum3B; fa: number; sade?: boolean }) {
  const { tema } = useTema();
  const kutu = useRef<HTMLDivElement>(null), sahne = useRef<Sahne | null>(null);
  const [kesit, kesitYaz] = useState(100), [tel, telYaz] = useState(false), [don, donYaz] = useState(sade), [hazir, hazirYaz] = useState(false), [hata, hataYaz] = useState('');

  useEffect(() => {
    let canli = true, raf = 0, ro: ResizeObserver | null = null;
    hazirYaz(false);
    (async () => {
      const T = await three() as Three; const el = kutu.current; if (!canli || !el) return;
      const R = yeni(T.WebGLRenderer, { antialias: true, alpha: true, preserveDrawingBuffer: true });
      R.setPixelRatio(Math.min(2, devicePixelRatio)); R.localClippingEnabled = true; R.outputEncoding = T.sRGBEncoding;
      el.appendChild(R.domElement);
      const S = yeni(T.Scene);
      const bb = data.bbox, c = [(bb.mn[0]! + bb.mx[0]!) / 2, (bb.mn[1]! + bb.mx[1]!) / 2, (bb.mn[2]! + bb.mx[2]!) / 2] as const, diag = data.diag;
      const cam = yeni(T.PerspectiveCamera, 35, 1, diag / 100, diag * 20);
      cam.up.set(0, 0, 1);
      const ctl = yeni(T.OrbitControls, cam, R.domElement); ctl.target.set(c[0], c[1], c[2]); ctl.enableDamping = true; ctl.dampingFactor = 0.08;
      const axisN = [0, 0, 0]; axisN[fa] = -1;
      const plane = yeni(T.Plane, yeni(T.Vector3, axisN[0], axisN[1], axisN[2]), bb.mx[fa]! + 1e-3);
      const mat = yeni(T.MeshStandardMaterial, {
        color: 0x9fb3cc, metalness: 0.55, roughness: 0.38, side: T.DoubleSide, clippingPlanes: [plane], polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
      });
      const grp = yeni(T.Group);
      for (const m of data.meshes) {
        const g = yeni(T.BufferGeometry); g.setAttribute('position', yeni(T.BufferAttribute, m.p, 3));
        if (m.n) g.setAttribute('normal', yeni(T.BufferAttribute, m.n, 3));
        g.setIndex(yeni(T.BufferAttribute, m.i, 1)); if (!m.n) g.computeVertexNormals();
        grp.add(yeni(T.Mesh, g, mat));
      }
      const eg = yeni(T.BufferGeometry); eg.setAttribute('position', yeni(T.BufferAttribute, data.ep, 3));
      const emat = yeni(T.LineBasicMaterial, { color: 0xffffff, clippingPlanes: [plane] }); grp.add(yeni(T.LineSegments, eg, emat));
      S.add(grp);
      S.add(yeni(T.HemisphereLight, 0xdfe8ff, 0x1a1e24, 0.9));
      const d1 = yeni(T.DirectionalLight, 0xffffff, 1.1); d1.position.set(1, 1.4, 2); S.add(d1);
      const d2 = yeni(T.DirectionalLight, 0xffd23f, 0.35); d2.position.set(-2, -1, -1); S.add(d2);
      // Zemin ızgarası.
      const gh = yeni(T.GridHelper, diag * 3, 30, 0x5d6675, 0x2a3038); gh.material.transparent = true; gh.material.opacity = 0.35;
      gh.rotation.x = Math.PI / 2; gh.position.set(c[0], c[1], bb.mn[2]! - diag * 0.002);
      S.add(gh);
      const setView = (dir: readonly number[]) => {
        const D = diag * 2.1, v = yeni(T.Vector3, dir[0], dir[1], dir[2]).normalize();
        if (Math.abs(v.z) > 0.999) v.y -= 0.002;
        v.normalize().multiplyScalar(D); cam.position.set(c[0] + v.x, c[1] + v.y, c[2] + v.z); ctl.update();
      };
      const u3 = [0, 0, 0], d3 = [0, 0, 0]; d3[fa] = 1; if (fa === 2) u3[1] = 1; else u3[2] = 1;
      const cr = (a: number[], b: number[]) => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
      const rr = cr(u3, d3);
      const views: Record<Gorus, number[]> = { front: d3, top: u3, left: rr.map((v) => -v), iso: [rr[0]! + u3[0]! + d3[0]!, rr[1]! + u3[1]! + d3[1]!, rr[2]! + u3[2]! + d3[2]!] };
      setView(views.iso);
      // Fiziksel nesnenin rengi temaya göre (eskisi gibi); sabit renkler sahne malzemesidir, ekran rengi değildir.
      const renklendir = () => {
        const koyu = document.documentElement.getAttribute('data-theme') !== 'light';
        mat.color.set(koyu ? 0x8fa6c4 : 0xc3ccd8); emat.color.set(koyu ? 0xdfeaff : 0x12305e); gh.material.color.set(koyu ? 0x2a3038 : 0xc9cfd8);
      };
      renklendir();
      const boyut = () => { const w = el.clientWidth, h = el.clientHeight; R.setSize(w, h); cam.aspect = w / h; cam.updateProjectionMatrix(); };
      ro = new ResizeObserver(boyut); ro.observe(el); boyut();
      const dongu = () => { ctl.update(); R.render(S, cam); raf = requestAnimationFrame(dongu); }; dongu();
      sahne.current = {
        gorus: (k) => setView(views[k]), denetim: ctl, duzlem: plane, malzeme: mat, renklendir,
        kapat: () => { cancelAnimationFrame(raf); ro?.disconnect(); R.dispose(); R.domElement.remove(); },
      };
      hazirYaz(true);
    })().catch((h: unknown) => { if (canli) hataYaz(h instanceof Error ? h.message : String(h)); });
    return () => { canli = false; sahne.current?.kapat(); sahne.current = null; };
  }, [data, fa]);
  useEffect(() => {
    const a = sahne.current; if (!a) return;
    const lo = data.bbox.mn[fa]!, hi = data.bbox.mx[fa]!; a.duzlem.constant = lo + (hi - lo) * kesit / 100 + 1e-3;
  }, [kesit, hazir, data, fa]);
  useEffect(() => { const a = sahne.current; if (a) a.malzeme.visible = !tel; }, [tel, hazir]);
  useEffect(() => {
    const a = sahne.current; if (!a) return;
    a.denetim.autoRotate = don; a.denetim.autoRotateSpeed = sade ? 0.8 : 2.2; a.denetim.enabled = !sade;
  }, [don, hazir, sade]);
  useEffect(() => { sahne.current?.renklendir(); }, [tema, hazir]);

  const arac = (simge: SimgeAdi, acik: boolean, f: () => void, etiket: string) => (
    <button type="button" className={`tc-ay5-arac${acik ? ' tc-ay5-acik' : ''}`} onClick={f} aria-label={etiket} aria-pressed={acik} title={etiket}><Simge ad={simge} /></button>
  );
  return (
    <div className={`tc-ay5-3b${sade ? ' tc-ay5-sade' : ''}`}>
      <div ref={kutu} className="tc-ay5-3b-sahne" role="img" aria-label="3B model" />
      {hata && <div className="tc-ay5-mesgul" role="alert"><b>3B görünüm açılamadı</b><small>{hata}</small></div>}
      {!hazir && !hata && !sade && <div className="tc-ay5-mesgul" role="status"><span className="tc-ay5-tarama" aria-hidden="true" /><b>3B görünüm hazırlanıyor…</b></div>}
      {!sade && (
        <div className="tc-ay5-3b-cubuk">
          {GORUSLER.map(([k, l]) => <button key={k} type="button" className="tc-ay5-dilim" onClick={() => sahne.current?.gorus(k)}>{l}</button>)}
          <span className="tc-ay5-ayrac" aria-hidden="true" />
          {arac('rotate', don, () => donYaz(!don), 'Otomatik döndür')}
          {arac('grid', tel, () => telYaz(!tel), 'Tel kafes')}
          <label className="tc-ay5-kesit">
            <span>Kesit</span>
            <input type="range" min="0" max="100" value={kesit} onChange={(e) => kesitYaz(+e.target.value)} aria-label="Kesit düzlemi" />
            <b>%{kesit}</b>
          </label>
        </div>
      )}
    </div>
  );
}
