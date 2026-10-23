import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { etkiHesapla, kablolamaBaglari, kablolamaOku, kaynaklariOku } from './etki.ts';
import type { Etki } from './etki.ts';
import { haritaKos } from './harita.ts';

// alfa olayı verir (alfaDinle) ve çözücü kullanır (alfaCozucusu); beta olayı dinler, gama alfaya işlev verir,
// delta alfanın işlevini çözücüsüne alır. eps yalnız testinde alfayı ithal eder.
const KABLOLAMA = [
  "import * as alfa from './moduller/alfa/disari.ts';",
  "import { betaYansit } from './moduller/beta/disari.ts';",
  "import { gamaVer as gamaninIslevi } from './moduller/gama/disari.ts';",
  "import { deltaCozucusu } from './moduller/delta/disari.ts';",
  'export function sunucununBaglari() {',
  '  return [',
  "    bag('alfa olayı -> beta', alfa.alfaDinle, betaYansit),",
  "    bag('gama -> alfa', alfa.alfaCozucusu, gamaninIslevi && (async () => 1)),",
  "    bag('alfa -> delta',",
  '      deltaCozucusu, alfa.alfaVer),',
  '  ];',
  '}',
].join('\n');

const AGAC: Record<string, string> = {
  'sunucu/kablolama.ts': KABLOLAMA,
  'sunucu/moduller/alfa/disari.ts': "export { alfaYap } from './servis.ts';\n",
  'sunucu/moduller/alfa/servis.ts': "import { sozlesme } from '#paylasilan/sozlesme/alfa.ts';\nexport const alfaYap = () => sozlesme;\n",
  'sunucu/moduller/alfa/alfa.test.ts': "import { alfaYap } from './servis.ts';\nalfaYap();\n",
  'sunucu/moduller/beta/disari.ts': 'export const betaYansit = () => 1;\n',
  'sunucu/moduller/beta/beta.test.ts': "import { betaYansit } from './disari.ts';\nbetaYansit();\n",
  'sunucu/moduller/gama/disari.ts': 'export const gamaVer = () => 1;\n',
  'sunucu/moduller/gama/gama.test.ts': "import { gamaVer } from './disari.ts';\ngamaVer();\n",
  'sunucu/moduller/delta/disari.ts': 'export const deltaCozucusu = () => 1;\n',
  'sunucu/moduller/delta/delta.test.ts': "import { deltaCozucusu } from './disari.ts';\ndeltaCozucusu();\n",
  'sunucu/moduller/zeta/servis.ts': "import { alfaYap } from '../alfa/disari';\nexport const zeta = alfaYap;\n",
  'sunucu/moduller/eps/eps.test.ts': "import { alfaYap } from '../alfa/disari.ts';\nalfaYap();\n",
  'sunucu/gocler/20270101000000_alfa_tablo.sql': 'CREATE TABLE alfa_kaydi (id int);\n',
  'paylasilan/sozlesme/alfa.ts': 'export const sozlesme = 1;\n',
  'istemci/src/moduller/alfa/Ekran.tsx': "import { sozlesme } from '#paylasilan/sozlesme/alfa.ts';\nexport const Ekran = sozlesme;\n",
  'istemci/src/moduller/alfa/Ekran.test.tsx': "import { Ekran } from './Ekran';\nEkran;\n",
  'istemci/src/moduller/teta/Teta.test.tsx': '// import { sozlesme } from "#paylasilan/sozlesme/alfa.ts";\n',
};

function agacKur(t: TestContext): string {
  const kok = mkdtempSync(join(tmpdir(), 'tmiv2-etki-'));
  t.after(() => rmSync(kok, { recursive: true, force: true }));
  for (const [yol, icerik] of Object.entries(AGAC)) {
    mkdirSync(dirname(join(kok, yol)), { recursive: true });
    writeFileSync(join(kok, yol), icerik);
  }
  return kok;
}

async function etki(t: TestContext, degisenler: string[]): Promise<Etki> {
  const kok = agacKur(t);
  return etkiHesapla(await kaynaklariOku(kok), await kablolamaOku(kok), degisenler);
}

const adlar = (e: Etki): string[] => e.moduller.map((m) => `${m.taraf} ${m.ad}`);

test('kablolamaBaglari: ad uzayı, adlı ve takma adlı ithal, ifadeyle başlayan karşılık ve çok satırlı bağ okunur', () => {
  assert.deepEqual(kablolamaBaglari(KABLOLAMA), [
    { ad: 'alfa olayı -> beta', kanca: { modul: 'alfa', ad: 'alfaDinle' }, karsilik: { modul: 'beta', ad: 'betaYansit' }, satir: 7 },
    { ad: 'gama -> alfa', kanca: { modul: 'alfa', ad: 'alfaCozucusu' }, karsilik: { modul: 'gama', ad: 'gamaninIslevi' }, satir: 8 },
    { ad: 'alfa -> delta', kanca: { modul: 'delta', ad: 'deltaCozucusu' }, karsilik: { modul: 'alfa', ad: 'alfaVer' }, satir: 9 },
  ]);
});

