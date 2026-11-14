import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { ORNEK_KARTLAR, ornekKayit } from '../ornek-veri.ts';
import { YAZAN, json, sunucuKur, yeniEkranAc } from '../test-ortak.tsx';

beforeEach(() => { localStorage.clear(); window.scrollTo = vi.fn(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const MODELLER = {
  satirlar: [{ malzemeKodu: 'MM-ORN-00001', malzemeAdi: 'Örnek mil', belgeAdi: 'orn-mil.step', revizyonId: 7, revKodu: 'B' }],
  toplam: 1, sayfa: 1, sayfaBoyu: 50,
};
// Mil: 118 uzun, kesit Ø46.
const ANALIZ = { revizyonId: 7, analiz: { obb: { a: 118, b: 46, c: 46, cap: 46, yon: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] }, hacimMm3: 142000 } };
const YOLLAR = {
  'GET /geometri/modeller': () => json(200, MODELLER),
  'GET /geometri/analizler/7': () => json(200, ANALIZ),
};

async function formAdiminiAc() {
  yeniEkranAc('/malzemeler/yeni?kopya=mornek1');
  await screen.findByRole('heading', { name: 'Form ve ölçüler' });
}

async function modelSec() {
  const serit = await screen.findByRole('region', { name: '3B modelden öner' });
  const secim = await within(serit).findByRole('combobox', { name: 'Parçanın 3B modeli' });
  await within(secim).findByRole('option', { name: /MM-ORN-00001/ });
  fireEvent.change(secim, { target: { value: '7' } });
  await within(serit).findByText('118 × 46 × 46 mm');
  return serit;
}

describe('3243 a: hammadde kartında 3B modelden öneri', () => {
  test('virgüllü pay ile öneri hesaplanır, seçilen ölçü forma ve kaynak satırına yazılır', async () => {
    sunucuKur(YAZAN, YOLLAR);
    await formAdiminiAc();
    const serit = await modelSec();
    fireEvent.change(within(serit).getByRole('textbox', { name: /İşleme payı/ }), { target: { value: '2,5' } });
    const oneriler = within(serit).getByRole('group', { name: 'Ham önerileri' });
    const cubuk = await within(oneriler).findByRole('button', { name: /Ø55 × 126/ });
    expect(within(cubuk).getByText('en az talaş')).toBeTruthy();
    expect(within(cubuk).getByText('yeni kart')).toBeTruthy();
    fireEvent.click(cubuk);
    fireEvent.click(within(serit).getByRole('button', { name: 'Ölçüleri forma yaz' }));
    expect(await within(serit).findByRole('status')).toHaveProperty('textContent', expect.stringContaining('MM-ORN-00001 Rev B, pay 2,5 mm') as string);
    expect(screen.getAllByDisplayValue('55').length).toBeGreaterThan(0);
    // Kaynak, kartın ek özelliklerinde bir satırdır.
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Adımlar' })).getByRole('button', { name: /Teknik özellikler/ }));
    expect(await screen.findByDisplayValue('MM-ORN-00001 Rev B, pay 2,5 mm')).toBeTruthy();
    expect(screen.getByDisplayValue('Kaynak model')).toBeTruthy();
  });

  test('aynı ölçüde kart varsa önce o kart önerilir; yine de yazmak ayrıca seçilir', async () => {
    sunucuKur(YAZAN, YOLLAR);
    await formAdiminiAc();
    const serit = await modelSec();
    const cubuk = await within(within(serit).getByRole('group', { name: 'Ham önerileri' })).findByRole('button', { name: /Ø50 × 125/ });
    expect(within(cubuk).getByText('HM-MET-C45-0001')).toBeTruthy();
    fireEvent.click(cubuk);
    expect(within(serit).getByRole('button', { name: 'HM-MET-C45-0001 kartını aç' })).toBeTruthy();
    expect(within(serit).getByRole('button', { name: 'Yine de yeni kart için yaz' })).toBeTruthy();
  });

  test('negatif ya da boş pay öneri üretmez, uyarı verir', async () => {
    sunucuKur(YAZAN, YOLLAR);
    await formAdiminiAc();
    const serit = await modelSec();
    fireEvent.change(within(serit).getByRole('textbox', { name: /İşleme payı/ }), { target: { value: '-1' } });
    expect(await within(serit).findByText('Sıfır ya da pozitif bir sayı yazın.')).toBeTruthy();
    expect(within(serit).queryByRole('group', { name: 'Ham önerileri' })).toBeNull();
  });

  test('aynı kesitte hem benzer hem aynı kart varsa sıradan bağımsız olarak aynı kart önerilir', async () => {
    // Liste sırasında önce durum farklı (benzer) kart, sonra boyu farklı ama kalite, form, kesit ve durum aynı kart.
    const benzer = { ...ornekKayit('mbenzer', 'HM-MET-C45-0002', 'Örnek benzer'), opts: { durum: 'Islah (+QT)' }, dims: { d: 50, l: 3000 } };
    const ayni = { ...ornekKayit('mayni', 'HM-MET-C45-0003', 'Örnek aynı'), dims: { d: 50, l: 6000 } };
    const kartlar = { ...ORNEK_KARTLAR, satirlar: [
      { kimlik: 'mbenzer', no: 5, kayit: benzer, surum: 1 }, { kimlik: 'mayni', no: 6, kayit: ayni, surum: 1 }, ...ORNEK_KARTLAR.satirlar,
    ], toplam: 5 };
    sunucuKur(YAZAN, { ...YOLLAR, 'GET /malzeme-katalogu-kartlari': () => json(200, kartlar) });
    await formAdiminiAc();
    const serit = await modelSec();
    const cubuk = await within(within(serit).getByRole('group', { name: 'Ham önerileri' })).findByRole('button', { name: /Ø50 × 125/ });
    expect(within(cubuk).getByText('kartı var')).toBeTruthy();
    expect(within(cubuk).queryByText('HM-MET-C45-0002')).toBeNull();
    expect(within(cubuk).getByText(/HM-MET-C45-000[13]/)).toBeTruthy();
  });

  test('yalnız durumu farklı kart varsa "benzer kart var" denir', async () => {
    const kaynak = { ...ornekKayit('mornek1', 'HM-MET-C45-0001', 'Örnek çubuk C45 Ø99'), dims: { d: 99, l: 1000 } };
    const benzer = { ...ornekKayit('mbenzer', 'HM-MET-C45-0002', 'Örnek benzer'), opts: { durum: 'Islah (+QT)' } };
    const kartlar = { ...ORNEK_KARTLAR, satirlar: [{ kimlik: 'mornek1', no: 1, kayit: kaynak, surum: 4 }, { kimlik: 'mbenzer', no: 5, kayit: benzer, surum: 1 }], toplam: 2 };
    sunucuKur(YAZAN, { ...YOLLAR, 'GET /malzeme-katalogu-kartlari': () => json(200, kartlar) });
    await formAdiminiAc();
    const serit = await modelSec();
    const cubuk = await within(within(serit).getByRole('group', { name: 'Ham önerileri' })).findByRole('button', { name: /Ø50 × 125/ });
    expect(within(cubuk).getByText('benzer kart var')).toBeTruthy();
    expect(within(cubuk).getByText('HM-MET-C45-0002')).toBeTruthy();
  });

  test('3B model okuma yetkisi yoksa şerit görünmez, form her zamanki gibidir', async () => {
    const istekler = sunucuKur(YAZAN, { 'GET /geometri/modeller': () => json(403, { kod: 'YETKISIZ', mesaj: 'Yetki yok.' }) });
    await formAdiminiAc();
    await vi.waitFor(() => { expect(istekler.some((i) => i.yol.startsWith('/geometri/modeller'))).toBe(true); });
    await vi.waitFor(() => { expect(screen.queryByRole('region', { name: '3B modelden öner' })).toBeNull(); });
    expect(screen.getByRole('heading', { name: 'Form ve ölçüler' })).toBeTruthy();
  });
});
