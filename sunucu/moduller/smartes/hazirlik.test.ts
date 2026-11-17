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
import { eksikMetotlar, GEREKLI_METOTLAR, ISTEGE_BAGLI_METOTLAR, kodParametreleri, parametreAdimi, parametreFarklari, smartesAkisDurumu } from './kurallar.ts';
import { sahteSmartesAc, wsdlMetni } from './sahte-smartes.ts';
import type { SahteSmartes } from './sahte-smartes.ts';
import { hazirlik, kontrol } from './servis.ts';
import { wsdlMetotlari, wsdlOku } from './soap.ts';

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

describe('3368 parametre adları WSDL ile karşılaştırılır', () => {
  const sema = (p: Record<string, readonly string[]>) => wsdlOku(wsdlMetni(Object.keys(p), p)).parametreler;
  const kod = (): Record<string, string[]> => Object.fromEntries(kodParametreleri());

  test('WSDL şemasından metot başına parametre adı ve zorunluluk okunur; şeması olmayan ve metot olmayan öğe alınmaz', () => {
    const metin = '<wsdl:definitions xmlns:wsdl="w" xmlns:s="s"><wsdl:types><s:schema>'
      + '<s:element name="AlarmsList"><s:complexType><s:sequence><s:element minOccurs="1" maxOccurs="1" name="MachineID" type="s:int"/>'
      + '<s:element minOccurs="0" name="Not" type="s:string"/></s:sequence></s:complexType></s:element>'
      + '<s:element name="ActiveMachinesList"><s:complexType/></s:element>'
      + '<s:element name="AlarmsListResponse"><s:complexType><s:sequence><s:element name="AlarmsListResult"/></s:sequence></s:complexType></s:element>'
      + '</s:schema></wsdl:types><wsdl:portType name="A"><wsdl:operation name="AlarmsList"/><wsdl:operation name="ActiveMachinesList"/>'
      + '<wsdl:operation name="DownTimeList"/></wsdl:portType></wsdl:definitions>';
    const t = wsdlOku(metin);
    assert.deepEqual(t.metotlar, ['ActiveMachinesList', 'AlarmsList', 'DownTimeList']);
    assert.deepEqual([...t.parametreler.keys()].sort(), ['ActiveMachinesList', 'AlarmsList']);
    assert.deepEqual(t.parametreler.get('AlarmsList'), [{ ad: 'MachineID', zorunlu: true }, { ad: 'Not', zorunlu: false }]);
    assert.deepEqual(t.parametreler.get('ActiveMachinesList'), []);
  });

  test('kodun çağırdığı bütün gerekli ve isteğe bağlı metotlar denetime girer', () => {
    const adlar = [...kodParametreleri().keys()];
    for (const m of [...GEREKLI_METOTLAR, ...ISTEGE_BAGLI_METOTLAR]) assert.ok(adlar.includes(m), m);
    assert.deepEqual(kodParametreleri().get('ActiveMachinesList'), []);
    assert.ok(kodParametreleri().get('WorkOrdersCreateUpdate')?.includes('QuantityUpdate'));
  });

  test('kabul: adlar aynıysa adım tamam ve metot sayısını yazar', () => {
    const r = parametreAdimi(sema(kod()));
    assert.equal(r.sonuc, 'tamam');
    assert.equal(r.ileti, `${kodParametreleri().size} metodun parametre adları servisle aynı.`);
  });

  test('(ret) harfi farklı ad, serviste olmayan ad ve gönderilmeyen zorunlu ad ayrı satırda yazılır; adım hata olur', () => {
    const p = kod();
    p['WorkOrdersStatusList'] = (p['WorkOrdersStatusList'] ?? []).map((a) => (a === 'WorkorderStatusFilter' ? 'WorkOrderStatusFilter!' : a));
    p['WorkOrdersCreateUpdate'] = [...(p['WorkOrdersCreateUpdate'] ?? []).filter((a) => a !== 'Multipler'), 'Multiplier!', 'Serbest'];
    const r = parametreAdimi(sema(p));
    assert.equal(r.sonuc, 'hata');
    assert.deepEqual(r.ileti.split('\n'), [
      '2 metotta 3 fark var.',
      'WorkOrdersStatusList: kodda WorkorderStatusFilter → serviste WorkOrderStatusFilter',
      'WorkOrdersCreateUpdate: kodda Multipler → serviste yok',
      'WorkOrdersCreateUpdate: servis Multiplier bekliyor → kod göndermiyor',
    ], 'zorunlu olmayan fazla ad (Serbest) fark değildir; harfi farklı zorunlu ad ayrıca "bekliyor" diye yinelenmez');
  });

  test('isteğe bağlı akışın farkı adımı hata yapmaz, önekle ayrı satırda bildirilir; gerekli farkla birlikteyse özet ikisini de sayar', () => {
    const p = kod();
    p['AllMachineInformationList'] = ['MachineId'];
    const yalniz = parametreAdimi(sema(p));
    assert.equal(yalniz.sonuc, 'tamam');
    assert.deepEqual(yalniz.ileti.split('\n'), [
      'Gerekli metotların parametre adları servisle aynı; isteğe bağlı akışlarda 1 fark.',
      'İsteğe bağlı · AllMachineInformationList: kodda MachineID → serviste MachineId',
    ]);
    p['AlarmsList'] = ['MachineID', 'StartDateTime', 'EndDatetime'];
    const ikisi = parametreAdimi(sema(p));
    assert.equal(ikisi.sonuc, 'hata');
    assert.equal(ikisi.ileti.split('\n')[0], '1 metotta 1 fark var; isteğe bağlı akışlarda 1 fark.');
    assert.equal(ikisi.ileti.split('\n').at(-1)?.startsWith('İsteğe bağlı · '), true, 'gerekli farklar önce');
  });

  test('yalnız WSDL\'de şeması bulunan metot karşılaştırılır; hiç şema yoksa adım atlanır', () => {
    assert.equal(parametreFarklari(sema({ AlarmsList: ['MachineID', 'StartDatetime', 'EndDatetime'] })).karsilastirilan, 1);
    const r = parametreAdimi(new Map());
    assert.equal(r.sonuc, 'atlandi');
    assert.match(r.ileti, /parametre şeması bulunamadı/);
  });
});

