import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { tasimaItmesi, type BagTuru, type TasimaGirdisi, type TasimaIsi } from './tasima-kurallar.ts';

// 2790 a, 2790-2 a, 2794: elle taşımada itme. Takvim kesintisizdir (iş t'de başlar, süresi kadar sürer). Veriler uydurmadır.
interface Kur { m: string; S: number; d: number; lot?: number; sabit?: boolean; fas?: boolean }
function girdi(isler: Record<string, Kur>, bag: Record<string, [string, BagTuru][]>, ek: Partial<TasimaGirdisi> = {}): TasimaGirdisi {
  const m = new Map<string, TasimaIsi>();
  for (const [id, k] of Object.entries(isler)) {
    const [job, opNo] = id.split('.') as [string, string];
    m.set(id, { id, job, opNo, m: k.m, S: k.S, C: k.S + k.d, lot1: k.S + (k.lot ?? k.d), sabit: k.sabit ?? false, fas: k.fas ?? false });
  }
  return {
    isler: m, onculler: new Map(Object.entries(bag)), simdi: -100, donuk: -100, ufuk: 1000, tasimaSaat: 0,
    yer: (id, _m, t) => { const k = isler[id]!; return { S: t, C: t + k.d, lot1: t + (k.lot ?? k.d) }; },
    saatMetni: (h) => `${h}`,
    ...ek,
  };
}
const ozet = (r: ReturnType<typeof tasimaItmesi>) => Object.fromEntries(r.isler.map((i) => [i.isId, [i.tezgah, i.S, i.tur]]));

