import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { aramaSade, basDeseni, icindeDeseni } from '#paylasilan/kayit-aramasi.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kayitAramaKaynaklari } from './disari.ts';
import { uclar } from './uclar.ts';

const PAROLA = 'dogru-parola-1';
const [kaynak] = kayitAramaKaynaklari;

describe('siparişler genel arama kaynağı (1242)', () => {
  test('tek kaynak: tür siparis, yetki sipariş listesini okuyanla aynı (siparisler.oku)', () => {
    assert.equal(kayitAramaKaynaklari.length, 1);
    assert.equal(kaynak?.tur, 'siparis');
    assert.deepEqual(kaynak?.yetki, ['siparisler.oku']);
    const liste = uclar.find((u) => u.yontem === 'GET' && u.yol === '/siparisler');
    assert.equal(liste?.yetki, 'siparisler.oku');
  });
});

describe('siparişler genel arama kaynağı (1242, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let kisiId = 0;
  const kayit = { bos: 0, musteriNolu: 0, iptal: 0 };

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const ara = (q: string, sinir = 5) => o().vt.tx((db) => kaynak!.ara(db, {
    q, sade: aramaSade(q), icindeDeseni: icindeDeseni(q), basDeseni: basDeseni(q), sinir, kullanici: { id: kisiId, islemler: ['siparisler.oku'] },
  }));

  before(async () => {
    ortam = await testVeritabaniKur('siparisarama');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    kisiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'sa-yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'sa-yonetici', parola: PAROLA } });
    const cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    const f = await app.inject({
      method: 'POST', url: '/api/musteri-tedarikci/firmalar/ekle', payload: { ad: 'Deneme Arama Firması', tur: 'musteri' },
      headers: { cookie: cerez, 'istek-kimligi': randomUUID() },
    });
    assert.equal(f.statusCode, 200, f.body);
    const firmaId = f.json<{ firma: { id: number } }>().firma.id;
    const siparis = async (no: string, musteriNo: string | null, durum = 'taslak') => (await o().sahip.tek<{ id: number }>(
      `INSERT INTO siparisler_siparis (no, durum, firma_id, musteri_siparis_no, siparis_tarihi, termin, para_birimi, kdv_orani, olusturan_id, iptal_nedeni)
       VALUES ($1, $2, $3, $4, '2026-10-29', '2026-11-30', 'TRY', 20, $5, CASE WHEN $2::text = 'iptal' THEN 'Deneme iptali' END) RETURNING id`,
      [no, durum, firmaId, musteriNo, kisiId]))!.id;
    kayit.bos = await siparis('SS-ARA-1', null);
    kayit.musteriNolu = await siparis('SS-ARA-2', 'İŞ-77');
    kayit.iptal = await siparis('XSS-ARA-3', null, 'iptal');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('sipariş no ya da müşteri sipariş no\'sunda geçen kayıt döner; sonuç ayrıntıyı açar, fiyat yazmaz', async () => {
    assert.deepEqual(await ara('ss-ara'), [
      { anahtar: String(kayit.musteriNolu), baslik: 'SS-ARA-2', aciklama: 'Deneme Arama Firması · İŞ-77 · Taslak', yol: `/siparisler/${kayit.musteriNolu}` },
      { anahtar: String(kayit.bos), baslik: 'SS-ARA-1', aciklama: 'Deneme Arama Firması · Taslak', yol: `/siparisler/${kayit.bos}` },
      { anahtar: String(kayit.iptal), baslik: 'XSS-ARA-3', aciklama: 'Deneme Arama Firması · İptal', yol: `/siparisler/${kayit.iptal}` },
    ]);
    // Türkçe harf dil ayarından bağımsız eşleşir: "iş", "IŞ" ve "is" aynı kaydı bulur.
    for (const q of ['iş-77', 'IŞ-77', 'is-77']) assert.deepEqual((await ara(q)).map((s) => s.anahtar), [String(kayit.musteriNolu)], q);
  });

  test('sıra: tam tutan (müşteri no dahil) önce, sonra baştan eşleşen, sonra yeniden eskiye; sınır aşılmaz', async () => {
    assert.equal((await ara('ss-ara-1'))[0]?.anahtar, String(kayit.bos));
    assert.equal((await ara('İŞ-77'))[0]?.anahtar, String(kayit.musteriNolu));
    assert.deepEqual((await ara('ara', 2)).map((s) => s.anahtar), [String(kayit.iptal), String(kayit.musteriNolu)]);
  });

  test('% ve _ joker değil, düz metindir; eşleşmeyen sorgu boş döner', async () => {
    assert.deepEqual(await ara('%%'), []);
    assert.deepEqual(await ara('__'), []);
    assert.deepEqual(await ara('yok-boyle-siparis'), []);
  });

  test('aranan iki sütunun sadeleşmiş trigram indeksi var ve arama indeksi kullanabilir', async () => {
    const indeksler = await o().sahip.sorgu<{ indexname: string; indexdef: string }>(
      "SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = current_schema() AND indexname LIKE 'siparisler_%_trgm' ORDER BY indexname");
    assert.deepEqual(indeksler.map((i) => i.indexname), ['siparisler_siparis_musteri_siparis_no_trgm', 'siparisler_siparis_no_trgm']);
    for (const i of indeksler) assert.match(i.indexdef, /USING gin \(public\.arama_sade\(.*gin_trgm_ops/);
    const plan = await o().sahip.tx(async (db) => {
      await db.sorgu('SET LOCAL enable_seqscan = off');
      return db.sorgu<{ 'QUERY PLAN': string }>("EXPLAIN SELECT id FROM siparisler_siparis WHERE public.arama_sade(no) LIKE '%ara%'");
    });
    assert.match(plan.map((p) => p['QUERY PLAN']).join('\n'), /siparisler_siparis_no_trgm\b/);
  });
});
