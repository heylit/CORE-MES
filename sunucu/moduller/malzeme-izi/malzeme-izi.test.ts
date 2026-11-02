import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { malzeme360Cevabi, malzemeAramaCevabi } from '#paylasilan/sozlesme/malzeme-izi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { degerGrubuToplamlari } from '../stok/disari.ts';

const PAROLA = 'dogru-parola-1';

// Kart 1296: Malzeme 360 uçları yalnız okur; sayfa işlemiyle açılır, fiyat ayrıca finans.oku ister.
describe('malzeme-izi uçları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let kartNo = 0;
  let hizmetNo = 0;
  const cerezler = new Map<string, string>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  async function oku(ad: string, yol: string): Promise<{ durum: number; govde: unknown }> {
    const c = await app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerezler.get(ad) ?? '' } });
    return { durum: c.statusCode, govde: c.body ? c.json() : undefined };
  }
  async function giris(kullaniciAdi: string): Promise<void> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200);
    cerezler.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }
  const kart = (kimlik: string, tur: string, sira: number, ad: string) => o().sahip.tek<{ no: number }>(
    `INSERT INTO malzeme_katalog_karti (kimlik, tur, hizmet_yonu, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
     VALUES ($1, $2, CASE WHEN $2 = 'hizmet' THEN 'alinan' END, 'MIZ-DNM-', $3, 'aktif', $4, $5, $5) RETURNING no`,
    [kimlik, tur, sira, JSON.stringify({ id: kimlik, com: { ad } }), yoneticiId]);

  before(async () => {
    ortam = await testVeritabaniKur('malzeme_izi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await giris('yonetici');
    // Depo rolündeki deneme kişisi: sayfa işlemi Aşama 1'de yalnız yöneticidedir.
    const rol = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'depo'");
    const yoneticiRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    await ortam.vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme Depocu', kullaniciAdi: 'depo', parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol!.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu!.id);
    });
    await giris('depo');
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('MIZ-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    kartNo = (await kart('miz-dnm-1', 'hammadde', 1, 'Deneme çubuk'))!.no;
    hizmetNo = (await kart('miz-dnm-2', 'hizmet', 2, 'Deneme hizmet'))!.no;
  });
  after(async () => { await ortam?.kaldir(); });

  test('MIZ-U1 sayfa işlemi olmayan 403; yönetici kartın 360\'ını fiyat bölümüyle okur; bakiyesiz kartta stok null', async () => {
    assert.equal((await oku('depo', `/malzeme-izi/malzemeler/${String(kartNo)}`)).durum, 403);
    assert.equal((await oku('depo', '/malzeme-izi/malzemeler')).durum, 403);
    const c = await oku('yonetici', `/malzeme-izi/malzemeler/${String(kartNo)}`);
    assert.equal(c.durum, 200);
    const v = malzeme360Cevabi.parse(c.govde);
    assert.equal(v.kart.tur, 'hammadde');
    assert.equal(v.stok, null);
    assert.deepEqual(v.gelecek, []);
    assert.equal(v.paraGorunur, true);
    assert.deepEqual(v.para, { ortalamaAlis: { tryBirimFiyat: null, teslimSayisi: 0 }, sonAlis: null, kg: null });
  });

  test('MIZ-U2 olmayan kart ve hizmet kartı 404; arama hizmeti listelemez', async () => {
    assert.equal((await oku('yonetici', '/malzeme-izi/malzemeler/999999')).durum, 404);
    assert.equal((await oku('yonetici', `/malzeme-izi/malzemeler/${String(hizmetNo)}`)).durum, 404);
    const c = await oku('yonetici', '/malzeme-izi/malzemeler?metin=Deneme');
    assert.equal(c.durum, 200);
    const l = malzemeAramaCevabi.parse(c.govde);
    assert.deepEqual(l.satirlar.map((s) => s.id), [kartNo]);
  });

  test('MIZ-U3 sayfa işlemi olup finans.oku olmayan kişide fiyat sorulmaz, para null', async () => {
    await o().sahip.sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'sayfa.malzeme-izi' FROM rol WHERE kod = 'depo' ON CONFLICT DO NOTHING");
    const c = await oku('depo', `/malzeme-izi/malzemeler/${String(kartNo)}`);
    assert.equal(c.durum, 200);
    const v = malzeme360Cevabi.parse(c.govde);
    assert.equal(v.paraGorunur, false);
    assert.equal(v.para, null);
  });

  test('MIZ-U4 stok grupları yalnız istenen kartın bakiyesinden; başka kartın bakiyesi okunmaz ve karışmaz', async () => {
    const a = (await kart('miz-dnm-3', 'hammadde', 3, 'Deneme sac'))!.no;
    const b = (await kart('miz-dnm-4', 'hammadde', 4, 'Deneme boru'))!.no;
    const hurda = await o().sahip.tek<{ id: number }>(
      "INSERT INTO stok_konum (depo_id, kod, tur) SELECT id, 'MIZ-HURDA', 'hurda' FROM stok_depo WHERE kod = 'ANA' RETURNING id");
    const bakiye = (m: number, konum: string, miktar: string) => o().sahip.sorgu(
      'INSERT INTO stok_bakiye (malzeme_id, konum_id, miktar, ilk_giris) VALUES ($1, $2, $3, now())', [m, konum, miktar]);
    const kabul = (await o().sahip.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
    await bakiye(a, String(kabul), '5');
    await bakiye(a, String(hurda!.id), '2');
    await bakiye(b, String(kabul), '7');
    assert.deepEqual((await degerGrubuToplamlari(o().vt, [a])).map((g) => [g.malzemeId, g.grup, Number(g.toplam)]), [[a, 'hurda', 2], [a, 'kullanilabilir', 5]]);
    assert.ok((await degerGrubuToplamlari(o().vt)).some((g) => g.malzemeId === b));
    const v = malzeme360Cevabi.parse((await oku('yonetici', `/malzeme-izi/malzemeler/${String(a)}`)).govde);
    assert.deepEqual(v.stok?.gruplar, [{ grup: 'kullanilabilir', miktar: '5' }, { grup: 'hurda', miktar: '2' }]);
    assert.equal(v.stok?.toplam, '7.000');
  });
});
