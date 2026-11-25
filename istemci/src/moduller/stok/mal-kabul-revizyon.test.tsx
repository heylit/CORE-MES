import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { KucukResimlerCevabi } from '#paylasilan/sozlesme/belge-merkezi.ts';
import type { AcikSiparisSatiri, AcikSiparisSatirlariCevabi, KonumlarCevabi, MalKabullerCevabi, MalzemeOzetiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { render } from '@testing-library/react';
import { DEPOCU, ac, json, sunucuKur } from './test-ortak.tsx';
import { EslesmeDurumu, bosSatir, siparistenSatir } from './MalKabul.tsx';

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
  satir(43, { kalemAdi: 'Deneme kaplama', malzemeTur: 'hizmet', isEmriId: 7, emirNo: 'UE-DNM-1', parcaRevizyonu: 'B', uygulananMalzeme: { no: 42, kod: 'YM-DNM-42', ad: 'Deneme flanş' } }),
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
    expect(within(alan).getByText(/Sipariş satırı:/).textContent).toContain('Rev A');
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
    expect(within(alan).getByText(/Sipariş satırı:/).textContent).toContain('Rev C');
    await waitFor(() => expect(within(alan).queryByRole('alert')).toBeNull());
    expect(within(alan).queryByRole('img')).toBeNull();
  });

  // 3712: hizmet satırında işlenen parça listede ve seçilen satırda görünür; dönen kart o parçayla gelir, eşleşmede onay istenmez.
  it('fason hizmet satırı: listede işlenen malzeme, seçilince blok (Rev, kalan, emir) ve eşleşen dönen kart; uyarı yok', async () => {
    kur();
    ac('/stok/mal-kabul');
    const t = await tablo();
    expect(within(satiri(t, 'Deneme kaplama')).getByText('YM-DNM-42 · Deneme flanş')).toBeTruthy();
    expect(within(satiri(t, 'Deneme kalibrasyon')).queryByText(/YM-DNM/)).toBeNull();
    fireEvent.click(within(satiri(t, 'Deneme kaplama')).getByRole('button', { name: 'Seç' }));
    const alan = (await screen.findByText(/Sipariş satırı:/)).closest('fieldset')!;
    const blok = alan.querySelector('.tc-stok-islenen')!;
    expect(blok.textContent).toBe('İşlenen malzemeYM-DNM-42 · Deneme flanşRev BKalan 4 adetEmir UE-DNM-1');
    expect(within(alan).queryByRole('alert')).toBeNull();
    expect(within(alan).getByRole('status').textContent).toContain('eşleşiyor');
    expect((screen.getByRole('button', { name: 'Kabul et' }) as HTMLButtonElement).disabled).toBe(false);
  });
});

// 3712: üç durum: eşleşiyor (yeşil), farklı kart (uyarı ve onay düğmesi), malzeme dönmedi (işlenen parça firmada görünür kalır).
describe('dönen kalem eşleşme durumları (3712)', () => {
  const s0 = siparistenSatir(bosSatir(), satir(43, { malzemeTur: 'hizmet', isEmriId: 7, uygulananMalzeme: { no: 42, kod: 'YM-DNM-42', ad: 'Deneme flanş' } }));
  const goster = (s: typeof s0) => render(<EslesmeDurumu s={s} degistir={() => undefined} donen="YM-DNM-57 · Başka" />).container;
  it('eşleşiyor: yeşil durum; farklı kart: uyarı ve onay düğmesi, onaylanınca düğme kalkar; malzeme dönmedi: gri not', () => {
    expect(goster(s0).querySelector('.tc-stok-bilgi-iyi')?.textContent).toBe('Dönen kart işlenen malzemeyle eşleşiyor.');
    cleanup();
    const farkli = goster({ ...s0, kart: '57' });
    expect(farkli.querySelector('.tc-stok-bilgi-uyari')?.textContent).toContain('Farklı kartla kabul et');
    cleanup();
    const onayli = goster({ ...s0, kart: '57', farkliOnay: '57' });
    expect(onayli.textContent).toContain('Farklı kartla kabul onaylandı.');
    expect(onayli.querySelector('button')?.textContent).toBe('Onayı kaldır');
    cleanup();
    expect(goster({ ...s0, donus: 'hizmet', kart: '43' }).querySelector('.tc-stok-bilgi-pasif')?.textContent).toBe('Malzeme dönmedi: YM-DNM-42 · Deneme flanş firmada görünür kalır.');
  });
});
