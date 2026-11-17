import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { bagliMakine, cihaziBagla, cihazKimligi, planFarki } from './cihaz-bagi.ts';
import { KART_BOSLUGU_MS, KART_GECERLI_MS, KartIstePenceresi, dokunmaIsle, kartGerekir } from './KisiGuvencesi.tsx';
import { YerSecimi, type YerIstasyonu } from './YerSecimi.tsx';
import { seritGerekir } from './BenimIslerim.tsx';
import type { IslerimSatiri } from '../../../../../../arkon/web/src/data/islerim.ts';
import type { Kullanici } from '../../../../ortak/veri/oturum.ts';

// 3392 a: ortak cihazın yere bağı, kişi güvencesi ve Benim işlerim şeridi. Değerler uydurmadır (ORN-).
const dinleyiciler: ((k: Kullanici) => void)[] = [];
vi.mock('../../../../ortak/veri/kart-degistir.ts', () => ({
  kartOkununca: (f: (k: Kullanici) => void) => { dinleyiciler.push(f); return () => { dinleyiciler.splice(dinleyiciler.indexOf(f), 1); }; },
}));
afterEach(() => { cleanup(); localStorage.clear(); dinleyiciler.length = 0; });

describe('cihaz bağı (3392 a madde 2-3, 8)', () => {
  it('bağlı makine yalnız istasyonun makinesiyse geçerlidir', () => {
    const mcs = [{ id: 'ORN-M01' }, { id: 'ORN-M02' }];
    expect(bagliMakine('ORN-M02', mcs)).toBe('ORN-M02');
    expect(bagliMakine('ORN-M09', mcs)).toBeNull();
    expect(bagliMakine(null, mcs)).toBeNull();
  });
  it('plan farkı yalnız ikisi de belli ve farklıysa', () => {
    expect(planFarki('ORN-M02', 'ORN-M01')).toBe('ORN-M01');
    expect(planFarki('ORN-M02', 'ORN-M02')).toBeNull();
    expect(planFarki(null, 'ORN-M01')).toBeNull();
    expect(planFarki('ORN-M02', null)).toBeNull();
  });
  it('bağ cihazda saklanır; cihaz kimliği bir kez üretilir', () => {
    cihaziBagla('ORN-TORNA-1', 'ORN-M02');
    expect(JSON.parse(localStorage.getItem('arkon:station')!)).toBe('ORN-TORNA-1');
    expect(JSON.parse(localStorage.getItem('arkon:machine')!)).toBe('ORN-M02');
    cihaziBagla('ORN-TORNA-1', null);
    expect(localStorage.getItem('arkon:machine')).toBeNull();
    const k = cihazKimligi();
    expect(k).toMatch(/^[0-9a-f-]{36}$/);
    expect(cihazKimligi()).toBe(k);
  });
});

describe('kişi güvencesi (3392 a madde 7)', () => {
  const t0 = 1_000_000_000;
  it('bitir her seferinde kart ister; öbürleri yalnız ekran boş kaldıysa', () => {
    const d = { bosKaldi: false, sonKart: 0 };
    expect(kartGerekir('finish', d, t0)).toBe(true);
    expect(kartGerekir('start', d, t0)).toBe(false);
    expect(kartGerekir('scrap', { ...d, bosKaldi: true }, t0)).toBe(true);
  });
  it('kart okutulduktan sonraki kısa süre aynı niyettir; sonra yine sorulur', () => {
    const d = { bosKaldi: false, sonKart: t0 };
    expect(kartGerekir('finish', d, t0 + KART_GECERLI_MS - 1)).toBe(false);
    expect(kartGerekir('finish', d, t0 + KART_GECERLI_MS)).toBe(true);
  });
  it('20 dk boşluktan sonraki dokunuş "boş kaldı" der; arada başka yere dokunmak bunu silmez', () => {
    let d = { bosKaldi: false, sonKart: 0, sonDokunma: t0 };
    d = dokunmaIsle(d, t0 + KART_BOSLUGU_MS - 1);
    expect(d.bosKaldi).toBe(false);
    d = dokunmaIsle(d, d.sonDokunma + KART_BOSLUGU_MS);
    expect(d.bosKaldi).toBe(true);
    d = dokunmaIsle(d, d.sonDokunma + 1000);
    expect(d.bosKaldi).toBe(true);
  });
  it('aynı kişinin kartı devam ettirir, başka kişinin kartı pencereyi kapatır; Vazgeç kayıt yapmaz', () => {
    const devam = vi.fn(); const kapat = vi.fn();
    render(<KartIstePenceresi eylem="finish" kisiId={7} kisiAdi="ORN Operatör" devam={devam} kapat={kapat} />);
    expect(screen.getByText('Bitir için kartını okut')).toBeTruthy();
    act(() => { for (const f of [...dinleyiciler]) f({ id: 8 } as Kullanici); });
    expect(devam).not.toHaveBeenCalled();
    expect(kapat).toHaveBeenCalledTimes(1);
    act(() => { for (const f of [...dinleyiciler]) f({ id: 7 } as Kullanici); });
    expect(devam).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole('button', { name: /Vazgeç/ }).at(-1)!);
    expect(kapat).toHaveBeenCalledTimes(2);
  });
});

