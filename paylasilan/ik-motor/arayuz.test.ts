import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { IK_BICIMI, IK_SABITLERI, MOTOR_ISLEVLERI, motorKur } from './arayuz.ts';

// Ekran ve sunucu motoru bu yüzden alır (211 a); tipli yüzün adları motorun gerçekten verdiği işlevlerdir.
describe('İK motoru: tipli yüz', () => {
  const motor = motorKur([{ id: 'emp_a', kind: 'emp', ad: 'A', soyad: 'B', iseGiris: '2020-01-06', brutMaas: 50000 }], null);

  test('adı geçen her işlev motorda var', () => {
    for (const ad of [...MOTOR_ISLEVLERI, 'payroll', 'leaveBalance', 'periods', 'fullName', 'activeEmps']) {
      assert.equal(typeof (motor as unknown as Record<string, unknown>)[ad], 'function', ad);
    }
  });

  test('bordro ve ad hesaplanır; sabitler ve biçim aynı kaynaktan', () => {
    assert.equal(motor.fullName(motor.activeEmps()[0]), 'A B');
    assert.ok((motor.payroll(motor.activeEmps()[0] ?? {}, '2026-05')?.net ?? 0) > 0);
    assert.ok(IK_SABITLERI.LEAVE_TYPES.includes('Yıllık izin'));
    assert.equal(IK_BICIMI.validTCKN('00000000000'), false);
  });
});