describe('elle taşımada itme (2790, 2794)', () => {
  test('bekleyen bağ: ardıl, öncül bitince başlayacak yere tam itilir', () => {
    const g = girdi({ 'E1.10': { m: 'M1', S: 0, d: 4 }, 'E1.20': { m: 'M2', S: 4, d: 4 } }, { 'E1.20': [['E1.10', 'b']] });
    const r = tasimaItmesi(g, 'E1.10', 'M1', 6);
    assert.equal(r.gecerli, true);
    assert.deepEqual(ozet(r), { 'E1.10': ['M1', 6, 'tasinan'], 'E1.20': ['M2', 10, 'itilen'] });
    assert.match(r.ileti!, /OP 20 ileri itildi/);
  });

  test('taşıma süresi bekleyen bağa eklenir', () => {
    const g = girdi({ 'E1.10': { m: 'M1', S: 0, d: 4 }, 'E1.20': { m: 'M2', S: 5, d: 4 } }, { 'E1.20': [['E1.10', 'b']] }, { tasimaSaat: 1 });
    assert.deepEqual(ozet(tasimaItmesi(g, 'E1.10', 'M1', 6)), { 'E1.10': ['M1', 6, 'tasinan'], 'E1.20': ['M2', 11, 'itilen'] });
  });

  test('örtülü bağ: ardıl ilk partiyle başlar, öncülden önce bitmez; devir aralığı korunur', () => {
    const g = girdi({ 'E1.10': { m: 'M1', S: 0, d: 4, lot: 1 }, 'E1.20': { m: 'M2', S: 1, d: 4, lot: 1 } }, { 'E1.20': [['E1.10', 'o']] });
    const r = tasimaItmesi(g, 'E1.10', 'M1', 6);
    assert.deepEqual(ozet(r), { 'E1.10': ['M1', 6, 'tasinan'], 'E1.20': ['M2', 7, 'itilen'] });
    // Kısa ardıl öncülden önce bitmesin diye ilk partiden de geç başlar.
    const g2 = girdi({ 'E1.10': { m: 'M1', S: 0, d: 4, lot: 1 }, 'E1.20': { m: 'M2', S: 2, d: 2, lot: 1 } }, { 'E1.20': [['E1.10', 'o']] });
    assert.deepEqual(ozet(tasimaItmesi(g2, 'E1.10', 'M1', 6)), { 'E1.10': ['M1', 6, 'tasinan'], 'E1.20': ['M2', 8, 'itilen'] });
  });

  test('bağımsız adım kımıldamaz; yetişen ardıl da kımıldamaz', () => {
    const g = girdi({ 'E1.10': { m: 'M1', S: 0, d: 4 }, 'E1.20': { m: 'M2', S: 4, d: 4 }, 'E1.30': { m: 'M3', S: 20, d: 2 } }, { 'E1.30': [['E1.10', 'b']] });
    const r = tasimaItmesi(g, 'E1.10', 'M1', 6);
    assert.deepEqual(ozet(r), { 'E1.10': ['M1', 6, 'tasinan'] });
    assert.equal(r.ileti, null);
  });

  test('itme zincirlenir: ardılın ardılı da itilir', () => {
    const g = girdi({ 'E1.10': { m: 'M1', S: 0, d: 4 }, 'E1.20': { m: 'M2', S: 4, d: 4 }, 'E1.30': { m: 'M3', S: 8, d: 2 } },
      { 'E1.20': [['E1.10', 'b']], 'E1.30': [['E1.20', 'b']] });
    assert.deepEqual(ozet(tasimaItmesi(g, 'E1.10', 'M1', 6)), { 'E1.10': ['M1', 6, 'tasinan'], 'E1.20': ['M2', 10, 'itilen'], 'E1.30': ['M3', 14, 'itilen'] });
  });

  test('2794 2/3 b: başka emir itilmez; itilen adım tezgâhtaki en yakın boş yere oturur', () => {
    const g = girdi({ 'E1.10': { m: 'M1', S: 0, d: 4 }, 'E1.20': { m: 'M2', S: 4, d: 4 }, 'E2.10': { m: 'M2', S: 10, d: 3 } }, { 'E1.20': [['E1.10', 'b']] });
    const r = tasimaItmesi(g, 'E1.10', 'M1', 6);
    assert.deepEqual(ozet(r), { 'E1.10': ['M1', 6, 'tasinan'], 'E1.20': ['M2', 13, 'itilen'] });
  });

  test('başlamış ya da donuk ardıl sırayı bozacaksa taşımanın tamamı yapılmaz', () => {
    const g = girdi({ 'E1.10': { m: 'M1', S: 0, d: 4 }, 'E1.20': { m: 'M2', S: 4, d: 4, sabit: true } }, { 'E1.20': [['E1.10', 'b']] });
    const r = tasimaItmesi(g, 'E1.10', 'M1', 6);
    assert.equal(r.gecerli, false);
    assert.deepEqual(r.isler, []);
    assert.match(r.ileti!, /OP 20 başlamış/);
  });

  test('sabit iş taşınmaz; geçmişe iş konmaz; taşınan iş elle donuk bölgeye konabilir', () => {
    const g = girdi({ 'E1.10': { m: 'M1', S: 0, d: 4, sabit: true } }, {});
    assert.equal(tasimaItmesi(g, 'E1.10', 'M1', 6).gecerli, false);
    const g2 = girdi({ 'E1.10': { m: 'M1', S: 10, d: 4 } }, {}, { simdi: 0, donuk: 5 });
    assert.deepEqual(ozet(tasimaItmesi(g2, 'E1.10', 'M1', 3)), { 'E1.10': ['M1', 3, 'tasinan'] });
    const g3 = girdi({ 'E1.10': { m: 'M1', S: 10, d: 4 } }, {}, { simdi: 5, donuk: 5 });
    assert.match(tasimaItmesi(g3, 'E1.10', 'M1', 3).ileti!, /geçmiş/);
  });

  test('ufuk aşılırsa taşımanın tamamı yapılmaz (itilen adım için de)', () => {
    const g = girdi({ 'E1.10': { m: 'M1', S: 0, d: 4 }, 'E1.20': { m: 'M2', S: 4, d: 4 } }, { 'E1.20': [['E1.10', 'b']] }, { ufuk: 12 });
    const r = tasimaItmesi(g, 'E1.10', 'M1', 6);
    assert.equal(r.gecerli, false);
    assert.deepEqual(r.isler, []);
    assert.match(r.ileti!, /OP 20 planlama ufkuna sığmıyor/);
    assert.equal(tasimaItmesi(g, 'E1.10', 'M1', 10).gecerli, false);
  });

  test('tezgâh işe uygun değilse taşıma yapılmaz', () => {
    const g = girdi({ 'E1.10': { m: 'M1', S: 0, d: 4 } }, {}, { yer: () => null });
    assert.equal(tasimaItmesi(g, 'E1.10', 'M9', 6).gecerli, false);
  });

  test('öne alınan ardıl: öncül geri çekilir, zincir boyunca', () => {
    const g = girdi({ 'E1.10': { m: 'M1', S: 0, d: 4 }, 'E1.20': { m: 'M2', S: 4, d: 4 }, 'E1.30': { m: 'M3', S: 8, d: 2 } },
      { 'E1.20': [['E1.10', 'b']], 'E1.30': [['E1.20', 'b']] });
    const r = tasimaItmesi(g, 'E1.30', 'M3', 5);
    assert.equal(r.gecerli, true);
    assert.deepEqual(ozet(r), { 'E1.30': ['M3', 5, 'tasinan'], 'E1.20': ['M2', 1, 'cekilen'], 'E1.10': ['M1', -3, 'cekilen'] });
  });

  test('geri çekilen öncül başka emre çarpmaz', () => {
    const g = girdi({ 'E1.10': { m: 'M1', S: 0, d: 4 }, 'E1.20': { m: 'M2', S: 4, d: 4 }, 'E2.10': { m: 'M1', S: -3, d: 2 } }, { 'E1.20': [['E1.10', 'b']] });
    const r = tasimaItmesi(g, 'E1.20', 'M2', 2);
    assert.deepEqual(ozet(r), { 'E1.20': ['M2', 2, 'tasinan'], 'E1.10': ['M1', -7, 'cekilen'] });
  });

  test('2794 3/3 b: öncül şimdiye çarparsa engelden sonra oturur, taşınan iş arkasına kayar; neden tek satır', () => {
    const g = girdi({ 'E1.10': { m: 'M1', S: 0, d: 4 }, 'E1.20': { m: 'M2', S: 4, d: 4 } }, { 'E1.20': [['E1.10', 'b']] }, { simdi: 0, donuk: 0 });
    const r = tasimaItmesi(g, 'E1.20', 'M2', 2);
    assert.equal(r.gecerli, true);
    assert.deepEqual(ozet(r), { 'E1.20': ['M2', 4, 'tasinan'] });
    assert.equal(r.ileti, "OP 10 en erken 0 başlayabilir (şimdi); OP 20 4 saatine kaydı.");
  });

  test('2794 3/3 b: öncül donuk bölgeye çarparsa donuk sınırına çekilir, taşınan iş arkasına kayar', () => {
    const g = girdi({ 'E1.10': { m: 'M1', S: 5, d: 4 }, 'E1.20': { m: 'M2', S: 9, d: 4 } }, { 'E1.20': [['E1.10', 'b']] }, { simdi: 0, donuk: 3 });
    const r = tasimaItmesi(g, 'E1.20', 'M2', 4);
    assert.deepEqual(ozet(r), { 'E1.20': ['M2', 7, 'tasinan'], 'E1.10': ['M1', 3, 'cekilen'] });
    assert.match(r.ileti!, /OP 10 en erken 3 başlayabilir \(donuk bölge\)/);
  });

  test('2794 3/3 b: öncül başlamışsa kımıldamaz, taşınan iş arkasına kayar', () => {
    const g = girdi({ 'E1.10': { m: 'M1', S: 0, d: 4, sabit: true }, 'E1.20': { m: 'M2', S: 6, d: 4 } }, { 'E1.20': [['E1.10', 'b']] }, { simdi: 1, donuk: 1 });
    const r = tasimaItmesi(g, 'E1.20', 'M2', 2);
    assert.deepEqual(ozet(r), { 'E1.20': ['M2', 4, 'tasinan'] });
    assert.match(r.ileti!, /\(başlamış\)/);
  });

  test('örtülü öncül geri çekilirken yalnız ilk partisi yetişir, ardıl öncülden önce bitmez', () => {
    const g = girdi({ 'E1.10': { m: 'M1', S: 0, d: 4, lot: 1 }, 'E1.20': { m: 'M2', S: 1, d: 4, lot: 1 } }, { 'E1.20': [['E1.10', 'o']] }, { simdi: 0, donuk: 0 });
    // 0,5'te başlamak için öncülün ilk partisi -0,5'te olmalı; şimdi engeldir, taşınan iş 1'e kayar.
    const r = tasimaItmesi(g, 'E1.20', 'M2', 0.5);
    assert.deepEqual(ozet(r), { 'E1.20': ['M2', 1, 'tasinan'] });
  });

  test('örtülü öncül ilk partisi yetişecek kadar geri çekilir', () => {
    const g = girdi({ 'E1.10': { m: 'M1', S: 2, d: 4, lot: 1 }, 'E1.20': { m: 'M2', S: 3, d: 4, lot: 1 } }, { 'E1.20': [['E1.10', 'o']] }, { simdi: 0, donuk: 0 });
    const r = tasimaItmesi(g, 'E1.20', 'M2', 2);
    assert.deepEqual(ozet(r), { 'E1.20': ['M2', 2, 'tasinan'], 'E1.10': ['M1', 1, 'cekilen'] });
    assert.equal(r.ileti, null);
  });

  test('başka tezgâha taşıma: eski ve yeni tezgâh sonuçta', () => {
    const g = girdi({ 'E1.10': { m: 'M1', S: 0, d: 4 } }, {});
    const r = tasimaItmesi(g, 'E1.10', 'M2', 0);
    assert.deepEqual(r.isler, [{ isId: 'E1.10', tezgah: 'M2', S: 0, C: 4, eskiTezgah: 'M1', eskiS: 0, tur: 'tasinan' }]);
  });
});
