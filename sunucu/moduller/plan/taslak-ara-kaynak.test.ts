import type { Db } from '#cekirdek/db.ts';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { TaslakCevabi, TaslakUygulaCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { DURUM_ANAHTARI } from '../recete-rota/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import * as sorgular from './sorgular.ts';
import { SIZ_BASKA_PENCERE } from './taslak-kurallar.ts';

// 3733: Canlıya al'da araya giren değişiklik kaynağına göre ayrılır (gerçek PostgreSQL). Veri yenilemesi (bekleyen kimliği 'dis-') çatışma
// sayılmaz; kişinin başka penceredeki değişikliği yalnız aynı emirde "Siz (başka pencerede)" diye, başkasınınki adıyla, plan ayarı yapanın
// adıyla bütün planda sorulur. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
const BUGUN = new Date().toISOString().slice(0, 10);
const receteRotaKaydiEkle = (db: Db, deger: unknown, kisiId: number) => db.sorgu(
  `INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', $2::jsonb, nextval('recete_rota_surum'), $3)`,
  [DURUM_ANAHTARI, JSON.stringify(deger), kisiId]);
const op = (id: string, m: string, S: number) => ({ id, job: id.slice(0, id.lastIndexOf('.')), m, S, Su: S, C: S + 10, lot1: S + 1 });
type Calisma = Record<string, unknown> & { plan: { dataVer: number; ops: Record<string, Record<string, unknown>> }; bekleyen?: unknown[] };

describe('canlıya alma: araya giren değişikliğin kaynağı (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let a = '', b = '';
  const vt = (): TestVeritabani['vt'] => { if (!ortam) throw new Error('Test veritabanı açılamadı.'); return ortam.vt; };

  const ilk = {
    surum: 2, rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], bekleyen: [],
    plan: { dataVer: 1, ops: { 'ORN-E1.10': op('ORN-E1.10', 'ORN-T1', 40), 'ORN-E2.10': op('ORN-E2.10', 'ORN-T2', 60) } },
    w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
    D: { meta: { ad: 'Ornek', baslangic: BUGUN }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [],
      personel: [], siparisler: [], ayarlar: {} },
  };

  async function giris(kullaniciAdi: string): Promise<string> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function islemliKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [`test_${kullaniciAdi}`]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol?.id, islem]);
    await vt().tx(async (db) => {
      const yeni = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      const kisi = await rolAta(db, yoneticiId, yeni, rol?.id ?? 0);
      for (const r of kisi.roller) if (r.id !== rol?.id) await rolAl(db, yoneticiId, yeni, r.id);
    });
    return giris(kullaniciAdi);
  }
  const istek = async <T>(cerez: string, yontem: 'GET' | 'POST', url: string, payload?: Record<string, unknown>, kod = 200): Promise<T> => {
    const c = await app.inject({ method: yontem, url: `/api${url}`, headers: { cookie: cerez, ...(yontem === 'POST' ? { 'istek-kimligi': randomUUID() } : {}) }, ...(payload === undefined ? {} : { payload }) });
    assert.equal(c.statusCode, kod, c.body);
    return c.json() as T;
  };
  const ortak = async (): Promise<{ deger: Calisma; surum: number }> =>
    (await vt().tek<{ deger: Calisma; surum: number }>('SELECT deger, surum::float8 AS surum FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI]))!;
  // Ortak çalışma sayfanın yazma yolundan yazılır (plan.yaz, sürüm, defter).
  const yaz = async (cerez: string, degistir: (c: Calisma) => Calisma): Promise<void> => {
    const o = await ortak();
    await istek(cerez, 'POST', '/plan/planlama-kayitlari/yaz', { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: degistir(structuredClone(o.deger)), beklenenSurum: o.surum });
  };
  const tasi = (c: Calisma, isId: string, S: number): Calisma => ({ ...c, plan: { ...c.plan, ops: { ...c.plan.ops, [isId]: { ...c.plan.ops[isId], S, Su: S, C: S + 10 } } } });
  const sifirla = async (): Promise<void> => {
    await vt().sorgu('DELETE FROM plan_taslagi');
    await vt().sorgu('UPDATE plan_planlama_kaydi SET deger = $2::jsonb, surum = nextval(\'plan_planlama_surum\') WHERE anahtar = $1', [PLANLAMA_ANAHTARI, JSON.stringify(ilk)]);
  };
  const uzadi = (isId: string) => ({ tur: 'adim-uzadi', isId, ekSaat: 2 });
  const taslakAc = async (komut: Record<string, unknown>) => (await istek<TaslakCevabi>(a, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut })).taslak!.surum;
  const uygula = (surum: number, secimler?: Record<string, 'benim' | 'onun'>) =>
    istek<TaslakUygulaCevabi>(a, 'POST', '/plan/taslagim/uygula', { taslakSurumu: surum, ...(secimler === undefined ? {} : { secimler }) });

  before(async () => {
    ortam = await testVeritabaniKur('plan_taslak_ara');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await ortam.vt.tx(async (db) => {
      await receteRotaKaydiEkle(db, { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] }, yoneticiId);
      await sorgular.planlamaKaydiEkle(db, { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: ilk, kisiId: yoneticiId });
    });
    a = await giris('yonetici');
    b = await islemliKisi('planlayici_b', ['plan.oku', 'plan.yaz']);
  });
  after(async () => { await ortam?.kaldir(); });

  test('AK-1: arada yalnız veri yenilemesi varken bütün planı etkileyen taslak sorusuz canlıya alınır; komut güncel veriye uygulanır', async () => {
    await sifirla();
    const surum = await taslakAc({ tur: 'yeniden-planla', isler: ['*'] });
    // Başka sayfanın değişikliği bekleyene düşer ("kaynak"), sonra plan güncellenir ("uygulandi"); ikisi de işlerin yerini değiştirir.
    const dis = { id: 'dis-ORN-1', ne: 'Başka sayfada değişti: Malzemeler', ayrinti: 'ORN-M1 stok boş → 2', isler: ['*'], dis: true, kim: '', t: 1, geri: null };
    await yaz(a, (c) => ({ ...tasi(c, 'ORN-E1.10', 44), bekleyen: [dis], dataVer: 2 }));
    await yaz(b, (c) => tasi({ ...c, bekleyen: [], plan: { ...c.plan, dataVer: 2 } }, 'ORN-E2.10', 66));
    const defter = await vt().sorgu<{ olay: string }>("SELECT olay FROM plan_degisiklik_defteri WHERE bekleyen_id = 'dis-ORN-1' ORDER BY id");
    assert.deepEqual(defter.map((x) => x.olay), ['kaynak', 'uygulandi']);
    const u = await uygula(surum);
    assert.equal(u.durum, 'uygulandi', JSON.stringify(u));
    const o = (await ortak()).deger;
    assert.deepEqual([o.plan.ops['ORN-E1.10']?.['S'], o.plan.ops['ORN-E2.10']?.['S']], [44, 66], 'güncel veri korundu');
    assert.equal((o.bekleyen as { ne: string }[]).at(-1)?.ne, 'Yeniden planlama istendi', 'komut güncel veriye uygulandı');
  });

  test('AK-2: kişinin başka penceredeki değişikliği başka emirdeyse sorulmaz; aynı emirdeyse "Siz (başka pencerede)" diye sorulur', async () => {
    await sifirla();
    const s1 = await taslakAc(uzadi('ORN-E1.10'));
    await yaz(a, (c) => tasi(c, 'ORN-E2.10', 70));
    assert.equal((await uygula(s1)).durum, 'uygulandi');

    await sifirla();
    const s2 = await taslakAc(uzadi('ORN-E1.10'));
    const bek = { id: '9-1', ne: 'İş taşındı', ayrinti: 'ORN-E1.10: 40 → 48', isler: ['ORN-E1'], kim: 'Deneme Yonetici', t: 9, geri: [] };
    await yaz(a, (c) => ({ ...tasi(c, 'ORN-E1.10', 48), bekleyen: [bek] }));
    const s = await uygula(s2);
    assert.equal(s.durum, 'secim');
    const c = s.durum === 'secim' ? s.catismalar : [];
    assert.deepEqual(c.map((x) => [x.anahtar, x.kaynaklar?.map((k) => [k.sinif, k.kim, k.ne, k.ayrinti])]),
      [['emir:ORN-E1', [['ben', SIZ_BASKA_PENCERE, 'İş taşındı', 'ORN-E1.10: 40 → 48']]]]);
    assert.ok(c[0]?.kaynaklar?.[0]?.zaman, 'ne zaman yazar');
    assert.equal((await uygula(s2, { 'emir:ORN-E1': 'benim' })).durum, 'uygulandi');
  });

  test('AK-3: başka kişinin aynı emirdeki değişikliği adıyla sorulur; başka emirdeki sorulmaz', async () => {
    await sifirla();
    const s1 = await taslakAc(uzadi('ORN-E1.10'));
    await yaz(b, (c) => tasi(c, 'ORN-E2.10', 72));
    assert.equal((await uygula(s1)).durum, 'uygulandi');

    await sifirla();
    const s2 = await taslakAc(uzadi('ORN-E1.10'));
    await yaz(b, (c) => tasi(c, 'ORN-E1.10', 50));
    const s = await uygula(s2);
    assert.equal(s.durum, 'secim');
    assert.deepEqual(s.durum === 'secim' && s.catismalar.map((x) => [x.anahtar, x.kaynaklar?.map((k) => [k.sinif, k.kim])]),
      [['emir:ORN-E1', [['diger', 'Deneme planlayici_b']]]]);
    assert.equal((await uygula(s2, { 'emir:ORN-E1': 'onun' })).durum, 'uygulandi');
    assert.equal((await ortak()).deger.plan.ops['ORN-E1.10']?.['S'], 50, 'onunki kaldı');
  });

  test('AK-4: plan ayarı değişikliği yapanın adıyla bütün plan satırında sorulur', async () => {
    await sifirla();
    const s1 = await taslakAc(uzadi('ORN-E1.10'));
    const tb = await istek<TaslakCevabi>(b, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: { tur: 'ayar', ayar: { w: { dondurma: 7 }, param: {}, ac: [], kapat: [] }, ayrinti: 'Dondurma 4 → 7' } });
    assert.equal((await istek<TaslakUygulaCevabi>(b, 'POST', '/plan/taslagim/uygula', { taslakSurumu: tb.taslak!.surum })).durum, 'uygulandi');
    const s = await uygula(s1);
    assert.equal(s.durum, 'secim');
    assert.deepEqual(s.durum === 'secim' && s.catismalar.map((x) => [x.anahtar, x.kaynaklar?.map((k) => [k.sinif, k.kim, k.ne, k.ayrinti])]),
      [['*', [['ayar', 'Deneme planlayici_b', 'Plan ayarı değişti', 'Dondurma 4 → 7']]]]);
  });
});
