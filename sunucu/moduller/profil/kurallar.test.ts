import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { mesaiToplami, profilAraliklari } from './kurallar.ts';

describe('profil kuralları', () => {
  test('PRF-2/3: izin aralığı bir yıl geri ve ileri, fazla mesai yılın başından bugüne', () => {
    assert.deepEqual(profilAraliklari('2026-10-14'), {
      izinBaslangic: '2025-10-14', izinBitis: '2027-10-14', mesaiBaslangic: '2026-01-01', mesaiBitis: '2026-10-14',
    });
  });

  test('PRF-2: 29 Şubat kayınca geçerli güne düşer', () => {
    const a = profilAraliklari('2028-02-29');
    assert.equal(a.izinBaslangic, '2027-02-28');
    assert.equal(a.izinBitis, '2029-02-28');
  });

  test('PRF-4: saat girilmemiş satır toplama girmez; hiç saat yoksa null', () => {
    assert.equal(mesaiToplami([]), null);
    assert.equal(mesaiToplami([{ saat: null }]), null);
    assert.equal(mesaiToplami([{ saat: 2.5 }, { saat: null }, { saat: 1.25 }]), 3.75);
  });
});
