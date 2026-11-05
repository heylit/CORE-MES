import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { LogoGelenCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { logoEslemeYaziciCozucusu, logoKartAynasiCozucusu, logoTmiKodCozucusu } from './disari.ts';
import type { LogoAynaKarti } from './disari.ts';
import { logoGelenDurumu, logoKartFarklari, logoKodBicimi, logoKoduTureUyar } from './kurallar.ts';
import { tamGovde } from './test-kart.ts';

const PAROLA = 'dogru-parola-1';

describe('Logo\'dan gelen kart kuralları (2116-2 a, 2116-3 c)', () => {
  test('LMA-1 kod biçimi: standart ve firma önekli kod sırasıyla okunur; baştaki sıfırı farklı, boşluklu ya da uzun kod uymaz', () => {
    assert.deepEqual(logoKodBicimi('HM-PAS-00012', null), { onek: 'HM-PAS-', sira: 12 });
    assert.deepEqual(logoKodBicimi('HM-PAS-123456', null), { onek: 'HM-PAS-', sira: 123456 });
    assert.deepEqual(logoKodBicimi('ABC-MM-00003', 'ABC'), { onek: 'ABC-MM-', sira: 3 });
    for (const kod of ['ABC-MM-00003', 'HM-PAS-0012', 'HM-PAS-00000', ' HM-PAS-00012', 'hm-pas-00012', '1500.01', 'HM-PASTA-00001', 'HM-PAS-00000000000000000001']) {
      assert.equal(logoKodBicimi(kod, null), null, kod);
    }
    assert.equal(logoKoduTureUyar({ onek: 'HM-PAS-' }, 'hammadde', null), true);
    assert.equal(logoKoduTureUyar({ onek: 'HM-PAS-' }, 'sarf', null), false);
    assert.equal(logoKoduTureUyar({ onek: 'ABC-MM-' }, 'mamul', 'ABC-MM-'), true);
    assert.equal(logoKoduTureUyar({ onek: 'MM-PAS-' }, 'mamul', 'ABC-MM-'), false, 'firma kodlu türde yalnız ayarın öneki');
  });

  test('LMA-2 durum: kayıt no, sonra eşleme, sonra aynı kod; fark yalnız dolu değerler arasında, Açıklama 1 boşsa TMI adı', () => {
    type K = { kimlik: string; stokKodu: string; logoKayitNo: string | null };
    const a: K = { kimlik: 'a', stokKodu: 'HM-AAA-00001', logoKayitNo: '7' };
    const b: K = { kimlik: 'b', stokKodu: 'HM-BBB-00001', logoKayitNo: null };
    const refle = new Map<string, K>([['7', a]]);
    const kodla = new Map<string, K>([[a.stokKodu, a], [b.stokKodu, b]]);
    assert.deepEqual(logoGelenDurumu({ logoKayitNo: 7, kod: 'X' }, refle, kodla, new Map()), { durum: 'bagli', tmi: a });
    assert.deepEqual(logoGelenDurumu({ logoKayitNo: 8, kod: 'LG.1' }, refle, kodla, new Map([['LG.1', 'HM-BBB-00001']])), { durum: 'bagli', tmi: b });
    assert.deepEqual(logoGelenDurumu({ logoKayitNo: 9, kod: 'HM-BBB-00001' }, refle, kodla, new Map()), { durum: 'bagsiz', tmi: b });
    assert.deepEqual(logoGelenDurumu({ logoKayitNo: 9, kod: 'YOK' }, refle, kodla, new Map()), { durum: 'yeni', tmi: null });
    assert.deepEqual(
      logoKartFarklari({ ad: ' Mil ', aciklama2: null, aciklama3: 'Uc' }, { ad: 'Mil', aciklama1: null, aciklama2: ' ', aciklama3: 'Baska' }),
      [{ alan: 'aciklama_3', logo: 'Uc', tmi: 'Baska' }],
    );
    assert.deepEqual(logoKartFarklari({ ad: 'Logo adi', aciklama2: null, aciklama3: null }, { ad: 'TMI', aciklama1: 'Aciklama', aciklama2: 'Iki', aciklama3: null }), [
      { alan: 'aciklama_1', logo: 'Logo adi', tmi: 'Aciklama' }, { alan: 'aciklama_2', logo: null, tmi: 'Iki' },
    ]);
  });
});

describe('Logo\'dan gelen kartlar: liste, alma, bağlama, Logo\'dakini alma (2116; gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  let okuyucuCerezi = '';
  const ayna: LogoAynaKarti[] = [];
  const eslemeler = new Map<string, string>();
  const yazilanEslemeler: { stokKodu: string; logoKodu: string; logoKayitNo: number }[] = [];

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (yontem: 'GET' | 'POST', yol: string, govde?: unknown, c = cerez) =>
    app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: c, 'istek-kimligi': randomUUID() }, ...(govde === undefined ? {} : { payload: govde as object }) });
  const liste = async (sorgu = ''): Promise<LogoGelenCevabi> => {
    const c = await istek('GET', `/malzeme-logo-kartlari${sorgu}`);
    assert.equal(c.statusCode, 200, c.body);
    return c.json() as LogoGelenCevabi;
  };
  const kart = (ref: number, kod: string, ek: Partial<LogoAynaKarti> = {}): LogoAynaKarti => ({
    logoKayitNo: ref, kod, ad: `Logo ${kod}`, aciklama2: null, aciklama3: null, kartTuru: 10, birimSeti: '06', aktif: true, sonOkuma: '2026-11-05T08:00:00.000Z', ...ek,
  });
  const kartSatiri = (kimlik: string) => vt().tek<{ kod: string; durum: string; logo: string | null; gonderim: string | null; tur: string | null; set: string | null; a1: string | null; a2: string | null; guncelleme: string | null; surum: number }>(
    `SELECT stok_kodu AS kod, onay_durumu AS durum, logo_kayit_no AS logo, logo_gonderim_durumu AS gonderim, logo_kart_turu AS tur, logo_birim_seti AS set,
            aciklama_1 AS a1, aciklama_2 AS a2, logo_guncelleme_durumu AS guncelleme, surum FROM malzeme_katalog_karti WHERE kimlik = $1`, [kimlik]);
  let sayac = 0;
  async function taslakAc(kod: string): Promise<{ kimlik: string; kod: string; surum: number }> {
    const kimlik = `lma${++sayac}`;
    const url = `/malzeme-katalogu-kartlari/${kimlik}/kaydet`;
    const govde = {
      kayit: { id: kimlik, tur: 'hammadde', fam: 'metal', com: { kod, ad: `TMI ${kimlik}`, birim: 'kg' }, onay: { durum: 'taslak' } },
      ozet: { benzersiz_anahtar: `hammadde|metal|${kimlik}`, mukerrer_gerekcesi: null }, surum: null,
    };
    const c = await istek('POST', url, tamGovde(url, govde));
    assert.equal(c.statusCode, 200, c.body);
    const r = c.json() as { stok_kodu: string; surum: number };
    return { kimlik, kod: r.stok_kodu, surum: r.surum };
  }

  before(async () => {
    ortam = await testVeritabaniKur('malzemelogoalma');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Alma', kullaniciAdi: 'lma-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'lma-yonetici', parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerez = String(c.headers['set-cookie']).split(';')[0] ?? '';
    const opId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Okuyucu', kullaniciAdi: 'lma-okuyucu', parola: PAROLA }));
    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('lmaokuyucu', 'Okuyucu')");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'sayfa.malzemeler' FROM rol WHERE kod = 'lmaokuyucu'");
    await vt().sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'lmaokuyucu') WHERE kisi_id = $1", [opId]);
    const o = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'lma-okuyucu', parola: PAROLA } });
    assert.equal(o.statusCode, 200, o.body);
    okuyucuCerezi = String(o.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  // Bağ kurulmadan önceki test (LMA-3) önce koşar; sonra sahte ayna bağlanır (kablolama'nın bağladığı logo yerine).
  const baglaCozuculeri = (): void => {
    logoKartAynasiCozucusu(async (_db, o) => ayna
      .filter((k) => k.logoKayitNo > o.sonra && (o.kodlar === undefined || o.kodlar.includes(k.kod)))
      .sort((a, b) => a.logoKayitNo - b.logoKayitNo).slice(0, o.sinir));
    logoEslemeYaziciCozucusu(async (_db, e) => { yazilanEslemeler.push(e); eslemeler.set(e.logoKodu, e.stokKodu); });
    logoTmiKodCozucusu(async (_db, kodlar) => new Map([...eslemeler].filter(([l]) => kodlar.includes(l))));
  };

  test('LMA-3 bağ kurulmamışken liste boş ve "bağlı değil" der; alma reddedilir, kart açılmaz', async () => {
    assert.deepEqual(await liste(), { baglanti: false, kartlar: [], sonraki: null });
    const c = await istek('POST', '/malzeme-logo-kartlari/1/al', { tur: 'hammadde', birim: 'kg', onek: null });
    assert.equal(c.statusCode, 422, c.body);
    assert.match(c.body, /bağlı değil/);
    assert.equal(await vt().tek("SELECT 1 FROM malzeme_katalog_karti WHERE kimlik LIKE 'logo-%'"), null);
  });

  test('LMA-4 uyan kod aynı koduyla taslak açılır, Logo\'da gönderilmiş sayılır, eşleme yazılmaz; sayaç ilerler, aktif olunca kuyruğa girmez', async () => {
    baglaCozuculeri();
    ayna.push(kart(101, 'HM-LGA-00007', { ad: 'Logo mil', aciklama2: 'Iki', aciklama3: 'Uc' }));
    const l = await liste();
    assert.equal(l.baglanti, true);
    assert.deepEqual(l.kartlar.map((k) => [k.kod, k.durum, k.koduUyar, k.kartTuru]), [['HM-LGA-00007', 'yeni', true, '10']]);
    const c = await istek('POST', '/malzeme-logo-kartlari/101/al', { tur: 'hammadde', birim: 'kg', onek: null });
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(c.json(), { id: 'logo-101', stok_kodu: 'HM-LGA-00007', eslendi: false });
    const s = await kartSatiri('logo-101');
    assert.deepEqual({ ...s, surum: undefined }, {
      kod: 'HM-LGA-00007', durum: 'taslak', logo: '101', gonderim: 'gonderildi', tur: '10', set: '06', a1: 'Logo mil', a2: 'Iki', guncelleme: null, surum: undefined,
    });
    assert.deepEqual(yazilanEslemeler, []);
    assert.equal((await taslakAc('HM-LGA-00001')).kod, 'HM-LGA-00008', 'TMI aynı numarayı bir daha vermez');
    // Döngü önlemi: kart aktif olunca gönderim durumu "gonderildi" kalır (tetikleyici "bekliyor" yapmaz).
    await vt().sorgu("UPDATE malzeme_katalog_karti SET onay_durumu = 'aktif' WHERE kimlik = 'logo-101'");
    assert.equal((await kartSatiri('logo-101'))?.gonderim, 'gonderildi');
    assert.equal((await liste()).kartlar[0]?.durum, 'bagli');
    const ikinci = await istek('POST', '/malzeme-logo-kartlari/101/al', { tur: 'hammadde', birim: 'kg', onek: null });
    assert.equal(ikinci.statusCode, 409, 'aynı Logo kartı iki kez alınmaz');
  });

  test('LMA-5 uymayan kod: önek istenir; önekle yeni TMI kodu ve eşleme yazılır; türe uymayan önek ve listede olmayan birim reddedilir', async () => {
    ayna.push(kart(102, '150.01.0003', { ad: null }));
    assert.equal((await liste('?kod=150.01.0003')).kartlar[0]?.koduUyar, false);
    const onekYok = await istek('POST', '/malzeme-logo-kartlari/102/al', { tur: 'sarf', birim: 'kg', onek: null });
    assert.equal(onekYok.statusCode, 400, onekYok.body);
    assert.equal((onekYok.json() as { alan?: string }).alan, 'onek');
    assert.equal((await istek('POST', '/malzeme-logo-kartlari/102/al', { tur: 'sarf', birim: 'kg', onek: 'HM-GEN-' })).statusCode, 400, 'türe uymayan önek');
    assert.equal((await istek('POST', '/malzeme-logo-kartlari/102/al', { tur: 'sarf', birim: 'yok-birim', onek: 'SF-GEN-' })).statusCode, 400, 'birim listede yok');
    const c = await istek('POST', '/malzeme-logo-kartlari/102/al', { tur: 'sarf', birim: 'kg', onek: 'SF-GEN-' });
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(c.json(), { id: 'logo-102', stok_kodu: 'SF-GEN-00001', eslendi: true });
    assert.deepEqual(yazilanEslemeler, [{ stokKodu: 'SF-GEN-00001', logoKodu: '150.01.0003', logoKayitNo: 102 }]);
    // Adı olmayan Logo kartı koduyla adlanır; liste eşleme üzerinden bağlı gösterir.
    assert.equal((await vt().tek<{ ad: string }>("SELECT kayit -> 'com' ->> 'ad' AS ad FROM malzeme_katalog_karti WHERE kimlik = 'logo-102'"))?.ad, '150.01.0003');
    assert.equal((await liste('?kod=150.01.0003')).kartlar[0]?.durum, 'bagli');
  });

  test('LMA-6 aynı kodlu bağsız kart bağlanır (yeni kart açılmaz, sürüm denetlenir); bağlı kartta fark listelenir, Logo\'dakini almak açıklamaları yazar, ad güncellemesi kuyruğa girmez', async () => {
    const t = await taslakAc('HM-BAG-00001');
    ayna.push(kart(103, t.kod, { ad: 'Logo adi', aciklama2: 'Logo iki' }));
    const once = (await liste(`?kod=${t.kod}`)).kartlar[0]!;
    assert.equal(once.durum, 'bagsiz');
    assert.equal(once.tmi?.kimlik, t.kimlik);
    assert.equal((await istek('POST', '/malzeme-logo-kartlari/103/al', { tur: 'hammadde', birim: 'kg', onek: null })).statusCode, 409, 'yeni kart açılmaz, bağlanır');
    assert.equal((await istek('POST', '/malzeme-logo-kartlari/103/bagla', { surum: t.surum + 5 })).statusCode, 409, 'eski sürüm');
    const b = await istek('POST', '/malzeme-logo-kartlari/103/bagla', { surum: t.surum });
    assert.equal(b.statusCode, 200, b.body);
    const s = await kartSatiri(t.kimlik);
    assert.equal(s?.logo, '103');
    assert.equal(s?.gonderim, 'gonderildi');
    assert.equal((await istek('POST', '/malzeme-logo-kartlari/103/bagla', { surum: s!.surum })).statusCode, 409, 'ikinci bağlama yok');
    const sonra = (await liste(`?kod=${t.kod}`)).kartlar[0]!;
    assert.equal(sonra.durum, 'bagli');
    assert.deepEqual(sonra.farklar.map((f) => [f.alan, f.logo]), [['aciklama_1', 'Logo adi'], ['aciklama_2', 'Logo iki']]);
    const f = await istek('POST', '/malzeme-logo-kartlari/103/farki-al', { surum: s!.surum });
    assert.equal(f.statusCode, 200, f.body);
    const son = await kartSatiri(t.kimlik);
    assert.deepEqual([son?.a1, son?.a2, son?.guncelleme], ['Logo adi', 'Logo iki', null]);
    assert.deepEqual((await liste(`?kod=${t.kod}`)).kartlar[0]?.farklar, []);
  });

  test('LMA-7 Logo\'da kullanım dışı kart alınmaz; aynada olmayan kart 404; okuyucu listeyi görür ama alamaz, bağlayamaz', async () => {
    ayna.push(kart(104, 'HM-PSF-00001', { aktif: false }));
    assert.equal((await istek('POST', '/malzeme-logo-kartlari/104/al', { tur: 'hammadde', birim: 'kg', onek: null })).statusCode, 422);
    assert.equal((await istek('POST', '/malzeme-logo-kartlari/999/al', { tur: 'hammadde', birim: 'kg', onek: null })).statusCode, 404);
    ayna.push(kart(105, 'HM-OKU-00001'));
    assert.equal((await istek('GET', '/malzeme-logo-kartlari', undefined, okuyucuCerezi)).statusCode, 200);
    assert.equal((await istek('POST', '/malzeme-logo-kartlari/105/al', { tur: 'hammadde', birim: 'kg', onek: null }, okuyucuCerezi)).statusCode, 403);
    assert.equal((await istek('POST', '/malzeme-logo-kartlari/105/bagla', { surum: 1 }, okuyucuCerezi)).statusCode, 403);
    assert.equal(await vt().tek("SELECT 1 FROM malzeme_katalog_karti WHERE kimlik IN ('logo-104', 'logo-105', 'logo-999')"), null);
  });
});
