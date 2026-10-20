import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { YansimaSatiri, YansimalarCevabi } from '#paylasilan/sozlesme/arkon.ts';
import { TmiYansimalari, emirBaglantisi } from './TmiYansimalari.tsx';

const SATIRLAR: YansimaSatiri[] = [
  {
    id: 2, sonuc: 'reddedildi', neden: 'Emir zaten başladı.', deneme: 0, zaman: '2026-10-07T10:00:00.000+03:00', sonDeneme: null, emirId: 7,
    kayit: { tur: 'events', cid: 'c2', zaman: '2026-10-07T10:00:00.000+03:00', paketId: 'tmi-ue-7', emirNo: 'UE-0007' }, gizliTur: null,
  },
  {
    id: 3, sonuc: 'hatali', neden: 'P0001: beklenmeyen hata', deneme: 5, zaman: '2026-10-07T11:00:00.000+03:00', sonDeneme: null, emirId: 9,
    kayit: { tur: 'counts', cid: 'c3', zaman: '2026-10-07T11:00:00.000+03:00', paketId: 'tmi-ue-9', emirNo: 'UE-0009' }, gizliTur: null,
  },
  {
    id: 1, sonuc: 'bekliyor', neden: 'Emir başlamadı: başlama kaydı bekleniyor.', deneme: 2, zaman: '2026-10-07T09:00:00.000+03:00', sonDeneme: null, emirId: 8,
    kayit: { tur: 'counts', cid: 'c1', zaman: '2026-10-07T09:00:00.000+03:00', paketId: 'tmi-ue-8', emirNo: null }, gizliTur: null,
  },
  {
    id: 5, sonuc: 'eslenemedi', neden: 'Paket başka adımın: bu adımın sırası gelmeden ya da bittikten sonra kaydı TMI\'ye işlenmez.', deneme: 0, zaman: '2026-10-07T13:00:00.000+03:00', sonDeneme: null, emirId: 11,
    kayit: { tur: 'events', cid: 'c5', zaman: '2026-10-07T13:00:00.000+03:00', paketId: 'tmi-ie-40', emirNo: 'UE-0011' }, gizliTur: null,
  },
  {
    id: 6, sonuc: 'eslenemedi', neden: 'Paket başka istasyonun; emir şu an TZG-01 istasyonunda.', deneme: 0, zaman: '2026-10-07T14:00:00.000+03:00', sonDeneme: null, emirId: 12,
    kayit: { tur: 'counts', cid: 'c6', zaman: '2026-10-07T14:00:00.000+03:00', paketId: 'tmi-ue-12', emirNo: 'UE-0012' }, gizliTur: null,
  },
];

// Sunucu varsayılan olarak gizler; gizlenenler=true ile gizli satır da gelir.
const GIZLI: YansimaSatiri = {
  id: 4, sonuc: 'eslenemedi', neden: 'Durum "setup" için TMI karşılığı yok.', deneme: 0, zaman: '2026-10-07T12:00:00.000+03:00', sonDeneme: null, emirId: 7,
  kayit: { tur: 'events', cid: 'c4', zaman: '2026-10-07T12:00:00.000+03:00', paketId: 'tmi-ue-7', emirNo: 'UE-0007' }, gizliTur: 'Kurulum ve boşta durumu',
};
const GIZLENENLER: YansimalarCevabi['gizlenenler'] = [
  { kod: 'kurulum-bosta', ad: 'Kurulum ve boşta durumu', adet: 1 }, { kod: 'zaten-calisiyor', ad: 'İş zaten çalışıyor', adet: 0 },
];

const json = (govde: unknown, durum = 200) => new Response(JSON.stringify(govde), { status: durum });

// islemler oturumdaki kişinin işlemleridir; yeniden deneme cevabı verilmezse 200 "yazildi".
function sunucuKur(islemler: string[] = ['arkon.yansima-oku'], yeniden?: { durum: number; govde: unknown }): string[] {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    yollar.push(`${secenek?.method ?? 'GET'} ${yol}`);
    if (yol === '/oturum') return json({ kullanici: { id: 1, ad: 'Deneme', islemler } });
    if (yol.endsWith('/yeniden-dene')) return json(yeniden?.govde ?? { sonuc: 'yazildi', neden: null }, yeniden?.durum ?? 200);
    const sorgu = new URL(yol, 'http://x').searchParams;
    const sonuc = sorgu.get('sonuc');
    const tumu = sorgu.get('gizlenenler') === 'true' ? [...SATIRLAR, GIZLI] : SATIRLAR;
    const satirlar = sonuc === null ? tumu : tumu.filter((s) => s.sonuc === sonuc);
    return json({ satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 50, gizlenenler: GIZLENENLER } satisfies YansimalarCevabi);
  }));
  return yollar;
}

