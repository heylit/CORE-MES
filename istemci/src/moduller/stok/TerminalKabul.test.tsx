import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AcikSiparisSatiri } from '#paylasilan/sozlesme/stok.ts';
import { DEPOCU, json, sunucuKur } from './test-ortak.tsx';
import { FasonKabulOnayi, kabulIsleri, type KabulIsi } from './TerminalKabul.tsx';
import { fasonDonusGovdesi } from './TerminalFasonDonusu.tsx';

// 3388 a: terminalde Bitir'deki fason kabul onayı. Değerler uydurmadır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const satir = (id: number, malzemeId: number | null, kalemAdi: string, malzemeTur: 'hammadde' | 'hizmet', ek: Partial<AcikSiparisSatiri> = {}): AcikSiparisSatiri => ({
  id, siparisNo: `SAS-${String(id)}`, talepNo: `TLP-${String(id)}`, tedarikciAdi: 'ORN tedarikçi', malzemeId, malzemeTur, kalemAdi, miktar: '60.000', kalanMiktar: '60.000',
  birim: 'adet', beklenenTeslim: null, ...ek,
});
const FASON = satir(41, 950, 'ORN-Flanş', 'hizmet', { isEmriId: 77, emirNo: 'ORN-UE-1' });
const IS = { isEmriId: 77, emirNo: 'ORN-UE-1', opNo: 40, adim: 'Kaplama', gonderilen: 60, donen: 10, hurda: 2, donenKart: { malzemeId: 960, kod: 'ORN-FL-K', ad: 'Flanş kaplamalı', birim: 'adet' }, statulu: false };
const KABUL: KabulIsi = { satir: FASON, tur: 'fason', fason: IS, hedef: 48 };
const BELGE = { id: 12, no: 'MK-000012', tur: 'satin_alma', irsaliyeNo: null, zaman: '2026-11-03T10:00:00+03:00', kisiAd: 'D', satirSayisi: 1, farkSayisi: 0, duzeltilenId: null, duzeltenId: null };

function ac(kabul: number, is: KabulIsi = KABUL) {
  const yazildi = vi.fn();
  const istemci = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={istemci}><FasonKabulOnayi is={is} kabul={kabul} vazgec={() => undefined} yazildi={yazildi} /></QueryClientProvider>);
  return yazildi;
}

