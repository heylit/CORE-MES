import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { finansAc, json, OKUYAN, sunucuKur, YAZAN, type Istek } from '../test-ortak.tsx';

// Raporların ekran testleri: her yazma düğmesi için izinli ve reddedilen (gizli) görünüm; her yazma kendi ucuna tek istek.
const YONETEN: Kullanici = { ...YAZAN, id: 9, islemler: [...YAZAN.islemler, 'finans.yonet'] as Kullanici['islemler'] };
const tamam = () => json(200, { anahtar: 'x' });

beforeEach(() => {
  // Örnek veri 2026 Ekim'e göredir; ay seçimi ve analiz bugüne bağlı olduğu için yalnız tarih sabitlenir.
  vi.useFakeTimers({ now: new Date('2026-10-23T09:00:00'), toFake: ['Date'] });
  // jsdom tuval çizmez: grafik kurulmaz, yalnız yeri ve erişilebilir adı kalır.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  Element.prototype.scrollIntoView = vi.fn();
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
// Günlük skor kaydı (F0, çerçevede recordHistory) yetkiliye kendiliğinden gider; rapor yazması sayılmaz.
// Gunluk skor kaydi (F0, cercevede recordHistory) yetkiliye kendiliginden gider; rapor yazmasi sayilmaz.
const yazmalar = (istekler: Istek[]) => istekler.filter((i) => i.yontem === 'POST' && i.yol !== '/finans/skorlar/kaydet');

describe('F3 Durum ve öneriler', () => {
  it('skor, öneriler ve göstergeler gelir; finans.yaz varsa öneri durumu tek uca gider', async () => {
    const istekler = sunucuKur(YAZAN, { 'POST /finans/oneriler/durum': tamam });
    finansAc('/finans/yeni/durum');
    const oneriler = await screen.findByRole('region', { name: 'Öneriler' });
    expect(screen.getByText('Sağlık skoru')).toBeTruthy();
    expect(screen.getByText('Temel göstergeler')).toBeTruthy();
    fireEvent.click(within(oneriler).getAllByRole('button', { name: 'Uyguluyorum' })[0]!);
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    const y = yazmalar(istekler)[0]!;
    expect(y.yol).toBe('/finans/oneriler/durum');
    expect(y.govde).toMatchObject({ durum: 'uygulaniyor' });
  });

  it('Kapat "kapatildi" gönderir; Kapatılan süzgecinde kayıtlı kapatılan öneri Yeniden aç ile gelir', async () => {
    const istekler = sunucuKur(YAZAN, { 'POST /finans/oneriler/durum': tamam });
    finansAc('/finans/yeni/durum');
    const oneriler = await screen.findByRole('region', { name: 'Öneriler' });
    fireEvent.click(within(oneriler).getAllByRole('button', { name: 'Kapat' })[0]!);
    await waitFor(() => expect(yazmalar(istekler)[0]?.govde).toMatchObject({ durum: 'kapatildi' }));
    fireEvent.click(within(oneriler).getByRole('button', { name: /^Kapatılan/ }));
    expect(within(oneriler).getAllByRole('button', { name: 'Yeniden aç' }).length).toBeGreaterThan(0);
  });

  it('finans.yaz yoksa öneri durum düğmeleri yok; bilanço yalnız okunur', async () => {
    const istekler = sunucuKur(OKUYAN);
    finansAc('/finans/yeni/durum');
    const oneriler = await screen.findByRole('region', { name: 'Öneriler' });
    expect(within(oneriler).queryByRole('button', { name: 'Uyguluyorum' })).toBeNull();
    expect(within(oneriler).queryByRole('button', { name: 'Kapat' })).toBeNull();
    expect(screen.queryByLabelText(/Dönen varlıklar/)).toBeNull();
    expect(screen.getByText('Bilanço özetini finans yöneticisi girer.')).toBeTruthy();
    expect(yazmalar(istekler)).toHaveLength(0);
  });

  it('finans.yonet ile bilanço alanı bırakılınca ayar ucuna kayıtlı sürümle gider', async () => {
    const istekler = sunucuKur(YONETEN, { 'POST /finans/ayar/guncelle': () => json(200, { ayar: {} }) });
    finansAc('/finans/yeni/durum');
    const alan = await screen.findByLabelText(/Dönen varlıklar/);
    fireEvent.change(alan, { target: { value: '500000' } });
    fireEvent.blur(alan);
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({ yol: '/finans/ayar/guncelle', govde: { bilancoDonen: 500000, surum: expect.any(Number) } });
  });

  it('"İlgili ekran" bulgunun bölümüne, "Nasıl hesaplandı?" Tahminler\'deki modele gider', async () => {
    sunucuKur(OKUYAN);
    finansAc('/finans/yeni/durum');
    const oneriler = await screen.findByRole('region', { name: 'Öneriler' });
    fireEvent.click(within(oneriler).getAllByRole('button', { name: 'Nasıl hesaplandı?' })[0]!);
    await screen.findByRole('heading', { name: 'Teknik ayrıntılar' });
    await waitFor(() => expect(Element.prototype.scrollIntoView).toHaveBeenCalled());
  });
});

describe('F3 Gelir tablosu', () => {
  it('6 ay varsayılan, 12 ay seçilince sütunlar artar; CSV ve yazdır herkese açık', async () => {
    sunucuKur(OKUYAN);
    finansAc('/finans/yeni/gelir-tablosu');
    const tablo = await screen.findByRole('table', { name: 'Gelir tablosu' });
    const sutun = () => within(tablo).getAllByRole('columnheader').length;
    expect(sutun()).toBe(8);
    fireEvent.click(screen.getByRole('button', { name: '12 ay' }));
    expect(sutun()).toBe(14);
    expect(within(tablo).getByRole('rowheader', { name: 'Net kâr (vergi öncesi)' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Excel'e aktar/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Yazdır/ })).toBeTruthy();
  });
});

describe('F3 Karar araçları', () => {
  it('girdi değişince başabaş yeniden hesaplanır, uca istek gitmez', async () => {
    const istekler = sunucuKur(OKUYAN);
    finansAc('/finans/yeni/karar-araclari');
    const sabit = await screen.findByLabelText('Aylık sabit gider');
    expect(screen.getByText('1.072 adet')).toBeTruthy();
    fireEvent.change(sabit, { target: { value: '840000' } });
    expect(screen.getByText('2.000 adet')).toBeTruthy();
    expect(yazmalar(istekler)).toHaveLength(0);
  });
});

describe('F3 Ay sonu kapanışı', () => {
  it('finans.yaz ile işaret tek uca gider; banka ve çek düğmeleri kayıt formunu açar', async () => {
    const istekler = sunucuKur(YAZAN, { 'POST /finans/kapanis/isaretle': tamam });
    finansAc('/finans/yeni/ay-sonu');
    const kutu = await screen.findByRole('checkbox', { name: /Kasa sayımı/ });
    await waitFor(() => expect((kutu as HTMLInputElement).disabled).toBe(false));
    fireEvent.click(kutu);
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({ yol: '/finans/kapanis/isaretle', govde: { madde: 'kasa', isaretli: true } });
    fireEvent.click(screen.getByRole('button', { name: 'Banka bakiyesini eşitle' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('finans.yaz yoksa işaretler kilitli, banka ve çek düğmeleri yok', async () => {
    sunucuKur(OKUYAN);
    finansAc('/finans/yeni/ay-sonu');
    const kutular = await screen.findAllByRole('checkbox');
    expect(kutular).toHaveLength(10);
    for (const k of kutular) expect((k as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Banka bakiyesini eşitle' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Çek durumlarını güncelle' })).toBeNull();
  });

  it('kayıtlı işaret seçili ayda görünür', async () => {
    sunucuKur(OKUYAN);
    finansAc('/finans/yeni/ay-sonu');
    await screen.findAllByRole('checkbox');
    fireEvent.click(screen.getByRole('button', { name: /^Eyl 26$/ }));
    expect((screen.getByRole('checkbox', { name: /Banka mutabakatı/ }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole('checkbox', { name: /Kasa sayımı/ }) as HTMLInputElement).checked).toBe(false);
  });
});

describe('F3 Tahminler ve doğruluk', () => {
  it('dört karne kartı ve altı model bölümü gelir; yazma yok', async () => {
    const istekler = sunucuKur(OKUYAN);
    finansAc('/finans/yeni/tahminler');
    await screen.findByRole('heading', { name: 'Teknik ayrıntılar' });
    for (const b of ['Nakit tahmini', 'Satış tahmini', 'Tahsilat ve alacak kaybı', 'Müşteri risk notları']) expect(screen.getByRole('heading', { name: b })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '1. Monte Carlo nakit simülasyonu' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: '6. Gider anomalileri' })).toBeTruthy();
    expect(yazmalar(istekler)).toHaveLength(0);
  });
});
