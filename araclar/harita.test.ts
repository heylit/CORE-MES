import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { disariImzalari } from './harita-ayrinti.ts';
import { haritaKos, haritaMetni, haritaTopla, modulAyrintisi } from './harita.ts';
import type { Harita, ModulHaritasi } from './harita.ts';

// Geçici ağaçta `#cekirdek` takma adı çözülmez; uç dosyası `uc()` çağırmadan uç özetini düz nesne olarak verir.
// Gerçek `uc()` tanımlarının okunması aşağıda gerçek depoyla sınanır.
const AGAC: Record<string, string> = {
  'sunucu/moduller/alfa/uclar.ts': `export const uclar = [
    { yontem: 'GET', yol: '/alfa', yetki: 'alfa.oku', txDisi: true },
    { yontem: 'POST', yol: '/alfa/kur', yetki: 'oturum', txDisi: false },
  ];`,
  'sunucu/moduller/alfa/servis.ts': "import { betaYap } from '../beta/disari.ts';\nexport const alfaYap = () => betaYap();\n",
  'sunucu/moduller/alfa/alfa.test.ts': "import { gamaYap } from '../gama/disari.ts';\ngamaYap();\n",
  'sunucu/moduller/alfa/sorgular.ts': "export const s = ['INSERT INTO alfa_kaydi (ad) VALUES ($1)', 'SELECT sayi FROM ortak_sayac'];\n",
  'sunucu/moduller/beta/disari.ts':
    "export { betaYap } from './servis.ts';\nexport type { BetaTipi } from './servis.ts';\nexport const BETA_SINIRI = 3;\n",
  'sunucu/moduller/beta/servis.ts': 'export const betaYap = () => 1;\nexport type BetaTipi = number;\n',
  'sunucu/moduller/beta/sorgular.ts': "export const s = ['UPDATE konu_tablosu SET ad = $1'];\n",
  'sunucu/moduller/gama/disari.ts': 'export function gamaYap() { return 1; }\n',
  'sunucu/ana.ts': "import { gamaYap } from './moduller/gama/disari.ts';\ngamaYap();\n",
  'sunucu/gocler/20270101000000_alfa.sql': 'CREATE TABLE alfa_kaydi (id int);\nCREATE TABLE alfa_eski (id int);\n',
  'sunucu/gocler/20270101000100_konu_basligi.sql': [
    '-- CREATE TABLE yorumdaki_tablo (id int);',
    'CREATE TABLE konu_tablosu (id int, ad text);',
    'CREATE TABLE ortak_sayac (sayi int);',
    'ALTER TABLE alfa_kaydi ADD COLUMN ad text;',
    'DROP TABLE alfa_eski;',
  ].join('\n'),
  'sunucu/gocler/20270101000200_gama.sql': 'CREATE TABLE gama_kaydi (id int);\n',
  'sunucu/gocler/20270101000300_cekirdek_islev.sql': 'CREATE FUNCTION bir() RETURNS int LANGUAGE sql AS $$ SELECT 1 $$;\n',
  'paylasilan/islemler/alfa.ts': "export const ALFA_ISLEMLERI = ['alfa.oku', 'alfa.yaz'] as const;\n",
  'paylasilan/sozlesme/beta.ts': 'export const betaCevabi = null;\n',
  'paylasilan/sayfalar.ts': "export const SAYFA_ISLEMLERI = ['sayfa.alfa'];\n",
  'istemci/src/moduller/alfa/rotalar.tsx': 'export const rotalar = [];\n',
  'istemci/src/moduller/delta/Ekran.tsx': 'export const Ekran = null;\n',
};

function agacKur(t: TestContext, dosyalar: Record<string, string> = AGAC): string {
  const kok = mkdtempSync(join(tmpdir(), 'tmiv2-harita-'));
  t.after(() => rmSync(kok, { recursive: true, force: true }));
  for (const [yol, icerik] of Object.entries(dosyalar)) {
    mkdirSync(dirname(join(kok, yol)), { recursive: true });
    writeFileSync(join(kok, yol), icerik);
  }
  return kok;
}

function modul(harita: Harita, ad: string): ModulHaritasi {
  const bulunan = harita.moduller.find((m) => m.ad === ad);
  assert.ok(bulunan, `haritada ${ad} modülü yok`);
  return bulunan;
}

// Girintisiz satır bölüm başlığıdır: modül adı ya da ortak bölüm.
const basliklar = (metin: string): string[] => metin.split('\n').filter((s) => s !== '' && !s.startsWith(' '));

test('harita: geçici modül uçları, işlemleri, sözleşmesi ve istemci tarafıyla görünür', async (t) => {
  const harita = await haritaTopla(agacKur(t));
  assert.deepEqual(harita.moduller.map((m) => m.ad), ['alfa', 'beta', 'delta', 'gama']);

  const alfa = modul(harita, 'alfa');
  assert.deepEqual(alfa.uclar, [
    { yontem: 'GET', yol: '/alfa', yetki: 'alfa.oku', txDisi: true },
    { yontem: 'POST', yol: '/alfa/kur', yetki: 'oturum', txDisi: false },
  ]);
  assert.deepEqual(alfa.islemler, ['alfa.oku', 'alfa.yaz']);
  assert.deepEqual([alfa.sunucu, alfa.istemci, alfa.rota, alfa.sozlesme], [true, true, true, false]);

  const beta = modul(harita, 'beta');
  assert.deepEqual([beta.sunucu, beta.istemci, beta.rota, beta.sozlesme], [true, false, false, true]);
  assert.deepEqual(beta.uclar, []);
  assert.deepEqual(beta.disaAciklar, ['BETA_SINIRI', 'BetaTipi (tip)', 'betaYap']);

  const delta = modul(harita, 'delta');
  assert.deepEqual([delta.sunucu, delta.istemci, delta.rota], [false, true, false]);
  assert.deepEqual(harita.sayfaIslemleri, ['sayfa.alfa']);
});

