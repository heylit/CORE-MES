import { describe, expect, it } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { parcaKimligi } from '../yeni/parcalar/parca.ts';
import { kmAc, OKUYAN, YETKISIZ, type SunucuSecenegi } from '../yeni/test-ortak.tsx';
import { resimListesi } from './liste.ts';

// Uydurma deneme verisi: iki malzeme kartlı parça Parçalar'da, biri yalnız stüdyoda.
const KAYITLAR = {
  parca: [
    { _id: parcaKimligi('DNM-01'), parcaNo: 'DNM-01', malzemeNo: 1 },
    { _id: parcaKimligi('DNM-02'), parcaNo: 'DNM-02', malzemeNo: 2 },
    { _id: parcaKimligi('ESKI-1'), parcaNo: 'ESKI-1' },
  ],
};
const SECENEK: SunucuSecenegi = {
  parcalar: [
    { malzemeNo: 1, kod: 'DNM-01', ad: 'Deneme mili', aktif: true },
    { malzemeNo: 2, kod: 'DNM-02', ad: 'Deneme flanşı', aktif: true },
    { malzemeNo: 3, kod: 'DNM-03', ad: 'Deneme gövde', aktif: true },
  ],
  studyo: {
    ozetler: [
      { malzemeNo: 1, resim: 1, model: 1, balon: 4, numunePlani: 1 },
      { malzemeNo: 3, resim: 1, model: 0, balon: 0, numunePlani: 0 },
    ],
  },
};

describe('Resim ve modeller listesi (799)', () => {
  it('kural: resmi olmayan, balonu olmayan ve numune planı olmayan eksiktir; model eksik sayılmaz; kartsız parça satır değildir', () => {
    const l = resimListesi([2, undefined, 1, 2], [
      { malzemeNo: 1, resim: 2, model: 0, balon: 3, numunePlani: 1 },
      { malzemeNo: 5, resim: 1, model: 1, balon: 0, numunePlani: 0 },
    ]);
    expect(l.map((s) => [s.malzemeNo, s.eksik])).toEqual([[1, []], [2, ['resim', 'numune']], [5, ['balon', 'numune']]]);
  });

  it('parça seçilmeden bütün parçalar sayılarıyla ve eksikleriyle listelenir; süzgeç eksikleri ayırır', async () => {
    kmAc('resimler', OKUYAN, KAYITLAR, SECENEK);
    const tablo = await screen.findByRole('table', { name: 'Resim ve modeller' });
    const satir = (kod: string) => within(tablo).getByText(kod).closest('tr')!;
    expect(await within(tablo).findByText('Deneme flanşı')).toBeTruthy();
    expect(within(satir('DNM-01')).getByText('Tamam')).toBeTruthy();
    expect(within(satir('DNM-02')).getByText('Resim yok')).toBeTruthy();
    expect(within(satir('DNM-02')).getByText('Numune planı yok')).toBeTruthy();
    expect(within(satir('DNM-03')).getByText('Balon yok')).toBeTruthy();
    expect(within(tablo).queryByText('ESKI-1')).toBeNull();
    expect(screen.getByText('3 parça · 2 eksik')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Eksik' }));
    expect(within(tablo).queryByText('DNM-01')).toBeNull();
    expect(within(tablo).getByText('DNM-02')).toBeTruthy();
  });

  it('satıra tıklayınca parçanın stüdyosu açılır', async () => {
    kmAc('resimler', OKUYAN, KAYITLAR, SECENEK);
    const tablo = await screen.findByRole('table', { name: 'Resim ve modeller' });
    fireEvent.click(await within(tablo).findByText('DNM-03'));
    const sol = await screen.findByRole('complementary', { name: 'Parça ve resimler' });
    expect(await within(sol).findByText('Deneme gövde')).toBeTruthy();
  });

  it('okuma yetkisi olmayan liste görmez', async () => {
    kmAc('resimler', YETKISIZ, KAYITLAR, SECENEK);
    expect(await screen.findByText("Kalite Merkezi'ni görme yetkiniz yok.")).toBeTruthy();
    expect(screen.queryByRole('table', { name: 'Resim ve modeller' })).toBeNull();
  });
});
