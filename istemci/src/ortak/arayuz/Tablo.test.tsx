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

// 2633 a: yapışık başlığın yatay kesmesi (tablo.css) yalnız ölçen ortak kaba uygulanır; sınıfı elle kullanan kap işaretsizdir ve kayar.
describe('Tablo kabı ölçen işareti', () => {
  it('satırlı ve iskelet kabı data-olcer taşır', () => {
    ac();
    expect(screen.getByRole('table', { name: 'Gider' }).closest('.tc-tablo-kap')?.hasAttribute('data-olcer')).toBe(true);
    cleanup();
    render(<Tablo etiket="Gider" sutunlar={SUTUNLAR} satirlar={[]} satirAnahtari={(s) => s.no} yukleniyor />);
    expect(document.querySelector('.tc-tablo-kap')?.hasAttribute('data-olcer')).toBe(true);
  });
});

// Kart 2905: kayan tablo sığmasa da kart kipine geçmez; sabit sütunlar yalnız bu kipte işaretlenir.
describe('Tablo kayan kip', () => {
  const SABITLI: readonly Sutun<Satir>[] = [{ ...SUTUNLAR[0]!, sabit: 'sol' }, SUTUNLAR[1]!, { ...SUTUNLAR[2]!, sabit: 'sag' }];
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it('sığmayan kayan tablo tablo kalır, kabı ölçülmez ve kaydırma işareti taşır', () => {
    vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockImplementation(() => 300);
    vi.spyOn(HTMLElement.prototype, 'scrollWidth', 'get').mockImplementation(() => 1200);
    render(<Tablo etiket="Gider" kip="kaydir" sutunlar={SABITLI} satirlar={SATIRLAR} satirAnahtari={(s) => s.no} />);
    const kap = screen.getByRole('table', { name: 'Gider' }).closest('.tc-tablo-kap')!;
    expect(kap.hasAttribute('data-kip')).toBe(false);
    expect(kap.hasAttribute('data-kaydir')).toBe(true);
    expect(kap.hasAttribute('data-olcer')).toBe(false);
  });

  it('sabit sütunun başlığı ve hücreleri sol ya da sağ işareti alır; ortadaki almaz', () => {
    render(<Tablo etiket="Gider" kip="kaydir" sutunlar={SABITLI} satirlar={[KIRA]} satirAnahtari={(s) => s.no} />);
    const [ad, tutar, islem] = screen.getAllByRole('cell');
    expect(ad?.classList.contains('tc-tablo-sabit-sol')).toBe(true);
    expect(tutar?.className ?? '').not.toContain('tc-tablo-sabit');
    expect(islem?.classList.contains('tc-tablo-sabit-sag')).toBe(true);
    expect(screen.getByRole('columnheader', { name: 'Ad' }).classList.contains('tc-tablo-sabit-sol')).toBe(true);
  });

  it('uyarlanan tabloda sabit işareti yok sayılır', () => {
    render(<Tablo etiket="Gider" sutunlar={SABITLI} satirlar={[KIRA]} satirAnahtari={(s) => s.no} />);
    expect(document.querySelector('.tc-tablo-sabit-sol, .tc-tablo-sabit-sag')).toBeNull();
    expect(document.querySelector('.tc-tablo-kap')?.hasAttribute('data-kaydir')).toBe(false);
  });
});

// Kart 2938: tek satır listelerde uzun yazı kesilir; tam metin ipucunda kalır.
describe('Tablo kesilen sütun', () => {
  const KESEN: readonly Sutun<Satir>[] = [
    { ...SUTUNLAR[0]!, sabit: 'sol', kes: true },
    { anahtar: 'not', baslik: 'Not', kes: true, csv: (s) => `Not ${s.ad}`, hucre: (s) => <strong>{s.ad}</strong> },
  ];

  it('kayan tabloda kesilen hücre ipucunda yazının tamamını taşır; yazı değilse CSV değerini', () => {
    render(<Tablo etiket="Gider" kip="kaydir" sutunlar={KESEN} satirlar={[KIRA]} satirAnahtari={(s) => s.no} />);
    const kesilen = document.querySelectorAll('.tc-tablo-kes');
    expect(kesilen).toHaveLength(2);
    expect(kesilen[0]?.getAttribute('title')).toBe('Kira');
    expect(kesilen[1]?.getAttribute('title')).toBe('Not Kira');
  });

  it('uyarlanan tabloda kesme işareti yok sayılır', () => {
    render(<Tablo etiket="Gider" sutunlar={KESEN} satirlar={[KIRA]} satirAnahtari={(s) => s.no} />);
    expect(document.querySelector('.tc-tablo-kes')).toBeNull();
  });

  it('boş hücre kesilmez, "yok" yazar', () => {
    render(<Tablo etiket="Gider" kip="kaydir" sutunlar={[{ anahtar: 'b', baslik: 'Boş', kes: true, hucre: () => null }]} satirlar={[KIRA]} satirAnahtari={(s) => s.no} />);
    expect(document.querySelector('.tc-tablo-kes')).toBeNull();
    expect(screen.getByText('yok')).toBeTruthy();
  });
});
