import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgHatasi, ApiHatasi } from '../../../ortak/veri/api.ts';
import type { Deneme } from '../../../ortak/veri/istek-kimligi.ts';
// Uygulamadaki yükleme sırası: store önce (store ile taşıyıcı birbirini döngüsel ithal eder).
import './store.ts';
import { ISTEK_ZAMAN_ASIMI_MS, korumali } from './tasiyici.ts';

afterEach(() => { vi.useRealTimers(); });

describe('tekrar korumalı gönderim (talep açma, katalog kaydı)', () => {
  it('cevabı yitirilen gönderim aynı kimlikle yeniden denenir; modülün süre sınırı taşınır', async () => {
    vi.useFakeTimers();
    const gorulen: Deneme[] = [];
    const sonuc = korumali(async (d) => {
      gorulen.push(d);
      if (gorulen.length === 1) throw new AgHatasi(new Error('bağlantı koptu'));
      return 'tamam';
    });
    await vi.runAllTimersAsync();
    await expect(sonuc).resolves.toBe('tamam');
    expect(gorulen).toHaveLength(2);
    expect(gorulen[1]!.istekKimligi).toBe(gorulen[0]!.istekKimligi);
    expect(gorulen[0]!.istekKimligi).toMatch(/^[0-9a-f-]{36}$/);
    expect(gorulen[0]!.zamanAsimiMs).toBe(ISTEK_ZAMAN_ASIMI_MS);
  });

  it('sunucunun reddettiği gönderim yeniden denenmez', async () => {
    let n = 0;
    const red = new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Var.' } as never);
    await expect(korumali(async () => { n += 1; throw red; })).rejects.toBe(red);
    expect(n).toBe(1);
  });
});
