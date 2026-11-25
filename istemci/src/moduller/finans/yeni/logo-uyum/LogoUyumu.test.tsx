import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { FaturaEslesmeCevabi, FaturaEslesmeSatiri } from '#paylasilan/sozlesme/logo.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { aciklama, bayatMi, farkKurusu, farkMetni, turAdi } from './kurallar.ts';
import { LogoUyumu } from './LogoUyumu.tsx';

// 3675 D3: Logo uyumu ekranı. Değerler sentetiktir (ORN-); ekran yalnız GET atar.
const OKUYAN: Kullanici = { id: 1, ad: 'Deneme Finans', islemler: ['sayfa.finans', 'finans.oku'] };
const YONETICI: Kullanici = { id: 2, ad: 'Deneme Yönetici', islemler: ['sayfa.finans', 'finans.oku', 'sayfa.logo'] };
const taraf = (net: string, kdv: string, toplam: string, ek: Partial<NonNullable<FaturaEslesmeSatiri['logo']>> = {}) => ({ net, kdv, toplam, paraBirimi: 'TRY', iptal: false, ...ek });
const finansTarafi = (net: string, kdv: string, toplam: string, ek: Partial<NonNullable<FaturaEslesmeSatiri['finans']>> = {}) => ({ belgeId: 7, ...taraf(net, kdv, toplam), ...ek });
const TARIH = '2026-11-12';
const ESLESTI: FaturaEslesmeSatiri = {
  durum: 'eslesti', yon: 'gider', iade: false, faturaNo: 'ORN-B-0085', tarih: TARIH, cariKodu: 'ORN-C010', firmaAdi: 'ORN Takım Tic.',
  logo: taraf('2100.00', '378.00', '2478.00'), finans: finansTarafi('2100.00', '378.00', '2478.00', { belgeId: 1 }), farklar: [], farkTutari: null,
};
const KDV_FARKI: FaturaEslesmeSatiri = {
  durum: 'farkli', yon: 'gider', iade: false, faturaNo: 'ORN-B-0087', tarih: TARIH, cariKodu: 'ORN-C014', firmaAdi: 'ORN Çelik A.Ş.',
  logo: taraf('4250.00', '765.00', '5015.00'), finans: finansTarafi('4250.00', '720.00', '4970.00', { belgeId: 2 }), farklar: ['kdv', 'toplam'], farkTutari: '45.00',
};
const IPTAL_FARKI: FaturaEslesmeSatiri = {
  durum: 'farkli', yon: 'gelir', iade: false, faturaNo: 'ORN-A-0412', tarih: TARIH, cariKodu: 'ORN-C001', firmaAdi: 'ORN Metal Ltd.',
  logo: taraf('10000.00', '1800.00', '11800.00', { iptal: true }), finans: finansTarafi('10000.00', '1800.00', '11800.00', { belgeId: 3 }), farklar: ['iptal'], farkTutari: null,
};
const PARA_FARKI: FaturaEslesmeSatiri = {
  durum: 'farkli', yon: 'gider', iade: true, faturaNo: 'ORN-A-0398', tarih: TARIH, cariKodu: 'ORN-C003', firmaAdi: 'ORN Kalıp San.',
  logo: taraf('1200.00', '216.00', '1416.00'), finans: finansTarafi('1200.00', '216.00', '1416.00', { belgeId: 4, paraBirimi: 'EUR' }), farklar: ['para-birimi'], farkTutari: null,
};
const YALNIZ_LOGO: FaturaEslesmeSatiri = {
  durum: 'logoda-var-finansta-yok', yon: 'gelir', iade: false, faturaNo: 'ORN-A-0420', tarih: TARIH, cariKodu: 'ORN-C007', firmaAdi: null,
  logo: taraf('22500.00', '4050.00', '26550.00'), finans: null, farklar: [], farkTutari: null,
};
const YALNIZ_FINANS: FaturaEslesmeSatiri = {
  durum: 'finansta-var-logoda-yok', yon: 'gelir', iade: false, faturaNo: 'ORN-A-0415', tarih: TARIH, cariKodu: 'ORN-C002', firmaAdi: 'ORN Otomotiv A.Ş.',
  logo: null, finans: finansTarafi('8000.00', '1440.00', '9440.00', { belgeId: 5 }), farklar: [], farkTutari: null,
};
const KODSUZ: FaturaEslesmeSatiri = {
  durum: 'cari-kodu-yok', yon: 'gider', iade: false, faturaNo: 'ORN-B-0089', tarih: TARIH, cariKodu: null, firmaAdi: 'ORN Vida Ltd.',
  logo: null, finans: finansTarafi('3000.00', '540.00', '3540.00', { belgeId: 6 }), farklar: [], farkTutari: null,
};
const SATIRLAR = [IPTAL_FARKI, KDV_FARKI, PARA_FARKI, YALNIZ_LOGO, YALNIZ_FINANS, KODSUZ, ESLESTI];
const simdi = Date.now();
const SAYAC: FaturaEslesmeCevabi['durumlar'] = [
  { durum: 'eslesti', sayi: 41 }, { durum: 'farkli', sayi: 3 }, { durum: 'logoda-var-finansta-yok', sayi: 1 },
  { durum: 'finansta-var-logoda-yok', sayi: 1 }, { durum: 'cari-kodu-yok', sayi: 1 },
];
const CEVAP: FaturaEslesmeCevabi = {
  satirlar: SATIRLAR, toplam: 7, sayfa: 1, sayfaBoyu: 50, durumlar: SAYAC, baglanamayan: 1, baslangic: '2026-08-26',
  okuma: { acik: true, sonOkuma: new Date(simdi - 20 * 60_000).toISOString() },
};

