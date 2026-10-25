import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { SatinAlmaFasonPlani, SatinAlmaMalzemePlani } from '../../disari.ts';
import { SATIN_ALMA_CALISMASI } from './SatinAlmaPlanlari.tsx';

// 546 a: sayfalar sunucunun daraltılmış çalışmasıyla (satin-alma-gorunumu.ts beyaz listesi) planlama görünümünü yazmasız çizer. Çalışmalar
// planlama testlerinin örneklerinin daraltılmış halidir: müşteri, fiyat, tezgâh ve personel yoktur. Veri uydurmadır.
const G = 24;
const bugun = new Date().toISOString().slice(0, 10);

const fasonCalismasi = {
  surum: 2, dataVer: 1, plan: {
    dataVer: 1,
    ops: { 'S1.10': { id: 'S1.10', job: 'S1', S: 8, C: 10 }, 'S1.20': { id: 'S1.20', job: 'S1', S: 10, C: 58, fas: 1, m: '@F1' } },
    J: { S1: { C: 58 } },
  },
  olaylar: [], emirDurumu: { orders: [], opStatus: {} },
  D: {
    meta: { baslangic: '2026-01-05' },
    vardiyalar: [{ id: 'V1', bas: '08:00', bit: '16:00', molalar: [] }],
    calismaGunleri: { pzt: ['V1'], sal: ['V1'], car: ['V1'], per: ['V1'], cum: ['V1'], cmt: [], paz: [] }, tatiller: [],
    urunler: [{ id: 'U1', rota: [{ k: '10' }, { k: '20', bag: [['10']] }] }],
    siparisler: [{ id: 'S1', urun: 'U1', adet: 2, termin: '2026-01-09 16:00', malzeme: [{ kod: 'M1', miktar: 1.5 }] }],
    malzemeler: [{ kod: 'M1', ad: 'Deneme çubuk', birim: 'kg', stok: 100 }],
    satinalma: [], tedarikciler: [], fasoncular: [{ id: 'F1', ad: 'Deneme kaplama', sureGun: 2, kapasite: 1 }],
    fasonTermin: {}, fasonRef: {}, opAdet: {}, tezgahlar: [], personel: [],
  },
};

const malzemeCalismasi = {
  surum: 2, dataVer: 1, olaylar: [], emirDurumu: { orders: [], opStatus: {} },
  plan: { dataVer: 1, ops: { 'E-1.10': { job: 'E-1', S: 5 * G, C: 6 * G, done: 0 } }, J: {} },
  D: {
    meta: { baslangic: bugun },
    siparisler: [{ id: 'E-1', urun: 'U1', adet: 10, termin: null, malzeme: [{ kod: 'M-1', miktar: 2 }] }],
    urunler: [{ id: 'U1', rota: [] }],
    malzemeler: [{ kod: 'M-1', ad: 'Deneme cubuk', birim: 'kg', stok: 5, tedarikGun: 2, muayeneGun: 0 }],
    satinalma: [{ kod: 'M-1', miktar: 3, gelis: '2099-01-01 08:00', tedarikci: 'T1' }],
    tedarikciler: [{ id: 'T1', ad: 'Deneme Tedarik' }], fasoncular: [], tezgahlar: [], personel: [],
  },
};

const json = (durum: number, govde: unknown) => new Response(JSON.stringify(govde), { status: durum });

function sunucu(calisma: unknown, durum = 200): string[] {
  const istekler: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
    const yol = adres.replace(/^\/api/, '');
    istekler.push(`${istek?.method ?? 'GET'} ${yol}`);
    if (yol === SATIN_ALMA_CALISMASI) return durum === 200 ? json(200, { calisma, surum: 7 }) : json(durum, { hata: 'YETKISIZ', mesaj: 'Yetkiniz yok.' });
    // Satın alma rolü stok uçlarını okuyamayabilir: sayfa planın kopyasına düşer.
    return json(403, { hata: 'YETKISIZ', mesaj: 'Yetkiniz yok.' });
  }));
  return istekler;
}

// Oturum okunamaz (uç reddeder): termin yazma yetkisi görünmez.
const ciz = (ekran: React.ReactNode) => render(
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    <BildirimSaglayici><MemoryRouter>{ekran}</MemoryRouter></BildirimSaglayici>
  </QueryClientProvider>,
);
const BEKLE = { timeout: 10000 };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Satın Alma menüsünün plan sayfaları (546 a)', () => {
  it('fason planı daraltılmış çalışmayla planlamadaki hesabı verir; termin girişi ve planlamaya geçiş yoktur', async () => {
    const istekler = sunucu(fasonCalismasi);
    ciz(<SatinAlmaFasonPlani />);
    expect(await screen.findByRole('group', { name: 'Fasoncu × gün, kapasite ve gecikme' }, BEKLE)).toBeTruthy();
    expect(document.querySelector('.tc-pyk-durum')?.textContent).toContain('1 fason işinden 1 tanesi siparişi geciktiriyor, 1 tanesinin dönüş tarihi yok');
    fireEvent.click(screen.getByRole('button', { name: /^Deneme kaplama, 05\.01 Pzt: 1 iş fasoncuda/ }));
    const acilim = screen.getByRole('region', { name: 'Deneme kaplama · 05.01 Pzt' });
    expect(within(acilim).queryByLabelText(/Dönüş günü/)).toBeNull();
    expect(within(acilim).queryByText(/çizelgede/)).toBeNull();
    fireEvent.click(screen.getByText('Tüm satırlar'));
    expect(screen.queryByLabelText('S1.20 fason dönüş termini')).toBeNull();
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
  }, 30000);

  it('malzeme planı tutarsız çizilir; stok okunamazsa planın kopyası kullanılır', async () => {
    const istekler = sunucu(malzemeCalismasi);
    ciz(<SatinAlmaMalzemePlani />);
    expect(await screen.findByText(/planın kendi kopyası kullanılıyor/, {}, BEKLE)).toBeTruthy();
    const plan = screen.getByRole('table', { name: 'Verilecek siparişler' });
    expect(within(plan).getAllByRole('columnheader').map((h) => h.textContent)).not.toContain('Tutar');
    expect(within(plan).getByText('Termin bekleniyor')).toBeTruthy();
    expect(within(screen.getByRole('table', { name: 'Tedarik terminleri' })).getByText('M-1')).toBeTruthy();
    expect(screen.queryByLabelText('M-1 tedarik termini')).toBeNull();
    expect(screen.queryByText(/ TL$/)).toBeNull();
    expect((screen.getByRole('button', { name: 'Hesapla' }) as HTMLButtonElement).disabled).toBe(true);
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
  }, 30000);

  it('uç reddederse hata ve yeniden dene görünür; çalışma yoksa plansız hal çizilir', async () => {
    sunucu(null, 403);
    ciz(<SatinAlmaMalzemePlani />);
    expect(within(await screen.findByRole('alert', {}, BEKLE)).getByRole('button', { name: 'Yeniden dene' })).toBeTruthy();
    cleanup();
    vi.unstubAllGlobals();
    sunucu(null);
    ciz(<SatinAlmaFasonPlani />);
    expect(await screen.findByText(/Plan kurulunca fasona giden işler/, {}, BEKLE)).toBeTruthy();
  }, 30000);
});
