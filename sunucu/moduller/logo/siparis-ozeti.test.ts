import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { SiparisLogoOzetiCevabi } from '#paylasilan/sozlesme/logo.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import './siparis-ozeti.ts';

const PAROLA = 'dogru-parola-1';

// 3384 a: siparişin Logo özeti yalnız aynadan okunur. Logo aynası ve CORE siparişi sahibi tablolara doğrudan yazılmış sentetik kayıtlardır (ORN-).
describe('Logo: satın alma siparişi özeti ucu (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let depocu = '';
  let gormeyen = '';
  let yoneticiId = 0;

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const giris = async (kullaniciAdi: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  };
  const ayar = async (anahtar: string, deger: boolean): Promise<void> => {
    const c = await app.inject({ method: 'POST', url: `/api/ayarlar/${anahtar}/degistir`, headers: { cookie: yonetici, 'istek-kimligi': randomUUID() }, payload: { deger } });
    assert.equal(c.statusCode, 200, `${anahtar}: ${c.body}`);
  };
  const oku = async (nolar: string, cerez = yonetici) => app.inject({ method: 'GET', url: `/api/logo/satin-alma-siparisleri/ozet?nolar=${encodeURIComponent(nolar)}`, headers: { cookie: cerez } });
  const kisiRolle = async (ad: string, rolKod: string): Promise<void> => {
    const id = await o().vt.tx((db) => yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA }));
    await o().vt.sorgu('UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = $2) WHERE kisi_id = $1', [id, rolKod]);
  };
  const sayi = async (tablo: string): Promise<number> => Number((await o().sahip.tek<{ n: string }>(`SELECT count(*) AS n FROM ${tablo}`))?.n);

  // SP-2026-901: iki kalem Logo'ya gitmiş (9001: 30 teslim, 9002: 28 teslim), bir kalem gitmemiş. SP-2026-902: Logo'ya hiç gitmemiş.
  const coreKayitlari = async (): Promise<void> => {
    const s = o().sahip;
    const firma = (await s.tek<{ id: number }>("INSERT INTO musteri_tedarikci_firma (ad, tur, olusturan_id) VALUES ('ORN Tedarik', 'tedarikci', $1) RETURNING id", [yoneticiId]))!.id;
    await s.sorgu('INSERT INTO satin_alma_tedarikci (firma_id) VALUES ($1)', [firma]);
    const siparis = async (sira: number, no: string, kalemler: [string, string | null, number[]][]): Promise<void> => {
      const [talep, teklif] = [randomUUID(), randomUUID()];
      await s.sorgu("INSERT INTO satin_alma_talep (id, yil, sira, baslik, talep_eden_kisi_id, acan_kisi_id, durum) VALUES ($1, 2026, $3, 'ORN talep', $2, $2, 'siparis_verildi')", [talep, yoneticiId, sira]);
      await s.sorgu("INSERT INTO satin_alma_teklif (talep_id, id, firma_id, teklif_tarihi, para_birimi) VALUES ($1, $2, $3, '2026-11-01', 'TRY')", [talep, teklif, firma]);
      await s.sorgu("INSERT INTO satin_alma_karar (talep_id, mod, teklif_id, karar_tarihi) VALUES ($1, 'tek', $2, '2026-11-01')", [talep, teklif]);
      await s.sorgu('INSERT INTO satin_alma_siparis (talep_id, teklif_id, no, siparis_tarihi) VALUES ($1, $2, $3, current_date - 5)', [talep, teklif, no]);
      let i = 0;
      for (const [ad, ref, teslimler] of kalemler) {
        i += 1;
        const k = randomUUID();
        await s.sorgu('INSERT INTO satin_alma_talep_kalemi (talep_id, id, sira, ad, miktar) VALUES ($1, $2, $3, $4, 30)', [talep, k, i, ad]);
        const id = (await s.tek<{ id: number }>(
          "INSERT INTO satin_alma_siparis_satiri (talep_id, teklif_id, kalem_id, miktar, birim, logo_satir_ref) VALUES ($1, $2, $3, 30, 'adet', $4) RETURNING id", [talep, teklif, k, ref]))!.id;
        for (const m of teslimler) await s.sorgu('INSERT INTO satin_alma_teslim (siparis_satiri_id, mal_kabul_satiri_id, miktar, kisi_id) VALUES ($1, $2, $3, $4)', [id, 100 * sira + i, m, yoneticiId]);
      }
    };
    await siparis(1, 'SP-2026-901', [['ORN kalem 1', '9001', [20, 10]], ['ORN kalem 2', '9002', [28]], ['ORN kalem 3', null, []]]);
    await siparis(2, 'SP-2026-902', [['ORN kalem 4', null, []]]);
    await siparis(3, 'SP-2026-903', [['ORN kalem 5', '9003', []]]);
  };
  // Logo aynası: 9001'e 29 adet (irsaliye 1), 9002'ye 30 adet (irsaliye 1) ve 2 adet iade (irsaliye 2). Sayılmayanlar: iptal irsaliye 3,
  // Logo'da silinmiş (logoda_yok) irsaliye 4, alış/iade dışı türdeki (8) irsaliye 5; dönem 2'deki aynı logical_ref'li alış başlığı (5)
  // dönem 1'in satırına bağlanmaz. SP-2026-903'ün faturası okunmuş ama yok.
  const ayna = async (): Promise<void> => {
    const s = o().sahip;
    const baslik = (ref: number, tur: number, iptal: boolean, fatura: string | null, donem = 1, silindi = false) => s.sorgu(
      `INSERT INTO logo_irsaliye (firma, donem, logical_ref, tur, fis_no, tarih, iptal, e_irsaliye, fatura_no, okuma_zamani, logoda_yok)
       VALUES (1, $6, $1, $2, $3, current_date - 3, $4, true, $5, now(), CASE WHEN $7 THEN now() END)`, [ref, tur, `ORN-IRS-${ref}`, iptal, fatura, donem, silindi]);
    const satir = (ref: number, irs: number, sira: number, siparisSatir: number, miktar: number) => s.sorgu(
      `INSERT INTO logo_irsaliye_satiri (firma, donem, logical_ref, irsaliye_ref, sira, miktar, birim, siparis_satir_ref, siparis_no)
       VALUES (1, 1, $1, $2, $3, $4, 'ADET', $5, 'SP-2026-901')`, [ref, irs, sira, miktar, siparisSatir]);
    await baslik(1, 1, false, 'ORN-F-2');
    await baslik(2, 6, false, null);
    await baslik(3, 1, true, null);
    await satir(11, 1, 1, 9001, 29);
    await satir(12, 1, 2, 9002, 30);
    await satir(21, 2, 1, 9002, 2);
    await satir(31, 3, 1, 9001, 99);
    await baslik(4, 1, false, 'ORN-F-SILINEN', 1, true);
    await satir(41, 4, 1, 9002, 50);
    await baslik(5, 8, false, 'ORN-F-SATIS');
    await baslik(5, 1, false, 'ORN-F-DONEM2', 2);
    await satir(51, 5, 1, 9001, 40);
    await s.sorgu("INSERT INTO logo_fatura_okuma (siparis_no, son_okuma, sayi) VALUES ('SP-2026-903', now(), 0)");
    await s.sorgu("INSERT INTO logo_fatura_okuma (siparis_no, son_okuma, sayi) VALUES ('SP-2026-901', now(), 1)");
    await s.sorgu("INSERT INTO logo_fatura (siparis_no, anahtar, fatura_no, ham) VALUES ('SP-2026-901', '1', 'ORN-F-1', '{}')");
  };

  before(async () => {
    ortam = await testVeritabaniKur('logosipozet');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    yoneticiId = await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'lso-yonetici', parola: PAROLA }));
    await kisiRolle('lso-depocu', 'depo');
    await o().vt.sorgu("INSERT INTO rol (kod, ad) VALUES ('lso_gormeyen', 'Görmeyen')");
    await o().vt.sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, unnest(ARRAY['satin-alma.oku']) FROM rol WHERE kod = 'lso_gormeyen'");
    await kisiRolle('lso-gormeyen', 'lso_gormeyen');
    yonetici = await giris('lso-yonetici');
    depocu = await giris('lso-depocu');
    gormeyen = await giris('lso-gormeyen');
    await coreKayitlari();
    await ayna();
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    await ayar('logo.baglanti', true);
    await ayar('logo.irsaliye-okumasi', true);
    await ayar('logo.fatura-okumasi', true);
  });

  test('kalem karşılaştırması, iade düşülür, iptal irsaliye sayılmaz; faturalar sipariş ve irsaliyeden; hiçbir kayıt yazılmaz', async () => {
    const once = [await sayi('satin_alma_teslim'), await sayi('logo_irsaliye'), await sayi('logo_fatura')];
    const c = await oku('SP-2026-901,SP-2026-902,SP-2026-903,SP-2026-999');
    assert.equal(c.statusCode, 200, c.body);
    const g = c.json<SiparisLogoOzetiCevabi>();
    assert.deepEqual({ irsaliye: g.okuma.irsaliye, fatura: g.okuma.fatura }, { irsaliye: true, fatura: true });
    assert.deepEqual(g.siparisler.map((x) => x.siparisNo), ['SP-2026-901', 'SP-2026-902', 'SP-2026-903'], 'olmayan sipariş dönmez');
    const [a, b, f] = g.siparisler;
    assert.deepEqual(a!.kalemler.map((k) => [k.kalemAdi, k.durum, k.coreMiktari, k.logoMiktari, k.fark]), [
      ['ORN kalem 1', 'fark', '30', '29', '-1'],
      ['ORN kalem 2', 'ayni', '28', '28', null],
      ['ORN kalem 3', 'logo-bagi-yok', '0', null, null],
    ]);
    assert.deepEqual(a!.irsaliyeler.map((x) => [x.kayitNo, x.iade]), [[1, false], [2, true]]);
    assert.deepEqual(a!.faturalar, ['ORN-F-1', 'ORN-F-2']);
    assert.deepEqual([a!.irsaliyeliKalem, a!.farkliKalem, a!.logoda], [2, 1, true]);
    assert.deepEqual([b!.logoda, b!.faturalar, b!.kalemler.map((k) => k.durum)], [false, null, ['logo-bagi-yok']]);
    // Faturası okunmuş ama olmayan sipariş boş liste döner ("Fatura yok"); hiç okunmamış olan null ("bilinmiyor", yazılmaz).
    assert.deepEqual([f!.faturalar, f!.kalemler.map((k) => k.durum)], [[], ['bekliyor']]);
    assert.deepEqual([await sayi('satin_alma_teslim'), await sayi('logo_irsaliye'), await sayi('logo_fatura')], once);
  });

  test('irsaliye okuması kapalıyken karşılaştırma yapılmaz (boş ayna fark sayılmaz); ikisi de kapalıyken sipariş dönmez', async () => {
    await ayar('logo.irsaliye-okumasi', false);
    const g = (await oku('SP-2026-901')).json<SiparisLogoOzetiCevabi>();
    assert.equal(g.okuma.irsaliye, false);
    assert.equal(g.okuma.sonOkuma, null);
    assert.deepEqual(g.siparisler[0]!.kalemler.map((k) => [k.durum, k.logoMiktari]), [['okunmadi', null], ['okunmadi', null], ['logo-bagi-yok', null]]);
    assert.deepEqual([g.siparisler[0]!.irsaliyeler, g.siparisler[0]!.farkliKalem], [[], 0]);
    await ayar('logo.baglanti', false);
    const k = (await oku('SP-2026-901')).json<SiparisLogoOzetiCevabi>();
    assert.deepEqual(k, { okuma: { irsaliye: false, fatura: false, sonOkuma: null }, siparisler: [] });
  });

  test('fatura okuması kapalıyken okunan faturalar dönmez; yalnız irsaliyenin fatura numarası kalır', async () => {
    await ayar('logo.fatura-okumasi', false);
    const g = (await oku('SP-2026-901,SP-2026-903')).json<SiparisLogoOzetiCevabi>();
    assert.deepEqual([g.okuma.irsaliye, g.okuma.fatura], [true, false]);
    assert.deepEqual(g.siparisler.map((x) => [x.siparisNo, x.faturalar]), [['SP-2026-901', ['ORN-F-2']], ['SP-2026-903', null]]);
  });

  test('yetki: Logo irsaliyelerini gören (depo) okur, yalnız satın almayı okuyan 403; çok sipariş reddedilir', async () => {
    assert.equal((await oku('SP-2026-901', depocu)).statusCode, 200);
    assert.equal((await oku('SP-2026-901', gormeyen)).statusCode, 403);
    const cok = Array.from({ length: 201 }, (_, i) => `SP-2026-${1000 + i}`).join(',');
    assert.equal((await oku(cok)).statusCode, 400);
  });
});
