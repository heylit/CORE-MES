import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type {
  BildirimAliciDegistirGovdesi, BildirimAlicilariCevabi, CagriYonlendirmeCevabi, CagriYonlendirmeDegistirGovdesi,
} from '#paylasilan/sozlesme/bildirim.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { BildirimYonetimi } from './BildirimYonetimi.tsx';

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

const BASLANGIC: CagriYonlendirmeCevabi = {
  satirlar: [
    { ekip: 'bakim', rolIdleri: [1, 2], surum: 1, degistiren: null, degistirildi: '2026-10-21T09:00:00Z' },
    { ekip: 'malzeme', rolIdleri: [3], surum: 4, degistiren: { id: 9, ad: 'Deneme Yönetici' }, degistirildi: '2026-10-21T09:00:00Z' },
    { ekip: 'ayarci', rolIdleri: [], surum: 1, degistiren: null, degistirildi: '2026-10-21T09:00:00Z' },
  ],
  roller: [{ id: 1, kod: 'bakim', ad: 'Bakım' }, { id: 2, kod: 'mudur', ad: 'Müdür' }, { id: 3, kod: 'depo', ad: 'Depo' }],
};

const ALICILAR: BildirimAlicilariCevabi = {
  satirlar: [
    {
      tur: 'istasyonlar.makine-durdu', baslik: 'Makine durdu', onem: 'acil', kaynakModul: 'istasyonlar', varsayilanIslemler: ['arkon.bakim'],
      rolIdleri: [], kisiIdleri: [], surum: null, degistiren: null, degistirildi: null,
    },
    {
      tur: 'satin-alma.talep-onay-bekliyor', baslik: 'Satın alma talebi onay bekliyor', onem: 'uyari', kaynakModul: 'satin-alma',
      varsayilanIslemler: ['satin-alma.onayla'], rolIdleri: [2], kisiIdleri: [7], surum: 3,
      degistiren: { id: 9, ad: 'Deneme Sorumlu' }, degistirildi: '2026-10-21T09:00:00Z',
    },
    {
      tur: 'stok.birakildi', baslik: 'Malzeme bırakıldı', onem: 'bilgi', kaynakModul: 'stok', varsayilanIslemler: [],
      rolIdleri: [], kisiIdleri: [], surum: null, degistiren: null, degistirildi: null,
    },
  ],
  roller: [{ id: 1, kod: 'bakim', ad: 'Bakım' }, { id: 2, kod: 'mudur', ad: 'Müdür' }],
  kisiler: [{ id: 7, ad: 'Deneme Kalite' }, { id: 8, ad: 'Deneme Planlama' }],
};

