import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as gonder from '../motor/atolye/gonder.ts';
import * as planaAl from './plana-al.ts';
import type { KokpitEmri, KokpitIsi, KokpitModeli } from './kurallar.ts';
import { OdakPaneli } from './OdakPaneli.tsx';
import { EmirAdimlari, SiraSeridi } from './Yerlestirme.tsx';
import { siraKartlari } from './yerlestirme.ts';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Uydurma örnek (ORN-): planlı tek adımlı emir ve iki tezgâh adımlı, arada fason adımı olan plansız emir.
const is = (id: string, m: string, S: number, C: number): KokpitIsi => ({ id, job: id.split('.')[0] ?? '', ad: id, m, S, C, basladi: false, fason: false, kilitli: false, sira: 0 });
const PLANLI: KokpitEmri = { id: '1', no: 'ORN-UE-1', urun: 'ORN-Flanş', adet: 8, termin: 60, bitis: 12, durum: 'iyi', gecikme: -48, adimlar: [{ id: '1.10', ad: 'Torna', adaylar: ['T1'] }] };
const YENI: KokpitEmri = {
  id: '2', no: 'ORN-UE-2', urun: 'ORN-Burç', adet: 40, termin: 40, bitis: null, durum: 'plansiz', gecikme: null,
  adimlar: [{ id: '2.10', ad: 'Torna', adaylar: ['T1', 'T2'] }, { id: '2.20', ad: 'Kaplama', adaylar: ['@F1'], onculler: [['2.10', 'b']] }, { id: '2.30', ad: 'Freze', adaylar: ['F1', 'F2'], onculler: [['2.20', 'o']] }],
};
const M: KokpitModeli = {
  simdi: 8, tezgahlar: ['T1', 'T2', 'F1', 'F2'].map((id) => ({ id, kod: `ORN-${id}`, ad: '', fason: false })),
  isler: { '1.10': is('1.10', 'T1', 8, 12) }, emirler: [PLANLI, YENI], bas: 0, son: 336, acik: {}, durus: {},
};
const zaman = (t: number): string => `01.01 Pzt ${String(t).padStart(2, '0')}:00`;
// Önizleme uydurmadır: torna T1'de 12'de, T2'de 8'de başlar (6 saat); freze tornadan 10 saat sonra, F2'de 2 saat geç; bitiş frezenin sonu.
const onizlemeKur = () => vi.spyOn(planaAl, 'planaAlOnizle').mockImplementation((g) => {
  const freze = g.adimlar?.find((a) => a.isId === '2.30')?.tezgah ?? 'F1';
  const S = g.tezgah === 'T1' ? 12 : 8, F = S + 16 + (freze === 'F2' ? 2 : 0);
  return Promise.resolve({ calismaSurumu: 4, gecerli: true, ileti: null, bitis: F + 4, isler: [{ isId: '2.10', tezgah: g.tezgah, S, C: S + 6 }, { isId: '2.30', tezgah: freze, S: F, C: F + 4 }] });
});
const kart = (kok: string) => { const k = siraKartlari(M).find((x) => x.kok === kok); if (!k) throw new Error(kok); return k; };

