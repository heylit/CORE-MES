import { BufferAttribute, BufferGeometry, Color, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Material, Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import type { ModelCevabi, ModelIstegi } from './model-isci.ts';
import ModelIsci from './model-isci.ts?worker&inline';
import wasmAdresi from 'occt-import-js/dist/occt-import-js.wasm?url';

export type ModelBicimi = 'step' | 'iges' | 'stl' | 'glb' | 'gltf';

function malzeme(renk: Color): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: renk, roughness: 0.5, metalness: 0.2 });
}

function occtOku(veri: ArrayBuffer, bicim: 'step' | 'iges', varsayilan: Color): Promise<Group> {
  return new Promise((coz, reddet) => {
    const isci = new ModelIsci();
    isci.onmessage = (o: MessageEvent<ModelCevabi>) => {
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
        kok.add(new Mesh(g, malzeme(a.renk ? new Color(a.renk[0], a.renk[1], a.renk[2]) : varsayilan)));
      }
      coz(kok);
    };
    isci.onerror = (o) => { isci.terminate(); reddet(new Error(o.message || 'Model okuyucu açılamadı.')); };
    const istek: ModelIstegi = { wasm: new URL(wasmAdresi, document.baseURI).href, veri, bicim };
    isci.postMessage(istek, [veri]);
  });
}

const sifirMi = (dizi: ArrayLike<number>): boolean => {
  for (let i = 0; i < dizi.length; i++) if (dizi[i] !== 0) return false;
  return true;
};

// glTF birimi metre, Y yukarıdır (glTF 2.0 belirtimi); görüntü milimetre olduğu için bin kat büyütülür, döndürülmez.
// glTF JSON yalnız gömülü (data: adresli) tamponla açılır: dış .bin dosyası yüklenmez.
async function gltfOku(kopya: ArrayBuffer): Promise<Object3D> {
  const sahne = (await new GLTFLoader().parseAsync(kopya, '')).scene;
  const sar = new Group();
  sahne.scale.multiplyScalar(1000);
  sar.add(sahne);
  return sar;
}

// CAD birimi milimetre, Z yukarıdır; sahne Y yukarı kurulur. Ölçü değiştirilmez (görüntüde gerçek boyut okunur).
export async function modelOku(veri: Uint8Array, bicim: ModelBicimi, varsayilan: Color): Promise<Object3D> {
  const kopya = new Uint8Array(veri).buffer;
  if (bicim === 'glb' || bicim === 'gltf') return gltfOku(kopya);
  let kok: Object3D;
  if (bicim === 'stl') {
    const g = new STLLoader().parse(kopya);
    // STL'de normal çoğu zaman "facet normal 0 0 0" yazılır; okuyucu bunu sıfır normal olarak doldurur ve yüzey kararır.
    const normal = g.getAttribute('normal');
    if (!normal || sifirMi(normal.array)) g.computeVertexNormals();
    kok = new Mesh(g, malzeme(varsayilan));
  } else {
    kok = await occtOku(kopya, bicim, varsayilan);
  }
  const sar = new Group();
  kok.rotation.x = -Math.PI / 2;
  sar.add(kok);
  return sar;
}

export function birak(o: Object3D): void {
  o.traverse((c) => {
    if (!(c instanceof Mesh)) return;
    (c.geometry as BufferGeometry).dispose();
    for (const m of ([] as Material[]).concat(c.material as Material | Material[])) m.dispose();
  });
}
