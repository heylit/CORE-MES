import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { MuayeneBelgeleriCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { MuayeneBelgeleri, muayeneBelgesiAdresi } from './MuayeneBelgeleri.tsx';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

const OZET = 'a'.repeat(64);
vi.mock('../belge-merkezi/disari.ts', () => ({
  DosyaHatasi: class extends Error {},
  dosyaYukle: vi.fn(() => Promise.resolve('a'.repeat(64))),
}));

const FASONCU = { ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'uretim-emirleri.fason' as const] };
const YOL = '/adimli-emirler/3/is-emirleri/32/muayene-belgeleri';
const ekran = [{ yol: '/', ekran: () => <MuayeneBelgeleri emirId={3} isEmriId={32} opNo={25} /> }];
const belge = { ozet: OZET, ad: 'ORN-sertifika.pdf', boyut: 2000, tur: 'pdf' as const, belgeTuru: 'Malzeme sertifikası', ekleyenId: 1, zaman: '2026-11-25T10:00:00Z' };
const EKSIK: MuayeneBelgeleriCevabi = { zorunlu: ['Malzeme sertifikası', 'Test raporu'], eksik: ['Malzeme sertifikası', 'Test raporu'], belgeler: [] };
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Muayene belgeleri (3708)', () => {
  it('fason yetkisi olmayan kişide bölüm görünmez ve uç sorulmaz', async () => {
    const istekler = sunucuKur(OKUYUCU, { [`GET ${YOL}`]: () => json(200, EKSIK) });
    ac(ekran, '/');
    await waitFor(() => expect(istekler.some((i) => i.yol === '/oturum')).toBe(true));
    expect(screen.queryByText('Muayene belgeleri')).toBeNull();
    expect(istekler.some((i) => i.yol.startsWith('/adimli-emirler/'))).toBe(false);
  });

  it('eksik zorunlu belgeler yazılır; seçilen türle yüklenen dosya tekrar korumalı komutla bağlanır', async () => {
    const istekler = sunucuKur(FASONCU, {
      [`GET ${YOL}`]: () => json(200, EKSIK),
      [`POST ${YOL}`]: () => json(200, { ...EKSIK, eksik: ['Malzeme sertifikası'], belgeler: [{ ...belge, ad: 'ORN-rapor.pdf', belgeTuru: 'Test raporu' }] } satisfies MuayeneBelgeleriCevabi),
    });
    ac(ekran, '/');
    expect(await screen.findByText('Eksik: Malzeme sertifikası, Test raporu. Eksik belgeyle adım bitirilemez.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText<HTMLSelectElement>(/Belge türü/), { target: { value: 'Test raporu' } });
    // jsdom'un File'ı arrayBuffer vermez.
    const dosya = Object.assign(new File(['%PDF'], 'ORN-rapor.pdf', { type: 'application/pdf' }), { arrayBuffer: async () => new ArrayBuffer(4) });
    fireEvent.change(screen.getByLabelText(/^Dosya/), { target: { files: [dosya] } });
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    const bag = istekler.find((i) => i.yontem === 'POST');
    expect(bag?.govde).toEqual({ ozet: OZET, dosyaAdi: 'ORN-rapor.pdf', belgeTuru: 'Test raporu' });
    expect(bag?.kimlik).toBeTruthy();
    expect(await screen.findByText(/Eksik: Malzeme sertifikası\./)).toBeTruthy();
    expect(screen.getByRole('link', { name: 'ORN-rapor.pdf' }).getAttribute('href')).toBe(`/api${YOL}/${OZET}/dosya`);
  });

  it('belgeler tamamsa yazılır; kaldırılan belge eksik olarak döner', async () => {
    const istekler = sunucuKur(FASONCU, {
      [`GET ${YOL}`]: () => json(200, { zorunlu: ['Malzeme sertifikası'], eksik: [], belgeler: [belge] } satisfies MuayeneBelgeleriCevabi),
      [`POST ${YOL}/${OZET}/kaldir`]: () => json(200, { zorunlu: ['Malzeme sertifikası'], eksik: ['Malzeme sertifikası'], belgeler: [] } satisfies MuayeneBelgeleriCevabi),
    });
    ac(ekran, '/');
    expect(await screen.findByText(/Zorunlu belgelerin hepsi yüklendi/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'ORN-sertifika.pdf kaldır' }));
    expect(await screen.findByText(/Eksik: Malzeme sertifikası\./)).toBeTruthy();
    expect(istekler.some((i) => i.yontem === 'POST' && i.yol === `${YOL}/${OZET}/kaldir`)).toBe(true);
    expect(muayeneBelgesiAdresi(3, 32, OZET)).toBe(`/api${YOL}/${OZET}/dosya`);
  });

  it('biten muayenede belge kaldırılmaz', async () => {
    sunucuKur(FASONCU, { [`GET ${YOL}`]: () => json(200, { zorunlu: ['Malzeme sertifikası'], eksik: [], belgeler: [belge] } satisfies MuayeneBelgeleriCevabi) });
    ac([{ yol: '/', ekran: () => <MuayeneBelgeleri emirId={3} isEmriId={32} opNo={25} bitti /> }], '/');
    expect(await screen.findByRole('link', { name: 'ORN-sertifika.pdf' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'ORN-sertifika.pdf kaldır' })).toBeNull();
  });

  it('zorunlu belge yoksa serbest türle yüklenir', async () => {
    sunucuKur(FASONCU, { [`GET ${YOL}`]: () => json(200, { zorunlu: [], eksik: [], belgeler: [] } satisfies MuayeneBelgeleriCevabi) });
    ac(ekran, '/');
    expect(await screen.findByText(/zorunlu belge tanımlı değil/)).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>(/Belge türü/).tagName).toBe('INPUT');
  });
});
