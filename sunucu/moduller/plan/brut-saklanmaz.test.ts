import type { Db } from '#cekirdek/db.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { DURUM_ANAHTARI } from '../recete-rota/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { brutAlanlariniCikar, saklanmayanKayitDegeri } from './motor-ayari-kurallar.ts';
import * as sorgular from './sorgular.ts';

// 2728 a: planlama brüt ücret saklamaz; dolaylı personel kartı ve ek mesai planının kişi ücreti kayda girmez, okumada dönmez.
// Brüt değer uydurmadır ve başka hiçbir alanda geçmeyen bir sayıdır (91357).
const BRUT = 91357;
const D = (ek: Record<string, unknown>) => ({ surum: 2, D: { meta: { ad: 'Ornek' }, ...ek } });

describe('brüt ücret saklanmaz (2728 a, saf)', () => {
  test('BS-01: dolaylı personel ve kişi ücretinden yalnız brüt çıkar; öteki alanlar kalır', () => {
    const c = D({
      maliyetSis: { kip: 'tek', dolayli: [{ id: 'G1', ad: 'Deneme', brut: BRUT }, { id: 'G2', ad: 'Bos' }] },
      mesaiSis: { sgk: 20, aylikSaat: 225, ucret: { 7: { brut: BRUT, not: 'x' }, 8: { not: 'y' } } },
    });
    assert.deepEqual(brutAlanlariniCikar(c), D({
      maliyetSis: { kip: 'tek', dolayli: [{ id: 'G1', ad: 'Deneme' }, { id: 'G2', ad: 'Bos' }] },
      mesaiSis: { sgk: 20, aylikSaat: 225, ucret: { 7: { not: 'x' }, 8: { not: 'y' } } },
    }));
  });
  test('BS-02: brütü taşımayan ya da beklenmeyen biçimdeki değer aynen döner', () => {
    for (const x of [null, 'metin', { D: null }, D({}), D({ maliyetSis: null, mesaiSis: 3 }), D({ maliyetSis: { dolayli: 'x' }, mesaiSis: { ucret: [] } })]) {
      assert.deepEqual(brutAlanlariniCikar(x), x);
    }
  });
});

describe('metin biçimli planlama kaydı da süzülür (2747, saf)', () => {
  test('BS-05: JSON metni ayrıştırılır, brüt ve genel gider çıkar, yine metin döner; JSON olmayan metin ve öteki biçim aynen', () => {
    const c = D({ maliyetSis: { dolayli: [{ id: 'G1', ad: 'Deneme', brut: BRUT }] }, planTL: { genelGider: 55, amac: 'tl' } });
    const m = saklanmayanKayitDegeri('metin', JSON.stringify(c));
    assert.equal(typeof m, 'string');
    assert.deepEqual(JSON.parse(m as string), D({ maliyetSis: { dolayli: [{ id: 'G1', ad: 'Deneme' }] }, planTL: { amac: 'tl' } }));
    const temiz = JSON.stringify(D({ meta: { ad: 'x' } }));
    assert.equal(saklanmayanKayitDegeri('metin', temiz), temiz);
    for (const x of ['{bozuk', `brut ${String(BRUT)}`]) assert.equal(saklanmayanKayitDegeri('metin', x), x);
    assert.deepEqual(saklanmayanKayitDegeri('json', c), D({ maliyetSis: { dolayli: [{ id: 'G1', ad: 'Deneme' }] }, planTL: { amac: 'tl' } }));
    assert.equal(saklanmayanKayitDegeri('metin', 5), 5);
  });
});

const receteRotaKaydiEkle = (db: Db, deger: unknown, kisiId: number) => db.sorgu(
  `INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', $2::jsonb, nextval('recete_rota_surum'), $3)`,
  [DURUM_ANAHTARI, JSON.stringify(deger), kisiId]);
const PAROLA = 'dogru-parola-1';

