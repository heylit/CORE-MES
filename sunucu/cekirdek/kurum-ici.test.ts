import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { kurumIciMi } from './kurum-ici.ts';

describe('kurum içi adres (ADR 0011, 0013)', () => {
  test('özel ve yerel IPv4, yerel IPv6 ve tek parçalı ad kurum içidir', () => {
    for (const host of ['10.0.0.5', '172.16.0.1', '172.31.255.1', '192.168.1.10', '127.0.0.1', 'localhost', 'LOCALHOST', 'logosrv', 'logo-kopru',
      '[::1]', '[fd12::1]', '[fc00::1]', '[fe80::1]']) {
      assert.equal(kurumIciMi(host), true, host);
    }
  });

  test('internete çıkan adres ve alan adı kurum içi değildir', () => {
    for (const host of ['8.8.8.8', '172.15.0.1', '172.32.0.1', '11.0.0.1', '192.169.0.1', 'logo.example.com', 'api.logo.com.tr', '[2001:db8::1]',
      '-kopru', 'kopru-', '']) {
      assert.equal(kurumIciMi(host), false, host);
    }
  });
});
