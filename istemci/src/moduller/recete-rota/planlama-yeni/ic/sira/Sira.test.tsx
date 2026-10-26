import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import { BildirimSaglayici } from '../../../../../ortak/arayuz/index.ts';
import { derle, girdiKur, planOku, plandanBitenler, type OkunanPlan } from '../../motor/kurallar.ts';
import { MOTOR_NOTU } from '../../motor/ortak.tsx';
import { ornekCalisma } from '../../motor/ornek.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import { TezgahSirasiPaneli } from './index.tsx';
import { SIRA_SINIRI, siraDegisti, siraKur, siraTasi, siraTezgahlari, siraYon } from './kurallar.ts';

afterEach(cleanup);

// Örnek planda her tezgâhta bir iş var; sıra için üç iş tezgâh 1'e alınır. 2.20 başlamış iştir, sıraya girmez.
function kur(sabit: string[] = []) {
  const c = ornekCalisma(); c.locks = Object.fromEntries(sabit.map((id) => [id, { m: '1' }]));
  const p0 = planOku(c); if (!p0) throw new Error('plan yok');
  const ops = structuredClone(p0.ops);
  const yer = (id: string, S: number, act = false) => { const r = ops[id]; if (r) Object.assign(r, { m: '1', S, C: S + 1, act }); };
  yer('3.20', 130); yer('2.40', 140); yer('2.20', 150, true);
  const p: OkunanPlan = { ...p0, ops };
  return { c, p, cx: derle(girdiKur(c, plandanBitenler(c, null))) };
}
const hic = () => false;

describe('Tezgâh sırası hesapları', () => {
  it('şimdiden sonra başlayan, başlamamış işler saat sırasıyla, en çok on beş; fason tezgâh listede yok', () => {
    const { p, cx } = kur();
    expect(siraTezgahlari(cx)).toEqual(['1', '2', '3', '4', '5']);
    const q = siraKur(p, cx, '1');
    expect(q.ids).toEqual(['3.10', '3.20', '2.40']);
    expect(siraDegisti(q)).toBe(false);
    const cok = { ...p, ops: Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`x${i}`, { ...(p.ops['3.10'] as OkunanPlan['ops'][string]), id: `x${i}`, S: 100 + i }])) };
    expect(siraKur(cok, cx, '1').ids).toHaveLength(SIRA_SINIRI);
  });

  it('bir öne ve arkaya, sürükle bırak; sabit iş ve sabit işin yeri değişmez, sınırdaki iş yerinde kalır', () => {
    const { p, cx } = kur();
    const q = siraKur(p, cx, '1');
    const a = siraYon(q, '3.20', -1, hic);
    expect(a !== 'sabit' && a?.ids).toEqual(['3.20', '3.10', '2.40']);
    expect(a !== 'sabit' && a !== null && siraDegisti(a)).toBe(true);
    expect(siraYon(q, '3.10', -1, hic)).toBeNull();
    expect(siraYon(q, '3.20', 1, (id) => id === '2.40')).toBe('sabit');
    const t = siraTasi(q, '2.40', '3.10', hic);
    expect(t !== 'sabit' && t?.ids).toEqual(['2.40', '3.10', '3.20']);
    expect(siraTasi(q, '3.10', '2.40', (id) => id === '3.20')).toBe('sabit');
    expect(siraTasi(q, '3.10', '3.10', hic)).toBeNull();
  });
});

function ac(o: { c: PlanlamaCalismasi; p: OkunanPlan; cx: ReturnType<typeof kur>['cx'] }, yaz = true, m: string | null = '1') {
  render(<BildirimSaglayici><TezgahSirasiPaneli c={o.c} p={o.p} cx={o.cx} m={m} yaz={yaz} kapat={() => undefined} /></BildirimSaglayici>);
  return screen.getByRole('dialog', { name: 'Tezgâh sırası' });
}
const sira = (d: HTMLElement) => within(d).getAllByRole('listitem').map((x) => x.querySelector('b')?.textContent);

