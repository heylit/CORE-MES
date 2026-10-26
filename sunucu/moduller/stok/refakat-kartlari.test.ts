import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { refakatKartlariCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { RefakatPartisiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { kullaniciYukle, rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { uretimEmriAc } from '../uretim-emirleri/disari.ts';

// Refakat kartları sayfası (kart #708): en yeni kart önce, emrin ürünü, adedi, termini ve adım sayısıyla; iptal yalnız "tümü"nde.
const PAROLA = 'dogru-parola-1';
const ROL_ISLEMLERI: Record<string, string[]> = { depo: ['stok.giris', 'stok.transfer', 'stok.istek', 'stok.toplama'], operator: ['stok.istek'] };

describe('stok: refakat kartları listesi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  const cerezler = new Map<string, string>();
  const kisiler = new Map<string, number>();
  let sira = 0;
  const o = (): TestVeritabani => { if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ayarları).'); return ortam; };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<{ durum: number; govde: T }> {
    const baslik = { cookie: cerezler.get(kim) ?? '', ...(yontem === 'POST' ? { [ISTEK_KIMLIGI_BASLIGI]: randomUUID() } : {}) };
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: baslik, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
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
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: ad, parola: PAROLA } });
    assert.equal(g.statusCode, 200);
    cerezler.set(ad, String(g.headers['set-cookie']).split(';')[0] ?? '');
  }
  async function kart(tur: 'hammadde' | 'mamul'): Promise<number> {
    sira += 1;
    await o().sahip.sorgu('INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ($1, 0) ON CONFLICT (onek) DO NOTHING', ['RKL-DNM-']);
    return (await o().sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, $2, 'RKL-DNM-', $3, 'aktif', $4, $5, $5) RETURNING no`,
      [`rkl-dnm-${sira}`, tur, sira, JSON.stringify({ id: `rkl-dnm-${sira}`, com: { ad: `Kart listesi deneme ${sira}` } }), kisiler.get('yonetici')],
    ))!.no;
  }
  const liste = async (sorgu = '') => {
    const c = await istek('depo', 'GET', `/stok/refakat-kartlari${sorgu}`);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return refakatKartlariCevabi.parse(c.govde);
  };

  before(async () => {
    ortam = await testVeritabaniKur('stok_refakat_kartlari');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiler.set('yonetici', await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA })));
    for (const [rol, islemler] of Object.entries(ROL_ISLEMLERI)) {
      const r = await ortam.vt.tek<{ id: number }>('SELECT id FROM rol WHERE kod = $1', [rol]);
      for (const i of islemler) await ortam.vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2) ON CONFLICT DO NOTHING', [r!.id, i]);
    }
    for (const rol of ['depo', 'operator', 'planlama_proje']) await kisiEkle(rol);
  });
  after(async () => { await ortam?.kaldir(); });

  test('yetki: stok okuması olmayan 403, oturumsuz 401; kart yokken liste boş', async () => {
    assert.equal((await istek('operator', 'GET', '/stok/refakat-kartlari')).durum, 403);
    assert.equal((await istek('oturumsuz', 'GET', '/stok/refakat-kartlari')).durum, 401);
    assert.equal((await istek('depo', 'GET', '/stok/refakat-kartlari?durum=kapali')).durum, 400);
    assert.deepEqual(await liste(), { kartlar: [], sinirda: false });
  });

  test('en yeni kart önce; emrin ürünü, adedi, termini ve adım sayısı yanında; iptal kart yalnız tümünde', async () => {
    const [mm, hm] = [await kart('mamul'), await kart('hammadde')];
    const tip = (await o().sahip.tek<{ id: number }>("INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ('RKL-1', 'Deneme tipi', 'TAL') RETURNING id"))!.id;
    const projeId = (await o().sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('STOK.RKL', 'Deneme proje', $1) RETURNING id", [kisiler.get('yonetici')]))!.id;
    const revizyon = (await o().sahip.tek<{ id: number }>(
      `INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, durum, acan_kisi_id, iptal_eden_kisi_id, iptal_etme)
       VALUES ($1, 'mamul', 'ZZ', 'iptal', $2, $2, now()) RETURNING id`, [mm, kisiler.get('yonetici')]))!.id;
    const planlamaci = (await o().vt.tx((db) => kullaniciYukle(db, kisiler.get('planlama_proje')!)))!;
    const adim = (s: number) => ({
      sira: s, opNo: s * 10, ad: `Adım ${s}`, operasyonTipiId: tip, kaynak: null, ayarSuresiDk: '10', birimSureDk: '1',
      terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, kontrolListesi: [], bilesenler: s === 1 ? [{ malzemeNo: hm, miktar: '1' }] : [],
    });
    const emirAc = async (adet: number, adimSayisi: number) => (await o().vt.tx(async (db) => uretimEmriAc(db, planlamaci, {
      projeId, malzemeNo: mm, adet, teslim: '2026-11-30', kaynakRotaRevizyonId: revizyon, isEmirleri: Array.from({ length: adimSayisi }, (_, i) => adim(i + 1)),
    }))).uretimEmriId;
    const [e1, e2] = [await emirAc(10, 2), await emirAc(5, 3)];
    const c = await istek('depo', 'POST', '/stok/mal-kabul', { tur: 'diger', satirlar: [{ malzemeId: hm, miktar: '20' }] });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    const lot = (await o().vt.tek<{ lot_no: string }>('SELECT lot_no FROM stok_parti WHERE malzeme_id = $1 ORDER BY id DESC LIMIT 1', [hm]))!.lot_no;
    const ac = async (emir: number) => (await istek<RefakatPartisiCevabi>('depo', 'POST', '/stok/refakat-partileri/ac', { uretimEmriId: emir, lotKodu: `LOT:${lot}` })).govde.refakat;
    const k1 = await ac(e1);
    const k2 = await ac(e2);
    // Aynı işlemde açılan kartların zamanı eşit olabilir; sıra kimlikle bozulmaz.
    const acik = await liste();
    assert.deepEqual(acik.kartlar.map((k) => k.refakat.id), [k2.id, k1.id]);
    const [s2, s1] = acik.kartlar;
    assert.deepEqual([s2!.adet, s2!.adimSayisi, s2!.teslim, s1!.adet, s1!.adimSayisi], [5, 3, '2026-11-30', 10, 2]);
    assert.equal(s1!.urun.ad, 'Kart listesi deneme 1');
    assert.equal(s1!.refakat.lotNo, lot);

    const iptal = await istek('depo', 'POST', `/stok/refakat-partileri/${k1.id}/iptal-et`, { surum: k1.surum });
    assert.equal(iptal.durum, 200, JSON.stringify(iptal.govde));
    assert.deepEqual((await liste()).kartlar.map((k) => k.refakat.id), [k2.id]);
    assert.deepEqual((await liste('?durum=tumu')).kartlar.map((k) => [k.refakat.id, k.refakat.durum]), [[k2.id, 'acik'], [k1.id, 'iptal']]);
  });
});
