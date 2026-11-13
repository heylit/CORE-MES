import { useEffect, useRef, useState } from 'react';
import {
  Box3, Color, DirectionalLight, HemisphereLight, LinearSRGBColorSpace, Mesh, MeshStandardMaterial, PerspectiveCamera, Raycaster, Scene, SRGBColorSpace,
  Vector2, Vector3, WebGLRenderer,
} from 'three';
import type { Object3D } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type { SahneAdimi } from '#paylasilan/sozlesme/rota.ts';
import { DurumKutusu } from '../../../../ortak/arayuz/index.ts';
import { birak, modelOku, type ModelBicimi } from '../model.ts';
import { donguSuresi, parcaHali, type ParcaKutusu } from './oynatma.ts';
import './montaj.css';

// Montaj talimatı sahnesinin oynatıcısı (3209 a): stüdyo (recete-rota) ve terminal (arkon) aynı bileşeni kullanır. Parça, modeldeki ağ sırasıdır (CAD koordinatı, mm;
// montaj ağları dünya koordinatındadır, bu yüzden kayma ağın konumuna doğrudan eklenir). Ayrı pakette iner (React.lazy).

export interface Kamera { yatay: number; dikey: number; uzaklik: number }
export interface SahneDenetimi { kameraOku: () => Kamera | null; tuval: HTMLCanvasElement }

function renk(ad: string): Color {
  const deger = getComputedStyle(document.documentElement).getPropertyValue(ad).trim();
  return new Color().setStyle(deger === '' ? 'gray' : deger, LinearSRGBColorSpace);
}

interface Parca { ag: Mesh; taban: Vector3; malzeme: MeshStandardMaterial }

function parcalarKur(ic: Object3D): Parca[] {
  const p: Parca[] = [];
  ic.traverse((c) => {
    if (!(c instanceof Mesh)) return;
    // Her parçanın kendi malzemesi olur: soluk ve seçili gösterim yalnız o parçayı değiştirir.
    const m = c.material instanceof MeshStandardMaterial ? c.material.clone() : new MeshStandardMaterial({ color: renk('--sahne3b-celik') });
    c.material = m;
    p.push({ ag: c, taban: c.position.clone(), malzeme: m });
  });
  return p;
}

const kutusu = (ag: Mesh): ParcaKutusu => {
  ag.geometry.computeBoundingBox();
  const b = ag.geometry.boundingBox ?? new Box3();
  return { en: [b.min.x, b.min.y, b.min.z], ust: [b.max.x, b.max.y, b.max.z] };
};

const SURUKLEME_PX = 4;

