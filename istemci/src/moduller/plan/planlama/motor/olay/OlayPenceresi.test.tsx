import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BildirimSaglayici } from '../../../../../ortak/arayuz/index.ts';
import { PLANLAMA_ISLEMI } from '../../../planlama-menusu.ts';
import type { PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import { KIMLIK_ADLARI } from '../../kaynak-kodu.tsx';
import type { PlanlamaDeposu } from '../../veri.ts';
import { yetkiKur } from '../../yetki.ts';
import { ornekCalisma } from '../ornek.ts';
import { OlayPenceresi } from './OlayFormu.tsx';

// Olay çalışmayı değiştirince plan kendiliğinden uygulanır (2053-1 a). Stüdyo kalkınca bu kancayı kuran tek yer olay penceresidir:
// pencere kapalıyken de kurulu durmalıdır, yoksa olay eklenir ama plan eski kalır.
const kancalar = vi.hoisted(() => ({ otomatik: vi.fn(), olayEkle: vi.fn(() => Promise.resolve(true)) as (() => Promise<boolean>) | null }));
vi.mock('../atolye/gonder.ts', () => ({
  useOtomatikUygula: kancalar.otomatik,
  useAtolyeKomutlari: () => ({ olayEkle: kancalar.olayEkle }),
}));

afterEach(() => { cleanup(); kancalar.otomatik.mockClear(); kancalar.olayEkle = vi.fn(() => Promise.resolve(true)); });

type O = Pick<PlanlamaEkranOzellikleri, 'komut' | 'yetki' | 'yenile' | 'calisma' | 'depo'>;
const ciz = (on: 'ariza' | 'acil' | null) => {
  const c = ornekCalisma();
  const o: O = { komut: null, yetki: yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz']), yenile: () => {}, calisma: c, depo: { durum: null } as unknown as PlanlamaDeposu };
  render(<BildirimSaglayici><OlayPenceresi o={o} c={c} ad={KIMLIK_ADLARI} on={on} kapat={() => {}} /></BildirimSaglayici>);
  return o;
};

describe('olay penceresi', () => {
  it('pencere kapalıyken de kendiliğinden uygulama kancası aynı çalışmayla kuruludur; form çizilmez', () => {
    const o = ciz(null);
    expect(kancalar.otomatik).toHaveBeenCalled();
    expect(kancalar.otomatik.mock.calls[0]?.[0]).toBe(o);
    expect(typeof kancalar.otomatik.mock.calls[0]?.[1]).toBe('function');
    expect(screen.queryByRole('group', { name: 'Olay türü' })).toBeNull();
  });

  it('açılınca form istenen türle gelir (izinli); yazma komutu yoksa form yerine nedeni yazar (reddedilen)', () => {
    ciz('acil');
    expect(screen.getByRole('dialog', { name: 'Olay ekle' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Acil sipariş' }).getAttribute('aria-pressed')).toBe('true');
    cleanup();
    kancalar.olayEkle = null;
    ciz('ariza');
    expect(screen.queryByRole('group', { name: 'Olay türü' })).toBeNull();
    expect(screen.getByText('Olay eklemek plan yazma yetkisi ister.')).toBeTruthy();
  });
});
