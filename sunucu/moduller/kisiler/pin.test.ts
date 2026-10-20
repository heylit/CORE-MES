import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { ILETILER } from './kurallar.ts';
import { rolAl, rolAta, yoneticiOlustur } from './servis.ts';

const PAROLA = 'dogru-parola-1';
const GECICI = '482913';
const KENDI = '730514';

describe('PIN ile giriş (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let yoneticiCerezi = '';
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const rolId = async (kod: string): Promise<number> => {
    const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]);
    if (!rol) throw new Error(`rol yok: ${kod}`);
    return rol.id;
  };
  // Her test kendi kişisini kullanır: giriş beklemesi kullanıcı adına bağlıdır.
  const operatorEkle = async (): Promise<{ id: number; ad: string }> => {
    const ad = `pinli-${++sayac}`;
    const yonetici = await rolId('yonetici');
    const operator = await rolId('operator');
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: ad, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, operator);
      await rolAl(db, yoneticiId, yeni, yonetici);
      return yeni;
    });
    return { id, ad };
  };
  const giris = (kullaniciAdi: string, sir: { parola: string } | { pin: string }) =>
    app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, ...sir } });
  const pinBelirle = (kullaniciAdi: string, geciciPin: string, yeniPin: string) =>
    app.inject({ method: 'POST', url: '/api/oturum/pin-belirle', payload: { kullaniciAdi, geciciPin, yeniPin } });
  const cerezAl = (cevap: LightMyRequestResponse): string => String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  const pinVer = async (cerezi: string, kisiId: number, pin: string): Promise<LightMyRequestResponse> => {
    const satir = await vt().tek<{ surum: number }>('SELECT surum FROM kisi WHERE id = $1', [kisiId]);
    return app.inject({
      method: 'POST', url: `/api/kisiler/${kisiId}/pin-ver`, headers: { cookie: cerezi }, payload: { pin, surum: satir?.surum ?? 1 },
    });
  };
  const oturumdaki = async (cerezi: string): Promise<unknown> =>
    (await app.inject({ method: 'GET', url: '/api/oturum', headers: { cookie: cerezi } })).json().kullanici;

  before(async () => {
    ortam = await testVeritabaniKur('kisiler_pin');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const cevap = await giris('yonetici', { parola: PAROLA });
    assert.equal(cevap.statusCode, 200, cevap.body);
    yoneticiCerezi = cerezAl(cevap);
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('PIN verilene dek kişi parolayla girer; PIN verilince açık oturumu kapanır ve listede PIN görünür', async () => {
    const kisi = await operatorEkle();
    const parolaIle = await giris(kisi.ad, { parola: PAROLA });
    assert.equal(parolaIle.statusCode, 200, parolaIle.body);
    const eskiOturum = cerezAl(parolaIle);

    const verildi = await pinVer(yoneticiCerezi, kisi.id, GECICI);
    assert.equal(verildi.statusCode, 200, verildi.body);
    assert.equal(await oturumdaki(eskiOturum), null);
    const liste = await app.inject({ method: 'GET', url: '/api/kisiler', headers: { cookie: yoneticiCerezi } });
    const satir = (liste.json().kisiler as { id: number; pinVar: boolean }[]).find((k) => k.id === kisi.id);
    assert.equal(satir?.pinVar, true);
    assert.doesNotMatch(liste.body, new RegExp(GECICI));
  });

  test('geçici PIN oturum açmaz; kişi kendi PIN\'ini belirleyince oturum açılır ve yalnız yeni PIN geçerli olur', async () => {
    const kisi = await operatorEkle();
    assert.equal((await pinVer(yoneticiCerezi, kisi.id, GECICI)).statusCode, 200);

    const gecici = await giris(kisi.ad, { pin: GECICI });
    assert.equal(gecici.statusCode, 200, gecici.body);
    assert.deepEqual(gecici.json(), { kullanici: null, pinBelirlenecek: true });
    assert.equal(gecici.headers['set-cookie'], undefined);

    // Yeni PIN'in kuralı geçici PIN'e bakılmadan sınanır ve deneme sayılmaz.
    const zayif = await pinBelirle(kisi.ad, GECICI, '123456');
    assert.equal(zayif.statusCode, 400);
    assert.equal(zayif.json().alan, 'yeniPin');
    const ayni = await pinBelirle(kisi.ad, GECICI, GECICI);
    assert.equal(ayni.statusCode, 400);
    assert.equal(ayni.json().mesaj, 'Yeni PIN geçici PIN ile aynı olamaz.');

    const belirlendi = await pinBelirle(kisi.ad, GECICI, KENDI);
    assert.equal(belirlendi.statusCode, 200, belirlendi.body);
    assert.equal(belirlendi.json().kullanici.id, kisi.id);
    assert.equal((await oturumdaki(cerezAl(belirlendi)) as { id: number } | null)?.id, kisi.id);

    const kendi = await giris(kisi.ad, { pin: KENDI });
    assert.equal(kendi.statusCode, 200, kendi.body);
    assert.equal(kendi.json().kullanici.id, kisi.id);
    assert.equal(kendi.json().pinBelirlenecek, undefined);

    // PIN'i olan kişinin parolası artık giriş açmaz.
    const parolaIle = await giris(kisi.ad, { parola: PAROLA });
    assert.equal(parolaIle.statusCode, 401);
    assert.equal(parolaIle.json().mesaj, 'Kullanıcı adı, PIN ya da parola hatalı.');
  });

  test('PIN belirleme yolu geçici PIN ister: kendi PIN\'iyle ya da yanlış PIN\'le gelen deneme hatalı sayılır ve bekletir', async () => {
    const kisi = await operatorEkle();
    assert.equal((await pinVer(yoneticiCerezi, kisi.id, GECICI)).statusCode, 200);
    assert.equal((await pinBelirle(kisi.ad, GECICI, KENDI)).statusCode, 200);

    const yeniden = await pinBelirle(kisi.ad, KENDI, '864209');
    assert.equal(yeniden.statusCode, 401);
    assert.equal(yeniden.json().mesaj, 'Kullanıcı adı ya da geçici PIN hatalı.');
    const beklemede = await giris(kisi.ad, { pin: KENDI });
    assert.equal(beklemede.statusCode, 401);
    assert.match(beklemede.json().mesaj, /^Çok sık deneme/);
  });

  test('yanlış PIN reddedilir ve beklemeyi başlatır', async () => {
    const kisi = await operatorEkle();
    assert.equal((await pinVer(yoneticiCerezi, kisi.id, GECICI)).statusCode, 200);
    const yanlis = await giris(kisi.ad, { pin: '864209' });
    assert.equal(yanlis.statusCode, 401);
    assert.equal(yanlis.json().mesaj, 'Kullanıcı adı, PIN ya da parola hatalı.');
    const beklemede = await giris(kisi.ad, { pin: GECICI });
    assert.equal(beklemede.statusCode, 401);
    assert.match(beklemede.json().mesaj, /^Çok sık deneme/);
  });

  test('bayraklı kişi PIN\'i olsa da yalnız parolayla girer', async () => {
    const kisi = await operatorEkle();
    assert.equal((await pinVer(yoneticiCerezi, kisi.id, GECICI)).statusCode, 200);
    await vt().tx(async (db) => { await rolAta(db, yoneticiId, kisi.id, await rolId('yonetici')); });

    const parolaIle = await giris(kisi.ad, { parola: PAROLA });
    assert.equal(parolaIle.statusCode, 200, parolaIle.body);
    const pinIle = await giris(kisi.ad, { pin: GECICI });
    assert.equal(pinIle.statusCode, 401);
  });

  test('sır kişinin yöntemi dışındaki alanda gelirse doğru olsa da reddedilir', async () => {
    const ad = `yonetici-${++sayac}`;
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici 3', kullaniciAdi: ad, parola: PAROLA }));
    const parolaPinAlaninda = await giris(ad, { pin: PAROLA });
    assert.equal(parolaPinAlaninda.statusCode, 401);
    assert.equal(parolaPinAlaninda.json().mesaj, 'Kullanıcı adı, PIN ya da parola hatalı.');

    const kisi = await operatorEkle();
    assert.equal((await pinVer(yoneticiCerezi, kisi.id, GECICI)).statusCode, 200);
    const pinParolaAlaninda = await giris(kisi.ad, { parola: GECICI });
    assert.equal(pinParolaAlaninda.statusCode, 401);
    assert.equal(pinParolaAlaninda.json().mesaj, 'Kullanıcı adı, PIN ya da parola hatalı.');
  });

  test('PIN kendine, bayraklı kişiye ve girişi olmayana verilmez; kurala uymayan PIN reddedilir', async () => {
    const baskaYonetici = await vt().tx((db) =>
      yoneticiOlustur(db, { ad: 'Deneme Yönetici 2', kullaniciAdi: `yonetici-${++sayac}`, parola: PAROLA }));
    const bayrakli = await pinVer(yoneticiCerezi, baskaYonetici, GECICI);
    assert.equal(bayrakli.statusCode, 422);
    assert.equal(bayrakli.json().mesaj, ILETILER.bayrakliPin);

    const kendine = await pinVer(yoneticiCerezi, yoneticiId, GECICI);
    assert.equal(kendine.statusCode, 422);
    assert.equal(kendine.json().mesaj, ILETILER.kendiPin);

    const girissiz = await vt().tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Girişsiz') RETURNING id");
    const yok = await pinVer(yoneticiCerezi, girissiz?.id ?? 0, GECICI);
    assert.equal(yok.statusCode, 422);
    assert.equal(yok.json().mesaj, ILETILER.girisYok);

    const kisi = await operatorEkle();
    for (const pin of ['111111', '12345', 'abcdef']) {
      const cevap = await pinVer(yoneticiCerezi, kisi.id, pin);
      assert.equal(cevap.statusCode, 400, pin);
      assert.equal(cevap.json().alan, 'pin', pin);
    }
    const satir = await vt().tek<{ pin_ozeti: string | null }>('SELECT pin_ozeti FROM kisi WHERE id = $1', [kisi.id]);
    assert.equal(satir?.pin_ozeti, null);
  });

  test('PIN vermek parola değiştirme işlemini ister', async () => {
    const yetkisiz = await operatorEkle();
    const hedef = await operatorEkle();
    const cerezi = cerezAl(await giris(yetkisiz.ad, { parola: PAROLA }));
    assert.equal((await pinVer(cerezi, hedef.id, GECICI)).statusCode, 403);
    assert.equal((await pinVer('', hedef.id, GECICI)).statusCode, 401);
  });

  test('girişte PIN ile parola birlikte ya da hiçbiri gönderilemez', async () => {
    const ikisi = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA, pin: GECICI } });
    assert.equal(ikisi.statusCode, 400);
    const hicbiri = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici' } });
    assert.equal(hicbiri.statusCode, 400);
  });

  test('göç kuralı: PIN girişi olan kişide durur; belirlenecek işareti PIN ister', async () => {
    await assert.rejects(vt().sorgu("INSERT INTO kisi (ad, pin_ozeti) VALUES ('Yarım', 'x')"), /kisi_pin_giris_ister/);
    await assert.rejects(
      vt().sorgu("INSERT INTO kisi (ad, pin_belirlenecek) VALUES ('Yarım', true)"),
      /kisi_pin_belirlenecek_pin_ister/,
    );
    const gecerli = await vt().tek<{ id: number }>("INSERT INTO kisi (ad) VALUES ('Tam') RETURNING id");
    assert.ok(gecerli);
  });
});
