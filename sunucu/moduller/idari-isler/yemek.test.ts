import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { YemekGunuCevabi } from '#paylasilan/sozlesme/idari-isler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

// Test veritabanında vardiya kadrosu ve İK devam kaydı yoktur: kadro, izinli ve fazla mesai 0 gelir; hesap IDR-18 kural testindedir.
describe('idari-isler yemek sayısı (gerçek PostgreSQL, gerçek giriş)', () => {
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
    const kullaniciAdi = `idari-y-${(sayac += 1)}`;
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

  const gonder = (cerez: string, govde: unknown, kimlik = randomUUID()): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: '/api/idari-isler/yemek/bildir', payload: govde as object, headers: { cookie: cerez, 'istek-kimligi': kimlik } });
  const oku = (cerez: string, yol: string): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });
  const gunSonra = (gun: number): string => {
    const d = new Date(`${bugun}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + gun);
    return d.toISOString().slice(0, 10);
  };
  const bildirim = (degisen: Record<string, unknown> = {}) => ({
    tarih: bugun, kadro: 0, izinli: 0, fazlaMesai: 0, ziyaretci: 2, duzeltme: 0, ...degisen,
  });
  const say = async () => (await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM idari_isler_yemek_bildirimi'))!.n;

  before(async () => {
    ortam = await testVeritabaniKur('idari_isler_yemek');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await girisYap([]);
    idari = await girisYap(['idari-isler.oku', 'idari-isler.yemek-yaz']);
    okuyan = await girisYap(['idari-isler.oku']);
    bugun = (await o().sahip.tek<{ bugun: string }>('SELECT current_date AS bugun'))!.bugun;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('IDR-16 bildirim: sayı hesaptan yazılır, son bildirim ve bildiren döner; sayaç bildirince düşer', async () => {
    const once = (await oku(idari.cerez, '/idari-isler/menu-sayaclari')).json<Record<string, number | null>>();
    assert.equal(once.yemek, 1);
    const ilk = (await oku(okuyan.cerez, '/idari-isler/yemek')).json<YemekGunuCevabi>();
    assert.equal(ilk.tarih, bugun);
    assert.equal(ilk.son, null);
    assert.equal(ilk.fazlaMesai, 0);
    const c = await gonder(idari.cerez, bildirim({ duzeltme: 1, duzeltmeNedeni: 'Deneme eğitmen' }));
    assert.equal(c.statusCode, 200, c.body);
    const g = c.json<YemekGunuCevabi>();
    assert.equal(g.son?.sayi, 3);
    assert.equal(g.son?.duzeltmeNedeni, 'Deneme eğitmen');
    assert.equal(g.son?.bildirenAd, 'Deneme idari-y-2');
    const sonra = (await oku(idari.cerez, '/idari-isler/menu-sayaclari')).json<Record<string, number | null>>();
    assert.equal(sonra.yemek, 0);
    assert.equal((await oku(okuyan.cerez, '/idari-isler/menu-sayaclari')).json<Record<string, number | null>>().yemek, null);
  });

  test('düzeltme: yeni kayıt geçerli olur; eski kayıt değişmez ve silinmez (veritabanı)', async () => {
    const c = await gonder(idari.cerez, bildirim({ ziyaretci: 5 }));
    assert.equal(c.json<YemekGunuCevabi>().son?.sayi, 5);
    assert.equal(c.json<YemekGunuCevabi>().son?.duzeltmeNedeni, null);
    await assert.rejects(o().sahip.sorgu('UPDATE idari_isler_yemek_bildirimi SET sayi = 1'), /yalnız ekleme/);
    await assert.rejects(o().sahip.sorgu('DELETE FROM idari_isler_yemek_bildirimi'), /yalnız ekleme/);
  });

  test('IDR-17 ret: geçmiş gün, gerekçesiz düzeltme, değişen kadro ya da fazla mesai; yetki: okuyan bildiremez; kayıt yazılmaz', async () => {
    const n = await say();
    assert.equal((await gonder(idari.cerez, bildirim({ tarih: gunSonra(-1) }))).statusCode, 400);
    assert.equal((await gonder(idari.cerez, bildirim({ tarih: gunSonra(8) }))).statusCode, 400);
    assert.equal((await gonder(idari.cerez, bildirim({ duzeltme: 2 }))).statusCode, 400);
    assert.equal((await gonder(idari.cerez, bildirim({ kadro: 5 }))).statusCode, 400);
    assert.equal((await gonder(idari.cerez, bildirim({ fazlaMesai: 3 }))).statusCode, 400);
    assert.equal((await gonder(idari.cerez, bildirim({ fazlaMesai: -1 }))).statusCode, 400);
    assert.equal((await gonder(okuyan.cerez, bildirim())).statusCode, 403);
    assert.equal(await say(), n);
  });

  test('ileri gün ve geçmiş: 7 gün sonrası bildirilir; o günün geçmişinde önceki günler görünür', async () => {
    const ileri = gunSonra(7);
    assert.equal((await gonder(idari.cerez, bildirim({ tarih: ileri }))).statusCode, 200);
    const g = (await oku(okuyan.cerez, `/idari-isler/yemek?tarih=${ileri}`)).json<YemekGunuCevabi>();
    assert.equal(g.son?.sayi, 2);
    assert.deepEqual(g.gecmis.find((x) => x.tarih === bugun), { tarih: bugun, hesaplanan: 5, sayi: 5 });
  });

  test('tekrar koruması: aynı istek kimliğiyle ikinci bildirim yeni kayıt açmaz', async () => {
    const kimlik = randomUUID();
    const n = await say();
    await gonder(idari.cerez, bildirim(), kimlik);
    await gonder(idari.cerez, bildirim(), kimlik);
    assert.equal(await say(), n + 1);
  });
});
