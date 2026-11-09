import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import type { PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { AtolyeKomutuCevabi } from '#paylasilan/sozlesme/planlama-atolye.ts';
import type { CalismaTaslagiCevabi, CanliFarkiCevabi, DegerlendirmeDurumuCevabi, PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { planSaati } from './planlama-kurallar.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 2176 (yol haritası adım 3): planlamanın uçtan uca zinciri, ekranın sırasıyla ve yalnız uçlardan. Rota emre kopyalanır (iş emirleri),
// Planlama çalışması okunur ve kaydedilir, sunucu motoru planı kurar (plan-kur), plan çalışmaya alınır, taslağa yazılır, onaya gider ve
// canlıya alınır; canlıda işler tezgâhında ve sırasında durur, çalışmayla farkı yoktur; atölye bir işi kaydırır. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): planlama zinciri, emirden canlıya ve atölyeye', () => {
  const { c, vt, tamam, istek, yeniAdim, isEmirleriAc, durum } = planTestOrtami();
  let makineA = 0;
  before(() => { ({ makineA } = durum()); });

  type Calisma = Record<string, unknown> & { dataVer: number; plan: (Record<string, unknown> & { ops: Record<string, { m: string; S: number; C: number }> }) | null; locks: Record<string, unknown> };
  const calismaOku = async () => {
    const r = await tamam<PlanlamaCalismasiCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi');
    assert.ok(r.calisma, 'çalışma okunur');
    return { calisma: r.calisma as unknown as Calisma, surum: r.surum };
  };
  const calismaKaydet = async (calisma: Calisma, beklenenSurum: number | null) =>
    (await tamam<{ kayit: { surum: number } }>(c.planlama, 'POST', '/plan/planlama-kayitlari/yaz', { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma, beklenenSurum })).kayit.surum;
  // Ekranın iki adımı (463 a): başlatma iş kimliği verir, sonuç kimlikle beklenir.
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

  test('ZT-01: emir, plan kur, taslak, onay, canlı ve atölyede kaydırma', async () => {
    // 1. Emir: iki adımlı rota emre kopyalanır, iki iş emri aynı tezgâhta.
    const [i1, i2] = await isEmirleriAc([yeniAdim(), yeniAdim()], 10) as [number, number];

    // 2. Çalışma: sunucu emirleri çalışmaya birleştirir; ekran kaydeder.
    const ilk = await calismaOku();
    let surum = await calismaKaydet(ilk.calisma, ilk.surum);

    // 3. Planı kur: motor sunucuda koşar, iki adım da yerleşir.
    const cevap = await planKur(surum);
    assert.equal(cevap.sonuc.tur, 'plan-kur');
    if (cevap.sonuc.tur !== 'plan-kur') return;
    const ops = cevap.sonuc.plan['ops'] as Record<string, { m: string; S: number; C: number; job: string }>;
    const tezgahtakiler = Object.entries(ops).filter(([, r]) => r.m === String(makineA));
    assert.ok(tezgahtakiler.length >= 2, `iki adım tezgâhta: ${JSON.stringify(ops)}`);

    // 4. Plan çalışmaya alınır (ekran: kurulanPlaniAl ve kayıt), plan güncel.
    const { calisma: c1, surum: s1 } = await calismaOku();
    assert.equal(cevap.dataVer, c1.dataVer, 'plan, okunan çalışmanın verisiyle kuruldu');
    const dataVer = c1.dataVer + 1;
    surum = await calismaKaydet({ ...c1, dataVer, plan: { ...cevap.sonuc.plan, dataVer, kaynak: 'sifir' } as unknown as Calisma['plan'] }, s1);

    // 5. Taslağa yazılır, onaya gider, canlıya alınır (ekran: calismayiGonder, hedef canlı).
    const y = await tamam<CalismaTaslagiCevabi>(c.planlama, 'POST', '/plan/planlama-calismasi/taslak-yaz', { ad: 'Deneme zincir', calismaSurumu: surum });
    assert.ok(y.yazilan >= 2, JSON.stringify(y));
    assert.deepEqual(y.yazilamaz, []);
    const taslakSurumu = async () => (await tamam<PlanCevabi>(c.planlama, 'GET', `/plan?taslak=${String(y.taslak.id)}`)).taslak!.surum;
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${String(y.taslak.id)}/onaya-gonder`, { surum: await taslakSurumu(), not: null });
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${String(y.taslak.id)}/canliya-al`, { surum: await taslakSurumu(), cakismalariKabul: true });

    // 6. Canlı: iki iş emri tezgâhında, rotadaki sırayla; iş emri makinesi yazıldı; çalışmayla farkı yok.
    const canli = await tamam<PlanCevabi>(c.planlama, 'GET', '/plan');
    const yer = (id: number) => canli.yerlesimler.find((x) => x.isEmriId === id);
    const [y1, y2] = [yer(i1), yer(i2)];
    assert.ok(y1 && y2, 'iki iş canlıda yerleşti');
    assert.deepEqual([y1.kaynak, y2.kaynak], [{ tur: 'makine', id: makineA }, { tur: 'makine', id: makineA }]);
    assert.ok(Date.parse(y1.bitis) <= Date.parse(y2.baslangic), 'ikinci adım birinciden sonra');
    const makine = await vt().tx((db) => db.sorgu<{ id: number; makine_id: number | null }>('SELECT id, makine_id FROM uretim_emirleri_is_emri WHERE id = ANY($1::int[]) ORDER BY id', [[i1, i2]]));
    assert.deepEqual(makine.map((x) => x.makine_id), [makineA, makineA]);
    const fark = await tamam<CanliFarkiCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi/canli-farki');
    assert.ok(fark, 'çalışmada plan var');
    const bizim = new Set(tezgahtakiler.map(([k]) => k));
    assert.deepEqual(fark.isler.filter((x) => x.k !== null && bizim.has(x.k)), [], 'canlıya alınan çalışma canlıda yerinde');

    // 7. Atölye: ilk iş aynı tezgâhta bir saat ileri kaydırılır; kilit çalışmaya yazılır, sürüm artar.
    const { calisma: c2, surum: s2 } = await calismaOku();
    assert.ok(s2 !== null);
    const ilkIs = Object.entries(c2.plan!.ops).filter(([, r]) => r.m === String(makineA)).sort((a, b) => a[1].S - b[1].S)[0]!;
    // 2506 a: atölye komutunun şimdisi gerçek saattir (planın ekseninde); hedef saat işin bir saat ilerisi ve şimdiden sonra.
    const simdi = planSaati((c2 as unknown as { D: { meta: { baslangic: string } } }).D.meta.baslangic, Date.now());
    const baslangic = Math.max(Math.round((ilkIs[1].S + 1) * 4) / 4, Math.ceil(simdi * 4) / 4 + 0.25);
    const t = await tamam<AtolyeKomutuCevabi>(c.planlama, 'POST', '/plan/planlama-calismasi/is-tasi', { isId: ilkIs[0], tezgah: String(makineA), baslangic, calismaSurumu: s2 });
    assert.equal(t.oncekiSurum, s2);
    assert.ok(t.calismaSurumu > s2);
    const { calisma: c3 } = await calismaOku();
    assert.deepEqual(c3.locks[ilkIs[0]], { m: String(makineA), S: baslangic });

    // Kaydırma canlıyı değiştirmez: çalışma taslak değil, canlıya alınana kadar canlı aynı kalır.
    const sonra = await tamam<PlanCevabi>(c.planlama, 'GET', '/plan');
    assert.deepEqual(sonra.yerlesimler.find((x) => x.isEmriId === i1)?.baslangic, y1.baslangic);
    const tekrar = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/is-tasi', { isId: ilkIs[0], tezgah: String(makineA), baslangic, calismaSurumu: s2 });
    assert.equal(tekrar.statusCode, 409, 'eski sürümle ikinci yazma reddedilir');
  });
});
