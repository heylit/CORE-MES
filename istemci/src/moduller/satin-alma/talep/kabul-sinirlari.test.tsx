import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';
import type { AlternatifZarfi } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import type { KabulZarfiCevabi, MalzemeSecenekleriCevabi, Talebim, TaleplerimCevabi } from '#paylasilan/sozlesme/satin-alma.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { TalepAc } from './TalepAc.tsx';
import { Taleplerim } from './Taleplerim.tsx';

// 3437-2: talep formunda kalemin kabul sınırı kartın zarfından gelir; talep eden daraltır, gövdeye yalnız değişen sınır girer.
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const KARTLAR = { malzemeler: [
  { no: 21, kod: 'ORN-HM-00021', ad: 'Deneme çubuk 6082', birim: 'adet', kategori: null, katalogId: null, hammadde: true },
  { no: 7, kod: 'ORN-SR-00007', ad: 'Deneme eldiven', birim: 'çift', kategori: null, katalogId: null },
] } satisfies MalzemeSecenekleriCevabi;
const ZARF: AlternatifZarfi = {
  kapali: false, gerekce: null, kapaliKaynak: null, sartliAcik: false, sartliKaynak: null,
  kalite: { istenen: '6082', acik: true, kaynak: null, secenekler: [{ deger: '6061', tur: 'tam', notu: null }, { deger: '7075', tur: 'ust', notu: null }, { deger: '6060', tur: 'sartli', notu: 'Deneme not' }] },
  durum: { istenen: 'T6', acik: true, kaynak: null, secenekler: [{ deger: 'T651', tur: 'ust', notu: null }] },
  form: 'cubuk', olcu: [{ anahtar: 'd', istenen: 50, enCok: 55 }], pay: { tur: 'mm', deger: 5, enAzMm: 0, kaynak: null },
  boy: { anahtar: 'l', istenen: 3000, uzunKesilir: true, kaynak: null }, yuzey: { istenen: 'Ham', serbest: false, kaynak: null },
};
let zarf: AlternatifZarfi | null = ZARF;
const talep = (kalemler: Talebim['kalemler']): Talebim => ({
  id: '00000000-0000-4000-8000-000000000001', no: 'ST-2026-001', baslik: 'Deneme talep', durum: 'taslak', ihtiyacTarihi: null,
  olusturma: '2026-11-19T08:00:00Z', uretimEmriNo: null, kaynak: 'elle', kalemler,
});

function sunucuKur() {
  const cagrilar: { yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    cagrilar.push({ yol, govde: istek?.body ? JSON.parse(String(istek.body)) : null });
    if (yol.startsWith('/satin-alma-malzeme-secenekleri?')) return json(200, KARTLAR);
    if (yol === '/satin-alma-acik-emirler') return json(200, { emirler: [] });
    if (yol === '/satin-alma-kabul-zarfi/21') return json(200, { zarf } satisfies KabulZarfiCevabi);
    if (yol === '/satin-alma-talepleri/hizli-ac') return json(200, talep([]));
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return cagrilar;
}
const sar = (cocuk: ReactNode) => render(
  <MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><BildirimSaglayici>{cocuk}</BildirimSaglayici></QueryClientProvider></MemoryRouter>,
);
async function kartSec(ad: RegExp) {
  fireEvent.focus(screen.getByRole('combobox', { name: 'Malzeme' }));
  fireEvent.click(await screen.findByRole('option', { name: ad }));
}
const gonder = async (cagrilar: { yol: string; govde: unknown }[]) => {
  fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: '6' } });
  fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
  await screen.findByText(/açıldı; satın almaya düştü/);
  return (cagrilar.find((c) => c.yol === '/satin-alma-talepleri/hizli-ac')!.govde as { kalemler: Record<string, unknown>[] }).kalemler[0]!;
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); zarf = ZARF; });

