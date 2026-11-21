import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ornekCalisma } from '../motor/ornek.ts';
import { planKurSifirla } from '../motor/coz.ts';
import { saatYaz } from '../motor/kurallar.ts';
import { girdiSaati } from '../ic/veri/kurallar.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { AdimSorunu, ekSaatOku } from './AdimSorunu.tsx';
import type { AdimBeklemesi, KokpitModeli } from './kurallar.ts';
import { sahteTaslak } from './taslak-test-yardim.ts';

// 3335-3b: adıma sorun bildirme paneli. Çalışma uydurmadır; taslak sahtedir.
afterEach(() => { cleanup(); vi.restoreAllMocks(); planKurSifirla(); });

const M = {
  isler: { 'ORN-1.10': { id: 'ORN-1.10', job: 'ORN-1', ad: 'Tornalama', m: 'ORN-T1', S: 20, C: 34, basladi: true, fason: false, kilitli: false, sira: 0 } },
  emirler: [{ id: 'ORN-1', no: 'ORN-0001', adimlar: [{ id: 'ORN-1.10' }] }],
  tezgahlar: [{ id: 'ORN-T1', kod: 'T1', ad: 'Torna', fason: false }],
  simdi: 10,
} as unknown as Pick<KokpitModeli, 'isler' | 'emirler' | 'tezgahlar' | 'simdi'>;
// Başlamamış adım: malzeme ve kişi yokluğu yalnız ona bildirilir.
const M_BEKLER = { ...M, isler: { 'ORN-1.10': { ...M.isler['ORN-1.10']!, basladi: false } } };

function kur({ yazabilir = true, ek = null as number | null, isId = 'ORN-1.10', m = M, bekle = null as { kadar: number; neden: string } | null, ust = null as AdimBeklemesi | null, ustAc = undefined as ((isId: string) => void) | undefined, taslakYok = false } = {}) {
  const c = ornekCalisma() as unknown as PlanlamaCalismasi;
  if (ek !== null) (c.w as Record<string, unknown>)['adimEk'] = { 'ORN-1.10': { ekSaat: ek, bitis0: 34 } };
  if (bekle !== null) (c.w as Record<string, unknown>)['adimBekle'] = { 'ORN-1.10': bekle };
  const { t, yazilan } = sahteTaslak(c.dataVer);
  const kapat = vi.fn();
  render(<AdimSorunu c={c} m={m} isId={isId} taslak={taslakYok ? null : t} yazabilir={yazabilir} zaman={(x) => saatYaz(c.D, x)} kapat={kapat} ustBekleme={ust} {...(ustAc ? { ustAc } : {})} />);
  return { c, t, yazilan, kapat, panel: screen.getByRole('complementary', { name: 'Adıma sorun bildir' }) };
}

