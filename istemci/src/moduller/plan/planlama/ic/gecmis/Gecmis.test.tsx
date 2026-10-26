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
import { eskiTabanli, gostergeFarki, karsilastirmaSec, senaryoSirasi, tarihiDegisenler, yukuDegisenler, IZ_GOSTERIM, izKisileri, izSuz } from './kurallar.ts';
import { SENARYOLAR } from './test-senaryo.ts';

afterEach(cleanup);

const IZ: IzSatiri[] = [
  { t: Date.UTC(2026, 9, 21, 9, 30), kim: 'Deneme planci', rol: '', sayfa: 'Planlama motoru', ne: 'Sipariş önceliği değişti', ayrinti: 'S1: Yüksek' },
  { t: Date.UTC(2026, 9, 21, 9, 0), kim: 'Deneme mudur', rol: 'mudur', sayfa: 'Veri ve kısıtlar', ne: 'Kısıt kapatıldı', ayrinti: 'tatil' },
  { t: Date.UTC(2026, 9, 20, 16, 0), kim: 'Deneme planci', rol: '', sayfa: 'Planlama motoru', ne: 'Parametre değişti', ayrinti: '' },
];
const izli = (iz: IzSatiri[] = IZ) => calismaKur((c) => { (c as unknown as Record<string, unknown>).iz = structuredClone(iz); });

describe('Geçmiş hesapları', () => {
  it('senaryolar onayda, taslak, canlıya alınan, vazgeçilen sırasıyla; eski tabanlı taslak; seçim en çok üç; fark yönü', () => {
    expect(senaryoSirasi(SENARYOLAR.senaryolar).map((x) => x.id)).toEqual([12, 11, 13]);
    expect(SENARYOLAR.senaryolar.map((x) => eskiTabanli(x, 5))).toEqual([false, true, false]);
    expect(karsilastirmaSec(karsilastirmaSec([1, 2, 3], 4), 2)).toEqual([1, 3]);
    expect(gostergeFarki(40, 22, true)).toEqual({ d: -18, iyi: true });
    expect(gostergeFarki(70, 60, false)).toEqual({ d: -10, iyi: false });
    expect(gostergeFarki(null, 3, true)).toBeNull();
    expect(gostergeFarki(3, 3, true)).toBeNull();
    const l = SENARYOLAR.senaryolar.slice(0, 2);
    expect(tarihiDegisenler(l).map((x) => [x.emirNo, x.senaryo])).toEqual([['E-1', ['2026-10-22T06:00:00.000Z', undefined]], ['E-2', [undefined, null]]]);
    expect(yukuDegisenler(l)).toEqual([{ ad: 'Torna', canli: 92, senaryo: [80, undefined] }]);
  });

  it('kişiler ilk görünme sırasıyla; süzgeç kişiye göre, en çok 200 satır', () => {
    expect(izKisileri(IZ)).toEqual(['Deneme planci', 'Deneme mudur']);
    expect(izSuz(IZ, 'Deneme planci').map((x) => x.ne)).toEqual(['Sipariş önceliği değişti', 'Parametre değişti']);
    expect(izSuz(IZ, null)).toHaveLength(3);
    const cok = Array.from({ length: 250 }, (_, i) => ({ ...IZ[0] as IzSatiri, t: i }));
    expect(izSuz(cok, null)).toHaveLength(IZ_GOSTERIM);
  });
});

