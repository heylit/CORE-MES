import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BildirimSaglayici } from '../../../../../ortak/arayuz/index.ts';
import { PLANLAMA_ISLEMI } from '../../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaEkranOzellikleri, type PlanlamaOlcegi, type PlanlamaSecimi } from '../../gorunumler.ts';
import { PlanlamaMotoru } from '../../motor/index.tsx';
import { derle, girdiKur, planOku } from '../../motor/kurallar.ts';
import { ornekCalisma } from '../../motor/ornek.ts';
import { MOTOR_NOTU } from '../../motor/ortak.tsx';
import { ozetVerisi } from '../../motor/ozet/veri.ts';
import type { PlanlamaDeposu } from '../../veri.ts';
import { yetkiKur } from '../../yetki.ts';
import { eksen, kapaliPencereler, kaydirma, kuyruk, odakDolulugu, odakGruplari, odakTezgahlari, otomatikOdak, pencere, serit, varsayilanGun } from './kurallar.ts';

afterEach(cleanup);

// Örnek çalışma (motor/ornek.ts): beş tezgâh, her biri kendi grubunda, bir fasoncu; şimdi 8. saat, işler beşinci günden sonra.
const kur = () => { const c = ornekCalisma(); const p = planOku(c); if (!p) throw new Error('plan'); const cx = derle(girdiKur(c)); return { c, p, cx }; };

describe('Odak tahtası hesapları', () => {
  it('bölümler haritanın sırasıyla; fason bölümü plandaki fasoncular', () => {
    const { c, p, cx } = kur();
    expect(odakGruplari(c, p, cx)).toEqual(['1', '2', '3', 'fason', '4', '5']);
    expect([odakTezgahlari(c, p, 'fason'), odakTezgahlari(c, p, '3')]).toEqual([['@5'], ['3']]);
  });

  it('pencere, kaydırma ve varsayılan süre; kapalı saatler, doluluk ve şerit', () => {
    const { c, p, cx } = kur();
    expect([pencere(8, 3, 2), kaydirma(1), kaydirma(7), varsayilanGun(true, false), varsayilanGun(false, true)]).toEqual([{ gun: 3, a: 48, b: 120 }, 1, 4, 7, 1]);
    expect(kapaliPencereler(cx, '@5', 0, 24)).toEqual([]);
    expect(odakDolulugu(cx, p, '3', 0, 24)).toBe(0);
    const s = serit(c, p, cx, '3', 0, 168, 8);
    expect(s.isler.map((x) => [x.id, x.job, x.gec, x.durum])).toEqual([['2.20', '2', true, null]]);
    expect(s.isler[0]?.x).toBeCloseTo(138.6167 / 168, 3);
    expect([s.simdi, s.gunc.length]).toEqual([8 / 168, 6]);
    expect(eksen(c.D, 0, 24, true).map((x) => x.e)).toEqual(['00:00', '03:00', '06:00', '09:00', '12:00', '15:00', '18:00', '21:00']);
    expect(eksen(c.D, 0, 72, false).filter((x) => x.tur === 'gun')).toHaveLength(3);
    expect(kuyruk(p, '3', 8).map((r) => r.id)).toEqual(['2.20']);
  });

  it('kendiliğinden yer: seçili işin tezgâhı, seçili tezgâh, siparişin en çok beklediği bölüm, yoksa en çok bekleten', () => {
    const { c, p, cx } = kur(); const v = ozetVerisi(c, p, cx, 'hafta', 0);
    const bos = { adim: null, tezgah: null, siparis: null };
    expect(otomatikOdak(c, p, cx, v, { ...bos, adim: '2.30' })).toEqual({ g: 'fason', m: '@5' });
    expect(otomatikOdak(c, p, cx, v, { ...bos, tezgah: '4' })).toEqual({ g: '4', m: '4' });
    expect(otomatikOdak(c, p, cx, v, bos)).toEqual({ g: '1', m: null });
    expect(otomatikOdak(c, p, cx, null, bos)).toEqual({ g: '1', m: null });
  });
});

