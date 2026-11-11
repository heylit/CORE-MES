import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  argumanOku, ayriTurNedeni, dayanakZinciri, denetle, devirOku, grupla, kilitIcinde, klasorOku, suslu, yamaDosyalari, yamaSirasi,
} from './teslim-denetle.ts';
import type { Devir, TeslimGirdisi } from './teslim-denetle.ts';
import { sonucMetni } from './teslim-vt.ts';

Object.assign(process.env, {
  GIT_CONFIG_COUNT: '2',
  GIT_CONFIG_KEY_0: 'gc.auto', GIT_CONFIG_VALUE_0: '0',
  GIT_CONFIG_KEY_1: 'maintenance.auto', GIT_CONFIG_VALUE_1: 'false',
});

const SHA = 'a'.repeat(64);
const yama = (...yollar: string[]) => yollar.map((y) => `diff --git a/${y} b/${y}\n--- a/${y}\n+++ b/${y}\n`).join('');

function devir(ek: Partial<Devir> = {}): Devir {
  return {
    taban: 'abc1234', shalar: [SHA], kilit: ['sunucu/moduller/stok/'], baslikVar: true, ustune: null, sade: true, onaySatiri: false,
    taramaSatiri: true, testSatiri: true, tamTest: false, testSatirlari: [], komsuMuafSatirlari: [], yetkiMuaf: false, onizlemeFarki: null, ...ek,
  };
}

function girdi(ek: Partial<TeslimGirdisi> = {}, dosyalar = ['sunucu/moduller/stok/servis.ts']): TeslimGirdisi {
  return {
    klasor: '/x/2300', devir: devir(), yamalar: [{ ad: '0001.patch', sha256: SHA, dosyalar }], tabanGeride: 0,
    enBuyukGoc: '20261106099600', anaDaldakiGocler: [], vtSonuc: { pg: 18, yamalar: [SHA], gecti: true }, ...ek,
  };
}

const etiketler = (g: TeslimGirdisi) => denetle(g).map((b) => `${b.duzey}:${b.etiket}`);

test('eksiksiz sade teslim geçer: bulgu yok', () => {
  assert.deepEqual(etiketler(girdi()), []);
});

test('sha256 DEVIR.md ile tutmazsa kırmızı', () => {
  assert.deepEqual(etiketler(girdi({ devir: devir({ shalar: ['b'.repeat(64)] }) })), ['kirmizi:sha']);
});

test('taban yok, yerelde yok, ata değil kırmızı; gerideyse yalnız uyarı', () => {
  assert.ok(etiketler(girdi({ devir: devir({ taban: null }) })).includes('kirmizi:taban'));
  assert.ok(etiketler(girdi({ tabanGeride: null })).includes('kirmizi:taban'));
  assert.ok(etiketler(girdi({ tabanGeride: -1 })).includes('kirmizi:taban'));
  assert.deepEqual(etiketler(girdi({ tabanGeride: 3 })), ['uyari:taban-geride']);
});

test('kilit dışı dosya kırmızı; kilit başlığı yoksa dosyalar uyarıyla listelenir, kırmızı değil', () => {
  const disari = girdi({}, ['sunucu/moduller/stok/servis.ts', 'sunucu/moduller/plan/servis.ts']);
  assert.ok(etiketler(disari).includes('kirmizi:kilit-disi'));
  assert.deepEqual(etiketler(girdi({ devir: devir({ kilit: [] }) })), ['uyari:kilit-basligi-yok']);
});

test('"Sade: evet" yazılı ama ortak noktaya dokunuyorsa kırmızı; yazılmamışsa uyarı', () => {
  const ortak = ['paylasilan/sozlesme/stok.ts'];
  const g = girdi({ devir: devir({ kilit: ['paylasilan/sozlesme/stok.ts'] }) }, ortak);
  assert.ok(etiketler(g).includes('kirmizi:sade-yanlis'));
  const yazilmamis = girdi({ devir: devir({ sade: null }) });
  assert.deepEqual(etiketler(yazilmamis), ['uyari:sade-yazilmamis']);
});

test('yazılı onay gereken dosyada onay satırı yoksa kırmızı, varsa geçer', () => {
  const dosya = ['.claude/settings.json'];
  const kilit = devir({ kilit: dosya, sade: false });
  assert.ok(etiketler(girdi({ devir: kilit }, dosya)).includes('kirmizi:onay'));
  assert.deepEqual(etiketler(girdi({ devir: { ...kilit, onaySatiri: true } }, dosya)), []);
});

