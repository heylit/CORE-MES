import { describe, expect, it } from 'vitest';
import type { DurumCevabi, DurumRotaAdimi } from '#paylasilan/sozlesme/recete-rota.ts';
import {
  adimCarpanlari, adimDurumu, adimPlani, bolmeHesapla, emirAdimlari, emirAgaci, esitBol, ilerleme, isGunuEkle, kolAdimiSec, malzemeIhtiyaclari,
  miktarOku, planOzeti, planSirasi, rotaFarki, statuluSatirlar, stokSatirlari, surectekiMalzeme, yeniOpNo, type Emir,
} from './kurallar.ts';

// Uydurma veri: bir mamul (üç adımlı rota), bir yarı mamul (tek adımlı rota), bir hammadde ve bir hurda kartı.
type Malzeme = NonNullable<DurumCevabi['items']>[number];
const kart = (id: string, type: Malzeme['type'], stock: number | null, min: number | null = null): Malzeme => ({
  id, kayitNo: Number(id), code: `K-${id}`, name: `Kart ${id}`, type, unit: 'adet', cost: null, stock, min, aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true,
});
const adim = (seq: number, g: Partial<DurumRotaAdimi> = {}): DurumRotaAdimi => ({
  id: `o${String(seq)}`, seq, opNo: seq, opId: '21', name: `Adım ${String(seq)}`, stationId: '31', machineId: null, kisiId: null, fasonId: null, terminGun: null,
  setup: 10, proc: null, chg: null, cycle: 2, dep: 'bagimli', depQty: null, rejectPct: 0, split: 'tek', minLot: null, resetup: false, alts: [], altTimes: {},
  digerAdaylar: [], ins: [], outs: [], ...g,
});
const emir = (id: string, g: Partial<Emir> = {}): Emir => ({
  id, kayitNo: Number(id), no: `UE-${id}`, itemId: '1', qty: 10, start: '2026-11-02', due: '2026-11-10', priority: 3, note: null, rev: '91', status: 'serbest',
  created: Number(id), doneAt: null, tur: 'seri', parentId: null, kol: null, birlestigiId: null, surum: 1, ...g,
});
const ROTA_MM = [
  adim(10, { ins: [{ itemId: '3', qty: 2, scrap: 10 }] }),
  adim(20, { ins: [{ itemId: '2', qty: 1, scrap: 0 }], rejectPct: 50 }),
  adim(30, { outs: [{ itemId: '4', qty: 0.5, kind: 'yan' }] }),
];
const ROTA_YM = [adim(10, { ins: [{ itemId: '3', qty: 1, scrap: 0 }] })];

function durum(emirler: Emir[], g: Partial<DurumCevabi> = {}): DurumCevabi {
  return {
    items: [kart('1', 'mamul', 0), kart('2', 'yari', 5), kart('3', 'ham', 30), kart('4', 'ham', 0)],
    units: [], opdefs: [{ id: '21', code: 'TOR', abbr: 'T', name: 'Tornalama', group: 'g', groupName: 'G', stationId: '31', setup: null, cycle: null, aktif: true }],
    wcs: [], stations: [], machines: [], people: [],
    routes: { 1: { base: null, steps: ROTA_MM }, 2: { base: null, steps: ROTA_YM } },
    routeRevs: [
      { id: '91', itemId: '1', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: ROTA_MM } },
      { id: '92', itemId: '2', no: 'A', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: ROTA_YM } },
    ],
    cal: { shifts: [], holidays: [] },
    emirler: { orders: emirler, opStatus: {}, opProg: {} },
    maliyet: null,
    settings: { rule: 'oncelik', dir: 'ileri', buffer: 0, freezeDays: 0, peopleLimit: false, planDrafts: false },
    moves: [], malzemeKesildi: false,
    ...g,
  };
}

