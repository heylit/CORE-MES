import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { degerlendirmeYap } from '../degerlendirme.ts';
import { planGirdisi } from '../plan-girdisi.ts';
import { motorYukle } from '../plan-motoru.ts';
import { teklifDenemesi, type DenemeIstegi } from '../teklif-denemesi.ts';
import { girdiFarki, farkMetni } from './esdegerlik.ts';
import type { KaynakDilimiOkumasi } from './kaynaklar-kurallar.ts';

// 1720 değerlendirme: bayrak açıkken planlama değerlendirmesi ve satış teklifi denemesi de kendi iş parçacıklarında kaynak alanlarını tipli
// dilimle kurar (girdi/birlestirme.ts, dinamik import). Aynı veri eski biçimde (KAYNAK) ve tipli biçimde (OKUMA) verilir; sonuç aynı olmalı.
// Tipli dilim gerçekten uygulanıyor mu, ayrı bir tatille sınanır; iş parçacığı tipli dilimle hata verirse eski yolla sürer. Veriler uydurmadır.

const tezgah = (id: string, grup: string, ucret: number | null): Record<string, unknown> => ({ id, ad: id, grup, ucret, verim: 1, vardiyalar: ['3'], opOran: 0 });
const KAYIT = {
  version: 7, savedAt: 9,
  items: [
    { id: '50', code: 'MM-1', name: 'Ornek mil', type: 'mamul' },
    { id: 'H1', code: 'H1', name: 'Ornek cubuk', type: 'ham', unit: 'kg', cost: 10, stock: 100, plan: { kod: 'H1', ad: 'Ornek cubuk', birim: 'kg', stok: 100, birimFiyat: 10, tedarikGun: 5, muayeneGun: 0 } },
  ],
  opdefs: [{ id: '13', name: 'Tornalama' }],
  machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', plan: tezgah('100', '10', 750) }],
  routes: { 50: { base: null, steps: [{ id: '50-o10', seq: 10, opNo: 10, opId: '13', stationId: '10', setup: 0, cycle: 30, alts: [], altTimes: {}, ins: [{ id: 'n1', itemId: 'H1', qty: 2 }] }] } },
  orders: [
    { id: 'O1', no: 'E-1', itemId: '50', qty: 10, start: '2026-10-19', due: '2026-10-20', priority: 2, status: 'serbest' },
    { id: 'O2', no: 'E-2', itemId: '50', qty: 16, start: '2026-10-19', due: '2026-10-21', priority: 2, status: 'serbest' },
  ],
};
const HAFTA = { 1: ['3'], 2: ['3'], 3: ['3'], 4: ['3'], 5: ['3'] };
const kaynak = (takvimli: boolean) => ({
  durum: {
    wcs: [{ id: '1', code: 'IM-1', name: 'Talasli', week: null, aktif: true }],
    stations: [{ id: '10', code: 'TOR', name: 'Torna', wcId: '1', eff: 100, opPer: 1, count: 1, aktif: true }],
    machines: [{ id: '100', code: 'T1', name: 'Torna 1', stationId: '10', status: 'aktif', aktif: true }],
    people: [],
    cal: { shifts: [{ id: '3', name: 'Gunduz', start: '08:00', end: '16:00', breaks: [] }], holidays: [] },
  },
  ek: { takvim: takvimli ? { hafta: { 1: HAFTA }, kisiVardiyasi: {} } : null, makineNotu: null, kisiGorevi: null },
});
// Aynı kaynaklar tipli okuma olarak (kaynaklar.ts'in biçimi).
const okuma = (takvimli: boolean): KaynakDilimiOkumasi => ({
  vardiyalar: [{ id: 3, bas: '08:00', bit: '16:00', molalar: [] }],
  tatiller: [],
  istasyon: { merkezler: [{ id: 1 }], istasyonlar: [{ id: 10, merkezId: 1, verimYuzde: 100, operatorOrani: 1 }], makineler: [{ id: 100, ad: 'Torna 1', istasyonId: 10 }] },
  takvim: takvimli ? { hafta: [1, 2, 3, 4, 5].map((gun) => ({ merkezId: 1, gun: gun as 1, vardiyaId: 3 })), kisiVardiyasi: [] } : null,
  istasyonMaliyeti: null,
  kisiler: [],
  izinler: null,
});
const calismaKur = (): Record<string, unknown> => ({
  surum: 2, D: { meta: { ad: 'Ornek', baslangic: '2026-10-19' }, vardiyalar: [], calismaGunleri: {}, tatiller: [], urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
  rrSavedAt: 5, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, w: { famK: 0.3, mat: 'sert', dondurma: 4 },
  param: { tampon: false, tamponZ: 0, acilPay: 0 }, kapali: [], olaylar: [], plan: null,
});
function planli(): Record<string, unknown> {
  const c = calismaKur();
  const g = planGirdisi({ calisma: c, kayit: KAYIT, kaynak: kaynak(true), bugun: '2026-10-19' });
  assert.ok(g);
  const m = motorYukle(); const p = m.schedule(g.st, 'dagit', null);
  const e = m.evaluate(p, g.st, null, false) as { J: Record<string, { C: number; T: number }> };
  return { ...c, plan: { ops: p.ops, fail: [], J: Object.fromEntries(Object.entries(e.J).map(([k, x]) => [k, { C: x.C, T: x.T }])), dataVer: 1 } };
}
const AN = Date.parse('2026-10-19T06:00:00Z');
const TATILLI = { ...okuma(true), tatiller: ['2026-10-19', '2026-10-20'] };
const BOZUK = { ...okuma(true), vardiyalar: null } as unknown as KaynakDilimiOkumasi;

describe('değerlendirme ve teklif denemesi tipli kaynakla (1720 değerlendirme)', () => {
  const calisma = planli();
  const degerlendir = (kaynakDilimi: KaynakDilimiOkumasi | null) =>
    degerlendirmeYap({ calisma, kayit: KAYIT, kaynak: kaynak(true), bugun: '2026-10-19', istek: { tur: 'plan-kur' }, kaynakDilimi }, AN);

  test('DE-00: iki biçim aynı kaynak alanlarını kurar (senaryonun ön koşulu)', () => {
    const istek = { calisma, kayit: KAYIT, kaynak: kaynak(true), bugun: '2026-10-19' };
    assert.equal(farkMetni(girdiFarki(planGirdisi(istek)?.S, planGirdisi({ ...istek, kaynakDilimi: okuma(true) })?.S)), '');
  });

  test('DE-01: değerlendirme tipli dilimle eski yolla aynı; dilim iş parçacığında gerçekten uygulanır', async () => {
    const eski = await degerlendir(null);
    assert.equal(farkMetni(girdiFarki(eski, await degerlendir(okuma(true)))), '');
    assert.notEqual(farkMetni(girdiFarki(eski, await degerlendir(TATILLI))), '', 'tipli dilimdeki tatil sonucu değiştirmeli');
  });

  test('DE-02: tipli dilimle iş parçacığı hata verirse değerlendirme eski yolla sürer', async () => {
    assert.equal(farkMetni(girdiFarki(await degerlendir(null), await degerlendir(BOZUK))), '');
  });

  // Teklif yolunun okumasında takvim eki yoktur; servis tipli dilimi de takvimsiz verir (planlama-servis.ts teklifDene).
  const teklif = (kaynakDilimi: KaynakDilimiOkumasi | null, takvimli = false) => {
    const D = { ...(calisma['D'] as object), calismaGunleri: { pzt: ['3'], sal: ['3'], car: ['3'], per: ['3'], cum: ['3'], cmt: [], paz: [] } };
    const istek: DenemeIstegi = {
      calisma: { ...calisma, D, rrSavedAt: 9 }, kayit: KAYIT, kaynak: kaynak(takvimli), bugun: '2026-10-19', kaynakDilimi,
      kalemler: [{ id: 'TK-1', urun: '50', adet: 4 }], termin: null, taslaklar: [], haric: null, tamponGun: 0, gecerlilik: '2026-11-30',
    };
    return teklifDenemesi(istek, 30_000, AN);
  };
  const takvimsiz = (o: KaynakDilimiOkumasi): KaynakDilimiOkumasi => ({ ...o, takvim: null });

  test('DE-03: teklif denemesi takvimsiz tipli dilimle eski yolla aynı; hata verirse eski yolla sürer', async () => {
    const eski = await teklif(null);
    assert.ok(eski);
    assert.equal(farkMetni(girdiFarki(eski, await teklif(takvimsiz(okuma(true))))), '');
    assert.equal(farkMetni(girdiFarki(eski, await teklif(takvimsiz(BOZUK)))), '');
  });

  // Takvim eki yokken eski yol çalışma günlerini boşaltır, teklif hiçbir gün çalışmaz (TASARIM.md bulgu 2); dilimin iş parçacığında
  // uygulandığı bu yüzden takvimli okumayla görülür.
  test('DE-04: teklif denemesinde tipli dilim iş parçacığında gerçekten uygulanır', async () => {
    const eski = await teklif(null, true);
    assert.equal(farkMetni(girdiFarki(eski, await teklif(okuma(true), true))), '');
    assert.notEqual(farkMetni(girdiFarki(eski, await teklif(TATILLI, true))), '', 'tipli dilimdeki tatil sonucu değiştirmeli');
  });
});
