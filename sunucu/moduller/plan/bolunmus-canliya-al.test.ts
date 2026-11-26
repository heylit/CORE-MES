import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { kullaniciYukle } from '../kisiler/disari.ts';
import { emirBaslat } from '../uretim-emirleri/disari.ts';
import { payIlerlemesiCozucusu, type PayIlerlemesiCozucusu } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 3734: bölünmüş işin payları canlıya alma yazımında motorun önizlemesindeki saatinde yerleşir (Kokpit ile aynı malzeme hazır anı ve öncül
// sınırı); ardıl adım son payın bitişinden sonra başlar, geçmişte başlamış bir pay geç biten payı gölgelemez. Veriler uydurmadır.
// Merkez tam gün çalışır (00:00-24:00): süre takvim dakikasıdır. Ayar 30 dk, birim 2 dk.
describe('plan (gerçek PostgreSQL): bölünmüş adımın payları önizlemedeki saatinde canlıya gider (3734)', () => {
  const { c, vt, tamam, istek, isEmirleriAc, yeniAdim, planOku, yer, tamGunMerkezi, durum } = planTestOrtami();
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
    return { istC, c1: await makine('RT-PC1', istC), c2: await makine('RT-PC2', istC), d1: await makine('RT-PD1', istD) };
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

  // 3734-2 (kullanıcı kararı a, 26.11): çalışan bölünmüş adımın sayımı olmayan payı Kokpit'teki yerine taşınır; çalışan pay yerinde kalır.
  // Çalışan bölünmüş adım: bölme canlıya yazılır, emir başlatılır, Kokpit 2. payı (malzemeyi bekleyerek) 4 gün sonraya koyar; 1. payın
  // önizlemesi farklı olsa da çalışan pay oynamaz. cozucu, hangi payın sayıldığını söyleyen pay ilerlemesi çözücüsüdür (null: bağlı değil).
  const calisanBolme = async (cozucu: ((c2: number, op10: number) => PayIlerlemesiCozucusu) | null) => {
    const { istC, c1, c2, d1 } = await kur();
    const [op10, op20] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: c1 } }), yeniAdim({ kaynak: { tur: 'makine', id: d1 } })], 30);
    const canli = await planOku();
    const bul = (id: number) => canli.yerlesimler.find((y) => y.isEmriId === id) ?? canli.yerlesmemis.find((y) => y.isEmriId === id)!;
    const isi = (id: number, bas: number, bit: number, ek: Record<string, unknown> = {}) => ({ emirNo: bul(id).emirNo, opNo: bul(id).opNo, dondurulmus: false, elle: true, elleKaynak: true, onizleme: { baslangic: iso(bas), bitis: iso(bit) }, ...ek });
    const T = dakika(Date.now() + 3600_000), U = T + 86400_000, V = T + 4 * 86400_000;
    const kuyruklar = (pay1: readonly [number, number], pay2: readonly [number, number]) => [
      { kaynak: { tur: 'makine', id: c1 }, baslangic: iso(pay1[0]), isler: [isi(op10!, ...pay1, { parca: { no: 1, adet: 10 } })] },
      { kaynak: { tur: 'makine', id: c2 }, baslangic: iso(pay2[0]), isler: [isi(op10!, ...pay2, { parca: { no: 2, adet: 20 } })] },
      { kaynak: { tur: 'makine', id: d1 }, baslangic: iso(pay2[1]), isler: [{ emirNo: bul(op20!).emirNo, opNo: bul(op20!).opNo, dondurulmus: false }] },
    ];
    const ilk = await yazVeOku(kuyruklar([T, T + 50 * DK], [U, U + 70 * DK]));
    assert.equal((await canliyaAl(ilk)).statusCode, 200);
    const { operatorId } = durum();
    await vt().tx((db) => db.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [operatorId, istC]));
    const op = (await vt().tx((db) => kullaniciYukle(db, operatorId)))!;
    const emir = (await vt().tx((db) => db.tek<{ u: number }>('SELECT uretim_emri_id AS u FROM uretim_emirleri_is_emri WHERE id = $1', [op10])))!.u;
    await vt().tx((db) => emirBaslat(db, op, emir));
    const payOku = (p: PlanCevabi) => yer(p, op10!).parcalar!.map((y) => [y.no, y.kaynak.id, y.baslangic, y.bitis]);
    const once = payOku(await planOku());
    payIlerlemesiCozucusu(cozucu === null ? null : cozucu(c2, op10!));
    try {
      const p = await yazVeOku(kuyruklar([T + 10 * DK, T + 70 * DK], [V, V + 70 * DK]));
      const r = await canliyaAl(p);
      assert.equal(r.statusCode, 200, r.body);
      return { once, taslak: payOku(p), sonra: payOku(await planOku()), ardil: Date.parse(yer(p, op20!).baslangic), V, c1, c2 };
    } finally {
      payIlerlemesiCozucusu(null);
    }
  };

  test('çalışan bölünmüş adım: sayımı olmayan pay önizlemedeki yerine gider, çalışan pay canlıdaki yerinde kalır; ardıl son paydan sonra', async () => {
    const { once, taslak, sonra, ardil, V, c1, c2 } = await calisanBolme(() => async () => new Map());
    assert.deepEqual(taslak[0], once[0], 'çalışan pay yerinde');
    assert.deepEqual([taslak[1]![2], taslak[1]![3]], [iso(V), iso(V + 70 * DK)], 'başlamamış pay önizlemedeki yerinde');
    assert.ok(ardil >= V + 70 * DK, `ardıl son payın bitişinden sonra: ${iso(ardil)}`);
    assert.deepEqual(sonra, taslak, 'canlıda da aynı');
    assert.equal(sonra[0]![1], c1);
    assert.equal(sonra[1]![1], c2);
  });

  test('çalışan bölünmüş adım: ikinci tezgâhta sayımı olan pay da canlıdaki yerinde kalır', async () => {
    const { once, taslak, sonra } = await calisanBolme((c2, op10) => async () => new Map([[op10, [{ makineId: c2, kisiId: null, sayilan: 3 }]]]));
    assert.deepEqual(taslak, once, 'iki pay da yerinde');
    assert.deepEqual(sonra, once, 'canlıda da yerinde');
  });

  test('çalışan bölünmüş adım: pay ilerlemesi bilinmiyorsa (çözücü bağlı değil) iş A4 gibi yerinde kalır', async () => {
    const { once, taslak, sonra } = await calisanBolme(null);
    assert.deepEqual(taslak, once, 'iki pay da yerinde');
    assert.deepEqual(sonra, once, 'canlıda da yerinde');
  });
});
