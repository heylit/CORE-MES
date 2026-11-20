import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { logoCrmCevabi } from '#paylasilan/sozlesme/logo.ts';
import type { LogoCariHazirlikCevabi, LogoCrmCevabi, LogoCrmKodCevabi } from '#paylasilan/sozlesme/logo.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { rolAl, rolAta, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import type { KopruIstemcisi } from './kopru.ts';
import { crmDurumu, crmKodlari, crmKodlariniAyikla, crmSorguyuKeser, crmSorulurMu, crmSorunu, satisTeklifiGovdesi, seciliCrmEngeli } from './kurallar.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import type { SahteKopru } from './sahte-kopru.ts';
import { CRM_KOD_BELLEK_MS, cariCrmDurumlari, cariKodCrmDurumlari, crmKodBelleginiTemizle, cariHazirligi, crmDenetimi, LOGO_CRM_DENETIM_SURESI_MS } from './servis.ts';

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
    assert.deepEqual(crmKodlariniAyikla({ customers: [' ORN-CRM-2 ', 'ORN-CRM-1', '', 7, null] }), { kodlar: ['ORN-CRM-2', 'ORN-CRM-1'], sayi: 2, secilebilir: false });
    const yirmiBir = Array.from({ length: 21 }, (_, i) => `ORN-CRM-${String(i + 1)}`);
    const kesik = crmKodlariniAyikla({ customers: yirmiBir });
    assert.equal(kesik?.kodlar.length, 20);
    assert.equal(kesik?.kodlar[0], 'ORN-CRM-1');
    assert.equal(kesik?.sayi, 21);
    assert.deepEqual(crmKodlariniAyikla({ customers: ['ORN-CRM-1'], customerCount: 34 }), { kodlar: ['ORN-CRM-1'], sayi: 34, secilebilir: false });
    assert.deepEqual(crmKodlariniAyikla({ customers: ['ORN-CRM-1', 'ORN-CRM-2'], customerCount: 1 }), { kodlar: ['ORN-CRM-1', 'ORN-CRM-2'], sayi: 2, secilebilir: false });
    assert.deepEqual(crmKodlariniAyikla({ customers: ['ORN-CRM-1'], customerCount: 2.5 }), { kodlar: ['ORN-CRM-1'], sayi: 1, secilebilir: false });
    assert.equal(crmKodlariniAyikla({ customers: ['ORN-CRM-1'], salesCustomerCodeAccepted: true })?.secilebilir, true);
    assert.equal(crmKodlariniAyikla({ customers: ['ORN-CRM-1'], salesCustomerCodeAccepted: 'true' })?.secilebilir, false);
    const liste = { kodlar: ['ORN-CRM-1'], sayi: 1, secilebilir: false };
    assert.deepEqual(crmKodlari({ tur: 'basarili', logicalRef: 88, crmKodlari: liste }), liste);
    assert.equal(crmKodlari({ tur: 'basarili', logicalRef: null, crmKodlari: liste }), null);
    assert.equal(crmKodlari({ tur: 'basarili', logicalRef: 88 }), null);
    assert.equal(crmKodlari({ tur: 'reddedildi', ileti: 'x' }), null);
  });
});

