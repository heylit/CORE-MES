import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { BakiyeSatiri, IstasyonSepetiCevabi, KodCozCevabi, MalzemeIstegi, OkutCozCevabi, Teslim, TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { DEPOCU, json, type Istek } from './test-ortak.tsx';
import { OkutYonlendir } from './OkutYonlendir.tsx';
import { ustEylemler } from './ust-eylem.tsx';

// Okut sayfasının paneldeki yeri (kart #95, soru 89, 90 a, 93 a, 95 a, 96, 98 a): okutma sonucu, Mal kabul, Sevk, depo sepeti,
// istasyondan iste, okutarak al ve itiraz.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const OPERATOR: Kullanici = { id: 9, ad: 'Deneme Operatör', islemler: ['stok.istek'] };
const DEPO: Kullanici = { ...DEPOCU, islemler: [...DEPOCU.islemler, 'stok.istek'] };
const BAKIYE = {
  id: 11, malzemeId: 901, malzemeAd: 'Eldiven', konumId: 3, konumKod: 'A-01-02', partiId: 4, partiEtiketi: 'TP-1',
  miktar: '3.000', ilkGiris: '2026-10-01T08:00:00+03:00', ambalaj: null, statuId: null,
} satisfies BakiyeSatiri;
const OZET = { id: 901, tur: 'sarf', kod: 'SR-001', ad: 'Eldiven', onayDurumu: 'aktif', kullanilabilir: true, birim: 'adet' } as const;
const MLZ = { tur: 'malzeme', ozet: OZET, toplam: '3', bakiyeler: [BAKIYE] } as const;
// Okutma cevabının taşıdığı tam stok çözümü (tek istek); örnek, ekranın okuduğu alanlarla sınırlı.
const stokCozumu = (c: typeof MLZ | typeof LOT): KodCozCevabi => c as unknown as KodCozCevabi;
const LOT = { tur: 'lot', parti: { id: 4, lotNo: 'LT-000123', etiket: 'LT-000123' }, ozet: { ...OZET, tur: 'hammadde', ad: 'Deneme sac' }, toplam: '3', bakiyeler: [BAKIYE] } as const;
const KNM = { tur: 'konum', konum: { id: 7, kod: 'A-02-01', tur: 'raf_gozu', ad: null, depoId: 1, depoKod: 'ANA', rafId: 1, bolmeNo: 2, katNo: 1, sonSayim: null, aktif: true, satirSayisi: 0, haritaGozId: null, haritaAlanId: null, surum: 1 }, bakiyeler: [] };
const PANEL_MLZ = (tur: 'sarf' | 'mamul' | 'hammadde', ek: Partial<Extract<OkutCozCevabi, { tur: 'malzeme' }>> = {}): OkutCozCevabi => ({
  tur: 'malzeme', malzeme: { id: 901, kod: 'SR-001', ad: 'Eldiven', birim: 'adet', tur }, parti: null, yerler: [], digerIstasyonlar: [], ...ek,
});
const KUTU: TeslimKutusuCevabi = {
  gelenler: [], gonderdiklerim: [], isteklerim: [], bendenIstenenler: [], okutarakAlinanlar: [],
  istasyonlar: [{ id: 2, kod: 'F2', ad: 'Freze 2' }],
  hedefIstasyonlar: [{ id: 1, kod: 'T1', ad: 'Torna 1' }, { id: 2, kod: 'F2', ad: 'Freze 2' }],
  depoKonumlari: [], araAlanlar: [], buradakiIstasyonId: 2, harita: null, zemin: null,
};
const SIPARIS = (id: number, malzemeId: number) => ({ id, siparisNo: `SA-${id}`, talepNo: `TL-${id}`, tedarikciAdi: 'Deneme Tedarikçi', malzemeId, malzemeTur: 'sarf', kalemAdi: 'Eldiven', miktar: '20', kalanMiktar: '20', birim: 'adet', beklenenTeslim: null });
const BELGE = { id: 12, no: 'MK-000012', tur: 'satin_alma', irsaliyeNo: null, zaman: '2026-10-07T10:00:00+03:00', kisiAd: 'D', satirSayisi: 1, farkSayisi: 0, duzeltilenId: null, duzeltenId: null };

type Isleyici = (adres: URL, govde: unknown) => Response;
// Yol, sorgusuz eşleşir; işleyici sorguyu adresten okur. Bilinmeyen yol 404.
function ciz(kullanici: Kullanici, yollar: Record<string, Isleyici>, kutu: TeslimKutusuCevabi = KUTU, baslangic = '/') {
  const istekler: Istek[] = [];
  const tum: Record<string, Isleyici> = {
    'GET /stok/teslim-kutusu': () => json(200, kutu),
    'GET /stok/teslim-kutusu/sayac': () => json(200, { gelen: 0 }),
    'GET /stok/teslim-kutusu/kisi-kodu': () => json(200, { kod: 'KSI-9-x', gecerlilikSonu: '2026-10-20T10:02:00+03:00' }),
    'GET /stok/teslim-kutusu/is-malzemeleri': () => json(200, { isler: [] }),
    'GET /stok/teslim-kutusu/sepet/gelecek': () => json(200, { satirlar: [] }),
    'GET /stok/teslim-kutusu/sepet': () => json(200, { istasyon: { id: 2, kod: 'F2', ad: 'Freze 2' }, emirler: [], satirlar: [] }),
    'GET /stok/statuler': () => json(200, { statuler: [] }),
    ...yollar,
  };
  vi.stubGlobal('fetch', vi.fn(async (adres: string, secenek?: RequestInit) => {
    const url = new URL(adres.replace('/api', ''), 'http://yerel');
    const yontem = secenek?.method ?? 'GET';
    const govde = secenek?.body ? JSON.parse(String(secenek.body)) : undefined;
    istekler.push({ yontem, yol: `${url.pathname}${url.search}`, govde });
    if (url.pathname === '/oturum') return json(200, { kullanici });
    const isle = tum[`${yontem} ${url.pathname}`];
    return isle ? isle(url, govde) : json(404, { kod: 'BULUNAMADI', mesaj: 'Adres bulunamadı.' });
  }));
  const Dugme = ustEylemler[0]!.dugme;
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={istemci}><BildirimSaglayici>
      <MemoryRouter initialEntries={[baslangic]}>
        <Dugme />
        <Routes>
          <Route path="/stok/okut" element={<OkutYonlendir />} />
          <Route path="*" element={<p>Sayfa</p>} />
        </Routes>
      </MemoryRouter>
    </BildirimSaglayici></QueryClientProvider>,
  );
  return istekler;
}

