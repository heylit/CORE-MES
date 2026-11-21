import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import * as gonder from '../motor/atolye/gonder.ts';
import { derle, girdiKur, planOku, plandanBitenler } from '../motor/kurallar.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import { ListeDuzeni, satirBirincilIster } from './ListeDuzeni.tsx';
import { eksikNedeni, modelKur } from './kurallar.ts';
import { siraKartlari } from './yerlestirme.ts';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

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

// 3488 a, c: yerleşmeyen adım elle yerleştirilir ya da bölünür. Önizleme uydurmadır: adım verilen saatte başlar, 5 saat sürer.
describe('yerleşmeyen adımı elle yerleştirme (3488)', () => {
  function elleKur(ek: Partial<Parameters<typeof ListeDuzeni>[0]> = {}) {
    const x = yarimKur({ kod: 'zaman' });
    const oz = vi.spyOn(gonder, 'isTasiOnizle').mockImplementation((g) => Promise.resolve({
      calismaSurumu: 4, gecerli: true, ileti: null, isler: [{ isId: g.isId, tezgah: g.tezgah, S: g.baslangic, C: g.baslangic + 5, eskiTezgah: g.tezgah, eskiS: g.baslangic, tur: 'tasinan' as const }],
    }));
    const tasi = vi.fn(), bol = vi.fn(), hedef = vi.fn(), secimiBirak = vi.fn();
    ciz(x, '3', { tasi, bol, hedef, secimiBirak, ...ek });
    return { x, oz, tasi, bol, hedef, secimiBirak };
  }

  it('yalnız yerleşmeyen adımda Elle yerleştir ve Böl çıkar; yazamayan kişide çıkmaz; Böl paneli o adımla açar', () => {
    const { x, bol } = elleKur();
    expect([...document.querySelectorAll('[data-elle-ac]')].map((b) => b.getAttribute('data-elle-ac'))).toEqual([x.eksik]);
    fireEvent.click(document.querySelector(`[data-bol-ac="${x.eksik}"]`)!);
    expect(bol).toHaveBeenCalledWith(x.eksik);
    cleanup();
    ciz(yarimKur({ kod: 'zaman' }), '3');
    expect(document.querySelector('[data-elle-ac]')).toBeNull();
  });

  it('Elle yerleştir uygun tezgâhlardaki yerleri sorar, tahtaya verir ve listeler; seçilen yerin sonucu yazar; Yerleştir ve kilitle taşıma komutunu verir', async () => {
    const { x, oz, tasi, hedef, secimiBirak } = elleKur();
    fireEvent.click(document.querySelector(`[data-elle-ac="${x.eksik}"]`)!);
    expect(secimiBirak).toHaveBeenCalled();
    const panel = screen.getByRole('group', { name: /için elle yerleştirme$/ });
    const yer = await within(panel).findAllByRole('button', { pressed: false, name: /→/ });
    expect(oz).toHaveBeenCalled();
    expect(oz.mock.calls.every(([g]) => g.isId === x.eksik)).toBe(true);
    expect(panel.querySelector('[data-gerekli]')?.textContent).toBe('Gerekli 5 sa (hazırlık dahil). ');
    await waitFor(() => { expect(hedef).toHaveBeenLastCalledWith(expect.objectContaining({ adimId: x.eksik, fiil: 'tasi' })); });
    const kilitle = within(panel).getByRole('button', { name: 'Yerleştir ve kilitle' });
    expect(kilitle.hasAttribute('disabled')).toBe(true);
    fireEvent.click(yer[0]!);
    const t = yer[0]!.getAttribute('data-elle-yer')!;
    expect(panel.querySelector('[data-elle-secilen]')?.getAttribute('data-elle-secilen')).toBe(t);
    fireEvent.click(kilitle);
    expect(tasi).toHaveBeenCalledWith(x.eksik, t, expect.any(Number));
    expect(screen.queryByRole('group', { name: /için elle yerleştirme$/ })).toBeNull();
    expect(hedef).toHaveBeenLastCalledWith(null);
  });

  it('önceki adımı da yerleşmeyen adımda düğme yoktur, önce hangi adımın yerleşeceği yazar (Risk K1)', () => {
    const c0 = ornekCalisma(), plan = c0.plan as unknown as { ops: Record<string, { job: string }> };
    const iki = Object.keys(plan.ops).filter((id) => plan.ops[id]?.job === '3').sort().slice(-2);
    const ops = Object.fromEntries(Object.entries(plan.ops).filter(([id]) => !iki.includes(id)));
    const c = { ...c0, plan: { ...plan, ops, fail: iki } } as unknown as typeof c0;
    const p = planOku(c), m = modelKur(c, p, derle(girdiKur(c, plandanBitenler(c, p))), (id) => `ORN-${id}`);
    ciz({ m, p, kartlar: siraKartlari(m) }, '3', { tasi: vi.fn(), bol: vi.fn() });
    expect([...document.querySelectorAll('[data-elle-ac]')].map((b) => b.getAttribute('data-elle-ac'))).toEqual([iki[0]]);
    const sira = m.emirler.find((e) => e.id === '3')!.adimlar.findIndex((a) => a.id === iki[0]) + 1;
    expect(document.querySelector(`[data-once-yerlestir="${iki[1]!}"]`)?.textContent).toBe(`Önce ${String(sira)}. adımı yerleştirin; bu adım ondan sonra gelir.`);
  });

  it('malzemesi gelmeden başlayan yerde malzemenin gelişi yazar; seçilince kilitli adımın malzemeyi beklemediğini söyler', async () => {
    const x0 = yarimKur({ kod: 'zaman' });
    elleKur({ malzemeAni: { [x0.eksik]: 1e6 } });
    fireEvent.click(document.querySelector(`[data-elle-ac="${x0.eksik}"]`)!);
    const panel = screen.getByRole('group', { name: /için elle yerleştirme$/ });
    const yer = await within(panel).findAllByRole('button', { pressed: false, name: /→/ });
    expect(yer[0]!.querySelector('[data-elle-malzeme]')?.textContent).toBe(`malzeme ${zaman(1e6)} geliyor`);
    fireEvent.click(yer[0]!);
    expect(panel.querySelector('[data-elle-malzeme-uyari]')?.textContent).toContain('kilitli adım malzemeyi beklemez, plan uyarı verir');
    cleanup();
    elleKur({ malzemeAni: { [x0.eksik]: Infinity } });
    fireEvent.click(document.querySelector(`[data-elle-ac="${x0.eksik}"]`)!);
    const y2 = await within(screen.getByRole('group', { name: /için elle yerleştirme$/ })).findAllByRole('button', { pressed: false, name: /→/ });
    expect(y2[0]!.querySelector('[data-elle-malzeme]')?.textContent).toBe('malzeme eksik');
    cleanup();
    elleKur({ malzemeAni: { [x0.eksik]: 0 } });
    fireEvent.click(document.querySelector(`[data-elle-ac="${x0.eksik}"]`)!);
    const y3 = await within(screen.getByRole('group', { name: /için elle yerleştirme$/ })).findAllByRole('button', { pressed: false, name: /→/ });
    expect(y3[0]!.querySelector('[data-elle-malzeme]')).toBeNull();
  });

  it('tahtadaki yere basmak yeri seçer; Vazgeç paneli kapatır, komut yazılmaz', async () => {
    const { x, tasi, hedef } = elleKur();
    fireEvent.click(document.querySelector(`[data-elle-ac="${x.eksik}"]`)!);
    await waitFor(() => { expect(hedef).toHaveBeenLastCalledWith(expect.objectContaining({ adimId: x.eksik })); });
    const h = hedef.mock.calls.at(-1)![0] as { yerler: { tezgah: string }[]; yerlestir: (t: string) => void };
    act(() => { h.yerlestir(h.yerler[0]!.tezgah); });
    expect(document.querySelector('[data-elle-secilen]')?.getAttribute('data-elle-secilen')).toBe(h.yerler[0]!.tezgah);
    fireEvent.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(screen.queryByRole('group', { name: /için elle yerleştirme$/ })).toBeNull();
    expect(tasi).not.toHaveBeenCalled();
  });
});

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

  // 3526: sahadan bildirilen bekleme ve uzama adımın satırında yazar; eski düzendeki adım tablosuyla aynı cümle.
  it('bildirilen bekleme başlamamış adımın satırında nedeni ve anıyla, uzama adımın satırında yazar; başlamış adımın beklemesi, yeri olmayan adım ve bildirim yokken yazmaz', () => {
    const x = kur();
    // 2.20 süren iştir; 2.40 başlamamıştır.
    expect([x.m.isler['2.20']?.basladi, x.m.isler['2.40']?.basladi]).toEqual([true, false]);
    ciz(x, '2');
    expect(document.querySelector('[data-adim-bekle], [data-adim-ek]')).toBeNull();
    cleanup();
    ciz(x, '2', { adimBekle: { '2.40': { kadar: 9000, neden: 'malzeme' }, '2.20': { kadar: 9000, neden: 'kisi' }, '2.30': { kadar: 9000.4, neden: 'kisi', ust: '3' } }, adimEk: { '2.20': 1.5, '2.40': 0.254 } });
    const yazi = (q: string) => [...document.querySelectorAll(q)].map((y) => [y.closest('li')?.querySelector('span')?.textContent.replace(/^\d+\. /, ''), y.textContent]);
    const ad = (id: string) => x.m.emirler.find((e) => e.id === '2')!.adimlar.find((a) => a.id === id)!.ad;
    expect(x.m.isler['2.30']?.basladi).toBe(false);
    expect(yazi('[data-adim-bekle]')).toEqual([[ad('2.30'), "bekliyor: kişi yok, 01.01 9000'e kadar · üst emirden (ORN-3)"], [ad('2.40'), "bekliyor: malzeme yok, 01.01 9000'e kadar"]]);
    expect(yazi('[data-adim-ek]')).toEqual([[ad('2.20'), 'uzadı +1,5 sa'], [ad('2.40'), 'uzadı +0,25 sa']]);
    // Not adımın düğmesinin içindedir: basınca adım seçilir.
    expect(document.querySelector('[data-adim-bekle="2.40"]')?.closest('button')?.getAttribute('data-adim')).toBe('2.40');
    cleanup();
    const y = yarimKur({ kod: 'zaman' });
    ciz(y, '3', { adimBekle: { [y.eksik]: { kadar: 9000, neden: 'malzeme' } }, adimEk: { [y.eksik]: 2 } });
    expect(document.querySelector(`[data-yeri-yok="${y.eksik}"]`)).not.toBeNull();
    expect(document.querySelector('[data-adim-bekle], [data-adim-ek]')).toBeNull();
  });

  it('3484 c: ufuk sonrasına uzayan adım ufuk sonrası saatini yazar; eski kayıttaki ardıl nedenini söyler', () => {
    const c0 = ornekCalisma(), plan = c0.plan as unknown as { ops: Record<string, { job: string }> };
    const ids = Object.keys(plan.ops).filter((id) => plan.ops[id]?.job === '3').sort();
    const [ilk, son] = [ids[0] as string, ids.at(-1) as string];
    const { [son]: _cikan, ...kalan } = plan.ops;
    const c = { ...c0, plan: { ...plan, ops: { ...kalan, [ilk]: { ...kalan[ilk], ufukDisi: 6 } }, fail: [son], failNeden: { [son]: { kod: 'oncul', oncul: ilk, ufukDisi: 1 } } } } as unknown as typeof c0;
    const p = planOku(c), m = modelKur(c, p, derle(girdiKur(c, plandanBitenler(c, p))), (id) => `ORN-${id}`);
    ciz({ m, p, kartlar: siraKartlari(m) }, '3');
    expect(document.querySelector(`.tc-pyq-ld-adimlar button[data-adim="${ilk}"]`)?.textContent).toContain('ufuk sonrasında 6 sa çalışma');
    expect(document.querySelector(`[data-yeri-yok="${son}"]`)?.textContent).toContain('planlama süresinin dışına taşıyor');
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

  // 3528: adıma sorun bildirme (uzadı, malzeme yok, kişi yok) açılış düzeninden de açılır; düğme adımın satırının sonundadır.
  it('planda yeri olan, fason olmayan adımın satırının sonunda sorun bildir düğmesi vardır ve basınca o adımı bildirir; fason adımda, yeri olmayan adımda ve yazamayan kişide yoktur', () => {
    const x = kur(), adimSorunu = vi.fn(), adimSec = vi.fn();
    const e = x.m.emirler.find((y) => y.id === '2')!;
    const fason = e.adimlar.filter((a) => x.m.isler[a.id]?.fason).map((a) => a.id), tezgahli = e.adimlar.filter((a) => x.m.isler[a.id] && !x.m.isler[a.id]!.fason);
    expect([fason.length > 0, tezgahli.length > 1]).toEqual([true, true]);
    ciz(x, '2', { adimSorunu, adimSec });
    const dugmeler = [...document.querySelectorAll<HTMLElement>('[data-adim-sorun]')];
    expect(dugmeler.map((d) => [d.getAttribute('data-adim-sorun'), d.getAttribute('aria-label'), d.previousElementSibling?.getAttribute('data-adim'), d.closest('li')?.lastElementChild === d]))
      .toEqual(tezgahli.map((a) => [a.id, `${a.ad} için sorun bildir`, a.id, true]));
    fireEvent.click(dugmeler.at(-1)!);
    expect(adimSorunu.mock.calls).toEqual([[tezgahli.at(-1)!.id]]);
    expect(adimSec).not.toHaveBeenCalled();
    cleanup();
    ciz(x, '2');
    expect(document.querySelector('[data-adim-sorun]')).toBeNull();
    cleanup();
    ciz(x, '2', { adimSorunu: null });
    expect(document.querySelector('[data-adim-sorun]')).toBeNull();
    cleanup();
    const y = yarimKur({ kod: 'zaman' });
    ciz(y, '3', { adimSorunu });
    expect(document.querySelector(`[data-adim-sorun="${y.eksik}"]`)).toBeNull();
    expect(document.querySelectorAll('[data-adim-sorun]').length).toBeGreaterThan(0);
  });

  it('süzgeçle eşleşen sipariş yoksa bunu söyler', () => {
    ciz({ ...kur(), kartlar: [] }, null);
    expect(screen.getByText('Bu süzgeçle eşleşen sipariş ya da emir yok.')).toBeTruthy();
  });
});