const DEPO = { durum: null } as unknown as PlanlamaDeposu;
function ac(yaz = true) {
  const oz: Omit<PlanlamaEkranOzellikleri, 'olcek' | 'olcekSec' | 'kaydir' | 'secim' | 'sec'> = {
    depo: DEPO, calisma: ornekCalisma(), komut: null, git: vi.fn(), yenile: vi.fn(),
    yetki: yetkiKur([PLANLAMA_ISLEMI, ...(yaz ? ['plan.yaz'] : [])], { yazabilir: yaz }),
  };
  function Iskelet() {
    const [olcek, setOlcek] = useState<PlanlamaOlcegi>(ACILIS_OLCEGI);
    const [secim, setSecim] = useState<PlanlamaSecimi>(BOS_SECIM);
    return (
      <PlanlamaMotoru {...oz} olcek={olcek} olcekSec={(x) => setOlcek({ olcek: x, kayma: 0 })} kaydir={(n) => setOlcek((x) => ({ ...x, kayma: x.kayma + n }))}
        secim={secim} sec={(x) => setSecim((y) => ({ ...y, ...x }))} />
    );
  }
  render(<BildirimSaglayici><Iskelet /></BildirimSaglayici>);
}
const odak = () => document.querySelector<HTMLElement>('section.tc-pyo');
const tus = (key: string) => fireEvent.keyDown(window, { key });
async function tezgahaOdaklan() {
  fireEvent.click(within(screen.getByRole('region', { name: 'Hangi gün hangi tezgâh dolu?' })).getByRole('button', { name: '3' }));
  fireEvent.click(within(screen.getByRole('complementary', { name: 'Yan panel' })).getByRole('button', { name: 'Odakla' }));
  return screen.findByRole('region', { name: 'Odak: 3' }, { timeout: 10000 });
}

describe('Odak tahtası ekranı', () => {
  it('tezgâh kartının Odakla\'sı tezgâhı açar: gün şeritleri, kuyruk ve takvim; iş seçilir, taşıma pasif; Esc bir seviye çıkar', async () => {
    ac();
    const k = within(await tezgahaOdaklan());
    expect(screen.queryByRole('complementary', { name: 'Yan panel' })).toBeNull();
    expect(odak()?.dataset.sev).toBe('tez');
    expect(within(k.getByRole('navigation', { name: 'Konum' })).getAllByRole('button').map((b) => b.textContent)).toEqual(['Fabrika', '3']);
    expect(odak()?.querySelectorAll('.tc-pyo-satir')).toHaveLength(7);
    expect(k.getByRole('group', { name: 'Görünen süre' }).querySelector('[aria-pressed="true"]')?.textContent).toBe('7 gün');
    expect(k.getByText('Kuyruk (1)')).toBeTruthy();
    expect(k.getByText('3 takvimi')).toBeTruthy();
    fireEvent.click(odak()?.querySelector('.tc-pyo-is') as HTMLElement);
    const secili = within(k.getByRole('region', { name: 'Seçili iş 2.20' }));
    expect(secili.getByRole('button', { name: 'Sırada öne' }).getAttribute('title')).toBe(`Sırada öne: ${MOTOR_NOTU}`);
    fireEvent.click(k.getByRole('button', { name: '3 gün' }));
    expect(odak()?.querySelectorAll('.tc-pyo-satir')).toHaveLength(3);
    tus('Escape');
    expect(k.queryByRole('region', { name: /^Seçili iş/ })).toBeNull();
    tus('Escape');
    expect(odak()?.dataset.sev).toBe('grup');
    expect(odak()?.querySelectorAll('.tc-pyo-satir')).toHaveLength(1);
    expect(k.getByText('Bu bölümde bekleyenler')).toBeTruthy();
    tus('Escape');
    expect(odak()).toBeNull();
  }, 30000);

  it('O tuşu bir bölümü açar ve kapatır; kardeş seçimi ve görünüm değişimi', async () => {
    ac();
    tus('o');
    const k = within(await screen.findByRole('region', { name: /^Odak: / }, { timeout: 10000 }));
    expect(odak()?.dataset.sev).toBe('grup');
    fireEvent.change(k.getByRole('combobox', { name: 'Başka bölüm' }), { target: { value: 'fason' } });
    expect(screen.getByRole('region', { name: 'Odak: Fason' })).toBeTruthy();
    fireEvent.click(within(screen.getByRole('region', { name: 'Odak: Fason' })).getByRole('button', { name: /@5|5 \(fason\)/ }));
    expect(screen.getByRole('region', { name: 'Odak: 5 (fason)' })).toBeTruthy();
    expect(screen.queryByText(/takvimi$/)).toBeNull();
    tus('o');
    expect(odak()).toBeNull();
    tus('o');
    expect(odak()).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Keşfet' }));
    expect(odak()).toBeNull();
  }, 30000);

  it('her rolde aynı bölümler görünür; yazamayan kişide ek mesai denemesi yoktur, sıra düğmeleri pasif', async () => {
    const basliklar = () => [...(odak()?.querySelectorAll('h4') ?? [])].map((x) => x.textContent).filter((x) => x !== 'Ek mesai dene');
    ac(true);
    await tezgahaOdaklan();
    const yazan = basliklar();
    cleanup();
    ac(false);
    const k = within(await tezgahaOdaklan());
    expect(basliklar()).toEqual(yazan);
    expect(k.queryByText('Ek mesai dene')).toBeNull();
    expect(k.getAllByRole('button', { name: 'Sırada öne al' })[0]?.getAttribute('title')).toBe('Sırada öne al: Plan yazma yetkiniz yok.');
  }, 30000);
});
