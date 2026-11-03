// Geometri hesap süreci (1427 a): ana sunucu `surec.ts` ile fork eder; ağa açılmaz, veritabanına bağlanmaz, yalnız IPC ile dosya alır,
// ölçü döner. STEP/IGES güvenilmeyen girdidir: çökmesi ya da asılması ana sunucuyu durdurmaz, yöneten süreç öldürüp yeniden açar.
import { createRequire } from 'node:module';
import { agOlcumu, ILETILER, ozellikleriTani, YUZ_EN_COK, yuzTuru } from './kurallar.ts';
import type { DosyaTuru, KenarTuru, Ozellik, TanimaYuzu, UcgenAgi, Yuz, YuzKenari } from './kurallar.ts';
import type { HesapIstegi, HesapYaniti } from './surec.ts';

interface OcctAgi { attributes: { position: { array: ArrayLike<number> } }; index?: { array: ArrayLike<number> } }
interface OcctSonucu { success: boolean; meshes: OcctAgi[] }
interface Occt {
  ReadStepFile(veri: Uint8Array, ayar: object | null): OcctSonucu;
  ReadIgesFile(veri: Uint8Array, ayar: object | null): OcctSonucu;
}

// Ağ inceliği kutu köşegenine oranla; ölçüm için yeterli, hacmin yaklaşıklığını belirler.
const AYAR = { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.001, angularDeflection: 0.5 };

let motor: Promise<Occt> | null = null;
function occt(): Promise<Occt> {
  if (motor === null) {
    const yukle = createRequire(import.meta.url)('occt-import-js') as () => Promise<Occt>;
    motor = yukle();
  }
  return motor;
}

// libcascade (1983 a) yalnız yüz türü için. Paketin tip tanımı 11 MB'tır ve tip denetimini ve lint'i belleksiz bırakır: modül adı
// değişkenden yüklenir (tip çözülmez), kullanılan yüzey burada tanımlıdır.
const LIBCASCADE = 'libcascade/single/init';
type Nesne = { delete?: () => void };
type V3 = { X(): number; Y(): number; Z(): number } & Nesne;
type Eksen = { Direction(): V3; Location(): V3 } & Nesne;
interface Yuzey extends Nesne {
  GetType(): unknown;
  Plane(): { Axis(): Eksen } & Nesne;
  Cylinder(): { Radius(): number; Axis(): Eksen } & Nesne;
  Cone(): { RefRadius(): number; SemiAngle(): number; Axis(): Eksen } & Nesne;
  Sphere(): { Radius(): number; Location(): V3 } & Nesne;
  Torus(): { MajorRadius(): number; MinorRadius(): number; Axis(): Eksen } & Nesne;
}
interface Okuyucu extends Nesne { ReadFile(ad: string): unknown; TransferRoots(): number; OneShape(): Nesne }
interface SekilListesi extends Nesne { Size(): number; First(): Nesne; Last(): Nesne }
interface SekilDizini extends Nesne { Extent(): number; FindKey(i: number): Nesne & { Orientation(): unknown }; FindIndex(s: Nesne): number }
interface AtaDizini extends Nesne { Extent(): number; FindKey(i: number): Nesne; FindFromIndex(i: number): SekilListesi }
interface Libcascade {
  FS: { writeFile(ad: string, veri: Uint8Array): void; unlink(ad: string): void };
  Interface_Static: { SetCVal(ad: string, deger: string): boolean };
  STEPControl_Reader: new () => Okuyucu;
  IGESControl_Reader: new () => Okuyucu;
  NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher: new () => SekilDizini;
  NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher: new () => AtaDizini;
  TopExp: {
    MapShapes(s: Nesne, tur: string, m: SekilDizini): void;
    MapShapesAndAncestors(s: Nesne, tur: string, ata: string, m: AtaDizini): void;
  };
  TopAbs_ShapeEnum: { TopAbs_FACE: string; TopAbs_EDGE: string };
  TopoDS: { Face(s: Nesne): Nesne & { Orientation(): unknown; IsSame(s: Nesne): boolean }; Edge(s: Nesne): Nesne };
  BRepAdaptor_Surface: new (y: Nesne, sinirli: boolean) => Yuzey;
  BRepLProp_SLProps: new (y: Yuzey, u: number, v: number, n: number, cozunurluk: number) => Nesne & { Normal(): V3; Value(): V3; IsNormalDefined(): boolean };
  BRepTools: { UVBounds(y: Nesne): { UMin: number; UMax: number; VMin: number; VMax: number } };
  ChFi3d: { DefineConnectType(k: Nesne, a: Nesne, b: Nesne, sinTol: number, duzelt: boolean): unknown };
  GProp_GProps: new () => Nesne & { Mass(): number };
  BRepGProp: {
    SurfaceProperties(s: Nesne, p: Nesne, paylasilanAtla: boolean, ag: boolean): void;
    LinearProperties(s: Nesne, p: Nesne, paylasilanAtla: boolean, ag: boolean): void;
  };
}

