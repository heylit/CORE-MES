import type { Db } from '#cekirdek/db.ts';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISLEMLER } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { MOTOR_AYARI_VARSAYILAN } from '#paylasilan/sozlesme/plan.ts';
import type { PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { tesisGunu } from '#paylasilan/zaman.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { DURUM_ANAHTARI } from '../recete-rota/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { calismayaMotorAyari } from './motor-ayari-kurallar.ts';
import { planGirdisi } from './plan-girdisi.ts';
import { kaynakOku } from './planlama-servis.ts';
import * as sorgular from './sorgular.ts';

// Reçete ve Rota'nın ana kaydı (planın girdisi) doğrudan yazılır: sahibi modülün yazma yolu bu testin konusu değildir.
const receteRotaKaydiEkle = (db: Db, deger: unknown, kisiId: number) => db.sorgu(
  `INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', $2::jsonb, nextval('recete_rota_surum'), $3)`,
  [DURUM_ANAHTARI, JSON.stringify(deger), kisiId]);

// 288 a: planlama sayfası çalışmayı sunucuda birleşmiş okur. Beklenen değer aynı betiğin aynı girdiyle doğrudan çağrısıdır (eski çerçevenin
// tarayıcıda yaptığı); takvim eki vardiya takviminden kurulur. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';

describe('planlama çalışması ucu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let tam = '';
  let planlamaci = '';
  let yalnizYazar = '';
  let isMerkeziId = 0;
  let vardiyaId = 0;
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
  const oku = (cerez: string) => app.inject({ method: 'GET', url: '/api/plan/planlama-calismasi', headers: { cookie: cerez } });

  const kayit = { version: 7, savedAt: 9, items: [{ id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' }], opdefs: [], machines: [], routes: {}, orders: [] };
  const calisma = (surum: number) => ({
    surum, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
    w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
    D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [],
      personel: [], siparisler: [], ayarlar: {} },
  });
  async function calismaYaz(deger: unknown): Promise<number> {
    return vt().tx(async (db) => {
      await db.sorgu('DELETE FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
      const k = await sorgular.planlamaKaydiEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger, kisiId: yoneticiId });
      return k?.surum ?? -1;
    });
  }

  before(async () => {
    ortam = await testVeritabaniKur('recete_rota_planlama_calismasi');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    tam = await girisCerezi('yonetici');
    planlamaci = await islemliKisi('planlamaci', ['plan.planlama-oku']);
    yalnizYazar = await islemliKisi('yazar', ['recete-rota.yaz']);
    const s = ortam.sahip;
    isMerkeziId = (await s.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('PC-IM', 'Deneme merkezi') RETURNING id"))!.id;
    vardiyaId = (await s.tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis, aktif) VALUES ('Gunduz', '08:00', '16:00', true) RETURNING id"))!.id;
    // Pazartesi (1) ve pazar (7): çerçevenin biçiminde pazar 0'dır.
    await s.sorgu('INSERT INTO vardiya_matrisi (is_merkezi_id, gun, vardiya_id) VALUES ($1, 1, $2), ($1, 7, $2)', [isMerkeziId, vardiyaId]);
    await s.sorgu('INSERT INTO vardiya_kisi (kisi_id, vardiya_id) VALUES ($1, $2)', [yoneticiId, vardiyaId]);
    await ortam.vt.tx((db) => receteRotaKaydiEkle(db, kayit, yoneticiId));
  });
  after(async () => { await ortam?.kaldir(); });

  test('PC-01: çalışma, kayıt ve kaynak okuması eski çerçevenin betiğiyle birleşmiş döner; takvim eki vardiya takvimindendir; sürüm çalışma kaydınındır', async () => {
    const surum = await calismaYaz(calisma(2));
    const cevap = await oku(tam);
    assert.equal(cevap.statusCode, 200, cevap.body);
    const c = cevap.json() as PlanlamaCalismasiCevabi;
    assert.equal(c.surum, surum);
    const yonetici: Kullanici = { id: yoneticiId, ad: 'Deneme Yonetici', islemler: [...ISLEMLER] };
    const kaynak = await vt().tx((db) => kaynakOku(db, yonetici));
    const takvim = { hafta: { [String(isMerkeziId)]: { 1: [String(vardiyaId)], 0: [String(vardiyaId)] } }, kisiVardiyasi: { [String(yoneticiId)]: String(vardiyaId) } };
    const beklenen = planGirdisi({ calisma: calisma(2), kayit, kaynak: { durum: kaynak.durum, ek: { ...(kaynak.ek as object), takvim } }, bugun: tesisGunu(Date.now()) });
    assert.ok(beklenen);
    // Plan amacı motor ayarındandır (kart 811, 771 a); ayar yazılmamışsa varsayılan.
    assert.deepEqual(c.calisma, JSON.parse(JSON.stringify(calismayaMotorAyari(beklenen.S, MOTOR_AYARI_VARSAYILAN))));
    // Takvim eki girdiye girer: eksiz birleşme başka çalışma verir.
    const eksiz = planGirdisi({ calisma: calisma(2), kayit, kaynak, bugun: tesisGunu(Date.now()) });
    assert.notDeepEqual(c.calisma, JSON.parse(JSON.stringify(eksiz?.S)));
    // Kayıttaki çalışma ile birleşmiş çalışma ayrıdır: Reçete ve Rota kaydı değiştiği için veri ondan yeniden kurulmuştur.
    assert.notDeepEqual(c.calisma?.['D'], calisma(2).D);
    // Kayıt çevirisi ve kaynak okuması veriyi değiştirdi: her biri planı eskitir (dataVer 1 -> 3, çerçevenin rrCek ve kaynakUygula'sı
    // gibi); kayıt okunmuş sayılır.
    assert.equal(c.calisma?.['dataVer'], calisma(2).dataVer + 2);
    assert.equal(c.calisma?.['rrSavedAt'], kayit.savedAt);
  });

  test('PC-02: okuma kaydı değiştirmez', async () => {
    const surum = await calismaYaz(calisma(2));
    assert.equal((await oku(tam)).statusCode, 200);
    const k = await vt().tx((db) => sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI));
    assert.equal(k?.surum, surum);
    assert.deepEqual(k?.deger, calisma(2));
  });

  test('PC-03: çalışma kaydı yoksa çalışma ve sürüm null; biçimi eskiyse çalışma null, sürüm kaydınki', async () => {
    await vt().sorgu('DELETE FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
    assert.deepEqual((await oku(tam)).json(), { calisma: null, surum: null });
    const surum = await calismaYaz(calisma(1));
    assert.deepEqual((await oku(tam)).json(), { calisma: null, surum });
  });

  test('PC-04: yalnız planlama sayfalarını görme işlemi yeter; işlemi olmayan (yalnız recete-rota.yaz) 403, oturumsuz 401 alır', async () => {
    await calismaYaz(calisma(2));
    const izinli = await oku(planlamaci);
    assert.equal(izinli.statusCode, 200, izinli.body);
    assert.notEqual((izinli.json() as PlanlamaCalismasiCevabi).calisma, null);
    assert.equal((await oku(yalnizYazar)).statusCode, 403);
    assert.equal((await app.inject({ method: 'GET', url: '/api/plan/planlama-calismasi' })).statusCode, 401);
  });

  // 657 a: kayıt yoksa sayfa boş çalışmayı sunucuya kurdurur ve düzenlenebilir açılır.
  const olustur = (cerez: string) => app.inject({ method: 'POST', url: '/api/plan/planlama-calismasi/olustur', headers: { cookie: cerez, 'istek-kimligi': crypto.randomUUID() } });

  test('PC-05: kayıt yokken boş çalışma Reçete ve Rota kaydından kurulur, yazılır ve birleşmiş döner; ikinci çağrı var olana dokunmaz', async () => {
    await vt().sorgu('DELETE FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
    const cevap = await olustur(tam);
    assert.equal(cevap.statusCode, 200, cevap.body);
    const c = cevap.json() as PlanlamaCalismasiCevabi;
    assert.notEqual(c.calisma, null, 'kurulan çalışma sayfanın okuduğu biçimde');
    const k = await vt().tx((db) => sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI));
    assert.equal(k?.surum, c.surum);
    const deger = k?.deger as { surum: number; rrSavedAt: number; plan: unknown; D: { meta: { baslangic: string }; urunler: { id: string }[] } };
    assert.equal(deger.surum, 2);
    assert.equal(deger.plan, null);
    assert.equal(deger.rrSavedAt, kayit.savedAt, 'kayıt okunmuş sayılır: açılışta plan eskimez');
    assert.equal(deger.D.meta.baslangic, tesisGunu(Date.now()));
    const ikinci = await olustur(tam);
    assert.equal(ikinci.statusCode, 200, ikinci.body);
    assert.equal((ikinci.json() as PlanlamaCalismasiCevabi).surum, c.surum, 'var olan kayda yazılmaz');
  });

  test('PC-06: boş çalışmayı kurmak kaydı yazmak gibidir: plan.yaz eksikse 403 ve kayıt açılmaz; yalnız plan.yaz yeter (925 a)', async () => {
    await vt().sorgu('DELETE FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
    assert.equal((await olustur(yalnizYazar)).statusCode, 403);
    assert.equal((await olustur(planlamaci)).statusCode, 403);
    assert.equal(await vt().tx((db) => sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI)), null);
    const yalnizPlanci = await islemliKisi('yalniz_planci', ['plan.yaz', 'plan.planlama-oku']);
    assert.equal((await olustur(yalnizPlanci)).statusCode, 200);
    await vt().sorgu('DELETE FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
    assert.equal(await vt().tx((db) => sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI)), null);
  });
});
