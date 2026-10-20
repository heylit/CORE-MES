import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Arac, AracCevabi, AraclarCevabi, BugunCevabi } from '#paylasilan/sozlesme/idari-isler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

describe('idari-isler filo araç kartı (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let sayac = 0;
  let idari = { cerez: '', id: 0 };
  let okuyan = { cerez: '', id: 0 };
  let bugun = '';

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function girisYap(islemler: string[]): Promise<{ cerez: string; id: number }> {
    const kullaniciAdi = `idari-a-${(sayac += 1)}`;
    const id = await o().vt.tx(async (db) => {
      const ilk = yoneticiId === 0;
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (!ilk) {
        // Yerleşik roller (216 a ile operatör de) idari işlem taşır; deneme kişisi işlemsiz rolle girer, işlemi kişiye ayrıca verilir.
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
  const gunSonra = (gun: number): string => {
    const d = new Date(`${bugun}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + gun);
    return d.toISOString().slice(0, 10);
  };
  let plakaSira = 100;
  const yeniPlaka = () => `34dnm${(plakaSira += 1)}`;
  async function ekle(degisen: Record<string, unknown> = {}): Promise<Arac> {
    const c = await gonder(idari.cerez, '/idari-isler/araclar/ekle', { plaka: yeniPlaka(), tur: 'binek', sahiplik: 'sirket', km: 1000, ...degisen });
    assert.equal(c.statusCode, 200, c.body);
    return c.json<AracCevabi>().arac;
  }
  const say = async () => (await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM idari_isler_arac'))!.n;

  before(async () => {
    ortam = await testVeritabaniKur('idari_isler_arac');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await girisYap([]);
    idari = await girisYap(['idari-isler.oku', 'idari-isler.filo-yaz']);
    okuyan = await girisYap(['idari-isler.oku']);
    bugun = (await o().sahip.tek<{ bugun: string }>('SELECT current_date AS bugun'))!.bugun;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('IDR-20 ekleme: plaka biçimlenir; uyarılar hesaplanır; okuyan listeyi görür', async () => {
    const a = await ekle({ plaka: '34dnm001', muayeneTarihi: gunSonra(12), sonrakiBakimKm: 1500, markaModel: 'Deneme binek' });
    assert.equal(a.plaka, '34 DNM 001');
    assert.deepEqual(a.uyarilar.map((u) => u.tur), ['muayene', 'bakim']);
    assert.equal(a.uyarilar[0]?.kalanGun, 12);
    assert.equal(a.uyarilar[1]?.kalanKm, 500);
    const liste = (await oku(okuyan.cerez, '/idari-isler/araclar')).json<AraclarCevabi>().araclar;
    assert.ok(liste.some((x) => x.id === a.id));
  });

  test('ret: biçimsiz ve kayıtlı plaka 400; okuyan yazamaz 403; kayıt yazılmaz', async () => {
    await ekle({ plaka: '34 DNM 002' });
    const n = await say();
    const yanlis = (g: Record<string, unknown>, cerez = idari.cerez) =>
      gonder(cerez, '/idari-isler/araclar/ekle', { plaka: yeniPlaka(), tur: 'binek', sahiplik: 'sirket', ...g });
    assert.equal((await yanlis({ plaka: '99 X 1' })).statusCode, 400);
    assert.equal((await yanlis({ plaka: '34dnm002' })).statusCode, 400);
    assert.equal((await yanlis({ tur: 'tir' })).statusCode, 400);
    assert.equal((await yanlis({ km: -1 })).statusCode, 400);
    assert.equal((await yanlis({}, okuyan.cerez)).statusCode, 403);
    assert.equal(await say(), n);
  });

  test('IDR-21 güncelleme: km ileri yazılır, geri yazılmaz; eski sürüm 409; olmayan araç 404', async () => {
    const a = await ekle();
    const guncelle = (x: Arac, g: Record<string, unknown>) => gonder(idari.cerez, `/idari-isler/araclar/${x.id}/guncelle`, {
      surum: x.surum, plaka: x.plaka, tur: x.tur, sahiplik: x.sahiplik, km: x.km, ...g,
    });
    const c = await guncelle(a, { km: 1500, durum: 'serviste' });
    assert.equal(c.statusCode, 200, c.body);
    const yeni = c.json<AracCevabi>().arac;
    assert.equal(yeni.km, 1500);
    assert.equal(yeni.durum, 'serviste');
    assert.equal((await guncelle(yeni, { km: 1400 })).statusCode, 400);
    assert.equal((await guncelle(a, { km: 1600 })).statusCode, 409);
    assert.equal((await gonder(idari.cerez, '/idari-isler/araclar/999999/guncelle', { surum: 1, plaka: '34 DNM 999', tur: 'binek', sahiplik: 'sirket' })).statusCode, 404);
  });

  test('IDR-22 Bugün ve sayaç: süresi geçen muayene Bugün\'e düşer ve filo sayacını artırır; pasif araç uyarı vermez', async () => {
    const once = (await oku(idari.cerez, '/idari-isler/menu-sayaclari')).json<Record<string, number | null>>().filo ?? 0;
    const gecen = await ekle({ sigortaTarihi: gunSonra(-2) });
    const pasif = await ekle({ sigortaTarihi: gunSonra(-2), durum: 'pasif' });
    assert.deepEqual(pasif.uyarilar, []);
    const b = (await oku(idari.cerez, '/idari-isler/bugun')).json<BugunCevabi>();
    assert.ok(b.isler.some((i) => i.tur === 'arac' && i.arac.id === gecen.id));
    assert.ok(!b.isler.some((i) => i.tur === 'arac' && i.arac.id === pasif.id));
    assert.ok(b.sayilar.aracUyarisi >= 1);
    assert.equal((await oku(idari.cerez, '/idari-isler/menu-sayaclari')).json<Record<string, number | null>>().filo, once + 1);
  });

  test('tekrar koruması ve tekil plaka (veritabanı)', async () => {
    const kimlik = randomUUID();
    const n = await say();
    const govde = { plaka: '34 DNM 777', tur: 'kamyon', sahiplik: 'kiralik' };
    await gonder(idari.cerez, '/idari-isler/araclar/ekle', govde, kimlik);
    await gonder(idari.cerez, '/idari-isler/araclar/ekle', govde, kimlik);
    assert.equal(await say(), n + 1);
    await assert.rejects(
      o().sahip.sorgu("INSERT INTO idari_isler_arac (plaka, tur, sahiplik, olusturan_kisi_id) VALUES ('34 DNM 777', 'binek', 'sirket', $1)", [yoneticiId]),
      /idari_isler_arac_plaka_tek/,
    );
  });
});
