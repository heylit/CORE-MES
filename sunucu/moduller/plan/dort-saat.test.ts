import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { dortSaatIhlalleri, korunanIsler, yeniDortSaatIhlali } from './kurallar.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 248 a: başlamasına 4 saatten az kalan planlı işin önüne iş konamaz; korunan iş canlıdaki yerinden okunur. Veriler uydurmadır.
describe('plan: 4 saat kuralı (248 a), saf', () => {
  const m = (id: number) => ({ tur: 'makine' as const, id });
  const planli = () => true;
  const canli = [{ isEmriId: 1, kaynak: m(1), baslangic: 30 }, { isEmriId: 2, kaynak: m(1), baslangic: 120 }, { isEmriId: 3, kaynak: m(1), baslangic: 600 }];
  test('4 saatten az kalan planlı iş korunur; başlangıcı geçmiş planlı iş de korunur, başlamış ya da ufuk dışındaki korunmaz', () => {
    assert.deepEqual(korunanIsler(canli, planli).map((p) => p.isEmriId), [1, 2]);
    assert.deepEqual(korunanIsler([{ isEmriId: 9, kaynak: m(1), baslangic: -20 }], planli).map((p) => p.isEmriId), [9]);
    assert.deepEqual(korunanIsler(canli, (id) => id !== 1).map((p) => p.isEmriId), [2]);
    assert.deepEqual(korunanIsler([{ isEmriId: 4, kaynak: m(1), baslangic: 240 }], planli), []);
  });
  test('izinli: aynı plan, korunanın arkasına iş, ufuk dışındaki işin yer değiştirmesi, korunanın erken başlaması', () => {
    assert.deepEqual(dortSaatIhlalleri(canli, canli, planli), []);
    assert.deepEqual(dortSaatIhlalleri(canli, [...canli, { isEmriId: 5, kaynak: m(1), baslangic: 200 }], planli), []);
    assert.deepEqual(dortSaatIhlalleri(canli, [canli[0]!, canli[1]!, { isEmriId: 3, kaynak: m(2), baslangic: 900 }], planli), []);
    assert.deepEqual(dortSaatIhlalleri(canli, [{ ...canli[0]!, baslangic: 10 }, canli[1]!, canli[2]!], planli), []);
    assert.deepEqual(dortSaatIhlalleri(canli, [{ isEmriId: 5, kaynak: m(2), baslangic: 0 }, ...canli], planli), [], 'başka kaynağın önü serbest');
  });
  test('reddedilen: önüne yeni iş, sıra değişimi, kaldırma, başka kaynak; saat tek başına ölçüt değildir', () => {
    assert.deepEqual(dortSaatIhlalleri(canli, [{ isEmriId: 5, kaynak: m(1), baslangic: 0 }, ...canli], planli), [{ isEmriId: 1, neden: 'onune-is' }, { isEmriId: 2, neden: 'onune-is' }]);
    assert.deepEqual(dortSaatIhlalleri(canli, [{ ...canli[1]!, baslangic: 0 }, { ...canli[0]!, baslangic: 60 }, canli[2]!], planli), [{ isEmriId: 1, neden: 'onune-is' }]);
    assert.deepEqual(dortSaatIhlalleri(canli, [canli[0]!, { ...canli[1]!, baslangic: 700 }, canli[2]!], planli), [{ isEmriId: 2, neden: 'onune-is' }], 'ufuk dışındaki işin arkasına alınan korunan');
    assert.deepEqual(dortSaatIhlalleri(canli, [canli[1]!, canli[2]!], planli), [{ isEmriId: 1, neden: 'kaldirildi' }]);
    assert.deepEqual(dortSaatIhlalleri(canli, [{ ...canli[0]!, kaynak: m(2) }, canli[1]!, canli[2]!], planli), [{ isEmriId: 1, neden: 'kaynak' }]);
    assert.deepEqual(dortSaatIhlalleri(canli, [canli[0]!, { ...canli[1]!, baslangic: 300 }, canli[2]!], planli), [], 'boş yere ileri alınan korunan');
    const gecmis = [{ isEmriId: 8, kaynak: m(1), baslangic: -90 }, { isEmriId: 9, kaynak: m(1), baslangic: -30 }];
    assert.deepEqual(dortSaatIhlalleri(gecmis, [{ ...gecmis[0]!, baslangic: 0 }, { ...gecmis[1]!, baslangic: 60 }], planli), [], 'eskimiş canlı şimdiden yeniden dizilir');
    assert.deepEqual(dortSaatIhlalleri(canli, [{ isEmriId: 7, kaynak: m(1), baslangic: -100 }, ...canli], (id) => id !== 7), [], 'önüne alınan başlamış iş sayılmaz');
  });
  test('yazım yalnız kendi getirdiği ihlalle reddedilir', () => {
    const once = [{ isEmriId: 1, neden: 'kaynak' as const }];
    assert.equal(yeniDortSaatIhlali(once, once), null);
    assert.equal(yeniDortSaatIhlali(once, []), null);
    assert.deepEqual(yeniDortSaatIhlali(once, [...once, { isEmriId: 2, neden: 'onune-is' }]), { isEmriId: 2, neden: 'onune-is' });
    assert.deepEqual(yeniDortSaatIhlali(once, [{ isEmriId: 1, neden: 'kaldirildi' }]), { isEmriId: 1, neden: 'kaldirildi' });
  });
});

