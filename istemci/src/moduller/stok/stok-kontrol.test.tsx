import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { ArtikParcalarCevabi, IhtiyaclarCevabi, OlcuAramaCevabi } from '#paylasilan/sozlesme/stok-kontrol.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { DEPOCU, ac, json, sunucuKur } from './test-ortak.tsx';

// Stok kontrol sayfası (3398 surum 4 a).
const SATIN_ALMA: Kullanici = { id: 8, ad: 'Deneme Satın Alma', islemler: ['satin-alma.yaz'] };
const KALITELER: OlcuAramaCevabi = { adaylar: [], karsilanan: null, gereken: null, olcusuzKart: 0, kaliteler: ['ORN-K1'] };
const SONUC: OlcuAramaCevabi = {
  adaylar: [
    { kaynak: 'artik', malzemeNo: 11, kod: 'ORN-HM-1', ad: 'Deneme çubuk', kalite: 'ORN-K1', form: 'cubuk', olcu: { d: 50, l: 1250 }, miktar: '1', birim: 'adet',
      konumlar: ['A-01-1'], artikId: 3, ilkGiris: '2026-11-01T10:00:00+03:00', durum: 'tam', fazla: {}, fireYuzde: 0, parcaSayisi: 6 },
    { kaynak: 'stok', malzemeNo: 12, kod: 'ORN-HM-2', ad: 'Deneme çubuk', kalite: 'ORN-K1', form: 'cubuk', olcu: { d: 55, l: 3000 }, miktar: '3', birim: 'adet',
      konumlar: ['A-02-1'], artikId: null, ilkGiris: '2026-10-01T10:00:00+03:00', durum: 'yakin', fazla: { d: 5 }, fireYuzde: 21, parcaSayisi: 48 },
  ],
  karsilanan: 40, gereken: 40, olcusuzKart: 1, kaliteler: ['ORN-K1'],
};
const ARTIKLAR: ArtikParcalarCevabi = {
  sinirli: false,
  satirlar: [{ id: 3, malzemeNo: 11, kod: 'ORN-HM-1', ad: 'Deneme çubuk', form: 'cubuk', konumId: 4, konumKod: 'A-01-1', partiId: null, olcu: { d: 50, l: 1250 },
    adet: 1, durum: 'acik', aciklama: null, kaydeden: 'Deneme Depocu', kayitZamani: '2026-11-01T10:00:00+03:00', surum: 1 }],
};

const IHTIYAC: IhtiyaclarCevabi = {
  sinirli: false,
  satirlar: [{ kaynak: 'satin-alma', talepId: 't1', talepNo: 'ST-2026-001', baslik: 'ORN talep', kalemId: 'k1', ad: 'ORN kalem', malzemeNo: 11, kod: 'ORN-HM-1',
    form: 'cubuk', kalite: 'ORN-K1', olcu: { d: 50, l: 3000 }, miktar: '3', birim: 'adet', uretimEmriId: null, ihtiyacTarihi: '2026-11-30',
    durum: 'kismen', karsilanan: 2, enIyi: SONUC.adaylar[1]!, adaySayisi: 1 }],
};

