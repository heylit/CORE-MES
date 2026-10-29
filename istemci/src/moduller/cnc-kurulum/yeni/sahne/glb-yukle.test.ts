import { afterEach, describe, expect, it, vi } from 'vitest';
import { Box3, BoxGeometry, Group, Mesh, MeshStandardMaterial, Scene, Vector3, type Object3D } from 'three';
import type { CncModel } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import type { Kalem } from '../veri/tipler.ts';
import { build, dispose } from './cnc3d.ts';
import { hedefAnahtari, kutuyaOturt, modelDurumu, modelGuncelle, modelIste, modelKopyasi, modelleriUnut } from './glb-yukle.ts';

// Makine, aparat ve belge adları uydurmadır; modeller adlandırılmış kutulardan kurulur.
function tezgahAgaci(adlar: readonly string[]): Group {
  const kok = new Group();
  adlar.forEach((ad, i) => {
    const m = new Mesh(new BoxGeometry(1, 2, 1), new MeshStandardMaterial());
    m.name = ad;
    m.position.set(i * 2, 1, 0);
    kok.add(m);
  });
  return kok;
}
// Elle yazılmış GLB: her düğüm adıyla, aynı küçük üçgeni taşır (ekranın GLB yazıcısı düğüm adı yazmaz).
function glb(adlar: readonly string[]): ArrayBuffer {
  const konum = new Uint8Array(new Float32Array([0, 0, 0, 1, 0, 0, 0, 2, 1]).buffer);
  const json = new TextEncoder().encode(JSON.stringify({
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: adlar.map((_, i) => i) }],
    nodes: adlar.map((name, i) => ({ name, mesh: 0, translation: [i * 2, 0, 0] })),
    meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0, 0, 0], max: [1, 2, 1] }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: konum.length }], buffers: [{ byteLength: konum.length }],
  }));
  const jsonBoy = Math.ceil(json.length / 4) * 4, toplam = 12 + 8 + jsonBoy + 8 + konum.length;
  const b = new Uint8Array(toplam), v = new DataView(b.buffer);
  b.set(new TextEncoder().encode('glTF'), 0);
  v.setUint32(4, 2, true); v.setUint32(8, toplam, true);
  v.setUint32(12, jsonBoy, true); v.setUint32(16, 0x4e4f534a, true);
  b.fill(0x20, 20, 20 + jsonBoy); b.set(json, 20);
  const o = 20 + jsonBoy;
  v.setUint32(o, konum.length, true); v.setUint32(o + 4, 0x004e4942, true);
  b.set(konum, o + 8);
  return b.buffer;
}
const belge = (belgeId: number, ozet: string) => ({ belgeId, ad: `Deneme ${String(belgeId)}`, harf: 'A', ozet, dosyaTuru: 'glb' as const });
const MAKINE: CncModel = { id: 1, hedef: { tur: 'makine', makineId: 7 }, belge: belge(11, 'a1'), surum: 1 };
const APARAT: CncModel = { id: 2, hedef: { tur: 'aparat', anahtar: 'vise125' }, belge: belge(12, 'b1'), surum: 1 };
const json = (govde: unknown) => new Response(JSON.stringify(govde), { status: 200, headers: { 'content-type': 'application/json' } });

// Sunucu: bağ listesi ve dosyalar; istenen adresler sayılır.
function sunucu(modeller: CncModel[], dosyalar: Record<number, ArrayBuffer | null>) {
  const getir = vi.fn((adres: string) => {
    if (adres.endsWith('/cnc-kurulum/modeller')) return Promise.resolve(json({ modeller }));
    const m = /modeller\/(\d+)\/dosya$/.exec(adres);
    const d = m ? dosyalar[Number(m[1])] : undefined;
    if (d === undefined) return Promise.resolve(new Response(null, { status: 500 }));
    return Promise.resolve(d === null ? new Response(null, { status: 204 }) : new Response(d.slice(0), { status: 200 }));
  });
  vi.stubGlobal('fetch', (adres: RequestInfo | URL) => getir(String(adres instanceof Request ? adres.url : adres)));
  return getir;
}
const adli = (o: Object3D, ad: string) => o.getObjectByName(ad) !== undefined;
const BEKLE = { timeout: 10_000 };
const bekle = () => new Promise((r) => { setTimeout(r, 0); });

afterEach(() => { vi.unstubAllGlobals(); modelleriUnut(); });

