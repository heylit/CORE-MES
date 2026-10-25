import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { rotalariTopla } from '../../../ortak/rota/kesif.ts';
import { YENI_EKRAN_ILETISI } from '../../../ortak/rota/yeni-ekran.tsx';
import { rotalar } from '../rotalar.tsx';
import { baglantiOzeti } from './ortak/BaglantiDurumu.tsx';
import { SAYFALAR, sekmeMaddeleri } from './sayfalar.ts';
import { arkonAc, KAPISIZ, OPERATOR, sunucuKur, YONETICI } from './test-ortak.tsx';

// İskeletin sözleşmesi: yol, giriş sayfası, bölüm. Bölümlerin içine bakılmaz (parçalar doldurur); bölüm adıyla (aria-label) ve
// data-sayfa ile bulunur. Sayfalar arası geçiş kabuğun şeridindedir (553 1 a); testte test-ortak'ın yalın bağlantıları.

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

const adres = () => screen.getByTestId('adres').textContent;
const bolum = async (ad: string) => screen.findByRole('region', { name: ad }, { timeout: 10000 });
const seritte = (ad: RegExp) => { fireEvent.click(within(screen.getByRole('navigation', { name: 'Deneme şeridi' })).getByRole('link', { name: ad })); };

describe('Yeni Arkon ekranı (iskelet)', () => {
  it('yollar eski Arkon yollarıyla çakışmaz; her sayfanın bir ekranı vardır', () => {
    expect(() => rotalariTopla({ 'arkon/rotalar.tsx': { rotalar } })).not.toThrow();
    for (const m of sekmeMaddeleri()) {
      if (m.anahtar !== 'tmi-yansimalari') expect(Object.hasOwn(SAYFALAR, m.anahtar)).toBe(true);
    }
  });

  it('eski adresinde (541): yeni ekran kapısı olmayan, sayfayı gören kişi de açar', async () => {
    sunucuKur(KAPISIZ);
    arkonAc('/arkon/pano');
    expect((await bolum('Pano')).getAttribute('data-sayfa')).toBe('pano');
    expect(screen.queryByText(YENI_EKRAN_ILETISI, { exact: false })).toBeNull();
  }, 20000);

  it('yöneticide kök adres Pano\'ya gider; ekran kendi sekme şeridini çizmez (553 1 a)', async () => {
    sunucuKur(YONETICI);
    arkonAc('/arkon');
    const pano = await bolum('Pano');
    expect(pano.getAttribute('data-sayfa')).toBe('pano');
    expect(adres()).toBe('/arkon/pano');
    expect(screen.queryByRole('tablist', { name: 'Üretim Hazırlık' })).toBeNull();
    // Testte cihaz deposu (IndexedDB) yoktur: veri katmanı bellekte çalışır ve üst bantta saatin yanındaki durum (soru 488 a)
    // bunu kayıt riski olarak söyler.
    const durum = await within(pano).findByRole('status', { name: /Cihaz deposu açılamadı/ }, { timeout: 10000 });
    expect(durum.textContent).toContain('Kayıt riski');
    expect(durum.closest('.tc-ay-bant')).not.toBeNull();
  }, 20000);

  it('adres değişince sayfa değişir; TMI ekranı olan madde kendi adresine gider', async () => {
    sunucuKur(YONETICI);
    arkonAc('/arkon/pano');
    await bolum('Pano');
    seritte(/^Kalite/);
    expect((await bolum('Kalite')).getAttribute('data-sayfa')).toBe('kalite');
    expect(adres()).toBe('/arkon/kalite');
    seritte(/TMI'ye yazılamayanlar/);
    await waitFor(() => { expect(adres()).toBe('/arkon/tmi-yansimalari'); });
  }, 20000);

  it('operatör rolünde kök adres Üretim Terminali\'ne gider; ayrı sayfadır; göremediği Pano yerine terminale geçer (eski firstPage)', async () => {
    sunucuKur(OPERATOR);
    arkonAc('/arkon');
    expect((await bolum('Üretim Terminali')).getAttribute('data-sayfa')).toBe('operator');
    expect(adres()).toBe('/uretim-terminali');
    expect(screen.queryByRole('tablist', { name: 'Üretim Hazırlık' })).toBeNull();
    cleanup();
    sunucuKur(OPERATOR);
    arkonAc('/arkon/pano');
    expect((await bolum('Üretim Terminali')).getAttribute('data-sayfa')).toBe('operator');
    expect(adres()).toBe('/uretim-terminali');
  }, 20000);

  it('Üretim Terminali eski adresinde (/uretim-terminali) yeni ekranla, yönetici kapısı olmadan açılır (541)', async () => {
    sunucuKur(OPERATOR);
    arkonAc('/uretim-terminali');
    expect((await bolum('Üretim Terminali')).getAttribute('data-sayfa')).toBe('operator');
    expect(adres()).toBe('/uretim-terminali');
  }, 20000);

  it('Üretim Terminali adresteki iş emri seçimini (?emir=&kart=) operatör ekranına bırakır ve adresten siler (çerçevedeki gibi)', async () => {
    sunucuKur(OPERATOR);
    arkonAc('/uretim-terminali?emir=42&kart=7');
    await bolum('Üretim Terminali');
    const w = window as unknown as { __tmiEmirSec?: number; __tmiKartSec?: number };
    await waitFor(() => { expect(w.__tmiEmirSec).toBe(42); });
    expect(w.__tmiKartSec).toBe(7);
    delete w.__tmiEmirSec; delete w.__tmiKartSec;
  }, 20000);

  it('Kuyruk ayrı sayfadır: sekme şeridi olmadan açılır', async () => {
    sunucuKur(YONETICI);
    arkonAc('/kuyruk');
    expect((await bolum('Kuyruk')).getAttribute('data-sayfa')).toBe('kuyruk');
    expect(screen.queryByRole('tablist', { name: 'Üretim Hazırlık' })).toBeNull();
  }, 20000);

  it('Kuyruk eski adresinde (/kuyruk) yeni ekranla, yönetici kapısı olmadan açılır (541)', async () => {
    sunucuKur(KAPISIZ);
    arkonAc('/kuyruk');
    expect((await bolum('Kuyruk')).getAttribute('data-sayfa')).toBe('kuyruk');
    expect(screen.queryByText(YENI_EKRAN_ILETISI, { exact: false })).toBeNull();
    expect(screen.queryByRole('tablist', { name: 'Üretim Hazırlık' })).toBeNull();
    expect(adres()).toBe('/kuyruk');
  }, 20000);

  it('Kuyruk, Plan Kuyruğu yetkisi olmayan operatöre de açılır (eskisi gibi yalnız TMI işlemiyle)', async () => {
    sunucuKur({ ...OPERATOR, kullanici: { ...OPERATOR.kullanici, islemler: [...OPERATOR.kullanici.islemler, 'sayfa.kuyruk'] } });
    arkonAc('/kuyruk');
    expect((await bolum('Kuyruk')).getAttribute('data-sayfa')).toBe('kuyruk');
  }, 20000);

  it('Kuyruk işlemi olmayan kişide /kuyruk bölüm açmaz', async () => {
    sunucuKur(OPERATOR);
    arkonAc('/kuyruk');
    expect(await screen.findByText('Bu sayfa bulunamadı ya da size açık değil.', {}, { timeout: 10000 })).toBeTruthy();
    expect(document.querySelector('[data-sayfa]')).toBeNull();
  }, 20000);

  it('bilinmeyen sayfa bölüm açmaz', async () => {
    sunucuKur(YONETICI);
    arkonAc('/arkon/olmayan');
    expect(await screen.findByText('Bu sayfa bulunamadı ya da size açık değil.', {}, { timeout: 10000 })).toBeTruthy();
    expect(document.querySelector('[data-sayfa]')).toBeNull();
  }, 20000);

  it('önizleme Hazırlık bölümünün adıyla ve salt okunur açılır', async () => {
    sunucuKur(YONETICI);
    arkonAc('/arkon/onizle/IST-1');
    const b = await bolum('Üretim Terminali Hazırlık');
    expect(b.getAttribute('data-sayfa')).toBe('onizle');
    expect(await screen.findByText('Önizleme · kayıt yapılmaz', {}, { timeout: 10000 })).toBeTruthy();
  }, 20000);
});

describe('Yeni Arkon ekranı (eski düzen)', () => {
  it('Kalite maddesi bekleyen ve ölçülen numune sayısını kabuğun şeridine verir (283.25)', async () => {
    const numune = (id: string, status: string) => ({ kimlik: id, surum: 1, govde: { id, status, at: 1, items: [] } });
    sunucuKur(YONETICI, { belgeler: { requests: [numune('n1', 'waiting'), numune('n2', 'measuring'), numune('n3', 'approved')] } });
    const yazilan: { kok: string; sayaclar: unknown }[] = [];
    arkonAc('/arkon/pano', { sayacYaz: (kok, sayaclar) => { yazilan.push({ kok, sayaclar }); } });
    await bolum('Pano');
    await waitFor(() => { expect(yazilan.at(-1)).toEqual({ kok: '/arkon', sayaclar: { kalite: 2 } }); }, { timeout: 10000 });
  }, 20000);

  it('kök ölçek değişkenini taşır; dar ekranda ölçek 1 ve mobil işareti', async () => {
    sunucuKur(YONETICI);
    arkonAc('/arkon/pano');
    await bolum('Pano');
    const kok = document.querySelector<HTMLElement>('.tc-ay');
    await waitFor(() => { expect(kok?.style.getPropertyValue('--tc-ay-olcek')).not.toBe(''); });
    // jsdom'da alan genişliği 0'dır: eski useFit gibi dar ekran sayılır.
    expect(kok?.style.getPropertyValue('--tc-ay-olcek')).toBe('1');
    expect(kok?.hasAttribute('data-mobil')).toBe(true);
  }, 20000);
});

describe('Bağlantı özeti', () => {
  const temel = { memory: false, mode: 'server' as const, online: true, pending: 0, base: 'x' };
  it('durum metinle söylenir, renk tek başına değildir', () => {
    expect(baglantiOzeti(temel)).toMatchObject({ ton: 'tamam', metin: 'Bağlı' });
    expect(baglantiOzeti({ ...temel, pending: 3 })).toMatchObject({ ton: 'uyari', metin: '3 gönderiliyor' });
    expect(baglantiOzeti({ ...temel, online: false, pending: 2 }).aciklama).toContain('2 kayıt bekliyor');
    expect(baglantiOzeti({ ...temel, mode: 'local' })).toMatchObject({ ton: 'pasif', metin: 'Yerel' });
    expect(baglantiOzeti({ ...temel, memory: true })).toMatchObject({ ton: 'hata', metin: 'Kayıt riski' });
  });
});
