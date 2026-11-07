import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ISTEK_KIMLIGI_BASLIGI } from '#paylasilan/istek-kimligi.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { KurFaizYukleme } from './KurFaizYukleme.tsx';

// Kurlar ve oranlar uydurmadır.
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
type Istek = { yontem: string; yol: string; govde: unknown; kimlik: string | null };
function sunucuKur(yukleme: () => Response = () => json(200, { eklenen: 1, ayni: 1, farkli: 1 })) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    istekler.push({ yontem: secenek?.method ?? 'GET', yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) : undefined, kimlik: new Headers(secenek?.headers).get(ISTEK_KIMLIGI_BASLIGI) });
    if (yol.startsWith('/finans/oran-araligi')) {
      return json(200, { kurlar: [{ paraBirimi: 'USD', tarih: '2026-10-27', alis: '41.850000', satis: '41.950000' }, { paraBirimi: 'EUR', tarih: '2026-10-27', alis: '48.600000', satis: '48.700000' }], faizler: [] });
    }
    if (yol === '/finans/oranlar/toplu-yukle') return yukleme();
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}
function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><KurFaizYukleme bugun="2026-10-28" /></BildirimSaglayici></QueryClientProvider>);
}
const sec = (metin: string) => fireEvent.change(screen.getByLabelText('Kur ve faiz dosyası'), { target: { files: [new File([metin], 'kurlar.csv', { type: 'text/csv' })] } });

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const BASLIK = 'Oran;Tarih;TRY;USD;EUR;GBP;Not';
const kaydetDugmesi = () => screen.getByRole('button', { name: /değeri kaydet/ }) as HTMLButtonElement;

describe('Kur ve faiz matrisi toplu yükleme (2238; 1083-1087)', () => {
  it('önizleme kayıtlı değerlerle karşılaştırır: yeni, aynı ve farklı ayrı sayılır; kaydet geçerli değerleri tek istekte, istek kimliğiyle gönderir', async () => {
    const istekler = sunucuKur();
    ac();
    sec(`${BASLIK}\r\nKur alış;27.10.2026;;41,85;48,6;55;\r\nKur satış;27.10.2026;;41,95;48,8;55,2;\r\n`);
    expect(await screen.findByText('Kayıtlı: 48,6 / 48,7. Atlanır; o gün elle düzeltilir.')).toBeTruthy();
    expect(screen.getByLabelText('Önizleme özeti').textContent).toBe('1 eklenecek1 aynı, atlanır1 farklı, atlanır0 hatalı');
    expect(istekler.find((i) => i.yol.startsWith('/finans/oran-araligi'))?.yol).toBe('/finans/oran-araligi?baslangic=2026-10-27&bitis=2026-10-27');
    fireEvent.click(kaydetDugmesi());
    await screen.findByText('1 değer kaydedildi, 2 değer atlandı.');
    const yazma = istekler.filter((i) => i.yontem === 'POST');
    expect(yazma).toHaveLength(1);
    expect(yazma[0]?.govde).toEqual({ satirlar: [
      { tur: 'kur', paraBirimi: 'USD', tarih: '2026-10-27', alis: 41.85, satis: 41.95 }, { tur: 'kur', paraBirimi: 'EUR', tarih: '2026-10-27', alis: 48.6, satis: 48.8 },
      { tur: 'kur', paraBirimi: 'GBP', tarih: '2026-10-27', alis: 55, satis: 55.2 },
    ] });
    expect(yazma[0]?.kimlik).toBeTruthy();
    expect(screen.queryByLabelText('Önizleme özeti')).toBeNull();
  });

  it('Tarih sütunu yoksa gün seçilir; gün değişince dosya yeniden okunur', async () => {
    const istekler = sunucuKur();
    ac();
    sec('Oran;TRY;USD\r\nKredi faizi yıllık %;30;6\r\n');
    const gun = await screen.findByLabelText('Dosyada tarih yok; değerlerin günü');
    await waitFor(() => expect(istekler.some((i) => i.yol === '/finans/oran-araligi?baslangic=2026-10-28&bitis=2026-10-28')).toBe(true));
    fireEvent.change(gun, { target: { value: '2026-10-01' } });
    await waitFor(() => expect(istekler.some((i) => i.yol === '/finans/oran-araligi?baslangic=2026-10-01&bitis=2026-10-01')).toBe(true));
    await waitFor(() => expect(kaydetDugmesi().disabled).toBe(false));
    fireEvent.click(kaydetDugmesi());
    await screen.findByText('1 değer kaydedildi, 2 değer atlandı.');
    expect(istekler.filter((i) => i.yontem === 'POST')[0]?.govde).toEqual({ satirlar: [
      { tur: 'kredi', paraBirimi: 'TRY', tarih: '2026-10-01', yillikYuzde: 30, not: null }, { tur: 'kredi', paraBirimi: 'USD', tarih: '2026-10-01', yillikYuzde: 6, not: null },
    ] });
  });

  it('hatalı değer varken hiçbir şey gönderilmez; neden satırda yazar', async () => {
    const istekler = sunucuKur();
    ac();
    sec(`${BASLIK}\r\nKur alış;29.10.2026;;42;;;\r\nKur satış;29.10.2026;;42,1;;;\r\nKredi;01.10.2026;30;;;;\r\n`);
    expect(await screen.findByText('İleri tarihli kur girilmez.')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Hatalı değer varken hiçbiri kaydedilmez; dosyayı düzeltip yeniden seçin.')).toBeTruthy());
    expect(kaydetDugmesi().disabled).toBe(true);
    expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([]);
  });

  it('sunucu reddederse ileti gösterilir, önizleme kalır', async () => {
    sunucuKur(() => json(422, { kod: 'GECERSIZ', mesaj: '1. satır: ileri tarihli kur girilmez.' }));
    ac();
    sec(`${BASLIK}\r\nKredi;01.10.2026;30;;;;\r\n`);
    await waitFor(() => expect(kaydetDugmesi().disabled).toBe(false));
    fireEvent.click(kaydetDugmesi());
    expect(await screen.findByText('1. satır: ileri tarihli kur girilmez.')).toBeTruthy();
    expect(screen.getByLabelText('Önizleme özeti')).toBeTruthy();
  });

  it('boş dosya dosya hatası verir, tablo çizilmez', async () => {
    sunucuKur();
    ac();
    sec(`${BASLIK}\r\n`);
    expect(await screen.findByText('Dosyada başlık dışında satır yok.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /değeri kaydet/ })).toBeNull();
  });
});