const ciz = () => render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TmiYansimalari /></QueryClientProvider></MemoryRouter>);

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('TmiYansimalari', () => {
  it('yazılamayan kayıtları durum, emir ve nedenle gösterir; bekleyende neden ve deneme sayısı yazar; kişi sütunu yok', async () => {
    sunucuKur();
    render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TmiYansimalari /></QueryClientProvider></MemoryRouter>);
    expect(await screen.findByText('Emir zaten başladı.')).toBeTruthy();
    expect(screen.getByText('UE-0007')).toBeTruthy();
    expect(screen.getByText('#8')).toBeTruthy();
    expect(screen.getAllByText('Reddedildi').length).toBeGreaterThan(1);
    expect(screen.getByText('Emir başlamadı: başlama kaydı bekleniyor. (deneme 2)')).toBeTruthy();
    expect(screen.queryByText('Kişi')).toBeNull();
  });

  it('durum süzgeci sunucuya sonuc olarak gider ve listeyi daraltır', async () => {
    const yollar = sunucuKur();
    render(<MemoryRouter><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><TmiYansimalari /></QueryClientProvider></MemoryRouter>);
    await screen.findByText('Emir zaten başladı.');
    fireEvent.change(screen.getByLabelText('Durum'), { target: { value: 'bekliyor' } });
    await waitFor(() => expect(screen.queryByText('Emir zaten başladı.')).toBeNull());
    expect(yollar.some((y) => y.includes('sonuc=bekliyor'))).toBe(true);
  });

  it('gizlenen türler sayısıyla tek tek yazılır; gizli satır listede yok, "gizlenenleri göster" sunucuya gider ve satırı türüyle getirir', async () => {
    const yollar = sunucuKur();
    ciz();
    await screen.findByText('Emir zaten başladı.');
    const tur = screen.getByRole('list', { name: 'Gizlenen türler' });
    expect(tur.textContent).toContain('Kurulum ve boşta durumu: 1');
    expect(tur.textContent).toContain('İş zaten çalışıyor: 0');
    expect(screen.queryByText('Durum "setup" için TMI karşılığı yok.')).toBeNull();
    expect(yollar.some((y) => y.includes('gizlenenler='))).toBe(false);
    fireEvent.click(screen.getByLabelText('Gizlenenleri göster'));
    expect(await screen.findByText('Durum "setup" için TMI karşılığı yok.')).toBeTruthy();
    expect(screen.getByText('Gizlenen: Kurulum ve boşta durumu')).toBeTruthy();
    expect(yollar.some((y) => y.includes('gizlenenler=true'))).toBe(true);
  });

  it('yeniden dene düğmesi yalnız işlemi olana ve yalnız hatalı satırda görünür; basınca o satır sunucuya gider ve sonuç yazılır', async () => {
    const yollar = sunucuKur(['arkon.yansima-oku', 'arkon.yansima-yeniden']);
    ciz();
    await screen.findByText('UE-0009');
    const dugmeler = await screen.findAllByRole('button', { name: 'Yeniden dene' });
    expect(dugmeler).toHaveLength(1);
    fireEvent.click(dugmeler[0] as HTMLElement);
    expect(await screen.findByText('Kayıt TMI\'ye yazıldı.')).toBeTruthy();
    expect(yollar).toContain('POST /arkon/tmi-yansimalari/3/yeniden-dene');
  });

  it('işlemi olmayan kişide yeniden dene düğmesi ve işlem sütunu yoktur', async () => {
    sunucuKur(['arkon.yansima-oku']);
    ciz();
    await screen.findByText('UE-0009');
    expect(screen.queryByRole('button', { name: 'Yeniden dene' })).toBeNull();
    expect(screen.queryByText('İşlem')).toBeNull();
  });

  // Kart #1285: düzeltilebilir eşlenemeyen satır emri açar; emir sayfasını görmeyene bağlantı yok.
  it('adım sırası satırında "Sıradaki adımı aç", istasyon satırında "Emri aç" emrin sayfasına gider; öteki satırlarda bağlantı yok', async () => {
    sunucuKur(['arkon.yansima-oku', 'sayfa.uretim-emirleri']);
    ciz();
    const adim = await screen.findByRole('link', { name: 'Sıradaki adımı aç' });
    expect(adim.getAttribute('href')).toBe('/uretim-emirleri/11');
    expect(screen.getByRole('link', { name: 'Emri aç' }).getAttribute('href')).toBe('/uretim-emirleri/12');
    expect(screen.getAllByRole('link')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Yeniden dene' })).toBeNull();
  });

  it('emir sayfasını görmeyene emir bağlantısı yoktur', async () => {
    sunucuKur(['arkon.yansima-oku', 'arkon.yansima-yeniden']);
    ciz();
    await screen.findByText('UE-0011');
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('emir bağlantısı yalnız eşlenemeyen ve emri bilinen satırda', () => {
    const neden = 'Paket başka adımın: x';
    expect(emirBaglantisi({ sonuc: 'eslenemedi', neden, emirId: 3 })).toEqual({ etiket: 'Sıradaki adımı aç', yol: '/uretim-emirleri/3' });
    expect(emirBaglantisi({ sonuc: 'reddedildi', neden, emirId: 3 })).toBeNull();
    expect(emirBaglantisi({ sonuc: 'eslenemedi', neden, emirId: null })).toBeNull();
    expect(emirBaglantisi({ sonuc: 'eslenemedi', neden: 'Başka neden', emirId: 3 })).toBeNull();
  });

  it('sunucu reddederse (409) sunucunun iletisi gösterilir', async () => {
    sunucuKur(['arkon.yansima-oku', 'arkon.yansima-yeniden'], { durum: 409, govde: { kod: 'CAKISMA', mesaj: 'Bu emirde sonraki durum kayıtları yazıldı; eski durum kaydı yeniden denenmez.' } });
    ciz();
    fireEvent.click(await screen.findByRole('button', { name: 'Yeniden dene' }));
    expect((await screen.findByRole('alert')).textContent).toBe('Bu emirde sonraki durum kayıtları yazıldı; eski durum kaydı yeniden denenmez.');
  });
});
