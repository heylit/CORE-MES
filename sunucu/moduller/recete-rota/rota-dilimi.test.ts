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
import type { DurumRotaAdimi } from '../rota/disari.ts';
import { rotaDilimiCevir } from './kurallar.ts';
import { adimCiktisi, adimStatusu } from './servis.ts';
import { anaKayitSurumu, anaKayitYaz } from './test-ortak.ts';

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
        adaylar: [{ kaynak: { tur: 'istasyon', id: istB }, ayarSuresiDk: 5, birimSureDk: 6 }, { kaynak: { tur: 'makine', id: makineB }, ayarSuresiDk: 0, birimSureDk: 7 }],
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
      id: `${String(urun)}-o10`, opNo: 10, seq: 10, opId: String(tipId), name: 'Birinci', stationId: String(istA), machineId: String(makineA), kisiId: null, fasonId: null, fason: false, terminGun: null,
      setup: 10, proc: 3, chg: 1, cycle: 4, dep: 'bagimli', depQty: null, rejectPct: 2, split: 'bol', minLot: 5, resetup: false, hazirlik: 0, ayarli: true, ayarDk: 10, ilkParca: 'yok', kontrolTuru: 'gkk', muayeneSuresiSaat: null, dal: null, birlesen: [], adetCarpani: null, ciktiId: null, onculler: null,
      alts: [String(istB)], altTimes: { [String(istB)]: { setup: 5, cycle: 6 } },
      digerAdaylar: [{ tur: 'makine', id: String(makineB), setup: 0, proc: 7, chg: null, cycle: 7 }],
      ins: [{ itemId: String(hammadde), qty: 2, scrap: 5 }], outs: [{ itemId: String(yanUrun), qty: 0.5, kind: 'yan' }],
    });
    // İstasyona bağlı adımda makine yoktur; ayarı 0 olan süre 0'dır (uydurma değil), girilmeyen değişim null; kaynağı olmayan adımın istasyonu null.
    assert.deepEqual(
      { id: s2?.id, stationId: s2?.stationId, machineId: s2?.machineId, setup: s2?.setup, proc: s2?.proc, chg: s2?.chg, dep: s2?.dep, depQty: s2?.depQty },
      { id: `${String(urun)}-o20`, stationId: String(istC), machineId: null, setup: 0, proc: 8, chg: null, dep: 'ortulu', depQty: 10 },
    );
    assert.deepEqual(
      { stationId: s3?.stationId, setup: s3?.setup, proc: s3?.proc, cycle: s3?.cycle, dep: s3?.dep, split: s3?.split, minLot: s3?.minLot, ilkParca: s3?.ilkParca },
      { stationId: null, setup: 1, proc: 2, cycle: 2, dep: 'bagimsiz', split: 'tek', minLot: null, ilkParca: 'yok' },
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
    await komut(k.id, 'geri-gonder', { surum: g.surum, neden: 'Süreleri kontrol et.' });
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
    // 3165 a: bölünmüş eski anahtar rota dilimini açmaz.
    const eski = await durumOku(await islemliKisi('eskici', ['recete-rota.oku', 'rota.yaz']));
    assert.deepEqual([eski.routes, eski.routeRevs], [null, null]);
    for (const [ad, islem] of [['sayfali', 'sayfa.rota'], ['yazar', 'rota.revizyon-yaz'], ['onaycisi', 'rota.onayla']] as const) {
      const cerez = await islemliKisi(ad, ['recete-rota.oku', islem]);
      const d = await durumOku(cerez);
      assert.notEqual(d.routeRevs, null, ad);
      assert.equal((d.routeRevs ?? []).length > 0, true, ad);
    }
    assert.equal((await durumOku(tam)).routes !== null, true);
  });

  test('RRR-6, 3252 b: adım sırası seq, OP numarası opNo ve kimliktir; sıra değişince numara da sıradan yeniden dizilir, adım bağı adımını izler', async () => {
    const urun = await kart('mamul', 'RRR mamul 6');
    const ym = await kart('yarimamul', 'RRR YM 6');
    const k = await taslakKur(urun, [adim({ ad: 'Bir' }), adim({ ad: 'İki' }), adim({ ad: 'Üç' })]);
    const ilk = (await durumOku()).routeRevs?.find((r) => r.id === String(k.id))?.data.steps ?? [];
    const o = (n: number): string => `${String(urun)}-o${String(n)}`;
    assert.deepEqual(ilk.map((s) => [s.id, s.seq, s.opNo, s.name]), [[o(10), 10, 10, 'Bir'], [o(20), 20, 20, 'İki'], [o(30), 30, 30, 'Üç']]);
    // Eski adım bağı (revizyon, OP) 'Bir' adımındadır; 'İki' silinip kalanlar ters dizilince bağ 'Bir' ile OP 20'ye gider.
    await vt().sorgu('INSERT INTO recete_rota_adim_bagi (rota_revizyonu_id, malzeme_id, op_no, cikti_malzeme_id, guncelleyen_kisi_id) VALUES ($1, $2, 10, $3, $4), ($1, $2, 20, $3, $4)',
      [k.id, urun, ym, yoneticiId]);
    const ters = [ilk[2]!, ilk[0]!];
    await tamamIstek(tam, 'POST', `/rota/revizyonlar/${String(k.id)}/kaydet`, {
      surum: k.surum, aciklama: null, adimlar: ters.map((s) => adim({ opNo: s.opNo, ad: s.name })),
    });
    const sonra = (await durumOku()).routeRevs?.find((r) => r.id === String(k.id))?.data.steps ?? [];
    assert.deepEqual(sonra.map((s) => [s.id, s.seq, s.opNo, s.name]), [[o(10), 10, 10, 'Üç'], [o(20), 20, 20, 'Bir']]);
    assert.deepEqual(await vt().sorgu('SELECT op_no AS op FROM recete_rota_adim_bagi WHERE rota_revizyonu_id = $1 ORDER BY op_no', [k.id]), [{ op: 20 }],
      'silinen adımın bağı silinir, kalan adımın bağı yeni numarasına gider');
  });

  test('1248 a, 1257 a: adımın dalı, dal çarpanı ve birleşen dalları gelir; öncüller sıra (seq) ile, tek hatlı rotada null', async () => {
    const urun = await kart('mamul', 'RRR mamul dal');
    const k = await taslakKur(urun, [adim({ dal: 'A', adetCarpani: 2 }), adim({ dal: 'B' }), adim({ birlesen: ['A', 'B'] })]);
    const steps = (await durumOku()).routeRevs?.find((r) => r.id === String(k.id))?.data.steps ?? [];
    // 1257 a: dal çarpanı plana gider; 1 ve ana hat boş döner.
    assert.deepEqual(steps.map((s) => s.adetCarpani), [2, null, null]);
    assert.deepEqual(steps.map((s) => [s.seq, s.dal, s.birlesen, s.onculler]), [
      [10, 'A', [], []], [20, 'B', [], []], [30, null, ['A', 'B'], [{ seq: 10, tur: 'bekleyen' }, { seq: 20, tur: 'bekleyen' }]],
    ]);
    const tek = await taslakKur(await kart('mamul', 'RRR mamul tek'), [adim(), adim()]);
    const tekSteps = (await durumOku()).routeRevs?.find((r) => r.id === String(tek.id))?.data.steps ?? [];
    assert.deepEqual(tekSteps.map((s) => s.onculler), [null, null]);
  });

  test('1310 a: adımın hazırlığı, ayar işareti ve ayar süresi gelir; setup toplamdır', async () => {
    const k = await taslakKur(await kart('mamul', 'RRR mamul ayar'), [
      adim({ ayarSuresiDk: 30, hazirlikDk: 5, ayar: true, ayarDk: 25 }), adim({ ayarSuresiDk: 8, hazirlikDk: 8, ayar: false, bilesenler: [] }),
    ]);
    const steps = (await durumOku()).routeRevs?.find((r) => r.id === String(k.id))?.data.steps ?? [];
    assert.deepEqual(steps.map((s) => [s.setup, s.hazirlik, s.ayarli, s.ayarDk]), [[30, 5, true, 25], [8, 8, false, null]]);
  });

  test('kart #1289: çerçeve son yazdığında taslak olan rota yürürlüğe girince sayım statüyü ve çıkanı rota modülünden çözer; statü satırı açılır', async () => {
    const urun = await kart('mamul', 'RRR mamul sayım');
    const ym = await kart('yarimamul', 'RRR yarı mamul sayım');
    const k = await taslakKur(urun, [adim({ ad: 'Kesim' }), adim({ ad: 'Tornalama', bilesenler: [] }), adim({ ad: 'Paketleme', bilesenler: [] })]);
    // Revizyon rota_adim_ciktisi'nden önce yazılmış gibi (3320 a, K2): çıktı satırı yoksa eski adım bağı okunur.
    await vt().sorgu('DELETE FROM rota_adim_ciktisi WHERE adim_id IN (SELECT id FROM rota_adimi WHERE revizyon_id = $1)', [k.id]);
    // Çerçevenin son yazımı: rota henüz taslakken (routes boş); OP 20'nin çıkanı yalnız taslak revizyonda.
    const taslakAdimi = (op: number, ek: Record<string, unknown> = {}) => ({ id: `${String(urun)}-o${String(op)}`, opNo: op, seq: op, opId: String(tipId), outItem: '', outStatus: '', ...ek });
    await anaKayitYaz(vt(), {
      items: [{ id: String(urun), code: 'RRR-SAYIM-MM', type: 'mamul' }, { id: String(hammadde), code: 'RRR-SAYIM-HM', type: 'ham' }, { id: String(ym), code: 'RRR-SAYIM-YM', type: 'yari' }],
      opdefs: [{ id: String(tipId), name: 'Deneme operasyonu' }],
      routes: {},
      routeRevs: [{ id: String(k.id), itemId: String(urun), status: 'taslak', data: { steps: [taslakAdimi(10), taslakAdimi(20, { outItem: String(ym) }), taslakAdimi(30)] } }],
    }, await anaKayitSurumu(vt()));
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

  test('RRR-6 (2681, Veri V2): firmasız fason adım fason true ve fasonId null çevrilir ("null" metni yok); firmalı fason firmasıyla', () => {
    const adim = (opNo: number, kaynak: DurumRotaAdimi['kaynak']): DurumRotaAdimi => ({
      opNo, operasyonTipiId: 1, ad: 'Kaplama', kaynak, terminGun: 5, ayarSuresiDk: null, birimSureDk: null, islemSuresiDk: null, degisimSuresiDk: null,
      bagimlilik: 'bekleyen', devirAdedi: null, firePayiYuzde: '0', makineKullanimi: 'tek', enKucukParca: null, yenidenAyar: true, kontrolTuru: 'gkk', muayeneSuresiSaat: null, hazirlikDk: null,
      ayar: false, ayarDk: null, ilkParca: 'her_kurulum', adaylar: [], bilesenler: [], yanUrunler: [], dal: null, adetCarpani: null, birlesen: [], onculler: null,
      ciktiMalzemeId: null, ciktiYazili: false,
    });
    const r = rotaDilimiCevir([{
      id: 1, malzemeId: 2, harf: 'A', durum: 'yururlukte', surum: 1, aciklama: null, acilma: '2030-01-01T00:00:00.000Z', onaylama: null, yururlugeAlma: null,
      geriGondermeNedeni: null, rotaId: 1, rotaStandart: true, adimlar: [adim(10, { tur: 'fason', id: null }), adim(20, { tur: 'fason', id: 7 })],
    }], new Map());
    const [a, b] = r.routes['2']!.steps;
    assert.deepEqual([a?.fason, a?.fasonId, a?.stationId, a?.machineId, a?.terminGun], [true, null, null, null, 5]);
    assert.deepEqual([b?.fason, b?.fasonId], [true, '7']);
  });

  test('3320 a (T2-T4, T6, T7, K6): ara adımın çıktı kartı kaydedilir, ekrana ciktiId ile gelir, yeni taslağa kopyalanır; kural ihlali reddedilir', async () => {
    const urun = await kart('mamul', 'ORN-MM çıktılı');
    const ym = await kart('yarimamul', 'ORN-YM ara');
    const uc = [adim({ ad: 'Kesim' }), adim({ ad: 'Tornalama', bilesenler: [] }), adim({ ad: 'Paketleme', bilesenler: [] })];
    const k = await taslakKur(urun, uc);
    const adimlari = async (id: number) => (await tamamIstek<RevizyonAyrintisi>(tam, 'GET', `/rota/revizyonlar/${String(id)}`)).adimlar;
    const kaydet = (id: number, surum: number, adimlar: AdimGirdisi[]) => istek(tam, 'POST', `/rota/revizyonlar/${String(id)}/kaydet`, { surum, aciklama: 'Deneme notu', adimlar });
    const opNolu = async (id: number, cikti: (number | null | undefined)[]) =>
      (await adimlari(id)).map((a, i) => ({ ...uc[i]!, opNo: a.opNo, ...(cikti[i] === undefined ? {} : { ciktiMalzemeId: cikti[i] }) }));

    // T2 (V1): son adımda çıktı reddedilir; alan adımı gösterir.
    const son = await kaydet(k.id, k.surum, await opNolu(k.id, [null, null, ym]));
    assert.equal(son.statusCode, 400, son.body);
    assert.deepEqual([son.json().alan, /Son adım/.test(son.body)], ['adimlar.2.ciktiMalzemeId', true]);
    const ok = await kaydet(k.id, k.surum, await opNolu(k.id, [null, ym, null]));
    assert.equal(ok.statusCode, 200, ok.body);
    let surum = (ok.json() as KomutCevabi).surum;
    assert.deepEqual((await adimlari(k.id)).map((a) => a.ciktiMalzeme?.id ?? null), [null, ym, null]);
    // Alanı göndermeyen kayıt (eski görünüm) kayıtlı çıktıyı korur.
    const koru = await kaydet(k.id, surum, await opNolu(k.id, [undefined, undefined, undefined]));
    assert.equal(koru.statusCode, 200, koru.body);
    surum = (koru.json() as KomutCevabi).surum;
    assert.deepEqual((await adimlari(k.id)).map((a) => a.ciktiMalzeme?.id ?? null), [null, ym, null]);
    // Ekrana: çıktısı yazılmış revizyonda her adım ciktiId taşır (statülü null).
    const ekran = (await durumOku()).routeRevs?.find((r) => r.id === String(k.id))?.data.steps ?? [];
    assert.deepEqual(ekran.map((x) => x.ciktiId), [null, String(ym), null]);
    // T7: rota satırı varken eski adım bağı okunmaz.
    await vt().sorgu('INSERT INTO recete_rota_adim_bagi (rota_revizyonu_id, malzeme_id, op_no, cikti_malzeme_id, guncelleyen_kisi_id) VALUES ($1, $2, $3, $4, $5)', [k.id, urun, ekran[0]!.opNo, ym, yoneticiId]);
    assert.deepEqual(((await durumOku()).routeRevs?.find((r) => r.id === String(k.id))?.data.steps ?? []).map((x) => x.ciktiId), [null, String(ym), null]);

    // T4 ve K6: onaylanıp yürürlüğe girer; YM'nin kendi rotası, başka rotanın çıktısıyken onaylanmaz.
    await tamamIstek(tam, 'POST', '/ayarlar/rota.dort-goz/degistir', { deger: false });
    try {
      const g = await komut(k.id, 'onaya-gonder', { surum });
      const y = await komut(k.id, 'onayla', { surum: g.surum, yururlugeAl: true });
      const kilitli = await kaydet(k.id, y.surum, await opNolu(k.id, [null, null, null]));
      assert.notEqual(kilitli.statusCode, 200, 'yürürlükteki revizyonun çıktısı değişmez');
      const ymRota = await taslakKur(ym, [adim({ ad: 'YM kesim' })]);
      const red = await istek(tam, 'POST', `/rota/revizyonlar/${String(ymRota.id)}/onaya-gonder`, { surum: ymRota.surum });
      assert.notEqual(red.statusCode, 200, red.body);
      assert.match(red.body, /ara adımın çıktısı/);

      // T6: yürürlükteki revizyondan açılan taslak çıktıyı taşır; T3: statülüye dönüş boş satır yazar.
      const yeni = await tamamIstek<KomutCevabi>(tam, 'POST', `/rota/urunler/${String(urun)}/taslak-ac`, { kaynak: { tur: 'revizyon', revizyonId: k.id } });
      assert.deepEqual((await adimlari(yeni.id)).map((a) => a.ciktiMalzeme?.id ?? null), [null, ym, null]);
      const geri = await kaydet(yeni.id, yeni.surum, await opNolu(yeni.id, [null, null, null]));
      assert.equal(geri.statusCode, 200, geri.body);
      const satirlar = await vt().sorgu<{ c: number | null }>(
        'SELECT c.cikti_malzeme_id AS c FROM rota_adim_ciktisi c JOIN rota_adimi a ON a.id = c.adim_id WHERE a.revizyon_id = $1 ORDER BY a.op_no', [yeni.id]);
      assert.deepEqual(satirlar.map((x) => x.c), [null, null, null]);
      assert.deepEqual((await adimlari(k.id)).map((a) => a.ciktiMalzeme?.id ?? null), [null, ym, null], 'yürürlükteki revizyon değişmedi');
    } finally {
      await tamamIstek(tam, 'POST', '/ayarlar/rota.dort-goz/degistir', { deger: true });
    }
  });

  test('3320 a (Test kod T1-T3): pasife alınan ya da rotası açılan çıktı kartı onayda reddedilir; kayıtta yalnız yeni seçim denetlenir; başka ürüne kopyada çıktı düşer', async () => {
    const urun = await kart('mamul', 'ORN-MM onay');
    const ym = await kart('yarimamul', 'ORN-YM pasif');
    const ym2 = await kart('yarimamul', 'ORN-YM rotalı');
    const uc = [adim({ ad: 'Kesim' }), adim({ ad: 'Tornalama', bilesenler: [] }), adim({ ad: 'Paketleme', bilesenler: [] })];
    const k = await taslakKur(urun, uc);
    const adimlari = async (id: number) => (await tamamIstek<RevizyonAyrintisi>(tam, 'GET', `/rota/revizyonlar/${String(id)}`)).adimlar;
    const kaydet = (id: number, surum: number, adimlar: AdimGirdisi[]) => istek(tam, 'POST', `/rota/revizyonlar/${String(id)}/kaydet`, { surum, aciklama: 'Deneme notu', adimlar });
    const govde = async (id: number, cikti: (number | null | undefined)[], ad = 'Tornalama') =>
      (await adimlari(id)).map((a, i) => ({ ...uc[i]!, ...(i === 1 ? { ad } : {}), opNo: a.opNo, ...(cikti[i] === undefined ? {} : { ciktiMalzemeId: cikti[i] }) }));
    const ilk = await kaydet(k.id, k.surum, await govde(k.id, [ym, null, null]));
    assert.equal(ilk.statusCode, 200, ilk.body);
    let surum = (ilk.json() as KomutCevabi).surum;

    // T2: seçili kart pasife alınınca taslağın başka alanı kaydedilir; aynı kartı başka adıma yeni seçmek reddedilir.
    await vt().sorgu("UPDATE malzeme_katalog_karti SET onay_durumu = 'pasif' WHERE no = $1", [ym]);
    const baska = await kaydet(k.id, surum, await govde(k.id, [ym, null, null], 'Tornalama 2'));
    assert.equal(baska.statusCode, 200, baska.body);
    surum = (baska.json() as KomutCevabi).surum;
    const yeniSecim = await kaydet(k.id, surum, await govde(k.id, [null, ym, null]));
    assert.equal(yeniSecim.statusCode, 400, yeniSecim.body);
    assert.deepEqual([yeniSecim.json().alan, /kullanımda değil/.test(yeniSecim.body)], ['adimlar.1.ciktiMalzemeId', true]);

    // T1: onaya gönderme pasif çıktıyı reddeder; kart başka çıktıya çevrilip o kartın rotası açılınca yine reddedilir.
    const pasifRet = await istek(tam, 'POST', `/rota/revizyonlar/${String(k.id)}/onaya-gonder`, { surum });
    assert.notEqual(pasifRet.statusCode, 200, pasifRet.body);
    assert.match(pasifRet.body, /kullanımda değil/);
    const cevir = await kaydet(k.id, surum, await govde(k.id, [ym2, null, null]));
    assert.equal(cevir.statusCode, 200, cevir.body);
    surum = (cevir.json() as KomutCevabi).surum;
    await taslakKur(ym2, [adim({ ad: 'YM kesim' })]);
    const rotaliRet = await istek(tam, 'POST', `/rota/revizyonlar/${String(k.id)}/onaya-gonder`, { surum });
    assert.notEqual(rotaliRet.statusCode, 200, rotaliRet.body);
    assert.match(rotaliRet.body, /kendi rotası/);

    // T3: başka ürüne kopyada ara adım çıktısı taşınmaz; hedefin adımları statülü başlar.
    const hedef = await kart('mamul', 'ORN-MM kopya hedefi');
    const kopya = await tamamIstek<KomutCevabi>(tam, 'POST', `/rota/revizyonlar/${String(k.id)}/kopyala`, { hedefUrunId: hedef });
    assert.deepEqual((await adimlari(kopya.id)).map((a) => a.ciktiMalzeme?.id ?? null), [null, null, null]);
    assert.deepEqual((await adimlari(k.id)).map((a) => a.ciktiMalzeme?.id ?? null), [ym2, null, null], 'kaynak revizyon değişmedi');
  });

  test('3320 a (K2): çıktısı hiç yazılmamış revizyonda eski adım bağının kartı ekrana ciktiId olarak gelir', async () => {
    const urun = await kart('mamul', 'ORN-MM eski bağ');
    const ym = await kart('yarimamul', 'ORN-YM eski bağ');
    const k = await taslakKur(urun, [adim({ ad: 'Kesim' }), adim({ ad: 'Paketleme', bilesenler: [] })]);
    await vt().sorgu('DELETE FROM rota_adim_ciktisi WHERE adim_id IN (SELECT id FROM rota_adimi WHERE revizyon_id = $1)', [k.id]);
    const once = (await durumOku()).routeRevs?.find((r) => r.id === String(k.id))?.data.steps ?? [];
    assert.deepEqual(once.map((x) => x.ciktiId), [undefined, undefined], 'bağ yokken alan gelmez; ekran göndermez, sunucu korur');
    await vt().sorgu('INSERT INTO recete_rota_adim_bagi (rota_revizyonu_id, malzeme_id, op_no, cikti_malzeme_id, guncelleyen_kisi_id) VALUES ($1, $2, $3, $4, $5)', [k.id, urun, once[0]!.opNo, ym, yoneticiId]);
    const sonra = (await durumOku()).routeRevs?.find((r) => r.id === String(k.id))?.data.steps ?? [];
    assert.deepEqual(sonra.map((x) => x.ciktiId), [String(ym), undefined]);
  });

  test('RRR-5: iptal revizyon çevrilmez; dilim boşken boş sözlük ve dizidir', () => {
    assert.deepEqual(rotaDilimiCevir([], new Map()), { routes: {}, routeRevs: [] });
    const r = rotaDilimiCevir([{ id: 1, malzemeId: 2, harf: 'A', durum: 'iptal', surum: 1, aciklama: null, acilma: '2030-01-01T00:00:00.000Z', onaylama: null, yururlugeAlma: null, geriGondermeNedeni: null, rotaId: 1, rotaStandart: true, adimlar: [] }], new Map());
    assert.deepEqual(r, { routes: {}, routeRevs: [] });
  });
});
