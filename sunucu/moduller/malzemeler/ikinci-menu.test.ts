import assert from 'node:assert/strict';
import { test } from 'node:test';
import { islemMi } from '#paylasilan/islemler.ts';
import { SAYFA_YOLLARI, ikinciMenulerinHatalari } from '#paylasilan/sayfalar.ts';
import type { IkinciMenuMaddesi } from '#paylasilan/sayfa-tanimi.ts';
import { MALZEMELER_IKINCI_MENU } from '#paylasilan/sayfalar/malzemeler.ts';

const maddeler = MALZEMELER_IKINCI_MENU.gruplar.flatMap<IkinciMenuMaddesi>((g) => g.maddeler);

test('ikinci menü: geçerli, çerçeveli, kökü malzemeler sayfası; maddeler prototipin beş görünümü (operasyonlar istasyonlarda, kart #544) ve Logo gönderimi sayfası (kart #232)', () => {
  assert.deepEqual(ikinciMenulerinHatalari([MALZEMELER_IKINCI_MENU], { sayfaYollari: SAYFA_YOLLARI, islemMi }), []);
  assert.equal(MALZEMELER_IKINCI_MENU.cerceveli, true);
  assert.deepEqual(maddeler.map((m) => m.anahtar), ['new', 'cat', 'tpl', 'mayar', 'logo', 'kilavuz']);
  assert.equal(maddeler.find((m) => m.yol === MALZEMELER_IKINCI_MENU.kok)?.anahtar, 'cat');
});

test('ikinci menü: salt okuyan yeni malzeme maddesini görmez, yazabilen görür', () => {
  const gorur = (islemler: string[]) => maddeler.filter((m) => islemler.includes(m.islem)).map((m) => m.anahtar);
  assert.deepEqual(gorur(['sayfa.malzemeler']), ['cat', 'tpl', 'mayar', 'logo', 'kilavuz']);
  assert.deepEqual(gorur(['sayfa.malzemeler', 'malzemeler.yaz']), ['new', 'cat', 'tpl', 'mayar', 'logo', 'kilavuz']);
});
