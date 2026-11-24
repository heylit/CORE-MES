import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { AcikTeslim, AparatCevabi, EmirAparatCevabi, TakimSatiri } from '#paylasilan/sozlesme/takimhane.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { AparatSayfasi, EmirAparatlari } from './Aparat.tsx';
import { CikisFormu, IadePenceresi } from './CikisIade.tsx';
import { pencereMetni, stokDurumu } from './gosterim.ts';
import { rotalar } from './rotalar.tsx';

const takim = (t: Partial<TakimSatiri> = {}): TakimSatiri => ({
  kartKimlik: 1, kod: 'ORN-TKM-1', ad: 'ORN Freze 12', kategori: 'Freze', sinif: 'freze', capMm: '12', kesiciSayisi: 4, isoKodu: null, malzemeGruplari: ['P'],
  yenidenBilenir: true, izleme: 'adet', rafKodu: 'ORN-R1', konumlar: { raf: 5, tezgah: null, kisi: null, bileme: null, ara: null }, toplam: 5, kritikSeviye: null, ...t,
});
const teslim: AcikTeslim = { konumKimligi: 9, kartKimlik: 1, kod: 'ORN-TKM-1', ad: 'ORN Freze 12', adet: 3, alan: 'ORN Operatör A', alanTuru: 'kisi', verildi: null };

