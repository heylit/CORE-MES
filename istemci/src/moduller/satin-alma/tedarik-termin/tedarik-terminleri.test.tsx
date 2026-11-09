import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { TedarikTerminleriCevabi, TerminKarsilayani, TerminTakipSatiri } from '#paylasilan/sozlesme/satin-alma.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { TedarikTerminleri } from './TedarikTerminleri.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum, headers: { 'content-type': 'application/json' } });
// Kodlar, numaralar ve kişi uydurmadır.
const satir = (ek: Partial<TerminTakipSatiri>): TerminTakipSatiri => ({
  anahtar: 'malzeme:11', tur: 'malzeme', malzemeNo: 11, kod: 'HM-DEN-00001', ad: 'Deneme mil', birim: 'kg', ihtiyacMiktari: '120', gerekenTarih: '2026-11-06',
  emirler: ['UE-DEN-001', 'UE-DEN-002'], karsilayanlar: [], karsilanan: '0', eksik: '120', karsilayanTarih: null, elleTermin: null, durum: 'termin_bekleniyor', ...ek,
});
const siparis = (ek: Partial<TerminKarsilayani>): TerminKarsilayani => ({
  tur: 'siparis', talepId: '00000000-0000-4000-8000-000000000001', talepNo: 'ST-DEN-001', talepDurumu: 'siparis_verildi', teklifId: null,
  siparisNo: 'SP-DEN-001', tarih: '2026-11-12', miktar: '120', birim: 'kg', ...ek,
});

function Adres() {
  const k = useLocation();
  const taslak = (k.state as { taslak?: { miktar: number; malzeme: { no: number } }[] } | null)?.taslak;
  return <p>{`Adres ${k.pathname}${k.search}${taslak ? ` taslak ${taslak[0]!.malzeme.no} ${taslak[0]!.miktar}` : ''}`}</p>;
}

interface Istek { yontem: string; yol: string; govde: unknown }
function ac(takip: TerminTakipSatiri[], islemler: string[] = ['satin-alma.oku', 'satin-alma.yaz', 'satin-alma.talep-ac'], kaydet: () => Response = () => json(200, {})) {
  const istekler: Istek[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, i?: RequestInit) => {
    const yol = adres.replace('/api', '');
    istekler.push({ yontem: i?.method ?? 'GET', yol, govde: i?.body ? JSON.parse(String(i.body)) : undefined });
    if (yol === '/oturum') return json(200, { kullanici: { id: 9, ad: 'Deneme Alıcı', islemler } });
    if (yol === '/satin-alma-tedarik-terminleri') return json(200, { terminler: [], takip, bugun: '2026-11-09' } satisfies TedarikTerminleriCevabi);
    return kaydet();
  }));
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={['/satin-alma/tedarik-terminleri']}>
        <BildirimSaglayici><Routes>
          <Route path="/satin-alma/tedarik-terminleri" element={<TedarikTerminleri />} />
          <Route path="*" element={<Adres />} />
        </Routes></BildirimSaglayici>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return istekler;
}
const tablo = () => screen.findByRole('table', { name: 'Termin takibi' });
const satirOf = (metin: string) => screen.getByText(metin).closest('tr') as HTMLElement;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const KARISIK = [
  satir({ anahtar: 'a', kod: 'HM-DEN-A', durum: 'gecikti', karsilayanlar: [siparis({})], eksik: '0', karsilayanTarih: '2026-11-12' }),
  satir({ anahtar: 'b', kod: 'HM-DEN-B', durum: 'eksik', karsilayanlar: [siparis({ siparisNo: 'SP-DEN-002', miktar: '20' })], eksik: '100' }),
  satir({ anahtar: 'c', kod: 'HM-DEN-C', durum: 'termin_bekleniyor' }),
  satir({ anahtar: 'd', kod: 'HM-DEN-D', durum: 'teslim_tarihi_yok', karsilayanlar: [siparis({ siparisNo: 'SP-DEN-004', tarih: null })], eksik: '0' }),
  satir({ anahtar: 'e', kod: null, malzemeNo: null, tur: 'hizmet', ad: 'Deneme ısıl işlem', birim: 'adet', durum: 'talep_yolda', eksik: null,
    karsilayanlar: [siparis({ tur: 'talep', siparisNo: null, talepNo: 'ST-DEN-046', talepDurumu: 'teklif_isteniyor', tarih: '2026-11-19', miktar: '60', birim: 'adet' })] }),
  satir({ anahtar: 'f', kod: 'HM-DEN-F', durum: 'zamaninda', karsilayanlar: [siparis({ siparisNo: 'SP-DEN-006', tarih: '2026-11-01' })], eksik: '0' }),
  satir({ anahtar: 'g', kod: 'DNM-7', malzemeNo: null, tur: 'fason', ad: 'Deneme flanş, Op 30', birim: 'adet', durum: 'gec_kaliyor', emirler: ['UE-DEN-007 · Op 30'],
    karsilayanlar: [siparis({ siparisNo: 'SP-DEN-007', tarih: '2026-11-18', birim: 'adet', miktar: '40' })], eksik: '0' }),
  satir({ anahtar: 'h', kod: 'HM-DEN-H', durum: 'plan_istemiyor', eksik: null }),
];

