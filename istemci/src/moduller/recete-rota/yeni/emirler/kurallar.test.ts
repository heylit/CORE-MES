import { describe, expect, it } from 'vitest';
import type { DurumRotaAdimi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { StokOkumasi } from '../../kopru.ts';
import { planMetni } from './gorunum.ts';
import {
  adimCarpanlari, adimDurumu, araStokHavuzu, adimPlani, bolmeHesapla, emirAdimlari, emirAgaci, esitBol, ilerleme, isGunuEkle, kolAdimiSec, malzemeIhtiyaclari,
  miktarOku, planOzeti, planSirasi, rotaFarki, statuluSatirlar, seritNo, stokSatirlari, surectekiMalzeme, tamponDurumu, yeniOpNo, type Emir,
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

  it('plan özeti motorun yerleşiminden: okunamazsa tarih yok, yerleşmeyen ayrı, bitiş açık adımların en geçi, teslimden sonra biten gecikir', () => {
    const o = emir('1');
    const d = durum([o]);
    expect(planOzeti(d, null, o)).toEqual({ tur: 'motor-yok' });
    expect(planOzeti(d, {}, o)).toEqual({ tur: 'yerlesmedi', acikAdim: 3, calisanPlanDisi: [] });
    expect(planOzeti(d, {}, emir('1', { status: 'taslak' }))).toEqual({ tur: 'plan-disi' });
    const y = {
      'UE-1|10': [{ makineId: 51, baslangic: '2026-11-03T08:00:00.000Z', bitis: '2026-11-04T10:00:00.000Z' }],
      'UE-1|20~1': [{ makineId: 51, baslangic: '2026-11-11T08:00:00.000Z', bitis: '2026-11-11T12:00:00.000Z' }],
      'UE-1|20~2': [{ makineId: 52, baslangic: '2026-11-09T08:00:00.000Z', bitis: '2026-11-09T12:00:00.000Z' }],
    };
    const p = planOzeti(d, y, o);
    expect(p).toMatchObject({ tur: 'plan', ilk: '2026-11-03T08:00:00.000Z', bitis: '2026-11-11T12:00:00.000Z', gecikiyor: true, tampon: 'gec' });
    expect(p).not.toHaveProperty('yerlesmeyen');
    expect(adimPlani(y, 'UE-1', 20)).toEqual({ baslangic: '2026-11-09T08:00:00.000Z', bitis: '2026-11-11T12:00:00.000Z', makineIdler: ['51', '52'] });
    expect(planOzeti(d, { 'UE-1|10': [{ makineId: 51, baslangic: '2026-11-03T08:00:00.000Z', bitis: '2026-11-10T12:00:00.000Z' }] }, o)).toMatchObject({ gecikiyor: false });
  });

  it('plan özeti: bitişi bilinmeyen adım varsa emrin bitişi yok ve gecikme hesaplanmaz; teslimsiz emir gecikmez', () => {
    const o = emir('1');
    const d = durum([o]);
    const y = {
      'UE-1|10': [{ makineId: 51, baslangic: '2026-11-03T08:00:00.000Z', bitis: '2026-11-20T10:00:00.000Z' }],
      'UE-1|30': [{ makineId: null, baslangic: '2026-11-12T08:00:00.000Z' }],
    };
    expect(planOzeti(d, y, o)).toMatchObject({ tur: 'plan', bitis: null, gecikiyor: false, bolluk: null, tampon: null });
    expect(adimPlani(y, 'UE-1', 30)).toEqual({ baslangic: '2026-11-12T08:00:00.000Z', bitis: null, makineIdler: [] });
    const teslimsiz = emir('2', { due: null });
    expect(planOzeti(durum([teslimsiz]), { 'UE-2|10': [{ makineId: 51, baslangic: '2026-11-03T08:00:00.000Z', bitis: '2027-01-01T08:00:00.000Z' }] }, teslimsiz))
      .toMatchObject({ bitis: '2027-01-01T08:00:00.000Z', gecikiyor: false, bolluk: null, tampon: null });
  });

  it('motorun yerleştiremediği açık adım varsa emir planlanamaz (eski "Planlanamıyor"); listede olmayan eksik adım (çalışan, fason) sayılmaz', () => {
    const o = emir('1');
    const y = { 'UE-1|10': [{ makineId: 51, baslangic: '2026-11-03T08:00:00.000Z', bitis: '2026-11-04T10:00:00.000Z' }] };
    expect(planOzeti({ ...durum([o]), planYerlesmeyen: { 'UE-1|30': 'Makine yok.', 'UE-9|10': 'Başka emir.' } }, y, o))
      .toEqual({ tur: 'planlanamiyor', adimlar: [{ opNo: 30, neden: 'Makine yok.' }], kok: [{ opNo: 30, neden: 'Makine yok.' }] });
    expect(planOzeti({ ...durum([o]), planYerlesmeyen: { 'UE-9|10': 'Başka emir.' } }, y, o)).toMatchObject({ tur: 'plan', bitis: '2026-11-04T10:00:00.000Z', gecikiyor: false });
    // Biten adım listede olsa da emri planlanamaz yapmaz.
    const d = durum([o], { emirler: { orders: [o], opStatus: { '1|root|3': 'tamam' }, opProg: {} } });
    expect(planOzeti({ ...d, planYerlesmeyen: { 'UE-1|30': 'Makine yok.' } }, y, o)).toMatchObject({ tur: 'plan' });
  });

  it('487/1 c: Planlanamıyor altında yalnız kök neden; ardıl adımlar sayılmaz, yalnız ardıl varsa onlar yazılır', () => {
    const o = emir('1');
    const ardilli = planOzeti({ ...durum([o]), planYerlesmeyen: { 'UE-1|10': 'Süre bilinmiyor.', 'UE-1|20': 'Önceki iş emri yerleşmedi.', 'UE-1|30': 'Önceki iş emri yerleşmedi.' } }, {}, o);
    expect(ardilli).toMatchObject({ tur: 'planlanamiyor', kok: [{ opNo: 10, neden: 'Süre bilinmiyor.' }] });
    expect(ardilli.tur === 'planlanamiyor' && ardilli.adimlar).toHaveLength(3);
    expect(planMetni(ardilli)).toEqual({ metin: 'Planlanamıyor', ton: 'hata', alt: 'OP 10: Süre bilinmiyor.', altTon: null });
    const iki = planOzeti({ ...durum([o]), planYerlesmeyen: { 'UE-1|10': 'Makine ya da kişi atanmamış, aday da yok.', 'UE-1|20': 'Süre bilinmiyor.', 'UE-1|30': 'Önceki iş emri yerleşmedi.' } }, {}, o);
    expect(planMetni(iki).alt).toBe('2 adım planlanamadı: Makine ya da kişi atanmamış, aday da yok.');
    const bagli = planOzeti({ ...durum([o]), planYerlesmeyen: { 'UE-1|10': 'Bağlı parti yerleşmedi.', 'UE-1|20': 'Önceki iş emri yerleşmedi.' } }, {}, o);
    expect(planMetni(bagli).alt).toBe('2 adım planlanamadı: Bağlı parti yerleşmedi.');
  });

  it('487/2 b: plana girmeyen çalışan adım işaretlenir; tarih ve gecikme değişmez', () => {
    const o = emir('1');
    const d = durum([o], { emirler: { orders: [o], opStatus: { '1|root|1': 'calisiyor' }, opProg: {} } });
    const y = { 'UE-1|20': [{ makineId: 51, baslangic: '2026-11-03T08:00:00.000Z', bitis: '2026-11-04T10:00:00.000Z' }], 'UE-1|30': [{ makineId: 51, baslangic: '2026-11-04T10:00:00.000Z', bitis: '2026-11-05T10:00:00.000Z' }] };
    const p = planOzeti(d, y, o);
    expect(p).toMatchObject({ tur: 'plan', bitis: '2026-11-05T10:00:00.000Z', gecikiyor: false, calisanPlanDisi: [10] });
    expect(planMetni(p)).toMatchObject({ ton: 'tamam', alt: 'OP 10 çalışıyor, planda yok', altTon: 'uyari' });
    // Plandaki çalışan adım işaretlenmez.
    expect(planOzeti(d, { ...y, 'UE-1|10': [{ makineId: 52, baslangic: '2026-11-02T08:00:00.000Z', bitis: '2026-11-03T08:00:00.000Z' }] }, o)).toMatchObject({ calisanPlanDisi: [] });
    // Yalnız çalışan adım açıksa ve planda değilse emir yerleşmemiştir; alt satır nedenini söyler.
    const tek = durum([o], { emirler: { orders: [o], opStatus: { '1|root|1': 'calisiyor', '1|root|2': 'tamam', '1|root|3': 'tamam' }, opProg: {} } });
    expect(planMetni(planOzeti(tek, {}, o))).toEqual({ metin: 'Yerleşmedi', ton: 'hata', alt: 'OP 10 çalışıyor, planda yok', altTon: 'uyari' });
  });

  it('emir şeridi eski ekranın sırasıyla: ardışık on emir on ayrı renk alır', () => {
    expect(Array.from({ length: 10 }, (_, i) => seritNo(i))).toEqual([1, 4, 7, 0, 3, 6, 9, 2, 5, 8]);
    expect(seritNo(10)).toBe(seritNo(0));
  });

  it('tampon (477 a): bolluk teslim günü sonuna kalan gün; tamponun üçte birinden azı kritik, üçte ikisinden azı azalmış', () => {
    expect(tamponDurumu(-0.5, 3)).toBe('gec');
    expect(tamponDurumu(0, 3)).toBe('kirmizi');
    expect(tamponDurumu(0.99, 3)).toBe('kirmizi');
    expect(tamponDurumu(1, 3)).toBe('sari');
    expect(tamponDurumu(2, 3)).toBe('yesil');
    expect(tamponDurumu(0, 0)).toBe('yesil');
    expect(tamponDurumu(-0.1, 0)).toBe('gec');
    const o = emir('1');
    const d = { ...durum([o]), settings: { rule: 'oncelik' as const, dir: 'ileri' as const, buffer: 3, freezeDays: 0, peopleLimit: false, planDrafts: false } };
    // Yerel saatle: teslim 10.11 gün sonu = 11.11 00:00; bitiş 9.11 12:00 -> bolluk 1,5 gün.
    const bitis = new Date(2026, 10, 9, 12, 0).toISOString();
    const p = planOzeti(d, { 'UE-1|10': [{ makineId: 51, baslangic: '2026-11-03T08:00:00.000Z', bitis }], 'UE-1|20': [{ makineId: 51, baslangic: '2026-11-04T08:00:00.000Z', bitis }], 'UE-1|30': [{ makineId: 51, baslangic: '2026-11-05T08:00:00.000Z', bitis }] }, o);
    expect(p).toMatchObject({ tur: 'plan', tampon: 'sari', gecikiyor: false });
    expect(p.tur === 'plan' ? p.bolluk : null).toBeCloseTo(1.5, 6);
    // Teslim günü sonunda biten emir geç değildir.
    const sinir = new Date(2026, 10, 11, 0, 0).toISOString();
    expect(planOzeti(d, { 'UE-1|10': [{ makineId: 51, baslangic: '2026-11-03T08:00:00.000Z', bitis: sinir }] }, o)).toMatchObject({ tampon: 'kirmizi', gecikiyor: false });
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

describe('malzeme ihtiyacı: ara adım stoğu (461 b)', () => {
  // Statü 7: ürün 1'in OP 20 adımının çıktısı (stokta hammadde kartının kırılımında). Statü 8 ürünü yazmayan eski biçim, statü 9 başka ürünün adımı.
  const okuma = (ara: string, g: Partial<StokOkumasi> = {}): StokOkumasi => ({
    statuler: [
      { id: 7, malzemeNo: 'K-3', urunKodu: null, kaynakAdim: '1-o20', ad: 'OP 20' },
      { id: 8, malzemeNo: 'K-3', urunKodu: null, kaynakAdim: 'o20', ad: 'OP 20' },
      { id: 9, malzemeNo: 'K-3', urunKodu: null, kaynakAdim: '5-o20', ad: 'OP 20' },
    ],
    malzemeler: { 3: { kirilim: [{ statuId: null, miktar: '30' }, { statuId: 7, miktar: ara }, { statuId: 8, miktar: '100' }, { statuId: 9, miktar: '100' }], bakiyeler: [] } },
    ...g,
  });
  const ham = (m: Map<string, { hammadde: { malzemeId: string; brut: number; stoktan: number; alinacak: number }[] }>, id: string) =>
    m.get(id)!.hammadde.find((e) => e.malzemeId === '3')!;

  it('OP 20 çıktısı olarak bekleyen 4 adet, adım 20 ve öncesini azaltır (izinli)', () => {
    // 10 adet: adım 30 10 yapar; 4'ü OP 20 stoğundan, adım 20 6 sağlam için 12 yapar (ret %50), adım 10 de 12: 12x2x1,1 = 26,4 hammadde;
    // adım 20 12 yarı mamul ister, 5'i stoktan, 7 üretilir (7 hammadde). Toplam 33,4; 30'u stoktan, 3,4 eksik (ara stoksuz 29).
    const m = malzemeIhtiyaclari(durum([emir('1')]), okuma('4'));
    expect(ham(m, '1').brut).toBeCloseTo(33.4);
    expect(ham(m, '1').stoktan).toBeCloseTo(30);
    expect(ham(m, '1').alinacak).toBeCloseTo(3.4);
  });

  it('ara stok plan sırasıyla paylaşılır: önce giren emir kullanır, sonraki ara stoksuz hesaplanır', () => {
    const m = malzemeIhtiyaclari(durum([emir('1'), emir('2', { priority: 1 })]), okuma('4'));
    expect(ham(m, '2').alinacak).toBeCloseTo(3.4);
    expect(ham(m, '1')).toMatchObject({ stoktan: 0 });
    expect(ham(m, '1').alinacak).toBeCloseTo(64);
  });

  it('ara stok gerekenden fazlaysa adım 10 ve 20 hiç yapılmaz; artan sonraki emre kalır', () => {
    const m = malzemeIhtiyaclari(durum([emir('1'), emir('2', { priority: 1 })]), okuma('15'));
    expect(m.get('2')!.hammadde.every((e) => e.brut === 0)).toBe(true);
    expect(m.get('2')!.eksikler).toEqual([]);
    // UE-1: kalan 5 adet OP 20 stoğu; adım 20 5 sağlam için 10, adım 10 10: 22 hammadde + 10-5(yarı mamul stok) = 5; 27, 30 stokta.
    expect(ham(m, '1')).toMatchObject({ stoktan: 27, alinacak: 0 });
    expect(m.get('1')!.eksikler).toEqual([]);
  });

  it('ürünü yazmayan ya da başka ürünün statüsü sayılmaz; stok okunamazsa yalnız serbest stok (reddedilen)', () => {
    const yalnizSerbest = ham(malzemeIhtiyaclari(durum([emir('1')])), '1');
    expect(yalnizSerbest.alinacak).toBeCloseTo(29);
    expect(ham(malzemeIhtiyaclari(durum([emir('1')]), okuma('0')), '1').alinacak).toBeCloseTo(29);
    expect(ham(malzemeIhtiyaclari(durum([emir('1')]), okuma('4', { malzemeler: null })), '1').alinacak).toBeCloseTo(29);
    expect(ham(malzemeIhtiyaclari(durum([emir('1')]), okuma('4', { statuler: null })), '1').alinacak).toBeCloseTo(29);
    // Başka ürünün anahtarı havuzda kendi ürünüyle durur, bu ürünün hesabına girmez; ürünsüz eski biçim hiç girmez.
    expect([...araStokHavuzu(okuma('4')).entries()]).toEqual([['1|o20', 4], ['5|o20', 100]]);
  });

  it('kol emrinde ara stok kullanılmaz (prototipte de öyle)', () => {
    const ana = emir('1', { qty: 10 });
    const kol = emir('2', { qty: 4, parentId: '1', kol: { n: 1, m: 3 } });
    const m = malzemeIhtiyaclari(durum([ana, kol]), okuma('4'));
    expect(ham(m, '2')).toMatchObject({ brut: 8, stoktan: 0, alinacak: 8 });
    expect(ham(m, '1').brut).toBeCloseTo(51);
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

  it('süreçteki malzeme: bağımsız adım önceki çıktıyı tüketmez, sonraki bağımlı adım tüketir', () => {
    const o = emir('1', { qty: 10, rev: null });
    const d = durum([o], {
      routes: { 1: { base: null, steps: [adim(10), adim(20, { dep: 'bagimsiz' }), adim(30), adim(40)] } },
      emirler: { orders: [o], opStatus: { '1|root|1': 'tamam' }, opProg: { '1|root|2': 7, '1|root|3': 3 } },
      adimAdetleri: { 'UE-1|20': 10 },
    });
    expect(surectekiMalzeme(d).filter((x) => x.opNo === 10).map((x) => x.miktar)).toEqual([7]);
  });
});
