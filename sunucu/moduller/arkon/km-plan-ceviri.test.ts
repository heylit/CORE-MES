import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { KmResim } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { kmPlaniBagli, kmTaslakDoldur, SABLON_BAGSIZ_ETIKETI, sablonPlaniniAyikla } from './km-plan-ceviri.ts';

// 3701: taslak planın Kalite Merkezi resminden kurulması. İstemcinin km-cizim.test.ts'indeki kuralla aynı beklentiler; değerler uydurmadır.
const balon = (no: number, ek: Record<string, unknown> = {}) => ({
  id: 100 + no, no, nominal: 'Ø10', tolerans: null, alt: '9.95', ust: '10.05', alet: null, siklik: null, kritik: false, yontem: null, olcuAletiGerekir: false,
  tur: null, sayfa: 1, x: 1, y: 2, yaziKutusu: null, yer: null, yerKipi: null, yerKontrol: null, surum: 1, ...ek,
});
const resim = (ek: Record<string, unknown> = {}): KmResim => ({
  id: 7, malzemeNo: 3, tur: 'resim', merkezBelgeId: 1, ozet: 'x', ad: 'Deneme', revizyon: 'B', aktif: true, surum: 4, gruplarSurum: 1, eklendi: 't', eski: false,
  balonlar: [balon(1), balon(2, { kritik: true, siklik: 'Her 10 parça', alet: 'Mikrometre' }), balon(3, { alt: null, ust: null })], gruplar: [], ...ek,
} as unknown as KmResim);
const taslak = (ek: Record<string, unknown> = {}) => ({ status: 'draft', malzemeNo: 3, files: [], plan: [], tmi: { opNo: 10 }, ...ek });

describe('Kalite Merkezi resminden taslak planı', () => {
  test('tek balonlu resim planı kurar: bağ, kaynak satırı ve balon alanları; zaman ve kişi yazılmaz', () => {
    const d = kmTaslakDoldur(taslak(), [resim()])!;
    assert.deepEqual(d['kmResim'], { id: 7, surum: 4 });
    assert.deepEqual(d['otoKaynak'], { plan: { kaynak: 'km', etiket: 'Kendiliğinden alındı · Deneme · Rev B · 3 balon · adıma göre ayırma yok' } });
    const plan = d['plan'] as Record<string, unknown>[];
    assert.deepEqual(plan.map((k) => [k['id'], k['crit'], k['freq'], k['gauge'], k['kmBalon']]), [[1, false, 'İlk parça', false, 101], [2, true, 'Her 10 parça', false, 102], [3, false, 'İlk parça', true, 103]]);
    assert.equal(plan[1]!['tool'], 'Mikrometre');
    assert.deepEqual(kmTaslakDoldur(taslak(), [resim()]), d, 'aynı girdi aynı içerik');
  });
  test('operasyona bağlı grup varsa yalnız grubun balonları gelir', () => {
    const gruplar = [{ id: 1, ad: 'Torna', balonlar: [1, 3], operasyonlar: [{ operasyonId: 5, opNo: 10 }] }];
    const d = kmTaslakDoldur(taslak(), [resim({ gruplar })])!;
    assert.deepEqual((d['plan'] as { id: number }[]).map((k) => k.id), [1, 3]);
    assert.match((d['otoKaynak'] as { plan: { etiket: string } }).plan.etiket, /2 balon · "Torna" grubu/);
    assert.equal((kmTaslakDoldur(taslak({ tmi: { opNo: 20 } }), [resim({ gruplar })])!['plan'] as unknown[]).length, 3);
  });
  test('birden çok aday, aday yok, eski ya da balonsuz resim: dokunulmaz', () => {
    assert.equal(kmTaslakDoldur(taslak(), [resim(), resim({ id: 8 })]), null);
    assert.equal(kmTaslakDoldur(taslak(), []), null);
    assert.equal(kmTaslakDoldur(taslak(), [resim({ balonlar: [] })]), null);
    assert.equal(kmTaslakDoldur(taslak(), [resim({ eski: true })]), null);
    assert.equal(kmTaslakDoldur(taslak(), [resim({ tur: 'model' })]), null);
    assert.equal(kmTaslakDoldur(taslak(), [resim({ aktif: false })]), null);
    assert.equal(kmTaslakDoldur(taslak(), [resim(), resim({ id: 8, balonlar: [] })])?.['kmResim'] !== undefined, true, 'balonsuz ikinci resim aday sayılmaz');
  });
  test('dolu plan, bağ, kişinin boşalttığı alan, elle dosya, yayındaki paket ve malzemesiz paket dokunulmaz; Çizim Merkezi dosyası engel değil', () => {
    assert.equal(kmTaslakDoldur(taslak({ plan: [{ id: 1 }] }), [resim()]), null);
    assert.equal(kmTaslakDoldur(taslak({ kmResim: { id: 1, surum: 1 } }), [resim()]), null);
    assert.equal(kmTaslakDoldur(taslak({ otoKaynak: { plan: { kaynak: 'el' } } }), [resim()]), null);
    assert.equal(kmTaslakDoldur(taslak({ files: [{ name: 'a.pdf' }] }), [resim()]), null);
    assert.equal(kmTaslakDoldur(taslak({ status: 'published' }), [resim()]), null);
    assert.equal(kmTaslakDoldur(taslak({ malzemeNo: null }), [resim()]), null);
    assert.notEqual(kmTaslakDoldur(taslak({ files: [{ name: 'a.pdf', merkez: 12 }] }), [resim()]), null);
  });
});

