import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { LogoDurumuCevabi } from '#paylasilan/sozlesme/malzemeler.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { LogoGonderimi } from './LogoGonderimi.tsx';

const TANIMCI: Kullanici = { id: 1, ad: 'Deneme Tanımcı', islemler: ['sayfa.malzemeler', 'malzemeler.tanim-yaz'] };
const OKUYUCU: Kullanici = { id: 2, ad: 'Deneme Okuyucu', islemler: ['sayfa.malzemeler'] };

const durum = (yazabilir: boolean): LogoDurumuCevabi => ({
  kartlar: [
    { id: 4, kod: 'SF-DNM-00001', ad: null, tur: 'sarf', birim: null, durum: 'bekliyor', eksikler: ['ad', 'birim', 'tur_karsiligi', 'birim_karsiligi'], hata: null, zaman: null, kayitNo: null, guncelleme: null },
    { id: 2, kod: 'HM-DNM-00002', ad: 'Deneme hata', tur: 'hammadde', birim: 'kg', durum: 'hata', eksikler: [], hata: 'Deneme Logo hatası', zaman: '2026-10-08T12:00:00+00:00', kayitNo: null, guncelleme: null },
    { id: 1, kod: 'HM-DNM-00001', ad: 'Deneme gitti', tur: 'hammadde', birim: 'kg', durum: 'gonderildi', eksikler: [], hata: null, zaman: '2026-10-08T11:00:00+00:00', kayitNo: 'LG-1', guncelleme: null },
    { id: 7, kod: 'HZ-FSN-00001', ad: 'Deneme hizmet', tur: 'hizmet', birim: 'saat', durum: 'bekliyor', eksikler: [], hata: null, zaman: null, kayitNo: null, guncelleme: null },
    { id: 8, kod: 'HZ-NAK-00001', ad: 'Deneme hizmet hata', tur: 'hizmet', birim: 'sefer', durum: 'hata', eksikler: [], hata: 'Deneme hizmet hatası', zaman: '2026-10-08T13:00:00+00:00', kayitNo: null, guncelleme: null },
    { id: 9, kod: 'HM-DNM-00003', ad: 'Deneme yeni ad', tur: 'hammadde', birim: 'kg', durum: 'gonderildi', eksikler: [], hata: null, zaman: '2026-10-08T11:00:00+00:00', kayitNo: 'LG-3', guncelleme: { durum: 'bekliyor', hata: null, zaman: '2026-10-12T09:00:00+00:00' } },
    { id: 10, kod: 'HM-DNM-00004', ad: 'Deneme ad hata', tur: 'hammadde', birim: 'kg', durum: 'gonderildi', eksikler: [], hata: null, zaman: '2026-10-08T11:00:00+00:00', kayitNo: 'LG-4', guncelleme: { durum: 'hata', hata: 'Deneme ad güncelleme hatası', zaman: '2026-10-12T09:30:00+00:00' } },
  ],
  karsiliklar: [
    { cesit: 'tur', tmiDegeri: 'hammadde', logoDegeri: '10' },
    { cesit: 'tur', tmiDegeri: 'sarf', logoDegeri: null },
    { cesit: 'tur', tmiDegeri: 'demirbas', logoDegeri: null },
    { cesit: 'tur', tmiDegeri: 'ticari_mal', logoDegeri: null },
    { cesit: 'birim', tmiDegeri: 'kg', logoDegeri: 'KG' },
  ],
  kartTuruSecenekleri: [{ kod: '10', ad: 'Hammadde' }, { kod: '11', ad: 'Yarı mamul' }, { kod: '12', ad: 'Mamul' }, { kod: '13', ad: 'Tüketim malı' }, { kod: '1', ad: 'Ticari mal' }],
  karsilikYazabilir: yazabilir,
});

const json = (kod: number, govde: unknown) => new Response(JSON.stringify(govde), { status: kod });

function sunucuKur(kullanici: Kullanici) {
  const yazilanlar: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/malzeme-logo-durumu') return json(200, durum(kullanici.islemler.includes('malzemeler.tanim-yaz')));
    if (yol === '/malzeme-logo-karsiliklari/kaydet' && secenek?.method === 'POST') {
      yazilanlar.push(JSON.parse(String(secenek.body)));
      return json(200, { id: 'x' });
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'yok' });
  }));
  return yazilanlar;
}

