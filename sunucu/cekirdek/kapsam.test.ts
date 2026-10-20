import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { KAPSAM_DISI_ILETISI } from '#paylasilan/hata.ts';
import type { Db, Veritabani } from './db.ts';
import { UygulamaHatasi } from './hata.ts';
import { HICBIR_YER, SAHTE_KAPSAM, kapsamDisiysaReddet, kapsamSuzgeci, kapsamdaMi, kisininKapsami } from './kapsam.ts';
import type { Kapsam } from './kapsam.ts';
import { testSemasiAc } from './test-vt.ts';

function reddi(is: () => void): UygulamaHatasi {
  try {
    is();
  } catch (hata) {
    assert.ok(hata instanceof UygulamaHatasi, `UygulamaHatasi beklenirdi: ${String(hata)}`);
    return hata;
  }
  throw new Error('Ret beklenirdi, geçti.');
}

// Sorgu atmayan kaynakla kullanılan, transaction yerine geçen nesne (kök veritabanı değil: `tx` yok).
const sahteTx = (): Db => ({
  sorgu: () => Promise.reject(new Error('Sorgu beklenmiyordu.')),
  tek: () => Promise.reject(new Error('Sorgu beklenmiyordu.')),
});

// Kapsam yalnız kaynaktan üretilir; saf testler de o yoldan kurar.
const kapsamKur = (...kisit: number[]): Promise<Kapsam> => kisininKapsami(sahteTx(), 1, () => Promise.resolve(kisit));

// Çağrılmaz; yalnız derlenir. Ham dizi ya da null kapsam yerine verilirse derleme kırılmalıdır.
export function tipDenetimi(): void {
  // @ts-expect-error ham kısıt listesi kapsam değildir
  kapsamdaMi([3], 3);
  // @ts-expect-error ham kısıt listesi kapsam değildir
  kapsamDisiysaReddet([3], 3);
  // @ts-expect-error ham kısıt listesi kapsam değildir
  kapsamSuzgeci([]);
  // @ts-expect-error null elle sınırsız kapsam diye verilemez
  kapsamSuzgeci(null);
  // @ts-expect-error elle kurulan nesne kapsam değildir
  kapsamdaMi({ izinli: null }, 3);
  // @ts-expect-error yayılan kapsam kapsam değildir: içerik kopyaya geçmez
  const yayilan: Kapsam = { ...HICBIR_YER, izinli: null };
  // @ts-expect-error kapsamın içeriği dışarıdan okunamaz
  const icerik: unknown = HICBIR_YER.izinli;
  return void [yayilan, icerik];
}

test('kopyalanarak kurulan kapsam derlense de yardımcılarca reddedilir: sınırsız kapsam elle üretilemez', () => {
  // Object.assign dönüş tipi kapsamı içerdiği için derlenir; içerik kopyaya geçmediğinden çalışma zamanında durur.
  const kopya: Kapsam = Object.assign({}, HICBIR_YER, { izinli: null });
  const sahte = new RegExp(SAHTE_KAPSAM);
  // Önce gerçek kapsamın kabul edildiği görülür.
  assert.deepEqual(kapsamSuzgeci(HICBIR_YER), []);
  assert.throws(() => kapsamSuzgeci(kopya), sahte);
  assert.throws(() => kapsamdaMi(kopya, 7), sahte);
  assert.throws(() => kapsamdaMi(kopya, null), sahte);
  assert.throws(() => kapsamDisiysaReddet(kopya, 7), sahte);
  assert.throws(() => kapsamSuzgeci({ ...HICBIR_YER } as Kapsam), sahte);
});

test('kısıttan kapsam: boş kısıt listesi sınırsızdır, dolu liste yinelenmeden izinlilerdir', async () => {
  assert.equal(kapsamSuzgeci(await kapsamKur()), null);
  assert.deepEqual(kapsamSuzgeci(await kapsamKur(5, 3, 5)), [5, 3]);
});

test('kapsamda mı: sınırsız her yerde, izinli yalnız listesinde; boş kapsam hiçbir yerde', async () => {
  const izinli = await kapsamKur(3, 5);
  assert.equal(kapsamdaMi(await kapsamKur(), 7), true);
  assert.equal(kapsamdaMi(izinli, 5), true);
  assert.equal(kapsamdaMi(izinli, 7), false);
  assert.equal(kapsamdaMi(HICBIR_YER, 7), false);
});

