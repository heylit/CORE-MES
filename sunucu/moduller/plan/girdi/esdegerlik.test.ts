import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { planGirdisi, type GirdiIstegi } from '../plan-girdisi.ts';
import { motorYukle } from '../plan-motoru.ts';
import { dilimFarki, farkMetni, girdiFarki } from './esdegerlik.ts';
import {
  FASONCU_ALANLARI, KISI_ALANLARI, MALZEME_ALANLARI, MOTOR_VERISI_ALANLARI, ROTA_ADIMI_ALANLARI, SAYFA_ALANLARI, SIPARIS_ALANLARI,
  TEZGAH_ALANLARI, UST_ALAN_KAYNAKLARI, type MotorVerisi,
} from './tipler.ts';

// 1715: eşdeğerlik düzeni. Eski yol (planGirdisi -> motor/girdi.betik) sentetik bir senaryoda koşar; tip ve kaynak tabloları eski yolun
// kurduğu alanları eksiksiz kapsamalı (yeni yol hiçbir alanı gözden kaçırmasın), fark aracı ayrılığı alan alan yazmalı. Dilim kartları
// (1716-1718) kendi kur'larını aynı senaryoda dilimFarki ile sınar. Veriler uydurmadır.

// Kaynak okuması: Reçete ve Rota'nın bağlı durumu (durum) ve planın ekleri (ek), planlama-servis.ts kaynakOku biçiminde.
const durum = {
  cal: {
    shifts: [
      { id: '1', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [{ start: '12:00', end: '12:30' }] },
      { id: '2', name: 'Aksam', start: '16:00', end: '24:00', breaks: [] },
    ],
    holidays: ['2026-10-29'],
  },
  wcs: [{ id: '5', code: 'IM-A', name: 'Ornek merkez', aktif: true }],
  stations: [
    { id: '10', code: 'TOR', name: 'Torna', wcId: '5', eff: 90, opPer: 0.5, count: 2, aktif: true },
    { id: '11', code: 'FRZ', name: 'Freze', wcId: '5', eff: 100, opPer: 1, count: 1, aktif: true },
  ],
  machines: [
    { id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true },
    { id: '101', code: 'T2', name: 'Torna 2', stationId: '10', status: 'ariza', aktif: true },
    { id: '110', code: 'F1', name: 'Freze 1', stationId: '11', status: 'aktif', aktif: true },
  ],
  people: [
    { id: '7', name: 'Ornek Operator', code: 'P7', wcId: '5', stationId: '10', skills: ['10'], active: true, machines: ['100'], maxMachines: 2 },
    { id: '8', name: 'Ornek Ayarci', code: 'P8', wcId: '5', stationId: '11', skills: ['10', '11'], active: true, machines: [], maxMachines: null },
  ],
  items: [
    { id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul', unit: 'adet', stock: 4 },
    { id: '60', code: 'HM-1', name: 'Ornek cubuk', type: 'ham', unit: 'kg', stock: null },
  ],
  opdefs: [{ id: '13', code: 'TRN', name: 'Tornalama' }, { id: '14', code: 'FRZ', name: 'Frezeleme' }, { id: '15', code: 'KPL', name: 'Kaplama' }],
  routes: {
    50: {
      steps: [
        { id: 's10', seq: 10, opNo: 10, opId: '13', stationId: '10', alts: ['11'], altTimes: { 11: { setup: 40, cycle: 8 } }, setup: 30, cycle: 6,
          dep: 'bagimli', depQty: 1, minLot: 0, ins: [{ itemId: '60', qty: 1.5 }] },
        { id: 's20', seq: 20, opNo: 20, opId: '14', stationId: '11', alts: [], altTimes: {}, setup: 20, cycle: 4, dep: 'ortulu', depQty: 5, minLot: 0, ins: [] },
        { id: 's30', seq: 30, opNo: 30, opId: '15', stationId: null, fasonId: '900', terminGun: 3, alts: [], altTimes: {}, setup: 0, cycle: 0, dep: 'bagimli', depQty: 1, minLot: 0, ins: [] },
      ],
    },
  },
  routeRevs: [{ itemId: '50' }],
  fasonFirms: [{ id: '900', code: 'FS-1', name: 'Ornek fasoncu' }],
  emirler: {
    orders: [
      { id: '1', no: 'E-1', itemId: '50', qty: 20, start: '2026-10-19', due: '2026-10-30', priority: 2, status: 'uretimde', note: '' },
      { id: '2', no: 'E-2', itemId: '50', qty: 5, start: null, due: null, priority: 4, status: 'taslak', note: 'Deneme' },
    ],
    opStatus: { '1|root|1': 'tamam' },
  },
  adimAdetleri: { 'E-1|20': 18 },
  maliyet: {
    istasyon: { 10: { birimMaliyet: '900', paraBirimi: 'TRY' }, 11: { birimMaliyet: '1200', paraBirimi: 'TRY' } },
    kisi: {}, malzeme: { 60: { birimMaliyet: '75', paraBirimi: 'TRY' } },
  },
};
const ek = {
  takvim: { hafta: { 5: { 1: ['1', '2'], 2: ['1', '2'], 3: ['1'], 4: ['1'], 5: ['1'] } }, kisiVardiyasi: { 7: '1', 8: '1' } },
  makineNotu: { 101: 'Ornek ariza notu' },
  kisiGorevi: { 7: 'Operatör', 8: 'Ayarcı' },
  kapasite: { baslangic: '2026-10-19', isMerkezleri: [], istasyonlar: [], kisiler: [{ id: '7', izinli: ['2026-10-21'], fazlaMesai: [], paylar: [] }] },
  acikSiparisler: [{ kod: '60', miktar: 40, tarih: '2026-10-22', siparisNo: 'SA-1' }],
  tedarikTerminleri: [{ kod: '60', termin: '2026-10-22', surum: 3, aciklama: '' }],
  malzemeFiyatlari: [{ kod: '60', alisFiyati: 80, teslimSayisi: 2, kg: null }],
  siparisBedelleri: { 1: { gelir: 15000, cezaOran: 0.5, cezaTavan: 10 }, 2: { gelir: null, cezaOran: null, cezaTavan: null } },
};
// Açık çalışma: planlamacının elle girdikleri (plan alt nesneleri ve sayfa ayarları) önceki kurulumdan kalmış gibi.
const calisma = {
  surum: 2, rrSavedAt: 9, dataVer: 1, kisitSurum: 2, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: [], olaylar: [], plan: null,
  w: { famK: 0.3, mat: 'uyari', dondurma: 4 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
  D: {
    meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [],
    tezgahlar: [{ id: '100', ad: 'Torna 1', grup: '10', ucret: 950, ucretIst: 900, verim: 0.9, vardiyalar: ['1'], opOran: 0.5, isiksiz: true, arizaGun: 30, onarimSaat: 4 }],
    personel: [], urunler: [], malzemeler: [{ kod: '60', ad: 'Ornek cubuk', birim: 'kg', stok: null, birimFiyat: 70, tedarikGun: 5, muayeneGun: 1 }],
    siparisler: [], fasoncular: [{ id: '900', ad: 'Eski ad', kapasite: 2, sureGun: 4, cikisGunleri: ['pzt', 'per'], cikisSaat: 10 }],
    devamsizlik: [{ personel: '8', gun: '2026-10-23' }], satinalma: [{ kod: '60', miktar: 10, gelis: '2026-10-26 08:00', tedarikci: '' }],
    ayarlar: { tasimaSaat: 0.5, programSaat: 2, faiSaat: 1 }, aparatlar: [{ id: 'AP-1', adet: 1 }], ayarMatrisi: [{ den: 'A', ye: 'B', dk: 15 }],
    planDenge: 25,
  },
};
const KAYIT = { version: 7, savedAt: 9, items: [], opdefs: [], machines: [], routes: {}, orders: [] };
const SENARYO: GirdiIstegi = { calisma, kayit: KAYIT, kaynak: { durum, ek }, bugun: '2026-10-19' };

type Satir = Record<string, unknown>;
const eskiYol = (): Satir => {
  const r = planGirdisi(SENARYO);
  assert.ok(r, 'eski yol çalışmayı kurmalı');
  return r.S['D'] as Satir;
};
const satirlar = (x: unknown): Satir[] => (Array.isArray(x) ? (x as Satir[]) : []);
const anahtarlar = (l: Satir[]): string[] => [...new Set(l.flatMap((x) => Object.keys(x).filter((k) => x[k] !== undefined)))].sort();
const disinda = (l: string[], izinli: object): string[] => l.filter((k) => !Object.hasOwn(izinli, k));

describe('motor girdisi eşdeğerliği (1715)', () => {
  test('ED-01: anahtar sırası fark değildir; dizi sırası, eksik alan ve değer farkı yoluyla yazılır', () => {
    assert.deepEqual(girdiFarki({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 }), []);
    assert.deepEqual(girdiFarki({ a: 1, b: undefined }, { a: 1 }), []);
    assert.deepEqual(girdiFarki({ l: [{ x: 1 }, { x: 2 }] }, { l: [{ x: 2 }, { x: 1 }] }).map((f) => f.yol), ['l[0].x', 'l[1].x']);
    assert.deepEqual(girdiFarki({ l: [1, 2, 3] }, { l: [1, 2] }), [{ yol: 'l.length', eski: 3, yeni: 2 }]);
    assert.deepEqual(girdiFarki({ s: { stok: null } }, { s: { stok: 0 } }), [{ yol: 's.stok', eski: null, yeni: 0 }]);
    assert.deepEqual(girdiFarki({ s: { a: 1 } }, { s: {} }), [{ yol: 's.a', eski: 1, yeni: undefined }]);
    assert.equal(girdiFarki(Array.from({ length: 80 }, (_, i) => i), Array.from({ length: 80 }, (_, i) => i + 1), 5).length, 5);
    assert.equal(farkMetni([{ yol: 'a.b', eski: undefined, yeni: 0 }]), 'a.b: eski yok, yeni 0');
  });

  // Motorun okuduğu üst alanlar davranıştan ölçülür: senaryonun girdisi motorda planlanıp değerlendirilirken st.D'nin okunan alanları sayılır.
  test('ED-02: motorun okuduğu her üst alan tiplidir ya da sayfa alanıdır; tipli her alanı motor okur', () => {
    const r = planGirdisi(SENARYO);
    assert.ok(r);
    const m = motorYukle();
    const okunan = new Set<string>();
    const st = m.stHazirla({ ...r.st, w: { ...m.W0, ...(r.st['w'] as object) } });
    st['D'] = new Proxy(st['D'] as object, { get(t, k, a) { if (typeof k === 'string') okunan.add(k); return Reflect.get(t, k, a) as unknown; } });
    const plan = m.schedule(st, 'yeni', null);
    assert.ok(Object.keys(plan.ops).length > 0, 'senaryo motorda en az bir iş yerleştirmeli');
    m.evaluate(plan, st, null);
    const bilinen = new Set<string>([...MOTOR_VERISI_ALANLARI, ...SAYFA_ALANLARI]);
    assert.deepEqual([...okunan].filter((a) => !bilinen.has(a)).sort(), [], 'motor yeni bir üst alan okuyor: tipler.ts ve TASARIM.md 3 güncellenmeli');
    assert.deepEqual(MOTOR_VERISI_ALANLARI.filter((a) => !okunan.has(a)), [], 'tipler.ts motorun okumadığı bir alanı listeliyor');
  });

  test('ED-03: eski yolun kurduğu üst alanlar ve satır alanları kaynak tablolarında', () => {
    const D = eskiYol();
    const ustBilinen = { ...UST_ALAN_KAYNAKLARI, ...Object.fromEntries(SAYFA_ALANLARI.map((a) => [a, 1])) };
    assert.deepEqual(disinda(Object.keys(D), ustBilinen), [], 'eski yol yeni bir üst alan kuruyor');
    // Sunucu ya da karma kaynaklı alanlar senaryoda gerçekten kurulmuş olmalı: test boş veriyle geçmesin.
    const sunucudan = MOTOR_VERISI_ALANLARI.filter((x) => ['sunucu', 'karma'].includes(UST_ALAN_KAYNAKLARI[x].kaynak));
    for (const a of sunucudan) assert.ok(D[a] !== undefined, `${a} kurulmadı`);
    const urunler = satirlar(D['urunler']);
    const tablolar: [string, Satir[], object][] = [
      ['tezgahlar', satirlar(D['tezgahlar']), TEZGAH_ALANLARI],
      ['personel', satirlar(D['personel']), KISI_ALANLARI],
      ['urunler[].rota', urunler.flatMap((u) => satirlar(u['rota'])), ROTA_ADIMI_ALANLARI],
      ['malzemeler', satirlar(D['malzemeler']), MALZEME_ALANLARI],
      ['siparisler', satirlar(D['siparisler']), SIPARIS_ALANLARI],
      ['fasoncular', satirlar(D['fasoncular']), FASONCU_ALANLARI],
    ];
    for (const [ad, l, tablo] of tablolar) {
      assert.ok(l.length > 0, `${ad} senaryoda boş`);
      assert.deepEqual(disinda(anahtarlar(l), tablo), [], `${ad}: eski yolun kurduğu alan kaynak tablosunda yok`);
    }
    assert.deepEqual(disinda(anahtarlar(urunler), { id: 1, ad: 1, rota: 1, bilesenler: 1 }), []);
  });

  test('ED-04: eski yol kendisiyle eşdeğerdir; tek alan sapması yoluyla yakalanır', () => {
    const D = eskiYol();
    const alanlar = MOTOR_VERISI_ALANLARI;
    const ayni = structuredClone(D) as unknown as MotorVerisi;
    assert.equal(farkMetni(dilimFarki(eskiYol(), ayni, alanlar)), '');
    const sapan = structuredClone(D) as unknown as MotorVerisi;
    const t = sapan.tezgahlar.find((m) => m.id === '100');
    assert.ok(t);
    t.ucret = 0;
    assert.deepEqual(dilimFarki(D, sapan, alanlar).map((f) => f.yol), [`tezgahlar[${String(sapan.tezgahlar.indexOf(t))}].ucret`]);
  });

  test('ED-05: elle girilen ve sunucudan gelen değerler eski yolda bilinen kaynağından kurulur (yeni yolun hedef değerleri)', () => {
    const D = eskiYol() as unknown as MotorVerisi;
    const t100 = D.tezgahlar.find((m) => m.id === '100');
    // elle: sayfada girilen ücret (izlemeden çıkmış) ve ışıksız/arıza ayarları korunur; oran istasyondan (561 1 b).
    assert.deepEqual([t100?.ucret, t100?.isiksiz, t100?.arizaGun, t100?.opOran], [950, true, 30, 0.5]);
    // ilk kurulumdaki tezgâh: ücret istasyon maliyetinden, verim istasyonun veriminden.
    const t110 = D.tezgahlar.find((m) => m.id === '110');
    assert.deepEqual([t110?.ucret, t110?.verim], [1200, 1]);
    const f = D.fasoncular?.find((x) => x.id === '900');
    // ad sahibinden, kapasite ve çıkış ayarı elle (999 varsayılanı yalnız kaydı olmayan firmada).
    assert.deepEqual([f?.ad, f?.kapasite, f?.cikisGunleri, f?.sureGun], ['Ornek fasoncu', 2, ['pzt', 'per'], 4]);
    const m = D.malzemeler.find((x) => x.kod === '60');
    // Bulgu (TASARIM.md 5.1): ham malzemenin motor ayarı açık çalışmadan değil Reçete ve Rota kaydından alınır (girdi.betik sunucuKaydi
    // urun0 yalnız ürünlere bakar); çalışmadaki tedarik ve muayene günü kaynak okundukça 0'a döner. Yeni yol 1719 kararına kadar bunu korur.
    assert.deepEqual([m?.stok, m?.birimFiyat, m?.tedarikGun, m?.muayeneGun, m?.saTermin], [null, 80, 0, 0, '2026-10-22']);
    assert.deepEqual(D.satinalma?.map((s) => [s.kod, s.miktar, s.sunucu ?? false]), [['60', 10, false], ['60', 40, true]]);
    assert.deepEqual(D.devamsizlik?.map((d) => [d.personel, d.gun, d.sunucu ?? false]), [['8', '2026-10-23', false], ['7', '2026-10-21', true]]);
    // Yalnız elle olan alanlar (1719 adayı) açık çalışmadan aynen geçer.
    assert.deepEqual([D.ayarlar, D.aparatlar, D.ayarMatrisi], [calisma.D.ayarlar, calisma.D.aparatlar, calisma.D.ayarMatrisi]);
  });
});
