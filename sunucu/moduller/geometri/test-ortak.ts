// Yalnız testler için: eksenlere hizalı kutunun en küçük STEP (AP214) dosyası. Gerçek parça dosyası depoya girmez; ölçüsü bilinen sentetik
// model ayrı süreçte okunur ve sonuç kesin değerle karşılaştırılır.
export function kutuStep(x: number, y: number, z: number): string {
  const y_ = stepYazici();
  const kati = kutuKatisi(y_, x, y, z, 'kutu');
  const bag = y_.baglam();
  const temsil = y_.e(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(#${String(y_.eksen([0, 0, 0]))},#${String(kati)}),#${String(bag)})`);
  const uyg = y_.e("APPLICATION_CONTEXT('automotive design')");
  y_.e(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${String(uyg)})`);
  y_.urun(uyg, 'kutu', temsil);
  return y_.metin('kutu.step');
}

// Yalnız testler için (kart 2143): kutuStep'in bozulmuş kopyaları; her biri sağlık raporunun bir bulgusunu bilinen değerle üretir.
// Açık kutu: kabuktan ilk yüz (alt yüz) çıkarılır; 4 açık kenar, 1 açık sınır.
export function acikKutuStep(x: number, y: number, z: number): string {
  const m = kutuStep(x, y, z);
  const s = m.replace(/CLOSED_SHELL\('',\(#\d+,/, "CLOSED_SHELL('',(");
  if (s === m) throw new Error('kabuk bulunamadı');
  return s;
}
// İnç kutu: uzunluk birimi INCH (25,4 mm); ölçüler dosyada inçtir.
export function incKutuStep(x: number, y: number, z: number): string {
  const m = kutuStep(x, y, z);
  const mm = '( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )';
  if (!m.includes(mm)) throw new Error('birim bulunamadı');
  return m.replace(mm, "( CONVERSION_BASED_UNIT('INCH',#9999) LENGTH_UNIT() NAMED_UNIT(#9998) )")
    .replace('DATA;\n', `DATA;\n#9997=${mm};\n#9998=DIMENSIONAL_EXPONENTS(1.,0.,0.,0.,0.,0.,0.);\n#9999=LENGTH_MEASURE_WITH_UNIT(LENGTH_MEASURE(25.4),#9997);\n`);
}
// Kaymış yüzlü kutu: üst yüzün düzlemi kenarlarından kayma kadar yukarıdadır; okuyucu onarımı kenar toleransını kayma kadar büyütür.
export function kaymisYuzluKutuStep(x: number, y: number, z: number, kayma: number): string {
  const m = kutuStep(x, y, z);
  const eksen = [...m.matchAll(/#\d+=PLANE\('',#(\d+)\);/g)][1]?.[1];
  const nokta = eksen === undefined ? undefined : new RegExp(`#${eksen}=AXIS2_PLACEMENT_3D\\('',#(\\d+),`).exec(m)?.[1];
  if (nokta === undefined) throw new Error('üst yüz bulunamadı');
  return m.replace(new RegExp(`#${nokta}=CARTESIAN_POINT\\('',\\(([^)]*)\\)\\)`), (_t, p: string) => {
    const v = p.split(',').map(Number);
    v[2] = v[2]! + kayma;
    return `#${nokta}=CARTESIAN_POINT('',(${v.map((d) => d.toFixed(4)).join(',')}))`;
  });
}

interface StepYazici {
  e(t: string): number;
  nok(p: number[]): number;
  yon(d: number[]): number;
  eksen(p: number[], x?: number[]): number;
  baglam(): number;
  urun(uyg: number, ad: string, temsil: number): { tanim: number };
  metin(dosyaAdi: string): string;
}

function stepYazici(): StepYazici {
  const s: string[] = [];
  let n = 0;
  let bag: number | null = null;
  const e = (t: string): number => { s.push(`#${String(++n)}=${t};`); return n; };
  const nok = (p: number[]): number => e(`CARTESIAN_POINT('',(${p.map((v) => v.toFixed(4)).join(',')}))`);
  const yon = (d: number[]): number => e(`DIRECTION('',(${d.map((v) => v.toFixed(4)).join(',')}))`);
  return {
    e, nok, yon,
    eksen: (p, x = [1, 0, 0]) => e(`AXIS2_PLACEMENT_3D('',#${String(nok(p))},#${String(yon([0, 0, 1]))},#${String(yon(x))})`),
    baglam: () => {
      if (bag !== null) return bag;
      const uz = e('( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )');
      const aci = e('( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )');
      const kat = e('( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )');
      const bel = e(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#${String(uz)},'distance_accuracy_value','')`);
      bag = e(`( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${String(bel)})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${String(uz)},#${String(aci)},#${String(kat)})) REPRESENTATION_CONTEXT('','') )`);
      return bag;
    },
    urun: (uyg, ad, temsil) => {
      const urunBag = e(`PRODUCT_CONTEXT('',#${String(uyg)},'mechanical')`);
      const urun = e(`PRODUCT('${ad}','${ad}','',(#${String(urunBag)}))`);
      const bicim = e(`PRODUCT_DEFINITION_FORMATION('','',#${String(urun)})`);
      const tanimBag = e(`PRODUCT_DEFINITION_CONTEXT('part definition',#${String(uyg)},'design')`);
      const tanim = e(`PRODUCT_DEFINITION('design','',#${String(bicim)},#${String(tanimBag)})`);
      const sekil = e(`PRODUCT_DEFINITION_SHAPE('','',#${String(tanim)})`);
      e(`SHAPE_DEFINITION_REPRESENTATION(#${String(sekil)},#${String(temsil)})`);
      return { tanim };
    },
    metin: (dosyaAdi) => `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_NAME('${dosyaAdi}','',(''),(''),'','','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\nENDSEC;\nDATA;\n${s.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`,
  };
}

// Eksenlere hizalı, köşesi orijinde x*y*z kutu katısı.
function kutuKatisi(y_: StepYazici, x: number, y: number, z: number, ad: string): number {
  const { e, nok, yon } = y_;
  const k = [[0, 0, 0], [x, 0, 0], [x, y, 0], [0, y, 0], [0, 0, z], [x, 0, z], [x, y, z], [0, y, z]];
  const vx = k.map((p) => e(`VERTEX_POINT('',#${String(nok(p))})`));
  const kenarlar = new Map<string, number>();
  const kenar = (a: number, b: number): [number, boolean] => {
    const ana = a < b ? `${String(a)}-${String(b)}` : `${String(b)}-${String(a)}`;
    const [i, j] = a < b ? [a, b] : [b, a];
    let id = kenarlar.get(ana);
    if (id === undefined) {
      const pa = k[i]!, pb = k[j]!;
      const d = pb.map((v, m) => v - pa[m]!), l = Math.hypot(...d);
      const cizgi = e(`LINE('',#${String(nok(pa))},#${String(e(`VECTOR('',#${String(yon(d.map((v) => v / l)))},${l.toFixed(4)})`))})`);
      id = e(`EDGE_CURVE('',#${String(vx[i]!)},#${String(vx[j]!)},#${String(cizgi)},.T.)`);
      kenarlar.set(ana, id);
    }
    return [id, a < b];
  };
  const yuzler: [number[], number[]][] = [
    [[0, 3, 2, 1], [0, 0, -1]], [[4, 5, 6, 7], [0, 0, 1]], [[0, 1, 5, 4], [0, -1, 0]],
    [[1, 2, 6, 5], [1, 0, 0]], [[2, 3, 7, 6], [0, 1, 0]], [[3, 0, 4, 7], [-1, 0, 0]],
  ];
  const fids = yuzler.map(([d, nrm]) => {
    const oe = d.map((a, i) => { const [id, ileri] = kenar(a, d[(i + 1) % 4]!); return e(`ORIENTED_EDGE('',*,*,#${String(id)},${ileri ? '.T.' : '.F.'})`); });
    const dongu = e(`EDGE_LOOP('',(${oe.map((o) => `#${String(o)}`).join(',')}))`);
    const sinir = e(`FACE_OUTER_BOUND('',#${String(dongu)},.T.)`);
    const p0 = k[d[0]!]!, p1 = k[d[1]!]!;
    const rx = p1.map((v, m) => v - p0[m]!), l = Math.hypot(...rx);
    const ek = e(`AXIS2_PLACEMENT_3D('',#${String(nok(p0))},#${String(yon(nrm))},#${String(yon(rx.map((v) => v / l)))})`);
    const duz = e(`PLANE('',#${String(ek)})`);
    return e(`ADVANCED_FACE('',(#${String(sinir)}),#${String(duz)},.T.)`);
  });
  const kabuk = e(`CLOSED_SHELL('',(${fids.map((f) => `#${String(f)}`).join(',')}))`);
  return e(`MANIFOLD_SOLID_BREP('${ad}',#${String(kabuk)})`);
}

// Yalnız testler için (kart 2109): ölçüsü ve yapısı bilinen sentetik montaj (AP214 montaj yapısı: NEXT_ASSEMBLY_USAGE_OCCURRENCE ve
// yerleşim dönüşümü). Gerçek montaj dosyası depoya girmez.
// govde (kök montaj): taban 100x60x10 orijinde; pim 10x10x30 (20,10,10)'da ve z çevresinde 90 derece döndürülmüş (80,40,10)'da;
// tutucu-montaji iki kez, (40,0,10) ve (40,40,10)'da. tutucu-montaji: tutucu 20x20x20 orijinde, pim (5,5,20)'de.
// Toplam: taban 1, pim 4, tutucu 2; montaj düğümleri govde ve iki tutucu-montaji.
export function montajStep(): string {
  const y_ = stepYazici();
  const bag = y_.baglam();
  const uyg = y_.e("APPLICATION_CONTEXT('automotive design')");
  y_.e(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${String(uyg)})`);
  const parca = (ad: string, x: number, y: number, z: number): { tanim: number; temsil: number; eksen: number } => {
    const eksen = y_.eksen([0, 0, 0]);
    const temsil = y_.e(`ADVANCED_BREP_SHAPE_REPRESENTATION('${ad}',(#${String(eksen)},#${String(kutuKatisi(y_, x, y, z, ad))}),#${String(bag)})`);
    return { ...y_.urun(uyg, ad, temsil), temsil, eksen };
  };
  type Bilesen = { tanim: number; temsil: number; eksen: number };
  let ornek = 0;
  const montaj = (ad: string, altlar: { b: Bilesen; konum: number[]; x?: number[] }[]): Bilesen => {
    const eksen = y_.eksen([0, 0, 0]);
    const yerler = altlar.map((a) => y_.eksen(a.konum, a.x));
    const temsil = y_.e(`SHAPE_REPRESENTATION('${ad}',(${[eksen, ...yerler].map((i) => `#${String(i)}`).join(',')}),#${String(bag)})`);
    const { tanim } = y_.urun(uyg, ad, temsil);
    altlar.forEach((a, i) => {
      ornek++;
      const kullanim = y_.e(`NEXT_ASSEMBLY_USAGE_OCCURRENCE('${String(ornek)}','${String(ornek)}','',#${String(tanim)},#${String(a.b.tanim)},$)`);
      const sekil = y_.e(`PRODUCT_DEFINITION_SHAPE('','',#${String(kullanim)})`);
      const donusum = y_.e(`ITEM_DEFINED_TRANSFORMATION('','',#${String(a.b.eksen)},#${String(yerler[i]!)})`);
      const iliski = y_.e(`( REPRESENTATION_RELATIONSHIP('','',#${String(a.b.temsil)},#${String(temsil)}) REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#${String(donusum)}) SHAPE_REPRESENTATION_RELATIONSHIP() )`);
      y_.e(`CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#${String(iliski)},#${String(sekil)})`);
    });
    return { tanim, temsil, eksen };
  };
  const taban = parca('taban', 100, 60, 10);
  const pim = parca('pim', 10, 10, 30);
  const tutucu = parca('tutucu', 20, 20, 20);
  const tutucuMontaji = montaj('tutucu-montaji', [{ b: tutucu, konum: [0, 0, 0] }, { b: pim, konum: [5, 5, 20] }]);
  montaj('govde', [
    { b: taban, konum: [0, 0, 0] }, { b: pim, konum: [20, 10, 10] }, { b: pim, konum: [80, 40, 10], x: [0, 1, 0] },
    { b: tutucuMontaji, konum: [40, 0, 10] }, { b: tutucuMontaji, konum: [40, 40, 10] },
  ]);
  return y_.metin('govde.step');
}

// Yalnız testler için: 40x20x10 mm kutunun ortasından Ø10 geçen delikli kutu, libcascade ile üretilir (kart 1984). Üçüncü taraf ya da
// gerçek parça dosyası depoya girmez; yüzleri bilinir: 6 düzlem, 1 silindir (yarıçap 5, eksen z, yüz ters yönlü).
interface Uretici {
  BRepPrimAPI_MakeBox: new (x: number, y: number, z: number) => { Shape(): unknown };
  BRepPrimAPI_MakeCylinder: new (eksen: unknown, r: number, h: number) => { Shape(): unknown };
  BRepAlgoAPI_Cut: new (a: unknown, b: unknown, ilerleme: unknown) => { Shape(): unknown };
  gp_Ax2: new (p: unknown, d: unknown) => unknown;
  gp_Pnt: new (x: number, y: number, z: number) => unknown;
  gp_Dir: new (x: number, y: number, z: number) => unknown;
  Message_ProgressRange: new () => unknown;
  STEPControl_Writer: new () => { Transfer(s: unknown, tur: unknown, uyum: boolean, ilerleme: unknown): unknown; Write(ad: string): unknown };
  STEPControl_StepModelType: { STEPControl_AsIs: unknown };
  FS: { readFile(ad: string, s: { encoding: 'utf8' }): string; unlink(ad: string): void };
}
// Modül adı değişkenden: paketin 11 MB tip tanımı çözülmez (hesap-sureci.ts ile aynı neden).
const LIBCASCADE = 'libcascade/single/init';
export async function delikliKutuStep(): Promise<string> {
  const { createInstance } = (await import(LIBCASCADE)) as { createInstance: () => Promise<unknown> };
  const oc = (await createInstance()) as Uretici;
  const kutu = new oc.BRepPrimAPI_MakeBox(40, 20, 10).Shape();
  const sil = new oc.BRepPrimAPI_MakeCylinder(new oc.gp_Ax2(new oc.gp_Pnt(20, 10, -1), new oc.gp_Dir(0, 0, 1)), 5, 12).Shape();
  const sonuc = new oc.BRepAlgoAPI_Cut(kutu, sil, new oc.Message_ProgressRange()).Shape();
  const yazici = new oc.STEPControl_Writer();
  yazici.Transfer(sonuc, oc.STEPControl_StepModelType.STEPControl_AsIs, true, new oc.Message_ProgressRange());
  yazici.Write('/delikli.stp');
  const metin = oc.FS.readFile('/delikli.stp', { encoding: 'utf8' });
  oc.FS.unlink('/delikli.stp');
  return metin;
}

// Yalnız testler için (kart 2044): ölçüsü bilinen özellikli sentetik parça, libcascade ile üretilir. 60x30x20 blok; üst yüz z=20.
// - A (15,15): Ø10 geçiş deliği, üstte 90 derece havşa (Ø16'ya).
// - B (40,24): Ø6 kör delik, 8 mm silindir ve 118 derece matkap ucu.
// - C (52,8): Ø6 geçiş deliği, üstte Ø11 x 4 kademe.
// - D: z=8, y=15'te x boyunca Ø8 geçiş deliği; A'yı keser.
// - x=0, y=0 dikey dış kenarında R2 radyüs; x=60, y=30 dikey dış kenarında 1,5 mm pah.
// - E (25,24): Ø5 x 6 düz dipli kör delik.
interface UreticiOzellik extends Uretici {
  BRepPrimAPI_MakeCone: new (eksen: unknown, r1: number, r2: number, h: number) => { Shape(): unknown };
  BRepAlgoAPI_Fuse: new (a: unknown, b: unknown, ilerleme: unknown) => { Shape(): unknown };
  BRepFilletAPI_MakeFillet: new (s: unknown) => { Add(r: number, e: unknown): void; Shape(): unknown };
  BRepFilletAPI_MakeChamfer: new (s: unknown) => { Add(d: number, e: unknown): void; Shape(): unknown };
  TopExp_Explorer: new (s: unknown, bul: string, kacin: string) => { More(): boolean; Next(): void; Current(): unknown };
  TopAbs_ShapeEnum: { TopAbs_EDGE: string; TopAbs_SHAPE: string };
  TopoDS: { Edge(s: unknown): unknown };
  Bnd_Box: new () => { GetXMin(): number; GetXMax(): number; GetYMin(): number; GetYMax(): number; GetZMin(): number; GetZMax(): number };
  BRepBndLib: { Add(s: unknown, k: unknown, ucgen: boolean): void };
}
export async function ozellikliParcaStep(): Promise<string> {
  const { createInstance } = (await import(LIBCASCADE)) as { createInstance: () => Promise<unknown> };
  const oc = (await createInstance()) as UreticiOzellik;
  const ilerleme = (): unknown => new oc.Message_ProgressRange();
  const eksen = (x: number, y: number, z: number, d: [number, number, number]): unknown => new oc.gp_Ax2(new oc.gp_Pnt(x, y, z), new oc.gp_Dir(...d));
  const kes = (a: unknown, b: unknown): unknown => new oc.BRepAlgoAPI_Cut(a, b, ilerleme()).Shape();
  const birles = (a: unknown, b: unknown): unknown => new oc.BRepAlgoAPI_Fuse(a, b, ilerleme()).Shape();
  const silindir = (x: number, y: number, z: number, r: number, h: number, d: [number, number, number] = [0, 0, 1]): unknown =>
    new oc.BRepPrimAPI_MakeCylinder(eksen(x, y, z, d), r, h).Shape();
  const koni = (x: number, y: number, z: number, r1: number, r2: number, h: number): unknown => new oc.BRepPrimAPI_MakeCone(eksen(x, y, z, [0, 0, 1]), r1, r2, h).Shape();
  // Dikey kenar (x, y) noktasında: kutusu o noktada ince olan kenar.
  const dikeyKenar = (s: unknown, x: number, y: number): unknown => {
    for (const k = new oc.TopExp_Explorer(s, oc.TopAbs_ShapeEnum.TopAbs_EDGE, oc.TopAbs_ShapeEnum.TopAbs_SHAPE); k.More(); k.Next()) {
      const b = new oc.Bnd_Box();
      oc.BRepBndLib.Add(k.Current(), b, false);
      if (Math.abs(b.GetXMin() - x) < 1e-3 && Math.abs(b.GetXMax() - x) < 1e-3 && Math.abs(b.GetYMin() - y) < 1e-3 && Math.abs(b.GetYMax() - y) < 1e-3) return oc.TopoDS.Edge(k.Current());
    }
    throw new Error('kenar yok');
  };
  let s: unknown = new oc.BRepPrimAPI_MakeBox(60, 30, 20).Shape();
  const radyus = new oc.BRepFilletAPI_MakeFillet(s);
  radyus.Add(2, dikeyKenar(s, 0, 0));
  s = radyus.Shape();
  const pah = new oc.BRepFilletAPI_MakeChamfer(s);
  pah.Add(1.5, dikeyKenar(s, 60, 30));
  s = pah.Shape();
  s = kes(s, silindir(15, 15, -1, 5, 22));
  s = kes(s, koni(15, 15, 17, 5, 8, 3));
  const r = 3, h = r / Math.tan((59 * Math.PI) / 180);
  s = kes(s, birles(silindir(40, 24, 12, r, 9), koni(40, 24, 12 - h, 0, r, h)));
  s = kes(s, silindir(52, 8, -1, 3, 22));
  s = kes(s, silindir(52, 8, 16, 5.5, 5));
  s = kes(s, silindir(-1, 15, 8, 4, 62, [1, 0, 0]));
  s = kes(s, silindir(25, 24, 14, 2.5, 7));
  const yazici = new oc.STEPControl_Writer();
  yazici.Transfer(s, oc.STEPControl_StepModelType.STEPControl_AsIs, true, ilerleme());
  yazici.Write('/ozellikli.stp');
  const metin = oc.FS.readFile('/ozellikli.stp', { encoding: 'utf8' });
  oc.FS.unlink('/ozellikli.stp');
  return metin;
}