describe('Kokpit sıra şeridi (3297)', () => {
  it('kartlar termin sırasıyla; yeni emir "Yeni", planlı "Planlı"; karta basınca seçilir', () => {
    const sec = vi.fn();
    render(<SiraSeridi kartlar={siraKartlari(M)} secili="2" sec={sec} zaman={zaman} />);
    const kartlar = within(screen.getByRole('region', { name: 'Siparişler, sırasıyla' })).getAllByRole('button');
    expect(kartlar.map((b) => b.getAttribute('data-kart'))).toEqual(['2', '1']);
    expect(kartlar[0]?.textContent).toContain('ORN-UE-2');
    expect(kartlar[0]?.textContent).toContain('Yeni');
    expect(kartlar[0]?.textContent).toContain('0 / 2 operasyon yerleşti');
    expect(kartlar[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(kartlar[1]?.textContent).toContain('Planlı');
    fireEvent.click(kartlar[1] as HTMLElement);
    expect(sec).toHaveBeenCalledWith('1');
  });

  it('sipariş kartı (3297-5 a): sipariş no, müşteri, emir sayısı ve termin; bağsız emir "Siparişsiz"; okuyamayan kişide emir no ve emir sayısı', () => {
    const bag = { '1': { siparis: '50', no: 'ORN-SP-50', musteri: 'ORN-Müşteri A', kalem: 1 } };
    const { unmount } = render(<SiraSeridi kartlar={siraKartlari(M, bag)} secili="sp:50" sec={vi.fn()} zaman={zaman} bagVar />);
    const kartlar = within(screen.getByRole('region', { name: 'Siparişler, sırasıyla' })).getAllByRole('button');
    expect(kartlar.map((b) => b.getAttribute('data-kart'))).toEqual(['2', 'sp:50']);
    expect(kartlar[1]?.textContent).toContain('ORN-SP-50');
    expect(kartlar[1]?.textContent).toContain('ORN-Müşteri A · 1 emir · termin');
    expect(kartlar[1]?.textContent).not.toContain('ORN-UE-1');
    expect(kartlar[0]?.textContent).toContain('Siparişsiz · ORN-Burç · termin');
    expect(kartlar[0]?.getAttribute('title')).toBe('Siparişe bağlı değil (stok ya da elle açılan emir)');
    unmount();
    // Siparişi okuyamayan kişi: kart yine siparişe göre toplanır, sipariş no ve müşteri yerine ilk emrin numarası yazar.
    render(<SiraSeridi kartlar={siraKartlari(M, { '1': { siparis: '50', no: null, musteri: null, kalem: null } })} secili={null} sec={vi.fn()} zaman={zaman} bagVar />);
    const kapali = screen.getAllByRole('button').find((b) => b.getAttribute('data-kart') === 'sp:50');
    expect(kapali?.textContent).toContain('ORN-UE-1');
    expect(kapali?.textContent).toContain('1 emir · termin');
    expect(kapali?.textContent).not.toContain('Müşteri');
  });

  it('bağ okunamadıysa hiçbir kart "Siparişsiz" diye işaretlenmez', () => {
    render(<SiraSeridi kartlar={siraKartlari(M)} secili={null} sec={vi.fn()} zaman={zaman} />);
    expect(screen.queryByText(/Siparişsiz/)).toBeNull();
  });

  it('emir yoksa boş durum yazılır', () => {
    render(<SiraSeridi kartlar={[]} secili={null} sec={vi.fn()} zaman={zaman} />);
    expect(screen.getByText('Planda ve sırada sipariş ya da emir yok.')).toBeTruthy();
  });
});

describe('Kokpit emirler ve operasyonlar (3297)', () => {
  it('sipariş kartında (3297-5 a) başlık sipariş no ve emir sayısıdır; siparişin bütün emirleri alt alta, yerleşmesi eksik olan önce', () => {
    const bag = { '1': { siparis: '50', no: 'ORN-SP-50', musteri: 'ORN-Müşteri A', kalem: 1 }, '2': { siparis: '50', no: 'ORN-SP-50', musteri: 'ORN-Müşteri A', kalem: 2 } };
    const k = siraKartlari(M, bag).find((x) => x.kok === 'sp:50');
    if (!k) throw new Error('kart');
    onizlemeKur();
    render(<EmirAdimlari m={M} kart={k} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} />);
    const bolum = screen.getByRole('region', { name: 'Emirler ve operasyonlar' });
    expect(within(bolum).getByRole('heading', { level: 2 }).textContent).toContain('2ORN-SP-50 · 2 emir ve operasyonları');
    expect([...bolum.querySelectorAll('[data-emir]')].map((e) => e.getAttribute('data-emir'))).toEqual(['2', '1']);
  });

  it('plansız emirde ilk adım seçili gelir, boş yerler en erken biten başta; yere basınca sıradaki adım seçilir, son adımda emir tek komutla yazılır', async () => {
    const oz = onizlemeKur();
    const uygula = vi.fn(), hedef = vi.fn();
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={uygula} surum={4} adimAc={vi.fn()} hedef={hedef} />);
    const bolum = screen.getByRole('region', { name: 'Emirler ve operasyonlar' });
    expect(bolum.querySelector('[data-adim="2.10"]')?.getAttribute('aria-pressed')).toBe('true');
    expect((bolum.querySelector('[data-adim="2.20"]') as HTMLButtonElement).disabled).toBe(true);
    const torna = await within(bolum).findByRole('group', { name: 'Torna için boş yerler' });
    await waitFor(() => { expect(torna.querySelectorAll('li')).toHaveLength(2); });
    const yerler = [...torna.querySelectorAll('li')];
    expect(yerler[0]?.textContent).toContain('ORN-T2 · Pzt 08:00 → 14:00');
    expect(yerler[0]?.textContent).toContain('En erken biten yer');
    expect(yerler[1]?.textContent).toContain('ORN-T1 · Pzt 12:00 → 18:00');
    // Tahta aynı hedefi işaretler: uygun tezgâhlar ve boş yerler.
    expect(hedef).toHaveBeenLastCalledWith(expect.objectContaining({ emirId: '2', adimId: '2.10', tezgahlar: ['T1', 'T2'], yerler: [expect.objectContaining({ tezgah: 'T2', enErken: true }), expect.objectContaining({ tezgah: 'T1' })] }));

    fireEvent.click(within(yerler[1] as HTMLElement).getByRole('button', { name: 'Yerleştir' }));
    expect(uygula).not.toHaveBeenCalled();
    expect((bolum.querySelector('[data-adim-satir="2.10"] select') as HTMLSelectElement).value).toBe('T1');
    const freze = await within(bolum).findByRole('group', { name: 'Freze için boş yerler' });
    await waitFor(() => { expect(freze.querySelectorAll('li')).toHaveLength(2); });
    // Freze adayları seçilen tornayla (T1) sorulur.
    expect(oz).toHaveBeenLastCalledWith({ emirId: '2', tezgah: 'T1', baslangic: 8, adimlar: [{ isId: '2.30', tezgah: 'F2' }] }, 4);
    expect(freze.querySelector('li')?.textContent).toContain('ORN-F1 · Pzt 28:00 → 32:00');

    fireEvent.click(within(freze.querySelectorAll('li')[1] as HTMLElement).getByRole('button', { name: 'Yerleştir' }));
    expect(uygula).toHaveBeenCalledTimes(1);
    expect(uygula).toHaveBeenCalledWith({ isId: '2.10', tezgah: 'T1', baslangic: 8, planaAl: '2', adimlar: [{ isId: '2.30', tezgah: 'F2' }] }, false);
  });

  it('İleriye yerleştir (seçimsiz): seçimsiz plana alır, tezgâhı sistem seçer; termini geçen yerleşim geç bırakır diye bildirilir', async () => {
    onizlemeKur();
    const uygula = vi.fn();
    const gec = { ...M, emirler: [PLANLI, { ...YENI, termin: 20 }] };
    const k = siraKartlari(gec).find((x) => x.kok === '2');
    if (!k) throw new Error('kart');
    render(<EmirAdimlari m={gec} kart={k} zaman={zaman} uygula={uygula} surum={4} adimAc={vi.fn()} />);
    const dugme = screen.getByRole('button', { name: 'İleriye yerleştir' });
    await waitFor(() => { expect((dugme as HTMLButtonElement).disabled).toBe(false); });
    fireEvent.click(dugme);
    expect(uygula).toHaveBeenCalledWith({ isId: '2.10', tezgah: 'T2', baslangic: 8, planaAl: '2' }, true);
  });

  it('planda yeri olan adım tezgâhı ve saatiyle yazılır; basınca tahtada açılır, sunucuya sorulmaz', () => {
    const oz = onizlemeKur();
    const adimAc = vi.fn();
    render(<EmirAdimlari m={M} kart={kart('1')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={adimAc} />);
    const adim = screen.getByRole('button', { name: /Torna/ });
    const satir = screen.getByRole('region', { name: 'Emirler ve operasyonlar' }).querySelector('[data-adim-satir="1.10"]') as HTMLElement;
    expect((within(satir).getByRole('combobox', { name: 'Torna tezgâhı' }) as HTMLSelectElement).value).toBe('T1');
    expect([...satir.querySelectorAll('td')].map((d) => d.textContent)).toEqual(['1', 'Torna', 'öncül yok', '4 sa', 'ORN-T1', '01.01 Pzt 08:00', '01.01 Pzt 12:00', 'Yerleşti']);
    fireEvent.click(adim);
    expect(adimAc).toHaveBeenCalledWith('1', '1.10');
    expect(oz).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'İleriye yerleştir' })).toBeNull();
  });

  it('durdurulup taşınan, sahada süren adımın başlangıcının altında "terminalde durdurulmayı bekliyor" yazar (3414-7 a)', () => {
    const m = { ...M, isler: { '1.10': { ...is('1.10', 'T1', 8, 12), durdurmaBekliyor: true } } };
    render(<EmirAdimlari m={m} kart={kart('1')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} />);
    expect(document.querySelector('[data-durdurma-bekliyor="1.10"]')?.textContent).toBe('terminalde durdurulmayı bekliyor; canlıda eski yerinde');
    cleanup();
    render(<EmirAdimlari m={M} kart={kart('1')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} />);
    expect(document.querySelector('[data-durdurma-bekliyor]')).toBeNull();
  });

  it('yazamayan kişi adımları görür, yerleştiremez', () => {
    onizlemeKur();
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={null} surum={4} adimAc={vi.fn()} />);
    expect(screen.getByText('Emri yalnız planı yazabilen kişi yerleştirir.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Torna/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Yerleştir' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'İleriye yerleştir' })).toBeNull();
  });

  it('aynı soru ikinci kez sunucuya gitmez; ortak sürüm değişince birikmiş seçim düşer ve yeniden sorulur', async () => {
    const oz = onizlemeKur();
    const { rerender } = render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} taslakVar />);
    const torna = await screen.findByRole('group', { name: 'Torna için boş yerler' });
    await waitFor(() => { expect(torna.querySelectorAll('li')).toHaveLength(2); });
    // Sistem seçimi ve torna adayları aynı iki soruyu sorar (T1, T2): sunucuya iki kez gidilir, dört kez değil.
    expect(oz).toHaveBeenCalledTimes(2);
    expect(torna.querySelector('[data-taslak-notu]')?.textContent).toMatch(/Taslağınızdaki değişiklikler/);
    fireEvent.click(within(torna.querySelectorAll('li')[1] as HTMLElement).getByRole('button', { name: 'Yerleştir' }));
    const tornaTezgahi = (): string => (screen.getByRole('region', { name: 'Emirler ve operasyonlar' }).querySelector('[data-adim-satir="2.10"] select') as HTMLSelectElement).value;
    expect(tornaTezgahi()).toBe('T1');
    rerender(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={vi.fn()} surum={5} adimAc={vi.fn()} taslakVar />);
    await waitFor(() => { expect(tornaTezgahi()).toBe(''); });
    await waitFor(() => { expect(oz).toHaveBeenLastCalledWith(expect.objectContaining({ emirId: '2' }), 5); });
  });

  it('elle yerleştirmede son adım emri terminden sonraya atıyorsa geç bırakır diye bildirilir (onay sorulur)', async () => {
    onizlemeKur();
    const uygula = vi.fn();
    const gec = { ...M, emirler: [PLANLI, { ...YENI, termin: 20 }] };
    const k = siraKartlari(gec).find((x) => x.kok === '2');
    if (!k) throw new Error('kart');
    render(<EmirAdimlari m={gec} kart={k} zaman={zaman} uygula={uygula} surum={4} adimAc={vi.fn()} />);
    const torna = await screen.findByRole('group', { name: 'Torna için boş yerler' });
    await waitFor(() => { expect(torna.querySelectorAll('li')).toHaveLength(2); });
    fireEvent.click(within(torna.querySelectorAll('li')[0] as HTMLElement).getByRole('button', { name: 'Yerleştir' }));
    const freze = await screen.findByRole('group', { name: 'Freze için boş yerler' });
    await waitFor(() => { expect(freze.querySelectorAll('li')).toHaveLength(2); });
    fireEvent.click(within(freze.querySelectorAll('li')[0] as HTMLElement).getByRole('button', { name: 'Yerleştir' }));
    // Torna T2'de 8'de, freze F1'de 24'te başlar, 28'de biter; termin 20.
    expect(uygula).toHaveBeenCalledWith({ isId: '2.10', tezgah: 'T2', baslangic: 8, planaAl: '2', adimlar: [{ isId: '2.30', tezgah: 'F1' }] }, true);
  });

  it('okunamayan önizleme bellekte tutulmaz: aynı soru yeniden sorulur ve yer gelir', async () => {
    const oz = vi.spyOn(planaAl, 'planaAlOnizle').mockResolvedValue(null);
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} />);
    expect(await screen.findByText(/uygun boş yer bulunamadı/)).toBeTruthy();
    oz.mockRestore();
    onizlemeKur();
    const bolum = screen.getByRole('region', { name: 'Emirler ve operasyonlar' });
    // Adım değiştirip geri dönmek aynı soruları yeniden sordurur.
    fireEvent.click(bolum.querySelector('[data-adim="2.30"]') as HTMLElement);
    fireEvent.click(bolum.querySelector('[data-adim="2.10"]') as HTMLElement);
    const torna = await screen.findByRole('group', { name: 'Torna için boş yerler' });
    await waitFor(() => { expect(torna.querySelectorAll('li')).toHaveLength(2); });
  });

  it('bir adım için en çok altı aday tezgâha sorulur', async () => {
    const oz = onizlemeKur();
    const cok = ['T1', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'T8'];
    const e: KokpitEmri = { ...YENI, adimlar: [{ id: '2.10', ad: 'Torna', adaylar: cok }] };
    const m = { ...M, tezgahlar: cok.map((id) => ({ id, kod: `ORN-${id}`, ad: '', fason: false })), emirler: [PLANLI, e] };
    const k = siraKartlari(m).find((x) => x.kok === '2');
    if (!k) throw new Error('kart');
    render(<EmirAdimlari m={m} kart={k} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} />);
    const torna = await screen.findByRole('group', { name: 'Torna için boş yerler' });
    await waitFor(() => { expect(torna.querySelectorAll('li')).toHaveLength(6); });
    expect(new Set(oz.mock.calls.map((x) => x[0].tezgah))).toEqual(new Set(cok.slice(0, 6)));
  });

  it('önizleme okunamazsa boş yer bulunamadı yazılır, toplu düğme kapalı kalır', async () => {
    vi.spyOn(planaAl, 'planaAlOnizle').mockResolvedValue(null);
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} />);
    expect(await screen.findByText(/uygun boş yer bulunamadı/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'İleriye yerleştir' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('Kokpit planlı operasyonu seç-yerleştir ile taşıma (3297-4)', () => {
  // Uydurma örnek: planlı emrin tornası T1'de 20-24; aday T1 ve T2. Önizleme T2'yi 8'de, T1'i 12'de verir; T3 geçersizdir.
  const E: KokpitEmri = { ...PLANLI, bitis: 24, adimlar: [{ id: '1.10', ad: 'Torna', adaylar: ['T1', 'T2', 'T3'] }] };
  const MT: KokpitModeli = { ...M, tezgahlar: ['T1', 'T2', 'T3'].map((id) => ({ id, kod: `ORN-${id}`, ad: '', fason: false })), isler: { '1.10': { ...is('1.10', 'T1', 20, 24), ad: 'Torna' }, '9.10': is('9.10', 'T1', 8, 12) }, emirler: [E] };
  const tasiOnizle = () => vi.spyOn(gonder, 'isTasiOnizle').mockImplementation((g) => Promise.resolve(g.tezgah === 'T3'
    ? { calismaSurumu: 4, gecerli: false, ileti: 'ORN-neden', isler: [] }
    : { calismaSurumu: 4, gecerli: true, ileti: null, isler: [{ isId: g.isId, tezgah: g.tezgah, S: g.baslangic, C: g.baslangic + 4, eskiTezgah: 'T1', eskiS: 20, tur: 'tasinan' as const }] }));
  const k1 = () => { const k = siraKartlari(MT).find((x) => x.kok === '1'); if (!k) throw new Error('kart'); return k; };

  it('seçili planlı adımın yerleri listelenir (geçersiz yer yok, en erken başta), tahtaya hedef verilir; Taşı sayfanın taşımasını çağırır', async () => {
    const oz = tasiOnizle();
    const tasi = vi.fn(), hedef = vi.fn();
    render(<EmirAdimlari m={MT} kart={k1()} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} hedef={hedef} secIs="1.10" tasi={tasi} taslakVar />);
    const bolum = screen.getByRole('region', { name: 'Emirler ve operasyonlar' });
    expect(bolum.querySelector('[data-adim="1.10"]')?.getAttribute('aria-pressed')).toBe('true');
    const yerler = await within(bolum).findByRole('group', { name: 'Torna için taşınacak yerler' });
    await waitFor(() => { expect(yerler.querySelectorAll('li')).toHaveLength(2); });
    expect([...yerler.querySelectorAll('[data-tasi-tezgah]')].map((b) => b.getAttribute('data-tasi-tezgah'))).toEqual(['T2', 'T1']);
    // Emre etkisi listede yazar: yeni bitiş, kazanç ve termin durumu.
    expect(yerler.querySelector('li')?.textContent).toMatch(/Başka tezgâh · en erken biten yer · emir Pzt 12:00 biter · .* erken · termine yetişir/);
    expect(yerler.querySelectorAll('li')[1]?.textContent).toContain('Aynı tezgâh · emir Pzt 16:00 biter');
    expect(yerler.querySelector('[data-taslak-notu]')).toBeTruthy();
    expect(oz.mock.calls.map((x) => [x[0].tezgah, x[0].baslangic])).toEqual([['T1', 12], ['T2', 8], ['T3', 8]]);
    await waitFor(() => { expect(hedef.mock.calls.at(-1)?.[0]).toMatchObject({ emirId: '1', adimId: '1.10', tezgahlar: ['T1', 'T2', 'T3'], fiil: 'tasi', yerler: [{ tezgah: 'T2', S: 8 }, { tezgah: 'T1', S: 12 }] }); });
    fireEvent.click(yerler.querySelector('[data-tasi-tezgah="T2"]') as HTMLElement);
    expect(tasi).toHaveBeenCalledWith('1.10', 'T2', 8);
    // Tahtadaki boş yere basmak aynı taşımayı çağırır.
    (hedef.mock.calls.at(-1)?.[0] as { yerlestir: (t: string) => void }).yerlestir('T1');
    expect(tasi).toHaveBeenLastCalledWith('1.10', 'T1', 12);
  });

  it('biten iş taşınmaz: neden yazılır, sunucuya sorulmaz, tahtaya hedef verilmez', () => {
    const oz = tasiOnizle();
    const hedef = vi.fn();
    const m = { ...MT, isler: { ...MT.isler, '1.10': { ...is('1.10', 'T1', 20, 24), ad: 'Torna', basladi: true, bitti: true } } };
    render(<EmirAdimlari m={m} kart={k1()} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} hedef={hedef} secIs="1.10" tasi={vi.fn()} />);
    expect(screen.getByText('Biten iş taşınmaz.')).toBeTruthy();
    expect(oz).not.toHaveBeenCalled();
    expect(hedef.mock.calls.every((x) => x[0] === null)).toBe(true);
  });

  it('emrin satırında durum, termin ve bitiş yazar; tahtadan seçilen iş işaretlenir, liste açılmaz (3304 a)', () => {
    const oz = tasiOnizle();
    render(<EmirAdimlari m={MT} kart={k1()} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} vurgu="1.10" tasi={vi.fn()} />);
    const bolum = screen.getByRole('region', { name: 'Emirler ve operasyonlar' });
    expect(bolum.querySelector('[data-emir-ozet]')?.textContent).toBe('8 adet · zamanında · termin 01.01 Pzt 60:00 · biter 01.01 Pzt 24:00');
    expect(bolum.querySelector('[data-adim="1.10"]')?.getAttribute('aria-current')).toBe('true');
    expect(bolum.querySelector('[data-adim="1.10"]')?.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('group', { name: /taşınacak yerler/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /ayrıntısını aç/ })).toBeNull();
    expect(oz).not.toHaveBeenCalled();
  });

  it('başka operasyon seçilince önceki operasyonun önizlemesi kullanılmaz', async () => {
    const oz = tasiOnizle();
    const iki: KokpitEmri = { ...E, adimlar: [...E.adimlar, { id: '1.20', ad: 'Freze', adaylar: ['T1', 'T2'] }] };
    const m = { ...MT, isler: { ...MT.isler, '1.20': { ...is('1.20', 'T3', 30, 34), ad: 'Freze' } }, emirler: [iki] };
    const k = siraKartlari(m).find((x) => x.kok === '1');
    if (!k) throw new Error('kart');
    const { rerender } = render(<EmirAdimlari m={m} kart={k} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} secIs="1.10" tasi={vi.fn()} />);
    await screen.findByRole('group', { name: 'Torna için taşınacak yerler' });
    await waitFor(() => { expect(oz.mock.calls.length).toBeGreaterThanOrEqual(3); });
    rerender(<EmirAdimlari m={m} kart={k} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} secIs="1.20" tasi={vi.fn()} />);
    const freze = await screen.findByRole('group', { name: 'Freze için taşınacak yerler' });
    await waitFor(() => { expect(freze.querySelectorAll('li').length).toBeGreaterThan(0); });
    expect(oz.mock.calls.filter((x) => x[0].isId === '1.20').length).toBeGreaterThan(0);
  });

  it('okunamayan taşıma önizlemesi bellekte tutulmaz: operasyon yeniden seçilince yeniden sorulur', async () => {
    const gecerli = tasiOnizle();
    gecerli.mockRestore();
    const oz = vi.spyOn(gonder, 'isTasiOnizle').mockResolvedValue(null);
    const o = { m: MT, kart: k1(), zaman, uygula: vi.fn(), surum: 4, adimAc: vi.fn(), tasi: vi.fn() };
    const { rerender } = render(<EmirAdimlari {...o} secIs="1.10" />);
    expect(await screen.findByText('Bu operasyon için başka uygun boş yer bulunamadı.')).toBeTruthy();
    const ilk = oz.mock.calls.length;
    expect(ilk).toBe(3);
    oz.mockRestore();
    const yeni = tasiOnizle();
    rerender(<EmirAdimlari {...o} secIs={null} />);
    rerender(<EmirAdimlari {...o} secIs="1.10" />);
    const yerler = await screen.findByRole('group', { name: 'Torna için taşınacak yerler' });
    await waitFor(() => { expect(yerler.querySelectorAll('li')).toHaveLength(2); });
    expect(yeni.mock.calls.length).toBe(3);
  });

  it('yazamayan kişide yerler sorulmaz; seçim yokken bölüm çizilmez', () => {
    const oz = tasiOnizle();
    const { rerender } = render(<EmirAdimlari m={MT} kart={k1()} zaman={zaman} uygula={null} surum={4} adimAc={vi.fn()} secIs="1.10" tasi={null} />);
    expect(screen.getByText('Operasyonu yalnız planı yazabilen kişi taşır.')).toBeTruthy();
    rerender(<EmirAdimlari m={MT} kart={k1()} zaman={zaman} uygula={null} surum={4} adimAc={vi.fn()} secIs={null} tasi={null} />);
    expect(screen.queryByRole('group', { name: /taşınacak yerler/ })).toBeNull();
    expect(oz).not.toHaveBeenCalled();
  });

  it('planlı adım seçiliyken aynı karttaki plansız emrin yerleştirmesi bekler; yerleşmemiş adıma basınca seçim bırakılır', async () => {
    tasiOnizle();
    const pl = onizlemeKur();
    const dugum: KokpitEmri = { ...YENI, id: '1-Y1', no: 'ORN-UE-1-Y1', adimlar: YENI.adimlar.map((a) => ({ ...a, id: a.id.replace('2.', '1-Y1.') })) };
    const m = { ...MT, tezgahlar: [...MT.tezgahlar, { id: 'F1', kod: 'ORN-F1', ad: '', fason: false }, { id: 'F2', kod: 'ORN-F2', ad: '', fason: false }], emirler: [E, dugum] };
    const k = siraKartlari(m).find((x) => x.kok === '1');
    if (!k) throw new Error('kart');
    const birak = vi.fn();
    render(<EmirAdimlari m={m} kart={k} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} secIs="1.10" tasi={vi.fn()} birak={birak} />);
    await screen.findByRole('group', { name: 'Torna için taşınacak yerler' });
    expect(screen.queryByRole('group', { name: /için boş yerler|^Boş yerler$/ })).toBeNull();
    expect(pl).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('region', { name: 'Emirler ve operasyonlar' }).querySelector('[data-adim="1-Y1.10"]') as HTMLElement);
    expect(birak).toHaveBeenCalled();
  });
});

