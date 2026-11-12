import { describe, expect, it } from 'vitest';
import type { DurumRotaAdimi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { StokOkumasi } from '../../kopru.ts';
import { planMetni } from './gorunum.ts';
import {
  adimDurumu, aramaUyar, DURUM_SUZGECLERI, durumUyar, adimPlani, bolmeHesapla, emirAdimlari, emirAgaci, esitBol, ilerleme, isGunuEkle, kolAdimiSec,
  miktarOku, planOzeti, planSirasi, rotaFarki, sahipsizEkle, statuluSatirlar, stokSurecSirala, seritNo, stokSatirlari, stokVeSurec, surectekiMalzeme, tamponDurumu, yeniOpNo, type Emir, sureOzetiNedenleri,
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

  it('1570: çok katmanlı emrin ilerlemesi alt düğüm adımlarını da sayar; kök düğüm satırı ikinci kez sayılmaz', () => {
    const o = emir('1', { dugumler: [
      { dugum: '0.1', itemId: '13', carpan: 2, birim: 2, ust: '0', ustOpNo: 10, adimlar: [
        { opNo: 1010, kaynakOpNo: 10, durum: 'tamam' }, { opNo: 1020, kaynakOpNo: 20, durum: 'calisiyor' },
      ] },
      { dugum: '0.1.1', itemId: '14', carpan: 2, birim: 1, ust: '0.1', ustOpNo: 10, adimlar: [{ opNo: 1030, kaynakOpNo: 10, durum: 'tamam' }] },
      { dugum: '0', itemId: '1', carpan: 1, birim: 1, ust: '', ustOpNo: null, adimlar: [{ opNo: 10, kaynakOpNo: 10, durum: 'tamam' }] },
    ] });
    const d = durum([o], { emirler: { orders: [o], opStatus: { '1|root|1': 'tamam' }, opProg: {} } });
    expect(ilerleme(d, o)).toEqual({ biten: 3, toplam: 6 });
    expect(ilerleme(d, emir('1'))).toEqual({ biten: 1, toplam: 3 });
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

  it('2780: sunucu motorunun öncül metni ardıl sayılır; tek kök tek neden olarak yazılır', () => {
    const o = emir('1');
    const zaman = 'Sunucu motoru yerleştiremedi: ufuk içinde tezgâh, vardiya, kaynak ya da malzeme yeri yok.';
    const zincir = planOzeti({ ...durum([o]), planYerlesmeyen: {
      'UE-1|10': zaman, 'UE-1|20': 'Önceki adım (UE-1 OP 10) yerleşmedi.', 'UE-1|30': 'Önceki adım yerleşmedi.',
    } }, {}, o);
    expect(zincir).toMatchObject({ tur: 'planlanamiyor', kok: [{ opNo: 10, neden: zaman }] });
    expect(zincir.tur === 'planlanamiyor' && zincir.adimlar).toHaveLength(3);
    expect(planMetni(zincir).alt).toBe(`OP 10: ${zaman}`);
    const kodlu = planOzeti({ ...durum([o]), planYerlesmeyen: { 'UE-1|10': 'Süre bilinmiyor.', 'UE-1|20': 'Sunucu motoru yerleştiremedi: öncülü UE-1|10 yerleşmedi.' } }, {}, o);
    expect(planMetni(kodlu).alt).toBe('OP 10: Süre bilinmiyor.');
    // Kök başka emirdeyse bu emirde yalnız ardıl kalır; ardıllar yazılır, boş neden çıkmaz.
    const baskaEmir = planOzeti({ ...durum([o]), planYerlesmeyen: { 'UE-1|10': 'Önceki adım (UE-9 OP 30) yerleşmedi.' } }, {}, o);
    expect(planMetni(baskaEmir).alt).toBe('OP 10: Önceki adım (UE-9 OP 30) yerleşmedi.');
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

describe('plan sırası', () => {
  // Malzeme ihtiyacının kuralı sunucudadır (B-2484-3); senaryoları sunucunun testlerindedir. Ekran yalnız plan sırasını kullanır.
  it('acil emir normalden önce gelir; taslak emir plana girmez', () => {
    expect(planSirasi(durum([emir('1'), emir('2', { priority: 1 }), emir('3', { status: 'taslak' })])).map((o) => o.id)).toEqual(['2', '1']);
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
    expect(r.siralar).toEqual([0, 2]);
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

describe('liste süzgeci ve arama (1101 a)', () => {
  it('durum çubuğu dört bölüm; aktif taslak, serbest ve üretimdedir; üretimi biten ve iptal aktifte yok', () => {
    expect(DURUM_SUZGECLERI.map((x) => x.deger)).toEqual(['aktif', 'taslak', 'tamam', 'tum']);
    expect(durumUyar(emir('1', { status: 'iptal' }), 'aktif')).toBe(false);
    expect(durumUyar(emir('1', { status: 'tamam' }), 'aktif')).toBe(false);
    expect(durumUyar(emir('1', { status: 'taslak' }), 'aktif')).toBe(true);
    expect(durumUyar(emir('1', { status: 'iptal' }), 'tum')).toBe(true);
    expect(durumUyar(emir('1', { status: 'taslak' }), 'taslak')).toBe(true);
    expect(durumUyar(emir('1', { status: 'serbest' }), 'tamam')).toBe(false);
  });

  it('arama emir no, ürün kodu, ürün adı ve notta; harf büyüklüğü ve i/ı farkı gözetilmez', () => {
    const o = emir('7', { note: 'Acil sevk' });
    const urun = { code: 'MIL-01', name: 'Örnek Şaft' };
    expect(aramaUyar(o, urun, '')).toBe(true);
    expect(aramaUyar(o, urun, '  ')).toBe(true);
    expect(aramaUyar(o, urun, 'ue-7')).toBe(true);
    expect(aramaUyar(o, urun, 'mil')).toBe(true);
    expect(aramaUyar(o, urun, 'ŞAFT')).toBe(true);
    expect(aramaUyar(o, urun, 'ACİL')).toBe(true);
    expect(aramaUyar(o, null, 'mil')).toBe(false);
    expect(aramaUyar(o, urun, 'flanş')).toBe(false);
  });
});

describe('2553 statülü stok ve süreçteki malzeme tek tablo', () => {
  const kart = { id: '12', kayitNo: 12, code: 'HM-0001', name: 'Örnek çubuk', type: 'ham', unit: 'adet', cost: null, stock: 0, min: null,
    aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true } as unknown as Malzeme;
  const okuma = (kaynakAdim: string): StokOkumasi => ({ statuler: [{ id: 7, malzemeNo: 'HM-0001', urunKodu: 'MM-0001', kaynakAdim, ad: 'OP 10 Tornalama' }], malzemeler: {} });
  const d = { routes: { 11: { base: null, steps: [{ id: 'o10', opNo: 10 }] } }, routeRevs: [], emirler: null, adimAdetleri: {} } as unknown as Parameters<typeof stokVeSurec>[0];

  it('emir verisi okunmuyorsa emir tarafı ve fark bilinmez; sıfır uydurulmaz', () => {
    expect(stokVeSurec(d, [{ malzeme: kart, statuId: 7, miktar: 5 }], okuma('11-o10'))).toMatchObject([
      { urunId: '11', opNo: 10, depoda: 5, emirlere: null, fark: null },
    ]);
  });

  it('adımı rotada bulunmayan statü kendi satırıdır; emir verisi olsa da eşleşmez', () => {
    const e = { ...d, emirler: { orders: [], opStatus: {}, opProg: {} } } as unknown as Parameters<typeof stokVeSurec>[0];
    expect(stokVeSurec(e, [{ malzeme: kart, statuId: 7, miktar: 5 }], okuma('11-o99'))).toMatchObject([
      { anahtar: 's7', opNo: null, depoda: 5, emirlere: null, fark: null },
    ]);
    expect(stokVeSurec(e, [{ malzeme: kart, statuId: 7, miktar: 5 }], okuma('11-o10'))).toMatchObject([{ depoda: 5, emirlere: 0, fark: 5 }]);
  });
});

describe('2547 eki, 2561 a: sahipsiz statülü stok tabloya eklenir', () => {
  const kart = { id: '12', kayitNo: 12, code: 'HM-0001', name: 'Örnek çubuk' } as unknown as Malzeme;
  const satir = (statuIdler: number[], k: Malzeme | null = kart) => ({
    anahtar: 'a', urunId: '11', opNo: 10, kart: k, statuIdler, statu: 'OP 10', depoda: statuIdler.length ? 5 : null, emirlere: 5, fark: 0, emirler: '',
  });
  const ss = (statuId: number, sahipsiz: string, ek: Record<string, unknown> = {}) => ({
    malzemeId: 12, malzemeKod: 'HM-0001', malzemeAd: 'Örnek çubuk', statuId, kaliteDurumu: 'serbest' as const, miktar: sahipsiz, ayrilan: '0', sahipsiz, konumlar: [], ...ek,
  });
  const okuma = { statuler: [{ id: 9, malzemeNo: 'X', urunKodu: null, kaynakAdim: '1-o', ad: 'Eski statü' }], malzemeler: {} } as unknown as StokOkumasi;

  it('liste okunmadıysa alanlar null kalır; statüsüz satırda null, eşleşmeyen statülü satırda 0', () => {
    expect(sahipsizEkle([satir([7])], null, okuma)[0]).toMatchObject({ sahipsiz: null, kaynakEmir: null, sonHareket: null });
    expect(sahipsizEkle([satir([])], [], okuma)[0]).toMatchObject({ sahipsiz: null });
    expect(sahipsizEkle([satir([7])], [], okuma)[0]).toMatchObject({ sahipsiz: 0, kaynakEmir: null, sonHareket: null });
  });

  it('serbest ve şartlı toplanır, karar bekleyen ayrı; kaynak emir ve son hareket en yeni hareketli satırdandır; başka malzemenin satırı eşleşmez', () => {
    const r = sahipsizEkle([satir([7])], [
      ss(7, '2', { kaynakEmirId: 1, kaynakEmirNo: 'UE-1', sonHareket: '2026-11-01T00:00:00.000Z' }),
      ss(7, '1.5', { kaliteDurumu: 'karar_bekliyor', kaynakEmirId: 2, kaynakEmirNo: 'UE-2', sonHareket: '2026-11-03T00:00:00.000Z' }),
      ss(7, '4', { malzemeId: 99 }),
    ], okuma);
    expect(r[0]).toMatchObject({ sahipsiz: 2, kararBekleyen: 1.5, kaynakEmir: { id: 2, no: 'UE-2' }, sonHareket: '2026-11-03T00:00:00.000Z' });
    expect(sahipsizEkle([satir([7])], [ss(7, '1', { kaliteDurumu: 'sartli' }), ss(7, '2')], okuma)[0]).toMatchObject({ sahipsiz: 3, kararBekleyen: 0 });
    expect(r[1]).toMatchObject({ anahtar: 'x99|7', kart: null, sahipsiz: 4, depoda: null });
  });

  it('tabloda karşılığı olmayan statü adıyla kendi satırı olur', () => {
    const r = sahipsizEkle([], [ss(9, '3')], okuma);
    expect(r).toMatchObject([{ anahtar: 'x12|9', statu: 'Eski statü', malzemeMetni: 'HM-0001 Örnek çubuk', sahipsiz: 3, kaynakEmir: null, sonHareket: null }]);
  });
});

describe('2547 eki v2: stok tablosu sıralaması (Atölye notu)', () => {
  const s = (anahtar: string, sonHareket: string | null, sahipsiz: number | null) => ({
    anahtar, urunId: null, opNo: null, kart: null, statuIdler: [], statu: '', depoda: null, emirlere: null, fark: null, emirler: '', sonHareket, sahipsiz,
  });
  const l = [s('a', '2026-11-02T00:00:00.000Z', 1), s('b', null, null), s('c', '2026-11-05T00:00:00.000Z', 4)];
  it('son harekete göre iki yönde sıralar, boş her yönde sondadır; sıralama yoksa sıra değişmez', () => {
    expect(stokSurecSirala(l, { alan: 'sonHareket', yon: 'azalan' }).map((x) => x.anahtar)).toEqual(['c', 'a', 'b']);
    expect(stokSurecSirala(l, { alan: 'sonHareket', yon: 'artan' }).map((x) => x.anahtar)).toEqual(['a', 'c', 'b']);
    expect(stokSurecSirala(l, { alan: 'sahipsiz', yon: 'azalan' }).map((x) => x.anahtar)).toEqual(['c', 'a', 'b']);
    expect(stokSurecSirala(l, null).map((x) => x.anahtar)).toEqual(['a', 'b', 'c']);
  });
});

describe('2571 süre özeti nedenleri', () => {
  const o = { saglam: 4, hurda: 1, hazirlikDk: 12, brutBirimDk: 2.4, netBirimDk: 2.1 };
  it('ölçülen sürede neden yok', () => { expect(sureOzetiNedenleri(o)).toEqual({ hazirlik: null, islem: null }); });
  it('ayar yoksa hazırlık; sayım yoksa, sağlam yoksa ya da başka nedenle işlem ölçülmedi', () => {
    expect(sureOzetiNedenleri({ ...o, hazirlikDk: null }).hazirlik).toBe('Ayar basılmadı: hazırlık ölçülmedi');
    expect(sureOzetiNedenleri({ ...o, netBirimDk: null, saglam: 0, hurda: 0 }).islem).toBe('Sayım yok: işlem süresi ölçülmedi');
    expect(sureOzetiNedenleri({ ...o, netBirimDk: null, saglam: 0 }).islem).toBe('Sağlam sayım yok: işlem süresi ölçülmedi');
    expect(sureOzetiNedenleri({ ...o, netBirimDk: null }).islem).toBe('İşlem süresi ölçülmedi');
  });
});
