import assert from 'node:assert/strict';
import { before, describe, test } from 'node:test';
import { kilitCakismasiAyrintisi, type CanliyaAlOnizlemesiCevabi, type PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { CalismaTaslagiCevabi, DegerlendirmeDurumuCevabi, PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { kablola } from '../../kablolama.ts';
import { kullaniciYukle } from '../kisiler/disari.ts';
import { emirBaslat } from '../uretim-emirleri/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';
import { planAni } from './planlama-kurallar.ts';

// 3793: bölünmüş öncülü olan emirde Kokpit'in (motorun) yerleşimi ile canlıya alma yazımı aynı olmalı; elle bölünmüş ardılın parçaları öncülün
// sunucudaki sınırından önceye yazılmaz, arkasına itilir. Sunucu motoru kablolama.ts ile bağlıdır (canlıdaki gibi). Veriler uydurmadır.
// Merkez tam gün çalışır; ayar 30 dk, birim 2 dk.
// Her senaryo kendi veritabanındadır: motor bütün açık emirleri dizer, öteki senaryonun emirleri tezgâhları doldurmasın.
function ortam() {
  before(() => { kablola(); });
  const { c, vt, tamam, istek, yeniAdim, isEmirleriAc, planOku, tamGunMerkezi, durum } = planTestOrtami();
  type Op = { m: string; S: number; C: number; job?: string };
  type Plan = Record<string, unknown> & { ops: Record<string, Op> };
  type Calisma = Record<string, unknown> & { dataVer: number; D: { meta: { baslangic: string } }; plan: Plan | null };
  const DK = 60_000;
  const calismaOku = async () => { const r = await tamam<PlanlamaCalismasiCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi'); return { calisma: r.calisma as unknown as Calisma, surum: r.surum }; };
  const calismaKaydet = async (calisma: Calisma, beklenenSurum: number | null) =>
    (await tamam<{ kayit: { surum: number } }>(c.planlama, 'POST', '/plan/planlama-kayitlari/yaz', { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma, beklenenSurum })).kayit.surum;
  const degerlendir = async (surum: number, istekGovdesi: unknown) => {
    const { is } = await tamam<{ is: string }>(c.planlama, 'POST', '/plan/planlama-degerlendirmesi', { surum, istek: istekGovdesi });
    for (let i = 0; i < 600; i++) {
      const d = await tamam<DegerlendirmeDurumuCevabi>(c.planlama, 'GET', `/plan/planlama-degerlendirmesi/${is}`);
      if (d.durum === 'bitti') return d.cevap.sonuc as unknown as { tur: string; plan: Plan };
      assert.notEqual(d.durum, 'hata', JSON.stringify(d));
      await new Promise((t) => { setTimeout(t, 100); });
    }
    return assert.fail('sonuç gelmedi');
  };
  const planiKaydet = async (plan: Plan, ek: Record<string, unknown> = {}) => {
    const { calisma, surum } = await calismaOku();
    const dataVer = calisma.dataVer + 1;
    return calismaKaydet({ ...calisma, ...ek, dataVer, plan: { ...plan, dataVer, kaynak: 'sifir' } }, surum);
  };
  // Kokpit'te elle bölme: kayıt, "yeniden planla" ve çözülen planın kaydı (sayfanın yaptığı gibi).
  const bolVeUygula = async (elleBol: Record<string, { adet: number; m: string }[]>) => {
    const { calisma, surum } = await calismaOku();
    const s = await calismaKaydet({ ...calisma, elleBol, bekleyen: [{ id: 'ORN-b', ne: 'Yeniden planlama istendi', ayrinti: '', kim: '', t: 1, isler: ['*'], geri: [], kilitsiz: true }] }, surum);
    const uyg = await degerlendir(s, { tur: 'plan-uygula', isler: ['*'] });
    assert.equal(uyg.tur, 'plan-uygula');
    return { surum: await planiKaydet(uyg.plan, { elleBol, bekleyen: [] }), plan: uyg.plan };
  };

  // Öncül OP10 iki paya bölünür (c1'de 10, c2'de 20); c2 günlerce dolu olduğu için 2. pay geç kalır. OP20 ve OP30 bağı verilen türdedir.
  const kur = async (kod: string, bag: { bagimlilik: 'bekleyen' | 'akisli'; devirAdedi: number | null }) => {
    const merkez = await tamGunMerkezi(`RT-${kod}`, `Deneme ${kod} merkezi`);
    const ist = async (k: string) => (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: `RT-${kod}${k}`, ad: `Deneme ${kod}${k}`, isMerkeziId: merkez })).id;
    const istC = await ist('C'), istD = await ist('D'), istE = await ist('E');
    const makine = async (k: string, istasyonId: number) => (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: `RT-${kod}-${k}`, ad: `Deneme ${kod} ${k}`, istasyonId })).id;
    const c1 = await makine('C1', istC), c2 = await makine('C2', istC), d1 = await makine('D1', istD), d2 = await makine('D2', istD), e1 = await makine('E1', istE), e2 = await makine('E2', istE);
    const [tutan] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: c2 }, birimSureDk: 480 })], 30);
    const [op10, op20, op30] = await isEmirleriAc([
      yeniAdim({ kaynak: { tur: 'makine', id: c1 } }), yeniAdim({ kaynak: { tur: 'makine', id: d1 }, ...bag }), yeniAdim({ kaynak: { tur: 'makine', id: e1 }, ...bag }),
    ], 30);
    const ilk = await calismaOku();
    const s0 = await calismaKaydet(ilk.calisma, ilk.surum);
    const k0 = await degerlendir(s0, { tur: 'plan-kur' });
    assert.equal(k0.tur, 'plan-kur');
    await planiKaydet(k0.plan);
    const ops = k0.plan.ops;
    const ana = ops[Object.keys(ops).find((x) => ops[x]!.m === String(d1))!]!.job;
    const [k10, k20, k30] = Object.keys(ops).filter((x) => ops[x]!.job === ana).sort((a, b) => ops[a]!.S - ops[b]!.S) as [string, string, string];
    const tutanK = Object.keys(ops).find((x) => ops[x]!.job !== ana)!;
    assert.equal(ops[tutanK]!.m, String(c2), 'günlerce süren iş c2\'de: 2. pay onun arkasına düşer');
    const bol10 = { [k10]: [{ adet: 10, m: String(c1) }, { adet: 20, m: String(c2) }] };
    return { istC, istD, istE, c1, c2, d1, d2, e1, e2, tutan: tutan!, op10: op10!, op20: op20!, op30: op30!, k10, k20, k30, bol10 };
  };
  const canliyaAl = async (surum: number) => {
    const r = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'Deneme', calismaSurumu: surum, dortSaatGerekcesi: 'Deneme gerekçesi' });
    assert.equal(r.statusCode, 200, r.body);
  };
  const onizleYaniti = (surum: number) => istek(c.planlama, 'POST', '/plan/planlama-calismasi/gonderme-onizlemesi', { ad: 'Önizleme', calismaSurumu: surum });
  const onizle = (surum: number) => tamam<CanliyaAlOnizlemesiCevabi>(c.planlama, 'POST', '/plan/planlama-calismasi/gonderme-onizlemesi', { ad: 'Önizleme', calismaSurumu: surum });
  const taslakYazCevapli = async (surum: number): Promise<{ cevap: CalismaTaslagiCevabi; t: PlanCevabi }> => {
    const r = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/taslak-yaz', { ad: 'Taslak', calismaSurumu: surum });
    assert.equal(r.statusCode, 200, r.body);
    const cevap = r.json<CalismaTaslagiCevabi>();
    return { cevap, t: await planOku(cevap.taslak.id) };
  };
  const taslakYaz = async (surum: number): Promise<PlanCevabi> => (await taslakYazCevapli(surum)).t;
  // Adım sahada verilen tezgâhta başlatılır (Üretim Emirleri'nin başlatması).
  const baslat = async (isEmri: number, istasyon: number, makine: number) => {
    const { operatorId } = durum();
    await vt().tx((db) => db.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [operatorId, istasyon]));
    const op = (await vt().tx((db) => kullaniciYukle(db, operatorId)))!;
    const emir = (await vt().tx((db) => db.tek<{ u: number }>('SELECT uretim_emri_id AS u FROM uretim_emirleri_is_emri WHERE id = $1', [isEmri])))!.u;
    await vt().tx((db) => emirBaslat(db, op, emir, [makine], undefined, isEmri));
    return { operatorId, emir };
  };
  // OP10'un ilk payı c1'de başlar ve 10 adedin hepsi sayılır (ilk pay bitti); 2. pay c2'de, geç.
  const ilkPayiBitir = async (k: Awaited<ReturnType<typeof kur>>) => {
    const { operatorId, emir } = await baslat(k.op10, k.istC, k.c1);
    // Sayımın yazılışı Üretim Emirleri'nin testindedir; burada yalnız sağlam satırı gerekir.
    await vt().tx((db) => db.sorgu(
      "INSERT INTO uretim_sayimi (emir_id, is_emri_id, kisi_id, istasyon_id, makine_id, tur, adet, zaman) VALUES ($1, $2, $3, $4, $5, 'saglam', $6, now())",
      [emir, k.op10, operatorId, k.istC, k.c1, 10]));
  };
  const parcaYeri = (p: PlanCevabi, isEmriId: number, no: number) => p.yerlesimler.find((y) => y.isEmriId === isEmriId)?.parcalar?.find((x) => x.no === no);
  const yeri = (p: PlanCevabi, isEmriId: number) => p.yerlesimler.find((y) => y.isEmriId === isEmriId)!;
  const farkDk = (iso: string | Date, beklenen: string) => Math.abs(new Date(iso).getTime() - Date.parse(beklenen)) / DK;
  // Kokpit'te verilen adımların saati elle `saat` kadar kaydırılır (çalışma eski ya da elle taşınmış olabilir).
  const kaydir = (plan: Plan, idler: string[], saat: number): Plan => {
    const ops = { ...plan.ops };
    for (const id of idler) ops[id] = { ...ops[id]!, S: ops[id]!.S + saat, C: ops[id]!.C + saat };
    return { ...plan, ops };
  };
  // Kokpit'te verilen çalışma eki (ör. w.durdurulan) ile "yeniden planla" ve çözülen planın kaydı.
  const yenidenPlanla = async (ek: Record<string, unknown> = {}) => {
    const { calisma, surum } = await calismaOku();
    const s = await calismaKaydet({ ...calisma, ...ek, bekleyen: [{ id: 'ORN-b', ne: 'Yeniden planlama istendi', ayrinti: '', kim: '', t: 1, isler: ['*'], geri: [], kilitsiz: true }] }, surum);
    const uyg = await degerlendir(s, { tur: 'plan-uygula', isler: ['*'] });
    assert.equal(uyg.tur, 'plan-uygula');
    return { surum: await planiKaydet(uyg.plan, { ...ek, bekleyen: [] }), plan: uyg.plan };
  };
  // Sahada süren iş ve kişi tezgâhındaki ardıl: A emrinin OP10'u t1'de uzun (30 x 60 dk); B emrinin OP10'u aynı t1'de, OP20'si t2'de, OP30'u
  // operatörün kişi tezgâhında. Plan kurulur ve canlıya alınır.
  const kurKisi = async (kod: string) => {
    const { operatorId } = durum();
    const merkez = await tamGunMerkezi(`RT-${kod}`, `Deneme ${kod} merkezi`);
    const ist = async (k: string) => (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: `RT-${kod}${k}`, ad: `Deneme ${kod}${k}`, isMerkeziId: merkez })).id;
    const istT = await ist('T'), istU = await ist('U'), istK = await ist('K');
    // Kişi tezgâhı: insanlı istasyon (kapasite kaynağı insan); operatör yetkin ve vardiyalı (motor onun el tezgâhına dizer).
    const sahip = durum().ortam!.sahip;
    await sahip.sorgu("UPDATE istasyon SET kapasite_kaynagi = 'insan' WHERE id = $1", [istK]);
    const ikinci = (await sahip.sorgu<{ id: number }>("SELECT id FROM kisi WHERE ad = 'Deneme planlama'"))[0]!.id;
    for (const kisiId of [operatorId, ikinci]) {
      await sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [kisiId, istK]);
      await sahip.sorgu(`INSERT INTO vardiya_kisi (kisi_id, vardiya_id) SELECT $1, (SELECT min(vardiya_id) FROM vardiya_matrisi WHERE is_merkezi_id = $2)
        ON CONFLICT (kisi_id) DO UPDATE SET vardiya_id = EXCLUDED.vardiya_id`, [kisiId, merkez]);
    }
    const makine = async (k: string, istasyonId: number) => (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: `RT-${kod}-${k}`, ad: `Deneme ${kod} ${k}`, istasyonId })).id;
    const t1 = await makine('T1', istT), t2 = await makine('T2', istU);
    const [a10] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: t1 }, birimSureDk: 60 })], 30);
    const [b10, b20, b30] = await isEmirleriAc([
      yeniAdim({ kaynak: { tur: 'makine', id: t1 } }), yeniAdim({ kaynak: { tur: 'makine', id: t2 } }), yeniAdim({ kaynak: { tur: 'istasyon', id: istK } }),
    ], 30);
    const ilk = await calismaOku();
    const s0 = await calismaKaydet(ilk.calisma, ilk.surum);
    const k0 = await degerlendir(s0, { tur: 'plan-kur' });
    assert.equal(k0.tur, 'plan-kur');
    const s1 = await planiKaydet(k0.plan);
    const ops = k0.plan.ops;
    const jobB = ops[Object.keys(ops).find((x) => ops[x]!.m === String(t2))!]!.job;
    const [kB10, kB20, kB30] = Object.keys(ops).filter((x) => ops[x]!.job === jobB).sort((x, y) => ops[x]!.S - ops[y]!.S) as [string, string, string];
    const kA = Object.keys(ops).find((x) => ops[x]!.m === String(t1) && ops[x]!.job !== jobB)!;
    assert.ok(ops[kA] && String(ops[kB30]?.m).startsWith('kisi-'), JSON.stringify(Object.values(ops).map((o) => [o.job, o.m, o.S])));
    return { s1, istT, istK, t1, t2, operatorId, ikinci, a10: a10!, b10: b10!, b20: b20!, b30: b30!, kA, kB10, kB20, kB30 };
  };
  return { DK, vt, calismaOku, planiKaydet, bolVeUygula, yenidenPlanla, kur, kurKisi, canliyaAl, onizle, onizleYaniti, taslakYaz, taslakYazCevapli, baslat, ilkPayiBitir, kaydir, parcaYeri, yeri, farkDk };
}

