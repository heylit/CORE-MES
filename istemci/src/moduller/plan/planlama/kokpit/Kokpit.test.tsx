import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { PLANLAMA_ISLEMI } from '../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaEkranOzellikleri } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import { saatiSabitle } from '../test-saati.ts';
import type { PlanlamaDeposu } from '../veri.ts';
import { yetkiKur } from '../yetki.ts';
import { Kokpit } from './index.tsx';

// Örnek çalışma uydurmadır (iki emir: biri geç, biri riskli). Sunucu çağrısı yapılmaz; taşıma ve tur ekran testindedir
// (ekran-testleri/planlama-kokpit.spec.ts).
saatiSabitle(ornekCalisma);
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

const DEPO = { durum: null, planSurumu: null, senaryolar: null, calismaSurumu: 4, receteRotaKaydi: null } as unknown as PlanlamaDeposu;
function komutKur(adim: number): CalismaKomutu {
  return {
    degistir: () => false, geriAl: vi.fn(() => true), geriAlinabilir: () => adim > 0, geriAdimlari: () => Array.from({ length: adim }, (_, i) => ({ ne: `Değişiklik ${String(i)}`, t: 0 })),
    geriDon: () => true, yinele: vi.fn(() => true), yinelenebilir: () => false, kaydet: () => Promise.resolve(4),
  };
}
function ac(oz: Partial<PlanlamaEkranOzellikleri> = {}, yaz = true) {
  const sec = vi.fn();
  render(
    <BildirimSaglayici>
      <Kokpit
        depo={DEPO} calisma={ornekCalisma()} komut={yaz ? komutKur(0) : null} git={vi.fn()} yenile={vi.fn()} yetki={yetkiKur([PLANLAMA_ISLEMI, ...(yaz ? ['plan.yaz'] : [])])}
        olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={BOS_SECIM} sec={sec} {...oz}
      />
    </BildirimSaglayici>,
  );
  return { sec };
}

