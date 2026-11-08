import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { PgSurumu, Yedek, YedeklerCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import type { Ayrinti, GunIciKoruma } from '#paylasilan/sozlesme/saglik.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { SistemAyarlari } from './SistemAyarlari.tsx';
import { alanMetni, boyutMetni, tabanMetni } from './Yedekler.tsx';

// Sunucunun gerçek cevap biçimi; değerler denemedir.
const YEDEK: Yedek = { ad: 'tmiv2-20261013T230000Z-gece.dump', tur: 'gece', zaman: '2026-10-13T23:00:00.000Z', boyut: 5 * 1024 * 1024 };
const PG_SURUMU: PgSurumu = {
  sunucu: 18, sunucuMetni: 'PostgreSQL 18.1, compiled by Visual C++', pgDump: 18, pgDumpYolu: 'C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe', uyumlu: true, ileti: null,
};
const ACIK: YedeklerCevabi = {
  durum: 'acik', dizin: 'D:\\TMIV2-YEDEK', kaynak: 'ortam', saat: 2, saklamaGun: 14, enAzKalan: 3, suruyor: null, sonHata: null, yedekler: [YEDEK],
  alan: { sonBoyut: YEDEK.boyut, adet: 15, gereken: 15 * YEDEK.boyut, mevcut: YEDEK.boyut, bosYer: 10 * 1024 ** 3, yetmiyor: false },
  dosyaDeposu: { bayt: 2 * 1024 ** 3, sinir: 50 * 1024 ** 3, uyari: false },
  pgSurumu: PG_SURUMU,
};
// Ayrıntı cevabının bölümün okumadığı alanları; değerler denemedir.
const AYRINTI: Ayrinti = {
  veritabaniGecikmeMs: 1, sonGoc: null, commit: null, calismaSuresiSn: 1, ortam: 'test', isler: [], uyarilar: [],
};
const KOPYA = {
  zaman: '2026-10-30T09:00:00.000Z', sonuc: 'basarili' as const, hedef: 'F:\\', taban: '20261101', tabanBayt: 3 * 1024 ** 3, walAdet: 120, walBayt: 2 * 1024 ** 3, hata: null,
};
const TAKILDI: GunIciKoruma = {
  walArsivi: {
    acik: true, sonArsivZamani: '2026-11-08T07:00:00.000Z', sonArsivWal: '000000010000000000000009', hataSayisi: 4,
    sonHataZamani: '2026-11-08T07:05:00.000Z', sonHataWal: '00000001000000000000000A',
  },
  sonDisKopya: KOPYA, sonBasariliDisKopya: KOPYA,
  walUyarisi: 'WAL arşivi takıldı: 00000001000000000000000A arşivlenemiyor; PostgreSQL günlüğüne bakın (kurulum/yedek.md, Arşiv sağlığı).',
  disKopyaUyarisi: 'Son şifreli dış kopya 9 gün önce alındı; diski değiştirip yeni kopya alın.',
};
const CAKISMA = { kod: 'CAKISMA', mesaj: 'Bir yedek zaten alınıyor; bitince yeniden deneyin.' } satisfies HataGovdesi;

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(
  liste: YedeklerCevabi,
  al: () => Response = () => json(200, { baslangic: '2026-10-14T06:00:00.000Z' }),
  dizin: (govde: unknown) => Response = () => json(404, {}),
  gunIci?: GunIciKoruma,
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
    if (yol === '/saglik/ayrinti') return json(200, { ...AYRINTI, ...(gunIci === undefined ? {} : { gunIciKoruma: gunIci }) });
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

  it('PostgreSQL sürümü yalnız okunur gösterilir: sunucu ve pg_dump ana sürümü, sürüm metni ve araç yolu; seçim kutusu yoktur', async () => {
    sunucuKur(ACIK);
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Yedekler' }));
    expect(await screen.findByText('Uyumlu')).toBeTruthy();
    expect(screen.getByText(/Veritabanı sunucusu 18, yedek aracı \(pg_dump\) 18\./)).toBeTruthy();
    expect(screen.getByText('PostgreSQL 18.1, compiled by Visual C++')).toBeTruthy();
    expect(screen.getByText('pg_dump: C:\\Program Files\\PostgreSQL\\18\\bin\\pg_dump.exe')).toBeTruthy();
    expect(screen.queryByRole('combobox')).toBeNull();
  });

  it('PostgreSQL sürümü uyuşmazsa ya da okunamazsa kırmızı rozet ve sunucunun nedeni görünür', async () => {
    const ileti = 'pg_dump ana sürümü 16, veritabanı sunucusu 18: uyuşmuyor, yedek alınmadı.';
    sunucuKur({ ...ACIK, pgSurumu: { ...PG_SURUMU, pgDump: 16, uyumlu: false, ileti } });
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Yedekler' }));
    expect(await screen.findByText('Uyuşmuyor')).toBeTruthy();
    expect(screen.getByText(ileti)).toBeTruthy();
    cleanup();
    sunucuKur({ ...ACIK, pgSurumu: { ...PG_SURUMU, sunucu: null, sunucuMetni: null, uyumlu: false, ileti: 'Veritabanı sunucusunun sürümü okunamadı.' } });
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Yedekler' }));
    expect(await screen.findByText('Denetlenemedi')).toBeTruthy();
    expect(screen.getByText(/Veritabanı sunucusu okunamadı/)).toBeTruthy();
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

  it('yedek alanı tahmini, boş yer ve dosya deposu yazılır; yetmeyen alan ve dolan depo uyarılır', async () => {
    sunucuKur(ACIK);
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Yedekler' }));
    expect(await screen.findByText(/Tahmini yedek alanı 75 MB \(son yedek 5 MB × 15 yedek\)\. Şimdiki yedekler 5 MB\. Yedek diskinde boş 10 GB\./)).toBeTruthy();
    expect(screen.getByText(/Dosya deposu 2 GB \/ 50 GB/)).toBeTruthy();
    expect(screen.queryByText('Yedek alanı yetmeyecek')).toBeNull();
    expect(screen.queryByText('Dosya deposu dolmak üzere')).toBeNull();
    cleanup();
    sunucuKur({
      ...ACIK,
      alan: { sonBoyut: null, adet: 15, gereken: null, mevcut: 0, bosYer: null, yetmiyor: false },
      dosyaDeposu: { bayt: 41 * 1024 ** 3, sinir: 50 * 1024 ** 3, uyari: true },
      yedekler: [],
    });
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Yedekler' }));
    expect(await screen.findByText(/Henüz yedek yok; gereken yer ilk yedekten sonra hesaplanır\..*boş yeri okunamadı/)).toBeTruthy();
    expect(screen.getByText('Dosya deposu dolmak üzere')).toBeTruthy();
    cleanup();
    sunucuKur({ ...ACIK, alan: { ...ACIK.alan!, yetmiyor: true } });
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Yedekler' }));
    expect(await screen.findByText('Yedek alanı yetmeyecek')).toBeTruthy();
    cleanup();
    // Yedek kapalıyken yer tahmini yoktur; depo yine yazılır.
    sunucuKur({ ...ACIK, durum: 'dizin-yok', dizin: null, kaynak: null, yedekler: [], alan: null });
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Yedekler' }));
    expect(await screen.findByText(/Dosya deposu 2 GB/)).toBeTruthy();
    expect(screen.queryByText(/Tahmini yedek alanı/)).toBeNull();
  });

  it('gün içi koruma: son arşiv, hata, son taban ve dış kopya tesis saatiyle yazılır; takılan arşiv ve eski dış kopya uyarılır', async () => {
    sunucuKur(ACIK, undefined, undefined, TAKILDI);
    ac([...YONETICI, 'saglik.ayrinti-oku']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Yedekler' }));
    expect(await screen.findByText('WAL arşivi takıldı')).toBeTruthy();
    expect(screen.getByText('Dış kopya eski ya da eksik')).toBeTruthy();
    expect(screen.getByText('Son arşiv 08.11.2026 10:00. Arşiv hatası 4, sonuncusu 08.11.2026 10:05.')).toBeTruthy();
    expect(screen.getByText('Son taban yedek 01.11.2026, 3 GB (son dış kopyadaki).')).toBeTruthy();
    expect(screen.getByText('Son dış kopya 30.10.2026 12:00. 120 WAL dosyası (2 GB).')).toBeTruthy();
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual([
      `Uyarı ${TAKILDI.walUyarisi ?? ''}`, `Uyarı ${TAKILDI.disKopyaUyarisi ?? ''}`,
    ]);
  });

  it('gün içi koruma: arşiv kapalıysa kapalı yazılır, uyarı yok; ayrıntı işlemi olmayana bölüm çıkmaz ve ayrıntı istenmez', async () => {
    sunucuKur(ACIK, undefined, undefined, {
      walArsivi: { acik: false, sonArsivZamani: null, sonArsivWal: null, hataSayisi: 0, sonHataZamani: null, sonHataWal: null },
      sonDisKopya: null, sonBasariliDisKopya: null, walUyarisi: null, disKopyaUyarisi: null,
    });
    ac([...YONETICI, 'saglik.ayrinti-oku']);
    fireEvent.click(await screen.findByRole('tab', { name: 'Yedekler' }));
    expect(await screen.findByText('WAL arşivi kapalı')).toBeTruthy();
    expect(screen.getByText(/gün içi kayıt yalnız gece yedeğiyle korunur/)).toBeTruthy();
    expect(screen.getByText('Şifreli dış kopya hiç alınmamış.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    cleanup();
    const istekler = sunucuKur(ACIK, undefined, undefined, TAKILDI);
    ac(YONETICI);
    fireEvent.click(await screen.findByRole('tab', { name: 'Yedekler' }));
    expect(await screen.findByText('Yedek açık')).toBeTruthy();
    expect(screen.queryByText(/Gün içi koruma/)).toBeNull();
    expect(istekler.some((i) => i.yol === '/saglik/ayrinti')).toBe(false);
  });

  it('taban yedek adı yyyyMMdd ise tarih, değilse olduğu gibi yazılır', () => {
    expect(tabanMetni('20261108')).toBe('08.11.2026');
    expect(tabanMetni('elle-1')).toBe('elle-1');
  });

  it('alan 1 GB altında boyut gibi, üstünde GB olarak yazılır', () => {
    expect(alanMetni(5 * 1024 * 1024)).toBe('5 MB');
    expect(alanMetni(1.5 * 1024 ** 3)).toBe('1,5 GB');
  });

  it('boyut KB altında ve MB olarak okunur yazılır', () => {
    expect(boyutMetni(1536)).toBe('1,5 KB');
    expect(boyutMetni(5 * 1024 * 1024)).toBe('5 MB');
    expect(boyutMetni(1258291)).toBe('1,2 MB');
  });
});
