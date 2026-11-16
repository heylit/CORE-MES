import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { bol, ekranModulleri, onYuklemeyeUlasir, ekranSureleri, PARCA, planKur, secimHesapla, sureleriBirlestir, tumDosyalar } from './ci-plan.ts';
import type { Etki } from './etki.ts';
import { sureEkle } from './test-rapor-github.ts';

const KOK = fileURLToPath(new URL('../', import.meta.url));
const MODULLER = new Set(['plan', 'stok', 'siparisler']);

const etki = (e: Partial<Etki>): Etki => ({
  degisenler: [], moduller: [], digerDosyalar: [], nodeTestleri: [], vitestTestleri: [], bilinmeyenler: [], ...e,
});
const TUM = {
  sunucu: ['sunucu/cekirdek/a.test.ts', 'sunucu/moduller/plan/b.test.ts', 'sunucu/moduller/stok/c.test.ts'],
  istemci: ['istemci/src/moduller/plan/P.test.tsx', 'istemci/src/moduller/stok/S.test.tsx'],
  ekran: ['ekran-testleri/plan.spec.ts', 'ekran-testleri/stok.spec.ts', 'ekran-testleri/sayfalar.spec.ts'],
  windows: ['sunucu/cekirdek/a.test.ts', 'sunucu/moduller/plan/b.test.ts'],
};
const ICERIK = new Map([
  ['ekran-testleri/plan.spec.ts', "await ac('/plan/kokpit');\nawait ac(\n  '/plan/proje');"],
  ['ekran-testleri/stok.spec.ts', "await page.goto('/stok');"],
  ['ekran-testleri/sayfalar.spec.ts', 'for (const s of SAYFALAR) await ac(s.yol);'],
]);
const SUNUCU_ICERIK = new Map([
  ['sunucu/cekirdek/a.test.ts', "readFileSync('CLAUDE.md')"],
  ['sunucu/moduller/plan/b.test.ts', "join(KOK, 'sunucu', 'gocler')"],
  ['sunucu/moduller/stok/c.test.ts', "const KLASOR = new URL('./islemler/', import.meta.url);"],
]);
const sec = (degisenler: string[], e: Partial<Etki>) =>
  secimHesapla({ degisenler, etki: etki(e), tum: TUM, ekranIcerikleri: ICERIK, istemciModulleri: MODULLER, sunucuIcerikleri: SUNUCU_ICERIK, onYuklemeDegisti: false });

test('ci-plan: bölme en uzun dosyayı en hafif parçaya verir, her dosya tek parçadadır, plan her koşuda aynıdır', () => {
  const sureler = new Map([['a', 90], ['b', 60], ['c', 50], ['d', 40], ['e', 10]]);
  const p = bol(['e', 'd', 'c', 'b', 'a'], 2, sureler);
  assert.deepEqual(p, [['a', 'd'], ['b', 'c', 'e']]);
  assert.deepEqual(bol(['a', 'b', 'c', 'd', 'e'], 2, sureler), p);
  // Sırayla bölme (a, b, c | d, e) 200'e 50 verirdi; süreyle en uzun parça 130.
  const toplam = (dosyalar: string[]) => dosyalar.reduce((t, d) => t + sureler.get(d)!, 0);
  assert.equal(Math.max(...p.map(toplam)), 130);
});

test('ci-plan: parça sayısı dosya sayısını aşmaz; süresi bilinmeyen dosya ortanca sayılır, hiç ölçü yoksa sayıyla bölünür', () => {
  assert.equal(bol(['a', 'b'], 8).length, 2);
  assert.deepEqual(bol([], 8), [[]]);
  assert.deepEqual(bol(['a', 'b', 'c', 'd'], 2).map((x) => x.length), [2, 2]);
  // Ortanca 50: bilinmeyen 'x' 50 sayılır ve 100'lük 'a''nın yanına değil hafif parçaya gider.
  assert.deepEqual(bol(['a', 'b', 'c', 'x'], 2, new Map([['a', 100], ['b', 50], ['c', 10]])), [['a', 'c'], ['b', 'x']]);
});

test('ci-plan: ekran testinin modülleri açtığı yoldan okunur; değişkenle ya da modülü olmayan yolla açan test modülsüzdür', () => {
  assert.deepEqual(ekranModulleri(ICERIK.get('ekran-testleri/plan.spec.ts')!, MODULLER), ['plan']);
  assert.deepEqual(ekranModulleri(ICERIK.get('ekran-testleri/stok.spec.ts')!, MODULLER), ['stok']);
  assert.equal(ekranModulleri(ICERIK.get('ekran-testleri/sayfalar.spec.ts')!, MODULLER), null);
  assert.equal(ekranModulleri("await ac('/uretim-terminali');", MODULLER), null);
  assert.equal(ekranModulleri("await ac('/plan'); await ac('/yok');", MODULLER), null);
  assert.equal(ekranModulleri('const x = 1;', MODULLER), null);
});