describe('Kokpit operasyon tablosu (3318 a)', () => {
  const pad = (t: number): string => String(t).padStart(2, '0');
  const girdi = { yaz: (t: number): string => `2026-01-01T${pad(t)}:00`, oku: (v: string): number | null => (v ? Number(v.slice(11, 13)) : null) };
  const bolum = (): HTMLElement => screen.getByRole('region', { name: 'Emirler ve operasyonlar' });
  const satir = (id: string): HTMLElement => bolum().querySelector(`[data-adim-satir="${id}"]`) as HTMLElement;
  const E: KokpitEmri = { ...PLANLI, bitis: 24, adimlar: [{ id: '1.10', ad: 'Torna', adaylar: ['T1', 'T2', 'T3'] }] };
  const MT: KokpitModeli = { ...M, tezgahlar: ['T1', 'T2', 'T3'].map((id) => ({ id, kod: `ORN-${id}`, ad: '', fason: false })), isler: { '1.10': { ...is('1.10', 'T1', 20, 24), ad: 'Torna' } }, emirler: [E] };
  const k1 = () => { const k = siraKartlari(MT).find((x) => x.kok === '1'); if (!k) throw new Error('kart'); return k; };
  const tasiOnizle = () => vi.spyOn(gonder, 'isTasiOnizle').mockImplementation((g) => Promise.resolve(g.tezgah === 'T3'
    ? { calismaSurumu: 4, gecerli: false, ileti: 'ORN-neden', isler: [] }
    : { calismaSurumu: 4, gecerli: true, ileti: null, isler: [{ isId: g.isId, tezgah: g.tezgah, S: g.baslangic, C: g.baslangic + 4, eskiTezgah: 'T1', eskiS: 20, tur: 'tasinan' as const }] }));

  it('operasyonlar tabloda: sütunlar sabit, fason adımda giriş yok, yerleşmemiş adımda sistemin öngörüsü; "Akış" eski kutulara döner', async () => {
    onizlemeKur();
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} saatGirdisi={girdi} />);
    expect([...bolum().querySelectorAll('thead th')].map((h) => h.textContent)).toEqual(['#', 'Operasyon', 'Bağımlılık', 'Süre', 'Tezgâh', 'Başlangıç', 'Bitiş', 'Durum']);
    // Bağımlılık (3330): öncül sıra numarası ve adıyla; sütun geniş ekranda, kısa yazı dar ekranda görünür (ikisi de DOM'dadır).
    expect(['2.10', '2.20', '2.30'].map((id) => satir(id).querySelector('td[data-ad="Bağımlılık"]')?.textContent)).toEqual(['öncül yok', '1 Torna · bitince', '2 Kaplama · örtüşmeli (bitmeden başlayabilir)']);
    expect(['2.10', '2.20', '2.30'].map((id) => satir(id).querySelector('.tc-pyq-bag-kisa')?.textContent ?? null)).toEqual([null, '1 Torna bitince', '2 Kaplama ile örtüşmeli']);
    expect(within(satir('2.10')).getByRole('combobox', { name: 'Torna tezgâhı' }).querySelectorAll('option')).toHaveLength(3);
    expect(within(satir('2.10')).getByRole('combobox', { name: 'Torna tezgâhı' }).querySelector('option')?.textContent).toBe('Sistem seçsin');
    expect(satir('2.20').querySelector('select, input')).toBeNull();
    expect(satir('2.20').textContent).toContain('Fason');
    expect(satir('2.10').textContent).toContain('Yerleşmedi');
    // Sistem tornayı T2'de 8'de başlatır (en erken biten); yazılmamış öngörü satırda görünür.
    await waitFor(() => { expect(satir('2.10').querySelector('[data-ongoru]')?.textContent).toBe('öngörü ORN-T2 · 01.01 Pzt 08:00'); });
    // Tabloda toplu düğmeler: İleriye ve Teslimden geriye; akıştaki "Hepsini en erken yere yerleştir" tabloda yok.
    expect(screen.getByRole('button', { name: 'İleriye yerleştir' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Teslimden geriye yerleştir' })).toBeTruthy();
    // Düğmeler hangi emre çalıştığını söyler (sipariş kartında birden çok emir olabilir).
    expect(bolum().querySelector('[data-toplu-emir]')?.textContent).toBe('ORN-UE-2 için:');
    expect(screen.queryByRole('button', { name: 'Hepsini en erken yere yerleştir' })).toBeNull();
    fireEvent.click(within(screen.getByRole('group', { name: 'Operasyon görünümü' })).getByRole('button', { name: 'Akış' }));
    expect(bolum().querySelector('table')).toBeNull();
    expect(bolum().querySelector('[data-adim="2.10"]')?.textContent).toContain('yerleşmedi');
    expect(bolum().querySelector('[data-adim="2.30"] [data-bag-kisa]')?.textContent).toBe('2 Kaplama ile örtüşmeli');
  });

  it('akış görünümünde seçilen tezgâh kutuda yazar', async () => {
    onizlemeKur();
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} ilkGorunum="akis" />);
    const torna = await screen.findByRole('group', { name: 'Torna için boş yerler' });
    await waitFor(() => { expect(torna.querySelectorAll('li')).toHaveLength(2); });
    fireEvent.click(within(torna.querySelectorAll('li')[1] as HTMLElement).getByRole('button', { name: 'Yerleştir' }));
    expect(bolum().querySelector('[data-adim="2.10"]')?.textContent).toContain('ORN-T1 seçildi');
    expect(screen.getByRole('button', { name: 'Hepsini en erken yere yerleştir' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'İleriye yerleştir' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Teslimden geriye yerleştir' })).toBeNull();
  });

  it('satırda tezgâh ve saat girilir; seçim birikir, kendiliğinden yazılmaz; "İleriye yerleştir" emri tek komutla yazar', async () => {
    const oz = onizlemeKur();
    const uygula = vi.fn();
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={uygula} surum={4} adimAc={vi.fn()} saatGirdisi={girdi} />);
    fireEvent.change(within(satir('2.10')).getByRole('combobox', { name: 'Torna tezgâhı' }), { target: { value: 'T1' } });
    fireEvent.change(within(satir('2.10')).getByLabelText('Torna başlangıcı'), { target: { value: '2026-01-01T10:00' } });
    fireEvent.change(within(satir('2.30')).getByRole('combobox', { name: 'Freze tezgâhı' }), { target: { value: 'F2' } });
    expect(uygula).not.toHaveBeenCalled();
    // Girilen ama yazılmamış satır "Yerleşmedi" kalır ve bunu söyler.
    expect(satir('2.10').querySelector('td[data-ad="Durum"]')?.textContent).toBe('Yerleşmediseçim yazılmadı');
    expect(satir('2.20').querySelector('[data-yazilmadi]')).toBeNull();
    const dugme = screen.getByRole('button', { name: 'İleriye yerleştir' });
    await waitFor(() => { expect((dugme as HTMLButtonElement).disabled).toBe(false); });
    expect(oz).toHaveBeenCalledWith({ emirId: '2', tezgah: 'T1', baslangic: 10, adimlar: [{ isId: '2.30', tezgah: 'F2' }] }, 4);
    // Seçimin sonucu yazılmadan satırda görünür: freze F2'de 30'da başlar.
    expect(satir('2.30').querySelector('[data-ongoru]')?.textContent).toBe('öngörü ORN-F2 · 01.01 Pzt 30:00');
    fireEvent.click(dugme);
    expect(uygula).toHaveBeenCalledTimes(1);
    expect(uygula).toHaveBeenCalledWith({ isId: '2.10', tezgah: 'T1', baslangic: 10, planaAl: '2', adimlar: [{ isId: '2.30', tezgah: 'F2' }] }, false);
  });

  it('seçim emri yerleştirmiyorsa neden satırda yazar, "İleriye yerleştir" kapalı kalır', async () => {
    vi.spyOn(planaAl, 'planaAlOnizle').mockImplementation((g) => Promise.resolve(g.tezgah === 'T1'
      ? { calismaSurumu: 4, gecerli: false, ileti: 'ORN-uymuyor', bitis: null, isler: [] }
      : { calismaSurumu: 4, gecerli: true, ileti: null, bitis: 18, isler: [{ isId: '2.10', tezgah: g.tezgah, S: 8, C: 14 }] }));
    const uygula = vi.fn();
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={uygula} surum={4} adimAc={vi.fn()} saatGirdisi={girdi} />);
    fireEvent.change(within(satir('2.10')).getByRole('combobox', { name: 'Torna tezgâhı' }), { target: { value: 'T1' } });
    const not = await waitFor(() => { const n = bolum().querySelector('[data-satir-notu="2.10"] [role="alert"]'); if (!n) throw new Error('not'); return n; });
    expect(not.textContent).toBe('ORN-uymuyor');
    expect(within(satir('2.10')).getByLabelText('Torna başlangıcı').getAttribute('aria-invalid')).toBe('true');
    const dugme = screen.getByRole('button', { name: 'İleriye yerleştir' }) as HTMLButtonElement;
    expect(dugme.disabled).toBe(true);
    fireEvent.click(dugme);
    expect(uygula).not.toHaveBeenCalled();
  });

  it('yerleşmiş operasyonun tezgâhı ya da saati değişince sunucuya sorulur: uymayan yer nedeniyle reddedilir, uyan yer "Taşı" ile yazılır, "Vazgeç" geri alır', async () => {
    const oz = tasiOnizle();
    const tasi = vi.fn();
    render(<EmirAdimlari m={MT} kart={k1()} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} tasi={tasi} saatGirdisi={girdi} />);
    const tezgah = within(satir('1.10')).getByRole('combobox', { name: 'Torna tezgâhı' }) as HTMLSelectElement;
    const saat = within(satir('1.10')).getByLabelText('Torna başlangıcı') as HTMLInputElement;
    expect([tezgah.value, saat.value]).toEqual(['T1', '2026-01-01T20:00']);
    fireEvent.change(tezgah, { target: { value: 'T3' } });
    const not = await waitFor(() => { const n = bolum().querySelector('[data-satir-notu="1.10"] [role="alert"]'); if (!n) throw new Error('not'); return n; });
    expect(not.textContent).toBe('ORN-neden');
    expect(bolum().querySelector('[data-satir-tasi]')).toBeNull();
    fireEvent.change(tezgah, { target: { value: 'T2' } });
    fireEvent.change(saat, { target: { value: '2026-01-01T16:00' } });
    await waitFor(() => { expect(bolum().querySelector('[data-satir-tasi="1.10"]')).toBeTruthy(); });
    expect(oz).toHaveBeenLastCalledWith({ isId: '1.10', tezgah: 'T2', baslangic: 16 });
    expect(bolum().querySelector('[data-satir-notu="1.10"]')?.textContent).toContain('ORN-T2 · 01.01 Pzt 16:00 · emir Pzt 20:00 biter');
    expect(tasi).not.toHaveBeenCalled();
    fireEvent.click(bolum().querySelector('[data-satir-tasi="1.10"]') as HTMLElement);
    expect(tasi).toHaveBeenCalledWith('1.10', 'T2', 16);
    expect(bolum().querySelector('[data-satir-notu]')).toBeNull();
    // Vazgeç: satır plandaki yerine döner, yazılmaz.
    fireEvent.change(tezgah, { target: { value: 'T2' } });
    fireEvent.click(await screen.findByRole('button', { name: 'Vazgeç' }));
    expect(tezgah.value).toBe('T1');
    expect(tasi).toHaveBeenCalledTimes(1);
  });

  it('girilen saat çeyrek saate yuvarlanır (09:07 → 09:00, 09:08 → 09:15)', async () => {
    const oz = onizlemeKur();
    const dakikali = { yaz: girdi.yaz, oku: (v: string): number | null => (v ? Number(v.slice(11, 13)) + Number(v.slice(14, 16)) / 60 : null) };
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} saatGirdisi={dakikali} />);
    const saat = within(satir('2.10')).getByLabelText('Torna başlangıcı');
    fireEvent.change(saat, { target: { value: '2026-01-01T09:07' } });
    await waitFor(() => { expect(oz).toHaveBeenCalledWith(expect.objectContaining({ emirId: '2', baslangic: 9 }), 4); });
    fireEvent.change(saat, { target: { value: '2026-01-01T09:08' } });
    await waitFor(() => { expect(oz).toHaveBeenCalledWith(expect.objectContaining({ emirId: '2', baslangic: 9.25 }), 4); });
    expect(oz.mock.calls.some((x) => x[0].baslangic !== 8 && x[0].baslangic !== 9 && x[0].baslangic !== 9.25)).toBe(false);
  });

  it('seçimle yerleşim termini geçiyorsa geç bırakır diye bildirilir (çağıran onay sorar)', async () => {
    onizlemeKur();
    const uygula = vi.fn();
    const gec = { ...M, emirler: [PLANLI, { ...YENI, termin: 20 }] };
    const k = siraKartlari(gec).find((x) => x.kok === '2');
    if (!k) throw new Error('kart');
    render(<EmirAdimlari m={gec} kart={k} zaman={zaman} uygula={uygula} surum={4} adimAc={vi.fn()} saatGirdisi={girdi} />);
    fireEvent.change(within(satir('2.10')).getByRole('combobox', { name: 'Torna tezgâhı' }), { target: { value: 'T1' } });
    const dugme = screen.getByRole('button', { name: 'İleriye yerleştir' }) as HTMLButtonElement;
    await waitFor(() => { expect(dugme.disabled).toBe(false); });
    fireEvent.click(dugme);
    // Torna T1'de 12'de başlar, emir 32'de biter; termin 20.
    expect(uygula).toHaveBeenCalledWith({ isId: '2.10', tezgah: 'T1', baslangic: 8, planaAl: '2' }, true);
  });

  it('uymayan seçimin nedeni son girilen satırın altında yazar, öteki satırda yazmaz', async () => {
    vi.spyOn(planaAl, 'planaAlOnizle').mockImplementation((g) => Promise.resolve(g.adimlar?.some((a) => a.tezgah === 'F2')
      ? { calismaSurumu: 4, gecerli: false, ileti: 'ORN-uymuyor', bitis: null, isler: [] }
      : { calismaSurumu: 4, gecerli: true, ileti: null, bitis: 18, isler: [{ isId: '2.10', tezgah: g.tezgah, S: 8, C: 14 }] }));
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} saatGirdisi={girdi} />);
    fireEvent.change(within(satir('2.10')).getByRole('combobox', { name: 'Torna tezgâhı' }), { target: { value: 'T1' } });
    fireEvent.change(within(satir('2.30')).getByRole('combobox', { name: 'Freze tezgâhı' }), { target: { value: 'F2' } });
    const not = await waitFor(() => { const n = bolum().querySelector('[data-satir-notu="2.30"] [role="alert"]'); if (!n) throw new Error('not'); return n; });
    expect(not.textContent).toBe('ORN-uymuyor');
    expect(bolum().querySelector('[data-satir-notu="2.10"]')).toBeNull();
    // Hata alana bağlıdır: ekran okuyucu alanda nedeni okur.
    expect(within(satir('2.30')).getByRole('combobox', { name: 'Freze tezgâhı' }).getAttribute('aria-describedby')).toBe(not.getAttribute('id'));
  });

  it('yerleşmiş operasyonda önizleme okunamazsa satırda yazar, "Taşı" çıkmaz', async () => {
    vi.spyOn(gonder, 'isTasiOnizle').mockResolvedValue(null);
    render(<EmirAdimlari m={MT} kart={k1()} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} tasi={vi.fn()} saatGirdisi={girdi} />);
    fireEvent.change(within(satir('1.10')).getByRole('combobox', { name: 'Torna tezgâhı' }), { target: { value: 'T2' } });
    const not = await waitFor(() => { const n = bolum().querySelector('[data-satir-notu="1.10"] [role="alert"]'); if (!n) throw new Error('not'); return n; });
    expect(not.textContent).toBe('Önizleme okunamadı; yeniden deneyin.');
    expect(bolum().querySelector('[data-satir-tasi]')).toBeNull();
  });

  it('yalnız saat girilen (tezgâhsız) seçimde öngörü sistemin tezgâhıyla gelir ve yazılabilir', async () => {
    const oz = onizlemeKur();
    const uygula = vi.fn();
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={uygula} surum={4} adimAc={vi.fn()} saatGirdisi={girdi} />);
    await waitFor(() => { expect(satir('2.10').querySelector('[data-ongoru]')).toBeTruthy(); });
    fireEvent.change(within(satir('2.10')).getByLabelText('Torna başlangıcı'), { target: { value: '2026-01-01T10:00' } });
    const dugme = screen.getByRole('button', { name: 'İleriye yerleştir' }) as HTMLButtonElement;
    await waitFor(() => { expect(dugme.disabled).toBe(false); });
    // Sistem tornayı T2'ye koymuştu (en erken biten); saat seçimi o tezgâhla sorulur.
    expect(oz).toHaveBeenCalledWith({ emirId: '2', tezgah: 'T2', baslangic: 10 }, 4);
    fireEvent.click(dugme);
    expect(uygula).toHaveBeenCalledWith({ isId: '2.10', tezgah: 'T2', baslangic: 10, planaAl: '2' }, false);
  });

  it('yazamayan kişide ve başlamış işte alanlar kapalıdır; başlamış işin nedeni alanda yazar', () => {
    tasiOnizle();
    const { unmount } = render(<EmirAdimlari m={MT} kart={k1()} zaman={zaman} uygula={null} surum={4} adimAc={vi.fn()} tasi={null} saatGirdisi={girdi} />);
    expect((within(satir('1.10')).getByRole('combobox', { name: 'Torna tezgâhı' }) as HTMLSelectElement).disabled).toBe(true);
    expect((within(satir('1.10')).getByLabelText('Torna başlangıcı') as HTMLInputElement).disabled).toBe(true);
    unmount();
    const m = { ...MT, isler: { '1.10': { ...is('1.10', 'T1', 20, 24), ad: 'Torna', basladi: true, bitti: true } } };
    render(<EmirAdimlari m={m} kart={k1()} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} tasi={vi.fn()} saatGirdisi={girdi} />);
    const tezgah = within(satir('1.10')).getByRole('combobox', { name: 'Torna tezgâhı' }) as HTMLSelectElement;
    expect(tezgah.disabled).toBe(true);
    expect(tezgah.getAttribute('title')).toBe('Biten iş taşınmaz');
  });
});

