import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { AcikSiparisSatiri, AcikSiparisSatirlariCevabi, KonumlarCevabi, MalKabullerCevabi, MalzemeOzetiCevabi } from '#paylasilan/sozlesme/stok.ts';
import { digerBirimler, donusumKurali, kalanMetni, onerilenMiktar, type SiparisDonusumu } from './birim-donusumu.tsx';
import { DEPOCU, ac, json, sunucuKur } from './test-ortak.tsx';
import { bosSatir, satirGovdesi } from './MalKabul.tsx';
import { kabulGovdesi } from './HizliMalKabul.tsx';

// 3332: mal kabulde satın alma kaleminin adet ve kg karşılığı. Sipariş kg, stok adet ise kalan stok birimine çevrilerek önerilir;
// girilen miktarın öbür birimi canlı görünür; dönüşüm bilinmiyorsa öneri boş ve uyarı çıkar. Veriler uydurmadır (ORN-).
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const d = (x: Partial<SiparisDonusumu>): SiparisDonusumu => ({ miktar: '480', kalanMiktar: '480', birim: 'kg', stokBirimi: 'adet', donusum: { siparisKatsayisi: '0.041667', kgBasina: '24', parcaKg: null }, ...x });

describe('birim dönüşümü kuralları', () => {
  it('kg sipariş, adet stok: kalan adede çevrilir, girilen adedin kg karşılığı, kural "1 adet = 24 kg"', () => {
    expect(onerilenMiktar(d({}))).toBe('20');
    expect(onerilenMiktar(d({ kalanMiktar: '500' }))).toBe('21');
    expect(kalanMetni(d({}))).toBe('480 kg ≈ 20 adet');
    expect(digerBirimler(20, d({}))).toEqual(['480 kg']);
    expect(donusumKurali(d({}))).toBe('1 adet = 24 kg');
  });
  it('aynı birim: kalan olduğu gibi, kg karşılığı yanında; kg stokta parça karşılığı', () => {
    const adet = d({ miktar: '20', kalanMiktar: '12.5', birim: 'Adet', donusum: { siparisKatsayisi: '1', kgBasina: '24', parcaKg: null } });
    expect(onerilenMiktar(adet)).toBe('12,5');
    expect(kalanMetni(adet)).toBe('12,5 Adet');
    expect(digerBirimler(10, adet)).toEqual(['240 kg']);
    const kg = d({ miktar: '250', kalanMiktar: '250', birim: 'kg', stokBirimi: 'kg', donusum: { siparisKatsayisi: '1', kgBasina: '1', parcaKg: '12.5' } });
    expect(digerBirimler(250, kg)).toEqual(['≈ 20 parça']);
    expect(donusumKurali(kg)).toBe('1 parça ≈ 12,5 kg');
  });
  it('alış birimi: 3 kutu = 150 adet; dönüşüm yoksa öneri boş', () => {
    const kutu = d({ miktar: '3', kalanMiktar: '3', birim: 'kutu', donusum: { siparisKatsayisi: '50', kgBasina: null, parcaKg: null } });
    expect(onerilenMiktar(kutu)).toBe('150');
    expect(digerBirimler(100, kutu)).toEqual(['2 kutu']);
    expect(donusumKurali(kutu)).toBe('1 kutu = 50 adet');
    expect(onerilenMiktar(d({ donusum: { siparisKatsayisi: null, kgBasina: null, parcaKg: null } }))).toBe('');
  });
});