describe('Kokpit adıma sorun bildir (3335-3b)', () => {
  it('girilen saati okur: virgül kabul edilir; çeyrek saatin katı olmayan ve aralık dışı değer reddedilir', () => {
    expect(ekSaatOku('2')).toBe(2);
    expect(ekSaatOku(' 1,25 ')).toBe(1.25);
    expect(ekSaatOku('240')).toBe(240);
    for (const v of ['', 'x', '0', '0.1', '0.3', '240.25', '-1']) expect(ekSaatOku(v)).toBeNull();
  });

  it('adımı, tezgâhını ve planlanan bitişini gösterir; süre alanı odaktadır; kayıt yokken kaldırma düğmesi yoktur', () => {
    const { panel, kapat } = kur();
    expect(panel.querySelector('dl')?.textContent).toBe('OperasyonORN-0001 · TornalamaTezgâhT1Plandaki bitiş20.10 Sal 10:00Bildirilen uzamayokBildirilen beklemeyok');
    expect(document.activeElement).toBe(within(panel).getByLabelText('Kaç saat uzadı'));
    expect(within(panel).queryByRole('button', { name: 'Uzamayı kaldır' })).toBeNull();
    fireEvent.click(within(panel).getByRole('button', { name: 'Adıma sorun bildirmeyi kapat' }));
    expect(kapat).toHaveBeenCalled();
  });

  it('geçersiz süre komut yazmaz, nedenini söyler; geçerli süre taslağa komut yazar, etkisini gösterir; Uygula dizmeyi yazar', async () => {
    const { t, yazilan, panel } = kur();
    const alan = within(panel).getByLabelText('Kaç saat uzadı');
    fireEvent.change(alan, { target: { value: '0.1' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Etkisini gör' }));
    expect(within(panel).getByRole('alert').textContent).toBe('Uzamayı 0,25 ile 240 saat arasında, çeyrek saat adımıyla girin.');
    expect(alan.getAttribute('aria-invalid')).toBe('true');
    expect(yazilan).toEqual([]);
    fireEvent.change(alan, { target: { value: '2,5' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Etkisini gör' }));
    const etki = await screen.findByRole('region', { name: 'Uzamanın etkisi' });
    expect(yazilan).toEqual([{ tur: 'adim-uzadi', isId: 'ORN-1.10', ekSaat: 2.5 }]);
    expect(t.degerlendir).toHaveBeenCalledWith({ tur: 'plan-uygula', isler: ['*'] });
    expect(within(panel).queryByRole('button', { name: 'Etkisini gör' })).toBeNull();
    fireEvent.click(within(etki).getByRole('button', { name: 'Uygula' }));
    await vi.waitFor(() => { expect(t.dizmeyiYaz).toHaveBeenCalledWith('ORN-is'); });
  });

  it('etkide Vazgeç komutu taslaktan geri alır, form geri gelir', async () => {
    const { t, panel } = kur();
    fireEvent.change(within(panel).getByLabelText('Kaç saat uzadı'), { target: { value: '1' } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Etkisini gör' }));
    fireEvent.click(within(await screen.findByRole('region', { name: 'Uzamanın etkisi' })).getByRole('button', { name: 'Vazgeç' }));
    await vi.waitFor(() => { expect(t.geriAl).toHaveBeenCalledWith(false, false); });
    expect(await within(panel).findByRole('button', { name: 'Etkisini gör' })).toBeTruthy();
  });

  it('bildirilmiş uzama yazar, alan onunla dolu gelir; Uzamayı kaldır silme komutunu yazar', async () => {
    const { yazilan, panel } = kur({ ek: 1.5 });
    expect(panel.querySelector('[data-adim-ek]')?.textContent).toBe('+1,5 sa');
    expect((within(panel).getByLabelText('Toplam kaç saat uzadı') as HTMLInputElement).value).toBe('1,5');
    fireEvent.click(within(panel).getByRole('button', { name: 'Uzamayı kaldır' }));
    await screen.findByRole('region', { name: 'Uzamanın etkisi' });
    expect(yazilan).toEqual([{ tur: 'adim-uzadi-sil', isId: 'ORN-1.10' }]);
  });

  it('yazamayan kişide form yoktur, nedeni yazar; planda yeri olmayan adımda yalnız açıklama durur', () => {
    const { panel } = kur({ yazabilir: false });
    expect(within(panel).queryByRole('textbox')).toBeNull();
    expect(within(panel).getByText('Adıma sorunu yalnız planı yazabilen kişi bildirir.')).toBeTruthy();
    expect(document.activeElement).toBe(panel);
    cleanup();
    // Taslak yokken alan durur ama kilitlidir; kilitli alan odak almaz.
    const { panel: taslaksiz } = kur({ taslakYok: true });
    expect(within(taslaksiz).getByRole<HTMLInputElement>('textbox').disabled).toBe(true);
    expect(document.activeElement).toBe(taslaksiz);
    cleanup();
    const { panel: bos } = kur({ isId: 'ORN-9.10' });
    expect(within(bos).getByText('Bu adım planda yerleşmemiş; önce plana alın.')).toBeTruthy();
    expect(within(bos).queryByRole('textbox')).toBeNull();
  });
});

describe('Kokpit adıma sorun bildir: malzeme yok ve kişi yok (3335-3c)', () => {
  const tur = (panel: HTMLElement) => within(panel).getByLabelText('Sorun') as HTMLSelectElement;

  it('başlamış adımda Malzeme yok ve Kişi yok seçilemez, nedeni yazar; başlamamış adımda üç tür de seçilir', () => {
    const { panel } = kur();
    expect([...tur(panel).options].map((o) => [o.textContent, o.disabled])).toEqual([['Adım uzadı', false], ['Malzeme yok', true], ['Kişi yok', true]]);
    expect(within(panel).getByText('Adım başlamış; malzeme ya da kişi yokluğu başlamamış adıma bildirilir.')).toBeTruthy();
    cleanup();
    const { panel: p2 } = kur({ m: M_BEKLER });
    expect([...tur(p2).options].map((o) => o.disabled)).toEqual([false, false, false]);
    expect(within(p2).queryByText(/Adım başlamış/)).toBeNull();
  });

  it('Malzeme yok: geliş tarih ve saati sorulur, öneri ertesi gündür; geçmiş an komut yazmaz; geçerli an taslağa plan ekseninde saat olarak yazılır ve etkisi gösterilir', async () => {
    const { c, t, yazilan, panel } = kur({ m: M_BEKLER });
    fireEvent.change(tur(panel), { target: { value: 'malzeme' } });
    const alan = within(panel).getByLabelText('Malzeme ne zaman gelir') as HTMLInputElement;
    expect(alan.type).toBe('datetime-local');
    expect(alan.value).toBe(girdiSaati(c.D, 34));
    expect(within(panel).queryByLabelText('Kaç saat uzadı')).toBeNull();
    fireEvent.change(alan, { target: { value: girdiSaati(c.D, 9) } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Etkisini gör' }));
    expect(within(panel).getByRole('alert').textContent).toBe('Şimdiden sonraki bir tarih ve saat girin.');
    expect(yazilan).toEqual([]);
    fireEvent.change(alan, { target: { value: girdiSaati(c.D, 56.5) } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Etkisini gör' }));
    const etki = await screen.findByRole('region', { name: 'Beklemenin etkisi' });
    expect(yazilan).toEqual([{ tur: 'adim-bekler', isId: 'ORN-1.10', kadar: 56.5, neden: 'malzeme' }]);
    expect(t.degerlendir).toHaveBeenCalledWith({ tur: 'plan-uygula', isler: ['*'] });
    fireEvent.click(within(etki).getByRole('button', { name: 'Uygula' }));
    await vi.waitFor(() => { expect(t.dizmeyiYaz).toHaveBeenCalledWith('ORN-is'); });
  });

  it('Kişi yok: "Ne zamana kadar" sorulur; an çeyrek saate yuvarlanır; komut kişi nedeniyle yazılır; Vazgeç geri alır', async () => {
    const { c, t, yazilan, panel } = kur({ m: M_BEKLER });
    fireEvent.change(tur(panel), { target: { value: 'kisi' } });
    // Çeyrek saate düşmeyen an (07 dakika) en yakın çeyreğe yuvarlanır: motorun dilimi çeyrek saattir, sözleşme başkasını reddeder.
    fireEvent.change(within(panel).getByLabelText('Ne zamana kadar'), { target: { value: girdiSaati(c.D, 40 + 7 / 60) } });
    fireEvent.click(within(panel).getByRole('button', { name: 'Etkisini gör' }));
    fireEvent.click(within(await screen.findByRole('region', { name: 'Beklemenin etkisi' })).getByRole('button', { name: 'Vazgeç' }));
    expect(yazilan).toEqual([{ tur: 'adim-bekler', isId: 'ORN-1.10', kadar: 40, neden: 'kisi' }]);
    await vi.waitFor(() => { expect(t.geriAl).toHaveBeenCalledWith(false, false); });
  });

  it('bildirilmiş bekleme özetle yazar, panel o türle ve o anla açılır; Bildirimi kaldır silme komutunu yazar; geçmişte kalan kayıt gösterilmez', async () => {
    const { c, yazilan, panel } = kur({ m: M_BEKLER, bekle: { kadar: 58, neden: 'kisi' } });
    expect(panel.querySelector('[data-adim-bekle]')?.textContent).toBe(`kişi yok, ${saatYaz(c.D, 58)}'e kadar`);
    expect(tur(panel).value).toBe('kisi');
    expect((within(panel).getByLabelText('Ne zamana kadar') as HTMLInputElement).value).toBe(girdiSaati(c.D, 58));
    expect(document.activeElement).toBe(within(panel).getByLabelText('Ne zamana kadar'));
    fireEvent.click(within(panel).getByRole('button', { name: 'Bildirimi kaldır' }));
    await screen.findByRole('region', { name: 'Beklemenin etkisi' });
    expect(yazilan).toEqual([{ tur: 'adim-bekler-sil', isId: 'ORN-1.10' }]);
    cleanup();
    const { panel: gecmis } = kur({ m: M_BEKLER, bekle: { kadar: 8, neden: 'malzeme' } });
    expect(gecmis.querySelector('[data-adim-bekle]')?.textContent).toBe('yok');
    expect(within(gecmis).queryByRole('button', { name: 'Bildirimi kaldır' })).toBeNull();
  });

  // 3513: partinin adımında üst emrin beklemesi geçerliyse form "yok" demez; kaynağını ve nereden kaldırılacağını söyler.
  describe('üst emirden gelen bekleme (3513)', () => {
    const M_PARTI = {
      ...M_BEKLER,
      isler: { ...M_BEKLER.isler, 'ORN-2.10': { ...M_BEKLER.isler['ORN-1.10']!, id: 'ORN-2.10', job: 'ORN-2' } },
      emirler: [{ id: 'ORN-1', no: 'ORN-0001', adimlar: [{ id: 'ORN-1.10' }] }, { id: 'ORN-2', no: 'ORN-0002', adimlar: [{ id: 'ORN-2.10' }] }],
    } as unknown as typeof M;
    const UST: AdimBeklemesi = { kadar: 58, neden: 'malzeme', ust: 'ORN-2' };

    it('özet ve bilgi kutusu üst emri ve beklemeyi yazar; düğme üst emrin aynı adımını açar; sorun türü uzama olarak açılır', () => {
      const ustAc = vi.fn();
      const { c, panel } = kur({ m: M_PARTI, ust: UST, ustAc });
      expect(panel.querySelector('[data-adim-bekle]')?.textContent).toBe('üst emirden (ORN-0002)');
      expect(panel.querySelector('[data-adim-bekle]')?.getAttribute('data-adim-bekle')).toBe('ust');
      expect(panel.querySelector('[data-ust-bekleme="ORN-2"]')?.textContent)
        .toBe(`Üst emrin (ORN-0002) beklemesi bu adımda da geçerli: malzeme yok, ${saatYaz(c.D, 58)}'e kadar. Kaldırmak için üst emrin adımında kaldırın.`);
      expect(tur(panel).value).toBe('uzadi');
      expect(within(panel).queryByRole('button', { name: 'Bildirimi kaldır' })).toBeNull();
      fireEvent.click(within(panel).getByRole('button', { name: 'Üst emrin adımını aç' }));
      expect(ustAc).toHaveBeenCalledWith('ORN-2.10');
    });

    it('bekleme türü seçilince ayrı beklemenin üst emrinkinin yerine geçeceği yazar; uzamada yazmaz', () => {
      const { panel } = kur({ m: M_PARTI, ust: UST });
      const not = () => panel.querySelector('#tc-pyq-adim-ek-not')?.textContent ?? '';
      expect(not()).not.toContain('üst emrinkinin');
      fireEvent.change(tur(panel), { target: { value: 'malzeme' } });
      expect(not().endsWith(' Bu partiye ayrı bekleme girerseniz üst emrinkinin yerine o geçer.')).toBe(true);
    });

    it('partinin kendi beklemesi varsa ya da adım başladıysa kutu yoktur; üst emrin adımı planda yoksa düğme yoktur', () => {
      const { c, panel } = kur({ m: M_PARTI, ust: UST, bekle: { kadar: 40, neden: 'kisi' } });
      expect(panel.querySelector('[data-ust-bekleme]')).toBeNull();
      expect(panel.querySelector('[data-adim-bekle]')?.textContent).toBe(`kişi yok, ${saatYaz(c.D, 40)}'e kadar`);
      cleanup();
      const { panel: baslamis } = kur({ m: { ...M_PARTI, isler: { ...M_PARTI.isler, 'ORN-1.10': M.isler['ORN-1.10']! } }, ust: UST });
      expect(baslamis.querySelector('[data-ust-bekleme]')).toBeNull();
      expect(baslamis.querySelector('[data-adim-bekle]')?.textContent).toBe('yok');
      cleanup();
      const { panel: plansiz } = kur({ m: M_BEKLER, ust: UST, ustAc: vi.fn() });
      expect(plansiz.querySelector('[data-ust-bekleme]')?.textContent).toContain('Üst emrin (ORN-2)');
      expect(within(plansiz).queryByRole('button', { name: 'Üst emrin adımını aç' })).toBeNull();
    });
  });
});
