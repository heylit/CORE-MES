import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { AdimGirdisi, KomutCevabi, RevizyonAyrintisi, UrunRevizyonlariCevabi } from '#paylasilan/sozlesme/rota.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { DURUM_ANAHTARI } from './disari.ts';
import { rotaDilimiCevir } from './kurallar.ts';
import { adimCiktisi, adimStatusu } from './servis.ts';

// Reçete ve Rota'nın rota dilimi (kart #1184): rota modülünün revizyonları prototipin `routes` ve `routeRevs` biçiminde gelir. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('recete-rota rota dilimi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let tam = '';
  let sayac = 0;
  let istA = 0;
  let istB = 0;
  let istC = 0;
  let makineA = 0;
  let makineB = 0;
  let tipId = 0;
  let hammadde = 0;
  let yanUrun = 0;

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown) =>
    app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerez, ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) }, payload: payload as object | undefined });
  async function tamamIstek<T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: unknown): Promise<T> {
    const cevap = await istek(cerez, yontem, url, payload);
    assert.equal(cevap.statusCode, 200, `${yontem} ${url}: ${cevap.body}`);
    return cevap.json() as T;
  }
  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    return girisCerezi(kullaniciAdi);
  }

  async function kart(tur: string, ad: string): Promise<number> {
    sayac += 1;
    await vt().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('RRR-', 0) ON CONFLICT (onek) DO NOTHING");
    const r = await vt().tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'RRR-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`rrr-${String(sayac)}`, tur, sayac, JSON.stringify({ id: `rrr-${String(sayac)}`, com: { ad, birim: 'adet' } }), yoneticiId],
    );
    return r?.no ?? 0;
  }

  const adim = (p: Partial<AdimGirdisi> = {}): AdimGirdisi => ({
    opNo: null, operasyonTipiId: tipId, ad: 'Deneme adım', kaynak: { tur: 'istasyon', id: istA }, ayarSuresiDk: 10, birimSureDk: 2,
    bagimlilik: 'bekleyen', devirAdedi: null, firePayiYuzde: 0, makineKullanimi: 'tek', enKucukParca: null, yenidenAyar: true,
    // Onaya giden rotanın ilk ve bağımsız adımında giren olmalı (#1372).
    adaylar: [], bilesenler: [{ malzemeId: hammadde, miktar: 1, fireYuzde: 0 }], yanUrunler: [], ...p,
  });
  const taslakKur = async (urun: number, adimlar: AdimGirdisi[]): Promise<KomutCevabi> => {
    const ac = await tamamIstek<KomutCevabi>(tam, 'POST', `/rota/urunler/${String(urun)}/taslak-ac`, { kaynak: { tur: 'bos' } });
    return tamamIstek<KomutCevabi>(tam, 'POST', `/rota/revizyonlar/${String(ac.id)}/kaydet`, { surum: ac.surum, aciklama: 'Deneme notu', adimlar });
  };
  const komut = (id: number, ad: string, govde: Record<string, unknown>) => tamamIstek<KomutCevabi>(tam, 'POST', `/rota/revizyonlar/${String(id)}/${ad}`, govde);
  const durumOku = (cerez = tam) => tamamIstek<DurumCevabi>(cerez, 'GET', '/recete-rota/durum');

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_rota');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    tam = await girisCerezi('yonetici');
    const merkez = await vt().tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('RRR-IM', 'Deneme merkez') RETURNING id");
    const ist = async (kod: string): Promise<number> => (await vt().tek<{ id: number }>(
      "INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $1, $2, true) RETURNING id", [kod, merkez?.id]))?.id ?? 0;
    istA = await ist('RRR-A');
    istB = await ist('RRR-B');
    istC = await ist('RRR-C');
    const mk = async (kod: string, istasyon: number): Promise<number> => (await vt().tek<{ id: number }>(
      'INSERT INTO makine (kod, ad, istasyon_id, aktif) VALUES ($1, $1, $2, true) RETURNING id', [kod, istasyon]))?.id ?? 0;
    makineA = await mk('RRR-MA', istA);
    makineB = await mk('RRR-MB', istB);
    tipId = (await vt().tek<{ id: number }>(
      "INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup, aktif, kisaltma) VALUES ('RRR-OP', 'Deneme operasyonu', 'KES', true, 'DOP') RETURNING id"))?.id ?? 0;
    hammadde = await kart('hammadde', 'RRR hammadde');
    yanUrun = await kart('hammadde', 'RRR yan ürün');
  });

  after(async () => { await ortam?.kaldir(); });

  test('RRR-1: yürürlükteki rota prototipin adım biçiminde gelir; istasyon, makine, aday, bileşen ve yan ürün eşlenir', async () => {
    const urun = await kart('mamul', 'RRR mamul 1');
    const k = await taslakKur(urun, [
      adim({
        ad: 'Birinci', kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 10, birimSureDk: 4, islemSuresiDk: 3, degisimSuresiDk: 1, firePayiYuzde: 2,
        makineKullanimi: 'paralel', enKucukParca: 5, yenidenAyar: false, ilkParca: 'yok',
        adaylar: [{ kaynak: { tur: 'istasyon', id: istB }, ayarSuresiDk: 5, birimSureDk: 6 }, { kaynak: { tur: 'makine', id: makineB }, ayarSuresiDk: null, birimSureDk: 7 }],
        bilesenler: [{ malzemeId: hammadde, miktar: 2, fireYuzde: 5 }], yanUrunler: [{ malzemeId: yanUrun, miktar: 0.5 }],
      }),
      adim({ ad: 'İkinci', kaynak: { tur: 'istasyon', id: istC }, ayarSuresiDk: 0, birimSureDk: 8, bagimlilik: 'akisli', devirAdedi: 10 }),
      adim({ ad: 'Üçüncü', kaynak: null, ayarSuresiDk: 1, birimSureDk: 2, bagimlilik: 'bagimsiz' }),
    ]);
    await tamamIstek(tam, 'POST', '/ayarlar/rota.dort-goz/degistir', { deger: false });
    try {
      const g = await komut(k.id, 'onaya-gonder', { surum: k.surum });
      const o = await komut(k.id, 'onayla', { surum: g.surum, yururlugeAl: true });
      assert.equal(o.durum, 'yururlukte');
    } finally {
      await tamamIstek(tam, 'POST', '/ayarlar/rota.dort-goz/degistir', { deger: true });
    }
    const d = await durumOku();
    const rev = d.routeRevs?.find((r) => r.id === String(k.id));
    assert.ok(rev);
    assert.deepEqual({ itemId: rev.itemId, no: rev.no, status: rev.status, note: rev.note }, { itemId: String(urun), no: 'A', status: 'yururlukte', note: 'Deneme notu' });
    assert.equal(typeof rev.surum, 'number');
    assert.deepEqual(d.routes?.[String(urun)], rev.data);
    const [s1, s2, s3] = rev.data.steps;
    assert.deepEqual(s1, {
      id: `${String(urun)}-o10`, opNo: 10, seq: 10, opId: String(tipId), name: 'Birinci', stationId: String(istA), machineId: String(makineA), kisiId: null, fasonId: null, terminGun: null,
      setup: 10, proc: 3, chg: 1, cycle: 4, dep: 'bagimli', depQty: null, rejectPct: 2, split: 'bol', minLot: 5, resetup: false, ilkParca: 'yok', dal: null, birlesen: [], onculler: null,
      alts: [String(istB)], altTimes: { [String(istB)]: { setup: 5, cycle: 6 } },
      digerAdaylar: [{ tur: 'makine', id: String(makineB), setup: null, proc: 7, chg: null, cycle: 7 }],
      ins: [{ itemId: String(hammadde), qty: 2, scrap: 5 }], outs: [{ itemId: String(yanUrun), qty: 0.5, kind: 'yan' }],
    });
    // İstasyona bağlı adımda makine yoktur; ayarı 0 olan süre 0'dır (uydurma değil), girilmeyen değişim null; kaynağı olmayan adımın istasyonu null.
    assert.deepEqual(
      { id: s2?.id, stationId: s2?.stationId, machineId: s2?.machineId, setup: s2?.setup, proc: s2?.proc, chg: s2?.chg, dep: s2?.dep, depQty: s2?.depQty },
      { id: `${String(urun)}-o20`, stationId: String(istC), machineId: null, setup: 0, proc: 8, chg: null, dep: 'ortulu', depQty: 10 },
    );
    assert.deepEqual(
      { stationId: s3?.stationId, setup: s3?.setup, proc: s3?.proc, cycle: s3?.cycle, dep: s3?.dep, split: s3?.split, minLot: s3?.minLot, ilkParca: s3?.ilkParca },
      { stationId: null, setup: 1, proc: 2, cycle: 2, dep: 'bagimsiz', split: 'tek', minLot: null, ilkParca: 'her_kurulum' },
    );
    // Kabul: aynı rota rota modülünün kendi ucundan aynı adımlarla (istasyon dahil) döner.
    const liste = await tamamIstek<UrunRevizyonlariCevabi>(tam, 'GET', `/rota/urunler/${String(urun)}`);
    const yururluk = liste.revizyonlar.find((r) => r.durum === 'yururlukte');
    assert.equal(String(yururluk?.id), rev.id);
    const ayrinti = await tamamIstek<RevizyonAyrintisi>(tam, 'GET', `/rota/revizyonlar/${rev.id}`);
    assert.deepEqual(ayrinti.adimlar.map((a) => [`${String(urun)}-o${String(a.opNo)}`, a.ad, a.kaynak?.tur ?? null, a.kaynak?.id ?? null]), [
      [`${String(urun)}-o10`, 'Birinci', 'makine', makineA], [`${String(urun)}-o20`, 'İkinci', 'istasyon', istC], [`${String(urun)}-o30`, 'Üçüncü', null, null],
    ]);
  });

  test('RRR-2: revizyon durumları prototipin adlarıyla gelir; iptal edilen gelmez; yürürlüğü olmayan ürünün rotası yoktur', async () => {
    const urun = await kart('mamul', 'RRR mamul 2');
    const k = await taslakKur(urun, [adim()]);
    const taslakDurumu = await durumOku();
    assert.equal(taslakDurumu.routeRevs?.find((r) => r.id === String(k.id))?.status, 'taslak');
    assert.equal(taslakDurumu.routes?.[String(urun)], undefined);
    const g = await komut(k.id, 'onaya-gonder', { surum: k.surum });
    assert.equal((await durumOku()).routeRevs?.find((r) => r.id === String(k.id))?.status, 'onay');
    await komut(k.id, 'geri-gonder', { surum: g.surum });
    assert.equal((await durumOku()).routeRevs?.find((r) => r.id === String(k.id))?.status, 'taslak');
    const son = await tamamIstek<UrunRevizyonlariCevabi>(tam, 'GET', `/rota/urunler/${String(urun)}`);
    const guncel = son.revizyonlar.find((r) => r.id === k.id);
    await komut(k.id, 'iptal', { surum: guncel?.surum ?? 0 });
    assert.equal((await durumOku()).routeRevs?.some((r) => r.id === String(k.id)), false);
  });

  test('RRR-3: etkin olmayan makinenin istasyonu bilinmez: istasyon null, makine kimliği kalır', async () => {
    const urun = await kart('mamul', 'RRR mamul 3');
    const k = await taslakKur(urun, [adim({ kaynak: { tur: 'makine', id: makineB } })]);
    assert.equal((await durumOku()).routeRevs?.find((r) => r.id === String(k.id))?.data.steps[0]?.stationId, String(istB));
    await vt().sorgu('UPDATE makine SET aktif = false WHERE id = $1', [makineB]);
    try {
      const adimi = (await durumOku()).routeRevs?.find((r) => r.id === String(k.id))?.data.steps[0];
      assert.deepEqual({ stationId: adimi?.stationId, machineId: adimi?.machineId }, { stationId: null, machineId: String(makineB) });
    } finally {
      await vt().sorgu('UPDATE makine SET aktif = true WHERE id = $1', [makineB]);
    }
  });

  test('RRR-4: rota dilimi rota sayfası ya da rota işlemiyle dolu; yalnız recete-rota yetkisi olana null', async () => {
    const yalniz = await islemliKisi('yalniz', ['recete-rota.oku']);
    const bos = await durumOku(yalniz);
    assert.deepEqual([bos.routes, bos.routeRevs], [null, null]);
    for (const [ad, islem] of [['sayfali', 'sayfa.rota'], ['yazar', 'rota.yaz'], ['onaycisi', 'rota.onayla']] as const) {
      const cerez = await islemliKisi(ad, ['recete-rota.oku', islem]);
      const d = await durumOku(cerez);
      assert.notEqual(d.routeRevs, null, ad);
      assert.equal((d.routeRevs ?? []).length > 0, true, ad);
    }
    assert.equal((await durumOku(tam)).routes !== null, true);
  });

  test('RRR-6: adım sırası seq, OP numarası opNo ve kimliktir; sıra değişince seq yeniden 10, 20 olur, OP numarası adımla kalır', async () => {
    const urun = await kart('mamul', 'RRR mamul 6');
    const k = await taslakKur(urun, [adim({ ad: 'Bir' }), adim({ ad: 'İki' }), adim({ ad: 'Üç' })]);
    const ilk = (await durumOku()).routeRevs?.find((r) => r.id === String(k.id))?.data.steps ?? [];
    const o = (n: number): string => `${String(urun)}-o${String(n)}`;
    assert.deepEqual(ilk.map((s) => [s.id, s.seq, s.opNo, s.name]), [[o(10), 10, 10, 'Bir'], [o(20), 20, 20, 'İki'], [o(30), 30, 30, 'Üç']]);
    const ters = [...ilk].reverse();
    await tamamIstek(tam, 'POST', `/rota/revizyonlar/${String(k.id)}/kaydet`, {
      surum: k.surum, aciklama: null, adimlar: ters.map((s) => adim({ opNo: s.opNo, ad: s.name })),
    });
    const sonra = (await durumOku()).routeRevs?.find((r) => r.id === String(k.id))?.data.steps ?? [];
    assert.deepEqual(sonra.map((s) => [s.id, s.seq, s.opNo, s.name]), [[o(30), 10, 30, 'Üç'], [o(20), 20, 20, 'İki'], [o(10), 30, 10, 'Bir']]);
  });

  test('1248 a: adımın dalı ve birleşen dalları gelir; öncüller sıra (seq) ile, tek hatlı rotada null', async () => {
    const urun = await kart('mamul', 'RRR mamul dal');
    const k = await taslakKur(urun, [adim({ dal: 'A' }), adim({ dal: 'B' }), adim({ birlesen: ['A', 'B'] })]);
    const steps = (await durumOku()).routeRevs?.find((r) => r.id === String(k.id))?.data.steps ?? [];
    assert.deepEqual(steps.map((s) => [s.seq, s.dal, s.birlesen, s.onculler]), [
      [10, 'A', [], []], [20, 'B', [], []], [30, null, ['A', 'B'], [{ seq: 10, tur: 'bekleyen' }, { seq: 20, tur: 'bekleyen' }]],
    ]);
    const tek = await taslakKur(await kart('mamul', 'RRR mamul tek'), [adim(), adim()]);
    const tekSteps = (await durumOku()).routeRevs?.find((r) => r.id === String(tek.id))?.data.steps ?? [];
    assert.deepEqual(tekSteps.map((s) => s.onculler), [null, null]);
  });

  test('kart #1289: çerçeve son yazdığında taslak olan rota yürürlüğe girince sayım statüyü ve çıkanı rota modülünden çözer; statü satırı açılır', async () => {
    const urun = await kart('mamul', 'RRR mamul sayım');
    const ym = await kart('yarimamul', 'RRR yarı mamul sayım');
    const k = await taslakKur(urun, [adim({ ad: 'Kesim' }), adim({ ad: 'Tornalama', bilesenler: [] }), adim({ ad: 'Paketleme', bilesenler: [] })]);
    // Çerçevenin son yazımı: rota henüz taslakken (routes boş); OP 20'nin çıkanı yalnız taslak revizyonda.
    const taslakAdimi = (op: number, ek: Record<string, unknown> = {}) => ({ id: `${String(urun)}-o${String(op)}`, opNo: op, seq: op, opId: String(tipId), outItem: '', outStatus: '', ...ek });
    const yaz = await app.inject({
      method: 'POST', url: '/api/recete-rota/kayitlar/yaz', headers: { cookie: tam },
      payload: {
        anahtar: DURUM_ANAHTARI, bicim: 'json', beklenenSurum: (await vt().tek<{ surum: number }>('SELECT surum FROM recete_rota_kayit WHERE anahtar = $1', [DURUM_ANAHTARI]))?.surum ?? null,
        deger: {
          items: [{ id: String(urun), code: 'RRR-SAYIM-MM', type: 'mamul' }, { id: String(hammadde), code: 'RRR-SAYIM-HM', type: 'ham' }, { id: String(ym), code: 'RRR-SAYIM-YM', type: 'yari' }],
          opdefs: [{ id: String(tipId), name: 'Deneme operasyonu' }],
          routes: {},
          routeRevs: [{ id: String(k.id), itemId: String(urun), status: 'taslak', data: { steps: [taslakAdimi(10), taslakAdimi(20, { outItem: String(ym) }), taslakAdimi(30)] } }],
        },
      },
    });
    assert.equal(yaz.statusCode, 200, yaz.body);
    const coz = () => vt().tx(async (db) => ({
      statu: [await adimStatusu(db, { malzemeNo: urun, opNo: 10 }), await adimStatusu(db, { malzemeNo: urun, opNo: 20 })],
      cikti: [await adimCiktisi(db, { malzemeNo: urun, opNo: 10 }), await adimCiktisi(db, { malzemeNo: urun, opNo: 20 })],
    }));
    assert.deepEqual(await coz(), { statu: [null, null], cikti: [null, null] }, 'yürürlükte rota yokken belge olduğu gibi okunur');

    await tamamIstek(tam, 'POST', '/ayarlar/rota.dort-goz/degistir', { deger: false });
    try {
      const g = await komut(k.id, 'onaya-gonder', { surum: k.surum });
      await komut(k.id, 'onayla', { surum: g.surum, yururlugeAl: true });
    } finally {
      await tamamIstek(tam, 'POST', '/ayarlar/rota.dort-goz/degistir', { deger: true });
    }
    const c = await coz();
    const satir = await vt().tek<{ id: number; malzemeNo: string; tur: string }>(
      'SELECT id, malzeme_no AS "malzemeNo", tur FROM recete_rota_statu WHERE kaynak_adim = $1', [`${String(urun)}-o10`]);
    assert.ok(satir, 'OP 10 statüsü sayımda açıldı');
    const hmKodu = (await vt().tek<{ kod: string }>('SELECT stok_kodu AS kod FROM malzeme_katalog_karti WHERE no = $1', [hammadde]))!.kod;
    assert.deepEqual([satir.malzemeNo, satir.tur], [hmKodu, 'HM'], 'statü taşınan hammaddenin; kod belgedeki eski kopyadan değil katalogdan');
    assert.deepEqual(c, { statu: [satir.id, null], cikti: [null, ym] }, 'OP 20 çıkanlı adımdır: statü açmaz, yarı mamule dönüşür');
  });

  test('RRR-5: iptal revizyon çevrilmez; dilim boşken boş sözlük ve dizidir', () => {
    assert.deepEqual(rotaDilimiCevir([], new Map()), { routes: {}, routeRevs: [] });
    const r = rotaDilimiCevir([{ id: 1, malzemeId: 2, harf: 'A', durum: 'iptal', surum: 1, aciklama: null, acilma: '2030-01-01T00:00:00.000Z', onaylama: null, yururlugeAlma: null, adimlar: [] }], new Map());
    assert.deepEqual(r, { routes: {}, routeRevs: [] });
  });
});
