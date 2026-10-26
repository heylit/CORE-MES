import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useState } from 'react';
import type { SenaryolarCevabi } from '#paylasilan/sozlesme/plan.ts';
import { BildirimSaglayici } from '../../../../../ortak/arayuz/index.ts';
import { api } from '../../../../../ortak/veri/api.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaEkranOzellikleri } from '../../gorunumler.ts';
import type { CalismaKomutu, DegisiklikSecenegi } from '../../kayit.ts';
import { derle, girdiKur, planOku } from '../../motor/kurallar.ts';
import { MOTOR_NOTU } from '../../motor/ortak.tsx';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import type { PlanlamaDeposu } from '../../veri.ts';
import { yetkiKur } from '../../yetki.ts';
import { MALIYETSIZ, YONETICI, ac as sayfaAc, sunucuKur } from '../../test-ortak.tsx';
import { PLANLAMA_ANAHTARI } from '../../veri.ts';
import { CALISMA_DEGERI, calismaKur, OKUYAN, PLANCI } from '../veri/test-veri.tsx';
import { BugununKararlari } from './index.tsx';
import { dokum, durumCumlesi, gelenler, gosterGunu, kabulEdilenler, kabulYaz, kararlar } from './kurallar.ts';

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

// Uydurma çalışma (test-veri): T1 31-39 saat duruşta, tatil kuralı kapalı, veri bulguları var; S1 termine 3 saat geç, S2 yetişiyor.
const cx = (c: PlanlamaCalismasi) => derle(girdiKur(c));
// Oturumun başındaki plan: S1'in freze adımı başka tezgâhta ve daha erken; S2'nin işleri yerinde.
const taban = () => calismaKur((c) => {
  const ops = c.plan.ops as Record<string, { m: string; S: number; C: number }>;
  ops['S1.20'] = { ...ops['S1.20'], m: 'T1', S: 12 } as { m: string; S: number; C: number };
  (c.plan.J as Record<string, { C: number; T: number }>).S1 = { C: 80, T: 0 };
});

describe('Bugünün kararları hesapları', () => {
  it('gelenler: plan eskiyse önce o, sonra havuz, sürmekte olan duruş, kapalı kural ve veri bulgusu', () => {
    const c = calismaKur();
    expect(gelenler(c, cx(c), true, 7).map((x) => x.id)).toEqual(['d0', 'kapali', 'den']);
    expect(gelenler(c, cx(c), true, 40).map((x) => x.id)).toEqual(['kapali', 'den']);
    const h = calismaKur((x) => { (x.D.siparisler[1] as Record<string, unknown>).havuz = true; x.kapali = []; });
    const l = gelenler(h, cx(h), false, 7);
    expect(l.map((x) => x.id)).toEqual(['eski', 'hS2', 'd0', 'den']);
    expect(l[1]?.eylemler.map((e) => [e.ad, e.tur])).toEqual([['Plana al', 'motor'], ['Söz tarihi', 'motor'], ['Planda göster', 'goster']]);
  });

  it('kararlar: geciken sipariş gecikme ve öncelikle sıralanır; kabul veri sürümüne bağlıdır', () => {
    const c = calismaKur(); const p = planOku(c); if (!p) throw new Error('plan');
    const l = kararlar(c, p, cx(c));
    expect(l.map((x) => [x.id, x.baslik, x.kabul])).toEqual([['S1', 'S1 termine 3 saat geç kalıyor', false]]);
    expect(durumCumlesi(c, p, 1)).toBe('Plan 2 siparişin 1 tanesinde terminin gerisinde; en çok S1, 3 saat. 1 karar bekliyor.');
    const t = structuredClone(c); kabulYaz(t, 'S1', true);
    expect([...kabulEdilenler(t)]).toEqual(['S1']);
    expect(kararlar(t, p, cx(t))[0]?.kabul).toBe(true);
    expect(kabulEdilenler({ ...t, dataVer: 4 })).toEqual(new Set());
    kabulYaz(t, 'S1', false);
    expect(kabulEdilenler(t).size).toBe(0);
  });

  it('döküm: oturumun başındaki plana göre yeri değişen işler sipariş başına; ilk planlı işin günü', () => {
    const c = calismaKur(); const p = planOku(c); if (!p) throw new Error('plan');
    expect(dokum(null, p, cx(c))).toEqual([]);
    expect(dokum(p, p, cx(c))).toEqual([]);
    const d = dokum(planOku(taban()), p, cx(c));
    expect(d.map((x) => [x.job, x.T0, x.T1, x.l.map((a) => [a.id, a.ad, a.e?.m, a.r.m])])).toEqual([['S1', 0, 3, [['S1.20', 'Freze', 'T1', 'T2']]]]);
    expect([gosterGunu(p, 'S1', 7), gosterGunu(p, 'S9', 7)]).toEqual([0, null]);
  });
});

