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
    if (yol.startsWith('/finans/kur-faiz-araligi')) {
      return json(200, { kurlar: [{ paraBirimi: 'USD', tarih: '2026-10-27', kur: '41.850000' }, { paraBirimi: 'EUR', tarih: '2026-10-27', kur: '48.600000' }], faizler: [], gunlukFaizler: [] });
    }
    if (yol === '/finans/kur-faiz/toplu-yukle') return yukleme();
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}
function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><KurFaizYukleme bugun="2026-10-28" /></BildirimSaglayici></QueryClientProvider>);
}
const sec = (metin: string) => fireEvent.change(screen.getByLabelText('Kur ve faiz dosyası'), { target: { files: [new File([metin], 'kurlar.csv', { type: 'text/csv' })] } });
const kaydetDugmesi = () => screen.getByRole('button', { name: /satırı kaydet/ }) as HTMLButtonElement;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Kur ve faiz toplu yükleme (1083-1087)', () => {
  it('önizleme kayıtlı değerlerle karşılaştırır: yeni, aynı ve farklı ayrı sayılır; kaydet geçerli satırları tek istekte, istek kimliğiyle gönderir', async () => {
    const istekler = sunucuKur();
    ac();
    sec('Tür;Para birimi;Tarih;Değer\r\nkur;USD;27.10.2026;41,85\r\nkur;EUR;27.10.2026;48,7\r\nkur;GBP;27.10.2026;55\r\n');
    expect(await screen.findByText('Kayıtlı: 48,6. Atlanır; o gün elle düzeltilir.')).toBeTruthy();
    expect(screen.getByLabelText('Önizleme özeti').textContent).toBe('1 eklenecek1 aynı, atlanır1 farklı, atlanır0 hatalı');
    expect(istekler.find((i) => i.yol.startsWith('/finans/kur-faiz-araligi'))?.yol).toBe('/finans/kur-faiz-araligi?baslangic=2026-10-27&bitis=2026-10-27');
    fireEvent.click(kaydetDugmesi());
    await screen.findByText('1 satır kaydedildi, 2 satır atlandı.');
    const yazma = istekler.filter((i) => i.yontem === 'POST');
    expect(yazma).toHaveLength(1);
    expect(yazma[0]?.govde).toEqual({ satirlar: [
      { tur: 'kur', paraBirimi: 'USD', tarih: '2026-10-27', deger: 41.85 }, { tur: 'kur', paraBirimi: 'EUR', tarih: '2026-10-27', deger: 48.7 },
      { tur: 'kur', paraBirimi: 'GBP', tarih: '2026-10-27', deger: 55 },
    ] });
    expect(yazma[0]?.kimlik).toBeTruthy();
    expect(screen.queryByLabelText('Önizleme özeti')).toBeNull();
  });

  it('hatalı satır varken hiçbir şey gönderilmez; neden satırda yazar', async () => {
    const istekler = sunucuKur();
    ac();
    sec('Tür;Para birimi;Tarih;Değer\r\nkur;GBP;27.10.2026;55\r\nkur;USD;29.10.2026;42\r\n');
    expect(await screen.findByText('İleri tarihli kur girilmez.')).toBeTruthy();
    await waitFor(() => expect(screen.getByText('Hatalı satır varken hiçbir satır kaydedilmez; dosyayı düzeltip yeniden seçin.')).toBeTruthy());
    expect(kaydetDugmesi().disabled).toBe(true);
    expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([]);
  });

  it('sunucu reddederse ileti gösterilir, önizleme kalır', async () => {
    sunucuKur(() => json(422, { kod: 'GECERSIZ', mesaj: '1. satır: ileri tarihli kur girilmez.' }));
    ac();
    sec('Tür;Para birimi;Tarih;Değer\r\nkur;GBP;27.10.2026;55\r\n');
    await waitFor(() => expect(kaydetDugmesi().disabled).toBe(false));
    fireEvent.click(kaydetDugmesi());
    expect(await screen.findByText('1. satır: ileri tarihli kur girilmez.')).toBeTruthy();
    expect(screen.getByLabelText('Önizleme özeti')).toBeTruthy();
  });

  it('boş dosya dosya hatası verir, tablo çizilmez', async () => {
    sunucuKur();
    ac();
    sec('Tür;Para birimi;Tarih;Değer\r\n');
    expect(await screen.findByText('Dosyada başlık dışında satır yok.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /satırı kaydet/ })).toBeNull();
  });
});