describe('Kokpit', () => {
  it('tahtayı, sayıları ve işleri çizer; işe tıklamak emri ve adımı seçer', () => {
    const { sec } = ac();
    const suzgec = screen.getByRole('group', { name: 'Durum süzgeci' });
    expect(within(suzgec).getByRole('button', { name: /Geç/ }).textContent).toContain('1');
    expect(within(suzgec).getByRole('button', { name: /Riskli/ }).textContent).toContain('1');
    const isler = document.querySelectorAll('.tc-pyq-is');
    expect(isler.length).toBe(5);
    const is = document.querySelector<HTMLElement>('[data-is="3.10"]');
    expect(is?.dataset.d).toBe('risk');
    if (is) fireEvent.click(is);
    expect(sec).toHaveBeenCalledWith({ siparis: '3', adim: '3.10' });
    // Başlamış iş ve fason adım taşınmaz diye işaretlidir.
    expect(document.querySelector('[data-is="2.20"]')?.hasAttribute('data-sabit')).toBe(true);
    expect(document.querySelector('[data-is="2.30"]')?.hasAttribute('data-sabit')).toBe(true);
  });

  it('süzgeç uymayan emrin işlerini soluklaştırır, listeyi daraltır', () => {
    ac();
    fireEvent.click(within(screen.getByRole('group', { name: 'Durum süzgeci' })).getByRole('button', { name: /Geç/ }));
    expect(document.querySelector('[data-is="3.10"]')?.hasAttribute('data-sonuk')).toBe(true);
    expect(document.querySelector('[data-is="2.40"]')?.hasAttribute('data-sonuk')).toBe(false);
    expect(within(screen.getByRole('list', { name: 'Emirler' })).getAllByRole('button')).toHaveLength(1);
  });

  it('seçili emrin ayrıntısı adımları ve yerlerini gösterir; kapatmak seçimi kaldırır', () => {
    const { sec } = ac({ secim: { ...BOS_SECIM, siparis: '2', adim: '2.20' } });
    const ayr = screen.getByRole('complementary', { name: /ayrıntısı/ });
    expect(within(ayr).getByRole('button', { name: /1\. / }).getAttribute('aria-current')).toBe('true');
    expect(within(ayr).getByText('Başlamış iş taşınmaz')).toBeTruthy();
    fireEvent.click(within(ayr).getByRole('button', { name: 'Ayrıntıyı kapat' }));
    expect(sec).toHaveBeenCalledWith({ siparis: null, adim: null });
  });

  it('Matris iki tabloyu gösterir: emir × adım ve 14 günlük tezgâh × gün', () => {
    ac();
    fireEvent.click(within(screen.getByRole('group', { name: 'Görünüm' })).getByRole('button', { name: 'Matris' }));
    const em = screen.getByRole('region', { name: 'Emir × adım matrisi' });
    expect(within(em).getAllByRole('row')).toHaveLength(3);
    expect(within(em).getAllByRole('columnheader').map((x) => x.textContent)).toEqual(['Emir', '1. adım', '2. adım', '3. adım', 'Bitiş']);
    fireEvent.click(screen.getByRole('button', { name: 'Tezgâh × gün' }));
    const tg = screen.getByRole('region', { name: 'Tezgâh × gün matrisi' });
    expect(within(tg).getAllByRole('columnheader')).toHaveLength(16);
    // Fason satırı yük tablosunda yoktur (kapasitesi izlenmez).
    expect(within(tg).getAllByRole('row')).toHaveLength(6);
  });

  it('Geri düğmesi geri alınabilir adım sayısını gösterir ve geri alır; adım yokken pasiftir', () => {
    const komut = komutKur(3);
    ac({ komut });
    const geri = within(screen.getByRole('group', { name: 'Geri ve ileri' })).getByRole('button', { name: /Geri/ });
    expect(geri.querySelector('.tc-pyq-rozet')?.textContent).toBe('3');
    expect(screen.getByText(/Taslak · 3 değişiklik/)).toBeTruthy();
    fireEvent.click(geri);
    expect(komut.geriAl).toHaveBeenCalledTimes(1);
    cleanup();
    ac();
    expect(within(screen.getByRole('group', { name: 'Geri ve ileri' })).getByRole('button', { name: /Geri/ }).hasAttribute('disabled')).toBe(true);
  });

  it('yazamayan kişide tutma kapalıdır: sağ tık menü açmaz, Onaya gönder yoktur', () => {
    ac({}, false);
    expect(document.querySelectorAll('.tc-pyq-is').length).toBe(5);
    const is = document.querySelector<HTMLElement>('[data-is="3.10"]');
    if (is) fireEvent.contextMenu(is);
    expect(screen.queryByRole('menu')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Onaya gönder' })).toBeNull();
  });

  it('yazabilen kişide sağ tık menüsü Yapışarak tut ve Ayrıntı sunar; tutulan iş için ipucu çıkar, Esc vazgeçer', () => {
    ac();
    const is = document.querySelector<HTMLElement>('[data-is="3.10"]');
    if (!is) throw new Error('iş yok');
    fireEvent.contextMenu(is);
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((x) => x.textContent)).toEqual([expect.stringContaining('Yapışarak tut'), expect.stringContaining('Ayrıntı')]);
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Yapışarak tut/ }));
    expect(screen.getByText(/Bırakmak için tıklayın/)).toBeTruthy();
    expect(document.querySelector('[data-satir="1"]')?.getAttribute('data-aday')).toBe('evet');
    expect(document.querySelector('[data-satir="3"]')?.getAttribute('data-aday')).toBe('hayir');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByText(/Bırakmak için tıklayın/)).toBeNull();
  });

  it('Onaya gönder yalnız gönderilebilirken birincildir: plan güncel değilken sayfanın birincili plan çubuğundadır', () => {
    // Örnek çalışmada veri plandan sonra değişmiştir.
    const c = ornekCalisma();
    ac({ calisma: { ...c, dataVer: c.plan?.dataVer ?? c.dataVer } });
    expect(screen.getByRole('button', { name: 'Onaya gönder' }).className).toContain('tc-dugme-birincil');
    cleanup();
    ac();
    const d = screen.getByRole('button', { name: 'Onaya gönder' });
    expect(d.className).not.toContain('tc-dugme-birincil');
    expect(d.hasAttribute('disabled')).toBe(true);
  });

  it('çalışma yokken boş durum gösterir', () => {
    ac({ calisma: null });
    expect(screen.getByText(/Henüz plan yok/)).toBeTruthy();
  });
});
