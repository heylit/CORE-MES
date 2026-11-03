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
  it('operator yalniz Otomatik ve Bilgi gorur; Otomatik bugunku kutucuklarla acilir', async () => {
    panel(OPERATOR);
    const p = await panelAc();
    const modlar = within(p).getByRole('radiogroup', { name: 'Mod' });
    expect(within(modlar).getAllByRole('radio').map((r) => r.textContent)).toEqual(['Otomatik', 'Bilgi']);
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
