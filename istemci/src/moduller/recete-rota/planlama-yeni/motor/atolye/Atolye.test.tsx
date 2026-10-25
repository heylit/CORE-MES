import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { BildirimSaglayici } from '../../../../../ortak/arayuz/index.ts';
import { PLANLAMA_ISLEMI } from '../../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaEkranOzellikleri, type PlanlamaOlcegi, type PlanlamaSecimi } from '../../gorunumler.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import type { PlanlamaDeposu } from '../../veri.ts';
import { yetkiKur } from '../../yetki.ts';
import { PlanlamaAtolyesi } from '../index.tsx';
import { HAZIRLANIYOR, MOTOR_NOTU } from '../ortak.tsx';
import { ornekCalisma } from '../ornek.ts';

afterEach(cleanup);

const DEPO = {
  durum: null, planSurumu: { planSurumu: 3, sonCanliyaAlma: null },
  senaryolar: { canli: { geciken: 1 }, canliSurum: 3, senaryolar: [{ id: 1, durum: 'onayda' }, { id: 2, durum: 'acik' }] },
} as unknown as PlanlamaDeposu;
function ac(o: { c?: PlanlamaCalismasi | null; yaz?: boolean; komut?: CalismaKomutu | null } = {}) {
  const yaz = o.yaz ?? true;
  const git = vi.fn();
  const c = o.c === undefined ? { ...ornekCalisma(), tpBrif: 'hep' } as PlanlamaCalismasi : o.c;
  const oz: Omit<PlanlamaEkranOzellikleri, 'olcek' | 'olcekSec' | 'kaydir' | 'secim' | 'sec'> = {
    depo: DEPO, calisma: c, komut: o.komut ?? (yaz && c ? komutKur(c).komut : null), git, yenile: vi.fn(),
    yetki: yetkiKur([PLANLAMA_ISLEMI, ...(yaz ? ['plan.yaz', 'plan.studyo'] : [])], { yazabilir: yaz }),
  };
  render(<BildirimSaglayici><Iskelet {...oz} /></BildirimSaglayici>);
  return { git };
}
function Iskelet(oz: Omit<PlanlamaEkranOzellikleri, 'olcek' | 'olcekSec' | 'kaydir' | 'secim' | 'sec'>) {
  const [olcek, setOlcek] = useState<PlanlamaOlcegi>(ACILIS_OLCEGI);
  const [secim, setSecim] = useState<PlanlamaSecimi>(BOS_SECIM);
  return (
    <PlanlamaAtolyesi {...oz} olcek={olcek} olcekSec={(x) => setOlcek({ olcek: x, kayma: 0 })} kaydir={(n) => setOlcek((x) => ({ ...x, kayma: n === 0 ? 0 : x.kayma + n }))}
      secim={secim} sec={(x) => setSecim((y) => ({ ...y, ...x }))} />
  );
}
const komutKur = (c: PlanlamaCalismasi) => {
  const yazilan: PlanlamaCalismasi[] = [];
  const komut = { degistir: vi.fn((_ne: string, fn: (t: PlanlamaCalismasi) => void) => { const t = structuredClone(c); fn(t); yazilan.push(t); return true; }), geriAl: vi.fn(), geriAlinabilir: () => false } as unknown as CalismaKomutu;
  return { komut, yazilan };
};
const kart = () => screen.getByRole('dialog');