test('harita: bağımlılık yönü ithal edenden edilene; test ithali ve modül dışı kullanan ayrı tutulur', async (t) => {
  const harita = await haritaTopla(agacKur(t));
  const alfa = modul(harita, 'alfa');
  const beta = modul(harita, 'beta');
  const gama = modul(harita, 'gama');

  // alfa, beta'nın disari.ts dosyasını ithal ediyor: alfa bağımlı, beta'ya bağımlı olan alfa.
  assert.deepEqual(alfa.bagimli, ['beta']);
  assert.deepEqual(beta.bagimlilar, ['alfa']);
  assert.deepEqual(alfa.bagimlilar, []);
  assert.deepEqual(beta.bagimli, []);

  assert.deepEqual(alfa.testteBagimli, ['gama']);
  assert.deepEqual(gama.testteBagimlilar, ['alfa']);
  assert.deepEqual(gama.bagimlilar, []);
  assert.deepEqual(gama.disKullananlar, ['sunucu/ana.ts']);

  const metin = haritaMetni(harita).split('\n');
  const bolumSatiri = (ad: string, baslik: string): string =>
    metin.slice(metin.indexOf(ad)).find((s) => s.includes(baslik)) ?? '';
  assert.match(bolumSatiri('alfa', 'Bağımlı olduğu'), /\(1\): beta; testte: gama$/);
  assert.match(bolumSatiri('alfa', 'Ona bağımlı'), /\(0\): yok$/);
  assert.match(bolumSatiri('beta', 'Ona bağımlı'), /\(1\): alfa$/);
  assert.match(bolumSatiri('gama', 'Ona bağımlı'), /\(0\): yok; testte: alfa; modül dışı: sunucu\/ana\.ts$/);
});

test('harita: tablo sahibi yazan modüldür, yazan yoksa göç adı; ikisi de yoksa belirsiz', async (t) => {
  const harita = await haritaTopla(agacKur(t));

  // Silinen tablo (alfa_eski) ve yorumdaki tablo sayılmaz.
  assert.deepEqual(modul(harita, 'alfa').tablolar, [{ ad: 'alfa_kaydi', kaynak: 'sorgu' }]);
  // Göç konu adı taşıyor; sahibi tabloya yazan modülden çıkar.
  assert.deepEqual(modul(harita, 'beta').tablolar, [{ ad: 'konu_tablosu', kaynak: 'sorgu' }]);
  assert.deepEqual(modul(harita, 'gama').tablolar, [{ ad: 'gama_kaydi', kaynak: 'goc-adi' }]);
  assert.deepEqual(harita.belirsizTablolar, [
    { ad: 'ortak_sayac', goc: '20270101000100_konu_basligi.sql', yazanlar: [], okuyanlar: ['alfa'] },
  ]);

  assert.deepEqual(modul(harita, 'alfa').gocler, [
    { ad: '20270101000000_alfa.sql', kurar: ['alfa_eski', 'alfa_kaydi'], degistirir: [], siler: [], adlandirir: [] },
    { ad: '20270101000100_konu_basligi.sql', kurar: [], degistirir: ['alfa_kaydi'], siler: ['alfa_eski'], adlandirir: [] },
  ]);
  assert.deepEqual(modul(harita, 'beta').gocler, [
    { ad: '20270101000100_konu_basligi.sql', kurar: ['konu_tablosu'], degistirir: [], siler: [], adlandirir: [] },
  ]);
  assert.deepEqual(harita.sahipsizGocler.map((g) => g.ad), ['20270101000300_cekirdek_islev.sql']);
});

test('harita: iki modülün yazdığı tablo kimseye verilmez', async (t) => {
  const harita = await haritaTopla(agacKur(t, {
    'sunucu/moduller/bir/sorgular.ts': "export const s = 'INSERT INTO ortak (id) VALUES (1)';\n",
    'sunucu/moduller/iki/sorgular.ts': "export const s = 'DELETE FROM ortak';\n",
    'sunucu/gocler/20270101000000_bir.sql': 'CREATE TABLE ortak (id int);\n',
  }));
  assert.deepEqual(modul(harita, 'bir').tablolar, []);
  assert.deepEqual(harita.belirsizTablolar, [
    { ad: 'ortak', goc: '20270101000000_bir.sql', yazanlar: ['bir', 'iki'], okuyanlar: [] },
  ]);
});

test('harita: yazan ve adlı kuran yoksa tabloya satır yazan adlı göçlerin tek modülü sahiptir', async (t) => {
  const harita = await haritaTopla(agacKur(t, {
    'sunucu/moduller/bir/sorgular.ts': "export const s = 'SELECT islem FROM bagli_satir';\n",
    'sunucu/moduller/iki/sorgular.ts': "export const s = 'SELECT 1';\n",
    'sunucu/gocler/20270101000000_konu_basligi.sql': 'CREATE TABLE bagli_satir (islem text);\nINSERT INTO bagli_satir VALUES (\'kur\');\n',
    'sunucu/gocler/20270101000100_bir_satirlar.sql': "INSERT INTO bagli_satir VALUES ('a');\n",
    'sunucu/gocler/20270101000200_bir_ek.sql': "DELETE FROM bagli_satir WHERE islem = 'a';\n",
    // Yalnız okuyan ya da yapıyı değiştiren adlı göç yazar sayılmaz.
    'sunucu/gocler/20270101000300_iki_dizin.sql': 'CREATE INDEX iki_dizin ON bagli_satir (islem);\nSELECT islem FROM bagli_satir;\n',
  }));
  assert.deepEqual(modul(harita, 'bir').tablolar, [{ ad: 'bagli_satir', kaynak: 'goc-yazan' }]);
  assert.deepEqual(modul(harita, 'iki').tablolar, []);
  assert.deepEqual(harita.belirsizTablolar, []);
  assert.match(haritaMetni(harita), /bagli_satir\s+yazan göçlerin adından/);
});

