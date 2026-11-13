import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { Kroki, KrokiAyariCevabi, YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { OturumCevabi } from '#paylasilan/sozlesme/oturum.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { anahtarlar } from '../../ortak/veri/anahtarlar.ts';
import { YerlesimDuzenleyici } from './YerlesimDuzenleyici.tsx';

// Düzenleyicide seçme, silme ve taşıma (kart 2122): plana basınca tuşlar çalışır, seçmek için basmak öğeyi oynatmaz,
// tutamak uzaktan da tutulur, makineli istasyonun çerçevesi içinden seçilir.

const YAZAN: Kullanici = { id: 1, ad: 'Deneme Yönetici', islemler: ['sayfa.atolye', 'atolye.salon-yaz', 'atolye.fabrika-yaz', 'atolye.kroki-yaz', 'atolye.model-yaz', 'atolye.kalem-yaz'] };

const YERLESIM = {
  salon: {
    id: 1, kod: 'S1', ad: 'Deneme salonu', genislik: '40.00', derinlik: '24.00', hucreBoyu: '4.00', surum: 3, fabrika: { x: '0.00', z: '0.00', donus: '0.0' },
    giris: null, kaydeden: { id: 1, ad: 'Deneme Yönetici' }, kaydedildi: '2026-10-07T08:00:00Z', sutunlar: ['A', 'B'], satirlar: ['1', '2'],
  },
  makineYerleri: [],
  istasyonYerleri: [
    { istasyonId: 6, kod: 'CNC-02', ad: 'İkinci Tezgah', tip: 'talasli', aktif: true, x: '12.00', z: '5.00', donus: '0.0', genislik: '3.00', derinlik: '2.00', hucre: 'D2', makineler: [], model: null, merkezModeli: null },
  ],
  raflar: [],
  alanlar: [],
  duvarlar: [],
  gecisler: [],
} satisfies YerlesimCevabi;

const cevap = (govde: unknown, durum = 200) => new Response(JSON.stringify(govde), { status: durum, headers: { 'Content-Type': 'application/json' } });

const FABRIKA_KROKISI = {
  salonId: null, ad: 'Vaziyet planı', boyutBayt: 1000, parcaSayisi: 1, ozet: 'c'.repeat(64), sayfa: 1,
  hizalama: { olcek: '0.05', donus: '0', x: '0', z: '0' }, tamam: true, surum: 2,
  kaydeden: { id: 1, ad: 'Deneme Yönetici' }, kaydedildi: '2026-10-07T08:00:00Z', merkez: null,
} satisfies Kroki;

interface Cagri { yontem: string; yol: string; govde: unknown }

function sunucuKur(ek: { fabrikaKrokisi?: Kroki; saydamlik?: number } = {}): Cagri[] {
  const cagrilar: Cagri[] = [];
  vi.stubGlobal('fetch', vi.fn((adres: string, secenek: RequestInit = {}) => {
    const yol = adres.replace('/api', '');
    const yontem = secenek.method ?? 'GET';
    cagrilar.push({ yontem, yol, govde: typeof secenek.body === 'string' ? JSON.parse(secenek.body) : undefined });
    if (yol === '/oturum') return Promise.resolve(cevap({ kullanici: YAZAN } satisfies OturumCevabi));
    if (yol === '/atolye/fabrika/kroki') return Promise.resolve(cevap({ kroki: ek.fabrikaKrokisi ?? null }));
    if (yol.endsWith('/kroki')) return Promise.resolve(cevap({ kroki: null }));
    if (yol === '/atolye/kroki-ayari') return Promise.resolve(cevap({ saydamlik: ek.saydamlik ?? 70 } satisfies KrokiAyariCevabi));
    if (yol === '/atolye/kroki-ayari/degistir' && yontem === 'POST') {
      const g = JSON.parse(String(secenek.body)) as { saydamlik: number };
      return Promise.resolve(cevap({ saydamlik: g.saydamlik } satisfies KrokiAyariCevabi));
    }
    if (yol.startsWith('/istasyonlar')) return Promise.resolve(cevap({ istasyonlar: [] }));
    if (yol === '/makineler') return Promise.resolve(cevap({ makineler: [] }));
    if (yol === '/atolye/cizim-merkezi/modeller') return Promise.resolve(cevap({ belgeler: [], istasyonlar: [] }));
    return Promise.resolve(cevap({ kod: 'BULUNAMADI', mesaj: 'yok' }, 404));
  }));
  return cagrilar;
}

// jsdom'da PointerEvent yok: fireEvent düz Event üretir ve imleç konumu kaybolur.
class DenemeIsaretci extends MouseEvent {
  readonly pointerId: number;
  readonly pointerType: string;
  constructor(tur: string, s: PointerEventInit = {}) {
    super(tur, s);
    this.pointerId = s.pointerId ?? 1;
    this.pointerType = s.pointerType ?? 'mouse';
  }
}

// jsdom SVG dönüşümü bilmez: ekran pikseli doğrudan metre sayılır (1 px = 1 m).
function birePirDonusum() {
  if (typeof window.PointerEvent === 'undefined') vi.stubGlobal('PointerEvent', DenemeIsaretci);
  const proto = SVGSVGElement.prototype as unknown as Record<string, unknown>;
  const kimlik = { a: 1, inverse: () => kimlik };
  proto.getScreenCTM = () => kimlik;
  proto.createSVGPoint = () => ({ x: 0, y: 0, matrixTransform(this: { x: number; y: number }) { return { x: this.x, y: this.y }; } });
}

// İkinci bölüm fabrikada A'nın sağında, 90° dönük: fabrikada x 60-70, z 0-20.
const YERLESIM_B = {
  ...YERLESIM,
  salon: { ...YERLESIM.salon, id: 2, kod: 'S2', ad: 'İkinci bölüm', genislik: '20.00', derinlik: '10.00', hucreBoyu: '5.00', surum: 6, fabrika: { x: '70.00', z: '0.00', donus: '90.0' } },
  istasyonYerleri: [],
  raflar: [
    { id: 8, kod: 'R5', ad: 'Konsol raf', tur: 'konsol', bolmeSayisi: 2, katSayisi: 3, gozSayisi: 1, bolmeGenisligi: '1.60', derinlik: '1.20', yukseklik: '3.50', x: '5.00', z: '5.00', donus: '0.0', aktif: true, genislik: '3.20', hucre: 'B1', katYukseklikleri: null, gozGenisligi: null, gozDerinligi: null },
  ],
} satisfies YerlesimCevabi;

function goster(bolum: YerlesimCevabi = YERLESIM, fabrika = false, ikinci: YerlesimCevabi = YERLESIM_B, kullanici: Kullanici = YAZAN) {
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // 3165 a: düzenleyici kaydet ve kroki düğmelerini oturumdaki eylemle açar; testler eşzamanlı olduğundan oturum önceden yazılır.
  istemci.setQueryData(anahtarlar.oturum, kullanici);
  render(
    <MemoryRouter>
      <QueryClientProvider client={istemci}>
        <BildirimSaglayici>
          <YerlesimDuzenleyici salonId={fabrika ? null : 1} bolumler={fabrika ? [bolum, ikinci] : [bolum]} kapat={() => {}} kaydedildi={() => {}} />
        </BildirimSaglayici>
      </QueryClientProvider>
    </MemoryRouter>,
  );
  const duzen = screen.getByRole('dialog', { name: fabrika ? 'Fabrika planını düzenle' : 'Yerleşimi düzenle' });
  const plan = within(duzen).getByRole('img', { name: fabrika ? 'Fabrika planı (düzenleniyor)' : 'Yerleşim planı (düzenleniyor)' });
  return { duzen, plan };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  const proto = SVGSVGElement.prototype as unknown as Record<string, unknown>;
  delete proto.createSVGPoint;
  delete proto.getScreenCTM;
});

