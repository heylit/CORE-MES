import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { IKINCI_MENULER } from '#paylasilan/sayfalar.ts';
import { YENI_EKRAN_ILETISI } from '../../../ortak/rota/yeni-ekran.tsx';
import { MOTOR_OKUNAMADI } from './ReceteRotaYeni.tsx';
import { EKRANLAR, SEKMELER, sekmeBul } from './sekmeler.ts';
import { json, KAPISIZ, OKUYAN, rrAc, SAYFASIZ, sunucuKur, YONETICI, type Istek } from './test-ortak.tsx';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Bölüm içerikleri parçalarca doldurulur: testler yer tutucu metnine değil, seçili sekmeye, bölgenin adına ve parçanın işaretine bakar.
const acikBolum = async (ad: string) => {
  const bolge = await screen.findByRole('region', { name: ad });
  expect(within(screen.getByRole('tablist', { name: 'Reçete ve Rota bölümleri' })).getByRole('tab', { selected: true }).textContent).toContain(ad);
  return bolge;
};
const durumOkundu = (istekler: readonly Istek[]) => waitFor(() => expect(istekler.some((i) => i.yol === '/recete-rota/durum')).toBe(true));
// Veri gelince parçanın bileşeni çizilir (yükleniyor kutusu kalkar).
const parcaCizildi = async (bolge: HTMLElement, parca: string) => {
  await waitFor(() => expect(bolge.querySelector(`[data-parca="${parca}"]`)).not.toBeNull());
};

describe('sekme tablosu', () => {
  it('sekmeler ikinci menünün Reçete ve Rota grubudur, aynı sıra ve adla; her sekmenin ekranı ve parçası var', () => {
    const grup = IKINCI_MENULER.find((m) => m.kok === '/recete-rota')!.gruplar[0].maddeler;
    expect(SEKMELER.map((s) => [s.anahtar, s.baslik, s.eskiYol])).toEqual(grup.map((m) => [m.anahtar, m.baslik, m.yol]));
    expect(Object.keys(EKRANLAR).sort()).toEqual(grup.map((m) => m.anahtar).sort());
    expect(new Set(Object.values(EKRANLAR).map((e) => e.parca))).toEqual(new Set(['R1', 'R2', 'R3']));
  });

  it('kök adres Üretim emirleridir; orders adres parçası ve bilinmeyen bölüm açılmaz', () => {
    expect(sekmeBul(undefined)?.anahtar).toBe('orders');
    expect(sekmeBul('orders')).toBeUndefined();
    expect(sekmeBul('plan')).toBeUndefined();
    expect(sekmeBul('res')?.yol).toBe('/recete-rota/yeni/res');
  });
});

describe('yeni Reçete ve Rota ekranı: kapı ve yetki', () => {
  it('kapı işlemi olmayana açılmaz, Reçete ve Rota verisi okunmaz', async () => {
    const istekler = sunucuKur(KAPISIZ);
    rrAc();
    await screen.findByText(YENI_EKRAN_ILETISI);
    expect(istekler.some((i) => i.yol.startsWith('/recete-rota/'))).toBe(false);
    expect(screen.queryByRole('tablist')).toBeNull();
  });

  it('sayfa işlemi olmayana bölüm açılmaz, veri okunmaz', async () => {
    const istekler = sunucuKur(SAYFASIZ);
    rrAc('/recete-rota/yeni/res');
    await screen.findByText('Kaynaklar için yetkiniz yok.');
    expect(istekler.some((i) => i.yol.startsWith('/recete-rota/'))).toBe(false);
  });

  it('bilinmeyen bölüm adresi açılmaz', async () => {
    sunucuKur(YONETICI);
    rrAc('/recete-rota/yeni/plan');
    await screen.findByText('Bu bölüm bulunamadı.');
  });
});

describe('yeni Reçete ve Rota ekranı: gezinme ve veri', () => {
  it('kök adres Üretim emirleriyle açılır; yedi sekme menü sırasıyla; durum tek uçtan okunur ve parça çizilir', async () => {
    const istekler = sunucuKur(OKUYAN);
    rrAc();
    const bolge = await acikBolum('Üretim emirleri');
    await durumOkundu(istekler);
    await parcaCizildi(bolge, 'R3');
    const sekmeler = within(screen.getByRole('tablist', { name: 'Reçete ve Rota bölümleri' })).getAllByRole('tab').map((s) => s.textContent);
    expect(sekmeler).toEqual(SEKMELER.map((s) => s.baslik));
    // Eski ekranın sırası (497/1 a): sekmeler bölüm başlığının üstündedir (plan şeridiyle sıra ekran testinde).
    const sekme = screen.getByRole('tablist', { name: 'Reçete ve Rota bölümleri' });
    const baslik = screen.getByRole('heading', { name: 'Üretim emirleri', level: 2 });
    expect(sekme.compareDocumentPosition(baslik) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Okuma yalnız GET'tir; rota.yaz olmayan için kart taslağı açılmaz, kayıt belgesine yazılmaz.
    expect(istekler.filter((i) => i.yontem !== 'GET')).toEqual([]);
  });

  it('sekme seçilince bölüm değişir; veri yeniden okunmaz', async () => {
    const istekler = sunucuKur(OKUYAN);
    rrAc();
    await parcaCizildi(await acikBolum('Üretim emirleri'), 'R3');
    const okuma = istekler.filter((i) => i.yol === '/recete-rota/durum').length;
    fireEvent.click(screen.getByRole('tab', { name: /Ürün ve rotalar/ }));
    await parcaCizildi(await acikBolum('Ürün ve rotalar'), 'R1');
    fireEvent.click(screen.getByRole('tab', { name: /Kaynaklar/ }));
    await parcaCizildi(await acikBolum('Kaynaklar'), 'R2');
    expect(istekler.filter((i) => i.yol === '/recete-rota/durum')).toHaveLength(okuma);
  });

  it('rota.yaz olana ilk okumada kart taslakları bir kez açılır (bugünkü ekran gibi)', async () => {
    const istekler = sunucuKur(YONETICI, { yazmalar: { 'POST /rota/karttan-taslaklar': () => json(200, { acilan: 0 }) } });
    rrAc();
    await parcaCizildi(await acikBolum('Üretim emirleri'), 'R3');
    const yazmalar = istekler.filter((i) => i.yontem !== 'GET');
    expect(yazmalar.map((i) => i.yol)).toEqual(['/rota/karttan-taslaklar']);
    const taslak = istekler.findIndex((i) => i.yol === '/rota/karttan-taslaklar');
    expect(taslak).toBeLessThan(istekler.findIndex((i) => i.yol === '/recete-rota/durum'));
  });

  it('durum okunamazsa sunucu iletisi ve yeniden dene gösterilir; parça çizilmez', async () => {
    sunucuKur(OKUYAN, { durum: () => json(500, { kod: 'SUNUCU', mesaj: 'Durum okunamadı.' }) });
    rrAc('/recete-rota/yeni/stock');
    const bolge = await acikBolum('Stok');
    await within(bolge).findByText('Durum okunamadı.');
    expect(within(bolge).getByRole('button', { name: 'Yeniden dene' })).toBeTruthy();
    expect(bolge.querySelector('[data-parca]')).toBeNull();
  });

  it('plan motorunun yerleşimi okunamazsa uyarı satırı çıkar, bölüm yine açılır', async () => {
    sunucuKur(OKUYAN, { motorYok: true });
    rrAc();
    await parcaCizildi(await acikBolum('Üretim emirleri'), 'R3');
    await screen.findByText(MOTOR_OKUNAMADI);
  });
});
