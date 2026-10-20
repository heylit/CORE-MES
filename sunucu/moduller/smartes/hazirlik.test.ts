import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';
import type { FastifyInstance } from 'fastify';
import { testVeritabaniKur } from '#cekirdek/test-vt.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { uygulamaKur } from '#cekirdek/uygulama.ts';
import type { SmartesHazirlikCevabi, SmartesKontrolCevabi } from '#paylasilan/sozlesme/smartes.ts';
import { denetimYaz } from '../denetim/disari.ts';
import { yoneticiOlustur } from '../kisiler/disari.ts';
import { kimlikCozucu } from '../oturum/disari.ts';
import { smartesIstemcisiKur } from './istemci.ts';
import type { SmartesIstemcisi } from './istemci.ts';
import { eksikMetotlar, GEREKLI_METOTLAR, ISTEGE_BAGLI_METOTLAR, smartesAkisDurumu } from './kurallar.ts';
import { sahteSmartesAc } from './sahte-smartes.ts';
import type { SahteSmartes } from './sahte-smartes.ts';
import { hazirlik, kontrol } from './servis.ts';
import { wsdlMetotlari } from './soap.ts';

const PAROLA = 'dogru-parola-1';
const anindaBekle = async (): Promise<void> => {};
const kur = (s: SahteSmartes): SmartesIstemcisi =>
  smartesIstemcisiKur({ adres: s.adres, adAlani: 'http://tempuri.org/' }, { bekle: anindaBekle, istekSuresiMs: 3000, listeSuresiMs: 3000 });

describe('SME-H1 akış durumu', () => {
  test('kod bağlı, adres tanımlı ve anahtar açıksa hazır; değilse nedeni', () => {
    assert.equal(smartesAkisDurumu({ kaynak: 'bagli' }, { ortamVar: true, acik: true }), 'hazir');
    assert.equal(smartesAkisDurumu({ kaynak: 'bagli' }, { ortamVar: true, acik: false }), 'kapali');
    assert.equal(smartesAkisDurumu({ kaynak: 'bagli' }, { ortamVar: false, acik: true }), 'ayar-eksik');
    assert.equal(smartesAkisDurumu({ kaynak: 'baglanmadi' }, { ortamVar: true, acik: true }), 'baglanmadi');
    assert.equal(smartesAkisDurumu({ kaynak: 'kodda-yok' }, { ortamVar: true, acik: true }), 'kodda-yok');
  });
  test('WSDL metot adları portType altından okunur; eksik metot listelenir', () => {
    const metin = '<?xml version="1.0"?><wsdl:definitions xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/"><wsdl:types/>'
      + '<wsdl:portType name="A"><wsdl:operation name="DownTimeList"/><wsdl:operation name="AlarmsList"/></wsdl:portType>'
      + '<wsdl:portType name="B"><wsdl:operation name="AlarmsList"/></wsdl:portType></wsdl:definitions>';
    assert.deepEqual(wsdlMetotlari(metin), ['AlarmsList', 'DownTimeList']);
    assert.deepEqual(eksikMetotlar([...GEREKLI_METOTLAR]), []);
    assert.deepEqual(eksikMetotlar(['DownTimeStatusListWithoutWorkOrder']), GEREKLI_METOTLAR.filter((m) => m !== 'DownTimeStatusListWithoutWorkOrder'));
    // Alarm makine başına okunur: makine listesi gerekli metottur; tanım listeleri (DownTimeList, RejectsList) okunmaz.
    assert.ok(GEREKLI_METOTLAR.includes('ActiveMachinesList'));
    assert.equal(GEREKLI_METOTLAR.some((m) => m === 'DownTimeList' || m === 'RejectsList'), false);
    assert.throws(() => wsdlMetotlari('<html><body>giris</body></html>'), /WSDL değil/);
  });
});

