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
    birim: () => 'kg', kart: (k) => ({ kod: `HM-ORN-${k}`, birim: k === '11' ? 'kg' : 'adet' }), emirNo: (j) => `UE-${j}`, talepAcar: true, talepler: new Map(),
    durum: (k) => (k === '11' ? 'verilmeli' : 'stokta'), gelisler: () => new Map(), siparisGunu: () => null, orta: false, ayrinti: () => undefined, ...ek,
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
    expect(within(tablo).getByText('eksik 55 kg')).toBeTruthy();
    expect(within(tablo).getByText('Sipariş verilmeli')).toBeTruthy();
    expect(within(tablo).getByText('Yetiyor')).toBeTruthy();
    expect((screen.getByRole('checkbox', { name: 'ORN Cubuk seç' }) as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByRole('checkbox', { name: 'ORN Civata seç' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Talep aç (2 kalem)' })).toBeTruthy();
  });

  it('ilk eksik bugünse "İlk eksiğe git" gösterilmez', () => {
    ciz({ satirlar: [satir('11', 0, 20, 'yeni')] });
    expect(screen.queryByRole('button', { name: /İlk eksiğe git/ })).toBeNull();
  });

  it('Stok yeter ilk eksik güne kadar gündür; eksiği olmayan malzemede 14+ gün', () => {
    ciz();
    const tablo = screen.getByRole('table', { name: 'Günlük tüketim' });
    expect(within(tablo).getByText('1 gün')).toBeTruthy();
    expect(within(tablo).getByText('14+ gün')).toBeTruthy();
  });

  it('satırdaki Talep yalnız o malzemenin eksiğini taslakla Taleplerim\'e götürür', () => {
    ciz();
    fireEvent.click(screen.getByRole('button', { name: 'ORN Cubuk için talep aç' }));
    expect(gelen?.taslak.map((t) => [t.malzeme.no, t.miktar])).toEqual([[11, 20], [11, 35]]);
    expect(screen.queryByRole('button', { name: 'ORN Civata için talep aç' })).toBeNull();
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

  it('dar ekranda şerit özeti, Seçimi kaldır ve Talep aç (kalem) düğmeleri tam etiketle görünür', () => {
    ciz({ dar: true });
    const serit = screen.getByRole('region', { name: 'Toplu talep' });
    expect(within(serit).getByText(/1 malzeme · 2 kalem/)).toBeTruthy();
    expect(within(serit).getByRole('button', { name: 'Seçimi kaldır' })).toBeTruthy();
    expect(within(serit).getByRole('button', { name: 'Talep aç (2 kalem)' })).toBeTruthy();
  });

  it('sipariş gelen gün "+N gelir" yazar, en geç sipariş günü saat simgesiyle işaretlenir', () => {
    ciz({ gelisler: (k) => new Map(k === '11' ? [[4 * G, 80]] : []), siparisGunu: (k) => (k === '11' ? 2 * G : null) });
    expect(screen.getByText('+80 kg gelir')).toBeTruthy();
    expect(screen.getAllByRole('img', { name: 'En geç sipariş günü' }).length).toBe(1);
  });

  it('orta genişlikte Durum sütunu yok; durum ve Talep malzeme adının altındadır, 7 gün gösterilir', () => {
    ciz({ orta: true });
    const tablo = screen.getByRole('table', { name: 'Günlük tüketim' });
    expect(within(tablo).queryByRole('columnheader', { name: 'Durum' })).toBeNull();
    expect(within(tablo).getByText('Sipariş verilmeli')).toBeTruthy();
    expect(within(tablo).getByRole('button', { name: 'ORN Cubuk için talep aç' })).toBeTruthy();
    expect(within(tablo).getAllByRole('columnheader').length).toBe(1 + 7);
  });

  it('İlk eksiğe git pencereyi ilk eksik günden bir gün öncesine kaydırır; Bugün geri getirir', () => {
    ciz({ orta: true, satirlar: [...SATIRLAR, satir('11', 9, 10, 'yeni', 'E-3')], stok: () => 0 });
    const tablo = () => screen.getByRole('table', { name: 'Günlük tüketim' });
    expect(within(tablo()).queryByText('02.12 Çar')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /İlk eksiğe git/ }));
    expect(within(tablo()).getAllByRole('columnheader')[1]!.textContent).toBe('23.11 Pzt');
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki gün' }));
    expect(within(tablo()).getAllByRole('columnheader')[1]!.textContent).toBe('24.11 Sal');
    fireEvent.click(screen.getByRole('button', { name: 'Bugün' }));
    expect((screen.getByRole('button', { name: 'Önceki gün' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('süzgeç ve arama; Ayrıntı malzemeyi bildirir', () => {
    let acilan = '';
    ciz({ ayrinti: (k) => { acilan = k; } });
    fireEvent.click(screen.getByRole('button', { name: /^Yetiyor/ }));
    expect(screen.queryByText('ORN Cubuk')).toBeNull();
    expect(screen.getByText('ORN Civata')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Tümü/ }));
    fireEvent.change(screen.getByRole('searchbox', { name: 'Malzeme ara' }), { target: { value: 'cubuk' } });
    expect(screen.queryByText('ORN Civata')).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Ayrıntı' })[0]!);
    expect(acilan).toBe('11');
  });

  it('malzeme no sayı değilse seçilemez ve talebe girmez', () => {
    ciz({ satirlar: [satir('ORN-X', 1, 20, 'yeni')], stok: () => 0 });
    expect(screen.getByText('ORN Civata')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('region', { name: 'Toplu talep' })).toBeNull();
  });
});
