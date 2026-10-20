import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { Yedek, YedeklerCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { SistemAyarlari } from './SistemAyarlari.tsx';
import { boyutMetni } from './Yedekler.tsx';

// Sunucunun gerçek cevap biçimi; değerler denemedir.
const YEDEK: Yedek = { ad: 'tmiv2-20261013T230000Z-gece.dump', tur: 'gece', zaman: '2026-10-13T23:00:00.000Z', boyut: 5 * 1024 * 1024 };
const ACIK: YedeklerCevabi = {
  durum: 'acik', dizin: 'D:\\TMIV2-YEDEK', kaynak: 'ortam', saat: 2, saklamaGun: 14, enAzKalan: 3, suruyor: null, sonHata: null, yedekler: [YEDEK],
};
const CAKISMA = { kod: 'CAKISMA', mesaj: 'Bir yedek zaten alınıyor; bitince yeniden deneyin.' } satisfies HataGovdesi;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(
  liste: YedeklerCevabi,
  al: () => Response = () => json(200, { baslangic: '2026-10-14T06:00:00.000Z' }),
  dizin: (govde: unknown) => Response = () => json(404, {}),
) {
  const istekler: { yontem: string; yol: string; govde?: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: { method?: string; body?: string } = {}) => {
    const yol = adres.replace('/api', '');
    const govde: unknown = secenek.body === undefined ? undefined : JSON.parse(secenek.body);
    istekler.push({ yontem: secenek.method ?? 'GET', yol, ...(govde === undefined ? {} : { govde }) });
    if (yol === '/yedekler/dizin/degistir') return dizin(govde);
    if (yol === '/ayarlar') return json(200, { ayarlar: [] });
    if (yol === '/kurum-logosu') return json(200, { logo: null });
    if (yol === '/yedekler') return json(200, liste);
    if (yol === '/yedekler/al') return al();
    if (yol === `/yedekler/${YEDEK.ad}/indirme-izni`) return json(200, { izin: 'deneme-izni' });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

function ac(islemler: Islem[]) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  istemci.setQueryData<Kullanici>(ortakAnahtarlar.oturum, { id: 1, ad: 'Deneme', islemler });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici><SistemAyarlari ekranlar={[]} /></BildirimSaglayici>
    </QueryClientProvider>,
  );
}

const YONETICI: Islem[] = ['sayfa.ayarlar', 'ayarlar.yaz', 'ayarlar.yedek-indir'];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('Sistem Ayarları, yedekler', () => {
  it('sekme yalnız yedek işlemi olana görünür; olmayanın ekranı yedek listesini istemez', async () => {
    const istekler = sunucuKur(ACIK);
    ac(['sayfa.ayarlar', 'ayarlar.yaz']);
    await screen.findByRole('tab', { name: 'Genel' });
    expect(screen.queryByRole('tab', { name: 'Yedekler' })).toBeNull();
    expect(istekler.some((i) => i.yol === '/yedekler')).toBe(false);
    cleanup();
    ac(YONETICI);
    expect(await screen.findByRole('tab', { name: 'Yedekler' })).toBeTruthy();
  });

  it('yedekleri tesis saatiyle listeler; indirme önce izin komutu gönderir, sonra o izinle kendi adresini indirir', async () => {
    const istekler = sunucuKur(ACIK);
    const tiklanan: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      tiklanan.push({ href: this.getAttribute('href') ?? '', download: this.download });
    });
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Yedekler' }));
    expect(await screen.findByText('Yedek açık')).toBeTruthy();
    expect(screen.getByText(/her gece 02:00'den sonra/)).toBeTruthy();
    expect(screen.getByText('14.10.2026 02:00')).toBeTruthy();
    expect(screen.getByText('5 MB')).toBeTruthy();
    expect(istekler.some((i) => i.yol.endsWith('/indirme-izni'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: `${YEDEK.ad} indir` }));
    await waitFor(() => { expect(tiklanan).toEqual([{ href: `/api/yedekler/${YEDEK.ad}/indir?izin=deneme-izni`, download: YEDEK.ad }]); });
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => i.yol)).toEqual([`/yedekler/${YEDEK.ad}/indirme-izni`]);
  });

  it('şimdi yedek al komutu gönderir; sunucunun reddi bildirilir', async () => {
    const istekler = sunucuKur(ACIK, () => json(409, CAKISMA));
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Yedekler' }));
    fireEvent.click(await screen.findByRole('button', { name: /Şimdi yedek al/ }));
    expect(await screen.findByText(CAKISMA.mesaj)).toBeTruthy();
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => i.yol)).toEqual(['/yedekler/al']);
  });

  it('kapalı yedekte nedeni yazar ve düğme kapalıdır; süren yedekte düğme kapalı, son hata görünür', async () => {
    sunucuKur({ ...ACIK, durum: 'dizin-yok', dizin: null, kaynak: null, yedekler: [] });
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Yedekler' }));
    expect(await screen.findByText(/TMIV2_YEDEK_DIZINI/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Şimdi yedek al/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('Yedek yok.')).toBeTruthy();
    cleanup();
    // Anahtarsız sunucu yedek almaz (145 a): neden ve anahtar değişkeni yazılır.
    sunucuKur({ ...ACIK, durum: 'anahtar-yok' });
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Yedekler' }));
    expect(await screen.findByText(/TMIV2_YEDEK_ANAHTARI/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Şimdi yedek al/ }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    sunucuKur({
      ...ACIK,
      suruyor: { tur: 'elle', baslangic: '2026-10-14T06:00:00.000Z' },
      sonHata: { zaman: '2026-10-13T23:00:00.000Z', ileti: 'pg_dump bulunamadı (pg_dump); tam yolu TMIV2_PG_DUMP ile verin.' },
    });
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Yedekler' }));
    expect(await screen.findByText('Yedek alınıyor')).toBeTruthy();
    await waitFor(() => { expect((screen.getByRole('button', { name: /Şimdi yedek al/ }) as HTMLButtonElement).disabled).toBe(true); });
    expect(screen.getByRole('alert').textContent).toMatch(/Son yedek alınamadı.*TMIV2_PG_DUMP/);
  });

  it('klasör seçimi seçilen yolu gönderir; sunucunun reddi bildirilir; seçilmiş klasörden sunucu ayarına dönülür', async () => {
    const RED = { kod: 'DOGRULAMA', mesaj: 'Klasör sunucuda bulunamadı.' } satisfies HataGovdesi;
    let istekler = sunucuKur(ACIK, undefined, () => json(400, RED));
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Yedekler' }));
    expect(await screen.findByText(/D:\\TMIV2-YEDEK · Sunucu ayarından/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Sunucu ayarına dön/ })).toBeNull();
    const kutu = screen.getByLabelText('Yedek klasörü');
    fireEvent.change(kutu, { target: { value: '  E:\\YEDEK  ' } });
    fireEvent.click(screen.getByRole('button', { name: /Kaydet/ }));
    expect(await screen.findByText(RED.mesaj)).toBeTruthy();
    expect(istekler.filter((i) => i.yontem === 'POST')).toEqual([{ yontem: 'POST', yol: '/yedekler/dizin/degistir', govde: { dizin: 'E:\\YEDEK' } }]);
    cleanup();
    istekler = sunucuKur({ ...ACIK, dizin: 'E:\\YEDEK', kaynak: 'ayar' }, undefined, () => json(200, { dizin: 'D:\\TMIV2-YEDEK', kaynak: 'ortam' }));
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Yedekler' }));
    expect(await screen.findByText(/E:\\YEDEK · Bu ekrandan seçildi/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Kaydet/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Sunucu ayarına dön/ }));
    expect(await screen.findByText('Yedek klasörü kaydedildi.')).toBeTruthy();
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => i.govde)).toEqual([{ dizin: null }]);
  });

  it('boyut KB altında ve MB olarak okunur yazılır', () => {
    expect(boyutMetni(1536)).toBe('1,5 KB');
    expect(boyutMetni(5 * 1024 * 1024)).toBe('5 MB');
    expect(boyutMetni(1258291)).toBe('1,2 MB');
  });
});