describe('emir ağacı', () => {
  it('kökler önce öncelik sonra teslimle sıralanır; alt emir ana emrin altında girintili', () => {
    const l = [emir('1', { priority: 3 }), emir('2', { priority: 1 }), emir('3', { parentId: '1', kol: { n: 1, m: 3 } }), emir('4', { parentId: '99' })];
    expect(emirAgaci(l, () => true).map((s) => [s.emir.id, s.derinlik])).toEqual([['2', 0], ['1', 0], ['3', 1], ['4', 0]]);
  });

  it('süzgece uymayan ana emir, uyan alt emri varsa görünür', () => {
    const l = [emir('1', { status: 'tamam' }), emir('3', { parentId: '1' })];
    expect(emirAgaci(l, (o) => o.status === 'serbest').map((s) => s.emir.id)).toEqual(['1', '3']);
    expect(emirAgaci([emir('1', { status: 'tamam' })], (o) => o.status === 'serbest')).toEqual([]);
  });
});

describe('adımlar, ilerleme ve plan', () => {
  it('kol emrinin iş emri sırası ayrılma adımı kadar kayar', () => {
    const k = emir('5', { kol: { n: 1, m: 3 } });
    expect(adimDurumu(k, 2, { '5|root|1': 'tamam' })).toBe('tamam');
    expect(adimDurumu(emir('6'), 2, { '6|root|1': 'tamam' })).toBe('bekliyor');
  });

  it('ilerleme emrin kendi aralığındaki biten adımlardır', () => {
    const d = durum([emir('1')], { emirler: { orders: [emir('1')], opStatus: { '1|root|1': 'tamam', '1|root|2': 'calisiyor' }, opProg: {} } });
    expect(ilerleme(d, emir('1'))).toEqual({ biten: 1, toplam: 3 });
    expect(emirAdimlari(d, emir('1')).map((a) => a.opNo)).toEqual([10, 20, 30]);
  });

  it('rotasız emrin adımları emrin kendisinden gelir', () => {
    const o = emir('7', { rotasiz: true, rev: null, adimlar: [
      { seq: 20, opNo: 20, ad: 'B', opId: null, stationId: null, setup: null, cycle: null, durum: 'tamam' },
      { seq: 10, opNo: 10, ad: 'A', opId: null, stationId: null, setup: null, cycle: null, durum: 'bekliyor' },
    ] });
    expect(emirAdimlari(durum([o]), o).map((a) => a.ad)).toEqual(['A', 'B']);
    expect(ilerleme(durum([o]), o)).toEqual({ biten: 1, toplam: 2 });
    expect(yeniOpNo(emirAdimlari(durum([o]), o))).toBe(30);
    expect(yeniOpNo([])).toBe(10);
  });

  it('plan özeti motorun yerleşiminden: okunamazsa tarih yok, yerleşmeyen ayrı, geç başlayan son adım gecikir', () => {
    const o = emir('1');
    const d = durum([o]);
    expect(planOzeti(d, null, o)).toEqual({ tur: 'motor-yok' });
    expect(planOzeti(d, {}, o)).toEqual({ tur: 'yerlesmedi', acikAdim: 3 });
    expect(planOzeti(d, {}, emir('1', { status: 'taslak' }))).toEqual({ tur: 'plan-disi' });
    const y = {
      'UE-1|10': [{ makineId: 51, baslangic: '2026-11-03T08:00:00.000Z' }],
      'UE-1|20~1': [{ makineId: 51, baslangic: '2026-11-11T08:00:00.000Z' }],
      'UE-1|20~2': [{ makineId: 52, baslangic: '2026-11-09T08:00:00.000Z' }],
    };
    const p = planOzeti(d, y, o);
    expect(p).toMatchObject({ tur: 'plan', ilk: '2026-11-03T08:00:00.000Z', son: '2026-11-09T08:00:00.000Z', gecikiyor: false, yerlesmeyen: 1 });
    expect(adimPlani(y, 'UE-1', 20)).toEqual({ baslangic: '2026-11-09T08:00:00.000Z', makineIdler: ['51', '52'] });
    expect(planOzeti(d, { 'UE-1|30': [{ makineId: null, baslangic: '2026-11-12T08:00:00.000Z' }] }, o)).toMatchObject({ gecikiyor: true });
  });

  it('rota farkı: emrin revizyonu yürürlüktekinden eskiyse eklenen ve çıkan OP', () => {
    const yeni = [adim(10), adim(20), adim(25), adim(30)];
    const d = durum([], {
      routeRevs: [
        { id: '90', itemId: '1', no: 'A', status: 'onayli', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: [adim(10), adim(20), adim(40)] } },
        { id: '91', itemId: '1', no: 'B', status: 'yururlukte', surum: 1, note: '', created: 0, approvedAt: null, data: { base: null, steps: yeni } },
      ],
    });
    expect(rotaFarki(d, emir('1', { rev: '90' }))).toEqual({ eskiNo: 'A', yeniNo: 'B', eklenen: [{ opNo: 25, ad: 'Tornalama' }, { opNo: 30, ad: 'Tornalama' }], cikan: [40] });
    expect(rotaFarki(d, emir('1', { rev: '91' }))).toBeNull();
    expect(rotaFarki(d, emir('1', { rev: '90', status: 'tamam' }))).toBeNull();
  });
});