function sunucuKur(yazmaDurumu = 200) {
  const yazilanlar: { ekip: string; govde: CagriYonlendirmeDegistirGovdesi }[] = [];
  let saklanan = BASLANGIC;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: { body?: string } = {}) => {
    const yol = adres.replace('/api', '');
    if (yol === '/bildirimler/cagri-yonlendirme') return json(200, saklanan);
    if (yol === '/bildirimler/alicilar') return json(200, ALICILAR);
    const m = /^\/bildirimler\/cagri-yonlendirme\/([a-z]+)\/degistir$/.exec(yol);
    if (m?.[1]) {
      const govde = JSON.parse(secenek.body ?? '{}') as CagriYonlendirmeDegistirGovdesi;
      yazilanlar.push({ ekip: m[1], govde });
      if (yazmaDurumu !== 200) return json(yazmaDurumu, { kod: 'ESKI_SURUM', mesaj: 'Kayıt başkası tarafından değiştirildi.' });
      saklanan = {
        ...saklanan,
        satirlar: saklanan.satirlar.map((s) => (s.ekip === m[1] ? { ...s, rolIdleri: govde.rolIdleri, surum: s.surum + 1 } : s)),
      };
      return json(200, saklanan);
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return yazilanlar;
}

function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><BildirimYonetimi /></BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('bildirim yönetimi: ekip çağrıları', () => {
  it('her ekip seçili rolleriyle görünür; boş ekip "kimseye gitmiyor" der', async () => {
    sunucuKur();
    ac();
    const bakim = await screen.findByRole('group', { name: 'Bakım alıcı rolleri' });
    expect((within(bakim).getByRole('checkbox', { name: 'Bakım' }) as HTMLInputElement).checked).toBe(true);
    expect((within(bakim).getByRole('checkbox', { name: 'Depo' }) as HTMLInputElement).checked).toBe(false);
    expect(screen.getByText('Kimseye gitmiyor')).toBeTruthy();
    expect(screen.getByText(/Deneme Yönetici/)).toBeTruthy();
  });

  it('rol eklemek ekibin okunan sürümüyle yeni listeyi yazar', async () => {
    const yazilanlar = sunucuKur();
    ac();
    const malzeme = await screen.findByRole('group', { name: 'Malzeme alıcı rolleri' });
    fireEvent.click(within(malzeme).getByRole('checkbox', { name: 'Müdür' }));
    await waitFor(() => { expect(yazilanlar).toEqual([{ ekip: 'malzeme', govde: { rolIdleri: [3, 2], surum: 4 } }]); });
    expect(await screen.findByText('Çağrı alıcıları kaydedildi.')).toBeTruthy();
  });

  it('sunucu reddederse hata görünür ve seçim sunucudaki hâle döner', async () => {
    sunucuKur(409);
    ac();
    const bakim = await screen.findByRole('group', { name: 'Bakım alıcı rolleri' });
    fireEvent.click(within(bakim).getByRole('checkbox', { name: 'Müdür' }));
    expect(await screen.findByText('Kayıt başkası tarafından değiştirildi.')).toBeTruthy();
    expect((within(bakim).getByRole('checkbox', { name: 'Müdür' }) as HTMLInputElement).checked).toBe(true);
  });
});

function aliciSunucusuKur() {
  const yazilanlar: { tur: string; govde: BildirimAliciDegistirGovdesi }[] = [];
  let saklanan = ALICILAR;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek: { body?: string } = {}) => {
    const yol = adres.replace('/api', '');
    if (yol === '/bildirimler/cagri-yonlendirme') return json(200, BASLANGIC);
    if (yol === '/bildirimler/alicilar') return json(200, saklanan);
    const m = /^\/bildirimler\/alicilar\/([a-z.-]+)\/degistir$/.exec(yol);
    if (m?.[1]) {
      const govde = JSON.parse(secenek.body ?? '{}') as BildirimAliciDegistirGovdesi;
      yazilanlar.push({ tur: m[1], govde });
      const bos = govde.rolIdleri.length === 0 && govde.kisiIdleri.length === 0;
      saklanan = {
        ...saklanan,
        satirlar: saklanan.satirlar.map((s) => (s.tur === m[1]
          ? { ...s, rolIdleri: govde.rolIdleri, kisiIdleri: govde.kisiIdleri, surum: bos ? null : (s.surum ?? 0) + 1 }
          : s)),
      };
      return json(200, saklanan);
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return yazilanlar;
}

describe('bildirim yönetimi: bildirim alıcıları (760 c)', () => {
  it('seçimsiz tür varsayılanı, seçimli tür seçilenleri ve kişileri gösterir', async () => {
    aliciSunucusuKur();
    ac();
    expect(await screen.findByText(/Varsayılan: .* yetkisi olanlar/)).toBeTruthy();
    expect(screen.getByText('Varsayılan: yalnız kayda bağlı kişiler')).toBeTruthy();
    expect(screen.getByText(/Yalnız seçilenler: 1 rol, 1 kişi/)).toBeTruthy();
    const satin = screen.getByRole('group', { name: 'Satın alma talebi onay bekliyor alıcı rolleri' });
    expect((within(satin).getByRole('checkbox', { name: 'Müdür' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole('button', { name: 'Deneme Kalite çıkar' })).toBeTruthy();
  });

  it('seçimsiz türe rol eklemek sürümsüz ilk yazımdır', async () => {
    const yazilanlar = aliciSunucusuKur();
    ac();
    const makine = await screen.findByRole('group', { name: 'Makine durdu alıcı rolleri' });
    fireEvent.click(within(makine).getByRole('checkbox', { name: 'Bakım' }));
    await waitFor(() => {
      expect(yazilanlar).toEqual([{ tur: 'istasyonlar.makine-durdu', govde: { rolIdleri: [1], kisiIdleri: [], surum: null } }]);
    });
    expect(await screen.findByText('Bildirim alıcıları kaydedildi.')).toBeTruthy();
  });

  it('kişi eklemek ve çıkarmak okunan sürümle yazar; seçimi kaldırmak iki listeyi boşaltır', async () => {
    const yazilanlar = aliciSunucusuKur();
    ac();
    const ekle = (await screen.findAllByRole('combobox', { name: 'Kişi ekle' }))[1];
    if (!ekle) throw new Error('kişi seçimi yok');
    fireEvent.change(ekle, { target: { value: '8' } });
    await waitFor(() => { expect(yazilanlar[0]).toEqual({ tur: 'satin-alma.talep-onay-bekliyor', govde: { rolIdleri: [2], kisiIdleri: [7, 8], surum: 3 } }); });
    fireEvent.click(await screen.findByRole('button', { name: 'Deneme Kalite çıkar' }));
    await waitFor(() => { expect(yazilanlar[1]).toEqual({ tur: 'satin-alma.talep-onay-bekliyor', govde: { rolIdleri: [2], kisiIdleri: [8], surum: 4 } }); });
    fireEvent.click(await screen.findByRole('button', { name: 'Seçimi kaldır' }));
    await waitFor(() => { expect(yazilanlar[2]).toEqual({ tur: 'satin-alma.talep-onay-bekliyor', govde: { rolIdleri: [], kisiIdleri: [], surum: 5 } }); });
  });
});
