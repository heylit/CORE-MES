import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { LOGO_AYARLARI } from '#paylasilan/ayarlar/logo.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { cariHareketTuru, faturaListesiTuru } from './fatura-cari.ts';
import { cariHareketSayfasiniAyikla, faturaCariBaslangicGunu, faturaCariOkunmaliMi, faturaSayfasiniAyikla, FATURA_CARI_ARALIGI_MS } from './fatura-cari-sozlesmesi.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import { OKUMA_HATA_BEKLEME_MS } from './kurallar.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import type { SahteKopru } from './sahte-kopru.ts';
import { yeniSurecBellegi } from './servis.ts';
import type { SurecBellegi, TurOrtami } from './servis.ts';

const PAROLA = 'dogru-parola-1';

// 3675 D1: fatura başlığı ve cari hareket aynası yalnız okunur; sözleşme doğrulanmadığı için sahte köprüyle denenir. Veri sentetiktir (ORN-).
describe('Logo fatura ve cari hareket okuması (gerçek PostgreSQL, sahte köprü)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let kopru: SahteKopru;
  let yonetici = '';
  let simdi = Date.parse('2026-11-24T10:00:00Z');
  let bellek: SurecBellegi = yeniSurecBellegi();

  const o = (): TestVeritabani => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam;
  };
  const ayar = async (anahtar: string, deger: boolean): Promise<void> => {
    const c = await app.inject({ method: 'POST', url: `/api/ayarlar/${anahtar}/degistir`, headers: { cookie: yonetici, 'istek-kimligi': randomUUID() }, payload: { deger } });
    assert.equal(c.statusCode, 200, `${anahtar}: ${c.body}`);
  };
  const ortami = (): TurOrtami => ({ kopru: kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, { sureMs: 5000 }), bellek, saat: () => new Date(simdi) });
  const faturaTuru = () => faturaListesiTuru(o().vt, ortami());
  const cariTuru = () => cariHareketTuru(o().vt, ortami());
  const istekler = (yol: string) => kopru.istekler.filter((x) => x.yol === yol);
  const fatura = (ref: number, tur: string, ek: Record<string, unknown> = {}): Record<string, unknown> => ({
    logicalRef: ref, type: tur, invoiceNo: `ORN-F-${ref}`, date: '2026-11-04', arpCode: 'ORN-C-1', currencyType: 0, netAmount: 1000, vatAmount: 200, grossAmount: 1200, cancelled: false, ...ek,
  });
  const hareket = (ref: number, ek: Record<string, unknown> = {}): Record<string, unknown> => ({
    logicalRef: ref, arpCode: 'ORN-C-1', date: '2026-11-05', kind: 'fatura', documentNo: `ORN-F-${ref}`, debit: 1200, credit: 0, currencyType: 0, ...ek,
  });
  const say = async (tablo: string): Promise<number> => Number((await o().sahip.tek<{ n: string }>(`SELECT count(*) AS n FROM ${tablo}`))?.n);

  before(async () => {
    ortam = await testVeritabaniKur('logofaturacari');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'fc-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'fc-yonetici', parola: PAROLA } });
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    kopru = await sahteKopruAc();
    kopru.sayfaBoyu = 2;
    bellek = yeniSurecBellegi();
    simdi = Date.parse('2026-11-24T10:00:00Z');
    await o().sahip.sorgu('DELETE FROM logo_fatura_cari_imleci');
    await o().sahip.sorgu('DELETE FROM logo_fatura_baslik');
    await o().sahip.sorgu('ALTER TABLE logo_cari_hareket DISABLE TRIGGER USER');
    await o().sahip.sorgu('DELETE FROM logo_cari_hareket');
    await o().sahip.sorgu('ALTER TABLE logo_cari_hareket ENABLE TRIGGER USER');
    await ayar('logo.baglanti', true);
    await ayar('logo.fatura-listesi-okumasi', true);
    await ayar('logo.cari-hareket-okumasi', true);
  });
  afterEach(async () => { await kopru.kapat(); });

  test('anahtarlar varsayılan kapalı; kapalıyken ve bağlantı kapalıyken köprüye istek gitmez', async () => {
    assert.equal(LOGO_AYARLARI['logo.fatura-listesi-okumasi'].varsayilan, false);
    assert.equal(LOGO_AYARLARI['logo.cari-hareket-okumasi'].varsayilan, false);
    kopru.logoFaturalari = [fatura(1, 'satis')];
    kopru.logoCariHareketleri = [hareket(1)];
    await ayar('logo.fatura-listesi-okumasi', false);
    await ayar('logo.cari-hareket-okumasi', false);
    assert.deepEqual(await faturaTuru(), { tur: 'fatura-listesi-kapali' });
    assert.deepEqual(await cariTuru(), { tur: 'cari-hareket-kapali' });
    await ayar('logo.fatura-listesi-okumasi', true);
    await ayar('logo.baglanti', false);
    assert.deepEqual(await faturaTuru(), { tur: 'kapali' });
    assert.equal(kopru.istekler.length, 0);
  });

  test('faturalar türe göre sırayla okunur; aynı kayıt yeniden gelirse son hâle getirilir (iptal); Logo\'ya yazılmaz', async () => {
    kopru.sayfaBoyu = 10;
    kopru.logoFaturalari = [fatura(1, 'satis'), fatura(2, 'alis'), fatura(3, 'satis-iade', { netAmount: 100, vatAmount: 20, grossAmount: 120 }), fatura(4, 'alis-iade')];
    // Turda tek istek: dört tür dört turda; beşinci turda hepsi yetişmiştir.
    for (let i = 0; i < 4; i += 1) assert.deepEqual(await faturaTuru(), { tur: 'okuma', akis: 'fatura-listesi', sonuc: 'okundu', sayi: 1 });
    assert.deepEqual(await faturaTuru(), { tur: 'bos' });
    assert.equal(istekler('/api/Invoice/list').length, 4);
    assert.equal(await say('logo_fatura_baslik'), 4);
    const iade = await o().sahip.tek<{ tur: string; net: string; kdv: string; brut: string }>("SELECT tur, net::text, kdv::text, brut::text FROM logo_fatura_baslik WHERE logo_kayit_no = 3");
    assert.deepEqual(iade, { tur: 'satis-iade', net: '100', kdv: '20', brut: '120' });
    // Logo'da iptal edilen fatura sonraki okumada iptal olarak görünür.
    kopru.logoFaturalari = [fatura(5, 'satis'), fatura(1, 'satis', { cancelled: true })];
    await o().sahip.sorgu("UPDATE logo_fatura_cari_imleci SET son_ref = 0 WHERE akis = 'fatura-satis'");
    simdi += FATURA_CARI_ARALIGI_MS;
    assert.deepEqual(await faturaTuru(), { tur: 'okuma', akis: 'fatura-listesi', sonuc: 'okundu', sayi: 2 });
    assert.equal((await o().sahip.tek<{ iptal: boolean }>('SELECT iptal FROM logo_fatura_baslik WHERE logo_kayit_no = 1'))?.iptal, true);
    assert.equal(await say('logo_fatura_baslik'), 5);
    assert.ok(kopru.istekler.every((x) => x.yontem === 'GET'), 'Logo\'ya yazılmaz');
  });

  test('fatura sayfalı okunur: sayfa doluysa bekleme yok, yetişince saatte bir', async () => {
    kopru.logoFaturalari = [fatura(1, 'satis'), fatura(2, 'satis'), fatura(3, 'satis')];
    assert.deepEqual(await faturaTuru(), { tur: 'okuma', akis: 'fatura-listesi', sonuc: 'okundu', sayi: 2 });
    assert.deepEqual(await faturaTuru(), { tur: 'okuma', akis: 'fatura-listesi', sonuc: 'okundu', sayi: 1 });
    // Satış yetişti; sıra diğer türlerde (boş sayfa), sonra bekleme.
    for (let i = 0; i < 3; i += 1) assert.deepEqual(await faturaTuru(), { tur: 'okuma', akis: 'fatura-listesi', sonuc: 'okundu', sayi: 0 });
    assert.deepEqual(await faturaTuru(), { tur: 'bos' });
    assert.equal(await say('logo_fatura_baslik'), 3);
  });

  test('cari hareket yalnız eklenir; ikinci okumada aynı kayıt çoğalmaz, imleç geri gitmez', async () => {
    kopru.logoCariHareketleri = [hareket(1), hareket(2, { debit: 0, credit: 500, kind: 'tahsilat', documentNo: null }), hareket(3, { currencyType: 20 })];
    assert.deepEqual(await cariTuru(), { tur: 'okuma', akis: 'cari-hareket', sonuc: 'okundu', sayi: 2 });
    assert.deepEqual(await cariTuru(), { tur: 'okuma', akis: 'cari-hareket', sonuc: 'okundu', sayi: 1 });
    assert.deepEqual(await cariTuru(), { tur: 'bos' }, 'yetişti: saat dolmadan istek yok');
    assert.equal(await say('logo_cari_hareket'), 3);
    const tahsilat = await o().sahip.tek<{ borc: string; alacak: string; tur: string; belge_no: string | null }>('SELECT borc::text, alacak::text, tur, belge_no FROM logo_cari_hareket WHERE logo_kayit_no = 2');
    assert.deepEqual(tahsilat, { borc: '0', alacak: '500', tur: 'tahsilat', belge_no: null });
    await o().sahip.sorgu('UPDATE logo_fatura_cari_imleci SET son_ref = 0, dolu = true');
    assert.deepEqual(await cariTuru(), { tur: 'okuma', akis: 'cari-hareket', sonuc: 'okundu', sayi: 0 });
    assert.equal(await say('logo_cari_hareket'), 3);
    await assert.rejects(o().vt.sorgu('UPDATE logo_cari_hareket SET borc = 1'), 'hareket değiştirilemez');
    assert.ok(kopru.istekler.every((x) => x.yontem === 'GET'));
  });

  test('yardımcıda uç yoksa okuma hata verir, bekleme süresince yinelenmez, sonra yeniden denenir; imleç ilerlemez', async () => {
    kopru.faturaCariUcuYok = true;
    kopru.logoCariHareketleri = [hareket(1)];
    const r = await cariTuru();
    assert.equal(r.tur, 'okuma');
    assert.notEqual(r.tur === 'okuma' ? r.sonuc : '', 'okundu');
    assert.deepEqual(await cariTuru(), { tur: 'bos' });
    assert.equal(istekler('/api/Arp/movements').length, 1);
    kopru.faturaCariUcuYok = false;
    simdi += OKUMA_HATA_BEKLEME_MS;
    assert.deepEqual(await cariTuru(), { tur: 'okuma', akis: 'cari-hareket', sonuc: 'okundu', sayi: 1 });
  });

  test('yardımcı başka dönemi bildirirse yeni dönemin imleci açılır, okunan sayfa yazılmaz', async () => {
    kopru.sayfaBoyu = 10;
    kopru.logoCariHareketleri = [hareket(1)];
    await cariTuru();
    kopru.irsaliyeDonemi = { firm: 1, period: 2 };
    simdi += FATURA_CARI_ARALIGI_MS;
    assert.deepEqual(await cariTuru(), { tur: 'okuma', akis: 'cari-hareket', sonuc: 'okundu', sayi: 0 });
    assert.equal(await say('logo_cari_hareket'), 1);
    assert.deepEqual(await cariTuru(), { tur: 'okuma', akis: 'cari-hareket', sonuc: 'okundu', sayi: 1 });
    assert.equal(await say('logo_cari_hareket'), 2);
  });

  test('fatura okumasında da yardımcı başka dönemi bildirirse yeni dönemin imleci sıfırdan açılır; küçük numaralı yeni dönem faturası okunur', async () => {
    kopru.sayfaBoyu = 10;
    kopru.logoFaturalari = [fatura(50, 'satis')];
    assert.deepEqual(await faturaTuru(), { tur: 'okuma', akis: 'fatura-listesi', sonuc: 'okundu', sayi: 1 });
    kopru.irsaliyeDonemi = { firm: 1, period: 2 };
    kopru.logoFaturalari = [fatura(1, 'satis', { date: '2026-11-20' })];
    simdi += FATURA_CARI_ARALIGI_MS;
    assert.deepEqual(await faturaTuru(), { tur: 'okuma', akis: 'fatura-listesi', sonuc: 'okundu', sayi: 0 }, 'okunan sayfa yazılmaz');
    assert.equal(await say('logo_fatura_baslik'), 1);
    assert.deepEqual(await faturaTuru(), { tur: 'okuma', akis: 'fatura-listesi', sonuc: 'okundu', sayi: 1 }, 'yeni dönem sıfırdan okunur');
    const yeni = await o().sahip.tek<{ donem: number; logo_kayit_no: string }>("SELECT donem, logo_kayit_no::text FROM logo_fatura_baslik WHERE donem = 2");
    assert.deepEqual(yeni, { donem: 2, logo_kayit_no: '1' });
  });

  test('sözleşme ayıklayıcıları: biçim bozuksa sayfa okunmamış sayılır, bozuk satır atlanır', () => {
    const iyi = { firm: 1, period: 3, data: [fatura(1, 'satis'), { logicalRef: 2 }, fatura(3, 'alis', { cancelled: true })], next: null };
    const s = faturaSayfasiniAyikla(iyi);
    assert.deepEqual(s?.kayitlar.map((x) => x.logoKayitNo), [1, 3]);
    assert.equal(s?.kayitlar[1]?.iptal, true);
    assert.equal(s?.donem, 3);
    assert.equal(faturaSayfasiniAyikla({ ...iyi, period: undefined }), null, 'dönem yoksa okunmamış');
    assert.equal(faturaSayfasiniAyikla({ data: 'x', firm: 1, period: 1 }), null);
    assert.equal(cariHareketSayfasiniAyikla({ firm: 1, period: 1, data: [hareket(1, { debit: -5 }), hareket(2)] })?.kayitlar.length, 1, 'eksi tutar atlanır');
    assert.equal(faturaCariBaslangicGunu(new Date('2026-11-24T10:00:00Z')), '2025-11-01');
    assert.equal(faturaCariOkunmaliMi(null, new Date()), true);
  });
});