test('göç damgası ana daldaki en büyükten küçükse kırmızı; aynı göç ana daldaysa yalnız uyarı', () => {
  const eski = 'sunucu/gocler/20261106099500_stok.sql';
  const d = devir({ kilit: ['sunucu/moduller/stok/', eski], sade: false, onaySatiri: true });
  assert.ok(etiketler(girdi({ devir: d }, [eski])).includes('kirmizi:goc-damgasi'));
  assert.ok(etiketler(girdi({ devir: d, anaDaldakiGocler: [eski] }, [eski])).includes('uyari:zaten-ana-dalda'));
  const yeni = 'sunucu/gocler/20261107044500_stok.sql';
  assert.ok(!etiketler(girdi({ devir: { ...d, kilit: [yeni] } }, [yeni])).includes('kirmizi:goc-damgasi'));
});

test('tarama ve test satırı yoksa kırmızı; yerelde tam test koşulduysa uyarı', () => {
  assert.ok(etiketler(girdi({ devir: devir({ taramaSatiri: false }) })).includes('kirmizi:tarama'));
  assert.ok(etiketler(girdi({ devir: devir({ testSatiri: false }) })).includes('kirmizi:test'));
  assert.deepEqual(etiketler(girdi({ devir: devir({ tamTest: true }) })), ['uyari:tam-test']);
});

test('DEVIR.md ya da yama yoksa kırmızı', () => {
  assert.deepEqual(etiketler(girdi({ devir: null })), ['kirmizi:devir-yok']);
  assert.ok(etiketler(girdi({ yamalar: [] })).includes('kirmizi:yama-yok'));
});

test('devirOku: başlık bloğu alanları okunur, süslü parantez açılır', () => {
  const d = devirOku([
    '# 2300', '<!-- teslim', 'kart: 2300', 'taban: 1aeb63a', 'kilit: sunucu/moduller/stok/{servis.ts, sorgular.ts}, paylasilan/sozlesme/stok.ts',
    'sade: hayir', 'onay: 2300-1 a', 'ustune: 2299', '-->', `sha256 ${SHA}`, 'Açık depo taraması: temiz', '`npm run sinir`: 0 ihlal',
  ].join('\n'));
  assert.equal(d.taban, '1aeb63a');
  assert.deepEqual(d.kilit, ['sunucu/moduller/stok/servis.ts', 'sunucu/moduller/stok/sorgular.ts', 'paylasilan/sozlesme/stok.ts']);
  assert.equal(d.sade, false);
  assert.equal(d.onaySatiri, true);
  assert.equal(d.ustune, '2299');
  assert.deepEqual(d.shalar, [SHA]);
  assert.equal(d.taramaSatiri, true);
  assert.equal(d.testSatiri, true);
});

test('devirOku: başlıksız eski biçimde taban serbest satırdan okunur, kilit okunmaz', () => {
  const d = devirOku('- Kart: 2195. Taban: main 2f9fa3c (teslim anında main ucu)\n- Dosyalar (kilitli): a.ts\nSade: evet');
  assert.equal(d.taban, '2f9fa3c');
  assert.deepEqual(d.kilit, []);
  assert.equal(d.baslikVar, false);
  assert.equal(d.sade, true);
});

test('devirOku: tam test yalnız koşulduysa işaretlenir', () => {
  assert.equal(devirOku('Tam test:sunucu: 6958/6958').tamTest, true);
  assert.equal(devirOku('Tam test:sunucu yerelde koşulmadı (kapı-sade).').tamTest, false);
  assert.equal(devirOku('- Koşulmadı: tam test:sunucu ve test:istemci').tamTest, false);
});

test('yamaDosyalari: taşınan dosyanın iki adı da sayılır', () => {
  assert.deepEqual(yamaDosyalari(yama('a/x.ts') + 'diff --git a/a/eski.ts b/a/yeni.ts\n'), ['a/x.ts', 'a/eski.ts', 'a/yeni.ts']);
});

test('kilitIcinde: klasör, tam yol, göreli son ek ve yıldız eşleşir; benzer ad eşleşmez', () => {
  assert.equal(kilitIcinde('sunucu/moduller/stok/servis.ts', ['sunucu/moduller/stok/']), true);
  assert.equal(kilitIcinde('sunucu/moduller/stok/servis.ts', ['stok/servis.ts']), true);
  assert.equal(kilitIcinde('sunucu/moduller/stok/a.test.ts', ['stok/*.test.ts']), true);
  assert.equal(kilitIcinde('sunucu/moduller/stok-sayim/servis.ts', ['stok/']), false);
  assert.equal(kilitIcinde('sunucu/moduller/stok/servis.tsx', ['stok/servis.ts']), false);
});

