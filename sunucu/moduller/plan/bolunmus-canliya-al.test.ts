import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 3734: bölünmüş işin payları canlıya alma yazımında motorun önizlemesindeki saatinde yerleşir (Kokpit ile aynı malzeme hazır anı ve öncül
// sınırı); ardıl adım son payın bitişinden sonra başlar, geçmişte başlamış bir pay geç biten payı gölgelemez. Veriler uydurmadır.
// Merkez tam gün çalışır (00:00-24:00): süre takvim dakikasıdır. Ayar 30 dk, birim 2 dk.
describe('plan (gerçek PostgreSQL): bölünmüş adımın payları önizlemedeki saatinde canlıya gider (3734)', () => {
  const { c, tamam, istek, isEmirleriAc, yeniAdim, planOku, yer, tamGunMerkezi } = planTestOrtami();
  const DK = 60_000;
  const gonder = async (id: number, surum: number) =>
    (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${String(id)}/onaya-gonder`, { surum })).senaryolar.find((x) => x.id === id)!.surum;
  let sayac = 0;
  // İki tezgâhlı bölme istasyonu (c1, c2) ve ardılın tezgâhı (d1).
  const kur = async () => {
    sayac += 1;
    const merkez = await tamGunMerkezi(`RT-PM${String(sayac)}`, `Deneme pay merkezi ${String(sayac)}`);
    const ist = async (kod: string) => (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: `${kod}${String(sayac)}`, ad: `Deneme ${kod}`, isMerkeziId: merkez })).id;
    const istC = await ist('RT-PC'), istD = await ist('RT-PD');
    const makine = async (kod: string, istasyonId: number) => (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: `${kod}${String(sayac)}`, ad: `Deneme ${kod}`, istasyonId })).id;
    return { c1: await makine('RT-PC1', istC), c2: await makine('RT-PC2', istC), d1: await makine('RT-PD1', istD) };
  };
  const dakika = (t: number) => Math.ceil(t / DK) * DK;
  const iso = (t: number) => new Date(t).toISOString();

  const yazVeOku = async (kuyruklar: unknown[]) => {
    const r = await istek(c.planlama, 'POST', '/plan/kuyruklari-yaz', { kuyruklar });
    assert.equal(r.statusCode, 200, r.body);
    return planOku(r.json<{ taslak: number }>().taslak);
  };
  const canliyaAl = async (p: PlanCevabi) =>
    istek(c.planlama, 'POST', `/plan/senaryolar/${String(p.taslak!.id)}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });

  test('pay saatleri önizlemeyle dakikası dakikasına aynı; tezgâhtaki öteki iş payın etrafına dizilir; ardıl son paydan sonra; sıra denetimi geçer', async () => {
    const { c1, c2, d1 } = await kur();
    // 30 adet: 10 + 20. 2. pay malzemeyi bekler (motorun önizlemesi 3 gün sonra); c2 o arada başka işi işler.
    const [op10, op20] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: c1 } }), yeniAdim({ kaynak: { tur: 'makine', id: d1 } })], 30);
    const [x] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: c2 } })], 5);
    const canli = await planOku();
    const bul = (id: number) => canli.yerlesimler.find((y) => y.isEmriId === id) ?? canli.yerlesmemis.find((y) => y.isEmriId === id)!;
    const isi = (id: number, bas: number, bit: number, ek: Record<string, unknown> = {}) => ({ emirNo: bul(id).emirNo, opNo: bul(id).opNo, dondurulmus: false, elle: true, elleKaynak: true, onizleme: { baslangic: iso(bas), bitis: iso(bit) }, ...ek });
    const T = dakika(Date.now() + 2 * 3600_000), U = T + 3 * 86400_000;
    const pay1 = [T, T + 50 * DK] as const, pay2 = [U, U + 70 * DK] as const, ard = [pay2[1], pay2[1] + 90 * DK] as const;
    const p = await yazVeOku([
      { kaynak: { tur: 'makine', id: c1 }, baslangic: iso(T), isler: [isi(op10!, ...pay1, { parca: { no: 1, adet: 10 } })] },
      { kaynak: { tur: 'makine', id: c2 }, baslangic: iso(T), isler: [isi(x!, T, T + 40 * DK), isi(op10!, ...pay2, { parca: { no: 2, adet: 20 } })] },
      { kaynak: { tur: 'makine', id: d1 }, baslangic: iso(ard[0]), isler: [isi(op20!, ...ard)] },
    ]);
    const paylar = yer(p, op10!).parcalar!.map((y) => [y.no, y.kaynak.id, Date.parse(y.baslangic), Date.parse(y.bitis)]);
    assert.deepEqual(paylar, [[1, c1, ...pay1], [2, c2, ...pay2]], 'paylar önizlemedeki saatinde');
    assert.ok(Date.parse(yer(p, x!).bitis) <= pay2[0], 'c2 deki iş payın önüne sığar');
    assert.ok(Date.parse(yer(p, op20!).baslangic) >= pay2[1], `ardıl son payın bitişinden sonra: ${yer(p, op20!).baslangic}`);
    const r = await canliyaAl(p);
    assert.equal(r.statusCode, 200, r.body);
    const sonra = await planOku();
    assert.deepEqual(yer(sonra, op10!).parcalar!.map((y) => [y.no, Date.parse(y.baslangic), Date.parse(y.bitis)]), [[1, ...pay1], [2, ...pay2]], 'canlıda da aynı');
  });

  test('geçmişte başlamış 1. pay 2. payı gölgelemez: ardıl son payı bekler, canlıya alma sıra denetiminden geçer', async () => {
    const { c1, c2, d1 } = await kur();
    const [op10, op20] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: c1 } }), yeniAdim({ kaynak: { tur: 'makine', id: d1 } })], 30);
    const canli = await planOku();
    const bul = (id: number) => canli.yerlesimler.find((y) => y.isEmriId === id) ?? canli.yerlesmemis.find((y) => y.isEmriId === id)!;
    const isi = (id: number, bas: number, bit: number, ek: Record<string, unknown> = {}) => ({ emirNo: bul(id).emirNo, opNo: bul(id).opNo, dondurulmus: false, elle: true, elleKaynak: true, onizleme: { baslangic: iso(bas), bitis: iso(bit) }, ...ek });
    const simdi = dakika(Date.now()), U = dakika(Date.now() + 86400_000);
    const pay1 = [simdi - 6 * 3600_000, simdi - 6 * 3600_000 + 50 * DK] as const, pay2 = [U, U + 70 * DK] as const;
    const p = await yazVeOku([
      { kaynak: { tur: 'makine', id: c1 }, baslangic: iso(simdi), isler: [isi(op10!, ...pay1, { parca: { no: 1, adet: 10 } })] },
      { kaynak: { tur: 'makine', id: c2 }, baslangic: iso(U), isler: [isi(op10!, ...pay2, { parca: { no: 2, adet: 20 } })] },
      // Ardılın önizlemesi verilmez: sunucu motoru onu bölünmüş öncülün parçalarına göre dizer.
      { kaynak: { tur: 'makine', id: d1 }, baslangic: iso(simdi), isler: [{ emirNo: bul(op20!).emirNo, opNo: bul(op20!).opNo, dondurulmus: false }] },
    ]);
    assert.ok(Date.parse(yer(p, op20!).baslangic) >= pay2[1], `ardıl son payın bitişinden sonra: ${yer(p, op20!).baslangic}`);
    const r = await canliyaAl(p);
    assert.equal(r.statusCode, 200, r.body);
  });
});
