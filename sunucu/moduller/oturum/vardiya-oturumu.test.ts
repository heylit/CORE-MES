import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { VARDIYA_DEVIR_PAYI_SN, vtZamaniMs } from './kurallar.ts';
import type { VardiyaAraligi } from './kurallar.ts';
import { istasyonVardiyasiSuruyor, kisininVardiyalari } from './servis.ts';

// 2226-3 (kullanıcı 07.11): istasyon oturumu kişinin vardiyası bitince devir payıyla düşer. Şimdiki an veritabanının saatidir.
describe('istasyon oturumu vardiya sonu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisiId = 0;
  const SAAT = 60 * 60 * 1000;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  // Açılışı `onceSaat` saat önce olan oturum; dönen satır kimlik çözümünün okuduğu alanlarla aynı.
  async function oturum(onceSaat: number) {
    const satir = await vt().tek<{ id: number; kisi_id: number; acildi_metin: string; acik_gecen_sn: number }>(
      `INSERT INTO oturum (anahtar_ozeti, kisi_id, acildi, son_gorulme)
       VALUES (md5(random()::text), $1, now() - make_interval(hours => $2), now())
       RETURNING id, kisi_id, acildi::text AS acildi_metin, extract(epoch FROM now() - acildi)::float8 AS acik_gecen_sn`,
      [kisiId, onceSaat],
    );
    if (!satir) throw new Error('oturum yazılamadı');
    return satir;
  }
  const okuyucu = (vardiyalar: (acilis: number) => VardiyaAraligi[]) => async (_db: unknown, _kisi: number, acilis: number) => vardiyalar(acilis);

  before(async () => {
    ortam = await testVeritabaniKur('oturum_vardiya');
    kisiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: 'vardiya-oturumu', parola: 'dogru-parola-1' }));
  });
  after(async () => { await ortam?.kaldir(); });

  test('vardiya bitti ve devir payı geçti: oturum düşer', async () => {
    const o = await oturum(9);
    // Vardiya açılıştan 10 dk önce başladı, 8 saat sürdü; pay 30 dk: sonu açılış + 8 sa 20 dk, şimdi açılış + 9 sa.
    const suruyor = await istasyonVardiyasiSuruyor(vt(), o, okuyucu((a) => [{ baslangicMs: a - 10 * 60_000, bitisMs: a + 8 * SAAT - 10 * 60_000 }]));
    assert.equal(suruyor, false);
  });

  test('vardiya sürüyor ya da devir payı içinde: oturum kalır', async () => {
    const o = await oturum(9);
    assert.equal(await istasyonVardiyasiSuruyor(vt(), o, okuyucu((a) => [{ baslangicMs: a, bitisMs: a + 12 * SAAT }])), true);
    const p = await oturum(8);
    // Vardiya açılış + 8 sa'te bitti, pay 30 dk; şimdi açılış + 8 sa: payın içinde.
    assert.equal(await istasyonVardiyasiSuruyor(vt(), p, okuyucu((a) => [{ baslangicMs: a, bitisMs: a + 8 * SAAT - 10 * 60_000 }])), true);
    assert.equal(VARDIYA_DEVIR_PAYI_SN, 30 * 60);
  });

  test('vardiyadan bir saat önce açılan oturum o vardiyanındır; daha erken açılan vardiyaya bağlanmaz', async () => {
    const erken = await oturum(10);
    assert.equal(await istasyonVardiyasiSuruyor(vt(), erken, okuyucu((a) => [{ baslangicMs: a + 50 * 60_000, bitisMs: a + 8 * SAAT }])), false);
    const cokErken = await oturum(10);
    assert.equal(await istasyonVardiyasiSuruyor(vt(), cokErken, okuyucu((a) => [{ baslangicMs: a + 2 * SAAT, bitisMs: a + 8 * SAAT }])), true);
  });

  test('vardiyası olmayan kişi: sınır yok (boşta süre geçer); gerçek takvim okuması boş döner', async () => {
    const o = await oturum(20);
    assert.equal(await istasyonVardiyasiSuruyor(vt(), o, okuyucu(() => [])), true);
    assert.deepEqual(await vt().tx((db) => kisininVardiyalari(db, kisiId, vtZamaniMs(o.acildi_metin))), []);
  });

  test('sonuç oturum başına bir kez hesaplanır: takvim her istekte okunmaz', async () => {
    const o = await oturum(9);
    let okuma = 0;
    const say = async (_db: unknown, _k: number, a: number) => { okuma += 1; return [{ baslangicMs: a, bitisMs: a + SAAT }]; };
    assert.equal(await istasyonVardiyasiSuruyor(vt(), o, say), false);
    assert.equal(await istasyonVardiyasiSuruyor(vt(), o, say), false);
    assert.equal(okuma, 1);
  });
});
