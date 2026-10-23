import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { FastifyInstance } from 'fastify';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import * as servis from './servis.ts';

// 258 a (19.10.2026): kayıt değişince önceki hâli silinemez geçmişe yazılır; kapanmış NCR ve sonuçlanmış muayene kilitlidir.
describe('Kalite Merkezi kayıt geçmişi ve kilit (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let birinci: Kullanici;
  let ikinci: Kullanici;
  let app: FastifyInstance | undefined;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kisi = async (kullaniciAdi: string): Promise<Kullanici> => {
    const id = await o().vt.tx((db) => yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: 'dogru-parola-1' }));
    return (await o().vt.tx((db) => kullaniciYukle(db, id)))!;
  };
  const yaz = (k: Kullanici, koleksiyon: string, kimlik: string, govde: Record<string, unknown>, surum: number | null = null) =>
    o().vt.tx((db) => servis.yaz(db, k, koleksiyon, kimlik, govde, surum));
  const gecmis = (kimlik: string) => o().sahip.sorgu<{ surum: number; govde: unknown; yazan: number; degistiren: number | null }>(
    `SELECT surum::int, govde, yazan_id AS yazan, degistiren_id AS degistiren FROM kalite_merkezi_belge_gecmisi
      WHERE kimlik = $1 ORDER BY id`, [kimlik]);
  const reddedilir = async (is: Promise<unknown>, kod: string): Promise<void> => {
    await assert.rejects(is, (h: { kod?: string; message?: string }) => {
      assert.equal(h.kod, kod, h.message);
      return true;
    });
  };

  before(async () => {
    ortam = await testVeritabaniKur('km_kayit_gecmisi');
    birinci = await kisi('birinci');
    ikinci = await kisi('ikinci');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('KM-K89 geçmiş: her değişiklik ve silmede önceki gövde, sürümü, yazanı ve yerine yazan tutulur; aynı gövde yeni satır açmaz', async () => {
    const v1 = await yaz(birinci, 'capa', 'capa_g1', { no: 'DOF-G1', tanim: 'ilk' });
    assert.deepEqual(await gecmis('capa_g1'), [], 'yeni kayıt geçmiş açmaz');
    const v2 = await yaz(ikinci, 'capa', 'capa_g1', { no: 'DOF-G1', tanim: 'düzeltildi' }, v1.surum);
    const v3 = await yaz(ikinci, 'capa', 'capa_g1', { tanim: 'düzeltildi', no: 'DOF-G1' }, v2.surum);
    await o().vt.tx((db) => servis.sil(db, birinci, 'capa', 'capa_g1', v3.surum));
    assert.deepEqual(await gecmis('capa_g1'), [
      { surum: v1.surum, govde: { no: 'DOF-G1', tanim: 'ilk' }, yazan: birinci.id, degistiren: ikinci.id },
      { surum: v3.surum, govde: { no: 'DOF-G1', tanim: 'düzeltildi' }, yazan: ikinci.id, degistiren: birinci.id },
    ]);
    // Servisi atlayan yazma da geçmişe düşer; geçmiş değiştirilemez ve silinemez.
    const v4 = await yaz(birinci, 'capa', 'capa_g2', { no: 'DOF-G2' });
    await o().sahip.sorgu(`UPDATE kalite_merkezi_belge SET govde = '{"no":"elle"}' WHERE kimlik = 'capa_g2'`);
    assert.deepEqual((await gecmis('capa_g2')).map((g) => [g.surum, g.govde]), [[v4.surum, { no: 'DOF-G2' }]]);
    await assert.rejects(o().sahip.sorgu("UPDATE kalite_merkezi_belge_gecmisi SET govde = '{}' WHERE kimlik = 'capa_g1'"));
    await assert.rejects(o().sahip.sorgu("DELETE FROM kalite_merkezi_belge_gecmisi WHERE kimlik = 'capa_g1'"));
    await assert.rejects(o().sahip.sorgu('TRUNCATE kalite_merkezi_belge_gecmisi'));
  });

  test('KM-K89 kilit: kapalı NCR ve Kabul ya da Ret sonuçlu muayene yazılamaz ve silinemez (409); düzeltme yeni kayıtla yapılır', async () => {
    const acik = await yaz(birinci, 'ncr', 'ncr_k1', { no: 'NCR-K1', durum: 'Açık' });
    const kapali = await o().vt.tx((db) => servis.onayla(db, birinci, 'ncr', 'ncr_k1', { no: 'NCR-K1', durum: 'Kapalı' }, acik.surum));
    await reddedilir(yaz(birinci, 'ncr', 'ncr_k1', { no: 'NCR-K1', durum: 'Kapalı', not: 'ek' }, kapali.surum), 'CAKISMA');
    await reddedilir(o().vt.tx((db) => servis.onayla(db, birinci, 'ncr', 'ncr_k1', { no: 'NCR-K1', durum: 'Açık' }, kapali.surum)), 'CAKISMA');
    await reddedilir(o().vt.tx((db) => servis.sil(db, birinci, 'ncr', 'ncr_k1', kapali.surum)), 'CAKISMA');

    const mua = await yaz(birinci, 'insp', 'insp_k1', { no: 'MUA-K1', sonuc: 'Beklemede' });
    const sonuclu = await yaz(birinci, 'insp', 'insp_k1', { no: 'MUA-K1', sonuc: 'Ret' }, mua.surum);
    await reddedilir(yaz(birinci, 'insp', 'insp_k1', { no: 'MUA-K1', sonuc: 'Kabul' }, sonuclu.surum), 'CAKISMA');
    await reddedilir(o().vt.tx((db) => servis.sil(db, birinci, 'insp', 'insp_k1', sonuclu.surum)), 'CAKISMA');
    await yaz(birinci, 'insp', 'insp_k2', { no: 'MUA-K2', sonuc: 'Kabul', duzeltilen: 'insp_k1' });
    assert.deepEqual(await gecmis('insp_k1'), [{ surum: mua.surum, govde: { no: 'MUA-K1', sonuc: 'Beklemede' }, yazan: birinci.id, degistiren: birinci.id }]);
  });

  test('B16 kilit: kapalı DÖF ve kararı verilmiş lot kabul kaydı yazılamaz, onaylanamaz ve silinemez (409); açık DÖF ve yeniden başlatma yazılır', async () => {
    const dof = await yaz(birinci, 'capa', 'capa_k1', { no: 'DOF-K1', durum: 'Açık', adim: 3 });
    const ilerledi = await yaz(birinci, 'capa', 'capa_k1', { no: 'DOF-K1', durum: 'Açık', adim: 8 }, dof.surum);
    const kapali = await o().vt.tx((db) => servis.onayla(db, birinci, 'capa', 'capa_k1', { no: 'DOF-K1', durum: 'Kapalı', adim: 8 }, ilerledi.surum));
    await reddedilir(yaz(birinci, 'capa', 'capa_k1', { no: 'DOF-K1', durum: 'Kapalı', adim: 8, aksiyon: 'ek' }, kapali.surum), 'CAKISMA');
    await reddedilir(o().vt.tx((db) => servis.onayla(db, birinci, 'capa', 'capa_k1', { no: 'DOF-K1', durum: 'Açık', adim: 8 }, kapali.surum)), 'CAKISMA');
    await reddedilir(o().vt.tx((db) => servis.sil(db, birinci, 'capa', 'capa_k1', kapali.surum)), 'CAKISMA');

    const lot = await yaz(birinci, 'lot', 'lot_k1', { no: 'LOT-K1', karar: 'Ret' });
    await reddedilir(yaz(birinci, 'lot', 'lot_k1', { no: 'LOT-K1', karar: 'Kabul' }, lot.surum), 'CAKISMA');
    await reddedilir(o().vt.tx((db) => servis.sil(db, birinci, 'lot', 'lot_k1', lot.surum)), 'CAKISMA');
    await yaz(birinci, 'lot', 'lot_k2', { no: 'LOT-K2', karar: 'Kabul', yenidenSunum: true });
    const reset = await yaz(birinci, 'lot', 'lot_r1', { no: 'RESET-1', tip: 'reset', anahtar: 'a' });
    await yaz(birinci, 'lot', 'lot_r1', { no: 'RESET-1', tip: 'reset', anahtar: 'b' }, reset.surum);
  });

  // 326 a: geçmiş ekranı bu uçtan okunur; salt okunur, yeniden eskiye, kişi adlarıyla.
  test('KM-K326 geçmiş ucu: önceki hâller yeniden eskiye, kişi adları ve zamanla gelir; silen kişi de görünür; yetkisiz 403, olmayan kayıtta boş', async () => {
    const giris = async (kullaniciAdi: string): Promise<string> => {
      const r = await app!.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: 'dogru-parola-1' } });
      assert.equal(r.statusCode, 200, r.body);
      return String(r.headers['set-cookie']).split(';')[0] ?? '';
    };
    const yonetici = await giris('birinci');
    const yetkisizId = await o().vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme Yetkisiz', kullaniciAdi: 'yetkisiz326', parola: 'dogru-parola-1' });
      const bos = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'operator'");
      const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
      await rolAta(db, birinci.id, id, bos!.id);
      await rolAl(db, birinci.id, id, yon!.id);
      return id;
    });
    assert.ok(yetkisizId > 0);
    const yetkisiz = await giris('yetkisiz326');
    await o().vt.tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme Kaliteci', kullaniciAdi: 'kaliteci326', parola: 'dogru-parola-1' });
      const kaliteRolu = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'kalite'");
      const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
      await rolAta(db, birinci.id, id, kaliteRolu!.id);
      await rolAl(db, birinci.id, id, yon!.id);
    });
    const kaliteci = await giris('kaliteci326');
    const oku = (c: string | null, koleksiyon: string, kimlik: string) =>
      app!.inject({ method: 'GET', url: `/api/kalite-merkezi/kayitlar/${koleksiyon}/${kimlik}/gecmis`, ...(c === null ? {} : { headers: { cookie: c } }) });

    const v1 = await yaz(birinci, 'capa', 'capa_326', { no: 'DOF-326', tanim: 'ilk' });
    assert.deepEqual((await oku(yonetici, 'capa', 'capa_326')).json(), { surumler: [] }, 'yeni kayıt geçmişsiz');
    const v2 = await yaz(ikinci, 'capa', 'capa_326', { no: 'DOF-326', tanim: 'ikinci' }, v1.surum);
    const v3 = await yaz(birinci, 'capa', 'capa_326', { no: 'DOF-326', tanim: 'üçüncü' }, v2.surum);
    await o().vt.tx((db) => servis.sil(db, ikinci, 'capa', 'capa_326', v3.surum));

    const r = await oku(yonetici, 'capa', 'capa_326');
    assert.equal(r.statusCode, 200, r.body);
    const { surumler } = r.json() as { surumler: { surum: number; yazan: string | null; yazildi: string; degistiren: string | null; degisti: string; govde: unknown }[] };
    assert.deepEqual(surumler.map((s) => [s.surum, s.yazan, s.degistiren, s.govde]), [
      [v3.surum, 'Deneme birinci', 'Deneme ikinci', { no: 'DOF-326', tanim: 'üçüncü' }],
      [v2.surum, 'Deneme ikinci', 'Deneme birinci', { no: 'DOF-326', tanim: 'ikinci' }],
      [v1.surum, 'Deneme birinci', 'Deneme ikinci', { no: 'DOF-326', tanim: 'ilk' }],
    ], 'sürüm sırası yeniden eskiye');
    for (const s of surumler) assert.ok(!Number.isNaN(Date.parse(s.degisti)) && !Number.isNaN(Date.parse(s.yazildi)), s.degisti);
    assert.ok(surumler[0]!.surum > surumler[1]!.surum && surumler[1]!.surum > surumler[2]!.surum);

    assert.deepEqual((await oku(kaliteci, 'capa', 'capa_326')).json(), r.json(), 'yönetici olmayan kalite rolü de okur');
    assert.equal((await oku(yetkisiz, 'capa', 'capa_326')).statusCode, 403);
    assert.equal((await oku(null, 'capa', 'capa_326')).statusCode, 401);
    assert.equal((await oku(yonetici, 'capa', 'yok_326')).statusCode, 200);
    assert.deepEqual((await oku(yonetici, 'capa', 'yok_326')).json(), { surumler: [] });
    assert.equal((await oku(yonetici, 'bilinmeyen', 'capa_326')).statusCode, 400);
  });
});
