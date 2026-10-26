import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import { ORNEK_AYAR } from '../ornek-veri.ts';
import { OKUYAN, YONETICI, json, sunucuKur, yeniEkranAc } from '../test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ADRES = '/malzemeler/kilavuz';

describe('M4 Kılavuz', () => {
  test('prototipteki bölümler aynı sırayla', async () => {
    sunucuKur(YONETICI);
    yeniEkranAc(ADRES);
    await screen.findByRole('heading', { name: 'Kart nasıl açılır?' });
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Kart nasıl açılır?', 'Akış şeması', 'Hangi türü seçmeliyim?', 'Kod nasıl oluşur?', 'Arama kutusuna nasıl yazmalıyım?',
      'Yeni kart mı, değişiklik mi?', 'Mükerrer gerekçesi nasıl yazılır?', 'Roller', 'Sahada QR ile kart açma', 'Sık yapılan hatalar',
    ]);
    expect(screen.getAllByRole('listitem').filter((l) => l.classList.contains('tc-ml-tur'))).toHaveLength(7);
  });

  test('arama örnekleri arama ayrıştırıcısıyla çözülür (yıldızlı ölçü varsayılan)', async () => {
    sunucuKur(YONETICI);
    yeniEkranAc(ADRES);
    const tablo = await screen.findByRole('table', { name: 'Arama örnekleri' });
    const satir = within(tablo).getByText('316L 2B 3x1250x2500').closest('tr');
    expect(satir?.textContent).toContain('Kalite');
    expect(satir?.textContent).toContain('316L');
    expect(satir?.textContent).toContain('3×1.250×2.500'); // prototipin fmt'si binlik ayırır
    const lama = within(tablo).getByText('ST37 lama 40x5').closest('tr');
    expect(lama?.textContent).toContain('Ölçü40×5×6.000*');
  });

  test('rol tablosu üç rolü ve senin rolünü gösterir; rolü olmayan kişide satır yazılmaz', async () => {
    sunucuKur(YONETICI);
    yeniEkranAc(ADRES);
    const tablo = await screen.findByRole('table', { name: 'Roller ve yetkiler' });
    expect(within(tablo).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Yapılabilecekler', 'Kart açan', 'Ana veri sorumlusu', 'Yönetici']);
    expect(screen.getByText(/Senin rolün:/).textContent).toContain('Yönetici');
    cleanup();

    sunucuKur(OKUYAN, { 'GET /malzeme-katalogu-ayarlari': () => json(200, { ...ORNEK_AYAR, rol: null, ayarYazabilir: false }) });
    yeniEkranAc(ADRES);
    await screen.findByRole('table', { name: 'Roller ve yetkiler' });
    expect(screen.queryByText(/Senin rolün:/)).toBeNull();
    expect(screen.getByText(/Roller TMI yetkilerinden gelir\./)).toBeTruthy();
  });
});
