import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import type { OkutCozCevabi, TeslimKutusuCevabi } from '#paylasilan/sozlesme/stok.ts';
import { BildirimSaglayici } from '../../ortak/arayuz/index.ts';
import { DEPOCU, ac, json, sunucuKur } from './test-ortak.tsx';
import { acilisModu, izinliModlar, kayitliMod, komuttanMod, moduKaydet, OKUT_MODLARI } from './okutma-modlari.ts';
import { ustEylemler } from './ust-eylem.tsx';

// Okut modları ve komut barkodları (1912, 1909): sentetik kayıtlar.
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('okutma-modlari', () => {
  it('mod yalniz islemi olana; Otomatik ve Bilgi herkesin', () => {
    expect(izinliModlar(() => false).map((m) => m.mod)).toEqual(['otomatik', 'bilgi']);
    expect(izinliModlar((i) => i === 'stok.sayim').map((m) => m.mod)).toEqual(['otomatik', 'bilgi', 'say']);
    expect(izinliModlar((i) => i === 'stok.istek').map((m) => m.mod)).toEqual(['otomatik', 'bilgi', 'seri', 'al']);
    expect(izinliModlar(() => true)).toEqual(OKUT_MODLARI);
  });
  it('komut adi modu bulur; bilinmeyen null', () => {
    expect(komuttanMod('TASI')?.mod).toBe('tasi');
    expect(komuttanMod('YOK')).toBeNull();
  });
  it('mod cihazda kalir; bozuk ya da yetkisiz kayit Otomatik acar', () => {
    expect(kayitliMod()).toBe('otomatik');
    moduKaydet('say');
    expect(kayitliMod()).toBe('say');
    localStorage.setItem('tmiv2.okut-modu', 'bozuk');
    expect(kayitliMod()).toBe('otomatik');
    expect(acilisModu('say', izinliModlar(() => false))).toBe('otomatik');
  });
});

const OPERATOR: Kullanici = { id: 9, ad: 'Deneme Operatör', islemler: ['stok.istek'] };
const DEPO: Kullanici = { ...DEPOCU, islemler: [...DEPOCU.islemler, 'stok.istek'] };
const KUTU: TeslimKutusuCevabi = {
  gelenler: [], gonderdiklerim: [], isteklerim: [], bendenIstenenler: [], okutarakAlinanlar: [],
  istasyonlar: [{ id: 2, kod: 'F2', ad: 'Freze 2' }], hedefIstasyonlar: [{ id: 2, kod: 'F2', ad: 'Freze 2' }],
  depoKonumlari: [], araAlanlar: [], buradakiIstasyonId: 2, harita: null, zemin: null,
};
const MLZ: OkutCozCevabi = { tur: 'malzeme', malzeme: { id: 901, kod: 'SR-001', ad: 'Eldiven', birim: 'adet', tur: 'sarf' }, parti: null, yerler: [{ konumId: 3, kod: 'A-01-02', ad: null, tur: 'raf_gozu', partiId: null, statuId: null, miktar: '3' }], digerIstasyonlar: [] } as unknown as OkutCozCevabi;

function panel(kullanici: Kullanici, ek: Record<string, (g: unknown) => Response> = {}) {
  const istekler = sunucuKur(kullanici, {
    'GET /stok/teslim-kutusu': () => json(200, KUTU),
    'GET /stok/teslim-kutusu/sayac': () => json(200, { gelen: 0 }),
    'GET /stok/teslim-kutusu/sepet/gelecek': () => json(200, { satirlar: [] }),
    'GET /stok/teslim-kutusu/sepet': () => json(200, { istasyon: { id: 2, kod: 'F2', ad: 'Freze 2' }, emirler: [], satirlar: [] }),
    'GET /stok/tasima-sepeti': () => json(200, { satirlar: [] }),
    'GET /stok/statuler': () => json(200, { statuler: [] }),
    ...ek,
  });
  const Dugme = ustEylemler[0]!.dugme;
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={istemci}><BildirimSaglayici><MemoryRouter><Dugme /></MemoryRouter></BildirimSaglayici></QueryClientProvider>);
  return istekler;
}
const panelAc = async () => {
  fireEvent.click(await screen.findByRole('button', { name: /^Okut(,|$)/ }));
  return screen.findByRole('dialog', { name: 'Okut' });
};
const okut = (p: HTMLElement, kod: string) => {
  const alan = within(p).getAllByLabelText('Kod')[0]!;
  fireEvent.change(alan, { target: { value: kod } });
  fireEvent.submit(alan.closest('form')!);
};