describe('plan (gerçek PostgreSQL): bölünmüş öncülde Kokpit ve canlıya alma yerleşimi aynı (3793)', () => {
  const { calismaOku, bolVeUygula, kur, canliyaAl, onizle, taslakYaz, ilkPayiBitir, parcaYeri, yeri, farkDk } = ortam();
  test('akışlı bağ: öncülün ilk payı bitmiş, ikinci payı geç; ardılın ardılı elle iki parçaya bölünmüş. Kokpit ile yazım 15 dk içinde aynı, sıra ihlali yok', async () => {
    const k = await kur('BOA', { bagimlilik: 'akisli', devirAdedi: 5 });
    await canliyaAl((await bolVeUygula(k.bol10)).surum);
    await ilkPayiBitir(k);
    const { surum, plan } = await bolVeUygula({ ...k.bol10, [k.k30]: [{ adet: 15, m: String(k.e1) }, { adet: 15, m: String(k.e2) }] });
    const { calisma } = await calismaOku();
    const an = (S: number) => planAni(calisma.D.meta.baslangic, S);
    const ops = plan.ops;
    assert.ok(ops[`${k.k10}~2`]!.S > ops[k.k10]!.C + 24, 'Kokpit\'te 2. pay günlerce sonra');
    const oz = await onizle(surum);
    assert.deepEqual(oz.ihlaller, []);
    assert.equal(oz.itilen, undefined, 'Kokpit sınırı sunucununkiyle aynı: itilen pay yok');
    const t = await taslakYaz(surum);
    const p30 = [parcaYeri(t, k.op30, 1)!, parcaYeri(t, k.op30, 2)!];
    const k30 = [ops[k.k30]!, ops[`${k.k30}~2`]!];
    const kaynaklar = p30.map((p) => String(p.kaynak.id));
    for (const [n, p] of p30.entries()) {
      const o = k30.find((x) => x.m === kaynaklar[n])!;
      assert.ok(farkDk(p.baslangic, an(o.S)) < 15 && farkDk(p.bitis, an(o.C)) < 15, `OP30 parça ${String(p.no)}: ${String(p.baslangic)} / Kokpit ${an(o.S)}`);
    }
    const y20 = yeri(t, k.op20);
    assert.ok(farkDk(y20.baslangic, an(ops[k.k20]!.S)) < 15 && farkDk(y20.bitis, an(ops[k.k20]!.C)) < 15, `OP20: ${String(y20.baslangic)} / Kokpit ${an(ops[k.k20]!.S)}`);
    const pay2 = parcaYeri(t, k.op10, 2)!;
    assert.ok(farkDk(pay2.baslangic, an(ops[`${k.k10}~2`]!.S)) < 15, `OP10 2. pay: ${String(pay2.baslangic)} / Kokpit ${an(ops[`${k.k10}~2`]!.S)}`);
  });

});

