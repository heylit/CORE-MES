import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import type { MalKabulTaslagiCevabi } from '#paylasilan/sozlesme/stok-mal-kabul-taslagi.ts';
import type { KonumlarCevabi, MalKabulCevabi, MalKabullerCevabi } from '#paylasilan/sozlesme/stok.ts';
import { DEPOCU, ac, json, sunucuKur, type Istek } from './test-ortak.tsx';

// 3087 a, 3091 a: yarım kalan mal kabul taslağı. Veriler uydurmadır.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const SATIR = {
  anahtar: 1, kart: '', miktar: '10', konumId: '', tedarikciPartiNo: 'ORN-TP-1', dokumNo: '', sertifikaNo: '', ambalajTur: '', ambalajOlcu: '', ozelL: '', ozelW: '', ozelH: '',
  ambalajSayisi: '', ambalajIci: '', elleMiktar: true, siparisSatirId: '', siparisEtiketi: '', siparisRevizyonu: '', yururlukRevizyonu: '', revizyonUyusmuyor: false,
  hizmetKarti: '', donus: 'fason', gidenKart: '', fasonKonumId: '', gidenMiktar: '', gidenParti: '', fasonIsEmriId: '', fasonIsEtiketi: '', bekleyenFasonIsi: '',
  sertifikaOzet: '', sertifikaAdi: '', sertifikaYukleniyor: false, sevkKalemiId: '', sevkEtiketi: '', sonKullanma: '',
};
const TASLAK: MalKabulTaslagiCevabi = { taslak: { govde: { tur: 'diger', irsaliye: 'ORN-IRS-12', satirlar: [SATIR] }, surum: 3, guncellendi: '2026-11-12T09:41:00+03:00' } };
const BELGE = { belge: { id: 5, no: 'MK-000005' }, hareketIdler: [] } as unknown as MalKabulCevabi;

function kur(
  taslak: MalKabulTaslagiCevabi,
  kaydet: () => Response | Promise<Response> = () => json(200, { surum: 4, guncellendi: '2026-11-12T09:45:00+03:00' }),
  teslim: () => Response | Promise<Response> = () => json(200, BELGE),
): Istek[] {
  const bos = { satirlar: [], toplam: 0, sayfa: 1, sayfaBoyu: 50 };
  return sunucuKur(DEPOCU, {
    'GET /stok/konumlar': () => json(200, bos satisfies KonumlarCevabi),
    'GET /stok/mal-kabuller': () => json(200, bos satisfies MalKabullerCevabi),
    'GET /stok/acik-siparis-satirlari': () => json(200, { satirlar: [] }),
    'GET /stok/mal-kabul-taslagi': () => json(200, taslak),
    'POST /stok/mal-kabul-taslagi/kaydet': kaydet,
    'POST /stok/mal-kabul-taslagi/sil': () => json(200, { silindi: true }),
    'POST /stok/mal-kabul': teslim,
  });
}
const gecikmeli = (ms: number, cevap: () => Response) => () => new Promise<Response>((r) => setTimeout(() => r(cevap()), ms));
const irsaliyeAlani = () => screen.getByLabelText('İrsaliye no') as HTMLInputElement;

