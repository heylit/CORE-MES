import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Islem } from '#paylasilan/islemler.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { AyarlarCevabi } from '#paylasilan/sozlesme/ayarlar.ts';
import type { LogoHazirlikCevabi, LogoKontrolCevabi } from '#paylasilan/sozlesme/logo.ts';
import type { SmartesHazirlikCevabi, SmartesKontrolCevabi } from '#paylasilan/sozlesme/smartes.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar as ortakAnahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { akisGorunumu, BaglantiHazirligi, genelDurum } from './BaglantiHazirligi.tsx';
import { SistemAyarlari } from './SistemAyarlari.tsx';

// Sunucunun cevap biçimi (sözleşme tipleri); adresler deneme adresidir.
const LOGO: LogoHazirlikCevabi = {
  baglanti: 'acik',
  ortam: { adres: 'http://10.0.0.5:5149', anahtarTanimli: true },
  ayarlar: [{ anahtar: 'logo.baglanti', baslik: 'Logo bağlantısı', acik: true }, { anahtar: 'logo.satis-gonderimi', baslik: 'Logo: satış gönderimi', acik: false }],
  akislar: [
    { anahtar: 'malzeme-karti', yon: 'tmi-logo', baslik: 'Malzeme kartı', aciklama: 'A', durum: 'hazir', gonderilen: 12, hatali: 1, sonDeneme: '2026-10-15T10:00:00.000+03:00' },
    { anahtar: 'satin-alma-siparisi', yon: 'tmi-logo', baslik: 'Satın alma siparişi', aciklama: 'A', durum: 'baglanmadi', gonderilen: 0, hatali: 0, sonDeneme: null },
    { anahtar: 'mal-kabul', yon: 'logo-tmi', baslik: 'Mal kabul (irsaliye satırları)', aciklama: 'A', durum: 'kodda-yok', gonderilen: null, hatali: null, sonDeneme: null },
  ],
  sonBirimSetiOkuma: null,
};
const SMARTES: SmartesHazirlikCevabi = {
  baglanti: 'ortam-degiskeni-yok',
  ortam: { adres: null, adAlani: null },
  akislar: [
    { anahtar: 'is-emri', yon: 'tmi-smartes', baslik: 'İş emri gönderimi', aciklama: 'A', durum: 'ayar-eksik', islenen: 0, hatali: 0, sonDeneme: null, sonHata: null },
    { anahtar: 'durus', yon: 'smartes-tmi', baslik: 'Duruşlar', aciklama: 'A', durum: 'ayar-eksik', islenen: 3, hatali: null, sonDeneme: '2026-10-15T09:00:00.000+03:00', sonHata: 'SmartES süresinde cevap vermedi.' },
  ],
};
const LOGO_KONTROL_HATA: LogoKontrolCevabi = {
  zaman: '2026-10-15T11:00:00.000Z', ulasildi: false,
  adimlar: [
    { ad: 'Köprüye ulaşım ve anahtar (ambar listesi)', yol: '/api/Lookup/warehouses', sonuc: 'hata', sureMs: 12, ileti: 'Köprüye ulaşılamadı (ECONNREFUSED).' },
    { ad: 'Birim seti listesi', yol: '/api/Lookup/unitsets', sonuc: 'atlandi', sureMs: null, ileti: 'Önceki adım başarısız; istek atılmadı.' },
  ],
};
const SMARTES_KONTROL: SmartesKontrolCevabi = { zaman: '2026-10-15T11:00:00.000Z', ulasildi: false, adimlar: [] };

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(logoKontrol: LogoKontrolCevabi = LOGO_KONTROL_HATA) {
  const istekler: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string) => {
    const yol = adres.replace('/api', '');
    istekler.push(yol);
    if (yol === '/logo/hazirlik') return json(200, LOGO);
    if (yol === '/smartes/hazirlik') return json(200, SMARTES);
    if (yol === '/logo/hazirlik/kontrol') return json(200, logoKontrol);
    if (yol === '/smartes/hazirlik/kontrol') return json(200, SMARTES_KONTROL);
    if (yol === '/ayarlar') return json(200, { ayarlar: [] } satisfies AyarlarCevabi);
    if (yol === '/kapali-sayfalar') return json(200, { kapali: [] });
    if (yol === '/kurum-logosu') return json(200, { logo: null });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}

