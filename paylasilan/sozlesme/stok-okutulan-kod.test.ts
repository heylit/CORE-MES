import assert from 'node:assert/strict';
import { test } from 'node:test';
import { kodCozSorgusu, okutarakAlSorgusu, OKUTULAN_KOD_EN_FAZLA, refakatLotaBaglaGovdesi } from './stok.ts';

// Refakat kartının özet kodu (CM1) gerçek uzunluğundadır; 80 karakterde kesilip "En çok 80 karakter olabilir" ile reddedilmemeli.
const KART_KODU = 'CM1/RP:ORN-UE-000120-P1/UE:120/PRC:ORN-PARCA-0001/REV:B/RRV:3/ADT:250/OPS:10+20+30+40+50+60/LOT:ORN-LT-2041/TRM:261201/BT:261123';

test('refakat kartı özet kodu 80 karakterden uzundur ve okutma sorgusu kabul eder', () => {
  assert.ok(KART_KODU.length > 80 && KART_KODU.length < OKUTULAN_KOD_EN_FAZLA);
  assert.equal(kodCozSorgusu.parse({ kod: KART_KODU }).kod, KART_KODU);
  assert.equal(okutarakAlSorgusu.parse({ kod: KART_KODU, yerKodu: 'LOC:A1' }).kod, KART_KODU);
  assert.equal(refakatLotaBaglaGovdesi.safeParse({ kod: KART_KODU, surum: 1 }).success, true);
});

test('okutulan kodun üst sınırı korunur', () => {
  assert.equal(kodCozSorgusu.safeParse({ kod: 'A'.repeat(OKUTULAN_KOD_EN_FAZLA + 1) }).success, false);
});