describe('malzeme ihtiyacı', () => {
  it('ret yüzdesi önceki adımları büyütür', () => {
    expect(adimCarpanlari([{ rejectPct: 0 }, { rejectPct: 50 }, { rejectPct: 0 }])).toEqual([2, 2, 1]);
  });

  it('stok plan sırasıyla paylaşılır; yarı mamul stoktan netleşir, eksiği kendi rotasından patlatılır; fire ve yan ürün', () => {
    // UE-2 acil (önce), UE-1 normal. Her emir 10 adet: adım 10 için 2x10x2(ret)x1,1 = 44 hammadde; adım 20 için 1x10x2 = 20 yarı mamul.
    const d = durum([emir('1'), emir('2', { priority: 1 })]);
    expect(planSirasi(d).map((o) => o.id)).toEqual(['2', '1']);
    const m = malzemeIhtiyaclari(d);
    const r2 = m.get('2')!;
    // Yarı mamul: 5 stoktan, 15 üretilir -> 15 hammadde. Hammadde stoğu 30: önce 44'ten 30 düşer.
    const ham2 = r2.hammadde.find((e) => e.malzemeId === '3')!;
    expect(ham2.brut).toBeCloseTo(59);
    expect(ham2.stoktan).toBeCloseTo(30);
    expect(ham2.alinacak).toBeCloseTo(29);
    expect(r2.yanUrun).toEqual([{ malzemeId: '4', miktar: 5 }]);
    const r1 = m.get('1')!;
    expect(r1.hammadde.find((e) => e.malzemeId === '3')).toMatchObject({ stoktan: 0, alinacak: 64 });
    expect(r1.eksikler.length).toBe(1);
  });

  it('taslak emir hesaba girmez; kolun malzemesi yalnız kendi aralığından, ana emir kalanı yapar', () => {
    const ana = emir('1', { qty: 10 });
    const kol = emir('2', { qty: 4, parentId: '1', kol: { n: 1, m: 3 } });
    const m = malzemeIhtiyaclari(durum([ana, kol, emir('3', { status: 'taslak' })]));
    expect(m.has('3')).toBe(false);
    // Ana emir önce: 1. adım bütün miktar (44 hammadde, 30'u stoktan); 2. adımda kalan 6 adet x 2(ret) = 12 yarı mamul, 5'i stoktan, 7'si
    // üretilir (7 hammadde). Kol yalnız 2. adımı yapar: 4 x 2 = 8 yarı mamul, stok bitti, 8 hammadde.
    const ham = (id: string) => m.get(id)!.hammadde.find((e) => e.malzemeId === '3')!;
    expect(ham('1').brut).toBeCloseTo(51);
    expect(ham('1').stoktan).toBeCloseTo(30);
    expect(ham('2')).toMatchObject({ brut: 8, stoktan: 0, alinacak: 8 });
    expect(m.get('2')!.yanUrun).toEqual([]);
  });
});

