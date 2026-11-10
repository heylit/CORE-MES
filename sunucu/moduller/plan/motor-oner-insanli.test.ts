import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import type { MotorYerlesimiCevabi } from '#paylasilan/sozlesme/plan.ts';
import { planTestOrtami } from './plan-ortak.test.ts';

// B-2482-33 (2696): insanlı istasyondaki makine seçili adım (2685 öncesi kayıtta seçim kalabilir). Veriler uydurmadır.
describe('plan (gerçek PostgreSQL): insanlı istasyonda makineli adım (2696, B-2482-33)', () => {
  const o = planTestOrtami();
  let sayac = 0;
  async function insanliIstasyon(yetkin: boolean, vardiyali: boolean): Promise<{ istasyon: number; makine: number }> {
    const { merkezId } = o.durum();
    sayac += 1;
    const istasyon = (await o.tamam<{ id: number }>(o.c.yonetici, 'POST', '/istasyonlar', { kod: `RT-IN${String(sayac)}`, ad: `Deneme insanli ${String(sayac)}`, isMerkeziId: merkezId })).id;
    const makine = (await o.tamam<{ id: number }>(o.c.yonetici, 'POST', '/makineler', { kod: `RT-IM${String(sayac)}`, ad: `Deneme insanli makine ${String(sayac)}`, istasyonId: istasyon })).id;
    const sahip = o.durum().ortam!.sahip;
    await sahip.sorgu("UPDATE istasyon SET kapasite_kaynagi = 'insan' WHERE id = $1", [istasyon]);
    if (yetkin) await sahip.sorgu("INSERT INTO istasyonlar_yetkinlik (kisi_id, istasyon_id) SELECT id, $1 FROM kisi WHERE ad = 'Deneme operator'", [istasyon]);
    if (vardiyali) {
      await sahip.sorgu(`INSERT INTO vardiya_kisi (kisi_id, vardiya_id) SELECT k.id, (SELECT min(vardiya_id) FROM vardiya_matrisi WHERE is_merkezi_id = $1)
        FROM kisi k WHERE k.ad = 'Deneme operator' ON CONFLICT (kisi_id) DO UPDATE SET vardiya_id = EXCLUDED.vardiya_id`, [merkezId]);
    } else {
      await sahip.sorgu("DELETE FROM vardiya_kisi WHERE kisi_id IN (SELECT id FROM kisi WHERE ad = 'Deneme operator')");
    }
    return { istasyon, makine };
  }
  const yerlesim = () => o.tamam<MotorYerlesimiCevabi>(o.c.planlama, 'GET', '/plan/motor-yerlesimi');
  const nedeni = (m: MotorYerlesimiCevabi, id: number) => m.yerlesmeyen.find((y) => y.isEmriId === id)?.neden;

  test('MI-01: makine seçili adım insanlı istasyonda, yetkin kişi vardiyasız: istasyon adımının iletisi; motorun genel iletisi değil', async () => {
    const { makine } = await insanliIstasyon(true, false);
    const [is] = await o.isEmirleriAc([o.yeniAdim({ kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: 0, birimSureDk: 2 })]);
    const m = await yerlesim();
    assert.equal(m.yerlesimler.some((y) => y.isEmriId === is), false);
    assert.equal(nedeni(m, is!), 'İnsanlı istasyonda yetkin kişilerin hiçbirinin vardiyası tanımlı değil.', JSON.stringify(m.yerlesmeyen));
  });
  test('MI-02: makine seçili adım insanlı istasyonda, yetkin kişi yok: adaysız iletisi', async () => {
    const { makine } = await insanliIstasyon(false, false);
    const [is] = await o.isEmirleriAc([o.yeniAdim({ kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: 0, birimSureDk: 2 })]);
    const m = await yerlesim();
    assert.match(nedeni(m, is!) ?? '', /kullanılabilir makinesi ya da kişisi yok/, JSON.stringify(m.yerlesmeyen));
  });
  test('MI-03: makine seçili adım insanlı istasyonda, yetkin kişi vardiyalı: yerleşir', async () => {
    const { makine } = await insanliIstasyon(true, true);
    const [is] = await o.isEmirleriAc([o.yeniAdim({ kaynak: { tur: 'makine', id: makine }, ayarSuresiDk: 0, birimSureDk: 2 })]);
    const m = await yerlesim();
    assert.ok(m.yerlesimler.some((y) => y.isEmriId === is), JSON.stringify({ yerlesmeyen: m.yerlesmeyen.filter((y) => y.isEmriId === is) }));
  });
});
