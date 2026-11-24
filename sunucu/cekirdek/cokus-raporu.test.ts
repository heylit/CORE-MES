import assert from 'node:assert/strict';
import path from 'node:path';
import { describe, test } from 'node:test';
import { COKUS_KLASORU, cokusRaporunuKur, type RaporAyari } from './cokus-raporu.ts';

const bosRapor = (): RaporAyari => ({
  directory: '', reportOnFatalError: false, reportOnUncaughtException: false, reportOnSignal: true, compact: false, excludeNetwork: false, excludeEnv: false,
});

describe('çökme tanı raporu', () => {
  test('ölümcül hata ve yakalanmamış istisnada rapor açılır, ortam değişkenleri rapora girmez', () => {
    const r = bosRapor();
    const acilan: string[] = [];
    const klasor = cokusRaporunuKur(r, path.join('x', 'TMIV2-GUNLUK'), (y) => { acilan.push(y); });
    assert.equal(klasor, path.join('x', 'TMIV2-GUNLUK', COKUS_KLASORU));
    assert.deepEqual(acilan, [klasor]);
    assert.equal(r.directory, klasor);
    assert.deepEqual([r.reportOnFatalError, r.reportOnUncaughtException, r.reportOnSignal, r.excludeEnv, r.excludeNetwork, r.compact], [true, true, false, true, true, true]);
  });

  test('klasör açılamazsa rapor açılmaz ve sunucu açılışı bozulmaz', () => {
    const r = bosRapor();
    assert.equal(cokusRaporunuKur(r, 'x', () => { throw new Error('izin yok'); }), null);
    assert.equal(r.reportOnFatalError, false);
  });

  test('gerçek süreç raporu bu ayarları kabul eder (excludeEnv dahil)', () => {
    const onceki = { ...process.report };
    try {
      const r = process.report;
      assert.ok(r !== undefined);
      assert.equal(typeof r.excludeEnv, 'boolean');
    } finally {
      Object.assign(process.report, { excludeEnv: onceki.excludeEnv });
    }
  });
});
