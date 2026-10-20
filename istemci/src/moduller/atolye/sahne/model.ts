import { Box3, BoxGeometry, Color, Group, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import type { Material } from 'three';
import type { Object3D } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { ModelBirimi, YukariEkseni } from '#paylasilan/sozlesme/atolye.ts';
import { BIRIM_CARPANI } from '../model-dosyasi.ts';

// Gerçek makine modeli sahnede: saklanan GLB okunur, birim, yukarı eksen ve dönüş uygulanır, ayak izine yerleşir.

export interface ModelYerlesimi {
  birim: ModelBirimi;
  yukari: YukariEkseni;
  donus: number;
  sigdir: boolean;
}

export async function modelSahnesi(glb: Uint8Array): Promise<Group> {
  const kopya = new Uint8Array(glb);
  const gltf = await new GLTFLoader().parseAsync(kopya.buffer, '');
  return gltf.scene;
}

export interface YerlesmisModel {
  kok: Group;
  // Yerleşmiş modelin ölçüsü (metre): x genişlik, y yükseklik, z derinlik.
  boyut: Vector3;
}

// Birim, yukarı eksen ve dönüş uygulanır; `sigdir` ve ayak izi verildiyse model ayak izine sığacak kadar ölçeklenir.
// Sonuç merkezde ve tabanı zeminde (y = 0). Dönüş yönü yerleşimdeki gibidir (plan üstünde saat yönü).
export function modelYerlestir(sahne: Object3D, a: ModelYerlesimi, ayakIzi: { g: number; d: number } | null): YerlesmisModel {
  const birimli = new Group();
  birimli.add(sahne);
  birimli.scale.setScalar(BIRIM_CARPANI[a.birim]);
  if (a.yukari === 'z') birimli.rotation.x = -Math.PI / 2;
  const donmus = new Group();
  donmus.add(birimli);
  donmus.rotation.y = (-a.donus * Math.PI) / 180;
  donmus.updateMatrixWorld(true);
  let kutu = new Box3().setFromObject(donmus);
  if (a.sigdir && ayakIzi && !kutu.isEmpty()) {
    const o = kutu.getSize(new Vector3());
    const s = Math.min(ayakIzi.g / Math.max(o.x, 1e-6), ayakIzi.d / Math.max(o.z, 1e-6));
    donmus.scale.setScalar(s);
    donmus.updateMatrixWorld(true);
    kutu = new Box3().setFromObject(donmus);
  }
  const merkez = kutu.getCenter(new Vector3());
  donmus.position.set(-merkez.x, -kutu.min.y, -merkez.z);
  const kok = new Group();
  kok.add(donmus);
  kok.traverse((o) => {
    if (o instanceof Mesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return { kok, boyut: kutu.getSize(new Vector3()) };
}

// İşlenen parçanın büyütülmüş önizlemesi: birim, eksen ve dönüş uygulanır, en uzun kenarı `kenar` metre olur,
// merkezi kökün ortasındadır (makinenin üstünde kendi ekseninde döner). Gölge düşürmez.
export function parcaOnizlemesi(sahne: Object3D, a: Omit<ModelYerlesimi, 'sigdir'>, kenar: number): Group {
  const { kok, boyut } = modelYerlestir(sahne, { ...a, sigdir: false }, null);
  const enUzun = Math.max(boyut.x, boyut.y, boyut.z, 1e-6);
  const olcekli = new Group();
  olcekli.add(kok);
  olcekli.scale.setScalar(kenar / enUzun);
  olcekli.position.y = (-boyut.y * kenar) / enUzun / 2;
  const merkez = new Group();
  merkez.add(olcekli);
  merkez.traverse((o) => {
    if (o instanceof Mesh) {
      o.castShadow = false;
      o.receiveShadow = false;
    }
  });
  return merkez;
}

export interface DiziBolgesi { x: number; y: number; z: number; g: number; h: number; d: number }

export interface ModelDizisi {
  kok: Group;
  adet: number;
  // Uzaktan görünen vekil: her kopya modelin sınır kutusu (12 üçgen), tek çizim çağrısı; gölgeyi o düşürür.
  vekil: InstancedMesh;
  // Yakından görünen gerçek model kopyaları (gölge düşürmez); başta gizli, motor kamera yakınken açar.
  ayrinti: Group;
  // Ayrıntının çizdiği üçgen sayısı (bütün kopyalar).
  ucgen: number;
  yatis: RaftaYatis;
}

// Vekil kutu ve malzemesi paylaşılır (renk modelin ilk malzemesinden).
const VEKIL_KUTU = new BoxGeometry(1, 1, 1);
const vekilMalzemeleri = new Map<number, MeshStandardMaterial>();
function vekilMalzemesi(renk: Color): MeshStandardMaterial {
  const k = renk.getHex();
  let m = vekilMalzemeleri.get(k);
  if (!m) { m = new MeshStandardMaterial({ color: renk, roughness: 0.6, metalness: 0.2 }); vekilMalzemeleri.set(k, m); }
  return m;
}
// Paylaşılan vekil kaynakları sahne temizlenirken atılmaz.
export const vekilMi = (x: unknown): boolean => x === VEKIL_KUTU || [...vekilMalzemeleri.values()].includes(x as MeshStandardMaterial);

// Gözdeki parçalar: model gerçek ölçüsüyle bölgeye ızgara gibi dizilir (bölgeye sığmıyorsa küçültülür), adet
// doluluk ile bölgenin alabileceği adetten çıkar. Her ağ tek InstancedMesh: yüz kopya tek çizim çağrısıdır.
// Gerçek parça modeli on binlerce üçgen olabilir; 48 kopya ve yüzlerce göz milyonlarca üçgen eder (ölçüldü:
// önizlemede 20 milyon). Bu yüzden her dizi bir vekil (kutu) ve bir ayrıntı taşır; hangisinin görüneceğini motor seçer.
// Kayan nokta payı: tam sığan sıra (0,5 / 0,1) dörde düşmesin.
const sigan = (alan: number, adim: number) => Math.max(1, Math.floor(alan / Math.max(adim, 1e-6) + 1e-6));
const ARA = 0.01;

// Eksen sırası: dünya ekseni i'de modelin hangi ekseni (0 x, 1 y, 2 z) durur. İlki modelin kendi duruşu, sonra
// yalnız yatayda dönen, sonra yan yatan duruşlar (eşitlikte önce gelen seçilir).
const DURUSLAR: readonly (readonly [number, number, number])[] = [[0, 1, 2], [2, 1, 0], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1]];

export interface RaftaYatis {
  eksen: readonly [number, number, number];
  // Ölçek: 1 gerçek ölçü; 1'den küçükse parça göze hiçbir duruşta sığmadı ve küçültülerek gösteriliyor.
  k: number;
  sigdi: boolean;
}

// Göze yatış: model kendi duruşunda gerçek ölçüsüyle sığıyorsa öyle kalır (modelin ayarı korunur). Sığmıyorsa altı
// eksen duruşundan gerçek ölçüyle sığanlar arasında en alçak olanı (en geniş yüzü altta, rafta durduğu gibi), eşitse
// en çok kopya alanı seçilir. Hiçbiri sığmıyorsa en az küçülen duruş.
export function raftaYatis(boyut: { x: number; y: number; z: number }, b: Pick<DiziBolgesi, 'g' | 'h' | 'd'>): RaftaYatis {
  const olcu = [boyut.x, boyut.y, boyut.z];
  const adaylar = DURUSLAR.map((eksen) => {
    const [dx, dy, dz] = eksen.map((e) => Math.max(olcu[e] ?? 0, 1e-6)) as [number, number, number];
    const k = Math.min(1, b.g / dx, b.h / dy, b.d / dz);
    const kapasite = sigan(b.g + ARA, dx * k + ARA) * sigan(b.h, dy * k) * sigan(b.d + ARA, dz * k + ARA);
    return { eksen, k, boy: dy * k, kapasite };
  });
  const ilk = adaylar[0];
  if (ilk && ilk.k >= 1 - 1e-9) return { eksen: ilk.eksen, k: 1, sigdi: true };
  const sigan_ = adaylar.filter((x) => x.k >= 1 - 1e-9);
  const sec = sigan_.length > 0
    ? sigan_.reduce((en, x) => (x.boy < en.boy - 1e-9 || (Math.abs(x.boy - en.boy) <= 1e-9 && x.kapasite > en.kapasite) ? x : en))
    : adaylar.reduce((en, x) => (x.k > en.k + 1e-9 || (Math.abs(x.k - en.k) <= 1e-9 && x.boy < en.boy - 1e-9) ? x : en));
  return { eksen: sec.eksen, k: Math.min(1, sec.k), sigdi: sigan_.length > 0 };
}

// Eksen sırasından dönme matrisi (tek permütasyonda bir eksen ters çevrilir: yansıma olmaz).
function durusMatrisi(e: readonly [number, number, number]): Matrix4 {
  const satir = (i: number) => [0, 1, 2].map((j) => (e[i] === j ? 1 : 0));
  const [a, b, c] = [satir(0), satir(1), satir(2)] as [number[], number[], number[]];
  const det = (a[0] ?? 0) * ((b[1] ?? 0) * (c[2] ?? 0) - (b[2] ?? 0) * (c[1] ?? 0)) - (a[1] ?? 0) * ((b[0] ?? 0) * (c[2] ?? 0) - (b[2] ?? 0) * (c[0] ?? 0)) + (a[2] ?? 0) * ((b[0] ?? 0) * (c[1] ?? 0) - (b[1] ?? 0) * (c[0] ?? 0));
  const z = det < 0 ? c.map((v) => -v) : c;
  return new Matrix4().set(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0, 0, b[0] ?? 0, b[1] ?? 0, b[2] ?? 0, 0, z[0] ?? 0, z[1] ?? 0, z[2] ?? 0, 0, 0, 0, 0, 1);
}

export function modelDizisi(sahne: Object3D, a: Omit<ModelYerlesimi, 'sigdir'>, b: DiziBolgesi, doluluk: number, azami = 48): ModelDizisi {
  const { kok, boyut } = modelYerlestir(sahne, { ...a, sigdir: false }, null);
  const yatis = raftaYatis(boyut, b);
  const { k } = yatis;
  const olcu = [boyut.x, boyut.y, boyut.z];
  const [dx, dy, dz] = yatis.eksen.map((e) => olcu[e] ?? 0) as [number, number, number];
  const sx = dx * k + ARA;
  const sy = dy * k;
  const sz = dz * k + ARA;
  const nx = sigan(b.g + ARA, sx);
  const nz = sigan(b.d + ARA, sz);
  const ny = sigan(b.h, sy);
  const adet = Math.max(1, Math.min(azami, Math.round(Math.min(1, doluluk) * nx * ny * nz)));
  // Kopya: model ortası (0, y/2, 0) başlangıca, sonra duruş, ölçek ve gözdeki yeri (taban göz tabanında).
  const ortala = durusMatrisi(yatis.eksen).multiply(new Matrix4().makeTranslation(0, -boyut.y / 2, 0));
  const konumlar: Matrix4[] = [];
  for (let i = 0; i < adet; i++) {
    const ix = i % nx;
    const iz = Math.floor(i / nx) % nz;
    const iy = Math.floor(i / (nx * nz));
    const m = new Matrix4().makeTranslation(
      b.x - b.g / 2 + ((ix + 0.5) * b.g) / nx,
      b.y + iy * sy + sy / 2,
      b.z - b.d / 2 + ((iz + 0.5) * b.d) / nz,
    ).multiply(new Matrix4().makeScale(k, k, k)).multiply(ortala);
    konumlar.push(m);
  }
  kok.updateMatrixWorld(true);
  const ayrinti = new Group();
  let ucgen = 0;
  let renk: Color | null = null;
  kok.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const im = new InstancedMesh(o.geometry, o.material, adet);
    konumlar.forEach((m, i) => im.setMatrixAt(i, m.clone().multiply(o.matrixWorld)));
    im.instanceMatrix.needsUpdate = true;
    im.computeBoundingSphere();
    im.castShadow = false;
    im.receiveShadow = true;
    ayrinti.add(im);
    const g = o.geometry;
    ucgen += ((g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3) * adet;
    const ilk = ([] as Material[]).concat(o.material as Material | Material[])[0] as (Material & { color?: Color }) | undefined;
    if (!renk && ilk?.color) renk = ilk.color.clone();
  });
  ayrinti.visible = false;
  // Model tabanı zeminde ve yatayda ortada (modelYerlestir): kutu (0, y/2, 0) merkezli, model ölçüsünde.
  const kutuMatrisi = new Matrix4().makeTranslation(0, boyut.y / 2, 0).multiply(new Matrix4().makeScale(Math.max(boyut.x, 1e-3), Math.max(boyut.y, 1e-3), Math.max(boyut.z, 1e-3)));
  const vekil = new InstancedMesh(VEKIL_KUTU, vekilMalzemesi(renk ?? new Color(0x9aa3ad)), adet);
  konumlar.forEach((m, i) => vekil.setMatrixAt(i, m.clone().multiply(kutuMatrisi)));
  vekil.instanceMatrix.needsUpdate = true;
  vekil.computeBoundingSphere();
  vekil.castShadow = true;
  vekil.receiveShadow = true;
  const dizi = new Group();
  dizi.add(vekil, ayrinti);
  return { kok: dizi, adet, vekil, ayrinti, ucgen, yatis };
}