test('harita: tabloya iki modülün adlı göçü satır yazıyorsa sahip uydurulmaz', async (t) => {
  const harita = await haritaTopla(agacKur(t, {
    'sunucu/moduller/bir/sorgular.ts': "export const s = 'SELECT islem FROM bagli_satir';\n",
    'sunucu/moduller/iki/sorgular.ts': "export const s = 'SELECT 1';\n",
    'sunucu/gocler/20270101000000_konu_basligi.sql': 'CREATE TABLE bagli_satir (islem text);\n',
    'sunucu/gocler/20270101000100_bir_satirlar.sql': "INSERT INTO bagli_satir VALUES ('a');\n",
    'sunucu/gocler/20270101000200_iki_satirlar.sql': "UPDATE bagli_satir SET islem = 'b';\n",
  }));
  assert.deepEqual(modul(harita, 'bir').tablolar, []);
  assert.deepEqual(modul(harita, 'iki').tablolar, []);
  assert.deepEqual(harita.belirsizTablolar, [
    { ad: 'bagli_satir', goc: '20270101000000_konu_basligi.sql', yazanlar: [], okuyanlar: ['bir'] },
  ]);
});

test('harita: --modul yalnız o modülün bölümünü basar; bilinmeyen modül ve bayrak kullanım hatasıdır', async (t) => {
  const kok = agacKur(t);

  const hepsi = await haritaKos([], kok);
  assert.equal(hepsi.kod, 0);
  assert.deepEqual(basliklar(hepsi.cikti), ['alfa', 'beta', 'delta', 'gama', 'Modüle ait olmayanlar']);

  const tek = await haritaKos(['--modul', 'beta'], kok);
  assert.equal(tek.kod, 0);
  assert.deepEqual(basliklar(tek.cikti), ['beta']);
  assert.match(tek.cikti, /Dışa açtıkları \(3\): BETA_SINIRI, BetaTipi \(tip\), betaYap/);

  const bilinmeyen = await haritaKos(['--modul', 'yokboyle'], kok);
  assert.equal(bilinmeyen.kod, 1);
  assert.match(bilinmeyen.cikti, /Bilinmeyen modül: yokboyle/);

  for (const argumanlar of [['--modl', 'beta'], ['--modul=beta'], ['--modul'], ['--modul', 'beta', '--fazla'], ['beta']]) {
    const sonuc = await haritaKos(argumanlar, kok);
    assert.equal(sonuc.kod, 1, argumanlar.join(' '));
    assert.match(sonuc.cikti, /Kullanım: npm run harita/);
  }
});

test('harita metni: uç tek satırda, işaret hizalı; boş bölüm yok diye, belirsiz tablo ve göç sırası ortak bölümde yazılır', async (t) => {
  const harita = await haritaTopla(agacKur(t));
  const metin = haritaMetni(harita);
  const satirlar = metin.split('\n');
  const bul = (parca: string): string => satirlar.find((s) => s.includes(parca)) ?? '';

  assert.match(bul('/alfa '), /^\s+GET\s+\/alfa\s+alfa\.oku\s+txDisi$/);
  // Transaction dışı uç satır sonundaki işaretle ayırt edilir; öteki satırda işaret yoktur.
  assert.match(bul('/alfa/kur'), /^\s+POST\s+\/alfa\/kur\s+oturum$/);
  assert.match(metin, /\nbeta\n {2}sunucu var, istemci yok, sözleşme paylasilan\/sozlesme\/beta\.ts\n {2}Uçlar \(0\)\n {4}yok\n/);
  assert.match(metin, /\ndelta\n {2}sunucu yok, istemci var \(rota yok\), sözleşme yok\n/);
  assert.match(bul('alfa_kaydi  '), /alfa_kaydi\s+sorgular\.ts yazıyor$/);
  assert.match(bul('gama_kaydi  '), /gama_kaydi\s+göç adından$/);
  assert.match(bul('ortak_sayac'), /ortak_sayac\s+belirsiz\s+20270101000100_konu_basligi\.sql\s+okuyan: alfa$/);
  assert.match(bul('Sayfa işlemleri'), /\(1\): sayfa\.alfa$/);

  // Uygulanış sırası tam çıktıda tek satırdır; tek modül çıktısında basılmaz.
  assert.equal(
    bul('Göç sırası').trim(),
    'Göç sırası (4): 20270101000000_alfa.sql, 20270101000100_konu_basligi.sql, 20270101000200_gama.sql, 20270101000300_cekirdek_islev.sql',
  );
  assert.equal(haritaMetni(harita, 'alfa').includes('Göç sırası'), false);
});

test('harita: göçte dizge ve yorum içindeki komut tabloyu kurmaz, silmez', async (t) => {
  const harita = await haritaTopla(agacKur(t, {
    'sunucu/moduller/bir/disari.ts': 'export const x = 1;\n',
    'sunucu/gocler/20270101000000_bir.sql': [
      'CREATE TABLE t (id int);',
      "COMMENT ON TABLE t IS 'DROP TABLE t; CREATE TABLE dizgedeki (id int); it''s';",
      '/* DROP TABLE t; CREATE TABLE bloktaki (id int); */',
      '-- DROP TABLE t;',
      'CREATE TABLE sonraki (id int);',
    ].join('\n'),
  }));
  // Dizgeden sonraki gerçek komut kaybolmaz: kaçışlı tırnak dizgeyi erken kapatmıyor.
  assert.deepEqual(modul(harita, 'bir').tablolar.map((tablo) => tablo.ad), ['sonraki', 't']);
  assert.deepEqual(modul(harita, 'bir').gocler, [
    { ad: '20270101000000_bir.sql', kurar: ['sonraki', 't'], degistirir: [], siler: [], adlandirir: [] },
  ]);
});

