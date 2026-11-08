import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { bakimAraliklariOku } from '../disari.ts';
import { planTestOrtami } from '../plan-ortak.test.ts';

// 2319 (2311 S10): Arkon'un periyodik bakım belgesi kablolama bağıyla plan girdisinin bakım aralığına döner (gerçek PostgreSQL). Uydurma veri.
describe('plan (gerçek PostgreSQL): Arkon periyodik bakımı plan girdisine', () => {
  const { vt, durum } = planTestOrtami();

  test('BV-01: makine koduyla eşleşen plan aralık verir; bilinmeyen makine atlanır', async () => {
    const { makineA, yoneticiId } = durum();
    const kod = (await vt().tx((db) => db.tek<{ kod: string }>('SELECT kod FROM makine WHERE id = $1', [makineA])))!.kod;
    await vt().tx(async (db) => {
      for (const [kimlik, mc] of [['pl-bv-1', kod], ['pl-bv-2', 'YOK-MAKINE']] as const) {
        await db.sorgu(`INSERT INTO arkon_belge (depo, kimlik, govde, surum, degistiren_id) VALUES ('maint', $1, $2, 1, $3)`,
          [kimlik, JSON.stringify({ id: kimlik, type: 'plan', mc, title: 'Yağ', everyDays: 7, durMin: 30, lastAt: Date.now() - 10 * 86_400_000 }), yoneticiId]);
      }
    });
    const l = await vt().tx((db) => bakimAraliklariOku(db));
    assert.ok(l !== null && l.length > 0, JSON.stringify(l));
    assert.ok(l.every((b) => b.m === String(makineA) && b.anahtar.startsWith('pl-bv-1|')));
    // Vadesi geçmiş: ilk aralık bugündür (sonraki günler makinenin takviminde çalışma varsa gelir).
    assert.equal(l[0]!.anahtar, `pl-bv-1|${tesisGunu(Date.now())}`);
  });
});
