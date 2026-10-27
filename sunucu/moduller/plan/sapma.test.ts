import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planSapmalari } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';
import { sapmaOlcusu, type SapmaGirdisi } from './sapma-kurallar.ts';

// 781 a, 782: plandan sapma plan modülünde hesaplanır. Kural saf; okuma gerçek PostgreSQL'de. Veriler uydurmadır.

// Dakika ekseni: 0-480 ve 960-1440 çalışma, arası kapalı.
const TAKVIM = [{ baslangic: 0, bitis: 480 }, { baslangic: 960, bitis: 1440 }];
const girdi = (p: Partial<SapmaGirdisi> = {}): SapmaGirdisi => ({
  canli: { kaynak: { tur: 'makine', id: 1 }, baslangic: 60, bitis: 300 }, taban: { kaynak: { tur: 'makine', id: 1 }, baslangic: 0, bitis: 240 },
  durum: 'tamam', giris: 60, bitis: 1020, makineler: [1], kalanDk: null, takvim: TAKVIM, simdi: 1100, oncekiler: [30], ...p,
});

describe('plan: sapma kuralı', () => {
  test('biten iş: kayma net dakikadır (kapalı saat sayılmaz), süre oranı net sürelerin oranı', () => {
    const o = sapmaOlcusu(girdi());
    // Canlı bitiş 300, gerçek 1020: 300-480 (180) + 960-1020 (60) = 240 net dakika.
    assert.deepEqual([o.bitisKaymasiDk, o.tabanBitisKaymasiDk, o.tahminiBitis], [240, 300, null]);
    // Gerçek 60-1020 net 480, planlı 60-300 net 240.
    assert.equal(o.sureOrani, 2);
    assert.deepEqual([o.tezgahUyumu, o.siraUyumu], [true, true]);
  });

  test('erken biten iş eksi kayar', () => {
    assert.equal(sapmaOlcusu(girdi({ bitis: 200 })).bitisKaymasiDk, -100);
  });

  test('çalışan iş: kalan süre şimdiden takvime yayılır, kayma tahmini bitişe göredir; süre oranı yalnız biten işte', () => {
    const o = sapmaOlcusu(girdi({ durum: 'calisiyor', bitis: null, simdi: 400, kalanDk: 120 }));
    // 400-480 (80) kapalı aradan sonra 960-1000 (40).
    assert.deepEqual([o.tahminiBitis, o.bitisKaymasiDk, o.sureOrani], [1000, 220, null]);
  });

  test('takvim okunamazsa net ölçüler boş, sıfır uydurulmaz; uyumlar takvimsiz de hesaplanır', () => {
    const o = sapmaOlcusu(girdi({ takvim: undefined, durum: 'calisiyor', bitis: null, kalanDk: 60 }));
    assert.deepEqual([o.tahminiBitis, o.bitisKaymasiDk, o.tabanBitisKaymasiDk, o.sureOrani], [null, null, null, null]);
    assert.deepEqual([o.tezgahUyumu, o.siraUyumu], [true, true]);
  });

  test('tezgâh uyumu: biri farklıysa false; kullanım yoksa ya da planlı kaynak kişiyse boş', () => {
    assert.equal(sapmaOlcusu(girdi({ makineler: [1, 2] })).tezgahUyumu, false);
    assert.equal(sapmaOlcusu(girdi({ makineler: [] })).tezgahUyumu, null);
    assert.equal(sapmaOlcusu(girdi({ canli: { kaynak: { tur: 'kisi', id: 4 }, baslangic: 60, bitis: 300 } })).tezgahUyumu, null);
  });

  test('sıra uyumu: önceki iş başlamamışken ya da bundan sonra başladıysa false; başlamamış işte ve canlı plansız makinede boş', () => {
    assert.equal(sapmaOlcusu(girdi({ oncekiler: [null] })).siraUyumu, false);
    assert.equal(sapmaOlcusu(girdi({ oncekiler: [90] })).siraUyumu, false);
    assert.equal(sapmaOlcusu(girdi({ oncekiler: [] })).siraUyumu, true);
    assert.equal(sapmaOlcusu(girdi({ giris: null, bitis: null, durum: 'bekliyor' })).siraUyumu, null);
    assert.equal(sapmaOlcusu(girdi({ oncekiler: undefined })).siraUyumu, null);
  });
});

