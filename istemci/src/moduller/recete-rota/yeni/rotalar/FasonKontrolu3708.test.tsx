import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { fasonKontrolSorunlari, fasonaCevir, kaydetGovdesi, yeniAdim, type Adim, type Operasyon } from './kurallar.ts';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';

beforeEach(() => { try { localStorage.setItem('tc-rr1-gorunum', 'dikey'); } catch { /* test ortamında depo yoksa */ } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* depo kapalı */ } });

// 3708: fason adımın kontrol türü rotada seçilir. Veri uydurmadır.
const op = { id: '21', code: 'TOR', name: 'Tornalama', stationId: '31', setup: 30, cycle: 5 } as unknown as Operasyon;
const adim = (ek: Partial<Adim> = {}): Adim => ({ ...yeniAdim(op, 'a'), seq: 10, opNo: 10, ...ek });
const fason = (ek: Partial<Adim> = {}): Adim => ({ ...fasonaCevir(adim(), '7', op, true), ...ek });

describe('3708 fason kontrol kuralları', () => {
  it('kaydet gövdesi kontrol türünü taşır; fason olmayan adımda GKK, muayene süresi yalnız kaynağında muayenede gider', () => {
    expect(kaydetGovdesi([fason({ kontrolTuru: 'kaynakta', muayeneSuresiSaat: 2 })], [10], () => op)[0]).toMatchObject({ kontrolTuru: 'kaynakta', muayeneSuresiSaat: 2 });
    expect(kaydetGovdesi([fason({ kontrolTuru: 'kontrolsuz', muayeneSuresiSaat: 2 })], [10], () => op)[0]).toMatchObject({ kontrolTuru: 'kontrolsuz', muayeneSuresiSaat: null });
    expect(kaydetGovdesi([adim({ kontrolTuru: 'kontrolsuz' })], [10], () => op)[0]).toMatchObject({ kontrolTuru: 'gkk', muayeneSuresiSaat: null });
    expect(kaydetGovdesi([fason()], [10], () => op)[0]).toMatchObject({ kontrolTuru: 'gkk' });
  });

  it('iç üretime dönen adımın kontrolü GKK olur', () => {
    expect(fasonaCevir(fason({ kontrolTuru: 'kaynakta', muayeneSuresiSaat: 3 }), null, op)).toMatchObject({ kontrolTuru: 'gkk', muayeneSuresiSaat: null });
  });

  it('uyarılar: süre boşsa "süre yok", kontrolsüzde sonraki adım fason değilse GKK\'ya döndü', () => {
    expect(fasonKontrolSorunlari(fason({ kontrolTuru: 'kaynakta' }), undefined)).toEqual(['muayene süresi yok']);
    expect(fasonKontrolSorunlari(fason({ kontrolTuru: 'kaynakta', muayeneSuresiSaat: 2 }), undefined)).toEqual([]);
    expect(fasonKontrolSorunlari(fason({ kontrolTuru: 'kontrolsuz' }), adim())).toEqual(['kontrol GKK\'ya döndü: sonraki adım fason değil']);
    expect(fasonKontrolSorunlari(fason({ kontrolTuru: 'kontrolsuz' }), fason())).toEqual([]);
    expect(fasonKontrolSorunlari(adim({ kontrolTuru: 'kontrolsuz' }), undefined)).toEqual([]);
  });
});

const panelAc = async (sonraki: Parameters<typeof adimOrnegi>[0], ek: Parameters<typeof adimOrnegi>[0] = {}) => {
  sunucuKur(YONETICI, {
    durum: () => json(200, rotaDurumu([
      revizyonOrnegi('71', 'A', 'yururlukte', 3),
      revizyonOrnegi('72', 'B', 'taslak', 1, [adimOrnegi({ stationId: null, fason: true, fasonId: null, ...ek }), adimOrnegi({ id: 'o20', seq: 20, opNo: 20, ins: [], ...sonraki })]),
    ])),
  });
  rrAc('/recete-rota/schema');
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  await waitFor(() => { expect(bolge.querySelector('.tc-rr1-rcol, .tc-rr1-emptycv, .tc-rr1-ftab')).not.toBeNull(); });
  const duzenle = within(bolge).queryByRole('button', { name: 'Düzenle' });
  if (duzenle) fireEvent.click(duzenle);
  fireEvent.click(await within(bolge).findByRole('button', { name: 'OP 10 Tornalama' }));
  fireEvent.click(within(bolge).getByRole('button', { name: 'Düzenleme panelini aç: OP 10 Tornalama' }));
  return within(bolge).getByRole('complementary', { name: 'Düzenleme paneli' });
};

describe('3708 düzenleme paneli', () => {
  it('sonraki adım fason değilken kontrolsüz kapalıdır (aria-disabled) ve nedeni yazılıdır; GKK seçilidir', async () => {
    const panel = await panelAc({});
    const grup = await within(panel).findByRole('radiogroup', { name: 'Kontrol' });
    const kontrolsuz = within(grup).getByRole('radio', { name: /Kontrolsüz/ });
    expect(kontrolsuz.getAttribute('aria-disabled')).toBe('true');
    expect(within(kontrolsuz).getByText(/yalnız sonraki adım da fason ise/)).toBeTruthy();
    expect(within(grup).getByRole('radio', { name: /GKK/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(kontrolsuz);
    expect(within(grup).getByRole('radio', { name: /GKK/ }).getAttribute('aria-checked')).toBe('true');
  });

  it('kaynağında muayene seçilince süre alanı açılır, boşken uyarı yazılır; sonraki adım fasonsa kontrolsüz seçilebilir', async () => {
    const panel = await panelAc({ stationId: null, fason: true, fasonId: null });
    const grup = await within(panel).findByRole('radiogroup', { name: 'Kontrol' });
    expect(within(grup).getByRole('radio', { name: /Kontrolsüz/ }).getAttribute('aria-disabled')).toBe('false');
    fireEvent.click(within(grup).getByRole('radio', { name: /Kaynağında muayene/ }));
    await waitFor(() => expect(within(panel).getByText(/muayene süresi yok/)).toBeTruthy());
    expect(within(panel).getByLabelText('Muayene süresi (saat)')).toBeTruthy();
    fireEvent.click(within(grup).getByRole('radio', { name: /Kontrolsüz/ }));
    await waitFor(() => expect(within(grup).getByRole('radio', { name: /Kontrolsüz/ }).getAttribute('aria-checked')).toBe('true'));
    expect(within(panel).queryByLabelText('Muayene süresi (saat)')).toBeNull();
  });
});
