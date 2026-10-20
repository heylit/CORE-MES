import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type {
  KatalogAyarlariCevabi, KatalogKartiKaydetCevabi, KatalogKartlariCevabi, KatalogSablonlariCevabi,
} from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { malzemeKullanilabilirMi, malzemeOzeti } from './disari.ts';
import { uclar } from './uclar.ts';
import { surumlu } from './test-surum.ts';

const PAROLA = 'dogru-parola-1';

describe('Malzeme Kataloğu kartları (gerçek PostgreSQL, gerçek giriş)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let onayci = '';
  let onayci2 = '';
  let yazar = '';
  let okuyucu = '';

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = async (cerezi: string | null, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<LightMyRequestResponse> =>
    app.inject({
      method: yontem, url: `/api${url}`,
      ...(cerezi === null ? {} : { headers: { cookie: cerezi } }),
      ...(govde === undefined ? {} : { payload: (await surumlu(vt(), url, govde)) as object }),
    });
  async function tamam<T>(cerezi: string, yontem: 'GET' | 'POST', url: string, govde?: unknown): Promise<T> {
    const c = await istek(cerezi, yontem, url, govde);
    assert.equal(c.statusCode, 200, `${yontem} ${url}: ${c.body}`);
    return c.json() as T;
  }
  async function ret(durum: number, kod: string, cerezi: string | null, yontem: 'GET' | 'POST', url: string, govde?: unknown) {
    const c = await istek(cerezi, yontem, url, govde);
    assert.deepEqual({ durum: c.statusCode, kod: c.json().kod }, { durum, kod }, `${yontem} ${url}: ${c.body}`);
    return c;
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

  // Prototipin gönderdiği biçimde kart: kimlik, com.kod ve özet; içerik serbesttir.
  let sayac = 0;
  const kart = (ek: { durum?: string; anahtar?: string | null; kod?: string; gerekce?: string | null; kimlik?: string; tur?: string } = {}) => {
    const kimlik = ek.kimlik ?? `dnm${++sayac}`;
    return {
      kimlik,
      govde: (surum: number | null, durum = ek.durum ?? 'taslak') => ({
        kayit: { id: kimlik, tur: ek.tur ?? 'hammadde', fam: 'metal', com: { kod: ek.kod ?? 'HM-DNM-00001', ad: `Deneme kart ${kimlik}`, birim: 'adet' }, opts: { koruma: ['Koruyucu folyo'] }, onay: { durum } },
        ozet: { stok_kodu: ek.kod ?? 'HM-DNM-00001', tur: ek.tur ?? 'hammadde', onay_durumu: durum, benzersiz_anahtar: ek.anahtar === undefined ? `HM|metal|${kimlik}` : ek.anahtar, mukerrer_gerekcesi: ek.gerekce ?? null },
        surum,
      }),
    };
  };
  const kaydet = (cerezi: string, k: ReturnType<typeof kart>, surum: number | null, durum?: string) =>
    tamam<KatalogKartiKaydetCevabi>(cerezi, 'POST', `/malzeme-katalogu-kartlari/${k.kimlik}/kaydet`, k.govde(surum, durum));

  before(async () => {
    ortam = await testVeritabaniKur('malzemekatalog');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    // Yetkiler rol göçünden gelir: satın alma yazar.
    const ilk = await girisYap('k-onayci', 'yonetici');
    onayci = ilk.cerez;
    onayci2 = (await girisYap('k-onayci-iki', 'yonetici')).cerez;
    yazar = (await girisYap('k-yazar', 'satin_alma', ilk.id)).cerez;
    // Yerleşik rollerin hiçbiri malzemeyi yalnız okumaz: okuyucu rolü testte açılır.
    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('okuyucu', 'Okuyucu')");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'sayfa.malzemeler' FROM rol WHERE kod = 'okuyucu'");
    okuyucu = (await girisYap('k-okuyucu', 'okuyucu', ilk.id)).cerez;
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('MKK-14 (kart #163): tür, onay durumu ve kod öneki kartın kendisinden; özet bunları taşımasa da kart doğru sütunlarla kaydedilir', async () => {
    const kimlik = `ozt${++sayac}`;
    const kayit = { id: kimlik, tur: 'sarf', fam: 'metal', com: { kod: 'SF-OZT-00042', ad: `Özetsiz ${kimlik}` }, onay: { durum: 'taslak' } };
    const r = await tamam<KatalogKartiKaydetCevabi>(yazar, 'POST', `/malzeme-katalogu-kartlari/${kimlik}/kaydet`, {
      kayit, ozet: { benzersiz_anahtar: `SF|metal|${kimlik}`, mukerrer_gerekcesi: null }, surum: null,
    });
    assert.equal(r.stok_kodu, 'SF-OZT-00001');
    const satir = await vt().tek<{ tur: string; onay_durumu: string; onek: string }>('SELECT tur, onay_durumu, onek FROM malzeme_katalog_karti WHERE kimlik = $1', [kimlik]);
    assert.deepEqual(satir, { tur: 'sarf', onay_durumu: 'taslak', onek: 'SF-OZT-' });
  });

  test('MKK-14 (kart #163): özet karttan farklı önek, tür ya da durum taşırsa 400; kartın türü ya da onay durumu geçersizse 400', async () => {
    const yol = (kimlik: string) => `/malzeme-katalogu-kartlari/${kimlik}/kaydet`;
    const govde = (kimlik: string, kayitEk: Record<string, unknown>, ozetEk: Record<string, unknown>) => ({
      kayit: { id: kimlik, tur: 'sarf', fam: 'metal', com: { kod: 'SF-OZT-00001', ad: `Ret ${kimlik}` }, onay: { durum: 'taslak' }, ...kayitEk },
      ozet: { benzersiz_anahtar: `SF|metal|${kimlik}`, mukerrer_gerekcesi: null, ...ozetEk }, surum: null,
    });
    const k = `ozr${++sayac}`;
    await ret(400, 'DOGRULAMA', yazar, 'POST', yol(k), govde(k, {}, { stok_kodu: 'HM-OZT-00001', tur: 'hammadde' }));
    await ret(400, 'DOGRULAMA', yazar, 'POST', yol(k), govde(k, {}, { stok_kodu: 'SF-BSK-00001', tur: 'sarf', onay_durumu: 'taslak' }));
    await ret(400, 'DOGRULAMA', yazar, 'POST', yol(k), govde(k, {}, { tur: 'mamul' }));
    await ret(400, 'DOGRULAMA', yazar, 'POST', yol(k), govde(k, {}, { onay_durumu: 'aktif' }));
    await ret(400, 'DOGRULAMA', yazar, 'POST', yol(k), govde(k, { tur: 'bilinmeyen' }, {}));
    await ret(400, 'DOGRULAMA', yazar, 'POST', yol(k), govde(k, { onay: undefined }, {}));
    await ret(400, 'DOGRULAMA', yazar, 'POST', yol(k), govde(k, { com: { ad: 'kodsuz' } }, { stok_kodu: 'SF-OZT-00001' }));
    assert.equal(await vt().tek('SELECT 1 FROM malzeme_katalog_karti WHERE kimlik = $1', [k]), null);
    await tamam(yazar, 'POST', yol(k), govde(k, {}, { stok_kodu: 'SF-OZT-00001', tur: 'sarf', onay_durumu: 'taslak' }));
  });

  test('MKK-1, MKK-2: stok kodunu sunucu verir; önek prototipten, sıra önek başına; kod kartın içine de yazılır', async () => {
    const a = kart({ kod: 'HM-DNM-00099' });
    const b = kart({ kod: 'HM-DNM-00007' });
    const c = kart({ kod: 'SF-KYN-00001', tur: 'sarf' });
    assert.equal((await kaydet(yazar, a, null)).stok_kodu, 'HM-DNM-00001');
    assert.equal((await kaydet(yazar, b, null)).stok_kodu, 'HM-DNM-00002');
    assert.equal((await kaydet(yazar, c, null)).stok_kodu, 'SF-KYN-00001');
    const liste = await tamam<KatalogKartlariCevabi>(okuyucu, 'GET', '/malzeme-katalogu-kartlari?sayfaBoyu=500');
    const a2 = liste.satirlar.find((x) => x.kimlik === a.kimlik)!.kayit!;
    assert.equal((a2['com'] as { kod: string }).kod, 'HM-DNM-00001');
    assert.deepEqual((a2['opts'] as { koruma: string[] }).koruma, ['Koruyucu folyo'], 'kart bütün olarak saklanır');
    await ret(400, 'DOGRULAMA', yazar, 'POST', `/malzeme-katalogu-kartlari/${kart().kimlik}/kaydet`, kart({ kod: 'ÖZEL' }).govde(null));
  });

  test('MKK-1: aynı önekte eşzamanlı iki kart aynı numarayı almaz', async () => {
    const kartlar = Array.from({ length: 6 }, () => kart({ kod: 'HM-ESZ-00001' }));
    const sonuc = await Promise.all(kartlar.map((k) => kaydet(yazar, k, null)));
    assert.equal(new Set(sonuc.map((r) => r.stok_kodu)).size, 6);
  });

  test('MKK-7: sürüm okunanla aynı değilse 409; doğru sürümle yazılır ve artar', async () => {
    const k = kart();
    const ilk = await kaydet(yazar, k, null);
    await ret(409, 'CAKISMA', yazar, 'POST', `/malzeme-katalogu-kartlari/${k.kimlik}/kaydet`, k.govde(ilk.surum + 5));
    const ikinci = await kaydet(yazar, k, ilk.surum);
    assert.equal(ikinci.surum, ilk.surum + 1);
    assert.equal(ikinci.stok_kodu, ilk.stok_kodu, 'kayıtlı kartın stok kodu değişmez');
  });

  test('Mükerrer: aynı anahtarla ikinci kart 409; gerekçeyle açılır', async () => {
    const a = kart({ anahtar: 'HM|metal|ayni' });
    await kaydet(yazar, a, null);
    const c = await ret(409, 'CAKISMA', yazar, 'POST', `/malzeme-katalogu-kartlari/dnm-ikinci/kaydet`, kart({ kimlik: 'dnm-ikinci', anahtar: 'HM|metal|ayni' }).govde(null));
    assert.match(c.json().mesaj, /zaten var/);
    await kaydet(yazar, kart({ kimlik: 'dnm-ikinci', anahtar: 'HM|metal|ayni', gerekce: 'Müşteriye özel ayrı kart gerekli' }), null);
  });

  test('MKK-3, MKK-4: onaya gönderen onaylayamaz (403, kısıt da tutar); başkası onaylar; yazma yetkilisi aktif yapamaz', async () => {
    const k = kart();
    let r = await kaydet(yazar, k, null);
    await ret(403, 'YETKI_YOK', yazar, 'POST', `/malzeme-katalogu-kartlari/${k.kimlik}/kaydet`, k.govde(r.surum, 'aktif'));
    r = await kaydet(onayci, k, r.surum, 'onayda');
    await ret(403, 'YETKI_YOK', onayci, 'POST', `/malzeme-katalogu-kartlari/${k.kimlik}/kaydet`, k.govde(r.surum, 'aktif'));
    r = await kaydet(onayci2, k, r.surum, 'aktif');
    const satir = await vt().tek<{ onay_durumu: string; dort_gozsuz_onay: boolean }>('SELECT onay_durumu, dort_gozsuz_onay FROM malzeme_katalog_karti WHERE kimlik = $1', [k.kimlik]);
    assert.deepEqual(satir, { onay_durumu: 'aktif', dort_gozsuz_onay: false });
    await assert.rejects(
      vt().sorgu('UPDATE malzeme_katalog_karti SET onaylayan_kisi_id = gonderen_kisi_id WHERE kimlik = $1', [k.kimlik]),
      (e: { constraint?: string }) => e.constraint === 'malzeme_katalog_karti_dort_goz',
    );
  });

  test('disari: uçtan kaydedilip onaylanan kartın sayı kimliğiyle özet ve kullanılabilirlik okunur', async () => {
    const k = kart({ kod: 'HM-DIS-00001' });
    let r = await kaydet(yazar, k, null);
    const noAl = async (): Promise<number> => (await vt().tek<{ no: number }>('SELECT no FROM malzeme_katalog_karti WHERE kimlik = $1', [k.kimlik]))!.no;
    const no = await noAl();
    await vt().tx(async (db) => {
      assert.equal(await malzemeKullanilabilirMi(db, no), false, 'taslak');
      assert.equal((await malzemeOzeti(db, no))?.onayDurumu, 'taslak');
    });
    r = await kaydet(onayci, k, r.surum, 'onayda');
    r = await kaydet(onayci2, k, r.surum, 'aktif');
    await vt().tx(async (db) => {
      assert.equal(await malzemeKullanilabilirMi(db, no), true);
      const ozet = await malzemeOzeti(db, no);
      assert.deepEqual({ ad: ozet?.ad, kod: ozet?.kod, kimlik: ozet?.kimlik }, { ad: `Deneme kart ${k.kimlik}`, kod: r.stok_kodu, kimlik: k.kimlik });
    });
  });

  test('MKK-5, MKK-6: pasife alma onay ister; yalnız taslak iptal edilir; kart silinmez, stok kodu değişmez', async () => {
    const k = kart();
    let r = await kaydet(onayci, k, null, 'onayda');
    r = await kaydet(onayci2, k, r.surum, 'aktif');
    await ret(403, 'YETKI_YOK', yazar, 'POST', `/malzeme-katalogu-kartlari/${k.kimlik}/kaydet`, k.govde(r.surum, 'pasif'));
    r = await kaydet(onayci, k, r.surum, 'pasif');
    await ret(422, 'GECERSIZ', yazar, 'POST', `/malzeme-katalogu-kartlari/${k.kimlik}/iptal`);
    const t = kart();
    await kaydet(yazar, t, null);
    await tamam(yazar, 'POST', `/malzeme-katalogu-kartlari/${t.kimlik}/iptal`);
    const liste = await tamam<KatalogKartlariCevabi>(okuyucu, 'GET', '/malzeme-katalogu-kartlari?sayfaBoyu=500');
    assert.deepEqual(liste.satirlar.filter((x) => x.kimlik === t.kimlik).map((x) => x.kayit), [null], 'iptal kart gövdesiz gelir');
    await assert.rejects(vt().sorgu('DELETE FROM malzeme_katalog_karti WHERE kimlik = $1', [t.kimlik]), (e: { constraint?: string }) => e.constraint === 'malzeme_katalog_karti_silinmez');
    await assert.rejects(vt().sorgu('UPDATE malzeme_katalog_karti SET sira_no = sira_no + 100 WHERE kimlik = $1', [k.kimlik]), (e: { constraint?: string }) => e.constraint === 'malzeme_katalog_karti_degismez');
  });

  test('Liste sayfalıdır: sayfalar kart numarası sırasıyla bütün kartları bir kez verir; araya düşen iptal ve düzenleme kart atlatmaz', async () => {
    const yeniler = Array.from({ length: 5 }, () => kart());
    const surumler = new Map<string, number>();
    for (const k of yeniler) surumler.set(k.kimlik, (await kaydet(yazar, k, null)).surum);
    const oku = (sayfa: number) => tamam<KatalogKartlariCevabi>(okuyucu, 'GET', `/malzeme-katalogu-kartlari?sayfa=${sayfa}&sayfaBoyu=2`);
    const ilk = await oku(1);
    assert.equal(ilk.sayfaBoyu, 2);
    assert.ok(ilk.toplam !== null && ilk.toplam >= 5);
    const gorulen = ilk.satirlar.map((x) => x.kimlik);
    // Okuma sürerken yeni yazılan bir kart iptal, biri düzenlenir.
    const iptal = yeniler[yeniler.length - 1]!;
    await tamam(yazar, 'POST', `/malzeme-katalogu-kartlari/${iptal.kimlik}/iptal`);
    await kaydet(yazar, yeniler[0]!, surumler.get(yeniler[0]!.kimlik)!);
    for (let sayfa = 2; sayfa <= Math.ceil(ilk.toplam! / 2); sayfa++) gorulen.push(...(await oku(sayfa)).satirlar.map((x) => x.kimlik));
    const hepsi = (await vt().sorgu<{ kimlik: string }>('SELECT kimlik FROM malzeme_katalog_karti ORDER BY no')).map((x) => x.kimlik);
    assert.deepEqual(gorulen, hepsi);
    const asiri = await tamam<KatalogKartlariCevabi>(okuyucu, 'GET', '/malzeme-katalogu-kartlari?sayfaBoyu=100000');
    assert.equal(asiri.sayfaBoyu, 500, 'sayfa boyu üst sınıra çekilir');
    await ret(400, 'DOGRULAMA', okuyucu, 'GET', '/malzeme-katalogu-kartlari?sayfa=0');
  });

  test('Önbellek: "sonra" verilince yalnız o andan (5 dakika payıyla) sonra değişen kartlar gelir; iptal gövdesiz gelir; bozuk an 400', async () => {
    const eski = kart();
    const degisecek = kart();
    const iptal = kart();
    await kaydet(yazar, eski, null);
    const r = await kaydet(yazar, degisecek, null);
    await kaydet(yazar, iptal, null);
    // Kartlar sanki bir saat önce yazılmış: okuma anı ondan sonradır.
    await vt().sorgu("UPDATE malzeme_katalog_karti SET guncelleme = guncelleme - interval '1 hour' WHERE kimlik = ANY($1)", [[eski.kimlik, degisecek.kimlik, iptal.kimlik]]);
    const ilk = await tamam<KatalogKartlariCevabi>(okuyucu, 'GET', '/malzeme-katalogu-kartlari?sayfaBoyu=500');
    const sonra = (an: string) => tamam<KatalogKartlariCevabi>(okuyucu, 'GET', `/malzeme-katalogu-kartlari?sayfaBoyu=500&sonra=${encodeURIComponent(an)}`);
    const kimlikler = (c: KatalogKartlariCevabi) => c.satirlar.map((x) => x.kimlik);
    for (const k of [eski, degisecek, iptal]) assert.ok(!kimlikler(await sonra(ilk.an)).includes(k.kimlik), 'değişmeyen kart gelmez');
    await kaydet(yazar, degisecek, r.surum);
    await tamam(yazar, 'POST', `/malzeme-katalogu-kartlari/${iptal.kimlik}/iptal`);
    const yeni = kart();
    await kaydet(yazar, yeni, null);
    const d = await sonra(ilk.an);
    assert.ok(!kimlikler(d).includes(eski.kimlik));
    assert.deepEqual(d.satirlar.filter((x) => x.kimlik === degisecek.kimlik).map((x) => x.surum), [r.surum + 1]);
    assert.deepEqual(d.satirlar.filter((x) => x.kimlik === iptal.kimlik).map((x) => x.kayit), [null]);
    assert.ok(kimlikler(d).includes(yeni.kimlik));
    assert.ok(Date.parse(d.an) >= Date.parse(ilk.an));
    await ret(400, 'DOGRULAMA', okuyucu, 'GET', '/malzeme-katalogu-kartlari?sonra=dun');
  });

  test('Yetki: oturumsuz 401; yetkisiz yazma 403; okuma oturumla açık', async () => {
    await ret(401, 'OTURUM_YOK', null, 'GET', '/malzeme-katalogu-kartlari');
    await ret(403, 'YETKI_YOK', okuyucu, 'POST', `/malzeme-katalogu-kartlari/${kart().kimlik}/kaydet`, kart().govde(null));
    await ret(403, 'YETKI_YOK', okuyucu, 'POST', '/malzeme-katalogu-sablonlari/s1/kaydet', { sablon: { id: 's1', ad: 'Deneme şablon' } });
    await ret(403, 'YETKI_YOK', yazar, 'POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: true } });
    await tamam(okuyucu, 'GET', '/malzeme-katalogu-sablonlari');
  });

  test('MKK-18: ayarlar operasyon listesini istasyonların operasyon tiplerinden verir; pasifler de gelir', async () => {
    const y = await tamam<KatalogAyarlariCevabi>(okuyucu, 'GET', '/malzeme-katalogu-ayarlari');
    assert.equal(y.operasyonTipleri.length, 96);
    assert.deepEqual(y.operasyonTipleri.find((t) => t.kod === 'LZR'), { kod: 'LZR', ad: 'Lazer kesim', grup: 'KES', grupAdi: 'Kesim', aktif: true });
    await ortam!.sahip.tx((db) => db.sorgu("UPDATE istasyonlar_operasyon_tipi SET aktif = false, surum = surum + 1 WHERE kod = 'LZR'"));
    assert.equal((await tamam<KatalogAyarlariCevabi>(okuyucu, 'GET', '/malzeme-katalogu-ayarlari')).operasyonTipleri.find((t) => t.kod === 'LZR')?.aktif, false);
    await ortam!.sahip.tx((db) => db.sorgu("UPDATE istasyonlar_operasyon_tipi SET aktif = true, surum = surum + 1 WHERE kod = 'LZR'"));
  });

  test('MKK-8, MKK-9: ayarlar rolü TMI işleminden verir; onay akışı kapatılınca yazma yetkilisi aktif kart açar', async () => {
    assert.equal((await tamam<KatalogAyarlariCevabi>(yazar, 'GET', '/malzeme-katalogu-ayarlari')).rol, 'talep');
    assert.equal((await tamam<KatalogAyarlariCevabi>(okuyucu, 'GET', '/malzeme-katalogu-ayarlari')).rol, null);
    const y = await tamam<KatalogAyarlariCevabi>(onayci, 'GET', '/malzeme-katalogu-ayarlari');
    assert.deepEqual({ rol: y.rol, ayarYazabilir: y.ayarYazabilir, dortGoz: y.dortGoz }, { rol: 'yonetici', ayarYazabilir: true, dortGoz: true });
    await tamam(onayci, 'POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false, dortGoz: true } });
    assert.deepEqual((await tamam<KatalogAyarlariCevabi>(yazar, 'GET', '/malzeme-katalogu-ayarlari')).genel, { onayAkisi: false, dortGoz: true });
    await kaydet(yazar, kart(), null, 'aktif');
    await tamam(onayci, 'POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: true } });
    await ret(400, 'DOGRULAMA', onayci, 'POST', '/malzeme-katalogu-ayarlari/baska/kaydet', { deger: {} });
  });

  test('Dört göz ayarı (malzemeler.dort-goz): kapatılınca gönderen kendi kartını aktif yapar ve satır işaretlenir; açılınca yeniden 403', async () => {
    const ayarYaz = (deger: boolean) => tamam(onayci, 'POST', '/ayarlar/malzemeler.dort-goz/degistir', { deger });
    await ayarYaz(false);
    try {
      assert.equal((await tamam<KatalogAyarlariCevabi>(onayci, 'GET', '/malzeme-katalogu-ayarlari')).dortGoz, false);
      const a = kart();
      const ra = await kaydet(onayci, a, null, 'onayda');
      await kaydet(onayci, a, ra.surum, 'aktif');
      const satir = await vt().tek<{ onay_durumu: string; dort_gozsuz_onay: boolean }>('SELECT onay_durumu, dort_gozsuz_onay FROM malzeme_katalog_karti WHERE kimlik = $1', [a.kimlik]);
      assert.deepEqual(satir, { onay_durumu: 'aktif', dort_gozsuz_onay: true });
    } finally {
      await ayarYaz(true);
    }
    assert.equal((await tamam<KatalogAyarlariCevabi>(onayci, 'GET', '/malzeme-katalogu-ayarlari')).dortGoz, true);
    const b = kart();
    const rb = await kaydet(onayci, b, null, 'onayda');
    await ret(403, 'YETKI_YOK', onayci, 'POST', `/malzeme-katalogu-kartlari/${b.kimlik}/kaydet`, b.govde(rb.surum, 'aktif'));
  });

  // Kullanıcı kararı "İstesin" (malzeme denetimi 2/5): birimi boş kart taslak kaydolur, onaya gönderilemez ve aktif yapılamaz.
  test('Birim: birimi boş kart taslak kaydolur; onaya gönderilemez ve aktif yapılamaz (400); birim girilince gönderilir', async () => {
    const k = kart({ anahtar: null, tur: 'yarimamul', kod: 'YM-BRM-00001' });
    const birimsiz = (surum: number | null, durum: string) => {
      const g = k.govde(surum, durum);
      return { ...g, kayit: { ...g.kayit, com: { ...g.kayit.com, birim: '  ' } } };
    };
    const url = `/malzeme-katalogu-kartlari/${k.kimlik}/kaydet`;
    const t = await tamam<KatalogKartiKaydetCevabi>(yazar, 'POST', url, birimsiz(null, 'taslak'));
    await ret(400, 'DOGRULAMA', yazar, 'POST', url, birimsiz(t.surum, 'onayda'));
    await tamam(onayci, 'POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: { onayAkisi: false } });
    try {
      await ret(400, 'DOGRULAMA', onayci, 'POST', url, birimsiz(t.surum, 'aktif'));
    } finally {
      await tamam(onayci, 'POST', '/malzeme-katalogu-ayarlari/genel/kaydet', { deger: {} });
    }
    const r = await kaydet(yazar, k, t.surum, 'onayda');
    assert.equal(r.surum, t.surum + 1);
  });

  // Kullanıcı kararı "Denetlensin" (malzeme denetimi 4/5): ayarda zorunlu işaretli alan onaya gönderme ve aktif yapma anında denetlenir.
  test('Zorunlu alan: ayarda zorunlu alan boşsa taslak kaydolur, onaya gönderilemez; ekranın bu kartta göstermediği alan sayılmaz', async () => {
    await tamam(onayci, 'POST', '/malzeme-katalogu-ayarlari/malzeme/kaydet', { deger: { kurallar: { yarimamul: { zorunlu: { resim: true, rev: false } } } } });
    try {
      const k = kart({ anahtar: null, tur: 'yarimamul', kod: 'YM-ZRN-00001' });
      const url = `/malzeme-katalogu-kartlari/${k.kimlik}/kaydet`;
      const ile = (surum: number | null, durum: string, g: Record<string, unknown>, uygulanmayan?: string[]) => {
        const o = k.govde(surum, durum);
        return { ...o, kayit: { ...o.kayit, g }, ozet: { ...o.ozet, ...(uygulanmayan ? { uygulanmayan_zorunlu: uygulanmayan } : {}) } };
      };
      const t = await tamam<KatalogKartiKaydetCevabi>(yazar, 'POST', url, ile(null, 'taslak', { resim: ' ' }));
      const c = await istek(yazar, 'POST', url, ile(t.surum, 'onayda', { resim: ' ' }));
      assert.deepEqual([c.statusCode, c.json().kod], [400, 'DOGRULAMA'], c.body);
      assert.match(c.json().mesaj, /resim/);
      assert.doesNotMatch(c.json().mesaj, /rev/);
      const r = await tamam<KatalogKartiKaydetCevabi>(yazar, 'POST', url, ile(t.surum, 'onayda', {}, ['resim']));
      assert.equal(r.surum, t.surum + 1);
      const k2 = kart({ anahtar: null, tur: 'yarimamul', kod: 'YM-ZRN-00002' });
      const o2 = k2.govde(null, 'onayda');
      await tamam(yazar, 'POST', `/malzeme-katalogu-kartlari/${k2.kimlik}/kaydet`, { ...o2, kayit: { ...o2.kayit, g: { resim: 'RS-1' } } });
    } finally {
      await tamam(onayci, 'POST', '/malzeme-katalogu-ayarlari/malzeme/kaydet', { deger: {} });
    }
  });

  // Kullanıcı kararı "Reddedilsin" (malzeme denetimi 1/5): kart kaydında kategori malzeme_kategorisi listesinde açık olmalı; kayıtlı kart dokunulmadan kalır.
  test('Kategori: listedeki açık kategori kaydolur; listede olmayan ve kapalı kategori 400 (alan kayit.g.kat); kayıtlı kartın kapanan kategorisi yeniden kaydolur', async () => {
    const sarf = (kat: string) => {
      const k = kart({ tur: 'sarf', kod: 'SF-KYN-00001' });
      const govde = (surum: number | null) => { const o = k.govde(surum); return { ...o, kayit: { ...o.kayit, g: { kat } } }; };
      return { url: `/malzeme-katalogu-kartlari/${k.kimlik}/kaydet`, govde };
    };
    const izinli = sarf('kaynak');
    const t = await tamam<KatalogKartiKaydetCevabi>(yazar, 'POST', izinli.url, izinli.govde(null));
    const yok = sarf('listede-olmayan');
    const c = await istek(yazar, 'POST', yok.url, yok.govde(null));
    assert.deepEqual([c.statusCode, c.json().kod, c.json().alan], [400, 'DOGRULAMA', 'kayit.g.kat'], c.body);
    assert.match(c.json().mesaj, /listede-olmayan.*Malzeme ayarlarından açın/);
    await tamam(onayci, 'POST', '/malzeme-katalogu-ayarlari/malzeme/kaydet', { deger: { gizliKategoriler: ['sarf|kaynak'] } });
    try {
      const kapali = sarf('kaynak');
      assert.equal((await istek(yazar, 'POST', kapali.url, kapali.govde(null))).statusCode, 400);
      // Kategorisi sonradan kapanan kayıtlı kart, kategorisi değişmedikçe kaydedilir.
      const r = await tamam<KatalogKartiKaydetCevabi>(yazar, 'POST', izinli.url, izinli.govde(t.surum));
      assert.equal(r.surum, t.surum + 1);
    } finally {
      await tamam(onayci, 'POST', '/malzeme-katalogu-ayarlari/malzeme/kaydet', { deger: {} });
    }
    const acildi = sarf('kaynak');
    await tamam(yazar, 'POST', acildi.url, acildi.govde(null));
  });

  test('Gerekçe: mükerrer kart gerekçesi en az 10 karakter; kısa gerekçe 400 (alan ozet.mukerrer_gerekcesi); kayıtlı kısa gerekçe değişmedikçe kaydolur', async () => {
    await kaydet(yazar, kart({ kimlik: 'grk-ilk', anahtar: 'HM|metal|grk' }), null);
    const kisa = kart({ kimlik: 'grk-kisa', anahtar: 'HM|metal|grk', gerekce: ' x  ' });
    const c = await istek(yazar, 'POST', `/malzeme-katalogu-kartlari/${kisa.kimlik}/kaydet`, kisa.govde(null));
    assert.deepEqual([c.statusCode, c.json().kod, c.json().alan], [400, 'DOGRULAMA', 'ozet.mukerrer_gerekcesi'], c.body);
    assert.match(c.json().mesaj, /en az 10 karakter/);
    const dokuz = kart({ kimlik: 'grk-dokuz', anahtar: 'HM|metal|grk', gerekce: '123456789' });
    assert.equal((await istek(yazar, 'POST', `/malzeme-katalogu-kartlari/${dokuz.kimlik}/kaydet`, dokuz.govde(null))).statusCode, 400);
    const yeterli = kart({ kimlik: 'grk-on', anahtar: 'HM|metal|grk', gerekce: '1234567890' });
    const r = await kaydet(yazar, yeterli, null);
    // Kuraldan önce kısa gerekçeyle kaydolmuş kart, gerekçesi değişmedikçe yeniden kaydedilir.
    await vt().sorgu("UPDATE malzeme_katalog_karti SET mukerrer_gerekcesi = 'eski' WHERE kimlik = 'grk-on'");
    const eski = kart({ kimlik: 'grk-on', anahtar: 'HM|metal|grk', gerekce: 'eski' });
    await kaydet(yazar, eski, r.surum);
  });

  test('Anahtar sınırı: 500 karakterlik benzersiz anahtar kaydolur; 501 karakter 400 (alan ozet.benzersiz_anahtar), kart yazılmaz', async () => {
    const sinirda = kart({ kimlik: 'anh-500', anahtar: 'a'.repeat(500) });
    await kaydet(yazar, sinirda, null);
    const asan = kart({ kimlik: 'anh-501', anahtar: 'a'.repeat(501) });
    const c = await istek(yazar, 'POST', `/malzeme-katalogu-kartlari/${asan.kimlik}/kaydet`, asan.govde(null));
    assert.deepEqual([c.statusCode, c.json().kod, c.json().alan], [400, 'DOGRULAMA', 'ozet.benzersiz_anahtar'], c.body);
    assert.equal(await vt().tek('SELECT 1 FROM malzeme_katalog_karti WHERE kimlik = $1', ['anh-501']), null);
  });

  test('Şablon: kaydedilir, listelenir, kaldırılınca listeden düşer', async () => {
    await tamam(yazar, 'POST', '/malzeme-katalogu-sablonlari/sab1/kaydet', { sablon: { id: 'sab1', ad: 'Deneme şablon', kayit: { tur: 'hammadde' } } });
    assert.ok((await tamam<KatalogSablonlariCevabi>(okuyucu, 'GET', '/malzeme-katalogu-sablonlari')).sablonlar.some((x) => x['id'] === 'sab1'));
    await tamam(yazar, 'POST', '/malzeme-katalogu-sablonlari/sab1/kaldir');
    assert.ok(!(await tamam<KatalogSablonlariCevabi>(okuyucu, 'GET', '/malzeme-katalogu-sablonlari')).sablonlar.some((x) => x['id'] === 'sab1'));
    await ret(400, 'DOGRULAMA', yazar, 'POST', '/malzeme-katalogu-sablonlari/sab2/kaydet', { sablon: { id: 'baska', ad: 'x' } });
  });
});
