import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { LogoBelgeAramaCevabi, LogoBelgeBulgusu } from '#paylasilan/sozlesme/logo.ts';
import { BildirimSaglayici } from './Bildirim.tsx';
import { LogoBagi, tutarKarsilastirmasi } from './LogoBagi.tsx';
import type { LogoRozetBilgisi } from './LogoRozeti.tsx';

// 3360-2 a: ayrıntıda "Logo'da ara ve bağla" ve "Bağı kaldır". Belgeler uydurmadır (ORN-).
const BELGE: LogoBelgeBulgusu = {
  logoKayitNo: 41, no: 'ORN-SS-141', belgeNo: null, tarih: '2026-11-12', cariKodu: 'ORN-C-1001', cariAdi: 'ORN Deneme', projeKodu: null, projeAdi: null,
  aciklama: null, tutar: null, dovizTuru: null, iptal: false, satirSayisi: 0, satirlar: [], core: null, bagla: { uygun: true, neden: null },
};
const CEVAP: LogoBelgeAramaCevabi = {
  durum: 'tamam', ileti: null, fiyatGorunur: false, baglanacak: { no: 'SS-2026-001', tarih: '2026-11-14', engel: null, tutar: null },
  belgeler: [BELGE, { ...BELGE, logoKayitNo: 42, no: 'ORN-SS-142', cariKodu: 'ORN-C-9', bagla: { uygun: false, neden: 'Cari farklı; bağlanamaz.' } }],
};
const json = (govde: unknown) => new Response(JSON.stringify(govde), { status: 200 });
function sunucuKur() {
  const istekler: { yontem: string; yol: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek?.method ?? 'GET';
    istekler.push({ yontem, yol, govde: typeof secenek?.body === 'string' ? JSON.parse(secenek.body) : null });
    if (yol === '/logo/belge-arama-durumu') return json({ acik: true, neden: null });
    if (yol.startsWith('/logo/belge-ara?')) return json(CEVAP);
    return json({ kayitNo: yontem === 'POST' && yol === '/logo/belge-bagla' ? '41' : null });
  }));
  return istekler;
}
function ciz(islemler: string[], bilgi: LogoRozetBilgisi | null) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  istemci.setQueryData(['oturum'], { islemler });
  return render(
    <QueryClientProvider client={istemci}><MemoryRouter><BildirimSaglayici>
      <LogoBagi tur="satis-siparisi" id={5} bilgi={bilgi} />
    </BildirimSaglayici></MemoryRouter></QueryClientProvider>,
  );
}
const SIRADA: LogoRozetBilgisi = { id: 5, durum: 'sirada', kayitNo: null, neden: null, elle: false };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Logo bağı (3360-2 a)', () => {
  it('tutar karşılaştırması: KDV hariç ya da dahilden birine eşitse aynı; para birimi farklıysa karşılaştırılmaz', () => {
    const siparis = { kdvHaric: '40000.00', kdvDahil: '48000.00', paraBirimi: 'TRY' };
    expect(tutarKarsilastirmasi(null, { tutar: '1', dovizTuru: null })).toBeNull();
    expect(tutarKarsilastirmasi(siparis, { tutar: '48000', dovizTuru: null })).toEqual({ metin: 'Tutar aynı (48.000,00 TL).', fark: false });
    expect(tutarKarsilastirmasi(siparis, { tutar: '40000.001', dovizTuru: 0 })).toEqual({ metin: 'Tutar aynı (40.000,00 TL).', fark: false });
    expect(tutarKarsilastirmasi(siparis, { tutar: '47000', dovizTuru: null }))
      .toEqual({ metin: 'Tutar farklı: CORE 40.000,00 TL KDV hariç (48.000,00 TL KDV dahil), Logo 47.000,00 TL.', fark: true });
    expect(tutarKarsilastirmasi({ kdvHaric: '120.5', kdvDahil: null, paraBirimi: 'EUR' }, { tutar: '130', dovizTuru: 20 }))
      .toEqual({ metin: 'Tutar farklı: CORE 120,50 EUR KDV hariç, Logo 130,00 EUR.', fark: true });
    expect(tutarKarsilastirmasi(siparis, { tutar: '48000', dovizTuru: 1 }))
      .toEqual({ metin: 'Tutar karşılaştırılamadı: para birimi farklı (CORE TL, Logo USD).', fark: true });
    expect(tutarKarsilastirmasi(siparis, { tutar: null, dovizTuru: null })?.fark).toBe(true);
  });

  it('yazabilen arar, uyan kayıtta "Bağla" onaylı gider; uymayanda neden yazar, tarih farkı onayda görünür', async () => {
    const istekler = sunucuKur();
    ciz(['siparisler.yaz'], SIRADA);
    fireEvent.click(await screen.findByRole('button', { name: "Logo'da ara ve bağla" }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.change(within(pencere).getByLabelText(/Aranan/), { target: { value: 'ORN-SS' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Ara' }));
    expect(await within(pencere).findByText('Cari farklı; bağlanamaz.')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/logo/belge-ara?tur=satis-siparisi&q=ORN-SS&belge=5')).toBe(true);
    expect(within(pencere).getByText(/SS-2026-001 Logo'ya gitmedi\. Yalnız aynı carinin Logo kaydı bağlanır\./)).toBeTruthy();
    const dugmeler = within(pencere).getAllByRole('button', { name: 'Bağla' });
    expect(dugmeler).toHaveLength(1);
    fireEvent.click(dugmeler[0]!);
    const onay = await screen.findByRole('dialog', { name: /SS-2026-001 ↔ ORN-SS-141 bağlansın mı\?/ });
    expect(within(onay).getByText('Fark var: tarih CORE 14.11.2026, Logo 12.11.2026.')).toBeTruthy();
    fireEvent.click(within(onay).getByRole('button', { name: 'Bağla' }));
    await waitFor(() => { expect(istekler.some((i) => i.yontem === 'POST')).toBe(true); });
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => [i.yol, i.govde])).toEqual([
      ['/logo/belge-bagla', { tur: 'satis-siparisi', belgeId: 5, logoKayitNo: 41 }],
    ]);
  });

  it('yazma yetkisi yoksa ve rozet yoksa (Logo\'ya gitmeyen belge) düğme çizilmez', () => {
    sunucuKur();
    const { container } = ciz(['siparisler.oku'], SIRADA);
    expect(container.textContent).toBe('');
    cleanup();
    const ikinci = ciz(['siparisler.yaz'], null);
    expect(ikinci.container.textContent).toBe('');
  });

  it('elle bağlanmışta "elle bağlandı"; bağı yalnız Sistem Ayarları yazan kaldırır, onayla gider', async () => {
    const istekler = sunucuKur();
    const elle: LogoRozetBilgisi = { id: 5, durum: 'logoda', kayitNo: '41', neden: null, elle: true };
    ciz(['siparisler.yaz'], elle);
    expect(screen.getByText('elle bağlandı')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Bağı kaldır' })).toBeNull();
    cleanup();
    ciz(['ayarlar.yaz'], elle);
    fireEvent.click(screen.getByRole('button', { name: 'Bağı kaldır' }));
    const onay = await screen.findByRole('dialog', { name: /Logo bağı kaldırılsın mı\?/ });
    fireEvent.click(within(onay).getByRole('button', { name: 'Bağı kaldır' }));
    await waitFor(() => { expect(istekler.some((i) => i.yontem === 'POST')).toBe(true); });
    expect(istekler.filter((i) => i.yontem === 'POST').map((i) => [i.yol, i.govde])).toEqual([['/logo/belge-bag-kaldir', { tur: 'satis-siparisi', belgeId: 5 }]]);
    cleanup();
    ciz(['ayarlar.yaz'], { ...elle, elle: false });
    expect(screen.queryByText('elle bağlandı')).toBeNull();
  });
});
