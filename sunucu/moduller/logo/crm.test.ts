import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { logoCrmCevabi } from '#paylasilan/sozlesme/logo.ts';
import type { LogoCariHazirlikCevabi, LogoCrmCevabi } from '#paylasilan/sozlesme/logo.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import { crmDurumu, crmKodlari, crmKodlariniAyikla, crmSorguyuKeser, crmSorulurMu } from './kurallar.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import type { SahteKopru } from './sahte-kopru.ts';
import { cariCrmDurumlari, cariHazirligi } from './servis.ts';

// 3359 a: carinin Logo CRM satış müşterisi durumu. Yardımcı sahte köprüdür; veriler uydurmadır (ORN-).
const PAROLA = 'dogru-parola-1';

describe('CRM durumu kuralı (3359)', () => {
  test('CRM-1 var, yok, okunamadı; ulaşılamayan ya da belirsiz yardımcıya yeniden sorulmaz; tedarikçi ve kodsuz firma sorulmaz', () => {
    assert.deepEqual(crmDurumu({ tur: 'basarili', logicalRef: 12 }), { durum: 'var', neden: null });
    assert.deepEqual(crmDurumu({ tur: 'basarili', logicalRef: null }), { durum: 'yok', neden: null });
    assert.deepEqual(crmDurumu({ tur: 'ulasilamadi', ileti: 'Köprüye ulaşılamadı (ECONNREFUSED).\nyığın' }), { durum: 'okunamadi', neden: 'Köprüye ulaşılamadı (ECONNREFUSED).' });
    assert.equal(crmSorguyuKeser({ tur: 'ulasilamadi', ileti: 'x' }), true);
    assert.equal(crmSorguyuKeser({ tur: 'belirsiz', ileti: 'x' }), true);
    assert.equal(crmSorguyuKeser({ tur: 'reddedildi', ileti: 'x' }), false);
    assert.equal(crmSorguyuKeser({ tur: 'basarili', logicalRef: null }), false);
    assert.equal(crmSorulurMu({ tur: 'musteri', logoCariKodu: 'ORN-C-1' }), true);
    assert.equal(crmSorulurMu({ tur: 'ikisi', logoCariKodu: 'ORN-C-1' }), true);
    assert.equal(crmSorulurMu({ tur: 'tedarikci', logoCariKodu: 'ORN-C-1' }), false);
    assert.equal(crmSorulurMu({ tur: 'musteri', logoCariKodu: '  ' }), false);
    assert.equal(crmSorulurMu({ tur: 'musteri', logoCariKodu: null }), false);
  });

  test('CRM-7 kod listesi (3391): sıra korunur, boş ve metin olmayan atılır, en çok 20 kod ve bütün bağların sayısı; eski yardımcıda null', () => {
    assert.equal(crmKodlariniAyikla({ success: true, logicalRef: 88 }), null);
    assert.equal(crmKodlariniAyikla(null), null);
    assert.deepEqual(crmKodlariniAyikla({ customers: [' ORN-CRM-2 ', 'ORN-CRM-1', '', 7, null] }), { kodlar: ['ORN-CRM-2', 'ORN-CRM-1'], sayi: 2 });
    const yirmiBir = Array.from({ length: 21 }, (_, i) => `ORN-CRM-${String(i + 1)}`);
    const kesik = crmKodlariniAyikla({ customers: yirmiBir });
    assert.equal(kesik?.kodlar.length, 20);
    assert.equal(kesik?.kodlar[0], 'ORN-CRM-1');
    assert.equal(kesik?.sayi, 21);
    assert.deepEqual(crmKodlariniAyikla({ customers: ['ORN-CRM-1'], customerCount: 34 }), { kodlar: ['ORN-CRM-1'], sayi: 34 });
    assert.deepEqual(crmKodlariniAyikla({ customers: ['ORN-CRM-1', 'ORN-CRM-2'], customerCount: 1 }), { kodlar: ['ORN-CRM-1', 'ORN-CRM-2'], sayi: 2 });
    assert.deepEqual(crmKodlariniAyikla({ customers: ['ORN-CRM-1'], customerCount: 2.5 }), { kodlar: ['ORN-CRM-1'], sayi: 1 });
    const liste = { kodlar: ['ORN-CRM-1'], sayi: 1 };
    assert.deepEqual(crmKodlari({ tur: 'basarili', logicalRef: 88, crmKodlari: liste }), liste);
    assert.equal(crmKodlari({ tur: 'basarili', logicalRef: null, crmKodlari: liste }), null);
    assert.equal(crmKodlari({ tur: 'basarili', logicalRef: 88 }), null);
    assert.equal(crmKodlari({ tur: 'reddedildi', ileti: 'x' }), null);
  });
});