describe('plan (gerçek PostgreSQL): ilk canlıya almada sabit paylı öncül (3793)', () => {
  const { calismaOku, bolVeUygula, kur, canliyaAl, onizle, taslakYaz, yeri, farkDk } = ortam();
  test('ilk canlıya almada akışlı ardıl, saati geçmiş sabit paylı öncülün her payının ilk partisini bekler (sunucu motoru Kokpit gibi)', async () => {
    const k = await kur('BOB', { bagimlilik: 'akisli', devirAdedi: 5 });
    const { surum, plan } = await bolVeUygula(k.bol10);
    const { calisma } = await calismaOku();
    const an = (S: number) => planAni(calisma.D.meta.baslangic, S);
    const oz = await onizle(surum);
    assert.deepEqual(oz.ihlaller, []);
    const t = await taslakYaz(surum);
    const y20 = yeri(t, k.op20);
    assert.ok(farkDk(y20.baslangic, an(plan.ops[k.k20]!.S)) < 15, `OP20: ${String(y20.baslangic)} / Kokpit ${an(plan.ops[k.k20]!.S)}`);
    await canliyaAl(surum);
  });

});

describe('plan (gerçek PostgreSQL): elle bölünmüş parça öncülün arkasına itilir (3793)', () => {
  const { DK, planiKaydet, bolVeUygula, kur, canliyaAl, onizle, taslakYaz, parcaYeri, yeri } = ortam();
  test('öncül sunucuda Kokpit\'ten geç bitiyorsa elle bölünmüş parça öncülün arkasına itilir, "itildi" döner ve sıra ihlali kalmaz', async () => {
    const k = await kur('BOC', { bagimlilik: 'bekleyen', devirAdedi: null });
    await canliyaAl((await bolVeUygula(k.bol10)).surum);
    const { plan } = await bolVeUygula({ ...k.bol10, [k.k30]: [{ adet: 15, m: String(k.e1) }, { adet: 15, m: String(k.e2) }] });
    // Kokpit'te OP30'un parçaları OP20'den 3 saat önceye çekilmiş (sunucunun öncül bitişinden önce): çalışma eski ya da elle taşınmış olabilir.
    const ops = { ...plan.ops };
    for (const id of [k.k30, `${k.k30}~2`]) ops[id] = { ...ops[id]!, S: ops[id]!.S - 3, C: ops[id]!.C - 3 };
    const surum = await planiKaydet({ ...plan, ops }, { elleBol: { ...k.bol10, [k.k30]: [{ adet: 15, m: String(k.e1) }, { adet: 15, m: String(k.e2) }] } });
    const oz = await onizle(surum);
    assert.deepEqual(oz.ihlaller, []);
    assert.deepEqual(oz.itilen?.map((x) => [x.opNo, x.parca, x.k]).sort(), [[30, 1, k.k30], [30, 2, k.k30]]);
    for (const x of oz.itilen ?? []) assert.ok(Date.parse(x.yeni) > Date.parse(x.onizleme), 'itilen pay geç yazılır');
    const t = await taslakYaz(surum);
    const bitis20 = new Date(yeri(t, k.op20).bitis).getTime();
    for (const no of [1, 2]) assert.ok(new Date(parcaYeri(t, k.op30, no)!.baslangic).getTime() >= bitis20 - DK, `OP30 parça ${String(no)} OP20 bitince başlar`);
  });
});

