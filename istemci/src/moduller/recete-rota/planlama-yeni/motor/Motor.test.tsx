import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { PLANLAMA_ISLEMI } from '../../planlama-menusu.ts';
import type { PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import type { PlanlamaDeposu } from '../veri.ts';
import { yetkiKur } from '../yetki.ts';
import { PlanlamaMotoru } from './index.tsx';
import { MOTOR_NOTU, YOK_NOTU } from './ortak.tsx';
import { ornekCalisma } from './ornek.ts';

afterEach(cleanup);

// İş emri durumu okunamamış depo: biten iş kayıtlı plandan çıkar.
const DEPO = { durum: null } as unknown as PlanlamaDeposu;
function ac(o: { c?: PlanlamaCalismasi | null; yaz?: boolean; komut?: CalismaKomutu | null } = {}) {
  const yaz = o.yaz ?? true;
  const git = vi.fn();
  const oz: PlanlamaEkranOzellikleri = {
    depo: DEPO, calisma: o.c === undefined ? ornekCalisma() : o.c, komut: o.komut ?? null, git, yenile: vi.fn(),
    yetki: yetkiKur([PLANLAMA_ISLEMI, ...(yaz ? ['plan.yaz'] : [])], { yazabilir: yaz }),
  };
  render(<PlanlamaMotoru {...oz} />);
  return { git };
}
const komutKur = (c: PlanlamaCalismasi) => {
  const yazilan: PlanlamaCalismasi[] = [];
  const komut: CalismaKomutu = { degistir: vi.fn((_ne, fn) => { const t = structuredClone(c); fn(t); yazilan.push(t); return true; }) } as unknown as CalismaKomutu;
  return { komut, yazilan };
};

describe('PlanlamaMotoru', () => {
  it('çalışma yoksa söyler', () => {
    ac({ c: null });
    expect(screen.getByText('Planlama çalışması yok.')).toBeTruthy();
  });

  it('çalışma var, plan yoksa eski kart: kaydın sayıları, üç adım; Planı kur ve Veri ve kısıtlar pasif; görünüm çubuğu yok', () => {
    ac({ c: { ...ornekCalisma(), plan: null } as PlanlamaCalismasi });
    expect(screen.getByText('Plan henüz kurulmadı')).toBeTruthy();
    expect(document.querySelector('.tc-pym-bos-genis > span')?.textContent).toBe('5 tezgâh, 3 sipariş, 8 işlem, 17 personel.');
    expect(screen.getAllByRole('listitem').map((x) => x.querySelector('b + span b')?.textContent ?? x.querySelector('span > b')?.textContent)).toEqual(['Planı kur', 'Sorunlara bak', 'Karar ver']);
    for (const b of screen.getAllByRole('button', { name: 'Planı kur' })) expect(b.getAttribute('aria-disabled')).toBe('true');
    expect(screen.getByRole('button', { name: 'Veri ve kısıtlar' }).getAttribute('title')).toBe(`Veri ve kısıtlar: ${YOK_NOTU}`);
    expect(screen.queryByRole('toolbar', { name: 'Görünüm' })).toBeNull();
  });

  it('Özet altı bölümü, haritayı ve nabzı eski sayfanın metinleriyle gösterir', () => {
    ac();
    for (const ad of ['Plan nasıl gidiyor?', 'Siparişler nerede bekliyor?', 'Hangi gün hangi tezgâh dolu?', 'Süre nereye gidiyor?', 'Siparişler zamanında bitiyor mu?', 'Ne yapmalıyım?']) {
      expect(screen.getByRole('region', { name: ad })).toBeTruthy();
    }
    expect(screen.getByRole('region', { name: 'Tezgâh haritası' })).toBeTruthy();
    const ozet = screen.getByRole('region', { name: 'Plan nasıl gidiyor?' });
    expect(ozet.textContent).toContain('Son işin bitişi: 27.10 Sal 17:55.');
    expect(within(screen.getByRole('group', { name: /^Plan nabzı/ })).getByRole('button', { name: /geciken · bu hafta/ })).toBeTruthy();
    // Motor isteyen düğme yerinde ve pasif (357 b).
    const iyi = screen.getByRole('button', { name: 'Planı iyileştir' });
    expect(iyi.getAttribute('aria-disabled')).toBe('true');
    expect(iyi.getAttribute('title')).toContain(MOTOR_NOTU);
  });

  it('nasıl okunur açılır, sipariş seçilince yolculuğu ve vurgu gelir', () => {
    ac();
    const bekle = screen.getByRole('region', { name: 'Siparişler nerede bekliyor?' });
    fireEvent.click(within(bekle).getByRole('button', { name: 'Nasıl okunur' }));
    expect(bekle.textContent).toContain('Her satır bir istasyon grubu');
    const yaris = screen.getByRole('region', { name: 'Siparişler zamanında bitiyor mu?' });
    fireEvent.click(within(yaris).getByRole('button', { name: '3' }));
    expect(bekle.textContent).toContain('ORNEK Burç · 2 adım');
    expect(bekle.closest('.tc-pym-oz')?.hasAttribute('data-vurgu')).toBe(true);
    fireEvent.click(within(yaris).getByRole('button', { name: '3' }));
    expect(bekle.closest('.tc-pym-oz')?.hasAttribute('data-vurgu')).toBe(false);
  });

  it('dönem değişince nabız ve Özet o dönemi ölçer', () => {
    ac();
    fireEvent.click(screen.getByRole('button', { name: 'Gün' }));
    expect(screen.getByRole('group', { name: /^Plan nabzı, 19\.10 Pzt$/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sonraki gün' }));
    expect(screen.getByRole('group', { name: /^Plan nabzı, 20\.10 Sal$/ })).toBeTruthy();
  });

  it('Başka menüsü açılır; kartlar sonraki teslimde, sayfalar yeni ekranda yok', () => {
    ac();
    fireEvent.click(screen.getByRole('button', { name: /Başka/ }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Bugünün kararları/ }).getAttribute('title')).toContain(YOK_NOTU);
    expect(within(menu).getAllByRole('menuitem').every((x) => x.getAttribute('aria-disabled') === 'true')).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('Yapılacaklar: kararlar ve eylemleri; çalışmaya yalnız degistir ile yazar', () => {
    const c = ornekCalisma(); c.kapali = ['tatil'];
    const { komut, yazilan } = komutKur(c);
    ac({ c, komut });
    fireEvent.click(screen.getByRole('button', { name: /Yapılacaklar/ }));
    const yp = screen.getByRole('dialog', { name: 'Yapılacaklar' });
    expect(within(yp).getByRole('button', { name: 'Planı iyileştir' }).getAttribute('title')).toContain(MOTOR_NOTU);
    expect(within(yp).getAllByRole('button', { name: 'Veri denetimi' })[0]?.getAttribute('title')).toContain(YOK_NOTU);
    fireEvent.click(within(yp).getByRole('button', { name: 'Hepsini aç' }));
    expect(komut.degistir).toHaveBeenCalledWith('Bütün kısıtlar açıldı', expect.any(Function), { ayrinti: '' });
    expect(yazilan[0]?.kapali).toEqual([]);
    expect(screen.queryByRole('dialog', { name: 'Yapılacaklar' })).toBeNull();
  });

  it('plan yazma yetkisi yoksa Yapılacaklar ve eylem düğmeleri yok, nabız referansı değiştirilemez', () => {
    ac({ yaz: false });
    expect(screen.queryByRole('button', { name: /Yapılacaklar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Planı iyileştir' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /geciken · bu hafta/ }));
    expect((screen.getByRole('combobox', { name: 'Referans' }) as HTMLSelectElement).disabled).toBe(true);
  });

  it('Stüdyo atölyeye gider; Harita, Çizelge ve Keşfet hazırlanıyor', () => {
    const { git } = ac();
    fireEvent.click(screen.getAllByRole('button', { name: 'Stüdyo' })[0]!);
    expect(git).toHaveBeenCalledWith('studio');
    fireEvent.click(screen.getByRole('button', { name: 'Keşfet' }));
    expect(screen.getByText(/Keşfet: Hazırlanıyor/)).toBeTruthy();
  });
});
