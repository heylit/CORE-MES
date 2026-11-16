import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import { BELIRSIZ_BEKLEME_MS, ESKI_YARDIMCI_ILETISI, PROJE_KODU_EN_COK } from './kurallar.ts';
import type { GonderilecekProje } from './kurallar.ts';
import { PROJE_AKTIF_DEGIL, PROJE_GONDERILMEZ, PROJE_KURULUM_BEKLEME_MS, PROJE_SIRADA, projeDegisti, projeTuru } from './proje.ts';
import type { ProjeTurOrtami } from './proje.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import type { SahteKopru } from './sahte-kopru.ts';
import { belgeProjesi, gidenIzleme, yeniSurecBellegi } from './servis.ts';

const PAROLA = 'dogru-parola-1';

// 3315 c: CORE proje kartı Logo'ya (sahte köprü, gerçek PostgreSQL). Kaynak testte verilir; üretimde projelerin aktif projeleridir.
describe('Logo proje kartı gönderimi (3315, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let kopru: SahteKopru;
  let cerez = '';
  let projeler: GonderilecekProje[] = [];
  let simdi = Date.parse('2026-11-16T10:00:00Z');

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const ayar = async (anahtar: string, deger: boolean): Promise<void> => {
    const c = await app.inject({ method: 'POST', url: `/api/ayarlar/${anahtar}/degistir`, headers: { cookie: cerez, 'istek-kimligi': randomUUID() }, payload: { deger } });
    assert.equal(c.statusCode, 200, c.body);
  };
  const ortami = (): ProjeTurOrtami => ({
    kopru: kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, { sureMs: 5000 }), bellek: yeniSurecBellegi(), saat: () => new Date(simdi),
    kaynak: { aktifProjeler: () => Promise.resolve(projeler) }, kurulum: { son: null, ileti: null },
  });
  const giden = (no: number) => vt().tek<{ sonuc: string | null; kayit: string | null; sonraki: Date | null; hata: string | null; niyet: Date | null }>(
    `SELECT son_sonuc AS sonuc, logo_kayit_no AS kayit, sonraki_deneme AS sonraki, son_hata AS hata, niyet_zamani AS niyet
       FROM logo_giden WHERE belge_turu = 'proje' AND belge_no = $1`, [no]);
  const yazmalar = (): string[] => kopru.istekler.filter((i) => i.yontem === 'POST').map((i) => i.yol);

  before(async () => {
    ortam = await testVeritabaniKur('logoproje');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'lp-yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'lp-yonetici', parola: PAROLA } });
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    kopru = await sahteKopruAc();
  });
  after(async () => { await kopru?.kapat(); await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    await vt().sorgu("DELETE FROM logo_giden WHERE belge_turu = 'proje'");
    kopru.projeler.clear();
    kopru.projeAcilan.clear();
    kopru.istekler.length = 0;
    kopru.senaryo = 'basari';
    kopru.projeNesnesi = true;
    kopru.projeUcuYok = false;
    projeler = [{ id: 1, kod: 'ORN.PRJ1', ad: 'Deneme proje 1' }, { id: 2, kod: 'ORN.PRJ2', ad: 'Deneme proje 2' }];
    await ayar('logo.baglanti', true);
    await ayar('logo.proje-gonderimi', true);
  });

  test('LP-1 anahtar kapalıyken istek yok; açılınca önce niyet, sonra "var mı" ve açma; açılan proje kuyruktan düşer', async () => {
    const o = ortami();
    await ayar('logo.proje-gonderimi', false);
    assert.deepEqual(await projeTuru(vt(), o), { tur: 'proje-kapali' });
    await ayar('logo.proje-gonderimi', true);
    await ayar('logo.baglanti', false);
    assert.deepEqual(await projeTuru(vt(), o), { tur: 'kapali' });
    assert.equal(kopru.istekler.length, 0);
    await ayar('logo.baglanti', true);
    assert.deepEqual(await projeTuru(vt(), o), { tur: 'proje-niyet', no: 1 });
    assert.equal(kopru.istekler.length, 0, 'niyet turu istek atmaz');
    assert.deepEqual(await projeTuru(vt(), o), { tur: 'proje', no: 1, sonuc: 'gonderildi' });
    assert.deepEqual(kopru.istekler.map((i) => `${i.yontem} ${i.yol}`), ['GET /api/Project/exists/ORN.PRJ1', 'POST /api/Project/AddRich']);
    assert.deepEqual(kopru.istekler[1]?.govde, { code: 'ORN.PRJ1', name: 'Deneme proje 1' });
    assert.equal((await giden(1))?.kayit, String(kopru.projeler.get('ORN.PRJ1')));
    assert.deepEqual(await projeTuru(vt(), o), { tur: 'proje-niyet', no: 2 }, 'sıradaki proje');
    assert.deepEqual(await projeTuru(vt(), o), { tur: 'proje', no: 2, sonuc: 'gonderildi' });
    assert.deepEqual(await projeTuru(vt(), o), { tur: 'bos' });
    assert.equal(kopru.projeAcilan.get('ORN.PRJ1'), 1);
  });

  test('LP-2 Logo\'da aynı kodlu proje varsa açılmaz, bağlanır', async () => {
    kopru.projeler.set('ORN.PRJ1', 777);
    const o = ortami();
    await projeTuru(vt(), o);
    assert.deepEqual(await projeTuru(vt(), o), { tur: 'proje', no: 1, sonuc: 'zaten-vardi' });
    assert.deepEqual(yazmalar(), []);
    assert.equal((await giden(1))?.kayit, '777');
    projeler = [projeler[0]!];
    simdi += 24 * 3600_000;
    assert.deepEqual(await projeTuru(vt(), o), { tur: 'bos' }, 'bağlanan proje Logo\'da sayılır, kuyruktan düşer');
  });

  test('LP-3 yardımcıda proje nesnesi yokken deneme sayılmaz, bekliyor döner ve bekleme dolmadan yeniden sorulmaz', async () => {
    kopru.projeNesnesi = false;
    const o = ortami();
    await projeTuru(vt(), o);
    const r = await projeTuru(vt(), o);
    assert.equal(r.tur, 'proje-kurulum-bekliyor');
    assert.match(r.tur === 'proje-kurulum-bekliyor' ? r.ileti : '', /proje_nesnesi/);
    assert.equal((await giden(1))?.sonuc, null, 'deneme yazılmadı');
    const istek = kopru.istekler.length;
    assert.equal((await projeTuru(vt(), o)).tur, 'proje-kurulum-bekliyor');
    assert.equal(kopru.istekler.length, istek, 'bekleme dolmadan istek yok');
    kopru.projeNesnesi = true;
    simdi += PROJE_KURULUM_BEKLEME_MS + BELIRSIZ_BEKLEME_MS;
    assert.deepEqual(await projeTuru(vt(), o), { tur: 'proje', no: 1, sonuc: 'gonderildi' }, 'niyet eski: süre dolunca önce "var mı" ile gider');
  });

  test('LP-4 Logo reddederse proje durur; izlemede "Proje kartı" olarak görünür; kart kaydedilince yeniden sıraya girer', async () => {
    kopru.senaryo = 'dogrulama';
    projeler = [projeler[0]!];
    const o = ortami();
    await projeTuru(vt(), o);
    assert.deepEqual(await projeTuru(vt(), o), { tur: 'proje', no: 1, sonuc: 'reddedildi' });
    const g = await giden(1);
    assert.equal(g?.sonraki, null, 'durdu');
    assert.match(g?.hata ?? '', /Logo reddetti/);
    const iz = await vt().tx((db) => gidenIzleme(db, new Date(simdi)));
    const satir = iz.belgeler.find((b) => b.belge === 'proje' && b.no === 1);
    assert.equal(satir?.belgeAdi, 'Proje kartı');
    assert.equal(satir?.durum, 'durdu');
    assert.match(satir?.neYapmali ?? '', /Proje kartını düzeltip kaydedin/);
    assert.deepEqual(await projeTuru(vt(), o), { tur: 'bos' }, 'duran proje kendiliğinden gitmez');
    kopru.senaryo = 'basari';
    await vt().tx((db) => projeDegisti(db, 1, new Date(simdi)));
    assert.deepEqual(await projeTuru(vt(), o), { tur: 'proje-niyet', no: 1 }, 'ret niyeti boşaltmıştı: yine niyetle başlar');
    assert.deepEqual(await projeTuru(vt(), o), { tur: 'proje', no: 1, sonuc: 'gonderildi' });
  });

  test('LP-5 cevap kaybolursa yeni proje açılmaz: bekleme sonrası "var mı" kaydı bulur', async () => {
    kopru.senaryo = 'cevap-kayboldu';
    projeler = [projeler[0]!];
    const o = ortami();
    await projeTuru(vt(), o);
    assert.deepEqual(await projeTuru(vt(), o), { tur: 'proje', no: 1, sonuc: 'belirsiz' });
    kopru.senaryo = 'basari';
    assert.deepEqual(await projeTuru(vt(), o), { tur: 'bos' }, 'bekleme dolmadan gitmez');
    simdi += BELIRSIZ_BEKLEME_MS + 1000;
    assert.deepEqual(await projeTuru(vt(), o), { tur: 'proje', no: 1, sonuc: 'zaten-vardi' });
    assert.equal(kopru.projeAcilan.get('ORN.PRJ1'), 1, 'tek açma');
  });

  test('LP-7 proje kartının Logo satırı ve belgenin projesi: sırada, Logo\'da, durdu, gönderilmez; oturumsuz okunamaz', async () => {
    const id = (await vt().tek<{ id: number }>(
      `INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('ORN.LP7', 'Deneme proje', (SELECT id FROM kisi WHERE kullanici_adi = 'lp-yonetici')) RETURNING id`))!.id;
    const oku = async () => {
      const c = await app.inject({ method: 'GET', url: `/api/logo/projeler/${id}`, headers: { cookie: cerez } });
      assert.equal(c.statusCode, 200, c.body);
      return c.json() as { durum: string; logoKodu: string | null; metin: string | null };
    };
    assert.deepEqual(await oku(), { durum: 'sirada', logoKodu: null, metin: PROJE_SIRADA });
    assert.deepEqual(await vt().tx((db) => belgeProjesi(db, id)), { bekliyor: 'ORN.LP7' });
    await vt().sorgu(`INSERT INTO logo_giden (belge_turu, belge_no, deneme_sayisi, son_deneme, son_sonuc, son_hata) VALUES ('proje', $1, 1, now(), 'reddedildi', 'Logo reddetti: Deneme.')`, [id]);
    const d = await oku();
    assert.equal(d.durum, 'durdu');
    assert.match(d.metin ?? '', /^Logo reddetti: Deneme\. Proje kartını düzeltip kaydedin; yeniden gider\.$/);
    await vt().sorgu(`UPDATE logo_giden SET son_sonuc = 'gonderildi', son_hata = NULL, logo_kayit_no = '9001' WHERE belge_turu = 'proje' AND belge_no = $1`, [id]);
    assert.deepEqual(await oku(), { durum: 'logoda', logoKodu: 'ORN.LP7', metin: null });
    assert.deepEqual(await vt().tx((db) => belgeProjesi(db, id)), { kod: 'ORN.LP7' });
    await vt().sorgu(`UPDATE logo_giden SET son_sonuc = 'zaten-vardi' WHERE belge_turu = 'proje' AND belge_no = $1`, [id]);
    assert.deepEqual(await oku(), { durum: 'logoda', logoKodu: 'ORN.LP7', metin: null }, 'bağlanan proje de Logo\'da');
    assert.deepEqual(await vt().tx((db) => belgeProjesi(db, id)), { kod: 'ORN.LP7' });
    await ayar('logo.proje-gonderimi', false);
    assert.deepEqual(await vt().tx((db) => belgeProjesi(db, id)), { kod: null }, '3315 a: kapalıyken projesiz');
    await vt().sorgu(`DELETE FROM logo_giden WHERE belge_turu = 'proje' AND belge_no = $1`, [id]);
    assert.deepEqual(await oku(), { durum: 'gonderilmez', logoKodu: null, metin: PROJE_GONDERILMEZ });
    assert.equal((await app.inject({ method: 'GET', url: '/api/logo/projeler/999999', headers: { cookie: cerez } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'GET', url: `/api/logo/projeler/${id}` })).statusCode, 401);
  });

  test('LP-6 kuralı tutmayan proje istek atılmadan durur', async () => {
    projeler = [{ id: 3, kod: 'P'.repeat(PROJE_KODU_EN_COK + 1), ad: 'Deneme' }];
    assert.deepEqual(await projeTuru(vt(), ortami()), { tur: 'proje', no: 3, sonuc: 'reddedildi' });
    assert.equal(kopru.istekler.length, 0);
  });

  test('LP-8 (Test T1) Logo\'ya giden proje sonraki turlarda istek almaz, süre geçse de yeniden açılmaz', async () => {
    projeler = [projeler[0]!];
    const o = ortami();
    await projeTuru(vt(), o);
    assert.deepEqual(await projeTuru(vt(), o), { tur: 'proje', no: 1, sonuc: 'gonderildi' });
    const istek = kopru.istekler.length;
    for (let i = 0; i < 3; i++) {
      simdi += 24 * 3600_000;
      assert.deepEqual(await projeTuru(vt(), ortami()), { tur: 'bos' });
    }
    assert.equal(kopru.istekler.length, istek, 'istek yok');
    assert.equal((await giden(1))?.niyet, null, 'yeniden niyet yazılmaz');
  });

  test('LP-9 (Test T3, T9) aktif olmayan proje: Logo satırı "gönderilmez", belgesi projesiz gider; proje kartı kaydedilince duran proje olayla yeniden sıraya girer', async () => {
    const id = (await vt().tek<{ id: number }>(
      `INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('ORN.LP9', 'Deneme proje', (SELECT id FROM kisi WHERE kullanici_adi = 'lp-yonetici')) RETURNING id`))!.id;
    const oku = async () => (await app.inject({ method: 'GET', url: `/api/logo/projeler/${id}`, headers: { cookie: cerez } })).json() as { durum: string; metin: string | null };
    await vt().sorgu(`INSERT INTO logo_giden (belge_turu, belge_no, deneme_sayisi, son_deneme, son_sonuc, son_hata) VALUES ('proje', $1, 1, now(), 'reddedildi', 'Logo reddetti: Deneme.')`, [id]);
    assert.equal((await oku()).durum, 'durdu');
    // Proje kartı kaydedilir (projeler modülünün olayı, kablolamadan): ret yeniden sıraya girer.
    const p = (await app.inject({ method: 'GET', url: `/api/projeler/${id}`, headers: { cookie: cerez } })).json() as { surum: number };
    const kaydet = async (durum: string, surum: number) => app.inject({
      method: 'POST', url: `/api/projeler/${id}/guncelle`, headers: { cookie: cerez, 'istek-kimligi': randomUUID() },
      payload: { ad: 'Deneme proje', firmaId: null, baslangic: null, bitis: null, aciklama: null, durum, surum },
    });
    const c = await kaydet('aktif', p.surum);
    assert.equal(c.statusCode, 200, c.body);
    assert.notEqual((await giden(id))?.sonraki, null, 'olayla yeniden sıraya girdi');
    assert.notEqual((await oku()).durum, 'durdu');
    // Aktif olmayan ve Logo'da olmayan proje: belge projesiz gider, kartta "gönderilmez".
    await vt().sorgu(`DELETE FROM logo_giden WHERE belge_turu = 'proje' AND belge_no = $1`, [id]);
    const c2 = await kaydet('tamamlandi', (c.json() as { surum: number }).surum);
    assert.equal(c2.statusCode, 200, c2.body);
    assert.deepEqual(await oku(), { durum: 'gonderilmez', logoKodu: null, metin: PROJE_AKTIF_DEGIL });
    assert.deepEqual(await vt().tx((db) => belgeProjesi(db, id)), { kod: null });
  });

  test('LP-10 (Test T6) Logo satırını proje gören okur; ayar yetkisi gerekmez, proje göremeyen 403', async () => {
    const id = (await vt().tek<{ id: number }>(
      `INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('ORN.LP10', 'Deneme proje', (SELECT id FROM kisi WHERE kullanici_adi = 'lp-yonetici')) RETURNING id`))!.id;
    const girisli = async (ad: string, islemler: string[]): Promise<string> => {
      const kisiId = await vt().tx((db) => yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA }));
      await vt().sorgu('INSERT INTO rol (kod, ad) VALUES ($1, $1) ON CONFLICT DO NOTHING', [ad.replace(/-/g, '_')]);
      for (const i of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) SELECT id, $2 FROM rol WHERE kod = $1 ON CONFLICT DO NOTHING', [ad.replace(/-/g, '_'), i]);
      await vt().sorgu('UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = $1) WHERE kisi_id = $2', [ad.replace(/-/g, '_'), kisiId]);
      const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
      return String(g.headers['set-cookie']).split(';')[0] ?? '';
    };
    const gor = (c: string) => app.inject({ method: 'GET', url: `/api/logo/projeler/${id}`, headers: { cookie: c } });
    assert.equal((await gor(await girisli('lp-goren', ['sayfa.projeler']))).statusCode, 200);
    assert.equal((await gor(await girisli('lp-okur', ['projeler.oku']))).statusCode, 200);
    assert.equal((await gor(await girisli('lp-baska', ['sayfa.malzemeler']))).statusCode, 403);
  });

  test('LP-11 (Test T8) proje uçları olmayan eski yardımcı: deneme sayılmaz, "kurulum bekliyor" döner', async () => {
    kopru.projeUcuYok = true;
    const o = ortami();
    await projeTuru(vt(), o);
    const r = await projeTuru(vt(), o);
    assert.deepEqual(r, { tur: 'proje-kurulum-bekliyor', ileti: ESKI_YARDIMCI_ILETISI });
    assert.equal((await giden(1))?.sonuc, null, 'deneme yazılmadı');
  });
});