describe('brüt ücret kayda girmez ve dönmez (2728 a, gerçek PostgreSQL)', async () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };
  const kayit = { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] };
  const calisma = {
    surum: 2, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
    w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
    D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [],
      personel: [], siparisler: [], ayarlar: {},
      maliyetSis: { kip: 'tek', kalemler: [], dolayli: [{ id: 'G1', ad: 'Deneme', brut: BRUT }] },
      mesaiSis: { sgk: 20, aylikSaat: 225, ucret: { 7: { brut: BRUT } } } },
  };

  before(async () => {
    ortam = await testVeritabaniKur('plan_brut_saklanmaz');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    await ortam.vt.tx((db) => receteRotaKaydiEkle(db, kayit, yoneticiId));
    // Göçten önceki kayıt gibi: brüt kayıtta duruyor.
    await ortam.vt.tx((db) => sorgular.planlamaKaydiEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma, kisiId: yoneticiId }));
  });
  after(async () => { await ortam?.kaldir(); });

  test('BS-03: kayıtta brüt varken iki okuma brüt göndermez; brütlü yazma kayda brüt koymaz', async () => {
    const l0 = await app.inject({ method: 'GET', url: '/api/plan/planlama-kayitlari', headers: { cookie: cerez } });
    assert.equal(l0.statusCode, 200, l0.body);
    assert.ok(!l0.body.includes(String(BRUT)), 'ham kayıt okuması');
    const okunan = await app.inject({ method: 'GET', url: '/api/plan/planlama-calismasi', headers: { cookie: cerez } });
    assert.equal(okunan.statusCode, 200, okunan.body);
    assert.ok(!okunan.body.includes(String(BRUT)), 'çalışma okuması');
    const { surum } = okunan.json() as PlanlamaCalismasiCevabi;
    // Eski sekme brütü geri gönderse de saklanmaz.
    const yaz = await app.inject({ method: 'POST', url: '/api/plan/planlama-kayitlari/yaz', headers: { cookie: cerez },
      payload: { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma, beklenenSurum: surum } });
    assert.equal(yaz.statusCode, 200, yaz.body);
    const ham = JSON.stringify((await sorgular.planlamaKaydi(vt(), PLANLAMA_ANAHTARI))?.deger);
    for (const govde of [yaz.body, ham]) assert.ok(!govde.includes(String(BRUT)), govde.slice(0, 200));
    assert.ok(ham.includes('"ad":"Deneme"') && ham.includes('"aylikSaat":225'), 'brütsüz alanlar kalır');
  });

  // Güvenlik K1: geri al geçmişteki önceki sürümü yazar; o sürüm göçten önce brütlü olabilir (BS-03'ün ilk kaydı). Brüt yine kayda girmez.
  test('BS-04: geri al brütlü önceki sürüme dönse de kayda brüt koymaz', async () => {
    const s0 = (await sorgular.planlamaKaydi(vt(), PLANLAMA_ANAHTARI))?.surum;
    const geri = await app.inject({ method: 'POST', url: '/api/plan/planlama-calismasi/geri-al', headers: { cookie: cerez, 'istek-kimligi': randomUUID() }, payload: { calismaSurumu: s0 } });
    assert.equal(geri.statusCode, 200, geri.body);
    const ham = JSON.stringify((await sorgular.planlamaKaydi(vt(), PLANLAMA_ANAHTARI))?.deger);
    assert.ok(!ham.includes(String(BRUT)), ham.slice(0, 200));
    assert.ok(ham.includes('"ad":"Deneme"'), 'brütsüz alanlar kalır');
  });

  test('BS-06: planlama anahtarına metin biçimiyle yazma reddedilir (400), kayıt değişmez', async () => {
    const k0 = await sorgular.planlamaKaydi(vt(), PLANLAMA_ANAHTARI);
    const yaz = await app.inject({ method: 'POST', url: '/api/plan/planlama-kayitlari/yaz', headers: { cookie: cerez },
      payload: { anahtar: PLANLAMA_ANAHTARI, bicim: 'metin', deger: JSON.stringify(calisma), beklenenSurum: k0?.surum } });
    assert.equal(yaz.statusCode, 400, yaz.body);
    assert.equal((await sorgular.planlamaKaydi(vt(), PLANLAMA_ANAHTARI))?.surum, k0?.surum);
  });

  // Eski bir yazma yolunun bıraktığı metin biçimli satır (ve geçmiş sürümü): ham okuma ve geri al brüt göndermez, kayda koymaz.
  test('BS-07: metin biçimli eski kayıt ham okumada ve geri alda süzülür', async () => {
    const kisi = (await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'yonetici'"))!.id;
    await vt().tx(async (db) => {
      await db.sorgu("UPDATE plan_planlama_kaydi SET bicim = 'metin', deger = to_jsonb($2::text), guncelleyen_kisi_id = $3 WHERE anahtar = $1",
        [PLANLAMA_ANAHTARI, JSON.stringify(calisma), kisi]);
    });
    const l = await app.inject({ method: 'GET', url: '/api/plan/planlama-kayitlari', headers: { cookie: cerez } });
    assert.equal(l.statusCode, 200, l.body);
    assert.ok(!l.body.includes(String(BRUT)), l.body.slice(0, 200));
    assert.ok(l.body.includes('Deneme'), 'brütsüz alanlar kalır');
    // Şimdiki satırı json'a çevir: metin sürüm geçmişe düşer; geri al onu getirir.
    await vt().tx((db) => db.sorgu("UPDATE plan_planlama_kaydi SET bicim = 'json', deger = $2::jsonb WHERE anahtar = $1", [PLANLAMA_ANAHTARI, JSON.stringify({ ...calisma, D: { ...calisma.D, maliyetSis: null, mesaiSis: null } })]));
    const s0 = (await sorgular.planlamaKaydi(vt(), PLANLAMA_ANAHTARI))?.surum;
    const geri = await app.inject({ method: 'POST', url: '/api/plan/planlama-calismasi/geri-al', headers: { cookie: cerez, 'istek-kimligi': randomUUID() }, payload: { calismaSurumu: s0 } });
    assert.equal(geri.statusCode, 200, geri.body);
    const k = await sorgular.planlamaKaydi(vt(), PLANLAMA_ANAHTARI);
    const ham = JSON.stringify(k?.deger);
    assert.ok(!ham.includes(String(BRUT)), ham.slice(0, 200));
    assert.equal(k?.bicim, 'metin', 'geri alınan sürüm metin biçimli');
    assert.ok(ham.includes('Deneme'), 'süzülmüş, brütsüz alanlar kalır');
  });
});
