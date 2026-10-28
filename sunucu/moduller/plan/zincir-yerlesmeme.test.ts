import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import type { KuyrukYazCevabi, PlanCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 981 a-1: sunucu motorunun yerleştiremediği iş kuyruk yazımını durdurmaz; nedeniyle yerleşmemiş kalır, öteki işler yazılır. Öncülü
// yerleşmeyen adım da bekler (yerleşmez) ve nedeni öncülüdür.
for (const tur of ['pasif', 'kisi'] as const) {
  describe(`plan (gerçek PostgreSQL): öncülü yerleşmeyen adım (981 a-1, ${tur})`, () => {
    const { c, vt, tamam, isEmirleriAc, yeniAdim, planOku, durum } = planTestOrtami();
    test('ardıl nedeniyle yerleşmez, kuyruktaki öteki iş yazılır', async () => {
      const { makineA, makineB, operatorId } = durum();
      const [baska] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 10, birimSureDk: 1 })]);
      const [oncul, ardil] = await isEmirleriAc([
        yeniAdim({ kaynak: tur === 'pasif' ? { tur: 'makine', id: makineB } : { tur: 'kisi', id: operatorId }, ayarSuresiDk: 60, birimSureDk: 30 }),
        yeniAdim({ kaynak: { tur: 'makine', id: makineA }, ayarSuresiDk: 10, birimSureDk: 1, bilesenler: [] }),
      ]);
      if (tur === 'pasif') await vt().tx((db) => db.sorgu('UPDATE makine SET aktif = false WHERE id = $1', [makineB]));
      const p0 = await planOku();
      const is = (p: PlanCevabi, id: number) => p.yerlesmemis.find((x) => x.isEmriId === id) ?? p.yerlesimler.find((x) => x.isEmriId === id)!;
      // Yerleşemeyen ardıl kuyrukta öndedir: arkasındaki iş yine yazılır.
      const k = await tamam<KuyrukYazCevabi>(c.planlama, 'POST', '/plan/kuyruklari-yaz', {
        planSurumu: p0.surum,
        kuyruklar: [{ kaynak: { tur: 'makine', id: makineA }, baslangic: new Date().toISOString(), isler: [ardil!, baska!].map((id) => ({ emirNo: is(p0, id).emirNo, opNo: is(p0, id).opNo, dondurulmus: false, elle: false })) }],
      });
      const once = `${is(p0, oncul!).emirNo} OP ${String(is(p0, oncul!).opNo)}`;
      assert.equal(k.yazilan, 1);
      assert.deepEqual(k.yerlesmeyen, [{ emirNo: is(p0, ardil!).emirNo, opNo: is(p0, ardil!).opNo, neden: `Önceki adım (${once}) yerleşmedi.` }]);
      const p = await planOku(k.taslak);
      assert.ok(p.yerlesimler.some((y) => y.isEmriId === baska));
      assert.equal(p.yerlesmemis.find((y) => y.isEmriId === ardil)?.neden, `Önceki adım (OP ${String(is(p0, oncul!).opNo)}) yerleşmedi.`);
      if (tur === 'pasif') assert.equal(p.yerlesmemis.find((y) => y.isEmriId === oncul)?.neden, 'Makinesi kullanımda değil.');
      assert.ok(p.uyarilar.some((u) => u.includes(`OP ${String(is(p0, ardil!).opNo)}: yerleşmedi; önceki adım`)));
    });
  });
}
