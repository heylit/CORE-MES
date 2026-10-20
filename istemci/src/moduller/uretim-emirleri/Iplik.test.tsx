import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { EmirAkisiCevabi } from '#paylasilan/sozlesme/akis.ts';
import type { Emir, EmirAyrintiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { EmirAyrintisi } from './EmirAyrintisi.tsx';
import { kisaZaman } from './iplik.ts';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

const EMIR: Emir = {
  id: 5, emirNo: 'UE-000005', parcaNo: 'DNM-005', parcaAd: 'Deneme flans', adet: 6, istasyon: { id: 3, ad: 'Deneme Tezgah 1' },
  durum: 'bitti', acan: { id: 7, ad: 'Deneme Planlamaci' }, acilma: '2026-10-06T07:00:00+00:00', baslama: '2026-10-06T08:00:00+00:00',
  bitis: '2026-10-06T12:00:00+00:00', iptal: null, saglamAdet: 6, canli: null, malzemeNo: 40,
};
const AYRINTI = { emir: EMIR, kayitlar: [], adimlar: [] } satisfies EmirAyrintiCevabi;

const olcu = { dk: null, acik: false };
const adimOlcusu = (isEmriId: number, opNo: number, istasyon: string | null, fason: boolean, saglamAdet: number) => ({
  isEmriId, opNo, istasyon, fason, beklemeDk: null, hazirlikDk: null, islemeDk: null, duraklamaDk: null, durusDk: null, fasonDk: null,
  saglamAdet, cevrimBirimDk: null, standartBirimDk: null, standartHazirlikDk: null, terminGun: null,
});
const AKIS = {
  emir: { id: 5, emirNo: 'UE-000005', adet: 6, durum: 'bitti', teslim: null },
  simdi: '2026-10-07T10:00:00.000Z',
  damgalar: { malKabul: '2026-10-05T07:42:00.000Z', uretimBasladi: '2026-10-06T08:00:00.000Z', uretimBitti: '2026-10-06T12:00:00.000Z', sevkeHazir: '2026-10-06T13:00:00.000Z', sevk: null },
  olculer: { uctanUca: olcu, hammaddeBekleme: olcu, uretimAkis: olcu, sevkBekleme: olcu, islemeToplamDk: null, akisVerimi: null },
  seritler: [
    { anahtar: 'adim-11', tur: 'adim', baslik: 'OP10', altBaslik: 'Deneme Torna', bolumler: [
      { tur: 'isleme', baslangic: '2026-10-06T08:00:00.000Z', bitis: '2026-10-06T09:30:00.000Z', acik: false },
    ] },
    { anahtar: 'adim-12', tur: 'adim', baslik: 'OP20', altBaslik: 'Fason', bolumler: [] },
    { anahtar: 'adim-13', tur: 'adim', baslik: 'OP30', altBaslik: 'Deneme Freze', bolumler: [
      { tur: 'bekleme', baslangic: '2026-10-06T09:30:00.000Z', bitis: '2026-10-06T10:00:00.000Z', acik: false },
      { tur: 'isleme', baslangic: '2026-10-06T10:00:00.000Z', bitis: '2026-10-06T12:00:00.000Z', acik: false },
    ] },
  ],
  adimlar: [adimOlcusu(11, 10, 'Deneme Torna', false, 6), adimOlcusu(12, 20, null, true, 0), adimOlcusu(13, 30, 'Deneme Freze', false, 6)],
  statuler: [],
  hammadde: [{ partiId: 77, lotNo: 'DNM-LOT-1', malKabul: '2026-10-05T07:42:00.000Z', kullanim: '2026-10-06T08:00:00.000Z', beklemeDk: null }],
} satisfies EmirAkisiCevabi;

const AKISLI: Kullanici = { ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'sayfa.akis'] };
const ekran = [{ yol: '/uretim-emirleri/:id', ekran: EmirAyrintisi }];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const duraklar = () => within(screen.getByRole('img', { name: /izlenebilirlik ipliği/ })).getAllByRole('listitem').map((d) => d.getAttribute('aria-label'));

