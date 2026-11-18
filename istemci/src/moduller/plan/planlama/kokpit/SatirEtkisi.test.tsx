import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { ornekCalisma } from '../motor/ornek.ts';
import type { BekleyenDegisiklik, PlanlamaCalismasi } from '../tipler.ts';
import { Degisiklikler } from './Degisiklikler.tsx';
import type { Degisiklik } from './degisiklikler.ts';
import { birlikteUygulananlar, gerideBirlikte, satirIsleri, useSatirEtkisi, type SatirEtkisiYuzu } from './satir-etkisi.ts';
import { sahteTaslak } from './taslak-test-yardim.ts';

// 3317 a (2. adım): "Veri değişti" satırında "Etkisini gör"; satırın emirleri için taslağa yeniden planlama isteği yazılır, önce ve sonra
// gösterilir, "Uygula" dizmeyi taslağa yazar, "Vazgeç" isteği geri alır. Veriler uydurmadır.
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const e = (id: string, isler: string[]): BekleyenDegisiklik => ({ id, ne: `Değişiklik ${id}`, ayrinti: '', kim: 'Deneme Kisi', t: 1, isler, geri: [] });
const ORNEK = ornekCalisma();
const [S1, S2, S3] = ORNEK.D.siparisler.map((s) => s.id) as [string, string, string];
const calisma = (bekleyen: BekleyenDegisiklik[]) => ({ ...ORNEK, dataVer: 6, plan: { ...ORNEK.plan, dataVer: 4, ozet: { wT: 2, late: 1, n: 3 } }, bekleyen }) as PlanlamaCalismasi;

describe('satırın emirleri ve birlikte uygulananlar', () => {
  it('işleri seçilenin işlerinin içinde kalan satırlar birlikte sayılır; bütün planı etkileyen seçilirse hepsi', () => {
    const liste = [e('a', ['S1', 'S2']), e('b', ['S1']), e('c', ['S2', 'S3']), e('d', ['*']), e('f', [])];
    expect(birlikteUygulananlar(liste, 'a')).toEqual(['a', 'b', 'f']);
    expect(birlikteUygulananlar(liste, 'b')).toEqual(['b', 'f']);
    expect(birlikteUygulananlar(liste, 'd')).toEqual(['a', 'b', 'c', 'd', 'f']);
    expect(birlikteUygulananlar(liste, 'f')).toEqual(['a', 'b', 'c', 'd', 'f']);
  });

  it('yeniden dizilecek emirler çalışmada olanlardır; işi olmayan, bütün planı etkileyen ya da emri çalışmadan çıkmış satırda bütün plan', () => {
    const c = calisma([]);
    expect(satirIsleri(c, e('a', [S1, S2, S1]))).toEqual([S1, S2]);
    expect(satirIsleri(c, e('a', [S1, 'ORN-yok']))).toEqual([S1]);
    expect(satirIsleri(c, e('a', ['ORN-yok']))).toEqual(['*']);
    expect(satirIsleri(c, e('a', []))).toEqual(['*']);
    expect(satirIsleri(c, e('a', ['*']))).toEqual(['*']);
  });
});

