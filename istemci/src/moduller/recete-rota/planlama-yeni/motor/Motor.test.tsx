import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { PLANLAMA_ISLEMI } from '../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaEkranOzellikleri, type PlanlamaOlcegi, type PlanlamaSecimi } from '../gorunumler.ts';
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
  const oz: Omit<PlanlamaEkranOzellikleri, 'olcek' | 'olcekSec' | 'kaydir' | 'secim' | 'sec'> = {
    depo: DEPO, calisma: o.c === undefined ? ornekCalisma() : o.c, komut: o.komut ?? null, git, yenile: vi.fn(),
    yetki: yetkiKur([PLANLAMA_ISLEMI, ...(yaz ? ['plan.yaz'] : [])], { yazabilir: yaz }),
  };
  render(<BildirimSaglayici><Iskelet {...oz} /></BildirimSaglayici>);
  return { git };
}
// İskeletin ortak ölçek ve seçimi (PlanlamaYeni.tsx'teki gibi).
function Iskelet(oz: Omit<PlanlamaEkranOzellikleri, 'olcek' | 'olcekSec' | 'kaydir' | 'secim' | 'sec'>) {
  const [olcek, setOlcek] = useState<PlanlamaOlcegi>(ACILIS_OLCEGI);
  const [secim, setSecim] = useState<PlanlamaSecimi>(BOS_SECIM);
  return (
    <PlanlamaMotoru {...oz} olcek={olcek} olcekSec={(x) => setOlcek({ olcek: x, kayma: 0 })} kaydir={(n) => setOlcek((x) => ({ ...x, kayma: n === 0 ? 0 : x.kayma + n }))}
      secim={secim} sec={(x) => setSecim((y) => ({ ...y, ...x }))} />
  );
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

  it('Başka menüsü açılır; kartlar sonraki teslimde, sayfalar yeni ekranda yok; gecikme kaynağı ve kısayollar açılır', () => {
    ac();
    fireEvent.click(screen.getByRole('button', { name: /Başka/ }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByRole('menuitem', { name: /Bugünün kararları/ }).getAttribute('title')).toContain(YOK_NOTU);
    expect(within(menu).getByRole('menuitem', { name: /Siparişler/ }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(within(menu).getByRole('menuitemcheckbox', { name: /Gecikme kaynağı/ }));
    expect(screen.queryByRole('menu')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Başka/ }));
    expect(screen.getByRole('menuitemcheckbox', { name: /Gecikme kaynağı/ }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('menuitem', { name: /Klavye kısayolları/ }));
    expect(screen.getByRole('dialog', { name: 'Klavye kısayolları' }).textContent).toContain('Seçilene göre Düzenle menüsü');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Klavye kısayolları' })).toBeNull();
  });

  it('Harita görünümü: tuval, okuma, yakınlık, oynatıcı ve zaman şeridi; şerit siparişi seçer, H ve G görünüm değiştirir', () => {
    ac();
    fireEvent.keyDown(window, { key: 'h' });
    const h = screen.getByRole('region', { name: 'Tezgâh haritası' });
    expect(within(h).getByRole('img', { name: /Atölye haritası/ })).toBeTruthy();
    expect(within(h).getByRole('toolbar', { name: 'Görünüm' })).toBeTruthy();
    fireEvent.click(within(h).getByRole('button', { name: /Haritayı okuma/ }));
    expect(within(h).getByRole('list', { name: 'Haritanın açıklaması' })).toBeTruthy();
    expect(within(h).getByRole('group', { name: 'Yakınlık' })).toBeTruthy();
    expect(within(h).getByRole('button', { name: 'Oynat' })).toBeTruthy();
    expect(within(h).getByRole('button', { name: /4 sa\/sn/ })).toBeTruthy();
    fireEvent.click(within(h).getByRole('button', { name: /4 sa\/sn/ }));
    expect(within(h).getByRole('button', { name: /1 gün\/sn/ })).toBeTruthy();
    expect((within(h).getByRole('slider', { name: 'Zaman imleci' }) as HTMLInputElement).max).toBe('168');
    const bit = within(h).getByRole('button', { name: '3' });
    expect(bit.getAttribute('title')).toBe('3 bitiş 24.10 Cmt 11:38 · termine yetişiyor');
    fireEvent.click(bit);
    expect(bit.hasAttribute('data-secili')).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(bit.hasAttribute('data-secili')).toBe(false);
    fireEvent.keyDown(window, { key: 'g' });
    expect(screen.getByRole('region', { name: 'Plan nasıl gidiyor?' })).toBeTruthy();
  });

  it('kılavuz Başka menüsünden Özet içinde açılır, görünüm değişmez; Anladım kapatır', () => {
    ac();
    fireEvent.click(screen.getByRole('button', { name: /Başka/ }));
    fireEvent.click(screen.getByRole('menuitemcheckbox', { name: /Nasıl okunur/ }));
    expect(screen.getByRole('region', { name: 'Plan nasıl gidiyor?' })).toBeTruthy();
    const k = screen.getByRole('complementary', { name: 'Kılavuz' });
    expect(k.textContent).toContain('Örnek: 1.');
    expect(within(k).getAllByRole('listitem')).toHaveLength(6);
    fireEvent.click(within(k).getByRole('button', { name: 'Anladım' }));
    expect(screen.queryByRole('complementary', { name: 'Kılavuz' })).toBeNull();
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

  it('Çizelge: araç satırında Başka yok; hafta ızgarası, iş seçimi, gün başlığından saatlik gün; motor ve kilit düğmeleri pasif', () => {
    ac();
    fireEvent.click(screen.getByRole('button', { name: 'Çizelge' }));
    const arac = screen.getByRole('toolbar', { name: 'Plan araçları' });
    expect(within(arac).queryByRole('button', { name: /Başka/ })).toBeNull();
    expect(within(arac).getByRole('tab', { name: 'Tezgâhlar' }).getAttribute('aria-selected')).toBe('true');
    const ol = screen.getByRole('region', { name: 'Çizelge, hafta' });
    expect(within(ol).getAllByRole('button').map((b) => b.textContent).filter((x) => x === 'fason 5')).toHaveLength(1);
    const is = within(ol).getByRole('button', { name: '3.10' });
    fireEvent.click(is);
    expect(is.hasAttribute('data-secili')).toBe(true);
    fireEvent.click(within(ol).getByRole('button', { name: '24.10 Cmt' }));
    const gun = screen.getByRole('region', { name: 'Gün katmanı: 24.10 Cmt' });
    expect(within(gun).getByRole('heading', { name: /3\.10/ })).toBeTruthy();
    expect(within(gun).getByRole('button', { name: /Burada sabitle/ }).getAttribute('aria-disabled')).toBe('true');
    expect(within(gun).getByRole('button', { name: /Çoklu seç/ }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(within(gun).getByRole('button', { name: 'Önceki gün' }));
    expect(screen.getByRole('region', { name: 'Gün katmanı: 23.10 Cum' })).toBeTruthy();
  });

  it('Çizelge araması tezgâhı ya da siparişi seçer, bulamazsa söyler; tam ekran Esc ile kapanır', () => {
    ac();
    fireEvent.click(screen.getByRole('button', { name: 'Çizelge' }));
    const ara = screen.getByRole('combobox', { name: 'Sipariş ya da tezgâh bul' });
    fireEvent.change(ara, { target: { value: 'yok-boyle' } });
    fireEvent.keyDown(ara, { key: 'Enter' });
    expect(screen.getByText(/YOK-BOYLE bulunamadı/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tam ekran' }));
    expect(screen.getByRole('region', { name: 'Çizelge' }).hasAttribute('data-tam')).toBe(true);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByRole('region', { name: 'Çizelge' }).hasAttribute('data-tam')).toBe(false);
  });

  it('Stüdyo atölyeye gider; Keşfet hazırlanıyor', () => {
    const { git } = ac();
    fireEvent.click(screen.getAllByRole('button', { name: 'Stüdyo' })[0]!);
    expect(git).toHaveBeenCalledWith('studio');
    fireEvent.click(screen.getByRole('button', { name: 'Keşfet' }));
    expect(screen.getByText(/Keşfet: Hazırlanıyor/)).toBeTruthy();
  });
});
