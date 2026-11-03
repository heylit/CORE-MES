import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, renderHook, screen, within } from '@testing-library/react';
import type { ReactNode } from 'react';
import type { KmResim, KmStudyoParcaCevabi } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import { kmAc, MUHENDIS, OKUYAN, type SunucuSecenegi } from '../yeni/test-ortak.tsx';
import { useOkumaAyari } from './OkumaAyarlari.tsx';

// Okuma ayarları çekmecesi (2038 a, kart 2042). Uydurma deneme verisi.
const KART = { malzemeNo: 7, kod: 'DNM-07', ad: 'Deneme gövde', aktif: true };
const RESIM: KmResim = {
  id: 1, malzemeNo: 7, tur: 'resim', merkezBelgeId: 11, ozet: 'a'.repeat(64), ad: 'Deneme resim', revizyon: 'B', aktif: true, surum: 1,
  eklendi: '2026-10-20T08:00:00.000Z', balonlar: [],
};
const PARCA: KmStudyoParcaCevabi = { resimler: [RESIM], numunePlanlari: [], alinmamis: 0 };
const SECENEK: SunucuSecenegi = { parcalar: [KART], emirler: [], studyo: { parcalar: { 7: PARCA }, numuneler: {} } };

afterEach(() => { cleanup(); window.localStorage.clear(); });

async function cekmeceAc() {
  fireEvent.click(await screen.findByRole('button', { name: 'Okuma ayarları' }));
  return screen.findByRole('complementary', { name: 'Okuma ayarları' });
}

describe('Okuma ayarları çekmecesi (2038 a)', () => {
  it('düğme çekmeceyi açar ve kapatır; PDF, 3B model ve Tanı sekmeleri var', async () => {
    kmAc('resimler?parca=7', MUHENDIS, {}, SECENEK);
    const c = await cekmeceAc();
    expect(screen.getByRole('button', { name: 'Okuma ayarları' }).getAttribute('aria-expanded')).toBe('true');
    expect(within(c).getAllByRole('tab').map((t) => t.textContent)).toEqual(['PDF', '3B model', 'Tanı']);
    fireEvent.click(within(c).getByRole('tab', { name: '3B model' }));
    expect(within(c).getByRole('group', { name: 'Ağ kalitesi' })).toBeTruthy();
    fireEvent.click(within(c).getByRole('tab', { name: 'Tanı' }));
    expect(within(c).getByText(/okuma sonuçları, süreler ve ham yazılar/)).toBeTruthy();
    fireEvent.click(within(c).getByRole('button', { name: 'Okuma ayarlarını kapat' }));
    expect(screen.queryByRole('complementary', { name: 'Okuma ayarları' })).toBeNull();
  });

  it('izinli: kontrol planını düzenleyen ayarı değiştirir, Uygula açılır; "tüm ekranlarda" cihazın ortak kaydına yazar', async () => {
    kmAc('resimler?parca=7', MUHENDIS, {}, SECENEK);
    const c = await cekmeceAc();
    const uygula = within(c).getByRole('button', { name: 'Ayarlar uygulandı' }) as HTMLButtonElement;
    expect(uygula.disabled).toBe(true);
    fireEvent.click(within(within(c).getByRole('group', { name: 'OCR' })).getByRole('button', { name: 'Kapalı' }));
    expect((within(c).getByRole('button', { name: 'Uygula · yeniden oku' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(within(c).getByRole('button', { name: 'Bu cihazda tüm ekranlarda kullan' }));
    expect(JSON.parse(window.localStorage.getItem('arkon:readCfg') ?? 'null')).toMatchObject({ ocr: 'off' });
  });

  it('reddedilen: kontrol planını düzenleyemeyen ayarı görür, değiştiremez; uygulama düğmeleri yoktur', async () => {
    kmAc('resimler?parca=7', OKUYAN, {}, SECENEK);
    const c = await cekmeceAc();
    const kapali = within(within(c).getByRole('group', { name: 'OCR' })).getByRole('button', { name: 'Kapalı' }) as HTMLButtonElement;
    expect(kapali.disabled).toBe(true);
    expect(within(c).queryByRole('button', { name: /Uygula|Ayarlar uygulandı/ })).toBeNull();
    expect(within(c).queryByRole('button', { name: 'Bu cihazda tüm ekranlarda kullan' })).toBeNull();
    expect(within(c).getByText('Ayarları kontrol planını düzenleyen değiştirir.')).toBeTruthy();
  });

  it('cihazda kayıtlı ayarla açılır (Hazırlık\'ta "tüm sistemde kullan" denen ayar)', async () => {
    window.localStorage.setItem('arkon:readCfg', JSON.stringify({ look: 'blue' }));
    kmAc('resimler?parca=7', MUHENDIS, {}, SECENEK);
    const c = await cekmeceAc();
    expect(within(within(c).getByRole('group', { name: 'Renk' })).getByRole('button', { name: 'Mavi' }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('useOkumaAyari', () => {
  const sar = ({ children }: { children: ReactNode }) => <BildirimSaglayici>{children}</BildirimSaglayici>;

  it('çekmece kapalıyken teknik resimden tanı istenmez; açıkken istenir', () => {
    const { result } = renderHook(() => useOkumaAyari(), { wrapper: sar });
    expect(result.current.kontrol(false).tani).toBeUndefined();
    expect(typeof result.current.kontrol(true).tani).toBe('function');
    expect(result.current.kontrol(false).ayar).toEqual(result.current.uygulanan);
  });

  it('Uygula yeni ayarı verir ve yeniden okuma ister; sıfırlama isteği kaldırır, kontrol planına dokunmaz', () => {
    const { result } = renderHook(() => useOkumaAyari(), { wrapper: sar });
    act(() => { result.current.ayarYaz('ocr', 'always'); });
    expect(result.current.degisti).toBe(true);
    act(() => { result.current.uygula(true); });
    expect(result.current.degisti).toBe(false);
    expect(result.current.okuma).toMatchObject({ taze: true });
    expect((result.current.kontrol(false).ayar as { ocr: string }).ocr).toBe('always');
    act(() => { result.current.sifirla(); });
    expect(result.current.okuma).toBeNull();
    expect(result.current.kontrol(true)).not.toHaveProperty('balonlarYaz');
  });
});