let kitaplik: Promise<Libcascade> | null = null;
function libcascade(): Promise<Libcascade> {
  kitaplik ??= (import(LIBCASCADE) as Promise<{ createInstance: () => Promise<unknown> }>).then((m) => m.createInstance() as Promise<Libcascade>);
  return kitaplik;
}

const birak = (...nesneler: Nesne[]): void => { for (const n of nesneler) n.delete?.(); };
const yuvarla = (x: number, k = 1e4): number => Math.round(x * k) / k;
const ucDeger = (v: V3, k?: number): [number, number, number] => {
  const d: [number, number, number] = [yuvarla(v.X(), k) + 0, yuvarla(v.Y(), k) + 0, yuvarla(v.Z(), k) + 0];
  birak(v);
  return d;
};
const eksenOku = (a: Eksen): { eksen: [number, number, number]; konum: [number, number, number] } => {
  const s = { eksen: ucDeger(a.Direction(), 1e8), konum: ucDeger(a.Location()) };
  birak(a);
  return s;
};

// Kenar türü için açı sınırı (sinüs): 1 dereceden küçük kırılma teğet sayılır (VARSAYIM, kart 2044; geri alma ucuz).
const TEGET_SINUS = Math.sin(Math.PI / 180);
const KENAR_TURU: Readonly<Record<string, KenarTuru>> = { ChFiDS_Concave: 'icbukey', ChFiDS_Convex: 'disbukey', ChFiDS_Tangential: 'teget' };

export interface YuzSonucu { yuzler: Yuz[]; ozellikler: Ozellik[] }