describe('SME-H2 canlı kontrol yalnız okur', () => {
  test('kabul: WSDL tamam ve son bir saatin listesi okunur; yalnız WSDL ve liste metodu çağrılır', async () => {
    const s = await sahteSmartesAc();
    try {
      s.isleyiciler.set('WorkOrdersStatusList', () => ({ tur: 'tablo', satirlar: [{ WorkorderStatusID: '1' }, { WorkorderStatusID: '2' }] }));
      const r = await kontrol(kur(s), () => new Date('2026-10-15T10:00:00Z'));
      assert.equal(r.ulasildi, true);
      assert.deepEqual(r.adimlar.map((a) => a.sonuc), ['tamam', 'tamam', 'tamam']);
      assert.deepEqual(r.adimlar.map((a) => a.ad)[1], 'Parametre adları (WSDL)');
      assert.match(r.adimlar[1]?.ileti ?? '', /metodun parametre adları servisle aynı/);
      assert.match(r.adimlar[2]?.ileti ?? '', /2 satır okundu/);
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
      assert.equal(r.adimlar[2]?.sonuc, 'tamam');
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
    assert.deepEqual(r.adimlar.map((a) => a.sonuc), ['hata', 'atlandi', 'atlandi']);
    assert.ok(!JSON.stringify(r).includes(adres));
  });

  test('(ret) liste SOAP Fault dönerse hata, ileti Fault metnini taşır', async () => {
    const s = await sahteSmartesAc();
    try {
      s.isleyiciler.set('WorkOrdersStatusList', () => ({ tur: 'fault', ileti: 'Tarih biçimi hatalı' }));
      const r = await kontrol(kur(s));
      assert.equal(r.adimlar[2]?.sonuc, 'hata');
      assert.match(r.adimlar[2]?.ileti ?? '', /Tarih biçimi hatalı/);
    } finally {
      await s.kapat();
    }
  });

  test('(ret) 3368: WSDL\'de harfi farklı parametre varsa ikinci adım hata olur; ek istek gitmez, liste yine denenir', async () => {
    const s = await sahteSmartesAc();
    try {
      s.wsdlParametreleri = { ...s.wsdlParametreleri, WorkOrdersStatusList: ['StartDatetime', 'EndDatetime', 'WorkOrderStatusFilter'] };
      s.isleyiciler.set('WorkOrdersStatusList', () => ({ tur: 'tablo', satirlar: [] }));
      const r = await kontrol(kur(s));
      assert.deepEqual(r.adimlar.map((a) => a.sonuc), ['tamam', 'hata', 'tamam']);
      assert.match(r.adimlar[1]?.ileti ?? '', /\nWorkOrdersStatusList: kodda WorkorderStatusFilter → serviste WorkOrderStatusFilter/);
      assert.equal(r.adimlar[1]?.sureMs, null);
      assert.equal(s.getIstekleri, 1, 'parametreler aynı WSDL cevabından okunur');
      assert.deepEqual(s.cagrilar.map((c) => c.metot), ['WorkOrdersStatusList']);
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
