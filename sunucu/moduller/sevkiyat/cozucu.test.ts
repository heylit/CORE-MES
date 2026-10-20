import assert from 'node:assert/strict';
import { test } from 'node:test';
import { aracOranlari, filoPlani, rotaMaliyeti } from './cozucu.ts';
import { EN_COK_SEFER } from './kurallar.ts';
import type { CozucuAraci, CozucuIsi, CozucuNoktasi, FiloSecenegi } from './cozucu.ts';
import { izgaraYolVerisi } from './test-agi.ts';
import { yolAgiKur } from './yol-agi.ts';

const ag = yolAgiKur(izgaraYolVerisi());
const nokta = (anahtar: string, satir: number, sutun: number): CozucuNoktasi =>
  ({ anahtar, ad: anahtar, boylam: 32.70 + sutun * 0.01, enlem: 39.90 + satir * 0.01, durakSuresiDakika: 10 });
const FABRIKA = nokta('F', 0, 0);
const NOKTALAR = [nokta('A', 2, 9), nokta('B', 9, 3), nokta('C', 6, 6), nokta('D', 10, 10), nokta('E', 4, 1)];
const is = (anahtar: string, g: Partial<CozucuIsi> = {}): CozucuIsi => ({
  anahtar, tur: 'teslimat', alisNoktasi: null, birakisNoktasi: 'A', kilogram: 100, palet: 1, durakSuresiDakika: null,
  alisPenceresi: null, birakisPenceresi: null, sabitArac: null, ...g,
});
const arac = (anahtar: string, g: Partial<CozucuAraci> = {}): CozucuAraci => ({
  anahtar, ad: anahtar, tur: 'kamyonet', kapasiteKilogram: 1500, kapasitePalet: 4, musaitBaslangic: 480, musaitBitis: 1080, oranlar: {}, ...g,
});
const SECENEK: FiloSecenegi = { gun: 'hafta-ici', amac: 'sure', kip: 'dagit', yinelemeSiniri: 300, tohum: 7 };
const coz = (isler: CozucuIsi[], araclar: CozucuAraci[], g: Partial<FiloSecenegi> = {}) =>
  filoPlani(ag, FABRIKA, NOKTALAR, isler, araclar, { ...SECENEK, ...g });
const rotasi = (p: ReturnType<typeof coz>, a: string) => p.rotalar.find((r) => r.arac === a);
const islerOf = (p: ReturnType<typeof coz>, a: string) => rotasi(p, a)?.duraklar.filter((d) => d.is !== null).map((d) => d.is) ?? [];

test('hiçbir aracın kapasitesine sığmayan iş atanamaz, nedeni yazılır', () => {
  const p = coz([is('agir', { kilogram: 5000 }), is('hafif')], [arac('K1')]);
  assert.deepEqual(p.atanamayan, [{ is: 'agir', neden: 'Hiçbir aracın kapasitesi yetmiyor' }]);
  assert.deepEqual(islerOf(p, 'K1'), ['hafif']);
});

test('palet kapasitesi de sınırdır: sefer yükü kapasiteyi aşmaz, gerekirse ara dönüşle ikinci sefer açılır', () => {
  const p = coz([is('t1', { palet: 3, birakisNoktasi: 'A' }), is('t2', { palet: 3, birakisNoktasi: 'C' })], [arac('K1')]);
  const r = rotasi(p, 'K1')!;
  assert.equal(p.atanamayan.length, 0);
  assert.equal(r.seferler.length, 2);
  for (const s of r.seferler) assert.ok(s.yukPalet <= 4);
  assert.equal(r.kurallaraUygun, true);
});

test('al-bırak işinde alış ve bırakış aynı araçta, aynı seferde ve alış önce', () => {
  const p = coz([is('ab', { tur: 'aktarma', alisNoktasi: 'D', birakisNoktasi: 'E' }), is('t', { birakisNoktasi: 'B' })], [arac('K1'), arac('K2')]);
  const r = p.rotalar.find((x) => x.duraklar.some((d) => d.is === 'ab'))!;
  const al = r.duraklar.findIndex((d) => d.is === 'ab' && d.alis), birak = r.duraklar.findIndex((d) => d.is === 'ab' && !d.alis);
  assert.ok(al >= 0 && birak > al);
  assert.equal(r.duraklar.slice(al, birak).some((d) => d.is === null), false, 'arada fabrikaya dönüş yok');
});