test('ci-plan: grafiğin bilmediği değişiklik her dosyayı koşturur', () => {
  assert.deepEqual(sec(['eslint.config.js'], { bilinmeyenler: ['eslint.config.js'] }), TUM);
});

test('ci-plan: modül değişikliği etkilenen testleri, o modülün ve modülsüz ekran testlerini, Windows kümesindeki kesişimi seçer', () => {
  const s = sec(['sunucu/moduller/plan/servis.ts'], {
    moduller: [{ taraf: 'sunucu', ad: 'plan', nedenler: [] }], nodeTestleri: ['sunucu/moduller/plan/b.test.ts'],
    digerDosyalar: ['sunucu/ana.ts'],
  });
  assert.deepEqual(s, {
    sunucu: ['sunucu/moduller/plan/b.test.ts'], istemci: [], windows: ['sunucu/moduller/plan/b.test.ts'],
    ekran: ['ekran-testleri/plan.spec.ts', 'ekran-testleri/sayfalar.spec.ts'],
  });
});

test('ci-plan: göç bütün sunucu testlerini koşturur; içe aktarılmayan başka dosya (kural metni) onu adıyla anan testi seçer; kod dosyası adıyla seçmez', () => {
  const goc = sec(['sunucu/gocler/20990101000000_x.sql'], { digerDosyalar: ['sunucu/gocler/20990101000000_x.sql'] });
  assert.deepEqual([goc.sunucu, goc.windows], [TUM.sunucu, TUM.windows], 'göç bütün sunucu testlerini koşturur');
  assert.deepEqual(sec(['CLAUDE.md'], { digerDosyalar: ['CLAUDE.md'] }).sunucu, ['sunucu/cekirdek/a.test.ts']);
  assert.deepEqual(sec(['sunucu/cekirdek/CLAUDE.md.ts'], {}).sunucu, []);
  // Klasörü readdir ile tarayan test, o klasöre eklenen (kimsenin ithal etmediği) dosyayla seçilir; başka klasörün eşi seçilmez.
  assert.deepEqual(sec(['sunucu/moduller/stok/islemler/yeni.ts'], {}).sunucu, ['sunucu/moduller/stok/c.test.ts']);
  assert.deepEqual(sec(['sunucu/moduller/plan/islemler/yeni.ts'], {}).sunucu, []);
});

test('ci-plan: her sunucu testine --import ile giren ön yüklemeye ulaşan değişiklik bütün sunucu testlerini koşturur', () => {
  const ters = new Map([['araclar/ortam.ts', new Set(['araclar/ortam-yukle-goc.ts', 'araclar/ortam.test.ts'])], ['sunucu/kablolama.ts', new Set(['araclar/kablolama-yukle.ts'])]]);
  assert.equal(onYuklemeyeUlasir(['araclar/ortam-yukle-goc.ts'], ters), true);
  assert.equal(onYuklemeyeUlasir(['araclar/kablolama-yukle.ts'], ters), true);
  assert.equal(onYuklemeyeUlasir(['araclar/ortam.ts'], ters), true);
  assert.equal(onYuklemeyeUlasir(['sunucu/moduller/plan/servis.ts'], ters), false);
  // Kablolama her modülü ithal eder; ondan geçen yol sayılmaz (yoksa her değişiklik tam küme olurdu).
  const kablolu = new Map([...ters, ['sunucu/moduller/plan/servis.ts', new Set(['sunucu/kablolama.ts'])]]);
  assert.equal(onYuklemeyeUlasir(['sunucu/moduller/plan/servis.ts'], kablolu), false);
  assert.equal(onYuklemeyeUlasir(['sunucu/kablolama.ts'], kablolu), false);
  const s = secimHesapla({ degisenler: ['araclar/ortam-yukle-goc.ts'], etki: etki({}), tum: TUM, ekranIcerikleri: ICERIK,
    istemciModulleri: MODULLER, sunucuIcerikleri: SUNUCU_ICERIK, onYuklemeDegisti: true });
  assert.deepEqual([s.sunucu, s.windows], [TUM.sunucu, TUM.windows]);
});

test('ci-plan: değişen ekran testi koşar; ortak ekran dosyası ya da modül dışı istemci dosyası bütün ekran testlerini koşturur', () => {
  assert.deepEqual(sec(['ekran-testleri/stok.spec.ts'], {}).ekran, ['ekran-testleri/stok.spec.ts', 'ekran-testleri/sayfalar.spec.ts']);
  assert.deepEqual(sec(['ekran-testleri/ortak.ts'], {}).ekran, TUM.ekran);
  assert.deepEqual(sec(['istemci/src/moduller/stok/a.ts'], { digerDosyalar: ['istemci/src/App.tsx'] }).ekran, TUM.ekran);
});

