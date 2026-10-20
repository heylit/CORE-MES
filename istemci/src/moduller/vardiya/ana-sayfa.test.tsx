import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { PlanliDurusListeCevabi, TakvimCevabi, VardiyaPersoneliCevabi } from '#paylasilan/sozlesme/vardiya.ts';
import { anaSayfaKartlari, vardiyamOzeti } from './ana-sayfa.tsx';

// 2026-10-12 pazartesidir (ISO gün 1).
const TAKVIM: TakvimCevabi = {
  vardiyalar: [
    { id: 1, ad: 'Gündüz', baslangic: '08:00', bitis: '16:00', aktif: true, surum: 1, molalar: [], netDakika: 480 },
    { id: 2, ad: 'Akşam', baslangic: '16:00', bitis: '00:00', aktif: true, surum: 1, molalar: [], netDakika: 480 },
    { id: 3, ad: 'Pasif', baslangic: '00:00', bitis: '08:00', aktif: false, surum: 1, molalar: [], netDakika: 480 },
  ],
  matris: [
    { isMerkeziId: 10, gun: 1, vardiyaId: 1 }, { isMerkeziId: 10, gun: 1, vardiyaId: 2 }, { isMerkeziId: 11, gun: 1, vardiyaId: 1 },
    { isMerkeziId: 11, gun: 1, vardiyaId: 3 }, { isMerkeziId: 12, gun: 1, vardiyaId: 2 }, { isMerkeziId: 10, gun: 2, vardiyaId: 3 },
  ],
  gunler: [],
  isMerkezleri: [
    { id: 10, kod: 'IM-A', ad: 'Deneme A', aktif: true, haftalikDakika: 0 },
    { id: 11, kod: 'IM-B', ad: 'Deneme B', aktif: true, haftalikDakika: 0 },
    { id: 12, kod: 'IM-P', ad: 'Deneme pasif', aktif: false, haftalikDakika: 0 },
  ],
  kadro: [], kisiVardiyalari: [],
  bugun: '2026-10-12',
};
const PERSONEL: VardiyaPersoneliCevabi = {
  personel: [
    { kisiId: 7, ad: 'Deneme Bir', istasyonId: 3, isMerkeziId: 10, vardiyaId: 1 },
    { kisiId: 8, ad: 'Deneme İki', istasyonId: 4, isMerkeziId: 10, vardiyaId: null },
    { kisiId: 9, ad: 'Deneme Üç', istasyonId: 5, isMerkeziId: 11, vardiyaId: null },
  ],
};
const DURUSLAR: PlanliDurusListeCevabi = { satirlar: [], toplam: 4, sayfa: 1, sayfaBoyu: 1 };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function kur(takvim: Response = new Response(JSON.stringify(TAKVIM)), personel: Response = new Response(JSON.stringify(PERSONEL))): string[] {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn((adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === '/oturum') return Promise.resolve(new Response(JSON.stringify({ kullanici: { id: 1, ad: 'Deneme', islemler: ['sayfa.vardiya'] } } satisfies OturumCevabi)));
    if (yol === '/vardiya-takvimi') return Promise.resolve(takvim.clone());
    if (yol === '/vardiya-personeli') return Promise.resolve(personel.clone());
    if (yol.startsWith('/planli-duruslar')) return Promise.resolve(new Response(JSON.stringify(DURUSLAR)));
    return Promise.resolve(new Response('{}', { status: 404 }));
  }));
  const Hepsi = () => <>{anaSayfaKartlari.map(({ anahtar, ekran: Ekran }) => <Ekran key={anahtar} />)}</>;
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter><Hepsi /></MemoryRouter>
    </QueryClientProvider>,
  );
  return yollar;
}

const kart = (baslik: string) => screen.getByText(baslik).closest('.tc-sayi-karti');

