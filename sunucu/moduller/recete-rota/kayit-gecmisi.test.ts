import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, yoneticiOlustur } from '../kisiler/disari.ts';
import * as servis from './servis.ts';

// 242 a: kayıt değişince önceki hâli geçmişe yazılır; geçmiş değiştirilemez, anahtar başına son 50 sürüm kalır.
describe('Reçete ve Rota kayıt geçmişi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let birinci: Kullanici;
  let ikinci: Kullanici;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kisi = async (kullaniciAdi: string): Promise<Kullanici> => {
    const id = await o().vt.tx((db) => yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: 'dogru-parola-1' }));
    return (await o().vt.tx((db) => kullaniciYukle(db, id)))!;
  };
  const yaz = async (k: Kullanici, anahtar: string, deger: Record<string, unknown>, beklenenSurum: number | null): Promise<number> =>
    (await o().vt.tx((db) => servis.yaz(db, k, { anahtar, bicim: 'json', deger, beklenenSurum }))).kayit.surum;
  const gecmis = (anahtar: string) => o().sahip.sorgu<{ surum: number; deger: unknown; yazan: number; degistiren: number | null }>(
    `SELECT surum::int, deger, yazan_kisi_id AS yazan, degistiren_kisi_id AS degistiren FROM recete_rota_kayit_gecmisi
      WHERE anahtar = $1 ORDER BY id`, [anahtar]);

  before(async () => {
    ortam = await testVeritabaniKur('rr_kayit_gecmisi');
    birinci = await kisi('birinci');
    ikinci = await kisi('ikinci');
  });
  after(async () => { await ortam?.kaldir(); });

  test('RR-G1 her değişiklik ve silmede önceki değer, sürümü, yazanı ve yerine yazan tutulur; aynı değer yeni satır açmaz', async () => {
    const a = 'recete-rota-motoru-v1:gecmis1';
    const v1 = await yaz(birinci, a, { ad: 'ilk' }, null);
    assert.deepEqual(await gecmis(a), [], 'yeni kayıt geçmiş açmaz');
    const v2 = await yaz(ikinci, a, { ad: 'düzeltildi' }, v1);
    const v3 = await yaz(ikinci, a, { ad: 'düzeltildi' }, v2);
    await o().vt.tx((db) => servis.sil(db, a, v3));
    assert.deepEqual(await gecmis(a), [
      { surum: v1, deger: { ad: 'ilk' }, yazan: birinci.id, degistiren: ikinci.id },
      { surum: v3, deger: { ad: 'düzeltildi' }, yazan: ikinci.id, degistiren: null },
    ]);
  });

  test('RR-G2 servisi atlayan yazma da geçmişe düşer; geçmiş değiştirilemez, silinemez, boşaltılamaz', async () => {
    const a = 'recete-rota-motoru-v1:gecmis2';
    const v1 = await yaz(birinci, a, { ad: 'servis' }, null);
    await o().sahip.sorgu(`UPDATE recete_rota_kayit SET deger = '{"ad":"elle"}' WHERE anahtar = $1`, [a]);
    assert.deepEqual((await gecmis(a)).map((g) => [g.surum, g.deger]), [[v1, { ad: 'servis' }]]);
    await assert.rejects(o().sahip.sorgu('UPDATE recete_rota_kayit_gecmisi SET deger = \'{}\' WHERE anahtar = $1', [a]), /yalnız ekleme/);
    await assert.rejects(o().vt.sorgu('DELETE FROM recete_rota_kayit_gecmisi WHERE anahtar = $1', [a]), /yalnız ekleme/);
    await assert.rejects(o().sahip.sorgu('DELETE FROM recete_rota_kayit_gecmisi WHERE anahtar = $1', [a]), /yalnız ekleme/);
    await assert.rejects(o().sahip.sorgu('TRUNCATE recete_rota_kayit_gecmisi'), /yalnız ekleme/);
    assert.equal((await gecmis(a)).length, 1);
  });

  test('RR-G3 anahtar başına son 50 sürüm kalır; en eskisi aynı işlemde silinir, öteki anahtarın geçmişine dokunulmaz', async () => {
    const a = 'recete-rota-motoru-v1:gecmis3';
    const b = 'recete-rota-motoru-v1:gecmis4';
    const bv1 = await yaz(birinci, b, { n: 0 }, null);
    await yaz(birinci, b, { n: 1 }, bv1);
    const surumler = [await yaz(birinci, a, { n: 0 }, null)];
    for (let n = 1; n <= 52; n++) surumler.push(await yaz(birinci, a, { n }, surumler.at(-1)!));
    const kalan = await gecmis(a);
    assert.equal(kalan.length, 50);
    assert.deepEqual(kalan.map((g) => g.surum), surumler.slice(2, 52), 'en eski iki sürüm düşer, son 50 kalır');
    assert.deepEqual(kalan.at(-1)?.deger, { n: 51 });
    assert.deepEqual((await gecmis(b)).map((g) => g.deger), [{ n: 0 }]);
  });
});
