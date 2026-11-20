import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import type { PlanOnTalep } from '#paylasilan/sozlesme/satin-alma.ts';
import type { PlanSatiri } from './kurallar.ts';
import { TopluPlan, type TopluPlanOzellikleri } from './TopluPlan.tsx';

// Veri uydurmadır (ORN-). Taban 2026-11-23 Pazartesi; şimdi tabanın ilk saati.
const TABAN = Date.UTC(2026, 10, 23);
const G = 24;
const satir = (kod: string, gun: number, q: number, tur: PlanSatiri['tur'], j = 'E-1'): PlanSatiri => ({
  kod, j, q, tur, alimNo: null, ihtiyac: gun * G + 6, alim: gun * G, tedarikci: null, fiyat: null, tutar: null, gecikti: false,
});
const SATIRLAR = [satir('11', 1, 20, 'yeni', 'E-1'), satir('11', 2, 35, 'yeni', 'E-2'), satir('11', 0, 40, 'stok'), satir('12', 0, 120, 'stok')];

let gelen: { taslak: PlanOnTalep[] } | null = null;
function Talep() { gelen = useLocation().state as { taslak: PlanOnTalep[] }; return <p>talep formu</p>; }

function ciz(ek: Partial<TopluPlanOzellikleri> = {}) {
  gelen = null;
  const oz: TopluPlanOzellikleri = {
    satirlar: SATIRLAR, taban: TABAN, simdi: 1, dar: false, stok: (k) => (k === '11' ? 60 : 900), malzemeAdi: (k) => (k === '11' ? 'ORN Cubuk' : 'ORN Civata'),
    birim: () => 'kg', kart: (k) => ({ kod: `HM-ORN-${k}`, birim: k === '11' ? 'kg' : 'adet' }), emirNo: (j) => `UE-${j}`, talepAcar: true, talepler: new Map(), ...ek,
  };
  render(
    <MemoryRouter initialEntries={['/plan/malzplan']}>
      <Routes>
        <Route path="/plan/malzplan" element={<TopluPlan {...oz} />} />
        <Route path="/taleplerim" element={<Talep />} />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(cleanup);

describe('TopluPlan', () => {
  it('günlük tüketimi ve eksiği gösterir; eksikli malzeme seçili gelir', () => {
    ciz();
    const tablo = screen.getByRole('table', { name: 'Günlük tüketim' });
    expect(within(tablo).getByText('ORN Cubuk')).toBeTruthy();
    expect(within(tablo).getByText('eksik 20 kg')).toBeTruthy();
    expect(within(tablo).getByText('yetiyor')).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: 'ORN Cubuk seç' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('checkbox', { name: 'ORN Civata seç' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Talep aç (2 kalem)' })).toBeTruthy();
  });

  it('günlük toplamada her gün ayrı kalem olarak taleplerim formuna gider', () => {
    ciz();
    fireEvent.click(screen.getByRole('button', { name: 'Talep aç (2 kalem)' }));
    expect(screen.getByText('talep formu')).toBeTruthy();
    expect(gelen?.taslak.map((t) => [t.malzeme.no, t.malzeme.kod, t.miktar, t.birim, t.gerekenTarih, t.emirler])).toEqual([
      [11, 'HM-ORN-11', 20, 'kg', '2026-11-24', ['UE-E-1']],
      [11, 'HM-ORN-11', 35, 'kg', '2026-11-25', ['UE-E-2']],
    ]);
  });

  it('haftalık toplama tek kalem yapar, teslim ilk eksik gündür', () => {
    ciz();
    fireEvent.click(within(screen.getByRole('group', { name: 'Talebi topla' })).getByRole('button', { name: 'Haftalık' }));
    fireEvent.click(screen.getByRole('button', { name: 'Talep aç (1 kalem)' }));
    expect(gelen?.taslak.map((t) => [t.miktar, t.gerekenTarih])).toEqual([[55, '2026-11-24']]);
  });

  it('her N günde seçilince gün sayısı girilir', () => {
    ciz();
    fireEvent.click(within(screen.getByRole('group', { name: 'Talebi topla' })).getByRole('button', { name: 'Her N günde' }));
    fireEvent.change(screen.getByRole('spinbutton', { name: 'Gün sayısı' }), { target: { value: '1' } });
    expect(screen.getByRole('button', { name: 'Talep aç (2 kalem)' })).toBeTruthy();
  });

  it('açık talep eksikten düşer ve rozet olur; yetkisiz kullanıcıda seçim ve şerit yok', () => {
    ciz({ talepler: new Map([['11', 20]]) });
    expect(screen.getByText('talepte 20 kg')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Talep aç (1 kalem)' })).toBeTruthy();
    cleanup();
    ciz({ talepAcar: false });
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Toplu talep' })).toBeNull();
  });

  it('açık talepler okunamazsa söyler; dar ekranda yalnız eksik günler, istenince bütün günler', () => {
    ciz({ talepler: null, dar: true });
    expect(screen.getByText(/Açık talepler okunamadı/)).toBeTruthy();
    expect(screen.queryByText('40 kg', { selector: 'td' })).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Bütün günler' })[0]!);
    expect(screen.getByRole('button', { name: 'Yalnız eksik günler' })).toBeTruthy();
  });

  it('dar ekranda şerit tek satır: kalem sayısı ve Talep aç', () => {
    ciz({ dar: true });
    const serit = screen.getByRole('region', { name: 'Toplu talep' });
    expect(within(serit).getByText('2 kalem')).toBeTruthy();
    expect(within(serit).getByRole('button', { name: 'Talep aç' })).toBeTruthy();
  });

  it('malzeme no sayı değilse seçilemez ve talebe girmez', () => {
    ciz({ satirlar: [satir('ORN-X', 1, 20, 'yeni')], stok: () => 0 });
    expect(screen.getByText('ORN Civata')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Toplu talep' })).toBeNull();
  });
});
