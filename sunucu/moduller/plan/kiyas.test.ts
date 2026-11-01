import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { depoDisinda } from './kiyas-komutu.ts';
import { bosluk, karsilastir, type GoruntuSonucu, type KiyasSonucu, type PlanOlcusu } from './kiyas-kurallar.ts';
import { GORUNTU_BICIMI, goruntuKos, kiyasGoruntusuAl, type KiyasGoruntusu } from './kiyas.ts';
import type { MotorDurumu } from './plan-motoru.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 1475 a: plan motoru kıyas seti. Görüntüler uydurmadır; gerçek görüntü depo dışındaki klasörde durur.

const olcu = (agirlikliGecikme: number, ek: Partial<PlanOlcusu> = {}): PlanOlcusu => (
  { agirlikliGecikme, geciken: 0, zamaninda: 0, yerlesmeyen: 0, ayarSaati: 0, sonBitis: 0, degisen: 0, sureMs: 100, ...ek });
const goruntu = (ad: string, motor: PlanOlcusu, calisma: PlanOlcusu | null = null): GoruntuSonucu => (
  { ad, islem: 10, siparis: 2, motor, calisma, altSinir: 0, bosluk: 0 });
const sonuc = (...g: GoruntuSonucu[]): KiyasSonucu => ({ zaman: '2026-11-01T00:00:00Z', goruntuler: g });

describe('kıyas kuralları (1475 a)', () => {
  test('önceki koşuya göre gecikme artışı tolerans aşınca bulgudur; tolerans içi değildir', () => {
    const once = sonuc(goruntu('a', olcu(100)), goruntu('b', olcu(100)));
    const b = karsilastir(sonuc(goruntu('a', olcu(104)), goruntu('b', olcu(110))), once);
    assert.deepEqual(b.map((x) => [x.ad, x.tur]), [['b', 'gecikme']]);
  });

  test('yerleşmeyen işlem artışı, süre sınırı, süre artışı ve kaybolan görüntü bulgudur', () => {
    const once = sonuc(goruntu('a', olcu(10)), goruntu('b', olcu(10, { sureMs: 2000 })), goruntu('c', olcu(10)));
    const b = karsilastir(sonuc(goruntu('a', olcu(10, { yerlesmeyen: 1 })), goruntu('b', olcu(10, { sureMs: 61_000 }))), once);
    assert.deepEqual(b.map((x) => [x.ad, x.tur]), [['a', 'yerlesmeyen'], ['b', 'sure-siniri'], ['b', 'sure'], ['c', 'eksik']]);
  });

  test('önceki koşu yokken motor çalışmadaki plandan belirgin kötüyse bulgudur', () => {
    assert.deepEqual(karsilastir(sonuc(goruntu('a', olcu(50), olcu(10))), null).map((x) => x.tur), ['calismadan-kotu']);
    assert.deepEqual(karsilastir(sonuc(goruntu('a', olcu(10.2), olcu(10))), null), []);
    // Çalışma daha çok iş yerleştiremiyorsa gecikme kıyaslanmaz; motor daha çok iş yerleştiremiyorsa bulgudur.
    assert.deepEqual(karsilastir(sonuc(goruntu('a', olcu(50), olcu(10, { yerlesmeyen: 3 }))), null), []);
    assert.deepEqual(karsilastir(sonuc(goruntu('a', olcu(5, { yerlesmeyen: 2 }), olcu(10))), null).map((x) => x.metin), ['motor 2 işlem yerleştiremedi, çalışmadaki plan 0']);
  });

  test('boşluk alt sınıra göredir; alt sınır 0 iken yalnız sıfır gecikme 0 boşluktur', () => {
    assert.equal(bosluk(15, 10), 0.5);
    assert.equal(bosluk(0, 0), 0);
    assert.equal(bosluk(3, 0), null);
    assert.equal(bosluk(3, null), null);
  });

  test('görüntü ve sonuç klasörü depo dışında olmalı', () => {
    const kok = resolve(fileURLToPath(new URL('../../../', import.meta.url)));
    assert.equal(depoDisinda(join(kok, 'veri', 'kiyas')), false);
    assert.equal(depoDisinda(kok), false);
    assert.equal(depoDisinda(tmpdir()), true);
  });
});