const json = (kod: number, govde: unknown) => new Response(JSON.stringify(govde), { status: kod });
function sunucuKur(kullanici: Kullanici, kaynak: FaturaEslesmeCevabi | ((yol: string) => Response | FaturaEslesmeCevabi) = CEVAP) {
  const istekler: { yol: string; yontem: string }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    istekler.push({ yol, yontem: secenek?.method ?? 'GET' });
    if (yol === '/oturum') return json(200, { kullanici } satisfies OturumCevabi);
    if (yol.startsWith('/logo/fatura-eslesme?')) {
      const c = typeof kaynak === 'function' ? kaynak(yol) : kaynak;
      return c instanceof Response ? c : json(200, c);
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'yok' });
  }));
  return istekler;
}
function ciz() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const sonuc = render(<QueryClientProvider client={istemci}><MemoryRouter><LogoUyumu /></MemoryRouter></QueryClientProvider>);
  return { ...sonuc, istemci };
}
const SAYAC_GRUBU = { name: /bir duruma dokununca/ } as const;
const eslesmeIstekleri = (i: { yol: string }[]) => i.filter((x) => x.yol.startsWith('/logo/fatura-eslesme?')).map((x) => new URLSearchParams(x.yol.split('?')[1]));

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Logo uyumu: kurallar', () => {
  it('fark Logo eksi finanstır; bir taraf yoksa, cari kodu yoksa ve para birimi farklıysa "—", eşitse "0,00"', () => {
    expect(farkMetni(farkKurusu(KDV_FARKI, 'toplam'))).toBe('+45,00');
    expect(farkMetni(farkKurusu(KDV_FARKI, 'kdv'))).toBe('+45,00');
    expect(farkMetni(farkKurusu(IPTAL_FARKI, 'toplam'))).toBe('0,00');
    expect(farkMetni(farkKurusu(YALNIZ_LOGO, 'toplam'))).toBe('—');
    expect(farkMetni(farkKurusu(YALNIZ_FINANS, 'toplam'))).toBe('—');
    expect(farkMetni(farkKurusu(PARA_FARKI, 'toplam'))).toBe('—');
    expect(farkMetni(farkKurusu({ ...KODSUZ, logo: taraf('3000.00', '540.00', '3540.00') }, 'toplam'))).toBe('—');
    expect(farkMetni(-1250)).toBe('−12,50');
  });
  it('tür yönden ve iadeden türer (iade ters yönde); açıklama her durum için vardır, eşleşenin yoktur', () => {
    expect([ESLESTI, IPTAL_FARKI, PARA_FARKI, { ...ESLESTI, yon: 'gelir' as const, iade: true }].map(turAdi)).toEqual(['Alış', 'Satış', 'Satış iade', 'Alış iade']);
    expect(aciklama(ESLESTI)).toBeNull();
    for (const s of [IPTAL_FARKI, KDV_FARKI, PARA_FARKI, YALNIZ_LOGO, YALNIZ_FINANS, KODSUZ]) expect(aciklama(s)).not.toBeNull();
    expect(aciklama(IPTAL_FARKI)).toContain("Logo'da iptal edilmiş");
  });
  it('okuma 24 saatten eskiyse bayattır; hiç okunmadıysa bayat sayılmaz (ayrı ileti)', () => {
    expect(bayatMi(new Date(simdi - 25 * 3_600_000).toISOString(), simdi)).toBe(true);
    expect(bayatMi(new Date(simdi - 2 * 3_600_000).toISOString(), simdi)).toBe(false);
    expect(bayatMi(null, simdi)).toBe(false);
  });
});