async function panelAc() {
  fireEvent.click(await screen.findByRole('button', { name: /Malzeme ve teslim/ }));
  return screen.findByRole('dialog', { name: 'Malzeme · Teslim' });
}
async function okut(kap: HTMLElement, kod: string) {
  fireEvent.change(within(kap).getAllByLabelText(/^Kod/)[0]!, { target: { value: kod } });
  fireEvent.click(within(kap).getAllByRole('button', { name: 'Bul' })[0]!);
}
const panelKodu = (kodlar: Record<string, OkutCozCevabi>): Isleyici => (u) => {
  const kod = u.searchParams.get('kod')!;
  return json(200, kodlar[kod] ?? { tur: 'bilinmiyor', kod });
};

describe('Okutma sonucu', () => {
  it('stok okuyan gözleri tek istekle görür (655); depo sepetine ekler ve son eklemeyi geri alır (soru 93 a, 95 a)', async () => {
    const istekler = ciz(DEPO, {
      'GET /stok/teslim-kutusu/kod-coz': panelKodu({ 'MLZ:901': PANEL_MLZ('sarf', { stok: stokCozumu(MLZ) }) }),
      'POST /stok/sepet/satir-ekle': () => json(200, { satirlar: [{ id: 5, malzemeId: 901, malzemeAd: 'Eldiven', malzemeKod: 'SR-001', kaynakKonumId: 3, kaynakKonumKod: 'A-01-02', partiId: 4, partiEtiketi: 'TP-1', miktar: '8', mevcut: '3', eklenme: '2026-10-07T10:00:00+03:00' }] }),
      'POST /stok/sepet/satirlar/5/degistir': () => json(200, { satirlar: [] }),
    });
    const panel = await panelAc();
    await okut(panel, 'MLZ:901');
    const sonuc = await within(panel).findByRole('region', { name: 'Okutma sonucu' });
    expect(await within(sonuc).findByRole('table', { name: 'Malzemenin gözleri' })).toBeTruthy();
    expect(istekler.filter((i) => i.yol.startsWith('/stok/kod-coz')).map((i) => i.yol)).toEqual([]);
    fireEvent.click(within(sonuc).getByRole('button', { name: 'Depo sepetine ekle' }));
    const pencere = await screen.findByRole('dialog', { name: /Sepete ekle: Eldiven/ });
    fireEvent.click(within(pencere).getByLabelText(/A-01-02/));
    fireEvent.click(within(pencere).getByRole('button', { name: '5' }));
    fireEvent.click(within(pencere).getByRole('button', { name: 'Sepete ekle' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/sepet/satir-ekle')?.govde).toMatchObject({ malzemeId: 901, miktar: '5', kaynakKonumId: 3, partiId: 4 }));
    fireEvent.click(await within(sonuc).findByRole('button', { name: 'Geri al' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/sepet/satirlar/5/degistir')?.govde).toEqual({ miktar: '3' }));
  });

  it('okutulan lotta en eski giriş seçeneği yoktur; lotun gözü seçili gelir', async () => {
    const istekler = ciz(DEPO, {
      'GET /stok/teslim-kutusu/kod-coz': panelKodu({ 'LOT:LT-000123': PANEL_MLZ('hammadde', { parti: { id: 4, etiket: 'LT-000123', uretimEmriId: null }, stok: stokCozumu(LOT) }) }),
      'POST /stok/sepet/satir-ekle': () => json(200, { satirlar: [] }),
    });
    const panel = await panelAc();
    await okut(panel, 'LOT:LT-000123');
    fireEvent.click(await within(panel).findByRole('button', { name: 'Depo sepetine ekle' }));
    const pencere = await screen.findByRole('dialog', { name: /Sepete ekle: Deneme sac · LT-000123/ });
    expect(within(pencere).queryByText('Otomatik')).toBeNull();
    fireEvent.click(within(pencere).getByRole('button', { name: 'Sepete ekle' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/sepet/satir-ekle')?.govde).toMatchObject({ malzemeId: 901, kaynakKonumId: 3, partiId: 4 }));
  });

  it('614 1a tek kart: refakat kartında ana eylem tek düğmedir, akış başlamaz; öteki işler Başka işlem altındadır', async () => {
    const refakat = {
      id: 12, qr: 'RP:12', etiket: 'UE-000001-P1', uretimEmriId: 1, emirNo: 'UE-000001', sira: 1, malzemeId: 901, malzemeKod: 'SR-001', malzemeAd: 'Eldiven', birim: 'adet',
      partiId: 4, lotNo: 'LT-000123', tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, verilen: '5', durum: 'acik' as const, surum: 1, kayitZamani: '2026-10-22T10:00:00+03:00', lotaBaglanmaZamani: null,
      ust: null, birlestigi: null, birlesmeZamani: null,
    };
    ciz(DEPO, { 'GET /stok/teslim-kutusu/kod-coz': panelKodu({ 'RP:12': PANEL_MLZ('hammadde', { parti: { id: 4, etiket: 'UE-000001-P1', uretimEmriId: null }, refakat, gelenler: [], kartSatirlari: [], anaEylem: 'isi-ac' }) }) });
    const panel = await panelAc();
    await okut(panel, 'RP:12');
    const sonuc = await within(panel).findByRole('region', { name: 'Okutma sonucu' });
    expect(within(sonuc).getAllByRole('button', { name: 'İş emrini aç' })).toHaveLength(1);
    expect(within(sonuc).queryByRole('button', { name: 'Mal kabul' })).toBeNull();
    expect(within(panel).queryByRole('list', { name: 'Adımlar' })).toBeNull();
    fireEvent.click(within(sonuc).getByRole('button', { name: 'Başka işlem' }));
    expect(within(sonuc).getByRole('button', { name: 'Mal kabul' })).toBeTruthy();
    expect(within(sonuc).getAllByRole('button', { name: 'İş emrini aç' })).toHaveLength(1);
  });

  it('raf etiketi gözleri düğme olarak verir, seçilen göz kendi etiketiyle çözülür; eski refakat kartı uyarı verir', async () => {
    const goz = (konumId: number, kod: string) => ({ konumId, kod, ad: null, tur: 'raf_gozu' as const, istasyonId: null });
    const istekler = ciz(DEPO, { 'GET /stok/teslim-kutusu/kod-coz': panelKodu({
      'RAF:A1': { tur: 'raf', raf: { id: 1, kod: 'A1' }, gozler: [goz(3, 'A1-01-01'), goz(4, 'A1-02-01')] },
      'UE:7': { tur: 'eski-kart', kod: 'UE:7', uretimEmriId: 7 },
    }) });
    const panel = await panelAc();
    await okut(panel, 'RAF:A1');
    expect(await within(panel).findByText('Raf A1: gözü seç ya da gözün etiketini okut.')).toBeTruthy();
    fireEvent.click(within(within(panel).getByRole('list', { name: 'Raf A1 gözleri' })).getByRole('button', { name: 'A1-02-01' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === `/stok/teslim-kutusu/kod-coz?kod=${encodeURIComponent('LOC:A1-02-01')}`)).toBe(true));
    await okut(panel, 'UE:7');
    expect(await within(panel).findByText('Eski refakat kartı; teslimde geçmez. Depodan bu emrin refakat kartını isteyin.')).toBeTruthy();
  });

  it('tanınmayan kodu söyler, sonuç kartı açmaz', async () => {
    ciz(DEPO, { 'GET /stok/teslim-kutusu/kod-coz': panelKodu({}) });
    const panel = await panelAc();
    await okut(panel, 'XYZ');
    expect(await within(panel).findByText('Kod tanınmadı: XYZ')).toBeTruthy();
    expect(within(panel).queryByRole('region', { name: 'Okutma sonucu' })).toBeNull();
  });

  it('yalnız istek yetkisi olan gözleri görmez, stok çözümü istenmez; başka istasyondaki miktarı görür, okutarak alır (soru 93 a, 96 b)', async () => {
    const istekler = ciz(OPERATOR, {
      'GET /stok/teslim-kutusu/kod-coz': panelKodu({
        'MLZ:901': PANEL_MLZ('hammadde', { digerIstasyonlar: [{ istasyonId: 1, kod: 'T1', ad: 'Torna 1', miktar: '6.000' }] }),
        'LOC-T1': { tur: 'yer', yer: { konumId: 20, kod: 'T1', ad: 'Torna 1', tur: 'istasyon', istasyonId: 1 }, satirlar: null },
      }),
      'GET /stok/teslim-kutusu/okutarak-al': (u) => json(200, {
        malzeme: { id: 901, kod: 'SR-001', ad: 'Eldiven', birim: 'adet' }, yer: { konumId: 20, istasyonId: 1, kod: u.searchParams.get('yerKodu'), ad: 'Torna 1' },
        satirlar: [{ partiId: 4, partiEtiketi: 'TP-1', statuId: null, uretimEmriId: null, miktar: '6.000' }],
      }),
      'POST /stok/teslim-kutusu/okutarak-al': () => json(200, { teslim: {} }),
    });
    const panel = await panelAc();
    await okut(panel, 'MLZ:901');
    const sonuc = await within(panel).findByRole('region', { name: 'Okutma sonucu' });
    expect(within(within(sonuc).getByRole('list', { name: 'Başka istasyonlarda' })).getByText('Torna 1 (T1)')).toBeTruthy();
    expect(within(sonuc).queryByRole('button', { name: 'Mal kabul' })).toBeNull();
    expect(within(sonuc).queryByRole('button', { name: 'Depo sepetine ekle' })).toBeNull();
    expect(istekler.filter((i) => i.yol.startsWith('/stok/kod-coz')).map((i) => i.yol)).toEqual([]);
    fireEvent.click(within(sonuc).getByRole('button', { name: 'Okutarak al' }));
    expect(within(panel).getByRole('tab', { name: 'Malzeme iste' }).getAttribute('aria-selected')).toBe('true');
    const okutulanlar = within(panel).getByRole('list', { name: 'Okutulanlar' });
    expect(within(okutulanlar).getByText('MLZ:901')).toBeTruthy();
    fireEvent.click(within(okutulanlar).getByRole('button', { name: 'Yeri okut' }));
    await okut(await screen.findByRole('dialog', { name: 'Aldığın yeri okut' }), 'LOC-T1');
    fireEvent.change(await within(panel).findByLabelText(/^Alınan miktar/), { target: { value: '2' } });
    fireEvent.click(within(panel).getAllByRole('button', { name: 'Okutarak al' }).at(-1)!);
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({
      kod: 'MLZ:901', yerKodu: 'LOC-T1', istasyonId: 2, partiId: 4, statuId: null, miktar: '2', uretimEmriId: null,
    }));
  });
});

describe('Teslim al: Mal kabul', () => {
  const kabulBaslat = async (yollar: Record<string, Isleyici>) => {
    const istekler = ciz(DEPO, { 'GET /stok/teslim-kutusu/kod-coz': panelKodu({ 'MLZ:901': PANEL_MLZ('sarf') }), ...yollar });
    const panel = await panelAc();
    await okut(panel, 'MLZ:901');
    fireEvent.click(await within(panel).findByRole('button', { name: 'Mal kabul' }));
    fireEvent.change(await within(panel).findByLabelText(/^Sayılan miktar/), { target: { value: '12' } });
    return { istekler, panel };
  };

  it('ambalaj seçilir, Rafı okut bekler; okutulan konuma ambalajla birlikte girer', async () => {
    let n = 0;
    const { istekler, panel } = await kabulBaslat({
      'GET /stok/kod-coz': () => json(200, n++ === 0 ? MLZ : KNM),
      'GET /stok/malzemeler/901/goz-onerisi': () => json(200, { oneri: { konumId: 7, kod: 'A-02-01' } }),
      'GET /stok/acik-siparis-satirlari': () => json(200, { satirlar: [SIPARIS(31, 901)] }),
      'POST /stok/mal-kabul': () => json(200, { belge: BELGE, hareketIdler: [1] }),
    });
    fireEvent.click(within(panel).getByRole('button', { name: /Karton koli/ }));
    fireEvent.change(within(panel).getByLabelText('Ambalaj sayısı'), { target: { value: '2' } });
    await waitFor(() => expect(within(panel).getByRole('button', { name: 'Rafı okut' })).toHaveProperty('disabled', false));
    fireEvent.click(within(panel).getByRole('button', { name: 'Rafı okut' }));
    const raf = await screen.findByRole('dialog', { name: 'Rafı okut' });
    expect(await within(raf).findByRole('button', { name: 'Önerilen: A-02-01' })).toBeTruthy();
    await okut(raf, 'LOC:A-02-01');
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/mal-kabul')?.govde).toMatchObject({
      tur: 'satin_alma', satirlar: [{ malzemeId: 901, miktar: '12', konumId: 7, siparisSatirId: 31, ambalaj: { tur: 'koli', olcu: 'm', adet: 2 } }],
    }));
    expect(await within(panel).findByText(/rafa girdi \(MK-000012\)/)).toBeTruthy();
  });

  it('açık siparişi olmayan malzeme diğer girişi olarak alınır, sipariş satırı gönderilmez (soru 91 a)', async () => {
    const { istekler, panel } = await kabulBaslat({
      'GET /stok/kod-coz': () => json(200, MLZ),
      'GET /stok/acik-siparis-satirlari': () => json(200, { satirlar: [SIPARIS(32, 555)] }),
      'POST /stok/mal-kabul': () => json(200, { belge: { ...BELGE, tur: 'diger' }, hareketIdler: [1] }),
    });
    expect(await within(panel).findByText(/açık siparişi yok/)).toBeTruthy();
    fireEvent.click(within(panel).getByRole('button', { name: 'Mal kabul alanına teslim al' }));
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/mal-kabul')).toBe(true));
    const govde = istekler.find((i) => i.yol === '/stok/mal-kabul')!.govde as { tur: string; satirlar: Record<string, unknown>[] };
    expect(govde.tur).toBe('diger');
    expect(govde.satirlar[0]).not.toHaveProperty('siparisSatirId');
  });

  it('birden çok açık sipariş satırında seçim yapılmadan gönderilmez; seçilen satırla satın alma teslimi yazılır', async () => {
    const { istekler, panel } = await kabulBaslat({
      'GET /stok/kod-coz': () => json(200, MLZ),
      'GET /stok/acik-siparis-satirlari': () => json(200, { satirlar: [SIPARIS(41, 901), SIPARIS(42, 901), { ...SIPARIS(43, 901), malzemeTur: 'hizmet' }] }),
      'POST /stok/mal-kabul': () => json(200, { belge: BELGE, hareketIdler: [1] }),
    });
    const secim = await within(panel).findByLabelText(/^Sipariş/);
    expect(within(secim).queryByRole('option', { name: /SA-43/ })).toBeNull();
    const dugme = within(panel).getByRole('button', { name: 'Mal kabul alanına teslim al' });
    expect(dugme).toHaveProperty('disabled', true);
    fireEvent.change(secim, { target: { value: '42' } });
    fireEvent.click(dugme);
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/mal-kabul')?.govde).toMatchObject({ tur: 'satin_alma', satirlar: [{ malzemeId: 901, miktar: '12', siparisSatirId: 42 }] }));
  });
});

describe('Teslim et: Sevk', () => {
  it('siparişsiz malzemede okutulan lot o lottan stok çıkışıyla düşülür (soru 98 a)', async () => {
    const istekler = ciz(DEPO, {
      'GET /stok/teslim-kutusu/kod-coz': panelKodu({ 'LOT:LT-000123': PANEL_MLZ('hammadde', { parti: { id: 4, etiket: 'LT-000123', uretimEmriId: null } }) }),
      'GET /stok/kod-coz': () => json(200, LOT),
      'POST /stok/cikis': () => json(200, { hareketIdler: [77] }),
    });
    const panel = await panelAc();
    await okut(panel, 'LOT:LT-000123');
    fireEvent.click(await within(panel).findByRole('button', { name: 'Sevk' }));
    fireEvent.click(await within(panel).findByRole('button', { name: 'Stoktan düş' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/cikis')?.govde).toMatchObject({ malzemeId: 901, konumId: 3, partiId: 4, cikisNedeni: 'sevk' }));
    expect(await within(panel).findByText(/LT-000123 × 1 stoktan düşüldü/)).toBeTruthy();
  });

  it('mamulde stoktan elle sevk yok; sevkler emirden okunur (soru 92 b, 97 a)', async () => {
    const istekler = ciz({ ...DEPO, islemler: [...DEPO.islemler, 'sevkiyat.oku'] }, {
      'GET /stok/teslim-kutusu/kod-coz': panelKodu({ 'LOT:LT-9': PANEL_MLZ('mamul', { parti: { id: 9, etiket: 'LT-9', uretimEmriId: 3 } }) }),
      'GET /stok/kod-coz': () => json(200, { ...LOT, ozet: { ...LOT.ozet, tur: 'mamul' } }),
      'GET /sevkiyat/urun-sevkleri': () => json(200, { sevkler: [] }),
    });
    const panel = await panelAc();
    await okut(panel, 'LOT:LT-9');
    fireEvent.click(await within(panel).findByRole('button', { name: 'Sevk' }));
    expect(await within(panel).findByText('Bu ürünün açık sevki yok.')).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/sevkiyat/urun-sevkleri?uretimEmriId=3')).toBe(true);
    expect(within(panel).queryByRole('button', { name: 'Stoktan düş' })).toBeNull();
    expect(within(panel).getByText(/stoktan elle sevk edilmez/)).toBeTruthy();
  });
});

const istek = (ek: Partial<MalzemeIstegi> = {}): MalzemeIstegi => ({
  id: 3, no: 'MI-000003', kaynakKimligi: 'k3', malzemeId: 901, malzemeAd: 'Eldiven', miktar: '4.000', karsilanan: null, istasyonId: 1, istasyonAd: 'Torna 1',
  uretimEmriId: null, aciklama: null, durum: 'acik', acilis: '2026-10-14T08:00:00+03:00', guncelleme: '2026-10-14T08:00:00+03:00', kisiAd: 'Deneme İsteyen', kapatanKisiAd: null, surum: 2,
  toplamaId: null, toplamaNo: null, kaynakIstasyonId: 2, kaynakIstasyonAd: 'Freze 2', ...ek,
});
const SEPET: IstasyonSepetiCevabi = {
  istasyon: { id: 2, kod: 'F2', ad: 'Freze 2' }, emirler: [],
  satirlar: [
    { malzemeId: 901, kod: 'SR-001', ad: 'Eldiven', partiId: 4, partiEtiketi: 'TP-4', statuId: 7, miktar: '5.000', yolda: '0', uretimEmriId: null, getiren: 'Deneme Usta', gelis: null, koken: 'uretim', sonraki: null, sonrakiYok: 'rota-disi' },
    { malzemeId: 902, kod: 'HM-2', ad: 'Deneme cubuk', partiId: 8, partiEtiketi: 'LT-8', statuId: null, miktar: '6.000', yolda: '0', uretimEmriId: null, getiren: 'Deneme Depocu', gelis: null, koken: 'teslim', sonraki: null, sonrakiYok: 'rota-disi' },
  ],
};

describe('Teslim et: istasyonumdan istenenler ve okutarak alınanlar (soru 96)', () => {
  it('istenen kaynak istasyonun sepetindeki partiyle kabul edilir; red nedensiz gönderilmez', async () => {
    const istekler = ciz(OPERATOR, {
      'GET /stok/teslim-kutusu/sepet': () => json(200, SEPET),
      'POST /stok/malzeme-istekleri/3/kabul-et': () => json(200, { istek: istek() }),
      'POST /stok/malzeme-istekleri/3/reddet': () => json(200, { istek: istek() }),
    }, { ...KUTU, bendenIstenenler: [istek()] });
    const panel = await panelAc();
    fireEvent.click(within(panel).getByRole('tab', { name: 'Teslim et' }));
    const satir = within(await within(panel).findByRole('list', { name: 'Benden istenenler' })).getAllByRole('listitem')[0]!;
    expect(within(satir).getByText(/Freze 2 → Torna 1 · Deneme İsteyen/)).toBeTruthy();
    fireEvent.change(await within(satir).findByLabelText('Gönderilen miktar'), { target: { value: '3' } });
    fireEvent.click(within(satir).getByRole('button', { name: 'Kabul et' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/malzeme-istekleri/3/kabul-et')?.govde).toMatchObject({ surum: 2, miktar: '3', partiId: 4, statuId: 7 }));
    fireEvent.click(within(satir).getByRole('button', { name: 'Reddet' }));
    expect(within(satir).getByRole('button', { name: 'Reddi gönder' })).toHaveProperty('disabled', true);
    fireEvent.change(within(satir).getByLabelText('Red nedeni'), { target: { value: 'Bu emre lazım' } });
    fireEvent.click(within(satir).getByRole('button', { name: 'Reddi gönder' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/malzeme-istekleri/3/reddet')?.govde).toEqual({ surum: 2, neden: 'Bu emre lazım' }));
  });

  it('okutarak alınana süre içinde nedeniyle itiraz edilir; itiraz edilmiş satırda düğme yok', async () => {
    const t: Teslim = {
      id: 51, no: 'TS-000051', malzemeId: 901, malzemeAd: 'Eldiven', miktar: '2.000', partiId: 4, statuId: null,
      kaynak: { konumId: 21, kod: 'F2', ad: 'Freze 2', istasyonId: 2 }, hedef: { konumId: 20, kod: 'T1', ad: 'Torna 1', istasyonId: 1 }, uretimEmriId: null, istekId: null, aciklama: null,
      durum: 'teslim', alinan: '2.000', redNedeni: null, gonderenAd: 'Deneme Alan', kapatanAd: 'Deneme Alan', aliciAd: null, gonderim: '2026-10-14T08:00:00+03:00', kapanis: '2026-10-14T08:00:00+03:00', surum: 1,
      okutarak: true, itirazSonu: '2026-10-14T16:00:00+03:00', itiraz: null,
    };
    const istekler = ciz(OPERATOR, { 'POST /stok/teslimler/51/itiraz': () => json(200, { teslim: t }) }, {
      ...KUTU, okutarakAlinanlar: [t, { ...t, id: 52, no: 'TS-000052', itiraz: { neden: 'Habersiz', kisiAd: 'Deneme Usta', zaman: '2026-10-14T09:00:00+03:00', iadeTeslimId: 60 } }],
    });
    const panel = await panelAc();
    fireEvent.click(within(panel).getByRole('tab', { name: 'Teslim et' }));
    const [acik, itirazli] = within(await within(panel).findByRole('list', { name: 'Okutarak alınanlar' })).getAllByRole('listitem');
    expect(within(itirazli!).getByText(/İtiraz: Habersiz · Deneme Usta · iade teslimi açıldı/)).toBeTruthy();
    expect(within(itirazli!).queryByRole('button', { name: 'İtiraz et' })).toBeNull();
    fireEvent.click(within(acik!).getByRole('button', { name: 'İtiraz et' }));
    fireEvent.change(within(acik!).getByLabelText('İtiraz nedeni'), { target: { value: 'Bize lazımdı' } });
    fireEvent.click(within(acik!).getByRole('button', { name: 'İtirazı gönder' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/teslimler/51/itiraz')?.govde).toEqual({ surum: 1, neden: 'Bize lazımdı' }));
  });
});

describe('Sepet süzgeçleri (soru 89, 95 a)', () => {
  it('Üretilen ve Teslim alınan satırın kökenine göre süzer; depo sepeti stok taşıma yetkisi olmayana görünmez', async () => {
    const istekler = ciz(OPERATOR, { 'GET /stok/teslim-kutusu/sepet': () => json(200, SEPET) });
    const panel = await panelAc();
    fireEvent.click(within(panel).getByRole('tab', { name: 'Sepet' }));
    const liste = await within(panel).findByRole('list', { name: 'Freze 2 sepeti' });
    expect(within(liste).getAllByRole('listitem')).toHaveLength(2);
    fireEvent.click(within(panel).getByRole('button', { name: 'Üretilen' }));
    expect(within(within(panel).getByRole('list', { name: 'Freze 2 sepeti' })).getAllByRole('listitem').map((l) => l.textContent)).toEqual([expect.stringMatching(/Eldiven/)]);
    fireEvent.click(within(panel).getByRole('button', { name: 'Teslim alınan' }));
    expect(within(within(panel).getByRole('list', { name: 'Freze 2 sepeti' })).getAllByRole('listitem').map((l) => l.textContent)).toEqual([expect.stringMatching(/Deneme cubuk/)]);
    // Herkese sepet (Soru 133): operatör de kendi sepetini görür; açılmadan okunmaz.
    expect(within(panel).getByRole('button', { name: 'Sepetim' })).toBeTruthy();
    expect(istekler.some((i) => i.yol === '/stok/sepet')).toBe(false);
  });

  it('eski Okut adresi paneli depo sepetinde açar; satır kaldırılır, hepsi bir yere taşınır (soru 90 a)', async () => {
    const SATIR = { id: 5, malzemeId: 901, malzemeAd: 'Eldiven', malzemeKod: 'SR-001', kaynakKonumId: 3, kaynakKonumKod: 'A-01-02', partiId: 4, partiEtiketi: 'TP-1', miktar: '2', mevcut: '3', eklenme: '2026-10-07T10:00:00+03:00' };
    const istekler = ciz(DEPO, {
      'GET /stok/sepet': () => json(200, { satirlar: [SATIR] }),
      'POST /stok/sepet/satirlar/5/sil': () => json(200, { satirlar: [] }),
    }, KUTU, '/stok/okut?mod=sepet');
    const panel = await screen.findByRole('dialog', { name: 'Malzeme · Teslim' });
    expect(await screen.findByText('Sayfa')).toBeTruthy();
    expect(within(panel).getByRole('tab', { name: 'Sepet' }).getAttribute('aria-selected')).toBe('true');
    // Sepet sekmesi "Sayfa" yazısından sonra yüklenebilir (CI'da bir kez düştü); düğme beklenir.
    expect((await within(panel).findByRole('button', { name: 'Sepetim' })).getAttribute('aria-pressed')).toBe('true');
    const satir = within(await within(panel).findByRole('list', { name: 'Sepetim' })).getAllByRole('listitem')[0]!;
    expect(within(satir).getByText(/A-01-02 · TP-1/)).toBeTruthy();
    expect(within(panel).getByRole('button', { name: 'Hepsini taşı' })).toHaveProperty('disabled', true);
    fireEvent.click(within(satir).getByRole('button', { name: 'Kaldır' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/stok/sepet/satirlar/5/sil')).toBe(true));
  });
});

describe('Malzeme iste: kaynak (soru 96 a)', () => {
  it('malzeme bir istasyondaysa oradan istenir; istasyondan istekte teslim yeri zorunludur', async () => {
    const istekler = ciz(OPERATOR, {
      'GET /stok/istek-malzemeleri': () => json(200, { malzemeler: [{ id: 901, kod: 'SR-001', ad: 'Eldiven', birim: 'adet', kullanilabilir: '0', statuler: [] }] }),
      'GET /stok/teslim-kutusu/malzeme-yerleri': () => json(200, { depo: '0.000', istasyonlar: [
        { istasyonId: 1, kod: 'T1', ad: 'Torna 1', statuId: null, miktar: '6.000' }, { istasyonId: 1, kod: 'T1', ad: 'Torna 1', statuId: 7, miktar: '1.000' },
      ] }),
      'POST /stok/malzeme-istekleri/ac': () => json(200, {}),
    }, { ...KUTU, buradakiIstasyonId: null });
    const panel = await panelAc();
    fireEvent.click(within(panel).getByRole('tab', { name: 'Malzeme iste' }));
    fireEvent.change(within(panel).getByLabelText('Malzeme ara'), { target: { value: 'eld' } });
    fireEvent.click(await within(panel).findByRole('button', { name: /Eldiven/ }));
    const nereden = await within(panel).findByLabelText(/^Nereden/);
    await waitFor(() => expect(within(nereden).getAllByRole('option')).toHaveLength(2));
    fireEvent.change(nereden, { target: { value: '1' } });
    fireEvent.change(within(panel).getByLabelText(/^Miktar/), { target: { value: '2' } });
    expect(within(panel).getByRole('button', { name: 'İste' })).toHaveProperty('disabled', true);
    fireEvent.change(within(panel).getByLabelText(/^Teslim yeri/), { target: { value: '2' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'İste' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toMatchObject({ malzemeId: 901, miktar: '2', istasyonId: 2, kaynakIstasyonId: 1 }));
  });
});
