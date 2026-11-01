import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { MaliyetOzeti, MasrafSecenekleriCevabi, ProjeMaliyetCevabi } from '#paylasilan/sozlesme/proje-maliyet.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { ProjeMaliyeti } from './disari.ts';

const BOS_OZET: MaliyetOzeti = { taban: null, tabanGecmisi: [], masraflar: [], masrafToplami: 0, sonGerceklesen: 500, tahminiSon: 1100, fark: null };
const TABANLI: MaliyetOzeti = {
  taban: {
    sira: 2, plan: 900, kalemler: [{ kalem: 'isleme', plan: 900 }], eksikKalemler: ['fason'], isEmriSayisi: 1, gerekce: 'Adet arttı',
    kisiAd: 'Deneme Planlamacı', an: '2026-10-18T09:00:00.000Z',
  },
  tabanGecmisi: [{ sira: 1, plan: 800, kalemler: [], eksikKalemler: [], isEmriSayisi: 1, gerekce: null, kisiAd: 'Deneme Planlamacı', an: '2026-10-10T09:00:00.000Z' }],
  masraflar: [
    { id: 4, belgeId: 41, belgeNo: 'GDR-41', belgeTarihi: '2026-10-15', kategori: 'lojistik', aciklama: 'Numune kargo', tutarTl: 150, iptal: false, gorevId: null, kisiAd: 'Deneme', an: '2026-10-16T09:00:00.000Z' },
    { id: 5, belgeId: 42, belgeNo: 'GDR-42', belgeTarihi: '2026-10-15', kategori: 'personel', aciklama: null, tutarTl: 70, iptal: true, gorevId: null, kisiAd: 'Deneme', an: '2026-10-16T09:00:00.000Z' },
  ],
  masrafToplami: 150, sonGerceklesen: 650, tahminiSon: 1250, fark: 350,
};

// Biçim sunucunun cevabından (proje-maliyet.test.ts); iş emri kayıtlı hâl kurallar.test.ts örneklerinden.
const cevap = (fiyatGorunur: boolean, o: Partial<ProjeMaliyetCevabi> = {}): ProjeMaliyetCevabi => ({
  proje: { id: 7, kod: 'PM.1', ad: 'Maliyetli' },
  siparis: { id: 3, no: 'SIP-0003', termin: '2026-11-15', paraBirimi: 'TRY', tutar: fiyatGorunur ? 2000 : null },
  fiyatGorunur,
  bugun: '2026-10-19',
  gelir: fiyatGorunur ? 2000 : null,
  kurFarki: fiyatGorunur ? 0 : null,
  butce: null,
  hedef: 1000,
  plan: 1000,
  gerceklesen: 500,
  bugunePlan: 400,
  kalanPlan: 600,
  sapma: fiyatGorunur ? 100 : null,
  katkiPayi: fiyatGorunur ? 900 : null,
  katkiOrani: fiyatGorunur ? 0.45 : null,
  planlananKatkiOrani: fiyatGorunur ? 0.5 : null,
  karRiski: { gecikmeGunu: 5, gunlukOran: 0.3, tutar: fiyatGorunur ? 13.5 : null, ceza: null },
  kalemler: [
    { kalem: 'malzeme', plan: 0, gerceklesen: 0, sapmaOrani: null },
    { kalem: 'isleme', plan: 1000, gerceklesen: 500, sapmaOrani: 0.25 },
    { kalem: 'ayar', plan: 0, gerceklesen: 0, sapmaOrani: null },
    { kalem: 'fason', plan: null, gerceklesen: 30, sapmaOrani: null },
    { kalem: 'iscilik', plan: 0, gerceklesen: 0, sapmaOrani: null },
  ],
  haftalar: [
    { hafta: '2026-10-05', planBirikimli: 400, gerceklesenBirikimli: 500 },
    { hafta: '2026-10-12', planBirikimli: 1000, gerceklesenBirikimli: 500 },
  ],
  sapanIsEmirleri: fiyatGorunur ? [{ isEmriId: 1, emirNo: 'UE-1', opNo: 10, istasyonAd: 'Torna', plan: 400, gerceklesen: 500, sapma: 100, neden: 'isleme' }] : [],
  eksikKalemler: ['fason'],
  eksikler: [],
  ozet: BOS_OZET,
  ...o,
});

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