test('ci-plan: kapalı iş ve boş seçim plana girmez', () => {
  const plan = planKur({ ...TUM, istemci: [] }, { sunucu: true, istemci: true, ekran: false, windows: true }, {});
  assert.deepEqual(plan.map((p) => p.is), ['sunucu', 'windows']);
});

test('ci-plan: playwright raporu dosya başına toplam süreye çevrilir; süre birleşiminde yeni ölçü eskiyi ezer, ölçülmeyen kalır', () => {
  const rapor = { suites: [{ file: 'stok.spec.ts', specs: [{ file: 'stok.spec.ts', tests: [{ results: [{ duration: 100 }] }, { results: [{ duration: 50 }] }] }],
    suites: [{ specs: [{ file: 'stok.spec.ts', tests: [{ results: [{ duration: 25 }] }] }] }] }] };
  assert.deepEqual(ekranSureleri(rapor), { 'ekran-testleri/stok.spec.ts': 175 });
  assert.deepEqual(sureleriBirlestir({ sunucu: { a: 1, b: 2 } }, { sunucu: { b: 5 }, ekran: { c: 3 } }), { sunucu: { a: 1, b: 5 }, ekran: { c: 3 } });
});

test('ci-plan: raporcu dosya süresini yalnız en üst düzey test ve takımlardan toplar', () => {
  const sureler = new Map<string, number>();
  const dosya = join(KOK, 'sunucu/cekirdek/a.test.ts');
  sureEkle(sureler, { nesting: 0, file: dosya, details: { duration_ms: 10 } });
  sureEkle(sureler, { nesting: 1, file: dosya, details: { duration_ms: 99 } });
  sureEkle(sureler, { nesting: 0, file: dosya, details: { duration_ms: 5 } });
  assert.deepEqual([...sureler], [['sunucu/cekirdek/a.test.ts', 15]]);
});

test('ci-plan: ana dalda her test dosyası bir kez, parça sınırını aşmadan plana girer', () => {
  const klasor = mkdtempSync(join(tmpdir(), 'ci-plan-'));
  try {
    const r = spawnSync(process.execPath, ['araclar/ci-plan.ts', 'plan', '--olay', 'push', '--cikti', klasor], {
      cwd: KOK, encoding: 'utf8', input: '', env: { ...process.env, SUNUCU: 'true', ISTEMCI: 'true', EKRAN: 'true' },
    });
    assert.equal(r.status, 0, r.stderr);
    const tum = tumDosyalar(KOK);
    for (const is of ['sunucu', 'istemci', 'ekran', 'windows'] as const) {
      const listeler = readdirSync(klasor).filter((d) => d.startsWith(`${is}-`));
      assert.equal(listeler.length, Math.min(PARCA[is], tum[is].length), is);
      const kosan = listeler.flatMap((d) => readFileSync(join(klasor, d), 'utf8').split('\n').filter(Boolean)).sort();
      assert.deepEqual(kosan, [...tum[is]].sort(), is);
      assert.match(r.stdout, new RegExp(`^${is}=true$`, 'm'));
    }
    assert.ok(tum.ekran.every((d) => !/(^|\/)(portal|mesaj)(-[^/]*)?\.spec\.ts$/.test(d)), 'kapalı modülün ekran testi plana girmez');
  } finally {
    rmSync(klasor, { recursive: true, force: true });
  }
});

test('ci-plan: çekme isteğinde gerçek ithal grafiğiyle istemci dosyası kendi testini seçer, bütün istemci testlerini koşturmaz', () => {
  const klasor = mkdtempSync(join(tmpdir(), 'ci-plan-'));
  try {
    const r = spawnSync(process.execPath, ['araclar/ci-plan.ts', 'plan', '--olay', 'pull_request', '--cikti', klasor], {
      cwd: KOK, encoding: 'utf8', input: 'istemci/src/moduller/siparisler/ana-sayfa.tsx\n',
      env: { ...process.env, SUNUCU: 'false', ISTEMCI: 'true', EKRAN: 'false' },
    });
    assert.equal(r.status, 0, r.stderr);
    const kosan = readdirSync(klasor).filter((d) => d.startsWith('istemci-'))
      .flatMap((d) => readFileSync(join(klasor, d), 'utf8').split('\n').filter(Boolean));
    assert.ok(kosan.includes('istemci/src/moduller/siparisler/ana-sayfa.test.tsx'), kosan.join(', '));
    assert.ok(kosan.length < tumDosyalar(KOK).istemci.length, String(kosan.length));
    assert.match(r.stdout, /^sunucu=false$/m);
  } finally {
    rmSync(klasor, { recursive: true, force: true });
  }
});