describe('Tezgâh sırası penceresi', () => {
  it('oklar sırayı değiştirir, değişen satır işaretlenir; baştaki sıraya dönülür; Uygula motorla açılır; tezgâh değişince liste değişir', () => {
    const d = ac(kur());
    expect(within(d).getByRole('list', { name: '1 kuyruğu' })).toBeTruthy();
    expect(sira(d)).toEqual(['3.10', '3.20', '2.40']);
    expect(within(d).getByRole('button', { name: 'Uygula' }).getAttribute('title')).toBe('Uygula: Sıra değişmedi.');
    expect(within(d).queryByRole('button', { name: 'Baştaki sıraya dön' })).toBeNull();
    fireEvent.click(within(d).getByRole('button', { name: '3.20 bir yukarı' }));
    expect(sira(d)).toEqual(['3.20', '3.10', '2.40']);
    expect(within(d).getAllByRole('listitem').map((x) => x.hasAttribute('data-yeni'))).toEqual([true, true, false]);
    const uygula = within(d).getByRole('button', { name: 'Uygula' });
    expect(uygula.getAttribute('aria-disabled')).toBe('true');
    expect(uygula.getAttribute('title')).toBe(`Uygula: ${MOTOR_NOTU}`);
    fireEvent.click(within(d).getByRole('button', { name: 'Baştaki sıraya dön' }));
    expect(sira(d)).toEqual(['3.10', '3.20', '2.40']);
    fireEvent.change(within(d).getByRole('combobox', { name: 'Tezgâh' }), { target: { value: '2' } });
    expect(within(d).getByText('Bu tezgâhta sırada iş yok.')).toBeTruthy();
  });

  it('sürükle bırak taşır; sabit iş tutulmaz, ona dokunan taşıma bildirilir', () => {
    const d = ac(kur(['2.40']));
    const li = (id: string) => d.querySelector(`li[data-id="${id}"]`) as HTMLElement;
    expect(li('2.40').getAttribute('draggable')).toBe('false');
    expect(within(li('2.40')).getByText(/sabit/)).toBeTruthy();
    const veri = { effectAllowed: '', setData: () => undefined };
    fireEvent(li('3.20'), Object.assign(createEvent.dragStart(li('3.20')), { dataTransfer: veri }));
    fireEvent.dragOver(li('3.10'));
    expect(li('3.10').hasAttribute('data-hedef')).toBe(true);
    fireEvent.drop(li('3.10'));
    expect(sira(d)).toEqual(['3.20', '3.10', '2.40']);
    fireEvent.click(within(d).getByRole('button', { name: '3.10 bir aşağı' }));
    expect(screen.getByText('Sabit işin sırası değişmez.')).toBeTruthy();
    expect(sira(d)).toEqual(['3.20', '3.10', '2.40']);
  });

  it('her rolde aynı görünüm: okuyan aynı listeyi ve düğmeleri görür, düğmeler ona pasiftir', () => {
    const gor = (yaz: boolean) => {
      const d = ac(kur(), yaz);
      const l = [...within(d).getAllByRole('button'), ...within(d).getAllByRole('listitem')].map((e) => e.getAttribute('aria-label') ?? e.textContent);
      if (!yaz) {
        const b = within(d).getByRole('button', { name: '3.20 bir yukarı' });
        expect(b.getAttribute('aria-disabled')).toBe('true');
        fireEvent.click(b);
        expect(sira(d)).toEqual(['3.10', '3.20', '2.40']);
        expect(d.querySelector('li[draggable="true"]')).toBeNull();
      }
      cleanup(); return l;
    };
    expect(gor(false)).toEqual(gor(true));
  });
});

describe('Stüdyo isteğinin adresi', () => {
  it('istek adresin sorgusundadır; tanınmayan istek okunmaz', async () => {
    const { studyoAdresi, studyoIstegiOku } = await import('../../gorunumler.ts');
    const a = studyoAdresi({ tur: 'tez', v: 'T 1' });
    expect(a).toBe('/recete-rota/planlama-yeni/studio?istek=tez&v=T+1');
    expect(studyoIstegiOku(new URL(a, 'http://x').searchParams)).toEqual({ tur: 'tez', v: 'T 1' });
    expect(studyoAdresi(null)).toBe('/recete-rota/planlama-yeni/studio');
    expect(studyoIstegiOku(new URLSearchParams('istek=kriz&v=1'))).toBeNull();
    expect(studyoIstegiOku(new URLSearchParams('istek=sip'))).toBeNull();
  });
});
