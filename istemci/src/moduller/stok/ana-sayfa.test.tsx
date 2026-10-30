import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { AylikStokDegeriCevabi, PanelCevabi, StokOzetiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { gorunenKartlar } from '../../ortak/rota/ana-sayfa.ts';
import { anaSayfaKartlari } from './ana-sayfa.tsx';
import { DEPOCU, json, sunucuKur } from './test-ortak.tsx';

const OZET_KARTLARI = anaSayfaKartlari.filter((k) => k.bolum !== 'yonetim');
const YONETIM_KARTLARI = anaSayfaKartlari.filter((k) => k.bolum === 'yonetim');
const PANEL: PanelCevabi = {
  malzemeCesidi: 8, gozDolu: 6, gozToplam: 28, kritik: 2, eksi: 1, kabulde: 0, toplamaBekleyen: 0, gunluk: [], kritikListe: [], raflar: [], sonHareketler: [],
  stokDegeri: '1234567.50', fiyatsizKart: 4, guncelDeger: null, guncelFiyatsizKart: 0, guncelAyri: { kalite: null, hurda: null, fason: null, yolda: null, diger: null, toplam: null }, degerGorunur: true,
};

function panoyuAc(kartlar = OZET_KARTLARI) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <MemoryRouter>{kartlar.map((k) => <k.ekran key={k.anahtar} />)}</MemoryRouter>
    </QueryClientProvider>,
  );
}
const kart = (baslik: string) => screen.getByText(baslik).closest('.tc-sayi-karti') as HTMLElement;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Rol panosu kartları', () => {
  it('dört kart tek özet isteğiyle dolar; sayılar ve bağlantılar doğru', async () => {
    const istekler = sunucuKur(DEPOCU, { 'GET /stok/ozet': () => json(200, { acikIstek: 3, dusukStok: 2, sayimBekleyen: 0, eksikEmir: 1 } satisfies StokOzetiCevabi) });
    panoyuAc();
    await screen.findByText('3');
    expect(kart('Düşük stok').textContent).toContain('2');
    expect(kart('Düşük stok').getAttribute('href')).toBe('/stok/malzemeler?durum=kritik');
    expect(kart('Malzemesi eksik emir').textContent).toContain('1');
    expect(kart('Sayım bekleyen göz').textContent).toContain('0');
    expect(istekler.filter((i) => i.yol === '/stok/ozet')).toHaveLength(1);
  });

  it('yetkisiz alan "Veri yok" der, sıfır uydurmaz; uç hata verirse "Alınamadı"', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/ozet': () => json(200, { acikIstek: null, dusukStok: 5, sayimBekleyen: null, eksikEmir: null } satisfies StokOzetiCevabi) });
    panoyuAc();
    await screen.findByText('5');
    expect(kart('Açık malzeme istekleri').textContent).toContain('Veri yok');
    cleanup();
    sunucuKur(DEPOCU, { 'GET /stok/ozet': () => json(500, { kod: 'SUNUCU', mesaj: 'x' }) });
    panoyuAc();
    expect((await screen.findAllByText('Alınamadı')).length).toBe(4);
  });

  it('Şirket özeti: stok değeri yalnız kullanılabilir stoktan (228 a, denetim #36) tam TL ve fiyatsız kart sayısı, kritik ile eksi toplamı; tek panel isteği', async () => {
    const istekler = sunucuKur(DEPOCU, { 'GET /stok/panel': () => json(200, { ...PANEL, guncelDeger: '987654.40', guncelFiyatsizKart: 2 } satisfies PanelCevabi) });
    panoyuAc(YONETIM_KARTLARI);
    await screen.findByText('987.654');
    expect(kart('Stok değeri').textContent).not.toContain('1.234.568');
    expect(kart('Stok değeri').textContent).toContain('Yalnız kullanılabilir · TL, satın alma kg fiyatıyla · 2 kartın fiyatı yok');
    expect(kart('Kritik ya da eksi stok').textContent).toContain('3');
    expect(kart('Kritik ya da eksi stok').getAttribute('href')).toBe('/stok/malzemeler?durum=kritik');
    expect(istekler.filter((i) => i.yol === '/stok/panel')).toHaveLength(1);
    cleanup();
    sunucuKur(DEPOCU, { 'GET /stok/panel': () => json(200, { ...PANEL, guncelDeger: null, guncelFiyatsizKart: 0 } satisfies PanelCevabi) });
    panoyuAc(YONETIM_KARTLARI);
    await vi.waitFor(() => expect(kart('Stok değeri').textContent).toContain('Veri yok'));
    expect(kart('Stok değeri').textContent).toContain('TL, satın alma kg fiyatıyla');
    expect(kart('Stok değeri').textContent).not.toContain('kartın fiyatı yok');
  });

  it('kart işlemleri: istek transferle, sayım sayımla, uyarılar stok okumasıyla görünür', () => {
    const k = Object.fromEntries(anaSayfaKartlari.map((x) => [x.anahtar, x]));
    expect(k['stok-acik-istekler']).toMatchObject({ bolum: 'is', islem: 'stok.transfer' });
    expect(k['stok-sayim']).toMatchObject({ bolum: 'ozet', islem: 'stok.sayim' });
    expect(k['stok-dusuk']).toMatchObject({ bolum: 'uyari', islem: 'sayfa.stok' });
    expect(k['stok-dusuk']!.veya).toContain('stok.toplama');
    // #1085: şirket özeti kartlarını stoğu okuyan görür (uyarılarla aynı küme).
    for (const a of ['stok-yonetim-kritik', 'stok-yonetim-hareket']) {
      expect(k[a]).toMatchObject({ bolum: 'yonetim', islem: 'sayfa.stok', veya: k['stok-dusuk']!.veya });
    }
  });

  it('değer kartları yalnız finans rakamını görene görünür; stoğu okuyan depocu görmez', () => {
    const k = Object.fromEntries(anaSayfaKartlari.map((x) => [x.anahtar, x]));
    for (const a of ['stok-yonetim-deger', 'stok-yonetim-aylik-deger']) {
      expect(k[a]).toMatchObject({ bolum: 'yonetim', islem: 'finans.oku' });
      expect(k[a]!.veya).toBeUndefined();
    }
    const anahtarlari = (islemler: string[]) => gorunenKartlar(anaSayfaKartlari, islemler).map((x) => x.anahtar);
    expect(anahtarlari(['pano.sirket-ozeti', 'sayfa.stok', 'stok.giris'])).not.toContain('stok-yonetim-deger');
    expect(anahtarlari(['pano.sirket-ozeti', 'sayfa.stok', 'stok.giris'])).not.toContain('stok-yonetim-aylik-deger');
    // Şirket özeti bölümü ayrıca bölüm işlemini ister (73 b).
    expect(anahtarlari(['pano.sirket-ozeti', 'sayfa.stok', 'finans.oku'])).toEqual(expect.arrayContaining(['stok-yonetim-deger', 'stok-yonetim-aylik-deger']));
  });

  it('#1085: şirket özetinde son 7 günün giriş ve çıkışı iki seriyle; değer finans yetkisi olmayana nedeniyle boş; aylık değer boş durumda', async () => {
    const gunluk = [{ gun: '2026-10-12', giris: 4, cikis: 0 }, { gun: '2026-10-13', giris: 1, cikis: 3 }];
    sunucuKur(DEPOCU, {
      'GET /stok/panel': () => json(200, { ...PANEL, gunluk, stokDegeri: null, degerGorunur: false } satisfies PanelCevabi),
      'GET /stok/panel/aylik-deger': () => json(200, { degerGorunur: false, aylar: [] } satisfies AylikStokDegeriCevabi),
    });
    panoyuAc(YONETIM_KARTLARI);
    const tablo = await screen.findByRole('table', { name: 'Stok hareketi, son 7 gün' });
    expect([...tablo.querySelectorAll('tr')].map((r) => r.textContent)).toEqual(['12.10Giriş 4 hareket, Çıkış 0 hareket', '13.10Giriş 1 hareket, Çıkış 3 hareket']);
    const hareket = screen.getByText('Stok hareketi, son 7 gün', { selector: '.tc-grafik-baslik' }).closest('.tc-grafik-karti');
    // Sıfır değer çubuk çizmez: dört değerden üçü çubuktur.
    expect(hareket?.querySelectorAll('path.tc-grafik-cubuk')).toHaveLength(3);
    expect(hareket?.querySelectorAll('path.tc-grafik-ikinci')).toHaveLength(1);
    expect(kart('Stok değeri').textContent).toContain('Değer finans yetkisiyle görünür');
    const aylik = screen.getByText('Stok değeri, aylık', { selector: '.tc-grafik-baslik' }).closest('.tc-grafik-karti');
    await vi.waitFor(() => expect(aylik?.querySelector('.tc-grafik-durum')?.textContent).toBe('Veri yok'));
    expect(aylik?.textContent).toContain('Değer finans yetkisiyle görünür');
  });

  it('#1117: aylık stok değeri ay sonu eğrisi; değeri bilinmeyen ay çizilmez, son değer üstte', async () => {
    const aylar = [
      { ay: '2026-08', stokDegeri: '3900000.40', fiyatsizKart: 0 },
      { ay: '2026-09', stokDegeri: null, fiyatsizKart: 2 },
      { ay: '2026-10', stokDegeri: '4700000', fiyatsizKart: 3 },
    ];
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/panel': () => json(200, PANEL),
      'GET /stok/panel/aylik-deger': () => json(200, { degerGorunur: true, aylar } satisfies AylikStokDegeriCevabi),
    });
    panoyuAc(YONETIM_KARTLARI);
    const aylik = (await screen.findByText('Stok değeri, aylık', { selector: '.tc-grafik-baslik' })).closest('.tc-grafik-karti');
    await vi.waitFor(() => expect(aylik?.querySelector('.tc-grafik-son')?.textContent).toBe('4.700.000 TL'));
    expect([...(aylik?.querySelectorAll('table tr') ?? [])].map((r) => r.textContent)).toEqual(['08.263.900.000 TL', '10.264.700.000 TL']);
    expect(istekler.filter((i) => i.yol === '/stok/panel/aylik-deger')).toHaveLength(1);
  });
});
