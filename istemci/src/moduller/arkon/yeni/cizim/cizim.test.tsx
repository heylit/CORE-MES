import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { arkonAc, sunucuKur, YONETICI, type Deneme } from '../test-ortak.tsx';

// Çizim stüdyosu: açılışta yazma yok; kayıtlı çizimi silme yalnız yönetici ve hazırlıkta (planlamacı göremez); kaydet ve pakete aktarma
// yazar. Dosyalar sentetiktir (birkaç bayt, gerçek çizim değil); kişi ve paket adları uydurmadır.

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

const PLANLAMA: Deneme = { rol: 'plan', kullanici: { ...YONETICI.kullanici, id: 4, ad: 'Deneme Planlama' } };
const bayt = (s: string) => ({ $ta: 'u8', b: btoa(s) });
const CIZIM = { kimlik: 'dr-deneme', surum: 2, govde: { id: 'dr-deneme', name: 'Deneme cizim', files: [{ kind: 'model', name: 'deneme.stl', bytes: bayt('solid deneme') }], primary: 'deneme.stl', bal: [], updatedAt: 2 } };
const PAKET = { kimlik: 'p-deneme', surum: 1, govde: { id: 'p-deneme', no: 'IE-DENEME-1', part: 'Deneme parca', files: [{ kind: 'pdf', name: 'deneme.pdf', bytes: bayt('%PDF-1.4 sentetik') }], primary: 'deneme.pdf', plan: [], updatedAt: 1 } };
const yazmalar = (l: { yontem: string; yol: string }[]) => l.filter((i) => i.yontem !== 'GET' && i.yol !== '/arkon/iletiler');
const dosyalar = async () => screen.findByRole('complementary', { name: 'Dosyalar' }, { timeout: 10000 });

describe('A5 Çizim', () => {
  it('yönetici: boş çalışma, ayar sekmeleri, kayıtlı çizim ve paket listesi; açılışta yazma yok', async () => {
    const istekler = sunucuKur(YONETICI, { belgeler: { draws: [CIZIM], pkgs: [PAKET] } });
    arkonAc('/arkon/cizim');
    const d = await dosyalar();
    expect(await within(d).findByText('Deneme cizim')).toBeTruthy();
    expect(within(d).getByText('IE-DENEME-1')).toBeTruthy();
    expect(within(d).getByRole('button', { name: 'Sil: Deneme cizim' })).toBeTruthy();
    expect(within(d).getByRole('button', { name: 'Kaydet' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('PDF eklenmedi')).toBeTruthy();

    const ayar = screen.getByRole('complementary', { name: 'Okuma ayarları' });
    expect(within(ayar).getAllByRole('tab').map((t) => t.textContent)).toEqual(['PDF', '3B model', 'Tanı']);
    fireEvent.click(within(ayar).getByRole('button', { name: 'Keskin' }));
    expect(within(ayar).getByRole('button', { name: 'Uygula · yeniden oku' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(ayar).getByRole('tab', { name: '3B model' }));
    expect(within(ayar).getByRole('switch', { name: 'Gizli çizgiler' })).toBeTruthy();
    fireEvent.click(within(ayar).getByRole('tab', { name: /Tanı/ }));
    expect(within(ayar).getByText(/Bir dosya aç/)).toBeTruthy();
    expect(yazmalar(istekler)).toEqual([]);
  }, 30000);

  it('sayfa başlığında Hazırlık ve operatör kısayolu, saatin altında okuma türü (eski LabTop)', async () => {
    sunucuKur(YONETICI, {});
    arkonAc('/arkon/cizim');
    await dosyalar();
    expect(screen.getByText('PDF · 3B okuma')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Operatör ekranı' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Üretim Terminali Hazırlık' }));
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/arkon/hazirlik'); });
  }, 30000);

  it('planlamacı stüdyoyu kullanır ama kayıtlı çizimi silemez', async () => {
    const istekler = sunucuKur(PLANLAMA, { belgeler: { draws: [CIZIM] } });
    arkonAc('/arkon/cizim');
    const d = await dosyalar();
    expect(await within(d).findByText('Deneme cizim')).toBeTruthy();
    expect(within(d).queryByRole('button', { name: /^Sil/ })).toBeNull();
    expect(yazmalar(istekler)).toEqual([]);
  }, 30000);

  it('yönetici kayıtlı çizimi siler: silme isteği sunucuya gider', async () => {
    const istekler = sunucuKur(YONETICI, { belgeler: { draws: [CIZIM] } });
    arkonAc('/arkon/cizim');
    const d = await dosyalar();
    fireEvent.click(await within(d).findByRole('button', { name: 'Sil: Deneme cizim' }));
    await waitFor(() => { expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/arkon/belgeler/draws/dr-deneme/sil')).toBe(true); }, { timeout: 10000 });
  }, 30000);

  it('paket açılır, kaydedilir ve pakete aktarılır: draws ve pkgs yazılır', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const istekler = sunucuKur(YONETICI, { belgeler: { pkgs: [PAKET] } });
    arkonAc('/arkon/cizim');
    const d = await dosyalar();
    fireEvent.click(await within(d).findByText('IE-DENEME-1'));
    expect(await within(d).findByText('deneme.pdf')).toBeTruthy();
    fireEvent.click(within(d).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(istekler.some((i) => i.yontem === 'POST' && /^\/arkon\/belgeler\/draws\/dr-[^/]+\/yaz$/.test(i.yol))).toBe(true); }, { timeout: 10000 });
    const yaz = istekler.find((i) => /\/belgeler\/draws\//.test(i.yol));
    expect((yaz?.govde as { govde: { name: string; primary: string } }).govde).toMatchObject({ name: 'Deneme parca', primary: 'deneme.pdf' });

    const ayar = screen.getByRole('complementary', { name: 'Okuma ayarları' });
    fireEvent.click(within(ayar).getByRole('button', { name: /İş paketine aktar/ }));
    fireEvent.click(within(ayar).getByRole('button', { name: 'Pakete aktar' }));
    await waitFor(() => { expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/arkon/belgeler/pkgs/p-deneme/yaz')).toBe(true); }, { timeout: 10000 });
    const pk = istekler.find((i) => i.yol === '/arkon/belgeler/pkgs/p-deneme/yaz');
    expect((pk?.govde as { govde: { dirty: boolean; readCfg: unknown } }).govde).toMatchObject({ dirty: true });
    expect((pk?.govde as { govde: { readCfg: unknown } }).govde.readCfg).toBeTruthy();
  }, 30000);
});
