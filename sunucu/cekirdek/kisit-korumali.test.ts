import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import pg from 'pg';
import type { Db, Veritabani } from './db.ts';
import { UygulamaHatasi } from './hata.ts';
import { kisitKorumali } from './kisit.ts';
import type { KisitEslemesi } from './kisit.ts';
import { testSemasiAc } from './test-vt.ts';

// Bir modülün `servis.ts` dosyasında duracak eşleme: göçteki kısıt adı -> ileti (ve form alanı).
const DEPO_KISITLARI: KisitEslemesi = {
  depo_kod_tek: { ileti: 'Bu kod başka bir depoda kullanılıyor.', alan: 'kod' },
  depo_ad_tek: 'Bu adda bir depo var.',
  raf_depo_fk: 'Bu depoda raf var; önce rafları kaldırın.',
  palet_depo_fk: 'Bu depoda palet var; önce paletleri kaldırın.',
  depo_sira_arti: { ileti: 'Sıra sıfırdan büyük olmalı.', alan: 'sira' },
  raf_etiket_tek: 'Bu etiket başka bir rafta kullanılıyor.',
};

const DEPO_KULLANIMDA = 'Bu depo kullanımda; silinemez.';

// Bir modülün `sorgular.ts` dosyasında duracak yazmalar.
const depoEkle = async (db: Db, kod: string, ad: string, sira = 1): Promise<number> =>
  (await db.tek<{ id: number }>('INSERT INTO depo (kod, ad, sira) VALUES ($1, $2, $3) RETURNING id', [kod, ad, sira]))!.id;

const depoSil = async (db: Db, id: number): Promise<boolean> =>
  (await db.sorgu('DELETE FROM depo WHERE id = $1 RETURNING id', [id])).length > 0;

const rafEkle = (db: Db, depoId: number): Promise<unknown> => db.sorgu('INSERT INTO raf (depo_id) VALUES ($1)', [depoId]);

async function hatayiAl(is: Promise<unknown>): Promise<unknown> {
  let basarili = false;
  const hata = await is.then(() => { basarili = true; return null; }, (h: unknown) => h);
  assert.equal(basarili, false, 'hata beklenirdi, işlem başarıyla bitti');
  return hata;
}

async function uygulamaHatasiAl(is: Promise<unknown>): Promise<UygulamaHatasi> {
  const hata = await hatayiAl(is);
  assert.ok(hata instanceof UygulamaHatasi, `UygulamaHatasi beklenirdi: ${String(hata)}`);
  return hata;
}

async function vtHatasiAl(is: Promise<unknown>): Promise<pg.DatabaseError> {
  const hata = await hatayiAl(is);
  assert.ok(hata instanceof pg.DatabaseError, `Veritabanı hatası beklenirdi: ${String(hata)}`);
  return hata;
}

