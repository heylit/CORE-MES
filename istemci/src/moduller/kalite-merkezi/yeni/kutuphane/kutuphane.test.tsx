import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { kayitYazmalari, kmAc, MUAYENECI, MUHENDIS, OKUYAN, YONETICI, type TestKullanicisi } from '../test-ortak.tsx';
import { TEKNIK_KUTUPHANE } from './teklib.ts';

// Bayrak yazıları sentetiktir.
const BAYRAK = { _id: 'b1', metin: 'DNM1', sekil: 'altıgen', anlam: 'Deneme anlamı', sinif: 'Kritik', ozel: 'KC', kanal: '' };
const ac = (k: TestKullanicisi, bayrak = [BAYRAK]) => kmAc('kutuphane', k, { bayrak });
const satir = () => screen.findByRole('row', { name: /DNM1/ });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('Teknik kütüphane', () => {
  it('bayrakları ve sabit bölümleri gösterir; boş kanal "otomatik" yazılır', async () => {
    ac(OKUYAN);
    expect(within(await satir()).getByText('otomatik')).toBeTruthy();
    for (const b of TEKNIK_KUTUPHANE) expect(screen.getByRole('heading', { name: b.baslik })).toBeTruthy();
    expect(screen.getByText('Düzlemsellik')).toBeTruthy();
  });

  it('bayrak yoksa açıklama yazılır', async () => {
    ac(YONETICI, []);
    expect(await screen.findByText(/Henüz tanımlı bayrak yok/)).toBeTruthy();
  });

  it('silme yöneticide ve mühendiste (260 a: bayrak silme onayla ile de) görünür; muayeneci ve okuyan görmez', async () => {
    for (const [k, gorur] of [[YONETICI, true], [MUHENDIS, true], [MUAYENECI, false], [OKUYAN, false]] as const) {
      ac(k);
      expect(within(await satir()).queryByRole('button', { name: 'Sil' }) !== null).toBe(gorur);
      cleanup();
      vi.unstubAllGlobals();
    }
  });

  it('tanımlama ve düzenleme yazabilene görünür; okuyan görmez', async () => {
    ac(MUAYENECI);
    expect(within(await satir()).getByRole('button', { name: 'Düzenle' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Bayrak tanımla' })).toBeTruthy();
    cleanup();
    vi.unstubAllGlobals();
    ac(OKUYAN);
    expect(within(await satir()).queryByRole('button', { name: 'Düzenle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Bayrak tanımla' })).toBeNull();
  });

  it('düzenleme eski alanları koruyarak aynı kimlikle yazar', async () => {
    const s = ac(MUAYENECI);
    fireEvent.click(within(await satir()).getByRole('button', { name: 'Düzenle' }));
    const pencere = await screen.findByRole('dialog', { name: 'Bayrağı düzenle' });
    fireEvent.change(within(pencere).getByLabelText(/Anlamı/), { target: { value: 'Yeni anlam' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(kayitYazmalari(s.yazmalar, 'bayrak')).toHaveLength(1); });
    const y = kayitYazmalari(s.yazmalar, 'bayrak')[0];
    expect(y?.yol).toContain('/kayitlar/bayrak/b1/');
    expect(y?.govde).toMatchObject({ govde: { metin: 'DNM1', anlam: 'Yeni anlam', sekil: 'altıgen', ozel: 'KC' } });
  });

  it('yeni bayrakta yazı zorunludur', async () => {
    const s = ac(MUAYENECI, []);
    fireEvent.click(await screen.findByRole('button', { name: 'Bayrak tanımla' }));
    const pencere = await screen.findByRole('dialog', { name: 'Bayrak tanımla' });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('"Bayrak yazısı" alanını doldurun.')).toBeTruthy();
    expect(kayitYazmalari(s.yazmalar, 'bayrak')).toEqual([]);
  });

  it('silme komutu bayrağın kimliğiyle gider', async () => {
    const s = ac(YONETICI);
    fireEvent.click(within(await satir()).getByRole('button', { name: 'Sil' }));
    await waitFor(() => { expect(s.yazmalar.some((y) => y.yol.includes('/kayitlar/bayrak/b1/sil'))).toBe(true); });
  });
});