function ac(c: PlanlamaCalismasi | null, islemler = PLANCI, bolum?: GecmisBolumu, senaryolar: unknown = null) {
  const bolumSec = vi.fn<(b: GecmisBolumu) => void>(); const git = vi.fn();
  const o: PlanlamaEkranOzellikleri = {
    depo: { durum: null, senaryolar } as unknown as PlanlamaDeposu, calisma: c, komut: null, yetki: yetkiKur(islemler, { yazabilir: true }), git, yenile: () => undefined,
    olcek: ACILIS_OLCEGI, olcekSec: () => undefined, kaydir: () => undefined, secim: BOS_SECIM, sec: vi.fn(),
  };
  render(<BildirimSaglayici><GecmisEkrani {...o} bolum={bolum} bolumSec={bolum ? bolumSec : undefined} /></BildirimSaglayici>);
  return { bolumSec, git };
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
    ac(null, PLANCI, 'iz');
    expect(screen.getByText('Planlama çalışması yok')).toBeTruthy();
    cleanup();
    ac(null);
    expect(screen.getByText(/Senaryolar okunamadı/)).toBeTruthy();
  });

  it('Senaryolar: taslaklar listelenir, seçilenler canlıyla yan yana karşılaştırılır; atölye düğmesi Planlama atölyesine gider', () => {
    const { git } = ac(null, PLANCI, 'senaryolar', SENARYOLAR);
    const tablo = screen.getByRole('table', { name: 'Senaryolar' });
    const satir = within(tablo).getAllByRole('row').slice(1);
    expect(satir.map((r) => r.querySelector('b')?.textContent)).toEqual(['Ek mesaisiz', 'Bakım ileri', 'Eski deneme']);
    expect(satir[0]?.textContent).toContain('Onayda');
    expect(satir[0]?.textContent).toContain('Canlı değişti');
    expect(satir[1]?.textContent).toContain('Taslak');
    expect(satir[2]?.textContent).toContain('Vazgeçildi');
    expect(screen.queryByRole('table', { name: 'Göstergeler' })).toBeNull();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Bakım ileri karşılaştır' }));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Ek mesaisiz karşılaştır' }));
    const g = screen.getByRole('table', { name: 'Göstergeler' });
    expect(within(g).getAllByRole('columnheader').map((x) => x.textContent)).toEqual(['Gösterge', 'Canlı s.5', 'Bakım ileri', 'Ek mesaisiz']);
    const gec = within(g).getAllByRole('row').find((r) => r.textContent?.startsWith('Geciken emir'));
    expect(gec?.querySelector('[data-ton="iyi"]')?.textContent).toBe(' −2');
    expect(gec?.querySelector('[data-ton="kotu"]')?.textContent).toBe(' +2');
    expect(within(screen.getByRole('table', { name: 'Bitişi değişen emirler' })).getAllByRole('row').map((r) => r.firstElementChild?.textContent)).toEqual(['Emir', 'E-1', 'E-2']);
    expect(screen.getByRole('table', { name: 'Yükü değişen istasyonlar' }).textContent).toContain('%80');
    expect(screen.getByRole('list', { name: 'Uyarılar' }).textContent).toContain('Canlıya alınamaz: Ek mesai kaldırma');
    fireEvent.click(screen.getByRole('button', { name: 'Planlama atölyesi' }));
    expect(git).toHaveBeenCalledWith('studio');
    cleanup();
    ac(null, PLANCI, 'senaryolar', { ...SENARYOLAR, senaryolar: [] });
    expect(screen.getByText(/^Taslak yok\./)).toBeTruthy();
  });

  it('her rolde aynı görünüm: okuyan da yazan da aynı bölümleri, süzgeci ve satırları görür', () => {
    const gor = (islemler: string[]) => {
      ac(izli(), islemler, 'iz');
      const l = [...screen.getAllByRole('button'), ...screen.getAllByRole('combobox'), ...screen.getAllByRole('row')].map((e) => e.textContent);
      cleanup(); return l;
    };
    expect(gor(OKUYAN)).toEqual(gor(PLANCI));
    const senaryo = (islemler: string[]) => {
      ac(null, islemler, 'senaryolar', SENARYOLAR);
      fireEvent.click(screen.getByRole('checkbox', { name: 'Bakım ileri karşılaştır' }));
      const l = [...screen.getAllByRole('button'), ...screen.getAllByRole('checkbox'), ...screen.getAllByRole('row')].map((e) => `${e.textContent ?? ''}${e.getAttribute('aria-disabled') ?? ''}`);
      cleanup(); return l;
    };
    expect(senaryo(OKUYAN)).toEqual(senaryo(PLANCI));
  });
});

describe('Geçmiş planlama ekranında', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const KAYIT = [{ anahtar: PLANLAMA_ANAHTARI, bicim: 'json' as const, deger: { ...CALISMA_DEGERI, iz: IZ }, surum: 4 }];
  it('plan çubuğunun Geçmiş düğmesiyle ve adresle açılır; Plan tahtaya döner', async () => {
    sunucuKur(YONETICI, KAYIT);
    ortakAc('/plan');
    const cubuk = await screen.findByRole('toolbar', { name: 'Plan çubuğu' }, { timeout: 10000 });
    fireEvent.click(within(cubuk).getByRole('button', { name: 'Geçmiş' }));
    await waitFor(() => { expect(document.querySelector('[data-parca="gecmis"]')).not.toBeNull(); }, { timeout: 10000 });
    const ust = screen.getByRole('toolbar', { name: 'Plan çubuğu' });
    expect(within(ust).getByRole('button', { name: 'Geçmiş' }).getAttribute('aria-current')).toBe('page');
    fireEvent.click(within(ust).getByRole('button', { name: 'Plan' }));
    await waitFor(() => { expect(document.querySelector('[data-parca="gecmis"]')).toBeNull(); });
    cleanup(); vi.unstubAllGlobals();
    sunucuKur(MALIYETSIZ, KAYIT);
    ortakAc('/plan?ekran=gecmis&bolum=iz');
    expect(await screen.findByRole('table', { name: 'Değişiklik izi' }, { timeout: 10000 })).toBeTruthy();
  }, 30000);
});
