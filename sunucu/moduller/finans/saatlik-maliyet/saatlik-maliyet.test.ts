import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { MaliyetSatiri, SaatlikMaliyetSatiri } from '#paylasilan/sozlesme/finans.ts';
import { denetimYaz } from '../../denetim/disari.ts';
import { tekrarDeposu } from '../../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../../kisiler/disari.ts';
import { kimlikCozucu } from '../../oturum/disari.ts';
import { saatlikMaliyetListesi } from './kurallar.ts';

// 2593 (2589 b): Finans'ın istasyon saatlik maliyet listesi. İstasyon ve tutarlar uydurmadır.
const PAROLA = 'dogru-parola-1';
const maliyet = (anahtar: number, birimMaliyet = '100.0000'): MaliyetSatiri =>
  ({ anahtar, birimMaliyet, paraBirimi: 'TRY', guncelleme: '2026-11-01T08:00:00.000Z', guncelleyenId: 1, surum: 1 });

test('FNS-76: aktif kaynak maliyetsiz de listede (null); pasif yalnız maliyetliyse; kaynağı olmayan maliyet kaybolmaz', () => {
  const l = saatlikMaliyetListesi([
    { anahtar: 1, kod: 'B', ad: 'Beta', aktif: true },
    { anahtar: 2, kod: 'A', ad: 'Alfa', aktif: true },
    { anahtar: 3, kod: 'P', ad: 'Pasif maliyetsiz', aktif: false },
    { anahtar: 4, kod: 'Q', ad: 'Pasif maliyetli', aktif: false },
  ], [maliyet(1), maliyet(4), maliyet(9)]);
  assert.deepEqual(l.map((s) => [s.anahtar, s.aktif, s.maliyet?.birimMaliyet ?? null]), [[2, true, null], [1, true, '100.0000'], [9, false, '100.0000'], [4, false, '100.0000']]);
  assert.equal(l.find((s) => s.anahtar === 9)?.ad, 'Kayıt bulunamadı');
});

describe('finans saatlik maliyet listesi (2593, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let aktifIstasyon = 0;
  let pasifIstasyon = 0;
  const cerez = new Map<string, string>();
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };
  const liste = async (kim: string, tur: string) => {
    const c = await app.inject({ method: 'GET', url: `/api/finans/saatlik-maliyetler/${tur}`, headers: { cookie: cerez.get(kim) ?? '' } });
    return { durum: c.statusCode, satirlar: (c.statusCode === 200 ? (c.json() as { satirlar: SaatlikMaliyetSatiri[] }).satirlar : []) };
  };

  async function girisliKisi(kullaniciAdi: string, islemler: string[]): Promise<number> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`gecici_${kullaniciAdi}`]);
    const yr = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yr) throw new Error('rol');
    for (const i of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol.id, i]);
    const id = await vt().tx(async (db) => { const k = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA }); await rolAta(db, yoneticiId, k, rol.id); await rolAl(db, yoneticiId, k, yr.id); return k; });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    cerez.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
    return id;
  }

  before(async () => {
    ortam = await testVeritabaniKur('finanssaatlik');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const merkez = await vt().tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad, aciklama, aktif) VALUES ('FSM-IM', 'Deneme merkezi', NULL, true) RETURNING id");
    aktifIstasyon = (await vt().tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('FSM-1', 'Deneme torna', $1, true) RETURNING id", [merkez?.id]))?.id ?? 0;
    pasifIstasyon = (await vt().tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('FSM-2', 'Deneme eski freze', $1, false) RETURNING id", [merkez?.id]))?.id ?? 0;
    await girisliKisi('okuyan', ['finans.maliyet-oku']);
    await girisliKisi('finansci', ['finans.oku', 'finans.yaz', 'finans.maliyet-yaz']);
  });
  after(async () => { await ortam?.kaldir(); });

  test('FNS-76 yetki: liste finans.maliyet-oku ister; oturumsuz 401, finans.oku/yaz/yonet tek başına 403; malzeme ve kişi türü 400 (2598 c: kişi başı değer yok)', async () => {
    assert.equal((await liste('', 'istasyon')).durum, 401);
    assert.equal((await liste('finansci', 'istasyon')).durum, 403);
    assert.equal((await liste('okuyan', 'malzeme')).durum, 400);
    assert.equal((await liste('okuyan', 'kisi')).durum, 400);
    assert.equal((await liste('okuyan', 'istasyon')).durum, 200);
  });

  test('FNS-76: istasyon listesi aktif istasyonu maliyetsiz (null) taşır; pasif istasyon yalnız maliyeti varsa görünür', async () => {
    const bul = async () => (await liste('okuyan', 'istasyon')).satirlar.filter((s) => s.anahtar === aktifIstasyon || s.anahtar === pasifIstasyon);
    assert.deepEqual((await bul()).map((s) => [s.kod, s.ad, s.aktif, s.maliyet]), [['FSM-1', 'Deneme torna', true, null]]);
    await vt().sorgu("INSERT INTO finans_istasyon_maliyet (istasyon_id, saat_maliyeti, guncelleyen_id) VALUES ($1, '850.5', $2), ($3, '400', $2)", [aktifIstasyon, yoneticiId, pasifIstasyon]);
    assert.deepEqual((await bul()).map((s) => [s.kod, s.aktif, s.maliyet?.birimMaliyet, s.maliyet?.surum]), [['FSM-1', true, '850.5000', 1], ['FSM-2', false, '400.0000', 1]]);
  });

});
