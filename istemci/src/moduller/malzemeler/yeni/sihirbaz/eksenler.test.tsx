import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { ORNEK_KARTLAR, ornekKayit } from '../ornek-veri.ts';
import { YAZAN, json, sunucuKur, yeniEkranAc } from '../test-ortak.tsx';

beforeEach(() => { localStorage.clear(); window.scrollTo = vi.fn(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const adimlar = () => within(screen.getByRole('navigation', { name: 'Adımlar' }));
const ac = async () => {
  sunucuKur(YAZAN);
  yeniEkranAc('/malzemeler/yeni?kopya=mornek1');
  await screen.findAllByRole('heading', { name: /Form, ölçü, tolerans|Özet ve kayıt/ });
};

describe('3476 a: hammadde kartı eksen düzeni', () => {
  test('adımlar eksen adlarıyla; şerit açılınca eksenler numaralı, boş eksen "Eksik" yazar', async () => {
    await ac();
    for (const ad of ['Kalite ve standart', 'Form, ölçü, tolerans', 'Kondisyon, üretim, yüzey', 'Ticari ve sertifika']) expect(adimlar().getByRole('button', { name: new RegExp(ad) })).toBeTruthy();
    const serit = screen.getByRole('region', { name: 'Kartın eksenleri' });
    fireEvent.click(within(serit).getByRole('button', { expanded: false }));
    expect(serit.textContent).toMatch(/1 Kimyasal \/ kalite\s*C45/);
    expect(within(serit).getAllByText('Eksik').length).toBeGreaterThan(0);
  });

  test('durum adımı Kondisyon, Üretim ve iç yapı, Yüzey ve kaplama bölümlerine ayrılır; kesim form adımında, ambalaj ticari adımda', async () => {
    await ac();
    fireEvent.click(adimlar().getByRole('button', { name: /Kondisyon, üretim, yüzey/ }));
    for (const ad of ['Kondisyon', 'Üretim ve iç yapı', 'Yüzey ve kaplama']) expect(await screen.findByRole('region', { name: ad })).toBeTruthy();
    expect(screen.queryAllByText('Kesim ve şekillendirme')).toHaveLength(0);
    expect(screen.queryAllByText('Ambalaj')).toHaveLength(0);
    fireEvent.click(adimlar().getByRole('button', { name: /Form, ölçü, tolerans/ }));
    expect((await screen.findAllByText('Kesim ve şekillendirme')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Ölçü standardı').length).toBeGreaterThan(0);
    fireEvent.click(adimlar().getByRole('button', { name: /Ticari ve sertifika/ }));
    expect((await screen.findAllByText('Ambalaj')).length).toBeGreaterThan(0);
  });

  test('kompozitte bölüme yazılmayan seçenekler "Diğer seçimler"de kalır; hiçbir seçenek kaybolmaz', async () => {
    const k = { ...ornekKayit('mkmp1', 'HM-KMP-0001', 'Örnek CFRP levha'), fam: 'kompozit', cls: 'karbon', grade: 'UD', form: 'levha', dims: { t: 2, w: 500, l: 1000 } };
    sunucuKur(YAZAN, { 'GET /malzeme-katalogu-kartlari': () => json(200, { ...ORNEK_KARTLAR, satirlar: [...ORNEK_KARTLAR.satirlar, { kimlik: 'mkmp1', no: 90, kayit: k, surum: 1 }], toplam: ORNEK_KARTLAR.satirlar.length + 1 }) });
    yeniEkranAc('/malzemeler/yeni?kopya=mkmp1');
    await screen.findAllByRole('heading', { name: /Form, ölçü, tolerans|Özet ve kayıt/ });
    fireEvent.click(adimlar().getByRole('button', { name: /Kondisyon, üretim, yüzey/ }));
    const diger = await screen.findByRole('region', { name: 'Diğer seçimler' });
    for (const ad of ['Reçine (matris)', 'Elyaf yapısı', 'Katman dizilimi']) expect(within(diger).getAllByText(ad).length).toBeGreaterThan(0);
  });

  test('föyün başında tam teknik tanım satırı kaliteyi ve eşdeğerini yazar', async () => {
    await ac();
    const tanim = screen.getByText('Tam teknik tanım').parentElement!;
    expect(tanim.textContent).toMatch(/Malzeme:\s*C45 \(AISI\/SAE 1045\)/);
  });
});