describe('plan (gerçek PostgreSQL): akışlı bağda bölünmüş ardıl öncülün geç payının ilk partisini bekler (3793)', () => {
  const { DK, planiKaydet, bolVeUygula, kur, canliyaAl, onizle, taslakYaz, kaydir, parcaYeri } = ortam();
  test('ardılın parçaları öncülün ikinci payının ilk partisinden önceye çekilmişse (ilk paydan sonra olsa da) itilir; sınır pay başınadır, zarfın başı değil', async () => {
    const k = await kur('BOD', { bagimlilik: 'akisli', devirAdedi: 5 });
    await canliyaAl((await bolVeUygula(k.bol10)).surum);
    const bol20 = { [k.k20]: [{ adet: 15, m: String(k.d1) }, { adet: 15, m: String(k.d2) }] };
    const { plan } = await bolVeUygula({ ...k.bol10, ...bol20 });
    // OP10'un 1. payı günlerce önce biter; OP20'nin parçaları 2. payın başından 3 saat önceye, yani 1. paydan çok sonraya çekilir.
    const pay2S = plan.ops[`${k.k10}~2`]!.S;
    const kayma = pay2S - 3 - Math.min(plan.ops[k.k20]!.S, plan.ops[`${k.k20}~2`]!.S);
    assert.ok(pay2S - 3 > plan.ops[k.k10]!.C + 24, 'çekilen parçalar 1. paydan günlerce sonra');
    const surum = await planiKaydet(kaydir(plan, [k.k20, `${k.k20}~2`], kayma), { elleBol: { ...k.bol10, ...bol20 } });
    const oz = await onizle(surum);
    assert.deepEqual(oz.ihlaller, []);
    assert.deepEqual(oz.itilen?.map((x) => [x.opNo, x.parca, x.k]).sort(), [[20, 1, k.k20], [20, 2, k.k20]]);
    const t = await taslakYaz(surum);
    const pay2 = new Date(parcaYeri(t, k.op10, 2)!.baslangic).getTime();
    for (const no of [1, 2]) assert.ok(new Date(parcaYeri(t, k.op20, no)!.baslangic).getTime() > pay2 - DK, `OP20 parça ${String(no)} OP10 2. payı başladıktan sonra başlar`);
  });
});

