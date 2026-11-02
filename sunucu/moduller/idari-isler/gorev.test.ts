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
    assert.equal((await komut(idari.cerez, onayli, 'cikis', { km: 15_001 })).statusCode, 400);
    const cikis = await komut(idari.cerez, onayli, 'cikis', { km: 5010 });
    assert.equal(cikis.statusCode, 200, cikis.body);
    const yolda = cikis.json<AracGoreviCevabi>().gorev;
    assert.equal((await aracOku(arac.id))?.durum, 'gorevde');
    assert.equal((await aracOku(arac.id))?.km, 5010);
    const yoldakiArac = (await aracOku(arac.id))!;
    const elle = await gonder(idari.cerez, `/idari-isler/araclar/${arac.id}/guncelle`, {
      surum: yoldakiArac.surum, plaka: yoldakiArac.plaka, tur: 'binek', sahiplik: 'sirket', km: 5010, durum: 'musait',
    });
    assert.equal(elle.statusCode, 400);
    assert.match(elle.body, /Görevde durumu/);
    assert.equal((await komut(idari.cerez, yolda, 'donus', { km: 5000 })).statusCode, 400);
    assert.equal((await komut(idari.cerez, yolda, 'donus', { km: 9_999_999 })).statusCode, 400);
    const donus = await komut(idari.cerez, yolda, 'donus', { km: 5130 });
    assert.equal(donus.statusCode, 200, donus.body);
    assert.equal(donus.json<AracGoreviCevabi>().gorev.durum, 'tamamlandi');
    const son = await aracOku(arac.id);
    assert.equal(son?.durum, 'musait');
    assert.equal(son?.km, 5130);
  });

  test('IDR-33: görevde durumu elle girilmez', async () => {
    const c = await gonder(idari.cerez, '/idari-isler/araclar/ekle', { plaka: yeniPlaka(), tur: 'binek', sahiplik: 'sirket', durum: 'gorevde' });
    assert.equal(c.statusCode, 400);
    const arac = await aracEkle();
    const g = await gonder(idari.cerez, `/idari-isler/araclar/${arac.id}/guncelle`, {
      surum: arac.surum, plaka: arac.plaka, tur: 'binek', sahiplik: 'sirket', km: 1000, durum: 'gorevde',
    });
    assert.equal(g.statusCode, 400);
    assert.equal((await aracOku(arac.id))?.durum, 'musait');
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

  test('IDR-25: muayenesi ya da sigortası görev bitmeden biten araç verilmez; onaydan sonra biterse çıkamaz', async () => {
    const g = await ac({ tarih: gunSonra(1), donusTarihi: gunSonra(4) });
    const muayenesiGecmis = await aracEkle({ muayeneTarihi: gunSonra(-1) });
    const muayene = await komut(idari.cerez, g, 'onayla', { aracId: muayenesiGecmis.id });
    assert.equal(muayene.statusCode, 400);
    assert.match(muayene.body, /muayenesi/);
    const sigortaYolda = await aracEkle({ sigortaTarihi: gunSonra(3) });
    const sigorta = await komut(idari.cerez, g, 'onayla', { aracId: sigortaYolda.id });
    assert.equal(sigorta.statusCode, 400);
    assert.match(sigorta.body, /sigortası/);
    const gecerli = await aracEkle({ muayeneTarihi: gunSonra(4), sigortaTarihi: gunSonra(30) });
    const onay = await komut(idari.cerez, g, 'onayla', { aracId: gecerli.id });
    assert.equal(onay.statusCode, 200, onay.body);
    const guncel = await gonder(idari.cerez, `/idari-isler/araclar/${gecerli.id}/guncelle`, {
      surum: gecerli.surum, plaka: gecerli.plaka, tur: 'binek', sahiplik: 'sirket', km: 1000, muayeneTarihi: gunSonra(2), sigortaTarihi: gunSonra(30),
    });
    assert.equal(guncel.statusCode, 200, guncel.body);
    const cikis = await komut(idari.cerez, onay.json<AracGoreviCevabi>().gorev, 'cikis', { km: 1000 });
    assert.equal(cikis.statusCode, 422);
    assert.match(cikis.body, /muayenesi/);
  });

  test('IDR-24 ve IDR-25 saat: aynı gün ayrı saatlerdeki iki göreve aynı araç verilir; kesişen saat ve saatsiz görev verilmez', async () => {
    const arac = await aracEkle({});
    const sabah = await ac({ tarih: gunSonra(2), donusTarihi: gunSonra(2), cikisSaati: '08:00', donusSaati: '12:00' });
    assert.deepEqual([sabah.cikisSaati, sabah.donusSaati], ['08:00', '12:00']);
    assert.equal((await komut(idari.cerez, sabah, 'onayla', { aracId: arac.id })).statusCode, 200);
    const ogle = await ac({ tarih: gunSonra(2), donusTarihi: gunSonra(2), cikisSaati: '12:00', donusSaati: '17:00' });
    const ogleOnay = await komut(idari.cerez, ogle, 'onayla', { aracId: arac.id });
    assert.equal(ogleOnay.statusCode, 200, ogleOnay.body);
    const kesisen = await ac({ tarih: gunSonra(2), donusTarihi: gunSonra(2), cikisSaati: '11:00', donusSaati: '13:00' });
    assert.equal((await komut(idari.cerez, kesisen, 'onayla', { aracId: arac.id })).statusCode, 400);
    const saatsiz = await ac({ tarih: gunSonra(2), donusTarihi: gunSonra(2) });
    assert.deepEqual([saatsiz.cikisSaati, saatsiz.donusSaati], [null, null]);
    assert.equal((await komut(idari.cerez, saatsiz, 'onayla', { aracId: arac.id })).statusCode, 400);
    const ters = await talepAc(calisan.cerez, { tarih: gunSonra(2), donusTarihi: gunSonra(2), cikisSaati: '15:00', donusSaati: '09:00' });
    assert.equal(ters.statusCode, 400);
    assert.match(ters.body, /dönüş saati/);
    assert.equal((await talepAc(calisan.cerez, { cikisSaati: '25:00' })).statusCode, 400);
    await assert.rejects(
      o().sahip.sorgu(`UPDATE idari_isler_arac_gorevi SET cikis_saati = '18:00' WHERE id = $1`, [ogle.id]),
      /idari_isler_arac_gorevi_saat_sirasi/,
    );
  });

  test('IDR-26: görev günü gelmeden çıkış yazılmaz; kayıt ve araç değişmez', async () => {
    const g = await ac({ tarih: gunSonra(1), donusTarihi: gunSonra(1) });
    const arac = await aracEkle({});
    const onay = await komut(idari.cerez, g, 'onayla', { aracId: arac.id });
    assert.equal(onay.statusCode, 200, onay.body);
    const cikis = await komut(idari.cerez, onay.json<AracGoreviCevabi>().gorev, 'cikis', { km: arac.km ?? 0 });
    assert.equal(cikis.statusCode, 422);
    assert.match(cikis.body, /Görev günü gelmeden/);
    const satir = await o().sahip.tek<{ durum: string }>('SELECT durum FROM idari_isler_arac_gorevi WHERE id = $1', [g.id]);
    assert.equal(satir?.durum, 'onaylandi');
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
