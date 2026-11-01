import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { isiBirKezCalistir, modulIsleriniKesfet } from '#cekirdek/zamanlayici.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { KUYRUK_BIRIKME_ESIGI, anahtarOzeti } from './kurallar.ts';
import { cihazNabizDurumlari, nabizKaydet } from './servis.ts';

// Kart 1666 (1619 a, 1621 a): cihaz nabzının yazılması, sıklık sınırı, günlük özet, panel okuması ve 30 günlük saklama.
// Uç ve yetki 1745 cevabıyla ayrı sınanır. Kişi ve cihaz adları uydurmadır.
describe('cihaz nabzı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let kisiId = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const NABIZ = { surum: '1.2.3', kuyruk: 0, sonEsitlemeSn: 30, jsHata: 0 };

  // Açık oturum açar; anahtarı döner (tabloya yalnız özeti yazılır).
  async function oturumAc(kapali = false): Promise<{ anahtar: string; id: number }> {
    sayac += 1;
    const anahtar = `nabiz-anahtari-${sayac}`;
    const satir = await vt().tek<{ id: number }>(
      `INSERT INTO oturum (anahtar_ozeti, kisi_id, acildi, son_gorulme, kapandi) VALUES ($1, $2, now(), now(), $3) RETURNING id::int AS id`,
      [anahtarOzeti(anahtar), kisiId, kapali ? new Date() : null],
    );
    if (!satir) throw new Error('oturum yok');
    return { anahtar, id: satir.id };
  }
  async function ortakCihaz(ad: string): Promise<{ belirtec: string; id: number }> {
    const belirtec = `nabiz-cihaz-${ad}`;
    const satir = await vt().tek<{ id: number }>(
      `INSERT INTO oturum_ortak_cihaz (belirtec_ozeti, ad, kaydeden_kisi_id, kaydedildi) VALUES ($1, $2, $3, now()) RETURNING id::int AS id`,
      [anahtarOzeti(belirtec), ad, kisiId],
    );
    if (!satir) throw new Error('cihaz yok');
    return { belirtec, id: satir.id };
  }
  const sonDurum = (oturumId: number) => vt().tek<{ kuyruk: number | null; js_hata: number; surum: string | null; esitlemeSn: number | null; ortak: number | null }>(
    `SELECT kuyruk, js_hata, istemci_surumu AS surum, ortak_cihaz_id::int AS ortak,
            round(extract(epoch FROM now() - son_esitleme))::int AS "esitlemeSn"
       FROM oturum_cihaz_nabzi WHERE oturum_id = $1`,
    [oturumId],
  );
  const gunluk = (oturumId: number) => vt().sorgu<{ nabiz: number; azami_kuyruk: number | null; js_hata: number }>(
    'SELECT nabiz, azami_kuyruk, js_hata FROM oturum_cihaz_nabzi_gunluk WHERE oturum_id = $1', [oturumId],
  );
  // Sıklık sınırını geçmek için son nabız geriye alınır.
  const geriAl = (oturumId: number, sn: number) =>
    vt().sorgu('UPDATE oturum_cihaz_nabzi SET ilk = ilk - make_interval(secs => $2), son = son - make_interval(secs => $2) WHERE oturum_id = $1', [oturumId, sn]);

  before(async () => {
    ortam = await testVeritabaniKur('nabiz');
    kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: 'nabiz-kisi', parola: 'dogru-parola-1' }));
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('ilk nabız son durumu ve günlük özeti yazar; son eşitleme sunucu saatinden hesaplanır, kişi kimliği tutulmaz', async () => {
    const o = await oturumAc();
    assert.equal(await nabizKaydet(vt(), o.anahtar, null, { ...NABIZ, kuyruk: 3, jsHata: 2 }), true);
    const d = await sonDurum(o.id);
    assert.equal(d?.kuyruk, 3);
    assert.equal(d?.js_hata, 2);
    assert.equal(d?.surum, '1.2.3');
    assert.equal(d?.ortak, null);
    assert.ok(d?.esitlemeSn !== null && d?.esitlemeSn !== undefined && Math.abs(d.esitlemeSn - 30) <= 2);
    assert.deepEqual(await gunluk(o.id), [{ nabiz: 1, azami_kuyruk: 3, js_hata: 2 }]);
    const sutunlar = (await vt().sorgu<{ ad: string }>(
      `SELECT column_name AS ad FROM information_schema.columns WHERE table_schema = current_schema() AND table_name LIKE 'oturum_cihaz_nabzi%'`,
    )).map((s) => s.ad);
    for (const yasak of ['kisi_id', 'ip', 'tarayici', 'konum']) assert.equal(sutunlar.includes(yasak), false, yasak);
  });

  test('bir dakikadan sık gelen nabız yazılmaz ve sayaçları şişirmez; süre geçince yazılır ve özet birikir', async () => {
    const o = await oturumAc();
    assert.equal(await nabizKaydet(vt(), o.anahtar, null, { ...NABIZ, kuyruk: 5, jsHata: 1 }), true);
    assert.equal(await nabizKaydet(vt(), o.anahtar, null, { ...NABIZ, kuyruk: 99, jsHata: 50 }), false);
    assert.equal((await sonDurum(o.id))?.kuyruk, 5);
    await geriAl(o.id, 61);
    assert.equal(await nabizKaydet(vt(), o.anahtar, null, { ...NABIZ, kuyruk: 2, jsHata: 4 }), true);
    assert.equal((await sonDurum(o.id))?.kuyruk, 2);
    // Günlük özet: en büyük kuyruk ve toplam hata.
    assert.deepEqual(await gunluk(o.id), [{ nabiz: 2, azami_kuyruk: 5, js_hata: 5 }]);
  });

  test('kuyruğu ve eşitlemesi bilinmeyen istemci null bildirir; null sıfıra çevrilmez, 30 günden eski eşitleme bilinmez sayılır', async () => {
    const o = await oturumAc();
    assert.equal(await nabizKaydet(vt(), o.anahtar, null, { surum: null, kuyruk: null, sonEsitlemeSn: 31 * 24 * 60 * 60, jsHata: 0 }), true);
    const d = await sonDurum(o.id);
    assert.equal(d?.kuyruk, null);
    assert.equal(d?.esitlemeSn, null);
    assert.equal(d?.surum, null);
    assert.deepEqual(await gunluk(o.id), [{ nabiz: 1, azami_kuyruk: null, js_hata: 0 }]);
  });

  test('kapalı ya da bilinmeyen oturumun nabzı yazılmaz', async () => {
    const kapali = await oturumAc(true);
    assert.equal(await nabizKaydet(vt(), kapali.anahtar, null, NABIZ), false);
    assert.equal(await sonDurum(kapali.id), null);
    assert.equal(await nabizKaydet(vt(), 'olmayan-anahtar', null, NABIZ), false);
  });

  test('ortak cihaz çereziyle gelen nabız cihaza bağlanır; kapatılmış cihazın ya da bilinmeyen belirtecin bağı boş kalır', async () => {
    const c = await ortakCihaz('Deneme Tezgah Tableti');
    const o = await oturumAc();
    assert.equal(await nabizKaydet(vt(), o.anahtar, c.belirtec, NABIZ), true);
    assert.equal((await sonDurum(o.id))?.ortak, c.id);

    const kapali = await ortakCihaz('Deneme Kapali Tablet');
    await vt().sorgu('UPDATE oturum_ortak_cihaz SET kapandi = now(), kapatan_kisi_id = $2 WHERE id = $1', [kapali.id, kisiId]);
    const o2 = await oturumAc();
    assert.equal(await nabizKaydet(vt(), o2.anahtar, kapali.belirtec, NABIZ), true);
    assert.equal((await sonDurum(o2.id))?.ortak, null);
    const o3 = await oturumAc();
    assert.equal(await nabizKaydet(vt(), o3.anahtar, 'bilinmeyen-belirtec', NABIZ), true);
    assert.equal((await sonDurum(o3.id))?.ortak, null);
  });

  test('panel: açık oturumların nabzı sessiz, kuyruk ya da iyi olarak döner; kapanan oturum düşer; kişi ve adres dönmez', async () => {
    const sessiz = await oturumAc();
    const kuyruk = await oturumAc();
    const iyi = await oturumAc();
    const kapanacak = await oturumAc();
    for (const o of [sessiz, kuyruk, iyi, kapanacak]) {
      assert.equal(await nabizKaydet(vt(), o.anahtar, null, { ...NABIZ, kuyruk: o === kuyruk ? KUYRUK_BIRIKME_ESIGI : 0 }), true);
    }
    await geriAl(sessiz.id, 16 * 60);
    await vt().sorgu('UPDATE oturum SET kapandi = now() WHERE id = $1', [kapanacak.id]);
    const satirlar = await cihazNabizDurumlari(vt());
    const durum = (id: number) => satirlar.find((s) => s.oturumId === id)?.durum;
    assert.equal(durum(sessiz.id), 'sessiz');
    assert.equal(durum(kuyruk.id), 'kuyruk');
    assert.equal(durum(iyi.id), 'iyi');
    assert.equal(durum(kapanacak.id), undefined);
    for (const s of satirlar) for (const yasak of ['kisiId', 'ip', 'tarayici']) assert.equal(yasak in s, false, yasak);
    // En uzun süredir sessiz olan önce gelir.
    assert.equal(satirlar[0]?.oturumId, sessiz.id);
  });

  test('1619 a: saklama işi 30 günden eski son durumu ve günlük özeti siler, gençlerine dokunmaz', async () => {
    const tanim = (await modulIsleriniKesfet()).find((i) => i.ad === 'oturum-nabiz-temizligi');
    if (!tanim) throw new Error('iş yok');
    assert.equal(tanim.aralikMs, 60 * 60 * 1000);
    const eski = await oturumAc();
    const genc = await oturumAc();
    for (const o of [eski, genc]) assert.equal(await nabizKaydet(vt(), o.anahtar, null, NABIZ), true);
    await geriAl(eski.id, 31 * 24 * 60 * 60);
    await geriAl(genc.id, 29 * 24 * 60 * 60);
    await vt().sorgu(`UPDATE oturum_cihaz_nabzi_gunluk SET gun = current_date - 31 WHERE oturum_id = $1`, [eski.id]);
    await vt().sorgu(`UPDATE oturum_cihaz_nabzi_gunluk SET gun = current_date - 30 WHERE oturum_id = $1`, [genc.id]);
    assert.equal(await isiBirKezCalistir(vt(), tanim), 'tamam');
    assert.equal(await sonDurum(eski.id), null);
    assert.deepEqual(await gunluk(eski.id), []);
    assert.notEqual(await sonDurum(genc.id), null);
    assert.equal((await gunluk(genc.id)).length, 1);
  });

  test('şema kısıtları: negatif kuyruk ve hata, boş ya da uzun sürüm reddedilir', async () => {
    const o = await oturumAc();
    const ekle = (kuyruk: number | null, jsHata: number, surum: string | null) => vt().sorgu(
      `INSERT INTO oturum_cihaz_nabzi (oturum_id, ilk, son, istemci_surumu, kuyruk, js_hata) VALUES ($1, now(), now(), $2, $3, $4)`,
      [o.id, surum, kuyruk, jsHata],
    );
    await assert.rejects(ekle(-1, 0, null), /oturum_cihaz_nabzi_kuyruk/);
    await assert.rejects(ekle(0, -1, null), /oturum_cihaz_nabzi_js_hata/);
    await assert.rejects(ekle(0, 0, ''), /oturum_cihaz_nabzi_surum/);
    await assert.rejects(ekle(0, 0, 'x'.repeat(65)), /oturum_cihaz_nabzi_surum/);
    await ekle(null, 0, 'x'.repeat(64));
  });
});
