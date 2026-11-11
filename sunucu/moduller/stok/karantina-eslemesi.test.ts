import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

// 2884: haritaya çizilen karantina alanı eşlemeyle stok konumu olur ve GKK isteyen kartın mal kabulü oraya girer. Konum yokken ileti
// nedeni söyler: haritada alan yoksa bugünkü ileti, alan var ama eşlenmemişse (ya da konumu kapanmışsa) "Haritadan eşle".
describe('karantina alanı eşlemesi ve mal kabul iletisi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let sira = 0;
  let cerez = '';

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const istek = (yontem: 'GET' | 'POST', yol: string, govde?: unknown) => app.inject({
    method: yontem, url: `/api${yol}`, headers: { cookie: cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() },
    ...(govde === undefined ? {} : { payload: govde as object }),
  });

  async function gkkKarti(): Promise<number> {
    sira += 1;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, gkk_gerekli)
       VALUES ($1, 'hammadde', 'KRE-DNM-', $2, 'aktif', $3, $4, $4, true) RETURNING no`,
      [`kre-dnm-${sira}`, sira, JSON.stringify({ id: `kre-dnm-${sira}`, com: { ad: `Deneme hammadde ${sira}` } }), yoneticiId],
    ))!.no;
  }
  async function siparisSatiri(miktar: string, malzemeNo: number | null = null): Promise<number> {
    sira += 1;
    const [t, kl, tk] = [randomUUID(), randomUUID(), randomUUID()];
    const s = o().sahip;
    await s.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2099, $2, 'Deneme talep', $3, $3, 'siparis_verildi')",
      [t, 81000 + sira, yoneticiId]);
    const katalog = malzemeNo === null ? null : randomUUID();
    if (katalog !== null) await s.sorgu('INSERT INTO satin_alma_katalog (id, malzeme_no) VALUES ($1, $2)', [katalog, malzemeNo]);
    await s.sorgu("INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, katalog_id) VALUES ($1, $2, 1, 'Deneme kalem', $3)", [t, kl, katalog]);
    await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, para_birimi, teklif_tarihi, tedarikci_adi) VALUES ($1, $2, 'TRY', current_date, 'Deneme Tedarikçi')", [t, tk]);
    await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, karar_tarihi) VALUES ($1, 'bolunmus', current_date)", [t]);
    await s.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id) VALUES ($1, $2)', [t, tk]);
    return (await s.tek<{ id: number }>("INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim) VALUES ($1, $2, $3, $4, 'adet') RETURNING id",
      [t, tk, kl, miktar]))!.id;
  }
  const malKabul = async (malzemeId: number, miktar: string) =>
    istek('POST', '/stok/mal-kabul', { tur: 'satin_alma', satirlar: [{ malzemeId, miktar, siparisSatirId: await siparisSatiri(miktar) }] });

  before(async () => {
    ortam = await testVeritabaniKur('stok_karantina_eslemesi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const r = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(r.statusCode, 200, r.body);
    cerez = String(r.headers['set-cookie']).split(';')[0] ?? '';
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('KRE-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('alanı olmayan kapalı karantina konumu haritada yok sayılır; karantinaya dönen alanın konumu başka türde stok tutuyorsa neden stok', async () => {
    await o().sahip.sorgu("UPDATE stok_konum SET aktif = false WHERE tur = 'karantina'");
    await o().sahip.sorgu("DELETE FROM atolye_alan WHERE tur = 'karantina'");
    const kart = await gkkKarti();
    // Kapalı karantina konumu var ama haritada karantina alanı yok: bugünkü ileti.
    const pasif = await malKabul(kart, '1');
    assert.equal(pasif.statusCode, 400, pasif.body);
    assert.match(pasif.json().mesaj, /^Karantina konumu yok; giriş kalite kontrolü için Depo haritasına karantina alanı ekleyin\.$/);

    const salon = await o().sahip.tek<{ id: number }>(
      "INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, fabrika_x, fabrika_z, kaydeden_kisi_id) VALUES ('KRE-2', 'Deneme bölüm 2', 20, 20, 4, 500, 500, $1) RETURNING id", [yoneticiId]);
    const alan = await o().sahip.tek<{ id: number }>(
      "INSERT INTO atolye_alan (salon_id, tur, ad, x, z, donus, genislik, derinlik) VALUES ($1, 'bolge', 'Deneme bölge', 2, 2, 0, 2, 2) RETURNING id", [salon!.id]);
    assert.equal((await istek('POST', '/stok/konumlar/haritadan-esle')).statusCode, 200);
    const bolge = await o().sahip.tek<{ id: number }>("SELECT id FROM stok_konum WHERE atolye_alan_id = $1 AND tur = 'bolge'", [alan!.id]);
    // Serbest kart KABUL'e girer, bölgeye taşınır; sonra alan karantinaya döner: stoklu konumun türü eşlemede değişmez.
    sira += 1;
    const serbest = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'sarf', 'KRE-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`kre-dnm-${sira}`, sira, JSON.stringify({ id: `kre-dnm-${sira}`, com: { ad: `Deneme sarf ${sira}` } }), yoneticiId]))!.no;
    const giris = await istek('POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: serbest, miktar: '2' }] });
    assert.equal(giris.statusCode, 200, giris.body);
    const kabul = await o().sahip.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'");
    const tasi = await istek('POST', '/stok/tasima', { malzemeId: serbest, kaynakKonumId: kabul!.id, hedefKonumId: bolge!.id, miktar: '2' });
    assert.equal(tasi.statusCode, 200, tasi.body);
    await o().sahip.sorgu("UPDATE atolye_alan SET tur = 'karantina' WHERE id = $1", [alan!.id]);
    assert.equal((await istek('POST', '/stok/konumlar/haritadan-esle')).statusCode, 200);
    const stoklu = await malKabul(kart, '1');
    assert.equal(stoklu.statusCode, 400, stoklu.body);
    assert.match(stoklu.json().mesaj, /^Karantina alanının stok konumunda başka türde stok var; .*stoğu taşıyın/);
  });

  test('haritada alan yok: bugünkü ileti; alan çizilmiş ama eşlenmemiş: eşleme iletisi; eşlemeden sonra kabul karantinaya girer', async () => {
    await o().sahip.sorgu("UPDATE stok_konum SET aktif = false WHERE tur = 'karantina'");
    // Önceki testin stoklu alanı haritadan karantina olmaktan çıkar (stoklu konum silinemez).
    await o().sahip.sorgu("UPDATE atolye_alan SET tur = 'bolge' WHERE tur = 'karantina'");
    const kart = await gkkKarti();

    const yok = await malKabul(kart, '5');
    assert.equal(yok.statusCode, 400, yok.body);
    assert.equal(yok.json().mesaj, 'Karantina konumu yok; giriş kalite kontrolü için Depo haritasına karantina alanı ekleyin.');

    // Deposuz bölümdeki karantina alanı ANA depoya bağlanır; eşleme koşmadan konum yoktur.
    const salon = await o().sahip.tek<{ id: number }>(
      "INSERT INTO atolye_salon (kod, ad, genislik, derinlik, hucre_boyu, fabrika_x, fabrika_z, kaydeden_kisi_id) VALUES ('KRE-1', 'Deneme bölüm', 20, 20, 4, 400, 400, $1) RETURNING id", [yoneticiId]);
    const alan = await o().sahip.tek<{ id: number }>(
      "INSERT INTO atolye_alan (salon_id, tur, ad, x, z, donus, genislik, derinlik) VALUES ($1, 'karantina', 'Karantina', 2, 2, 0, 2, 2) RETURNING id", [salon!.id]);
    const eslenmemis = await malKabul(kart, '5');
    assert.equal(eslenmemis.statusCode, 400, eslenmemis.body);
    assert.match(eslenmemis.json().mesaj, /^Karantina alanı haritada var ama stok konumu değil; .*"Haritadan eşle"/);
    assert.doesNotMatch(eslenmemis.json().mesaj, /alanı ekleyin/);
    // Fason dönüşü de aynı nedeni kendi amacıyla söyler; karantina konumu iş emrinden önce aranır.
    sira += 1;
    const hizmet = (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id, hizmet_yonu)
       VALUES ($1, 'hizmet', 'KRE-DNM-', $2, 'aktif', $3, $4, $4, 'alinan') RETURNING no`,
      [`kre-dnm-${sira}`, sira, JSON.stringify({ id: `kre-dnm-${sira}`, com: { ad: `Deneme kaplama ${sira}` } }), yoneticiId]))!.no;
    const fason = await istek('POST', '/stok/mal-kabul', { tur: 'satin_alma', satirlar: [{ malzemeId: kart, miktar: '1', siparisSatirId: await siparisSatiri('1', hizmet), fasonIsi: { isEmriId: 999999 } }] });
    assert.equal(fason.statusCode, 400, fason.body);
    assert.match(fason.json().mesaj, /^Karantina alanı haritada var ama stok konumu değil; fason dönüşü için /);

    assert.equal((await istek('POST', '/stok/konumlar/haritadan-esle')).statusCode, 200);
    const konum = async () => o().sahip.tek<{ id: number; tur: string; aktif: boolean }>('SELECT id, tur, aktif FROM stok_konum WHERE atolye_alan_id = $1', [alan!.id]);
    assert.deepEqual([(await konum())?.tur, (await konum())?.aktif], ['karantina', true]);

    // Konumu kapanmış alan da eşleme ister (eşleme yeniden açar); ileti haritaya alan eklemeyi söylemez.
    await o().sahip.sorgu('UPDATE stok_konum SET aktif = false WHERE atolye_alan_id = $1', [alan!.id]);
    const kapali = await malKabul(kart, '1');
    assert.equal(kapali.statusCode, 400, kapali.body);
    assert.match(kapali.json().mesaj, /^Karantina alanı haritada var ama stok konumu değil/);
    assert.equal((await istek('POST', '/stok/konumlar/haritadan-esle')).statusCode, 200);
    assert.equal((await konum())?.aktif, true);

    const giren = await malKabul(kart, '5');
    assert.equal(giren.statusCode, 200, giren.body);
    const bakiye = await o().sahip.tek<{ m: string; k: string }>(
      'SELECT sum(miktar)::text AS m, min(kalite_durumu) AS k FROM stok_bakiye WHERE konum_id = $1 AND malzeme_id = $2', [(await konum())!.id, kart]);
    assert.deepEqual([bakiye?.m, bakiye?.k], ['5.000', 'karar_bekliyor']);
  });
});
