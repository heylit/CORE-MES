import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { csvIndir } from '../veri/csv.ts';
import { grupOgeleri, Tablo, tabloCsvSatirlari, type Sutun, type TabloAraci } from './Tablo.tsx';
import { tabloTercihleriniSifirla } from '../veri/tablo-tercihi.ts';

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

  it('boş hücre kesilmez, "—" ve gizli "Girilmemiş" yazar', () => {
    render(<Tablo etiket="Gider" kip="kaydir" sutunlar={[{ anahtar: 'b', baslik: 'Boş', kes: true, hucre: () => null }]} satirlar={[KIRA]} satirAnahtari={(s) => s.no} />);
    expect(document.querySelector('.tc-tablo-kes')).toBeNull();
    expect(screen.getByText('Girilmemiş')).toBeTruthy();
  });
});

describe('Tablo grupları (3284)', () => {
  interface G { no: number; ad: string; tur: string; kat: string }
  const GS: readonly Sutun<G>[] = [{ anahtar: 'ad', baslik: 'Ad', hucre: (s) => s.ad }];
  const VERI: G[] = [
    { no: 1, ad: 'ORN-A', tur: 'hm', kat: 'metal' },
    { no: 2, ad: 'ORN-B', tur: 'sf', kat: 'takim' },
    { no: 3, ad: 'ORN-C', tur: 'hm', kat: 'plastik' },
    { no: 4, ad: 'ORN-D', tur: 'hm', kat: 'metal' },
  ];
  const yol = (s: G) => [s.tur, s.kat];

  it('grup sırası ilk görünüş sırasıdır; aynı gruptaki satırlar bir araya gelir', () => {
    const o = grupOgeleri(VERI, yol).map((x) => (x.tur === 'grup' ? `g:${x.yol.join('/')}:${String(x.satirlar.length)}` : x.satir.ad));
    expect(o).toEqual(['g:hm:3', 'g:hm/metal:2', 'ORN-A', 'ORN-D', 'g:hm/plastik:1', 'ORN-C', 'g:sf:1', 'g:sf/takim:1', 'ORN-B']);
  });

  it('boş yol grupsuz satırdır', () => {
    expect(grupOgeleri([VERI[0]!], () => [])).toEqual([{ tur: 'satir', satir: VERI[0] }]);
  });

  it('grup verilmezse başlık satırı çizilmez', () => {
    render(<Tablo etiket="Liste" sutunlar={GS} satirlar={VERI} satirAnahtari={(s) => s.no} />);
    expect(screen.queryAllByRole('button', { expanded: true })).toHaveLength(0);
    expect(screen.getAllByRole('row')).toHaveLength(5);
  });

  it('başlık sayıyı yazar; katlanınca alt satırlar gizlenir, açılınca döner', () => {
    render(
      <Tablo
        etiket="Liste" sutunlar={GS} satirlar={VERI} satirAnahtari={(s) => s.no}
        grup={{ yol, baslik: (y) => `T ${y.join('/')}`, sayi: (y) => (y.length === 1 && y[0] === 'hm' ? 30 : 1) }}
      />,
    );
    const hm = screen.getByRole('button', { name: /T hm 30/ });
    expect(hm.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(hm);
    expect(hm.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByText('ORN-A')).toBeNull();
    expect(screen.queryByRole('button', { name: /T hm\/metal/ })).toBeNull();
    expect(screen.getByText('ORN-B')).toBeTruthy();
    fireEvent.click(hm);
    expect(screen.getByText('ORN-A')).toBeTruthy();
  });

  it('alt grup tek başına katlanır; sayı verilmezse satır sayısı yazılır', () => {
    render(<Tablo etiket="Liste" sutunlar={GS} satirlar={VERI} satirAnahtari={(s) => s.no} grup={{ yol, baslik: (y) => `T ${y.join('/')}` }} />);
    fireEvent.click(screen.getByRole('button', { name: /T hm\/metal 2/ }));
    expect(screen.queryByText('ORN-A')).toBeNull();
    expect(screen.getByText('ORN-C')).toBeTruthy();
  });

  it('başlığın önündeki denetim grubun satırlarını alır', () => {
    const on = vi.fn(() => <span>on</span>);
    render(<Tablo etiket="Liste" sutunlar={GS} satirlar={VERI} satirAnahtari={(s) => s.no} grup={{ yol: (s) => [s.tur], baslik: (y) => y[0], on }} />);
    expect(on).toHaveBeenCalledWith(['hm'], [VERI[0], VERI[2], VERI[3]]);
  });
});

describe('Tablo standardı (3748)', () => {
  afterEach(() => { cleanup(); tabloTercihleriniSifirla(); localStorage.clear(); });
  interface K { no: number; ad: string; kalite: string | null; olcu: string | null }
  const S3748: readonly Sutun<K>[] = [
    { anahtar: 'ad', baslik: 'Kalem', hucre: (k) => k.ad },
    { anahtar: 'kalite', baslik: 'Kalite', hucre: (k) => k.kalite, bossaGizle: true },
    { anahtar: 'olcu', baslik: 'Ölçü', hucre: (k) => k.olcu, bossaGizle: true },
  ];
  const L: K[] = [{ no: 1, ad: 'ORN-MIL-20', kalite: null, olcu: 'Ø20' }, { no: 2, ad: 'ORN-PUL-8', kalite: '', olcu: null }];
  const ciz = (arac?: TabloAraci<K>) => render(<Tablo etiket="Kalemler" sutunlar={S3748} satirlar={L} satirAnahtari={(k) => k.no} arac={arac} />);
  const basliklar = () => screen.getAllByRole('columnheader').map((h) => h.textContent);

  it('bütün satırlarda boş olan sütun çizilmez; bir satırda dolu olan kalır', () => {
    ciz();
    expect(basliklar()).toEqual(['Kalem', 'Ölçü']);
  });

  it('gizlenen sütun CSV\'de kalır', () => {
    ciz({ csv: { ad: 'kalem' } });
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    expect(vi.mocked(csvIndir).mock.lastCall?.[1]).toEqual(['Kalem', 'Kalite', 'Ölçü']);
  });

  it('Görünüm menüsünde sütun gizlenir ve tabloya göre saklanır; ilk sütun listede yok', () => {
    ciz({ gorunum: { anahtar: 'deneme-kalem' } });
    fireEvent.click(screen.getByText('Görünüm'));
    expect(screen.queryByRole('checkbox', { name: 'Kalem' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ölçü' }));
    expect(basliklar()).toEqual(['Kalem']);
    expect(localStorage.getItem('tmi:tablo:sutun:deneme-kalem')).toBe('olcu');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ölçü' }));
    expect(basliklar()).toEqual(['Kalem', 'Ölçü']);
  });

  it('satır aralığı seçimi kabın işaretine yazılır ve saklanır', () => {
    const { container } = ciz({ gorunum: { anahtar: 'deneme-kalem' } });
    expect(container.querySelector('.tc-tablo-kap')?.hasAttribute('data-yogunluk')).toBe(false);
    fireEvent.click(screen.getByText('Görünüm'));
    fireEvent.click(screen.getByRole('radio', { name: 'Yoğun' }));
    expect(container.querySelector('.tc-tablo-kap')?.getAttribute('data-yogunluk')).toBe('yogun');
    expect(localStorage.getItem('tmi:tablo:yogunluk')).toBe('yogun');
  });

  it('gorunum verilmeyen tabloda menü yok', () => {
    ciz({ csv: { ad: 'kalem' } });
    expect(screen.queryByText('Görünüm')).toBeNull();
  });
});

describe('Açılır satır ve gruplama seçimi (3797)', () => {
  afterEach(() => { cleanup(); tabloTercihleriniSifirla(); localStorage.clear(); });
  interface T { no: string; durum: string; kalemler: string[] }
  const SUT: readonly Sutun<T>[] = [{ anahtar: 'no', baslik: 'No', hucre: (t) => t.no }, { anahtar: 'durum', baslik: 'Durum', hucre: (t) => t.durum }];
  const L: T[] = [
    { no: 'ORN-1', durum: 'Onayda', kalemler: ['ORN-MIL-20'] },
    { no: 'ORN-2', durum: 'Satın almada', kalemler: [] },
    { no: 'ORN-3', durum: 'Onayda', kalemler: ['ORN-PUL-8'] },
  ];
  const ayrinti = (t: T) => (t.kalemler.length ? <ul>{t.kalemler.map((k) => <li key={k}>{k}</li>)}</ul> : null);
  const GRUPLAR = [{ anahtar: 'durum', baslik: 'Durum', yol: (t: T) => [t.durum] }];
  const ciz = (arac?: TabloAraci<T>) => render(<Tablo etiket="Talepler" sutunlar={SUT} satirlar={L} satirAnahtari={(t) => t.no} ayrinti={ayrinti} arac={arac} />);

  it('ok düğmesi satırın altındaki ayrıntıyı açar ve kapatır; ayrıntısı olmayan satırda ok yok', () => {
    ciz();
    expect(screen.queryByText('ORN-MIL-20')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Aç: ORN-2' })).toBeNull();
    const ok = screen.getByRole('button', { name: 'Aç: ORN-1' });
    fireEvent.click(ok);
    expect(screen.getByText('ORN-MIL-20')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Kapat: ORN-1' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Kapat: ORN-1' }));
    expect(screen.queryByText('ORN-MIL-20')).toBeNull();
  });

  it('satıra basmak açar; satırdaki düğmeye basmak açmaz', () => {
    const { container } = ciz();
    fireEvent.click(screen.getByText('ORN-3'));
    expect(screen.getByText('ORN-PUL-8')).toBeTruthy();
    expect(container.querySelector('tr[data-satir="ORN-3"]')?.hasAttribute('data-acik')).toBe(true);
  });

  it('Görünüm menüsünde Grupla: varsayılan grup çizilir, Yok seçilince kalkar ve seçim saklanır', () => {
    const { container } = ciz({ gorunum: { anahtar: 'deneme-talep', gruplar: GRUPLAR, varsayilanGrup: 'durum' } });
    const gruplar = () => [...container.querySelectorAll('tr.tc-tablo-grup')].map((g) => g.textContent);
    expect(gruplar()).toEqual(['Onayda2', 'Satın almada1']);
    fireEvent.click(screen.getByText('Görünüm'));
    fireEvent.click(screen.getByRole('radio', { name: 'Yok' }));
    expect(gruplar()).toEqual([]);
    expect(localStorage.getItem('tmi:tablo:grup:deneme-talep')).toBe('yok');
  });

  it('gruplar verilmeyen tabloda Grupla seçimi yok', () => {
    ciz({ gorunum: { anahtar: 'deneme-talep' } });
    fireEvent.click(screen.getByText('Görünüm'));
    expect(screen.queryByText('Grupla')).toBeNull();
  });
});
