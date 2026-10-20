import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { kisilerinIslemleri, kullaniciYukle, yoneticiOlustur } from './disari.ts';
import { hesapAc, kisiEkle, kisiPasifeAl, rolAl, rolAta } from './servis.ts';

describe('kisilerinIslemleri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  const k: Record<string, number> = {};

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const rolId = async (kod: string): Promise<number> =>
    (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))?.id ?? 0;

  before(async () => {
    ortam = await testVeritabaniKur('kisiler_islemleri');
    const v = ortam.vt;
    k.yonetici = await v.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    const hesapli = async (ad: string, kullaniciAdi: string, rol: string): Promise<number> =>
      v.tx(async (db) => {
        const id = await kisiEkle(db, { ad });
        await hesapAc(db, k.yonetici ?? 0, id, { kullaniciAdi, parola: 'dogru-parola-1', rolId: await rolId(rol) });
        return id;
      });
    k.operator = await hesapli('Operatör Deneme', 'operator.deneme', 'operator');
    k.cokRollu = await hesapli('Çok Rollü', 'cok.rollu', 'depo');
    await v.tx(async (db) => rolAta(db, k.yonetici ?? 0, k.cokRollu ?? 0, await rolId('planlama_proje')));
    k.pasif = await hesapli('Pasif Deneme', 'pasif.deneme', 'operator');
    await v.tx((db) => kisiPasifeAl(db, k.yonetici ?? 0, k.pasif ?? 0));
    k.girissiz = await v.tx((db) => kisiEkle(db, { ad: 'Girişsiz Deneme' }));
    await v.tx(async (db) => rolAta(db, k.yonetici ?? 0, k.girissiz ?? 0, await rolId('operator')));
  });
  after(async () => {
    await ortam?.kaldir();
  });

  test('her aktif girişli kişi için sonuç kullaniciYukle ile aynıdır; tek sorgu', async () => {
    let sorgu = 0;
    const harita = await vt().tx((db) => {
      const sarmal: Db = {
        sorgu: (sql, parametreler) => { sorgu += 1; return db.sorgu(sql, parametreler); },
        tek: (sql, parametreler) => { sorgu += 1; return db.tek(sql, parametreler); },
      };
      return kisilerinIslemleri(sarmal);
    });
    assert.equal(sorgu, 1);
    assert.deepEqual([...harita.keys()].sort((a, b) => a - b), [k.yonetici, k.operator, k.cokRollu].sort((a, b) => (a ?? 0) - (b ?? 0)));
    for (const id of harita.keys()) {
      const tekTek = await vt().tx((db) => kullaniciYukle(db, id));
      assert.deepEqual(harita.get(id), tekTek?.islemler, String(id));
    }
  });

  test('bayraklı kişi bütün işlemleri alır; çok rollü kişi rollerinin işlem satırlarının birleşimini alır', async () => {
    const harita = await vt().tx((db) => kisilerinIslemleri(db));
    assert.deepEqual(harita.get(k.yonetici ?? 0), [...ISLEMLER]);
    const beklenen = await vt().sorgu<{ islem: string }>(
      "SELECT DISTINCT ri.islem FROM rol_islemi ri JOIN rol r ON r.id = ri.rol_id WHERE r.kod IN ('depo', 'planlama_proje')",
    );
    assert.deepEqual([...(harita.get(k.cokRollu ?? 0) ?? [])].sort(), beklenen.map((s) => s.islem).filter((i) => (ISLEMLER as readonly string[]).includes(i)).sort());
    assert.notDeepEqual(harita.get(k.cokRollu ?? 0), harita.get(k.operator ?? 0));
  });

  test('pasif ve girişsiz kişi haritada yoktur; rol alınınca harita güncel rollerden okunur', async () => {
    const harita = await vt().tx((db) => kisilerinIslemleri(db));
    assert.equal(harita.has(k.pasif ?? 0), false);
    assert.equal(harita.has(k.girissiz ?? 0), false);
    await vt().tx(async (db) => rolAl(db, k.yonetici ?? 0, k.cokRollu ?? 0, await rolId('planlama_proje')));
    const sonra = await vt().tx((db) => kisilerinIslemleri(db));
    assert.deepEqual(sonra.get(k.cokRollu ?? 0), (await vt().tx((db) => kullaniciYukle(db, k.cokRollu ?? 0)))?.islemler);
  });
});