describe('SME-H2 canlı kontrol yalnız okur', () => {
  test('kabul: WSDL tamam ve son bir saatin listesi okunur; yalnız WSDL ve liste metodu çağrılır', async () => {
    const s = await sahteSmartesAc();
    try {
      s.isleyiciler.set('WorkOrdersStatusList', () => ({ tur: 'tablo', satirlar: [{ WorkorderStatusID: '1' }, { WorkorderStatusID: '2' }] }));
      const r = await kontrol(kur(s), () => new Date('2026-10-15T10:00:00Z'));
      assert.equal(r.ulasildi, true);
      assert.deepEqual(r.adimlar.map((a) => a.sonuc), ['tamam', 'tamam']);
      assert.match(r.adimlar[1]?.ileti ?? '', /2 satır okundu/);
      assert.equal(s.getIstekleri, 1);
      assert.deepEqual(s.cagrilar.map((c) => c.metot), ['WorkOrdersStatusList'], 'yazma metodu (SetErpOkRed, CreateUpdate) çağrılmaz');
      const p = s.cagrilar[0]?.parametreler ?? {};
      assert.equal(p['StartDatetime'], '2026-10-15T12:00:00');
      assert.equal(p['EndDatetime'], '2026-10-15T13:00:00', 'tarih Z\'siz, yerel saatle');
    } finally {
      await s.kapat();
    }
  });

  test('(ret) WSDL\'de gerekli metot yoksa hata ve eksik adlar yazılır; liste yine denenir', async () => {
    const s = await sahteSmartesAc();
    try {
      s.wsdlMetotlari = ['WorkOrdersStatusList'];
      s.isleyiciler.set('WorkOrdersStatusList', () => ({ tur: 'tablo', satirlar: [] }));
      const r = await kontrol(kur(s));
      assert.equal(r.adimlar[0]?.sonuc, 'hata');
      assert.match(r.adimlar[0]?.ileti ?? '', /ActiveMachinesList/);
      assert.doesNotMatch(r.adimlar[0]?.ileti ?? '', /SetErpOkRed/, 'TMI işaret metodunu istemez (346 a)');
      assert.equal(r.adimlar[1]?.sonuc, 'tamam');
    } finally {
      await s.kapat();
    }
  });

  test('isteğe bağlı metotlar (yeni akışlar) eksikse yalnız bildirilir, kontrol kırmızı olmaz; gerekli metotlar tamamdır', async () => {
    const s = await sahteSmartesAc();
    try {
      s.wsdlMetotlari = [...GEREKLI_METOTLAR];
      s.isleyiciler.set('WorkOrdersStatusList', () => ({ tur: 'tablo', satirlar: [] }));
      const r = await kontrol(kur(s));
      assert.equal(r.adimlar[0]?.sonuc, 'tamam');
      assert.match(r.adimlar[0]?.ileti ?? '', /İsteğe bağlı akışların metotları yok: .*WsWorkordersRejectStatusList.*WorkStationCreateUpdate/);
      assert.deepEqual(GEREKLI_METOTLAR.filter((m) => ISTEGE_BAGLI_METOTLAR.includes(m)), [], 'yeni metotlar gerekli listesine girmedi');
    } finally {
      await s.kapat();
    }
  });

  test('(ret) servise ulaşılamazsa liste atlanır, ileti adres taşımaz', async () => {
    const s = await sahteSmartesAc();
    const adres = s.adres;
    await s.kapat();
    const r = await kontrol(smartesIstemcisiKur({ adres, adAlani: 'http://tempuri.org/' }, { bekle: anindaBekle, istekSuresiMs: 2000 }));
    assert.equal(r.ulasildi, false);
    assert.deepEqual(r.adimlar.map((a) => a.sonuc), ['hata', 'atlandi']);
    assert.ok(!JSON.stringify(r).includes(adres));
  });

  test('(ret) liste SOAP Fault dönerse hata, ileti Fault metnini taşır', async () => {
    const s = await sahteSmartesAc();
    try {
      s.isleyiciler.set('WorkOrdersStatusList', () => ({ tur: 'fault', ileti: 'Tarih biçimi hatalı' }));
      const r = await kontrol(kur(s));
      assert.equal(r.adimlar[1]?.sonuc, 'hata');
      assert.match(r.adimlar[1]?.ileti ?? '', /Tarih biçimi hatalı/);
    } finally {
      await s.kapat();
    }
  });

  test('adres tanımlı değilse istek atılmaz', async () => {
    const r = await kontrol(null);
    assert.ok(r.adimlar.every((a) => a.sonuc === 'atlandi'));
  });
});

