import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  GECIS_ANI, farkSinifi, ithalCoz, komsuModuller, kontrolEt, modulKosuldu, onizlemeFarkiOku, vtModulleri, yamaAyrintisi, yetkiDegisimi,
} from './teslim-kontrolleri.ts';
import type { KontrolGirdisi } from './teslim-kontrolleri.ts';

const SONRA = GECIS_ANI + 60_000;
const ONCE = GECIS_ANI - 60_000;

function girdi(ek: Partial<KontrolGirdisi> = {}): KontrolGirdisi {
  return {
    dosyalar: ['sunucu/moduller/stok/servis.ts'], yamaTarihi: SONRA, komsular: [], testSatirlari: [], vtModuller: [], komsuMuafSatirlari: [],
    yetkiKapilari: [], yetkisizTestler: [], yetkiMuaf: false, onizlemeFarki: null, ...ek,
  };
}
const etiketler = (g: KontrolGirdisi) => kontrolEt(g).map((b) => `${b.duzey}:${b.etiket}`);

test('D1 komsuModuller: değişen dosyayı modül içinden dolaylı ithal eden başka modül bulunur; ötesine geçilmez', () => {
  const dosyalar = new Map([
    ['istemci/src/moduller/atolye/GozPaneli.tsx', 'export const G = 1;'],
    ['istemci/src/moduller/atolye/DepoPaneli.tsx', "import { G } from './GozPaneli.tsx';"],
    ['istemci/src/moduller/atolye/disari.ts', "export * from './DepoPaneli.tsx';"],
    ['istemci/src/moduller/stok/Depo.tsx', "import { D } from '../atolye/disari.ts';"],
    ['istemci/src/moduller/plan/Pano.tsx', "import { X } from '../stok/Depo.tsx';"],
    ['istemci/src/moduller/oee/Ilgisiz.tsx', "import { Y } from '../atolye/kurallar.ts';"],
    ['istemci/src/moduller/atolye/kurallar.ts', 'export const Y = 1;'],
  ]);
  const k = komsuModuller(['istemci/src/moduller/atolye/GozPaneli.tsx'], dosyalar);
  assert.deepEqual(k.map((x) => x.modul), ['stok']);
  assert.equal(k[0]?.neden, 'istemci/src/moduller/stok/Depo.tsx -> istemci/src/moduller/atolye/disari.ts');
});

test('D1 komsuModuller: yama birden çok modüle doğrudan dokunursa her biri istenir; tek modülde istenmez', () => {
  const dosyalar = new Map([
    ['istemci/src/moduller/atolye/A.tsx', 'export const A = 1;'],
    ['sunucu/moduller/stok/disari.ts', 'export const S = 1;'],
  ]);
  assert.deepEqual(komsuModuller(['istemci/src/moduller/atolye/A.tsx', 'sunucu/moduller/stok/disari.ts'], dosyalar).map((x) => x.modul), ['atolye', 'stok']);
  assert.deepEqual(komsuModuller(['istemci/src/moduller/atolye/A.tsx'], dosyalar), []);
});

test('D1 komsuModuller: sözleşme dosyası izlenir; test dosyası ve öteki ortak dosyalar kaynak sayılmaz', () => {
  const dosyalar = new Map([
    ['paylasilan/sozlesme/stok.ts', 'export const S = 1;'],
    ['paylasilan/zaman.ts', 'export const Z = 1;'],
    ['sunucu/moduller/satin-alma/uclar.ts', "import { S } from '#paylasilan/sozlesme/stok.ts';\nimport { Z } from '#paylasilan/zaman.ts';"],
    ['istemci/src/moduller/stok/veri.ts', "import { S } from '#paylasilan/sozlesme/stok.ts';"],
    ['sunucu/moduller/stok/servis.test.ts', 'x'],
    ['sunucu/moduller/plan/a.ts', "import x from '../stok/servis.test.ts';"],
  ]);
  assert.deepEqual(komsuModuller(['paylasilan/sozlesme/stok.ts', 'istemci/src/moduller/stok/veri.ts'], dosyalar).map((x) => x.modul), ['satin-alma']);
  assert.deepEqual(komsuModuller(['paylasilan/zaman.ts'], dosyalar), []);
  assert.deepEqual(komsuModuller(['sunucu/moduller/stok/servis.test.ts'], dosyalar), []);
});

