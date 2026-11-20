import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { YAZAN, sunucuKur, yeniEkranAc } from '../test-ortak.tsx';

beforeEach(() => { localStorage.clear(); window.scrollTo = vi.fn(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const adim = (ad: RegExp) => { fireEvent.click(within(screen.getByRole('navigation', { name: 'Adımlar' })).getByRole('button', { name: ad })); };
const dugme = (bas: string) => screen.getAllByRole('button').find((b) => b.textContent?.trim().startsWith(bas))!;
const ozet = async () => {
  adim(/Kondisyon, üretim, yüzey/);
  const bolum = (await screen.findByRole('heading', { name: 'Standartlar', level: 4 })).closest('section')!;
  const deger = (ad: string) => within(bolum).getByText(ad, { selector: 'dt' }).nextElementSibling?.textContent;
  return { kim: deger('Kimyasal kompozisyon'), mek: deger('Mekanik dayanım') };
};

describe('3436 boş yeni kartta standartlar', () => {
  test('sınıf, kalite ve form seçilince iki standart dolar; form değişince kendiliğinden seçilen mekanik standart değişir', async () => {
    sunucuKur(YAZAN);
    yeniEkranAc('/malzemeler/yeni');
    await screen.findByRole('heading', { name: 'Tür ve aile' });
    fireEvent.click(document.querySelector('[data-aile="metal"]')!);
    adim(/Kalite ve standart/);
    fireEvent.click(await screen.findByRole('button', { name: /^Alüminyum \(dövme \/ hadde\)/ }));
    fireEvent.click(dugme('EN AW-6082'));
    adim(/Form, ölçü, tolerans/);
    fireEvent.click(dugme('Yuvarlak çubuk'));
    expect(await ozet()).toEqual({ kim: 'EN 573-3', mek: 'EN 755-2' });
    adim(/Form, ölçü, tolerans/);
    fireEvent.click(dugme('Levha / sac'));
    expect(await ozet()).toEqual({ kim: 'EN 573-3', mek: 'EN 485-2' });
  });

  test('kalite değişince kendiliğinden seçilen standart kalitenin kendi standardına geçer (listenin ilki olmasa da)', async () => {
    sunucuKur(YAZAN);
    yeniEkranAc('/malzemeler/yeni');
    await screen.findByRole('heading', { name: 'Tür ve aile' });
    fireEvent.click(document.querySelector('[data-aile="metal"]')!);
    adim(/Kalite ve standart/);
    fireEvent.click(await screen.findByRole('button', { name: /^Islah, otomat/ }));
    fireEvent.click(dugme('C45'));
    adim(/Form, ölçü, tolerans/);
    fireEvent.click(dugme('Yuvarlak çubuk'));
    expect((await ozet()).kim).toBe('EN ISO 683-1');
    adim(/Kalite ve standart/);
    fireEvent.click(dugme('42CrMo4'));
    expect(await ozet()).toEqual({ kim: 'EN ISO 683-2', mek: 'EN ISO 683-2' });
  });

  test('"Uyumsuz seçimleri kaldır" forma uymayan elle seçilmiş mekanik standardı formun standardıyla değiştirir', async () => {
    sunucuKur(YAZAN);
    yeniEkranAc('/malzemeler/yeni?kopya=mornek1');
    await screen.findAllByRole('heading', { name: /Form, ölçü, tolerans|Özet ve kayıt/ });
    adim(/Kondisyon, üretim, yüzey/);
    const bolum = (await screen.findByRole('heading', { name: 'Standartlar', level: 4 })).closest('section')!;
    fireEvent.click(within(bolum).getByRole('button', { name: 'Değiştir' }));
    fireEvent.click(within(await screen.findByRole('radiogroup', { name: 'Mekanik dayanım' })).getByRole('radio', { name: 'EN 10277' }));
    adim(/Form, ölçü, tolerans/);
    fireEvent.click(dugme('Levha / sac'));
    adim(/Kondisyon, üretim, yüzey/);
    fireEvent.click(await screen.findByRole('button', { name: 'Uyumsuz seçimleri kaldır' }));
    expect((await ozet()).mek).toBe('EN ISO 683-1');
  });
});
