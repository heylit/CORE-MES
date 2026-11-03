import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { calismaTakvimleri } from './disari.ts';

// 1970 a (kart 1977): ataması olmayan, yalnız yetkinliği olan kişi yetkin olduğu istasyonun iş merkezinin takvimiyle, kendi vardiyasında
// çalışır. Birden çok yetkin istasyonda önce insanlı istasyon, sonra en küçük kimlik; pasif istasyon sayılmaz. Veriler uydurmadır.
const ARALIK = { baslangic: '2099-10-05', bitis: '2099-10-11' };

describe('vardiya (gerçek PostgreSQL): yetkinlikten kişi takvimi (1970 a)', () => {
  let ortam: TestVeritabani | undefined;
  let sayac = 0;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const tek = async (sql: string, p: unknown[] = []): Promise<number> => (await o().sahip.tek<{ id: number }>(sql, p))!.id;
  const merkez = () => tek('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`YTM${(sayac += 1)}`, 'Deneme merkez']);
  const istasyon = (m: number, ek: { insan?: boolean; aktif?: boolean } = {}) => tek(
    'INSERT INTO istasyon (kod, ad, is_merkezi_id, kapasite_kaynagi, aktif) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [`YTI${(sayac += 1)}`, 'Deneme istasyon', m, ek.insan ? 'insan' : null, ek.aktif ?? true],
  );
  const kisi = () => tek('INSERT INTO kisi (ad) VALUES ($1) RETURNING id', [`Deneme kisi ${(sayac += 1)}`]);
  const yetkin = (k: number, i: number) => o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2)', [k, i]);
  // Merkez yalnız pazartesi çalışır: takvimin hangi merkezden geldiği çalışan günden okunur.
  const haftaVer = (m: number, v: number, gun: number) => o().sahip.sorgu('INSERT INTO vardiya_matrisi (is_merkezi_id, gun, vardiya_id) VALUES ($1, $2, $3)', [m, gun, v]);
  let vardiya = 0;
  const takvim = async (k: number) => (await calismaTakvimleri(o().vt, [{ tur: 'kisi', id: k }], ARALIK)).get(`kisi:${String(k)}`) ?? null;

  before(async () => {
    ortam = await testVeritabaniKur('vardiya_yetkinlik');
    vardiya = await tek("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ('YT gunduz', '08:00', '16:00') RETURNING id");
  });
  after(async () => { await ortam?.kaldir(); });

  test('ataması olmayan yetkin kişi istasyonunun merkez takvimini kendi vardiyasıyla alır', async () => {
    const m = await merkez();
    await haftaVer(m, vardiya, 1);
    const i = await istasyon(m, { insan: true });
    const k = await kisi();
    await yetkin(k, i);
    await o().sahip.sorgu('INSERT INTO vardiya_kisi (kisi_id, vardiya_id) VALUES ($1, $2)', [k, vardiya]);
    const t = await takvim(k);
    assert.ok(t, 'takvim boş olmamalı');
    assert.deepEqual([t.isMerkeziId, t.vardiyaId], [m, vardiya]);
    assert.deepEqual(t.gunler.filter((g) => g.dakika > 0).map((g) => g.tarih), ['2099-10-05'], 'yalnız merkezin çalıştığı pazartesi');
  });

  test('birden çok yetkin istasyonda önce insanlı istasyon, sonra en küçük kimlik; pasif istasyon sayılmaz', async () => {
    const [m1, m2, m3] = [await merkez(), await merkez(), await merkez()];
    const makineli = await istasyon(m1);
    const insanli = await istasyon(m2, { insan: true });
    const pasif = await istasyon(m3, { insan: true, aktif: false });
    const k = await kisi();
    for (const i of [pasif, makineli, insanli]) await yetkin(k, i);
    assert.equal((await takvim(k))?.isMerkeziId, m2);
    const k2 = await kisi();
    const ikinci = await istasyon(m3);
    await yetkin(k2, ikinci);
    await yetkin(k2, makineli);
    assert.equal((await takvim(k2))?.isMerkeziId, m1, 'insanlı yoksa en küçük kimlikli istasyon');
  });

  test('ataması olan kişide atama geçerlidir; ne ataması ne yetkinliği olan kişinin takvimi yine boştur', async () => {
    const [m1, m2] = [await merkez(), await merkez()];
    const atanan = await istasyon(m1);
    const yetkinlik = await istasyon(m2, { insan: true });
    const k = await kisi();
    await yetkin(k, yetkinlik);
    await o().sahip.sorgu("INSERT INTO istasyon_kisi (istasyon_id, kisi_id, baslangic, yuzde) VALUES ($1, $2, '2000-01-01', 100)", [atanan, k]);
    assert.equal((await takvim(k))?.isMerkeziId, m1);
    assert.equal(await takvim(await kisi()), null);
  });
});
