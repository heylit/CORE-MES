import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { PartiIziCevabi, RefakatPartisi } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { DEPOCU, json, sunucuKur } from './test-ortak.tsx';
import { PartiIziPenceresi } from './PartiIzi.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const KART: RefakatPartisi = {
  id: 31, qr: 'RP:31', etiket: 'UE-000120-P1', uretimEmriId: 120, emirNo: 'UE-000120', sira: 1,
  malzemeId: 901, malzemeKod: 'HM-001', malzemeAd: 'Deneme sac', birim: 'kg',
  partiId: 12, lotNo: 'LT-000012', tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, lotaBaglanmaZamani: null,
  verilen: '10', durum: 'acik', surum: 1, kayitZamani: '2026-10-20T08:00:00+03:00', ust: null, birlestigi: null, birlesmeZamani: null,
};
const IZ = {
  parti: { id: 12, malzemeId: 901, malzemeAd: 'Deneme sac', lotNo: 'LT-000012', tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, uretimEmriId: null, kayitZamani: '2026-10-20T08:00:00+03:00', eldeki: '0' },
  hareketler: [], emirler: [120, 121], sevkler: [],
  kartlar: [
    KART,
    { ...KART, id: 32, qr: 'RP:32', etiket: 'UE-000121-P1', uretimEmriId: 121, emirNo: 'UE-000121', partiId: null, lotNo: null, verilen: '0', birlestigi: { id: 33, etiket: 'UE-000121-P2' } },
  ],
  ciktilar: [{ partiId: 40, lotNo: 'UP-000040', refakatPartisiId: 31, malzemeId: 950, malzemeKod: 'MM-001', malzemeAd: 'Deneme mamul', birim: 'adet', eldeki: '1' }],
  sevkCikislari: [{
    hareketId: 70, zaman: '2026-10-22T10:00:00+03:00', partiId: 40, lotNo: 'UP-000040', malzemeId: 950, malzemeKod: 'MM-001', malzemeAd: 'Deneme mamul', birim: 'adet',
    miktar: '2', emirNo: 'UE-000120', aciklama: null,
  }],
} satisfies PartiIziCevabi;

function goster() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><MemoryRouter><PartiIziPenceresi partiId={12} lotNo="LT-000012" kapat={() => undefined} /></MemoryRouter></BildirimSaglayici>
    </QueryClientProvider>,
  );
}

describe('Lot izi (refakat kartı Dal 9)', () => {
  it('lotun kartlarını, kartlarla üretilen partileri eldekiyle ve sevk çıkışlarını tek pencerede gösterir', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/partiler/12/iz': () => json(200, IZ) });
    goster();
    const pencere = await screen.findByRole('dialog', { name: 'LT-000012 izi' });
    const kartlar = within(await within(pencere).findByRole('table', { name: 'Refakat kartları' }));
    const kartSatiri = (await kartlar.findByText('UE-000120-P1')).closest('tr')!;
    expect(within(kartSatiri).getByRole('link', { name: 'UE-000120' }).getAttribute('href')).toBe('/uretim-emirleri/120');
    expect(within(kartSatiri).getByText('10 kg')).toBeTruthy();
    expect(within(kartSatiri).getByText('Açık')).toBeTruthy();
    expect(within(kartlar.getByText('UE-000121-P1').closest('tr')!).getByText('UE-000121-P2 kartına birleşti')).toBeTruthy();
    const cikti = within(within(pencere).getByRole('table', { name: 'Üretilen partiler' })).getByRole('link', { name: 'UP-000040' }).closest('tr')!;
    expect(within(cikti).getByText('1 adet')).toBeTruthy();
    expect(within(cikti).getByText('UE-000120-P1')).toBeTruthy();
    const sevk = within(within(pencere).getByRole('table', { name: 'Sevk çıkışları' })).getByText('UP-000040').closest('tr')!;
    expect(within(sevk).getByText('2 adet')).toBeTruthy();
    expect(within(sevk).getByText('UE-000120')).toBeTruthy();
  });
  it('kartsız lotta kart, üretim ve sevk çıkışı uydurmaz; boş olduğunu söyler', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/partiler/12/iz': () => json(200, { ...IZ, emirler: [], kartlar: [], ciktilar: [], sevkCikislari: [] } satisfies PartiIziCevabi) });
    goster();
    const pencere = await screen.findByRole('dialog', { name: 'LT-000012 izi' });
    expect(await within(pencere).findByText('Bu lotla açılmış refakat kartı yok.')).toBeTruthy();
    expect(within(pencere).getByText('Bu lotun kartlarıyla sayılmış parça yok.')).toBeTruthy();
    expect(within(pencere).getByText('Bu lotun kartlarıyla üretilen partilerden sevk çıkışı yok.')).toBeTruthy();
  });
});
