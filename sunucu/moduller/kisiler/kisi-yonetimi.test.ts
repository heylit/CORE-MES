import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { sifirlamaHazirla, testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kisileriListele, yoneticiOlustur } from './disari.ts';
import { hesapAc, kisiEkle, kisiPasifeAl } from './servis.ts';
import { GOREV_EN_FAZLA, ILETILER, SICIL_EN_FAZLA } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';

describe('kişi yönetimi (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let uygulama: FastifyInstance | undefined;
  let adminId = 0;
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const app = (): FastifyInstance => {
    if (!uygulama) throw new Error('Uygulama kurulmadı.');
    return uygulama;
  };

  let sifirla: (() => Promise<void>) | undefined;

  // Göçler dosya başına bir kez uygulanır; her test göç sonrası duruma döndürülmüş şemayla ve yeni uygulamayla başlar.
  before(async () => {
    ortam = await testVeritabaniKur('kisiler_yon');
    sifirla = await sifirlamaHazirla(ortam);
  });
  after(async () => { await ortam?.kaldir(); });

  beforeEach(async () => {
    if (!ortam || !sifirla) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    await sifirla();
    sayac = 0;
    uygulama = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    adminId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
  });
  afterEach(async () => {
    await uygulama?.close();
    uygulama = undefined;
  });

  const rolId = async (kod: string): Promise<number> => {
    const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]);
    if (!rol) throw new Error(`rol yok: ${kod}`);
    return rol.id;
  };

  // Yerleşik rollerde olmayan işlem birleşimleri için test rolü (modülün kendi tablosu).
  const rolAc = async (kod: string, islemler: string[]): Promise<number> => {
    const satir = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [kod]);
    if (!satir) throw new Error('rol açılamadı');
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [satir.id, islem]);
    return satir.id;
  };

  // Girişli kişi: uygulamanın kendi kişi ekleme ve hesap açma işleviyle kurulur.
  const kullanici = async (kullaniciAdi: string, rolKimligi: number, aktor = adminId): Promise<number> =>
    vt().tx(async (db) => {
      const id = await kisiEkle(db, { ad: `Kişi ${kullaniciAdi}` });
      await hesapAc(db, aktor, id, { kullaniciAdi, parola: PAROLA, rolId: rolKimligi });
      return id;
    });
  const yoneticiKisi = async (kullaniciAdi: string): Promise<number> => kullanici(kullaniciAdi, await rolId('yonetici'));
  const girissiz = (ad = `Girişsiz ${++sayac}`): Promise<number> => vt().tx((db) => kisiEkle(db, { ad }));

  const cerez = async (kullaniciAdi: string, parola = PAROLA): Promise<string> => {
    const cevap = await app().inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  };
  const girisDurumu = async (kullaniciAdi: string, parola: string): Promise<number> =>
    (await app().inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola } })).statusCode;
