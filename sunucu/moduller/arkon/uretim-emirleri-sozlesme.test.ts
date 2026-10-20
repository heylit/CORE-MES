import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import type { HataKodu } from '#paylasilan/hata.ts';
import { AZAMI_SAYIM, sayimGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import {
  KOMUT_ISLEMI, acikEmirler, emirBaslat, emirBitir, emirDevam, emirDurdur, emirDuraklat, emirOzeti, emirSayim, kararliSayimiSonuclandir,
} from '../uretim-emirleri/disari.ts';

// Arkon'un uretim-emirleri/disari.ts'ten kullandığı her şeyin sözleşmesi (servis.ts yansıma akışı ve taslak paket).
// Modül dışarıda yeniden yazılıyor: imza ya da davranış değişirse bu dosya kırmızı olur ve oturtmada görülür.
const PAROLA = 'dogru-parola-1';

describe('arkon <- uretim-emirleri/disari.ts sözleşmesi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let sayac = 0;
  let durusNedeniId = 0;
  let hurdaNedeniId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const uretici = (): Kullanici => ({ id: yoneticiId, ad: 'Deneme Yönetici', islemler: [KOMUT_ISLEMI] });
  const yetkisiz = (): Kullanici => ({ id: yoneticiId, ad: 'Deneme Yönetici', islemler: ['sayfa.arkon'] });

  async function istek<T>(yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<T> {
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: yonetici, ...(yontem === 'POST' && yol === '/uretim-emirleri' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) }, ...(govde === undefined ? {} : { payload: govde as object }) });
    assert.equal(c.statusCode, 200, c.body);
    return c.json() as T;
  }

  async function istasyonKur(): Promise<{ istasyonId: number; merkezId: number }> {
    const im = await istek<{ id: number }>('POST', '/is-merkezleri', { kod: `SM${(sayac += 1)}`, ad: 'Sözleşme merkezi' });
    const ist = await istek<{ id: number }>('POST', '/istasyonlar', { kod: `SI${(sayac += 1)}`, ad: 'Sözleşme istasyonu', isMerkeziId: im.id, tip: 'talasli' });
    // UE20: iş başlatan test kişileri bu istasyonda yetkindir.
    await vt().sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi', [ist.id]);
    return { istasyonId: ist.id, merkezId: im.id };
  }

  async function emirAc(istasyonId: number): Promise<number> {
    return (await istek<{ emir: { id: number } }>('POST', '/uretim-emirleri', { parcaNo: `SP-${(sayac += 1)}`, parcaAd: 'Sözleşme', adet: 100, istasyonId, projeId })).emir.id;
  }

  const calistir = <T>(is: (db: Db) => Promise<T>): Promise<T> => vt().tx(is);

  async function reddedilir(is: (db: Db) => Promise<unknown>, kod: HataKodu): Promise<void> {
    await assert.rejects(calistir(is), (hata: unknown) => {
      assert.ok(hata instanceof UygulamaHatasi, `UygulamaHatasi bekleniyordu: ${String(hata)}`);
      assert.equal(hata.kod, kod, hata.message);
      return true;
    });
  }

  let projeId = 0;

  before(async () => {
    ortam = await testVeritabaniKur('arkonsoz');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    // Denetim #27: rotasız emir varsayılan kapalı ve projeyle açılır; kurulum ayarı açar, test projesi verir.
    projeId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('TEST.PROJE', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    await ortam.sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('uretim-emirleri.rotasiz-emir', 'true', $1)", [yoneticiId]);
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    yonetici = String(giris.headers['set-cookie']).split(';')[0] ?? '';
    durusNedeniId = (await istek<{ id: number }>('POST', '/durus-nedenleri', { kod: 'SD-1', ad: 'Sözleşme duruşu', kategori: 'plansiz' })).id;
    hurdaNedeniId = (await istek<{ id: number }>('POST', '/hurda-nedenleri', { kod: 'SH-1', ad: 'Sözleşme hurdası' })).id;
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('KOMUT_ISLEMI terminal.uret; sayimGovdesi sağlam ve hurda kollarını ve AZAMI_SAYIM sınırını taşır', () => {
    assert.equal(KOMUT_ISLEMI, 'terminal.uret');
    assert.equal(sayimGovdesi.safeParse({ tur: 'saglam', adet: -1 }).success, true);
    assert.equal(sayimGovdesi.safeParse({ tur: 'hurda', adet: 2, hurdaNedeniId: 1 }).success, true);
    assert.equal(sayimGovdesi.safeParse({ tur: 'saglam', adet: AZAMI_SAYIM }).success, true);
    assert.equal(sayimGovdesi.safeParse({ tur: 'saglam', adet: AZAMI_SAYIM + 1 }).success, false);
    assert.equal(sayimGovdesi.safeParse({ tur: 'saglam', adet: 0 }).success, false);
    assert.equal(sayimGovdesi.safeParse({ tur: 'hurda', adet: 2 }).success, false);
  });

  test('acikEmirler planlı ve başlamış emirleri Arkon taslak paketinin okuduğu alanlarla verir; bitmiş emir gelmez', async () => {
    const { istasyonId } = await istasyonKur();
    const planli = await emirAc(istasyonId);
    const bitecek = await emirAc((await istasyonKur()).istasyonId);
    await calistir(async (db) => { await emirBaslat(db, uretici(), bitecek); await emirBitir(db, uretici(), bitecek); });
    const emirler = await calistir((db) => acikEmirler(db));
    const emir = emirler.find((e) => e.id === planli);
    assert.ok(emir, 'planlı emir açık listede olmalı');
    assert.equal(emir.durum, 'planli');
    for (const alan of ['id', 'emirNo', 'durum', 'istasyon', 'parcaNo', 'parcaAd', 'adet', 'acan', 'acilma'] as const) assert.ok(emir[alan] !== undefined, alan);
    assert.equal(emir.istasyon.id, istasyonId);
    assert.equal(emirler.some((e) => e.id === bitecek), false);
  });

  test('emirOzeti: var olan emirde {id, emirNo, durum, istasyonId}; olmayan emirde null; işlem aramaz', async () => {
    const { istasyonId } = await istasyonKur();
    const id = await emirAc(istasyonId);
    const ozet = await calistir((db) => emirOzeti(db, id));
    assert.ok(ozet);
    assert.deepEqual(Object.keys(ozet).sort(), ['durum', 'emirNo', 'id', 'istasyonId']);
    assert.equal(ozet.id, id);
    assert.equal(ozet.durum, 'planli');
    assert.equal(ozet.istasyonId, istasyonId);
    assert.equal(await calistir((db) => emirOzeti(db, 2_000_000_000)), null);
  });

  test('komutlar terminal.uret ister: işlemsiz kişiye YETKI_YOK, emir değişmez', async () => {
    const id = await emirAc((await istasyonKur()).istasyonId);
    await reddedilir((db) => emirBaslat(db, yetkisiz(), id), 'YETKI_YOK');
    await reddedilir((db) => emirSayim(db, yetkisiz(), id, { tur: 'saglam', adet: 1 }), 'YETKI_YOK');
    await reddedilir((db) => emirBitir(db, yetkisiz(), id), 'YETKI_YOK');
    assert.equal((await calistir((db) => emirOzeti(db, id)))?.durum, 'planli');
  });

  test('kapsam: iş merkezi kısıtlı kişi kapsam dışındaki emri başlatamaz, kapsamdakini başlatır', async () => {
    const icerde = await istasyonKur();
    const disarda = await istasyonKur();
    // Yönetici rolü kapsamdan muaftır: kişi yönetici olarak açılır, rolü alınır.
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const uretimRolu = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $2) RETURNING id', [`soz_${(sayac += 1)}`, 'Sözleşme üretici']);
    assert.ok(yoneticiRolu && uretimRolu);
    await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [uretimRolu.id, KOMUT_ISLEMI]);
    const kisiId = await vt().tx(async (db) => {
      const id = await yoneticiOlustur(db, { ad: 'Deneme Kısıtlı', kullaniciAdi: `kisitli${(sayac += 1)}`, parola: PAROLA });
      await rolAta(db, yoneticiId, id, uretimRolu.id);
      await rolAl(db, yoneticiId, id, yoneticiRolu.id);
      return id;
    });
    await istek('POST', `/kisi-is-merkezleri/${kisiId}/belirle`, { isMerkeziIdleri: [icerde.merkezId] });
    const kisitli: Kullanici = { id: kisiId, ad: 'Deneme Kısıtlı', islemler: [KOMUT_ISLEMI] };
    // UE20: kısıtlı kişi yalnız kapsamdaki istasyonda yetkindir.
    await vt().sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2)', [kisiId, icerde.istasyonId]);
    const disariEmir = await emirAc(disarda.istasyonId);
    const iceriEmir = await emirAc(icerde.istasyonId);
    await reddedilir((db) => emirBaslat(db, kisitli, disariEmir), 'YETKI_YOK');
    assert.equal((await calistir((db) => emirBaslat(db, kisitli, iceriEmir))).emir.durum, 'basladi');
  });

  test('durum akışı: başlat, sayım (sağlam, eksi düzeltme, hurda), duraklat, devam, durdur, bitir', async () => {
    const id = await emirAc((await istasyonKur()).istasyonId);
    const k = uretici();
    assert.equal((await calistir((db) => emirBaslat(db, k, id))).emir.durum, 'basladi');
    // 327 a: ilk parça onaylanana kadar sağlam sayım karar bekler; onayla sağlama geçer.
    assert.equal((await calistir((db) => emirSayim(db, k, id, { tur: 'saglam', adet: 5 }))).emir.canli?.saglam, 0);
    assert.equal((await calistir((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay'))).emir.canli?.saglam, 5);
    assert.equal((await calistir((db) => emirSayim(db, k, id, { tur: 'saglam', adet: -1 }))).emir.canli?.saglam, 4);
    assert.equal((await calistir((db) => emirSayim(db, k, id, { tur: 'hurda', adet: 2, hurdaNedeniId }))).emir.canli?.hurda, 2);
    assert.equal((await calistir((db) => emirDuraklat(db, k, id))).emir.canli?.calisma, 'durakli');
    assert.equal((await calistir((db) => emirDevam(db, k, id))).emir.canli?.calisma, 'calisiyor');
    assert.equal((await calistir((db) => emirDurdur(db, k, id, durusNedeniId))).emir.canli?.calisma, 'durdu');
    await calistir((db) => emirDevam(db, k, id));
    const bitti = (await calistir((db) => emirBitir(db, k, id))).emir;
    assert.equal(bitti.durum, 'bitti');
    assert.equal(bitti.saglamAdet, 4);
  });

  test('retler UygulamaHatasi olarak çıkar: planlı emre sayım, çalışan emre devam, olmayan duruş nedeni, ikinci başlatma', async () => {
    const id = await emirAc((await istasyonKur()).istasyonId);
    const k = uretici();
    await reddedilir((db) => emirSayim(db, k, id, { tur: 'saglam', adet: 1 }), 'CAKISMA');
    await calistir((db) => emirBaslat(db, k, id));
    await reddedilir((db) => emirBaslat(db, k, id), 'CAKISMA');
    await reddedilir((db) => emirDevam(db, k, id), 'CAKISMA');
    await reddedilir((db) => emirDurdur(db, k, id, 2_000_000_000), 'DOGRULAMA');
    await reddedilir((db) => emirSayim(db, k, id, { tur: 'hurda', adet: 1, hurdaNedeniId: 2_000_000_000 }), 'DOGRULAMA');
  });
});
