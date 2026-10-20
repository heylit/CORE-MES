import assert from 'node:assert/strict';
import { after, afterEach, before, beforeEach, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import type { Db, Veritabani } from '#cekirdek/db.ts';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import { isiBirKezCalistir, modulIsleriniKesfet } from '#cekirdek/zamanlayici.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { kullaniciYukle, yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { emirIptalEt, uretimEmriAc } from '../uretim-emirleri/disari.ts';
import { VARSAYILAN_AD_ALANI } from './ayar.ts';
import { KALITE_AMBAR_KAYNAKLARI, yasakMetotMu } from './kurallar.ts';
import { isler } from './isler.ts';
import { smartesIstemcisiKur } from './istemci.ts';
import { sahteSmartesAc, tabloCevapMetni } from './sahte-smartes.ts';
import type { SahteCevap, SahteSmartes } from './sahte-smartes.ts';
import { gonderimTuru, kaliteAmbarTuru, okumaTuru, tanimTuru, yeniBekleyenBellegi, yeniOkumaBellegi, yeniSurecBellegi } from './servis.ts';
import type { TurOrtami } from './servis.ts';

const PAROLA = 'dogru-parola-1';
const tablo = (satirlar: Record<string, string>[]): SahteCevap => ({ tur: 'tablo', satirlar });

describe('SmartES bağlantısı, sahte SmartES ile uçtan uca (kart #778, gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let sahte: SahteSmartes;
  let yonetici = '';
  let okuyucu = '';
  let yetkisiz = '';
  let yoneticiId = 0;
  let denemeProjeId = 0;
  let sayac = 0;
  let simdi = Date.parse('2026-10-12T08:00:00Z');

  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const istek = (yontem: 'GET' | 'POST', yol: string, govde?: unknown, c = yonetici) =>
    app.inject({ method: yontem, url: `/api${yol}`, headers: { cookie: c }, ...(govde === undefined ? {} : { payload: govde as object }) });
  const turOrtami = (): TurOrtami => ({
    istemci: smartesIstemcisiKur({ adres: sahte.adres, adAlani: VARSAYILAN_AD_ALANI }, { bekle: async () => {}, istekSuresiMs: 5000, listeSuresiMs: 5000 }),
    saat: () => new Date(simdi),
    operasyonlar: yeniSurecBellegi(),
    okumalar: yeniOkumaBellegi(),
    bekleyenler: yeniBekleyenBellegi(),
  });
  const baglanti = async (acik: boolean) => {
    const c = await istek('POST', '/ayarlar/smartes.baglanti/degistir', { deger: acik });
    assert.equal(c.statusCode, 200, c.body);
  };
  async function giris(kullaniciAdi: string): Promise<string> {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  }
  async function rolluKisi(kullaniciAdi: string, islemler: string[]): Promise<string> {
    const id = await vt().tx((db) => yoneticiOlustur(db, { ad: `Deneme ${kullaniciAdi}`, kullaniciAdi, parola: PAROLA }));
    const rol = kullaniciAdi.replace(/-/g, '_');
    await vt().sorgu('INSERT INTO rol (kod, ad) VALUES ($1, $1)', [rol]);
    for (const islem of islemler) await vt().sorgu('INSERT INTO rol_islemi (rol_id, islem) SELECT id, $2 FROM rol WHERE kod = $1', [rol, islem]);
    await vt().sorgu('UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = $2) WHERE kisi_id = $1', [id, rol]);
    return giris(kullaniciAdi);
  }
  async function istasyonAc(): Promise<number> {
    const im = await istek('POST', '/is-merkezleri', { kod: `SM${(sayac += 1)}`, ad: 'SmartES merkezi' });
    const ist = await istek('POST', '/istasyonlar', { kod: `SI${(sayac += 1)}`, ad: 'SmartES istasyonu', isMerkeziId: (im.json() as { id: number }).id, tip: 'talasli' });
    assert.equal(ist.statusCode, 200, ist.body);
    return (ist.json() as { id: number }).id;
  }
  const isEmriDurumu = (id: number) => vt().tek<{ saglam: number | null; red: number | null }>(
    'SELECT saglam, red FROM smartes_is_emri_durumu WHERE smartes_id = $1', [id]);
  const okumaSatiri = (kaynak: string) => vt().tek<{ son_bitis: Date | null; son_sonuc: string; son_hata: string | null; okunan: number | null; kimliksiz: number | null }>(
    'SELECT son_bitis, son_sonuc, son_hata, okunan, kimliksiz FROM smartes_okuma WHERE kaynak = $1', [kaynak]);

  before(async () => {
    ortam = await testVeritabaniKur('smartes');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    yoneticiId = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme SmartES', kullaniciAdi: 'sm-yonetici', parola: PAROLA }));
    denemeProjeId = (await ortam!.sahip.tek<{ id: number }>(
      "INSERT INTO projeler_proje (kod, ad, olusturan_id) VALUES ('SMARTES.1', 'Deneme proje', $1) RETURNING id", [yoneticiId]))!.id;
    yonetici = await giris('sm-yonetici');
    okuyucu = await rolluKisi('sm-okuyucu', ['sayfa.smartes']);
    yetkisiz = await rolluKisi('sm-yetkisiz', ['sayfa.malzemeler']);
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });
  beforeEach(async () => {
    sahte = await sahteSmartesAc();
    simdi += 24 * 3_600_000;
    await baglanti(true);
  });
  afterEach(async () => { await sahte.kapat(); });

  test('SME-16: bağlantı kapalıyken ya da adres yokken hiçbir istek atılmaz, hiçbir şey yazılmaz', async () => {
    await baglanti(false);
    assert.deepEqual(await okumaTuru(vt(), 'is-emri-durumu', turOrtami()), { tur: 'kapali' });
    assert.deepEqual(await gonderimTuru(vt(), turOrtami()), { tur: 'kapali' });
    await baglanti(true);
    const adressiz: TurOrtami = { ...turOrtami(), istemci: null };
    assert.deepEqual(await okumaTuru(vt(), 'durus', adressiz), { tur: 'ortam-degiskeni-yok' });
    assert.equal(sahte.cagrilar.length, 0);
    assert.equal(await okumaSatiri('durus'), null);
  });

  test('SME-16: işler kapalı bağlantıda "bekliyor" nedeniyle biter (sağlık ayrıntısı)', async () => {
    await baglanti(false);
    const kesfedilen = (await modulIsleriniKesfet()).map((i) => i.ad).filter((ad) => ad.startsWith('smartes-'));
    assert.deepEqual(kesfedilen.sort(), [
      'smartes-is-emri-gonderimi', 'smartes-okuma-alarm', 'smartes-okuma-ambar', 'smartes-okuma-durus', 'smartes-okuma-is-emri-durumu',
      'smartes-okuma-kalite', 'smartes-okuma-red', 'smartes-tanim-gonderimi',
    ]);
    for (const is of isler) assert.equal(await isiBirKezCalistir(vt(), is), 'bekliyor', is.ad);
  });

  test('SME-11, SME-12: üretim sayıları pencereyle okunur, SmartES kimliğiyle bir kez yazılır; kimliksiz satır sayılır', async () => {
    sahte.isleyiciler.set('WorkOrdersStatusList', () => tablo([
      { WORKORDER_STATUS_ID: '9001', WORKORDER_NO: 'IE-1', WORKSTATION_CODE: 'TST', OK: '10', RED: '1', START_DATETIME: '2026-10-12T08:00:00' },
      { WORKORDER_NO: 'kimliksiz' },
    ]));
    assert.deepEqual(await okumaTuru(vt(), 'is-emri-durumu', turOrtami()), { tur: 'okundu', okunan: 2, kimliksiz: 1 });
    const [c] = sahte.cagrilar;
    assert.equal(c?.parametreler['WorkorderStatusFilter'], 'All');
    assert.equal(c?.parametreler['IncludeActives'], 'true');
    assert.match(c?.parametreler['StartDatetime'] ?? '', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/);
    assert.deepEqual(await isEmriDurumu(9001), { saglam: 10, red: 1 });
    const ilk = await okumaSatiri('is-emri-durumu');
    assert.equal(ilk?.son_bitis?.getTime(), simdi, 'ilk pencere son 24 saattir, bugüne kadar');
    assert.equal(ilk?.kimliksiz, 1);

    // Aynı kayıt sayısı artmış hâliyle yeniden gelir: tek satır, sayılar güncel; pencere 15 dk örtüşmeyle sürer.
    simdi += 5 * 60_000;
    sahte.isleyiciler.set('WorkOrdersStatusList', () => tablo([{ WORKORDER_STATUS_ID: '9001', OK: '25', RED: '2' }]));
    await okumaTuru(vt(), 'is-emri-durumu', turOrtami());
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM smartes_is_emri_durumu WHERE smartes_id = 9001'))?.n, 1);
    assert.deepEqual(await isEmriDurumu(9001), { saglam: 25, red: 2 });
    const ikinciBas = sahte.cagrilar[1]?.parametreler['StartDatetime'];
    assert.ok(ikinciBas !== undefined && ikinciBas < (sahte.cagrilar[0]?.parametreler['EndDatetime'] ?? ''), 'pencere öncekinin sonundan geriden başlar');
  });

  test('SME-11 (ret): okuma hatasında pencere ilerlemez, satır yazılmaz, neden saklanır', async () => {
    sahte.isleyiciler.set('DownTimeStatusListWithoutWorkOrder', () => tablo([
      { ID: '501', MACHINE_CODE: 'M1', DOWNTIME_NAME: 'Malzeme bekleme', START_DATETIME: '2026-10-12T09:00:00' },
    ]));
    await okumaTuru(vt(), 'durus', turOrtami());
    // Belgedeki parametre adları (md. 91): büyük harf ve alt çizgi; süren duruş da istenir.
    assert.deepEqual(Object.keys(sahte.cagrilar[0]?.parametreler ?? {}), ['START_DATETIME', 'END_DATETIME', 'WORKSTATION_CODE', 'MACHINE_CODE', 'INCLUDE_ACTIVES']);
    assert.equal(sahte.cagrilar[0]?.parametreler['INCLUDE_ACTIVES'], 'true');
    assert.deepEqual(await vt().tek('SELECT makine_kodu, neden_kodu, is_emri_no FROM smartes_durus WHERE smartes_id = 501'),
      { makine_kodu: 'M1', neden_kodu: 'Malzeme bekleme', is_emri_no: null });
    const once = await okumaSatiri('durus');
    simdi += 15 * 60_000;
    sahte.isleyiciler.set('DownTimeStatusListWithoutWorkOrder', () => ({ tur: 'fault', ileti: 'Timeout expired' }));
    const r = await okumaTuru(vt(), 'durus', turOrtami());
    assert.deepEqual(r, { tur: 'hata', ileti: 'SmartES hatası: Timeout expired' });
    const sonra = await okumaSatiri('durus');
    assert.equal(sonra?.son_sonuc, 'hata');
    assert.equal(sonra?.son_bitis?.getTime(), once?.son_bitis?.getTime());
    assert.equal((await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM smartes_durus'))?.n, 1);
  });

  // ActiveMachinesList: iki makine; kimliği bozuk satır atlanır (AlarmsList'e MachineID olmadan gidilmez).
  const makineler = (): void => {
    sahte.isleyiciler.set('ActiveMachinesList', () => tablo([{ ID: '3', KOD: 'M1' }, { ID: '4', KOD: 'M2' }, { ID: 'x', KOD: 'BOZUK' }]));
  };
  const alarmCagrilari = () => sahte.cagrilar.filter((c) => c.metot === 'AlarmsList');
  const alarmSayisi = async () => (await vt().tek<{ n: number }>('SELECT count(*)::int AS n FROM smartes_alarm'))!.n;

  test('SME-12: alarm makine başına okunur; satır makine, alarm no ve başlangıçla tekildir, bitişi güncellenir; ham satır saklanır', async () => {
    makineler();
    const alarm = (bitis?: string) => ({ ALARMTYPE: 'EX', ALARMNO: '1001', ALARMTEXT: 'Kapak açık', START_DATETIME: '2026-10-12T09:00:00', ...(bitis ? { END_DATETIME: bitis } : {}) });
    sahte.isleyiciler.set('AlarmsList', (p) => tablo(p['MachineID'] === '3' ? [alarm(), { ALARMNO: '7' }] : [alarm()]));
    const once = await alarmSayisi();
    assert.deepEqual(await okumaTuru(vt(), 'alarm', turOrtami()), { tur: 'okundu', okunan: 3, kimliksiz: 1 });
    assert.deepEqual(sahte.cagrilar.map((c) => c.metot), ['ActiveMachinesList', 'AlarmsList', 'AlarmsList']);
    assert.deepEqual(alarmCagrilari().map((c) => [c.parametreler['MachineID'], Object.keys(c.parametreler)]),
      [['3', ['MachineID', 'StartDatetime', 'EndDatetime']], ['4', ['MachineID', 'StartDatetime', 'EndDatetime']]]);
    // Aynı alarm iki makinede: iki kayıt; başlangıcı olmayan satır kimliksizdir.
    assert.equal(await alarmSayisi(), once + 2);
    const a = await vt().tek<{ alarm_kodu: string; aciklama: string; bitis: Date | null; ham: Record<string, string> }>(
      "SELECT alarm_kodu, aciklama, bitis, ham FROM smartes_alarm WHERE makine_kodu = 'M1' AND alarm_kodu = '1001'");
    assert.equal(a?.aciklama, 'Kapak açık');
    assert.equal(a?.bitis, null);
    assert.equal(a?.ham['ALARMTYPE'], 'EX');
    assert.equal(a?.ham['MACHINE_ID'], '3');

    // Biten alarm yeniden gelir: yeni kayıt açılmaz, bitiş yazılır.
    simdi += 15 * 60_000;
    sahte.isleyiciler.set('AlarmsList', (p) => tablo(p['MachineID'] === '3' ? [alarm('2026-10-12T09:05:00')] : []));
    assert.equal((await okumaTuru(vt(), 'alarm', turOrtami())).tur, 'okundu');
    assert.equal(await alarmSayisi(), once + 2);
    const b = await vt().tek<{ bitis: Date | null }>(
      "SELECT bitis FROM smartes_alarm WHERE makine_kodu = 'M1' AND alarm_kodu = '1001'");
    assert.ok(b?.bitis instanceof Date, 'bitiş güncellenir');
  });

  test('SME-12 (ret): bir makinenin alarm okuması düşerse pencere ilerlemez, öteki makinenin satırı da yazılmaz; makine listesi düşerse alarm istenmez', async () => {
    makineler();
    await vt().sorgu("DELETE FROM smartes_okuma WHERE kaynak = 'alarm'");
    const once = await alarmSayisi();
    sahte.isleyiciler.set('AlarmsList', (p) => (p['MachineID'] === '4'
      ? { tur: 'fault', ileti: 'Timeout expired' }
      : tablo([{ ALARMNO: '55', START_DATETIME: '2026-10-12T09:30:00' }])));
    assert.deepEqual(await okumaTuru(vt(), 'alarm', turOrtami()), { tur: 'hata', ileti: 'SmartES hatası: Timeout expired' });
    assert.equal(await alarmSayisi(), once);
    assert.equal((await okumaSatiri('alarm'))?.son_bitis, null);

    sahte.cagrilar.length = 0;
    sahte.isleyiciler.set('ActiveMachinesList', () => ({ tur: 'fault', ileti: 'Makine listesi yok' }));
    assert.equal((await okumaTuru(vt(), 'alarm', turOrtami())).tur, 'hata');
    assert.deepEqual(sahte.cagrilar.map((c) => c.metot), ['ActiveMachinesList']);
  });

  // Pencere uzunluğu (dk): SmartES saatiyle yazılmış iki ofsetsiz zamanın farkı.
  const pencereDk = (c: { parametreler: Record<string, string> }): number =>
    (Date.parse(`${c.parametreler['EndDatetime']}Z`) - Date.parse(`${c.parametreler['StartDatetime']}Z`)) / 60_000;

  test('SME-19: kalıcı okuma hatasında pencere yarıya iner (en az 5 dk); SmartES hatası pencereyi hiç atlatmaz (KD-044)', async () => {
    sahte.isleyiciler.set('ActiveMachinesList', () => tablo([{ ID: '3', KOD: 'M1' }]));
    await vt().sorgu("DELETE FROM smartes_okuma WHERE kaynak = 'alarm'");
    sahte.isleyiciler.set('AlarmsList', () => ({ tur: 'fault', ileti: 'Timeout expired' }));
    const o = turOrtami();
    for (let i = 0; i < 15; i++) assert.equal((await okumaTuru(vt(), 'alarm', o)).tur, 'hata');
    const uzunluklar = alarmCagrilari().map(pencereDk);
    assert.deepEqual(uzunluklar.slice(0, 8), [1440, 720, 360, 180, 90, 45, 22.5, 11.25]);
    assert.deepEqual(uzunluklar.slice(9), [5, 5, 5, 5, 5, 5]);
    const satir = await okumaSatiri('alarm');
    assert.equal(satir?.son_bitis, null);
    assert.equal(satir?.son_sonuc, 'hata');
  });

  test('SME-19: asgari pencerede süren bozuk cevap pencereyi atlatır, atlama görünür; sonraki okuma atlanan pencereye örtüşmez', async () => {
    sahte.isleyiciler.set('ActiveMachinesList', () => tablo([{ ID: '3', KOD: 'M1' }]));
    await vt().sorgu("DELETE FROM smartes_okuma WHERE kaynak = 'alarm'");
    sahte.isleyiciler.set('AlarmsList', () => ({ tur: 'http', durum: 200, govde: 'xml değil' }));
    const o = turOrtami();
    const sonuclar: string[] = [];
    for (let i = 0; i < 12; i++) sonuclar.push((await okumaTuru(vt(), 'alarm', o)).tur);
    assert.deepEqual(sonuclar, [...Array<string>(11).fill('hata'), 'atlandi']);
    const atlanan = alarmCagrilari().at(-1);
    assert.equal(atlanan && pencereDk(atlanan), 5);
    const satir = await okumaSatiri('alarm');
    assert.equal(satir?.son_sonuc, 'hata');
    assert.match(satir?.son_hata ?? '', /^Okunamayan pencere atlandı/);
    assert.equal(satir?.son_bitis?.getTime(), simdi - 24 * 3_600_000 + 5 * 60_000);

    sahte.isleyiciler.set('AlarmsList', () => tablo([{ ALARMNO: '2', START_DATETIME: '2026-10-12T09:00:00' }]));
    assert.equal((await okumaTuru(vt(), 'alarm', o)).tur, 'okundu');
    const sonraki = alarmCagrilari().at(-1);
    assert.equal(sonraki?.parametreler['StartDatetime'], atlanan?.parametreler['EndDatetime']);
    assert.equal((await okumaSatiri('alarm'))?.son_sonuc, 'tamam');
  });

  test('SME-19: yasak karakter başvurusu (&#x0;) cevabı düşürmez; alan U+FFFD ile yazılır', async () => {
    sahte.isleyiciler.set('ActiveMachinesList', () => tablo([{ ID: '9', KOD: 'M9' }]));
    const govde = tabloCevapMetni('AlarmsList', [{ ALARMNO: '79', ALARMTEXT: 'YER', START_DATETIME: '2026-10-12T09:00:00' }]).replace('YER', 'A&#x0;B');
    sahte.isleyiciler.set('AlarmsList', () => ({ tur: 'http', durum: 200, govde }));
    assert.equal((await okumaTuru(vt(), 'alarm', turOrtami())).tur, 'okundu');
    assert.equal((await vt().tek<{ aciklama: string }>("SELECT aciklama FROM smartes_alarm WHERE makine_kodu = 'M9' AND alarm_kodu = '79'"))?.aciklama, 'A�B');
  });

  test('SME-13 (346 a): TMI "ERP\'ye aktarıldı" işaretini hiç koymaz; hiçbir iş ve tur SetErpOkRed çağırmaz, yasak metot kalır', async () => {
    await baglanti(true);
    sahte.isleyiciler.set('WorkOrdersStatusList', () => tablo([
      { WORKORDER_STATUS_ID: '9101', OK: '5', END_DATETIME: '2026-10-12T10:00:00' },
      { WORKORDER_STATUS_ID: '9104', OK: '4', END_DATETIME: '2026-10-12T10:00:00' },
    ]));
    sahte.isleyiciler.set('SetErpOkRed', () => ({ tur: 'skaler', etkilenen: 1 }));
    const kesfedilen = (await modulIsleriniKesfet()).map((i) => i.ad);
    assert.equal(kesfedilen.includes('smartes-isaret'), false);
    // İşler ortam değişkenindeki gerçek istemciyi kullanır; sahte SmartES'e giden turlar doğrudan koşulur.
    for (let tur = 0; tur < 3; tur++) {
      const o = turOrtami();
      for (const k of ['is-emri-durumu', 'durus', 'alarm'] as const) await okumaTuru(vt(), k, o);
      for (const k of KALITE_AMBAR_KAYNAKLARI) await kaliteAmbarTuru(vt(), k, o);
      await gonderimTuru(vt(), o);
      await tanimTuru(vt(), o);
      simdi += 10 * 60_000;
    }
    assert.ok(sahte.cagrilar.some((c) => c.metot === 'WorkOrdersStatusList'), 'okuma koştu: bitmiş kayıt geldi');
    assert.deepEqual(sahte.cagrilar.filter((c) => c.metot === 'SetErpOkRed'), []);
    assert.equal(yasakMetotMu('SetErpOkRed'), true);
  });

  test('SME-17: eşleme yazma yetki, tekil kod ve sürümle; okuyucu okur ama yazamaz', async () => {
    const a = await istasyonAc();
    const b = await istasyonAc();
    const ata = (g: object, c = yonetici) => istek('POST', '/smartes/eslemeler/ata', g, c);
    const r1 = await ata({ tur: 'istasyon', tmiId: a, smartesKod: 'TIA', surum: null });
    assert.equal(r1.statusCode, 200, r1.body);
    assert.deepEqual(r1.json(), { tmiId: a, smartesKod: 'TIA', surum: 1 });
    // Aynı kod başka istasyona verilmez; yeni eşlemenin üstüne sürümsüz yazılmaz; eski sürüm reddedilir.
    assert.equal((await ata({ tur: 'istasyon', tmiId: b, smartesKod: 'TIA', surum: null })).statusCode, 409);
    assert.equal((await ata({ tur: 'istasyon', tmiId: a, smartesKod: 'TIB', surum: null })).statusCode, 409);
    const r2 = await ata({ tur: 'istasyon', tmiId: a, smartesKod: 'TIB', surum: 1 });
    assert.equal(r2.statusCode, 200, r2.body);
    assert.equal((await ata({ tur: 'istasyon', tmiId: a, smartesKod: 'TIC', surum: 1 })).statusCode, 409);
    // Olmayan TMI kaydı, boş kod.
    assert.equal((await ata({ tur: 'istasyon', tmiId: 999999, smartesKod: 'X', surum: null })).statusCode, 404);
    assert.equal((await ata({ tur: 'istasyon', tmiId: b, smartesKod: '  ', surum: null })).statusCode, 400);
    // Okuyucu listeyi görür, yazamaz; sayfası olmayan göremez.
    const liste = await istek('GET', '/smartes/eslemeler?tur=istasyon', undefined, okuyucu);
    assert.equal(liste.statusCode, 200, liste.body);
    const satir = (liste.json() as { satirlar: { tmiId: number; smartesKod: string | null; surum: number | null }[] }).satirlar.find((s) => s.tmiId === a);
    assert.deepEqual(satir && { k: satir.smartesKod, s: satir.surum }, { k: 'TIB', s: 2 });
    assert.equal((await ata({ tur: 'istasyon', tmiId: b, smartesKod: 'Y', surum: null }, okuyucu)).statusCode, 403);
    assert.equal((await istek('GET', '/smartes/eslemeler?tur=istasyon', undefined, yetkisiz)).statusCode, 403);
    // Kaldırma sürümle.
    assert.equal((await istek('POST', '/smartes/eslemeler/kaldir', { tur: 'istasyon', tmiId: a, surum: 1 })).statusCode, 409);
    assert.equal((await istek('POST', '/smartes/eslemeler/kaldir', { tur: 'istasyon', tmiId: a, surum: 2 })).statusCode, 200);
    assert.equal((await istek('POST', '/smartes/eslemeler/kaldir', { tur: 'istasyon', tmiId: a, surum: 2 })).statusCode, 404);
    assert.equal((await istek('POST', '/smartes/eslemeler/kaldir', { tur: 'istasyon', tmiId: b, surum: 1 }, okuyucu)).statusCode, 403);
  });

  // Rotalı emir: iki adım; ilk adımın istasyonu SmartES eşlemeli, ikincininki `ikinciEslemeli` değilse eşlemesiz.
  async function emirKur(ikinciEslemeli = false): Promise<{ uretimEmriId: number; ilk: number; ikinci: number }> {
    const sahip = ortam!.sahip;
    const eslemeli = await istasyonAc();
    const diger = await istasyonAc();
    const makine = async (ist: number) => (await sahip.tek<{ id: number }>('INSERT INTO makine (kod, ad, istasyon_id) VALUES ($1, $2, $3) RETURNING id',
      [`SMK${(sayac += 1)}`, 'Tezgah', ist]))!.id;
    const [m1, m2] = [await makine(eslemeli), await makine(diger)];
    const ata = async (tur: string, tmiId: number, smartesKod: string) =>
      assert.equal((await istek('POST', '/smartes/eslemeler/ata', { tur, tmiId, smartesKod, surum: null })).statusCode, 200);
    await ata('istasyon', eslemeli, `TI${sayac}`);
    await ata('makine', m1, `CNC${sayac}`);
    if (ikinciEslemeli) await ata('istasyon', diger, `TJ${sayac}`);
    const tip = (await sahip.tek<{ id: number }>('INSERT INTO istasyonlar_operasyon_tipi (kod, ad, grup) VALUES ($1, $2, $3) RETURNING id', [`ST${(sayac += 1)}`, 'Frezeleme', 'TAL']))!.id;
    await sahip.sorgu("INSERT INTO malzeme_katalog_kod_sirasi (onek, son_sira) VALUES ('SMS-', 0) ON CONFLICT (onek) DO NOTHING");
    const kart = (await sahip.tek<{ no: number }>(
      `INSERT INTO malzeme_katalog_karti (kimlik, tur, onek, sira_no, onay_durumu, kayit, acan_kisi_id, guncelleyen_kisi_id)
       VALUES ($1, 'mamul', 'SMS-', $2, 'aktif', $3, $4, $4) RETURNING no`,
      [`sms-${sayac}`, sayac, JSON.stringify({ id: `sms-${sayac}`, com: { ad: 'Halka & flanş' } }), yoneticiId],
    ))!.no;
    await sahip.sorgu("INSERT INTO rota_revizyonu (malzeme_id, malzeme_turu, harf, acan_kisi_id) VALUES ($1, 'mamul', 'A', $2)", [kart, yoneticiId]);
    const revizyon = (await sahip.tek<{ id: number }>("SELECT id FROM rota_revizyonu WHERE malzeme_id = $1 AND harf = 'A'", [kart]))!.id;
    const adim = (sira: number, makineId: number) => ({
      sira, opNo: sira * 10, ad: `Adım ${sira}`, operasyonTipiId: tip, kaynak: { tur: 'makine' as const, id: makineId }, ayarSuresiDk: '12.5', birimSureDk: '1.5',
      terminGun: null, bagimlilik: 'bekleyen' as const, devirAdedi: null, talimatSurumu: null, kontrolListesi: [],
    });
    const { uretimEmriId, isEmriIdleri } = await vt().tx(async (db) => uretimEmriAc(db, (await kullaniciYukle(db, yoneticiId))!, {
      projeId: denemeProjeId, malzemeNo: kart, adet: 20, teslim: '2026-12-01', kaynakRotaRevizyonId: revizyon, isEmirleri: [adim(1, m1), adim(2, m2)],
    }));
    const [ilk, ikinci] = isEmriIdleri as [number, number];
    return { uretimEmriId, ilk, ikinci };
  }
  const iptalEt = (id: number) => vt().tx(async (db) => emirIptalEt(db, (await kullaniciYukle(db, yoneticiId))!, id));

  test('SME-14, SME-15: eşlemeli istasyondaki iş emri SmartES\'e gider, değişmeyen yeniden gitmez, iptal edilen pasif olur', async () => {
    const { uretimEmriId, ilk, ikinci } = await emirKur();
    const r = await gonderimTuru(vt(), turOrtami());
    assert.deepEqual(r, { tur: 'islendi', gonderilen: 1, kapanan: 0, hatali: 0 });
    assert.deepEqual(sahte.cagrilar.map((c) => c.metot), ['OperationCreateUpdate', 'WorkOrdersCreateUpdate']);
    assert.deepEqual(sahte.cagrilar[0]!.parametreler,
      { ID: '0', Code: '10', Name: 'Adım 1', WorkstationCode: `TI${sayac - 1}`, IsPassive: 'false', IsQualityControl: 'false' });
    const p = sahte.cagrilar[1]!.parametreler;
    // Belgedeki adlar ve sıra (md. 39): çarpan "Multipler", QuantityUpdate TrackingNo ile RouteCode arasında; ilk gönderimde adet değişikliği yok.
    assert.equal(p['Multipler'], '1');
    assert.equal('Multiplier' in p, false);
    assert.deepEqual(Object.keys(p).slice(-3), ['TrackingNo', 'QuantityUpdate', 'RouteCode']);
    assert.equal(p['QuantityUpdate'], 'false');
    assert.equal(p['WorkstationCode'], `TI${sayac - 1}`);
    assert.equal(p['MachineCode'], `CNC${sayac - 1}`);
    assert.equal(p['OperationCode'], '10');
    assert.equal(p['ErpID'], String(ilk));
    assert.equal(p['Quantity'], '20');
    assert.equal(p['EstimatedPreparationTime'], '13');
    assert.equal(p['EstimatedRunTime'], '30');
    assert.equal(p['StockDescription'], 'Halka & flanş');
    assert.equal(p['DeliveryDatetime'], '2026-12-01T00:00:00');
    assert.equal(p['IsPassive'], 'false');
    assert.equal(sahte.cagrilar.some((c) => c.parametreler['ErpID'] === String(ikinci)), false, 'eşlemesiz istasyon gitmez');

    // Değişmeyen iş emri yeniden gönderilmez.
    sahte.cagrilar.length = 0;
    assert.deepEqual(await gonderimTuru(vt(), turOrtami()), { tur: 'islendi', gonderilen: 0, kapanan: 0, hatali: 0 });
    assert.equal(sahte.cagrilar.length, 0);

    // Adet değişir: QuantityUpdate true ile yeniden gider; sonraki turda (değişiklik yok) bir daha gitmez.
    await ortam!.sahip.sorgu('UPDATE uretim_emri SET adet = 25 WHERE id = $1', [uretimEmriId]);
    assert.deepEqual(await gonderimTuru(vt(), turOrtami()), { tur: 'islendi', gonderilen: 1, kapanan: 0, hatali: 0 });
    const degisen = sahte.cagrilar.find((c) => c.metot === 'WorkOrdersCreateUpdate')!.parametreler;
    assert.deepEqual([degisen['Quantity'], degisen['QuantityUpdate']], ['25', 'true']);

    // Adet yine değişir, SmartES reddeder: son başarılı özet korunur, bekleme dolunca yeniden deneme de QuantityUpdate true taşır.
    await ortam!.sahip.sorgu('UPDATE uretim_emri SET adet = 24 WHERE id = $1', [uretimEmriId]);
    sahte.isleyiciler.set('WorkOrdersCreateUpdate', () => ({ tur: 'skaler', etkilenen: 0, hata: 'Kilitli' }));
    assert.deepEqual(await gonderimTuru(vt(), turOrtami()), { tur: 'islendi', gonderilen: 0, kapanan: 0, hatali: 1 });
    simdi += 2 * 60_000;
    sahte.isleyiciler.delete('WorkOrdersCreateUpdate');
    sahte.cagrilar.length = 0;
    assert.deepEqual(await gonderimTuru(vt(), turOrtami()), { tur: 'islendi', gonderilen: 1, kapanan: 0, hatali: 0 });
    const yeniden = sahte.cagrilar.find((c) => c.metot === 'WorkOrdersCreateUpdate')!.parametreler;
    assert.deepEqual([yeniden['Quantity'], yeniden['QuantityUpdate']], ['24', 'true']);
    await ortam!.sahip.sorgu('UPDATE uretim_emri SET adet = 25 WHERE id = $1', [uretimEmriId]);
    assert.equal((await gonderimTuru(vt(), turOrtami())).tur, 'islendi');
    sahte.cagrilar.length = 0;
    assert.deepEqual(await gonderimTuru(vt(), turOrtami()), { tur: 'islendi', gonderilen: 0, kapanan: 0, hatali: 0 });
    assert.equal(sahte.cagrilar.length, 0);

    // İptal edilen emrin gönderilmiş iş emri pasif olarak kapatılır; silme çağrılmaz.
    await iptalEt(uretimEmriId);
    const k = await gonderimTuru(vt(), turOrtami());
    assert.deepEqual(k, { tur: 'islendi', gonderilen: 0, kapanan: 1, hatali: 0 });
    const kapanis = sahte.cagrilar.find((c) => c.metot === 'WorkOrdersCreateUpdate')!.parametreler;
    assert.equal(kapanis['ErpID'], String(ilk));
    assert.equal(kapanis['IsPassive'], 'true');
    assert.equal(kapanis['IsDone'], 'false');
    assert.equal(kapanis['Quantity'], '25');
    assert.equal(kapanis['QuantityUpdate'], 'false');
    assert.deepEqual(Object.keys(kapanis), Object.keys(p), 'kapanış aynı parametrelerle, belgedeki sırada gider');
    assert.equal(sahte.cagrilar.some((c) => /Delete/.test(c.metot)), false);
    assert.equal((await vt().tek<{ durum: string }>('SELECT durum FROM smartes_giden WHERE is_emri_id = $1', [ilk]))?.durum, 'kapandi');
    // Kapanmış iş emri bir daha gönderilmez.
    sahte.cagrilar.length = 0;
    await gonderimTuru(vt(), turOrtami());
    assert.equal(sahte.cagrilar.length, 0);
  });

  test('SME-14 (ret): SmartES reddederse hata ve bekleme yazılır, süre dolmadan yinelenmez; ağ hatası turu durdurur', async () => {
    const { uretimEmriId, ilk, ikinci } = await emirKur(true);
    sahte.isleyiciler.set('WorkOrdersCreateUpdate', () => ({ tur: 'skaler', etkilenen: 0, hata: 'İstasyon tanımsız' }));
    assert.deepEqual(await gonderimTuru(vt(), turOrtami()), { tur: 'islendi', gonderilen: 0, kapanan: 0, hatali: 2 });
    const g = await vt().tek<{ durum: string; son_hata: string; sonraki_deneme: Date }>('SELECT durum, son_hata, sonraki_deneme FROM smartes_giden WHERE is_emri_id = $1', [ilk]);
    assert.equal(g?.durum, 'hata');
    assert.equal(g?.son_hata, 'SmartES reddetti: İstasyon tanımsız');
    assert.equal(g?.sonraki_deneme.getTime(), simdi + 60_000);
    sahte.cagrilar.length = 0;
    await gonderimTuru(vt(), turOrtami());
    assert.equal(sahte.cagrilar.length, 0, 'bekleme dolmadan yinelenmez');

    // Bekleme dolar, bağlantı kopar: ilk iş emrinde tur durur, ikinciye istek gitmez.
    simdi += 2 * 60_000;
    sahte.isleyiciler.set('WorkOrdersCreateUpdate', () => ({ tur: 'kopar' }));
    const r = await gonderimTuru(vt(), turOrtami());
    assert.deepEqual(r, { tur: 'islendi', gonderilen: 0, kapanan: 0, hatali: 1 });
    const erpIdleri = new Set(sahte.cagrilar.filter((c) => c.metot === 'WorkOrdersCreateUpdate').map((c) => c.parametreler['ErpID']));
    assert.equal(erpIdleri.size, 1);
    assert.equal(erpIdleri.has(String(ikinci)) && erpIdleri.has(String(ilk)), false);
    await iptalEt(uretimEmriId);
  });

  // Testin verdiği tx ile aynı veritabanı: işin transaction'ları izlenir ya da kesilir.
  const txSarmali = (tx: <T>(is: (db: Db) => Promise<T>) => Promise<T>): Veritabani => ({ ...vt(), tx });

  test('borç 405: SmartES isteği beklenirken işin hiçbir transaction\'ı açık değildir (okuma, işaret, gönderim)', async () => {
    const pidler = new Set<number>();
    const izli = txSarmali((is) => vt().tx(async (db) => {
      pidler.add((await db.tek<{ pid: number }>('SELECT pg_backend_pid() AS pid'))!.pid);
      return is(db);
    }));
    const acik: string[] = [];
    // Cevap verilmeden önce, ayrı bağlantıdan: işin transaction açtığı bağlantılardan hiçbiri transaction içinde olmamalı.
    sahte.cagriOncesi = async (cagri) => {
      const satirlar = await vt().sorgu<{ pid: number; state: string }>(
        'SELECT pid, state FROM pg_stat_activity WHERE pid = ANY($1::int[]) AND pid <> pg_backend_pid() AND xact_start IS NOT NULL', [[...pidler]]);
      for (const r of satirlar) acik.push(`${cagri.metot}: ${r.state}`);
    };
    sahte.isleyiciler.set('WorkOrdersStatusList', () => tablo([{ WORKORDER_STATUS_ID: '9201', OK: '2', END_DATETIME: '2026-10-12T10:00:00' }]));
    const o = turOrtami();
    assert.equal((await okumaTuru(izli, 'is-emri-durumu', o)).tur, 'okundu');
    const { uretimEmriId } = await emirKur();
    assert.equal((await gonderimTuru(izli, o)).tur, 'islendi');
    await iptalEt(uretimEmriId);
    assert.equal((await gonderimTuru(izli, o)).tur, 'islendi');
    const metotlar = new Set(sahte.cagrilar.map((c) => c.metot));
    for (const m of ['WorkOrdersStatusList', 'OperationCreateUpdate', 'WorkOrdersCreateUpdate']) assert.ok(metotlar.has(m), m);
    assert.equal(metotlar.has('SetErpOkRed'), false);
    assert.ok(pidler.size > 0);
    assert.deepEqual(acik, []);
  });

  test('borç 405: istekten sonra sonuç yazılamazsa sonraki tur sonucu isteği yinelemeden yazar; son durum kesintisiz turla aynıdır', async () => {
    const { uretimEmriId, ilk } = await emirKur();
    let kes = false;
    const kesintili = txSarmali((is) => {
      if (!kes) return vt().tx(is);
      kes = false;
      return Promise.reject(new Error('sonuç yazılırken kesinti'));
    });
    sahte.cagriOncesi = async (cagri) => { if (cagri.metot === 'WorkOrdersCreateUpdate') kes = true; };
    const o = turOrtami();
    const giden = () => vt().tek<{ durum: string; deneme_sayisi: number; ardisik_hata: number; ozet: string | null; son_deneme: Date }>(
      'SELECT durum, deneme_sayisi, ardisik_hata, ozet, son_deneme FROM smartes_giden WHERE is_emri_id = $1', [ilk]);
    const isEmriCagrilari = () => sahte.cagrilar.filter((c) => c.metot === 'WorkOrdersCreateUpdate' && c.parametreler['ErpID'] === String(ilk)).length;

    await assert.rejects(gonderimTuru(kesintili, o), /kesinti/);
    assert.equal(isEmriCagrilari(), 1);
    assert.equal(await giden(), null, 'sonuç henüz yazılmadı');

    // Sonraki tur önce bekleyen sonucu yazar; iş emri değişmediği için istek gitmez.
    sahte.cagriOncesi = null;
    assert.deepEqual(await gonderimTuru(vt(), o), { tur: 'islendi', gonderilen: 0, kapanan: 0, hatali: 0 });
    assert.equal(isEmriCagrilari(), 1, 'istek yinelenmez');
    const g = await giden();
    assert.deepEqual(g && { durum: g.durum, deneme: g.deneme_sayisi, ardisik: g.ardisik_hata, ozetVar: g.ozet !== null, zaman: g.son_deneme.getTime() },
      { durum: 'gonderildi', deneme: 1, ardisik: 0, ozetVar: true, zaman: simdi });
    assert.equal(o.bekleyenler.get('gonderim')?.length, 0);
    await gonderimTuru(vt(), o);
    assert.equal(isEmriCagrilari(), 1);
    await iptalEt(uretimEmriId);
  });

  test('SME-18: durum, listeler ve menü sayaçları sayfa işlemiyle okunur', async () => {
    const d = await istek('GET', '/smartes/durum', undefined, okuyucu);
    assert.equal(d.statusCode, 200, d.body);
    const durum = d.json() as { baglanti: string; sayilar: { isEmriDurumu: number } };
    assert.equal(durum.baglanti, 'ortam-degiskeni-yok', 'testte adres değişkeni yok');
    assert.ok(durum.sayilar.isEmriDurumu >= 1);
    for (const yol of ['/smartes/is-emri-durumlari', '/smartes/duruslar', '/smartes/alarmlar', '/smartes/giden']) {
      const c = await istek('GET', `${yol}?sayfa=1`, undefined, okuyucu);
      assert.equal(c.statusCode, 200, `${yol}: ${c.body}`);
      assert.equal((await istek('GET', yol, undefined, yetkisiz)).statusCode, 403, yol);
    }
    const sayac1 = await istek('GET', '/smartes/menu-sayaclari', undefined, okuyucu);
    assert.equal(typeof (sayac1.json() as Record<string, unknown>)['is-emri-durumlari'], 'number');
    assert.deepEqual((await istek('GET', '/smartes/menu-sayaclari', undefined, yetkisiz)).json(), {});
  });
});
