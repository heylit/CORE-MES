import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ayarOku, dinlemeAdresi, gocKimligiOku, haritaDiziniOku, pgVeriDiziniOku, testAyari } from './ayar.ts';

const TAM = {
  TMIV2_ORTAM: 'gelistirme',
  TMIV2_PORT: '4100',
  TMIV2_PG_HOST: '127.0.0.1',
  TMIV2_PG_PORT: '5432',
  TMIV2_PG_USER: 'kullanici',
  TMIV2_PG_PASSWORD: 'parola',
  TMIV2_PG_DATABASE: 'tmiv2',
  TMIV2_PG_BAGLANTI_SURE_MS: '5000',
  TMIV2_PG_SORGU_SURE_MS: '20000',
  TMIV2_PG_OKUMA_SURE_MS: '3000',
  TMIV2_PG_HAVUZ: '30',
  TMIV2_PG_KILIT_SURE_MS: '4000',
  TMIV2_PG_BOS_TX_SURE_MS: '30000',
};
const GOC = { TMIV2_PG_GOC_USER: 'goc-kullanici', TMIV2_PG_GOC_PASSWORD: 'goc-parola' };

test('tam ortam ayara dönüşür; test veritabanı verilmediyse null', () => {
  assert.deepEqual(ayarOku(TAM), {
    ortam: 'gelistirme',
    port: 4100,
    pg: {
      host: '127.0.0.1',
      port: 5432,
      kullanici: 'kullanici',
      parola: 'parola',
      veritabani: 'tmiv2',
      baglantiSureMs: 5000,
      sorguSureMs: 20000,
      okumaSureMs: 3000,
      havuzBoyutu: 30,
      kilitSureMs: 4000,
      bosTxSureMs: 30000,
    },
    pgTestVeritabani: null,
    commit: null,
  });
});

test('commit TMIV2_COMMIT değişkeninden okunur; yoksa ya da boşsa null, test ayarı taşır', () => {
  assert.equal(ayarOku({ ...TAM, TMIV2_COMMIT: ' abc1234 ' }).commit, 'abc1234');
  assert.equal(ayarOku(TAM).commit, null);
  assert.equal(ayarOku({ ...TAM, TMIV2_COMMIT: '  ' }).commit, null);
  const tasinan = testAyari(ayarOku({ ...TAM, TMIV2_PG_TEST_DATABASE: 'tmiv2_test', TMIV2_COMMIT: 'abc1234' }));
  assert.equal(tasinan.commit, 'abc1234');
});

test('eksik değişken adıyla söylenir, varsayılan yoktur', () => {
  for (const ad of Object.keys(TAM)) {
    const eksik: Record<string, string | undefined> = { ...TAM, [ad]: undefined };
    assert.throws(() => ayarOku(eksik), new RegExp(`eksik: ${ad}$`), ad);
    assert.throws(() => ayarOku({ ...TAM, [ad]: '  ' }), new RegExp(`eksik: ${ad}$`), `${ad} boş`);
  }
});

test('geçersiz ortam ve port reddedilir', () => {
  assert.throws(() => ayarOku({ ...TAM, TMIV2_ORTAM: 'uretim' }), /geçersiz: TMIV2_ORTAM/);
  for (const port of ['0', '70000', '41a0', '-1', '4100.5']) {
    assert.throws(() => ayarOku({ ...TAM, TMIV2_PORT: port }), /geçersiz: TMIV2_PORT/, port);
  }
  assert.throws(() => ayarOku({ ...TAM, TMIV2_PG_PORT: 'x' }), /geçersiz: TMIV2_PG_PORT/);
});

test('süre sınırları pozitif tam sayı milisaniyedir; sıfır, negatif, kesirli ve aşırı büyük değer reddedilir', () => {
  for (const ad of ['TMIV2_PG_BAGLANTI_SURE_MS', 'TMIV2_PG_SORGU_SURE_MS', 'TMIV2_PG_OKUMA_SURE_MS', 'TMIV2_PG_KILIT_SURE_MS', 'TMIV2_PG_BOS_TX_SURE_MS']) {
    for (const deger of ['0', '-1', '-5000', '1.5', '5sn', '1e3', '3600001']) {
      assert.throws(() => ayarOku({ ...TAM, [ad]: deger }), new RegExp(`geçersiz: ${ad} `), `${ad}=${deger}`);
    }
  }
  const ayar = ayarOku({ ...TAM, TMIV2_PG_BAGLANTI_SURE_MS: '1', TMIV2_PG_SORGU_SURE_MS: '3600000' });
  assert.equal(ayar.pg.okumaSureMs, 3000);
  assert.equal(ayar.pg.baglantiSureMs, 1);
  assert.equal(ayar.pg.sorguSureMs, 3_600_000);
  const tasinan = testAyari(ayarOku({ ...TAM, TMIV2_PG_TEST_DATABASE: 'tmiv2_test', TMIV2_PG_BAGLANTI_SURE_MS: '700' }));
  assert.equal(tasinan.pg.baglantiSureMs, 700);
  assert.equal(tasinan.pg.sorguSureMs, 20000);
  const ikisi = ayarOku({ ...TAM, TMIV2_PG_KILIT_SURE_MS: '1', TMIV2_PG_BOS_TX_SURE_MS: '3600000' });
  assert.deepEqual([ikisi.pg.kilitSureMs, ikisi.pg.bosTxSureMs], [1, 3_600_000]);
});

