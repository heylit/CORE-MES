import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { LogoSonAlisCevabi } from '#paylasilan/sozlesme/logo.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { tekrarDeposu } from '../istek-kimligi/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { kopruIstemcisiKur } from './kopru.ts';
import { ESKI_YARDIMCI_ILETISI, OKUMA_HATA_BEKLEME_MS, SON_ALIS_ARALIGI_MS } from './kurallar.ts';
import { sahteKopruAc } from './sahte-kopru.ts';
import type { SahteKopru } from './sahte-kopru.ts';
import { yeniSurecBellegi } from './servis.ts';
import type { SurecBellegi, TurOrtami } from './servis.ts';
import { sonAlisTuru } from './son-alis.ts';

const PAROLA = 'dogru-parola-1';

// 3384-c a: Logo alış faturası satırları yalnız okunur ve CORE kopyasına eklenir; öneri yalnız maliyeti görebilene. Veri sentetiktir (ORN-).
describe('Logo son alış kopyası: okuma işi ve öneri ucu (gerçek PostgreSQL, sahte köprü)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let kopru: SahteKopru;
  let yonetici = '';
  let maliyetci = '';
  let alisci = '';
  let simdi = Date.parse('2026-11-18T10:00:00Z');
  let bellek: SurecBellegi = yeniSurecBellegi();

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
  const ortami = (): TurOrtami => ({ kopru: kopruIstemcisiKur({ adres: kopru.adres, anahtar: kopru.anahtar }, { sureMs: 5000 }), bellek, saat: () => new Date(simdi) });
  const tur = () => sonAlisTuru(o().vt, ortami());
  const istekSayisi = (): number => kopru.istekler.filter((x) => x.yol === '/api/Material/purchases').length;
  const sayi = async (): Promise<number> => Number((await o().sahip.tek<{ n: string }>('SELECT count(*) AS n FROM logo_son_alis'))?.n);
  const imlec = () => o().sahip.tek<{ firma: number; donem: number; son_ref: number; dolu: boolean }>(
    'SELECT firma, donem, son_ref, dolu FROM logo_son_alis_imleci ORDER BY son_okuma DESC LIMIT 1');
  const oneri = (malzemeler: string, cerez = yonetici) => app.inject({ method: 'GET', url: `/api/logo/son-alislar?malzemeler=${encodeURIComponent(malzemeler)}`, headers: { cookie: cerez } });
  const alis = (ref: number, kod: string, ek: Record<string, unknown> = {}): Record<string, unknown> => ({
    logicalRef: ref, itemCode: kod, date: '2026-11-04', arpCode: 'ORN-C-1', invoiceNo: `ORN-F-${ref}`, quantity: 40, unitCode: 'KG', price: 186.4,
    currencyType: 0, currencyPrice: 0, ...ek,
  });
  const kisiRolle = async (ad: string, islemler: readonly string[]): Promise<void> => {
    const id = await o().vt.tx((db) => yoneticiOlustur(db, { ad: `Deneme ${ad}`, kullaniciAdi: ad, parola: PAROLA }));
    await o().vt.sorgu('INSERT INTO rol (kod, ad) VALUES ($1, $1)', [ad.replace('-', '_')]);
    await o().vt.sorgu('INSERT INTO rol_islemi (rol_id, islem) SELECT rol.id, i FROM rol, unnest($2::text[]) i WHERE kod = $1', [ad.replace('-', '_'), islemler]);
    await o().vt.sorgu('UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = $2) WHERE kisi_id = $1', [id, ad.replace('-', '_')]);
  };

  before(async () => {
    ortam = await testVeritabaniKur('logosonalis');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz, tekrar: tekrarDeposu });
    await o().vt.tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'sa-yonetici', parola: PAROLA }));
    await kisiRolle('sa-maliyetci', ['finans.maliyet-oku']);
    // 3401: alış fiyatını görür ama maliyeti görmez; öneri teklifte maliyete dönüşür, ona gösterilmez.
    await kisiRolle('sa-alisci', ['satin-alma.fiyat-oku', 'satin-alma.yaz']);
    yonetici = await giris('sa-yonetici');
    maliyetci = await giris('sa-maliyetci');
    alisci = await giris('sa-alisci');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    kopru = await sahteKopruAc();
    kopru.sayfaBoyu = 2;
    bellek = yeniSurecBellegi();
    simdi = Date.parse('2026-11-18T10:00:00Z');
    await o().sahip.sorgu('DELETE FROM logo_son_alis_imleci');
    await o().sahip.sorgu('ALTER TABLE logo_son_alis DISABLE TRIGGER USER');
    await o().sahip.sorgu('DELETE FROM logo_son_alis');
    await o().sahip.sorgu('ALTER TABLE logo_son_alis ENABLE TRIGGER USER');
    await o().sahip.sorgu('DELETE FROM logo_malzeme_eslemesi');
    await ayar('logo.baglanti', true);
    await ayar('logo.son-alis-okumasi', true);
  });
  afterEach(async () => { await kopru.kapat(); });

  test('ayar varsayılan kapalı; kapalıyken köprüye istek gitmez, öneri dönmez', async () => {
    await ayar('logo.son-alis-okumasi', false);
    kopru.logoAlislari = [alis(1, 'ORN-M-1')];
    assert.deepEqual(await tur(), { tur: 'son-alis-kapali' });
    await ayar('logo.son-alis-okumasi', true);
    await ayar('logo.baglanti', false);
    assert.deepEqual(await tur(), { tur: 'kapali' });
    assert.equal(kopru.istekler.length, 0);
    const c = await oneri('ORN-M-1');
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(c.json<LogoSonAlisCevabi>(), { okuma: 'kapali', kayitlar: [] });
  });

  test('geçmiş sayfa sayfa okunur, yetişince saatte bir; aynı satır ikinci kez eklenmez', async () => {
    kopru.logoAlislari = [alis(1, 'ORN-M-1'), alis(2, 'ORN-M-2'), alis(3, 'ORN-M-1', { date: '2026-11-10', price: 190 })];
    assert.deepEqual(await tur(), { tur: 'okuma', akis: 'son-alis', sonuc: 'okundu', sayi: 2 });
    assert.deepEqual(await imlec(), { firma: 1, donem: 1, son_ref: 2, dolu: true });
    assert.deepEqual(await tur(), { tur: 'okuma', akis: 'son-alis', sonuc: 'okundu', sayi: 1 }, 'sayfa doluydu: bekleme yok');
    assert.equal((await imlec())?.dolu, false);
    assert.deepEqual(await tur(), { tur: 'bos' }, 'yetişti: saat dolmadan istek yok');
    assert.equal(istekSayisi(), 2);
    kopru.logoAlislari.push(alis(4, 'ORN-M-2', { date: '2026-11-12' }));
    simdi += SON_ALIS_ARALIGI_MS;
    assert.deepEqual(await tur(), { tur: 'okuma', akis: 'son-alis', sonuc: 'okundu', sayi: 1 });
    assert.equal(await sayi(), 4);
    // İmleç geri alınırsa aynı satırlar yeniden gelir ama kopya değişmez.
    await o().sahip.sorgu('UPDATE logo_son_alis_imleci SET son_ref = 0, dolu = true');
    assert.deepEqual(await tur(), { tur: 'okuma', akis: 'son-alis', sonuc: 'okundu', sayi: 0 });
    assert.equal(await sayi(), 4);
    assert.ok(kopru.istekler.every((x) => x.yontem === 'GET'), 'Logo\'ya yazılmaz');
  });

  test('döviz türü olup döviz fiyatı olmayan satır dövizsiz yazılır; sayfanın kalanı da yazılır, okuma takılmaz', async () => {
    kopru.sayfaBoyu = 10;
    kopru.logoAlislari = [alis(1, 'ORN-M-1'), alis(2, 'ORN-M-2', { currencyType: 20, currencyPrice: null }), alis(3, 'ORN-M-3')];
    assert.deepEqual(await tur(), { tur: 'okuma', akis: 'son-alis', sonuc: 'okundu', sayi: 3 });
    const satir = await o().sahip.tek<{ doviz_turu: number | null; doviz_fiyati: string | null }>(
      "SELECT doviz_turu, doviz_fiyati FROM logo_son_alis WHERE malzeme_kodu = 'ORN-M-2'");
    assert.deepEqual(satir, { doviz_turu: null, doviz_fiyati: null });
    assert.equal((await imlec())?.son_ref, 3);
  });

  test('3384-c a: okuma ayarı kapanınca kopyada satır olsa da öneri dönmez', async () => {
    kopru.logoAlislari = [alis(1, 'ORN-M-1')];
    await tur();
    assert.equal(await sayi(), 1);
    await ayar('logo.son-alis-okumasi', false);
    const c = await oneri('ORN-M-1', maliyetci);
    assert.equal(c.statusCode, 200, c.body);
    assert.deepEqual(c.json<LogoSonAlisCevabi>(), { okuma: 'kapali', kayitlar: [] });
  });

  test('kopya yalnız eklenir: güncelleme ve silme reddedilir', async () => {
    kopru.logoAlislari = [alis(1, 'ORN-M-1')];
    await tur();
    await assert.rejects(o().sahip.sorgu('UPDATE logo_son_alis SET fiyat = 1'), /yalnız ekleme/);
    await assert.rejects(o().sahip.sorgu('DELETE FROM logo_son_alis'), /yalnız ekleme/);
  });

  test('dönem değişince o dönemin imleci açılır, okunan sayfa yazılmaz', async () => {
    kopru.logoAlislari = [alis(1, 'ORN-M-1')];
    await tur();
    kopru.irsaliyeDonemi = { firm: 1, period: 2 };
    simdi += SON_ALIS_ARALIGI_MS;
    assert.deepEqual(await tur(), { tur: 'okuma', akis: 'son-alis', sonuc: 'okundu', sayi: 0 });
    assert.deepEqual(await imlec(), { firma: 1, donem: 2, son_ref: 0, dolu: true });
    assert.equal(await sayi(), 1);
    assert.deepEqual(await tur(), { tur: 'okuma', akis: 'son-alis', sonuc: 'okundu', sayi: 1 }, 'yeni dönem baştan');
    assert.equal(await sayi(), 2);
  });

  test('eski yardımcı: sonuç reddedildi, bekleme süresince istek yinelenmez', async () => {
    kopru.topluAlisUcuYok = true;
    const r = await tur();
    assert.equal(r.tur, 'okuma');
    assert.equal('sonuc' in r && r.sonuc, 'reddedildi');
    assert.equal(ESKI_YARDIMCI_ILETISI.includes('eski'), true);
    assert.deepEqual(await tur(), { tur: 'bos' });
    simdi += OKUMA_HATA_BEKLEME_MS;
    await tur();
    assert.equal(istekSayisi(), 2);
    assert.equal(await sayi(), 0);
  });

  test('öneri: malzeme başına en yeni fatura, eşlemeli kod, döviz ayrı; yalnız maliyeti görebilen', async () => {
    kopru.sayfaBoyu = 10;
    kopru.logoAlislari = [
      alis(1, 'ORN-M-1', { price: 150 }), alis(2, 'ORN-M-1', { date: '2026-11-10', price: 190 }),
      alis(3, 'ORN LOGO 9', { date: '2026-10-21', quantity: 4, unitCode: 'ADET', price: 2415, currencyType: 20, currencyPrice: 52.1 }),
    ];
    await tur();
    await o().sahip.sorgu("INSERT INTO logo_malzeme_eslemesi (stok_kodu, logo_kodu, logo_kayit_no) VALUES ('ORN-M-9', 'ORN LOGO 9', 77)");
    const c = await oneri('ORN-M-1,ORN-M-9,ORN-YOK', maliyetci);
    assert.equal(c.statusCode, 200, c.body);
    const v = c.json<LogoSonAlisCevabi>();
    assert.equal(v.okuma, 'acik');
    assert.deepEqual(v.kayitlar.map((k) => [k.stokKodu, k.tarih, Number(k.fiyat), k.dovizTuru, k.dovizFiyati === null ? null : Number(k.dovizFiyati)]), [
      ['ORN-M-1', '2026-11-10', 190, null, null],
      ['ORN-M-9', '2026-10-21', 2415, 20, 52.1],
    ]);
    assert.equal(v.kayitlar[0]?.faturaNo, 'ORN-F-2');
    assert.equal(v.kayitlar[1]?.birim, 'ADET');
    assert.deepEqual(v.kayitlar.map((k) => k.dovizKodu), [null, 'EUR']);
    assert.equal((await oneri('ORN-M-1', alisci)).statusCode, 403, 'alış fiyatını gören maliyeti görmez (3401)');
    assert.equal((await oneri('', maliyetci)).json<LogoSonAlisCevabi>().kayitlar.length, 0);
  });
});
