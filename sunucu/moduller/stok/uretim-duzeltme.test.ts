import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { KaliteDurumu, TeslimCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';
import type { IsEmriGirdisi } from '../uretim-emirleri/disari.ts';
import { kapanisStokDurumu } from './disari.ts';
import { adimStatusuCozucusuKaydet, uretimSayimiYansit } from './servis.ts';
import * as sorgular from './sorgular.ts';

// Uçtan uca deneme düzeltmeleri (1214 D3): kapanışta istasyonda kalan eksi (O-5), sayım düzeltmesinde kalitenin geri dönmesi (O-1),
// eksiden çevirme uyarısının girdiye ve rezerveye göre metni (D-1, D-7).
const PAROLA = 'dogru-parola-1';
const ROL_ISLEMLERI: Record<string, string[]> = { depo: ['stok.giris', 'stok.transfer', 'stok.istek', 'stok.toplama'], operator: ['stok.istek'] };

describe('stok: uçtan uca deneme düzeltmeleri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();
  let projeId = 0;
  let sira = 0;
  // Emrin kaynak rotası gerçek bir revizyon olmalı; iptal durumunda açılır ki rotanın tekil dizinlerine çarpmasın.
  const revizyonlar = new Map<number, number>();
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<{ durum: number; govde: T }> {
    const baslik = { cookie: cerezler.get(kim) ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: baslik, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function kisiEkle(ad: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yonetici = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    kisiler.set(ad, await o().vt.tx(async (db) => {
      const y = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
      await rolAta(db, kisiler.get('yonetici')!, y, rol!.id);
      await rolAl(db, kisiler.get('yonetici')!, y, yonetici!.id);
      return y;
    }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerezler.set(ad, String(g.headers['set-cookie']).split(';')[0] ?? '');
  }
  async function kart(tur: 'hammadde' | 'yarimamul'): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['UUD-DNM-']);
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'UUD-DNM-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`uud-dnm-${sira}`, tur, sira, JSON.stringify({ id: `uud-dnm-${sira}`, com: { ad: `Düzeltme deneme ${sira}`, birim: 'kg' } }), kisiler.get('yonetici')],
    ))!.no;
  }
  async function istasyon(): Promise<{ id: number; makine: number }> {
    sira += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`UIM${sira}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`UIS${sira}`, `Deneme istasyon ${sira}`, im!.id]);
    await o().sahip.sorgu("INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi WHERE kullanici_adi = 'operator'", [ist!.id]);
    const makine = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`UM-${ist!.id}`, 'Tezgah', ist!.id]);
    return { id: ist!.id, makine: makine!.id };
  }
  const konumu = async (istasyonId: number): Promise<number> => (await o().vt.tx((db) => sorgular.istasyonKonumu(db, istasyonId)))!;
  const kabulKonumu = async (): Promise<number> => (await o().vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
  const malKabul = async (malzemeId: number, miktar: string): Promise<void> => {
    const c = await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId, miktar }] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
  };
  async function teslimEt(g: Record<string, unknown>): Promise<void> {
    const t = await istek<TeslimCevabi>('depo', 'POST', '/stok/teslimler/gonder', { statuId: null, not: null, kaynakKimligi: randomUUID(), ...g });
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    const al = await istek('operator', 'POST', `/stok/teslimler/${t.govde.teslim.id}/teslim-al`, { surum: t.govde.teslim.surum, alinan: g.miktar });
    assert.equal(al.durum, 200, JSON.stringify(al.govde));
  }
  // İki adımlı emir: OP 10 hammaddeyi kendi statüsüne çevirir, OP 20 son adımdır. Döner: emir, iş emirleri, OP 10 statüsü.
  async function emir(ym: number, hm: number, a: number, b: number, stoktanRezerve = false): Promise<{ e: number; op10: number; op20: number; s10: number }> {
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`UUD${String(++sira)}`]))!.id;
    const adim = (s: number, makine: number, bilesenler: { malzemeNo: number; miktar: string }[]): IsEmriGirdisi => ({
      sira: s, opNo: s * 10, ad: `Adım ${s}`, operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler,
    });
    const rev = revizyonlar.get(ym) ?? (await o().sahip.tek<{ id: number }>(
      `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
       SELECT $1, 'yarimamul', 'ZZ', 'iptal', p.id, p.id, now() FROM (SELECT min(id) AS id FROM kisi) p RETURNING id`, [ym]))!.id;
    revizyonlar.set(ym, rev);
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const { uretimEmriId: e } = await o().vt.tx((db) => uretimEmriAc(db, planlamaci, {
      projeId, malzemeNo: ym, adet: 10, teslim: null, kaynakRotaRevizyonId: rev, stoktanRezerve,
      isEmirleri: [adim(1, a, [{ malzemeNo: hm, miktar: '0.6' }]), adim(2, b, [])],
    }));
    const [op10, op20] = (await o().vt.sorgu<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY op_no', [e])).map((x) => x.id);
    const s10 = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO recete_rota_statu (malzeme_no, ad, kaynak_adim, renk, tur) VALUES ('HM', 'OP 10', $1, '#2F6FDE', 'HM') RETURNING id", [`uretim-${randomBytes(4).toString('hex')}`]))!.id;
    return { e, op10: op10!, op20: op20!, s10 };
  }
  const sayim = (e: number, isEmriId: number, istasyonId: number, fark: string, kaliteDurumu?: KaliteDurumu) =>
    o().vt.tx((db) => uretimSayimiYansit(db, { uretimEmriId: e, isEmriId, istasyonId, kisiId: kisiler.get('operator')!, fark, ...(kaliteDurumu ? { kaliteDurumu } : {}) }));
  const bakiye = async (malzemeId: number, konumId: number, statuId: number | null, kalite: KaliteDurumu): Promise<number> =>
    Number((await o().vt.tek<{ m: string }>(
      'SELECT COALESCE(sum(miktar), 0)::text AS m FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2 AND statu_id IS NOT DISTINCT FROM $3 AND kalite_durumu = $4',
      [malzemeId, konumId, statuId, kalite]))!.m);

  before(async () => {
    ortam = await testVeritabaniKur('stok_uud');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiler.set('yonetici', await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA })));
    projeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('STOK.UUD', 'Deneme proje', $1) RETURNING id", [kisiler.get('yonetici')]))!.id;
    for (const [rol, islemler] of Object.entries(ROL_ISLEMLERI)) {
      const r = await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]);
      for (const i of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r!.id, i]);
    }
    for (const rol of ['depo', 'operator', 'planlama_proje']) await kisiEkle(rol, rol);
  });
  after(async () => { adimStatusuCozucusuKaydet(async () => null); await ortam?.kaldir(); });

  test('O-5 kapanış: OP 20 parçası teslim edilmeden sayılırsa stok maddesi istasyondaki eksiyi ve parçanın yerini söyler; teslimden sonra söylemez', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const [a, b] = [await istasyon(), await istasyon()];
    const { e, op10, op20, s10 } = await emir(ym, hm, a.makine, b.makine);
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym && g.opNo === 10 ? s10 : null));
    await malKabul(hm, '6');
    await teslimEt({ malzemeId: hm, miktar: '6', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: a.id } });
    await sayim(e, op10, a.id, '10');
    await sayim(e, op20, b.id, '10');
    const [ka, kb] = [await konumu(a.id), await konumu(b.id)];
    assert.deepEqual([await bakiye(hm, ka, s10, 'serbest'), await bakiye(hm, kb, s10, 'serbest')], [6, -6], 'S1: OP 10 istasyonunda +6, OP 20 istasyonunda -6 statülü');
    const [kodA, kodB] = await Promise.all([a, b].map(async (x) => (await o().vt.tek<{ kod: string }>('SELECT kod FROM stok_konum WHERE istasyon_id = $1', [x.id]))!.kod));
    const once = await o().vt.tx((db) => kapanisStokDurumu(db, e));
    assert.equal(once?.durum, 'eksik');
    assert.match(once?.ayrinti ?? '', new RegExp(`istasyonda eksi: ${kodB!} UUD-DNM-\\d+ -6 \\(statülü; aynı statüde ${kodA!}: 6\\)`));

    // Parça OP 20 istasyonuna teslim edilince eksi kapanır; madde istasyondan söz etmez.
    await teslimEt({ malzemeId: hm, miktar: '6', statuId: s10, kaynak: { istasyonId: a.id }, hedef: { istasyonId: b.id } });
    const sonra = await o().vt.tx((db) => kapanisStokDurumu(db, e));
    assert.doesNotMatch(sonra?.ayrinti ?? '', /istasyonda/);
  });

  test('O-1 sayım düzeltmesi: karar bekleyen sayımla çevrilen parça geri çevrilince eski kalitesine döner; eksiden çevrilen lotsuz eksi kapanır', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const [a, b] = [await istasyon(), await istasyon()];
    const { e, op10, s10 } = await emir(ym, hm, a.makine, b.makine);
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym && g.opNo === 10 ? s10 : null));
    await malKabul(hm, '3');
    await teslimEt({ malzemeId: hm, miktar: '3', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: a.id } });
    const ka = await konumu(a.id);
    // 10 adet x 0,6: 3 kg lottan, 3 kg eksiden karar bekleyen statüye çevrilir.
    await sayim(e, op10, a.id, '10', 'karar_bekliyor');
    assert.deepEqual([await bakiye(hm, ka, null, 'serbest'), await bakiye(hm, ka, s10, 'karar_bekliyor')], [-3, 6]);
    // Düzeltme bütün sayımı geri alır: parça serbest hammaddeye döner, karar bekleyen statüsüz parça kalmaz, eksi kapanır.
    await sayim(e, op10, a.id, '-10', 'karar_bekliyor');
    assert.deepEqual(
      [await bakiye(hm, ka, null, 'serbest'), await bakiye(hm, ka, null, 'karar_bekliyor'), await bakiye(hm, ka, s10, 'karar_bekliyor')],
      [3, 0, 0], 'geri çevrilen parça ileri hareketin kaynak kalitesine (serbest) döner');
    const lotsuz = await o().vt.tek<{ n: number }>('SELECT count(*)::int AS n FROM stok_bakiye WHERE malzeme_id = $1 AND konum_id = $2 AND parti_id IS NULL', [hm, ka]);
    assert.equal(lotsuz?.n, 0, 'lotsuz eksi ve lotsuz statülü satır kalmaz');
  });

  test('D-5 (1229 a): parti seçilmeden gönderilen miktar lotlu ve eksiden çevrilmiş lotsuz parçaya bölünür; aynı istek aynı kayıtları döner; yetmezse mevcut söylenir', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const [a, b] = [await istasyon(), await istasyon()];
    const { e, op10, s10 } = await emir(ym, hm, a.makine, b.makine);
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym && g.opNo === 10 ? s10 : null));
    await malKabul(hm, '3');
    await teslimEt({ malzemeId: hm, miktar: '3', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: a.id } });
    await sayim(e, op10, a.id, '10');
    const govde = { malzemeId: hm, miktar: '6', statuId: s10, uretimEmriId: e, kaynak: { istasyonId: a.id }, hedef: { istasyonId: b.id }, not: null, kartOnayi: true };
    const fazla = await istek<{ mesaj: string }>('operator', 'POST', '/stok/teslimler/gonder', { ...govde, miktar: '7', kaynakKimligi: randomUUID() });
    assert.equal(fazla.durum, 400);
    assert.match(fazla.govde.mesaj, /Burada 6 var/);
    const kimlik = randomUUID();
    const t = await istek<TeslimCevabi>('operator', 'POST', '/stok/teslimler/gonder', { ...govde, kaynakKimligi: kimlik });
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    const hepsi = [t.govde.teslim, ...(t.govde.ekTeslimler ?? [])];
    assert.deepEqual(hepsi.map((x) => [x.partiId === null, Number(x.miktar)]), [[false, 3], [true, 3]], 'önce lotlu (en eski), sonra lotsuz');
    const yine = await istek<TeslimCevabi>('operator', 'POST', '/stok/teslimler/gonder', { ...govde, kaynakKimligi: kimlik });
    assert.deepEqual([yine.govde.teslim, ...(yine.govde.ekTeslimler ?? [])].map((x) => x.id), hepsi.map((x) => x.id));
    for (const x of hepsi) {
      const al = await istek('depo', 'POST', `/stok/teslimler/${x.id}/teslim-al`, { surum: x.surum, alinan: x.miktar });
      assert.equal(al.durum, 200, JSON.stringify(al.govde));
    }
    const kb = await konumu(b.id);
    assert.equal(await bakiye(hm, kb, s10, 'serbest'), 6);
  });

  test('D-5 (1229 a) istekli teslim: iki lota bölünür; istek parçaların sonuncusu alınınca alınanların toplamıyla kapanır', async () => {
    const hm = await kart('hammadde');
    const a = await istasyon();
    await malKabul(hm, '5');
    await malKabul(hm, '5');
    const ac = await istek<{ istek: { id: number } }>('operator', 'POST', '/stok/malzeme-istekleri/ac', { malzemeId: hm, miktar: '8', istasyonId: a.id, not: null, kaynakKimligi: randomUUID() });
    assert.equal(ac.durum, 200, JSON.stringify(ac.govde));
    const istekId = ac.govde.istek.id;
    const t = await istek<TeslimCevabi>('depo', 'POST', '/stok/teslimler/gonder', {
      malzemeId: hm, miktar: '8', statuId: null, istekId, kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: a.id }, not: null, kaynakKimligi: randomUUID(),
    });
    assert.equal(t.durum, 200, JSON.stringify(t.govde));
    const parcalar = [t.govde.teslim, ...(t.govde.ekTeslimler ?? [])];
    assert.deepEqual(parcalar.map((x) => [Number(x.miktar), x.istekId]), [[5, istekId], [3, istekId]]);
    const durum = async () => o().vt.tek<{ durum: string; karsilanan: string | null }>('SELECT durum, karsilanan::text AS karsilanan FROM stok_malzeme_istegi WHERE id = $1', [istekId]);
    const al = async (x: (typeof parcalar)[number]) => {
      const c = await istek('operator', 'POST', `/stok/teslimler/${x.id}/teslim-al`, { surum: x.surum, alinan: x.miktar });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
    };
    await al(parcalar[0]!);
    assert.notEqual((await durum())?.durum, 'teslim', 'yolda parça varken istek açık kalır');
    await al(parcalar[1]!);
    const son = await durum();
    assert.deepEqual([son?.durum, Number(son?.karsilanan)], ['teslim', 8]);
  });

  test('D-1 ve D-7 uyarı: ilk adımda eksik olan hammaddedir; istasyondaki hammadde başka emre ayrılıysa uyarı bunu söyler', async () => {
    const [ym, hm] = [await kart('yarimamul'), await kart('hammadde')];
    const [a, b] = [await istasyon(), await istasyon()];
    await malKabul(hm, '6');
    // İlk emir açılışta stoktan ayırır (6 kg); ikinci emir ayrılmamış hammadde bulamaz.
    const ilk = await emir(ym, hm, a.makine, b.makine, true);
    const ikinci = await emir(ym, hm, a.makine, b.makine);
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym && g.opNo === 10 ? (g.uretimEmriId === ilk.e ? ilk.s10 : ikinci.s10) : null));
    await teslimEt({ malzemeId: hm, miktar: '6', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: a.id } });
    const c = await sayim(ikinci.e, ikinci.op10, a.id, '10');
    assert.match(c.uyari ?? '', /Hammadde bu istasyonda başka emre ayrılı \(6\); 6 eksiden çevrildi/);
    assert.doesNotMatch(c.uyari ?? '', /Önceki adımın parçası/);
    // İstasyonda hiç hammadde yoksa metin teslimi ister.
    const [ym2, hm2] = [await kart('yarimamul'), await kart('hammadde')];
    const ucuncu = await emir(ym2, hm2, a.makine, b.makine);
    adimStatusuCozucusuKaydet(async (_db, g) => (g.malzemeNo === ym2 && g.opNo === 10 ? ucuncu.s10 : null));
    const d = await sayim(ucuncu.e, ucuncu.op10, a.id, '5');
    assert.match(d.uyari ?? '', /Hammadde bu istasyonda yok; 3 eksiden çevrildi\. Hammaddeyi bu istasyona teslim ettirin\./);
  });
});
