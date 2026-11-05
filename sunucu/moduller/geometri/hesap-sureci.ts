// Geometri hesap süreci (1427 a): ana sunucu `surec.ts` ile fork eder; ağa açılmaz, veritabanına bağlanmaz, yalnız IPC ile dosya alır,
// ölçü döner. STEP/IGES güvenilmeyen girdidir: çökmesi ya da asılması ana sunucuyu durdurmaz, yöneten süreç öldürüp yeniden açar.
import { createRequire } from 'node:module';
import {
  agOlcumu, birimAdi, igesBirimi, ILETILER, KUCUK_KENAR_MM, montajAdi, montajAgaci, ozellikleriTani, SERBEST_KENAR_DIKIS_MM, YUZ_EN_COK, yuzTuru,
} from './kurallar.ts';
import type { AdliAg, DosyaTuru, KenarTuru, OcctDugumu, Ozellik, SaglikOlcumu, TanimaYuzu, Yuz, YuzKenari } from './kurallar.ts';
import type { HesapIstegi, HesapYaniti } from './surec.ts';

interface OcctAgi { name?: unknown; attributes: { position: { array: ArrayLike<number> } }; index?: { array: ArrayLike<number> } }
interface OcctSonucu { success: boolean; meshes: OcctAgi[]; root?: OcctDugumu }
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
interface Okuyucu extends Nesne {
  ReadFile(ad: string): unknown; TransferRoots(): number; OneShape(): Nesne;
  FileUnits?(uzunluk: AdDizisi, aci: AdDizisi, katiAci: AdDizisi): void;
}
interface AdDizisi extends Nesne { Size(): number; Value(i: number): { ToCString(): string } }
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
  TopAbs_ShapeEnum: { TopAbs_FACE: string; TopAbs_EDGE: string; TopAbs_WIRE: string };
  NCollection_Sequence_TCollection_AsciiString: new () => AdDizisi;
  ShapeAnalysis_FreeBounds: new (s: Nesne, tolerans: number, kapaliBol: boolean, acikBol: boolean) => Nesne & { GetClosedWires(): Nesne; GetOpenWires(): Nesne };
  BRepCheck_Analyzer: new (s: Nesne, geometri: boolean, paralel: boolean, kesin: boolean) => Nesne & { IsValid(s: Nesne): boolean };
  BRep_Tool: { Tolerance(k: Nesne): number; Degenerated(k: Nesne): boolean };
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
export interface BrepSonucu { yuz: YuzSonucu | null; saglik: SaglikOlcumu | null }

// libcascade dosyayı bir kez okur; aynı şekilden sağlık ölçümü (2143) ve yüzler çıkar. Biri düşerse öteki yine döner; okunamazsa ikisi null.
async function brepOku(tur: DosyaTuru, veri: Uint8Array): Promise<BrepSonucu> {
  const oc = await libcascade();
  const ad = tur === 'step' ? '/model.stp' : '/model.igs';
  oc.FS.writeFile(ad, veri);
  const okuyucu = tur === 'step' ? new oc.STEPControl_Reader() : new oc.IGESControl_Reader();
  const silinecek: Nesne[] = [];
  try {
    oc.Interface_Static.SetCVal('xstep.cascade.unit', 'MM');
    if (String(okuyucu.ReadFile(ad)) !== 'IFSelect_RetDone' || okuyucu.TransferRoots() === 0) return { yuz: null, saglik: null };
    const sekil = okuyucu.OneShape();
    silinecek.push(sekil);
    let saglik: SaglikOlcumu | null = null;
    try {
      saglik = saglikOlc(oc, sekil, tur === 'step' ? stepBirimi(oc, okuyucu) : igesBirimi(veri));
    } catch {
      saglik = null;
    }
    let yuz: YuzSonucu | null = null;
    try {
      yuz = yuzleriOku(oc, sekil);
    } catch {
      yuz = null;
    }
    return { yuz, saglik };
  } catch {
    return { yuz: null, saglik: null };
  } finally {
    birak(...silinecek, okuyucu);
    oc.FS.unlink(ad);
  }
}

// Okuyucunun bildirdiği dosya uzunluk birimi (STEP). Birden çok bağlam varsa mm olmayan ilk ad, yoksa ilki.
function stepBirimi(oc: Libcascade, okuyucu: Okuyucu): string | null {
  if (okuyucu.FileUnits === undefined) return null;
  const d = [new oc.NCollection_Sequence_TCollection_AsciiString(), new oc.NCollection_Sequence_TCollection_AsciiString(), new oc.NCollection_Sequence_TCollection_AsciiString()] as const;
  try {
    okuyucu.FileUnits(d[0], d[1], d[2]);
    const adlar: string[] = [];
    for (let i = 1; i <= d[0].Size(); i++) {
      const a = birimAdi(d[0].Value(i).ToCString());
      if (a !== null) adlar.push(a);
    }
    return adlar.find((a) => !['millimetre', 'millimeter', 'mm'].includes(a.toLowerCase())) ?? adlar[0] ?? null;
  } finally {
    birak(...d);
  }
}

