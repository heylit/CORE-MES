import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { rotalariTopla } from '../../../ortak/rota/kesif.ts';
import { YENI_EKRAN_ILETISI } from '../../../ortak/rota/yeni-ekran.tsx';
import { rotalar } from '../rotalar.tsx';
import { baglantiOzeti } from './ortak/BaglantiDurumu.tsx';
import { SAYFALAR, sekmeMaddeleri } from './sayfalar.ts';
import { arkonAc, KAPISIZ, OPERATOR, sunucuKur, YONETICI } from './test-ortak.tsx';

// İskeletin sözleşmesi: yol, kapı, sekmeler, giriş sayfası, bölüm. Bölümlerin içine bakılmaz (parçalar doldurur);
// bölüm adıyla (aria-label) ve data-sayfa ile bulunur.

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); });

const adres = () => screen.getByTestId('adres').textContent;
const bolum = async (ad: string) => screen.findByRole('region', { name: ad }, { timeout: 10000 });
const sekmeAdlari = () => screen.getAllByRole('tab').map((s) => s.textContent?.trim());

describe('Yeni Arkon ekranı (iskelet)', () => {
  it('yollar eski Arkon yollarıyla çakışmaz; her sayfanın bir ekranı vardır', () => {
    expect(() => rotalariTopla({ 'arkon/rotalar.tsx': { rotalar } })).not.toThrow();
    for (const m of sekmeMaddeleri()) {
      if (m.anahtar !== 'tmi-yansimalari') expect(Object.hasOwn(SAYFALAR, m.anahtar)).toBe(true);
    }
  });

  it('kapı işlemi olmayan kişide açılmaz, Arkon uçlarına gitmez', async () => {
    const istekler = sunucuKur(KAPISIZ);
    arkonAc('/arkon/yeni/pano');
    expect(await screen.findByText(YENI_EKRAN_ILETISI, { exact: false }, { timeout: 10000 })).toBeTruthy();
    expect(istekler.some((i) => i.yol.startsWith('/arkon/'))).toBe(false);
  }, 20000);

  it('yöneticide kök adres Pano\'ya gider; sekmeler ikinci menü sırasıyla, Operatör ve Kuyruk sekmede yok (497/5 a)', async () => {
    sunucuKur(YONETICI);
    arkonAc('/arkon/yeni');
    const pano = await bolum('Pano');
    expect(pano.getAttribute('data-sayfa')).toBe('pano');
    expect(adres()).toBe('/arkon/yeni/pano');
    expect(sekmeAdlari()).toEqual([
      'Pano', 'Plan Kuyruğu', 'Üretim Terminali Hazırlık', 'Üretim Anomalisi', 'Kalite', 'Çizim',
      'Bakım', 'Raporlar', 'TMI\'ye yazılamayanlar', 'Ayarlar',
    ]);
    // Testte cihaz deposu (IndexedDB) yoktur: veri katmanı bellekte çalışır ve üst bantta saatin yanındaki durum (soru 488 a)
    // bunu kayıt riski olarak söyler.
    const durum = await within(pano).findByRole('status', { name: /Cihaz deposu açılamadı/ }, { timeout: 10000 });
    expect(durum.textContent).toContain('Kayıt riski');
    expect(durum.closest('.tc-ay-bant')).not.toBeNull();
  }, 20000);

  it('sekmeden sayfa değişir; TMI ekranı olan sekme kendi adresine gider', async () => {
    sunucuKur(YONETICI);
    arkonAc('/arkon/yeni/pano');
    await bolum('Pano');
    fireEvent.click(screen.getByRole('tab', { name: /Kalite/ }));
    expect((await bolum('Kalite')).getAttribute('data-sayfa')).toBe('kalite');
    expect(adres()).toBe('/arkon/yeni/kalite');
    fireEvent.click(screen.getByRole('tab', { name: /TMI'ye yazılamayanlar/ }));
    await waitFor(() => { expect(adres()).toBe('/arkon/tmi-yansimalari'); });
  }, 20000);

  it('operatör rolünde kök adres Üretim Terminali\'ne gider; ayrı sayfadır, sekme şeridi yok; Pano açılmaz', async () => {
    sunucuKur(OPERATOR);
    arkonAc('/arkon/yeni');
    expect((await bolum('Üretim Terminali')).getAttribute('data-sayfa')).toBe('operator');
    expect(adres()).toBe('/arkon/yeni/operator');
    expect(screen.queryByRole('tablist', { name: 'Üretim Hazırlık' })).toBeNull();
    cleanup();
    sunucuKur(OPERATOR);
    arkonAc('/arkon/yeni/pano');
    expect(await screen.findByText('Bu sayfa bulunamadı ya da size açık değil.', {}, { timeout: 10000 })).toBeTruthy();
    expect(document.querySelector('[data-sayfa]')).toBeNull();
  }, 20000);

  it('Kuyruk ayrı sayfadır: sekme şeridi olmadan açılır', async () => {
    sunucuKur(YONETICI);
    arkonAc('/arkon/yeni/kuyruk');
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
    arkonAc('/arkon/yeni/olmayan');
    expect(await screen.findByText('Bu sayfa bulunamadı ya da size açık değil.', {}, { timeout: 10000 })).toBeTruthy();
    expect(document.querySelector('[data-sayfa]')).toBeNull();
  }, 20000);

  it('önizleme Hazırlık sekmesinin altında ve salt okunur açılır', async () => {
    sunucuKur(YONETICI);
    arkonAc('/arkon/yeni/onizle/IST-1');
    const b = await bolum('Üretim Terminali Hazırlık');
    expect(b.getAttribute('data-sayfa')).toBe('onizle');
    expect(screen.getByRole('tab', { selected: true }).textContent).toContain('Üretim Terminali Hazırlık');
    expect(await screen.findByText('Önizleme · kayıt yapılmaz', {}, { timeout: 10000 })).toBeTruthy();
  }, 20000);
});

describe('Yeni Arkon ekranı (eski düzen)', () => {
  it('Kalite sekmesi bekleyen ve ölçülen numune sayısını taşır', async () => {
    const numune = (id: string, status: string) => ({ kimlik: id, surum: 1, govde: { id, status, at: 1, items: [] } });
    sunucuKur(YONETICI, { belgeler: { requests: [numune('n1', 'waiting'), numune('n2', 'measuring'), numune('n3', 'approved')] } });
    arkonAc('/arkon/yeni/pano');
    await bolum('Pano');
    expect(await screen.findByRole('tab', { name: 'Kalite (2)' }, { timeout: 10000 })).toBeTruthy();
  }, 20000);

  it('kök ölçek değişkenini taşır; dar ekranda ölçek 1 ve mobil işareti', async () => {
    sunucuKur(YONETICI);
    arkonAc('/arkon/yeni/pano');
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
