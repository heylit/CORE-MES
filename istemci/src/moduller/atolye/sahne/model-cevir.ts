import { BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Object3D } from 'three';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { ModelKaynakBicimi } from '#paylasilan/sozlesme/atolye.ts';
import { modelSahnesi } from './model.ts';
import type { StepCevabi, StepIstegi } from './step-isci.ts';
import StepIsci from './step-isci.ts?worker&inline';
import wasmAdresi from 'occt-import-js/dist/occt-import-js.wasm?url';

// Yükleme öncesi dönüşüm (STEP, STL, GLTF -> GLB). Dosya kullanıcının cihazında çevrilir; sunucuya yalnız GLB gider,
// dışarıya istek yoktur (çevirici paketin kendi wasm'ı). Yalnız model kütüphanesi açılınca iner.

export interface Donusum {
  glb: Uint8Array;
  ucgen: number;
}

// STEP üçgenleme ayrıntısı: modelin kutu boyuna oran.
export const STEP_AYRINTISI = { ince: 0.0005, orta: 0.001, kaba: 0.003 } as const;
export type StepAyrintisi = keyof typeof STEP_AYRINTISI;

const VARSAYILAN_RENK = new Color(0.62, 0.65, 0.68);

function ucgenSay(kok: Object3D): number {
  let n = 0;
  kok.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const g = o.geometry as BufferGeometry;
    n += Math.floor((g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3);
  });
  return n;
}

async function glbYaz(kok: Object3D): Promise<Uint8Array> {
  const sonuc = await new GLTFExporter().parseAsync(kok, { binary: true });
  if (!(sonuc instanceof ArrayBuffer)) throw new Error('GLB üretilemedi.');
  return new Uint8Array(sonuc);
}

function stepCevir(veri: ArrayBuffer, ayrinti: StepAyrintisi): Promise<Group> {
  return new Promise((coz, reddet) => {
    const isci = new StepIsci();
    isci.onmessage = (o: MessageEvent<StepCevabi>) => {
      isci.terminate();
      const c = o.data;
      if ('hata' in c) { reddet(new Error(c.hata)); return; }
      const kok = new Group();
      for (const a of c.aglar) {
        const g = new BufferGeometry();
        g.setAttribute('position', new BufferAttribute(a.konum, 3));
        if (a.normal) g.setAttribute('normal', new BufferAttribute(a.normal, 3));
        g.setIndex(new BufferAttribute(a.dizin, 1));
        if (!a.normal) g.computeVertexNormals();
        const renk = a.renk ? new Color(a.renk[0], a.renk[1], a.renk[2]) : VARSAYILAN_RENK;
        const m = new Mesh(g, new MeshStandardMaterial({ color: renk, roughness: 0.5, metalness: 0.2 }));
        m.name = a.ad;
        kok.add(m);
      }
      coz(kok);
    };
    isci.onerror = (o) => { isci.terminate(); reddet(new Error(o.message || 'STEP çevirici açılamadı.')); };
    const istek: StepIstegi = { wasm: new URL(wasmAdresi, document.baseURI).href, veri, ayrinti: STEP_AYRINTISI[ayrinti] };
    isci.postMessage(istek, [veri]);
  });
}

// Yüklenecek dosyayı GLB'ye çevirir. GLB olduğu gibi kalır (yalnız okunabildiği sınanır).
export async function dosyaCevir(dosya: Blob, bicim: ModelKaynakBicimi, ayrinti: StepAyrintisi = 'orta'): Promise<Donusum> {
  const veri = await dosya.arrayBuffer();
  if (bicim === 'glb') {
    const glb = new Uint8Array(veri);
    return { glb, ucgen: ucgenSay(await modelSahnesi(glb)) };
  }
  let kok: Object3D;
  if (bicim === 'step') {
    kok = await stepCevir(veri, ayrinti);
  } else if (bicim === 'stl') {
    const g = new STLLoader().parse(veri);
    if (!g.attributes.normal) g.computeVertexNormals();
    kok = new Mesh(g, new MeshStandardMaterial({ color: VARSAYILAN_RENK, roughness: 0.5, metalness: 0.2 }));
  } else {
    const metin = new TextDecoder().decode(veri);
    try {
      kok = (await new GLTFLoader().parseAsync(metin, '')).scene;
    } catch {
      throw new Error('GLTF okunamadı. Harici .bin ya da doku dosyası olan GLTF yerine tek dosya GLB yükleyin.');
    }
  }
  const glb = await glbYaz(kok);
  return { glb, ucgen: ucgenSay(kok) };
}