// 3818: canlıdaki yerler önceki yazımın saatindendir; motor öncülü bu yazımda daha geç koyabilir (zaman bir dilim ilerledi). Testte canlıdaki
// OP20 bir dilim (15 dk) erkene alınır: pay canlıdaki OP20'ye göre değil, motorun bu yazımda koyduğu OP20'ye göre itilmeli.
type Ortam = ReturnType<typeof ortam>;
const calisanPayItmesi = async (o: Ortam, kod: string, [adet1, adet2]: [number, number], payKaydir: (plan: Parameters<Ortam['kaydir']>[0], k: Awaited<ReturnType<Ortam['kur']>>, e2Pay: string) => number) => {
  const { DK, vt, planiKaydet, bolVeUygula, kur, canliyaAl, onizle, taslakYazCevapli, baslat, kaydir, yeri } = o;
  const k = await kur(kod, { bagimlilik: 'bekleyen', devirAdedi: null });
  const bol30 = { [k.k30]: [{ adet: adet1, m: String(k.e1) }, { adet: adet2, m: String(k.e2) }] };
  const { surum: s1, plan: p1 } = await bolVeUygula({ ...k.bol10, ...bol30 });
  await canliyaAl(s1);
  const e2Pay = p1.ops[k.k30]!.m === String(k.e2) ? k.k30 : `${k.k30}~2`;
  await baslat(k.op30, k.istE, k.e1);
  const { plan } = await bolVeUygula({ ...k.bol10, ...bol30 });
  const surum = await planiKaydet(kaydir(plan, [e2Pay], payKaydir(plan, k, e2Pay)), { elleBol: { ...k.bol10, ...bol30 } });
  await vt().tx((db) => db.sorgu("UPDATE plan_yerlesimi SET baslangic = baslangic - interval '15 minutes', bitis = bitis - interval '15 minutes' WHERE is_emri_id = $1", [k.op20]));
  const oz = await onizle(surum);
  assert.deepEqual(oz.itilen?.map((x) => [x.opNo, x.k]), [[30, k.k30]], JSON.stringify(oz.itilen));
  assert.deepEqual(oz.ihlaller, []);
  // İtilen saat ve satırın zarfı aynı yazımdan okunur (önizleme ayrı yazımdır, arada dilim değişebilir).
  const { cevap, t } = await taslakYazCevapli(surum);
  const bitis20 = new Date(yeri(t, k.op20).bitis).getTime();
  const op30 = yeri(t, k.op30);
  const p2 = op30.parcalar!.find((x) => String(x.kaynak.id) === String(k.e2))!;
  assert.ok(new Date(p2.baslangic).getTime() >= bitis20 - DK, `OP30 e2 payı OP20 bitince başlar: ${String(p2.baslangic)}`);
  assert.deepEqual(cevap.itilen?.filter((x) => x.opNo === 30).map((x) => [x.parca, x.yeni]), [[p2.no, new Date(p2.baslangic).toISOString()]], JSON.stringify(cevap.itilen));
  const anlar = (f: (x: { baslangic: string | Date; bitis: string | Date }) => string | Date) => op30.parcalar!.map((x) => new Date(f(x)).getTime());
  assert.equal(new Date(op30.baslangic).getTime(), Math.min(...anlar((x) => x.baslangic)), 'satırın başı paylarınkiyle aynı');
  assert.equal(new Date(op30.bitis).getTime(), Math.max(...anlar((x) => x.bitis)), 'satırın sonu paylarınkiyle aynı');
};
describe('plan (gerçek PostgreSQL): çalışan bölünmüş işin başlamamış payı öncülün arkasına itilir (3793)', () => {
  const o = ortam();
  test('OP30 bölünmüş ve 1. payı sahada çalışıyor; 2. payı Kokpit\'te OP20 bitmeden önceye çekilmişse yerinde kalan pay oynamaz, 2. pay motorun koyduğu OP20\'nin arkasına itilir', async () => {
    await calisanPayItmesi(o, 'BOE', [15, 15], () => -3);
  });
});
describe('plan (gerçek PostgreSQL): çalışan bölünmüş işin payı motor sonrası öncüle göre itilir (3818)', () => {
  const o = ortam();
  test('2. pay canlıdaki OP20\'nin hemen arkasındaysa ilk bakışta itilmez; motor OP20\'yi bir dilim geç koyunca itilir ve "itildi" listesine girer', async () => {
    // 2. pay uzun (25 adet): satırın sonu itilen payın sonudur, zarfın sonu da denetlenir.
    await calisanPayItmesi(o, 'BOF', [5, 25], (plan, k, e2Pay) => plan.ops[k.k20]!.C - 0.25 - plan.ops[e2Pay]!.S);
  });
});

