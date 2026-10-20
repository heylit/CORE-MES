import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { RolIslemleriCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { Yetkiler, grupla } from './Yetkiler.tsx';

const MATRIS = {
  islemler: ['stok.giris', 'stok.cikis', 'sayfa.stok', 'kisiler.yaz', 'sayfa.personel'],
  roller: [
    { id: 1, ad: 'Depo', yonetici: null, islemler: ['stok.giris', 'sayfa.stok'] },
    { id: 2, ad: 'Yönetici', yonetici: true, islemler: ['stok.giris', 'stok.cikis', 'sayfa.stok', 'kisiler.yaz', 'sayfa.personel'] },
  ],
} satisfies RolIslemleriCevabi;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function ac(durum = 200, islemler: Islem[] = [], degistirme: (govde: { islem: string; verildi: boolean }) => Response = () => json(200, MATRIS)) {
  const gonderilenler: { yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: { body?: string } = {}) => {
    const yol = adres.replace('/api', '');
    if (yol === '/rol-islemleri') return json(durum, durum === 200 ? MATRIS : { kod: 'SUNUCU', mesaj: 'Hata.' });
    const govde = JSON.parse(secenek.body ?? '{}') as { islem: string; verildi: boolean };
    gonderilenler.push({ yol, govde });
    return degistirme(govde);
  }));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  istemci.setQueryData<Kullanici>(ortakAnahtarlar.oturum, { id: 1, ad: 'Deneme', islemler });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><Yetkiler /></BildirimSaglayici></QueryClientProvider>);
  return gonderilenler;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const satirlar = (tablo: HTMLElement) => within(tablo).queryAllByRole('rowheader').map((h) => h.textContent);
const hucreler = (tablo: HTMLElement, baslik: string) =>
  within(within(tablo).getByRole('rowheader', { name: new RegExp(baslik) }).closest('tr')!).getAllByRole('cell').map((h) => h.textContent);

