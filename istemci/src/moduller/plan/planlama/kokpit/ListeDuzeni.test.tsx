import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { derle, girdiKur, planOku, plandanBitenler } from '../motor/kurallar.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import { ListeDuzeni, satirBirincilIster } from './ListeDuzeni.tsx';
import { eksikNedeni, modelKur } from './kurallar.ts';
import { siraKartlari } from './yerlestirme.ts';

afterEach(() => { cleanup(); });

// Örnek çalışma uydurmadır: iki emir (ORN-2 geç, ORN-3 riskli); 2.20 süren iştir.
function kur(ek: { w?: Record<string, unknown>; gercek?: Record<string, unknown> } = {}) {
  const c0 = ornekCalisma();
  const c = { ...c0, w: { ...c0.w, ...ek.w }, ...(ek.gercek ? { gercek: ek.gercek } : {}) } as typeof c0;
  const p = planOku(c), m = modelKur(c, p, derle(girdiKur(c, plandanBitenler(c, p))), (id) => `ORN-${id}`);
  return { m, p, kartlar: siraKartlari(m) };
}
const zaman = (t: number): string => `01.01 ${String(Math.round(t))}`;
function ciz(x: ReturnType<typeof kur>, acik: string | null, ek: Partial<Parameters<typeof ListeDuzeni>[0]> = {}) {
  const ac = vi.fn(), planla = vi.fn(), yenidenPlanla = vi.fn();
  render(<ListeDuzeni m={x.m} p={x.p} kartlar={x.kartlar} acik={acik} ac={ac} zaman={zaman} mesgul={false} planla={planla} yenidenPlanla={yenidenPlanla} hamle={null} surum={4} tahta={<div data-test-tahta="" />} satirBirincil adimSec={vi.fn()} seciliIs={null} {...ek} />);
  return { ac, planla, yenidenPlanla };
}

// Yarım planlı emir: ORN-3'ün son adımı planın dışında kalmış.
function yarimKur(neden: Record<string, unknown>) {
  const c0 = ornekCalisma(), plan = c0.plan as unknown as { ops: Record<string, { job: string }> };
  const eksik = Object.keys(plan.ops).filter((id) => plan.ops[id]?.job === '3').sort().at(-1) as string;
  const { [eksik]: _cikan, ...kalan } = plan.ops;
  const c = { ...c0, plan: { ...plan, ops: kalan, fail: [eksik], failNeden: { [eksik]: neden } } } as unknown as typeof c0;
  const p = planOku(c), m = modelKur(c, p, derle(girdiKur(c, plandanBitenler(c, p))), (id) => `ORN-${id}`);
  return { m, p, kartlar: siraKartlari(m), eksik };
}

