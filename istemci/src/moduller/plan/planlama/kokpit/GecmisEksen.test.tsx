import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { PLANLAMA_ISLEMI } from '../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import { saatiSabitle } from '../test-saati.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import type { PlanlamaDeposu } from '../veri.ts';
import { yetkiKur } from '../yetki.ts';
import { Kokpit } from './index.tsx';

// Kart 3729: tahtada bugünden önce başlamış iş görünür, tahta geçmişe kaydırılabilir; açılış yine şimdidedir. Veri uydurmadır (ORN-).
// Şimdi planın 7. günü 08:00; süren 2.20 adımı 6. gün 06:00'da başlamış.
const SIMDI = 6 * 24 + 8, BASLADI = 5 * 24 + 6, EKSEN = 5 * 24;
function gecmisliCalisma(): PlanlamaCalismasi {
  const c = structuredClone(ornekCalisma()) as PlanlamaCalismasi & { simdi?: number };
  c.simdi = SIMDI;
  const op = (c.plan as unknown as { ops: Record<string, Record<string, unknown>> }).ops['2.20']!;
  op['S'] = BASLADI;
  return c;
}
saatiSabitle(gecmisliCalisma);
const kaydirma = vi.fn();
const eskiKaydir = Element.prototype.scrollTo;
beforeEach(() => { localStorage.clear(); kaydirma.mockClear(); Element.prototype.scrollTo = kaydirma as unknown as typeof Element.prototype.scrollTo; });
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); Element.prototype.scrollTo = eskiKaydir; });

const DEPO = { durum: null, planSurumu: null, senaryolar: null, calismaSurumu: 4, receteRotaKaydi: null } as unknown as PlanlamaDeposu;
function komutKur(): CalismaKomutu {
  return { degistir: vi.fn(() => false), geriAl: vi.fn(() => true), geriAlinabilir: () => false, geriAdimlari: () => [], geriDon: () => true, yinele: vi.fn(() => true), yinelenebilir: () => false, kaydet: () => Promise.resolve(4) };
}
function ac(): void {
  render(
    <MemoryRouter initialEntries={['/']}><BildirimSaglayici>
      <Kokpit
        depo={DEPO} calisma={gecmisliCalisma()} komut={komutKur()} git={vi.fn()} yenile={vi.fn()} yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz'])}
        olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={BOS_SECIM} sec={vi.fn()}
      />
    </BildirimSaglayici></MemoryRouter>,
  );
}
const px = (el: Element | null | undefined, ad: string): number => Number.parseFloat((el as HTMLElement | null | undefined)?.style.getPropertyValue(ad) ?? 'NaN');
const tahta = (): HTMLElement => document.querySelector<HTMLElement>('.tc-pyq-tahta')!;

describe('Kokpit tahtası: geçmiş (3729)', () => {
  it('bugünden önce başlamış işin çubuğu tahtanın içindedir: eksen işin gününden başlar', () => {
    ac();
    const cubuk = tahta().querySelector('[data-is="2.20"]');
    expect(cubuk).not.toBeNull();
    const simdi = px(tahta().querySelector('.tc-pyq-simdi'), '--x'), x = px(cubuk, '--x');
    // Çubuk eksenin ilk gününün 06:00'ında, şimdi çizgisi bir gün sonra 08:00'de: ikisi de eksenin içindedir, oranları saatlerle aynıdır.
    expect(x).toBeGreaterThan(0);
    expect(simdi / (SIMDI - EKSEN)).toBeCloseTo(x / (BASLADI - EKSEN), 3);
  });

  it('açılışta tahta yine şimdiye kayar; geçmişe kaydırılabilir', () => {
    ac();
    const simdi = px(tahta().querySelector('.tc-pyq-simdi'), '--x');
    const sol = kaydirma.mock.calls.map((c) => (c[0] as ScrollToOptions).left ?? 0);
    expect(sol.length).toBeGreaterThan(0);
    // Şimdi görünür (sol kenarda küçük pay), sol kenarın solunda geçmiş kalır.
    expect(sol[0]).toBeGreaterThan(0);
    expect(sol[0]).toBeLessThanOrEqual(simdi);
  });
});