function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><LogoGonderimi /></BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('LogoGonderimi (kart #232)', () => {
  it('durum salt okunur: eksikli kart sunucunun sırasıyla üstte ve eksikleri açık yazılır; hata ve kayıt numarası görünür', async () => {
    sunucuKur(OKUYUCU);
    ac();
    const tablo = await screen.findByRole('table', { name: 'Logo gönderim durumu' });
    const satirlar = within(tablo).getAllByRole('row').slice(1);
    expect(satirlar.map((s) => within(s).getAllByRole('cell')[0]?.textContent)).toEqual(['SF-DNM-00001', 'HM-DNM-00002', 'HM-DNM-00001', 'HZ-FSN-00001', 'HZ-NAK-00001', 'HM-DNM-00003', 'HM-DNM-00004']);
    expect(within(satirlar[0]!).getByText('ad, birim, tür karşılığı, birim karşılığı')).toBeTruthy();
    expect(within(satirlar[0]!).getByText('Bekliyor')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('Deneme Logo hatası')).toBeTruthy();
    expect(within(satirlar[2]!).getByText('LG-1')).toBeTruthy();
    // Hizmet kartı bekliyorken bağlantıyı bekler, eksik sayılmaz; hata gibi öteki durumlar olduğu gibi görünür (kart #163).
    expect(within(satirlar[3]!).getByText('Hizmet kartı bağlantısı bekliyor')).toBeTruthy();
    expect(within(satirlar[3]!).queryByText('Bekliyor')).toBeNull();
    expect(within(satirlar[4]!).getByText('Hata')).toBeTruthy();
    expect(within(tablo).queryByRole('button')).toBeNull();
    for (const s of satirlar) expect(s.getAttribute('tabindex')).toBeNull();
  });

  it('Logo kartının ad güncellemesi gönderim durumunun yanında görünür; güncelleme hatası "Son hata"da yazılır (kart #783)', async () => {
    sunucuKur(OKUYUCU);
    ac();
    const tablo = await screen.findByRole('table', { name: 'Logo gönderim durumu' });
    const satirlar = within(tablo).getAllByRole('row').slice(1);
    expect(within(satirlar[2]!).queryByText(/Ad güncelle/)).toBeNull();
    expect(within(satirlar[5]!).getByText('Gönderildi')).toBeTruthy();
    expect(within(satirlar[5]!).getByText('Ad güncellemesi bekliyor')).toBeTruthy();
    expect(within(satirlar[6]!).getByText('Ad güncelleme hatası')).toBeTruthy();
    expect(within(satirlar[6]!).getByText('Deneme ad güncelleme hatası')).toBeTruthy();
    expect(within(satirlar[6]!).getByText('LG-4')).toBeTruthy();
  });

  it('salt okuyan karşılık satırını açamaz; boş karşılık "Boş" yazılır', async () => {
    sunucuKur(OKUYUCU);
    ac();
    const tur = await screen.findByRole('table', { name: 'Tür karşılıkları' });
    expect(within(tur).getAllByText('Boş')).toHaveLength(3);
    for (const s of within(tur).getAllByRole('row').slice(1)) expect(s.getAttribute('tabindex')).toBeNull();
  });

  it('demirbaş tür karşılığı yazılamaz: pencere nedenini söyler, kaydet düğmesi yok (LB2 a)', async () => {
    const yazilanlar = sunucuKur(TANIMCI);
    ac();
    const tur = await screen.findByRole('table', { name: 'Tür karşılıkları' });
    fireEvent.click(within(tur).getByText('Demirbaş'));
    const pencere = await screen.findByRole('dialog');
    expect(within(pencere).getByText("Demirbaş şimdilik Logo'ya gönderilmez; karşılığı boş kalır.")).toBeTruthy();
    expect(within(pencere).queryByRole('button', { name: 'Kaydet' })).toBeNull();
    expect(within(pencere).queryByRole('combobox')).toBeNull();
    expect(yazilanlar).toEqual([]);
  });

  it('tanım yazan karşılığı yazar: tür dört Logo kart türünden seçilir, birim kodu yazılır; boş bırakılan değer null gider', async () => {
    const yazilanlar = sunucuKur(TANIMCI);
    ac();
    const tur = await screen.findByRole('table', { name: 'Tür karşılıkları' });
    expect(within(tur).getByText('10 Hammadde')).toBeTruthy();
    fireEvent.click(within(tur).getByText('Sarf'));
    const pencere = await screen.findByRole('dialog');
    const secim = within(pencere).getByRole('combobox');
    expect(within(secim).getAllByRole('option').map((o) => o.textContent)).toEqual(['Boş', '10 Hammadde', '11 Yarı mamul', '12 Mamul', '13 Tüketim malı']);
    expect(within(pencere).queryByRole('textbox')).toBeNull();
    fireEvent.change(secim, { target: { value: '13' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazilanlar).toEqual([{ cesit: 'tur', tmiDegeri: 'sarf', logoDegeri: '13' }]));
    const birim = screen.getByRole('table', { name: 'Birim karşılıkları' });
    fireEvent.click(within(birim).getByText('kg'));
    const ikinci = await screen.findByRole('dialog');
    fireEvent.change(within(ikinci).getByRole('textbox'), { target: { value: '   ' } });
    fireEvent.click(within(ikinci).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazilanlar[1]).toEqual({ cesit: 'birim', tmiDegeri: 'kg', logoDegeri: null }));
  });

  it('TM2 (kart #1218): ticari malın tek seçeneği 1 Ticari mal; öteki türlerde 1 yok', async () => {
    const yazilanlar = sunucuKur(TANIMCI);
    ac();
    const tur = await screen.findByRole('table', { name: 'Tür karşılıkları' });
    fireEvent.click(within(tur).getByText('Ticari mal'));
    const pencere = await screen.findByRole('dialog');
    const secim = within(pencere).getByRole('combobox');
    expect(within(secim).getAllByRole('option').map((o) => o.textContent)).toEqual(['Boş', '1 Ticari mal']);
    fireEvent.change(secim, { target: { value: '1' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(yazilanlar).toEqual([{ cesit: 'tur', tmiDegeri: 'ticari_mal', logoDegeri: '1' }]));
  });
});
