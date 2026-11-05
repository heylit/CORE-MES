import { useEffect, useId, useRef, useState } from 'react';
import {
  Box3, BoxGeometry, BufferGeometry, Color, DirectionalLight, EdgesGeometry, Group, HemisphereLight, Line, LineBasicMaterial, LineDashedMaterial, LinearSRGBColorSpace, LineSegments, Matrix4,
  Mesh, MeshBasicMaterial, PerspectiveCamera, Quaternion, Scene, SRGBColorSpace, TorusGeometry, Vector3, WebGLRenderer,
} from 'three';
import type { Material, Object3D } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Dugme, DurumKutusu, Simge } from '../../ortak/arayuz/index.ts';
import { birak, modelOku, type ModelBicimi } from '../belge-merkezi/disari.ts';
import { patlatmaKaymasi } from './gorunum.ts';

// Sahne renkleri tasarım değişkenlerinden okunur; değişken yoksa (test ortamı) nötr gri.
function renk(ad: string): Color {
  const deger = getComputedStyle(document.documentElement).getPropertyValue(ad).trim();
  return new Color().setStyle(deger === '' ? 'gray' : deger, LinearSRGBColorSpace);
}

// Seçilen deliğin vurgusu (2044-2): girişte halka, girişten içeri eksen çizgisi. Konum ve eksen sunucudandır, model koordinatında (mm, Z yukarı).
export interface Vurgu { konum: readonly number[]; eksen: readonly number[]; capMm: number; derinlikMm: number }

function vurguKur(v: Vurgu): Group {
  const g = new Group();
  const renkli = renk('--hazard');
  const r = v.capMm / 2 + Math.max(0.5, v.capMm * 0.08);
  // Model önünde kalsın diye derinlik denetimi kapalı: halka delik içinde de görünür.
  const halka = new Mesh(new TorusGeometry(r, Math.max(0.2, r * 0.06), 8, 48), new MeshBasicMaterial({ color: renkli, depthTest: false }));
  const yon = new Vector3(v.eksen[0] ?? 0, v.eksen[1] ?? 0, v.eksen[2] ?? 1).normalize();
  halka.quaternion.copy(new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), yon));
  const bas = new Vector3(v.konum[0] ?? 0, v.konum[1] ?? 0, v.konum[2] ?? 0);
  halka.position.copy(bas);
  halka.renderOrder = 10;
  const boy = Math.max(v.derinlikMm, r);
  const cizgi = new Line(new BufferGeometry().setFromPoints([bas.clone().addScaledVector(yon, -r), bas.clone().addScaledVector(yon, boy)]),
    new LineDashedMaterial({ color: renkli, dashSize: Math.max(0.5, r * 0.4), gapSize: Math.max(0.4, r * 0.3), depthTest: false }));
  cizgi.computeLineDistances();
  cizgi.renderOrder = 10;
  g.add(halka, cizgi);
  return g;
}

// Seçilen montaj parçalarının vurgusu (2113): sunucunun dünya kutuları (model koordinatı, mm) kenar çizgisi ve yarı saydam dolguyla çizilir.
// Ağ ile düğüm eşlemesi tutulmaz; kutu yerleşimi yeter.
export interface ParcaKutusu { en: readonly number[]; ust: readonly number[] }

function kutularKur(kutular: readonly ParcaKutusu[]): Group {
  const g = new Group();
  const renkli = renk('--hazard');
  for (const k of kutular) {
    const en = new Vector3(k.en[0] ?? 0, k.en[1] ?? 0, k.en[2] ?? 0), ust = new Vector3(k.ust[0] ?? 0, k.ust[1] ?? 0, k.ust[2] ?? 0);
    const boyut = ust.clone().sub(en).max(new Vector3(0.01, 0.01, 0.01));
    const govde = new BoxGeometry(boyut.x, boyut.y, boyut.z);
    const merkez = en.clone().add(ust).multiplyScalar(0.5);
    const dolgu = new Mesh(govde, new MeshBasicMaterial({ color: renkli, transparent: true, opacity: 0.35, depthTest: false }));
    const kenar = new LineSegments(new EdgesGeometry(govde), new LineBasicMaterial({ color: renkli, depthTest: false }));
    for (const n of [dolgu, kenar]) { n.userData['merkez'] = merkez; n.position.copy(merkez); n.renderOrder = 10; g.add(n); }
  }
  return g;
}

// Patlatma (2139-1 c): her ağ (katı parça) kendi yerinden, oran 1'deki kaymasıyla (ebeveyninin koordinatında) tutulur.
// Kayma modelin iç grubunda (CAD koordinatı) hesaplanır; vurgu kutuları da aynı kuralla kayar. Yalnız görünümdür.
export interface PatlatmaParcasi { ag: Mesh; ilk: Vector3; birim: Vector3 }
export interface Patlatma { merkez: Vector3; parcalar: PatlatmaParcasi[] }

