import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { YENI_EKRAN_ILETISI } from '../../../ortak/rota/yeni-ekran.tsx';
import { KAPISIZ, OKUYAN, YAZAN, YONETICI, sunucuKur, yeniEkranAc } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('MalzemelerYeni', () => {
  test('kapı işlemi olmayan malzeme yöneticisi yeni ekranı görmez (reddedilen)', async () => {
    sunucuKur(KAPISIZ);
    yeniEkranAc('/malzemeler/yeni-ekran');
    expect(await screen.findByText(YENI_EKRAN_ILETISI)).toBeTruthy();
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  test('yönetici kökte Katalog bölümünü ve altı sekmeyi görür (izinli)', async () => {
    sunucuKur(YONETICI);
    yeniEkranAc('/malzemeler/yeni-ekran');
    const sekmeler = await screen.findAllByRole('tab');
    expect(sekmeler.map((s) => s.textContent)).toEqual(['Yeni kart', 'Katalog', 'Şablonlar', 'Malzeme ayarları', 'Logo gönderimi', 'Kılavuz']);
    expect(screen.getByRole('tab', { name: 'Katalog' }).getAttribute('aria-selected')).toBe('true');
  });

  test('yalnız okuyan Yeni kart sekmesini görmez; adresle gelse de bölüm açılmaz', async () => {
    sunucuKur(OKUYAN);
    yeniEkranAc('/malzemeler/yeni-ekran/kart');
    expect(await screen.findByText('Bu bölümü görme yetkin yok.')).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Yeni kart' })).toBeNull();
  });

  test('yazan Yeni kart bölümünü adresinden açar; eski ekranın yolu yakalamaz', async () => {
    sunucuKur(YAZAN);
    yeniEkranAc('/malzemeler/yeni-ekran/kart');
    // Bölümün içeriği M1'indir; burada yalnız seçili sekme ve yetki engelinin olmadığı denetlenir.
    expect((await screen.findByRole('tab', { name: 'Yeni kart' })).getAttribute('aria-selected')).toBe('true');
    expect(screen.queryByText('Bu bölümü görme yetkin yok.')).toBeNull();
    expect(screen.queryByText('Bu bölüm yok.')).toBeNull();
  });

  test('tanımsız bölüm "yok" der', async () => {
    sunucuKur(YONETICI);
    yeniEkranAc('/malzemeler/yeni-ekran/bilinmeyen');
    expect(await screen.findByText('Bu bölüm yok.')).toBeTruthy();
  });

  test('ayarlar okunamazsa hata ve yeniden dene', async () => {
    sunucuKur(YONETICI, { 'GET /malzeme-katalogu-ayarlari': () => new Response('{"kod":"HATA","mesaj":"x"}', { status: 500 }) });
    yeniEkranAc('/malzemeler/yeni-ekran');
    expect(await screen.findByText('Malzeme ayarları okunamadı.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeTruthy();
  });
});
