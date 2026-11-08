import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from '../plan-ortak.test.ts';

// 2319d (Birleştirici kapısı): "iş emirleri değişti" dinleyicisi sunucu/kablolama.ts'teki bağla kurulur. Olayı uretim-emirleri'nin
// gerçek komutu (HTTP üretim yeri değişikliği) verir; işaret yalnız bağ kuruluysa yazılır. Bağ kopukken test kırmızıdır. Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): adım değişti bağı kablolamadan', () => {
  const { c, vt, tamam, yeniAdim, isEmirleriAc, taslaktaOner } = planTestOrtami();
  const isEmri = (id: number) => vt().tx((db) => db.tek<{ emir: number; op: number }>(
    'SELECT uretim_emri_id AS emir, op_no AS op FROM uretim_emirleri_is_emri WHERE id = $1', [id]));
  const say = (emirId: number) => vt().tx((db) => db.tek<{ n: number }>(
    "SELECT count(*)::int AS n FROM plan_bayat_olayi WHERE neden = 'rota-degisti' AND uretim_emri_id = $1", [emirId]));
  const surum = async (emirId: number) => (await tamam<{ emir: { surum: number } }>(c.yonetici, 'GET', `/adimli-emirler/${emirId}`)).emir.surum;

  test('BK-K3: gerçek üretim yeri komutu canlıdaki emrin adımını fasona alınca rota-degisti işaretler', async () => {
    const firma = (await tamam<{ firma: { id: number } }>(c.yonetici, 'POST', '/musteri-tedarikci/firmalar/ekle', { ad: 'Deneme fasoncu 2319d', tur: 'tedarikci', fason: true })).firma.id;
    const [, i2] = await isEmirleriAc([yeniAdim(), yeniAdim()]);
    const p = await taslaktaOner();
    const o = (await tamam<SenaryolarCevabi>(c.planlama, 'POST', `/plan/senaryolar/${p.taslak!.id}/onaya-gonder`, { surum: p.taslak!.surum }))
      .senaryolar.find((x) => x.id === p.taslak!.id)!;
    await tamam(c.mudur, 'POST', `/plan/senaryolar/${o.id}/canliya-al`, { surum: o.surum, cakismalariKabul: true });
    const a = (await isEmri(i2!))!;
    assert.equal((await say(a.emir))?.n, 0);
    await tamam(c.yonetici, 'POST', `/adimli-emirler/${a.emir}/uretim-yeri`, { opNo: a.op, yer: 'fason', firmaId: firma, terminGun: 3, surum: await surum(a.emir) });
    assert.equal((await say(a.emir))?.n, 1);
  });
});