test('ithalCoz: göreli, #paylasilan, #cekirdek ve uzantısız yol; paket ithali null', () => {
  const var_ = (y: string) => ['istemci/src/moduller/a/b.tsx', 'paylasilan/x.ts', 'sunucu/cekirdek/db.ts', 'istemci/src/moduller/a/c/index.ts'].includes(y);
  assert.equal(ithalCoz('istemci/src/moduller/a/x.tsx', './b', var_), 'istemci/src/moduller/a/b.tsx');
  assert.equal(ithalCoz('istemci/src/moduller/a/x.tsx', './c', var_), 'istemci/src/moduller/a/c/index.ts');
  assert.equal(ithalCoz('sunucu/moduller/a/x.ts', '#paylasilan/x.ts', var_), 'paylasilan/x.ts');
  assert.equal(ithalCoz('sunucu/moduller/a/x.ts', '#cekirdek/db.ts', var_), 'sunucu/cekirdek/db.ts');
  assert.equal(ithalCoz('sunucu/moduller/a/x.ts', 'react', var_), null);
});

test('D1 kontrol: komşu modülün testi yoksa kırmızı; DEVIR satırı, VT-SONUC ya da gerekçe kapatır; olumsuz satır sayılmaz', () => {
  const komsular = [{ modul: 'stok', neden: 'stok/Depo.tsx -> atolye/disari.ts' }];
  assert.deepEqual(etiketler(girdi({ komsular })), ['kirmizi:komsu-test']);
  assert.deepEqual(etiketler(girdi({ komsular, testSatirlari: ['- npm run test:modul -- stok: pass 409 fail 0'] })), []);
  assert.deepEqual(etiketler(girdi({ komsular, vtModuller: ['stok'] })), []);
  assert.deepEqual(etiketler(girdi({ komsular, komsuMuafSatirlari: [' stok yalniz tipi okur'] })), ['uyari:komsu-test']);
  assert.deepEqual(etiketler(girdi({ komsular, testSatirlari: ['- npm run test:modul -- stok calistirilmadi'] })), ['kirmizi:komsu-test']);
  // "stok-sayim" adı "stok" sayılmaz.
  assert.equal(modulKosuldu('stok', ['npm run test:modul -- stok-sayim: pass 3 fail 0'], []), false);
  // Yalnız yeşil sonuç yazan satır koşu sayılır.
  assert.equal(modulKosuldu('stok', ['npm run test:modul -- stok: pass 406 fail 3'], []), false);
  assert.equal(modulKosuldu('stok', ['npm run test:modul -- stok: 3 failed, 406 passed'], []), false);
  assert.equal(modulKosuldu('stok', ['KIRMIZI test:modul stok (sunucu)'], []), false);
  assert.equal(modulKosuldu('stok', ['npm run test:modul -- stok'], []), false);
  assert.equal(modulKosuldu('stok', ['npm run test:modul -- stok: Tests 321 passed (321)'], []), true);
  assert.equal(modulKosuldu('stok', ['npm run test:modul -- stok: 45/45'], []), true);
  assert.equal(modulKosuldu('stok', ['npm run test:modul -- stok: 44/45'], []), false);
});

test('vtModulleri: VT-SONUC.md GEÇTİ satırlarından modül adları', () => {
  assert.deepEqual(vtModulleri('GEÇTİ   test:modul atolye (sunucu)\nGEÇTİ   test:modul atolye (istemci)\nKIRMIZI test:modul stok (sunucu)\n'), ['atolye']);
  assert.deepEqual(vtModulleri(null), []);
  // Bir tarafı kırmızı olan modül sayılmaz.
  assert.deepEqual(vtModulleri('GEÇTİ   test:modul stok (sunucu)\nKIRMIZI test:modul stok (istemci)\n'), []);
});

