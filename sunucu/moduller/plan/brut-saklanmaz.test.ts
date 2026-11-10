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
import { brutAlanlariniCikar, malzemeFiyatiniCikar, maliyetsizKayitDegeri, saklanmayanKayitDegeri, tezgahUcretiniCikar } from './motor-ayari-kurallar.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { planlamaCalismasi, planlamaKayitlari } from './planlama-servis.ts';
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

// 2772 M5 (yapı 5, 1459 a): fiyatı bilinmeyen malzemenin birim fiyatı null'dur (motor eksik sayar); 0 girilmiş fiyat 0 kalır.
describe('malzeme birim fiyatı uydurulmaz (2772 M5, saf)', () => {
  const kayit = { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] };
  const calisma = { surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [],
    tezgahlar: [], personel: [], siparisler: [], ayarlar: {} }, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
    w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 } };
  const malzeme = (id: string) => ({ id, code: id, name: id, type: 'ham', unit: 'kg', stock: 1 });
  const fiyatlar = (maliyet: Record<string, unknown> | undefined) => {
    const durum = { items: [malzeme('H1'), malzeme('H2'), malzeme('H3')], ...(maliyet ? { maliyet: { malzeme: maliyet, istasyon: {}, kisi: {} } } : {}) };
    const g = planGirdisi({ calisma, kayit, kaynak: { durum, ek: {} }, bugun: '2026-10-19' });
    const m = (g?.S.D as { malzemeler: { kod: string; birimFiyat?: number | null }[] }).malzemeler;
    return Object.fromEntries(m.map((x) => [x.kod, x.birimFiyat ?? null]));
  };
  test('BS-12: fiyatsız malzeme null, 0 girilmiş 0, fiyatlı fiyatıyla; maliyet okunmayınca hepsi null (0 değil)', () => {
    const try_ = (v: number) => ({ paraBirimi: 'TRY', birimMaliyet: v });
    assert.deepEqual(fiyatlar({ H2: try_(0), H3: try_(12.5) }), { H1: null, H2: 0, H3: 12.5 });
    assert.deepEqual(fiyatlar(undefined), { H1: null, H2: null, H3: null });
  });
});

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
  // 2772 (Güvenlik O1): maliyet görenin uyguladığı planın TL toplamı kayıtta kalır; maliyet görmeyen planlama rolüne ve yalnız Reçete ve
  // Rota okuyana iki okumada da dönmez. Toplam uydurmadır (77713).
  test('BS-08: plan.ozet.tl yalnız finans.maliyet-oku olana döner; kayıtta kalır, öteki özet alanları herkese', async () => {
    const TL = 77713;
    const okunan = await app.inject({ method: 'GET', url: '/api/plan/planlama-calismasi', headers: { cookie: cerez } });
    const { surum } = okunan.json() as PlanlamaCalismasiCevabi;
    const yaz = await app.inject({ method: 'POST', url: '/api/plan/planlama-kayitlari/yaz', headers: { cookie: cerez },
      payload: { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: { ...calisma, plan: { ops: {}, fail: [], J: {}, dataVer: 1, ozet: { late: 3, n: 4, tl: TL } } }, beklenenSurum: surum } });
    assert.equal(yaz.statusCode, 200, yaz.body);
    assert.ok(JSON.stringify((await sorgular.planlamaKaydi(vt(), PLANLAMA_ANAHTARI))?.deger).includes(String(TL)), 'kayıtta kalır');
    const kisi = (islemler: string[]) => ({ id: 1, ad: 'Deneme', islemler }) as unknown as Parameters<typeof planlamaKayitlari>[1];
    const okuyucular = { planlamaci: kisi(['plan.planlama-oku', 'plan.yaz']), receteRota: kisi(['recete-rota.oku']), maliyet: kisi(['plan.planlama-oku', 'finans.maliyet-oku']) };
    for (const [ad, k] of Object.entries(okuyucular)) {
      const ham = JSON.stringify(await vt().tx((db) => planlamaKayitlari(db, k)));
      const cal = ad === 'receteRota' ? null : JSON.stringify(await vt().tx((db) => planlamaCalismasi(db, k)));
      for (const g of [ham, cal]) {
        if (g === null) continue;
        assert.equal(g.includes(String(TL)), ad === 'maliyet', `${ad}: ${g.slice(0, 120)}`);
        assert.match(g, /"late":3/, `${ad}: öteki özet alanları kalır`);
      }
    }
  });

  test('BS-09: metin biçimli eski satırda da toplam maliyet görmeyene dönmez (saf)', () => {
    const m = JSON.stringify({ surum: 2, plan: { ozet: { late: 1, tl: 77713 } }, D: { meta: {} } });
    assert.equal(maliyetsizKayitDegeri('metin', m), JSON.stringify({ surum: 2, plan: { ozet: { late: 1 } }, D: { meta: {} } }));
    assert.equal(maliyetsizKayitDegeri('metin', 'duz metin'), 'duz metin');
    assert.deepEqual(maliyetsizKayitDegeri('json', { plan: null, D: {} }), { plan: null, D: {} });
  });
  // 2772 M2 (Güvenlik O2): tezgâhın saat ücreti (Finans istasyon saat maliyeti) kayda yazılmaz ve hiçbir okumada maliyet görmeyene dönmez.
  // Ücret uydurmadır (7319).
  test('BS-10: tezgâh ücreti kayda girmez; ham okuma ve görmeyenin çalışma okuması taşımaz; öteki tezgâh alanları kalır', async () => {
    const UCRET = 7319;
    const okunan = await app.inject({ method: 'GET', url: '/api/plan/planlama-calismasi', headers: { cookie: cerez } });
    const { surum } = okunan.json() as PlanlamaCalismasiCevabi;
    const tezgahlar = [{ id: 'T9', ad: 'Deneme', grup: '10', ucret: UCRET, ucretIst: UCRET, verim: 1, opOran: 1 }];
    const yaz = await app.inject({ method: 'POST', url: '/api/plan/planlama-kayitlari/yaz', headers: { cookie: cerez },
      payload: { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: { ...calisma, D: { ...calisma.D, tezgahlar } }, beklenenSurum: surum } });
    assert.equal(yaz.statusCode, 200, yaz.body);
    const ham = JSON.stringify((await sorgular.planlamaKaydi(vt(), PLANLAMA_ANAHTARI))?.deger);
    assert.ok(!ham.includes(String(UCRET)) && ham.includes('"opOran":1'), ham.slice(0, 200));
    // Göçten önce kalmış kayıt: ücret kayıtta dursa da görmeyene dönmez.
    await vt().sorgu(`UPDATE plan_planlama_kaydi SET deger = $2::jsonb, surum = surum + 1 WHERE anahtar = $1`,
      [PLANLAMA_ANAHTARI, JSON.stringify({ ...calisma, D: { ...calisma.D, tezgahlar } })]);
    const kisi = (islemler: string[]) => ({ id: 1, ad: 'Deneme', islemler }) as unknown as Parameters<typeof planlamaKayitlari>[1];
    for (const k of [kisi(['plan.planlama-oku', 'plan.yaz']), kisi(['recete-rota.oku']), kisi(['plan.planlama-oku', 'finans.maliyet-oku'])]) {
      const g = JSON.stringify(await vt().tx((db) => planlamaKayitlari(db, k)));
      assert.ok(!g.includes(String(UCRET)), `ham okuma ${k.islemler.join(',')}`);
    }
    const cal = JSON.stringify(await vt().tx((db) => planlamaCalismasi(db, kisi(['plan.planlama-oku', 'plan.yaz']))));
    assert.ok(!cal.includes(String(UCRET)), cal.slice(0, 200));
    assert.deepEqual(tezgahUcretiniCikar({ D: { tezgahlar: [{ id: 'A', ucret: 1, ucretIst: 1, grup: '1' }, 'x'] } }), { D: { tezgahlar: [{ id: 'A', grup: '1' }, 'x'] } });
  });
  // 2772 M4: malzemenin birim fiyatı (Finans malzeme maliyeti) kayda girmez; ham okumada dönmez; görmeyenin çalışma okumasında kayıttaki
  // değer görünmez. Fiyat uydurmadır (6131).
  test('BS-11: malzeme birim fiyatı kayda girmez; kayıtta kalmış değer ham okumada ve görmeyenin çalışma okumasında yok', async () => {
    const FIYAT = 6131;
    const malzemeler = [{ kod: 'H1', ad: 'Ornek cubuk', birim: 'kg', stok: 5, birimFiyat: FIYAT, tedarikGun: 2, muayeneGun: 0 }];
    const okunan = await app.inject({ method: 'GET', url: '/api/plan/planlama-calismasi', headers: { cookie: cerez } });
    const { surum } = okunan.json() as PlanlamaCalismasiCevabi;
    const yaz = await app.inject({ method: 'POST', url: '/api/plan/planlama-kayitlari/yaz', headers: { cookie: cerez },
      payload: { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: { ...calisma, D: { ...calisma.D, malzemeler } }, beklenenSurum: surum } });
    assert.equal(yaz.statusCode, 200, yaz.body);
    const ham = JSON.stringify((await sorgular.planlamaKaydi(vt(), PLANLAMA_ANAHTARI))?.deger);
    assert.ok(!ham.includes(String(FIYAT)) && ham.includes('"tedarikGun":2'), ham.slice(0, 200));
    await vt().sorgu(`UPDATE plan_planlama_kaydi SET deger = $2::jsonb, surum = surum + 1 WHERE anahtar = $1`,
      [PLANLAMA_ANAHTARI, JSON.stringify({ ...calisma, D: { ...calisma.D, malzemeler } })]);
    const kisi = (islemler: string[]) => ({ id: 1, ad: 'Deneme', islemler }) as unknown as Parameters<typeof planlamaKayitlari>[1];
    for (const k of [kisi(['plan.planlama-oku', 'plan.yaz']), kisi(['recete-rota.oku']), kisi(['plan.planlama-oku', 'finans.maliyet-oku'])]) {
      assert.ok(!JSON.stringify(await vt().tx((db) => planlamaKayitlari(db, k))).includes(String(FIYAT)), `ham okuma ${k.islemler.join(',')}`);
    }
    const cal = JSON.stringify(await vt().tx((db) => planlamaCalismasi(db, kisi(['plan.planlama-oku', 'plan.yaz']))));
    assert.ok(!cal.includes(String(FIYAT)), cal.slice(0, 300));
    assert.deepEqual(malzemeFiyatiniCikar({ D: { malzemeler: [{ kod: 'A', birimFiyat: 0, stok: 1 }, null] } }), { D: { malzemeler: [{ kod: 'A', stok: 1 }, null] } });
  });
});
