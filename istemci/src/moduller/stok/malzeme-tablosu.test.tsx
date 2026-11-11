import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { MalzemelerCevabi, MalzemeStokSatiri, TurListesiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { DEPOCU, OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

// 2905: Malzemeler tam tablo: her malzeme tek satır, sütunlar yana kayar; sütun seçimi, sıralama ve sekmeler arası arama.
const SATIR: MalzemeStokSatiri = {
  malzemeId: 901, ad: 'Deneme sac', stokKodu: 'HM-001', tur: 'hammadde', birim: 'kg', toplam: '12', serbest: '7', statude: '3', rezerve: '1', kritikSeviye: '5',
  durum: 'yeterli', konumSayisi: 1, konumlar: [{ kod: 'A-01-02', katNo: 2, miktar: '12' }],
  kategoriAdi: 'Deneme kategori', kartDurumu: 'onayda', varsayilanKonum: 'A-01-01', sonHareket: '2026-11-10T09:30:00+03:00',
};
const PANEL = { malzemeCesidi: 1, kritik: 0, eksi: 0, kabulde: 0 };
const cevap = (satirlar: MalzemeStokSatiri[]): MalzemelerCevabi => ({ satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 50 });
const hucre = (baslik: string) => document.querySelector(`td[data-baslik="${baslik}"]`);

beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Malzeme tablosu (2905)', () => {
  it('kayan tablo: Malzeme solda, işlemler sağda sabit; yeni dört alan kendi sütununda', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/malzemeler': () => json(200, cevap([SATIR])), 'GET /stok/panel': () => json(200, PANEL) });
    ac('/stok/malzemeler');
    const tablo = await screen.findByRole('table', { name: 'Malzeme stokları' });
    expect(tablo.closest('.tc-tablo-kap')?.hasAttribute('data-kaydir')).toBe(true);
    expect(tablo.closest('.tc-tablo-kap')?.getAttribute('data-kip')).toBeNull();
    expect(within(tablo).getByRole('columnheader', { name: /Malzeme/ }).classList.contains('tc-tablo-sabit-sol')).toBe(true);
    expect(within(tablo).getByRole('columnheader', { name: 'İşlemler' }).classList.contains('tc-tablo-sabit-sag')).toBe(true);
    expect(hucre('Kategori')?.textContent).toBe('Deneme kategori');
    expect(hucre('Kart durumu')?.textContent).toBe('Onayda');
    expect(hucre('Varsayılan konum')?.textContent).toBe('A-01-01');
    expect(hucre('Son hareket')?.textContent).not.toBe('—Girilmemiş');
    expect(hucre('Kabul / karantina')?.textContent).toBe('2');
  });

  it('boş alan sıfır ya da uydurma değer değil "yok" yazar', async () => {
    sunucuKur(OKUYUCU, {
      'GET /stok/malzemeler': () => json(200, cevap([{ ...SATIR, kategoriAdi: null, kartDurumu: null, varsayilanKonum: null, sonHareket: null, kritikSeviye: null }])),
      'GET /stok/panel': () => json(200, PANEL),
    });
    ac('/stok/malzemeler');
    await screen.findByText('Deneme sac');
    for (const b of ['Kategori', 'Kart durumu', 'Varsayılan konum', 'Son hareket', 'Kritik seviye']) expect(hucre(b)?.textContent).toBe('—Girilmemiş');
  });

  it('gizlenen sütun tablodan kalkar ve seçim yeniden açılışta korunur; Malzeme gizlenemez', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/malzemeler': () => json(200, cevap([SATIR])), 'GET /stok/panel': () => json(200, PANEL) });
    ac('/stok/malzemeler');
    await screen.findByText('Deneme sac');
    fireEvent.click(screen.getByRole('button', { name: 'Sütunlar' }));
    const pencere = await screen.findByRole('dialog', { name: 'Görünen sütunlar' });
    expect(within(pencere).queryByLabelText('Malzeme')).toBeNull();
    fireEvent.click(within(pencere).getByLabelText('Kategori'));
    await waitFor(() => expect(hucre('Kategori')).toBeNull());
    cleanup();
    sunucuKur(OKUYUCU, { 'GET /stok/malzemeler': () => json(200, cevap([SATIR])), 'GET /stok/panel': () => json(200, PANEL) });
    ac('/stok/malzemeler');
    await screen.findByText('Deneme sac');
    expect(hucre('Kategori')).toBeNull();
    expect(hucre('Stok kodu')?.textContent).toBe('HM-001');
  });

  it('son harekete göre sıralama sunucuya sorulur', async () => {
    const istekler = sunucuKur(OKUYUCU, { 'GET /stok/malzemeler': () => json(200, cevap([SATIR])), 'GET /stok/panel': () => json(200, PANEL) });
    ac('/stok/malzemeler');
    const tablo = await screen.findByRole('table', { name: 'Malzeme stokları' });
    fireEvent.click(within(tablo).getByRole('button', { name: /Son hareket/ }));
    await waitFor(() => expect(istekler.some((i) => i.yol.includes('sirala=son'))).toBe(true));
  });

  it('satırdan hareketlere gidilir; satır seçimi tetiklenmez', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/malzemeler': () => json(200, cevap([SATIR])), 'GET /stok/panel': () => json(200, PANEL) });
    ac('/stok/malzemeler');
    await screen.findByText('Deneme sac');
    fireEvent.click(screen.getByRole('button', { name: 'Deneme sac: diğer işlemler' }));
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Hareketler' }));
    expect(await screen.findByRole('heading', { name: 'Hareketler' })).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Malzeme stokları' })).toBeNull();
  });

  it('tür sekmesine geçince arama metni taşınır ve tür listesini süzer', async () => {
    const kimyasal: TurListesiCevabi = {
      bugun: '2026-11-04',
      satirlar: [
        { ...SATIR, malzemeId: 1, ad: 'Deneme yağ', alanlar: {}, sktTakipli: false, enYakinSkt: null, sktGecmisMiktar: '0' },
        { ...SATIR, malzemeId: 2, ad: 'Deneme gres', alanlar: {}, sktTakipli: false, enYakinSkt: null, sktGecmisMiktar: '0' },
      ],
    };
    sunucuKur(DEPOCU, {
      'GET /stok/malzemeler': () => json(200, cevap([SATIR])), 'GET /stok/panel': () => json(200, PANEL),
      'GET /stok/tur-listeleri/kimyasal': () => json(200, kimyasal),
    });
    ac('/stok/malzemeler?metin=yağ');
    await screen.findByRole('table', { name: 'Malzeme stokları' });
    fireEvent.click(within(screen.getByRole('tablist', { name: 'Malzeme türü' })).getByRole('tab', { name: 'Kimyasallar' }));
    const tablo = await screen.findByRole('table', { name: 'Kimyasallar' });
    expect((screen.getByRole('searchbox', { name: 'Ara' }) as HTMLInputElement).value).toBe('yağ');
    expect(within(tablo).getByText('Deneme yağ')).toBeTruthy();
    expect(within(tablo).queryByText('Deneme gres')).toBeNull();
  });
});

