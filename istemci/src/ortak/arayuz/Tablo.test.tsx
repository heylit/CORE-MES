import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { csvIndir } from '../veri/csv.ts';
import { Tablo, tabloCsvSatirlari, type Sutun, type TabloAraci } from './Tablo.tsx';

vi.mock('../veri/csv.ts', async (asil) => ({ ...await asil<object>(), csvIndir: vi.fn() }));

interface Satir { no: number; ad: string; tutar: number | null }
const SUTUNLAR: readonly Sutun<Satir>[] = [
  { anahtar: 'ad', baslik: 'Ad', hucre: (s) => s.ad },
  { anahtar: 'tutar', baslik: 'Tutar', hucre: (s) => (s.tutar === null ? null : <b>{s.tutar} TL</b>), csv: (s) => s.tutar },
  { anahtar: 'islem', baslik: 'İşlem', hucre: () => <button type="button">Aç</button>, csv: false },
];
const KIRA: Satir = { no: 1, ad: 'Kira', tutar: 1500.5 };
const SATIRLAR: Satir[] = [KIRA, { no: 2, ad: 'Elektrik', tutar: null }];

function ac(arac?: TabloAraci<Satir>, satirlar: readonly Satir[] = SATIRLAR) {
  render(<Tablo etiket="Gider" sutunlar={SUTUNLAR} satirlar={satirlar} satirAnahtari={(s) => s.no} arac={arac} />);
}

afterEach(() => { cleanup(); vi.mocked(csvIndir).mockClear(); });

describe('Tablo araç çubuğu', () => {
  it('araç verilmezse çubuk çizilmez; var olan kullanım değişmez', () => {
    ac();
    expect(screen.queryByRole('searchbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'CSV' })).toBeNull();
    expect(screen.getByRole('table', { name: 'Gider' })).toBeTruthy();
  });

  it('arama kutusu değeri ekrana bildirir', () => {
    const degistir = vi.fn();
    ac({ arama: { deger: '', degistir, etiket: 'Giderde ara' } });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Giderde ara' }), { target: { value: 'kira' } });
    expect(degistir).toHaveBeenCalledWith('kira');
  });

  it('süzgeç çipleri seçili olanı işaretler ve seçimi bildirir', () => {
    const sec = vi.fn();
    ac({ suzgec: { etiket: 'Tür', secili: '', sec, secenekler: [{ deger: '', baslik: 'Tümü' }, { deger: 'gider', baslik: 'Gider' }] } });
    const grup = screen.getByRole('group', { name: 'Tür' });
    expect(grup.querySelector('[aria-pressed="true"]')?.textContent).toBe('Tümü');
    fireEvent.click(screen.getByRole('button', { name: 'Gider' }));
    expect(sec).toHaveBeenCalledWith('gider');
  });

  it('boş listede de araç çubuğu kalır: arama geri alınabilir; CSV düğmesi pasiftir', () => {
    ac({ arama: { deger: 'yok', degistir: vi.fn() }, csv: { ad: 'gider' } }, []);
    expect(screen.getByRole('searchbox')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'CSV' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('CSV düğmesi görünen satırları başlıklarıyla aktarır; eylem sütunu girmez', () => {
    ac({ csv: { ad: 'gider' } });
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    expect(csvIndir).toHaveBeenCalledWith('gider', ['Ad', 'Tutar'], [['Kira', 1500.5], ['Elektrik', null]]);
  });

  it('CSV için ayrı satır listesi verilirse onu aktarır', () => {
    ac({ csv: { ad: 'gider', satirlar: [KIRA] } });
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    expect(csvIndir).toHaveBeenCalledWith('gider', ['Ad', 'Tutar'], [['Kira', 1500.5]]);
  });
});

describe('tabloCsvSatirlari', () => {
  it('csv işlevi varsa onu, yoksa metin ya da sayı hücreyi alır; öğe hücre boş kalır; false sütun atlanır', () => {
    const sutunlar: Sutun<Satir>[] = [
      { anahtar: 'no', baslik: 'No', hucre: (s) => s.no },
      { anahtar: 'ad', baslik: 'Ad', hucre: (s) => <i>{s.ad}</i> },
      ...SUTUNLAR.slice(1),
    ];
    expect(tabloCsvSatirlari(sutunlar, SATIRLAR)).toEqual({
      basliklar: ['No', 'Ad', 'Tutar'],
      satirlar: [[1, null, 1500.5], [2, null, null]],
    });
  });
});
