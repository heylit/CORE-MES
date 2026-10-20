import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { bildirimListeCevabi, bildirimSayacCevabi, bildirimTercihleriCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import type { Bildirim, BildirimListeCevabi, BildirimTercihleriCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { bildirimGonder, type BildirimOlayi } from './disari.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('bildirim merkezi (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kim = (ad: string): number => {
    const id = kisiler.get(ad);
    if (id === undefined) throw new Error(`kişi yok: ${ad}`);
    return id;
  };

  async function istek<T = unknown>(ad: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = ad === null ? {} : { cookie: cerezler.get(ad) ?? '' };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }

  async function giris(kullaniciAdi: string): Promise<void> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerezler.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }

  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const id = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return yeni;
    });
    kisiler.set(kullaniciAdi, id);
    await giris(kullaniciAdi);
  }

  const gonder = (olay: BildirimOlayi): Promise<number> => o().vt.tx((db) => bildirimGonder(db, olay));
  async function liste(ad: string, durum = 'gelen'): Promise<BildirimListeCevabi> {
    const c = await istek(ad, 'GET', `/bildirimler?durum=${durum}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return bildirimListeCevabi.parse(c.govde);
  }
  async function sayac(ad: string): Promise<{ okunmamis: number; acilVar: boolean }> {
    const c = await istek(ad, 'GET', '/bildirimler/sayac');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return bildirimSayacCevabi.parse(c.govde);
  }
  async function tercihler(ad: string): Promise<BildirimTercihleriCevabi> {
    const c = await istek(ad, 'GET', '/bildirimler/tercihler');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return bildirimTercihleriCevabi.parse(c.govde);
  }
  const bosalt = (): Promise<unknown> => o().vt.tx((db) => db.sorgu('DELETE FROM bildirim_kaydi'));

  before(async () => {
    ortam = await testVeritabaniKur('bildirim');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    kisiler.set('yonetici', yoneticiId);
    await giris('yonetici');
    await kisiEkle('bakim', 'bakim');
    await kisiEkle('operator', 'operator');
    await kisiEkle('cam', 'cam');
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('her uç oturum ister', async () => {
    for (const [yontem, yol] of [
      ['GET', '/bildirimler'], ['GET', '/bildirimler/sayac'], ['POST', '/bildirimler/1/okundu'], ['POST', '/bildirimler/tumunu-okundu'],
      ['POST', '/bildirimler/1/arsivle'], ['GET', '/bildirimler/tercihler'],
    ] as const) {
      assert.equal((await istek(null, yontem, yol)).durum, 401, yol);
    }
    assert.equal((await istek(null, 'POST', '/bildirimler/tercihler/degistir', { tur: 'ik.izin-onay-bekliyor', mesaj: true, eposta: true })).durum, 401);
  });

  test('olay işlem sahiplerine gider: bakım ve yönetici makine durdu alır, operatör ve CAM almaz', async () => {
    await bosalt();
    const sayi = await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Makine durdu: Tezgah 4', metin: 'Arıza', yol: '/istasyonlar' });
    assert.equal(sayi, 2);
    const b = await liste('bakim');
    assert.equal(b.satirlar.length, 1);
    assert.equal(b.satirlar[0]?.onem, 'acil');
    assert.equal(b.satirlar[0]?.kaynakModul, 'istasyonlar');
    assert.equal(b.satirlar[0]?.okundu, null);
    assert.deepEqual(await sayac('bakim'), { okunmamis: 1, acilVar: true });
    assert.equal((await liste('yonetici')).satirlar.length, 1);
    assert.equal((await liste('operator')).satirlar.length, 0);
    assert.deepEqual(await sayac('cam'), { okunmamis: 0, acilVar: false });
  });

  test('adıyla verilen kişi de alır; tetikleyen kişi almaz', async () => {
    await bosalt();
    await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Durdu', kisiler: [kim('operator')], haric: kim('bakim') });
    assert.equal((await liste('operator')).satirlar.length, 1);
    assert.equal((await liste('bakim')).satirlar.length, 0);
  });

  test('başkasının bildirimi görünmez, okundu ve arşiv işaretlenemez (404)', async () => {
    await bosalt();
    await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Yalnız bakıma', kisiler: [], haric: yoneticiId });
    const bakimin = (await liste('bakim')).satirlar[0];
    assert.ok(bakimin);
    assert.equal((await liste('cam')).satirlar.length, 0);
    assert.equal((await istek('cam', 'POST', `/bildirimler/${bakimin.id}/okundu`)).durum, 404);
    assert.equal((await istek('cam', 'POST', `/bildirimler/${bakimin.id}/arsivle`)).durum, 404);
    assert.equal((await istek('cam', 'POST', '/bildirimler/tumunu-okundu')).durum, 200);
    const sonra = (await liste('bakim')).satirlar[0];
    assert.equal(sonra?.okundu, null);
    assert.equal(sonra?.arsivlendi, null);
  });

  test('okundu, tümünü okundu ve arşiv yalnız kendi satırında; arşivdeki gelenlerde görünmez', async () => {
    await bosalt();
    await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Bir' });
    await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'İki' });
    await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Üç' });
    const [ilk, ikinci] = (await liste('bakim')).satirlar;
    assert.ok(ilk && ikinci);
    const okunan = await istek<Bildirim>('bakim', 'POST', `/bildirimler/${ilk.id}/okundu`);
    assert.equal(okunan.durum, 200);
    assert.notEqual(okunan.govde.okundu, null);
    assert.equal((await sayac('bakim')).okunmamis, 2);
    assert.equal((await liste('bakim', 'okunmamis')).satirlar.length, 2);

    const arsiv = await istek<Bildirim>('bakim', 'POST', `/bildirimler/${ikinci.id}/arsivle`);
    assert.equal(arsiv.durum, 200);
    assert.notEqual(arsiv.govde.arsivlendi, null);
    assert.notEqual(arsiv.govde.okundu, null);
    assert.deepEqual((await liste('bakim', 'arsiv')).satirlar.map((b) => b.id), [ikinci.id]);
    assert.equal((await liste('bakim')).satirlar.length, 2);

    const tumu = await istek<{ isaretlenen: number }>('bakim', 'POST', '/bildirimler/tumunu-okundu');
    assert.deepEqual(tumu.govde, { isaretlenen: 1 });
    assert.equal((await sayac('bakim')).okunmamis, 0);
    // Yöneticinin aynı olaydan gelen satırları bakımın işaretinden etkilenmez.
    assert.equal((await sayac('yonetici')).okunmamis, 3);
  });

  test('aynı kaynak okunmamışken yeni satır açmaz, sayaç artar; okununca yenisi açılır', async () => {
    await bosalt();
    await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Durdu', kaynakKimlik: '4' });
    await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Yine durdu', kaynakKimlik: '4' });
    const [tek] = (await liste('bakim')).satirlar;
    assert.equal((await liste('bakim')).satirlar.length, 1);
    assert.equal(tek?.tekrarSayisi, 2);
    assert.equal(tek?.baslik, 'Yine durdu');
    await istek('bakim', 'POST', `/bildirimler/${tek?.id ?? 0}/okundu`);
    await gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'Üçüncü', kaynakKimlik: '4' });
    assert.equal((await liste('bakim')).satirlar.length, 2);
    assert.equal((await sayac('bakim')).okunmamis, 1);
  });

  test('geçersiz yol ve boş başlık olayı yazmaz', async () => {
    await assert.rejects(gonder({ tur: 'istasyonlar.makine-durdu', baslik: 'x', yol: '//dis-site' as `/${string}` }));
    await assert.rejects(gonder({ tur: 'istasyonlar.makine-durdu', baslik: '   ' }));
  });

  test('tercihler: yalnız alabileceği olaylar; seçim saklanır ve varsayılanın yerine geçer', async () => {
    const t = await tercihler('bakim');
    assert.deepEqual(t.kanallar, { mesaj: false, eposta: false });
    assert.equal(t.epostaSecilebilir, true);
    assert.deepEqual(t.satirlar.map((s) => s.tur), ['istasyonlar.makine-durdu', 'cnc-kurulum.takim-omru']);
    assert.equal(t.satirlar[0]?.varsayilan, true);
    assert.deepEqual((await tercihler('cam')).satirlar.map((s) => s.tur), ['cnc-kurulum.takim-omru']);
    assert.equal((await tercihler('yonetici')).satirlar.length, 6);

    const d = await istek<BildirimTercihleriCevabi>('bakim', 'POST', '/bildirimler/tercihler/degistir', { tur: 'istasyonlar.makine-durdu', mesaj: true, eposta: true });
    assert.equal(d.durum, 200, JSON.stringify(d.govde));
    assert.deepEqual(
      d.govde.satirlar.map((s) => [s.mesaj, s.eposta, s.varsayilan]),
      [[true, true, false], [false, false, true]],
    );
    assert.equal((await tercihler('yonetici')).satirlar.find((s) => s.tur === 'istasyonlar.makine-durdu')?.varsayilan, true);
  });

  test('operatör e-posta seçemez: alan null, gönderilen değer kapalı saklanır', async () => {
    const t = await tercihler('operator');
    assert.equal(t.epostaSecilebilir, false);
    const d = await istek('operator', 'POST', '/bildirimler/tercihler/degistir', { tur: 'istasyonlar.makine-durdu', mesaj: false, eposta: true });
    assert.equal(d.durum, 200);
    const satir = await o().vt.tek<{ eposta: boolean }>('SELECT eposta FROM bildirim_tercihi WHERE kisi_id = $1', [kim('operator')]);
    assert.equal(satir?.eposta, false);
  });

  test('bilinmeyen olay türü ve fazla alan reddedilir', async () => {
    assert.equal((await istek('bakim', 'POST', '/bildirimler/tercihler/degistir', { tur: 'yok.olay', mesaj: true, eposta: true })).durum, 400);
    assert.equal((await istek('bakim', 'POST', '/bildirimler/tercihler/degistir', { tur: 'ik.izin-onay-bekliyor', mesaj: true, eposta: true, kisiId: 1 })).durum, 400);
  });
});
