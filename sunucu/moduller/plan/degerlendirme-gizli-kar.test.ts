import type { Db } from '#cekirdek/db.ts';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { degerlendirmeSonucu, type DegerlendirmeSonucu, type PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { DURUM_ANAHTARI } from '../recete-rota/disari.ts';
import { genelGiderGizliMi, karsiz } from './degerlendirme.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import * as sorgular from './sorgular.ts';

// 2677 b: genel gider oranının gizli olduğu ayda planlama değerlendirmesi kâr göndermez; tutar ve bedeller kalır. Veriler uydurmadır.
const parse = (x: unknown): DegerlendirmeSonucu => degerlendirmeSonucu.parse(x);
const PLAN_SECENEKLERI = parse({
  tur: 'plan-secenekleri',
  secenekler: [{ denge: 50, carpan: 1, ekMesai: [{ makineId: 'T1', gun: 1, vardiya: '3', tl: 400 }], ekMesaiTl: 400, geciken: 1, isSayisi: 2, gecikmeSaat: 3, netKar: 1234, eksik: 0, plan: {} }],
});
const TERMIN_SECENEKLERI = parse({
  tur: 'termin-secenekleri', siparisId: 'O1', havuz: false, taban: 'girilen-termin', yerlesti: true,
  satirlar: [{ secenek: 'en-erken', termin: '2026-10-21', bitis: 30, gecikmeSaat: 0, tutar: 5000, netKar: 900, digerKarFarki: -50, digerGecikmeFarki: 2, toplamKar: 850 }],
});
const TERMIN_UZATMA = parse({
  tur: 'termin-uzatma', gun: 2,
  satirlar: [{ siparisId: 'O1', yeniTermin: '2026-10-22', gecikmeSimdi: 5, gecikmeUzatinca: 0, netKarFarki: 300, gecikmeSaatFarki: -5, gecikenFarki: -1 }],
});

describe('gizli ayda kâr gönderilmez (2677 b, saf)', () => {
  test('GK-01: gizli bayrağı çalışmanın planTL.genelGiderGizli alanından; yalnız true gizlidir', () => {
    assert.equal(genelGiderGizliMi({ D: { planTL: { genelGider: null, genelGiderGizli: true } } }), true);
    for (const c of [{ D: { planTL: { genelGider: 120, genelGiderGizli: false } } }, { D: { planTL: {} } }, { D: {} }, {}, null, 'x', { D: { planTL: { genelGiderGizli: 'true' } } }]) {
      assert.equal(genelGiderGizliMi(c), false, JSON.stringify(c));
    }
  });
  test('GK-02: kâr alanları null; tutar, ek mesai TL ve sözleşme biçimi kalır', () => {
    const p = karsiz(PLAN_SECENEKLERI);
    assert.ok(p.tur === 'plan-secenekleri');
    assert.deepEqual(p.secenekler[0], { ...(PLAN_SECENEKLERI as typeof p).secenekler[0], netKar: null });
    const t = karsiz(TERMIN_SECENEKLERI);
    assert.ok(t.tur === 'termin-secenekleri');
    assert.deepEqual(t.satirlar[0], { ...(TERMIN_SECENEKLERI as typeof t).satirlar[0], netKar: null, digerKarFarki: null, toplamKar: null });
    assert.equal(t.satirlar[0]?.tutar, 5000);
    const u = karsiz(TERMIN_UZATMA);
    assert.ok(u.tur === 'termin-uzatma');
    assert.deepEqual(u.satirlar[0], { ...(TERMIN_UZATMA as typeof u).satirlar[0], netKarFarki: null });
    for (const x of [p, t, u]) assert.doesNotThrow(() => degerlendirmeSonucu.parse(x));
    assert.ok(!JSON.stringify([p, t, u]).match(/1234|900|850|300/), 'kâr rakamı kalmaz');
  });
  test('GK-03: kâr taşımayan sonuçlar aynen döner; girdi değiştirilmez', () => {
    const k = parse({ tur: 'plan-kur', plan: { ops: {} } });
    assert.equal(karsiz(k), k);
    karsiz(TERMIN_SECENEKLERI);
    assert.ok(TERMIN_SECENEKLERI.tur === 'termin-secenekleri' && TERMIN_SECENEKLERI.satirlar[0]?.netKar === 900);
  });
});

// 2674 (Maliyet koşulu): gizli ayda gerçek oran maliyeti gören okuyucunun tarayıcısına da gitmez; sayfa çalışmayı geri yazınca kayda da
// girmez. Gizli satır Finans'ın personel_gizli sütunuyla kurulur.
const receteRotaKaydiEkle = (db: Db, deger: unknown, kisiId: number) => db.sorgu(
  `INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', $2::jsonb, nextval('recete_rota_surum'), $3)`,
  [DURUM_ANAHTARI, JSON.stringify(deger), kisiId]);
const PAROLA = 'dogru-parola-1';
const planTL = (c: unknown): Record<string, unknown> => ((c as { D: { planTL: Record<string, unknown> } }).D.planTL);

describe('gizli ayda gerçek oran tarayıcıya gitmez (2677 b, 2674, gerçek PostgreSQL)', async () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let cerez = '';
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };
  const kayit = { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] };
  const calisma = {
    surum: 2, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
    w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
    D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [],
      personel: [], siparisler: [], ayarlar: {}, planTL: { genelGider: 55 } },
  };

  before(async () => {
    ortam = await testVeritabaniKur('plan_gizli_oran');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    const yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    const g = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'yonetici', parola: PAROLA } });
    cerez = String(g.headers['set-cookie']).split(';')[0] ?? '';
    await ortam.vt.tx((db) => receteRotaKaydiEkle(db, kayit, yoneticiId));
    await ortam.vt.tx((db) => sorgular.planlamaKaydiEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma, kisiId: yoneticiId }));
    // Aylık 7.771.234,50 / 1000 saat = 7771,2345: başka hiçbir alanda geçmeyen bir sayı.
    await vt().sorgu(
      `INSERT INTO finans_genel_gider_orani (gecerlilik_baslangic, aylik_genel_gider, aylik_makine_saati, amortisman_dahil, olusturan_id, kaynak, donem_baslangic,
         donem_bitis, kira, amortisman, dolayli_personel, emilmeyen_dogrudan, diger, projesiz_satin_alma, elle_ek, personel_gizli)
       VALUES ('2026-01-01', 7771234.50, 1000, false, $1, 'belge', '2025-12-01', '2025-12-31', 1000, 0, NULL, NULL, 0, 0, 0, true)`, [yoneticiId]);
  });
  after(async () => { await ortam?.kaldir(); });

  test('GK-04: maliyeti gören okuyucuya oran gitmez, "gizli" gider; geri yazınca kayıtta ve ham kayıt okumasında da yok', async () => {
    const okunan = await app.inject({ method: 'GET', url: '/api/plan/planlama-calismasi', headers: { cookie: cerez } });
    assert.equal(okunan.statusCode, 200, okunan.body);
    assert.ok(!okunan.body.includes('7771'), 'gerçek oran cevapta yok');
    const { calisma: c, surum } = okunan.json() as PlanlamaCalismasiCevabi;
    assert.deepEqual([planTL(c)['genelGider'], planTL(c)['genelGiderGizli']], [null, true]);
    const yaz = await app.inject({ method: 'POST', url: '/api/plan/planlama-kayitlari/yaz', headers: { cookie: cerez },
      payload: { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: c, beklenenSurum: surum } });
    assert.equal(yaz.statusCode, 200, yaz.body);
    const l = await app.inject({ method: 'GET', url: '/api/plan/planlama-kayitlari', headers: { cookie: cerez } });
    assert.equal(l.statusCode, 200, l.body);
    for (const govde of [yaz.body, l.body, JSON.stringify((await sorgular.planlamaKaydi(vt(), PLANLAMA_ANAHTARI))?.deger)]) {
      assert.ok(!govde.includes('7771') && !govde.includes('"genelGider"'), govde.slice(0, 200));
    }
  });
});
