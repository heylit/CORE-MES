import { useEffect, useRef, useState } from 'react';
import {
  ACESFilmicToneMapping, Box3, CanvasTexture, Color, LinearSRGBColorSpace, DirectionalLight, DoubleSide, Group, HemisphereLight, Mesh, MeshBasicMaterial, PerspectiveCamera,
  PlaneGeometry, Raycaster, Scene, SRGBColorSpace, Vector2, Vector3, WebGLRenderer,
} from 'three';
import type { Object3D } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Dugme, DurumKutusu } from '../../ortak/arayuz/index.ts';
import { birak, modelOku, type ModelBicimi } from '../cizimler/disari.ts';
import { yonelim, type Yer } from './sahne.ts';

export interface SahneMarkasi {
  sira: number;
  yer: Yer;
  // Düzlemin üstünde önizlenen metin (seri no örneği ya da sabit metin).
  metin: string;
}

interface Kurulum {
  cizer: WebGLRenderer;
  kamera: PerspectiveCamera;
  kontrol: OrbitControls;
  kok: Group;
  markalar: Group;
  kare: number;
}

// Tıklama ile döndürme ayrılır: imleç bu kadar pikselden az kaydıysa yer seçimi sayılır.
const TIKLAMA_PAYI_PX = 5;

// Sahne renkleri tasarım değişkenlerinden okunur (tokens.css); değişken yoksa (test ortamı) nötr gri.
function sahneRengi(ad: string): string {
  const deger = getComputedStyle(document.documentElement).getPropertyValue(ad).trim();
  return deger === '' ? 'gray' : deger;
}
const isikRengi = (ad: string): Color => new Color().setStyle(sahneRengi(ad), LinearSRGBColorSpace);

// Markanın yüzü: zemin vurgu rengi, üstünde metin. Tuval 2B bağlamı yoksa (test ortamı) yalnız renk.
function markaMalzemesi(metin: string, secili: boolean, en: number, boy: number): MeshBasicMaterial {
  const zemin = sahneRengi(secili ? '--sahne3b-vurgu' : '--sahne3b-sari');
  const malzeme = new MeshBasicMaterial({
    color: zemin, transparent: true, opacity: 0.85, side: DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, depthWrite: false,
  });
  const tuval = document.createElement('canvas');
  const olcek = 512 / Math.max(en, boy);
  tuval.width = Math.max(16, Math.round(en * olcek));
  tuval.height = Math.max(16, Math.round(boy * olcek));
  const c = tuval.getContext('2d');
  if (!c) return malzeme;
  c.fillStyle = zemin;
  c.fillRect(0, 0, tuval.width, tuval.height);
  c.fillStyle = sahneRengi('--sahne3b-siyah');
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  let punto = tuval.height * 0.7;
  c.font = `${punto}px ${sahneRengi('--font-mono')}`;
  while (punto > 6 && c.measureText(metin).width > tuval.width * 0.92) {
    punto *= 0.9;
    c.font = `${punto}px ${sahneRengi('--font-mono')}`;
  }
  c.fillText(metin, tuval.width / 2, tuval.height / 2);
  const doku = new CanvasTexture(tuval);
  doku.colorSpace = SRGBColorSpace;
  malzeme.map = doku;
  malzeme.color.setRGB(1, 1, 1);
  return malzeme;
}

function markaAgi(m: SahneMarkasi, secili: boolean): Mesh {
  const ag = new Mesh(new PlaneGeometry(m.yer.enMm, m.yer.boyMm), markaMalzemesi(m.metin, secili, m.yer.enMm, m.yer.boyMm));
  ag.position.set(...m.yer.merkez);
  ag.quaternion.copy(yonelim(m.yer));
  ag.renderOrder = 1;
  return ag;
}

function markalariBirak(g: Group): void {
  for (const c of [...g.children]) {
    g.remove(c);
    if (c instanceof Mesh) {
      c.geometry.dispose();
      const m = c.material as MeshBasicMaterial;
      m.map?.dispose();
      m.dispose();
    }
  }
}

