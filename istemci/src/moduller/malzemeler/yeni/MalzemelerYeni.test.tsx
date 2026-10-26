import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, screen, waitFor } from '@testing-library/react';
import { YENI_EKRAN_ILETISI } from '../../../ortak/rota/yeni-ekran.tsx';
import { KAPISIZ, OKUYAN, YAZAN, YONETICI, sunucuKur, yeniEkranAc } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('MalzemelerYeni', () => {
  test('menü adresinde (572): yeni ekran kapısı olmayan malzeme yöneticisi de açar; eski çerçeve açılmaz', async () => {
    sunucuKur(KAPISIZ);
    yeniEkranAc('/malzemeler');
    expect(await screen.findByRole('heading', { name: 'Malzemeler ve Hizmetler' })).toBeTruthy();
    expect(screen.queryByText(YENI_EKRAN_ILETISI, { exact: false })).toBeNull();
    expect(screen.queryByTitle('Malzeme Kataloğu')).toBeNull();
  });

  test('ekran kendi sekme şeridini çizmez; bölüm geçişi kabuğun şeridindedir (553 1 a)', async () => {
    sunucuKur(YONETICI);
    yeniEkranAc('/malzemeler');
    await screen.findByRole('heading', { name: 'Malzemeler ve Hizmetler' });
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  test('yalnız okuyan Yeni kart bölümünü adresle açamaz', async () => {
    sunucuKur(OKUYAN);
    yeniEkranAc('/malzemeler/yeni');
    expect(await screen.findByText('Bu bölümü görme yetkin yok.')).toBeTruthy();
  });

  test('yazan Yeni kart bölümünü menü adresinden (/malzemeler/yeni) açar', async () => {
    sunucuKur(YAZAN);
    yeniEkranAc('/malzemeler/yeni');
    await screen.findByRole('heading', { name: 'Malzemeler ve Hizmetler' });
    expect(screen.queryByText('Bu bölümü görme yetkin yok.')).toBeNull();
  });

  test('tanımsız bölüm köke (Katalog) döner, eski çerçevedeki gibi', async () => {
    sunucuKur(YONETICI);
    yeniEkranAc('/malzemeler/bilinmeyen');
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/malzemeler'); });
  });

  test('eski görünüm /malzemeler/eski altında çerçevededir', async () => {
    sunucuKur(YONETICI);
    yeniEkranAc('/malzemeler/eski/sablonlar');
    expect(await screen.findByTitle('Malzeme Kataloğu', {}, { timeout: 5000 })).toBeTruthy();
  });

  test('ayarlar okunamazsa hata ve yeniden dene', async () => {
    sunucuKur(YONETICI, { 'GET /malzeme-katalogu-ayarlari': () => new Response('{"kod":"HATA","mesaj":"x"}', { status: 500 }) });
    yeniEkranAc('/malzemeler');
    expect(await screen.findByText('Malzeme ayarları okunamadı.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeTruthy();
  });
});
