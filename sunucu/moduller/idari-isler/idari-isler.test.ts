import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { BugunCevabi, Talep, TalepCevabi, TalepPanosuCevabi, TaleplerimCevabi } from '#paylasilan/sozlesme/idari-isler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';
const talepIdleri = (b: BugunCevabi): number[] => b.isler.flatMap((i) => (i.tur === 'talep' ? [i.talep.id] : []));

// Rol x işlem satırları henüz yok (kullanıcı onayı bekliyor): personel ve idari işler yetkisi kişiye ek işlemle verilir.
describe('idari-isler tesis talepleri (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let sayac = 0;
  let personel = { cerez: '', id: 0 };
  let personel2 = { cerez: '', id: 0 };
  let idari = { cerez: '', id: 0 };
  let okuyan = { cerez: '', id: 0 };
  let yetkisiz = { cerez: '', id: 0 };

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function girisYap(islemler: string[]): Promise<{ cerez: string; id: number }> {
    const kullaniciAdi = `idari-${(sayac += 1)}`;
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

  const gonder = (cerez: string, yol: string, govde: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'POST', url: `/api${yol}`, payload: govde as object, headers: { cookie: cerez, 'istek-kimligi': randomUUID() } });
  const oku = (cerez: string, yol: string): Promise<LightMyRequestResponse> =>
    app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });

  async function talepAc(kim = personel, degisen: Record<string, unknown> = {}): Promise<Talep> {
    const c = await gonder(kim.cerez, '/idari-isler/talepler/ac', { kategori: 'elektrik', yer: 'Salon 1 kompresör odası', ...degisen });
    assert.equal(c.statusCode, 200, c.body);
    return c.json<TalepCevabi>().talep;
  }
  const komut = (kim: { cerez: string }, t: Talep, ad: string, govde: Record<string, unknown> = {}) =>
    gonder(kim.cerez, `/idari-isler/talepler/${t.id}/${ad}`, { surum: t.surum, ...govde });

  before(async () => {
    ortam = await testVeritabaniKur('idari_isler');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await girisYap([]);
    personel = await girisYap(['idari-isler.talep-ac']);
    personel2 = await girisYap(['idari-isler.talep-ac']);
    idari = await girisYap(['idari-isler.oku', 'idari-isler.talep-ac', 'idari-isler.talep-yonet']);
    okuyan = await girisYap(['idari-isler.oku']);
    yetkisiz = await girisYap([]);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('IDR-01: personel kendi adına açar; gövdeye yazılan açan ve zaman kullanılmaz, ikisi de sunucudan', async () => {
    const t = await talepAc(personel, { aciklama: '  Sigorta atıyor  ', aciliyet: 'acil', acanKisiId: idari.id, acilma: '2020-01-01T00:00:00Z' });
    assert.match(t.no, /^TT-\d{4}-\d{3,}$/);
    assert.deepEqual([t.durum, t.acanKisiId, t.aciklama, t.aciliyet], ['yeni', personel.id, 'Sigorta atıyor', 'acil']);
    assert.notEqual(t.acilma.slice(0, 4), '2020');
    assert.equal(t.acanAd, `Deneme idari-2`);
  });

  test('IDR-01 red: işlemi olmayan açamaz (403), girişsiz 401; boş yer ve bilinmeyen kategori 400', async () => {
    assert.equal((await gonder(yetkisiz.cerez, '/idari-isler/talepler/ac', { kategori: 'su', yer: 'Bina A' })).statusCode, 403);
    assert.equal((await app.inject({ method: 'POST', url: '/api/idari-isler/talepler/ac', payload: { kategori: 'su', yer: 'Bina A' } })).statusCode, 401);
    assert.equal((await gonder(personel.cerez, '/idari-isler/talepler/ac', { kategori: 'su', yer: '   ' })).statusCode, 400);
    assert.equal((await gonder(personel.cerez, '/idari-isler/talepler/ac', { kategori: 'makine', yer: 'Bina A' })).statusCode, 400);
  });

  test('IDR-05: Taleplerim yalnız kendi taleplerini verir; son yerler kendi taleplerinden, yinelenmeden', async () => {
    await talepAc(personel2, { yer: 'Yemekhane' });
    await talepAc(personel2, { yer: 'Depo' });
    await talepAc(personel2, { yer: 'Yemekhane' });
    const benim = (await oku(personel2.cerez, '/idari-isler/taleplerim')).json<TaleplerimCevabi>();
    assert.equal(benim.toplam, 3);
    assert.ok(benim.satirlar.every((t) => t.acanKisiId === personel2.id));
    const yerler = (await oku(personel2.cerez, '/idari-isler/taleplerim/son-yerler')).json<{ yerler: string[] }>().yerler;
    assert.deepEqual(yerler, ['Yemekhane', 'Depo']);
    assert.ok((await oku(personel.cerez, '/idari-isler/taleplerim')).json<TaleplerimCevabi>().satirlar.every((t) => t.acanKisiId === personel.id));
    assert.equal((await oku(yetkisiz.cerez, '/idari-isler/taleplerim')).statusCode, 403);
  });

  test('IDR-05 pano ve Bugün: yalnız oku işlemi olan görür; personel 403', async () => {
    const t = await talepAc();
    assert.equal((await oku(personel.cerez, '/idari-isler/talepler/pano')).statusCode, 403);
    assert.equal((await oku(personel.cerez, '/idari-isler/bugun')).statusCode, 403);
    const pano = (await oku(okuyan.cerez, '/idari-isler/talepler/pano')).json<TalepPanosuCevabi>();
    assert.ok(pano.yeni.talepler.some((p) => p.id === t.id));
    assert.ok(pano.yeni.toplam >= pano.yeni.talepler.length);
    const bugun = (await oku(okuyan.cerez, '/idari-isler/bugun')).json<BugunCevabi>();
    assert.ok(talepIdleri(bugun).includes(t.id));
    assert.ok(bugun.sayilar.acikTalep >= 1);
  });

  test('IDR-02 akış: üstlen, bırak (geri al), yeniden üstlen ve kapat; sürüm her adımda artar, eski sürüm 409', async () => {
    let t = await talepAc();
    const u = await komut(idari, t, 'ustlen');
    assert.equal(u.statusCode, 200, u.body);
    const ustlenilen = u.json<TalepCevabi>().talep;
    assert.deepEqual([ustlenilen.durum, ustlenilen.ustlenenKisiId, ustlenilen.surum], ['yapiliyor', idari.id, t.surum + 1]);
    assert.equal((await komut(idari, t, 'birak')).statusCode, 409);
    const b = await komut(idari, ustlenilen, 'birak');
    assert.equal(b.statusCode, 200, b.body);
    t = b.json<TalepCevabi>().talep;
    assert.deepEqual([t.durum, t.ustlenenKisiId, t.ustlenme], ['yeni', null, null]);
    t = (await komut(idari, t, 'ustlen')).json<TalepCevabi>().talep;
    const k = await komut(idari, t, 'kapat', { sonucNotu: 'Sigorta değişti' });
    assert.equal(k.statusCode, 200, k.body);
    const kapanan = k.json<TalepCevabi>().talep;
    assert.equal(kapanan.durum, 'kapandi');
    assert.equal(kapanan.sonucNotu, 'Sigorta değişti');
    assert.notEqual(kapanan.kapanma, null);
    assert.equal(kapanan.kapatanAd, `Deneme idari-4`);
    const tekrar = await komut(idari, kapanan, 'ustlen');
    assert.equal(tekrar.statusCode, 422, tekrar.body);
    assert.match(tekrar.body, /Kapanmış talep üstlenilemez/);
  });

  test('IDR-02 red: talep-yonet olmayan (personel ve yalnız okuyan) üstlenemez, kapatamaz (403); durum değişmez', async () => {
    const t = await talepAc();
    for (const kim of [personel, okuyan]) {
      assert.equal((await komut(kim, t, 'ustlen')).statusCode, 403);
      assert.equal((await komut(kim, t, 'kapat')).statusCode, 403);
      assert.equal((await komut(kim, t, 'reddet', { neden: 'Yok' })).statusCode, 403);
    }
    const pano = (await oku(okuyan.cerez, '/idari-isler/talepler/pano')).json<TalepPanosuCevabi>();
    assert.equal(pano.yeni.talepler.find((p) => p.id === t.id)?.durum, 'yeni');
  });

  test('IDR-04: red nedensiz olmaz (400), nedenle reddedilir ve neden kayda geçer', async () => {
    const t = await talepAc();
    assert.equal((await komut(idari, t, 'reddet', { neden: '  ' })).statusCode, 400);
    const r = await komut(idari, t, 'reddet', { neden: 'Makine arızası; bakıma bildirin.' });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual([r.json<TalepCevabi>().talep.durum, r.json<TalepCevabi>().talep.sonucNotu], ['reddedildi', 'Makine arızası; bakıma bildirin.']);
  });

  test('IDR-03: açan yeni talebini geri çeker; başkası çekemez (404), üstlenilmiş talep geri çekilmez (422)', async () => {
    const t = await talepAc();
    assert.equal((await komut(personel2, t, 'geri-cek')).statusCode, 404);
    const g = await komut(personel, t, 'geri-cek');
    assert.equal(g.statusCode, 200, g.body);
    assert.equal(g.json<TalepCevabi>().talep.durum, 'geri_cekildi');
    const u = await talepAc();
    const ustlenilen = (await komut(idari, u, 'ustlen')).json<TalepCevabi>().talep;
    assert.equal((await komut(personel, ustlenilen, 'geri-cek')).statusCode, 422);
  });

  test('IDR-07: başkasına atama etkin kişiye olur; olmayan kişiye 400', async () => {
    const t = await talepAc();
    assert.equal((await komut(idari, t, 'ustlen', { kisiId: 999999 })).statusCode, 400);
    const a = await komut(idari, t, 'ustlen', { kisiId: personel2.id });
    assert.equal(a.statusCode, 200, a.body);
    assert.equal(a.json<TalepCevabi>().talep.ustlenenKisiId, personel2.id);
    assert.equal((await oku(idari.cerez, '/idari-isler/kisi-secenekleri')).statusCode, 200);
    assert.equal((await oku(okuyan.cerez, '/idari-isler/kisi-secenekleri')).statusCode, 403);
  });

  test('IDR-10 Bugün: yeni talepler ve kişinin üstlendikleri; başkasının üstlendiği görünmez', async () => {
    const benim = (await komut(idari, await talepAc(), 'ustlen')).json<TalepCevabi>().talep;
    const baskasinin = (await komut(idari, await talepAc(), 'ustlen', { kisiId: personel2.id })).json<TalepCevabi>().talep;
    const isler = talepIdleri((await oku(idari.cerez, '/idari-isler/bugun')).json<BugunCevabi>());
    assert.ok(isler.includes(benim.id));
    assert.ok(!isler.includes(baskasinin.id));
  });

  test('menü sayaçları: yetkiye göre süzülür; işlemsiz kişiye hepsi null', async () => {
    await talepAc();
    const p = (await oku(personel.cerez, '/idari-isler/menu-sayaclari')).json<Record<string, number | null>>();
    assert.equal(p.bugun, null);
    assert.equal(p.talepler, null);
    assert.equal(typeof p.taleplerim, 'number');
    const i = (await oku(idari.cerez, '/idari-isler/menu-sayaclari')).json<Record<string, number | null>>();
    assert.ok((i.talepler ?? 0) >= 1);
    const y = (await oku(yetkisiz.cerez, '/idari-isler/menu-sayaclari')).json<Record<string, number | null>>();
    assert.deepEqual(y, {
      bugun: null, talepler: null, taleplerim: null, periyodik: null, yemek: null, filo: null, 'arac-gorevleri': null, 'arac-taleplerim': null,
    });
  });

  test('tekrar koruması: aynı istek kimliğiyle ikinci açma yeni kayıt açmaz', async () => {
    const kimlik = randomUUID();
    const govde = { kategori: 'temizlik', yer: 'Soyunma odası' };
    const istek = () => app.inject({ method: 'POST', url: '/api/idari-isler/talepler/ac', payload: govde, headers: { cookie: personel.cerez, 'istek-kimligi': kimlik } });
    const a = (await istek()).json<TalepCevabi>().talep;
    const b = (await istek()).json<TalepCevabi>().talep;
    assert.equal(a.id, b.id);
  });

  test('kısıtlar: yapılan talep üstlenensiz, reddedilen nedensiz olamaz (veritabanı)', async () => {
    const t = await talepAc();
    await assert.rejects(o().sahip.sorgu("UPDATE idari_isler_talep SET durum = 'yapiliyor' WHERE id = $1", [t.id]), /idari_isler_talep_yapiliyor_ustlenen/);
    await assert.rejects(
      o().sahip.sorgu("UPDATE idari_isler_talep SET durum = 'reddedildi', kapanma = now(), kapatan_kisi_id = acan_kisi_id WHERE id = $1", [t.id]),
      /idari_isler_talep_red_nedeni/,
    );
  });
});
