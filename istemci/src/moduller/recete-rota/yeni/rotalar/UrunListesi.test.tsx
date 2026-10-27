import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { OKUYAN, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

const bolumAc = async () => {
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  await waitFor(() => { expect(bolge.querySelector('[data-parca="R1"]')).not.toBeNull(); });
  return bolge;
};
const maliyetli = (tutar: string) => ({
  ...rotaDurumu(),
  maliyet: { yazabilir: false, malzeme: { 12: { birimMaliyet: tutar, paraBirimi: 'TRY', surum: 1 } }, istasyon: {}, kisi: {} },
});

describe('R1 Ürün listesi (sık tablo)', () => {
  it('arama satırları süzer; satıra Enter ile basınca ürün şemada açılır', async () => {
    sunucuKur(YONETICI, { durum: rotaDurumu() });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(within(bolge).getByRole('button', { name: 'Ürün listesi' }));
    const tablo = await within(bolge).findByRole('table', { name: 'Ürünler ve rotaları' });
    expect(within(tablo).getByText('MM-0001')).toBeTruthy();
    expect(within(tablo).getByText('Yürürlükte')).toBeTruthy();
    fireEvent.change(within(bolge).getByLabelText('Ürün ara'), { target: { value: 'yok-boyle-urun' } });
    await within(bolge).findByText('Bu süzgeçte ürün yok.');
    fireEvent.change(within(bolge).getByLabelText('Ürün ara'), { target: { value: 'mm-0001' } });
    const satir = (await within(bolge).findByText('MM-0001')).closest('tr');
    expect(satir).not.toBeNull();
    if (satir) fireEvent.keyDown(satir, { key: 'Enter' });
    await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' });
  });

  it('rota durumu süzgeci bölmeli düğmedir; rotasızda rotalı ürün görünmez', async () => {
    sunucuKur(YONETICI, { durum: rotaDurumu() });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    fireEvent.click(within(bolge).getByRole('button', { name: 'Ürün listesi' }));
    const grup = await within(bolge).findByRole('group', { name: 'Rota durumu' });
    fireEvent.click(within(grup).getByRole('button', { name: 'Rotasız' }));
    expect(within(grup).getByRole('button', { name: 'Rotasız' }).getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => { expect(within(bolge).queryByText('MM-0001')).toBeNull(); });
  });
});

describe('R1 Özet çubuğu (motorsuz)', () => {
  it('maliyet okuyanda birim malzeme maliyeti girenlerden toplanır; uyarı yoksa uyarı yazılmaz', async () => {
    sunucuKur(YONETICI, { durum: maliyetli('2.5') });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const ozet = await within(bolge).findByRole('group', { name: 'Rota özeti' });
    // 2 kg x 2,5 ₺
    expect(ozet.textContent).toContain('Birim malzeme');
    expect(ozet.textContent).toContain('5 ₺');
    expect(within(ozet).queryByText(/uyarı$/)).toBeNull();
    expect(within(ozet).getByRole('button', { name: 'Üretim emri oluştur' })).toBeTruthy();
  });

  it('maliyeti bilinmeyen girende sıfır uydurmaz, "—" yazar; eksik rota uyarı sayısına girer', async () => {
    const eksik = rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3, [adimOrnegi({ proc: null, cycle: null })])]);
    sunucuKur(YONETICI, { durum: { ...eksik, maliyet: { yazabilir: false, malzeme: {}, istasyon: {}, kisi: {} } } });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const ozet = await within(bolge).findByRole('group', { name: 'Rota özeti' });
    expect(ozet.textContent).toContain('Birim malzeme —');
    expect(within(ozet).getByText(/^\d+ uyarı$/)).toBeTruthy();
  });

  it('reddedilen: maliyet ve emir yetkisi olmayan maliyeti ve emir düğmesini görmez', async () => {
    sunucuKur(OKUYAN, { durum: maliyetli('2.5') });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' });
    expect(within(bolge).queryByText(/Birim malzeme/)).toBeNull();
    expect(within(bolge).queryByRole('button', { name: 'Üretim emri oluştur' })).toBeNull();
  });
});
