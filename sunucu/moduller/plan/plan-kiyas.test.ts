import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import { PLANLAMA_ANAHTARI, sunucuPlanCozucusu } from '../recete-rota/disari.ts';
import type { PlanMotoruIstegi } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// ADR 0018 karar 6: asıl plan ortak motora geçmeden önce aynı veriyle bugünkü motor (oner) ve ortak motor kıyaslanır. Plan modülü motoru
// ithal etmez; kıyas test dosyasındadır (testin ithali akış yönü değildir). Ortak motora oner'in tezgâh sırası verilir (sabit kip), fark
// yalnız saatlerdedir. Farklar kullanıcıya liste olarak gider; test yalnız kıyasın kurulabildiğini ve sıranın korunduğunu sınar.
// Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): oner ile ortak motor kıyası (ADR 0018)', () => {
  const { c, vt, tamam, yeniAdim, isEmirleriAc, taslaktaOner, durum } = planTestOrtami();

  const anahtarlar = async (idler: readonly number[]) => new Map((await vt().tx((db) => db.sorgu<{ id: number; emirNo: string; opNo: number }>(
    `SELECT i.id, e.emir_no AS "emirNo", i.op_no AS "opNo" FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id
     WHERE i.id = ANY($1::int[])`, [idler]))).map((x) => [x.id, `${x.emirNo}|${String(x.opNo)}`]));

  // Planlama sayfasının kaydına benzer çalışma: başlangıç bugün; vardiya verilirse her gün açık (sayfanın tek takvimi, iş merkezi haftası
  // sunucuda okunmuyor).
  // oner ayarcı ve personel kapasitesini saymaz (personel yalnız sayılır, P-B19): kıyas aynı modelle, sayfadaki bu iki kısıt kapalıyken.
  const KAPALI = ['ayarci', 'personel'];
  let calismaSurumu: number | null = null;
  const calismaYaz = async (vardiya: string | null) => {
    const bugun = new Date().toISOString().slice(0, 10);
    const gun = vardiya === null ? [] : [vardiya];
    const calisma = {
      surum: 2, rrSavedAt: null, dataVer: 1, down: [], ekMesai: [], locks: {}, gercek: {}, kapali: KAPALI, olaylar: [], plan: null,
      w: { famK: 0.3, mat: 'uyari', dondurma: 0 }, param: { tampon: false, tamponZ: 0, acilPay: 0 },
      D: { meta: { ad: 'Kiyas', baslangic: bugun }, vardiyalar: vardiya === null ? [] : [{ id: vardiya, bas: '08:00', bit: '16:00' }],
        calismaGunleri: Object.fromEntries(['pzt', 'sal', 'car', 'per', 'cum', 'cmt', 'paz'].map((g) => [g, gun])), tatiller: [],
        urunler: [], malzemeler: [], tezgahlar: [], personel: [], siparisler: [], ayarlar: {} },
    };
    const r = await tamam<{ kayit: { surum: number } }>(c.yonetici, 'POST', '/recete-rota/kayitlar/yaz',
      { anahtar: PLANLAMA_ANAHTARI, bicim: 'metin', deger: JSON.stringify(calisma), beklenenSurum: calismaSurumu });
    calismaSurumu = r.kayit.surum;
  };

  // Üç emir: ikisi tek adım A'da, biri A'dan B'ye. oner'in tezgâh sırası ortak motora verilir.
  async function kiyasla(t: { diagnostic: (m: string) => void }, ad: string) {
    const { makineA, makineB } = durum();
    const tek = (dk: number) => yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 30, birimSureDk: dk });
    const idler = [
      ...(await isEmirleriAc([tek(2)], 10)), ...(await isEmirleriAc([tek(5)], 4)),
      ...(await isEmirleriAc([tek(1), yeniAdim({ kaynak: { tur: 'makine', id: makineB }, ayarSuresiDk: 15, birimSureDk: 3 })], 8)),
    ];
    const p = await taslaktaOner();
    // Önceki testin işleri de planda: kuyruk tezgâhtaki bütün işlerdir.
    const yerler = p.yerlesimler.filter((y) => y.kaynak.tur === 'makine');
    assert.ok(idler.every((id) => yerler.some((y) => y.isEmriId === id)), 'oner bütün işleri makineye yerleştirir');
    const anahtar = await anahtarlar(yerler.map((y) => y.isEmriId));
    const kuyruklar = [makineA, makineB].map((m) => ({
      makineId: m, anahtarlar: yerler.filter((y) => y.kaynak.id === m).sort((x, y) => Date.parse(x.baslangic) - Date.parse(y.baslangic)).map((y) => anahtar.get(y.isEmriId)!),
    }));
    const istek: PlanMotoruIstegi = { kip: 'sabit', simdi: new Date(p.simdi), kuyruklar, sabitler: [], calisanlar: [], taslakId: p.taslak?.id ?? null };
    const r = await vt().tx((db) => sunucuPlanCozucusu(db, istek));
    const fark = yerler.map((y: PlanCevabi['yerlesimler'][number]) => {
      const m = r.yerlesimler.find((x) => x.anahtar === anahtar.get(y.isEmriId));
      return { adim: anahtar.get(y.isEmriId)!.slice(-12), makine: y.kaynak.id === makineA ? 'A' : 'B', oner: [y.baslangic, y.bitis], motor: m ? [m.baslangic, m.bitis] : null };
    });
    t.diagnostic(`KIYAS ${ad} ${JSON.stringify({ simdi: p.simdi, yerlesmeyen: r.yerlesmeyen.length, fark })}`);
    for (const q of kuyruklar) {
      const sirali = q.anahtarlar.filter((a) => r.yerlesimler.some((x) => x.anahtar === a));
      const motor = r.yerlesimler.filter((x) => x.makineId === q.makineId).sort((x, y) => Date.parse(x.baslangic) - Date.parse(y.baslangic)).map((x) => x.anahtar);
      assert.deepEqual(motor, sirali, 'ortak motor oner\'in tezgâh sırasını korur');
    }
    return r;
  }

  test('vardiya tanımsız: oner kaynağı sürekli çalışır sayar, ortak motor kapasite bulamaz', async (t) => {
    await calismaYaz(null);
    const r = await kiyasla(t, 'vardiyasiz');
    assert.equal(r.yerlesimler.length, 0);
  });

  test('vardiya 08:00-16:00, 12:00 molası, her gün: iki motorun saatleri listelenir', async (t) => {
    const { ortam, istasyonA } = durum();
    const s = ortam!.sahip;
    const v = await s.tek<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ('Kiyas gunduz', '08:00', '16:00') RETURNING id");
    await s.sorgu("INSERT INTO vardiya_molasi (vardiya_id, baslangic, bitis) VALUES ($1, '12:00', '12:30')", [v!.id]);
    await s.sorgu('INSERT INTO vardiya_matrisi (is_merkezi_id, gun, vardiya_id) SELECT i.is_merkezi_id, g, $1 FROM istasyon i, generate_series(1, 7) g WHERE i.id = $2',
      [v!.id, istasyonA]);
    await calismaYaz(String(v!.id));
    await kiyasla(t, 'vardiyali');
  });
});