describe('Okut paneli modlari (1912)', () => {
  it('operator yalniz Otomatik, Bilgi, Seri ve Al gorur; Otomatik bugunku kutucuklarla acilir', async () => {
    panel(OPERATOR);
    const p = await panelAc();
    const modlar = within(p).getByRole('radiogroup', { name: 'Mod' });
    await waitFor(() => expect(within(modlar).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Otomatik', 'Bilgi', 'Seri', 'Al']));
    expect(within(modlar).getByRole('radio', { name: 'Otomatik' }).getAttribute('aria-checked')).toBe('true');
    expect(await within(p).findByRole('button', { name: /^Bana gelen/ })).toBeTruthy();
  });

  it('Bilgi okutulani gosterir, is dugmesi koymaz, bir sey yazmaz', async () => {
    const istekler = panel(DEPO, { 'GET /stok/teslim-kutusu/kod-coz': () => json(200, MLZ) });
    const p = await panelAc();
    fireEvent.click(within(p).getByRole('radio', { name: 'Bilgi' }));
    expect(within(p).getByText(/Hiçbir şey yazılmaz/)).toBeTruthy();
    okut(p, 'MLZ:901');
    const sonuc = await within(p).findByRole('region', { name: 'Okutma sonucu' });
    expect(within(sonuc).getByText('Eldiven')).toBeTruthy();
    expect(within(sonuc).queryByRole('button', { name: 'Mal kabul' })).toBeNull();
    expect(within(sonuc).queryByRole('button', { name: 'Depo sepetine ekle' })).toBeNull();
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    expect(localStorage.getItem('tmiv2.okut-modu')).toBe('bilgi');
  });

  it('Bilgi UE etiketini emir numarasiyla adlandirir, eski refakat karti demez', async () => {
    panel(DEPO, { 'GET /stok/teslim-kutusu/kod-coz': () => json(200, { tur: 'eski-kart', kod: 'UE:7', uretimEmriId: 7 }) });
    const p = await panelAc();
    fireEvent.click(within(p).getByRole('radio', { name: 'Bilgi' }));
    okut(p, 'UE:7');
    expect((await within(p).findAllByText('Emir #7')).length).toBeGreaterThan(0);
    expect(within(p).queryByText(/Eski refakat/)).toBeNull();
  });

  it('mod komut barkoduyla secilir ve cihazda kalir; yetkisiz mod acilmaz', async () => {
    panel(OPERATOR);
    let p = await panelAc();
    okut(p, 'CMDŞMODŞSAY');
    expect(await within(p).findByText(/Say modu için yetkin yok/)).toBeTruthy();
    okut(p, 'CMD:MOD:BILGI');
    await waitFor(() => expect(within(p).getByRole('radio', { name: 'Bilgi' }).getAttribute('aria-checked')).toBe('true'));
    fireEvent.click(within(p).getByRole('button', { name: /Kapat/ }));
    p = await panelAc();
    expect(within(p).getByRole('radio', { name: 'Bilgi' }).getAttribute('aria-checked')).toBe('true');
  });

  it('Say modu okutarak sayimi panelde acar; panel komutu oradan da calisir', async () => {
    panel(DEPO);
    const p = await panelAc();
    fireEvent.click(await within(p).findByRole('radio', { name: 'Say' }));
    expect(await within(p).findByRole('button', { name: /Sayımı kaydet/ })).toBeTruthy();
    okut(p, 'CMD:MOD:TASI');
    await waitFor(() => expect(within(p).getByRole('radio', { name: 'Taşı' }).getAttribute('aria-checked')).toBe('true'));
    expect(within(p).queryByRole('button', { name: /Sayımı kaydet/ })).toBeNull();
    expect(within(p).getByText(/sonra bırakacağın yeri/)).toBeTruthy();
  });

  it('Topla modu tek acik listenin siradaki adimini acar; Miktar ve Kaydet komutlari Toplandi gonderir', async () => {
    const T = {
      toplama: { id: 3, no: 'TL-000003', ad: 'Deneme liste', durum: 'topluyor', acilis: '2026-10-07T10:00:00+03:00', kapanis: null, kisiAd: 'Deneme', kapatanKisiAd: null, adimSayisi: 1, toplanan: 0, eksikVar: false, surum: 1 },
      kalemler: [], hedef: null, istekler: [],
      adimlar: [{ id: 11, sira: 1, malzemeId: 901, malzemeAd: 'Eldiven', konumId: 3, konumKod: 'A-01-02', partiId: null, partiEtiketi: null, miktar: '2', toplandi: false, hareketId: null, toplanan: null }],
    };
    const istekler = panel(DEPO, {
      'GET /stok/toplamalar': () => json(200, { satirlar: [{ ...T.toplama }, { ...T.toplama, id: 4, no: 'TL-000004', durum: 'bitti' }], toplam: 2 }),
      'GET /stok/toplamalar/3': () => json(200, T),
      'POST /stok/toplamalar/3/adimlar/11/topla': () => json(200, T),
    });
    const p = await panelAc();
    fireEvent.click(await within(p).findByRole('radio', { name: 'Topla' }));
    expect(await within(p).findByText('Sıradaki adım 1')).toBeTruthy();
    okut(p, 'CMD:MIKTAR:1');
    await waitFor(() => expect((within(p).getByLabelText(/Alınan miktar/) as HTMLInputElement).value).toBe('1'));
    okut(p, 'LOC:A-09-09');
    okut(p, 'CMD:KAYDET');
    expect(await within(p).findByText(/adımla eşleşmiyor/)).toBeTruthy();
    okut(p, 'CMD:GERI-AL');
    okut(p, 'CMD:KAYDET');
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/toplamalar/3/adimlar/11/topla')?.govde).toEqual({ surum: 1, miktar: '1' }));
  });
});

describe('Okut paneli Seri modu (1915)', () => {
  it('okutmalar secim sormadan listeye duser, ikinci okutma ayni listeye gider; Geri al sonuncuyu siler; stok yazilmaz', async () => {
    const ozet = { id: 3, kaynak: 'okutma', acilis: '2026-11-03T09:00:00+03:00', degisim: '2026-11-03T09:00:00+03:00', kapanis: null, satirSayisi: 0, acikSatir: 0 };
    const satirlar: { id: number; sira: number; kod: string; adet: string | null; okutma: string; islendi: null }[] = [];
    const cevap = () => json(200, { liste: { ...ozet, satirSayisi: satirlar.length, acikSatir: satirlar.length }, satirlar: [...satirlar] });
    const istekler = panel(OPERATOR, {
      'GET /stok/seri-listeler': () => json(200, { listeler: [] }),
      'POST /stok/seri-listeler/okutma-ekle': (g) => {
        for (const kod of (g as { kodlar: string[] }).kodlar) satirlar.push({ id: satirlar.length + 1, sira: satirlar.length + 1, kod, adet: kod.startsWith('LOT:') ? '1' : null, okutma: ozet.acilis, islendi: null });
        return cevap();
      },
      'POST /stok/seri-listeler/3/satirlar/2/sil': () => { satirlar.pop(); return cevap(); },
    });
    const p = await panelAc();
    fireEvent.click(await within(p).findByRole('radio', { name: 'Seri' }));
    expect(within(p).getByText(/Stok değişmez/)).toBeTruthy();
    const liste = () => within(p).getByRole('list', { name: 'Seri liste' });
    okut(p, 'LOC:A-01-1');
    await waitFor(() => expect(within(liste()).getByText('LOC:A-01-1')).toBeTruthy());
    okut(p, 'LOT:LT-7');
    await waitFor(() => expect(within(liste()).getByText('LOT:LT-7')).toBeTruthy());
    const ekler = istekler.filter((i) => i.yol === '/stok/seri-listeler/okutma-ekle').map((i) => i.govde);
    expect(ekler).toEqual([{ kodlar: ['LOC:A-01-1'] }, { listeId: 3, kodlar: ['LOT:LT-7'] }]);
    okut(p, 'CMD:GERI-AL');
    await waitFor(() => expect(within(liste()).queryByText('LOT:LT-7')).toBeNull());
    expect(istekler.filter((i) => i.yontem === 'POST').every((i) => i.yol.startsWith('/stok/seri-listeler'))).toBe(true);
  });
});

describe('Okut paneli Yerlestir ve Al modlari (1916)', () => {
  const ozetM = { id: 1, tur: 'hammadde', kod: 'HM-1', ad: 'Deneme 1', onayDurumu: 'onayli', kullanilabilir: true, birim: 'adet' };
  const bk = (konumId: number, konumKod: string) => ({ id: konumId, malzemeId: 1, malzemeAd: 'Deneme 1', konumId, konumKod, partiId: 7, partiEtiketi: 'LT-7', miktar: '25.000', ilkGiris: '2026-10-28T09:00:00+03:00', ambalaj: null, statuId: null, kaliteDurumu: 'serbest' });
  const COZ: Record<string, unknown> = {
    'LOC:A-01-1': { tur: 'konum', bakiyeler: [], konum: { id: 41, kod: 'A-01-1', tur: 'raf_gozu', ad: null, depoId: 1, depoKod: 'ANA', rafId: null, bolmeNo: null, katNo: null, sonSayim: null, aktif: true, satirSayisi: 0, haritaGozId: null, haritaAlanId: null, surum: 1 } },
    'LOT:LT-7': { tur: 'lot', parti: { id: 7, lotNo: 'LT-7', etiket: 'LT-7' }, toplam: '25', bakiyeler: [bk(1, 'KABUL')], ozet: ozetM },
    'LOT:LT-9': { tur: 'lot', parti: { id: 9, lotNo: 'LT-9', etiket: 'LT-9' }, toplam: '25', bakiyeler: [bk(1, 'KABUL'), bk(2, 'ZEMIN')], ozet: { ...ozetM, id: 3, ad: 'Deneme 3' } },
  };
  const kodCozEkle = () => {
    const asil = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (adres, secenek) => {
      const yol = String(adres).replace('/api', '');
      if (yol.startsWith('/stok/kod-coz')) return json(200, COZ[decodeURIComponent(yol.split('kod=')[1] ?? '')] ?? { tur: 'bilinmiyor', kod: '' });
      return asil(adres, secenek);
    });
  };

  it('Yerlestir: goz, sonra lotlar; Kaydet tek kaynakli satiri goze tasir, cok yerli satir kalir', async () => {
    const istekler = panel(DEPO, { 'POST /stok/tasima': () => json(200, { hareketId: 1 }) });
    kodCozEkle();
    const p = await panelAc();
    fireEvent.click(await within(p).findByRole('radio', { name: 'Yerleştir' }));
    okut(p, 'LOT:LT-7');
    expect(await within(p).findByText(/Önce gözü okut ·/)).toBeTruthy();
    okut(p, 'LOC:A-01-1');
    expect(await within(p).findByText(/Bu göze konan lot/)).toBeTruthy();
    okut(p, 'LOT:LT-7');
    okut(p, 'LOT:LT-9');
    const liste = await within(p).findByRole('list', { name: 'Yerleştirilecekler' });
    await waitFor(() => expect(within(liste).getAllByRole('listitem')).toHaveLength(2));
    expect(within(p).getByText(/1 satır kaydedilmez/)).toBeTruthy();
    okut(p, 'CMD:KAYDET');
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/stok/tasima').map((i) => i.govde)).toEqual([
      { malzemeId: 1, kaynakKonumId: 1, partiId: 7, hedefKonumId: 41, miktar: '25.000', aciklama: 'Yerleştir' },
    ]));
    await waitFor(() => expect(within(within(p).getByRole('list', { name: 'Yerleştirilecekler' })).getAllByRole('listitem')).toHaveLength(1));
  });

  it('Al: malzeme, sonra aldigin istasyon; Miktar ve Kaydet komutlariyla okutarak al gonderilir', async () => {
    const istekler = panel(OPERATOR, {
      'GET /stok/teslim-kutusu/okutarak-al': () => json(200, {
        malzeme: { id: 1, kod: 'HM-1', ad: 'Deneme 1', birim: 'adet' }, yer: { konumId: 9, istasyonId: 3, kod: 'F3', ad: 'Freze 3' },
        satirlar: [{ partiId: 7, partiEtiketi: 'LT-7', statuId: null, uretimEmriId: null, miktar: '5' }],
      }),
      'POST /stok/teslim-kutusu/okutarak-al': () => json(200, { teslim: {} }),
    });
    const p = await panelAc();
    fireEvent.click(await within(p).findByRole('radio', { name: 'Al' }));
    okut(p, 'LOT:LT-7');
    okut(p, 'LOC:IST-F3');
    expect(await within(p).findByText(/Freze 3 \(F3\)/)).toBeTruthy();
    okut(p, 'CMD:MIKTAR:2');
    await waitFor(() => expect((within(p).getByLabelText(/Alınan miktar/) as HTMLInputElement).value).toBe('2'));
    okut(p, 'CMD:KAYDET');
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST' && i.yol === '/stok/teslim-kutusu/okutarak-al')?.govde)
      .toMatchObject({ kod: 'LOT:LT-7', yerKodu: 'LOC:IST-F3', istasyonId: 2, partiId: 7, statuId: null, miktar: '2' }));
  });
});