const SECENEKLER: MasrafSecenekleriCevabi = { belgeler: [{ id: 43, belgeNo: 'GDR-43', belgeTarihi: '2026-10-20', kategori: 'lojistik', aciklama: 'Kurye', tutarTl: 90 }] };

interface Cagri { yontem: string; yol: string; govde: unknown; kimlik: string | undefined }
const cagrilar: Cagri[] = [];

function sunucuKur(yanit: () => Response, kullanici: Kullanici | null = null) {
  const yollar: string[] = [];
  cagrilar.length = 0;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    yollar.push(`${secenek?.method ?? 'GET'} ${yol}`);
    const basliklar = (secenek?.headers ?? {}) as Record<string, string>;
    cagrilar.push({ yontem: secenek?.method ?? 'GET', yol, govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : undefined, kimlik: basliklar['istek-kimligi'] });
    if (yol === '/oturum' && kullanici !== null) return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/proje-maliyet/7') return yanit();
    if (yol.startsWith('/proje-maliyet/masraf-secenekleri')) return json(200, SECENEKLER);
    if (yol === '/projeler/7/yonetim') return json(200, { gorevler: [{ id: 9, ad: 'Numune ölçümü' }] });
    if (secenek?.method === 'POST') return json(200, { tamam: true });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return yollar;
}

