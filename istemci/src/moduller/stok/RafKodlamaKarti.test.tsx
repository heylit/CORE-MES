import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { RafKodlamaOnizlemeCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { HaritaEslemeCevabi } from '#paylasilan/sozlesme/stok.ts';
import { DEPOCU, MUDUR, ac, json, sunucuKur } from './test-ortak.tsx';

// 3168 a, 3171 a: Stok > Ayarlar'da raf kodlaması; değiştirmeden önce sayı ve örnek sorulur, onayla kodlar değişir ve etiket penceresi
// açılır; vazgeçince seçim kayıtlı değere döner. Rakamlı raf kodu sıra numaralı kodlamaya geçişi durdurur.
const onizleme = (ek: Partial<RafKodlamaOnizlemeCevabi> = {}): RafKodlamaOnizlemeCevabi => ({
  kodlama: 'duz-sayi', rafSayisi: 2, gozSayisi: 20, degisenKonum: 20, stokluKonum: 3, ornek: { eski: 'ORNA-01-1-1', yeni: 'ORNA1' }, engelliRaflar: [], ...ek,
});
const esleme: HaritaEslemeCevabi = {
  eklenen: 0, guncellenen: 2, kapatilan: 0, atlanan: [],
  koduDegisenler: [
    { konumId: 1, eskiKod: 'ORNA-01-1-1', yeniKod: 'ORNA1', tur: 'raf_gozu', ad: null, bolmeNo: 1, katNo: 1, satirSayisi: 0 },
    { konumId: 2, eskiKod: 'ORNA-01-2-1', yeniKod: 'ORNA2', tur: 'raf_gozu', ad: null, bolmeNo: 1, katNo: 2, satirSayisi: 1 },
  ],
};
const ortak = {
  'GET /stok/harita-ozeti': () => json(200, { bolum: 0, goz: 0, alan: 0, eslenmemis: 0, deposuzYer: 0, bagsizKonumlar: [], bolumler: [] }),
  'GET /stok/depolar': () => json(200, { depolar: [] }),
};
const kutu = async () => (await screen.findByRole('combobox', { name: 'Raf gözü kodu' })) as HTMLSelectElement;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('stok Ayarlar: raf kodlama (3168)', () => {
  it('seçim önce sayıyı ve örneği sorar; onayla kodlar değişir, etiket penceresi açılır', async () => {
    const istekler = sunucuKur(MUDUR, {
      ...ortak,
      'GET /stok/raf-kodlama': () => json(200, { kodlama: 'bolme-kat-goz' }),
      'GET /stok/raf-kodlama/onizleme': () => json(200, onizleme()),
      'POST /stok/raf-kodlama/degistir': () => json(200, esleme),
    });
    ac('/stok/ayarlar');
    const k = await kutu();
    expect(k.value).toBe('bolme-kat-goz');
    fireEvent.change(k, { target: { value: 'duz-sayi' } });
    const onay = await screen.findByRole('dialog', { name: 'Bütün raf gözlerinin kodu değişsin mi?' });
    expect(within(onay).getByText('2 rafta 20 gözün kodu değişir; 3 gözde stok var. Stok yerinde kalır.')).toBeTruthy();
    expect(within(onay).getByText('ORNA-01-1-1 → ORNA1')).toBeTruthy();
    fireEvent.click(within(onay).getByRole('button', { name: 'Kodları değiştir' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST' && i.yol === '/stok/raf-kodlama/degistir')?.govde).toEqual({ kodlama: 'duz-sayi', beklenen: 'bolme-kat-goz' }));
    expect(await screen.findByRole('dialog', { name: 'Konum kodu değişti' })).toBeTruthy();
  });

  it('vazgeçince hiçbir şey yazılmaz, seçim kayıtlı değerde kalır', async () => {
    const istekler = sunucuKur(MUDUR, {
      ...ortak,
      'GET /stok/raf-kodlama': () => json(200, { kodlama: 'bolme-kat-goz' }),
      'GET /stok/raf-kodlama/onizleme': () => json(200, onizleme()),
    });
    ac('/stok/ayarlar');
    fireEvent.change(await kutu(), { target: { value: 'duz-sayi' } });
    const onay = await screen.findByRole('dialog', { name: 'Bütün raf gözlerinin kodu değişsin mi?' });
    fireEvent.click(within(onay).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect((await kutu()).value).toBe('bolme-kat-goz');
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('rakamlı raf kodu varken geçilmez; raflar adıyla söylenir', async () => {
    const istekler = sunucuKur(MUDUR, {
      ...ortak,
      'GET /stok/raf-kodlama': () => json(200, { kodlama: 'bolme-kat-goz' }),
      'GET /stok/raf-kodlama/onizleme': () => json(200, onizleme({ engelliRaflar: ['ORN1', 'ORN2'] })),
    });
    ac('/stok/ayarlar');
    fireEvent.change(await kutu(), { target: { value: 'duz-sayi' } });
    const p = await screen.findByRole('dialog', { name: 'Önce raf kodları harfe çevrilmeli' });
    expect(within(p).getByText('ORN1, ORN2')).toBeTruthy();
    fireEvent.click(within(p).getByRole('button', { name: 'Tamam' }));
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
  });

  it('stok tanımı olmayan kodlamayı görür, değiştiremez', async () => {
    sunucuKur(DEPOCU, { ...ortak, 'GET /stok/raf-kodlama': () => json(200, { kodlama: 'duz-sayi' }) });
    ac('/stok/ayarlar');
    const k = await kutu();
    expect(k.value).toBe('duz-sayi');
    expect(k.disabled).toBe(true);
  });
});
