import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import type { Firma, FirmaAyrintiCevabi, FirmaCevabi } from '#paylasilan/sozlesme/musteri-tedarikci.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { logoCrmCozucusuKaydet } from './disari.ts';
import type { LogoCrmKodCozucusu } from './disari.ts';

// 3391-2 a: tekliflerde kullanılacak Logo CRM satış müşterisi firma kartında seçilir; Logo'ya yazılmaz. Logo bağları sahte çözücüden gelir;
// kodlar uydurmadır (ORN-).
const PAROLA = 'dogru-parola-1';
interface Cevap<T = unknown> { durum: number; govde: T }

describe('Logo CRM satış müşterisi seçimi (3391-2, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yoneticiId = 0;
  const cerez = new Map<string, string>();
  const cagrilar: string[] = [];
  let bag: Awaited<ReturnType<LogoCrmKodCozucusu>> = { tur: 'tamam', veri: null };
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  async function istek<T = unknown>(kim: string, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<Cevap<T>> {
    const c = await app.inject({
      method: yontem, url: `/api${yol}`, headers: { [ISTEK_KIMLIGI_BASLIGI]: randomUUID(), cookie: cerez.get(kim) ?? '' },
      ...(govde === undefined ? {} : { payload: govde as object }),
    });
    return { durum: c.statusCode, govde: (c.body ? c.json() : undefined) as T };
  }
  const sec = (kim: string, id: number, kod: string | null, surum: number) =>
    istek<FirmaCevabi & { mesaj?: string }>(kim, 'POST', `/musteri-tedarikci/firmalar/${String(id)}/logo-crm-sec`, { kod, surum });
  const getir = async (id: number): Promise<Firma> => (await istek<FirmaAyrintiCevabi>('yazan', 'GET', `/musteri-tedarikci/firmalar/${String(id)}`)).govde.firma;
  async function firmaKur(logoCariKodu: string | null): Promise<Firma> {
    const c = await istek<FirmaCevabi>('yazan', 'POST', '/musteri-tedarikci/firmalar/ekle', { ad: `ORN CRM secim ${randomUUID().slice(0, 8)}`, tur: 'musteri', logoCariKodu });
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    return c.govde.firma;
  }
  async function girisliKisi(kullaniciAdi: string, rolKodu: string, islemler: string[]): Promise<void> {
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [rolKodu]);
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol kurulamadı');
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol.id, islem]);
    await vt().tx(async (db) => {
      const kisi = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, kisi, rol.id);
      await rolAl(db, yoneticiId, kisi, yoneticiRolu.id);
    });
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200);
    cerez.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }

  before(async () => {
    ortam = await testVeritabaniKur('mtcrmsec');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await ortam.vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'yonetici', parola: PAROLA }));
    await girisliKisi('okuyan', 'gecici_cs_oku', ['sayfa.finans', 'musteri-tedarikci.oku']);
    await girisliKisi('yazan', 'gecici_cs_yaz', ['sayfa.finans', 'musteri-tedarikci.oku', 'musteri-tedarikci.yaz']);
  });
  beforeEach(() => {
    cagrilar.length = 0;
    bag = { tur: 'tamam', veri: { kodlar: ['ORN-CRM-1', 'ORN-CRM-2'], secilebilir: true } };
    logoCrmCozucusuKaydet(async (_db, cari) => { cagrilar.push(cari); return bag; });
  });
  after(async () => {
    logoCrmCozucusuKaydet(null);
    await ortam?.kaldir();
  });

  test('CS-1 Logo\'da bağlı kod seçilir (Logo\'daki yazımıyla), sürüm artar, ayrıntıda görünür; null seçimi Logo\'ya sormadan kaldırır', async () => {
    const f = await firmaKur('ORN-C-CS1');
    const c = await sec('yazan', f.id, 'orn-crm-2', f.surum);
    assert.equal(c.durum, 200, JSON.stringify(c.govde));
    assert.equal(c.govde.firma.logoCrmKodu, 'ORN-CRM-2');
    assert.equal(c.govde.firma.surum, f.surum + 1);
    assert.deepEqual(cagrilar, ['ORN-C-CS1']);
    assert.equal((await getir(f.id)).logoCrmKodu, 'ORN-CRM-2');
    cagrilar.length = 0;
    const k = await sec('yazan', f.id, null, f.surum + 1);
    assert.equal(k.durum, 200, JSON.stringify(k.govde));
    assert.equal(k.govde.firma.logoCrmKodu, null);
    assert.deepEqual(cagrilar, []);
  });

  test('CS-2 ret: kod Logo\'da bağlı değil, cari CRM\'siz, yardımcı seçimi desteklemiyor, Logo okunamadı, firmanın cari kodu yok; kayıt değişmez', async () => {
    const f = await firmaKur('ORN-C-CS2');
    const reddet = async (beklenen: RegExp, kim = 'yazan', id = f.id, surum = f.surum): Promise<void> => {
      const c = await sec(kim, id, 'ORN-CRM-9', surum);
      assert.equal(c.durum, 422, JSON.stringify(c.govde));
      assert.match(JSON.stringify(c.govde), beklenen);
    };
    await reddet(/ORN-CRM-9 Logo'da cari ORN-C-CS2 ile bağlı değil/);
    bag = { tur: 'tamam', veri: null };
    await reddet(/hiçbir CRM satış müşterisine bağlı değil/);
    bag = { tur: 'tamam', veri: { kodlar: ['ORN-CRM-9'], secilebilir: false } };
    await reddet(/seçimini desteklemiyor/);
    bag = { tur: 'hata', ileti: 'Satış müşterisi okuması: Köprüye ulaşılamadı.' };
    await reddet(/Köprüye ulaşılamadı/);
    logoCrmCozucusuKaydet(null);
    await reddet(/bu sunucuda bağlı değil/);
    const kodsuz = await firmaKur(null);
    await reddet(/Logo cari kodu yok/, 'yazan', kodsuz.id, kodsuz.surum);
    const g = await getir(f.id);
    assert.equal(g.logoCrmKodu, null);
    assert.equal(g.surum, f.surum);
  });

  test('CS-3 yetki ve sürüm: yazamayan 403 (Logo\'ya sorulmaz); eski sürüm 409', async () => {
    const f = await firmaKur('ORN-C-CS3');
    assert.equal((await sec('okuyan', f.id, 'ORN-CRM-1', f.surum)).durum, 403);
    assert.deepEqual(cagrilar, []);
    assert.equal((await sec('yazan', f.id, 'ORN-CRM-1', f.surum + 5)).durum, 409);
  });

  test('CS-4 cari kodu değişince seçim düşer; yalnız harf büyüklüğü değişirse kalır', async () => {
    const f = await firmaKur('ORN-C-CS4');
    const s = (await sec('yazan', f.id, 'ORN-CRM-1', f.surum)).govde.firma;
    const guncelle = async (x: Firma, logoCariKodu: string): Promise<Firma> => {
      const c = await istek<FirmaCevabi>('yazan', 'POST', `/musteri-tedarikci/firmalar/${String(x.id)}/guncelle`, {
        ad: x.ad, tur: x.tur, logoCariKodu, surum: x.surum,
      });
      assert.equal(c.durum, 200, JSON.stringify(c.govde));
      return c.govde.firma;
    };
    const ayni = await guncelle(s, 'orn-c-cs4');
    assert.equal(ayni.logoCrmKodu, 'ORN-CRM-1');
    const baska = await guncelle(ayni, 'ORN-C-CS4B');
    assert.equal(baska.logoCrmKodu, null);
  });

  test('CS-5 göç kısıtları: cari kodsuz seçim ve boşluklu kod reddedilir', async () => {
    const f = await firmaKur(null);
    await assert.rejects(vt().sorgu('UPDATE musteri_tedarikci_firma SET logo_crm_kodu = $2 WHERE id = $1', [f.id, 'ORN-CRM-1']),
      /musteri_tedarikci_firma_logo_crm_carili/);
    const g = await firmaKur('ORN-C-CS5');
    await assert.rejects(vt().sorgu('UPDATE musteri_tedarikci_firma SET logo_crm_kodu = $2 WHERE id = $1', [g.id, ' ORN-CRM-1']),
      /musteri_tedarikci_firma_logo_crm_kodu_bicim/);
    await vt().sorgu('UPDATE musteri_tedarikci_firma SET logo_crm_kodu = $2 WHERE id = $1', [g.id, 'ORN-CRM-1']);
  });
});
