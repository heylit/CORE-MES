import { useEffect, useRef, useState } from 'react';
import { Box3, Color, DirectionalLight, HemisphereLight, LinearSRGBColorSpace, PerspectiveCamera, Scene, SRGBColorSpace, Vector3, WebGLRenderer } from 'three';
import type { Object3D } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { DurumKutusu } from '../../ortak/arayuz/index.ts';
import { birak, modelOku, type ModelBicimi } from '../belge-merkezi/disari.ts';

// Sahne renkleri tasarım değişkenlerinden okunur; değişken yoksa (test ortamı) nötr gri.
function renk(ad: string): Color {
  const deger = getComputedStyle(document.documentElement).getPropertyValue(ad).trim();
  return new Color().setStyle(deger === '' ? 'gray' : deger, LinearSRGBColorSpace);
}

// Yalnız bakmak içindir (döndür, yakınlaştır): ölçü sunucudan gelir, burada hesaplanmaz. Ayrı pakette iner (React.lazy).
export default function Goruntu3B({ veri, bicim }: { veri: Uint8Array; bicim: ModelBicimi }) {
  const kap = useRef<HTMLDivElement>(null);
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
      cizer.forceContextLoss();
      cizer.dispose();
      cizer.domElement.remove();
    };
  }, [veri, bicim]);

  return (
    <div className="tc-g3b-sahne" ref={kap} aria-label="3B model görüntüsü" role="img">
      {hata && <DurumKutusu durum="hata" mesaj={hata} />}
    </div>
  );
}
