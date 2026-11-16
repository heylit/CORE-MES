import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { MALIYETSIZ, YONETICI, ac, sunucuKur } from '../../test-ortak.tsx';
import { PLANLAMA_ANAHTARI } from '../../veri.ts';
import { altEkranAdresi, eskiEkranAdresi } from '../../gorunumler.ts';
import { CALISMA_DEGERI } from './test-veri.tsx';

// Veri ve kısıtlar'ın ekrana bağlanışı (3308-2 a): Planlama'nın ikinci menüsünde ayrı sayfadır; bölüm adresin sorgusundadır (`veri?bolum=`).
// Motor'un eski iç ekran adresleri yeni yerine yönlenir.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const KAYIT = [{ anahtar: PLANLAMA_ANAHTARI, bicim: 'json' as const, deger: CALISMA_DEGERI, surum: 4 }];
const veri = () => document.querySelector('[data-parca="veri"]');

async function veriyeGir(k: Kullanici, adres = '/plan/veri') {
  sunucuKur(k, KAYIT);
  ac(adres);
  await waitFor(() => { expect(veri()).not.toBeNull(); }, { timeout: 10000 });
}

describe('Veri ve kısıtlar ekranı', () => {
  it('adres: Veri ayrı sayfadır, bölüm sorgudadır; eski iç ekran adresleri yeni yerine yönlenir, kalkan ekranlar Motor\'a', () => {
    expect(altEkranAdresi({ ekran: 'veri', bolum: 'kisitlar' })).toBe('/plan/veri?bolum=kisitlar');
    expect(altEkranAdresi({ ekran: 'veri', bolum: null })).toBe('/plan/veri');
    expect(altEkranAdresi({ ekran: 'tahta', bolum: 'x' })).toBe('/plan/plan');
    expect(eskiEkranAdresi(new URLSearchParams('ekran=veri&bolum=denetim'))).toBe('/plan/veri?bolum=denetim');
    expect(eskiEkranAdresi(new URLSearchParams('ekran=gecmis'))).toBe('/plan/veri?bolum=defter');
    expect(eskiEkranAdresi(new URLSearchParams('ekran=bugun'))).toBe('/plan/plan');
    expect(eskiEkranAdresi(new URLSearchParams('ekran=yok&bolum=denetim'))).toBeNull();
    expect(eskiEkranAdresi(new URLSearchParams(''))).toBeNull();
  });

  it('sayfa açılır; bölüm adresi izler', async () => {
    await veriyeGir(YONETICI);
    expect(veri()?.getAttribute('data-bolum')).toBe('siparisler');
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Veri ve kısıtlar' })).getByRole('button', { name: /^Kısıtlar/ }));
    await waitFor(() => { expect(veri()?.getAttribute('data-bolum')).toBe('kisitlar'); });
    expect(screen.getByTestId('adres').textContent).toBe('/plan/veri');
  }, 30000);

  it('bölümlü adresle doğrudan açılır; eski adres de aynı bölüme gelir', async () => {
    await veriyeGir(YONETICI, '/plan/veri?bolum=denetim');
    expect(veri()?.getAttribute('data-bolum')).toBe('denetim');
    cleanup(); vi.unstubAllGlobals();
    await veriyeGir(YONETICI, '/plan?ekran=veri&bolum=denetim');
    expect(veri()?.getAttribute('data-bolum')).toBe('denetim');
    expect(document.querySelector('[data-gorunum]')?.getAttribute('data-gorunum')).toBe('veri');
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
});
