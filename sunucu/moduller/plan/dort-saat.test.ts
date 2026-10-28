import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { DORT_SAAT_GEREKCE_EN_COK, dortSaatGerekcesi, dortSaatIhlalleri, korunanIsler } from './kurallar.ts';
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
  test('990 a: arızalı ya da pasif kaynaktaki işin koruması kalkar; başka makineye alınabilir, önüne iş konabilir', () => {
    const calisir = (k: { id: number }) => k.id !== 1;
    assert.deepEqual(korunanIsler(canli, planli, calisir), []);
    assert.deepEqual(dortSaatIhlalleri(canli, [{ ...canli[0]!, kaynak: m(2) }, canli[1]!, canli[2]!], planli, calisir), []);
    assert.deepEqual(dortSaatIhlalleri(canli, [canli[1]!, canli[2]!], planli, calisir), []);
    const ikiMakine = [...canli, { isEmriId: 4, kaynak: m(2), baslangic: 60 }];
    assert.deepEqual(dortSaatIhlalleri(ikiMakine, [{ isEmriId: 5, kaynak: m(2), baslangic: 0 }, ...ikiMakine], planli, calisir), [{ isEmriId: 4, neden: 'onune-is' }],
      'çalışan makinedeki iş korunur');
  });
  test('990 a: gerekçe boşluksuz metindir, sınırda kesilir; boş ya da yok gerekçe sayılmaz', () => {
    assert.equal(dortSaatGerekcesi('  acil sevkiyat  '), 'acil sevkiyat');
    assert.equal(dortSaatGerekcesi('   '), null);
    assert.equal(dortSaatGerekcesi(null), null);
    assert.equal(dortSaatGerekcesi(undefined), null);
    assert.equal(dortSaatGerekcesi('x'.repeat(DORT_SAAT_GEREKCE_EN_COK + 10))!.length, DORT_SAAT_GEREKCE_EN_COK);
  });
});