test('zaman penceresi: varış pencere sonundan sonra değildir; erken gelen bekler', () => {
  const p = coz([is('erken', { birakisNoktasi: 'D', birakisPenceresi: [720, 780] }), is('serbest', { birakisNoktasi: 'E' })], [arac('K1')]);
  const d = rotasi(p, 'K1')!.duraklar.find((x) => x.is === 'erken')!;
  assert.ok(d.baslama >= 720 && d.baslama <= 780.01, `${d.baslama}`);
  assert.ok(d.varis <= 780.01);
});

test('yetişilemeyen pencere atanamaz, nedeni zaman penceresidir', () => {
  const p = coz([is('imkansiz', { birakisNoktasi: 'D', birakisPenceresi: [400, 420] }), is('t')], [arac('K1')]);
  assert.deepEqual(p.atanamayan, [{ is: 'imkansiz', neden: 'Zaman penceresine yetişilemiyor' }]);
});

test('SVK-28: araç müsaitlik bitişinden önce fabrikaya döner; sığmayan iş atanamaz', () => {
  // Her iş aracın paletini doldurur (ayrı sefer); müsaitlik tek seferin bitişine kadar.
  const isler = [is('t1', { birakisNoktasi: 'D', palet: 4 }), is('t2', { birakisNoktasi: 'D', palet: 4 })];
  const tekSefer = rotasi(coz(isler.slice(0, 1), [arac('K1')]), 'K1')!;
  const p = coz(isler, [arac('K1', { musaitBaslangic: 480, musaitBitis: tekSefer.donus + 5 })]);
  const r = rotasi(p, 'K1')!;
  assert.ok(r.donus <= tekSefer.donus + 5.01, `${r.donus}`);
  assert.equal(p.atanamayan.length, 1);
  assert.match(p.atanamayan[0]!.neden, /[Mm]üsaitlik/);
});

test('SVK-16: sabit araçlı iş yalnız o araca gider', () => {
  const p = coz([is('s1', { sabitArac: 'K2', birakisNoktasi: 'E' }), is('s2', { birakisNoktasi: 'E' })], [arac('K1'), arac('K2')]);
  assert.ok(islerOf(p, 'K2').includes('s1'));
  assert.equal(islerOf(p, 'K1').includes('s1'), false);
});

test('dağıtım kilitli aracın rotasına dokunmaz; kilitsiz aracın elle dizilmiş rotasını yeniden kurar', () => {
  const isler = [is('a', { birakisNoktasi: 'A' }), is('b', { birakisNoktasi: 'B' }), is('c', { birakisNoktasi: 'C' })];
  const baslangic = [{ arac: 'K1', ogeler: [{ is: 'b', alis: false }, { is: 'a', alis: false }] }];
  const p = coz(isler, [arac('K1'), arac('K2')], { baslangic, kilitliAraclar: ['K1'] });
  assert.deepEqual(islerOf(p, 'K1'), ['b', 'a']);
  assert.deepEqual(islerOf(p, 'K2'), ['c']);
});

test('değerlendirme kipi rotayı değiştirmez, kural ihlalini uyarıyla gösterir', () => {
  const isler = [is('a', { birakisNoktasi: 'A', palet: 3 }), is('b', { birakisNoktasi: 'B', palet: 3 })];
  const p = coz(isler, [arac('K1')], { kip: 'degerlendir', baslangic: [{ arac: 'K1', ogeler: [{ is: 'b', alis: false }, { is: 'a', alis: false }] }] });
  const r = rotasi(p, 'K1')!;
  assert.deepEqual(islerOf(p, 'K1'), ['b', 'a']);
  assert.equal(r.kurallaraUygun, false);
  assert.equal(r.uyarilar.length, 1);
  assert.equal(p.yineleme, 0);
});

test('değerlendirmede en çok sefer aşımı uyarıdır', () => {
  const isler = ['a', 'b', 'c', 'd'].map((x, i) => is(x, { birakisNoktasi: NOKTALAR[i]!.anahtar }));
  const ogeler = isler.flatMap((x, i) => (i ? [{ araDonus: true as const }, { is: x.anahtar, alis: false }] : [{ is: x.anahtar, alis: false }]));
  const p = coz(isler, [arac('K1', { musaitBitis: 1440 })], { kip: 'degerlendir', baslangic: [{ arac: 'K1', ogeler }] });
  assert.equal(rotasi(p, 'K1')!.seferler.length, EN_COK_SEFER + 1);
  assert.ok(rotasi(p, 'K1')!.uyarilar.some((u) => u.includes(`En çok ${EN_COK_SEFER} sefer`)));
});

