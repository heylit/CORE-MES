import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { partiIziCevabi, refakatLotaBaglaCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { RefakatPartisiCevabi, TeslimCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { uretimSayimiYansit } from './servis.ts';
import { refakatKartiKapsami, urunSevkiYansit } from './disari.ts';
import type { UrunSevkSatiri } from '../sevkiyat/disari.ts';

// Lot izi (refakat kartı Dal 9): lot okutulunca lotun bütün kartları (lotu taşıyan, lota bağlanırken başka karta birleşen
// istisna kartı dahil), kartlarla üretilen partiler ve eldekileri, bu partilerden sevk çıkışları tek cevapta gelir.
const PAROLA = 'dogru-parola-1';
const ROL_ISLEMLERI: Record<string, string[]> = { depo: ['stok.giris', 'stok.transfer', 'stok.istek', 'stok.toplama'], operator: ['stok.istek'] };

interface Cevap<T = unknown> { durum: number; govde: T }

describe('stok: lot izi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();
  let denemeProjeId = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const baslik = { cookie: cerezler.get(kim) ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: baslik, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  async function kisiEkle(ad: string, rolKodu: string): Promise<void> {
    const rol = await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]);
    const yonetici = await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    const id = await o().vt.tx(async (db) => {
      const y = await yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA });
      await rolAta(db, kisiler.get('yonetici')!, y, rol!.id);
      await rolAl(db, kisiler.get('yonetici')!, y, yonetici!.id);
      return y;
    });
    kisiler.set(ad, id);
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerezler.set(ad, String(g.headers['set-cookie']).split(';')[0] ?? '');
  }
  let sira = 0;
  async function kart(tur: 'hammadde' | 'mamul'): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['LIZ-DNM-']);
    const r = await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'LIZ-DNM-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`liz-dnm-${sira}`, tur, sira, JSON.stringify({ id: `liz-dnm-${sira}`, com: { ad: `Lot izi deneme ${sira}` } }), kisiler.get('yonetici')],
    );
    return r!.no;
  }
  async function istasyon(): Promise<{ id: number; makine: number }> {
    sira += 1;
    const im = await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`LIM${sira}`, 'Deneme Merkezi']);
    const ist = await o().sahip.tek<{ id: number }>('INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`LIS${sira}`, `Deneme istasyon ${sira}`, im!.id]);
    await o().sahip.sorgu("INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi WHERE kullanici_adi = 'operator'", [ist!.id]);
    const makine = await o().sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id', [`LMK${sira}`, 'Tezgah', ist!.id]);
    return { id: ist!.id, makine: makine!.id };
  }
  const malKabul = async (malzemeId: number, miktar: string): Promise<{ id: number; lot_no: string }> => {
    const c = await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId, miktar }] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return (await o().vt.tek<{ id: number; lot_no: string }>('SELECT id, lot_no FROM stok_parti WHERE malzeme_id = $1 ORDER BY id DESC LIMIT 1', [malzemeId]))!;
  };
  const iz = async (partiId: number) => {
    const c = await istek('depo', 'GET', `/stok/partiler/${partiId}/iz`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return partiIziCevabi.parse(c.govde);
  };

  before(async () => {
    ortam = await testVeritabaniKur('stok_lot_izi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiler.set('yonetici', await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA })));
    denemeProjeId = (await ortam.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('STOK.LOTIZI', 'Deneme proje', $1) RETURNING id", [kisiler.get('yonetici')]))!.id;
    for (const [rol, islemler] of Object.entries(ROL_ISLEMLERI)) {
      const r = await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]);
      for (const i of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r!.id, i]);
    }
    for (const rol of ['depo', 'operator', 'planlama_proje']) await kisiEkle(rol, rol);
  });
  after(async () => { await ortam?.kaldir(); });

  test('yetki: stok okuması olmayan lot izini okuyamaz; oturumsuz 401; olmayan parti 404', async () => {
    const lot = await malKabul(await kart('hammadde'), '1');
    assert.equal((await istek('operator', 'GET', `/stok/partiler/${lot.id}/iz`)).durum, 403);
    assert.equal((await istek('oturumsuz', 'GET', `/stok/partiler/${lot.id}/iz`)).durum, 401);
    assert.equal((await istek('depo', 'GET', '/stok/partiler/999999999/iz')).durum, 404);
    const bos = await iz(lot.id);
    assert.deepEqual([bos.kartlar, bos.ciktilar, bos.sevkCikislari], [[], [], []], 'kartsız lotta kart, çıktı ve sevk yok');
  });

  test('lotun kartları, kartla üretilen partiler, eldeki ve sevk çıkışı; lota birleşerek bağlanan istisna kartı da lotun kartıdır', async () => {
    const [mm, hm] = [await kart('mamul'), await kart('hammadde')];
    const [a, b] = [await istasyon(), await istasyon()];
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, 'Deneme tipi', 'TAL') RETURNING id", [`LT-${sira}`]))!.id;
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const revizyon = (await o().sahip.tek<{ id: number }>(
      `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
       VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id`, [mm, kisiler.get('yonetici')]))!.id;
    const emirAc = async (makine: number) => (await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, {
      projeId: denemeProjeId, malzemeNo: mm, adet: 10, teslim: null, kaynakRotaRevizyonId: revizyon, isEmirleri: [{
        sira: 1, opNo: 10, ad: 'Adım 1', operasyonTipiId: tip, kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: '10', birimSureDk: '1',
        terminGun: null, bagimlilik: 'bekleyen', devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: [{ malzemeNo: hm, miktar: '1' }],
      }],
    }))).uretimEmriId;
    const [e, e2] = [await emirAc(a.makine), await emirAc(b.makine)];
    const ilkAdim = async (emir: number) => (await o().vt.tek<{ id: number }>('SELECT id FROM uretim_emirleri_is_emri WHERE uretim_emri_id = $1 ORDER BY op_no LIMIT 1', [emir]))!.id;
    const operator = kisiler.get('operator')!;
    const saglam = async (emir: number, istasyonId: number, fark: string, refakatPartisiId: number | null) =>
      o().vt.tx(async (db) => uretimSayimiYansit(db, { uretimEmriId: emir, isEmriId: await ilkAdim(emir), istasyonId, kisiId: operator, fark, refakatPartisiId }));

    // Lot kartla A istasyonuna gider; A kartla üç parça sayar, parçalar kartın partisine girer.
    const lot = await malKabul(hm, '10');
    const r = (await istek<RefakatPartisiCevabi>('depo', 'POST', '/stok/refakat-partileri/ac', { uretimEmriId: e, lotKodu: `LOT:${lot.lot_no}` })).govde.refakat;
    const kabul = (await o().vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
    const g = await istek<TeslimCevabi>('depo', 'POST', '/stok/teslimler/gonder', {
      statuId: null, not: null, kaynakKimligi: randomUUID(), malzemeId: hm, miktar: '10', kaynak: { konumId: kabul }, hedef: { istasyonId: a.id }, refakatPartisiId: r.id,
    });
    assert.equal(g.durum, 200, JSON.stringify(g.govde));
    assert.equal((await istek('operator', 'POST', `/stok/teslimler/${g.govde.teslim.id}/teslim-al`, { surum: g.govde.teslim.surum, alinan: '10' })).durum, 200);
    await saglam(e, a.id, '3', r.id);
    const urun = (await o().vt.tek<{ id: number; lot_no: string }>('SELECT id, lot_no FROM stok_parti WHERE malzeme_id = $1 AND refakat_partisi_id = $2', [mm, r.id]))!;

    // B'de malzeme yok: kartsız sayım istisna kartına lotsuz düşer; emrin aynı lotlu kartıyla bağlanınca ona birleşir (lotu almaz).
    await saglam(e2, b.id, '1', null);
    const istisna = (await o().vt.tek<{ id: number; surum: number }>('SELECT id, surum FROM stok_refakat_partisi WHERE uretim_emri_id = $1 AND parti_id IS NULL', [e2]))!;
    const r2 = (await istek<RefakatPartisiCevabi>('depo', 'POST', '/stok/refakat-partileri/ac', { uretimEmriId: e2, lotKodu: `LOT:${lot.lot_no}` })).govde.refakat;
    const bag = await istek('depo', 'POST', `/stok/refakat-partileri/${istisna.id}/lota-bagla`, { kod: r2.qr, surum: istisna.surum });
    assert.equal(bag.durum, 200, JSON.stringify(bag.govde));
    assert.equal(refakatLotaBaglaCevabi.parse(bag.govde).refakat.id, r2.id);

    // Kartın partisinden iki parça sevk edilir (firmasız nokta: teslim bulunduğu konumdan düşer).
    const satir: UrunSevkSatiri = { isId: 1, uretimEmriId: e, adet: '2', firmaId: null };
    for (const [onceki, yeni] of [['planlandi', 'yolda'], ['yolda', 'tamamlandi']] as const) {
      await o().vt.tx((db) => urunSevkiYansit(db, { satirlar: [satir], onceki, yeni, kisiId: kisiler.get('depo')! }));
    }

    const l = await iz(lot.id);
    assert.deepEqual(l.kartlar.map((k) => k.id), [r.id, istisna.id, r2.id].sort((x, y) => x - y), 'lotu taşıyan kartlar ve onlara birleşen istisna kartı');
    const istisnaCiktisi = (await o().vt.tek<{ id: number }>('SELECT id FROM stok_parti WHERE refakat_partisi_id = $1', [istisna.id]))!.id;
    assert.deepEqual(l.ciktilar.map((c) => [c.partiId, c.refakatPartisiId, c.eldeki]), [[urun.id, r.id, '1'], [istisnaCiktisi, istisna.id, '1']],
      'istisna kartıyla sayılan parça da lotun çıktısıdır');
    assert.deepEqual(l.sevkCikislari.map((x) => [x.partiId, x.lotNo, x.miktar, x.malzemeId]), [[urun.id, urun.lot_no, '2', mm]]);
    assert.ok([e, e2].every((x) => l.emirler.includes(x)), 'kartların emirleri lotun emirlerindedir');

    // Üretim partisinin izi onu üreten kartı ve kartın çıktısını verir.
    const u = await iz(urun.id);
    assert.deepEqual(u.kartlar.map((k) => k.id), [r.id]);
    assert.deepEqual(u.ciktilar.map((c) => c.partiId), [urun.id]);
    assert.equal(u.sevkCikislari.length, 1);

    // Kart #708: kartın kapsamı lotu ve kartla sayılan partiyi, lotun teslimini verir; olmayan kart null.
    const k = (await o().vt.tx((db) => refakatKartiKapsami(db, r.id)))!;
    assert.deepEqual([k.refakat.id, k.partiIdler], [r.id, [lot.id, urun.id]]);
    assert.deepEqual(k.teslimler.map((t) => [t.id, t.durum, t.partiId, t.miktar, t.alinan, t.kapanis !== null]), [[g.govde.teslim.id, 'teslim', lot.id, '10.000', '10.000', true]]);
    assert.deepEqual(k.teslimler.map((t) => [t.gonderenKisiId, t.kapatanKisiId]), [[kisiler.get('depo'), kisiler.get('operator')]], 'gönderen ve teslim alan (kart #708)');
    assert.equal(await o().vt.tx((db) => refakatKartiKapsami(db, 2147483000)), null);
  });
});
