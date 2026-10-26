import { describe, expect, it, vi } from 'vitest';
import { anahtarliErteleyici } from '../../../../arkon/web/src/data/ertele.ts';
import { gecisteDuraklatilacaklar, oneAlinanSuruyor, siraAnahtari, yeniOneAlinan } from '../../../../arkon/web/src/data/is-gecisi.ts';

// TA1: TMI bir istasyonda tek başlamış emre izin verir; Arkon ekranı iş değiştirirken çalışan eski işi duraklatır (operator.ts isGec).
describe('Arkon iş değiştirme', () => {
  it('çalışan işten başka işe geçilirken eski iş duraklatılır', () => {
    expect(gecisteDuraklatilacaklar([{ state: 'running' }, { state: 'queued' }], 1)).toEqual([0]);
  });
  it('çalışmayan iş, aynı işe geçiş ve boş iş duraklatılmaz', () => {
    for (const state of ['queued', 'setup', 'paused', 'stopped', 'done']) expect(gecisteDuraklatilacaklar([{ state }, {}], 1), state).toEqual([]);
    expect(gecisteDuraklatilacaklar([{}, {}, { state: 'running' }], 2)).toEqual([]);
    expect(gecisteDuraklatilacaklar([{ state: 'running', empty: true }, {}], 1)).toEqual([]);
  });
  // AR2 (ikinci tarayıcı turu Y2): yenilemeden sonra etkin iş listenin ilk işidir, çalışan iş etkin olmayabilir.
  it('etkin olmayan çalışan iş de duraklatılır (AR2)', () => {
    expect(gecisteDuraklatilacaklar([{ state: 'queued' }, { state: 'running' }, { state: 'queued' }], 2)).toEqual([1]);
    expect(gecisteDuraklatilacaklar([{ state: 'queued' }, { state: 'running' }], 1)).toEqual([]);
  });
});

// Kart #199 (3b): Planlama çalışan işin önüne iş alınca operatör uyarılır; geçişi operatör yapar.
describe('Arkon öne alınan iş', () => {
  const is = (no: string, state: string, empty?: boolean) => ({ no, state, ...(empty ? { empty } : {}) });
  it('plan çalışanın önüne iş koyunca o iş öne alınmıştır; yeni gelen iş de sayılır', () => {
    expect(yeniOneAlinan(['A', 'B', 'C'], [is('C', 'queued'), is('A', 'running'), is('B', 'queued')])).toBe('C');
    expect(yeniOneAlinan(['A', 'B'], [is('Y', 'queued'), is('A', 'running'), is('B', 'queued')])).toBe('Y');
  });
  it('operatörün alttaki işi seçmesi, ilk yükleme, çalışan iş yokken ya da boş iş uyarı doğurmaz', () => {
    expect(yeniOneAlinan(['A', 'B', 'C'], [is('A', 'queued'), is('B', 'queued'), is('C', 'running')])).toBeNull();
    expect(yeniOneAlinan([], [is('C', 'queued'), is('A', 'running')])).toBeNull();
    expect(yeniOneAlinan(['A', 'C'], [is('C', 'queued'), is('A', 'paused')])).toBeNull();
    expect(yeniOneAlinan(['A', 'C'], [is('C', 'queued', true), is('A', 'running')])).toBeNull();
  });
  it('uyarı öndeki iş kuyrukta çalışanın üstünde durdukça sürer', () => {
    expect(oneAlinanSuruyor('C', [is('C', 'queued'), is('A', 'running')])).toBe(true);
    expect(oneAlinanSuruyor('C', [is('C', 'running'), is('A', 'paused')])).toBe(false);
    expect(oneAlinanSuruyor('C', [is('A', 'running'), is('C', 'queued')])).toBe(false);
  });
});

// AR2 (Y2): iş değiştirmede eski işin "duraklatıldı" kaydı yeni işin kaydıyla ezilmemeli; zamanlayıcı anahtar (paket) başınadır.
describe('Arkon sonuç kaydı ertelemesi', () => {
  it('farklı anahtarlar birbirini iptal etmez, aynı anahtarda son çağrı kalır', () => {
    vi.useFakeTimers();
    try {
      const ertele = anahtarliErteleyici();
      const calisan: string[] = [];
      ertele('eski', () => calisan.push('eski-duraklatildi'), 50);
      ertele('yeni', () => calisan.push('yeni-1'), 1500);
      ertele('yeni', () => calisan.push('yeni-2'), 1500);
      vi.advanceTimersByTime(2000);
      expect(calisan).toEqual(['eski-duraklatildi', 'yeni-2']);
    } finally {
      vi.useRealTimers();
    }
  });
});

// 639f: aynı emrin iki adımı aynı emir nosunu taşır; sıra ve öne alma adımın paketiyle ayırt edilir.
describe('Aynı emrin iki adımı', () => {
  const adim = (id: string, state: string) => ({ no: 'IE-1', pkg: { id }, state });
  it('anahtar paket kimliğidir; paketsiz işte emir nosu', () => {
    expect(siraAnahtari(adim('tmi-ie-10', 'queued'))).toBe('tmi-ie-10');
    expect(siraAnahtari({ no: 'IE-2' })).toBe('IE-2');
  });
  it('öne alınan adım, çalışan adımla aynı emirde olsa da bulunur', () => {
    const once = ['tmi-ie-10', 'tmi-ie-20'];
    const sonra = [adim('tmi-ie-20', 'queued'), adim('tmi-ie-10', 'running')];
    expect(yeniOneAlinan(once, sonra)).toBe('tmi-ie-20');
    expect(oneAlinanSuruyor('tmi-ie-20', sonra)).toBe(true);
    expect(oneAlinanSuruyor('tmi-ie-10', sonra)).toBe(false);
  });
});