test('iş merkezi olmayan kayıt (null) herkesin kapsamındadır: kısıtlı ve boş kapsamlı kişi de yazar', async () => {
  const izinli = await kapsamKur(3, 5);
  // Önce kısıtın uygulandığı görülür.
  assert.equal(reddi(() => kapsamDisiysaReddet(izinli, 7)).durum, 403);
  assert.equal(kapsamdaMi(izinli, null), true);
  assert.equal(kapsamdaMi(HICBIR_YER, null), true);
  kapsamDisiysaReddet(izinli, null);
  kapsamDisiysaReddet(HICBIR_YER, null);
});

test('yazma denetimi: kapsam içi ve sınırsız geçer; kapsam dışı ve boş kapsam 403, tek ileti', async () => {
  const izinli = await kapsamKur(3, 5);
  kapsamDisiysaReddet(await kapsamKur(), 7);
  kapsamDisiysaReddet(izinli, 3);

  for (const kapsam of [izinli, HICBIR_YER]) {
    const hata = reddi(() => kapsamDisiysaReddet(kapsam, 7));
    assert.equal(hata.durum, 403);
    assert.deepEqual(hata.govde(), { kod: 'YETKI_YOK', mesaj: KAPSAM_DISI_ILETISI });
  }
  assert.equal(KAPSAM_DISI_ILETISI, 'Bu istasyonun iş merkezinde çalışma yetkiniz yok.');
});

test('süzgeç parametresi: sınırsız null, boş kapsam boş dizi (ikisi ayrı), izinliler her çağrıda yeni dizi', async () => {
  assert.equal(kapsamSuzgeci(await kapsamKur()), null);
  assert.deepEqual(kapsamSuzgeci(HICBIR_YER), []);
  const kapsam = await kapsamKur(3, 5);
  const parametre = kapsamSuzgeci(kapsam);
  assert.deepEqual(parametre, [3, 5]);
  parametre?.push(7);
  assert.deepEqual(kapsamSuzgeci(kapsam), [3, 5]);
});

test('okunamayan kapsam bellekte kalmaz: aynı transaction içinde sonraki çağrı kaynağı yeniden okur', async () => {
  const db = sahteTx();
  let cagri = 0;
  const kaynak = (): Promise<number[]> => {
    cagri += 1;
    return cagri === 1 ? Promise.reject(new Error('kaynak okunamadı')) : Promise.resolve([3]);
  };
  await assert.rejects(kisininKapsami(db, 1, kaynak), /kaynak okunamadı/);
  assert.deepEqual(kapsamSuzgeci(await kisininKapsami(db, 1, kaynak)), [3]);
  // Başarılı okuma belleklenir.
  assert.deepEqual(kapsamSuzgeci(await kisininKapsami(db, 1, kaynak)), [3]);
  assert.equal(cagri, 2);
});

test('aynı transaction içinde iki ayrı kaynak birbirinin belleğini kullanmaz', async () => {
  const db = sahteTx();
  const torna = (): Promise<number[]> => Promise.resolve([10]);
  const freze = (): Promise<number[]> => Promise.resolve([20]);
  assert.deepEqual(kapsamSuzgeci(await kisininKapsami(db, 1, torna)), [10]);
  assert.deepEqual(kapsamSuzgeci(await kisininKapsami(db, 1, freze)), [20]);
  assert.deepEqual(kapsamSuzgeci(await kisininKapsami(db, 1, torna)), [10]);
});

interface Is {
  id: number;
  isMerkeziId: number | null;
  durum: string;
}

const MUAF = 1;
const KISITSIZ = 2;
const KISITLI = 3;
const TORNA = 10;
const FREZE = 20;

// Kısıtın sahibi modülün `disari.ts` dosyasında duracak kaynak: muaf kişide ve kısıt satırı olmayanda boş liste.
// Muafiyet burada sahtedir; gerçek bayrak yolu kısıtın sahibi modülün testlerinde ölçülür.
let kaynakCagrisi = 0;
const kisitiVer = async (db: Db, kisiId: number): Promise<number[]> => {
  kaynakCagrisi += 1;
  const muaf = await db.tek('SELECT 1 AS var FROM muaf_kisi WHERE kisi_id = $1', [kisiId]);
  if (muaf !== null) return [];
  const satirlar = await db.sorgu<{ id: number }>('SELECT is_merkezi_id AS id FROM kisit WHERE kisi_id = $1 ORDER BY 1', [kisiId]);
  return satirlar.map((s) => s.id);
};

