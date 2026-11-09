import { afterEach, beforeEach, vi } from 'vitest';
import { tesisGunBasi } from '#paylasilan/tesis-zamani.ts';
import { BASLANGIC_SAATI } from './motor/kurallar.ts';
import type { PlanlamaCalismasi } from './tipler.ts';

// Ekranın "şimdi"si gerçek saattir (2506 a). Uydurma çalışmanın beklentileri kaydın `simdi`'sine (yoksa 07:00) göre yazılmıştır; testte
// saat o ana sabitlenir. Yalnız Date sahtedir: zamanlayıcılar (waitFor, yazıcının beklemesi) gerçek kalır.
export function planAni(c: Pick<PlanlamaCalismasi, 'D'> & { simdi?: unknown }): number {
  const b = c.D.meta?.baslangic;
  if (typeof b !== 'string') throw new Error('çalışmanın başlangıcı yok');
  const s = typeof c.simdi === 'number' && c.simdi >= 0 ? c.simdi : BASLANGIC_SAATI;
  return tesisGunBasi(b.slice(0, 10)) + s * 3_600_000;
}
export function saatiSabitle(c: () => Pick<PlanlamaCalismasi, 'D'> & { simdi?: unknown }): void {
  beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(planAni(c())); });
  afterEach(() => { vi.useRealTimers(); });
}