describe('Termin takibi (2433)', () => {
  it('varsayılan Sorunlu: zamanında ve talepte olan görünmez; sayı kartları ve sekme sayıları sunucunun durumundan', async () => {
    ac(KARISIK);
    const t = await tablo();
    expect(within(t).getByText('HM-DEN-A')).toBeTruthy();
    expect(within(t).queryByText('HM-DEN-F')).toBeNull();
    expect(within(t).queryByText('Deneme ısıl işlem')).toBeNull();
    expect(within(screen.getByRole('tab', { name: /Sorunlu/ })).getByText('5')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Tümü/ }));
    expect(within(await tablo()).getByText('HM-DEN-F')).toBeTruthy();
  });

  it('sorunlu sekmelerin sayıları toplamı Sorunlu; tarihsiz sipariş kendi sekmesinde; Talepte sayısı rozetsiz', async () => {
    ac(KARISIK);
    await tablo();
    const sayi = (ad: RegExp) => Number(within(screen.getByRole('tab', { name: ad })).queryByText(/^\d+$/)?.textContent ?? 'NaN');
    const parcalar = [/^Gecikti/, /^Geç kalıyor/, /^Eksik/, /^Talep yok/, /^Siparişte tarih yok/].map(sayi);
    expect(parcalar).toEqual([1, 1, 1, 1, 1]);
    expect(parcalar.reduce((a, b) => a + b, 0)).toBe(sayi(/^Sorunlu/));
    fireEvent.click(screen.getByRole('tab', { name: /^Talep yok/ }));
    expect(within(await tablo()).queryByText('HM-DEN-D')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /^Siparişte tarih yok/ }));
    expect(within(await tablo()).getByText('HM-DEN-D')).toBeTruthy();
    const talepte = screen.getByRole('tab', { name: /^Talepte/ });
    expect(talepte.textContent).toContain('Talepte · 1');
    expect(within(talepte).queryByText(/^\d+$/)).toBeNull();
  });

  it('plan istemiyor yalnız Tümü\'de, pasif tonda, talep açtırmaz', async () => {
    ac(KARISIK);
    expect(within(await tablo()).queryByText('HM-DEN-H')).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: /Tümü/ }));
    const t = await tablo();
    expect(within(t).getByText('Plan istemiyor').closest('.tc-rozet')?.className).toContain('pasif');
    expect(within(satirOf('HM-DEN-H')).queryByRole('button', { name: /Talep aç/ })).toBeNull();
  });

  it('durum adları 2433-7 kararıyla; eksik rozeti miktarı söyler; geç kalıyor uyarı tonunda', async () => {
    ac(KARISIK);
    fireEvent.click(await screen.findByRole('tab', { name: /Tümü/ }));
    const t = await tablo();
    expect(within(t).getByText('Gecikti')).toBeTruthy();
    expect(within(t).getByText('Eksik 100 kg')).toBeTruthy();
    expect(within(t).getByText('Talep yok')).toBeTruthy();
    expect(within(t).getByText('Siparişte tarih yok')).toBeTruthy();
    expect(within(t).getByText('Talepte')).toBeTruthy();
    expect(within(t).getByText('Geç kalıyor').closest('.tc-rozet')?.className).toContain('uyari');
  });

  it('karşılayan en geç gelecek sipariş ya da talep; tarihsiz sipariş "teslim tarihi yok" der', async () => {
    ac(KARISIK);
    fireEvent.click(await screen.findByRole('tab', { name: /Tümü/ }));
    const t = await tablo();
    expect(within(satirOf('HM-DEN-A')).getByText('SP-DEN-001')).toBeTruthy();
    expect(within(satirOf('HM-DEN-D')).getByText(/teslim tarihi yok/)).toBeTruthy();
    expect(within(t).getByText(/talep, teklif isteniyor/)).toBeTruthy();
  });

  it('tür seçimi yalnız o türü bırakır', async () => {
    ac(KARISIK);
    await tablo();
    fireEvent.change(screen.getByLabelText('Tür'), { target: { value: 'fason' } });
    const t = await tablo();
    expect(within(t).getByText('DNM-7')).toBeTruthy();
    expect(within(t).queryByText('HM-DEN-A')).toBeNull();
  });

  it('eksik ya da talepsiz malzemede ana iş "Talep aç": Taleplerim yeni talebe eksik miktarla dolu taslak gider', async () => {
    ac(KARISIK);
    await tablo();
    fireEvent.click(within(satirOf('HM-DEN-B')).getByRole('button', { name: 'HM-DEN-B: Talep aç' }));
    expect(await screen.findByText('Adres /taleplerim?bolum=yeni taslak 11 100')).toBeTruthy();
  });

  it('siparişli satır siparişe, fason dış işlem emrine gider', async () => {
    ac(KARISIK);
    await tablo();
    fireEvent.click(within(satirOf('DNM-7')).getByRole('button', { name: 'DNM-7: Dış işlem emrine git' }));
    expect(await screen.findByText('Adres /satin-alma/dis-operasyonlar')).toBeTruthy();
    cleanup();
    ac(KARISIK);
    await tablo();
    fireEvent.click(within(satirOf('HM-DEN-A')).getByRole('button', { name: 'HM-DEN-A: Siparişe git' }));
    expect(await screen.findByText('Adres /satin-alma/talepler?talep=00000000-0000-4000-8000-000000000001&bolum=order')).toBeTruthy();
  });

  it('2433-3 a: elle termin yalnız siparişsiz malzemede; okuyan iş düğmesi görmez', async () => {
    ac(KARISIK, ['satin-alma.oku', 'plan.yaz']);
    await tablo();
    expect(within(satirOf('HM-DEN-C')).getByRole('button', { name: 'HM-DEN-C: Termin gir' })).toBeTruthy();
    expect(within(satirOf('HM-DEN-D')).queryByRole('button', { name: /Termin gir/ })).toBeNull();
    cleanup();
    ac(KARISIK, ['satin-alma.oku']);
    await tablo();
    expect(screen.queryByRole('button', { name: /Talep aç|Termin gir|Siparişe git/ })).toBeNull();
  });

  it('termin girişi sürümle gider; boş termin null gönderir; 409 iletisi görünür', async () => {
    const elle = { malzemeNo: 11, termin: '2026-11-09', gerekenTarih: '2026-11-06', aciklama: '', surum: 4, guncelleme: '2026-10-25T08:00:00.000Z' };
    const istekler = ac([satir({ durum: 'zamaninda', elleTermin: elle, eksik: '0' })], ['satin-alma.oku', 'satin-alma.yaz']);
    fireEvent.click(await screen.findByRole('tab', { name: /Tümü/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'HM-DEN-00001: Termin gir' }));
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/^Termin/), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: /Kaydet/ }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    expect(istekler.find((i) => i.yontem === 'POST')).toEqual({
      yontem: 'POST', yol: '/satin-alma-tedarik-terminleri/kaydet', govde: { malzemeNo: 11, termin: null, aciklama: '', surum: 4 },
    });
    cleanup();
    ac([satir({})], ['satin-alma.oku', 'satin-alma.yaz'], () => json(409, { kod: 'CAKISMA', mesaj: 'Kayıt başka biri tarafından değiştirildi.' }));
    fireEvent.click(await screen.findByRole('button', { name: 'HM-DEN-00001: Termin gir' }));
    fireEvent.change(within(screen.getByRole('dialog')).getByLabelText(/^Termin/), { target: { value: '2026-11-04' } });
    fireEvent.click(screen.getByRole('button', { name: /Kaydet/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('başka biri');
  });
});
