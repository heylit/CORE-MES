import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import {
  geriBildirimAyrintiCevabi, geriBildirimListeCevabi, geriBildirimOzetiCevabi, geriBildirimSecenekleriCevabi, profilCevabi,
} from '#paylasilan/sozlesme/profil.ts';
import type { GeriBildirimAyrintiCevabi, GeriBildirimSecenekleriCevabi } from '#paylasilan/sozlesme/profil.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

// Geri Bildirim Merkezi (kart 2192): her yazma için izinli ve reddedilen rol, sürüm ve kural denetimi.
describe('Geri Bildirim Merkezi (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };

  async function istek<T = unknown>(ad: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = ad === null ? {} : { cookie: cerezler.get(ad) ?? '' };
    if (yontem === 'POST') basliklar[ISTEK_KIMLIGI_BASLIGI] = randomUUID();
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

  async function gonder(ad: string, govde: { konu: string; tur: string; metin: string }): Promise<number> {
    const c = await istek<{ id: number }>(ad, 'POST', '/profil/geri-bildirim-gonder', govde);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.id;
  }

  async function ayrinti(ad: string, id: number): Promise<GeriBildirimAyrintiCevabi> {
    const c = await istek<unknown>(ad, 'GET', `/profil/geri-bildirimler/${id}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return geriBildirimAyrintiCevabi.parse(c.govde);
  }

  async function secenekler(ad: string): Promise<GeriBildirimSecenekleriCevabi> {
    const c = await istek<unknown>(ad, 'GET', '/profil/geri-bildirim-secenekleri');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return geriBildirimSecenekleriCevabi.parse(c.govde);
  }

  const takip = (ad: string, id: number, govde: Record<string, unknown>) => istek<unknown>(ad, 'POST', `/profil/geri-bildirimler/${id}/takip-degistir`, govde);
  const bos = { durum: 'inceleniyor', kategoriId: null, sorumluKisiId: null, anaKayitId: null };

  before(async () => {
    ortam = await testVeritabaniKur('gbmerkez');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await giris('yonetici');
    await kisiEkle('operator', 'operator');
    await kisiEkle('insan', 'insan_kaynaklari');
    await kisiEkle('mudur', 'mudur');
    await kisiEkle('genmudur', 'genel_mudur');
    await kisiEkle('cam', 'cam');
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('okuma ve yazma uçları yetki ister: operatör ve CAM 403, oturumsuz 401; İK, müdür, GM ve yönetici okur', async () => {
    const id = await gonder('operator', { konu: 'sirket', tur: 'sikayet', metin: 'Yetki denemesi kaydı.' });
    const yollar: [string, 'GET' | 'POST', unknown?][] = [
      ['/profil/geri-bildirimler', 'GET'],
      [`/profil/geri-bildirimler/${id}`, 'GET'],
      ['/profil/geri-bildirim-secenekleri', 'GET'],
      ['/profil/geri-bildirim-ozeti', 'GET'],
      [`/profil/geri-bildirimler/${id}/yanitla`, 'POST', { metin: 'Yanıt', surum: 0 }],
      [`/profil/geri-bildirimler/${id}/not-ekle`, 'POST', { metin: 'Not' }],
      [`/profil/geri-bildirimler/${id}/takip-degistir`, 'POST', { ...bos, surum: 0 }],
      ['/profil/geri-bildirim-kategorileri', 'POST', { ad: 'Yetkisiz', konu: null }],
      ['/profil/geri-bildirim-kategorileri/1/guncelle', 'POST', { ad: 'Yetkisiz', konu: null, etkin: true, surum: 1 }],
    ];
    for (const [yol, yontem, govde] of yollar) {
      assert.equal((await istek(null, yontem, yol, govde)).durum, 401, yol);
      for (const ad of ['operator', 'cam']) assert.equal((await istek(ad, yontem, yol, govde)).durum, 403, `${ad} ${yol}`);
    }
    for (const ad of ['insan', 'mudur', 'genmudur', 'yonetici']) {
      assert.equal((await istek(ad, 'GET', `/profil/geri-bildirimler/${id}`)).durum, 200, ad);
      assert.equal((await istek(ad, 'GET', '/profil/geri-bildirim-ozeti')).durum, 200, ad);
    }
  });

  test('GBM-2/3: yanıt rol adıyla imzalanır, kaydı yanıtlandıya taşır; çalışan yanıtı görür, iç notu ve yanıtlayanın adını görmez', async () => {
    const id = await gonder('operator', { konu: 'sirket', tur: 'istek', metin: 'Gece servisi geç kalıyor.' });
    assert.equal((await ayrinti('insan', id)).kayit.durum, 'yeni');
    const yanit = await istek<unknown>('insan', 'POST', `/profil/geri-bildirimler/${id}/yanitla`, { metin: '  Servis saati öne alındı.  ', surum: 0 });
    assert.equal(yanit.durum, 200, JSON.stringify(yanit.govde));
    const a = geriBildirimAyrintiCevabi.parse(yanit.govde);
    assert.equal(a.kayit.durum, 'yanitlandi');
    assert.equal(a.surum, 1);
    assert.deepEqual(a.hareketler.map((h) => [h.tur, h.metin, h.imza, h.durum, h.kisiAdi]), [
      ['yanit', 'Servis saati öne alındı.', 'İnsan Kaynakları', null, 'Deneme insan'],
      ['durum', null, null, 'yanitlandi', 'Deneme insan'],
    ]);
    assert.equal((await istek('mudur', 'POST', `/profil/geri-bildirimler/${id}/not-ekle`, { metin: 'Servis firmasıyla görüşülecek.' })).durum, 200);

    const p = profilCevabi.parse((await istek<unknown>('operator', 'GET', '/profil')).govde);
    const kendi = p.geriBildirimler.find((g) => g.id === id);
    assert.equal(kendi?.durum, 'yanitlandi');
    assert.deepEqual(kendi?.yanitlar.map((y) => [y.metin, y.imza]), [['Servis saati öne alındı.', 'İnsan Kaynakları']]);
    assert.equal(JSON.stringify(kendi).includes('Deneme insan'), false);
    assert.equal(JSON.stringify(kendi).includes('Servis firmasıyla'), false);
  });

  test('sürüm: ilk yazım 0 ile, sonraki okunan sürümle; eski sürüm ve ikinci ilk yazım 409', async () => {
    const id = await gonder('operator', { konu: 'uygulama', tur: 'oneri', metin: 'Terminalde koyu tema olsun.' });
    assert.equal((await takip('mudur', id, { ...bos, surum: 0 })).durum, 200);
    assert.equal((await takip('mudur', id, { ...bos, durum: 'cozuldu', surum: 0 })).durum, 409);
    assert.equal((await istek('insan', 'POST', `/profil/geri-bildirimler/${id}/yanitla`, { metin: 'Eski sürüm', surum: 0 })).durum, 409);
    assert.equal((await takip('mudur', id, { ...bos, durum: 'cozuldu', surum: 1 })).durum, 200);
    // Çözülmüş kayda ek yanıt durumu değiştirmez.
    const ek = geriBildirimAyrintiCevabi.parse((await istek<unknown>('insan', 'POST', `/profil/geri-bildirimler/${id}/yanitla`, { metin: 'Ek bilgi.', surum: 2 })).govde);
    assert.equal(ek.kayit.durum, 'cozuldu');
    assert.equal(ek.hareketler.filter((h) => h.tur === 'durum').length, 2);
  });

  test('gövde katıdır: fazla alan, başka kişi, geçersiz durum ve kısa yanıt 400; olmayan kayıt 404', async () => {
    const id = await gonder('operator', { konu: 'sirket', tur: 'oneri', metin: 'Gövde denemesi.' });
    assert.equal((await istek('insan', 'POST', `/profil/geri-bildirimler/${id}/yanitla`, { metin: 'Tamam', surum: 0, kisiId: kisiler.get('mudur') })).durum, 400);
    assert.equal((await istek('insan', 'POST', `/profil/geri-bildirimler/${id}/yanitla`, { metin: 'x', surum: 0 })).durum, 400);
    assert.equal((await istek('insan', 'POST', `/profil/geri-bildirimler/${id}/yanitla`, { metin: 'x'.repeat(2001), surum: 0 })).durum, 400);
    assert.equal((await takip('insan', id, { ...bos, durum: 'silindi', surum: 0 })).durum, 400);
    assert.equal((await istek('insan', 'GET', '/profil/geri-bildirimler/999999')).durum, 404);
    assert.equal((await istek('insan', 'POST', '/profil/geri-bildirimler/999999/yanitla', { metin: 'Yok', surum: 0 })).durum, 404);
    assert.equal((await istek('insan', 'POST', '/profil/geri-bildirimler/999999/not-ekle', { metin: 'Yok' })).durum, 404);
  });

  test('GBM-5 ve sorumlu: pasif kategori ve yetkisiz sorumlu reddedilir; yanıtlama işlemi olan kişi sorumlu olur', async () => {
    const id = await gonder('operator', { konu: 'sirket', tur: 'sikayet', metin: 'Aspiratör zayıf çekiyor.' });
    const s = await secenekler('insan');
    assert.ok(s.kategoriler.length >= 7);
    assert.ok(s.sorumlular.some((k) => k.id === kisiler.get('mudur')));
    assert.equal(s.sorumlular.some((k) => k.id === kisiler.get('operator')), false);
    const guvenlik = s.kategoriler.find((k) => k.ad === 'İş güvenliği');
    assert.ok(guvenlik);

    assert.equal((await takip('insan', id, { ...bos, sorumluKisiId: kisiler.get('operator'), surum: 0 })).durum, 400);
    assert.equal((await takip('insan', id, { ...bos, kategoriId: 999999, surum: 0 })).durum, 400);
    const c = await takip('insan', id, { ...bos, kategoriId: guvenlik.id, sorumluKisiId: kisiler.get('mudur'), surum: 0 });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const a = geriBildirimAyrintiCevabi.parse(c.govde);
    assert.equal(a.kayit.kategoriAdi, 'İş güvenliği');
    assert.equal(a.sorumluAdi, 'Deneme mudur');

    // Pasife alınan kategori kayıtta kalır, yeni kayda seçilmez.
    const yeni = await istek<unknown>('mudur', 'POST', '/profil/geri-bildirim-kategorileri', { ad: 'Geçici kategori', konu: 'sirket' });
    assert.equal(yeni.durum, 200, JSON.stringify(yeni.govde));
    const gecici = geriBildirimSecenekleriCevabi.parse(yeni.govde).kategoriler.find((k) => k.ad === 'Geçici kategori');
    assert.ok(gecici);
    assert.equal((await takip('insan', id, { ...bos, kategoriId: gecici.id, surum: 1 })).durum, 200);
    assert.equal((await istek('mudur', 'POST', `/profil/geri-bildirim-kategorileri/${gecici.id}/guncelle`, { ad: 'Geçici kategori', konu: 'sirket', etkin: false, surum: gecici.surum })).durum, 200);
    assert.equal((await takip('insan', id, { ...bos, durum: 'yanitlandi', kategoriId: gecici.id, surum: 2 })).durum, 200);
    const baska = await gonder('operator', { konu: 'sirket', tur: 'istek', metin: 'Pasif kategori denemesi.' });
    assert.equal((await takip('insan', baska, { ...bos, kategoriId: gecici.id, surum: 0 })).durum, 400);
  });

  test('GBM-4: toplama tek kademe; kendine, bağlı kayda ve bağlıları olan kayıttan bağlama 400', async () => {
    const ana = await gonder('operator', { konu: 'uygulama', tur: 'sikayet', metin: 'Etiket iki kez basılıyor.' });
    const kopya = await gonder('cam', { konu: 'uygulama', tur: 'sikayet', metin: 'Mal kabulde çift etiket.' });
    const ucuncu = await gonder('cam', { konu: 'uygulama', tur: 'sikayet', metin: 'Etiket yazıcısı tekrar basıyor.' });
    assert.equal((await takip('insan', ana, { ...bos, anaKayitId: ana, surum: 0 })).durum, 400);
    assert.equal((await takip('insan', kopya, { ...bos, anaKayitId: ana, surum: 0 })).durum, 200);
    assert.equal((await takip('insan', ucuncu, { ...bos, anaKayitId: kopya, surum: 0 })).durum, 400);
    assert.equal((await takip('insan', ana, { ...bos, anaKayitId: ucuncu, surum: 0 })).durum, 400);
    assert.equal((await takip('insan', ana, { ...bos, anaKayitId: 999999, surum: 0 })).durum, 400);
    assert.deepEqual((await ayrinti('insan', ana)).baglilar.map((b) => b.id), [kopya]);
  });

  test('liste süzgeci: durum, kategori (0 kategorisiz) ve aramada joker karakter metin sayılır', async () => {
    const yuzde = await gonder('operator', { konu: 'sirket', tur: 'oneri', metin: 'Fire %50 azalsın diye öneri.' });
    await gonder('operator', { konu: 'sirket', tur: 'oneri', metin: 'Fire 50 adet azalsın.' });
    const ara = geriBildirimListeCevabi.parse((await istek<unknown>('insan', 'GET', `/profil/geri-bildirimler?ara=${encodeURIComponent('%50')}`)).govde);
    assert.deepEqual(ara.satirlar.map((s) => s.id), [yuzde]);
    const yeni = geriBildirimListeCevabi.parse((await istek<unknown>('insan', 'GET', '/profil/geri-bildirimler?durum=yeni&sayfaBoyu=200')).govde);
    assert.ok(yeni.satirlar.some((s) => s.id === yuzde));
    assert.ok(yeni.satirlar.every((s) => s.durum === 'yeni'));
    const kategorisiz = geriBildirimListeCevabi.parse((await istek<unknown>('insan', 'GET', '/profil/geri-bildirimler?kategoriId=0&sayfaBoyu=200')).govde);
    assert.ok(kategorisiz.satirlar.every((s) => s.kategoriId === null));
    assert.equal((await istek('insan', 'GET', `/profil/geri-bildirimler?ara=${'x'.repeat(101)}`)).durum, 400);
  });

  test('kategori: aynı ad (harf farkıyla) 400, eski sürüm 409, olmayan 404', async () => {
    assert.equal((await istek('insan', 'POST', '/profil/geri-bildirim-kategorileri', { ad: 'Diğer', konu: null })).durum, 400);
    assert.equal((await istek('insan', 'POST', '/profil/geri-bildirim-kategorileri', { ad: 'diğer', konu: 'sirket' })).durum, 400);
    const k = (await secenekler('insan')).kategoriler.find((x) => x.ad === 'Diğer');
    assert.ok(k);
    assert.equal((await istek('insan', 'POST', `/profil/geri-bildirim-kategorileri/${k.id}/guncelle`, { ad: 'Diğer konular', konu: null, etkin: true, surum: k.surum })).durum, 200);
    assert.equal((await istek('insan', 'POST', `/profil/geri-bildirim-kategorileri/${k.id}/guncelle`, { ad: 'Diğer', konu: null, etkin: true, surum: k.surum })).durum, 409);
    assert.equal((await istek('insan', 'POST', '/profil/geri-bildirim-kategorileri/999999/guncelle', { ad: 'Yok', konu: null, etkin: true, surum: 1 })).durum, 404);
  });

  test('özet: durum sayıları bütün kayıtlarla tutar; son altı ay listelenir', async () => {
    const c = await istek<unknown>('mudur', 'GET', '/profil/geri-bildirim-ozeti');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const ozet = geriBildirimOzetiCevabi.parse(c.govde);
    const toplam = await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM profil_geri_bildirim');
    assert.equal(Object.values(ozet.durumlar).reduce((a, b) => a + b, 0), toplam?.n);
    assert.equal(ozet.aylar.length, 6);
    const buAy = ozet.aylar[5];
    assert.equal(buAy?.gelen, toplam?.n);
    assert.equal(typeof buAy?.ilkYanitOrtancaSaat, 'number');
  });

  test('hareketler yalnız eklenir; takip kayıtsız açılmaz', async () => {
    const id = await gonder('operator', { konu: 'sirket', tur: 'oneri', metin: 'Hareket değişmez.' });
    await istek('insan', 'POST', `/profil/geri-bildirimler/${id}/not-ekle`, { metin: 'Değişmeyecek not.' });
    await assert.rejects(o().sahip.sorgu("UPDATE profil_geri_bildirim_hareket SET metin = 'başka' WHERE geri_bildirim_id = $1", [id]), /yalnız ekleme/);
    await assert.rejects(o().sahip.sorgu('DELETE FROM profil_geri_bildirim_hareket WHERE geri_bildirim_id = $1', [id]), /yalnız ekleme/);
    await assert.rejects(o().sahip.sorgu("INSERT INTO profil_geri_bildirim_takip (geri_bildirim_id, durum) VALUES (999999, 'yeni')"), /profil_geri_bildirim_takip_kayit/);
  });
});
