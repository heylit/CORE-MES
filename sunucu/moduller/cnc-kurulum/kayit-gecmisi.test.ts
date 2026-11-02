import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { kullaniciYukle, yoneticiOlustur } from '../kisiler/disari.ts';
import * as servis from './servis.ts';

// 242 a: kayıt değişince önceki hâli geçmişe yazılır; geçmiş değiştirilemez, anahtar başına son 50 sürüm kalır.
describe('CNC Kurulum kayıt geçmişi (gerçek PostgreSQL)', () => {
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
    `SELECT surum::int, deger, yazan_kisi_id AS yazan, degistiren_kisi_id AS degistiren FROM cnc_kurulum_kayit_gecmisi
      WHERE anahtar = $1 ORDER BY id`, [anahtar]);

  before(async () => {
    ortam = await testVeritabaniKur('ck_kayit_gecmisi');
    birinci = await kisi('birinci');
    ikinci = await kisi('ikinci');
  });
  after(async () => { await ortam?.kaldir(); });

  test('CK-G1 her değişiklik ve silmede önceki değer, sürümü, yazanı ve yerine yazan tutulur; aynı değer yeni satır açmaz', async () => {
    const a = 'cnc-kurulum-motoru.gecmis1';
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

  test('CK-G2 servisi atlayan yazma da geçmişe düşer; geçmiş değiştirilemez, silinemez, boşaltılamaz', async () => {
    const a = 'cnc-kurulum-motoru.gecmis2';
    const v1 = await yaz(birinci, a, { ad: 'servis' }, null);
    await o().sahip.sorgu(`UPDATE cnc_kurulum_kayit SET deger = '{"ad":"elle"}' WHERE anahtar = $1`, [a]);
    assert.deepEqual((await gecmis(a)).map((g) => [g.surum, g.deger]), [[v1, { ad: 'servis' }]]);
    await assert.rejects(o().sahip.sorgu('UPDATE cnc_kurulum_kayit_gecmisi SET deger = \'{}\' WHERE anahtar = $1', [a]), /yalnız ekleme/);
    await assert.rejects(o().vt.sorgu('DELETE FROM cnc_kurulum_kayit_gecmisi WHERE anahtar = $1', [a]), /yalnız ekleme/);
    await assert.rejects(o().sahip.sorgu('DELETE FROM cnc_kurulum_kayit_gecmisi WHERE anahtar = $1', [a]), /yalnız ekleme/);
    await assert.rejects(o().sahip.sorgu('TRUNCATE cnc_kurulum_kayit_gecmisi'), /yalnız ekleme/);
    assert.equal((await gecmis(a)).length, 1);
  });

  test('CK-G3 anahtar başına son 50 sürüm kalır; en eskisi aynı işlemde silinir, öteki anahtarın geçmişine dokunulmaz', async () => {
    const a = 'cnc-kurulum-motoru.gecmis3';
    const b = 'cnc-kurulum-motoru.gecmis4';
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

  test('CK-G4 geçmiş okuması (CNC-7 a): yeniden eskiye sürüm, yazan, yerine yazan, değişen üst alanlar; silme işaretlenir, değer gitmez', async () => {
    const a = 'cnc-kurulum-motoru.gecmis5';
    const v1 = await yaz(birinci, a, { machine: 'm1', at: 1, qty: 3 }, null);
    const v2 = await yaz(ikinci, a, { machine: 'm2', at: 1, qty: 3 }, v1);
    const v3 = await yaz(birinci, a, { machine: 'm2', at: 2, yeni: true }, v2);
    const c = await o().vt.tx((db) => servis.kayitGecmisi(db, a));
    assert.equal(c.anahtar, a);
    assert.deepEqual(c.guncel && { surum: c.guncel.surum, yazan: c.guncel.yazan }, { surum: v3, yazan: { id: birinci.id, ad: 'Deneme birinci' } });
    assert.deepEqual(c.satirlar.map((s) => [s.surum, s.yazan.id, s.degistiren?.id, s.silindi, s.alanlar]), [
      [v2, ikinci.id, birinci.id, false, ['at', 'qty', 'yeni']],
      [v1, birinci.id, ikinci.id, false, ['machine']],
    ]);
    assert.ok(!JSON.stringify(c).includes('m1'), 'değer sunucudan çıkmaz');
    assert.ok(c.anahtarlar.some((x) => x.anahtar === a && x.surumSayisi === 2));
    await o().vt.tx((db) => servis.sil(db, a, v3));
    const s = await o().vt.tx((db) => servis.kayitGecmisi(db, a));
    assert.equal(s.guncel, null);
    assert.deepEqual(s.satirlar.map((x) => [x.surum, x.silindi, x.degistiren, x.alanlar]), [[v3, true, null, null], [v2, false, { id: birinci.id, ad: 'Deneme birinci' }, ['at', 'qty', 'yeni']], [v1, false, { id: ikinci.id, ad: 'Deneme ikinci' }, ['machine']]]);
    const bos = await o().vt.tx((db) => servis.kayitGecmisi(db, 'cnc-kurulum-motoru.hic-yok'));
    assert.deepEqual([bos.guncel, bos.satirlar], [null, []]);
  });
});
