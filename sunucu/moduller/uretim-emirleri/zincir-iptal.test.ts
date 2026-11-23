import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { iptalOnizlemeCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { IptalOnizlemeCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirBaslat, emirIptalDinle, uretimEmriAc } from './disari.ts';
import { tedarikCozucusuKaydet } from './adim-durumu.ts';
import type { EmirTedarikSatiri } from './adim-durumu.ts';
import { altlariylaIptal } from './zincir-iptal.ts';
import type { IsEmriGirdisi } from './disari.ts';
import { ADIMLI_IPTAL_KOLLU, ZINCIR_LISTE_DEGISTI } from './kurallar.ts';

const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('3576 alt emirleriyle tek seferde iptal (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let projeId = 0;
  let tipId = 0;
  let urunNo = 0;
  let rev = 0;
  let sayac = 0;
  const cerezler = new Map<string, string>();
  const kullanicilar = new Map<string, Kullanici>();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const kim = (ad: string): Kullanici => {
    const k = kullanicilar.get(ad);
    if (k === undefined) throw new Error(`kişi yok: ${ad}`);
    return k;
  };
  const tx = <T>(is: (db: Db) => Promise<T>): Promise<T> => o().vt.tx(is);


  async function istek<T = unknown>(ad: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerezler.get(ad) ?? '', [ISTEK_KIMLIGI_BASLIGI]: randomUUID() };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: basliklar, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }

  // Roller K2'de tanımlanır; burada yalnız işlemleriyle deneme rolü kurulur.
  async function kisiEkle(kullaniciAdi: string, islemler: readonly string[], rolKodu?: string): Promise<void> {
    const rol = rolKodu
      ? await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu])
      : await o().sahip.tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`kp_${kullaniciAdi}`]);
    const yoneticiRolu = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol yok');
    for (const islem of islemler) await o().sahip.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol.id, islem]);
    const k = await tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, yeni, rol.id);
      await rolAl(db, yoneticiId, yeni, yoneticiRolu.id);
      return kullaniciYukle(db, yeni);
    });
    if (k === null) throw new Error('kullanıcı yüklenemedi');
    kullanicilar.set(kullaniciAdi, k);
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(giris.statusCode, 200);
    cerezler.set(kullaniciAdi, String(giris.headers['set-cookie']).split(';')[0] ?? '');
  }

  async function makine(tip = 'talasli'): Promise<number> {
    sayac += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`ARM${sayac}`, 'Deneme Merkezi']);
    const ist = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id, tip) VALUES ($1, $2, $3, $4) RETURNING id', [`ARI${sayac}`, `Deneme İstasyonu ${sayac}`, im?.id, tip]))!.id;
    await o().sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi ON CONFLICT DO NOTHING', [ist]);
    return (await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`ARMK${sayac}`, 'Tezgah', ist]))!.id;
  }

  const adim = (sira: number, m: number): IsEmriGirdisi => ({
    sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tipId, kaynak: { tur: 'makine', id: m },
    ayarSuresiDk: '10', birimSureDk: '1.5', terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
  });
  const ac = async (adet: number, makineler: number[]): Promise<{ id: number; adimlar: number[] }> => {
    const r = await tx((db) => uretimEmriAc(db, kim('planlama'), {
      malzemeNo: urunNo, adet, teslim: null, kaynakRotaRevizyonId: rev, isEmirleri: makineler.map((m, i) => adim(i + 1, m)), projeId,
    }));
    return { id: r.uretimEmriId, adimlar: r.isEmriIdleri };
  };
  const op = (): Kullanici => kim('operator');


  const onizle = async (id: number, ad = 'planlama'): Promise<IptalOnizlemeCevabi> => {
    const c = await istek(ad, 'GET', `/adimli-emirler/${id}/iptal-onizleme`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return iptalOnizlemeCevabi.parse(c.govde);
  };
  const iptal = (id: number, govde: Record<string, unknown>, ad = 'planlama'): Promise<Cevap<{ mesaj?: string }>> =>
    istek<{ mesaj?: string }>(ad, 'POST', `/adimli-emirler/${id}/iptal`, govde);
  const bol = async (id: number, adimSira: number, adet: number, ek: Record<string, unknown> = {}): Promise<number> => {
    const surum = (await onizle(id)).surum;
    const c = await istek<{ altEmirId: number }>('planlama', 'POST', `/adimli-emirler/${id}/bol`, { adimSira, adet, surum, ...ek });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.altEmirId;
  };
  const sayi = async (sql: string, id: number): Promise<number> => (await o().sahip.tek<{ n: number }>(sql, [id]))!.n;
  // Bölünen alt emrin adımları kaynaksız gelir; başlatılabilsin diye tezgah atanır.
  async function baslat(emirId: number): Promise<void> {
    const m = await makine();
    await o().sahip.sorgu(
      'UPDATE uretim_emirleri_is_emri SET makine_id = $2, istasyon_id = (SELECT istasyon_id FROM makine WHERE id = $2) WHERE uretim_emri_id = $1', [emirId, m]);
    await o().sahip.sorgu('UPDATE uretim_emri SET istasyon_id = (SELECT istasyon_id FROM makine WHERE id = $2) WHERE id = $1', [emirId, m]);
    await tx((db) => emirBaslat(db, op(), emirId));
  }
  const durumlar = async (idler: number[]): Promise<string[]> =>
    (await o().sahip.sorgu<{ id: number; durum: string }>('SELECT id, durum FROM uretim_emri WHERE id = ANY($1::int[]) ORDER BY id', [idler])).map((r) => r.durum);
  // Kök, parti (A), A'nın alt partisi (A1) ve ikinci adımdan kol (B): üç katlı ağaç.
  async function agac(): Promise<{ kok: number; a: number; a1: number; b: number; adimlar: number[] }> {
    const { id: kok, adimlar } = await ac(20, [await makine(), await makine()]);
    const a = await bol(kok, 1, 6);
    const a1 = await bol(a, 1, 2);
    const b = await bol(kok, 2, 4);
    return { kok, a, a1, b, adimlar };
  }

  before(async () => {
    ortam = await testVeritabaniKur('uretim_zincir_iptal');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('UE.ZINCIR', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    await kisiEkle('planlama', [], 'planlama_proje');
    await kisiEkle('operator', [], 'operator');
    await kisiEkle('planci', ['plan.canliya-al']);
    tipId = (await ortam.sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('AR-T', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    await ortam.sahip.sorgu("INSERT INTO hurda_nedeni (kod, ad, sira) VALUES ('AR-TK', 'Deneme takım kırılması', 900)");
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('AR-DNM-', 0) ON CONFLICT (onek) DO NOTHING");
    urunNo = (await ortam.sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('ar-dnm-1', 'mamul', 'AR-DNM-', 1, 'aktif', $1, $2, $2) RETURNING no`,
      [JSON.stringify({ id: 'ar-dnm-1', com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
    rev = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme) VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id",
      [urunNo, yoneticiId]))!.id;
    await makine('kalite');
  });
  after(async () => {
    await ortam?.kaldir();
  });

  test('önizleme: açık alt ağaç (torun dahil), tür, hazırlık görevi sayısı; alt emirsiz emirde liste boş', async () => {
    const { kok, a, a1, b } = await agac();
    await o().sahip.sorgu(
      `INSERT INTO projeler_gorev (proje_id, ad, plan_baslangic, plan_bitis, olusturan_id, hazirlik_maddesi, hazirlik_emri_id)
       VALUES ($1, 'CNC kurulumu', current_date, current_date + 3, $2, 'cnc', $3)`, [projeId, yoneticiId, a1]);
    const p = await onizle(kok);
    assert.deepEqual(p.altEmirler.map((x) => [x.id, x.tur, x.adet, x.durum, x.baslamis]), [[a, 'parti', 4, 'planli', false], [a1, 'parti', 2, 'planli', false], [b, 'kol', 4, 'planli', false]]);
    assert.equal(p.altEmirler.find((x) => x.id === a1)?.ustEmirNo, p.altEmirler.find((x) => x.id === a)?.emirNo);
    assert.equal(p.altEmirler.find((x) => x.id === a)?.ustEmirNo, null);
    assert.deepEqual([p.hazirlikGorevi, p.satinAlmaTalepleri, p.engel], [1, [], null]);
    const yalniz = await ac(3, [await makine()]);
    assert.deepEqual((await onizle(yalniz.id)).altEmirler, []);
  });

  test('alt emirleriyle iptal: kök ve bütün alt ağaç tek işlemde iptal, her emir için iptal olayı, hazırlık görevi aynı işlemde kapanır', async () => {
    const { kok, a, a1, b } = await agac();
    await o().sahip.sorgu(
      `INSERT INTO projeler_gorev (proje_id, ad, plan_baslangic, plan_bitis, olusturan_id, hazirlik_maddesi, hazirlik_emri_id)
       VALUES ($1, 'CNC kurulumu', current_date, current_date + 3, $2, 'cnc', $3)`, [projeId, yoneticiId, a1]);
    const p = await onizle(kok);
    const olaylar: number[] = [];
    const birak = emirIptalDinle((_db, olay) => { olaylar.push(olay.uretimEmriId); return Promise.resolve(); });
    try {
      const r = await iptal(kok, { surum: p.surum, altlariyla: true, altEmirIdleri: p.altEmirler.map((x) => x.id) });
      assert.equal(r.durum, 200, JSON.stringify(r.govde));
    } finally {
      birak();
    }
    assert.deepEqual(await durumlar([kok, a, a1, b]), ['iptal', 'iptal', 'iptal', 'iptal']);
    assert.deepEqual([...olaylar].sort((x, y) => x - y), [kok, a, a1, b].sort((x, y) => x - y));
    assert.equal(olaylar.at(-1), kok, 'yapraklar önce, kök en son');
    assert.equal(await sayi("SELECT count(*)::int AS n FROM projeler_gorev WHERE hazirlik_emri_id = $1 AND durum = 'iptal'", a1), 1);
  });

  test('bir alt emir başlamışsa hiçbiri iptal olmaz; ret başlamış alt emirlerin hepsini adlandırır, önizleme aynı engeli verir', async () => {
    const { kok, a, a1, b } = await agac();
    await baslat(a1);
    await baslat(a);
    const p = await onizle(kok);
    assert.deepEqual(p.altEmirler.filter((x) => x.baslamis).map((x) => x.id), [a, a1]);
    const nolar = p.altEmirler.filter((x) => x.baslamis).map((x) => x.emirNo).join(', ');
    assert.match(p.engel ?? '', new RegExp(`^2 alt emir başlamış: ${nolar}\\.`));
    const r = await iptal(kok, { surum: p.surum, altlariyla: true, altEmirIdleri: p.altEmirler.map((x) => x.id) });
    assert.equal(r.durum, 409, JSON.stringify(r.govde));
    assert.equal(r.govde.mesaj, p.engel);
    assert.deepEqual(await durumlar([kok, a, a1, b]).then((d) => d.filter((x) => x === 'iptal')), []);
  });

  test('pencere açıkken araya alt emir girdiyse ya da liste eksikse 409; kısmi iptal yok', async () => {
    const { kok, a, a1, b } = await agac();
    const p = await onizle(kok);
    const gorulen = p.altEmirler.map((x) => x.id);
    const yeni = await bol(kok, 1, 3);
    const r = await iptal(kok, { surum: (await onizle(kok)).surum, altlariyla: true, altEmirIdleri: gorulen });
    assert.equal(r.durum, 409, JSON.stringify(r.govde));
    assert.equal(r.govde.mesaj, ZINCIR_LISTE_DEGISTI);
    assert.deepEqual(await durumlar([kok, a, a1, b, yeni]), ['planli', 'planli', 'planli', 'planli', 'planli']);
    const eksik = await iptal(kok, { surum: (await onizle(kok)).surum, altlariyla: true, altEmirIdleri: [a, b, yeni] });
    assert.equal(eksik.durum, 409);
    assert.equal(eksik.govde.mesaj, ZINCIR_LISTE_DEGISTI);
    const fazla = await iptal(kok, { surum: (await onizle(kok)).surum, altlariyla: true, altEmirIdleri: [a, a1, b, yeni, yeni] });
    assert.equal(fazla.durum, 409);
  });

  test('eski kök sürümü 409; gövde: bayrak listesiz ya da liste bayraksız 400; hiçbiri emri değiştirmez', async () => {
    const { kok, a, a1, b } = await agac();
    const p = await onizle(kok);
    const idler = p.altEmirler.map((x) => x.id);
    assert.equal((await iptal(kok, { surum: p.surum + 1, altlariyla: true, altEmirIdleri: idler })).durum, 409);
    assert.equal((await iptal(kok, { surum: p.surum, altlariyla: true })).durum, 400);
    assert.equal((await iptal(kok, { surum: p.surum, altEmirIdleri: idler })).durum, 400);
    assert.equal((await iptal(kok, { surum: p.surum, altlariyla: false, altEmirIdleri: idler })).durum, 400);
    assert.deepEqual(await durumlar([kok, a, a1, b]), ['planli', 'planli', 'planli', 'planli']);
  });

  test('yetki: operatör ve yalnız plan.canliya-al olan kişi zinciri iptal edemez (uç 403, servis 403); bayraksız çağrı bugünkü ret metniyle reddedilir', async () => {
    const { kok, a, a1, b } = await agac();
    const p = await onizle(kok);
    const govde = { surum: p.surum, altlariyla: true, altEmirIdleri: p.altEmirler.map((x) => x.id) };
    assert.equal((await iptal(kok, govde, 'operator')).durum, 403);
    assert.equal((await iptal(kok, govde, 'planci')).durum, 403);
    assert.equal((await istek('planci', 'GET', `/adimli-emirler/${kok}/iptal-onizleme`)).durum, 403);
    await assert.rejects(tx((db) => altlariylaIptal(db, kim('planci'), kok, { surum: p.surum, altEmirIdleri: govde.altEmirIdleri })), (h: unknown) => (h as { durum?: number }).durum === 403);
    const bayraksiz = await iptal(kok, { surum: p.surum });
    assert.equal(bayraksiz.durum, 409);
    assert.equal(bayraksiz.govde.mesaj, ADIMLI_IPTAL_KOLLU);
    assert.deepEqual(await durumlar([kok, a, a1, b]), ['planli', 'planli', 'planli', 'planli']);
  });

  test('iptal olayı dinleyicisi (stok, plan, hazırlık görevi) hata verirse bütün iptal geri alınır', async () => {
    const { kok, a, a1, b } = await agac();
    const p = await onizle(kok);
    // Yapraklar önce iptal olur; kök (son) olayında patlayan dinleyici öncekileri de geri almalıdır.
    const birak = emirIptalDinle((_db, olay) => (olay.uretimEmriId === kok ? Promise.reject(new Error('deneme hatası')) : Promise.resolve()));
    try {
      const r = await iptal(kok, { surum: p.surum, altlariyla: true, altEmirIdleri: p.altEmirler.map((x) => x.id) });
      assert.ok(r.durum >= 500, JSON.stringify(r.govde));
    } finally {
      birak();
    }
    assert.deepEqual(await durumlar([kok, a, a1, b]), ['planli', 'planli', 'planli', 'planli']);
  });

  test('alt emirsiz emir bayraksız bugünkü gibi iptal olur; bayraklı çağrı da alt emirsiz emirde çalışır', async () => {
    const x = await ac(3, [await makine()]);
    assert.equal((await iptal(x.id, { surum: (await onizle(x.id)).surum })).durum, 200);
    const y = await ac(3, [await makine()]);
    assert.equal((await iptal(y.id, { surum: (await onizle(y.id)).surum, altlariyla: true, altEmirIdleri: [] })).durum, 200);
    assert.deepEqual(await durumlar([x.id, y.id]), ['iptal', 'iptal']);
  });

  test('satın alma: emre bağlı açık, siparişe dönmemiş talepler yalnız uyarıdır; sipariş aşamasındaki ve başka emrin talebi listelenmez, talep iptal edilmez', async () => {
    const { kok, a, b } = await agac();
    const baska = (await ac(2, [await makine()])).id;
    const satir = (uretimEmriId: number, asama: 'talep' | 'siparis', talepNo: string): EmirTedarikSatiri =>
      ({ uretimEmriId, isEmriId: null, malzemeNo: 1, asama, talepId: `id-${talepNo}`, talepNo, siparisNo: asama === 'siparis' ? 'ORN-SP-1' : null, termin: null });
    const onceki = tedarikCozucusuKaydet(() => Promise.resolve([
      satir(a, 'talep', 'ORN-ST-0002'), satir(kok, 'talep', 'ORN-ST-0001'), satir(b, 'siparis', 'ORN-ST-0003'), satir(baska, 'talep', 'ORN-ST-0009'),
    ]));
    try {
      const p = await onizle(kok);
      assert.deepEqual(p.satinAlmaTalepleri, [{ id: 'id-ORN-ST-0001', no: 'ORN-ST-0001' }, { id: 'id-ORN-ST-0002', no: 'ORN-ST-0002' }]);
    } finally {
      tedarikCozucusuKaydet(onceki);
    }
  });

  test('tek emrin iptali de açık hazırlık görevini aynı işlemde kapatır; başka emrin görevi açık kalır', async () => {
    const x = await ac(3, [await makine()]);
    const y = await ac(3, [await makine()]);
    for (const e of [x.id, y.id]) {
      await o().sahip.sorgu(
        `INSERT INTO projeler_gorev (proje_id, ad, plan_baslangic, plan_bitis, olusturan_id, hazirlik_maddesi, hazirlik_emri_id)
         VALUES ($1, 'CNC kurulumu', current_date, current_date + 3, $2, 'cnc', $3)`, [projeId, yoneticiId, e]);
    }
    assert.equal((await iptal(x.id, { surum: (await onizle(x.id)).surum })).durum, 200);
    const durum = (e: number) => sayi("SELECT count(*)::int AS n FROM projeler_gorev WHERE hazirlik_emri_id = $1 AND durum = 'iptal'", e);
    assert.deepEqual([await durum(x.id), await durum(y.id)], [1, 0]);
  });
});
