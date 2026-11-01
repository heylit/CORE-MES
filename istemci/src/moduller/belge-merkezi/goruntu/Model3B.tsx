import { useEffect, useRef, useState } from 'react';
import {
  ACESFilmicToneMapping, Box3, DirectionalLight, Group, HemisphereLight, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer,
} from 'three';
import type { Object3D } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Dugme, DurumKutusu } from '../../../ortak/arayuz/index.ts';
import { birak, modelOku, type ModelBicimi } from './model.ts';
import { renk } from './sahne-renk.ts';

interface Kurulum {
  cizer: WebGLRenderer;
  kamera: PerspectiveCamera;
  kontrol: OrbitControls;
  kok: Group;
  isik: DirectionalLight;
  kare: number;
}

const olcuMetni = (mm: number): string => mm.toLocaleString('tr-TR', { maximumFractionDigits: 1 });

export function Model3B({ veri, bicim }: { veri: Uint8Array; bicim: ModelBicimi }) {
  const kap = useRef<HTMLDivElement>(null);
  const kurulum = useRef<Kurulum | null>(null);
  const [model, modelYaz] = useState<Object3D | null>(null);
  const [olcu, olcuYaz] = useState<Vector3 | null>(null);
  const [hata, hataYaz] = useState<string | null>(null);

  useEffect(() => {
    const el = kap.current;
    if (!el || typeof WebGLRenderingContext === 'undefined') return undefined;
    let cizer: WebGLRenderer;
    try {
      cizer = new WebGLRenderer({ antialias: true });
    } catch {
      hataYaz('Bu cihazda üç boyutlu görüntü açılamadı; dosyayı indirip CAD programında açın.');
      return undefined;
    }
    const stil = getComputedStyle(document.documentElement);
    cizer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    cizer.outputColorSpace = SRGBColorSpace;
    cizer.toneMapping = ACESFilmicToneMapping;
    cizer.toneMappingExposure = 0.9;
    cizer.domElement.classList.add('tc-cz-tuval');
    el.appendChild(cizer.domElement);
    const sahne = new Scene();
    sahne.background = renk(stil, '--sahne-arka', false);
    sahne.add(new HemisphereLight(renk(stil, '--sahne3b-gok'), renk(stil, '--sahne3b-yer'), 0.6 * Math.PI));
    const isik = new DirectionalLight(renk(stil, '--sahne3b-isik'), 2 * Math.PI);
    sahne.add(isik);
    const kok = new Group();
    sahne.add(kok);
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
    const k: Kurulum = { cizer, kamera, kontrol, kok, isik, kare: 0 };
    const dongu = () => {
      k.kare = requestAnimationFrame(dongu);
      kontrol.update();
      // Işık kamerayla döner: modelin her yüzü aydınlık görünür.
      isik.position.copy(kamera.position);
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
    modelYaz(null);
    hataYaz(null);
    let iptal = false;
    const varsayilan = renk(getComputedStyle(document.documentElement), '--sahne3b-celik');
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
    // Modeli saran küre dikey ve yatay görüş açısından dar olanına sığar (telefonda yatay daha dardır); payıyla.
    // Bakış yönü önden, sağdan ve yukarıdan.
    const dikey = (k.kamera.fov * Math.PI) / 360;
    const yatay = Math.atan(Math.tan(dikey) * k.kamera.aspect);
    const uzaklik = (r / Math.sin(Math.min(dikey, yatay))) * 1.15;
    k.kamera.position.copy(merkez).add(new Vector3(1.4, 1.0, 1.8).normalize().multiplyScalar(uzaklik));
    k.kamera.near = r / 100;
    k.kamera.far = r * 100;
    k.kamera.updateProjectionMatrix();
  };

  useEffect(() => {
    const k = kurulum.current;
    if (!k || !model) return undefined;
    k.kok.add(model);
    olcuYaz(new Box3().setFromObject(model).getSize(new Vector3()));
    cercevele();
    return () => { k.kok.remove(model); birak(model); };
  }, [model]);

  return (
    <div className="tc-cz-model">
      <div ref={kap} className="tc-cz-sahne" role="img" aria-label="Üç boyutlu model" />
      {hata && <DurumKutusu durum="hata" mesaj={hata} />}
      {!model && !hata && <DurumKutusu durum="yukleniyor" mesaj="Model hazırlanıyor" />}
      {model && (
        <div className="tc-cz-arac">
          <Dugme simge="fit" onClick={cercevele}>Sığdır</Dugme>
          {olcu && (
            <span className="tc-cz-ipucu">
              Kutu ölçüsü: <b className="mono">{olcuMetni(olcu.x)} × {olcuMetni(olcu.z)} × {olcuMetni(olcu.y)} mm</b>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