describe('Stok kontrol (3398)', () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it('açılışta teklif öncesi talepler: istenen, stoktan karşılanan, durum ve en uygun aday', async () => {
    sunucuKur(SATIN_ALMA, { 'GET /stok/kontrol-ihtiyaclari': () => json(200, IHTIYAC) });
    ac('/stok/kontrol');
    const tablo = await screen.findByRole('table', { name: 'Teklif öncesi talepler' });
    const satir = within(tablo).getAllByRole('row')[1]!;
    expect(within(satir).getByText('ST-2026-001')).toBeTruthy();
    expect(within(satir).getByText('3 adet')).toBeTruthy();
    expect(within(satir).getByText('2 adet')).toBeTruthy();
    expect(within(satir).getByText('Kısmen')).toBeTruthy();
    expect(within(satir).getByText('ORN-HM-2 · Ø55 × 3.000 mm · A-02-1')).toBeTruthy();
  });

  it('ölçüyle arar: seçilen pay ve ölçü sorguya gider, artık önce, yakın fazla mm ile, karşılanan başlıkta', async () => {
    const istekler = sunucuKur(SATIN_ALMA, {
      'GET /stok/olcu-arama': () => json(200, istekler.some((i) => i.yol.includes('d=50')) ? SONUC : KALITELER),
    });
    ac('/stok/kontrol');
    fireEvent.click(await screen.findByRole('tab', { name: 'Ölçüyle ara' }));
    const form = await screen.findByRole('form', { name: 'Ölçüyle ara' });
    const ara = within(form).getByRole('button', { name: 'Ara' }) as HTMLButtonElement;
    expect(ara.disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText('Çap (mm)'), { target: { value: '50' } });
    fireEvent.change(within(form).getByLabelText('Parça boyu (mm)'), { target: { value: '180' } });
    fireEvent.change(within(form).getByLabelText('Adet'), { target: { value: '40' } });
    fireEvent.change(within(form).getByLabelText('Fazla pay'), { target: { value: 'mm-5' } });
    fireEvent.click(ara);
    const tablo = await screen.findByRole('table', { name: 'Uygun stok' });
    const yol = istekler.filter((i) => i.yol.startsWith('/stok/olcu-arama') && i.yol.includes('d=50')).at(-1)!.yol;
    const p = new URLSearchParams(yol.split('?')[1]);
    expect([p.get('form'), p.get('d'), p.get('parcaBoyu'), p.get('adet'), p.get('pay'), p.get('payDeger'), p.get('artik')]).toEqual(['cubuk', '50', '180', '40', 'mm', '5', 'evet']);
    const satirlar = within(tablo).getAllByRole('row').slice(1);
    expect(within(satirlar[0]!).getByText('Artık')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('Yakın +5 mm')).toBeTruthy();
    expect(within(satirlar[1]!).getByText('%21')).toBeTruthy();
    expect(screen.getByText('Stokta karşılanan 40 / 40 parça')).toBeTruthy();
    expect(screen.getByText('Stoktan karşılanır')).toBeTruthy();
    expect(screen.getByRole('note').textContent).toContain('1 kart aranamadı');
  });

  it('elle fazla pay mm olarak gider', async () => {
    const istekler = sunucuKur(SATIN_ALMA, { 'GET /stok/olcu-arama': () => json(200, KALITELER) });
    ac('/stok/kontrol');
    fireEvent.click(await screen.findByRole('tab', { name: 'Ölçüyle ara' }));
    const form = await screen.findByRole('form', { name: 'Ölçüyle ara' });
    fireEvent.change(within(form).getByLabelText('Çap (mm)'), { target: { value: '50' } });
    fireEvent.change(within(form).getByLabelText('Fazla pay'), { target: { value: 'elle' } });
    fireEvent.change(within(form).getByLabelText('Fazla pay (mm)'), { target: { value: '7,5' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Ara' }));
    await waitFor(() => expect(istekler.some((i) => i.yol.includes('d=50'))).toBe(true));
    const p = new URLSearchParams(istekler.find((i) => i.yol.includes('d=50'))!.yol.split('?')[1]);
    expect([p.get('pay'), p.get('payDeger')]).toEqual(['mm', '7.5']);
  });

  it('artık parçalar: depocu onaylayıp kullanıldı der, sürümle gider; satın almada işlem düğmesi yok', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/olcu-arama': () => json(200, KALITELER),
      'GET /stok/artik-parcalar': () => json(200, ARTIKLAR),
      'POST /stok/artik-parcalar/3/kapat': () => json(200, { id: 3, surum: 2 }),
    });
    ac('/stok/kontrol');
    fireEvent.click(await screen.findByRole('tab', { name: 'Artık parçalar' }));
    const tablo = await screen.findByRole('table', { name: 'Artık parçalar' });
    expect(within(tablo).getByText('Ø50 × 1.250 mm')).toBeTruthy();
    fireEvent.click(within(tablo).getByRole('button', { name: 'Kullanıldı' }));
    // Tek tıkla kapanmaz: onay penceresi geri alınamaz der.
    const onay = await screen.findByRole('dialog', { name: 'Artık kullanıldı' });
    expect(onay.textContent).toContain('geri alınamaz');
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    fireEvent.click(within(onay).getByRole('button', { name: 'Kullanıldı' }));
    await waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ durum: 'kullanildi', surum: 1 }));
    cleanup();
    sunucuKur(SATIN_ALMA, { 'GET /stok/olcu-arama': () => json(200, KALITELER), 'GET /stok/artik-parcalar': () => json(200, ARTIKLAR) });
    ac('/stok/kontrol');
    fireEvent.click(await screen.findByRole('tab', { name: 'Artık parçalar' }));
    const t2 = await screen.findByRole('table', { name: 'Artık parçalar' });
    expect(within(t2).getByText('ORN-HM-1')).toBeTruthy();
    expect(within(t2).queryByRole('button', { name: 'Kullanıldı' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kalan parça kaydet' })).toBeNull();
  });
});
