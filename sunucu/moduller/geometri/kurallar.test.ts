import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  agOlcumu, bicimDenetimi, bilesenListesi, kapsayanDaireCapi, enAzHam, stokEslestir, EN_COK_DENEME, hataMetniKisalt, hataSonrasiDurum, HATA_METNI_EN_UZUN, ILETILER,
  MONTAJ_AD_EN_UZUN, MONTAJ_DUGUM_EN_COK, montajAdi, montajAgaci,
} from './kurallar.ts';
import type { AdliAg, OcctDugumu, StokAdayi, UcgenAgi } from './kurallar.ts';

// Eksenlere hizalı kutu ağı: 8 köşe, 12 üçgen, dışa bakan yüzler.
function kutu(x: number, y: number, z: number, d: [number, number, number] = [0, 0, 0]): UcgenAgi {
  const k = [[0, 0, 0], [x, 0, 0], [x, y, 0], [0, y, 0], [0, 0, z], [x, 0, z], [x, y, z], [0, y, z]].flatMap((p) => p.map((v, i) => v + d[i]!));
  const yuz = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7]];
  return { konum: k, indeks: yuz.flatMap(([a, b, c, e]) => [a!, b!, c!, a!, c!, e!]) };
}

// Ağı z ekseni çevresinde döndürür.
function dondur(ag: UcgenAgi, derece: number): UcgenAgi {
  const r = (derece * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  const k = Array.from(ag.konum);
  for (let i = 0; i < k.length; i += 3) { const x = k[i]!, y = k[i + 1]!; k[i] = c * x - s * y; k[i + 1] = s * x + c * y; }
  return { konum: k, indeks: ag.indeks };
}

describe('geometri kuralları', () => {
  test('G-K1 kutu: dış kutu, hacim, alan, kapalılık', () => {
    const o = agOlcumu([kutu(40, 20, 10)])!;
    assert.deepEqual(o.kutu, { x: 40, y: 20, z: 10 });
    assert.deepEqual([o.obb.a, o.obb.b, o.obb.c], [40, 20, 10]);
    assert.equal(o.hacimMm3, 8000);
    assert.equal(o.alanMm2, 2 * (800 + 400 + 200));
    assert.equal(o.kapali, true);
    assert.equal(o.ucgenSayisi, 12);
    assert.equal(o.govdeSayisi, 1);
  });

  test('G-K2 döndürülmüş parça: eksenli kutu büyür, döndürülmüş kutu parçanın kendi ölçüsünü bulur', () => {
    const o = agOlcumu([dondur(kutu(100, 20, 10), 30)])!;
    assert.ok(o.kutu.x > 90 && o.kutu.y > 60, 'eksenli kutu döndürmeyle büyür');
    assert.ok(Math.abs(o.obb.a - 100) < 1e-3 && Math.abs(o.obb.b - 20) < 1e-3 && Math.abs(o.obb.c - 10) < 1e-3, JSON.stringify(o.obb));
    assert.ok(Math.abs(o.hacimMm3! - 20000) < 1e-3);
    for (const y of o.obb.yon) assert.ok(Math.abs(Math.hypot(...y) - 1) < 1e-6, 'yön birim vektör');
  });

  test('G-K3 açık ağ: hacim null (sıfır uydurulmaz), kapalı değil', () => {
    const ag = kutu(10, 10, 10);
    const acik = { konum: ag.konum, indeks: Array.from(ag.indeks).slice(0, -6) };
    const o = agOlcumu([acik])!;
    assert.equal(o.kapali, false);
    assert.equal(o.hacimMm3, null);
    assert.equal(o.alanMm2, 500);
  });

  test('G-K4 iki gövde: hacimler toplanır, kutu ikisini kapsar; boş ağ null', () => {
    const o = agOlcumu([kutu(10, 10, 10), kutu(10, 10, 10, [20, 0, 0])])!;
    assert.equal(o.govdeSayisi, 2);
    assert.equal(o.hacimMm3, 2000);
    assert.deepEqual(o.kutu, { x: 30, y: 10, z: 10 });
    assert.equal(agOlcumu([]), null);
    assert.equal(agOlcumu([{ konum: [], indeks: [] }]), null);
  });

  test('G-K8 kapsayan daire: kutuda kesit köşegeni, düzgün çokgen prizmada çevrel çap (döner parça)', () => {
    assert.ok(Math.abs(agOlcumu([kutu(40, 20, 10)])!.obb.cap - Math.hypot(20, 10)) < 1e-3);
    const n = 64, r = 12.5, h = 80;
    const konum: number[] = [], indeks: number[] = [];
    for (let i = 0; i < n; i++) { const t = (2 * Math.PI * i) / n; konum.push(r * Math.cos(t), r * Math.sin(t), 0, r * Math.cos(t), r * Math.sin(t), h); }
    for (let i = 0; i < n; i++) { const a = 2 * i, b = 2 * ((i + 1) % n); indeks.push(a, b, b + 1, a, b + 1, a + 1); }
    const o = agOlcumu([{ konum, indeks }])!;
    assert.equal(o.obb.a, 80);
    assert.ok(Math.abs(o.obb.cap - 25) < 1e-3, String(o.obb.cap));
    assert.ok(Math.abs(kapsayanDaireCapi([[0, 0], [10, 0], [5, 1]]) - 10) < 1e-9, 'geniş açılı üçgende çap en uzun kenardır');
    assert.equal(kapsayanDaireCapi([[3, 4]]), 0);
  });

  test('G-K5 ham: her kenara iki yüzün payı eklenir', () => {
    assert.deepEqual(enAzHam({ a: 100, b: 20, c: 10 }, 3), { a: 106, b: 26, c: 16 });
    assert.deepEqual(enAzHam({ a: 100, b: 20, c: 10 }, 0), { a: 100, b: 20, c: 10 });
  });

  test('G-K9 stok ölçüsü: her formda sığan en küçük, sığmayan ve ölçüsü eksik aday önerilmez', () => {
    const aday = (malzemeNo: number, form: string, olcu: Record<string, unknown>): StokAdayi => ({ malzemeNo, kod: `K${malzemeNo}`, ad: null, kalite: 'C45', form, olcu });
    const obb = { a: 40, b: 20, c: 10, cap: Math.hypot(20, 10) };
    const o = stokEslestir(obb, 1, [
      aday(1, 'cubuk', { d: 24, l: 3000 }), aday(2, 'cubuk', { d: 25, l: 3000 }), aday(3, 'cubuk', { d: 30, l: 3000 }),
      aday(4, 'lama', { a: 12, b: 25, l: 6000 }), aday(5, 'lama', { a: 22, b: 12, l: 6000 }), aday(6, 'lama', { a: 22, b: 11, l: 6000 }),
      aday(7, 'levha', { t: 12, w: 1000, l: 2000 }), aday(8, 'levha', { t: 12, w: 21, l: 2000 }),
      aday(9, 'blok', { a: 50, b: 30, h: 15 }), aday(10, 'cubuk', { d: 40, l: 0 }), aday(11, 'cubuk', { d: '40', l: 3000 }),
      aday(12, 'boru', { D: 60, t: 5, l: 6000 }), aday(13, 'cubuk', { d: 25, l: 41 }),
    ]);
    assert.deepEqual(o.map((x) => [x.form, x.malzemeNo]), [['lama', 5], ['levha', 7], ['cubuk', 2], ['blok', 9]]);
    const cubuk = o.find((x) => x.form === 'cubuk')!;
    assert.equal(cubuk.kesimBoyuMm, 42);
    assert.ok(Math.abs(cubuk.hamHacimMm3 - (Math.PI * 25 ** 2 / 4) * 42) < 1e-3);
    assert.equal(o.find((x) => x.form === 'blok')!.kesimBoyuMm, null);
    assert.deepEqual(stokEslestir(obb, 50, [aday(1, 'cubuk', { d: 30, l: 3000 })]), []);
  });

  test('G-K6 biçim denetimi: STEP başlığı ve IGES başlangıç bölümü', () => {
    assert.equal(bicimDenetimi('step', Buffer.from('ISO-10303-21;\nHEADER;')), null);
    assert.equal(bicimDenetimi('step', Buffer.from('%PDF-1.4')), ILETILER.bicimYanlis);
    assert.equal(bicimDenetimi('iges', Buffer.from(`${'x'.padEnd(72)}S      1\n`)), null);
    assert.equal(bicimDenetimi('iges', Buffer.from('ISO-10303-21;')), ILETILER.bicimYanlis);
  });

  test('G-K7 yineleme: kalıcı hata hemen, geçici hata sınırda biter; hata metni kısalır', () => {
    assert.equal(hataSonrasiDurum(1, true), 'hata');
    assert.equal(hataSonrasiDurum(1, false), 'bekliyor');
    assert.equal(hataSonrasiDurum(EN_COK_DENEME, false), 'hata');
    assert.equal(hataMetniKisalt('x'.repeat(HATA_METNI_EN_UZUN + 10)).length, HATA_METNI_EN_UZUN);
    assert.equal(hataMetniKisalt('  '), ILETILER.okunamadi);
  });

  // occt-import-js biçimi: düğümler montaj, parçalar düğümün ağları; ağ konumları dünya koordinatında.
  const ag = (ad: string | null, x: number, y: number, z: number, d: [number, number, number] = [0, 0, 0]): AdliAg => ({ ad, ...kutu(x, y, z, d) });

  test('GEO-MO1 montaj ağacı: adsız dosya kökü atlanır, ön sıralı düğümler, montaj kutusu altlarını kapsar', () => {
    const aglar = [ag('taban', 100, 60, 10), ag('pim', 10, 10, 30, [20, 10, 10]), ag('tutucu', 20, 20, 20, [40, 0, 10]), ag('pim', 10, 10, 30, [45, 5, 30])];
    const kok: OcctDugumu = { name: '', meshes: [], children: [{ name: 'govde', meshes: [], children: [
      { name: 'taban', meshes: [0], children: [] }, { name: 'pim', meshes: [1], children: [] }, { name: 'tutucu-montaji', meshes: [2, 3], children: [] },
    ] }] };
    const d = montajAgaci(kok, aglar)!;
    assert.deepEqual(d.map((x) => [x.sira, x.ust, x.tur, x.ad]), [
      [1, null, 'montaj', 'govde'], [2, 1, 'parca', 'taban'], [3, 1, 'parca', 'pim'], [4, 1, 'montaj', 'tutucu-montaji'], [5, 4, 'parca', 'tutucu'], [6, 4, 'parca', 'pim'],
    ]);
    assert.deepEqual([d[0]!.kutuEn, d[0]!.kutuUst], [[0, 0, 0], [100, 60, 60]]);
    assert.deepEqual([d[3]!.kutuEn, d[3]!.kutuUst], [[40, 0, 10], [60, 20, 60]]);
    assert.deepEqual([d[2]!.obb, d[2]!.hacimMm3, d[2]!.kapali], [{ a: 30, b: 10, c: 10 }, 3000, true]);
    assert.deepEqual([d[0]!.obb, d[0]!.hacimMm3, d[0]!.alanMm2, d[0]!.kapali], [null, null, null, null], 'montajda ölçü yok');
  });

  test('GEO-MO2 bileşen listesi: aynı ad ve ölçü tek satır, döndürülmüş yerleşim aynı bileşen; ad ya da ölçü farklıysa ayrı', () => {
    const aglar = [ag('pim', 10, 10, 30), dondurAdli(ag('pim', 10, 10, 30, [50, 0, 0]), 90), ag('pim', 10, 10, 31), ag('tapa', 10, 10, 30), ag(null, 5, 5, 5)];
    const d = montajAgaci({ name: 'm', meshes: [0, 1, 2, 3, 4], children: [] }, aglar)!;
    const b = bilesenListesi(d);
    assert.deepEqual(b.map((x) => [x.sira, x.ad, x.adet, x.dugumler]), [[1, 'pim', 2, [2, 3]], [2, 'pim', 1, [4]], [3, 'tapa', 1, [5]], [4, null, 1, [6]]]);
    assert.deepEqual(b[0]!.obb, { a: 30, b: 10, c: 10 });
  });

  test('GEO-MO3 tek parçalı model: tek ağlı yaprak düğüm parçanın kendisidir, adı düğümden; ağ adı yoksa ağdan', () => {
    const tek = montajAgaci({ name: '', meshes: [], children: [{ name: 'kutu', meshes: [0], children: [] }] }, [ag('SOLID', 40, 20, 10)])!;
    assert.deepEqual(tek.map((x) => [x.sira, x.ust, x.tur, x.ad]), [[1, null, 'parca', 'kutu']]);
    const adsiz = montajAgaci({ name: '', meshes: [], children: [{ name: ' ', meshes: [0], children: [] }] }, [ag('kutu', 40, 20, 10)])!;
    assert.equal(adsiz[0]!.ad, 'kutu');
    assert.deepEqual(bilesenListesi(tek).map((x) => x.adet), [1]);
  });

  test('GEO-MO4 güvenilmeyen girdi: boş ağ parça sayılmaz, parçasız model ve düğüm sınırı null; bozuk alanlar yok sayılır, ad kısalır', () => {
    const bos: AdliAg = { ad: 'yuzey', konum: [], indeks: [] };
    assert.equal(montajAgaci({ name: 'm', meshes: [0], children: [] }, [bos]), null, 'parçasız');
    assert.equal(montajAgaci({ name: 'm', meshes: [7], children: [] }, [ag('a', 1, 1, 1)]), null, 'olmayan ağ dizini');
    const d = montajAgaci({ name: 5, meshes: 'x', children: [null, { meshes: [-1, 0.5, 0] }] }, [ag('a', 1, 1, 1)])!;
    assert.deepEqual(d.map((x) => [x.tur, x.ad, x.ust]), [['parca', 'a', null]], 'adsız tek sarmalayıcı atlanır, geçersiz dizinler düşer');
    const cok = Array.from({ length: MONTAJ_DUGUM_EN_COK + 1 }, () => ({ name: 'p', meshes: [0], children: [] }));
    assert.equal(montajAgaci({ name: 'm', meshes: [], children: cok }, [ag('p', 1, 1, 1)]), null);
    let derin: OcctDugumu = { name: 'p', meshes: [0], children: [] };
    for (let i = 0; i < 50_000; i++) derin = { name: '', meshes: [], children: [derin] };
    assert.equal(montajAgaci(derin, [ag('p', 1, 1, 1)])?.length, 1, 'derin iç içe yapı yığını taşırmaz');
    assert.equal(montajAdi('x'.repeat(MONTAJ_AD_EN_UZUN + 5))?.length, MONTAJ_AD_EN_UZUN);
    assert.equal(montajAdi('  pim  '), 'pim');
    assert.equal(montajAdi('   '), null);
  });
});

function dondurAdli(a: AdliAg, derece: number): AdliAg {
  return { ad: a.ad, ...dondur(a, derece) };
}

