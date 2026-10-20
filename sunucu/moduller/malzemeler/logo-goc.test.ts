import assert from 'node:assert/strict';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import type { Db } from '#cekirdek/db.ts';
import { gocleriUygula } from '#cekirdek/goc.ts';
import { testSemasiAc } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';

const GOC_KLASORU = fileURLToPath(new URL('../../gocler/', import.meta.url));
const LOGO_GOCU = '_malzemeler_logo_hazirlik.sql';
const KISIT_GOCU = '_malzemeler_logo_karsilik_kisiti.sql';

async function kartEkle(db: Db, kisiId: number, kimlik: string, onek: string, sira: number, durum: string): Promise<void> {
  await db.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 99) ON CONFLICT (onek) DO NOTHING', [onek]);
  await db.sorgu(
    `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
     VALUES ($1, 'hammadde', $2, $3, $4, $5, $6, $6)`,
    [kimlik, onek, sira, durum, JSON.stringify({ id: kimlik, com: { ad: 'Göç', birim: 'kg' } }), kisiId],
  );
}

// Denenen göçten (öntanım Logo hazırlık göçü) önceki bütün göçler uygulanmış şema; `doldur` göçten önceki satırları yazar.
async function oncekiSema(
  ad: string, doldur: (db: Db, kisiId: number) => Promise<void>, gocSonu = LOGO_GOCU,
): Promise<{ ortam: TestVeritabani; klasor: string; goc: string }> {
  const ortam = await testSemasiAc(ad);
  const klasor = await mkdtemp(join(tmpdir(), 'tmiv2-logogoc-'));
  const hepsi = (await readdir(GOC_KLASORU)).filter((x) => x.endsWith('.sql')).sort();
  const goc = hepsi.find((x) => x.endsWith(gocSonu));
  assert.ok(goc, `${gocSonu} göçü bulunamadı`);
  for (const x of hepsi.filter((a) => a < goc)) await copyFile(join(GOC_KLASORU, x), join(klasor, x));
  await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema });
  await ortam.vt.tx(async (db) => doldur(db, await yoneticiOlustur(db, { ad: `${ad}-kisi`, kullaniciAdi: `${ad}-kisi`, parola: 'dogru-parola-1' })));
  await copyFile(join(GOC_KLASORU, goc), join(klasor, goc));
  return { ortam, klasor, goc };
}

