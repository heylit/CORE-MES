import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { SMARTES_AYARLARI } from '#paylasilan/ayarlar/smartes.ts';
import { isiBirKezCalistir, modulIsleriniKesfet } from '#cekirdek/zamanlayici.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { VARSAYILAN_AD_ALANI } from './ayar.ts';
import { isler } from './isler.ts';
import { smartesIstemcisiKur } from './istemci.ts';
import { TANIM_TUR_SINIRI, yasakMetotMu } from './kurallar.ts';
import type { KaliteAmbarKaynagi, TanimKaydi } from './kurallar.ts';
import { sahteSmartesAc } from './sahte-smartes.ts';
import type { SahteCevap, SahteSmartes } from './sahte-smartes.ts';
import { hazirlik, kaliteAmbarTuru, tanimTuru, yeniBekleyenBellegi, yeniOkumaBellegi, yeniSurecBellegi } from './servis.ts';
import type { TurOrtami } from './servis.ts';
import type { TanimKaynagi } from './tanim-kaynagi.ts';

const PAROLA = 'dogru-parola-1';
const tablo = (satirlar: Record<string, string>[]): SahteCevap => ({ tur: 'tablo', satirlar });
const KAYNAKLAR: readonly KaliteAmbarKaynagi[] = ['red', 'ambar', 'kalite'];
const METOT: Record<KaliteAmbarKaynagi, string> = { red: 'WsWorkordersRejectStatusList', ambar: 'WarehouseStatusList', kalite: 'QualityControlStatusList' };
const TABLO: Record<KaliteAmbarKaynagi, string> = { red: 'smartes_red', ambar: 'smartes_ambar_hareketi', kalite: 'smartes_kalite_kontrol' };
// SmartES'te yazma, işaretleme ya da silme anlamına gelen her metot: kalite/ambar akışında hiçbiri çağrılamaz.
const YAZAN_METOT = /(SetIsErp|SetErpOkRed|Delete|CreateUpdate|Create)$/;