describe('3437-2: talep formunda kabul sınırları', () => {
  it('hammadde kartında zarf görünür; dokunulmazsa gövdede sınır yok', async () => {
    const cagrilar = sunucuKur();
    sar(<TalepAc />);
    await kartSec(/ORN-HM-00021/);
    const bolum = await screen.findByRole('region', { name: 'Kabul sınırları' });
    expect(within(bolum).getByText('Alternatif kabul')).toBeTruthy();
    expect(within(bolum).getByText('d 50 – 55 mm')).toBeTruthy();
    expect(within(bolum).getByText('3.000 ve uzun (kesilir)')).toBeTruthy();
    // Şartlı muadil varsayılan kapalı: seçilemez.
    expect((within(bolum).getByRole('button', { name: /6060/ }) as HTMLButtonElement).disabled).toBe(true);
    expect('kabul' in await gonder(cagrilar)).toBe(false);
  });

  it('talep eden daraltır: muadil çıkar, pay küçülür, şartlı kabul açılır; gövde sınırı taşır', async () => {
    const cagrilar = sunucuKur();
    sar(<TalepAc />);
    await kartSec(/ORN-HM-00021/);
    const bolum = await screen.findByRole('region', { name: 'Kabul sınırları' });
    fireEvent.click(within(bolum).getByRole('button', { name: /7075/ }));
    expect(within(bolum).getByRole('button', { name: /7075/ }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(within(bolum).getByRole('button', { name: /T651/ }));
    fireEvent.change(within(bolum).getByLabelText('En çok fazla (mm)'), { target: { value: '2' } });
    expect(within(bolum).getByText('d 50 – 52 mm')).toBeTruthy();
    // Zarfınkinden geniş pay kırpılmaz: alan hata gösterir, form gönderilmez.
    fireEvent.change(within(bolum).getByLabelText('En çok fazla (mm)'), { target: { value: '9' } });
    expect(within(bolum).getByRole('alert').textContent).toMatch(/en çok 5 mm/);
    fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: '6' } });
    fireEvent.click(screen.getByRole('button', { name: 'Talebi gönder' }));
    expect(await screen.findByText(/ölçü payını düzeltin/)).toBeTruthy();
    expect(cagrilar.some((c) => c.yol === '/satin-alma-talepleri/hizli-ac')).toBe(false);
    fireEvent.change(within(bolum).getByLabelText('En çok fazla (mm)'), { target: { value: '2,5' } });
    expect(within(bolum).getByText('d 50 – 52,5 mm')).toBeTruthy();
    // Şartlı kabul açılınca şartlı muadil seçilebilir olur ama kendiliğinden listeye girmez; kapanınca listeden düşer.
    const sartli = () => within(bolum).getByRole('button', { name: /6060/ }) as HTMLButtonElement;
    fireEvent.click(within(bolum).getByLabelText('Şartlı muadilleri kabul ediyorum'));
    expect(sartli().disabled).toBe(false);
    expect(sartli().getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(sartli());
    fireEvent.click(within(bolum).getByLabelText('Şartlı muadilleri kabul ediyorum'));
    expect(sartli().disabled).toBe(true);
    fireEvent.click(within(bolum).getByLabelText('Şartlı muadilleri kabul ediyorum'));
    expect(sartli().getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(sartli());
    expect((await gonder(cagrilar)).kabul).toEqual({ yalnizAyni: false, sartliKabul: true, kaliteler: ['6061', '6060'], durumlar: [], payMm: 2.5 });
  });

  it('yalnız aynı malzeme: tablo kapanır, gövdede yalnız bu işaret', async () => {
    const cagrilar = sunucuKur();
    sar(<TalepAc />);
    await kartSec(/ORN-HM-00021/);
    const bolum = await screen.findByRole('region', { name: 'Kabul sınırları' });
    fireEvent.click(within(bolum).getByLabelText('Yalnız aynı malzeme'));
    expect(within(bolum).queryByRole('table')).toBeNull();
    expect(within(bolum).getByText('Satın alma alternatif seçemez.')).toBeTruthy();
    expect((await gonder(cagrilar)).kabul).toEqual({ yalnizAyni: true, sartliKabul: false, kaliteler: null, durumlar: null, payMm: null });
  });

  it('yalnız aynı kaldırılınca önceki daraltma geri gelir', async () => {
    const cagrilar = sunucuKur();
    sar(<TalepAc />);
    await kartSec(/ORN-HM-00021/);
    const bolum = await screen.findByRole('region', { name: 'Kabul sınırları' });
    fireEvent.click(within(bolum).getByRole('button', { name: /7075/ }));
    fireEvent.click(within(bolum).getByLabelText('Yalnız aynı malzeme'));
    fireEvent.click(within(bolum).getByLabelText('Yalnız aynı malzeme'));
    expect(within(bolum).getByRole('button', { name: /7075/ }).getAttribute('aria-pressed')).toBe('false');
    expect((await gonder(cagrilar)).kabul).toEqual({ yalnizAyni: false, sartliKabul: false, kaliteler: ['6061'], durumlar: null, payMm: null });
  });

  it('kapalı kartta gerekçe görünür, seçim yok; hammadde dışı kartta bölüm yok ve zarf okunmaz', async () => {
    zarf = { ...ZARF, kapali: true, gerekce: 'Deneme müşteri şartı' };
    const cagrilar = sunucuKur();
    sar(<TalepAc />);
    await kartSec(/ORN-HM-00021/);
    expect(await screen.findByText(/alternatif kapalı: Deneme müşteri şartı/)).toBeTruthy();
    expect(screen.queryByLabelText('Yalnız aynı malzeme')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Değiştir' }));
    await kartSec(/ORN-SR-00007/);
    expect(screen.queryByRole('region', { name: 'Kabul sınırları' })).toBeNull();
    expect(cagrilar.filter((c) => c.yol.startsWith('/satin-alma-kabul-zarfi/')).map((c) => c.yol)).toEqual(['/satin-alma-kabul-zarfi/21']);
  });

  it('Taleplerim daraltılmış sınırı tek satırda gösterir; sınırsız kalemde satır yok', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json(200, { talepler: [talep([
      { ad: 'Deneme çubuk', miktar: '6', birim: 'adet', kartBekliyor: false, uygulanan: null, fasonAdim: null, malzemeNo: 21,
        kabul: { yalnizAyni: false, sartliKabul: false, kaliteler: ['6061'], durumlar: [], payMm: 2 } },
      { ad: 'Deneme lama', miktar: '1', birim: 'adet', kartBekliyor: false, uygulanan: null, fasonAdim: null, malzemeNo: 22, kabul: null },
    ])], toplam: 1 } satisfies TaleplerimCevabi)));
    sar(<Taleplerim tam />);
    fireEvent.click(await screen.findByRole('button', { expanded: false }));
    expect(await screen.findByText('Kabul sınırı: kalite muadili 6061 · durum yalnız istenen · ölçü en çok +2 mm')).toBeTruthy();
    expect(screen.getAllByText(/^Kabul sınırı:/)).toHaveLength(1);
  });
});
