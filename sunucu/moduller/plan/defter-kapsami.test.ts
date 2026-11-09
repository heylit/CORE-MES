import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { PlanCevabi, SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { kullaniciYukle } from '../kisiler/disari.ts';
import { emirBaslat } from '../uretim-emirleri/disari.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/zaman.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

const GUN = 24 * 60 * 60 * 1000;
const SAAT = 60 * 60 * 1000;

// B-2483-1 (2482 ön bakış): canlı değişti kabulünde taslaktan yalnız değişiklik defterindeki işler canlıya geçer. Bu yüzden taslağın
// yerleşimini değiştiren her yazım, o işi defter satırına yazmalıdır. Her komutta taslak satırı değişen her iş
// komutun kendi defter satırında aranır. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): taslağın her yerleşim değişikliği defterde', () => {
  const { c, vt, tamam, istek, yeniAdim, isEmirleriAc, taslaktaOner, planOku, yer, tg, durum } = planTestOrtami();
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
  async function kapsar(taslak: number, adim: string, gereken: readonly number[] = []): Promise<void> {
    const simdi = await satirlar(taslak);
    const degisen = [...new Set([...once.keys(), ...simdi.keys()])].filter((x) => once.get(x) !== simdi.get(x));
    // Hiçbir satırı değiştirmeyen adım bir şey kanıtlamaz.
    assert.ok(degisen.length > 0, `${adim}: taslakta değişen iş yok`);
    const d = await defter(taslak, sonDefter);
    assert.deepEqual(degisen.filter((x) => !d.isler.has(x)), [], `${adim}: taslakta değişen ama komutun defter satırında olmayan iş`);
    for (const x of gereken) assert.ok(degisen.includes(x), `${adim}: ${String(x)} taslakta değişmedi (senaryo kurulmadı)`);
    once = simdi;
    sonDefter = d.son;
  }
  const canliSatirlari = () => vt().tx(async (db) => new Map((await db.sorgu<{ id: number; v: string }>(
    `SELECT is_emri_id AS id, concat_ws('|', makine_id, kisi_id, baslangic, bitis, kilitli, dondurulmus, elle_sira) AS v FROM plan_yerlesimi WHERE is_emri_id > 0`))
    .map((r) => [r.id, r.v])));

  test('taşı, kilitle, dondur, sırala, elle sırayı sil, plan sırasına dön, kuyruk yaz, kaldır', async () => {
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

    p = await planOku(id);
    const kaldirilacak = [a, b, d, e].find((x) => { const y = p.yerlesimler.find((v) => v.isEmriId === x); return y && !y.kilitli && !y.dondurulmus; })!;
    p = await tamam<PlanCevabi>(c.planlama, 'POST', `/plan/is-emirleri/${String(kaldirilacak)}/kaldir`, { taslak: tg(p) });
    await kapsar(id, 'kaldır');
    assert.ok(yer(await planOku(), kaldirilacak), 'kaldırma canlıyı değiştirmez');
  });

  // 168 b: sunucu motoru vardiyası tanımsız tezgâhtaki işi yerleştirmez; kuyruk yazımı o işin taslaktaki eski yerini siler. Silinen iş de
  // defterdedir (0002), yoksa canlı değişti kabulünde canlıda kalırdı.
  test('kuyruk yaz (sunucu motoru): yerleşmeyen işin silinen yeri defterde', async () => {
    const merkez = await tamam<{ id: number }>(c.yonetici, 'POST', '/is-merkezleri', { kod: 'DK-IM', ad: 'Defter vardiyasiz merkez', aciklama: null });
    const istasyonId = (await tamam<{ id: number }>(c.yonetici, 'POST', '/istasyonlar', { kod: 'DK-A', ad: 'Defter vardiyasiz istasyon', isMerkeziId: merkez.id })).id;
    const makine = (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: 'DK-MA', ad: 'Defter vardiyasiz makine', istasyonId })).id;
    const [x] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makine } })]);
    // Canlıda eski bir yeri var (vardiya sonradan kaldırılmış gibi).
    const bas = ileri(6, 10);
    await vt().tx((db) => db.sorgu(
      `INSERT INTO plan_yerlesimi (is_emri_id, makine_id, kisi_id, baslangic, bitis, kilitli, dondurulmus, elle_sira, elle_istasyon_id, elle_kaynak, yazan_kisi_id)
       VALUES ($1, $2, NULL, $3, $3::timestamptz + interval '50 minutes', false, false, NULL, NULL, false, $4)`, [x, makine, bas, durum().yoneticiId]));
    once = await canliSatirlari();
    sonDefter = 0;
    const canli = await planOku();
    const y = yer(canli, x!);
    const k = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      planSurumu: canli.surum,
      kuyruklar: [{ kaynak: { tur: 'makine', id: makine }, baslangic: bas.toISOString(), isler: [{ emirNo: y.emirNo, opNo: y.opNo, dondurulmus: false, elle: true }] }],
    });
    await kapsar(k.taslak, 'kuyruk yaz (yerleşmeyen)', [x!]);
    await tamam(c.planlama, 'POST', `/plan/senaryolar/${String(k.taslak)}/vazgec`, { surum: (await planOku(k.taslak)).taslak!.surum });
  });

  // 984 a: canlıya alırken "çalışan işi sabitle" taslakta çalışan işi şimdiye koyar ve makinesinin kuyruğunu yeniden dizer; ikisi de defterde.
  test('canlıya alırken başlayan işi sabitle: sabitlenen ve yeniden dizilen işler defterde', async () => {
    const { makineA, istasyonA, operatorId } = durum();
    const [e1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 30, birimSureDk: 30 })]);
    const [e2] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 30, birimSureDk: 30 })]);
    const canliyaAl = async (taslak: number, ek: Record<string, unknown> = {}) => {
      const t = (await planOku(taslak)).taslak!;
      const s = (await tamam<SenaryolarCevabi>(c.planlama, 'GET', '/plan/senaryolar')).senaryolar.find((v) => v.id === t.id)!;
      const surum = s.durum === 'onayda' ? s.surum
        : (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${String(t.id)}/onaya-gonder`, { surum: t.surum })).senaryolar.find((v) => v.id === t.id)!.surum;
      return istek(c.mudur, 'POST', `/plan/senaryolar/${String(t.id)}/canliya-al`, { surum, cakismalariKabul: true, dortSaatGerekcesi: 'Deneme: yakın iş taşındı.', ...ek });
    };
    const ilk = await taslaktaOner();
    assert.equal((await canliyaAl(ilk.taslak!.id)).statusCode, 200);
    await vt().tx((db) => db.sorgu("UPDATE plan_yerlesimi SET baslangic = baslangic + interval '1 day', bitis = bitis + interval '1 day' WHERE is_emri_id = ANY($1::int[])", [[e1, e2]]));
    const p0 = await planOku();
    const k = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      planSurumu: p0.surum,
      kuyruklar: [{ kaynak: { tur: 'makine', id: makineA }, baslangic: new Date().toISOString(), isler: [e2!, e1!].map((v) => ({ emirNo: yer(p0, v).emirNo, opNo: yer(p0, v).opNo, dondurulmus: false, elle: true })) }],
    });
    await vt().tx((db) => db.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [operatorId, istasyonA]));
    const op = (await vt().tx((db) => kullaniciYukle(db, operatorId)))!;
    const emir1 = (await vt().tx((db) => db.tek<{ u: number }>('SELECT uretim_emri_id AS u FROM uretim_emirleri_is_emri WHERE id = $1', [e1])))!.u;
    await vt().tx((db) => emirBaslat(db, op, emir1));
    once = await satirlar(k.taslak);
    sonDefter = (await defter(k.taslak, 0)).son;
    const r = await canliyaAl(k.taslak, { baslayanlar: 'sabitle' });
    assert.equal(r.statusCode, 200, r.body);
    await kapsar(k.taslak, 'başlayanı sabitle', [e1!]);
  });
});
