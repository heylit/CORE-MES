import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { patlatmaDugumleri, patlatmaRevizyonu } from './disari.ts';

// 1476-E: çok katmanlı emrin iş emri rota adımına düğümün patlatmadaki revizyonuyla bağlanır; okuma patlatma başına düğüm -> revizyon, malzeme.
describe('rota: patlatma düğümleri okuması (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisiId = 0;
  let tipId = 0;
  let sayac = 0;
  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  async function kartKur(): Promise<number> {
    sayac += 1;
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('PD-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'PD-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`pd-dnm-${sayac}`, sayac, JSON.stringify({ id: `pd-dnm-${sayac}`, com: { ad: `Deneme mamul ${sayac}` } }), kisiId]))!.no;
  }
  const revizyonKur = async (malzemeNo: number, harf: string): Promise<number> => (await o().sahip.tek<{ id: number }>(
    "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id) VALUES ($1, 'mamul', $3, 'taslak', $2) RETURNING id",
    [malzemeNo, kisiId, harf]))!.id;
  const adimKur = async (revizyonId: number, malzemeNo: number, opNo: number): Promise<number> => {
    await o().sahip.sorgu('INSERT INTO rota_op_numarasi (malzeme_id, op_no, ilk_revizyon_id) VALUES ($1, $2, $3)', [malzemeNo, opNo, revizyonId]);
    return (await o().sahip.tek<{ id: number }>(
      'INSERT INTO rota_adimi (revizyon_id, malzeme_id, op_no, sira, operasyon_tipi_id, ad) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id',
      [revizyonId, malzemeNo, opNo, opNo / 10, tipId, `Adım ${opNo}`]))!.id;
  };

  before(async () => {
    ortam = await testVeritabaniKur('rota_patlatma_dugumleri');
    kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('PD-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('patlatma başına düğümün revizyonu ve malzemesi döner, malzemenin revizyonu okunur; bulunmayan patlatma ve malzeme boştur', async () => {
    const kok = await kartKur();
    const alt = await kartKur();
    const kokRev = await revizyonKur(kok, 'PA');
    const altRev = await revizyonKur(alt, 'PB');
    const kokAdim = await adimKur(kokRev, kok, 10);
    const altAdim10 = await adimKur(altRev, alt, 10);
    const altAdim20 = await adimKur(altRev, alt, 20);
    const id = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO rota_patlatma (kok_malzeme_id, kok_rota_revizyonu_id, ozet, kisi_id) VALUES ($1, $2, 'deneme', $3) RETURNING id", [kok, kokRev, kisiId]))!.id;
    await o().sahip.sorgu(
      `INSERT INTO rota_patlamis_rota (patlatma_id, sira, dugum, katman, malzeme_id, rota_revizyonu_id, rota_adimi_id, kaynak_op_no, birim_carpani, tuketen_dugum, tuketen_op_no)
       VALUES ($1, 1, '0.1', 1, $2, $3, $4, 10, 2, '0', 10), ($1, 2, '0.1', 1, $2, $3, $5, 20, 2, '0', 10), ($1, 3, '0', 0, $6, $7, $8, 10, 1, NULL, NULL)`,
      [id, alt, altRev, altAdim10, altAdim20, kok, kokRev, kokAdim]);
    const harita = await o().vt.tx((db) => patlatmaDugumleri(db, [id, id, 999999]));
    assert.deepEqual([...harita.keys()], [id]);
    assert.deepEqual(Object.fromEntries(harita.get(id)!), { '0.1': { revizyonId: altRev, malzemeId: alt }, '0': { revizyonId: kokRev, malzemeId: kok } });
    assert.equal((await o().vt.tx((db) => patlatmaDugumleri(db, []))).size, 0);
    // Malzeme başına revizyon (1476-C): kök ve alt düğüm kendi revizyonunu verir; patlatmada olmayan malzeme ve patlatma null.
    const yabanci = await kartKur();
    assert.equal(await o().vt.tx((db) => patlatmaRevizyonu(db, id, alt)), altRev);
    assert.equal(await o().vt.tx((db) => patlatmaRevizyonu(db, id, kok)), kokRev);
    assert.equal(await o().vt.tx((db) => patlatmaRevizyonu(db, id, yabanci)), null);
    assert.equal(await o().vt.tx((db) => patlatmaRevizyonu(db, 999999, alt)), null);
  });
});
