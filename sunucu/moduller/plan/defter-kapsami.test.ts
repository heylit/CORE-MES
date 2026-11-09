import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/zaman.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

const GUN = 24 * 60 * 60 * 1000;
const SAAT = 60 * 60 * 1000;

// B-2483-1 (2482 ön bakış): canlı değişti kabulünde taslaktan yalnız değişiklik defterindeki işler canlıya geçer. Bu yüzden taslağın
// yerleşimini değiştiren her yazım, o işi defter satırına yazmalıdır. Her komutta taslak satırı değişen her iş
// komutun kendi defter satırında aranır. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): taslağın her yerleşim değişikliği defterde', () => {
  const { c, vt, tamam, yeniAdim, isEmirleriAc, taslaktaOner, planOku, yer, tg, durum } = planTestOrtami();
  const ileri = (gun: number, saat: number) => new Date(tesisGunBasi(tesisGunu(Date.now())) + gun * GUN + saat * SAAT);

  // Taslağın yerleşim satırları (iş -> değerler) ve defterin son satırı: her komutun değiştirdiği işler o komutun defter satırlarında olmalı.
  const satirlar = (taslak: number) => vt().tx(async (db) => new Map((await db.sorgu<{ id: number; v: string }>(
    `SELECT is_emri_id AS id, concat_ws('|', makine_id, kisi_id, baslangic, bitis, kilitli, dondurulmus, elle_sira) AS v
       FROM plan_senaryo_yerlesimi WHERE senaryo_id = $1 AND is_emri_id > 0`, [taslak])).map((r) => [r.id, r.v])));
  const defter = (taslak: number, sonrasi: number) => vt().tx(async (db) => {
    const r = await db.sorgu<{ id: number; isler: number[] }>(
      'SELECT id, is_emri_idleri AS isler FROM plan_senaryo_degisikligi WHERE senaryo_id = $1 AND id > $2 AND kaldirma IS NULL', [taslak, sonrasi]);
    return { son: Math.max(sonrasi, ...r.map((x) => x.id)), isler: new Set(r.flatMap((x) => x.isler)) };
  });
  let once = new Map<number, string>();
  let sonDefter = 0;
  // Komuttan önceki ve sonraki taslak satırları karşılaştırılır; ilk komutta önceki hâl canlı plandır (taslak onun kopyasıdır).
  async function kapsar(taslak: number, adim: string): Promise<void> {
    const simdi = await satirlar(taslak);
    const degisen = [...new Set([...once.keys(), ...simdi.keys()])].filter((x) => once.get(x) !== simdi.get(x));
    const d = await defter(taslak, sonDefter);
    assert.deepEqual(degisen.filter((x) => !d.isler.has(x)), [], `${adim}: taslakta değişen ama komutun defter satırında olmayan iş`);
    once = simdi;
    sonDefter = d.son;
  }
  const canliSatirlari = () => vt().tx(async (db) => new Map((await db.sorgu<{ id: number; v: string }>(
    `SELECT is_emri_id AS id, concat_ws('|', makine_id, kisi_id, baslangic, bitis, kilitli, dondurulmus, elle_sira) AS v FROM plan_yerlesimi WHERE is_emri_id > 0`))
    .map((r) => [r.id, r.v])));

  test('taşı, kilitle, dondur, sırala, elle sırayı sil, plan sırasına dön, kuyruk yaz, hızlı dene, kaldır', async () => {
    const { makineA } = durum();
    const isler = [];
    for (let i = 0; i < 4; i++) isler.push((await isEmirleriAc([yeniAdim()]))[0]!);
    const [a, b, d, e] = isler as [number, number, number, number];
    // Canlı plan: dört iş makine A'da.
    const ilk = await taslaktaOner();
    const s = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${String(ilk.taslak!.id)}/onaya-gonder`, { surum: ilk.taslak!.surum }))
      .senaryolar.find((x) => x.id === ilk.taslak!.id)!;
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${String(s.id)}/canliya-al`, { surum: s.surum, dortSaatGerekcesi: 'Deneme: yakın iş taşındı.' });

    once = await canliSatirlari();
    let p = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/is-emirleri/${String(a)}/tasi`,
      { taslak: null, kaynak: { tur: 'makine', id: makineA }, baslangic: ileri(3, 10).toISOString(), planSurumu: (await planOku()).surum });
    const id = p.taslak!.id;
    await kapsar(id, 'taşı');

    p = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/is-emirleri/${String(b)}/kilitle`, { taslak: tg(p) });
    await kapsar(id, 'kilitle');
    p = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/is-emirleri/${String(b)}/kilidi-ac`, { taslak: tg(p) });
    await kapsar(id, 'kilidi aç');

    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/dondur', { taslak: tg(p) });
    await kapsar(id, 'dondur');
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/dondurmayi-kaldir', { taslak: tg(p) });
    await kapsar(id, 'dondurmayı kaldır');

    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(p), kaynak: { tur: 'makine', id: makineA }, isEmriIdleri: [e, d] });
    await kapsar(id, 'sırala');
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/kuyruk/plan-sirasina-don', { taslak: tg(p), kaynak: { tur: 'makine', id: makineA } });
    await kapsar(id, 'plan sırasına dön');
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/kuyruk/sirala', { taslak: tg(p), kaynak: { tur: 'makine', id: makineA }, isEmriIdleri: [d, e] });
    await kapsar(id, 'yeniden sırala');
    p = await tamam<PlanCevabi>(c.planlama, 'POST', '/plan/elle-siralari-sil', { taslak: tg(p) });
    await kapsar(id, 'elle sıraları sil');

    // Planlama sayfasının "Planı kur"u ve çalışmadan taslak yazımı aynı kuyruk yazımıdır (sunucu motoru).
    p = await taslaktaOner(c.planlama, id);
    await kapsar(id, 'kuyruk yaz (sunucu motoru)');

    await tamam(c.planlama, 'POST', `/plan/senaryolar/${String(id)}/hizli`, { tur: 'gun', surum: p.taslak!.surum });
    await kapsar(id, 'hızlı dene');

    p = await planOku(id);
    const kaldirilacak = [a, b, d, e].find((x) => { const y = p.yerlesimler.find((v) => v.isEmriId === x); return y && !y.kilitli && !y.dondurulmus; })!;
    p = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/is-emirleri/${String(kaldirilacak)}/kaldir`, { taslak: tg(p) });
    await kapsar(id, 'kaldır');
    assert.ok(yer(await planOku(), kaldirilacak), 'kaldırma canlıyı değiştirmez');
  });
});
