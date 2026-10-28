import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import type { BelgeCevabi } from '#paylasilan/sozlesme/portal.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { firmaKisileri, firmaSecenekleri, formDegerleri, kurallariDenetle, PortalAyarlari, sayiOku } from './PortalAyarlari.tsx';
import { ayarEkranlari } from './ayar-ekranlari.tsx';

// Kişi adı uydurmadır.
const YONETICI: Kullanici = { id: 5, ad: 'Deneme Yönetici', islemler: ['sayfa.portal', 'portal.oku', 'portal.yaz', 'portal.yonet'] };
const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucuKur(belge: BelgeCevabi['belge'], yazmaDurumu = 200): { yazilan: unknown[] } {
  const yazilan: unknown[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    if (yol === '/oturum') return json(200, { kullanici: YONETICI } satisfies OturumCevabi);
    // Çakışmadan sonra okunan belge başkasının yazdığı yeni sürümdür.
    const guncel = yazilan.length > 0 && yazmaDurumu !== 200 && belge !== null ? { ...belge, surum: belge.surum + 1, veri: { ...belge.veri, rules: { poMgr: 260000 } } } : belge;
    if (yol.startsWith('/portal/belge?')) return json(200, { belge: guncel, damga: 1 } satisfies BelgeCevabi);
    if (yol === '/portal/belge/yaz') { yazilan.push(JSON.parse(String(secenek?.body)));
      return yazmaDurumu === 200 ? json(200, { belge, damga: 2 } satisfies BelgeCevabi) : json(yazmaDurumu, { kod: 'CAKISMA', mesaj: 'Kayıt siz açtıktan sonra değişti.' });
    }
    return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  return { yazilan };
}

function ac() {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><PortalAyarlari /></BildirimSaglayici></QueryClientProvider>);
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('PortalAyarlari', () => {
  it('Sistem Ayarlarında portal kurulumu işlemiyle bölüm olarak görünür', () => {
    expect(ayarEkranlari.map((e) => [e.anahtar, e.islem])).toEqual([['portal', 'portal.yonet']]);
  });

  it('eksik kural prototipin varsayılanıyla dolar; limit ve süre sırası denetlenir', () => {
    const d = formDegerleri({ rules: { poMgr: 100 } });
    expect([d['poMgr'], d['poGM'], d['payFin'], d['remindH']]).toEqual(['100', '', '150000', '24']);
    expect(kurallariDenetle({ ...d, escalateH: '10' })).toEqual({
      hatalar: { escalateH: 'Eskalasyon süresi hatırlatma süresinden uzun olmalı.' },
    });
    expect(kurallariDenetle({ ...d, dueDays: '1,5' })).toEqual({ hatalar: { dueDays: 'Sıfır ya da pozitif bir tam sayı girin.' } });
    const tamam = kurallariDenetle({ ...d, priceTol: '1,5' });
    expect('rules' in tamam && tamam.rules['priceTol']).toBe(1.5);
  });

  it('kuralları sürüm beklentisiyle birleştirerek yazar ve geçmişe kişinin satırını ekler', async () => {
    const { yazilan } = sunucuKur({ yol: 'settings/main', kimlik: 'main', surum: 7, veri: { rules: { poMgr: 50000, poGM: 250000 }, history: [{ at: 'x', by: 'firm', text: 'eski' }] } });
    ac();
    const limit = await screen.findByLabelText('Satın alma siparişi: müdür onayı üstü (TL)') as HTMLInputElement;
    expect([limit.value, limit.readOnly]).toEqual(['50000', true]);
    const alan = await screen.findByLabelText('Tedarikçi ödemesi: finans müdürü onayı üstü (TL)');
    fireEvent.change(alan, { target: { value: '300000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kuralları kaydet' }));
    await waitFor(() => { expect(yazilan).toHaveLength(1); });
    const govde = yazilan[0] as { yol: string; kip: string; beklenenSurum: number; veri: { rules: Record<string, number>; history: { u?: string }[] } };
    expect([govde.yol, govde.kip, govde.beklenenSurum, govde.veri.rules['payFin']]).toEqual(['settings/main', 'birlestir', 7, 300000]);
    expect(Object.keys(govde.veri.rules)).not.toContain('poMgr');
    expect(Object.keys(govde.veri.rules)).not.toContain('poGM');
    expect(govde.veri.history.map((h) => h.u ?? null)).toEqual([null, 'tmi-5']);
  });

  it('portal kurulmamışsa yazma formu yerine kurulum iletisi çıkar', async () => {
    sunucuKur(null);
    ac();
    expect(await screen.findByText(/Portal henüz kurulmadı/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kuralları kaydet' })).toBeNull();
  });

  it('Türkçe binlik ayırıcı ve virgüllü ondalık doğru okunur (denetim bulgusu: "250.000" 250 okunuyordu)', () => {
    expect([sayiOku('250.000'), sayiOku('1.000.000'), sayiOku('1.234,5'), sayiOku('1,5'), sayiOku('1.5'), sayiOku(' 250 000 ')]).toEqual([250000, 1000000, 1234.5, 1.5, 1.5, 250000]);
    expect([sayiOku(''), sayiOku('12.34.5'), sayiOku('1,2,3'), sayiOku('-5'), sayiOku('abc')].every(Number.isNaN)).toBe(true);
    const d = formDegerleri({});
    const sonuc = kurallariDenetle({ ...d, payFin: '250.000', contractGM: '1.000.000' });
    expect('rules' in sonuc && [sonuc.rules['payFin'], sonuc.rules['contractGM']]).toEqual([250000, 1000000]);
  });

  it('kayıtlı ondalık formdan geçip aynı değerle geri yazılır (denetim bulgusu: "0.125" 125 okunuyordu)', () => {
    const d = formDegerleri({ rules: { priceTol: 0.125, discMgr: 2.5, payFin: 250000 } });
    expect([d['priceTol'], d['discMgr'], d['payFin']]).toEqual(['0,125', '2,5', '250000']);
    const sonuc = kurallariDenetle(d);
    expect('rules' in sonuc && [sonuc.rules['priceTol'], sonuc.rules['discMgr'], sonuc.rules['payFin']]).toEqual([0.125, 2.5, 250000]);
  });

  it('çakışmada girilen değer formda kalır', async () => {
    const { yazilan } = sunucuKur({ yol: 'settings/main', kimlik: 'main', surum: 7, veri: { rules: { poMgr: 50000 } } }, 409);
    ac();
    const alan = await screen.findByLabelText('Tedarikçi ödemesi: finans müdürü onayı üstü (TL)');
    fireEvent.change(alan, { target: { value: '300.000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kuralları kaydet' }));
    await waitFor(() => { expect(yazilan).toHaveLength(1); });
    await screen.findByText(/değişti/);
    await waitFor(() => { expect(vi.mocked(fetch).mock.calls.filter(([a]) => String(a).includes('/portal/belge?'))).toHaveLength(2); });
    expect((screen.getByLabelText('Tedarikçi ödemesi: finans müdürü onayı üstü (TL)') as HTMLInputElement).value).toBe('300.000');
  });

});

// Firma ve kişi adları uydurmadır.
describe('PortalAyarlari firma kişileri (1021 b)', () => {
  const b = (yol: string, veri: Record<string, unknown>) => ({ yol, kimlik: yol.split('/')[1] ?? '', veri, surum: 1 });
  const FIRMALAR = [b('parties/p2', { type: 'supplier', name: 'Beta' }), b('parties/p1', { type: 'customer', name: 'Alfa' }), b('parties/p3', { type: 'bank', name: 'Banka' })];
  const KULLANICILAR = [b('users/tmi-7', { partyId: 'p1', name: 'x' }), b('users/tmi-8', { partyId: 'firm' }), b('users/tmi-9', { partyId: 'p9' }), b('users/u1', { partyId: 'p1' })];
  const KISILER = [{ id: 5, ad: 'Deneme Yönetici' }, { id: 7, ad: 'Deneme Yedi' }, { id: 8, ad: 'Deneme Sekiz' }, { id: 9, ad: 'Deneme Dokuz' }];

  it('yalnız müşteri ve tedarikçi firması seçilir; atama yalnız TMI kullanıcısında ve firm dışında; silinmiş firma da listelenir', () => {
    const f = firmaSecenekleri(FIRMALAR);
    expect(f.map((x) => [x.kimlik, x.tur])).toEqual([['p1', 'Müşteri'], ['p2', 'Tedarikçi']]);
    expect(firmaKisileri(KULLANICILAR, f, KISILER).map((x) => [x.kisiId, x.ad, x.firmaAdi])).toEqual([[9, 'Deneme Dokuz', 'Silinmiş firma'], [7, 'Deneme Yedi', 'Alfa']]);
  });

  it('atama ve kaldırma kişinin firma ucuna gider; kişi listesinde kendisi ve atanmış kişi yok', async () => {
    const giden: [string, unknown][] = [];
    vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
      const yol = adres.replace('/api', '');
      if (yol === '/oturum') return json(200, { kullanici: YONETICI } satisfies OturumCevabi);
      if (yol.startsWith('/portal/belge?')) return json(200, { belge: { yol: 'settings/main', kimlik: 'main', surum: 1, veri: {} }, damga: 1 } satisfies BelgeCevabi);
      if (yol === '/portal/kisiler') return json(200, { kisiler: KISILER });
      if (yol === '/portal/sorgu?koleksiyon=parties') return json(200, { belgeler: FIRMALAR, damga: 1 });
      if (yol === '/portal/sorgu?koleksiyon=users') return json(200, { belgeler: KULLANICILAR, damga: 1 });
      if (yol.startsWith('/portal/kisiler/')) { giden.push([yol, JSON.parse(String(secenek?.body))]); return json(200, { kisiId: 1, firma: null }); }
      return json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
    }));
    ac();
    await screen.findByText('Alfa');
    const kisi = screen.getByLabelText('Kişi') as HTMLSelectElement;
    await waitFor(() => { expect([...kisi.options].map((o) => o.value)).toEqual(['', '8']); });
    fireEvent.change(kisi, { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Firma'), { target: { value: 'p2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Firmaya ata' }));
    await waitFor(() => { expect(giden).toEqual([['/portal/kisiler/8/firma', { firma: 'p2' }]]); });
    fireEvent.click(screen.getAllByRole('button', { name: 'Kaldır' })[1] as HTMLElement);
    await waitFor(() => { expect(giden[1]).toEqual(['/portal/kisiler/7/firma', { firma: null }]); });
  });
});
