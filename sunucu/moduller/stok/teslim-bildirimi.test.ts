import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { MalzemeIstegiCevabi, TeslimCevabi } from '#paylasilan/sozlesme/stok.ts';
import { butunOlaylariVeEskiKademeleriAc } from '../bildirim/disari.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { suresiDolanTeslimleriIptal } from './servis.ts';

// 3619: teslimin iki ucu ve malzeme isteği bildirimleri; hepsi varsayılan kapalı. Yolda görevdir: alınınca, reddedilince, iptal
// olunca ya da süresi dolunca kapanır. Alıcı kümesi tam olarak ölçülür (fazla alıcı da kırmızıdır). Veriler uydurmadır (ORN-).
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Satir { kisiId: number; baslik: string; metin: string | null; yapildi: string | null; sinif: string; ortada: boolean }

describe('stok: teslim ve istek bildirimleri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();
  let yonetici = 0, sira = 0, taban = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };
  const id = (ad: string): number => kisiler.get(ad)!;

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const baslik = { cookie: cerezler.get(kim) ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: baslik, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const tabanAl = async (): Promise<void> => { taban = (await o().vt.tek<{ n: number }>('SELECT coalesce(max(id), 0)::int AS n FROM bildirim_kaydi'))!.n; };
  const satirlar = (tur: string, kaynak?: string): Promise<Satir[]> => o().vt.sorgu<Satir>(
    `SELECT kisi_id AS "kisiId", baslik, metin, yapildi::text, sinif, ortada FROM bildirim_kaydi
      WHERE tur = $1 AND id > $2 AND ($3::text IS NULL OR tekil_anahtar = $1 || ':' || $3) ORDER BY kisi_id`, [tur, taban, kaynak ?? null]);
  const alicilar = async (tur: string, kaynak?: string): Promise<number[]> => (await satirlar(tur, kaynak)).map((x) => x.kisiId);
  const sirali = (l: readonly number[]): number[] => [...l].sort((a, b) => a - b);

  async function kisiEkle(ad: string, rolKodu: string): Promise<void> {
    const r = (await o().vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rolKodu]))!.id;
    const yon = (await o().vt.tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'"))!.id;
    const k = await o().vt.tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `ORN ${ad}`, kullaniciAdi: ad, parola: PAROLA });
      await rolAta(db, yonetici, yeni, r);
      await rolAl(db, yonetici, yeni, yon);
      return yeni;
    });
    kisiler.set(ad, k);
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerezler.set(ad, String(g.headers['set-cookie']).split(';')[0] ?? '');
  }
  async function kart(): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['TBL-DNM-']);
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'hammadde', 'TBL-DNM-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`tbl-dnm-${sira}`, sira, JSON.stringify({ id: `tbl-dnm-${sira}`, com: { ad: `ORN-Malzeme ${sira}`, birim: 'adet' } }), yonetici]))!.no;
  }
  // İstasyon ve bugün atanmış kişileri; kapsamı sınırsız kişiler her istasyonda iş yapabilir.
  async function istasyon(atananlar: readonly string[]): Promise<number> {
    sira += 1;
    const im = (await o().sahip.tek<{ id: number }>('INSERT INTO is_merkezi (kod, ad) VALUES ($1, $2) RETURNING id', [`TBM${sira}`, 'ORN Merkez']))!.id;
    const ist = (await o().sahip.tek<{ id: number }>(
      'INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ($1, $2, $3, true) RETURNING id', [`TBI${sira}`, `ORN-Istasyon ${sira}`, im]))!.id;
    for (const k of atananlar) await o().sahip.sorgu("INSERT INTO istasyon_kisi (istasyon_id, kisi_id, baslangic, yuzde) VALUES ($1, $2, '2020-01-01', 100)", [ist, id(k)]);
    return ist;
  }
  const kabulKonumu = async (): Promise<number> => (await o().vt.tek<{ id: number }>("SELECT id FROM stok_konum WHERE kod = 'KABUL'"))!.id;
  const malKabul = async (malzemeId: number, miktar: string): Promise<void> => {
    const c = await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId, miktar }] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
  };
  const gonder = async (kim: string, g: Record<string, unknown>): Promise<TeslimCevabi['teslim']> => {
    const c = await istek<TeslimCevabi>(kim, 'POST', '/stok/teslimler/gonder', { statuId: null, not: null, kaynakKimligi: randomUUID(), ...g });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.teslim;
  };
  const depodanIstasyona = async (istasyonId: number, miktar = '2'): Promise<{ h: number; t: TeslimCevabi['teslim'] }> => {
    const h = await kart();
    await malKabul(h, '10');
    return { h, t: await gonder('depo', { malzemeId: h, miktar, kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId } }) };
  };
  const al = async (kim: string, t: TeslimCevabi['teslim'], alinan: string): Promise<TeslimCevabi['teslim']> => {
    const c = await istek<TeslimCevabi>(kim, 'POST', `/stok/teslimler/${t.id}/teslim-al`, { surum: t.surum, alinan });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.teslim;
  };

  before(async () => {
    ortam = await testVeritabaniKur('stok_teslim_bildirimi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yonetici = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'ORN Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    for (const [rol, islemler] of [['depo', ['stok.giris', 'stok.transfer', 'stok.istek']], ['operator', ['stok.istek']], ['kalite', ['stok.istek']]] as const) {
      for (const i of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) SELECT id, $2 FROM rol WHERE kod = $1 ON CONFLICT DO NOTHING', [rol, i]);
    }
    for (const [ad, rol] of [['depo', 'depo'], ['depo2', 'depo'], ['op_a', 'operator'], ['op_b', 'operator'], ['op_c', 'operator'], ['kalite', 'kalite']] as const) await kisiEkle(ad, rol);
  });
  after(async () => { await ortam?.kaldir(); });

  test('kapalıyken yolda görevi yalnız Gelenler\'e düşer ve alınınca kapanır; bilgi türleri hiç yazılmaz (3478-2 a, Risk K1)', async () => {
    await tabanAl();
    const a = await istasyon(['op_a']);
    const { t } = await depodanIstasyona(a);
    const yolda = await satirlar('stok.teslim-yolda', t.no);
    assert.deepEqual(yolda.map((x) => [x.kisiId, x.sinif, x.ortada, x.yapildi]), [[id('op_a'), 'gorev', false, null]]);
    await al('op_a', t, '2');
    assert.notEqual((await satirlar('stok.teslim-yolda', t.no))[0]!.yapildi, null, 'alınınca görev yapıldı olur');
    assert.deepEqual(await satirlar('stok.teslim-alindi'), []);
  });

  describe('olaylar açık', () => {
    before(async () => { await o().vt.tx((db) => butunOlaylariVeEskiKademeleriAc(db, yonetici)); });

    test('yolda: hedef istasyona bugün atananlar alır, gönderen almaz; alınınca görev kapanır ve gönderene "alındı" gider', async () => {
      await tabanAl();
      const a = await istasyon(['op_a', 'op_b']);
      const b = await istasyon(['op_c']);
      const { h, t } = await depodanIstasyona(a, '3');
      assert.deepEqual(await alicilar('stok.teslim-yolda', t.no), sirali([id('op_a'), id('op_b')]), 'yalnız hedef istasyonun atananları; depo ve başka istasyon almaz');
      const s = (await satirlar('stok.teslim-yolda', t.no))[0]!;
      assert.match(s.baslik, /^TS-\d{6}: ORN-Malzeme \d+ yolda$/);
      assert.match(s.metin ?? '', /^3 adet yolda \(TS-\d{6}\)\./);

      await al('op_a', t, '2');
      assert.ok((await satirlar('stok.teslim-yolda', t.no)).every((x) => x.yapildi !== null), 'alınınca bütün alıcılarda yapıldı');
      const alindi = await satirlar('stok.teslim-alindi', t.no);
      assert.deepEqual(alindi.map((x) => x.kisiId), [id('depo')], 'yalnız gönderen; alan almaz');
      assert.match(alindi[0]!.metin ?? '', /^2 adet alındı \(gönderilen 3\), alan ORN op_a\.$/);

      // Gönderen hedef istasyona da atanmışsa kendi teslimi için görev almaz.
      await tabanAl();
      await o().sahip.sorgu("INSERT INTO istasyon_kisi (istasyon_id, kisi_id, baslangic, yuzde) VALUES ($1, $2, '2020-01-01', 100)", [b, id('op_a')]);
      const t2 = await gonder('op_a', { malzemeId: h, miktar: '1', kaynak: { istasyonId: a }, hedef: { istasyonId: b } });
      assert.deepEqual(await alicilar('stok.teslim-yolda', t2.no), [id('op_c')]);
    });

    test('yolda: hedef depoysa depo işlemini (stok.transfer) taşıyanlar alır; istasyondakiler almaz', async () => {
      const a = await istasyon(['op_a']);
      const { t } = await depodanIstasyona(a);
      await al('op_a', t, '2');
      await tabanAl();
      const geri = await gonder('op_a', { malzemeId: t.malzemeId, miktar: '2', kaynak: { istasyonId: a }, hedef: { konumId: await kabulKonumu() } });
      assert.deepEqual(await alicilar('stok.teslim-yolda', geri.no), sirali([yonetici, id('depo'), id('depo2')]));
      await al('depo2', geri, '2');
      assert.deepEqual(await alicilar('stok.teslim-alindi', geri.no), [id('op_a')]);
    });

    test('red: görev kapanır, gönderene nedeniyle "reddedildi" gider; iptal yalnız görevi kapatır', async () => {
      await tabanAl();
      const a = await istasyon(['op_a']);
      const { t } = await depodanIstasyona(a);
      const r = await istek<TeslimCevabi>('op_a', 'POST', `/stok/teslimler/${t.id}/reddet`, { surum: t.surum, neden: 'ORN yanlış malzeme' });
      assert.equal(r.durum, 200, JSON.stringify(r.govde));
      assert.notEqual((await satirlar('stok.teslim-yolda', t.no))[0]!.yapildi, null);
      const red = await satirlar('stok.teslim-reddedildi', t.no);
      assert.deepEqual(red.map((x) => x.kisiId), [id('depo')]);
      assert.match(red[0]!.metin ?? '', /Neden: ORN yanlış malzeme$/);

      const { t: t2 } = await depodanIstasyona(a);
      const ip = await istek<TeslimCevabi>('depo', 'POST', `/stok/teslimler/${t2.id}/iptal-et`, { surum: t2.surum });
      assert.equal(ip.durum, 200, JSON.stringify(ip.govde));
      assert.notEqual((await satirlar('stok.teslim-yolda', t2.no))[0]!.yapildi, null, 'iptal görevi kapatır');
      assert.deepEqual([await satirlar('stok.teslim-reddedildi', t2.no), await satirlar('stok.teslim-alindi', t2.no)], [[], []]);
    });

    test('süresi dolan teslimin yolda görevi kapanır', async () => {
      await tabanAl();
      const a = await istasyon(['op_a']);
      const { t } = await depodanIstasyona(a);
      await o().sahip.sorgu("UPDATE stok_teslim SET gonderim = now() - interval '3 hours' WHERE id = $1", [t.id]);
      await o().sahip.sorgu("INSERT INTO ayar (anahtar, deger, guncelleyen_kisi_id) VALUES ('stok.yolda-suresi-dk', '120', $1)", [yonetici]);
      try {
        assert.ok((await o().vt.tx((db) => suresiDolanTeslimleriIptal(db))) >= 1);
      } finally {
        await o().sahip.sorgu("DELETE FROM ayar WHERE anahtar = 'stok.yolda-suresi-dk'");
      }
      assert.notEqual((await satirlar('stok.teslim-yolda', t.no))[0]!.yapildi, null);
    });

    test('istek: hazırlanınca ve doğrudan teslim edilince isteyene gider; kendi isteğini hazırlayan almaz', async () => {
      await tabanAl();
      const h = await kart();
      await malKabul(h, '10');
      const a = await istasyon([]);
      const ac = async (kim: string): Promise<MalzemeIstegiCevabi['istek']> => {
        const c = await istek<MalzemeIstegiCevabi>(kim, 'POST', '/stok/malzeme-istekleri/ac', { malzemeId: h, miktar: '4', istasyonId: null, not: null, kaynakKimligi: randomUUID() });
        assert.equal(c.durum, 200, JSON.stringify(c.govde));
        return c.govde.istek;
      };
      const i = await ac('kalite');
      const hz = await istek<MalzemeIstegiCevabi>('depo', 'POST', `/stok/malzeme-istekleri/${i.id}/hazirla`, { surum: i.surum });
      assert.equal(hz.durum, 200, JSON.stringify(hz.govde));
      assert.deepEqual(await alicilar('stok.istek-hazir', i.no), [id('kalite')]);
      const te = await istek<MalzemeIstegiCevabi>('depo', 'POST', `/stok/malzeme-istekleri/${i.id}/teslim-et`,
        { surum: hz.govde.istek.surum, karsilanan: '3', kaynakKonumId: await kabulKonumu(), istasyonId: a });
      assert.equal(te.durum, 200, JSON.stringify(te.govde));
      const ted = await satirlar('stok.istek-teslim-edildi', i.no);
      assert.deepEqual(ted.map((x) => x.kisiId), [id('kalite')]);
      assert.match(ted[0]!.metin ?? '', /^3 adet teslim edildi \(istenen 4 adet\); istek kapandı\.$/);

      const kendi = await ac('depo');
      assert.equal((await istek('depo', 'POST', `/stok/malzeme-istekleri/${kendi.id}/hazirla`, { surum: kendi.surum })).durum, 200);
      assert.deepEqual(await alicilar('stok.istek-hazir', kendi.no), [], 'yapan kendisi almaz');
    });

    test('istasyondan istek: kabul "hazır" ve "yolda" yayar; yolda teslimle kapanan istek "teslim edildi" yaymaz', async () => {
      await tabanAl();
      const h = await kart();
      const a = await istasyon(['op_a']);
      const b = await istasyon(['op_b']);
      await malKabul(h, '10');
      const ilk = await gonder('depo', { malzemeId: h, miktar: '6', kaynak: { konumId: await kabulKonumu() }, hedef: { istasyonId: a } });
      await al('op_a', ilk, '6');
      const c = await istek<MalzemeIstegiCevabi>('op_b', 'POST', '/stok/malzeme-istekleri/ac',
        { malzemeId: h, miktar: '4', istasyonId: b, kaynakIstasyonId: a, not: null, kaynakKimligi: randomUUID() });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      const i = c.govde.istek;
      const k = await istek<MalzemeIstegiCevabi>('op_a', 'POST', `/stok/malzeme-istekleri/${i.id}/kabul-et`, { surum: i.surum, miktar: '4', kaynakKimligi: randomUUID() });
      assert.equal(k.durum, 200, JSON.stringify(k.govde));
      assert.deepEqual(await alicilar('stok.istek-hazir', i.no), [id('op_b')]);
      const yolda = k.govde.istek.yoldaTeslim!;
      assert.deepEqual(await alicilar('stok.teslim-yolda', yolda.no), [id('op_b')]);
      const t = (await o().vt.tek<{ surum: number }>('SELECT surum FROM stok_teslim WHERE id = $1', [yolda.id]))!;
      const alinan = await istek<TeslimCevabi>('op_b', 'POST', `/stok/teslimler/${yolda.id}/teslim-al`, { surum: t.surum, alinan: '4' });
      assert.equal(alinan.durum, 200, JSON.stringify(alinan.govde));
      assert.equal((await o().vt.tek<{ durum: string }>('SELECT durum FROM stok_malzeme_istegi WHERE id = $1', [i.id]))!.durum, 'teslim');
      assert.deepEqual(await satirlar('stok.istek-teslim-edildi', i.no), []);
      assert.notEqual((await satirlar('stok.teslim-yolda', yolda.no))[0]!.yapildi, null);
      assert.deepEqual(await alicilar('stok.teslim-alindi', yolda.no), [id('op_a')]);
    });
  });
});
