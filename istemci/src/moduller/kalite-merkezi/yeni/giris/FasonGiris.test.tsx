import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { KmFasonGkkKarari, KmFasonGkkSatiri, KmKaynaktaMuayeneSatiri } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import type { MuayeneBelgeleriCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { kmAc, MUHENDIS } from '../test-ortak.tsx';
import { fasonKararIhlali, muayeneOnayIhlali } from './ortak.ts';

// Kayıtlar ve adlar sentetiktir.
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const FASON: KmFasonGkkSatiri = {
  fasonIsEmriId: 71, uretimEmriId: 7, emirNo: 'ORN-UE-0007', opNo: 30, parcaNo: 'ORN-P-01', parcaAd: 'Deneme flanş', firmaAdi: 'Deneme Kaplama',
  malzemeKod: 'ORN-P-01', malzemeAd: 'Deneme flanş', birim: 'adet', gelen: '10.000', bekleyen: '10.000', gelenAdet: 10, bekleyenAdet: 10,
  sonZaman: '2026-11-27T08:00:00.000Z', malKabulNo: 'MK-0101', gkkAdimi: true,
};
const MUAYENE: KmKaynaktaMuayeneSatiri = {
  muayeneIsEmriId: 82, fasonIsEmriId: 81, uretimEmriId: 8, emirNo: 'ORN-UE-0008', opNo: 20, parcaNo: 'ORN-P-02', parcaAd: 'Deneme mil',
  firmaAdi: 'Deneme Isıl', gonderilen: 10, ilkGidis: '2026-11-26T08:00:00.000Z', sureSaat: '4', zorunlu: ['Test raporu'], eksik: ['Test raporu'], yuklenen: 0,
};
const YAPILAN: KmFasonGkkKarari = { uretimEmriId: 7, emirNo: 'ORN-UE-0007', opNo: 30, sonuc: 'red', miktar: '3.000', kisiAd: 'Deneme Kişi', zaman: '2026-11-27T09:00:00.000Z' };

function ac(belgeEksik: string[]) {
  const s = kmAc('giris-kontrolu', MUHENDIS);
  const asil = s.fetch.getMockImplementation();
  const belgeler: MuayeneBelgeleriCevabi = { zorunlu: ['Test raporu'], eksik: belgeEksik, belgeler: [] };
  s.fetch.mockImplementation(async (adres: string, istek?: RequestInit) => {
    const yol = adres.replace(/^\/api/, '');
    if (yol === '/kalite-merkezi/giris/bekleyenler') return json(200, { kayitlar: [], fason: [FASON], kaynakta: [MUAYENE] });
    if (yol.startsWith('/kalite-merkezi/giris/kayitlar?')) return json(200, { kayitlar: [], fason: [YAPILAN], sinirda: false });
    if (yol === '/adimli-emirler/8/is-emirleri/82/muayene-belgeleri') return json(200, belgeler);
    if (yol === '/kalite-merkezi/giris/fason/71/karar' || yol === '/kalite-merkezi/kaynakta-muayene/82/onay') {
      s.yazmalar.push({ yol, govde: JSON.parse(String(istek?.body)) });
      return json(200, yol.endsWith('/karar') ? { bekleyenAdet: 0, adimKapandi: true } : { uretimEmriId: 8 });
    }
    return asil ? asil(adres, istek) : json(404, {});
  });
  return s;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

describe('3809 fason dönüşü GKK ve kaynağında muayene', () => {
  it('kurallar: toplam bekleyeni ve gönderileni aşamaz, sıfır karar yazılmaz', () => {
    expect(fasonKararIhlali({ serbest: 7, sartli: 0, red: 3 }, 10)).toBeNull();
    expect(fasonKararIhlali({ serbest: 8, sartli: 0, red: 3 }, 10)).toMatch(/aşıyor/);
    expect(fasonKararIhlali({ serbest: 0, sartli: 0, red: 0 }, 10)).toMatch(/En az bir/);
    expect(fasonKararIhlali({ serbest: 1, sartli: 0, red: 0 }, null)).toMatch(/adet karşılığı/);
    expect(muayeneOnayIhlali(8, 2, 10)).toBeNull();
    expect(muayeneOnayIhlali(9, 2, 10)).toMatch(/aşıyor/);
  });

  it('fason dönüşü Bekleyen listesinde emir ve OP ile görünür; 7 serbest 3 red tek istekte yazılır, aşan toplam düğmeyi kapatır', async () => {
    const s = ac([]);
    const tablo = await screen.findByRole('table', { name: 'Bekleyen GKK' });
    expect(within(tablo).getByText('Fason dönüşü')).toBeTruthy();
    expect(within(tablo).getByText('10 / 10 adet')).toBeTruthy();
    fireEvent.click(within(tablo).getByText('ORN-UE-0007 · OP 30'));
    const yaz = await screen.findByRole('button', { name: /Kararı yaz/ });
    fireEvent.change(screen.getByLabelText('Serbest'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Red'), { target: { value: '3' } });
    expect(screen.getByText('Toplam 11 adet, bekleyen 10 adedi aşıyor.')).toBeTruthy();
    expect((yaz as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('Serbest'), { target: { value: '7' } });
    expect(screen.getByRole('button', { name: 'Kararı yaz (10 adet)' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Kararı yaz (10 adet)' }));
    await waitFor(() => { expect(s.yazmalar.some((y) => y.yol === '/kalite-merkezi/giris/fason/71/karar')).toBe(true); });
    expect(s.yazmalar.find((y) => y.yol.endsWith('/karar'))?.govde).toEqual({ serbest: 7, sartli: 0, red: 3, not: null });
  });

  it('kaynağında muayene: eksik belgeyle onay kapalı ve nedeni düğmeye bağlı; belgeler tamamsa sağlam ve red onaylanır', async () => {
    ac(['Test raporu']);
    fireEvent.click(await screen.findByRole('tab', { name: /Kaynağında muayene/ }));
    fireEvent.click(within(await screen.findByRole('table', { name: 'Kaynağında muayene' })).getByText('ORN-UE-0008 · OP 20'));
    const onay = await screen.findByRole('button', { name: 'Muayeneyi onayla' });
    await screen.findByText(/Eksik: Test raporu/);
    expect((onay as HTMLButtonElement).disabled).toBe(true);
    const neden = document.getElementById(onay.getAttribute('aria-describedby') ?? '');
    expect(neden?.textContent).toMatch(/Zorunlu belge eksik: Test raporu/);
    cleanup();

    const s = ac([]);
    fireEvent.click(await screen.findByRole('tab', { name: /Kaynağında muayene/ }));
    fireEvent.click(within(await screen.findByRole('table', { name: 'Kaynağında muayene' })).getByText('ORN-UE-0008 · OP 20'));
    await screen.findByText(/Zorunlu belgelerin hepsi yüklendi/);
    fireEvent.change(screen.getByLabelText('Sağlam'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Red'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Muayeneyi onayla' }));
    await waitFor(() => { expect(s.yazmalar.find((y) => y.yol.endsWith('/82/onay'))?.govde).toEqual({ saglam: 8, red: 2 }); });
  });

  it('Yapılan sekmesi fason kararlarını ayrı tabloda gösterir', async () => {
    ac([]);
    fireEvent.click(await screen.findByRole('tab', { name: /Yapılan/ }));
    const tablo = await screen.findByRole('table', { name: 'Fason dönüşü kararları' });
    expect(within(tablo).getByText('ORN-UE-0007 · OP 30')).toBeTruthy();
    expect(within(tablo).getByText('Red')).toBeTruthy();
  });
});
