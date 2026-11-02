import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { izinYok, testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { Db } from '#cekirdek/db.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import * as sorgular from './sorgular.ts';

// Bakiye hareket defterine bağlı (1692 b teyit): uygulama kullanıcısı bakiyeyi yalnız aynı işlemdeki eşdeğer hareketle değiştirebilir.
describe('stok bakiyesi ve hareket defteri tetiği (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisi = 0;
  let kabul = 0;
  let ikinci = 0;
  let sira = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const esitDegil = (h: unknown): boolean => {
    const e = h as { code?: string; constraint?: string };
    return e.code === '23514' && e.constraint === 'stok_bakiye_defter_esit';
  };

  async function kart(): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['BT-DNM-']);
    const r = await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'sarf', 'BT-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`bt-dnm-${sira}`, sira, JSON.stringify({ id: `bt-dnm-${sira}`, com: { ad: `Deneme sarf ${sira}` } }), kisi],
    );
    return r!.no;
  }
  const hareket = (db: Db, h: { malzemeId: number; kaynak: number | null; hedef: number | null; miktar: string }) => sorgular.hareketYaz(db, {
    tur: h.kaynak && h.hedef ? 'transfer' : h.hedef ? 'giris' : 'cikis', malzemeId: h.malzemeId, partiId: null, partiSecimi: null,
    kaynakKonumId: h.kaynak, hedefKonumId: h.hedef, miktar: h.miktar, onayliEksi: false,
    girisKaynagi: h.hedef && !h.kaynak ? 'mal_kabul' : null, cikisNedeni: h.kaynak && !h.hedef ? 'diger' : null,
    uretimEmriId: null, geriAlinanId: null, kisiId: kisi, aciklama: null,
    kaynakStatuId: null, hedefStatuId: null, kaynakKaliteDurumu: h.kaynak ? 'serbest' : null, hedefKaliteDurumu: h.hedef ? 'serbest' : null, isEmriId: null,
  });
  const bakiyeAc = (db: Db, malzemeId: number, konumId: number, miktar: string) =>
    db.sorgu('INSERT INTO stok_bakiye (malzeme_id, konum_id, miktar, ilk_giris) VALUES ($1, $2, $3, now())', [malzemeId, konumId, miktar]);
  const bakiye = async (malzemeId: number): Promise<{ konumId: number; miktar: string }[]> =>
    o().vt.sorgu('SELECT konum_id AS "konumId", miktar::text AS miktar FROM stok_bakiye WHERE malzeme_id = $1 ORDER BY konum_id', [malzemeId]);
  const araToplam = async (): Promise<number> =>
    Number((await o().sahip.tek<{ n: string }>('SELECT count(*)::text AS n FROM stok_bakiye_defter_bekleyen'))!.n);

  before(async () => {
    ortam = await testVeritabaniKur('stok_bakiye_tetigi');
    kisi = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    kabul = (await o().vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
    ikinci = (await o().vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE aktif AND id <> $1 ORDER BY id LIMIT 1", [kabul]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('hareketsiz bakiye ve bakiyesiz hareket işlem sonunda reddedilir; hiçbir şey yazılmaz', async () => {
    const m = await kart();
    await assert.rejects(o().vt.tx((db) => bakiyeAc(db, m, kabul, '5')), esitDegil);
    await assert.rejects(o().vt.tx((db) => hareket(db, { malzemeId: m, kaynak: null, hedef: kabul, miktar: '5' })), esitDegil);
    await assert.rejects(o().vt.tx(async (db) => {
      await hareket(db, { malzemeId: m, kaynak: null, hedef: kabul, miktar: '5' });
      await bakiyeAc(db, m, kabul, '4');
    }), esitDegil);
    assert.deepEqual(await bakiye(m), []);
    assert.equal(await araToplam(), 0);
  });

  test('eşdeğer hareketle giriş, transfer ve tükenme geçer; işlem sonunda ara toplam boş kalır', async () => {
    const m = await kart();
    await o().vt.tx(async (db) => {
      await hareket(db, { malzemeId: m, kaynak: null, hedef: kabul, miktar: '5' });
      await bakiyeAc(db, m, kabul, '5');
    });
    await o().vt.tx(async (db) => {
      await hareket(db, { malzemeId: m, kaynak: kabul, hedef: ikinci, miktar: '5' });
      await db.sorgu('UPDATE stok_bakiye SET konum_id = $2 WHERE malzeme_id = $1', [m, ikinci]);
    });
    assert.deepEqual(await bakiye(m), [{ konumId: ikinci, miktar: '5.000' }]);
    await assert.rejects(o().vt.tx((db) => db.sorgu("UPDATE stok_bakiye SET miktar = '6' WHERE malzeme_id = $1", [m])), esitDegil);
    await o().vt.tx(async (db) => {
      await hareket(db, { malzemeId: m, kaynak: ikinci, hedef: null, miktar: '5' });
      await db.sorgu('DELETE FROM stok_bakiye WHERE malzeme_id = $1', [m]);
    });
    assert.deepEqual(await bakiye(m), []);
    assert.equal(await araToplam(), 0);
  });

  test('geri alınan kayıt noktası ara toplamdan da düşer; ambalaj gibi miktar dışı değişiklik denetlenmez', async () => {
    const m = await kart();
    await o().vt.tx(async (db) => {
      await db.sorgu('SAVEPOINT deneme');
      await bakiyeAc(db, m, kabul, '3');
      await db.sorgu('ROLLBACK TO SAVEPOINT deneme');
      await hareket(db, { malzemeId: m, kaynak: null, hedef: kabul, miktar: '2' });
      await bakiyeAc(db, m, kabul, '2');
    });
    await o().vt.tx((db) => db.sorgu('UPDATE stok_bakiye SET ilk_giris = now(), ambalaj_adet = 2 WHERE malzeme_id = $1', [m]));
    assert.deepEqual(await bakiye(m), [{ konumId: kabul, miktar: '2.000' }]);
  });

  test('uygulama kullanıcısı ara toplamı okuyamaz ve yazamaz; tablo sahibi muaftır (sahip tetiği zaten kapatabilir)', async () => {
    await assert.rejects(o().vt.sorgu('SELECT * FROM stok_bakiye_defter_bekleyen'), izinYok);
    await assert.rejects(o().vt.sorgu("INSERT INTO stok_bakiye_defter_bekleyen VALUES (txid_current(), 1, 1, NULL, NULL, 'serbest', 1)"), izinYok);
    const m = await kart();
    await o().sahip.tx((db) => bakiyeAc(db, m, kabul, '7'));
    assert.deepEqual(await bakiye(m), [{ konumId: kabul, miktar: '7.000' }]);
  });
});