describe('plan (gerçek PostgreSQL): 4 saat kuralı (248 a)', () => {
  const { c, vt, tamam, istek, yeniAdim, isEmirleriAc, planOku, taslaktaOner, isEmriKomutu, yer, tg, durum } = planTestOrtami();
  let makineB = 0;
  before(() => { ({ makineB } = durum()); });
  const gecis = async (cerez: string, id: number, ad: string, govde: Record<string, unknown>) =>
    (await tamam<SenaryolarCevabi>(cerez, 'POST', `/plan/senaryolar/${id}/${ad}`, govde)).senaryolar.find((x) => x.id === id)!;
  const canliyaAl = async (p: PlanCevabi) => {
    const s = await gecis(c.planlama, p.taslak!.id, 'onaya-gonder', { surum: p.taslak!.surum });
    return istek(c.mudur, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: s.surum, cakismalariKabul: true });
  };
  const onaydakiSurum = async (id: number) => (await tamam<SenaryolarCevabi>(c.mudur, 'GET', '/plan/senaryolar')).senaryolar.find((x) => x.id === id)!.surum;
  const yeniTaslak = async (ad: string) => planOku((await tamam<SenaryolarCevabi>(c.planlama, 'POST', '/plan/senaryolar', { ad })).senaryolar.find((x) => x.ad === ad)!.id);
  const saatSonra = (iso: string, sa: number) => new Date(Date.parse(iso) + sa * 3600_000).toISOString();

  test('1002 a: korunan işin önüne iş, kaldırma, sıra değişimi taslakta uyarıdır; canlıya alma gerekçesiz reddeder; ufuk dışındaki iş serbest', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const [i2] = await isEmirleriAc([yeniAdim()]);
    const ilk = await taslaktaOner();
    assert.deepEqual(yer(ilk, i2!).kaynak, yer(ilk, i1!).kaynak, 'iki iş aynı makinede');
    assert.equal((await canliyaAl(ilk)).statusCode, 200);
    // Canlıda i1 hemen başlar (korunur), i2 iki gün sonradır (korunmaz).
    await vt().tx((db) => db.sorgu("UPDATE plan_yerlesimi SET baslangic = baslangic + interval '2 days', bitis = bitis + interval '2 days' WHERE is_emri_id = $1", [i2]));

    let p = await yeniTaslak('248 a');
    const y1 = yer(p, i1!);
    const uyari = (q: PlanCevabi) => q.uyarilar.filter((u) => /4 saatten kısa sürede başlayacak/.test(u));
    assert.deepEqual(uyari(p), [], 'canlıyla aynı taslakta uyarı yok');
    // Korunan iş önü boş kaldıkça ileri alınabilir; ufuk dışındaki i2 serbestçe taşınır.
    p = (await isEmriKomutu(p, i1!, 'tasi', { kaynak: y1.kaynak, baslangic: saatSonra(y1.baslangic, 5) })).json<PlanCevabi>();
    assert.deepEqual(uyari(p), []);
    p = (await isEmriKomutu(p, i2!, 'tasi', { kaynak: y1.kaynak, baslangic: saatSonra(yer(p, i2!).baslangic, 24) })).json<PlanCevabi>();
    assert.deepEqual(uyari(p), []);

    const r = await istek(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(p), kaynak: y1.kaynak, isEmriIdleri: [i2, i1] });
    assert.equal(r.statusCode, 200, r.body);
    p = r.json<PlanCevabi>();
    assert.equal(uyari(p).length, 1);
    assert.match(uyari(p)[0]!, /önüne iş konamaz; canlıya alırken gerekçe ister\.$/);
    p = (await isEmriKomutu(p, i1!, 'kaldir')).json<PlanCevabi>();
    assert.match(uyari(p)[0]!, /plandan kaldırılamaz; canlıya alırken gerekçe ister\.$/);

    const s = await gecis(c.planlama, p.taslak!.id, 'onaya-gonder', { surum: p.taslak!.surum });
    const al = await istek(c.mudur, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: s.surum, cakismalariKabul: true });
    assert.equal(al.statusCode, 409, al.body);
    assert.match(al.body, /plandan kaldırılamaz\. Zorunluysa gerekçe yazarak canlıya alın\./);
    assert.equal(await onaydakiSurum(s.id), s.surum, 'reddedilen canlıya alma taslağı onayda bırakır');
    assert.ok((await planOku()).yerlesimler.some((y) => y.isEmriId === i1), 'canlı değişmez');
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${s.id}/onaydan-cek`, { surum: s.surum });
  });

  test('954 b, 991 a: arıza denemesi yazılır; canlıya alınınca makine arızalı olur ve o makinedeki işin koruması kalkar', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    assert.equal((await canliyaAl(await taslaktaOner())).statusCode, 200);
    const y1 = yer(await planOku(), i1!);
    const a = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', '/plan/senaryolar', { ad: '991 a arıza' })).senaryolar.find((x) => x.ad === '991 a arıza')!;
    const r = await istek(c.planlama, 'POST', `/plan/senaryolar/${a.id}/hizli`, { tur: 'ariza', surum: a.surum });
    assert.equal(r.statusCode, 200, r.body);
    const ariza = await planOku(a.id);
    assert.equal(ariza.yerlesimler.some((y) => y.isEmriId === i1 && y.kaynak.id === y1.kaynak.id), false, 'arıza denemesi korunan işi makinesinden aldı');
    try {
      const al = await canliyaAl(ariza);
      assert.equal(al.statusCode, 200, al.body);
    } finally {
      await tamam(c.yonetici, 'POST', `/makineler/${y1.kaynak.id}/durum`, { durum: 'calisir', aciklama: null });
    }
  });

  test('990 a: korunan işi başka makineye alan taslak uyarı taşır; makine arızaya alınınca uyarı kalkar', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    assert.equal((await canliyaAl(await taslaktaOner())).statusCode, 200);
    const makine = yer(await planOku(), i1!).kaynak.id;
    assert.notEqual(makine, makineB);
    let p = await yeniTaslak('990 a arıza');
    const r = await isEmriKomutu(p, i1!, 'tasi', { kaynak: { tur: 'makine', id: makineB }, baslangic: yer(p, i1!).baslangic });
    assert.equal(r.statusCode, 200, r.body);
    p = r.json<PlanCevabi>();
    const uyari = (q: PlanCevabi) => q.uyarilar.filter((u) => /4 saatten kısa sürede başlayacak/.test(u));
    assert.match(uyari(p).join('\n'), /başka makine ya da kişiye alınamaz; canlıya alırken gerekçe ister\./, 'çalışan makinede korunur');
    await tamam(c.yonetici, 'POST', `/makineler/${makine}/durum`, { durum: 'ariza', aciklama: null });
    try {
      assert.deepEqual(uyari(await planOku(p.taslak!.id)), [], 'arızalı makinedeki işin koruması kalktı');
    } finally {
      await tamam(c.yonetici, 'POST', `/makineler/${makine}/durum`, { durum: 'calisir', aciklama: null });
    }
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/vazgec`, { surum: p.taslak!.surum });
  });

  test('990 a: korunan işi yerinden çıkaran taslak gerekçesiz canlıya alınmaz; gerekçeyle alınır, aşılan iş ve gerekçe onay kaydına yazılır', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    assert.equal((await canliyaAl(await taslaktaOner())).statusCode, 200);
    let p = await yeniTaslak('990 a');
    assert.notEqual(yer(p, i1!).kaynak.id, makineB);
    p = (await isEmriKomutu(p, i1!, 'tasi', { kaynak: { tur: 'makine', id: makineB }, baslangic: yer(p, i1!).baslangic })).json<PlanCevabi>();
    const s = await gecis(c.planlama, p.taslak!.id, 'onaya-gonder', { surum: p.taslak!.surum });
    const al = (dortSaatGerekcesi: string | null) =>
      istek(c.mudur, 'POST', `/plan/senaryolar/${s.id}/canliya-al`, { surum: s.surum, cakismalariKabul: true, dortSaatGerekcesi });
    for (const g of [null, '   ']) {
      const r = await al(g);
      assert.equal(r.statusCode, 409, r.body);
      assert.match(r.body, /başka makine ya da kişiye alınamaz\. Zorunluysa gerekçe yazarak canlıya alın\./);
      assert.deepEqual(r.json<{ ayrinti: unknown }>().ayrinti, { neden: 'dort-saat', gerekceIle: true });
    }
    assert.equal(await onaydakiSurum(s.id), s.surum, 'reddedilen canlıya alma taslağı onayda bırakır');
    const r = await al('  takım tezgâhta yok  ');
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(yer(await planOku(), i1!).kaynak.id, makineB);
    const kayit = await vt().tx((db) => db.tek<{ metin: string | null; kullanici: string }>(
      "SELECT o.metin, k.kullanici_adi AS kullanici FROM plan_senaryo_onay_kaydi o JOIN kisi k ON k.id = o.kisi_id WHERE o.senaryo_id = $1 AND o.islem = 'canliya_al'", [s.id]));
    assert.equal(kayit?.kullanici, 'mudur');
    assert.match(kayit?.metin ?? '', /^4 saat kuralı aşıldı \(.+ OP 10\): takım tezgâhta yok$/);
  });
});
