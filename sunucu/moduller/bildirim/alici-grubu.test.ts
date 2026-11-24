import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { bildirimAlicilariCevabi } from '#paylasilan/sozlesme/bildirim.ts';
import { bildirimKuralSablonlariCevabi, bildirimKurallariCevabi, type BildirimKuralEkleGovdesi } from '#paylasilan/sozlesme/bildirim-kural.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { bildirimGonder, type BildirimOlayi } from './disari.ts';
import { butunOlaylariVeEskiKademeleriAc } from './olay-anahtari.ts';

// 3639: kayda bağlı olayda (Sipariş onaylandı) alıcı grubu. Kayıttaki kişi siparişi açan (mudur); 3597 ek alıcısı ve grup yan yana
// durur, kişi ikisindeyse grup metni kazanır. Grubun alıcısı yalnız siparişi görebilen kişidir (bakim göremez, düşer).
const PAROLA = 'dogru-parola-1';
const TUR = 'siparisler.siparis-onaylandi';

describe('3639 alıcı grubu (kayda bağlı olay, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();
  let sira = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kim = (ad: string): number => {
    const id = kisiler.get(ad);
    if (id === undefined) throw new Error(`kişi yok: ${ad}`);
    return id;
  };
  async function istek(ad: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<{ durum: number; govde: unknown; metin: string }> {
    const r = await app.inject({ method: yontem, url: `/api${yol}`, headers: ad === null ? {} : { cookie: cerezler.get(ad) ?? '' }, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: r.statusCode, govde: (r.body ? r.json() : undefined) as unknown, metin: r.body };
  }
  async function kisiEkle(kullaniciAdi: string, rolKodu: string): Promise<void> {
    const rol = (await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]))?.id ?? 0;
    const yoneticiRolu = (await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))?.id ?? 0;
    const id = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu);
      return yeni;
    });
    kisiler.set(kullaniciAdi, id);
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(g.statusCode, 200, g.body);
    cerezler.set(kullaniciAdi, String(g.headers['set-cookie']).split(';')[0] ?? '');
  }
  const gonder = (olay: Partial<BildirimOlayi> = {}): Promise<number> => {
    sira += 1;
    return o().vt.tx((db) => bildirimGonder(db, {
      tur: TUR, baslik: 'Onaylanan sipariş: ORN-1', yol: '/siparisler/1', kaynakKimlik: `s-${String(sira)}`, kisiler: [kim('mudur')], ...olay,
    }));
  };
  const satirlar = (kisiId: number) => o().vt.sorgu<{ baslik: string; metin: string | null }>('SELECT baslik, metin FROM bildirim_kaydi WHERE kisi_id = $1 AND tur = $2', [kisiId, TUR]);
  const bosalt = async (): Promise<void> => { await o().sahip.sorgu('DELETE FROM bildirim_kaydi'); await o().sahip.sorgu('DELETE FROM bildirim_eposta_kuyrugu'); };
  const govde = (ek: Partial<BildirimKuralEkleGovdesi> = {}): BildirimKuralEkleGovdesi => ({
    tur: TUR, ad: 'Satış yönetimi', acik: true, kosullar: [], rolIdleri: [], kisiIdleri: [kim('yonetici'), kim('bakim')], ortada: false, eposta: false, telefon: false,
    sablonBaslik: 'Sipariş onaylandı', sablonMetin: 'Planlama için ayrıntı uygulamada: {olay}', epostaSablonId: null, ...ek,
  });
  async function grupEkle(ek: Partial<BildirimKuralEkleGovdesi> = {}): Promise<number> {
    const r = await istek('yonetici', 'POST', '/bildirimler/kurallar/ekle', govde(ek));
    assert.equal(r.durum, 200, r.metin);
    const k = bildirimKurallariCevabi.parse(r.govde).kurallar.at(-1);
    assert.ok(k);
    return k.id;
  }
  const ekAlici = async (kisiIdleri: number[]): Promise<void> => {
    const l = bildirimAlicilariCevabi.parse((await istek('yonetici', 'GET', '/bildirimler/alicilar')).govde);
    const surum = l.satirlar.find((x) => x.tur === TUR)?.surum ?? null;
    const r = await istek('yonetici', 'POST', `/bildirimler/alicilar/${TUR}/degistir`, { rolIdleri: [], kisiIdleri, surum });
    assert.equal(r.durum, 200, r.metin);
  };

  before(async () => {
    ortam = await testVeritabaniKur('alicigrubu');
    await ortam.vt.tx((db) => butunOlaylariVeEskiKademeleriAc(db, null));
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    kisiler.set('yonetici', yoneticiId);
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerezler.set('yonetici', String(g.headers['set-cookie']).split(';')[0] ?? '');
    for (const [ad, rol] of [['bakim', 'bakim'], ['mudur', 'mudur'], ['operator', 'operator']] as const) await kisiEkle(ad, rol);
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('kural uçları ayarlar.yaz ister; şablon listesi yalnız kimlik ve ad döner', async () => {
    assert.equal((await istek(null, 'GET', '/bildirimler/kurallar/sablonlar')).durum, 401);
    assert.equal((await istek('bakim', 'GET', '/bildirimler/kurallar/sablonlar')).durum, 403);
    const r = await istek('yonetici', 'GET', '/bildirimler/kurallar/sablonlar');
    assert.equal(r.durum, 200, r.metin);
    assert.deepEqual(bildirimKuralSablonlariCevabi.parse(r.govde).sablonlar, []);
  });

  test('kayda bağlı olay kurala açılır; grup koşulsuzdur, kayıtsız şablon reddedilir', async () => {
    const red = await istek('yonetici', 'POST', '/bildirimler/kurallar/ekle', govde({ epostaSablonId: 999_999 }));
    assert.equal(red.durum, 400);
    assert.match(red.metin, /epostaSablonId/);
    const kosullu = await istek('yonetici', 'POST', '/bildirimler/kurallar/ekle', govde({ kosullar: [{ alan: 'firma', karsilastirma: '=', deger: 'X' }] }));
    assert.equal(kosullu.durum, 400, 'olayın alanı yok: koşul yazılamaz');
  });

  test('grup alıcısı ana bildirimi almaz, grubun başlığıyla alır; kayıttaki kişi kendi metnini alır; siparişi göremeyen düşer', async () => {
    await bosalt();
    await grupEkle();
    await gonder();
    assert.deepEqual(await satirlar(kim('mudur')), [{ baslik: 'Onaylanan sipariş: ORN-1', metin: null }]);
    const y = await satirlar(yoneticiId);
    assert.equal(y.length, 1);
    assert.equal(y[0]?.baslik, 'Sipariş onaylandı');
    assert.match(y[0]?.metin ?? '', /Onaylanan sipariş: ORN-1/);
    assert.deepEqual(await satirlar(kim('bakim')), [], 'siparisler.oku taşımayan grup alıcısı düşer (Risk K1)');
  });

  test('öncelik: kişi hem ek alıcı hem grupta ise tek satır, grup metniyle; yalnız ek alıcıdaysa ana metinle', async () => {
    await bosalt();
    await o().sahip.sorgu('DELETE FROM bildirim_kurali');
    await grupEkle({ kisiIdleri: [yoneticiId] });
    await ekAlici([yoneticiId, kim('operator')]);
    await gonder();
    const y = await satirlar(yoneticiId);
    assert.equal(y.length, 1, 'ikisinde de olan kişiye tek bildirim');
    assert.equal(y[0]?.baslik, 'Sipariş onaylandı', 'grup metni kazanır');
    await o().sahip.sorgu('UPDATE bildirim_kurali SET acik = false');
    await bosalt();
    await gonder();
    const y2 = await satirlar(yoneticiId);
    assert.deepEqual(y2, [{ baslik: 'Onaylanan sipariş: ORN-1', metin: null }], 'grup kapalıyken ek alıcı ana metinle alır (3597 davranışı korunur)');
    await ekAlici([]);
  });

  test('kayıttaki kişi de gruptaysa grup metni kazanır; olayı başlatan grupta açıkça varsa kendi eylemini alır, yoksa almaz (3639)', async () => {
    await bosalt();
    await o().sahip.sorgu('DELETE FROM bildirim_kurali');
    await grupEkle({ kisiIdleri: [kim('mudur'), yoneticiId] });
    await gonder();
    const m = await satirlar(kim('mudur'));
    assert.equal(m.length, 1);
    assert.equal(m[0]?.baslik, 'Sipariş onaylandı');
    await bosalt();
    await gonder({ haric: yoneticiId });
    assert.equal((await satirlar(yoneticiId)).length, 1, 'gruptaki başlatan alır');
    await bosalt();
    await gonder({ haric: kim('bakim') });
    assert.deepEqual(await satirlar(kim('bakim')), [], 'grupta olmayan başlatan almaz');
  });

  test('grup e-postası seçilen özel şablonla kuyruğa girer; şablon silinirse olayın şablonuna döner', async () => {
    const eski = { ...process.env };
    Object.assign(process.env, { TMIV2_POSTA_SUNUCUSU: '127.0.0.1:2525', TMIV2_POSTA_ALAN_ADI: 'ornek.local', TMIV2_POSTA_GONDEREN: 'mes@ornek.local', TMIV2_POSTA_GUVENLIK: 'yok' });
    try {
      const kip = await istek('yonetici', 'POST', '/ayarlar/bildirim.eposta-kipi/degistir', { deger: 'kurum-ici' });
      assert.equal(kip.durum, 200, kip.metin);
      const sablon = await o().sahip.tek<{ id: number }>(
        "INSERT INTO bildirim_eposta_ozel_sablon (ad, simge, konu_kalibi, govde) VALUES ('ORN Satış onayı', 'cart', '{olay}', 'Merhaba {alici_adi}') RETURNING id");
      const sablonId = sablon?.id ?? 0;
      assert.deepEqual(bildirimKuralSablonlariCevabi.parse((await istek('yonetici', 'GET', '/bildirimler/kurallar/sablonlar')).govde).sablonlar, [{ id: sablonId, ad: 'ORN Satış onayı' }]);
      await bosalt();
      await o().sahip.sorgu('DELETE FROM bildirim_kurali');
      await grupEkle({ kisiIdleri: [yoneticiId], eposta: true, epostaSablonId: sablonId });
      await gonder();
      assert.deepEqual(await o().sahip.sorgu('SELECT kisi_id, baslik, sablon_id FROM bildirim_eposta_kuyrugu'), [{ kisi_id: yoneticiId, baslik: 'Sipariş onaylandı', sablon_id: sablonId }]);
      await o().sahip.sorgu('DELETE FROM bildirim_eposta_ozel_sablon WHERE id = $1', [sablonId]);
      assert.deepEqual(await o().sahip.sorgu('SELECT sablon_id FROM bildirim_eposta_kuyrugu'), [{ sablon_id: null }]);
      assert.equal((await o().sahip.tek<{ sablon_id: number | null }>('SELECT sablon_id FROM bildirim_kurali'))?.sablon_id, null);
    } finally {
      for (const k of Object.keys(process.env)) if (!(k in eski)) delete process.env[k];
      Object.assign(process.env, eski);
    }
  });
});
