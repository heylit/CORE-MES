import { Box3, Group, Mesh, Vector3, type Material, type Object3D } from 'three';
import type { CncModel, ModelHedefi, ModellerCevabi } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { ApiHatasi, OTURUM_BITTI, api } from '../../../../ortak/veri/api.ts';
import { sahneRengi3 } from './renkler.ts';

// 3B modeller (1212 a): makineye ve bağlama aparatına Tanımlar'da Çizim Merkezi'nden bağlanan model. Bağ listesi ilk istekte okunur, dosya
// bağ ve özetle bir kez iner ve sayfa açık kaldıkça bellekte durur (cihaza yazılmaz). Okuyucu Çizim Merkezi'nindir (GLB, glTF, STEP, IGES,
// STL); yalnız model gerekince iner. Modeli olmayan ya da açılamayan hedef çizilen gövdeyle görünür.

export type ModelDurumu =
  | { durum: 'yukleniyor' }
  | { durum: 'yok' }
  | { durum: 'hazir'; kok: Object3D }
  | { durum: 'hata'; ileti: string };

export const hedefAnahtari = (h: ModelHedefi): string => (h.tur === 'makine' ? `makine:${String(h.makineId)}` : `aparat:${h.anahtar}`);

const LISTE_BEKLEMESI_MS = 30_000;
let liste: Map<string, CncModel> | null = null;
let listeSozu: Promise<Map<string, CncModel>> | null = null;
// Liste alınamazsa her gövde yeniden sormasın: bir süre aynı hata döner.
let listeHatasi: { an: number; hata: unknown } | null = null;

function listeyiYaz(modeller: readonly CncModel[]): Map<string, CncModel> {
  liste = new Map(modeller.map((m) => [hedefAnahtari(m.hedef), m]));
  listeHatasi = null;
  return liste;
}

function listeAl(): Promise<Map<string, CncModel>> {
  if (liste) return Promise.resolve(liste);
  if (listeHatasi && Date.now() - listeHatasi.an < LISTE_BEKLEMESI_MS) return Promise.reject(listeHatasi.hata);
  listeSozu ??= api.get<ModellerCevabi>('/cnc-kurulum/modeller').then(
    (c) => listeyiYaz(c.modeller),
    (hata: unknown) => { listeHatasi = { an: Date.now(), hata }; listeSozu = null; throw hata; },
  );
  return listeSozu;
}

const dosyalar = new Map<string, Promise<Object3D | null>>();

async function dosyaAc(m: CncModel): Promise<Object3D | null> {
  const belge = m.belge;
  if (belge === null) return null;
  const anahtar = `${String(m.id)}:${belge.ozet}`;
  const var_ = dosyalar.get(anahtar);
  if (var_) return var_;
  const ac = (async () => {
    const cevap = await fetch(`/api/cnc-kurulum/modeller/${String(m.id)}/dosya`, { credentials: 'include' });
    if (cevap.status === 204) return null;
    if (!cevap.ok) {
      if (cevap.status === 401) window.dispatchEvent(new CustomEvent(OTURUM_BITTI));
      throw new ApiHatasi(cevap.status, null);
    }
    const veri = new Uint8Array(await cevap.arrayBuffer());
    const { modelOku } = await import('../../../cizimler/disari.ts');
    return modelOku(veri, belge.dosyaTuru, sahneRengi3('m-alu'));
  })();
  dosyalar.set(anahtar, ac);
  ac.catch(() => dosyalar.delete(anahtar));
  return ac;
}

type Dinleyen = (d: ModelDurumu) => void;
interface Hedef { durum: ModelDurumu; nesil: number; dinleyenler: Set<Dinleyen> }
const hedefler = new Map<string, Hedef>();
const aboneler = new Set<() => void>();
let surum = 0;
function haberVer(): void { surum += 1; for (const f of aboneler) f(); }

function durumYaz(h: Hedef, d: ModelDurumu): void {
  h.durum = d;
  for (const f of [...h.dinleyenler]) f(d);
  haberVer();
}

function yukle(anahtar: string, h: Hedef): void {
  const nesil = ++h.nesil;
  h.durum = { durum: 'yukleniyor' };
  void (async () => {
    let d: ModelDurumu;
    try {
      const m = (await listeAl()).get(anahtar);
      const kok = m === undefined ? null : await dosyaAc(m);
      d = kok === null ? { durum: 'yok' } : { durum: 'hazir', kok };
    } catch {
      d = { durum: 'hata', ileti: 'Model indirilemedi ya da açılamadı.' };
    }
    if (h.nesil === nesil) durumYaz(h, d);
  })();
}

