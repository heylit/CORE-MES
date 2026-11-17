import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { HazirlikProjesiSecenekleri } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { HazirlikProjesiDugmesi } from './HazirlikProjesi.tsx';
import { YAZAR, ac, json, sunucuKur } from './test-ortak.tsx';

const SECENEK: HazirlikProjesiSecenekleri = {
  emirNo: 'ORN-UE-1203', emirProjeId: 4, baslangic: '2026-11-24', teslim: null, acikGorev: 0,
  projeler: [{ id: 4, kod: 'ORN-PRJ-0412', ad: 'Deneme proje' }, { id: 5, kod: 'ORN-PRJ-0413', ad: 'Hazırlık' }],
  sablonlar: [
    { id: 1, ad: 'ORN-Kısa', varsayilan: false, dogacak: 0, ozet: '' },
    { id: 2, ad: 'ORN-CNC Standart', varsayilan: true, dogacak: 7, ozet: '3 iş emri × (CNC kurulumu, Boya onayı) ve emir başına Çizim revizyonu' },
  ],
};
const Ekran = () => <HazirlikProjesiDugmesi emirId={12} />;

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Hazırlık projesi penceresi (3396)', () => {
  it('emrin projesi ve varsayılan şablon seçili gelir; doğacak görev sayısı yazılır; kaydet proje ve şablonla gider', async () => {
    const istekler = sunucuKur(YAZAR, {
      'GET /adimli-emirler/12/hazirlik-projesi': () => json(200, SECENEK),
      'POST /adimli-emirler/12/hazirlik-projesi': () => json(200, { eklenen: 7 }),
    });
    ac([{ yol: '/', ekran: Ekran }], '/');
    fireEvent.click(await screen.findByRole('button', { name: /Hazırlık projesi/ }));
    const p = await screen.findByRole('dialog');
    await within(p).findByText(/7 görev/);
    expect((within(p).getByLabelText(/^Proje/) as HTMLSelectElement).value).toBe('4');
    expect((within(p).getByLabelText(/Hazırlık şablonu/) as HTMLSelectElement).value).toBe('2');
    expect(within(p).getByText(/24\.11\.2026/)).toBeTruthy();
    fireEvent.change(within(p).getByLabelText(/^Proje/), { target: { value: '5' } });
    fireEvent.click(within(p).getByRole('button', { name: 'Kaydet ve dağıt' }));
    await waitFor(() => expect(istekler.some((i) => i.yontem === 'POST')).toBe(true));
    const post = istekler.find((i) => i.yontem === 'POST');
    expect(post?.govde).toEqual({ projeId: 5, sablonId: 2 });
    expect(post?.kimlik).toBeTruthy();
    await screen.findByText('7 hazırlık görevi dağıtıldı.');
  });

  it('açık maddesi olmayan şablonda görev doğmayacağını söyler', async () => {
    sunucuKur(YAZAR, { 'GET /adimli-emirler/12/hazirlik-projesi': () => json(200, SECENEK) });
    ac([{ yol: '/', ekran: Ekran }], '/');
    fireEvent.click(await screen.findByRole('button', { name: /Hazırlık projesi/ }));
    const p = await screen.findByRole('dialog');
    fireEvent.change(await within(p).findByLabelText(/Hazırlık şablonu/), { target: { value: '1' } });
    expect(within(p).getByText(/görev doğmaz/)).toBeTruthy();
  });
});
