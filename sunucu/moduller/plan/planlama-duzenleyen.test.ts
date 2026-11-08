import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { DuzenleyenCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { YazCevabi } from '#paylasilan/sozlesme/recete-rota.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 2311 S1: "şu an X düzenliyor" şeridinin okuması: planlama çalışmasını en son yazan, zaman ve sürüm; içerik dönmez. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): planlama çalışmasını düzenleyen', () => {
  const { c, vt, tamam, istek } = planTestOrtami();
  const yol = '/plan/planlama-calismasi/duzenleyen';
  const yaz = (cerez: string, beklenenSurum: number | null) => tamam<YazCevabi>(cerez, 'POST', '/plan/planlama-kayitlari/yaz',
    { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', beklenenSurum, deger: { dataVer: 1, plan: null, iz: [], D: {} } });

  test('PL-2316: kayıt yoksa hepsi null; son yazan ve sürüm döner; planlamayı görmeyen 403, oturumsuz 401', async () => {
    await vt().tx((db) => db.sorgu('DELETE FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI]));
    assert.deepEqual(await tamam<DuzenleyenCevabi>(c.planlama, 'GET', yol), { kisiId: null, kisi: null, zaman: null, surum: null });

    const ilk = await yaz(c.planlama, null);
    const a = await tamam<DuzenleyenCevabi>(c.planlama2, 'GET', yol);
    assert.equal(a.kisi, 'Deneme planlama');
    assert.equal(a.surum, ilk.kayit.surum);
    assert.ok(a.zaman !== null && Math.abs(Date.parse(a.zaman) - Date.now()) < 60_000);

    const ikinci = await yaz(c.planlama2, ilk.kayit.surum);
    const b = await tamam<DuzenleyenCevabi>(c.planlama, 'GET', yol);
    assert.deepEqual([b.kisi, b.surum], ['Deneme planlama2', ikinci.kayit.surum]);
    assert.notEqual(b.kisiId, a.kisiId);
    assert.ok(!('deger' in b), 'içerik dönmez');

    assert.equal((await istek(c.operator, 'GET', yol)).statusCode, 403);
    assert.equal((await istek('', 'GET', yol)).statusCode, 401);
  });
});
