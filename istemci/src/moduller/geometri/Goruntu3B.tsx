import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import {
  Box3, BoxGeometry, BufferGeometry, Color, CylinderGeometry, DirectionalLight, EdgesGeometry, Group, HemisphereLight, Line, LineBasicMaterial, LineDashedMaterial, LinearSRGBColorSpace, LineSegments, Matrix4,
  Mesh, MeshBasicMaterial, MeshStandardMaterial, PerspectiveCamera, Quaternion, Raycaster, Scene, SRGBColorSpace, TorusGeometry, Vector2, Vector3, WebGLRenderer,
} from 'three';
import type { Material, Object3D } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Dugme, DurumKutusu, Simge } from '../../ortak/arayuz/index.ts';
import { birak, modelOku, type ModelBicimi } from '../belge-merkezi/disari.ts';
import { agYuzAlanlari, agYuzNormalleri, GORUNUMLER, MASKE_RENGI, patlatmaKaymasi, ucgeninYuzu, yuzSirasiUyar } from './gorunum.ts';
import type { GorunumAdi, OnizlemeKatisi, Yon3 } from './gorunum.ts';

// Sahne renkleri tasarım değişkenlerinden okunur; değişken yoksa (test ortamı) nötr gri.
function renk(ad: string): Color {
  const deger = getComputedStyle(document.documentElement).getPropertyValue(ad).trim();
  return new Color().setStyle(deger === '' ? 'gray' : deger, LinearSRGBColorSpace);
}

// Seçilen deliğin vurgusu (2044-2): girişte halka, girişten içeri eksen çizgisi. Konum ve eksen sunucudandır, model koordinatında (mm, Z yukarı).
export interface Vurgu { konum: readonly number[]; eksen: readonly number[]; capMm: number; derinlikMm: number }