describe('yarım planlı emir', () => {
  it('satır "N / M planda" der; açık satır kaç adımın eksik olduğunu ve nedenini yazar; Planla eksik adımlar için çağrılır', () => {
    const x = yarimKur({ kod: 'aday' });
    const k = x.kartlar.find((y) => y.kok === '3');
    expect(k?.durum).toBe('plansiz');
    const { planla, yenidenPlanla } = ciz(x, '3');
    expect(document.querySelector('[data-kart="3"]')?.textContent).toContain(`${String(k?.yerlesen)} / ${String(k?.adim)} planda`);
    const durum = document.querySelector('[data-kismi]');
    expect(durum?.querySelector('b')?.textContent).toBe(`1 adımın planda yeri yok; ${String(k?.yerlesen)} adım planda.`);
    expect(screen.queryByText('Planda yeri yok.')).toBeNull();
    expect(document.querySelector(`[data-yeri-yok="${x.eksik}"]`)?.textContent).toBe('yeri yok: uygun tezgâh ya da fasoncu yok');
    expect(document.querySelectorAll('[data-yeri-yok]').length).toBe(1);
    fireEvent.click(screen.getByRole('button', { name: 'Planla' }));
    expect(planla).toHaveBeenCalledWith(k);
    expect(yenidenPlanla).not.toHaveBeenCalled();
  });

  it('yerleşmeyen adımın nedeni: motorun kodu; motor denediyse ama neden yazmadıysa ufuk; hiç denemediyse son planlamada yoktu', () => {
    expect(eksikNedeni({ fail: ['a'], failNeden: { a: { kod: 'oncul', oncul: 'b' } } }, 'a')).toBe('önceki adım yerleşmedi');
    expect(eksikNedeni({ fail: ['a'] }, 'a')).toBe('ufuk içinde tezgâh, vardiya, kaynak ya da malzeme yeri bulunamadı');
    expect(eksikNedeni({ fail: [] }, 'a')).toBe('son planlamada yoktu');
    expect(eksikNedeni(null, 'a')).toBe('son planlamada yoktu');
  });

  it('3457: motor zaman nedenini ölçtüyse ne olduğu, sayısı ve ne yapılacağı yazar; ölçülemediyse eski metin', () => {
    const t = (alt: 'sure' | 'dolu' | 'hazirlik' | 'ayarci' | 'bilinmiyor', gerek: number | null, mevcut: number | null) =>
      ({ fail: ['a'], failNeden: { a: { kod: 'zaman' as const, tani: { alt, m: '100', ad: 'ORN-Torna 1', gerek, mevcut, ufukGun: 120 } } } });
    expect(eksikNedeni(t('sure', 1170, 640), 'a')).toBe('iş 1.170 sa sürüyor, ORN-Torna 1 tezgâhı 120 günlük planlama süresi içinde yalnız 640 sa çalışıyor. Çevrim süresini kontrol edin, başka tezgâh ekleyin ya da vardiyayı artırın.');
    expect(eksikNedeni(t('dolu', 40.25, 12), 'a')).toBe('ORN-Torna 1 tezgâhı dolu: iş 40,3 sa istiyor, 120 günlük planlama süresi içinde boş 12 sa kaldı. Başka tezgâh ekleyin, ek mesai açın ya da siparişe öncelik verin.');
    expect(eksikNedeni(t('ayarci', 15, 0), 'a')).toBe('ORN-Torna 1 tezgâhının vardiyalarında ayarcı yok. Vardiyaya ayarcı atayın.');
    expect(eksikNedeni(t('hazirlik', 30, 8), 'a')).toContain('hazırlık 30 sa, ORN-Torna 1 tezgâhı en çok 8 sa kesintisiz çalışıyor');
    expect(eksikNedeni(t('bilinmiyor', null, null), 'a')).toBe('nedeni ölçülemedi; Reçete ve Rota > Planlanabilirlik sayfasında adımın kontrollerine bakın.');
    expect(eksikNedeni(t('sure', null, null), 'a')).toBe('iş ORN-Torna 1 tezgâhında 120 günlük planlama süresi içine sığmıyor. Çevrim süresini kontrol edin, başka tezgâh ekleyin ya da vardiyayı artırın.');
    expect(eksikNedeni({ fail: ['a'], failNeden: { a: { kod: 'zaman', tani: { alt: 'vardiya', m: null, ad: null, gerek: null, mevcut: 0, ufukGun: 120 } } } }, 'a'))
      .toBe('uygun tezgâh 120 günlük planlama süresi içinde hiç vardiyada değil. Tezgâha vardiya atayın.');
  });
});

