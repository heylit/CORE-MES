import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test as dugumTesti } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { izinYok, testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { AletAyrintiCevabi, KalibrasyonGovdesi, ListeCevabi, TurListesiCevabi } from '#paylasilan/sozlesme/kalibrasyon.ts';
import type { RollerCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { aletGetir, aletKimlikleri, aletNoIleGetir, aletTurleri, gecerliAletVarMi, olcumAletiGecerliMi, vadesiGecenAletSayisi } from './disari.ts';
import { gunEkle } from './kurallar.ts';
import { aletOlustur, kalibrasyonKaydet } from './servis.ts';

const PAROLA = 'dogru-parola-1';
const BASLANGIC_TURLERI = [
  'Mikrometre', 'Kumpas', 'Komparatör', 'Tampon mastar', 'Halka mastar', 'Diş mastarı', 'Radyus mastarı',
  'Yükseklik mihengiri', 'İç çap mikrometresi', 'CMM', 'Tork anahtarı', 'Kaplama kalınlık ölçer',
];

// Beklenen tarihler veritabanının (tesisin) bugününden türer ve sunucu da her istekte kendi bugününü okur. Koşu tesisin gece
// yarısını (UTC 21:00) geçebilir: gün test başında okunur; test düştüğünde gün değişmişse gövde yeni günle bir kez yinelenir.
async function tekGunde(gunOku: () => Promise<string>, govde: (bugun: string) => Promise<void>): Promise<void> {
  for (let deneme = 0; ; deneme += 1) {
    const gun = await gunOku();
    try {
      await govde(gun);
      return;
    } catch (hata) {
      if (deneme > 0 || (await gunOku()) === gun) throw hata;
    }
  }
}

describe('tekGunde', () => {
  const saat = (gunler: string[]) => {
    let i = 0;
    return async (): Promise<string> => gunler[Math.min(i++, gunler.length - 1)] ?? '';
  };

  dugumTesti('gün değişmeden düşen gövde yinelenmez, hata olduğu gibi döner', async () => {
    const gorulen: string[] = [];
    await assert.rejects(tekGunde(saat(['2026-10-18']), async (g) => {
      gorulen.push(g);
      throw new Error('kırmızı');
    }), /kırmızı/);
    assert.deepEqual(gorulen, ['2026-10-18']);
  });

  dugumTesti('gece yarısını geçip düşen gövde yeni günle bir kez yinelenir', async () => {
    const gorulen: string[] = [];
    await tekGunde(saat(['2026-10-18', '2026-10-19']), async (g) => {
      gorulen.push(g);
      if (g === '2026-10-18') throw new Error('eski günle hesaplanan beklenti');
    });
    assert.deepEqual(gorulen, ['2026-10-18', '2026-10-19']);
  });

  dugumTesti('yinelemede de düşen gövdenin hatası döner', async () => {
    let sayi = 0;
    await assert.rejects(tekGunde(saat(['2026-10-18', '2026-10-19']), async () => {
      sayi += 1;
      throw new Error(`düştü ${sayi}`);
    }), /düştü 2/);
    assert.equal(sayi, 2);
  });
});

describe('kalibrasyon (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let bugun = '';
  let yonetici = '';
  let okur = '';
  let sayfaOkur = '';
  let operator = '';
  let sayac = 0;
  let yoneticiId = 0;
  let yoneticiRolu = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const sahip = (): TestVeritabani['sahip'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.sahip;
  };
  const gun = (n: number): string => gunEkle(bugun, n);
  const gunuOku = async (): Promise<string> => (await vt().tek<{ d: string }>('SELECT current_date::text AS d'))?.d ?? '';
  const test = (ad: string, govde: () => Promise<void>): void => {
    dugumTesti(ad, () => tekGunde(gunuOku, async (g) => {
      bugun = g;
      await govde();
    }));
  };

  const kisiAc = (kullaniciAdi: string): Promise<number> =>
    vt().tx((db) => yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA }));

  async function girisYap(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }

  // Kişi açmanın modül dışına açık tek yolu yönetici açmaktır; başka rol, önce atanıp sonra yönetici rolü alınarak verilir.
  async function kisiEkle(kullaniciAdi: string, rolId: number): Promise<string> {
    const id = await kisiAc(kullaniciAdi);
    await vt().tx(async (db) => {
      await rolAta(db, yoneticiId, id, rolId);
      await rolAl(db, yoneticiId, id, yoneticiRolu);
    });
    return girisYap(kullaniciAdi);
  }

  // Her yazma kendi istek kimliğiyle gider (tekrar korumalı uç başlık ister); null başlıksız gönderir.
  const cagir = (cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown, istekKimligi: string | null = randomUUID()) =>
    app.inject({
      method: yontem,
      url: `/api${url}`,
      headers: { cookie: cerez, ...(yontem === 'POST' && istekKimligi !== null ? { [ISTEK_KIMLIGI_BASLIGI]: istekKimligi } : {}) },
      ...(payload === undefined ? {} : { payload: payload as object }),
    });

  const turId = async (ad: string): Promise<number> => {
    const satir = await vt().tek<{ id: number }>('SELECT id FROM olcu_aleti_turu WHERE ad = $1', [ad]);
    if (!satir) throw new Error(`tür yok: ${ad}`);
    return satir.id;
  };

  const benzersiz = (onek: string): string => `${onek}-${++sayac}`;

  // Alet açar ve ayrıntısını verir; her test kendi aletini açar, testler birbirinin verisine bağlı kalmaz.
  async function aletAc(ek: Record<string, unknown> = {}): Promise<AletAyrintiCevabi> {
    const cevap = await cagir(yonetici, 'POST', '/olcu-aletleri', { no: benzersiz('t'), turId: await turId('Kumpas'), ...ek });
    assert.equal(cevap.statusCode, 200, cevap.body);
    return cevap.json<AletAyrintiCevabi>();
  }

  async function kayitAt(aletId: number, govde: KalibrasyonGovdesi): Promise<AletAyrintiCevabi> {
    const cevap = await cagir(yonetici, 'POST', `/olcu-aletleri/${aletId}/kalibrasyon-kaydet`, govde);
    assert.equal(cevap.statusCode, 200, cevap.body);
    return cevap.json<AletAyrintiCevabi>();
  }

  const ayrinti = async (id: number): Promise<AletAyrintiCevabi> =>
    (await cagir(yonetici, 'GET', `/olcu-aletleri/${id}`)).json<AletAyrintiCevabi>();

  const kisit = async (sorgu: string, parametreler: unknown[] = []): Promise<string> => {
    try {
      await vt().sorgu(sorgu, parametreler);
    } catch (hata) {
      return (hata as { constraint?: string; message: string }).constraint ?? (hata as Error).message;
    }
    return 'kabul edildi';
  };

  before(async () => {
    ortam = await testVeritabaniKur('kalibrasyon');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await kisiAc('yonetici');
    yonetici = await girisYap('yonetici');
    const roller = (await cagir(yonetici, 'GET', '/roller')).json<RollerCevabi>().roller;
    const rolId = (uyar: (r: RollerCevabi['roller'][number]) => boolean): number => {
      const rol = roller.find(uyar);
      if (!rol) throw new Error('Beklenen rol listede yok.');
      return rol.id;
    };
    yoneticiRolu = rolId((r) => r.yonetici === true);
    // Yalnız okuma işlemi taşıyan yerleşik rol yok ve rol açan dış fonksiyon yok: geçici rol doğrudan yazılır.
    const okurRolu = await ortam.vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('test_okur', 'Test Okur') RETURNING id");
    await ortam.vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'kalibrasyon.oku')", [okurRolu?.id]);
    okur = await kisiEkle('okur', okurRolu?.id ?? 0);
    const sayfaRolu = await ortam.vt.tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('test_sayfa', 'Test Sayfa') RETURNING id");
    await ortam.vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'sayfa.kalibrasyon')", [sayfaRolu?.id]);
    sayfaOkur = await kisiEkle('sayfa-okur', sayfaRolu?.id ?? 0);
    operator = await kisiEkle('operator', rolId((r) => r.ad === 'Operatör'));
  });

  after(async () => {
    await ortam?.kaldir();
  });

  test('yetki: oturumsuz 401; işlemi olmayan 403; yalnız oku olan okur ama yazamaz; yazma yetkisi olan yazar', async () => {
    const uclar: ['GET' | 'POST', string, unknown?][] = [
      ['GET', '/olcu-aletleri'], ['GET', '/olcu-aletleri/ozet'], ['GET', '/olcu-aletleri/1'], ['GET', '/olcu-aleti-turleri'],
      ['POST', '/olcu-aletleri', {}], ['POST', '/olcu-aletleri/1/guncelle', {}], ['POST', '/olcu-aletleri/1/sil'],
      ['POST', '/olcu-aletleri/1/kalibrasyon-kaydet', {}], ['POST', '/olcu-aletleri/1/kullanim-disi', {}],
      ['POST', '/olcu-aleti-turleri', {}], ['POST', '/olcu-aleti-turleri/1/guncelle', {}],
    ];
    for (const [yontem, url, govde] of uclar) {
      const ad = `${yontem} ${url}`;
      const oturumsuz = await app.inject({ method: yontem, url: `/api${url}`, ...(govde === undefined ? {} : { payload: govde as object }) });
      assert.equal(oturumsuz.statusCode, 401, ad);
      assert.equal((await cagir(operator, yontem, url, govde)).statusCode, 403, `operatör ${ad}`);
      if (yontem === 'POST') assert.equal((await cagir(okur, yontem, url, govde)).statusCode, 403, `okur ${ad}`);
    }
    const alet = await aletAc();
    assert.equal((await cagir(okur, 'GET', '/olcu-aletleri')).statusCode, 200);
    assert.equal((await cagir(okur, 'GET', '/olcu-aletleri/ozet')).statusCode, 200);
    assert.equal((await cagir(okur, 'GET', `/olcu-aletleri/${alet.id}`)).statusCode, 200);
    assert.equal((await cagir(okur, 'GET', '/olcu-aleti-turleri')).statusCode, 200);
  });

  test('yetki: sayfası olan rol kalibrasyon.oku olmadan okur ama yazamaz; ikisi de olmayan okuyamaz', async () => {
    const alet = await aletAc();
    const okumalar = ['/olcu-aletleri', '/olcu-aletleri/ozet', `/olcu-aletleri/${alet.id}`, '/olcu-aleti-turleri'];
    for (const url of okumalar) {
      assert.equal((await cagir(sayfaOkur, 'GET', url)).statusCode, 200, `sayfa ${url}`);
      assert.equal((await cagir(operator, 'GET', url)).statusCode, 403, `operatör ${url}`);
    }
    assert.equal((await cagir(sayfaOkur, 'POST', `/olcu-aletleri/${alet.id}/guncelle`, { no: alet.no, turId: alet.turId, periyotGun: 30, surum: alet.surum })).statusCode, 403);
    assert.equal((await cagir(sayfaOkur, 'POST', '/olcu-aleti-turleri', { ad: benzersiz('Tür') })).statusCode, 403);
    assert.equal((await ayrinti(alet.id)).periyotGun, alet.periyotGun);
  });

  test('KLB-01, KLB-02, KLB-04: alet bilgileri saklanır; numara büyük harfe çevrilir; periyot varsayılanı 365; boş metin null olur', async () => {
    const tur = await turId('Mikrometre');
    const no = benzersiz('mkm');
    const alet = await aletAc({ no: `  ${no} `, turId: tur, ad: 'Dış çap', olcmeAraligi: '0-25 mm / 0,001', yer: 'Kalite dolabı' });
    assert.equal(alet.no, no.toUpperCase());
    assert.equal(alet.tur, 'Mikrometre');
    assert.deepEqual([alet.ad, alet.olcmeAraligi, alet.yer, alet.periyotGun], ['Dış çap', '0-25 mm / 0,001', 'Kalite dolabı', 365]);

    const bos = await aletAc({ ad: '  ', olcmeAraligi: '', yer: null, periyotGun: 90 });
    assert.deepEqual([bos.ad, bos.olcmeAraligi, bos.yer, bos.periyotGun], [null, null, null, 90]);
  });

  test('KLB-02: numara ve tür zorunludur; geçersiz tür ve periyot reddedilir', async () => {
    const tur = await turId('Kumpas');
    for (const govde of [{ turId: tur }, { no: '  ', turId: tur }, { no: benzersiz('x') }, { no: benzersiz('x'), turId: 99999 },
      { no: benzersiz('x'), turId: tur, periyotGun: 0 }, { no: benzersiz('x'), turId: tur, periyotGun: 1.5 }]) {
      const cevap = await cagir(yonetici, 'POST', '/olcu-aletleri', govde);
      assert.equal(cevap.statusCode, 400, JSON.stringify(govde));
    }
    assert.equal(await kisit("INSERT INTO olcu_aleti (no, tur_id) VALUES ('', $1)", [tur]), 'olcu_aleti_no_bicim');
    assert.equal(await kisit("INSERT INTO olcu_aleti (no, tur_id) VALUES ('kucuk-1', $1)", [tur]), 'olcu_aleti_no_bicim');
    assert.equal(await kisit("INSERT INTO olcu_aleti (no, tur_id, periyot_gun) VALUES ('P-0', $1, 0)", [tur]), 'olcu_aleti_periyot_pozitif');
    assert.equal(await kisit("INSERT INTO olcu_aleti (no, tur_id) VALUES ('P-OK', $1)", [tur]), 'kabul edildi');
  });

  test('KLB-03: alet numarası benzersizdir; büyük küçük harf ayrımı yok; güncellemede de geçerli', async () => {
    const ilk = await aletAc({ no: 'ben-1' });
    const tur = await turId('Kumpas');
    const cift = await cagir(yonetici, 'POST', '/olcu-aletleri', { no: ' BEN-1', turId: tur });
    assert.equal(cift.statusCode, 409);
    assert.deepEqual(cift.json(), { kod: 'CAKISMA', mesaj: 'Bu alet numarası kullanılıyor.' });
    const baska = await aletAc({ no: 'ben-2' });
    const guncelle = await cagir(yonetici, 'POST', `/olcu-aletleri/${baska.id}/guncelle`, { no: 'Ben-1', turId: tur, periyotGun: baska.periyotGun, surum: baska.surum });
    assert.equal(guncelle.statusCode, 409);
    assert.equal((await ayrinti(baska.id)).no, 'BEN-2');
    assert.equal(await kisit("INSERT INTO olcu_aleti (no, tur_id) VALUES ('BEN-1', $1)", [tur]), 'olcu_aleti_no_tek');
    assert.equal((await ayrinti(ilk.id)).no, 'BEN-1');
  });

  test('güncelleme alet bilgisini değiştirir; var olmayan alet 404', async () => {
    const alet = await aletAc();
    const cevap = await cagir(yonetici, 'POST', `/olcu-aletleri/${alet.id}/guncelle`, {
      no: alet.no, turId: await turId('CMM'), ad: 'Yeni ad', periyotGun: 180, surum: alet.surum,
    });
    assert.equal(cevap.statusCode, 200);
    const yeni = cevap.json<AletAyrintiCevabi>();
    assert.deepEqual([yeni.tur, yeni.ad, yeni.periyotGun], ['CMM', 'Yeni ad', 180]);
    assert.equal((await cagir(yonetici, 'POST', '/olcu-aletleri/99999/guncelle', { no: 'X', turId: 1, periyotGun: 365, surum: 1 })).statusCode, 404);
    assert.equal((await cagir(yonetici, 'GET', '/olcu-aletleri/99999')).statusCode, 404);
  });

  test('KLB-S9: düzenleme okunan sürümü ister; eski sürümle yazan 409 alır ve alet değişmez; kalibrasyon kaydı da sürümü ilerletir', async () => {
    const alet = await aletAc({ periyotGun: 100 });
    assert.equal(alet.surum, 1);
    const url = `/olcu-aletleri/${alet.id}/guncelle`;
    const govde = (ek: Record<string, unknown>) => ({ no: alet.no, turId: alet.turId, periyotGun: alet.periyotGun, ...ek });

    const ilk = await cagir(yonetici, 'POST', url, govde({ yer: 'Raf 1', surum: 1 }));
    assert.equal(ilk.statusCode, 200, ilk.body);
    assert.equal(ilk.json<AletAyrintiCevabi>().surum, 2);
    const eski = await cagir(yonetici, 'POST', url, govde({ yer: 'Raf 2', surum: 1 }));
    assert.equal(eski.statusCode, 409, eski.body);
    assert.equal((await ayrinti(alet.id)).yer, 'Raf 1');
    assert.equal((await cagir(yonetici, 'POST', url, govde({ yer: 'Raf 3' }))).statusCode, 400);

    const kayitli = await kayitAt(alet.id, { tarih: gun(-1), sonuc: 'uygun' });
    assert.equal(kayitli.surum, 3);
    assert.equal((await cagir(yonetici, 'POST', url, govde({ yer: 'Raf 4', surum: 2 }))).statusCode, 409);
    assert.equal((await cagir(yonetici, 'POST', url, govde({ yer: 'Raf 4', surum: 3 }))).statusCode, 200);

    const ekle = await cagir(yonetici, 'POST', '/olcu-aleti-turleri', { ad: benzersiz('Sürüm türü') });
    const tur = ekle.json<TurListesiCevabi>().turler.find((t) => t.aletSayisi === 0 && t.ad.startsWith('Sürüm türü'));
    assert.equal(tur?.surum, 1);
    const turUrl = `/olcu-aleti-turleri/${tur?.id}/guncelle`;
    assert.equal((await cagir(yonetici, 'POST', turUrl, { ad: tur?.ad, aktif: false, surum: 1 })).statusCode, 200);
    const turEski = await cagir(yonetici, 'POST', turUrl, { ad: tur?.ad, aktif: true, surum: 1 });
    assert.equal(turEski.statusCode, 409, turEski.body);
    const turSonra = (await cagir(okur, 'GET', '/olcu-aleti-turleri')).json<TurListesiCevabi>().turler.find((t) => t.id === tur?.id);
    assert.deepEqual([turSonra?.aktif, turSonra?.surum], [false, 2]);
    assert.equal((await cagir(yonetici, 'POST', turUrl, { ad: tur?.ad, aktif: true })).statusCode, 400);
  });

  test('güncellemede periyot zorunludur: gönderilmezse alet değişmez, periyot varsayılana dönmez ve vade kaymaz', async () => {
    const alet = await aletAc({ periyotGun: 100, ilkKalibrasyon: { tarih: gun(-40), sonuc: 'uygun' } });
    assert.deepEqual([alet.periyotGun, alet.vade], [100, gun(60)]);
    const url = `/olcu-aletleri/${alet.id}/guncelle`;

    const eksik = await cagir(yonetici, 'POST', url, { no: alet.no, turId: alet.turId, yer: 'Raf 9', surum: alet.surum });
    assert.equal(eksik.statusCode, 400, eksik.body);
    const sonra = await ayrinti(alet.id);
    assert.deepEqual([sonra.periyotGun, sonra.vade, sonra.yer], [100, gun(60), null]);

    const tam = await cagir(yonetici, 'POST', url, { no: alet.no, turId: alet.turId, yer: 'Raf 9', periyotGun: alet.periyotGun, surum: alet.surum });
    assert.equal(tam.statusCode, 200, tam.body);
    const son = await ayrinti(alet.id);
    assert.deepEqual([son.periyotGun, son.vade, son.yer], [100, gun(60), 'Raf 9']);
  });

  test('KLB-S5: kaydı olmayan aletin vadesi null, durumu "kayıt yok"; ilk kalibrasyon isteğe bağlıdır ve verilirse vadeyi kurar', async () => {
    const yok = await aletAc();
    assert.deepEqual(
      [yok.sonKalibrasyon, yok.vade, yok.kalanGun, yok.durum, yok.kayitSayisi, yok.sonKayitlar],
      [null, null, null, 'kayit-yok', 0, []],
    );
    const var_ = await aletAc({ periyotGun: 100, ilkKalibrasyon: { tarih: gun(-40), sonuc: 'uygun', sertifikaNo: 'S-1' } });
    assert.deepEqual(
      [var_.sonKalibrasyon, var_.vade, var_.kalanGun, var_.durum, var_.kayitSayisi],
      [gun(-40), gun(60), 60, 'gecerli', 1],
    );
    assert.equal(var_.sonKayitlar[0]?.sertifikaNo, 'S-1');
  });

  test('KLB-07: kalibrasyon kaydı tarih, sonuç, sertifika no ve açıklama taşır; tarih varsayılan bugün; kaydı yapan kişi saklanır', async () => {
    const alet = await aletAc();
    const sonuc = await kayitAt(alet.id, { sonuc: 'uygun', sertifikaNo: ' CERT-9 ', aciklama: 'Yıllık kalibrasyon' });
    assert.deepEqual(sonuc.sonKayitlar.map((k) => [k.tarih, k.sonuc, k.sertifikaNo, k.aciklama, k.kisiAd]), [
      [bugun, 'uygun', 'CERT-9', 'Yıllık kalibrasyon', 'Deneme yonetici'],
    ]);
    const eski = await kayitAt(alet.id, { tarih: gun(-3), sonuc: 'uygun' });
    assert.equal(eski.sonKayitlar.find((k) => k.tarih === gun(-3))?.sertifikaNo, null);

    const kotu = (govde: unknown) => cagir(yonetici, 'POST', `/olcu-aletleri/${alet.id}/kalibrasyon-kaydet`, govde);
    assert.equal((await kotu({ sonuc: 'belki' })).statusCode, 400);
    assert.equal((await kotu({})).statusCode, 400);
    for (const tarih of ['2026-02-30', '01.02.2026', '2026-13-01']) assert.equal((await kotu({ sonuc: 'uygun', tarih })).statusCode, 400, tarih);
    assert.equal((await cagir(yonetici, 'POST', '/olcu-aletleri/99999/kalibrasyon-kaydet', { sonuc: 'uygun' })).statusCode, 404);
    assert.equal(await kisit("INSERT INTO kalibrasyon_kaydi (alet_id, tarih, kisi_id, sonuc) VALUES ($1, current_date, $2, 'belki')", [alet.id, yoneticiId]), 'kalibrasyon_kaydi_sonuc');
  });

  test('KLB-S8: kalibrasyon kaydı tekrar korumalıdır: aynı istek kimliği ikinci kayıt yazmaz, başlıksız istek reddedilir', async () => {
    const alet = await aletAc();
    const kayitSayisi = async (): Promise<number> =>
      Number((await vt().tek<{ n: string }>('SELECT count(*) AS n FROM kalibrasyon_kaydi WHERE alet_id = $1', [alet.id]))?.n);
    const url = `/olcu-aletleri/${alet.id}/kalibrasyon-kaydet`;
    const govde = { sonuc: 'uygun', sertifikaNo: 'S-1' };
    const kimlik = randomUUID();

    const ilk = await cagir(yonetici, 'POST', url, govde, kimlik);
    assert.equal(ilk.statusCode, 200, ilk.body);
    const yineleme = await cagir(yonetici, 'POST', url, govde, kimlik);
    assert.equal(yineleme.statusCode, 200, yineleme.body);
    assert.deepEqual(yineleme.json(), ilk.json());
    assert.equal(await kayitSayisi(), 1);

    // Aynı kimlik başka gövdeyle: saklı cevap dönmez, kayıt da yazılmaz.
    assert.notEqual((await cagir(yonetici, 'POST', url, { sonuc: 'uygunsuz' }, kimlik)).statusCode, 200);
    assert.equal((await cagir(yonetici, 'POST', url, govde, null)).statusCode, 400);
    assert.equal((await cagir(yonetici, 'POST', url, govde, 'uuid-degil')).statusCode, 400);
    assert.equal((await cagir(okur, 'POST', url, govde, randomUUID())).statusCode, 403);
    assert.equal(await kayitSayisi(), 1);

    // Yeni kimlik yeni kayıttır.
    assert.equal((await cagir(yonetici, 'POST', url, govde, randomUUID())).statusCode, 200);
    assert.equal(await kayitSayisi(), 2);
  });

  test('KLB-08, KLB-09, KLB-10: uygunsuz kayıt aleti kullanım dışı bırakır ve son kalibrasyonu değiştirmez; yalnız yeni uygun kayıt döndürür', async () => {
    const alet = await aletAc({ periyotGun: 100 });
    const uygun = await kayitAt(alet.id, { tarih: gun(-10), sonuc: 'uygun' });
    assert.deepEqual([uygun.kullanimDisi, uygun.sonKalibrasyon, uygun.durum], [false, gun(-10), 'gecerli']);

    const uygunsuz = await kayitAt(alet.id, { tarih: gun(-2), sonuc: 'uygunsuz' });
    assert.deepEqual(
      [uygunsuz.kullanimDisi, uygunsuz.sonKalibrasyon, uygunsuz.vade, uygunsuz.durum],
      [true, gun(-10), gun(90), 'kullanim-disi'],
    );
    assert.equal(uygunsuz.kullanimDisiNedeni, 'Kalibrasyon sonucu uygunsuz.');

    // Elle "geçerli" yapmanın yolu yok: güncelleme gövdesi kullanım durumunu taşımaz, fazladan gelen alan yok sayılır.
    const elle = await cagir(yonetici, 'POST', `/olcu-aletleri/${alet.id}/guncelle`, {
      no: alet.no, turId: alet.turId, periyotGun: alet.periyotGun, kullanimDisi: false, kullanimDisiNedeni: null, surum: uygunsuz.surum,
    });
    assert.equal(elle.statusCode, 200, elle.body);
    assert.equal(elle.json<AletAyrintiCevabi>().kullanimDisi, true);
    const elleSonra = await ayrinti(alet.id);
    assert.deepEqual([elleSonra.kullanimDisi, elleSonra.periyotGun, elleSonra.vade], [true, 100, gun(90)]);

    const donus = await kayitAt(alet.id, { tarih: gun(-1), sonuc: 'uygun' });
    assert.deepEqual([donus.kullanimDisi, donus.kullanimDisiNedeni, donus.sonKalibrasyon, donus.durum], [false, null, gun(-1), 'gecerli']);
  });

  test('KL3: durumu en yeni kalibrasyon tarihli kayıt belirler; geriye dönük kayıt deftere girer ama kullanım durumunu değiştirmez', async () => {
    const alet = await aletAc({ ilkKalibrasyon: { tarih: '2026-01-10', sonuc: 'uygun' } });
    const uygunsuz = await kayitAt(alet.id, { tarih: '2026-02-10', sonuc: 'uygunsuz' });
    assert.deepEqual([uygunsuz.kullanimDisi, uygunsuz.sonKalibrasyon], [true, '2026-01-10']);

    const eskiUygun = await kayitAt(alet.id, { tarih: '2026-02-05', sonuc: 'uygun' });
    assert.deepEqual(
      [eskiUygun.kullanimDisi, eskiUygun.kullanimDisiNedeni, eskiUygun.durum, eskiUygun.kayitSayisi, eskiUygun.sonKalibrasyon],
      [true, 'Kalibrasyon sonucu uygunsuz.', 'kullanim-disi', 3, '2026-02-05'],
    );

    // Aynı tarihte sonradan girilen belirler.
    const ayniGun = await kayitAt(alet.id, { tarih: '2026-02-10', sonuc: 'uygun' });
    assert.deepEqual([ayniGun.kullanimDisi, ayniGun.kullanimDisiNedeni, ayniGun.sonKalibrasyon], [false, null, '2026-02-10']);

    const eskiUygunsuz = await kayitAt(alet.id, { tarih: '2026-02-01', sonuc: 'uygunsuz' });
    assert.deepEqual([eskiUygunsuz.kullanimDisi, eskiUygunsuz.kullanimDisiNedeni, eskiUygunsuz.kayitSayisi], [false, null, 5]);
  });

  test('KL3: gelecek tarihli kayıt reddedilir, bugünün tarihi kabul edilir; ilk kalibrasyon da aynı kuraldan geçer', async () => {
    const SAAT = '2026-03-10';
    const gelecek = (hata: unknown): boolean => {
      const h = hata as { kod?: string; alan?: string; message?: string };
      assert.deepEqual([h.kod, h.alan, h.message], ['DOGRULAMA', 'tarih', 'Kalibrasyon tarihi bugünden sonra olamaz.']);
      return true;
    };
    const alet = await aletAc();
    const kaydet = (tarih: string) => vt().tx((db) => kalibrasyonKaydet(db, yoneticiId, alet.id, { tarih, sonuc: 'uygun' }, SAAT));

    await assert.rejects(kaydet('2026-03-11'), gelecek);
    assert.equal((await ayrinti(alet.id)).kayitSayisi, 0);
    const kabul = await kaydet('2026-03-10');
    assert.deepEqual([kabul.kayitSayisi, kabul.sonKayitlar[0]?.tarih, kabul.kullanimDisi], [1, '2026-03-10', false]);

    const no = benzersiz('GLC');
    const turu = await turId('Kumpas');
    const ac = (tarih: string) => vt().tx((db) => aletOlustur(db, yoneticiId, { no, turId: turu, ilkKalibrasyon: { tarih, sonuc: 'uygun' } }, SAAT));
    await assert.rejects(ac('2026-03-11'), gelecek);
    assert.equal((await cagir(yonetici, 'GET', `/olcu-aletleri?ara=${no}`)).json<ListeCevabi>().aletler.length, 0);
    assert.equal((await ac('2026-03-10')).sonKalibrasyon, '2026-03-10');

    const uc = await cagir(yonetici, 'POST', `/olcu-aletleri/${alet.id}/kalibrasyon-kaydet`, { tarih: '2999-01-01', sonuc: 'uygun' });
    assert.equal(uc.statusCode, 400, uc.body);
    assert.deepEqual([uc.json().kod, uc.json().mesaj], ['DOGRULAMA', 'Kalibrasyon tarihi bugünden sonra olamaz.']);
    assert.equal((await ayrinti(alet.id)).kayitSayisi, 1);
  });

  test('KL1: kalibrasyon kaydı girmiş kişinin satırı silinemez; kaydı olmayan kişi silinir', async () => {
    const kayitliAdi = benzersiz('kayitli');
    const kayitli = await kisiAc(kayitliAdi);
    const kayitsiz = await kisiAc(benzersiz('kayitsiz'));
    const alet = await aletAc();
    await vt().tx((db) => kalibrasyonKaydet(db, kayitli, alet.id, { sonuc: 'uygun' }));

    const sil = (id: number) => vt().sorgu('DELETE FROM kisi WHERE id = $1', [id]).then(
      () => 'silindi',
      (hata: { code?: string; constraint?: string }) => `${hata.code} ${hata.constraint}`,
    );
    assert.equal(await sil(kayitli), '23503 kalibrasyon_kaydi_kisi_id_fkey');
    assert.equal((await ayrinti(alet.id)).sonKayitlar[0]?.kisiAd, `Deneme ${kayitliAdi}`);
    assert.equal(await sil(kayitsiz), 'silindi');
  });

  test('KL5: hiç kalibrasyon kaydı olmayan alet geçerli sayılmaz; geçerli kaydı olunca sayılır', async () => {
    const tur = (await vt().tek<{ id: number }>("INSERT INTO olcu_aleti_turu (ad) VALUES ('Kayıtsız tür') RETURNING id"))?.id ?? 0;
    const alet = await aletAc({ turId: tur, periyotGun: 100 });
    assert.equal(alet.kayitSayisi, 0);
    assert.equal(await gecerliAletVarMi(vt(), tur), false);
    assert.equal((await aletGetir(vt(), alet.id))?.durum, 'kayit-yok');

    await kayitAt(alet.id, { sonuc: 'uygun' });
    assert.equal(await gecerliAletVarMi(vt(), tur), true);
    assert.equal((await aletGetir(vt(), alet.id))?.durum, 'gecerli');
  });

  test('KLB-S7: alet nedenle elle kullanım dışı bırakılır; neden zorunlu; yalnız yeni uygun kayıt döndürür; uygunsuz kayıt elle yazılan nedeni ezmez', async () => {
    const alet = await aletAc({ ilkKalibrasyon: { tarih: gun(-5), sonuc: 'uygun' } });
    const url = `/olcu-aletleri/${alet.id}/kullanim-disi`;
    for (const govde of [{}, { neden: '  ' }]) assert.equal((await cagir(yonetici, 'POST', url, govde)).statusCode, 400);
    assert.equal((await ayrinti(alet.id)).kullanimDisi, false);

    const cevap = await cagir(yonetici, 'POST', url, { neden: ' Kayıp ' });
    assert.equal(cevap.statusCode, 200);
    assert.deepEqual(
      [cevap.json<AletAyrintiCevabi>().kullanimDisi, cevap.json<AletAyrintiCevabi>().kullanimDisiNedeni, cevap.json<AletAyrintiCevabi>().durum],
      [true, 'Kayıp', 'kullanim-disi'],
    );
    assert.equal((await cagir(yonetici, 'POST', url, { neden: 'Hasar' })).statusCode, 409);
    assert.equal((await cagir(yonetici, 'POST', '/olcu-aletleri/99999/kullanim-disi', { neden: 'x' })).statusCode, 404);

    const uygunsuz = await kayitAt(alet.id, { sonuc: 'uygunsuz' });
    assert.equal(uygunsuz.kullanimDisiNedeni, 'Kayıp');
    const donus = await kayitAt(alet.id, { sonuc: 'uygun' });
    assert.deepEqual([donus.kullanimDisi, donus.kullanimDisiNedeni], [false, null]);

    assert.equal(await kisit("UPDATE olcu_aleti SET kullanim_disi = true WHERE id = $1", [alet.id]), 'olcu_aleti_neden_butun');
    assert.equal(await kisit("UPDATE olcu_aleti SET kullanim_disi_nedeni = 'x' WHERE id = $1", [alet.id]), 'olcu_aleti_neden_butun');
    assert.equal(await kisit("UPDATE olcu_aleti SET kullanim_disi = true, kullanim_disi_nedeni = ' ' WHERE id = $1", [alet.id]), 'olcu_aleti_neden_butun');
    assert.equal(await kisit("UPDATE olcu_aleti SET kullanim_disi = true, kullanim_disi_nedeni = 'Hasar' WHERE id = $1", [alet.id]), 'kabul edildi');
  });

  test('KL3, KLB-S7: elle kullanım dışı bırakılmış alete geriye dönük kayıt deftere girer ama aleti kullanıma döndürmez', async () => {
    const alet = await aletAc({ ilkKalibrasyon: { tarih: gun(-5), sonuc: 'uygun' } });
    const birak = await cagir(yonetici, 'POST', `/olcu-aletleri/${alet.id}/kullanim-disi`, { neden: 'Kayıp' });
    assert.equal(birak.statusCode, 200, birak.body);

    const eskiUygun = await kayitAt(alet.id, { tarih: gun(-10), sonuc: 'uygun' });
    assert.deepEqual(
      [eskiUygun.kullanimDisi, eskiUygun.kullanimDisiNedeni, eskiUygun.durum, eskiUygun.kayitSayisi, eskiUygun.sonKalibrasyon],
      [true, 'Kayıp', 'kullanim-disi', 2, gun(-5)],
    );
    const eskiUygunsuz = await kayitAt(alet.id, { tarih: gun(-8), sonuc: 'uygunsuz' });
    assert.deepEqual([eskiUygunsuz.kullanimDisi, eskiUygunsuz.kullanimDisiNedeni, eskiUygunsuz.kayitSayisi], [true, 'Kayıp', 3]);
    const okunan = await ayrinti(alet.id);
    assert.deepEqual([okunan.kullanimDisi, okunan.kullanimDisiNedeni, okunan.durum], [true, 'Kayıp', 'kullanim-disi']);

    // Belirleyen kayıt olunca döner: en yeni tarihle aynı günde sonradan girilen uygun kayıt.
    const donus = await kayitAt(alet.id, { tarih: gun(-5), sonuc: 'uygun' });
    assert.deepEqual([donus.kullanimDisi, donus.kullanimDisiNedeni, donus.durum], [false, null, 'gecerli']);
  });

  test('KLB-11, KLB-14: bütün kayıtlar saklanır; satırda son altısı en yeni üstte gelir; defter yalnız ekleme alır', async () => {
    const alet = await aletAc();
    for (let i = 0; i < 8; i += 1) await kayitAt(alet.id, { tarih: gun(-80 + i * 10), sonuc: 'uygun', sertifikaNo: `S-${i}` });
    const son = await ayrinti(alet.id);
    assert.equal(son.kayitSayisi, 8);
    assert.deepEqual(son.sonKayitlar.map((k) => k.sertifikaNo), ['S-7', 'S-6', 'S-5', 'S-4', 'S-3', 'S-2']);
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*) AS n FROM kalibrasyon_kaydi WHERE alet_id = $1', [alet.id]))?.n, 8);

    const degistir = 'UPDATE kalibrasyon_kaydi SET aciklama = $1 WHERE alet_id = $2';
    const sil = 'DELETE FROM kalibrasyon_kaydi WHERE alet_id = $1';
    // Tetikleyici, hakkı olan sahibi de durdurur; uygulama kullanıcısını boşaltmadan yetki alıkoyar.
    for (const [kim, baglanti] of [['uygulama', vt()], ['sahip', sahip()]] as const) {
      await assert.rejects(baglanti.sorgu(degistir, ['x', alet.id]), /yalnız ekleme/, `UPDATE (${kim})`);
      await assert.rejects(baglanti.sorgu(sil, [alet.id]), /yalnız ekleme/, `DELETE (${kim})`);
    }
    await assert.rejects(vt().sorgu('TRUNCATE kalibrasyon_kaydi'), izinYok, 'TRUNCATE (uygulama)');
    await assert.rejects(sahip().sorgu('TRUNCATE kalibrasyon_kaydi'), /yalnız ekleme/, 'TRUNCATE (sahip)');
    assert.equal((await ayrinti(alet.id)).kayitSayisi, 8);
    assert.deepEqual(
      await sahip().sorgu('SELECT DISTINCT aciklama FROM kalibrasyon_kaydi WHERE alet_id = $1', [alet.id]),
      [{ aciklama: null }],
    );
  });

  test('KLB-S6: kalibrasyon kaydı olan alet silinemez, kullanım dışı bırakılır; kaydı olmayan silinir', async () => {
    const kayitli = await aletAc({ ilkKalibrasyon: { sonuc: 'uygun' } });
    const red = await cagir(yonetici, 'POST', `/olcu-aletleri/${kayitli.id}/sil`);
    assert.equal(red.statusCode, 409);
    assert.deepEqual(red.json(), { kod: 'BAGIMLI_KAYIT', mesaj: 'Kalibrasyon kaydı olan alet silinemez; kullanım dışı bırakın.' });
    assert.equal((await ayrinti(kayitli.id)).kayitSayisi, 1);
    assert.match(await kisit('DELETE FROM olcu_aleti WHERE id = $1', [kayitli.id]), /olcu_aleti|kalibrasyon_kaydi/);
    assert.equal((await ayrinti(kayitli.id)).no, kayitli.no);

    const bos = await aletAc();
    const sil = await cagir(yonetici, 'POST', `/olcu-aletleri/${bos.id}/sil`);
    assert.equal(sil.statusCode, 204);
    assert.equal((await cagir(yonetici, 'GET', `/olcu-aletleri/${bos.id}`)).statusCode, 404);
    assert.equal((await cagir(yonetici, 'POST', `/olcu-aletleri/${bos.id}/sil`)).statusCode, 404);
  });

  test('KLB-S3: başlangıç türleri göçle gelir; tür adı benzersizdir; pasif tür yeni alete seçilemez ama mevcut aletini bozmaz', async () => {
    const liste = (await cagir(okur, 'GET', '/olcu-aleti-turleri')).json<TurListesiCevabi>().turler;
    for (const ad of BASLANGIC_TURLERI) assert.equal(liste.some((t) => t.ad === ad && t.aktif), true, ad);

    const ekle = await cagir(yonetici, 'POST', '/olcu-aleti-turleri', { ad: ' Sinyal gösterge ' });
    assert.equal(ekle.statusCode, 200);
    const yeni = ekle.json<TurListesiCevabi>().turler.find((t) => t.ad === 'Sinyal gösterge');
    assert.equal(yeni?.aletSayisi, 0);
    for (const ad of ['SİNYAL GÖSTERGE'.toLocaleLowerCase('tr-TR'), 'sinyal gösterge', 'Kumpas', 'KUMPAS']) {
      const cift = await cagir(yonetici, 'POST', '/olcu-aleti-turleri', { ad });
      assert.equal(cift.statusCode, 409, ad);
      assert.deepEqual(cift.json(), { kod: 'CAKISMA', mesaj: 'Bu tür adı kullanılıyor.' });
    }
    assert.equal((await cagir(yonetici, 'POST', '/olcu-aleti-turleri', { ad: ' ' })).statusCode, 400);
    assert.equal(await kisit("INSERT INTO olcu_aleti_turu (ad) VALUES ('  ')"), 'olcu_aleti_turu_ad_dolu');

    const id = yeni?.id ?? 0;
    const alet = await aletAc({ turId: id, periyotGun: 100 });
    const pasif = await cagir(yonetici, 'POST', `/olcu-aleti-turleri/${id}/guncelle`, { ad: 'Sinyal gösterge', aktif: false, surum: yeni?.surum });
    assert.equal(pasif.json<TurListesiCevabi>().turler.find((t) => t.id === id)?.aletSayisi, 1);
    const reddedilen = await cagir(yonetici, 'POST', '/olcu-aletleri', { no: benzersiz('p'), turId: id });
    assert.equal(reddedilen.statusCode, 400);
    assert.equal(reddedilen.json().mesaj, 'Bu tür kullanımdan kaldırıldı; başka bir tür seçin.');
    const koru = await cagir(yonetici, 'POST', `/olcu-aletleri/${alet.id}/guncelle`, { no: alet.no, turId: id, yer: 'Raf 2', periyotGun: alet.periyotGun, surum: alet.surum });
    assert.equal(koru.statusCode, 200);
    assert.equal(koru.json<AletAyrintiCevabi>().periyotGun, 100);
    const tasi = await cagir(yonetici, 'POST', `/olcu-aletleri/${alet.id}/guncelle`, {
      no: alet.no, turId: await turId('Kumpas'), periyotGun: alet.periyotGun, surum: koru.json<AletAyrintiCevabi>().surum,
    });
    assert.equal(tasi.statusCode, 200);
    assert.equal((await ayrinti(alet.id)).periyotGun, 100);
    assert.equal((await cagir(yonetici, 'POST', '/olcu-aleti-turleri/99999/guncelle', { ad: 'Yok', aktif: true, surum: 1 })).statusCode, 404);

    assert.equal((await aletTurleri(vt())).some((t) => t.id === id), false);
    assert.equal((await aletTurleri(vt())).some((t) => t.ad === 'Kumpas'), true);
    // Tür kullanımdaki alet varken silinemez: alet türsüz kalmaz.
    assert.equal(await kisit('DELETE FROM olcu_aleti_turu WHERE id = $1', [await turId('Kumpas')]), 'olcu_aleti_tur_id_fkey');
  });

  test('KLB-12, KLB-13: liste vadeye göre sıralanır, aranır; özet kullanım dışıyı saymaz ve aramadan etkilenmez', async () => {
    const tur = await vt().tek<{ id: number }>("INSERT INTO olcu_aleti_turu (ad) VALUES ('Liste türü') RETURNING id");
    const ac = (no: string, ek: Record<string, unknown>) => aletAc({ no, turId: tur?.id, periyotGun: 100, ...ek });
    const once = await vt().tek<{ n: number }>('SELECT count(*) AS n FROM olcu_aleti');
    await ac('LST-GECMIS', { yer: 'Torna hattı', ilkKalibrasyon: { tarih: gun(-150), sonuc: 'uygun' } });
    await ac('LST-YAKIN', { yer: 'Freze hattı', ilkKalibrasyon: { tarih: gun(-90), sonuc: 'uygun' } });
    await ac('LST-UZAK', { ilkKalibrasyon: { tarih: gun(-10), sonuc: 'uygun' } });
    await ac('LST-KAYITSIZ', {});
    await ac('LST-DISI', { ilkKalibrasyon: { tarih: gun(-200), sonuc: 'uygun' } });
    const disi = (await cagir(yonetici, 'GET', '/olcu-aletleri?ara=lst-disi')).json<ListeCevabi>().aletler[0];
    await kayitAt(disi?.id ?? 0, { sonuc: 'uygunsuz' });

    const tum = (await cagir(okur, 'GET', '/olcu-aletleri')).json<ListeCevabi>();
    const bizim = tum.aletler.filter((a) => a.no.startsWith('LST-')).map((a) => a.no);
    // Kullanım dışı aletin vadesi geçmiştir ama kendi vadesiyle sıralanır; kaydı olmayan en sondadır.
    assert.deepEqual(bizim, ['LST-DISI', 'LST-GECMIS', 'LST-YAKIN', 'LST-UZAK', 'LST-KAYITSIZ']);
    const tumSayi = (await vt().tek<{ n: number }>('SELECT count(*) AS n FROM olcu_aleti'))?.n ?? 0;
    assert.equal(tumSayi - (once?.n ?? 0), 5);
    const bizimOzet = tum.aletler.filter((a) => a.no.startsWith('LST-'));
    assert.equal(bizimOzet.filter((a) => a.durum === 'gecmis').length, 1);
    assert.equal(bizimOzet.filter((a) => a.durum === 'yaklasan').length, 1);
    assert.equal(tum.ozet.vadesiGecen, tum.aletler.filter((a) => a.durum === 'gecmis').length);
    assert.equal(tum.ozet.yaklasan, tum.aletler.filter((a) => a.durum === 'yaklasan').length);

    const arama = (await cagir(okur, 'GET', `/olcu-aletleri?ara=${encodeURIComponent('FREZE')}`)).json<ListeCevabi>();
    assert.deepEqual(arama.aletler.map((a) => a.no), ['LST-YAKIN']);
    assert.deepEqual(arama.ozet, tum.ozet);
    const turAra = (await cagir(okur, 'GET', `/olcu-aletleri?ara=${encodeURIComponent('liste türü')}`)).json<ListeCevabi>();
    assert.equal(turAra.aletler.length, 5);
    assert.equal((await cagir(okur, 'GET', '/olcu-aletleri?ara=yokyokyok')).json<ListeCevabi>().aletler.length, 0);
  });

  test('disari: gecerliAletVarMi (KLB-15, KLB-16), aletGetir, aletNoIleGetir, aletKimlikleri, vadesiGecenAletSayisi', async () => {
    const yeniTur = async (ad: string): Promise<number> => (await vt().tek<{ id: number }>('INSERT INTO olcu_aleti_turu (ad) VALUES ($1) RETURNING id', [ad]))?.id ?? 0;
    const bos = await yeniTur('Boş tür');
    const karisik = await yeniTur('Karışık tür');
    const gecmisTur = await yeniTur('Geçmiş tür');
    const disiTur = await yeniTur('Dışı tür');

    assert.equal(await gecerliAletVarMi(vt(), bos), null);

    const gecerli = await aletAc({ turId: karisik, periyotGun: 100, ilkKalibrasyon: { tarih: gun(-10), sonuc: 'uygun' } });
    await aletAc({ turId: karisik, periyotGun: 100, ilkKalibrasyon: { tarih: gun(-300), sonuc: 'uygun' } });
    assert.equal(await gecerliAletVarMi(vt(), karisik), true);

    await aletAc({ turId: gecmisTur, periyotGun: 100, ilkKalibrasyon: { tarih: gun(-300), sonuc: 'uygun' } });
    assert.equal(await gecerliAletVarMi(vt(), gecmisTur), false);

    const disi = await aletAc({ turId: disiTur, periyotGun: 100, ilkKalibrasyon: { tarih: gun(-5), sonuc: 'uygun' } });
    assert.equal(await gecerliAletVarMi(vt(), disiTur), true);
    await kayitAt(disi.id, { sonuc: 'uygunsuz' });
    assert.equal(await gecerliAletVarMi(vt(), disiTur), null);

    assert.deepEqual(await aletGetir(vt(), gecerli.id), {
      id: gecerli.id, no: gecerli.no, turId: karisik, tur: 'Karışık tür', vade: gun(90), durum: 'gecerli',
    });
    assert.equal((await aletGetir(vt(), disi.id))?.durum, 'kullanim-disi');
    assert.equal(await aletGetir(vt(), 99999), null);
    // 885 a: malzeme kartı aleti numarasıyla anar; numara küçük harf ve boşlukla da bulunur.
    assert.deepEqual(await aletNoIleGetir(vt(), ` ${gecerli.no.toLowerCase()} `), await aletGetir(vt(), gecerli.id));
    assert.equal(await aletNoIleGetir(vt(), 'YOK-NO-1'), null);
    assert.equal(await aletNoIleGetir(vt(), '  '), null);
    const hepsi = await aletKimlikleri(vt());
    assert.deepEqual(hepsi.map((a) => a.no), [...hepsi.map((a) => a.no)].sort((a, b) => a.localeCompare(b)));
    assert.equal(hepsi.find((a) => a.id === disi.id)?.durum, 'kullanim-disi');
    assert.deepEqual(hepsi.find((a) => a.id === gecerli.id), await aletGetir(vt(), gecerli.id));
    // KLB-17: tek alet; geçerli kullanılır, vadesi geçmiş, kullanım dışı ve olmayan kullanılmaz.
    assert.equal(await olcumAletiGecerliMi(vt(), gecerli.id), true);
    const gecmis = await aletAc({ turId: karisik, periyotGun: 100, ilkKalibrasyon: { tarih: gun(-300), sonuc: 'uygun' } });
    assert.equal(await olcumAletiGecerliMi(vt(), gecmis.id), false);
    assert.equal(await olcumAletiGecerliMi(vt(), disi.id), false);
    assert.equal(await olcumAletiGecerliMi(vt(), 99999), false);

    const beklenen = (await cagir(yonetici, 'GET', '/olcu-aletleri')).json<ListeCevabi>().ozet.vadesiGecen;
    assert.equal(await vadesiGecenAletSayisi(vt()), beklenen);
    assert.equal(beklenen > 0, true);
  });

  test('ana sayfa özeti liste ucunun özetiyle aynıdır, aletleri taşımaz', async () => {
    await aletAc({ periyotGun: 100, ilkKalibrasyon: { tarih: gun(-300), sonuc: 'uygun' } });
    await aletAc({ periyotGun: 100, ilkKalibrasyon: { tarih: gun(-95), sonuc: 'uygun' } });
    const liste = (await cagir(okur, 'GET', '/olcu-aletleri')).json<ListeCevabi>();
    const cevap = await cagir(okur, 'GET', '/olcu-aletleri/ozet');
    assert.equal(cevap.statusCode, 200, cevap.body);
    assert.deepEqual(cevap.json(), liste.ozet);
    assert.equal(liste.ozet.vadesiGecen > 0 && liste.ozet.yaklasan > 0, true);
  });
});
