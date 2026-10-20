import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { KisiEkIslemleriCevabi } from '#paylasilan/sozlesme/kisiler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { SayfaYetkileri } from './SayfaYetkileri.tsx';

const LISTE = {
  islemler: ['sayfa.stok', 'stok.giris', 'stok.cikis', 'sayfa.personel', 'kisiler.yaz', 'kisiler.parola-degistir'],
  devredilmez: ['kisiler.parola-degistir'],
  kisiler: [
    { id: 1, ad: 'Depocu Deneme', kullaniciAdi: 'depocu.deneme', bayrakli: false, roldenGelen: ['sayfa.stok', 'stok.giris'], ek: [] },
    { id: 2, ad: 'Yönetici Deneme', kullaniciAdi: 'yonetici.deneme', bayrakli: true, roldenGelen: [], ek: [] },
  ],
} satisfies KisiEkIslemleriCevabi;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function ac(
  islemler: Islem[] = [], degistirme: (govde: { islem: string; verildi: boolean }) => Response = () => json(200, LISTE), liste: KisiEkIslemleriCevabi = LISTE,
) {
  const gonderilenler: { yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: { body?: string } = {}) => {
    const yol = adres.replace('/api', '');
    if (yol === '/kisi-ek-islemleri') return json(200, liste);
    const govde = JSON.parse(secenek.body ?? '{}') as { islem: string; verildi: boolean };
    gonderilenler.push({ yol, govde });
    return degistirme(govde);
  }));
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  istemci.setQueryData<Kullanici>(ortakAnahtarlar.oturum, { id: 9, ad: 'Deneme', islemler });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><SayfaYetkileri /></BildirimSaglayici></QueryClientProvider>);
  return gonderilenler;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const kisiSec = async (id: string) => {
  fireEvent.change(await screen.findByLabelText('Kişi'), { target: { value: id } });
  return screen.getByRole('table', { name: 'Depocu Deneme sayfa yetkileri' });
};

describe('Sayfa yetkileri', () => {
  it('tüm yetkili kişi listede yok; kişi seçilmeden tablo yok; rolden gelen salt okunur, devredilmez işlem verilmez', async () => {
    ac(['kisiler.rol-yonet', 'ayarlar.yaz']);
    const secim = await screen.findByLabelText('Kişi');
    expect(within(secim).queryByText('Yönetici Deneme')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
    const tablo = await kisiSec('1');
    fireEvent.click(screen.getByRole('button', { name: 'Tümünü aç' }));
    expect(within(tablo).queryByRole('button', { name: 'Depocu Deneme: Stok girişi' })).toBeNull();
    expect(within(within(tablo).getByRole('rowheader', { name: /stok\.giris/ }).closest('tr')!).getByText('Rolden')).toBeTruthy();
    expect(within(tablo).queryByRole('button', { name: /Depocu Deneme: .*parola/i })).toBeNull();
    expect(within(tablo).getByText('Yalnız yönetici')).toBeTruthy();
  });

  it('yönetici rolde olmayan işleme basınca ek yetki verir; cevapla güncellenir; tekrar basınca alır', async () => {
    const verilmis = { ...LISTE, kisiler: [{ ...LISTE.kisiler[0]!, ek: ['sayfa.personel'] }, LISTE.kisiler[1]!] };
    const gonderilen = ac(['kisiler.rol-yonet', 'ayarlar.yaz'], (g) => json(200, g.verildi ? verilmis : LISTE));
    const tablo = await kisiSec('1');
    fireEvent.click(within(tablo).getByRole('button', { name: 'Personel' }));
    const hucre = within(tablo).getByRole('button', { name: 'Depocu Deneme: Personel sayfasını görme' });
    expect(hucre.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(hucre);
    await waitFor(() => expect(within(tablo).getByRole('button', { name: 'Depocu Deneme: Personel sayfasını görme' }).getAttribute('aria-pressed')).toBe('true'));
    expect(within(tablo).getByText('1 ek')).toBeTruthy();
    fireEvent.click(within(tablo).getByRole('button', { name: 'Depocu Deneme: Personel sayfasını görme' }));
    await waitFor(() => expect(gonderilen).toHaveLength(2));
    expect(gonderilen).toEqual([
      { yol: '/kisiler/1/ek-islem-degistir', govde: { islem: 'sayfa.personel', verildi: true } },
      { yol: '/kisiler/1/ek-islem-degistir', govde: { islem: 'sayfa.personel', verildi: false } },
    ]);
  });

  it('rolden de gelen işlemin ek satırı görünür ve alınabilir', async () => {
    const ikisi = { ...LISTE, kisiler: [{ ...LISTE.kisiler[0]!, ek: ['stok.giris'] }, LISTE.kisiler[1]!] };
    const gonderilen = ac(['kisiler.rol-yonet', 'ayarlar.yaz'], () => json(200, LISTE), ikisi);
    const tablo = await kisiSec('1');
    fireEvent.click(within(tablo).getByRole('button', { name: 'Stok' }));
    const satir = within(tablo).getByRole('rowheader', { name: /stok\.giris/ }).closest('tr')!;
    expect(within(satir).getByText('Rolden')).toBeTruthy();
    const dugme = within(satir).getByRole('button', { name: 'Depocu Deneme: Stok girişi' });
    expect(dugme.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(dugme);
    await waitFor(() => expect(gonderilen).toEqual([{ yol: '/kisiler/1/ek-islem-degistir', govde: { islem: 'stok.giris', verildi: false } }]));
  });

  it('düzenleme işareti olmayan kullanıcı yalnız görür; sunucu reddederse ileti çıkar', async () => {
    ac(['kisiler.rol-yonet']);
    const tablo = await kisiSec('1');
    fireEvent.click(screen.getByRole('button', { name: 'Tümünü aç' }));
    expect(within(tablo).queryByRole('button', { name: /^Depocu Deneme:/ })).toBeNull();
    cleanup();
    ac(['kisiler.rol-yonet', 'ayarlar.yaz'], () => json(403, { kod: 'YETKI', mesaj: 'Kişiye ek yetkiyi yalnızca tüm yetkileri veren role sahip kişi verebilir ve alabilir.' }));
    const ikinci = await kisiSec('1');
    fireEvent.click(within(ikinci).getByRole('button', { name: 'Personel' }));
    fireEvent.click(within(ikinci).getByRole('button', { name: 'Depocu Deneme: Personel sayfasını görme' }));
    expect(await screen.findByText(/yalnızca tüm yetkileri veren/)).toBeTruthy();
  });
});
