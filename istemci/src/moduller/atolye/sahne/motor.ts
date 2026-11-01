import {
  ACESFilmicToneMapping, BackSide, Box3, Color, MeshStandardMaterial, BoxGeometry, BufferGeometry, DirectionalLight, DoubleSide, EdgesGeometry, Float32BufferAttribute, Group, HemisphereLight,
  LineBasicMaterial, LineSegments, Matrix4,
  Mesh, MeshBasicMaterial, PCFShadowMap, RingGeometry, PMREMGenerator, PerspectiveCamera, Plane, PlaneGeometry, Raycaster, Scene, SRGBColorSpace, Vector2,
  Frustum, Vector3, WebGLRenderer,
} from 'three';
import type { Material, Object3D, Sphere, Texture } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { IstasyonModeli, KapiKenari, MerkezModeli, YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { MakineDurumu } from '../../../ortak/arayuz/index.ts';
import { bolumeCevir, fabrikayaCevir } from '../fabrika.ts';
import { varsayilanAyar } from '../model-dosyasi.ts';
import type { Nokta2 } from '../fabrika.ts';
import { DIS, GECIS_TURU_ADI, acikliklar, bolumYolu, disYolu, distaSerbestMi, gecisOrtasi, kapiKusagindaMi, kapilar } from '../gecis.ts';
import type { Aciklik, GecisliBolum, Kapi } from '../gecis.ts';
import { dolulukKademesi, hucreAnahtari, sayi } from '../kurallar.ts';
import type { IstasyonCanli, ParcaModeli, RafYuku } from '../kurallar.ts';
import { modelDizisi, modelSahnesi, modelYerlestir, parcaOnizlemesi, vekilMi } from './model.ts';
import type { ModelDizisi, ModelYerlesimi } from './model.ts';
import { alanKutusu, duvarParcasi as duvarOlcusu, icindeMi, kapiKonumu, katilar, sahneNesneleri, odaParcalari, parcayaUzaklik, rafKutusu } from './geometri.ts';
import type { Dikdortgen, Parca } from './geometri.ts';
import {
  andon, andonKolonu, cerceveDokusu, duvarDokusu, duvarParcasi, ekle, granitDokusu, haleDokusu, istasyonGovdesi, izMalzemesi, kapiUstu, kolon, kutu,
  gozCephesi, malzemeleriKur, modelBolgesi, okDokusu, onbellegiBosalt, onbellekteMi, palet, rafGovdesi, rafYukleri, silindir, temasDokusu, zeminIzi,
} from './nesneler.ts';
import type { Andon, Animasyon, DuvarAcikligi, Ekran, Malzemeler, RafOlcusu } from './nesneler.ts';
import { kareAraligi } from './kare-araligi.ts';
import { konsoluSuzgecle } from './konsol.ts';
import { malzemeImzasi, paletOku } from './renkler.ts';
import type { Palet } from './renkler.ts';
import { izgaraDokusu, izgaraImzasi, zeminDokusu, zeminImzasi } from './zemin.ts';

export type Gorunum = 'genel' | 'kus';

interface DiziKaydi { d: ModelDizisi; kure: Sphere | null }

interface ModelKaynagi {
  // Ham sahnenin kurulum içindeki anahtarı: aynı dosya bir kez okunur.
  anahtar: string;
  ad: string;
  yerlesim: ModelYerlesimi;
  getir: () => Promise<Uint8Array>;
}

export interface SahneOlaylari {
  sec: (anahtar: string | null) => void;
  // Yürüyüşte bölüm içindeki rota (bölüm metresi); sunucu hesaplar. Bölümler arası kapıları motor seçer.
  rotaIste: (salonId: number, bas: { x: number; z: number }, hedef: { x: number; z: number }) => Promise<{ x: number; z: number }[] | null>;
  yuruyusDurumu: (bilgi: { yakin: string | null }) => void;
  // Atanmış 3B modelin GLB dosyası (önbellekli); yüklenemezse istasyon tipinden çizilen gövde kalır.
  modelGetir: (m: IstasyonModeli) => Promise<Uint8Array>;
  // İstasyonun Çizim Merkezi'ndeki modeli, GLB'ye çevrilmiş (önbellekli); açılmazsa kütüphane modeli denenir.
  merkezModelGetir: (istasyonId: number, m: MerkezModeli) => Promise<Uint8Array>;
  // İşlenen parçanın Çizim Merkezi modeli (emrin malzemesine bağlı), GLB'ye çevrilmiş (önbellekli).
  malzemeModelGetir: (malzemeNo: number, m: MerkezModeli) => Promise<Uint8Array>;
  modelYuklenemedi: (ad: string, tur: 'istasyon' | 'parca') => void;
  // Bölmeye karşıdan bakışta göze basıldı (başka bölmenin gözü de olabilir).
  gozSec: (secim: { rafId: number; bolme: number; kat: number; goz: number }) => void;
  // Bakan yerin (yürüyüşte göz, gezinmede kameranın baktığı nokta) fabrika metresi ve bakış yönü (radyan, +x'ten
  // saat yönünde); küçük harita için, değiştikçe en çok saniyede beş kez.
  kameraDegisti?: (yer: KameraYeri) => void;
}

export interface KameraYeri {
  x: number;
  z: number;
  yon: number;
  yuruyus: boolean;
}

// Son bakılan yer cihazda bölüm kümesine göre tutulur: harita açılınca oradan başlar. Depolama kapalıysa genel görünüm.
const KAMERA_ANAHTARI = 'tmiv2.atolye.kamera.';
interface KameraKaydi {
  p: [number, number, number];
  t: [number, number, number];
  y: { x: number; z: number; yaw: number } | null;
}

function kameraKaydiOku(anahtar: string): KameraKaydi | null {
  try {
    const ham = window.localStorage.getItem(anahtar);
    const k = ham ? (JSON.parse(ham) as Partial<KameraKaydi>) : null;
    const uc = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every((n) => Number.isFinite(n));
    if (!k || !uc(k.p) || !uc(k.t)) return null;
    const y = k.y && [k.y.x, k.y.z, k.y.yaw].every((n) => Number.isFinite(n)) ? k.y : null;
    return { p: k.p, t: k.t, y };
  } catch {
    return null;
  }
}

function kameraKaydiYaz(anahtar: string, k: KameraKaydi): void {
  try {
    window.localStorage.setItem(anahtar, JSON.stringify(k));
  } catch {
    // Depolama doluysa ya da kapalıysa yer hatırlanmaz; harita yine açılır.
  }
}

// Fabrika bölümü ve fabrika planındaki yeri (sol üst köşe, o köşe çevresinde dönüş). Tek bölüm görünümünde yer
// sıfır verilir: bölüm dünyanın ortasında durur (yürüyüş ve rota bölüm ekseninde çalışır).
export interface BolumYerlesimi {
  yerlesim: YerlesimCevabi;
  konum: { x: number; z: number; donus: number };
}

interface BolumNesnesi {
  id: number;
  yerlesim: YerlesimCevabi;
  g: number;
  d: number;
  // Bölümün içi bu grupta, bölüm ekseninde (orta sıfır); grup fabrika planındaki yerinde.
  grup: Group;
  // Raf yükleri ayrı grupta (yük değişince sahne yeniden kurulmaz); aynı yerde.
  yukKap: Group;
}

// Bölmeye karşıdan bakış: sahne yalnız bu rafı gösterir, kamera bölmeye tam karşıdan, dar açıyla bakar.
export interface RafOdakIstegi {
  rafId: number;
  bolme: number;
  kat: number | null;
  goz: number | null;
  // Göz (hucreAnahtari) -> etiket: baskın kalemin kodu ve toplam doluluk.
  etiketler: ReadonlyMap<string, { kod: string; yuzde: number }>;
  // Sahnenin üstünü ve sağını örten arayüzün ölçüsü (px): bölme kalan alana sığdırılır.
  ustBosluk: number;
  sagBosluk: number;
}

interface RafOdagi {
  istek: RafOdakIstegi;
  grup: Group;
  olcu: RafOlcusu;
  kutular: Mesh[];
  vurgu: Group | null;
  // konum: gözün sol üst köşesi; sag: sağ üst köşesi (etiket gözün ekrandaki eninden geniş olmaz).
  etiketler: { el: HTMLElement; konum: Vector3; sag: Vector3 }[];
  imza: string;
  etiketImza: string;
  onceki: { p: Vector3; t: Vector3 };
  // Parça modeli hiçbir duruşta sığmayan gözler (hücre anahtarı): etiketi uyarır.
  sigmayan: Set<string>;
}

interface IstasyonNesnesi {
  anahtar: string;
  kod: string;
  aktif: boolean;
  grup: Group;
  andon: Andon;
  hale: Mesh;
  secim: Mesh;
  anim: Animasyon;
  ekran: Ekran | null;
  ust: number;
  canli: IstasyonCanli;
  // Canlı durumun ve işlenen parçanın anahtarı (istasyon kimliği); istasyonsuz makinede null.
  canliId: number | null;
  // Gövde kökü: atanmış gerçek model yüklenince yordamsal gövdenin yerine geçer.
  govde: Group;
  olcu: { g: number; d: number };
  // İşlenen parçanın döner önizlemesi (makinenin üstünde); kenar uzunluğu makine türüne göre.
  parca: { imza: string; kok: Group; doner: Group; malzemeler: Material[] } | null;
  // Ekran etiketi (her karede listede aranmaz).
  etiket?: Etiket;
  parcaKenari: number;
}

interface Etiket {
  anahtar: string;
  el: HTMLElement;
  konum: Vector3;
  ek: HTMLElement | null;
  // Ölçü bir kez okunur (metin değişince yeniden); her karede düzen hesaplatılmaz. Kısa biçimin ölçüsü ayrı.
  boyut: { g: number; y: number } | null;
  kisaBoyut?: { g: number; y: number } | null;
  kisa?: boolean;
  // Son tam yerleşimde çakıştığı için gizlendi; kamera oynarken bu karar korunur.
  carpisti?: boolean;
}

const GOZ_YUKSEKLIGI = 1.65;
const GOVDE_YARICAPI = 0.3;
const YURUME_HIZI = 1.6;
const GORUS = 30;
const YURUYUS_GORUSU = 62;
// Bölmeye karşıdan bakış: dar açı, perspektif bozulması az (tam karşıdan bakıyormuş gibi).
const ODAK_GORUSU = 14;
const YURUYUS_ETIKET_UZAKLIGI = 14;
// Yazı kalabalığı: kameradan bu uzaklıktan (metre) sonra istasyon ve raf etiketi kısalır (yalnız kod), raf etiketi
// daha ötede hiç gösterilmez; üst üste binen düşük öncelikli etiket gizlenir (seçili ve bölüm adı önce kaydırılır;
// bölüm adı yine çakışırsa o da gizlenir).
const ETIKET_KISA_UZAKLIGI = 32;
const ETIKET_RAF_UZAKLIGI = 55;
const ANDON_DURUMLARI = ['calisiyor', 'durakli', 'durdu'] as const;
// Son dokunuştan bu kadar sonra (ms) ve kamera durunca kare hızı düşer.
const ETKIN_SURE_MS = 1500;
const EN_AZ_PIKSEL_ORANI = 0.75;
// Rafta gerçek parça modeli yalnız ekranda yeterince büyükse (gözün yarıçapı yarım ekran yüksekliğinin bu oranından
// büyük; 30° görüşte 0,8 m'lik göz için yaklaşık 20 m) ve bu üçgen bütçesine kadar çizilir; ötesi vekil kutu.
// Bütçe orta sınıf tümleşik ekran kartında 60 karede rahat çizilecek kadar seçildi (VARSAYIM: gerçek kartta ölçülmedi).
const AYRINTI_EKRAN_PAYI = 0.15;
const AYRINTI_UCGEN = 1_500_000;
const BINA_YUKSEKLIGI = 8;
const BEKLIYOR: IstasyonCanli = { durum: 'sirada', metin: 'Bekliyor', sayac: null, oran: null, emirNo: null, parca: null, neden: null };

const kaba = (): boolean => typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
const azHareket = (): boolean => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

// WebGL yoksa (eski cihaz, test ortamı) sahne kurulmaz; ekran iki boyutlu plana döner.
export function webglVarMi(): boolean {
  if (typeof WebGLRenderingContext === 'undefined') return false;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    // Sınama bağlamı hemen bırakılır: tarayıcının açık bağlam sınırını harcamasın.
    gl?.getExtension('WEBGL_lose_context')?.loseContext();
    return gl !== null;
  } catch {
    return false;
  }
}

// Durağan alt ağlar malzemeye göre tek ağa birleşir: yüzlerce çizim çağrısı yerine birkaç tane. `atla` altındaki
// (hareketli) nesneler dokunulmadan kalır. Sonuç `kok`un yerel ekseninde, onun çocuğu olarak eklenir.
function birlestir(kok: Object3D, atla: ReadonlySet<Object3D> = new Set()): void {
  kok.updateMatrixWorld(true);
  const ters = new Matrix4().copy(kok.matrixWorld).invert();
  const kovalar = new Map<string, { mat: Material; geo: BufferGeometry[]; golge: boolean; sira: number }>();
  const silinecek: Mesh[] = [];
  const gez = (o: Object3D) => {
    if (atla.has(o)) return;
    if (o instanceof Mesh && !Array.isArray(o.material) && (o.material as Material).visible) {
      const kaynak = o.geometry as BufferGeometry;
      const geo = kaynak.index ? kaynak.toNonIndexed() : kaynak.clone();
      for (const ad of Object.keys(geo.attributes)) if (ad !== 'position' && ad !== 'normal' && ad !== 'uv') geo.deleteAttribute(ad);
      if (geo.attributes.uv && geo.attributes.normal) {
        geo.applyMatrix4(new Matrix4().multiplyMatrices(ters, o.matrixWorld));
        const mat = o.material as Material;
        const k = `${mat.uuid}|${o.castShadow ? 1 : 0}|${o.renderOrder}`;
        const kova = kovalar.get(k) ?? { mat, geo: [], golge: o.castShadow, sira: o.renderOrder };
        kova.geo.push(geo);
        kovalar.set(k, kova);
        silinecek.push(o);
      } else {
        geo.dispose();
      }
    }
    for (const c of [...o.children]) gez(c);
  };
  for (const c of [...kok.children]) gez(c);
  for (const o of silinecek) {
    o.removeFromParent();
    if (!onbellekteMi(o.geometry as BufferGeometry)) (o.geometry as BufferGeometry).dispose();
  }
  for (const { mat, geo, golge, sira } of kovalar.values()) {
    const birlesik = mergeGeometries(geo, false);
    for (const g of geo) g.dispose();
    if (!birlesik) continue;
    const m = new Mesh(birlesik, mat);
    m.castShadow = golge;
    m.receiveShadow = true;
    m.renderOrder = sira;
    kok.add(m);
  }
}

// Rota şeridi: noktalar boyunca zemine yatık şerit; doku boyu metre başına sabit.
function serit(noktalar: Vector3[], en: number): { geo: BufferGeometry; boy: number } {
  const konum: number[] = [];
  const uv: number[] = [];
  const dizin: number[] = [];
  let birikim = 0;
  for (let i = 0; i < noktalar.length - 1; i++) {
    const a = noktalar[i];
    const b = noktalar[i + 1];
    if (!a || !b) continue;
    const yon = b.clone().sub(a);
    const L = yon.length();
    if (L < 1e-3) continue;
    const n = new Vector3(-yon.z, 0, yon.x).normalize().multiplyScalar(en / 2);
    const o = konum.length / 3;
    for (const p of [a.clone().add(n), a.clone().sub(n), b.clone().add(n), b.clone().sub(n)]) konum.push(p.x, 0.025, p.z);
    uv.push(birikim / 1.2, 1, birikim / 1.2, 0, (birikim + L) / 1.2, 1, (birikim + L) / 1.2, 0);
    dizin.push(o, o + 1, o + 2, o + 1, o + 3, o + 2);
    birikim += L;
  }
  const geo = new BufferGeometry();
  geo.setAttribute('position', new Float32BufferAttribute(konum, 3));
  geo.setAttribute('uv', new Float32BufferAttribute(uv, 2));
  geo.setIndex(dizin);
  return { geo, boy: birikim };
}

function rafOlcusu(r: YerlesimCevabi['raflar'][number]): RafOlcusu {
  return {
    tur: r.tur, bolme: r.bolmeSayisi, kat: r.katSayisi, goz: r.gozSayisi,
    bolmeGenisligi: sayi(r.bolmeGenisligi), derinlik: sayi(r.derinlik), yukseklik: sayi(r.yukseklik),
    katlar: r.katYukseklikleri?.map(sayi) ?? null,
    gozGenisligi: r.gozGenisligi === null ? null : sayi(r.gozGenisligi),
    gozDerinligi: r.gozDerinligi === null ? null : sayi(r.gozDerinligi),
  };
}

const yukImzasi = (liste: readonly RafYuku[]): string => liste.map((y) => {
  const m = y.model;
  return `${y.bolme}.${y.kat}.${y.goz}.${y.bicim}.${y.doluluk.toFixed(2)}${m ? `.${m.id}.${m.birim}.${m.yukari}.${m.donus}` : ''}`;
}).sort().join('|');

