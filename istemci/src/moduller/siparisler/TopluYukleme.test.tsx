import ExcelJS from 'exceljs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { TopluSiparisDenetleCevabi, TopluSiparisSatiri, TopluSiparisYukleCevabi } from '#paylasilan/sozlesme/siparisler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { dosyaOku, sablonYaz } from '../../ortak/excel/kitap.ts';
import { TopluYukleme } from './TopluYukleme.tsx';
import { TOPLU_SAYFA, TOPLU_TANIM, satirlariCevir } from './toplu-yukleme.ts';

// 3455-3: Excel'den toplu satış siparişi ekranı. Veriler uydurmadır (ORN-).
const KOK = ['sayfa.siparisler', 'siparisler.oku', 'siparisler.yaz'] as Kullanici['islemler'];
const YAZAR: Kullanici = { id: 3, ad: 'Deneme Yazar', islemler: KOK };
const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yonetici', islemler: [...KOK, 'siparisler.toplu-yukle'] };

// Gerçek şablonu yazar, Siparişler sayfasına satır ekler: kullanıcının doldurduğu dosya.
async function doluDosya(satirlar: (string | number | Date | null)[][]): Promise<File> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await sablonYaz(TOPLU_TANIM));
  const ws = wb.getWorksheet(TOPLU_SAYFA);
  for (const s of satirlar) ws?.addRow(s);
  return new File([await wb.xlsx.writeBuffer() as ArrayBuffer], 'orn-siparisler.xlsx');
}
const SATIRLAR = [
  ['ORN-F1', 'ORN-1', new Date('2026-03-02T00:00:00Z'), new Date('2026-04-15T00:00:00Z'), 'ORN-M1', 12, 1.5, 'Üret', null, null, 'Evet'],
  ['ORN-F1', 'ORN-1', '02.03.2026', '01.06.2026', 'ORN-T1', 4, null, null, 'TRY', 20, null],
  [null, null, null, null, null, null, null, null, null, null, null],
  ['ORN-F1', 'ORN-2', new Date('2026-03-02T00:00:00Z'), new Date('2026-04-15T00:00:00Z'), 'ORN-YOK', 1, null, null, null, null, 'Hayır'],
];

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Istek { yontem: string; yol: string; govde: unknown; kimlik?: string }
function sunucuKur(kullanici: Kullanici, yollar: Record<string, (govde: unknown) => Response>): Istek[] {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    const govde = secenek?.body ? JSON.parse(String(secenek.body)) : undefined;
    const kimlik = (secenek?.headers as Record<string, string> | undefined)?.['istek-kimligi'];
    istekler.push({ yontem, yol, govde, ...(kimlik === undefined ? {} : { kimlik }) });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    const isle = yollar[`${yontem} ${yol.split('?')[0] ?? ''}`];
    return isle ? isle(govde) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}
