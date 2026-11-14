import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { AMORTISMAN_HARIC, GenelGiderOrani, satirlariHazirla } from './GenelGiderOrani.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });
// Tutarlar uydurmadır.
const satir = (id: number, gun: string, gider: string, saat: string, saatBasi: string, amortismanDahil = true, aciklama: string | null = null) =>
  ({ id, gecerlilikBaslangic: gun, aylikGenelGider: gider, aylikMakineSaati: saat, saatBasi, amortismanDahil, aciklama, olusturma: '2026-01-01T08:00:00.000Z',
    kaynak: 'elle' as const, gizli: false, donemBaslangic: null, donemBitis: null, kira: null, amortisman: null, dolayliPersonel: null, emilmeyenDogrudan: null, diger: null, projesizSatinAlma: null, elleEk: null, eksik: null });
// 2594 b önerisi: varsayılan olarak sunucu öneri vermez (eski elle akış testleri öneri görmeden koşar).
const ONERI = {
  ay: '2026-10', donemBaslangic: '2026-10-01', donemBitis: '2026-10-31',
  bilesenler: { kira: 10000, amortisman: 1000, dolayliPersonel: null, emilmeyenDogrudan: -250, diger: 6400, projesizSatinAlma: 80 }, toplam: null,
  ayrinti: { digerBelgeler: 5900, stokCikisi: 300 },
  disarida: [{ neden: 'kategori', kategori: 'faiz', tutar: 600, adet: 1 }, { neden: 'eski_belge', kategori: null, tutar: 900, adet: 1 }],
  eksik: ['dolaylı personel (İK)'], oraniBilinmeyen: ['A-7'], uyarilar: ['emirsiz stok çıkışı: fiyatı bilinmeyen 1 çıkış'], enAz: ['diger'], gizli: false,
  baskinBelgeler: [{ bilesen: 'kira', belge: 'K-1', tutar: 10000 }],
};
const SATIRLAR = [
  satir(1, '2026-01-01', '300000.00', '720.00', '416.6667'),
  satir(2, '2026-01-01', '360000.00', '720.00', '500.0000', false, 'Düzeltme'),
  satir(3, '2099-01-01', '400000.00', '800.00', '500.0000'),
];