// 3483: partinin plandaki kimliği kendi emir kimliğidir; kökünü numarası söyler ("<kök no>/<n>"). Burada 3, 2'nin 1. partisidir.
describe('partiye bölünen emir (3483)', () => {
  const partili = (c: ReturnType<typeof ornekCalisma>, p: ReturnType<typeof planOku>) =>
    modelKur(c, p, derle(girdiKur(c, plandanBitenler(c, p))), (id) => (id === '3' ? 'ORN-2/1' : `ORN-${id}`));

  it('parti ana emrin kartında toplanır; satır emir ve partiyi ayrı sayar, açık satırda her emir başlığıyla ayrı öbektir', () => {
    const c = ornekCalisma(), p = planOku(c), m = partili(c, p), kartlar = siraKartlari(m);
    expect(kartlar.map((k) => k.kok)).toEqual(['2']);
    expect(kartlar[0]?.emirler.map((e) => e.no)).toEqual(['ORN-2', 'ORN-2/1']);
    ciz({ m, p, kartlar }, '2');
    expect(document.querySelector('[data-kart="2"]')?.textContent).toContain('1 emir, 1 parti');
    const obekler = [...document.querySelectorAll<HTMLElement>('.tc-pyq-ld-emir')];
    expect(obekler.map((o) => o.querySelector('.tc-pyq-ld-emir-bas b')?.textContent)).toEqual(['ORN-2', 'ORN-2/1']);
    // Adım satırı emir no taşımaz; emir başlıktadır.
    expect(obekler[1]?.querySelector('.tc-pyq-ld-adimlar li span')?.textContent).toMatch(/^1\. /);
    expect(obekler[1]?.querySelector('.tc-pyq-ld-emir-bas small')?.textContent).toContain(`${String(m.emirler.find((e) => e.id === '3')?.adet)} adet`);
  });

  // 3523: adım ortasından bölünen partinin bağı partinin öbeğinde, bekleme üst emrin katılma adımında yazar.
  it('adım ortasından bölünen partinin notu öbeğinde, üst emrin katılma adımında bekleme yazar; not verilmezse ve başlamış adımda yoktur', () => {
    const c = ornekCalisma(), p = planOku(c), m = partili(c, p), kartlar = siraKartlari(m);
    const { unmount } = render(<ListeDuzeni m={m} p={p} kartlar={kartlar} acik="2" ac={vi.fn()} zaman={zaman} mesgul={false} planla={null} yenidenPlanla={null} hamle={null} surum={4} tahta={null} satirBirincil adimSec={vi.fn()} seciliIs={null} />);
    expect(document.querySelector('[data-emir-kol], [data-adim-parti]')).toBeNull();
    unmount();
    // 2.20 süren iştir; 2.40 başlamamıştır.
    expect([m.isler['2.20']?.basladi, m.isler['2.40']?.basladi]).toEqual([true, false]);
    const kol = { emir: { 3: 'Torna adımını üst emir (ORN-2) yapar; bu parti Freze adımından başlar.' }, adim: { '2.20': 'bekliyor: parti x', '2.40': 'bekliyor: parti ORN-2/1' } };
    ciz({ m, p, kartlar }, '2', { kol });
    expect([...document.querySelectorAll('[data-emir-kol]')].map((x) => [x.closest('[data-emir]')?.getAttribute('data-emir'), x.textContent])).toEqual([['3', kol.emir[3]]]);
    expect([...document.querySelectorAll('[data-adim-parti]')].map((x) => [x.closest('[data-emir]')?.getAttribute('data-emir'), x.closest('li')?.querySelector('span')?.textContent, x.textContent]))
      .toEqual([['2', expect.stringMatching(/^\d+\. /), 'bekliyor: parti ORN-2/1']]);
  });

  // 3522: bitişi planlı duruşların okunduğu pencerenin ötesinde kalan emir, bitişin erken görünebileceğini söyler.
  it('bitişi bir yıldan ileride olan emrin öbeğinde duruşların okunmadığı yazar; öteki emirde ve pencere içinde yoktur', () => {
    const c = ornekCalisma(), p = planOku(c), m0 = partili(c, p);
    const uzak = (id: string, bitis: number) => ({ ...m0, emirler: m0.emirler.map((e) => (e.id === id ? { ...e, bitis } : e)) });
    const NOT = 'Bitiş bir yıldan ileride; o tarihlerdeki planlı duruşlar hesaba katılmadı, bitiş daha geç olabilir.';
    const sinir = (Math.floor(m0.simdi / 24) + 367) * 24;
    const notlar = () => [...document.querySelectorAll('[data-durus-okunmadi]')].map((x) => [x.closest('[data-emir]')?.getAttribute('data-emir'), x.textContent, x.previousElementSibling?.className]);
    ciz({ m: m0, p, kartlar: siraKartlari(m0) }, '2');
    expect(notlar()).toEqual([]);
    cleanup();
    const m1 = uzak('3', sinir + 1);
    ciz({ m: m1, p, kartlar: siraKartlari(m1) }, '2', { kol: { emir: { 3: 'Parti notu.' }, adim: {} } });
    // Emir başına tek satır, başlığın hemen altında; partinin notu ondan sonra gelir.
    expect(notlar()).toEqual([['3', NOT, 'tc-pyq-ld-emir-bas']]);
    expect(document.querySelector('[data-emir="3"] [data-durus-okunmadi] + [data-emir-kol]')).not.toBeNull();
    cleanup();
    const m2 = uzak('3', sinir);
    ciz({ m: m2, p, kartlar: siraKartlari(m2) }, '2');
    expect(notlar()).toEqual([]);
    cleanup();
    // Pencere planın başından değil bugünden sayılır: iki gün sonra aynı bitiş pencerenin içindedir.
    const m3 = { ...m1, simdi: m0.simdi + 48 };
    ciz({ m: m3, p, kartlar: siraKartlari(m3) }, '2');
    expect(notlar()).toEqual([]);
  });

  it('tek emirli satırda bitişi bir yıldan ileride olan emrin notu adımların üstünde durur', () => {
    const x = kur(), sinir = (Math.floor(x.m.simdi / 24) + 367) * 24;
    const m = { ...x.m, emirler: x.m.emirler.map((e) => (e.id === '2' ? { ...e, bitis: sinir + 100 } : e)) };
    ciz({ m, p: x.p, kartlar: siraKartlari(m) }, '2');
    expect(document.querySelector('.tc-pyq-ld-kart[data-acik] [data-durus-okunmadi] + .tc-pyq-ld-adimlar')).not.toBeNull();
    expect(document.querySelectorAll('[data-durus-okunmadi]')).toHaveLength(1);
    cleanup();
    // Partinin notu da varsa sıra aynıdır: önce emrin notu, sonra partinin notu, sonra adımlar.
    ciz({ m, p: x.p, kartlar: siraKartlari(m) }, '2', { kol: { emir: { 2: 'Parti notu.' }, adim: {} } });
    expect(document.querySelector('.tc-pyq-ld-kart[data-acik] [data-durus-okunmadi] + [data-emir-kol] + .tc-pyq-ld-adimlar')).not.toBeNull();
  });

  it('tek emirli satırda da partinin notu adımların üstünde durur', () => {
    const x = kur();
    ciz(x, '2', { kol: { emir: { 2: 'Not.' }, adim: {} } });
    expect(document.querySelector('.tc-pyq-ld-kart[data-acik] [data-emir-kol] + .tc-pyq-ld-adimlar')).not.toBeNull();
    expect(document.querySelector('[data-emir-kol]')?.textContent).toBe('Not.');
  });

  it('yerleşmeyen adımı tutan önceki adım planda varsa adıma basınca o adım seçilir', () => {
    const x = yarimKur({ kod: 'oncul', oncul: '__', ufukDisi: 1 });
    const kalan = Object.keys(x.m.isler).filter((id) => x.m.isler[id]?.job === '3').sort().at(-1) as string;
    const c = ornekCalisma(), plan = c.plan as unknown as { ops: Record<string, unknown> };
    const { [x.eksik]: _c, ...ops } = plan.ops;
    const c2 = { ...c, plan: { ...plan, ops, fail: [x.eksik], failNeden: { [x.eksik]: { kod: 'oncul', oncul: kalan, ufukDisi: 1 } } } } as unknown as typeof c;
    const p = planOku(c2), m = modelKur(c2, p, derle(girdiKur(c2, plandanBitenler(c2, p))), (id) => `ORN-${id}`);
    const adimSec = vi.fn();
    ciz({ m, p, kartlar: siraKartlari(m) }, '3', { adimSec });
    const d = document.querySelector<HTMLButtonElement>(`button[data-adim="${x.eksik}"]`);
    expect(d?.dataset['engel']).toBe(kalan);
    expect(d?.hasAttribute('aria-pressed')).toBe(false);
    fireEvent.click(d!);
    expect(adimSec).toHaveBeenCalledWith('3', kalan);
  });

  it('nedeni öncül olmayan yerleşmeyen adım düğme değildir', () => {
    const x = yarimKur({ kod: 'aday' });
    ciz(x, '3');
    expect(document.querySelector(`button[data-adim="${x.eksik}"]`)).toBeNull();
  });
});

