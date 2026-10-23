import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { CanliyaAlCevabi, KuyrukYazCevabi, PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planMotoruCozucusu } from './disari.ts';
import type { PlanMotoruIstegi } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// ADR 0018: ortak motor Reçete ve Rota'nındır; burada çözücü testte elle kurulur. Kayıtlıyken kuyruk yaz ve canlıya al saatleri
// çözücüden yazar, Motor A önermez; kayıtsızken bugünkü yol (öteki plan testleri).
describe('plan (gerçek PostgreSQL): sunucu motoru son sözü söyler (ADR 0018)', () => {
  const { c, vt, istek, tamam, yeniAdim, isEmirleriAc, planOku, yer, taslaktaOner, durum } = planTestOrtami();
  // PL-ONAY: canlıya yalnız onaydaki taslak alınır; sahibi (varsayılan planlamacı) gönderir, onaydaki sürüm döner. Zaten onaydaysa yeniden
  // gönderilmez.
  const gonder = async (id: number, surum: number, sahip = c.planlama) => {
    const s = (await tamam<SenaryolarCevabi>(sahip, 'GET', '/plan/senaryolar')).senaryolar.find((x) => x.id === id);
    if (s?.durum === 'onayda') return s.surum;
    return (await tamam<SenaryolarCevabi>(sahip, 'POST', `/plan/senaryolar/${id}/onaya-gonder`, { surum })).senaryolar.find((x) => x.id === id)!.surum;
  };
  let makineB = 0;
  before(() => { ({ makineB } = durum()); });
  after(() => { planMotoruCozucusu(null); });

  const istekler: PlanMotoruIstegi[] = [];
  let kip: 'tamam' | 'baska-makine' | 'yerlesmeyen' = 'tamam';
  // Her kuyruk sırasıyla, tam dakikadan, işi 30 dakika: sonuç girdiden belirlidir.
  const taban = Math.ceil((Date.now() + 10 * 3600_000) / 60_000) * 60_000;
  const saat = (n: number) => ({ baslangic: new Date(taban + n * 30 * 60_000).toISOString(), bitis: new Date(taban + (n + 1) * 30 * 60_000).toISOString() });
  const kur = () => planMotoruCozucusu(async (_db, i) => {
    istekler.push(i);
    if (kip === 'yerlesmeyen') return { yerlesimler: [], yerlesmeyen: i.kuyruklar.flatMap((q) => q.anahtarlar) };
    return {
      yerlesimler: i.kuyruklar.flatMap((q) => q.anahtarlar.map((anahtar, n) => ({ anahtar, makineId: kip === 'baska-makine' ? q.makineId + 1 : q.makineId, ...saat(n) }))),
      yerlesmeyen: [],
    };
  });
  const anahtar = async (id: number) => (await vt().tx((db) => db.tek<{ emirNo: string; opNo: number }>(
    'SELECT e.emir_no AS "emirNo", i.op_no AS "opNo" FROM uretim_emirleri_is_emri i JOIN uretim_emri e ON e.id = i.uretim_emri_id WHERE i.id = $1', [id])))!;

  test('kuyruk yaz: saatler çözücüden, sıra korunur; fark yalnız önizlemesi ayrılan işte; başka makine ve yerleşmeyen iş 409', async () => {
    const kaynak = { tur: 'makine' as const, id: makineB };
    const [i1] = await isEmirleriAc([yeniAdim({ kaynak })]);
    const [i2] = await isEmirleriAc([yeniAdim({ kaynak })]);
    const a1 = await anahtar(i1!), a2 = await anahtar(i2!);
    const govde = (taslak?: { id: number; surum: number }) => ({
      ...(taslak ? { taslak } : {}),
      kuyruklar: [{ kaynak, baslangic: new Date(Date.now() + 3600_000).toISOString(), isler: [
        { ...a2, dondurulmus: false, elle: false, onizleme: saat(0) },
        { ...a1, dondurulmus: false, elle: true, onizleme: { baslangic: saat(3).baslangic, bitis: saat(3).bitis } },
      ] }],
    });
    kur();
    try {
      istekler.length = 0;
      const r = await tamam<KuyrukYazCevabi>(c.planlama, 'POST', '/plan/kuyruklari-yaz', govde());
      assert.equal(istekler.length, 1);
      const [ist] = istekler;
      assert.equal(ist!.kip, 'sabit');
      assert.equal(ist!.taslakId, r.taslak);
      assert.deepEqual(ist!.kuyruklar, [{ makineId: makineB, anahtarlar: [`${a2.emirNo}|${a2.opNo}`, `${a1.emirNo}|${a1.opNo}`] }]);
      assert.ok(Array.isArray(ist!.calisanlar) && Array.isArray(ist!.sabitler));
      assert.equal(r.yazilan, 2);
      assert.deepEqual(r.motorFarki, [{ anahtar: `${a1.emirNo}|${a1.opNo}`, onizleme: saat(3), sunucu: saat(1) }], 'önizlemesi tutan işte fark yok');
      const p = await planOku(r.taslak);
      assert.deepEqual([i2!, i1!].map((id) => [yer(p, id).baslangic, yer(p, id).bitis]), [[saat(0).baslangic, saat(0).bitis], [saat(1).baslangic, saat(1).bitis]],
        'Motor A önermez; saatler sunucu motorunun');
      assert.deepEqual([i2!, i1!].map((id) => yer(p, id).elleSira), [null, 2]);

      for (const k of ['baska-makine', 'yerlesmeyen'] as const) {
        kip = k;
        const surum = (await planOku(r.taslak)).taslak!.surum;
        const red = await istek(c.planlama, 'POST', '/plan/kuyruklari-yaz', govde({ id: r.taslak, surum }));
        assert.equal(red.statusCode, 409, red.body);
        assert.match(red.body, /Plan yazılmadı/);
        const sonra = await planOku(r.taslak);
        assert.equal(sonra.taslak!.surum, surum, `${k}: taslak değişmez`);
        assert.equal(yer(sonra, i1!).baslangic, saat(1).baslangic);
      }
    } finally {
      kip = 'tamam';
      planMotoruCozucusu(null);
    }
  });

  test('canlıya al: taslağın kuyrukları sabit kipte yeniden dizilir, canlıya sunucu saatleri geçer; kilitli iş sabittir; yerleşmeyen iş 409 ve taslak açık kalır', async () => {
    const kaynak = { tur: 'makine' as const, id: makineB };
    const [j1] = await isEmirleriAc([yeniAdim({ kaynak })]);
    const [j2] = await isEmirleriAc([yeniAdim({ kaynak })]);
    const [j3] = await isEmirleriAc([yeniAdim({ kaynak })]);
    const metin = async (id: number) => { const a = await anahtar(id); return `${a.emirNo}|${a.opNo}`; };
    const b1 = await metin(j1!), b2 = await metin(j2!), b3 = await metin(j3!);
    let p: PlanCevabi = await taslaktaOner();
    const taslakId = p.taslak!.id;
    // Kilitli iş motorun etrafına dizdiği yerdir.
    await vt().tx((db) => db.sorgu('UPDATE plan_senaryo_yerlesimi SET kilitli = true WHERE senaryo_id = $1 AND is_emri_id = $2', [taslakId, j2]));
    p = await planOku(taslakId);
    const onizleme = (id: number) => ({ baslangic: new Date(yer(p, id).baslangic).toISOString(), bitis: new Date(yer(p, id).bitis).toISOString() });
    kur();
    try {
      kip = 'yerlesmeyen';
      const red = await istek(c.mudur, 'POST', `/plan/senaryolar/${taslakId}/canliya-al`, { surum: await gonder(taslakId, p.taslak!.surum), cakismalariKabul: true });
      assert.equal(red.statusCode, 409, red.body);
      assert.equal((await planOku(taslakId)).taslak?.id, taslakId, 'taslak açık kalır');

      kip = 'tamam';
      istekler.length = 0;
      const r = await tamam<CanliyaAlCevabi>(c.mudur, 'POST', `/plan/senaryolar/${taslakId}/canliya-al`, { surum: await gonder(taslakId, (await planOku(taslakId)).taslak!.surum), cakismalariKabul: true });
      const ist = istekler.at(-1)!;
      const kuyruk = ist.kuyruklar.find((q) => q.makineId === makineB)!;
      assert.ok(kuyruk.anahtarlar.includes(b1) && kuyruk.anahtarlar.includes(b3));
      assert.ok(!kuyruk.anahtarlar.includes(b2), 'kilitli iş yeniden dizilmez');
      assert.ok(ist.sabitler.some((x) => x.anahtar === b2 && x.baslangic === onizleme(j2!).baslangic), 'kilitli iş sabitlerde');
      assert.ok(!ist.sabitler.some((x) => x.anahtar === b1 || x.anahtar === b3), 'yeniden dizilen iş sabit değil');
      const canli = await planOku();
      for (const [id, a] of [[j1!, b1], [j3!, b3]] as const) {
        const n = kuyruk.anahtarlar.indexOf(a);
        assert.deepEqual([yer(canli, id).baslangic, yer(canli, id).bitis], [saat(n).baslangic, saat(n).bitis], 'canlıda sunucu saati');
        const f = r.motorFarki?.find((x) => x.anahtar === a);
        if (onizleme(id).baslangic !== saat(n).baslangic) assert.deepEqual(f, { anahtar: a, onizleme: onizleme(id), sunucu: saat(n) });
      }
      assert.equal(yer(canli, j2!).baslangic, yer(p, j2!).baslangic, 'kilitli iş yerinde');
    } finally {
      kip = 'tamam';
      planMotoruCozucusu(null);
    }
  });
});