// Kişi komutu sürümü okunan kayıttan alır (ekranın yaptığı gibi); sürümü sınayan test gövdeye kendisi yazar.
  const istek = async (cerezi: string, yol: string, govde?: unknown, yontem: 'GET' | 'POST' = 'POST'): Promise<LightMyRequestResponse> => {
    const hedef = /^\/kisiler\/(\d+)\/[a-z-]+$/.exec(yol);
    let yuk = govde;
    if (yontem === 'POST' && hedef && typeof govde === 'object' && govde !== null && !('surum' in govde)) {
      const satir = await vt().tek<{ surum: number }>('SELECT surum FROM kisi WHERE id = $1', [Number(hedef[1])]);
      yuk = { ...govde, surum: satir?.surum ?? 1 };
    }
    const kimlik = yontem === 'POST' && yol === '/kisiler' ? { 'istek-kimligi': randomUUID() } : {};
    return app().inject({ method: yontem, url: `/api${yol}`, headers: { cookie: cerezi, ...kimlik }, ...(yuk === undefined ? {} : { payload: yuk as object }) });
  };
  const kisi = async (cerezi: string, id: number): Promise<Record<string, unknown>> => {
    const cevap = await istek(cerezi, '/kisiler', undefined, 'GET');
    assert.equal(cevap.statusCode, 200, cevap.body);
    const bulunan = (cevap.json().kisiler as { id: number }[]).find((k) => k.id === id);
    assert.ok(bulunan, 'kişi listede yok');
    return bulunan as unknown as Record<string, unknown>;
  };
  const hataGovdesi = (kod: string, mesaj: string) => (hata: unknown): boolean => {
    assert.ok(hata instanceof UygulamaHatasi, `uygulama hatası beklenirdi: ${String(hata)}`);
    assert.deepEqual(hata.govde(), { kod, mesaj });
    return true;
  };

  test('kişi ekleme kisiler.yaz ister; girişsiz doğar, alanlar kırpılır, aynı ad olur, sicil benzersizdir', async () => {
    const ik = await kullanici('ik-ekle', await rolId('insan_kaynaklari'));
    await kullanici('op-ekle', await rolId('operator'));
    const ikCerezi = await cerez('ik-ekle');

    assert.equal((await app().inject({ method: 'POST', url: '/api/kisiler', payload: { ad: 'X' } })).statusCode, 401);
    assert.equal((await istek(await cerez('op-ekle'), '/kisiler', { ad: 'Red' })).statusCode, 403);

    const ilk = await istek(ikCerezi, '/kisiler', { ad: '  Deneme Kişi ', sicilNo: ' S-1 ', gorev: ' Operatör ' });
    assert.equal(ilk.statusCode, 200, ilk.body);
    assert.deepEqual(
      { ad: ilk.json().ad, sicilNo: ilk.json().sicilNo, gorev: ilk.json().gorev, girisVar: ilk.json().girisVar, aktif: ilk.json().aktif, roller: ilk.json().roller },
      { ad: 'Deneme Kişi', sicilNo: 'S-1', gorev: 'Operatör', girisVar: false, aktif: true, roller: [] },
    );

    // Aynı ad iki kişi olabilir; sicilsiz kişiler birbiriyle çakışmaz.
    assert.equal((await istek(ikCerezi, '/kisiler', { ad: 'Deneme Kişi' })).statusCode, 200);
    assert.equal((await istek(ikCerezi, '/kisiler', { ad: 'Deneme Kişi', sicilNo: '' })).statusCode, 200);

    const cakisan = await istek(ikCerezi, '/kisiler', { ad: 'Başka', sicilNo: 'S-1' });
    assert.equal(cakisan.statusCode, 409);
    assert.deepEqual(cakisan.json(), { kod: 'CAKISMA', mesaj: ILETILER.sicilVar });

    assert.equal((await istek(ikCerezi, '/kisiler', { ad: '   ' })).statusCode, 400);
    assert.equal((await istek(ikCerezi, '/kisiler', { ad: 'Uzun', sicilNo: 's'.repeat(31) })).statusCode, 400);
    assert.ok(ik > 0);
  });

  test('düzenleme: alanlar değişir, boş sicil temizler, başkasının sicili reddedilir; yetkisiz 403, kişi yoksa 404', async () => {
    await kullanici('ik-duz', await rolId('insan_kaynaklari'));
    await kullanici('op-duz', await rolId('operator'));
    const ikCerezi = await cerez('ik-duz');
    const a = await girissiz();
    const b = await girissiz();
    await istek(ikCerezi, `/kisiler/${a}/duzenle`, { ad: 'A', sicilNo: 'A-1' });

    assert.equal((await istek(await cerez('op-duz'), `/kisiler/${b}/duzenle`, { ad: 'Red' })).statusCode, 403);
    assert.equal((await istek(ikCerezi, '/kisiler/999999/duzenle', { ad: 'Yok' })).statusCode, 404);

    const cakisan = await istek(ikCerezi, `/kisiler/${b}/duzenle`, { ad: 'B', sicilNo: 'A-1' });
    assert.equal(cakisan.statusCode, 409);
    assert.deepEqual(cakisan.json(), { kod: 'CAKISMA', mesaj: ILETILER.sicilVar });

    // Kendi sicilini aynen göndermek çakışma değildir.
    const ayni = await istek(ikCerezi, `/kisiler/${a}/duzenle`, { ad: 'A yeni', sicilNo: 'A-1', gorev: 'Depo' });
    assert.equal(ayni.statusCode, 200, ayni.body);
    assert.deepEqual([ayni.json().ad, ayni.json().sicilNo, ayni.json().gorev], ['A yeni', 'A-1', 'Depo']);

    const temiz = await istek(ikCerezi, `/kisiler/${a}/duzenle`, { ad: 'A yeni', sicilNo: '  ', gorev: null });
    assert.deepEqual([temiz.json().sicilNo, temiz.json().gorev], [null, null]);
    // Serbest kalan sicil başkasına verilebilir.
    assert.equal((await istek(ikCerezi, `/kisiler/${b}/duzenle`, { ad: 'B', sicilNo: 'A-1' })).statusCode, 200);
  });

  test('bayraklı kişinin kaydını yalnız bayraklı aktör düzenler; bayraklı kendi kaydını da düzenleyebilir', async () => {
    await kullanici('ik-duzen', await rolId('insan_kaynaklari'));
    const ikinci = await yoneticiKisi('duzen-ikinci-yonetici');
    const yol = `/kisiler/${adminId}/duzenle`;
    const govde = { ad: 'Yeni Ad', sicilNo: 'Y-1', gorev: 'Yönetici' };

    const red = await istek(await cerez('ik-duzen'), yol, govde);
    assert.equal(red.statusCode, 403);
    assert.deepEqual(red.json(), { kod: 'YETKI_YOK', mesaj: ILETILER.bayrakliKaydiYetkisiz });
    const degismedi = await kisi(await cerez('yonetici'), adminId);
    assert.deepEqual([degismedi.ad, degismedi.sicilNo, degismedi.gorev], ['Deneme Yönetici', null, null]);

    const baska = await istek(await cerez('duzen-ikinci-yonetici'), yol, govde);
    assert.equal(baska.statusCode, 200, baska.body);
    assert.deepEqual([baska.json().ad, baska.json().sicilNo], ['Yeni Ad', 'Y-1']);
    const kendi = await istek(await cerez('yonetici'), yol, { ...govde, gorev: 'Müdür' });
    assert.equal(kendi.statusCode, 200, kendi.body);
    assert.equal(kendi.json().gorev, 'Müdür');
    assert.ok(ikinci > 0);
  });

  test('düzenleme cevabı bayrak bilgisini ve kullanıcı adını kisiler.rol-yonet olmayana vermez', async () => {
    await kullanici('ik-bayrak', await rolId('insan_kaynaklari'));
    const hedef = await kullanici('bayraksiz-hedef', await rolId('operator'));
    const cevap = await istek(await cerez('ik-bayrak'), `/kisiler/${hedef}/duzenle`, { ad: 'Deneme Kişi' });
    assert.equal(cevap.statusCode, 200, cevap.body);
    const roller = cevap.json().roller as { yonetici: unknown }[];
    assert.ok(roller.length > 0);
    assert.ok(roller.every((r) => r.yonetici === null));
    assert.equal(cevap.json().kullaniciAdi, null);
  });

  test('pasife alma ve yeniden aktif yapma: giriş ve açık oturum düşer, roller ve kayıt korunur, kişi silinmez', async () => {
    await kullanici('ik-pasif', await rolId('insan_kaynaklari'));
    const hedef = await kullanici('hedef-pasif', await rolId('operator'));
    const ikCerezi = await cerez('ik-pasif');
    const hedefCerezi = await cerez('hedef-pasif');
    assert.equal((await istek(hedefCerezi, '/oturum', undefined, 'GET')).json().kullanici?.id, hedef);

    const pasif = await istek(ikCerezi, `/kisiler/${hedef}/pasife-al`, {});
    assert.equal(pasif.statusCode, 200, pasif.body);
    assert.equal(pasif.json().aktif, false);

    // Açık oturum bir sonraki istekte düşer; yeni giriş de olmaz.
    assert.equal((await istek(hedefCerezi, '/oturum', undefined, 'GET')).json().kullanici, null);

    const kalan = await kisi(ikCerezi, hedef);
    assert.deepEqual([kalan.aktif, kalan.girisVar, (kalan.roller as { ad: string }[]).map((r) => r.ad)], [false, true, ['Operatör']]);

    const tekrar = await istek(ikCerezi, `/kisiler/${hedef}/pasife-al`, {});
    assert.equal(tekrar.statusCode, 409);
    assert.deepEqual(tekrar.json(), { kod: 'CAKISMA', mesaj: ILETILER.zatenPasif });

    const aktif = await istek(ikCerezi, `/kisiler/${hedef}/aktif-yap`, {});
    assert.equal(aktif.statusCode, 200, aktif.body);
    assert.equal(aktif.json().aktif, true);
    assert.deepEqual(aktif.json().roller.map((r: { ad: string }) => r.ad), ['Operatör']);
    await cerez('hedef-pasif');
    // Yeniden aktif yapılınca pasifken açık olan eski çerez geri çalışmaz.
    assert.equal((await istek(hedefCerezi, '/oturum', undefined, 'GET')).json().kullanici, null);

    const zatenAktif = await istek(ikCerezi, `/kisiler/${hedef}/aktif-yap`, {});
    assert.equal(zatenAktif.statusCode, 409);
    assert.deepEqual(zatenAktif.json(), { kod: 'CAKISMA', mesaj: ILETILER.zatenAktif });

    // Hatalı giriş bekleme doğurur; bu yüzden en sonda sınanır.
    await istek(ikCerezi, `/kisiler/${hedef}/pasife-al`, {});
    assert.equal(await girisDurumu('hedef-pasif', PAROLA), 401);
  });

  test('girişsiz personel de pasife alınır; kisileriListele pasif kişiyi de döner; yetkisiz 403, kişi yoksa 404', async () => {
    await kullanici('ik-girissiz', await rolId('insan_kaynaklari'));
    await kullanici('op-girissiz', await rolId('operator'));
    const hedef = await girissiz('Pasif Personel');
    const aktifKalan = await girissiz('Aktif Personel');

    assert.equal((await istek(await cerez('op-girissiz'), `/kisiler/${hedef}/pasife-al`, {})).statusCode, 403);
    assert.equal((await istek(await cerez('ik-girissiz'), '/kisiler/999999/pasife-al', {})).statusCode, 404);
    assert.equal((await istek(await cerez('ik-girissiz'), `/kisiler/${hedef}/pasife-al`, {})).statusCode, 200);

    const liste = await vt().tx((db) => kisileriListele(db));
    assert.deepEqual(liste.find((k) => k.id === hedef), { id: hedef, ad: 'Pasif Personel', aktif: false });
    assert.deepEqual(liste.find((k) => k.id === aktifKalan), { id: aktifKalan, ad: 'Aktif Personel', aktif: true });
  });

  test('kişi kendini pasife alamaz', async () => {
    const ik = await kullanici('ik-kendi', await rolId('insan_kaynaklari'));
    const cevap = await istek(await cerez('ik-kendi'), `/kisiler/${ik}/pasife-al`, {});
    assert.equal(cevap.statusCode, 422);
    assert.deepEqual(cevap.json(), { kod: 'GECERSIZ', mesaj: ILETILER.kendiPasif });
    assert.equal((await kisi(await cerez('ik-kendi'), ik)).aktif, true);
  });

  test('bayraklı kişiyi yalnız bayraklı başka kişi pasife alır', async () => {
    const ik = await kullanici('ik-bayrakli', await rolId('insan_kaynaklari'));
    const ikCerezi = await cerez('ik-bayrakli');
    const reddedilen = await istek(ikCerezi, `/kisiler/${adminId}/pasife-al`, {});
    assert.equal(reddedilen.statusCode, 403);
    assert.deepEqual(reddedilen.json(), { kod: 'YETKI_YOK', mesaj: ILETILER.bayrakliKisiYetkisiz });
    assert.equal((await kisi(await cerez('yonetici'), adminId)).aktif, true);

    const ikinci = await yoneticiKisi('ikinci-yonetici');
    const kabul = await istek(await cerez('ikinci-yonetici'), `/kisiler/${adminId}/pasife-al`, {});
    assert.equal(kabul.statusCode, 200, kabul.body);
    assert.equal(kabul.json().aktif, false);
    assert.ok(ik > 0 && ikinci > 0);
  });

  test('bayraklı rolü zaten olan girişsiz kişiye sıradan rolle hesabı yalnız bayraklı kişi açar', async () => {
    const rolYoneten = await rolAc('rol_yoneten_2', ['kisiler.rol-yonet', 'kisiler.oku']);
    await kullanici('rol-yoneten-2', rolYoneten);
    const hedef = await girissiz('Bayraklı Personel');
    await vt().sorgu('INSERT INTO kisi_rolu (kisi_id, rol_id) VALUES ($1, $2)', [hedef, await rolId('yonetici')]);
    const govde = { kullaniciAdi: 'ele.gecirilen', parola: PAROLA, rolId: await rolId('operator') };

    const red = await istek(await cerez('rol-yoneten-2'), `/kisiler/${hedef}/hesap-ac`, govde);
    assert.equal(red.statusCode, 403);
    assert.deepEqual(red.json(), { kod: 'YETKI_YOK', mesaj: ILETILER.bayrakliKisiYetkisiz });
    assert.equal((await kisi(await cerez('yonetici'), hedef)).girisVar, false);

    assert.equal((await istek(await cerez('yonetici'), `/kisiler/${hedef}/hesap-ac`, govde)).statusCode, 200);
  });

  test('iki yönetici birbirini aynı anda pasife alamaz: ikinci komut birincinin kilidini bekler ve reddedilir', async () => {
    const ikinci = await yoneticiKisi('es-zamanli-ikinci');
    let birak: () => void = () => undefined;
    const tutulan = new Promise<void>((coz) => { birak = coz; });
    let hazirOl: () => void = () => undefined;
    const hazir = new Promise<void>((coz) => { hazirOl = coz; });
    const birinci = vt().tx(async (db) => {
      await kisiPasifeAl(db, adminId, ikinci);
      hazirOl();
      await tutulan;
    });
    await hazir;
    let sonrakiPid = 0;
    const sonraki = vt().tx(async (db) => {
      sonrakiPid = (await db.tek<{ pid: number }>('SELECT pg_backend_pid() AS pid'))?.pid ?? 0;
      return kisiPasifeAl(db, ikinci, adminId);
    }).then(() => null, (hata: unknown) => hata);
    try {
      // Olay beklenir: ikinci komut bayraklı rol satırlarındaki kilitte bekler (sabit süre yok).
      const sinir = Date.now() + 10000;
      let bekliyor = false;
      while (!bekliyor && Date.now() < sinir) {
        const satir = await vt().tek<{ sayi: number }>(
          "SELECT count(*)::int AS sayi FROM pg_stat_activity WHERE pid = $1 AND wait_event_type = 'Lock' AND query LIKE '%FOR NO KEY UPDATE%'",
          [sonrakiPid],
        );
        bekliyor = (satir?.sayi ?? 0) > 0;
        if (!bekliyor) await new Promise((coz) => setTimeout(coz, 25));
      }
      assert.equal(bekliyor, true, 'ikinci komut kilitte beklemedi');
    } finally {
      birak();
    }
    await birinci;
    const hata = await sonraki;
    hataGovdesi('GECERSIZ', ILETILER.sonBayrakli)(hata);
    assert.equal((await kisi(await cerez('yonetici'), adminId)).aktif, true);
  });

  test('kisiler.rol-yonet ve kisiler.parola-degistir yalnız bayraklı rollerde: bayraksız role verilirse yükseltme yolu açılır', async () => {
    const satirlar = await vt().sorgu<{ kod: string; yonetici: boolean; islem: string }>(
      "SELECT r.kod, r.yonetici, ri.islem FROM rol r JOIN rol_islemi ri ON ri.rol_id = r.id WHERE ri.islem IN ('kisiler.rol-yonet', 'kisiler.parola-degistir')",
    );
    // Önce roller gelir: yoksa boş listede de geçerdi. Bayraklı rol bütün işlemleri zaten taşır; matriste satırı olanlar sayılır.
    const bayraksiz = satirlar.filter((s) => !s.yonetici).map((s) => `${s.kod}:${s.islem}`);
    const bayrakliRol = await vt().tek<{ sayi: number }>('SELECT count(*)::int AS sayi FROM rol WHERE yonetici');
    assert.ok((bayrakliRol?.sayi ?? 0) > 0, 'bayraklı rol yok');
    assert.deepEqual(bayraksiz, []);
  });

  test('geçersiz kılma sınırı: oturum açılışı tam geçersiz kılma anına denk gelirse geçersizdir, bir mikrosaniye önceyse sürer', async () => {
    const hedef = await kullanici('sinir-hedef', await rolId('planlama_proje'));
    const oturum = await cerez('sinir-hedef');
    const durum = async (): Promise<boolean> => (await istek(oturum, '/oturum', undefined, 'GET')).json().kullanici !== null;
    const yaz = (fark: string) => vt().sorgu(
      `UPDATE kisi SET oturumlar_gecersiz_once = (SELECT acildi FROM oturum WHERE kisi_id = $1) ${fark} WHERE id = $1`,
      [hedef],
    );

    assert.equal(await durum(), true);
    await yaz("- interval '1 microsecond'");
    assert.equal(await durum(), true, 'açılıştan önceki geçersiz kılma oturumu etkilemez');
    await yaz('');
    assert.equal(await durum(), false, 'eşitlikte geçersiz');
  });

  test('pasif bayraklı kişiyi yalnız bayraklı başka kişi yeniden aktif yapar', async () => {
    await kullanici('ik-aktif', await rolId('insan_kaynaklari'));
    const ikinci = await yoneticiKisi('aktif-ikinci');
    await vt().tx((db) => kisiPasifeAl(db, adminId, ikinci));

    const red = await istek(await cerez('ik-aktif'), `/kisiler/${ikinci}/aktif-yap`, {});
    assert.equal(red.statusCode, 403);
    assert.deepEqual(red.json(), { kod: 'YETKI_YOK', mesaj: ILETILER.bayrakliKisiYetkisiz });
    assert.equal((await kisi(await cerez('yonetici'), ikinci)).aktif, false);

    const kabul = await istek(await cerez('yonetici'), `/kisiler/${ikinci}/aktif-yap`, {});
    assert.equal(kabul.statusCode, 200, kabul.body);
    assert.equal(kabul.json().aktif, true);
  });

  test('sigorta: sayılan son bayraklı pasife alınamaz; ikinci bayraklı varken alınır', async () => {
    const ikinci = await yoneticiKisi('sigorta-ikinci');
    // ikinci pasif olur; kalan tek bayraklı (yonetici) artık aktör olarak ikinciyi değil kendisini taşır.
    await vt().tx((db) => kisiPasifeAl(db, adminId, ikinci));
    // Pasif bayraklı bir aktör (açık oturum gibi) son bayraklıyı pasife almaya kalkar.
    await assert.rejects(
      vt().tx((db) => kisiPasifeAl(db, ikinci, adminId)),
      hataGovdesi('GECERSIZ', ILETILER.sonBayrakli),
    );
    assert.equal((await kisi(await cerez('yonetici'), adminId)).aktif, true);
  });

  test('girişsiz bayraklı kişi sayıya girmez: son girişli bayraklı yine korunur', async () => {
    const yedek = await yoneticiKisi('sigorta-yedek');
    const girissizBayrakli = await girissiz();
    await vt().tx((db) => kisiPasifeAl(db, adminId, yedek));
    await vt().sorgu('INSERT INTO kisi_rolu (kisi_id, rol_id) VALUES ($1, $2)', [girissizBayrakli, await rolId('yonetici')]);
    await assert.rejects(
      vt().tx((db) => kisiPasifeAl(db, yedek, adminId)),
      hataGovdesi('GECERSIZ', ILETILER.sonBayrakli),
    );
  });

  test('hesap açma kisiler.rol-yonet ister; kişi girişli olur, rolü atanır, giriş yapabilir', async () => {
    await kullanici('ik-hesap', await rolId('insan_kaynaklari'));
    const hedef = await girissiz('Hesapsız');
    const operator = await rolId('operator');
    const govde = { kullaniciAdi: 'yeni.kisi', parola: PAROLA, rolId: operator };

    assert.equal((await app().inject({ method: 'POST', url: `/api/kisiler/${hedef}/hesap-ac`, payload: govde })).statusCode, 401);
    assert.equal((await istek(await cerez('ik-hesap'), `/kisiler/${hedef}/hesap-ac`, govde)).statusCode, 403);
    assert.equal((await kisi(await cerez('yonetici'), hedef)).girisVar, false);

    const yoneticiCerezi = await cerez('yonetici');
    const cevap = await istek(yoneticiCerezi, `/kisiler/${hedef}/hesap-ac`, { ...govde, kullaniciAdi: ' Yeni.Kisi ' });
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.equal(cevap.json().girisVar, true);
    assert.deepEqual(cevap.json().roller.map((r: { ad: string }) => r.ad), ['Operatör']);
    assert.equal(cevap.json().kullaniciAdi, 'yeni.kisi');
    assert.doesNotMatch(cevap.body, /parola|ozet/);

    const giris = await cerez('yeni.kisi');
    assert.equal((await istek(giris, '/oturum', undefined, 'GET')).json().kullanici?.id, hedef);
  });

  test('hesap açma reddi hiçbir şey yazmaz: var olan hesap, kullanılan ad, kısa parola, biçimsiz ad, olmayan kişi ve rol', async () => {
    const yoneticiCerezi = await cerez('yonetici');
    const operator = await rolId('operator');
    const hedef = await girissiz();
    const iyi = { kullaniciAdi: 'iyi.ad', parola: PAROLA, rolId: operator };
    const dene = (id: number, govde: object) => istek(yoneticiCerezi, `/kisiler/${id}/hesap-ac`, govde);

    const mevcut = await dene(adminId, iyi);
    assert.equal(mevcut.statusCode, 409);
    assert.deepEqual(mevcut.json(), { kod: 'CAKISMA', mesaj: ILETILER.girisVar });

    const kullanilan = await dene(hedef, { ...iyi, kullaniciAdi: 'yonetici' });
    assert.equal(kullanilan.statusCode, 409);
    assert.deepEqual(kullanilan.json(), { kod: 'CAKISMA', mesaj: ILETILER.kullaniciAdiVar });

    assert.equal((await dene(hedef, { ...iyi, parola: 'kisa' })).statusCode, 400);
    assert.equal((await dene(hedef, { ...iyi, kullaniciAdi: 'a b' })).statusCode, 400);
    assert.equal((await dene(999999, iyi)).statusCode, 404);
    assert.equal((await dene(hedef, { ...iyi, rolId: 999999 })).statusCode, 404);

    const durum = await kisi(yoneticiCerezi, hedef);
    assert.deepEqual([durum.girisVar, durum.roller], [false, []]);
    // Hiçbir red, hedef kişiyi yarım hesapla bırakmadı: doğru istek hâlâ geçer.
    assert.equal((await dene(hedef, iyi)).statusCode, 200);
  });

  test('bayraklı rolle hesap açmayı yalnız bayraklı kişi yapar', async () => {
    const rolYoneten = await rolAc('rol_yoneten', ['kisiler.rol-yonet', 'kisiler.oku']);
    await kullanici('rol-yoneten', rolYoneten);
    const hedef = await girissiz();
    const yonetici = await rolId('yonetici');
    const govde = { kullaniciAdi: 'yeni.yonetici', parola: PAROLA, rolId: yonetici };

    const red = await istek(await cerez('rol-yoneten'), `/kisiler/${hedef}/hesap-ac`, govde);
    assert.equal(red.statusCode, 403);
    assert.deepEqual(red.json(), { kod: 'YETKI_YOK', mesaj: ILETILER.bayrakliYetkisiz });
    assert.equal((await kisi(await cerez('yonetici'), hedef)).girisVar, false);

    assert.equal((await istek(await cerez('rol-yoneten'), `/kisiler/${hedef}/hesap-ac`, { ...govde, rolId: await rolId('operator') })).statusCode, 200);
    const baska = await girissiz();
    const baskaGovde = { ...govde, kullaniciAdi: 'baska.yonetici' };
    assert.equal((await istek(await cerez('yonetici'), `/kisiler/${baska}/hesap-ac`, baskaGovde)).statusCode, 200);
  });

  test('başkasının parolası kisiler.parola-degistir ister; yeni parola geçerli, eskisi geçersiz', async () => {
    await kullanici('ik-parola', await rolId('insan_kaynaklari'));
    const degistiren = await rolAc('parola_degistiren', ['kisiler.parola-degistir']);
    await kullanici('parola-degistiren', degistiren);
    const hedef = await kullanici('hedef-parola', await rolId('operator'));
    const yeni = 'yeni-parola-9';

    assert.equal((await app().inject({ method: 'POST', url: `/api/kisiler/${hedef}/parola-degistir`, payload: { yeniParola: yeni } })).statusCode, 401);
    assert.equal((await istek(await cerez('ik-parola'), `/kisiler/${hedef}/parola-degistir`, { yeniParola: yeni })).statusCode, 403);
    await cerez('hedef-parola');

    const cevap = await istek(await cerez('parola-degistiren'), `/kisiler/${hedef}/parola-degistir`, { yeniParola: yeni });
    assert.equal(cevap.statusCode, 200, cevap.body);
    await cerez('hedef-parola', yeni);

    const kisa = await istek(await cerez('parola-degistiren'), `/kisiler/${hedef}/parola-degistir`, { yeniParola: 'kisa' });
    assert.equal(kisa.statusCode, 400);
    await cerez('hedef-parola', yeni);
    assert.equal(await girisDurumu('hedef-parola', PAROLA), 401);
  });

  test('bayraklı kişinin parolasını yalnız bayraklı başka kişi değiştirir; kendi parolası bu yoldan değişmez; girişsizde olmaz', async () => {
    const degistiren = await rolAc('parola_degistiren2', ['kisiler.parola-degistir']);
    await kullanici('parola-degistiren2', degistiren);
    const ikinci = await yoneticiKisi('parola-ikinci-yonetici');
    const yeni = 'yeni-parola-9';

    const red = await istek(await cerez('parola-degistiren2'), `/kisiler/${adminId}/parola-degistir`, { yeniParola: yeni });
    assert.equal(red.statusCode, 403);
    assert.deepEqual(red.json(), { kod: 'YETKI_YOK', mesaj: ILETILER.bayrakliKisiYetkisiz });
    await cerez('yonetici');

    const kabul = await istek(await cerez('parola-ikinci-yonetici'), `/kisiler/${adminId}/parola-degistir`, { yeniParola: yeni });
    assert.equal(kabul.statusCode, 200, kabul.body);
    await cerez('yonetici', yeni);

    const kendi = await istek(await cerez('parola-ikinci-yonetici'), `/kisiler/${ikinci}/parola-degistir`, { yeniParola: yeni });
    assert.equal(kendi.statusCode, 422);
    assert.deepEqual(kendi.json(), { kod: 'GECERSIZ', mesaj: ILETILER.kendiParolaYolu });
    await cerez('parola-ikinci-yonetici');

    const hedef = await girissiz();
    const yok = await istek(await cerez('parola-ikinci-yonetici'), `/kisiler/${hedef}/parola-degistir`, { yeniParola: yeni });
    assert.equal(yok.statusCode, 422);
    assert.deepEqual(yok.json(), { kod: 'GECERSIZ', mesaj: ILETILER.girisYok });
    assert.equal((await istek(await cerez('parola-ikinci-yonetici'), '/kisiler/999999/parola-degistir', { yeniParola: yeni })).statusCode, 404);
  });

  test('şema: sicil ve görev boş, boşluklu ya da sınırı aşan değer taşıyamaz; sınırda kabul; aynı sicil ikinci kişiye yazılamaz', async () => {
    const ekle = (sicil: string | null, gorev: string | null) =>
      vt().sorgu('INSERT INTO kisi (ad, sicil_no, gorev) VALUES ($1, $2, $3)', ['Şema Kişi', sicil, gorev]);
    await ekle('s'.repeat(SICIL_EN_FAZLA), 'g'.repeat(GOREV_EN_FAZLA));
    await ekle(null, null);
    await ekle(null, null);
    for (const [sicil, gorev] of [['', null], [' x', null], ['s'.repeat(SICIL_EN_FAZLA + 1), null], [null, ''], [null, 'g '], [null, 'g'.repeat(GOREV_EN_FAZLA + 1)]] as const) {
      await assert.rejects(ekle(sicil, gorev), (hata: unknown) => (hata as { code?: string }).code === '23514', `${String(sicil)}|${String(gorev)}`);
    }
    await assert.rejects(ekle('s'.repeat(SICIL_EN_FAZLA), null), (hata: unknown) => (hata as { code?: string }).code === '23505');
  });

  test('başkası parolayı değiştirince hedefin açık oturumları geçersiz olur', async () => {
    const degistiren = await rolAc('parola_degistiren3', ['kisiler.parola-degistir']);
    await kullanici('parola-degistiren3', degistiren);
    await kullanici('oturumlu-hedef', await rolId('planlama_proje'));
    const birinci = await cerez('oturumlu-hedef');
    const ikinci = await cerez('oturumlu-hedef');
    assert.equal((await istek(birinci, '/kisiler', undefined, 'GET')).statusCode, 200);
    assert.equal((await istek(ikinci, '/kisiler', undefined, 'GET')).statusCode, 200);

    const hedef = (await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'oturumlu-hedef'"))?.id;
    const cevap = await istek(await cerez('parola-degistiren3'), `/kisiler/${hedef}/parola-degistir`, { yeniParola: 'yeni-parola-9' });
    assert.equal(cevap.statusCode, 200, cevap.body);

    assert.equal((await istek(birinci, '/kisiler', undefined, 'GET')).statusCode, 401);
    assert.equal((await istek(ikinci, '/kisiler', undefined, 'GET')).statusCode, 401);
    // Parolayı değiştiren kendi oturumunu yitirmez.
    assert.equal((await istek(await cerez('parola-degistiren3'), '/oturum', undefined, 'GET')).statusCode, 200);
  });

  test('KS-2: aynı istek kimliğiyle ikinci kişi ekleme ikinci kişi açmaz, aynı cevabı döner; farklı kimlik ikinci kişiyi açar', async () => {
    const yoneticiCerezi = await cerez('yonetici');
    const gonder = (kimlik: string) =>
      app().inject({ method: 'POST', url: '/api/kisiler', headers: { cookie: yoneticiCerezi, 'istek-kimligi': kimlik }, payload: { ad: 'Tekrar Kişi' } });
    const sayi = async (): Promise<number> => (await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM kisi WHERE ad = 'Tekrar Kişi'"))?.n ?? 0;

    const kimlik = randomUUID();
    const ilk = await gonder(kimlik);
    assert.equal(ilk.statusCode, 200, ilk.body);
    const ikinci = await gonder(kimlik);
    assert.equal(ikinci.statusCode, 200, ikinci.body);
    assert.equal(ikinci.json().id, ilk.json().id);
    assert.equal(await sayi(), 1);

    assert.equal((await gonder(randomUUID())).statusCode, 200);
    assert.equal(await sayi(), 2);
    const kimliksiz = await app().inject({ method: 'POST', url: '/api/kisiler', headers: { cookie: yoneticiCerezi }, payload: { ad: 'Tekrar Kişi' } });
    assert.equal(kimliksiz.statusCode, 400);
    assert.equal(await sayi(), 2);
  });

  test('KS-1: kişi komutları beklenen sürümü taşır; eski sürüm 409 ve kayıt değişmez, güncel sürüm 200 ve sürüm artar', async () => {
    const yoneticiCerezi = await cerez('yonetici');
    const operator = await rolId('operator');
    const surumu = async (id: number): Promise<number> => (await vt().tek<{ surum: number }>('SELECT surum FROM kisi WHERE id = $1', [id]))?.surum ?? 0;
    const durumu = (id: number) => vt().tek('SELECT ad, aktif, kullanici_adi, parola_ozeti FROM kisi WHERE id = $1', [id]);
    const hedef = await girissiz('Sürüm Hedef');
    const dene = async (uc: string, govde: Record<string, unknown>, cevaptaSurum: boolean): Promise<void> => {
      const once = await surumu(hedef);
      const oncekiDurum = await durumu(hedef);
      const eski = await istek(yoneticiCerezi, `/kisiler/${hedef}/${uc}`, { ...govde, surum: once - 1 });
      assert.equal(eski.statusCode, 409, `${uc}: ${eski.body}`);
      assert.equal(eski.json().ayrinti?.neden, 'eski-surum', uc);
      assert.deepEqual(await durumu(hedef), oncekiDurum, uc);
      assert.equal(await surumu(hedef), once, uc);

      const guncel = await istek(yoneticiCerezi, `/kisiler/${hedef}/${uc}`, { ...govde, surum: once });
      assert.equal(guncel.statusCode, 200, `${uc}: ${guncel.body}`);
      assert.equal(await surumu(hedef), once + 1, uc);
      if (cevaptaSurum) assert.equal(guncel.json().surum, once + 1, uc);
    };

    // Sürüm 1'den küçük sürüm şemada geçersizdir; eski sürüm sınanabilsin diye önce bir kez değiştirilir.
    assert.equal((await istek(yoneticiCerezi, `/kisiler/${hedef}/duzenle`, { ad: 'Sürüm Hedef', surum: 1 })).statusCode, 200);
    await dene('duzenle', { ad: 'Sürüm Hedef 2' }, true);
    await dene('hesap-ac', { kullaniciAdi: 'surum.hedef', parola: PAROLA, rolId: operator }, true);
    await dene('parola-degistir', { yeniParola: 'yeni-parola-9' }, false);
    await dene('pasife-al', {}, true);
    await dene('aktif-yap', {}, true);

    const yok = await istek(yoneticiCerezi, '/kisiler/999999/duzenle', { ad: 'Yok', surum: 1 });
    assert.equal(yok.statusCode, 404, yok.body);
    const surumsuz = await app().inject({ method: 'POST', url: `/api/kisiler/${hedef}/pasife-al`, headers: { cookie: yoneticiCerezi }, payload: {} });
    assert.equal(surumsuz.statusCode, 400, surumsuz.body);
  });

  test('KS-1: aynı sürümle gelen iki eşzamanlı düzenlemeden biri 200, öteki 409 alır; son yazan kazanmaz', async () => {
    const yoneticiCerezi = await cerez('yonetici');
    const hedef = await girissiz('Eşzamanlı');
    const cevaplar = await Promise.all(
      ['Birinci', 'İkinci'].map((ad) => istek(yoneticiCerezi, `/kisiler/${hedef}/duzenle`, { ad, surum: 1 })),
    );
    assert.deepEqual(cevaplar.map((c) => c.statusCode).sort(), [200, 409]);
    const kazanan = cevaplar.find((c) => c.statusCode === 200)?.json().ad;
    const satir = await vt().tek<{ ad: string; surum: number }>('SELECT ad, surum FROM kisi WHERE id = $1', [hedef]);
    assert.deepEqual(satir, { ad: kazanan, surum: 2 });
  });

  test('KS-1: kişinin kendi parolasını değiştirmesi sürümü artırır; ekrandaki eski sürümle gelen komut 409 alır', async () => {
    const hedef = await kullanici('kendi-surum', await rolId('operator'));
    const surum = (await vt().tek<{ surum: number }>('SELECT surum FROM kisi WHERE id = $1', [hedef]))?.surum ?? 0;
    const cevap = await app().inject({
      method: 'POST', url: '/api/hesabim/parola-degistir', headers: { cookie: await cerez('kendi-surum') },
      payload: { eskiParola: PAROLA, yeniParola: 'yeni-parola-9' },
    });
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.equal((await vt().tek<{ surum: number }>('SELECT surum FROM kisi WHERE id = $1', [hedef]))?.surum, surum + 1);
    const eski = await istek(await cerez('yonetici'), `/kisiler/${hedef}/duzenle`, { ad: 'Eski Ekran', surum });
    assert.equal(eski.statusCode, 409, eski.body);
  });
});
