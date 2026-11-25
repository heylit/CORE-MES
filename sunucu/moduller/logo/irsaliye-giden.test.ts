import assert from 'node:assert/strict';
import { after, before, beforeEach, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { belgeTuruMu, denemeYaz, gidenIzlemeSatirlari, gidenOzetleri, gidenSatiri, niyetYaz } from './sorgular.ts';

// Kart 3694: irsaliye giden kutusu (mal kabul ve sevk için tek tablo), gerçek PostgreSQL.
describe('Logo irsaliye giden kutusu (3694)', () => {
  let ortam: TestVeritabani | undefined;
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  before(async () => { ortam = await testVeritabaniKur('logoirsaliye'); });
  after(async () => { await ortam?.kaldir(); });
  beforeEach(async () => { await vt().sorgu('DELETE FROM logo_irsaliye_giden'); });
  const an = new Date('2026-11-25T08:00:00Z');

  test('üç irsaliye türü geçerli belge türüdür, bilinmeyen değil', () => {
    for (const t of ['satin-alma-irsaliyesi', 'satis-irsaliyesi', 'konsinye-irsaliyesi']) assert.equal(belgeTuruMu(t), true);
    assert.equal(belgeTuruMu('irsaliye'), false);
  });

  test('niyet kalıcı yazılır ve aynı belge ikinci satır açmaz', async () => {
    await niyetYaz(vt(), 'satis-irsaliyesi', 7, an);
    await niyetYaz(vt(), 'satis-irsaliyesi', 7, new Date(an.getTime() + 1000));
    const n = await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM logo_irsaliye_giden WHERE belge_turu = 'satis-irsaliyesi' AND belge_no = 7");
    assert.equal(n?.n, 1);
    assert.ok((await gidenSatiri(vt(), 'satis-irsaliyesi', 7))?.niyetZamani);
  });

  test('aynı numara farklı türde ayrı satırdır', async () => {
    await niyetYaz(vt(), 'satin-alma-irsaliyesi', 3, an);
    await niyetYaz(vt(), 'konsinye-irsaliyesi', 3, an);
    assert.ok(await gidenSatiri(vt(), 'satin-alma-irsaliyesi', 3));
    assert.ok(await gidenSatiri(vt(), 'konsinye-irsaliyesi', 3));
    assert.equal(await gidenSatiri(vt(), 'satis-irsaliyesi', 3), null);
  });

  test('başarılı gönderim niyeti boşaltır ve kayıt no yazar; başarısız hata ve izleme satırı verir', async () => {
    await niyetYaz(vt(), 'satin-alma-irsaliyesi', 1, an);
    await denemeYaz(vt(), 'satin-alma-irsaliyesi', 1, { zaman: an, sonuc: 'gonderildi', hata: null, logoKayitNo: 'ORN-1', sonrakiDeneme: null, niyetZamani: null, basarili: true });
    const g = await gidenSatiri(vt(), 'satin-alma-irsaliyesi', 1);
    assert.equal(g?.logoKayitNo, 'ORN-1');
    assert.equal(g?.niyetZamani, null);
    await niyetYaz(vt(), 'satis-irsaliyesi', 2, an);
    await denemeYaz(vt(), 'satis-irsaliyesi', 2, { zaman: an, sonuc: 'reddedildi', hata: 'ORN hata', logoKayitNo: null, niyetZamani: undefined, sonrakiDeneme: null, basarili: false });
    const izleme = await gidenIzlemeSatirlari(vt(), 10);
    assert.deepEqual(izleme.filter((s) => s.belgeTuru.endsWith('irsaliyesi')).map((s) => s.belgeNo), [2]);
    const ozet = await gidenOzetleri(vt());
    assert.equal(ozet.find((o) => o.belgeTuru === 'satin-alma-irsaliyesi')?.gonderilen, 1);
    assert.equal(ozet.find((o) => o.belgeTuru === 'satis-irsaliyesi')?.hatali, 1);
  });

  test('kısıt: bilinmeyen tür ve numara boşluklu ya da 16 karakterden uzun olamaz', async () => {
    await assert.rejects(vt().sorgu("INSERT INTO logo_irsaliye_giden (belge_turu, belge_no) VALUES ('iade-irsaliyesi', 1)"));
    await assert.rejects(vt().sorgu("INSERT INTO logo_irsaliye_giden (belge_turu, belge_no, numara) VALUES ('satis-irsaliyesi', 1, ' X')"));
    await assert.rejects(vt().sorgu("INSERT INTO logo_irsaliye_giden (belge_turu, belge_no, numara) VALUES ('satis-irsaliyesi', 1, '12345678901234567')"));
  });
});
