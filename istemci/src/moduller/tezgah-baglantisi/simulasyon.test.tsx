import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ORNEK_AYRINTI, ORNEK_LSV2_AYRINTI } from './fikstur.ts';
import { Simulasyon } from './Simulasyon.tsx';
import { anDegeri, bosluktaMi, eksenleriBul, oranla, oynatmaAnlari } from './simulasyon.ts';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const konumsuz = () => {
  const a = ORNEK_AYRINTI();
  return { ...a, alanlar: a.alanlar.filter((x) => x.tur !== 'Position') };
};

describe('simülasyon: saf kurallar', () => {
  it('eksenler Position türünden ve bileşen adından bulunur; sayı olmayan değer null olur', () => {
    const a = ORNEK_AYRINTI();
    expect(eksenleriBul(a.alanlar).map((s) => [s.eksen, s.simdi])).toEqual([['X', 112.4], ['Y', 214.35], ['Z', -38.1]]);
    const bozuk = a.alanlar.map((x) => (x.kimlik === 'zpos' ? { ...x, deger: 'UNAVAILABLE' } : x));
    expect(eksenleriBul(bozuk).find((s) => s.eksen === 'Z')?.simdi).toBeNull();
    const bos = a.alanlar.map((x) => (x.kimlik === 'zpos' ? { ...x, deger: '' } : x));
    expect(eksenleriBul(bos).find((s) => s.eksen === 'Z')?.simdi).toBeNull();
    expect(eksenleriBul(konumsuz().alanlar)).toEqual([]);
  });

  it('Heidenhain eksenleri Axes bileşeninde öğe adından bulunur; geçmişsiz olduğu için eğri boştur (kart 3790)', () => {
    const s = eksenleriBul(ORNEK_LSV2_AYRINTI().alanlar);
    expect(s.map((x) => [x.eksen, x.simdi, x.nokta.length])).toEqual([['X', 112.4, 0], ['Y', 214.35, 0], ['Z', -38.1, 0]]);
  });

  it('saat fikstür kurulurken ilerlese de eksenlerin geri oynatma anları ortaktır', () => {
    let t = Date.parse('2026-11-24T12:00:00Z');
    vi.spyOn(Date, 'now').mockImplementation(() => t++);
    expect(oynatmaAnlari(eksenleriBul(ORNEK_AYRINTI().alanlar))).toHaveLength(5);
  });

  it('geri oynatma anı için son bilinen değer alınır; ilk noktadan önce değer yoktur; ölçek son saatin aralığıdır', () => {
    const [x] = eksenleriBul(ORNEK_AYRINTI().alanlar);
    if (x === undefined) throw new Error('X yok');
    const anlar = oynatmaAnlari([x]);
    expect(anlar).toHaveLength(5);
    expect(anDegeri(x, new Date(new Date(anlar[0] ?? '').getTime() - 1000).toISOString())).toBeNull();
    expect(anDegeri(x, anlar[2] ?? '')).toBe(120);
    expect(oranla(120, x)).toBe(1);
    expect(oranla(80, x)).toBe(0);
    expect(oranla(null, x)).toBe(0.5);
    expect(oranla(5, { ...x, simdi: 5, nokta: [] })).toBe(0.5);
  });
});

