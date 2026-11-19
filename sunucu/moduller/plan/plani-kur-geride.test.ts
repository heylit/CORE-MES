import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { CalismaGonderCevabi, DegerlendirmeDurumuCevabi, PlanlamaCalismasiCevabi } from '#paylasilan/sozlesme/planlama.ts';
import { kullaniciYukle } from '../kisiler/disari.ts';
import { emirBaslat } from '../uretim-emirleri/disari.ts';
import { PLANLAMA_ANAHTARI } from './disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 3447: canlıdaki iş başlaması geçtiği halde başlamadıysa (operatör geç kaldı) "Planı kur" onu şimdiye alır, ardılını ve tezgâhtaki
// sonraki işleri sırasıyla kaydırır; ardıl öncülünden önce başlamaz, önündeki boşluğa yeni iş girmez. Saat sınırını beklemeden aynı durum
// kayıtlı planda işin yeri geriye alınarak kurulur: sonuç gerçek saatten bağımsızdır. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): planı kur başlaması geçmiş işin sırasını korur', () => {
  const { c, vt, tamam, istek, yeniAdim, isEmirleriAc, durum } = planTestOrtami();

  type Op = { m: string; S: number; C: number; job?: string };
  type Calisma = Record<string, unknown> & { dataVer: number; plan: (Record<string, unknown> & { ops: Record<string, Op> }) | null };
  const calismaOku = async () => {
    const r = await tamam<PlanlamaCalismasiCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi');
    assert.ok(r.calisma, 'çalışma okunur');
    return { calisma: r.calisma as unknown as Calisma, surum: r.surum };
  };
  const calismaKaydet = async (calisma: Calisma, beklenenSurum: number | null) =>
    (await tamam<{ kayit: { surum: number } }>(c.planlama, 'POST', '/plan/planlama-kayitlari/yaz', { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma, beklenenSurum })).kayit.surum;
  const planKur = async (surum: number) => {
    const { is } = await tamam<{ is: string }>(c.planlama, 'POST', '/plan/planlama-degerlendirmesi', { surum, istek: { tur: 'plan-kur' } });
    for (let i = 0; i < 600; i++) {
      const d = await tamam<DegerlendirmeDurumuCevabi>(c.planlama, 'GET', `/plan/planlama-degerlendirmesi/${is}`);
      if (d.durum === 'bitti') {
        if (d.cevap.sonuc.tur !== 'plan-kur') return assert.fail('plan kurulmadı');
        return { simdi: d.cevap.simdi, plan: d.cevap.sonuc.plan as unknown as NonNullable<Calisma['plan']> };
      }
      assert.notEqual(d.durum, 'hata', JSON.stringify(d));
      await new Promise((t) => { setTimeout(t, 100); });
    }
    return assert.fail('plan kurma sonucu gelmedi');
  };
  const planiYaz = async (plan: NonNullable<Calisma['plan']>) => {
    const { calisma, surum } = await calismaOku();
    const dataVer = calisma.dataVer + 1;
    return calismaKaydet({ ...calisma, dataVer, plan: { ...plan, dataVer, kaynak: 'sifir' } }, surum);
  };

  // Aynı tezgâhta iki iş üst üste binmez (kilitli ve kayan işler dahil).
  const cakismaYok = (ops: Record<string, Op>) => {
    const l = Object.entries(ops).filter(([, o]) => Number.isFinite(o.S) && o.C > o.S).sort((x, y) => x[1].S - y[1].S);
    for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
      const [x, o] = l[i]!, [y, q] = l[j]!;
      if (o.m === q.m) assert.ok(q.S >= o.C - 1e-6, `${x} ve ${y} üst üste: ${JSON.stringify([o, q])}`);
    }
  };

  test('PG-01: başlaması geçmiş OP 10 şimdiye alınır, OP 20 ondan sonra kalır; yeni emir önüne girmez ve plan gerekçesiz canlıya geçer (izinli)', async () => {
    await isEmirleriAc([yeniAdim(), yeniAdim()], 10);
    const bos = await calismaOku();
    const ilk = await planKur(await calismaKaydet(bos.calisma, bos.surum));
    const [a10, a20] = Object.keys(ilk.plan.ops).sort((x, y) => ilk.plan.ops[x]!.S - ilk.plan.ops[y]!.S) as [string, string];
    const r1 = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'Geride ilk', calismaSurumu: await planiYaz(ilk.plan), dortSaatGerekcesi: null });
    assert.equal(r1.statusCode, 200, r1.body);

    // Yarım saat geçmiş gibi: OP 10'un yeri şimdiden önceye düşer, OP 20 hâlâ önümüzdedir. Kayıtlı planda iş yarım saat geriye alınır.
    await isEmirleriAc([yeniAdim(), yeniAdim()], 10);
    const { calisma, surum } = await calismaOku();
    const ops = calisma.plan!.ops;
    const geri = Object.fromEntries(Object.entries(ops).map(([id, o]) => [id, id === a10 || id === a20 ? { ...o, S: o.S - 0.5, C: o.C - 0.5 } : o]));
    const s1 = await calismaKaydet({ ...calisma, plan: { ...calisma.plan!, ops: geri } }, surum);
    const { simdi, plan } = await planKur(s1);
    const p = plan.ops;
    assert.ok(p[a10]!.S < ilk.plan.ops[a10]!.S + 0.5 && p[a10]!.S >= simdi - 1e-9, `OP 10 şimdiye alınır: ${String(p[a10]!.S)}, şimdi ${String(simdi)}`);
    assert.ok(p[a20]!.S >= p[a10]!.C - 1e-6, `OP 20 OP 10'dan sonra: ${JSON.stringify([p[a10], p[a20]])}`);
    const yeniler = Object.keys(p).filter((id) => id !== a10 && id !== a20);
    assert.ok(yeniler.length > 0, 'yeni emir plana girdi');
    for (const id of yeniler) if (p[id]!.m === p[a10]!.m) assert.ok(p[id]!.S >= p[a10]!.C - 1e-6, `${id} OP 10'un önüne girmez: ${JSON.stringify([p[a10], p[id]])}`);
    cakismaYok(p);

    const r2 = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'Geride kayan', calismaSurumu: await planiYaz(plan), dortSaatGerekcesi: null });
    assert.equal(r2.statusCode, 200, r2.body);
    assert.equal(r2.json<CalismaGonderCevabi>().uyarilar, undefined);
  });

  // Risk P1: aynı tezgâhta süren iş varken geride iş şimdiye değil, süren işin tahmini bitişinden sonraya alınır.
  test('PG-02: başlaması geçmiş iş aynı tezgâhta süren işin bitişinden sonra başlar (izinli)', async () => {
    const tezgahB = () => yeniAdim({ kaynak: { tur: 'makine', id: durum().makineB } });
    const [x] = await isEmirleriAc([tezgahB()], 10) as [number];
    await isEmirleriAc([tezgahB()], 10);
    const { calisma: c0, surum: s0 } = await calismaOku();
    const ilk = await planKur(await calismaKaydet(c0, s0));
    const r1 = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'Süren ilk', calismaSurumu: await planiYaz(ilk.plan), dortSaatGerekcesi: null });
    assert.equal(r1.statusCode, 200, r1.body);
    const { operatorId } = durum();
    const ist = (await vt().tx((db) => db.tek<{ i: number; u: number }>('SELECT istasyon_id AS i, uretim_emri_id AS u FROM uretim_emirleri_is_emri WHERE id = $1', [x])))!;
    await vt().tx((db) => db.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [operatorId, ist.i]));
    const op = (await vt().tx((db) => kullaniciYukle(db, operatorId)))!;
    await vt().tx((db) => emirBaslat(db, op, ist.u));

    // Süren işin tezgâhındaki öteki iş (başlamamış) kayıtlı planda şimdiden önceye alınır.
    const { calisma, surum } = await calismaOku();
    const ops = calisma.plan!.ops;
    const kur = await planKur(surum!);
    const suren = Object.keys(kur.plan.ops).find((id) => (kur.plan.ops[id] as Op & { act?: number }).act === 1);
    assert.ok(suren, `süren iş planda: ${JSON.stringify(kur.plan.ops)}`);
    const m = kur.plan.ops[suren]!.m;
    const geride = Object.keys(ops).find((id) => id !== suren && ops[id]!.m === m && !(ops[id] as Op & { act?: number }).act);
    assert.ok(geride, 'aynı tezgâhta ikinci iş');
    const geri = { ...ops, [geride]: { ...ops[geride]!, S: kur.simdi - 0.25, C: kur.simdi - 0.25 + ops[geride]!.C - ops[geride]!.S } };
    const s1 = await calismaKaydet({ ...calisma, plan: { ...calisma.plan!, ops: geri } }, surum);
    const { plan } = await planKur(s1);
    const p = plan.ops;
    assert.ok(p[geride]!.S >= p[suren]!.C - 1e-6, `geride iş süren işten sonra: ${JSON.stringify([p[suren], p[geride]])}`);
    cakismaYok(p);
  });
});

