import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { DefterSatiri } from '#paylasilan/sozlesme/planlama.ts';
import { BildirimSaglayici } from '../../../../../ortak/arayuz/index.ts';
import { api } from '../../../../../ortak/veri/api.ts';
import type { IzSatiri, PlanlamaCalismasi } from '../../tipler.ts';
import { PLANLAMA_ANAHTARI } from '../../veri.ts';
import { MALIYETSIZ, YONETICI, ac as ortakAc, sunucuKur } from '../../test-ortak.tsx';
import { CALISMA_DEGERI, calismaKur, OKUYAN, PLANCI } from '../veri/test-veri.tsx';
import { DegisiklikDefteri } from './Defter.tsx';
import { DegisiklikIzi } from './index.tsx';
import { gecmisBolumuOku, IZ_GOSTERIM, izKisileri, izSuz, type GecmisBolumu } from './kurallar.ts';

afterEach(cleanup);

const IZ: IzSatiri[] = [
  { t: Date.UTC(2026, 9, 21, 9, 30), kim: 'Deneme planci', rol: '', sayfa: 'Planlama motoru', ne: 'Sipariş önceliği değişti', ayrinti: 'S1: Yüksek' },
  { t: Date.UTC(2026, 9, 21, 9, 0), kim: 'Deneme mudur', rol: 'mudur', sayfa: 'Veri ve kısıtlar', ne: 'Kısıt kapatıldı', ayrinti: 'tatil' },
  { t: Date.UTC(2026, 9, 20, 16, 0), kim: 'Deneme planci', rol: '', sayfa: 'Planlama motoru', ne: 'Parametre değişti', ayrinti: '' },
];
const izli = (iz: IzSatiri[] = IZ) => calismaKur((c) => { (c as unknown as Record<string, unknown>).iz = structuredClone(iz); });

describe('Geçmiş hesapları', () => {
  it('bölümler defter ve izdir; Senaryolar bölümü yoktur (3308-2 a)', () => {
    expect((['defter', 'iz', 'senaryolar'] as const).map((b) => gecmisBolumuOku(b))).toEqual(['defter', 'iz', null]);
  });

  it('kişiler ilk görünme sırasıyla; süzgeç kişiye göre, en çok 200 satır', () => {
    expect(izKisileri(IZ)).toEqual(['Deneme planci', 'Deneme mudur']);
    expect(izSuz(IZ, 'Deneme planci').map((x) => x.ne)).toEqual(['Sipariş önceliği değişti', 'Parametre değişti']);
    expect(izSuz(IZ, null)).toHaveLength(3);
    const cok = Array.from({ length: 250 }, (_, i) => ({ ...IZ[0] as IzSatiri, t: i }));
    expect(izSuz(cok, null)).toHaveLength(IZ_GOSTERIM);
  });
});

