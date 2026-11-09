import type { Db } from '#cekirdek/db.ts';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { MOTOR_AYARI_VARSAYILAN } from '#paylasilan/sozlesme/plan.ts';
import type { PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { DURUM_ANAHTARI } from '../recete-rota/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { calismayaMotorAyari, genelGiderAlanlariniCikar } from './motor-ayari-kurallar.ts';
import { planGenelGideriCevir } from './servis.ts';
import * as sorgular from './sorgular.ts';

// 2601 a: planlamanın genel gider saat başı tutarı Finans'ın o güne geçerli oranıdır; elle girilmiş değer kullanılmaz. Veriler uydurmadır.
const planTL = (c: unknown): Record<string, unknown> => ((c as { D: { planTL: Record<string, unknown> } }).D.planTL);
const CALISMA = { D: { planTL: { genelGider: 55, operatorUcret: 10 } } };

describe('genel gider Finans oranından (2601 a, saf)', () => {
  test('MF-01: oran verilince planTL.genelGider odur; null bilinmiyor demektir, elle değer kalmaz', () => {
    assert.equal(planTL(calismayaMotorAyari(CALISMA, MOTOR_AYARI_VARSAYILAN, null, null, undefined, { saatBasi: 120, gizli: false }))['genelGider'], 120);
    assert.equal(planTL(calismayaMotorAyari(CALISMA, MOTOR_AYARI_VARSAYILAN, null, null, undefined, { saatBasi: null, gizli: false }))['genelGider'], null);
  });
  test('MF-02: verilmezse (okunamadı) çalışmadaki değer kalır; operatör ücretine dokunulmaz', () => {
    const p = planTL(calismayaMotorAyari(CALISMA, MOTOR_AYARI_VARSAYILAN));
    assert.deepEqual([p['genelGider'], p['operatorUcret']], [55, 10]);
  });
  test('MF-05 (2668 a): gizli ayda oran çalışmaya yazılmaz, genelGider null ve genelGiderGizli true; açık ayda bayrak false', () => {
    assert.deepEqual(planGenelGideriCevir({ saatBasi: 416.6667, amortismanDahil: true, gizli: true } as { saatBasi: number }), { saatBasi: null, gizli: true });
    assert.deepEqual(planGenelGideriCevir({ saatBasi: 416.6667, amortismanDahil: true, gizli: false } as { saatBasi: number }), { saatBasi: 416.6667, gizli: false });
    assert.deepEqual(planGenelGideriCevir({ saatBasi: 1 }), { saatBasi: 1, gizli: false }, 'bayrak gelmeden (2594 b öncesi) oran açıktır');
    assert.deepEqual(planGenelGideriCevir(null), { saatBasi: null, gizli: false });
    const gizli = planTL(calismayaMotorAyari({ D: { planTL: { genelGider: 416.6667, genelGiderGizli: false } } }, MOTOR_AYARI_VARSAYILAN, null, null, undefined, { saatBasi: null, gizli: true }));
    assert.deepEqual([gizli['genelGider'], gizli['genelGiderGizli']], [null, true]);
    assert.ok(!JSON.stringify(gizli).includes('416'), 'gizli oran çalışmada kalmaz');
    const acik = planTL(calismayaMotorAyari({ D: { planTL: { genelGiderGizli: true } } }, MOTOR_AYARI_VARSAYILAN, null, null, undefined, { saatBasi: 120, gizli: false }));
    assert.deepEqual([acik['genelGider'], acik['genelGiderGizli']], [120, false]);
  });
  test('MF-06 (Güvenlik K1): kayda giden çalışmadan genel gider alanları çıkar; öteki planTL alanları ve çalışma kalır', () => {
    const c = { surum: 2, D: { meta: { ad: 'Ornek' }, planTL: { genelGider: 416.6667, genelGiderGizli: false, operatorUcret: 10, amac: 'tl' } } };
    assert.deepEqual(genelGiderAlanlariniCikar(c), { surum: 2, D: { meta: { ad: 'Ornek' }, planTL: { operatorUcret: 10, amac: 'tl' } } });
    assert.equal(c.D.planTL.genelGider, 416.6667, 'girdi değiştirilmez');
    const yok = { D: { planTL: { operatorUcret: 10 } } };
    assert.equal(genelGiderAlanlariniCikar(yok), yok);
    for (const x of [null, 'metin', { D: null }, { D: { planTL: null } }]) assert.equal(genelGiderAlanlariniCikar(x), x);
  });
});

const receteRotaKaydiEkle = (db: Db, deger: unknown, kisiId: number) => db.sorgu(
  `INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', $2::jsonb, nextval('recete_rota_surum'), $3)`,
  [DURUM_ANAHTARI, JSON.stringify(deger), kisiId]);
const PAROLA = 'dogru-parola-1';

describe('planlama çalışması genel gideri Finans oranından (2601 a, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let tam = '';
  let planlamaci = '';
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };
  async function girisCerezi(kullaniciAdi: string): Promise<string> {
    const cevap = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(cevap.statusCode, 200);
    return String(cevap.headers['set-cookie']).split(';')[0] ?? '';
  }
  const kayit = { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] };
  const calisma = {
    surum: 2, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
    w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
    D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [],
      personel: [], siparisler: [], ayarlar: {}, planTL: { genelGider: 55 } },
  };
  const okunanGenelGider = async (cerez: string): Promise<unknown> => {
    const c = await app.inject({ method: 'GET', url: '/api/plan/planlama-calismasi', headers: { cookie: cerez } });
    assert.equal(c.statusCode, 200, c.body);
    return planTL((c.json() as PlanlamaCalismasiCevabi).calisma)['genelGider'];
  };

  before(async () => {
    ortam = await testVeritabaniKur('plan_maliyet_finans');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    tam = await girisCerezi('yonetici');
    const rol = await vt().tek<{ id: number }>("INSERT INTO rol (kod, ad) VALUES ('test_planlamaci', 'test_planlamaci') RETURNING id");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, 'plan.planlama-oku'), ($1, 'recete-rota.oku')", [rol?.id]);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: 'Deneme Planlamaci', kullaniciAdi: 'planlamaci', parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    planlamaci = await girisCerezi('planlamaci');
    await ortam.vt.tx((db) => receteRotaKaydiEkle(db, kayit, yoneticiId));
    await ortam.vt.tx((db) => sorgular.planlamaKaydiEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma, kisiId: yoneticiId }));
  });
  after(async () => { await ortam?.kaldir(); });

  test('MF-03: Finans’ta oran yokken genel gider null; elle 55 kullanılmaz', async () => {
    assert.equal(await okunanGenelGider(tam), null);
  });
  test('MF-04: Finans oranı girilince saat başı tutar (120000 / 1000 = 120); finans maliyetini okuyamayana Finans rakamı gitmez', async () => {
    await vt().sorgu(
      "INSERT INTO finans_genel_gider_orani (gecerlilik_baslangic, aylik_genel_gider, aylik_makine_saati, amortisman_dahil, olusturan_id) VALUES ('2026-01-01', 120000, 1000, false, $1)",
      [yoneticiId]);
    assert.equal(await okunanGenelGider(tam), 120);
    // Okuyamayanın çalışmasına Finans oranı yazılmaz (kayıttaki kalır; birleşme planTL'yi düşürebilir, bugünkü davranış).
    // Güvenlik K1: okuyamayana kayıttaki değer de gitmez; null ve "gizli".
    assert.equal(await okunanGenelGider(planlamaci), null);
  });
  test('MF-07 (Güvenlik K1): sayfa oranı geri yazınca kayda girmez; iki uçta da maliyet yetkisi olmayan oranı görmez', async () => {
    const okunan = await app.inject({ method: 'GET', url: '/api/plan/planlama-calismasi', headers: { cookie: tam } });
    const { calisma: c, surum } = okunan.json() as PlanlamaCalismasiCevabi;
    assert.deepEqual([planTL(c)['genelGider'], planTL(c)['genelGiderGizli']], [120, false]);
    const yaz = await app.inject({ method: 'POST', url: '/api/plan/planlama-kayitlari/yaz', headers: { cookie: tam },
      payload: { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: c, beklenenSurum: surum } });
    assert.equal(yaz.statusCode, 200, yaz.body);
    const kayitli = planTL((await sorgular.planlamaKaydi(vt(), PLANLAMA_ANAHTARI))?.deger);
    assert.ok(!('genelGider' in kayitli) && !('genelGiderGizli' in kayitli), JSON.stringify(kayitli));
    assert.ok(!('genelGider' in planTL((yaz.json() as { kayit: { deger: unknown } }).kayit.deger)), 'yazma cevabı da oranı taşımaz');
    for (const cerez of [planlamaci, tam]) {
      const l = await app.inject({ method: 'GET', url: '/api/plan/planlama-kayitlari', headers: { cookie: cerez } });
      assert.equal(l.statusCode, 200, l.body);
      const k = (l.json() as { kayitlar: { anahtar: string; deger: unknown }[] }).kayitlar.find((x) => x.anahtar === PLANLAMA_ANAHTARI);
      assert.ok(k && !('genelGider' in planTL(k.deger)), 'ham kayıt okumasında oran yok');
    }
    const p = await app.inject({ method: 'GET', url: '/api/plan/planlama-calismasi', headers: { cookie: planlamaci } });
    assert.deepEqual([planTL((p.json() as PlanlamaCalismasiCevabi).calisma)['genelGider'], planTL((p.json() as PlanlamaCalismasiCevabi).calisma)['genelGiderGizli']], [null, true]);
    assert.equal(await okunanGenelGider(tam), 120, 'yetkili okuyucu Finans oranını yine görür');
  });
  test('MF-08 (Güvenlik K1): eski kayıtta kalmış genel gider ham kayıt okumasında da gitmez', async () => {
    const s = (await sorgular.planlamaKaydi(vt(), PLANLAMA_ANAHTARI))!;
    const eski = { ...(s.deger as object), D: { ...(s.deger as { D: object }).D, planTL: { genelGider: 120, genelGiderGizli: false } } };
    await vt().tx((db) => sorgular.planlamaKaydiGuncelle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: eski, kisiId: yoneticiId }));
    const l = await app.inject({ method: 'GET', url: '/api/plan/planlama-kayitlari', headers: { cookie: planlamaci } });
    const k = (l.json() as { kayitlar: { anahtar: string; deger: unknown }[] }).kayitlar.find((x) => x.anahtar === PLANLAMA_ANAHTARI);
    assert.ok(k && !('genelGider' in planTL(k.deger)));
    assert.equal(await okunanGenelGider(planlamaci), null);
  });
});