describe('Kokpit toplu yerleştirme (3318 a, 2. dilim)', () => {
  // Önizleme uydurmadır: torna istenen saatte (en erken 8) başlar, emir başlangıçtan 20 saat sonra biter.
  const surukle = () => vi.spyOn(planaAl, 'planaAlOnizle').mockImplementation((g) => {
    const S = Math.max(g.baslangic, 8), freze = g.adimlar?.find((a) => a.isId === '2.30')?.tezgah ?? 'F1';
    return Promise.resolve({ calismaSurumu: 4, gecerli: true, ileti: null, bitis: S + 20, isler: [{ isId: '2.10', tezgah: g.tezgah, S, C: S + 6 }, { isId: '2.30', tezgah: freze, S: S + 16, C: S + 20 }] });
  });
  const hazir = async (): Promise<HTMLButtonElement> => {
    const d = screen.getByRole('button', { name: 'Teslimden geriye yerleştir' }) as HTMLButtonElement;
    await waitFor(() => { expect(d.disabled).toBe(false); });
    return d;
  };

  it('Teslimden geriye yerleştir: termine yetişen en geç başlangıç bulunur; hamle geriye özetiyle verilir (çağıran onay sorar), seçilen tezgâh korunur', async () => {
    const oz = surukle();
    const uygula = vi.fn();
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={uygula} surum={4} adimAc={vi.fn()} />);
    // Sistem tornayı T1'e koyar (iki tezgâh eşit, ilki); kişi T2'yi ve frezede F2'yi seçer.
    fireEvent.change(screen.getByRole('combobox', { name: 'Torna tezgâhı' }), { target: { value: 'T2' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Freze tezgâhı' }), { target: { value: 'F2' } });
    const d = await hazir();
    const once = oz.mock.calls.length;
    fireEvent.click(d);
    // Termin 40, emir başlangıçtan 20 saat sonra biter: en geç başlangıç 20.
    await waitFor(() => { expect(uygula).toHaveBeenCalledTimes(1); });
    expect(uygula).toHaveBeenCalledWith({ isId: '2.10', tezgah: 'T2', baslangic: 20, planaAl: '2', adimlar: [{ isId: '2.30', tezgah: 'F2' }] }, false, { tezgah: 'T2', S: 20, bitis: 40 });
    // Aramanın bütün soruları seçilen tezgâhla ve sonraki adımın seçimiyle gider.
    const sorular = oz.mock.calls.slice(once).map((x) => x[0]);
    expect(sorular.length).toBeGreaterThan(0);
    expect(sorular.every((g) => g.tezgah === 'T2' && JSON.stringify(g.adimlar) === JSON.stringify([{ isId: '2.30', tezgah: 'F2' }]))).toBe(true);
    // Arama ikiye bölerek yapılır: çeyrek saatlik 128 adım en çok sekiz soruyla taranır (ilk deneme ve sistem seçimi ayrı).
    expect(oz.mock.calls.filter((x) => x[0].adimlar !== undefined).length).toBeLessThanOrEqual(10);
  });

  it('teslimden geriye sığmayan emir yazılmaz; neden ve en erken bitiş yazılır', async () => {
    surukle();
    const uygula = vi.fn();
    const gec = { ...M, emirler: [PLANLI, { ...YENI, termin: 20 }] };
    const k = siraKartlari(gec).find((x) => x.kok === '2');
    if (!k) throw new Error('kart');
    render(<EmirAdimlari m={gec} kart={k} zaman={zaman} uygula={uygula} surum={4} adimAc={vi.fn()} />);
    fireEvent.click(await hazir());
    const not = await screen.findByRole('alert');
    expect(not.textContent?.trim()).toBe('Teslimden geriye sığmıyor: en erken yerleşimde bile emir 01.01 Pzt 28:00 biter, termin 01.01 Pzt 20:00. "İleriye yerleştir" en erken yere koyar.');
    expect(uygula).not.toHaveBeenCalled();
  });

  it('termini olmayan emirde ve bitişi bilinmeyen emirde geriye yerleştirilmez', async () => {
    vi.spyOn(planaAl, 'planaAlOnizle').mockImplementation((g) => Promise.resolve({ calismaSurumu: 4, gecerli: true, ileti: null, bitis: null, isler: [{ isId: '2.10', tezgah: g.tezgah, S: 8, C: 14 }] }));
    const uygula = vi.fn();
    const { unmount } = render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={uygula} surum={4} adimAc={vi.fn()} />);
    fireEvent.click(await hazir());
    expect((await screen.findByRole('alert')).getAttribute('data-geri-sonucu')).toBe('bilinmez');
    expect(uygula).not.toHaveBeenCalled();
    unmount();
    const terminsiz = { ...M, emirler: [PLANLI, { ...YENI, termin: null }] };
    const k = siraKartlari(terminsiz).find((x) => x.kok === '2');
    if (!k) throw new Error('kart');
    render(<EmirAdimlari m={terminsiz} kart={k} zaman={zaman} uygula={uygula} surum={4} adimAc={vi.fn()} />);
    // Sistem hazır olunca "İleriye" açılır; geriye, termin olmadığı için kapalı kalır.
    await waitFor(() => { expect((screen.getByRole('button', { name: 'İleriye yerleştir' }) as HTMLButtonElement).disabled).toBe(false); });
    const d = screen.getByRole('button', { name: 'Teslimden geriye yerleştir' }) as HTMLButtonElement;
    expect(d.disabled).toBe(true);
    expect(d.getAttribute('title')).toBe('Emrin termini yok; geriye yerleştirilemez.');
  });

  it('arama sürerken seçim değişirse eski sonuç atılır: hamle verilmez', async () => {
    const oz = surukle();
    const uygula = vi.fn();
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={uygula} surum={4} adimAc={vi.fn()} />);
    const d = await hazir();
    // Aramanın soruları bekletilir; bu sırada tezgâh değişir, sonra cevaplar gelir.
    let birak: () => void = () => undefined;
    const kapi = new Promise<void>((r) => { birak = r; });
    oz.mockImplementation(async (g) => { await kapi; const S = Math.max(g.baslangic, 8); return { calismaSurumu: 4, gecerli: true, ileti: null, bitis: S + 20, isler: [{ isId: '2.10', tezgah: g.tezgah, S, C: S + 6 }] }; });
    fireEvent.change(screen.getByRole('combobox', { name: 'Freze tezgâhı' }), { target: { value: 'F2' } });
    fireEvent.click(d);
    fireEvent.change(screen.getByRole('combobox', { name: 'Freze tezgâhı' }), { target: { value: 'F1' } });
    birak();
    await new Promise((r) => { setTimeout(r, 100); });
    expect(uygula).not.toHaveBeenCalled();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('arama okunamazsa ya da seçim emri yerleştirmiyorsa nedeni yazılır, hamle verilmez', async () => {
    const oz = surukle();
    const uygula = vi.fn();
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={uygula} surum={4} adimAc={vi.fn()} />);
    const d = await hazir();
    // Seçimli sorular okunamaz (null): bellekte tutulmaz.
    oz.mockImplementation((g) => Promise.resolve(g.adimlar ? null : { calismaSurumu: 4, gecerli: true, ileti: null, bitis: 28, isler: [{ isId: '2.10', tezgah: g.tezgah, S: 8, C: 14 }] }));
    fireEvent.change(screen.getByRole('combobox', { name: 'Freze tezgâhı' }), { target: { value: 'F2' } });
    fireEvent.click(d);
    await waitFor(() => { expect(screen.getAllByRole('alert').some((x) => x.textContent?.trim() === 'Önizleme okunamadı; yeniden deneyin.')).toBe(true); });
    // Aynı seçim bu kez geçersiz döner: sunucunun iletisi yazılır.
    oz.mockImplementation((g) => Promise.resolve(g.adimlar ? { calismaSurumu: 4, gecerli: false, ileti: 'ORN-uymuyor', bitis: null, isler: [] } : { calismaSurumu: 4, gecerli: true, ileti: null, bitis: 28, isler: [{ isId: '2.10', tezgah: g.tezgah, S: 8, C: 14 }] }));
    fireEvent.click(screen.getByRole('button', { name: 'Teslimden geriye yerleştir' }));
    await waitFor(() => { expect(document.querySelector('[data-geri-sonucu="red"]')?.textContent?.trim()).toBe('ORN-uymuyor'); });
    expect(uygula).not.toHaveBeenCalled();
  });

  it('İleriye yerleştir: seçim yokken sistemin en erken yerini, seçim varken seçimleri yazar', async () => {
    onizlemeKur();
    const uygula = vi.fn();
    const { unmount } = render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={uygula} surum={4} adimAc={vi.fn()} />);
    const d = screen.getByRole('button', { name: 'İleriye yerleştir' }) as HTMLButtonElement;
    await waitFor(() => { expect(d.disabled).toBe(false); });
    fireEvent.click(d);
    expect(uygula).toHaveBeenLastCalledWith({ isId: '2.10', tezgah: 'T2', baslangic: 8, planaAl: '2' }, false);
    unmount();
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={uygula} surum={4} adimAc={vi.fn()} />);
    fireEvent.change(screen.getByRole('combobox', { name: 'Torna tezgâhı' }), { target: { value: 'T1' } });
    const d2 = screen.getByRole('button', { name: 'İleriye yerleştir' }) as HTMLButtonElement;
    await waitFor(() => { expect(d2.disabled).toBe(false); });
    fireEvent.click(d2);
    expect(uygula).toHaveBeenLastCalledWith({ isId: '2.10', tezgah: 'T1', baslangic: 8, planaAl: '2' }, false);
  });
});