export function patlatmaKur(ic: Object3D): Patlatma {
  ic.updateWorldMatrix(true, true);
  const icTers = ic.matrixWorld.clone().invert();
  const aglar: { ag: Mesh; merkez: Vector3 }[] = [];
  const tum = new Box3();
  ic.traverse((n) => {
    if (!(n instanceof Mesh)) return;
    const g = n.geometry as BufferGeometry;
    if (g.boundingBox === null) g.computeBoundingBox();
    const kutu = (g.boundingBox ?? new Box3()).clone().applyMatrix4(new Matrix4().multiplyMatrices(icTers, n.matrixWorld));
    if (kutu.isEmpty()) return;
    tum.union(kutu);
    aglar.push({ ag: n, merkez: kutu.getCenter(new Vector3()) });
  });
  const merkez = tum.isEmpty() ? new Vector3() : tum.getCenter(new Vector3());
  const parcalar = aglar.map(({ ag, merkez: m }) => {
    const kayma = new Vector3(...patlatmaKaymasi(m.toArray(), merkez.toArray(), 1));
    // Kayma ebeveynin koordinatına çevrilir (occt'de ebeveyn iç gruptur, çeviri birimdir; glTF'de iç içe düğüm olabilir).
    const cevir = new Matrix4().multiplyMatrices((ag.parent ?? ic).matrixWorld.clone().invert(), ic.matrixWorld);
    const birim = kayma.clone().applyMatrix4(cevir).sub(new Vector3().applyMatrix4(cevir));
    return { ag, ilk: ag.position.clone(), birim };
  });
  return { merkez, parcalar };
}

// Çubuk yalnız en az iki katı parçalı modelde görünür (2139-1 c); oran yüzde, 0-100.
export function PatlatmaCubugu({ oran, oranYaz }: { oran: number; oranYaz: (x: number) => void }) {
  const kimlik = useId();
  return (
    <div className="tc-g3b-patlat">
      <label className="tc-g3b-patlat-etiket" htmlFor={kimlik}><Simge ad="expand" />Patlatma</label>
      <input id={kimlik} type="range" min={0} max={100} step={1} value={oran} aria-valuetext={`yüzde ${String(oran)}`}
        onChange={(e) => oranYaz(Number(e.target.value))} />
      <output htmlFor={kimlik} className="tc-g3b-patlat-deger">%{oran}</output>
      <Dugme tur="ikincil" simge="rotate" disabled={oran === 0} onClick={() => oranYaz(0)}>Topla</Dugme>
    </div>
  );
}