function vurguKur(v: Vurgu, renkAdi = '--hazard'): Group {
  const g = new Group();
  const renkli = renk(renkAdi);
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

// Çalışmanın önizlemesi (2396): katılar (analiz kutuları, ham) kenar çizgisi ve yarı saydam dolguyla, delikler halkayla çizilir.
// Katılar modelin ağ noktalarından kurulur (merkez ağdan bulunur, gorunum.ts); noktalar model koordinatındadır.
export interface Onizleme {
  // İçerik değişince önizleme yeniden kurulsun diye; işlev kimliği her çizimde değişebilir.
  anahtar: string;
  // Düğmede ve bilgi satırında ne gösterildiği.
  etiket: string;
  katilar: (noktalar: Float32Array) => readonly OnizlemeKatisi[];
  delikler: readonly Vurgu[];
}

function katiKur(k: OnizlemeKatisi, renkli: Color, sira: number): Object3D[] {
  const [boy, en, yukseklik] = k.boyut;
  const govde = k.sekil === 'kutu'
    ? new BoxGeometry(Math.max(boy, 0.01), Math.max(en, 0.01), Math.max(yukseklik, 0.01))
    // Altıgende anahtar ağzı köşeden köşeye değil yüzden yüze ölçülür: çevre yarıçapı s / √3.
    : new CylinderGeometry(k.sekil === 'silindir' ? en / 2 : en / Math.sqrt(3), k.sekil === 'silindir' ? en / 2 : en / Math.sqrt(3), Math.max(boy, 0.01), k.sekil === 'silindir' ? 48 : 6)
      .rotateZ(-Math.PI / 2);
  const [a, b] = k.eksenler;
  const ea = new Vector3(...(a ?? [1, 0, 0])), eb = new Vector3(...(b ?? [0, 1, 0]));
  // Sunucunun eksenleri sol el düzeni olabilir; dönüş için üçüncü eksen ilk ikisinden kurulur (kutu simetrik, yön işareti fark etmez).
  const donus = new Matrix4().makeBasis(ea, eb, new Vector3().crossVectors(ea, eb).normalize());
  const dolgu = new Mesh(govde, new MeshBasicMaterial({ color: renkli, transparent: true, opacity: 0.18, depthWrite: false }));
  const kenar = new LineSegments(new EdgesGeometry(govde, 20), new LineBasicMaterial({ color: renkli, depthTest: false }));
  for (const n of [dolgu, kenar]) {
    n.quaternion.setFromRotationMatrix(donus);
    n.position.set(...k.merkez);
    n.renderOrder = 10 + sira;
  }
  return [dolgu, kenar];
}

const ONIZLEME_RENKLERI = ['--sahne3b-vurgu', '--grafik-2'] as const;

function birakGrup(g: Group): void {
  g.traverse((c) => {
    if (c instanceof Mesh || c instanceof Line || c instanceof LineSegments) {
      (c.geometry as BufferGeometry).dispose();
      for (const m of (Array.isArray(c.material) ? c.material : [c.material]) as Material[]) m.dispose();
    }
  });
}

// Ağın noktaları model (iç grup) koordinatında, patlatmasız; önizlemenin yerini bulmak için bir kez toplanır.
function agNoktalari(ic: Object3D): Float32Array {
  ic.updateWorldMatrix(true, true);
  const icTers = ic.matrixWorld.clone().invert();
  const parcalar: Float32Array[] = [];
  const v = new Vector3();
  ic.traverse((n) => {
    if (!(n instanceof Mesh)) return;
    const konum = (n.geometry as BufferGeometry).getAttribute('position');
    if (konum === undefined) return;
    const m = new Matrix4().multiplyMatrices(icTers, n.matrixWorld);
    const p = new Float32Array(konum.count * 3);
    for (let i = 0; i < konum.count; i++) { v.fromBufferAttribute(konum, i).applyMatrix4(m); p[3 * i] = v.x; p[3 * i + 1] = v.y; p[3 * i + 2] = v.z; }
    parcalar.push(p);
  });
  const toplam = new Float32Array(parcalar.reduce((t, p) => t + p.length, 0));
  let i = 0;
  for (const p of parcalar) { toplam.set(p, i); i += p.length; }
  return toplam;
}

// Görünüm çubuğu (2396): standart görünümler, sığdır, kendiliğinden dönme ve önizleme; her çalışmada aynı yerde, görüntünün altında.
function GorunumCubugu({ bak, sigdir, doner, donerYaz, onizleme, onizlemeAcik, onizlemeYaz }: {
  bak: (g: GorunumAdi) => void; sigdir: () => void; doner: boolean; donerYaz: (x: boolean) => void;
  onizleme: string | null; onizlemeAcik: boolean; onizlemeYaz: (x: boolean) => void;
}) {
  return (
    <div className="tc-g3b-gorunum" role="toolbar" aria-label="Görünüm">
      <div className="tc-g3b-gorunum-grup" role="group" aria-label="Standart görünüm">
        {(Object.keys(GORUNUMLER) as GorunumAdi[]).map((g) => (
          <Dugme key={g} title={`${GORUNUMLER[g].baslik} görünüm`} onClick={() => bak(g)}>{GORUNUMLER[g].baslik}</Dugme>
        ))}
        <Dugme simge="fit" title="Modeli görüntüye sığdır" onClick={sigdir}>Sığdır</Dugme>
      </div>
      <div className="tc-g3b-gorunum-grup">
        <Dugme simge="rotate" aria-pressed={doner} onClick={() => donerYaz(!doner)}>Döndür</Dugme>
        {onizleme !== null && (
          <Dugme simge="eye" aria-pressed={onizlemeAcik} title={`Önizleme: ${onizleme}`} onClick={() => onizlemeYaz(!onizlemeAcik)}>Önizleme</Dugme>
        )}
      </div>
    </div>
  );
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

// Yüzey işaretleri (2144): yüzler okuyucunun B-rep yüz aralıklarıyla boyanır ve tıklanınca seçilir. Görüntünün yüz sırası
// sunucununkiyle denetlenir (gorunum.ts yuzSirasiUyar); uymazsa ya da okuyucu aralık vermezse (STL, glTF) boyama ve tıklama kapalıdır.
export type YuzDurumu = 'bekliyor' | 'hazir' | 'yok' | 'uyusmuyor';
export interface YuzBoyasi {
  // Sunucunun yüz alanları, sıra 1'den.
  alanlar: readonly number[];
  // Yüz sırası -> tasarım değişkeni (yüzün rengi); listede olmayan yüz modelin rengindedir.
  renkler: ReadonlyMap<number, string>;
  secili: ReadonlySet<number>;
  // Verilince tıklanan yüz bu işleve gider (seçim açık).
  sec: ((sira: number) => void) | null;
  // Denetimin sonucu; hazırsa yüzlerin normalleri de (yüz grupları üst, alt, yan yüzü bundan ayırır), değilse null.
  durumYaz: (d: YuzDurumu, normaller: readonly (Yon3 | null)[] | null) => void;
}
interface YuzAgi { ag: Mesh; araliklar: Uint32Array; ilkSira: number }

function yuzAglari(ic: Object3D): YuzAgi[] | null {
  const aglar: YuzAgi[] = [];
  let sira = 1;
  let eksik = false;
  ic.traverse((n) => {
    if (!(n instanceof Mesh)) return;
    const a = n.userData['yuzler'];
    if (!(a instanceof Uint32Array)) { eksik = true; return; }
    aglar.push({ ag: n, araliklar: a, ilkSira: sira });
    sira += a.length / 2;
  });
  return eksik || aglar.length === 0 ? null : aglar;
}

function yuzNormalleri(aglar: readonly YuzAgi[]): (Yon3 | null)[] {
  return aglar.flatMap(({ ag, araliklar }) => {
    const g = ag.geometry as BufferGeometry;
    const dizin = g.getIndex();
    return dizin === null ? [] : agYuzNormalleri(g.getAttribute('position').array, dizin.array, araliklar);
  });
}

function yuzAlanlari(aglar: readonly YuzAgi[]): number[] {
  return aglar.flatMap(({ ag, araliklar }) => {
    const g = ag.geometry as BufferGeometry;
    const dizin = g.getIndex();
    return dizin === null ? [] : agYuzAlanlari(g.getAttribute('position').array, dizin.array, araliklar);
  });
}

// Maske taralı çizilir (prototip v2): ağda doku koordinatı olmadığı için çizgiler ekran koordinatındadır (45 derece, sabit aralık).
// Zemin görüntü arka planı, çizgi tarama rengidir; ışık ikisine de uygulanır.
function taraliMalzeme(olcek: number): MeshStandardMaterial {
  const m = new MeshStandardMaterial({ color: renk('--sahne-arka'), roughness: 0.7, metalness: 0 });
  const cizgi = renk(MASKE_RENGI);
  m.onBeforeCompile = (g) => {
    g.uniforms['uTaramaRengi'] = { value: cizgi };
    g.uniforms['uTaramaOlcek'] = { value: olcek };
    g.fragmentShader = `uniform vec3 uTaramaRengi;\nuniform float uTaramaOlcek;\n${g.fragmentShader}`.replace(
      '#include <color_fragment>',
      '#include <color_fragment>\n  float tarama = step(0.6, fract((gl_FragCoord.x + gl_FragCoord.y) / (9.0 * uTaramaOlcek)));\n  diffuseColor.rgb = mix(diffuseColor.rgb, uTaramaRengi, tarama);',
    );
  };
  m.customProgramCacheKey = () => 'tc-g3b-tarama';
  return m;
}

// Görüntüden PNG (maske resmi): çizim hemen ardından alınır; çizim tamponu korunmadığı için ayrı karede okunmaz.
export type ResimAl = () => Promise<Blob | null>;

// Yalnız bakmak içindir (döndür, yakınlaştır): ölçü sunucudan gelir, burada hesaplanmaz. Ayrı pakette iner (React.lazy).
export default function Goruntu3B({ veri, bicim, vurgu = null, kutular = null, yuzBoyasi = null, arac = null, bilgi = null, resimAlici, onizleme = null }: {
  veri: Uint8Array; bicim: ModelBicimi; vurgu?: Vurgu | null; kutular?: readonly ParcaKutusu[] | null; onizleme?: Onizleme | null;
  // Görüntünün üstünde araç çubuğu (solda fırça, sağda görünüm) ve altında bilgi satırı (2144 prototip v3).
  yuzBoyasi?: YuzBoyasi | null; arac?: ReactNode; bilgi?: string | null; resimAlici?: (al: ResimAl | null) => void;
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
  const yuzAglariRef = useRef<YuzAgi[] | null>(null);
  const [yuzDurumu, yuzDurumuYaz] = useState<YuzDurumu>('bekliyor');
  // Tıklama işleyicisi sahne kurulurken bağlanır; güncel seçim işlevini buradan okur.
  const secRef = useRef<((sira: number) => void) | null>(null);
  secRef.current = yuzDurumu === 'hazir' ? (yuzBoyasi?.sec ?? null) : null;
  const resimAliciRef = useRef(resimAlici);
  resimAliciRef.current = resimAlici;
  // Kamera ve modelin çerçevesi: görünüm düğmeleri sahne kurulduktan sonra bunlarla çalışır.
  const bakis = useRef<{ kamera: PerspectiveCamera; kontrol: OrbitControls; merkez: Vector3; r: number } | null>(null);
  const noktalar = useRef<Float32Array | null>(null);
  const [doner, donerYaz] = useState(false);
  const [onizlemeAcik, onizlemeYaz] = useState(true);

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
      noktalar.current = agNoktalari(icGrup.current);
      yuzAglariRef.current = yuzAglari(icGrup.current);
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
      bakis.current = { kamera, kontrol, merkez, r };
    }, (e: unknown) => { if (!iptal) hataYaz(e instanceof Error ? e.message : 'Model okunamadı.'); });
    let kare = 0;
    const dongu = () => {
      kare = requestAnimationFrame(dongu);
      kontrol.update();
      isik.position.copy(kamera.position);
      cizer.render(sahne, kamera);
    };
    dongu();
    // Tıklama: basılan yerden az kayan bırakma seçimdir (döndürme sürüklemesi seçmez).
    const SURUKLEME_PX = 4;
    let basilan: { x: number; y: number } | null = null;
    const isinci = new Raycaster();
    const bas = (e: PointerEvent) => { basilan = { x: e.clientX, y: e.clientY }; };
    const birakildi = (e: PointerEvent) => {
      const b = basilan;
      basilan = null;
      const sec = secRef.current, aglar = yuzAglariRef.current, ic = icGrup.current;
      if (b === null || sec === null || aglar === null || ic === null || Math.hypot(e.clientX - b.x, e.clientY - b.y) > SURUKLEME_PX) return;
      const r = cizer.domElement.getBoundingClientRect();
      isinci.setFromCamera(new Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), kamera);
      const vurus = isinci.intersectObject(ic, true).find((v) => v.object instanceof Mesh && aglar.some((a) => a.ag === v.object));
      const ag = aglar.find((a) => a.ag === vurus?.object);
      if (vurus?.faceIndex === undefined || vurus.faceIndex === null || ag === undefined) return;
      const k = ucgeninYuzu(ag.araliklar, vurus.faceIndex);
      if (k !== null) sec(ag.ilkSira + k);
    };
    cizer.domElement.addEventListener('pointerdown', bas);
    cizer.domElement.addEventListener('pointerup', birakildi);
    resimAliciRef.current?.(() => new Promise((coz) => {
      cizer.render(sahne, kamera);
      cizer.domElement.toBlob(coz, 'image/png');
    }));
    return () => {
      iptal = true;
      bakis.current = null;
      noktalar.current = null;
      resimAliciRef.current?.(null);
      cizer.domElement.removeEventListener('pointerdown', bas);
      cizer.domElement.removeEventListener('pointerup', birakildi);
      yuzAglariRef.current = null;
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

  useEffect(() => {
    const b = bakis.current;
    if (b === null) return;
    b.kontrol.autoRotate = doner;
  }, [yuklendi, doner]);
  const bak = (g: GorunumAdi | null) => {
    const b = bakis.current;
    if (b === null) return;
    const yon = g === null ? b.kamera.position.clone().sub(b.kontrol.target) : new Vector3(...GORUNUMLER[g].yon);
    if (yon.lengthSq() === 0) yon.set(1, 1, 1);
    b.kontrol.target.copy(b.merkez);
    b.kamera.position.copy(b.merkez).add(yon.normalize().multiplyScalar(b.r * 3));
    b.kontrol.update();
  };

  const onizlemeAnahtari = onizleme === null || !onizlemeAcik ? '' : onizleme.anahtar;
  const onizlemeRef = useRef(onizleme);
  onizlemeRef.current = onizleme;
  useEffect(() => {
    const ic = icGrup.current, n = noktalar.current, o = onizlemeRef.current;
    if (ic === null || n === null || o === null || onizlemeAnahtari === '') return undefined;
    const g = new Group();
    o.katilar(n).forEach((k, i) => { for (const x of katiKur(k, renk(ONIZLEME_RENKLERI[i % ONIZLEME_RENKLERI.length]!), i)) g.add(x); });
    for (const d of o.delikler) g.add(vurguKur(d, '--sahne3b-vurgu'));
    ic.add(g);
    return () => { ic.remove(g); birakGrup(g); };
  }, [yuklendi, onizlemeAnahtari]);

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

  // Yüz sırası denetimi model yüklenince ve sunucu alanları gelince bir kez yapılır.
  const alanAnahtari = yuzBoyasi === null ? '' : yuzBoyasi.alanlar.join(',');
  useEffect(() => {
    if (yuklendi === 0 || alanAnahtari === '') { yuzDurumuYaz('bekliyor'); return; }
    const aglar = yuzAglariRef.current;
    yuzDurumuYaz(aglar === null ? 'yok' : yuzSirasiUyar(yuzAlanlari(aglar), alanAnahtari.split(',').map(Number)) ? 'hazir' : 'uyusmuyor');
  }, [yuklendi, alanAnahtari]);
  const durumYaz = yuzBoyasi?.durumYaz;
  useEffect(() => {
    const aglar = yuzAglariRef.current;
    durumYaz?.(yuzDurumu, yuzDurumu === 'hazir' && aglar !== null ? yuzNormalleri(aglar) : null);
  }, [yuzDurumu, durumYaz, yuklendi]);

  // Boyama: her ağın yüzleri çizim grubu olur; grup malzemesi yüzün rengidir (seçili yüz vurgu rengi). Kalkınca özgün malzeme döner.
  const renkAnahtari = yuzBoyasi === null ? '' : JSON.stringify([...yuzBoyasi.renkler]);
  const seciliAnahtari = yuzBoyasi === null ? '' : [...yuzBoyasi.secili].join(',');
  useEffect(() => {
    const aglar = yuzAglariRef.current;
    if (yuzDurumu !== 'hazir' || aglar === null || renkAnahtari === '') return undefined;
    const renkler = new Map(JSON.parse(renkAnahtari) as [number, string][]);
    const secili = new Set(seciliAnahtari === '' ? [] : seciliAnahtari.split(',').map(Number));
    const malzemeler = new Map<string, MeshStandardMaterial>();
    const malzemesi = (ad: string): MeshStandardMaterial => {
      let m = malzemeler.get(ad);
      if (m === undefined) {
        m = ad === MASKE_RENGI ? taraliMalzeme(Math.min(window.devicePixelRatio || 1, 2)) : new MeshStandardMaterial({ color: renk(ad), roughness: 0.6, metalness: 0.1 });
        malzemeler.set(ad, m);
      }
      return m;
    };
    const eski: { ag: Mesh; malzeme: Material | Material[] }[] = [];
    for (const { ag, araliklar, ilkSira } of aglar) {
      const ozgun = ag.material as Material | Material[];
      if (Array.isArray(ozgun)) continue;
      eski.push({ ag, malzeme: ozgun });
      const liste: Material[] = [ozgun];
      const sirasi = new Map<Material, number>([[ozgun, 0]]);
      const g = ag.geometry as BufferGeometry;
      g.clearGroups();
      for (let k = 0; k < araliklar.length / 2; k++) {
        const sira = ilkSira + k;
        const ad = secili.has(sira) ? '--hazard' : renkler.get(sira);
        const m = ad === undefined ? ozgun : malzemesi(ad);
        if (!sirasi.has(m)) { sirasi.set(m, liste.length); liste.push(m); }
        const ilk = araliklar[2 * k] ?? 0, son = araliklar[2 * k + 1] ?? 0;
        g.addGroup(ilk * 3, (son - ilk + 1) * 3, sirasi.get(m) ?? 0);
      }
      ag.material = liste;
    }
    return () => {
      for (const e of eski) { e.ag.material = e.malzeme; (e.ag.geometry as BufferGeometry).clearGroups(); }
      for (const m of malzemeler.values()) m.dispose();
    };
  }, [yuklendi, yuzDurumu, renkAnahtari, seciliAnahtari]);

  const seciyor = yuzDurumu === 'hazir' && yuzBoyasi?.sec != null;
  return (
    <div className={`tc-g3b-sahne-kap${seciyor ? ' tc-g3b-seciyor' : ''}${parcaSayisi >= 2 ? ' tc-g3b-patlatmali' : ''}`}>
      <div className="tc-g3b-sahne-alan">
        <div className="tc-g3b-sahne" ref={kap} aria-label="3B model görüntüsü" role="img">
          {hata && <DurumKutusu durum="hata" mesaj={hata} />}
        </div>
        {arac !== null && <div className="tc-g3b-sahne-arac">{arac}</div>}
        {bilgi !== null && <p className="tc-g3b-sahne-bilgi">{bilgi}</p>}
        {parcaSayisi >= 2 && <PatlatmaCubugu oran={oran} oranYaz={oranYaz} />}
      </div>
      <GorunumCubugu bak={bak} sigdir={() => bak(null)} doner={doner} donerYaz={donerYaz}
        onizleme={onizleme?.etiket ?? null} onizlemeAcik={onizlemeAcik} onizlemeYaz={onizlemeYaz} />
    </div>
  );
}