describe('bölme', () => {
  const g = { anaAd: 'UE-1', miktar: 100, adimSayisi: 4, aralik: { ilk: 1, son: 4 }, mevcutKollar: [], bitti: (j: number) => j === 1 };

  it('parti: boş kutu açılmaz, kalan ana emirde; geçersiz sayı iletisi', () => {
    const r = bolmeHesapla(g, { tur: 'parti', partiler: ['30', '', '20,5'] });
    expect(r.hazir).toBe(true);
    expect(r.partiler).toEqual([30, 20.5]);
    expect(r.kalan).toBe(49.5);
    expect(r.satirlar.map((s) => s.ad)).toEqual(['UE-1', 'Parti 1', 'Parti 3']);
    expect(r.satirlar[0]!.hucreler[0]).toEqual({ miktar: 49.5, bitti: true });
    expect(bolmeHesapla(g, { tur: 'parti', partiler: ['', ''] })).toMatchObject({ hazir: false, bilgi: true });
    expect(bolmeHesapla(g, { tur: 'parti', partiler: ['3x'] })).toMatchObject({ hazir: false, bilgi: false });
  });

  it('kol: önce ayrılma, sonra birleşme; ara adımlarda ana emir kalanı yapar', () => {
    expect(bolmeHesapla(g, { tur: 'kol', n: null, m: null, miktar: '' }).ipucu).toBeTruthy();
    const r = bolmeHesapla(g, { tur: 'kol', n: 1, m: 4, miktar: '40' });
    expect(r.kalan).toBe(60);
    expect(r.satirlar[1]!.hucreler.map((h) => h?.miktar ?? null)).toEqual([null, 40, 40, null]);
    expect(r.satirlar[1]!.bos).toEqual(['ana emirde', null, null, 'katıldı']);
    expect(r.satirlar[0]!.hucreler.map((h) => h?.miktar ?? null)).toEqual([100, 60, 60, 100]);
  });

  it('şerit seçimi: birleşme ayrılmadan en az iki sonra; son adım ayrılma olamaz', () => {
    expect(kolAdimiSec(null, null, 2, 5)).toEqual({ n: 2, m: null });
    expect(kolAdimiSec(2, null, 3, 5)).toEqual({ n: 3, m: null });
    expect(kolAdimiSec(2, null, 4, 5)).toEqual({ n: 2, m: 4 });
    expect(kolAdimiSec(2, 4, 1, 5)).toEqual({ n: 1, m: null });
    expect(kolAdimiSec(null, null, 5, 5)).toEqual({ n: null, m: null });
  });

  it('eşit bölme ve miktar okuma', () => {
    expect(esitBol(100, 2)).toBe(33);
    expect(esitBol(2, 2)).toBeNull();
    expect(miktarOku(' 12,5 ')).toEqual({ tamam: true, deger: 12.5 });
    expect(miktarOku('')).toEqual({ tamam: true, deger: null });
    expect(miktarOku('-3').tamam).toBe(false);
  });
});

describe('tarih ve stok', () => {
  it('iş günü hafta içi ve tatil dışıdır', () => {
    // 2026-10-30 cuma; 2026-11-02 pazartesi tatil.
    expect(isGunuEkle('2026-10-31', 0, [])).toBe('2026-11-02');
    expect(isGunuEkle('2026-10-30', 1, ['2026-11-02'])).toBe('2026-11-03');
  });

  it('serbest stok okunabildiyse kırılımdan, değilse durumdan; minimum altı yalnız minimumu olan', () => {
    const items = [kart('1', 'ham', 8, 10), kart('2', 'ham', null, null)];
    const okuma = { statuler: [], malzemeler: { 1: { kirilim: [{ statuId: null, miktar: '12' }, { statuId: 7, miktar: '3' }], bakiyeler: [] }, 2: null } };
    expect(stokSatirlari(items, null).map((s) => [s.serbest, s.minimumAlti])).toEqual([[8, true], [null, false]]);
    expect(stokSatirlari(items, okuma).map((s) => [s.serbest, s.minimumAlti])).toEqual([[12, false], [null, false]]);
    expect(statuluSatirlar(items, okuma).map((s) => [s.malzeme.id, s.statuId, s.miktar])).toEqual([['1', 7, 3]]);
  });

  it('süreçteki malzeme: biten adımın çıktısı sonraki adımın sağlam sayacı kadar tüketilir', () => {
    const o = emir('1', { qty: 10 });
    const d = durum([o], {
      emirler: { orders: [o], opStatus: { '1|root|1': 'tamam' }, opProg: { '1|root|2': 4 } },
      adimAdetleri: { 'UE-1|20': 9 },
    });
    const s = surectekiMalzeme(d);
    expect(s.map((x) => [x.urun, x.opNo, x.miktar])).toEqual([['1', 10, 5], ['1', 20, 4]]);
    expect(s[0]!.emirler).toBe('UE-1: 5');
  });
});