const ISTASYONLAR: YerIstasyonu[] = [
  { id: 'ORN-TORNA-1', ad: 'Torna', merkez: 'Talaşlı', makineler: [{ id: 'ORN-M01', ad: 'Torna 1' }, { id: 'ORN-M02', ad: 'Torna 2' }] },
  { id: 'ORN-KALITE', ad: 'Kalite', merkez: 'Kalite', makineler: [] },
];
const yerAc = (dar: boolean, ayrim: (m: string) => string | null = () => null) => {
  const bagla = vi.fn();
  render(<YerSecimi istasyonlar={ISTASYONLAR} istasyon="" makine={null} ayrim={ayrim} dar={dar} bagla={bagla} kapat={() => undefined} />);
  return bagla;
};
const bagla = () => screen.getByRole('button', { name: /Bağla/ }) as HTMLButtonElement;

describe('yer seçimi iki adım (3392 a madde 1)', () => {
  it('geniş ekranda iki sütun; Bağla makine seçilene kadar pasif, İleri yok', () => {
    const f = yerAc(false);
    expect(screen.getByRole('radiogroup', { name: 'İstasyon' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /İleri/ })).toBeNull();
    expect(bagla().disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /ORN-TORNA-1/ }));
    expect(bagla().disabled).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: /ORN-M02/ }));
    fireEvent.click(bagla());
    expect(f).toHaveBeenCalledWith('ORN-TORNA-1', 'ORN-M02');
  });
  it('"Makine sabit değil" makinesiz bağ yazar; makinesiz istasyon makine istemez', () => {
    const f = yerAc(false);
    fireEvent.click(screen.getByRole('radio', { name: /ORN-TORNA-1/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Makine sabit değil/ }));
    fireEvent.click(bagla());
    expect(f).toHaveBeenLastCalledWith('ORN-TORNA-1', null);
    fireEvent.click(screen.getByRole('radio', { name: /ORN-KALITE/ }));
    fireEvent.click(bagla());
    expect(f).toHaveBeenLastCalledWith('ORN-KALITE', null);
  });
  it('dar ekranda önce istasyon, İleri ile makine; Geri istasyona döner', () => {
    const f = yerAc(true);
    expect(screen.queryByRole('radiogroup', { name: 'Makine' })).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: /ORN-TORNA-1/ }));
    fireEvent.click(screen.getByRole('button', { name: /İleri/ }));
    expect(screen.queryByRole('radiogroup', { name: 'İstasyon' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Geri/ }));
    expect(screen.getByRole('radiogroup', { name: 'İstasyon' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /İleri/ }));
    fireEvent.click(screen.getByRole('radio', { name: /ORN-M01/ }));
    fireEvent.click(bagla());
    expect(f).toHaveBeenCalledWith('ORN-TORNA-1', 'ORN-M01');
  });
});

describe('Benim işlerim (3392 a madde 6)', () => {
  const sat = (emirId: number, istasyon: string): IslerimSatiri => ({ emirId, emirNo: `ORN-E-${String(emirId)}`, isEmriId: null, opNo: 10, istasyon, istasyonAd: '', mc: 'ORN-M01', makineAd: null, giris: '2026-11-17T08:00:00Z' });
  const ortam = { istasyon: 'ORN-TORNA-1', ekrandaki: { emirId: 1, isEmriId: null }, gecilebilir: [] };
  it('tek iş ekrandaysa şerit çizilmez; iki iş ya da ekranda olmayan iş varsa çizilir', () => {
    expect(seritGerekir([], ortam)).toBe(false);
    expect(seritGerekir([sat(1, 'ORN-TORNA-1')], ortam)).toBe(false);
    expect(seritGerekir([sat(2, 'ORN-TORNA-1')], ortam)).toBe(true);
    expect(seritGerekir([sat(1, 'ORN-TORNA-1'), sat(3, 'ORN-FREZE-1')], ortam)).toBe(true);
  });
});