describe('plan (gerçek PostgreSQL): sahada süren iş durdurulanlarda olsa da yerinde; kişi tezgâhındaki ardıl öncülüyle kayar (3793 ek)', () => {
  const { calismaOku, yenidenPlanla, kurKisi, onizle, taslakYaz, baslat, yeri, farkDk } = ortam();
  test('t1\'de sahada süren A OP10 durdurulmuş ve kalanı ileriye kilitlenmiş; B OP10 aynı t1\'de, B OP30 kişi tezgâhında: Kokpit ile yazım 15 dk içinde aynı, ihlal yok', async () => {
    const k = await kurKisi('SSK');
    await baslat(k.a10, k.istT, k.t1);
    // Planlamacı A OP10'u Kokpit'te durdurup kalanını iki gün sonraya taşımış (w.durdurulan ve kilit); operatör sahada durdurmamış.
    const { calisma: c0 } = await calismaOku();
    const ops0 = c0.plan!.ops;
    const { surum, plan } = await yenidenPlanla({
      w: { ...(c0['w'] as Record<string, unknown>), durdurulan: { [k.kA]: 1 } },
      locks: { ...(c0['locks'] as Record<string, unknown>), [k.kA]: { m: String(k.t1), S: ops0[k.kA]!.S + 48 } },
    });
    const { calisma } = await calismaOku();
    const an = (S: number) => planAni(calisma.D.meta.baslangic, S);
    assert.ok(Math.abs(plan.ops[k.kA]!.S - ops0[k.kA]!.S) < 24, 'Kokpit sahada süren işi yerinde tutar');
    const oz = await onizle(surum);
    assert.deepEqual(oz.ihlaller, []);
    const t = await taslakYaz(surum);
    for (const [isEmri, kk] of [[k.b10, k.kB10], [k.b20, k.kB20], [k.b30, k.kB30]] as const) {
      const y = yeri(t, isEmri), o = plan.ops[kk]!;
      assert.ok(farkDk(y.baslangic, an(o.S)) < 15, `${kk}: yazım ${String(y.baslangic)} / Kokpit ${an(o.S)}`);
    }
  });
});

