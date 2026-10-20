import { expect, it } from 'vitest';
import { sureMetni } from './sure.ts';

it('saniyeyi okunur sureye cevirir', () => {
  expect(sureMetni(0)).toBe('0 sn');
  expect(sureMetni(45)).toBe('45 sn');
  expect(sureMetni(60)).toBe('1 dk');
  expect(sureMetni(125)).toBe('2 dk 5 sn');
  expect(sureMetni(7500)).toBe('2 sa 5 dk');
  expect(sureMetni(7200)).toBe('2 sa');
  expect(sureMetni(90000)).toBe('1 g 1 sa');
  expect(sureMetni(86400)).toBe('1 g');
});

it('sinir degerlerde dogru yazar; gecersiz girdide yok der', () => {
  expect(sureMetni(59)).toBe('59 sn');
  expect(sureMetni(3599)).toBe('59 dk 59 sn');
  expect(sureMetni(3600)).toBe('1 sa');
  expect(sureMetni(86399)).toBe('23 sa 59 dk');
  expect(sureMetni(61.9)).toBe('1 dk 1 sn');
  expect(sureMetni(-1)).toBe('yok');
  expect(sureMetni(Number.NaN)).toBe('yok');
  expect(sureMetni(Number.POSITIVE_INFINITY)).toBe('yok');
});
