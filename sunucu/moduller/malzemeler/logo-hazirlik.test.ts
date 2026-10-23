import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { KatalogKartiKaydetCevabi, LogoDurumuCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { logoBirimSetiKullaniliyorMu, logoyaGidecekMalzemeler, malzemeLogoSonucu } from './disari.ts';
import { tamGovde } from './test-kart.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

interface LogoSatiri {
  durum: string | null; kayit_no: string | null; zaman: boolean; hata: string | null; kart_turu: string | null; birim_seti: string | null;
}

describe('Logo\'ya gönderime hazırlık (kart #232, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let onayci = '';
  let onayci2 = '';
  let yazar = '';
  let okuyucu = '';
  let kisiId = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = async (cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerezi }, ...(govde === undefined ? {} : { payload: (await surumlu(vt(), url, tamGovde(url, govde))) as object }) });
  async function tamam<T>(cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<T> {
    const c = await istek(cerezi, yontem, url, govde);
    assert.equal(c.statusCode, 200, `${yontem} ${url}: ${c.body}`);
    return c.json() as T;
  }
  async function ret(durum: number, kod: string, cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<void> {
    const c = await istek(cerezi, yontem, url, govde);
    assert.deepEqual({ durum: c.statusCode, kod: c.json().kod }, { durum, kod }, `${yontem} ${url}: ${c.body}`);
  }
  async function hataKodu(is: (db: Db) => Promise<unknown>): Promise<string> {
    try {
      await vt().tx(is);
    } catch (h) {
      if (h instanceof UygulamaHatasi) return h.kod;
      throw h;
    }
    return 'HATA_YOK';
  }
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

  let sayac = 0;
  const kart = (ek: { tur?: string; kod?: string; birim?: string | null; ad?: string | null } = {}) => {
    const kimlik = `lg${++sayac}`;
    const tur = ek.tur ?? 'hammadde';
    const kod = ek.kod ?? 'HM-LGO-00001';
    const com: Record<string, unknown> = { kod };
    if (ek.ad !== null) com['ad'] = ek.ad ?? `Logo deneme ${kimlik}`;
    if (ek.birim !== null) com['birim'] = ek.birim ?? 'kg';
    return {
      kimlik,
      govde: (surum: number | null, durum: string, comEk: Record<string, unknown> = {}, disEk: Record<string, unknown> = {}) => ({
        kayit: { id: kimlik, tur, fam: 'metal', com: { ...com, ...comEk }, onay: { durum }, ...disEk },
        ozet: { benzersiz_anahtar: `${tur}|metal|${kimlik}`, mukerrer_gerekcesi: null },
        surum,
      }),
    };
  };
  type Kart = ReturnType<typeof kart>;
  const kaydet = (cerezi: string, k: Kart, surum: number | null, durum: string, comEk?: Record<string, unknown>, disEk?: Record<string, unknown>) =>
    tamam<KatalogKartiKaydetCevabi>(cerezi, 'POST', `/malzeme-katalogu-kartlari/${k.kimlik}/kaydet`, k.govde(surum, durum, comEk, disEk));
  // Yazar onaya gönderir, ikinci onaycı aktif yapar (dört göz açık).
  async function aktifKart(ek?: Parameters<typeof kart>[0]): Promise<{ k: Kart; surum: number; no: number }> {
    const k = kart(ek);
    let r = await kaydet(yazar, k, null, 'onayda');
    r = await kaydet(onayci2, k, r.surum, 'aktif');
    return { k, surum: r.surum, no: await noAl(k.kimlik) };
  }
  const noAl = async (kimlik: string): Promise<number> =>
    (await vt().tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]))!.no;
  const logo = (kimlik: string): Promise<LogoSatiri | null> => vt().tek<LogoSatiri>(
    `SELECT logo_gonderim_durumu AS durum, logo_kayit_no AS kayit_no, logo_gonderim_zamani IS NOT NULL AS zaman, logo_hata AS hata,
            logo_kart_turu AS kart_turu, logo_birim_seti AS birim_seti
       FROM malzeme_katalog_karti WHERE kimlik = $1`, [kimlik]);
  const karsilik = (cesit: string, tmiDegeri: string, logoDegeri: string | null) =>
    tamam(onayci, 'POST', '/malzeme-logo-karsiliklari/kaydet', { cesit, tmiDegeri, logoDegeri });
  // Servis dışından eklenen eski kart (göçten önceki dolu tablo yerine).
  async function eskiKart(kimlik: string, sira: number, durum: 'pasif'): Promise<void> {
    await vt().sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 1000) ON CONFLICT (onek) DO NOTHING', ['HM-ESK-']);
    await vt().sorgu(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', 'HM-ESK-', $2, $3, $4, $5, $5)`,
      [kimlik, sira, durum, JSON.stringify({ id: kimlik, com: { ad: 'Eski', birim: 'kg' } }), kisiId],
    );
  }

  before(async () => {
    ortam = await testVeritabaniKur('malzemelogo');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    const ilk = await girisYap('lg-onayci', 'yonetici');
    kisiId = ilk.id;
    onayci = ilk.cerez;
    onayci2 = (await girisYap('lg-onayci-iki', 'yonetici')).cerez;
    yazar = (await girisYap('lg-yazar', 'satin_alma', ilk.id)).cerez;
    // Yerleşik rollerin hiçbiri malzemeyi yalnız okumaz: okuyucu rolü testte açılır.
    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('okuyucu', 'Okuyucu')");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'sayfa.malzemeler' FROM rol WHERE kod = 'okuyucu'");
    okuyucu = (await girisYap('lg-okuyucu', 'okuyucu', ilk.id)).cerez;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('MKL-1: kart ilk kez aktif olduğu yazımda "bekliyor" olur; taslak ve onaydaki kartta durum boş kalır', async () => {
    const k = kart();
    let r = await kaydet(yazar, k, null, 'taslak');
    assert.equal((await logo(k.kimlik))?.durum, null, 'taslak');
    r = await kaydet(yazar, k, r.surum, 'onayda');
    assert.equal((await logo(k.kimlik))?.durum, null, 'onayda');
    await kaydet(onayci2, k, r.surum, 'aktif');
    assert.equal((await logo(k.kimlik))?.durum, 'bekliyor');
  });

  test('MKL-1: onay akışı kapalıyken doğrudan aktif açılan kart da "bekliyor" olur', async () => {
    await tamam(onayci, 'POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
    try {
      const k = kart();
      await kaydet(yazar, k, null, 'aktif');
      assert.equal((await logo(k.kimlik))?.durum, 'bekliyor');
    } finally {
      await tamam(onayci, 'POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: true } });
    }
  });

  test('MKL-1 (ret): önceden aktif olmuş kart pasiften dönünce "bekliyor" olmaz (bugünkü aktif kartlar gönderilmez, LG1 = a)', async () => {
    await eskiKart('lg-eski-pasif', 1, 'pasif');
    assert.equal((await logo('lg-eski-pasif'))?.durum, null);
    await vt().sorgu(`UPDATE malzeme_katalog_karti SET onay_durumu = 'aktif' WHERE kimlik = 'lg-eski-pasif'`);
    assert.equal((await logo('lg-eski-pasif'))?.durum, null, 'pasiften dönen kart');
    const { k, surum } = await aktifKart();
    let r = await kaydet(onayci, k, surum, 'pasif');
    await malzemeLogoSonucuYaz(k.kimlik, { hata: 'deneme' });
    r = await kaydet(onayci, k, r.surum, 'onayda');
    await kaydet(onayci2, k, r.surum, 'aktif');
    assert.equal((await logo(k.kimlik))?.durum, 'hata', 'yeniden aktiflik durumu değiştirmez');
  });
  async function malzemeLogoSonucuYaz(kimlik: string, sonuc: Parameters<typeof malzemeLogoSonucu>[2]): Promise<void> {
    const no = await noAl(kimlik);
    await vt().tx((db) => malzemeLogoSonucu(db, no, sonuc));
  }

  test('MKL-2: kart kaydetme Logo alanlarını yazamaz; gövdede gelen Logo alanları yok sayılır', async () => {
    const k = kart();
    const sahte = { logo_gonderim_durumu: 'gonderildi', logo_kayit_no: 'SAHTE-1', logo_hata: 'sahte' };
    let r = await kaydet(yazar, k, null, 'onayda', {}, sahte);
    const c = await istek(yazar, 'POST', `/malzeme-katalogu-kartlari/${k.kimlik}/kaydet`, {
      ...k.govde(r.surum, 'onayda', {}, sahte), ozet: { benzersiz_anahtar: `hammadde|metal|${k.kimlik}`, mukerrer_gerekcesi: null, ...sahte },
    });
    assert.equal(c.statusCode, 200, c.body);
    r = c.json() as KatalogKartiKaydetCevabi;
    assert.deepEqual(await logo(k.kimlik), { durum: null, kayit_no: null, zaman: false, hata: null, kart_turu: null, birim_seti: null });
    await kaydet(onayci2, k, r.surum, 'aktif', {}, sahte);
    assert.deepEqual(await logo(k.kimlik), { durum: 'bekliyor', kayit_no: null, zaman: false, hata: null, kart_turu: null, birim_seti: null });
  });

  test('MKL-3: Logo kaydı olan kartın birimi değişmez (422, tetikleyici de reddeder); aynı birimle kayıt ve kaydı olmayan kartın birim değişimi serbest', async () => {
    const gonderilen = await aktifKart({ birim: 'kg' });
    await malzemeLogoSonucuYaz(gonderilen.k.kimlik, { kayitNo: 'LG-MKL3-1' });
    await ret(422, 'GECERSIZ', onayci, 'POST', `/malzeme-katalogu-kartlari/${gonderilen.k.kimlik}/kaydet`, gonderilen.k.govde(gonderilen.surum, 'aktif', { birim: 'adet' }));
    await ret(422, 'GECERSIZ', onayci, 'POST', `/malzeme-katalogu-kartlari/${gonderilen.k.kimlik}/kaydet`, gonderilen.k.govde(gonderilen.surum, 'aktif', { birim: null }));
    await kaydet(onayci, gonderilen.k, gonderilen.surum, 'aktif', { ad: 'Yeni ad' });
    await assert.rejects(
      vt().sorgu(`UPDATE malzeme_katalog_karti SET kayit = jsonb_set(kayit, '{com,birim}', '"adet"') WHERE kimlik = $1`, [gonderilen.k.kimlik]),
      (h: { constraint?: string }) => h.constraint === 'malzeme_katalog_karti_logo_kilidi',
    );
    const bekleyen = await aktifKart({ birim: 'kg' });
    await kaydet(onayci, bekleyen.k, bekleyen.surum, 'aktif', { birim: 'adet' });
  });

  test('MKL-4: eksikler (stok kodu, ad, tür ve birim karşılığı); eksik kart aktif olur ve "bekliyor" kalır; birimsiz kart aktif olamaz', async () => {
    const birimsiz = kart({ tur: 'sarf', kod: 'SF-LGO-00002', birim: null });
    await ret(400, 'DOGRULAMA', yazar, 'POST', `/malzeme-katalogu-kartlari/${birimsiz.kimlik}/kaydet`, birimsiz.govde(null, 'onayda'));
    const eksik = await aktifKart({ tur: 'sarf', kod: 'SF-LGO-00001', ad: null, birim: 'kg' });
    assert.equal((await logo(eksik.k.kimlik))?.durum, 'bekliyor');
    const kuyruk = await vt().tx((db) => logoyaGidecekMalzemeler(db, 500));
    assert.deepEqual(kuyruk.find((x) => x.no === eksik.no)?.eksikler, ['ad', 'tur_karsiligi', 'birim_karsiligi']);
    await karsilik('tur', 'mamul', '12');
    await karsilik('birim', 'm', 'LOGO-M');
    const tam = await aktifKart({ tur: 'mamul', kod: 'MM-LGO-00001', birim: 'm' });
    const kuyruk2 = await vt().tx((db) => logoyaGidecekMalzemeler(db, 500));
    assert.deepEqual(kuyruk2.find((x) => x.no === tam.no), {
      no: tam.no, stokKodu: 'MM-LGO-00001', ad: `Logo deneme ${tam.k.kimlik}`, birim: 'm', tur: 'mamul',
      hizmetYonu: null, logoKartTuru: '12', logoBirimSeti: 'LOGO-M', aciklama1: null, aciklama2: null, aciklama3: null, durum: 'bekliyor', sonHata: null, eksikler: [],
    });
  });

  test('MKL-5 (gönderilen): Logo\'ya giden tür ve birim karşılığı verilirse o yazılır, arada değişen karşılık yazılmaz; boş metin reddedilir', async () => {
    await karsilik('tur', 'mamul', '12');
    await karsilik('birim', 'adet', 'LOGO-AD');
    const a = await aktifKart({ tur: 'mamul', kod: 'MM-LGG-00001', birim: 'adet' });
    const kuyrukta = (await vt().tx((db) => logoyaGidecekMalzemeler(db, 500))).find((x) => x.no === a.no);
    assert.deepEqual([kuyrukta?.logoKartTuru, kuyrukta?.logoBirimSeti], ['12', 'LOGO-AD']);
    // Kuyruk okunup Logo'ya gönderildikten sonra karşılık değişti.
    await karsilik('tur', 'mamul', '10');
    await karsilik('birim', 'adet', 'LOGO-YENI');
    assert.equal(await hataKodu((db) => malzemeLogoSonucu(db, a.no, { kayitNo: 'LG-G-1', logoKartTuru: ' ', logoBirimSeti: 'LOGO-AD' })), 'DOGRULAMA');
    assert.equal((await logo(a.k.kimlik))?.durum, 'bekliyor');
    await malzemeLogoSonucuYaz(a.k.kimlik, { kayitNo: 'LG-G-1', logoKartTuru: kuyrukta?.logoKartTuru ?? null, logoBirimSeti: kuyrukta?.logoBirimSeti ?? null });
    assert.deepEqual(await logo(a.k.kimlik), { durum: 'gonderildi', kayit_no: 'LG-G-1', zaman: true, hata: null, kart_turu: '12', birim_seti: 'LOGO-AD' });
  });

  test('MKL-5: sonuç kayıt numarasıyla "gonderildi", hatayla "hata"; aynı numara ikinci karta yazılamaz; gönderilmiş kart geri dönmez', async () => {
    await karsilik('tur', 'yarimamul', '11');
    await karsilik('birim', 'levha', 'LOGO-LV');
    const a = await aktifKart({ tur: 'yarimamul', kod: 'YM-LGO-00001', birim: 'levha' });
    const b = await aktifKart();
    await malzemeLogoSonucuYaz(a.k.kimlik, { hata: '  Logo bağlantı hatası  ' });
    assert.deepEqual(await logo(a.k.kimlik), { durum: 'hata', kayit_no: null, zaman: true, hata: 'Logo bağlantı hatası', kart_turu: null, birim_seti: null });
    await malzemeLogoSonucuYaz(a.k.kimlik, { kayitNo: 'LG-MKL5-1' });
    assert.deepEqual(await logo(a.k.kimlik), { durum: 'gonderildi', kayit_no: 'LG-MKL5-1', zaman: true, hata: null, kart_turu: '11', birim_seti: 'LOGO-LV' });
    // Karşılık sonradan değişse de karttaki gönderilen değer değişmez.
    await karsilik('tur', 'yarimamul', '10');
    assert.equal((await logo(a.k.kimlik))?.kart_turu, '11');
    assert.equal(await hataKodu((db) => malzemeLogoSonucu(db, b.no, { kayitNo: 'LG-MKL5-1' })), 'CAKISMA');
    assert.equal((await logo(b.k.kimlik))?.durum, 'bekliyor');
    assert.equal(await hataKodu((db) => malzemeLogoSonucu(db, a.no, { hata: 'yeniden' })), 'GECERSIZ');
    assert.equal(await hataKodu((db) => malzemeLogoSonucu(db, a.no, { kayitNo: 'LG-MKL5-2' })), 'GECERSIZ');
    assert.equal(await hataKodu((db) => malzemeLogoSonucu(db, b.no, { hata: '   ' })), 'DOGRULAMA');
    assert.equal(await hataKodu((db) => malzemeLogoSonucu(db, b.no, { kayitNo: ' ' })), 'DOGRULAMA');
    assert.equal(await hataKodu((db) => malzemeLogoSonucu(db, 999_999, { kayitNo: 'X' })), 'BULUNAMADI');
    const taslak = kart();
    await kaydet(yazar, taslak, null, 'taslak');
    assert.equal(await hataKodu(async (db) => malzemeLogoSonucu(db, await noAl(taslak.kimlik), { kayitNo: 'LG-T' })), 'GECERSIZ');
    await assert.rejects(
      vt().sorgu(`UPDATE malzeme_katalog_karti SET logo_gonderim_durumu = 'bekliyor', logo_kayit_no = NULL, logo_gonderim_zamani = NULL WHERE kimlik = $1`, [a.k.kimlik]),
      (h: { constraint?: string }) => h.constraint === 'malzeme_katalog_karti_logo_gonderildi',
    );
    await assert.rejects(
      vt().sorgu(`UPDATE malzeme_katalog_karti SET logo_gonderim_durumu = NULL WHERE kimlik = $1`, [b.k.kimlik]),
      (h: { constraint?: string }) => h.constraint === 'malzeme_katalog_karti_logo_gonderildi',
    );
  });

  test('logoyaGidecekMalzemeler: yalnız bekleyen ve hatalı kartlar, en eski aktiflik önce, sınırla', async () => {
    const kuyruk = await vt().tx((db) => logoyaGidecekMalzemeler(db, 500));
    assert.ok(kuyruk.length >= 2);
    assert.ok(kuyruk.every((x) => x.durum === 'bekliyor' || x.durum === 'hata'));
    const durumlar = await vt().sorgu<{ no: number; durum: string | null }>('SELECT no, logo_gonderim_durumu AS durum FROM malzeme_katalog_karti');
    const beklenen = durumlar.filter((x) => x.durum === 'bekliyor' || x.durum === 'hata').map((x) => x.no).sort((a, b) => a - b);
    assert.deepEqual(kuyruk.map((x) => x.no).sort((a, b) => a - b), beklenen);
    const sirali = await vt().sorgu<{ no: number }>(
      `SELECT no FROM malzeme_katalog_karti WHERE logo_gonderim_durumu IN ('bekliyor', 'hata') ORDER BY COALESCE(onaylama, acilma), no`);
    assert.deepEqual(kuyruk.map((x) => x.no), sirali.map((x) => x.no));
    assert.equal((await vt().tx((db) => logoyaGidecekMalzemeler(db, 1))).length, 1);
    await assert.rejects(vt().tx((db) => logoyaGidecekMalzemeler(db, 0)));
  });

  test('Logo durumu sayfası: sayfası olan okur, eksikli kartlar üstte; karşılığı yalnız tanım yazan yazar, tür dışı değer reddedilir', async () => {
    const cevap = await tamam<LogoDurumuCevabi>(okuyucu, 'GET', '/malzeme-logo-durumu');
    assert.equal(cevap.karsilikYazabilir, false);
    const ilkEksiksiz = cevap.kartlar.findIndex((x) => x.durum === 'gonderildi' || x.eksikler.length === 0);
    assert.ok(cevap.kartlar.slice(0, ilkEksiksiz).every((x) => x.eksikler.length > 0) && ilkEksiksiz > 0);
    assert.ok(cevap.kartlar.slice(ilkEksiksiz).every((x) => x.durum === 'gonderildi' || x.eksikler.length === 0), 'eksikli kart eksiksizlerin altında kalmaz');
    assert.ok(cevap.kartlar.filter((x) => x.durum === 'gonderildi').every((x) => x.eksikler.length === 0 && x.kayitNo !== null));
    assert.deepEqual(cevap.karsiliklar.filter((x) => x.cesit === 'tur').map((x) => x.tmiDegeri), ['hammadde', 'yarimamul', 'mamul', 'sarf', 'demirbas', 'ticari_mal']);
    assert.ok(cevap.karsiliklar.some((x) => x.cesit === 'birim' && x.tmiDegeri === 'kg' && x.logoDegeri === null), 'kartta geçen birim boş karşılıkla');
    await ret(403, 'YETKI_YOK', okuyucu, 'POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'birim', tmiDegeri: 'kg', logoDegeri: 'KG' });
    await ret(422, 'GECERSIZ', onayci, 'POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'tur', tmiDegeri: 'bilinmeyen', logoDegeri: '10' });
    await ret(400, 'DOGRULAMA', onayci, 'POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'birim', tmiDegeri: 'kg', logoDegeri: '' });
    await karsilik('birim', 'kg', 'KG');
    await karsilik('birim', 'kg', null);
    const son = await tamam<LogoDurumuCevabi>(onayci, 'GET', '/malzeme-logo-durumu');
    assert.equal(son.karsilikYazabilir, true);
    assert.equal(son.karsiliklar.find((x) => x.cesit === 'birim' && x.tmiDegeri === 'kg')?.logoDegeri, null);
  });

  test('LB7 (kart #232): tür karşılığı yalnız 10, 11, 12, 13; demirbaş boş kalır; birim kodu boşluksuz; veritabanı kısıtı da tutar', async () => {
    const yaz = (cesit: string, tmiDegeri: string, logoDegeri: string | null) => istek(onayci, 'POST', '/malzeme-logo-karsiliklari/kaydet', { cesit, tmiDegeri, logoDegeri });
    for (const kod of ['10', '11', '12', '13']) assert.equal((await yaz('tur', 'sarf', kod)).statusCode, 200, kod);
    await ret(422, 'GECERSIZ', onayci, 'POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'tur', tmiDegeri: 'sarf', logoDegeri: '4' });
    await ret(422, 'GECERSIZ', onayci, 'POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'tur', tmiDegeri: 'sarf', logoDegeri: 'TICARI' });
    await ret(422, 'GECERSIZ', onayci, 'POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'tur', tmiDegeri: 'demirbas', logoDegeri: '4' });
    await ret(422, 'GECERSIZ', onayci, 'POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'tur', tmiDegeri: 'demirbas', logoDegeri: '10' });
    assert.equal((await yaz('tur', 'demirbas', null)).statusCode, 200, 'demirbaşın boş karşılığı yazılır');
    await ret(400, 'DOGRULAMA', onayci, 'POST', '/malzeme-logo-karsiliklari/kaydet', { cesit: 'birim', tmiDegeri: 'kg', logoDegeri: '06 KG' });
    assert.equal((await yaz('birim', 'kg', '06')).statusCode, 200);
    const kisit = (h: { constraint?: string }) => h.constraint === 'malzeme_logo_karsiligi_izinli';
    await assert.rejects(vt().sorgu(`UPDATE malzeme_logo_karsiligi SET logo_degeri = '4' WHERE cesit = 'tur' AND tmi_degeri = 'sarf'`), kisit);
    await assert.rejects(vt().sorgu(`UPDATE malzeme_logo_karsiligi SET logo_degeri = '10' WHERE cesit = 'tur' AND tmi_degeri = 'demirbas'`), kisit);
    await assert.rejects(vt().sorgu(`UPDATE malzeme_logo_karsiligi SET logo_degeri = '06 KG' WHERE cesit = 'birim' AND tmi_degeri = 'kg'`), kisit);
    const cevap = await tamam<LogoDurumuCevabi>(okuyucu, 'GET', '/malzeme-logo-durumu');
    assert.deepEqual(cevap.kartTuruSecenekleri.map((t) => t.kod), ['10', '11', '12', '13', '1']);
  });

  test('logoBirimSetiKullaniliyorMu (kart #207 isteği): bütün birim karşılıklarına bakar; kuyrukta kart olmasa da kullanılan set doğru, kullanılmayan yanlış', async () => {
    await karsilik('birim', 'torba', 'TRB-1');
    assert.equal(await vt().tx((db) => logoBirimSetiKullaniliyorMu(db, 'TRB-1')), true);
    assert.equal(await vt().tx((db) => logoBirimSetiKullaniliyorMu(db, 'TRB-2')), false);
    await karsilik('birim', 'torba', null);
    assert.equal(await vt().tx((db) => logoBirimSetiKullaniliyorMu(db, 'TRB-1')), false, 'karşılık silinince kullanılmıyor');
    await karsilik('tur', 'mamul', '12');
    assert.equal(await vt().tx((db) => logoBirimSetiKullaniliyorMu(db, '12')), false, 'tür karşılığı birim seti sayılmaz');
  });
});
