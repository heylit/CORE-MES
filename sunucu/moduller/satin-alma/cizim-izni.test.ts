import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cizimIzni } from './kurallar.ts';

const YAZ = ['satin-alma.yaz'];
const OKU = ['satin-alma.oku'];
const ONAY = ['satin-alma.onayla'];
const TALEP = ['satin-alma.talep-ac'];

test('3442-2 izinli: satın alma yazan her adımda görür ve ekler; okuyan ve onaylayan görür; talep eden kendi taslağına ekler, sonra görür', () => {
  assert.equal(cizimIzni(YAZ, false, false, 'yaz'), true);
  assert.equal(cizimIzni(OKU, false, false, 'oku'), true);
  assert.equal(cizimIzni(ONAY, false, false, 'oku'), true);
  assert.equal(cizimIzni(TALEP, true, true, 'yaz'), true);
  assert.equal(cizimIzni(TALEP, true, false, 'oku'), true);
});

test('3442-2 yasak: okuyan ve onaylayan eklemez; talep eden başkasının talebini görmez, taslaktan sonra eklemez; işlemsiz sahip hiçbir şey yapmaz', () => {
  assert.equal(cizimIzni(OKU, false, true, 'yaz'), false);
  assert.equal(cizimIzni(ONAY, true, true, 'yaz'), false);
  assert.equal(cizimIzni(TALEP, false, true, 'oku'), false);
  assert.equal(cizimIzni(TALEP, true, false, 'yaz'), false);
  assert.equal(cizimIzni([], true, true, 'oku'), false);
});
