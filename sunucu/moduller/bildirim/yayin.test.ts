import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import {
  bildirimYayinAlicilariCevabi, bildirimYayinCevabi, bildirimYayinHedefleriCevabi, bildirimYayinListeCevabi, ortadakiBildirimlerCevabi,
  type BildirimYayinlaGovdesi, type BildirimYayini, type OrtadakiBildirim,
} from '#paylasilan/sozlesme/bildirim.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { istasyonAtamasiAc } from '../istasyonlar/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { bildirimGonder } from './disari.ts';
import { zamaniGelenleriDagit } from './yayin.ts';

const PAROLA = 'dogru-parola-1';
// 1x1 saydam PNG: dosya modülü türü içerikten bulur.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
interface Cevap<T = unknown> { durum: number; govde: T }

describe('elle bildirim, ekran ortası ve onay (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();
  let istasyonId = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kim = (ad: string): number => {
    const id = kisiler.get(ad);
    if (id === undefined) throw new Error(`kişi yok: ${ad}`);
    return id;
  };

  async function istek<T = unknown>(ad: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown, ek: Record<string, string> = {}): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { ...(ad === null ? {} : { cookie: cerezler.get(ad) ?? '' }), ...ek };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body && c.headers['content-type']?.toString().includes('json') ? c.json() : c.rawPayload) as T };
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
      await rolAta(db, kim('yonetici'), yeni, rol.id);
      await rolAl(db, kim('yonetici'), yeni, yoneticiRolu.id);
      return yeni;
    });
    kisiler.set(kullaniciAdi, id);
    await giris(kullaniciAdi);
  }
  const rolId = async (kod: string): Promise<number> => (await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;

  const taslak = (ek: Partial<BildirimYayinlaGovdesi> = {}): BildirimYayinlaGovdesi => ({
    tur: 'uyari', simge: 'wrench', baslik: 'Kompresör bakımı', metin: 'Hava kesik', gorsel: null, hedef: { tur: 'herkes', idler: [] },
    ortada: true, onayIstenir: true, yayinZamani: null, bitis: null, ...ek,
  });
  const yayinla = (ad: string, g: BildirimYayinlaGovdesi) =>
    istek<BildirimYayini & { hata?: { kod: string; mesaj: string } }>(ad, 'POST', '/bildirimler/yayinlar/yayinla', g, { 'istek-kimligi': randomUUID() });
  async function yayinlaTamam(ad: string, g: BildirimYayinlaGovdesi): Promise<BildirimYayini> {
    const c = await yayinla(ad, g);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return bildirimYayinCevabi.parse(c.govde);
  }
  async function ortada(ad: string): Promise<OrtadakiBildirim[]> {
    const c = await istek(ad, 'GET', '/bildirimler/ortada');
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return ortadakiBildirimlerCevabi.parse(c.govde).satirlar;
  }
  const bosalt = (): Promise<unknown> => o().sahip.sorgu('DELETE FROM bildirim_kaydi; DELETE FROM bildirim_yayini');

  before(async () => {
    ortam = await testVeritabaniKur('bildirimyayin');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiler.set('yonetici', await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA })));
    await giris('yonetici');
    await kisiEkle('operator', 'operator');
    await kisiEkle('operator2', 'operator');
    await kisiEkle('kalite', 'kalite');
    await kisiEkle('mudur', 'mudur');
    const im = await ortam.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('BYIM', 'Deneme Merkezi') RETURNING id");
    istasyonId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('BYIS', 'Deneme torna', $1, true) RETURNING id", [im!.id]))!.id;
    await ortam.vt.tx((db) => istasyonAtamasiAc(db, { istasyonId, kisiId: kim('operator2') }));
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('2147-2 c: işlemler hiçbir role göçle verilmedi; yönetici dışındaki roller yayınlayamaz ve raporu göremez', async () => {
    const satir = await o().vt.tek<{ n: number }>("SELECT count(*)::int AS n FROM rol_islemi WHERE islem LIKE 'bildirim.%'");
    assert.equal(satir?.n, 0);
    for (const ad of ['operator', 'kalite', 'mudur']) {
      assert.equal((await yayinla(ad, taslak())).durum, 403, ad);
      assert.equal((await istek(ad, 'GET', '/bildirimler/yayinlar')).durum, 403, ad);
      assert.equal((await istek(ad, 'GET', '/bildirimler/yayinlar/hedefler')).durum, 403, ad);
      assert.equal((await istek(ad, 'POST', '/bildirimler/yayinlar/1/geri-cek')).durum, 403, ad);
    }
    for (const [yontem, yol] of [['GET', '/bildirimler/ortada'], ['POST', '/bildirimler/1/onayla'], ['GET', '/bildirimler/yayinlar/1/gorsel']] as const) {
      assert.equal((await istek(null, yontem, yol)).durum, 401, yol);
    }
  });

  test('yayınlama tekrar korumalıdır: istek kimliği olmadan reddedilir, aynı kimlikle ikinci kez yazılmaz', async () => {
    await bosalt();
    assert.equal((await istek('yonetici', 'POST', '/bildirimler/yayinlar/yayinla', taslak())).durum, 400);
    const kimlik = randomUUID();
    const a = await istek('yonetici', 'POST', '/bildirimler/yayinlar/yayinla', taslak(), { 'istek-kimligi': kimlik });
    const b = await istek('yonetici', 'POST', '/bildirimler/yayinlar/yayinla', taslak(), { 'istek-kimligi': kimlik });
    assert.equal(a.durum, 200, JSON.stringify(a.govde));
    assert.deepEqual(b.govde, a.govde);
    assert.equal((await o().vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM bildirim_yayini'))?.n, 1);
  });

  test('herkese yayın: yazan dışında etkin ve girişli herkes alır; ortada onay bekler, onaylanınca düşer', async () => {
    await bosalt();
    const y = await yayinlaTamam('yonetici', taslak());
    assert.equal(y.aliciSayisi, 4);
    assert.equal(y.okuyanSayisi, 0);
    assert.equal(y.onaylayanSayisi, 0);
    assert.equal(y.yazan.id, kim('yonetici'));
    assert.deepEqual(await ortada('yonetici'), []);
    const [b] = await ortada('operator');
    assert.ok(b);
    assert.equal(b.yayinTuru, 'uyari');
    assert.equal(b.onem, 'uyari');
    assert.equal(b.simge, 'wrench');
    assert.equal(b.onayIstenir, true);
    assert.equal(b.gonderen, 'Deneme Yönetici');
    // Okundu yapmak onayın yerine geçmez: ortada kalır.
    assert.equal((await istek('operator', 'POST', `/bildirimler/${b.id}/okundu`)).durum, 200);
    assert.equal((await ortada('operator')).length, 1);
    // Onaysız arşiv reddedilir.
    const arsiv = await istek<{ hata: { mesaj: string } }>('operator', 'POST', `/bildirimler/${b.id}/arsivle`);
    assert.equal(arsiv.durum, 400, JSON.stringify(arsiv.govde));
    // Başkasının satırı onaylanamaz: bulunamadı.
    assert.equal((await istek('kalite', 'POST', `/bildirimler/${b.id}/onayla`)).durum, 404);
    const onay = await istek<{ onaylandi: string }>('operator', 'POST', `/bildirimler/${b.id}/onayla`);
    assert.equal(onay.durum, 200, JSON.stringify(onay.govde));
    assert.deepEqual(await ortada('operator'), []);
    assert.equal((await istek('operator', 'POST', `/bildirimler/${b.id}/arsivle`)).durum, 200);
    const rapor = bildirimYayinAlicilariCevabi.parse((await istek('yonetici', 'GET', `/bildirimler/yayinlar/${y.id}/alicilar`)).govde);
    const op = rapor.satirlar.find((r) => r.kisi.id === kim('operator'));
    assert.ok(op?.onaylandi);
    assert.equal(rapor.satirlar.filter((r) => r.onaylandi !== null).length, 1);
    const liste = bildirimYayinListeCevabi.parse((await istek('yonetici', 'GET', '/bildirimler/yayinlar')).govde);
    assert.equal(liste.satirlar[0]?.onaylayanSayisi, 1);
    assert.equal(liste.satirlar[0]?.okuyanSayisi, 1);
  });

  test('onaysız ortadaki okununca düşer; onay istemeyene onay reddedilir; ortada olmayan zil ve listede kalır', async () => {
    await bosalt();
    await yayinlaTamam('yonetici', taslak({ tur: 'duyuru', simge: 'calendar', onayIstenir: false }));
    await yayinlaTamam('yonetici', taslak({ tur: 'bilgi', simge: 'bell', ortada: false, onayIstenir: false }));
    const [b] = await ortada('kalite');
    assert.ok(b);
    assert.equal(b.onem, 'bilgi');
    assert.equal((await ortada('kalite')).length, 1);
    assert.equal((await istek('kalite', 'POST', `/bildirimler/${b.id}/onayla`)).durum, 400);
    assert.equal((await istek('kalite', 'POST', `/bildirimler/${b.id}/okundu`)).durum, 200);
    assert.deepEqual(await ortada('kalite'), []);
    const sayac = await istek<{ okunmamis: number }>('kalite', 'GET', '/bildirimler/sayac');
    assert.equal(sayac.govde.okunmamis, 1);
  });

  test('rol, kişi ve istasyon hedefi: yalnız seçilenler alır; olmayan hedef reddedilir', async () => {
    await bosalt();
    const rol = await yayinlaTamam('yonetici', taslak({ hedef: { tur: 'rol', idler: [await rolId('kalite')] } }));
    assert.equal(rol.aliciSayisi, 1);
    assert.deepEqual(rol.hedef.adlar.length, 1);
    assert.equal((await ortada('kalite')).length, 1);
    assert.equal((await ortada('operator')).length, 0);
    const kisi = await yayinlaTamam('yonetici', taslak({ hedef: { tur: 'kisi', idler: [kim('mudur'), kim('yonetici')] } }));
    // Yazan kendi yayınını almaz.
    assert.equal(kisi.aliciSayisi, 1);
    const ist = await yayinlaTamam('yonetici', taslak({ hedef: { tur: 'istasyon', idler: [istasyonId] } }));
    assert.equal(ist.aliciSayisi, 1);
    assert.deepEqual(ist.hedef.adlar, ['Deneme torna']);
    assert.equal((await ortada('operator2')).length, 1);
    assert.equal((await ortada('operator')).length, 0);
    for (const hedef of [{ tur: 'rol', idler: [999999] }, { tur: 'istasyon', idler: [999999] }, { tur: 'kisi', idler: [999999] }] as const) {
      const c = await yayinla('yonetici', taslak({ hedef: { tur: hedef.tur, idler: [...hedef.idler] } }));
      assert.equal(c.durum, 400, `${hedef.tur} ${JSON.stringify(c.govde)}`);
    }
    assert.equal((await yayinla('yonetici', taslak({ hedef: { tur: 'herkes', idler: [kim('mudur')] } }))).durum, 400);
    assert.equal((await yayinla('yonetici', taslak({ hedef: { tur: 'rol', idler: [] } }))).durum, 400);
    const secenek = bildirimYayinHedefleriCevabi.parse((await istek('yonetici', 'GET', '/bildirimler/yayinlar/hedefler')).govde);
    assert.ok(secenek.istasyonlar.some((i) => i.id === istasyonId));
    assert.equal(secenek.herkesSayisi, 5);
  });

  test('geri çekilen yayın ortada çıkmaz; yalnız yazan geri çeker, ikinci kez çekilemez', async () => {
    await bosalt();
    const y = await yayinlaTamam('yonetici', taslak());
    assert.equal((await ortada('operator')).length, 1);
    const c = await istek('yonetici', 'POST', `/bildirimler/yayinlar/${y.id}/geri-cek`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.ok(bildirimYayinCevabi.parse(c.govde).geriCekildi);
    assert.deepEqual(await ortada('operator'), []);
    assert.equal((await istek('yonetici', 'POST', `/bildirimler/yayinlar/${y.id}/geri-cek`)).durum, 409);
  });

  test('ileri tarihli yayın zamanı gelince dağıtılır; bitiş yayından önce olamaz; 90 günden ileri reddedilir', async () => {
    await bosalt();
    const ileri = new Date(Date.now() + 3_600_000).toISOString();
    const y = await yayinlaTamam('yonetici', taslak({ yayinZamani: ileri }));
    assert.equal(y.dagitildi, null);
    assert.equal(y.aliciSayisi, null);
    assert.deepEqual(await ortada('operator'), []);
    assert.equal(await o().vt.tx((db) => zamaniGelenleriDagit(db)), 0);
    await o().sahip.sorgu("UPDATE bildirim_yayini SET yayin_zamani = now() - interval '1 minute' WHERE id = $1", [y.id]);
    assert.equal(await o().vt.tx((db) => zamaniGelenleriDagit(db)), 4);
    assert.equal(await o().vt.tx((db) => zamaniGelenleriDagit(db)), 0);
    assert.equal((await ortada('operator')).length, 1);
    assert.equal((await yayinla('yonetici', taslak({ yayinZamani: ileri, bitis: new Date(Date.now() + 60_000).toISOString() }))).durum, 400);
    assert.equal((await yayinla('yonetici', taslak({ yayinZamani: new Date(Date.now() + 91 * 86_400_000).toISOString() }))).durum, 400);
  });

  test('görsel yerel depoda: yalnız yükleyen bağlar; alıcı ve yazan görür, alıcı olmayan göremez', async () => {
    await bosalt();
    const ozet = createHash('sha256').update(PNG).digest('hex');
    const yukle = await istek('yonetici', 'POST', `/dosyalar/${ozet}/parca`, { sira: 0, toplam: 1, veri: PNG.toString('base64') });
    assert.equal(yukle.durum, 200, JSON.stringify(yukle.govde));
    // Başkasının yüklediği özeti bağlayamaz.
    assert.equal((await yayinla('yonetici', taslak({ gorsel: { ozet: 'a'.repeat(64), ad: 'yok.png' } }))).durum >= 400, true);
    const y = await yayinlaTamam('yonetici', taslak({ hedef: { tur: 'rol', idler: [await rolId('kalite')] }, gorsel: { ozet, ad: 'bakim.png' } }));
    assert.equal(y.gorselVar, true);
    assert.equal((await ortada('kalite'))[0]?.gorselVar, true);
    const g = await istek<Buffer>('kalite', 'GET', `/bildirimler/yayinlar/${y.id}/gorsel`);
    assert.equal(g.durum, 200);
    assert.deepEqual(Buffer.from(g.govde), PNG);
    assert.equal((await istek('yonetici', 'GET', `/bildirimler/yayinlar/${y.id}/gorsel`)).durum, 200);
    assert.equal((await istek('operator', 'GET', `/bildirimler/yayinlar/${y.id}/gorsel`)).durum, 404);
  });

  test('2147-3 a: otomatik acil bildirim ortada çıkar ve onay istemez; acil olmayan ortada çıkmaz', async () => {
    await bosalt();
    await o().vt.tx((db) => bildirimGonder(db, { tur: 'guvenlik.kritik-alarm', baslik: 'Kritik alarm', yol: '/guvenlik' }));
    await o().vt.tx((db) => bildirimGonder(db, { tur: 'saglik.esik-uyarisi', baslik: 'Eşik aşıldı', yol: '/ayarlar' }));
    const [b, ...kalan] = await ortada('yonetici');
    assert.equal(kalan.length, 0);
    assert.equal(b?.onem, 'acil');
    assert.equal(b?.yayinTuru, null);
    assert.equal(b?.gonderen, null);
    assert.equal(b?.onayIstenir, false);
    assert.equal((await istek('yonetici', 'POST', `/bildirimler/${b?.id}/okundu`)).durum, 200);
    assert.deepEqual(await ortada('yonetici'), []);
  });
});
