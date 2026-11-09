import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { KmKategoriKarariGovdesi, KmKategoriOnaylariCevabi } from '#paylasilan/sozlesme/kalite-merkezi-kategori-onayi.ts';
import { kmAc, MUHENDIS } from '../test-ortak.tsx';
import { eklenebilirKategoriler } from './KategoriOnaylari.tsx';

// 2466 (2461-2 a): tedarikçi formundaki "Kategori onayları" adımı. Veri uydurmadır; cevaplar sözleşme tipine uyar.
beforeEach(() => { vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); localStorage.clear(); });

const AGAC: KmKategoriOnaylariCevabi['agac'] = [
  { tur: 'hizmet', kod: 'isil', ad: 'Isıl işlem', ustAd: 'Hizmet', aktif: true },
  { tur: 'hizmet', kod: 'yuzey', ad: 'Yüzey işlem', ustAd: 'Hizmet', aktif: true },
  { tur: 'sarf', kod: 'eski', ad: 'Eski sarf', ustAd: 'Sarf', aktif: false },
];
const CEVAP = {
  firmaAskida: null,
  onaylar: [{ kategoriTuru: 'hizmet', kategoriKodu: 'isil', durum: 'sartli', kaynak: 'kategori', tarih: '2026-10-28T09:00:00+03:00', kisiAd: 'Deneme Kalite', aciklama: 'İlk partide tam kontrol', surum: 2 }],
  agac: AGAC,
} satisfies KmKategoriOnaylariCevabi;
const TED = { _id: 's1', kod: 'TED-001', ad: 'Deneme Tedarik', onay: 'Onaylı', firmaId: 7 };

function uclar(cevap: KmKategoriOnaylariCevabi = CEVAP) {
  const asil = globalThis.fetch;
  const kararlar: KmKategoriKarariGovdesi[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
    if (adres.endsWith('/kalite-merkezi/tedarikci-firmalari')) return new Response(JSON.stringify({ firmalar: [{ id: 7, kod: null, ad: 'Deneme Tedarik' }] }), { status: 200 });
    if (adres.includes('/kalite-merkezi/kategori-onaylari?firmaId=7')) return new Response(JSON.stringify(cevap), { status: 200 });
    if (adres.endsWith('/kalite-merkezi/kategori-onaylari/karar')) {
      kararlar.push(JSON.parse(String(istek?.body)) as KmKategoriKarariGovdesi);
      return new Response(JSON.stringify({ surum: 1 }), { status: 200 });
    }
    return asil(adres, istek);
  }));
  return kararlar;
}

// Form tek tek soru kipinde açılır; adım çubuğu tüm alanlar kipindedir.
async function adimaGit() {
  const kip = screen.queryByRole('button', { name: 'Tüm alanları göster' });
  if (kip) fireEvent.click(kip);
  fireEvent.click(await screen.findByRole('button', { name: /Kategori onayları/ }));
}

describe('tedarikçi kategori onayları (2466)', () => {
  it('eklenebilir kategoriler: aktif ve kararı olmayanlar', () => {
    expect(eklenebilirKategoriler(AGAC, CEVAP.onaylar).map((d) => d.kod)).toEqual(['yuzey']);
  });

  it('kararlar kaynak kişi ve tarihle listelenir; yeni karar seçilen kategoriyle, sürümsüz gider', async () => {
    kmAc('tedarikciler', MUHENDIS, { sup: [TED] });
    const kararlar = uclar();
    fireEvent.click(await screen.findByRole('button', { name: /Düzenle/ }));
    await adimaGit();
    expect(await screen.findByText('Isıl işlem')).toBeTruthy();
    expect(screen.getByText('İlk partide tam kontrol')).toBeTruthy();
    expect(screen.getByText('Deneme Kalite')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Kategori ekle/ }));
    const pencere = await screen.findByRole('dialog', { name: 'Kategori ekle' });
    fireEvent.change(within(pencere).getByLabelText(/^Kategori/), { target: { value: 'hizmet:yuzey' } });
    fireEvent.change(within(pencere).getByLabelText(/Kalite kararı/), { target: { value: 'sartli' } });
    const kaydet = within(pencere).getByRole('button', { name: 'Kaydet' });
    expect((kaydet as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(pencere).getByLabelText(/Şart/), { target: { value: ' İlk üç parti tam kontrol ' } });
    fireEvent.click(kaydet);
    await waitFor(() => expect(kararlar).toHaveLength(1));
    expect(kararlar[0]).toEqual({ firmaId: 7, kategoriTuru: 'hizmet', kategoriKodu: 'yuzey', durum: 'sartli', aciklama: 'İlk üç parti tam kontrol', surum: null });
  });

  it('değiştirme okunan sürümle gider', async () => {
    kmAc('tedarikciler', MUHENDIS, { sup: [TED] });
    const kararlar = uclar();
    fireEvent.click(await screen.findByRole('button', { name: /Düzenle/ }));
    await adimaGit();
    fireEvent.click(await screen.findByRole('button', { name: /Değiştir/ }));
    const pencere = await screen.findByRole('dialog', { name: 'Kategori kararı' });
    fireEvent.change(within(pencere).getByLabelText(/Kalite kararı/), { target: { value: 'onayli' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(kararlar).toHaveLength(1));
    expect(kararlar[0]).toMatchObject({ kategoriKodu: 'isil', durum: 'onayli', surum: 2 });
  });

  it('firma askıdaysa uyarı görünür; firma bağı yoksa karar istenmez', async () => {
    kmAc('tedarikciler', MUHENDIS, { sup: [TED] });
    uclar({ ...CEVAP, firmaAskida: { tarih: '2026-11-03T10:00:00+03:00' } });
    fireEvent.click(await screen.findByRole('button', { name: /Düzenle/ }));
    await adimaGit();
    expect(await screen.findByText(/bütün kategorilerini onaysız okur/)).toBeTruthy();
    cleanup();
    kmAc('tedarikciler', MUHENDIS, { sup: [{ ...TED, firmaId: null }] });
    uclar();
    fireEvent.click(await screen.findByRole('button', { name: /Düzenle/ }));
    await adimaGit();
    expect(await screen.findByText(/önce bağlı firmayı seçip kaydedin/)).toBeTruthy();
  });
});
