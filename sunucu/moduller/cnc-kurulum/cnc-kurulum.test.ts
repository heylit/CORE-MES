import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { DURUM_ANAHTARI, cncKurulumDurumu, isEmriHazirlikDurumlari, isEmriHazirlikDurumu, takimOmruDurumlari, takimSayimiYansit } from './disari.ts';

const PAROLA = 'dogru-parola-1';
const SECIM = 'cnc-kurulum-motoru.secim';

interface Kayit { anahtar: string; bicim: 'json' | 'metin'; deger: unknown; surum: number }

describe('cnc-kurulum kayıt deposu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let yazar = '';
  let yazarId = 0;
  let ikinci = '';
  let okur = '';
  let sayfali = '';
  let yetkisiz = '';
  let onaylayan = '';
  let onaylayanId = 0;
  let sayac = 0;
  // Her test kendi anahtarında çalışır; ötekinin bıraktığına yaslanmaz.
  const yeniAnahtar = (): string => `cnc-kurulum-motoru.deneme${String(++sayac)}`;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };

  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  const istek = (cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerez }, payload: payload as object | undefined });

  // Kişi yönetici rolüyle doğar; istenen işlemleri taşıyan geçici rol uygulamanın atama işleviyle verilir.
  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<{ cerez: string; id: number }> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    const id = await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
      return yeni;
    });
    return { cerez: await girisCerezi(kullaniciAdi), id };
  }

  const yaz = (cerez: string, govde: Record<string, unknown>) => istek(cerez, 'POST', '/cnc-kurulum/kayitlar/yaz', govde);
  const hazirlikYaz = (cerez: string, govde: Record<string, unknown>) => istek(cerez, 'POST', '/cnc-kurulum/hazirlik/onayla', govde);
  const yazarOnayla = (cerez: string, govde: Record<string, unknown>) => istek(cerez, 'POST', '/cnc-kurulum/hazirlik/yazar-onayla', govde);
  const kayitlar = async (cerez: string): Promise<Kayit[]> => {
    const cevap = await istek(cerez, 'GET', '/cnc-kurulum/kayitlar');
    assert.equal(cevap.statusCode, 200, cevap.body);
    return (cevap.json() as { kayitlar: Kayit[] }).kayitlar;
  };
  const kayit = async (cerez: string, anahtar: string): Promise<Kayit | undefined> => (await kayitlar(cerez)).find((k) => k.anahtar === anahtar);

  before(async () => {
    ortam = await testVeritabaniKur('cnc_kurulum');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    ({ cerez: yazar, id: yazarId } = await islemliKisi('yazar', ['cnc-kurulum.yaz']));
    ({ cerez: ikinci } = await islemliKisi('ikinci', ['cnc-kurulum.yaz']));
    ({ cerez: okur } = await islemliKisi('okur', ['cnc-kurulum.oku']));
    ({ cerez: sayfali } = await islemliKisi('sayfali', ['sayfa.cnc-kurulum']));
    ({ cerez: yetkisiz } = await islemliKisi('yetkisiz', ['sayfa.ayarlar']));
    ({ cerez: onaylayan, id: onaylayanId } = await islemliKisi('onaylayan', ['sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.hazirlik-onayla']));
  });

  after(async () => { await ortam?.kaldir(); });

  test('CK-01: prototipin durumu yazılır ve aynen okunur; her yazma sürümü ilerletir', async () => {
    const a = yeniAnahtar();
    const durum = { machine: 'f5a', inv: { t1: { qty: 3 } }, gsimText: { name: 'P1.h', text: 'BEGIN PGM P1 MM\nL X0 Y0 R0 FMAX\n' }, custom: [], gsim: null };
    const ilk = await yaz(yazar, { anahtar: a, bicim: 'json', deger: durum, beklenenSurum: null });
    assert.equal(ilk.statusCode, 200, ilk.body);
    const k1 = (ilk.json() as { kayit: Kayit }).kayit;
    assert.deepEqual({ ...k1, surum: 0 }, { anahtar: a, bicim: 'json', deger: durum, surum: 0 });
    const ikinciYazma = await yaz(yazar, { anahtar: a, bicim: 'json', deger: { ...durum, machine: 'puma' }, beklenenSurum: k1.surum });
    const k2 = (ikinciYazma.json() as { kayit: Kayit }).kayit;
    assert.equal(k2.surum > k1.surum, true);
    assert.deepEqual(await kayit(okur, a), k2);
  });

  test('CK-02: sürüm tutmazsa yazma 409 ve kayıt değişmez; ikinci kişi birincinin üstüne yazamaz', async () => {
    const a = yeniAnahtar();
    const k = ((await yaz(yazar, { anahtar: a, bicim: 'json', deger: { v: 1 }, beklenenSurum: null })).json() as { kayit: Kayit }).kayit;
    assert.equal((await yaz(ikinci, { anahtar: a, bicim: 'json', deger: { v: 2 }, beklenenSurum: null })).statusCode, 409);
    assert.equal((await yaz(ikinci, { anahtar: a, bicim: 'json', deger: { v: 3 }, beklenenSurum: k.surum - 1 })).statusCode, 409);
    assert.deepEqual((await kayit(okur, a))?.deger, { v: 1 });
    assert.equal((await yaz(ikinci, { anahtar: a, bicim: 'json', deger: { v: 4 }, beklenenSurum: k.surum })).statusCode, 200);
    assert.deepEqual((await kayit(okur, a))?.deger, { v: 4 });
  });

  test('CK-03: aynı anda gelen iki ilk yazmadan yalnız biri geçer', async () => {
    const a = yeniAnahtar();
    const sonuc = await Promise.all([
      yaz(yazar, { anahtar: a, bicim: 'json', deger: { k: 'yazar' }, beklenenSurum: null }),
      yaz(ikinci, { anahtar: a, bicim: 'json', deger: { k: 'ikinci' }, beklenenSurum: null }),
    ]);
    assert.deepEqual(sonuc.map((c) => c.statusCode).sort(), [200, 409]);
    const kazanan = sonuc.find((c) => c.statusCode === 200)?.json() as { kayit: Kayit };
    assert.deepEqual((await kayit(okur, a))?.deger, kazanan.kayit.deger);
  });

  test('CK-04: metin biçimi dize olarak saklanır; dize olmayan metin ve U+0000 400 alır', async () => {
    const a = yeniAnahtar();
    const c = await yaz(yazar, { anahtar: a, bicim: 'metin', deger: 'düz metin {', beklenenSurum: null });
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(await kayit(okur, a), { anahtar: a, bicim: 'metin', deger: 'düz metin {', surum: (c.json() as { kayit: Kayit }).kayit.surum });
    assert.equal((await yaz(yazar, { anahtar: yeniAnahtar(), bicim: 'metin', deger: { a: 1 }, beklenenSurum: null })).statusCode, 400);
    assert.equal((await yaz(yazar, { anahtar: yeniAnahtar(), bicim: 'json', deger: { t: 'a\u0000b' }, beklenenSurum: null })).statusCode, 400);
  });

  // Sızma testi B3: köprü yazma ucunda değerin boyutu sunucuda sınırlıdır; sınır köprünün gönderdiği üst sınırla (1 MB) aynıdır.
  test('CK-04b: 1 MB değer yazılır; 1 MB üstü değer 413 ve anlaşılır iletiyle reddedilir, kayıt açılmaz', async () => {
    const sinirda = yeniAnahtar();
    // JSON metni {"t":"..."} 8 bayt zarf taşır.
    const izinli = await yaz(yazar, { anahtar: sinirda, bicim: 'json', deger: { t: 'x'.repeat(1_000_000 - 8) }, beklenenSurum: null });
    assert.equal(izinli.statusCode, 200, izinli.body.slice(0, 200));
    const buyuk = yeniAnahtar();
    const red = await yaz(yazar, { anahtar: buyuk, bicim: 'json', deger: { t: 'x'.repeat(1_000_000 - 7) }, beklenenSurum: null });
    assert.equal(red.statusCode, 413, red.body.slice(0, 200));
    assert.match((red.json() as { mesaj: string }).mesaj, /1 MB/);
    assert.equal(await kayit(okur, buyuk), undefined);
    // Çok baytlı karakter bayt olarak sayılır (karakter değil).
    assert.equal((await yaz(yazar, { anahtar: yeniAnahtar(), bicim: 'metin', deger: 'ş'.repeat(500_001), beklenenSurum: null })).statusCode, 413);
  });

  test('CK-05: öneksiz ya da yol karakterli anahtar 400 alır; tabloda kısıt da durdurur', async () => {
    assert.equal((await yaz(yazar, { anahtar: 'mesai:x', bicim: 'json', deger: {}, beklenenSurum: null })).statusCode, 400);
    assert.equal((await yaz(yazar, { anahtar: 'cnc-kurulum-motoru.a/b', bicim: 'json', deger: {}, beklenenSurum: null })).statusCode, 400);
    await assert.rejects(vt().sorgu(
      "INSERT INTO cnc_kurulum_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ('baska', 'json', '{}', 1, 1)",
    ));
  });

  test('CK-06: silme sürüm ister; yanlış sürüm 409, doğru sürüm siler, olmayan kayıt silindi: false', async () => {
    const a = yeniAnahtar();
    const k = ((await yaz(yazar, { anahtar: a, bicim: 'json', deger: { v: 1 }, beklenenSurum: null })).json() as { kayit: Kayit }).kayit;
    assert.equal((await istek(yazar, 'POST', '/cnc-kurulum/kayitlar/sil', { anahtar: a, beklenenSurum: k.surum - 1 })).statusCode, 409);
    const sil = await istek(yazar, 'POST', '/cnc-kurulum/kayitlar/sil', { anahtar: a, beklenenSurum: k.surum });
    assert.deepEqual(sil.json(), { silindi: true });
    assert.equal(await kayit(okur, a), undefined);
    assert.deepEqual((await istek(yazar, 'POST', '/cnc-kurulum/kayitlar/sil', { anahtar: a, beklenenSurum: k.surum })).json(), { silindi: false });
  });

  test('CK-07: okuma oku, yaz ya da sayfa işlemiyle; yazma ve silme yalnız yaz ile; yetkisiz okuyamaz', async () => {
    const a = yeniAnahtar();
    assert.equal((await istek(sayfali, 'GET', '/cnc-kurulum/kayitlar')).statusCode, 200);
    assert.equal((await istek(yazar, 'GET', '/cnc-kurulum/kayitlar')).statusCode, 200);
    assert.equal((await istek(yetkisiz, 'GET', '/cnc-kurulum/kayitlar')).statusCode, 403);
    assert.equal((await istek(yetkisiz, 'GET', '/cnc-kurulum/ben')).statusCode, 403);
    assert.equal((await yaz(okur, { anahtar: a, bicim: 'json', deger: {}, beklenenSurum: null })).statusCode, 403);
    assert.equal((await yaz(sayfali, { anahtar: a, bicim: 'json', deger: {}, beklenenSurum: null })).statusCode, 403);
    assert.equal((await istek(okur, 'POST', '/cnc-kurulum/kayitlar/sil', { anahtar: a, beklenenSurum: 1 })).statusCode, 403);
  });

  test('CK-08: ben kişiyi ve yazma bayrağını döner', async () => {
    assert.deepEqual((await istek(yazar, 'GET', '/cnc-kurulum/ben')).json(), { kisi: { id: yazarId, ad: 'Deneme yazar' }, yazabilir: true, hazirlikOnaylayabilir: false, takimDegistirebilir: false, stokDusebilir: false, stokKartiBaglayabilir: false, emirGorebilir: false });
    assert.equal(((await istek(okur, 'GET', '/cnc-kurulum/ben')).json() as { yazabilir: boolean }).yazabilir, false);
  });

  test('CK-09: yazma deftere gövdesiz girer: anahtar, biçim ve beklenen sürüm yazılır, durum gövdesi yazılmaz', async () => {
    const a = yeniAnahtar();
    const gizli = 'GOVDE-DEFTERE-GIRMEMELI';
    assert.equal((await yaz(yazar, { anahtar: a, bicim: 'json', deger: { not: gizli }, beklenenSurum: null })).statusCode, 200);
    const satirlar = await vt().sorgu<{ metin: string }>(
      "SELECT row_to_json(d)::text AS metin FROM denetim_kaydi d WHERE yol LIKE '%/cnc-kurulum/kayitlar/yaz' ORDER BY id DESC LIMIT 1",
    );
    assert.equal(satirlar.length, 1);
    assert.equal(satirlar[0]?.metin.includes(gizli), false);
    assert.equal(satirlar[0]?.metin.includes(a), true);
  });

  test('CK-10: disari.ts prototipin durum kaydını salt okunur verir', async () => {
    const yok = await vt().tx((db) => cncKurulumDurumu(db));
    assert.equal(yok, null);
    await yaz(yazar, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: { machine: 'f5a' }, beklenenSurum: null });
    assert.deepEqual((await vt().tx((db) => cncKurulumDurumu(db)))?.deger, { machine: 'f5a' });
  });

  test('CK-11: açık iş emirleri (266 a) kuruluma seçenek olarak gelir; istasyonsuz ya da kapalı emrin iş emri gelmez; emir listesi yetkisi olmayan CNC okuyucusu alamaz', async () => {
    const im = await ortam!.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('TEMCNC', 'Deneme Merkezi') RETURNING id");
    const ist = await ortam!.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('TEICNC', 'Deneme torna', $1, true) RETURNING id", [im!.id]);
    const emir = async (durum: 'planli' | 'iptal') => (await ortam!.sahip.tek<{ id: number }>(
      `INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum, iptal) VALUES ('P-CNC', 'Deneme mil', 12, $1, $2, $3, ${durum === 'iptal' ? 'now()' : 'NULL'}) RETURNING id`,
      [ist!.id, yoneticiId, durum]))!.id;
    const acik = await emir('planli'), kapali = await emir('iptal');
    const op10 = await isEmriEkle(acik, 10, ist!.id), op20 = await isEmriEkle(acik, 20, null), kapaliOp = await isEmriEkle(kapali, 10, ist!.id);
    const { cerez: planlayan } = await islemliKisi('planlayan', ['cnc-kurulum.oku', 'sayfa.uretim-emirleri']);
    const cevap = await istek(planlayan, 'GET', '/cnc-kurulum/emirler');
    assert.equal(cevap.statusCode, 200, cevap.body);
    const emirler = (cevap.json() as { emirler: { id: number }[] }).emirler;
    assert.deepEqual(emirler.find((e) => e.id === op10), {
      id: op10, uretimEmriId: acik, emirNo: `UE-${String(acik).padStart(6, '0')}`, opNo: 10, ad: 'OP10', parcaNo: 'P-CNC', parcaAd: 'Deneme mil', adet: 12, istasyon: 'Deneme torna',
    });
    assert.equal(emirler.some((e) => e.id === op20 || e.id === kapaliOp), false);
    assert.equal((await istek(okur, 'GET', '/cnc-kurulum/emirler')).statusCode, 403);
    assert.equal((await istek(yetkisiz, 'GET', '/cnc-kurulum/emirler')).statusCode, 403);
  });

  test('CK-11b (182 a): ben emir listesinin açık olup olmadığını uçla aynı denetimle söyler', async () => {
    const emirGorebilir = async (cerez: string) => ((await istek(cerez, 'GET', '/cnc-kurulum/ben')).json() as { emirGorebilir: boolean }).emirGorebilir;
    const { cerez: operator } = await islemliKisi('emirsizoperator', ['sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.hazirlik-onayla']);
    assert.equal(await emirGorebilir(operator), false);
    assert.equal((await istek(operator, 'GET', '/cnc-kurulum/emirler')).statusCode, 403);
    for (const [ad, islem] of [['emirliuretim', 'sayfa.uretim-emirleri'], ['emirlistok', 'sayfa.stok'], ['emirliatolye', 'sayfa.atolye']] as const) {
      const { cerez } = await islemliKisi(ad, ['sayfa.cnc-kurulum', islem]);
      assert.equal(await emirGorebilir(cerez), true, islem);
      assert.equal((await istek(cerez, 'GET', '/cnc-kurulum/emirler')).statusCode, 200, islem);
    }
  });

  // Kurulum testlerinin açık emirleri tek istasyonda açılır.
  let istasyonId: number | null = null;
  let operasyonTipiId: number | null = null;
  // Kurulum iş emri seçer (266 a): iş emri, istasyonlu üst emrin altına açılır; dönen kimlik iş emrinindir.
  async function isEmriEkle(uretimEmriId: number, opNo: number, ist?: number | null): Promise<number> {
        operasyonTipiId ??= (await ortam!.sahip.tek<{ id: number }>('SELECT id FROM istasyonlar_operasyon_tipi ORDER BY id LIMIT 1'))!.id;
    return (await ortam!.sahip.tek<{ id: number }>(
      'INSERT INTO uretim_emirleri_is_emri (uretim_emri_id, sira, op_no, operasyon_tipi_id, ad, istasyon_id) VALUES ($1, $2, $2, $3, $4, $5) RETURNING id',
      [uretimEmriId, opNo, operasyonTipiId, `OP${String(opNo)}`, ist ?? istasyonId]))!.id;
  }
  async function ustEmirAc(parcaNo: string): Promise<number> {
    if (istasyonId === null) {
      const im = await ortam!.sahip.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('TEMKUR', 'Kurulum Merkezi') RETURNING id");
      istasyonId = (await ortam!.sahip.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('TEIKUR', 'Kurulum tezgahi', $1, true) RETURNING id", [im!.id]))!.id;
    }
    return (await ortam!.sahip.tek<{ id: number }>(
      "INSERT INTO uretim_emri (parca_no, parca_ad, adet, istasyon_id, acan_id, durum) VALUES ($1, 'Deneme parca', 5, $2, $3, 'planli') RETURNING id",
      [parcaNo, istasyonId, yoneticiId]))!.id;
  }
  const acikEmirAc = async (parcaNo = 'P-KUR'): Promise<number> => isEmriEkle(await ustEmirAc(parcaNo), 10);
  const emirSec = async (cerez: string, isEmriId: number) => istek(cerez, 'POST', '/cnc-kurulum/emir-sec', { isEmriId, beklenenSurum: await durumSurumu() });

  // Prototipin durumu ortaktır: hazırlık testleri durum anahtarını sırayla kullanır, her biri son sürümden devam eder.
  const durumSurumu = async (): Promise<number | null> => (await kayit(okur, DURUM_ANAHTARI))?.surum ?? null;
  type Onay = { adim: string; olay: string; imza: string | null; kisi: { id: number; ad: string }; zaman: string };
  // Son onay bütün adım onaylarının sırayla birleşik imzasıyla verilir (hazırlık sırası); testler kuralı geçen tam hazırlık kullanır.
  const TAM_ONAY: Record<string, string> = {
    machine: 'm1', prog: 'm1|P', fixture: 'm1|f', jaw: 'm1|j', material: 'm1|mt', zero: 'm1|z', T1: 'm1|P|1|t1', cool: 'm1|c', gauges: 'm1|g', cons: 'm1|s',
  };
  const TAM_IMZA = 'm1#m1|P#m1|f#m1|j#m1|mt#m1|z#m1|P|1|t1#m1|c#m1|g#m1|s#10';
  const onaylar = async (): Promise<Onay[]> => {
    const c = await istek(okur, 'GET', '/cnc-kurulum/hazirlik');
    assert.equal(c.statusCode, 200, c.body);
    return (c.json() as { onaylar: Onay[] }).onaylar;
  };

  test('CK-12: hazırlık onaylayıcısı yalnız onay alanlarını yazar; tezgâh, stok ve öteki hazırlık alanları kayıtlı kalır', async () => {
    const ben = (await istek(onaylayan, 'GET', '/cnc-kurulum/ben')).json() as { yazabilir: boolean; hazirlikOnaylayabilir: boolean };
    assert.deepEqual([ben.yazabilir, ben.hazirlikOnaylayabilir], [false, true]);
    const kayitli = { machine: 'f5a', inv: { t1: { qty: 3 } }, prep: { done: {}, src: 'P1.h', qty: 10, fin: null, at: 0 } };
    const c1 = await yaz(yazar, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: kayitli, beklenenSurum: await durumSurumu() });
    assert.equal(c1.statusCode, 200, c1.body);
    const surum = (c1.json() as { kayit: Kayit }).kayit.surum;
    // Gövde yalnız onay alanlarını taşır; fazladan gelen hazırlık alanları (kaynak, adet) alınmaz.
    const gelen = { done: TAM_ONAY, src: 'P2.h', qty: 500, fin: { ts: 1, sig: TAM_IMZA }, at: 2 };
    const c2 = await hazirlikYaz(onaylayan, { hazirlik: gelen, beklenenSurum: surum });
    assert.equal(c2.statusCode, 200, c2.body);
    assert.deepEqual((await kayit(okur, DURUM_ANAHTARI))?.deger, {
      machine: 'f5a', inv: { t1: { qty: 3 } },
      prep: { done: TAM_ONAY, src: 'P1.h', qty: 10, fin: { ts: 1, sig: TAM_IMZA }, at: 2 },
    });
    const son = (c2.json() as { kayit: Kayit }).kayit.surum;
    // Sürüm denetimi aynen geçerlidir; bütün durum gövdesi, sürümsüz (yeni kayıt) yazma, tam yazma ve silme reddedilir.
    assert.equal((await yaz(onaylayan, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: { prep: gelen }, beklenenSurum: son })).statusCode, 403);
    assert.equal((await hazirlikYaz(onaylayan, { hazirlik: gelen, beklenenSurum: surum })).statusCode, 409);
    assert.equal((await hazirlikYaz(onaylayan, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: { prep: gelen }, beklenenSurum: son })).statusCode, 400);
    assert.equal((await hazirlikYaz(onaylayan, { hazirlik: gelen, beklenenSurum: null })).statusCode, 400);
    assert.equal((await istek(onaylayan, 'POST', '/cnc-kurulum/kayitlar/sil', { anahtar: DURUM_ANAHTARI, beklenenSurum: son })).statusCode, 403);
    // Yazma işlemi olan kişi onayını kendi onay ucundan verir; onay alanları değişmeyen gövde kaydı yeniden yazmaz. Uçlar
    // birbirine açılmaz.
    assert.equal((await hazirlikYaz(yazar, { hazirlik: gelen, beklenenSurum: son })).statusCode, 403);
    assert.equal((await yazarOnayla(onaylayan, { hazirlik: gelen, beklenenSurum: son })).statusCode, 403);
    const ayni = await yazarOnayla(yazar, { hazirlik: { done: TAM_ONAY, fin: { sig: TAM_IMZA, ts: 1 }, at: 2 }, beklenenSurum: son });
    assert.equal(ayni.statusCode, 200, ayni.body);
    assert.equal((ayni.json() as { kayit: Kayit }).kayit.surum, son);
    assert.equal((await hazirlikYaz(yetkisiz, { hazirlik: gelen, beklenenSurum: son })).statusCode, 403);
    // Onay alanı biçime uymazsa ya da sınırı aşarsa kayıt değişmez.
    assert.equal((await hazirlikYaz(onaylayan, { hazirlik: { done: 'x' }, beklenenSurum: son })).statusCode, 400);
    const fazla = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`T${i}`, 'i']));
    assert.equal((await hazirlikYaz(onaylayan, { hazirlik: { done: fazla }, beklenenSurum: son })).statusCode, 400);
    assert.equal((await kayit(okur, DURUM_ANAHTARI))?.surum, son);
  });

  test('CK-13: sunucu her adım onayını kimin ne zaman verdiğini defterde tutar; geri alınan onay düşer, seçili emir olaya yazılır', async () => {
    const emirId = await acikEmirAc();
    const ek = await emirSec(yazar, emirId);
    assert.equal(ek.statusCode, 200, ek.body);
    const temel = { machine: 'f5a', prep: { done: {}, fin: null, at: 0 } };
    // Önceki testin onayları genel uçtan silinemez; onay ucundan geri alınır.
    const temizle = await yazarOnayla(yazar, { hazirlik: { done: {}, fin: null }, beklenenSurum: await durumSurumu() });
    assert.equal(temizle.statusCode, 200, temizle.body);
    const sifir = await yaz(yazar, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: temel, beklenenSurum: await durumSurumu() });
    assert.equal(sifir.statusCode, 200, sifir.body);
    assert.deepEqual(await onaylar(), []);
    const durum = (done: Record<string, string>, fin: unknown = null) => ({ ...temel, prep: { done, fin, at: 1 } });
    const onay = async (done: Record<string, string>, fin: unknown = null) => hazirlikYaz(onaylayan, { hazirlik: durum(done, fin).prep, beklenenSurum: await durumSurumu() });
    const r1 = await onay({ machine: 'm1', T1: 't1' });
    assert.equal(r1.statusCode, 200, r1.body);
    let liste = await onaylar();
    assert.deepEqual(liste.map((o) => [o.adim, o.olay, o.imza, o.kisi.id, o.kisi.ad]).sort(), [['T1', 'onay', 't1', onaylayanId, 'Deneme onaylayan'], ['machine', 'onay', 'm1', onaylayanId, 'Deneme onaylayan']]);
    // Aynı imzayla yeniden yazma yeni olay üretmez; yazarın onay ucundan T1'i başka imzayla onaylaması ve tezgâh onayını
    // kaldırması üretir.
    const ilkZaman = liste.find((o) => o.adim === 'machine')?.zaman;
    await onay({ machine: 'm1', T1: 't1' });
    const yazarOnayi = await yazarOnayla(yazar, { hazirlik: durum({ T1: 't1b' }).prep, beklenenSurum: await durumSurumu() });
    assert.equal(yazarOnayi.statusCode, 200, yazarOnayi.body);
    liste = await onaylar();
    assert.deepEqual(liste.map((o) => [o.adim, o.imza, o.kisi.id]), [['T1', 't1b', yazarId]]);
    const durumu = (id: number) => vt().tx((db) => isEmriHazirlikDurumu(db, id));
    assert.deepEqual(await durumu(emirId), { durum: 'suruyor', zaman: null, secildi: true });
    // Son onay: emir için tamamlanma zamanı okunur; geri alınınca düşer.
    await onay(TAM_ONAY, { ts: 5, sig: TAM_IMZA });
    assert.deepEqual((await onaylar()).filter((o) => ['T1', 'final'].includes(o.adim)).map((o) => [o.adim, o.olay]).sort(), [['T1', 'onay'], ['final', 'tamam']]);
    const tamam = await durumu(emirId);
    assert.deepEqual([tamam.durum, typeof tamam.zaman, tamam.secildi], ['tamam', 'string', true]);
    assert.deepEqual(await durumu(emirId + 1), { durum: 'yok', zaman: null, secildi: false });
    const toplu = await vt().tx((db) => isEmriHazirlikDurumlari(db, [emirId, emirId + 1, emirId]));
    assert.deepEqual([...toplu.keys()].sort(), [emirId, emirId + 1]);
    assert.deepEqual([toplu.get(emirId)?.durum, toplu.get(emirId + 1)], ['tamam', { durum: 'yok', zaman: null, secildi: false }]);
    assert.equal((await vt().tx((db) => isEmriHazirlikDurumlari(db, []))).size, 0);
    await onay({});
    assert.deepEqual(await onaylar(), []);
    assert.deepEqual(await durumu(emirId), { durum: 'suruyor', zaman: null, secildi: true });
    assert.ok(ilkZaman);
    assert.equal((await istek(yetkisiz, 'GET', '/cnc-kurulum/hazirlik')).statusCode, 403);
  });

  test('CK-14: genel yazma ucu hazırlık onaylarını değiştiremez; onay dışı alanlar ve kalınan adım yazılır, onaylı durum silinemez', async () => {
    const temel = { machine: 'f5a', prep: { done: {}, src: 'P1.h', fin: null, at: 0 } };
    const sifir = await yaz(yazar, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: temel, beklenenSurum: await durumSurumu() });
    assert.equal(sifir.statusCode, 200, sifir.body);
    const genel = async (deger: unknown, bicim = 'json') => yaz(yazar, { anahtar: DURUM_ANAHTARI, bicim, deger, beklenenSurum: await durumSurumu() });
    const once = (await kayit(okur, DURUM_ANAHTARI))?.surum;
    // Onay ekleme, son onay ve onayı genel uçtan yazma reddedilir; kayıt ve defter değişmez.
    for (const prep of [{ ...temel.prep, done: { machine: 'sahte' } }, { ...temel.prep, fin: { ts: 1, sig: 'sahte' } }]) {
      const c = await genel({ ...temel, prep });
      assert.equal(c.statusCode, 403, c.body);
    }
    assert.equal((await kayit(okur, DURUM_ANAHTARI))?.surum, once);
    assert.deepEqual(await onaylar(), []);
    // Onay ucundan verilen onay korunur: aynı onaylarla (anahtar sırası farklı) onay dışı alan ve kalınan adım yazılır.
    const onay = await hazirlikYaz(onaylayan, { hazirlik: { done: { machine: 'm1', T1: 't1' } }, beklenenSurum: await durumSurumu() });
    assert.equal(onay.statusCode, 200, onay.body);
    const ok = await genel({ machine: 'nlx', prep: { src: 'P2.h', at: 3, fin: null, done: { T1: 't1', machine: 'm1' } } });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.deepEqual((await kayit(okur, DURUM_ANAHTARI))?.deger, { machine: 'nlx', prep: { src: 'P2.h', at: 3, fin: null, done: { T1: 't1', machine: 'm1' } } });
    // Onay değiştirme, kaldırma, metinle ezme ve silme reddedilir.
    for (const deger of [{ machine: 'nlx', prep: { done: { T1: 'baska', machine: 'm1' } } }, { machine: 'nlx', prep: { done: {} } }, { machine: 'nlx' }]) {
      assert.equal((await genel(deger)).statusCode, 403);
    }
    assert.equal((await genel('ezildi', 'metin')).statusCode, 403);
    assert.equal((await istek(yazar, 'POST', '/cnc-kurulum/kayitlar/sil', { anahtar: DURUM_ANAHTARI, beklenenSurum: await durumSurumu() })).statusCode, 403);
    assert.deepEqual((await onaylar()).map((o) => [o.adim, o.imza, o.kisi.id]).sort(), [['T1', 't1', onaylayanId], ['machine', 'm1', onaylayanId]]);
    // Onaylar onay ucundan geri alınınca durum silinebilir.
    const geri = await yazarOnayla(yazar, { hazirlik: { done: {} }, beklenenSurum: await durumSurumu() });
    assert.equal(geri.statusCode, 200, geri.body);
    const sil = await istek(yazar, 'POST', '/cnc-kurulum/kayitlar/sil', { anahtar: DURUM_ANAHTARI, beklenenSurum: await durumSurumu() });
    assert.equal(sil.statusCode, 200, sil.body);
  });

  test('CK-15: kurulum üretim emri başınadır: emir değişince seçimler, işaretler ve onaylar emre saklanır, geri dönünce gelir; ortak alanlar kalır', async () => {
    const a = await emirSec(yazar, await acikEmirAc('P-A'));
    assert.equal(a.statusCode, 200, a.body);
    const emirA = (a.json() as { emir: { id: number; parcaNo: string } }).emir;
    assert.equal(emirA.parcaNo, 'P-A');
    // A'nın kurulumu: seçimler, işaret, onay.
    const temizle = await yazarOnayla(yazar, { hazirlik: { done: {}, fin: null }, beklenenSurum: await durumSurumu() });
    assert.equal(temizle.statusCode, 200, temizle.body);
    const durumA = { machine: 'nlx', tools: { nlx: ['t1'] }, meta: { part: 'P-A', prog: 'O1' }, prep: { done: {}, fin: null, at: 0 }, stock: { h1: 4 } };
    assert.equal((await yaz(yazar, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: durumA, beklenenSurum: await durumSurumu() })).statusCode, 200);
    const secim = { adimlar: { machine: true } };
    assert.equal((await yaz(yazar, { anahtar: SECIM, bicim: 'json', deger: secim, beklenenSurum: (await kayit(okur, SECIM))?.surum ?? null })).statusCode, 200);
    assert.equal((await yazarOnayla(yazar, { hazirlik: { done: { machine: 'mA' } }, beklenenSurum: await durumSurumu() })).statusCode, 200);
    assert.deepEqual((await onaylar()).map((o) => o.adim), ['machine']);
    // B: seçim baştan başlar, Parça No emirden; ortak stok kalır; A'nın onayı B'de görünmez.
    const emirB = await acikEmirAc('P-B');
    const b = await emirSec(yazar, emirB);
    assert.equal(b.statusCode, 200, b.body);
    assert.deepEqual((await kayit(okur, DURUM_ANAHTARI))?.deger, { stock: { h1: 4 }, meta: { part: 'P-B' } });
    assert.equal(await kayit(okur, SECIM), undefined);
    assert.deepEqual(await onaylar(), []);
    // Saklanan kurulumlar çerçeveye gitmez; genel uçtan emir ve anlık yazılamaz, silinemez.
    assert.equal((await kayitlar(okur)).some((k) => k.anahtar.startsWith('cnc-kurulum-motoru.emir.')), false);
    const emirKaydi = await kayit(okur, 'cnc-kurulum-motoru.emir');
    for (const anahtar of ['cnc-kurulum-motoru.emir', `cnc-kurulum-motoru.emir.${String(emirA.id)}`]) {
      assert.equal((await yaz(yazar, { anahtar, bicim: 'json', deger: { id: 1 }, beklenenSurum: null })).statusCode, 403);
      assert.equal((await istek(yazar, 'POST', '/cnc-kurulum/kayitlar/sil', { anahtar, beklenenSurum: emirKaydi?.surum ?? 1 })).statusCode, 403);
    }
    // B'de ortak alan değişir; A'ya dönüş A'nın seçimlerini, işaretini ve onayını getirir, ortak alan B'deki haliyle kalır.
    assert.equal((await yaz(yazar, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: { stock: { h1: 3 }, machine: 'f5a', meta: { part: 'P-B' } }, beklenenSurum: await durumSurumu() })).statusCode, 200);
    assert.equal((await emirSec(yazar, emirA.id)).statusCode, 200);
    assert.deepEqual((await kayit(okur, DURUM_ANAHTARI))?.deger, { ...durumA, prep: { done: { machine: 'mA' }, fin: null, at: 0 }, stock: { h1: 3 } });
    assert.deepEqual((await kayit(okur, SECIM))?.deger, secim);
    assert.deepEqual((await onaylar()).map((o) => [o.adim, o.imza]), [['machine', 'mA']]);
    // B'ye dönüş B'nin kurulumunu getirir; aynı emri yeniden seçmek durumu değiştirmez.
    assert.equal((await emirSec(yazar, emirB)).statusCode, 200);
    assert.deepEqual((await kayit(okur, DURUM_ANAHTARI))?.deger, { stock: { h1: 3 }, machine: 'f5a', meta: { part: 'P-B' } });
    const surum = await durumSurumu();
    assert.equal((await emirSec(yazar, emirB)).statusCode, 200);
    assert.equal(await durumSurumu(), surum);
    // Eski sürüm 409, açık olmayan emir 400, yazma işlemi olmayan 403.
    assert.equal((await istek(yazar, 'POST', '/cnc-kurulum/emir-sec', { isEmriId: emirA.id, beklenenSurum: (surum ?? 0) - 1 })).statusCode, 409);
    assert.equal((await istek(yazar, 'POST', '/cnc-kurulum/emir-sec', { isEmriId: 999999, beklenenSurum: surum })).statusCode, 400);
    assert.equal((await istek(onaylayan, 'POST', '/cnc-kurulum/emir-sec', { isEmriId: emirA.id, beklenenSurum: surum })).statusCode, 403);
    assert.equal(await durumSurumu(), surum);
  });

  test('CK-15b: kurulumda seçilen emir seçilmiş sayılır (şu an seçili ya da kurulumu saklanmış); hiç seçilmeyen sayılmaz (karar 120 a)', async () => {
    const x = await acikEmirAc('P-X');
    const y = await acikEmirAc('P-Y');
    const z = await acikEmirAc('P-Z');
    assert.equal((await emirSec(yazar, x)).statusCode, 200);
    assert.equal((await emirSec(yazar, y)).statusCode, 200);
    const durumlar = await vt().tx((db) => isEmriHazirlikDurumlari(db, [x, y, z]));
    assert.deepEqual([x, y, z].map((id) => durumlar.get(id)), [
      { durum: 'yok', zaman: null, secildi: true }, { durum: 'yok', zaman: null, secildi: true }, { durum: 'yok', zaman: null, secildi: false },
    ]);
  });

  test('CK-16: "kurulum tamam" seçili emirde kişi ve saatle deftere girer; seçim değişince eskir, emre dönünce kalır; hazırlık durumunu değiştirmez', async () => {
    const emirId = await acikEmirAc('P-T');
    assert.equal((await emirSec(yazar, emirId)).statusCode, 200);
    const kurulumu = async () => ((await istek(okur, 'GET', '/cnc-kurulum/hazirlik')).json() as { kurulum: { kisi: { id: number }; zaman: string; gecerli: boolean } | null }).kurulum;
    assert.equal(await kurulumu(), null);
    const c = await istek(yazar, 'POST', '/cnc-kurulum/kurulum-tamam', { beklenenSurum: await durumSurumu() });
    assert.equal(c.statusCode, 200, c.body);
    const k = (c.json() as { kurulum: { kisi: { id: number; ad: string }; zaman: string; gecerli: boolean } }).kurulum;
    assert.deepEqual([k.kisi.id, k.kisi.ad, k.gecerli, typeof k.zaman], [yazarId, 'Deneme yazar', true, 'string']);
    assert.deepEqual(await kurulumu(), k);
    // Onay listesinde görünmez; Terminal'in hazırlık durumu 'yok' kalır, emir seçilmiş sayılır (durdurucu, karar 120 a).
    assert.deepEqual(await onaylar(), []);
    assert.deepEqual(await vt().tx((db) => isEmriHazirlikDurumu(db, emirId)), { durum: 'yok', zaman: null, secildi: true });
    // Hazırlık alanı (kalınan adım) eskitmez; seçim değişikliği eskitir.
    const durum = (await kayit(okur, DURUM_ANAHTARI))?.deger as Record<string, unknown>;
    assert.equal((await yaz(yazar, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: { ...durum, prep: { at: 4 } }, beklenenSurum: await durumSurumu() })).statusCode, 200);
    assert.equal((await kurulumu())?.gecerli, true);
    assert.equal((await yaz(yazar, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: { ...durum, prep: { at: 4 }, machine: 'nlx' }, beklenenSurum: await durumSurumu() })).statusCode, 200);
    assert.equal((await kurulumu())?.gecerli, false);
    // Başka emirde kayıt yok; geri dönünce eski kayıt (eskimiş) görünür.
    assert.equal((await emirSec(yazar, await acikEmirAc('P-U'))).statusCode, 200);
    assert.equal(await kurulumu(), null);
    assert.equal((await emirSec(yazar, emirId)).statusCode, 200);
    assert.deepEqual([(await kurulumu())?.kisi.id, (await kurulumu())?.gecerli], [yazarId, false]);
    // Eski sürüm 409, okuyucu ve onaylayıcı 403.
    assert.equal((await istek(yazar, 'POST', '/cnc-kurulum/kurulum-tamam', { beklenenSurum: ((await durumSurumu()) ?? 0) - 1 })).statusCode, 409);
    for (const cerez of [okur, onaylayan]) assert.equal((await istek(cerez, 'POST', '/cnc-kurulum/kurulum-tamam', { beklenenSurum: await durumSurumu() })).statusCode, 403);
  });
  test('CK-17 (266 a): hazırlık iş emri başınadır: OP10 tamamlanınca aynı emrin OP20\'si hazır görünmez; eski emir düzeyindeki onay ve eski biçimli seçim sayılmaz', async () => {
    const ust = await ustEmirAc('P-OP');
    const op10 = await isEmriEkle(ust, 10), op20 = await isEmriEkle(ust, 20);
    assert.equal((await emirSec(yazar, op10)).statusCode, 200);
    const temizle = await yazarOnayla(yazar, { hazirlik: { done: {}, fin: null }, beklenenSurum: await durumSurumu() });
    assert.equal(temizle.statusCode, 200, temizle.body);
    const tamam = await yazarOnayla(yazar, { hazirlik: { done: TAM_ONAY, fin: { ts: 1, sig: TAM_IMZA } }, beklenenSurum: await durumSurumu() });
    assert.equal(tamam.statusCode, 200, tamam.body);
    const durumlar = await vt().tx((db) => isEmriHazirlikDurumlari(db, [op10, op20]));
    assert.deepEqual([durumlar.get(op10)?.durum, durumlar.get(op10)?.secildi, durumlar.get(op20)], ['tamam', true, { durum: 'yok', zaman: null, secildi: false }]);
    // OP20'ye geçince onaylar OP10'a saklanır; OP20'nin listesi boş başlar.
    assert.equal((await emirSec(yazar, op20)).statusCode, 200);
    assert.deepEqual(await onaylar(), []);

    // 266 a öncesi: olay yalnız üst emirle yazılmıştı; hiçbir iş emrini hazır saymaz, seçimsiz onay listesine de girmez.
    const eskiUst = await ustEmirAc('P-ESKI');
    const eskiOp = await isEmriEkle(eskiUst, 10);
    await ortam!.sahip.sorgu("INSERT INTO cnc_kurulum_hazirlik_olayi (adim, olay, imza, emir_id, kisi_id) VALUES ('final', 'tamam', 's', $1, $2)", [eskiUst, yoneticiId]);
    assert.deepEqual(await vt().tx((db) => isEmriHazirlikDurumu(db, eskiOp)), { durum: 'yok', zaman: null, secildi: false });
    // Eski biçimli seçili kayıt (üretim emri kimliği, uretimEmriId alanı yok) seçim sayılmaz: "kurulum tamam" iş emri ister.
    await ortam!.sahip.sorgu("UPDATE cnc_kurulum_kayit SET deger = jsonb_build_object('id', $1::int, 'emirNo', 'UE-ESKI') WHERE anahtar = 'cnc-kurulum-motoru.emir'", [eskiOp]);
    assert.equal((await vt().tx((db) => isEmriHazirlikDurumu(db, eskiOp))).secildi, false);
    assert.equal((await istek(yazar, 'POST', '/cnc-kurulum/kurulum-tamam', { beklenenSurum: await durumSurumu() })).statusCode, 400);
  });
  test('CK-22: son onay bütün adımlar aynı imzayla onaylanmadan verilmez (hazırlık sırası); kayıt ve defter değişmez, geri alma geçer', async () => {
    const emirId = await acikEmirAc('P-SIRA');
    assert.equal((await emirSec(yazar, emirId)).statusCode, 200);
    const temizle = await yazarOnayla(yazar, { hazirlik: { done: {}, fin: null }, beklenenSurum: await durumSurumu() });
    assert.equal(temizle.statusCode, 200, temizle.body);
    const { cons: _sarf, ...eksik } = TAM_ONAY;
    const reddedilenler = [
      { done: eksik, fin: { ts: 1, sig: TAM_IMZA } },
      { done: { ...TAM_ONAY, T1: 'm1|P|1|t2' }, fin: { ts: 1, sig: TAM_IMZA } },
      { done: TAM_ONAY, fin: { ts: 1, sig: 'hepsi' } },
    ];
    for (const [i, hazirlik] of reddedilenler.entries()) {
      const surum = await durumSurumu();
      for (const [cerez, gonder] of [[onaylayan, hazirlikYaz], [yazar, yazarOnayla]] as const) {
        const c = await gonder(cerez, { hazirlik, beklenenSurum: surum });
        assert.deepEqual([c.statusCode, (c.json() as { kod?: string }).kod], [422, 'GECERSIZ'], `${String(i)}: ${c.body}`);
      }
      assert.equal(await durumSurumu(), surum);
    }
    assert.deepEqual(await onaylar(), []);
    assert.equal((await vt().tx((db) => isEmriHazirlikDurumu(db, emirId))).durum, 'yok');
    // Adımlar aynı imzayla onaylıysa son onay verilir; sonra bir adımın geri alınması ve son onayın kaldırılması reddedilmez.
    const tamam = await hazirlikYaz(onaylayan, { hazirlik: { done: TAM_ONAY, fin: { ts: 1, sig: TAM_IMZA } }, beklenenSurum: await durumSurumu() });
    assert.equal(tamam.statusCode, 200, tamam.body);
    assert.equal((await vt().tx((db) => isEmriHazirlikDurumu(db, emirId))).durum, 'tamam');
    assert.equal((await hazirlikYaz(onaylayan, { hazirlik: { done: eksik }, beklenenSurum: await durumSurumu() })).statusCode, 200);
    assert.equal((await hazirlikYaz(onaylayan, { hazirlik: { done: {}, fin: null }, beklenenSurum: await durumSurumu() })).statusCode, 200);
    assert.equal((await vt().tx((db) => isEmriHazirlikDurumu(db, emirId))).durum, 'suruyor');
  });

  test('CK-23 (153 a, 163 b, 164 b): bağlı kalemin adedi stoktan okunur; azalan adet stoktan düşer, yetmezse düşmez; bağı kart yazan kurar', async () => {
    const yonetici = await girisCerezi('yonetici');
    const yaz2 = (cerez: string, yol: string, govde: unknown) =>
      app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, payload: govde as object });
    await ortam!.sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['CNC-STK-']);
    const kartAc = async (sira: number, tur = 'sarf'): Promise<number> => (await ortam!.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'CNC-STK-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`cnc-stk-${String(sira)}`, tur, sira, JSON.stringify({ id: `cnc-stk-${String(sira)}`, com: { ad: `Freze ${String(sira)}`, birim: 'adet' } }), yoneticiId]))!.no;
    const takim = await kartAc(1), bos = await kartAc(2), ham = await kartAc(3, 'hammadde');
    assert.equal((await yaz2(yonetici, '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: takim, miktar: '5' }] })).statusCode, 200);
    // Durumda kalemin kendi adedi ve örnek işareti var; bağdan önce okunan aynen döner.
    const temel = (await kayit(okur, DURUM_ANAHTARI))?.deger as Record<string, unknown>;
    const durum = { ...temel, inv: { em10: { qty: 40, min: 2, loc: 'Dolap A', demo: 1 }, dr5: { qty: 3, min: 0, loc: '' } } };
    assert.equal((await yaz(yazar, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger: durum, beklenenSurum: (await kayit(okur, DURUM_ANAHTARI))?.surum ?? null })).statusCode, 200);
    const envanter = async () => ((await kayit(okur, DURUM_ANAHTARI))?.deger as { inv: Record<string, Record<string, unknown>> }).inv;
    assert.deepEqual((await envanter())['em10'], { qty: 40, min: 2, loc: 'Dolap A', demo: 1 });

    // Bağ yalnız kart yazan (malzemeler.yaz) kişide; kart arama da öyle. Hammadde bağlanmaz.
    const bagla = (cerez: string, kimlik: string, malzemeId: number | null) => istek(cerez, 'POST', '/cnc-kurulum/takimlar/stok-karti', { kimlik, malzemeId });
    assert.equal((await bagla(yazar, 'em10', takim)).statusCode, 403);
    assert.equal((await istek(yazar, 'GET', '/cnc-kurulum/takimlar/stok-kartlari')).statusCode, 403);
    assert.equal((await bagla(yonetici, 'em10', ham)).statusCode, 422);
    assert.equal((await bagla(yonetici, 'a b', takim)).statusCode, 400);
    const ara = await istek(yonetici, 'GET', '/cnc-kurulum/takimlar/stok-kartlari?metin=Freze');
    assert.deepEqual((ara.json() as { kartlar: { malzemeId: number }[] }).kartlar.map((k) => k.malzemeId).sort(), [takim, bos].sort());
    const b1 = await bagla(yonetici, 'em10', takim);
    assert.equal(b1.statusCode, 200, b1.body);
    assert.equal((b1.json() as { kart: { malzemeId: number } }).kart.malzemeId, takim);
    assert.equal((await bagla(yonetici, 'em11', bos)).statusCode, 200);
    // Okurken bağlı kalemin adedi stoğun kullanılabilir miktarıdır; kritik seviye ve yer kalır, örnek işareti düşer. Stoğu hiç olmayan
    // kartın adedi null'dır; bağsız kalem dokunulmaz.
    const inv = await envanter();
    assert.deepEqual(inv['em10'], { qty: 5, min: 2, loc: 'Dolap A', tmiStok: { malzemeId: takim, kod: inv['em10']?.['tmiStok'] && (inv['em10']['tmiStok'] as { kod: string }).kod, ad: 'Freze 1' } });
    assert.deepEqual(inv['em11'], { min: 0, loc: '', qty: null, tmiStok: { malzemeId: bos, kod: (inv['em11']?.['tmiStok'] as { kod: string }).kod, ad: 'Freze 2' } });
    assert.deepEqual(inv['dr5'], { qty: 3, min: 0, loc: '' });

    // Stoktan düşme ayrı işlem (yalnız yönetici); bağsız kalem ve yetmeyen stok 422, stok değişmez.
    const dus = (cerez: string, kimlik: string, miktar: number) => yaz2(cerez, '/cnc-kurulum/takimlar/stok-dus', { kimlik, miktar });
    assert.equal((await dus(yazar, 'em10', 1)).statusCode, 403);
    assert.equal((await dus(yonetici, 'dr5', 1)).statusCode, 422);
    assert.equal((await dus(yonetici, 'em10', 6)).statusCode, 422);
    assert.equal((await dus(yonetici, 'em10', 0)).statusCode, 400);
    assert.equal((await envanter())['em10']?.['qty'], 5);
    const d = await dus(yonetici, 'em10', 2);
    assert.deepEqual([d.statusCode, d.json()], [200, { hareketSayisi: 1 }]);
    assert.equal((await envanter())['em10']?.['qty'], 3);
    const hareket = await vt().tek<{ neden: string; aciklama: string; kisi: number }>(
      "SELECT cikis_nedeni AS neden, aciklama, kisi_id AS kisi FROM stok_hareketi WHERE malzeme_id = $1 AND tur = 'cikis'", [takim]);
    assert.deepEqual([hareket?.neden, hareket?.aciklama.startsWith('CNC kurulum · em10'), hareket?.kisi], ['diger', true, yoneticiId]);
    // Bağı kaldırınca kalem prototipin kendi adediyle kalır (yazılan son durumdaki).
    assert.deepEqual((await bagla(yonetici, 'em10', null)).json(), { kart: null });
    assert.equal((await envanter())['em10']?.['qty'], 40);
    assert.deepEqual((await istek(yonetici, 'GET', '/cnc-kurulum/ben')).json(), {
      kisi: { id: yoneticiId, ad: 'Deneme Yönetici' }, yazabilir: true, hazirlikOnaylayabilir: false, takimDegistirebilir: true, stokDusebilir: true, stokKartiBaglayabilir: true, emirGorebilir: true,
    });
  });

  test('CK-19 (311 a): elle üretim satırı eklenen durum 403 ve kayıt değişmez; satırı aynı kalan yazma geçer', async () => {
    const yazDurum = async (deger: Record<string, unknown>) => yaz(yazar, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger, beklenenSurum: await durumSurumu() });
    const durum = { ...((await kayit(okur, DURUM_ANAHTARI))?.deger as Record<string, unknown> | undefined ?? {}), wearLog: [] };
    assert.equal((await yazDurum(durum)).statusCode, 200);
    const surum = await durumSurumu();
    assert.equal((await yazDurum({ ...durum, wearLog: [{ ts: 1, mid: 'm1', n: 5, d: { 0: 2.5 } }] })).statusCode, 403);
    assert.equal(await durumSurumu(), surum);
    assert.equal((await yazDurum({ ...durum, not: 'x' })).statusCode, 200);
  });

  test('CK-18 (295 a): kurulum tamamlanınca magazin istasyona yük olur; sağlam ve hurda sayım kullanımı yazar, değişim sıfırlar; defter değişmez', async () => {
    const isEmriId = await acikEmirAc('P-TAKIM');
    assert.equal((await emirSec(yazar, isEmriId)).statusCode, 200);
    const ist = (await ortam!.sahip.tek<{ istasyon_id: number }>('SELECT istasyon_id FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId]))!.istasyon_id;
    const uretimEmriId = (await ortam!.sahip.tek<{ uretim_emri_id: number }>('SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId]))!.uretim_emri_id;
    const kur = async (magazin: string[], perTool: Record<string, unknown>) => {
      const durum = (await kayit(okur, DURUM_ANAHTARI))?.deger as Record<string, unknown>;
      const deger = { ...durum, machine: 'm1', tools: { m1: magazin }, gsim: { machine: 'm1', perTool } };
      assert.equal((await yaz(yazar, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger, beklenenSurum: await durumSurumu() })).statusCode, 200);
      const c = await istek(yazar, 'POST', '/cnc-kurulum/kurulum-tamam', { beklenenSurum: await durumSurumu() });
      assert.equal(c.statusCode, 200, c.body);
    };
    const durumlar = () => vt().tx((db) => takimOmruDurumlari(db, [ist]));
    const say = (fark: string) => vt().tx((db) => takimSayimiYansit(db, { uretimEmriId, isEmriId, istasyonId: ist, kisiId: yazarId, fark }));
    const ozet = async () => (await durumlar()).map((d) => [d.cep, d.takimKimligi, d.kullanilanDk, d.kullanilanAdet, d.durum]);

    await kur(['t-a', 'empty', 't-b', 'probe'], { 1: { id: 't-a', name: 'Freze A', t: 0.5 } });
    assert.deepEqual((await durumlar()).map((d) => [d.cep, d.takimAd]), [[0, 'Freze A'], [2, 't-b']]);
    await say('10');
    await say('-2');
    assert.deepEqual(await ozet(), [[0, 't-a', 4, 8, null], [2, 't-b', 0, 8, null]]);
    // Ekran okurken aşınma kaydı sunucu sayacından gelir (301 a).
    const asinma = ((await kayit(okur, DURUM_ANAHTARI))?.deger as { wear: { m1: Record<string, { id: string; used: number; parts: number }> } }).wear.m1;
    assert.deepEqual([asinma['0']?.used, asinma['0']?.parts, asinma['2']?.id, asinma['2']?.parts], [4, 8, 't-b', 8]);
    // Hedef olunca durum prototipin eşikleriyle çıkar; hedef yokken sıfır uydurulmaz.
    await ortam!.sahip.sorgu('UPDATE cnc_kurulum_takim_yuku SET omur_dk = 10 WHERE istasyon_id = $1 AND cep = 0', [ist]);
    assert.deepEqual((await durumlar()).map((d) => [d.kalanPay, d.durum]), [[0.6, 'ok'], [null, null]]);
    await say('10');
    assert.deepEqual((await durumlar())[0]?.durum, 'crit');
    await ortam!.sahip.sorgu("INSERT INTO cnc_kurulum_takim_olayi (istasyon_id, cep, takim_kimligi, tur, kisi_id) VALUES ($1, 0, 't-a', 'degisim', $2)", [ist, yazarId]);
    assert.deepEqual((await ozet())[0], [0, 't-a', 0, 0, 'ok']);
    // Başka istasyonun sayımı bu istasyona yazmaz; sıfır fark iz bırakmaz.
    await vt().tx((db) => takimSayimiYansit(db, { uretimEmriId, isEmriId, istasyonId: ist + 100000, kisiId: yazarId, fark: '5' }));
    await say('0');
    assert.deepEqual((await ozet())[1], [2, 't-b', 0, 18, null]);
    // Yeni kurulumda cebe başka takım gelirse eski takımın kullanımı ona geçmez; yükü kalmayan cep düşer.
    await kur(['t-c', 'empty', 'empty', 'probe'], {});
    assert.deepEqual(await ozet(), [[0, 't-c', 0, 0, null]]);
    await assert.rejects(ortam!.sahip.sorgu('UPDATE cnc_kurulum_takim_olayi SET adet = 0'));
    await assert.rejects(ortam!.sahip.sorgu('DELETE FROM cnc_kurulum_takim_olayi'));
  });
  test('CK-20 (312 b): kişi ve emir bağları yabancı anahtar; boş şemada doğrulanmış', async () => {
    const satirlar = await ortam!.sahip.sorgu<{ ad: string }>(
      `SELECT c.conrelid::regclass || '.' || a.attname || ' ' || c.confrelid::regclass || ' ' || c.convalidated AS ad
         FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
        WHERE c.contype = 'f' AND c.connamespace = current_schema()::regnamespace AND c.conname = ANY($1::text[]) ORDER BY 1`,
      [['cnc_kurulum_kayit_guncelleyen_kisi_id_fk', 'cnc_kurulum_hazirlik_olayi_kisi_id_fk', 'cnc_kurulum_hazirlik_olayi_emir_id_fk', 'cnc_kurulum_hazirlik_olayi_is_emri_id_fk', 'cnc_kurulum_takim_yuku_guncelleyen_kisi_id_fk', 'cnc_kurulum_takim_olayi_kisi_id_fk']],
    );
    assert.deepEqual(satirlar.map((s) => s.ad), ['cnc_kurulum_kayit.guncelleyen_kisi_id kisi true', 'cnc_kurulum_hazirlik_olayi.kisi_id kisi true', 'cnc_kurulum_hazirlik_olayi.emir_id uretim_emri true', 'cnc_kurulum_hazirlik_olayi.is_emri_id uretim_emirleri_is_emri true', 'cnc_kurulum_takim_yuku.guncelleyen_kisi_id kisi true', 'cnc_kurulum_takim_olayi.kisi_id kisi true'].sort());
  });
  test('CK-21 (300 a): takım değiştiren değişimi ve düzeltmeyi seçili iş emrinin istasyonuna yazar; işlemi olmayan 403', async () => {
    const { cerez: degistiren, id: degistirenId } = await islemliKisi('degistiren', ['sayfa.cnc-kurulum', 'cnc-kurulum.oku', 'cnc-kurulum.takim-degistir']);
    assert.equal(((await istek(degistiren, 'GET', '/cnc-kurulum/ben')).json() as { takimDegistirebilir: boolean }).takimDegistirebilir, true);
    const isEmriId = await acikEmirAc('P-DEGIS');
    assert.equal((await emirSec(yazar, isEmriId)).statusCode, 200);
    const ist = (await ortam!.sahip.tek<{ istasyon_id: number }>('SELECT istasyon_id FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId]))!.istasyon_id;
    const durum = (await kayit(okur, DURUM_ANAHTARI))?.deger as Record<string, unknown>;
    const deger = { ...durum, machine: 'm1', tools: { m1: ['t-a', 'empty'] }, gsim: { machine: 'm1', perTool: { 1: { id: 't-a', name: 'Freze A', t: 0.5 } } } };
    assert.equal((await yaz(yazar, { anahtar: DURUM_ANAHTARI, bicim: 'json', deger, beklenenSurum: await durumSurumu() })).statusCode, 200);
    assert.equal((await istek(yazar, 'POST', '/cnc-kurulum/kurulum-tamam', { beklenenSurum: await durumSurumu() })).statusCode, 200);
    const uretimEmriId = (await ortam!.sahip.tek<{ uretim_emri_id: number }>('SELECT uretim_emri_id FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId]))!.uretim_emri_id;
    await vt().tx((db) => takimSayimiYansit(db, { uretimEmriId, isEmriId, istasyonId: ist, kisiId: yazarId, fark: '6' }));
    const ozet = async () => (await vt().tx((db) => takimOmruDurumlari(db, [ist]))).map((d) => [d.cep, d.kullanilanDk, d.kullanilanAdet]);
    assert.deepEqual(await ozet(), [[0, 3, 6]]);
    const olay = (cerez: string, olaylar: unknown[], kimlik: string = randomUUID()) => app.inject({
      method: 'POST', url: '/api/cnc-kurulum/takimlar/olaylar', headers: { cookie: cerez, [ISTEK_KIMLIGI_BASLIGI]: kimlik }, payload: { olaylar },
    });

    // Yazma işlemi takım değiştirmeye yetmez; okuyucu da yazamaz.
    for (const cerez of [yazar, okur]) assert.equal((await olay(cerez, [{ tur: 'degisim', cep: 0, takimKimligi: 't-a' }])).statusCode, 403);
    // Fark olarak gelir: sekmenin görmediği sayım (araya giren 2 adet) silinmez.
    await vt().tx((db) => takimSayimiYansit(db, { uretimEmriId, isEmriId, istasyonId: ist, kisiId: yazarId, fark: '2' }));
    const duzelt = await olay(degistiren, [{ tur: 'duzeltme', cep: 0, takimKimligi: 't-a', farkDk: -2, farkAdet: 0 }]);
    assert.deepEqual([duzelt.statusCode, duzelt.json()], [200, { yazilan: 1 }]);
    assert.deepEqual(await ozet(), [[0, 2, 8]]);
    // Aynı istek kimliğiyle yinelenen düzeltme ikinci kez yazılmaz.
    const kimlik = randomUUID();
    for (let i = 0; i < 2; i++) assert.equal((await olay(degistiren, [{ tur: 'duzeltme', cep: 0, takimKimligi: 't-a', farkDk: 1, farkAdet: 0 }], kimlik)).statusCode, 200);
    assert.deepEqual(await ozet(), [[0, 3, 8]]);
    const degis = await olay(degistiren, [{ tur: 'degisim', cep: 0, takimKimligi: 't-a' }, { tur: 'degisim', cep: 1, takimKimligi: 't-a' }]);
    assert.deepEqual([degis.statusCode, degis.json()], [200, { yazilan: 1 }]);
    assert.deepEqual(await ozet(), [[0, 0, 0]]);
    const kisiler = await ortam!.sahip.sorgu<{ tur: string; kisi_id: number; is_emri_id: number }>(
      "SELECT tur, kisi_id, is_emri_id FROM cnc_kurulum_takim_olayi WHERE istasyon_id = $1 AND is_emri_id = $2 AND tur <> 'sayim' ORDER BY id", [ist, isEmriId]);
    assert.deepEqual(kisiler.map((k) => [k.tur, k.kisi_id, k.is_emri_id]), [['duzeltme', degistirenId, isEmriId], ['duzeltme', degistirenId, isEmriId], ['degisim', degistirenId, isEmriId]]);
    // Kullanım sıfırın altına inmez; boş liste ve sayı olmayan fark doğrulamada kalır.
    assert.deepEqual((await olay(degistiren, [{ tur: 'duzeltme', cep: 0, takimKimligi: 't-a', farkDk: -5, farkAdet: -1 }])).json(), { yazilan: 0 });
    assert.deepEqual(await ozet(), [[0, 0, 0]]);
    assert.equal((await olay(degistiren, [])).statusCode, 400);
    assert.equal((await olay(degistiren, [{ tur: 'duzeltme', cep: 0, takimKimligi: 't-a', farkDk: '1', farkAdet: 0 }])).statusCode, 400);
    // Seçili iş emri açık değilse (arşivlenen emir) iz bırakılmaz.
    await ortam!.sahip.sorgu('UPDATE uretim_emri SET arsiv = true WHERE id = $1', [uretimEmriId]);
    assert.deepEqual((await olay(degistiren, [{ tur: 'degisim', cep: 0, takimKimligi: 't-a' }])).json(), { yazilan: 0 });
  });
});

