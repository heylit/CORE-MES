import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { MaliyetSatiri } from '#paylasilan/sozlesme/finans.ts';
import { denetimYaz } from '../../denetim/disari.ts';
import { tekrarDeposu } from '../../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../../kisiler/disari.ts';
import { kimlikCozucu } from '../../oturum/disari.ts';
import { birimMaliyetleri } from '../disari.ts';
import { maliyetKaldirimi } from './kurallar.ts';

// 2574 (2572): birim maliyeti kaldırma. Malzeme, istasyon ve tutarlar uydurmadır.
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

test('FNS-75: kaldırma okunan sürümle; satır yoksa bulunamadı, sürüm tutmazsa çakışma', () => {
  assert.equal(maliyetKaldirimi(3, 3), 'kaldir');
  assert.equal(maliyetKaldirimi(3, 2), 'cakisma');
  assert.equal(maliyetKaldirimi(null, 1), 'bulunamadi');
});

describe('finans birim maliyeti kaldırma (2574, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let malzemeNo = 0;
  let istasyonId = 0;
  const cerez = new Map<string, string>();
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  async function istek<T = unknown>(kim: string, yol: string, govde: unknown, kimlik: string | null = randomUUID()): Promise<Cevap<T>> {
    const basliklar: Record<string, string> = { cookie: cerez.get(kim) ?? '' };
    if (kimlik !== null) basliklar[ISTEK_KIMLIGI_BASLIGI] = kimlik;
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, headers: basliklar, payload: govde as object });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const yaz = async (tur: string, anahtar: number, tutar: number, surum: number | null): Promise<MaliyetSatiri> => {
    const c = await istek<{ maliyet: MaliyetSatiri }>('yonetim', `/finans/maliyetler/${tur}/yaz`, { anahtar, birimMaliyet: tutar, surum }, null);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.maliyet;
  };
  const kaldir = (kim: string, tur: string, anahtar: number | string, govde: unknown, kimlik?: string | null) =>
    istek<{ kaldirilan: { tur: string; anahtar: number } } & { kod?: string }>(kim, `/finans/maliyetler/${tur}/${anahtar}/kaldir`, govde, kimlik);
  const malzemeMaliyeti = async () => (await vt().tx((db) => birimMaliyetleri(db, 'malzeme'))).get(malzemeNo) ?? null;

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
    ortam = await testVeritabaniKur('finansmaliyetkaldir');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await vt().sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('FMK-', 0) ON CONFLICT (onek) DO NOTHING");
    malzemeNo = (await vt().tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ('fmk-1', 'hammadde', 'FMK-', 1, 'aktif', '{"id":"fmk-1","com":{"ad":"Deneme","birim":"kg"}}', $1, $1) RETURNING no`, [yoneticiId]))?.no ?? 0;
    const merkez = await vt().tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad, aciklama, aktif) VALUES ('FMK-IM', 'Deneme merkezi', NULL, true) RETURNING id");
    istasyonId = (await vt().tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('FMK-IS', 'Deneme istasyonu', $1, true) RETURNING id", [merkez?.id]))?.id ?? 0;
    await girisliKisi('yonetim', ['finans.maliyet-yaz', 'finans.maliyet-oku']);
    await girisliKisi('okuyan', ['finans.maliyet-oku']);
    await girisliKisi('finansci', ['finans.oku', 'finans.yaz']);
  });
  after(async () => { await ortam?.kaldir(); });

  test('FNS-75 yetki: kaldırma yalnız finans.maliyet-yaz ile; oturumsuz 401, okuyan ve finans.yaz 403, satır kalır', async () => {
    const m = await yaz('malzeme', malzemeNo, 12.5, null);
    assert.equal((await kaldir('', 'malzeme', malzemeNo, { surum: m.surum })).durum, 401);
    assert.equal((await kaldir('okuyan', 'malzeme', malzemeNo, { surum: m.surum })).durum, 403);
    assert.equal((await kaldir('finansci', 'malzeme', malzemeNo, { surum: m.surum })).durum, 403);
    assert.deepEqual(await malzemeMaliyeti(), { birimMaliyet: '12.5000', paraBirimi: 'TRY', surum: 1 });
    await vt().sorgu('DELETE FROM finans_malzeme_maliyet');
  });

  test('FNS-75: okunan sürümle kaldırılır, okuyan modül yeniden "bilinmiyor" görür; silinen değer denetim kaydında', async () => {
    const ilk = await yaz('malzeme', malzemeNo, 10, null);
    const ikinci = await yaz('malzeme', malzemeNo, 14.25, ilk.surum);
    const c = await kaldir('yonetim', 'malzeme', malzemeNo, { surum: ikinci.surum });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.deepEqual(c.govde, { kaldirilan: { tur: 'malzeme', anahtar: malzemeNo } });
    assert.equal(await malzemeMaliyeti(), null, 'satır yok: maliyet bilinmiyor, sıfır değil');
    const ek = (await vt().tek<{ ek: { kayit: string; alan: string; onceki: unknown; yeni: unknown }[] | null }>(
      "SELECT govde->'_ek' AS ek FROM denetim_kaydi WHERE yol = '/finans/maliyetler/:tur/:anahtar/kaldir' ORDER BY id DESC LIMIT 1"))?.ek ?? [];
    const alan = (a: string) => ek.find((x) => x.alan === a);
    assert.deepEqual([alan('birimMaliyet')?.onceki, alan('birimMaliyet')?.yeni, alan('surum')?.onceki, alan('anahtar')?.kayit],
      ['14.2500', null, 2, `maliyet:malzeme:${malzemeNo}`], JSON.stringify(ek));
    // Kaldırılan kayıt yeniden ilk giriş olarak yazılır.
    assert.equal((await yaz('malzeme', malzemeNo, 9, null)).surum, 1);
    await vt().sorgu('DELETE FROM finans_malzeme_maliyet');
  });

  test('FNS-75 yasak: eski sürüm 409 ve satır kalır; olmayan satır 404; istek kimliksiz 400; fazla alan ve geçersiz anahtar 400', async () => {
    const m = await yaz('istasyon', istasyonId, 300, null);
    const g = await yaz('istasyon', istasyonId, 320, m.surum);
    assert.equal((await kaldir('yonetim', 'istasyon', istasyonId, { surum: m.surum })).durum, 409);
    assert.equal((await kaldir('yonetim', 'istasyon', istasyonId, { surum: g.surum }, null)).durum, 400);
    assert.equal((await kaldir('yonetim', 'istasyon', istasyonId, { surum: g.surum, birimMaliyet: 0 })).durum, 400);
    assert.equal((await kaldir('yonetim', 'istasyon', 'abc', { surum: g.surum })).durum, 400);
    assert.equal((await kaldir('yonetim', 'tezgah', istasyonId, { surum: g.surum })).durum, 400);
    assert.equal((await vt().tx((db) => birimMaliyetleri(db, 'istasyon'))).get(istasyonId)?.birimMaliyet, '320.0000');
    assert.equal((await kaldir('yonetim', 'istasyon', istasyonId, { surum: g.surum })).durum, 200);
    assert.equal((await kaldir('yonetim', 'istasyon', istasyonId, { surum: g.surum })).durum, 404);
    assert.equal((await kaldir('yonetim', 'kisi', yoneticiId, { surum: 1 })).durum, 404);
    const k = await yaz('kisi', yoneticiId, 450, null);
    assert.equal((await kaldir('yonetim', 'kisi', yoneticiId, { surum: k.surum })).durum, 200);
    assert.equal((await vt().tx((db) => birimMaliyetleri(db, 'kisi'))).has(yoneticiId), false, 'kişi saatlik maliyeti de kaldırılır');
  });

  test('FNS-75: aynı istek kimliğiyle yinelenen kaldırma ikinci kez uygulanmaz, ilk cevabı alır', async () => {
    const m = await yaz('malzeme', malzemeNo, 5, null);
    const kimlik = randomUUID();
    const ilk = await kaldir('yonetim', 'malzeme', malzemeNo, { surum: m.surum }, kimlik);
    const tekrar = await kaldir('yonetim', 'malzeme', malzemeNo, { surum: m.surum }, kimlik);
    assert.deepEqual([ilk.durum, tekrar.durum], [200, 200]);
    assert.deepEqual(tekrar.govde, ilk.govde);
  });
});
