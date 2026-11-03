// Geometri hesap süreci (1427 a): ana sunucu `surec.ts` ile fork eder; ağa açılmaz, veritabanına bağlanmaz, yalnız IPC ile dosya alır,
// ölçü döner. STEP/IGES güvenilmeyen girdidir: çökmesi ya da asılması ana sunucuyu durdurmaz, yöneten süreç öldürüp yeniden açar.
import { createRequire } from 'node:module';
import { agOlcumu, ILETILER, YUZ_EN_COK, yuzTuru } from './kurallar.ts';
import type { DosyaTuru, UcgenAgi, Yuz } from './kurallar.ts';
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
interface Kasif extends Nesne { More(): boolean; Next(): void; Current(): Nesne & { Orientation(): unknown } }
interface Okuyucu extends Nesne { ReadFile(ad: string): unknown; TransferRoots(): number; OneShape(): Nesne }
interface Libcascade {
  FS: { writeFile(ad: string, veri: Uint8Array): void; unlink(ad: string): void };
  Interface_Static: { SetCVal(ad: string, deger: string): boolean };
  STEPControl_Reader: new () => Okuyucu;
  IGESControl_Reader: new () => Okuyucu;
  TopExp_Explorer: new (s: Nesne, bul: string, kacin: string) => Kasif;
  TopAbs_ShapeEnum: { TopAbs_FACE: string; TopAbs_SHAPE: string };
  TopoDS: { Face(s: Nesne): Nesne };
  BRepAdaptor_Surface: new (y: Nesne, sinirli: boolean) => Yuzey;
  GProp_GProps: new () => Nesne & { Mass(): number };
  BRepGProp: { SurfaceProperties(s: Nesne, p: Nesne, paylasilanAtla: boolean, ag: boolean): void };
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

// Yüz listesi okunamazsa ya da sınırı aşarsa null: ağdan ölçüm yine tamamlanır, yüz türü yalnız eksik kalır.
async function yuzleriOku(tur: DosyaTuru, veri: Uint8Array): Promise<Yuz[] | null> {
  const oc = await libcascade();
  const ad = tur === 'step' ? '/model.stp' : '/model.igs';
  oc.FS.writeFile(ad, veri);
  const okuyucu = tur === 'step' ? new oc.STEPControl_Reader() : new oc.IGESControl_Reader();
  try {
    oc.Interface_Static.SetCVal('xstep.cascade.unit', 'MM');
    if (String(okuyucu.ReadFile(ad)) !== 'IFSelect_RetDone' || okuyucu.TransferRoots() === 0) return null;
    const sekil = okuyucu.OneShape();
    const kasif = new oc.TopExp_Explorer(sekil, oc.TopAbs_ShapeEnum.TopAbs_FACE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE);
    const yuzler: Yuz[] = [];
    for (; kasif.More(); kasif.Next()) {
      if (yuzler.length >= YUZ_EN_COK) { birak(kasif, sekil); return null; }
      const ham = kasif.Current();
      const yuz = oc.TopoDS.Face(ham);
      const yuzey = new oc.BRepAdaptor_Surface(yuz, true);
      const ozellik = new oc.GProp_GProps();
      oc.BRepGProp.SurfaceProperties(yuz, ozellik, false, false);
      const t = yuzTuru(String(yuzey.GetType()));
      const y: Yuz = {
        tur: t, ters: String(ham.Orientation()) === 'TopAbs_REVERSED', alanMm2: yuvarla(ozellik.Mass()),
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
      birak(ozellik, yuzey, yuz, ham);
      yuzler.push(y);
    }
    birak(kasif, sekil);
    return yuzler;
  } catch {
    return null;
  } finally {
    birak(okuyucu);
    oc.FS.unlink(ad);
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
  const yuzler = await yuzleriOku(tur, veri).catch(() => null);
  return { tamam: true, olcum, yuzler, sureMs: Math.round(performance.now() - baslangic), bellek: process.memoryUsage().rss };
}

process.on('message', (ileti: HesapIstegi) => {
  void hesapla(ileti.tur, ileti.veri).then(
    (yanit) => process.send?.({ ...yanit, kimlik: ileti.kimlik }),
    () => process.send?.({ tamam: false, kalici: true, hata: ILETILER.okunamadi, bellek: process.memoryUsage().rss, kimlik: ileti.kimlik }),
  );
});
// Ana süreç kapanınca kanal kopar: bu süreç de kapanır, öksüz kalmaz.
process.on('disconnect', () => process.exit(0));