// Bir modülün `sorgular.ts` dosyasında duracak sorgular: kapsam koşulunun SQL metni modüldedir.
const isleriGetir = (db: Db, izinli: number[] | null): Promise<Is[]> =>
  db.sorgu<Is>(
    `SELECT id, is_merkezi_id AS "isMerkeziId", durum FROM is_kaydi
      WHERE ($1::int[] IS NULL OR is_merkezi_id IS NULL OR is_merkezi_id = ANY($1::int[])) ORDER BY id`,
    [izinli],
  );

// Yazma komutu satırı kilitler; kapsam denetimi kilitten sonra, durum kuralından önce gelir.
const isKilitle = (db: Db, id: number): Promise<Is | null> =>
  db.tek<Is>('SELECT id, is_merkezi_id AS "isMerkeziId", durum FROM is_kaydi WHERE id = $1 FOR UPDATE', [id]);

const isBul = (db: Db, id: number): Promise<Is | null> =>
  db.tek<Is>('SELECT id, is_merkezi_id AS "isMerkeziId", durum FROM is_kaydi WHERE id = $1', [id]);

// Bir modülün `servis.ts` dosyasında duracak iki akış: yazma komutu ve liste.
async function isiBaslat(db: Db, kisiId: number, id: number): Promise<void> {
  const is = await isKilitle(db, id);
  if (is === null) throw new Error('İş yok.');
  kapsamDisiysaReddet(await kisininKapsami(db, kisiId, kisitiVer), is.isMerkeziId);
  if (is.durum !== 'planli') throw new Error('Yalnız planlı iş başlatılır.');
  await db.sorgu("UPDATE is_kaydi SET durum = 'basladi' WHERE id = $1", [id]);
}

const isleriListele = async (db: Db, kisiId: number): Promise<number[]> =>
  (await isleriGetir(db, kapsamSuzgeci(await kisininKapsami(db, kisiId, kisitiVer)))).map((i) => i.id);

