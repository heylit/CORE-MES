import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { MaliyetSatiri } from '#paylasilan/sozlesme/finans.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { maliyetYazimi } from './kurallar.ts';

// Malzeme, istasyon ve kişi kayıtları ile tutarlar uydurmadır.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Liste { satirlar: MaliyetSatiri[]; toplam: number | null }

test('maliyetYazimi: ilk giriş surumsuz, düzeltme okunan sürümle; karışan sürüm ezme yapmaz', () => {
  assert.equal(maliyetYazimi(null, null), 'ekle');
  assert.equal(maliyetYazimi(null, 1), 'bulunamadi');
  assert.equal(maliyetYazimi(2, 2), 'guncelle');
  assert.equal(maliyetYazimi(2, 1), 'cakisma');
  assert.equal(maliyetYazimi(2, null), 'cakisma');
});

describe('finans birim maliyetleri (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let malzemeNo = 0;
  let istasyonId = 0;
  const cerez = new Map<string, string>();
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: cerez.get(kim) ?? '' }, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const yaz = (kim: string, tur: string, govde: unknown) => istek<{ maliyet: MaliyetSatiri }>(kim, 'POST', `/finans/maliyetler/${tur}/yaz`, govde);
  const liste = (kim: string, tur: string) => istek<Liste>(kim, 'GET', `/finans/maliyetler/${tur}`);
  const kisitAdi = async (sql: string, p: unknown[]): Promise<string | null> => {
    try { await vt().sorgu(sql, p); return null; } catch (h) { return (h as { constraint?: string }).constraint ?? String((h as Error).message); }
  };

  async function girisliKisi(kullaniciAdi: string, islemler: string[]): Promise<void> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`gecici_${kullaniciAdi}`]);
    const yr = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yr) throw new Error('rol');
    for (const i of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol.id, i]);
    await vt().tx(async (db) => { const k = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA }); await rolAta(db, yoneticiId, k, rol.id); await rolAl(db, yoneticiId, k, yr.id); });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    cerez.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }

  before(async () => {
    ortam = await testVeritabaniKur('finansmaliyet');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await vt().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('FML-', 0) ON CONFLICT (onek) DO NOTHING");
    malzemeNo = (await vt().tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('fml-1', 'hammadde', 'FML-', 1, 'aktif', '{"id":"fml-1","com":{"ad":"Deneme","birim":"kg"}}', $1, $1) RETURNING no`, [yoneticiId]))?.no ?? 0;
    const merkez = await vt().tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad, aciklama, aktif) VALUES ('FML-IM', 'Deneme merkezi', NULL, true) RETURNING id");
    istasyonId = (await vt().tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('FML-IS', 'Deneme istasyonu', $1, true) RETURNING id", [merkez?.id]))?.id ?? 0;
    await girisliKisi('yonetim', ['finans.yonet', 'finans.maliyet-oku']);
    await girisliKisi('okuyan', ['finans.maliyet-oku']);
    await girisliKisi('finansci', ['finans.oku', 'finans.yaz']);
  });
  after(async () => { await ortam?.kaldir(); });

  test('göç: tablolar boş başlar; kısıtlar geçersiz satırı reddeder, geçerliyi kabul eder', async () => {
    for (const t of ['finans_malzeme_maliyet', 'finans_istasyon_maliyet', 'finans_kisi_maliyet']) {
      assert.equal((await vt().tek<{ n: number }>(`SELECT count(*)::int AS n FROM ${t}`))?.n, 0, t);
    }
    const ekle = (tablo: string, anahtar: string, a: number, tutar: string, para = 'TRY') =>
      kisitAdi(`INSERT INTO ${tablo} (${anahtar}, ${tablo.includes('malzeme') ? 'birim_maliyet' : 'saat_maliyeti'}, para_birimi, guncelleyen_id) VALUES ($1, $2, $3, $4)`, [a, tutar, para, yoneticiId]);
    assert.equal(await ekle('finans_kisi_maliyet', 'kisi_id', yoneticiId, '-1'), 'finans_kisi_maliyet_tutar');
    assert.equal(await ekle('finans_kisi_maliyet', 'kisi_id', yoneticiId, '10', 'try'), 'finans_kisi_maliyet_para_birimi');
    assert.equal(await ekle('finans_kisi_maliyet', 'kisi_id', 999999, '10'), 'finans_kisi_maliyet_kisi');
    assert.equal(await ekle('finans_istasyon_maliyet', 'istasyon_id', 999999, '10'), 'finans_istasyon_maliyet_istasyon');
    assert.equal(await ekle('finans_malzeme_maliyet', 'malzeme_no', 999999, '10'), 'finans_malzeme_maliyet_malzeme');
    assert.equal(await ekle('finans_malzeme_maliyet', 'malzeme_no', malzemeNo, '0'), null);
    assert.equal((await vt().tek<{ p: string }>('SELECT para_birimi AS p FROM finans_malzeme_maliyet WHERE malzeme_no = $1', [malzemeNo]))?.p, 'TRY');
    await vt().sorgu('DELETE FROM finans_malzeme_maliyet');
  });

  test('yetki: yazma finans.yonet, okuma finans.maliyet-oku ister; finans.oku maliyeti açmaz', async () => {
    assert.equal((await istek('', 'GET', '/finans/maliyetler/malzeme')).durum, 401);
    assert.equal((await liste('okuyan', 'malzeme')).durum, 200);
    assert.equal((await liste('finansci', 'malzeme')).durum, 403);
    const govde = { anahtar: malzemeNo, birimMaliyet: 12.5, surum: null };
    assert.equal((await yaz('okuyan', 'malzeme', govde)).durum, 403);
    assert.equal((await yaz('finansci', 'malzeme', govde)).durum, 403);
    assert.equal((await liste('okuyan', 'malzeme')).govde.satirlar.length, 0);
    assert.equal((await yaz('yonetim', 'malzeme', govde)).durum, 200);
  });

  test('yazma: ilk giriş, düzeltme ve eski sürüm; satır yoksa null değil boş liste, sıfır uydurulmaz', async () => {
    const ilk = (await liste('okuyan', 'istasyon')).govde;
    assert.deepEqual([ilk.satirlar, ilk.toplam], [[], 0]);
    const k1 = await yaz('yonetim', 'istasyon', { anahtar: istasyonId, birimMaliyet: 450.1234, surum: null });
    assert.equal(k1.durum, 200);
    assert.deepEqual([k1.govde.maliyet.birimMaliyet, k1.govde.maliyet.paraBirimi, k1.govde.maliyet.surum, k1.govde.maliyet.guncelleyenId], ['450.1234', 'TRY', 1, k1.govde.maliyet.guncelleyenId]);
    assert.equal((await yaz('yonetim', 'istasyon', { anahtar: istasyonId, birimMaliyet: 500, surum: null })).durum, 409);
    const k2 = await yaz('yonetim', 'istasyon', { anahtar: istasyonId, birimMaliyet: 500, surum: 1 });
    assert.deepEqual([k2.durum, k2.govde.maliyet.birimMaliyet, k2.govde.maliyet.surum], [200, '500.0000', 2]);
    assert.equal((await yaz('yonetim', 'istasyon', { anahtar: istasyonId, birimMaliyet: 600, surum: 1 })).durum, 409);
    const l = (await liste('okuyan', 'istasyon')).govde;
    assert.deepEqual(l.satirlar.map((s) => [s.anahtar, s.birimMaliyet, s.surum]), [[istasyonId, '500.0000', 2]]);
  });

  test('uç doğrulaması: olmayan anahtar, eksi tutar, beş ondalık, bozuk para birimi, olmayan kayda sürümlü düzeltme reddedilir', async () => {
    const k = await yaz('yonetim', 'kisi', { anahtar: 999999, birimMaliyet: 10, surum: null });
    assert.equal(k.durum >= 400 && k.durum < 500, true);
    assert.equal((await yaz('yonetim', 'kisi', { anahtar: yoneticiId, birimMaliyet: -1, surum: null })).durum, 400);
    assert.equal((await yaz('yonetim', 'kisi', { anahtar: yoneticiId, birimMaliyet: 1.23456, surum: null })).durum, 400);
    assert.equal((await yaz('yonetim', 'kisi', { anahtar: yoneticiId, birimMaliyet: 10, paraBirimi: 'TL', surum: null })).durum, 400);
    assert.equal((await yaz('yonetim', 'kisi', { anahtar: yoneticiId, birimMaliyet: 10, surum: 1 })).durum, 404);
    assert.equal((await istek('yonetim', 'POST', '/finans/maliyetler/arac/yaz', { anahtar: 1, birimMaliyet: 1, surum: null })).durum, 400);
    const ok = await yaz('yonetim', 'kisi', { anahtar: yoneticiId, birimMaliyet: 0, paraBirimi: 'eur', surum: null });
    assert.deepEqual([ok.durum, ok.govde.maliyet.birimMaliyet, ok.govde.maliyet.paraBirimi], [200, '0.0000', 'EUR']);
    assert.equal((await liste('okuyan', 'kisi')).govde.satirlar.length, 1);
  });
});