describe('Logo uyumu: ekran', () => {
  it('beş durum sayacı, satırlar ve fark sütunu gelir; yalnız GET atılır', async () => {
    const istekler = sunucuKur(OKUYAN);
    ciz();
    const grup = await screen.findByRole('group', SAYAC_GRUBU);
    for (const ad of ['Eşleşti', 'Farklı', "Yalnız Logo'da", 'Yalnız finansta', 'Cari kodu yok']) expect(within(grup).getByText(ad)).toBeTruthy();
    expect(within(grup).getByText('41')).toBeTruthy();
    const liste = screen.getByRole('list', { name: 'Fatura karşılaştırması' });
    expect(within(liste).getAllByRole('listitem')).toHaveLength(7);
    const kdv = within(liste).getByText('ORN-B-0087').closest('li') as HTMLElement;
    expect(within(kdv).getByText(/\+45,00/)).toBeTruthy();
    expect(within(kdv).getByText('KDV')).toBeTruthy();
    const yalniz = within(liste).getByText('ORN-A-0420').closest('li') as HTMLElement;
    expect(yalniz.querySelector('.tc-lu-h-fark')?.textContent).toBe('Fark (Logo − Finans): —');
    expect(istekler.every((i) => i.yontem === 'GET')).toBe(true);
    expect(screen.getByText(/Son okuma:/)).toBeTruthy();
  });

  it('satıra basınca altında ayrıntı açılır (aria-expanded); farklı satır metinle işaretlenir; ikinci basış kapatır', async () => {
    sunucuKur(OKUYAN);
    ciz();
    const liste = await screen.findByRole('list', { name: 'Fatura karşılaştırması' });
    const dugme = within(within(liste).getByText('ORN-B-0087').closest('li') as HTMLElement).getByRole('button');
    expect(dugme.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('region', { name: 'ORN-B-0087 ayrıntısı' })).toBeNull();
    fireEvent.click(dugme);
    expect(dugme.getAttribute('aria-expanded')).toBe('true');
    const alan = screen.getByRole('region', { name: 'ORN-B-0087 ayrıntısı' });
    expect(dugme.getAttribute('aria-controls')).toBe(alan.id);
    for (const ad of ['Net', 'KDV', 'Toplam', 'Para birimi', 'İptal']) expect(within(alan).getByRole('rowheader', { name: new RegExp(`^${ad}`) })).toBeTruthy();
    const kdvSatiri = within(alan).getByRole('rowheader', { name: /^KDV/ }).closest('tr') as HTMLElement;
    expect(within(kdvSatiri).getByText('farklı')).toBeTruthy();
    expect(within(kdvSatiri).getAllByText(/765,00 ₺|720,00 ₺|\+45,00/)).toHaveLength(3);
    expect(within(within(alan).getByRole('rowheader', { name: /^Net$/ }).closest('tr') as HTMLElement).queryByText('farklı')).toBeNull();
    expect(within(alan).getByText(/KDV, Toplam tutarı iki tarafta farklı girilmiş/)).toBeTruthy();
    expect(within(alan).getByText(/Salt okunur/)).toBeTruthy();
    fireEvent.click(dugme);
    expect(screen.queryByRole('region', { name: 'ORN-B-0087 ayrıntısı' })).toBeNull();
  });

  it('eksik taraf "Kayıt yok" yazar; para birimi farkında tutar farkı hesaplanmaz; cari kodu yok açıklaması Firma kartına yönlendirir', async () => {
    sunucuKur(OKUYAN);
    ciz();
    const liste = await screen.findByRole('list', { name: 'Fatura karşılaştırması' });
    fireEvent.click(within(within(liste).getByText('ORN-A-0420').closest('li') as HTMLElement).getByRole('button'));
    const logoda = screen.getByRole('region', { name: 'ORN-A-0420 ayrıntısı' });
    expect(within(logoda).getAllByText('Kayıt yok').length).toBeGreaterThanOrEqual(5);
    expect(within(logoda).getByText(/Faturayı finansa elle girmek gerekir; bu ekran yazmaz/)).toBeTruthy();
    fireEvent.click(within(within(liste).getByText('ORN-A-0398').closest('li') as HTMLElement).getByRole('button'));
    expect(within(screen.getByRole('region', { name: 'ORN-A-0398 ayrıntısı' })).getByText(/Logo TRY, finans EUR/)).toBeTruthy();
    fireEvent.click(within(within(liste).getByText('ORN-B-0089').closest('li') as HTMLElement).getByRole('button'));
    expect(within(screen.getByRole('region', { name: 'ORN-B-0089 ayrıntısı' })).getByText(/Firma kartına Logo cari kodunu yazın/)).toBeTruthy();
  });

  it('sayaç süzgeçtir: basınca durum sorguya girir ve basılı görünür; ikinci basış kaldırır; süzgeç temizlenir', async () => {
    const istekler = sunucuKur(OKUYAN);
    ciz();
    const grup = await screen.findByRole('group', SAYAC_GRUBU);
    const farkli = within(grup).getByRole('button', { name: /Farklı/ });
    expect(farkli.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(farkli);
    await waitFor(() => { expect(eslesmeIstekleri(istekler).some((q) => q.get('durum') === 'farkli' && q.get('sayfa') === '1')).toBe(true); });
    expect(within(grup).getByRole('button', { name: /Farklı/ }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Süzgeci temizle' }));
    expect(within(grup).getByRole('button', { name: /Farklı/ }).getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('button', { name: 'Süzgeci temizle' })).toBeNull();
  });

  it('arama bekleyerek, dönem ve tür seçimi hemen sunucuya gider; etiketli alanlar vardır', async () => {
    const istekler = sunucuKur(OKUYAN);
    ciz();
    await screen.findByRole('list', { name: 'Fatura karşılaştırması' });
    fireEvent.change(screen.getByLabelText('Dönem'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Fatura türü'), { target: { value: 'satis-iade' } });
    fireEvent.change(screen.getByLabelText(/Ara \(fatura no/), { target: { value: ' orn-a ' } });
    await waitFor(() => { expect(eslesmeIstekleri(istekler).some((q) => q.get('gun') === '30' && q.get('tur') === 'satis-iade' && q.get('ara') === 'orn-a')).toBe(true); });
    expect(eslesmeIstekleri(istekler).some((q) => q.get('ara') === 'orn-a ' || q.get('ara') === ' orn-a')).toBe(false);
  });

  it('bayat okuma uyarılır; okuma hiç yapılmadıysa "Henüz okunmadı" yazar', async () => {
    sunucuKur(OKUYAN, { ...CEVAP, okuma: { acik: true, sonOkuma: new Date(simdi - 3 * 86_400_000).toISOString() } });
    ciz();
    expect(await screen.findByText(/Liste eski olabilir/)).toBeTruthy();
    cleanup();
    sunucuKur(OKUYAN, { ...CEVAP, okuma: { acik: true, sonOkuma: null } });
    ciz();
    expect(await screen.findByText(/Son okuma: Henüz okunmadı/)).toBeTruthy();
    expect(screen.queryByText(/Liste eski olabilir/)).toBeNull();
  });

  it('okuma kapalı ve Logo tarafı boşsa liste yerine açıklama gelir (yalancı "yalnız finansta" farkı yok); Logo sayfası bağı yalnız yetkiliye', async () => {
    const kapali: FaturaEslesmeCevabi = {
      ...CEVAP, satirlar: [YALNIZ_FINANS], toplam: 1, baglanamayan: 0, okuma: { acik: false, sonOkuma: null },
      durumlar: SAYAC.map((d) => ({ ...d, sayi: d.durum === 'finansta-var-logoda-yok' ? 1 : 0 })),
    };
    sunucuKur(OKUYAN, kapali);
    ciz();
    expect(await screen.findByText('Logo okuması kapalı')).toBeTruthy();
    expect(screen.queryByRole('list', { name: 'Fatura karşılaştırması' })).toBeNull();
    expect(screen.queryByRole('link', { name: /Logo sayfasını aç/ })).toBeNull();
    expect(screen.getByText(/yöneticinize başvurun/)).toBeTruthy();
    cleanup();
    sunucuKur(YONETICI, kapali);
    ciz();
    expect(await screen.findByRole('link', { name: /Logo sayfasını aç/ })).toBeTruthy();
  });

  it('okuma sonradan kapatıldıysa mevcut kopya gösterilir ve uyarılır', async () => {
    sunucuKur(OKUYAN, { ...CEVAP, okuma: { acik: false, sonOkuma: new Date(simdi - 3_600_000).toISOString() } });
    ciz();
    expect(await screen.findByText(/Logo okuması şu an kapalı/)).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Fatura karşılaştırması' })).toBeTruthy();
  });

  it('boş durum: fatura yoksa dönem uzatılabilir; süzgeçle boşsa süzgeç temizlenir', async () => {
    const bos: FaturaEslesmeCevabi = { ...CEVAP, satirlar: [], toplam: 0, baglanamayan: 0, durumlar: SAYAC.map((d) => ({ ...d, sayi: 0 })) };
    const istekler = sunucuKur(OKUYAN, bos);
    ciz();
    expect(await screen.findByText('Karşılaştırılacak fatura yok')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Süreyi 365 güne çıkar' }));
    await waitFor(() => { expect(eslesmeIstekleri(istekler).some((q) => q.get('gun') === '365')).toBe(true); });
  });

  it('hata: başlık, neden ve yeniden dene gelir; yetki hatası ayrı söylenir; yüklenirken iskelet ve aria-busy vardır', async () => {
    let ilk = true;
    sunucuKur(OKUYAN, () => { if (ilk) { ilk = false; return json(503, { kod: 'GEÇİCİ', mesaj: 'Sunucu yanıt vermedi' }); } return CEVAP; });
    ciz();
    expect(screen.getByText('Karşılaştırma yükleniyor').closest('section')?.getAttribute('aria-busy')).toBe('true');
    expect(await screen.findByText('Karşılaştırma yüklenemedi')).toBeTruthy();
    expect(screen.getByText(/Sunucu yanıt vermedi/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Yeniden dene/ }));
    expect(await screen.findByRole('list', { name: 'Fatura karşılaştırması' })).toBeTruthy();
    cleanup();
    sunucuKur(OKUYAN, () => json(403, { kod: 'YETKI', mesaj: 'Yetkiniz yok' }));
    ciz();
    expect(await screen.findByText(/finans okuma yetkisi gerekir/)).toBeTruthy();
  });

  it('liste yenilenemezse eski veri durur ve uyarı şeridi yeniden dene sunar', async () => {
    let bozuk = false;
    sunucuKur(OKUYAN, () => (bozuk ? json(503, { kod: 'GEÇİCİ', mesaj: 'Sunucu yanıt vermedi' }) : CEVAP));
    const { istemci } = ciz();
    await screen.findByRole('list', { name: 'Fatura karşılaştırması' });
    bozuk = true;
    await istemci.refetchQueries({ queryKey: ['finans', 'logo-uyum'] });
    expect(await screen.findByText(/Liste yenilenemedi; son alınan veri gösteriliyor/)).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Fatura karşılaştırması' })).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /Yeniden dene/ }).length).toBeGreaterThan(0);
  });

  it('K1: süzgeç değişince istek hata alırsa liste ve süzgeçler yerinde kalır, uyarı şeridi çıkar; süzgeç geri alınabilir', async () => {
    const istekler = sunucuKur(OKUYAN, (yol) => (new URLSearchParams(yol.split('?')[1]).get('gun') === '30' ? json(500, { kod: 'SUNUCU', mesaj: 'ORN hata' }) : CEVAP));
    ciz();
    await screen.findByRole('list', { name: 'Fatura karşılaştırması' });
    fireEvent.change(screen.getByLabelText('Dönem'), { target: { value: '30' } });
    expect(await screen.findByText(/Liste yenilenemedi; son alınan veri gösteriliyor/)).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Fatura karşılaştırması' })).toBeTruthy();
    expect(screen.getByLabelText('Dönem')).toBeTruthy();
    expect(screen.getByLabelText(/Ara \(fatura no/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Dönem'), { target: { value: '90' } });
    await waitFor(() => { expect(screen.queryByText(/Liste yenilenemedi/)).toBeNull(); });
    expect(eslesmeIstekleri(istekler).some((q) => q.get('gun') === '30')).toBe(true);
  });

  it('kart: iptal hangi tarafta söylenir; bulunan tarafın toplamı yazılır; "son 90 gün" tekrar etmez', async () => {
    sunucuKur(OKUYAN);
    ciz();
    const liste = await screen.findByRole('list', { name: 'Fatura karşılaştırması' });
    const iptal = within(liste).getByText('ORN-A-0412').closest('li') as HTMLElement;
    expect(within(iptal).getByText("İptal: Logo'da")).toBeTruthy();
    expect(within((within(liste).getByText('ORN-A-0420').closest('li') as HTMLElement)).getByText(/^Logo: 26\.550,00 ₺$/)).toBeTruthy();
    expect(within((within(liste).getByText('ORN-A-0415').closest('li') as HTMLElement)).getByText(/^Finans: 9\.440,00 ₺$/)).toBeTruthy();
    expect(within((within(liste).getByText('ORN-A-0398').closest('li') as HTMLElement)).getByText(/^Logo: 1\.416,00 ₺ · Finans: 1\.416,00 €$/)).toBeTruthy();
    expect(screen.queryAllByText(/^son 90 gün$/)).toHaveLength(0);
    expect(screen.getAllByText(/Son 90 günde/)).toHaveLength(1);
  });

  it('Cari kodu yok sayacı seçilince açıklama gelir (ayrı uyarı şeridi yok)', async () => {
    const istekler = sunucuKur(OKUYAN);
    ciz();
    const grup = await screen.findByRole('group', SAYAC_GRUBU);
    expect(screen.queryByText(/karşılaştırılamaz/)).toBeNull();
    fireEvent.click(within(grup).getByRole('button', { name: /Cari kodu yok/ }));
    await waitFor(() => { expect(eslesmeIstekleri(istekler).some((q) => q.get('durum') === 'cari-kodu-yok')).toBe(true); });
    expect(await screen.findByText(/karşılaştırılamaz\. Firma kartına Logo cari kodunu yazın/)).toBeTruthy();
  });
});
