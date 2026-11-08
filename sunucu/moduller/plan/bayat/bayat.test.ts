import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { bayatEmirBittiYansit, planBayatligi } from '../disari.ts';
import { kullaniciYukle } from '../../kisiler/disari.ts';
import { emirBaslat, emirBitir } from '../../uretim-emirleri/disari.ts';
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
    const say = (emirId: number) => vt().tx((db) => db.tek<{ n: number }>('SELECT count(*)::int AS n FROM plan_bayat_olayi WHERE uretim_emri_id = $1', [emirId]));
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
});