describe('Kokpit liste düzeni (3414 b)', () => {
  it('her sipariş tek satırdır: durumu ve tek düğmesi; düğme satırı açar, açık satırda Kapat yazar', () => {
    const x = kur();
    const { ac } = ciz(x, null);
    const satirlar = [...document.querySelectorAll<HTMLElement>('.tc-pyq-ld-satir')];
    expect(satirlar.map((s) => s.dataset.kart).sort()).toEqual(['2', '3']);
    const gec = satirlar.find((s) => s.dataset.kart === '2') as HTMLElement;
    expect(gec.textContent).toContain('ORN-2');
    expect(gec.textContent).toMatch(/ geç/);
    fireEvent.click(within(gec).getByRole('button', { name: 'Düzelt' }));
    expect(ac).toHaveBeenCalledWith('2');
    expect(document.querySelector('.tc-pyq-ld-ayrinti')).toBeNull();
  });

  it('açık satır sonucu ve nedenini, adımları ve tahtayı gösterir; Planla yeniden dizmeyi çağırır', () => {
    const x = kur();
    const { ac, yenidenPlanla } = ciz(x, '2');
    const durum = screen.getByRole('status');
    expect(durum.querySelector('b')?.textContent).not.toBe('');
    expect(durum.textContent).toContain('Neden:');
    const adimlar = within(screen.getByRole('list', { name: 'Adımlar' })).getAllByRole('listitem');
    expect(adimlar.length).toBe(x.m.emirler.find((e) => e.id === '2')?.adimlar.length);
    expect(document.querySelector('[data-test-tahta]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Planla' }));
    expect(yenidenPlanla).toHaveBeenCalledWith(x.kartlar.find((k) => k.kok === '2'));
    fireEvent.click(screen.getByRole('button', { name: 'Kapat' }));
    expect(ac).toHaveBeenCalledWith(null);
  });

  it('sayfada tek birincil düğme (2155-9 a): satır düğmeleri ikincildir; açık satırın düğmesi yalnız sayfa izin verince birincildir', () => {
    const x = kur();
    ciz(x, null);
    expect(document.querySelectorAll('.tc-dugme-birincil').length).toBe(0);
    cleanup();
    ciz(x, '2', { hamle: vi.fn() });
    expect([...document.querySelectorAll('.tc-dugme-birincil')].map((b) => b.textContent)).toEqual(['Seçenekleri göster']);
    cleanup();
    ciz(x, '2', { hamle: vi.fn(), satirBirincil: false });
    expect(document.querySelectorAll('.tc-dugme-birincil').length).toBe(0);
    expect(screen.getByRole('button', { name: 'Seçenekleri göster' })).toBeTruthy();
    expect(satirBirincilIster(x.kartlar.find((k) => k.kok === '2'))).toBe(true);
    expect(satirBirincilIster(undefined)).toBe(false);
    expect(satirBirincilIster({ ...x.kartlar[0]!, durum: 'iyi' })).toBe(false);
  });

  it('plansız satır: yazabilen kişi Planla düğmesini görür ve basınca planlama çağrılır; yazamayan kişide düğme çizilmez', () => {
    const x = kur();
    const kartlar = x.kartlar.map((k) => (k.kok === '3' ? { ...k, durum: 'plansiz' as const, emirler: k.emirler.map((e) => ({ ...e, durum: 'plansiz' as const })) } : k));
    const { planla } = ciz({ ...x, kartlar }, '3');
    expect(screen.getByRole('status').textContent).toContain('Planda yeri yok.');
    fireEvent.click(screen.getByRole('button', { name: 'Planla' }));
    expect(planla).toHaveBeenCalledWith(kartlar.find((k) => k.kok === '3'));
    cleanup();
    ciz({ ...x, kartlar }, '3', { planla: null, yenidenPlanla: null });
    expect(screen.getByRole('status').textContent).toContain('Planda yeri yok.');
    expect(screen.queryByRole('button', { name: 'Planla' })).toBeNull();
  });

  it('yazamayan kişide satır açılır, plan değiştiren düğme çıkmaz', () => {
    ciz(kur(), '2', { planla: null, yenidenPlanla: null });
    expect(screen.queryByRole('button', { name: 'Planla' })).toBeNull();
    expect(screen.getByRole('list', { name: 'Adımlar' })).toBeTruthy();
  });

  it('durdurulup taşınan, sahada süren adımın altında "terminalde durdurulmayı bekliyor" yazar (3414-7 a)', () => {
    ciz(kur({ w: { durdurulan: { '2.20': 1 } }, gercek: { '2.20': { m: '3', S: 138.5, A: 10, n: 4 } } }), '2');
    expect(document.querySelector('[data-durdurma-bekliyor="2.20"]')?.textContent).toBe('terminalde durdurulmayı bekliyor; canlıda eski yerinde');
    cleanup();
    ciz(kur(), '2');
    expect(document.querySelector('[data-durdurma-bekliyor]')).toBeNull();
  });

  it('planda yeri olan adım düğmedir ve basınca emri ile işi bildirir; seçili adım basılı görünür; yeri olmayan adım düğme değildir', () => {
    const x = yarimKur({ kod: 'aday' });
    const adimSec = vi.fn();
    const e = x.kartlar.find((y) => y.kok === '3')?.emirler[0];
    const planli = e?.adimlar.find((a) => x.m.isler[a.id])?.id ?? '';
    ciz(x, '3', { adimSec, seciliIs: planli });
    const d = document.querySelector<HTMLButtonElement>(`.tc-pyq-ld-adimlar button[data-adim="${planli}"]`);
    expect(d?.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(d!);
    expect(adimSec).toHaveBeenCalledWith(e?.id, planli);
    expect(document.querySelector(`[data-yeri-yok="${x.eksik}"]`)?.closest('button')).toBeNull();
    expect(document.querySelectorAll('.tc-pyq-ld-adimlar button').length).toBe((e?.adimlar.length ?? 0) - 1);
  });

  it('süzgeçle eşleşen sipariş yoksa bunu söyler', () => {
    ciz({ ...kur(), kartlar: [] }, null);
    expect(screen.getByText('Bu süzgeçle eşleşen sipariş ya da emir yok.')).toBeTruthy();
  });
});