describe('simülasyon: ekran', () => {
  it('canlı eksen konumları ve iş mili birimiyle yazılır', () => {
    render(<Simulasyon a={ORNEK_AYRINTI()} turSec={() => undefined} />);
    expect(screen.getByRole('img', { name: /Tezgâh şeması, .*canlı/ })).toBeTruthy();
    expect(screen.getByText(/^X konumu · masa/).nextElementSibling?.textContent).toContain('112,4');
    expect(screen.getByText(/^Z konumu · iş mili/).nextElementSibling?.textContent).toContain('-38,1');
    expect(screen.getByText('İş mili').nextElementSibling?.textContent).toContain('2.350');
  });

  it('geri oynatma çubuğu o andaki konumu gösterir, iş milini yazmaz; "Canlıya dön" canlıya döndürür', () => {
    render(<Simulasyon a={ORNEK_AYRINTI()} turSec={() => undefined} />);
    expect(screen.queryByRole('button', { name: 'Canlıya dön' })).toBeNull();
    fireEvent.change(screen.getByLabelText('Geçmiş görünüm zamanı'), { target: { value: '2' } });
    expect(screen.getByText(/^X konumu · masa/).nextElementSibling?.textContent).toContain('120');
    expect(screen.getByText('İş mili').nextElementSibling?.textContent).toBe('—');
    expect(screen.getByRole('img', { name: /geçmiş görünüm/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Canlıya dön' }));
    expect(screen.getByText(/^X konumu · masa/).nextElementSibling?.textContent).toContain('112,4');
    expect(screen.queryByRole('button', { name: 'Canlıya dön' })).toBeNull();
  });

  it('Eksen konumu yoksa çökmeden "Eksen konumu yok" yazar', () => {
    render(<Simulasyon a={konumsuz()} turSec={() => undefined} />);
    expect(screen.getByRole('status').textContent).toContain('bu tezgâh eksen konumu göndermiyor');
    expect(screen.queryByRole('img', { name: /Tezgâh şeması/ })).toBeNull();
  });

  it('yalnız bazı eksenler varsa olmayanın yerine "—" yazılır', () => {
    const a = ORNEK_AYRINTI();
    render(<Simulasyon a={{ ...a, alanlar: a.alanlar.filter((x) => x.kimlik !== 'ypos') }} turSec={() => undefined} />);
    expect(within(screen.getByText(/^Y konumu/).parentElement as HTMLElement).getByText('—')).toBeTruthy();
    expect(screen.getByText(/^X konumu · masa/).nextElementSibling?.textContent).toContain('112,4');
  });

  it('tür seçilmemişse çizim yok, yalnız konum değerleri vardır; seçim değişince turSec çağrılır', () => {
    const turlar: (string | null)[] = [];
    render(<Simulasyon a={{ ...ORNEK_AYRINTI(), tezgahTuru: null }} turSec={(t) => turlar.push(t)} />);
    expect(screen.queryByRole('img', { name: /Tezgâh şeması/ })).toBeNull();
    expect(screen.getByText(/Tezgâh türü seçilmedi/)).toBeTruthy();
    expect(screen.getByText('X konumu').nextElementSibling?.textContent).toContain('112,4');
    fireEvent.change(screen.getByLabelText('Tezgâh türü'), { target: { value: 'torna' } });
    expect(turlar).toEqual(['torna']);
  });

  it('her tür kendi çizimini ve eksen rolünü gösterir', () => {
    for (const [tur, ad, rol] of [['dikey-freze', 'Dikey freze', 'masa'], ['torna', 'Torna', 'araba'], ['yatay-islem', 'Yatay işlem merkezi', 'iş mili']] as const) {
      render(<Simulasyon a={{ ...ORNEK_AYRINTI(), tezgahTuru: tur }} turSec={() => undefined} />);
      expect(screen.getByRole('img', { name: new RegExp(`Tezgâh şeması, ${ad}`) })).toBeTruthy();
      expect(screen.getAllByText(new RegExp(`konumu · ${rol}`)).length).toBeGreaterThan(0);
      cleanup();
    }
  });

  it('okuma eskiyse "canlı" denmez; geçmişte ortalama ve kaydırıcı saati okunur; boşluk dakikasında konum yazılmaz', () => {
    const a = ORNEK_AYRINTI();
    render(<Simulasyon a={{ ...a, okundu: new Date(Date.now() - 120_000).toISOString() }} turSec={() => undefined} />);
    expect(screen.getByText('Eski okuma: konumlar güncel değil')).toBeTruthy();
    expect(screen.getByRole('img', { name: /eski okuma/ })).toBeTruthy();
    cleanup();
    const bos = { ...a, bosluklar: [{ zaman: a.alanlar.find((x) => x.kimlik === 'xpos')?.egri[2]?.zaman ?? '', neden: 'tampon-asildi' as const }] };
    render(<Simulasyon a={bos} turSec={() => undefined} />);
    const cubuk = screen.getByLabelText('Geçmiş görünüm zamanı');
    expect(cubuk.getAttribute('aria-valuetext')).toBe('Canlı');
    fireEvent.change(cubuk, { target: { value: '2' } });
    expect(cubuk.getAttribute('aria-valuetext')).toMatch(/\d{2}:\d{2}/);
    expect(screen.getByText('X konumu · masa (ort.)').nextElementSibling?.textContent).toBe('—');
    expect(screen.getByText(/veri yok/)).toBeTruthy();
    fireEvent.change(cubuk, { target: { value: '1' } });
    expect(screen.getByText('X konumu · masa (ort.)').nextElementSibling?.textContent).toContain('95');
  });

  it('boşluk dakikası: kayıt önceki an ile bu an arasındaysa bilinmez', () => {
    expect(bosluktaMi([{ zaman: '2026-11-24T12:00:30Z' }], '2026-11-24T12:01:00Z', '2026-11-24T12:00:00Z')).toBe(true);
    expect(bosluktaMi([{ zaman: '2026-11-24T12:00:30Z' }], '2026-11-24T12:02:00Z', '2026-11-24T12:01:00Z')).toBe(false);
  });
});
