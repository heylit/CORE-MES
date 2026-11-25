import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import { TEZGAH_BAGLANTISI_AYARLARI } from '#paylasilan/ayarlar/tezgah-baglantisi.ts';
import { tezgahAyrintisiCevabi, tezgahBaglantisiDurumCevabi } from '#paylasilan/sozlesme/tezgah-baglantisi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tezgahIstemcisiKur } from './istemci.ts';
import { sahteMtconnectAc } from './sahte-mtconnect.ts';
import type { SahteMtconnect } from './sahte-mtconnect.ts';
import { ayrinti, durum, okumaTuru, yeniTurBellegi, zamanlanmisTur } from './servis.ts';
import type { TurBellegi } from './servis.ts';

const PAROLA = 'dogru-parola-1';

describe('tezgah bağlantısı denemesi (kart 3373, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let sahte: SahteMtconnect;
  let bellek: TurBellegi;
  let yonetici = '';
  let rollu = '';
  let simdi = Date.parse('2026-11-10T09:00:00Z');

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (yontem: 'GET' | 'POST', yol: string, govde?: unknown, c = yonetici) =>
    app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: c }, ...(govde === undefined ? {} : { payload: govde as object }) });
  const ayar = async (deger: boolean) => {
    const c = await istek('POST', '/ayarlar/tezgah-baglantisi.okuma/degistir', { deger });
    assert.equal(c.statusCode, 200, c.body);
  };
  const istemci = (sure = 2000) => tezgahIstemcisiKur(sahte.adres, { istekSuresiMs: sure });
  const tur = (i: ReturnType<typeof istemci> | null = istemci()) => okumaTuru(vt(), { istemci: i, saat: () => new Date(simdi), bellek });
  const pano = async () => tezgahBaglantisiDurumCevabi.parse(await vt().tx((db) => durum(db, istemci(), bellek, new Date(simdi))));
  const ayrintiAl = async (cihaz: string) => tezgahAyrintisiCevabi.parse(await vt().tx((db) => ayrinti(db, cihaz, new Date(simdi), bellek)));
  const say = async (tablo: string) => (await vt().tek<{ n: number }>(`SELECT count(*)::int AS n FROM ${tablo}`))?.n;
  async function giris(kullaniciAdi: string): Promise<string> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  }

  before(async () => {
    ortam = await testVeritabaniKur('tezbag');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Tezgah', kullaniciAdi: 'tz-yonetici', parola: PAROLA }));
    yonetici = await giris('tz-yonetici');
    const id = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Rollu', kullaniciAdi: 'tz-rollu', parola: PAROLA }));
    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('tz_rol', 'tz_rol')");
    // Rol, tezgah bağlantısı dışındaki bütün işlemleri taşır: uçların yetkisi başka bir işleme genişlerse 403 testi kırılır.
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT r.id, i FROM rol r, unnest($1::text[]) i WHERE r.kod = 'tz_rol'",
      [ISLEMLER.filter((i) => i !== 'sayfa.tezgah-baglantisi')]);
    await vt().sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'tz_rol') WHERE kisi_id = $1", [id]);
    rollu = await giris('tz-rollu');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    simdi += 3_600_000;
    sahte = await sahteMtconnectAc([
      { ad: 'ORN-T01', calisma: 'ACTIVE', mod: 'AUTOMATIC', program: 'O1001', sayac: '148', takim: '7', hiz: '2350', yuk: '42', ilerleme: '180' },
      { ad: 'ORN-T04', calisma: 'READY', mod: 'AUTOMATIC', program: 'O2002', sayac: '63', hiz: '0', yuk: '0' },
    ], simdi);
    bellek = yeniTurBellegi();
    for (const t of ['tezgah_okuma', 'tezgah_ornek', 'tezgah_alan_tanimi', 'tezgah_deger_gecmisi', 'tezgah_varlik', 'tezgah_veri_boslugu', 'tezgah_turu', 'smartes_makine_durumu']) await vt().sorgu(`DELETE FROM ${t}`);
    await ayar(true);
  });
  afterEach(async () => { await sahte.kapat(); });

  test('anahtar varsayılan kapalıdır; anahtar kapalıyken ya da adres yokken hiç istek gitmez ve hiçbir şey yazılmaz', async () => {
    assert.equal(TEZGAH_BAGLANTISI_AYARLARI['tezgah-baglantisi.okuma'].varsayilan, false);
    await ayar(false);
    assert.deepEqual(await tur(), { tur: 'kapali' });
    await ayar(true);
    assert.deepEqual(await tur(null), { tur: 'adres-yok' });
    assert.equal(sahte.istekler.length, 0);
    assert.equal(await say('tezgah_okuma'), 0);
    assert.equal((await pano()).tezgahlar.length, 0);
  });

  test('ilk tur /probe ve /current okur; sonraki turlar yalnız /sample ister; değerler saklanır, durum değişince örnek yazılır', async () => {
    assert.deepEqual(await tur(), { tur: 'okundu', tezgah: 2 });
    simdi += 5000;
    assert.deepEqual(await tur(), { tur: 'okundu', tezgah: 2 });
    assert.ok(sahte.istekler.every((i) => i.yontem === 'GET'));
    const yollar = sahte.istekler.map((i) => i.yol.split('?')[0]);
    assert.deepEqual(yollar.filter((y) => y !== '/assets'), ['/probe', '/current', '/sample']);
    const sample = sahte.istekler.find((i) => i.yol.startsWith('/sample'));
    assert.ok(sample?.yol.endsWith('&count=1000') && /^\/sample\?from=\d+&/.test(sample.yol));
    assert.equal(await say('tezgah_okuma'), 2);
    assert.equal(await say('tezgah_ornek'), 2);
    sahte.degistir(0, 'calisma', 'STOPPED');
    simdi += 5000;
    await tur();
    assert.equal(await say('tezgah_ornek'), 3);
    const p = await pano();
    assert.equal(p.baglanti, 'acik');
    assert.equal(p.aralikSaniye, 5);
    assert.equal(p.sonHata, null);
    assert.deepEqual(p.tezgahlar.map((t) => [t.cihazAdi, t.durum, t.sayac, t.eski, t.smartes]), [['ORN-T01', 'bekliyor', 148, false, null], ['ORN-T04', 'bekliyor', 63, false, null]]);
  });

  test('tur aralığı: varsayılan 5 saniyede bir; ayar 30 yapılınca 30 saniyede bir', async () => {
    const say60 = async (): Promise<number> => {
      bellek = yeniTurBellegi();
      let okunan = 0;
      for (let s = 0; s < 60; s += 1) {
        simdi += 1000;
        const r = await zamanlanmisTur(vt(), { istemci: istemci(), saat: () => new Date(simdi), bellek });
        if (r.tur === 'okundu') okunan += 1;
        else assert.equal(r.tur, 'erken');
      }
      return okunan;
    };
    assert.equal(await say60(), 12);
    const ayarla = async (deger: number) => assert.equal((await istek('POST', '/ayarlar/tezgah-baglantisi.okuma-araligi/degistir', { deger })).statusCode, 200);
    await ayarla(30);
    assert.equal(await say60(), 2);
    assert.equal((await pano()).aralikSaniye, 30);
    assert.equal((await istek('POST', '/ayarlar/tezgah-baglantisi.okuma-araligi/degistir', { deger: 4 })).statusCode, 400);
    assert.equal((await istek('POST', '/ayarlar/tezgah-baglantisi.okuma-araligi/degistir', { deger: 61 })).statusCode, 400);
    await ayarla(5);
  });

  test('art arda hatada aralık 60 saniyeye kadar ikiye katlanır; başarılı turda 5 saniyeye döner', async () => {
    await tur();
    sahte.ozel['/sample'] = { durum: 500, govde: 'ORN hata' };
    const simdi0 = simdi;
    const baslar: number[] = [];
    for (let s = 0; s < 200; s += 1) {
      simdi += 1000;
      const r = await zamanlanmisTur(vt(), { istemci: istemci(), saat: () => new Date(simdi), bellek });
      if (r.tur !== 'erken') baslar.push(simdi);
    }
    const farklar = baslar.slice(1).map((b, i) => (b - (baslar[i] ?? 0)) / 1000);
    assert.equal((baslar[0] ?? 0) - simdi0, 5000, 'ilk deneme 5 saniye sonra');
    assert.deepEqual(farklar.slice(0, 5), [10, 20, 40, 60, 60]);
    delete sahte.ozel['/sample'];
    simdi += 60_000;
    assert.equal((await zamanlanmisTur(vt(), { istemci: istemci(), saat: () => new Date(simdi), bellek })).tur, 'okundu');
    assert.equal(bellek.ardisikHata, 0);
    simdi += 5000;
    assert.equal((await zamanlanmisTur(vt(), { istemci: istemci(), saat: () => new Date(simdi), bellek })).tur, 'okundu');
  });

  test('/sample son sıradan sürer: iki tur arasındaki üç değişikliğin üçü de geçmişte vardır', async () => {
    await tur();
    for (const sayac of ['149', '150', '151']) sahte.degistir(0, 'sayac', sayac);
    simdi += 5000;
    await tur();
    const satirlar = await vt().sorgu<{ deger: string }>("SELECT deger FROM tezgah_deger_gecmisi WHERE cihaz_adi = 'ORN-T01' AND data_item_id = 'pc' ORDER BY sira");
    assert.deepEqual(satirlar.map((r) => r.deger), ['148', '149', '150', '151']);
    assert.equal(sahte.istekler.filter((i) => i.yol.startsWith('/current')).length, 1);
    const p = await pano();
    assert.equal(p.tezgahlar[0]?.sayac, 151);
    // Aynı tur tekrar çalışırsa değişiklik yoksa çift satır yazılmaz.
    simdi += 5000;
    await tur();
    assert.equal(await say('tezgah_deger_gecmisi WHERE data_item_id = \'pc\' AND cihaz_adi = \'ORN-T01\''), 4);
  });

  test('değeri gelmeyen alan geçmişe null yazılır, sıfır yazılmaz', async () => {
    await tur();
    sahte.degistir(0, 'sayac', 'UNAVAILABLE');
    simdi += 5000;
    await tur();
    const son = await vt().tek<{ deger: string | null }>("SELECT deger FROM tezgah_deger_gecmisi WHERE cihaz_adi = 'ORN-T01' AND data_item_id = 'pc' ORDER BY sira DESC LIMIT 1");
    assert.equal(son?.deger, null, 'UNAVAILABLE değer yok demektir');
    sahte.degistir(0, 'sayac', undefined);
    simdi += 5000;
    await tur();
    const yok = await vt().tek<{ deger: string | null }>("SELECT deger FROM tezgah_deger_gecmisi WHERE cihaz_adi = 'ORN-T01' AND data_item_id = 'pc' ORDER BY sira DESC LIMIT 1");
    assert.equal(yok?.deger, null);
  });

  test('tampon taşınca boşluk kaydı yazılır ve okuma /current ile sürer', async () => {
    await tur();
    sahte.tamponBoyu = 3;
    for (let i = 0; i < 10; i += 1) sahte.degistir(0, 'sayac', String(200 + i));
    simdi += 5000;
    assert.deepEqual(await tur(), { tur: 'okundu', tezgah: 2 });
    const b = await vt().sorgu<{ neden: string }>('SELECT neden FROM tezgah_veri_boslugu');
    assert.deepEqual(b.map((r) => r.neden), ['tampon-asildi']);
    assert.ok(sahte.istekler.filter((i) => i.yol.startsWith('/current')).length >= 2);
    assert.equal((await pano()).tezgahlar[0]?.sayac, 209);
    simdi += 5000;
    sahte.degistir(0, 'sayac', '210');
    await tur();
    assert.equal(await say('tezgah_veri_boslugu'), 1);
    assert.equal((await pano()).tezgahlar[0]?.sayac, 210);
    const a = await ayrintiAl('ORN-T01');
    assert.deepEqual(a.bosluklar.map((x) => x.neden), ['tampon-asildi']);
  });

  test('servis OUT_OF_RANGE hatası verirse de boşluk yazılır ve okuma sürer', async () => {
    await tur();
    sahte.ozel['/sample'] = { durum: 404, govde: '<MTConnectError><Errors><Error errorCode="OUT_OF_RANGE">ORN</Error></Errors></MTConnectError>' };
    simdi += 5000;
    assert.equal((await tur()).tur, 'okundu');
    assert.equal(await say('tezgah_veri_boslugu'), 1);
    assert.equal(sahte.istekler.filter((i) => i.yol === '/current').length, 2);
  });

  test('instanceId değişince /probe yeniden okunur, alan tanımları güncellenir, boşluk yazılır', async () => {
    await tur();
    assert.equal(await say('tezgah_alan_tanimi'), 2 * 11);
    sahte.tezgahlar.push({ ad: 'ORN-T07', calisma: 'READY' });
    sahte.yenidenBasla();
    simdi += 5000;
    assert.deepEqual(await tur(), { tur: 'okundu', tezgah: 3 });
    assert.equal(sahte.istekler.filter((i) => i.yol === '/probe').length, 2);
    assert.equal(await say('tezgah_alan_tanimi'), 3 * 11);
    assert.deepEqual((await vt().sorgu<{ neden: string }>('SELECT neden FROM tezgah_veri_boslugu')).map((r) => r.neden), ['servis-yeniden-basladi']);
    simdi += 5000;
    sahte.degistir(2, 'calisma', 'ACTIVE');
    await tur();
    assert.equal((await pano()).tezgahlar.find((t) => t.cihazAdi === 'ORN-T07')?.durum, 'calisiyor');
  });

  test('alan tanımı: bileşen, birim ve kategori /probe\'dan dolar', async () => {
    await tur();
    const t = await vt().tek<{ tur: string; bilesen: string; bilesen_adi: string; birim: string; kategori: string }>(
      "SELECT tur, bilesen, bilesen_adi, birim, kategori FROM tezgah_alan_tanimi WHERE cihaz_adi = 'ORN-T01' AND data_item_id = 'sspeed'");
    assert.deepEqual({ ...t }, { tur: 'SPINDLE_SPEED', bilesen: 'Rotary', bilesen_adi: 'S', birim: 'REVOLUTION/MINUTE', kategori: 'SAMPLE' });
    const a = await ayrintiAl('ORN-T01');
    const hiz = a.alanlar.find((x) => x.kimlik === 'sspeed');
    assert.deepEqual([hiz?.birim, hiz?.kategori, hiz?.bilesen, hiz?.deger], ['REVOLUTION/MINUTE', 'SAMPLE', 'Rotary', '2350']);
  });

  test('ayrıntı: son saatin eğrisi geçmiş tablodan gelir; koşullar başlangıç ve bitişiyle; olmayan tezgah 404', async () => {
    await tur();
    for (const h of ['2400', '2500', '2600']) { sahte.degistir(0, 'hiz', h); simdi += 5000; await tur(); }
    sahte.kosulYaz(0, [['MOTION_PROGRAM', 'Fault', 'ORN hata']]);
    simdi += 5000;
    await tur();
    sahte.kosulYaz(0, [['MOTION_PROGRAM', 'Normal', '']]);
    simdi += 5000;
    await tur();
    const a = await ayrintiAl('ORN-T01');
    const egri = a.alanlar.find((x) => x.kimlik === 'sspeed')?.egri ?? [];
    assert.ok(egri.length >= 1 && egri.every((p) => Number.isFinite(p.deger)));
    assert.equal(a.alanlar.find((x) => x.kimlik === 'exec')?.egri.length, 0);
    const f = a.kosullar.find((k) => k.hal === 'Fault');
    assert.ok(f !== undefined && f.bitis !== null && f.ileti === 'ORN hata');
    assert.equal(a.kosullar.find((k) => k.hal === 'Normal' && k.bitis === null)?.kimlik, 'k');
    assert.ok(a.alanlar.every((x) => x.deger === null || !x.kimlik?.startsWith('k')));
  });

  test('/assets 60 saniyede bir okunur; takımlar ve ömür sınırları saklanır; servis /assets vermiyorsa tur hata vermez', async () => {
    await tur();
    assert.equal((await pano()).varlikDurumu, 'yok');
    assert.equal(bellek.sonHata, null);
    assert.equal((await ayrintiAl('ORN-T01')).varliklar.length, 0);
    sahte.varliklar = [{ kimlik: 'ORN-A1', takimNo: '7', omurler: [['MINUTES', 85, 120, 10, 0]] }];
    simdi += 5000;
    await tur();
    assert.equal(sahte.istekler.filter((i) => i.yol === '/assets').length, 1, '60 saniye dolmadan yeniden okunmaz');
    simdi += 60_000;
    assert.equal((await tur()).tur, 'okundu');
    assert.equal(sahte.istekler.filter((i) => i.yol === '/assets').length, 2);
    const a = await ayrintiAl('ORN-T01');
    assert.deepEqual(a.varliklar.map((v) => [v.kimlik, v.takimNo, v.omurler[0]?.deger, v.omurler[0]?.sinir, v.omurler[0]?.baslangic]), [['ORN-A1', '7', 85, 0, 120]]);
    assert.equal(a.varlikDurumu, 'okundu');
    sahte.ozel['/assets'] = { durum: 500, govde: 'x' };
    simdi += 60_000;
    assert.equal((await tur()).tur, 'okundu');
    assert.equal((await pano()).varlikDurumu, 'hata');
  });

  test('geçmiş yirmi dört saat saklanır ve saatte bir silinir; durum örnekleri otuz gün kalır', async () => {
    await vt().sorgu(
      `INSERT INTO tezgah_deger_gecmisi (cihaz_adi, data_item_id, sira, zaman, deger) VALUES ('ORN-T01', 'eski', 1, $1, '1'), ('ORN-T01', 'yeni', 2, $2, '2')`,
      [new Date(simdi - 25 * 3_600_000), new Date(simdi - 23 * 3_600_000)]);
    await vt().sorgu("INSERT INTO tezgah_veri_boslugu (zaman, neden) VALUES ($1, 'tampon-asildi'), ($2, 'tampon-asildi')", [new Date(simdi - 25 * 3_600_000), new Date(simdi - 23 * 3_600_000)]);
    await vt().sorgu("INSERT INTO tezgah_ornek (cihaz_adi, zaman, durum) VALUES ('ORN-T01', $1, 'bekliyor'), ('ORN-T01', $2, 'bekliyor')", [new Date(simdi - 31 * 86_400_000), new Date(simdi - 20 * 86_400_000)]);
    await tur();
    const kal = async () => (await vt().sorgu<{ data_item_id: string }>("SELECT data_item_id FROM tezgah_deger_gecmisi WHERE data_item_id IN ('eski', 'yeni') ORDER BY 1")).map((r) => r.data_item_id);
    assert.deepEqual(await kal(), ['yeni']);
    assert.equal(await say('tezgah_veri_boslugu'), 1);
    assert.equal((await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM tezgah_ornek WHERE zaman < $1", [new Date(simdi - 30 * 86_400_000)]))?.n, 0);
    await vt().sorgu("INSERT INTO tezgah_deger_gecmisi (cihaz_adi, data_item_id, sira, zaman, deger) VALUES ('ORN-T01', 'eski', 3, $1, '1')", [new Date(simdi - 25 * 3_600_000)]);
    simdi += 5000;
    await tur();
    assert.deepEqual(await kal(), ['eski', 'yeni'], 'saat dolmadan silinmez');
    simdi += 3_600_000;
    await tur();
    assert.deepEqual(await kal(), []);
  });

  test('okunan değer sayım, duruş, stok ve plan dahil başka hiçbir tabloya satır yazmaz', async () => {
    const say2 = () => vt().sorgu<{ tablo: string; n: number }>(
      `SELECT table_name AS tablo, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I', table_name), false, true, '')))[1]::text::int AS n
       FROM information_schema.tables WHERE table_schema = current_schema() AND table_type = 'BASE TABLE' AND table_name NOT LIKE 'tezgah\\_%' ORDER BY 1`);
    const once = await say2();
    await tur();
    sahte.degistir(0, 'sayac', '999');
    sahte.degistir(0, 'calisma', 'STOPPED');
    sahte.kosulYaz(0, [['MOTION_PROGRAM', 'Fault', 'ORN hata']]);
    simdi += 5000;
    await tur();
    simdi += 60_000;
    await tur();
    assert.deepEqual(await say2(), once);
  });

  test('SmartES değeri aynı kodlu makineden gelir; fark alanları işaretlenir; SmartES verisi değişmez', async () => {
    await vt().sorgu(
      `INSERT INTO smartes_makine_durumu (makine_kodu, smartes_makine_id, durum, durum_baslangic, program_no, sayac, spindle_hizi, spindle_yuku, okundu)
       VALUES ('orn-t01', 1, 'calisiyor', $1, 'O1001', 147, 2350, 41, $1), ('ORN-T04', 2, 'calisiyor', $1, 'O2002', 63, 0, 0, $1)`, [new Date(simdi)]);
    await tur();
    const p = await pano();
    assert.deepEqual(p.tezgahlar.map((t) => [t.cihazAdi, t.farklar, t.smartes?.sayac]), [['ORN-T01', ['sayac'], 147], ['ORN-T04', ['durum'], 63]]);
    assert.equal(await say('smartes_makine_durumu'), 2);
  });

  test('servis hata verirse eski okuma yerinde kalır, hata metni adres taşımaz, sonraki tur yeniden okur', async () => {
    await tur();
    sahte.ozel['/sample'] = { durum: 500, govde: 'ORN hata' };
    simdi += 180_000;
    const r = await tur();
    assert.equal(r.tur, 'hata');
    const p = await pano();
    assert.ok(p.sonHata !== null && !p.sonHata.includes('127.0.0.1') && !p.sonHata.includes('ORN hata'));
    assert.deepEqual(p.tezgahlar.map((t) => t.eski), [true, true]);
    sahte.ozel['/sample'] = { govde: '<html><body>ORN</body></html>' };
    assert.deepEqual(await tur(), { tur: 'hata', ileti: 'Tezgâh servisi MTConnect anlık değer cevabı döndürmedi.' });
    sahte.ozel['/sample'] = { govde: '<!DOCTYPE x [<!ENTITY a "b">]><MTConnectStreams/>' };
    assert.equal((await tur()).tur, 'hata');
    delete sahte.ozel['/sample'];
    assert.deepEqual(await tur(), { tur: 'okundu', tezgah: 2 });
    assert.equal((await pano()).sonHata, null);
  });

  test('cevap gecikirse beklenmez ve yinelenmez; yönlendirme izlenmez; önceki tur sürerken yenisi başlamaz', async () => {
    await tur();
    const once = sahte.istekler.length;
    sahte.ozel['/sample'] = { gecikmeMs: 400 };
    const yavas = tur(istemci(100));
    assert.deepEqual(await tur(), { tur: 'suruyor' });
    assert.deepEqual(await yavas, { tur: 'hata', ileti: 'Tezgâh servisi süresinde cevap vermedi.' });
    assert.equal(sahte.istekler.length, once + 1);
    sahte.ozel['/sample'] = { durum: 302, govde: 'x', basliklar: { Location: `${sahte.adres}/probe` } };
    assert.equal((await tur()).tur, 'hata');
    assert.equal(sahte.istekler.filter((i) => i.yol === '/probe').length, 1);
  });

  test('istemci yalnız dört sabit yolu okur; sorgu yalnız /sample\'da ve yalnız from ile count olur; başka yol ve parametre reddedilir', async () => {
    const i = istemci();
    await assert.rejects(() => i.oku('/devices' as never), /yalnız \/probe, \/current, \/sample ve \/assets/);
    await assert.rejects(() => i.oku('/sample'), /from ve count/);
    await assert.rejects(() => i.oku('/current', { from: 1, count: 100 }), /yalnız \/sample/);
    await assert.rejects(() => i.oku('/sample', { from: 1, count: 100, interval: 5 } as never), /yalnız from ve count/);
    await assert.rejects(() => i.oku('/sample', { from: 1 } as never), /yalnız from ve count/);
    await assert.rejects(() => i.oku('/sample', { from: 1.5, count: 100 }), /tam sayı/);
    await assert.rejects(() => i.oku('/sample', { from: -1, count: 100 }), /tam sayı/);
    await assert.rejects(() => i.oku('/sample', { from: 1, count: 7 as never }), /izin listesinde/);
    assert.equal(sahte.istekler.length, 0, 'reddedilen istek hiç gitmez');
    assert.equal((await i.oku('/sample', { from: 1, count: 100 })).tur, 'basarili');
    assert.equal(sahte.istekler[0]?.yol, '/sample?from=1&count=100');
  });

  test('cevap boyu sınırı: sınırı aşan gövde okunmadan reddedilir (alan sayısı sınırı yoktur)', async () => {
    sahte.ozel['/probe'] = { govde: `<MTConnectDevices>${'x'.repeat(9 * 1024 * 1024)}</MTConnectDevices>` };
    const r = await istemci(5000).oku('/probe');
    assert.deepEqual(r, { tur: 'bozuk', ileti: 'Tezgâh servisinin cevabı çok büyük.' });
  });

  test('uçlar: yalnız yönetici görür; ayrıntı tezgahın bütün öğelerini geldiği adla verir; olmayan tezgah 404', async () => {
    await tur();
    assert.equal((await istek('GET', '/tezgah-baglantisi/durum', undefined, rollu)).statusCode, 403);
    assert.equal((await istek('GET', '/tezgah-baglantisi/tezgahlar/ORN-T01', undefined, rollu)).statusCode, 403);
    const c = await istek('GET', '/tezgah-baglantisi/durum');
    assert.equal(c.statusCode, 200, c.body);
    // Uç sunucunun ortam istemcisini kullanır (testte adres yok).
    assert.equal(tezgahBaglantisiDurumCevabi.parse(c.json()).baglanti, 'adres-yok');
    const a = tezgahAyrintisiCevabi.parse(await vt().tx((db) => ayrinti(db, 'ORN-T01', new Date(simdi))));
    assert.ok(a.ogeler.some((o) => o.tur === 'Execution' && o.deger === 'ACTIVE' && o.bilesen === 'Controller'));
    assert.ok(a.ogeler.some((o) => o.tur === 'Load' && o.bilesen === 'Rotary' && o.deger === '42'));
    assert.equal((await istek('GET', '/tezgah-baglantisi/tezgahlar/ORN-T01')).statusCode, 200);
    assert.equal((await istek('GET', '/tezgah-baglantisi/tezgahlar/ORN-YOK')).statusCode, 404);
  });

  test('tezgâh türü: yalnız yönetici seçer; tür ayrıntıda gelir; null siler; geçersiz tür 400, olmayan tezgâh 404; başka tabloya yazılmaz', async () => {
    await tur();
    const yol = '/tezgah-baglantisi/tezgahlar/ORN-T01/tur';
    assert.equal((await istek('POST', yol, { tur: 'torna' }, rollu)).statusCode, 403);
    assert.equal((await istek('POST', yol, { tur: 'robot' })).statusCode, 400);
    assert.equal((await istek('POST', '/tezgah-baglantisi/tezgahlar/ORN-YOK/tur', { tur: 'torna' })).statusCode, 404);
    assert.equal(tezgahAyrintisiCevabi.parse(await vt().tx((db) => ayrinti(db, 'ORN-T01', new Date(simdi)))).tezgahTuru, null);
    const once = await say('tezgah_okuma');
    const c = await istek('POST', yol, { tur: 'yatay-islem' });
    assert.equal(c.statusCode, 200, c.body);
    assert.equal(c.json().tezgahTuru, 'yatay-islem');
    assert.equal(tezgahAyrintisiCevabi.parse(await vt().tx((db) => ayrinti(db, 'ORN-T01', new Date(simdi)))).tezgahTuru, 'yatay-islem');
    assert.equal(tezgahAyrintisiCevabi.parse(await vt().tx((db) => ayrinti(db, 'ORN-T04', new Date(simdi)))).tezgahTuru, null);
    assert.equal((await istek('POST', yol, { tur: 'torna' })).statusCode, 200);
    assert.equal(await say('tezgah_turu'), 1);
    assert.equal((await istek('POST', yol, { tur: null })).statusCode, 200);
    assert.equal(await say('tezgah_turu'), 0);
    assert.equal(await say('tezgah_okuma'), once);
  });

  test('otuz günden eski durum örneği silinir', async () => {
    await vt().sorgu("INSERT INTO tezgah_ornek (cihaz_adi, zaman, durum) VALUES ('ORN-T01', $1, 'bekliyor'), ('ORN-T01', $2, 'bekliyor')",
      [new Date(simdi - 31 * 86_400_000), new Date(simdi - 29 * 86_400_000)]);
    await tur();
    assert.equal(await say('tezgah_ornek'), 3);
  });

  describe('geçmiş azaltma (kart 3680)', () => {
    const OGE_ALANLARI = ['ilerleme', 'eksenYuku', 'hiz', 'yuk', 'konumX', 'konumY', 'konumZ', 'sicaklik', 'titresim', 'basinc'] as const;
    const SAYISAL_KIMLIKLER = ['feed', 'xload', 'sspeed', 'sload', 'xpos', 'ypos', 'zpos', 'temp', 'vib', 'pres'];
    const satirlar = (kimlik: string) => vt().sorgu<{ zaman: Date; deger: string | null }>(
      "SELECT zaman, deger FROM tezgah_deger_gecmisi WHERE cihaz_adi = 'ORN-T01' AND data_item_id = $1 ORDER BY zaman, sira", [kimlik]);

    test('EVENT her değişimde saklanır; sayısal SAMPLE eşik altı değişimde, 5 sn\'den sık saklanmaz', async () => {
      await tur();
      // Yük 42 → 45 (eşik altı), hız 2350 → 2360 (eşik altı), program her değişimde.
      sahte.degistir(0, 'yuk', '45');
      sahte.degistir(0, 'hiz', '2360');
      sahte.degistir(0, 'program', 'O1002');
      simdi += 5000;
      await tur();
      assert.deepEqual((await satirlar('sload')).map((r) => r.deger), ['42']);
      assert.deepEqual((await satirlar('sspeed')).map((r) => r.deger), ['2350']);
      assert.deepEqual((await satirlar('pgm')).map((r) => r.deger), ['O1001', 'O1002']);
      sahte.degistir(0, 'yuk', '60');
      simdi += 5000;
      await tur();
      assert.deepEqual((await satirlar('sload')).map((r) => r.deger), ['42', '60']);
    });

    test('1 sn arayla 10 büyük değişim: 6 sn içinde en çok bir satır; son değer 6 sn dolunca (en geç ikinci turda) yazılır', async () => {
      await tur();
      const taban = sahte.saatMs;
      for (let i = 0; i < 10; i += 1) {
        sahte.saatMs = taban + i * 1000;
        sahte.degistir(0, 'hiz', String(i % 2 === 0 ? 4000 : 1000));
      }
      simdi += 5000;
      await tur();
      const ilk = await satirlar('sspeed');
      const yeniler = ilk.slice(1);
      assert.ok(yeniler.length <= 2 && yeniler.every((r, i) => i === 0 || r.zaman.getTime() - (yeniler[i - 1]?.zaman.getTime() ?? 0) > 5000), JSON.stringify(yeniler));
      for (let i = 0; i < 4; i += 1) { simdi += 5000; await tur(); }
      const hepsi = (await satirlar('sspeed')).map((r) => r.deger);
      assert.ok(hepsi.includes('4000'), 'pencerenin tepe değeri yazıldı');
      assert.equal(hepsi.at(-1), '1000', 'dönüş değeri sonradan yazıldı');
    });

    test('değişmeyen sayısal öğe 60 sn\'de bir satır üretir; EVENT için tekrar satırı yazılmaz', async () => {
      await tur();
      for (let s = 0; s < 24; s += 1) { simdi += 5000; await tur(); }
      const hiz = await satirlar('sspeed');
      assert.ok(hiz.length >= 2 && hiz.length <= 3, `120 sn'de ilk değer + en çok 2 tekrar: ${hiz.length}`);
      assert.ok(hiz.every((r) => r.deger === '2350'));
      assert.equal((await satirlar('pgm')).length, 1);
    });

    test('sunucu yeniden açılınca (bellek boş) her öğenin ilk değeri eşik altı olsa da saklanır', async () => {
      await tur();
      bellek = yeniTurBellegi();
      sahte.degistir(0, 'yuk', '45');
      simdi += 5000;
      await tur();
      assert.deepEqual((await satirlar('sload')).map((r) => r.deger), ['42', '45']);
    });

    test('satır sınırı 100.000 (alt sınır): 24 saat kuralından sonra en eski satırlar silinir ve satır sınırı boşluğu yazılır', async () => {
      const c = await istek('POST', '/ayarlar/tezgah-baglantisi.satir-siniri/degistir', { deger: 100_000 });
      assert.equal(c.statusCode, 200, c.body);
      assert.equal((await istek('POST', '/ayarlar/tezgah-baglantisi.satir-siniri/degistir', { deger: 1000 })).statusCode, 400, 'alt sınırın altı reddedilir');
      await vt().sorgu(
        `INSERT INTO tezgah_deger_gecmisi (cihaz_adi, data_item_id, sira, zaman, deger)
         SELECT 'ORN-T01', 'ek', n, $1::timestamptz - n * interval '0.5 second', n::text FROM generate_series(1, 150000) n`, [new Date(simdi - 60_000)]);
      await vt().sorgu("INSERT INTO tezgah_deger_gecmisi (cihaz_adi, data_item_id, sira, zaman, deger) VALUES ('ORN-T01', 'eski', 1, $1, '1')", [new Date(simdi - 25 * 3_600_000)]);
      await tur();
      // Bir turda en çok 5 parça silinir; kalanı sonraki turlarda sürer.
      for (let i = 0; i < 6 && (await say('tezgah_deger_gecmisi') ?? 0) > 100_000; i += 1) { simdi += 5000; await tur(); }
      assert.equal(await say('tezgah_deger_gecmisi'), 100_000);
      assert.equal(await say("tezgah_deger_gecmisi WHERE data_item_id = 'eski'"), 0);
      const b = await vt().sorgu<{ neden: string }>("SELECT neden FROM tezgah_veri_boslugu WHERE neden = 'satir-siniri'");
      assert.equal(b.length, 1);
      assert.equal((await ayrintiAl('ORN-T01')).bosluklar.some((x) => x.neden === 'satir-siniri'), true);
      const eski = await vt().tek<{ en: Date }>("SELECT min(zaman) AS en FROM tezgah_deger_gecmisi");
      const bosluk = await vt().tek<{ z: Date }>("SELECT zaman AS z FROM tezgah_veri_boslugu WHERE neden = 'satir-siniri'");
      assert.ok(bosluk !== null && eski !== null && bosluk.z.getTime() <= eski.en.getTime(), 'boşluk kalan en eski kayıttan önce biter');
      assert.equal((await istek('POST', '/ayarlar/tezgah-baglantisi.satir-siniri/degistir', { deger: 2_000_000 })).statusCode, 200);
    });

    test('temizlik 10.000 satırlık parçalarla yapılır: tek turda en çok bütçe kadar silinir, kalanı sonraki turda sürer', async () => {
      await vt().sorgu(
        `INSERT INTO tezgah_deger_gecmisi (cihaz_adi, data_item_id, sira, zaman, deger)
         SELECT 'ORN-T01', 'eski', n, $1::timestamptz - interval '30 hours' - n * interval '1 second', n::text FROM generate_series(1, 60000) n`, [new Date(simdi)]);
      await tur();
      const kalan1 = (await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM tezgah_deger_gecmisi WHERE data_item_id = 'eski'"))?.n ?? -1;
      assert.ok(kalan1 >= 10_000 && kalan1 % 10_000 === 0 && kalan1 < 60_000 || kalan1 === 0, `parçalı silme: ${kalan1}`);
      for (let i = 0; i < 20 && kalan1 > 0; i += 1) { simdi += 5000; await tur(); }
      assert.equal(await say("tezgah_deger_gecmisi WHERE data_item_id = 'eski'"), 0);
    });

    test('doluluk: durum ucu satır sayısı, yüzde, seviye, disk boyutu, en eski kayıt ve dakikalık sayaçları verir', async () => {
      await tur();
      simdi += 5000;
      sahte.degistir(0, 'hiz', '4000');
      await tur();
      const c = await istek('GET', '/tezgah-baglantisi/durum');
      assert.equal(c.statusCode, 200, c.body);
      // Uç, işin süreç belleğini (turBellegi) okur; bu testin belleği değil: şemayı uçtan, sayıları bu testin belleğiyle denetle.
      assert.equal(tezgahBaglantisiDurumCevabi.parse(JSON.parse(c.body)).doluluk.satirSiniri, 2_000_000);
      const d = (await pano()).doluluk;
      assert.equal(d.satirSiniri, 2_000_000);
      assert.equal(d.satirSayisi, await say('tezgah_deger_gecmisi'), JSON.stringify(d));
      assert.equal(d.seviye, 'normal');
      assert.ok(d.diskBayt !== null && d.diskBayt > 0);
      assert.ok(d.enEskiKayit !== null);
      assert.ok(d.olcum !== null && d.olcum.yazilan > 0 && d.olcum.pencereDakika >= 1);
    });

    test('10 dakika, saniyede değişen 10 sayısal öğe: yazılan satır bugünkünden en az 5 kat az; 1 saatlik eğri boşluksuz', async () => {
      await sahte.kapat();
      sahte = await sahteMtconnectAc([{ ad: 'ORN-T01', calisma: 'ACTIVE', program: 'O1001', ilerleme: '1', eksenYuku: '1', hiz: '1', yuk: '1', konumX: '1', konumY: '1', konumZ: '1', sicaklik: '1', titresim: '1', basinc: '1' }], simdi);
      bellek = yeniTurBellegi();
      await tur();
      const baslangic = simdi;
      let degisiklik = 0;
      for (let tursayisi = 1; tursayisi <= 120; tursayisi += 1) {
        for (let sn = 1; sn <= 5; sn += 1) {
          const an = baslangic + (tursayisi - 1) * 5000 + sn * 1000;
          const deger = String(((tursayisi * 5 + sn) % 2 === 0) ? 4000 : 1000);
          for (const alan of OGE_ALANLARI) {
            sahte.saatMs = an - 1000;
            sahte.degistir(0, alan, deger);
            degisiklik += 1;
          }
        }
        simdi = baslangic + tursayisi * 5000;
        await tur();
      }
      const yazilan = (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM tezgah_deger_gecmisi WHERE data_item_id = ANY($1)', [SAYISAL_KIMLIKLER]))?.n ?? 0;
      assert.equal(degisiklik, 6000);
      assert.ok(yazilan * 5 <= degisiklik, `bugünkü ${degisiklik} satır, süzülen ${yazilan} satır (${(degisiklik / yazilan).toFixed(2)} kat)`);
      const a = await ayrintiAl('ORN-T01');
      for (const kimlik of SAYISAL_KIMLIKLER) {
        const egri = a.alanlar.find((x) => x.kimlik === kimlik)?.egri ?? [];
        const dakikalar = egri.map((e) => Math.floor(Date.parse(e.zaman) / 60_000));
        assert.ok(dakikalar.length >= 10, `${kimlik}: ${dakikalar.length} dakika noktası`);
        assert.ok(dakikalar.every((m, i) => i === 0 || m - (dakikalar[i - 1] ?? 0) === 1), `${kimlik}: eğride dakika boşluğu var`);
      }
      assert.deepEqual(a.bosluklar, []);
    });
  });
});