// Hedefin modelini ister. `dinle` her sonuçta çağrılır (bağ Tanımlar'dan değişince de); çağıran işi bitince `modelDinlemeyiBirak` ile çıkar.
// Açılamayan model sonraki istekte yeniden denenir.
export function modelIste(anahtar: string, dinle?: Dinleyen): ModelDurumu {
  let h = hedefler.get(anahtar);
  if (!h) {
    h = { durum: { durum: 'yukleniyor' }, nesil: 0, dinleyenler: new Set() };
    hedefler.set(anahtar, h);
    yukle(anahtar, h);
    // İsteyen çizimin ortasında olabilir (React çizimi dahil): aboneler sonra haber alır.
    queueMicrotask(haberVer);
  } else if (h.durum.durum === 'hata') {
    yukle(anahtar, h);
    queueMicrotask(haberVer);
  }
  if (dinle) h.dinleyenler.add(dinle);
  return h.durum;
}

export function modelDinlemeyiBirak(anahtar: string, dinle: Dinleyen): void { hedefler.get(anahtar)?.dinleyenler.delete(dinle); }

export const modelDurumu = (anahtar: string): ModelDurumu | null => hedefler.get(anahtar)?.durum ?? null;

// Tanımlar listeyi açılışta okur ve bağı değiştirince yeni satırı verir: istenmiş hedefler yeniden yüklenir, sahnedeki gövde kendiliğinden değişir.
export function modelListesiniKur(modeller: readonly CncModel[]): void {
  listeyiYaz(modeller);
  listeSozu = null;
  for (const [anahtar, h] of hedefler) yukle(anahtar, h);
  haberVer();
}
export function modelGuncelle(m: CncModel): void {
  const anahtar = hedefAnahtari(m.hedef);
  (liste ?? listeyiYaz([])).set(anahtar, m);
  const h = hedefler.get(anahtar);
  if (h) yukle(anahtar, h);
  haberVer();
}

// Ekran (Tanımlar) durumu useSyncExternalStore ile izler: sürüm her durum değişiminde ilerler.
export function modelAbone(f: () => void): () => void {
  aboneler.add(f);
  return () => { aboneler.delete(f); };
}
export const modelSurumu = (): number => surum;

// Her çizim kendi kopyasını alır: sahne bıraktığında geometri ve malzemesi atılır (cnc3d dispose `own` işaretine bakar), bellekteki model kalır.
export function modelKopyasi(kok: Object3D): Object3D {
  const kopya = kok.clone(true);
  kopya.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    o.geometry = o.geometry.clone();
    const tek = (m: Material): Material => { const c = m.clone(); c.userData['own'] = true; return c; };
    o.material = Array.isArray(o.material) ? o.material.map(tek) : tek(o.material as Material);
  });
  return kopya;
}

// Model, yerine geçtiği gövdenin kutusuna oturur: en uzun kenarı aynı, tabanı ve ortası aynı yerde. Çağıranın ölçekleyip yerleştirdiği
// kutu (fit) böylece bozulmaz; modelin birimi (metre, milimetre) önemsizdir.
export function kutuyaOturt(model: Object3D, hedef: Box3): Group {
  const g = new Group();
  g.add(model);
  g.updateMatrixWorld(true);
  const kutu = new Box3().setFromObject(g);
  if (kutu.isEmpty() || hedef.isEmpty()) return g;
  const boy = kutu.getSize(new Vector3()), hedefBoy = hedef.getSize(new Vector3());
  const s = Math.max(hedefBoy.x, hedefBoy.y, hedefBoy.z) / Math.max(boy.x, boy.y, boy.z, 1e-9);
  model.scale.multiplyScalar(s);
  g.updateMatrixWorld(true);
  kutu.setFromObject(g);
  const merkez = kutu.getCenter(new Vector3()), hedefMerkez = hedef.getCenter(new Vector3());
  model.position.add(new Vector3(hedefMerkez.x - merkez.x, hedef.min.y - kutu.min.y, hedefMerkez.z - merkez.z));
  return g;
}

// Yalnız testler için: bellekteki liste, dosya ve durumları unutur.
export function modelleriUnut(): void {
  liste = null; listeSozu = null; listeHatasi = null; dosyalar.clear(); hedefler.clear();
}