test('harita: sorgular.ts içinde yorumdaki, SQL yorumundaki ve SQL dizgesindeki yazma sayılmaz', async (t) => {
  const harita = await haritaTopla(agacKur(t, {
    'sunucu/moduller/bir/sorgular.ts': "export const s = 'INSERT INTO t (id) VALUES (1)';\n",
    'sunucu/moduller/iki/sorgular.ts': [
      '// eskiden: INSERT INTO t (id) VALUES (1)',
      '/* DELETE FROM t */',
      'export const s = [`SELECT id FROM t -- DELETE FROM t',
      '`, "SELECT \'UPDATE t SET id = 1\' AS metin"];',
    ].join('\n'),
    'sunucu/gocler/20270101000000_konu.sql': 'CREATE TABLE t (id int);\n',
  }));
  // Yalnız okuyan ya da yazmayı anan modül yazan sayılsaydı tablo iki yazanla belirsiz kalırdı.
  assert.deepEqual(modul(harita, 'bir').tablolar, [{ ad: 't', kaynak: 'sorgu' }]);
  assert.deepEqual(modul(harita, 'iki').tablolar, []);
  assert.deepEqual(harita.belirsizTablolar, []);
});

test('harita: disari.ts içinde dizgedeki ve yorumdaki export dışa açılan sayılmaz', async (t) => {
  const harita = await haritaTopla(agacKur(t, {
    'sunucu/moduller/bir/disari.ts': [
      '// export const yorumdaki = 1;',
      "export const metin = 'export const sahte = 1';",
      "export * from './servis.ts';",
    ].join('\n'),
  }));
  assert.deepEqual(modul(harita, 'bir').disaAciklar, ['* (./servis.ts)', 'metin']);
});

test('harita: takma adlı UPDATE yazmadır', async (t) => {
  const harita = await haritaTopla(agacKur(t, {
    'sunucu/moduller/bir/sorgular.ts': "export const s = ['UPDATE t2 x SET id = 1', 'UPDATE t3 AS y SET id = 2'];\n",
    'sunucu/gocler/20270101000000_konu.sql': 'CREATE TABLE t2 (id int);\nCREATE TABLE t3 (id int);\n',
  }));
  assert.deepEqual(modul(harita, 'bir').tablolar, [{ ad: 't2', kaynak: 'sorgu' }, { ad: 't3', kaynak: 'sorgu' }]);
});

test('harita: şemalı adda tablo şema değil addır', async (t) => {
  const harita = await haritaTopla(agacKur(t, {
    'sunucu/moduller/bir/sorgular.ts': "export const s = 'INSERT INTO public.semali (id) VALUES (1)';\n",
    'sunucu/gocler/20270101000000_konu.sql': 'CREATE TABLE public.semali (id int);\nCREATE TABLE "public"."tirnakli" (id int);\n',
    'sunucu/gocler/20270101000100_konu_iki.sql': 'ALTER TABLE public.semali ADD COLUMN ad text;\nDROP TABLE public.tirnakli;\n',
  }));
  assert.deepEqual(modul(harita, 'bir').tablolar, [{ ad: 'semali', kaynak: 'sorgu' }]);
  assert.deepEqual(modul(harita, 'bir').gocler, [
    { ad: '20270101000000_konu.sql', kurar: ['semali'], degistirir: [], siler: [], adlandirir: [] },
    { ad: '20270101000100_konu_iki.sql', kurar: [], degistirir: ['semali'], siler: [], adlandirir: [] },
  ]);
  // Silinen tablo canlı değildir; şema adı tablo diye listelenmez.
  assert.deepEqual(harita.belirsizTablolar, []);
  assert.deepEqual(harita.sahipsizGocler, []);
});

test('harita: yeniden adlandırılan tablo yeni adıyla yaşar, eski adı anan göç aynı modülde kalır', async (t) => {
  const harita = await haritaTopla(agacKur(t, {
    'sunucu/moduller/bir/sorgular.ts': "export const s = 'INSERT INTO yeni (id) VALUES (1)';\n",
    'sunucu/gocler/20270101000000_konu.sql': 'CREATE TABLE eski (id int);\n',
    'sunucu/gocler/20270101000100_konu_iki.sql': 'ALTER TABLE eski RENAME TO yeni;\n',
  }));
  assert.deepEqual(modul(harita, 'bir').tablolar, [{ ad: 'yeni', kaynak: 'sorgu' }]);
  assert.deepEqual(modul(harita, 'bir').gocler, [
    { ad: '20270101000000_konu.sql', kurar: ['eski'], degistirir: [], siler: [], adlandirir: [] },
    { ad: '20270101000100_konu_iki.sql', kurar: [], degistirir: [], siler: [], adlandirir: [{ eski: 'eski', yeni: 'yeni' }] },
  ]);
  assert.deepEqual(harita.belirsizTablolar, []);
  assert.match(haritaMetni(harita), /20270101000100_konu_iki\.sql\s+adlandırır: eski -> yeni\n/);
});

// Gerçek depoda yalnız kalıcı, yapısal iddialar: `uc()` ile yazılmış tanımlar okunur ve kendi modülüne bağlanır.
// Modülün bugünkü durumu (rota, tablo, sayım) burada pimlenmez; onlar geçici ağaçta sınanır.
test('harita gerçek depoda: gerçek uç tanımları modülüne bağlanır', async () => {
  const harita = await haritaTopla();
  const saglik = modul(harita, 'saglik');
  const oturum = modul(harita, 'oturum');
  assert.equal(saglik.uclar.some((u) => u.yontem === 'GET' && u.yol === '/saglik'), true);
  assert.equal(oturum.uclar.some((u) => u.yol === '/oturum'), true);
  assert.equal(saglik.uclar.some((u) => u.yol === '/oturum'), false);
  assert.equal(oturum.uclar.some((u) => u.yol === '/saglik'), false);
});

