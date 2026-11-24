import assert from 'node:assert/strict';
import { describe, mock, test } from 'node:test';
import type { PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { IsTasiOnizlemesiCevabi } from '#paylasilan/sozlesme/planlama-atolye.ts';
import type { CalismaTaslagiCevabi, DegerlendirmeDurumuCevabi, PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/zaman.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 3601: Kokpit'te itilen iş canlıya alınır. Önizlemede gösterilen saat taslakta ve canlıda aynı saattir; motor ve sunucu takvimi
// (Vardiya modülü: vardiya, mola) aynıdır. Veriler uydurmadır (ORN: 08:00-17:00, mola 12:00-13:00, her gün).
describe('plan (gerçek PostgreSQL): Kokpit\'te itilen iş', () => {
  const { c, tamam, yeniAdim, isEmirleriAc, durum } = planTestOrtami();
  type Calisma = Record<string, unknown> & { dataVer: number; plan: (Record<string, unknown> & { ops: Record<string, { m: string; S: number; C: number }> }) | null };
  const calismaOku = async () => { const r = await tamam<PlanlamaCalismasiCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi'); return { calisma: r.calisma as unknown as Calisma, surum: r.surum }; };
  const kaydet = async (k: Calisma, s: number | null) => (await tamam<{ kayit: { surum: number } }>(c.planlama, 'POST', '/plan/planlama-kayitlari/yaz', { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: k, beklenenSurum: s })).kayit.surum;
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
  // Ekranın sırası: planı kur, çalışmaya al ve kaydet.
  const planiKurVeKaydet = async () => {
    const { calisma, surum } = await calismaOku();
    const kur = await planKur(surum as number);
    assert.equal(kur.sonuc.tur, 'plan-kur');
    if (kur.sonuc.tur !== 'plan-kur') return assert.fail('plan-kur');
    const dataVer = calisma.dataVer + 1;
    await kaydet({ ...calisma, dataVer, plan: { ...kur.sonuc.plan, dataVer, kaynak: 'sifir' } as unknown as Calisma['plan'] }, surum);
  };
  const yer = (p: PlanCevabi, id: number) => p.yerlesimler.find((x) => x.isEmriId === id)!;

  async function hazirla(kod: string) {
    const sahip = durum().ortam!.sahip;
    const merkez = (await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: `RT-${kod}`, ad: `Deneme itme ${kod}`, aciklama: null })).id;
    const ist = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: `RT-${kod}`, ad: `Deneme ${kod}`, isMerkeziId: merkez })).id;
    const mk = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: `RT-${kod}1`, ad: `Deneme ${kod}1`, istasyonId: ist })).id;
    const vardiya = (await sahip.sorgu<{ id: number }>("INSERT INTO vardiya (ad, baslangic, bitis) VALUES ($1, '08:00', '17:00') RETURNING id", [`ORN ${kod}`]))[0]!.id;
    await sahip.sorgu("INSERT INTO vardiya_molasi (vardiya_id, baslangic, bitis) VALUES ($1, '12:00', '13:00')", [vardiya]);
    await sahip.sorgu('INSERT INTO vardiya_matrisi (is_merkezi_id, gun, vardiya_id) SELECT $1, g, $2 FROM generate_series(1, 7) g', [merkez, vardiya]);
    const [i1, i2] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: mk } }), yeniAdim({ kaynak: { tur: 'makine', id: mk } })], 10) as [number, number];
    await planiKurVeKaydet();
    const ops = Object.entries((await calismaOku()).calisma.plan!.ops).filter(([, r]) => r.m === String(mk)).sort((a, b) => a[1].S - b[1].S).map(([k]) => k);
    assert.equal(ops.length, 2, 'iki adım makinede');
    const yarin = tesisGunBasi(tesisGunu(Date.now())) + 24 * 3_600_000;
    // Ekranın itme sırası: önizleme, taşıma, planı kilitlerle yeniden kur.
    const it = async (saat: number) => {
      const { surum } = await calismaOku();
      const on = await tamam<IsTasiOnizlemesiCevabi>(c.planlama, 'GET', `/plan/planlama-calismasi/is-tasi-onizlemesi?isId=${encodeURIComponent(ops[0]!)}&tezgah=${String(mk)}&baslangic=${String(24 + saat)}`);
      assert.equal(on.gecerli, true, on.ileti ?? '');
      await tamam(c.planlama, 'POST', '/plan/planlama-calismasi/is-tasi', { isId: ops[0]!, tezgah: String(mk), baslangic: 24 + saat, calismaSurumu: surum });
      await planiKurVeKaydet();
      return { tasinan: on.isler.find((x) => x.isId === ops[0])!, itilen: on.isler.find((x) => x.isId === ops[1])! };
    };
    const saatte = (h: number): number => yarin + Math.round(h * 3_600_000);
    const canliyaAl = async (taslak: number) => {
      const g = async () => (await tamam<PlanCevabi>(c.planlama, 'GET', `/plan?taslak=${String(taslak)}`)).taslak!.surum;
      await tamam(c.planlama, 'POST', `/plan/senaryolar/${String(taslak)}/onaya-gonder`, { surum: await g(), not: null });
      await tamam(c.planlama, 'POST', `/plan/senaryolar/${String(taslak)}/canliya-al`, { surum: await g(), cakismalariKabul: true });
      return tamam<PlanCevabi>(c.planlama, 'GET', '/plan');
    };
    return { sahip, vardiya, i1, i2, it, saatte, canliyaAl, ops, mk };
  }

  test('KI-01: itilen adım öncülünün bittiği anda yerleşir; taslak ve canlı önizlemedeki saattedir, farklı saat paylarında da', async () => {
    const { i1, i2, it, saatte, canliyaAl } = await hazirla('KA');
    const { tasinan, itilen } = await it(9);
    assert.equal(itilen.S, tasinan.C, 'itilen adım öncülünün bittiği anda başlar');
    // Kayan nokta payı (sabit işin saati ms'e yuvarlı ISO'dan, öncülün bitişi hesaptan) kurallar.test.ts'te sabitYeri ile sınanır; burada
    // gerçek saatin farklı salise paylarında da aynı sonuç beklenir.
    const { surum } = await calismaOku();
    const an0 = tesisGunBasi(tesisGunu(Date.now())) + 16 * 3_600_000 + 20 * 60_000;
    let son = 0;
    try {
      for (let k = 0; k < 12; k += 1) {
        mock.timers.enable({ apis: ['Date'], now: an0 + k * 7_919 + (k % 5) * 131 });
        const y = await tamam<CalismaTaslagiCevabi>(c.planlama, 'POST', '/plan/planlama-calismasi/taslak-yaz', { ad: `Deneme itme ${String(k)}`, calismaSurumu: surum });
        assert.equal(y.yazilan, 2, `k=${String(k)}`);
        son = y.taslak.id;
        mock.timers.reset();
      }
    } finally {
      mock.timers.reset();
    }
    const taslak = await tamam<PlanCevabi>(c.planlama, 'GET', `/plan?taslak=${String(son)}`);
    assert.deepEqual([Date.parse(yer(taslak, i1).baslangic), Date.parse(yer(taslak, i2).baslangic)], [saatte(9), saatte(9) + 50 * 60_000], 'taslakta önizlemedeki saatler');
    assert.deepEqual([yer(taslak, i1).kilitli, yer(taslak, i2).kilitli], [true, true]);
    const canli = await canliyaAl(son);
    assert.deepEqual([Date.parse(yer(canli, i1).baslangic), Date.parse(yer(canli, i2).baslangic)], [saatte(9), saatte(9) + 50 * 60_000], 'canlıda önizlemedeki saatler');
  });

  test('KI-02: motor ve sunucu aynı takvimdedir; Vardiya modülünde mola uzayınca mola içine itilen iş molanın bitişine yerleşir ve canlıya alınır', async () => {
    const { sahip, vardiya, i1, i2, it, saatte, canliyaAl } = await hazirla('KB');
    await sahip.sorgu("UPDATE vardiya_molasi SET bitis = '13:30' WHERE vardiya_id = $1", [vardiya]);
    const { tasinan, itilen } = await it(12.5);
    assert.equal(tasinan.S, 37.5, 'önizleme yeni molanın bitişinde (13:30)');
    assert.equal(itilen.S, tasinan.C);
    const y = await tamam<CalismaTaslagiCevabi>(c.planlama, 'POST', '/plan/planlama-calismasi/taslak-yaz', { ad: 'Deneme mola', calismaSurumu: (await calismaOku()).surum });
    assert.equal(y.yazilan, 2);
    const canli = await canliyaAl(y.taslak.id);
    assert.deepEqual([Date.parse(yer(canli, i1).baslangic), Date.parse(yer(canli, i2).baslangic)], [saatte(13.5), saatte(13.5) + 50 * 60_000]);
  });
  test('KI-03 (3664): taşıma komutunun cevabındaki taslak görünümü, sonra okunan görünümle aynıdır; bekleyen kaydının kimliği ve saati hariç', async () => {
    const { ops, mk } = await hazirla('KC');
    const sabit = (x: unknown): unknown => JSON.parse(JSON.stringify(x).replace(/"id":"\d+-\d+"/g, '"id":"-"').replace(/"t":\d+/g, '"t":0'));
    const yaz = await tamam<{ taslak: { surum: number } | null }>(c.planlama, 'POST', '/plan/taslagim/komut', { taslakSurumu: null, komut: { tur: 'tasi', isId: ops[0]!, tezgah: String(mk), baslangic: 24 + 9 } });
    assert.notEqual(yaz.taslak, null);
    assert.deepEqual(sabit(await tamam(c.planlama, 'GET', '/plan/taslagim')), sabit(yaz));
    await tamam(c.planlama, 'POST', '/plan/taslagim/vazgec', { taslakSurumu: yaz.taslak!.surum });
  });

});
