import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { api } from '../../../../../ortak/veri/api.ts';
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
// Brifing günü tarayıcıda; testler öntanımlı olarak bugün görülmüş sayar.
const BRIF = 'tmi:planlama:brif';
const bugunAnahtari = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
beforeEach(() => { localStorage.setItem(BRIF, bugunAnahtari()); });

const GOSTERGE = { emirSayisi: 5, isEmriSayisi: 9, yerlesen: 9, geciken: 1, zamanindaYuzde: 80, ortAtolyeGun: 2, darbogaz: null, enDoluKaynak: null, personelGun: null, maliyetTl: null };
const senaryo = (id: number, durum: string, ek: Record<string, unknown> = {}) => ({
  id, ad: `Senaryo ${id}`, aciklama: null, durum, acan: 'Ayşe', benim: true, acilma: '2026-10-20T08:00:00Z', surum: 4, tabanPlanSurumu: 3, canliDegisti: false,
  gostergeler: { ...GOSTERGE, geciken: 2 }, degisiklikler: [{ id: 7, tur: 'sira', ozet: 'M1 sırası değişti', yazma: '2026-10-20T09:00:00Z' }],
  etki: { tarihiDegisenEmirler: [{ emirNo: 'E-1', canli: '2026-10-21T08:00:00Z', senaryo: '2026-10-21T11:00:00Z' }], yukuDegisenIstasyonlar: [], yeniUyarilar: [] },
  bekleyenler: [], onay: null, yapabilir: { onayaGonder: false, onaydanCek: false, geriGonder: false, canliyaAl: false }, ...ek,
});
const DEPO = {
  durum: null, planSurumu: { planSurumu: 3, sonCanliyaAlma: null },
  senaryolar: { canli: GOSTERGE, canliSurum: 3, senaryolar: [
    senaryo(1, 'onayda', { onay: { gonderen: 'Ayşe', gonderme: '2026-10-20T10:00:00Z', not: 'acil', geriGonderen: null, geriGonderme: null, geriNeden: null }, yapabilir: { onayaGonder: false, onaydanCek: false, geriGonder: true, canliyaAl: true } }),
    senaryo(2, 'acik', { yapabilir: { onayaGonder: true, onaydanCek: false, geriGonder: false, canliyaAl: false } }),
  ] },
} as unknown as PlanlamaDeposu;
function ac(o: { c?: PlanlamaCalismasi | null; yaz?: boolean; komut?: CalismaKomutu | null } = {}) {
  const yaz = o.yaz ?? true;
  const git = vi.fn();
  const c = o.c === undefined ? ornekCalisma() : o.c;
  const oz: Omit<PlanlamaEkranOzellikleri, 'olcek' | 'olcekSec' | 'kaydir' | 'secim' | 'sec'> = {
    depo: DEPO, calisma: c, komut: o.komut ?? (yaz && c ? komutKur(c).komut : null), git, yenile: vi.fn(),
    yetki: yetkiKur([PLANLAMA_ISLEMI, ...(yaz ? ['plan.yaz', 'plan.studyo'] : [])], { yazabilir: yaz }),
  };
  render(<MemoryRouter><BildirimSaglayici><Iskelet {...oz} /></BildirimSaglayici></MemoryRouter>);
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
  const komut = { degistir: vi.fn((_ne: string, fn: (t: PlanlamaCalismasi) => void) => { const t = structuredClone(c); fn(t); yazilan.push(t); return true; }), geriAl: vi.fn(), geriAlinabilir: () => false, geriAdimlari: () => [], geriDon: vi.fn() } as unknown as CalismaKomutu;
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

  it('Plan ve gerçekleşen sonraki teslimde: ipucu ve hazırlanıyor', () => {
    ac();
    fireEvent.click(screen.getByRole('tab', { name: 'Plan ve gerçekleşen' }));
    expect(screen.getByText(/Taban plan, son canlı plan/)).toBeTruthy();
    expect(screen.getByText(HAZIRLANIYOR)).toBeTruthy();
  });

  it('Onay ve canlı: sunucu senaryoları, onaydaki seçili; geri gönderme neden ister, cevap listeyi yeniler', async () => {
    const plan = (kaynak: number, bitis: string) => ({
      kaynaklar: [{ tur: 'makine', id: 1, kod: 'M1', ad: 'M1' }, { tur: 'makine', id: 2, kod: 'M2', ad: 'M2' }],
      yerlesimler: [{ isEmriId: 9, kaynak: { tur: 'makine', id: kaynak }, baslangic: '2026-10-21T06:00:00Z', bitis, kilitli: false, dondurulmus: false, durum: 'planli' }],
      emirler: [{ emirNo: 'E-1', teslim: '2026-10-30', bitis }],
    });
    const get = vi.spyOn(api, 'get').mockImplementation((yol: string) => Promise.resolve(yol === '/plan' ? plan(1, '2026-10-21T08:00:00Z') : plan(2, '2026-10-21T11:00:00Z')) as never);
    ac();
    fireEvent.click(screen.getByRole('tab', { name: /Onay ve canlı/ }));
    expect(screen.getByText(/Çalışma planını canlıyla karşılaştırın/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText('1 tezgâh, 0 saat, 0 yeni')).toBeTruthy());
    expect(get).toHaveBeenCalledWith('/plan?taslak=1');
    expect(screen.getByText('Başlamış işler yerinde')).toBeTruthy();
    expect(document.querySelectorAll('.tc-pym-pa-aday')).toHaveLength(3);
    expect(document.querySelector('.tc-pym-pa-aday[aria-current="true"]')?.textContent).toContain('Senaryo 1');
    expect(screen.getByText('M1 sırası değişti')).toBeTruthy();
    expect(screen.getByText('+3,0 sa')).toBeTruthy();
    expect(screen.getByText('Geciken sipariş canlıya göre 1 artıyor')).toBeTruthy();
    const post = vi.spyOn(api, 'post').mockResolvedValue({ ...DEPO.senaryolar, senaryolar: [DEPO.senaryolar!.senaryolar[1]] });
    fireEvent.click(screen.getByRole('button', { name: 'Geri gönder' }));
    expect(post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'M2 dolu' } });
    fireEvent.click(screen.getByRole('button', { name: 'Geri gönder' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/plan/senaryolar/1/geri-gonder', { surum: 4, neden: 'M2 dolu' }));
    await waitFor(() => expect(document.querySelectorAll('.tc-pym-pa-aday')).toHaveLength(2));
    post.mockRestore();
    get.mockRestore();
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
    const c = ornekCalisma();
    const { komut, yazilan } = komutKur(c);
    ac({ c, komut });
    const cubuk = document.querySelector('[data-id="2.40"]') as HTMLElement;
    fireEvent.click(cubuk);
    expect(within(kart()).getByText('Neden bu saatte')).toBeTruthy();
    fireEvent.click(within(kart()).getByRole('button', { name: 'Bu saatte kilitle' }));
    expect(yazilan.at(-1)?.locks['2.40']).toMatchObject({ m: '5' });
  });

  it('donuk bölge ağırlığa yazılır; Diğer menüsü ölçek ve sekmeler', () => {
    const c = ornekCalisma();
    const { komut, yazilan } = komutKur(c);
    ac({ c, komut });
    fireEvent.click(screen.getByRole('button', { name: 'Diğer' }));
    fireEvent.click(within(kart()).getByRole('button', { name: '8 sa' }));
    expect(yazilan.at(-1)?.w.dondurma).toBe(8);
    fireEvent.click(within(kart()).getByRole('button', { name: 'Hafta' }));
    expect(within(screen.getByRole('group', { name: 'Ölçek' })).getByRole('button', { pressed: true }).textContent).toBe('Hafta');
    expect(within(kart()).getByRole('button', { name: 'Atölye ekranı' }).getAttribute('aria-disabled')).toBe('true');
  });

  it('sabah brifingi günün ilk açılışında (gün tarayıcıda); gün başı açılışta çalışmaya sessiz yazılır', () => {
    localStorage.removeItem(BRIF);
    const c = ornekCalisma();
    const { komut, yazilan } = komutKur(c);
    ac({ c, komut });
    const b = screen.getByRole('region', { name: 'Sabah brifingi' });
    expect(within(b).getByText('1 geciken, 1 riskli sipariş')).toBeTruthy();
    expect(localStorage.getItem(BRIF)).toBe(bugunAnahtari());
    fireEvent.click(within(b).getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByRole('region', { name: 'Sabah brifingi' })).toBeNull();
    expect(yazilan.every((t) => !('tpBrif' in t) || t.tpBrif === c.tpBrif)).toBe(true);
    const gun = yazilan.at(-1)?.tpGun as { basi: { gun: string; e: { late: number } } } | undefined;
    expect(gun?.basi.gun).toBe(bugunAnahtari());
    expect(gun?.basi.e.late).toBe(1);
    expect(vi.mocked(komut.degistir).mock.calls.at(-1)?.[2]).toEqual({ sessiz: true });
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
