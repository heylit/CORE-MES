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
import { ayrinti, durum, okumaTuru, yeniTurBellegi } from './servis.ts';
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
    sahte = await sahteMtconnectAc([
      { ad: 'ORN-T01', calisma: 'ACTIVE', mod: 'AUTOMATIC', program: 'O1001', sayac: '148', takim: '7', hiz: '2350', yuk: '42', ilerleme: '180' },
      { ad: 'ORN-T04', calisma: 'READY', mod: 'AUTOMATIC', program: 'O2002', sayac: '63', hiz: '0', yuk: '0' },
    ]);
    bellek = yeniTurBellegi();
    simdi += 3_600_000;
    for (const t of ['tezgah_okuma', 'tezgah_ornek', 'smartes_makine_durumu']) await vt().sorgu(`DELETE FROM ${t}`);
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

  test('yalnız GET /probe (süreçte bir kez) ve GET /current atılır; değerler saklanır, durum değişince örnek yazılır', async () => {
    assert.deepEqual(await tur(), { tur: 'okundu', tezgah: 2 });
    simdi += 60_000;
    assert.deepEqual(await tur(), { tur: 'okundu', tezgah: 2 });
    assert.deepEqual(sahte.istekler, [{ yontem: 'GET', yol: '/probe' }, { yontem: 'GET', yol: '/current' }, { yontem: 'GET', yol: '/current' }]);
    assert.equal(await say('tezgah_okuma'), 2);
    assert.equal(await say('tezgah_ornek'), 2);
    const birinci = sahte.tezgahlar[0];
    if (birinci) birinci.calisma = 'STOPPED';
    simdi += 60_000;
    await tur();
    assert.equal(await say('tezgah_ornek'), 3);
    const p = await pano();
    assert.equal(p.baglanti, 'acik');
    assert.equal(p.sonHata, null);
    assert.deepEqual(p.tezgahlar.map((t) => [t.cihazAdi, t.durum, t.sayac, t.eski, t.smartes]), [['ORN-T01', 'bekliyor', 148, false, null], ['ORN-T04', 'bekliyor', 63, false, null]]);
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
    sahte.ozel['/current'] = { durum: 500, govde: 'ORN hata' };
    simdi += 180_000;
    const r = await tur();
    assert.equal(r.tur, 'hata');
    const p = await pano();
    assert.ok(p.sonHata !== null && !p.sonHata.includes('127.0.0.1') && !p.sonHata.includes('ORN hata'));
    assert.deepEqual(p.tezgahlar.map((t) => t.eski), [true, true]);
    sahte.ozel['/current'] = { govde: '<html><body>ORN</body></html>' };
    assert.deepEqual(await tur(), { tur: 'hata', ileti: 'Tezgah servisi MTConnect anlık değer cevabı döndürmedi.' });
    sahte.ozel['/current'] = { govde: '<!DOCTYPE x [<!ENTITY a "b">]><MTConnectStreams/>' };
    assert.equal((await tur()).tur, 'hata');
    delete sahte.ozel['/current'];
    assert.deepEqual(await tur(), { tur: 'okundu', tezgah: 2 });
    assert.equal((await pano()).sonHata, null);
  });

  test('cevap gecikirse beklenmez ve yinelenmez; yönlendirme izlenmez; önceki tur sürerken yenisi başlamaz', async () => {
    await tur();
    const once = sahte.istekler.length;
    sahte.ozel['/current'] = { gecikmeMs: 400 };
    const yavas = tur(istemci(100));
    assert.deepEqual(await tur(), { tur: 'suruyor' });
    assert.deepEqual(await yavas, { tur: 'hata', ileti: 'Tezgah servisi süresinde cevap vermedi.' });
    assert.equal(sahte.istekler.length, once + 1);
    sahte.ozel['/current'] = { durum: 302, govde: 'x', basliklar: { Location: `${sahte.adres}/probe` } };
    assert.equal((await tur()).tur, 'hata');
    assert.equal(sahte.istekler.filter((i) => i.yol === '/probe').length, 1);
  });

  test('istemci yalnız iki sabit yolu okur', async () => {
    await assert.rejects(() => istemci().oku('/sample' as never), /yalnız \/probe ve \/current/);
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

  test('otuz günden eski durum örneği silinir', async () => {
    await vt().sorgu("INSERT INTO tezgah_ornek (cihaz_adi, zaman, durum) VALUES ('ORN-T01', $1, 'bekliyor'), ('ORN-T01', $2, 'bekliyor')",
      [new Date(simdi - 31 * 86_400_000), new Date(simdi - 29 * 86_400_000)]);
    await tur();
    assert.equal(await say('tezgah_ornek'), 3);
  });
});
