import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { bitisAkisiEkle, terminSaati, type BitisSatiri } from './planlama-kurallar.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import * as sorgular from './sorgular.ts';

// 455/2 a: siparişin bitiş tarihi akışını (her yeni planda ayrı satır) planlama çalışması kaydedilirken sunucu yazar; kural planlama
// sayfasının svKaydet kuralıdır. Veriler uydurmadır.
const AN = Date.parse('2026-10-19T06:00:00Z');
const calisma = (J: Record<string, { C: number }>, ek: Record<string, unknown> = {}): Record<string, unknown> => ({
  surum: 2, dataVer: 3,
  D: { meta: { baslangic: '2026-10-19' }, siparisler: [{ id: 'O1', termin: '2026-10-20' }, { id: 'O2', termin: '2026-10-21 12:00' }, { id: 'H1', havuz: true, termin: null }] },
  plan: { dataVer: 3, kaynak: 'sifir', J },
  ...ek,
});
const akis = (d: unknown): Record<string, BitisSatiri[]> => (d as { sevkIz: Record<string, BitisSatiri[]> }).sevkIz;

describe('bitiş tarihi akışı: kural', () => {
  test('BA-01: her siparişin ilk bitişi satır olur; zaman ve kişi sunucudan, kaynak planın kipinden, termin planın ekseninde', () => {
    const s = akis(bitisAkisiEkle(calisma({ O1: { C: 30 }, O2: { C: 40 }, H1: { C: 5 } }), null, 'Deneme Planci', AN));
    assert.deepEqual(s['O1'], [{ C: 30, t: AN, kaynak: 'Sıfırdan kur', kim: 'Deneme Planci', due: 24 }]);
    assert.equal(s['O2']?.[0]?.due, 60);
    assert.equal(s['H1'], undefined);
  });

  test('BA-02: yarım saatten az oynayan bitiş eklenmez; yarım saat ve üstü ayrı satır olur, eskisi yerinde kalır', () => {
    const ilk = bitisAkisiEkle(calisma({ O1: { C: 30 } }), null, 'A', AN);
    const ayni = calisma({ O1: { C: 30.25 } }, { sevkIz: akis(ilk) });
    assert.equal(bitisAkisiEkle(ayni, null, 'B', AN + 1), ayni);
    const s = akis(bitisAkisiEkle(calisma({ O1: { C: 30.5 } }, { sevkIz: akis(ilk) }), null, 'B', AN + 1));
    assert.deepEqual(s['O1']?.map((x) => [x.C, x.kim]), [[30, 'A'], [30.5, 'B']]);
  });

  test('BA-03: plan güncel değilse, plan ya da J yoksa değer olduğu gibi döner', () => {
    for (const c of [calisma({ O1: { C: 30 } }, { dataVer: 4 }), calisma({}, { plan: null }), { surum: 2 }, null]) assert.equal(bitisAkisiEkle(c, null, 'A', AN), c);
  });

  test('BA-04: sipariş başına son 50 satır kalır', () => {
    const l = Array.from({ length: 50 }, (_, i) => ({ C: i, t: i, kaynak: 'plan', kim: 'A', due: null }));
    const s = akis(bitisAkisiEkle(calisma({ O1: { C: 100 } }, { sevkIz: { O1: l } }), null, 'A', AN));
    assert.equal(s['O1']?.length, 50);
    assert.equal(s['O1']?.[0]?.C, 1);
    assert.equal(s['O1']?.[49]?.C, 100);
  });

  test('BA-05: gönderilen değer akışı taşımıyorsa kayıttaki akışın üstüne eklenir; girdi değişmez', () => {
    const eski = { sevkIz: { O1: [{ C: 10, t: 1, kaynak: 'plan', kim: 'A', due: 24 }], O9: [{ C: 3, t: 1, kaynak: 'plan', kim: 'A', due: null }] } };
    const yeni = calisma({ O1: { C: 30 } }); const once = JSON.stringify(yeni);
    const s = akis(bitisAkisiEkle(yeni, eski, 'B', AN));
    assert.deepEqual(s['O1']?.map((x) => x.C), [10, 30]);
    assert.equal(s['O9']?.length, 1);
    assert.equal(JSON.stringify(yeni), once);
    // Bitişi değişmese de kayıttaki akış korunur.
    assert.deepEqual(akis(bitisAkisiEkle(calisma({ O1: { C: 10 } }), eski, 'B', AN)), eski.sevkIz);
  });

  test('BA-06: termin saati: tarih, tarih saat, sayı; geçersiz null', () => {
    assert.equal(terminSaati('2026-10-19', '2026-10-19'), 0);
    assert.equal(terminSaati('2026-10-19', '2026-10-20T08:30'), 32.5);
    assert.equal(terminSaati('2026-10-19', 12), 12);
    assert.equal(terminSaati('2026-10-19', 'yarin'), null);
    assert.equal(terminSaati('2026-10-19', null), null);
  });
});