const YAMA_YETKI = [
  'From 1 Mon Sep 17 00:00:00 2001', 'Date: Wed, 11 Nov 2026 22:00:00 +0000', '',
  'diff --git a/istemci/src/moduller/geometri/Atolye3B.tsx b/istemci/src/moduller/geometri/Atolye3B.tsx',
  '--- a/istemci/src/moduller/geometri/Atolye3B.tsx', '+++ b/istemci/src/moduller/geometri/Atolye3B.tsx',
  '-      sag={<Dugme>Yeniden hesapla</Dugme>}>', '+      sag={<Yetkili islem="geometri.hesapla"><Dugme>Yeniden hesapla</Dugme></Yetkili>}>', '',
].join('\n');
const YAMA_SPEC = (satir: string) => [
  'diff --git a/ekran-testleri/geometri-roller.spec.ts b/ekran-testleri/geometri-roller.spec.ts',
  '--- a/ekran-testleri/geometri-roller.spec.ts', '+++ b/ekran-testleri/geometri-roller.spec.ts', `+${satir}`, '',
].join('\n');

test('yamaAyrintisi: yazar tarihi ve dosya başına eklenen/silinen satırlar', () => {
  const a = yamaAyrintisi(YAMA_YETKI);
  assert.equal(a.tarih, Date.parse('2026-11-11T22:00:00Z'));
  assert.equal(a.satirlar.get('istemci/src/moduller/geometri/Atolye3B.tsx')?.eklenen.length, 1);
  assert.equal(a.satirlar.get('istemci/src/moduller/geometri/Atolye3B.tsx')?.silinen.length, 1);
  assert.equal(yamaAyrintisi('diff --git a/x b/x\n').tarih, null);
});

test('D2 yetkiDegisimi: yetki kapısı satırı bulunur; yetkisiz test yalnız yönetici dışı hesapla sayılır', () => {
  const bos = () => null;
  assert.deepEqual(yetkiDegisimi([yamaAyrintisi(YAMA_YETKI)], bos), { kapilar: ['istemci/src/moduller/geometri/Atolye3B.tsx'], yetkisizTestler: [] });
  assert.deepEqual(yetkiDegisimi([yamaAyrintisi(YAMA_SPEC("  test.use({ hesap: 'ornek.yonetici' });"))], bos).yetkisizTestler, []);
  assert.deepEqual(yetkiDegisimi([yamaAyrintisi(YAMA_SPEC("  test.use({ hesap: 'ornek.mudur' });"))], bos).yetkisizTestler, ['ekran-testleri/geometri-roller.spec.ts']);
  // Hesap satırı dosyada zaten varsa yeni test o bloğa eklenmiş sayılır.
  const dosyada = (y: string) => (y.endsWith('.spec.ts') ? "test.use({ hesap: 'ornek.kalite' });" : null);
  assert.deepEqual(yetkiDegisimi([yamaAyrintisi(YAMA_SPEC('  expect(sayi).toBe(0);'))], dosyada).yetkisizTestler, ['ekran-testleri/geometri-roller.spec.ts']);
  // Test dosyasındaki yetki çağrısı kapı sayılmaz.
  const testte = YAMA_YETKI.replace(/Atolye3B\.tsx/g, 'Atolye3B.test.tsx');
  assert.deepEqual(yetkiDegisimi([yamaAyrintisi(testte)], bos).kapilar, []);
});

test('D2 kontrol: kapı değişip yetkisiz test yoksa kırmızı; test ya da gerekçe kapatır', () => {
  const kapi = { yetkiKapilari: ['istemci/src/moduller/geometri/Atolye3B.tsx'] };
  assert.deepEqual(etiketler(girdi(kapi)), ['kirmizi:yetkisiz-test']);
  assert.deepEqual(etiketler(girdi({ ...kapi, yetkisizTestler: ['ekran-testleri/a.spec.ts'] })), []);
  assert.deepEqual(etiketler(girdi({ ...kapi, yetkiMuaf: true })), ['uyari:yetkisiz-test']);
});