describe('3B modeller (1212 a)', () => {
  it('GM-01: model gövdenin kutusuna oturur (en uzun kenar, taban ve orta aynı); kopyanın geometri ve malzemesi kendinindir', () => {
    const kaynak = tezgahAgaci(['taban', 'tabla', 'is-mili']);
    const kopya = modelKopyasi(kaynak);
    const ilk = kopya.children[0] as Mesh, asil = kaynak.children[0] as Mesh;
    expect(ilk.geometry).not.toBe(asil.geometry);
    expect((ilk.material as MeshStandardMaterial).userData['own']).toBe(true);
    const hedef = new Box3(new Vector3(-1, 0.5, -2), new Vector3(1, 1.5, 4));
    const g = kutuyaOturt(kopya, hedef);
    g.updateMatrixWorld(true);
    const k = new Box3().setFromObject(g), boy = k.getSize(new Vector3());
    expect(Math.max(boy.x, boy.y, boy.z)).toBeCloseTo(6, 6);
    expect(k.min.y).toBeCloseTo(0.5, 6);
    expect(k.getCenter(new Vector3()).x).toBeCloseTo(0, 6);
    expect(k.getCenter(new Vector3()).z).toBeCloseTo(1, 6);
  });

  it('GM-02: bağ listesi bir kez okunur; bağlı hedefin dosyası bir kez iner, bağsız hedef yok, inmeyen dosya yeniden denenir', async () => {
    const getir = sunucu([MAKINE, APARAT], { 1: glb(['taban']) });
    expect(modelIste('makine:7').durum).toBe('yukleniyor');
    modelIste('aparat:vise125');
    modelIste('aparat:bos');
    await vi.waitFor(() => { expect(modelDurumu('makine:7')?.durum).toBe('hazir'); }, BEKLE);
    await vi.waitFor(() => { expect(modelDurumu('aparat:vise125')?.durum).toBe('hata'); }, BEKLE);
    expect(modelDurumu('aparat:bos')?.durum).toBe('yok');
    expect(modelIste('makine:7').durum).toBe('hazir');
    expect(getir.mock.calls.map((c) => c[0]).filter((a) => a.endsWith('/modeller'))).toHaveLength(1);
    expect(getir.mock.calls.filter((c) => c[0].endsWith('/1/dosya'))).toHaveLength(1);
    sunucu([MAKINE, APARAT], { 1: glb(['taban']), 2: glb(['mengene']) });
    expect(modelIste('aparat:vise125').durum).toBe('yukleniyor');
    await vi.waitFor(() => { expect(modelDurumu('aparat:vise125')?.durum).toBe('hazir'); }, BEKLE);
  });

  it('GM-03: sunucu tezgâhının ve aparatın gövdesi model inince yerinde değişir; gömülü tezgâh ve sahneden kalkmış gövde değişmez', async () => {
    sunucu([MAKINE, APARAT], { 1: glb(['taban', 'tabla']), 2: glb(['mengene']) });
    const gomulu = build({ id: 'f1', name: 'Gömülü', kind: 'm_vmc' } as Kalem);
    const tezgah = build({ id: 'mk7', name: 'Sunucu', kind: 'm_vmc', makineId: 7, type: 'mill' } as unknown as Kalem);
    const kalkan = build({ id: 'mk7', name: 'Sunucu', kind: 'm_vmc', makineId: 7, type: 'mill' } as unknown as Kalem);
    const aparat = build({ id: 'vise125', name: 'Mengene', kind: 'f_vise' } as Kalem);
    const sahne = new Scene();
    sahne.add(tezgah, aparat);
    const once = new Box3().setFromObject(tezgah);
    await vi.waitFor(() => { expect(adli(tezgah, 'tabla') && adli(aparat, 'mengene')).toBe(true); }, BEKLE);
    await bekle();
    expect(adli(kalkan, 'tabla')).toBe(false);
    expect(adli(gomulu, 'tabla')).toBe(false);
    const sonra = new Box3().setFromObject(tezgah), s1 = once.getSize(new Vector3()), s2 = sonra.getSize(new Vector3());
    expect(Math.max(s2.x, s2.y, s2.z)).toBeCloseTo(Math.max(s1.x, s1.y, s1.z), 6);
    expect(sonra.min.y).toBeCloseTo(once.min.y, 6);
    // Bellekteki model hazırsa yeni gövde hemen modelle kurulur.
    const ikinci = build({ id: 'mk7', name: 'Sunucu', kind: 'm_vmc', makineId: 7, type: 'mill' } as unknown as Kalem);
    expect(adli(ikinci, 'taban')).toBe(true);
    for (const o of [gomulu, tezgah, kalkan, aparat, ikinci]) dispose(o);
  });

  it('GM-04: bağ Tanımlar\'dan değişince sahnedeki gövde yeni modele, bağ kalkınca çizilen gövdeye döner', async () => {
    sunucu([MAKINE], { 1: glb(['taban']), 3: glb(['yeni-govde']), 4: null });
    const tezgah = build({ id: 'mk7', name: 'Sunucu', kind: 'm_vmc', makineId: 7, type: 'mill' } as unknown as Kalem);
    new Scene().add(tezgah);
    await vi.waitFor(() => { expect(adli(tezgah, 'taban')).toBe(true); }, BEKLE);
    modelGuncelle({ ...MAKINE, id: 3, belge: belge(13, 'c1'), surum: 2 });
    await vi.waitFor(() => { expect(adli(tezgah, 'yeni-govde')).toBe(true); }, BEKLE);
    modelGuncelle({ ...MAKINE, id: 3, belge: null, surum: 3 });
    await vi.waitFor(() => { expect(adli(tezgah, 'yeni-govde')).toBe(false); }, BEKLE);
    expect(adli(tezgah, 'taban')).toBe(false);
    expect(new Box3().setFromObject(tezgah).isEmpty()).toBe(false);
    expect(hedefAnahtari({ tur: 'aparat', anahtar: 'x' })).toBe('aparat:x');
    dispose(tezgah);
  });
});
