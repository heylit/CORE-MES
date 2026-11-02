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
import { HESAP_KILIDI_DK, HESAP_KILIDI_ESIGI } from './kurallar.ts';
import { oturumUclari } from './uclar.ts';

const PAROLA = 'dogru-parola-1';
const GECICI = '482913';
const KENDI = '730514';
const HATALI_ILETI = 'Kullanıcı adı, PIN ya da parola hatalı.';
const kilitIletisi = (dk: number): string => `Çok sayıda hatalı deneme. Giriş ${dk} dk sonra yeniden denenebilir.`;

describe('hesap kilidi (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  // Kilidin süresi saat ilerletilerek sınanır; gerçek saat beklenmez.
  let saatliApp: FastifyInstance;
  let saat = new Date();
  const ilerle = (sn: number): void => { saat = new Date(saat.getTime() + sn * 1000); };
  let yoneticiId = 0;
  let yoneticiCerezi = '';
  let sayac = 0;
  let ipSayaci = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const sahip = (): TestVeritabani['sahip'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı.');
    return ortam.sahip;
  };
  // Her deneme ayrı cihazdan: cihaz başına bekleme seriyi durdurmasın, kilit cihazdan bağımsız sayılsın.
  const yeniIp = (): string => { ipSayaci += 1; return `10.9.${ipSayaci >> 8}.${ipSayaci & 255}`; };
  const cerezAl = (cevap: LightMyRequestResponse): string => String(cevap.headers['set-cookie'] ?? '').split(';')[0] ?? '';
  const rolId = async (kod: string): Promise<number> => {
    const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]);
    if (!rol) throw new Error(`rol yok: ${kod}`);
    return rol.id;
  };
  const operatorEkle = async (): Promise<{ id: number; ad: string }> => {
    const ad = `kilitli-${++sayac}`;
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
  const giris = (kullaniciAdi: string, sir: { parola: string } | { pin: string }, ip = yeniIp(), uygulama = app) =>
    uygulama.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, ...sir }, remoteAddress: ip });
  const pinVer = async (kisiId: number, pin: string): Promise<void> => {
    const satir = await vt().tek<{ surum: number }>('SELECT surum FROM kisi WHERE id = $1', [kisiId]);
    const cevap = await app.inject({
      method: 'POST', url: `/api/kisiler/${kisiId}/pin-ver`, headers: { cookie: yoneticiCerezi }, payload: { pin, surum: satir?.surum ?? 1 },
    });
    assert.equal(cevap.statusCode, 200, cevap.body);
  };
  const pinBelirle = (kullaniciAdi: string, geciciPin: string, yeniPin: string) =>
    app.inject({ method: 'POST', url: '/api/oturum/pin-belirle', payload: { kullaniciAdi, geciciPin, yeniPin }, remoteAddress: yeniIp() });
  // Kişi kendi PIN'ini belirlemiş, PIN ile girebilir.
  const pinliOperator = async (): Promise<{ id: number; ad: string }> => {
    const kisi = await operatorEkle();
    await pinVer(kisi.id, GECICI);
    assert.equal((await pinBelirle(kisi.ad, GECICI, KENDI)).statusCode, 200);
    return kisi;
  };
  const hataliSeri = async (kullaniciAdi: string, kez: number, uygulama = app): Promise<void> => {
    for (let i = 0; i < kez; i += 1) {
      const cevap = await giris(kullaniciAdi, { pin: '000000' }, yeniIp(), uygulama);
      assert.equal(cevap.statusCode, 401);
      assert.equal(cevap.json().mesaj, HATALI_ILETI, `deneme ${i + 1}`);
    }
  };
  const denemeSayisi = async (kullaniciAdi: string): Promise<number> =>
    (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM giris_denemesi WHERE kullanici_adi = $1', [kullaniciAdi]))?.n ?? 0;
  const kilitler = (cerez: string) => app.inject({ method: 'GET', url: '/api/guvenlik/kilitler', headers: { cookie: cerez } });
  const kilitAc = (cerez: string, id: number) =>
    app.inject({ method: 'POST', url: `/api/guvenlik/kilitler/${id}/ac`, headers: { cookie: cerez } });
  const kilitKimligi = async (kullaniciAdi: string): Promise<number> => {
    const satir = await vt().tek<{ id: number }>('SELECT id FROM oturum_hesap_kilidi WHERE kullanici_adi = $1 ORDER BY id DESC LIMIT 1', [kullaniciAdi]);
    if (!satir) throw new Error(`kilit yok: ${kullaniciAdi}`);
    return satir.id;
  };

  before(async () => {
    ortam = await testVeritabaniKur('oturum_kilit');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const cevap = await giris('yonetici', { parola: PAROLA });
    assert.equal(cevap.statusCode, 200, cevap.body);
    yoneticiCerezi = cerezAl(cevap);
    saatliApp = Fastify();
    hataYonetiminiKur(saatliApp);
    uclariKaydet(saatliApp, oturumUclari(() => saat), { vt: ortam.vt, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
  });
  after(async () => {
    await app?.close();
    await ortam?.kaldir();
  });

  test('eşik 10 hatalı deneme, süre 15 dk', () => {
    assert.equal(HESAP_KILIDI_ESIGI, 10);
    assert.equal(HESAP_KILIDI_DK, 15);
  });

  test('ayrı cihazlardan 9 hatalı deneme kilitlemez; 10. denemeden sonra doğru PIN de sırra bakılmadan reddedilir ve kaydedilmez', async () => {
    const kisi = await pinliOperator();
    await hataliSeri(kisi.ad, 9);
    assert.equal(await vt().tek('SELECT 1 FROM oturum_hesap_kilidi WHERE kullanici_adi = $1', [kisi.ad]), null);
    // Dokuzuncudan sonra doğru PIN girer ve seriyi sıfırlar.
    assert.equal((await giris(kisi.ad, { pin: KENDI })).statusCode, 200);

    await hataliSeri(kisi.ad, 9);
    assert.equal((await giris(kisi.ad, { pin: KENDI })).statusCode, 200, 'başarı seriyi sıfırlamalı');
    await hataliSeri(kisi.ad, 10);
    const once = await denemeSayisi(kisi.ad);
    const kilitli = await giris(kisi.ad, { pin: KENDI });
    assert.equal(kilitli.statusCode, 401);
    assert.deepEqual(kilitli.json(), { kod: 'OTURUM_YOK', mesaj: kilitIletisi(15) });
    assert.equal(kilitli.headers['set-cookie'], undefined);
    assert.equal((await giris(kisi.ad, { parola: PAROLA })).json().mesaj, kilitIletisi(15));
    assert.equal(await denemeSayisi(kisi.ad), once, 'kilitliyken deneme kaydedilmez');
  });

  test('kilit olmayan adın cevabıyla aynıdır: hesabın varlığını ele vermez', async () => {
    const kisi = await pinliOperator();
    const olmayan = `hic-olmayan-${sayac}`;
    await hataliSeri(kisi.ad, 10);
    await hataliSeri(olmayan, 10);
    const var_ = await giris(kisi.ad, { pin: KENDI });
    const yok = await giris(olmayan, { pin: KENDI });
    assert.deepEqual(var_.json(), { kod: 'OTURUM_YOK', mesaj: kilitIletisi(15) });
    assert.deepEqual({ durum: yok.statusCode, govde: yok.json() }, { durum: var_.statusCode, govde: var_.json() });
  });

  test('kilitliyken doğru geçici PIN ile PIN belirleme ve doğru eski parolayla parola ve PIN değişimi reddedilir', async () => {
    const pinsiz = await operatorEkle();
    await pinVer(pinsiz.id, GECICI);
    await hataliSeri(pinsiz.ad, 10);
    const belirle = await pinBelirle(pinsiz.ad, GECICI, KENDI);
    assert.equal(belirle.statusCode, 401);
    assert.equal(belirle.json().mesaj, kilitIletisi(15));
    // Geçici PIN değişmedi: kilit açılınca hâlâ geçerli olmalı.
    await vt().sorgu('UPDATE oturum_hesap_kilidi SET acildi = now(), acan_kisi_id = $2 WHERE kullanici_adi = $1 AND acildi IS NULL', [pinsiz.ad, yoneticiId]);
    assert.equal((await pinBelirle(pinsiz.ad, GECICI, KENDI)).statusCode, 200);

    const parolali = await operatorEkle();
    const oturum = cerezAl(await giris(parolali.ad, { parola: PAROLA }));
    const parolaOzeti = async (): Promise<string | null> =>
      (await vt().tek<{ ozet: string | null }>('SELECT parola_ozeti AS ozet FROM kisi WHERE id = $1', [parolali.id]))?.ozet ?? null;
    const eskiOzet = await parolaOzeti();
    await hataliSeri(parolali.ad, 10);
    const degis = await app.inject({
      method: 'POST', url: '/api/hesabim/parola-degistir', headers: { cookie: oturum }, remoteAddress: yeniIp(),
      payload: { eskiParola: PAROLA, yeniParola: 'yeni-parola-9' },
    });
    assert.equal(degis.statusCode, 401);
    assert.equal(degis.json().mesaj, kilitIletisi(15));
    assert.equal(await parolaOzeti(), eskiOzet);

    const pinli = await pinliOperator();
    const pinOturumu = cerezAl(await giris(pinli.ad, { pin: KENDI }));
    await hataliSeri(pinli.ad, 10);
    const pinDegis = await app.inject({
      method: 'POST', url: '/api/hesabim/pin-degistir', headers: { cookie: pinOturumu }, remoteAddress: yeniIp(),
      payload: { eski: KENDI, yeniPin: '615283' },
    });
    assert.equal(pinDegis.statusCode, 401);
    assert.equal(pinDegis.json().mesaj, kilitIletisi(15));
    // PIN değişmedi: kilit açılınca eski PIN'le girilir.
    await vt().sorgu('UPDATE oturum_hesap_kilidi SET acildi = now(), acan_kisi_id = $2 WHERE kullanici_adi = $1 AND acildi IS NULL', [pinli.ad, yoneticiId]);
    assert.equal((await giris(pinli.ad, { pin: KENDI })).statusCode, 200);
  });

  test('kilit 15 dk sonra kendiliğinden biter; biten kilitten sonra seri baştan sayılır', async () => {
    const ad = `saatli-${++sayac}`;
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kişi', kullaniciAdi: ad, parola: PAROLA }));
    for (let i = 0; i < 10; i += 1) {
      const cevap = await giris(ad, { parola: 'yanlis-parola' }, yeniIp(), saatliApp);
      assert.equal(cevap.json().mesaj, HATALI_ILETI);
    }
    assert.equal((await giris(ad, { parola: PAROLA }, yeniIp(), saatliApp)).json().mesaj, kilitIletisi(15));
    ilerle(14 * 60);
    assert.equal((await giris(ad, { parola: PAROLA }, yeniIp(), saatliApp)).json().mesaj, kilitIletisi(1));
    ilerle(59);
    assert.equal((await giris(ad, { parola: PAROLA }, yeniIp(), saatliApp)).json().mesaj, kilitIletisi(1));
    ilerle(1);
    // Kilit biter; kilidin öncesindeki 10 hatalı deneme yeniden kilitlemez.
    assert.equal((await giris(ad, { parola: 'yanlis-parola' }, yeniIp(), saatliApp)).json().mesaj, HATALI_ILETI);
    assert.equal((await giris(ad, { parola: PAROLA }, yeniIp(), saatliApp)).statusCode, 200);
  });

  test('kilitler listesi ve açma yalnız Güvenlik Merkezi kapısından (guvenlik.yonet): operatöre 403 ve kilit kalır; yönetici açar, açan ve an sunucudan yazılır, ikinci açma 404; oturum kapısı yoktur', async () => {
    const kisi = await pinliOperator();
    const baska = await operatorEkle();
    const baskaCerezi = cerezAl(await giris(baska.ad, { parola: PAROLA }));
    await hataliSeri(kisi.ad, 10);
    const id = await kilitKimligi(kisi.ad);

    assert.equal((await kilitler(baskaCerezi)).statusCode, 403);
    assert.equal((await kilitAc(baskaCerezi, id)).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: '/api/guvenlik/kilitler' })).statusCode, 401);
    // 17.10.2026 kararı: kilit tek işlemle açılır; eski oturum kapısı yöneticiye de kapalıdır.
    assert.equal((await app.inject({ method: 'GET', url: '/api/oturum/kilitler', headers: { cookie: yoneticiCerezi } })).statusCode, 404);
    assert.equal((await app.inject({ method: 'POST', url: `/api/oturum/kilitler/${id}/ac`, headers: { cookie: yoneticiCerezi } })).statusCode, 404);
    assert.equal((await giris(kisi.ad, { pin: KENDI })).json().mesaj, kilitIletisi(15));

    const liste = await kilitler(yoneticiCerezi);
    assert.equal(liste.statusCode, 200, liste.body);
    const satir = (liste.json().satirlar as { id: number; kullaniciAdi: string; kilitlendi: string; bitis: string }[]).find((s) => s.id === id);
    assert.equal(satir?.kullaniciAdi, kisi.ad);
    assert.equal(Date.parse(satir?.bitis ?? '') - Date.parse(satir?.kilitlendi ?? ''), 15 * 60 * 1000);

    const acildi = await kilitAc(yoneticiCerezi, id);
    assert.equal(acildi.statusCode, 200, acildi.body);
    assert.deepEqual(acildi.json(), { acilan: 1 });
    assert.deepEqual(
      await vt().sorgu('SELECT acan_kisi_id, acildi IS NOT NULL AS acik FROM oturum_hesap_kilidi WHERE id = $1', [id]),
      [{ acan_kisi_id: yoneticiId, acik: true }],
    );
    assert.equal(((await kilitler(yoneticiCerezi)).json().satirlar as { id: number }[]).some((s) => s.id === id), false);
    assert.equal((await giris(kisi.ad, { pin: KENDI })).statusCode, 200);
    assert.equal((await kilitAc(yoneticiCerezi, id)).statusCode, 404);
    assert.equal((await kilitAc(yoneticiCerezi, 999999)).statusCode, 404);
  });

  test('kilit kaydı silinmez, boşaltılmaz; yalnız bir kez açılır ve başka sütunu değişmez', async () => {
    const ad = `db-kilit-${++sayac}`;
    await hataliSeri(ad, 10);
    const id = await kilitKimligi(ad);
    const kural = /oturum_hesap_kilidi tablosunda kilit yalnız bir kez açılır/;
    await assert.rejects(vt().sorgu("UPDATE oturum_hesap_kilidi SET bitis = bitis + interval '1 day' WHERE id = $1", [id]), kural);
    await assert.rejects(vt().sorgu('UPDATE oturum_hesap_kilidi SET acildi = now() WHERE id = $1', [id]), /oturum_hesap_kilidi_acilis_butun/);
    await assert.rejects(vt().sorgu('DELETE FROM oturum_hesap_kilidi WHERE id = $1', [id]), /yalnız ekleme/);
    await assert.rejects(sahip().sorgu('TRUNCATE oturum_hesap_kilidi'), /yalnız ekleme/);
    await vt().sorgu('UPDATE oturum_hesap_kilidi SET acildi = now(), acan_kisi_id = $2 WHERE id = $1', [id, yoneticiId]);
    await assert.rejects(vt().sorgu('UPDATE oturum_hesap_kilidi SET acildi = now(), acan_kisi_id = $2 WHERE id = $1', [id, yoneticiId]), kural);
  });
});
