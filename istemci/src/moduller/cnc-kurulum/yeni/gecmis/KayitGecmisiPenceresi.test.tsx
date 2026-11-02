import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { KayitGecmisiCevabi } from '#paylasilan/sozlesme/cnc-kurulum.ts';
import { anahtarAdi, KayitGecmisiPenceresi } from './KayitGecmisiPenceresi.tsx';

// Kişi adları uydurmadır.
const CEVAP = (anahtar: string): KayitGecmisiCevabi => ({
  anahtarlar: [{ anahtar: 'cnc-kurulum-motoru.v1', surumSayisi: 2, son: '2026-11-02T08:00:00Z' }, { anahtar: 'cnc-kurulum-motoru.emir.is-emri.7', surumSayisi: 1, son: '2026-11-01T08:00:00Z' }],
  anahtar,
  guncel: anahtar === 'cnc-kurulum-motoru.v1' ? { surum: 12, yazan: { id: 1, ad: 'Deneme Bir' }, yazildi: '2026-11-02T08:00:00Z' } : null,
  satirlar: anahtar === 'cnc-kurulum-motoru.v1' ? [
    { surum: 11, yazan: { id: 2, ad: 'Deneme Iki' }, yazildi: '2026-11-02T07:00:00Z', degistiren: { id: 1, ad: 'Deneme Bir' }, degisti: '2026-11-02T08:00:00Z', silindi: false, alanlar: ['at', 'machine'] },
    { surum: 9, yazan: { id: 3, ad: null }, yazildi: '2026-11-01T07:00:00Z', degistiren: null, degisti: '2026-11-01T08:00:00Z', silindi: true, alanlar: null },
  ] : [],
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Kayıt geçmişi penceresi (CNC-7 a)', () => {
  it('anahtar adları okunur; bilinmeyen anahtar olduğu gibi kalır', () => {
    expect(anahtarAdi('cnc-kurulum-motoru.v1')).toBe('Kurulum durumu');
    expect(anahtarAdi('cnc-kurulum-motoru.secim')).toBe('Adım seçimleri');
    expect(anahtarAdi('cnc-kurulum-motoru.emir')).toBe('Seçili iş emri');
    expect(anahtarAdi('cnc-kurulum-motoru.emir.is-emri.7')).toBe('İş emri 7 kurulumu');
    expect(anahtarAdi('cnc-kurulum-motoru.diger')).toBe('cnc-kurulum-motoru.diger');
  });

  it('güncel sürüm, önceki sürümler, değişen alanlar ve silme görünür; kayıt değişince yeniden okunur', async () => {
    const yollar: string[] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
      yollar.push(adres.replace('/api', ''));
      const anahtar = new URL(adres, 'http://x').searchParams.get('anahtar') ?? '';
      return new Response(JSON.stringify(CEVAP(anahtar)), { status: 200 });
    }));
    render(<KayitGecmisiPenceresi kapat={() => undefined} />);
    const pencere = await screen.findByRole('dialog', { name: 'Kayıt geçmişi' });
    expect((await within(pencere).findByRole('note')).textContent).toContain('Güncel sürüm 12 · Deneme Bir');
    expect(within(pencere).getByText('at, machine')).toBeTruthy();
    expect(within(pencere).getByText('Silindi')).toBeTruthy();
    expect(within(pencere).getByText(/Kişi 3/)).toBeTruthy();
    fireEvent.change(within(pencere).getByLabelText('Kayıt'), { target: { value: 'cnc-kurulum-motoru.emir.is-emri.7' } });
    expect(await within(pencere).findByText('Bu kaydın önceki sürümü yok.')).toBeTruthy();
    expect(within(pencere).getByRole('note').textContent).toContain('şu an yok');
    expect(yollar).toEqual([
      '/cnc-kurulum/kayitlar/gecmis?anahtar=cnc-kurulum-motoru.v1',
      '/cnc-kurulum/kayitlar/gecmis?anahtar=cnc-kurulum-motoru.emir.is-emri.7',
    ]);
  });

  it('okuma hatasında hata ve yeniden dene görünür', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ kod: 'YETKI_YOK', mesaj: 'Yetkiniz yok.' }), { status: 403 })));
    render(<KayitGecmisiPenceresi kapat={() => undefined} />);
    expect(await screen.findByText(/Yetkiniz yok|okunamadı/)).toBeTruthy();
  });
});
