import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BildirimSaglayici } from '../../../ortak/arayuz/index.ts';
import type { OlayTuru } from './akislar.ts';
import type { FinansHamVerisi } from './donustur.ts';
import { KayitCekmecesi } from './KayitFormu.tsx';
import { ornekHamVeri } from './ornek-ham-veri.ts';
import { json, sunucuKur, YAZAN } from './test-ortak.tsx';
import { finansiKur } from './veri.ts';

// 260 a, 302 a, FNS-68: iade olayları ve satış formundaki sipariş ve sevk seçimi (eski çerçevenin sınadığı akış, aynı sayılarla).
// Firma, belge, sipariş ve sevk uydurmadır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const FIRMA = 'Deneme Müşteri';
function hamVeri(ek: (h: FinansHamVerisi) => void = () => {}): FinansHamVerisi {
  const h = ornekHamVeri();
  const sablon = h.belgeler[0]!;
  h.firmalar = [{ ...h.firmalar[0]!, id: 7, ad: FIRMA, kod: 'M1', tur: 'ikisi' }];
  h.belgeler = [
    { ...sablon, id: 1, firmaId: 7, belgeNo: 'SF-1', belgeTarihi: '2026-10-01', vade: '2026-11-01', paraBirimi: 'EUR', kur: '35.500000', tutar: '100.00', kdvOrani: '20.00',
      kdvTutari: '20.00', toplam: '120.00', toplamTl: '4260.00', kapanan: '0.00', kalan: '120.00', siparisId: 3 },
    { ...sablon, id: 2, firmaId: 7, yon: 'gider', tur: 'iade', kategori: 'satis_iadesi', belgeNo: null, belgeTarihi: '2026-10-01', vade: '2026-11-01', paraBirimi: 'EUR',
      kur: '35.500000', tutar: '10.00', kdvOrani: '20.00', kdvTutari: '2.00', toplam: '12.00', toplamTl: '426.00', kapanan: '0.00', kalan: '12.00', siparisId: 3, iadeBelgeId: 1 },
  ];
  h.odemeler = []; h.dagitimlar = []; h.mahsuplar = []; h.cekler = [];
  ek(h);
  return h;
}

const SIPARISLER = { siparisler: [{ id: 3, no: 'SS-2026-001', durum: 'onayli', siparisTarihi: '2026-09-20', musteriSiparisNo: 'PO-9' }] };
const SEVKLER = { sevkler: [{ id: 11, tarih: '2026-10-08', belgeNo: 'IR-5', durum: 'tamamlandi' }, { id: 12, tarih: '2026-10-09', belgeNo: null, durum: 'planlandi' }] };

function ac(ham: FinansHamVerisi, tur: OlayTuru, party = '') {
  const istekler = sunucuKur(YAZAN, {
    'GET /finans/satis-siparisleri': () => json(200, SIPARISLER),
    'GET /finans/satis-sevkleri': () => json(200, SEVKLER),
    'POST /finans/belgeler/ekle': () => json(200, { belge: {} }),
  }, ham);
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}>
      <BildirimSaglayici>
        <KayitCekmecesi acik tur={tur} ilk={party ? { party } : undefined} finans={finansiKur(ham, '2026-10-15')} kapat={() => {}} sec={() => {}} />
      </BildirimSaglayici>
    </QueryClientProvider>,
  );
  return { istekler, p: screen.getByRole('dialog') };
}
const yazmalar = (istekler: ReturnType<typeof sunucuKur>) => istekler.filter((i) => i.yontem === 'POST');

