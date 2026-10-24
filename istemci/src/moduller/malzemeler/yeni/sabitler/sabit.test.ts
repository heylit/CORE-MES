import { test, expect } from 'vitest';
import * as S from './index.ts';
test('sabitler tanimli', () => {
  const tanimsiz = Object.entries(S).filter(([, v]) => v === undefined).map(([k]) => k);
  expect(tanimsiz).toEqual([]);
});
