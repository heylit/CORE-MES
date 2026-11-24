import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { GunlukCevabi, KapanmaAyrintisi, KapanmalarCevabi } from '#paylasilan/sozlesme/saglik.ts';
import '../../ortak/rota/ust-eylemler.ts';
import { ustEylemler } from './ust-eylem.tsx';

const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: ['saglik.ayrinti-oku'] };
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
const simdi = Date.now();
const once = (gun: number): string => new Date(simdi - gun * 86_400_000).toISOString();

const KAPANMALAR: KapanmalarCevabi = {
  kapanmalar: [
    { id: 12, kapandiAn: once(1), acildiAn: once(1), kapaliSn: 100, cikisKodu: 134, sinyal: null, neden: 'bellek-tasmasi' },
    { id: 11, kapandiAn: once(3), acildiAn: once(3), kapaliSn: 130, cikisKodu: 0, sinyal: null, neden: 'guncelleme' },
    { id: 10, kapandiAn: once(70), acildiAn: once(70), kapaliSn: 40, cikisKodu: null, sinyal: null, neden: 'bilinmiyor' },
  ],
};
const ayrinti = (id: number, neden: KapanmaAyrintisi['neden'], an: string): KapanmaAyrintisi => ({
  id, kapandiAn: an, acildiAn: an, kapaliSn: 100, cikisKodu: 134, sinyal: null, neden, kanit: neden === 'bilinmiyor' ? null : 'rapor: heap out of memory', yigin: null,
  hataSatirlari: [{ zaman: an, duzey: 'hata', ileti: 'Plan hesabı bellek sınırını aştı', hataKodu: '1a2b3c4d', hata: null }],
  surenIstekler: [{ yontem: 'POST', adres: '/plan/hesapla', kisiId: 12, sureSn: 38 }], bellek: null, dakikalar: [],
});