// Yüzler şeklin yüz dizinindeki sırayla (TopExp.MapShapes; aynı yüz bir kez) okunur; sıra geometri_yuz.sira'dır. Yüz listesi okunamazsa
// ya da sınırı aşarsa null: ağdan ölçüm yine tamamlanır, yüz türü ve özellikler yalnız eksik kalır.
async function yuzleriOku(tur: DosyaTuru, veri: Uint8Array): Promise<YuzSonucu | null> {
  const oc = await libcascade();
  const ad = tur === 'step' ? '/model.stp' : '/model.igs';
  oc.FS.writeFile(ad, veri);
  const okuyucu = tur === 'step' ? new oc.STEPControl_Reader() : new oc.IGESControl_Reader();
  const silinecek: Nesne[] = [];
  try {
    oc.Interface_Static.SetCVal('xstep.cascade.unit', 'MM');
    if (String(okuyucu.ReadFile(ad)) !== 'IFSelect_RetDone' || okuyucu.TransferRoots() === 0) return null;
    const sekil = okuyucu.OneShape();
    silinecek.push(sekil);
    const dizin = new oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher();
    silinecek.push(dizin);
    oc.TopExp.MapShapes(sekil, oc.TopAbs_ShapeEnum.TopAbs_FACE, dizin);
    const n = dizin.Extent();
    if (n > YUZ_EN_COK) return null;
    const yuzler: Yuz[] = [];
    const tanima: TanimaYuzu[] = [];
    for (let i = 1; i <= n; i++) {
      const yuz = oc.TopoDS.Face(dizin.FindKey(i));
      const yuzey = new oc.BRepAdaptor_Surface(yuz, true);
      const ozellik = new oc.GProp_GProps();
      oc.BRepGProp.SurfaceProperties(yuz, ozellik, false, false);
      const t = yuzTuru(String(yuzey.GetType()));
      const ters = String(yuz.Orientation()) === 'TopAbs_REVERSED';
      const y: Yuz = {
        tur: t, ters, alanMm2: yuvarla(ozellik.Mass()),
        yaricapMm: null, ikinciYaricapMm: null, yariAciDerece: null, eksen: null, konum: null,
      };
      if (t === 'silindir') {
        const g = yuzey.Cylinder();
        Object.assign(y, { yaricapMm: yuvarla(g.Radius()) }, eksenOku(g.Axis()));
        birak(g);
      } else if (t === 'koni') {
        const g = yuzey.Cone();
        Object.assign(y, { yaricapMm: yuvarla(g.RefRadius()), yariAciDerece: yuvarla((g.SemiAngle() * 180) / Math.PI) }, eksenOku(g.Axis()));
        birak(g);
      } else if (t === 'kure') {
        const g = yuzey.Sphere();
        Object.assign(y, { yaricapMm: yuvarla(g.Radius()), konum: ucDeger(g.Location()) });
        birak(g);
      } else if (t === 'torus') {
        const g = yuzey.Torus();
        Object.assign(y, { yaricapMm: yuvarla(g.MajorRadius()), ikinciYaricapMm: yuvarla(g.MinorRadius()) }, eksenOku(g.Axis()));
        birak(g);
      } else if (t === 'duzlem') {
        const g = yuzey.Plane();
        Object.assign(y, eksenOku(g.Axis()));
        birak(g);
      }
      tanima.push(tanimaYuzu(oc, yuz, yuzey, y, ters));
      birak(ozellik, yuzey, yuz);
      yuzler.push(y);
    }
    const atalar = new oc.NCollection_IndexedDataMap_TopoDS_Shape_NCollection_List_TopoDS_Shape_TopTools_ShapeMapHasher();
    silinecek.push(atalar);
    oc.TopExp.MapShapesAndAncestors(sekil, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_FACE, atalar);
    const kenarlar: YuzKenari[] = [];
    for (let i = 1; i <= atalar.Extent(); i++) {
      const liste = atalar.FindFromIndex(i);
      if (liste.Size() !== 2) continue;
      const a = oc.TopoDS.Face(liste.First()), b = oc.TopoDS.Face(liste.Last());
      if (a.IsSame(b)) { birak(a, b); continue; }
      const kenar = oc.TopoDS.Edge(atalar.FindKey(i));
      const boy = new oc.GProp_GProps();
      oc.BRepGProp.LinearProperties(kenar, boy, false, false);
      const tur = KENAR_TURU[String(oc.ChFi3d.DefineConnectType(kenar, a, b, TEGET_SINUS, true))] ?? 'diger';
      kenarlar.push({ a: dizin.FindIndex(a) - 1, b: dizin.FindIndex(b) - 1, tur, uzunlukMm: yuvarla(boy.Mass()) });
      birak(boy, kenar, a, b);
    }
    return { yuzler, ozellikler: ozellikleriTani(tanima, kenarlar) };
  } catch {
    return null;
  } finally {
    birak(...silinecek, okuyucu);
    oc.FS.unlink(ad);
  }
}

