import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ornekCalisma } from '../motor/ornek.ts';
import { planKurSifirla } from '../motor/coz.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { ElleBol, plandaPayVar, type BolOnizlemeIstegi } from './ElleBol.tsx';
import type { KokpitModeli } from './kurallar.ts';
import { sahteTaslak } from './taslak-test-yardim.ts';

// 3792: Etkisini gör sunucunun bölünmüş planını saklar ve tahtaya verir; panel gizlenir, değerler durur. Çalışma uydurmadır; taslak sahtedir.
afterEach(() => { cleanup(); vi.restoreAllMocks(); planKurSifirla(); });

const M = {
  isler: {},
  emirler: [{ id: 'ORN-1', no: 'ORN-0001', adet: 9, adimlar: [{ id: 'ORN-1.20', ad: 'Frezeleme', adaylar: ['ORN-F1', 'ORN-F2'] }] }],
  tezgahlar: [{ id: 'ORN-F1', kod: 'F1', ad: '', fason: false }, { id: 'ORN-F2', kod: 'F2', ad: '', fason: false }],
} as unknown as Pick<KokpitModeli, 'isler' | 'emirler' | 'tezgahlar'>;
const BOLUNMUS_PLAN = { ozet: { wT: 20, late: 0, n: 2 }, ops: { 'ORN-1.20': {}, 'ORN-1.20~2': {} } };

function kur(plan: Record<string, unknown>) {
  const c = ornekCalisma() as unknown as PlanlamaCalismasi;
  const { t } = sahteTaslak(c.dataVer);
  vi.mocked(t.degerlendir).mockResolvedValue({ is: 'ORN-is', cevap: { calismaSurumu: 9, dataVer: c.dataVer, baslangic: null, simdi: 0, maliyetGorunur: false, sonuc: { tur: 'plan-uygula', plan } } } as never);
  const onizleme = vi.fn<(o: BolOnizlemeIstegi | null) => void>(), kapat = vi.fn();
  render(<ElleBol c={c} m={M} isId="ORN-1.20" taslak={t} yazabilir kapat={kapat} onizleme={onizleme} />);
  const panel = screen.getByRole('complementary', { name: 'Planda böl' });
  return { t, onizleme, kapat, panel };
}