interface Degisiklik { ne: string; secenek: DegisiklikSecenegi | undefined; sonra: PlanlamaCalismasi }
function ac(secenek: { c?: PlanlamaCalismasi | null; islemler?: string[]; depo?: Partial<PlanlamaDeposu>; geri?: { ne: string; t: number }[] } = {}) {
  const degisiklikler: Degisiklik[] = []; const git = vi.fn(); const sec = vi.fn(); const altSec = vi.fn(); const geriDon = vi.fn(() => true);
  const yetki = yetkiKur(secenek.islemler ?? PLANCI, { yazabilir: true });
  const c0 = secenek.c === undefined ? calismaKur() : secenek.c;
  function Kap() {
    const [x, setX] = useState(c0);
    const komut: CalismaKomutu | null = x && yetki.calismaYazabilir ? {
      degistir: (ne, fn, s) => { const t = structuredClone(x); if (fn(t) === false) return false; degisiklikler.push({ ne, secenek: s, sonra: t }); setX(t); return true; },
      geriAl: () => false, geriAlinabilir: () => false, geriAdimlari: () => secenek.geri ?? [], geriDon, kaydet: () => Promise.resolve(null),
    } : null;
    const o: PlanlamaEkranOzellikleri = {
      depo: { durum: null, calisma: c0, senaryolar: null, ...secenek.depo } as unknown as PlanlamaDeposu, calisma: x, komut, yetki, git, yenile: () => undefined,
      olcek: ACILIS_OLCEGI, olcekSec: () => undefined, kaydir: () => undefined, secim: BOS_SECIM, sec, altSec,
    };
    return <BugununKararlari {...o} />;
  }
  render(<BildirimSaglayici><Kap /></BildirimSaglayici>);
  return { degisiklikler, git, sec, altSec, geriDon };
}
const adimlar = () => within(screen.getByRole('tablist', { name: 'Günlük plan adımları' }));
const panel = () => within(screen.getByRole('tabpanel'));
const adimAc = (ad: RegExp) => fireEvent.click(adimlar().getByRole('tab', { name: ad }));

