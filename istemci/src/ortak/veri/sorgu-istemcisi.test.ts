import { describe, expect, it } from 'vitest';
import { sorguIstemcisi } from './sorgu-istemcisi.ts';

describe('sorguIstemcisi', () => {
  it('veri 30 sn taze sayilir: sayfaya donuste her sorgu yeniden cekilmez', () => {
    expect(sorguIstemcisi().getDefaultOptions().queries).toMatchObject({ staleTime: 30_000, retry: false, refetchOnWindowFocus: false });
  });
});
