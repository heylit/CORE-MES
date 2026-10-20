import { useEffect, useRef, useState } from 'react';
import {
  ACESFilmicToneMapping, Box3, DirectionalLight, Group, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, PlaneGeometry, Scene,
  SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import type { BufferGeometry, Material, Object3D } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DurumKutusu } from '../../ortak/arayuz/index.ts';
import { sayiMetni } from './kurallar.ts';
import { modelSahnesi, modelYerlestir } from './sahne/model.ts';
import type { ModelYerlesimi } from './sahne/model.ts';
import { paletOku } from './sahne/renkler.ts';

// Modelin önizlemesi: birim, yukarı eksen ve dönüş uygulanmış halde, gerçek ölçüsüyle (sığdırma burada uygulanmaz).

interface Ozellikler {
  glb: Uint8Array | null;
  ayar: ModelYerlesimi;
}

interface Kurulum {
  cizer: WebGLRenderer;
  sahne: Scene;
  kamera: PerspectiveCamera;
  kontrol: OrbitControls;
  kok: Group;
  kare: number;
}

function birak(o: Object3D): void {
  o.traverse((c) => {
    if (!(c instanceof Mesh)) return;
    (c.geometry as BufferGeometry).dispose();
    for (const m of ([] as Material[]).concat(c.material as Material | Material[])) m.dispose();
  });
}

export function ModelOnizleme({ glb, ayar }: Ozellikler) {
  const { birim, yukari, donus } = ayar;
  const kap = useRef<HTMLDivElement>(null);
  const kurulum = useRef<Kurulum | null>(null);
  const [ham, hamYaz] = useState<Object3D | null>(null);
  const [boyut, boyutYaz] = useState<Vector3 | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);

  useEffect(() => {
    const el = kap.current;
    if (!el || typeof WebGLRenderingContext === 'undefined') return undefined;
    let cizer: WebGLRenderer;
    try {
      cizer = new WebGLRenderer({ antialias: true });
    } catch {
      hataYaz('Bu cihazda üç boyutlu önizleme açılamadı.');
      return undefined;
    }
    const p = paletOku();
    cizer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    cizer.outputColorSpace = SRGBColorSpace;
    cizer.toneMapping = ACESFilmicToneMapping;
    cizer.toneMappingExposure = 0.9;
    cizer.shadowMap.enabled = true;
    cizer.domElement.classList.add('tc-atolye-onizleme-tuval');
    el.appendChild(cizer.domElement);
    const sahne = new Scene();
    sahne.background = p.arka.clone();
    sahne.add(new HemisphereLight(p.gok, p.yer, 0.5 * Math.PI));
    const gunes = new DirectionalLight(p.isik, 2.2 * Math.PI);
    gunes.position.set(-4, 8, 6);
    gunes.castShadow = true;
    gunes.shadow.mapSize.set(1024, 1024);
    sahne.add(gunes);
    const zemin = new Mesh(new PlaneGeometry(60, 60), new MeshStandardMaterial({ color: p.zemin.clone(), roughness: 0.9 }));
    zemin.rotation.x = -Math.PI / 2;
    zemin.receiveShadow = true;
    sahne.add(zemin);
    const kok = new Group();
    sahne.add(kok);
    const kamera = new PerspectiveCamera(35, 1, 0.05, 500);
    kamera.position.set(4, 3, 5);
    const kontrol = new OrbitControls(kamera, cizer.domElement);
    kontrol.enableDamping = true;
    kontrol.maxPolarAngle = Math.PI * 0.49;
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
    const k: Kurulum = { cizer, sahne, kamera, kontrol, kok, kare: 0 };
    const dongu = () => {
      k.kare = requestAnimationFrame(dongu);
      kontrol.update();
      cizer.render(sahne, kamera);
    };
    dongu();
    kurulum.current = k;
    return () => {
      cancelAnimationFrame(k.kare);
      gozcu?.disconnect();
      kontrol.dispose();
      birak(sahne);
      cizer.forceContextLoss();
      cizer.dispose();
      cizer.domElement.remove();
      kurulum.current = null;
    };
  }, []);

  useEffect(() => {
    hamYaz(null);
    boyutYaz(null);
    if (!glb) return undefined;
    let iptal = false;
    modelSahnesi(glb).then((s) => { if (!iptal) hamYaz(s); }, () => { if (!iptal) hataYaz('Model okunamadı.'); });
    return () => { iptal = true; };
  }, [glb]);

  useEffect(() => {
    const k = kurulum.current;
    if (!k || !ham) return;
    k.kok.clear();
    const { kok, boyut: o } = modelYerlestir(ham, { birim, yukari, donus, sigdir: false }, null);
    k.kok.add(kok);
    boyutYaz(o);
    // Kamera modeli çerçeveler; güneşin gölge kutusu modeli kaplar.
    const kutu = new Box3().setFromObject(kok);
    const merkez = kutu.getCenter(new Vector3());
    const r = Math.max(0.02, kutu.getSize(new Vector3()).length() / 2);
    k.kontrol.target.copy(merkez);
    k.kamera.position.copy(merkez).add(new Vector3(r * 1.6, r * 1.1, r * 2));
    k.kamera.near = r / 100;
    k.kamera.far = r * 50;
    k.kamera.updateProjectionMatrix();
    const g = k.sahne.children.find((c): c is DirectionalLight => c instanceof DirectionalLight);
    if (g) Object.assign(g.shadow.camera, { left: -r * 1.5, right: r * 1.5, top: r * 1.5, bottom: -r * 1.5, near: 0.1, far: r * 10 + 20 });
    g?.position.copy(merkez).add(new Vector3(-r * 2, r * 4, r * 3));
    g?.shadow.camera.updateProjectionMatrix();
  }, [ham, birim, yukari, donus]);

  return (
    <div className="tc-atolye-onizleme">
      <div ref={kap} className="tc-atolye-onizleme-kap" role="img" aria-label="Model önizlemesi" />
      {hata && <DurumKutusu durum="hata" mesaj={hata} />}
      {glb && !ham && !hata && <p className="tc-atolye-ipucu">Model hazırlanıyor…</p>}
      {boyut && (
        <p className="tc-atolye-ipucu">
          Gerçek ölçü (G × Y × D): <b className="mono">{sayiMetni(boyut.x)} × {sayiMetni(boyut.y)} × {sayiMetni(boyut.z)} m</b>
        </p>
      )}
    </div>
  );
}
