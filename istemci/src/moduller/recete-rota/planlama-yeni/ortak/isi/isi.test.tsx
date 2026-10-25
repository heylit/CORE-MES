import { afterEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { Acilim, IsiIzgarasi, IsiSayfasi, Lejant, type IsiSatiri, type IsiSecimi } from './index.ts';

// Satır ve değerler uydurmadır.
afterEach(() => { cleanup(); });

const SUTUN = [{ k: 'p0', ad: '05.10', alt: 'hafta', bugun: true }, { k: 'p1', ad: '12.10', alt: 'hafta' }];
const SATIR: IsiSatiri[] = [
  { k: 'a', ad: 'Torna', alt: 'tezgâh sınırlı', simge: 'layers', ton: 'hata', h: { p0: { v: '120', kd: 4, sm: 'alert', etiket: '%120 dolu' }, p1: { v: '40', kd: 0, etiket: '%40 dolu' } } },
  { k: 'b', ad: 'Freze', simge: 'layers', gizli: true, h: { p0: { v: '10', kd: 0, etiket: '%10 dolu' } } },
];

function Deneme({ kaydet = vi.fn(), yap = vi.fn() }: { kaydet?: () => void; yap?: () => void }) {
  const [secim, sec] = useState<IsiSecimi | null>(null);
  return (
    <IsiSayfasi simge="chart" baslik="Yıllık plan" alt="Tezgâh grubu × dönem" ust={{ ton: 'hata', simge: 'chart', metin: 'En sıcak blok Torna' }} tum={<p>Asıl sayfa</p>}>
      <Lejant ogeler={[{ tur: 'kd', kd: 1, ad: '%50-75' }, { tur: 'kd', kd: 4 }]} simgeler={[['clock', 'Ek mesai']]} />
      <IsiIzgarasi etiket="Tezgâh grubu × dönem" satirAd="Tezgâh grubu" genis="donem" sutunlar={SUTUN} satirlar={SATIR} secim={secim} sec={sec} gizliAd="boş gruplar"
        acilim={(r, c, kapat) => (
          <Acilim baslik={`${r.ad} · ${c}`} ton="hata" neden="Kapasite aşılıyor." bilgi={[['Yük', '120 sa'], ['Kapasite', null]]} kapat={kapat}
            form={<form aria-label="Deneme formu" onSubmit={(o) => { o.preventDefault(); kaydet(); }}><fieldset><input aria-label="Sınır" /></fieldset><button type="submit">Kaydet</button></form>}
            secenekler={[{ ad: 'Yeniden çöz', etki: 'Hepsi', simge: 'cpu', yap }, { ad: 'Motor', simge: 'play', pasif: true }, { ad: 'Üçüncü', simge: 'x', yap }]} />
        )} />
    </IsiSayfasi>
  );
}

describe('Ortak ısı haritası', () => {
  it('başlık, durum, lejant, ızgara; gizli satır düğmeyle açılır; Tüm satırlar asıl sayfayı taşır', () => {
    render(<Deneme />);
    expect(screen.getByRole('heading', { name: /Yıllık plan/ }).textContent).toContain('Tezgâh grubu × dönem');
    expect(screen.getByRole('status').textContent).toBe('En sıcak blok Torna');
    expect(document.querySelector('.tc-isi-lejant')?.textContent).toBe('%50-75Termini kaydırırEk mesai');
    const izgara = screen.getByRole('group', { name: 'Tezgâh grubu × dönem' });
    expect(within(izgara).getAllByRole('button').map((b) => b.getAttribute('aria-label'))).toEqual(['Torna, 05.10 hafta: %120 dolu', 'Torna, 12.10 hafta: %40 dolu']);
    fireEvent.click(screen.getByRole('button', { name: '1 satır daha göster (boş gruplar)' }));
    expect(within(izgara).getByRole('button', { name: 'Freze, 05.10 hafta: %10 dolu' })).toBeTruthy();
    expect(screen.getByText('Tüm satırlar')).toBeTruthy();
    expect(screen.getByText('Asıl sayfa')).toBeTruthy();
  });

  it('hücre açılımı satırın altında: neden, bilgi (veri yoksa çizgi), form, en çok iki seçenek, pasif seçenek basılmaz; odak forma gider', async () => {
    const yap = vi.fn();
    render(<Deneme yap={yap} />);
    const hucre = screen.getByRole('button', { name: 'Torna, 05.10 hafta: %120 dolu' });
    fireEvent.click(hucre);
    expect(hucre.getAttribute('aria-pressed')).toBe('true');
    const ac = screen.getByRole('region', { name: 'Torna · p0' });
    expect(within(ac).getByText('Kapasite aşılıyor.')).toBeTruthy();
    expect([...ac.querySelectorAll('dd')].map((x) => x.textContent)).toEqual(['120 sa', '—']);
    const sec = within(ac).getAllByRole('button').filter((b) => b.classList.contains('tc-isi-secenek'));
    expect(sec.map((b) => b.textContent)).toEqual(['Yeniden çözHepsi', 'Motor']);
    expect((sec[1] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(sec[0] as HTMLElement);
    expect(yap).toHaveBeenCalledTimes(1);
    await waitFor(() => { expect(document.activeElement).toBe(within(ac).getByRole('textbox', { name: 'Sınır' })); });
  });

  it('Esc ve Kapat açılımı kapatır, odak hücreye döner; aynı hücreye ikinci tık da kapatır', async () => {
    render(<Deneme />);
    const hucre = screen.getByRole('button', { name: 'Torna, 05.10 hafta: %120 dolu' });
    fireEvent.click(hucre);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Torna · p0' })).toBeNull();
    await waitFor(() => { expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Torna, 05.10 hafta: %120 dolu' })); });
    fireEvent.click(screen.getByRole('button', { name: 'Torna, 12.10 hafta: %40 dolu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByRole('region', { name: 'Torna · p1' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Torna, 12.10 hafta: %40 dolu' }));
    fireEvent.click(screen.getByRole('button', { name: 'Torna, 12.10 hafta: %40 dolu' }));
    expect(screen.queryByRole('region', { name: 'Torna · p1' })).toBeNull();
  });
});
