import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { isiBirKezCalistir } from '#cekirdek/zamanlayici.ts';
import type { GelenlerCevabi, HesaplarCevabi } from '#paylasilan/sozlesme/smartes.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { VARSAYILAN_AD_ALANI } from './ayar.ts';
import { isler } from './isler.ts';
import { smartesIstemcisiKur } from './istemci.ts';
import { sahteSmartesAc } from './sahte-smartes.ts';
import type { SahteCevap, SahteSmartes } from './sahte-smartes.ts';
import { coreOeeCozucusuKaydet, hesaplar, hesapTuru } from './servis.ts';

const PAROLA = 'dogru-parola-1';
const tablo = (satirlar: Record<string, string>[]): SahteCevap => ({ tur: 'tablo', satirlar });
const YAZAN_METOT = /(SetIsErp|SetErpOkRed|Delete|CreateUpdate|Create)$/;

describe('SmartES hesapları: OEE raporu ve çevrim süresi (kart 3174, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let sahte: SahteSmartes;
  let yonetici = '';
  let okuyucu = '';
  let simdi = Date.now();

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (yontem: 'GET' | 'POST', yol: string, govde?: unknown, c = yonetici) =>
    app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: c }, ...(govde === undefined ? {} : { payload: govde as object }) });
  const baglanti = async (acik: boolean) => {
    const c = await istek('POST', '/ayarlar/smartes.baglanti/degistir', { deger: acik });
    assert.equal(c.statusCode, 200, c.body);
  };
  const ortamKur = (istemciVar = true) => ({
    istemci: istemciVar
      ? smartesIstemcisiKur({ adres: sahte.adres, adAlani: VARSAYILAN_AD_ALANI }, { bekle: async () => {}, istekSuresiMs: 5000, listeSuresiMs: 5000 })
      : null,
    saat: () => new Date(simdi),
  });
  async function giris(kullaniciAdi: string): Promise<string> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  }
  const gun = (once: number): string => new Date(simdi - once * 86_400_000).toISOString().slice(0, 10);
  const say = async (tablosu: string) => (await vt().tek<{ n: number }>(`SELECT count(*)::int AS n FROM ${tablosu}`))?.n;
  const ekran = async (c = yonetici): Promise<HesaplarCevabi> => {
    const r = await istek('GET', '/smartes/hesaplar', undefined, c);
    assert.equal(r.statusCode, 200, r.body);
    return r.json();
  };

  before(async () => {
    ortam = await testVeritabaniKur('smhes');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Hesap', kullaniciAdi: 'sh-yonetici', parola: PAROLA }));
    yonetici = await giris('sh-yonetici');
    const id = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Okuyucu', kullaniciAdi: 'sh-okuyucu', parola: PAROLA }));
    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('sh_okuyucu', 'sh_okuyucu')");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'sayfa.smartes' FROM rol WHERE kod = 'sh_okuyucu'");
    await vt().sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'sh_okuyucu') WHERE kisi_id = $1", [id]);
    okuyucu = await giris('sh-okuyucu');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    sahte = await sahteSmartesAc();
    simdi += 48 * 3_600_000;
    for (const t of ['smartes_oee', 'smartes_cevrim_suresi', 'smartes_hesap_okuma', 'smartes_esleme']) await vt().sorgu(`DELETE FROM ${t}`);
    await baglanti(true);
  });
  afterEach(async () => { await sahte.kapat(); });

  test('SME-33: bağlantı kapalıyken ya da adres yokken hesap istenmez; iş "bekliyor" döner', async () => {
    await baglanti(false);
    assert.deepEqual(await hesapTuru(vt(), ortamKur()), { tur: 'kapali' });
    const is = isler.find((i) => i.ad === 'smartes-hesap-okumasi');
    assert.ok(is);
    assert.equal(await isiBirKezCalistir(vt(), is), 'bekliyor');
    await baglanti(true);
    assert.deepEqual(await hesapTuru(vt(), ortamKur(false)), { tur: 'ortam-degiskeni-yok' });
    assert.equal(sahte.cagrilar.length + sahte.getIstekleri, 0);
    assert.equal(await say('smartes_hesap_okuma'), 0);
  });

  test('SME-33: OEE ve çevrim süresi belgedeki metotlarla okunur, vardiya + makine başına tek kayıt güncellenir; saat dolmadan yeniden okunmaz', async () => {
    // Sahte SmartES her okumada aynı vardiya gününü verir: test saati ilerletirken gün dönerse tarih değişmesin.
    const dun = gun(1);
    sahte.isleyiciler.set('OEEReport', () => tablo([
      { SHIFT_DATE: `${dun}T00:00:00+03:00`, SHIFT: '1', MACHINE_CODE: 'ORN-M1', AVAILABILITY: '0.80', PERFORMANCE: '0.90', QUALITY: '1.00', OEE: '0.72' },
      { SHIFT_DATE: `${dun}T00:00:00+03:00`, SHIFT: '1', MACHINE_CODE: 'ORN-M1', AVAILABILITY: '0.85', PERFORMANCE: '0.90', QUALITY: '1.00', OEE: '0.77' },
      { SHIFT_DATE: `${dun}T00:00:00+03:00`, SHIFT: '2', MACHINE_CODE: 'ORN-M2', AVAILABILITY: '75', PERFORMANCE: '80', QUALITY: '100', OEE: '60' },
      { SHIFT: '2', MACHINE_CODE: 'ORN-M3' },
    ]));
    sahte.isleyiciler.set('PartsCycleTimesList', () => tablo([
      { STOCK_INFORMATION: 'ORN-STK', OPERATION_INFORMATION: '10', MACHINE_INFORMATION: 'ORN-M1', ESTIMATED_START_TIME: '00:01:30', TOTAL_PART_COUNT: '120', DAYS_AGO: '7' },
      { STOCK_INFORMATION: 'ORN-STK', OPERATION_INFORMATION: '20', MACHINE_INFORMATION: 'ORN-M2', ESTIMATED_START_TIME: '45' },
    ]));
    assert.deepEqual(await hesapTuru(vt(), ortamKur()), { tur: 'islendi', okunan: ['oee', 'cevrim'], hatali: [] });
    assert.deepEqual(sahte.cagrilar.map((c) => c.metot), ['OEEReport', 'PartsCycleTimesList']);
    assert.deepEqual(sahte.cagrilar.map((c) => c.metot).filter((m) => YAZAN_METOT.test(m)), []);
    assert.deepEqual(Object.keys(sahte.cagrilar[0]?.parametreler ?? {}), ['StartDatetime', 'EndDatetime', 'MachineIDs']);
    assert.equal(sahte.cagrilar[0]?.parametreler.MachineIDs, '');
    assert.equal(await say('smartes_oee'), 2);

    const c = await ekran();
    assert.deepEqual(c.oee.map((o) => [o.vardiya, o.makineKodu, o.kullanilabilirlik, o.performans, o.kalite, o.oee, o.coreOee]), [
      [2, 'ORN-M2', 75, 80, 100, 60, null],
      [1, 'ORN-M1', 85, 90, 100, 77, null],
    ]);
    assert.equal(c.oee[0]?.vardiyaTarihi, dun);
    assert.deepEqual(c.cevrim.map((x) => [x.operasyonKodu, x.gercekMetni, x.gercekSaniye, x.tanimliSaniye, x.parcaSayisi, x.gunSayisi]), [
      ['10', '00:01:30', 90, null, 120, 7],
      ['20', '45', null, null, null, null],
    ]);
    // Sayfayı gören ama OEE'yi görme yetkisi olmayan kişi SmartES'in değerlerini görür, CORE hesabı null kalır.
    assert.deepEqual((await ekran(okuyucu)).oee.map((o) => [o.oee, o.coreOee]), [[60, null], [77, null]]);

    const ozet = (await istek('GET', '/smartes/gelenler')).json() as GelenlerCevabi;
    assert.deepEqual(ozet.kalemler.filter((k) => k.anahtar === 'oee' || k.anahtar === 'cevrim').map((k) => [k.anahtar, k.sayi, k.sonOkuma !== null, k.yol]), [
      ['oee', 2, true, '/smartes/hesaplar'], ['cevrim', 2, true, '/smartes/hesaplar'],
    ]);

    sahte.cagrilar.length = 0;
    simdi += 30 * 60_000;
    assert.deepEqual(await hesapTuru(vt(), ortamKur()), { tur: 'islendi', okunan: [], hatali: [] });
    assert.equal(sahte.cagrilar.length, 0);
    simdi += 30 * 60_000;
    assert.equal((await hesapTuru(vt(), ortamKur())).tur, 'islendi');
    assert.equal(sahte.cagrilar.length, 2);
    assert.equal(await say('smartes_oee'), 2);
  });

  test('SME-33: CORE OEE’si makine eşlemesiyle aynı güne bağlanır ve yüzdeye çevrilir; OEE’yi görme yetkisi olmayan için hiç sorulmaz', async () => {
    const kisi = (await vt().tek<{ id: number }>("SELECT id FROM kisi WHERE kullanici_adi = 'sh-yonetici'"))?.id;
    await vt().sorgu(
      `INSERT INTO smartes_esleme (tur, tmi_id, smartes_kod, guncelleyen_kisi_id) VALUES ('makine', 77, 'ORN-M1', $1), ('makine', 78, 'ORN-M9', $1)`, [kisi]);
    await vt().sorgu(
      `INSERT INTO smartes_oee (vardiya_tarihi, vardiya, makine_kodu, oee, ham, ilk_okuma, son_okuma) VALUES
         ($1, 1, 'ORN-M1', 0.8, '{}', now(), now()), ($1, 2, 'ORN-M1', 0.6, '{}', now(), now()), ($1, 1, 'ORN-M2', 0.5, '{}', now(), now())`, [gun(1)]);
    const sorulan: string[] = [];
    // Dosya kendi sürecinde koşar; bağ yerine konan çözücü başka testi etkilemez.
    coreOeeCozucusuKaydet(async (_db, _kullanici, sorgu) => {
      sorulan.push(`${sorgu.baslangic}..${sorgu.bitis}`);
      return [{ id: 77, oee: 0.7123 }, { id: 78, oee: null }, { id: 99, oee: 0.9 }];
    });
    const yetkili = await vt().tx((db) => hesaplar(db, { id: 1, ad: 'x', islemler: ['sayfa.smartes', 'oee.oku'] }, new Date(simdi)));
    assert.deepEqual(yetkili.oee.map((o) => [o.vardiya, o.makineKodu, o.oee, o.coreOee]), [
      [2, 'ORN-M1', 60, 71.23], [1, 'ORN-M1', 80, 71.23], [1, 'ORN-M2', 50, null],
    ]);
    assert.deepEqual(sorulan, [`${gun(1)}..${gun(1)}`], 'gün başına tek okuma');
    sorulan.length = 0;
    const yetkisiz = await vt().tx((db) => hesaplar(db, { id: 1, ad: 'x', islemler: ['sayfa.smartes'] }, new Date(simdi)));
    assert.deepEqual([yetkisiz.oee.map((o) => o.coreOee), sorulan], [[null, null, null], []]);
    coreOeeCozucusuKaydet(null);
    const bagsiz = await vt().tx((db) => hesaplar(db, { id: 1, ad: 'x', islemler: ['sayfa.smartes', 'oee.oku'] }, new Date(simdi)));
    assert.deepEqual(bagsiz.oee.map((o) => [o.oee, o.coreOee]), [[60, null], [80, null], [50, null]]);
  });

  test('SME-33: okunamayan ya da alanları tanınmayan hesap eski haliyle kalır, hatası izde saklanır; yedi günden eski vardiya gösterilmez', async () => {
    await vt().sorgu(
      `INSERT INTO smartes_oee (vardiya_tarihi, vardiya, makine_kodu, oee, ham, ilk_okuma, son_okuma) VALUES
         ($1, 1, 'ORN-M1', 0.5, '{}', now(), now()), ($2, 1, 'ORN-M1', 0.6, '{}', now(), now())`, [gun(2), gun(20)]);
    sahte.isleyiciler.set('OEEReport', () => tablo([{ BILINMEYEN: 'x' }]));
    sahte.isleyiciler.set('PartsCycleTimesList', () => ({ tur: 'fault', ileti: 'ORN hata' }));
    assert.deepEqual(await hesapTuru(vt(), ortamKur()), { tur: 'islendi', okunan: [], hatali: ['oee', 'cevrim'] });
    const izler = await vt().sorgu<{ tur: string; sonSonuc: string; sonHata: string | null }>(
      'SELECT tur, son_sonuc AS "sonSonuc", son_hata AS "sonHata" FROM smartes_hesap_okuma ORDER BY tur');
    assert.deepEqual(izler.map((i) => [i.tur, i.sonSonuc]), [['cevrim', 'hata'], ['oee', 'hata']]);
    assert.match(izler[1]?.sonHata ?? '', /beklenen alanlar bulunamadı/);
    assert.equal(await say('smartes_oee'), 2);
    const c = await vt().tx((db) => hesaplar(db, { id: 1, ad: 'x', islemler: ['sayfa.smartes'] }, new Date(simdi)));
    assert.deepEqual(c.oee.map((o) => [o.vardiyaTarihi, o.oee]), [[gun(2), 50]]);
    assert.equal((await istek('GET', '/smartes/hesaplar', undefined, '')).statusCode, 401);
  });
});