describe('Planla düğmesinin geri bildirimi', () => {
  it('basılan Planla iş sürerken döner ve "Planlanıyor" der; iş bitince eski haline döner', () => {
    const x = yarimKur({ kod: 'aday' });
    const { planla } = ciz(x, '3');
    fireEvent.click(screen.getByRole('button', { name: 'Planla' }));
    expect(planla).toHaveBeenCalled();
    cleanup();
    const ac = vi.fn();
    const { rerender } = render(<ListeDuzeni m={x.m} p={x.p} kartlar={x.kartlar} acik="3" ac={ac} zaman={zaman} mesgul={false} planla={vi.fn()} yenidenPlanla={null} hamle={null} surum={4} tahta={null} satirBirincil adimSec={vi.fn()} seciliIs={null} />);
    const o = (mesgul: boolean) => <ListeDuzeni m={x.m} p={x.p} kartlar={x.kartlar} acik="3" ac={ac} zaman={zaman} mesgul={mesgul} planla={vi.fn()} yenidenPlanla={null} hamle={null} surum={4} tahta={null} satirBirincil adimSec={vi.fn()} seciliIs={null} />;
    fireEvent.click(screen.getByRole('button', { name: 'Planla' }));
    rerender(o(true));
    const d = screen.getByRole('button', { name: 'Planlanıyor' });
    expect(d.getAttribute('aria-busy')).toBe('true');
    rerender(o(false));
    expect(screen.getByRole('button', { name: 'Planla' }).hasAttribute('aria-busy')).toBe(false);
  });
});
