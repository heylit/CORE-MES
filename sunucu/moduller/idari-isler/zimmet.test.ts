import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Demirbas, DemirbasCevabi, DemirbaslarCevabi, Zimmet, ZimmetCevabi, ZimmetlerCevabi } from '#paylasilan/sozlesme/idari-isler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kisilerinAcikZimmetleri } from './disari.ts';

const PAROLA = 'dogru-parola-1';

describe('idari-isler demirbaş ve zimmet (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let sayac = 0;
  let idari = { cerez: '', id: 0 };
  let okuyan = { cerez: '', id: 0 };
  let calisan = { cerez: '', id: 0 };
  let alan = { cerez: '', id: 0 };
  let bugun = '';

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function girisYap(islemler: string[]): Promise<{ cerez: string; id: number }> {
    const kullaniciAdi = `idari-z-${(sayac += 1)}`;
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
  async function demirbasEkle(degisen: Record<string, unknown> = {}): Promise<Demirbas> {
    const c = await gonder(idari.cerez, '/idari-isler/demirbaslar/ekle', { tur: 'dizustu', markaModel: 'Deneme dizüstü', seriNo: 'DNM-SN-1', deger: '30000', ...degisen });
    assert.equal(c.statusCode, 200, c.body);
    return c.json<DemirbasCevabi>().demirbas;
  }
  async function zimmetle(d: Demirbas, degisen: Record<string, unknown> = {}): Promise<Demirbas> {
    const c = await gonder(idari.cerez, `/idari-isler/demirbaslar/${d.id}/zimmetle`, { surum: d.surum, kisiId: alan.id, verilis: bugun, ...degisen });
    assert.equal(c.statusCode, 200, c.body);
    return c.json<DemirbasCevabi>().demirbas;
  }
  const iade = (cerez: string, z: Zimmet, ek: object = {}) =>
    gonder(cerez, `/idari-isler/zimmetler/${z.id}/iade`, { surum: z.surum, iade: bugun, iadeDurumu: 'saglam', ...ek });
  const listeOku = async (id: number): Promise<Demirbas | undefined> =>
    (await oku(okuyan.cerez, '/idari-isler/demirbaslar')).json<DemirbaslarCevabi>().demirbaslar.find((d) => d.id === id);
  const gunEkle = (gun: number): string => {
    const d = new Date(`${bugun}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + gun);
    return d.toISOString().slice(0, 10);
  };

  before(async () => {
    ortam = await testVeritabaniKur('idari_isler_zimmet');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await girisYap([]);
    idari = await girisYap(['idari-isler.oku', 'idari-isler.zimmet-yaz']);
    okuyan = await girisYap(['idari-isler.oku']);
    calisan = await girisYap(['idari-isler.talep-ac']);
    alan = await girisYap([]);
    bugun = (await o().sahip.tek<{ bugun: string }>('SELECT current_date AS bugun'))!.bugun;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('IDR-30 ve IDR-31 akış: kayıt, zimmet, sağlam iade; demirbaş boşta-zimmetli-boşta, geçmiş ve disari açık zimmeti gösterir', async () => {
    const d = await demirbasEkle();
    assert.match(d.no, /^DB-\d{5}$/);
    assert.equal(d.durum, 'bosta');
    assert.equal(d.deger, '30000.00');
    const zd = await zimmetle(d);
    assert.equal(zd.durum, 'zimmetli');
    assert.equal(zd.acikZimmet?.kisiAd, 'Deneme idari-z-5');
    assert.equal(zd.acikZimmet?.verenAd, 'Deneme idari-z-2');
    const acik = (await o().vt.tx((db) => kisilerinAcikZimmetleri(db, [alan.id, calisan.id])));
    assert.equal(acik.get(alan.id)?.some((a) => a.demirbasId === d.id && a.tur === 'dizustu'), true);
    assert.equal(acik.has(calisan.id), false);
    const i = await iade(idari.cerez, zd.acikZimmet!);
    assert.equal(i.statusCode, 200, i.body);
    assert.equal(i.json<ZimmetCevabi>().zimmet.iadeAlanAd, 'Deneme idari-z-2');
    const son = await listeOku(d.id);
    assert.equal(son?.durum, 'bosta');
    assert.equal(son?.acikZimmet, null);
    const gecmis = (await oku(okuyan.cerez, `/idari-isler/demirbaslar/${d.id}/zimmetler`)).json<ZimmetlerCevabi>().zimmetler;
    assert.equal(gecmis.length, 1);
    assert.equal(gecmis[0]?.iadeDurumu, 'saglam');
  });

  test('IDR-31: hasarlı iade bakıma, kayıp iade kayba düşürür; iade edilmiş zimmet ikinci kez iade edilmez (422)', async () => {
    const d1 = await zimmetle(await demirbasEkle());
    assert.equal((await iade(idari.cerez, d1.acikZimmet!, { iadeDurumu: 'hasarli', iadeNotu: 'Deneme ekran çatlak' })).statusCode, 200);
    assert.equal((await listeOku(d1.id))?.durum, 'bakimda');
    const z = (await oku(okuyan.cerez, `/idari-isler/demirbaslar/${d1.id}/zimmetler`)).json<ZimmetlerCevabi>().zimmetler[0]!;
    assert.equal((await iade(idari.cerez, z)).statusCode, 422);
    const d2 = await zimmetle(await demirbasEkle({ tur: 'anahtar', seriNo: null, deger: null }));
    assert.equal((await iade(idari.cerez, d2.acikZimmet!, { iadeDurumu: 'kayip' })).statusCode, 200);
    assert.equal((await listeOku(d2.id))?.durum, 'kayip');
  });

  test('IDR-29, IDR-30 ve IDR-31 ret: değer, zimmetliyi yeniden zimmetleme, ileri ve önceki tarih, eski sürüm; kayıt yazılmaz', async () => {
    const say = async () => (await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM idari_isler_zimmet'))!.n;
    for (const deger of ['0', '-1', '1.234']) {
      assert.equal((await gonder(idari.cerez, '/idari-isler/demirbaslar/ekle', { tur: 'monitor', deger })).statusCode, 400, deger);
    }
    const d = await demirbasEkle();
    const n = await say();
    assert.equal((await gonder(idari.cerez, `/idari-isler/demirbaslar/${d.id}/zimmetle`, { surum: d.surum, kisiId: alan.id, verilis: gunEkle(1) })).statusCode, 400);
    assert.equal((await gonder(idari.cerez, `/idari-isler/demirbaslar/${d.id}/zimmetle`, { surum: d.surum, kisiId: 999999, verilis: bugun })).statusCode, 400);
    assert.equal((await gonder(idari.cerez, `/idari-isler/demirbaslar/${d.id}/zimmetle`, { surum: d.surum + 3, kisiId: alan.id, verilis: bugun })).statusCode, 409);
    assert.equal(await say(), n);
    const zd = await zimmetle(d, { verilis: gunEkle(-2) });
    const tekrar = await gonder(idari.cerez, `/idari-isler/demirbaslar/${d.id}/zimmetle`, { surum: zd.surum, kisiId: calisan.id, verilis: bugun });
    assert.equal(tekrar.statusCode, 400);
    assert.match(tekrar.body, /boşta/);
    assert.equal((await iade(idari.cerez, zd.acikZimmet!, { iade: gunEkle(-3) })).statusCode, 400);
    assert.equal((await iade(idari.cerez, zd.acikZimmet!, { iade: gunEkle(1) })).statusCode, 400);
    assert.equal(await say(), n + 1);
  });

  test('IDR-30: zimmetli demirbaşın durumu elle değişmez (öteki alanları durumsuz düzenlenir), hurda son durumdur; boştaki bakıma alınır', async () => {
    const zd = await zimmetle(await demirbasEkle());
    const govde = (d: Demirbas, durum: string) => ({ surum: d.surum, tur: d.tur, markaModel: d.markaModel, seriNo: d.seriNo, deger: d.deger, aciklama: null, durum });
    assert.equal((await gonder(idari.cerez, `/idari-isler/demirbaslar/${zd.id}/guncelle`, govde(zd, 'bosta'))).statusCode, 422);
    const durumsuz = await gonder(idari.cerez, `/idari-isler/demirbaslar/${zd.id}/guncelle`, { ...govde(zd, 'bosta'), durum: null, markaModel: 'Deneme yeni model' });
    assert.equal(durumsuz.statusCode, 200, durumsuz.body);
    assert.equal(durumsuz.json<DemirbasCevabi>().demirbas.durum, 'zimmetli');
    const d = await demirbasEkle();
    const hurda = await gonder(idari.cerez, `/idari-isler/demirbaslar/${d.id}/guncelle`, govde(d, 'hurda'));
    assert.equal(hurda.statusCode, 200, hurda.body);
    const h = hurda.json<DemirbasCevabi>().demirbas;
    assert.equal((await gonder(idari.cerez, `/idari-isler/demirbaslar/${d.id}/guncelle`, govde(h, 'bosta'))).statusCode, 422);
    const d2 = await demirbasEkle();
    assert.equal((await gonder(idari.cerez, `/idari-isler/demirbaslar/${d2.id}/guncelle`, govde(d2, 'bakimda'))).statusCode, 200);
  });

  test('yetki: okuyan yazamaz; talep açan demirbaş okuyamaz; zimmet yazan kişi seçeneklerini alır', async () => {
    const d = await demirbasEkle();
    assert.equal((await gonder(okuyan.cerez, '/idari-isler/demirbaslar/ekle', { tur: 'monitor' })).statusCode, 403);
    assert.equal((await gonder(okuyan.cerez, `/idari-isler/demirbaslar/${d.id}/zimmetle`, { surum: d.surum, kisiId: alan.id, verilis: bugun })).statusCode, 403);
    assert.equal((await oku(calisan.cerez, '/idari-isler/demirbaslar')).statusCode, 403);
    assert.equal((await oku(idari.cerez, '/idari-isler/kisi-secenekleri')).statusCode, 200);
    assert.equal((await oku(okuyan.cerez, '/idari-isler/kisi-secenekleri')).statusCode, 403);
  });

  test('IDR-32: kişisiz (adla) zimmet kişiye bir kez bağlanır; okuyan bağlayamaz, eski sürüm 409, bağlı zimmet yeniden bağlanmaz (422)', async () => {
    const d = await demirbasEkle({ seriNo: 'DNM-SN-ADLA' });
    const s = o().sahip;
    await s.sorgu("UPDATE idari_isler_demirbas SET durum = 'zimmetli' WHERE id = $1", [d.id]);
    await s.sorgu(
      "INSERT INTO idari_isler_zimmet (demirbas_id, personel_adi, verilis, veren_kisi_id) VALUES ($1, 'Deneme adla personel', $2, $3)",
      [d.id, bugun, idari.id],
    );
    const z = (await listeOku(d.id))!.acikZimmet!;
    assert.equal(z.kisiId, null);
    assert.equal(z.personelAdi, 'Deneme adla personel');
    assert.equal(z.ikdenTasindi, false);
    assert.equal((await gonder(okuyan.cerez, `/idari-isler/zimmetler/${z.id}/kisiye-bagla`, { surum: z.surum, kisiId: calisan.id })).statusCode, 403);
    assert.equal((await gonder(idari.cerez, `/idari-isler/zimmetler/${z.id}/kisiye-bagla`, { surum: z.surum + 1, kisiId: calisan.id })).statusCode, 409);
    const bag = await gonder(idari.cerez, `/idari-isler/zimmetler/${z.id}/kisiye-bagla`, { surum: z.surum, kisiId: calisan.id });
    assert.equal(bag.statusCode, 200, bag.body);
    const bagliZ = bag.json<ZimmetCevabi>().zimmet;
    assert.equal(bagliZ.kisiId, calisan.id);
    assert.equal((await gonder(idari.cerez, `/idari-isler/zimmetler/${z.id}/kisiye-bagla`, { surum: bagliZ.surum, kisiId: alan.id })).statusCode, 422);
    assert.equal((await o().vt.tx((db) => kisilerinAcikZimmetleri(db, [calisan.id]))).get(calisan.id)?.some((a) => a.demirbasId === d.id), true);
    assert.equal((await iade(idari.cerez, bagliZ)).statusCode, 200);
  });

  test('tablo kısıtı: bir demirbaşta tek açık zimmet; yeni kayıtta iade bilgisi birlikte; sahipsiz zimmet yazılmaz', async () => {
    const zd = await zimmetle(await demirbasEkle());
    const s = o().sahip;
    await assert.rejects(
      s.sorgu('INSERT INTO idari_isler_zimmet (demirbas_id, kisi_id, verilis, veren_kisi_id) VALUES ($1, $2, $3, $2)', [zd.id, alan.id, bugun]),
      /idari_isler_zimmet_acik_tek/,
    );
    await assert.rejects(s.sorgu('UPDATE idari_isler_zimmet SET iade = $2 WHERE id = $1', [zd.acikZimmet!.id, bugun]), /idari_isler_zimmet_yeni_butun/);
    await assert.rejects(s.sorgu('UPDATE idari_isler_zimmet SET kisi_id = NULL WHERE id = $1', [zd.acikZimmet!.id]), /idari_isler_zimmet_sahibi/);
  });
});