describe('Planda böl önizleme isteği (3792)', () => {
  it('plandaPayVar: adım iki ya da daha çok paylıysa true; ops yoksa ya da tek paylıysa false', () => {
    expect(plandaPayVar(BOLUNMUS_PLAN, 'ORN-1.20')).toBe(true);
    expect(plandaPayVar({ ops: { 'ORN-1.20': {} } }, 'ORN-1.20')).toBe(false);
    expect(plandaPayVar({ ozet: {} }, 'ORN-1.20')).toBe(false);
    expect(plandaPayVar(undefined, 'ORN-1.20')).toBe(false);
  });

  it('Etkisini gör sunucunun bütün planını isteğe koyar; panel gizlenir, Uygula dizmeyi yazar ve paneli kapatır', async () => {
    const { t, onizleme, kapat, panel } = kur(BOLUNMUS_PLAN);
    fireEvent.click(within(panel).getByRole('button', { name: 'Etkisini gör' }));
    await waitFor(() => { expect(onizleme).toHaveBeenLastCalledWith(expect.objectContaining({ isId: 'ORN-1.20', plan: BOLUNMUS_PLAN })); });
    expect(panel.hasAttribute('hidden')).toBe(true);
    expect(screen.queryByRole('region', { name: 'Bölmenin etkisi' })).toBeNull();
    onizleme.mock.lastCall![0]!.uygula();
    await waitFor(() => { expect(t.dizmeyiYaz).toHaveBeenCalledWith('ORN-is'); });
    await waitFor(() => { expect(kapat).toHaveBeenCalled(); });
  });

  it('Vazgeç bölmeyi geri alır, panel yeniden görünür ve girilen adetler durur', async () => {
    const { t, onizleme, panel } = kur(BOLUNMUS_PLAN);
    const adetler = within(panel).getAllByLabelText('Adet') as HTMLInputElement[];
    fireEvent.change(adetler[0]!, { target: { value: '8' } });
    fireEvent.change(adetler[1]!, { target: { value: '1' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Etkisini gör' }));
    await waitFor(() => { expect(onizleme).toHaveBeenLastCalledWith(expect.objectContaining({ isId: 'ORN-1.20' })); });
    onizleme.mock.lastCall![0]!.vazgec();
    await waitFor(() => { expect(t.geriAl).toHaveBeenCalledWith(false, false); });
    await waitFor(() => { expect(panel.hasAttribute('hidden')).toBe(false); });
    expect(onizleme).toHaveBeenLastCalledWith(null);
    expect((within(panel).getAllByLabelText('Adet') as HTMLInputElement[]).map((x) => x.value)).toEqual(['8', '1']);
  });

  it('Vazgeç yalnız kendi komutunu geri alır: araya başka komut yazıldıysa geri alma yapılmaz, panel döner ve uyarır (B1)', async () => {
    const { t, onizleme, panel } = kur(BOLUNMUS_PLAN);
    fireEvent.click(within(panel).getByRole('button', { name: 'Etkisini gör' }));
    await waitFor(() => { expect(onizleme).toHaveBeenLastCalledWith(expect.objectContaining({ isId: 'ORN-1.20' })); });
    // Taslağın son değişikliği bölme değil: araya yeniden planlama yazıldı.
    t.cevap = { taslak: { surum: 3, satirlar: [{ komut: { tur: 'elle-bol', isId: 'ORN-1.20' } }, { komut: { tur: 'yeniden-planla', isler: ['ORN-1'] } }] } } as never;
    onizleme.mock.lastCall![0]!.vazgec();
    await waitFor(() => { expect(panel.hasAttribute('hidden')).toBe(false); });
    expect(t.geriAl).not.toHaveBeenCalled();
    expect(onizleme).toHaveBeenLastCalledWith(null);
    expect(panel.textContent).toContain('Vazgeç onu geri almaz');
  });

  it('son değişiklik bu bölmeyse Vazgeç geri alır; panel kapanırken de aynı doğrulama yapılır (B1)', async () => {
    const a = kur(BOLUNMUS_PLAN);
    fireEvent.click(within(a.panel).getByRole('button', { name: 'Etkisini gör' }));
    await waitFor(() => { expect(a.onizleme).toHaveBeenLastCalledWith(expect.objectContaining({ isId: 'ORN-1.20' })); });
    a.t.cevap = { taslak: { surum: 2, satirlar: [{ komut: { tur: 'yeniden-planla', isler: ['ORN-1'] } }, { komut: { tur: 'elle-bol', isId: 'ORN-1.20' } }] } } as never;
    a.onizleme.mock.lastCall![0]!.vazgec();
    await waitFor(() => { expect(a.t.geriAl).toHaveBeenCalledWith(false, false); });
    cleanup();
    const b = kur(BOLUNMUS_PLAN);
    fireEvent.click(within(b.panel).getByRole('button', { name: 'Etkisini gör' }));
    await waitFor(() => { expect(b.onizleme).toHaveBeenLastCalledWith(expect.objectContaining({ isId: 'ORN-1.20' })); });
    b.t.cevap = { taslak: { surum: 3, satirlar: [{ komut: { tur: 'elle-bol', isId: 'ORN-1.20' } }, { komut: { tur: 'yeniden-planla', isler: ['ORN-1'] } }] } } as never;
    cleanup();
    expect(b.t.geriAl).not.toHaveBeenCalled();
  });

  it('tek paylı sonuç (bölme kalkıyor) tahtaya verilmez: etki panelde kalır', async () => {
    const { onizleme, panel } = kur({ ozet: { wT: 20, late: 0, n: 2 }, ops: { 'ORN-1.20': {} } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Etkisini gör' }));
    await screen.findByRole('region', { name: 'Bölmenin etkisi' });
    expect(onizleme).not.toHaveBeenCalled();
  });
});