describe('Bugünün kararları ekranı', () => {
  it('gelen varsa Gelenler açılır; kural açmak ve duruş kaldırmak çalışmaya yazar; veri bulgusu Veri ve kısıtlar bölümünü açar', () => {
    const { degisiklikler, altSec } = ac();
    expect(adimlar().getAllByRole('tab').map((b) => b.getAttribute('aria-label'))).toEqual(['Gelenler (3)', 'Kararlar (1)', 'Gözden geçir', 'Yayınla']);
    expect(adimlar().getByRole('tab', { name: /^Gelenler/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/1 karar bekliyor/)).toBeTruthy();
    fireEvent.click(panel().getByRole('button', { name: 'Hepsini aç' }));
    expect([degisiklikler[0]?.ne, degisiklikler[0]?.sonra.kapali]).toEqual(['Bütün kısıtlar açıldı', []]);
    fireEvent.click(panel().getByRole('button', { name: 'Duruşu kaldır' }));
    expect([degisiklikler[1]?.ne, degisiklikler[1]?.sonra.down]).toEqual(['Duruş kaldırıldı', []]);
    fireEvent.click(panel().getByRole('button', { name: 'Veriyi gör' }));
    expect(altSec).toHaveBeenCalledWith({ ekran: 'veri', bolum: 'denetim' });
    fireEvent.click(panel().getByRole('button', { name: /^Sonraki: Kararlar/ }));
    expect(adimlar().getByRole('tab', { name: /^Kararlar/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('Kararlar: öne alma motor ister; gecikme kabulü planı eskitmeden yazılır, kart kapanır ve yeniden açılır; Planda göster siparişi seçer', () => {
    const { degisiklikler, sec } = ac();
    adimAc(/^Kararlar/);
    expect(panel().getByRole('button', { name: 'Öne almayı dene' }).getAttribute('title')).toBe(`Öne almayı dene: ${MOTOR_NOTU}`);
    fireEvent.click(panel().getByRole('button', { name: 'Planda göster' }));
    expect(sec).toHaveBeenCalledWith({ siparis: 'S1', adim: null, tezgah: null });
    fireEvent.click(panel().getByRole('button', { name: 'Gecikmeyi kabul et' }));
    expect([degisiklikler[0]?.ne, degisiklikler[0]?.secenek, [...kabulEdilenler(degisiklikler[0]?.sonra as PlanlamaCalismasi)]])
      .toEqual(['Gecikme kabul edildi', { ayrinti: 'S1', planKoru: true }, ['S1']]);
    expect(panel().getByText('Gecikme kabul edildi')).toBeTruthy();
    expect(adimlar().getByRole('tab', { name: /^Kararlar/ }).getAttribute('aria-label')).toBe('Kararlar');
    fireEvent.click(panel().getByRole('button', { name: 'Yeniden aç' }));
    expect(degisiklikler[1]?.ne).toBe('Gecikme kararı yeniden açıldı');
    expect(panel().getByRole('button', { name: 'Gecikmeyi kabul et' })).toBeTruthy();
  });

  it('Gözden geçir: oturumun başına göre döküm ve yapılan değişiklikler; seçilen değişiklikten öncesine dönülür', () => {
    const { geriDon } = ac({ depo: { calisma: taban() }, geri: [{ ne: 'Duruş kaldırıldı', t: 2 }, { ne: 'Bütün kısıtlar açıldı', t: 1 }] });
    adimAc(/^Gözden geçir/);
    expect(panel().getByText('1 siparişin işleri yer değiştirdi.')).toBeTruthy();
    expect(panel().getByText('3 saat geç')).toBeTruthy();
    const l = panel().getAllByRole('button', { name: 'Öncesine dön' });
    expect(l).toHaveLength(2);
    expect(panel().getAllByRole('listitem').filter((x) => x.className === 'tc-pyb-degisiklik').map((x) => x.textContent?.replace('Öncesine dön', ''))).toEqual(['Bütün kısıtlar açıldı', 'Duruş kaldırıldı']);
    fireEvent.click(l[0] as HTMLElement);
    expect(geriDon).toHaveBeenCalledWith(2);
  });

  it('Yayınla: canlıya göre fark ve onay bekleyen plan; onay ve canlıya alma stüdyoda', async () => {
    vi.spyOn(api, 'get').mockResolvedValue({ planSurumu: 3, ayni: false, guncel: true, tasinan: 2, tezgah: 0, sira: 0, yeni: 1, eksik: 0, isler: [], yazilamaz: [] } as never);
    const senaryolar = { canliSurum: 3, senaryolar: [{ id: 1, ad: 'Deneme senaryo', durum: 'onayda', acan: 'Deneme kisi', gostergeler: { geciken: 2 } }] } as unknown as SenaryolarCevabi;
    const { git } = ac({ depo: { senaryolar } });
    adimAc(/^Yayınla/);
    await waitFor(() => { expect(panel().getByText('Canlıdaki plan: sürüm 3.')).toBeTruthy(); });
    expect(panel().getByText('Deneme kisi gönderdi: Deneme senaryo, 2 geciken emir.')).toBeTruthy();
    fireEvent.click(panel().getByRole('button', { name: 'Onay ve canlıya alma' }));
    expect(git).toHaveBeenCalledWith('studio');
    expect(panel().queryByRole('button', { name: /^Sonraki:/ })).toBeNull();
  });

  it('her rolde aynı adımlar ve kartlar görünür; yazamayan kişide yazan düğmeler pasiftir', () => {
    const goruneni = () => [adimlar().getAllByRole('tab').map((b) => b.getAttribute('aria-label')), panel().getAllByRole('button').map((b) => b.textContent)];
    ac();
    const planci = goruneni();
    cleanup();
    const { degisiklikler } = ac({ islemler: OKUYAN });
    expect(goruneni()).toEqual(planci);
    const hepsi = panel().getByRole('button', { name: 'Hepsini aç' });
    expect([hepsi.getAttribute('aria-disabled'), hepsi.getAttribute('title')]).toEqual(['true', 'Hepsini aç: Plan yazma yetkiniz yok.']);
    fireEvent.click(hepsi);
    expect(degisiklikler).toHaveLength(0);
  });

  it('çalışma ya da plan yoksa boş durum', () => {
    ac({ c: null });
    expect(screen.getByText(/Planlama çalışması yok|çalışma/i)).toBeTruthy();
    cleanup();
    ac({ c: calismaKur((x) => { (x as Record<string, unknown>).plan = null; }) });
    expect(screen.queryByRole('tablist')).toBeNull();
  });
});

describe('Bugünün kararları sayfaya bağlı', () => {
  const KAYIT = [{ anahtar: PLANLAMA_ANAHTARI, bicim: 'json' as const, deger: CALISMA_DEGERI, surum: 4 }];
  const bugun = () => document.querySelector('[data-parca="bugun"]');
  it('Başka menüsünün Sayfalar\'ından açılır; adresle doğrudan açılır; Plan düğmesi tahtaya döner', async () => {
    sunucuKur(YONETICI, KAYIT);
    sayfaAc('/plan');
    fireEvent.click(await screen.findByRole('button', { name: 'Başka' }, { timeout: 10000 }));
    fireEvent.click(within(screen.getByRole('group', { name: 'Sayfalar' })).getByRole('menuitem', { name: 'Bugünün kararları' }));
    await waitFor(() => { expect(bugun()).not.toBeNull(); }, { timeout: 10000 });
    fireEvent.click(within(await screen.findByRole('toolbar', { name: 'Plan çubuğu' })).getByRole('button', { name: 'Plan' }));
    await waitFor(() => { expect(bugun()).toBeNull(); });
    cleanup(); vi.unstubAllGlobals();
    sunucuKur(MALIYETSIZ, KAYIT);
    sayfaAc('/plan?ekran=bugun');
    await waitFor(() => { expect(bugun()?.getAttribute('data-adim')).toBe('gelen'); }, { timeout: 10000 });
  }, 30000);
});
