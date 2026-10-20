import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { genelGiderOrani } from './disari.ts';
import { genelGiderSaatBasi } from './kurallar.ts';

// Tutarlar uydurmadır.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }
interface Satir { id: number; gecerlilikBaslangic: string; aylikGenelGider: string; aylikMakineSaati: string; saatBasi: string; amortismanDahil: boolean; aciklama: string | null }

test('FNS-65 genelGiderSaatBasi: gider / saat dört ondalık; saat sıfırsa null, sıfır uydurulmaz', () => {
  assert.equal(genelGiderSaatBasi('300000.00', '720.00'), 416.6667);
  assert.equal(genelGiderSaatBasi('0.00', '100.00'), 0);
  assert.equal(genelGiderSaatBasi('1000.00', '0'), null);
});

describe('finans genel gider oranı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerez = new Map<string, string>();
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const c = await app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: cerez.get(kim) ?? '' }, ...(govde === undefined ? {} : { payload: govde as object }) });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const ekle = (kim: string, govde: unknown) => istek<{ id: number }>(kim, 'POST', '/finans/genel-gider-oranlari/ekle', govde);
  const liste = (kim: string) => istek<{ satirlar: Satir[]; toplam: number | null }>(kim, 'GET', '/finans/genel-gider-oranlari');
  const hata = async (sql: string, p: unknown[] = []): Promise<string | null> => {
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
    ortam = await testVeritabaniKur('finansgenelgider');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await girisliKisi('yonetim', ['finans.yonet', 'finans.maliyet-oku']);
    await girisliKisi('okuyan', ['finans.maliyet-oku']);
    await girisliKisi('finansci', ['finans.oku', 'finans.yaz']);
  });
  after(async () => { await ortam?.kaldir(); });

  test('göç: tablo boş başlar; kısıtlar geçersiz satırı reddeder, geçerliyi kabul eder; satır değişmez, silinmez, boşaltılmaz', async () => {
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM finans_genel_gider_orani'))?.n, 0);
    const satir = (gider: string, saat: string, kisi = yoneticiId) => hata(
      'INSERT INTO finans_genel_gider_orani (gecerlilik_baslangic, aylik_genel_gider, aylik_makine_saati, amortisman_dahil, olusturan_id) VALUES ($1, $2, $3, true, $4)',
      ['2026-01-01', gider, saat, kisi]);
    assert.equal(await satir('-1', '100'), 'finans_genel_gider_orani_gider');
    assert.equal(await satir('100', '0'), 'finans_genel_gider_orani_saat');
    assert.equal(await satir('100', '100', 999999), 'finans_genel_gider_orani_olusturan');
    assert.equal(await satir('100', '100'), null);
    assert.notEqual(await hata('UPDATE finans_genel_gider_orani SET aylik_genel_gider = 1'), null);
    assert.notEqual(await hata('DELETE FROM finans_genel_gider_orani'), null);
    assert.notEqual(await hata('TRUNCATE finans_genel_gider_orani'), null);
    assert.equal((await vt().tek<{ g: string }>('SELECT aylik_genel_gider::text AS g FROM finans_genel_gider_orani'))?.g, '100.00');
  });

  test('yetki: ekleme finans.yonet, okuma finans.maliyet-oku ister; finans.oku ve finans.yaz oranı açmaz', async () => {
    const govde = { gecerlilikBaslangic: '2026-02-01', aylikGenelGider: 300000, aylikMakineSaati: 720, amortismanDahil: true };
    assert.equal((await istek('', 'GET', '/finans/genel-gider-oranlari')).durum, 401);
    assert.equal((await liste('finansci')).durum, 403);
    assert.equal((await liste('okuyan')).durum, 200);
    assert.equal((await ekle('okuyan', govde)).durum, 403);
    assert.equal((await ekle('finansci', govde)).durum, 403);
    assert.equal((await ekle('yonetim', govde)).durum, 200);
  });

  test('doğrulama: eksi gider, sıfır saat, üç ondalık ve eksik amortisman alanı reddedilir', async () => {
    const tam = { gecerlilikBaslangic: '2026-03-01', aylikGenelGider: 1000, aylikMakineSaati: 100, amortismanDahil: false };
    assert.equal((await ekle('yonetim', { ...tam, aylikGenelGider: -1 })).durum, 400);
    assert.equal((await ekle('yonetim', { ...tam, aylikMakineSaati: 0 })).durum, 400);
    assert.equal((await ekle('yonetim', { ...tam, aylikGenelGider: 1.234 })).durum, 400);
    const { amortismanDahil: _a, ...eksik } = tam;
    assert.equal((await ekle('yonetim', eksik)).durum, 400);
  });

  test('disari.genelGiderOrani: o güne geçerli son kayıt; kayıt yoksa null; aynı güne ikinci giriş öncekini düzeltir', async () => {
    assert.equal(await genelGiderOrani(vt(), '2025-12-31'), null);
    assert.deepEqual(await genelGiderOrani(vt(), '2026-01-15'), { saatBasi: 1, amortismanDahil: true });
    assert.deepEqual(await genelGiderOrani(vt(), '2026-02-01'), { saatBasi: 416.6667, amortismanDahil: true });
    assert.equal((await ekle('yonetim', { gecerlilikBaslangic: '2026-02-01', aylikGenelGider: 360000, aylikMakineSaati: 720, amortismanDahil: false, aciklama: 'Düzeltme' })).durum, 200);
    assert.deepEqual(await genelGiderOrani(vt(), '2026-02-20'), { saatBasi: 500, amortismanDahil: false });
    assert.deepEqual(await genelGiderOrani(vt(), '2026-01-31'), { saatBasi: 1, amortismanDahil: true });
    const l = (await liste('okuyan')).govde;
    assert.equal(l.toplam, 3);
    assert.deepEqual(l.satirlar.map((s) => [s.gecerlilikBaslangic, s.saatBasi, s.amortismanDahil, s.aciklama]),
      [['2026-01-01', '1.0000', true, null], ['2026-02-01', '416.6667', true, null], ['2026-02-01', '500.0000', false, 'Düzeltme']]);
  });
});
