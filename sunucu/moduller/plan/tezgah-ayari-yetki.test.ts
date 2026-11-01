import type { Db } from '#cekirdek/db.ts';
import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { DURUM_ANAHTARI } from '../recete-rota/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import * as sorgular from './sorgular.ts';

const receteRotaKaydiEkle = (db: Db, deger: unknown, kisiId: number) => db.sorgu(
  `INSERT INTO recete_rota_kayit (anahtar, bicim, deger, surum, guncelleyen_kisi_id) VALUES ($1, 'json', $2::jsonb, nextval('recete_rota_surum'), $3)`,
  [DURUM_ANAHTARI, JSON.stringify(deger), kisiId]);
// 1742: planlamayı okuyup yazan ama istasyonu (ya da kişiyi) okuyamayan kullanıcının açtığı çalışmada o dilimden kurulan alanlar
// (tezgâhlar, ürünler, personel) kayıttaki gibi kalır; kaydedince tezgâh ve kişinin elle girilen plan ayarı silinmez. Veriler uydurmadır.
const PAROLA = 'dogru-parola-1';
type Calisma = { D: { tezgahlar: { id: string; verim?: number; vardiyalar?: string[] }[]; personel: { id: string; ayar?: boolean }[]; urunler: unknown[] } };

describe('1742: okunamayan dilimin plan ayarı kayıtta kalır (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  let tam = '';
  let istasyonsuz = '';
  let kisisiz = '';
  let istasyonId = 0;
  let makineId = '';
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
  const oku = async (cerez: string): Promise<{ calisma: Calisma; surum: number | null }> => {
    const c = await app.inject({ method: 'GET', url: '/api/plan/planlama-calismasi', headers: { cookie: cerez } });
    assert.equal(c.statusCode, 200, c.body);
    const g = c.json() as PlanlamaCalismasiCevabi;
    assert.ok(g.calisma);
    return { calisma: g.calisma as unknown as Calisma, surum: g.surum };
  };
  // Sayfanın yazıcısı gibi: açılıştaki birleşmiş çalışma bütünüyle geri yazılır.
  const yaz = async (cerez: string, deger: unknown, beklenenSurum: number | null): Promise<void> => {
    const c = await app.inject({
      method: 'POST', url: '/api/plan/planlama-kayitlari/yaz', headers: { cookie: cerez, 'istek-kimligi': crypto.randomUUID() },
      payload: { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger, beklenenSurum } });
    assert.equal(c.statusCode, 200, c.body);
  };
  const kayitli = async (): Promise<Calisma> => (await vt().tx((db) => sorgular.planlamaKaydi(db, PLANLAMA_ANAHTARI)))?.deger as Calisma;
  // Tam yetkili çalışmayı kurar, tezgâhın verim ve vardiyasını ve kişinin ayarcı işaretini elle değiştirip kaydeder.
  async function ayarliCalisma(): Promise<Calisma> {
    await vt().sorgu('DELETE FROM plan_planlama_kaydi WHERE anahtar = $1', [PLANLAMA_ANAHTARI]);
    const kur = await app.inject({ method: 'POST', url: '/api/plan/planlama-calismasi/olustur', headers: { cookie: tam, 'istek-kimligi': crypto.randomUUID() } });
    assert.equal(kur.statusCode, 200, kur.body);
    const { calisma, surum } = await oku(tam);
    const t = calisma.D.tezgahlar.find((x) => x.id === makineId);
    assert.ok(t, 'tam yetkiliye tezgâh gelir');
    t.verim = 0.8; t.vardiyalar = ['v-ozel'];
    const p = calisma.D.personel.find((x) => x.id === String(yoneticiId));
    assert.ok(p, 'tam yetkiliye kişi gelir');
    p.ayar = true;
    await yaz(tam, calisma, surum);
    return kayitli();
  }

  before(async () => {
    ortam = await testVeritabaniKur('plan_tezgah_ayari_yetki');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    tam = await girisCerezi('yonetici');
    istasyonsuz = await islemliKisi('istasyonsuz', ['plan.yaz', 'plan.planlama-oku', 'kisiler.oku']);
    kisisiz = await islemliKisi('kisisiz', ['plan.yaz', 'plan.planlama-oku', 'sayfa.istasyonlar']);
    const s = ortam.sahip;
    const im = await s.tek<{ id: number }>("INSERT INTO is_merkezi (kod, ad) VALUES ('TA-IM', 'Deneme merkezi') RETURNING id");
    istasyonId = (await s.tek<{ id: number }>("INSERT INTO istasyon (kod, ad, is_merkezi_id, aktif) VALUES ('TA-IS', 'Deneme torna', $1, true) RETURNING id", [im!.id]))!.id;
    makineId = String((await s.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id, aktif) VALUES ('TA-M1', 'Deneme torna 1', $1, true) RETURNING id", [istasyonId]))!.id);
    await ortam.vt.tx((db) => receteRotaKaydiEkle(db, { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] }, yoneticiId));
  });
  after(async () => { await ortam?.kaldir(); });

  test('TA-01: istasyonu okuyamayan açar ve kaydeder: tezgâhlar ve ürünler kayıttaki gibi kalır (verim, vardiya silinmez)', async () => {
    const once = await ayarliCalisma();
    const { calisma, surum } = await oku(istasyonsuz);
    assert.deepEqual(calisma.D.tezgahlar, once.D.tezgahlar, 'okunamayan dilim boş liste sayılmaz');
    assert.deepEqual(calisma.D.urunler, once.D.urunler);
    await yaz(istasyonsuz, calisma, surum);
    const sonra = await kayitli();
    assert.deepEqual(sonra.D.tezgahlar, once.D.tezgahlar);
    const t = sonra.D.tezgahlar.find((x) => x.id === makineId);
    assert.equal(t?.verim, 0.8);
    assert.deepEqual(t?.vardiyalar, ['v-ozel']);
  });

  test('TA-02: kişiyi okuyamayan açar ve kaydeder: personel kayıttaki gibi kalır; okuyabildiği tezgâh dilimi yenilenir', async () => {
    const once = await ayarliCalisma();
    const yeniMakine = String((await ortam!.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id, aktif) VALUES ('TA-M2', 'Deneme torna 2', $1, true) RETURNING id", [istasyonId]))!.id);
    try {
      const { calisma, surum } = await oku(kisisiz);
      assert.deepEqual(calisma.D.personel, once.D.personel);
      assert.ok(calisma.D.tezgahlar.some((x) => x.id === yeniMakine), 'okuyabildiği dilim sunucudan yenilenir');
      await yaz(kisisiz, calisma, surum);
      const sonra = await kayitli();
      assert.deepEqual(sonra.D.personel, once.D.personel);
      assert.equal(sonra.D.personel.find((x) => x.id === String(yoneticiId))?.ayar, true);
      assert.equal(sonra.D.tezgahlar.find((x) => x.id === makineId)?.verim, 0.8);
    } finally {
      await ortam!.sahip.sorgu('DELETE FROM makine WHERE id = $1', [Number(yeniMakine)]);
    }
  });

  test('TA-03: tam yetkili açınca dilimler sunucudan yenilenir; elle ayar korunur', async () => {
    await ayarliCalisma();
    const yeniMakine = String((await ortam!.sahip.tek<{ id: number }>("INSERT INTO makine (kod, ad, istasyon_id, aktif) VALUES ('TA-M3', 'Deneme torna 3', $1, true) RETURNING id", [istasyonId]))!.id);
    try {
      const { calisma } = await oku(tam);
      assert.ok(calisma.D.tezgahlar.some((x) => x.id === yeniMakine));
      assert.equal(calisma.D.tezgahlar.find((x) => x.id === makineId)?.verim, 0.8);
    } finally {
      await ortam!.sahip.sorgu('DELETE FROM makine WHERE id = $1', [Number(yeniMakine)]);
    }
  });
});