describe('3795: şablondan gelen bağsız plan', () => {
  const eski = [{ id: 1, nom: '4.7' }, { id: 2, nom: '5', kmBalon: 102 }];
  test('kısmen bağlı plan bağsızdır; boş ve tam bağlı plan bağlıdır', () => {
    assert.equal(kmPlaniBagli(eski), false);
    assert.equal(kmPlaniBagli([{ id: 2, kmBalon: 102 }]), true);
    assert.equal(kmPlaniBagli([]), true);
    assert.equal(kmPlaniBagli([{ id: 3, kmBalon: 0 }]), false);
  });
  test('balonlu resim varsa plan, numune kuralları ve resim bağı düşer; kmTaslakDoldur yeniden kurar', () => {
    const t = taslak({ plan: eski, samp: [{ id: 'n' }], kmResim: { id: 1, surum: 1 }, otoKaynak: { depo: { kaynak: 'rota' }, plan: { kaynak: 'sablon' } } });
    const a = sablonPlaniniAyikla(t, [resim()])!;
    assert.deepEqual([a['plan'], a['samp'], 'kmResim' in a, a['otoKaynak']], [[], [], false, { depo: { kaynak: 'rota' } }]);
    assert.equal((kmTaslakDoldur(a, [resim()])!['plan'] as unknown[]).length, 3);
    assert.deepEqual(sablonPlaniniAyikla(taslak({ plan: eski }), [resim(), resim({ id: 8 })])!['plan'], [], 'birden çok aday: plan boşalır, kişi seçer');
  });
  test('balonlu resim yoksa eski plan kalır ve kaynağı yazılır; bağlı, boş ve yayındaki plana dokunulmaz', () => {
    const a = sablonPlaniniAyikla(taslak({ plan: eski }), [resim({ balonlar: [] })])!;
    assert.deepEqual([a['plan'], a['otoKaynak']], [eski, { plan: { kaynak: 'sablon', etiket: SABLON_BAGSIZ_ETIKETI } }]);
    assert.equal(sablonPlaniniAyikla(taslak({ plan: [{ id: 2, kmBalon: 102 }] }), [resim()]), null);
    assert.equal(sablonPlaniniAyikla(taslak(), [resim()]), null);
    assert.equal(sablonPlaniniAyikla(taslak({ plan: eski, status: 'published' }), [resim()]), null);
  });
});