describe('PlanlamaAtolyesi', () => {
  it('kimlik satırı, üç sekme ve onay sayısı; geri düğmesi motora döner', () => {
    const { git } = ac();
    expect(screen.getByText('Canlı sürüm 3')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((x) => x.textContent)).toEqual(['Plan', 'Onay ve canlı1', 'Plan ve gerçekleşen']);
    fireEvent.click(screen.getByRole('button', { name: 'Planlama motoruna dön' }));
    expect(git).toHaveBeenCalledWith('plan');
  });

  it('Onay ve canlı ile Plan ve gerçekleşen sonraki teslimde: ipucu ve hazırlanıyor', () => {
    ac();
    fireEvent.click(screen.getByRole('tab', { name: /Onay ve canlı/ }));
    expect(screen.getByText(/Çalışma planını canlıyla karşılaştırın/)).toBeTruthy();
    expect(screen.getByText(HAZIRLANIYOR)).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Plan ve gerçekleşen' }));
    expect(screen.getByText(/Taban plan, son canlı plan/)).toBeTruthy();
  });

  it('üst çubuk: geciken ve gecikme, ölçek, motor isteyenler pasif, onaya gönder kartı Onay sekmesine götürür', () => {
    ac();
    const ust = document.querySelector('.tc-pym-tp-ust') as HTMLElement;
    expect(within(ust).getByTitle('Geciken sipariş').textContent).toBe('1 geciken');
    expect(within(ust).getByRole('group', { name: 'Ölçek' }).textContent).toBe('Gün3 günHaftaAyYıl');
    for (const ad of ['Şu olursa: denemeler', 'İyileştir']) expect(within(ust).getByRole('button', { name: ad }).getAttribute('title')).toContain(MOTOR_NOTU);
    expect(within(ust).getByRole('button', { name: '1 onayda' })).toBeTruthy();
    fireEvent.click(within(ust).getByRole('button', { name: 'Onaya gönder' }));
    expect(within(kart()).getByText('1 → 1')).toBeTruthy();
    fireEvent.click(within(kart()).getByRole('button', { name: 'Gönder' }));
    expect(screen.getByRole('tab', { name: /Onay ve canlı/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('yazma yetkisi yoksa Onaya gönder yok, donuk bölge pasif', () => {
    ac({ yaz: false });
    expect(screen.queryByRole('button', { name: 'Onaya gönder' })).toBeNull();
    fireEvent.click(screen.getByTitle('İlk saatler donuk: bu bölgedeki işler taşınmaz'));
    expect(within(kart()).getByRole('button', { name: '8 sa' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('sipariş rayı durum ayraçlı; sipariş açılınca ayrıntı, akış ve eylemler', () => {
    ac();
    const ray = screen.getByRole('complementary', { name: 'Siparişler' });
    expect(within(ray).getAllByRole('group').map((g) => g.getAttribute('aria-label'))).toEqual(['Geciken', 'Riskli · 8 sa’ten az pay']);
    fireEvent.click(within(ray).getAllByRole('button', { expanded: false })[0] as HTMLElement);
    expect(within(ray).getByText(/Ayrıntı · 50 adet · normal/)).toBeTruthy();
    expect(within(ray).getByText(/fasoncu çıkış günü \(5\)/)).toBeTruthy();
    expect(within(ray).getByText(/Çözüm yolları/).textContent).toContain(MOTOR_NOTU);
    expect(within(ray).getByRole('button', { name: 'Böl' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(within(ray).getByRole('button', { name: 'Termin konuş' }));
    expect((within(kart()).getByRole('textbox') as HTMLTextAreaElement).value).toContain('2 numaralı siparişiniz');
  });

  it('arama ve süzgeç listeyi daraltır', () => {
    ac();
    const ray = screen.getByRole('complementary', { name: 'Siparişler' });
    fireEvent.change(within(ray).getByRole('searchbox'), { target: { value: 'burç' } });
    expect(within(ray).getAllByRole('button', { expanded: false }).length).toBe(1);
    fireEvent.change(within(ray).getByRole('searchbox'), { target: { value: 'yok' } });
    expect(within(ray).getByText(/Aramaya uyan sipariş yok/)).toBeTruthy();
  });

  it('çubuğa dokununca iş kartı; kilit çalışmaya yazılır', () => {
    const c = { ...ornekCalisma(), tpBrif: 'hep' } as PlanlamaCalismasi;
    const { komut, yazilan } = komutKur(c);
    ac({ c, komut });
    const cubuk = document.querySelector('[data-id="2.40"]') as HTMLElement;
    fireEvent.click(cubuk);
    expect(within(kart()).getByText('Neden bu saatte')).toBeTruthy();
    fireEvent.click(within(kart()).getByRole('button', { name: 'Bu saatte kilitle' }));
    expect(yazilan.at(-1)?.locks['2.40']).toMatchObject({ m: '5' });
  });

  it('donuk bölge ağırlığa yazılır; Diğer menüsü ölçek ve sekmeler', () => {
    const c = { ...ornekCalisma(), tpBrif: 'hep' } as PlanlamaCalismasi;
    const { komut, yazilan } = komutKur(c);
    ac({ c, komut });
    fireEvent.click(screen.getByRole('button', { name: 'Diğer' }));
    fireEvent.click(within(kart()).getByRole('button', { name: '8 sa' }));
    expect(yazilan.at(-1)?.w.dondurma).toBe(8);
    fireEvent.click(within(kart()).getByRole('button', { name: 'Hafta' }));
    expect(within(screen.getByRole('group', { name: 'Ölçek' })).getByRole('button', { pressed: true }).textContent).toBe('Hafta');
    expect(within(kart()).getByRole('button', { name: 'Atölye ekranı' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('sabah brifingi günün ilk açılışında; kapatınca çalışmaya yazılır', () => {
    const c = ornekCalisma();
    const { komut, yazilan } = komutKur(c);
    ac({ c, komut });
    const b = screen.getByRole('region', { name: 'Sabah brifingi' });
    expect(within(b).getByText('1 geciken, 1 riskli sipariş')).toBeTruthy();
    fireEvent.click(within(b).getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByRole('region', { name: 'Sabah brifingi' })).toBeNull();
    expect(typeof yazilan.at(-1)?.tpBrif).toBe('string');
  });

  it('Bugün şeridi açılır; Gün özeti kartı', () => {
    ac();
    fireEvent.click(screen.getByRole('button', { name: /Bugün/ }));
    expect(screen.getByText('Çözülecekler')).toBeTruthy();
    expect(screen.getByText('asıl bekleme · fasoncu çıkış günü')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Gün özeti' }));
    expect(within(kart()).getByText('Bugünün gün başı kaydı yok.')).toBeTruthy();
  });

  it('çalışma ya da plan yoksa motorun boş kartları', () => {
    ac({ c: null });
    expect(screen.getByText('Planlama çalışması yok.')).toBeTruthy();
    cleanup();
    ac({ c: { ...ornekCalisma(), plan: null } as PlanlamaCalismasi });
    expect(screen.getByText('Plan henüz kurulmadı')).toBeTruthy();
  });
});