const PAROLA = 'dogru-parola-1';

describe('bitiş tarihi akışı: kayıt yazılırken (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let planci = '';
  let yalnizYazar = '';
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

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
  const yaz = (cerez: string, deger: unknown, beklenenSurum: number | null) => app.inject({
    method: 'POST', url: '/api/plan/planlama-kayitlari/yaz', headers: { cookie: cerez }, payload: { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger, beklenenSurum },
  });
  const kayit = () => vt().tx((db) => sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI));

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_bitis_akisi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    planci = await islemliKisi('planci', ['recete-rota.yaz', 'plan.yaz']);
    yalnizYazar = await islemliKisi('yazar', ['recete-rota.yaz']);
  });
  after(async () => { await ortam?.kaldir(); });

  test('BA-07: plan.yaz taşıyan kaydedince akış satırı sunucuda düşer (kişi oturumdan, zaman sunucudan); yeni planda ikinci satır eklenir', async () => {
    const once = Date.now();
    const ilk = await yaz(planci, calisma({ O1: { C: 30 } }), null);
    assert.equal(ilk.statusCode, 200, ilk.body);
    const k1 = await kayit();
    const s1 = akis(k1?.deger)['O1'];
    assert.equal(s1?.length, 1);
    assert.equal(s1?.[0]?.kim, 'Deneme planci');
    assert.ok((s1?.[0]?.t ?? 0) >= once && (s1?.[0]?.t ?? 0) <= Date.now());
    // Sayfa satırı taşımadan gönderse de akış kaybolmaz; yeni bitiş eklenir.
    const ikinci = await yaz(planci, calisma({ O1: { C: 34 } }), k1?.surum ?? null);
    assert.equal(ikinci.statusCode, 200, ikinci.body);
    assert.deepEqual(akis((await kayit())?.deger)['O1']?.map((x) => x.C), [30, 34]);
  });

  test('BA-08: eski sayfa kendi satırını eklemişse ikinci satır düşmez', async () => {
    const k = await kayit();
    const sayfa = { O1: [...akis(k?.deger)['O1'] ?? [], { C: 40, t: 1, kaynak: 'Sıfırdan kur', kim: 'Deneme planci', due: 24 }] };
    const r = await yaz(planci, calisma({ O1: { C: 40 } }, { sevkIz: sayfa }), k?.surum ?? null);
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(akis((await kayit())?.deger)['O1']?.map((x) => x.C), [30, 34, 40]);
  });

  test('BA-09: plan.yaz taşımayan 403 alır, akış ve kayıt değişmez', async () => {
    const k = await kayit();
    const r = await yaz(yalnizYazar, calisma({ O1: { C: 90 } }), k?.surum ?? null);
    assert.equal(r.statusCode, 403);
    const sonra = await kayit();
    assert.equal(sonra?.surum, k?.surum);
    assert.deepEqual(sonra?.deger, k?.deger);
  });
});
