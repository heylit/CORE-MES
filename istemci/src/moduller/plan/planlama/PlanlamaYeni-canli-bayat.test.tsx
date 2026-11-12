import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { PlanSurumCevabi } from '#paylasilan/sozlesme/plan.ts';
import { CALISMA_DEGERI } from './siparis/test-veri.ts';
import { CALISMA_KAYDI, YONETICI, ac, sunucuKur } from './test-ortak.tsx';

// 2319 (2311 S7): /plan/surum cevabındaki bayat alanı değişiklik şeridinin ikinci satırına gelir. Veriler uydurmadır.
const PLANLI = { ...CALISMA_KAYDI, deger: structuredClone(CALISMA_DEGERI) };
const BAYAT: PlanSurumCevabi = {
  planSurumu: 3,
  sonCanliyaAlma: { zaman: '2026-11-08T06:00:00.000Z', kisi: 'Deneme Yonetici' },
  bayat: {
    bayat: true,
    sonCanliyaAlma: '2026-11-08T06:00:00.000Z',
    sayilar: { 'emir-bitti': 1, 'fason-donusu': 0, durus: 1, 'rota-degisti': 0, 'adim-bitti': 0, 'emir-iptal': 0 },
    olaylar: [
      { neden: 'durus', zaman: '2026-11-08T08:00:00.000Z', uretimEmriId: null, emirNo: null, makineId: 7, makineKod: 'D-01' },
      { neden: 'emir-bitti', zaman: '2026-11-08T07:00:00.000Z', uretimEmriId: 5, emirNo: 'UE-D-5', makineId: null, makineKod: null },
    ],
  },
};

// Ortak sahte sunucu /plan/surum'u sabit verir; burada yalnız o yol değiştirilir, gerisi ortak sunucuya düşer.
function surumKur(cevap: PlanSurumCevabi): void {
  const ortak = globalThis.fetch;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => (
    adres.replace(/^\/api/, '') === '/plan/surum' ? new Response(JSON.stringify(cevap), { status: 200 }) : ortak(adres, istek))));
}

const canliSatiri = () => document.querySelector('[data-canli="eski"]');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PlanlamaYeni canlı plan bayat işareti', () => {
  it('bayat cevapta şeridin ikinci satırı eskidiğini söyler ve olayları açar', async () => {
    sunucuKur(YONETICI, [PLANLI]);
    surumKur(BAYAT);
    ac('/plan/sevkiyat');
    expect(await screen.findByText(/Canlı plan son canlıya almadan sonra eskidi/, {}, { timeout: 10000 })).toBeTruthy();
    expect(document.querySelector('.tc-py-ds')?.getAttribute('data-durum')).toBe('eski');
    fireEvent.click(screen.getByRole('button', { name: 'Olaylar' }));
    expect(screen.getByRole('list', { name: 'Canlı planı eskiten olaylar' }).querySelectorAll('li').length).toBe(3);
  }, 20000);

  it('alan yoksa ya da bayat değilse ikinci satır çıkmaz', async () => {
    sunucuKur(YONETICI, [PLANLI]);
    ac('/plan/sevkiyat');
    await screen.findByRole('region', { name: 'Değişiklik akışı' }, { timeout: 10000 });
    expect(canliSatiri()).toBeNull();
    cleanup(); vi.unstubAllGlobals();
    sunucuKur(YONETICI, [PLANLI]);
    surumKur({ ...BAYAT, bayat: { ...BAYAT.bayat!, bayat: false, sayilar: { 'emir-bitti': 0, 'fason-donusu': 0, durus: 0, 'rota-degisti': 0, 'adim-bitti': 0, 'emir-iptal': 0 }, olaylar: [] } });
    ac('/plan/sevkiyat');
    await screen.findByRole('region', { name: 'Değişiklik akışı' }, { timeout: 10000 });
    expect(canliSatiri()).toBeNull();
  }, 20000);

  it("Stüdyo'da değişiklik yoksa boş şerit çizilmez (öteki sayfalarda kalır, yukarıdaki test)", async () => {
    sunucuKur(YONETICI, [PLANLI]);
    ac('/plan/studio');
    await screen.findByRole('toolbar', { name: 'Plan çubuğu' }, { timeout: 10000 });
    expect(screen.queryByRole('region', { name: 'Değişiklik akışı' })).toBeNull();
  }, 20000);
});