test('suslu: iç içe olmayan süslü parantez açılır', () => {
  assert.deepEqual(suslu('a/{b,c}/d.ts'), ['a/b/d.ts', 'a/c/d.ts']);
  assert.deepEqual(suslu('a.ts'), ['a.ts']);
});

test('grupla: dosyası çakışan ikinci gruba, göç ve ortak nokta ayrı tura, kırmızı dışarı, sınır 8', () => {
  const t = (kart: string, dosyalar: string[], ek: object = {}) => ({ kart, dosyalar, ayriTur: ayriTurNedeni(dosyalar), kirmizi: false, ...ek });
  const sonuc = grupla([
    t('a', ['m/a.ts']), t('b', ['m/a.ts']), t('c', ['sunucu/gocler/20261107000000_x.sql']), t('d', ['paylasilan/x.ts']),
    t('e', ['m/e.ts'], { kirmizi: true }), ...Array.from({ length: 8 }, (_, i) => t(`n${i}`, [`n/${i}.ts`])),
  ]);
  assert.deepEqual(sonuc.gruplar, [['a', 'n0', 'n1', 'n2', 'n3', 'n4', 'n5', 'n6'], ['b', 'n7']]);
  assert.deepEqual(sonuc.ayri.map((x) => x.kart), ['c', 'd', 'e']);
});

test('grupla: üstüne kurulan teslim dayandığı grupta ya da sonrasında; dayandığı yoksa ayrı', () => {
  const t = (kart: string, dosya: string, ustune: string | null = null) => ({ kart, dosyalar: [dosya], ayriTur: null, kirmizi: false, ustune });
  assert.deepEqual(grupla([t('a', 'x.ts'), t('b', 'y.ts', 'a')]).gruplar, [['a', 'b']]);
  const yok = grupla([t('b', 'y.ts', 'a')]);
  assert.deepEqual(yok.gruplar, []);
  assert.match(yok.ayri[0]?.neden ?? '', /önce a/);
});

test('argumanOku: tek klasör, grup ve taban dalı; yanlış kullanım reddedilir', () => {
  assert.deepEqual(argumanOku(['d']), { grup: false, vt: false, klasorler: ['d'], dal: 'origin/main' });
  assert.deepEqual(argumanOku(['--grup', 'a', 'b', '--taban-dal', 'main']), { grup: true, vt: false, klasorler: ['a', 'b'], dal: 'main' });
  assert.deepEqual(argumanOku(['--vt', 'd']), { grup: false, vt: true, klasorler: ['d'], dal: 'origin/main' });
  assert.throws(() => argumanOku(['--vt', 'a', 'b']));
  assert.throws(() => argumanOku(['--vt', '--grup', 'a']));
  assert.throws(() => argumanOku([]));
  assert.throws(() => argumanOku(['a', 'b']));
  assert.throws(() => argumanOku(['--bilinmeyen', 'a']));
});

