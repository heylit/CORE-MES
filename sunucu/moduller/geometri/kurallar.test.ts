import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { agOlcumu, bicimDenetimi, kapsayanDaireCapi, enAzHam, EN_COK_DENEME, hataMetniKisalt, hataSonrasiDurum, HATA_METNI_EN_UZUN, ILETILER } from './kurallar.ts';
import type { UcgenAgi } from './kurallar.ts';

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
});
