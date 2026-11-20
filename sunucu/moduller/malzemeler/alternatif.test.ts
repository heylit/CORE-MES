import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { AlternatifTanimlariCevabi, GrupSinirlariCevabi, KartAlternatifleriCevabi, KartZarfiCevabi } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { alternatifDegerlendir, alternatifZarfiOku, esdegerGruplari, kartinAlternatifKartlari } from './disari.ts';

const PAROLA = 'dogru-parola-1';

// 3437-1: ikame ve alternatif tanımları ve kart zarfı (gerçek PostgreSQL, gerçek giriş).
describe('Malzemeler ikame ve alternatifler', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;
  let okuyucu = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerezi }, ...(govde === undefined ? {} : { payload: govde as object }) });
  async function tamam<T>(cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<T> {
    const c = await istek(cerezi, yontem, url, govde);
    assert.equal(c.statusCode, 200, `${yontem} ${url}: ${c.body}`);
    return c.json() as T;
  }
  async function ret(durum: number, kod: string, cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown) {
    const c = await istek(cerezi, yontem, url, govde);
    assert.deepEqual({ durum: c.statusCode, kod: c.json().kod }, { durum, kod }, `${yontem} ${url}: ${c.body}`);
    return c.json() as { alan?: string; ayrinti?: { neden?: string } };
  }
  const eskiSurumRet = async (cerezi: string, url: string, govde: unknown) =>
    assert.equal((await ret(409, 'CAKISMA', cerezi, 'POST', url, govde)).ayrinti?.neden, 'eski-surum');
  const rolId = async (kod: string): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
  async function girisYap(kullaniciAdi: string, rolKodu: string, aktor?: number): Promise<{ id: number; cerez: string }> {
    const yoneticiRolu = await rolId('yonetici');
    const hedefRol = await rolId(rolKodu);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      if (hedefRol !== yoneticiRolu && aktor !== undefined) {
        await rolAta(db, aktor, yeni, hedefRol);
        await rolAl(db, aktor, yeni, yoneticiRolu);
      }
      return yeni;
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return { id, cerez: String(c.headers['set-cookie']).split(';')[0] ?? '' };
  }

  let sira = 0;
  const kartAc = async (kayit: Record<string, unknown>, durum = 'aktif', tur = 'hammadde'): Promise<number> => {
    sira += 1;
    const kimlik = `alt-${String(sira)}`;
    return (await ortam!.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'HM-ALT-', $3, $4, $5, $6, $6) RETURNING no`,
      [kimlik, tur, sira, durum, JSON.stringify({ id: kimlik, com: { ad: `Örnek ${kimlik}`, birim: 'adet' }, fam: 'metal', cls: 'aluminyum', ...kayit }), yoneticiId]))!.no;
  };
  const cubuk = (grade: string, d: number, durum = 'T6') => ({ grade, form: 'cubuk', dims: { d, l: 3000 }, opts: { durum, yuzey: 'Ham' } });
  const bosKural = { kaliteAcik: null, durumAcik: null, sartliAcik: null, boyUzunKesilir: null, yuzeySerbest: null, payTuru: null, payDeger: null, payEnAzMm: null, kapali: null, gerekce: null };

  before(async () => {
    ortam = await testVeritabaniKur('malzemealternatif');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    const ilk = await girisYap('alt-yonetici', 'yonetici');
    yonetici = ilk.cerez;
    yoneticiId = ilk.id;
    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('alt_okuyucu', 'Okuyucu')");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'sayfa.malzemeler' FROM rol WHERE kod = 'alt_okuyucu'");
    okuyucu = (await girisYap('alt-okuyucu', 'alt_okuyucu', ilk.id)).cerez;
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('HM-ALT-', 0) ON CONFLICT (onek) DO NOTHING");
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('ALT-1: başlangıç muadilleri göçle gelir; okuyan okur, yazamaz; katalogda olmayan kapsam reddedilir; tanım yazan kural ekler, sürümle değiştirir ve kaldırır', async () => {
    const t = await tamam<AlternatifTanimlariCevabi>(okuyucu, 'GET', '/malzeme-alternatifleri');
    assert.ok(t.kaliteMuadilleri.some((m) => m.kalite === '6082' && m.muadil === '6061'), 'kalite muadili tohumu');
    assert.ok(t.durumMuadilleri.some((m) => m.durum === 'T6' && m.muadil === 'T651' && m.tur === 'ust'), 'durum muadili tohumu');
    const govde = { kapsamTuru: 'sinif', kapsam: 'metal/aluminyum', ...bosKural, payTuru: 'mm', payDeger: 5 };
    await ret(403, 'YETKI_YOK', okuyucu, 'POST', '/malzeme-alternatifleri/kurallar/kaydet', govde);
    // Katalogda geçmeyen kapsam (yanlış yazım) reddedilir; kart açılınca aynı kapsam kabul edilir.
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', '/malzeme-alternatifleri/kurallar/kaydet', govde)).alan, 'kapsam');
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', '/malzeme-alternatifleri/kurallar/kaydet', { ...govde, kapsamTuru: 'kalite', kapsam: '6O82' })).alan, 'kapsam');
    await kartAc({ grade: '6082', form: 'lama', dims: { a: 40, b: 10, l: 3000 } });
    await tamam(yonetici, 'POST', '/malzeme-alternatifleri/kurallar/kaydet', { ...govde, kapsamTuru: 'kalite', kapsam: '6082' });
    await tamam(yonetici, 'POST', '/malzeme-alternatifleri/kurallar/kaydet', govde);
    assert.equal((await ret(409, 'CAKISMA', yonetici, 'POST', '/malzeme-alternatifleri/kurallar/kaydet', govde)).alan, 'kapsam');
    const kural = (await tamam<AlternatifTanimlariCevabi>(okuyucu, 'GET', '/malzeme-alternatifleri')).kurallar.find((r) => r.kapsam === 'metal/aluminyum')!;
    assert.deepEqual([kural.payTuru, kural.payDeger, kural.surum, kural.guncelleyen], ['mm', 5, 1, 'Deneme alt-yonetici']);
    await tamam(yonetici, 'POST', '/malzeme-alternatifleri/kurallar/kaydet', { ...govde, payDeger: 6, surum: 1 });
    await eskiSurumRet(yonetici, '/malzeme-alternatifleri/kurallar/kaydet', { ...govde, payDeger: 7, surum: 1 });
    await eskiSurumRet(yonetici, `/malzeme-alternatifleri/kurallar/${String(kural.id)}/kaldir`, { surum: 1 });
    await tamam(yonetici, 'POST', `/malzeme-alternatifleri/kurallar/${String(kural.id)}/kaldir`, { surum: 2 });
    const kalan = (await tamam<AlternatifTanimlariCevabi>(okuyucu, 'GET', '/malzeme-alternatifleri')).kurallar;
    assert.deepEqual(kalan.map((r) => r.kapsam), ['6082']);
    await tamam(yonetici, 'POST', `/malzeme-alternatifleri/kurallar/${String(kalan[0]!.id)}/kaldir`, { surum: 1 });
  });

  test('ALT-2: kapsam, pay ve kapatma gerekçesi doğrulanır; olmayan kart reddedilir', async () => {
    const yol = '/malzeme-alternatifleri/kurallar/kaydet';
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', yol, { kapsamTuru: 'sinif', kapsam: 'aluminyum', ...bosKural })).alan, 'kapsam');
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', yol, { kapsamTuru: 'aile', kapsam: 'metal', ...bosKural, payTuru: 'mm' })).alan, 'payDeger');
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', yol, { kapsamTuru: 'aile', kapsam: 'metal', ...bosKural, kapali: true })).alan, 'gerekce');
    await ret(404, 'BULUNAMADI', yonetici, 'POST', yol, { kapsamTuru: 'kart', kapsam: '999999', ...bosKural });
  });

  test('ALT-3: kart zarfı kurala göre hesaplanır, adaylar sonuçla döner; kapalı kartta yalnız aynısı girer', async () => {
    const ana = await kartAc(cubuk('6082', 50));
    const ayni = await kartAc(cubuk('6082', 50));
    const muadil = await kartAc(cubuk('6061', 53, 'T651'));
    const sartli = await kartAc(cubuk('6060', 50));
    await kartAc(cubuk('6082', 70));
    await kartAc(cubuk('6082', 50), 'taslak');
    await tamam(yonetici, 'POST', '/malzeme-alternatifleri/kurallar/kaydet', { kapsamTuru: 'sinif', kapsam: 'metal/aluminyum', ...bosKural, payTuru: 'mm', payDeger: 5 });
    const z = await tamam<KartZarfiCevabi>(okuyucu, 'GET', `/malzeme-alternatifleri/zarf/${String(ana)}`);
    assert.deepEqual(z.zarf?.olcu, [{ anahtar: 'd', istenen: 50, enAz: 50, enCok: 55, sinirKaynak: null }]);
    assert.deepEqual(z.zarf?.pay.kaynak, { kapsamTuru: 'sinif', kapsam: 'metal/aluminyum' });
    assert.deepEqual(z.kartlar.map((k) => [k.no, k.sonuc]), [[ayni, 'ayni'], [muadil, 'icinde']]);
    assert.ok(!z.kartlar.some((k) => k.no === sartli), 'şartlı muadil kural açmadan girmez');

    await tamam(yonetici, 'POST', '/malzeme-alternatifleri/kurallar/kaydet',
      { kapsamTuru: 'kart', kapsam: String(ana), ...bosKural, kapali: true, gerekce: 'Örnek müşteri şartı' });
    const kapali = await tamam<KartZarfiCevabi>(okuyucu, 'GET', `/malzeme-alternatifleri/zarf/${String(ana)}`);
    assert.deepEqual([kapali.zarf?.kapali, kapali.zarf?.gerekce], [true, 'Örnek müşteri şartı']);
    assert.deepEqual(kapali.kartlar.map((k) => k.no), [ayni]);
    const kurallar = (await tamam<AlternatifTanimlariCevabi>(okuyucu, 'GET', '/malzeme-alternatifleri')).kurallar;
    assert.match(kurallar.find((r) => r.kapsamTuru === 'kart')?.kapsamAdi ?? '', /^HM-ALT-\d{5} Örnek alt-/);

    // Kalitesi ve ölçüsü olsa da hammadde dışı kartta zarf hesaplanmaz (uç ve disari.ts).
    const sarf = await kartAc(cubuk('6082', 50), 'aktif', 'sarf');
    assert.equal((await tamam<KartZarfiCevabi>(okuyucu, 'GET', `/malzeme-alternatifleri/zarf/${String(sarf)}`)).zarf, null);
    assert.equal(await vt().tx((db) => alternatifZarfiOku(db, sarf)), null);
    await ret(404, 'BULUNAMADI', okuyucu, 'GET', '/malzeme-alternatifleri/zarf/999999');
    const d = await vt().tx((db) => alternatifDegerlendir(db, ana, { kalite: '6082', durum: 'T6', yuzey: 'Ham', form: 'cubuk', olcu: { d: 50, l: 3000 } }));
    assert.equal(d?.sonuc, 'ayni');
  });

  test('ALT-4: muadil ekle, değiştir, kaldır; kendisi ve tekrar reddedilir; okuyan yazamaz', async () => {
    const yol = '/malzeme-alternatifleri/durum-muadilleri';
    const g = { durum: 'H32', muadil: 'H34', tur: 'tam', notu: null };
    await ret(403, 'YETKI_YOK', okuyucu, 'POST', `${yol}/kaydet`, g);
    await tamam(yonetici, 'POST', `${yol}/kaydet`, g);
    assert.equal((await ret(409, 'CAKISMA', yonetici, 'POST', `${yol}/kaydet`, g)).alan, 'muadil');
    assert.equal((await ret(422, 'GECERSIZ', yonetici, 'POST', `${yol}/kaydet`, { ...g, muadil: 'H32' })).alan, 'muadil');
    await tamam(yonetici, 'POST', `${yol}/kaydet`, { ...g, tur: 'sartli', notu: 'Örnek not', surum: 1 });
    await eskiSurumRet(yonetici, `${yol}/kaydet`, { ...g, tur: 'ust', surum: 1 });
    await eskiSurumRet(yonetici, `${yol}/kaldir`, { durum: 'H32', muadil: 'H34', surum: 1 });
    await tamam(yonetici, 'POST', `${yol}/kaldir`, { durum: 'H32', muadil: 'H34', surum: 2 });
    await ret(404, 'BULUNAMADI', yonetici, 'POST', `${yol}/kaldir`, { durum: 'H32', muadil: 'H34', surum: 2 });
  });

  test('ALT-5 (3463-1): kartta kabul sınırı; liste ve aralık yazılır, zarfa ve ortak okumaya yansır, sürümle değişir ve kaldırılır', async () => {
    const ana = await kartAc(cubuk('5754', 40, 'H22'));
    const ayni = await kartAc(cubuk('5754', 40, 'H22'));
    const kucuk = await kartAc(cubuk('5754', 39, 'H22'));
    const baska = await kartAc(cubuk('1050', 40, 'H22'));
    const yol = '/malzeme-alternatifleri/siniri/kaydet';
    const olcu = { kapsamTuru: 'kart', kapsam: String(ana), nitelik: 'd', degerler: null, alt: 39, ust: 42 };
    await ret(403, 'YETKI_YOK', okuyucu, 'POST', yol, olcu);
    // Önce: 39 mm istenenden küçük, 1050 muadil listesinde yok.
    const once = await vt().tx((db) => kartinAlternatifKartlari(db, ana, { kullanimYeri: 'talep' }));
    assert.deepEqual(once.map((k) => [k.no, k.tur, k.sonuc]), [[ayni, 'alternatif', 'ayni']]);
    await tamam(yonetici, 'POST', yol, olcu);
    await tamam(yonetici, 'POST', yol, { kapsamTuru: 'kart', kapsam: String(ana), nitelik: 'kalite', degerler: [{ deger: '1050', tur: 'sartli' }], alt: null, ust: null });
    assert.equal((await ret(409, 'CAKISMA', yonetici, 'POST', yol, olcu)).alan, 'nitelik');
    const sonra = await vt().tx((db) => kartinAlternatifKartlari(db, ana, { kullanimYeri: 'talep' }));
    assert.deepEqual(sonra.map((k) => [k.no, k.sonuc]), [[ayni, 'ayni'], [kucuk, 'icinde'], [baska, 'sartli']]);
    const z = await tamam<KartZarfiCevabi>(okuyucu, 'GET', `/malzeme-alternatifleri/zarf/${String(ana)}`);
    assert.deepEqual(z.zarf?.olcu, [{ anahtar: 'd', istenen: 40, enAz: 39, enCok: 42, sinirKaynak: { kapsamTuru: 'kart', kapsam: String(ana) } }]);
    assert.equal(z.zarf?.kalite.sinir, true);
    const b = await tamam<KartAlternatifleriCevabi>(okuyucu, 'GET', `/malzeme-alternatifleri/kart/${String(ana)}`);
    assert.deepEqual(b.siniri.map((x) => [x.nitelik, x.alt, x.ust, x.surum]), [['kalite', null, null, 1], ['d', 39, 42, 1]]);
    // Biçim hataları ve sürüm.
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', yol, { ...olcu, nitelik: 'l', alt: 5, ust: 4 })).alan, 'alt');
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', yol, { ...olcu, nitelik: 'durum', alt: null, ust: null })).alan, 'degerler');
    await ret(404, 'BULUNAMADI', yonetici, 'POST', yol, { ...olcu, kapsam: '999999' });
    await tamam(yonetici, 'POST', yol, { ...olcu, ust: 41, surum: 1 });
    await eskiSurumRet(yonetici, yol, { ...olcu, ust: 43, surum: 1 });
    const d = b.siniri.find((x) => x.nitelik === 'd')!;
    await eskiSurumRet(yonetici, `/malzeme-alternatifleri/siniri/${String(d.id)}/kaldir`, { surum: 1 });
    for (const x of (await tamam<KartAlternatifleriCevabi>(okuyucu, 'GET', `/malzeme-alternatifleri/kart/${String(ana)}`)).siniri) {
      await tamam(yonetici, 'POST', `/malzeme-alternatifleri/siniri/${String(x.id)}/kaldir`, { surum: x.surum });
    }
    assert.deepEqual(await vt().tx((db) => kartinAlternatifKartlari(db, ana, { kullanimYeri: 'talep' })), once);
  });

  test('ALT-7 (3463-1b): grup şablonu; kalite sınırı o kalitedeki kartlara geçer, kart sınırı ezer, liste yalnız grup sınırlarını verir', async () => {
    const ana = await kartAc(cubuk('6063', 20, 'T5'));
    const yol = '/malzeme-alternatifleri/siniri/kaydet';
    const grup = { kapsamTuru: 'kalite', kapsam: '6063', nitelik: 'd', degerler: null, alt: 19, ust: 23 };
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', yol, { ...grup, kapsam: 'ORN-YOK' })).alan, 'kapsam');
    await tamam(yonetici, 'POST', yol, grup);
    const z = async () => (await tamam<KartZarfiCevabi>(okuyucu, 'GET', `/malzeme-alternatifleri/zarf/${String(ana)}`)).zarf?.olcu[0];
    assert.deepEqual(await z(), { anahtar: 'd', istenen: 20, enAz: 19, enCok: 23, sinirKaynak: { kapsamTuru: 'kalite', kapsam: '6063' } });
    await tamam(yonetici, 'POST', yol, { ...grup, kapsamTuru: 'kart', kapsam: String(ana), alt: 20, ust: 21 });
    assert.deepEqual(await z(), { anahtar: 'd', istenen: 20, enAz: 20, enCok: 21, sinirKaynak: { kapsamTuru: 'kart', kapsam: String(ana) } });
    const liste = (await tamam<GrupSinirlariCevabi>(okuyucu, 'GET', '/malzeme-alternatifleri/siniri')).siniri;
    assert.deepEqual(liste.map((x) => [x.kapsamTuru, x.kapsam, x.nitelik, x.alt, x.ust]), [['kalite', '6063', 'd', 19, 23]]);
    for (const x of [...liste, ...(await tamam<KartAlternatifleriCevabi>(okuyucu, 'GET', `/malzeme-alternatifleri/kart/${String(ana)}`)).siniri]) {
      await tamam(yonetici, 'POST', `/malzeme-alternatifleri/siniri/${String(x.id)}/kaldir`, { surum: x.surum });
    }
    assert.equal((await z())?.sinirKaynak, null);
  });

  test('ALT-6 (3463-1): eşdeğer kart; aynı tür, form, ölçü alanı ve birimde bağlanır, ortak okumada önce gelir, kaldırılınca grup çözülür', async () => {
    const a = await kartAc(cubuk('2017A', 30));
    const b = await kartAc(cubuk('2017A', 30));
    const c = await kartAc({ ...cubuk('2017A', 30), dims: { d: 30, l: 2500 } });
    const lama = await kartAc({ grade: '2017A', form: 'lama', dims: { a: 30, b: 10, l: 3000 } });
    const kg = await kartAc({ ...cubuk('2017A', 30), com: { ad: 'Örnek kg', birim: 'kg' } });
    const yol = '/malzeme-alternatifleri/esdeger/bagla';
    await ret(403, 'YETKI_YOK', okuyucu, 'POST', yol, { kartNo: a, esdegerNo: b });
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', yol, { kartNo: a, esdegerNo: a })).alan, 'esdegerNo');
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', yol, { kartNo: a, esdegerNo: lama })).alan, 'esdegerNo');
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', yol, { kartNo: a, esdegerNo: kg })).alan, 'esdegerNo');
    const birimsiz1 = await kartAc({ ...cubuk('2017A', 30), com: { ad: 'Örnek birimsiz 1', birim: null } });
    const birimsiz2 = await kartAc({ ...cubuk('2017A', 30), com: { ad: 'Örnek birimsiz 2', birim: null } });
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', yol, { kartNo: birimsiz1, esdegerNo: birimsiz2 })).alan, 'esdegerNo');
    await tamam(yonetici, 'POST', yol, { kartNo: a, esdegerNo: b });
    await tamam(yonetici, 'POST', yol, { kartNo: b, esdegerNo: c });
    assert.equal((await ret(400, 'DOGRULAMA', yonetici, 'POST', yol, { kartNo: c, esdegerNo: a })).alan, 'esdegerNo');
    const grup = async (no: number) => (await tamam<KartAlternatifleriCevabi>(okuyucu, 'GET', `/malzeme-alternatifleri/kart/${String(no)}`)).esdegerler.map((e) => e.no);
    assert.deepEqual([await grup(a), await grup(b), await grup(c)], [[b, c], [a, c], [a, b]]);
    // 3463-1b: plan ve stok grubu bu okumayla alır; grupta olmayan kart haritada yoktur.
    const gruplar = await vt().tx((db) => esdegerGruplari(db, [a, lama]));
    assert.deepEqual([...gruplar], [[a, [a, b, c].sort((x, y) => x - y)]]);
    const okuma = await vt().tx((db) => kartinAlternatifKartlari(db, a, { kullanimYeri: 'satin_alma' }));
    assert.deepEqual(okuma.filter((k) => k.tur === 'esdeger').map((k) => [k.no, k.sonuc]), [[b, 'ayni'], [c, 'ayni']]);
    assert.ok(!okuma.some((k) => k.tur === 'alternatif' && (k.no === b || k.no === c)), 'eşdeğer alternatif listesinde tekrar etmez');
    // Grubu kuran çıkarsa grup kalanlarla sürer; tek kalan grup çözülür.
    await tamam(yonetici, 'POST', '/malzeme-alternatifleri/esdeger/kaldir', { kartNo: a });
    assert.deepEqual([await grup(a), await grup(b), await grup(c)], [[], [c], [b]]);
    // Grup numarası kalanların en küçüğüne geçer; ayrılan kurucu yeni bağda eski grubun kalanlarıyla birleşmez.
    const numara = async (no: number) => (await vt().tek<{ grup: number }>('SELECT grup FROM malzeme_esdeger_bagi WHERE kart_no = $1', [no]))?.grup ?? null;
    assert.deepEqual([await numara(a), await numara(b), await numara(c)], [null, Math.min(b, c), Math.min(b, c)]);
    const d = await kartAc(cubuk('2017A', 30));
    await tamam(yonetici, 'POST', yol, { kartNo: a, esdegerNo: d });
    assert.deepEqual([await grup(a), await grup(b)], [[d], [c]]);
    await tamam(yonetici, 'POST', '/malzeme-alternatifleri/esdeger/kaldir', { kartNo: d });
    await tamam(yonetici, 'POST', '/malzeme-alternatifleri/esdeger/kaldir', { kartNo: c });
    assert.deepEqual(await grup(b), []);
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM malzeme_esdeger_bagi WHERE grup IN ($1, $2, $3)', [a, b, c]))!.n, 0);
    await ret(404, 'BULUNAMADI', yonetici, 'POST', '/malzeme-alternatifleri/esdeger/kaldir', { kartNo: b });
  });
});