describe('kisitKorumali (gerçek PostgreSQL)', () => {
  let vt: Veritabani | undefined;
  let kaldir: (() => Promise<void>) | undefined;

  const acik = (): Veritabani => {
    if (!vt) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return vt;
  };

  const depoSayisi = async (kod: string): Promise<number> => (await acik().sorgu('SELECT 1 FROM depo WHERE kod = $1', [kod])).length;

  before(async () => {
    const ortam = await testSemasiAc('kisitk');
    ({ kaldir } = ortam);
    await ortam.sahip.sorgu(`
      CREATE TABLE depo (
        id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        kod text NOT NULL,
        ad text NOT NULL,
        sira int NOT NULL,
        CONSTRAINT depo_kod_tek UNIQUE (kod),
        CONSTRAINT depo_sira_arti CHECK (sira > 0),
        CONSTRAINT depo_sira_ust CHECK (sira < 1000),
        CONSTRAINT "toString" CHECK (sira <> 999)
      );
      CREATE UNIQUE INDEX depo_ad_tek ON depo (lower(ad));
      CREATE UNIQUE INDEX depo_sira_tek ON depo (sira) WHERE sira >= 500;
      CREATE TABLE raf (
        id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        depo_id int NOT NULL CONSTRAINT raf_depo_fk REFERENCES depo,
        etiket text,
        CONSTRAINT raf_etiket_tek UNIQUE (etiket) DEFERRABLE INITIALLY DEFERRED
      );
      CREATE TABLE palet (
        id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        depo_id int NOT NULL CONSTRAINT palet_depo_fk REFERENCES depo ON DELETE RESTRICT
      );
      -- Başka modülün tablosu: depo modülü bu yabancı anahtarın adını bilmez.
      CREATE TABLE sevkiyat (
        id int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
        depo_id int NOT NULL CONSTRAINT sevkiyat_depo_fk REFERENCES depo
      );
    `);
    vt = ortam.vt;
  });

  after(async () => {
    await kaldir?.();
  });

  test('başarılı yazmanın sonucu aynen döner ve yazı kalır', async () => {
    const sonuc = { id: 0 };
    const donen = await acik().tx((db) => kisitKorumali(DEPO_KISITLARI, async () => {
      sonuc.id = await depoEkle(db, 'D-BASARILI', 'Başarılı');
      return sonuc;
    }));
    assert.equal(donen, sonuc);
    assert.equal(donen.id > 0, true);
    assert.equal(await depoSayisi('D-BASARILI'), 1);
  });

  test('tekillik ihlali: 409 CAKISMA, eşlemedeki ileti ve alan; hangi kısıtsa onun iletisi', async () => {
    await acik().tx((db) => depoEkle(db, 'D-1', 'Bir'));

    const kod = await uygulamaHatasiAl(acik().tx((db) => kisitKorumali(DEPO_KISITLARI, () => depoEkle(db, 'D-1', 'Başka'))));
    assert.equal(kod.durum, 409);
    assert.deepEqual(kod.govde(), { kod: 'CAKISMA', mesaj: 'Bu kod başka bir depoda kullanılıyor.', alan: 'kod' });

    // Alan verilmeyen eşleme gövdeye alan koymaz; tekil dizin de kısıt gibi adıyla eşlenir.
    const ad = await uygulamaHatasiAl(acik().tx((db) => kisitKorumali(DEPO_KISITLARI, () => depoEkle(db, 'D-2', 'BIR'))));
    assert.equal(ad.durum, 409);
    assert.deepEqual(ad.govde(), { kod: 'CAKISMA', mesaj: 'Bu adda bir depo var.' });
    assert.equal(await depoSayisi('D-2'), 0);
  });

  test('bağımlı kayıt: 409 BAGIMLI_KAYIT, eşlemedeki ileti; bağımlısı olmayan silinir', async () => {
    const [dolu, bos] = await acik().tx(async (db) => {
      const ilk = await depoEkle(db, 'D-DOLU', 'Dolu');
      await rafEkle(db, ilk);
      return [ilk, await depoEkle(db, 'D-BOS', 'Boş')];
    });

    const hata = await uygulamaHatasiAl(acik().tx((db) => kisitKorumali(DEPO_KISITLARI, () => depoSil(db, dolu))));
    assert.equal(hata.durum, 409);
    assert.deepEqual(hata.govde(), { kod: 'BAGIMLI_KAYIT', mesaj: 'Bu depoda raf var; önce rafları kaldırın.' });
    assert.equal(await depoSayisi('D-DOLU'), 1);

    assert.equal(await acik().tx((db) => kisitKorumali(DEPO_KISITLARI, () => depoSil(db, bos))), true);
    assert.equal(await depoSayisi('D-BOS'), 0);
  });

  test('RESTRICT eylemli yabancı anahtar da bağımlı kayıttır (PostgreSQL 18 ayrı kodla bildirir)', async () => {
    const depo = await acik().tx(async (db) => {
      const id = await depoEkle(db, 'D-PALET', 'Paletli');
      await db.sorgu('INSERT INTO palet (depo_id) VALUES ($1)', [id]);
      return id;
    });

    const hata = await uygulamaHatasiAl(acik().tx((db) => kisitKorumali(DEPO_KISITLARI, () => depoSil(db, depo))));
    assert.equal(hata.durum, 409);
    assert.deepEqual(hata.govde(), { kod: 'BAGIMLI_KAYIT', mesaj: 'Bu depoda palet var; önce paletleri kaldırın.' });
    assert.equal(await depoSayisi('D-PALET'), 1);
  });

  test('denetim kısıtı: 422 GECERSIZ, eşlemedeki ileti ve alan', async () => {
    const hata = await uygulamaHatasiAl(acik().tx((db) => kisitKorumali(DEPO_KISITLARI, () => depoEkle(db, 'D-SIFIR', 'Sıfır', 0))));
    assert.equal(hata.durum, 422);
    assert.deepEqual(hata.govde(), { kod: 'GECERSIZ', mesaj: 'Sıra sıfırdan büyük olmalı.', alan: 'sira' });
  });

  test('eşlemede olmayan kısıt çevrilmez: veritabanı hatası kısıt adıyla aynen çıkar', async () => {
    // Önce eşlemedeki kısıt çevrilir: yoksa hiçbir şeyi çevirmeyen yardımcıda da geçerdi.
    await acik().tx((db) => depoEkle(db, 'D-ESLI', 'Eşli', 500));
    await uygulamaHatasiAl(acik().tx((db) => kisitKorumali(DEPO_KISITLARI, () => depoEkle(db, 'D-ESLI', 'Eşli iki'))));

    const tekil = await vtHatasiAl(acik().tx((db) => kisitKorumali(DEPO_KISITLARI, () => depoEkle(db, 'D-ESSIZ', 'Eşsiz', 500))));
    assert.deepEqual({ kod: tekil.code, kisit: tekil.constraint }, { kod: '23505', kisit: 'depo_sira_tek' });

    const denetim = await vtHatasiAl(acik().tx((db) => kisitKorumali(DEPO_KISITLARI, () => depoEkle(db, 'D-UST', 'Üst', 1000))));
    assert.deepEqual({ kod: denetim.code, kisit: denetim.constraint }, { kod: '23514', kisit: 'depo_sira_ust' });

    // Eşleme nesnesinin kalıtılan adları eşleme sayılmaz.
    const kalitilan = await vtHatasiAl(acik().tx((db) => kisitKorumali(DEPO_KISITLARI, () => depoEkle(db, 'D-KALIT', 'Kalıt', 999))));
    assert.deepEqual({ kod: kalitilan.code, kisit: kalitilan.constraint }, { kod: '23514', kisit: 'toString' });
  });

  test('boş geçilemez ihlali kısıt adı taşımaz: çevrilmez', async () => {
    const hata = await vtHatasiAl(acik().tx((db) => kisitKorumali(DEPO_KISITLARI, () => db.sorgu("INSERT INTO depo (kod, ad, sira) VALUES (NULL, 'Kodsuz', 1)"))));
    assert.deepEqual({ kod: hata.code, kisit: hata.constraint }, { kod: '23502', kisit: undefined });
  });

  test('kısıt hatası olmayan hata aynen geçer: uygulama hatası, sıradan hata, başka veritabanı hatası', async () => {
    const uygulama = new UygulamaHatasi('BULUNAMADI', 'Depo bulunamadı.');
    assert.equal(await hatayiAl(kisitKorumali(DEPO_KISITLARI, () => Promise.reject(uygulama))), uygulama);

    const siradan = new Error('beklenmeyen');
    assert.equal(await hatayiAl(kisitKorumali(DEPO_KISITLARI, () => Promise.reject(siradan))), siradan);

    const sozdizimi = await vtHatasiAl(acik().tx((db) => kisitKorumali(DEPO_KISITLARI, () => db.sorgu('SELEC 1'))));
    assert.equal(sozdizimi.code, '42601');
  });

  test('başka modülün yabancı anahtarı: silmede türün yedek iletisine düşer; yedek yoksa çevrilmez; ada göre eşleme yedeği ezer', async () => {
    const [sevkli, rafli, bos] = await acik().tx(async (db) => {
      const ilk = await depoEkle(db, 'D-SEVK', 'Sevkli');
      await db.sorgu('INSERT INTO sevkiyat (depo_id) VALUES ($1)', [ilk]);
      const ikinci = await depoEkle(db, 'D-RAFLI', 'Raflı');
      await rafEkle(db, ikinci);
      return [ilk, ikinci, await depoEkle(db, 'D-SERBEST', 'Serbest')];
    });
    const yedek = { BAGIMLI_KAYIT: DEPO_KULLANIMDA };

    const yedekli = await uygulamaHatasiAl(acik().tx((db) => kisitKorumali(DEPO_KISITLARI, () => depoSil(db, sevkli), yedek)));
    assert.equal(yedekli.durum, 409);
    assert.deepEqual(yedekli.govde(), { kod: 'BAGIMLI_KAYIT', mesaj: DEPO_KULLANIMDA });

    const yedeksiz = await vtHatasiAl(acik().tx((db) => kisitKorumali(DEPO_KISITLARI, () => depoSil(db, sevkli))));
    assert.deepEqual({ kod: yedeksiz.code, kisit: yedeksiz.constraint }, { kod: '23503', kisit: 'sevkiyat_depo_fk' });

    const adla = await uygulamaHatasiAl(acik().tx((db) => kisitKorumali(DEPO_KISITLARI, () => depoSil(db, rafli), yedek)));
    assert.deepEqual(adla.govde(), { kod: 'BAGIMLI_KAYIT', mesaj: 'Bu depoda raf var; önce rafları kaldırın.' });

    // Yedek yalnız kendi türüne uygulanır: bağımlı kayıt yedeği tekillik ihlalini çevirmez.
    const baskaTur = await vtHatasiAl(acik().tx((db) => kisitKorumali({}, () => depoEkle(db, 'D-SEVK', 'Sevkli iki'), yedek)));
    assert.equal(baskaTur.constraint, 'depo_kod_tek');
    const alanli = await uygulamaHatasiAl(acik().tx((db) =>
      kisitKorumali({}, () => depoEkle(db, 'D-SEVK', 'Sevkli üç'), { CAKISMA: { ileti: 'Bu bilgilerle bir depo var.', alan: 'kod' } })));
    assert.deepEqual(alanli.govde(), { kod: 'CAKISMA', mesaj: 'Bu bilgilerle bir depo var.', alan: 'kod' });

    assert.equal(await acik().tx((db) => kisitKorumali(DEPO_KISITLARI, () => depoSil(db, bos), yedek)), true);
    assert.deepEqual([await depoSayisi('D-SEVK'), await depoSayisi('D-RAFLI'), await depoSayisi('D-SERBEST')], [1, 1, 0]);
  });

  test('ertelenmiş kısıt bitişte denetlenir ve çevrilmez; yazmanın içinde hemen denetletilince çevrilir', async () => {
    const depoId = await acik().tx((db) => depoEkle(db, 'D-ETIKET', 'Etiketli'));
    const etiketle = (db: Db, etiket: string): Promise<unknown> => db.sorgu('INSERT INTO raf (depo_id, etiket) VALUES ($1, $2)', [depoId, etiket]);
    const etiketSayisi = async (): Promise<number> => (await acik().sorgu("SELECT 1 FROM raf WHERE etiket = 'R-1'")).length;
    await acik().tx((db) => kisitKorumali(DEPO_KISITLARI, () => etiketle(db, 'R-1')));

    let yazmaBitti = false;
    const bitiste = await vtHatasiAl(acik().tx((db) => kisitKorumali(DEPO_KISITLARI, async () => {
      await etiketle(db, 'R-1');
      yazmaBitti = true;
    })));
    assert.equal(yazmaBitti, true);
    assert.deepEqual({ kod: bitiste.code, kisit: bitiste.constraint }, { kod: '23505', kisit: 'raf_etiket_tek' });

    const hemen = await uygulamaHatasiAl(acik().tx((db) => kisitKorumali(DEPO_KISITLARI, async () => {
      await etiketle(db, 'R-1');
      await db.sorgu('SET CONSTRAINTS raf_etiket_tek IMMEDIATE');
    })));
    assert.deepEqual(hemen.govde(), { kod: 'CAKISMA', mesaj: 'Bu etiket başka bir rafta kullanılıyor.' });
    assert.equal(await etiketSayisi(), 1);
  });

  test('63 baytı aşan eşleme anahtarı programcı hatasıdır: yazma koşmadan reddedilir; 63 bayt kabul edilir', async () => {
    const sinirda = `${'ş'.repeat(31)}a`;
    const asan = `${'ş'.repeat(31)}ab`;
    assert.deepEqual([Buffer.byteLength(sinirda), asan.length], [63, 33]);

    let kostu = 0;
    const is = (): Promise<string> => { kostu += 1; return Promise.resolve('tamam'); };
    assert.equal(await kisitKorumali({ [sinirda]: 'ileti' }, is), 'tamam');
    assert.equal(kostu, 1);

    const hata = await hatayiAl(kisitKorumali({ depo_kod_tek: 'ileti', [asan]: 'ileti' }, is));
    assert.ok(hata instanceof Error && !(hata instanceof UygulamaHatasi), String(hata));
    assert.equal(hata.message.includes(asan), true);
    assert.equal(kostu, 1);
  });

  test('ihlal transaction\'ı iptal eder: çevrilen hata yakalanıp sürdürülürse sonraki sorgu reddedilir, önceki yazı da kalmaz', async () => {
    await acik().tx((db) => depoEkle(db, 'D-VAR', 'Var'));

    const sonraki = await vtHatasiAl(acik().tx(async (db) => {
      await depoEkle(db, 'D-ONCE', 'Önce');
      await uygulamaHatasiAl(kisitKorumali(DEPO_KISITLARI, () => depoEkle(db, 'D-VAR', 'Var iki')));
      return db.sorgu('SELECT 1');
    }));
    assert.equal(sonraki.code, '25P02');
    assert.equal(await depoSayisi('D-ONCE'), 0);
  });
});