function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <MemoryRouter initialEntries={['/siparisler/toplu-yukleme']}>
          <Routes>
            <Route path="/siparisler/toplu-yukleme" element={<TopluYukleme />} />
            <Route path="*" element={<p>Başka sayfa</p>} />
          </Routes>
        </MemoryRouter>
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
}
const denetim = (satirlar: readonly TopluSiparisSatiri[], hatali: number[] = []): TopluSiparisDenetleCevabi => ({
  satirlar: satirlar.map((s) => ({
    sira: s.sira, firma: { id: 1, kod: 'ORN-F1', ad: 'ORN Müşteri' },
    malzeme: s.malzeme === 'ORN-YOK' ? null : { no: 10, kod: s.malzeme ?? '', ad: 'ORN Kart' }, grup: `ORN-F1|${s.siparisNo ?? ''}`,
    hatalar: hatali.includes(s.sira) ? [{ alan: 'malzeme' as const, ileti: 'Malzeme kartı bulunamadı.' }] : [],
  })),
  siparisSayisi: new Set(satirlar.map((s) => s.siparisNo)).size,
  hataliSatir: hatali.length,
});
const sec = async (f: File) => {
  const girdi = await screen.findByLabelText('Sipariş dosyası');
  fireEvent.change(girdi, { target: { files: [f] } });
};
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('3455-3 toplu sipariş yükleme', () => {
  it('doldurulmuş şablon satırlara çevrilir: Excel tarihi ve gg.aa.yyyy metni YYYY-AA-GG, boş satır atlanır, Logo Evet siparişin bütün satırlarını işaretler', async () => {
    const s = satirlariCevir((await dosyaOku(TOPLU_TANIM, await doluDosya(SATIRLAR)))[TOPLU_SAYFA] ?? []);
    expect(s.map((r) => r.sira)).toEqual([2, 3, 5]);
    expect(s[0]).toEqual({
      sira: 2, firma: 'ORN-F1', siparisNo: 'ORN-1', siparisTarihi: '2026-03-02', termin: '2026-04-15', malzeme: 'ORN-M1', miktar: '12', birimFiyat: '1.5',
      karsilama: 'Üret', paraBirimi: null, kdvOrani: null, logo: true,
    });
    expect([s[1]?.siparisTarihi, s[1]?.termin, s[1]?.kdvOrani, s[1]?.logo, s[2]?.logo]).toEqual(['2026-03-02', '2026-06-01', '20', true, false]);
  });

  it('yetkisi olmayan yükleme ekranını görmez ve dosya seçemez', async () => {
    sunucuKur(YAZAR, {});
    ac();
    expect(await screen.findByText('Toplu yükleme yalnız yöneticiye açıktır.')).toBeTruthy();
    expect(screen.queryByLabelText('Sipariş dosyası')).toBeNull();
  });

  it('hatalı satır varken kaydet kapalıdır; yalnız hatalılar süzülür, hata sütun adıyla yazılır', async () => {
    const istekler = sunucuKur(YONETICI, {
      'POST /siparisler/toplu-yukleme/denetle': (g) => json(200, denetim((g as { satirlar: TopluSiparisSatiri[] }).satirlar, [5])),
    });
    ac();
    await sec(await doluDosya(SATIRLAR));
    const kaydet = await screen.findByRole('button', { name: '2 siparişi taslak olarak kaydet' });
    expect((kaydet as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/1 satır hatalı; hepsi düzelene kadar hiçbir sipariş kaydedilmez/)).toBeTruthy();
    const tablo = screen.getByRole('table', { name: 'Yüklenecek satırlar' });
    expect(within(tablo).getByText('Malzeme kodu: Malzeme kartı bulunamadı.')).toBeTruthy();
    expect(within(tablo).getByText('15.04.2026')).toBeTruthy();
    expect(screen.getByText(/^3 satır · 2 sipariş/).textContent).toBe('3 satır · 2 sipariş · 1 hatalı');
    expect(within(tablo).getAllByRole('columnheader').map((h) => h.textContent)).toContain('Müşteri sipariş no');
    expect(within(tablo).queryByText('ORN-M1')).toBeNull();
    fireEvent.click(screen.getByLabelText('Yalnız hatalı satırlar'));
    expect(within(tablo).getByText('ORN-M1')).toBeTruthy();
    const denetle = istekler.find((i) => i.yol === '/siparisler/toplu-yukleme/denetle');
    expect(denetle?.kimlik).toBeTruthy();
    expect((denetle?.govde as { satirlar: unknown[] }).satirlar).toHaveLength(3);
    expect(istekler.some((i) => i.yol === '/siparisler/toplu-yukleme')).toBe(false);
  });

  it('hatasız dosyada Logo işareti siparişin bütün satırlarında ve hepsinde değişir; kaydet satırlar ve dosya adıyla gider, açılan siparişler bağlantıyla görünür', async () => {
    const istekler = sunucuKur(YONETICI, {
      'POST /siparisler/toplu-yukleme/denetle': (g) => json(200, denetim((g as { satirlar: TopluSiparisSatiri[] }).satirlar)),
      'POST /siparisler/toplu-yukleme': () => json(200, {
        siparisler: [{ id: 41, no: 'SS-2026-0041', musteriSiparisNo: 'ORN-1' }, { id: 42, no: 'SS-2026-0042', musteriSiparisNo: 'ORN-2' }], denetim: null,
      } satisfies TopluSiparisYukleCevabi),
    });
    ac();
    await sec(await doluDosya(SATIRLAR));
    const kaydet = await screen.findByRole('button', { name: '2 siparişi taslak olarak kaydet' });
    await waitFor(() => { expect((kaydet as HTMLButtonElement).disabled).toBe(false); });
    expect((screen.getByLabelText('Yalnız hatalı satırlar') as HTMLInputElement).disabled).toBe(true);
    const logo = (sira: number) => screen.getByLabelText(`Satır ${String(sira)} Logo'ya bağlanacak`) as HTMLInputElement;
    expect([logo(2).checked, logo(3).checked, logo(5).checked]).toEqual([true, true, false]);
    fireEvent.click(logo(5));
    expect([logo(2).checked, logo(3).checked, logo(5).checked]).toEqual([true, true, true]);
    expect((screen.getByLabelText("Hepsi Logo'ya bağlanacak") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(screen.getByLabelText("Hepsi Logo'ya bağlanacak"));
    expect([logo(2).checked, logo(3).checked, logo(5).checked]).toEqual([false, false, false]);
    fireEvent.click(logo(3));
    expect([logo(2).checked, logo(3).checked, logo(5).checked]).toEqual([true, true, false]);
    fireEvent.click(kaydet);
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/siparisler/toplu-yukleme')).toBe(true); });
    const yukle = istekler.find((i) => i.yol === '/siparisler/toplu-yukleme');
    expect(yukle?.kimlik).toBeTruthy();
    const g = yukle?.govde as { dosyaAdi: string; satirlar: TopluSiparisSatiri[] };
    expect(g.dosyaAdi).toBe('orn-siparisler.xlsx');
    expect(g.satirlar.map((s) => [s.sira, s.logo])).toEqual([[2, true], [3, true], [5, false]]);
    const baglanti = await screen.findByRole('link', { name: 'SS-2026-0041' });
    expect(baglanti.getAttribute('href')).toBe('/siparisler/41');
  });

  it('kayıt anında denetim tutmazsa hiçbir şey yazılmadığı söylenir ve hatalılar görünür', async () => {
    sunucuKur(YONETICI, {
      'POST /siparisler/toplu-yukleme/denetle': (g) => json(200, denetim((g as { satirlar: TopluSiparisSatiri[] }).satirlar)),
      'POST /siparisler/toplu-yukleme': (g) => json(200, { siparisler: null, denetim: denetim((g as { satirlar: TopluSiparisSatiri[] }).satirlar, [2]) } satisfies TopluSiparisYukleCevabi),
    });
    ac();
    await sec(await doluDosya(SATIRLAR));
    const kaydet = await screen.findByRole('button', { name: '2 siparişi taslak olarak kaydet' });
    await waitFor(() => { expect((kaydet as HTMLButtonElement).disabled).toBe(false); });
    fireEvent.click(kaydet);
    expect(await screen.findByText(/hiçbir sipariş yazılmadı/)).toBeTruthy();
    expect((screen.getByLabelText('Yalnız hatalı satırlar') as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('link', { name: /SS-2026/ })).toBeNull();
  });

  it('başka şablon reddedilir, sunucuya gitmez', async () => {
    const istekler = sunucuKur(YONETICI, {});
    ac();
    const wb = new ExcelJS.Workbook();
    wb.addWorksheet(TOPLU_SAYFA).addRow(['ORN-F1']);
    await sec(new File([await wb.xlsx.writeBuffer() as ArrayBuffer], 'baska.xlsx'));
    expect((await screen.findByRole('alert')).textContent).toContain('şablonu değil');
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });
});