test('çözüm tohumla belirlenimcidir', () => {
  const isler = NOKTALAR.map((n, i) => is(`t${i}`, { birakisNoktasi: n.anahtar, kilogram: 300 + i * 50 }));
  const iki = [coz(isler, [arac('K1'), arac('K2')]), coz(isler, [arac('K1'), arac('K2')])];
  assert.deepEqual(iki[0]!.rotalar.map((r) => [r.arac, r.duraklar.map((d) => d.is)]), iki[1]!.rotalar.map((r) => [r.arac, r.duraklar.map((d) => d.is)]));
  assert.equal(iki[0]!.toplamDakika, iki[1]!.toplamDakika);
});

test('zaman çizelgesi: teslimat seferi yükleme süresiyle başlar, duraklar sırayla ilerler, dönüş son ayrılıştan sonradır', () => {
  const p = coz([is('a', { birakisNoktasi: 'A' }), is('c', { birakisNoktasi: 'C' })], [arac('K1')]);
  const r = rotasi(p, 'K1')!;
  assert.equal(r.seferler[0]!.cikis - r.seferler[0]!.baslangic, 15, 'fabrikada 15 dk yükleme');
  assert.equal(r.seferler[0]!.durakSureleri.length, r.seferler[0]!.noktalar.length);
  let t = r.seferler[0]!.cikis;
  for (const d of r.duraklar) { assert.ok(d.varis > t - 1e-9); assert.ok(d.ayrilis >= d.baslama); t = d.ayrilis; }
  assert.ok(r.donus > t);
});

test('maliyet: km x TL/km + saat x TL/saat + günlük sabit; girilmeyen oran araç türünden', () => {
  const o = aracOranlari({ tur: 'kamyon', oranlar: { saat: 500 } });
  assert.equal(o.saat, 500);
  assert.equal(rotaMaliyeti({ kilometre: 10, saat: 300, gunluk: 1000 }, 20, 90), 200 + 450 + 1000);
  const p = coz([is('a', { birakisNoktasi: 'A' })], [arac('K1')], { amac: 'maliyet' });
  const r = rotasi(p, 'K1')!;
  assert.ok(Math.abs(r.maliyet - rotaMaliyeti(r.oranlar, r.kilometre, r.donus - r.cikis)) < 1e-6);
});

test('en kısa amacında toplam km en hızlı amacındakinden fazla değildir', () => {
  const isler = NOKTALAR.map((n, i) => is(`t${i}`, { birakisNoktasi: n.anahtar }));
  const hizli = coz(isler, [arac('K1')], { amac: 'sure' }), kisa = coz(isler, [arac('K1')], { amac: 'mesafe' });
  assert.ok(kisa.kilometre <= hizli.kilometre + 1e-6, `${kisa.kilometre} <= ${hizli.kilometre}`);
});

test('alım dönüşünde fabrikada 15 dk boşaltma vardır (teslimatın dönüşünde yoktur)', () => {
  // Gece trafiği yok: aynı noktadan fabrikaya dönüş süresi iki araçta aynıdır, fark boşaltmadır.
  const gece = { musaitBaslangic: 60, musaitBitis: 300 };
  const p = coz([is('alim', { tur: 'alim', alisNoktasi: 'C', birakisNoktasi: null, sabitArac: 'K1' }), is('teslim', { birakisNoktasi: 'C', sabitArac: 'K2' })],
    [arac('K1', gece), arac('K2', gece)], { kip: 'dagit' });
  const donusSuresi = (a: string) => { const r = rotasi(p, a)!; return r.donus - r.duraklar[r.duraklar.length - 1]!.ayrilis; };
  assert.ok(Math.abs(donusSuresi('K1') - donusSuresi('K2') - 15) < 0.5, `${donusSuresi('K1')} - ${donusSuresi('K2')}`);
});

test('çözücü bir araca günde en çok 3 sefer verir; dördüncü seferlik iş yerleşemez', () => {
  // Her iş aracın palet kapasitesini doldurur: her iş ayrı sefer ister.
  const isler = ['A', 'B', 'C', 'D'].map((n) => is(`dolu${n}`, { birakisNoktasi: n, palet: 4 }));
  const p = coz(isler, [arac('K1', { musaitBaslangic: 300, musaitBitis: 1440 })]);
  assert.equal(rotasi(p, 'K1')!.seferler.length, 3);
  assert.equal(p.atanamayan.length, 1);
});
