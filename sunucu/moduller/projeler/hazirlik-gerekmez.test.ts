import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { hazirlikGerekmezGovdesi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { GEREKMEZ_KONTROLDE, GEREKMEZ_ONEKI, gerekmezReddi } from './kurallar.ts';

// 3642: "Bu emirde gerekmez" kuralı saftır; veritabanlı akış uretim-emirleri/hazirlik-gerekmez.test.ts'tedir.
describe('projeler "bu emirde gerekmez" kuralı (3642)', () => {
  test('yapılacak, sürüyor ve bekliyor görev işaretlenebilir; kontrolde, bitmiş ya da karışık durum reddedilir', () => {
    assert.equal(gerekmezReddi([]), null, 'görev açılmamışsa da işaret konur');
    for (const d of ['yapilacak', 'suruyor', 'bekliyor']) assert.equal(gerekmezReddi([d]), null, d);
    assert.equal(gerekmezReddi(['yapilacak', 'suruyor']), null);
    for (const d of ['kontrolde', 'bitti']) assert.equal(gerekmezReddi([d]), GEREKMEZ_KONTROLDE, d);
    assert.equal(gerekmezReddi(['yapilacak', 'bitti']), GEREKMEZ_KONTROLDE, 'iş emri başına görevlerden biri bitmişse hiçbiri iptal olmaz');
  });

  test('önek ve en uzun gerekçe görev geçmişinin 500 karakter sınırını aşmaz; gövde boş ya da uzun gerekçeyi reddeder', () => {
    assert.ok(GEREKMEZ_ONEKI.length + 450 <= 500);
    assert.equal(hazirlikGerekmezGovdesi.safeParse({ madde: 'aparat', gerekce: 'x'.repeat(450) }).success, true);
    assert.equal(hazirlikGerekmezGovdesi.safeParse({ madde: 'aparat', gerekce: 'x'.repeat(451) }).success, false);
    assert.equal(hazirlikGerekmezGovdesi.safeParse({ madde: 'aparat', gerekce: '   ' }).success, false);
    assert.equal(hazirlikGerekmezGovdesi.safeParse({ madde: 'ozel-zz', gerekce: 'a' }).success, true, 'özel madde deseni geçerli; varlığı sunucuda denetlenir');
    assert.equal(hazirlikGerekmezGovdesi.safeParse({ madde: 'aparat', gerekce: 'a', fazla: 1 }).success, false);
    assert.equal(hazirlikGerekmezGovdesi.safeParse({ madde: 'olmayan-madde-1', gerekce: 'a' }).success, false, 'bilinmeyen kod şemada reddedilir');
  });
});
