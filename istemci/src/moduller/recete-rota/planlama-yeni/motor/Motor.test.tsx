import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
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

  it('Siparişler merceği: tezgâh grupları katlanır, işe basmak seçer ve öteki siparişleri soldurur; kaynak yükü ve geri alma pasif', () => {
    ac();
    fireEvent.click(screen.getByRole('button', { name: 'Çizelge' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Siparişler' }));
    const g = screen.getByRole('region', { name: 'Plan çizelgesi' });
    expect((screen.getByRole('checkbox', { name: 'Kaynak yükü' }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByRole('button', { name: /Planı geri al/ }).getAttribute('aria-disabled')).toBe('true');
    const is = within(g).getByRole('button', { name: /^3\.10 · / });
    fireEvent.click(is);
    expect(is.hasAttribute('data-secili')).toBe(true);
    expect(within(g).getByRole('button', { name: /^2\.30 · / }).hasAttribute('data-soluk')).toBe(true);
    const grup = within(g).getByRole('button', { name: /^1 1 tezgâh/ });
    fireEvent.click(grup);
    expect(grup.getAttribute('aria-expanded')).toBe('false');
    expect(within(g).queryByRole('button', { name: /^3\.10 · / })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Grupları katla ya da aç' }));
    expect(within(g).getByRole('button', { name: /^3\.10 · / })).toBeTruthy();
  });

  it('Çizelge panelleri: yardımcı, karar paneli, sepet ve havuz; seçim ayrıntıya geçer, motor düğmeleri pasif, denge ve sabitler degistir ile', () => {
    const c = ornekCalisma(); c.locks = { 'x.1': { m: 'T', S: 1 } }; c.plan = { ...c.plan, dataVer: c.plan?.dataVer ?? 0, lbC: { 2: 201.92105263157893, 3: null } };
    const { komut, yazilan } = komutKur(c);
    ac({ c, komut });
    fireEvent.click(screen.getByRole('button', { name: 'Çizelge' }));
    const arac = screen.getByRole('toolbar', { name: 'Plan araçları' });
    fireEvent.click(within(arac).getByRole('button', { name: 'Yardımcı' }));
    const yrd = screen.getByRole('complementary', { name: 'Plan yardımcısı' });
    expect(within(yrd).getByText(/siparişten 1 tanesi geç bitiyor\./)).toBeTruthy();
    expect(within(yrd).getByRole('button', { name: /Acil sipariş ekle/ }).getAttribute('title')).toContain(MOTOR_NOTU);
    fireEvent.click(within(yrd).getByRole('button', { name: 'Otomatik' }));
    expect(komut.degistir).toHaveBeenCalledWith('Denge: Otomatik', expect.any(Function), { planKoru: true });
    expect(yazilan.at(-1)?.w.denge).toBe('otomatik');
    expect(within(yrd).getByText('1 sabit · 0 gün dondu · sepette 0')).toBeTruthy();
    fireEvent.click(within(yrd).getByRole('button', { name: 'Sabitleri kaldır' }));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Sabitleri kaldır' })).getByRole('button', { name: 'Onayla' }));
    expect(yazilan.at(-1)?.locks).toEqual({});
    fireEvent.click(within(yrd).getByRole('tab', { name: 'Ayrıntı' }));
    const kp = screen.getByRole('region', { name: 'Karar paneli' });
    expect(within(kp).getByText(/72,9 sa gecikiyor/)).toBeTruthy();
    expect(within(kp).getByText('Fason · 5', { selector: 'b' })).toBeTruthy();
    expect(within(kp).getByRole('button', { name: 'Öne almayı dene' }).getAttribute('aria-disabled')).toBe('true');
    expect(within(kp).getByRole('heading', { name: 'Gecikmenin kaynağı' })).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Yardımcı' }));
    fireEvent.click(screen.getByRole('button', { name: /^2 siparişine bak/ }));
    const ayr = screen.getByRole('complementary', { name: 'Ayrıntı' });
    expect(within(ayr).getByRole('tab', { name: 'Ayrıntı' }).getAttribute('aria-selected')).toBe('true');
    const sp = within(ayr).getByRole('region', { name: 'Sipariş 2' });
    expect(within(sp).getByText('Planlanan bitiş')).toBeTruthy();
    expect(within(sp).getByText(/72,9 sa gecikme/)).toBeTruthy();
    expect(within(sp).getByText('Kapasitesiz en erken').nextElementSibling?.textContent).toMatch(/^\d\d\.\d\d \S+ \d\d:\d\d \(plan 8 sa sonra\)$/);
    expect(within(sp).getByRole('button', { name: 'Düzenle' }).getAttribute('title')).toContain(YOK_NOTU);
    expect(within(sp).getByRole('heading', { name: 'Süre nereye gitti' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Siparişler' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(within(arac).getByRole('button', { name: 'Havuz' }));
    const hv = screen.getByRole('complementary', { name: 'Havuz' });
    expect(within(hv).getByText(/Havuz boş/)).toBeTruthy();
    expect(within(hv).getByRole('button', { name: 'Planı boşalt' }).getAttribute('title')).toContain(MOTOR_NOTU);
    fireEvent.click(within(hv).getByRole('tab', { name: 'Sepet' }));
    expect(within(screen.getByRole('complementary', { name: 'Sepet' })).getByText('Başlangıç')).toBeTruthy();
  });

  it('Ayrıntı: işin dökümü, neden, kilit degistir ile; kuyruk ve adımlar işi seçer; tezgâh paneli; motor düğmeleri pasif', () => {
    const c = ornekCalisma();
    const { komut, yazilan } = komutKur(c);
    ac({ c, komut });
    fireEvent.click(screen.getByRole('button', { name: 'Çizelge' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Siparişler' }));
    fireEvent.click(screen.getByRole('button', { name: /^3\.10 · / }));
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Plan araçları' })).getByRole('button', { name: 'Ayrıntı' }));
    const op = screen.getByRole('region', { name: '3 adım 10' });
    expect(within(op).getByText('Siparişin serbest bırakılma anını bekledi.', { exact: false })).toBeTruthy();
    expect(within(op).getByText('5,4 sa kayabilir')).toBeTruthy();
    expect(within(op).getByText('Planda')).toBeTruthy();
    expect(within(op).getByRole('button', { name: 'Bir öne' }).getAttribute('aria-disabled')).toBe('true');
    expect(within(op).getByRole('button', { name: 'Siparişi öne al' }).getAttribute('title')).toContain(MOTOR_NOTU);
    fireEvent.click(within(op).getByRole('button', { name: 'Kilitle' }));
    expect(komut.degistir).toHaveBeenCalledWith('İş kilitlendi', expect.any(Function), expect.objectContaining({ planKoru: true }));
    expect(Object.keys(yazilan.at(-1)?.locks ?? {})).toEqual(['3.10']);
    fireEvent.click(within(op).getByRole('button', { name: /^20\s*Freze/ }));
    expect(screen.getByRole('region', { name: '3 adım 20' })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('region', { name: '3 adım 20' })).getByRole('button', { name: 'Kapat' }));
    expect(screen.getByRole('region', { name: 'Karar paneli' })).toBeTruthy();
    const ara = screen.getByRole('combobox', { name: 'Sipariş ya da tezgâh bul' });
    fireEvent.change(ara, { target: { value: '1' } });
    fireEvent.keyDown(ara, { key: 'Enter' });
    const tz = screen.getByRole('region', { name: 'Tezgâh 1' });
    expect(within(tz).getByText('1 iş')).toBeTruthy();
    expect(within(tz).getByRole('button', { name: 'Stüdyoda aç' }).getAttribute('title')).toContain(YOK_NOTU);
    expect(within(tz).getByRole('button', { name: 'Tezgâhı boşalt' }).getAttribute('title')).toContain(MOTOR_NOTU);
    fireEvent.click(within(tz).getByRole('button', { name: 'Kapat' }));
    expect(screen.getByRole('region', { name: 'Karar paneli' })).toBeTruthy();
  });

  it('Düzenle: E seçilene göre menüyü açar, sayı komutu çalıştırır, sabitlemek degistir ile; motor komutları pasif; D değişiklikler, Esc kapatır', () => {
    const c = ornekCalisma();
    const { komut, yazilan } = komutKur(c);
    ac({ c, komut });
    fireEvent.click(screen.getByRole('button', { name: 'Çizelge' }));
    expect(screen.queryByRole('button', { name: /^Düzenle\s*E$/ })).toBeNull();
    fireEvent.click(screen.getByRole('tab', { name: 'Siparişler' }));
    fireEvent.click(screen.getByRole('button', { name: /^3\.10 · / }));
    fireEvent.keyDown(window, { key: 'e' });
    const dz = screen.getByRole('dialog', { name: 'Düzenle' });
    expect(within(dz).getByText('İş adımı')).toBeTruthy();
    expect(within(dz).getByRole('button', { name: /3 siparişini öne al/ }).getAttribute('title')).toContain(MOTOR_NOTU);
    expect(within(dz).getByRole('button', { name: /sırasını düzenle/ }).getAttribute('title')).toContain(YOK_NOTU);
    fireEvent.keyDown(document, { key: 'ArrowRight' });
    expect(screen.getByText(`İşi kaydırmak: ${MOTOR_NOTU}`)).toBeTruthy();
    fireEvent.keyDown(document, { key: '6' });
    expect(komut.degistir).toHaveBeenCalledWith('İş sabitlendi', expect.any(Function), expect.objectContaining({ planKoru: true }));
    expect(yazilan.at(-1)?.locks['3.10']).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Düzenle' })).toBeNull();
    fireEvent.keyDown(window, { key: 'd' });
    expect(screen.getByRole('dialog', { name: 'Değişiklikler' })).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Değişiklikler' })).toBeNull();
    const ara = screen.getByRole('combobox', { name: 'Sipariş ya da tezgâh bul' });
    fireEvent.change(ara, { target: { value: '1' } });
    fireEvent.keyDown(ara, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: /^Düzenle\s*E$/ }));
    expect(within(screen.getByRole('dialog', { name: 'Düzenle' })).getByRole('button', { name: /1 bugün boşalt/ }).getAttribute('aria-disabled')).toBe('true');
  });

  it('plan yazma yetkisi yoksa sepet açılmaz, karar eylemleri yazmaz', () => {
    ac({ yaz: false });
    fireEvent.click(screen.getByRole('button', { name: 'Çizelge' }));
    const arac = screen.getByRole('toolbar', { name: 'Plan araçları' });
    fireEvent.click(within(arac).getByRole('button', { name: 'Sepet' }));
    expect(screen.getByText(/Bu rolde plan değiştirilemez/)).toBeTruthy();
    fireEvent.click(within(arac).getByRole('button', { name: 'Ayrıntı' }));
    const kp = screen.getByRole('region', { name: 'Karar paneli' });
    expect(within(kp).queryByRole('heading', { name: 'Ne yapabilirsiniz' })).toBeNull();
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

  it('Kuyruk ve Matris: tezgâh sütunları ve kartlar, oklar ve tezgâh seçimi pasif; matris görünüm ve gün sayısı; tezgâh adı kuyruğunu, kart işi Siparişler\'de açar', () => {
    ac();
    fireEvent.click(screen.getByRole('button', { name: 'Çizelge' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Matris' }));
    expect(screen.getByText('Kırılım:')).toBeTruthy();
    const tablo = screen.getByRole('table');
    expect(within(tablo).getAllByRole('columnheader').map((x) => x.textContent)).toEqual(['Tezgâh', '19.10', '26.10', '02.11', '09.11', '16.11', '23.11', '30.11', '07.12', '14.12', 'Toplam']);
    expect(screen.getByText(/o dönemde üretilen parça adedi/)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Personel' }));
    expect(within(screen.getByRole('table')).getByText('Kişi atanamadı')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Sipariş' }));
    expect(within(screen.getByRole('table')).getByText('ORNEK Flanş · 50 adet · 72,9 sa gecikme').closest('tr')?.hasAttribute('data-uyari')).toBe(true);
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Plan araçları' })).getByRole('button', { name: /^Gün$/ }));
    fireEvent.click(screen.getByRole('tab', { name: '14 gün' }));
    expect(within(screen.getByRole('table')).getAllByRole('columnheader')).toHaveLength(16);
    fireEvent.click(screen.getByRole('tab', { name: 'Tezgâh' }));
    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: /^4\s*Örnek Dik İşlem 2/ }));
    const k = screen.getByRole('region', { name: 'Tezgâh kuyrukları' });
    expect(within(k).getAllByRole('region').map((x) => x.getAttribute('aria-label'))).toEqual(['5 kuyruğu', '3 kuyruğu', '4 kuyruğu', '1 kuyruğu', '2 kuyruğu']);
    expect(within(k).getByRole('region', { name: '4 kuyruğu' }).hasAttribute('data-odak')).toBe(true);
    expect(within(k).getByText('Aralık dışında 1 iş daha')).toBeTruthy();
    expect(within(k).getByText('Cmt 09:59 → 11:38')).toBeTruthy();
    const ok = within(k).getAllByRole('button', { name: 'Sırada öne al' })[0]!;
    expect([ok.getAttribute('aria-disabled'), ok.getAttribute('title')]).toEqual(['true', `Sırada öne al: ${MOTOR_NOTU}`]);
    fireEvent.click(screen.getByRole('tab', { name: 'Bugün' }));
    expect(within(k).getAllByText('Bu aralıkta iş yok.')).toHaveLength(5);
    fireEvent.click(screen.getByRole('tab', { name: '1 hafta' }));
    fireEvent.click(within(within(k).getByRole('region', { name: '1 kuyruğu' })).getByRole('button', { name: 'Plan masasında gör' }));
    expect(screen.getByRole('tab', { name: 'Siparişler' }).getAttribute('aria-selected')).toBe('true');
    expect(within(screen.getByRole('region', { name: 'Plan çizelgesi' })).getByRole('button', { name: /^3\.10 · / }).hasAttribute('data-secili')).toBe(true);
  });

  it('plan yazma yetkisi yoksa kuyrukta oklar ve tezgâh seçimi yok', () => {
    ac({ yaz: false });
    fireEvent.click(screen.getByRole('button', { name: 'Çizelge' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Kuyruk' }));
    expect(screen.queryByRole('button', { name: 'Sırada öne al' })).toBeNull();
    expect(screen.getAllByRole('button', { name: 'Plan masasında gör' }).length).toBe(3);
  });

  it('Stüdyo atölyeye gider', () => {
    const { git } = ac();
    fireEvent.click(screen.getAllByRole('button', { name: 'Stüdyo' })[0]!);
    expect(git).toHaveBeenCalledWith('studio');
  });

  it('Keşfet: pay şeridi ve hatlar siparişi seçer; hazırlık verisi yok; planı anlat kendiliğinden ilerler, ok ve adım durdurur', () => {
    vi.useFakeTimers();
    try {
      ac();
      fireEvent.click(screen.getByRole('button', { name: 'Keşfet' }));
      const ks = screen.getByRole('region', { name: 'Pay şeridi' });
      expect(within(ks).getByRole('tab', { name: 'Pay şeridi' }).getAttribute('aria-selected')).toBe('true');
      expect([...ks.querySelectorAll('.tc-pym-ks-sayi')].map((x) => x.textContent)).toEqual(['1geç', '11 günden az pay', '0rahat']);
      const nokta = within(ks).getByRole('button', { name: '2: 3 gün geç' });
      fireEvent.click(nokta);
      expect(nokta.hasAttribute('data-secili')).toBe(true);
      fireEvent.click(within(ks).getByRole('tab', { name: 'Sipariş hatları' }));
      const hat = screen.getByRole('region', { name: 'Sipariş hatları' });
      expect(within(hat).getByRole('button', { name: /^2: / }).hasAttribute('data-secili')).toBe(true);
      fireEvent.keyDown(within(hat).getByRole('button', { name: /^3: / }), { key: 'Enter' });
      expect(within(hat).getByRole('button', { name: /^3: / }).hasAttribute('data-secili')).toBe(true);
      expect(within(hat).getByText('+73 sa geç')).toBeTruthy();
      fireEvent.click(within(hat).getByRole('tab', { name: 'Hazırlık' }));
      expect(within(screen.getByRole('region', { name: 'Hazırlık' })).getByText('Emir hazırlık verisi bu ekrana bağlı değil.')).toBeTruthy();
      fireEvent.click(screen.getByRole('tab', { name: 'Planı anlat' }));
      const adimlar = () => within(screen.getByRole('tablist', { name: 'Adımlar' })).getAllByRole('tab');
      expect(adimlar().map((x) => x.textContent)).toEqual(['Büyük resim', 'Ne bekletiyor', 'Süre nereye gidiyor', 'En yoğun gün', 'Doluluk', 'Ayarlar', 'Teslim', 'Hazırlık']);
      expect(screen.getByText('1 / 8')).toBeTruthy();
      act(() => { vi.advanceTimersByTime(7000); });
      expect(screen.getByText('2 / 8')).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Ne bekletiyor' })).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Durdur' })).toBeTruthy();
      fireEvent.keyDown(window, { key: 'ArrowRight' });
      expect(screen.getByText('3 / 8')).toBeTruthy();
      expect(screen.getByRole('button', { name: 'Oynat' })).toBeTruthy();
      act(() => { vi.advanceTimersByTime(14000); });
      expect(screen.getByText('3 / 8')).toBeTruthy();
      fireEvent.click(adimlar()[0]!);
      fireEvent.click(screen.getByRole('button', { name: 'Önceki (sol ok)' }));
      expect(screen.getByRole('heading', { name: 'Hazırlık' })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Özet' }));
      fireEvent.click(screen.getByRole('button', { name: 'Keşfet' }));
      expect(screen.getByText('8 / 8')).toBeTruthy();
    } finally { vi.useRealTimers(); }
  });

  it('Yan panel: seçim kartı Özet, Keşfet ve Harita\'da açılır; sipariş, iş ve tezgâh kartı; motor hamleleri pasif, sabitlemek degistir ile; gün planı Çizelge\'de', () => {
    const c = ornekCalisma(); const { komut, yazilan } = komutKur(c);
    ac({ c, komut });
    expect(screen.queryByRole('complementary', { name: 'Yan panel' })).toBeNull();
    fireEvent.click(within(screen.getByRole('region', { name: 'Siparişler zamanında bitiyor mu?' })).getByRole('button', { name: '2' }));
    const dk = () => screen.getByRole('complementary', { name: 'Yan panel' });
    expect(within(dk()).getAllByRole('tab').map((x) => x.textContent)).toEqual(['Yön ver', 'Rota']);
    expect(dk().textContent).toContain('SİPARİŞ');
    expect(dk().textContent).toContain('Bitiş 27.10 Sal 17:55 · termin 24.10 Cmt 17:00 · 3 gün geç');
    expect(dk().textContent).toContain('Emir hazırlık verisi bu ekrana bağlı değil.');
    expect(within(dk()).getByRole('button', { name: 'Öne al' }).getAttribute('aria-disabled')).toBe('true');
    expect(within(dk()).getByRole('button', { name: 'Normal' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(dk()).getAllByRole('listitem').map((x) => x.textContent)).toContain('25 (fason)Pzt 16:00 → 16:00');
    fireEvent.click(within(dk()).getByRole('tab', { name: 'Rota' }));
    expect(dk().textContent).toContain('Hazırlanıyor');
    // Özet'te "Kartı aç" paneli odaklar ve Yön ver'e döner.
    fireEvent.click(screen.getByRole('button', { name: 'Kartı aç' }));
    expect(document.activeElement).toBe(dk());
    expect(within(dk()).getByRole('tab', { name: 'Yön ver' }).getAttribute('aria-selected')).toBe('true');
    // Yolculuktaki tezgâh işi açar; iş kartında sabitlemek çalışmaya yazar.
    fireEvent.click(within(dk()).getByRole('button', { name: '3' }));
    expect(dk().textContent).toContain('İŞ ADIMI');
    expect(within(dk()).queryAllByRole('tab')).toHaveLength(0);
    expect(within(dk()).getByRole('button', { name: '+2 sa' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(within(dk()).getByRole('button', { name: 'Burada sabitle' }));
    expect(komut.degistir).toHaveBeenCalledWith('İş sabitlendi', expect.any(Function), { ayrinti: '2.20', planKoru: true });
    expect(yazilan.at(-1)?.locks['2.20']).toMatchObject({ m: '3' });
    // Keşfet'te seçim korunur; Kapat bırakır.
    fireEvent.click(screen.getByRole('button', { name: 'Keşfet' }));
    expect(dk().textContent).toContain('İŞ ADIMI');
    fireEvent.click(within(dk()).getByRole('button', { name: 'Kapat (Esc)' }));
    expect(screen.queryByRole('complementary', { name: 'Yan panel' })).toBeNull();
    // Tezgâh kartı: yedi gün, Odakla yeni ekranda yok, motor hamleleri pasif; gün planı Çizelge'nin gün ölçeğine gider.
    fireEvent.click(screen.getByRole('button', { name: 'Özet' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Hangi gün hangi tezgâh dolu?' })).getByRole('button', { name: '3' }));
    expect(within(dk()).getAllByRole('tab').map((x) => x.textContent)).toEqual(['Yön ver', 'Takvim']);
    expect(dk().textContent).toContain('TEZGÂH');
    expect(dk().querySelectorAll('.tc-pym-at-gunler button')).toHaveLength(7);
    expect(within(dk()).getByRole('button', { name: 'Odakla' }).getAttribute('title')).toBe(`Odakla: ${YOK_NOTU}`);
    expect(within(dk()).getByRole('button', { name: 'Hepsini boşalt' }).getAttribute('title')).toBe(`Hepsini boşalt: ${MOTOR_NOTU}`);
    fireEvent.click(screen.getByRole('button', { name: 'Harita' }));
    expect(dk().textContent).toContain('TEZGÂH');
    fireEvent.click(within(dk()).getByRole('button', { name: 'Gün planı' }));
    expect(screen.queryByRole('complementary', { name: 'Yan panel' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Gün' }).getAttribute('aria-pressed')).toBe('true');
  });
});