// Bir tezgâh, iki sipariş; ikincisinin termini sıkı. Çalışmadaki plan ters sıradadır (önce gevşek sipariş): motor daha az geciktirir.
const st = (): MotorDurumu => ({
  D: {
    meta: { baslangic: '2026-01-05' }, ayarlar: {}, vardiyalar: [{ id: 'V', bas: '08:00', bit: '16:00' }],
    calismaGunleri: { pzt: ['V'], sal: ['V'], car: ['V'], per: ['V'], cum: ['V'] },
    tezgahlar: [{ id: 'T1', grup: 'G' }], personel: [{ id: 'P1', vardiya: 'V', gruplar: ['G'], ayar: true }], malzemeler: [],
    urunler: [{ id: 'U', rota: [{ k: '10', ad: 'Torna', tezgahlar: [{ id: 'T1', cevrim: 60, ayar: 0 }] }] }],
    siparisler: [
      { id: 'S1', urun: 'U', adet: 8, termin: '2026-01-16 23:59', malzeme: [] },
      { id: 'S2', urun: 'U', adet: 8, termin: '2026-01-05 16:00', malzeme: [] },
    ],
  },
  now: 8, down: [], ekMesai: [], eksik: [], locks: {}, pref: {}, boost: {}, gercek: {}, sapma: {}, saGecik: {}, ogren: {}, w: { tampon: false },
});
const ornekGoruntu = (): KiyasGoruntusu => ({
  bicim: GORUNTU_BICIMI, alinma: '2026-01-05T05:00:00Z', st: st(),
  calismaPlani: { ops: {
    'S1.10': { id: 'S1.10', job: 'S1', m: 'T1', S: 8, Su: 8, C: 16, lot1: 9, su: 0, run: 8 },
    'S2.10': { id: 'S2.10', job: 'S2', m: 'T1', S: 32, Su: 32, C: 40, lot1: 33, su: 0, run: 8 },
  }, fail: [] },
});

describe('kıyas koşusu (1475 a)', () => {
  test('motor, çalışmadaki plan ve alt sınır aynı girdide ölçülür; motor sıkı termini öne alır', () => {
    const g = goruntuKos('ornek', ornekGoruntu());
    assert.equal(g.islem, 2);
    assert.equal(g.siparis, 2);
    assert.ok(g.calisma !== null);
    assert.ok(g.motor.agirlikliGecikme < g.calisma.agirlikliGecikme, JSON.stringify(g));
    assert.ok(g.altSinir !== null && g.altSinir <= g.motor.agirlikliGecikme + 1e-9, JSON.stringify(g));
    assert.equal(g.motor.yerlesmeyen, 0);
    // Aynı görüntü aynı sonucu verir (süre dışında).
    const h = goruntuKos('ornek', ornekGoruntu());
    assert.deepEqual({ ...h.motor, sureMs: 0 }, { ...g.motor, sureMs: 0 });
    // Görüntü değişmez (her koşu kopyayla).
    assert.deepEqual(ornekGoruntu().st, st());
  });

  test('komut klasördeki görüntüleri koşar, sonucu yazar; sonraki koşu öncekiyle karşılaştırılır', () => {
    const klasor = mkdtempSync(join(tmpdir(), 'plan-kiyas-'));
    writeFileSync(join(klasor, 'goruntu-1.json'), JSON.stringify(ornekGoruntu()));
    const komut = fileURLToPath(new URL('./kiyas-komutu.ts', import.meta.url));
    const yaz = join(klasor, 'sonuc.json');
    const ilk = spawnSync(process.execPath, [komut, 'kos', klasor, '--yaz', yaz], { encoding: 'utf8' });
    assert.equal(ilk.status, 0, ilk.stderr + ilk.stdout);
    assert.match(ilk.stdout, /goruntu-1\t2\t/);
    assert.match(ilk.stdout, /Bulgu yok\./);
    assert.ok(existsSync(yaz));
    // Önceki koşunun sonucu: aynı görüntünün süreç içi koşusu (komutun yazdığıyla aynı ölçüler).
    const once = sonuc(goruntuKos('goruntu-1', ornekGoruntu()));
    // Önceki koşu daha iyiymiş gibi: gecikme artışı bulgu, çıkış kodu 1.
    const iyi = { ...once, goruntuler: once.goruntuler.map((g) => ({ ...g, motor: { ...g.motor, agirlikliGecikme: g.motor.agirlikliGecikme / 2 - 5 } })) };
    writeFileSync(join(klasor, 'onceki.json'), JSON.stringify(iyi));
    const ikinci = spawnSync(process.execPath, [komut, 'kos', klasor, '--onceki', join(klasor, 'onceki.json')], { encoding: 'utf8' });
    assert.equal(ikinci.status, 1, ikinci.stdout);
    assert.match(ikinci.stdout, /BULGU goruntu-1 \[gecikme\]/);
    // Depo içindeki klasör reddedilir.
    const ret = spawnSync(process.execPath, [komut, 'kos', fileURLToPath(new URL('.', import.meta.url))], { encoding: 'utf8' });
    assert.equal(ret.status, 1);
    assert.match(ret.stderr, /depo dışında olmalı/);
  });
});

describe('plan (gerçek PostgreSQL): kıyas görüntüsü (1475 a)', () => {
  const { c, vt, tamam, isEmirleriAc, yeniAdim } = planTestOrtami();
  test('görüntü sunucu çözücüsünün girdisidir; görüntüden koşu kurulur', async () => {
    await isEmirleriAc([yeniAdim({ ayarSuresiDk: 10, birimSureDk: 1 })]);
    await tamam(c.planlama, 'POST', '/plan/planlama-calismasi/olustur', {});
    const g = await vt().tx((db) => kiyasGoruntusuAl(db));
    assert.ok(g);
    assert.equal(g.bicim, GORUNTU_BICIMI);
    const D = g.st['D'] as { siparisler: unknown[] };
    assert.ok(D.siparisler.length >= 1);
    const s = goruntuKos('vt', g);
    assert.ok(s.islem >= 1);
  });
});