test('etki: ithal geçişlidir; olay bağı iki yöne, çözücü bağı yalnız işlev verenden kullanana bir adım geçer', async (t) => {
  const e = await etki(t, ['sunucu/moduller/alfa/servis.ts']);
  // gama alfaya işlev verir: alfa değişince gama etkilenmez. delta alfanın işlevini kullanır: etkilenir.
  assert.deepEqual(adlar(e), ['sunucu alfa', 'sunucu beta', 'sunucu delta', 'sunucu eps', 'sunucu zeta']);
  const neden = (ad: string): string[] => e.moduller.find((m) => m.ad === ad)?.nedenler ?? [];
  assert.deepEqual(neden('alfa'), ['değişti: sunucu/moduller/alfa/servis.ts']);
  // Uzantısız ithal (`../alfa/disari`) çözülür; neden modüle giren ilk kenardır.
  assert.deepEqual(neden('zeta'), ['ithal: sunucu/moduller/zeta/servis.ts -> sunucu/moduller/alfa/disari.ts']);
  assert.deepEqual(neden('eps'), ['yalnız testte ithal: sunucu/moduller/eps/eps.test.ts -> sunucu/moduller/alfa/disari.ts']);
  assert.match(neden('beta')[0] ?? '', /^bağ 'alfa olayı -> beta' \(sunucu\/kablolama\.ts:7\): alfa\.alfaDinle <- beta\.betaYansit$/);
  assert.match(neden('delta')[0] ?? '', /^bağ 'alfa -> delta'/);
  assert.deepEqual(e.nodeTestleri, [
    'sunucu/moduller/alfa/alfa.test.ts', 'sunucu/moduller/beta/beta.test.ts', 'sunucu/moduller/delta/delta.test.ts', 'sunucu/moduller/eps/eps.test.ts',
  ]);
  assert.deepEqual(e.digerDosyalar, ['sunucu/kablolama.ts']);
  assert.deepEqual(e.vitestTestleri, []);
});

test('etki: dinleyen değişince olayı veren etkilenir; işlev veren değişince çözücüyü kullanan etkilenir', async (t) => {
  assert.ok(adlar(await etki(t, ['sunucu/moduller/beta/disari.ts'])).includes('sunucu alfa'));
  const gama = await etki(t, ['sunucu/moduller/gama/disari.ts']);
  assert.deepEqual(adlar(gama), ['sunucu alfa', 'sunucu gama']);
  // Bağla eklenen modülden yeni bağ açılmaz: alfa üzerinden beta ve delta gelmez.
  assert.deepEqual(gama.nodeTestleri, ['sunucu/moduller/alfa/alfa.test.ts', 'sunucu/moduller/gama/gama.test.ts']);
});

test('etki: sözleşme iki tarafın kullananına gider; yorumdaki ithal sayılmaz', async (t) => {
  const e = await etki(t, ['paylasilan/sozlesme/alfa.ts']);
  // alfanın kodu değişmedi, yalnız ithal ettiği sözleşme: bağ adımı açılmaz, beta ve delta gelmez.
  assert.deepEqual(adlar(e), ['istemci alfa', 'sunucu alfa', 'sunucu eps', 'sunucu zeta']);
  assert.deepEqual(e.vitestTestleri, ['istemci/src/moduller/alfa/Ekran.test.tsx']);
});

test('etki: göç modülün testlerini, belge hiçbir şeyi seçer; bilinmeyen dosya tam test ister', async (t) => {
  const e = await etki(t, ['sunucu/gocler/20270101000000_alfa_tablo.sql', 'kurulum/not.md', 'package.json']);
  assert.deepEqual(e.moduller.map((m) => [m.ad, m.nedenler[0]]).slice(0, 1), [['alfa', 'göç: sunucu/gocler/20270101000000_alfa_tablo.sql']]);
  assert.ok(e.nodeTestleri.includes('sunucu/moduller/alfa/alfa.test.ts'));
  assert.deepEqual(e.bilinmeyenler, ['package.json']);
});

test('harita --etki: dosya listesiyle metin basar, bayrak benzeri argüman kullanım hatasıdır; --modul bağları gösterir', async (t) => {
  const kok = agacKur(t);
  const sonuc = await haritaKos(['--etki', 'sunucu/moduller/gama/disari.ts'], kok);
  assert.equal(sonuc.kod, 0);
  assert.match(sonuc.cikti, /^Değişenler \(1\)\n {2}sunucu\/moduller\/gama\/disari\.ts\nEtkilenen modüller \(2\)\n/);
  assert.match(sonuc.cikti, /\n {2}node --import \.\/araclar\/ortam-yukle-goc\.ts --import \.\/araclar\/kablolama-yukle\.ts --test sunucu\/moduller\/alfa\/alfa\.test\.ts sunucu\/moduller\/gama\/gama\.test\.ts\n/);

  const hatali = await haritaKos(['--etki', '--fazla'], kok);
  assert.equal(hatali.kod, 1);
  assert.match(hatali.cikti, /Kullanım: npm run harita/);

  const modul = await haritaKos(['--modul', 'alfa'], kok);
  assert.match(modul.cikti, /\n {2}Olay ve çözücü bağları \(3\)\n {4}alfa\.alfaDinle <- beta\.betaYansit {2}'alfa olayı -> beta' \(sunucu\/kablolama\.ts:7\)\n/);
});