describe('SmartES hazırlık uçları (gerçek PostgreSQL)', () => {
  let ortam: TestVeritabani | undefined;
  let app: FastifyInstance;
  let yonetici = '';
  let ayarci = '';
  const vt = (): TestVeritabani['vt'] => {
    if (!ortam) throw new Error('Test veritabanı açılamadı (TMIV2_PG_* ve TMIV2_PG_TEST_DATABASE ayarlarını denetleyin).');
    return ortam.vt;
  };
  const giris = async (kullaniciAdi: string): Promise<string> => {
    const c = await app.inject({ method: 'POST', url: '/api/oturum/giris', payload: { kullaniciAdi, parola: PAROLA } });
    assert.equal(c.statusCode, 200, c.body);
    return String(c.headers['set-cookie']).split(';')[0] ?? '';
  };
  const oku = (yol: string, cerez: string) => app.inject({ method: 'GET', url: `/api${yol}`, headers: { cookie: cerez } });

  before(async () => {
    ortam = await testVeritabaniKur('smhaz');
    app = await uygulamaKur({ vt: ortam.vt, ayar: ortam.ayar, kimlik: kimlikCozucu(ortam.vt), denetle: denetimYaz });
    await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Yönetici', kullaniciAdi: 'sh-yonetici', parola: PAROLA }));
    const id = await vt().tx((db) => yoneticiOlustur(db, { ad: 'Deneme Ayarcı', kullaniciAdi: 'sh-ayarci', parola: PAROLA }));
    await vt().sorgu("INSERT INTO rol (kod, ad) VALUES ('sh_ayarci', 'Ayarcı')");
    await vt().sorgu("INSERT INTO rol_islemi (rol_id, islem) SELECT id, 'sayfa.ayarlar' FROM rol WHERE kod = 'sh_ayarci'");
    await vt().sorgu("UPDATE kisi_rolu SET rol_id = (SELECT id FROM rol WHERE kod = 'sh_ayarci') WHERE kisi_id = $1", [id]);
    yonetici = await giris('sh-yonetici');
    ayarci = await giris('sh-ayarci');
  });
  after(async () => { await app?.close(); await ortam?.kaldir(); });

  test('yönetici okur; adres yokken bağlı akışlar "ayar eksik", son okuma hatası görünür', async () => {
    await vt().sorgu(
      `INSERT INTO smartes_okuma (kaynak, son_bitis, son_deneme, son_sonuc, son_hata) VALUES ('durus', NULL, '2026-10-15T08:00:00Z', 'hata', 'SmartES süresinde cevap vermedi.')`,
    );
    const c = await oku('/smartes/hazirlik', yonetici);
    assert.equal(c.statusCode, 200, c.body);
    const h = c.json<SmartesHazirlikCevabi>();
    assert.deepEqual(h.ortam, { adres: null, adAlani: null });
    assert.equal(h.akislar.find((a) => a.anahtar === 'is-emri')?.durum, 'ayar-eksik');
    assert.equal(h.akislar.find((a) => a.anahtar === 'uretim-kaydi')?.durum, 'baglanmadi');
    const durus = h.akislar.find((a) => a.anahtar === 'durus');
    assert.equal(durus?.sonHata, 'SmartES süresinde cevap vermedi.');
    assert.equal(durus?.islenen, 0);
  });

  test('adres tanımlı ve anahtar açıkken bağlı akış hazır; hazırlık SmartES\'e istek atmaz (servis)', async () => {
    const s = await sahteSmartesAc();
    try {
      const a = await app.inject({ method: 'POST', url: '/api/ayarlar/smartes.baglanti/degistir', headers: { cookie: yonetici }, payload: { deger: true } });
      assert.equal(a.statusCode, 200, a.body);
      const h = await vt().okumaTx((db) => hazirlik(db, kur(s), { adres: s.adres, adAlani: 'http://tempuri.org/' }));
      assert.equal(h.baglanti, 'acik');
      assert.equal(h.akislar.find((x) => x.anahtar === 'is-emri-durumu')?.durum, 'hazir');
      assert.equal(s.cagrilar.length + s.getIstekleri, 0);
    } finally {
      await s.kapat();
    }
  });

  test('kontrol ucu yönetici için cevap verir; adres yokken atlar', async () => {
    const c = await oku('/smartes/hazirlik/kontrol', yonetici);
    assert.equal(c.statusCode, 200, c.body);
    assert.ok(c.json<SmartesKontrolCevabi>().adimlar.every((a) => a.sonuc === 'atlandi'));
  });

  test('(ret) sistem ayrıntısı yetkisi olmayan iki ucu da göremez', async () => {
    assert.equal((await oku('/smartes/hazirlik', ayarci)).statusCode, 403);
    assert.equal((await oku('/smartes/hazirlik/kontrol', ayarci)).statusCode, 403);
  });
});