function ac(c: PlanlamaCalismasi | null, _islemler: string[] = PLANCI, bolum: GecmisBolumu = 'iz') {
  render(<BildirimSaglayici>{bolum === 'defter' ? <DegisiklikDefteri siparisler={c?.D.siparisler} /> : c ? <DegisiklikIzi c={c} /> : null}</BildirimSaglayici>);
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

  it('boş izde kayıt yok yazar', () => {
    ac(izli([]), PLANCI, 'iz');
    expect(screen.getByText('Kayıt yok.')).toBeTruthy();
  });

  it('2129-2 b Değişiklik defteri: sunucudan en yeni önde okunur; olay, kişi ve ret gerekçesi görünür; daha eskisi sayfa sayfa gelir', async () => {
    const satir = (id: number, olay: DefterSatiri['olay'], gerekce: string | null = null): DefterSatiri =>
      ({ id, olay, bekleyenId: `b${String(id)}`, ne: `Değişiklik ${String(id)}`, ayrinti: '', isler: ['S1'], gerekce, kisi: 'Deneme planci', zaman: '2026-11-05T08:00:00.000Z' });
    const get = vi.spyOn(api, 'get').mockImplementation(((yol: string) => Promise.resolve(yol.endsWith('?once=8')
      ? { satirlar: [satir(7, 'degisiklik')], dahaVar: false }
      : { satirlar: [satir(9, 'reddedildi', 'Termin değişmedi'), satir(8, 'uygulandi')], dahaVar: true })) as never);
    ac(izli(), OKUYAN, 'defter');
    const tablo = await screen.findByRole('table', { name: 'Değişiklik defteri' });
    const satirlar = () => within(tablo).getAllByRole('row').slice(1);
    expect(satirlar()[0]?.textContent).toContain('Reddedildi');
    expect(satirlar()[0]?.textContent).toContain('Termin değişmedi');
    expect(satirlar()[0]?.textContent).toContain('Deneme planci');
    expect(satirlar()[1]?.textContent).toContain('Uygulandı');
    fireEvent.click(screen.getByRole('button', { name: 'Daha eski kayıtlar' }));
    await waitFor(() => { expect(satirlar()).toHaveLength(3); });
    expect(get).toHaveBeenLastCalledWith('/plan/degisiklik-defteri?once=8');
    expect(screen.queryByRole('button', { name: 'Daha eski kayıtlar' })).toBeNull();
    get.mockRestore();
  });

  it('3233: defterde Etkilenen emrin kimliğini değil adını yazar; çalışmada olmayan emirde kimlik kalır, bütün işler yazısı değişmez', async () => {
    const satir = (id: number, isler: string[]): DefterSatiri =>
      ({ id, olay: 'uygulandi', bekleyenId: `b${String(id)}`, ne: `Değişiklik ${String(id)}`, ayrinti: '', isler, gerekce: null, kisi: 'Deneme planci', zaman: '2026-11-05T08:00:00.000Z' });
    const get = vi.spyOn(api, 'get').mockResolvedValue({ satirlar: [satir(3, ['S1', 'YOK-9']), satir(2, ['*']), satir(1, [])], dahaVar: false } as never);
    const c = calismaKur((x) => { const s = x.D.siparisler.find((y) => y.id === 'S1'); if (s) Object.assign(s, { ad: 'ORN-EMIR-1' }); });
    ac(c, OKUYAN, 'defter');
    const tablo = await screen.findByRole('table', { name: 'Değişiklik defteri' });
    const etkilenen = within(tablo).getAllByRole('row').slice(1).map((r) => r.children[4]?.textContent);
    expect(etkilenen).toEqual(['ORN-EMIR-1, YOK-9', 'Bütün işler', '—']);
    get.mockRestore();
  });

  it('her rolde aynı görünüm: okuyan da yazan da aynı süzgeci ve satırları görür', () => {
    const gor = (islemler: string[]) => {
      ac(izli(), islemler, 'iz');
      const l = [...screen.getAllByRole('combobox'), ...screen.getAllByRole('row')].map((e) => e.textContent);
      cleanup(); return l;
    };
    expect(gor(OKUYAN)).toEqual(gor(PLANCI));
  });
});

describe('Geçmiş Veri sayfasında (3308-2 a)', () => {
  afterEach(() => { vi.unstubAllGlobals(); });
  const KAYIT = [{ anahtar: PLANLAMA_ANAHTARI, bicim: 'json' as const, deger: { ...CALISMA_DEGERI, iz: IZ }, surum: 4 }];
  const adres = () => screen.getByTestId('adres').textContent;

  it('Veri sayfasının bölüm şeridinden açılır; bölüm adrestedir', async () => {
    sunucuKur(YONETICI, KAYIT);
    ortakAc('/plan/veri');
    const menu = await screen.findByRole('navigation', { name: 'Veri ve kısıtlar' }, { timeout: 10000 });
    fireEvent.click(within(menu).getByRole('button', { name: 'Değişiklik izi' }));
    expect(await screen.findByRole('table', { name: 'Değişiklik izi' }, { timeout: 10000 })).toBeTruthy();
    expect(within(menu).getByRole('button', { name: 'Değişiklik izi' }).getAttribute('aria-current')).toBe('page');
    expect(within(menu).queryByRole('button', { name: 'Senaryolar' })).toBeNull();
  }, 30000);

  it('eski Geçmiş adresi Veri sayfasındaki bölüme yönlenir; okuyan da görür', async () => {
    sunucuKur(MALIYETSIZ, KAYIT);
    ortakAc('/plan?ekran=gecmis&bolum=iz');
    expect(await screen.findByRole('table', { name: 'Değişiklik izi' }, { timeout: 10000 })).toBeTruthy();
    expect(adres()).toBe('/plan/veri');
  }, 30000);
});
