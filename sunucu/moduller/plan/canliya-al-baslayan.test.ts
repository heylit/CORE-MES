import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { SONRADAN_BASLAYAN, type PlanCevabi, type SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { kullaniciYukle } from '../kisiler/disari.ts';
import { emirBaslat } from '../uretim-emirleri/disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 984 a: taslak açıkken terminalde başlayan işle taslakta aynı makinede çakışan iş varsa canlıya alma uyarır (409, ayrıntıda işler). Planlamacı
// isterse çalışan iş şimdiye sabitlenir, kalan işler onun kalanından sonra yeniden dizilir ve plan canlıya alınır.
describe('plan (gerçek PostgreSQL): taslaktan sonra başlayan iş canlıya almada (984 a)', () => {
  const { c, vt, istek, tamam, isEmirleriAc, yeniAdim, taslaktaOner, planOku, yer, durum } = planTestOrtami();
  const canliyaAl = async (p: PlanCevabi, ek: Record<string, unknown> = {}) => {
    const t = p.taslak!;
    const s = (await tamam<SenaryolarCevabi>(c.planlama, 'GET', '/plan/senaryolar')).senaryolar.find((x) => x.id === t.id)!;
    const surum = s.durum === 'onayda' ? s.surum
      : (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${t.id}/onaya-gonder`, { surum: t.surum })).senaryolar.find((x) => x.id === t.id)!.surum;
    return istek(c.mudur, 'POST', `/plan/senaryolar/${t.id}/canliya-al`, { surum, cakismalariKabul: true, ...ek });
  };

  test('uyarı 409; sabitle ile çalışan iş şimdide kalır, öteki iş onun kalanından sonra dizilir', async () => {
    const { makineA, istasyonA, operatorId } = durum();
    const [e1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 30, birimSureDk: 30 })]);
    const [e2] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 30, birimSureDk: 30 })]);
    const ilk = await canliyaAl(await taslaktaOner());
    assert.equal(ilk.statusCode, 200, ilk.body);
    // 248 a: önüne iş konan canlı iş 4 saatten ileride olmalı.
    await vt().tx((db) => db.sorgu("UPDATE plan_yerlesimi SET baslangic = baslangic + interval '1 day', bitis = bitis + interval '1 day' WHERE is_emri_id = ANY($1::int[])", [[e1, e2]]));
    // Yeni taslakta e2 öne alınır; taslak canlıya alınmadan operatör canlı plana göre e1'i başlatır.
    const p0 = await planOku();
    const k = await tamam<{ taslak: number }>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
      planSurumu: p0.surum,
      kuyruklar: [{ kaynak: { tur: 'makine', id: makineA }, baslangic: new Date().toISOString(), isler: [e2!, e1!].map((id) => ({ emirNo: yer(p0, id).emirNo, opNo: yer(p0, id).opNo, dondurulmus: false, elle: true })) }],
    });
    await vt().tx((db) => db.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [operatorId, istasyonA]));
    const op = (await vt().tx((db) => kullaniciYukle(db, operatorId)))!;
    const emir1 = (await vt().tx((db) => db.tek<{ u: number }>('SELECT uretim_emri_id AS u FROM uretim_emirleri_is_emri WHERE id = $1', [e1])))!.u;
    await vt().tx((db) => emirBaslat(db, op, emir1));

    const t = await planOku(k.taslak);
    const red = await canliyaAl(t);
    assert.equal(red.statusCode, 409, red.body);
    const g = red.json<{ ayrinti: { neden: string; isler: { emirNo: string; opNo: number }[] } }>();
    assert.deepEqual(g.ayrinti, { neden: SONRADAN_BASLAYAN, isler: [{ emirNo: yer(p0, e1!).emirNo, opNo: yer(p0, e1!).opNo }] });

    const tamamCevap = await canliyaAl(await planOku(k.taslak), { baslayanlar: 'sabitle' });
    assert.equal(tamamCevap.statusCode, 200, tamamCevap.body);
    const sonra = await planOku();
    const y1 = yer(sonra, e1!), y2 = yer(sonra, e2!);
    assert.equal(y1.durum, 'basladi');
    assert.ok(Date.parse(y1.baslangic) <= Date.now(), `çalışan iş şimdide: ${y1.baslangic}`);
    // e1'in kalanı ayar 30 + 10 x 30 dk: e2 ondan önce başlamaz.
    assert.ok(Date.parse(y2.baslangic) >= Date.now() + 5 * 3600_000, `e1 ${y1.baslangic}-${y1.bitis}, e2 ${y2.baslangic}`);
    assert.ok(Date.parse(y2.baslangic) >= Date.parse(y1.bitis) - 60_000, `e1 ${y1.baslangic}-${y1.bitis}, e2 ${y2.baslangic}`);
  });
});
