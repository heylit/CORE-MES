import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BildirimSaglayici } from '../../../../../ortak/arayuz/index.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import type { IzSatiri, PlanlamaCalismasi } from '../../tipler.ts';
import type { PlanlamaDeposu } from '../../veri.ts';
import { PLANLAMA_ANAHTARI } from '../../veri.ts';
import { yetkiKur } from '../../yetki.ts';
import { MALIYETSIZ, YONETICI, ac as ortakAc, sunucuKur } from '../../test-ortak.tsx';
import { CALISMA_DEGERI, calismaKur, OKUYAN, PLANCI } from '../veri/test-veri.tsx';
import { GecmisEkrani, type GecmisBolumu } from './index.tsx';
import { IZ_GOSTERIM, izKisileri, izSuz } from './kurallar.ts';

afterEach(cleanup);

const IZ: IzSatiri[] = [
  { t: Date.UTC(2026, 9, 21, 9, 30), kim: 'Deneme planci', rol: '', sayfa: 'Planlama motoru', ne: 'Sipariş önceliği değişti', ayrinti: 'S1: Yüksek' },
  { t: Date.UTC(2026, 9, 21, 9, 0), kim: 'Deneme mudur', rol: 'mudur', sayfa: 'Veri ve kısıtlar', ne: 'Kısıt kapatıldı', ayrinti: 'tatil' },
  { t: Date.UTC(2026, 9, 20, 16, 0), kim: 'Deneme planci', rol: '', sayfa: 'Planlama motoru', ne: 'Parametre değişti', ayrinti: '' },
];
const izli = (iz: IzSatiri[] = IZ) => calismaKur((c) => { (c as unknown as Record<string, unknown>).iz = structuredClone(iz); });

describe('Geçmiş hesapları', () => {
  it('kişiler ilk görünme sırasıyla; süzgeç kişiye göre, en çok 200 satır', () => {
    expect(izKisileri(IZ)).toEqual(['Deneme planci', 'Deneme mudur']);
    expect(izSuz(IZ, 'Deneme planci').map((x) => x.ne)).toEqual(['Sipariş önceliği değişti', 'Parametre değişti']);
    expect(izSuz(IZ, null)).toHaveLength(3);
    const cok = Array.from({ length: 250 }, (_, i) => ({ ...IZ[0] as IzSatiri, t: i }));
    expect(izSuz(cok, null)).toHaveLength(IZ_GOSTERIM);
  });
});

function ac(c: PlanlamaCalismasi | null, islemler = PLANCI, bolum?: GecmisBolumu) {
  const bolumSec = vi.fn<(b: GecmisBolumu) => void>();
  const o: PlanlamaEkranOzellikleri = {
    depo: { durum: null } as unknown as PlanlamaDeposu, calisma: c, komut: null, yetki: yetkiKur(islemler, { yazabilir: true }), git: vi.fn(), yenile: () => undefined,
    olcek: ACILIS_OLCEGI, olcekSec: () => undefined, kaydir: () => undefined, secim: BOS_SECIM, sec: vi.fn(),
  };
  render(<BildirimSaglayici><GecmisEkrani {...o} bolum={bolum} bolumSec={bolum ? bolumSec : undefined} /></BildirimSaglayici>);
  return { bolumSec };
}

describe('Geçmiş ekranı', () => {
  it('Değişiklik izi: satırlar en yeni önde, kişiye göre süzülür; kayıt sayısı ve sınır yazılır', () => {
    ac(izli(), PLANCI, 'iz');
    const tablo = screen.getByRole('table', { name: 'Değişiklik izi' });
    expect(within(tablo).getAllByRole('row').slice(1).map((r) => r.querySelector('b')?.textContent)).toEqual(['Sipariş önceliği değişti', 'Kısıt kapatıldı', 'Parametre değişti']);
    expect(within(tablo).getAllByRole('row')[2]?.textContent).toContain('mudur');
    expect(screen.getByText(/^3 kayıt\. .*en yeni 400 satır kalır\.$/)).toBeTruthy();
    fireEvent.change(screen.getByRole('combobox', { name: 'Kişi' }), { target: { value: 'Deneme mudur' } });
    expect(within(tablo).getAllByRole('row').slice(1).map((r) => r.querySelector('b')?.textContent)).toEqual(['Kısıt kapatıldı']);
  });

  it('boş iz, çalışma yok; bölüm menüsü adresi değiştirir; Senaryolar yerinde', () => {
    const { bolumSec } = ac(izli([]), PLANCI, 'iz');
    expect(screen.getByText('Kayıt yok.')).toBeTruthy();
    fireEvent.click(within(screen.getByRole('navigation', { name: 'Geçmiş' })).getByRole('button', { name: 'Senaryolar' }));
    expect(bolumSec).toHaveBeenCalledWith('senaryolar');
    cleanup();
    ac(izli());
    expect(screen.getByRole('region', { name: 'Senaryolar' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklik izi' }));
    expect(screen.getByRole('table', { name: 'Değişiklik izi' })).toBeTruthy();
    cleanup();
    ac(null);
    expect(screen.getByText('Planlama çalışması yok')).toBeTruthy();
  });

  it('her rolde aynı görünüm: okuyan da yazan da aynı bölümleri, süzgeci ve satırları görür', () => {
    const gor = (islemler: string[]) => {
      ac(izli(), islemler, 'iz');
      const l = [...screen.getAllByRole('button'), ...screen.getAllByRole('combobox'), ...screen.getAllByRole('row')].map((e) => e.textContent);
      cleanup(); return l;
    };
    expect(gor(OKUYAN)).toEqual(gor(PLANCI));
  });
});

describe('Geçmiş planlama ekranında', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const KAYIT = [{ anahtar: PLANLAMA_ANAHTARI, bicim: 'json' as const, deger: { ...CALISMA_DEGERI, iz: IZ }, surum: 4 }];
  it('plan çubuğunun Geçmiş düğmesiyle ve adresle açılır; Plan tahtaya döner', async () => {
    sunucuKur(YONETICI, KAYIT);
    ortakAc('/recete-rota/planlama-yeni/plan');
    const cubuk = await screen.findByRole('toolbar', { name: 'Plan çubuğu' }, { timeout: 10000 });
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Geçmiş' }));
    await waitFor(() => { expect(document.querySelector('[data-parca="gecmis"]')).not.toBeNull(); }, { timeout: 10000 });
    const ust = screen.getByRole('toolbar', { name: 'Plan çubuğu' });
    expect(within(ust).getByRole('button', { name: 'Geçmiş' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(within(ust).getByRole('button', { name: 'Plan' }));
    await waitFor(() => { expect(document.querySelector('[data-parca="gecmis"]')).toBeNull(); });
    cleanup(); vi.unstubAllGlobals();
    sunucuKur(MALIYETSIZ, KAYIT);
    ortakAc('/recete-rota/planlama-yeni/plan?ekran=gecmis&bolum=iz');
    expect(await screen.findByRole('table', { name: 'Değişiklik izi' }, { timeout: 10000 })).toBeTruthy();
  }, 30000);
});