describe('Yetkiler', () => {
  it('gruplar kapali gelir ve her rolun gruptaki islem sayisini gosterir; acilan grup islemleri okunur adla listeler', async () => {
    ac();
    const tablo = await screen.findByRole('table', { name: 'Yetki matrisi' });
    expect(satirlar(tablo)).toEqual(['Personel', 'Stok']);
    expect(hucreler(tablo, '^Stok$')).toEqual(['2/3', '3/3']);
    expect(hucreler(tablo, '^Personel$')).toEqual(['Yok', '2/2']);

    fireEvent.click(within(tablo).getByRole('button', { name: 'Stok' }));
    expect(within(tablo).getByRole('button', { name: 'Stok' }).getAttribute('aria-expanded')).toBe('true');
    // Sayfayı görme işlemi grubun başındadır.
    expect(satirlar(tablo)).toEqual(['Personel', 'Stok', 'Stok Merkezi sayfasını görmesayfa.stok', 'Stok girişistok.giris', 'Stok çıkışıstok.cikis']);
    expect(hucreler(tablo, 'Stok çıkışı')).toEqual(['Yok', 'Var']);

    fireEvent.click(screen.getByRole('button', { name: 'Tümünü kapat' }));
    expect(satirlar(tablo)).toEqual(['Personel', 'Stok']);
    fireEvent.click(screen.getByRole('button', { name: 'Tümünü aç' }));
    expect(satirlar(tablo)).toHaveLength(7);
  });

  it('arama adda da kodda da eslesir, eslesen grubu acik gosterir; eslesme yoksa bos durum', async () => {
    ac();
    await screen.findByRole('table', { name: 'Yetki matrisi' });
    const arama = screen.getByLabelText('İşlem ara');
    fireEvent.change(arama, { target: { value: 'ÇIKIŞ' } });
    expect(satirlar(screen.getByRole('table'))).toEqual(['Stok', 'Stok çıkışıstok.cikis']);
    fireEvent.change(arama, { target: { value: 'kisiler.yaz' } });
    expect(satirlar(screen.getByRole('table'))).toEqual(['Personel', 'Personel ekleme ve düzenlemekisiler.yaz']);
    fireEvent.change(arama, { target: { value: 'olmayan' } });
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Aramaya uyan işlem yok');
  });

  it('rol secilince yalniz o rolun sutunu kalir', async () => {
    ac();
    const tablo = await screen.findByRole('table', { name: 'Yetki matrisi' });
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: '1' } });
    expect(within(tablo).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['İşlem', 'Depo']);
    expect(hucreler(tablo, '^Stok$')).toEqual(['2/3']);
    fireEvent.change(screen.getByLabelText('Rol'), { target: { value: '' } });
    expect(within(tablo).getAllByRole('columnheader')).toHaveLength(3);
  });

  it('matris alinamazsa hata ve yeniden dene gosterir', async () => {
    ac(500);
    expect((await screen.findByRole('alert')).textContent).toBeTruthy();
  });

  it('grupla gruplari ada gore siralar', () => {
    expect(grupla(MATRIS.islemler).map((g) => g.ad)).toEqual(['Personel', 'Stok']);
  });

  it('duzenleme isareti olmayan kullanici hucreyi degistiremez', async () => {
    ac(200, ['kisiler.rol-yonet']);
    const tablo = await screen.findByRole('table', { name: 'Yetki matrisi' });
    fireEvent.click(within(tablo).getByRole('button', { name: 'Stok' }));
    expect(within(tablo).queryByRole('button', { name: /^Depo:/ })).toBeNull();
  });

  it('yonetici hucreye basinca rol islemi alir ya da birakir; matris cevapla guncellenir; tum yetkili rolun hucresi basilmaz', async () => {
    const guncel = { ...MATRIS, roller: [{ ...MATRIS.roller[0]!, islemler: ['stok.giris', 'stok.cikis', 'sayfa.stok'] }, MATRIS.roller[1]!] };
    const gonderilen = ac(200, ['kisiler.rol-yonet', 'ayarlar.yaz'], () => json(200, guncel));
    const tablo = await screen.findByRole('table', { name: 'Yetki matrisi' });
    fireEvent.click(within(tablo).getByRole('button', { name: 'Stok' }));
    expect(within(tablo).queryByRole('button', { name: /^Yönetici:/ })).toBeNull();
    const hucre = within(tablo).getByRole('button', { name: 'Depo: Stok çıkışı' });
    expect(hucre.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(hucre);
    await waitFor(() => expect(within(tablo).getByRole('button', { name: 'Depo: Stok çıkışı' }).getAttribute('aria-pressed')).toBe('true'));
    expect(gonderilen).toEqual([{ yol: '/roller/1/islem-degistir', govde: { islem: 'stok.cikis', verildi: true } }]);
    expect(hucreler(tablo, '^Stok$')).toEqual(['3/3', '3/3']);

    fireEvent.click(within(tablo).getByRole('button', { name: 'Depo: Stok girişi' }));
    await waitFor(() => expect(gonderilen).toHaveLength(2));
    expect(gonderilen[1]?.govde).toEqual({ islem: 'stok.giris', verildi: false });
  });

  it('sunucu reddederse ileti gosterilir, matris degismez', async () => {
    ac(200, ['kisiler.rol-yonet', 'ayarlar.yaz'], () => json(403, { kod: 'YETKI', mesaj: 'Rol yetkilerini yalnızca tüm yetkileri veren role sahip kişi değiştirebilir.' }));
    const tablo = await screen.findByRole('table', { name: 'Yetki matrisi' });
    fireEvent.click(within(tablo).getByRole('button', { name: 'Stok' }));
    fireEvent.click(within(tablo).getByRole('button', { name: 'Depo: Stok çıkışı' }));
    expect(await screen.findByText(/yalnızca tüm yetkileri veren/)).toBeTruthy();
    expect(within(tablo).getByRole('button', { name: 'Depo: Stok çıkışı' }).getAttribute('aria-pressed')).toBe('false');
  });
});
