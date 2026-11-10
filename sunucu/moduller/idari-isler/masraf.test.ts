import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Arac, AracCevabi, Masraf, MasrafCevabi, MasraflarCevabi } from '#paylasilan/sozlesme/idari-isler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { aylikAracMasrafi } from './disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

describe('idari-isler araç masrafı (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let sayac = 0;
  let idari = { cerez: '', id: 0 };
  let okuyan = { cerez: '', id: 0 };
  let calisan = { cerez: '', id: 0 };
  let bugun = '';

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function girisYap(islemler: string[]): Promise<{ cerez: string; id: number }> {
    const kullaniciAdi = `idari-m-${(sayac += 1)}`;
    const id = await o().vt.tx(async (db) => {
      const ilk = yoneticiId === 0;
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (!ilk) {
        // Yerleşik roller idari işlem taşır; deneme kişisi işlemsiz rolle girer, işlemi kişiye ayrıca verilir.
        await db.sorgu("INSERT INTO rol (kod, ad) VALUES ('deneme_islemsiz', 'Deneme işlemsiz') ON CONFLICT (kod) DO NOTHING");
        const rol = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'deneme_islemsiz'");
        const yon = await db.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
        await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
        await rolAl(db, yoneticiId, yeni, yon?.id ?? 0);
      }
      return yeni;
    });
    if (yoneticiId === 0) yoneticiId = id;
    for (const islem of islemler) {
      await o().sahip.sorgu('INSERT INTO kisi_islemi (kisi_id, islem, veren_id) VALUES ($1, $2, $3)', [id, islem, yoneticiId]);
    }
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { cerez: String(c.headers['set-cookie']).split(';')[0] ?? '', id };
  }

  const gonder = (cerez: string, yol: string, govde: unknown, kimlik = randomUUID()): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: cerez, 'istek-kimligi': kimlik } });
  const oku = (cerez: string, yol: string): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });
  let plakaSira = 500;
  async function aracEkle(): Promise<Arac> {
    const c = await gonder(idari.cerez, '/idari-isler/araclar/ekle', { plaka: `34dnm${(plakaSira += 1)}`, tur: 'binek', sahiplik: 'sirket', km: 1000 });
    assert.equal(c.statusCode, 200, c.body);
    return c.json<AracCevabi>().arac;
  }
  const masrafGovdesi = (degisen: Record<string, unknown> = {}) =>
    ({ tarih: bugun, tur: 'yakit', tutar: '1250.50', kdv: null, km: 1200, belgeNo: 'DNM-1', aciklama: null, ...degisen });
  async function masrafEkle(aracId: number, degisen: Record<string, unknown> = {}): Promise<Masraf> {
    const c = await gonder(idari.cerez, `/idari-isler/araclar/${aracId}/masraf-ekle`, masrafGovdesi(degisen));
    assert.equal(c.statusCode, 200, c.body);
    return c.json<MasrafCevabi>().masraf;
  }
  const say = async () => (await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM idari_isler_arac_masrafi'))!.n;

  before(async () => {
    ortam = await testVeritabaniKur('idari_isler_masraf');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await girisYap([]);
    idari = await girisYap(['idari-isler.oku', 'idari-isler.filo-yaz']);
    okuyan = await girisYap(['idari-isler.oku']);
    calisan = await girisYap(['idari-isler.arac-talebi-ac']);
    bugun = (await o().sahip.tek<{ bugun: string }>('SELECT current_date AS bugun'))!.bugun;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('IDR-27 akış: idari masraf yazar, okuyan listeyi ve yıl toplamını görür; kayıt yoksa toplam null', async () => {
    const arac = await aracEkle();
    const bos = await oku(okuyan.cerez, `/idari-isler/araclar/${arac.id}/masraflar`);
    assert.equal(bos.statusCode, 200, bos.body);
    assert.deepEqual(bos.json<MasraflarCevabi>(), { masraflar: [], yilToplami: null });
    const m = await masrafEkle(arac.id);
    assert.equal(m.tutar, '1250.50');
    assert.equal(m.kaydedenAd, 'Deneme idari-m-2');
    assert.equal(m.iptal, null);
    await masrafEkle(arac.id, { tur: 'bakim', tutar: '99.5', km: null, belgeNo: null });
    const liste = (await oku(okuyan.cerez, `/idari-isler/araclar/${arac.id}/masraflar`)).json<MasraflarCevabi>();
    assert.equal(liste.masraflar.length, 2);
    assert.equal(liste.yilToplami, '1350.00');
  });

  test('IDR-27 ret: ileri tarih, sıfır, eksi ve üç kuruş basamaklı tutar 400; yok araç 404; kayıt yazılmaz', async () => {
    const arac = await aracEkle();
    const n = await say();
    const ileri = new Date(`${bugun}T00:00:00Z`);
    ileri.setUTCDate(ileri.getUTCDate() + 1);
    for (const degisen of [{ tarih: ileri.toISOString().slice(0, 10) }, { tutar: '0' }, { tutar: '-5' }, { tutar: '1.234' }, { tur: 'hediye' }]) {
      const c = await gonder(idari.cerez, `/idari-isler/araclar/${arac.id}/masraf-ekle`, masrafGovdesi(degisen));
      assert.equal(c.statusCode, 400, JSON.stringify(degisen));
    }
    assert.equal((await gonder(idari.cerez, '/idari-isler/araclar/999999/masraf-ekle', masrafGovdesi())).statusCode, 404);
    assert.equal(await say(), n);
  });

  test('IDR-28: iptal gerekçeyle bir kez yapılır; iptal edilen yıl toplamından düşer, satır silinmez; eski sürüm 409', async () => {
    const arac = await aracEkle();
    const m = await masrafEkle(arac.id, { tutar: '300' });
    const tek = await masrafEkle(arac.id, { tutar: '200' });
    assert.equal((await gonder(idari.cerez, `/idari-isler/masraflar/${m.id}/iptal`, { surum: m.surum, neden: ' ' })).statusCode, 400);
    const iptal = await gonder(idari.cerez, `/idari-isler/masraflar/${m.id}/iptal`, { surum: m.surum, neden: 'Deneme yanlış araç' });
    assert.equal(iptal.statusCode, 200, iptal.body);
    const iptalli = iptal.json<MasrafCevabi>().masraf;
    assert.notEqual(iptalli.iptal, null);
    assert.equal(iptalli.iptalNedeni, 'Deneme yanlış araç');
    assert.equal((await gonder(idari.cerez, `/idari-isler/masraflar/${m.id}/iptal`, { surum: iptalli.surum, neden: 'Yine' })).statusCode, 422);
    assert.equal((await gonder(idari.cerez, `/idari-isler/masraflar/${tek.id}/iptal`, { surum: tek.surum + 5, neden: 'Deneme' })).statusCode, 409);
    const liste = (await oku(okuyan.cerez, `/idari-isler/araclar/${arac.id}/masraflar`)).json<MasraflarCevabi>();
    assert.equal(liste.masraflar.length, 2);
    assert.equal(liste.yilToplami, '200.00');
  });

  test('yetki: okuyan yazamaz ve iptal edemez; araç talebi açan masraf okuyamaz', async () => {
    const arac = await aracEkle();
    const m = await masrafEkle(arac.id);
    assert.equal((await gonder(okuyan.cerez, `/idari-isler/araclar/${arac.id}/masraf-ekle`, masrafGovdesi())).statusCode, 403);
    assert.equal((await gonder(okuyan.cerez, `/idari-isler/masraflar/${m.id}/iptal`, { surum: m.surum, neden: 'Deneme' })).statusCode, 403);
    assert.equal((await oku(calisan.cerez, `/idari-isler/araclar/${arac.id}/masraflar`)).statusCode, 403);
  });

  test('tablo kısıtı: iptal kimle, ne zaman ve neden birlikte yazılır; tutar sıfırdan büyük', async () => {
    const arac = await aracEkle();
    const m = await masrafEkle(arac.id);
    await assert.rejects(
      o().sahip.sorgu('UPDATE idari_isler_arac_masrafi SET iptal = now() WHERE id = $1', [m.id]),
      /idari_isler_arac_masrafi_iptal_butun/,
    );
    await assert.rejects(
      o().sahip.sorgu('UPDATE idari_isler_arac_masrafi SET tutar = 0 WHERE id = $1', [m.id]),
      /idari_isler_arac_masrafi_tutar/,
    );
  });

  test('IDR-34 (2594 b): aylık araç masrafı bütün araçların o ayki iptalsiz masraf toplamı; ay sınırı tarihe göre; masraf yoksa 0', async () => {
    const a = await aracEkle();
    const b = await aracEkle();
    const ay = (deger: string) => o().vt.tx((db) => aylikAracMasrafi(db, deger));
    assert.equal(await ay('2025-03'), 0, 'masrafsız ay 0 (null değil)');
    await masrafEkle(a.id, { tarih: '2025-03-01', tutar: '0.10' });
    await masrafEkle(b.id, { tarih: '2025-03-31', tutar: '0.20', tur: 'kira' });
    await masrafEkle(a.id, { tarih: '2025-02-28', tutar: '1000' });
    await masrafEkle(b.id, { tarih: '2025-04-01', tutar: '2000' });
    const iptalli = await masrafEkle(a.id, { tarih: '2025-03-15', tutar: '500' });
    const iptal = await gonder(idari.cerez, `/idari-isler/masraflar/${iptalli.id}/iptal`, { surum: iptalli.surum, neden: 'Deneme yanlış ay' });
    assert.equal(iptal.statusCode, 200, iptal.body);
    assert.equal(await ay('2025-03'), 0.3, 'iki araç toplanır, kuruş korunur; iptal ve komşu aylar girmez');
    assert.equal(await ay('2025-02'), 1000);
    assert.equal(await ay('2025-04'), 2000);
    await assert.rejects(ay('2025-13'), /GGGG-AA/);
    await assert.rejects(ay('2025-3'), /GGGG-AA/);
  });

  test('IDR-35 (2712 a): KDV boş olabilir; yazılırsa saklanır ve okunur; eksi, üç basamak, tutara eşit ya da büyük KDV 400; tablo kısıtı aynı kuralı tutar', async () => {
    const arac = await aracEkle();
    const kdvli = await masrafEkle(arac.id, { tutar: '1200.00', kdv: '200.00' });
    assert.equal(kdvli.kdv, '200.00');
    const sifir = await masrafEkle(arac.id, { tur: 'ceza', tutar: '500', kdv: '0' });
    assert.equal(sifir.kdv, '0.00');
    const bos = await masrafEkle(arac.id, { kdv: undefined });
    assert.equal(bos.kdv, null);
    const liste = (await oku(okuyan.cerez, `/idari-isler/araclar/${arac.id}/masraflar`)).json<MasraflarCevabi>();
    assert.deepEqual(liste.masraflar.map((m) => m.kdv).sort(), ['0.00', '200.00', null].sort());
    const n = await say();
    for (const kdv of ['-1', '1.234', '1250.50', '2000']) {
      const c = await gonder(idari.cerez, `/idari-isler/araclar/${arac.id}/masraf-ekle`, masrafGovdesi({ kdv }));
      assert.equal(c.statusCode, 400, kdv);
    }
    assert.equal(await say(), n);
    await assert.rejects(
      o().sahip.sorgu('UPDATE idari_isler_arac_masrafi SET kdv = tutar WHERE id = $1', [kdvli.id]),
      /idari_isler_arac_masrafi_kdv/,
    );
  });
});
