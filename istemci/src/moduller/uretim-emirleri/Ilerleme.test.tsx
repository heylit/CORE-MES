import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import type { EmirTamamlamaCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { EmirAyrintiCevabi, EmirIlerlemesi, IzlemeEmri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { EmirAyrintisi } from './EmirAyrintisi.tsx';
import { receteIlerlemesi } from './gorunum.ts';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

const EMIR = {
  id: 4, emirNo: 'EM-4', parcaNo: 'DNM-002', parcaAd: 'Deneme flanş', adet: 10, istasyon: null, durum: 'basladi', acan: { id: 7, ad: 'Deneme Planlamaci' },
  acilma: '2026-10-06T08:00:00+00:00', baslama: '2026-10-06T09:00:00+00:00', bitis: null, iptal: null, saglamAdet: null, malzemeNo: 502,
} satisfies IzlemeEmri;
const ILERLEME: EmirIlerlemesi = {
  esas: 'adet', rota: 66,
  adimlar: [
    { opNo: 10, ad: 'Tornalama', dal: null, durum: 'tamam', hedef: 10, yapilan: 9, yuzde: 100 },
    { opNo: 20, ad: 'Frezeleme', dal: 'K1', durum: 'calisiyor', hedef: 9, yapilan: 3, yuzde: 33 },
  ],
};
const TAMAMLAMA: EmirTamamlamaCevabi = {
  emir: { id: 4, emirNo: 'EM-4', durum: 'basladi', adet: 10, malzemeId: 502, malzemeAd: null }, cikti: { girilen: '0', kalan: '10' }, engel: null,
  bilesenler: [
    { malzemeId: 601, malzemeAd: 'Deneme çubuk', hizmet: false, brut: '4', verilen: '3', kalan: '1', mevcut: '9', eksik: '0' },
    { malzemeId: 602, malzemeAd: 'Deneme vida', hizmet: false, brut: '40', verilen: '10', kalan: '30', mevcut: '90', eksik: '0' },
    { malzemeId: 603, malzemeAd: 'Deneme kaplama', hizmet: true, brut: '1', verilen: '0', kalan: '1', mevcut: '0', eksik: '0' },
  ],
};
const ekran = [{ yol: '/uretim-emirleri/:id', ekran: EmirAyrintisi }];
const yollar = (ilerleme: EmirIlerlemesi | null) => ({
  'GET /uretim-emirleri/4': () => json(200, { emir: EMIR, kayitlar: [], ilerleme } satisfies EmirAyrintiCevabi),
  'GET /stok/uretim-emirleri/4/tamamlama': () => json(200, TAMAMLAMA),
  'GET /stok/uretim-emirleri/4/refakat-partileri': () => json(200, { partiler: [] }),
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('receteIlerlemesi (1944)', () => {
  it('bileşen başına verilen / brüt, aşağı yuvarlanır ve 100 ile sınırlı; emrin yüzdesi ortalama; hizmet ve sıfır ihtiyaç sayılmaz', () => {
    const r = receteIlerlemesi({ bilesenler: [...TAMAMLAMA.bilesenler, { ...TAMAMLAMA.bilesenler[0]!, malzemeId: 604, brut: '2', verilen: '3' }, { ...TAMAMLAMA.bilesenler[0]!, malzemeId: 605, brut: '0' }] });
    expect(r.bilesenler.map((b) => [b.malzemeId, b.yuzde])).toEqual([[601, 75], [602, 25], [604, 100]]);
    expect(r.yuzde).toBe(66);
  });

  it('sayılacak bileşen yoksa yüzde yoktur (sıfır uydurulmaz)', () => {
    expect(receteIlerlemesi({ bilesenler: [] }).yuzde).toBeNull();
  });
});

describe('Emir ayrıntısında ilerleme (1944)', () => {
  it('rota, adım ve stok okuyana reçete yüzdesi görünür', async () => {
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.stok'] }, yollar(ILERLEME));
    ac(ekran, '/uretim-emirleri/4');
    const bolum = await screen.findByRole('region', { name: 'İlerleme' });
    expect(within(bolum).getByLabelText('Rota yüzde 66')).toBeTruthy();
    expect(await within(bolum).findByLabelText('Reçete yüzde 50')).toBeTruthy();
    const adimlar = within(bolum).getByRole('table', { name: 'Adım ilerlemesi' });
    expect(within(adimlar).getByText('9 / 10')).toBeTruthy();
    expect(within(adimlar).getByLabelText('OP 20 yüzde 33')).toBeTruthy();
    expect(within(adimlar).getByText('(K1)')).toBeTruthy();
    expect(within(bolum).getByText(/adım yüzdelerinin ortalaması/)).toBeTruthy();
    expect(within(within(bolum).getByRole('table', { name: 'Reçete ilerlemesi' })).queryByText('Deneme kaplama')).toBeNull();
  });

  it('stok okuması olmayana reçete satırı çizilmez ve stok ucu sorulmaz; adımsız emirde bölüm yoktur', async () => {
    const istekler = sunucuKur(OKUYUCU, yollar(ILERLEME));
    ac(ekran, '/uretim-emirleri/4');
    const bolum = await screen.findByRole('region', { name: 'İlerleme' });
    expect(within(bolum).queryByText('Reçete')).toBeNull();
    expect(istekler.some((i) => i.yol.startsWith('/stok/'))).toBe(false);
    cleanup();
    sunucuKur(OKUYUCU, yollar(null));
    ac(ekran, '/uretim-emirleri/4');
    expect(await screen.findByText('EM-4')).toBeTruthy();
    expect(screen.queryByRole('region', { name: 'İlerleme' })).toBeNull();
  });

  it('2907: refakat kartları bölümü ilerlemenin hemen altında, üretim yerlerinden ve kayıt defterinden önce gelir', async () => {
    sunucuKur({ ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.stok'] }, yollar(ILERLEME));
    ac(ekran, '/uretim-emirleri/4');
    const ilerleme = await screen.findByRole('region', { name: 'İlerleme' });
    const kartlar = await screen.findByRole('region', { name: 'Refakat kartları' });
    const defter = screen.getByRole('heading', { name: 'Kayıt defteri' });
    expect(ilerleme.compareDocumentPosition(kartlar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(kartlar.compareDocumentPosition(defter) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const arada = [...document.querySelectorAll('section, h3')].filter((e) => (ilerleme.compareDocumentPosition(e) & Node.DOCUMENT_POSITION_FOLLOWING) && (e.compareDocumentPosition(kartlar) & Node.DOCUMENT_POSITION_FOLLOWING) && !ilerleme.contains(e));
    expect(arada).toEqual([]);
  });
});
