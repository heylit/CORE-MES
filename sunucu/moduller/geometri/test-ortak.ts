// Yalnız testler için: eksenlere hizalı kutunun en küçük STEP (AP214) dosyası. Gerçek parça dosyası depoya girmez; ölçüsü bilinen sentetik
// model ayrı süreçte okunur ve sonuç kesin değerle karşılaştırılır.
export function kutuStep(x: number, y: number, z: number): string {
  const s: string[] = [];
  let n = 0;
  const e = (t: string): number => { s.push(`#${String(++n)}=${t};`); return n; };
  const nok = (p: number[]): number => e(`CARTESIAN_POINT('',(${p.map((v) => v.toFixed(4)).join(',')}))`);
  const yon = (d: number[]): number => e(`DIRECTION('',(${d.map((v) => v.toFixed(4)).join(',')}))`);
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
  const kati = e(`MANIFOLD_SOLID_BREP('kutu',#${String(kabuk)})`);
  const uz = e('( LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.) )');
  const aci = e('( NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.) )');
  const kat = e('( NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT() )');
  const bel = e(`UNCERTAINTY_MEASURE_WITH_UNIT(LENGTH_MEASURE(1.E-07),#${String(uz)},'distance_accuracy_value','')`);
  const bag = e(`( GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNCERTAINTY_ASSIGNED_CONTEXT((#${String(bel)})) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${String(uz)},#${String(aci)},#${String(kat)})) REPRESENTATION_CONTEXT('','') )`);
  const kok = e(`AXIS2_PLACEMENT_3D('',#${String(nok([0, 0, 0]))},#${String(yon([0, 0, 1]))},#${String(yon([1, 0, 0]))})`);
  const temsil = e(`ADVANCED_BREP_SHAPE_REPRESENTATION('',(#${String(kok)},#${String(kati)}),#${String(bag)})`);
  const uyg = e("APPLICATION_CONTEXT('automotive design')");
  e(`APPLICATION_PROTOCOL_DEFINITION('international standard','automotive_design',2000,#${String(uyg)})`);
  const urunBag = e(`PRODUCT_CONTEXT('',#${String(uyg)},'mechanical')`);
  const urun = e(`PRODUCT('kutu','kutu','',(#${String(urunBag)}))`);
  const bicim = e(`PRODUCT_DEFINITION_FORMATION('','',#${String(urun)})`);
  const tanimBag = e(`PRODUCT_DEFINITION_CONTEXT('part definition',#${String(uyg)},'design')`);
  const tanim = e(`PRODUCT_DEFINITION('design','',#${String(bicim)},#${String(tanimBag)})`);
  const sekil = e(`PRODUCT_DEFINITION_SHAPE('','',#${String(tanim)})`);
  e(`SHAPE_DEFINITION_REPRESENTATION(#${String(sekil)},#${String(temsil)})`);
  return `ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION((''),'2;1');\nFILE_NAME('kutu.step','',(''),(''),'','','');\nFILE_SCHEMA(('AUTOMOTIVE_DESIGN { 1 0 10303 214 1 1 1 1 }'));\nENDSEC;\nDATA;\n${s.join('\n')}\nENDSEC;\nEND-ISO-10303-21;\n`;
}
