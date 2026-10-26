import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { eylemYapisi } from '../../motor/eylem.ts';
import { MALIYETSIZ, YONETICI, ac, sunucuKur } from '../../test-ortak.tsx';
import { PLANLAMA_ANAHTARI } from '../../veri.ts';
import { altEkranAdresi, altEkranOku } from '../../gorunumler.ts';
import { CALISMA_DEGERI, calismaKur } from './test-veri.tsx';

// Veri ve kısıtlar'ın ekrana bağlanışı (577b): motor sayfasının ekranıdır, adresin sorgusunda (`?ekran=veri&bolum=`). Plan çubuğunun Veri düğmesi,
// boş plan kartı ve karar eylemleri buraya gelir.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const KAYIT = [{ anahtar: PLANLAMA_ANAHTARI, bicim: 'json' as const, deger: CALISMA_DEGERI, surum: 4 }];
const veri = () => document.querySelector('[data-parca="veri"]');
const cubuk = () => screen.findByRole('toolbar', { name: 'Plan çubuğu' }, { timeout: 10000 });

async function veriyeGir(k: Kullanici, adres = '/recete-rota/planlama-yeni/plan') {
  sunucuKur(k, KAYIT);
  ac(adres);
  fireEvent.click(within(await cubuk()).getByRole('button', { name: 'Veri' }));
  await waitFor(() => { expect(veri()).not.toBeNull(); }, { timeout: 10000 });
}

describe('Veri ve kısıtlar ekranı', () => {
  it('adres: ekran ve bölüm sorgudan okunur, tahta sorgusuz plan adresidir; bilinmeyen ekran tahtadır', () => {
    expect(altEkranAdresi({ ekran: 'veri', bolum: 'kisitlar' })).toBe('/recete-rota/planlama-yeni/plan?ekran=veri&bolum=kisitlar');
    expect(altEkranAdresi({ ekran: 'tahta', bolum: 'x' })).toBe('/recete-rota/planlama-yeni/plan');
    expect(altEkranOku(new URLSearchParams('ekran=veri&bolum=denetim'))).toEqual({ ekran: 'veri', bolum: 'denetim' });
    expect(altEkranOku(new URLSearchParams('ekran=yok&bolum=denetim'))).toEqual({ ekran: 'tahta', bolum: null });
  });

  it('plan çubuğunun Veri düğmesi ekranı açar; bölüm adresi izler; Plan düğmesi tahtaya döner', async () => {
    await veriyeGir(YONETICI);
    expect(within(await cubuk()).getByRole('button', { name: 'Veri' }).getAttribute('aria-current')).toBe('page');
    expect(veri()?.getAttribute('data-bolum')).toBe('siparisler');
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Veri ve kısıtlar' })).getByRole('button', { name: /^Kısıtlar/ }));
    await waitFor(() => { expect(veri()?.getAttribute('data-bolum')).toBe('kisitlar'); });
    expect(screen.getByTestId('adres').textContent).toBe('/recete-rota/planlama-yeni/plan');
    fireEvent.click(within(await cubuk()).getByRole('button', { name: 'Plan' }));
    await waitFor(() => { expect(veri()).toBeNull(); });
    expect(within(await cubuk()).getByRole('button', { name: 'Veri' }).getAttribute('aria-current')).toBeNull();
  }, 30000);

  it('bölümlü adresle doğrudan açılır; öteki sayfaların çubuğundan da gelinir', async () => {
    sunucuKur(YONETICI, KAYIT);
    ac('/recete-rota/planlama-yeni/plan?ekran=veri&bolum=denetim');
    await waitFor(() => { expect(veri()?.getAttribute('data-bolum')).toBe('denetim'); }, { timeout: 10000 });
    cleanup(); vi.unstubAllGlobals();
    await veriyeGir(YONETICI, '/recete-rota/planlama-yeni/sevkiyat');
    expect(document.querySelector('[data-gorunum]')?.getAttribute('data-gorunum')).toBe('plan');
  }, 30000);

  it('her rolde aynı bölümler görünür; yazamayan ve maliyet görmeyen kişide yalnız yazma ve maliyet sütunları düşer', async () => {
    const bolumler = () => within(screen.getByRole('navigation', { name: 'Veri ve kısıtlar' })).getAllByRole('button').map((b) => b.textContent);
    await veriyeGir(YONETICI);
    const yonetici = bolumler();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Veri ve kısıtlar' })).getByRole('button', { name: /^Tezgâhlar/ }));
    await waitFor(() => { expect(screen.getByRole('columnheader', { name: /TL\/sa/ })).toBeTruthy(); });
    cleanup(); vi.unstubAllGlobals();
    await veriyeGir(MALIYETSIZ);
    expect(bolumler()).toEqual(yonetici);
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Veri ve kısıtlar' })).getByRole('button', { name: /^Tezgâhlar/ }));
    await waitFor(() => { expect(veri()?.getAttribute('data-bolum')).toBe('tezgahlar'); });
    expect(screen.queryByRole('columnheader', { name: /TL\/sa/ })).toBeNull();
  }, 30000);

  it('karar eyleminin "sayfaya git"i Veri ve kısıtlar bölümünü açar; bölüm değilse ya da ekran yoksa pasif', () => {
    const c = calismaKur(); const veriAc = vi.fn();
    const git = (v: string, a: ((b: string) => void) | null) => eylemYapisi({ ad: 'x', tur: 'git', v, birincil: false }, { c, komut: null, sipSec: vi.fn(), veriAc: a });
    git('denetim', veriAc).yap?.();
    expect(veriAc).toHaveBeenCalledWith('denetim');
    expect(git('matris', veriAc).yap).toBeNull();
    expect(git('kisitlar', null).yap).toBeNull();
  });
});