const satir = (id: number, x: Partial<AcikSiparisSatiri>): AcikSiparisSatiri => ({
  id, siparisNo: `ORN-SA-${id}`, talepNo: `ORN-ST-${id}`, tedarikciAdi: 'ORN Tedarik', malzemeId: id, malzemeTur: 'hammadde', kalemAdi: `ORN kalem ${id}`,
  miktar: '480', kalanMiktar: '480', birim: 'kg', beklenenTeslim: null, uretimEmriId: null, emirNo: null, projeId: null, projeAdi: null,
  isEmriId: null, parcaRevizyonu: null, yururlukRevizyonu: null, revizyonUyusmuyor: null, stokBirimi: 'adet', donusum: null, ...x,
});
const SATIRLAR = [
  satir(51, { kalemAdi: 'ORN-cubuk', donusum: { siparisKatsayisi: '0.041667', kgBasina: '24', parcaKg: null } }),
  satir(52, { kalemAdi: 'ORN-burc', miktar: '10', kalanMiktar: '10' }),
];
const ozet = (id: number, ad: string): MalzemeOzetiCevabi => ({ ozet: { id, tur: 'hammadde', kod: `HM-ORN-${id}`, ad, onayDurumu: 'aktif', kullanilabilir: true, birim: 'adet' } });
function kur() {
  const bos = { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 50 };
  return sunucuKur(DEPOCU, {
    'GET /stok/konumlar': () => json(200, bos satisfies KonumlarCevabi),
    'GET /stok/mal-kabuller': () => json(200, bos satisfies MalKabullerCevabi),
    'GET /stok/acik-siparis-satirlari': () => json(200, { satirlar: SATIRLAR } satisfies AcikSiparisSatirlariCevabi),
    'GET /stok/malzemeler/51/ozet': () => json(200, ozet(51, 'ORN-cubuk')),
    'GET /stok/malzemeler/52/ozet': () => json(200, ozet(52, 'ORN-burc')),
    'GET /cizimler/kucuk-resimler': () => json(200, { resimler: [] }),
  });
}
async function sec(ad: string) {
  const t = await screen.findByRole('table', { name: 'Açık sipariş satırları' });
  await waitFor(() => expect(within(t).getByText(ad)).toBeTruthy());
  fireEvent.click(within(within(t).getByText(ad).closest('tr')!).getByRole('button', { name: 'Seç' }));
  return (await screen.findByText(/Sipariş satırı:/)).closest('fieldset')!;
}