// Testin kurulumu üretimdeki akış yönü değildir: karşılıklı ithal yalnız test dosyasından geçiyorsa harita bunu bağımlılık saymaz.
test('harita: yalnız testten geçen ters yön üretim bağımlılığına karışmaz; iki yoldan da geçen çift testte yinelenmez', async (t) => {
  const harita = await haritaTopla(agacKur(t, {
    'sunucu/moduller/giris/servis.ts': "import { kisi } from '../kisi/disari.ts';\nexport const giris = kisi;\n",
    'sunucu/moduller/giris/giris.test.ts': "import { kisi } from '../kisi/disari.ts';\nkisi();\n",
    'sunucu/moduller/giris/disari.ts': 'export const girisYap = () => 1;\n',
    'sunucu/moduller/kisi/disari.ts': 'export const kisi = () => 1;\n',
    'sunucu/moduller/kisi/kisi.test.ts': "import { girisYap } from '../giris/disari.ts';\ngirisYap();\n",
  }));
  const giris = modul(harita, 'giris');
  const kisi = modul(harita, 'kisi');
  assert.deepEqual([giris.bagimli, giris.testteBagimli, giris.bagimlilar, giris.testteBagimlilar], [['kisi'], [], [], ['kisi']]);
  assert.deepEqual([kisi.bagimli, kisi.testteBagimli, kisi.bagimlilar, kisi.testteBagimlilar], [[], ['giris'], ['giris'], []]);
});

const sutunSatiri = (cikti: string, tablo: string): string =>
  cikti.split('\n').find((s) => s.startsWith(`    ${tablo}: `))?.trim() ?? '';

const SUTUN_AGACI: Record<string, string> = {
  'sunucu/moduller/bir/disari.ts': 'export const x = 1;\n',
  'sunucu/gocler/20270101000000_bir.sql': [
    'CREATE TABLE ana (kod text PRIMARY KEY);',
    'CREATE TABLE kayit (',
    '  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,',
    "  ad text NOT NULL CHECK (btrim(ad) <> ''),",
    '  -- Kısıtın içindeki NOT NULL sütunu zorunlu yapmaz.',
    '  aciklama text CHECK (aciklama IS NULL OR ad IS NOT NULL),',
    '  tutar numeric(12, 3) NOT NULL DEFAULT 0,',
    '  ana_kodu text REFERENCES ana,',
    "  ozet text GENERATED ALWAYS AS (ad || 'x') STORED,",
    '  zaman timestamp with time zone NOT NULL DEFAULT now()',
    ');',
    'CREATE TABLE satir (',
    '  kayit_id bigint NOT NULL,',
    '  sira int NOT NULL,',
    '  ana_kodu text,',
    '  PRIMARY KEY (kayit_id, sira),',
    '  CONSTRAINT satir_kayit FOREIGN KEY (kayit_id) REFERENCES kayit (id),',
    '  CONSTRAINT satir_sira CHECK (sira > 0)',
    ');',
  ].join('\n'),
};