describe('İzlenebilirlik ipliği', () => {
  it('düğmeyle açılır; duraklar mal kabul, rota adımları sırasıyla, kalite ve sevk', async () => {
    const istekler = sunucuKur(AKISLI, {
      'GET /uretim-emirleri/5': () => json(200, AYRINTI),
      'GET /akis/emirler/5': () => json(200, AKIS),
    });
    ac(ekran, '/uretim-emirleri/5');
    await screen.findByText('UE-000005');
    expect(screen.queryByRole('img', { name: /izlenebilirlik ipliği/ })).toBeNull();
    expect(istekler.some((i) => i.yol.startsWith('/akis'))).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Parçayı izle' }));
    await screen.findByRole('img', { name: 'UE-000005 izlenebilirlik ipliği' });
    expect(duraklar()).toEqual([
      `Mal kabul: Parti DNM-LOT-1, ${kisaZaman('2026-10-05T07:42:00.000Z')}`,
      `Deneme Torna: OP10 · 6 adet, ${kisaZaman('2026-10-06T08:00:00.000Z')} – ${kisaZaman('2026-10-06T09:30:00.000Z')}`,
      'Fason: OP20, kayıt yok',
      `Deneme Freze: OP30 · 6 adet, ${kisaZaman('2026-10-06T10:00:00.000Z')} – ${kisaZaman('2026-10-06T12:00:00.000Z')}`,
      'Kalite: kayıt yok',
      `Sevk: Hazır ${kisaZaman('2026-10-06T13:00:00.000Z')}`,
    ]);
    const yanan = within(screen.getByRole('img', { name: /izlenebilirlik ipliği/ })).getAllByRole('listitem').map((d) => d.classList.contains('tc-iplik-yandi'));
    expect(yanan).toEqual([true, true, false, true, false, true]);

    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByRole('img', { name: /izlenebilirlik ipliği/ })).toBeNull();
  });

  it('Akış Süresi yetkisi yoksa uç çağrılmaz; mal kabul, kalite, sevk soluk ve "kayıt yok"', async () => {
    const istekler = sunucuKur(OKUYUCU, { 'GET /uretim-emirleri/5': () => json(200, AYRINTI) });
    ac(ekran, '/uretim-emirleri/5');
    await screen.findByText('UE-000005');
    fireEvent.click(screen.getByRole('button', { name: 'Parçayı izle' }));
    await screen.findByRole('img', { name: 'UE-000005 izlenebilirlik ipliği' });
    const ogeler = within(screen.getByRole('img', { name: /izlenebilirlik ipliği/ })).getAllByRole('listitem');
    expect(ogeler.map((d) => d.getAttribute('aria-label'))).toEqual([
      'Mal kabul: kayıt yok',
      `Deneme Tezgah 1: 6 / 6 adet, ${kisaZaman(EMIR.baslama!)} – ${kisaZaman(EMIR.bitis!)}`,
      'Kalite: kayıt yok',
      'Sevk: kayıt yok',
    ]);
    expect(ogeler.map((d) => d.classList.contains('tc-iplik-bos'))).toEqual([true, false, true, true]);
    expect(istekler.some((i) => i.yol.startsWith('/akis'))).toBe(false);
    expect(screen.getByText('Parti, rota saatleri ve sevk Akış Süresi yetkisiyle görünür.')).toBeTruthy();
  });

  it('emrin işaretli adımları durak olur; işaretsiz adım "kayıt yok"', async () => {
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri/5': () => json(200, {
      ...AYRINTI,
      adimlar: [
        { id: 1, sira: 1, ad: 'Kesim', aciklama: null, tamam: true, tamamlayan: { id: 7, ad: 'Deneme Planlamaci' }, tamamlanma: '2026-10-06T08:30:00+00:00' },
        { id: 2, sira: 2, ad: 'Çapak alma', aciklama: null, tamam: false, tamamlayan: null, tamamlanma: null },
      ],
    } satisfies EmirAyrintiCevabi) });
    ac(ekran, '/uretim-emirleri/5');
    await screen.findByText('UE-000005');
    fireEvent.click(screen.getByRole('button', { name: 'Parçayı izle' }));
    await screen.findByRole('img', { name: 'UE-000005 izlenebilirlik ipliği' });
    expect(duraklar().slice(1, 3)).toEqual([
      `Kesim: Deneme Planlamaci, ${kisaZaman('2026-10-06T08:30:00+00:00')}`,
      'Çapak alma: kayıt yok',
    ]);
  });

  it('hareket açıkken iplik baştan çizilir; "sade" seçiminde tam çizili gelir', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false }));
    const yanan = async () => {
      sunucuKur(AKISLI, { 'GET /uretim-emirleri/5': () => json(200, AYRINTI), 'GET /akis/emirler/5': () => json(200, AKIS) });
      ac(ekran, '/uretim-emirleri/5');
      await screen.findByText('UE-000005');
      fireEvent.click(screen.getByRole('button', { name: 'Parçayı izle' }));
      const ogeler = within(await screen.findByRole('img', { name: /izlenebilirlik ipliği/ })).getAllByRole('listitem');
      return ogeler.filter((d) => d.classList.contains('tc-iplik-yandi')).length;
    };
    expect(await yanan()).toBeLessThan(4);
    cleanup();
    document.documentElement.dataset.hareket = 'sade';
    try {
      expect(await yanan()).toBe(4);
    } finally {
      delete document.documentElement.dataset.hareket;
    }
  });
});
