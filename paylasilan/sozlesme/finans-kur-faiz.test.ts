import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kurFaizTopluGovdesi } from './finans.ts';

// Oranlar uydurmadır.
const coz = (satirlar: unknown[]) => kurFaizTopluGovdesi.safeParse({ satirlar });
const mesajlar = (satirlar: unknown[]) => { const r = coz(satirlar); return r.success ? [] : r.error.issues.map((i) => i.message); };

test('1700 b: aynı gün ve para biriminde aylık ve günlük faiz ayrı kayıttır; günlük değer günlük kalır', () => {
  const r = coz([
    { tur: 'faiz', paraBirimi: 'TRY', tarih: '2026-10-01', deger: 3.2 },
    { tur: 'gunluk_faiz', paraBirimi: 'TRY', tarih: '2026-10-01', deger: 0.1 },
  ]);
  assert.ok(r.success);
  assert.deepEqual(r.data.satirlar.map((s) => [s.tur, s.deger]), [['faiz', '3.2000'], ['gunluk_faiz', '0.100000']]);
});

test('1700 b: aynı türün aynı gün tekrarı reddedilir; günlük sınır yuvarlamasız denetlenir', () => {
  assert.deepEqual(mesajlar([
    { tur: 'gunluk_faiz', paraBirimi: 'TRY', tarih: '2026-10-01', deger: 0.1 },
    { tur: 'gunluk_faiz', paraBirimi: 'TRY', tarih: '2026-10-01', deger: 0.2 },
  ]), ['2. satır aynı tür, para birimi ve tarihle ikinci kez var.']);
  assert.ok(coz([{ tur: 'gunluk_faiz', paraBirimi: 'TRY', tarih: '2026-10-01', deger: 3.287671 }]).success);
  assert.equal(coz([{ tur: 'gunluk_faiz', paraBirimi: 'TRY', tarih: '2026-10-01', deger: 3.287672 }]).success, false);
});
