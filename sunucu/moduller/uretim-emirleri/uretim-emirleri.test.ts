import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { dogrulama } from '#cekirdek/hata.ts';
import { izinYok, testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import {
  emirAyrintiCevabi, emirCevabi, emirlerCevabi, katilimCevabi, makineDoluAyrintisi,
} from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { ESKI_SURUM_ILETISI } from '#paylasilan/hata.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Emir } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { hurdaSayimDinle, kararliSayimiSonuclandir, saglamSayimDinle } from './disari.ts';
import type { HurdaSayimOlayi, SaglamSayimOlayi } from './disari.ts';
import { BASLATMA_DURUMU, BITIRME_DURUMU, DEVRAL_DEGISTI, DEVRAL_DURUMU, DURAKLI_DURDUR, EKIP_DISI, IPTAL_DURUMU, ISTASYON_DOLU, KATILIM_ACIK, KATILIM_CALISMIYOR, KATILIM_YOK, MAKINE_DOLU, PROJE_GECERSIZ, ROTASIZ_EMIR_KAPALI, YETKINLIK_YOK } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
const BASLATANLAR = ['mudur', 'operator'];
const ACANLAR = ['planlama_proje', 'mudur'];
const DIGER_ROLLER = ['kalite', 'insan_kaynaklari', 'satin_alma', 'muhasebe_finans', 'idari_isler', 'cam', 'depo'];

interface Cevap<T = unknown> { durum: number; govde: T }
interface Hata { kod: string; mesaj: string }

describe('uretim-emirleri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let kapsamliId = 0;
  const uyarilar: string[] = [];
  const uyariDinle = (u: Error): void => { uyarilar.push(u.message); };
  const cerezler = new Map<string, string>();

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const sahip = (): TestVeritabani['sahip'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı.');
    return ortam.sahip;
  };

  // Her POST kendi istek kimliğiyle gider (tekrar korumalı uçlar kimliksizi reddeder; korumasız uç başlığı okumaz).
  // `kimlik` verilirse o kullanılır; null başlıksız gönderir.
  async function istek<T = unknown>(
    cerez: string | null, yontem: 'GET' | 'POST', yol: string, govde?: unknown, kimlik?: string | null,
  ): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = {};
    if (cerez) basliklar.cookie = cerez;
    if (yontem === 'POST' && kimlik !== null) basliklar[ISTEK_KIMLIGI_BASLIGI] = kimlik ?? randomUUID();
    const cevap = await app.inject({
      method: yontem,
      url: `/api${yol}`,
      headers: basliklar,
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: cevap.statusCode, govde: (cevap.body ? cevap.json() : undefined) as T };
  }
  const kisiCerezi = (ad: string): string => {
    const c = cerezler.get(ad);
    if (c === undefined) throw new Error(`Kişi kurulmadı: ${ad}`);
    return c;
  };
  const plan = <T = unknown>(yontem: 'GET' | 'POST', yol: string, govde?: unknown) => istek<T>(kisiCerezi('planlama_proje'), yontem, yol, govde);
  const op = <T = unknown>(yontem: 'GET' | 'POST', yol: string, govde?: unknown) => istek<T>(kisiCerezi('operator'), yontem, yol, govde);

  async function girisliKisiEkle(kullaniciAdi: string, rolKodu: string): Promise<number> {
    const rol = await vt().tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return yeni;
    });
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    cerezler.set(kullaniciAdi, String(cevap.headers['set-cookie']).split(';')[0] ?? '');
    return id;
  }

  let sayac = 0;
  async function istasyonKur(aktif = true): Promise<number> {
    sayac += 1;
    const im = await sahip().tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`UIM${sayac}`, 'Deneme Merkezi']);
    const ist = await sahip().tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, $4) RETURNING id',
      [`UIS${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id, aktif],
    );
    if (!ist) throw new Error('istasyon kurulamadı');
    // UE20: başlatan yetkin olmalı; test kişileri her yeni istasyonda yetkindir. 'yetkinsiz' hiç yetkin olmaz; 'kapsamli' yalnız açıkça
    // yetkin kılınır, çünkü yetkinlik iş merkezi kapsamını genişletir ve kapsam reddi başka türlü sınanamaz.
    await sahip().sorgu("INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi WHERE kullanici_adi IS NULL OR kullanici_adi NOT IN ('yetkinsiz', 'kapsamli')", [ist.id]);
    return ist.id;
  }

  let projeId = 0;
  const govde = (istasyonId: number, ek: Record<string, unknown> = {}) => ({ parcaNo: 'P-1', parcaAd: 'Deneme Parçası', adet: 10, istasyonId, projeId, ...ek });
  const rotasizAyari = async (deger: boolean | null) => {
    await sahip().sorgu("DELETE FROM ayar WHERE anahtar = 'uretim-emirleri.rotasiz-emir'");
    if (deger !== null) await sahip().sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('uretim-emirleri.rotasiz-emir', $1, $2)", [String(deger), yoneticiId]);
  };

  async function emirAc(istasyonId: number, ek: Record<string, unknown> = {}): Promise<Emir> {
    const c = await plan<{ emir: Emir }>('POST', '/uretim-emirleri', govde(istasyonId, ek));
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.emir;
  }
  async function baslatilmis(): Promise<{ emir: Emir; istasyonId: number }> {
    const istasyonId = await istasyonKur();
    const emir = await emirAc(istasyonId);
    assert.equal((await op('POST', `/uretim-emirleri/${emir.id}/baslat`)).durum, 200);
    return { emir, istasyonId };
  }
  const baslat = (id: number, kim = 'operator', govde?: unknown) => istek<{ emir: Emir } & Hata>(kisiCerezi(kim), 'POST', `/uretim-emirleri/${id}/baslat`, govde);
  const bitir = (id: number, saglamAdet: number, kim = 'operator') =>
    istek<{ emir: Emir } & Hata>(kisiCerezi(kim), 'POST', `/uretim-emirleri/${id}/bitir`, { saglamAdet });
  const surumOku = async (id: number) => (await plan<{ emir: Emir }>('GET', `/uretim-emirleri/${id}`)).govde.emir.surum;
  const iptal = async (id: number) => istek<{ emir: Emir } & Hata>(kisiCerezi('planlama_proje'), 'POST', `/uretim-emirleri/${id}/iptal`, { surum: await surumOku(id) });
  const durumOku = async (id: number) => (await plan<{ emir: Emir }>('GET', `/uretim-emirleri/${id}`)).govde.emir.durum;
  const kayitSayisi = async (emirId: number) =>
    (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_kaydi WHERE emir_id = $1', [emirId]))?.n;

  before(async () => {
    process.on('warning', uyariDinle);
    ortam = await testVeritabaniKur('uretim_emirleri');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerezler.set('yonetici', String(giris.headers['set-cookie']).split(';')[0] ?? '');
    for (const rol of ['planlama_proje', 'mudur', 'operator', ...DIGER_ROLLER]) await girisliKisiEkle(rol, rol);
    await girisliKisiEkle('operator2', 'operator');
    kapsamliId = await girisliKisiEkle('kapsamli', 'operator');
    await girisliKisiEkle('yetkinsiz', 'operator');
    projeId = (await sahip().tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.ROTASIZ', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    await rotasizAyari(true);
  });

  after(async () => {
    process.off('warning', uyariDinle);
    await ortam?.kaldir();
  });

  test('yetki: açma ve iptal planlama_proje ile müdürde; başlatma ve bitirme operatör ile müdürde; öbürleri 403, girişsiz 401', async () => {
    const ist = await istasyonKur();
    const ac = (kim: string | null) => istek(kim === null ? null : kisiCerezi(kim), 'POST', '/uretim-emirleri', govde(ist));
    assert.equal((await ac(null)).durum, 401);
    for (const kim of ['operator', 'operator2', ...DIGER_ROLLER]) assert.equal((await ac(kim)).durum, 403, `aç: ${kim}`);
    for (const kim of [...ACANLAR, 'yonetici']) assert.equal((await ac(kim)).durum, 200, `aç: ${kim}`);

    const hedef = await emirAc(ist);
    const iptalDene = async (kim: string | null) =>
      istek(kim === null ? null : kisiCerezi(kim), 'POST', `/uretim-emirleri/${hedef.id}/iptal`, { surum: await surumOku(hedef.id) });
    assert.equal((await iptalDene(null)).durum, 401);
    for (const kim of ['operator', ...DIGER_ROLLER]) assert.equal((await iptalDene(kim)).durum, 403, `iptal: ${kim}`);
    assert.equal(await durumOku(hedef.id), 'planli');
    assert.equal((await iptalDene('mudur')).durum, 200);
    const ikinci = await emirAc(ist);
    assert.equal((await iptalDene('planlama_proje')).durum, 409, 'iptal edilmiş emir tekrar iptal edilmez');
    assert.equal((await iptal(ikinci.id)).durum, 200);

    for (const kim of ['planlama_proje', ...DIGER_ROLLER]) {
      const e = await emirAc(await istasyonKur());
      assert.equal((await baslat(e.id, kim)).durum, 403, `başlat: ${kim}`);
      assert.equal((await bitir(e.id, 1, kim)).durum, 403, `bitir: ${kim}`);
      assert.equal(await durumOku(e.id), 'planli');
    }
    const girissiz = await emirAc(await istasyonKur());
    assert.equal((await istek(null, 'POST', `/uretim-emirleri/${girissiz.id}/baslat`)).durum, 401);
    assert.equal((await istek(null, 'POST', `/uretim-emirleri/${girissiz.id}/bitir`, { saglamAdet: 1 })).durum, 401);
    for (const kim of [...BASLATANLAR, 'yonetici']) {
      const e = await emirAc(await istasyonKur());
      assert.equal((await baslat(e.id, kim)).durum, 200, `başlat: ${kim}`);
      assert.equal((await bitir(e.id, 1, kim)).durum, 200, `bitir: ${kim}`);
    }
  });

  test('yetki: liste emri gören işlemlerle, Stok ve Fabrika Haritası sayfasıyla açılır, terminale açılmaz; bitenler emri gören işlemlerle; öbürleri 403, girişsiz 401', async () => {
    await emirAc(await istasyonKur());
    for (const yol of ['/uretim-emirleri', '/uretim-emirleri/bitenler']) assert.equal((await istek(null, 'GET', yol)).durum, 401, yol);
    for (const kim of ['planlama_proje', 'mudur', 'kalite', 'satin_alma', 'muhasebe_finans', 'cam', 'depo']) {
      assert.equal((await istek(kisiCerezi(kim), 'GET', '/uretim-emirleri')).durum, 200, `liste ${kim}`);
    }
    for (const kim of ['operator', 'insan_kaynaklari', 'idari_isler']) {
      assert.equal((await istek(kisiCerezi(kim), 'GET', '/uretim-emirleri')).durum, 403, `liste ${kim}`);
    }
    for (const kim of ['planlama_proje', 'mudur', 'kalite', 'satin_alma', 'muhasebe_finans', 'cam', 'depo']) {
      assert.equal((await istek(kisiCerezi(kim), 'GET', '/uretim-emirleri/bitenler')).durum, 200, `bitenler ${kim}`);
    }
    for (const kim of ['operator', 'insan_kaynaklari', 'idari_isler']) {
      assert.equal((await istek(kisiCerezi(kim), 'GET', '/uretim-emirleri/bitenler')).durum, 403, `bitenler ${kim}`);
    }
  });

  test('yetki: emrin ayrıntısını emri gören işlemlerden biri (sayfa, rota, plan, emir yazma, terminal) açar; hiçbiri olmayan 403', async () => {
    const emir = await emirAc(await istasyonKur());
    const yol = `/uretim-emirleri/${emir.id}`;
    for (const kim of ['planlama_proje', 'mudur', 'operator', 'kalite', 'satin_alma', 'muhasebe_finans', 'cam', 'depo']) {
      assert.equal((await istek(kisiCerezi(kim), 'GET', yol)).durum, 200, kim);
    }
    for (const kim of ['insan_kaynaklari', 'idari_isler']) assert.equal((await istek(kisiCerezi(kim), 'GET', yol)).durum, 403, kim);
  });

  test('açma: emir no sunucuda üretilir, biçimi okunur, eşzamanlı açışta benzersizdir; cevap sözleşmeye uyar', async () => {
    const ist = await istasyonKur();
    const c = await plan('POST', '/uretim-emirleri', govde(ist, { emirNo: 'ELLE-1' }));
    const emir = emirCevabi.parse(c.govde).emir;
    assert.match(emir.emirNo, /^UE-\d{6}$/);
    assert.equal(emir.durum, 'planli');
    assert.equal(emir.adet, 10);
    assert.deepEqual([emir.baslama, emir.bitis, emir.iptal, emir.saglamAdet], [null, null, null, null]);
    assert.equal(emir.istasyon.id, ist);
    assert.equal(emir.acan.ad, 'Deneme planlama_proje');
    assert.match(emir.acilma, /^\d{4}-\d{2}-\d{2}T/);

    const yirmi = await Promise.all(Array.from({ length: 12 }, () => plan<{ emir: Emir }>('POST', '/uretim-emirleri', govde(ist))));
    assert.deepEqual(yirmi.map((y) => y.durum), Array.from({ length: 12 }, () => 200));
    const nolar = yirmi.map((y) => y.govde.emir.emirNo);
    assert.equal(new Set(nolar).size, 12);
  });

  test('açma: geçersiz alanlar, olmayan ve pasif istasyon reddedilir; emir yazılmaz', async () => {
    const aktif = await istasyonKur();
    const pasif = await istasyonKur(false);
    const onceki = (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri'))?.n;
    const dene = (ek: Record<string, unknown>, ist = aktif) => plan<Hata>('POST', '/uretim-emirleri', govde(ist, ek));
    assert.equal((await dene({ adet: 0 })).durum, 400);
    assert.equal((await dene({ adet: -3 })).durum, 400);
    assert.equal((await dene({ adet: 1.5 })).durum, 400);
    assert.equal((await dene({ parcaNo: '  ' })).durum, 400);
    assert.equal((await dene({ parcaAd: '' })).durum, 400);
    assert.equal((await dene({ parcaNo: 'x'.repeat(61) })).durum, 400);
    assert.equal((await dene({ parcaAd: 'x'.repeat(121) })).durum, 400);
    const yok = await dene({}, 2147483000);
    assert.equal(yok.durum, 400);
    const pasifRed = await dene({}, pasif);
    assert.equal(pasifRed.durum, 400);
    assert.equal(pasifRed.govde.mesaj, 'Pasif istasyona emir açılamaz.');
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri'))?.n, onceki);
    assert.equal((await dene({ parcaNo: 'x'.repeat(60), parcaAd: 'y'.repeat(120), adet: 1 })).durum, 200);
  });

  test('başlat ve bitir: durum, zamanlar ve defter satırları birlikte yazılır; kayıtlar ayrıntıda sırayla görünür', async () => {
    const { emir, istasyonId } = await baslatilmis();
    const ayrinti1 = emirAyrintiCevabi.parse((await plan('GET', `/uretim-emirleri/${emir.id}`)).govde);
    assert.equal(ayrinti1.emir.durum, 'basladi');
    assert.notEqual(ayrinti1.emir.baslama, null);
    assert.equal(ayrinti1.emir.bitis, null);
    assert.equal(ayrinti1.emir.saglamAdet, null);
    assert.deepEqual(ayrinti1.kayitlar.map((k) => [k.olay, k.saglamAdet, k.kisi.ad, k.istasyon.id]), [['baslat', null, 'Deneme operator', istasyonId]]);

    const sonuc = await bitir(emir.id, 9);
    assert.equal(sonuc.durum, 200);
    const bitmis = emirCevabi.parse(sonuc.govde).emir;
    assert.equal(bitmis.durum, 'bitti');
    assert.equal(bitmis.saglamAdet, 9);
    assert.notEqual(bitmis.bitis, null);
    const ayrinti2 = emirAyrintiCevabi.parse((await plan('GET', `/uretim-emirleri/${emir.id}`)).govde);
    assert.deepEqual(ayrinti2.kayitlar.map((k) => [k.olay, k.saglamAdet, k.adet]), [['baslat', null, null], ['duzeltme', null, 9], ['bitir', 9, null]]);
    assert.equal(ayrinti2.kayitlar[1]?.kisi.ad, 'Deneme operator');
    assert.equal(ayrinti2.kayitlar[2]?.zaman, bitmis.bitis);
    assert.equal(ayrinti2.kayitlar[0]?.zaman, bitmis.baslama);
  });

  test('UE20 (karar 86 b): istasyonda geçerli yetkinliği olmayan kişi başlatamaz; yetkinlik verilince ya da yönetici başlatır; süresi dolan yetkinlik sayılmaz', async () => {
    const istasyonId = await istasyonKur();
    const emir = await emirAc(istasyonId);
    const red = await baslat(emir.id, 'yetkinsiz');
    assert.deepEqual([red.durum, red.govde.kod, red.govde.mesaj], [403, 'YETKI_YOK', YETKINLIK_YOK]);
    assert.equal(await durumOku(emir.id), 'planli');
    assert.equal(await kayitSayisi(emir.id), 0);

    const kisi = await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'yetkinsiz'");
    await sahip().sorgu("INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id, gecerlilik_bitis) VALUES ($1, $2, '2020-01-31')", [kisi!.id, istasyonId]);
    assert.equal((await baslat(emir.id, 'yetkinsiz')).durum, 403, 'süresi dolan yetkinlik');
    await sahip().sorgu("UPDATE istasyonlar_yetkinlik SET gecerlilik_bitis = '2999-12-31' WHERE kisi_id = $1 AND istasyon_id = $2", [kisi!.id, istasyonId]);
    assert.equal((await baslat(emir.id, 'yetkinsiz')).durum, 200);

    // Bütün işlemleri taşıyan yönetici yetkinliksiz başlatır.
    const ikinci = await istasyonKur();
    await sahip().sorgu("DELETE FROM istasyonlar_yetkinlik WHERE istasyon_id = $1", [ikinci]);
    const emir2 = await emirAc(ikinci);
    assert.equal((await baslat(emir2.id, 'operator')).durum, 403);
    assert.equal((await baslat(emir2.id, 'yonetici')).durum, 200);
  });

  test('bitir: başlatanı başka terminal.uret sahibi bitirebilir ve bitiren kayda yazılır', async () => {
    const { emir } = await baslatilmis();
    assert.equal((await bitir(emir.id, 4, 'operator2')).durum, 200);
    const ayrinti = emirAyrintiCevabi.parse((await plan('GET', `/uretim-emirleri/${emir.id}`)).govde);
    assert.deepEqual(ayrinti.kayitlar.filter((k) => k.olay !== 'duzeltme').map((k) => k.kisi.ad), ['Deneme operator', 'Deneme operator2']);
  });

  test('bitir: sağlam adet emir adedinden az, fazla ya da sıfır olabilir; eksi ve ondalık reddedilir', async () => {
    for (const adet of [3, 10, 25, 0]) {
      const { emir } = await baslatilmis();
      const c = await bitir(emir.id, adet);
      assert.equal(c.durum, 200, `adet ${adet}`);
      assert.equal(c.govde.emir.saglamAdet, adet);
      assert.equal(c.govde.emir.adet, 10);
    }
    const { emir } = await baslatilmis();
    assert.equal((await bitir(emir.id, -1)).durum, 400);
    assert.equal((await bitir(emir.id, 1.5)).durum, 400);
    assert.equal(await durumOku(emir.id), 'basladi');
    assert.equal(await kayitSayisi(emir.id), 1);
  });

  test('durum kuralları: yalnız planlı başlar, yalnız başlamış biter, yalnız planlı iptal edilir; red durumu ve kaydı değiştirmez', async () => {
    const ist = await istasyonKur();
    const planli = await emirAc(ist);
    const bitirRed = await bitir(planli.id, 1);
    assert.equal(bitirRed.durum, 409);
    assert.equal(bitirRed.govde.mesaj, BITIRME_DURUMU);
    assert.equal(await durumOku(planli.id), 'planli');
    assert.equal(await kayitSayisi(planli.id), 0);

    const { emir: basladi } = await baslatilmis();
    const tekrar = await baslat(basladi.id);
    assert.equal(tekrar.durum, 409);
    assert.equal(tekrar.govde.mesaj, BASLATMA_DURUMU);
    const iptalBasladi = await iptal(basladi.id);
    assert.equal(iptalBasladi.durum, 409);
    assert.equal(iptalBasladi.govde.mesaj, IPTAL_DURUMU);
    assert.equal(await durumOku(basladi.id), 'basladi');
    assert.equal(await kayitSayisi(basladi.id), 1);

    assert.equal((await bitir(basladi.id, 5)).durum, 200);
    assert.equal((await baslat(basladi.id)).durum, 409);
    assert.equal((await bitir(basladi.id, 6)).durum, 409);
    assert.equal((await iptal(basladi.id)).durum, 409);
    assert.equal(await durumOku(basladi.id), 'bitti');
    assert.equal(await kayitSayisi(basladi.id), 2);

    assert.equal((await iptal(planli.id)).govde.emir.durum, 'iptal');
    assert.notEqual((await plan<{ emir: Emir }>('GET', `/uretim-emirleri/${planli.id}`)).govde.emir.iptal, null);
    assert.equal((await baslat(planli.id)).durum, 409);
    assert.equal((await bitir(planli.id, 1)).durum, 409);
    assert.equal((await iptal(planli.id)).durum, 409);
    assert.equal(await kayitSayisi(planli.id), 0);

    for (const yol of ['baslat', 'bitir', 'iptal']) {
      assert.equal((await istek(kisiCerezi('yonetici'), 'POST', `/uretim-emirleri/2147483000/${yol}`, { bitir: { saglamAdet: 1 }, iptal: { surum: 1 } }[yol])).durum, 404, yol);
    }
    assert.equal((await plan('GET', '/uretim-emirleri/2147483000')).durum, 404);
  });

  test('iptal sürümle yazılır: eski sürüm 409 ve emir değişmez; sürümsüz gövde 400', async () => {
    const emir = await emirAc(await istasyonKur());
    const yol = `/uretim-emirleri/${emir.id}/iptal`;
    assert.equal(typeof emir.surum, 'number');
    assert.equal((await plan('POST', yol, {})).durum, 400);
    assert.equal((await plan<Hata>('POST', yol, { surum: (emir.surum ?? 0) + 1 })).govde.mesaj, ESKI_SURUM_ILETISI);
    assert.equal(await durumOku(emir.id), 'planli');
    const ip = await plan<{ emir: Emir }>('POST', yol, { surum: emir.surum });
    assert.equal(ip.durum, 200);
    assert.equal(ip.govde.emir.durum, 'iptal');
    assert.ok((ip.govde.emir.surum ?? 0) > (emir.surum ?? 0), 'iptal sürümü ilerletir');
  });

  test('UE-RE-1: rotasız emir yeni kurulumda kapalıdır (denetim #27); ayar açılınca açılır, kapatılınca yine açılmaz', async () => {
    const ist = await istasyonKur();
    try {
      for (const deger of [null, false]) {
        await rotasizAyari(deger);
        const ret = await plan<Hata>('POST', '/uretim-emirleri', govde(ist));
        assert.equal(ret.durum, 409, String(deger));
        assert.equal(ret.govde.mesaj, ROTASIZ_EMIR_KAPALI);
      }
    } finally {
      await rotasizAyari(true);
    }
    await emirAc(ist);
  });

  test('UE-RE-2: rotasız emir projesiz ya da aktif olmayan projeyle açılmaz; açılan emir projesini taşır (224, denetim #27)', async () => {
    const ist = await istasyonKur();
    const projesiz = await plan<Hata>('POST', '/uretim-emirleri', { parcaNo: 'P-1', parcaAd: 'Deneme Parçası', adet: 10, istasyonId: ist });
    assert.equal(projesiz.durum, 400);
    const kapali = (await sahip().tek<{ id: number }>("INSERT INTO projeler_proje (kod, ad, durum, olusturan_id) VALUES ('UE.KAPALI', 'Deneme kapalı', 'tamamlandi', $1) RETURNING id", [yoneticiId]))!.id;
    for (const id of [kapali, 999999]) {
      const ret = await plan<Hata>('POST', '/uretim-emirleri', govde(ist, { projeId: id }));
      assert.equal(ret.durum, 400, String(id));
      assert.equal(ret.govde.mesaj, PROJE_GECERSIZ);
    }
    const emir = await emirAc(ist);
    assert.equal((await vt().tek<{ p: number }>('SELECT proje_id AS p FROM uretim_emri WHERE id = $1', [emir.id]))?.p, projeId);
  });

  test('emir silinmez: silme ucu yoktur', async () => {
    const emir = await emirAc(await istasyonKur());
    for (const yol of [`/uretim-emirleri/${emir.id}/sil`, `/uretim-emirleri/${emir.id}/sil-`]) {
      assert.equal((await istek(kisiCerezi('yonetici'), 'POST', yol)).durum, 404, yol);
    }
    const silme = await app.inject({ method: 'DELETE', url: `/api/uretim-emirleri/${emir.id}`, headers: { cookie: kisiCerezi('yonetici') } });
    assert.equal(silme.statusCode, 404);
    assert.equal(await durumOku(emir.id), 'planli');
  });

  test('pasif istasyon: açıldıktan sonra pasife alınan istasyonda emir başlamaz; yeniden aktifte başlar', async () => {
    const ist = await istasyonKur();
    const emir = await emirAc(ist);
    await sahip().sorgu('UPDATE istasyon SET aktif = false WHERE id = $1', [ist]);
    const red = await baslat(emir.id);
    assert.equal(red.durum, 409);
    assert.equal(red.govde.mesaj, 'Emrin istasyonu pasif; emir başlatılamaz.');
    assert.equal(await durumOku(emir.id), 'planli');
    assert.equal(await kayitSayisi(emir.id), 0);
    await sahip().sorgu('UPDATE istasyon SET aktif = true WHERE id = $1', [ist]);
    assert.equal((await baslat(emir.id)).durum, 200);
  });

  test('pasif iş merkezi: istasyonu aktif olsa da başlatma reddedilir', async () => {
    const ist = await istasyonKur();
    const emir = await emirAc(ist);
    await sahip().sorgu('UPDATE is_merkezi SET aktif = false WHERE id = (SELECT is_merkezi_id FROM istasyon WHERE id = $1)', [ist]);
    assert.equal((await baslat(emir.id)).durum, 409);
    assert.equal((await plan('POST', '/uretim-emirleri', govde(ist))).durum, 400);
  });

  // ---------------- makinede tek iş (#1143): kilit makinededir; makinesiz (insanlı) işte kilit yoktur ----------------

  async function makineKur(istasyonId: number, ad = 'Tezgah'): Promise<number> {
    sayac += 1;
    const m = await sahip().tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`UMK${sayac}`, ad, istasyonId]);
    return m!.id;
  }
  const makinede = (makineId: number) => ({ makineIdleri: [makineId] });
  const acikKullanim = async (makineId: number) =>
    (await vt().sorgu<{ emirId: number; kisiId: number }>(
      'SELECT emir_id AS "emirId", kisi_id AS "kisiId" FROM uretim_emirleri_makine_kullanimi WHERE makine_id = $1 AND bitis IS NULL', [makineId]));
  const kisiId = async (kullaniciAdi: string) =>
    (await vt().tek<{ id: number }>('SELECT id FROM kisi WHERE kullanici_adi = $1', [kullaniciAdi]))!.id;
  const calismaOku = async (id: number) =>
    (await vt().tek<{ calisma: string }>('SELECT calisma FROM uretim_emri WHERE id = $1', [id]))?.calisma;
  const olaySayisi = async (id: number) =>
    (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_olayi WHERE emir_id = $1', [id]))?.n;

  // Aynı makinede iki başlamış emir: ilki duraklatılmış (makineyi bırakır), ikincisi çalışıyor.
  async function ikiliKur(): Promise<{ istasyonId: number; makineId: number; duraklamis: Emir; calisan: Emir }> {
    const istasyonId = await istasyonKur();
    const makineId = await makineKur(istasyonId);
    const duraklamis = await emirAc(istasyonId);
    assert.equal((await baslat(duraklamis.id, 'operator', makinede(makineId))).durum, 200);
    assert.equal((await komut(duraklamis.id, 'duraklat')).durum, 200);
    const calisan = await emirAc(istasyonId);
    assert.equal((await baslat(calisan.id, 'operator', makinede(makineId))).durum, 200, 'duraklamış emir makineyi bırakır');
    return { istasyonId, makineId, duraklamis, calisan };
  }

  test('makinede tek iş: dolu makinede ikinci başlatma 409 ve kimin hangi işi başlattığını döner; başka makinede ya da bitince başlar', async () => {
    const istasyonId = await istasyonKur();
    const m1 = await makineKur(istasyonId, 'Torna 1');
    const m2 = await makineKur(istasyonId);
    const ilk = await emirAc(istasyonId);
    assert.equal((await baslat(ilk.id, 'operator', makinede(m1))).durum, 200);
    const ikinci = await emirAc(istasyonId);
    const red = await istek<Hata & { ayrinti: unknown }>(kisiCerezi('operator2'), 'POST', `/uretim-emirleri/${ikinci.id}/baslat`, makinede(m1));
    assert.equal(red.durum, 409);
    assert.equal(red.govde.mesaj, MAKINE_DOLU);
    const ayrinti = makineDoluAyrintisi.parse(red.govde.ayrinti);
    assert.deepEqual([ayrinti.makine?.ad, ayrinti.emir.id, ayrinti.kisi.id], ['Torna 1', ilk.id, await kisiId('operator')]);
    assert.equal(await durumOku(ikinci.id), 'planli');
    assert.equal(await kayitSayisi(ikinci.id), 0);
    assert.equal((await baslat(ilk.id, 'operator', makinede(m1))).durum, 409, 'başlamış iş yeniden başlatılmaz');

    assert.equal((await baslat(ikinci.id, 'operator2', makinede(m2))).durum, 200, 'aynı istasyonda başka makinede başlar');
    const ucuncu = await emirAc(istasyonId);
    assert.equal((await baslat(ucuncu.id, 'operator', makinede(m1))).durum, 409);
    assert.equal((await bitir(ilk.id, 10)).durum, 200);
    assert.deepEqual(await acikKullanim(m1), [], 'bitirme makineyi bırakır');
    assert.equal((await baslat(ucuncu.id, 'operator', makinede(m1))).durum, 200);
  });

  test('bir kişi birden çok makinede iş tutabilir; seçilen makine istasyonda ve çalışır olmalı', async () => {
    const istasyonId = await istasyonKur();
    const m1 = await makineKur(istasyonId);
    const m2 = await makineKur(istasyonId);
    const c = await emirAc(istasyonId);
    assert.equal((await baslat(c.id, 'operator', { makineIdleri: [m1, m2] })).durum, 200, 'tek iş birden çok makinede');
    assert.deepEqual([(await acikKullanim(m1))[0]?.emirId, (await acikKullanim(m2))[0]?.emirId], [c.id, c.id]);
    const d = await emirAc(istasyonId);
    const m3 = await makineKur(istasyonId);
    assert.equal((await baslat(d.id, 'operator', makinede(m3))).durum, 200, 'aynı kişi başka makinede başka iş');
    assert.equal((await acikKullanim(m3))[0]?.kisiId, await kisiId('operator'));

    const e = await emirAc(istasyonId);
    const baskaIstasyon = await makineKur(await istasyonKur());
    assert.equal((await baslat(e.id, 'operator', makinede(baskaIstasyon))).durum, 400);
    const arizali = await makineKur(istasyonId);
    await sahip().sorgu("INSERT INTO istasyonlar_makine_durumu (makine_id, durum, degistiren_kisi_id) VALUES ($1, 'ariza', $2)", [arizali, yoneticiId]);
    assert.equal((await baslat(e.id, 'operator', makinede(arizali))).durum, 400, 'arızadaki makine seçilemez');
    assert.equal((await baslat(e.id, 'operator', { makineIdleri: [m1, m1] })).durum, 400, 'aynı makine iki kez seçilemez');
    assert.equal(await durumOku(e.id), 'planli');
  });

  test('makinesiz iş istasyon yerini tutar; dolu cevabı makinesizdir ve devralınabilir', async () => {
    const { emir: ilk, istasyonId } = await baslatilmis();
    const ikinci = await emirAc(istasyonId);
    const red = await istek<Hata & { ayrinti: unknown }>(kisiCerezi('operator2'), 'POST', `/uretim-emirleri/${ikinci.id}/baslat`);
    assert.equal(red.durum, 409);
    assert.equal(red.govde.mesaj, ISTASYON_DOLU);
    const ayrinti = makineDoluAyrintisi.parse(red.govde.ayrinti);
    assert.deepEqual([ayrinti.makine, ayrinti.emir.id], [null, ilk.id]);
    const devral = await komut(ikinci.id, 'makine-devral', 'operator2', { kullanimId: ayrinti.kullanimId });
    assert.equal(devral.govde.emir.durum, 'basladi');
    assert.equal((await canliAl(ilk.id))?.calisma, 'durakli');
    assert.equal((await komut(ilk.id, 'devam')).govde.mesaj, ISTASYON_DOLU);
  });

  test('duraklatma ve durdurma makineyi bırakır; devam son makinesine döner, makine doluysa reddedilir', async () => {
    await nedenleriKur();
    const { makineId, duraklamis, calisan } = await ikiliKur();
    const red = await komut(duraklamis.id, 'devam');
    assert.equal(red.durum, 409);
    assert.equal(red.govde.mesaj, MAKINE_DOLU);
    assert.equal((await canliAl(duraklamis.id))?.calisma, 'durakli');
    assert.equal(await olaySayisi(duraklamis.id), 1);
    assert.equal((await durdur(calisan.id, durusId)).govde.emir.canli?.calisma, 'durdu');
    assert.deepEqual(await acikKullanim(makineId), [], 'durmuş iş makineyi bırakır');
    assert.equal((await komut(duraklamis.id, 'devam')).govde.emir.canli?.calisma, 'calisiyor');
    assert.equal((await acikKullanim(makineId))[0]?.emirId, duraklamis.id);
    assert.equal((await komut(calisan.id, 'devam')).durum, 409);
    assert.equal((await bitir(duraklamis.id, 1)).durum, 200);
    assert.equal((await komut(calisan.id, 'devam')).durum, 200);
    assert.equal((await acikKullanim(makineId))[0]?.emirId, calisan.id);
  });

  test('makine devralma: öteki iş duraklar, bu iş o makinede başlar; gösterilen kullanım değiştiyse reddedilir', async () => {
    const { istasyonId, makineId, duraklamis, calisan } = await ikiliKur();
    const red = await komut(duraklamis.id, 'devam', 'operator2');
    const ayrinti = makineDoluAyrintisi.parse((red.govde as unknown as { ayrinti: unknown }).ayrinti);
    assert.equal(ayrinti.emir.id, calisan.id);

    const eski = await komut(duraklamis.id, 'makine-devral', 'operator2', { kullanimId: ayrinti.kullanimId + 1000 });
    assert.equal(eski.durum, 409);
    assert.equal(eski.govde.mesaj, DEVRAL_DEGISTI);
    const tamam = await komut(duraklamis.id, 'makine-devral', 'operator2', { kullanimId: ayrinti.kullanimId });
    assert.equal(tamam.durum, 200, JSON.stringify(tamam.govde));
    assert.equal(tamam.govde.emir.canli?.calisma, 'calisiyor');
    assert.equal((await canliAl(calisan.id))?.calisma, 'durakli', 'öteki iş duraklatıldı');
    assert.deepEqual(await acikKullanim(makineId), [{ emirId: duraklamis.id, kisiId: await kisiId('operator2') }]);
    const kapanan = await vt().tek<{ kapatan: number }>(
      'SELECT kapatan_id AS kapatan FROM uretim_emirleri_makine_kullanimi WHERE id = $1', [ayrinti.kullanimId]);
    assert.equal(kapanan?.kapatan, await kisiId('operator2'), 'kapatan kişi sunucudan yazılır');

    const yeni = await emirAc(istasyonId);
    const ikinciRed = await istek<Hata & { ayrinti: unknown }>(kisiCerezi('operator'), 'POST', `/uretim-emirleri/${yeni.id}/baslat`, makinede(makineId));
    const ikinciAyrinti = makineDoluAyrintisi.parse(ikinciRed.govde.ayrinti);
    const planli = await komut(yeni.id, 'makine-devral', 'operator', { kullanimId: ikinciAyrinti.kullanimId });
    assert.equal(planli.govde.emir.durum, 'basladi', 'planlı iş devralınca başlar');
    assert.equal((await komut(yeni.id, 'makine-devral', 'operator', { kullanimId: ikinciAyrinti.kullanimId })).govde.mesaj, DEVRAL_DURUMU);
  });

  test('katılım: ekipteki ikinci kişi çalışan işe uyarıyla katılır; herkes kendi çalışmasını duraklatır ve bitirir; adet işin toplamına eklenir', async () => {
    const katilim = (id: number, yol: string, kim: string) => istek<Hata>(kisiCerezi(kim), 'POST', `/uretim-emirleri/${id}/${yol}`);
    const liste = async (id: number) => katilimCevabi.parse((await plan('GET', `/uretim-emirleri/${id}/katilimlar`)).govde).katilimlar;
    const kisiNo = async (ad: string) => (await vt().tek<{ id: number }>('SELECT id FROM kisi WHERE kullanici_adi = $1', [ad]))!.id;
    const { emir, istasyonId } = await baslatilmis();
    const op1 = await kisiNo('operator');
    const op2 = await kisiNo('operator2');
    assert.deepEqual((await liste(emir.id)).map((k) => [k.kisi.id, k.cikis]), [[op1, null]], 'başlatan katılımcıdır');

    const disarida = await katilim(emir.id, 'katil', 'operator2');
    assert.equal(disarida.durum, 403);
    assert.equal(disarida.govde.mesaj, EKIP_DISI);
    sayac += 1;
    const ekip = (await sahip().tek<{ id: number }>('INSERT INTO ekip (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`UEK${sayac}`, 'Montaj ekibi', istasyonId]))!.id;
    await sahip().sorgu('INSERT INTO ekip_uye (ekip_id, kisi_id, baslangic, yuzde) VALUES ($1, $2, current_date, 10)', [ekip, op2]);

    const katildi = await katilim(emir.id, 'katil', 'operator2');
    assert.equal(katildi.durum, 200, JSON.stringify(katildi.govde));
    assert.match(katilimCevabi.parse(katildi.govde).uyari ?? '', /Deneme operator de çalışıyor/);
    assert.equal((await katilim(emir.id, 'katil', 'operator2')).govde.mesaj, KATILIM_ACIK);
    assert.equal((await sayimYap(emir.id, 3, 'operator2')).durum, 200);
    assert.equal((await sayimYap(emir.id, 2, 'operator')).durum, 200);
    await ilkParcaOnay(emir.id);
    assert.equal((await canliAl(emir.id))?.saglam, 5, 'iki kişinin adedi işin toplamı');
    const kisiAdetleri = await vt().sorgu<{ kisi_id: number; s: number }>(
      "SELECT kisi_id, sum(adet)::int AS s FROM uretim_sayimi WHERE emir_id = $1 AND tur = 'saglam' GROUP BY kisi_id ORDER BY kisi_id", [emir.id]);
    assert.deepEqual(kisiAdetleri.map((x) => [x.kisi_id, x.s]).sort((a, b) => a[0]! - b[0]!), [[op1, 2], [op2, 3]].sort((a, b) => a[0]! - b[0]!), 'onaylanan adet sayanındır (348 a)');

    assert.equal((await katilim(emir.id, 'katilim/duraklat', 'operator2')).durum, 200);
    assert.equal((await katilim(emir.id, 'katilim/duraklat', 'operator2')).govde.mesaj, KATILIM_YOK);
    assert.equal((await canliAl(emir.id))?.calisma, 'calisiyor', 'kişinin duraklatması işi duraklatmaz');
    let k = await liste(emir.id);
    assert.deepEqual(k.map((x) => [x.kisi.id, x.kapanis]), [[op1, null], [op2, 'duraklat']]);
    assert.equal((await katilim(emir.id, 'katil', 'operator2')).durum, 200, 'duraklattığı işe döner');
    assert.equal((await katilim(emir.id, 'katilim/ayril', 'operator2')).durum, 200);
    assert.equal((await katilim(emir.id, 'katilim/ayril', 'operator2')).govde.mesaj, KATILIM_YOK);

    assert.equal((await komut(emir.id, 'duraklat')).durum, 200);
    k = await liste(emir.id);
    assert.equal(k.find((x) => x.kisi.id === op1)?.kapanis, 'emir', 'emrin duraklatılması açık çalışmaları kapatır');
    assert.equal((await katilim(emir.id, 'katil', 'operator2')).govde.mesaj, KATILIM_CALISMIYOR);
    assert.equal((await komut(emir.id, 'devam')).durum, 200);
    assert.equal((await liste(emir.id)).filter((x) => x.cikis === null).map((x) => x.kisi.id).join(), String(op1), 'devam ettiren işe döner');
    assert.equal((await bitir(emir.id, 5)).durum, 200);
    assert.equal((await liste(emir.id)).filter((x) => x.cikis === null).length, 0, 'bitince herkes çıkar');
    assert.equal((await istek(kisiCerezi('operator'), 'GET', `/uretim-emirleri/${emir.id}/katilimlar`)).durum, 200, 'terminaldeki kişi görür');
  });

  test('tek çalışan: duraklamış emir durdurulamaz (önce devam); red olay yazmaz', async () => {
    await nedenleriKur();
    const { emir } = await baslatilmis();
    await komut(emir.id, 'duraklat');
    const red = await durdur(emir.id, durusId);
    assert.equal(red.durum, 409);
    assert.equal(red.govde.mesaj, DURAKLI_DURDUR);
    assert.equal(await olaySayisi(emir.id), 1);
    await komut(emir.id, 'devam');
    assert.equal((await durdur(emir.id, durusId)).durum, 200);
  });

  test('tek çalışan: duraklamış emirde ve çalışan komşuda sayım serbest; sayım ve duruş işlemleri yalnız başlamış emirde', async () => {
    const { duraklamis, calisan } = await ikiliKur();
    assert.equal((await sayimYap(duraklamis.id, 2)).durum, 200);
    assert.equal((await sayimYap(calisan.id, 3)).durum, 200);
    assert.equal((await komut(calisan.id, 'duraklat')).durum, 200);
  });

  test('veritabanı kısıtı: makinede ikinci açık kullanım doğrudan yazılsa da reddedilir; kapanış kişisiz olmaz', async () => {
    const { istasyonId, makineId, calisan } = await ikiliKur();
    const yaz = () => sahip().sorgu(
      'INSERT INTO uretim_emirleri_makine_kullanimi (emir_id, istasyon_id, makine_id, kisi_id, baslama) VALUES ($1, $2, $3, $4, now())',
      [calisan.id, istasyonId, makineId, yoneticiId]);
    await assert.rejects(yaz(), (h: { constraint?: string }) => h.constraint === 'uretim_emirleri_makine_kullanimi_makinede_tek');
    await assert.rejects(
      sahip().sorgu('UPDATE uretim_emirleri_makine_kullanimi SET bitis = now() WHERE makine_id = $1 AND bitis IS NULL', [makineId]),
      (h: { constraint?: string }) => h.constraint === 'uretim_emirleri_makine_kullanimi_kapanis',
    );
    assert.equal(await calismaOku(calisan.id), 'calisiyor');
  });

  test('yarış: aynı makinedeki iki duraklamış emre aynı anda devam denince tek kazanan çıkar', async () => {
    const istasyonId = await istasyonKur();
    const m = await makineKur(istasyonId);
    const a = await emirAc(istasyonId);
    await baslat(a.id, 'operator', makinede(m));
    await komut(a.id, 'duraklat');
    const b = await emirAc(istasyonId);
    await baslat(b.id, 'operator', makinede(m));
    await komut(b.id, 'duraklat');
    const sonuclar = await Promise.all([komut(a.id, 'devam'), komut(b.id, 'devam', 'operator2')]);
    assert.deepEqual(sonuclar.map((s) => s.durum).sort(), [200, 409]);
    assert.equal(sonuclar.find((s) => s.durum === 409)?.govde.mesaj, MAKINE_DOLU);
    assert.equal((await acikKullanim(m)).length, 1);
    assert.equal((await olaySayisi(a.id) ?? 0) + (await olaySayisi(b.id) ?? 0), 3, 'kaybedenin devam olayı yazılmaz');
  });

  test('yarış: ön denetimi geçip makine kısıtına takılan başlatma onay sonrası anlamlı 409 alır (tutulan işlemle)', async () => {
    const istasyonId = await istasyonKur();
    const m = await makineKur(istasyonId);
    const a = await emirAc(istasyonId);
    const b = await emirAc(istasyonId);
    // A'nın kullanımı yazılmış ama onaylanmamıştır: B'nin ön denetimi onu görmez, kısıt onay sonrası reddeder.
    const [sonuc] = await beklet(
      (db) => db.sorgu(
        'INSERT INTO uretim_emirleri_makine_kullanimi (emir_id, istasyon_id, makine_id, kisi_id, baslama) VALUES ($1, $2, $3, $4, now())',
        [a.id, istasyonId, m, yoneticiId]),
      1, () => [baslat(b.id, 'operator', makinede(m))] as const,
    );
    assert.equal(sonuc.durum, 409);
    assert.equal(sonuc.govde.mesaj, MAKINE_DOLU);
    assert.equal(await durumOku(b.id), 'planli');
    assert.equal(await kayitSayisi(b.id), 0, 'reddedilen başlatma kayıt bırakmaz');
  });

  test('yarış: aynı makineye iki emri aynı anda başlatınca tek kazanan çıkar', async () => {
    const istasyonId = await istasyonKur();
    const m = await makineKur(istasyonId);
    const a = await emirAc(istasyonId);
    const b = await emirAc(istasyonId);
    const sonuclar = await Promise.all([baslat(a.id, 'operator', makinede(m)), baslat(b.id, 'operator2', makinede(m))]);
    assert.deepEqual(sonuclar.map((s) => s.durum).sort(), [200, 409]);
    assert.equal(sonuclar.find((s) => s.durum === 409)?.govde.mesaj, MAKINE_DOLU);
    assert.equal((await acikKullanim(m)).length, 1);
    assert.equal((await kayitSayisi(a.id) ?? 0) + (await kayitSayisi(b.id) ?? 0), 1);
  });

  test('yarış: aynı emri iki kişi aynı anda başlatırsa ve bitirirse tek kazanan çıkar, defterde tek satır kalır', async () => {
    const istasyonId = await istasyonKur();
    const emir = await emirAc(istasyonId);
    const baslatmalar = await Promise.all([baslat(emir.id), baslat(emir.id, 'operator2')]);
    assert.deepEqual(baslatmalar.map((s) => s.durum).sort(), [200, 409]);
    assert.equal(await kayitSayisi(emir.id), 1);

    const bitirmeler = await Promise.all([bitir(emir.id, 7), bitir(emir.id, 8, 'operator2')]);
    assert.deepEqual(bitirmeler.map((s) => s.durum).sort(), [200, 409]);
    const kazanan = bitirmeler.find((s) => s.durum === 200);
    const son = (await plan<{ emir: Emir }>('GET', `/uretim-emirleri/${emir.id}`)).govde.emir;
    assert.equal(son.saglamAdet, kazanan?.govde.emir.saglamAdet);
    assert.equal(await kayitSayisi(emir.id), 2);
  });

  test('aynı işlem: başlatmanın defter yazısı düşerse emir durumu da geri alınır', async () => {
    const istasyonId = await istasyonKur();
    const emir = await emirAc(istasyonId);
    await sahip().sorgu(`CREATE FUNCTION uretim_kaydi_deneme_hatasi() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'deneme'; END $$`);
    await sahip().sorgu('CREATE TRIGGER uretim_kaydi_deneme BEFORE INSERT ON uretim_kaydi FOR EACH ROW EXECUTE FUNCTION uretim_kaydi_deneme_hatasi()');
    try {
      assert.equal((await baslat(emir.id)).durum, 500);
      assert.equal(await durumOku(emir.id), 'planli');
      assert.equal((await vt().tek<{ n: number }>("SELECT count(*)::int AS n FROM uretim_emri WHERE istasyon_id = $1 AND durum = 'basladi'", [istasyonId]))?.n, 0);
    } finally {
      await sahip().sorgu('DROP TRIGGER uretim_kaydi_deneme ON uretim_kaydi');
      await sahip().sorgu('DROP FUNCTION uretim_kaydi_deneme_hatasi()');
    }
    assert.equal((await baslat(emir.id)).durum, 200);

    await sahip().sorgu(`CREATE FUNCTION uretim_kaydi_deneme_hatasi() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'deneme'; END $$`);
    await sahip().sorgu('CREATE TRIGGER uretim_kaydi_deneme BEFORE INSERT ON uretim_kaydi FOR EACH ROW EXECUTE FUNCTION uretim_kaydi_deneme_hatasi()');
    try {
      assert.equal((await bitir(emir.id, 3)).durum, 500);
      assert.equal(await durumOku(emir.id), 'basladi');
      assert.equal((await plan<{ emir: Emir }>('GET', `/uretim-emirleri/${emir.id}`)).govde.emir.saglamAdet, null);
    } finally {
      await sahip().sorgu('DROP TRIGGER uretim_kaydi_deneme ON uretim_kaydi');
      await sahip().sorgu('DROP FUNCTION uretim_kaydi_deneme_hatasi()');
    }
  });

  test('yalnız ekleme: defter satırı güncellenemez, silinemez, boşaltılamaz', async () => {
    const { emir } = await baslatilmis();
    await bitir(emir.id, 2);
    const degistir = 'UPDATE uretim_kaydi SET saglam_adet = 99 WHERE emir_id = $1';
    const sil = 'DELETE FROM uretim_kaydi WHERE emir_id = $1';
    for (const [kim, baglanti] of [['uygulama', vt()], ['sahip', sahip()]] as const) {
      await assert.rejects(baglanti.sorgu(degistir, [emir.id]), /yalnız ekleme/, `UPDATE (${kim})`);
      await assert.rejects(baglanti.sorgu(sil, [emir.id]), /yalnız ekleme/, `DELETE (${kim})`);
    }
    await assert.rejects(vt().sorgu('TRUNCATE uretim_kaydi'), izinYok, 'TRUNCATE (uygulama)');
    await assert.rejects(sahip().sorgu('TRUNCATE uretim_kaydi'), /yalnız ekleme/, 'TRUNCATE (sahip)');
    assert.equal(await kayitSayisi(emir.id), 2);
    assert.deepEqual(
      (await vt().sorgu<{ saglam_adet: number | null }>('SELECT saglam_adet FROM uretim_kaydi WHERE emir_id = $1 ORDER BY id', [emir.id])).map((s) => s.saglam_adet),
      [null, 2],
    );
  });

  test('liste: verilmezse yalnız açık emirler, kapsam=hepsi bitenleri de verir; durum süzgeci çalışır; en yeni üstte; geçersiz süzgeç 400 (kart #1323)', async () => {
    const ist = await istasyonKur();
    const planli = await emirAc(ist);
    const iptalli = await emirAc(ist);
    await iptal(iptalli.id);
    const acik = emirlerCevabi.parse((await plan('GET', '/uretim-emirleri')).govde).emirler;
    const idler = acik.map((e) => e.id);
    assert.ok(idler.includes(planli.id) && !idler.includes(iptalli.id), 'iptal varsayılan listede yok');
    assert.ok(acik.every((e) => e.durum !== 'bitti' && e.durum !== 'iptal'));
    assert.equal(acik.find((e) => e.id === planli.id)?.malzemeNo, null, 'istasyonlu emrin malzeme kartı yoktur');
    assert.deepEqual(idler, [...idler].sort((x, y) => y - x));
    const hepsi = emirlerCevabi.parse((await plan('GET', '/uretim-emirleri?kapsam=hepsi')).govde).emirler.map((e) => e.id);
    assert.ok(hepsi.includes(planli.id) && hepsi.includes(iptalli.id));
    const yalnizIptal = emirlerCevabi.parse((await plan('GET', '/uretim-emirleri?durum=iptal')).govde).emirler;
    assert.ok(yalnizIptal.length > 0);
    assert.ok(yalnizIptal.every((e) => e.durum === 'iptal'));
    assert.ok(yalnizIptal.some((e) => e.id === iptalli.id));
    assert.ok(!yalnizIptal.some((e) => e.id === planli.id));
    assert.equal((await plan('GET', '/uretim-emirleri?durum=bilinmeyen')).durum, 400);
    assert.equal((await plan('GET', '/uretim-emirleri?kapsam=bilinmeyen')).durum, 400);
  });

  test('bitenler: yalnız bitmiş ve iptal emirler, en yeni önce, sayfalı; durum ve arama süzer (kart #1323)', async () => {
    const ist = await istasyonKur();
    const etiket = `BT${randomUUID().slice(0, 8)}`;
    const ac = () => emirAc(ist, { parcaAd: `${etiket} parça` });
    const acikKalan = await ac();
    const iptaller = [await ac(), await ac()];
    for (const e of iptaller) await iptal(e.id);
    const biten = await ac();
    assert.equal((await op('POST', `/uretim-emirleri/${biten.id}/baslat`)).durum, 200);
    assert.equal((await bitir(biten.id, 0)).durum, 200);
    type Sayfa = { satirlar: Emir[]; toplam: number | null; sayfa: number; sayfaBoyu: number };
    const oku = async (sorgu: string) => {
      const c = await plan<Sayfa>('GET', `/uretim-emirleri/bitenler?ara=${etiket.toLowerCase()}${sorgu}`);
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return c.govde;
    };
    const ilk = await oku('&sayfaBoyu=2');
    assert.deepEqual([ilk.toplam, ilk.sayfa, ilk.sayfaBoyu], [3, 1, 2]);
    assert.deepEqual(ilk.satirlar.map((e) => e.id), [biten.id, iptaller[1]!.id], 'en yeni önce; açık emir yok');
    const ikinci = await oku('&sayfaBoyu=2&sayfa=2');
    assert.deepEqual(ikinci.satirlar.map((e) => e.id), [iptaller[0]!.id]);
    assert.deepEqual((await oku('&durum=bitti')).satirlar.map((e) => [e.id, e.durum]), [[biten.id, 'bitti']]);
    assert.equal((await oku('')).satirlar.some((e) => e.id === acikKalan.id), false);
    assert.equal((await plan<Sayfa>('GET', '/uretim-emirleri/bitenler?ara=%25')).govde.satirlar.length, 0, 'yüzde işareti joker değildir');
    assert.equal((await plan('GET', '/uretim-emirleri/bitenler?durum=planli')).durum, 400);
  });

  const merkezi = async (istasyonId: number): Promise<number> =>
    (await sahip().tek<{ is_merkezi_id: number }>('SELECT is_merkezi_id FROM istasyon WHERE id = $1', [istasyonId]))?.is_merkezi_id ?? 0;
  const yetkinKil = async (kisiId: number, istasyonId: number) => {
    await sahip().sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [kisiId, istasyonId]);
  };
  const kapsamYaz = async (...merkezler: number[]) => {
    await sahip().sorgu('DELETE FROM kisi_is_merkezi WHERE kisi_id = $1', [kapsamliId]);
    for (const m of merkezler) await sahip().sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [kapsamliId, m]);
  };

  test('kapsam: iş merkezi kısıtı dışındaki istasyonda başlatma ve bitirme 403; kapsamdaki ve kısıtsız kişi etkilenmez', async () => {
    const ist = await istasyonKur();
    const baska = await istasyonKur();
    const emir = await emirAc(ist);
    await kapsamYaz(await merkezi(baska));
    try {
      const red = await baslat(emir.id, 'kapsamli');
      assert.equal(red.durum, 403);
      assert.equal(red.govde.mesaj, 'Bu istasyonun iş merkezinde çalışma yetkiniz yok.');
      assert.equal(await durumOku(emir.id), 'planli');
      assert.equal(await kayitSayisi(emir.id), 0);

      // Kısıtsız kişi aynı emri başlatır; kısıtlı kişi bitirmeyi de yapamaz.
      assert.equal((await baslat(emir.id)).durum, 200);
      const bitirRed = await bitir(emir.id, 5, 'kapsamli');
      assert.equal(bitirRed.durum, 403);
      assert.equal(await durumOku(emir.id), 'basladi');
      assert.equal(await kayitSayisi(emir.id), 1);

      // Vardiya devri: kapsama alınan kişi başlatılmış işi bitirir ve kayda yazılır.
      await kapsamYaz(await merkezi(ist));
      assert.equal((await bitir(emir.id, 5, 'kapsamli')).durum, 200);
      const ayrinti = emirAyrintiCevabi.parse((await plan('GET', `/uretim-emirleri/${emir.id}`)).govde);
      assert.deepEqual(ayrinti.kayitlar.filter((k) => k.olay !== 'duzeltme').map((k) => k.kisi.ad), ['Deneme operator', 'Deneme kapsamli']);

      const ikinci = await emirAc(baska);
      await kapsamYaz(await merkezi(ist));
      assert.equal((await baslat(ikinci.id, 'kapsamli')).durum, 403);
      await kapsamYaz(await merkezi(ist), await merkezi(baska));
      await yetkinKil(kapsamliId, baska);
      assert.equal((await baslat(ikinci.id, 'kapsamli')).durum, 200);
    } finally {
      await kapsamYaz();
    }
    await yetkinKil(kapsamliId, ist);
    assert.equal((await emirAc(ist).then((e) => baslat(e.id, 'kapsamli'))).durum, 200, 'kısıt satırı yoksa her istasyon açıktır');
  });

  test('yarış: başlatma ile iptal aynı planlı emirde yarışırsa tek kazanan çıkar, defter durumla tutarlı kalır', async () => {
    for (let tur = 0; tur < 4; tur += 1) {
      const emir = await emirAc(await istasyonKur());
      const [b, i] = await Promise.all([baslat(emir.id), iptal(emir.id)]);
      assert.deepEqual([b.durum, i.durum].sort(), [200, 409]);
      const durum = await durumOku(emir.id);
      assert.equal(durum, b.durum === 200 ? 'basladi' : 'iptal');
      assert.equal(await kayitSayisi(emir.id), durum === 'basladi' ? 1 : 0);
    }
  });

  test('yarış: aynı sürümle iki iptal aynı anda gelirse tek kazanan çıkar, öbürü eski sürüme düşer', async () => {
    const emir = await emirAc(await istasyonKur());
    const ipt = () => istek<{ emir: Emir } & Hata>(kisiCerezi('planlama_proje'), 'POST', `/uretim-emirleri/${emir.id}/iptal`, { surum: emir.surum });
    const sonuclar = await Promise.all([ipt(), ipt()]);
    assert.deepEqual(sonuclar.map((s) => s.durum).sort(), [200, 409]);
    assert.equal(sonuclar.find((s) => s.durum === 409)?.govde.mesaj, ESKI_SURUM_ILETISI);
    assert.equal(await durumOku(emir.id), 'iptal');
    assert.equal(await kayitSayisi(emir.id), 0);
  });

  test('emir no: altı haneyi aşan kimlikte kesilmez ve benzersiz kalır', async () => {
    const ist = await istasyonKur();
    await sahip().sorgu('ALTER TABLE uretim_emri ALTER COLUMN id RESTART WITH 999999');
    const nolar: string[] = [];
    for (let i = 0; i < 3; i += 1) nolar.push((await emirAc(ist)).emirNo);
    assert.deepEqual(nolar, ['UE-999999', 'UE-1000000', 'UE-1000001']);
    await sahip().sorgu('ALTER TABLE uretim_emri ALTER COLUMN id RESTART WITH 1234567');
    const uzun = await emirAc(ist);
    assert.equal(uzun.emirNo, 'UE-1234567');
    assert.equal(uzun.id, 1234567);
  });

  test('kapsam: bayraklı kişi kısıt satırı yazılmış olsa da başlatır ve bitirir', async () => {
    const ist = await istasyonKur();
    const baska = await istasyonKur();
    const emir = await emirAc(ist);
    await sahip().sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [yoneticiId, await merkezi(baska)]);
    try {
      assert.equal((await baslat(emir.id, 'yonetici')).durum, 200);
      assert.equal((await bitir(emir.id, 3, 'yonetici')).durum, 200);
    } finally {
      await sahip().sorgu('DELETE FROM kisi_is_merkezi WHERE kisi_id = $1', [yoneticiId]);
    }
  });

  // ---------------- sayım, duruş, hurda (#151 dilim 1) ----------------

  type EmirCevabiHata = { emir: Emir; uyari?: string | null } & Hata;
  const komut = (id: number, yol: string, kim = 'operator', govde?: unknown) =>
    istek<EmirCevabiHata>(kisiCerezi(kim), 'POST', `/uretim-emirleri/${id}/${yol}`, govde);
  const sayimYap = (id: number, adet: number, kim = 'operator') => komut(id, 'sayim', kim, { tur: 'saglam', adet });
  const hurdaYap = (id: number, adet: number, hurdaNedeniId: number, kim = 'operator') =>
    komut(id, 'sayim', kim, { tur: 'hurda', adet, hurdaNedeniId });
  const ayarla = (id: number, saglam: number, kim = 'operator') => komut(id, 'sayim-ayarla', kim, { saglam });
  const durdur = (id: number, durusNedeniId: number, kim = 'operator') => komut(id, 'durdur', kim, { durusNedeniId });
  const ayrintiAl = async (id: number) => emirAyrintiCevabi.parse((await plan('GET', `/uretim-emirleri/${id}`)).govde);
  const canliAl = async (id: number) => (await ayrintiAl(id)).emir.canli;
  // 327 a: ilk parça onaylanana kadar sağlam sayım karar bekler; sağlam akışını ölçen testler onu önce onaylar.
  const ilkParcaOnay = (id: number) => vt().tx((db) => kararliSayimiSonuclandir(db, yoneticiId, id, 'onay'));
  const toplam = async (emirId: number) =>
    (await vt().tek<{ s: number; h: number; n: number }>(
      `SELECT COALESCE(sum(adet) FILTER (WHERE tur = 'saglam'), 0)::int AS s, COALESCE(sum(adet) FILTER (WHERE tur = 'hurda'), 0)::int AS h,
              count(*)::int AS n FROM uretim_sayimi WHERE emir_id = $1`, [emirId]))!;

  let durusId = 0;
  let durusPasifId = 0;
  let hurdaId = 0;
  let hurdaPasifId = 0;
  const nedenleriKur = async (): Promise<void> => {
    if (durusId !== 0) return;
    durusId = (await sahip().tek<{ id: number }>("INSERT INTO durus_nedeni (kod, ad, kategori, sira) VALUES ('UT-D1', 'Deneme duruşu', 'plansiz', 901) RETURNING id"))!.id;
    durusPasifId = (await sahip().tek<{ id: number }>("INSERT INTO durus_nedeni (kod, ad, kategori, sira, aktif) VALUES ('UT-D2', 'Pasif duruş', 'plansiz', 902, false) RETURNING id"))!.id;
    hurdaId = (await sahip().tek<{ id: number }>("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('UT-H1', 'Deneme hurdası', 901) RETURNING id"))!.id;
    hurdaPasifId = (await sahip().tek<{ id: number }>("INSERT INTO hurda_nedeni (kod, ad, sira, aktif) VALUES ('UT-H2', 'Pasif hurda', 902, false) RETURNING id"))!.id;
  };

  // Bir işlem kilidi tutarken istekler gönderilir; tutucuyu (dolaylı olarak) bekleyen bağlantılar görülünce kilit
  // bırakılır (sabit bekleme yok). Yoklama yalnız bu tutucuya bağlı bekleyenleri sayar: başka dosyaların bekleyişi karışmaz.
  // Kilit her durumda `finally` ile bırakılır.
  async function beklet<T extends readonly Promise<unknown>[]>(
    tut: (db: Db) => Promise<unknown>, bekleyenSayisi: number, istekler: () => readonly [...T],
  ): Promise<{ [K in keyof T]: Awaited<T[K]> }> {
    let tutucuPid = 0;
    let hazirOl!: () => void;
    let birak!: () => void;
    const hazir = new Promise<void>((coz) => { hazirOl = coz; });
    const tutulan = new Promise<void>((coz) => { birak = coz; });
    const ilk = sahip().tx(async (db) => {
      tutucuPid = (await db.tek<{ p: number }>('SELECT pg_backend_pid() AS p'))?.p ?? 0;
      await tut(db);
      hazirOl();
      await tutulan;
    });
    // Tutucu kilidi alamadan düşerse bekleme sonsuza gitmesin.
    await Promise.race([hazir, ilk]);
    let bekleyenler: Promise<unknown>[] = [];
    try {
      bekleyenler = [...istekler()];
      for (let i = 0; i < 500; i += 1) {
        const n = (await sahip().tek<{ n: number }>(
          `WITH RECURSIVE b(pid) AS (
             SELECT l.pid FROM pg_locks l WHERE NOT l.granted AND $1 = ANY(pg_blocking_pids(l.pid))
             UNION
             SELECT l.pid FROM pg_locks l JOIN b ON b.pid = ANY(pg_blocking_pids(l.pid)) WHERE NOT l.granted
           ) SELECT count(DISTINCT pid)::int AS n FROM b`, [tutucuPid]))?.n ?? 0;
        if (n >= bekleyenSayisi) break;
        await new Promise((coz) => setTimeout(coz, 10));
      }
    } finally {
      birak();
      await ilk;
    }
    return (await Promise.all(bekleyenler)) as { [K in keyof T]: Awaited<T[K]> };
  }

  // Emir satır kilidi tutulur: kilidi doğru alan komutlar sıraya girer.
  const kilitliyken = <T extends readonly Promise<unknown>[]>(emirId: number, bekleyen: number, istekler: () => readonly [...T]) =>
    beklet((db) => db.sorgu('SELECT 1 FROM uretim_emri WHERE id = $1 FOR UPDATE', [emirId]), bekleyen, istekler);

  // Yazmalar tablo kilidinde bekletilir, okumalar serbesttir: emir kilidi yoksa iki istek de eski durumu okuyup
  // yazar (kayıp güncelleme); emir kilidi varsa ikincisi birincinin yazısını görür.
  const yazmaTutarak = <T extends readonly Promise<unknown>[]>(tablolar: string[], bekleyen: number, istekler: () => readonly [...T]) =>
    beklet((db) => db.sorgu(`LOCK TABLE ${tablolar.join(', ')} IN SHARE ROW EXCLUSIVE MODE`), bekleyen, istekler);

  test('yetki: sayım ve duruş uçları operatör, müdür ve yöneticide; öbür roller 403, girişsiz 401; red durumu değiştirmez', async () => {
    await nedenleriKur();
    const { emir } = await baslatilmis();
    const uclar: [string, unknown][] = [
      ['sayim', { tur: 'saglam', adet: 1 }], ['sayim-ayarla', { saglam: 5 }], ['duraklat', undefined],
      ['devam', undefined], ['durdur', { durusNedeniId: durusId }],
    ];
    for (const [yol, govde] of uclar) {
      assert.equal((await istek(null, 'POST', `/uretim-emirleri/${emir.id}/${yol}`, govde)).durum, 401, `${yol} girişsiz`);
      for (const kim of ['planlama_proje', ...DIGER_ROLLER]) assert.equal((await komut(emir.id, yol, kim, govde)).durum, 403, `${yol}: ${kim}`);
    }
    assert.deepEqual(await toplam(emir.id), { s: 0, h: 0, n: 0 });
    assert.equal((await canliAl(emir.id))?.calisma, 'calisiyor');
    for (const kim of ['operator', 'mudur', 'yonetici']) assert.equal((await sayimYap(emir.id, 1, kim)).durum, 200, kim);
    assert.equal((await komut(emir.id, 'duraklat', 'mudur')).durum, 200);
    assert.equal((await komut(emir.id, 'devam', 'yonetici')).durum, 200);
    assert.equal((await durdur(emir.id, durusId, 'mudur')).durum, 200);
  });

  test('kapsam: kısıt dışı istasyonda sayım ve duruş komutlarının hepsi 403; kapsamdaki ve devralan kişi yapar', async () => {
    await nedenleriKur();
    const ist = await istasyonKur();
    const baska = await istasyonKur();
    const emir = await emirAc(ist);
    await baslat(emir.id);
    await kapsamYaz(await merkezi(baska));
    try {
      const uclar: [string, unknown][] = [
        ['sayim', { tur: 'saglam', adet: 1 }], ['sayim-ayarla', { saglam: 5 }], ['duraklat', undefined],
        ['devam', undefined], ['durdur', { durusNedeniId: durusId }],
      ];
      for (const [yol, govde] of uclar) {
        const red = await komut(emir.id, yol, 'kapsamli', govde);
        assert.equal(red.durum, 403, yol);
        assert.equal(red.govde.mesaj, 'Bu istasyonun iş merkezinde çalışma yetkiniz yok.');
      }
      assert.deepEqual(await toplam(emir.id), { s: 0, h: 0, n: 0 });
      await kapsamYaz(await merkezi(ist));
      assert.equal((await sayimYap(emir.id, 2, 'kapsamli')).durum, 200);
      assert.equal((await komut(emir.id, 'duraklat', 'kapsamli')).durum, 200);
    } finally {
      await kapsamYaz();
    }
  });

  test('tekrar koruması: emir açma, sayım ve sayım-ayarla aynı kimlikle ikinci kez uygulanmaz; kimliksiz istek 400 (denetim S-02, S-04)', async () => {
    const ist = await istasyonKur();
    assert.equal((await istek(kisiCerezi('planlama_proje'), 'POST', '/uretim-emirleri', govde(ist), null)).durum, 400);
    const k = randomUUID();
    const ilk = await istek<{ emir: Emir }>(kisiCerezi('planlama_proje'), 'POST', '/uretim-emirleri', govde(ist), k);
    const ikinci = await istek<{ emir: Emir }>(kisiCerezi('planlama_proje'), 'POST', '/uretim-emirleri', govde(ist), k);
    assert.deepEqual([ilk.durum, ikinci.durum, ikinci.govde.emir.id], [200, 200, ilk.govde.emir.id], 'yeniden gönderim aynı emri döner');
    const acilan = await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri WHERE istasyon_id = $1', [ist]);
    assert.equal(acilan?.n, 1);

    const { emir } = await baslatilmis();
    const sayim = (govde: unknown, kimlik: string | null) => istek<EmirCevabiHata>(kisiCerezi('operator'), 'POST', `/uretim-emirleri/${emir.id}/sayim`, govde, kimlik);
    assert.equal((await sayim({ tur: 'saglam', adet: 1 }, null)).durum, 400);
    const ks = randomUUID();
    assert.equal((await sayim({ tur: 'saglam', adet: 1 }, ks)).durum, 200);
    await ilkParcaOnay(emir.id);
    const tekrar = await sayim({ tur: 'saglam', adet: 1 }, ks);
    assert.deepEqual([tekrar.durum, tekrar.govde.emir.canli?.saglam], [200, 0], 'ağ kopup yeniden gönderilen dokunuş ilk cevabı alır (onaydan önceydi)');
    assert.deepEqual(await toplam(emir.id), { s: 1, h: 0, n: 3 }, 'karar bekliyor +1/-1 ve onayın sağlamı');
    const ka = randomUUID();
    const ayar = (kimlik: string | null) => istek<EmirCevabiHata>(kisiCerezi('operator'), 'POST', `/uretim-emirleri/${emir.id}/sayim-ayarla`, { saglam: 5 }, kimlik);
    assert.equal((await ayar(null)).durum, 400);
    assert.equal((await ayar(ka)).durum, 200);
    assert.equal((await sayimYap(emir.id, 2)).durum, 200);
    const gec = await ayar(ka);
    assert.deepEqual([gec.durum, (await canliAl(emir.id))?.saglam], [200, 7], 'geç gelen kopya aradaki sayımı ezmez');
  });

  test('tekrar koruması: başlat, duraklat, devam, durdur ve bitir aynı kimlikle ikinci kez uygulanmaz; kimliksiz istek 400 (kart #1323)', async () => {
    const ist = await istasyonKur();
    const emir = await emirAc(ist);
    const neden = (await sahip().tek<{ id: number }>(
      "INSERT INTO durus_nedeni (kod, ad, kategori, sira) VALUES ('UT-TK1', 'Tekrar duruşu', 'plansiz', 931) RETURNING id"))!.id;
    const adimlar: Array<[string, unknown]> = [
      ['baslat', undefined], ['duraklat', undefined], ['devam', undefined], ['durdur', { durusNedeniId: neden }], ['bitir', { saglamAdet: 0 }],
    ];
    for (const [son, govde] of adimlar) {
      const gonder = (kimlik: string | null) =>
        istek<EmirCevabiHata>(kisiCerezi('operator'), 'POST', `/uretim-emirleri/${emir.id}/${son}`, govde, kimlik);
      assert.equal((await gonder(null)).durum, 400, `${son}: kimliksiz`);
      const k = randomUUID();
      const ilk = await gonder(k);
      assert.equal(ilk.durum, 200, `${son}: ${JSON.stringify(ilk.govde)}`);
      const kayit = await kayitSayisi(emir.id);
      const ikinci = await gonder(k);
      assert.deepEqual([ikinci.durum, ikinci.govde], [200, ilk.govde], `${son}: yeniden gönderim ilk cevabı alır, reddedilmez`);
      assert.equal(await kayitSayisi(emir.id), kayit, `${son}: ikinci kez yazılmaz`);
    }
    assert.equal(await durumOku(emir.id), 'bitti');
  });

  test('sayım: canlı sayaç artar, eksilir, emir adedini aşabilir; sıfırın altına inemez; sağlam +1 defterde listelenmez', async () => {
    const { emir } = await baslatilmis();
    const c0 = await canliAl(emir.id);
    assert.deepEqual(c0, { calisma: 'calisiyor', saglam: 0, hurda: 0, durusNedeni: null, durusBaslangic: null, isEmri: null });
    for (let i = 0; i < 12; i += 1) {
      assert.equal((await sayimYap(emir.id, 1)).durum, 200);
      if (i === 0) await ilkParcaOnay(emir.id);
    }
    assert.equal((await canliAl(emir.id))?.saglam, 12);
    assert.equal((await ayrintiAl(emir.id)).emir.adet, 10);
    const geri = await sayimYap(emir.id, -2);
    assert.equal(geri.govde.emir.canli?.saglam, 10);
    const eksi = await sayimYap(emir.id, -11);
    assert.equal(eksi.durum, 409);
    assert.equal(eksi.govde.mesaj, 'Sağlam adet sıfırın altına inemez.');
    assert.equal((await canliAl(emir.id))?.saglam, 10);
    const ayrinti = await ayrintiAl(emir.id);
    assert.deepEqual(ayrinti.kayitlar.map((k) => [k.olay, k.adet]), [['baslat', null], ['duzeltme', 1], ['duzeltme', -2]], 'ilk parça onayı düzeltme olarak görünür');
    assert.equal((await sayimYap(emir.id, 0)).durum, 400);
    assert.equal((await komut(emir.id, 'sayim', 'operator', { tur: 'saglam', adet: 1.5 })).durum, 400);
  });

  test('sağlam sayım olayı (#1289): giriş, düzeltme ve bitirme farkı aynı işlemde dinleyiciye gider; hurda ve sıfır fark gitmez; ret sayımı geri alır', async () => {
    const { emir, istasyonId } = await baslatilmis();
    await nedenleriKur();
    const gelen: SaglamSayimOlayi[] = [];
    const toplamlar: (number | null)[] = [];
    let reddet = false;
    const birak = saglamSayimDinle(async (db, olay) => {
      // Dinleyici sayımla aynı işlemdedir: yeni satırı görür.
      const toplamda = await db.tek<{ s: number }>("SELECT sum(adet)::int AS s FROM uretim_sayimi WHERE emir_id = $1 AND tur = 'saglam'", [olay.uretimEmriId]);
      if (reddet) throw dogrulama('2 adet teslim edildi; sayı bunun altına düşürülemez', 'saglamAdet');
      gelen.push(olay);
      toplamlar.push(toplamda?.s ?? null);
    });
    try {
      assert.equal((await sayimYap(emir.id, 3)).durum, 200);
      await ilkParcaOnay(emir.id);
      assert.equal((await ayarla(emir.id, 5)).durum, 200);
      assert.equal((await ayarla(emir.id, 5)).durum, 200, 'fark sıfır: olay yok');
      assert.equal((await hurdaYap(emir.id, 1, hurdaId)).durum, 200, 'hurda olay değildir');
      assert.equal((await sayimYap(emir.id, -1)).durum, 200);
      const kisiId = gelen[0]?.kisiId;
      assert.deepEqual(gelen, ([[3, 'karar_bekliyor'], [2, 'serbest'], [-1, 'serbest']] as const).map(([f, kaliteDurumu]) => (
        { uretimEmriId: emir.id, isEmriId: null, istasyonId, kisiId, fark: String(f), kaliteDurumu, refakatPartisiId: null })));
      assert.deepEqual(toplamlar, [null, 5, 4], 'dinleyici yeni satırı görür; ilk sayım onaya kadar sağlamda değildir');
      reddet = true;
      const once = await toplam(emir.id);
      const ret = await sayimYap(emir.id, -1);
      assert.deepEqual([ret.durum, ret.govde.mesaj], [400, '2 adet teslim edildi; sayı bunun altına düşürülemez']);
      assert.deepEqual(await toplam(emir.id), once, 'ret sayımı geri alır');
      assert.equal((await bitir(emir.id, 2)).durum, 400, 'bitirmedeki düzeltme de reddedilir');
      reddet = false;
      assert.equal((await bitir(emir.id, 6)).durum, 200);
      assert.equal(gelen.at(-1)?.fark, '2', 'bitirme farkı');
    } finally {
      birak();
    }
    const { emir: ikinci } = await baslatilmis();
    const sayi = gelen.length;
    assert.equal((await sayimYap(ikinci.id, 1)).durum, 200, 'dinleyici yokken sayım bugünkü gibi yazılır');
    assert.equal(gelen.length, sayi);
    assert.equal((await toplam(ikinci.id)).n, 1);
  });

  test('sayım uyarısı (#157): dinleyicinin uyarıları sayım ve ayarlama cevabına birleşir; uyarısız ya da void dinleyicide null; hurda uyarı almaz', async () => {
    const { emir } = await baslatilmis();
    await nedenleriKur();
    await ilkParcaOnay(emir.id);
    let uyari: string | null = 'stokta yok, istisna kartı K-1';
    let ikinciUyari: string | null = null;
    const birakUyaran = saglamSayimDinle(async () => ({ uyari }));
    const birakSessiz = saglamSayimDinle(async () => undefined);
    const birakIkinci = saglamSayimDinle(async () => ({ uyari: ikinciUyari }));
    try {
      const sayim = await sayimYap(emir.id, 1);
      assert.deepEqual([sayim.durum, sayim.govde.uyari], [200, 'stokta yok, istisna kartı K-1']);
      assert.equal(sayim.govde.emir.id, emir.id, 'emir cevabı bugünkü gibi gelir');
      ikinciUyari = 'teslim edilmeden başka istasyondan';
      const ayar = await ayarla(emir.id, 9);
      assert.deepEqual([ayar.durum, ayar.govde.uyari], [200, 'stokta yok, istisna kartı K-1 teslim edilmeden başka istasyondan']);
      uyari = null;
      ikinciUyari = null;
      assert.equal((await sayimYap(emir.id, 1)).govde.uyari, null, 'uyarısız dinleyicide null');
      assert.equal((await ayarla(emir.id, 10)).govde.uyari, null, 'fark sıfır: dinleyici koşmaz, uyarı null');
      uyari = 'gitmemeli';
      const hurda = await hurdaYap(emir.id, 1, hurdaId);
      assert.deepEqual([hurda.durum, hurda.govde.uyari], [200, null], 'hurda sağlam dinleyicisine gitmez');
    } finally {
      birakUyaran();
      birakSessiz();
      birakIkinci();
    }
    assert.equal((await sayimYap(emir.id, 1)).govde.uyari, null, 'dinleyici yokken uyarı null');
  });

  test('hurda sayım olayı: hurda ve geri alması nedeniyle aynı işlemde dinleyiciye gider; sağlam gitmez; ret hurdayı geri alır', async () => {
    const { emir, istasyonId } = await baslatilmis();
    await nedenleriKur();
    const gelen: HurdaSayimOlayi[] = [];
    let reddet = false;
    const birak = hurdaSayimDinle(async (db, olay) => {
      const hurda = await db.tek<{ s: number }>("SELECT sum(adet)::int AS s FROM uretim_sayimi WHERE emir_id = $1 AND tur = 'hurda'", [olay.uretimEmriId]);
      if (reddet) throw dogrulama('Hurdanın girdisi düşülemedi', 'adet');
      gelen.push({ ...olay, fark: `${olay.fark}/${hurda?.s ?? 0}` });
    });
    const hurdaToplami = async () => (await vt().tek<{ s: number | null }>(
      "SELECT sum(adet)::int AS s FROM uretim_sayimi WHERE emir_id = $1 AND tur = 'hurda'", [emir.id]))?.s ?? null;
    try {
      assert.equal((await sayimYap(emir.id, 3)).durum, 200, 'sağlam hurda olayı değildir');
      assert.equal((await hurdaYap(emir.id, 2, hurdaId)).durum, 200);
      assert.equal((await hurdaYap(emir.id, -1, hurdaId)).durum, 200);
      const kisiId = gelen[0]?.kisiId;
      assert.deepEqual(gelen, ['2/2', '-1/1'].map((fark) => ({ uretimEmriId: emir.id, isEmriId: null, istasyonId, kisiId, hurdaNedeniId: hurdaId, fark, refakatPartisiId: null })),
        'dinleyici yeni satırı görür');
      reddet = true;
      const ret = await hurdaYap(emir.id, 1, hurdaId);
      assert.deepEqual([ret.durum, ret.govde.mesaj], [400, 'Hurdanın girdisi düşülemedi']);
      assert.equal(await hurdaToplami(), 1, 'ret hurdayı geri alır');
    } finally {
      birak();
    }
  });

  test('sayım-ayarla: mutlak değeri alır, farkı tek düzeltme satırı yazar; fark sıfırsa satır yazmaz', async () => {
    const { emir } = await baslatilmis();
    await sayimYap(emir.id, 1);
    await ilkParcaOnay(emir.id);
    const yukari = await ayarla(emir.id, 8);
    assert.equal(yukari.govde.emir.canli?.saglam, 8);
    assert.equal((await ayarla(emir.id, 8)).durum, 200);
    assert.equal((await ayarla(emir.id, 3)).govde.emir.canli?.saglam, 3);
    assert.equal((await ayarla(emir.id, 0)).govde.emir.canli?.saglam, 0);
    assert.equal((await komut(emir.id, 'sayim-ayarla', 'operator', { saglam: -1 })).durum, 400);
    const duzeltmeler = (await ayrintiAl(emir.id)).kayitlar.filter((k) => k.olay === 'duzeltme').map((k) => k.adet);
    assert.deepEqual(duzeltmeler, [1, 7, -5, -3], 'ilki ilk parça onayı');
    assert.equal((await toplam(emir.id)).n, 6);

    // Denetim (kart #189): her başarılı sayım komutunun satırı vardır (kim, hangi emir); adet deftere gövde olarak girmez.
    const denetim = await vt().sorgu<{ yol: string; kisiId: number | null; govde: Record<string, unknown> }>(
      `SELECT yol, kisi_id AS "kisiId", govde FROM denetim_kaydi
        WHERE yol LIKE '/uretim-emirleri/:id/sayim%' AND parametre->>'id' = $1 ORDER BY id`, [String(emir.id)],
    );
    assert.deepEqual(
      denetim.map((d) => [d.yol, Object.keys(d.govde)]),
      [['/uretim-emirleri/:id/sayim', ['_ozet']], ...Array.from({ length: 4 }, () => ['/uretim-emirleri/:id/sayim-ayarla', ['_ozet']])],
    );
    assert.equal(denetim.every((d) => d.kisiId !== null), true);
  });

  test('hurda: artışta aktif neden zorunlu; defterde adet ve neden görünür; sağlam sayacı etkilenmez', async () => {
    await nedenleriKur();
    const { emir } = await baslatilmis();
    const c = await hurdaYap(emir.id, 3, hurdaId);
    assert.equal(c.durum, 200);
    assert.equal(c.govde.emir.canli?.hurda, 3);
    assert.equal(c.govde.emir.canli?.saglam, 0);
    assert.equal((await komut(emir.id, 'sayim', 'operator', { tur: 'hurda', adet: 1 })).durum, 400);
    assert.equal((await komut(emir.id, 'sayim', 'operator', { tur: 'hurda', adet: 0, hurdaNedeniId: hurdaId })).durum, 400);
    assert.equal((await komut(emir.id, 'sayim', 'operator', { tur: 'saglam', adet: 1, hurdaNedeniId: hurdaId })).durum, 400);
    const pasif = await hurdaYap(emir.id, 1, hurdaPasifId);
    assert.equal(pasif.durum, 400);
    assert.equal(pasif.govde.mesaj, 'Hurda nedeni pasif; aktif bir neden seçin.');
    assert.equal((await hurdaYap(emir.id, 1, 2147483000)).durum, 400);
    assert.equal((await toplam(emir.id)).h, 3);
    const hurdaSatiri = (await ayrintiAl(emir.id)).kayitlar.find((k) => k.olay === 'hurda');
    assert.equal(hurdaSatiri?.adet, 3);
    assert.deepEqual(hurdaSatiri?.hurdaNedeni, { id: hurdaId, ad: 'Deneme hurdası' });
    assert.equal(hurdaSatiri?.durusNedeni, null);
  });

  test('duruş: duraklat ve durdur yalnız çalışırken (aktif neden zorunlu), devam duraklı ya da durmuşken', async () => {
    await nedenleriKur();
    const { emir } = await baslatilmis();
    assert.equal((await komut(emir.id, 'devam')).govde.mesaj, 'İş zaten çalışıyor; devam edilecek bir duruş yok.');
    const dur = await komut(emir.id, 'duraklat');
    assert.equal(dur.durum, 200);
    assert.equal(dur.govde.emir.durum, 'basladi');
    assert.equal(dur.govde.emir.canli?.calisma, 'durakli');
    assert.notEqual(dur.govde.emir.canli?.durusBaslangic, null);
    assert.equal(dur.govde.emir.canli?.durusNedeni, null);
    assert.equal((await komut(emir.id, 'duraklat')).durum, 409);
    // Duraklıyken sayım serbest.
    assert.equal((await sayimYap(emir.id, 1)).durum, 200);
    assert.equal((await komut(emir.id, 'devam')).govde.emir.canli?.calisma, 'calisiyor');
    assert.equal((await komut(emir.id, 'duraklat')).durum, 200);
    const duraklidaDurdur = await durdur(emir.id, durusId);
    assert.equal(duraklidaDurdur.durum, 409);
    assert.equal(duraklidaDurdur.govde.mesaj, DURAKLI_DURDUR);
    assert.equal((await canliAl(emir.id))?.calisma, 'durakli');
    assert.equal((await komut(emir.id, 'devam')).durum, 200);

    const pasif = await durdur(emir.id, durusPasifId);
    assert.equal(pasif.durum, 400);
    assert.equal(pasif.govde.mesaj, 'Duruş nedeni pasif; aktif bir neden seçin.');
    assert.equal((await durdur(emir.id, 2147483000)).durum, 400);
    assert.equal((await komut(emir.id, 'durdur', 'operator', {})).durum, 400);
    assert.equal((await canliAl(emir.id))?.calisma, 'calisiyor');
    const durdu = await durdur(emir.id, durusId);
    assert.equal(durdu.govde.emir.canli?.calisma, 'durdu');
    assert.deepEqual(durdu.govde.emir.canli?.durusNedeni, { id: durusId, ad: 'Deneme duruşu' });
    assert.notEqual(durdu.govde.emir.canli?.durusBaslangic, null);
    assert.equal((await durdur(emir.id, durusId)).govde.mesaj, 'İş zaten durmuş.');
    assert.equal((await komut(emir.id, 'duraklat')).durum, 409);
    const duruSayim = await sayimYap(emir.id, 1);
    assert.equal(duruSayim.durum, 409);
    assert.equal(duruSayim.govde.mesaj, 'Duruşta sayım yapılamaz; önce devam edin.');
    assert.equal((await ayarla(emir.id, 9)).durum, 409);
    assert.equal((await hurdaYap(emir.id, 1, hurdaId)).durum, 409);
    assert.equal((await komut(emir.id, 'devam')).govde.emir.canli?.calisma, 'calisiyor');
    assert.equal((await durdur(emir.id, durusId)).durum, 200, 'çalışırken doğrudan durdurulur');
    const olaylar = (await ayrintiAl(emir.id)).kayitlar.filter((k) => ['duraklat', 'durdur', 'devam'].includes(k.olay));
    assert.deepEqual(olaylar.map((k) => [k.olay, k.durusNedeni?.id ?? null]), [
      ['duraklat', null], ['devam', null], ['duraklat', null], ['devam', null], ['durdur', durusId], ['devam', null], ['durdur', durusId],
    ]);
  });

  test('duruş ve sayım: planlı, bitmiş ve iptal emirde 409; bitir üç halde de önkoşulsuz', async () => {
    await nedenleriKur();
    const planli = await emirAc(await istasyonKur());
    const iptalli = await emirAc(await istasyonKur());
    await iptal(iptalli.id);
    const bitmis = (await baslatilmis()).emir;
    await bitir(bitmis.id, 1);
    for (const e of [planli, iptalli, bitmis]) {
      for (const [yol, govde] of [['sayim', { tur: 'saglam', adet: 1 }], ['sayim-ayarla', { saglam: 2 }], ['duraklat'], ['devam'], ['durdur', { durusNedeniId: durusId }]] as [string, unknown][]) {
        const c = await komut(e.id, yol, 'operator', govde);
        assert.equal(c.durum, 409, `${e.durum} ${yol}`);
      }
      assert.equal(await canliAl(e.id) === null, e !== bitmis);
    }
    for (const hazirla of [async () => undefined, async (id: number) => { await komut(id, 'duraklat'); }, async (id: number) => { await durdur(id, durusId); }]) {
      const { emir } = await baslatilmis();
      await sayimYap(emir.id, 2);
      await hazirla(emir.id);
      const son = await bitir(emir.id, 2);
      assert.equal(son.durum, 200);
      assert.equal(son.govde.emir.canli?.calisma, null);
    }
  });

  test('değişmezler: canlı alanları çalışma durumuyla tutarlı; biten emirde sayaç emrin sağlam adedine eşit; başlamamışta null', async () => {
    await nedenleriKur();
    const { emir } = await baslatilmis();
    const kontrol = async () => {
      const e = (await ayrintiAl(emir.id)).emir;
      const c = e.canli;
      assert.notEqual(c, null);
      if (c?.calisma === 'durdu') assert.ok(c.durusNedeni !== null && c.durusBaslangic !== null);
      if (c?.calisma === 'durakli') assert.ok(c.durusNedeni === null && c.durusBaslangic !== null);
      if (c?.calisma === 'calisiyor') assert.ok(c.durusNedeni === null && c.durusBaslangic === null);
      return c;
    };
    await sayimYap(emir.id, 4);
    assert.equal((await kontrol())?.calisma, 'calisiyor');
    await komut(emir.id, 'duraklat');
    assert.equal((await kontrol())?.calisma, 'durakli');
    await komut(emir.id, 'devam');
    await durdur(emir.id, durusId);
    assert.equal((await kontrol())?.calisma, 'durdu');
    await komut(emir.id, 'devam');
    assert.equal((await kontrol())?.calisma, 'calisiyor');
    await hurdaYap(emir.id, 2, hurdaId);
    const son = (await bitir(emir.id, 4)).govde.emir;
    assert.equal(son.canli?.calisma, null);
    assert.equal(son.canli?.saglam, son.saglamAdet);
    assert.equal(son.canli?.hurda, 2);
    assert.deepEqual([son.canli?.durusNedeni, son.canli?.durusBaslangic], [null, null]);

    const ist = await istasyonKur();
    const planli = await emirAc(ist);
    assert.equal(planli.canli, null);
    const iptalli = await emirAc(ist);
    assert.equal((await iptal(iptalli.id)).govde.emir.canli, null);
    const liste = emirlerCevabi.parse((await plan('GET', '/uretim-emirleri?kapsam=hepsi')).govde).emirler;
    assert.equal(liste.find((e) => e.id === planli.id)?.canli, null);
    assert.equal(liste.find((e) => e.id === son.id)?.canli?.hurda, 2);
  });

  test('bitir: gövdesiz bitiş sayaç toplamını yazar (sayım yoksa gerçek sıfır); gövdeli bitiş farkı düzeltme olarak yazar', async () => {
    const sifir = (await baslatilmis()).emir;
    const s0 = await bitir0(sifir.id);
    assert.equal(s0.durum, 200);
    assert.equal(s0.govde.emir.saglamAdet, 0);
    assert.equal(s0.govde.emir.canli?.saglam, 0);
    assert.deepEqual((await ayrintiAl(sifir.id)).kayitlar.map((k) => k.olay), ['baslat', 'bitir']);

    const sayili = (await baslatilmis()).emir;
    await sayimYap(sayili.id, 6);
    await ilkParcaOnay(sayili.id);
    const s1 = await bitir0(sayili.id);
    assert.equal(s1.govde.emir.saglamAdet, 6);
    assert.deepEqual((await ayrintiAl(sayili.id)).kayitlar.map((k) => [k.olay, k.saglamAdet]), [['baslat', null], ['duzeltme', null], ['bitir', 6]]);

    const farkli = (await baslatilmis()).emir;
    await sayimYap(farkli.id, 6);
    await ilkParcaOnay(farkli.id);
    const s2 = await bitir(farkli.id, 4);
    assert.equal(s2.govde.emir.saglamAdet, 4);
    assert.equal(s2.govde.emir.canli?.saglam, 4);
    assert.deepEqual((await ayrintiAl(farkli.id)).kayitlar.map((k) => [k.olay, k.adet, k.saglamAdet]), [
      ['baslat', null, null], ['duzeltme', 6, null], ['duzeltme', -2, null], ['bitir', null, 4],
    ]);
    const ayni = (await baslatilmis()).emir;
    await sayimYap(ayni.id, 3);
    await ilkParcaOnay(ayni.id);
    await bitir(ayni.id, 3);
    assert.deepEqual((await ayrintiAl(ayni.id)).kayitlar.filter((k) => k.olay === 'duzeltme').map((k) => k.adet), [3], 'fark yoksa bitirme satırı yok; yalnız onay');
  });
  const bitir0 = (id: number) => komut(id, 'bitir', 'operator', {});

  test('defter: üç tablonun satırlarında kimlikler benzersizdir ve zaman sırası mantıksal sıradır', async () => {
    await nedenleriKur();
    const { emir } = await baslatilmis();
    await sayimYap(emir.id, 5);
    await ilkParcaOnay(emir.id);
    await hurdaYap(emir.id, 1, hurdaId);
    await komut(emir.id, 'duraklat');
    await komut(emir.id, 'devam');
    await sayimYap(emir.id, -1);
    await durdur(emir.id, durusId);
    await komut(emir.id, 'devam');
    await ayarla(emir.id, 7);
    await bitir(emir.id, 9);
    const kayitlar = (await ayrintiAl(emir.id)).kayitlar;
    assert.deepEqual(kayitlar.map((k) => k.olay), [
      'baslat', 'duzeltme', 'hurda', 'duraklat', 'devam', 'duzeltme', 'durdur', 'devam', 'duzeltme', 'duzeltme', 'bitir',
    ]);
    const idler = kayitlar.map((k) => k.id);
    assert.equal(new Set(idler).size, idler.length);
    assert.ok(idler.every((i) => Number.isInteger(i) && i > 0 && i <= 2147483647));
    const zamanlar = kayitlar.map((k) => Date.parse(k.zaman));
    assert.deepEqual(zamanlar, [...zamanlar].sort((a, b) => a - b));
    // Üç tablo aynı kimlik sayısını üretse bile kaynak payı ayırır.
    const kaynaklar = new Set(idler.map((i) => i % 3));
    assert.deepEqual([...kaynaklar].sort(), [0, 1, 2]);
  });

  test('yalnız ekleme: sayım ve olay defterinde UPDATE ve DELETE tetikleyiciyle, TRUNCATE hem hak hem tetikleyiciyle (iki rol ayrı) engellenir', async () => {
    await nedenleriKur();
    const { emir } = await baslatilmis();
    await sayimYap(emir.id, 1);
    await komut(emir.id, 'duraklat');
    for (const tablo of ['uretim_sayimi', 'uretim_olayi']) {
      const degistir = `UPDATE ${tablo} SET kisi_id = kisi_id WHERE emir_id = $1`;
      const sil = `DELETE FROM ${tablo} WHERE emir_id = $1`;
      for (const [kim, baglanti] of [['uygulama', vt()], ['sahip', sahip()]] as const) {
        await assert.rejects(baglanti.sorgu(degistir, [emir.id]), /yalnız ekleme/, `${tablo} UPDATE (${kim})`);
        await assert.rejects(baglanti.sorgu(sil, [emir.id]), /yalnız ekleme/, `${tablo} DELETE (${kim})`);
      }
      await assert.rejects(vt().sorgu(`TRUNCATE ${tablo}`), izinYok, `${tablo} TRUNCATE (uygulama)`);
      await assert.rejects(sahip().sorgu(`TRUNCATE ${tablo}`), /yalnız ekleme/, `${tablo} TRUNCATE (sahip)`);
    }
    assert.equal((await toplam(emir.id)).n, 1);
  });

  // UE-HD-1 (kart #1194): terminaldeki hurda -1 emirde eksi adetli düzeltmedir; toplam sıfırın altına inmez.
  test('UE-HD-1: hurda düzeltmesi son hurdanın nedeniyle düzeltme olarak yazılır, hurdayı düşürür; toplamı sıfırın altına indiremez', async () => {
    await nedenleriKur();
    const { emir } = await baslatilmis();
    const bos = await komut(emir.id, 'sayim', 'operator', { tur: 'hurda', adet: -1 });
    assert.equal(bos.durum, 409, JSON.stringify(bos.govde));
    assert.equal((await hurdaYap(emir.id, 2, hurdaId)).durum, 200);
    const c = await komut(emir.id, 'sayim', 'operator', { tur: 'hurda', adet: -1 });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.emir.canli?.hurda, 1);
    const satir = await vt().tek<{ adet: number; neden: number; duzeltme: boolean }>(
      "SELECT adet, hurda_nedeni_id AS neden, duzeltme FROM uretim_sayimi WHERE emir_id = $1 AND tur = 'hurda' ORDER BY id DESC LIMIT 1", [emir.id]);
    assert.deepEqual(satir, { adet: -1, neden: hurdaId, duzeltme: true });
    const asim = await komut(emir.id, 'sayim', 'operator', { tur: 'hurda', adet: -2, hurdaNedeniId: hurdaId });
    assert.equal(asim.durum, 409);
    assert.equal((await toplam(emir.id)).h, 1);
  });

  test('veritabanı kısıtları: hurda nedensiz, sağlamda neden, sıfır adet, eksi hurda, nedensiz durdurma ve nedenli duraklatma yazılamaz', async () => {
    await nedenleriKur();
    const { emir, istasyonId } = await baslatilmis();
    const kisi = (await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'operator'"))!.id;
    const sayimYaz = (tur: string, adet: number, neden: number | null, duzeltme = false) => sahip().sorgu(
      'INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, hurda_nedeni_id, duzeltme) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [emir.id, kisi, istasyonId, tur, adet, neden, duzeltme],
    );
    const olayYaz = (olay: string, neden: number | null) => sahip().sorgu(
      'INSERT INTO uretim_olayi (emir_id, kisi_id, istasyon_id, olay, durus_nedeni_id) VALUES ($1, $2, $3, $4, $5)',
      [emir.id, kisi, istasyonId, olay, neden],
    );
    const kisitAdi = (h: { constraint?: string }) => h.constraint;
    await assert.rejects(sayimYaz('hurda', 1, null), (h: { constraint?: string }) => kisitAdi(h) === 'uretim_sayimi_hurda_nedenli');
    await assert.rejects(sayimYaz('saglam', 1, hurdaId), (h: { constraint?: string }) => kisitAdi(h) === 'uretim_sayimi_hurda_nedenli');
    await assert.rejects(sayimYaz('saglam', 0, null), (h: { constraint?: string }) => kisitAdi(h) === 'uretim_sayimi_adet_sifir_degil');
    await assert.rejects(sayimYaz('hurda', -1, hurdaId), (h: { constraint?: string }) => ['uretim_sayimi_eksilen_duzeltmedir', 'uretim_sayimi_hurda_duzeltmesi_eksidir'].includes(kisitAdi(h) ?? ''));
    await assert.rejects(sayimYaz('saglam', -1, null), (h: { constraint?: string }) => kisitAdi(h) === 'uretim_sayimi_eksilen_duzeltmedir');
    await assert.rejects(sayimYaz('hurda', 1, hurdaId, true), (h: { constraint?: string }) => kisitAdi(h) === 'uretim_sayimi_hurda_duzeltmesi_eksidir');
    await assert.rejects(sayimYaz('hurda', -1, null, true), (h: { constraint?: string }) => kisitAdi(h) === 'uretim_sayimi_hurda_nedenli');
    await assert.rejects(olayYaz('durdur', null), (h: { constraint?: string }) => kisitAdi(h) === 'uretim_olayi_durdur_nedenli');
    await assert.rejects(olayYaz('duraklat', durusId), (h: { constraint?: string }) => kisitAdi(h) === 'uretim_olayi_durdur_nedenli');
    await sayimYaz('hurda', 1, hurdaId);
    await sayimYaz('hurda', -1, hurdaId, true);
    await sayimYaz('saglam', 1, null);
    await sayimYaz('saglam', -1, null, true);
    await olayYaz('durdur', durusId);
  });

  test('taşma: sağlam ya da hurda toplamı int4 sınırını aşacaksa 409, 500 değil; sınıra kadar kabul edilir', async () => {
    await nedenleriKur();
    const { emir, istasyonId } = await baslatilmis();
    const kisi = (await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'operator'"))!.id;
    await sahip().sorgu(
      "INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet) VALUES ($1, $2, $3, 'saglam', 2147483000)", [emir.id, kisi, istasyonId]);
    await sahip().sorgu(
      "INSERT INTO uretim_sayimi (emir_id, kisi_id, istasyon_id, tur, adet, hurda_nedeni_id) VALUES ($1, $2, $3, 'hurda', 2147483000, $4)",
      [emir.id, kisi, istasyonId, hurdaId]);
    const sag = await sayimYap(emir.id, 1000);
    assert.equal(sag.durum, 409);
    assert.equal(sag.govde.mesaj, 'Sayaç üst sınırı aşılır; bu adet eklenemez.');
    const hur = await hurdaYap(emir.id, 1000, hurdaId);
    assert.equal(hur.durum, 409);
    assert.equal(hur.govde.mesaj, 'Sayaç üst sınırı aşılır; bu adet eklenemez.');
    assert.deepEqual(await toplam(emir.id), { s: 2147483000, h: 2147483000, n: 2 });
    assert.equal((await sayimYap(emir.id, 600)).durum, 200);
    assert.equal((await sayimYap(emir.id, 47)).durum, 200);
    assert.equal((await sayimYap(emir.id, 1)).durum, 409);
    assert.equal((await canliAl(emir.id))?.saglam, 2147483647);
    const son = await bitir0(emir.id);
    assert.equal(son.durum, 200);
    assert.equal(son.govde.emir.saglamAdet, 2147483647);
  });

  test('yarış: iki +1 aynı anda iki satır ve toplam 2 verir', async () => {
    const { emir } = await baslatilmis();
    await sayimYap(emir.id, 1);
    await ilkParcaOnay(emir.id);
    const sonuclar = await kilitliyken(emir.id, 2, () => [sayimYap(emir.id, 1), sayimYap(emir.id, 1, 'operator2')]);
    assert.deepEqual(sonuclar.map((s) => s.durum), [200, 200]);
    assert.deepEqual(await toplam(emir.id), { s: 3, h: 0, n: 5 }, 'ilk parça satırları (3) ve iki +1');
    assert.equal((await canliAl(emir.id))?.saglam, 3);
  });

  test('yarış: sayım ile bitir yarışırsa biten emrin sağlam adedi defterdeki toplamla aynıdır', async () => {
    for (let tur = 0; tur < 3; tur += 1) {
      const { emir } = await baslatilmis();
      await sayimYap(emir.id, 3);
      await ilkParcaOnay(emir.id);
      const [s, b] = await kilitliyken(emir.id, 2, () => [sayimYap(emir.id, 1), bitir0(emir.id)]);
      assert.equal(b.durum, 200);
      assert.ok(s.durum === 200 || s.durum === 409);
      const son = (await ayrintiAl(emir.id)).emir;
      assert.equal(son.saglamAdet, (await toplam(emir.id)).s);
      assert.equal(son.saglamAdet, s.durum === 200 ? 4 : 3);
      assert.equal(son.canli?.saglam, son.saglamAdet);
    }
  });

  const sayimSatirlari = (emirId: number) =>
    vt().sorgu<{ adet: number; tur: string; duzeltme: boolean }>('SELECT adet, tur, duzeltme FROM uretim_sayimi WHERE emir_id = $1 ORDER BY id', [emirId]);

  test('yarış: sayım ile durdur yarışırsa durdurmadan sonra sayım yazılmaz (durdur önce bittiyse sayım 409)', async () => {
    await nedenleriKur();
    for (let tur = 0; tur < 6; tur += 1) {
      const { emir } = await baslatilmis();
      const [d, s] = await yazmaTutarak(['uretim_sayimi', 'uretim_olayi'], 2, () => (tur % 2 === 0
        ? [durdur(emir.id, durusId), sayimYap(emir.id, 1)] as const
        : [durdur(emir.id, durusId), sayimYap(emir.id, 1, 'operator2')] as const));
      assert.equal(d.durum, 200);
      assert.ok(s.durum === 200 || s.durum === 409, `sayım ${s.durum}`);
      assert.equal((await toplam(emir.id)).n, s.durum === 200 ? 1 : 0);
      if (s.durum === 200) {
        // Sayım yazıldıysa durdurmadan önce yazılmıştır.
        const sirali = await sahip().sorgu<{ kaynak: string }>(
          `SELECT kaynak FROM (SELECT 'sayim' AS kaynak, zaman, id FROM uretim_sayimi WHERE emir_id = $1
                               UNION ALL SELECT 'durdur', zaman, id FROM uretim_olayi WHERE emir_id = $1) x ORDER BY zaman, kaynak DESC`, [emir.id]);
        assert.deepEqual(sirali.map((k) => k.kaynak), ['sayim', 'durdur']);
      }
    }
  });

  test('yarış: +1 ile sayım-ayarla yarışırsa düzeltme adedi yazış sırasına uyar (kayıp güncelleme yok)', async () => {
    for (let tur = 0; tur < 6; tur += 1) {
      const { emir } = await baslatilmis();
      // İlk parça onaylı ve sağlam sıfırda: karar bekliyor +1/-1, onay +1, ayar -1.
      await sayimYap(emir.id, 1);
      await ilkParcaOnay(emir.id);
      await ayarla(emir.id, 0);
      const sonuclar = await yazmaTutarak(['uretim_sayimi'], 2, () => (tur % 2 === 0
        ? [sayimYap(emir.id, 1), ayarla(emir.id, 5)] as const
        : [ayarla(emir.id, 5), sayimYap(emir.id, 1)] as const));
      assert.deepEqual(sonuclar.map((s) => s.durum), [200, 200]);
      const satirlar = (await sayimSatirlari(emir.id)).slice(4);
      assert.equal(satirlar.length, 2);
      const t = await toplam(emir.id);
      assert.equal((await canliAl(emir.id))?.saglam, t.s);
      const duzeltme = satirlar.find((s) => s.duzeltme)?.adet;
      const artiBirOnce = satirlar[0]?.duzeltme === false;
      // +1 önce yazıldıysa ayarla 4 ekler (toplam 5); ayarla önce yazıldıysa 5 ekler, +1 üstüne biner (toplam 6).
      if (artiBirOnce) assert.deepEqual([duzeltme, t.s], [4, 5]);
      else assert.deepEqual([duzeltme, t.s], [5, 6]);
    }
  });

  test('yarış: iki eksiltme sağlam 1 iken yarışırsa biri 409 alır, toplam sıfırın altına inmez', async () => {
    for (let tur = 0; tur < 4; tur += 1) {
      const { emir } = await baslatilmis();
      await sayimYap(emir.id, 1);
      const [a, b] = await yazmaTutarak(['uretim_sayimi'], 2, () => [sayimYap(emir.id, -1), sayimYap(emir.id, -1, 'operator2')] as const);
      assert.deepEqual([a.durum, b.durum].sort(), [200, 409]);
      assert.equal((await toplam(emir.id)).s, 0);
      assert.equal((await sayimSatirlari(emir.id)).length, 2);
    }
  });

  test('geçiş öncesi veri: sayım satırı olmadan bitmiş emirde canlı sağlam emrin adedidir; açık eski emir çalışıyor görünür', async () => {
    const istasyonId = await istasyonKur();
    const kisi = (await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'operator'"))!.id;
    const eskiEmir = async (durum: 'bitti' | 'basladi'): Promise<number> => {
      const e = await sahip().tek<{ id: number }>(
        'INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id) VALUES ($1, $2, 10, $3, $4) RETURNING id',
        ['E-1', 'Eski emir', istasyonId, kisi]);
      if (durum === 'bitti') {
        await sahip().sorgu("UPDATE uretim_emri SET durum = 'bitti', baslama = now(), bitis = now(), saglam_adet = 7 WHERE id = $1", [e!.id]);
      } else {
        await sahip().sorgu("UPDATE uretim_emri SET durum = 'basladi', baslama = now() WHERE id = $1", [e!.id]);
      }
      return e!.id;
    };
    const bitmisId = await eskiEmir('bitti');
    const ayrinti = await ayrintiAl(bitmisId);
    assert.equal(ayrinti.emir.saglamAdet, 7);
    assert.deepEqual(ayrinti.emir.canli, { calisma: null, saglam: 7, hurda: 0, durusNedeni: null, durusBaslangic: null, isEmri: null });
    const liste = emirlerCevabi.parse((await plan('GET', '/uretim-emirleri?durum=bitti')).govde).emirler;
    assert.equal(liste.find((e) => e.id === bitmisId)?.canli?.saglam, 7);

    const acikId = await eskiEmir('basladi');
    assert.deepEqual(await canliAl(acikId), { calisma: 'calisiyor', saglam: 0, hurda: 0, durusNedeni: null, durusBaslangic: null, isEmri: null });
    const govdesiz = await bitir0(acikId);
    assert.equal(govdesiz.govde.emir.saglamAdet, 0);
    assert.equal(govdesiz.govde.emir.canli?.saglam, 0);
  });

  test('geçiş öncesi veri: gövdeli bitiş sayaçsız açık emirde farkı düzeltme olarak yazar', async () => {
    const istasyonId = await istasyonKur();
    const kisi = (await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'operator'"))!.id;
    const e = (await sahip().tek<{ id: number }>(
      'INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id) VALUES ($1, $2, 10, $3, $4) RETURNING id',
      ['E-2', 'Eski emir', istasyonId, kisi]))!.id;
    await sahip().sorgu("UPDATE uretim_emri SET durum = 'basladi', baslama = now() WHERE id = $1", [e]);
    const c = await bitir(e, 4);
    assert.equal(c.govde.emir.saglamAdet, 4);
    assert.equal(c.govde.emir.canli?.saglam, 4);
    assert.deepEqual((await ayrintiAl(e)).kayitlar.map((k) => [k.olay, k.adet]), [['duzeltme', 4], ['bitir', null]]);
  });

  test('kapsam: bayraklı kişi beş yeni ucu kısıt satırı olsa da kullanır', async () => {
    await nedenleriKur();
    const ist = await istasyonKur();
    const baska = await istasyonKur();
    const emir = await emirAc(ist);
    await baslat(emir.id);
    await sahip().sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [yoneticiId, await merkezi(baska)]);
    try {
      assert.equal((await sayimYap(emir.id, 2, 'yonetici')).durum, 200);
      assert.equal((await ayarla(emir.id, 3, 'yonetici')).durum, 200);
      assert.equal((await komut(emir.id, 'duraklat', 'yonetici')).durum, 200);
      assert.equal((await komut(emir.id, 'devam', 'yonetici')).durum, 200);
      assert.equal((await durdur(emir.id, durusId, 'yonetici')).durum, 200);
    } finally {
      await sahip().sorgu('DELETE FROM kisi_is_merkezi WHERE kisi_id = $1', [yoneticiId]);
    }
  });

  test('kapsam: kapsam dışı redde sayım ve olay defterleri de değişmez', async () => {
    await nedenleriKur();
    const ist = await istasyonKur();
    const baska = await istasyonKur();
    const emir = await emirAc(ist);
    await baslat(emir.id);
    await kapsamYaz(await merkezi(baska));
    try {
      const say = async () => (await vt().tek<{ n: number }>(
        'SELECT (SELECT count(*) FROM uretim_olayi WHERE emir_id = $1)::int + (SELECT count(*) FROM uretim_sayimi WHERE emir_id = $1)::int AS n', [emir.id]))!.n;
      for (const [yol, govde] of [['sayim', { tur: 'hurda', adet: 1, hurdaNedeniId: hurdaId }], ['duraklat', undefined], ['durdur', { durusNedeniId: durusId }]] as [string, unknown][]) {
        assert.equal((await komut(emir.id, yol, 'kapsamli', govde)).durum, 403, yol);
      }
      assert.equal(await say(), 0);
    } finally {
      await kapsamYaz();
    }
  });

  test('girdi: geçersiz :id 400; sayım, ayarla ve durdurda fazladan alan 400; duraklat, devam ve bitirde fazla alan etkisiz', async () => {
    await nedenleriKur();
    for (const [yol, govde] of [['sayim', { tur: 'saglam', adet: 1 }], ['sayim-ayarla', { saglam: 1 }], ['duraklat', undefined], ['devam', undefined], ['durdur', { durusNedeniId: durusId }]] as [string, unknown][]) {
      for (const kotu of ['abc', '0', '-1']) {
        assert.equal((await istek(kisiCerezi('operator'), 'POST', `/uretim-emirleri/${kotu}/${yol}`, govde)).durum, 400, `${yol} ${kotu}`);
      }
    }
    const { emir } = await baslatilmis();
    const fazla = { kisiId: 1, zaman: '2020-01-01T00:00:00Z', duzeltme: true, emirId: 999 };
    assert.equal((await komut(emir.id, 'sayim', 'operator', { tur: 'saglam', adet: 1, ...fazla })).durum, 400);
    assert.equal((await komut(emir.id, 'sayim', 'operator', { tur: 'hurda', adet: 1, hurdaNedeniId: hurdaId, ...fazla })).durum, 400);
    assert.equal((await komut(emir.id, 'sayim-ayarla', 'operator', { saglam: 2, ...fazla })).durum, 400);
    assert.equal((await komut(emir.id, 'durdur', 'operator', { durusNedeniId: durusId, ...fazla })).durum, 400);
    assert.deepEqual(await toplam(emir.id), { s: 0, h: 0, n: 0 });
    assert.equal((await canliAl(emir.id))?.calisma, 'calisiyor');

    assert.equal((await komut(emir.id, 'duraklat', 'operator', fazla)).durum, 200);
    assert.equal((await komut(emir.id, 'devam', 'operator', fazla)).durum, 200);
    const olaylar = await vt().sorgu<{ kisi_id: number; zaman: string }>(
      "SELECT kisi_id, to_json(zaman) #>> '{}' AS zaman FROM uretim_olayi WHERE emir_id = $1", [emir.id]);
    assert.equal(olaylar.length, 2);
    assert.ok(olaylar.every((o) => o.kisi_id !== 1 && !o.zaman.startsWith('2020')));
    await sayimYap(emir.id, 3);
    await ilkParcaOnay(emir.id);
    const bitis = await komut(emir.id, 'bitir', 'operator', { saglamAdet: 3, ...fazla });
    assert.equal(bitis.durum, 200);
    assert.equal(bitis.govde.emir.saglamAdet, 3);
    const kayitlar = (await ayrintiAl(emir.id)).kayitlar;
    assert.ok(kayitlar.every((k) => k.emirId === emir.id && k.kisi.ad === 'Deneme operator'), 'onay satırı da sayanındır (348 a)');
    assert.deepEqual(kayitlar.filter((k) => k.olay === 'duzeltme').map((k) => k.adet), [3], 'yalnız ilk parça onayı');
  });

  test('hurda: duraklıyken kabul edilir, durmuşken reddedilir', async () => {
    await nedenleriKur();
    const { emir } = await baslatilmis();
    await komut(emir.id, 'duraklat');
    assert.equal((await hurdaYap(emir.id, 2, hurdaId)).govde.emir.canli?.hurda, 2);
    await komut(emir.id, 'devam');
    await durdur(emir.id, durusId);
    assert.equal((await hurdaYap(emir.id, 1, hurdaId)).durum, 409);
    assert.equal((await canliAl(emir.id))?.hurda, 2);
  });

  // ---------------- talimat adımları (#151 dilim 2) ----------------

  const adimli = async (adlar: (string | { ad: string; aciklama?: string | null })[], istasyonId?: number): Promise<Emir> =>
    emirAc(istasyonId ?? await istasyonKur(), { adimlar: adlar.map((a) => (typeof a === 'string' ? { ad: a } : a)) });
  const adimlariAl = async (id: number) => (await ayrintiAl(id)).adimlar ?? [];
  const tamamla = (emirId: number, adimId: number, tamam: boolean, kim = 'operator', govde?: unknown) =>
    istek<EmirCevabiHata & { adimlar?: { id: number; tamam: boolean }[] }>(
      kisiCerezi(kim), 'POST', `/uretim-emirleri/${emirId}/adimlar/${adimId}/tamamla`, govde ?? { tamam });
  const adimOlaySayisi = async (emirId: number) =>
    (await vt().tek<{ n: number }>(
      'SELECT count(*)::int AS n FROM emir_adimi_olayi o JOIN emir_adimi a ON a.id = o.adim_id WHERE a.emir_id = $1', [emirId]))!.n;
  const adimliBaslamis = async (adlar: string[] = ['Ham madde kontrol', 'Takım bağla', 'İlk parça ölçümü']) => {
    const emir = await adimli(adlar);
    assert.equal((await baslat(emir.id)).durum, 200);
    return { emir, adimlar: await adimlariAl(emir.id) };
  };

  test('adım açma: adımlar emirle birlikte bitişik sırayla yazılır; açıklama boşsa null; adımsız emir geçerlidir', async () => {
    const emir = await adimli(['Birinci', { ad: ' İkinci ', aciklama: '  Ayrıntı  ' }, { ad: 'Üçüncü', aciklama: '   ' }, { ad: 'Dördüncü', aciklama: null }]);
    const adimlar = await adimlariAl(emir.id);
    assert.deepEqual(adimlar.map((a) => [a.sira, a.ad, a.aciklama, a.tamam, a.tamamlayan, a.tamamlanma]), [
      [1, 'Birinci', null, false, null, null], [2, 'İkinci', 'Ayrıntı', false, null, null],
      [3, 'Üçüncü', null, false, null, null], [4, 'Dördüncü', null, false, null, null],
    ]);
    assert.deepEqual((await ayrintiAl(emir.id)).adimlar, adimlar);
    const adimsiz = await emirAc(await istasyonKur());
    assert.deepEqual((await ayrintiAl(adimsiz.id)).adimlar, []);
    const bos = await emirAc(await istasyonKur(), { adimlar: [] });
    assert.deepEqual((await ayrintiAl(bos.id)).adimlar, []);
    const otuz = await adimli(Array.from({ length: 30 }, (_, i) => `Adım ${i + 1}`));
    assert.equal((await adimlariAl(otuz.id)).length, 30);
  });

  test('adım açma: geçersiz adım emri hiç yazdırmaz (31 adım, boş ad, uzun ad ve açıklama)', async () => {
    const ist = await istasyonKur();
    const once = (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri'))!.n;
    const dene = (adimlar: unknown) => plan<Hata>('POST', '/uretim-emirleri', govde(ist, { adimlar }));
    assert.equal((await dene(Array.from({ length: 31 }, (_, i) => ({ ad: `A${i}` })))).durum, 400);
    assert.equal((await dene([{ ad: ' ' }])).durum, 400);
    assert.equal((await dene([{ ad: 'x'.repeat(121) }])).durum, 400);
    assert.equal((await dene([{ ad: 'a', aciklama: 'x'.repeat(301) }])).durum, 400);
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri'))!.n, once);
  });

  test('adım açma: emir ve adımlar tek işlemdir; adım yazısı düşerse emir de yazılmaz', async () => {
    const ist = await istasyonKur();
    const once = (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri'))!.n;
    await sahip().sorgu(`CREATE FUNCTION emir_adimi_deneme_hatasi() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'deneme'; END $$`);
    await sahip().sorgu('CREATE TRIGGER emir_adimi_deneme BEFORE INSERT ON emir_adimi FOR EACH ROW EXECUTE FUNCTION emir_adimi_deneme_hatasi()');
    try {
      assert.equal((await plan('POST', '/uretim-emirleri', govde(ist, { adimlar: [{ ad: 'A' }] }))).durum, 500);
    } finally {
      await sahip().sorgu('DROP TRIGGER emir_adimi_deneme ON emir_adimi');
      await sahip().sorgu('DROP FUNCTION emir_adimi_deneme_hatasi()');
    }
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri'))!.n, once);
  });

  test('adım: iptal edilen emrin adımları kalır', async () => {
    const emir = await adimli(['A', 'B']);
    await iptal(emir.id);
    assert.deepEqual((await adimlariAl(emir.id)).map((a) => a.ad), ['A', 'B']);
  });

  test('adım: tamamla ve geri al; tamamlayan ve zaman son tamamla olayından gelir, geri alınınca ikisi null; sıra zorunlu değil', async () => {
    const { emir, adimlar } = await adimliBaslamis();
    const [a1, a2, a3] = adimlar;
    const ucuncu = await tamamla(emir.id, a3!.id, true);
    assert.equal(ucuncu.durum, 200);
    const cevap = ucuncu.govde.adimlar ?? [];
    assert.deepEqual(cevap.map((a) => a.tamam), [false, false, true]);
    const yenidenOku = (await adimlariAl(emir.id)).find((a) => a.id === a3!.id);
    assert.equal(yenidenOku?.tamam, true);
    assert.deepEqual(yenidenOku?.tamamlayan, { id: (await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'operator'"))!.id, ad: 'Deneme operator' });
    assert.match(yenidenOku?.tamamlanma ?? '', /^\d{4}-\d{2}-\d{2}T/);
    emirCevabi.parse({ emir: ucuncu.govde.emir });
    assert.equal((await tamamla(emir.id, a1!.id, true, 'mudur')).durum, 200);
    assert.equal((await adimlariAl(emir.id)).find((a) => a.id === a1!.id)?.tamamlayan?.ad, 'Deneme mudur');
    // Başkası geri alır; sonra bir başkası yeniden işaretler: son tamamla olayı kazanır.
    assert.equal((await tamamla(emir.id, a3!.id, false, 'operator2')).durum, 200);
    const geriAlinmis = (await adimlariAl(emir.id)).find((a) => a.id === a3!.id);
    assert.deepEqual([geriAlinmis?.tamam, geriAlinmis?.tamamlayan, geriAlinmis?.tamamlanma], [false, null, null]);
    assert.equal((await tamamla(emir.id, a3!.id, true, 'mudur')).durum, 200);
    assert.equal((await adimlariAl(emir.id)).find((a) => a.id === a3!.id)?.tamamlayan?.ad, 'Deneme mudur');
    assert.equal((await tamamla(emir.id, a2!.id, true)).durum, 200);
    assert.equal(await adimOlaySayisi(emir.id), 5);
  });

  test('adım: aynı duruma yeniden ayarlama olay yazmaz ve 200 döner', async () => {
    const { emir, adimlar } = await adimliBaslamis(['A']);
    const id = adimlar[0]!.id;
    assert.equal((await tamamla(emir.id, id, false)).durum, 200);
    assert.equal(await adimOlaySayisi(emir.id), 0);
    await tamamla(emir.id, id, true);
    const ikinci = await tamamla(emir.id, id, true, 'operator2');
    assert.equal(ikinci.durum, 200);
    assert.equal(await adimOlaySayisi(emir.id), 1);
    assert.equal((await adimlariAl(emir.id))[0]?.tamamlayan?.ad, 'Deneme operator', 'işareti ilk işaretleyen korur');
    await tamamla(emir.id, id, false);
    assert.equal((await tamamla(emir.id, id, false)).durum, 200);
    assert.equal(await adimOlaySayisi(emir.id), 2);
  });

  test('adım: çalışırken, duraklıyken ve durmuşken serbest; bitirmeyi engellemez; adım olayları kayıt defterine girmez', async () => {
    await nedenleriKur();
    const { emir, adimlar } = await adimliBaslamis(['A', 'B', 'C']);
    assert.equal((await tamamla(emir.id, adimlar[0]!.id, true)).durum, 200);
    await komut(emir.id, 'duraklat');
    assert.equal((await tamamla(emir.id, adimlar[1]!.id, true)).durum, 200);
    await komut(emir.id, 'devam');
    await durdur(emir.id, durusId);
    assert.equal((await tamamla(emir.id, adimlar[2]!.id, true)).durum, 200);
    assert.equal((await tamamla(emir.id, adimlar[2]!.id, false)).durum, 200);
    const kayitOlaylari = (await ayrintiAl(emir.id)).kayitlar.map((k) => k.olay);
    assert.deepEqual(kayitOlaylari, ['baslat', 'duraklat', 'devam', 'durdur']);
    const son = await bitir0(emir.id);
    assert.equal(son.durum, 200, 'işaretsiz adım varken de biter');
    assert.equal((await adimlariAl(emir.id)).filter((a) => a.tamam).length, 2);
  });

  test('adım: planlı, bitmiş ve iptal emirde 409; başka emrin adımı ya da olmayan emir 404; geçersiz id ve gövde 400', async () => {
    const planli = await adimli(['A']);
    const planliAdim = (await adimlariAl(planli.id))[0]!.id;
    const red = await tamamla(planli.id, planliAdim, true);
    assert.equal(red.durum, 409);
    assert.equal(red.govde.mesaj, 'Adımlar yalnız başlamış emirde işaretlenir.');
    const iptalli = await adimli(['A']);
    await iptal(iptalli.id);
    assert.equal((await tamamla(iptalli.id, (await adimlariAl(iptalli.id))[0]!.id, true)).durum, 409);
    const { emir: biten, adimlar: bitenAdimlar } = await adimliBaslamis(['A']);
    await bitir0(biten.id);
    assert.equal((await tamamla(biten.id, bitenAdimlar[0]!.id, true)).durum, 409);
    assert.equal(await adimOlaySayisi(planli.id) + await adimOlaySayisi(iptalli.id) + await adimOlaySayisi(biten.id), 0);

    const { emir, adimlar } = await adimliBaslamis(['A']);
    const baska = await adimli(['Başka']);
    const baskaAdim = (await adlariSira(baska.id))[0]!.id;
    const yanlis = await tamamla(emir.id, baskaAdim, true);
    assert.equal(yanlis.durum, 404);
    assert.equal(yanlis.govde.mesaj, 'Adım bu emirde bulunamadı.');
    assert.equal((await tamamla(emir.id, 2147483000, true)).durum, 404);
    assert.equal((await tamamla(2147483000, adimlar[0]!.id, true)).durum, 404);
    for (const kotu of ['abc', '0', '-1']) {
      assert.equal((await istek(kisiCerezi('operator'), 'POST', `/uretim-emirleri/${kotu}/adimlar/${adimlar[0]!.id}/tamamla`, { tamam: true })).durum, 400, kotu);
      assert.equal((await istek(kisiCerezi('operator'), 'POST', `/uretim-emirleri/${emir.id}/adimlar/${kotu}/tamamla`, { tamam: true })).durum, 400, kotu);
    }
    assert.equal((await tamamla(emir.id, adimlar[0]!.id, true, 'operator', {})).durum, 400);
    assert.equal((await tamamla(emir.id, adimlar[0]!.id, true, 'operator', { tamam: 'evet' })).durum, 400);
    assert.equal((await tamamla(emir.id, adimlar[0]!.id, true, 'operator', { tamam: true, kisiId: 1 })).durum, 400);
    assert.equal(await adimOlaySayisi(emir.id), 0);
  });
  const adlariSira = (id: number) => adimlariAl(id);

  test('adım yetkisi: operatör, müdür ve yönetici işaretler; öbür roller 403, girişsiz 401; red olay yazmaz', async () => {
    const { emir, adimlar } = await adimliBaslamis(['A']);
    const id = adimlar[0]!.id;
    assert.equal((await istek(null, 'POST', `/uretim-emirleri/${emir.id}/adimlar/${id}/tamamla`, { tamam: true })).durum, 401);
    for (const kim of ['planlama_proje', ...DIGER_ROLLER]) assert.equal((await tamamla(emir.id, id, true, kim)).durum, 403, kim);
    assert.equal(await adimOlaySayisi(emir.id), 0);
    for (const kim of ['operator', 'mudur', 'yonetici']) {
      assert.equal((await tamamla(emir.id, id, true, kim)).durum, 200, kim);
      assert.equal((await tamamla(emir.id, id, false, kim)).durum, 200, kim);
    }
    // Okuma uçları adımları herkese gösterir.
    assert.equal((await istek(kisiCerezi('kalite'), 'GET', `/uretim-emirleri/${emir.id}`)).durum, 200);
  });

  test('adım kapsamı: kısıt dışı istasyonda 403 ve defter değişmez; kapsamdaki ve bayraklı kişi işaretler', async () => {
    const ist = await istasyonKur();
    const baska = await istasyonKur();
    const emir = await adimli(['A'], ist);
    await baslat(emir.id);
    const id = (await adimlariAl(emir.id))[0]!.id;
    await kapsamYaz(await merkezi(baska));
    await sahip().sorgu('INSERT INTO kisi_is_merkezi (kisi_id, is_merkezi_id) VALUES ($1, $2)', [yoneticiId, await merkezi(baska)]);
    try {
      const red = await tamamla(emir.id, id, true, 'kapsamli');
      assert.equal(red.durum, 403);
      assert.equal(red.govde.mesaj, 'Bu istasyonun iş merkezinde çalışma yetkiniz yok.');
      assert.equal(await adimOlaySayisi(emir.id), 0);
      assert.equal((await tamamla(emir.id, id, true, 'yonetici')).durum, 200, 'bayraklı kişi muaf');
      await kapsamYaz(await merkezi(ist));
      assert.equal((await tamamla(emir.id, id, false, 'kapsamli')).durum, 200);
    } finally {
      await kapsamYaz();
      await sahip().sorgu('DELETE FROM kisi_is_merkezi WHERE kisi_id = $1', [yoneticiId]);
    }
  });

  test('adım yarışı: aynı adıma iki eşzamanlı tamamla tek olay yazar', async () => {
    for (let tur = 0; tur < 4; tur += 1) {
      const { emir, adimlar } = await adimliBaslamis(['A']);
      const id = adimlar[0]!.id;
      const [a, b] = await yazmaTutarak(['emir_adimi_olayi'], 2, () => [tamamla(emir.id, id, true), tamamla(emir.id, id, true, 'operator2')] as const);
      assert.deepEqual([a.durum, b.durum], [200, 200]);
      assert.equal(await adimOlaySayisi(emir.id), 1);
      assert.equal((await adimlariAl(emir.id))[0]?.tamam, true);
    }
  });

  test('adım yarışı: tamamla ile bitir yarışırsa ya adım işaretlenip emir biter ya da adım 409 alır; tutarlı kalır', async () => {
    for (let tur = 0; tur < 8; tur += 1) {
      const { emir, adimlar } = await adimliBaslamis(['A']);
      const [t, b] = await yazmaTutarak(['emir_adimi_olayi', 'uretim_kaydi'], 2, () => (tur % 2 === 0
        ? [bitir0(emir.id), tamamla(emir.id, adimlar[0]!.id, true)] as const
        : [tamamla(emir.id, adimlar[0]!.id, true), bitir0(emir.id)] as const));
      const adimSonucu = tur % 2 === 0 ? b : t;
      const bitirSonucu = tur % 2 === 0 ? t : b;
      assert.equal(bitirSonucu.durum, 200);
      assert.ok(adimSonucu.durum === 200 || adimSonucu.durum === 409);
      assert.equal(await adimOlaySayisi(emir.id), adimSonucu.durum === 200 ? 1 : 0);
      assert.equal(await durumOku(emir.id), 'bitti');
      assert.equal((await adimlariAl(emir.id))[0]?.tamam, adimSonucu.durum === 200);
      // Kilit varken işaret ancak bitişten önce yazılır; bitişten sonra olay olamaz.
      const sonrasi = await sahip().tek<{ n: number }>(
        `SELECT count(*)::int AS n FROM emir_adimi_olayi o JOIN emir_adimi a ON a.id = o.adim_id JOIN uretim_emri e ON e.id = a.emir_id
          WHERE e.id = $1 AND o.zaman > e.bitis`, [emir.id]);
      assert.equal(sonrasi?.n, 0);
    }
  });

  test('adım: yeniden tamamlamada yeni zaman ve yeni kişi görünür', async () => {
    const { emir, adimlar } = await adimliBaslamis(['A']);
    const id = adimlar[0]!.id;
    await tamamla(emir.id, id, true);
    const ilk = (await adimlariAl(emir.id))[0]!;
    await tamamla(emir.id, id, false);
    await tamamla(emir.id, id, true, 'mudur');
    const son = (await adimlariAl(emir.id))[0]!;
    assert.equal(son.tamamlayan?.ad, 'Deneme mudur');
    assert.ok(Date.parse(son.tamamlanma ?? '') > Date.parse(ilk.tamamlanma ?? ''), 'yeni zaman');
  });

  test('adım açma: adım öğesindeki fazladan alanlar etkisizdir (sıra, tamam, kişi, zaman gövdeden alınmaz)', async () => {
    const ist = await istasyonKur();
    const c = await plan<{ emir: Emir }>('POST', '/uretim-emirleri', govde(ist, {
      adimlar: [{ ad: 'A', sira: 9, tamam: true, kisiId: 1, tamamlayan: { id: 1 }, zaman: '2020-01-01T00:00:00Z' }, { ad: 'B', sira: 1 }],
    }));
    assert.equal(c.durum, 200);
    const adimlar = await adimlariAl(c.govde.emir.id);
    assert.deepEqual(adimlar.map((a) => [a.sira, a.ad, a.tamam, a.tamamlayan, a.tamamlanma]), [[1, 'A', false, null, null], [2, 'B', false, null, null]]);
    assert.equal(await adimOlaySayisi(c.govde.emir.id), 0);
  });

  test('adım yarışı: tamamla ile geri al yarışırsa son durum son olayla tutarlıdır', async () => {
    for (let tur = 0; tur < 4; tur += 1) {
      const { emir, adimlar } = await adimliBaslamis(['A']);
      const id = adimlar[0]!.id;
      await tamamla(emir.id, id, true);
      const sonuclar = await yazmaTutarak(['emir_adimi_olayi'], 2, () => (tur % 2 === 0
        ? [tamamla(emir.id, id, false), tamamla(emir.id, id, true, 'operator2')] as const
        : [tamamla(emir.id, id, true, 'operator2'), tamamla(emir.id, id, false)] as const));
      assert.deepEqual(sonuclar.map((s) => s.durum), [200, 200]);
      const olaylar = await vt().sorgu<{ olay: string }>('SELECT olay FROM emir_adimi_olayi WHERE adim_id = $1 ORDER BY id', [id]);
      const son = olaylar[olaylar.length - 1]?.olay;
      const adim = (await adimlariAl(emir.id))[0]!;
      assert.equal(adim.tamam, son === 'tamamla');
      assert.equal(adim.tamamlayan === null, !adim.tamam);
      // Geri alma sırada ikinciyse üç olay (tamamla, geri-al ... ) olamaz: biri no-op'tur.
      assert.ok(olaylar.length === 2 || olaylar.length === 3, `olay sayısı ${olaylar.length}`);
    }
  });

  test('yalnız ekleme: adım ve adım olayı tabloları güncellenemez, silinemez, boşaltılamaz (iki rol ayrı)', async () => {
    const { emir, adimlar } = await adimliBaslamis(['A']);
    await tamamla(emir.id, adimlar[0]!.id, true);
    for (const [tablo, sutun, kosul] of [['emir_adimi', 'ad', 'emir_id'], ['emir_adimi_olayi', 'kisi_id', 'adim_id']] as const) {
      const anahtar = tablo === 'emir_adimi' ? emir.id : adimlar[0]!.id;
      for (const [kim, baglanti] of [['uygulama', vt()], ['sahip', sahip()]] as const) {
        await assert.rejects(baglanti.sorgu(`UPDATE ${tablo} SET ${sutun} = ${sutun} WHERE ${kosul} = $1`, [anahtar]), /yalnız ekleme/, `${tablo} UPDATE (${kim})`);
        await assert.rejects(baglanti.sorgu(`DELETE FROM ${tablo} WHERE ${kosul} = $1`, [anahtar]), /yalnız ekleme/, `${tablo} DELETE (${kim})`);
      }
      await assert.rejects(vt().sorgu(`TRUNCATE ${tablo}`), izinYok, `${tablo} TRUNCATE (uygulama)`);
    }
    // Yabancı anahtar tek tabloyu boşaltmayı önce durdurur; ikisi birlikte boşaltılınca tetikleyici ölçülür.
    await assert.rejects(sahip().sorgu('TRUNCATE emir_adimi, emir_adimi_olayi'), /yalnız ekleme/, 'TRUNCATE (sahip)');
    assert.equal(await adimOlaySayisi(emir.id), 1);
  });

  test('adım kısıtları: aynı emirde aynı sıra, boş ad, sıfır sıra ve bilinmeyen olay yazılamaz', async () => {
    const emir = await adimli(['A']);
    const kisi = (await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'operator'"))!.id;
    const adimYaz = (sira: number, ad: string, aciklama: string | null = null) =>
      sahip().sorgu('INSERT INTO emir_adimi (emir_id, sira, ad, aciklama) VALUES ($1, $2, $3, $4)', [emir.id, sira, ad, aciklama]);
    const kisit = (adi: string) => (h: { constraint?: string }) => h.constraint === adi;
    await assert.rejects(adimYaz(1, 'Yinelenen'), kisit('emir_adimi_sira_benzersiz'));
    await assert.rejects(adimYaz(0, 'Sıfır'), kisit('emir_adimi_sira_pozitif'));
    await assert.rejects(adimYaz(2, ' '), kisit('emir_adimi_ad_bicimi'));
    await assert.rejects(adimYaz(2, 'A', ' '), kisit('emir_adimi_aciklama_bicimi'));
    await adimYaz(2, 'Geçerli');
    const adim = (await adimlariAl(emir.id))[0]!;
    await assert.rejects(
      sahip().sorgu("INSERT INTO emir_adimi_olayi (adim_id, kisi_id, olay) VALUES ($1, $2, 'sil')", [adim.id, kisi]),
      kisit('emir_adimi_olayi_olay_degeri'));
  });

  test('bağlantı: işlemdeki bağlantıda eşzamanlı sorgu yok (pg kullanımdan kalkan çağrı uyarısı çıkmadı)', async () => {
    const ist = await istasyonKur();
    const emir = await emirAc(ist);
    await plan('GET', '/uretim-emirleri');
    await plan('GET', `/uretim-emirleri/${emir.id}`);
    // Uyarılar olay döngüsünün sonraki turunda yayılır.
    await new Promise((coz) => setImmediate(coz));
    await new Promise((coz) => setImmediate(coz));
    assert.deepEqual(uyarilar.filter((u) => /client\.query\(\)/.test(u)), []);
  });
});