describe('plan (gerçek PostgreSQL): 4 saat kuralı (248 a)', () => {
  const { c, vt, tamam, istek, yeniAdim, isEmirleriAc, planOku, taslaktaOner, isEmriKomutu, yer, tg } = planTestOrtami();
  const gecis = async (cerez: string, id: number, ad: string, govde: Record<string, unknown>) =>
    (await tamam<SenaryolarCevabi>(cerez, 'POST', `/plan/senaryolar/${id}/${ad}`, govde)).senaryolar.find((x) => x.id === id)!;
  const canliyaAl = async (p: PlanCevabi) => {
    const s = await gecis(c.planlama, p.taslak!.id, 'onaya-gonder', { surum: p.taslak!.surum });
    return istek(c.mudur, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: s.surum, cakismalariKabul: true });
  };
  const yeniTaslak = async (ad: string) => planOku((await tamam<SenaryolarCevabi>(c.planlama, 'POST', '/plan/senaryolar', { ad })).senaryolar.find((x) => x.ad === ad)!.id);
  const saatSonra = (iso: string, sa: number) => new Date(Date.parse(iso) + sa * 3600_000).toISOString();

  test('korunan işin önüne iş, sıra değişimi, kaldırma 409 ve taslak değişmez; ufuk dışındaki iş serbest; arıza denemesi yazılır ama canlıya alınmaz', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const [i2] = await isEmirleriAc([yeniAdim()]);
    const ilk = await taslaktaOner();
    assert.deepEqual(yer(ilk, i2!).kaynak, yer(ilk, i1!).kaynak, 'iki iş aynı makinede');
    assert.equal((await canliyaAl(ilk)).statusCode, 200);
    // Canlıda i1 hemen başlar (korunur), i2 iki gün sonradır (korunmaz).
    await vt().tx((db) => db.sorgu("UPDATE plan_yerlesimi SET baslangic = baslangic + interval '2 days', bitis = bitis + interval '2 days' WHERE is_emri_id = $1", [i2]));

    let p = await yeniTaslak('248 a');
    const surum = p.taslak!.surum;
    const red = async (r: Awaited<ReturnType<typeof istek>>, metin: RegExp) => {
      assert.equal(r.statusCode, 409, r.body);
      assert.match(r.body, metin);
      assert.equal((await planOku(p.taslak!.id)).taslak!.surum, surum, 'reddedilen yazım taslağı değiştirmez');
    };
    const y1 = yer(p, i1!);
    await red(await istek(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(p), kaynak: y1.kaynak, isEmriIdleri: [i2, i1] }), /önüne iş konamaz/);
    await red(await isEmriKomutu(p, i1!, 'kaldir'), /plandan kaldırılamaz/);
    await red(await isEmriKomutu(p, i1!, 'tasi', { kaynak: y1.kaynak, baslangic: saatSonra(yer(p, i2!).bitis, 1) }), /önüne iş konamaz/);

    // Korunan iş önü boş kaldıkça ileri alınabilir; ufuk dışındaki i2 serbestçe taşınır.
    p = (await isEmriKomutu(p, i1!, 'tasi', { kaynak: y1.kaynak, baslangic: saatSonra(y1.baslangic, 5) })).json<PlanCevabi>();
    assert.equal(Date.parse(yer(p, i1!).baslangic) >= Date.parse(saatSonra(y1.baslangic, 5)), true);
    const ileri = saatSonra(yer(p, i2!).baslangic, 24);
    p = (await isEmriKomutu(p, i2!, 'tasi', { kaynak: y1.kaynak, baslangic: ileri })).json<PlanCevabi>();
    assert.equal(Date.parse(yer(p, i2!).baslangic) >= Date.parse(ileri), true);

    // 954 b: arıza denemesi kuralın dışındadır; canlıya alınırken korunan işi yerinden çıkarıyorsa reddedilir.
    const a = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', '/plan/senaryolar', { ad: '248 a arıza' })).senaryolar.find((x) => x.ad === '248 a arıza')!;
    const r = await istek(c.planlama, 'POST', `/plan/senaryolar/${a.id}/hizli`, { tur: 'ariza', surum: a.surum });
    assert.equal(r.statusCode, 200, r.body);
    const ariza = (await planOku(a.id));
    assert.equal(ariza.yerlesimler.some((y) => y.isEmriId === i1 && Date.parse(y.baslangic) <= Date.parse(y1.baslangic) + 60_000 && y.kaynak.id === y1.kaynak.id), false,
      'arıza denemesi korunan işi makinesinden kaldırdı');
    const al = await canliyaAl(ariza);
    assert.equal(al.statusCode, 409, al.body);
    assert.match(al.body, /4 saatten kısa sürede başlayacak/);
  });
});