export class SahneMotoru {
  private readonly kap: HTMLElement;
  private readonly etiketKatmani: HTMLElement;
  private readonly olaylar: SahneOlaylari;
  private readonly cizer: WebGLRenderer;
  private readonly sahne = new Scene();
  // Yakın düzlem genel bakışta 0,5 m (derinlik çözünürlüğü 2,5 kat), yürüyüşte 0,2 m (göz hizasında yakın nesne).
  private readonly kamera = new PerspectiveCamera(GORUS, 1, 0.5, 600);
  private readonly kontrol: OrbitControls;
  private readonly gunes: DirectionalLight;
  private readonly gok: HemisphereLight;
  private palet: Palet;
  private imza = '';
  private malzeme: Malzemeler | null = null;
  private dokular: Texture[] = [];
  private readonly temas = temasDokusu();
  private readonly hale = haleDokusu();
  private readonly ok = okDokusu();
  private readonly rotaMalzemesi: MeshBasicMaterial;
  private yapi = new Group();
  private izgaralar: Mesh[] = [];
  // Yürüyüşte açılan bina kabukları (ön ve sağ duvar, çatı, tavan, lambalar).
  private kabuklar: Group[] = [];
  // Her yeniden kurulumda artar: geç gelen model yüklemesi eski sahneye yazılmaz.
  private kurulumNo = 0;
  private rotaGrubu = new Group();
  // Yürüyüşte gidilen yol: yeşil şerit ve varış halkası.
  private yuruyusIzi = new Group();
  private istasyonlar = new Map<string, IstasyonNesnesi>();
  private secimKutulari: Mesh[] = [];
  private etiketler: Etiket[] = [];
  private bolumler: BolumNesnesi[] = [];
  private kurulacak: BolumYerlesimi[] = [];
  // Bölümlerin geçişleri ve aralarındaki kapılar (fabrika metresi); duvar açıklıkları, yürüyüş ve rota buradan.
  private gecisliBolumler: GecisliBolum[] = [];
  private acikliklar = new Map<number, Aciklik[]>();
  private kapiListesi: Kapi[] = [];
  // Görünen alanın ölçüsü (tek bölümde bölüm, fabrikada bütün bölümlerin kutusu); dünyanın ortası bu kutunun ortası.
  private olcu = { g: 20, d: 20 };
  private merkez = { x: 10, z: 10 };
  private secili: string | null = null;
  private canli = new Map<string, IstasyonCanli>();
  // İstasyon kimliği -> işlenen parçanın modeli; gösterim düğmesi açıksa hepsi, değilse yalnız seçili istasyonda görünür.
  private parcalar = new Map<number, ParcaModeli>();
  private parcaGoster = false;
  // Raf gözlerindeki yük (stok): raf kimliği -> yükler. Yük ayrı grupta durur; stok değişince sahne yeniden kurulmaz.
  private yukler = new Map<number, RafYuku[]>();
  private rafYerleri = new Map<number, { x: number; z: number; donus: number; olcu: RafOlcusu; imza: string; grup: Group | null; kap: Group }>();
  private yukGrubu = new Group();
  // Parça modeli bir kez okunur; aynı parça birden çok makinede ve yeniden kurulumda kopyalanır.
  private readonly parcaSahneleri = new Map<number | string, Promise<Object3D>>();
  private izgaraAcik = false;
  private gizli = false;
  private odak: RafOdagi | null = null;
  private kare = 0;
  private sonZaman = 0;
  private zaman = 0;
  private ucus: { p: Vector3; t: Vector3 } | null = null;
  private yuruyus: {
    acik: boolean; yaw: number; pitch: number; tuslar: Set<string>; kol: { x: number; y: number };
    yol: { x: number; z: number }[]; engel: Map<number, { kutular: Dikdortgen[]; parcalar: Parca[] }>;
  } = { acik: false, yaw: 0, pitch: 0, tuslar: new Set(), kol: { x: 0, y: 0 }, yol: [], engel: new Map() };
  private suruklenme: { x: number; y: number; hareket: number } | null = null;
  // Klavye yalnız sahneye son dokunulduysa (ya da odak sahnedeyse) gezdirir; sayfanın kaydırması bozulmaz.
  private sahneEtkin = false;
  private sonDokunus: { anahtar: string; zaman: number } | null = null;
  private readonly isinci = new Raycaster();
  private readonly enAzKareMs = kaba() ? 30 : 0;
  // Kare hızı ve çözünürlük: dokunurken tam hız; dokunulmuyorsa kıpırdayan bir şey (andon, makine hareketi, geçiş)
  // varken saniyede 30 kare, yoksa saniyede bir (kare-araligi.ts). Veri, seçim ya da ayar değişince `kirli` bir kareyi
  // hemen çizdirir. Tam hızda kareler yavaşsa piksel oranı adım adım düşer, uzun süre hızlıysa geri çıkar.
  private sonEtkinlik = 0;
  private kirli = true;
  // Son çizilen karede kıpırdayan şeyler; bir sonraki karenin ne zaman çizileceğine bunlar karar verir.
  private kipirti = { gecis: false, hareket: false, yanip: false };
  private etiketAcik = true;
  private etiketKarariBekliyor = false;
  private sonKameraHareketi = 0;
  private kameraAnahtari = '';
  private kameraIzi = { bildirim: 0, kayit: 0, son: '', kaydedilen: '' };
  private pikselOrani = 1;
  private enCokPikselOrani = 1;
  private hizOlcumu = { bas: 0, kare: 0, iyi: 0, dustu: false, bekleyen: 0 };
  // Rafta model dizileri: hangisinin ayrıntılı çizileceği kameraya göre seçilir (vekil kutu / gerçek model).
  private diziler: DiziKaydi[] = [];
  private diziKirli = false;
  private diziZamani = 0;
  private readonly diziKamerasi = new Matrix4();
  // Zemin, ızgara, duvar ve çerçeve dokuları yeniden kurulumlar arasında saklanır (görünüm değişince, kayıttan sonra,
  // aynı bölüm): büyük tuval yeniden çizilmez ve ekran kartına yeniden yüklenmez. Son iki kurulumda kullanılmayan
  // atılır (fabrika ↔ bölüm arası gidip gelişte öbür bölümlerin dokuları kalır).
  private dokuOnbellegi = new Map<string, Texture>();
  private kullanilanDokular = new Set<string>();
  private oncekiDokular = new Set<string>();
  private malzemeAnahtari = '';
  private readonly temaGozcusu: MutationObserver;
  private readonly boyutGozcusu: ResizeObserver | null;
  private olaySokuculer: (() => void)[] = [];
  private boyut = { en: 1, boy: 1 };
  // Etiketler yalnız kamera ya da boyut değişince yeniden yerleşir.
  private readonly sonKamera = new Matrix4();
  private etiketlerKirli = true;