test('klasorOku: gerçek git deposunda taban gerisi, sha ve göç listesi okunur', () => {
  const kok = realpathSync.native(mkdtempSync(join(tmpdir(), 'core-teslim-denetle-')));
  try {
    const git = (...a: string[]) => execFileSync('git', ['-c', 'user.name=deneme', '-c', 'user.email=deneme@example.invalid', ...a], { cwd: kok, encoding: 'utf8' }).trim();
    git('init', '-q', '-b', 'main');
    mkdirSync(join(kok, 'sunucu/gocler'), { recursive: true });
    writeFileSync(join(kok, 'sunucu/gocler/20261106099600_a.sql'), '-- a\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'a');
    const taban = git('rev-parse', '--short', 'HEAD');
    writeFileSync(join(kok, 'b.txt'), 'b\n');
    git('add', '-A');
    git('commit', '-q', '-m', 'b');
    const klasor = join(kok, 'teslim');
    mkdirSync(klasor);
    const icerik = yama('sunucu/moduller/stok/servis.ts');
    writeFileSync(join(klasor, '0001.patch'), icerik);
    const sha = createHash('sha256').update(icerik).digest('hex');
    writeFileSync(join(klasor, 'DEVIR.md'), `<!-- teslim\ntaban: ${taban}\nkilit: stok/\nsade: evet\n-->\n${sha}\ntarama temiz\n# pass 3\n`);
    writeFileSync(join(klasor, 'VT-SONUC.md'), sonucMetni({ pg: 18, yamalar: [sha], gecti: true }, []));
    const g = klasorOku(kok, klasor, 'main');
    assert.equal(g.tabanGeride, 1);
    assert.deepEqual(g.vtSonuc, { pg: 18, yamalar: [sha], gecti: true });
    assert.equal(g.enBuyukGoc, '20261106099600');
    assert.deepEqual(etiketler(g), ['uyari:taban-geride']);
  } finally {
    rmSync(kok, { recursive: true, force: true });
  }
});

test('veritabanlı deneme: sonuç yoksa, sha tutmuyorsa ya da kırmızıysa kırmızı; PG18 dışı sürüm uyarı', () => {
  assert.deepEqual(etiketler(girdi({ vtSonuc: null })), ['kirmizi:vt']);
  assert.deepEqual(etiketler(girdi({ vtSonuc: { pg: 18, yamalar: ['b'.repeat(64)], gecti: true } })), ['kirmizi:vt']);
  assert.deepEqual(etiketler(girdi({ vtSonuc: { pg: 18, yamalar: [SHA], gecti: false } })), ['kirmizi:vt']);
  assert.deepEqual(etiketler(girdi({ vtSonuc: { pg: 16, yamalar: [SHA], gecti: true } })), ['uyari:vt-pg']);
});

test('yamaSirasi: ilk yama ek yamalardan önce, ekler sayı sırasıyla', () => {
  assert.deepEqual(['2584-2.patch', '2584-10.patch', '2584.patch', '2584-3.patch'].sort(yamaSirasi), ['2584.patch', '2584-2.patch', '2584-3.patch', '2584-10.patch']);
  assert.deepEqual(['0002.patch', '0010.patch', '0001.patch'].sort(yamaSirasi), ['0001.patch', '0002.patch', '0010.patch']);
  assert.deepEqual(['2618-2.patch', '2618-1.patch', '2618-3.patch'].sort(yamaSirasi), ['2618-1.patch', '2618-2.patch', '2618-3.patch']);
});

test('dayanakZinciri (3046 a): ustune zinciri en alttaki önce; eksik klasör, döngü ve uzun zincir hata', () => {
  const y = (ad: string) => [{ ad: `${ad}.patch`, sha256: ad.repeat(64).slice(0, 64), dosyalar: [] }];
  const klasorler: Record<string, { ustune: string | null; yamalar: ReturnType<typeof y> }> = {
    '/d/3041': { ustune: null, yamalar: y('a') },
    '/d/3041-ek': { ustune: '3041', yamalar: y('b') },
    '/d/dongu-1': { ustune: 'dongu-2', yamalar: y('c') },
    '/d/dongu-2': { ustune: 'dongu-1', yamalar: y('d') },
    '/d/bos': { ustune: null, yamalar: [] },
  };
  const oku = (k: string) => klasorler[k] ?? null;
  const z = dayanakZinciri('/d/3046', '3041-ek', oku);
  assert.equal(z.hata, null);
  assert.deepEqual(z.zincir.map((d) => d.ad), ['3041', '3041-ek']);
  assert.equal(z.zincir[0]?.klasor, '/d/3041');
  assert.deepEqual(dayanakZinciri('/d/3046', null, oku), { zincir: [], hata: null });
  assert.match(dayanakZinciri('/d/3046', 'yok', oku).hata ?? '', /klasörü yok/);
  assert.match(dayanakZinciri('/d/dongu-1', 'dongu-2', oku).hata ?? '', /kendine dönüyor/);
  assert.match(dayanakZinciri('/d/3046', 'bos', oku).hata ?? '', /yama yok/);
  assert.match(dayanakZinciri('/d/3046', '3041-ek', oku, 1).hata ?? '', /uzun/);
});

test('denetle: dayanak zinciri okunamazsa kırmızı; deneme dayanılan teslimin eski hâliyle koştuysa kırmızı (3046 a)', () => {
  assert.deepEqual(etiketler(girdi({ dayanak: { shalar: [], hata: 'dayanılan teslim klasörü yok: x' } })), ['kirmizi:dayanak']);
  assert.deepEqual(etiketler(girdi({ dayanak: { shalar: ['b'.repeat(64)], hata: null } })), ['kirmizi:vt-dayanak']);
  const zincirli = { dayanak: { shalar: ['b'.repeat(64)], hata: null }, vtSonuc: { pg: 18, yamalar: [SHA], gecti: true, dayanak: ['b'.repeat(64)] } };
  assert.deepEqual(etiketler(girdi(zincirli)), []);
  // Tabanı dayanılan teslimin commit'i olan zincirli teslim kırmızı değil, uyarı; zincirsizde kırmızı kalır.
  assert.deepEqual(etiketler(girdi({ ...zincirli, tabanGeride: -1 })), ['uyari:taban-dayanak']);
  assert.deepEqual(etiketler(girdi({ ...zincirli, tabanGeride: null })), ['uyari:taban-dayanak']);
  assert.deepEqual(etiketler(girdi({ tabanGeride: -1 })), ['kirmizi:taban']);
});