describe('Seçili CRM kodu (3391-2 a)', () => {
  test('CRM-9 seçim yoksa engel yok; yardımcı desteklemiyor ya da kod bağlı değilse ret; harf büyüklüğü fark etmez; gövdeye yalnız seçim varken gider', () => {
    const r = (kodlar: string[], secilebilir: boolean) => ({ tur: 'basarili' as const, logicalRef: 88, crmKodlari: { kodlar, sayi: kodlar.length, secilebilir } });
    assert.equal(seciliCrmEngeli(null, 'ORN-C-1', r(['ORN-CRM-1'], false)), null);
    assert.equal(seciliCrmEngeli('  ', 'ORN-C-1', { tur: 'basarili', logicalRef: 88 }), null);
    assert.equal(seciliCrmEngeli('orn-crm-2', 'ORN-C-1', r(['ORN-CRM-1', 'ORN-CRM-2'], true)), null);
    assert.match(seciliCrmEngeli('ORN-CRM-2', 'ORN-C-1', r(['ORN-CRM-1', 'ORN-CRM-2'], false)) ?? '', /desteklemiyor/);
    assert.match(seciliCrmEngeli('ORN-CRM-2', 'ORN-C-1', { tur: 'basarili', logicalRef: 88 }) ?? '', /desteklemiyor/);
    assert.match(seciliCrmEngeli('ORN-CRM-3', 'ORN-C-1', r(['ORN-CRM-1'], true)) ?? '', /ORN-CRM-3 Logo'da artık cari ORN-C-1 ile bağlı değil/);
    assert.equal(crmSorunu('ORN-CRM-1', { tur: 'basarili', logicalRef: null }), 'secim-kalkti');
    assert.equal(crmSorunu(null, { tur: 'basarili', logicalRef: null }), 'crm-yok');
    assert.equal(crmSorunu(null, r(['ORN-CRM-1'], true)), null);
    assert.equal(crmSorunu(null, { tur: 'basarili', logicalRef: 88 }), null, 'eski yardımcıda sayı bilinmez');
    assert.equal(crmSorunu('orn-crm-1', r(['ORN-CRM-1', 'ORN-CRM-2'], true)), null);
    assert.equal(crmSorunu(null, { tur: 'reddedildi', ileti: 'x' }), null);
    const t = { id: 1, no: 'TK-1', tarih: '2026-11-17', gecerlilikBitis: null, paraBirimi: 'TRY', kur: null,
      satirlar: [{ satirId: 1, stokKodu: 'ORN-MLZ-1', hizmet: false, miktar: '1', birim: 'adet', birimFiyat: '10', iskontoYuzdesi: null, termin: null }] };
    const govde = (crmKodu: string | null | undefined) => {
      const g = satisTeklifiGovdesi(t, { cariKodu: 'ORN-C-1', kdv: null, hizmetKdv: null, ...(crmKodu === undefined ? {} : { crmKodu }) });
      return 'govde' in g ? g.govde : null;
    };
    assert.equal(govde(' ORN-CRM-2 ')?.['salesCustomerCode'], 'ORN-CRM-2');
    for (const k of [null, undefined, ' ']) assert.equal('salesCustomerCode' in (govde(k) ?? {}), false);
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
      assert.deepEqual(harita.get(f.crmli)?.kodlar, { kodlar: ['ORN-CRM-3002', 'ORN-CRM-3017'], sayi: 2, secilebilir: true });
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

  test('CRM-10 denetim (3391-2): yalnız sorunlu müşteri carileri döner (CRM yok, seçimsiz çok bağ, bağı kalkmış seçim); tedarikçi sorulmaz; kapalıda istek yok', async () => {
    await ayar(true);
    kopru.crmKodlari.set('ORN-C-1003', ['ORN-CRM-1', 'ORN-CRM-2']);
    const pasif = await firma('musteri', 'ORN-C-PAS1');
    await vt().sorgu('UPDATE musteri_tedarikci_firma SET aktif = false WHERE id = $1', [pasif]);
    try {
      const once = kopru.istekler.length;
      const c = await crmDenetimi(vt(), istemci());
      assert.equal(c.durum, 'tamam');
      const harita = new Map(c.satirlar.map((x) => [x.firmaId, x]));
      assert.equal(harita.has(f.crmli), false, 'tek bağlı sorunsuz');
      assert.equal(harita.get(f.crmsiz)?.sorun, 'crm-yok');
      assert.deepEqual(harita.get(f.ikisi) && { sorun: harita.get(f.ikisi)?.sorun, sayi: harita.get(f.ikisi)?.sayi }, { sorun: 'cok-bag', sayi: 2 });
      assert.equal(harita.has(f.tedarikci), false);
      assert.equal(kopru.istekler.slice(once).some((i) => i.yol.endsWith('/ORN-C-1004')), false, 'tedarikçiye sorulmaz');
      assert.equal(kopru.istekler.slice(once).some((i) => i.yol.endsWith('/ORN-C-PAS1')), false, 'pasif müşteriye sorulmaz');
      assert.equal(harita.has(pasif), false);
      assert.equal(kopru.istekler.slice(once).some((i) => i.yontem !== 'GET'), false);
      await vt().sorgu('UPDATE musteri_tedarikci_firma SET logo_crm_kodu = $2 WHERE id = $1', [f.ikisi, 'ORN-CRM-2']);
      assert.equal((await crmDenetimi(vt(), istemci())).satirlar.some((x) => x.firmaId === f.ikisi), false, 'seçim varsa çok bağ sorun değil');
      await vt().sorgu('UPDATE musteri_tedarikci_firma SET logo_crm_kodu = $2 WHERE id = $1', [f.ikisi, 'ORN-CRM-9']);
      const kalkti = (await crmDenetimi(vt(), istemci())).satirlar.find((x) => x.firmaId === f.ikisi);
      assert.deepEqual(kalkti && { sorun: kalkti.sorun, secili: kalkti.secili }, { sorun: 'secim-kalkti', secili: 'ORN-CRM-9' });
      await ayar(false);
      const sayi = kopru.istekler.length;
      assert.deepEqual(await crmDenetimi(vt(), istemci()), { durum: 'okunamadi', neden: 'Sistem Ayarları\'nda "Logo bağlantısı" kapalı; CRM durumu okunmuyor.', taranan: 0, eksik: false, satirlar: [] });
      assert.equal(kopru.istekler.length, sayi);
    } finally {
      kopru.crmKodlari.clear();
      await vt().sorgu('UPDATE musteri_tedarikci_firma SET logo_crm_kodu = NULL WHERE id = $1', [f.ikisi]);
      await ayar(true);
    }
  });

  test('CRM-11 denetim (Risk K3): aynı anda ikinci denetim yardımcıya sormadan reddedilir; süre sınırı dolunca durur, okunanlar kalır', async () => {
    await ayar(true);
    const once = kopru.istekler.length;
    const [ilk, ikinci] = await Promise.all([crmDenetimi(vt(), istemci()), crmDenetimi(vt(), istemci())]);
    assert.equal(ilk.durum, 'tamam');
    assert.deepEqual(ikinci, { durum: 'okunamadi', neden: 'Başka bir CRM bağı denetimi sürüyor; bitince yeniden deneyin.', taranan: 0, eksik: false, satirlar: [] });
    assert.equal(kopru.istekler.length - once, ilk.taranan, 'ikinci denetim yardımcıya sormadı');
    assert.equal((await crmDenetimi(vt(), istemci())).durum, 'tamam', 'bitince yeniden çalışır');
    let simdi = 0;
    const saat = () => { const t = simdi; simdi += LOGO_CRM_DENETIM_SURESI_MS / 2 + 1; return t; };
    const sure = await crmDenetimi(vt(), istemci(), saat);
    assert.equal(sure.durum, 'okunamadi');
    assert.match(sure.neden ?? '', /Süre sınırı \(2 dk\) doldu/);
    assert.equal(sure.taranan, 1);
    assert.equal(sure.eksik, true);
  });

  test('CRM-12 denetim: yardımcıya ikinci caride ulaşılamazsa durur; okunanlar kalır, kalan carilere sorulmaz', async () => {
    await ayar(true);
    const sorulan: string[] = [];
    const yarim = {
      satisMusterisiVarMi: (cari: string) => {
        sorulan.push(cari);
        return Promise.resolve(sorulan.length === 1 ? { tur: 'basarili' as const, logicalRef: null } : { tur: 'ulasilamadi' as const, ileti: 'Köprüye ulaşılamadı (ECONNREFUSED).' });
      },
    } as unknown as KopruIstemcisi;
    const c = await crmDenetimi(vt(), yarim);
    assert.equal(c.durum, 'okunamadi');
    assert.equal(c.neden, 'Köprüye ulaşılamadı (ECONNREFUSED).');
    assert.equal(c.eksik, true);
    assert.equal(c.taranan, 1);
    assert.equal(c.satirlar.length, 1, 'ilk caride CRM yok satırı kalır');
    assert.equal(sorulan.length, 2, 'üçüncü cariye sorulmaz');
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

  // 3480 (kullanıcı 20.11 08:15): Logo cari aramasında bağlanmamış carinin CRM'i koddan; CORE firması gerekmez.
  test('CRM-13 koddan: CORE firması olmayan carinin de durumu döner; yalnız GET; kapalıda istek yok; uç okuyana açık, 50\'den fazla kod 400', async () => {
    await ayar(true);
    crmKodBelleginiTemizle();
    const once = kopru.istekler.length;
    const c = await cariKodCrmDurumlari(vt(), istemci(), ['ORN-C-1003', 'ORN-C-9999']);
    assert.deepEqual(c.durumlar.map((d) => [d.kod, d.durum]), [['ORN-C-1003', 'var'], ['ORN-C-9999', 'yok']]);
    assert.deepEqual(kopru.istekler.slice(once).map((i) => [i.yontem, i.yol]),
      [['GET', '/api/SalesOffer/customer/ORN-C-1003'], ['GET', '/api/SalesOffer/customer/ORN-C-9999']]);
    await ayar(false);
    const sonra = kopru.istekler.length;
    const kapali = await cariKodCrmDurumlari(vt(), istemci(), ['ORN-C-1001']);
    assert.equal(kapali.durumlar[0]?.durum, 'okunamadi');
    assert.equal(kopru.istekler.length, sonra);
    await ayar(true);
    const oku = async (kim: string, q: string) => {
      const r = await app.inject({ method: 'GET', url: `/api/logo/cari-crm-kod?${q}`, headers: { cookie: cerez.get(kim) ?? '' } });
      return { durum: r.statusCode, govde: r.json<LogoCrmKodCevabi>() };
    };
    assert.equal((await oku('crm-okuyan', 'kod=ORN-C-1001')).durum, 200);
    assert.equal((await oku('crm-satis', 'kod=ORN-C-1001')).durum, 403);
    assert.equal((await oku('crm-yonetici', `kod=${Array.from({ length: 51 }, (_, i) => `ORN-K${String(i)}`).join(',')}`)).durum, 400);
  });

  test('CRM-14 koddan (Risk K1): aynı kod 5 dakika içinde yeniden sorulunca yardımcıya gitmez; süre dolunca ve okunamayan yeniden sorulur; ulaşılamayınca kalanlar sorulmaz', async () => {
    await ayar(true);
    crmKodBelleginiTemizle();
    let simdi = 1_000_000;
    const saat = () => simdi;
    const once = kopru.istekler.length;
    await cariKodCrmDurumlari(vt(), istemci(), ['ORN-C-1001'], saat);
    simdi += CRM_KOD_BELLEK_MS - 1;
    const ikinci = await cariKodCrmDurumlari(vt(), istemci(), ['orn-c-1001'], saat);
    assert.deepEqual(ikinci.durumlar.map((d) => [d.kod, d.durum]), [['orn-c-1001', 'var']]);
    assert.equal(kopru.istekler.length - once, 1);
    simdi += 1;
    await cariKodCrmDurumlari(vt(), istemci(), ['ORN-C-1001'], saat);
    assert.equal(kopru.istekler.length - once, 2);
    // Okunamayan bellekte tutulmaz: yardımcı kapalıyken okunan kod açılınca yeniden sorulur.
    const kapali = await sahteKopruAc();
    const adres = kapali.adres;
    await kapali.kapat();
    crmKodBelleginiTemizle();
    // Kesme (Test T1): ilk kodda yardımcıya ulaşılamazsa kalan kodlar için yardımcı çağrılmaz, hepsi aynı nedenle okunamadı.
    const ulasilamayan = kopruIstemcisiKur({ adres, anahtar: kopru.anahtar }, { sureMs: 2000 });
    const cagrilan: string[] = [];
    const sayan = { ...ulasilamayan, satisMusterisiVarMi: (k: string) => { cagrilan.push(k); return ulasilamayan.satisMusterisiVarMi(k); } };
    const r = await cariKodCrmDurumlari(vt(), sayan, ['ORN-C-1003', 'ORN-C-1001', 'ORN-C-1002'], saat);
    assert.deepEqual(r.durumlar.map((d) => d.durum), ['okunamadi', 'okunamadi', 'okunamadi']);
    assert.deepEqual(cagrilan, ['ORN-C-1003']);
    assert.match(r.durumlar[0]?.neden ?? '', /ulaşılamadı/);
    assert.ok(r.durumlar.every((d) => d.neden === r.durumlar[0]?.neden));
    const sonra = kopru.istekler.length;
    assert.equal((await cariKodCrmDurumlari(vt(), istemci(), ['ORN-C-1003'], saat)).durumlar[0]?.durum, 'var');
    assert.equal(kopru.istekler.length - sonra, 1);
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