describe('Okutarak birakma (1919 a)', () => {
  it('hedef okutulunca bırakma acilir; okutulan lot yalniz o kalemi secer, Kaydet komutu birakir', async () => {
    const sepetSatiri = (id: number, partiId: number) => ({
      id, malzemeId: 1, malzemeAd: 'Deneme 1', malzemeKod: 'HM-1', kaynakKonumId: 5, kaynakKonumKod: 'KABUL', partiId, partiEtiketi: `LT-${partiId}`,
      miktar: '2.000', mevcut: '2.000', eklenme: '2026-11-03T08:00:00+03:00', refakat: null,
    });
    const istekler = panel(DEPO, {
      'GET /stok/sepet': () => json(200, { satirlar: [sepetSatiri(1, 7), sepetSatiri(2, 8)] }),
      'POST /stok/tasima': () => json(200, { hareketIdler: [3] }),
      'POST /stok/sepet/satirlar/2/sil': () => json(200, { satirlar: [] }),
    });
    const COZ: Record<string, unknown> = {
      'LOC:A-01-1': { tur: 'yer', yer: { konumId: 41, kod: 'A-01-1', ad: null, tur: 'raf_gozu', istasyonId: null }, satirlar: null, baskaSepetler: [] },
      'LOT:LT-8': { tur: 'malzeme', malzeme: { id: 1, kod: 'HM-1', ad: 'Deneme 1', birim: 'adet' }, parti: { id: 8, etiket: 'LT-8' }, yerler: [], baskaSepetler: [] },
      'LOT:LT-9': { tur: 'malzeme', malzeme: { id: 2, kod: 'HM-2', ad: 'Deneme 2', birim: 'adet' }, parti: { id: 9, etiket: 'LT-9' }, yerler: [], baskaSepetler: [] },
    };
    const asil = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (adres, secenek) => {
      const yol = String(adres).replace('/api', '');
      if (yol.startsWith('/stok/teslim-kutusu/kod-coz')) {
        const c = COZ[decodeURIComponent(yol.split('kod=')[1] ?? '')];
        return c ? json(200, c) : json(404, { kod: 'BULUNAMADI', mesaj: 'Kod bulunamadı.' });
      }
      return asil(adres, secenek);
    });
    const p = await panelAc();
    fireEvent.click(await within(p).findByRole('radio', { name: 'Taşı' }));
    await within(p).findByRole('region', { name: 'Taşıma sepetim' });
    okut(p, 'LOC:A-01-1');
    const form = await within(p).findByRole('list', { name: 'Bırakılacaklar' });
    await waitFor(() => expect(within(form).getAllByRole('checkbox').map((c) => (c as HTMLInputElement).checked)).toEqual([true, true]));
    okut(p, 'LOT:LT-9');
    expect(await within(p).findByText(/sepette yok/)).toBeTruthy();
    okut(p, 'LOT:LT-8');
    await waitFor(() => expect(within(form).getAllByRole('checkbox').map((c) => (c as HTMLInputElement).checked)).toEqual([false, true]));
    okut(p, 'CMD:KAYDET');
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/stok/tasima').map((i) => i.govde)).toEqual([
      expect.objectContaining({ malzemeId: 1, kaynakKonumId: 5, partiId: 8, hedefKonumId: 41, miktar: '2' }),
    ]));
  });
});

describe('Komut karti (1909)', () => {
  it('is, miktar ve mod komutlarini QR olarak basar; kartta yalniz komut var', async () => {
    sunucuKur(DEPOCU, {});
    ac('/stok/komut-karti');
    expect(await screen.findByRole('button', { name: 'Yazdır' })).toBeTruthy();
    const qrlar = screen.getAllByRole('img', { name: /^QR: / }).map((q) => q.getAttribute('aria-label'));
    expect(qrlar).toContain('QR: CMD:KAYDET');
    expect(qrlar).toContain('QR: CMD:MIKTAR:12');
    expect(qrlar).toContain('QR: CMD:MOD:TOPLA');
    expect(qrlar.every((q) => /^QR: CMD:/.test(q ?? ''))).toBe(true);
  });
});