test('D3 onizlemeFarkiOku ve farkSinifi: "yok", madde listesi ve tek satırlık fark', () => {
  assert.deepEqual(onizlemeFarkiOku('# Teslim\n\nÖn izlemeden fark: yok\n'), { yok: true, maddeler: [] });
  const f = onizlemeFarkiOku('## Ön izlemeden fark\n- Düğme adı "Kaydet" oldu (kartta var)\n- Yazım düzeltmesi, 3020 a\n- Yeni sütun — kart ister\n- Renk koyulaştı\n\n## Sonra\n- bu sayılmaz\n');
  assert.deepEqual(f?.maddeler.map((m) => m.sinif), ['kartta-var', '3020a', 'kart-ister', null]);
  assert.deepEqual(onizlemeFarkiOku('On izlemeden fark: on izleme yok, 3020 a hata duzeltmesi')?.maddeler.map((m) => m.sinif), ['3020a']);
  assert.equal(onizlemeFarkiOku('fark yok'), null);
  assert.deepEqual(onizlemeFarkiOku('Önizlemeden fark: yok'), { yok: true, maddeler: [] });
  assert.equal(farkSinifi('KARTTA VAR'), 'kartta-var');
  assert.equal(farkSinifi('30201 a'), null);
});

test('D3 kontrol: yalnız arayüz dosyasında; satır yoksa, sınıfsızsa ya da "kart ister" varsa kırmızı', () => {
  const ekran = { dosyalar: ['istemci/src/moduller/stok/Liste.tsx'] };
  assert.deepEqual(etiketler(girdi(ekran)), ['kirmizi:onizleme-farki']);
  assert.deepEqual(etiketler(girdi({ ...ekran, onizlemeFarki: { yok: true, maddeler: [] } })), []);
  assert.deepEqual(etiketler(girdi({ ...ekran, onizlemeFarki: { yok: false, maddeler: [{ metin: 'a', sinif: 'kartta-var' }, { metin: 'b', sinif: '3020a' }] } })), []);
  assert.deepEqual(etiketler(girdi({ ...ekran, onizlemeFarki: { yok: false, maddeler: [{ metin: 'a', sinif: null }] } })), ['kirmizi:onizleme-farki']);
  assert.deepEqual(etiketler(girdi({ ...ekran, onizlemeFarki: { yok: false, maddeler: [{ metin: 'a', sinif: 'kart-ister' }] } })), ['kirmizi:onizleme-farki']);
  assert.deepEqual(etiketler(girdi({ ...ekran, onizlemeFarki: { yok: false, maddeler: [] } })), ['kirmizi:onizleme-farki']);
  // Sunucu ve test dosyası ekran sayılmaz.
  assert.deepEqual(etiketler(girdi({ dosyalar: ['sunucu/moduller/stok/servis.ts', 'istemci/src/moduller/stok/Liste.test.tsx'] })), []);
});

test('geçiş: karardan önce yazılmış yamada üç madde de uyarıya iner; tarihsiz yama geçiş sayılmaz', () => {
  const hepsi = { dosyalar: ['istemci/src/moduller/stok/Liste.tsx'], komsular: [{ modul: 'plan', neden: 'x' }], yetkiKapilari: ['istemci/src/moduller/stok/Liste.tsx'] };
  assert.deepEqual(etiketler(girdi({ ...hepsi, yamaTarihi: ONCE })), ['uyari:komsu-test', 'uyari:yetkisiz-test', 'uyari:onizleme-farki']);
  assert.deepEqual(etiketler(girdi({ ...hepsi, yamaTarihi: null })), ['kirmizi:komsu-test', 'kirmizi:yetkisiz-test', 'kirmizi:onizleme-farki']);
});
