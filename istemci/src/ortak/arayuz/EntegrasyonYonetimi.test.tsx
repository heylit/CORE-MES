import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { HataGovdesi } from '#paylasilan/hata.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { EntegrasyonAkisi, EntegrasyonGunlukCevabi, EntegrasyonKomutCevabi, EntegrasyonYonetimiCevabi } from '#paylasilan/sozlesme/entegrasyon.ts';
import { BildirimSaglayici, EntegrasyonYonetimi } from './index.ts';

const YONETICI: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: ['ayarlar.yaz'] };
const IZLEYICI: Kullanici = { id: 2, ad: 'Deneme İzleyici', islemler: [] };

const akis = (ek: Partial<EntegrasyonAkisi> & Pick<EntegrasyonAkisi, 'anahtar' | 'ad' | 'yon'>): EntegrasyonAkisi => ({
  ne: 'ORN belge', acikAyari: `logo.${ek.anahtar}-okumasi`, acik: true, siklikAyari: null, siklik: null, siklikSecenekleri: [], simdiOkunabilir: false,
  okunuyor: false, sonrakiTur: null, son: null, bekleyen: null, ...ek,
});

// Sunucunun 3445 cevabı biçiminde (sözleşme tipine uyar); ORN- sentetik.
const YONETIM: EntegrasyonYonetimiCevabi = {
  baglanti: { anaAyar: 'logo.baglanti', acik: true, tanimli: true, karsiUc: 'Logo yardımcısı (127.0.0.1)', sonTest: null },
  akislar: [
    akis({
      anahtar: 'mal-kabul', ad: 'Mal kabul', yon: 'okuma', siklikAyari: 'logo.mal-kabul-sikligi', siklik: '15dk', siklikSecenekleri: ['elle', '5dk', '15dk', '60dk'],
      simdiOkunabilir: true, sonrakiTur: '2026-11-19T08:15:00.000Z', son: { zaman: '2026-11-19T08:00:00.000Z', sonuc: 'tamam', ileti: null },
    }),
    akis({ anahtar: 'fatura', ad: 'Faturalar', yon: 'okuma', acik: false, siklikAyari: 'logo.fatura-sikligi', siklik: '15dk', siklikSecenekleri: ['elle', '15dk'] }),
    akis({ anahtar: 'satin-alma', ad: 'Satın alma', yon: 'yazma', bekleyen: 2, son: { zaman: '2026-11-19T07:00:00.000Z', sonuc: 'hata', ileti: 'Belge 7: Reddedildi' } }),
  ],
  gunluk: [],
  bugunHata: 1,
};
const GUNLUK: EntegrasyonGunlukCevabi = {
  satirlar: [{ id: 9, zaman: '2026-11-19T08:00:00.000Z', akis: 'mal-kabul', akisAdi: 'Mal kabul', yon: 'okuma', sonuc: 'tamam', sayi: 4, ileti: null }],
  dahaVar: false,
};

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
interface Cagri { yol: string; yontem: string; govde: unknown }

function sunucuKur(kullanici: Kullanici, yonetim: EntegrasyonYonetimiCevabi = YONETIM) {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    cagrilar.push({ yol, yontem, govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : undefined });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol === '/logo/yonetim') return json(200, yonetim);
    if (yol.startsWith('/logo/yonetim/gunluk')) return json(200, GUNLUK);
    if (yol === '/logo/yonetim/akislar/mal-kabul/simdi-oku') return json(200, { sonuc: 'tamam', ileti: 'Mal kabul bir dakika içinde okunacak.' } satisfies EntegrasyonKomutCevabi);
    if (yol === '/logo/yonetim/baglanti-testi') return json(200, { sonuc: 'tamam', ileti: 'Yardımcı bu paketin kaynağından derlenmiş.' } satisfies EntegrasyonKomutCevabi);
    if (yol.startsWith('/ayarlar/') && yontem === 'POST') return json(200, {});
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' } satisfies HataGovdesi);
  }));
  return cagrilar;
}

