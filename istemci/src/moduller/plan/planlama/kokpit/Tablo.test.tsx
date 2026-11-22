import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { PLANLAMA_ISLEMI } from '../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import { saatiSabitle } from '../test-saati.ts';
import type { PlanlamaDeposu } from '../veri.ts';
import { yetkiKur } from '../yetki.ts';
import { Kokpit } from './index.tsx';
import { AYAR_ANAHTARI } from './tablo.ts';

// Kart 3533: Emirler ve Tezgâhlar gözünün sol tablosu. Veri uydurmadır (ORN-); sunucu çağrısı yoktur.
saatiSabitle(ornekCalisma);
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); localStorage.clear(); });

const DEPO = { durum: null, planSurumu: null, senaryolar: null, calismaSurumu: 4, receteRotaKaydi: null } as unknown as PlanlamaDeposu;
const degistir = vi.fn(() => false);
function komutKur(): CalismaKomutu {
  return {
    degistir, geriAl: vi.fn(() => true), geriAlinabilir: () => false, geriAdimlari: () => [], geriDon: () => true, yinele: vi.fn(() => true), yinelenebilir: () => false, kaydet: () => Promise.resolve(4),
  };
}
function ac() {
  degistir.mockClear();
  render(
    <MemoryRouter initialEntries={['/']}><BildirimSaglayici>
      <Kokpit
        depo={DEPO} calisma={ornekCalisma()} komut={komutKur()} git={vi.fn()} yenile={vi.fn()} yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz'])}
        olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={BOS_SECIM} sec={vi.fn()}
      />
    </BildirimSaglayici></MemoryRouter>,
  );
  return screen.getByRole('region', { name: 'Emirler' });
}
const basliklar = (kok: HTMLElement): string[] => within(kok).getAllByRole('columnheader').map((x) => x.textContent ?? '');
const sira = (kok: HTMLElement): string[] => [...kok.querySelectorAll<HTMLElement>('button[data-agac]')].map((b) => b.getAttribute('data-agac') ?? '');
const kayitli = (): { sutunlar: string[] | null; en: number | null } | null => { const h = localStorage.getItem(AYAR_ANAHTARI); return h === null ? null : JSON.parse(h) as { sutunlar: string[] | null; en: number | null }; };

