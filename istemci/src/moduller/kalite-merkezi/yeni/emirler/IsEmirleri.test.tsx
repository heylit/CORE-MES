import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { KmEmirKaynagi } from '#paylasilan/sozlesme/kalite-merkezi.ts';
import { MUAYENECI, OKUYAN, kmAc, type TestKayitlari } from '../test-ortak.tsx';
import { emirSatirlari } from './kaynak.ts';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const kaynak = (k: Partial<KmEmirKaynagi> & Pick<KmEmirKaynagi, 'kimlik' | 'no' | 'tip'>): KmEmirKaynagi => ({
  acik: true, parcaNo: null, parcaAdi: null, miktar: null, termin: null, firmaId: null, firmaAd: null, ...k,
});
const EMIRLER = [
  kaynak({ kimlik: 'ue-1', no: 'UE-1', tip: 'İş emri', parcaNo: 'P-1', parcaAdi: 'Deneme Mil', miktar: 10 }),
  kaynak({ kimlik: 'ue-2', no: 'UE-2', tip: 'İş emri', acik: false, parcaNo: 'P-2' }),
  kaynak({ kimlik: 'sa-3', no: 'SP-3', tip: 'Satınalma siparişi', firmaId: 7, firmaAd: 'Deneme Tedarik' }),
  kaynak({ kimlik: 'ms-4', no: 'MS-4', tip: 'Müşteri siparişi', firmaId: 8, firmaAd: 'Deneme Müşteri', termin: '2026-12-01' }),
];
const KAYITLAR: TestKayitlari = {
  emir: [
    { _id: 'e1', no: 'UE-1', tip: 'İş emri', durum: 'Açık', proje: 'Deneme proje' },
    { _id: 'e9', no: 'ESKI-9', tip: 'İş emri', durum: 'Açık', parcaNo: 'P-9' },
  ],
  lot: [{ _id: 'l1', no: 'LOT-2026-0001', emir: 'UE-1', tarih: '2026-01-03', karar: 'Kabul', N: 10 }],
  belge: [{ _id: 'b1', ad: 'eski-coc.pdf', tur: 'Uygunluk sertifikası (CoC)', bagli: { col: 'emir', id: 'e1', no: 'UE-1' } }],
};

describe('İş emirleri ve siparişler (592 B1 c)', () => {
  it('sahiplerden gelen açık kayıtları listeler; eklenmez, aktarılmaz; eşleşmeyen eski kayıt ayrı ve salt okunur', async () => {
    kmAc('is-emirleri', MUAYENECI, KAYITLAR, { emirler: EMIRLER });
    expect(await screen.findByText('UE-1')).toBeTruthy();
    expect(screen.getByText('SP-3')).toBeTruthy();
    expect(screen.getByText('MS-4')).toBeTruthy();
    expect(screen.queryByText('UE-2')).toBeNull();
    expect(screen.queryByRole('button', { name: /^Ekle$/ })).toBeNull();
    expect(screen.queryByText("CSV'den aktar")).toBeNull();
    const eski = screen.getByRole('table', { name: 'Eşleşmeyen eski kayıtlar' });
    expect(within(eski).getByText('ESKI-9')).toBeTruthy();
    expect(within(eski).queryByText('UE-1')).toBeNull();
  });

  it('detayda izlenebilirlik, eski kayda bağlı CoC ve yazana lot kabul; düzenleme yok', async () => {
    kmAc('is-emirleri', MUAYENECI, KAYITLAR, { emirler: EMIRLER });
    fireEvent.click(await screen.findByText('UE-1'));
    expect(await screen.findByText('LOT-2026-0001')).toBeTruthy();
    expect(screen.getByText(/Deneme Mil/)).toBeTruthy();
    expect(screen.getByTitle(/eski-coc\.pdf/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Lot kabul/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Düzenle/ })).toBeNull();
  });

  it('okuyan detayda lot kabul açamaz', async () => {
    kmAc('is-emirleri', OKUYAN, KAYITLAR, { emirler: EMIRLER });
    fireEvent.click(await screen.findByText('UE-1'));
    await screen.findByText('LOT-2026-0001');
    expect(screen.queryByRole('button', { name: /Lot kabul/ })).toBeNull();
  });

  it('kaynak okunamazsa iletisini gösterir, öteki görünümler çalışır', async () => {
    kmAc('is-emirleri', MUAYENECI, KAYITLAR, { emirler: null });
    expect(await screen.findByText(/Deneme hata/)).toBeTruthy();
    cleanup();
    vi.unstubAllGlobals();
    kmAc('lot-kabul', MUAYENECI, KAYITLAR, { emirler: null });
    expect(await screen.findByText('LOT-2026-0001')).toBeTruthy();
  });
});

describe('sahip satırının eşlemesi', () => {
  it('satın almada firması kayıtlı tedarikçiyi bağlar, müşteri siparişinde müşteriyi yazar; eski kaydın kimliği ve projesi taşınır', () => {
    const { emir, eskiEmir } = emirSatirlari(
      EMIRLER,
      [{ _id: 'e1', no: 'UE-1', proje: 'Deneme proje' }, { _id: 'e9', no: 'ESKI-9' }],
      [{ _id: 's1', firmaId: 7, ad: 'Deneme Tedarik' }],
    );
    expect(emir.find((e) => e._id === 'ue-1')).toMatchObject({ durum: 'Açık', proje: 'Deneme proje', eskiKimlikler: ['e1'], kaynak: true });
    expect(emir.find((e) => e._id === 'ue-2')?.durum).toBe('Kapalı');
    expect(emir.find((e) => e._id === 'sa-3')?.tedarikci).toBe('s1');
    expect(emir.find((e) => e._id === 'ms-4')).toMatchObject({ musteri: 'Deneme Müşteri', termin: '2026-12-01' });
    expect(eskiEmir.map((e) => e._id)).toEqual(['e9']);
  });
});