function ac(icerik: ReactNode) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter>{icerik}</MemoryRouter></BildirimSaglayici></QueryClientProvider>);
}
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Takımhane', () => {
  it('rotalar sayfanın beş yolunu açar', () => {
    expect(rotalar.map((r) => r.yol)).toEqual(['/takimhane', '/takimhane/aparat', '/takimhane/emirler', '/takimhane/cikis-iade', '/takimhane/baslangic']);
  });

  it('sipariş noktası yoksa durum uydurulmaz: yalnız sıfır bilinir', () => {
    expect(stokDurumu(takim({ toplam: 0 }))).toBe('sifir');
    expect(stokDurumu(takim({ toplam: 5, kritikSeviye: null }))).toBe('esiksiz');
    expect(stokDurumu(takim({ toplam: 2, kritikSeviye: 3 }))).toBe('kritik');
  });

  it('çıkış düğmesi kapalıyken sebebi yazar: önce takım, sonra alan', () => {
    ac(<CikisFormu takimlar={[takim()]} son={[takim()]} alicilar={[{ deger: 'k:1', baslik: 'ORN Operatör A' }]} emirler={[]} gonder={vi.fn()} />);
    expect(screen.getByText('Takım seçin.')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Teslim et' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /ORN-TKM-1/ }));
    expect(screen.getByText('Alan seçin.')).toBeTruthy();
  });

  it('kırık iade nedensiz onaylanmaz; neden yazılınca gönderilir', () => {
    const onayla = vi.fn();
    ac(<IadePenceresi teslim={teslim} kapat={vi.fn()} onayla={onayla} ilkDurum="kirik" />);
    const dugme = screen.getByRole('button', { name: 'İade al' }) as HTMLButtonElement;
    expect(dugme.disabled).toBe(true);
    expect(screen.getByText('Kırılma nedenini yazın.')).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Kırılma nedeni/), { target: { value: 'Mandren çarpması' } });
    expect(dugme.disabled).toBe(false);
    fireEvent.click(dugme);
    expect(onayla).toHaveBeenCalledWith({ adet: 3, durum: 'kirik', neden: 'Mandren çarpması' });
  });

  describe('aparat (3651)', () => {
    const json = (govde: unknown) => new Response(JSON.stringify(govde), { status: 200, headers: { 'content-type': 'application/json' } });
    const konum = (raf: number | null) => ({ raf, tezgah: null, kisi: null, bileme: null, ara: null });

    it('plan yerleştirmemiş işte pencere yerine çizgi yazılır; saat aralığı gün ve saatle gelir', () => {
      expect(pencereMetni(null, null)).toBe('—');
      expect(pencereMetni('2026-11-26T08:00:00', '2026-11-26T14:00:00')).toBe('26.11 08:00 - 14:00');
    });

    it('emir aparatında eksik çipi adedi söyler, uyarı planı etkilemediğini yazar', async () => {
      const cevap: EmirAparatCevabi = {
        emirNo: 'ORN-EMIR-1', parca: 'ORN parça', hazir: false,
        satirlar: [
          { kartKimlik: 1, kod: 'ORN-APR-014', ad: 'ORN Mengene çene seti', adet: 2, asama: 'isleme', durum: 'ayrildi', eksik: 0, disarida: 0, konum: 'ORN-R2-04', baslangic: '2026-11-26T08:00:00', bitis: '2026-11-26T14:00:00', planKaydi: true },
          { kartKimlik: 2, kod: 'ORN-APR-044', ad: 'ORN Dişli mastar tutacağı', adet: 2, asama: 'isleme', durum: 'eksik', eksik: 1, disarida: 0, konum: null, baslangic: null, bitis: null, planKaydi: false },
        ],
        olcuAletleri: [{ turKimlik: 1, ad: 'ORN Mikrometre', gecerli: true }],
      };
      vi.stubGlobal('fetch', vi.fn(async () => json(cevap)));
      ac(<EmirAparatlari emirId="1" />);
      expect(await screen.findByText('1 aparat eksik')).toBeTruthy();
      expect(screen.getAllByText('Eksik: 1/2').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Ayrıldı').length).toBeGreaterThan(0);
      expect(screen.getByText(/yalnız uyarıdır, plan kapasitesini etkilemez/)).toBeTruthy();
      expect(screen.getAllByText('Plan ertelendi · 26.11').length).toBeGreaterThan(0);
      expect(screen.getByText('Kalibrasyonu geçerli alet var')).toBeTruthy();
    });

    it('emir için toplu çıkış: tezgâh seçilir, çıkabilen her aparat kalan adetle ve emre bağlı çıkar', async () => {
      const emir: EmirAparatCevabi = {
        emirNo: 'ORN-EMIR-1', parca: 'ORN parça', hazir: true, olcuAletleri: [],
        satirlar: [
          { kartKimlik: 1, kod: 'ORN-APR-014', ad: 'ORN Mengene çene seti', adet: 2, asama: 'isleme', durum: 'ayrildi', eksik: 0, disarida: 0, konum: 'ORN-R2-04', baslangic: null, bitis: null, planKaydi: false },
          { kartKimlik: 2, kod: 'ORN-APR-044', ad: 'ORN Mastar tutacağı', adet: 1, asama: 'isleme', durum: 'eksik', eksik: 1, disarida: 0, konum: null, baslangic: null, bitis: null, planKaydi: false },
        ],
      };
      const secenekler = { kisiler: [{ id: 5, ad: 'ORN Operatör A' }], istasyonlar: [{ id: 7, ad: 'ORN Tezgâh 1' }], emirler: [] };
      const gonderilen: unknown[] = [];
      vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === 'POST') { gonderilen.push(JSON.parse(String(init.body))); return json({}); }
        return json(String(url).includes('/secenekler') ? secenekler : emir);
      }));
      ac(<EmirAparatlari emirId="1" />);
      const dugme = (await screen.findByRole('button', { name: /Hepsini çıkar/ })) as HTMLButtonElement;
      expect(dugme.disabled).toBe(true);
      fireEvent.change(screen.getByLabelText('İstasyon'), { target: { value: '7' } });
      fireEvent.click(dugme);
      await waitFor(() => { expect(gonderilen).toHaveLength(1); });
      expect(gonderilen[0]).toMatchObject({ kartKimlik: 1, adet: 2, istasyonId: 7, kisiId: null, uretimEmriId: 1 });
    });

    it('"Kapasiteyi aç" Reçete ve Rota > Kaynaklar > İkincil kaynaklar sekmesini seçip o sayfayı açar', async () => {
      const cevap: AparatCevabi = {
        konumlar: { raf: 1, tezgah: null, kisi: null, bileme: null, ara: null }, bekleyenIade: 0, satirlar: [],
        karsilastirma: [{ kartKimlik: 1, kod: 'ORN-APR-021', ad: 'ORN Fikstür plakası', istasyonKimligi: 3, istasyon: 'ORN-IST-3', planKapasitesi: 2, kartPlanToplami: 2, stokta: 1, bakimda: 0, durum: 'plan-fazla' }],
      };
      vi.stubGlobal('fetch', vi.fn(async () => json(cevap)));
      window.localStorage.removeItem('tmi.recete-rota.yeni.kaynak-sekmesi');
      ac(<AparatSayfasi />);
      fireEvent.click(await screen.findByRole('tab', { name: /Plan ile karşılaştır/ }));
      fireEvent.click(screen.getAllByRole('button', { name: /Kapasiteyi aç/ })[0]!);
      expect(window.localStorage.getItem('tmi.recete-rota.yeni.kaynak-sekmesi')).toBe('ikincil');
      expect((await screen.findAllByText(/ORN-APR-021 · ORN-IST-3: kapasite İkincil kaynaklar sekmesinde/)).length).toBeGreaterThan(0);
    });

    it('aparat sayfası konum özetini ve karşılaştırma sekmesini gösterir; plan stoktan fazlaysa işaretler', async () => {
      const cevap: AparatCevabi = {
        konumlar: { raf: 4, tezgah: 2, kisi: 1, bileme: 1, ara: null }, bekleyenIade: 1,
        satirlar: [{ kartKimlik: 1, kod: 'ORN-APR-021', ad: 'ORN Fikstür plakası', konumlar: { ...konum(4), tezgah: 2, kisi: 1, bileme: 1 }, toplam: 8, ayrilan: 2, serbest: 2, bekleyenIade: 1, rafKodu: 'ORN-R2-04' }],
        karsilastirma: [{ kartKimlik: 1, kod: 'ORN-APR-021', ad: 'ORN Fikstür plakası', istasyonKimligi: null, istasyon: null, planKapasitesi: 9, kartPlanToplami: 9, stokta: 7, bakimda: 1, durum: 'plan-fazla' }],
      };
      vi.stubGlobal('fetch', vi.fn(async () => json(cevap)));
      ac(<AparatSayfasi />);
      expect((await screen.findAllByText('Bakımda')).length).toBeGreaterThan(0);
      expect(screen.getAllByText('ORN Fikstür plakası').length).toBeGreaterThan(0);
      fireEvent.click(screen.getByRole('tab', { name: /Plan ile karşılaştır/ }));
      expect(screen.getAllByText('Plan stoktan fazla (plan 9, stok 7)').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Ortak').length).toBeGreaterThan(0);
    });
  });
});
