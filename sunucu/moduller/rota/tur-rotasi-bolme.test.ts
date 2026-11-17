import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { AdimGirdisi, KomutCevabi, SeceneklerCevabi } from '#paylasilan/sozlesme/rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { turunRotasiDegilIletisi } from './kurallar.ts';

const BOLME_ADET_RE = /Bölünen adet 1 ile elde kalan adedin bir eksiği arasında olmalı/;

// 3296: emir türü rotası. Siparişte aynı türden birden çok parti ve partiye elle rota (3296-3 a); farklı rotalı türe bölme, emirde adım
// başlamadıysa o türün rotasıyla ayrı emir açar, başladıysa reddedilir (3296-2 a). Veriler uydurmadır (ORN- kodlu).
const PAROLA = 'dogru-parola-1';
interface Hata { kod: string; mesaj: string }
interface Rotalar { rotalar: { id: number; ad: string; standart: boolean; surum: number }[] }
interface Emir { id: number; parti: number | null; tur: string; adet: number; kaynak: number | null; ust: number | null; proje: number | null; satir: number | null; surum: number }

describe('emir türü rotası: parti ve bölme (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let firmaId = 0;
  let makine = 0;
  let tipId = 0;
  let hammadde = 0;
  let sayac = 0;
  const c = { yazan: '', onayci: '' };

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const tek = async (sql: string, p: unknown[] = []): Promise<number> => (await o().sahip.tek<{ id: number }>(sql, p))!.id;
  const istek = (cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method: yontem, url: `/api${url}`, payload: payload as object | undefined, headers: { cookie: cerez, ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) } });
  async function tamam<T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown): Promise<T> {
    const r = await istek(cerez, yontem, url, payload);
    assert.equal(r.statusCode, 200, `${yontem} ${url}: ${r.body}`);
    return r.json();
  }
  async function giris(kullaniciAdi: string): Promise<string> {
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(g.statusCode, 200, g.body);
    return String(g.headers['set-cookie']).split(';')[0] ?? '';
  }
  const kart = async (tur: 'mamul' | 'hammadde'): Promise<number> => {
    sayac += 1;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'ORN-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`ornte-${sayac}`, tur, sayac, JSON.stringify({ id: `ornte-${sayac}`, com: { ad: 'Deneme malzeme' } }), yoneticiId]))!.no;
  };
  const adim = (): AdimGirdisi => ({
    opNo: null, operasyonTipiId: tipId, ad: 'Deneme adım', kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: 30, birimSureDk: 2,
    bagimlilik: 'bekleyen', devirAdedi: null, firePayiYuzde: 0, makineKullanimi: 'tek', enKucukParca: null, yenidenAyar: true,
    adaylar: [], bilesenler: [{ malzemeId: hammadde, miktar: 1, fireYuzde: 0 }], yanUrunler: [],
  });
  async function yururlugeAl(urun: number, adimSayisi: number, rotaId?: number): Promise<number> {
    const { id } = await tamam<KomutCevabi>(c.yazan, 'POST', `/rota/urunler/${urun}/taslak-ac`, { kaynak: { tur: 'bos' }, ...(rotaId ? { rotaId } : {}) });
    const k = await tamam<KomutCevabi>(c.yazan, 'POST', `/rota/revizyonlar/${id}/kaydet`, { surum: 1, aciklama: null, adimlar: Array.from({ length: adimSayisi }, adim) });
    const g = await tamam<KomutCevabi>(c.yazan, 'POST', `/rota/revizyonlar/${id}/onaya-gonder`, { surum: k.surum });
    await tamam(c.onayci, 'POST', `/rota/revizyonlar/${id}/onayla`, { surum: g.surum, yururlugeAl: true });
    return id;
  }
  // Standart rota iki adımlı, FAI rotası üç adımlı: hangi revizyonun emre girdiği adım sayısından da okunur. Rota ilk türüyle açılır
  // (3411 a; adı türün adı), öteki türler eşleme ucuyla bağlanır.
  async function ikiRotaliUrun(turler: readonly string[] = ['fai']): Promise<{ urun: number; standart: number; fai: number; faiRota: number }> {
    const urun = await kart('mamul');
    const standart = await yururlugeAl(urun, 2);
    const r = await tamam<Rotalar>(c.yazan, 'POST', `/rota/urunler/${urun}/rotalar`, { emirTuru: turler[0] });
    const faiRota = r.rotalar.find((x) => !x.standart)!;
    if (turler.length > 1) await tamam(c.onayci, 'POST', `/rota/urunler/${urun}/rotalar/${faiRota.id}/turler`, { emirTurleri: turler, surum: faiRota.surum });
    const fai = await yururlugeAl(urun, 3, faiRota.id);
    return { urun, standart, fai, faiRota: faiRota.id };
  }
  const siparisOnayla = async (malzemeNo: number, partiler: readonly { tur: string; adet: number; rotaId?: number }[]): Promise<number> => {
    sayac += 1;
    const id = await tek(
      `INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id)
       VALUES ($1, 'taslak', $2, current_date, current_date + 30, 20, $3) RETURNING id`, [`ORN-TR-${sayac}`, firmaId, yoneticiId]);
    const miktar = partiler.reduce((t, p) => t + p.adet, 0);
    const satir = await tek('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 1, $2, $3, 5) RETURNING id', [id, malzemeNo, miktar]);
    for (const [i, p] of partiler.entries()) {
      await o().sahip.sorgu('INSERT INTO siparisler_siparis_satiri_parti (satir_id, sira, emir_turu, adet, rota_id) VALUES ($1, $2, $3, $4, $5)',
        [satir, i + 1, p.tur, p.adet, p.rotaId ?? null]);
    }
    await tamam(c.yazan, 'POST', `/siparisler/${id}/onayla`, { surum: 1 });
    return satir;
  };
  const SECIM = `SELECT e.id, e.siparis_parti_id AS parti, e.emir_turu AS tur, e.adet, e.kaynak_rota_revizyonu_id AS kaynak, e.ust_emir_id AS ust,
                        e.proje_id AS proje, e.siparis_satiri_id AS satir, e.surum FROM uretim_emri e`;
  const emirler = async (satir: number): Promise<Emir[]> =>
    o().sahip.sorgu<Emir>(`${SECIM} WHERE e.siparis_satiri_id = $1 ORDER BY e.id`, [satir]);
  const emir = async (id: number): Promise<Emir> => (await o().sahip.tek<Emir>(`${SECIM} WHERE e.id = $1`, [id]))!;
  const bol = (id: number, g: { adet: number; emirTuru: string; surum: number; birlesmeOpNo?: number }) =>
    istek(c.yazan, 'POST', `/adimli-emirler/${id}/bol`, { adimSira: 1, ...g });

  before(async () => {
    ortam = await testVeritabaniKur('rota_tur_bolme');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Onaycı', kullaniciAdi: 'onayci', parola: PAROLA }));
    c.yazan = await giris('yonetici');
    c.onayci = await giris('onayci');
    firmaId = await tek("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri', 'musteri', $1) RETURNING id", [yoneticiId]);
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('ORN-', 0) ON CONFLICT (onek) DO NOTHING");
    const merkez = await tamam<{ id: number }>(c.yazan, 'POST', '/is-merkezleri', { kod: 'ORN-IM', ad: 'Deneme merkez', aciklama: null });
    const istasyon = (await tamam<{ id: number }>(c.yazan, 'POST', '/istasyonlar', { kod: 'ORN-I', ad: 'Deneme istasyon', isMerkeziId: merkez.id })).id;
    makine = (await tamam<{ id: number }>(c.yazan, 'POST', '/makineler', { kod: 'ORN-M', ad: 'Deneme makine', istasyonId: istasyon })).id;
    const tipler = (await tamam<SeceneklerCevabi>(c.yazan, 'GET', '/rota/secenekler')).operasyonTipleri;
    tipId = (tipler.find((t) => t.kod === 'TRN') ?? tipler[0])!.id;
    hammadde = await kart('hammadde');
  });
  after(async () => { await ortam?.kaldir(); });

  test('3296-3 a: aynı türden iki parti iki emir açar; elle rotası verilen parti o rotayla, verilmeyen türün rotasıyla açılır', async () => {
    const { urun, standart, fai, faiRota } = await ikiRotaliUrun();
    const satir = await siparisOnayla(urun, [{ tur: 'seri', adet: 4 }, { tur: 'seri', adet: 6, rotaId: faiRota }, { tur: 'fai', adet: 2 }]);
    const e = await emirler(satir);
    assert.deepEqual(e.map((x) => [x.tur, x.adet, x.kaynak]), [['seri', 4, standart], ['seri', 6, fai], ['fai', 2, fai]]);
    assert.equal(new Set(e.map((x) => x.parti)).size, 3);
  });

  test('3296-2 a: başlamamış Seri emirden FAI partisi FAI rotasıyla ayrı emir açılır; ana emrin adedi düşer', async () => {
    const { urun, fai } = await ikiRotaliUrun();
    const satir = await siparisOnayla(urun, [{ tur: 'seri', adet: 10 }]);
    const ana = (await emirler(satir))[0]!;
    const r = await bol(ana.id, { adet: 3, emirTuru: 'fai', surum: ana.surum });
    assert.equal(r.statusCode, 200, r.body);
    const cevap = r.json<{ altEmirId: number; ayriEmir: boolean }>();
    assert.equal(cevap.ayriEmir, true);
    const yeni = await emir(cevap.altEmirId);
    assert.deepEqual([yeni.tur, yeni.adet, yeni.kaynak, yeni.ust, yeni.proje, yeni.satir], ['fai', 3, fai, null, ana.proje, satir]);
    const adim = (await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1', [yeni.id]))!.n;
    assert.equal(adim, 3);
    assert.equal((await emir(ana.id)).adet, 7);
  });

  test('3296-2 a: aynı rotalı türe bölme bugünkü gibi kol açar', async () => {
    const { urun, standart } = await ikiRotaliUrun();
    const satir = await siparisOnayla(urun, [{ tur: 'seri', adet: 10 }]);
    const ana = (await emirler(satir))[0]!;
    const r = await bol(ana.id, { adet: 2, emirTuru: 'numune', surum: ana.surum });
    assert.equal(r.statusCode, 200, r.body);
    const cevap = r.json<{ altEmirId: number; ayriEmir: boolean }>();
    const kol = await emir(cevap.altEmirId);
    assert.deepEqual([cevap.ayriEmir, kol.tur, kol.kaynak, kol.ust], [false, 'numune', standart, ana.id]);
  });

  test('3296-2 a: adımı başlamış emirden farklı rotalı türe bölme reddedilir, adet değişmez', async () => {
    const { urun } = await ikiRotaliUrun();
    const satir = await siparisOnayla(urun, [{ tur: 'seri', adet: 10 }]);
    const ana = (await emirler(satir))[0]!;
    await o().sahip.sorgu(
      `UPDATE uretim_emirleri_is_emri SET durum = 'calisiyor', baslama = now()
        WHERE id = (SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY sira DESC LIMIT 1)`, [ana.id]);
    const r = await bol(ana.id, { adet: 3, emirTuru: 'fai', surum: ana.surum });
    assert.equal(r.statusCode, 409, r.body);
    assert.match(r.json<Hata>().mesaj, /FAI türünün rotası bu emrinkinden farklı ve bu emirde adım başladı; FAI partisini yeni emir olarak açın/);
    assert.equal((await emir(ana.id)).adet, 10);
  });

  test('Risk K1: ana emre stoktan malzeme ayrılmışsa farklı rotalı türe bölme reddedilir, adet ve rezerve değişmez', async () => {
    const { urun } = await ikiRotaliUrun();
    const satir = await siparisOnayla(urun, [{ tur: 'seri', adet: 10 }]);
    const ana = (await emirler(satir))[0]!;
    await o().sahip.sorgu('INSERT INTO stok_rezerve (malzeme_id, uretim_emri_id, miktar) VALUES ($1, $2, 10)', [hammadde, ana.id]);
    const r = await bol(ana.id, { adet: 3, emirTuru: 'fai', surum: ana.surum });
    assert.equal(r.statusCode, 409, r.body);
    assert.match(r.json<Hata>().mesaj, /Bu emre stoktan malzeme ayrılmış; FAI partisi ayrı emir olarak ayrılırsa/);
    assert.equal((await emir(ana.id)).adet, 10);
    assert.equal((await emirler(satir)).length, 1);
  });

  test('Test T3: partide başka ürünün rotası ya da yürürlükte revizyonu olmayan rota elle seçildiyse parti türün rotasına düşer', async () => {
    const { urun, standart } = await ikiRotaliUrun();
    const baska = await ikiRotaliUrun();
    const r = await tamam<Rotalar>(c.yazan, 'POST', `/rota/urunler/${urun}/rotalar`, { emirTuru: 'numune' });
    const taslak = r.rotalar.find((x) => x.ad === 'Numune')!;
    const satir = await siparisOnayla(urun, [{ tur: 'seri', adet: 4, rotaId: baska.faiRota }, { tur: 'seri', adet: 6, rotaId: taslak.id }]);
    assert.deepEqual((await emirler(satir)).map((x) => [x.tur, x.adet, x.kaynak]), [['seri', 4, standart], ['seri', 6, standart]]);
  });

  test('Test T2: farklı rotalı türe kol ile bölme reddedilir (yeni emir olarak açılır)', async () => {
    const { urun } = await ikiRotaliUrun();
    const satir = await siparisOnayla(urun, [{ tur: 'seri', adet: 10 }]);
    const ana = (await emirler(satir))[0]!;
    const r = await bol(ana.id, { adet: 3, emirTuru: 'fai', surum: ana.surum, birlesmeOpNo: 20 });
    assert.equal(r.statusCode, 409, r.body);
    assert.match(r.json<Hata>().mesaj, /FAI türünün rotası bu emrinkinden farklı; kol ya da ek adımla ayrılmaz/);
    assert.deepEqual([(await emir(ana.id)).adet, (await emirler(satir)).length], [10, 1]);
  });

  test('3411 a: türün rotası yürürlükte değilse parti Seri rotasında kalır; bölme kol açar, sipariş açılışı Seri ile açar', async () => {
    const urun = await kart('mamul');
    const standart = await yururlugeAl(urun, 2);
    await tamam<Rotalar>(c.yazan, 'POST', `/rota/urunler/${urun}/rotalar`, { emirTuru: 'fai' });
    const satir = await siparisOnayla(urun, [{ tur: 'seri', adet: 10 }, { tur: 'fai', adet: 2 }]);
    const [ana, faiEmri] = await emirler(satir);
    assert.deepEqual([faiEmri!.tur, faiEmri!.kaynak], ['fai', standart]);
    const b = await bol(ana!.id, { adet: 3, emirTuru: 'fai', surum: ana!.surum });
    assert.equal(b.statusCode, 200, b.body);
    const kol = await emir(b.json<{ altEmirId: number }>().altEmirId);
    assert.deepEqual([b.json<{ ayriEmir: boolean }>().ayriEmir, kol.tur, kol.kaynak, kol.ust], [false, 'fai', standart, ana!.id]);
  });

  test('Test T2: ayrı emir yolunda emrin tüm adedi bölünemez', async () => {
    const { urun } = await ikiRotaliUrun();
    const satir = await siparisOnayla(urun, [{ tur: 'seri', adet: 10 }]);
    const ana = (await emirler(satir))[0]!;
    const b = await bol(ana.id, { adet: 10, emirTuru: 'fai', surum: ana.surum });
    assert.notEqual(b.statusCode, 200, b.body);
    assert.match(b.body, BOLME_ADET_RE);
    assert.deepEqual([(await emir(ana.id)).adet, (await emirler(satir)).length], [10, 1]);
  });

  // Proje istemeyen tür (stok) ile: rota stoğa üretim türüyle açılır.
  test('Risk N2: tek emir ucu türe bağlı rotası olan emri Standart revizyondan açmaz; rota elle seçildiyse açar', async () => {
    const { standart, fai } = await ikiRotaliUrun(['stok']);
    const govde = { adet: 2, teslim: null, emirTuru: 'stok' };
    const red = await istek(c.yazan, 'POST', `/rota/revizyonlar/${standart}/emre-kopyala`, govde);
    assert.deepEqual([red.statusCode, red.json<Hata>().mesaj], [409, turunRotasiDegilIletisi('Stoğa üretim', 'Stoğa üretim')]);
    await tamam(c.yazan, 'POST', `/rota/revizyonlar/${standart}/emre-kopyala`, { ...govde, rotaElle: true });
    await tamam(c.yazan, 'POST', `/rota/revizyonlar/${fai}/emre-kopyala`, govde);
    const seri = await istek(c.yazan, 'POST', `/rota/revizyonlar/${fai}/emre-kopyala`, { adet: 2, teslim: null });
    assert.equal(seri.statusCode, 409, seri.body);
  });
});
