import {
  ACESFilmicToneMapping, Box3, DirectionalLight, HemisphereLight, MathUtils, PerspectiveCamera, SRGBColorSpace, Scene, Vector3, WebGLRenderer,
} from 'three';
import type { Object3D } from 'three';
import {
  AZAMI_MODEL_BAYT, BAKIS_YUKSEKLIGI, KARE_SAYISI, OnizlemeAtlandi, kareAcisi, sinirdaKareler, webglVarMi,
} from '../onizleme-kurallari.ts';
import { birak, modelOku } from './model.ts';
import type { ModelBicimi } from './model.ts';
import { renk } from './sahne-renk.ts';

export interface OnizlemeKaresi {
  icerik: Uint8Array;
  boyut: number;
}

const GORUS_ACISI = 35;

function pngYap(tuval: HTMLCanvasElement): Promise<Uint8Array> {
  return new Promise((coz, reddet) => {
    tuval.toBlob((b) => {
      if (b === null) { reddet(new OnizlemeAtlandi('Önizleme görüntüsü üretilemedi.')); return; }
      b.arrayBuffer().then((a) => { coz(new Uint8Array(a)); }, reddet);
    }, 'image/png');
  });
}

// Ekran dışı çizim: şeffaf arka plan, model merkezde; kamera modelin çevresinde Y ekseninde eşit açılarla döner ve hafif yukarıdan bakar.
async function kareleriCiz(model: Object3D, cozunurluk: number): Promise<OnizlemeKaresi[]> {
  let cizer: WebGLRenderer;
  try {
    cizer = new WebGLRenderer({ alpha: true, antialias: true, preserveDrawingBuffer: true });
  } catch {
    throw new OnizlemeAtlandi('Bu cihazda üç boyutlu çizim açılamadı; önizleme üretilmedi.');
  }
  try {
    const stil = getComputedStyle(document.documentElement);
    cizer.setPixelRatio(1);
    cizer.setSize(cozunurluk, cozunurluk, false);
    cizer.setClearAlpha(0);
    cizer.outputColorSpace = SRGBColorSpace;
    cizer.toneMapping = ACESFilmicToneMapping;
    cizer.toneMappingExposure = 0.9;
    const sahne = new Scene();
    sahne.add(new HemisphereLight(renk(stil, '--sahne3b-gok'), renk(stil, '--sahne3b-yer'), 0.6 * Math.PI));
    const isik = new DirectionalLight(renk(stil, '--sahne3b-isik'), 2 * Math.PI);
    sahne.add(isik);
    sahne.add(model);

    const kutu = new Box3().setFromObject(model);
    const merkez = kutu.getCenter(new Vector3());
    const r = Math.max(1, kutu.getSize(new Vector3()).length() / 2);
    const kamera = new PerspectiveCamera(GORUS_ACISI, 1, r / 100, r * 100);
    const uzaklik = (r / Math.sin(MathUtils.degToRad(GORUS_ACISI / 2))) * 1.1;
    const yukseklik = MathUtils.degToRad(BAKIS_YUKSEKLIGI);

    const kareler: OnizlemeKaresi[] = [];
    for (let sira = 0; sira < KARE_SAYISI; sira++) {
      const aci = kareAcisi(sira);
      const yon = new Vector3(Math.sin(aci) * Math.cos(yukseklik), Math.sin(yukseklik), Math.cos(aci) * Math.cos(yukseklik));
      kamera.position.copy(merkez).addScaledVector(yon, uzaklik);
      kamera.lookAt(merkez);
      isik.position.copy(kamera.position);
      cizer.render(sahne, kamera);
      const icerik = await pngYap(cizer.domElement);
      kareler.push({ icerik, boyut: icerik.length });
    }
    return kareler;
  } finally {
    cizer.forceContextLoss();
    cizer.dispose();
  }
}

// 3B modelden (STEP, IGES, STL, glTF) 8 PNG kare üretir. Üretilemezse `OnizlemeAtlandi` fırlar (ileti kullanıcıya gösterilir).
export async function onizlemeKareleri(veri: Uint8Array, bicim: ModelBicimi): Promise<Uint8Array[]> {
  if (!webglVarMi()) throw new OnizlemeAtlandi('Bu cihazda üç boyutlu çizim yok; önizleme üretilmedi.');
  if (veri.length > AZAMI_MODEL_BAYT) throw new OnizlemeAtlandi('Model 25 MB sınırından büyük; önizleme üretilmedi.');
  const model = await modelOku(veri, bicim, renk(getComputedStyle(document.documentElement), '--sahne3b-celik'));
  try {
    return (await sinirdaKareler((cozunurluk) => kareleriCiz(model, cozunurluk))).map((k) => k.icerik);
  } finally {
    birak(model);
  }
}