test('okuma süresi sorgu süresini aşamaz; eşit olabilir', () => {
  assert.throws(() => ayarOku({ ...TAM, TMIV2_PG_OKUMA_SURE_MS: '20001' }), /geçersiz: TMIV2_PG_OKUMA_SURE_MS \(TMIV2_PG_SORGU_SURE_MS/);
  assert.equal(ayarOku({ ...TAM, TMIV2_PG_OKUMA_SURE_MS: '20000' }).pg.okumaSureMs, 20000);
});

test('havuz boyutu 1-500 arası tam sayıdır', () => {
  for (const deger of ['0', '-1', '1.5', '10x', '501']) {
    assert.throws(() => ayarOku({ ...TAM, TMIV2_PG_HAVUZ: deger }), /geçersiz: TMIV2_PG_HAVUZ /, deger);
  }
  assert.deepEqual(['1', '500'].map((d) => ayarOku({ ...TAM, TMIV2_PG_HAVUZ: d }).pg.havuzBoyutu), [1, 500]);
});

test("eski canlı veritabanı adı 'tmi' her iki değişkende reddedilir", () => {
  assert.throws(() => ayarOku({ ...TAM, TMIV2_PG_DATABASE: 'tmi' }), /geçersiz: TMIV2_PG_DATABASE/);
  assert.throws(() => ayarOku({ ...TAM, TMIV2_PG_DATABASE: 'TMI' }), /geçersiz: TMIV2_PG_DATABASE/);
  assert.throws(() => ayarOku({ ...TAM, TMIV2_PG_TEST_DATABASE: 'tmi' }), /geçersiz: TMIV2_PG_TEST_DATABASE/);
  assert.throws(() => ayarOku({ ...TAM, TMIV2_PG_DATABASE: 'tmi_onizleme' }), /geçersiz: TMIV2_PG_DATABASE .'tmi_onizleme' eski sistemin/);
  assert.throws(() => ayarOku({ ...TAM, TMIV2_PG_DATABASE: 'TMI_Onizleme' }), /geçersiz: TMIV2_PG_DATABASE/);
  assert.throws(() => ayarOku({ ...TAM, TMIV2_PG_TEST_DATABASE: 'tmi_onizleme' }), /geçersiz: TMIV2_PG_TEST_DATABASE/);
  assert.equal(ayarOku({ ...TAM, TMIV2_PG_DATABASE: 'tmi_onizleme2' }).pg.veritabani, 'tmi_onizleme2');
  assert.equal(ayarOku({ ...TAM, TMIV2_PG_DATABASE: 'tmiv2' }).pg.veritabani, 'tmiv2');
});

test('eski sistemin TMI_PG_* değişkenleri okunmaz', () => {
  const ayar = ayarOku({ ...TAM, TMI_PG_DATABASE: 'tmi', TMI_PG_HOST: 'baska' });
  assert.equal(ayar.pg.veritabani, 'tmiv2');
  assert.equal(ayar.pg.host, '127.0.0.1');
});

test('testAyari test veritabanına çevirir; tanımsızsa ya da asıl veritabanıyla aynıysa hata verir', () => {
  const ayar = testAyari(ayarOku({ ...TAM, TMIV2_PG_TEST_DATABASE: 'tmiv2_test' }));
  assert.equal(ayar.pg.veritabani, 'tmiv2_test');
  assert.equal(ayar.ortam, 'test');
  assert.throws(() => testAyari(ayarOku(TAM)), /eksik: TMIV2_PG_TEST_DATABASE/);
  assert.throws(() => testAyari(ayarOku({ ...TAM, TMIV2_PG_TEST_DATABASE: 'tmiv2' })), /geçersiz: TMIV2_PG_TEST_DATABASE/);
});

test('sunucu ayarı göç kimliği olmadan okunur; ortamda varken de ayara ve test ayarına girmez', () => {
  const gocsuz = ayarOku(TAM);
  const gocVarken = ayarOku({ ...TAM, ...GOC, TMIV2_PG_TEST_DATABASE: 'tmiv2_test' });
  assert.deepEqual({ ...gocVarken, pgTestVeritabani: null }, gocsuz);
  for (const ayar of [gocVarken, testAyari(gocVarken)]) {
    const yazili = JSON.stringify(ayar);
    assert.equal(yazili.includes('"parola"'), true);
    for (const deger of Object.values(GOC)) assert.equal(yazili.includes(deger), false, deger);
  }
});

test('göç kimliği ayrı okunur: iki değişken de zorunludur, varsayılan yoktur', () => {
  assert.deepEqual(gocKimligiOku({ ...TAM, ...GOC }), { kullanici: 'goc-kullanici', parola: 'goc-parola' });
  for (const ad of Object.keys(GOC)) {
    assert.throws(() => gocKimligiOku({ ...TAM, ...GOC, [ad]: undefined }), new RegExp(`eksik: ${ad}$`), ad);
    assert.throws(() => gocKimligiOku({ ...TAM, ...GOC, [ad]: '  ' }), new RegExp(`eksik: ${ad}$`), `${ad} boş`);
  }
  assert.throws(() => gocKimligiOku(TAM), /eksik: TMIV2_PG_GOC_USER$/);
});

test('göç kullanıcısı uygulama kullanıcısıyla aynı olamaz; parolanın aynı olması engel değildir', () => {
  assert.throws(() => gocKimligiOku({ ...TAM, ...GOC, TMIV2_PG_GOC_USER: 'kullanici' }), /geçersiz: TMIV2_PG_GOC_USER \(TMIV2_PG_USER ile aynı olamaz/);
  assert.throws(() => gocKimligiOku({ ...TAM, ...GOC, TMIV2_PG_GOC_USER: ' kullanici ' }), /geçersiz: TMIV2_PG_GOC_USER/);
  assert.deepEqual(gocKimligiOku({ ...TAM, ...GOC, TMIV2_PG_GOC_PASSWORD: 'parola' }), { kullanici: 'goc-kullanici', parola: 'parola' });
});

test('harita dizini isteğe bağlıdır: TMIV2_HARITA_DIZINI verilmediyse ya da boşsa null, verildiyse kırpılmış hali', () => {
  assert.equal(haritaDiziniOku({}), null);
  assert.equal(haritaDiziniOku({ TMIV2_HARITA_DIZINI: '  ' }), null);
  assert.equal(haritaDiziniOku({ TMIV2_HARITA_DIZINI: ' /srv/harita ' }), '/srv/harita');
  // Sunucu ayarının zorunlu değişkenleri olmadan da okunur: harita okuması veritabanı ayarına bağlı değildir.
  assert.equal(haritaDiziniOku({ TMIV2_HARITA_DIZINI: '/srv/harita', TMIV2_PG_HOST: undefined }), '/srv/harita');
});

test('canlıda sunucu yalnız bu makinede dinler; geliştirme ve testte bütün arayüzler (kart #175)', () => {
  assert.equal(dinlemeAdresi('canli'), '127.0.0.1');
  assert.equal(dinlemeAdresi('gelistirme'), '0.0.0.0');
  assert.equal(dinlemeAdresi('test'), '0.0.0.0');
});

test('ters vekil başka bilgisayardaysa adresi okunur; IP olmayan değer açılışı durdurur (kart #175)', () => {
  const tam = { ...TAM };
  assert.equal(ayarOku(tam).vekilAdresi, undefined);
  assert.equal(ayarOku({ ...tam, TMIV2_VEKIL_ADRESI: ' 10.0.9.5 ' }).vekilAdresi, '10.0.9.5');
  assert.throws(() => ayarOku({ ...tam, TMIV2_VEKIL_ADRESI: 'vekil.kurum' }), /TMIV2_VEKIL_ADRESI/);
});

// Uygulama kullanıcısı data_directory'yi okuyamaz; diski izlenecek klasör isteğe bağlı değişkendir, boşsa bilinmiyor.
test('PostgreSQL veri klasörü: boşsa null, doluysa kırpılmış değer', () => {
  assert.equal(pgVeriDiziniOku({}), null);
  assert.equal(pgVeriDiziniOku({ TMIV2_PG_VERI_DIZINI: '  ' }), null);
  assert.equal(pgVeriDiziniOku({ TMIV2_PG_VERI_DIZINI: ' D:\\PostgreSQL\\data ' }), 'D:\\PostgreSQL\\data');
});
