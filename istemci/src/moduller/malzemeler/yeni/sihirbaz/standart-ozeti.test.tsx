import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { YAZAN, sunucuKur, yeniEkranAc } from '../test-ortak.tsx';

beforeEach(() => { localStorage.clear(); window.scrollTo = vi.fn(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const durumAdimi = async (sorgu: string) => {
  yeniEkranAc(`/malzemeler/yeni${sorgu}`);
  await screen.findAllByRole('heading', { name: /Form ve ölçüler|Özet ve kayıt/ });
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Adımlar' })).getByRole('button', { name: /Durum ve işlem/ }));
  return (await screen.findByRole('heading', { name: 'Standartlar', level: 4 })).closest('section')!;
};
const deger = (bolum: HTMLElement, ad: string) => within(bolum).getByText(ad, { selector: 'dt' }).nextElementSibling?.textContent;

describe('3436 Durum ve işlem adımı: standartlar', () => {
  test('yeni kartta (kopya) kimyasal ve mekanik standart sınıf, kalite ve forma göre seçilir; eski EN 10083-2 adı yeni adıyla', async () => {
    sunucuKur(YAZAN);
    const bolum = await durumAdimi('?kopya=mornek1');
    expect(deger(bolum, 'Kimyasal kompozisyon')).toBe('EN ISO 683-1');
    expect(deger(bolum, 'Mekanik dayanım')).toBe('EN ISO 683-1');
  });

  test('"Değiştir" iki listeyi açar; mekanik listede yalnız çubuğa uyan standartlar görünür', async () => {
    sunucuKur(YAZAN);
    const bolum = await durumAdimi('?kopya=mornek1');
    fireEvent.click(within(bolum).getByRole('button', { name: 'Değiştir' }));
    const mek = await screen.findByRole('radiogroup', { name: 'Mekanik dayanım' });
    expect(within(mek).getByRole('radio', { name: 'EN 10277' })).toBeTruthy();
    expect(within(mek).queryByRole('radio', { name: 'EN 10297-1' })).toBeNull();
    fireEvent.click(within(mek).getByRole('radio', { name: 'EN 10277' }));
    expect(within(mek).getByRole('radio', { name: 'EN 10277' }).getAttribute('aria-checked')).toBe('true');
  });

  test('kayıtlı kart açılınca standart kendiliğinden yazılmaz (değişiklik talebi doğmaz)', async () => {
    sunucuKur(YAZAN);
    const bolum = await durumAdimi('?kart=mornek1');
    expect(deger(bolum, 'Kimyasal kompozisyon')).toBe('—');
    expect(deger(bolum, 'Mekanik dayanım')).toBe('—');
  });
});