describe('Logo CRM durumu (3359, gerçek PostgreSQL ve sahte köprü)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let kopru: SahteKopru;
  const cerez = new Map<string, string>();
  let yoneticiId = 0;
  let sayac = 0;
  const f: Record<'crmli' | 'crmsiz' | 'ikisi' | 'tedarikci' | 'kodsuz', number> = { crmli: 0, crmsiz: 0, ikisi: 0, tedarikci: 0, kodsuz: 0 };
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  async function post(yol: string, govde: unknown): Promise<unknown> {
    const c = await app.inject({ method: 'POST', url: `/api${yol}`, headers: { cookie: cerez.get('crm-yonetici') ?? '', 'istek-kimligi': randomUUID() }, payload: govde as object });
    assert.equal(c.statusCode, 200, `${yol}: ${c.body}`);
    return c.json();
  }
  const ayar = (deger: boolean) => post('/ayarlar/logo.baglanti/degistir', { deger });
  async function firma(tur: string, logoCariKodu: string | null): Promise<number> {
    return ((await post('/musteri-tedarikci/firmalar/ekle', { ad: `ORN CRM firma ${++sayac}`, tur, logoCariKodu })) as { firma: { id: number } }).firma.id;
  }
  async function girisliKisi(kullaniciAdi: string, islemler: string[]): Promise<void> {
    const kod = `gecici_crm_${kullaniciAdi.replace(/-/g, '_')}`;
    const rol = await vt().tek<{ id: number }>('INSERT INTO rol (kod, ad) VALUES ($1, $1) RETURNING id', [kod]);
    const yoneticiRolu = await vt().tek<{ id: number }>("SELECT id FROM rol WHERE kod = 'yonetici'");
    if (!rol || !yoneticiRolu) throw new Error('rol kurulamadı');
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) VALUES ($1, $2)', [rol.id, islem]);
    await vt().tx(async (db) => {
      const kisi = await yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA });
      await rolAta(db, yoneticiId, kisi, rol.id);
      await rolAl(db, yoneticiId, kisi, yoneticiRolu.id);
    });
    await giris(kullaniciAdi);
  }
  async function giris(kullaniciAdi: string): Promise<void> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    cerez.set(kullaniciAdi, String(c.headers['set-cookie']).split(';')[0] ?? '');
  }
  const istemci = () => kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, { sureMs: 5000 });
  const sorgu = () => [f.crmli, f.crmsiz, f.ikisi, f.tedarikci, f.kodsuz, 999_999];

  before(async () => {
    ortam = await testVeritabaniKur('logocrm');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yonetici', kullaniciAdi: 'crm-yonetici', parola: PAROLA }));
    await giris('crm-yonetici');
    await girisliKisi('crm-okuyan', ['musteri-tedarikci.oku']);
    await girisliKisi('crm-satis', ['siparisler.oku']);
    kopru = await sahteKopruAc();
    kopru.satisMusterileri.add('ORN-C-1001');
    kopru.satisMusterileri.add('ORN-C-1003');
    f.crmli = await firma('musteri', 'ORN-C-1001');
    f.crmsiz = await firma('musteri', 'ORN-C-1002');
    f.ikisi = await firma('ikisi', 'ORN-C-1003');
    f.tedarikci = await firma('tedarikci', 'ORN-C-1004');
    f.kodsuz = await firma('musteri', null);
  });
  after(async () => { await kopru?.kapat(); await app?.close(); await ortam?.kaldir(); });

  test('CRM-2 bağlantı açık: CRM\'li var, CRM\'siz yok; tedarikçi, kodsuz ve olmayan firma cevapta yok, onlara istek atılmaz', async () => {
    await ayar(true);
    const once = kopru.istekler.length;
    const c = await cariCrmDurumlari(vt(), istemci(), sorgu());
    const harita = new Map(c.durumlar.map((d) => [d.firmaId, d]));
    assert.equal(c.durumlar.length, 3);
    assert.deepEqual(harita.get(f.crmli), { firmaId: f.crmli, durum: 'var', neden: null, kodlar: null });
    assert.deepEqual(harita.get(f.crmsiz), { firmaId: f.crmsiz, durum: 'yok', neden: null, kodlar: null });
    assert.equal(harita.get(f.ikisi)?.durum, 'var');
    const istenen = kopru.istekler.slice(once).map((i) => i.yol).sort();
    assert.deepEqual(istenen, ['/api/SalesOffer/customer/ORN-C-1001', '/api/SalesOffer/customer/ORN-C-1002', '/api/SalesOffer/customer/ORN-C-1003']);
    assert.equal(kopru.istekler.slice(once).some((i) => i.yontem !== 'GET'), false);
  });

  test('CRM-8 yardımcı kodları verirse (3391): cevapta sırasıyla kodlar ve sayı; yok ve okunamadıda null; uç şeması taşır', async () => {
    await ayar(true);
    kopru.crmKodlari.set('ORN-C-1001', ['ORN-CRM-3002', 'ORN-CRM-3017']);
    kopru.crmKodlari.set('ORN-C-1002', ['ORN-CRM-9999']);
    try {
      const c = await cariCrmDurumlari(vt(), istemci(), sorgu());
      const harita = new Map(c.durumlar.map((d) => [d.firmaId, d]));
      assert.deepEqual(harita.get(f.crmli)?.kodlar, { kodlar: ['ORN-CRM-3002', 'ORN-CRM-3017'], sayi: 2 });
      assert.equal(harita.get(f.crmsiz)?.kodlar, null);
      assert.equal(harita.get(f.ikisi)?.kodlar, null);
      assert.deepEqual(logoCrmCevabi.parse(c), c, 'uç şeması kodları atmaz');
      await ayar(false);
      assert.ok((await cariCrmDurumlari(vt(), istemci(), sorgu())).durumlar.every((d) => d.kodlar === null));
    } finally {
      kopru.crmKodlari.clear();
      await ayar(true);
    }
  });

  test('CRM-3 bağlantı kapalı ya da yardımcı tanımsız: istek atılmaz, hepsi okunamadı ve neden yazar', async () => {
    await ayar(false);
    const once = kopru.istekler.length;
    const kapali = await cariCrmDurumlari(vt(), istemci(), sorgu());
    assert.equal(kopru.istekler.length, once);
    assert.equal(kapali.durumlar.length, 3);
    assert.ok(kapali.durumlar.every((d) => d.durum === 'okunamadi' && /Logo bağlantısı" kapalı/.test(d.neden ?? '')));
    await ayar(true);
    const tanimsiz = await cariCrmDurumlari(vt(), null, sorgu());
    assert.ok(tanimsiz.durumlar.every((d) => d.durum === 'okunamadi' && d.neden !== null));
    assert.equal(kopru.istekler.length, once);
  });

  test('CRM-4 ulaşılamayan yardımcı: ilk cari okunamadı, kalanlara yeniden sorulmaz, aynı neden', async () => {
    await ayar(true);
    const kapali = await sahteKopruAc();
    const adres = kapali.adres;
    await kapali.kapat();
    const c = await cariCrmDurumlari(vt(), kopruIstemcisiKur({ adres, anahtar: kopru.anahtar }, { sureMs: 2000 }), sorgu());
    assert.equal(c.durumlar.length, 3);
    assert.ok(c.durumlar.every((d) => d.durum === 'okunamadi'));
    assert.match(c.durumlar[0]?.neden ?? '', /ulaşılamadı/);
    assert.ok(c.durumlar.every((d) => d.neden === c.durumlar[0]?.neden));
  });

  test('CRM-5 uç: firmayı görebilen okur, göremeyen 403; 50\'den fazla kimlik 400', async () => {
    const oku = async (kim: string, q: string) => {
      const c = await app.inject({ method: 'GET', url: `/api/logo/cari-crm?${q}`, headers: { cookie: cerez.get(kim) ?? '' } });
      return { durum: c.statusCode, govde: c.json<LogoCrmCevabi>() };
    };
    const okuyan = await oku('crm-okuyan', `id=${f.crmli},${f.tedarikci}`);
    assert.equal(okuyan.durum, 200);
    assert.deepEqual(okuyan.govde.durumlar.map((d) => d.firmaId), [f.crmli]);
    assert.equal((await oku('crm-satis', `id=${f.crmli}`)).durum, 403);
    assert.equal((await oku('crm-yonetici', `id=${Array.from({ length: 51 }, (_, i) => i + 1).join(',')}`)).durum, 400);
  });

  test('CRM-6 teklif hazırlığı: cari kodu yoksa "cari-yok" ve istek yok; varsa CRM durumu; kapalıyken okunamadı; uç teklifi görebilene açık, firma yoksa 404', async () => {
    await ayar(true);
    const once = kopru.istekler.length;
    assert.deepEqual(await cariHazirligi(vt(), istemci(), f.kodsuz), { durum: 'cari-yok', neden: null });
    assert.equal(kopru.istekler.length, once);
    assert.deepEqual(await cariHazirligi(vt(), istemci(), f.crmli), { durum: 'var', neden: null });
    assert.deepEqual(await cariHazirligi(vt(), istemci(), f.crmsiz), { durum: 'yok', neden: null });
    assert.equal(await cariHazirligi(vt(), istemci(), 999_999), null);
    await ayar(false);
    assert.equal((await cariHazirligi(vt(), istemci(), f.crmli))?.durum, 'okunamadi');
    await ayar(true);
    const oku = async (kim: string, firma: number) => {
      const c = await app.inject({ method: 'GET', url: `/api/logo/cari-hazirligi?firma=${String(firma)}`, headers: { cookie: cerez.get(kim) ?? '' } });
      return { durum: c.statusCode, govde: c.json<LogoCariHazirlikCevabi>() };
    };
    const satis = await oku('crm-satis', f.kodsuz);
    assert.equal(satis.durum, 200, JSON.stringify(satis.govde));
    assert.deepEqual(satis.govde, { durum: 'cari-yok', neden: null });
    assert.equal((await oku('crm-satis', 999_999)).durum, 404);
    assert.equal((await oku('crm-okuyan', f.kodsuz)).durum, 403);
  });
});
