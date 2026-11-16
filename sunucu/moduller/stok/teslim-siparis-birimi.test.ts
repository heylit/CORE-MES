import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { acikSiparisSatirlariCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

// 3332-2 a: mal kabul stoka stok biriminde (adet) girer, siparişe sipariş biriminde (kg) teslim yazar. Karşılık kartın dönüşümündendir;
// tartılan miktar yazıldıysa o kullanılır; dönüşüm yoksa sipariş birimindeki miktar istenir, uydurulmaz. Düzeltme ikisini ters çevirir.
// Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('stok mal kabulde teslim sipariş biriminde (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let kisi = 0, sira = 0, talepSira = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const post = async (url: string, payload: object) => {
    const c = await app.inject({ method: 'POST', url: `/api${url}`, headers: { cookie: cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload });
    return { durum: c.statusCode, govde: c.json() as { belge?: { id: number }; alan?: string; mesaj?: string } };
  };
  async function kart(ek: { birim: string; birimKg?: number; alisBirimi?: string; katsayi?: string }): Promise<number> {
    sira += 1;
    await o().sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('TSB-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, birim_agirlik_kg, alis_birimi, alis_katsayisi)
       VALUES ($1, 'hammadde', 'TSB-DNM-', $2, 'aktif', $3, $4, $4, $5, $6, $7) RETURNING no`,
      [`tsb-dnm-${sira}`, sira, JSON.stringify({ id: `tsb-dnm-${sira}`, com: { ad: `Deneme ORN-cubuk ${sira}`, birim: ek.birim } }), kisi, ek.birimKg ?? null, ek.alisBirimi ?? null, ek.katsayi ?? null]))!.no;
  }
  async function siparisSatiri(malzemeNo: number, miktar: string, birim: string): Promise<number> {
    const [t, kl, tk, katalog] = [randomUUID(), randomUUID(), randomUUID(), randomUUID()];
    const s = o().sahip;
    await s.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2099, $2, 'Deneme talep', $3, $3, 'siparis_verildi')", [t, 94000 + (talepSira += 1), kisi]);
    await s.sorgu('INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)', [katalog, malzemeNo]);
    await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, katalog_id) VALUES ($1, $2, 1, 'Deneme ORN-cubuk', $3)", [t, kl, katalog]);
    await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi, tedarikci_adi) VALUES ($1, $2, 'TRY', current_date, 'ORN Celik')", [t, tk]);
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
    await s.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [t, tk]);
    return (await s.tek<{ id: number }>('INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, $4, $5) RETURNING id', [t, tk, kl, miktar, birim]))!.id;
  }
  const kabul = (malzemeId: number, siparisSatirId: number, miktar: string, siparisMiktari?: string) =>
    post('/stok/mal-kabul', { tur: 'satin_alma', satirlar: [{ malzemeId, miktar, siparisSatirId, ...(siparisMiktari ? { siparisMiktari } : {}) }] });
  const teslimler = async (siparisSatirId: number) => (await o().sahip.sorgu<{ miktar: string; stok: string | null }>(
    'SELECT miktar::text, stok_miktar::text AS stok FROM satin_alma_teslim WHERE siparis_satiri_id = $1 ORDER BY id', [siparisSatirId])).map((x) => [Number(x.miktar), x.stok === null ? null : Number(x.stok)]);
  const stok = async (malzemeId: number) => Number((await o().sahip.tek<{ m: string | null }>('SELECT sum(miktar)::text AS m FROM stok_bakiye WHERE malzeme_id = $1', [malzemeId]))!.m ?? '0');
  const kalan = async (siparisSatirId: number): Promise<string | null> => {
    const c = await app.inject({ method: 'GET', url: '/api/stok/acik-siparis-satirlari', headers: { cookie: cerez } });
    return acikSiparisSatirlariCevabi.parse(c.json()).satirlar.find((x) => x.id === siparisSatirId)?.kalanMiktar ?? null;
  };

  before(async () => {
    ortam = await testVeritabaniKur('stok_teslim_siparis_birimi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisi = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const [depo, yon] = [(await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'depo'"))!.id, (await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!.id];
    for (const i of ['stok.giris', 'stok.geri-al']) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [depo, i]);
    await ortam.vt.tx(async (db) => {
      const k = await yoneticiOlustur(db, { ad: 'Deneme depo', kullaniciAdi: 'depo', parola: PAROLA });
      await rolAta(db, kisi, k, depo);
      await rolAl(db, kisi, k, yon);
    });
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'depo', parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    // Hammadde giriş kalite kontrolüyle karantinaya girer; stok toplamı konumdan bağımsızdır.
    await ortam.sahip.sorgu("INSERT INTO stok_konum (depo_id, kod, tur) SELECT depo_id, 'TSB-KRN', 'karantina' FROM stok_konum WHERE kod = 'KABUL'");
  });
  after(async () => { await ortam?.kaldir(); });

  test('kg siparişe 10 adet kabul: stokta 10 adet, siparişe 240 kg teslim, kalan 0; düzeltme ikisini birlikte geri alır', async () => {
    const m = await kart({ birim: 'adet', birimKg: 24 });
    const ss = await siparisSatiri(m, '240', 'kg');
    const c = await kabul(m, ss, '10');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(await stok(m), 10);
    assert.deepEqual(await teslimler(ss), [[240, 10]]);
    assert.equal(await kalan(ss), null, 'tam teslim edilen satır açık listeden düşer');
    const d = await post(`/stok/mal-kabuller/${c.govde.belge!.id}/duzelt`, { satirlar: [{ malzemeId: m, miktar: '5', siparisSatirId: ss }] });
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    assert.equal(await stok(m), 5);
    assert.deepEqual(await teslimler(ss), [[240, 10], [-240, -10], [120, 5]]);
    assert.equal(Number(await kalan(ss)), 120);
  });

  test('tartılan kg yazıldıysa teslim odur; aynı birimde stok karşılığı yazılmaz', async () => {
    const m = await kart({ birim: 'adet', birimKg: 24 });
    const ss = await siparisSatiri(m, '480', 'kg');
    assert.equal((await kabul(m, ss, '10', '238.5')).durum, 200);
    assert.deepEqual(await teslimler(ss), [[238.5, 10]]);
    const ayni = await siparisSatiri(m, '20', 'Adet');
    assert.equal((await kabul(m, ayni, '4')).durum, 200);
    assert.deepEqual(await teslimler(ayni), [[4, null]]);
  });

  test('dönüşüm yoksa sipariş birimindeki miktar istenir; yazılınca o teslim olur', async () => {
    const m = await kart({ birim: 'adet' });
    const ss = await siparisSatiri(m, '60', 'kg');
    const r = await kabul(m, ss, '3');
    assert.equal(r.durum, 400, JSON.stringify(r.govde));
    assert.equal(r.govde.alan, 'satirlar.0.siparisMiktari');
    assert.equal(await stok(m), 0, 'reddedilen satır stoka girmez');
    assert.deepEqual(await teslimler(ss), []);
    assert.equal((await kabul(m, ss, '3', '58')).durum, 200);
    assert.deepEqual(await teslimler(ss), [[58, 3]]);
  });

  test('alış biriminde sipariş: 100 adet kabul, kutu katsayısı 50 -> siparişe 2 kutu; sıfır tartılan reddedilir', async () => {
    const m = await kart({ birim: 'adet', alisBirimi: 'kutu', katsayi: '50' });
    const ss = await siparisSatiri(m, '3', 'kutu');
    assert.equal((await kabul(m, ss, '100')).durum, 200);
    assert.deepEqual(await teslimler(ss), [[2, 100]]);
    const sifir = await kabul(m, ss, '50', '0');
    assert.equal(sifir.durum, 400, JSON.stringify(sifir.govde));
    assert.deepEqual(await teslimler(ss), [[2, 100]], 'reddedilen satır teslim yazmaz');
  });
});
