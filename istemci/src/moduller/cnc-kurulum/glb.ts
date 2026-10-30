// Ekranın 3B makine nesnesini glTF 2.0 ikili dosyasına (GLB) çevirir. Kullanılan THREE sürümünde dışa aktarıcı yoktur ve
// paket eklenmez; makine modelleri yalnız dokusuz ağ ve standart malzeme taşır.
// Dönüşümler köşelere işlenir (her ağ tek düğüm); birim metre, yukarı Y: glTF'in kendi düzeni.

export interface GlbAgi {
  isMesh?: boolean;
  visible: boolean;
  matrixWorld: { elements: ArrayLike<number>; determinant(): number };
  geometry?: {
    index: { count: number; getX(i: number): number } | null;
    attributes: Record<string, { count: number; getX(i: number): number; getY(i: number): number; getZ(i: number): number } | undefined>;
  };
  material?: unknown;
  children: GlbAgi[];
  updateMatrixWorld(zorla: boolean): void;
}

export function glbYaz(kok: GlbAgi, ad: string): Uint8Array {
  kok.updateMatrixWorld(true);
  const agler: GlbAgi[] = [];
  const gez = (n: GlbAgi): void => {
    if (!n.visible) return;
    if (n.isMesh === true && n.geometry && !Array.isArray(n.material)) agler.push(n);
    n.children.forEach(gez);
  };
  gez(kok);

  const parcalar: Uint8Array[] = [];
  let bayt = 0;
  const bufferViews: Record<string, unknown>[] = [];
  const accessors: Record<string, unknown>[] = [];
  const ekle = (veri: Float32Array | Uint32Array, hedef: number): number => {
    const ham = new Uint8Array(veri.buffer, veri.byteOffset, veri.byteLength);
    parcalar.push(ham);
    bufferViews.push({ buffer: 0, byteOffset: bayt, byteLength: ham.length, target: hedef });
    bayt += ham.length;
    // Her parça 4 bayt hizalıdır (Float32 ve Uint32 zaten hizalı).
    return bufferViews.length - 1;
  };

  const malzemeler: Record<string, unknown>[] = [];
  const malzemeNo = new Map<unknown, number>();
  const sayi = (v: unknown, varsayilan: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : varsayilan);
  const renk = (v: unknown): number[] => {
    const r = v as { r?: unknown; g?: unknown; b?: unknown } | null;
    return r && typeof r === 'object' ? [sayi(r.r, 1), sayi(r.g, 1), sayi(r.b, 1)] : [1, 1, 1];
  };
  const malzeme = (m: unknown): number => {
    const bilinen = malzemeNo.get(m);
    if (bilinen !== undefined) return bilinen;
    const o = (m ?? {}) as Record<string, unknown>;
    const opaklik = o['transparent'] === true ? sayi(o['opacity'], 1) : 1;
    const g: Record<string, unknown> = {
      pbrMetallicRoughness: {
        baseColorFactor: [...renk(o['color']), opaklik],
        metallicFactor: Math.min(1, Math.max(0, sayi(o['metalness'], 0))),
        roughnessFactor: Math.min(1, Math.max(0, sayi(o['roughness'], 1))),
      },
    };
    const parlak = renk(o['emissive']).map((c) => c * sayi(o['emissiveIntensity'], 1));
    if (o['emissive'] && parlak.some((c) => c > 0)) g['emissiveFactor'] = parlak.map((c) => Math.min(1, c));
    if (opaklik < 1) g['alphaMode'] = 'BLEND';
    // THREE.DoubleSide = 2
    if (o['side'] === 2) g['doubleSided'] = true;
    malzemeler.push(g);
    malzemeNo.set(m, malzemeler.length - 1);
    return malzemeler.length - 1;
  };

  const meshes: Record<string, unknown>[] = [];
  for (const ag of agler) {
    const geo = ag.geometry!;
    const konum = geo.attributes['position'];
    if (!konum || konum.count === 0) continue;
    const n = konum.count;
    // Aynalayan dönüşüm (negatif belirteç) üçgenin yönünü ters çevirir; ön yüz korunsun diye sıra çevrilir.
    const indis = geo.index;
    const adet = indis ? indis.count : n;
    const s = new Uint32Array(adet - (adet % 3));
    for (let i = 0; i < s.length; i++) s[i] = indis ? indis.getX(i) : i;
    if (ag.matrixWorld.determinant() < 0) {
      for (let i = 0; i < s.length; i += 3) { const x = s[i + 1] ?? 0; s[i + 1] = s[i + 2] ?? 0; s[i + 2] = x; }
    }
    if (s.length === 0) continue;
    const e = ag.matrixWorld.elements;
    const p = new Float32Array(n * 3);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < n; i++) {
      const x = konum.getX(i); const y = konum.getY(i); const z = konum.getZ(i);
      const d = [
        (e[0] ?? 0) * x + (e[4] ?? 0) * y + (e[8] ?? 0) * z + (e[12] ?? 0),
        (e[1] ?? 0) * x + (e[5] ?? 0) * y + (e[9] ?? 0) * z + (e[13] ?? 0),
        (e[2] ?? 0) * x + (e[6] ?? 0) * y + (e[10] ?? 0) * z + (e[14] ?? 0),
      ];
      for (let k = 0; k < 3; k++) {
        const v = Math.fround(d[k] ?? 0);
        p[i * 3 + k] = v;
        if (v < (min[k] ?? 0)) min[k] = v;
        if (v > (max[k] ?? 0)) max[k] = v;
      }
    }
    const nitelikler: Record<string, number> = {};
    accessors.push({ bufferView: ekle(p, 34962), componentType: 5126, count: n, type: 'VEC3', min, max });
    nitelikler['POSITION'] = accessors.length - 1;

    // Normal, dönüşümün ters devriğiyle döner; ölçek bozduğu boyu yeniden birim yapılır.
    const normal = geo.attributes['normal'];
    if (normal && normal.count === n) {
      const a = e[0] ?? 0; const b = e[4] ?? 0; const c = e[8] ?? 0;
      const d = e[1] ?? 0; const f = e[5] ?? 0; const g = e[9] ?? 0;
      const h = e[2] ?? 0; const k = e[6] ?? 0; const l = e[10] ?? 0;
      const det = a * (f * l - g * k) - b * (d * l - g * h) + c * (d * k - f * h) || 1;
      const t = [
        (f * l - g * k) / det, (g * h - d * l) / det, (d * k - f * h) / det,
        (c * k - b * l) / det, (a * l - c * h) / det, (b * h - a * k) / det,
        (b * g - c * f) / det, (c * d - a * g) / det, (a * f - b * d) / det,
      ];
      const q = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const x = normal.getX(i); const y = normal.getY(i); const z = normal.getZ(i);
        const nx = (t[0] ?? 0) * x + (t[1] ?? 0) * y + (t[2] ?? 0) * z;
        const ny = (t[3] ?? 0) * x + (t[4] ?? 0) * y + (t[5] ?? 0) * z;
        const nz = (t[6] ?? 0) * x + (t[7] ?? 0) * y + (t[8] ?? 0) * z;
        const boy = Math.hypot(nx, ny, nz) || 1;
        q[i * 3] = nx / boy; q[i * 3 + 1] = ny / boy; q[i * 3 + 2] = nz / boy;
      }
      accessors.push({ bufferView: ekle(q, 34962), componentType: 5126, count: n, type: 'VEC3' });
      nitelikler['NORMAL'] = accessors.length - 1;
    }

    accessors.push({ bufferView: ekle(s, 34963), componentType: 5125, count: s.length, type: 'SCALAR' });
    meshes.push({ primitives: [{ attributes: nitelikler, indices: accessors.length - 1, material: malzeme(ag.material), mode: 4 }] });
  }

  const nodes = meshes.map((_, i) => ({ mesh: i }));
  const gltf = {
    asset: { version: '2.0', generator: 'TMI CNC Kurulum Motoru' },
    scene: 0,
    scenes: [{ name: ad, nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials: malzemeler,
    accessors,
    bufferViews,
    buffers: [{ byteLength: bayt }],
  };

  const metin = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonBoy = (metin.length + 3) & ~3;
  const ikiliBoy = (bayt + 3) & ~3;
  const toplam = 12 + 8 + jsonBoy + 8 + ikiliBoy;
  const cikti = new Uint8Array(toplam);
  const v = new DataView(cikti.buffer);
  v.setUint32(0, 0x46546c67, true); // "glTF"
  v.setUint32(4, 2, true);
  v.setUint32(8, toplam, true);
  v.setUint32(12, jsonBoy, true);
  v.setUint32(16, 0x4e4f534a, true); // "JSON"
  cikti.set(metin, 20);
  // JSON parçası boşlukla doldurulur (glTF kuralı).
  cikti.fill(0x20, 20 + metin.length, 20 + jsonBoy);
  const ikiliBas = 20 + jsonBoy;
  v.setUint32(ikiliBas, ikiliBoy, true);
  v.setUint32(ikiliBas + 4, 0x004e4942, true); // "BIN"
  let o = ikiliBas + 8;
  for (const parca of parcalar) { cikti.set(parca, o); o += parca.length; }
  return cikti;
}
