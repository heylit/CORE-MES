import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { EmirListeCevabi, TalepListeCevabi } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { YONETICI, ac, json, sunucuKur } from './test-ortak.tsx';

const EMIRLER: EmirListeCevabi = {
  satirlar: [
    { id: 9, no: 'ECO-0009', baslik: 'Braket kalınlığı', sinif: 'D1', durum: 'karar', acilis: '2026-10-01', kapanis: null, bekleyenKarar: 2, bekleyenFai: 0,
      gecerlilik: { tur: 'seri', sonUrun: { malzemeId: 30, kod: 'DNM-30', ad: null }, ilkSeri: 34 } },
    { id: 10, no: 'ECO-0010', baslik: 'Flanş rotası', sinif: 'P1', durum: 'revizyon_hazirlaniyor', acilis: '2026-10-02', kapanis: null, bekleyenKarar: 0, bekleyenFai: 0, gecerlilik: null },
  ],
  toplam: 2, sayfa: 1, sayfaBoyu: 50,
};
const TALEPLER: TalepListeCevabi = {
  satirlar: [{
    id: 7, no: 'ECR-0007', baslik: 'Delik pahı', sinif: 'P1', aciliyet: 'acil', durum: 'ccb_bekliyor', acilis: '2026-10-20T07:30:00Z', acanAdi: 'Deneme Açan', emirNo: null,
    malzemeler: [{ malzemeId: 11, kod: 'DNM-11', ad: null }, { malzemeId: 12, kod: null, ad: null }],
  }],
  toplam: 1, sayfa: 1, sayfaBoyu: 50,
};

const kur = () => sunucuKur(YONETICI, (yol) => {
  if (yol.startsWith('/degisiklik-yonetimi/emirler')) return json(200, EMIRLER);
  if (yol.startsWith('/degisiklik-yonetimi/talepler')) return json(200, TALEPLER);
  return undefined;
});
const hucre = (satir: HTMLElement, baslik: string) => within(satir).getAllByRole('cell').find((h) => h.getAttribute('data-baslik') === baslik)?.textContent;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Değişiklikler', () => {
  it('ECO bölümü açık olanlarla açılır; geçerlilik yayından önce "Yayında belirlenecek" yazar', async () => {
    const cagrilar = kur();
    ac('/degisiklik-yonetimi/degisiklikler');
    const tablo = await screen.findByRole('table', { name: 'Değişiklik emirleri (ECO)' });
    const [ilk, ikinci] = (await within(tablo).findAllByRole('row')).slice(1) as [HTMLElement, HTMLElement];
    expect(hucre(ilk, 'Geçerlilik')).toBe('DNM-30, seri 34 ve sonrası');
    expect(hucre(ilk, 'Bekleyen karar')).toBe('2 karar');
    expect(hucre(ilk, 'Tip')).toBe('Class I');
    expect(hucre(ikinci, 'Geçerlilik')).toBe('Yayında belirlenecek');
    expect(cagrilar.find((c) => c.yol.startsWith('/degisiklik-yonetimi/emirler'))?.yol).toMatch(/kapsam=acik/);
  });

  it('durum süzgeci kapsamı sunucuya gönderir', async () => {
    const cagrilar = kur();
    ac('/degisiklik-yonetimi/degisiklikler');
    await screen.findByRole('table', { name: 'Değişiklik emirleri (ECO)' });
    fireEvent.change(screen.getByLabelText('Durum'), { target: { value: 'kapali' } });
    await waitFor(() => { expect(cagrilar.some((c) => /\/emirler\?.*kapsam=kapali/.test(c.yol))).toBe(true); });
  });

  it('talepler bölümü parçaları ve açanı gösterir, satır talebi açar', async () => {
    kur();
    ac('/degisiklik-yonetimi/degisiklikler?bolum=talep');
    const tablo = await screen.findByRole('table', { name: 'Talepler (ECR)' });
    const [satir] = (await within(tablo).findAllByRole('row')).slice(1) as [HTMLElement];
    expect(hucre(satir, 'Parçalar')).toBe('DNM-11, #12');
    expect(hucre(satir, 'Açan')).toBe('Deneme Açan');
    expect(hucre(satir, 'Durum')).toBe('CCB kararı');
  });
});