export default function Sahne3B({ veri, bicim, adimlar, aktifSira, oynuyor, hayalet, secili = [], parcaTikla, kutularAlici, denetimAlici, baslangic = 0, etiket }: {
  veri: Uint8Array; bicim: ModelBicimi; adimlar: readonly SahneAdimi[]; aktifSira: number; oynuyor: boolean; hayalet: boolean;
  secili?: readonly number[]; parcaTikla?: ((parca: number) => void) | undefined; kutularAlici?: ((k: ParcaKutusu[]) => void) | undefined;
  denetimAlici?: ((d: SahneDenetimi | null) => void) | undefined; baslangic?: number; etiket: string;
}) {
  const kap = useRef<HTMLDivElement>(null);
  const [hata, hataYaz] = useState<string | null>(null);
  const [hazir, hazirYaz] = useState(false);
  // Sahne bir kez kurulur; oynatma bilgisi her karede buradan okunur.
  const durum = useRef({ adimlar, aktifSira, oynuyor, hayalet, secili, baslangic, t0: performance.now(), donmus: 0 });
  const tiklaRef = useRef(parcaTikla);
  tiklaRef.current = parcaTikla;
  const kutularRef = useRef(kutularAlici);
  kutularRef.current = kutularAlici;
  const denetimRef = useRef(denetimAlici);
  denetimRef.current = denetimAlici;
  const bakis = useRef<{ kamera: PerspectiveCamera; kontrol: OrbitControls; merkez: Vector3; r: number } | null>(null);

  useEffect(() => {
    const d = durum.current;
    const adimDegisti = d.aktifSira !== aktifSira || d.adimlar.find((a) => a.sira === aktifSira) !== adimlar.find((a) => a.sira === aktifSira);
    const simdi = performance.now();
    if (d.oynuyor && !oynuyor) d.donmus = (simdi - d.t0) / 1000;
    if (!d.oynuyor && oynuyor) d.t0 = simdi - d.donmus * 1000;
    if (d.aktifSira !== aktifSira || d.baslangic !== baslangic) { d.t0 = simdi; d.donmus = 0; }
    Object.assign(d, { adimlar, aktifSira, oynuyor, hayalet, secili, baslangic });
    const b = bakis.current;
    const k = adimlar.find((a) => a.sira === aktifSira)?.hareket.kamera ?? null;
    if (adimDegisti && b !== null && k !== null) {
      const c = Math.cos(k.dikey);
      b.kamera.position.copy(b.merkez).add(new Vector3(c * Math.sin(k.yatay), Math.sin(k.dikey), c * Math.cos(k.yatay)).multiplyScalar(k.uzaklik));
      b.kontrol.target.copy(b.merkez);
      b.kontrol.update();
    }
  }, [adimlar, aktifSira, oynuyor, hayalet, secili, baslangic]);

  useEffect(() => {
    const el = kap.current;
    if (!el || typeof WebGLRenderingContext === 'undefined') return undefined;
    let cizer: WebGLRenderer;
    try {
      // Video kaydı tuvalin akışını okur; tampon korunmazsa kayıt boş kare alabilir.
      cizer = new WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    } catch {
      hataYaz('Bu cihazda üç boyutlu görüntü açılamadı.');
      return undefined;
    }
    cizer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    cizer.outputColorSpace = SRGBColorSpace;
    cizer.domElement.classList.add('tc-mt-tuval');
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
    const vurgu = renk('--done');
    let model: Object3D | null = null;
    let parcalar: Parca[] = [];
    let iptal = false;
    modelOku(veri, bicim, renk('--sahne3b-celik')).then((m) => {
      if (iptal) { birak(m); return; }
      model = m;
      parcalar = parcalarKur(m.children[0] ?? m);
      sahne.add(m);
      const kutu = new Box3().setFromObject(m);
      const merkez = kutu.getCenter(new Vector3());
      const r = Math.max(1, kutu.getSize(new Vector3()).length() / 2);
      kontrol.target.copy(merkez);
      // Modeli saran küre dikeyde ve yatayda (dar ekranda yatay açı küçülür) kadraja payla sığar.
      const dikeyYari = (kamera.fov * Math.PI) / 360;
      const yari = Math.min(dikeyYari, Math.atan(Math.tan(dikeyYari) * kamera.aspect));
      kamera.position.copy(merkez).add(new Vector3(1.4, 1.0, 1.8).normalize().multiplyScalar((r / Math.sin(yari)) * 1.1));
      kamera.near = r / 100;
      kamera.far = r * 100;
      kamera.updateProjectionMatrix();
      bakis.current = { kamera, kontrol, merkez, r };
      kutularRef.current?.(parcalar.map((p) => kutusu(p.ag)));
      denetimRef.current?.({
        tuval: cizer.domElement,
        kameraOku: () => {
          const f = kamera.position.clone().sub(kontrol.target);
          const u = f.length();
          if (u === 0) return null;
          return { yatay: Math.atan2(f.x, f.z), dikey: Math.asin(Math.max(-1, Math.min(1, f.y / u))), uzaklik: u };
        },
      });
      hazirYaz(true);
    }, (e: unknown) => { if (!iptal) hataYaz(e instanceof Error ? e.message : 'Model okunamadı.'); });
    let kare = 0;
    const dongu = () => {
      kare = requestAnimationFrame(dongu);
      const d = durum.current;
      const adim = d.adimlar.find((a) => a.sira === d.aktifSira);
      const gecen = d.oynuyor ? (performance.now() - d.t0) / 1000 : d.donmus;
      const t = adim === undefined ? 0 : gecen % donguSuresi(adim.hareket);
      parcalar.forEach((p, i) => {
        const h = parcaHali(d.adimlar, d.aktifSira, i, t, d.hayalet);
        p.ag.visible = h.gorunur;
        p.ag.position.set(p.taban.x + h.kayma[0], p.taban.y + h.kayma[1], p.taban.z + h.kayma[2]);
        p.malzeme.transparent = h.hayalet;
        p.malzeme.opacity = h.hayalet ? 0.18 : 1;
        p.malzeme.depthWrite = !h.hayalet;
        p.malzeme.emissive.copy(d.secili.includes(i) ? vurgu : new Color(0, 0, 0));
        p.malzeme.emissiveIntensity = d.secili.includes(i) ? 0.35 : 0;
      });
      kontrol.update();
      isik.position.copy(kamera.position);
      cizer.render(sahne, kamera);
    };
    dongu();
    let basilan: { x: number; y: number } | null = null;
    const isinci = new Raycaster();
    const bas = (e: PointerEvent) => { basilan = { x: e.clientX, y: e.clientY }; };
    const birakildi = (e: PointerEvent) => {
      const b = basilan;
      basilan = null;
      const tikla = tiklaRef.current;
      if (b === null || tikla === undefined || Math.hypot(e.clientX - b.x, e.clientY - b.y) > SURUKLEME_PX) return;
      const r = cizer.domElement.getBoundingClientRect();
      isinci.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), kamera);
      const gorunen = parcalar.filter((p) => p.ag.visible).map((p) => p.ag);
      const vurus = isinci.intersectObjects(gorunen, false)[0];
      const i = parcalar.findIndex((p) => p.ag === vurus?.object);
      if (i >= 0) tikla(i);
    };
    cizer.domElement.addEventListener('pointerdown', bas);
    cizer.domElement.addEventListener('pointerup', birakildi);
    return () => {
      iptal = true;
      bakis.current = null;
      denetimRef.current?.(null);
      cizer.domElement.removeEventListener('pointerdown', bas);
      cizer.domElement.removeEventListener('pointerup', birakildi);
      cancelAnimationFrame(kare);
      gozcu?.disconnect();
      kontrol.dispose();
      for (const p of parcalar) p.malzeme.dispose();
      if (model) birak(model);
      cizer.forceContextLoss();
      cizer.dispose();
      cizer.domElement.remove();
    };
  }, [veri, bicim]);

  return (
    <div className="tc-mt-sahne" ref={kap} role="img" aria-label={etiket}>
      {hata !== null && <DurumKutusu durum="hata" mesaj={hata} />}
      {hata === null && !hazir && <DurumKutusu durum="yukleniyor" mesaj="Model açılıyor" />}
    </div>
  );
}