function cizdir(icerik: React.ReactNode, islemler?: Islem[]) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (islemler) istemci.setQueryData<Kullanici>(ortakAnahtarlar.oturum, { id: 1, ad: 'Deneme', islemler });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici>{icerik}</BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Bağlantı hazırlığı', () => {
  it('ortam, ayar ve akışları yön başına gösterir; anahtar değeri yoktur; açılışta dış sisteme deneme gitmez', async () => {
    const istekler = sunucuKur();
    cizdir(<BaglantiHazirligi />);
    expect(await screen.findByText('http://10.0.0.5:5149')).toBeTruthy();
    expect(screen.getByText('Tanımlı')).toBeTruthy();
    expect(screen.getByText('Tanımlı değil (TMIV2_SMARTES_ADRESI)')).toBeTruthy();
    const tmiLogo = screen.getByRole('region', { name: 'TMI → Logo' });
    expect(within(tmiLogo).getByText('Malzeme kartı')).toBeTruthy();
    expect(within(tmiLogo).getByText('12 gönderildi · 1 hatalı')).toBeTruthy();
    expect(within(tmiLogo).getByText('Modül bağlanmadı')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Logo → TMI' })).getByText('Kodda yok')).toBeTruthy();
    expect(screen.getByText('Son okuma: SmartES süresinde cevap vermedi.')).toBeTruthy();
    expect(screen.getByText('Açık, denenmedi')).toBeTruthy();
    expect(screen.getByText('Ortam değişkeni eksik')).toBeTruthy();
    expect(istekler.filter((y) => y.endsWith('/kontrol'))).toEqual([]);
  });

  it('"Bağlantıyı dene" yalnız o sistemin denemesini ister; ulaşılamazsa hazır akış "Bağlantı yok" olur', async () => {
    const istekler = sunucuKur();
    cizdir(<BaglantiHazirligi />);
    await screen.findByText('Malzeme kartı');
    expect(screen.getByText('Hazır')).toBeTruthy();
    fireEvent.click(screen.getAllByRole('button', { name: 'Bağlantıyı dene' })[0] as HTMLElement);
    expect(await screen.findByText('Köprüye ulaşılamadı (ECONNREFUSED). (12 ms)')).toBeTruthy();
    expect(istekler.filter((y) => y.endsWith('/kontrol'))).toEqual(['/logo/hazirlik/kontrol']);
    const tmiLogo = screen.getByRole('region', { name: 'TMI → Logo' });
    expect(within(tmiLogo).getByText('Bağlantı yok')).toBeTruthy();
    expect(within(tmiLogo).queryByText('Hazır')).toBeNull();
  });

  it('genel durum ve akış görünümü kuralları', () => {
    const tamam = { zaman: 'x', ulasildi: true, adimlar: [{ ad: 'a', sonuc: 'tamam' as const, sureMs: 1, ileti: '' }] };
    expect(genelDurum('acik', tamam).metin).toBe('Çalışmaya hazır');
    expect(genelDurum('kapali', tamam).metin).toBe('Bağlantı çalışıyor, anahtar kapalı');
    expect(genelDurum('acik', { ...tamam, adimlar: [{ ...tamam.adimlar[0]!, sonuc: 'hata' }] }).metin).toBe('Bağlantıda sorun var');
    expect(genelDurum('acik', { ...tamam, ulasildi: false }).metin).toBe('Bağlantı yok');
    expect(akisGorunumu('hazir', { ...tamam, ulasildi: false })).toBe('baglanti-yok');
    expect(akisGorunumu('kapali', { ...tamam, ulasildi: false })).toBe('kapali');
    expect(akisGorunumu('hazir', undefined)).toBe('hazir');
  });
});

describe('Sistem Ayarları > Bağlantılar', () => {
  it('sistem ayrıntısını gören yöneticide "Hazırlık ve akış" ilk sekmedir', async () => {
    sunucuKur();
    cizdir(<SistemAyarlari ekranlar={[]} />, ['sayfa.ayarlar', 'saglik.ayrinti-oku'] as Islem[]);
    fireEvent.click(screen.getByRole('tab', { name: 'Bağlantılar' }));
    const alt = within(screen.getByRole('tablist', { name: 'Bağlantılar' })).getAllByRole('tab').map((t) => t.textContent);
    expect(alt).toEqual(['Hazırlık ve akış', 'Logo', 'SmartES']);
    expect(await screen.findByText('Logo Tiger köprüsü')).toBeTruthy();
  });

  it('(ret) yetkisi olmayana hazırlık sekmesi çıkmaz ve uçları istenmez', async () => {
    const istekler = sunucuKur();
    cizdir(<SistemAyarlari ekranlar={[]} />, ['sayfa.ayarlar'] as Islem[]);
    fireEvent.click(screen.getByRole('tab', { name: 'Bağlantılar' }));
    const alt = within(screen.getByRole('tablist', { name: 'Bağlantılar' })).getAllByRole('tab').map((t) => t.textContent);
    expect(alt).toEqual(['Logo', 'SmartES']);
    await screen.findAllByRole('tab');
    expect(istekler.some((y) => y.includes('hazirlik'))).toBe(false);
  });
});