describe('Kokpit odaklı tezgâh paneli (3318 a, 3. dilim)', () => {
  const pad = (t: number): string => String(t).padStart(2, '0');
  const girdi = { yaz: (t: number): string => `2026-01-01T${pad(t)}:00`, oku: (v: string): number | null => (v ? Number(v.slice(11, 13)) : null) };
  const bolum = (): HTMLElement => screen.getByRole('region', { name: 'Emirler ve operasyonlar' });
  const satir = (id: string): HTMLElement => bolum().querySelector(`[data-adim-satir="${id}"]`) as HTMLElement;
  const yer = (p: HTMLElement, t: string): HTMLButtonElement | null => p.querySelector(`[data-odak-yer="${t}"]`);
  const E: KokpitEmri = { ...PLANLI, bitis: 24, adimlar: [{ id: '1.10', ad: 'Torna', adaylar: ['T1', 'T2', 'T3'] }] };
  const MT: KokpitModeli = { ...M, tezgahlar: ['T1', 'T2', 'T3'].map((id) => ({ id, kod: `ORN-${id}`, ad: '', fason: false })), isler: { '1.10': { ...is('1.10', 'T1', 20, 24), ad: 'Torna' } }, emirler: [E] };
  const k1 = () => { const k = siraKartlari(MT).find((x) => x.kok === '1'); if (!k) throw new Error('kart'); return k; };
  const tasiOnizle = () => vi.spyOn(gonder, 'isTasiOnizle').mockImplementation((g) => Promise.resolve(g.tezgah === 'T3'
    ? { calismaSurumu: 4, gecerli: false, ileti: 'ORN-neden', isler: [] }
    : { calismaSurumu: 4, gecerli: true, ileti: null, isler: [{ isId: g.isId, tezgah: g.tezgah, S: g.baslangic, C: g.baslangic + 4, eskiTezgah: 'T1', eskiS: 20, tur: 'tasinan' as const }] }));

  it('seçili operasyonun uygun tezgâhları dolu işleri ve boş yerleriyle görünür; boş yere basınca tezgâh ve saat satıra yazılır, plana yazılmaz', async () => {
    onizlemeKur();
    const uygula = vi.fn();
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={uygula} surum={4} adimAc={vi.fn()} saatGirdisi={girdi} />);
    const panel = await screen.findByRole('complementary', { name: 'Torna için tezgâhlar' });
    // Dar ekranda panel seçili satırın altındadır.
    expect(panel.closest('[data-satir-odagi]')?.getAttribute('data-satir-odagi')).toBe('2.10');
    expect([...panel.querySelectorAll('[data-odak-satir]')].map((x) => x.getAttribute('data-odak-satir'))).toEqual(['T1', 'T2']);
    // T1'deki dolu iş (ORN-UE-1, 8-12) şeritte durur.
    expect(panel.querySelector('[data-odak-satir="T1"] .tc-pyq-odak-is')?.textContent).toBe('ORN-UE-1');
    expect(panel.querySelector('[data-odak-satir="T2"] .tc-pyq-odak-is')).toBeNull();
    await waitFor(() => {
      expect(yer(panel, 'T2')?.hasAttribute('data-ilk')).toBe(true);
      expect(yer(panel, 'T1')?.hasAttribute('data-ilk')).toBe(false);
      expect(yer(panel, 'T1')?.getAttribute('aria-label')).toBe('ORN-T1 · 01.01 Pzt 12:00 boş yer: satıra yaz');
    });
    fireEvent.click(yer(panel, 'T1') as HTMLElement);
    expect(uygula).not.toHaveBeenCalled();
    expect((within(satir('2.10')).getByRole('combobox', { name: 'Torna tezgâhı' }) as HTMLSelectElement).value).toBe('T1');
    expect((within(satir('2.10')).getByLabelText('Torna başlangıcı') as HTMLInputElement).value).toBe('2026-01-01T12:00');
    expect(satir('2.10').querySelector('[data-yazilmadi]')).toBeTruthy();
    await waitFor(() => { expect(yer(screen.getByRole('complementary', { name: 'Torna için tezgâhlar' }), 'T1')?.getAttribute('aria-pressed')).toBe('true'); });
    // Seçim birikti: "İleriye yerleştir" panelden seçilen yeri yazar.
    const d = screen.getByRole('button', { name: 'İleriye yerleştir' }) as HTMLButtonElement;
    await waitFor(() => { expect(d.disabled).toBe(false); });
    fireEvent.click(d);
    expect(uygula).toHaveBeenCalledWith({ isId: '2.10', tezgah: 'T1', baslangic: 12, planaAl: '2' }, false);
  });

  it('"Bütün tezgâhlar" öteki tezgâhları da gösterir; uygun olmayanda boş yer çıkmaz', async () => {
    onizlemeKur();
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} />);
    const panel = await screen.findByRole('complementary', { name: 'Torna için tezgâhlar' });
    await waitFor(() => { expect(yer(panel, 'T2')).toBeTruthy(); });
    fireEvent.click(within(panel).getByRole('button', { name: 'Bütün tezgâhlar' }));
    expect([...panel.querySelectorAll('[data-odak-satir]')].map((x) => `${x.getAttribute('data-odak-satir') ?? ''}:${x.getAttribute('data-uygun') ?? ''}`)).toEqual(['T1:evet', 'T2:evet', 'F1:hayir', 'F2:hayir']);
    expect(panel.querySelectorAll('[data-odak-yer]')).toHaveLength(2);
    fireEvent.click(within(panel).getByRole('button', { name: 'Uygun tezgâhlar' }));
    expect(panel.querySelectorAll('[data-odak-satir]')).toHaveLength(2);
  });

  it('başka satır seçilince panel o operasyona geçer; fason satırda ve Akış görünümünde panel yoktur', async () => {
    onizlemeKur();
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} />);
    await screen.findByRole('complementary', { name: 'Torna için tezgâhlar' });
    fireEvent.click(bolum().querySelector('[data-adim="2.30"]') as HTMLElement);
    const panel = await screen.findByRole('complementary', { name: 'Freze için tezgâhlar' });
    expect(panel.closest('[data-satir-odagi]')?.getAttribute('data-satir-odagi')).toBe('2.30');
    expect([...panel.querySelectorAll('[data-odak-satir]')].map((x) => x.getAttribute('data-odak-satir'))).toEqual(['F1', 'F2']);
    expect(screen.queryByRole('complementary', { name: 'Torna için tezgâhlar' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Akış' }));
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('boş yer bulunamazsa panel bunu yazar; yazamayan kişide boş yer basılamaz', async () => {
    vi.spyOn(planaAl, 'planaAlOnizle').mockResolvedValue({ calismaSurumu: 4, gecerli: false, ileti: 'ORN-uymuyor', bitis: null, isler: [] });
    const { unmount } = render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} />);
    const panel = await screen.findByRole('complementary', { name: 'Torna için tezgâhlar' });
    expect(await within(panel).findByText('Bu tezgâhlarda boş yer yok.')).toBeTruthy();
    expect(panel.querySelector('[data-odak-yer]')).toBeNull();
    unmount();
  });

  it('seçim verilmeyen panelde (yazamayan kişi) boş yerler görünür, basılamaz; not bunu söyler', () => {
    const yerler = [{ adimId: '2.10', tezgah: 'T2', S: 8, C: 14, enErken: true }, { adimId: '2.10', tezgah: 'T1', S: 12, C: 18, enErken: false }];
    const { unmount } = render(<OdakPaneli m={M} ad="Torna" isId={null} tezgahlar={['T1', 'T2']} yerler={yerler} secilen={null} zaman={zaman} fiil="Yerleştir" sec={null} />);
    const dugmeler = [...document.querySelectorAll<HTMLButtonElement>('[data-odak-yer]')];
    expect(dugmeler.map((b) => [b.getAttribute('data-odak-yer'), b.disabled])).toEqual([['T1', true], ['T2', true]]);
    expect(screen.getByText('Boş yerler yalnız gösterilir.')).toBeTruthy();
    unmount();
    // Seçim verilince aynı yerler basılır ve tezgâhı bildirir.
    const sec = vi.fn();
    render(<OdakPaneli m={M} ad="Torna" isId={null} tezgahlar={['T1', 'T2']} yerler={yerler} secilen="T2" zaman={zaman} fiil="Yerleştir" sec={sec} />);
    const t2 = document.querySelector<HTMLButtonElement>('[data-odak-yer="T2"]');
    expect([t2?.disabled, t2?.getAttribute('aria-pressed')]).toEqual([false, 'true']);
    fireEvent.click(t2 as HTMLElement);
    expect(sec).toHaveBeenCalledWith('T2');
  });

  it('yazamayan kişide tabloda panel boş yerleri gösterir, basılamaz; basmak satırı değiştirmez', async () => {
    onizlemeKur();
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={null} surum={4} adimAc={vi.fn()} />);
    const panel = await screen.findByRole('complementary', { name: 'Torna için tezgâhlar' });
    await waitFor(() => { expect(panel.querySelectorAll('[data-odak-yer]')).toHaveLength(2); });
    expect([...panel.querySelectorAll<HTMLButtonElement>('[data-odak-yer]')].map((b) => b.disabled)).toEqual([true, true]);
    expect(within(panel).getByText('Boş yerler yalnız gösterilir.')).toBeTruthy();
    fireEvent.click(yer(panel, 'T1') as HTMLElement);
    expect(satir('2.10').querySelector('[data-yazilmadi]')).toBeNull();
    expect(yer(panel, 'T1')?.getAttribute('aria-pressed')).toBe('false');
  });

  it('yerleşmiş operasyonda kendi işi işaretlidir; boş yere basınca yeni yer satırda önizlenir, "Taşı" ile yazılır', async () => {
    tasiOnizle();
    const tasi = vi.fn();
    render(<EmirAdimlari m={MT} kart={k1()} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} secIs="1.10" tasi={tasi} saatGirdisi={girdi} />);
    const panel = await screen.findByRole('complementary', { name: 'Torna için tezgâhlar' });
    expect(panel.querySelector('[data-odak-satir="T1"] .tc-pyq-odak-is')?.hasAttribute('data-kendi')).toBe(true);
    await waitFor(() => { expect(yer(panel, 'T2')).toBeTruthy(); });
    // Geçersiz dönen tezgâhta (T3) boş yer çıkmaz.
    expect(yer(panel, 'T3')).toBeNull();
    // T1 ve T2 aynı anda biter: en erken işareti rota sırasındaki ilk tezgâhta kalır.
    expect(yer(panel, 'T1')?.getAttribute('aria-label')).toBe('ORN-T1 · 01.01 Pzt 08:00 boş yer, en erken biten: buraya taşı');
    expect(yer(panel, 'T2')?.getAttribute('aria-label')).toBe('ORN-T2 · 01.01 Pzt 08:00 boş yer: buraya taşı');
    fireEvent.click(yer(panel, 'T2') as HTMLElement);
    expect(tasi).not.toHaveBeenCalled();
    await waitFor(() => { expect(bolum().querySelector('[data-satir-tasi="1.10"]')).toBeTruthy(); });
    expect((within(satir('1.10')).getByRole('combobox', { name: 'Torna tezgâhı' }) as HTMLSelectElement).value).toBe('T2');
    expect(yer(screen.getByRole('complementary', { name: 'Torna için tezgâhlar' }), 'T2')?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(bolum().querySelector('[data-satir-tasi="1.10"]') as HTMLElement);
    expect(tasi).toHaveBeenCalledWith('1.10', 'T2', 8);
  });

  it('uymayan saatin yanında seçili tezgâhın en yakın boş yeri önerilir; uyan saatte öneri kalkar', async () => {
    // T1'de 9'da başlamak reddedilir; saat verilmeden sorulunca T1'in boş yeri 12'dir. En erken biten yer T2'dedir (8-14): öneri en erken
    // yerden değil, satırda seçili tezgâhtan gelmelidir.
    vi.spyOn(planaAl, 'planaAlOnizle').mockImplementation((g) => Promise.resolve(g.tezgah === 'T1' && g.baslangic === 9
      ? { calismaSurumu: 4, gecerli: false, ileti: 'ORN-dolu', bitis: null, isler: [] }
      : { calismaSurumu: 4, gecerli: true, ileti: null, bitis: 30, isler: [{ isId: '2.10', tezgah: g.tezgah, S: g.tezgah === 'T1' ? 12 : 8, C: g.tezgah === 'T1' ? 18 : 14 }, { isId: '2.30', tezgah: 'F1', S: 24, C: 28 }] }));
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} saatGirdisi={girdi} />);
    fireEvent.change(within(satir('2.10')).getByRole('combobox', { name: 'Torna tezgâhı' }), { target: { value: 'T1' } });
    fireEvent.change(within(satir('2.10')).getByLabelText('Torna başlangıcı'), { target: { value: '2026-01-01T09:00' } });
    await waitFor(() => { expect(bolum().querySelector('[data-satir-notu="2.10"] [role="alert"]')?.textContent).toBe('ORN-dolu'); });
    await waitFor(() => { expect(bolum().querySelector('[data-satir-notu="2.10"] [data-yakin-bos]')?.textContent).toBe('En yakın boş: ORN-T1 · 01.01 Pzt 12:00'); });
    expect(bolum().querySelector('[data-yakin-bos]')?.getAttribute('data-yakin-bos')).toBe('T1');
    // Satırdaki saat boş yerin saati değildir: paneldeki yer seçili görünmez.
    expect(yer(screen.getByRole('complementary', { name: 'Torna için tezgâhlar' }), 'T1')?.getAttribute('aria-pressed')).toBe('false');
    // Uyan saat girilince hata da öneri de kalkar.
    fireEvent.change(within(satir('2.10')).getByLabelText('Torna başlangıcı'), { target: { value: '2026-01-01T12:00' } });
    await waitFor(() => { expect(bolum().querySelector('[data-satir-notu="2.10"]')).toBeNull(); });
    expect(bolum().querySelector('[data-yakin-bos]')).toBeNull();
  });

  // İleri tarihe yerleşmiş operasyonun kendi işi pencerenin içinde kalır (iki hafta sonrası); gün yazıları seyrelir, üst üste binmez.
  it('ileri tarihe yerleşmiş operasyonun işi panelde görünür; gün yazıları en çok sekiz, dar ekranda dörttür', () => {
    const uzak: KokpitModeli = { ...M, isler: { '1.10': is('1.10', 'T1', 8 + 16 * 24, 12 + 16 * 24) } };
    render(<OdakPaneli m={uzak} ad="Torna" isId="1.10" tezgahlar={['T1', 'T2']} yerler={[]} secilen={null} zaman={zaman} fiil="Taşı" sec={null} />);
    const panel = screen.getByRole('complementary', { name: 'Torna için tezgâhlar' });
    expect(panel.querySelector('[data-odak-satir="T1"] .tc-pyq-odak-is[data-kendi]')).toBeTruthy();
    const yazilar = panel.querySelectorAll('.tc-pyq-odak-eksen i').length;
    expect(yazilar).toBeGreaterThan(0);
    expect(yazilar).toBeLessThanOrEqual(8);
    expect(panel.querySelectorAll('[data-odak-satir="T1"] .tc-pyq-odak-gun').length).toBeGreaterThan(8);
    cleanup();
    // Dar ekranda (panel satırın altında) yazı daha seyrektir: en çok dört.
    render(<OdakPaneli m={uzak} ad="Torna" isId="1.10" tezgahlar={['T1', 'T2']} yerler={[]} secilen={null} zaman={zaman} fiil="Taşı" sec={null} dar />);
    const dar = screen.getByRole('complementary', { name: 'Torna için tezgâhlar' }).querySelectorAll('.tc-pyq-odak-eksen i').length;
    expect(dar).toBeGreaterThan(0);
    expect(dar).toBeLessThanOrEqual(4);
    expect(dar).toBeLessThan(yazilar);
  });

  it('geniş ekranda panel tablonun altında boydan boyadır, seçili satırın içinde değil', async () => {
    onizlemeKur();
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(min-width: 1100px)', media: q, addEventListener: () => undefined, removeEventListener: () => undefined }));
    try {
      render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} />);
      const panel = await screen.findByRole('complementary', { name: 'Torna için tezgâhlar' });
      expect(bolum().querySelector('[data-satir-odagi]')).toBeNull();
      expect(panel.parentElement?.hasAttribute('data-altta')).toBe(true);
      expect(panel.previousElementSibling?.tagName).toBe('TABLE');
    } finally { vi.unstubAllGlobals(); }
  });
});