// Yalnız bakmak içindir (döndür, yakınlaştır): ölçü sunucudan gelir, burada hesaplanmaz. Ayrı pakette iner (React.lazy).
export default function Goruntu3B({ veri, bicim, vurgu = null, kutular = null }: {
  veri: Uint8Array; bicim: ModelBicimi; vurgu?: Vurgu | null; kutular?: readonly ParcaKutusu[] | null;
}) {
  const kap = useRef<HTMLDivElement>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  // Modelin iç grubu (CAD koordinatı; dış grup Z'yi Y yukarı çevirir). Vurgu buna eklenir, model dönüşüyle birlikte durur.
  const icGrup = useRef<Object3D | null>(null);
  const [yuklendi, yuklendiYaz] = useState(0);
  const patlatma = useRef<Patlatma | null>(null);
  const kutuGrubu = useRef<Group | null>(null);
  const [parcaSayisi, parcaSayisiYaz] = useState(0);
  // Yüzde, 0-100; sayfa yenilenince sıfırdır.
  const [oran, oranYaz] = useState(0);

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
    cizer.domElement.classList.add('tc-g3b-tuval');
    el.appendChild(cizer.domElement);
    const sahne = new Scene();
    sahne.background = renk('--sahne-arka');
    sahne.add(new HemisphereLight(renk('--sahne3b-gok'), renk('--sahne3b-yer'), 0.6 * Math.PI));
    const isik = new DirectionalLight(renk('--sahne3b-isik'), 2 * Math.PI);
    sahne.add(isik);
    const kamera = new PerspectiveCamera(35, 1, 0.1, 100000);
    const kontrol = new OrbitControls(kamera, cizer.domElement);
    kontrol.enableDamping = true;
    const boyutla = () => {
      const en = Math.max(1, el.clientWidth), boy = Math.max(1, el.clientHeight);
      cizer.setSize(en, boy, false);
      kamera.aspect = en / boy;
      kamera.updateProjectionMatrix();
    };
    const gozcu = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(boyutla);
    gozcu?.observe(el);
    boyutla();
    let model: Object3D | null = null;
    let iptal = false;
    modelOku(veri, bicim, renk('--sahne3b-celik')).then((m) => {
      if (iptal) { birak(m); return; }
      model = m;
      icGrup.current = m.children[0] ?? m;
      patlatma.current = patlatmaKur(icGrup.current);
      parcaSayisiYaz(patlatma.current.parcalar.length);
      yuklendiYaz((n) => n + 1);
      sahne.add(m);
      const kutu = new Box3().setFromObject(m);
      const merkez = kutu.getCenter(new Vector3());
      const r = Math.max(1, kutu.getSize(new Vector3()).length() / 2);
      kontrol.target.copy(merkez);
      kamera.position.copy(merkez).add(new Vector3(1.4, 1.0, 1.8).normalize().multiplyScalar(r * 3));
      kamera.near = r / 100;
      kamera.far = r * 100;
      kamera.updateProjectionMatrix();
    }, (e: unknown) => { if (!iptal) hataYaz(e instanceof Error ? e.message : 'Model okunamadı.'); });
    let kare = 0;
    const dongu = () => {
      kare = requestAnimationFrame(dongu);
      kontrol.update();
      isik.position.copy(kamera.position);
      cizer.render(sahne, kamera);
    };
    dongu();
    return () => {
      iptal = true;
      cancelAnimationFrame(kare);
      gozcu?.disconnect();
      kontrol.dispose();
      if (model) birak(model);
      icGrup.current = null;
      patlatma.current = null;
      cizer.forceContextLoss();
      cizer.dispose();
      cizer.domElement.remove();
    };
  }, [veri, bicim]);

  const [kx, ky, kz] = vurgu?.konum ?? [];
  const [ex, ey, ez] = vurgu?.eksen ?? [];
  const cap = vurgu?.capMm, derinlik = vurgu?.derinlikMm;
  useEffect(() => {
    const ic = icGrup.current;
    if (ic === null || cap === undefined || kx === undefined) return undefined;
    const g = vurguKur({ konum: [kx, ky ?? 0, kz ?? 0], eksen: [ex ?? 0, ey ?? 0, ez ?? 1], capMm: cap, derinlikMm: derinlik ?? 0 });
    ic.add(g);
    return () => {
      ic.remove(g);
      for (const c of g.children) {
        if (c instanceof Mesh || c instanceof Line) { (c.geometry as BufferGeometry).dispose(); (c.material as MeshBasicMaterial).dispose(); }
      }
    };
  }, [yuklendi, kx, ky, kz, ex, ey, ez, cap, derinlik]);

  // Parçalar ve vurgu kutuları orana göre yerine konur; oran değişince yalnız konum değişir, ağ yeniden kurulmaz.
  const yerlestir = () => {
    const p = patlatma.current;
    if (p === null) return;
    const k = oran / 100;
    for (const x of p.parcalar) x.ag.position.copy(x.ilk).addScaledVector(x.birim, k);
    for (const n of kutuGrubu.current?.children ?? []) {
      const m = n.userData['merkez'] as Vector3;
      n.position.copy(m).add(new Vector3(...patlatmaKaymasi(m.toArray(), p.merkez.toArray(), k)));
    }
  };
  useEffect(() => { yerlestir(); }, [yuklendi, oran]);

  // Montaj seçimi varken model solar, seçilen parçaların kutuları öne çıkar; seçim kalkınca malzemeler eski haline döner.
  const kutuAnahtari = kutular === null || kutular.length === 0 ? '' : JSON.stringify(kutular);
  useEffect(() => {
    const ic = icGrup.current;
    if (ic === null || kutuAnahtari === '') return undefined;
    const eski: { m: Material; saydam: boolean; opaklik: number }[] = [];
    ic.traverse((n) => {
      if (!(n instanceof Mesh)) return;
      for (const m of (Array.isArray(n.material) ? n.material : [n.material]) as Material[]) {
        eski.push({ m, saydam: m.transparent, opaklik: m.opacity });
        m.transparent = true;
        m.opacity = 0.2;
      }
    });
    const g = kutularKur(JSON.parse(kutuAnahtari) as ParcaKutusu[]);
    ic.add(g);
    kutuGrubu.current = g;
    yerlestir();
    return () => {
      kutuGrubu.current = null;
      ic.remove(g);
      for (const c of g.children) {
        if (c instanceof Mesh || c instanceof LineSegments) { (c.geometry as BufferGeometry).dispose(); (c.material as Material).dispose(); }
      }
      for (const e of eski) { e.m.transparent = e.saydam; e.m.opacity = e.opaklik; }
    };
  }, [yuklendi, kutuAnahtari]);

  return (
    <div className="tc-g3b-sahne-kap">
      <div className="tc-g3b-sahne" ref={kap} aria-label="3B model görüntüsü" role="img">
        {hata && <DurumKutusu durum="hata" mesaj={hata} />}
      </div>
      {parcaSayisi >= 2 && <PatlatmaCubugu oran={oran} oranYaz={oranYaz} />}
    </div>
  );
}
