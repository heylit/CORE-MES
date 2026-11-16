import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as gonder from '../motor/atolye/gonder.ts';
import * as planaAl from './plana-al.ts';
import type { KokpitEmri, KokpitIsi, KokpitModeli } from './kurallar.ts';
import { EmirAdimlari, SiraSeridi } from './Yerlestirme.tsx';
import { siraKartlari } from './yerlestirme.ts';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

// Uydurma örnek (ORN-): planlı tek adımlı emir ve iki tezgâh adımlı, arada fason adımı olan plansız emir.
const is = (id: string, m: string, S: number, C: number): KokpitIsi => ({ id, job: id.split('.')[0] ?? '', ad: id, m, S, C, basladi: false, fason: false, kilitli: false, sira: 0 });
const PLANLI: KokpitEmri = { id: '1', no: 'ORN-UE-1', urun: 'ORN-Flanş', adet: 8, termin: 60, bitis: 12, durum: 'iyi', gecikme: -48, adimlar: [{ id: '1.10', ad: 'Torna', adaylar: ['T1'] }] };
const YENI: KokpitEmri = {
  id: '2', no: 'ORN-UE-2', urun: 'ORN-Burç', adet: 40, termin: 40, bitis: null, durum: 'plansiz', gecikme: null,
  adimlar: [{ id: '2.10', ad: 'Torna', adaylar: ['T1', 'T2'] }, { id: '2.20', ad: 'Kaplama', adaylar: ['@F1'] }, { id: '2.30', ad: 'Freze', adaylar: ['F1', 'F2'] }],
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
    const kartlar = within(screen.getByRole('region', { name: 'Emirler, sırasıyla' })).getAllByRole('button');
    expect(kartlar.map((b) => b.getAttribute('data-kart'))).toEqual(['2', '1']);
    expect(kartlar[0]?.textContent).toContain('ORN-UE-2');
    expect(kartlar[0]?.textContent).toContain('Yeni');
    expect(kartlar[0]?.textContent).toContain('0 / 2 operasyon yerleşti');
    expect(kartlar[0]?.getAttribute('aria-pressed')).toBe('true');
    expect(kartlar[1]?.textContent).toContain('Planlı');
    fireEvent.click(kartlar[1] as HTMLElement);
    expect(sec).toHaveBeenCalledWith('1');
  });

  it('emir yoksa boş durum yazılır', () => {
    render(<SiraSeridi kartlar={[]} secili={null} sec={vi.fn()} zaman={zaman} />);
    expect(screen.getByText('Planda ve sırada emir yok.')).toBeTruthy();
  });
});

describe('Kokpit emirler ve operasyonlar (3297)', () => {
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
    expect(bolum.querySelector('[data-adim="2.10"]')?.textContent).toContain('ORN-T1 seçildi');
    const freze = await within(bolum).findByRole('group', { name: 'Freze için boş yerler' });
    await waitFor(() => { expect(freze.querySelectorAll('li')).toHaveLength(2); });
    // Freze adayları seçilen tornayla (T1) sorulur.
    expect(oz).toHaveBeenLastCalledWith({ emirId: '2', tezgah: 'T1', baslangic: 8, adimlar: [{ isId: '2.30', tezgah: 'F2' }] }, 4);
    expect(freze.querySelector('li')?.textContent).toContain('ORN-F1 · Pzt 28:00 → 32:00');

    fireEvent.click(within(freze.querySelectorAll('li')[1] as HTMLElement).getByRole('button', { name: 'Yerleştir' }));
    expect(uygula).toHaveBeenCalledTimes(1);
    expect(uygula).toHaveBeenCalledWith({ isId: '2.10', tezgah: 'T1', baslangic: 8, planaAl: '2', adimlar: [{ isId: '2.30', tezgah: 'F2' }] }, false);
  });

  it('Hepsini en erken yere yerleştir: seçimsiz plana alır, tezgâhı sistem seçer; termini geçen yerleşim geç bırakır diye bildirilir', async () => {
    onizlemeKur();
    const uygula = vi.fn();
    const gec = { ...M, emirler: [PLANLI, { ...YENI, termin: 20 }] };
    const k = siraKartlari(gec).find((x) => x.kok === '2');
    if (!k) throw new Error('kart');
    render(<EmirAdimlari m={gec} kart={k} zaman={zaman} uygula={uygula} surum={4} adimAc={vi.fn()} />);
    const dugme = screen.getByRole('button', { name: 'Hepsini en erken yere yerleştir' });
    await waitFor(() => { expect((dugme as HTMLButtonElement).disabled).toBe(false); });
    fireEvent.click(dugme);
    expect(uygula).toHaveBeenCalledWith({ isId: '2.10', tezgah: 'T2', baslangic: 8, planaAl: '2' }, true);
  });

  it('planda yeri olan adım tezgâhı ve saatiyle yazılır; basınca tahtada açılır, sunucuya sorulmaz', () => {
    const oz = onizlemeKur();
    const adimAc = vi.fn();
    render(<EmirAdimlari m={M} kart={kart('1')} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={adimAc} />);
    const adim = screen.getByRole('button', { name: /Torna/ });
    expect(adim.textContent).toContain('ORN-T1 · Pzt 08:00 → 12:00');
    fireEvent.click(adim);
    expect(adimAc).toHaveBeenCalledWith('1', '1.10');
    expect(oz).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Hepsini en erken yere yerleştir' })).toBeNull();
  });

  it('yazamayan kişi adımları görür, yerleştiremez', () => {
    onizlemeKur();
    render(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={null} surum={4} adimAc={vi.fn()} />);
    expect(screen.getByText('Emri yalnız planı yazabilen kişi yerleştirir.')).toBeTruthy();
    expect((screen.getByRole('button', { name: /Torna/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Yerleştir' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hepsini en erken yere yerleştir' })).toBeNull();
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
    expect(screen.getByRole('region', { name: 'Emirler ve operasyonlar' }).querySelector('[data-adim="2.10"]')?.textContent).toContain('ORN-T1 seçildi');
    rerender(<EmirAdimlari m={M} kart={kart('2')} zaman={zaman} uygula={vi.fn()} surum={5} adimAc={vi.fn()} taslakVar />);
    await waitFor(() => { expect(screen.getByRole('region', { name: 'Emirler ve operasyonlar' }).querySelector('[data-adim="2.10"]')?.textContent).toContain('yerleşmedi'); });
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
    expect((screen.getByRole('button', { name: 'Hepsini en erken yere yerleştir' }) as HTMLButtonElement).disabled).toBe(true);
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

  it('başlamış iş taşınmaz: neden yazılır, sunucuya sorulmaz, tahtaya hedef verilmez', () => {
    const oz = tasiOnizle();
    const hedef = vi.fn();
    const m = { ...MT, isler: { ...MT.isler, '1.10': { ...is('1.10', 'T1', 20, 24), ad: 'Torna', basladi: true } } };
    render(<EmirAdimlari m={m} kart={k1()} zaman={zaman} uygula={vi.fn()} surum={4} adimAc={vi.fn()} hedef={hedef} secIs="1.10" tasi={vi.fn()} />);
    expect(screen.getByText('Başlamış iş taşınmaz.')).toBeTruthy();
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