  constructor(kap: HTMLElement, etiketKatmani: HTMLElement, olaylar: SahneOlaylari) {
    this.kap = kap;
    this.etiketKatmani = etiketKatmani;
    this.olaylar = olaylar;
    this.palet = paletOku();
    this.imza = malzemeImzasi(this.palet);
    konsoluSuzgecle();
    this.cizer = new WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.enCokPikselOrani = Math.min(window.devicePixelRatio || 1, kaba() ? 1.5 : 2);
    this.pikselOrani = this.enCokPikselOrani;
    this.cizer.setPixelRatio(this.pikselOrani);
    this.cizer.outputColorSpace = SRGBColorSpace;
    this.cizer.toneMapping = ACESFilmicToneMapping;
    this.cizer.toneMappingExposure = 0.82;
    this.cizer.shadowMap.enabled = true;
    this.cizer.shadowMap.type = PCFShadowMap;
    // Gölge yalnız yerleşim değişince yeniden hesaplanır; sahnenin en pahalı işi her karede yapılmaz.
    this.cizer.shadowMap.autoUpdate = false;
    this.cizer.domElement.classList.add('tc-atolye-tuval');
    this.cizer.domElement.addEventListener('webglcontextlost', (o) => o.preventDefault());
    kap.appendChild(this.cizer.domElement);

    this.kontrol = new OrbitControls(this.kamera, this.cizer.domElement);
    this.kontrol.enableDamping = true;
    this.kontrol.dampingFactor = 0.1;
    this.kontrol.maxPolarAngle = Math.PI * 0.48;
    this.kontrol.minDistance = 2.5;
    // Sağ tuş ve iki parmak zeminde kaydırır (ekran düzleminde değil); tekerlek imlecin olduğu yere yaklaşır.
    this.kontrol.screenSpacePanning = false;
    this.kontrol.zoomToCursor = true;
    this.kontrol.addEventListener('change', () => { this.sonEtkinlik = performance.now(); this.hedefiSinirla(); });
    // Kullanıcı sürükleyince süren uçuş bırakılır: kamera elden kaçmaz.
    this.kontrol.addEventListener('start', () => { this.ucus = null; });

    // Işık birimleri fiziksel (three r155+): eski ışık modelindeki π çarpanı burada açıkça verilir.
    this.gok = new HemisphereLight(this.palet.gok, this.palet.yer, 0.22 * Math.PI);
    this.gunes = new DirectionalLight(this.palet.isik, 2.3 * Math.PI);
    this.gunes.castShadow = true;
    const harita = kaba() ? 1024 : 2048;
    this.gunes.shadow.mapSize.set(harita, harita);
    this.gunes.shadow.bias = -0.0004;
    this.gunes.shadow.normalBias = 0.035;
    this.gunes.shadow.radius = 3;
    this.rotaMalzemesi = new MeshBasicMaterial({ map: this.ok, color: this.palet.rota.clone(), transparent: true, depthWrite: false, toneMapped: false, side: DoubleSide });
    this.sahne.add(this.gok, this.gunes, this.gunes.target, this.yapi, this.yukGrubu, this.rotaGrubu, this.yuruyusIzi);

    // Tema değişince yalnız arka plan değişir; malzeme renkleri değiştiyse sahne yeniden kurulur.
    this.temaGozcusu = new MutationObserver(() => this.temaDegisti());
    this.temaGozcusu.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    this.boyutGozcusu = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => this.boyutla());
    this.boyutGozcusu?.observe(kap);
    this.olaylariBagla();
    this.boyutla();
    this.sonZaman = performance.now();
    this.kare = requestAnimationFrame((t) => this.dongu(t));
  }

  // ---------- kurulum ----------

  yerlesimKur(y: YerlesimCevabi): void {
    this.fabrikaKur([{ yerlesim: y, konum: { x: 0, z: 0, donus: 0 } }]);
  }

  // Bölümler fabrika planındaki yerlerinde birlikte kurulur; görünen bölümler değişince kamera genel görünüme döner.
  fabrikaKur(bolumler: readonly BolumYerlesimi[]): void {
    this.kirli = true;
    const imza = (l: readonly { yerlesim: YerlesimCevabi }[]) => l.map((b) => b.yerlesim.salon.id).join(',');
    const ilk = imza(this.kurulacak) !== imza(bolumler);
    // Önceki bölüm kümesinin bakışı, dünyanın ortası değişmeden saklanır.
    if (ilk) this.kameraKaydet();
    this.kurulacak = [...bolumler];
    this.yuruyus.engel = new Map(bolumler.map((b) => [b.yerlesim.salon.id, katilar(b.yerlesim)]));
    this.gecisliBolumler = bolumler.map((b) => ({
      salonId: b.yerlesim.salon.id, konum: b.konum, g: sayi(b.yerlesim.salon.genislik), d: sayi(b.yerlesim.salon.derinlik),
      gecisler: b.yerlesim.gecisler.map((gc) => ({ tur: gc.tur, kenar: gc.kenar, ofset: sayi(gc.ofset), genislik: sayi(gc.genislik) })),
    }));
    this.acikliklar = acikliklar(this.gecisliBolumler);
    this.kapiListesi = kapilar(this.gecisliBolumler);
    this.yeniden();
    if (!ilk) return;
    this.kameraAnahtari = KAMERA_ANAHTARI + imza(bolumler);
    this.kameraIzi.kaydedilen = '';
    const k = kameraKaydiOku(this.kameraAnahtari);
    if (!k || this.yuruyus.acik) { this.gorunum('genel', false); return; }
    const { x: mx, z: mz } = this.merkez;
    this.kamera.position.set(k.p[0] - mx, k.p[1], k.p[2] - mz);
    this.kontrol.target.set(k.t[0] - mx, k.t[1], k.t[2] - mz);
    this.kontrol.maxDistance = Math.max(this.olcu.g, this.olcu.d) * 3;
    this.ucus = null;
    this.hedefiSinirla();
  }

  // Bakılan yer küçük haritaya bildirilir ve cihazda saklanır (yürüyüşte göz, yönü ve gezinme kamerası).
  private kameraIzle(t: number): void {
    const iz = this.kameraIzi;
    if (t - iz.bildirim < 200) return;
    iz.bildirim = t;
    // Kayıt saniyede bir (aynıysa yazılmaz); bölmeye bakışta yazılmaz.
    if (t - iz.kayit >= 1000) { iz.kayit = t; this.kameraKaydet(); }
    const { x: mx, z: mz } = this.merkez;
    const yu = this.yuruyus;
    const yer: KameraYeri = yu.acik
      ? { x: this.kamera.position.x + mx, z: this.kamera.position.z + mz, yon: Math.atan2(-Math.cos(yu.yaw), -Math.sin(yu.yaw)), yuruyus: true }
      : {
        x: this.kontrol.target.x + mx, z: this.kontrol.target.z + mz, yuruyus: false,
        yon: Math.atan2(this.kontrol.target.z - this.kamera.position.z, this.kontrol.target.x - this.kamera.position.x),
      };
    const imza_ = [yer.x, yer.z, yer.yon].map((n) => n.toFixed(2)).join(',') + String(yer.yuruyus);
    if (imza_ === iz.son) return;
    iz.son = imza_;
    this.olaylar.kameraDegisti?.(yer);
  }

  private kameraKaydet(): void {
    if (!this.kameraAnahtari || this.odak) return;
    const { x: mx, z: mz } = this.merkez;
    const onceki = kameraKaydiOku(this.kameraAnahtari);
    const yu = this.yuruyus;
    let k: KameraKaydi;
    if (!yu.acik) {
      // Uçuş sürerken varılacak yer saklanır.
      const kp = this.ucus?.p ?? this.kamera.position;
      const kt = this.ucus?.t ?? this.kontrol.target;
      k = {
        p: [kp.x + mx, kp.y, kp.z + mz],
        t: [kt.x + mx, kt.y, kt.z + mz],
        y: onceki?.y ?? null,
      };
    } else if (onceki) {
      // Yürüyüşte gezinme kamerası değişmez: son gezinme bakışı korunur.
      k = { ...onceki, y: { x: this.kamera.position.x + mx, z: this.kamera.position.z + mz, yaw: yu.yaw } };
    } else {
      return;
    }
    const metin = JSON.stringify(k);
    if (metin === this.kameraIzi.kaydedilen) return;
    this.kameraIzi.kaydedilen = metin;
    kameraKaydiYaz(this.kameraAnahtari, k);
  }

  // Bakılan yere git (küçük haritadan; fabrika metresi): yürüyüşte oraya yürür, gezinmede kamera oraya kayar.
  yereGit(x: number, z: number): void {
    this.kirli = true;
    if (this.odak) return;
    const { x: mx, z: mz } = this.merkez;
    if (this.yuruyus.acik) {
      const bas = { x: this.kamera.position.x + mx, z: this.kamera.position.z + mz };
      void this.yolBul(bas, { x, z }).then((yol) => {
        if (this.yuruyus.acik && yol) this.yuruyusYoluYaz(yol.slice(1));
      });
      return;
    }
    const kayma = new Vector3(x - mx, 0, z - mz).sub(this.kontrol.target).setY(0);
    this.ucus = { p: this.kamera.position.clone().add(kayma), t: this.kontrol.target.clone().add(kayma) };
  }

  // Bölüm noktası (metre, sol üst köşeden) -> dünya noktası.
  private dunyaNoktasi(salonId: number | null, x: number, y: number, z: number): Vector3 {
    const b = (salonId === null ? undefined : this.bolumler.find((o) => o.id === salonId)) ?? this.bolumler[0];
    if (!b) return new Vector3(x, y, z);
    return b.grup.localToWorld(new Vector3(x - b.g / 2, y, z - b.d / 2));
  }

  private temaDegisti(): void {
    this.kirli = true;
    const yeni = paletOku();
    const imza = malzemeImzasi(yeni);
    this.palet = yeni;
    this.sahne.background = this.palet.arka.clone();
    this.durumlariUygula();
    if (imza !== this.imza) {
      this.imza = imza;
      this.yeniden();
    }
  }

  // Nesneye özgü geometri ve malzemeler GPU'dan atılır; önbellekteki ortak geometri ve ana malzemeler kalır.
  // Ertelenen temizlik: eski sahnenin geometri, malzeme ve dokuları yeni sahne bir kez çizildikten sonra atılır.
  // Böylece aynı türden yeni malzeme eski programı bulur, gölgelendirici yeniden derlenmez.
  private atilacak: { dispose: () => void }[] = [];
  private eskiYukler = new Map<string, Group>();

  private yukAnahtari(rafId: number, imza: string, olcu: RafOlcusu): string {
    return `${rafId}|${this.malzemeAnahtari}|${JSON.stringify(olcu)}|${imza}`;
  }

  private temizle(o: Object3D, ertele = false): void {
    const ana = new Set<Material>(Object.values(this.malzeme ?? {}) as Material[]);
    ana.add(this.rotaMalzemesi);
    const geometriler = new Set<BufferGeometry>();
    const malzemeler = new Set<Material>();
    o.traverse((c) => {
      if (c instanceof Mesh) {
        const geo = c.geometry as BufferGeometry;
        if (!onbellekteMi(geo) && !vekilMi(geo)) geometriler.add(geo);
        for (const m of ([] as Material[]).concat(c.material as Material | Material[])) if (!ana.has(m) && !vekilMi(m)) malzemeler.add(m);
      } else if ('material' in c && c.material) {
        malzemeler.add(c.material as Material);
      }
    });
    const atilacak: { dispose: () => void }[] = [...geometriler];
    for (const m of malzemeler) {
      const harita = (m as MeshBasicMaterial).map;
      // Ekran ve seçim çerçevesi dokusu nesneye özgüdür; ortak dokular (hale, temas, ok) kalır.
      if (harita && harita !== this.hale && harita !== this.temas && harita !== this.ok && !this.saklananMi(harita)) atilacak.push(harita);
      atilacak.push(m);
    }
    o.clear();
    if (ertele) this.atilacak.push(...atilacak);
    else for (const a of atilacak) a.dispose();
  }

  private yeniden(): void {
    const liste = this.kurulacak;
    if (liste.length === 0) return;
    this.temizle(this.yapi, true);
    this.etiketKatmani.replaceChildren();
    this.etiketler = [];
    this.istasyonlar.clear();
    // Raf yükleri (gözlerdeki kutular ve parça modeli dizileri) aynı raf, aynı ölçü ve aynı yükle yeniden kurulmaz.
    this.eskiYukler.clear();
    for (const [id, yer] of this.rafYerleri) {
      if (!yer.grup) continue;
      yer.grup.removeFromParent();
      this.eskiYukler.set(this.yukAnahtari(id, yer.imza, yer.olcu), yer.grup);
    }
    // Saklanan grupların dizileri listeden çıkar; grup yeniden kullanılınca yeniden eklenir (çift kayıt olmaz).
    const saklanan = new Set<Object3D>(this.eskiYukler.values());
    this.diziler = this.diziler.filter((e) => !(e.d.kok.parent && saklanan.has(e.d.kok.parent)));
    this.temizle(this.yukGrubu, true);
    this.rafYerleri.clear();
    this.secimKutulari = [];
    this.izgaralar = [];
    this.kabuklar = [];
    for (const d of this.dokular) d.dispose();
    this.dokular = [];
    const k = kaba();
    const ilkY = liste[0]?.yerlesim;
    if (!ilkY) return;
    this.oncekiDokular = this.kullanilanDokular;
    this.kullanilanDokular = new Set();
    const zemin = this.saklananDoku(`z|${this.imza}|${k}|${zeminImzasi(ilkY)}`, () => zeminDokusu(this.palet, ilkY, k));
    const granit = this.saklananDoku(`g|${this.imza}`, () => granitDokusu(this.palet));
    // Ana malzemeler renkler değişmedikçe korunur: atılan malzemenin gölgelendirici programı da atılır ve yenisi
    // derlenir (ölçüldü: her görünüm değişiminde 12 programın 8'i yeniden derleniyordu; Windows'ta ANGLE ile derleme
    // kare takılmasıdır). Yalnız ilk bölümün zemin dokusu değişir.
    const malzemeAnahtari = `${this.imza}|${k}`;
    if (!this.malzeme || this.malzemeAnahtari !== malzemeAnahtari) {
      for (const mat of Object.values(this.malzeme ?? {})) (mat as Material).dispose();
      this.malzeme = malzemeleriKur(this.palet, zemin, granit);
      this.malzemeAnahtari = malzemeAnahtari;
    } else {
      this.malzeme.zemin.map = zemin;
      this.malzeme.granit.map = granit;
    }
    const m = this.malzeme;
    this.sahne.background = this.palet.arka.clone();

    // Görünen alan: bölümlerin fabrika planındaki köşelerini saran kutu; dünyanın ortası onun ortası.
    let x0 = Infinity; let z0 = Infinity; let x1 = -Infinity; let z1 = -Infinity;
    for (const b of liste) {
      const g = sayi(b.yerlesim.salon.genislik);
      const d = sayi(b.yerlesim.salon.derinlik);
      const a = (b.konum.donus * Math.PI) / 180;
      for (const [px, pz] of [[0, 0], [g, 0], [g, d], [0, d]] as const) {
        const fx = b.konum.x + px * Math.cos(a) - pz * Math.sin(a);
        const fz = b.konum.z + px * Math.sin(a) + pz * Math.cos(a);
        x0 = Math.min(x0, fx); x1 = Math.max(x1, fx); z0 = Math.min(z0, fz); z1 = Math.max(z1, fz);
      }
    }
    this.olcu = { g: Math.max(1, x1 - x0), d: Math.max(1, z1 - z0) };
    this.merkez = { x: (x0 + x1) / 2, z: (z0 + z1) / 2 };
    this.ortamIsigi();
    // Birden çok bölümde bölümlerin arası açık saha (beton): binalar onun üstünde.
    if (liste.length > 1) {
      const saha = ekle(this.yapi, kutu(this.olcu.g + 24, 0.3, this.olcu.d + 24), m.beton, 0, -0.2, 0, false);
      saha.receiveShadow = true;
    }

    const kurulum = (this.kurulumNo += 1);
    const modelSahneleri = new Map<string, Promise<Object3D>>();
    this.bolumler = liste.map((b, i) => this.bolumKur(b, i === 0 ? zemin : null, k, kurulum, modelSahneleri));
    for (const [a, d] of this.dokuOnbellegi) {
      if (this.kullanilanDokular.has(a) || this.oncekiDokular.has(a)) continue;
      d.dispose();
      this.dokuOnbellegi.delete(a);
    }

    this.durumlariUygula();
    this.secimUygula();
    this.parcalariKur();
    this.yukleriKur();
    for (const g of this.eskiYukler.values()) {
      g.userData.atildi = true;
      this.temizle(g, true);
    }
    this.eskiYukler.clear();
    this.etiketlerKirli = true;
    this.cizer.shadowMap.needsUpdate = true;
    // Bölmeye bakılırken yerleşim yenilendiyse bakış yeni rafla yeniden kurulur (etiketler katmanla silindi).
    if (this.odak) {
      this.odak.etiketler = [];
      this.rafOdakYaz(this.odak.istek);
    }
  }

  private saklananMi(d: Texture): boolean {
    for (const x of this.dokuOnbellegi.values()) if (x === d) return true;
    return false;
  }

  private saklananDoku(anahtar: string, kur: () => Texture): Texture {
    this.kullanilanDokular.add(anahtar);
    let d = this.dokuOnbellegi.get(anahtar);
    if (!d) { d = kur(); this.dokuOnbellegi.set(anahtar, d); }
    return d;
  }

  // Bir bölümün yapısı, alanları, rafları ve istasyonları; hepsi bölüm grubunda, bölüm ekseninde.
  private bolumKur(b: BolumYerlesimi, hazirZemin: Texture | null, k: boolean, kurulum: number, modelSahneleri: Map<string, Promise<Object3D>>): BolumNesnesi {
    const y = b.yerlesim;
    const base = this.malzeme;
    if (!base) throw new Error('Malzeme yok');
    const g = sayi(y.salon.genislik);
    const d = sayi(y.salon.derinlik);
    // Zemin dokusu bölüme özgüdür (yollar, bölgeler, makine izleri boyalı): ilk bölüm ortak malzemeyi kullanır.
    let m = base;
    if (!hazirZemin) {
      const doku = this.saklananDoku(`z|${this.imza}|${k}|${zeminImzasi(y)}`, () => zeminDokusu(this.palet, y, k));
      const zm = base.zemin.clone();
      zm.map = doku;
      m = { ...base, zemin: zm };
    }
    const grup = new Group();
    const a = (b.konum.donus * Math.PI) / 180;
    const ortaX = b.konum.x + (g / 2) * Math.cos(a) - (d / 2) * Math.sin(a);
    const ortaZ = b.konum.z + (g / 2) * Math.sin(a) + (d / 2) * Math.cos(a);
    grup.position.set(ortaX - this.merkez.x, 0, ortaZ - this.merkez.z);
    grup.rotation.y = -a;
    grup.updateMatrixWorld(true);
    this.yapi.add(grup);
    const yukKap = new Group();
    yukKap.position.copy(grup.position);
    yukKap.rotation.copy(grup.rotation);
    this.yukGrubu.add(yukKap);
    const dunya = (x: number, yy: number, z: number) => grup.localToWorld(new Vector3(x, yy, z));

    const sabit = new Group();
    // Bölüm ortası sıfırdır; kayıt koordinatı sol üst köşedendir.
    const yerel = (x: number, z: number): [number, number] => [x - g / 2, z - d / 2];

    const zeminAgi = ekle(sabit, new PlaneGeometry(g, d), m.zemin, 0, 0, 0, false);
    zeminAgi.rotation.x = -Math.PI / 2;
    // Beton taban zeminin 2,5 cm altında biter: aynı düzlemde biten iki yüz uzaktan titreşir.
    ekle(sabit, kutu(g + 0.5, 0.35, d + 0.5), m.beton, 0, -0.2, 0, false);
    const kabuk = new Group();
    this.binaKur(sabit, kabuk, g, d, this.acikliklar.get(y.salon.id) ?? []);
    birlestir(kabuk);
    kabuk.visible = this.yuruyus.acik;
    this.kabuklar.push(kabuk);
    grup.add(kabuk);

    // Hücre ızgarası: zemine serilen doku, isteğe bağlı görünür.
    const izgaraDoku = this.saklananDoku(`i|${k}|${izgaraImzasi(y)}`, () => izgaraDokusu(y, k));
    const izgara = zeminIzi(grup, g, d, izMalzemesi(izgaraDoku, new Color(1, 1, 1), 0.9), 0.012, 3);
    izgara.visible = this.izgaraAcik;
    this.izgaralar.push(izgara);

    // Alanlar: zemindeki boyası dokuda; burada palet, oda duvarı ve seçim kutusu.
    for (const al of y.alanlar) {
      const kk = alanKutusu(al);
      const [x, z] = yerel(kk.x, kk.z);
      const ag = new Group();
      ag.position.set(x, 0, z);
      ag.rotation.y = (-kk.donus * Math.PI) / 180;
      if (al.tur === 'palet') {
        ag.add(palet(m, kk.genislik, kk.derinlik));
        zeminIzi(ag, kk.genislik * 1.1, kk.derinlik * 1.2, izMalzemesi(this.temas, this.palet.siyah, 0.6), 0.003);
      }
      this.secimKutusu(ag, `alan:${al.id}`, kk.genislik, al.tur === 'palet' ? 0.2 : 0.05, kk.derinlik);
      sabit.add(ag);
      if (al.tur === 'oda' || al.tur === 'cam_oda') {
        const cam = al.tur === 'cam_oda';
        const h = cam ? 2.8 : 3;
        for (const p of odaParcalari(al)) sabit.add(this.duvarNesnesi(m, p, cam, h, yerel));
        const kapi = kapiKonumu(al);
        if (kapi) {
          const [kx, kz] = yerel(kapi.x, kapi.z);
          const lento = kapiUstu(m, kapi.genislik, cam, h);
          lento.position.set(kx, 0, kz);
          lento.rotation.y = -kapi.aci;
          sabit.add(lento);
        }
      }
    }
    for (const dv of y.duvarlar) sabit.add(this.duvarNesnesi(m, duvarOlcusu(dv), dv.cam, dv.cam ? 2.8 : 3, yerel));

    // Raflar.
    for (const r of y.raflar) {
      const kk = rafKutusu(r);
      const [x, z] = yerel(kk.x, kk.z);
      const rg = new Group();
      rg.position.set(x, 0, z);
      rg.rotation.y = (-kk.donus * Math.PI) / 180;
      const rafOlcu = rafOlcusu(r);
      const govde = rafGovdesi(rafOlcu, m);
      if (r.aktif) this.rafYerleri.set(r.id, { x, z, donus: kk.donus, olcu: rafOlcu, imza: '', grup: null, kap: yukKap });
      if (!r.aktif) govde.traverse((c) => { if (c instanceof Mesh) c.material = this.solukMalzeme(c.material as Material); });
      rg.add(govde);
      zeminIzi(rg, kk.genislik * 1.06, kk.derinlik * 1.3, izMalzemesi(this.temas, this.palet.siyah, 0.7), 0.003);
      const anahtar = `raf:${r.id}`;
      const boy = r.tur === 'zemin' ? 0.3 : sayi(r.yukseklik);
      this.secimKutusu(rg, anahtar, kk.genislik, boy, kk.derinlik);
      this.etiketEkle(anahtar, r.kod, r.ad, 'tc-atolye-etiket-koyu', dunya(x, boy + 0.35, z));
      sabit.add(rg);
    }
    birlestir(sabit);
    grup.add(sabit);

    // İstasyonlar: her biri kendi içinde birleşir; hareketli parçalar, andon, hale ve seçim çerçevesi ayrı kalır.
    // Gerçek modeli atanmış istasyon önce tipinden çizilir, model gelince değişir (aynı model bir kez okunur).
    for (const yer of sahneNesneleri(y)) {
      const kk = yer.kutu;
      const [x, z] = yerel(kk.x, kk.z);
      const ig = new Group();
      ig.position.set(x, 0, z);
      ig.rotation.y = (-kk.donus * Math.PI) / 180;
      grup.add(ig);
      const govde = istasyonGovdesi(yer.tip, yer.ad, kk.genislik, kk.derinlik, this.palet, m, this.hale);
      ig.add(govde.grup);
      birlestir(govde.grup, govde.hareketli);
      if (!yer.aktif) govde.grup.traverse((c) => { if (c instanceof Mesh) c.material = this.solukMalzeme(c.material as Material); });
      zeminIzi(ig, kk.genislik * 1.05, kk.derinlik * 1.15, izMalzemesi(this.temas, this.palet.siyah, 1), 0.004);
      const hale = zeminIzi(ig, kk.genislik + 1.2, kk.derinlik + 1.2, izMalzemesi(this.hale, this.palet.bekliyor, 0.2), 0.008);
      const cg = kk.genislik + 0.5;
      const cd = kk.derinlik + 0.5;
      const cerceveDoku = this.saklananDoku(`c|${cg.toFixed(2)}|${cd.toFixed(2)}`, () => cerceveDokusu(cg, cd));
      const secim = zeminIzi(ig, kk.genislik + 0.5, kk.derinlik + 0.5, izMalzemesi(cerceveDoku, this.palet.vurgu, 1), 0.014, 2);
      secim.visible = false;
      const [ax, ay, az] = govde.andonYeri;
      const an = andon(govde.grup, this.palet, m, this.hale, ax, ay, az);
      const anahtar = yer.anahtar;
      const ust = Math.max(govde.ust, an.ust);
      this.secimKutusu(ig, anahtar, kk.genislik, ust, kk.derinlik);
      this.istasyonlar.set(anahtar, {
        anahtar, kod: yer.kod, aktif: yer.aktif, grup: ig, andon: an, hale, secim, anim: govde.anim, ekran: govde.ekran, ust, canli: BEKLIYOR, canliId: yer.canliId,
        govde: govde.grup, olcu: { g: kk.genislik, d: kk.derinlik }, parca: null, parcaKenari: yer.tip === 'markalama' ? 1.8 : 1.5,
      });
      this.etiketEkle(anahtar, yer.kod, null, 'tc-atolye-etiket', dunya(x, ust + 0.35, z), true);
      const nesne = this.istasyonlar.get(anahtar);
      if (nesne) nesne.etiket = this.etiketler.at(-1);
      const kaynaklar: ModelKaynagi[] = [];
      if (yer.merkezModeli && yer.merkezSahibi !== null) kaynaklar.push(this.merkezKaynagi(yer.merkezSahibi, yer.merkezModeli));
      if (yer.model) kaynaklar.push(this.kutuphaneKaynagi(yer.model));
      this.modelKoy(anahtar, kaynaklar, kurulum, modelSahneleri);
    }

    // Geçişin adı türüdür (kepenk, açık geçiş, kapı, yangın kapısı); etiket geçişin hemen içinde.
    y.gecisler.forEach((gc, i) => {
      const o = gecisOrtasi({ kenar: gc.kenar, ofset: sayi(gc.ofset) }, g, d);
      const ic = 0.6;
      const [x, z] = yerel(o.x + (gc.kenar === 'sol' ? ic : gc.kenar === 'sag' ? -ic : 0), o.z + (gc.kenar === 'arka' ? ic : gc.kenar === 'on' ? -ic : 0));
      this.etiketEkle(`gecis:${y.salon.id}:${i}`, GECIS_TURU_ADI[gc.tur], null, `tc-atolye-etiket-giris tc-atolye-etiket-gecis-${gc.tur}`, dunya(x, 0.4, z));
    });
    // Fabrika görünümünde bölümün adı bölümün üstünde.
    if (this.kurulacak.length > 1) {
      this.etiketEkle(`bolum:${y.salon.id}`, y.salon.kod, y.salon.ad, 'tc-atolye-etiket-bolum', dunya(0, BINA_YUKSEKLIGI + 2.2, 0));
    }
    return { id: y.salon.id, yerlesim: y, g, d, grup, yukKap };
  }

  // Bina: kesit görünüm. Kuşbakışı ve genel bakışta arka ve sol duvar tam boy (sac, pencere bandı, geçişler), ön ve
  // sağ alçak; çatı kaldırılmıştır (makas ve lamba yok, havada kalan uç olmaz). Yürüyüşte `kabuk` açılır: ön ve sağ duvar,
  // ön ve sağ kolonlar, uçtan uca çatı makası, mahya, aşık, tavan ve sarkıt lambalar. Duvarlar bölümün geçişlerinde ve
  // komşu bölümün ortak duvara açtığı geçişte açılır (türüne göre kepenk, kapı, yangın kapısı ya da açık geçiş).
  private binaKur(ust: Group, kabuk: Group, g: number, d: number, ac: readonly Aciklik[]): void {
    const m = this.malzeme;
    if (!m) return;
    const H = BINA_YUKSEKLIGI;
    const k = kaba();
    // Duvar düzleminin yatay ekseni arka ve sağda kenar yönünde, sol ve önde ters; köşe kolonları açıklığa girmez.
    const eksende = (kenar: KapiKenari, boy: number): DuvarAcikligi[] => ac.filter((a) => a.kenar === kenar).map((a) => {
      const ters = kenar === 'sol' || kenar === 'on';
      return { bas: Math.max(0.3, ters ? boy - a.son : a.bas), son: Math.min(boy - 0.3, ters ? boy - a.bas : a.son), tur: a.tur };
    }).filter((a) => a.son - a.bas > 0.05);
    const duvarMat = (doku: Texture, delik: boolean) => {
      const mat = m.duvar.clone();
      mat.map = doku;
      mat.color.setRGB(1, 1, 1);
      // Açık geçiş dokuda deliktir: saydam pikseller çizilmez.
      if (delik) mat.alphaTest = 0.5;
      return mat;
    };
    // Duvar düzlemi içe bakar; doku yatayda düzlemin kendi x ekseninde, açıklıklar o eksende verilir.
    const duvar = (kok: Group, boy: number, x: number, z: number, ry: number, acik: DuvarAcikligi[]) => {
      const imza = acik.map((a) => `${a.tur}:${a.bas.toFixed(2)}-${a.son.toFixed(2)}`).join(',') || '-';
      const doku = this.saklananDoku(`d|${this.imza}|${k}|${boy.toFixed(2)}|${imza}`, () => duvarDokusu(this.palet, boy, H, acik, k));
      const pl = ekle(kok, new PlaneGeometry(boy, H), duvarMat(doku, acik.some((a) => a.tur === 'acik')), x, H / 2, z, false);
      pl.rotation.y = ry;
    };
    duvar(ust, g, 0, -d / 2 - 0.1, 0, eksende('arka', g));
    duvar(ust, d, -g / 2 - 0.1, 0, Math.PI / 2, eksende('sol', d));
    duvar(kabuk, g, 0, d / 2 + 0.1, Math.PI, eksende('on', g));
    duvar(kabuk, d, g / 2 + 0.1, 0, -Math.PI / 2, eksende('sag', d));
    for (let x = -g / 2 + 2; x < g / 2 - 1.5; x += 4) {
      ekle(ust, kutu(3.4, 1.3, 0.05), m.pencere, x, 5.9, -d / 2 - 0.075, false);
      ekle(kabuk, kutu(3.4, 1.3, 0.05), m.pencere, x, 5.9, d / 2 + 0.075, false);
    }
    for (let z = -d / 2 + 2; z < d / 2 - 1.5; z += 4) {
      ekle(ust, kutu(0.05, 1.3, 3.4), m.pencere, -g / 2 - 0.075, 5.9, z, false);
      ekle(kabuk, kutu(0.05, 1.3, 3.4), m.pencere, g / 2 + 0.075, 5.9, z, false);
    }

    // Ön ve sağ: alçak beton duvar (kesit çizgisi); geçişlerde açıklık. Duvar köşelerden 0,1 m taşar.
    const alcak = (boy: number, x: number, z: number, yatay: boolean, kenar: KapiKenari) => {
      const bosluk = ac.filter((a) => a.kenar === kenar).map((a) => [a.bas + 0.1, a.son + 0.1] as const).sort((a, b) => a[0] - b[0]);
      const parcalar: [number, number][] = [];
      let bas = 0;
      for (const [b0, b1] of bosluk) { parcalar.push([bas, b0]); bas = Math.max(bas, b1); }
      parcalar.push([bas, boy]);
      for (const [a, b] of parcalar) {
        if (b - a < 0.05) continue;
        const orta = (a + b) / 2 - boy / 2;
        ekle(ust, kutu(yatay ? b - a : 0.25, 0.9, yatay ? 0.25 : b - a), m.beton, yatay ? x + orta : x, 0.45, yatay ? z : z + orta, false);
      }
    };
    alcak(g + 0.2, 0, d / 2 + 0.12, true, 'on');
    alcak(d + 0.2, g / 2 + 0.12, 0, false, 'sag');

    // Kolonlar: duvar boyunca 8 m arayla, duvarın iç yüzünde; köşe kolonu duvarın içinde kalır.
    const adim = 8;
    const sira = (boy: number): number[] => {
      const n = Math.max(1, Math.round(boy / adim));
      return Array.from({ length: n + 1 }, (_, i) => -boy / 2 + 0.17 + ((boy - 0.34) * i) / n);
    };
    const KH = H + 0.2;
    const arkaZ = -d / 2 + 0.17;
    const onZ = d / 2 - 0.17;
    const solX = -g / 2 + 0.17;
    const sagX = g / 2 - 0.17;
    for (const x of sira(g)) {
      kolon(ust, m, KH, x, KH / 2, arkaZ);
      kolon(kabuk, m, KH, x, KH / 2, onZ);
      // Yangın tüpü kolonun iç flanşına asılı.
      if (x > -g / 2 + 1 && x < g / 2 - 1) ekle(ust, silindir(0.09, 0.09, 0.45, 16), m.kirmizi, x, 1.1, arkaZ + 0.17 + 0.09);
      // Makas: arka kolon başından mahyaya, mahyadan ön kolon başına.
      const L = Math.hypot(d / 2 - 0.17, 1.1);
      const egim = Math.atan2(1.1, d / 2 - 0.17);
      for (const yon of [-1, 1]) {
        const mk = ekle(kabuk, kutu(0.16, 0.46, L), m.kolon, x, KH + 0.55, (yon * (d / 2 - 0.17)) / 2, false);
        mk.rotation.x = yon * egim;
      }
    }
    for (const z of sira(d)) {
      kolon(ust, m, KH, solX, KH / 2, z, true);
      kolon(kabuk, m, KH, sagX, KH / 2, z, true);
    }
    // Duvar başlığı kirişleri (kolon başlarını bağlar).
    ekle(ust, kutu(g, 0.3, 0.2), m.kolon, 0, KH + 0.15, arkaZ, false);
    ekle(ust, kutu(0.2, 0.3, d), m.kolon, solX, KH + 0.15, 0, false);
    ekle(kabuk, kutu(g, 0.3, 0.2), m.kolon, 0, KH + 0.15, onZ, false);
    ekle(kabuk, kutu(0.2, 0.3, d), m.kolon, sagX, KH + 0.15, 0, false);
    // Mahya ve aşıklar makasların üstünde; tavan aşıkların üstünde.
    const tepe = KH + 1.1;
    ekle(kabuk, kutu(g, 0.2, 0.12), m.kolon, 0, tepe + 0.33, 0, false);
    for (const yon of [-1, 1]) ekle(kabuk, kutu(g, 0.16, 0.1), m.kolon, 0, KH + 0.55 + 0.31, (yon * (d / 2 - 0.17)) / 2, false);
    const tavan = ekle(kabuk, new PlaneGeometry(g + 0.4, d + 0.4), new MeshStandardMaterial({ color: this.palet.panel.clone(), roughness: 0.9, emissive: this.palet.kolon.clone(), emissiveIntensity: 0.55 }), 0, tepe + 0.45, 0, false);
    tavan.rotation.x = Math.PI / 2;
    // Sarkıt lambalar: aşıktan askı teliyle.
    for (const x of sira(g).slice(0, -1).map((v, i, dz) => v + ((dz[1] ?? v + adim) - v) / 2)) {
      for (const yon of [-1, 1]) {
        const z = (yon * (d / 2 - 0.17)) / 2;
        const ly = 6.6;
        const ask = KH + 0.55 + 0.23;
        ekle(kabuk, silindir(0.006, 0.006, ask - ly, 4), m.siyah, x, ly + (ask - ly) / 2, z, false);
        ekle(kabuk, silindir(0.12, 0.34, 0.28, 24), m.koyu, x, ly, z, false);
        ekle(kabuk, silindir(0.3, 0.3, 0.02, 24), m.lamba, x, ly - 0.15, z, false);
      }
    }
    // Kepenk önünde çarpma direkleri (forklift kapısı).
    const direk = (x: number, z: number) => ekle(ust, silindir(0.08, 0.08, 1.1, 16), m.sari, x, 0.55, z);
    for (const a of ac) {
      if (a.tur !== 'kepenk') continue;
      const orta = (a.bas + a.son) / 2;
      const yari = (a.son - a.bas) / 2 + 0.2;
      for (const yon of [-1, 1]) {
        if (a.kenar === 'arka') direk(orta - g / 2 + yon * yari, -d / 2 + 0.6);
        if (a.kenar === 'on') direk(orta - g / 2 + yon * yari, d / 2 - 0.6);
        if (a.kenar === 'sol') direk(-g / 2 + 0.6, orta - d / 2 + yon * yari);
        if (a.kenar === 'sag') direk(g / 2 - 0.6, orta - d / 2 + yon * yari);
      }
    }
    for (const kok of [ust, kabuk]) kok.traverse((o) => { if (o instanceof Mesh) o.castShadow = false; });
  }

  private kutuphaneKaynagi(m: IstasyonModeli): ModelKaynagi {
    return {
      anahtar: `model:${m.id}`, ad: m.ad, getir: () => this.olaylar.modelGetir(m),
      yerlesim: { birim: m.birim, yukari: m.yukari, donus: sayi(m.donus), sigdir: m.sigdir },
    };
  }

  // Merkez modelinin ayarı yoktur: birim ve yukarı eksen dosya türünden, model ayak izine sığdırılır.
  private merkezKaynagi(istasyonId: number, m: MerkezModeli): ModelKaynagi {
    return {
      anahtar: `merkez:${m.belgeId}:${m.ozet}`, ad: m.ad, getir: () => this.olaylar.merkezModelGetir(istasyonId, m),
      yerlesim: { ...varsayilanAyar(m.dosyaTuru), donus: 0, sigdir: true },
    };
  }

  // Kaynaklar sırayla denenir (kart #921: Çizim Merkezi, sonra kütüphane); hiçbiri açılmazsa tipten çizilen gövde kalır.
  private modelKoy(anahtar: string, kaynaklar: readonly ModelKaynagi[], kurulum: number, sahneler: Map<string, Promise<Object3D>>): void {
    const [model, ...kalan] = kaynaklar;
    if (!model) return;
    let sahne = sahneler.get(model.anahtar);
    if (!sahne) {
      sahne = model.getir().then((glb) => modelSahnesi(glb));
      sahneler.set(model.anahtar, sahne);
    }
    sahne.then((ham) => {
      this.kirli = true;
      const n = this.istasyonlar.get(anahtar);
      const m = this.malzeme;
      // Arada sahne yeniden kurulduysa (kayıt, salon değişimi) eski yükleme bırakılır.
      if (kurulum !== this.kurulumNo || !n || !m) return;
      const { kok, boyut } = modelYerlestir(ham.clone(true), model.yerlesim, model.yerlesim.sigdir ? n.olcu : null);
      this.temizle(n.govde);
      n.govde.add(kok);
      if (!n.aktif) kok.traverse((c) => { if (c instanceof Mesh) c.material = this.solukMalzeme(c.material as Material); });
      // Andon, ayak izinin arka sağ köşesinin hemen dışında zemine oturan kolonda (modelin köşesi boş olabilir);
      // etiket ve seçim kutusu modelin yüksekliğine göre.
      const ax = Math.max(n.olcu.g, boyut.x) / 2 + 0.15;
      const az = -Math.max(n.olcu.d, boyut.z) / 2 + 0.15;
      n.andon = andonKolonu(n.govde, this.palet, m, this.hale, ax, az, Math.min(2.6, Math.max(1.6, boyut.y)));
      n.ust = Math.max(boyut.y, n.andon.ust);
      n.anim = {};
      n.ekran = null;
      const kutu_ = this.secimKutulari.find((k) => k.userData.anahtar === anahtar);
      if (kutu_) {
        kutu_.geometry.dispose();
        kutu_.geometry = new BoxGeometry(Math.max(n.olcu.g, boyut.x), Math.max(0.3, n.ust), Math.max(n.olcu.d, boyut.z));
        kutu_.position.y = Math.max(0.3, n.ust) / 2;
      }
      const e = this.etiketler.find((x) => x.anahtar === anahtar);
      if (e) e.konum.y = n.ust + 0.35;
      this.durumlariUygula();
      this.etiketlerKirli = true;
      this.cizer.shadowMap.needsUpdate = true;
    }).catch(() => {
      if (kurulum !== this.kurulumNo) return;
      if (kalan.length > 0) this.modelKoy(anahtar, kalan, kurulum, sahneler);
      else this.olaylar.modelYuklenemedi(model.ad, 'istasyon');
    });
  }

  private solukMalzeme(m: Material): Material {
    const k = m.clone();
    k.transparent = true;
    k.opacity = 0.35;
    k.depthWrite = false;
    return k;
  }

  private duvarNesnesi(m: Malzemeler, p: Parca, cam: boolean, yukseklik: number, yerel: (x: number, z: number) => [number, number]): Group {
    const [ax, az] = yerel(p.bas[0], p.bas[1]);
    const [bx, bz] = yerel(p.son[0], p.son[1]);
    const boy = Math.hypot(bx - ax, bz - az);
    const grup = duvarParcasi(m, boy, cam, yukseklik);
    grup.position.set((ax + bx) / 2, 0, (az + bz) / 2);
    grup.rotation.y = -Math.atan2(bz - az, bx - ax);
    return grup;
  }

  // Görünmez seçim kutusu: tıklama ışını çizilmeyen nesneye de çarpar.
  private secimKutusu(ust: Object3D, anahtar: string, g: number, y: number, d: number): void {
    const m = new Mesh(new BoxGeometry(g, Math.max(0.3, y), d), new MeshBasicMaterial({ visible: false }));
    m.userData = { anahtar };
    m.position.y = Math.max(0.3, y) / 2;
    ust.add(m);
    this.secimKutulari.push(m);
  }

  private ortamIsigi(): void {
    const { g, d } = this.olcu;
    // Görünmez bir atölye odası: tavanda ışık şeritleri, duvarda pencere bandı. Metal ve cam yüzeylerde gerçek bir tavan yansır.
    const oda = new Scene();
    const en = g * 1.1;
    const boy = d * 1.25;
    const kutuOda = new Mesh(new BoxGeometry(en, 12, boy), new MeshBasicMaterial({ color: this.palet.ortam.clone(), side: BackSide }));
    kutuOda.position.y = 6;
    oda.add(kutuOda);
    const taban = new Mesh(new PlaneGeometry(en, boy), new MeshBasicMaterial({ color: this.palet.ortamZemin.clone() }));
    taban.rotation.x = -Math.PI / 2;
    taban.position.y = 0.02;
    oda.add(taban);
    const lamba = new MeshBasicMaterial({ color: this.palet.lamba.clone().multiplyScalar(4.2) });
    for (let i = -2; i <= 2; i++) {
      for (const j of [-1, 1]) {
        const l = new Mesh(new BoxGeometry(3, 0.1, 0.8), lamba);
        l.position.set((i * en) / 5.5, 11.8, (j * boy) / 5);
        oda.add(l);
      }
    }
    const gun = new MeshBasicMaterial({ color: this.palet.gun.clone().multiplyScalar(3.3) });
    const p1 = new Mesh(new BoxGeometry(en * 0.82, 1.6, 0.1), gun);
    p1.position.set(0, 7.5, -boy / 2 + 0.1);
    const p2 = new Mesh(new BoxGeometry(0.1, 1.6, boy * 0.8), gun);
    p2.position.set(-en / 2 + 0.1, 7.5, 0);
    oda.add(p1, p2);
    const pm = new PMREMGenerator(this.cizer);
    const eski = this.sahne.environment;
    this.sahne.environment = pm.fromScene(oda, 0.03).texture;
    eski?.dispose();
    pm.dispose();
    oda.traverse((o) => { if (o instanceof Mesh) { (o.geometry as BufferGeometry).dispose(); (o.material as Material).dispose(); } });

    // Güneş: salonun sol arka üstünden; gölge kutusu salonu kaplar.
    const kenar = Math.max(g, d) / 2 + 4;
    this.gunes.position.set(-g * 0.4, Math.max(g, d) * 0.75 + 8, d * 0.75);
    this.gunes.target.position.set(0, 0, 0);
    Object.assign(this.gunes.shadow.camera, { left: -kenar, right: kenar, top: kenar, bottom: -kenar, near: 1, far: Math.max(g, d) * 3 + 20 });
    this.gunes.shadow.camera.updateProjectionMatrix();
  }

  private etiketEkle(anahtar: string, metin: string, ikinci: string | null, sinif: string, konum: Vector3, durumlu = false): void {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `tc-sahne-etiket tc-sahne-etiket-ustte ${sinif}`;
    el.addEventListener('click', () => this.dokunus(anahtar));
    if (durumlu) {
      const nokta = document.createElement('i');
      nokta.setAttribute('aria-hidden', 'true');
      el.appendChild(nokta);
      el.dataset.durum = 'sirada';
    }
    const ad = document.createElement('b');
    ad.textContent = metin;
    el.appendChild(ad);
    let ek: HTMLElement | null = null;
    if (durumlu || ikinci) {
      ek = document.createElement('span');
      ek.textContent = ikinci ?? '';
      el.appendChild(ek);
    }
    el.dataset.anahtar = anahtar;
    this.etiketKatmani.appendChild(el);
    this.etiketler.push({ anahtar, el, konum, ek, boyut: null });
  }

  // ---------- canlı durum ve seçim ----------

  canliYaz(canli: ReadonlyMap<string, IstasyonCanli>): void {
    this.kirli = true;
    this.canli = new Map(canli);
    this.durumlariUygula();
  }

  private durumRengi(d: MakineDurumu) {
    return d === 'calisiyor' ? this.palet.calisiyor : d === 'durakli' ? this.palet.durakli : d === 'durdu' ? this.palet.durdu : this.palet.bekliyor;
  }

  private durumlariUygula(): void {
    for (const n of this.istasyonlar.values()) {
      n.canli = this.canli.get(n.anahtar) ?? (n.aktif ? BEKLIYOR : { ...BEKLIYOR, metin: 'Pasif' });
      (n.hale.material as MeshBasicMaterial).color.copy(this.durumRengi(n.canli.durum));
      this.ekranCiz(n);
    }
    for (const e of this.etiketler) {
      const n = this.istasyonlar.get(e.anahtar);
      if (!n) continue;
      e.el.dataset.durum = n.canli.durum;
      const metin = n.canli.durum === 'calisiyor' && n.canli.sayac ? n.canli.sayac : n.canli.metin;
      if (e.ek && e.ek.textContent !== metin) { e.ek.textContent = metin; e.boyut = null; e.kisaBoyut = null; this.etiketlerKirli = true; }
    }
  }

  // Makine paneli: durum bandı, istasyon kodu, emir, parça ve sayaç çubuğu. Yalnız içerik değişince çizilir.
  private ekranCiz(n: IstasyonNesnesi): void {
    const e = n.ekran;
    if (!e) return;
    const c = n.canli;
    const imza = [c.durum, c.metin, c.sayac, c.emirNo, c.parca, c.neden].join('|');
    if (e.imza === imza) return;
    e.imza = imza;
    const g = e.tuval.getContext('2d');
    if (!g) return;
    const p = this.palet.metin;
    const W = e.tuval.width;
    const H = e.tuval.height;
    const bant = c.durum === 'calisiyor' ? p.ekranCalisiyor : c.durum === 'durakli' ? p.ekranDurakli : c.durum === 'durdu' ? p.ekranDurdu : p.ekranBekliyor;
    g.fillStyle = p.ekran;
    g.fillRect(0, 0, W, H);
    g.fillStyle = bant;
    g.fillRect(0, 0, W, H * 0.2);
    g.fillStyle = p.ekran;
    g.font = `600 ${H * 0.13}px monospace`;
    g.textAlign = 'left';
    g.fillText(n.kod, 8, H * 0.15);
    g.textAlign = 'right';
    g.fillText(c.metin.toLocaleUpperCase('tr'), W - 8, H * 0.15);
    g.textAlign = 'left';
    g.font = `500 ${H * 0.1}px monospace`;
    g.fillStyle = p.ekranYazi;
    g.fillText(c.emirNo ?? 'Emir yok', 8, H * 0.36, W - 16);
    g.fillStyle = p.ekranSoluk;
    if (c.parca) g.fillText(c.parca, 8, H * 0.52, W - 16);
    if (c.sayac) g.fillText(`Sağlam ${c.sayac}`, 8, H * 0.68, W - 16);
    if (c.durum === 'durdu' && c.neden) {
      g.fillStyle = p.ekranAlarm;
      g.font = `600 ${H * 0.085}px sans-serif`;
      g.fillText(c.neden, 8, H * 0.68, W - 16);
    }
    if (c.oran !== null) {
      g.fillStyle = p.ekranCubuk;
      g.fillRect(8, H * 0.84, W - 16, H * 0.07);
      g.fillStyle = p.ekranIlerleme;
      g.fillRect(8, H * 0.84, (W - 16) * c.oran, H * 0.07);
    }
    e.doku.needsUpdate = true;
  }

  // Etiketler kapatılınca yalnız seçili öğenin ve bölümlerin adı kalır.
  etiketlerYaz(acik: boolean): void {
    this.kirli = true;
    if (this.etiketAcik === acik) return;
    this.etiketAcik = acik;
    this.etiketlerKirli = true;
  }

  secimYaz(anahtar: string | null): void {
    this.kirli = true;
    this.secili = anahtar;
    this.secimUygula();
  }

  private secimUygula(): void {
    for (const n of this.istasyonlar.values()) n.secim.visible = n.anahtar === this.secili;
    for (const e of this.etiketler) e.el.classList.toggle('tc-atolye-etiket-secili', e.anahtar === this.secili);
    this.etiketlerKirli = true;
  }

  // ---------- raf yükü ----------

  rafYukleriYaz(yukler: ReadonlyMap<number, readonly RafYuku[]>): void {
    this.kirli = true;
    this.yukler = new Map([...yukler].map(([k, v]) => [k, [...v]]));
    this.yukleriKur();
    if (this.odak) this.rafOdakYaz(this.odak.istek);
  }

  // Yalnız yükü değişen raf yeniden çizilir; her rafın yükü kendi içinde birleşir (az çizim çağrısı).
  private yukleriKur(): void {
    if (!this.malzeme) return;
    let degisti = false;
    for (const [id, yer] of this.rafYerleri) {
      const liste = this.yukler.get(id) ?? [];
      const imza = yukImzasi(liste);
      if (imza === yer.imza) continue;
      if (yer.grup) {
        yer.kap.remove(yer.grup);
        yer.grup.userData.atildi = true;
        this.temizle(yer.grup);
        yer.grup = null;
      }
      yer.imza = imza;
      degisti = true;
      if (liste.length === 0) continue;
      const eski = this.eskiYukler.get(this.yukAnahtari(id, imza, yer.olcu));
      if (eski) {
        this.eskiYukler.delete(this.yukAnahtari(id, imza, yer.olcu));
        yer.kap.add(eski);
        yer.grup = eski;
        for (const d of (eski.userData.diziler ?? []) as ModelDizisi[]) this.diziler.push({ d, kure: null });
        this.diziKirli = true;
        continue;
      }
      const grup = this.yukKur(yer.olcu, liste, () => grup.userData.atildi !== true && yer.grup === grup && yer.imza === imza);
      grup.position.set(yer.x, 0, yer.z);
      grup.rotation.y = (-yer.donus * Math.PI) / 180;
      yer.kap.add(grup);
      yer.grup = grup;
    }
    if (degisti) this.cizer.shadowMap.needsUpdate = true;
  }

  // Rafın yükü (raf yerel ekseninde, birleşik). Rafta model gösterimi: parçanın modeli inince gözdeki bölgeye gerçek
  // ölçüsüyle dizilir; o ana kadar grup değiştiyse (`gecerli` false) eklenmez.
  private yukKur(olcu: RafOlcusu, liste: readonly RafYuku[], gecerli: () => boolean): Group {
    const grup = new Group();
    const m = this.malzeme;
    if (!m) return grup;
    grup.add(rafYukleri(olcu, liste, m));
    birlestir(grup);
    for (const y of liste) {
      const model = y.model;
      const bolge = model && y.bicim === 'model' ? modelBolgesi(olcu, y) : null;
      if (!model || !bolge) continue;
      this.hamModel(model).then((ham) => {
        this.kirli = true;
        if (!gecerli()) return;
        const dizi = modelDizisi(ham.clone(true), { birim: model.birim, yukari: model.yukari, donus: sayi(model.donus) }, bolge, y.doluluk);
        grup.add(dizi.kok);
        ((grup.userData.diziler ??= []) as ModelDizisi[]).push(dizi);
        this.diziler.push({ d: dizi, kure: null });
        this.diziKirli = true;
        this.cizer.shadowMap.needsUpdate = true;
        // Bölme bakışında yük grubu bakış grubunun içindedir.
        if (!dizi.yatis.sigdi && this.odak && grup.parent === this.odak.grup) {
          this.odak.sigmayan.add(hucreAnahtari(y.bolme, y.kat, y.goz));
          this.odak.etiketImza = '';
          this.rafOdakYaz(this.odak.istek);
        }
      }).catch(() => this.olaylar.modelYuklenemedi(model.ad, 'parca'));
    }
    return grup;
  }

  // ---------- bölmeye karşıdan bakış ----------

  rafOdakYaz(istek: RafOdakIstegi | null): void {
    this.kirli = true;
    const r = istek ? this.bolumler.flatMap((b) => b.yerlesim.raflar).find((x) => x.id === istek.rafId) : undefined;
    const m = this.malzeme;
    if (!istek || !r || !m) { this.odakKapat(); return; }
    const olcu = rafOlcusu(r);
    const liste = r.aktif ? this.yukler.get(r.id) ?? [] : [];
    const imza = [this.kurulumNo, r.id, r.aktif, JSON.stringify(olcu), yukImzasi(liste)].join('#');
    let o = this.odak;
    const ilk = o === null;
    if (!o) {
      o = {
        istek, grup: new Group(), olcu, kutular: [], vurgu: null, etiketler: [], imza: '', etiketImza: '', sigmayan: new Set(),
        onceki: { p: this.kamera.position.clone(), t: this.kontrol.target.clone() },
      };
      this.odak = o;
      this.sahne.add(o.grup);
      this.kontrol.enabled = false;
      this.ucus = null;
    }
    const onceki = o.istek;
    o.istek = istek;
    this.odakGizle(true);

    if (o.imza !== imza) {
      this.odakVurgusuKaldir();
      this.temizle(o.grup);
      o.olcu = olcu;
      o.imza = imza;
      o.kutular = [];
      o.sigmayan = new Set();
      const govde = rafGovdesi(olcu, m);
      if (!r.aktif) govde.traverse((c) => { if (c instanceof Mesh) c.material = this.solukMalzeme(c.material as Material); });
      o.grup.add(govde);
      const boy = olcu.bolme * olcu.bolmeGenisligi;
      ekle(o.grup, kutu(boy + 6, 0.06, olcu.derinlik + 8), m.beton, 0, -0.03, 1.5, false);
      zeminIzi(o.grup, boy * 1.06, olcu.derinlik * 1.3, izMalzemesi(this.temas, this.palet.siyah, 0.7), 0.003);
      const grup = o.grup;
      if (liste.length > 0) o.grup.add(this.yukKur(olcu, liste, () => this.odak?.grup === grup && this.odak.imza === imza));
      // Her gözün görünmez seçim kutusu (başka bölmenin gözüne basınca oraya geçilir).
      for (let b = 1; b <= olcu.bolme; b++) {
        for (let k = 1; k <= olcu.kat; k++) {
          for (let g = 1; g <= olcu.goz; g++) {
            const c = gozCephesi(olcu, { bolme: b, kat: k, goz: g });
            if (!c) continue;
            const kutu_ = new Mesh(new BoxGeometry(Math.max(0.05, c.g - 0.02), Math.max(0.05, c.h - 0.02), olcu.derinlik), new MeshBasicMaterial({ visible: false }));
            kutu_.position.set(c.x, c.y + c.h / 2, 0);
            kutu_.userData = { bolme: b, kat: k, goz: g };
            o.grup.add(kutu_);
            o.kutular.push(kutu_);
          }
        }
      }
      o.etiketImza = '';
      this.cizer.shadowMap.needsUpdate = true;
    }

    // Göz etiketleri yalnız bakılan bölmede: baskın kalemin kodu ve doluluk.
    const bolmeEtiketleri: string[] = [];
    for (let k = 1; k <= olcu.kat; k++) {
      for (let g = 1; g <= olcu.goz; g++) {
        const e = istek.etiketler.get(hucreAnahtari(istek.bolme, k, g));
        bolmeEtiketleri.push(e ? `${e.kod}:${e.yuzde}` : '-');
      }
    }
    const etiketImza = `${imza}|${istek.bolme}|${bolmeEtiketleri.join(',')}`;
    if (o.etiketImza !== etiketImza) {
      for (const e of o.etiketler) e.el.remove();
      o.etiketler = [];
      o.etiketImza = etiketImza;
      for (let k = 1; k <= olcu.kat; k++) {
        for (let g = 1; g <= olcu.goz; g++) {
          const c = gozCephesi(olcu, { bolme: istek.bolme, kat: k, goz: g });
          if (!c) continue;
          const bilgi = istek.etiketler.get(hucreAnahtari(istek.bolme, k, g));
          const el = document.createElement('button');
          el.type = 'button';
          el.className = 'tc-sahne-etiket tc-atolye-goz-etiket';
          el.dataset.kademe = dolulukKademesi(bilgi?.yuzde ?? 0);
          el.setAttribute('aria-label', `Kat ${k} göz ${g}: ${bilgi ? `${bilgi.kod}, yüzde ${bilgi.yuzde}` : 'boş'}`);
          const ad = document.createElement('b');
          ad.textContent = bilgi ? bilgi.kod : `K${k}·G${g}`;
          const ek = document.createElement('span');
          const sigmiyor = o.sigmayan.has(hucreAnahtari(istek.bolme, k, g));
          ek.textContent = bilgi ? `%${bilgi.yuzde}${sigmiyor ? ' · sığmıyor' : ''}` : 'boş';
          if (sigmiyor) {
            el.dataset.sigmiyor = 'true';
            el.title = 'Parça modeli bu göze hiçbir duruşta sığmıyor; küçültülerek gösteriliyor.';
          }
          el.append(ad, ek);
          const bolme = istek.bolme;
          el.addEventListener('click', () => this.olaylar.gozSec({ rafId: r.id, bolme, kat: k, goz: g }));
          this.etiketKatmani.appendChild(el);
          const yZemin = olcu.tur === 'zemin' ? c.y + c.h : c.y + c.h - 0.04;
          const z = olcu.derinlik / 2 + 0.05;
          o.etiketler.push({ el, konum: new Vector3(c.x - c.g / 2 + 0.04, yZemin, z), sag: new Vector3(c.x + c.g / 2 - 0.04, yZemin, z) });
        }
      }
    }

    // Seçili gözün vurgusu: ön yüzde çerçeve ve hafif dolgu.
    this.odakVurgusuKaldir();
    const secili = istek.kat !== null && istek.goz !== null ? gozCephesi(olcu, { bolme: istek.bolme, kat: istek.kat, goz: istek.goz }) : null;
    for (const e of o.etiketler) e.el.classList.remove('tc-atolye-goz-etiket-secili');
    if (secili && istek.kat !== null && istek.goz !== null) {
      const v = new Group();
      const kenar = new LineSegments(new EdgesGeometry(new BoxGeometry(secili.g - 0.03, secili.h - 0.03, olcu.derinlik + 0.04)), new LineBasicMaterial({ color: this.palet.vurgu.clone(), toneMapped: false }));
      const dolgu = new Mesh(new PlaneGeometry(secili.g - 0.03, secili.h - 0.03), new MeshBasicMaterial({ color: this.palet.vurgu.clone(), transparent: true, opacity: 0.14, depthWrite: false, toneMapped: false }));
      dolgu.position.z = olcu.derinlik / 2 + 0.03;
      v.add(kenar, dolgu);
      v.position.set(secili.x, secili.y + secili.h / 2, 0);
      o.grup.add(v);
      o.vurgu = v;
      const sira = (istek.kat - 1) * olcu.goz + (istek.goz - 1);
      o.etiketler[sira]?.el.classList.add('tc-atolye-goz-etiket-secili');
    }

    const yerDegisti = ilk || onceki.rafId !== istek.rafId || onceki.bolme !== istek.bolme
      || onceki.ustBosluk !== istek.ustBosluk || onceki.sagBosluk !== istek.sagBosluk;
    if (ilk) {
      this.kamera.fov = ODAK_GORUSU;
      this.kamera.updateProjectionMatrix();
    }
    if (yerDegisti) this.odakCercevele(!ilk && onceki.rafId === istek.rafId);
    this.etiketlerKirli = true;
  }

  private odakVurgusuKaldir(): void {
    const v = this.odak?.vurgu;
    if (!v) return;
    v.removeFromParent();
    v.traverse((c) => {
      if (c instanceof Mesh || c instanceof LineSegments) {
        (c.geometry as BufferGeometry).dispose();
        (c.material as Material).dispose();
      }
    });
    if (this.odak) this.odak.vurgu = null;
  }

  // Salonun geri kalanı (yapı, yükler, rota, etiketler) bakış sürerken gizli.
  private odakGizle(gizli: boolean): void {
    this.diziKirli = true;
    this.yapi.visible = !gizli;
    this.yukGrubu.visible = !gizli;
    this.rotaGrubu.visible = !gizli;
    this.yuruyusIzi.visible = !gizli;
    for (const e of this.etiketler) e.el.classList.toggle('tc-atolye-etiket-odakta', gizli);
  }

  private odakKapat(): void {
    const o = this.odak;
    if (!o) return;
    this.odakVurgusuKaldir();
    for (const e of o.etiketler) e.el.remove();
    this.sahne.remove(o.grup);
    this.temizle(o.grup);
    this.odak = null;
    this.odakGizle(false);
    this.kontrol.enabled = !this.yuruyus.acik;
    this.kamera.fov = GORUS;
    this.kamera.updateProjectionMatrix();
    this.kamera.position.copy(o.onceki.p);
    this.kontrol.target.copy(o.onceki.t);
    this.ucus = null;
    this.etiketlerKirli = true;
  }

  // Kamera bölmenin önünde, bölmeye dik bakar; bölme (yanlarda komşudan biraz) arayüzün örtmediği alana sığar.
  private odakCercevele(ucarak: boolean): void {
    const o = this.odak;
    if (!o) return;
    const r = o.olcu;
    const { en, boy } = this.boyut;
    const kullanEn = Math.max(120, en - o.istek.sagBosluk);
    const kullanBoy = Math.max(120, boy - o.istek.ustBosluk);
    const tan = Math.tan((ODAK_GORUSU * Math.PI) / 360);
    const zemin = r.tur === 'zemin';
    const H = zemin ? 0.9 : r.yukseklik + 0.4;
    const x = -(r.bolme * r.bolmeGenisligi) / 2 + (o.istek.bolme - 0.5) * r.bolmeGenisligi;
    const yariH = (H / 2) * 1.08;
    const yariG = ((r.bolmeGenisligi + 0.7) / 2) * 1.04;
    const uzak = Math.max(yariH / (tan * (kullanBoy / boy)), yariG / (tan * (kullanEn / boy))) + r.derinlik / 2;
    // Örtülen kenarın yarısı kadar kaydırılır: bölme kalan alanın ortasında görünür.
    const birim = (2 * uzak * tan) / boy;
    const dx = (o.istek.sagBosluk / 2) * birim;
    const dy = (o.istek.ustBosluk / 2) * birim;
    const yMerkez = zemin ? 0.35 : H / 2 - 0.2;
    const t = new Vector3(x + dx, yMerkez + dy, 0);
    const p = zemin ? new Vector3(x + dx, yMerkez + dy + uzak * 0.5, uzak * 0.87) : new Vector3(x + dx, yMerkez + dy, uzak);
    this.kontrol.maxDistance = Math.max(this.kontrol.maxDistance, uzak * 1.5);
    if (!ucarak || azHareket()) {
      this.kamera.position.copy(p);
      this.kontrol.target.copy(t);
      this.ucus = null;
      this.kamera.lookAt(t);
      return;
    }
    this.ucus = { p, t };
  }

  // Parça ve malzeme modeli bir kez okunur; aynı model her yerde kopyalanır.
  private hamModel(model: IstasyonModeli): Promise<Object3D> {
    let ham = this.parcaSahneleri.get(model.id);
    if (!ham) {
      ham = this.olaylar.modelGetir(model).then((glb) => modelSahnesi(glb));
      this.parcaSahneleri.set(model.id, ham);
      ham.catch(() => this.parcaSahneleri.delete(model.id));
    }
    return ham;
  }

  // ---------- işlenen parça önizlemesi ----------

  parcalarYaz(parcalar: ReadonlyMap<number, ParcaModeli>): void {
    this.kirli = true;
    this.parcalar = new Map(parcalar);
    this.parcalariKur();
  }

  parcaGosterYaz(acik: boolean): void {
    this.kirli = true;
    this.parcaGoster = acik;
  }

  // Parça önizlemesinin dosyası ve yerleşimi: kütüphane modeli kendi ayarıyla, Çizim Merkezi modeli dosya türünün ayarıyla.
  private parcaKaynagi(p: ParcaModeli): { imza: string; sahne: () => Promise<Object3D>; yerlesim: { birim: IstasyonModeli['birim']; yukari: IstasyonModeli['yukari']; donus: number } } {
    if (p.kaynak === 'kutuphane') {
      const m = p.model;
      return { imza: ['model', m.id, m.birim, m.yukari, m.donus].join('|'), sahne: () => this.hamModel(m), yerlesim: { birim: m.birim, yukari: m.yukari, donus: sayi(m.donus) } };
    }
    const anahtar = `malzeme:${p.model.belgeId}:${p.model.ozet}`;
    return {
      imza: anahtar,
      sahne: () => {
        let ham = this.parcaSahneleri.get(anahtar);
        if (!ham) {
          ham = this.olaylar.malzemeModelGetir(p.malzemeNo, p.model).then((glb) => modelSahnesi(glb));
          this.parcaSahneleri.set(anahtar, ham);
          ham.catch(() => this.parcaSahneleri.delete(anahtar));
        }
        return ham;
      },
      yerlesim: { ...varsayilanAyar(p.model.dosyaTuru), donus: 0 },
    };
  }

  // Yalnız değişen istasyonun önizlemesi kurulur; model ya da ayarı değişince imza değişir.
  private parcalariKur(): void {
    const m = this.malzeme;
    if (!m) return;
    const kurulum = this.kurulumNo;
    for (const n of this.istasyonlar.values()) {
      const parca = n.canliId === null ? undefined : this.parcalar.get(n.canliId);
      const kaynak = parca ? this.parcaKaynagi(parca) : null;
      const imza = kaynak?.imza ?? '';
      if ((n.parca?.imza ?? '') === imza) continue;
      if (n.parca) {
        n.grup.remove(n.parca.kok);
        this.temizle(n.parca.kok);
        n.parca = null;
        const e = this.etiketler.find((x) => x.anahtar === n.anahtar);
        if (e) { e.konum.y = n.ust + 0.35; this.etiketlerKirli = true; }
      }
      if (!parca || !kaynak) continue;
      const anahtar = n.anahtar;
      kaynak.sahne().then((sahne) => {
        this.kirli = true;
        const hedef = this.istasyonlar.get(anahtar);
        const guncel = hedef?.canliId == null ? undefined : this.parcalar.get(hedef.canliId);
        // Arada sahne yeniden kurulduysa ya da istasyonun parçası değiştiyse bu yükleme bırakılır.
        if (kurulum !== this.kurulumNo || !hedef || hedef.parca || !guncel || this.parcaKaynagi(guncel).imza !== imza) return;
        const kok = new Group();
        const doner = parcaOnizlemesi(sahne.clone(true), kaynak.yerlesim, hedef.parcaKenari);
        const malzemeler: Material[] = [];
        doner.traverse((c) => {
          if (!(c instanceof Mesh)) return;
          const kopya = ([] as Material[]).concat(c.material as Material | Material[]).map((x) => x.clone());
          malzemeler.push(...kopya);
          c.material = kopya.length === 1 ? (kopya[0] as Material) : kopya;
        });
        kok.add(doner);
        // Altında hafif bir ışık halkası: önizlemenin havada asılı bir gösterim olduğu belli olur.
        zeminIzi(kok, hedef.parcaKenari * 1.1, hedef.parcaKenari * 1.1, izMalzemesi(this.hale, new Color(1, 1, 1), 0.22), -hedef.parcaKenari / 2 - 0.12, 1);
        kok.visible = false;
        hedef.grup.add(kok);
        hedef.parca = { imza, kok, doner, malzemeler };
      }).catch(() => {
        if (kurulum === this.kurulumNo) this.olaylar.modelYuklenemedi(parca.ad, 'parca');
      });
    }
  }

  izgaraYaz(acik: boolean): void {
    this.kirli = true;
    this.izgaraAcik = acik;
    for (const i of this.izgaralar) i.visible = acik;
  }

  // ---------- kamera ----------

  gorunum(gr: Gorunum, ucarak = true): void {
    this.kirli = true;
    const { g, d } = this.olcu;
    const kenar = Math.max(g, d);
    this.kontrol.maxDistance = kenar * 3;
    if (gr === 'kus') this.ucus_(new Vector3(0.01, kenar * 1.55, d * 0.21), new Vector3(0, 0, 0), ucarak);
    else this.ucus_(new Vector3(g * 0.625, kenar * 0.55, d * 1.29), new Vector3(-g * 0.025, 0, -d * 0.0625), ucarak);
  }

  // Bölüm noktasına yaklaş (bölüm verilmezse ilk bölüm).
  odakla(x: number, z: number, yakinlik = 1, salonId: number | null = null): void {
    this.kirli = true;
    this.cercevele(this.dunyaNoktasi(salonId, x, 0.5, z), 12 * yakinlik);
  }

  // Dar ekranda (dikey) aynı görüş için kamera geri çekilir.
  private ucus_(p: Vector3, t: Vector3, ucarak: boolean): void {
    let hedefP = p;
    if (this.kamera.aspect < 1) hedefP = t.clone().add(p.clone().sub(t).multiplyScalar(Math.min(2, 1.15 / this.kamera.aspect)));
    if (!ucarak || azHareket()) {
      this.kamera.position.copy(hedefP);
      this.kontrol.target.copy(t);
      this.ucus = null;
      return;
    }
    this.ucus = { p: hedefP, t };
  }

  // ---------- rota ----------

  // Rota bölüm noktalarıdır (sunucu bölüm içinde hesaplar).
  rotaYaz(noktalar: readonly { x: number; z: number }[] | null, salonId: number | null = null): void {
    this.kirli = true;
    this.temizle(this.rotaGrubu);
    if (!noktalar || noktalar.length < 2) return;
    const yol = noktalar.map((n) => this.dunyaNoktasi(salonId, n.x, 0, n.z).setY(0));
    const { geo } = serit(yol, 0.34);
    const m = new Mesh(geo, this.rotaMalzemesi);
    m.renderOrder = 4;
    this.rotaGrubu.add(m);
  }

  // ---------- yürüyüş ----------

  yuruyusYaz(acik: boolean): void {
    this.kirli = true;
    const yu = this.yuruyus;
    if (acik === yu.acik) return;
    yu.acik = acik;
    yu.tuslar.clear();
    yu.yol = [];
    this.temizle(this.yuruyusIzi);
    this.kontrol.enabled = !acik && !this.odak;
    this.kamera.near = acik ? 0.2 : 0.5;
    this.kamera.updateProjectionMatrix();
    if (acik) {
      // Yürüyüş haritada bakılan yerden başlar: kameranın baktığı nokta (en yakın serbest yer) ve kameranın yönü.
      // Yakında serbest yer yoksa giriş noktası olan ilk bölümün girişinden o bölümün ortasına bakılır.
      const { x: mx, z: mz } = this.merkez;
      const hedef = this.kontrol.target;
      const bakis = { x: hedef.x - this.kamera.position.x, z: hedef.z - this.kamera.position.z };
      const yatay = Math.hypot(bakis.x, bakis.z);
      const kus = yatay < 0.5;
      let [gx, gz] = this.serbestNokta(hedef.x + mx, hedef.z + mz);
      let yaw = kus ? yu.yaw : Math.atan2(-bakis.x, -bakis.z);
      if (!this.serbestMi(gx, gz)) {
        const b = this.kurulacak.find((o) => o.yerlesim.salon.giris) ?? this.kurulacak[0];
        const g = b ? sayi(b.yerlesim.salon.genislik) : this.olcu.g;
        const d = b ? sayi(b.yerlesim.salon.derinlik) : this.olcu.d;
        const gi = b?.yerlesim.salon.giris;
        const konum = b?.konum ?? { x: 0, z: 0, donus: 0 };
        const bas = fabrikayaCevir(konum, gi ? { x: sayi(gi.x), z: sayi(gi.z) } : { x: g / 2, z: d - 1 });
        const orta = fabrikayaCevir(konum, { x: g / 2, z: d / 2 });
        [gx, gz] = this.serbestNokta(bas.x, bas.z);
        yaw = Math.atan2(-(orta.x - gx), -(orta.z - gz));
      }
      this.kamera.position.set(gx - mx, GOZ_YUKSEKLIGI, gz - mz);
      yu.yaw = yaw;
      yu.pitch = -0.05;
      this.ucus = null;
      this.sahneEtkin = true;
      this.kamera.fov = YURUYUS_GORUSU;
      this.kamera.updateProjectionMatrix();
      this.cizer.domElement.focus();
    } else {
      this.gorunum('genel');
    }
  }

  private yuruyusYoluYaz(yol: { x: number; z: number }[]): void {
    this.yuruyus.yol = yol;
    this.temizle(this.yuruyusIzi);
    const son = yol.at(-1);
    if (!son) return;
    const { x: mx, z: mz } = this.merkez;
    const noktalar = [new Vector3(this.kamera.position.x, 0, this.kamera.position.z), ...yol.map((n) => new Vector3(n.x - mx, 0, n.z - mz))];
    const { geo } = serit(noktalar, 0.26);
    const mat = this.rotaMalzemesi.clone();
    mat.color.copy(this.palet.calisiyor);
    const m = new Mesh(geo, mat);
    m.renderOrder = 4;
    const halka = new Mesh(new RingGeometry(0.22, 0.38, 40), new MeshBasicMaterial({ color: this.palet.calisiyor.clone(), transparent: true, depthWrite: false, toneMapped: false, side: DoubleSide }));
    halka.rotation.x = -Math.PI / 2;
    halka.position.set(son.x - mx, 0.03, son.z - mz);
    halka.renderOrder = 5;
    this.yuruyusIzi.add(m, halka);
  }

  // Dokunmatik kol: -1..1 ileri ve yana.
  yuruyusKolu(ileri: number, yana: number): void {
    this.kirli = true;
    this.yuruyus.kol = { x: yana, y: ileri };
  }

  // Nokta fabrika metresidir (tek bölümde bölüm metresi). Bölümün içinde katı öğelere değmeden; bölümden bölüme ya da
  // dışarıya yalnız geçişten (duvar kalınlığı boyunca kuşak); dışarıda duvarlara değmeden.
  private serbestMi(x: number, z: number): boolean {
    const r = GOVDE_YARICAPI;
    for (const b of this.gecisliBolumler) {
      const p = bolumeCevir(b.konum, { x, z });
      if (p.x < r || p.z < r || p.x > b.g - r || p.z > b.d - r) continue;
      const e = this.yuruyus.engel.get(b.salonId);
      if (!e) return true;
      if (e.kutular.some((k) => icindeMi(k, p.x, p.z, r))) return false;
      return !e.parcalar.some((q) => parcayaUzaklik(p.x, p.z, q) < r + 0.06);
    }
    return this.kapiListesi.some((k) => {
      const b = this.gecisliBolumler.find((o) => o.salonId === k.bir);
      return b ? kapiKusagindaMi(k, bolumeCevir(b.konum, { x, z }), b.g, b.d, r, r + 0.45) : false;
    }) || distaSerbestMi(this.gecisliBolumler, { x, z });
  }

  // Fabrika noktasının bulunduğu bölüm.
  private bolumunu(p: Nokta2): GecisliBolum | undefined {
    return this.gecisliBolumler.find((b) => { const q = bolumeCevir(b.konum, p); return q.x >= 0 && q.z >= 0 && q.x <= b.g && q.z <= b.d; });
  }

  // Yürüyüşte iki fabrika noktası arası yol: bölümler (ve dışarısı) arası kapı sırası bulunur, her bölümün içindeki
  // parça sunucudan istenir (bölüm metresinde), dışarıdaki parça bölümlerin çevresinden dolaşır; kapıdan dik geçilir.
  // Yol yoksa null.
  private async yolBul(bas: Nokta2, hedef: Nokta2): Promise<Nokta2[] | null> {
    const kapiYolu = bolumYolu(this.kapiListesi, this.bolumunu(bas)?.salonId ?? DIS, this.bolumunu(hedef)?.salonId ?? DIS);
    if (!kapiYolu) return null;
    const ayaklar: { salonId: number; a: Nokta2; s: Nokta2 }[] = [];
    let simdi = bas;
    let salonId = this.bolumunu(bas)?.salonId ?? DIS;
    for (const k of kapiYolu) {
      const ileri: boolean = k.bir === salonId;
      ayaklar.push({ salonId, a: simdi, s: ileri ? k.birYani : k.ikiYani });
      simdi = ileri ? k.ikiYani : k.birYani;
      salonId = ileri ? k.iki : k.bir;
    }
    ayaklar.push({ salonId, a: simdi, s: hedef });
    const parcalar = await Promise.all(ayaklar.map(async ({ salonId: id, a, s }) => {
      if (id === DIS) return disYolu(this.gecisliBolumler, a, s);
      const o = this.gecisliBolumler.find((b) => b.salonId === id);
      if (!o) return null;
      const yol = await this.olaylar.rotaIste(o.salonId, bolumeCevir(o.konum, a), bolumeCevir(o.konum, s));
      return yol?.map((n) => fabrikayaCevir(o.konum, n)) ?? null;
    }));
    if (parcalar.some((p) => p === null)) return null;
    return parcalar.flatMap((p) => p ?? []);
  }

  private serbestNokta(x: number, z: number): [number, number] {
    if (this.serbestMi(x, z)) return [x, z];
    for (let r = 0.5; r < 20; r += 0.5) {
      for (let a = 0; a < Math.PI * 2; a += Math.PI / 8) {
        const nx = x + Math.cos(a) * r;
        const nz = z + Math.sin(a) * r;
        if (this.serbestMi(nx, nz)) return [nx, nz];
      }
    }
    return [x, z];
  }

  private yuruyusAdimi(dt: number): void {
    const yu = this.yuruyus;
    const { x: mx, z: mz } = this.merkez;
    const kos = yu.tuslar.has('Shift') ? 2 : 1;
    let ileri = (yu.tuslar.has('ArrowUp') || yu.tuslar.has('w') ? 1 : 0) - (yu.tuslar.has('ArrowDown') || yu.tuslar.has('s') ? 1 : 0) + yu.kol.y;
    const yana = (yu.tuslar.has('d') ? 1 : 0) - (yu.tuslar.has('a') ? 1 : 0) + yu.kol.x;
    const don = (yu.tuslar.has('ArrowLeft') ? 1 : 0) - (yu.tuslar.has('ArrowRight') ? 1 : 0);
    yu.yaw += don * dt * 1.8;
    const px = this.kamera.position.x + mx;
    const pz = this.kamera.position.z + mz;
    let hx = 0;
    let hz = 0;
    if (yu.yol.length > 0 && ileri === 0 && yana === 0) {
      const hedef = yu.yol[0];
      if (hedef) {
        const dx = hedef.x - px;
        const dz = hedef.z - pz;
        const l = Math.hypot(dx, dz);
        if (l < 0.25) {
          yu.yol.shift();
          if (yu.yol.length === 0) this.temizle(this.yuruyusIzi);
        }
        else {
          hx = dx / l;
          hz = dz / l;
          const istenen = Math.atan2(-hx, -hz);
          let fark = istenen - yu.yaw;
          while (fark > Math.PI) fark -= Math.PI * 2;
          while (fark < -Math.PI) fark += Math.PI * 2;
          yu.yaw += fark * Math.min(1, dt * 5);
          ileri = 0;
        }
      }
    } else if (ileri !== 0 || yana !== 0) {
      if (yu.yol.length) this.temizle(this.yuruyusIzi);
      yu.yol = [];
      const fx = -Math.sin(yu.yaw);
      const fz = -Math.cos(yu.yaw);
      hx = fx * ileri + -fz * -yana;
      hz = fz * ileri + fx * -yana;
      const l = Math.hypot(hx, hz);
      if (l > 1) { hx /= l; hz /= l; }
    }
    const adim = YURUME_HIZI * kos * dt;
    const nx = px + hx * adim;
    const nz = pz + hz * adim;
    // Duvara çarpınca kayar: önce iki eksen birden, olmazsa tek tek.
    if (this.serbestMi(nx, nz)) this.kamera.position.set(nx - mx, GOZ_YUKSEKLIGI, nz - mz);
    else if (this.serbestMi(nx, pz)) this.kamera.position.x = nx - mx;
    else if (this.serbestMi(px, nz)) this.kamera.position.z = nz - mz;
    const bak = new Vector3(
      this.kamera.position.x - Math.sin(yu.yaw) * Math.cos(yu.pitch),
      GOZ_YUKSEKLIGI + Math.sin(yu.pitch),
      this.kamera.position.z - Math.cos(yu.yaw) * Math.cos(yu.pitch),
    );
    this.kamera.lookAt(bak);
    // Yakındaki istasyon adı ekranda gösterilir.
    let yakin: string | null = null;
    let enYakin = 3.5;
    for (const n of this.istasyonlar.values()) {
      const u = n.grup.getWorldPosition(new Vector3()).distanceTo(new Vector3(this.kamera.position.x, 0, this.kamera.position.z));
      if (u < enYakin) { enYakin = u; yakin = n.anahtar; }
    }
    this.olaylar.yuruyusDurumu({ yakin });
  }

  // ---------- olaylar ----------

  private olaylariBagla(): void {
    const tuval = this.cizer.domElement;
    tuval.tabIndex = 0;
    const bagla = <K extends keyof HTMLElementEventMap>(hedef: HTMLElement | Window, ad: K, f: (o: HTMLElementEventMap[K]) => void) => {
      hedef.addEventListener(ad, f as EventListener);
      this.olaySokuculer.push(() => hedef.removeEventListener(ad, f as EventListener));
    };
    bagla(tuval, 'pointerdown', (o) => { this.sonEtkinlik = performance.now(); this.suruklenme = { x: o.clientX, y: o.clientY, hareket: 0 }; });
    bagla(tuval, 'wheel', () => { this.sonEtkinlik = performance.now(); });
    bagla(tuval, 'pointermove', (o) => {
      const s = this.suruklenme;
      if (!s) return;
      s.hareket += Math.abs(o.movementX) + Math.abs(o.movementY);
      if (this.yuruyus.acik && o.buttons > 0) {
        this.yuruyus.yaw -= o.movementX * 0.004;
        this.yuruyus.pitch = Math.max(-1.2, Math.min(1.2, this.yuruyus.pitch - o.movementY * 0.004));
      }
    });
    bagla(tuval, 'pointerup', (o) => {
      const s = this.suruklenme;
      this.suruklenme = null;
      if (!s || s.hareket > 6) return;
      this.tikla(o.clientX, o.clientY);
    });
    // Haritaya (sahne, araç çubuğu, liste) dokunulunca klavye etkinleşir, haritanın dışına dokunulunca bırakılır.
    const kok = this.kap.closest('.tc-atolye') ?? this.kap.parentElement ?? this.kap;
    const belgeDokunus = (o: PointerEvent) => { this.sahneEtkin = kok.contains(o.target as Node); };
    document.addEventListener('pointerdown', belgeDokunus, true);
    this.olaySokuculer.push(() => document.removeEventListener('pointerdown', belgeDokunus, true));
    // Yazı tipi geç yüklenince etiketler genişler: ölçüler baştan alınır, yoksa eski dar ölçüyle üst üste binerler.
    const yaziYuklendi = () => {
      for (const e of this.etiketler) { e.boyut = null; e.kisaBoyut = null; }
      this.etiketlerKirli = true;
      this.kirli = true;
    };
    document.fonts?.addEventListener('loadingdone', yaziYuklendi);
    this.olaySokuculer.push(() => document.fonts?.removeEventListener('loadingdone', yaziYuklendi));
    const TUSLAR = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'q', 'e', '+', '=', '-', 'PageUp', 'PageDown', 'Shift', 'Home'];
    bagla(window, 'keydown', (o) => {
      const t = o.key.length === 1 ? o.key.toLowerCase() : o.key;
      if (!TUSLAR.includes(t) || o.ctrlKey || o.metaKey || o.altKey || !this.klavyeEtkin(o)) return;
      o.preventDefault();
      if (t === 'Home' && !this.yuruyus.acik) { this.gorunum('genel'); return; }
      this.yuruyus.tuslar.add(t);
    });
    bagla(window, 'keyup', (o) => {
      const t = o.key.length === 1 ? o.key.toLowerCase() : o.key;
      this.yuruyus.tuslar.delete(t);
      if (t === 'Shift') this.yuruyus.tuslar.delete('Shift');
    });
    bagla(window, 'blur', () => this.yuruyus.tuslar.clear());
  }

  private tikla(cx: number, cy: number): void {
    const kutu_ = this.cizer.domElement.getBoundingClientRect();
    const n = new Vector2(((cx - kutu_.left) / kutu_.width) * 2 - 1, -((cy - kutu_.top) / kutu_.height) * 2 + 1);
    this.isinci.setFromCamera(n, this.kamera);
    const o = this.odak;
    if (o) {
      const v = this.isinci.intersectObjects(o.kutular, false)[0];
      const d = v?.object.userData as { bolme: number; kat: number; goz: number } | undefined;
      if (d) this.olaylar.gozSec({ rafId: o.istek.rafId, bolme: d.bolme, kat: d.kat, goz: d.goz });
      return;
    }
    if (this.yuruyus.acik) {
      const nokta = new Vector3();
      if (!this.isinci.ray.intersectPlane(new Plane(new Vector3(0, 1, 0), 0), nokta)) return;
      const { x: mx, z: mz } = this.merkez;
      const bas = { x: this.kamera.position.x + mx, z: this.kamera.position.z + mz };
      void this.yolBul(bas, { x: nokta.x + mx, z: nokta.z + mz }).then((yol) => {
        if (this.yuruyus.acik && yol) this.yuruyusYoluYaz(yol.slice(1));
      });
      return;
    }
    const vurus = this.isinci.intersectObjects(this.secimKutulari, false)[0];
    this.dokunus(vurus ? String(vurus.object.userData.anahtar) : null);
  }

  // Tek dokunuş seçer; aynı öğeye 450 ms içinde ikinci dokunuş oraya götürür (fare çift tık, dokunmatik çift dokunuş).
  private dokunus(anahtar: string | null): void {
    const simdi = performance.now();
    const cift = anahtar !== null && this.sonDokunus?.anahtar === anahtar && simdi - this.sonDokunus.zaman < 450;
    this.sonDokunus = anahtar === null || cift ? null : { anahtar, zaman: simdi };
    this.olaylar.sec(anahtar);
    if (cift && anahtar) this.git(anahtar);
  }

  // Öğeye git: kamera bakış yönünü koruyarak öğeyi çerçeveler; yürüyüşte öğenin yanına yürür.
  git(anahtar: string): void {
    this.kirli = true;
    if (this.odak) return;
    const kutu_ = this.secimKutulari.find((k) => k.userData.anahtar === anahtar);
    if (!kutu_) return;
    const b = new Box3().setFromObject(kutu_);
    const c = b.getCenter(new Vector3());
    const o = b.getSize(new Vector3());
    if (this.yuruyus.acik) {
      const { x: mx, z: mz } = this.merkez;
      const bas = { x: this.kamera.position.x + mx, z: this.kamera.position.z + mz };
      void this.yolBul(bas, { x: c.x + mx, z: c.z + mz }).then((yol) => {
        if (this.yuruyus.acik && yol) this.yuruyusYoluYaz(yol.slice(1));
      });
      return;
    }
    // Seçilen makinede işlenen parça önizlemesi görünür: çerçeve onu da kapsar.
    const n = this.istasyonlar.get(anahtar);
    const boy = n?.parca ? n.ust + 0.9 + n.parcaKenari * 1.1 : o.y;
    const uzaklik = Math.min(28, Math.max(6, Math.max(o.x, o.z, boy * 1.5) * 2.2 + 3));
    this.cercevele(new Vector3(c.x, n?.parca ? boy * 0.45 : Math.min(1.2, o.y * 0.35), c.z), uzaklik);
  }

  private cercevele(hedef: Vector3, uzaklik: number): void {
    const fark = this.kamera.position.clone().sub(this.kontrol.target);
    const yatay = new Vector3(fark.x, 0, fark.z);
    if (yatay.lengthSq() < 1e-4) yatay.set(0.55, 0, 0.85);
    yatay.normalize();
    const yukseklik = 0.62;
    const p = hedef.clone().add(yatay.multiplyScalar(uzaklik * Math.cos(yukseklik))).add(new Vector3(0, uzaklik * Math.sin(yukseklik), 0));
    this.ucus_(p, hedef, true);
  }

  // Kamera hedefi salonun biraz dışına kadar gider; harita elden kaçmaz.
  private hedefiSinirla(): void {
    const { g, d } = this.olcu;
    const t = this.kontrol.target;
    const x = Math.max(-g / 2 - 3, Math.min(g / 2 + 3, t.x));
    const z = Math.max(-d / 2 - 3, Math.min(d / 2 + 3, t.z));
    if (x !== t.x || z !== t.z) {
      const fark = new Vector3(x - t.x, 0, z - t.z);
      t.add(fark);
      this.kamera.position.add(fark);
    }
  }

  // Klavyeyle gezinme (genel bakışta): oklar ve WASD kaydırır, Q/E döndürür, + / − ve PageUp/PageDown yaklaştırır,
  // Shift hızlandırır, Home genel görünüme döner.
  private klavyeGez(dt: number): void {
    const t = this.yuruyus.tuslar;
    if (t.size === 0) return;
    const var_ = (...a: string[]) => (a.some((k) => t.has(k)) ? 1 : 0);
    const ileri = var_('ArrowUp', 'w') - var_('ArrowDown', 's');
    const yana = var_('ArrowRight', 'd') - var_('ArrowLeft', 'a');
    const don = var_('e') - var_('q');
    const yakin = var_('+', '=', 'PageUp') - var_('-', 'PageDown');
    if (!ileri && !yana && !don && !yakin) return;
    this.ucus = null;
    const hizli = t.has('Shift') ? 2.4 : 1;
    let fark = this.kamera.position.clone().sub(this.kontrol.target);
    const uzak = fark.length();
    const on = new Vector3(-fark.x, 0, -fark.z);
    if (on.lengthSq() < 1e-6) on.set(0, 0, -1);
    on.normalize();
    const sag = new Vector3(-on.z, 0, on.x);
    const v = Math.max(3, uzak * 0.75) * dt * hizli;
    const kay = on.multiplyScalar(ileri * v).add(sag.multiplyScalar(yana * v));
    this.kontrol.target.add(kay);
    this.kamera.position.add(kay);
    if (don) {
      fark.applyAxisAngle(new Vector3(0, 1, 0), don * dt * 1.3 * hizli);
      this.kamera.position.copy(this.kontrol.target).add(fark);
    }
    if (yakin) {
      fark = this.kamera.position.clone().sub(this.kontrol.target);
      fark.setLength(Math.min(this.kontrol.maxDistance, Math.max(this.kontrol.minDistance, fark.length() * Math.exp(-yakin * dt * 1.4 * hizli))));
      this.kamera.position.copy(this.kontrol.target).add(fark);
    }
    this.hedefiSinirla();
  }

  private klavyeEtkin(o: KeyboardEvent): boolean {
    const h = o.target as HTMLElement | null;
    if (h && (h.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(h.tagName))) return false;
    if (document.querySelector('[aria-modal="true"]')) return false;
    const kok = this.kap.closest('.tc-atolye') ?? this.kap.parentElement ?? this.kap;
    return this.sahneEtkin || kok.contains(document.activeElement);
  }

  boyutla(): void {
    this.kirli = true;
    // Sahne gizliyken (başka sekme) çizici küçültülmez ve çizim durur; görünür olunca eski ölçüden devam eder.
    this.gizli = this.kap.clientWidth === 0 || this.kap.clientHeight === 0;
    if (this.gizli) return;
    const en = this.kap.clientWidth;
    const boy = this.kap.clientHeight;
    this.boyut = { en, boy };
    this.cizer.setSize(en, boy, false);
    this.kamera.aspect = en / boy;
    this.kamera.updateProjectionMatrix();
    this.etiketlerKirli = true;
    if (this.odak) this.odakCercevele(false);
  }

  // ---------- döngü ----------

  // Tam hızdaki kare aralığı 2 sn boyunca ölçülür. Ortalama 28 ms'den uzunsa (35 karenin altı) piksel oranı 0,25 düşer
  // (en az 0,75); üç ölçüm üst üste 18 ms'den kısaysa 0,25 çıkar (en çok cihazın oranı). Yavaş ekran kartında ve 4K
  // atölye ekranında takılmayı keser; hızlı kartta görüntü kalitesi değişmez.
  private hizUyarla(t: number, olc: boolean): void {
    const h = this.hizOlcumu;
    // Oran yalnız kamera dururken değişir: hareket ederken çözünürlüğün değişmesi parlama gibi görünür.
    if (!olc) {
      h.bas = 0;
      h.kare = 0;
      if (h.bekleyen && h.bekleyen !== this.pikselOrani && t - this.sonEtkinlik >= ETKIN_SURE_MS) {
        this.pikselOrani = h.bekleyen;
        this.cizer.setPixelRatio(h.bekleyen);
        this.cizer.setSize(this.boyut.en, this.boyut.boy, false);
        h.bekleyen = 0;
      }
      return;
    }
    if (h.bas === 0) { h.bas = t; h.kare = 0; return; }
    h.kare++;
    const gecen = t - h.bas;
    if (gecen < 2000) return;
    const ort = gecen / Math.max(1, h.kare);
    h.bas = t;
    h.kare = 0;
    const simdiki = h.bekleyen || this.pikselOrani;
    let yeni = simdiki;
    // Bir kez düşen oran oturum boyunca geri çıkmaz (düş-çık döngüsü ekranda yanıp sönme yapar).
    if (ort > 28) { yeni = Math.max(EN_AZ_PIKSEL_ORANI, simdiki - 0.25); h.iyi = 0; h.dustu = true; } else if (ort < 18 && !h.dustu) {
      h.iyi++;
      if (h.iyi >= 3) { yeni = Math.min(this.enCokPikselOrani, simdiki + 0.25); h.iyi = 0; }
    } else h.iyi = 0;
    if (yeni !== simdiki) h.bekleyen = yeni;
  }

  private dongu(t: number): void {
    this.kare = requestAnimationFrame((s) => this.dongu(s));
    if (document.hidden || this.gizli) return;
    const etkin = this.ucus !== null || this.yuruyus.acik || this.yuruyus.tuslar.size > 0 || this.suruklenme !== null || t - this.sonEtkinlik < ETKIN_SURE_MS;
    const aralik = kareAraligi({ etkin, kirli: this.kirli, ...this.kipirti, enAzKareMs: this.enAzKareMs });
    // rAF zamanı ekran tazelemesine bağlıdır: aralığın biraz altı kabul edilir (60 Hz'de 30 kare için 2 tazelemede bir).
    if (aralik && t - this.sonZaman < aralik - 4) return;
    this.kirli = false;
    this.hizUyarla(t, etkin && aralik === 0);
    const kipirti = { gecis: false, hareket: false, yanip: false };
    const dt = Math.max(0, Math.min(0.1, (t - this.sonZaman) / 1000));
    this.sonZaman = t;
    const hareketsiz = azHareket();
    if (!hareketsiz) this.zaman += dt;
    const T = this.zaman;

    const yanip = (Math.sin(t / 170) + 1) / 2;
    for (const n of this.istasyonlar.values()) {
      const durum = n.canli.durum;
      if (durum === 'durdu') kipirti.yanip = true;
      for (const ad of ANDON_DURUMLARI) {
        const dilim = n.andon[ad];
        const k = durum === ad ? (ad === 'durdu' ? 0.25 + yanip * 0.75 : 1) : 0;
        dilim.mat.emissiveIntensity = k * 2.6;
        dilim.hale.material.opacity = k * 0.85;
      }
      const hale = n.hale.material as MeshBasicMaterial;
      hale.opacity = durum === 'durdu' ? 0.12 + yanip * 0.3 : durum === 'sirada' ? 0.1 : 0.2;
      const a = n.anim;
      const calis = durum === 'calisiyor' && !hareketsiz;
      if (calis && (a.kafa || a.besik || a.ayna || a.portal || a.kopru || a.fan)) kipirti.hareket = true;
      if (a.kafa && a.kafaY !== undefined && calis) a.kafa.position.y = a.kafaY + Math.sin(T * 2.2) * 0.05;
      if (a.besik && calis) a.besik.rotation.x = Math.sin(T * 0.6) * 0.35;
      if (a.ayna && calis) a.ayna.rotation.x += dt * 18;
      if (a.portal && a.lazerKafa) {
        if (calis) {
          a.portal.userData.x0 ??= a.portal.position.x;
          a.portal.position.x = (a.portal.userData.x0 as number) + Math.sin(T * 0.55) * 0.9;
          a.lazerKafa.position.z = Math.sin(T * 1.7) * 0.6;
        }
        const yan = calis ? 0.7 + Math.random() * 0.6 : 0;
        if (a.kivilcim) a.kivilcim.intensity = yan * 2.2 * Math.PI;
        if (a.kivilcimHale) a.kivilcimHale.material.opacity = yan * 0.9;
      }
      if (a.kopru && a.araba && a.mil && calis) {
        a.kopru.userData.z0 ??= a.kopru.position.z;
        a.kopru.position.z = (a.kopru.userData.z0 as number) + Math.sin(T * 0.45) * 0.35;
        a.araba.position.x = 0.1 + Math.sin(T * 0.7) * 0.3;
        a.mil.position.y = Math.max(0, Math.sin(T * 1.3)) * 0.08;
      }
      if (a.fan && calis) a.fan.rotation.y += dt * 8;
      const p = n.parca;
      if (p) {
        const gorunur = this.parcaGoster || this.secili === n.anahtar;
        p.kok.visible = gorunur;
        // Önizleme görünürken etiket parçanın üstüne çıkar (etiket parçayı örtmez).
        const etiketY = gorunur ? n.ust + 0.9 + n.parcaKenari * 1.1 : n.ust + 0.35;
        const e = n.etiket;
        if (e && Math.abs(e.konum.y - etiketY) > 1e-3) { e.konum.y = etiketY; this.etiketlerKirli = true; }
        if (gorunur) {
          p.kok.position.y = n.ust + 0.9 + n.parcaKenari / 2;
          if (!hareketsiz) { p.doner.rotation.y += dt * 0.5; kipirti.hareket = true; }
          // Çalışmayan makinedeki parça soluk: işlenmekte olan parça tam görünür.
          const soluk = durum !== 'calisiyor';
          for (const mm of p.malzemeler) {
            if (mm.transparent === soluk) continue;
            mm.transparent = soluk;
            mm.opacity = soluk ? 0.55 : 1;
            mm.depthWrite = !soluk;
            mm.needsUpdate = true;
          }
        }
      }
      // Duraklatılmış makinede kapı açılır (ayar, parça bağlama).
      if (a.kapilar) {
        const ac = durum === 'durakli' ? 1 : 0;
        for (const k of a.kapilar) {
          const hedef = k.kapali + (k.acik - k.kapali) * ac;
          k.nesne.position.x += (hedef - k.nesne.position.x) * Math.min(1, dt * 3);
          if (Math.abs(hedef - k.nesne.position.x) > 1e-3) kipirti.gecis = true;
        }
      }
    }
    // Ok dokusu yalnız rota ve yürüyüş izinde görünür; ikisi de yoksa akması için kare çizilmez.
    if (!hareketsiz && (this.rotaGrubu.children.length > 0 || this.yuruyusIzi.children.length > 0)) {
      this.ok.offset.x -= dt * 0.9;
      kipirti.hareket = true;
    }

    if (this.yuruyus.acik) {
      this.yuruyusAdimi(dt);
    } else {
      const gorus = this.odak ? ODAK_GORUSU : GORUS;
      if (this.kamera.fov !== gorus) {
        this.kamera.fov += (gorus - this.kamera.fov) * Math.min(1, dt * 3.2);
        if (Math.abs(this.kamera.fov - gorus) < 0.03) this.kamera.fov = gorus;
        else kipirti.gecis = true;
        this.kamera.updateProjectionMatrix();
      }
      if (!this.odak) this.klavyeGez(dt);
      if (this.ucus) {
        const k = hareketsiz ? 1 : 1 - Math.exp(-dt * 3.2);
        this.kamera.position.lerp(this.ucus.p, k);
        this.kontrol.target.lerp(this.ucus.t, k);
        if (this.kamera.position.distanceTo(this.ucus.p) < 0.01) {
          this.kamera.position.copy(this.ucus.p);
          this.kontrol.target.copy(this.ucus.t);
          this.ucus = null;
        }
      }
      // Bakışta kamera elle döndürülmez: hep bölmeye dik.
      if (this.odak) this.kamera.lookAt(this.kontrol.target);
      else this.kontrol.update();
    }

    for (const kb of this.kabuklar) kb.visible = this.yuruyus.acik;
    this.kameraIzle(t);
    this.ayrintiSec(t);
    this.cizer.render(this.sahne, this.kamera);
    if (this.atilacak.length > 0) {
      for (const a of this.atilacak) a.dispose();
      this.atilacak = [];
    }
    this.etiketleriYerlestir();
    this.kipirti = kipirti;
  }

  // Kameraya en yakın, görüş alanındaki model dizileri ayrıntılı çizilir; üçgen bütçesi dolunca ya da uzakta vekil
  // kutu. Kamera durunca saniyede bir, hareket ederken en çok 8 kez bakılır.
  private ayrintiSec(t: number): void {
    if (this.diziler.length === 0) return;
    this.kamera.updateMatrixWorld();
    const m = this.geciciMatris.multiplyMatrices(this.kamera.projectionMatrix, this.kamera.matrixWorldInverse);
    const oynadi = !m.equals(this.diziKamerasi);
    const gecen = t - this.diziZamani;
    if (!this.diziKirli && !(oynadi && gecen > 120) && gecen < 1000) return;
    this.diziZamani = t;
    this.diziKirli = false;
    this.diziKamerasi.copy(m);
    const gorus = new Frustum().setFromProjectionMatrix(m);
    const sahnede = (o: Object3D): 'yok' | 'gizli' | 'gorunur' => {
      let gorunur = true;
      let a: Object3D | null = o;
      while (a) {
        if (!a.visible && a !== o) gorunur = false;
        if (a === this.sahne) return gorunur ? 'gorunur' : 'gizli';
        a = a.parent;
      }
      return 'yok';
    };
    const adaylar: { e: DiziKaydi; pay: number }[] = [];
    const egim = Math.tan((this.kamera.fov * Math.PI) / 360);
    this.diziler = this.diziler.filter((e) => {
      const durum = sahnede(e.d.kok);
      if (durum === 'yok') return false;
      const onceAyrintili = e.d.ayrinti.visible;
      e.d.ayrinti.visible = false;
      e.d.vekil.visible = true;
      if (durum === 'gizli') return true;
      if (!e.kure) {
        e.d.vekil.updateWorldMatrix(true, false);
        const k = e.d.vekil.boundingSphere;
        if (!k) return true;
        e.kure = k.clone().applyMatrix4(e.d.vekil.matrixWorld);
      }
      if (!gorus.intersectsSphere(e.kure)) return true;
      // Ekrandaki büyüklük (yarım ekran yüksekliğine oran): uzaklık ve görüş açısı birlikte; dar açılı bölme bakışında
      // kamera uzakta durur ama göz ekranı doldurur.
      const uzak = Math.max(0.1, this.kamera.position.distanceTo(e.kure.center));
      // Eşikte gidip gelmesin: ayrıntılı olan biraz daha uzağa kadar ayrıntılı kalır (kutu ↔ model yanıp sönmez).
      const pay = (e.kure.radius / (uzak * egim)) * (onceAyrintili ? 1.35 : 1);
      if (pay >= AYRINTI_EKRAN_PAYI) adaylar.push({ e, pay });
      return true;
    });
    adaylar.sort((a, b) => b.pay - a.pay);
    // Bölme bakışında sahnenin geri kalanı gizli: bütçe iki katı.
    let butce = (kaba() ? AYRINTI_UCGEN / 3 : AYRINTI_UCGEN) * (this.odak ? 2 : 1);
    for (const { e } of adaylar) {
      if (e.d.ucgen > butce) continue;
      butce -= e.d.ucgen;
      e.d.ayrinti.visible = true;
      e.d.vekil.visible = false;
    }
  }

  private readonly geciciMatris = new Matrix4();
  private readonly gecici = new Vector3();
  // Etiketler ekrana izdüşürülür; çakışan etiket yukarı kaydırılır (seçili, sonra istasyon önceliklidir).
  private etiketleriYerlestir(): void {
    this.kamera.updateMatrixWorld();
    const imza = this.geciciMatris.multiplyMatrices(this.kamera.projectionMatrix, this.kamera.matrixWorldInverse);
    const oynadi = !imza.equals(this.sonKamera);
    if (!this.etiketlerKirli && !oynadi) {
      // Kamera durdu: çakışma kararı bir kez baştan verilir (hareket sürerken etiketler açılıp kapanmaz).
      if (!this.etiketKarariBekliyor || performance.now() - this.sonKameraHareketi < 200) return;
      this.etiketKarariBekliyor = false;
    }
    const hareketli = oynadi && !this.etiketlerKirli;
    if (oynadi) { this.sonKameraHareketi = performance.now(); this.etiketKarariBekliyor = true; }
    this.sonKamera.copy(imza);
    this.etiketlerKirli = false;
    const { en, boy } = this.boyut;
    if (this.odak) {
      for (const e of this.odak.etiketler) {
        this.gecici.copy(e.konum).project(this.kamera);
        const gorunur = this.gecici.z < 1 && Math.abs(this.gecici.x) < 1.05 && Math.abs(this.gecici.y) < 1.05;
        e.el.classList.toggle('tc-atolye-etiket-gizli', !gorunur);
        const x0 = ((this.gecici.x + 1) / 2) * en;
        e.el.style.setProperty('--x', `${x0.toFixed(1)}px`);
        e.el.style.setProperty('--y', `${(((1 - this.gecici.y) / 2) * boy).toFixed(1)}px`);
        this.gecici.copy(e.sag).project(this.kamera);
        e.el.style.setProperty('--g', `${Math.max(28, ((this.gecici.x + 1) / 2) * en - x0).toFixed(1)}px`);
      }
      return;
    }
    const yerlesecek: { e: Etiket; x: number; y: number; oncelik: number }[] = [];
    for (const e of this.etiketler) {
      this.gecici.copy(e.konum).project(this.kamera);
      const tur = e.anahtar.slice(0, e.anahtar.indexOf(':'));
      const secili = e.anahtar === this.secili;
      const uzaklik = this.kamera.position.distanceTo(e.konum);
      // Yürüyüşte uzaktaki etiket gizlenir: göz hizasında bütün salonun etiketleri üst üste biner.
      const uzak = !secili && ((this.yuruyus.acik && uzaklik > YURUYUS_ETIKET_UZAKLIGI) || (tur === 'raf' && uzaklik > ETIKET_RAF_UZAKLIGI));
      // Etiketler kapalıyken yalnız seçili öğe ve bölüm adı.
      const kapali = !this.etiketAcik && !secili && tur !== 'bolum';
      const gorunur = !uzak && !kapali && this.gecici.z < 1 && Math.abs(this.gecici.x) < 1.1 && Math.abs(this.gecici.y) < 1.1;
      if (!gorunur) { e.el.classList.add('tc-atolye-etiket-gizli'); continue; }
      const kisa = !secili && (tur === 'istasyon' || tur === 'raf') && uzaklik > ETIKET_KISA_UZAKLIGI;
      if (e.kisa !== kisa) { e.el.classList.toggle('tc-atolye-etiket-kisa', kisa); e.kisa = kisa; }
      const oncelik = secili ? 0 : tur === 'bolum' ? 1 : tur === 'istasyon' ? 2 : tur === 'gecis' ? 3 : 4;
      yerlesecek.push({ e, x: ((this.gecici.x + 1) / 2) * en, y: ((1 - this.gecici.y) / 2) * boy, oncelik });
    }
    // Ölçü görünür hâlde okunur (gizli etiketin genişliği yine doğrudur: görünürlük gizli, yerleşim var).
    // Sıfır ölçü saklanmaz: katman gizliyken (başka sekme) ölçülen etiket sonra hiçbir şeyle çakışmıyor sayılırdı.
    for (const y of yerlesecek) {
      const olc = () => ({ g: y.e.el.offsetWidth, y: y.e.el.offsetHeight });
      if (y.e.kisa) { if (!y.e.kisaBoyut?.g) y.e.kisaBoyut = olc(); } else if (!y.e.boyut?.g) y.e.boyut = olc();
    }
    yerlesecek.sort((a, b) => a.oncelik - b.oncelik || b.y - a.y);
    const dolu: { x0: number; x1: number; y0: number; y1: number }[] = [];
    for (const y of yerlesecek) {
      const { g, y: h } = (y.e.kisa ? y.e.kisaBoyut : y.e.boyut) ?? { g: 0, y: 0 };
      let alt = y.y;
      const carpan = (a: number) => dolu.find((k) => y.x - g / 2 < k.x1 && y.x + g / 2 > k.x0 && a - h < k.y1 && a > k.y0);
      // Seçili öğe ve bölüm adı çakışınca yukarı kayar; öbürleri üst üste yığılmaz, gizlenir (yaklaşınca açılır).
      // Seçili öğe kayamasa da gösterilir.
      // Kamera oynarken son tam kararın gizlediği etiket gizli kalır, gösterdiği görünür kalır.
      if (hareketli && y.e.carpisti && y.oncelik > 0) { y.e.el.classList.add('tc-atolye-etiket-gizli'); continue; }
      let carp = carpan(alt);
      for (let tur = 0; carp && y.oncelik <= 1 && tur < 4; tur++) {
        alt = carp.y0 - 2;
        carp = carpan(alt);
      }
      // Bölüm adı dört kez kaydırılınca da çakışıyorsa gizlenir (seçili öğe her zaman kalır).
      if (!hareketli) y.e.carpisti = Boolean(carp && y.oncelik > 0);
      if (carp && y.oncelik > 0 && !hareketli) { y.e.el.classList.add('tc-atolye-etiket-gizli'); continue; }
      y.e.el.classList.remove('tc-atolye-etiket-gizli');
      dolu.push({ x0: y.x - g / 2, x1: y.x + g / 2, y0: alt - h, y1: alt });
      // Konum CSS değişkeniyle verilir; satır içi stil yazılmaz, sınıf yerleştirir.
      y.e.el.style.setProperty('--x', `${y.x.toFixed(1)}px`);
      y.e.el.style.setProperty('--y', `${alt.toFixed(1)}px`);
    }
  }

  yokEt(): void {
    this.kameraKaydet();
    cancelAnimationFrame(this.kare);
    this.temaGozcusu.disconnect();
    this.boyutGozcusu?.disconnect();
    for (const s of this.olaySokuculer) s();
    this.kontrol.dispose();
    if (this.odak) this.temizle(this.odak.grup);
    this.temizle(this.yapi);
    this.temizle(this.rotaGrubu);
    this.temizle(this.yuruyusIzi);
    this.sahne.environment?.dispose();
    for (const d of this.dokular) d.dispose();
    for (const d of this.dokuOnbellegi.values()) d.dispose();
    this.dokuOnbellegi.clear();
    for (const a of this.atilacak) a.dispose();
    this.atilacak = [];
    this.temas.dispose();
    this.hale.dispose();
    this.ok.dispose();
    this.rotaMalzemesi.dispose();
    for (const mat of Object.values(this.malzeme ?? {})) (mat as Material).dispose();
    onbellegiBosalt();
    this.parcaSahneleri.clear();
    this.cizer.forceContextLoss();
    this.cizer.dispose();
    this.cizer.domElement.remove();
    this.etiketKatmani.replaceChildren();
  }
}
