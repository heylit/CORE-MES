import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { bilesenIkameleri, bilesenIkamesiGeriAl, bilesenIkamesiYap, emirMalzemeIhtiyaci } from './disari.ts';
import { IKAME_BASKA, IKAME_BILESEN_YOK, IKAME_CAKISMA } from './kurallar.ts';
import * as s from './sorgular.ts';

// 3437-3b-3b (Risk P1, P2): satın almanın alternatifli siparişi emrin bileşenini ikame eder. İkame kayıtlıdır: bileşenler hangi yoldan
// yeniden yazılırsa yazılsın (bilesenEkle, bütün yeniden yazma yolları bundan geçer) ana kart alternatife çevrilir. Veriler uydurmadır.
describe('3437-3b-3b: emir bileşeni ikamesi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let yoneticiId = 0;
  let sira = 0;
  let urun = 0;
  let rev = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const kart = async (tur = 'hammadde'): Promise<number> => {
    sira += 1;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'HM-BIK-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`bik-${sira}`, tur, sira, JSON.stringify({ id: `bik-${sira}`, com: { ad: `Deneme ${sira}`, birim: 'adet' } }), yoneticiId]))!.no;
  };
  async function emir(adet: number, bilesenler: [number, number, string][]): Promise<{ id: number; isEmirleri: number[] }> {
    sira += 1;
    const v = o().sahip;
    const im = (await v.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`BIK${sira}`, 'Deneme Merkezi']))!.id;
    const ist = (await v.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`BIS${sira}`, `Deneme ${sira}`, im]))!.id;
    const tip = (await v.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`BT-${sira}`]))!.id;
    const e = (await v.tek<{ id: number }>(
      'INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, malzeme_no, kaynak_rota_revizyonu_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [`P-BIK-${sira}`, 'Deneme', adet, ist, yoneticiId, urun, rev]))!.id;
    const isEmirleri = new Map<number, number>();
    for (const [sr, malzeme, miktar] of bilesenler) {
      if (!isEmirleri.has(sr)) {
        isEmirleri.set(sr, (await v.tek<{ id: number }>('INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad) VALUES ($1, $2, $3, $4, $5) RETURNING id',
          [e, sr, sr * 10, tip, `OP ${sr * 10}`]))!.id);
      }
      await v.sorgu('INSERT INTO uretim_emirleri_is_emri_bileseni (is_emri_id, malzeme_no, miktar) VALUES ($1, $2, $3)', [isEmirleri.get(sr), malzeme, miktar]);
    }
    return { id: e, isEmirleri: [...isEmirleri.values()] };
  }
  const kartlar = async (emirId: number) => (await o().sahip.sorgu<{ sira: number; no: number; miktar: string }>(
    `SELECT i.sira, b.malzeme_no AS no, b.miktar::text AS miktar FROM uretim_emirleri_is_emri_bileseni b JOIN uretim_emirleri_is_emri i ON i.id = b.is_emri_id
      WHERE i.uretim_emri_id = $1 ORDER BY i.sira, b.malzeme_no`, [emirId])).map((x) => [x.sira, x.no, Number(x.miktar)]);
  const surum = async (emirId: number) => (await o().sahip.tek<{ surum: number }>('SELECT surum FROM uretim_emri WHERE id = $1', [emirId]))!.surum;
  const yap = (emirId: number, anaNo: number, alternatifNo: number) =>
    o().vt.tx((db) => bilesenIkamesiYap(db, yoneticiId, { uretimEmriId: emirId, anaNo, alternatifNo, kaynak: 'Satın alma ST-DENEME' }));
  const reddi = async (p: Promise<unknown>): Promise<string> => {
    try { await p; } catch (h) { if (h instanceof UygulamaHatasi) return h.message; throw h; }
    return 'reddedilmedi';
  };

  before(async () => {
    ortam = await testVeritabaniKur('ue_bilesen_ikamesi');
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: 'dogru-parola-1' }));
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HM-BIK-', 100) ON CONFLICT (onek) DO NOTHING");
    urun = await kart('mamul');
    rev = (await ortam.sahip.tek<{ id: number }>(
      `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
       VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id`, [urun, yoneticiId]))!.id;
  });
  after(async () => { await ortam?.kaldir(); });

  test('izinli: bütün iş emirlerinde ana kart alternatife geçer (miktar aynı), sürüm artar; aynı ikame yeniden yazılınca değişmez', async () => {
    const [ana, alt, diger] = [await kart(), await kart(), await kart()];
    const e = await emir(4, [[1, ana, '2'], [1, diger, '1'], [2, ana, '0.5']]);
    const s0 = await surum(e.id);
    await yap(e.id, ana, alt);
    assert.deepEqual((await kartlar(e.id)).map((x) => x.join(':')).sort(), [`1:${alt}:2`, `1:${diger}:1`, `2:${alt}:0.5`].sort());
    assert.equal(await surum(e.id), s0 + 1);
    assert.deepEqual((await o().vt.tx((db) => bilesenIkameleri(db, [e.id]))).map((x) => [x.anaMalzemeNo, x.alternatifMalzemeNo, x.kaynak, x.kisiId]),
      [[ana, alt, 'Satın alma ST-DENEME', yoneticiId]]);
    const ihtiyac = (await o().vt.tx((db) => emirMalzemeIhtiyaci(db, e.id))) ?? [];
    assert.equal(ihtiyac.some((m) => m.malzemeNo === ana), false, 'ana kart emrin ihtiyacında kalmaz (K1)');
    assert.equal(ihtiyac.filter((m) => m.malzemeNo === alt).reduce((t, m) => t + Number(m.brut), 0), 10);
    await yap(e.id, ana, alt);
    assert.equal(await surum(e.id), s0 + 1, 'aynı ikame ikinci kez yazılmaz');
  });

  test('P1: bileşenler yeniden yazılınca (bilesenEkle) ana kart ikameyle alternatife çevrilir; ikame geri alınınca yeniden ana kart', async () => {
    const [ana, alt, diger] = [await kart(), await kart(), await kart()];
    const e = await emir(4, [[1, ana, '2']]);
    await yap(e.id, ana, alt);
    await o().vt.tx(async (db) => {
      await db.sorgu('DELETE FROM uretim_emirleri_is_emri_bileseni WHERE is_emri_id = $1', [e.isEmirleri[0]]);
      await s.bilesenEkle(db, e.isEmirleri[0]!, { malzemeNo: ana, miktar: '3', fireYuzde: '0' });
      await s.bilesenEkle(db, e.isEmirleri[0]!, { malzemeNo: diger, miktar: '1', fireYuzde: '0' });
    });
    assert.deepEqual((await kartlar(e.id)).map((x) => x[1]).sort((a, b) => Number(a) - Number(b)), [alt, diger].sort((a, b) => a - b));
    assert.equal(await o().vt.tx((db) => bilesenIkamesiGeriAl(db, yoneticiId, { uretimEmriId: e.id, alternatifNo: alt })), true);
    assert.deepEqual((await kartlar(e.id)).map((x) => x[1]).sort((a, b) => Number(a) - Number(b)), [ana, diger].sort((a, b) => a - b));
    assert.deepEqual(await o().vt.tx((db) => bilesenIkameleri(db, [e.id])), []);
    assert.equal(await o().vt.tx((db) => bilesenIkamesiGeriAl(db, yoneticiId, { uretimEmriId: e.id, alternatifNo: alt })), false, 'ikame yoksa false');
  });

  test('yasak: emirde ana kart yok, alternatif aynı adımda zaten bileşen, başka alternatif ve kapanmış emir reddedilir; bileşen değişmez', async () => {
    const [ana, alt, alt2, baska] = [await kart(), await kart(), await kart(), await kart()];
    const e1 = await emir(2, [[1, baska, '1']]);
    assert.equal(await reddi(yap(e1.id, ana, alt)), IKAME_BILESEN_YOK);
    const e2 = await emir(2, [[1, ana, '1'], [1, alt, '1']]);
    assert.equal(await reddi(yap(e2.id, ana, alt)), IKAME_CAKISMA);
    assert.deepEqual((await kartlar(e2.id)).map((x) => x[1]).sort((a, b) => Number(a) - Number(b)), [ana, alt].sort((a, b) => a - b));
    const e3 = await emir(2, [[1, ana, '1']]);
    await yap(e3.id, ana, alt);
    assert.equal(await reddi(yap(e3.id, ana, alt2)), IKAME_BASKA);
    const e4 = await emir(2, [[1, ana, '1']]);
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now() WHERE id = $1", [e4.id]);
    assert.notEqual(await reddi(yap(e4.id, ana, alt)), 'reddedilmedi');
    assert.deepEqual((await kartlar(e4.id)).map((x) => x[1]), [ana]);
    // Kapanmış emirde ikame geri alınmaz (kayıt olduğu gibi kalır).
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now() WHERE id = $1", [e3.id]);
    assert.equal(await o().vt.tx((db) => bilesenIkamesiGeriAl(db, yoneticiId, { uretimEmriId: e3.id, alternatifNo: alt })), false);
  });

  test('P2: eşzamanlı iki ikame emri kilitler; biri yazar, öteki yazılmış ikameyi görür (aynıysa değişmez, başkaysa reddedilir)', async () => {
    const [ana, alt, alt2] = [await kart(), await kart(), await kart()];
    const e = await emir(2, [[1, ana, '1']]);
    const s0 = await surum(e.id);
    const sonuc = await Promise.allSettled([yap(e.id, ana, alt), yap(e.id, ana, alt2)]);
    assert.deepEqual(sonuc.map((x) => x.status).sort(), ['fulfilled', 'rejected']);
    const red = sonuc.find((x) => x.status === 'rejected') as PromiseRejectedResult;
    assert.equal((red.reason as Error).message, IKAME_BASKA);
    assert.equal(await surum(e.id), s0 + 1);
    assert.equal((await o().vt.tx((db) => bilesenIkameleri(db, [e.id]))).length, 1);
  });
});