// Test T2: elle kilitli iş yerinde kalır; şimdiye alınan geride iş onunla üst üste binmez, kilidin bitişinden sonra başlar.
describe('plan (gerçek PostgreSQL): planı kur geride işi elle kilidin üstüne koymaz', () => {
  const { c, tamam, istek, yeniAdim, isEmirleriAc } = planTestOrtami();
  type Op = { m: string; S: number; C: number };
  type Calisma = Record<string, unknown> & { dataVer: number; plan: (Record<string, unknown> & { ops: Record<string, Op> }) | null; locks?: Record<string, unknown> };
  const calismaOku = async () => {
    const r = await tamam<PlanlamaCalismasiCevabi>(c.planlama, 'GET', '/plan/planlama-calismasi');
    assert.ok(r.calisma, 'çalışma okunur');
    return { calisma: r.calisma as unknown as Calisma, surum: r.surum };
  };
  const calismaKaydet = async (calisma: Calisma, beklenenSurum: number | null) =>
    (await tamam<{ kayit: { surum: number } }>(c.planlama, 'POST', '/plan/planlama-kayitlari/yaz', { anahtar: PLANLAMA_ANAHTARI, bicim: 'json', deger: calisma, beklenenSurum })).kayit.surum;
  const planKur = async (surum: number) => {
    const { is } = await tamam<{ is: string }>(c.planlama, 'POST', '/plan/planlama-degerlendirmesi', { surum, istek: { tur: 'plan-kur' } });
    for (let i = 0; i < 600; i++) {
      const d = await tamam<DegerlendirmeDurumuCevabi>(c.planlama, 'GET', `/plan/planlama-degerlendirmesi/${is}`);
      if (d.durum === 'bitti') {
        if (d.cevap.sonuc.tur !== 'plan-kur') return assert.fail('plan kurulmadı');
        return { simdi: d.cevap.simdi, plan: d.cevap.sonuc.plan as unknown as NonNullable<Calisma['plan']> };
      }
      assert.notEqual(d.durum, 'hata', JSON.stringify(d));
      await new Promise((t) => { setTimeout(t, 100); });
    }
    return assert.fail('plan kurma sonucu gelmedi');
  };

  test('PG-03: geride iş elle kilitli işin bitişinden sonra başlar; kilitli iş yerinde kalır (izinli)', async () => {
    await isEmirleriAc([yeniAdim()], 10);
    await isEmirleriAc([yeniAdim()], 10);
    const bos = await calismaOku();
    const ilk = await planKur(await calismaKaydet(bos.calisma, bos.surum));
    const [x, y] = Object.keys(ilk.plan.ops).sort((a, b) => ilk.plan.ops[a]!.S - ilk.plan.ops[b]!.S) as [string, string];
    const { calisma: c1, surum: s1 } = await calismaOku();
    const dataVer = c1.dataVer + 1;
    const s2 = await calismaKaydet({ ...c1, dataVer, plan: { ...ilk.plan, dataVer, kaynak: 'sifir' } }, s1);
    const r1 = await istek(c.planlama, 'POST', '/plan/planlama-calismasi/canliya-al', { ad: 'Elle kilit ilk', calismaSurumu: s2, dortSaatGerekcesi: null });
    assert.equal(r1.statusCode, 200, r1.body);

    // X yarım saat geride kalır (başlamadı); Y elle X'in eski bitişinden önce, şimdiden çeyrek saat sonraya kilitlenir.
    const { calisma, surum } = await calismaOku();
    const ops = calisma.plan!.ops, t0 = ilk.plan.ops[x]!.S;
    const kilitS = t0 + 0.25, yDk = ops[y]!.C - ops[y]!.S;
    const yeniOps = { ...ops, [x]: { ...ops[x]!, S: ops[x]!.S - 0.5, C: ops[x]!.C - 0.5 }, [y]: { ...ops[y]!, S: kilitS, C: kilitS + yDk } };
    const s3 = await calismaKaydet({ ...calisma, plan: { ...calisma.plan!, ops: yeniOps }, locks: { [y]: { m: ops[y]!.m, S: kilitS } } }, surum);
    const { plan } = await planKur(s3);
    const p = plan.ops;
    assert.ok(Math.abs(p[y]!.S - kilitS) < 1e-6, `elle kilitli iş yerinde: ${JSON.stringify(p[y])}`);
    assert.ok(p[x]!.S >= p[y]!.C - 1e-6, `geride iş kilidin bitişinden sonra: ${JSON.stringify([p[x], p[y]])}`);
  });
});