describe('satır etkisi kancası', () => {
  it('Etkisini gör taslağa satırın emirleri için yeniden planlama isteği yazar (dizmeden), planı yalnız o emirlerle dizdirir; Uygula dizmeyi taslağa yazar', async () => {
    const liste = [e('a', [S1, S2]), e('b', [S1]), e('c', [S3])];
    const c = calisma(liste);
    const { t, yazilan } = sahteTaslak(c.dataVer, { wT: 5.5, late: 2, n: 3 });
    const { result } = renderHook(() => useSatirEtkisi({ c, taslak: t, liste }));
    expect(result.current?.id).toBeNull();
    act(() => { result.current?.gor('a'); });
    await waitFor(() => { expect(result.current?.durum.tur).toBe('etki'); });
    expect(yazilan).toEqual([{ tur: 'yeniden-planla', isler: [S1, S2] }]);
    expect(t.yaz).toHaveBeenCalledWith({ tur: 'yeniden-planla', isler: [S1, S2] }, false);
    expect(t.degerlendir).toHaveBeenCalledWith({ tur: 'plan-uygula', isler: [S1, S2] });
    expect(result.current).toMatchObject({ id: 'a', birlikte: 1, butun: false, durum: { e: { is: 'ORN-is', once: { wT: 2, late: 1, n: 3 }, sonra: { wT: 5.5, late: 2, n: 3 } } } });
    expect(t.dizmeyiYaz).not.toHaveBeenCalled();
    act(() => { result.current?.uygula(); });
    await waitFor(() => { expect(result.current?.id).toBeNull(); });
    expect(t.dizmeyiYaz).toHaveBeenCalledWith('ORN-is');
    expect(t.geriAl).not.toHaveBeenCalled();
  });

  it('Vazgeç isteği taslaktan dizmeden geri alır, dizme yazılmaz; bütün planı etkileyen satırda bütün plan istenir ve öteki satırların hepsi birlikte sayılır', async () => {
    const liste = [e('a', ['*']), e('b', [S1]), e('c', [S3])];
    const c = calisma(liste);
    const { t, yazilan } = sahteTaslak(c.dataVer);
    const { result } = renderHook(() => useSatirEtkisi({ c, taslak: t, liste }));
    act(() => { result.current?.gor('a'); });
    await waitFor(() => { expect(result.current?.durum.tur).toBe('etki'); });
    expect(yazilan).toEqual([{ tur: 'yeniden-planla', isler: ['*'] }]);
    expect(result.current).toMatchObject({ id: 'a', birlikte: 2, butun: true });
    act(() => { result.current?.vazgec(); });
    await waitFor(() => { expect(result.current?.id).toBeNull(); });
    expect(t.geriAl).toHaveBeenCalledWith(false, false);
    expect(t.dizmeyiYaz).not.toHaveBeenCalled();
  });

  it('istek yazılamazsa satır açılmaz; hesap hatası satırda iletiyle durur ve Kapat yalnız iletiyi kapatır', async () => {
    const liste = [e('a', [S1])];
    const c = calisma(liste);
    const { t } = sahteTaslak(c.dataVer);
    vi.mocked(t.yaz).mockResolvedValueOnce(false);
    const { result } = renderHook(() => useSatirEtkisi({ c, taslak: t, liste }));
    act(() => { result.current?.gor('a'); });
    await waitFor(() => { expect(t.yaz).toHaveBeenCalledTimes(1); });
    expect(result.current?.id).toBeNull();
    expect(t.degerlendir).not.toHaveBeenCalled();
    vi.mocked(t.degerlendir).mockRejectedValueOnce(new Error('yok'));
    act(() => { result.current?.gor('a'); });
    await waitFor(() => { expect(result.current?.durum.tur).toBe('hata'); });
    expect(result.current?.id).toBe('a');
    act(() => { result.current?.vazgec(); });
    expect(result.current?.id).toBeNull();
    expect(t.geriAl).not.toHaveBeenCalled();
  });

  it('taslağı olmayan (yazamayan) kişide ve planı olmayan çalışmada kanca yoktur', () => {
    const liste = [e('a', [S1])];
    const c = calisma(liste);
    expect(renderHook(() => useSatirEtkisi({ c, taslak: null, liste })).result.current).toBeNull();
    // Taslak komut yazarken ya da plan dizerken düğmeler bekler.
    const t = sahteTaslak(6).t;
    expect(renderHook(() => useSatirEtkisi({ c, taslak: t, liste })).result.current?.mesgul).toBe(false);
    expect(renderHook(() => useSatirEtkisi({ c, taslak: { ...t, diziliyor: true }, liste })).result.current?.mesgul).toBe(true);
    expect(renderHook(() => useSatirEtkisi({ c, taslak: { ...t, mesgul: true }, liste })).result.current?.mesgul).toBe(true);
    expect(renderHook(() => useSatirEtkisi({ c: { ...c, plan: null } as PlanlamaCalismasi, taslak: sahteTaslak(6).t, liste })).result.current).toBeNull();
  });
});

