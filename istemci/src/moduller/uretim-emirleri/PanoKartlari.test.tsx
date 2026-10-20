import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
// Kabuğun topladığı listeden okunur: modül dosyasını doğrudan açmak kabukla döngüye girer.
import { anaSayfaKartlari } from '../../ortak/rota/ana-sayfa.ts';
import { AcikEmirler, BugunUrettigim, Kuyrugum, Planlanacak } from './PanoKartlari.tsx';
import { YAZAR, ac, json, sunucuKur } from './test-ortak.tsx';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const hepsi = [
  { yol: '/', ekran: () => <><Planlanacak /><AcikEmirler /><Kuyrugum /><BugunUrettigim /></> },
];

describe('uretim emirleri pano kartlari', () => {
  it('dort kart tek istekle dolar; emir kartlari rota emir listesine gider, kisi kartlari baglantisizdir', async () => {
    const istekler = sunucuKur(YAZAR, { 'GET /uretim-emirleri/ozet': () => json(200, { planlanacak: 3, acik: 12, kuyrugum: 2, bugunSaglam: 45 }) });
    ac(hepsi, '/');
    expect((await screen.findByText('12')).textContent).toBe('12');
    expect(screen.getByText('3')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('45')).toBeTruthy();
    expect(istekler.filter((i) => i.yol === '/uretim-emirleri/ozet')).toHaveLength(1);
    const baglar = screen.getAllByRole('link');
    expect(baglar.map((b) => b.getAttribute('href'))).toEqual(['/uretim-emirleri', '/uretim-emirleri']);
  });

  it('reddedilen: veri yoksa sifir yazilmaz; cevap alinamazsa kart "Alınamadı" der', async () => {
    sunucuKur(YAZAR, { 'GET /uretim-emirleri/ozet': () => json(200, { planlanacak: null, acik: null, kuyrugum: 0, bugunSaglam: null }) });
    ac(hepsi, '/');
    expect(await screen.findAllByText('Veri yok')).toHaveLength(3);
    expect(screen.getByText('0')).toBeTruthy();
    cleanup();
    sunucuKur(YAZAR, { 'GET /uretim-emirleri/ozet': () => json(500, { kod: 'SUNUCU', mesaj: 'Hata' }) });
    ac(hepsi, '/');
    expect(await screen.findAllByText('Alınamadı')).toHaveLength(4);
  });

  it('kartlar isleme baglidir ve bolum bildirir', () => {
    expect(anaSayfaKartlari.filter((k) => k.anahtar.startsWith('uretim-emirleri-')).map((k) => [k.anahtar, k.islem, k.bolum])).toEqual([
      ['uretim-emirleri-planlanacak', 'uretim-emirleri.yaz', 'is'],
      ['uretim-emirleri-kuyrugum', 'terminal.uret', 'is'],
      ['uretim-emirleri-acik', 'sayfa.rota', 'ozet'],
      ['uretim-emirleri-bugun', 'terminal.uret', 'ozet'],
      // #1085: şirket özetinin boş durumdaki kartları emir listesini okuyanla görünür.
      ['uretim-emirleri-yonetim-gunluk', 'sayfa.uretim-emirleri', 'yonetim'],
      ['uretim-emirleri-yonetim-durus', 'sayfa.uretim-emirleri', 'yonetim'],
    ]);
  });
});