// 3793 2a: Kokpit'in çalışması eski (B'nin adımları saatlerce önce); sunucu motoru B OP10'u sahada süren A'nın arkasına koyar, B OP20 onunla
// kayar. Kişi tezgâhındaki B OP30 motorsuz yazılır: öncülün sunucudaki bitişinden önceye yazılmaz, arkasına itilir.
function kisiItmeSenaryosu(kod: string, bol: boolean) {
  const { DK, calismaOku, planiKaydet, yenidenPlanla, bolVeUygula, kurKisi, onizle, taslakYaz, baslat, kaydir, yeri } = ortam();
  test(`kişi tezgâhındaki ${bol ? 'bölünmüş' : 'tek parça'} ardıl, öncülü sunucuda kayınca öncülün arkasına itilir ve "itildi" döner`, async () => {
    const k = await kurKisi(kod);
    await baslat(k.a10, k.istT, k.t1);
    const bolme = bol ? { [k.kB30]: [{ adet: 15, m: `kisi-${String(k.operatorId)}` }, { adet: 15, m: `kisi-${String(k.ikinci)}` }] } : {};
    const { plan } = bol ? await bolVeUygula(bolme) : await yenidenPlanla();
    const b30 = Object.keys(plan.ops).filter((x) => x === k.kB30 || x.startsWith(`${k.kB30}~`));
    assert.equal(b30.length, bol ? 2 : 1, JSON.stringify(b30));
    // Kokpit'te B OP10-20 20 saat, B OP30 22 saat önce (kişinin önceki vardiyası): kuyruk turu B OP20'yi sahada süren A'yı bilmeden erken sayar,
    // B OP30 onun arkasında görünür; motor B OP10'u A'nın arkasına koyunca B OP30 öncülünden önce kalırdı.
    const surum = await planiKaydet(kaydir(kaydir(plan, [k.kB10, k.kB20], -20), b30, -22), bol ? { elleBol: bolme } : {});
    const oz = await onizle(surum);
    assert.deepEqual(oz.ihlaller, []);
    const itilen = (oz.itilen ?? []).filter((x) => x.opNo === Math.max(...(oz.itilen ?? []).map((y) => y.opNo)));
    assert.equal(itilen.length, b30.length, JSON.stringify(oz.itilen));
    for (const x of itilen) assert.ok(Date.parse(x.yeni) > Date.parse(x.onizleme) && x.k === k.kB30 && (x.parca === null) === !bol, JSON.stringify(x));
    const t = await taslakYaz(surum);
    const bitis20 = new Date(yeri(t, k.b20).bitis).getTime();
    const y30 = yeri(t, k.b30);
    for (const p of y30.parcalar?.length ? y30.parcalar : [y30]) assert.ok(new Date(p.baslangic).getTime() >= bitis20 - DK, `B OP30 B OP20 bitince başlar: ${String(p.baslangic)}`);
    assert.ok((await calismaOku()).surum !== null);
  });
}
describe('plan (gerçek PostgreSQL): kişi tezgâhındaki tek parça ardıl öncülün arkasına itilir (3793 2a)', () => { kisiItmeSenaryosu('SKT', false); });
describe('plan (gerçek PostgreSQL): kişi tezgâhındaki bölünmüş ardılın parçaları öncülün arkasına itilir (3793 2a)', () => { kisiItmeSenaryosu('SKB', true); });