describe('yarım planlı emir (klasik düzen)', () => {
  const YARIM: KokpitEmri = { ...YENI, id: '3', no: 'ORN-UE-3', adimlar: [{ id: '3.10', ad: 'Torna', adaylar: ['T1', 'T2'] }, { id: '3.20', ad: 'Freze', adaylar: ['F1'], onculler: [['3.10', 'b']] }] };
  const MY: KokpitModeli = { ...M, isler: { ...M.isler, '3.10': is('3.10', 'T2', 8, 10) }, emirler: [YARIM] };
  it('plana alma önizlemesi sorulmaz, seç-yerleştir açılmaz; eksik adım nedeniyle yazar ve yolu söyler', async () => {
    const oz = onizlemeKur(), durum = vi.fn();
    const k = siraKartlari(MY).find((x) => x.kok === '3');
    if (!k) throw new Error('kart');
    render(<EmirAdimlari m={MY} kart={k} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} planlaDurumu={durum} plan={{ fail: ['3.20'], failNeden: { '3.20': { kod: 'zaman' } } }} />);
    const not = document.querySelector('[data-emir-neden="kismi"]');
    expect(not?.textContent).toContain('2. Freze: ufuk içinde tezgâh, vardiya, kaynak ya da malzeme yeri bulunamadı. Yoldaki');
    expect(not?.textContent).toContain('Eksik adımları planla');
    expect(document.querySelector('[data-emir-ozet]')?.textContent).toContain('kısmen planda, 1 adımın yeri yok');
    expect(document.querySelector('[data-etkin]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'İleriye yerleştir' })).toBeNull();
    await waitFor(() => { expect(durum).toHaveBeenLastCalledWith(null); });
    expect(oz).not.toHaveBeenCalled();
  });
});

describe('adım ortasından bölünen partinin notları ekranda (3523)', () => {
  const KOL = { emir: { 1: 'Torna adımını üst emir (ORN-UE-9) yapar; bu parti Freze adımından başlar.' }, adim: { '1.10': 'bekliyor: parti ORN-UE-9/1' } };

  it('partinin satırında bağ yazısı, üst emrin katılma adımında bekleme durur; not verilmezse ikisi de yoktur', () => {
    const { unmount } = render(<EmirAdimlari m={M} kart={kart('1')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} />);
    expect(document.querySelector('[data-emir-kol]')).toBeNull();
    expect(document.querySelector('[data-adim-parti]')).toBeNull();
    unmount();
    render(<EmirAdimlari m={M} kart={kart('1')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} kol={KOL} />);
    expect(document.querySelector('[data-emir="1"] [data-emir-kol]')?.textContent).toBe(KOL.emir[1]);
    expect(document.querySelector('[data-adim-satir="1.10"] [data-ad="Başlangıç"] [data-adim-parti="1.10"]')?.textContent).toBe('bekliyor: parti ORN-UE-9/1');
  });

  it('başka emrin notu bu emre yazılmaz; başlamış adımda bekleme yazısı yoktur', () => {
    const { unmount } = render(<EmirAdimlari m={M} kart={kart('1')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} kol={{ emir: { 2: 'x' }, adim: { '2.10': 'y' } }} />);
    expect(document.querySelector('[data-emir-kol]')).toBeNull();
    expect(document.querySelector('[data-adim-parti]')).toBeNull();
    unmount();
    const basladi = { ...M, isler: { '1.10': { ...is('1.10', 'T1', 8, 12), basladi: true } } };
    render(<EmirAdimlari m={basladi} kart={kart('1')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} kol={KOL} />);
    expect(document.querySelector('[data-emir-kol]')).not.toBeNull();
    expect(document.querySelector('[data-adim-parti]')).toBeNull();
  });

  it('Akış görünümünde de partinin satırı emir başlığında, bekleme katılma adımının kutusunda durur; başlamış adımda yoktur', () => {
    const { unmount } = render(<EmirAdimlari m={M} kart={kart('1')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} kol={KOL} ilkGorunum="akis" />);
    expect(document.querySelector('[data-emir="1"] [data-emir-kol]')?.textContent).toBe(KOL.emir[1]);
    expect([...document.querySelectorAll('[data-adim-parti]')].map((x) => [x.closest('[data-adim]')?.getAttribute('data-adim'), x.textContent])).toEqual([['1.10', 'bekliyor: parti ORN-UE-9/1']]);
    unmount();
    const basladi = { ...M, isler: { '1.10': { ...is('1.10', 'T1', 8, 12), basladi: true } } };
    render(<EmirAdimlari m={basladi} kart={kart('1')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} kol={KOL} ilkGorunum="akis" />);
    expect(document.querySelector('[data-adim-parti]')).toBeNull();
  });
});

describe('bitişi duruş okuma penceresinin ötesindeki emir, eski düzende (3522)', () => {
  it('emir başlığında, bitişin altında tek satır yazar; pencere içindeki emirde yoktur', () => {
    const { unmount } = render(<EmirAdimlari m={M} kart={kart('1')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} />);
    expect(document.querySelector('[data-durus-okunmadi]')).toBeNull();
    unmount();
    const k = kart('1'), sinir = (Math.floor(M.simdi / 24) + 367) * 24;
    render(<EmirAdimlari m={M} kart={{ ...k, emirler: k.emirler.map((e) => ({ ...e, bitis: sinir + 1 })) }} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} />);
    const not = document.querySelector('[data-emir="1"] [data-durus-okunmadi]');
    expect(not?.textContent).toBe('Bitiş bir yıldan ileride; o tarihlerdeki planlı duruşlar hesaba katılmadı, bitiş daha geç olabilir.');
    expect(not?.previousElementSibling?.hasAttribute('data-emir-ozet')).toBe(true);
    cleanup();
    // Pencere planın başından değil bugünden sayılır: iki gün sonra aynı bitiş pencerenin içindedir.
    render(<EmirAdimlari m={{ ...M, simdi: M.simdi + 48 }} kart={{ ...k, emirler: k.emirler.map((e) => ({ ...e, bitis: sinir + 1 })) }} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} />);
    expect(document.querySelector('[data-durus-okunmadi]')).toBeNull();
  });
});