describe('Kokpit sol tablo (3533)', () => {
  it('Emirler gözünde sol bölme sütunludur: başlıklar, emir hücresi açma düğmesi, fark rozeti ve tamamlanma dairesi', () => {
    const bolum = ac();
    expect(within(bolum).getByRole('table', { name: 'Emirler' })).toBeTruthy();
    expect(basliklar(bolum)).toEqual(['Emir', 'Ürün', 'Adet', 'Termin', 'Plan bitiş', 'Fark', 'İlerleme']);
    const ilk = bolum.querySelector<HTMLButtonElement>('button[data-agac]')!;
    expect(ilk.getAttribute('aria-label')).toMatch(/adımlarını aç$/);
    const satir = ilk.closest<HTMLElement>('[role="row"]')!;
    expect(satir.querySelectorAll('[role="cell"]').length).toBe(7);
    expect(bolum.querySelector('.tc-pyq-fark[data-ton]')).not.toBeNull();
    const halka = bolum.querySelector('.tc-pyq-tablo-satir svg.tc-pyq-halka');
    expect(halka?.getAttribute('aria-label')).toMatch(/^\d+\/\d+ adım bitti$/);
  });

  it('tek Sıralama seçici iki seçenek taşır; Termine göre gecikme en gecikmeliyi üste alır, Plan sırası geri getirir; hiçbir yazım yapılmaz (Risk B2)', () => {
    const bolum = ac();
    const secici = within(bolum).getByRole('combobox', { name: 'Sıralama' });
    expect([...secici.querySelectorAll('option')].map((o) => o.textContent)).toEqual(['Plan sırası', 'Termine göre gecikme']);
    expect((secici as HTMLSelectElement).value).toBe('plan');
    const plan = sira(bolum);
    fireEvent.change(secici, { target: { value: 'gecikme' } });
    const gecikme = sira(bolum);
    expect([...gecikme].sort()).toEqual([...plan].sort());
    // Fark sütunu: geç olanlar (rozet tonu "gec") rozetsiz ya da zamanında olanlardan önce gelir.
    const tonlar = [...bolum.querySelectorAll<HTMLElement>('button[data-agac]')].map((b) => b.closest('[role="row"]')!.querySelector('.tc-pyq-fark')?.getAttribute('data-ton') ?? 'yok');
    const sonGec = tonlar.lastIndexOf('gec'), ilkDiger = tonlar.findIndex((t) => t !== 'gec');
    if (sonGec >= 0 && ilkDiger >= 0) expect(sonGec).toBeLessThan(ilkDiger);
    expect(within(bolum).getByRole('combobox', { name: 'Sıralama' })).toBe(secici);
    expect(degistir).not.toHaveBeenCalled();
    fireEvent.change(secici, { target: { value: 'plan' } });
    expect(sira(bolum)).toEqual(plan);
    expect(degistir).not.toHaveBeenCalled();
    // Sıralama saklanmaz: yalnız sütun ve genişlik saklanır.
    expect(localStorage.getItem(AYAR_ANAHTARI)).toBeNull();
  });

  it('Sütunlar menüsü sütun açıp kapar, seçimi tarayıcıda saklar, Emir hep açıktır, Esc kapatıp düğmeye odak verir, sıfırla varsayılana döner', () => {
    const bolum = ac();
    const dugme = within(bolum).getByRole('button', { name: /Sütunlar/ });
    expect(dugme.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(dugme);
    const menu = within(bolum).getByRole('group', { name: 'Sütunlar' });
    expect((within(menu).getByRole('checkbox', { name: /Emir/ }) as HTMLInputElement).disabled).toBe(true);
    fireEvent.click(within(menu).getByRole('checkbox', { name: /Ürün/ }));
    fireEvent.click(within(menu).getByRole('checkbox', { name: /Adet/ }));
    expect(basliklar(bolum)).toEqual(['Emir', 'Termin', 'Plan bitiş', 'Fark', 'İlerleme']);
    expect(kayitli()).toEqual({ sutunlar: ['emir', 'termin', 'bitis', 'fark', 'ilerleme'], en: null });
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(within(bolum).queryByRole('group', { name: 'Sütunlar' })).toBeNull();
    expect(document.activeElement).toBe(dugme);
    fireEvent.click(dugme);
    fireEvent.click(within(bolum).getByRole('button', { name: /varsayılana döndür/ }));
    expect(basliklar(bolum)).toHaveLength(7);
    expect(localStorage.getItem(AYAR_ANAHTARI)).toBeNull();
  });

  it('saklanan sütun seçimi açılışta okunur', () => {
    localStorage.setItem(AYAR_ANAHTARI, JSON.stringify({ sutunlar: ['termin', 'fark'], en: 480 }));
    const bolum = ac();
    expect(basliklar(bolum)).toEqual(['Emir', 'Termin', 'Fark']);
    expect(bolum.querySelector<HTMLElement>('.tc-pyq-tahta')!.style.getPropertyValue('--bas-en')).toBe('min(480px, 70cqw)');
  });

  it('ayraç ok tuşlarıyla oynar ve saklanır, çift tık doğal ene döner', () => {
    const bolum = ac();
    const ayrac = within(bolum).getByRole('separator', { name: 'Tablo genişliği' });
    expect(ayrac.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(ayrac, { key: 'ArrowRight' });
    expect(kayitli()?.en).not.toBeNull();
    const tahta = bolum.querySelector<HTMLElement>('.tc-pyq-tahta')!;
    expect(tahta.style.getPropertyValue('--bas-en')).toMatch(/^min\(\d+px, 70cqw\)$/);
    fireEvent.doubleClick(ayrac);
    expect(localStorage.getItem(AYAR_ANAHTARI)).toBeNull();
    expect(tahta.style.getPropertyValue('--bas-en')).toMatch(/^min\(\d+px, 65cqw\)$/);
  });

  it('açık emrin adımları aynı tabloda: sütun başlığı ve Adım, Tezgâh, Başlangıç, Süre, Durum hücreleri', () => {
    const bolum = ac();
    const ac1 = [...bolum.querySelectorAll<HTMLButtonElement>('button[data-agac]')].find((b) => b.closest('[data-satir]')!.querySelectorAll('[data-is]').length > 0)!;
    const id = ac1.getAttribute('data-agac')!;
    fireEvent.click(ac1);
    const ara = bolum.querySelector<HTMLElement>(`[data-agac-ara][data-satir="${id}>ust"]`)!;
    expect([...ara.querySelectorAll('[role="columnheader"]')].map((x) => x.textContent)).toEqual(['Adım', 'Tezgâh', '', 'Başlangıç', 'Süre', '', 'Durum']);
    const adim = bolum.querySelector<HTMLElement>(`[data-agac-adim][data-satir^="${id}>"]`)!;
    const hucre = [...adim.querySelectorAll('[role="cell"]')].map((x) => x.textContent);
    expect(hucre[0]).toMatch(/^1\. /);
    expect(hucre[3]).toMatch(/^\d\d\.\d\d \d\d:\d\d$/);
    expect(hucre[6]).toMatch(/^(Bitti|Sürüyor|Kilitli|Bekliyor)$/);
  });

  it('emir satırının boş hücresine basmak emri seçer, açma düğmesi seçmez (yalnız açar)', () => {
    const bolum = ac();
    const ilk = bolum.querySelector<HTMLButtonElement>('button[data-agac]')!;
    const satir = ilk.closest<HTMLElement>('[data-satir]')!;
    fireEvent.click(ilk);
    expect(satir.hasAttribute('data-secili')).toBe(false);
  });

  it('Tezgâhlar gözü aynı tablo dilidir: Tezgâh, Ad, Yük, Şu an; Sıralama ve Sütunlar yoktur (V7)', () => {
    ac();
    fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Tezgâhlar' }));
    const bolum = screen.getByRole('region', { name: 'Tezgâhlar' });
    expect(within(bolum).getByRole('table', { name: 'Tezgâhlar' })).toBeTruthy();
    expect(basliklar(bolum)).toEqual(['Tezgâh', 'Ad', 'Yük', 'Şu an']);
    expect(within(bolum).queryByRole('combobox', { name: 'Sıralama' })).toBeNull();
    expect(within(bolum).queryByRole('button', { name: /Sütunlar/ })).toBeNull();
    const satir = bolum.querySelector<HTMLElement>('.tc-pyq-tablo-satir[role="row"]:not(:has([role="columnheader"]))')!;
    const hucre = [...satir.querySelectorAll('[role="cell"]')].map((x) => x.textContent ?? '');
    expect(hucre).toHaveLength(4);
    expect(hucre[3]).toMatch(/Çalışıyor|Duruş|Boşta|Dış atölye/);
  });

  it('telefon kartı: emir no, fark rozeti ve küçük tamamlanma dairesi, altta ürün, adet ve termin', () => {
    const bolum = ac();
    const liste = bolum.querySelector<HTMLElement>('ul.tc-pyq-liste')!;
    const kart = liste.querySelector<HTMLElement>('.tc-pyq-kart')!;
    expect(kart.querySelector('.tc-pyq-kart-ust b')?.textContent).toMatch(/\S/);
    expect(kart.querySelector('.tc-pyq-kart-ust svg.tc-pyq-halka[data-kucuk]')).not.toBeNull();
    expect(kart.querySelector('.tc-pyq-kart-alt')?.textContent).toMatch(/adet.*Termin/);
  });
});
