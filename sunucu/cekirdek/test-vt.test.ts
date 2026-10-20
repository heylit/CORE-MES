import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import { ayarOku } from './ayar.ts';
import { ARTIK_SEMA_YASI_SN, TEMIZLIK_KILIDI, sifirlamaHazirla, testSemaAdi, testSemasiAc, testVeritabaniKur } from './test-vt.ts';
import type { TestVeritabani } from './test-vt.ts';

describe('test şeması temizliği (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;

  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const varMi = async (sema: string): Promise<boolean | undefined> =>
    (await acik().vt.tek<{ var: boolean }>('SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = $1) AS var', [sema]))?.var;
  // İçi dolu şema: boş şemayı silen ama dolu şemada takılan temizlik yakalansın.
  // Tek transaction: başka bir koşunun açılış temizliği yarım kurulmuş şemayı göremez, araya giremez.
  const kur = async (sema: string): Promise<void> => {
    await acik().sahip.tx(async (db) => {
      await db.sorgu(`CREATE SCHEMA ${sema}`);
      await db.sorgu(`CREATE TABLE ${sema}.kalem (id int PRIMARY KEY)`);
      await db.sorgu(`INSERT INTO ${sema}.kalem (id) VALUES (1)`);
    });
  };
  const yasli = (onek: string, yasSn: number): string => testSemaAdi(onek, Date.now() - yasSn * 1000);
  const birAcilis = async (): Promise<void> => {
    const yeni = await testSemasiAc('acilis');
    await yeni.kaldir();
  };

  before(async () => {
    ortam = await testSemasiAc('temizlik');
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('açılan şema test veritabanındadır ve adı t_ ile başlar', async () => {
    const satir = await acik().vt.tek<{ veritabani: string; sema: string }>('SELECT current_database() AS veritabani, current_schema() AS sema');
    assert.equal(satir?.veritabani, acik().ayar.pgTestVeritabani);
    assert.notEqual(satir?.veritabani, ayarOku().pg.veritabani);
    assert.equal(satir?.sema, acik().sema);
    assert.equal(acik().sema.startsWith('t_temizlik_'), true);
  });

  // Paralel açılan başka bir test dosyası ya da koşu artığı bizden önce silebilir; bu yüzden silinmeden önce
  // "duruyor" diye bakılmaz. Şemanın kurulduğunu kurulum transaction'ının hatasız bitmesi gösterir.
  test('açılış, eşikten eski ve adında zaman olmayan t_ şemalarını içindekilerle siler', async () => {
    const eski = yasli('eski', ARTIK_SEMA_YASI_SN + 60);
    const zamansiz = `t_zamansiz_${randomBytes(6).toString('hex')}`;
    await kur(eski);
    await kur(zamansiz);
    await birAcilis();
    assert.deepEqual({ eski: await varMi(eski), zamansiz: await varMi(zamansiz) }, { eski: false, zamansiz: false });
  });

  // Hepsi tek transaction'da silinseydi ilk artığın silinmesi, sıradaki kilitli artık beklenirken görünmezdi.
  // Ad sırası belirleyicidir: temizlik ada göre ilerler, kilitli olan sonra gelir.
  test('açılış her artığı kendi transaction\'ında siler: sıradaki artık kilitliyken önceki silinmiş olur', { timeout: 60_000 }, async () => {
    const onceki = yasli('0a_artik', ARTIK_SEMA_YASI_SN + 60);
    const kilitli = yasli('0b_artik', ARTIK_SEMA_YASI_SN + 60);
    await kur(onceki);
    await kur(kilitli);
    let birak: () => void = () => undefined;
    const serbest = new Promise<void>((coz) => { birak = coz; });
    let tutuldu: () => void = () => undefined;
    const kilitlendi = new Promise<void>((coz) => { tutuldu = coz; });
    const tutan = acik().sahip.tx(async (db) => {
      await db.sorgu(`LOCK TABLE ${kilitli}.kalem IN ACCESS EXCLUSIVE MODE`);
      tutuldu();
      await serbest;
    });
    let acilisBitti = false;
    let acilis: Promise<void> | undefined;
    try {
      await Promise.race([kilitlendi, tutan]);
      acilis = birAcilis().finally(() => { acilisBitti = true; });
      acilis.catch(() => undefined);
      const son = performance.now() + 30_000;
      while ((await varMi(onceki)) === true && !acilisBitti && performance.now() < son) await new Promise((coz) => setTimeout(coz, 20));
      assert.deepEqual({ onceki: await varMi(onceki), kilitli: await varMi(kilitli) }, { onceki: false, kilitli: true });
    } finally {
      birak();
      await Promise.allSettled([tutan, acilis]);
    }
    await acilis;
    assert.equal(await varMi(kilitli), false);
  });

  test('açılış, eşikten yeni şemaya (başka koşunun canlı şeması) ve t_ ile başlamayan şemaya dokunmaz', async () => {
    const canli = yasli('canli', ARTIK_SEMA_YASI_SN - 60);
    const baska = `tkoruma_${randomBytes(6).toString('hex')}`;
    await kur(canli);
    await kur(baska);
    try {
      await birAcilis();
      for (const sema of [canli, baska]) {
        assert.equal(await varMi(sema), true, sema);
        assert.deepEqual(await acik().vt.sorgu(`SELECT id FROM ${sema}.kalem`), [{ id: 1 }], sema);
      }
    } finally {
      await acik().sahip.sorgu(`DROP SCHEMA IF EXISTS ${canli} CASCADE`);
      await acik().sahip.sorgu(`DROP SCHEMA IF EXISTS ${baska} CASCADE`);
    }
  });

  // Eşzamanlı kapanışlar sıraya girmezse her biri tam şemanın kilitlerini aynı anda tutar ve kilit tablosu dolar.
  test('kapanış silmesi temizlik sırasını bekler: sıra başkasındayken şema durur, sıra boşalınca silinir', { timeout: 60_000 }, async () => {
    const yeni = await testSemasiAc('kapanis');
    let birak: () => void = () => undefined;
    const serbest = new Promise<void>((coz) => { birak = coz; });
    let tutuldu: () => void = () => undefined;
    const kilitlendi = new Promise<void>((coz) => { tutuldu = coz; });
    const tutan = acik().sahip.tx(async (db) => {
      await db.sorgu('SELECT pg_advisory_xact_lock($1)', [TEMIZLIK_KILIDI]);
      tutuldu();
      await serbest;
    });
    let kapanisBitti = false;
    let kapanis: Promise<void> | undefined;
    try {
      await Promise.race([kilitlendi, tutan]);
      kapanis = yeni.kaldir().finally(() => { kapanisBitti = true; });
      kapanis.catch(() => undefined);
      await new Promise((coz) => setTimeout(coz, 500));
      assert.deepEqual({ bitti: kapanisBitti, var: await varMi(yeni.sema) }, { bitti: false, var: true });
    } finally {
      birak();
      await Promise.allSettled([tutan, kapanis]);
    }
    await kapanis;
    assert.equal(await varMi(yeni.sema), false);
  });

  // Sıra beklemesi bağlantının sorgu süre sınırına sayılmaz: sıradakilerin sayısı eşzamanlı dosya sayısıyla büyür,
  // tek silme kısadır ama sırayı bekleyen kapanış süre sınırını aşıp 57014 ile düşüyordu (CI sunucu-test, logo-goc.test.ts).
  test('açılış ve kapanış temizlik sırasını sorgu süre sınırından uzun bekleyebilir', { timeout: 60_000 }, async () => {
    const KISA_MS = '700';
    const once = { sorgu: process.env['TMIV2_PG_SORGU_SURE_MS'], okuma: process.env['TMIV2_PG_OKUMA_SURE_MS'] };
    const kisaAc = async (onek: string): Promise<TestVeritabani> => {
      process.env['TMIV2_PG_SORGU_SURE_MS'] = KISA_MS;
      process.env['TMIV2_PG_OKUMA_SURE_MS'] = KISA_MS;
      try {
        return await testSemasiAc(onek);
      } finally {
        for (const [ad, deger] of [['TMIV2_PG_SORGU_SURE_MS', once.sorgu], ['TMIV2_PG_OKUMA_SURE_MS', once.okuma]] as const) {
          if (deger === undefined) delete process.env[ad];
          else process.env[ad] = deger;
        }
      }
    };
    const siraTut = (): { tutan: Promise<void>; kilitlendi: Promise<void>; birak: () => void } => {
      let birak: () => void = () => undefined;
      const serbest = new Promise<void>((coz) => { birak = coz; });
      let tutuldu: () => void = () => undefined;
      const kilitlendi = new Promise<void>((coz) => { tutuldu = coz; });
      const tutan = acik().sahip.tx(async (db) => {
        await db.sorgu('SELECT pg_advisory_xact_lock($1)', [TEMIZLIK_KILIDI]);
        tutuldu();
        await serbest;
      });
      return { tutan, kilitlendi, birak };
    };
    const bekle = (ms: number): Promise<void> => new Promise((coz) => setTimeout(coz, ms));

    const yeni = await kisaAc('kisasure');
    const kapanisSirasi = siraTut();
    await Promise.race([kapanisSirasi.kilitlendi, kapanisSirasi.tutan]);
    const kapanis = yeni.kaldir();
    kapanis.catch(() => undefined);
    await bekle(Number(KISA_MS) * 2);
    kapanisSirasi.birak();
    await kapanisSirasi.tutan;
    await kapanis;
    assert.equal(await varMi(yeni.sema), false);

    const artik = yasli('0c_artik', ARTIK_SEMA_YASI_SN + 60);
    await kur(artik);
    const acilisSirasi = siraTut();
    await Promise.race([acilisSirasi.kilitlendi, acilisSirasi.tutan]);
    const acilis = kisaAc('kisasure2');
    acilis.catch(() => undefined);
    await bekle(Number(KISA_MS) * 2);
    acilisSirasi.birak();
    await acilisSirasi.tutan;
    await (await acilis).kaldir();
    assert.equal(await varMi(artik), false);
  });
});

describe('test şemasını göç sonrası duruma döndürme (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  before(async () => { ortam = await testVeritabaniKur('sifirla'); });
  after(async () => { await ortam?.kaldir(); });
  const acik = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  // Bütün tabloların içeriği ve dizi değerleri tek metinde: karşılaştırma satır sırasından bağımsızdır.
  const durum = async (): Promise<string> => {
    const { sahip } = acik();
    const tablolar = await sahip.sorgu<{ ad: string }>(
      "SELECT relname::text AS ad FROM pg_class WHERE relnamespace = current_schema()::regnamespace AND relkind = 'r' ORDER BY 1");
    const parcalar: string[] = [];
    for (const { ad } of tablolar) {
      const satir = await sahip.tek<{ m: string | null }>(`SELECT string_agg(t::text, '|' ORDER BY t::text) AS m FROM "${ad}" t`);
      parcalar.push(`${ad}=${satir?.m ?? ''}`);
    }
    const diziler = await sahip.sorgu<{ ad: string; deger: string | null }>(
      'SELECT sequencename::text AS ad, last_value::text AS deger FROM pg_sequences WHERE schemaname = current_schema() ORDER BY 1');
    return JSON.stringify({ parcalar, diziler });
  };

  test('testin yazdığı, sildiği ve ilerlettiği her şey geri alınır; tohum satırları ve dizi değerleri göç sonrasıyla aynıdır', async () => {
    const { vt, sahip } = acik();
    const ilk = await durum();
    const sifirla = await sifirlamaHazirla(acik());
    const kisi = await vt.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Kişi') RETURNING id");
    const alet = await vt.tek<{ id: number }>("INSERT INTO olcu_aleti (no, tur_id) SELECT 'S-1', min(id) FROM olcu_aleti_turu RETURNING id");
    await vt.sorgu("INSERT INTO kalibrasyon_kaydi (alet_id, tarih, kisi_id, sonuc) VALUES ($1, '2026-10-01', $2, 'uygun')", [alet?.id, kisi?.id]);
    await sahip.sorgu('DELETE FROM rol_islemi WHERE ctid IN (SELECT ctid FROM rol_islemi LIMIT 2)');
    assert.notEqual(await durum(), ilk);

    await sifirla();
    assert.equal(await durum(), ilk);
    // Dizi de geri döndü: ilk kişi yine aynı kimliği alır.
    assert.equal((await vt.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Yeniden') RETURNING id"))?.id, kisi?.id);
    await sifirla();
    assert.equal(await durum(), ilk);
  });

  test('sıfırlamadan sonra tetikler yeniden açıktır: yalnız ekleme kuralı kalibrasyon kaydının silinmesini yine reddeder', async () => {
    const { vt, sahip } = acik();
    const sifirla = await sifirlamaHazirla(acik());
    const kisi = await vt.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Kişi') RETURNING id");
    const alet = await vt.tek<{ id: number }>("INSERT INTO olcu_aleti (no, tur_id) SELECT 'S-2', min(id) FROM olcu_aleti_turu RETURNING id");
    await vt.sorgu("INSERT INTO kalibrasyon_kaydi (alet_id, tarih, kisi_id, sonuc) VALUES ($1, '2026-10-01', $2, 'uygun')", [alet?.id, kisi?.id]);
    await sifirla();
    const kisi2 = await vt.tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Deneme Kişi') RETURNING id");
    const alet2 = await vt.tek<{ id: number }>("INSERT INTO olcu_aleti (no, tur_id) SELECT 'S-3', min(id) FROM olcu_aleti_turu RETURNING id");
    await vt.sorgu("INSERT INTO kalibrasyon_kaydi (alet_id, tarih, kisi_id, sonuc) VALUES ($1, '2026-10-01', $2, 'uygun')", [alet2?.id, kisi2?.id]);
    await assert.rejects(sahip.sorgu('DELETE FROM kalibrasyon_kaydi'), /kalibrasyon/i);
    await assert.rejects(sahip.sorgu('TRUNCATE kalibrasyon_kaydi CASCADE'), /kalibrasyon/i);
    await sifirla();
  });
});
