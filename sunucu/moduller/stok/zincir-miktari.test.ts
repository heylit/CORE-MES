import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';
import { emirlerinNetSarfi, emirlerinZincirdekiMiktari } from './disari.ts';
import { adimStatusuCozucusuKaydet, emirBirlestiYansit, uretimSayimiYansit } from './servis.ts';

// B-2482-8 (2527-1): ilk adımın statüye çevirdiği hammadde emrin zincirinde sayılır; net sarfla toplamı emre verilendir. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
const ROL_ISLEMLERI: Record<string, string[]> = { depo: ['stok.giris', 'stok.transfer', 'stok.istek', 'stok.toplama'], operator: ['stok.istek'] };

describe('stok: emrin statü zincirindeki miktarı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();
  let projeId = 0;
  let sira = 0;
  // Emrin kaynak rotası gerçek bir revizyondur; ürün başına bir kez, iptal durumunda açılır.
  const revizyonlar = new Map<number, number>();
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<{ durum: number; govde: T }> {
    const baslik = { cookie: cerezler.get(kim) ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: baslik, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function giris(ad: string): Promise<void> {
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerezler.set(ad, String(g.headers['set-cookie']).split(';')[0] ?? '');
  }
  async function kisiEkle(ad: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [ad]);
    const yonetici = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    kisiler.set(ad, await o().vt.tx(async (db) => {
      const y = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
      await rolAta(db, kisiler.get('yonetici')!, y, rol!.id);
      await rolAl(db, kisiler.get('yonetici')!, y, yonetici!.id);
      return y;
    }));
    await giris(ad);
  }
  async function kart(tur: 'hammadde' | 'yarimamul'): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['BIS-DNM-']);
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'BIS-DNM-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`bis-dnm-${sira}`, tur, sira, JSON.stringify({ id: `bis-dnm-${sira}`, com: { ad: `İstek deneme ${sira}`, birim: 'kg' } }), kisiler.get('yonetici')],
    ))!.no;
  }
  async function istasyon(): Promise<{ id: number; makine: number }> {
    sira += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`BIM${sira}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`BIS${sira}`, `Deneme istasyon ${sira}`, im!.id]);
    await o().sahip.sorgu("INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi WHERE kullanici_adi = 'operator'", [ist!.id]);
    const makine = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`BM-${ist!.id}`, 'Tezgah', ist!.id]);
    return { id: ist!.id, makine: makine!.id };
  }
  // İki adımlı emir; OP 10'un bileşeni adet başına 1 kg, kopyada fire payıyla.
  async function emir(ym: number, hm: number, a: number, b: number, adet: number, fireYuzde: string): Promise<number> {
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`BIS${String(++sira)}`]))!.id;
    const adim = (s: number, makine: number, bilesenler: { malzemeNo: number; miktar: string; fireYuzde?: string }[]): IsEmriGirdisi => ({
      sira: s, opNo: s * 10, ad: `Adım ${s}`, operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler,
    });
    const rev = revizyonlar.get(ym) ?? (await o().sahip.tek<{ id: number }>(
      `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
       SELECT $1, 'yarimamul', 'ZZ', 'iptal', p.id, p.id, now() FROM (SELECT min(id) AS id FROM kisi) p RETURNING id`, [ym]))!.id;
    revizyonlar.set(ym, rev);
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    return (await o().vt.tx((db) => uretimEmriAc(db, planlamaci, {
      projeId, malzemeNo: ym, adet, teslim: null, kaynakRotaRevizyonId: rev,
      isEmirleri: [adim(1, a, [{ malzemeNo: hm, miktar: '1', fireYuzde }]), adim(2, b, [])],
    }))).uretimEmriId;
  }
  const sayim = (e: number, isEmriId: number, istasyonId: number, fark: string) =>
    o().vt.tx((db) => uretimSayimiYansit(db, { uretimEmriId: e, isEmriId, istasyonId, kisiId: kisiler.get('operator')!, fark }));
  const kabulKonumu = async (): Promise<number> => (await o().vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
  const malKabul = async (malzemeId: number, miktar: string): Promise<void> => {
    const c = await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId, miktar }] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
  };

  before(async () => {
    ortam = await testVeritabaniKur('stok_zincir');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiler.set('yonetici', await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA })));
    await giris('yonetici');
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('STOK.ZNC', 'Deneme proje', $1) RETURNING id", [kisiler.get('yonetici')]))!.id;
    for (const [rol, islemler] of Object.entries(ROL_ISLEMLERI)) {
      const r = await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]);
      for (const i of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r!.id, i]);
    }
    for (const rol of ['depo', 'operator', 'planlama_proje']) await kisiEkle(rol);
  });
  after(async () => { adimStatusuCozucusuKaydet(async () => null); await ortam?.kaldir(); });

  const miktar = async (f: (db: Parameters<typeof emirlerinNetSarfi>[0], idler: number[]) => Promise<{ malzemeId: number; miktar: string }[]>, e: number, hm: number): Promise<number> =>
    Number((await o().vt.tx((db) => f(db, [e]))).find((x) => x.malzemeId === hm)?.miktar ?? 0);

  test('OP 10 çevirince zincirde 6, net sarf 4 (elle): toplam 10; OP 20 statüden sarf edince zincir 0, net sarf 10', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const a = await istasyon();
    const e = await emir(ym, hm, a.makine, a.makine, 10, '0');
    const [op10, op20] = (await o().vt.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY op_no', [e])).map((x) => x.id);
    const s10 = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('HM', 'OP 10', $1, '#2F6FDE', 'HM') RETURNING id", [`zincir-${randomBytes(4).toString('hex')}`]))!.id;
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym && g.opNo === 10 ? s10 : null));
    await malKabul(hm, '10');
    const sarf = await istek('yonetici', 'POST', '/stok/cikis', { malzemeId: hm, konumId: await kabulKonumu(), miktar: '4', cikisNedeni: 'uretime_sarf', uretimEmriId: e });
    assert.equal(sarf.durum, 200, JSON.stringify(sarf.govde));
    assert.deepEqual([await miktar(emirlerinZincirdekiMiktari, e, hm), await miktar(emirlerinNetSarfi, e, hm)], [0, 4]);
    await sayim(e, op10!, a.id, '10');
    assert.deepEqual([await miktar(emirlerinZincirdekiMiktari, e, hm), await miktar(emirlerinNetSarfi, e, hm)], [6, 4], 'OP 10 sonrası: verilen 10');
    await sayim(e, op20!, a.id, '10');
    assert.deepEqual([await miktar(emirlerinZincirdekiMiktari, e, hm), await miktar(emirlerinNetSarfi, e, hm)], [0, 10], 'son adım sonrası: verilen yine 10');
  });

  test('sayım geri alınınca (eksi sayım) zincirden çıkar', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const a = await istasyon();
    const e = await emir(ym, hm, a.makine, a.makine, 10, '0');
    const [op10] = (await o().vt.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY op_no', [e])).map((x) => x.id);
    const s10 = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('HM', 'OP 10', $1, '#2F6FDE', 'HM') RETURNING id", [`zincir-${randomBytes(4).toString('hex')}`]))!.id;
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym && g.opNo === 10 ? s10 : null));
    await malKabul(hm, '10');
    await sayim(e, op10!, a.id, '10');
    assert.equal(await miktar(emirlerinZincirdekiMiktari, e, hm), 10);
    await sayim(e, op10!, a.id, '-10');
    assert.equal(await miktar(emirlerinZincirdekiMiktari, e, hm), 0);
  });

  test('2534: parti birleşince zincir hedef emre geçer (amir bekleyen yarı mamulü acil emre alır); kaynak emirde kalmaz', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const a = await istasyon();
    const kaynak = await emir(ym, hm, a.makine, a.makine, 10, '0');
    const hedef = await emir(ym, hm, a.makine, a.makine, 10, '0');
    const [op10] = (await o().vt.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY op_no', [kaynak])).map((x) => x.id);
    const s10 = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('HM', 'OP 10', $1, '#2F6FDE', 'HM') RETURNING id", [`zincir-${randomBytes(4).toString('hex')}`]))!.id;
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym && g.opNo === 10 ? s10 : null));
    await malKabul(hm, '10');
    await sayim(kaynak, op10!, a.id, '10');
    assert.deepEqual([await miktar(emirlerinZincirdekiMiktari, kaynak, hm), await miktar(emirlerinZincirdekiMiktari, hedef, hm)], [10, 0]);
    await o().vt.tx((db) => emirBirlestiYansit(db, { uretimEmriId: kaynak, hedefEmirId: hedef, kisiId: kisiler.get('yonetici')! }));
    assert.deepEqual([await miktar(emirlerinZincirdekiMiktari, kaynak, hm), await miktar(emirlerinZincirdekiMiktari, hedef, hm)], [0, 10],
      'birleşmeden sonra statüdeki 10 kg hedef emrin zincirindedir');
  });

  test('2534: müdür rezerveyi kaldırınca zincir emirden çıkar; aynı ürünün başka emri statüdeki malzemeyi kullanırsa zinciri eksiye inmez, sarf onun net sarfıdır', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const a = await istasyon();
    const ilk = await emir(ym, hm, a.makine, a.makine, 10, '0');
    const ikinci = await emir(ym, hm, a.makine, a.makine, 10, '0');
    const opler = async (e: number) => (await o().vt.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY op_no', [e])).map((x) => x.id);
    const [op10] = await opler(ilk);
    const [, op20] = await opler(ikinci);
    const s10 = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('HM', 'OP 10', $1, '#2F6FDE', 'HM') RETURNING id", [`zincir-${randomBytes(4).toString('hex')}`]))!.id;
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym && g.opNo === 10 ? s10 : null));
    await malKabul(hm, '10');
    await sayim(ilk, op10!, a.id, '10');
    const k = await istek('yonetici', 'POST', '/stok/rezerve-kaldir', { malzemeId: hm, statuId: s10, uretimEmriId: ilk, neden: 'Deneme: acil emre verilecek' });
    assert.equal(k.durum, 200, JSON.stringify(k.govde));
    assert.equal(await miktar(emirlerinZincirdekiMiktari, ilk, hm), 0, 'kaldırılan ayrılan zincirden çıkar');
    await sayim(ikinci, op20!, a.id, '10');
    assert.deepEqual([await miktar(emirlerinZincirdekiMiktari, ikinci, hm), await miktar(emirlerinNetSarfi, ikinci, hm)], [0, 10], 'ikinci emrin zinciri eksi olmaz; 10 kg onun sarfı');
    const verilen = async (e: number) => await miktar(emirlerinZincirdekiMiktari, e, hm) + await miktar(emirlerinNetSarfi, e, hm);
    assert.equal(await verilen(ilk) + await verilen(ikinci), 10, 'iki emrin verileni toplamı ihtiyaç kadar (10 kg): çift sayım ve kayıp yok');
  });
});