describe('plan geride satırının etkisi (3317 a, 3. adım)', () => {
  const g = (isId: string, emirId: string | null, ek: Partial<Degisiklik> = {}): Degisiklik => ({ anahtar: `geride:${isId}`, baslik: 'geride', ne: isId, alt: '', emirId, isId, bekleyenId: null, ...(emirId === null ? {} : { yenidenDiz: true as const }), ...ek });

  it('Etkisini gör taslağa yalnız satırın emri için yeniden planlama isteği yazar; açık satır satırın anahtarıdır; Uygula dizmeyi taslağa yazar', async () => {
    const liste = [e('a', [S1]), e('b', [S1, S2])];
    const c = calisma(liste);
    const { t, yazilan } = sahteTaslak(c.dataVer, { wT: 5.5, late: 2, n: 3 });
    const satirlar = [g('ORN-1', S1), g('ORN-2', S1), g('ORN-3', S2)];
    const { result } = renderHook(() => useSatirEtkisi({ c, taslak: t, liste }));
    act(() => { result.current?.gorGeride(satirlar[0]!, satirlar); });
    await waitFor(() => { expect(result.current?.durum.tur).toBe('etki'); });
    expect(yazilan).toEqual([{ tur: 'yeniden-planla', isler: [S1] }]);
    expect(result.current?.id).toBe('geride:ORN-1');
    // Aynı emrin öteki geride işi ve yalnız o emri etkileyen veri değişikliği birlikte uygulanır.
    expect([result.current?.birlikte, result.current?.butun]).toEqual([2, false]);
    act(() => { result.current?.uygula(); });
    await waitFor(() => { expect(result.current?.id).toBeNull(); });
    expect(t.degerlendir).toHaveBeenCalledWith({ tur: 'plan-uygula', isler: [S1] });
    expect(t.dizmeyiYaz).toHaveBeenCalledWith('ORN-is');
  });

  it('elle kilitli ya da emre bağlanamayan satırda istek yazılmaz; birlikte sayımı yalnız aynı emrin taşınabilir geride işlerini ve o emre özgü veri satırlarını sayar', () => {
    const liste = [e('a', [S1]), e('b', [S1, S2]), e('c', ['*']), e('d', [])];
    const c = calisma(liste);
    const { t, yazilan } = sahteTaslak(c.dataVer, { wT: 1, late: 0, n: 1 });
    const kilitli = g('ORN-4', S1, {}); delete kilitli.yenidenDiz;
    const satirlar = [g('ORN-1', S1), kilitli, g('ORN-3', S2), g('ORN-5', null)];
    const { result } = renderHook(() => useSatirEtkisi({ c, taslak: t, liste }));
    act(() => { result.current?.gorGeride(kilitli, satirlar); result.current?.gorGeride(satirlar[3]!, satirlar); });
    expect(yazilan).toEqual([]);
    expect(result.current?.id).toBeNull();
    expect(gerideBirlikte(satirlar, liste, satirlar[0]!)).toBe(1);
    expect(gerideBirlikte(satirlar, liste, satirlar[2]!)).toBe(0);
  });

  it('listede düğme yalnız taşınabilir geride satırındadır; açık satırda etki ve Uygula çizilir, not satırın ne yaptığını yazar', () => {
    const L = [g('ORN-1', S1), g('ORN-2', S1, { anahtar: 'geride:ORN-2' }), { ...g('ORN-4', S1), yenidenDiz: undefined } as unknown as Degisiklik, { anahtar: 'saha:0', baslik: 'saha', ne: 'saha', alt: '', emirId: S1, isId: null, bekleyenId: null } satisfies Degisiklik];
    const yuz = (x: Partial<SatirEtkisiYuzu> = {}): SatirEtkisiYuzu => ({ id: null, durum: { tur: 'duzen' }, birlikte: 0, butun: false, gor: vi.fn(), gorGeride: vi.fn(), uygula: vi.fn(), vazgec: vi.fn(), mesgul: false, ...x });
    const e1 = yuz();
    const { unmount } = render(<Degisiklikler l={L} kart={null} suzgec={false} suzgecKoy={vi.fn()} goster={vi.fn()} toplu={null} etki={e1} />);
    const dugmeler = screen.getAllByRole('button', { name: 'Etkisini gör' });
    expect(dugmeler.map((x) => x.closest('li')?.querySelector('b')?.textContent)).toEqual(['ORN-1', 'ORN-2']);
    fireEvent.click(dugmeler[1]!);
    expect(e1.gorGeride).toHaveBeenCalledWith(L[1], L);
    expect(e1.gor).not.toHaveBeenCalled();
    const liste = screen.getByRole('region', { name: 'Planı etkileyen değişiklikler' });
    expect(liste.textContent).toContain('"Etkisini gör" yalnız o satırın planı nasıl değiştireceğini hesaplar, plan değişmez; altında çıkan düğme taslağınıza yazar. "Sahada oldu" satırları bilgi içindir');
    unmount();
    const e2 = yuz({ id: 'geride:ORN-2', birlikte: 1, durum: { tur: 'etki', e: { is: 'ORN-is', once: { wT: 4, late: 1, n: 3 }, sonra: { wT: 6, late: 2, n: 3 }, oteki: 0 } } });
    render(<Degisiklikler l={L} kart={null} suzgec={false} suzgecKoy={vi.fn()} goster={vi.fn()} toplu={null} etki={e2} />);
    const acik = screen.getByRole('region', { name: 'Etkisi' });
    expect(acik.closest('li')?.querySelector('b')?.textContent).toBe('ORN-2');
    expect(acik.textContent).toContain('Aynı emirleri etkileyen 1 değişiklik de birlikte uygulanır.');
    fireEvent.click(within(acik).getByRole('button', { name: 'Bu emri yeniden diz' }));
    expect(e2.uygula).toHaveBeenCalledTimes(1);
    // Açık satır varken öteki satırın düğmesi bekler.
    expect(screen.getAllByRole('button', { name: 'Etkisini gör' }).map((x) => x.hasAttribute('disabled'))).toEqual([true]);
  });
});