function sunucuKur(islemler: string[], satirlar: unknown[] = SATIRLAR, oneri: unknown = null) {
  const istekler: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    istekler.push({ yontem: secenek?.method ?? 'GET', yol, govde: secenek?.body ? JSON.parse(String(secenek.body)) : undefined });
    if (yol === '/oturum') return json(200, { kullanici: { id: 9, ad: 'Deneme', islemler } });
    if (yol.startsWith('/finans/genel-gider-oranlari?')) return json(200, { satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 500 });
    if (yol === '/finans/genel-gider-oranlari/ekle') return json(200, { id: 4 });
    if (yol.startsWith('/finans/genel-gider-oranlari/oneri?')) return oneri === null ? json(404, { kod: 'BULUNAMADI', mesaj: 'Öneri yok.' }) : json(200, oneri);
    if (yol === '/finans/genel-gider-oranlari/belgeden-ekle') return json(200, { id: 5 });
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return istekler;
}
function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><GenelGiderOrani /></BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Genel gider oranı (206 a)', () => {
  it('satirlariHazirla: aynı güne sonraki giriş öncekini düzeltir; bugüne kadar başlamış son satır geçerlidir; yeniden eskiye', () => {
    const g = satirlariHazirla(SATIRLAR, '2026-10-19');
    expect(g.map((s) => [s.id, s.durum, s.duzeltme])).toEqual([[3, 'ileri', false], [2, 'gecerli', true], [1, 'duzeltildi', false]]);
    expect(satirlariHazirla(SATIRLAR, '2025-12-31').map((s) => s.durum)).toEqual(['ileri', 'ileri', 'duzeltildi']);
  });

  it('finans.maliyet-oku listeyi görür, giriş formu yoktur; boş açıklama "—"', async () => {
    const istekler = sunucuKur(['finans.maliyet-oku']);
    ac();
    const tablo = await screen.findByRole('table', { name: 'Genel gider oranları' });
    expect(within(tablo).getByText('416,6667 TL')).toBeTruthy();
    expect(within(tablo).getAllByText('—').length).toBeGreaterThan(0);
    expect(within(tablo).getByText('Geçerli')).toBeTruthy();
    expect(within(tablo).getByText('Düzeltildi')).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Genel gider oranı gir' })).toBeNull();
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('finans.oran-yaz oranı kaydeder; amortisman seçimi gövdeye boolean gider; "Dahil değil" hesaba girmediğini yazar (E-9)', async () => {
    const istekler = sunucuKur(['finans.maliyet-oku', 'finans.oran-yaz'], []);
    ac();
    await screen.findByText(/Henüz genel gider oranı girilmedi/);
    const form = within(screen.getByRole('form', { name: 'Genel gider oranı gir' }));
    fireEvent.change(form.getByLabelText(/Geçerlilik başlangıcı/), { target: { value: '2026-11-01' } });
    fireEvent.change(form.getByLabelText(/Aylık genel gider/), { target: { value: '250000,50' } });
    fireEvent.change(form.getByLabelText(/Aylık makine saati/), { target: { value: '600' } });
    expect(screen.queryByRole('note')).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Amortisman/), { target: { value: 'haric' } });
    expect(screen.getByRole('note').textContent).toBe(AMORTISMAN_HARIC);
    fireEvent.change(screen.getByLabelText(/^Amortisman/), { target: { value: 'dahil' } });
    expect(screen.queryByRole('note')).toBeNull();
    fireEvent.submit(screen.getByRole('form', { name: 'Genel gider oranı gir' }));
    await vi.waitFor(() => expect(istekler.some((i) => i.yol === '/finans/genel-gider-oranlari/ekle')).toBe(true));
    expect(istekler.find((i) => i.yol === '/finans/genel-gider-oranlari/ekle')?.govde).toEqual({
      gecerlilikBaslangic: '2026-11-01', aylikGenelGider: 250000.5, aylikMakineSaati: 600, amortismanDahil: true, aciklama: '',
    });
  });

  it('2594 b: belgelerden öneri bileşenleri, bilinmeyen bileşen, eksik, oranı bilinmeyen, eşlenmemiş, baskın belge ve dışarıda kalanlar; toplam bilinmiyorsa kayıt kapalı', async () => {
    const istekler = sunucuKur(['finans.maliyet-oku', 'finans.oran-yaz'], [], ONERI);
    ac();
    const tablo = await screen.findByRole('table', { name: 'Genel gider bileşenleri' });
    expect(within(tablo).getByText('10.000,00 TL')).toBeTruthy();
    expect(within(tablo).getByText('Bilinmiyor')).toBeTruthy();
    expect(within(tablo).getByText('Fazla emilim')).toBeTruthy();
    expect(within(tablo).getByText('En az')).toBeTruthy();
    expect(screen.getByText(/Aylık toplam: Bilinmiyor/)).toBeTruthy();
    const notlar = screen.getAllByRole('note').map((n) => n.textContent ?? '');
    expect(notlar.some((n) => n.includes('dolaylı personel (İK)'))).toBe(true);
    expect(notlar.some((n) => n.includes('A-7'))).toBe(true);
    expect(notlar.some((n) => n.includes('fiyatı bilinmeyen 1 çıkış') && n.includes('toplama girmez'))).toBe(true);
    expect(screen.getByText(/genel gider payı Satın Alma'dan gelir/)).toBeTruthy();
    expect(notlar.some((n) => n.includes('K-1') && n.includes('Peşin'))).toBe(true);
    const disarida = screen.getByRole('table', { name: 'Dışarıda kalanlar' });
    expect(within(disarida).getByText('Genel gidere girmeyen tür: faiz')).toBeTruthy();
    expect(within(disarida).getByText('Eski satın alma faturası (dahil edilmez)')).toBeTruthy();
    const kayit = screen.getByRole('form', { name: 'Belgelerden genel gider oranı kaydet' });
    expect((within(kayit).getByRole('button', { name: /Belgelerden kaydet/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('2594 b: bileşenler biliniyorsa belgelerden kayıt yalnız ay, saat, elle ek ve açıklama gönderir', async () => {
    const istekler = sunucuKur(['finans.maliyet-oku', 'finans.oran-yaz'], [], { ...ONERI, bilesenler: { ...ONERI.bilesenler, dolayliPersonel: 5000 }, toplam: 22480, eksik: [] });
    ac();
    const kayit = within(await screen.findByRole('form', { name: 'Belgelerden genel gider oranı kaydet' }));
    fireEvent.change(kayit.getByLabelText(/Geçerlilik başlangıcı/), { target: { value: '2026-11-01' } });
    fireEvent.change(kayit.getByLabelText(/Aylık makine saati/), { target: { value: '400' } });
    fireEvent.change(kayit.getByLabelText(/Elle ek/), { target: { value: '20' } });
    fireEvent.change(kayit.getByLabelText(/Açıklama/), { target: { value: 'Belgesiz kalem' } });
    fireEvent.submit(screen.getByRole('form', { name: 'Belgelerden genel gider oranı kaydet' }));
    await vi.waitFor(() => expect(istekler.some((i) => i.yol === '/finans/genel-gider-oranlari/belgeden-ekle')).toBe(true));
    expect(istekler.find((i) => i.yol === '/finans/genel-gider-oranlari/belgeden-ekle')?.govde).toEqual({
      gecerlilikBaslangic: '2026-11-01', ay: '2026-10',
      aylikMakineSaati: 400, elleEk: 20, aciklama: 'Belgesiz kalem',
    });
  });

  it('2652 a: dolaylı personel gizliyse bileşen ve toplam "Gizli"; kayıt açık; listede gizli satırın tutarı ve saat başı "Gizli"', async () => {
    const gizliSatir = { ...satir(7, '2026-11-01', '0', '400.00', '0'), aylikGenelGider: null, saatBasi: null, gizli: true, kaynak: 'belge' as const };
    sunucuKur(['finans.maliyet-oku', 'finans.oran-yaz'], [gizliSatir], { ...ONERI, bilesenler: { ...ONERI.bilesenler, dolayliPersonel: null, emilmeyenDogrudan: null }, toplam: null, eksik: [], gizli: true });
    ac();
    const tablo = await screen.findByRole('table', { name: 'Genel gider bileşenleri' });
    expect(within(tablo).getAllByText('Gizli').length).toBe(2);
    expect(screen.getByText(/Aylık toplam: Gizli/)).toBeTruthy();
    const kayit = screen.getByRole('form', { name: 'Belgelerden genel gider oranı kaydet' });
    expect((within(kayit).getByRole('button', { name: /Belgelerden kaydet/ }) as HTMLButtonElement).disabled).toBe(false);
    const liste = await screen.findByRole('table', { name: 'Genel gider oranları' });
    expect(within(liste).getAllByText('Gizli').length).toBe(2);
  });

  it('finans.maliyet-oku yoksa liste istenmez, yetki iletisi görünür', async () => {
    const istekler = sunucuKur(['finans.oku', 'finans.yaz']);
    ac();
    await screen.findByText('Genel gider oranını görme yetkiniz yok.');
    expect(istekler.some((i) => i.yol.startsWith('/finans/genel-gider-oranlari'))).toBe(false);
  });
});
