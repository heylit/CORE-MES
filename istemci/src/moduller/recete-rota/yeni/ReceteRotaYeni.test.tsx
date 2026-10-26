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
  expect(screen.getByRole('heading', { name: ad, level: 2 })).toBeTruthy();
  return bolge;
};
const seritteSec = (ad: string) => { fireEvent.click(within(screen.getByRole('navigation', { name: 'Deneme şeridi' })).getByRole('link', { name: ad })); };
const durumOkundu = (istekler: readonly Istek[]) => waitFor(() => expect(istekler.some((i) => i.yol === '/plan/planlama-kaynagi')).toBe(true));
// Veri gelince parçanın bileşeni çizilir (yükleniyor kutusu kalkar).
const parcaCizildi = async (bolge: HTMLElement, parca: string) => {
  await waitFor(() => expect(bolge.querySelector(`[data-parca="${parca}"]`)).not.toBeNull());
};

describe('sekme tablosu', () => {
  it('sekmeler ikinci menünün Reçete ve Rota grubudur, aynı sıra ve adla; her sekmenin ekranı ve parçası var', () => {
    const grup = IKINCI_MENULER.find((m) => m.kok === '/recete-rota')!.gruplar[0].maddeler;
    expect(SEKMELER.map((s) => [s.anahtar, s.baslik, s.yol])).toEqual(grup.map((m) => [m.anahtar, m.baslik, m.yol]));
    expect(Object.keys(EKRANLAR).sort()).toEqual(grup.map((m) => m.anahtar).sort());
    expect(new Set(Object.values(EKRANLAR).map((e) => e.parca))).toEqual(new Set(['R1', 'R2', 'R3']));
  });

  it('sekme menü maddesinin adresinde açılır (541); kök adres Üretim emirleridir, Planlama ve eski adres sekme değildir', () => {
    expect(sekmeBul('/recete-rota')?.anahtar).toBe('orders');
    expect(sekmeBul('/recete-rota/')?.anahtar).toBe('orders');
    expect(sekmeBul('/recete-rota/orders')).toBeUndefined();
    expect(sekmeBul('/recete-rota/plan')).toBeUndefined();
    expect(sekmeBul('/recete-rota/res')?.anahtar).toBe('res');
    expect(sekmeBul('/recete-rota/eski/res')).toBeUndefined();
    expect(SEKMELER.map((s) => s.eskiYol)).toEqual(SEKMELER.map((s) => s.yol.replace(/^\/recete-rota/, '/recete-rota/eski')));
  });
});

describe('yeni Reçete ve Rota ekranı: yetki', () => {
  it('eski adresine geçti (541): yeni ekran kapısı olmayan, Reçete ve Rota sayfasını gören kişi de açar', async () => {
    const istekler = sunucuKur(KAPISIZ);
    rrAc();
    await acikBolum('Üretim emirleri');
    await durumOkundu(istekler);
    expect(screen.queryByText(YENI_EKRAN_ILETISI)).toBeNull();
  });

  it('sayfa işlemi olmayana bölüm açılmaz, veri okunmaz', async () => {
    const istekler = sunucuKur(SAYFASIZ);
    rrAc('/recete-rota/res');
    await screen.findByText('Kaynaklar için yetkiniz yok.');
    expect(istekler.some((i) => i.yol.startsWith('/recete-rota/'))).toBe(false);
  });

  it('bilinmeyen bölüm adresi açılmaz', async () => {
    sunucuKur(YONETICI);
    rrAc('/recete-rota/bilinmeyen');
    await screen.findByText('Bu bölüm bulunamadı.');
  });
});

describe('yeni Reçete ve Rota ekranı: gezinme ve veri', () => {
  it('kök adres Üretim emirleriyle açılır; kendi sekme şeridi yoktur (553 1 a); durum tek uçtan okunur ve parça çizilir', async () => {
    const istekler = sunucuKur(OKUYAN);
    rrAc();
    const bolge = await acikBolum('Üretim emirleri');
    await durumOkundu(istekler);
    await parcaCizildi(bolge, 'R3');
    expect(screen.queryByRole('tablist', { name: 'Reçete ve Rota bölümleri' })).toBeNull();
    // Okuma yalnız GET'tir; rota.yaz olmayan için kart taslağı açılmaz, kayıt belgesine yazılmaz.
    expect(istekler.filter((i) => i.yontem !== 'GET')).toEqual([]);
  });

  it('şeritte madde seçilince bölüm değişir; veri yeniden okunmaz', async () => {
    const istekler = sunucuKur(OKUYAN);
    rrAc();
    await parcaCizildi(await acikBolum('Üretim emirleri'), 'R3');
    const okuma = istekler.filter((i) => i.yol === '/plan/planlama-kaynagi').length;
    seritteSec('Ürün ve rotalar');
    await parcaCizildi(await acikBolum('Ürün ve rotalar'), 'R1');
    seritteSec('Kaynaklar');
    await parcaCizildi(await acikBolum('Kaynaklar'), 'R2');
    expect(istekler.filter((i) => i.yol === '/plan/planlama-kaynagi')).toHaveLength(okuma);
  });

  it('rota.yaz olana ilk okumada kart taslakları bir kez açılır (bugünkü ekran gibi)', async () => {
    const istekler = sunucuKur(YONETICI, { yazmalar: { 'POST /rota/karttan-taslaklar': () => json(200, { acilan: 0 }) } });
    rrAc();
    await parcaCizildi(await acikBolum('Üretim emirleri'), 'R3');
    const yazmalar = istekler.filter((i) => i.yontem !== 'GET');
    expect(yazmalar.map((i) => i.yol)).toEqual(['/rota/karttan-taslaklar']);
    const taslak = istekler.findIndex((i) => i.yol === '/rota/karttan-taslaklar');
    expect(taslak).toBeLessThan(istekler.findIndex((i) => i.yol === '/plan/planlama-kaynagi'));
  });

  it('durum okunamazsa sunucu iletisi ve yeniden dene gösterilir; parça çizilmez', async () => {
    sunucuKur(OKUYAN, { durum: () => json(500, { kod: 'SUNUCU', mesaj: 'Durum okunamadı.' }) });
    rrAc('/recete-rota/stock');
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
