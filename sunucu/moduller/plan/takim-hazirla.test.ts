import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { HazirlikCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { CalismaTaslagiCevabi, DegerlendirmeDurumuCevabi, PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';
import { isEmriTakimHazirlaDurumlari, takimDegisimliIsler } from './takim-hazirla.ts';

// 3199 (D): hazırlığın "Takım hazırla" maddesi. Veriler uydurmadır.
describe('plan: takım değişimi düşen işler (saf)', () => {
  const op = (id: string, n: number | null, bitti = false) => ({ id, m: '1', S: 0, C: 1, bitti, ...(n === null ? {} : { takim: [{ id: '7', n, dk: n * 20, at: n > 0 ? 0.5 : null }] }) });
  test('yalnız değişimi olan, bitmemiş ve sunucuda karşılığı olan iş sayılır; pay işin kendisine sayılır', () => {
    const isler = takimDegisimliIsler({
      kimlik: { '1.10': 'ORN-E1|10', '2.10': 'ORN-E2|10', '3.10': 'ORN-E3|10', '4.10': 'ORN-E4|10' },
      ops: [op('1.10', 1), op('2.10', 0), op('3.10', null), op('4.10~2', 2), op('5.10', 1), op('1.20', 1, true)],
    });
    assert.deepEqual([...isler].sort(), ['ORN-E1|10', 'ORN-E4|10']);
  });
  test('plan yoksa boş', () => {
    assert.equal(takimDegisimliIsler(null).size, 0);
    assert.equal(takimDegisimliIsler({ kimlik: {}, ops: null }).size, 0);
  });
});

describe('plan (gerçek PostgreSQL): "Takım hazırla" yalnız canlıdaki, planda takım değişimi olan iş emrinde uyarır', () => {
  const { c, vt, tamam, yeniAdim, isEmirleriAc } = planTestOrtami();
  type Islem = { m: string; S: number; C: number; takim?: unknown };
  type Calisma = Record<string, unknown> & { dataVer: number; plan: (Record<string, unknown> & { ops: Record<string, Islem> }) | null };
  const calismaOku = async () => {
    const r = await tamam<PlanlamaCalismasiCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi');
    assert.ok(r.calisma);
    return { calisma: r.calisma as unknown as Calisma, surum: r.surum };
  };
  const calismaKaydet = async (calisma: Calisma, beklenenSurum: number | null) =>
    (await tamam<{ kayit: { surum: number } }>(c.planlama, 'POST', '/plan/planlama-kayitlari/yaz', { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma, beklenenSurum })).kayit.surum;
  const planKur = async (surum: number) => {
    const { is } = await tamam<{ is: string }>(c.planlama, 'POST', '/plan/planlama-degerlendirmesi', { surum, istek: { tur: 'plan-kur' } });
    for (let i = 0; i < 600; i++) {
      const d = await tamam<DegerlendirmeDurumuCevabi>(c.planlama, 'GET', `/plan/planlama-degerlendirmesi/${is}`);
      if (d.durum === 'bitti') return d.cevap;
      assert.notEqual(d.durum, 'hata', JSON.stringify(d));
      await new Promise((t) => { setTimeout(t, 100); });
    }
    return assert.fail('plan kurma sonucu gelmedi');
  };
  const durumlar = (idler: number[]) => vt().tx((db) => isEmriTakimHazirlaDurumlari(db, idler));

  test('TH-01: canlıya alınmadan uyarmaz; canlıda yalnız değişimi olan iş uyarır; hazırlık cevabında madde uyarı olarak görünür', async () => {
    const [i1, i2] = await isEmirleriAc([yeniAdim(), yeniAdim()], 10) as [number, number];
    const ilk = await calismaOku();
    let surum = await calismaKaydet(ilk.calisma, ilk.surum);
    const cevap = await planKur(surum);
    assert.equal(cevap.sonuc.tur, 'plan-kur');
    if (cevap.sonuc.tur !== 'plan-kur') return;
    const { calisma: c1, surum: s1 } = await calismaOku();
    // Motorun takım kaydı ilk işe elle konur: özel takım tanımı ve ömür hesabı ikincil-kaynak testinde ölçülür.
    const ops = structuredClone(cevap.sonuc.plan['ops']) as Record<string, Islem>;
    const sirali = Object.entries(ops).sort((a, b) => a[1].S - b[1].S);
    const [ilkIs, ikinciIs] = [sirali[0]![0], sirali[1]![0]];
    ops[ilkIs]!.takim = [{ id: '7', n: 1, dk: 20, kalan: 10, ihtiyac: 30, sonra: 580, bilinmiyor: false, at: ops[ilkIs]!.S }];
    ops[ikinciIs]!.takim = [{ id: '7', n: 0, dk: 0, kalan: 580, ihtiyac: 30, sonra: 550, bilinmiyor: false, at: null }];
    const dataVer = c1.dataVer + 1;
    surum = await calismaKaydet({ ...c1, dataVer, plan: { ...cevap.sonuc.plan, ops, dataVer, kaynak: 'sifir' } as unknown as Calisma['plan'] }, s1);

    const once = await durumlar([i1, i2]);
    assert.deepEqual([once.get(i1), once.get(i2)], [{ durum: 'yok', secildi: false }, { durum: 'yok', secildi: false }], 'canlıda olmayan iş uyarılmaz');

    const y = await tamam<CalismaTaslagiCevabi>(c.planlama, 'POST', '/plan/planlama-calismasi/taslak-yaz', { ad: 'Deneme takım', calismaSurumu: surum });
    const taslakSurumu = async () => (await tamam<PlanCevabi>(c.planlama, 'GET', `/plan?taslak=${String(y.taslak.id)}`)).taslak!.surum;
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${String(y.taslak.id)}/onaya-gonder`, { surum: await taslakSurumu(), not: null });
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${String(y.taslak.id)}/canliya-al`, { surum: await taslakSurumu(), cakismalariKabul: true });

    const canli = await tamam<PlanCevabi>(c.planlama, 'GET', '/plan');
    const ilkCanli = canli.yerlesimler.filter((x) => x.isEmriId === i1 || x.isEmriId === i2).sort((a, b) => Date.parse(a.baslangic) - Date.parse(b.baslangic))[0]!.isEmriId;
    const oteki = ilkCanli === i1 ? i2 : i1;
    const sonra = await durumlar([i1, i2, 999_999]);
    assert.deepEqual(sonra.get(ilkCanli), { durum: 'yok', secildi: true });
    assert.deepEqual(sonra.get(oteki), { durum: 'yok', secildi: false }, 'ömrü yeten iş uyarılmaz');
    assert.deepEqual(sonra.get(999_999), { durum: 'yok', secildi: false });

    const emir = (await vt().tx((db) => db.tek<{ id: number }>('SELECT uretim_emri_id AS id FROM uretim_emirleri_is_emri WHERE id = $1', [ilkCanli])))!.id;
    const h = await tamam<HazirlikCevabi>(c.planlama, 'GET', `/adimli-emirler/${String(emir)}/hazirlik`);
    assert.equal(h.maddeler.find((m) => m.madde === 'takim-hazirla')?.durum, 'eksik');
    assert.equal(h.isEmirleri.find((i) => i.isEmriId === ilkCanli)?.maddeler.find((m) => m.madde === 'takim-hazirla')?.durum, 'eksik');
    assert.equal(h.isEmirleri.find((i) => i.isEmriId === oteki)?.maddeler.find((m) => m.madde === 'takim-hazirla')?.durum, 'gerekmez');
  });
});