export function Markalama3B({ veri, bicim, markalar, secili, yerSec }: {
  veri: Uint8Array;
  bicim: ModelBicimi;
  markalar: readonly SahneMarkasi[];
  secili: number | null;
  // Verilirse modelin yüzüne tıklamak seçili markanın yerini o noktaya koyar.
  yerSec?: (nokta: Vector3, normal: Vector3) => void;
}) {
  const kap = useRef<HTMLDivElement>(null);
  const kurulum = useRef<Kurulum | null>(null);
  const yerSecRef = useRef(yerSec);
  yerSecRef.current = yerSec;
  const [model, modelYaz] = useState<Object3D | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);

  useEffect(() => {
    const el = kap.current;
    if (!el || typeof WebGLRenderingContext === 'undefined') return undefined;
    let cizer: WebGLRenderer;
    try {
      cizer = new WebGLRenderer({ antialias: true });
    } catch {
      hataYaz('Bu cihazda üç boyutlu görüntü açılamadı.');
      return undefined;
    }
    cizer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    cizer.outputColorSpace = SRGBColorSpace;
    cizer.toneMapping = ACESFilmicToneMapping;
    cizer.toneMappingExposure = 0.9;
    cizer.domElement.classList.add('tc-mrk-tuval');
    el.appendChild(cizer.domElement);
    const sahne = new Scene();
    sahne.background = new Color().setStyle(sahneRengi('--sahne-arka'));
    sahne.add(new HemisphereLight(isikRengi('--sahne3b-gok'), isikRengi('--sahne3b-yer'), 0.6 * Math.PI));
    const isik = new DirectionalLight(isikRengi('--sahne3b-isik'), 2 * Math.PI);
    sahne.add(isik);
    const kok = new Group();
    const markalarGrubu = new Group();
    sahne.add(kok, markalarGrubu);
    const kamera = new PerspectiveCamera(35, 1, 0.1, 100000);
    kamera.position.set(200, 150, 250);
    const kontrol = new OrbitControls(kamera, cizer.domElement);
    kontrol.enableDamping = true;
    const boyutla = () => {
      const en = Math.max(1, el.clientWidth);
      const boy = Math.max(1, el.clientHeight);
      cizer.setSize(en, boy, false);
      kamera.aspect = en / boy;
      kamera.updateProjectionMatrix();
    };
    const gozcu = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(boyutla);
    gozcu?.observe(el);
    boyutla();

    const isin = new Raycaster();
    let basla: Vector2 | null = null;
    const bas = (o: PointerEvent) => { basla = new Vector2(o.clientX, o.clientY); };
    const birakti = (o: PointerEvent) => {
      const s = yerSecRef.current;
      if (!s || !basla || basla.distanceTo(new Vector2(o.clientX, o.clientY)) > TIKLAMA_PAYI_PX) return;
      const kutu = cizer.domElement.getBoundingClientRect();
      const nokta = new Vector2(((o.clientX - kutu.left) / kutu.width) * 2 - 1, -((o.clientY - kutu.top) / kutu.height) * 2 + 1);
      isin.setFromCamera(nokta, kamera);
      const vurus = isin.intersectObject(kok, true)[0];
      if (!vurus?.face) return;
      const normal = vurus.face.normal.clone().transformDirection(vurus.object.matrixWorld);
      // Arka yüze tıklandıysa normal kameraya döner: marka görünen yüzün üstünde durur.
      if (normal.dot(isin.ray.direction) > 0) normal.negate();
      s(vurus.point.clone(), normal);
    };
    cizer.domElement.addEventListener('pointerdown', bas);
    cizer.domElement.addEventListener('pointerup', birakti);

    const k: Kurulum = { cizer, kamera, kontrol, kok, markalar: markalarGrubu, kare: 0 };
    const dongu = () => {
      k.kare = requestAnimationFrame(dongu);
      kontrol.update();
      isik.position.copy(kamera.position);
      cizer.render(sahne, kamera);
    };
    dongu();
    kurulum.current = k;
    return () => {
      cancelAnimationFrame(k.kare);
      gozcu?.disconnect();
      cizer.domElement.removeEventListener('pointerdown', bas);
      cizer.domElement.removeEventListener('pointerup', birakti);
      kontrol.dispose();
      markalariBirak(markalarGrubu);
      birak(sahne);
      cizer.forceContextLoss();
      cizer.dispose();
      cizer.domElement.remove();
      kurulum.current = null;
    };
  }, []);

  useEffect(() => {
    modelYaz(null);
    hataYaz(null);
    let iptal = false;
    const varsayilan = isikRengi('--sahne3b-celik');
    modelOku(veri, bicim, varsayilan).then(
      (m) => { if (iptal) birak(m); else modelYaz(m); },
      (e: unknown) => { if (!iptal) hataYaz(e instanceof Error ? e.message : 'Model okunamadı.'); },
    );
    return () => { iptal = true; };
  }, [veri, bicim]);

  const cercevele = () => {
    const k = kurulum.current;
    if (!k || !model) return;
    const kutu = new Box3().setFromObject(model);
    const merkez = kutu.getCenter(new Vector3());
    const r = Math.max(1, kutu.getSize(new Vector3()).length() / 2);
    k.kontrol.target.copy(merkez);
    const dikey = (k.kamera.fov * Math.PI) / 360;
    const yatay = Math.atan(Math.tan(dikey) * k.kamera.aspect);
    const uzaklik = (r / Math.sin(Math.min(dikey, yatay))) * 1.15;
    k.kamera.position.copy(merkez).add(new Vector3(1.4, 1.0, 1.8).normalize().multiplyScalar(uzaklik));
    k.kamera.near = r / 100;
    k.kamera.far = r * 100;
    k.kamera.updateProjectionMatrix();
  };

  const seciliyeBak = () => {
    const k = kurulum.current;
    const m = markalar.find((x) => x.sira === secili);
    if (!k || !m) return;
    const merkez = new Vector3(...m.yer.merkez);
    const uzaklik = Math.max(m.yer.enMm, m.yer.boyMm) * 4;
    k.kontrol.target.copy(merkez);
    k.kamera.position.copy(merkez).add(new Vector3(...m.yer.normal).normalize().multiplyScalar(uzaklik));
    k.kamera.near = uzaklik / 100;
    k.kamera.updateProjectionMatrix();
  };

  useEffect(() => {
    const k = kurulum.current;
    if (!k || !model) return undefined;
    k.kok.add(model);
    cercevele();
    return () => { k.kok.remove(model); birak(model); };
  }, [model]);

  useEffect(() => {
    const k = kurulum.current;
    if (!k) return undefined;
    for (const m of markalar) k.markalar.add(markaAgi(m, m.sira === secili));
    return () => { markalariBirak(k.markalar); };
  }, [markalar, secili]);

  return (
    <div className="tc-mrk-model">
      <div ref={kap} className={`tc-mrk-sahne${yerSec ? ' tc-mrk-sahne-sec' : ''}`} role="img" aria-label="Markalama yerleri üç boyutlu model üzerinde" />
      {hata && <DurumKutusu durum="hata" mesaj={hata} />}
      {!model && !hata && <DurumKutusu durum="yukleniyor" mesaj="Model hazırlanıyor" />}
      {model && (
        <div className="tc-mrk-arac">
          <Dugme simge="fit" onClick={cercevele}>Sığdır</Dugme>
          {secili !== null && markalar.some((m) => m.sira === secili) && <Dugme simge="target" onClick={seciliyeBak}>Markaya bak</Dugme>}
          {yerSec && <span className="tc-mrk-ipucu">Seçili markanın yeri için modelin yüzeyine dokunun; döndürmek için sürükleyin.</span>}
        </div>
      )}
    </div>
  );
}
