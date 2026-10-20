import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Arac, AracCevabi, AracGorevi, AracGoreviCevabi, AracGorevleriCevabi } from '#paylasilan/sozlesme/idari-isler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';

describe('idari-isler araç görevi (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let sayac = 0;
  let idari = { cerez: '', id: 0 };
  let okuyan = { cerez: '', id: 0 };
  let calisan = { cerez: '', id: 0 };
  let baska = { cerez: '', id: 0 };
  let bugun = '';

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function girisYap(islemler: string[]): Promise<{ cerez: string; id: number }> {
    const kullaniciAdi = `idari-g-${(sayac += 1)}`;
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
  let plakaSira = 300;
  const yeniPlaka = () => `34dnm${(plakaSira += 1)}`;
  async function aracEkle(degisen: Record<string, unknown> = {}): Promise<Arac> {
    const c = await gonder(idari.cerez, '/idari-isler/araclar/ekle', { plaka: yeniPlaka(), tur: 'binek', sahiplik: 'sirket', km: 1000, ...degisen });
    assert.equal(c.statusCode, 200, c.body);
    return c.json<AracCevabi>().arac;
  }
  async function talepAc(cerez: string, degisen: Record<string, unknown> = {}): Promise<LightMyRequestResponse> {
    return gonder(cerez, '/idari-isler/arac-gorevleri/ac', { amac: 'Deneme tedarikçi ziyareti', varis: 'Deneme OSB', tarih: bugun, donusTarihi: bugun, ...degisen });
  }
  async function ac(degisen: Record<string, unknown> = {}): Promise<AracGorevi> {
    const c = await talepAc(calisan.cerez, degisen);
    assert.equal(c.statusCode, 200, c.body);
    return c.json<AracGoreviCevabi>().gorev;
  }
  const komut = (cerez: string, g: AracGorevi, ad: string, ek: object = {}) =>
    gonder(cerez, `/idari-isler/arac-gorevleri/${g.id}/${ad}`, { surum: g.surum, ...ek });
  const aracOku = async (id: number): Promise<Arac | undefined> =>
    (await oku(okuyan.cerez, '/idari-isler/araclar')).json<{ araclar: Arac[] }>().araclar.find((a) => a.id === id);

  before(async () => {
    ortam = await testVeritabaniKur('idari_isler_gorev');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await girisYap([]);
    idari = await girisYap(['idari-isler.oku', 'idari-isler.filo-yaz']);
    okuyan = await girisYap(['idari-isler.oku']);
    calisan = await girisYap(['idari-isler.arac-talebi-ac']);
    baska = await girisYap(['idari-isler.arac-talebi-ac']);
    bugun = (await o().sahip.tek<{ bugun: string }>('SELECT current_date AS bugun'))!.bugun;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('IDR-23 akış: çalışan açar, idari araç verir, çıkış ve dönüş km yazılır; araç görevde olur, dönüşte müsait ve km güncel', async () => {
    const arac = await aracEkle({ km: 5000 });
    const g = await ac();
    assert.equal(g.durum, 'bekliyor');
    assert.equal(g.talepEdenAd, 'Deneme idari-g-4');
    const sayac = (await oku(idari.cerez, '/idari-isler/menu-sayaclari')).json<Record<string, number | null>>();
    assert.equal(sayac['arac-gorevleri'], 1);
    assert.equal((await oku(calisan.cerez, '/idari-isler/menu-sayaclari')).json<Record<string, number | null>>()['arac-taleplerim'], 1);
    const onay = await komut(idari.cerez, g, 'onayla', { aracId: arac.id });
    assert.equal(onay.statusCode, 200, onay.body);
    const onayli = onay.json<AracGoreviCevabi>().gorev;
    assert.equal(onayli.plaka, arac.plaka);
    assert.equal((await komut(idari.cerez, onayli, 'cikis', { km: 4999 })).statusCode, 400);
    const cikis = await komut(idari.cerez, onayli, 'cikis', { km: 5010 });
    assert.equal(cikis.statusCode, 200, cikis.body);
    const yolda = cikis.json<AracGoreviCevabi>().gorev;
    assert.equal((await aracOku(arac.id))?.durum, 'gorevde');
    assert.equal((await aracOku(arac.id))?.km, 5010);
    assert.equal((await komut(idari.cerez, yolda, 'donus', { km: 5000 })).statusCode, 400);
    const donus = await komut(idari.cerez, yolda, 'donus', { km: 5130 });
    assert.equal(donus.statusCode, 200, donus.body);
    assert.equal(donus.json<AracGoreviCevabi>().gorev.durum, 'tamamlandi');
    const son = await aracOku(arac.id);
    assert.equal(son?.durum, 'musait');
    assert.equal(son?.km, 5130);
  });

  test('IDR-25: pasif ya da serviste araç verilmez; aynı araç kesişen tarihlerde ikinci göreve verilmez', async () => {
    const pasif = await aracEkle({ durum: 'pasif' });
    const g1 = await ac({ tarih: bugun, donusTarihi: gunSonra(2) });
    assert.equal((await komut(idari.cerez, g1, 'onayla', { aracId: pasif.id })).statusCode, 400);
    const arac = await aracEkle();
    assert.equal((await komut(idari.cerez, g1, 'onayla', { aracId: arac.id })).statusCode, 200);
    const g2 = await ac({ tarih: gunSonra(2), donusTarihi: gunSonra(3) });
    const dolu = await komut(idari.cerez, g2, 'onayla', { aracId: arac.id });
    assert.equal(dolu.statusCode, 400);
    assert.match(dolu.body, /başka bir görevde/);
    const g3 = await ac({ tarih: gunSonra(3), donusTarihi: gunSonra(3) });
    assert.equal((await komut(idari.cerez, g3, 'onayla', { aracId: arac.id })).statusCode, 200);
  });

  test('IDR-24 ve IDR-23 ret: geçmiş gün, dönüş önce; yanlış durumdan geçiş 422; red nedeni zorunlu; kayıt yazılmaz', async () => {
    const say = async () => (await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM idari_isler_arac_gorevi'))!.n;
    const n = await say();
    assert.equal((await talepAc(calisan.cerez, { tarih: gunSonra(-1), donusTarihi: bugun })).statusCode, 400);
    assert.equal((await talepAc(calisan.cerez, { tarih: gunSonra(2), donusTarihi: gunSonra(1) })).statusCode, 400);
    assert.equal((await talepAc(calisan.cerez, { tarih: bugun, donusTarihi: gunSonra(31) })).statusCode, 400);
    assert.equal(await say(), n);
    const g = await ac();
    assert.equal((await komut(idari.cerez, g, 'cikis', { km: 10 })).statusCode, 422);
    assert.equal((await komut(idari.cerez, g, 'reddet', { neden: ' ' })).statusCode, 400);
    const red = await komut(idari.cerez, g, 'reddet', { neden: 'Deneme: araç yok' });
    assert.equal(red.statusCode, 200, red.body);
    assert.equal(red.json<AracGoreviCevabi>().gorev.durum, 'reddedildi');
    assert.equal((await komut(calisan.cerez, red.json<AracGoreviCevabi>().gorev, 'geri-cek')).statusCode, 422);
  });

  test('yetki ve görünürlük: çalışan yalnız kendi talebini görür ve geri çeker; onaylayamaz; okuyan onaylayamaz', async () => {
    const g = await ac();
    assert.equal((await komut(baska.cerez, g, 'geri-cek')).statusCode, 404);
    assert.equal((await komut(calisan.cerez, g, 'onayla', { aracId: 1 })).statusCode, 403);
    assert.equal((await komut(okuyan.cerez, g, 'reddet', { neden: 'X' })).statusCode, 403);
    assert.equal((await oku(calisan.cerez, '/idari-isler/arac-gorevleri')).statusCode, 403);
    const benim = (await oku(calisan.cerez, '/idari-isler/arac-taleplerim')).json<AracGorevleriCevabi>().gorevler;
    assert.ok(benim.some((x) => x.id === g.id));
    assert.equal((await oku(baska.cerez, '/idari-isler/arac-taleplerim')).json<AracGorevleriCevabi>().gorevler.length, 0);
    const geri = await komut(calisan.cerez, g, 'geri-cek');
    assert.equal(geri.statusCode, 200, geri.body);
    assert.equal(geri.json<AracGoreviCevabi>().gorev.durum, 'geri_cekildi');
    const liste = (await oku(okuyan.cerez, '/idari-isler/arac-gorevleri')).json<AracGorevleriCevabi>().gorevler;
    assert.ok(liste.some((x) => x.id === g.id && x.durum === 'geri_cekildi'));
  });

  test('tutarlılık kısıtları ve tekrar koruması (veritabanı)', async () => {
    const g = await ac();
    await assert.rejects(o().sahip.sorgu("UPDATE idari_isler_arac_gorevi SET durum = 'onaylandi' WHERE id = $1", [g.id]), /onay_butun/);
    await assert.rejects(o().sahip.sorgu(
      "UPDATE idari_isler_arac_gorevi SET durum = 'reddedildi', kapatan_kisi_id = talep_eden_kisi_id, kapanma = now() WHERE id = $1", [g.id],
    ), /red_butun/);
    await assert.rejects(o().sahip.sorgu("UPDATE idari_isler_arac_gorevi SET durum = 'geri_cekildi' WHERE id = $1", [g.id]), /kapanis_butun/);
    const kimlik = randomUUID();
    const govde = { amac: 'Deneme tekrar', varis: 'Deneme depo', tarih: bugun, donusTarihi: bugun };
    const a = await gonder(calisan.cerez, '/idari-isler/arac-gorevleri/ac', govde, kimlik);
    const b = await gonder(calisan.cerez, '/idari-isler/arac-gorevleri/ac', govde, kimlik);
    assert.equal(a.statusCode, 200, a.body);
    assert.equal(b.json<AracGoreviCevabi>().gorev.id, a.json<AracGoreviCevabi>().gorev.id);
  });
});