describe('vardiya ana sayfa kartları (#489)', () => {
  it('bugünkü vardiya: yalnız aktif merkezde aktif vardiya sayılır; planlı duruş aktif tanım sayısıdır', async () => {
    const yollar = kur();
    await waitFor(() => expect(kart('Bugünkü vardiya')?.textContent).toContain('2 iş merkezinde'));
    expect(kart('Bugünkü vardiya')?.querySelector('.tc-sayi-deger')?.textContent).toBe('2');
    expect(kart('Bugünkü vardiya')?.getAttribute('href')).toBe('/vardiya');
    await waitFor(() => expect(kart('Planlı duruş')?.querySelector('.tc-sayi-deger')?.textContent).toBe('4'));
    expect(kart('Planlı duruş')?.getAttribute('href')).toBe('/vardiya/planli-duruslar');
    expect(yollar).toContain('/planli-duruslar?yalnizAktif=true&sayfaBoyu=1');
  });

  it('tatil günü vardiya sıfırdır ve nedeni yazar', async () => {
    kur(new Response(JSON.stringify({ ...TAKVIM, gunler: [{ tarih: '2026-10-12', tur: 'tatil', ad: 'Deneme bayram' }] })));
    await waitFor(() => expect(kart('Bugünkü vardiya')?.textContent).toContain('Tatil: Deneme bayram'));
    expect(kart('Bugünkü vardiya')?.querySelector('.tc-sayi-deger')?.textContent).toBe('0');
  });

  it('reddedilen: takvim alınamazsa sıfır yazmaz', async () => {
    kur(new Response('{}', { status: 500 }));
    await waitFor(() => expect(kart('Bugünkü vardiya')?.textContent).toContain('Alınamadı'));
  });

  it('vardiyası seçilmemiş kişi: istasyona atanmış ve vardiyası olmayanlar sayılır, personel ekranına götürür', async () => {
    kur();
    await waitFor(() => expect(kart('Vardiyası seçilmemiş kişi')?.querySelector('.tc-sayi-deger')?.textContent).toBe('2'));
    expect(kart('Vardiyası seçilmemiş kişi')?.getAttribute('href')).toBe('/vardiya/personel');
  });

  it('reddedilen: personel alınamazsa vardiyasız kişi sıfır yazmaz', async () => {
    kur(undefined, new Response('{}', { status: 500 }));
    await waitFor(() => expect(kart('Vardiyası seçilmemiş kişi')?.textContent).toContain('Alınamadı'));
  });

  it('kartlar vardiya işlemleriyle görünür; vardiyasız kişi yalnız vardiya yazanın işidir', () => {
    expect(anaSayfaKartlari.map((k) => [k.anahtar, k.islem, k.bolum])).toEqual([
      ['vardiya-secilmeyen', 'vardiya.yaz', 'is'],
      ['vardiya-vardiyam', 'terminal.uret', 'ozet'],
      ['vardiya-bugun', 'sayfa.vardiya', 'ozet'],
      ['vardiya-planli-durus', 'sayfa.vardiya', 'ozet'],
    ]);
  });

  it('vardiyam: oturumdaki kişinin vardiyası adı ve saatleriyle yazar; kart başka sayfaya götürmez', async () => {
    kur(new Response(JSON.stringify({ ...TAKVIM, kisiVardiyalari: [{ kisiId: 2, vardiyaId: 1 }, { kisiId: 1, vardiyaId: 2 }] })));
    await waitFor(() => expect(kart('Vardiyam')?.querySelector('.tc-sayi-deger')?.textContent).toBe('Akşam'));
    expect(kart('Vardiyam')?.textContent).toContain('16:00 - 00:00');
    expect(kart('Vardiyam')?.getAttribute('href')).toBeNull();
  });

  it('vardiyam: seçilmemişse uydurmaz; tatil ve kapalı gün vardiyanın önüne geçer; takvim alınamazsa "Alınamadı"', async () => {
    expect(vardiyamOzeti(TAKVIM, 1)).toEqual({ metin: 'Seçilmemiş', altMetin: 'Vardiyanızı amirinize sorun' });
    const atanmis = { ...TAKVIM, kisiVardiyalari: [{ kisiId: 1, vardiyaId: 1 }] };
    expect(vardiyamOzeti({ ...atanmis, gunler: [{ tarih: '2026-10-12', tur: 'tatil', ad: 'Deneme bayram' }] }, 1))
      .toEqual({ metin: 'Tatil', altMetin: 'Deneme bayram' });
    expect(vardiyamOzeti({ ...atanmis, gunler: [{ tarih: '2026-10-12', tur: 'kapali', ad: null }] }, 1))
      .toEqual({ metin: 'Kapalı gün', altMetin: 'Bugün çalışma yok' });
    kur(new Response('{}', { status: 500 }));
    await waitFor(() => expect(kart('Vardiyam')?.textContent).toContain('Alınamadı'));
  });
});