describe('terminal mal kabul işleri (3388 a)', () => {
  it('kabul işleri: satın alma ve fason; saf hizmet yok; fasonda hedef firmada kalandır, işi bulunmayan fasonda null', () => {
    const l = kabulIsleri([satir(31, 901, 'ORN-Çubuk', 'hammadde'), FASON, satir(42, 951, 'ORN-Saf hizmet', 'hizmet'), satir(43, 952, 'ORN-Pim', 'hizmet', { isEmriId: 99 })], new Map([[77, IS]]));
    expect(l.map((x) => [x.satir.id, x.tur, x.hedef])).toEqual([[31, 'satin-alma', null], [41, 'fason', 48], [43, 'fason', null]]);
  });

  it('Bitir onayı sayılan adedi karantinaya yazar; çift dokunuş tek istektir', async () => {
    let yanit: (r: Response) => void = () => {};
    const istekler = sunucuKur(DEPOCU, { 'POST /stok/mal-kabul': () => new Promise<Response>((r) => { yanit = r; }) });
    const yazildi = ac(40);
    expect(screen.getByText('ORN-FL-K · Flanş kaplamalı')).toBeTruthy();
    expect(screen.getByText('8 adet')).toBeTruthy();
    expect(screen.queryByText(/Ret/)).toBeNull();
    const yaz = screen.getByRole('button', { name: /Kabulü yaz/ });
    fireEvent.click(yaz);
    fireEvent.click(yaz);
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST').length).toBe(1));
    expect(istekler.find((i) => i.yontem === 'POST')!.govde).toEqual({ tur: 'satin_alma', satirlar: [{ malzemeId: 960, miktar: '40', parti: null, siparisSatirId: 41, fasonIsi: { isEmriId: 77 }, ambalaj: null }] });
    yanit(json(200, { belge: BELGE, hareketIdler: [1] }));
    await waitFor(() => expect(yazildi).toHaveBeenCalledWith('40 adet karantinaya girdi (MK-000012); GKK kuyruğunda.'));
  });

  it('firmada kalandan fazla ya da sıfır kabulde yazılmaz', () => {
    ac(49);
    expect(screen.getByRole('alert').textContent).toContain('en çok 48');
    expect((screen.getByRole('button', { name: /Kabulü yaz/ }) as HTMLButtonElement).disabled).toBe(true);
    cleanup();
    ac(0);
    expect((screen.getByRole('button', { name: /Kabulü yaz/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('"Malzeme dönmedi" ikinci dokunuşla hizmet teslimi yazar', async () => {
    const istekler = sunucuKur(DEPOCU, { 'POST /stok/mal-kabul': () => json(200, { belge: BELGE, hareketIdler: [] }) });
    const yazildi = ac(0);
    fireEvent.click(screen.getByRole('button', { name: 'Malzeme dönmedi' }));
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Tekrar dokunun/ }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ tur: 'satin_alma', satirlar: [{ malzemeId: 950, miktar: '60.000', siparisSatirId: 41 }] }));
    await waitFor(() => expect(yazildi).toHaveBeenCalledWith(expect.stringContaining('stok değişmedi')));
  });

  it('işi bulunamayan fasonda yalnız "Malzeme dönmedi"; yetkisiz yazmada sunucunun hatası görünür (403)', async () => {
    sunucuKur(DEPOCU, { 'POST /stok/mal-kabul': () => json(403, { kod: 'YETKISIZ', mesaj: 'Bu işlem için yetkiniz yok.' }) });
    ac(5, { ...KABUL, fason: null, hedef: null });
    expect((screen.getByRole('button', { name: /Kabulü yaz/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Malzeme dönmedi' }));
    fireEvent.click(screen.getByRole('button', { name: /Tekrar dokunun/ }));
    expect((await screen.findByText(/yetkiniz yok/)).textContent).toContain('yetkiniz yok');
  });
});

// 3712: sipariş satırının işlediği parçadan farklı kart dönüyorsa terminalde de Mal kabul ekranındaki aynı blok ve onay; sunucu onaysız reddeder.
describe('terminal fason kabulünde farklı kart onayı (3712)', () => {
  const PARCALI = (no: number): KabulIsi => ({ ...KABUL, satir: { ...FASON, uygulananMalzeme: { no, kod: 'ORN-FL', ad: 'Flanş ham' } } });
  const govde = (onay: boolean) => ({ tur: 'satin_alma', satirlar: [{ malzemeId: 960, miktar: '40', parti: null, siparisSatirId: 41, fasonIsi: { isEmriId: 77 }, ambalaj: null, ...(onay ? { farkliKartOnayi: true } : {}) }] });

  it('gövde: onay bayrağı yalnız verilince gider; "dönmedi" gövdesinde hiç yok', () => {
    expect(fasonDonusGovdesi(FASON, 'dondu', IS, '40')).toEqual(govde(false));
    expect(fasonDonusGovdesi(FASON, 'dondu', IS, '40', true)).toEqual(govde(true));
    expect(fasonDonusGovdesi(FASON, 'donmedi', null, '')).toEqual({ tur: 'satin_alma', satirlar: [{ malzemeId: 950, miktar: '60.000', siparisSatirId: 41 }] });
  });

  it('farklı kart: blok ve uyarı görünür, onaya kadar Kabulü yaz kapalı ve nedeni yazılı; onaylanınca istek gövdesinde farkliKartOnayi: true', async () => {
    const istekler = sunucuKur(DEPOCU, { 'POST /stok/mal-kabul': () => json(200, { belge: BELGE, hareketIdler: [1] }) });
    ac(40, PARCALI(955));
    expect(document.querySelector('.tc-stok-islenen')?.textContent).toContain('ORN-FL · Flanş ham');
    const yaz = screen.getByRole('button', { name: /Kabulü yaz/ }) as HTMLButtonElement;
    expect(yaz.disabled).toBe(true);
    expect(yaz.getAttribute('aria-describedby')).toBe('tc-kabul-neden');
    expect(document.getElementById('tc-kabul-neden')?.textContent).toContain('onay bekleniyor');
    fireEvent.click(yaz);
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Farklı kartla kabul et' }));
    expect((screen.getByRole('button', { name: /Kabulü yaz/ }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: /Kabulü yaz/ }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual(govde(true)));
  });

  it('onay geri alınır: Onayı kaldır ile Kabulü yaz yeniden kapanır, bayrak gitmez', () => {
    sunucuKur(DEPOCU, {});
    ac(40, PARCALI(955));
    fireEvent.click(screen.getByRole('button', { name: 'Farklı kartla kabul et' }));
    expect((screen.getByRole('button', { name: /Kabulü yaz/ }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Onayı kaldır' }));
    expect((screen.getByRole('button', { name: /Kabulü yaz/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Farklı kartla kabul et' })).toBeTruthy();
  });

  it('eşleşen kart: yeşil durum, ek adım ve bayrak yok', async () => {
    const istekler = sunucuKur(DEPOCU, { 'POST /stok/mal-kabul': () => json(200, { belge: BELGE, hareketIdler: [1] }) });
    ac(40, PARCALI(960));
    expect(screen.getByText('Dönen kart işlenen malzemeyle eşleşiyor.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Farklı kartla kabul et' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Kabulü yaz/ }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual(govde(false)));
  });

  it('parça bağı olmayan satırda blok ve onay yok (eski davranış)', () => {
    ac(40);
    expect(document.querySelector('.tc-stok-islenen')).toBeNull();
    expect((screen.getByRole('button', { name: /Kabulü yaz/ }) as HTMLButtonElement).disabled).toBe(false);
  });
});
