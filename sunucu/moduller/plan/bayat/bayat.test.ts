import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PlanSurumCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { bayatAdimBittiYansit, bayatEmirBittiYansit, bayatEmirIptalYansit, bayatIsEmirleriDegistiYansit, planBayatligi } from '../disari.ts';
import { kullaniciYukle } from '../../kisiler/disari.ts';
import { emirBaslat, emirBitir, emirIptalEt } from '../../uretim-emirleri/disari.ts';
import { planTestOrtami } from '../plan-ortak.test.ts';
import { isaretYaz } from './servis.ts';
import * as s from './sorgular.ts';

// 2319 (2311 S7): canlı plan bayat işareti, gerçek PostgreSQL. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): canlı plan bayat işareti', () => {
  const { c, vt, tamam, yeniAdim, isEmirleriAc, taslaktaOner, isEmriMakinesi, durum } = planTestOrtami();
  const emriOf = async (isEmriId: number) =>
    (await vt().tx((db) => db.tek<{ id: number }>('SELECT uretim_emri_id AS id FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId])))!.id;
  const ileri = (ids: number[], aralik: string) => vt().tx((db) => db.sorgu(
    `UPDATE plan_yerlesimi SET baslangic = baslangic + $2::interval, bitis = bitis + $2::interval WHERE is_emri_id = ANY($1::int[])`, [ids, aralik]));
  const bayatlik = () => vt().tx((db) => planBayatligi(db));

  test('BY-01: canlı plan yokken bayat değildir', async () => {
    const b = await bayatlik();
    assert.equal(b.bayat, false);
    assert.equal(b.sonCanliyaAlma, null);
    // Açık ekranların sürüm sorusu işareti taşır (oturumlu, operatör de okur).
    assert.equal((await tamam<PlanSurumCevabi>(c.operator, 'GET', '/plan/surum')).bayat?.bayat, false);
  });

  test('BY-02..05: erken biten emir ve makine duruşu işaretler; tekrar yazılmaz; geçmiş satırlı emir yazmaz; canlıya alma sıfırlar', async () => {
    const [i1] = await isEmirleriAc([yeniAdim()]);
    const [i2] = await isEmirleriAc([yeniAdim()]);
    const p = await taslaktaOner();
    const o = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/onaya-gonder`, { surum: p.taslak!.surum }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!;
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${o.id}/canliya-al`, { surum: o.surum, cakismalariKabul: true });
    await ileri([i1!], '1 day');
    await ileri([i2!], '-30 days');
    const e1 = await emriOf(i1!), e2 = await emriOf(i2!);
    // BY-02: canlıda gelecekte biten satırı olan emir bitti: işaret.
    await vt().tx((db) => bayatEmirBittiYansit(db, { uretimEmriId: e1 }));
    let b = await bayatlik();
    assert.equal(b.bayat, true);
    assert.equal(b.sayilar['emir-bitti'], 1);
    assert.ok(b.olaylar[0]?.emirNo);
    // 2508 b: olay listesi ve sayılar yalnız planlama sayfalarını görene (plan.planlama-oku); operatör yalnız işareti görür.
    assert.equal((await tamam<PlanSurumCevabi>(c.planlama, 'GET', '/plan/surum')).bayat?.sayilar?.['emir-bitti'], 1);
    const op = (await tamam<PlanSurumCevabi>(c.operator, 'GET', '/plan/surum')).bayat;
    assert.deepEqual(op && Object.keys(op).sort(), ['bayat', 'sonCanliyaAlma']);
    assert.equal(op?.bayat, true);
    // BY-03: aynı olay ikinci kez yazılmaz.
    await vt().tx((db) => bayatEmirBittiYansit(db, { uretimEmriId: e1 }));
    // BY-04: canlı satırları geçmişte biten emir işaretlemez.
    await vt().tx((db) => bayatEmirBittiYansit(db, { uretimEmriId: e2 }));
    b = await bayatlik();
    assert.equal(b.sayilar['emir-bitti'], 1);
    // Makine duruşu: canlıda bitmemiş işi olan makine arızaya geçer.
    const makine = await isEmriMakinesi(i1!);
    const plan = await vt().tx((db) => db.tek<{ makine_id: number | null }>('SELECT makine_id FROM plan_yerlesimi WHERE is_emri_id = $1', [i1]));
    const m = plan?.makine_id ?? makine;
    assert.ok(m, 'canlı satır makinede');
    await vt().tx((db) => db.sorgu(
      `INSERT INTO istasyonlar_makine_durumu (makine_id, durum, degistiren_kisi_id) VALUES ($1, 'ariza', $2)
         ON CONFLICT (makine_id) DO UPDATE SET durum = 'ariza', degisme = now()`, [m, durum().yoneticiId]));
    b = await bayatlik();
    assert.equal(b.sayilar.durus, 1);
    assert.ok(b.olaylar.some((o) => o.neden === 'durus' && o.makineKod !== null));
    // BY-05: son canlıya almadan önceki olay sayılmaz (kapanmış senaryo değişmez; olaylar canlıya almanın öncesine çekilir).
    await vt().tx(async (db) => {
      await db.sorgu(`UPDATE plan_bayat_olayi SET zaman = zaman - interval '2 days'`);
      await db.sorgu(`UPDATE istasyonlar_makine_durumu SET degisme = degisme - interval '2 days' WHERE makine_id = $1`, [m]);
    });
    b = await bayatlik();
    assert.equal(b.bayat, false);
    await vt().tx((db) => db.sorgu(`UPDATE istasyonlar_makine_durumu SET durum = 'calisir' WHERE makine_id = $1`, [m]));
  });

  test('BY-07 (2320 CEO): kayıtlı dinleyicinin yazımı hata verse de komut işlemi geri alınmaz (bitir geçer)', async () => {
    const [i4] = await isEmirleriAc([yeniAdim()]);
    const p = await taslaktaOner();
    const o = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/onaya-gonder`, { surum: p.taslak!.surum }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!;
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${o.id}/canliya-al`, { surum: o.surum, cakismalariKabul: true });
    await ileri([i4!], '1 day');
    const e4 = await emriOf(i4!);
    // Uygulama kullanıcısı tabloyu değiştiremez; yazım kilit beklemesiyle düşürülür: başka işlem aynı olayı yazmış ve bırakmamıştır.
    let birak!: () => void, tutuldu!: () => void;
    const bekle = new Promise<void>((r) => { birak = r; }), tutuyor = new Promise<void>((r) => { tutuldu = r; });
    const tutan = vt().tx(async (db) => { await s.olayYaz(db, 'emir-bitti', e4, null); tutuldu(); await bekle; throw new Error('geri al'); }).catch(() => undefined);
    await tutuyor;
    try {
      await vt().tx(async (db) => {
        await db.sorgu("SET LOCAL lock_timeout = '200ms'");
        await db.sorgu('UPDATE uretim_emirleri_is_emri SET durum = durum WHERE id = $1', [i4]);
        await bayatEmirBittiYansit(db, { uretimEmriId: e4 });
        assert.equal((await db.tek<{ x: number }>('SELECT 1 AS x'))?.x, 1);
      });
    } finally {
      birak();
      await tutan;
    }
    const n = await vt().tx((db) => db.tek<{ n: number }>('SELECT count(*)::int AS n FROM plan_bayat_olayi WHERE uretim_emri_id = $1', [e4]));
    assert.equal(n?.n, 0);
  });

  test('BY-06 (2320 CEO): işaret yazımı hata verse de komutun işlemi sürer ve yazılır', async () => {
    const [i3] = await isEmirleriAc([yeniAdim()]);
    const e3 = await emriOf(i3!);
    await vt().tx(async (db) => {
      await s.olayYaz(db, 'fason-donusu', e3, 77);
      await isaretYaz(db, async () => { await db.sorgu('SELECT 1 / 0'); });
      await isaretYaz(db, async () => { throw new Error('beklenmeyen'); });
      // İşlem bozulmadı: komutun sonraki adımı koşar.
      assert.equal((await db.tek<{ x: number }>('SELECT 1 AS x'))?.x, 1);
    });
    const n = await vt().tx((db) => db.tek<{ n: number }>('SELECT count(*)::int AS n FROM plan_bayat_olayi WHERE uretim_emri_id = $1', [e3]));
    assert.equal(n?.n, 1);
  });
  // 2320 (Birleştirici kapısı): gerçek bitir komutu (emirBaslat + emirBitir, kayıtlı dinleyiciyle) işaret yazımı düşerken de geçer; emir biter,
  // işaret yazılmaz. Yazım, tablo sahibinin tuttuğu kilit ve komut işleminin kilit süre sınırıyla düşürülür. Kilit yokken aynı komut işareti yazar.
  test('BY-08 (2320): S7 bitir komutunu reddetmez; dinleyici yazamasa da emir biter', async () => {
    const [i5] = await isEmirleriAc([yeniAdim()]);
    const [i6] = await isEmirleriAc([yeniAdim()]);
    const p = await taslaktaOner();
    const o = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/onaya-gonder`, { surum: p.taslak!.surum }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!;
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${o.id}/canliya-al`, { surum: o.surum, cakismalariKabul: true });
    await ileri([i5!, i6!], '1 day');
    const e5 = await emriOf(i5!), e6 = await emriOf(i6!);
    const bitir = (emirId: number, sinir: boolean) => vt().tx(async (db) => {
      const k = (await kullaniciYukle(db, durum().yoneticiId))!;
      await emirBaslat(db, k, emirId);
      if (sinir) await db.sorgu("SET LOCAL lock_timeout = '200ms'");
      return emirBitir(db, k, emirId, 1);
    });
    // B-2499-12: son adım emirle birlikte bitince adim-bitti de yazılır; bu test emir-bitti işaretini sayar.
    const say = (emirId: number) => vt().tx((db) => db.tek<{ n: number }>("SELECT count(*)::int AS n FROM plan_bayat_olayi WHERE uretim_emri_id = $1 AND neden = 'emir-bitti'", [emirId]));
    let birak!: () => void, tutuldu!: () => void;
    const bekle = new Promise<void>((r) => { birak = r; }), tutuyor = new Promise<void>((r) => { tutuldu = r; });
    const tutan = durum().ortam!.sahip.tx(async (db) => { await db.sorgu('LOCK TABLE plan_bayat_olayi IN EXCLUSIVE MODE'); tutuldu(); await bekle; });
    await tutuyor;
    try {
      const r = await bitir(e5, true);
      assert.equal(r.emir.id, e5);
      assert.equal(r.emir.durum, 'bitti', JSON.stringify(r.emir));
    } finally {
      birak();
      await tutan;
    }
    assert.equal((await say(e5))?.n, 0, 'düşen yazım işaret bırakmaz');
    await bitir(e6, false);
    assert.equal((await say(e6))?.n, 1, 'dinleyici bitir komutunda koşar');
  });
  // 2327-1 a: emrin adımı değişti. Canlıdaki emir işaretlenir; aynı canlı planda emir başına bir satır; yeni canlıya almadan sonraki değişiklik
  // yeniden yazılır; canlıda olmayan emir işaretlenmez.
  test('BY-09 (2327-1 a): adım değişen canlı emir rota-degisti işaretler; canlı sürüm başına bir satır', async () => {
    const [i7] = await isEmirleriAc([yeniAdim()]);
    const canliyaAl = async () => {
      const p = await taslaktaOner();
      const o = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/onaya-gonder`, { surum: p.taslak!.surum }))
        .senaryolar.find((x) => x.id === p.taslak!.id)!;
      await tamam(c.mudur, 'POST', `/plan/senaryolar/${o.id}/canliya-al`, { surum: o.surum, cakismalariKabul: true });
    };
    await canliyaAl();
    const e7 = await emriOf(i7!);
    const [i8] = await isEmirleriAc([yeniAdim()]);
    const e8 = await emriOf(i8!);
    const yansit = (id: number) => vt().tx((db) => bayatIsEmirleriDegistiYansit(db, { uretimEmriId: id }));
    const say = (id: number) => vt().tx((db) => db.tek<{ n: number }>("SELECT count(*)::int AS n FROM plan_bayat_olayi WHERE neden = 'rota-degisti' AND uretim_emri_id = $1", [id]));
    await yansit(e7);
    await yansit(e7);
    await yansit(e8);
    assert.equal((await say(e7))?.n, 1, 'aynı canlı planda bir satır');
    assert.equal((await say(e8))?.n, 0, 'canlıda olmayan emir');
    const b = await bayatlik();
    assert.equal(b.sayilar['rota-degisti'], 1);
    assert.ok(b.olaylar.some((o) => o.neden === 'rota-degisti' && o.emirNo !== null));
    await canliyaAl();
    assert.equal((await bayatlik()).sayilar['rota-degisti'], 0, 'canlıya alma sıfırlar');
    await yansit(e7);
    assert.equal((await say(e7))?.n, 2, 'yeni canlı sürümde yeniden yazılır');
  });
  // 2732: iptal ya da arşiv (ikisi de iptal olayını yayar) canlıdaki emrin yerini boşaltır. Canlıdaki emir işaretlenir, ikinci yazım tek satır kalır;
  // canlıda olmayan emir işaretlenmez. Gerçek iptal komutu kayıtlı dinleyiciyle işaret yazar.
  test('BY-10 (2732): iptal edilen canlı emir emir-iptal işaretler; canlıda olmayan yazmaz; tekrar yazılmaz', async () => {
    const [i9] = await isEmirleriAc([yeniAdim()]);
    const p = await taslaktaOner();
    const o = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/onaya-gonder`, { surum: p.taslak!.surum }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!;
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${o.id}/canliya-al`, { surum: o.surum, cakismalariKabul: true });
    const e9 = await emriOf(i9!);
    const [i10] = await isEmirleriAc([yeniAdim()]);
    const e10 = await emriOf(i10!);
    const say = (id: number) => vt().tx((db) => db.tek<{ n: number }>("SELECT count(*)::int AS n FROM plan_bayat_olayi WHERE neden = 'emir-iptal' AND uretim_emri_id = $1", [id]));
    await vt().tx((db) => bayatEmirIptalYansit(db, { uretimEmriId: e9 }));
    await vt().tx((db) => bayatEmirIptalYansit(db, { uretimEmriId: e9 }));
    await vt().tx((db) => bayatEmirIptalYansit(db, { uretimEmriId: e10 }));
    assert.equal((await say(e9))?.n, 1, 'aynı emir bir satır');
    assert.equal((await say(e10))?.n, 0, 'canlıda olmayan emir');
    const b = await bayatlik();
    assert.equal(b.bayat, true);
    assert.equal(b.sayilar['emir-iptal'], 1);
    assert.ok(b.olaylar.some((x) => x.neden === 'emir-iptal' && x.emirNo !== null));
  });

  test('BY-11 (2732): emirIptalEt ile iptal edilen canlı emir kablodan emir-iptal işaretler', async () => {
    const [i11] = await isEmirleriAc([yeniAdim()]);
    const p = await taslaktaOner();
    const o = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/onaya-gonder`, { surum: p.taslak!.surum }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!;
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${o.id}/canliya-al`, { surum: o.surum, cakismalariKabul: true });
    const e11 = await emriOf(i11!);
    await vt().tx(async (db) => { await emirIptalEt(db, (await kullaniciYukle(db, durum().yoneticiId))!, e11); });
    const n = await vt().tx((db) => db.tek<{ n: number }>("SELECT count(*)::int AS n FROM plan_bayat_olayi WHERE neden = 'emir-iptal' AND uretim_emri_id = $1", [e11]));
    assert.equal(n?.n, 1);
    assert.equal((await bayatlik()).sayilar['emir-iptal'], 1);
  });

  // B-2499-12: adım canlıdaki yerinden erken bittiyse (canlıda o adımın şimdiden sonra biten satırı var) işaret; adım başına bir satır.
  test('BY-12 (B-2499-12): erken biten adım adim-bitti işaretler; yeri geçmişte bitmiş adım yazmaz; tekrar yazılmaz', async () => {
    const [a1, a2] = await isEmirleriAc([yeniAdim(), yeniAdim()]);
    const p = await taslaktaOner();
    const o = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/onaya-gonder`, { surum: p.taslak!.surum }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!;
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${o.id}/canliya-al`, { surum: o.surum, cakismalariKabul: true });
    await ileri([a1!], '1 day');
    await ileri([a2!], '-30 days');
    const e = await emriOf(a1!);
    const yansit = (isEmriId: number) => vt().tx((db) => bayatAdimBittiYansit(db, { isEmriId, uretimEmriId: e }));
    await yansit(a1!);
    await yansit(a1!);
    await yansit(a2!);
    const n = await vt().tx((db) => db.tek<{ n: number }>("SELECT count(*)::int AS n FROM plan_bayat_olayi WHERE neden = 'adim-bitti' AND uretim_emri_id = $1", [e]));
    assert.equal(n?.n, 1, 'yalnız erken biten adım, bir kez');
    const b = await bayatlik();
    assert.equal(b.sayilar['adim-bitti'], 1);
    assert.ok(b.olaylar.some((x) => x.neden === 'adim-bitti' && x.emirNo !== null));
  });

  // B-2499-12 (2520-5): gerçek bitir komutu kayıtlı dinleyiciyle adım-bitti işaretini yazar; emir sürer (ilk adım), emir-bitti yazılmaz.
  test('BY-13 (B-2499-12): emirBitir ile erken biten ilk adım kablodan adim-bitti işaretler', async () => {
    const [b1] = await isEmirleriAc([yeniAdim(), yeniAdim()]);
    const p = await taslaktaOner();
    const o = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/onaya-gonder`, { surum: p.taslak!.surum }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!;
    // Önceki testlerin canlı işleri dört saat içinde başlar; bu canlıya alma gerekçeyle geçer.
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${o.id}/canliya-al`, { surum: o.surum, cakismalariKabul: true, dortSaatGerekcesi: 'Deneme gerekcesi: test sirasi' });
    await ileri([b1!], '1 day');
    const e = await emriOf(b1!);
    await vt().tx(async (db) => {
      const k = (await kullaniciYukle(db, durum().yoneticiId))!;
      await emirBaslat(db, k, e);
      await emirBitir(db, k, e, 1);
    });
    const r = await vt().tx((db) => db.sorgu<{ neden: string; kaynak_id: number | null }>('SELECT neden, kaynak_id FROM plan_bayat_olayi WHERE uretim_emri_id = $1', [e]));
    assert.deepEqual(r.map((x) => [x.neden, x.kaynak_id]), [['adim-bitti', b1]]);
  });
});