// Arayüz ön bakışı (2905 v2): sağda sabit işlemler sütunu dar kalsın diye düğmeler yalnız simgedir; adları erişilebilir adda.
describe('Malzeme tablosu işlem sütunu', () => {
  it('işlem düğmelerinde görünen metin yok; erişilebilir ad ve ipucu var', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/malzemeler': () => json(200, cevap([SATIR])), 'GET /stok/panel': () => json(200, PANEL) });
    ac('/stok/malzemeler');
    await screen.findByText('Deneme sac');
    const hucre = document.querySelector('td.tc-tablo-sabit-sag')!;
    expect(hucre.textContent).toBe('');
    // Sık iş (taşı) görünür; çıkış, sepete ekleme ve hareketler "diğer işlemler" menüsündedir (3026 a).
    for (const ad of ['Taşı: Deneme sac', 'Deneme sac: diğer işlemler']) {
      const d = within(hucre as HTMLElement).getByRole('button', { name: ad });
      expect(d.getAttribute('title')).toBeTruthy();
    }
  });

  it('QR düğmesi Etiket Merkezi\'ne bağlantıdır ve satır adını erişilebilir adında taşır', async () => {
    sunucuKur({ ...DEPOCU, islemler: [...DEPOCU.islemler, 'sayfa.etiket-merkezi'] }, { 'GET /stok/malzemeler': () => json(200, cevap([SATIR])), 'GET /stok/panel': () => json(200, PANEL) });
    ac('/stok/malzemeler');
    await screen.findByText('Deneme sac');
    const hucre = document.querySelector('td.tc-tablo-sabit-sag') as HTMLElement;
    expect(hucre.textContent).toBe('');
    expect(within(hucre).getByRole('button', { name: 'QR etiketi: Deneme sac' })).toBeTruthy();
    expect(within(hucre).getByRole('link', { name: 'QR etiketi: Deneme sac' }).getAttribute('href')).toContain('901');
  });
});

// 3026 a: depocunun ilk baktığı miktar adın hemen yanında; kod, tür ve kategori sağda. İşlemler sabit sütunu en sonda.
describe('Stok listelerinde miktar önce (3026)', () => {
  it('Malzemeler: Serbest, Toplam, Birim, Durum ve Konumlar adın yanında; Stok kodu, Tür, Kategori sonra', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/malzemeler': () => json(200, cevap([SATIR])), 'GET /stok/panel': () => json(200, PANEL) });
    ac('/stok/malzemeler');
    const tablo = await screen.findByRole('table', { name: 'Malzeme stokları' });
    const basliklar = within(tablo).getAllByRole('columnheader').map((h) => h.textContent?.trim() ?? '');
    const sira = (ad: string) => basliklar.findIndex((b) => b.startsWith(ad));
    const m = sira('Malzeme');
    expect(['Serbest', 'Toplam', 'Birim', 'Durum', 'Konumlar', 'Stok kodu', 'Tür', 'Kategori'].map(sira)).toEqual([m + 1, m + 2, m + 3, m + 4, m + 5, m + 6, m + 7, m + 8]);
    expect(basliklar.at(-1)).toBe('İşlemler');
  });

  it('alt şerit menüdeki adları taşır; dar ekranda "İstekler" görünür, erişilebilir ad tam kalır', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/malzemeler': () => json(200, cevap([SATIR])), 'GET /stok/panel': () => json(200, PANEL) });
    ac('/stok/malzemeler');
    const serit = await screen.findByRole('navigation', { name: 'Depocu kısayolları' });
    await waitFor(() => expect(within(serit).getAllByRole('button').map((d) => d.textContent?.trim())).toEqual(['Okut', 'Transfer', 'Malzeme istekleri']));
    cleanup();
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('767'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
    sunucuKur(DEPOCU, { 'GET /stok/malzemeler': () => json(200, cevap([SATIR])), 'GET /stok/panel': () => json(200, PANEL) });
    ac('/stok/malzemeler');
    const dar = await screen.findByRole('navigation', { name: 'Depocu kısayolları' });
    const istek = await within(dar).findByRole('button', { name: 'Malzeme istekleri' });
    expect(istek.textContent?.trim()).toBe('İstekler');
    expect(within(dar).queryByText('Taşı')).toBeNull();
    expect(within(dar).queryByText('Hazırlık')).toBeNull();
  });
});
