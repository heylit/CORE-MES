import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import type { DefterFarklariCevabi, IsKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { ac, json, sunucuKur } from './test-ortak.tsx';
import { isler } from './IsKutusu.tsx';

// Gece defter karşılaştırması (1692 a).
const DENETCI: Kullanici = { id: 7, ad: 'Deneme Müdür', islemler: ['sayfa.stok', 'stok.eksi-onayla'] };
const LISTE: DefterFarklariCevabi = {
  karsilastirma: { id: 3, zaman: '2026-11-01T02:05:00+03:00', farkSayisi: 1 },
  farklar: [{ malzemeId: 921, malzemeAd: 'Deneme flanş', konumId: 41, konumKod: 'A-01-1', partiId: 77, lotNo: 'LOT-DENEME-77', statuId: null, kaliteDurumu: 'serbest', bakiye: '4.000', defter: '1.500' }],
};
const KUTU: IsKutusuCevabi = { kabuldeBekleyen: 0, eksiBakiye: 0, kritik: 0, sayimBekleyen: null, logoFarki: 0, logoHatasi: 0, fasondaEksik: 0, fasonEksikGonderimi: 0 };

describe('Defter farkları (1692 a)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('son karşılaştırmanın farkını bakiye, defter ve farkla listeler', async () => {
    sunucuKur(DENETCI, { 'GET /stok/defter-farklari': () => json(200, LISTE) });
    ac('/stok/defter-farklari');
    const tablo = await screen.findByRole('table', { name: 'Bakiye ve defter farkları' });
    expect(tablo.closest('.tc-tablo-kap')?.hasAttribute('data-kaydir')).toBe(true);
    expect(within(tablo).getByRole('columnheader', { name: 'Konum' }).classList.contains('tc-tablo-sabit-sol')).toBe(true);
    expect(within(tablo).getByRole('columnheader', { name: 'Parti' })).toBeTruthy();
    expect(within(tablo).getByText('Deneme flanş')).toBeTruthy();
    expect(within(tablo).getByText('+2,5')).toBeTruthy();
    expect(screen.getByText('1 eksende fark var')).toBeTruthy();
  });

  it('karşılaştırma yoksa sıfır uydurmaz, ilk turun gece yapılacağını söyler', async () => {
    sunucuKur(DENETCI, { 'GET /stok/defter-farklari': () => json(200, { karsilastirma: null, farklar: [] }) });
    ac('/stok/defter-farklari');
    expect(await screen.findByText('Henüz karşılaştırma yapılmadı')).toBeTruthy();
    expect(screen.getByText('İlk karşılaştırma gece yapılacak.')).toBeTruthy();
  });

  it('iş kutusu farkı düzeltilecek iş olarak öne alır; fark yoksa ya da yetki yoksa satır yok', () => {
    const l = isler({ ...KUTU, kritik: 2, defterFarki: 3 });
    expect(l[0]).toMatchObject({ ton: 'hata', yol: '/stok/defter-farklari' });
    expect(isler({ ...KUTU, defterFarki: 0 }).some((i) => i.yol === '/stok/defter-farklari')).toBe(false);
    expect(isler({ ...KUTU, defterFarki: null }).some((i) => i.yol === '/stok/defter-farklari')).toBe(false);
  });
});
