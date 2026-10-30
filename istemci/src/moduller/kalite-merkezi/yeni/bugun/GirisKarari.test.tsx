import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { KmGirisBekleyenCevabi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { kmAc, MUAYENECI, MUHENDIS, type TestKayitlari, type TestKullanicisi } from '../test-ortak.tsx';

// Kayıtlar ve adlar sentetiktir.
type Kayit = KmGirisBekleyenCevabi['kayitlar'][number];
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const GKK: Kayit = {
  malKabulSatirId: 11, malKabulNo: 'MK-0001', zaman: '2026-10-30T08:00:00.000Z', malzemeId: 901, malzemeKod: 'HM-0001', malzemeAd: 'Deneme çubuk', birim: 'kg',
  partiId: 4, partiEtiketi: 'LT-000123', sertifikaVar: false, tedarikciAdi: 'Deneme Tedarikçi', siparisNo: 'SA-0001', miktar: '10.000', durum: 'gkk_bekliyor',
  kabulMiktar: null, hataliMiktar: null, gkkKisiAd: null, gkkZaman: null, karar: null, ncrNo: null, kararKisiAd: null, kararZaman: null, not: null,
};
const KARAR: Kayit = { ...GKK, malKabulSatirId: 12, malKabulNo: 'MK-0002', sertifikaVar: true, durum: 'karar_bekliyor', kabulMiktar: '7.000', hataliMiktar: '3.000' };

function ac(k: TestKullanicisi, kayitlar: Kayit[], ek: TestKayitlari = {}) {
  const s = kmAc('', k, ek);
  const asil = s.fetch.getMockImplementation();
  s.fetch.mockImplementation(async (adres: string, istek?: RequestInit) => {
    const yol = adres.replace(/^\/api/, '');
    if (yol === '/kalite-merkezi/giris/bekleyenler') {
      const verilen = new Set(s.yazmalar.map((y) => y.yol));
      return json(200, { kayitlar: kayitlar.filter((x) => !verilen.has(`/kalite-merkezi/giris/${String(x.malKabulSatirId)}/karar`)) });
    }
    if (yol === '/kalite-merkezi/giris/11/gkk') {
      s.yazmalar.push({ yol, govde: JSON.parse(String(istek?.body)) });
      return json(200, { kayit: { ...GKK, durum: 'karar_bekliyor', kabulMiktar: '8.000', hataliMiktar: '2.000' } });
    }
    if (yol === '/kalite-merkezi/giris/12/karar') {
      s.yazmalar.push({ yol, govde: JSON.parse(String(istek?.body)) });
      return json(200, { kayit: { ...KARAR, durum: 'kapandi', karar: 'red' } });
    }
    return asil ? asil(adres, istek) : json(404, {});
  });
  return s;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('Giriş kontrolü (1246)', () => {
  it('GKK kabul ve hatalı miktarı tekrar korumalı gönderir; sertifikasız lot işaretlenir', async () => {
    const s = ac(MUHENDIS, [GKK]);
    const bolum = await screen.findByRole('region', { name: 'Giriş kontrolü' });
    expect(within(bolum).getByText('Sertifika yok')).toBeTruthy();
    fireEvent.click(within(bolum).getByRole('button', { name: 'GKK' }));
    const pencere = screen.getByRole('dialog', { name: 'Giriş kalite kontrolü' });
    expect((within(pencere).getByLabelText('Kabul') as HTMLInputElement).value).toBe('10');
    fireEvent.change(within(pencere).getByLabelText('Kabul'), { target: { value: '8' } });
    fireEvent.change(within(pencere).getByLabelText('Hatalı'), { target: { value: '2' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'GKK yaz' }));
    await waitFor(() => { expect(s.yazmalar.some((y) => y.yol === '/kalite-merkezi/giris/11/gkk')).toBe(true); });
    expect(s.yazmalar.find((y) => y.yol === '/kalite-merkezi/giris/11/gkk')?.govde).toEqual({ kabul: '8', hatali: '2', not: null });
    const istek = s.fetch.mock.calls.find(([a]) => String(a).endsWith('/giris/11/gkk'));
    expect(new Headers((istek?.[1] as RequestInit | undefined)?.headers).get('istek-kimligi')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('hatalının kararı NCR numarasıyla gider; red varsayılandır; şartlı kabulde şart zorunludur', async () => {
    const s = ac(MUHENDIS, [KARAR], { ncr: [{ no: `NCR-${String(new Date().getFullYear())}-0004` }] });
    const bolum = await screen.findByRole('region', { name: 'Giriş kontrolü' });
    fireEvent.click(within(bolum).getByRole('button', { name: 'Karar ver' }));
    const pencere = screen.getByRole('dialog', { name: 'Hatalı giriş kararı' });
    fireEvent.change(within(pencere).getByLabelText('Karar'), { target: { value: 'sartli_kabul' } });
    expect((within(pencere).getByLabelText(/Şart/) as HTMLTextAreaElement).required).toBe(true);
    fireEvent.change(within(pencere).getByLabelText('Karar'), { target: { value: 'red' } });
    fireEvent.change(within(pencere).getByLabelText('Gerekçe'), { target: { value: 'Ölçü dışı' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kararı yaz' }));
    await waitFor(() => { expect(s.yazmalar.some((y) => y.yol === '/kalite-merkezi/giris/12/karar')).toBe(true); });
    const yazma = s.yazmalar.find((y) => y.yol === '/kalite-merkezi/giris/12/karar');
    expect(yazma?.govde).toMatchObject({ karar: 'red', ciddiyet: 'Majör', not: 'Ölçü dışı', ncrNo: `NCR-${String(new Date().getFullYear())}-0005` });
    await waitFor(() => { expect(screen.queryByRole('region', { name: 'Giriş kontrolü' })).toBeNull(); });
  });

  it('onay yetkisi olmayan kişide liste istenmez ve bölüm çizilmez', async () => {
    const s = ac(MUAYENECI, [GKK]);
    await screen.findByRole('heading', { level: 2, name: 'Merhaba Deneme' });
    expect(screen.queryByRole('region', { name: 'Giriş kontrolü' })).toBeNull();
    expect(s.fetch.mock.calls.some(([a]) => String(a).includes('/giris/'))).toBe(false);
  });
});
