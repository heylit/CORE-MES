import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { AdimliEmirAyrintisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import type { AcilisSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import {
  PARTI_KALEM_DISI, PARTI_KALEMSIZ, PARTI_TURU_FARKLI, TESLIM_BASLAMIS, TESLIM_KALEMSIZ, kalemTeslimi, partiIhlali, teslimBaglaIhlali,
  PROJE_ZORUNLU, SIPARIS_SATIRI_MALZEME, SIPARIS_SATIRI_ONAYSIZ, SIPARIS_SATIRI_PROJE_DISI, SIPARIS_SATIRI_PROJESIZ, SIPARIS_SATIRI_SECILMELI, SIPARIS_SATIRI_YOK,
  kendiligindenSatir, projeZorunluMu, siparisSatiriIhlali,
} from './kurallar.ts';
import { emirPlanBilgisiYaz, siparisSatirlarininEmirleri } from './disari.ts';
import { isEmriSureleri, projeninIsEmirleri, rotasizIsEmirleri } from './is-emri-servis.ts';

// UE-SS (176 a): emir sipariş satırına bağlanır; zincir sipariş, proje, emir. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Hata { kod: string; mesaj: string }

describe('UE-SS kuralı (saf)', () => {
  const satir = { siparisId: 7, siparisDurumu: 'onayli', malzemeNo: 3 };
  test('izinli: satır projenin siparişinde, sipariş onaylı, malzeme aynı', () => {
    assert.equal(siparisSatiriIhlali(satir, 7, 3), null);
  });
  test('reddedilen: satır yok, proje yok ya da siparişsiz, başka sipariş, onaysız sipariş, başka malzeme', () => {
    assert.equal(siparisSatiriIhlali(null, 7, 3), SIPARIS_SATIRI_YOK);
    assert.equal(siparisSatiriIhlali(satir, undefined, 3), SIPARIS_SATIRI_PROJESIZ);
    assert.equal(siparisSatiriIhlali(satir, null, 3), SIPARIS_SATIRI_PROJESIZ);
    assert.equal(siparisSatiriIhlali(satir, 8, 3), SIPARIS_SATIRI_PROJE_DISI);
    for (const d of ['taslak', 'kapandi', 'iptal']) assert.equal(siparisSatiriIhlali({ ...satir, siparisDurumu: d }, 7, 3), SIPARIS_SATIRI_ONAYSIZ, d);
    assert.equal(siparisSatiriIhlali(satir, 7, 4), SIPARIS_SATIRI_MALZEME);
  });
  test('224: proje stoğa üretim, rework ve bakım-deneme dışında zorunlu', () => {
    assert.deepEqual(['seri', 'fai', 'numune', 'prototip', 'fason'].map(projeZorunluMu), [true, true, true, true, true]);
    assert.deepEqual(['stok', 'rework', 'bakim_deneme'].map(projeZorunluMu), [false, false, false]);
  });
  test('224: onaylı siparişteki aynı malzemeli tek satır seçilir; birden çoksa seçim istenir; satır yoksa ya da sipariş onaysızsa satırsız', () => {
    const siparis = { durum: 'onayli', satirlar: [{ id: 1, malzemeNo: 3 }, { id: 2, malzemeNo: 4 }, { id: 5, malzemeNo: 4 }] };
    assert.deepEqual(kendiligindenSatir(siparis, 3), { satirId: 1 });
    assert.deepEqual(kendiligindenSatir(siparis, 4), { ihlal: SIPARIS_SATIRI_SECILMELI });
    assert.deepEqual(kendiligindenSatir(siparis, 9), { satirId: null });
    assert.deepEqual(kendiligindenSatir({ ...siparis, durum: 'taslak' }, 3), { satirId: null });
    assert.deepEqual(kendiligindenSatir(null, 3), { satirId: null });
  });
});

describe('UE-TB teslim ve parti bağı kuralları (saf, 3244 b)', () => {
  test('teslim: boş ya da termine eşit teslim termindir ve bağlıdır; başka tarih bağsız; satırsız emirde bağ yok', () => {
    assert.deepEqual(kalemTeslimi(null, '2026-11-15'), { teslim: '2026-11-15', bagli: true });
    assert.deepEqual(kalemTeslimi('2026-11-15', '2026-11-15'), { teslim: '2026-11-15', bagli: true });
    assert.deepEqual(kalemTeslimi('2026-11-10', '2026-11-15'), { teslim: '2026-11-10', bagli: false });
    assert.deepEqual(kalemTeslimi(null, null), { teslim: null, bagli: false });
    assert.deepEqual(kalemTeslimi('2026-11-10', null), { teslim: '2026-11-10', bagli: false });
  });
  test('parti: satırın partisi olmalı; tür verilmişse partinin türüyle aynı olmalı', () => {
    const partiler = [{ id: 1, emirTuru: 'fai' }, { id: 2, emirTuru: 'seri' }];
    assert.equal(partiIhlali(partiler, 1, undefined), null);
    assert.equal(partiIhlali(partiler, 1, 'fai'), null);
    assert.equal(partiIhlali(partiler, 1, 'seri'), PARTI_TURU_FARKLI);
    assert.equal(partiIhlali(partiler, 9, undefined), PARTI_KALEM_DISI);
    assert.equal(partiIhlali(null, 1, undefined), PARTI_KALEMSIZ);
  });
  test('bağla: yalnız satırlı, başlamamış, arşivsiz emirde', () => {
    const e = { siparisSatiriId: 4, durum: 'planli', arsiv: false };
    assert.equal(teslimBaglaIhlali(e, false), null);
    assert.equal(teslimBaglaIhlali({ ...e, durum: 'taslak' }, false), null);
    assert.equal(teslimBaglaIhlali({ ...e, siparisSatiriId: null }, false), TESLIM_KALEMSIZ);
    assert.equal(teslimBaglaIhlali(e, true), TESLIM_BASLAMIS);
    assert.equal(teslimBaglaIhlali({ ...e, durum: 'basladi' }, false), TESLIM_BASLAMIS);
    assert.equal(teslimBaglaIhlali({ ...e, arsiv: true }, false), TESLIM_BASLAMIS);
  });
});

describe('UE-SS emir sipariş satırına (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let cerez = '';
  let firmaId = 0;
  let sayac = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const tek = async (sql: string, p: unknown[] = []): Promise<number> => (await o().sahip.tek<{ id: number }>(sql, p))!.id;

  async function istek<T = unknown>(yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const c = await app.inject({
      method: yontem, url: `/api${yol}`, headers: { cookie: cerez, [ISTEK_KIMLIGI_BASLIGI]: randomUUID() }, ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }

  const malzeme = async (): Promise<number> => {
    sayac += 1;
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'USS-', $2, 'aktif', $3, $4, $4) RETURNING no`, [`uss-${sayac}`, sayac, JSON.stringify({ id: `uss-${sayac}`, com: { ad: 'Deneme mamul' } }), yoneticiId]))!.no;
  };
  const siparis = async (durum: 'taslak' | 'onayli', malzemeNo: number): Promise<{ siparisId: number; satirId: number }> => {
    sayac += 1;
    const onayli = durum === 'onayli';
    const siparisId = await tek(
      `INSERT INTO siparisler_siparis (no, durum, firma_id, siparis_tarihi, termin, kdv_orani, olusturan_id, onaylayan_id, onay_zamani)
       VALUES ($1, $2, $3, current_date, current_date + 30, 20, $4, $5, $6) RETURNING id`,
      [`SS-2026-${String(sayac).padStart(3, '0')}`, durum, firmaId, yoneticiId, onayli ? yoneticiId : null, onayli ? new Date().toISOString() : null]);
    const satirId = await tek('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 1, $2, 10, 5) RETURNING id', [siparisId, malzemeNo]);
    return { siparisId, satirId };
  };
  const proje = async (siparisId: number | null): Promise<number> => {
    sayac += 1;
    return tek("INSERT INTO projeler_proje (kod, ad, siparis_id, olusturan_id) VALUES ($1, 'Deneme proje', $2, $3) RETURNING id", [`USSP${sayac}`, siparisId, yoneticiId]);
  };
  const ac = (malzemeNo: number, projeId: number | null, siparisSatiriId?: number, emirTuru?: string) =>
    istek<{ uretimEmriId: number } & Hata>('POST', '/adimli-emirler/rotasiz', {
      malzemeNo, adet: 4, teslim: null, projeId, ...(siparisSatiriId === undefined ? {} : { siparisSatiriId }), ...(emirTuru === undefined ? {} : { emirTuru }),
    });
  const emrinSatiri = async (id: number) => (await istek<{ emir: AdimliEmirAyrintisi }>('GET', `/adimli-emirler/${id}`)).govde.emir.siparisSatiriId;

  before(async () => {
    ortam = await testVeritabaniKur('uretim_siparis_satiri');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const rol = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'planlama_proje'");
    const yoneticiRolu = await ortam.vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    await ortam.vt.tx(async (db) => {
      const k = await yoneticiOlustur(db, { ad: 'Deneme planlama', kullaniciAdi: 'planlama', parola: PAROLA });
      await rolAta(db, yoneticiId, k, rol!.id);
      await rolAl(db, yoneticiId, k, yoneticiRolu!.id);
    });
    const giris = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'planlama', parola: PAROLA } });
    assert.equal(giris.statusCode, 200);
    cerez = String(giris.headers['set-cookie']).split(';')[0] ?? '';
    firmaId = await tek("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('Deneme Müşteri', 'musteri', $1) RETURNING id", [yoneticiId]);
    await ortam.sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('USS-', 0) ON CONFLICT (onek) DO NOTHING");
    await ortam.sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('uretim-emirleri.rotasiz-emir', 'true', $1)", [yoneticiId]);
  });
  after(async () => { await ortam?.kaldir(); });

  test('izinli: siparişten açılmış projenin onaylı ve aynı malzemeli satırına emir bağlanır; ayrıntı satırı verir; aynı satıra ikinci emir de bağlanır', async () => {
    const m = await malzeme();
    const s = await siparis('onayli', m);
    const p = await proje(s.siparisId);
    const ilk = await ac(m, p, s.satirId);
    assert.equal(ilk.durum, 200, JSON.stringify(ilk.govde));
    const e = await istek<{ emir: AdimliEmirAyrintisi }>('GET', `/adimli-emirler/${ilk.govde.uretimEmriId}`);
    assert.deepEqual([e.govde.emir.projeId, e.govde.emir.siparisSatiriId], [p, s.satirId]);
    assert.equal((await ac(m, p, s.satirId)).durum, 200, 'miktar sınırı yok');
  });

  test('224: seri emir projesiz açılmaz (400, emir açılmaz); stoğa üretim projesiz ve satırsız açılır; siparişsiz projede emir satırsız', async () => {
    const m = await malzeme();
    const s = await siparis('onayli', m);
    const once = (await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri'))!.n;
    for (const c of [await ac(m, null), await ac(m, null, s.satirId)]) assert.deepEqual([c.durum, c.govde.mesaj], [400, PROJE_ZORUNLU]);
    assert.equal((await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri'))!.n, once);
    const stok = await ac(m, null, undefined, 'stok');
    assert.equal(stok.durum, 200, JSON.stringify(stok.govde));
    assert.equal(await emrinSatiri(stok.govde.uretimEmriId), null);
    const siparissiz = await ac(m, await proje(null));
    assert.equal(siparissiz.durum, 200, JSON.stringify(siparissiz.govde));
    assert.equal(await emrinSatiri(siparissiz.govde.uretimEmriId), null);
  });

  test('224: satır verilmezse projenin onaylı siparişindeki tek satır bağlanır; birden çok satırda 400 ve satır seçilince açılır; o malzemenin satırı yoksa ya da sipariş onaysızsa satırsız', async () => {
    const m = await malzeme();
    const baska = await malzeme();
    const s = await siparis('onayli', m);
    const p = await proje(s.siparisId);
    const tek1 = await ac(m, p);
    assert.equal(tek1.durum, 200, JSON.stringify(tek1.govde));
    assert.equal(await emrinSatiri(tek1.govde.uretimEmriId), s.satirId);
    const yok = await ac(baska, p);
    assert.equal(yok.durum, 200, JSON.stringify(yok.govde));
    assert.equal(await emrinSatiri(yok.govde.uretimEmriId), null);
    const t = await siparis('taslak', m);
    assert.equal(await emrinSatiri((await ac(m, await proje(t.siparisId))).govde.uretimEmriId), null);

    const ikinci = await tek('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 2, $2, 6, 5) RETURNING id', [s.siparisId, m]);
    const once = (await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri'))!.n;
    const cok = await ac(m, p);
    assert.deepEqual([cok.durum, cok.govde.mesaj], [400, SIPARIS_SATIRI_SECILMELI]);
    assert.equal((await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri'))!.n, once);
    const secilen = await ac(m, p, ikinci);
    assert.equal(secilen.durum, 200, JSON.stringify(secilen.govde));
    assert.equal(await emrinSatiri(secilen.govde.uretimEmriId), ikinci);
  });

  test('224: açılış seçenekleri proje zorunluluğunu, aktif projeleri ve her projede bağlanabilecek satırları verir; fiyat yok; oturumsuz 401', async () => {
    const m = await malzeme();
    const s = await siparis('onayli', m);
    const p = await proje(s.siparisId);
    const ikinci = await tek('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat, termin) VALUES ($1, 2, $2, 6, 5, current_date + 10) RETURNING id', [s.siparisId, m]);
    await tek('INSERT INTO siparisler_siparis_satiri (siparis_id, sira, malzeme_no, miktar, birim_fiyat) VALUES ($1, 3, $2, 1, 5) RETURNING id', [s.siparisId, await malzeme()]);
    const bos = await proje(null);
    const c = await istek<AcilisSecenekleri>('GET', `/adimli-emirler/acilis-secenekleri?malzemeNo=${m}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.projeZorunlu, true);
    const satirlar = c.govde.projeler.find((x) => x.id === p)?.satirlar ?? [];
    assert.deepEqual(satirlar.map((x) => [x.id, x.satirNo, Number(x.adet)]), [[s.satirId, 1, 10], [ikinci, 2, 6]], 'yalnız aynı malzemeli satırlar, sırayla');
    assert.ok(satirlar.every((x) => typeof x.siparisNo === 'string' && x.termin !== null));
    assert.deepEqual(c.govde.projeler.find((x) => x.id === bos)?.satirlar, []);
    assert.ok(!JSON.stringify(c.govde).includes('Fiyat'), 'fiyat ve tutar yok');
    assert.equal((await istek<AcilisSecenekleri>('GET', `/adimli-emirler/acilis-secenekleri?malzemeNo=${m}&emirTuru=stok`)).govde.projeZorunlu, false);
    const yetkisiz = await app.inject({ method: 'GET', url: `/api/adimli-emirler/acilis-secenekleri?malzemeNo=${m}` });
    assert.equal(yetkisiz.statusCode, 401);
  });

  test('B-2500-6: açılış seçenekleri "Rotasız üretim emri" ayarını taşır; ayar kapanınca false olur', async () => {
    const m = await malzeme();
    const rotasiz = async () => (await istek<AcilisSecenekleri>('GET', `/adimli-emirler/acilis-secenekleri?malzemeNo=${m}`)).govde.rotasizAcik;
    assert.equal(await rotasiz(), true, 'kurulumda ayar açık');
    await o().sahip.sorgu("UPDATE ayar SET deger = 'false' WHERE anahtar = 'uretim-emirleri.rotasiz-emir'");
    try {
      assert.equal(await rotasiz(), false);
    } finally {
      await o().sahip.sorgu("UPDATE ayar SET deger = 'true' WHERE anahtar = 'uretim-emirleri.rotasiz-emir'");
    }
  });

  test('reddedilen (409, emir açılmaz): satır yok, siparişsiz proje, başka siparişin projesi, onaysız sipariş, başka malzeme', async () => {
    const m = await malzeme();
    const baska = await malzeme();
    const s = await siparis('onayli', m);
    const p = await proje(s.siparisId);
    const t = await siparis('taslak', m);
    const tp = await proje(t.siparisId);
    const once = (await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri'))!.n;
    const durumlar = [
      [await ac(m, p, 2_000_000_000), SIPARIS_SATIRI_YOK],
      [await ac(m, await proje(null), s.satirId), SIPARIS_SATIRI_PROJESIZ],
      [await ac(m, tp, s.satirId), SIPARIS_SATIRI_PROJE_DISI],
      [await ac(m, tp, t.satirId), SIPARIS_SATIRI_ONAYSIZ],
      [await ac(baska, p, s.satirId), SIPARIS_SATIRI_MALZEME],
    ] as const;
    for (const [c, ileti] of durumlar) assert.deepEqual([c.durum, c.govde.mesaj], [409, ileti]);
    assert.equal((await o().sahip.tek<{ n: number }>('SELECT count(*)::int AS n FROM uretim_emri'))!.n, once);
  });

  test('plan satırı emrin sipariş satırını taşır (196 a: plan önceliği siparişin gecikme bedelinden okur); satırsız emirde null', async () => {
    const m = await malzeme();
    const s = await siparis('onayli', m);
    const bagli = (await ac(m, await proje(s.siparisId), s.satirId)).govde.uretimEmriId;
    const serbest = (await ac(m, await proje(null))).govde.uretimEmriId;
    const im = await tek("INSERT INTO is_merkezi (kod, ad) VALUES ('USS-IM', 'Deneme Merkezi') RETURNING id");
    const ist = await tek("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('USS-I', 'Deneme İstasyonu', $1) RETURNING id", [im]);
    const makine = await tek("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('USS-M', 'Tezgah', $1) RETURNING id", [ist]);
    const tip = await tek("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('USS-T', 'Deneme tipi', 'TAL') RETURNING id");
    for (const id of [bagli, serbest]) {
      const surum = (await istek<{ emir: AdimliEmirAyrintisi }>('GET', `/adimli-emirler/${id}`)).govde.emir.surum;
      const c = await istek('POST', `/adimli-emirler/${id}/adim-ekle`, {
        oncekiOpNo: null, opNo: 10, ad: 'Adım 10', operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '5', birimSureDk: '2', terminGun: null, surum,
      });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
    }
    const satirlar = await rotasizIsEmirleri(o().vt);
    assert.deepEqual([bagli, serbest].map((id) => satirlar.find((x) => x.uretimEmriId === id)?.siparisSatiriId), [s.satirId, null]);
  });

  test('proje maliyeti (197 a) okuması: projenin iş emirleri iptal hariç, istasyon adı ve kaynak türüyle; süreler kullanım, ayar ve katılımdan', async () => {
    const m = await malzeme();
    const p = await proje(null);
    const id = (await ac(m, p)).govde.uretimEmriId;
    const iptal = (await ac(m, p)).govde.uretimEmriId;
    const im = await tek("INSERT INTO is_merkezi (kod, ad) VALUES ('USS-PM', 'Deneme Merkezi') RETURNING id");
    const ist = await tek("INSERT INTO istasyon (kod, ad, is_merkezi_id) VALUES ('USS-PI', 'Deneme Torna', $1) RETURNING id", [im]);
    const makine = await tek("INSERT INTO makine (kod, ad, istasyon_id) VALUES ('USS-PMK', 'Tezgah', $1) RETURNING id", [ist]);
    const tip = await tek("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('USS-PT', 'Deneme tipi', 'TAL') RETURNING id");
    const adim = async (emir: number, opNo: number, kaynak: unknown) => {
      const surum = (await istek<{ emir: AdimliEmirAyrintisi }>('GET', `/adimli-emirler/${emir}`)).govde.emir.surum;
      const c = await istek('POST', `/adimli-emirler/${emir}/adim-ekle`, {
        oncekiOpNo: opNo === 10 ? null : opNo - 10, opNo, ad: `Adım ${opNo}`, operasyonTipiId: tip, kaynak, ayarSuresiDk: '5', birimSureDk: '2', terminGun: null, surum,
      });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
    };
    await adim(id, 10, { tur: 'makine', id: makine });
    await adim(id, 20, null);
    await adim(iptal, 10, { tur: 'makine', id: makine });
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now() WHERE id = $1", [iptal]);
    const l = await projeninIsEmirleri(o().vt, p);
    assert.deepEqual(l.map((x) => [x.uretimEmriId, x.opNo, x.istasyonAd, x.kaynakTur, x.durum, x.adet, x.saglam]), [
      [id, 10, 'Deneme Torna', 'makine', 'bekliyor', 4, null], [id, 20, null, null, 'bekliyor', 4, null],
    ]);
    const [ilk, ikinci] = l.map((x) => x.isEmriId) as [number, number];
    // Ayar 100 sn önce kullanımdan; kullanım 540 sn kapalı + 60 sn açık; iki kişi katılır (biri iki aralıkla).
    // Ayar ve kullanım ayrı sorgularla yazılır; her biri kendi now()'ını alırsa aradaki gecikme ayar süresine eklenir. İkisi tek anı paylaşır.
    const an = (await o().sahip.tek<{ an: string }>('SELECT now()::text AS an'))!.an;
    await o().sahip.sorgu(`INSERT INTO uretim_olayi (emir_id, kisi_id, istasyon_id, olay, zaman, is_emri_id) VALUES ($1, $2, $3, 'ayar', $5::timestamptz - interval '700 seconds', $4)`, [id, yoneticiId, ist, ilk, an]);
    await o().sahip.sorgu(`INSERT INTO uretim_emirleri_makine_kullanimi (emir_id, is_emri_id, istasyon_id, makine_id, kisi_id, baslama, bitis, kapatan_id)
      VALUES ($1, $2, $3, $4, $5, $6::timestamptz - interval '600 seconds', $6::timestamptz - interval '60 seconds', $5), ($1, $2, $3, $4, $5, $6::timestamptz - interval '60 seconds', NULL, NULL)`, [id, ilk, ist, makine, yoneticiId, an]);
    const kisi2 = await tek("INSERT INTO kisi (ad) VALUES ('Deneme Operatör PM') RETURNING id");
    await o().sahip.sorgu(`INSERT INTO uretim_emirleri_katilim (emir_id, is_emri_id, kisi_id, istasyon_id, giris, cikis, kapanis) VALUES
      ($1, $2, $3, $5, now() - interval '600 seconds', now() - interval '400 seconds', 'duraklat'), ($1, $2, $3, $5, now() - interval '300 seconds', now() - interval '200 seconds', 'ayril'),
      ($1, $2, $4, $5, now() - interval '500 seconds', now() - interval '450 seconds', 'ayril')`, [id, ilk, yoneticiId, kisi2, ist]);
    const sure = await isEmriSureleri(o().vt, [ilk, ikinci, 2_000_000_000]);
    // Açık kullanım aralığı sorgunun saatine (clock_timestamp) kadar ölçülür; `an` ile sorgu arası geçen süre kadar uzar.
    // Alt sınır 600 (yuvarlama payı 1), üst sınır 600 + geçen süre: yavaş makinede oynamaz, açık aralık sayılmazsa (540) düşer.
    const gecen = Number((await o().sahip.tek<{ sn: string }>('SELECT ceil(extract(epoch FROM clock_timestamp() - $1::timestamptz)) AS sn', [an]))!.sn);
    const a = sure.get(ilk)!;
    assert.ok(a.islemeSn >= 599 && a.islemeSn <= 600 + gecen + 1, `${a.islemeSn} (geçen ${gecen} sn)`);
    assert.equal(a.ayarSn, 100);
    assert.deepEqual(a.katilim, [{ kisiId: yoneticiId, saniye: 300 }, { kisiId: kisi2, saniye: 50 }].sort((x, y) => x.kisiId - y.kisiId));
    assert.deepEqual(sure.get(ikinci), { islemeSn: 0, ayarSn: null, katilim: [] }, 'çalışılmamış iş: sıfır kullanım, ayar bilinmiyor');
    assert.equal(sure.has(2_000_000_000), false, 'olmayan kimlik haritada yok');
    assert.deepEqual(await isEmriSureleri(o().vt, []), new Map());
  });

  test('2217 (2103-3 a): emir açma projenin siparişini kilitler; iptal eden işlem bitene dek bekler, sonra iptal edilmiş siparişin satırına bağlanamaz (409)', async () => {
    const m = await malzeme();
    const s = await siparis('onayli', m);
    const p = await proje(s.siparisId);
    let kilitAlindi!: () => void;
    let birak!: () => void;
    const alindi = new Promise<void>((r) => { kilitAlindi = r; });
    const bekle = new Promise<void>((r) => { birak = r; });
    // Sipariş iptalinin işlemi: satır kilitli, durum henüz yazılmadı.
    const iptal = o().sahip.tx(async (db) => {
      await db.sorgu('SELECT id FROM siparisler_siparis WHERE id = $1 FOR UPDATE', [s.siparisId]);
      kilitAlindi();
      await bekle;
      await db.sorgu("UPDATE siparisler_siparis SET durum = 'iptal', iptal_nedeni = 'Deneme' WHERE id = $1", [s.siparisId]);
    });
    await alindi;
    let dondu = false;
    const acilis = ac(m, p, s.satirId).finally(() => { dondu = true; });
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(dondu, false, 'emir açma sipariş kilidini beklemedi');
    birak();
    await iptal;
    const c = await acilis;
    assert.deepEqual([c.durum, c.govde.mesaj], [409, SIPARIS_SATIRI_ONAYSIZ]);
  });

  test('Sevkiyat okuması: sipariş satırlarının emirleri tek sorguda, iptal dahil; emirsiz ve olmayan satır haritada yok', async () => {
    const m = await malzeme();
    const s = await siparis('onayli', m);
    const p = await proje(s.siparisId);
    const ilk = (await ac(m, p, s.satirId)).govde.uretimEmriId;
    const ikinci = (await ac(m, p, s.satirId)).govde.uretimEmriId;
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now() WHERE id = $1", [ikinci]);
    const bos = await siparis('onayli', await malzeme());
    const harita = await siparisSatirlarininEmirleri(o().vt, [s.satirId, s.satirId, bos.satirId, 2_000_000_000]);
    assert.deepEqual([...harita.entries()], [[s.satirId, [ilk, ikinci]]]);
    assert.equal((await siparisSatirlarininEmirleri(o().vt, [])).size, 0);
  });

  test('UE-TB (3244 b): satırdan açılan emrin teslimi satırın termini ve bağlı; başka tarih bağsız; elle değişen teslim bağı koparır, Bağla geri bağlar', async () => {
    const m = await malzeme();
    const s = await siparis('onayli', m);
    const p = await proje(s.siparisId);
    const termin = (await o().sahip.tek<{ t: string }>("SELECT to_char(termin, 'YYYY-MM-DD') AS t FROM siparisler_siparis WHERE id = $1", [s.siparisId]))!.t;
    const ayrinti = async (id: number) => (await istek<{ emir: AdimliEmirAyrintisi }>('GET', `/adimli-emirler/${id}`)).govde.emir;
    const bagli = (await ac(m, p, s.satirId)).govde.uretimEmriId;
    const e = await ayrinti(bagli);
    assert.deepEqual([e.teslim, e.teslimBagli, e.siparisPartiId], [termin, true, null]);
    const farkli = await istek<{ uretimEmriId: number }>('POST', '/adimli-emirler/rotasiz', { malzemeNo: m, adet: 4, teslim: '2026-01-05', projeId: p, siparisSatiriId: s.satirId });
    assert.equal(farkli.durum, 200, JSON.stringify(farkli.govde));
    assert.deepEqual([(await ayrinti(farkli.govde.uretimEmriId)).teslimBagli], [false]);

    const planlama: Kullanici = { id: yoneticiId, ad: 'Deneme', islemler: ['uretim-emirleri.duzenle'] };
    await o().vt.tx((db) => emirPlanBilgisiYaz(db, planlama, bagli, { oncelik: 2 }));
    assert.equal((await ayrinti(bagli)).teslimBagli, true, 'teslim değişmeyince bağ kalır');
    await o().vt.tx((db) => emirPlanBilgisiYaz(db, planlama, bagli, { teslim: '2026-01-06' }));
    const kopuk = await ayrinti(bagli);
    assert.deepEqual([kopuk.teslim, kopuk.teslimBagli], ['2026-01-06', false]);

    const eski = await istek<Hata>('POST', `/adimli-emirler/${bagli}/teslim-bagla`, { surum: e.surum });
    assert.equal(eski.durum, 409, 'eski sürümle bağlanmaz');
    const bag = await istek<{ emir: AdimliEmirAyrintisi }>('POST', `/adimli-emirler/${bagli}/teslim-bagla`, { surum: kopuk.surum });
    assert.equal(bag.durum, 200, JSON.stringify(bag.govde));
    assert.deepEqual([bag.govde.emir.teslim, bag.govde.emir.teslimBagli], [termin, true]);

    const stok = (await ac(m, null, undefined, 'stok')).govde.uretimEmriId;
    const satirsiz = await istek<Hata>('POST', `/adimli-emirler/${stok}/teslim-bagla`, { surum: (await ayrinti(stok)).surum });
    assert.deepEqual([satirsiz.durum, satirsiz.govde.mesaj], [409, TESLIM_KALEMSIZ]);
    await o().sahip.sorgu("UPDATE uretim_emri SET durum = 'iptal', iptal = now() WHERE id = $1", [farkli.govde.uretimEmriId]);
    const baslamis = await istek<Hata>('POST', `/adimli-emirler/${farkli.govde.uretimEmriId}/teslim-bagla`, { surum: (await ayrinti(farkli.govde.uretimEmriId)).surum });
    assert.deepEqual([baslamis.durum, baslamis.govde.mesaj], [409, TESLIM_BASLAMIS]);
  });

  test('UE-TB (3244 b): emir satırın partisinden açılır, tür partiden gelir; başka satırın partisi ve farklı tür reddedilir; açılış seçenekleri partileri verir', async () => {
    const m = await malzeme();
    const s = await siparis('onayli', m);
    const p = await proje(s.siparisId);
    const fai = await tek("INSERT INTO siparisler_siparis_satiri_parti (satir_id, sira, emir_turu, adet) VALUES ($1, 1, 'fai', 4) RETURNING id", [s.satirId]);
    await tek("INSERT INTO siparisler_siparis_satiri_parti (satir_id, sira, emir_turu, adet) VALUES ($1, 2, 'seri', 6) RETURNING id", [s.satirId]);
    const govde = { malzemeNo: m, adet: 4, teslim: null, projeId: p, siparisSatiriId: s.satirId, siparisPartiId: fai };
    const c = await istek<{ uretimEmriId: number }>('POST', '/adimli-emirler/rotasiz', govde);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const e = (await istek<{ emir: AdimliEmirAyrintisi }>('GET', `/adimli-emirler/${c.govde.uretimEmriId}`)).govde.emir;
    assert.deepEqual([e.emirTuru, e.siparisPartiId, e.teslimBagli], ['fai', fai, true]);
    const tur = await istek<Hata>('POST', '/adimli-emirler/rotasiz', { ...govde, emirTuru: 'seri' });
    assert.deepEqual([tur.durum, tur.govde.mesaj], [400, PARTI_TURU_FARKLI]);
    const baska = await siparis('onayli', m);
    const yabanci = await tek("INSERT INTO siparisler_siparis_satiri_parti (satir_id, sira, emir_turu, adet) VALUES ($1, 1, 'seri', 10) RETURNING id", [baska.satirId]);
    const disari = await istek<Hata>('POST', '/adimli-emirler/rotasiz', { ...govde, siparisPartiId: yabanci });
    assert.deepEqual([disari.durum, disari.govde.mesaj], [400, PARTI_KALEM_DISI]);
    const secenek = await istek<AcilisSecenekleri>('GET', `/adimli-emirler/acilis-secenekleri?malzemeNo=${m}`);
    const satir = secenek.govde.projeler.find((x) => x.id === p)?.satirlar[0];
    assert.deepEqual(satir?.partiler?.map((x) => [x.emirTuru, x.adet]), [['fai', '4.000'], ['seri', '6.000']]);
    await assert.rejects(o().sahip.sorgu('DELETE FROM siparisler_siparis_satiri_parti WHERE id = $1', [fai]), /uretim_emri_siparis_parti/, 'emre bağlı parti silinmez');
  });
});