describe('mal kabul ekranında adet ve kg (3332)', () => {
  it('tablo kalanın adet karşılığını gösterir; seçilince miktar adetle dolar, kg karşılığı ve dönüşüm görünür, yazdıkça değişir', async () => {
    kur();
    ac('/stok/mal-kabul');
    const t = await screen.findByRole('table', { name: 'Açık sipariş satırları' });
    await waitFor(() => expect(within(t).getByText('≈ 20 adet').closest('.tc-stok-kalan')!.textContent).toBe('480 kg≈ 20 adet'));
    const alan = await sec('ORN-cubuk');
    const kutu = await within(alan).findByLabelText(/Sayılan miktar/);
    await waitFor(() => expect((kutu as HTMLInputElement).value).toBe('20'));
    const bilgi = within(alan).getByText(/Dönüşüm:/);
    expect(bilgi.closest('[role="status"]')!.textContent).toContain('Sipariş 480 kg ≈ 20 adet · kalan 480 kg ≈ 20 adet');
    expect(bilgi.textContent).toBe('Dönüşüm: 1 adet = 24 kg (malzeme kartından)');
    expect(bilgi.closest('[role="status"]')!.textContent).toContain('Girilen 20 adet = 480 kg');
    fireEvent.change(kutu, { target: { value: '18' } });
    await waitFor(() => expect(within(alan).getByText(/Dönüşüm:/).closest('[role="status"]')!.textContent).toContain('Girilen 18 adet = 432 kg · kalandan 2 adet az'));
  });
  it('3332 b: kg kutusuna yazınca adet, adede yazınca kg hesaplanır; gövdeye stok birimi gider', async () => {
    kur();
    ac('/stok/mal-kabul');
    const alan = await sec('ORN-cubuk');
    const adet = await within(alan).findByLabelText(/Sayılan miktar/) as HTMLInputElement;
    const kg = within(alan).getByLabelText('Ağırlık (kg)') as HTMLInputElement;
    await waitFor(() => expect(kg.value).toBe('480'));
    fireEvent.change(kg, { target: { value: '240' } });
    await waitFor(() => expect(adet.value).toBe('10'));
    expect(kg.value).toBe('240');
    expect(within(alan).getByText('Adet miktarı bundan hesaplandı.')).toBeTruthy();
    fireEvent.change(kg, { target: { value: '250,5' } });
    await waitFor(() => expect(adet.value).toBe('10'));
    expect(kg.value).toBe('250,5');
    expect(within(alan).getByText('≈ 10,438 adet; 10 adet yazıldı, saydığınızı kontrol edin.')).toBeTruthy();
    fireEvent.change(adet, { target: { value: '12' } });
    await waitFor(() => expect(kg.value).toBe('288'));
    expect(within(alan).getByText('Adet miktarından hesaplandı.')).toBeTruthy();
  });
  it('dönüşüm yoksa miktar boş kalır ve uyarı çıkar', async () => {
    kur();
    ac('/stok/mal-kabul');
    const alan = await sec('ORN-burc');
    const kutu = await within(alan).findByLabelText(/Sayılan miktar/);
    expect((kutu as HTMLInputElement).value).toBe('');
    expect(within(alan).queryByLabelText(/Ağırlık|Karşılığı|Parça sayısı/)).toBeNull();
    expect(within(alan).getByText(/dönüşüm hesaplanamaz/).textContent).toContain('kartta birim ağırlığı yok');
  });
  it('3332-2 a: dönüşüm yoksa siparişe teslim kutusu sipariş biriminde istenir', async () => {
    kur();
    ac('/stok/mal-kabul');
    const alan = await sec('ORN-burc');
    const kutu = within(alan).getByLabelText(/Siparişe teslim \(kg\)/) as HTMLInputElement;
    expect(kutu.required).toBe(true);
    fireEvent.change(kutu, { target: { value: '9,5' } });
    expect(kutu.value).toBe('9,5');
  });
  it('3332-2 a: dönüşümlü satırda siparişe teslim kutusu çıkmaz; kg kutusu yazılınca, adet değişince silinir', async () => {
    kur();
    ac('/stok/mal-kabul');
    const alan = await sec('ORN-cubuk');
    expect(within(alan).queryByLabelText(/Siparişe teslim/)).toBeNull();
    const adet = await within(alan).findByLabelText(/Sayılan miktar/) as HTMLInputElement;
    const kg = within(alan).getByLabelText('Ağırlık (kg)') as HTMLInputElement;
    fireEvent.change(kg, { target: { value: '238,5' } });
    await waitFor(() => expect(adet.value).toBe('10'));
    fireEvent.change(adet, { target: { value: '9' } });
    await waitFor(() => expect(kg.value).toBe('216'));
  });
});

describe('gövdede siparişe teslim miktarı (3332-2 a)', () => {
  it('ayrıntılı mal kabul: yazılan sipariş miktarı gider, yoksa alan yoktur', () => {
    const s = { ...bosSatir(), kart: '51', miktar: '10', siparisSatirId: '7' };
    expect(satirGovdesi({ ...s, siparisMiktari: '238,5' })).toMatchObject({ siparisSatirId: 7, miktar: '10', siparisMiktari: '238.5' });
    expect(satirGovdesi(s)).not.toHaveProperty('siparisMiktari');
  });
  it('hızlı mal kabul: siparişli girişte gider, siparişsizde gitmez', () => {
    const b = { malzemeId: 51, ad: 'ORN-cubuk', miktar: '10', parti: '', ambalaj: 'oto' as const, ambalajSayisi: '', siparisSatirId: 7, siparisMiktari: '240' };
    expect(kabulGovdesi(b, null).satirlar[0]).toMatchObject({ siparisSatirId: 7, siparisMiktari: '240' });
    expect(kabulGovdesi({ ...b, siparisSatirId: null }, null).satirlar[0]).not.toHaveProperty('siparisMiktari');
  });
});
