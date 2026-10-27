import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, rrAc, sunucuKur, YONETICI, type Istek } from '../test-ortak.tsx';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// 823 b (test raporu RR1, RR2): aynı giren bir adıma iki kez eklenmez; ara kartın birimi adettir. Veriler uydurmadır.
const BEKLE = { timeout: 4000 };
const kayitlar = (istekler: readonly Istek[]) => istekler.filter((i) => i.yontem === 'POST' && i.yol === '/rota/revizyonlar/72/kaydet');

function durum(steps = [adimOrnegi()]) {
  const d = rotaDurumu([revizyonOrnegi('72', 'B', 'taslak', 4, steps)]);
  return {
    ...d,
    items: [...(d.items ?? []), { id: '13', kayitNo: 13, code: 'HM-0013', name: 'Örnek boru', type: 'ham' as const, unit: 'kg', cost: null, stock: null, min: null,
      aktif: true, kategori: null, kategoriAdi: null, girdiOlabilir: true }],
  };
}
const kur = (d = durum()) => sunucuKur(YONETICI, {
  durum: d,
  yazmalar: { 'POST /rota/revizyonlar/72/kaydet': () => json(200, { id: 72, durum: 'taslak', surum: 5 }) },
});
const adimPaneli = async () => {
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  fireEvent.click(await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' }));
  return { bolge, panel: within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' }) };
};
const hizliEkle = async (panel: HTMLElement, kod: string) => {
  const ara = within(panel).getByLabelText('Giren malzeme');
  // Panelde yan ürün için ikinci hızlı ekleme kutusu da var; yalnız giren kutusunda aranır.
  const kutu = (ara.closest('.tc-rr1-qadd') ?? panel) as HTMLElement;
  fireEvent.focus(ara);
  fireEvent.change(ara, { target: { value: kod } });
  fireEvent.click(await within(kutu).findByRole('option', { name: new RegExp(kod) }));
  fireEvent.click(within(kutu).getByRole('button', { name: 'Ekle' }));
};

describe('823 Aynı giren bir adıma iki kez eklenmez', () => {
  it('izinli: başka malzeme giren olarak eklenir ve rota modülüne kaydedilir', async () => {
    const istekler = kur();
    rrAc('/recete-rota/schema');
    const { panel } = await adimPaneli();
    await hizliEkle(panel, 'HM-0013');
    await within(panel).findByText('Girenler (2)');
    await waitFor(() => { expect(kayitlar(istekler)).toHaveLength(1); }, BEKLE);
    expect(kayitlar(istekler)[0]?.govde).toMatchObject({ adimlar: [{ bilesenler: [{ malzemeId: 12 }, { malzemeId: 13 }] }] });
  });

  it('reddedilen: aynı malzeme ikinci kez eklenmez, var olan giren seçilir, neden söylenir, kayıt gitmez', async () => {
    const istekler = kur();
    rrAc('/recete-rota/schema');
    const { panel } = await adimPaneli();
    await hizliEkle(panel, 'HM-0012');
    await screen.findByText(/HM-0012 bu adımda zaten giren/);
    // Panel var olan girenin kalemine geçer: miktar alanı orada düzenlenir.
    await within(panel).findByText('HM-0012', { selector: 'b, h3, dd, span' });
    expect(within(panel).queryByText('Girenler (2)')).toBeNull();
    await new Promise((r) => { setTimeout(r, 1000); });
    expect(kayitlar(istekler)).toEqual([]);
  });

  it('reddedilen: listeden eklemede de engellenir', async () => {
    const istekler = kur();
    rrAc('/recete-rota/schema');
    const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
    fireEvent.click(await within(bolge).findByRole('button', { name: /Giren$/ }));
    const panel = within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
    fireEvent.click(await within(panel).findByRole('option', { name: /HM-0012/ }));
    await screen.findByText(/HM-0012 bu adımda zaten giren/);
    await new Promise((r) => { setTimeout(r, 1000); });
    expect(kayitlar(istekler)).toEqual([]);
  });
});

describe('823 Ara kartın birimi adettir', () => {
  it('ilk adımın ara kartı hammaddenin statülü kartıdır ama adetle yazılır; hammadde girenin birimi kg kalır', async () => {
    kur(durum([adimOrnegi(), adimOrnegi({ id: 'o20', seq: 20, opNo: 20, ins: [] })]));
    rrAc('/recete-rota/schema');
    const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
    await within(bolge).findByRole('button', { name: 'OP 20 Tornalama' });
    const birim = (k: Element | null) => k?.querySelector('.tc-rr1-cq small')?.textContent;
    const ara = [...bolge.querySelectorAll('.tc-rr1-cip-arahal')];
    expect(ara.length).toBeGreaterThan(0);
    expect(ara.map(birim)).toEqual(ara.map(() => 'adet'));
    const giren = [...bolge.querySelectorAll('.tc-rr1-cip-giren')].find((e) => e.textContent.includes('HM-0012'));
    expect(birim(giren ?? null)).toBe('kg');
  });
});