test('harita sütunları: tip, boş olabilirlik, birincil ve yabancı anahtar göç tanımından okunur', async (t) => {
  const kok = agacKur(t, SUTUN_AGACI);
  const harita = await haritaTopla(kok);
  assert.deepEqual(harita.sutunlar.find((s) => s.ad === 'satir'), {
    ad: 'satir',
    sutunlar: [
      { ad: 'kayit_id', tip: 'bigint', bos: false, pk: true, fk: ['kayit'], uretim: null },
      { ad: 'sira', tip: 'int', bos: false, pk: true, fk: [], uretim: null },
      { ad: 'ana_kodu', tip: 'text', bos: true, pk: false, fk: [], uretim: null },
    ],
    cozulemeyen: [],
  });

  const { kod, cikti } = await haritaKos(['--modul', 'bir'], kok);
  assert.equal(kod, 0);
  assert.match(cikti, /\n {2}Sütunlar \(3\) \[/);
  assert.equal(sutunSatiri(cikti, 'ana'), 'ana: kod text PK');
  assert.equal(
    sutunSatiri(cikti, 'kayit'),
    'kayit: id bigint PK kimlik, ad text, aciklama text?, tutar numeric(12,3), ana_kodu text? FK->ana, ozet text? türetilen, zaman timestamp with time zone',
  );
  assert.equal(sutunSatiri(cikti, 'satir'), 'satir: kayit_id bigint PK FK->kayit, sira int PK, ana_kodu text?');
});

test('harita sütunları: sonraki göçteki ekleme, düşürme, tip ve ad değişikliği son durumu verir', async (t) => {
  const kok = agacKur(t, {
    ...SUTUN_AGACI,
    'sunucu/gocler/20270101000100_bir_degisiklik.sql': [
      "ALTER TABLE kayit ADD COLUMN durum text NOT NULL DEFAULT 'acik', DROP COLUMN aciklama;",
      'ALTER TABLE kayit ALTER COLUMN tutar TYPE numeric(14,2) USING tutar::numeric(14,2), ALTER COLUMN ad DROP NOT NULL;',
      'ALTER TABLE kayit ALTER COLUMN ana_kodu SET NOT NULL;',
      'ALTER TABLE kayit RENAME COLUMN zaman TO acilma;',
      'ALTER TABLE satir DROP CONSTRAINT satir_kayit, DROP CONSTRAINT satir_sira;',
      'ALTER TABLE satir ADD CONSTRAINT satir_ana FOREIGN KEY (ana_kodu) REFERENCES ana;',
      'ALTER TABLE satir RENAME TO kalem;',
      'ALTER TABLE ana RENAME TO kaynak;',
      'CREATE TABLE gecici (id int);',
      'DROP TABLE gecici;',
    ].join('\n'),
  });
  const { cikti } = await haritaKos(['--modul', 'bir'], kok);
  assert.equal(
    sutunSatiri(cikti, 'kayit'),
    'kayit: id bigint PK kimlik, ad text?, tutar numeric(14,2), ana_kodu text FK->kaynak, ozet text? türetilen, acilma timestamp with time zone, durum text',
  );
  // Tablo yeni adıyla, sütunlarıyla yaşar; düşen yabancı anahtar işareti kalkar, eklenen görünür.
  assert.equal(sutunSatiri(cikti, 'kalem'), 'kalem: kayit_id bigint PK, sira int PK, ana_kodu text? FK->kaynak');
  assert.equal(sutunSatiri(cikti, 'kaynak'), 'kaynak: kod text PK');
  assert.equal(cikti.includes('çözülemedi'), false);
  assert.equal((await haritaTopla(kok)).sutunlar.some((s) => s.ad === 'gecici' || s.ad === 'satir' || s.ad === 'ana'), false);
});

test('harita sütunları: okunamayan tanım atlanmaz, tablonun satırında çözülemedi diye yazılır', async (t) => {
  const kok = agacKur(t, {
    'sunucu/moduller/bir/disari.ts': 'export const x = 1;\n',
    'sunucu/gocler/20270101000000_bir.sql': [
      'CREATE TABLE t (id int NOT NULL);',
      'CREATE TABLE saglam (id int PRIMARY KEY, ad text CHECK (ad <> id::text));',
      'CREATE TABLE kopya AS SELECT 1 AS id;',
      'ALTER TABLE t ATTACH PARTITION p FOR VALUES IN (1);',
      'DO $$ BEGIN ALTER TABLE t ADD COLUMN gizli int; END $$;',
      'ALTER TABLE t DROP CONSTRAINT adi_bilinmeyen;',
      // Sütun bilgisini etkilemeyen eylemler çözülemedi sayılmaz; yoksa her tablo işaretlenir, işaret anlamını yitirir.
      'ALTER TABLE saglam DROP CONSTRAINT saglam_ad_check, ENABLE ROW LEVEL SECURITY;',
      'ALTER TABLE saglam ALTER COLUMN ad SET DEFAULT 1;',
    ].join('\n'),
  });
  const harita = await haritaTopla(kok);
  const tablo = (ad: string) => harita.sutunlar.find((s) => s.ad === ad);
  assert.deepEqual(tablo('t')?.cozulemeyen, [
    '20270101000000_bir.sql: ALTER TABLE t ATTACH PARTITION p FOR VALUES IN (1)',
    '20270101000000_bir.sql: DO $$ BEGIN ALTER TABLE t ADD COLUMN gizli int; END $$',
    '20270101000000_bir.sql: ALTER TABLE t DROP CONSTRAINT adi_bilinmeyen',
  ]);
  assert.deepEqual(tablo('kopya'), { ad: 'kopya', sutunlar: [], cozulemeyen: ['20270101000000_bir.sql: CREATE TABLE kopya AS SELECT 1 AS id'] });
  assert.deepEqual(tablo('saglam')?.cozulemeyen, []);

  const { cikti } = await haritaKos(['--modul', 'bir'], kok);
  assert.match(sutunSatiri(cikti, 't'), /^t: id int; çözülemedi \(liste eksik ya da eski olabilir\): 20270101000000_bir\.sql: ALTER TABLE t ATTACH PARTITION/);
  assert.match(sutunSatiri(cikti, 'kopya'), /^kopya: sütun okunamadı; çözülemedi/);
  assert.equal(sutunSatiri(cikti, 'saglam'), 'saglam: id int PK, ad text?');
});

test('harita imzaları: disari.ts değerlerinin imzası kaynağından okunur; tip atlanır, çözülemeyen ayrı sayılır', async (t) => {
  const kok = agacKur(t, {
    'sunucu/moduller/bir/disari.ts': [
      "import type { Eksik } from './yok.ts';",
      "export { kayitGetir } from './servis.ts';",
      "export type { Kayit } from './servis.ts';",
      "export { kayip } from './yok.ts';",
      'export const SINIR = 3;',
      'export const topla = (a: number, b = 2): number => a + b;',
      'export const bozuk = (girdi: Eksik): number => (girdi ? 1 : 0);',
    ].join('\n'),
    'sunucu/moduller/bir/servis.ts': [
      'export interface Kayit { id: number; ad: string | null }',
      'export async function kayitGetir(id: number, secenek?: { silinmis: boolean }): Promise<Kayit | null> {',
      '  return secenek?.silinmis === true ? null : { id, ad: null };',
      '}',
    ].join('\n'),
  });
  const harita = await haritaTopla(kok);
  const ayrinti = await modulAyrintisi(harita, 'bir', kok);
  assert.deepEqual(ayrinti.imzalar, {
    imzalar: [
      'SINIR: 3',
      'kayitGetir(id: number, secenek?: { silinmis: boolean; }): Promise<Kayit | null>',
      'topla(a: number, b?: number): number',
    ],
    // Tipi bulunamayan parametre "any" diye basılmaz.
    cozulemeyen: ['bozuk', 'kayip'],
  });
  const metin = haritaMetni(harita, 'bir', ayrinti);
  assert.match(metin, /\n {2}Dışa açık imzalar \(3; çözülemedi 2\)\n {4}SINIR: 3\n/);
  assert.match(metin, /\n {4}çözülemedi {2}bozuk\n {4}çözülemedi {2}kayip(\n|$)/);
});

const EKRAN_AGACI: Record<string, string> = {
  'sunucu/moduller/bir/uclar.ts': `export const uclar = [
    { yontem: 'GET', yol: '/kayitlar', yetki: 'oturum', txDisi: false },
    { yontem: 'GET', yol: '/kayitlar/:id', yetki: 'oturum', txDisi: false },
    { yontem: 'POST', yol: '/kayitlar/:id/kapat', yetki: 'oturum', txDisi: false },
    { yontem: 'POST', yol: '/kayitlar/:id/ac', yetki: 'oturum', txDisi: false },
  ];`,
  'sunucu/moduller/iki/uclar.ts': "export const uclar = [{ yontem: 'GET', yol: '/ortaklar', yetki: 'oturum', txDisi: false }];",
  'istemci/src/moduller/bir/Ekran.tsx': [
    "import { api } from '../../ortak/veri/api.ts';",
    "const TEMEL = '/kayitlar';",
    "export const liste = (ara: string) => api.get(`/kayitlar${ara === '' ? '' : `?ara=${encodeURIComponent(ara)}`}`);",
    'export const tek = (id: number) => api.get(`${TEMEL}/${id}`);',
    "export const komut = (id: number, ad: 'kapat' | 'ac') => api.post(`/kayitlar/${id}/${ad}`);",
    "export const ortak = () => api.get('/ortaklar?hepsi=true');",
    "export const olmayan = () => api.sil('/kayitlar/5');",
    'export const bilinmeyen = (yol: string) => api.post(yol);',
    'export const parcali = (id: number) => api.get(`/kayitlar/k${id}`);',
    'export const dolayli = api.put;',
  ].join('\n'),
  'istemci/src/moduller/bir/alt/Ikinci.tsx':
    "import { api as istek } from '../../../ortak/veri/api.ts';\nexport const yine = () => istek.get('/kayitlar');\n",
  'istemci/src/moduller/bir/Ekran.test.tsx': "import { api } from '../../ortak/veri/api.ts';\nvoid api.get('/testteki');\n",
  'istemci/src/moduller/bir/baska.ts': "const api = { get: (yol: string) => yol };\nexport const sahte = api.get('/yardimci-degil');\n",
};

test('harita ekran çağrıları: yol sunucu ucuyla eşlenir; sorgu dizgesi atılır, okunamayan çağrı çözülemedi sayılır', async (t) => {
  const kok = agacKur(t, EKRAN_AGACI);
  const harita = await haritaTopla(kok);
  const ayrinti = await modulAyrintisi(harita, 'bir', kok);
  assert.deepEqual(ayrinti.cagrilar.cagrilar, [
    { yontem: 'GET', yol: '/kayitlar', durum: 'tam', moduller: ['bir'], adaylar: [], dosyalar: ['Ekran.tsx', 'alt/Ikinci.tsx'] },
    { yontem: 'DELETE', yol: '/kayitlar/5', durum: 'yok', moduller: [], adaylar: [], dosyalar: ['Ekran.tsx'] },
    // Değişken parça sabit bir yol parçasına denk geliyor: tek uç seçilmez, adaylar sayılır.
    { yontem: 'POST', yol: '/kayitlar/:?/:?', durum: 'aday', moduller: ['bir'], adaylar: ['/kayitlar/:id/kapat', '/kayitlar/:id/ac'], dosyalar: ['Ekran.tsx'] },
    { yontem: 'GET', yol: '/kayitlar/:id', durum: 'tam', moduller: ['bir'], adaylar: [], dosyalar: ['Ekran.tsx'] },
    // Başka modülün ucu sahibinin adıyla görünür.
    { yontem: 'GET', yol: '/ortaklar', durum: 'tam', moduller: ['iki'], adaylar: [], dosyalar: ['Ekran.tsx'] },
  ]);
  assert.deepEqual(ayrinti.cagrilar.cozulemeyen, [
    'Ekran.tsx:8  api.post(yol)',
    'Ekran.tsx:9  api.get(`/kayitlar/k${id}`)',
    'Ekran.tsx:10  api.put',
  ]);

  const metin = haritaMetni(harita, 'bir', ayrinti).split('\n');
  const bul = (parca: string): string => metin.find((s) => s.includes(parca)) ?? '';
  assert.equal(bul('Ekranın doğrudan çağırdığı uçlar'), '  Ekranın doğrudan çağırdığı uçlar (5; çözülemedi 3)');
  assert.match(bul('DELETE'), /^\s+DELETE\s+\/kayitlar\/5\s+Ekran\.tsx\s+eşleşen uç yok$/);
  assert.match(bul('/ortaklar'), /^\s+GET\s+\/ortaklar\s+Ekran\.tsx\s+iki$/);
  assert.match(bul(':?/:?'), /aday: \/kayitlar\/:id\/kapat, \/kayitlar\/:id\/ac$/);
  assert.equal(bul('api.post(yol)'), '    çözülemedi  Ekran.tsx:8  api.post(yol)');
});

test('harita: ayrıntı yalnız tek modül kipinde, var olan satırların sonuna eklenir; tam harita nereden alınacağını söyler', async (t) => {
  const kok = agacKur(t);
  const harita = await haritaTopla(kok);

  const tek = await haritaKos(['--modul', 'alfa'], kok);
  assert.equal(tek.cikti.startsWith(`${haritaMetni(harita, 'alfa')}\n  Sütunlar (1) [`), true);
  assert.equal(sutunSatiri(tek.cikti, 'alfa_kaydi'), 'alfa_kaydi: id int?, ad text?');
  assert.match(tek.cikti, /\n {2}Dışa açık imzalar \(0\)\n {4}yok\n {2}Ekranın doğrudan çağırdığı uçlar \(0\)\n {4}yok$/);

  // İstemcisi olmayan modülde ekran bölümü, sunucusu olmayanda sütun ve imza bölümü basılmaz.
  assert.equal((await haritaKos(['--modul', 'beta'], kok)).cikti.includes('Ekranın doğrudan çağırdığı uçlar'), false);
  const delta = (await haritaKos(['--modul', 'delta'], kok)).cikti;
  assert.equal(delta.includes('Sütunlar'), false);
  assert.match(delta, /\n {2}Ekranın doğrudan çağırdığı uçlar \(0\)\n {4}yok$/);

  const hepsi = (await haritaKos([], kok)).cikti;
  assert.equal(hepsi.includes('Dışa açık imzalar'), false);
  assert.equal(hepsi.includes('Ekranın doğrudan çağırdığı uçlar ('), false);
  // Sahibi olmayan tablonun sütunları hiçbir modül bölümünde çıkmaz; tam haritada görünür.
  assert.match(hepsi, /\n {2}Sahibi belirsiz tabloların sütunları \(1\)\n {4}ortak_sayac: sayi int\?\n/);
  assert.match(hepsi, /npm run harita -- --modul <modul_adi>$/);
});

test('harita ekran çağrıları: çağrıyı ortak veri dosyasına ya da başka modülün ekranına yaptıran modül "yok" demez, ithali anar', async (t) => {
  const kok = agacKur(t, {
    ...EKRAN_AGACI,
    'istemci/src/moduller/uc/Ekran.tsx': [
      "import { hataIletisi } from '../../ortak/veri/api.ts';",
      "import { useOturum } from '../../ortak/veri/oturum.ts';",
      "import type { Tip } from '../../ortak/veri/tipler.ts';",
      "import { Secim } from '../bir/disari.ts';",
      "import { yerel } from './disari.ts';",
      'export const Ekran = (tip: Tip) => [hataIletisi, useOturum, Secim, yerel, tip];',
    ].join('\n'),
    'istemci/src/moduller/uc/alt/Ic.tsx': "import { useOturum } from '../../../ortak/veri/oturum.ts';\nexport const Ic = useOturum;\n",
  });
  const harita = await haritaTopla(kok);
  const ayrinti = await modulAyrintisi(harita, 'uc', kok);
  // Tip ithali, istek yardımcısının kendisi ve modülün kendi dosyası dolaylı çağrı değildir.
  assert.deepEqual(ayrinti.cagrilar, { cagrilar: [], cozulemeyen: [], dolayli: ['moduller/bir/disari.ts', 'ortak/veri/oturum.ts'] });
  assert.match(
    haritaMetni(harita, 'uc', ayrinti),
    /\n {2}Ekranın doğrudan çağırdığı uçlar \(0; dolaylı 2\)\n {4}dolaylı: moduller\/bir\/disari\.ts\n {4}dolaylı: ortak\/veri\/oturum\.ts$/,
  );
  assert.deepEqual((await modulAyrintisi(harita, 'bir', kok)).cagrilar.dolayli, []);
});

test('harita sütunları: CASCADE ile düşen sütuna bağlı olabilecek tablo ve dinamik SQL taşıyan göç sessiz geçilmez', async (t) => {
  const kok = agacKur(t, {
    'sunucu/moduller/bir/disari.ts': 'export const x = 1;\n',
    'sunucu/gocler/20270101000000_bir.sql': [
      'CREATE TABLE a (k int PRIMARY KEY, m int UNIQUE, n int);',
      'CREATE TABLE b (a_k int REFERENCES a (k));',
      'CREATE TABLE c (a_m int REFERENCES a (m));',
      'CREATE TABLE d (id int);',
      'ALTER TABLE a DROP COLUMN n;',
    ].join('\n'),
    'sunucu/gocler/20270101000100_bir_tetik.sql':
      'CREATE FUNCTION f() RETURNS trigger LANGUAGE plpgsql AS $ BEGIN RETURN NEW; END $;\nCREATE TRIGGER d_t BEFORE INSERT ON d FOR EACH ROW EXECUTE FUNCTION f();\n',
  });
  const once = await haritaTopla(kok);
  // CASCADE'siz düşürme ve tetikleyicinin EXECUTE FUNCTION yan tümcesi işaret üretmez.
  assert.deepEqual(once.sutunlar.flatMap((s) => s.cozulemeyen), []);
  assert.deepEqual(once.dinamikSqlGocleri, []);
  assert.equal((await haritaKos(['--modul', 'bir'], kok)).cikti.includes('dinamik SQL'), false);

  const sonraKok = agacKur(t, {
    'sunucu/moduller/bir/disari.ts': 'export const x = 1;\n',
    'sunucu/gocler/20270101000000_bir.sql': [
      'CREATE TABLE a (k int PRIMARY KEY, m int UNIQUE, n int);',
      'CREATE TABLE b (a_k int REFERENCES a (k));',
      'CREATE TABLE c (a_m int REFERENCES a (m));',
      'CREATE TABLE d (id int);',
      'ALTER TABLE a DROP COLUMN m CASCADE;',
    ].join('\n'),
    'sunucu/gocler/20270101000100_bir_dinamik.sql': "DO $govde$ BEGIN EXECUTE 'ALTER TABLE d ADD COLUMN gizli int'; END $govde$;\n",
  });
  const harita = await haritaTopla(sonraKok);
  const not = '20270101000000_bir.sql: ALTER TABLE a DROP COLUMN m CASCADE';
  const tablo = (ad: string) => harita.sutunlar.find((s) => s.ad === ad)?.cozulemeyen;
  assert.deepEqual([tablo('a'), tablo('b'), tablo('c'), tablo('d')], [[], [not], [not], []]);
  assert.deepEqual(harita.dinamikSqlGocleri, ['20270101000100_bir_dinamik.sql']);

  const { cikti } = await haritaKos(['--modul', 'bir'], sonraKok);
  assert.match(sutunSatiri(cikti, 'c'), /^c: a_m int\? FK->a; çözülemedi \(liste eksik ya da eski olabilir\): 20270101000000_bir\.sql: ALTER TABLE a DROP COLUMN m CASCADE$/);
  assert.match(cikti, /\n {4}dinamik SQL, sütunlar eksik olabilir: 20270101000100_bir_dinamik\.sql\n {2}Dışa açık imzalar/);
  assert.match((await haritaKos([], sonraKok)).cikti, /\n {4}dinamik SQL, sütunlar eksik olabilir: 20270101000100_bir_dinamik\.sql\n/);
});

test('harita imzaları gerçek depoda: takma adlı ithaller çözülür, çözülemeyen imza kalmaz', async () => {
  const sonuc = await disariImzalari(fileURLToPath(new URL('../', import.meta.url)), 'oturum');
  assert.deepEqual(sonuc.cozulemeyen, []);
  assert.equal(sonuc.imzalar.length > 0, true);
  assert.equal(sonuc.imzalar.every((imza) => /^\w+[(:<]/.test(imza)), true);
});