describe('plan (gerçek PostgreSQL): plan sapması', () => {
  const { c, tamam, yeniAdim, isEmirleriAc, planOku, yer, taslaktaOner, durum } = planTestOrtami();
  const gonder = async (id: number, surum: number) => {
    const s = (await tamam<SenaryolarCevabi>(c.planlama, 'GET', '/plan/senaryolar')).senaryolar.find((x) => x.id === id);
    if (s?.durum === 'onayda') return s.surum;
    return (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${id}/onaya-gonder`, { surum })).senaryolar.find((x) => x.id === id)!.surum;
  };
  const canliyaAl = async (p: PlanCevabi) =>
    tamam<SenaryolarCevabi>(c.mudur, 'POST', `/plan/senaryolar/${p.taslak!.id}/canliya-al`, { surum: await gonder(p.taslak!.id, p.taslak!.surum), cakismalariKabul: true });
  let ortam: TestVeritabani | undefined;
  let makineA = 0;
  before(() => { ({ ortam, makineA } = durum()); });

  test('782: canlıya göre geç biten iş net dakikayla kayar; sıra atlayan iş false; başlamamış işin ölçüleri boş; bilinmeyen kimlik yok', async () => {
    const [x, y] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA } }), yeniAdim({ kaynak: { tur: 'makine', id: makineA } })]);
    await canliyaAl(await taslaktaOner());
    const canli = await planOku();
    const [once, sonra] = [x!, y!].sort((a, b) => Date.parse(yer(canli, a).baslangic) - Date.parse(yer(canli, b).baslangic));
    const plan = yer(canli, sonra!);
    // Sonraki iş, önceki başlamadan planlı makinede planlı saatte başlar ve 60 dakika geç biter (tam gün vardiya: net = duvar saati).
    const bitis = new Date(Date.parse(plan.bitis) + 60 * 60_000).toISOString();
    await ortam!.sahip.sorgu("UPDATE uretim_emirleri_is_emri SET durum = 'tamam', baslama = $2, bitis = $3, saglam_adet = 10 WHERE id = $1", [sonra, plan.baslangic, bitis]);
    await ortam!.sahip.sorgu(
      `INSERT INTO uretim_emirleri_makine_kullanimi (emir_id, is_emri_id, istasyon_id, makine_id, kisi_id, baslama, bitis, kapatan_id)
       SELECT i.uretim_emri_id, i.id, m.istasyon_id, m.id, k.id, $3, $4, k.id FROM uretim_emirleri_is_emri i, makine m, kisi k
        WHERE i.id = $1 AND m.id = $2 AND k.kullanici_adi = 'mudur'`, [sonra, makineA, plan.baslangic, bitis]);
    const r = await ortam!.vt.tx((db) => planSapmalari(db, { isEmriIdleri: [once!, sonra!, 2147483000], simdi: Date.parse(bitis) + 3600_000 }));
    assert.equal(r.size, 2, 'bilinmeyen kimlik haritada yok');
    const s = r.get(sonra!)!;
    const surum = (await ortam!.sahip.tek<{ surum: number }>('SELECT surum FROM plan_durumu'))!.surum;
    assert.deepEqual([s.planSurumu, s.canli?.kaynak, s.taban?.kaynak], [surum, { tur: 'makine', id: makineA }, { tur: 'makine', id: makineA }]);
    assert.deepEqual([Date.parse(s.gercekBaslama!), Date.parse(s.gercekBitis!)], [Date.parse(plan.baslangic), Date.parse(bitis)]);
    assert.deepEqual([s.bitisKaymasiDk, s.tabanBitisKaymasiDk, s.tahminiBitis], [60, 60, null]);
    assert.ok(s.sureOrani !== null && s.sureOrani > 1, String(s.sureOrani));
    assert.deepEqual([s.tezgahUyumu, s.siraUyumu], [true, false]);
    const o = r.get(once!)!;
    assert.deepEqual([o.gercekBaslama, o.bitisKaymasiDk, o.sureOrani, o.tezgahUyumu, o.siraUyumu], [null, null, null, null, null]);
    assert.equal((await ortam!.vt.tx((db) => planSapmalari(db, { isEmriIdleri: [] }))).size, 0);
  });
});
