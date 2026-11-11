import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { BakiyeSatiri, Konum, KonumAyrintiCevabi, KonumlarCevabi, KonumMalzemeleriCevabi, KonumMalzemesi } from '#paylasilan/sozlesme/stok.ts';
import { beklemeMetni } from './gorunum.ts';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

// 2224: konumdaki malzeme ve bekleme süresi. "Bu konumda" konuma gelişten, "Depoya ilk giriş" FIFO zamanından yazılır; geliş
// bilinmiyorsa "—" (sıfır uydurulmaz).
const GUN = 86_400_000;
const once = (gun: number): string => new Date(Date.now() - gun * GUN).toISOString();
const BAKIYE: BakiyeSatiri = {
  id: 1, malzemeId: 901, malzemeAd: 'Deneme sac', konumId: 5, konumKod: 'D-Z1', partiId: null, partiEtiketi: null, miktar: '3',
  ilkGiris: once(40), ambalaj: null, statuId: null, konumaGelis: once(3),
};
const SATIR: KonumMalzemesi = { ...BAKIYE, konumTur: 'depo_zemini', konumAd: 'Zemin' };

describe('Konumdaki malzemeler (2224)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('bekleme metni gün, saat, dakika; geliş yoksa çizgi', () => {
    const simdi = Date.parse('2026-11-07T12:00:00Z');
    expect(beklemeMetni('2026-11-04T11:00:00Z', simdi)).toBe('3 gün');
    expect(beklemeMetni('2026-11-07T07:30:00Z', simdi)).toBe('4 sa');
    expect(beklemeMetni('2026-11-07T11:51:00Z', simdi)).toBe('9 dk');
    expect(beklemeMetni(null, simdi)).toBe('—');
    expect(beklemeMetni(undefined, simdi)).toBe('—');
  });

  it('Bütün konumlar: tek satırlı kayan tablo, Kod solda yapışık', async () => {
    const k = { id: 7, kod: 'A-01-02', tur: 'raf_gozu', ad: 'Deneme raf gözü uzun adlı', depoId: 1, depoKod: 'ANA', haritaGozId: null, haritaAlanId: null, satirSayisi: 2, sonSayim: null } as unknown as Konum;
    sunucuKur(OKUYUCU, { 'GET /stok/konumlar': () => json(200, { satirlar: [k], toplam: 1, sayfa: 1, sayfaBoyu: 50 } as KonumlarCevabi) });
    ac('/stok/konumlar');
    fireEvent.click(await screen.findByRole('tab', { name: /Bütün konumlar/ }));
    const tablo = await screen.findByRole('table', { name: 'Konumlar' });
    await within(tablo).findByText('A-01-02');
    expect(tablo.closest('.tc-tablo-kap')?.hasAttribute('data-kaydir')).toBe(true);
    expect(within(tablo).getByRole('columnheader', { name: /^Kod/ }).classList.contains('tc-tablo-sabit-sol')).toBe(true);
    expect(within(tablo).getByText('Deneme raf gözü uzun adlı').closest('.tc-tablo-kes')?.getAttribute('title')).toBe('Deneme raf gözü uzun adlı');
  });

  it('sekme bütün konumlardaki malzemeyi süresiyle listeler; tür süzgeci sunucuya gider', async () => {
    const cevap: KonumMalzemeleriCevabi = { satirlar: [SATIR, { ...SATIR, id: 2, malzemeId: 902, malzemeAd: 'Deneme mil', konumaGelis: null }], toplam: 2, sayfa: 1, sayfaBoyu: 50 };
    const istekler = sunucuKur(OKUYUCU, { 'GET /stok/konum-malzemeleri': () => json(200, cevap) });
    ac('/stok/konumlar');
    fireEvent.click(await screen.findByRole('tab', { name: /Konumdaki malzemeler/ }));
    const tablo = await screen.findByRole('table', { name: 'Konumdaki malzemeler' });
    expect(tablo.closest('.tc-tablo-kap')?.hasAttribute('data-kaydir')).toBe(true);
    expect(within(tablo).getByRole('columnheader', { name: /^Konum/ }).classList.contains('tc-tablo-sabit-sol')).toBe(true);
    const satirlar = within(tablo).getAllByRole('row');
    expect(within(satirlar[1]!).getByText('Deneme sac')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('3 gün')).toBeTruthy();
    expect(satirlar[2]!.querySelector('[data-baslik="Bu konumda"]')?.textContent).toBe('—');
    fireEvent.change(screen.getByLabelText('Tür'), { target: { value: 'kabul' } });
    await waitFor(() => expect(istekler.some((i) => i.yol.startsWith('/stok/konum-malzemeleri') && i.yol.includes('tur=kabul'))).toBe(true));
  });

  it('konum ayrıntısında "Bu konumda" konuma gelişten, "Depoya ilk giriş" ayrı sütunda', async () => {
    const ayrinti: KonumAyrintiCevabi = {
      konum: { id: 5, kod: 'D-Z1', tur: 'depo_zemini', ad: null, depoId: 1, depoKod: 'ANA', rafId: null, bolmeNo: null, katNo: null, sonSayim: null, aktif: true, satirSayisi: 1, haritaGozId: null, haritaAlanId: null, surum: 1 },
      raf: null, bakiyeler: [BAKIYE], haritaYeri: null, zemin: null,
    };
    sunucuKur(OKUYUCU, { 'GET /stok/konumlar/5': () => json(200, ayrinti) });
    ac('/stok/konumlar/5');
    const tablo = await screen.findByRole('table', { name: 'Gözdeki stok' });
    expect(tablo.closest('.tc-tablo-kap')?.hasAttribute('data-kaydir')).toBe(true);
    expect(within(tablo).getByRole('columnheader', { name: /^Malzeme/ }).classList.contains('tc-tablo-sabit-sol')).toBe(true);
    expect(within(tablo).getByRole('columnheader', { name: 'Bu konumda' })).toBeTruthy();
    expect(within(tablo).getByRole('columnheader', { name: 'Depoya ilk giriş' })).toBeTruthy();
    expect(within(tablo).getByText('3 gün')).toBeTruthy();
  });
});
