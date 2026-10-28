import { before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { UygulamaHatasi } from '#cekirdek/hata.ts';
import type { TestVeritabani } from '#cekirdek/test-vt.ts';
import { kullaniciYukle } from '../kisiler/disari.ts';
import { emirBaslat } from '../uretim-emirleri/disari.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// 987 a: planlı bitişi geçmiş ama başlamamış iş makinesini korumayı sürdürür (393 d ayrımı); iş başlayınca ya da plan onu yeniden
// yerleştirince ayrım düşer. Yalnız o makine etkilenir.
describe('plan (gerçek PostgreSQL): gecikmiş işin makine ayrımı (987 a)', () => {
  const { c, vt, tamam, yeniAdim, isEmirleriAc, isEmriDurumu, durum } = planTestOrtami();
  let ortam: TestVeritabani | undefined;
  let istasyonB = 0, operatorId = 0, yoneticiId = 0, sayac = 0;
  before(async () => {
    ({ ortam, istasyonB, operatorId, yoneticiId } = durum());
    await ortam!.sahip.sorgu('INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [operatorId, istasyonB]);
  });
  const makineAc = async () => (await tamam<{ id: number }>(c.yonetici, 'POST', '/makineler', { kod: `PL-GA${(sayac += 1)}`, ad: 'Deneme gecikme ayrımı', istasyonId: istasyonB })).id;
  const emriOf = async (isEmriId: number) =>
    (await vt().tx((db) => db.tek<{ u: number }>('SELECT uretim_emri_id AS u FROM uretim_emirleri_is_emri WHERE id = $1', [isEmriId])))!.u;
  const canliyaYaz = (isEmriId: number, makineId: number, basDk: number, bitDk: number) => ortam!.sahip.sorgu(
    `INSERT INTO plan_yerlesimi (is_emri_id, makine_id, kisi_id, baslangic, bitis, yazan_kisi_id)
     VALUES ($1, $2, NULL, now() + make_interval(mins => $3), now() + make_interval(mins => $4), $5)
     ON CONFLICT (is_emri_id) DO UPDATE SET makine_id = EXCLUDED.makine_id, kisi_id = NULL, baslangic = EXCLUDED.baslangic, bitis = EXCLUDED.bitis`,
    [isEmriId, makineId, basDk, bitDk, yoneticiId]);
  const baslat = async (isEmriId: number, makineIdleri: number[]) => {
    const emirId = await emriOf(isEmriId);
    try {
      await vt().tx(async (db) => emirBaslat(db, (await kullaniciYukle(db, operatorId))!, emirId, makineIdleri));
      return 200;
    } catch (h) {
      if (h instanceof UygulamaHatasi) return h.durum;
      throw h;
    }
  };

  test('bitişi geçmiş bekleyen iş ayrımı tutar; plan onu ileri alınca ya da iş başlayınca düşer; başka makine etkilenmez', async () => {
    const planlanan = await makineAc(), gecikmis = await makineAc(), baska = await makineAc();
    const [j1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: gecikmis } })]);
    await canliyaYaz(j1!, gecikmis, -180, -60);
    const [i1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: planlanan } })]);
    assert.equal(await baslat(i1!, [gecikmis]), 409, 'gecikmiş iş makinesini korur');
    const [i2] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: planlanan } })]);
    assert.equal(await baslat(i2!, [baska]), 200, 'yalnız o makine');
    // Plan işi 4 saatin ötesine yerleştirdi: ayrım düşer.
    await canliyaYaz(j1!, gecikmis, 5 * 60, 6 * 60);
    const [i3] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: planlanan } })]);
    assert.equal(await baslat(i3!, [gecikmis]), 200, 'yeniden yerleşen iş ayrım değil');
    // İş başlamışsa yeri geçmişte olsa da ayrım değildir.
    const ucuncu = await makineAc();
    const [k1] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: ucuncu } })]);
    await canliyaYaz(k1!, ucuncu, -180, -60);
    await isEmriDurumu(k1!, 'calisiyor');
    try {
      const [i4] = await isEmirleriAc([yeniAdim({ kaynak: { tur: 'makine', id: planlanan } })]);
      assert.equal(await baslat(i4!, [ucuncu]), 200, 'başlamış iş ayrım değil');
    } finally {
      await isEmriDurumu(k1!, 'bekliyor');
    }
  });
});