function cizdir() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={istemci}><MemoryRouter><ProjeMaliyeti projeId={7} /></MemoryRouter></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Proje maliyet sekmesi', () => {
  it('fiyat yetkilisine dört göstergeyi, kâr riskini, grafikleri ve sapan iş emirlerini gösterir', async () => {
    const yollar = sunucuKur(() => json(200, cevap(true)));
    cizdir();
    expect(await screen.findByText('Tahmini katkı payı')).toBeTruthy();
    // 236 a: ekran yalnız okur, deftere yazmaz.
    expect(yollar.filter((y) => y.includes('/proje-maliyet/7'))).toEqual(['GET /proje-maliyet/7']);
    expect(screen.getByText('Sipariş tutarı')).toBeTruthy();
    expect(screen.getByText('Bugüne kadarki sapma')).toBeTruthy();
    expect(screen.getByText('5 gün')).toBeTruthy();
    expect(screen.getByRole('link', { name: /Plana git/ }).getAttribute('href')).toBe('/plan');
    expect(screen.getByRole('table', { name: 'En çok sapan iş emirleri' })).toBeTruthy();
    expect(screen.getByText(/Toplamlara girmeyen kalemler.*Fason/)).toBeTruthy();
  });

  it('1398 a: döviz siparişinde kur farkı ayrı kartta, işaretiyle; TL siparişinde kart yok', async () => {
    sunucuKur(() => json(200, cevap(true, { siparis: { id: 3, no: 'SIP-0003', termin: '2026-11-15', paraBirimi: 'EUR', tutar: 50 }, kurFarki: 120 })));
    cizdir();
    expect(await screen.findByText('Kur farkı')).toBeTruthy();
    expect(screen.getByText(/^\+120\sTL$/)).toBeTruthy();
    cleanup();
    sunucuKur(() => json(200, cevap(true)));
    cizdir();
    expect(await screen.findByText('Sipariş tutarı')).toBeTruthy();
    expect(screen.queryByText('Kur farkı')).toBeNull();
  });

  it('fiyat yetkisi yoksa tutar, katkı, sapma ve kâr riski görünmez; maliyet görünür', async () => {
    sunucuKur(() => json(200, cevap(false)));
    cizdir();
    expect(await screen.findByText('Gerçekleşen maliyet')).toBeTruthy();
    expect(screen.queryByText('Sipariş tutarı')).toBeNull();
    expect(screen.queryByText('Tahmini katkı payı')).toBeNull();
    expect(screen.queryByText('Bugüne kadarki sapma')).toBeNull();
    expect(screen.queryByText(/Kâr riski/)).toBeNull();
    expect(screen.queryByRole('table', { name: 'En çok sapan iş emirleri' })).toBeNull();
  });

  it('bağlanmamış kaynak uyarı satırı olarak çıkar; maliyet boş gösterilir, sıfır yazılmaz', async () => {
    sunucuKur(() => json(200, cevap(true, {
      plan: null, gerceklesen: null, bugunePlan: null, kalanPlan: null, sapma: null, katkiPayi: null, haftalar: [], sapanIsEmirleri: [],
      kalemler: (['malzeme', 'isleme', 'ayar', 'fason', 'iscilik', 'genel_gider'] as const).map((kalem) => ({ kalem, plan: null, gerceklesen: null, sapmaOrani: null })),
      eksikKalemler: [], eksikler: ['is_emirleri_bagli_degil'],
    })));
    cizdir();
    expect(await screen.findByText(/Üretim emirlerinin süreleri henüz bağlanmadı/)).toBeTruthy();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText('0 TL')).toBeNull();
  });

  it('taban, son gerçekleşen ve fark gösterilir; okuyan taban alamaz ve masraf bağlayamaz', async () => {
    sunucuKur(() => json(200, cevap(true, { ozet: TABANLI })));
    cizdir();
    expect(await screen.findByText('+350 TL')).toBeTruthy();
    expect(screen.getByText(/2\. taban · .*Deneme Planlamacı/)).toBeTruthy();
    expect(screen.getByRole('table', { name: 'Taban ve güncel plan' })).toBeTruthy();
    expect(screen.getByText(/1\. taban 800 TL/)).toBeTruthy();
    expect(screen.getByText('İptal edildi')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Taban al|Tabanı yenile/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Masraf bağla/ })).toBeNull();
  });

  it('proje yazan tabanı gerekçeyle yeniler ve masraf belgesini görevine bağlar; komutlar istek kimliğiyle gider', async () => {
    sunucuKur(() => json(200, cevap(true, { ozet: TABANLI })), { id: 3, ad: 'Deneme Planlamacı', islemler: ['projeler.yaz', 'finans.maliyet-oku'] });
    cizdir();
    fireEvent.click(await screen.findByRole('button', { name: /Tabanı yenile/ }));
    let pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Yenile' }));
    expect(await within(pencere).findByText('Taban yenileniyor: gerekçe zorunlu.')).toBeTruthy();
    fireEvent.change(within(pencere).getByLabelText(/Gerekçe/), { target: { value: 'Rota değişti' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Yenile' }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yontem === 'POST')).toBe(true); });
    expect(cagrilar.find((c) => c.yontem === 'POST')).toMatchObject({ yol: '/proje-maliyet/7/taban', govde: { gerekce: 'Rota değişti' } });
    expect(cagrilar.find((c) => c.yontem === 'POST')?.kimlik).toMatch(/^[0-9a-f-]{36}$/);
    await waitFor(() => { expect(screen.queryByRole('dialog')).toBeNull(); });

    fireEvent.click(screen.getByRole('button', { name: /Masraf bağla/ }));
    pencere = await screen.findByRole('dialog');
    await within(pencere).findByRole('option', { name: /GDR-43.*90 TL/ });
    fireEvent.change(within(pencere).getByLabelText(/Gider belgesi/), { target: { value: '43' } });
    await within(pencere).findByRole('option', { name: 'Numune ölçümü' });
    fireEvent.change(within(pencere).getByLabelText(/^Görev/), { target: { value: '9' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Bağla' }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yol === '/proje-maliyet/7/masraflar')).toBe(true); });
    expect(cagrilar.find((c) => c.yol === '/proje-maliyet/7/masraflar')?.govde).toEqual({ belgeId: 43, gorevId: 9 });

    fireEvent.click(screen.getByRole('button', { name: /GDR-41.*bağı kaldır/ }));
    await waitFor(() => { expect(cagrilar.some((c) => c.yol === '/proje-maliyet/masraflar/4/kaldir')).toBe(true); });
  });

  it('sunucu hatasında iletiyi gösterir', async () => {
    sunucuKur(() => json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' } satisfies HataGovdesi));
    cizdir();
    expect(await screen.findByText(/yetkiniz yok/)).toBeTruthy();
  });
});
