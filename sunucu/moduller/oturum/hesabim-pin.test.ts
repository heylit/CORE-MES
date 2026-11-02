import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import Fastify from 'fastify';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uclariKaydet } from '#cekirdek/uc.ts';
import { hataYonetiminiKur, uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from './disari.ts';
import { oturumUclari } from './uclar.ts';

const PAROLA = 'dogru-parola-1';
const GECICI = '482913';
const KENDI = '730514';
const YENI = '615203';
const YOL = '/api/hesabim/pin-degistir';

describe('kendi PIN\'ini değiştirme (gerçek PostgreSQL, gerçek giriş, saat elde)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let saatli: FastifyInstance;
  let saat = new Date();
  const ilerle = (sn: number): void => { saat = new Date(saat.getTime() + sn * 1000); };
  let yoneticiId = 0;
  let yoneticiCerezi = '';
  let sayac = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const cerezAl = (cevap: LightMyRequestResponse): string => String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  const rolId = async (kod: string): Promise<number> => {
    const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]);
    if (!rol) throw new Error(`rol yok: ${kod}`);
    return rol.id;
  };
  const giris = (kullaniciAdi: string, sir: { parola: string } | { pin: string }) =>
    saatli.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, ...sir } });

  // Her test kendi operatörünü kullanır: bekleme sayacı kullanıcı adına bağlıdır. Yönetici geçici PIN verir, kişi kendi PIN'ini
  // belirler; dönen çerez o PIN'le açılmış oturumdur.
  const pinliOperator = async (): Promise<{ id: number; ad: string; cerez: string }> => {
    const ad = `pinli-${++sayac}`;
    const yonetici = await rolId('yonetici');
    const operator = await rolId('operator');
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: ad, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, operator);
      await rolAl(db, yoneticiId, yeni, yonetici);
      return yeni;
    });
    const surum = (await vt().tek<{ surum: number }>('SELECT surum FROM kisi WHERE id = $1', [id]))?.surum ?? 1;
    const verildi = await app.inject({
      method: 'POST', url: `/api/kisiler/${id}/pin-ver`, headers: { cookie: yoneticiCerezi }, payload: { pin: GECICI, surum },
    });
    assert.equal(verildi.statusCode, 200, verildi.body);
    const belirlendi = await saatli.inject({
      method: 'POST', url: '/api/oturum/pin-belirle', payload: { kullaniciAdi: ad, geciciPin: GECICI, yeniPin: KENDI },
    });
    assert.equal(belirlendi.statusCode, 200, belirlendi.body);
    return { id, ad, cerez: cerezAl(belirlendi) };
  };
  const degistir = (cerez: string | null, eski: string, yeniPin: string) =>
    saatli.inject({
      method: 'POST', url: YOL, payload: { eski, yeniPin },
      ...(cerez === null ? {} : { headers: { cookie: cerez } }),
    });
  const acikMi = async (cerez: string): Promise<boolean> =>
    (await saatli.inject({ method: 'GET', url: '/api/oturum', headers: { cookie: cerez } })).json().kullanici !== null;

  before(async () => {
    ortam = await testVeritabaniKur('oturum_pin');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    saatli = Fastify();
    hataYonetiminiKur(saatli);
    uclariKaydet(saatli, oturumUclari(() => saat), { vt: ortam.vt, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    assert.equal(cevap.statusCode, 200, cevap.body);
    yoneticiCerezi = cerezAl(cevap);
  });
  after(async () => {
    await app?.close();
    await saatli?.close();
    await ortam?.kaldir();
  });

  test('ilk PIN belirleme değişiklik defterine kişinin kendisiyle yazılır, "Sistem" (boş kişi) değil', async () => {
    const { id } = await pinliOperator();
    const satirlar = await vt().sorgu<{ kisi_id: number | null; alanlar: Record<string, unknown> }>(
      "SELECT kisi_id, alanlar FROM denetim_degisiklik WHERE tablo = 'kisi' AND anahtar = jsonb_build_object('id', $1::int) ORDER BY id",
      [id],
    );
    const belirleme = satirlar.filter((s) => 'pin_belirlenecek' in s.alanlar).at(-1);
    assert.ok(belirleme, 'PIN belirleme satırı yok');
    assert.equal(belirleme.kisi_id, id);
  });

  test('oturum ister; eski PIN ile değişir, yalnız yeni PIN geçerli olur', async () => {
    const kisi = await pinliOperator();
    assert.equal((await degistir(null, KENDI, YENI)).statusCode, 401);

    const cevap = await degistir(kisi.cerez, KENDI, YENI);
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.deepEqual(cevap.json(), { tamam: true });
    assert.equal((await giris(kisi.ad, { pin: YENI })).statusCode, 200);
    assert.equal((await giris(kisi.ad, { pin: KENDI })).statusCode, 401);
  });

  test('denetim kaydına eski ve yeni PIN değeriyle girmez, alan adları kalır; parolayla değiştirmede parola da girmez', async () => {
    const kisi = await pinliOperator();
    assert.equal((await degistir(kisi.cerez, KENDI, YENI)).statusCode, 200);
    assert.equal((await degistir(kisi.cerez, PAROLA, '904417')).statusCode, 200);
    const kayitlar = await vt().sorgu<{ govde: unknown }>(
      "SELECT govde FROM denetim_kaydi WHERE yol = '/hesabim/pin-degistir' AND kisi_id = $1 ORDER BY id", [kisi.id],
    );
    assert.deepEqual(kayitlar.map((k) => k.govde), [{ eski: '[gizli]', yeniPin: '[gizli]' }, { eski: '[gizli]', yeniPin: '[gizli]' }]);
    const tumu = await vt().tek<{ metin: string }>('SELECT string_agg(govde::text, \' \') AS metin FROM denetim_kaydi');
    for (const sir of [KENDI, YENI, PAROLA, '904417']) assert.equal(tumu?.metin.includes(sir), false, `defterde düz değer: ${sir}`);
  });

  test('PIN\'ini unutan parolasıyla değiştirir; o anki oturum kalır, öbür oturumları kapanır', async () => {
    const kisi = await pinliOperator();
    const oteki = cerezAl(await giris(kisi.ad, { pin: KENDI }));
    assert.equal(await acikMi(oteki), true);

    assert.equal((await degistir(kisi.cerez, PAROLA, YENI)).statusCode, 200);
    assert.equal(await acikMi(kisi.cerez), true);
    assert.equal(await acikMi(oteki), false);
  });

  test('kural dışı ya da eskisiyle aynı yeni PIN reddedilir ve deneme sayılmaz', async () => {
    const kisi = await pinliOperator();
    const sirali = await degistir(kisi.cerez, KENDI, '123456');
    assert.equal(sirali.statusCode, 400);
    assert.equal(sirali.json().alan, 'yeniPin');
    const ayni = await degistir(kisi.cerez, KENDI, KENDI);
    assert.equal(ayni.statusCode, 400);
    assert.equal(ayni.json().alan, 'yeniPin');
    // Sayılsaydı burada bekleme dönerdi.
    assert.equal((await degistir(kisi.cerez, KENDI, YENI)).statusCode, 200);
  });

  test('yanlış eski girişteki beklemeyi başlatır: bekleme dolmadan doğru PIN de reddedilir, girişi de bekletir', async () => {
    const kisi = await pinliOperator();
    const yanlis = await degistir(kisi.cerez, '999111', YENI);
    assert.equal(yanlis.statusCode, 400);
    assert.equal(yanlis.json().alan, 'eski');

    const beklemede = await degistir(kisi.cerez, KENDI, YENI);
    assert.equal(beklemede.statusCode, 401);
    assert.equal(beklemede.json().mesaj, 'Çok sık deneme. 1 sn sonra yeniden deneyin.');
    assert.equal((await giris(kisi.ad, { pin: KENDI })).statusCode, 401);
    assert.equal(await acikMi(kisi.cerez), true, 'bekleme yanıtı oturumu bitirmemeli');

    ilerle(1);
    assert.equal((await degistir(kisi.cerez, KENDI, YENI)).statusCode, 200);
  });

  test('parolayla giren kişi PIN değiştiremez: PIN\'i olmayan ve bütün yetkili rol', async () => {
    const pinsiz = `pinsiz-${++sayac}`;
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: pinsiz, parola: PAROLA }));
    const pinsizCerez = cerezAl(await giris(pinsiz, { parola: PAROLA }));
    // Bu kişi yönetici rolündedir (bayraklı): parolayla girer.
    const bayrakli = await degistir(pinsizCerez, PAROLA, YENI);
    assert.equal(bayrakli.statusCode, 422);
    assert.match(bayrakli.json().mesaj, /parolayla girer/);

    const operator = `operator-${++sayac}`;
    const yonetici = await rolId('yonetici');
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: operator, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, await rolId('operator'));
      await rolAl(db, yoneticiId, yeni, yonetici);
    });
    const operatorCerez = cerezAl(await giris(operator, { parola: PAROLA }));
    const yok = await degistir(operatorCerez, PAROLA, YENI);
    assert.equal(yok.statusCode, 422);
    assert.match(yok.json().mesaj, /PIN yok/);
    // PIN'siz kişi kendine PIN koyamaz: giriş yöntemi parolada kalır.
    assert.equal((await giris(operator, { parola: PAROLA })).statusCode, 200);
  });
});