function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><EntegrasyonYonetimi ad="Logo" kok="/logo" /></BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Entegrasyon yönetimi (3445)', () => {
  it('bağlantı kartı ve özet; adres yerine yalnız "tanımlı" yazar; ilk akışın ayrıntısı ve günlüğü açılır', async () => {
    sunucuKur(YONETICI);
    ac();
    expect(await screen.findByText('Logo bağlantısı')).toBeTruthy();
    expect(screen.getByText('Sunucu ayarında tanımlı')).toBeTruthy();
    const ozet = screen.getAllByRole('status').find((e) => e.textContent?.includes('okuma açık'));
    expect(ozet?.textContent).toContain('1/2 okuma açık');
    expect(ozet?.textContent).toContain('2 gönderim bekliyor');
    const ayrinti = screen.getByRole('region', { name: 'Mal kabul ayrıntısı' });
    expect((within(ayrinti).getByLabelText('Sıklık') as HTMLSelectElement).value).toBe('15dk');
    expect((await within(ayrinti).findAllByText('4 kayıt')).length).toBeGreaterThan(0);
  });

  it('sıklık ve aç/kapat genel ayar ucundan, ekranın gördüğü değerle gider; "Şimdi oku" yönetim ucundan', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac();
    const ayrinti = await screen.findByRole('region', { name: 'Mal kabul ayrıntısı' });
    fireEvent.change(within(ayrinti).getByLabelText('Sıklık'), { target: { value: '5dk' } });
    await waitFor(() => expect(cagrilar.find((c) => c.yol === '/ayarlar/logo.mal-kabul-sikligi/degistir')?.govde).toEqual({ deger: '5dk', beklenen: '15dk' }));
    fireEvent.click(within(ayrinti).getByRole('switch', { name: 'Mal kabul açık' }));
    await waitFor(() => expect(cagrilar.find((c) => c.yol === '/ayarlar/logo.mal-kabul-okumasi/degistir')?.govde).toEqual({ deger: false, beklenen: true }));
    fireEvent.click(within(ayrinti).getByRole('button', { name: /Şimdi oku/ }));
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/logo/yonetim/akislar/mal-kabul/simdi-oku' && c.yontem === 'POST')).toBe(true));
  });

  it('kapalı okumada sıklık ve "Şimdi oku" pasif, "Önce açın" yazar; yazma akışında sıklık yoktur', async () => {
    sunucuKur(YONETICI);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: /Faturalar/ }));
    const ayrinti = screen.getByRole('region', { name: 'Faturalar ayrıntısı' });
    expect((within(ayrinti).getByLabelText('Sıklık') as HTMLSelectElement).disabled).toBe(true);
    expect((within(ayrinti).getByRole('button', { name: /Şimdi oku/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(ayrinti).getAllByText('Önce açın').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /Satın alma/ }));
    const yazma = screen.getByRole('region', { name: 'Satın alma ayrıntısı' });
    expect(within(yazma).queryByLabelText('Sıklık')).toBeNull();
    expect(within(yazma).getByText(/Belge 7: Reddedildi/)).toBeTruthy();
  });

  it('"Bağlantıyı kes" önce onay ister; onaylanınca ana anahtar kapanır', async () => {
    const cagrilar = sunucuKur(YONETICI);
    ac();
    fireEvent.click(await screen.findByRole('button', { name: /Bağlantıyı kes/ }));
    expect(cagrilar.some((c) => c.yol === '/ayarlar/logo.baglanti/degistir')).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Evet, kes' }));
    await waitFor(() => expect(cagrilar.find((c) => c.yol === '/ayarlar/logo.baglanti/degistir')?.govde).toEqual({ deger: false, beklenen: true }));
  });

  it('(ret) ayar yazamayan kişi durumu görür; test, kes ve "Şimdi oku" düğmeleri çıkmaz, anahtarlar pasiftir', async () => {
    sunucuKur(IZLEYICI);
    ac();
    const ayrinti = await screen.findByRole('region', { name: 'Mal kabul ayrıntısı' });
    expect(screen.queryByRole('button', { name: /Bağlantıyı test et/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Bağlantıyı kes/ })).toBeNull();
    expect(within(ayrinti).queryByRole('button', { name: /Şimdi oku/ })).toBeNull();
    expect((within(ayrinti).getByRole('switch', { name: 'Mal kabul açık' }) as HTMLButtonElement).disabled).toBe(true);
  });
});