describe('plan (gerçek PostgreSQL): kilitli adım sahada süren işle üst üste; ileti çakışan işi söyler (3793 6)', () => {
  const { calismaOku, planiKaydet, yenidenPlanla, kurKisi, canliyaAl, onizleYaniti, baslat } = ortam();
  test('B OP10 Kokpit\'te sahada süren A OP10\'un saatine kilitli: ileti A\'yı, makineyi, canlıdaki aralığı ve "sahada çalışıyor" nedenini yazar', async () => {
    const k = await kurKisi('SCI');
    await canliyaAl(k.s1);
    await baslat(k.a10, k.istT, k.t1);
    const { plan } = await yenidenPlanla();
    const a = plan.ops[k.kA]!, b10 = plan.ops[k.kB10]!;
    assert.ok(a.C > a.S + 2, 'A uzun sürüyor');
    const S = a.S + 1;
    const { calisma } = await calismaOku();
    const surum = await planiKaydet({ ...plan, ops: { ...plan.ops, [k.kB10]: { ...b10, m: a.m, S, C: S + (b10.C - b10.S) } } },
      { locks: { ...(calisma['locks'] as Record<string, unknown>), [k.kB10]: { m: a.m, S } } });
    const r = await onizleYaniti(surum);
    assert.equal(r.statusCode, 409, r.body);
    const ileti = r.json<{ hata?: string; ileti?: string; mesaj?: string }>();
    const metin = JSON.stringify(ileti);
    for (const parca of ['OP 10 kilitli saatinde', 'RT-SCI-T1', 'ile üst üste', 'OP 10 sahada çalışıyor', 'arasında yerinde kalıyor', 'kilidi kaldırın']) assert.ok(metin.includes(parca), `${parca}: ${metin}`);    // 3805: aynı çakışma ayrıntıda yapılı gelir; alanlar iletideki metinle birebir aynıdır (istemci çareyi buradan kurar).
    const govde = r.json<{ mesaj: string; ayrinti?: { kilitCakismasi?: unknown } }>();
    const x = kilitCakismasiAyrintisi.parse(govde.ayrinti?.kilitCakismasi);
    assert.deepEqual([x.opNo, x.engelOpNo, x.neden], [10, 10, 'sahada çalışıyor']);
    assert.ok(x.kaynak.includes('RT-SCI-T1') && x.emirNo !== x.engelEmirNo, JSON.stringify(x));
    assert.ok(govde.mesaj.startsWith(`${x.emirNo} OP ${String(x.opNo)} kilitli saatinde ${x.kaynak} üzerinde ${x.engelEmirNo} OP ${String(x.engelOpNo)} ile üst üste. `), govde.mesaj);
    assert.ok(govde.mesaj.includes(`OP ${String(x.engelOpNo)} ${x.neden}, canlıda ${x.baslangic} - ${x.bitis} arasında yerinde kalıyor.`), govde.mesaj);
  });
});