describe('SmartES kalite, hurda, ambar okuması ve tanım gönderimi (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let sahte: SahteSmartes;
  let yonetici = '';
  let sayac = 0;
  let simdi = Date.parse('2026-10-15T08:00:00Z');

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (yontem: 'GET' | 'POST', yol: string, govde?: unknown) =>
    app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: yonetici }, ...(govde === undefined ? {} : { payload: govde as object }) });
  const ayar = async (anahtar: string, deger: boolean) => {
    const c = await istek('POST', `/ayarlar/${anahtar}/degistir`, { deger });
    assert.equal(c.statusCode, 200, c.body);
  };
  const istemciKur = () => smartesIstemcisiKur({ adres: sahte.adres, adAlani: VARSAYILAN_AD_ALANI }, { bekle: async () => {}, istekSuresiMs: 5000, listeSuresiMs: 5000 });
  const turOrtami = (ekle: Partial<TurOrtami> = {}): TurOrtami => ({
    istemci: istemciKur(), saat: () => new Date(simdi), operasyonlar: yeniSurecBellegi(), okumalar: yeniOkumaBellegi(), bekleyenler: yeniBekleyenBellegi(), ...ekle,
  });
  const sayi = async (tablo: string): Promise<number> => (await vt().tek<{ n: number }>(`SELECT count(*)::int AS n FROM ${tablo}`))?.n ?? -1;
  const metotlar = () => sahte.cagrilar.map((c) => c.metot);
  const tanimSatiri = (tur: string, tmiId: number) => vt().tek<{ durum: string; son_hata: string | null; deneme_sayisi: number; sonraki_deneme: Date | null }>(
    'SELECT durum, son_hata, deneme_sayisi, sonraki_deneme FROM smartes_tanim_giden WHERE tur = $1 AND tmi_id = $2', [tur, tmiId]);
  const iz = (akis: string) => vt().tek<{ son_bitis: Date | null; son_sonuc: string; son_hata: string | null; okunan: number | null; kimliksiz: number | null }>(
    'SELECT son_bitis, son_sonuc, son_hata, okunan, kimliksiz FROM smartes_akis_izi WHERE akis = $1', [akis]);

  before(async () => {
    ortam = await testVeritabaniKur('smkal');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Kalite', kullaniciAdi: 'sk-yonetici', parola: PAROLA }));
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi: 'sk-yonetici', parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    yonetici = String(c.headers['set-cookie']).split(';')[0] ?? '';
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    sahte = await sahteSmartesAc();
    simdi += 24 * 3_600_000;
    for (const t of ['smartes_akis_izi', 'smartes_red', 'smartes_ambar_hareketi', 'smartes_kalite_kontrol']) await vt().sorgu(`DELETE FROM ${t}`);
    await ayar('smartes.baglanti', true);
    await ayar('smartes.kalite-ambar-okumasi', false);
    await ayar('smartes.tanim-gonderimi', false);
  });
  afterEach(async () => { await sahte.kapat(); });

  describe('SME-20 kalite, hurda, ambar okuması', () => {
    test('yeni ayarlar varsayılan kapalıdır; akış anahtarı kapalıyken, ana anahtar kapalıyken ya da adres yokken hiç istek gitmez, hiçbir şey yazılmaz', async () => {
      for (const anahtar of ['smartes.kalite-ambar-okumasi', 'smartes.tanim-gonderimi'] as const) {
        assert.equal(SMARTES_AYARLARI[anahtar].tur, 'boolean');
        assert.equal(SMARTES_AYARLARI[anahtar].varsayilan, false, anahtar);
      }

      for (const k of KAYNAKLAR) assert.deepEqual(await kaliteAmbarTuru(vt(), k, turOrtami()), { tur: 'akis-kapali' }, k);
      await ayar('smartes.kalite-ambar-okumasi', true);
      await ayar('smartes.baglanti', false);
      for (const k of KAYNAKLAR) assert.deepEqual(await kaliteAmbarTuru(vt(), k, turOrtami()), { tur: 'kapali' }, k);
      await ayar('smartes.baglanti', true);
      for (const k of KAYNAKLAR) assert.deepEqual(await kaliteAmbarTuru(vt(), k, turOrtami({ istemci: null })), { tur: 'ortam-degiskeni-yok' }, k);
      assert.equal(sahte.cagrilar.length + sahte.getIstekleri, 0);
      for (const k of KAYNAKLAR) assert.equal(await sayi(TABLO[k]), 0);
      assert.equal(await sayi('smartes_akis_izi'), 0);
    });

    test('işler: yeni akışlar kapalıyken "bekliyor" nedeniyle biter ve istek atmaz', async () => {
      const adlar = (await modulIsleriniKesfet()).map((i) => i.ad).filter((ad) => ad.startsWith('smartes-'));
      for (const ad of ['smartes-okuma-red', 'smartes-okuma-ambar', 'smartes-okuma-kalite', 'smartes-tanim-gonderimi']) assert.ok(adlar.includes(ad), ad);
      await ayar('smartes.baglanti', false);
      for (const is of isler.filter((i) => /smartes-(okuma-(red|ambar|kalite)|tanim-gonderimi)/.test(i.ad))) {
        assert.equal(await isiBirKezCalistir(vt(), is), 'bekliyor', is.ad);
      }
      assert.equal(sahte.cagrilar.length, 0);
    });

    test('açıkken doğru metot ve pencere parametreleriyle gider; satırlar SmartES kimliğiyle yazılır, kimliksiz satır sayılır', async () => {
      await ayar('smartes.kalite-ambar-okumasi', true);
      sahte.isleyiciler.set('WsWorkordersRejectStatusList', () => tablo([
        { ID: '11', WORKORDER_NO: 'IE-1-10', WORKSTATION_CODE: 'TST', MACHINE_CODE: 'M1', STOCK_NO: 'S1', REJECT_QUANTITY: '3', REJECT_NAME: 'OLCU', LOG_DATETIME: '2026-10-15T09:00:00' },
        { WORKORDER_NO: 'kimliksiz' },
      ]));
      sahte.isleyiciler.set('WarehouseStatusList', () => tablo([
        { ID: '21', STOCK_NO: 'S1', WAREHOUSE_CODE: 'A1', TYPE: 'GoodsReceipt', QUANTITY: '12,5', DATE: '2026-10-15T09:10:00' },
      ]));
      sahte.isleyiciler.set('QualityControlStatusList', () => tablo([
        { ID: '31', WORKORDER_NO: 'IE-1-10', MEASURE_NAME: 'Çap', MEASURE_VALUE: '49.98', MEASURE_STATUS: 'OK', MEASURE_DATETIME: '2026-10-15T09:20:00' },
      ]));
      const bellek = yeniOkumaBellegi();
      const sonuc = [];
      for (const k of KAYNAKLAR) sonuc.push(await kaliteAmbarTuru(vt(), k, turOrtami({ okumalar: bellek })));
      assert.deepEqual(sonuc, [{ tur: 'okundu', okunan: 2, kimliksiz: 1 }, { tur: 'okundu', okunan: 1, kimliksiz: 0 }, { tur: 'okundu', okunan: 1, kimliksiz: 0 }]);
      assert.deepEqual(metotlar(), ['WsWorkordersRejectStatusList', 'WarehouseStatusList', 'QualityControlStatusList']);
      // Belgedeki parametre adları metottan metoda değişir (md. 46, 53, 64); filtre "All".
      const beklenen = [
        ['WorkordersRejectStatusFilter', 'StartDatetime', 'EndDatetime'],
        ['StartDate', 'EndDate', 'WarehouseCodes', 'WarehouseStatusFilter'],
        ['StartDateTime', 'EndDateTime', 'QualityControlStatusFilter'],
      ];
      sahte.cagrilar.forEach((c, i) => {
        assert.equal(c.soapAction, `"http://tempuri.org/${c.metot}"`, 'SOAPAction tırnaklı');
        assert.deepEqual(Object.keys(c.parametreler), beklenen[i]);
        for (const [ad, deger] of Object.entries(c.parametreler)) {
          if (/Filter$/.test(ad)) assert.equal(deger, 'All', ad);
          else if (/^(Start|End)Date/.test(ad)) assert.match(deger, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/, `${ad} Z'siz`);
          else assert.equal(deger, '', ad);
        }
      });
      const red = await vt().tek<Record<string, unknown>>('SELECT adet, neden_kodu, neden, istasyon_kodu, ham FROM smartes_red WHERE smartes_id = 11');
      assert.equal(red?.['adet'], 3);
      assert.equal(red?.['neden_kodu'], 'OLCU');
      assert.equal(red?.['neden'], null, 'fire satırında neden adı yok');
      assert.equal(red?.['istasyon_kodu'], 'TST');
      assert.equal((red?.['ham'] as Record<string, string>)['ID'], '11');
      const ambar = await vt().tek<{ miktar: string; hareket_turu: string }>('SELECT miktar, hareket_turu FROM smartes_ambar_hareketi WHERE smartes_id = 21');
      assert.deepEqual(ambar, { miktar: '12.5', hareket_turu: 'GoodsReceipt' });
      const kalite = await vt().tek<{ olcum_adi: string; olcum_degeri: string; sonuc: string }>('SELECT olcum_adi, olcum_degeri, sonuc FROM smartes_kalite_kontrol WHERE smartes_id = 31');
      assert.deepEqual(kalite, { olcum_adi: 'Çap', olcum_degeri: '49.98', sonuc: 'OK' });
      assert.equal((await iz('red'))?.kimliksiz, 1);
      assert.equal((await iz('ambar'))?.son_sonuc, 'tamam');
    });

    test('aynı kayıt ikinci okumada çift yazılmaz (güncellenir); işaretleme, yazma ve silme metodu hiç çağrılmaz', async () => {
      await ayar('smartes.kalite-ambar-okumasi', true);
      sahte.isleyiciler.set('WsWorkordersRejectStatusList', () => tablo([{ ID: '11', REJECT_QUANTITY: '3' }]));
      sahte.isleyiciler.set('WarehouseStatusList', () => tablo([{ ID: '21', QUANTITY: '5' }]));
      sahte.isleyiciler.set('QualityControlStatusList', () => tablo([{ ID: '31', MEASURE_STATUS: 'OK' }]));
      const bellek = yeniOkumaBellegi();
      for (const k of KAYNAKLAR) await kaliteAmbarTuru(vt(), k, turOrtami({ okumalar: bellek }));
      const ilkBitis = (await iz('red'))?.son_bitis?.getTime();
      const once = await vt().tek<{ ilk: Date; son: Date }>('SELECT ilk_okuma AS ilk, son_okuma AS son FROM smartes_red WHERE smartes_id = 11');

      simdi += 15 * 60_000;
      sahte.isleyiciler.set('WsWorkordersRejectStatusList', () => tablo([{ ID: '11', REJECT_QUANTITY: '4' }, { ID: '12', REJECT_QUANTITY: '1' }]));
      for (const k of KAYNAKLAR) await kaliteAmbarTuru(vt(), k, turOrtami({ okumalar: bellek }));
      assert.equal(await sayi('smartes_red'), 2);
      assert.equal(await sayi('smartes_ambar_hareketi'), 1);
      assert.equal(await sayi('smartes_kalite_kontrol'), 1);
      const sonra = await vt().tek<{ adet: number; ilk: Date; son: Date }>('SELECT adet, ilk_okuma AS ilk, son_okuma AS son FROM smartes_red WHERE smartes_id = 11');
      assert.equal(sonra?.adet, 4, 'sayı güncellenir');
      assert.equal(sonra?.ilk.getTime(), once?.ilk.getTime(), 'ilk okuma korunur');
      assert.ok((sonra?.son.getTime() ?? 0) > (once?.son.getTime() ?? 0));
      const ikinciBas = Date.parse(`${sahte.cagrilar[3]?.parametreler['StartDatetime']}Z`);
      assert.ok(ikinciBas < Date.parse(`${sahte.cagrilar[0]?.parametreler['EndDatetime']}Z`), 'pencere öncekinin sonundan geriden başlar (örtüşme)');
      assert.ok(((await iz('red'))?.son_bitis?.getTime() ?? 0) > (ilkBitis ?? 0), 'imleç ilerler');

      assert.deepEqual([...new Set(metotlar())].sort(), ['QualityControlStatusList', 'WarehouseStatusList', 'WsWorkordersRejectStatusList']);
      assert.equal(metotlar().some((m) => YAZAN_METOT.test(m)), false, 'işaretleme, yazma ve silme metodu çağrılmadı');
    });

    test('ağ hatasında iş düşmez: tur hata döner, imleç ilerlemez, kayıt yazılmaz; sonraki tur kaldığı yerden okur', async () => {
      await ayar('smartes.kalite-ambar-okumasi', true);
      sahte.isleyiciler.set('WarehouseStatusList', () => ({ tur: 'kopar' }));
      const r = await kaliteAmbarTuru(vt(), 'ambar', turOrtami());
      assert.equal(r.tur, 'hata');
      assert.ok(!JSON.stringify(r).includes(sahte.adres), 'ileti adres taşımaz');
      assert.equal((await iz('ambar'))?.son_sonuc, 'hata');
      assert.equal((await iz('ambar'))?.son_bitis, null);
      assert.equal(await sayi('smartes_ambar_hareketi'), 0);

      simdi += 15 * 60_000;
      sahte.isleyiciler.set('WarehouseStatusList', () => tablo([{ ID: '21', QUANTITY: '5' }]));
      assert.deepEqual(await kaliteAmbarTuru(vt(), 'ambar', turOrtami()), { tur: 'okundu', okunan: 1, kimliksiz: 0 });
      assert.equal((await iz('ambar'))?.son_sonuc, 'tamam');
      assert.equal((await iz('ambar'))?.son_hata, null);
    });

    test('SmartES hatası (Fault) turu düşürmez; okuma işareti bir kaynağın hatası ötekileri etkilemez', async () => {
      await ayar('smartes.kalite-ambar-okumasi', true);
      sahte.isleyiciler.set('WsWorkordersRejectStatusList', () => ({ tur: 'fault', ileti: 'Parametre eksik' }));
      sahte.isleyiciler.set('QualityControlStatusList', () => tablo([{ ID: '31' }]));
      assert.deepEqual(await kaliteAmbarTuru(vt(), 'red', turOrtami()), { tur: 'hata', ileti: 'SmartES hatası: Parametre eksik' });
      assert.deepEqual(await kaliteAmbarTuru(vt(), 'kalite', turOrtami()), { tur: 'okundu', okunan: 1, kimliksiz: 0 });
      assert.equal((await iz('red'))?.son_hata, 'SmartES hatası: Parametre eksik');
      assert.equal(await iz('kalite').then((i) => i?.son_sonuc), 'tamam');
    });

    test('hazırlık: akış anahtarı kapalıysa kapalı, açıksa hazır; sayılar ve ilk hata görünür; üretim kaydı bağlanmadı kalır', async () => {
      const ort = { adres: sahte.adres, adAlani: VARSAYILAN_AD_ALANI };
      const bak = async () => vt().okumaTx((db) => hazirlik(db, istemciKur(), ort));
      const akis = (h: Awaited<ReturnType<typeof bak>>, ad: string) => h.akislar.find((a) => a.anahtar === ad);
      let h = await bak();
      assert.equal(akis(h, 'kalite-ambar')?.durum, 'kapali');
      assert.equal(akis(h, 'tanimlar')?.durum, 'kapali');
      assert.equal(akis(h, 'kalite-ambar')?.ayar, 'smartes.kalite-ambar-okumasi');
      assert.equal(akis(h, 'tanimlar')?.ayar, 'smartes.tanim-gonderimi');
      assert.equal(akis(h, 'is-emri-durumu')?.durum, 'hazir', 'var olan akışlar etkilenmez');
      assert.equal(akis(h, 'uretim-kaydi')?.durum, 'baglanmadi');
      assert.equal(akis(h, 'isaret'), undefined, 'TMI işaret akışı tanımlamaz (346 a)');

      await ayar('smartes.kalite-ambar-okumasi', true);
      await ayar('smartes.tanim-gonderimi', true);
      sahte.isleyiciler.set('WsWorkordersRejectStatusList', () => tablo([{ ID: '11' }]));
      sahte.isleyiciler.set('WarehouseStatusList', () => ({ tur: 'fault', ileti: 'Süre doldu' }));
      sahte.isleyiciler.set('QualityControlStatusList', () => tablo([{ ID: '31' }, { ID: '32' }]));
      for (const k of KAYNAKLAR) await kaliteAmbarTuru(vt(), k, turOrtami());
      const onceki = sahte.cagrilar.length;
      h = await bak();
      assert.equal(sahte.cagrilar.length + sahte.getIstekleri, onceki, 'hazırlık SmartES\'e istek atmaz');
      assert.equal(akis(h, 'kalite-ambar')?.durum, 'hazir');
      assert.equal(akis(h, 'kalite-ambar')?.islenen, 3);
      assert.equal(akis(h, 'kalite-ambar')?.sonHata, 'SmartES hatası: Süre doldu');
      assert.ok(akis(h, 'kalite-ambar')?.sonDeneme);
      assert.equal(akis(h, 'tanimlar')?.durum, 'hazir');
      const adressiz = await vt().okumaTx((db) => hazirlik(db, null, { adres: null, adAlani: null }));
      assert.equal(akis(adressiz, 'kalite-ambar')?.durum, 'ayar-eksik');
      assert.equal(akis(adressiz, 'uretim-kaydi')?.durum, 'baglanmadi');
    });
  });

  describe('SME-21 tanım gönderimi', () => {
    const istasyonlar = (liste: TanimKaydi[]): TanimKaynagi => ({
      istasyonlar: async () => liste.filter((k) => k.tur === 'istasyon'),
      stoklar: async (_db, sayfa) => ({ kayitlar: sayfa === 1 ? liste.filter((k) => k.tur === 'stok') : [], sonSayfa: true }),
    });
    const ist = (tmiId: number, kod: string, ad = `Ad ${kod}`): TanimKaydi => ({ tur: 'istasyon', tmiId, kod, ad });
    const stok = (tmiId: number, kod: string, ad = `Ad ${kod}`): TanimKaydi => ({ tur: 'stok', tmiId, kod, ad });
    const tanimTemizle = async () => {
      await vt().sorgu('DELETE FROM smartes_tanim_giden');
      await vt().sorgu("DELETE FROM smartes_esleme WHERE tur = 'istasyon'");
    };
    const tur = (o: TurOrtami) => tanimTuru(vt(), o);
    const bosListe = () => { sahte.isleyiciler.set('WorkStationList', () => tablo([])); sahte.isleyiciler.set('StocksList', () => tablo([])); };

    beforeEach(tanimTemizle);

    test('anahtar kapalıyken, ana anahtar kapalıyken ya da adres yokken hiç istek gitmez, hiçbir şey yazılmaz', async () => {
      const k = istasyonlar([ist(9001, 'TA1')]);
      assert.deepEqual(await tur(turOrtami({ tanimKaynagi: k, niyetler: new Set() })), { tur: 'akis-kapali' });
      await ayar('smartes.tanim-gonderimi', true);
      assert.deepEqual(await tur(turOrtami({ tanimKaynagi: k, niyetler: new Set(), istemci: null })), { tur: 'ortam-degiskeni-yok' });
      await ayar('smartes.baglanti', false);
      assert.deepEqual(await tur(turOrtami({ tanimKaynagi: k, niyetler: new Set() })), { tur: 'kapali' });
      assert.equal(sahte.cagrilar.length + sahte.getIstekleri, 0);
      assert.equal(await sayi('smartes_tanim_giden'), 0);
      assert.equal(await iz('tanim'), null);
    });

    test('önce niyet yazılır (istek yok); sonraki turda liste okunur, kodu olmayan kayıt doğru metot ve parametreyle gider; bir daha gitmez', async () => {
      await ayar('smartes.tanim-gonderimi', true);
      bosListe();
      const o = turOrtami({ tanimKaynagi: istasyonlar([ist(9001, 'TA1', 'Torna & Freze'), stok(9101, 'ST-1', 'Halka <50>')]), niyetler: new Set() });
      assert.deepEqual(await tur(o), { tur: 'islendi', niyet: 2, gonderilen: 0, zatenVar: 0, belirsiz: 0, hatali: 0, turHatasi: null });
      assert.equal(sahte.cagrilar.length, 0, 'niyet turunda istek yok');
      assert.equal((await tanimSatiri('istasyon', 9001))?.durum, 'niyet');

      simdi += 15 * 60_000;
      const r = await tur(o);
      assert.deepEqual(r, { tur: 'islendi', niyet: 0, gonderilen: 2, zatenVar: 0, belirsiz: 0, hatali: 0, turHatasi: null });
      assert.deepEqual(metotlar(), ['WorkStationList', 'WorkStationCreateUpdate', 'StocksList', 'StockCreateUpdate']);
      const yaz = sahte.cagrilar.filter((c) => /CreateUpdate$/.test(c.metot));
      assert.equal(yaz[0]?.soapAction, '"http://tempuri.org/WorkStationCreateUpdate"');
      assert.deepEqual(yaz[0]?.parametreler,
        { ID: '0', Code: 'TA1', Name: 'Torna & Freze', DailyCapacityCalculateType: '1', DailyCapacityCalculateValue: '0', IsPassive: 'false' });
      assert.deepEqual(yaz[1]?.parametreler, { StockNo: 'ST-1', StockDescription: 'Halka <50>' });
      assert.deepEqual(await tanimSatiri('istasyon', 9001), { durum: 'gonderildi', son_hata: null, deneme_sayisi: 1, sonraki_deneme: null });
      assert.equal((await iz('tanim'))?.son_sonuc, 'tamam');

      sahte.cagrilar.length = 0;
      simdi += 15 * 60_000;
      assert.deepEqual(await tur(o), { tur: 'islendi', niyet: 0, gonderilen: 0, zatenVar: 0, belirsiz: 0, hatali: 0, turHatasi: null });
      assert.equal(sahte.cagrilar.length, 0, 'gönderilmiş kayıt yeniden gitmez');
      assert.equal(metotlar().some((m) => /(SetIsErp|SetErpOkRed|Delete)$/.test(m)), false);
    });

    test('SmartES kod eşlemesi olan istasyon gitmez; SmartES listesinde kodu olan kayıt gönderilmez ("zaten var")', async () => {
      await ayar('smartes.tanim-gonderimi', true);
      const kisi = await vt().tek<{ id: number }>('SELECT id FROM kisi ORDER BY id LIMIT 1');
      await vt().sorgu("INSERT INTO smartes_esleme (tur, tmi_id, smartes_kod, guncelleyen_kisi_id) VALUES ('istasyon', 9001, 'ESKI', $1)", [kisi?.id]);
      sahte.isleyiciler.set('WorkStationList', () => tablo([{ ID: '5', CODE: 'ta2', NAME: 'Var olan' }]));
      sahte.isleyiciler.set('StocksList', () => tablo([]));
      const o = turOrtami({ tanimKaynagi: istasyonlar([ist(9001, 'TA1'), ist(9002, 'TA2'), ist(9003, 'TA3')]), niyetler: new Set() });
      const ilk = await tur(o);
      assert.ok(ilk.tur === 'islendi' && ilk.niyet === 2, 'eşlemeli istasyon için niyet bile yazılmaz');
      assert.equal(await tanimSatiri('istasyon', 9001), null);
      simdi += 15 * 60_000;
      const r = await tur(o);
      assert.ok(r.tur === 'islendi' && r.gonderilen === 1 && r.zatenVar === 1);
      assert.deepEqual(sahte.cagrilar.filter((c) => /CreateUpdate$/.test(c.metot)).map((c) => c.parametreler['Code']), ['TA3'], 'var olan kodun adı ezilmez');
      assert.equal((await tanimSatiri('istasyon', 9002))?.durum, 'zaten-var');
    });

    test('sonucu bilinmeyen gönderim yinelenmez: belirsiz kalır, tur durur, süre geçse de, süreç yenilense de istek gitmez', async () => {
      await ayar('smartes.tanim-gonderimi', true);
      bosListe();
      sahte.isleyiciler.set('WorkStationCreateUpdate', () => ({ tur: 'kopar' }));
      const o = turOrtami({ tanimKaynagi: istasyonlar([ist(9001, 'TA1'), ist(9002, 'TA2')]), niyetler: new Set() });
      await tur(o);
      simdi += 15 * 60_000;
      const r = await tur(o);
      assert.ok(r.tur === 'islendi' && r.belirsiz === 1 && r.gonderilen === 0 && r.turHatasi !== null);
      assert.equal(sahte.cagrilar.filter((c) => c.metot === 'WorkStationCreateUpdate').length, 1, 'ağ hatasında tur durur, ikinci kayda istek gitmez');
      const b = await tanimSatiri('istasyon', 9001);
      assert.equal(b?.durum, 'belirsiz');
      assert.match(b?.son_hata ?? '', /sonucu bilinmiyor/);
      assert.equal(b?.deneme_sayisi, 1);
      assert.equal((await iz('tanim'))?.son_sonuc, 'hata');

      sahte.cagrilar.length = 0;
      sahte.isleyiciler.set('WorkStationCreateUpdate', () => ({ tur: 'skaler', etkilenen: 1 }));
      for (let i = 0; i < 3; i++) {
        simdi += 60 * 60_000;
        await tur(o);
      }
      assert.equal((await tanimSatiri('istasyon', 9001))?.durum, 'belirsiz', 'kendiliğinden yinelenmez');
      assert.equal(sahte.cagrilar.filter((c) => c.metot === 'WorkStationCreateUpdate' && c.parametreler['Code'] === 'TA1').length, 0);

      // Niyeti bu süreçte yazılmamış (süreç yeniden başladı) kayıt istek atılmış olabilir: belirsiz olur, gönderilmez.
      await tanimTemizle();
      sahte.cagrilar.length = 0;
      const eski = turOrtami({ tanimKaynagi: istasyonlar([ist(9005, 'TA5')]), niyetler: new Set() });
      await tur(eski);
      simdi += 15 * 60_000;
      const yeniSurec = turOrtami({ tanimKaynagi: istasyonlar([ist(9005, 'TA5')]), niyetler: new Set() });
      const r2 = await tur(yeniSurec);
      assert.ok(r2.tur === 'islendi' && r2.belirsiz === 1 && r2.gonderilen === 0);
      assert.equal(sahte.cagrilar.length, 0);
      assert.equal((await tanimSatiri('istasyon', 9005))?.durum, 'belirsiz');
    });

    test('SmartES reddederse hata ve bekleme yazılır; süre dolmadan yinelenmez, dolunca yeniden niyet yazılır ve sonraki turda gider', async () => {
      await ayar('smartes.tanim-gonderimi', true);
      bosListe();
      sahte.isleyiciler.set('WorkStationCreateUpdate', () => ({ tur: 'skaler', etkilenen: 0, hata: 'Kod geçersiz' }));
      const o = turOrtami({ tanimKaynagi: istasyonlar([ist(9001, 'TA1')]), niyetler: new Set() });
      await tur(o);
      simdi += 15 * 60_000;
      const r = await tur(o);
      assert.ok(r.tur === 'islendi' && r.hatali === 1);
      const h = await tanimSatiri('istasyon', 9001);
      assert.equal(h?.durum, 'hata');
      assert.equal(h?.son_hata, 'SmartES reddetti: Kod geçersiz');
      assert.equal(h?.sonraki_deneme?.getTime(), simdi + 60_000);

      sahte.cagrilar.length = 0;
      await tur(o);
      assert.equal(sahte.cagrilar.length, 0, 'bekleme dolmadan yinelenmez');

      simdi += 2 * 60_000;
      sahte.isleyiciler.set('WorkStationCreateUpdate', () => ({ tur: 'skaler', etkilenen: 1 }));
      const yenidenNiyet = await tur(o);
      assert.ok(yenidenNiyet.tur === 'islendi' && yenidenNiyet.niyet === 1 && yenidenNiyet.gonderilen === 0);
      simdi += 15 * 60_000;
      const gitti = await tur(o);
      assert.ok(gitti.tur === 'islendi' && gitti.gonderilen === 1);
      assert.equal((await tanimSatiri('istasyon', 9001))?.durum, 'gonderildi');
    });

    test('liste okunamazsa ya da kod alanı bulunamazsa hiçbir tanım gitmez, iş düşmez; düzelince gönderilir', async () => {
      await ayar('smartes.tanim-gonderimi', true);
      sahte.isleyiciler.set('StocksList', () => tablo([]));
      sahte.isleyiciler.set('WorkStationList', () => ({ tur: 'kopar' }));
      const o = turOrtami({ tanimKaynagi: istasyonlar([ist(9001, 'TA1')]), niyetler: new Set() });
      await tur(o);
      simdi += 15 * 60_000;
      const r = await tur(o);
      assert.ok(r.tur === 'islendi' && r.gonderilen === 0 && r.turHatasi !== null);
      assert.equal(metotlar().includes('WorkStationCreateUpdate'), false);
      assert.equal((await iz('tanim'))?.son_sonuc, 'hata');
      assert.equal((await tanimSatiri('istasyon', 9001))?.durum, 'niyet', 'niyet korunur');

      simdi += 15 * 60_000;
      sahte.isleyiciler.set('WorkStationList', () => tablo([{ BILINMEYEN_ALAN: 'x' }]));
      const r2 = await tur(o);
      assert.ok(r2.tur === 'islendi' && r2.gonderilen === 0 && /kod alanı bulunamadı/.test(r2.turHatasi ?? ''));
      assert.equal(metotlar().includes('WorkStationCreateUpdate'), false);

      simdi += 15 * 60_000;
      sahte.isleyiciler.set('WorkStationList', () => tablo([{ CODE: 'BASKA' }]));
      const r3 = await tur(o);
      assert.ok(r3.tur === 'islendi' && r3.gonderilen === 1 && r3.turHatasi === null);
      assert.equal((await iz('tanim'))?.son_sonuc, 'tamam');
    });

    test('tur başına gönderim sınırı vardır; kalan kayıtlar sonraki turda gider', async () => {
      await ayar('smartes.tanim-gonderimi', true);
      bosListe();
      const kayitlar = Array.from({ length: TANIM_TUR_SINIRI + 3 }, (_, i) => ist(9100 + i, `TB${i}`));
      const o = turOrtami({ tanimKaynagi: istasyonlar(kayitlar), niyetler: new Set() });
      await tur(o);
      simdi += 15 * 60_000;
      const r1 = await tur(o);
      assert.ok(r1.tur === 'islendi' && r1.gonderilen === TANIM_TUR_SINIRI);
      simdi += 15 * 60_000;
      const r2 = await tur(o);
      assert.ok(r2.tur === 'islendi' && r2.gonderilen === 3);
      assert.equal(sahte.cagrilar.filter((c) => c.metot === 'WorkStationCreateUpdate').length, TANIM_TUR_SINIRI + 3);
    });

    test('uygun olmayan kod (boş, kenarında boşluk, 50 karakterden uzun) atlanır', async () => {
      await ayar('smartes.tanim-gonderimi', true);
      bosListe();
      const o = turOrtami({ tanimKaynagi: istasyonlar([ist(9201, ' A'), ist(9202, 'B'.repeat(51)), ist(9203, ''), ist(9204, 'TC1')]), niyetler: new Set() });
      const r = await tur(o);
      assert.ok(r.tur === 'islendi' && r.niyet === 1);
      assert.equal(await sayi('smartes_tanim_giden'), 1);
    });

    test('varsayılan kaynak istasyonlar modülünden okur (aktif istasyonlar)', async () => {
      await ayar('smartes.tanim-gonderimi', true);
      bosListe();
      const im = await istek('POST', '/is-merkezleri', { kod: `TM${(sayac += 1)}`, ad: 'Tanım merkezi' });
      assert.equal(im.statusCode, 200, im.body);
      const kod = `TK${(sayac += 1)}`;
      const ist1 = await istek('POST', '/istasyonlar', { kod, ad: 'Tanım istasyonu', isMerkeziId: (im.json() as { id: number }).id, tip: 'talasli' });
      assert.equal(ist1.statusCode, 200, ist1.body);
      const id = (ist1.json() as { id: number }).id;
      const o = turOrtami({ niyetler: new Set() });
      await tur(o);
      assert.equal((await tanimSatiri('istasyon', id))?.durum, 'niyet');
      simdi += 15 * 60_000;
      await tur(o);
      assert.equal((await tanimSatiri('istasyon', id))?.durum, 'gonderildi');
      assert.ok(sahte.cagrilar.some((c) => c.metot === 'WorkStationCreateUpdate' && c.parametreler['Code'] === kod));
    });
  });

  describe('SME-20 yasak metot kuralı', () => {
    test('işaretleme, silme ve yazma metotları yasak sayılır; okuma listeleri değil', () => {
      for (const m of ['RejectStatusSetIsErp', 'WarehouseStatusSetIsErp', 'QualityControlStatusSetIsErp', 'SetErpOkRed', 'WorkOrdersDelete']) assert.equal(yasakMetotMu(m), true, m);
      for (const m of ['WsWorkordersRejectStatusList', 'WarehouseStatusList', 'QualityControlStatusList', 'WorkStationList', 'StocksList']) assert.equal(yasakMetotMu(m), false, m);
    });
  });
});
