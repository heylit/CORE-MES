import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import type { DegerlendirmeCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { CalismaKomutu } from '../kayit.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { planKurSifirla, usePlanKur } from './coz.ts';
import { ornekCalisma } from './ornek.ts';

// 3486 (Arayüz): başarı iletisi hata geri çağrısından gitmez; motor sayfaları hatayı kırmızı gösterir. Veriler uydurmadır.
const PLAN = { ops: { 'O1.10': { id: 'O1.10', job: 'O1', m: '100', S: 8, C: 9 } }, fail: [], J: { O1: { C: 9, T: 0 } }, ozet: { wT: 1.25, late: 1, n: 2 } };
let dataVer = 0;
vi.mock('../siparis/degerlendirme.ts', async (asil) => ({
  ...(await asil<Record<string, unknown>>()),
  degerlendirmeIste: vi.fn(async (): Promise<DegerlendirmeCevabi> => ({
    calismaSurumu: 7, dataVer, baslangic: '2026-10-19', simdi: 9, maliyetGorunur: true, sonuc: { tur: 'plan-kur', plan: { ...PLAN, dataVer } },
  } as unknown as DegerlendirmeCevabi)),
}));
afterEach(planKurSifirla);

function ortam() {
  const c: PlanlamaCalismasi = ornekCalisma(); dataVer = c.dataVer;
  const komut = { kaydet: vi.fn(async () => 7), degistir: vi.fn((_ne: string, fn: (t: PlanlamaCalismasi) => boolean | void) => fn(structuredClone(c)) !== false) } as unknown as CalismaKomutu;
  return { komut, yetki: { planYaz: true }, calisma: c, depo: { ben: null } } as never;
}

describe('usePlanKur iletileri (3486)', () => {
  it('başarıda "Plan kuruldu." tamam ile gider, hata geri çağrısı çağrılmaz', async () => {
    const uyar = vi.fn(), tamam = vi.fn();
    const { result } = renderHook(() => usePlanKur(ortam(), uyar, tamam));
    act(() => { result.current?.kur(); });
    await waitFor(() => { expect(tamam).toHaveBeenCalledWith('Plan kuruldu.'); });
    expect(uyar).not.toHaveBeenCalled();
  });
  it('tamam verilmezse başarı söylenmez', async () => {
    const uyar = vi.fn();
    const { result } = renderHook(() => usePlanKur(ortam(), uyar));
    act(() => { result.current?.kur(); });
    await new Promise((r) => setTimeout(r, 20));
    expect(uyar).not.toHaveBeenCalled();
  });
});
