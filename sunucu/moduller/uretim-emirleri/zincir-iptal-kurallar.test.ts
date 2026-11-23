import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { ADIMLI_IPTAL_DURUMU, zincirIptalIhlali, zincirListesiAyni } from './kurallar.ts';
import type { ZincirDugumu } from './kurallar.ts';

const d = (id: number, ek: Partial<ZincirDugumu> = {}): ZincirDugumu => ({ id, emirNo: `ORN-UE-${String(id)}`, durum: 'planli', arsiv: false, baslamis: false, ...ek });

describe('3576 zincir iptal kuralları', () => {
  test('başlamamış ağaç geçer; açık kol engel sayılmaz', () => {
    assert.equal(zincirIptalIhlali(d(1), [d(2), d(3, { durum: 'taslak' })]), null);
  });
  test('başlamış alt emirlerin hepsi adlandırılır, sayı yazılır', () => {
    const m = zincirIptalIhlali(d(1), [d(2, { baslamis: true }), d(3), d(4, { durum: 'basladi' })]);
    assert.match(m ?? '', /^2 alt emir başlamış: ORN-UE-2, ORN-UE-4\. /);
    assert.match(m ?? '', /Durdur ve arşive al/);
    assert.match(m ?? '', /geri katılamaz\.$/);
  });
  test('kökün kendi engeli bugünkü metindir ve alt emir engelinden önce gelir', () => {
    assert.equal(zincirIptalIhlali(d(1, { baslamis: true }), [d(2, { baslamis: true })]), ADIMLI_IPTAL_DURUMU);
    assert.equal(zincirIptalIhlali(d(1, { arsiv: true }), []), ADIMLI_IPTAL_DURUMU);
  });
  test('liste eşitliği: sıra önemsiz, fazla, eksik ve yinelenen kimlik eşit değil', () => {
    assert.equal(zincirListesiAyni([3, 2], [2, 3]), true);
    assert.equal(zincirListesiAyni([], []), true);
    assert.equal(zincirListesiAyni([2], [2, 3]), false);
    assert.equal(zincirListesiAyni([2, 3, 4], [2, 3]), false);
    assert.equal(zincirListesiAyni([2, 2], [2, 3]), false);
  });
});