describe('iade ve sipariş seçimi (260 a)', () => {
  it('"Müşteri iade etti" asıl satış faturasının ters yönünde iade gövdesi gönderir; para birimi, kur ve KDV asıldan gelir', async () => {
    const { istekler, p } = ac(hamVeri(), 'iadesat');
    const asil = within(p).getByLabelText(/İade edilen satış faturası/) as HTMLSelectElement;
    expect(asil.textContent).toContain('SF-1');
    fireEvent.change(asil, { target: { value: '1' } });
    fireEvent.change(within(p).getByLabelText(/İade tutarı/), { target: { value: '40' } });
    fireEvent.change(within(p).getByLabelText(/^Tarih/), { target: { value: '2026-10-10' } });
    fireEvent.click(within(p).getByRole('button', { name: 'İadeyi kaydet' }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    expect(yazmalar(istekler)[0]).toMatchObject({ yol: '/finans/belgeler/ekle', govde: {
      yon: 'gider', tur: 'iade', kategori: 'satis_iadesi', firmaId: 7, iadeBelgeId: 1, belgeTarihi: '2026-10-10',
      paraBirimi: 'EUR', kur: 35.5, tutar: 40, kdvOrani: 20,
    } });
  });

  it('iade satırı asıl faturayı anar; "Tedarikçiye iade ettim" yalnız alış faturası arar', () => {
    const aciklamalar = finansiKur(hamVeri(), '2026-10-15').motor.durum.tx.map((t) => t.desc);
    expect(aciklamalar).toContain('İade: SF-1 (siparişe bağlı)');
    expect(aciklamalar).toContain('SF-1 (siparişe bağlı)');
    const { p } = ac(hamVeri(), 'iadealis');
    expect(p.textContent).toContain('iade edilecek alış faturası yok');
  });

  it('satış formu firmanın siparişlerini listeler; sevk sipariş seçilmeden kapalıdır; seçilenler gövdeye girer', async () => {
    const { istekler, p } = ac(hamVeri(), 'satis', FIRMA);
    const siparis = within(p).getByLabelText(/Sipariş/) as HTMLSelectElement;
    await waitFor(() => expect(siparis.textContent).toContain('SS-2026-001 · Onaylı'));
    expect(istekler.find((i) => i.yol === '/finans/satis-siparisleri')).toBeTruthy();
    const sevk = within(p).getByLabelText(/Sevk/) as HTMLSelectElement;
    expect(sevk.disabled).toBe(true);
    fireEvent.change(siparis, { target: { value: '3' } });
    await waitFor(() => expect(sevk.textContent).toContain('IR-5'));
    expect(sevk.disabled).toBe(false);
    expect(sevk.textContent).toContain('Planlandı');
    fireEvent.change(sevk, { target: { value: '11' } });
    fireEvent.change(within(p).getByLabelText(/^Tutar/), { target: { value: '100' } });
    fireEvent.click(within(p).getByRole('button', { name: /Satışı kaydet/ }));
    await waitFor(() => expect(yazmalar(istekler)).toHaveLength(1));
    const govde = yazmalar(istekler)[0]!.govde as Record<string, unknown>;
    expect([govde['siparisId'], govde['sevkiyatIsiId']]).toEqual([3, 11]);
  });

  it('iptal edilmemiş satış faturası olan sevk "Faturalandı" yazar ve seçilemez (FNS-68)', async () => {
    const ham = hamVeri((h) => {
      const b = h.belgeler[0]!;
      h.belgeler.push({ ...b, id: 3, belgeNo: 'SF-3', sevkiyatIsiId: 11 }, { ...b, id: 4, belgeNo: 'SF-4', sevkiyatIsiId: 12, durum: 'iptal' });
    });
    const { p } = ac(ham, 'satis', FIRMA);
    const siparis = within(p).getByLabelText(/Sipariş/) as HTMLSelectElement;
    await waitFor(() => expect(siparis.textContent).toContain('SS-2026-001'));
    fireEvent.change(siparis, { target: { value: '3' } });
    const sevk = within(p).getByLabelText(/Sevk/) as HTMLSelectElement;
    await waitFor(() => expect(sevk.textContent).toContain('IR-5'));
    const secenek = (id: string) => sevk.querySelector(`option[value="${id}"]`) as HTMLOptionElement;
    expect([secenek('11').disabled, secenek('11').textContent]).toEqual([true, '8 Eki · IR-5 · Teslim edildi · Faturalandı (SF-3)']);
    expect([secenek('12').disabled, secenek('12').textContent?.includes('Faturalandı')]).toEqual([false, false]);
  });
});
