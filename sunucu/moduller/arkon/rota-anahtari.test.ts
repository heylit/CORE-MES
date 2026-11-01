import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { rotaAnahtari } from './kurallar.ts';

// 1476-E (1484 a): iş emri rota adımına tek katmanlı emirde emrin malzemesi, revizyonu ve op_no'su ile; çok katmanlı emirde düğümün malzemesi,
// patlatmadaki revizyonu ve kaynak_op_no ile bağlanır.
describe('arkon rotaAnahtari', () => {
  const patlatmalar = new Map([[7, new Map([['0', { revizyonId: 100 }], ['0.1', { revizyonId: 200 }]])]]);

  test('tek katmanlı iş emri: emrin malzemesi, kaynak revizyonu ve op_no; rotasızda revizyon yok', () => {
    assert.deepEqual(rotaAnahtari({ malzemeNo: 5, opNo: 20, kaynakRotaRevizyonId: 100 }, undefined, patlatmalar), { malzemeNo: 5, revizyonId: 100, opNo: 20 });
    assert.deepEqual(rotaAnahtari({ malzemeNo: 5, opNo: 20, kaynakRotaRevizyonId: null }, undefined, patlatmalar), { malzemeNo: 5, revizyonId: null, opNo: 20 });
    assert.deepEqual(rotaAnahtari({ malzemeNo: 5, opNo: 20 }, undefined, patlatmalar), { malzemeNo: 5, revizyonId: null, opNo: 20 });
  });

  test('alt düğüm adımı emrin op_no (1010) ve kök revizyonu yerine düğümün malzemesi, revizyonu ve kaynak_op_no ile eşlenir', () => {
    const ie = { malzemeNo: 5, opNo: 1010, kaynakRotaRevizyonId: 100 };
    assert.deepEqual(rotaAnahtari(ie, { dugum: '0.1', dugumMalzemeNo: 9, kaynakOpNo: 10, patlatmaId: 7 }, patlatmalar), { malzemeNo: 9, revizyonId: 200, opNo: 10 });
  });

  test('çok katmanlı emrin kök adımı kök revizyonunda kalır', () => {
    assert.deepEqual(rotaAnahtari({ malzemeNo: 5, opNo: 10, kaynakRotaRevizyonId: 100 }, { dugum: '0', dugumMalzemeNo: 5, kaynakOpNo: 10, patlatmaId: 7 }, patlatmalar),
      { malzemeNo: 5, revizyonId: 100, opNo: 10 });
  });

  test('patlatmada bulunmayan düğüm ya da patlatma: revizyon bilinmez, kök revizyonuna düşülmez', () => {
    const ie = { malzemeNo: 5, opNo: 1010, kaynakRotaRevizyonId: 100 };
    assert.deepEqual(rotaAnahtari(ie, { dugum: '0.2', dugumMalzemeNo: 9, kaynakOpNo: 10, patlatmaId: 7 }, patlatmalar), { malzemeNo: 9, revizyonId: null, opNo: 10 });
    assert.deepEqual(rotaAnahtari(ie, { dugum: '0.1', dugumMalzemeNo: 9, kaynakOpNo: 10, patlatmaId: 8 }, patlatmalar), { malzemeNo: 9, revizyonId: null, opNo: 10 });
    assert.deepEqual(rotaAnahtari(ie, { dugum: '0.1', dugumMalzemeNo: 9, kaynakOpNo: 10, patlatmaId: null }, patlatmalar), { malzemeNo: 9, revizyonId: null, opNo: 10 });
  });
});