describe('Yarım kalan mal kabul (3087, 3091)', () => {
  it('kutu taslağı özetler; "Devam et" formu doldurur, değişiklik sürümle kaydedilir, teslimde taslak silinir', async () => {
    const istekler = kur(TASLAK);
    ac('/stok/mal-kabul');
    const kutu = await screen.findByRole('status', { name: 'Yarım kalan mal kabul' });
    expect(kutu.textContent).toContain('İrsaliye ORN-IRS-12');
    expect(kutu.textContent).toContain('1 satır');
    expect(istekler.some((i) => i.yol.startsWith('/stok/mal-kabul-taslagi/kaydet'))).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Devam et' }));
    await waitFor(() => expect(irsaliyeAlani().value).toBe('ORN-IRS-12'));
    expect(screen.queryByRole('status', { name: 'Yarım kalan mal kabul' })).toBeNull();
    fireEvent.change(irsaliyeAlani(), { target: { value: 'ORN-IRS-13' } });
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/mal-kabul-taslagi/kaydet')).toBe(true), { timeout: 4000 });
    const k = istekler.find((i) => i.yol === '/stok/mal-kabul-taslagi/kaydet')!;
    expect(k.govde).toMatchObject({ surum: 3, govde: { tur: 'diger', irsaliye: 'ORN-IRS-13' } });
    expect(await screen.findByText(/Taslak kaydedildi/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Teslim al' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST' && i.yol === '/stok/mal-kabul')).toBe(true));
    expect(istekler.find((i) => i.yol === '/stok/mal-kabul')!.govde).toMatchObject({ taslakSil: true, irsaliyeNo: 'ORN-IRS-13' });
  }, 10000);

  it('kutuya dokunmadan yeni form yazılırsa taslak ezilmez ve teslimde silinmez', async () => {
    const istekler = kur(TASLAK);
    ac('/stok/mal-kabul');
    await screen.findByRole('status', { name: 'Yarım kalan mal kabul' });
    fireEvent.change(irsaliyeAlani(), { target: { value: 'ORN-IRS-20' } });
    await new Promise((r) => setTimeout(r, 2500));
    expect(istekler.some((i) => i.yol.startsWith('/stok/mal-kabul-taslagi/'))).toBe(false);
    // Boş satırın zorunlu alanı tarayıcıda gönderimi durdurur; burada yalnız gövde ölçülür.
    fireEvent.submit(screen.getByRole('button', { name: 'Teslim al' }).closest('form')!);
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/mal-kabul')).toBe(true));
    expect(istekler.find((i) => i.yol === '/stok/mal-kabul')!.govde).toMatchObject({ taslakSil: false });
  }, 10000);

  it('teslim sürerken taslak kaydedilmez: 2 sn dolmadan basılan yavaş teslimden sonra taslak oluşmaz', async () => {
    const istekler = kur({ taslak: null }, undefined, gecikmeli(3500, () => json(200, BELGE)));
    ac('/stok/mal-kabul');
    await screen.findByLabelText('İrsaliye no');
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/mal-kabul-taslagi')).toBe(true));
    fireEvent.change(irsaliyeAlani(), { target: { value: 'ORN-IRS-40' } });
    await new Promise((r) => setTimeout(r, 500));
    fireEvent.submit(screen.getByRole('button', { name: 'Teslim al' }).closest('form')!);
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/mal-kabul')).toBe(true));
    expect(istekler.find((i) => i.yol === '/stok/mal-kabul')!.govde).toMatchObject({ taslakSil: false });
    await new Promise((r) => setTimeout(r, 4500));
    expect(istekler.some((i) => i.yol.startsWith('/stok/mal-kabul-taslagi/'))).toBe(false);
  }, 12000);

  it('yolda kayıt varken teslim edilirse taslak teslimle silinir; teslimden sonra yazılan kayıt kendi sürümüyle silinir', async () => {
    const istekler = kur({ taslak: null }, gecikmeli(1500, () => json(200, { surum: 1, guncellendi: '2026-11-12T09:45:00+03:00' })));
    ac('/stok/mal-kabul');
    await screen.findByLabelText('İrsaliye no');
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/mal-kabul-taslagi')).toBe(true));
    fireEvent.change(irsaliyeAlani(), { target: { value: 'ORN-IRS-41' } });
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/mal-kabul-taslagi/kaydet')).toBe(true), { timeout: 4000 });
    fireEvent.submit(screen.getByRole('button', { name: 'Teslim al' }).closest('form')!);
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/mal-kabul')).toBe(true));
    expect(istekler.find((i) => i.yol === '/stok/mal-kabul')!.govde).toMatchObject({ taslakSil: true });
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/mal-kabul-taslagi/sil')?.govde).toEqual({ surum: 1 }), { timeout: 4000 });
    expect(screen.queryByText(/Taslak kaydedildi/)).toBeNull();
  }, 12000);

  it('"Sil, yeni başla" taslağı okunan sürümle siler', async () => {
    const istekler = kur(TASLAK);
    ac('/stok/mal-kabul');
    await screen.findByRole('status', { name: 'Yarım kalan mal kabul' });
    fireEvent.click(screen.getByRole('button', { name: 'Sil, yeni başla' }));
    await waitFor(() => expect(istekler.find((i) => i.yol === '/stok/mal-kabul-taslagi/sil')?.govde).toEqual({ surum: 3 }));
  });

  it('başka cihaz değiştirdiyse "Taslak başka cihazda değişti" çıkar, kayıt durur; "Oradakini aç" kutuyu yeniden gösterir', async () => {
    const istekler = kur({ taslak: null }, () => json(409, { kod: 'CAKISMA', mesaj: 'Kayıt başka biri tarafından değiştirildi.' }));
    ac('/stok/mal-kabul');
    await screen.findByLabelText('İrsaliye no');
    await waitFor(() => expect(istekler.some((i) => i.yol === '/stok/mal-kabul-taslagi')).toBe(true));
    fireEvent.change(irsaliyeAlani(), { target: { value: 'ORN-IRS-30' } });
    expect(await screen.findByText(/Taslak başka cihazda değişti/, undefined, { timeout: 4000 })).toBeTruthy();
    const sayi = istekler.filter((i) => i.yol === '/stok/mal-kabul-taslagi/kaydet').length;
    fireEvent.change(irsaliyeAlani(), { target: { value: 'ORN-IRS-31' } });
    await new Promise((r) => setTimeout(r, 2500));
    expect(istekler.filter((i) => i.yol === '/stok/mal-kabul-taslagi/kaydet').length).toBe(sayi);
    fireEvent.click(screen.getByRole('button', { name: 'Oradakini aç' }));
    await waitFor(() => expect(istekler.filter((i) => i.yol === '/stok/mal-kabul-taslagi').length).toBeGreaterThan(1));
  }, 12000);
});