describe('listede satır etkisi', () => {
  const d = (x: Partial<Degisiklik> & { anahtar: string }): Degisiklik => ({ baslik: 'veri', ne: x.anahtar, alt: 'Bu sayfa', emirId: null, isId: null, bekleyenId: null, ...x });
  const L = [d({ anahtar: 'veri:a', bekleyenId: 'a' }), d({ anahtar: 'veri:b', bekleyenId: 'b' }), d({ anahtar: 'veri:dis' }), d({ anahtar: 'saha:0', baslik: 'saha', emirId: 'S1' })];
  const yuz = (x: Partial<SatirEtkisiYuzu> = {}): SatirEtkisiYuzu => ({ id: null, durum: { tur: 'duzen' }, birlikte: 0, butun: false, gor: vi.fn(), gorGeride: vi.fn(), uygula: vi.fn(), vazgec: vi.fn(), mesgul: false, ...x });
  const etkiDurumu = (once: { wT: number; late: number; n: number } | null, sonra: { wT: number; late: number; n: number }) => ({ tur: 'etki' as const, e: { is: 'ORN-is', once, sonra, oteki: 0 } });
  const ciz = (etki: SatirEtkisiYuzu | null) => render(<Degisiklikler l={L} kart={null} suzgec={false} suzgecKoy={vi.fn()} goster={vi.fn()} toplu={3} etki={etki} />);

  it('"Etkisini gör" yalnız çalışmaya yazılmış veri satırlarındadır; yazamayan kişide hiç yoktur', () => {
    const e1 = yuz();
    ciz(e1);
    const dugmeler = screen.getAllByRole('button', { name: 'Etkisini gör' });
    expect(dugmeler.map((x) => x.closest('li')?.querySelector('b')?.textContent)).toEqual(['veri:a', 'veri:b']);
    fireEvent.click(dugmeler[0]!);
    expect(e1.gor).toHaveBeenCalledWith('a');
    expect(screen.getByRole('region', { name: 'Planı etkileyen değişiklikler' }).textContent).toContain('"Etkisini gör" yalnız o satırın planı nasıl değiştireceğini hesaplar, plan değişmez; altında çıkan düğme taslağınıza yazar');
    cleanup();
    // Taslak meşgulken (başka komut yazılıyor, plan diziliyor) düğmeler bekler.
    ciz(yuz({ mesgul: true }));
    expect(screen.getAllByRole('button', { name: 'Etkisini gör' }).map((x) => x.hasAttribute('disabled'))).toEqual([true, true]);
    cleanup();
    ciz(null);
    expect(screen.queryByRole('button', { name: 'Etkisini gör' })).toBeNull();
  });

  it('etki satırın altında önce ve sonrayı tonuyla, birlikte uygulananları gösterir; Uygula ve Vazgeç kancaya gider; öteki satırın düğmesi bekler', () => {
    const e1 = yuz({ id: 'a', birlikte: 2, durum: etkiDurumu({ wT: 2, late: 1, n: 3 }, { wT: 1, late: 2, n: 3 }) });
    ciz(e1);
    const etki = screen.getByRole('region', { name: 'Etkisi' });
    expect(etki.closest('li')?.textContent).toContain('veri:a');
    expect([...etki.querySelectorAll('dd')].map((x) => [x.textContent, x.getAttribute('data-yon')])).toEqual([['1 / 3 → 2 / 3', 'kotu'], ['2,0 sa → 1,0 sa', 'iyi']]);
    expect(etki.textContent).toContain('Aynı emirleri etkileyen 2 değişiklik de birlikte uygulanır.');
    // Açık etki varken öteki satırdan ikinci istek yazılmaz (taslakta tek bekleyen istek).
    const oteki = screen.getAllByRole('button', { name: 'Etkisini gör' });
    expect(oteki).toHaveLength(1);
    expect(oteki[0]?.hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(etki).getByRole('button', { name: 'Bu değişikliği uygula' }));
    fireEvent.click(within(etki).getByRole('button', { name: 'Vazgeç' }));
    expect(e1.uygula).toHaveBeenCalledTimes(1);
    expect(e1.vazgec).toHaveBeenCalledTimes(1);
    cleanup();
    ciz(yuz({ id: 'a', mesgul: true, butun: true, birlikte: 1, durum: etkiDurumu(null, { wT: 0, late: 0, n: 3 }) }));
    const butun = screen.getByRole('region', { name: 'Etkisi' });
    expect(butun.textContent).toContain('Bu değişiklik bütün planı etkiler');
    expect(within(butun).getByRole('button', { name: 'Bu değişikliği uygula' }).hasAttribute('disabled')).toBe(true);
  });

  it('taslakta uygulanan satır varsa not toplu düğmenin onu da saydığını söyler; yoksa yazmaz', () => {
    render(<Degisiklikler l={L} kart={null} suzgec={false} suzgecKoy={vi.fn()} goster={vi.fn()} toplu={3} etki={yuz()} taslakta={1} />);
    expect(screen.getByRole('region', { name: 'Planı etkileyen değişiklikler' }).textContent).toContain('1 veri değişikliği taslağınızda uygulandı, listede durmaz; ortak plana taslak yazılınca girer, toplu düğme o zamana kadar onu da sayar.');
    cleanup();
    ciz(yuz());
    expect(screen.getByRole('region', { name: 'Planı etkileyen değişiklikler' }).textContent).not.toContain('taslağınızda uygulandı');
  });

  it('hesap sürerken durum satırı, hata olunca ileti ve Kapat görünür', () => {
    ciz(yuz({ id: 'a', durum: { tur: 'hesap' }, mesgul: true }));
    expect(screen.getByRole('status').textContent).toBe('Etkisi hesaplanıyor; plan değişmedi.');
    cleanup();
    const e1 = yuz({ id: 'a', durum: { tur: 'hata', ileti: 'Deneme hatası' } });
    ciz(e1);
    expect(screen.getByRole('alert').textContent).toContain('Deneme hatası');
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(e1.vazgec).toHaveBeenCalledTimes(1);
  });
});