describe('Logo hazırlık göçü dolu tabloda (kart #232, gerçek PostgreSQL)', () => {
  test('24 karakteri aşan stok kodu varsa göç sayıyı söyleyerek durur ve hiçbir şey değişmez (LG4 = a)', async () => {
    const { ortam, klasor } = await oncekiSema('logogocuzun', async (db, kisi) => {
      await kartEkle(db, kisi, 'u-uzun', 'HM-ABCDEFGHIJKLMNOPQRSTU-', 1, 'aktif');
      await kartEkle(db, kisi, 'u-uzun2', 'HM-ABCDEFGHIJKLMNOPQRSTU-', 2, 'taslak');
      await kartEkle(db, kisi, 'u-kisa', 'HM-KSA-', 1, 'aktif');
    });
    try {
      await assert.rejects(gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema }), /2 malzeme kartının stok kodu 24 karakteri aşıyor/);
      const sutun = await ortam.vt.tek(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'malzeme_katalog_karti' AND column_name = 'logo_gonderim_durumu'`,
        [ortam.sema],
      );
      assert.equal(sutun, null, 'sütun eklenmedi');
      assert.equal(await ortam.vt.tek(`SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'malzeme_logo_karsiligi'`, [ortam.sema]), null);
      assert.equal((await ortam.vt.sorgu('SELECT kimlik FROM malzeme_katalog_karti')).length, 3);
    } finally {
      await rm(klasor, { recursive: true, force: true });
      await ortam.kaldir();
    }
  });

  test('aşan kod yoksa göç geçer: var olan kartların Logo durumu boş kalır (bugünkü aktif kart gönderilmez, LG1 = a); yeni ilk aktiflik "bekliyor" olur', async () => {
    const { ortam, klasor, goc } = await oncekiSema('logogocgecer', async (db, kisi) => {
      await kartEkle(db, kisi, 'g-aktif', 'HM-GCR-', 1, 'aktif');
      await kartEkle(db, kisi, 'g-pasif', 'HM-GCR-', 2, 'pasif');
      await kartEkle(db, kisi, 'g-onayda', 'HM-GCR-', 3, 'onayda');
      await kartEkle(db, kisi, 'g-24', 'HM-ABCDEFGHIJKLMNO-', 1, 'taslak');
    });
    try {
      assert.deepEqual(await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema }), [goc]);
      const durumlar = await ortam.vt.sorgu<{ kimlik: string; durum: string | null }>(
        'SELECT kimlik, logo_gonderim_durumu AS durum FROM malzeme_katalog_karti ORDER BY kimlik');
      assert.deepEqual(durumlar.map((x) => [x.kimlik, x.durum]), [['g-24', null], ['g-aktif', null], ['g-onayda', null], ['g-pasif', null]]);
      await ortam.vt.sorgu(`UPDATE malzeme_katalog_karti SET onay_durumu = 'aktif' WHERE kimlik IN ('g-onayda', 'g-pasif')`);
      const sonra = await ortam.vt.sorgu<{ kimlik: string; durum: string | null }>(
        `SELECT kimlik, logo_gonderim_durumu AS durum FROM malzeme_katalog_karti WHERE kimlik IN ('g-onayda', 'g-pasif') ORDER BY kimlik`);
      assert.deepEqual(sonra.map((x) => [x.kimlik, x.durum]), [['g-onayda', 'bekliyor'], ['g-pasif', null]]);
    } finally {
      await rm(klasor, { recursive: true, force: true });
      await ortam.kaldir();
    }
  });
});

async function karsilikEkle(db: Db, kisiId: number, cesit: 'tur' | 'birim', tmi: string, logo: string | null): Promise<void> {
  await db.sorgu(
    'INSERT INTO malzeme_logo_karsiligi (cesit, tmi_degeri, logo_degeri, guncelleyen_kisi_id) VALUES ($1, $2, $3, $4)',
    [cesit, tmi, logo, kisiId],
  );
}

const kisitVarMi = async (ortam: TestVeritabani): Promise<boolean> =>
  (await ortam.vt.tek(
    `SELECT 1 FROM information_schema.table_constraints WHERE table_schema = $1 AND constraint_name = 'malzeme_logo_karsiligi_izinli'`,
    [ortam.sema],
  )) !== null;

describe('Logo karşılık kısıtı göçü dolu tabloda (kart #232, LB7 a, gerçek PostgreSQL)', () => {
  test('izinli değerin dışında karşılık varsa göç bozan satırları sayısıyla yazarak durur; veri ve kısıt değişmez', async () => {
    const { ortam, klasor } = await oncekiSema('logokisitbozuk', async (db, kisi) => {
      await karsilikEkle(db, kisi, 'tur', 'hammadde', '10');
      await karsilikEkle(db, kisi, 'tur', 'sarf', 'TICARI');
      await karsilikEkle(db, kisi, 'tur', 'demirbas', '4');
      await karsilikEkle(db, kisi, 'birim', 'kg', '06 KG');
      await karsilikEkle(db, kisi, 'birim', 'adet', '05');
    }, KISIT_GOCU);
    try {
      await assert.rejects(
        gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema }),
        /3 Logo karşılığı izinli değerlerin dışında \(birim kg = 06 KG; tur demirbas = 4; tur sarf = TICARI\)/,
      );
      assert.equal(await kisitVarMi(ortam), false, 'kısıt eklenmedi');
      const satirlar = await ortam.vt.sorgu<{ tmi: string; logo: string | null }>(
        'SELECT tmi_degeri AS tmi, logo_degeri AS logo FROM malzeme_logo_karsiligi ORDER BY cesit, tmi_degeri');
      assert.deepEqual(satirlar.map((x) => [x.tmi, x.logo]), [['adet', '05'], ['kg', '06 KG'], ['demirbas', '4'], ['hammadde', '10'], ['sarf', 'TICARI']]);
    } finally {
      await rm(klasor, { recursive: true, force: true });
      await ortam.kaldir();
    }
  });

  test('karşılıklar izinliyse göç geçer ve kısıt bundan sonraki bozuk yazımı reddeder', async () => {
    const { ortam, klasor, goc } = await oncekiSema('logokisittemiz', async (db, kisi) => {
      await karsilikEkle(db, kisi, 'tur', 'hammadde', '10');
      await karsilikEkle(db, kisi, 'tur', 'demirbas', null);
      await karsilikEkle(db, kisi, 'birim', 'kg', '06');
    }, KISIT_GOCU);
    try {
      assert.deepEqual(await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema }), [goc]);
      assert.equal(await kisitVarMi(ortam), true);
      await assert.rejects(ortam.vt.sorgu(`UPDATE malzeme_logo_karsiligi SET logo_degeri = '4' WHERE tmi_degeri = 'demirbas'`), /malzeme_logo_karsiligi_izinli/);
      await assert.rejects(ortam.vt.sorgu(`UPDATE malzeme_logo_karsiligi SET logo_degeri = '06 KG' WHERE tmi_degeri = 'kg'`), /malzeme_logo_karsiligi_izinli/);
    } finally {
      await rm(klasor, { recursive: true, force: true });
      await ortam.kaldir();
    }
  });
});

const BIRIM_GOCU = '_malzemeler_birim_kategori.sql';

describe('Birim ve kategori listesi göçü dolu tabloda (kart #163, SH4 a, ML1 a, gerçek PostgreSQL)', () => {
  test('listede olmayan Logo birim karşılığı ya da 40 karakteri aşan kart birimi varsa göç sayıyla durur; hiçbir şey değişmez', async () => {
    const { ortam, klasor } = await oncekiSema('birimgocbozuk', async (db, kisi) => {
      await kartEkle(db, kisi, 'b-kg', 'HM-BRM-', 1, 'aktif');
      await karsilikEkle(db, kisi, 'birim', 'kg', '06');
      await karsilikEkle(db, kisi, 'birim', 'hic-kartta-yok', '05');
    }, BIRIM_GOCU);
    try {
      await assert.rejects(gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema }), /1 Logo birim karşılığı birim listesinde yok \(hic-kartta-yok\)/);
      assert.equal(await ortam.vt.tek(`SELECT 1 FROM information_schema.tables WHERE table_schema = $1 AND table_name = 'malzeme_birimi'`, [ortam.sema]), null);
      assert.equal((await ortam.vt.sorgu('SELECT 1 FROM malzeme_logo_karsiligi')).length, 2);
    } finally {
      await rm(klasor, { recursive: true, force: true });
      await ortam.kaldir();
    }
    const uzun = await oncekiSema('birimgocuzun', async (db, kisi) => {
      await kartEkle(db, kisi, 'b-uzun', 'HM-BRM-', 1, 'aktif');
      await db.sorgu(`UPDATE malzeme_katalog_karti SET kayit = jsonb_set(kayit, '{com,birim}', to_jsonb(repeat('b', 41))) WHERE kimlik = 'b-uzun'`);
    }, BIRIM_GOCU);
    try {
      await assert.rejects(gocleriUygula(uzun.ortam.ayar, uzun.klasor, { sema: uzun.ortam.sema }), /1 kart birimi 40 karakteri aşıyor/);
    } finally {
      await rm(uzun.klasor, { recursive: true, force: true });
      await uzun.ortam.kaldir();
    }
  });

  test('göç geçer: yerleşik birimler ve ayarda eklenenler seçilebilir, yalnız kartta geçen birim pasif; kartlar ve karşılıklar değişmez', async () => {
    const { ortam, klasor, goc } = await oncekiSema('birimgocgecer', async (db, kisi) => {
      await kartEkle(db, kisi, 'g-kg', 'HM-BRM-', 1, 'aktif');
      await kartEkle(db, kisi, 'g-eski', 'HM-BRM-', 2, 'aktif');
      await db.sorgu(`UPDATE malzeme_katalog_karti SET kayit = jsonb_set(kayit, '{com,birim}', '" eski-birim "') WHERE kimlik = 'g-eski'`);
      await db.sorgu(`INSERT INTO malzeme_katalog_ayari (anahtar, deger, guncelleyen_kisi_id) VALUES ('malzeme', $1, $2)`,
        [JSON.stringify({ listeler: { 'birim|sarf': { ekle: ['koli', ' '], gizle: [] }, 'tol|x|y': { ekle: ['h7'] } } }), kisi]);
      await karsilikEkle(db, kisi, 'birim', 'eski-birim', '05');
    }, BIRIM_GOCU);
    try {
      const once = await ortam.vt.sorgu('SELECT kimlik, kayit FROM malzeme_katalog_karti ORDER BY kimlik');
      assert.deepEqual(await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema }), [goc]);
      const b = new Map((await ortam.vt.sorgu<{ kod: string; aktif: boolean }>('SELECT kod, aktif FROM malzeme_birimi')).map((x) => [x.kod, x.aktif]));
      assert.deepEqual([b.get('kg'), b.get('tüp'), b.get('koli'), b.get('eski-birim'), b.has('h7'), b.has('')], [true, true, true, false, false, false]);
      assert.deepEqual(await ortam.vt.sorgu('SELECT kimlik, kayit FROM malzeme_katalog_karti ORDER BY kimlik'), once);
      assert.equal((await ortam.vt.sorgu(`SELECT 1 FROM malzeme_kategorisi WHERE yerlesik AND aktif`)).length, 18);
    } finally {
      await rm(klasor, { recursive: true, force: true });
      await ortam.kaldir();
    }
  });
});

const HIZMET_GOCU = '_malzemeler_hizmet.sql';

describe('Hizmet göçü dolu tabloda (kart #163, MH1-MH5, gerçek PostgreSQL)', () => {
  test('yeni hizmet birimi listede zaten varsa ya da HZ önekli kart varsa göç sayıyla durur; hiçbir şey değişmez', async () => {
    const { ortam, klasor } = await oncekiSema('hizmetgocbirim', async (db, kisi) => {
      await kartEkle(db, kisi, 'h-kg', 'HM-HZM-', 1, 'aktif');
      await db.sorgu(`INSERT INTO malzeme_birimi (kod, aktif) VALUES ('saat', true), ('KM', false)`);
    }, HIZMET_GOCU);
    try {
      await assert.rejects(gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema }), /2 birim listesi satırı hizmet birimleriyle çakışıyor \(KM; saat\)/);
      const sutun = await ortam.vt.tek(
        `SELECT 1 FROM information_schema.columns WHERE table_schema = $1 AND table_name = 'malzeme_katalog_karti' AND column_name = 'hizmet_yonu'`, [ortam.sema]);
      assert.equal(sutun, null, 'sütun eklenmedi');
      assert.deepEqual((await ortam.vt.sorgu<{ kod: string; aktif: boolean }>(`SELECT kod, aktif FROM malzeme_birimi WHERE kod IN ('saat', 'KM') ORDER BY kod`))
        .map((x) => [x.kod, x.aktif]), [['KM', false], ['saat', true]]);
      assert.equal((await ortam.vt.sorgu(`SELECT 1 FROM malzeme_kategorisi WHERE tur = 'hizmet'`)).length, 0);
    } finally {
      await rm(klasor, { recursive: true, force: true });
      await ortam.kaldir();
    }
    const onek = await oncekiSema('hizmetgoconek', async (db, kisi) => {
      await kartEkle(db, kisi, 'h-hz', 'HZ-ESK-', 1, 'taslak');
    }, HIZMET_GOCU);
    try {
      await assert.rejects(gocleriUygula(onek.ortam.ayar, onek.klasor, { sema: onek.ortam.sema }), /1 malzeme kartı HZ önekini taşıyor \(HZ-ESK-00001\)/);
    } finally {
      await rm(onek.klasor, { recursive: true, force: true });
      await onek.ortam.kaldir();
    }
  });

  test('göç geçer: kartlar, kategoriler ve karşılıklar değişmez; yerleşik adet, kg, m² hizmet listesine girer, seçilebilirliği korunur', async () => {
    const { ortam, klasor, goc } = await oncekiSema('hizmetgocgecer', async (db, kisi) => {
      await kartEkle(db, kisi, 'g-kg', 'HM-HZM-', 1, 'aktif');
      await kartEkle(db, kisi, 'g-taslak', 'HM-HZM-', 2, 'taslak');
      await db.sorgu(`UPDATE malzeme_birimi SET aktif = false WHERE kod = 'm²'`);
      await karsilikEkle(db, kisi, 'birim', 'kg', '06');
    }, HIZMET_GOCU);
    try {
      const kartlar = 'SELECT kimlik, tur, onay_durumu, kayit, surum FROM malzeme_katalog_karti ORDER BY kimlik';
      const kategoriler = 'SELECT tur, kod, ad, kisa_kod, aktif FROM malzeme_kategorisi ORDER BY tur, kod';
      const karsiliklar = 'SELECT cesit, tmi_degeri, logo_degeri FROM malzeme_logo_karsiligi ORDER BY cesit, tmi_degeri';
      const once = await Promise.all([kartlar, kategoriler, karsiliklar].map((q) => ortam.vt.sorgu(q)));
      assert.deepEqual(await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema }), [goc]);
      assert.deepEqual((await ortam.vt.sorgu<{ kimlik: string; y: string | null }>('SELECT kimlik, hizmet_yonu AS y FROM malzeme_katalog_karti ORDER BY kimlik'))
        .map((x) => [x.kimlik, x.y]), [['g-kg', null], ['g-taslak', null]]);
      assert.deepEqual(await ortam.vt.sorgu(kartlar), once[0]);
      assert.deepEqual(await ortam.vt.sorgu(`${kategoriler.replace('ORDER BY', `WHERE tur <> 'hizmet' ORDER BY`)}`), once[1]);
      assert.deepEqual(await ortam.vt.sorgu(karsiliklar), once[2]);
      const b = new Map((await ortam.vt.sorgu<{ kod: string; aktif: boolean; l: string[] }>('SELECT kod, aktif, yerlesik_listeler AS l FROM malzeme_birimi'))
        .map((x) => [x.kod, x]));
      for (const kod of ['adet', 'saat', 'gün', 'sefer', 'ay', 'kg', 'm²', 'km']) assert.ok(b.get(kod)?.l.includes('birim|hizmet'), kod);
      assert.deepEqual([b.get('kg')?.aktif, b.get('m²')?.aktif, b.get('saat')?.aktif], [true, false, true], 'yerleşik birimin seçilebilirliği değişmez');
      assert.deepEqual(b.get('kg')?.l.includes('birim'), true, 'eski listeler korunur');
      assert.equal((await ortam.vt.sorgu(`SELECT 1 FROM malzeme_kategorisi WHERE tur = 'hizmet' AND yerlesik AND aktif`)).length, 5);
      await assert.rejects(ortam.vt.sorgu(`UPDATE malzeme_katalog_karti SET hizmet_yonu = 'alinan' WHERE kimlik = 'g-taslak'`), /malzeme_katalog_karti_hizmet_yonu/);
      await assert.rejects(ortam.vt.sorgu(`UPDATE malzeme_katalog_karti SET tur = 'hizmet' WHERE kimlik = 'g-taslak'`), /malzeme_katalog_karti_hizmet_yonu/);
    } finally {
      await rm(klasor, { recursive: true, force: true });
      await ortam.kaldir();
    }
  });
});

const HIZMET_CESIT_GOCU = '_malzemeler_hizmet_cesit.sql';

describe('Hizmet çeşidi göçü (kart #163, gerçek PostgreSQL)', () => {
  test('aynı anahtarlı hizmet grubu varsa göç sayıyla durur; hiçbir satır eklenmez', async () => {
    const { ortam, klasor } = await oncekiSema('hizmetcesitvar', async (db) => {
      await db.sorgu(`INSERT INTO malzeme_kategorisi (tur, kod, ad, kisa_kod, yerlesik, aktif) VALUES ('hizmet', 'isil', 'Eski ısıl', 'ESK', false, false)`);
    }, HIZMET_CESIT_GOCU);
    try {
      await assert.rejects(gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema }), /1 hizmet grubu zaten var \(isil\)/);
      assert.deepEqual(await ortam.vt.sorgu(`SELECT kod, ad, kisa_kod, aktif FROM malzeme_kategorisi WHERE kod IN ('yuzey', 'isil', 'muayene')`),
        [{ kod: 'isil', ad: 'Eski ısıl', kisa_kod: 'ESK', aktif: false }]);
    } finally {
      await rm(klasor, { recursive: true, force: true });
      await ortam.kaldir();
    }
  });

  test('göç geçer: üç grup yerleşik ve aktif eklenir; kartlar ve var olan gruplar değişmez', async () => {
    const { ortam, klasor, goc } = await oncekiSema('hizmetcesitgecer', async (db, kisi) => {
      await kartEkle(db, kisi, 'c-kg', 'HM-CST-', 1, 'aktif');
      await db.sorgu(`UPDATE malzeme_kategorisi SET aktif = false WHERE tur = 'hizmet' AND kod = 'nakliye'`);
    }, HIZMET_CESIT_GOCU);
    try {
      const kartlar = 'SELECT kimlik, tur, onay_durumu, kayit, surum FROM malzeme_katalog_karti ORDER BY kimlik';
      const kategoriler = 'SELECT tur, kod, ad, kisa_kod, yerlesik, aktif FROM malzeme_kategorisi ORDER BY tur, kod';
      const once = await Promise.all([kartlar, kategoriler].map((q) => ortam.vt.sorgu(q)));
      assert.deepEqual(await gocleriUygula(ortam.ayar, klasor, { sema: ortam.sema }), [goc]);
      assert.deepEqual(await ortam.vt.sorgu(kartlar), once[0]);
      const yeni = `('yuzey', 'isil', 'muayene')`;
      assert.deepEqual(await ortam.vt.sorgu(kategoriler.replace('ORDER BY', `WHERE kod NOT IN ${yeni} ORDER BY`)), once[1], 'gizlenen nakliye dahil var olanlar aynı');
      assert.deepEqual(await ortam.vt.sorgu(`SELECT kod, ad, kisa_kod, yerlesik, aktif FROM malzeme_kategorisi WHERE tur = 'hizmet' AND kod IN ${yeni} ORDER BY kod`), [
        { kod: 'isil', ad: 'Isıl işlem', kisa_kod: 'ISL', yerlesik: true, aktif: true },
        { kod: 'muayene', ad: 'Muayene ve test', kisa_kod: 'MYT', yerlesik: true, aktif: true },
        { kod: 'yuzey', ad: 'Yüzey işlem ve kaplama', kisa_kod: 'YZY', yerlesik: true, aktif: true },
      ]);
    } finally {
      await rm(klasor, { recursive: true, force: true });
      await ortam.kaldir();
    }
  });
});
