import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type {
  DegisiklikIcerigiCevabi, DegisiklikListesiCevabi, DegisiklikSatiri, DegisiklikSecenekleriCevabi, KayitIcerigiCevabi, KayitListesiCevabi,
  KayitSatiri, SuzgecSecenekleriCevabi,
} from '#paylasilan/sozlesme/denetim.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { DenetimKaydi } from './DenetimKaydi.tsx';

const MUDUR: Kullanici = { id: 2, ad: 'Deneme Müdür', islemler: ['sayfa.denetim', 'denetim.oku'] };
const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: ['sayfa.denetim', 'denetim.oku', 'denetim.govde-oku'] };

const SATIRLAR: KayitSatiri[] = [
  { id: 12, zaman: '2026-10-07T10:00:00.000+03:00', kisiId: 2, kisiAd: 'Deneme Müdür', yontem: 'POST', yol: '/uretim-emirleri/:id/baslat', kimlikler: { id: 41 } },
  { id: 11, zaman: '2026-10-07T09:00:00.000+03:00', kisiId: null, kisiAd: null, yontem: 'POST', yol: '/oturum/giris', kimlikler: {} },
];
const SECENEKLER = {
  kisiler: [{ id: 2, ad: 'Deneme Müdür' }],
  komutlar: [{ yontem: 'POST', yol: '/oturum/giris' }, { yontem: 'POST', yol: '/uretim-emirleri/:id/baslat' }],
} satisfies SuzgecSecenekleriCevabi;
const ICERIK = { id: 12, parametre: { id: 41 }, govde: { not: '<b>kalın değil</b>', parola: '[gizli]' } } satisfies KayitIcerigiCevabi;