describe('veri kapsamı (gerçek PostgreSQL)', () => {
  let vt: Veritabani | undefined;
  let sahip: Veritabani | undefined;
  let kaldir: (() => Promise<void>) | undefined;

  const acik = (): Veritabani => {
    if (!vt) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return vt;
  };
  const durum = async (id: number): Promise<string | undefined> => (await isBul(acik(), id))?.durum;
  const baslat = (kisiId: number, id: number): Promise<void> => acik().tx((db) => isiBaslat(db, kisiId, id));
  const reddiAl = async (is: Promise<unknown>): Promise<UygulamaHatasi> => {
    const hata = await is.then(() => null, (h: unknown) => h);
    assert.ok(hata instanceof UygulamaHatasi, `UygulamaHatasi beklenirdi: ${String(hata)}`);
    return hata;
  };

  before(async () => {
    const ortam = await testSemasiAc('kapsam');
    ({ kaldir, vt, sahip } = ortam);
    await ortam.sahip.sorgu('CREATE TABLE kisit (kisi_id int NOT NULL, is_merkezi_id int NOT NULL, PRIMARY KEY (kisi_id, is_merkezi_id))');
    await ortam.sahip.sorgu('CREATE TABLE muaf_kisi (kisi_id int PRIMARY KEY)');
    await ortam.sahip.sorgu("CREATE TABLE is_kaydi (id int PRIMARY KEY, is_merkezi_id int, durum text NOT NULL DEFAULT 'planli')");
  });

  beforeEach(async () => {
    if (!sahip) return;
    await sahip.sorgu('TRUNCATE kisit, muaf_kisi, is_kaydi');
    await sahip.sorgu('INSERT INTO is_kaydi (id, is_merkezi_id) VALUES (1, $1), (2, $2), (3, NULL)', [TORNA, FREZE]);
    await sahip.sorgu('INSERT INTO kisit (kisi_id, is_merkezi_id) VALUES ($1, $2), ($3, $2)', [KISITLI, TORNA, MUAF]);
    await sahip.sorgu('INSERT INTO muaf_kisi (kisi_id) VALUES ($1)', [MUAF]);
    kaynakCagrisi = 0;
  });

  after(async () => {
    await kaldir?.();
  });

  test('yazma komutu: kısıtlı kişi kapsamındaki işi başlatır; kapsam dışındaki 403, tek ileti, satır değişmez', async () => {
    await baslat(KISITLI, 1);
    assert.equal(await durum(1), 'basladi');

    const hata = await reddiAl(baslat(KISITLI, 2));
    assert.equal(hata.durum, 403);
    assert.deepEqual(hata.govde(), { kod: 'YETKI_YOK', mesaj: KAPSAM_DISI_ILETISI });
    assert.equal(await durum(2), 'planli');
  });

  test('kapsam dışı kişi kaydın durumunu öğrenmez: başlamış işte de durum kuralı değil 403 döner', async () => {
    await baslat(KISITSIZ, 2);
    assert.equal(await durum(2), 'basladi');
    assert.equal((await reddiAl(baslat(KISITLI, 2))).durum, 403);
  });

  test('kısıt satırı olmayan kişi sınırsızdır; muaf kişi kısıt satırı kayıtlı olsa da sınırsızdır', async () => {
    // Önce kısıtın gerçekten uygulandığı görülür: aynı satırlar muaf olmayan kişide reddettirir.
    assert.equal((await reddiAl(baslat(KISITLI, 2))).durum, 403);

    await baslat(KISITSIZ, 2);
    assert.equal(await durum(2), 'basladi');
    await baslat(MUAF, 1);
    assert.equal(await durum(1), 'basladi');
    assert.deepEqual(await acik().okumaTx((db) => isleriListele(db, MUAF)), [1, 2, 3]);
    assert.deepEqual(await acik().okumaTx((db) => isleriListele(db, KISITSIZ)), [1, 2, 3]);
  });

  test('liste: kısıtlı kişi kapsamındaki ve iş merkezi olmayan satırları görür; sınırsız hepsini, boş kapsam yalnız iş merkezi olmayanı', async () => {
    assert.deepEqual(await acik().okumaTx((db) => isleriListele(db, KISITLI)), [1, 3]);
    assert.deepEqual(await acik().okumaTx((db) => isleriListele(db, KISITSIZ)), [1, 2, 3]);
    assert.deepEqual((await isleriGetir(acik(), kapsamSuzgeci(HICBIR_YER))).map((i) => i.id), [3]);
  });

  test('iş merkezi olmayan işi kısıtlı kişi başlatır', async () => {
    await baslat(KISITLI, 3);
    assert.equal(await durum(3), 'basladi');
  });

  test('kapsam transaction içinde bir kez okunur ve tutarlıdır; yeni transaction güncel kısıtı görür', async () => {
    const ilk = await acik().tx(async (db) => {
      const once = await kisininKapsami(db, KISITLI, kisitiVer);
      await db.sorgu('INSERT INTO kisit (kisi_id, is_merkezi_id) VALUES ($1, $2)', [KISITLI, FREZE]);
      const sonra = await kisininKapsami(db, KISITLI, kisitiVer);
      const baskasi = await kisininKapsami(db, KISITSIZ, kisitiVer);
      return { once: kapsamSuzgeci(once), sonra: kapsamSuzgeci(sonra), baskasi: kapsamSuzgeci(baskasi) };
    });
    assert.deepEqual(ilk, { once: [TORNA], sonra: [TORNA], baskasi: null });
    assert.equal(kaynakCagrisi, 2, 'kişi başına bir okuma');

    assert.deepEqual(kapsamSuzgeci(await acik().tx((db) => kisininKapsami(db, KISITLI, kisitiVer))), [TORNA, FREZE]);
    assert.equal(kaynakCagrisi, 3);
  });

  test('kök veritabanı nesnesinde bellekleme yok: sonradan eklenen kısıt hemen görülür', async () => {
    assert.equal(kapsamSuzgeci(await kisininKapsami(acik(), KISITSIZ, kisitiVer)), null);
    await acik().sorgu('INSERT INTO kisit (kisi_id, is_merkezi_id) VALUES ($1, $2)', [KISITSIZ, TORNA]);
    assert.deepEqual(kapsamSuzgeci(await kisininKapsami(acik(), KISITSIZ, kisitiVer)), [TORNA]);
    assert.equal(kaynakCagrisi, 2);
  });
});
