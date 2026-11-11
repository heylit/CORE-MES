import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { KucukResimlerCevabi } from '#paylasilan/sozlesme/belge-merkezi.ts';
import type { AcikSiparisSatiri, AcikSiparisSatirlariCevabi, KonumlarCevabi, MalKabullerCevabi, MalzemeOzetiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { DEPOCU, ac, json, sunucuKur } from './test-ortak.tsx';

// Mal kabul ekranı (2872, 2877): seçilen satırın kartının küçük resmi satırda görünür; sipariş satırının parça revizyonu yazılır ve
// yürürlükteki revizyondan farklıysa uyarı çıkar; "Fason dönüşü" yalnız iş emrine bağlı hizmet satırındadır. Veriler uydurmadır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const satir = (id: number, x: Partial<AcikSiparisSatiri>): AcikSiparisSatiri => ({
  id, siparisNo: `SA-${id}`, talepNo: `ST-${id}`, tedarikciAdi: 'Deneme Tedarik', malzemeId: id, malzemeTur: 'yarimamul', kalemAdi: `Deneme kalem ${id}`,
  miktar: '4', kalanMiktar: '4', birim: 'adet', beklenenTeslim: null, uretimEmriId: null, emirNo: null, projeId: null, projeAdi: null,
  isEmriId: null, parcaRevizyonu: null, yururlukRevizyonu: null, revizyonUyusmuyor: null, ...x,
});
const SATIRLAR = [
  satir(41, { kalemAdi: 'Deneme braket', parcaRevizyonu: 'A', yururlukRevizyonu: 'B', revizyonUyusmuyor: true }),
  satir(42, { kalemAdi: 'Deneme flanş', parcaRevizyonu: 'C', yururlukRevizyonu: 'C', revizyonUyusmuyor: false }),
  satir(43, { kalemAdi: 'Deneme kaplama', malzemeTur: 'hizmet', isEmriId: 7 }),
  satir(44, { kalemAdi: 'Deneme kalibrasyon', malzemeTur: 'hizmet' }),
];
const ozet = (id: number, ad: string): MalzemeOzetiCevabi => ({ ozet: { id, tur: 'yarimamul', kod: `YM-DNM-${id}`, ad, onayDurumu: 'aktif', kullanilabilir: true, birim: 'adet' } });

function kur() {
  const bos = { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 50 };
  return sunucuKur(DEPOCU, {
    'GET /stok/konumlar': () => json(200, bos satisfies KonumlarCevabi),
    'GET /stok/mal-kabuller': () => json(200, bos satisfies MalKabullerCevabi),
    'GET /stok/acik-siparis-satirlari': () => json(200, { satirlar: SATIRLAR } satisfies AcikSiparisSatirlariCevabi),
    'GET /stok/malzemeler/41/ozet': () => json(200, ozet(41, 'Deneme braket')),
    'GET /stok/malzemeler/42/ozet': () => json(200, ozet(42, 'Deneme flanş')),
    'GET /cizimler/kucuk-resimler': () => json(200, { resimler: [{ hedefId: 41, belgeId: 3, revizyonId: 9, harf: 'B', kareSayisi: 1, revUyumu: true }] } satisfies KucukResimlerCevabi),
  });
}

async function tablo() {
  const t = await screen.findByRole('table', { name: 'Açık sipariş satırları' });
  await waitFor(() => expect(within(t).getByText('Deneme braket')).toBeTruthy());
  return t;
}
const satiri = (t: HTMLElement, metin: string) => within(t).getByText(metin).closest('tr')!;

describe('mal kabulde sipariş revizyonu, fason rozeti ve malzeme resmi (2872, 2877)', () => {
  it('tablo: revizyon sütunu farkı işaretler; fason dönüşü yalnız iş emirli hizmette, iş emrisiz hizmet "Hizmet"', async () => {
    kur();
    ac('/stok/mal-kabul');
    const t = await tablo();
    expect(within(satiri(t, 'Deneme braket')).getByText('Yürürlükte B')).toBeTruthy();
    expect(within(satiri(t, 'Deneme flanş')).queryByText(/Yürürlükte/)).toBeNull();
    expect(within(satiri(t, 'Deneme kaplama')).getByText('Fason dönüşü')).toBeTruthy();
    expect(within(satiri(t, 'Deneme kalibrasyon')).queryByText('Fason dönüşü')).toBeNull();
    expect(within(satiri(t, 'Deneme kalibrasyon')).getByText('Hizmet')).toBeTruthy();
  });

  it('eski revizyonlu sipariş seçilince satırda revizyon, uyarı ve kartın resmi görünür; bağ kaldırılınca uyarı gider', async () => {
    const istekler = kur();
    ac('/stok/mal-kabul');
    const t = await tablo();
    fireEvent.click(within(satiri(t, 'Deneme braket')).getByRole('button', { name: 'Seç' }));
    const alan = (await screen.findByText(/Sipariş satırı:/)).closest('fieldset')!;
    expect(within(alan).getByText(/Sipariş satırı:/).textContent).toContain('Rev. A');
    expect(within(alan).getByRole('alert').textContent).toMatch(/Sipariş A revizyonuyla verildi; yürürlükteki revizyon B/);
    const resim = await within(alan).findByRole('img', { name: 'Deneme braket' });
    expect(resim.getAttribute('src')).toBe('/api/cizimler/kucuk-resim/9/0');
    expect(istekler.some((i) => i.yol === '/cizimler/kucuk-resimler?hedefModul=malzemeler&idler=41')).toBe(true);
    fireEvent.click(within(alan).getByRole('button', { name: 'Bağı kaldır' }));
    await waitFor(() => expect(screen.queryByText(/revizyonuyla verildi/)).toBeNull());
  });

  it('revizyonu uyan sipariş seçilince revizyon yazılır, uyarı çıkmaz; resmi olmayan kartta resim yok', async () => {
    kur();
    ac('/stok/mal-kabul');
    const t = await tablo();
    fireEvent.click(within(satiri(t, 'Deneme flanş')).getByRole('button', { name: 'Seç' }));
    const alan = (await screen.findByText(/Sipariş satırı:/)).closest('fieldset')!;
    expect(within(alan).getByText(/Sipariş satırı:/).textContent).toContain('Rev. C');
    await waitFor(() => expect(within(alan).queryByRole('alert')).toBeNull());
    expect(within(alan).queryByRole('img')).toBeNull();
  });
});