function sunucuKur(gunluk: (adres: string) => Response = () => json(200, { satirlar: [], sonraki: null, dosyalar: [], gunler: [] } satisfies GunlukCevabi)) {
  const istekler: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    istekler.push(yol);
    if (yol === '/oturum') return json(200, { kullanici: YONETICI });
    if (yol === '/saglik') return json(200, { durum: 'ok' });
    if (yol === '/saglik/ayrinti') return json(200, { veritabaniGecikmeMs: 1, sonGoc: null, commit: null, calismaSuresiSn: 5, ortam: 'test', isler: [], uyarilar: [] });
    if (yol === '/saglik/metrikler') return json(200, { dakikalar: [] });
    if (yol === '/saglik/kapanmalar') return json(200, KAPANMALAR);
    const m = /^\/saglik\/kapanmalar\/(\d+)$/.exec(yol);
    if (m?.[1] !== undefined) {
      const k = KAPANMALAR.kapanmalar.find((x) => String(x.id) === m[1]);
      return k === undefined ? json(404, { kod: 'BULUNAMADI', mesaj: 'Kapanma kaydı bulunamadı.' }) : json(200, ayrinti(k.id, k.neden, k.kapandiAn));
    }
    if (yol.startsWith('/saglik/gunluk?')) return gunluk(yol);
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

// Hesap menüsündeki düğme yönlendirici içinde, adresteki ?sistem= parametresiyle açılır.
function ac(adres: string) {
  const eylem = ustEylemler[0];
  if (eylem === undefined) throw new Error('Sistem eylemi yok');
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><MemoryRouter initialEntries={[adres]}><eylem.dugme /></MemoryRouter></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Sistem İzleme', () => {
  it('adresteki ?sistem=kapanmalar&kayit=12 pencereyi o kayda açar; üç sekme, rozet yalnız plansız kapanmayı sayar', async () => {
    sunucuKur();
    ac('/ayarlar?sistem=kapanmalar&kayit=12');
    const pencere = await screen.findByRole('dialog', { name: 'Sistem izleme' });
    expect(within(pencere).getAllByRole('tab').map((t) => t.getAttribute('data-sekme'))).toEqual(['ozet', 'kapanmalar', 'gunluk']);
    expect(await within(pencere).findByRole('tab', { name: /Kapanmalar \(1\)/ })).toBeTruthy();
    expect(await within(pencere).findByText(/Sunucu belleği doldurdu\./)).toBeTruthy();
    expect(within(pencere).getByText(/Çıkış kodu 134; tanı raporu bellek taşmasını gösteriyor/)).toBeTruthy();
    expect(within(pencere).getByRole('button', { name: /Günlükte bu saati aç/ })).toBeTruthy();
    expect(within(pencere).getByText(/1 hata satırı \(en çok 50 saklanır\)/)).toBeTruthy();
  });

  it('60 günden eski kapanmada günlük düğmesi pasif ve nedeni yazılı; neden bilinmiyorsa ne denendiği yazılı', async () => {
    sunucuKur();
    ac('/ayarlar?sistem=kapanmalar&kayit=10');
    const pencere = await screen.findByRole('dialog', { name: 'Sistem izleme' });
    expect(await within(pencere).findByText(/Kapanma nedeni belirlenemedi\./)).toBeTruthy();
    expect(within(pencere).getAllByText(/neden bulunamadı/).length).toBeGreaterThanOrEqual(1);
    expect((within(pencere).getByRole('button', { name: /Günlükte bu saati aç/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(pencere).getByText(/Günlük dosyası silinmiş \(60 gün saklanır\)/)).toBeTruthy();
  });

  it('Günlükte bu saati aç: günlük sekmesine gün ve saat süzgeciyle geçer, sunucuya o gün istenir', async () => {
    const istekler = sunucuKur();
    ac('/ayarlar?sistem=kapanmalar&kayit=12');
    const pencere = await screen.findByRole('dialog', { name: 'Sistem izleme' });
    fireEvent.click(await within(pencere).findByRole('button', { name: /Günlükte bu saati aç/ }));
    await waitFor(() => expect(within(pencere).getByRole('tab', { name: 'Günlük' }).getAttribute('aria-selected')).toBe('true'));
    await waitFor(() => expect(istekler.some((i) => i.startsWith('/saglik/gunluk?') && i.includes('gun=') && i.includes('baslangic=') && i.includes('duzey=hata'))).toBe(true));
  });

  it('günlük: saat 24 saatlik SS:DD metni; geçersiz saat mesaj yazar ve arama göndermez', async () => {
    const istekler = sunucuKur();
    ac('/ayarlar?sistem=gunluk&gun=2026-11-24&baslangic=15:20&bitis=15:25');
    const pencere = await screen.findByRole('dialog', { name: 'Sistem izleme' });
    const baslangic = await within(pencere).findByLabelText('Başlangıç saati');
    expect((baslangic as HTMLInputElement).value).toBe('15:20');
    expect(baslangic.getAttribute('type')).toBe('text');
    const once = istekler.length;
    fireEvent.change(baslangic, { target: { value: '25:99' } });
    expect(await within(pencere).findByText('Saat SS:DD biçiminde yazılır (örnek 14:30).')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Ara' }));
    expect(istekler.length).toBe(once);
  });

  it('günlük: satır sayısı, daha eski 500 satır düğmesi imleçle ister; boş sonuç ve okunamadı durumları ayrı yazılır', async () => {
    const satir = (n: number) => ({ zaman: once(0), duzey: 'hata' as const, ileti: `satir ${String(n)}`, yontem: 'POST', uc: '/plan/hesapla', kisiId: 12, durum: 500, sureMs: 5, hataKodu: '1a2b3c4d', hata: null });
    const istekler = sunucuKur((adres) => json(200, adres.includes('imlec=')
      ? { satirlar: [satir(2)], sonraki: null, dosyalar: ['sunucu-2026-11-24.log'], gunler: ['2026-11-24'] }
      : { satirlar: [satir(1)], sonraki: 'sunucu-2026-11-24.log:99', dosyalar: ['sunucu-2026-11-24.log'], gunler: ['2026-11-24'] }));
    ac('/ayarlar?sistem=gunluk');
    const pencere = await screen.findByRole('dialog', { name: 'Sistem izleme' });
    expect(await within(pencere).findByText('1 satır bulundu')).toBeTruthy();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Daha eski 500 satır' }));
    expect(await within(pencere).findByText('2 satır bulundu')).toBeTruthy();
    expect(istekler.filter((i) => i.includes('imlec=sunucu-2026-11-24.log%3A99')).length).toBe(1);
    expect(within(pencere).queryByRole('button', { name: 'Daha eski 500 satır' })).toBeNull();
  });

  it('günlük: süzgeçle satır yoksa boş metni, dosya okunamazsa hata ve yeniden dene görünür', async () => {
    sunucuKur(() => json(200, { satirlar: [], sonraki: null, dosyalar: ['sunucu-2026-11-24.log'], gunler: ['2026-11-24'] }));
    ac('/ayarlar?sistem=gunluk');
    expect(await screen.findByText(/Bu süzgeçle satır bulunamadı/)).toBeTruthy();
    cleanup();
    sunucuKur(() => json(500, { kod: 'SUNUCU_HATASI', mesaj: 'Günlük dosyası açılamadı.' }));
    ac('/ayarlar?sistem=gunluk');
    expect(await screen.findByText(/Günlük dosyası/)).toBeTruthy();
  });

  it('adresi olmayan sayfada pencere kapalıdır; saglik.ayrinti-oku yoksa kapanma isteği atılmaz', async () => {
    const istekler = sunucuKur();
    ac('/ayarlar');
    await waitFor(() => expect(istekler.includes('/saglik/ayrinti')).toBe(true));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(istekler.some((i) => i.startsWith('/saglik/kapanmalar'))).toBe(false);
  });
});