// Sağlık ölçümü (kart 2143). Serbest kenar dikişsiz değil, çok küçük toleransla aranır: aynı yerdeki iki ayrı kenar açık sayılmaz.
// Yüz yüz geçerlilik yalnız şekil geçersizse denetlenir (geçerli şekilde her yüz geçerlidir).
function saglikOlc(oc: Libcascade, sekil: Nesne, dosyaBirimi: string | null): SaglikOlcumu {
  const silinecek: Nesne[] = [];
  const dizin = (s: Nesne, tur: string): SekilDizini => {
    const m = new oc.NCollection_IndexedMap_TopoDS_Shape_TopTools_ShapeMapHasher();
    silinecek.push(m);
    oc.TopExp.MapShapes(s, tur, m);
    return m;
  };
  try {
    const serbest = new oc.ShapeAnalysis_FreeBounds(sekil, SERBEST_KENAR_DIKIS_MM, false, false);
    silinecek.push(serbest);
    let acikKenarSayisi = 0, acikSinirSayisi = 0;
    for (const tel of [serbest.GetClosedWires(), serbest.GetOpenWires()]) {
      silinecek.push(tel);
      acikKenarSayisi += dizin(tel, oc.TopAbs_ShapeEnum.TopAbs_EDGE).Extent();
      acikSinirSayisi += dizin(tel, oc.TopAbs_ShapeEnum.TopAbs_WIRE).Extent();
    }
    const denetim = new oc.BRepCheck_Analyzer(sekil, true, false, false);
    silinecek.push(denetim);
    const sekilGecerli = denetim.IsValid(sekil);
    let gecersizYuzSayisi = 0;
    if (!sekilGecerli) {
      const yuzler = dizin(sekil, oc.TopAbs_ShapeEnum.TopAbs_FACE);
      for (let i = 1; i <= yuzler.Extent(); i++) {
        const y = yuzler.FindKey(i);
        const d = new oc.BRepCheck_Analyzer(y, true, false, false);
        if (!d.IsValid(y)) gecersizYuzSayisi++;
        birak(d);
      }
    }
    const kenarlar = dizin(sekil, oc.TopAbs_ShapeEnum.TopAbs_EDGE);
    let enBuyukToleransMm = 0, kucukKenarSayisi = 0;
    for (let i = 1; i <= kenarlar.Extent(); i++) {
      const k = oc.TopoDS.Edge(kenarlar.FindKey(i));
      enBuyukToleransMm = Math.max(enBuyukToleransMm, oc.BRep_Tool.Tolerance(k));
      if (!oc.BRep_Tool.Degenerated(k)) {
        const boy = new oc.GProp_GProps();
        oc.BRepGProp.LinearProperties(k, boy, false, false);
        if (boy.Mass() < KUCUK_KENAR_MM) kucukKenarSayisi++;
        birak(boy);
      }
      birak(k);
    }
    return {
      acikKenarSayisi, acikSinirSayisi, gecersizYuzSayisi, sekilGecerli, enBuyukToleransMm: Math.round(enBuyukToleransMm * 1e7) / 1e7, kucukKenarSayisi, dosyaBirimi,
    };
  } finally {
    birak(...silinecek);
  }
}

// Yüzler şeklin yüz dizinindeki sırayla (TopExp.MapShapes; aynı yüz bir kez) okunur; sıra geometri_yuz.sira'dır. Yüz listesi sınırı
// aşarsa null: ağdan ölçüm yine tamamlanır, yüz türü ve özellikler yalnız eksik kalır.
function yuzleriOku(oc: Libcascade, sekil: Nesne): YuzSonucu | null {
  const silinecek: Nesne[] = [];
  try {
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
  } finally {
    birak(...silinecek);
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
  const aglar: AdliAg[] = sonuc.meshes.map((m) => ({ ad: montajAdi(m.name), konum: m.attributes.position.array, indeks: m.index?.array ?? [] }));
  const olcum = agOlcumu(aglar);
  if (olcum === null) return { tamam: false, kalici: true, hata: ILETILER.bosModel, bellek: process.memoryUsage().rss };
  const montaj = sonuc.root === undefined ? null : montajAgaci(sonuc.root, aglar);
  const brep = await brepOku(tur, veri).catch((): BrepSonucu => ({ yuz: null, saglik: null }));
  return {
    tamam: true, olcum, montaj, yuzler: brep.yuz?.yuzler ?? null, ozellikler: brep.yuz?.ozellikler ?? null, saglik: brep.saglik,
    sureMs: Math.round(performance.now() - baslangic), bellek: process.memoryUsage().rss,
  };
}

process.on('message', (ileti: HesapIstegi) => {
  void hesapla(ileti.tur, ileti.veri).then(
    (yanit) => process.send?.({ ...yanit, kimlik: ileti.kimlik }),
    () => process.send?.({ tamam: false, kalici: true, hata: ILETILER.okunamadi, bellek: process.memoryUsage().rss, kimlik: ileti.kimlik }),
  );
});
// Ana süreç kapanınca kanal kopar: bu süreç de kapanır, öksüz kalmaz.
process.on('disconnect', () => process.exit(0));