// Dış normal yüzün parametre ortasında okunur ve yüz yönüyle çevrilir. yan: normal eğrilik merkezine bakıyorsa 'ic' (silindir ve
// konide eksen, torusta boru ekseni, kürede merkez). Silindir, koni ve kürede yan yüzün her yerinde aynıdır.
function tanimaYuzu(oc: Libcascade, yuz: Nesne, yuzey: Yuzey, y: Yuz, ters: boolean): TanimaYuzu {
  const uv = oc.BRepTools.UVBounds(yuz);
  const sonuc: TanimaYuzu = { yuz: y, yan: null, normal: null, u: [uv.UMin, uv.UMax], v: [uv.VMin, uv.VMax] };
  const ozellik = new oc.BRepLProp_SLProps(yuzey, (uv.UMin + uv.UMax) / 2, (uv.VMin + uv.VMax) / 2, 1, 1e-7);
  try {
    if (!ozellik.IsNormalDefined()) return sonuc;
    const n0 = ucDeger(ozellik.Normal(), 1e8);
    const n: [number, number, number] = ters ? [-n0[0], -n0[1], -n0[2]] : n0;
    const p = ucDeger(ozellik.Value(), 1e8);
    if (y.tur === 'duzlem') { sonuc.normal = n; return sonuc; }
    let merkez: [number, number, number] | null = null;
    if ((y.tur === 'silindir' || y.tur === 'koni' || y.tur === 'torus') && y.eksen !== null && y.konum !== null) {
      const e = y.eksen, k = y.konum;
      const t = (p[0] - k[0]) * e[0] + (p[1] - k[1]) * e[1] + (p[2] - k[2]) * e[2];
      merkez = [k[0] + t * e[0], k[1] + t * e[1], k[2] + t * e[2]];
      if (y.tur === 'torus' && y.yaricapMm !== null) {
        const r = [p[0] - merkez[0], p[1] - merkez[1], p[2] - merkez[2]], l = Math.hypot(...r);
        if (l > 0) merkez = [merkez[0] + (r[0]! / l) * y.yaricapMm, merkez[1] + (r[1]! / l) * y.yaricapMm, merkez[2] + (r[2]! / l) * y.yaricapMm];
      }
    } else if (y.tur === 'kure' && y.konum !== null) {
      merkez = y.konum;
    }
    if (merkez !== null) {
      const d = (p[0] - merkez[0]) * n[0] + (p[1] - merkez[1]) * n[1] + (p[2] - merkez[2]) * n[2];
      sonuc.yan = d < 0 ? 'ic' : 'dis';
    }
    return sonuc;
  } finally {
    birak(ozellik);
  }
}

async function hesapla(tur: DosyaTuru, veri: Uint8Array): Promise<HesapYaniti> {
  const baslangic = performance.now();
  const o = await occt();
  let sonuc: OcctSonucu;
  try {
    sonuc = tur === 'step' ? o.ReadStepFile(veri, AYAR) : o.ReadIgesFile(veri, AYAR);
  } catch {
    return { tamam: false, kalici: true, hata: ILETILER.okunamadi, bellek: process.memoryUsage().rss };
  }
  if (!sonuc.success) return { tamam: false, kalici: true, hata: ILETILER.okunamadi, bellek: process.memoryUsage().rss };
  const aglar: UcgenAgi[] = sonuc.meshes.map((m) => ({ konum: m.attributes.position.array, indeks: m.index?.array ?? [] }));
  const olcum = agOlcumu(aglar);
  if (olcum === null) return { tamam: false, kalici: true, hata: ILETILER.bosModel, bellek: process.memoryUsage().rss };
  const yuz = await yuzleriOku(tur, veri).catch(() => null);
  return { tamam: true, olcum, yuzler: yuz?.yuzler ?? null, ozellikler: yuz?.ozellikler ?? null, sureMs: Math.round(performance.now() - baslangic), bellek: process.memoryUsage().rss };
}

process.on('message', (ileti: HesapIstegi) => {
  void hesapla(ileti.tur, ileti.veri).then(
    (yanit) => process.send?.({ ...yanit, kimlik: ileti.kimlik }),
    () => process.send?.({ tamam: false, kalici: true, hata: ILETILER.okunamadi, bellek: process.memoryUsage().rss, kimlik: ileti.kimlik }),
  );
});
// Ana süreç kapanınca kanal kopar: bu süreç de kapanır, öksüz kalmaz.
process.on('disconnect', () => process.exit(0));
