import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { FirmaSecenekleriCevabi, KatalogKartiKaydetCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tamGovde } from './test-kart.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

describe('Tedarikçi Müşteriler ve Tedarikçiler firmasından seçilir (kart #466, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let yoneticiId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  // Tekrar korumalı uç (finans firma ekleme) kimliksiz isteği reddeder; her yazma kendi istek kimliğiyle gider.
  const istek = async (yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({
      method: yontem, url: `/api${url}`, ...(govde === undefined ? {} : { payload: (await surumlu(vt(), url, tamGovde(url, govde))) as object }),
      headers: yontem === 'POST' ? { cookie: yonetici, 'istek-kimligi': randomUUID() } : { cookie: yonetici },
    });
  async function tamam<T>(yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<T> {
    const c = await istek(yontem, url, govde);
    assert.equal(c.statusCode, 200, `${yontem} ${url}: ${c.body}`);
    return c.json() as T;
  }
  async function ret(durum: number, kod: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<string> {
    const c = await istek(yontem, url, govde);
    assert.deepEqual({ durum: c.statusCode, kod: c.json().kod }, { durum, kod }, `${yontem} ${url}: ${c.body}`);
    return String(c.json().mesaj);
  }
  const firmaAc = async (ad: string, tur: 'musteri' | 'tedarikci' | 'ikisi'): Promise<number> =>
    (await tamam<{ firma: { id: number } }>('POST', '/musteri-tedarikci/firmalar/ekle', { ad, tur })).firma.id;
  const kartGovdesi = (kimlik: string, com: Record<string, unknown>) => ({
    kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', com: { kod: 'HM-TDK-00001', birim: 'adet', ...com }, onay: { durum: 'aktif' } },
    ozet: { benzersiz_anahtar: `hammadde|tedarikci|${kimlik}`, mukerrer_gerekcesi: null },
    surum: null,
  });
  const pasifYap = async (id: number): Promise<void> => {
    const f = await tamam<{ firma: { surum: number } }>('GET', `/musteri-tedarikci/firmalar/${id}`);
    await tamam('POST', `/finans/firmalar/${id}/pasif`, { surum: f.firma.surum });
  };
  const kayitliCom = async (kimlik: string): Promise<Record<string, unknown>> =>
    (await vt().tek<{ com: Record<string, unknown> }>("SELECT kayit->'com' AS com FROM malzeme_katalog_karti WHERE kimlik = $1", [kimlik]))!.com;

  before(async () => {
    ortam = await testVeritabaniKur('malzemetedarikci');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme tedarikçi', kullaniciAdi: 'td-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'td-yonetici', parola: PAROLA } });
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
    await tamam('POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('arama: aktif tedarikçi firmalar adla bulunur; yalnız müşteri olan firma listede yok; tek harf 400', async () => {
    const tedarikci = await firmaAc('Deneme Tedarik Çelik', 'tedarikci');
    const ikisi = await firmaAc('Deneme Tedarik İkisi', 'ikisi');
    await firmaAc('Deneme Tedarik Müşteri', 'musteri');
    const c = await tamam<FirmaSecenekleriCevabi>('GET', `/malzeme-firma-secenekleri?ara=${encodeURIComponent('Deneme Tedarik')}`);
    assert.deepEqual(c.firmalar.map((f) => f.id).sort((a, b) => a - b), [tedarikci, ikisi].sort((a, b) => a - b));
    await ret(400, 'DOGRULAMA', 'GET', '/malzeme-firma-secenekleri?ara=D');
  });

  test('kayıt: finansta olan firmanın kimliği ve adı kartta kalır; olmayan kimlik 422, biçimsiz kimlik 400', async () => {
    const firma = await firmaAc('Deneme Kayıt Firma', 'tedarikci');
    await tamam<KatalogKartiKaydetCevabi>('POST', '/malzeme-katalogu-kartlari/td1/kaydet', kartGovdesi('td1', { ted: 'Deneme Kayıt Firma', tedId: firma }));
    assert.deepEqual([(await kayitliCom('td1'))['tedId'], (await kayitliCom('td1'))['ted']], [firma, 'Deneme Kayıt Firma']);
    assert.match(await ret(422, 'GECERSIZ', 'POST', '/malzeme-katalogu-kartlari/td2/kaydet', kartGovdesi('td2', { ted: 'Yok', tedId: 2147483000 })), /finansta bulunamadı/);
    await ret(400, 'DOGRULAMA', 'POST', '/malzeme-katalogu-kartlari/td3/kaydet', kartGovdesi('td3', { ted: 'Metin', tedId: '12' }));
    assert.equal(await vt().tek('SELECT 1 FROM malzeme_katalog_karti WHERE kimlik IN ($1, $2)', ['td2', 'td3']), null);
  });

  test('yeni bağ yalnız aktif tedarikçiye: müşteri ya da pasif firma 422; bağlı firma sonradan pasif olsa kart yeniden kaydolur', async () => {
    const musteri = await firmaAc('Deneme Yalnız Müşteri', 'musteri');
    assert.match(await ret(422, 'GECERSIZ', 'POST', '/malzeme-katalogu-kartlari/td5/kaydet', kartGovdesi('td5', { ted: 'Deneme Yalnız Müşteri', tedId: musteri })), /aktif bir tedarikçi firma değil/);
    const bagli = await firmaAc('Deneme Sonra Pasif', 'tedarikci');
    const r = await tamam<KatalogKartiKaydetCevabi>('POST', '/malzeme-katalogu-kartlari/td6/kaydet', kartGovdesi('td6', { ted: 'Deneme Sonra Pasif', tedId: bagli }));
    await pasifYap(bagli);
    await tamam('POST', '/malzeme-katalogu-kartlari/td6/kaydet', { ...kartGovdesi('td6', { ted: 'Deneme Sonra Pasif', tedId: bagli, not: 'yeniden' }), surum: r.surum });
    assert.match(await ret(422, 'GECERSIZ', 'POST', '/malzeme-katalogu-kartlari/td7/kaydet', kartGovdesi('td7', { ted: 'Deneme Sonra Pasif', tedId: bagli })), /aktif bir tedarikçi firma değil/);
  });

  test('değişiklik talebi: önerilen kartın tedarikçisi de aynı denetimden geçer; müşteri firması 422, tedarikçi firması kaydolur', async () => {
    const ilk = await firmaAc('Deneme Talep İlk', 'tedarikci');
    const diger = await firmaAc('Deneme Talep Diğer', 'tedarikci');
    const musteri = await firmaAc('Deneme Talep Müşteri', 'musteri');
    const r = await tamam<KatalogKartiKaydetCevabi>('POST', '/malzeme-katalogu-kartlari/td8/kaydet', kartGovdesi('td8', { ted: 'Deneme Talep İlk', tedId: ilk }));
    const kayit = (await vt().tek<{ kayit: Record<string, unknown> }>('SELECT kayit FROM malzeme_katalog_karti WHERE kimlik = $1', ['td8']))!.kayit;
    const talepli = (tedId: number) => ({
      ...kartGovdesi('td8', {}), surum: r.surum,
      kayit: { ...kayit, talep: { id: 't1', durum: 'beklemede', yeni: { ...kayit, com: { ...(kayit['com'] as object), tedId } }, by: 1, byAd: 'x', t: 7 } },
    });
    assert.match(await ret(422, 'GECERSIZ', 'POST', '/malzeme-katalogu-kartlari/td8/kaydet', talepli(musteri)), /aktif bir tedarikçi firma değil/);
    await tamam('POST', '/malzeme-katalogu-kartlari/td8/kaydet', talepli(diger));
  });

  test('yetki: kart yazma işlemi olmayan rol (operator) firma arayamaz, 403', async () => {
    const rolId = async (kod: string): Promise<number> => (await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [kod]))!.id;
    const [yoneticiRolu, operatorRolu] = [await rolId('yonetici'), await rolId('operator')];
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme td operatör', kullaniciAdi: 'td-operator', parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, operatorRolu);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu);
    });
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'td-operator', parola: PAROLA } });
    const cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    const c = await app.inject({ method: 'GET', url: '/api/malzeme-firma-secenekleri?ara=Deneme', headers: { cookie: cerez } });
    assert.equal(c.statusCode, 403, c.body);
  });

  test('312 b: kartın tedarikçi kimliği yabancı anahtarlı sütuna da yazılır; bağ kalkınca boşalır; firmada olmayan kimliği tablo almaz', async () => {
    const ilk = await firmaAc('Deneme Sütun İlk', 'tedarikci');
    const diger = await firmaAc('Deneme Sütun Diğer', 'tedarikci');
    const sutun = async (kimlik: string) =>
      (await vt().tek<{ id: number | null }>('SELECT tedarikci_firma_id AS id FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.id;
    const r1 = await tamam<KatalogKartiKaydetCevabi>('POST', '/malzeme-katalogu-kartlari/td9/kaydet', kartGovdesi('td9', { ted: 'Deneme Sütun İlk', tedId: ilk }));
    assert.equal(await sutun('td9'), ilk);
    const r2 = await tamam<KatalogKartiKaydetCevabi>('POST', '/malzeme-katalogu-kartlari/td9/kaydet', { ...kartGovdesi('td9', { ted: 'Deneme Sütun Diğer', tedId: diger }), surum: r1.surum });
    assert.equal(await sutun('td9'), diger);
    await tamam('POST', '/malzeme-katalogu-kartlari/td9/kaydet', { ...kartGovdesi('td9', { ted: 'Serbest metin' }), surum: r2.surum });
    assert.equal(await sutun('td9'), null);
    await tamam('POST', '/malzeme-katalogu-kartlari/td10/kaydet', kartGovdesi('td10', { ted: 'Yalnız metin' }));
    assert.equal(await sutun('td10'), null);
    await assert.rejects(
      vt().tx((db) => db.sorgu('UPDATE malzeme_katalog_karti SET tedarikci_firma_id = 2147483000 WHERE kimlik = $1', ['td10'])),
      (h: { constraint?: string }) => h.constraint === 'malzeme_katalog_karti_tedarikci_firma',
    );
  });

  test('eski kart: kimliksiz serbest tedarikçi metni olduğu gibi kaydolur', async () => {
    await tamam<KatalogKartiKaydetCevabi>('POST', '/malzeme-katalogu-kartlari/td4/kaydet', kartGovdesi('td4', { ted: 'Eski metin tedarikçi' }));
    const com = await kayitliCom('td4');
    assert.deepEqual([com['ted'], com['tedId']], ['Eski metin tedarikçi', undefined]);
  });
});
