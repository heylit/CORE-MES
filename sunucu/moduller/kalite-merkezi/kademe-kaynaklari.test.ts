import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { acikDofTerminleri, kararBekleyenUygunsuzluklar } from './kurallar.ts';

// 3478: kademeli uyarıya giren kalite kayıtları.
describe('3478 kalite kademe kaynakları', () => {
  test('açık DÖF termini: kapanmış, arşivdeki ve terminsiz DÖF girmez; numara yoksa kimlik', () => {
    const l = acikDofTerminleri([
      { kimlik: 'capa_1', govde: { no: 'ORN-DOF-1', durum: 'Açık', termin: '2030-01-20' } },
      { kimlik: 'capa_2', govde: { no: 'ORN-DOF-2', durum: 'Kapalı', termin: '2030-01-20' } },
      { kimlik: 'capa_3', govde: { no: 'ORN-DOF-3', durum: 'Açık', termin: '2030-01-20', arsiv: true } },
      { kimlik: 'capa_4', govde: { no: 'ORN-DOF-4', durum: 'Açık', termin: '' } },
      { kimlik: 'capa_5', govde: { durum: 'Açık', termin: '2030-02-01T00:00' } },
    ]);
    assert.deepEqual(l, [
      { kimlik: 'capa_1', no: 'ORN-DOF-1', termin: '2030-01-20' },
      { kimlik: 'capa_5', no: 'capa_5', termin: '2030-02-01' },
    ]);
  });

  test('karar bekleyen uygunsuzluk: MRB kararı boş ya da "Karar bekliyor"; kararlı, kapalı ve tarihsiz kayıt girmez', () => {
    const l = kararBekleyenUygunsuzluklar([
      { kimlik: 'ncr_1', govde: { no: 'ORN-NCR-1', durum: 'Açık', tarih: '2030-01-10' } },
      { kimlik: 'ncr_2', govde: { no: 'ORN-NCR-2', durum: 'MRB değerlendirmesinde', mrb: 'Karar bekliyor', tarih: '2030-01-11' } },
      { kimlik: 'ncr_3', govde: { no: 'ORN-NCR-3', durum: 'Açık', mrb: 'Tamir', tarih: '2030-01-12' } },
      { kimlik: 'ncr_4', govde: { no: 'ORN-NCR-4', durum: 'Kapalı', tarih: '2030-01-13' } },
      { kimlik: 'ncr_5', govde: { no: 'ORN-NCR-5', durum: 'Açık' } },
    ]);
    assert.deepEqual(l.map((k) => [k.kimlik, k.tarih]), [['ncr_1', '2030-01-10'], ['ncr_2', '2030-01-11']]);
  });
});