const DEGISIKLIKLER: DegisiklikSatiri[] = [
  { id: 7, zaman: '2026-10-07T11:00:00.000+03:00', kisiId: 2, kisiAd: 'Deneme Müdür', tablo: 'uretim_emri', anahtar: { id: 41 }, islem: 'guncelle', alanAdlari: ['adet', 'termin'] },
  { id: 6, zaman: '2026-10-07T08:00:00.000+03:00', kisiId: null, kisiAd: null, tablo: 'kisi_rolu', anahtar: { kisi_id: 3, rol_id: 2 }, islem: 'ekle', alanAdlari: ['kisi_id', 'rol_id'] },
];
const D_SECENEKLER = { kisiler: [{ id: 2, ad: 'Deneme Müdür' }], tablolar: ['kisi_rolu', 'uretim_emri'] } satisfies DegisiklikSecenekleriCevabi;
const D_ICERIK = { id: 7, alanlar: [{ alan: 'adet', eski: 5, yeni: 7 }, { alan: 'kayit.parola', eski: '[gizli]', yeni: '[gizli]' }] } satisfies DegisiklikIcerigiCevabi;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(kullanici: Kullanici): string[] {
  const yollar: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    yollar.push(yol);
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/denetim-kayitlari/suzgecler') return json(200, SECENEKLER);
    if (yol === '/denetim-kayitlari/12/govde') {
      return kullanici.islemler.includes('denetim.govde-oku') ? json(200, ICERIK) : json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' });
    }
    if (yol === '/denetim-degisiklikleri/suzgecler') return json(200, D_SECENEKLER);
    if (yol === '/denetim-degisiklikleri/7/icerik') {
      return kullanici.islemler.includes('denetim.govde-oku') ? json(200, D_ICERIK) : json(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' });
    }
    if (yol.startsWith('/denetim-degisiklikleri?')) {
      const tablo = new URL(yol, 'http://x').searchParams.get('tablo');
      const satirlar = tablo === null ? DEGISIKLIKLER : DEGISIKLIKLER.filter((d) => d.tablo === tablo);
      return json(200, { satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 50 } satisfies DegisiklikListesiCevabi);
    }
    if (yol.startsWith('/denetim-kayitlari?')) {
      const kisi = new URL(yol, 'http://x').searchParams.get('kisi');
      const satirlar = kisi === null ? SATIRLAR : SATIRLAR.filter((s) => String(s.kisiId) === kisi);
      return json(200, { satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 50 } satisfies KayitListesiCevabi);
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return yollar;
}

function ac() {
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><DenetimKaydi /></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('DenetimKaydi', () => {
  it('listede zaman, kişi, komut ve kayıt kimliği görünür; oturumsuz komut kişisiz yazılır; yazma düğmesi yok', async () => {
    sunucuKur(MUDUR);
    ac();
    expect(await screen.findByRole('cell', { name: 'POST /uretim-emirleri/:id/baslat' })).toBeTruthy();
    expect(screen.getByText('id 41')).toBeTruthy();
    expect(screen.getByText('Oturumsuz')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /sil|kaydet|düzenle/i })).toBeNull();
  });

  it('kişi süzgeci sunucuya kisi olarak gider ve listeyi daraltır', async () => {
    const yollar = sunucuKur(MUDUR);
    ac();
    await screen.findByText('Oturumsuz');
    await waitFor(() => expect(screen.getByRole('option', { name: 'Deneme Müdür' })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Kişi'), { target: { value: '2' } });
    await waitFor(() => expect(screen.queryByText('Oturumsuz')).toBeNull());
    expect(yollar.some((y) => y.includes('kisi=2'))).toBe(true);
    fireEvent.change(screen.getByLabelText('İşlem'), { target: { value: 'POST /oturum/giris' } });
    await waitFor(() => expect(yollar.some((y) => y.includes('yontem=POST') && y.includes(`yol=${encodeURIComponent('/oturum/giris')}`))).toBe(true));
  });

  it('içerik yetkisi olmayan satırı açınca "İçerik görme yetkiniz yok" görür; gövde ucu çağrılmaz', async () => {
    const yollar = sunucuKur(MUDUR);
    ac();
    fireEvent.click(await screen.findByRole('cell', { name: 'POST /uretim-emirleri/:id/baslat' }));
    expect(await screen.findByText('İçerik görme yetkiniz yok.')).toBeTruthy();
    expect(yollar.some((y) => y.includes('/govde'))).toBe(false);
  });

  it('içerik yetkisi olan gövdeyi maskeli ve düz metin olarak görür', async () => {
    const yollar = sunucuKur(YONETICI);
    ac();
    await screen.findByText('Oturumsuz');
    await waitFor(() => expect(yollar).toContain('/oturum'));
    fireEvent.click(screen.getByRole('cell', { name: 'POST /uretim-emirleri/:id/baslat' }));
    const govde = await screen.findByText(/kalın değil/);
    expect(govde.textContent).toContain('<b>kalın değil</b>');
    expect(govde.textContent).toContain('[gizli]');
    expect(screen.queryByText('İçerik görme yetkiniz yok.')).toBeNull();
  });

  it('Değişiklikler görünümü: kayıt türü, işlem ve alan adları listelenir; göçle yapılan değişim "Sistem" yazılır; tablo süzgeci gider', async () => {
    const yollar = sunucuKur(MUDUR);
    ac();
    await screen.findByText('Oturumsuz');
    fireEvent.change(screen.getByLabelText('Görünüm'), { target: { value: 'degisiklikler' } });
    expect(await screen.findByRole('cell', { name: 'Üretim emri' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'adet, termin' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'Sistem' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: 'kisi_id 3, rol_id 2' })).toBeTruthy();
    await waitFor(() => expect(screen.getByRole('option', { name: 'Kişi rolü' })).toBeTruthy());
    fireEvent.change(screen.getByLabelText('Kayıt türü'), { target: { value: 'kisi_rolu' } });
    await waitFor(() => expect(screen.queryByRole('cell', { name: 'Üretim emri' })).toBeNull());
    expect(yollar.some((y) => y.startsWith('/denetim-degisiklikleri?') && y.includes('tablo=kisi_rolu'))).toBe(true);
  });

  it('değer yetkisi olmayan değişikliği açınca uyarı görür, içerik ucu çağrılmaz; yetkili eski ve yeni değeri maskeli görür', async () => {
    const yollar = sunucuKur(MUDUR);
    ac();
    await screen.findByText('Oturumsuz');
    fireEvent.change(screen.getByLabelText('Görünüm'), { target: { value: 'degisiklikler' } });
    fireEvent.click(await screen.findByRole('cell', { name: 'Üretim emri' }));
    expect(await screen.findByText('Eski ve yeni değeri görme yetkiniz yok.')).toBeTruthy();
    expect(yollar.some((y) => y.includes('/icerik'))).toBe(false);
    cleanup();
    vi.unstubAllGlobals();
    const yYollar = sunucuKur(YONETICI);
    ac();
    await screen.findByText('Oturumsuz');
    await waitFor(() => expect(yYollar).toContain('/oturum'));
    fireEvent.change(screen.getByLabelText('Görünüm'), { target: { value: 'degisiklikler' } });
    fireEvent.click(await screen.findByRole('cell', { name: 'Üretim emri' }));
    expect(await screen.findByRole('cell', { name: 'kayit.parola' })).toBeTruthy();
    expect(screen.getAllByRole('cell', { name: '[gizli]' })).toHaveLength(2);
    expect(screen.getByRole('cell', { name: '5' })).toBeTruthy();
    expect(screen.getByRole('cell', { name: '7' })).toBeTruthy();
  });
});