describe('plan düzenleyici etkileşimi (2122)', () => {
  it('plan odak alır; seçili öğe Delete ile silinir, Ctrl+Z geri getirir', () => {
    sunucuKur();
    const { duzen, plan } = goster();
    expect(plan.getAttribute('tabindex')).toBe('-1');
    fireEvent.pointerDown(within(plan).getByText('CNC-02').closest('g') as Element, { pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    plan.focus();
    expect(document.activeElement).toBe(plan);
    fireEvent.keyDown(plan, { key: 'Delete' });
    expect(within(plan).queryByText('CNC-02')).toBeNull();
    expect((within(duzen).getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.keyDown(plan, { key: 'z', ctrlKey: true });
    expect(within(plan).getByText('CNC-02')).toBeTruthy();
  });

  it('seçmek için basıp birkaç piksel kaymak öğeyi taşımaz; eşik aşılınca sürüklenir', () => {
    sunucuKur();
    birePirDonusum();
    const { duzen, plan } = goster();
    const kaydet = () => (within(duzen).getByRole('button', { name: 'Kaydet' }) as HTMLButtonElement).disabled;
    const oge = within(plan).getByText('CNC-02').closest('g') as Element;
    fireEvent.pointerDown(oge, { pointerId: 1, clientX: 12, clientY: 5 });
    fireEvent.pointerMove(window, { pointerId: 1, clientX: 15, clientY: 5 });
    fireEvent.pointerUp(window, { pointerId: 1, clientX: 15, clientY: 5 });
    expect(kaydet()).toBe(true);
    fireEvent.pointerDown(oge, { pointerId: 2, clientX: 12, clientY: 5 });
    fireEvent.pointerMove(window, { pointerId: 2, clientX: 20, clientY: 5 });
    fireEvent.pointerUp(window, { pointerId: 2, clientX: 20, clientY: 5 });
    expect(kaydet()).toBe(false);
    expect(within(duzen).getByLabelText<HTMLInputElement>('X (m)').value).toBe('20');
  });

  it('döndürme tutamağı ekran pikseline göre büyür (uzaktan da tutulur)', () => {
    sunucuKur();
    const { plan } = goster();
    fireEvent.pointerDown(within(plan).getByText('CNC-02').closest('g') as Element, { pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    const tutamak = plan.querySelector('.tc-plan-tutamaklar circle');
    // jsdom'da ölçek okunamaz, varsayılan 0,05 m/px: 10 px = 0,5 m (metre tabanı 0,32'nin üstünde).
    expect(Number(tutamak?.getAttribute('r'))).toBeCloseTo(0.5);
  });

  it('üst çubuktaki Sil seçili öğeyi kaldırır; kayıtlı raf silinmez, pasife alınır', () => {
    sunucuKur();
    const { duzen, plan } = goster(YERLESIM_B);
    expect(within(duzen).queryByRole('button', { name: 'Sil' })).toBeNull();
    fireEvent.pointerDown(within(plan).getByText('R5').closest('g') as Element, { pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    const cubuk = within(duzen).getByRole('button', { name: 'Kaydet' }).closest('.tc-atolye-duzen-cubuk') as HTMLElement;
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Pasife al' }));
    expect(within(plan).getByText('R5').closest('g')?.getAttribute('data-aktif')).toBe('false');
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Ekle' }));
    fireEvent.click(within(duzen).getByRole('button', { name: 'Palet rafı' }));
    expect(within(cubuk).getByRole('button', { name: 'Sil' })).toBeTruthy();
    const once = within(plan).getAllByText(/^R\d+$/).length;
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Sil' }));
    expect(within(plan).getAllByText(/^R\d+$/).length).toBe(once - 1);
  });

  it('fabrika planında Ekle öğeyi seçili bölüme koyar, görünüm ortası başka bölümde olsa da', () => {
    sunucuKur();
    const { duzen, plan } = goster(YERLESIM, true);
    const kodlar = () => new Set(within(plan).getAllByText(/^R\d+$/).map((e) => e.textContent));
    const once = kodlar();
    fireEvent.pointerDown(within(plan).getByText('S2 · İkinci bölüm').closest('g') as Element, { pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    fireEvent.click(within(duzen).getByRole('button', { name: 'Ekle' }));
    fireEvent.click(within(duzen).getByRole('button', { name: 'Palet rafı' }));
    const yeni = within(plan).getAllByText(/^R\d+$/).find((e) => !once.has(e.textContent));
    const x = Number(yeni?.getAttribute('x'));
    const z = Number(yeni?.getAttribute('y')) - 0.18;
    expect(x).toBeGreaterThanOrEqual(60);
    expect(x).toBeLessThanOrEqual(70);
    expect(z).toBeGreaterThanOrEqual(0);
    expect(z).toBeLessThanOrEqual(20);
  });

  it('bölümün krokisi yoksa fabrika krokisi kullanılır: ölçek ve hizalama sorulmaz, bölüme ayrı kroki yüklenebilir (2122-3 a)', async () => {
    sunucuKur({ fabrikaKrokisi: FABRIKA_KROKISI });
    const { duzen } = goster();
    fireEvent.click(within(duzen).getByRole('button', { name: 'Kroki' }));
    const panel = within(duzen).getByRole('complementary', { name: 'Kroki' });
    expect(await within(panel).findByText(/Vaziyet planı/)).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Bölüme ayrı kroki' })).toBeTruthy();
    expect(within(panel).queryByRole('region', { name: 'Hizalama' })).toBeNull();
    expect(within(panel).queryByRole('button', { name: '1 · Ölçek' })).toBeNull();
  });

  it('kroki saydamlığı sunucudan gelir; kaydırıcı bırakılınca gördüğü değerle herkes için saklanır (2122-2 b, 2122-5 a)', async () => {
    const cagrilar = sunucuKur({ fabrikaKrokisi: FABRIKA_KROKISI, saydamlik: 40 });
    const { duzen } = goster();
    fireEvent.click(within(duzen).getByRole('button', { name: 'Kroki' }));
    const panel = within(duzen).getByRole('complementary', { name: 'Kroki' });
    expect(await within(panel).findByText('Saydamlık %40')).toBeTruthy();
    fireEvent.change(within(panel).getByRole('slider'), { target: { value: '55' } });
    expect(within(panel).getByText('Saydamlık %55')).toBeTruthy();
    await waitFor(() => expect(cagrilar.some((c) => c.yol === '/atolye/kroki-ayari/degistir')).toBe(true));
    expect(cagrilar.filter((c) => c.yol === '/atolye/kroki-ayari/degistir').map((c) => c.govde)).toEqual([{ saydamlik: 55, beklenen: 40 }]);
  });

  it('3165 a: saydamlığı yalnız kroki eylemi olan kişi de saklar (yerleşim eylemi gerekmez)', async () => {
    const cagrilar = sunucuKur({ fabrikaKrokisi: FABRIKA_KROKISI, saydamlik: 40 });
    const { duzen } = goster(YERLESIM, false, YERLESIM_B, { ...YAZAN, islemler: ['sayfa.atolye', 'atolye.kroki-yaz'] });
    fireEvent.click(within(duzen).getByRole('button', { name: 'Kroki' }));
    const panel = within(duzen).getByRole('complementary', { name: 'Kroki' });
    expect(await within(panel).findByText('Saydamlık %40')).toBeTruthy();
    fireEvent.change(within(panel).getByRole('slider'), { target: { value: '55' } });
    await waitFor(() => expect(cagrilar.filter((c) => c.yol === '/atolye/kroki-ayari/degistir').map((c) => c.govde)).toEqual([{ saydamlik: 55, beklenen: 40 }]));
  });

  it('fabrika planında seçili bölümün komşuyla ortak duvarı listelenir; sınır kaldırılınca geçiş komşuyu bağlar (2122-4 a)', () => {
    sunucuKur();
    // B, A'nın sağ duvarına (x 40) değecek yerde: fabrikada x 40-50, z 0-20.
    const bitisik = { ...YERLESIM_B, salon: { ...YERLESIM_B.salon, fabrika: { x: '50.00', z: '0.00', donus: '90.0' } } } satisfies YerlesimCevabi;
    const { duzen, plan } = goster(YERLESIM, true, bitisik);
    fireEvent.pointerDown(within(plan).getByText('S1 · Deneme salonu').closest('g') as Element, { pointerId: 1 });
    fireEvent.pointerUp(window, { pointerId: 1 });
    const komsu = within(duzen).getByRole('region', { name: 'Komşu bölümler' });
    expect(within(komsu).getByText(/sağ duvar · 20 m/)).toBeTruthy();
    fireEvent.click(within(komsu).getByRole('button', { name: 'Sınırı kaldır' }));
    expect(within(duzen).getByRole('heading', { name: /Açık geçiş · S1/ })).toBeTruthy();
    expect(within(duzen).getByText('S2 · İkinci bölüm ile bağlar.')).toBeTruthy();
  });
});
