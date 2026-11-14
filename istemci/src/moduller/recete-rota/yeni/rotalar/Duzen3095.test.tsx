import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { json, rrAc, sunucuKur, YONETICI } from '../test-ortak.tsx';
import { adimOrnegi, revizyonOrnegi, rotaDurumu } from './test-veri.ts';
import { kalanBoyHesapla } from './kalanBoy.ts';
// 3248: açılış yatay hattır; bu dosya dikey akış şemasını ("Akış şeması") sınar.
beforeEach(() => { try { localStorage.setItem('tc-rr1-gorunum', 'dikey'); } catch { /* test ortamında depo yoksa */ } });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

const bolumAc = async () => {
  sunucuKur(YONETICI, { durum: () => json(200, rotaDurumu([revizyonOrnegi('71', 'A', 'yururlukte', 3, [adimOrnegi()])])) });
  rrAc('/recete-rota/schema');
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  await waitFor(() => { expect(bolge.querySelector('.tc-rr1-rcol, .tc-rr1-ftab')).not.toBeNull(); });
  return bolge;
};

describe('Düzenle düğmesinin yeri ve gövde boyu (3095)', () => {
  it('Düzenle, Palet ve Panel revizyon satırında, revizyonun yanında; üst çubukta değil', async () => {
    const bolge = await bolumAc();
    const ust = bolge.querySelector('.tc-rr1-top') as HTMLElement;
    const rev = bolge.querySelector('.tc-rr1-revbar') as HTMLElement;
    expect(within(ust).queryByRole('button', { name: 'Düzenle' })).toBeNull();
    const grup = within(rev).getByRole('group', { name: 'Rota düzenleme' });
    fireEvent.click(within(grup).getByRole('button', { name: 'Düzenle' }));
    expect(within(grup).getByRole('button', { name: 'Düzenlemeyi bitir' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(grup).getByRole('button', { name: 'Operasyon paleti' })).toBeTruthy();
    expect(within(ust).queryByRole('button', { name: 'Operasyon paleti' })).toBeNull();
    // Kart 3095 b: Panel de aynı satırda.
    expect(within(grup).getByRole('button', { name: 'Düzenleme paneli' })).toBeTruthy();
    expect(within(ust).queryByRole('button', { name: 'Düzenleme paneli' })).toBeNull();
  });

  it('akış tablosunda da Düzenle revizyon satırındadır', async () => {
    const bolge = await bolumAc();
    fireEvent.click(within(bolge).getByRole('button', { name: /Akış tablosu/ }));
    const rev = bolge.querySelector('.tc-rr1-revbar') as HTMLElement;
    expect(within(rev).getByRole('button', { name: 'Düzenle' })).toBeTruthy();
  });

  it('kalan boy: kabın görünen boyundan gövde dışındaki içerik düşülür', () => {
    // Kap 750 görünür, içerik 900 (gövde 630): gövde dışı 270, kalan 480.
    expect(kalanBoyHesapla(750, 900, 630)).toBe(480);
    // İçerik kısa (gövde 300, içerik 500): gövde büyüyebilir, kalan 550.
    expect(kalanBoyHesapla(750, 500, 300)).toBe(550);
    // Tam sığmış gövde aynı boyda kalır: ikinci ölçüm döngü yaratmaz.
    expect(kalanBoyHesapla(750, 750, 480)).toBe(480);
  });
});
