import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, OKUYAN, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// 3248: ürün ve rotalar yatay hatla açılır. Üstte süre şeridi, ortada soldan sağa hat (dal kendi şeridinde), altta seçilen öğenin
// düzenleme alanı tam genişlikte. Veriler uydurmadır.
const bolumAc = async (duzenle = true) => {
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  await waitFor(() => { expect(bolge.querySelector('.tc-rr1-hatli')).not.toBeNull(); });
  const d = within(bolge).queryByRole('button', { name: 'Düzenle' });
  if (duzenle && d) fireEvent.click(d);
  return bolge;
};
const dalli = () => [
  adimOrnegi(),
  adimOrnegi({ id: 'o20', seq: 20, opNo: 20, ins: [] }),
  adimOrnegi({ id: 'o30', seq: 30, opNo: 30, ins: [], dal: 'A' }),
  adimOrnegi({ id: 'o40', seq: 40, opNo: 40, ins: [] }),
  adimOrnegi({ id: 'o50', seq: 50, opNo: 50, ins: [], birlesen: ['A'] }),
];
const kur = (adimlar = dalli()) => {
  const k: { govde: unknown } = { govde: null };
  sunucuKur(YONETICI, {
    durum: rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3), revizyonOrnegi('72', 'B', 'taslak', 4, adimlar)]),
    yazmalar: { 'POST /rota/revizyonlar/72/kaydet': (g) => { k.govde = g; return json(200, { id: 72, durum: 'taslak', surum: 5 }); } },
  });
  return k;
};

describe('3248 yatay hat ekranı', () => {
  it('açılış yatay hattır: süre şeridi, hat ve düzenleme alanı birlikte; eski dikey şema düğmeyle açılır', async () => {
    kur();
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc(false);
    expect(within(bolge).getByRole('button', { name: /Yatay hat/ }).getAttribute('aria-pressed')).toBe('true');
    const serit = within(bolge).getByRole('region', { name: 'Süre şeridi' });
    expect(within(serit).getByText('Ana hat')).toBeTruthy();
    expect(within(serit).getByText('Dal A')).toBeTruthy();
    expect(within(bolge).getByRole('group', { name: 'Yatay hat' })).toBeTruthy();
    // Düzenleme alanı çekmece değildir: seçim yokken de görünür, yan şerit ve Panel düğmesi yoktur.
    expect(within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' }).className).toContain('tc-rr1-insp');
    expect(within(bolge).queryByRole('button', { name: 'Düzenleme paneli' })).toBeNull();
    fireEvent.click(within(bolge).getByRole('button', { name: /Akış şeması/ }));
    await waitFor(() => { expect(bolge.querySelector('.tc-rr1-rcol')).not.toBeNull(); });
    expect(localStorage.getItem('tc-rr1-gorunum')).toBe('dikey');
  }, 30000);

  it('adıma dokununca alttaki alan o adımı gösterir; süre şeridindeki çubuk da aynı adımı seçer', async () => {
    kur();
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const hat = within(bolge).getByRole('group', { name: 'Yatay hat' });
    fireEvent.click(within(hat).getByRole('button', { name: 'OP 20 Tornalama' }));
    const panel = within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
    expect(panel.textContent).toContain('OP 20');
    expect(within(hat).getByRole('button', { name: 'OP 20 Tornalama' }).getAttribute('aria-pressed')).toBe('true');
    const serit = within(bolge).getByRole('region', { name: 'Süre şeridi' });
    fireEvent.click(within(serit).getByRole('button', { name: /^OP 40 Tornalama/ }));
    expect(within(hat).getByRole('button', { name: 'OP 40 Tornalama' }).getAttribute('aria-pressed')).toBe('true');
  }, 30000);

  it('dalın ilk adımı dal etiketini taşır; adımın ardındaki + paleti o adımın ardına açar', async () => {
    kur();
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc();
    const hat = within(bolge).getByRole('group', { name: 'Yatay hat' });
    expect(within(hat).getByText(/Dal A · 1 adet \/ mamul/)).toBeTruthy();
    fireEvent.click(within(hat).getByRole('button', { name: 'OP 20 ardına adım ekle' }));
    const palet = await within(bolge).findByRole('complementary', { name: 'Operasyon paleti' });
    expect(palet.textContent).toContain('OP 20 Tornalama ardına');
  }, 30000);

  it('yalnız okuyan kişide ekleme düğmeleri yoktur, bağlılık değiştirilemez', async () => {
    sunucuKur(OKUYAN, { durum: rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3, dalli())]) });
    rrAc('/recete-rota/schema');
    const bolge = await bolumAc(false);
    const hat = within(bolge).getByRole('group', { name: 'Yatay hat' });
    expect(within(hat).queryByRole('button', { name: /ardına adım ekle/ })).toBeNull();
    expect(within(hat).queryByRole('button', { name: /Giren/ })).toBeNull();
    for (const b of hat.querySelectorAll('.tc-rr1-deppill')) expect((b as HTMLButtonElement).disabled).toBe(true);
  }, 30000);
});
