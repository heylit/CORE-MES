import assert from 'node:assert/strict';
import { test } from 'node:test';
import { basliktakiKartlar, birlesmeIletisiOku, kayitSatirlari } from './birlesme-kaydi.ts';
import type { BirlesmeBilgisi } from './birlesme-kaydi.ts';

test('birlesme-kaydi: birleştirme iletisinden PR numarası ve başlık', () => {
  assert.deepEqual(birlesmeIletisiOku('Merge pull request #1795 from heylit/dal\n\nLogo fix keeps the unit (3007)\n'),
    { prNo: 1795, baslik: 'Logo fix keeps the unit (3007)' });
  assert.deepEqual(birlesmeIletisiOku('ci: direct commit (3018)\n\ngovde'), { prNo: null, baslik: 'ci: direct commit (3018)' });
});

test('birlesme-kaydi: başlık sonundaki parantezden kartlar', () => {
  assert.deepEqual(basliktakiKartlar('Terminal tabs (3014, 2993, 2996)'), ['3014', '2993', '2996']);
  assert.deepEqual(basliktakiKartlar('Fix (2961-D4a)'), ['2961-D4a']);
  assert.deepEqual(basliktakiKartlar('No card here'), []);
  assert.deepEqual(basliktakiKartlar('Fix (see notes) more'), []);
});

const TABAN: BirlesmeBilgisi = {
  sha: '685b9634aaaaaaaa', zaman: new Date('2026-11-11T18:51:00Z'), prNo: 1795, baslik: 'Logo fix keeps the unit (3007)',
  gocToplam: 642, yeniGocler: [], sonGoc: '20261111152000', windowsBuCommit: false,
  sonWindowsYesili: { sha: '6f8de33dbbbbbbbb', etiket: 'windows-yesil/20261111-1815-6f8de33d' },
};
const SIMDI = new Date('2026-11-11T18:55:00Z');

test('birlesme-kaydi: Windows bekleyen commit için son yeşil ve etiket yazılır', () => {
  const s = kayitSatirlari(TABAN, SIMDI);
  assert.equal(s.gunluk, '- 11.11.2026 18:55 UTC DEVIR yazari: kayit-1855: CORE-MES #1795 (3007) birlesti, main 685b9634, göç yok (642); '
    + 'Windows son yeşil 6f8de33d, 685b9634 bekliyor (etiket windows-yesil/20261111-1815-6f8de33d). (taslak: araclar/birlesme-kaydi.ts)');
  assert.match(s.ozet, /^- CORE-MES main: `685b9634` \(11\.11 18:51Z, #1795 \(3007\) Logo fix keeps the unit; /);
});

test('birlesme-kaydi: yeni göç ve yeşil commit', () => {
  const s = kayitSatirlari({ ...TABAN, yeniGocler: ['sunucu/gocler/20261111200000_a.sql'], gocToplam: 643, sonGoc: '20261111200000', windowsBuCommit: true }, SIMDI);
  assert.match(s.gunluk, /, 1 yeni göç \(643; en yeni 20261111200000\); Windows yeşil 685b9634\. /);
  assert.match(s.ozet, /Windows yeşil son: `685b9634`\. Göç: 20261111200000 \(643\)\.$/);
});

test('birlesme-kaydi: Windows yeşili hiç yoksa "yok" yazılır, etiket uydurulmaz', () => {
  const s = kayitSatirlari({ ...TABAN, sonWindowsYesili: null }, SIMDI);
  assert.match(s.gunluk, /Windows son yeşil yok, 685b9634 bekliyor\. /);
  assert.ok(!s.gunluk.includes('etiket'));
});
