import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { api, ApiHatasi } from '../../../../../ortak/veri/api.ts';
import { BildirimSaglayici } from '../../../../../ortak/arayuz/index.ts';
import { PLANLAMA_ISLEMI } from '../../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaEkranOzellikleri, type PlanlamaOlcegi, type PlanlamaSecimi } from '../../gorunumler.ts';
import { ESKI_DEGISIKLIK, type CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import type { PlanlamaDeposu } from '../../veri.ts';
import { yetkiKur } from '../../yetki.ts';
import { PlanlamaAtolyesi } from '../index.tsx';
import { HAZIRLANIYOR, MOTOR_NOTU } from '../ortak.tsx';
import { planOku, tabanMs } from '../kurallar.ts';
import { ornekCalisma } from '../ornek.ts';
import { planKurSifirla } from '../coz.ts';
import { otomatikUygulaIste, otomatikUygulaSifirla } from './gonder.ts';

import { saatiSabitle } from '../../test-saati.ts';

saatiSabitle(() => ornekCalisma());

afterEach(() => { cleanup(); otomatikUygulaSifirla(); });
// jsdom'da PointerEvent yok: fireEvent onsuz olayı konumsuz yollar. Sürükle testleri için fare olayından türetilir.
if (typeof window.PointerEvent === 'undefined') {
  class IsaretciOlayi extends MouseEvent {
    readonly pointerId: number;
    constructor(tur: string, o: PointerEventInit = {}) { super(tur, o); this.pointerId = o.pointerId ?? 0; }
  }
  window.PointerEvent = IsaretciOlayi as unknown as typeof PointerEvent;
}
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
  ben: { kisi: { id: 1, ad: 'Ayşe' }, yazabilir: true },
  durum: null, planSurumu: { planSurumu: 3, sonCanliyaAlma: null },
  senaryolar: { canli: GOSTERGE, canliSurum: 3, senaryolar: [
    senaryo(1, 'onayda', { onay: { gonderen: 'Ayşe', gonderme: '2026-10-20T10:00:00Z', not: 'acil', geriGonderen: null, geriGonderme: null, geriNeden: null }, yapabilir: { onayaGonder: false, onaydanCek: false, geriGonder: true, canliyaAl: true } }),
    senaryo(2, 'acik', { yapabilir: { onayaGonder: true, onaydanCek: false, geriGonder: false, canliyaAl: false } }),
  ] },
} as unknown as PlanlamaDeposu;
function ac(o: { depo?: PlanlamaDeposu; c?: PlanlamaCalismasi | null; yaz?: boolean; komut?: CalismaKomutu | null; mudur?: boolean; istek?: PlanlamaEkranOzellikleri['istek']; studyoAc?: PlanlamaEkranOzellikleri['studyoAc']; altSec?: PlanlamaEkranOzellikleri['altSec'] } = {}) {
  const yaz = o.yaz ?? true;
  const git = vi.fn();
  const yenile = vi.fn();
  const c = o.c === undefined ? ornekCalisma() : o.c;
  const oz: Omit<PlanlamaEkranOzellikleri, 'olcek' | 'olcekSec' | 'kaydir' | 'secim' | 'sec'> = {
    depo: o.depo ?? DEPO, calisma: c, komut: o.komut ?? (yaz && c ? komutKur(c).komut : null), git, yenile, istek: o.istek ?? null, ...(o.studyoAc ? { studyoAc: o.studyoAc } : {}), ...(o.altSec ? { altSec: o.altSec } : {}),
    yetki: yetkiKur([PLANLAMA_ISLEMI, ...(yaz ? ['plan.yaz', 'plan.studyo'] : []), ...(o.mudur ? ['plan.canliya-al'] : [])]),
  };
  render(<MemoryRouter><BildirimSaglayici><Iskelet {...oz} /></BildirimSaglayici></MemoryRouter>);
  return { git, yenile };
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
  const komut = { degistir: vi.fn((_ne: string, fn: (t: PlanlamaCalismasi) => void) => { const t = structuredClone(c); fn(t); yazilan.push(t); return true; }), geriAl: vi.fn(), geriAlinabilir: () => false, geriAdimlari: () => [], geriDon: vi.fn(), kaydet: vi.fn(async () => 8), komutBasladi: vi.fn(), komutDustu: vi.fn() } as unknown as CalismaKomutu;
  return { komut, yazilan };
};
const kart = () => screen.getByRole('dialog');
// Güncel veriyle çözülmüş plan: eski veriyle çözülmüş plan onaya gönderilmez.
const guncel = () => { const c = ornekCalisma(); if (c.plan) c.plan.dataVer = c.dataVer; return c; };

describe('PlanlamaAtolyesi', () => {
  it('stüdyo isteği: tezgâhta süzgeç ve tezgâh günlüğü, siparişte ray ve sipariş; işlenince adresten silinir; her rolde aynı', () => {
    const gor = (yaz: boolean) => {
      const studyoAc = vi.fn();
      ac({ yaz, istek: { tur: 'tez', v: '1' }, studyoAc });
      const k = screen.getByRole('dialog', { name: '1 günlüğü' });
      expect(studyoAc).toHaveBeenCalledWith(null);
      // Arıza bildir ve Ek mesai kartın yazan rolündeki pasif düğmeleridir; gerisi aynıdır.
      const l = [k.getAttribute('aria-label'), ...within(k).getAllByRole('button').map((x) => x.textContent).filter((x) => x !== 'Arıza bildir' && x !== 'Ek mesai')];
      cleanup(); return l;
    };
    expect(gor(false)).toEqual(gor(true));
    const studyoAc = vi.fn();
    ac({ istek: { tur: 'sip', v: '3' }, studyoAc });
    expect(document.querySelector('.tc-pym-tp-govde')?.hasAttribute('data-ray')).toBe(true);
    expect(screen.getAllByRole('button', { expanded: true }).some((b) => b.classList.contains('tc-pym-tp-sip-tus') && b.textContent?.startsWith('3'))).toBe(true);
    expect(studyoAc).toHaveBeenCalledWith(null);
    cleanup();
    ac({ istek: { tur: 'tez', v: 'yok' }, studyoAc });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(studyoAc).toHaveBeenCalledTimes(2);
  });

  it('olay isteği (2171): tahtadaki olay düğmesi atölyenin olay formunu türü seçili açar; yazamayana kart açılmaz', () => {
    const studyoAc = vi.fn();
    ac({ istek: { tur: 'olay', v: 'acil' }, studyoAc });
    const k = screen.getByRole('dialog', { name: 'Olay ekle' });
    expect(within(k).getByRole('button', { name: 'Acil sipariş' }).getAttribute('aria-pressed')).toBe('true');
    expect(within(k).getByRole('button', { name: 'Arıza' }).getAttribute('aria-pressed')).toBe('false');
    expect(studyoAc).toHaveBeenCalledWith(null);
    cleanup();
    ac({ yaz: false, istek: { tur: 'olay', v: 'ariza' }, studyoAc });
    expect(screen.queryByRole('dialog', { name: 'Olay ekle' })).toBeNull();
    expect(studyoAc).toHaveBeenCalledTimes(2);
  });

  it('tek baş satırı: üç sekme, onay sayısı ve canlı sürüm; ayrı başlık satırı ve geri düğmesi yok (motora plan çubuğundan gidilir)', () => {
    ac();
    expect(screen.getByText('Canlı sürüm 3')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((x) => x.textContent)).toEqual(['Plan', 'Onay ve canlı1', 'Plan ve gerçekleşen']);
    expect(screen.queryByRole('heading', { name: /Planlama stüdyosu/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Planlama motoruna dön' })).toBeNull();
  });

  it('Plan ve gerçekleşen: taban ve canlı sunucudan; okunana kadar hazırlanıyor, ret iletisi, canlı yoksa boş, varsa göstergeler; çalışmaya yazmaz', async () => {
    let cevap: Promise<unknown> = new Promise(() => undefined);
    const gecmis = { tabanZamani: '2026-10-20T08:00:00Z', toplam: 3, kisiler: [{ kisi: 'Ayşe', sayi: 2 }, { kisi: 'Mehmet', sayi: 1 }], son: [] };
    let gecmisCevap: Promise<unknown> = Promise.reject(new Error('yok'));
    const get = vi.spyOn(api, 'get').mockImplementation(((yol: string) => (yol.endsWith('/taban-ve-canli') ? cevap
      : yol === '/plan/canliya-alma-gecmisi' ? gecmisCevap : Promise.reject(new Error('yok')))) as never);
    const c = ornekCalisma();
    const { komut } = komutKur(c);
    const sekme = () => { ac({ c, komut }); fireEvent.click(screen.getByRole('tab', { name: 'Plan ve gerçekleşen' })); };
    sekme();
    expect(screen.getByText(/Taban plan, son canlı plan/)).toBeTruthy();
    expect(screen.getByText(HAZIRLANIYOR)).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/plan/planlama-calismasi/taban-ve-canli');
    cleanup();
    cevap = Promise.reject(new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'Plan okuma yetkisi gerekir.' }));
    sekme();
    await waitFor(() => expect(screen.getByText('Plan okuma yetkisi gerekir.')).toBeTruthy());
    cleanup();
    cevap = Promise.resolve({ planSurumu: 0, isler: [] });
    sekme();
    await waitFor(() => expect(screen.getByText(/Henüz canlıya alınmış plan yok/)).toBeTruthy());
    cleanup();
    const op = Object.values(planOku(c)?.ops ?? {}).find((r) => !r.fas && Number.isFinite(r.C));
    if (!op) throw new Error('adım yok');
    const iso = (t: number) => new Date(Date.UTC(2026, 9, 19) - 3 * 3_600_000 + t * 3_600_000).toISOString();
    const yer = { kaynak: { tur: 'makine', id: 7 }, baslangic: iso(op.S), bitis: iso(op.C) };
    cevap = Promise.resolve({ planSurumu: 3, isler: [{ k: op.id, anahtar: 'E|10', isEmriId: 1, uretimEmriId: 1, taban: { ...yer, planSurumu: 2 }, canli: { ...yer, parcalar: [] } }] });
    sekme();
    await waitFor(() => expect(screen.getByText('Plana uyum')).toBeTruthy());
    expect(screen.getByRole('region', { name: 'Sipariş bazında' })).toBeTruthy();
    expect(within(screen.getByText('Plan değişikliği').parentElement as HTMLElement).getByText('1')).toBeTruthy();
    expect(screen.getByText('taban sonrası canlıya alma')).toBeTruthy();
    cleanup();
    gecmisCevap = Promise.resolve(gecmis);
    sekme();
    await waitFor(() => expect(screen.getByText('Ayşe 2 · Mehmet 1')).toBeTruthy());
    expect(within(screen.getByText('Plan değişikliği').parentElement as HTMLElement).getByText('3')).toBeTruthy();
    expect(get).toHaveBeenCalledWith('/plan/canliya-alma-gecmisi');
    expect(vi.mocked(komut.degistir).mock.calls.map((x) => x[0])).not.toContain('Taban plan');
    get.mockRestore();
  });

  it('Onay ve canlı: sunucu senaryoları, onaydaki seçili; geri gönderme neden ister, cevap listeyi yeniler', async () => {
    const plan = (kaynak: number, bitis: string) => ({
      kaynaklar: [{ tur: 'makine', id: 1, kod: 'M1', ad: 'M1' }, { tur: 'makine', id: 2, kod: 'M2', ad: 'M2' }],
      yerlesimler: [{ isEmriId: 9, kaynak: { tur: 'makine', id: kaynak }, baslangic: '2026-10-21T06:00:00Z', bitis, kilitli: false, dondurulmus: false, durum: 'planli' }],
      emirler: [{ emirNo: 'E-1', teslim: '2026-10-30', bitis }],
      gostergeler: { ...GOSTERGE, ayarSaat: kaynak === 1 ? 2 : 3.5, agirlikliGecikmeSaat: kaynak === 1 ? 4 : 6 },
    });
    const get = vi.spyOn(api, 'get').mockImplementation((yol: string) => (yol.startsWith('/plan/motor-ayarlari') ? Promise.reject(new Error('yok'))
      : Promise.resolve(yol === '/plan' ? plan(1, '2026-10-21T08:00:00Z') : plan(2, '2026-10-21T11:00:00Z'))) as never);
    ac();
    fireEvent.click(screen.getByRole('tab', { name: /Onay ve canlı/ }));
    expect(screen.getByText(/Çalışma planını canlıyla karşılaştırın/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText('1 tezgâh, 0 saat, 0 yeni')).toBeTruthy());
    expect(get).toHaveBeenCalledWith('/plan?taslak=1');
    expect(screen.getByText('Başlamış işler yerinde')).toBeTruthy();
    // 1786b: canlı kutusundaki gecikme de ağırlıklıdır ve adıyla yazılır.
    expect(screen.getAllByText('Ağırlıklı gecikme').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('4,0 → 6,0 sa')).toBeTruthy();
    expect(screen.getByText('3,5 sa')).toBeTruthy();
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

  it('Onay sekmesi, senaryo (984 a): taslaktan sonra başlayan iş canlıya almayı durdurursa sabitleme sorulur; onaylanınca sabitle ile yeniden gönderilir', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation((() => Promise.reject(new Error('yok'))) as never);
    const ileti = 'Taslak açıldıktan sonra başlayan iş var (E-1 OP 10); taslakta o makinede onunla çakışan iş var.';
    const post = vi.spyOn(api, 'post')
      .mockRejectedValueOnce(new ApiHatasi(409, { kod: 'CAKISMA', mesaj: ileti, ayrinti: { neden: 'sonradan-baslayan', isler: [{ emirNo: 'E-1', opNo: 10 }] } }))
      .mockResolvedValue({ ...DEPO.senaryolar, canliSurum: 4 });
    ac({ mudur: true });
    fireEvent.click(screen.getByRole('tab', { name: /Onay ve canlı/ }));
    const dugmeler = screen.getAllByRole('button', { name: 'Onayla ve canlıya al' });
    fireEvent.click(dugmeler[dugmeler.length - 1]!);
    fireEvent.click(within(kart()).getByRole('button', { name: /canlıya al$/ }));
    await waitFor(() => expect(screen.getByText('Taslaktan sonra başlayan iş var')).toBeTruthy());
    expect(screen.getByText(new RegExp(ileti.replace(/[()]/g, '.')))).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sabitle ve canlıya al' }));
    await waitFor(() => expect(post).toHaveBeenLastCalledWith('/plan/senaryolar/1/canliya-al', { surum: 4, baslayanlar: 'sabitle' }, expect.anything()));
    post.mockRestore();
    get.mockRestore();
  });

  it('Onay sekmesi, senaryo (2311 S1): ilk deneme bayraksız gider; canlı değiştiyse canlıya alan sorulur, onaylanınca sonraki denemeler de bayrakla gider', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation(((yol: string) => (yol === '/plan/surum'
      ? Promise.resolve({ planSurumu: 4, sonCanliyaAlma: { zaman: '2026-11-08T09:00:00Z', kisi: 'Deneme B' } })
      : Promise.reject(new Error('yok')))) as never);
    const post = vi.spyOn(api, 'post')
      .mockRejectedValueOnce(new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Canlı plan değişti.', ayrinti: { neden: 'canli-degisti', tabanSurumu: 3, canliSurumu: 4 } }))
      .mockRejectedValueOnce(new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Başlayan iş var.', ayrinti: { neden: 'sonradan-baslayan', isler: [{ emirNo: 'E-1', opNo: 10 }] } }))
      .mockResolvedValue({ ...DEPO.senaryolar, canliSurum: 5 });
    ac({ mudur: true });
    fireEvent.click(screen.getByRole('tab', { name: /Onay ve canlı/ }));
    const dugmeler = screen.getAllByRole('button', { name: 'Onayla ve canlıya al' });
    fireEvent.click(dugmeler[dugmeler.length - 1]!);
    fireEvent.click(within(kart()).getByRole('button', { name: /canlıya al$/ }));
    await waitFor(() => expect(screen.getByText('Canlı plan değişti')).toBeTruthy());
    expect(post).toHaveBeenLastCalledWith('/plan/senaryolar/1/canliya-al', { surum: 4 }, expect.anything());
    expect(screen.getByText(/Deneme B .+ canlıya aldı\./)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yine de canlıya al' }));
    await waitFor(() => expect(post).toHaveBeenLastCalledWith('/plan/senaryolar/1/canliya-al', { surum: 4, cakismalariKabul: true }, expect.anything()));
    await waitFor(() => expect(screen.getByText('Taslaktan sonra başlayan iş var')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Sabitle ve canlıya al' }));
    await waitFor(() => expect(post).toHaveBeenLastCalledWith('/plan/senaryolar/1/canliya-al', { surum: 4, cakismalariKabul: true, baslayanlar: 'sabitle' }, expect.anything()));
    post.mockRestore();
    get.mockRestore();
  });

  it('Onay sekmesi, senaryo (990 a): 4 saat kuralına takılan canlıya alma gerekçe sorar; boş gerekçe gönderilmez, yazılan gerekçeyle yeniden gönderilir', async () => {
    const get = vi.spyOn(api, 'get').mockImplementation((() => Promise.reject(new Error('yok'))) as never);
    const ileti = 'E-1 OP 10 4 saatten kısa sürede başlayacak; başka makine ya da kişiye alınamaz. Zorunluysa gerekçe yazarak canlıya alın.';
    const post = vi.spyOn(api, 'post')
      .mockRejectedValueOnce(new ApiHatasi(409, { kod: 'CAKISMA', mesaj: ileti, ayrinti: { neden: 'dort-saat', gerekceIle: true } }))
      .mockResolvedValue({ ...DEPO.senaryolar, canliSurum: 4 });
    ac({ mudur: true });
    fireEvent.click(screen.getByRole('tab', { name: /Onay ve canlı/ }));
    const dugmeler = screen.getAllByRole('button', { name: 'Onayla ve canlıya al' });
    fireEvent.click(dugmeler[dugmeler.length - 1]!);
    fireEvent.click(within(kart()).getByRole('button', { name: /canlıya al$/ }));
    await waitFor(() => expect(screen.getByText('4 saat kuralı')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Gerekçeyle canlıya al' }));
    expect(post).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByPlaceholderText('Neden şimdi değişmesi gerekiyor'), { target: { value: '  takım tezgâhta yok ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerekçeyle canlıya al' }));
    await waitFor(() => expect(post).toHaveBeenLastCalledWith('/plan/senaryolar/1/canliya-al', { surum: 4, dortSaatGerekcesi: 'takım tezgâhta yok' }, expect.anything()));
    await waitFor(() => expect(screen.queryByText('4 saat kuralı')).toBeNull());
    post.mockRestore();
    get.mockRestore();
  });

  it('üst çubuk: geciken ve gecikme, ölçek, motor isteyenler pasif; onaya gönder kartı doğrudan gönderir ve Onay sekmesine götürür', async () => {
    ac({ c: guncel() });
    const ust = document.querySelector('.tc-pym-tp-ust') as HTMLElement;
    expect(within(ust).getByTitle('Geciken sipariş').textContent).toBe('1 geciken');
    expect(within(ust).getByRole('group', { name: 'Ölçek' }).textContent).toBe('Gün3 günHaftaAyYıl');
    // Sayfa adresi yokken (altSec verilmedi) denemeler açılamaz; 2531 a ile Geçmiş > Senaryolar'a gider (aşağıdaki test).
    expect(within(ust).getByRole('button', { name: 'Şu olursa: denemeler' }).getAttribute('aria-disabled')).toBe('true');
    // 2129-1 b: güncel planda iyileştirme araması açıktır, sonucu önizlenir.
    expect(within(ust).getByRole('button', { name: 'İyileştirme ara' }).getAttribute('aria-disabled')).toBeNull();
    expect(within(ust).getByRole('button', { name: '1 onayda' })).toBeTruthy();
    fireEvent.click(within(ust).getByRole('button', { name: 'Onaya gönder' }));
    expect(within(kart()).getByText('1 → 1')).toBeTruthy();
    const post = vi.spyOn(api, 'post').mockImplementation(((yol: string) => Promise.resolve(yol.endsWith('/taslak-yaz')
      ? { taslak: { id: 9, surum: 1 }, yazilan: 4, atlanan: 0, yazilamaz: [] }
      : { ...DEPO.senaryolar, senaryolar: [...DEPO.senaryolar!.senaryolar, senaryo(9, 'onayda')] })) as never);
    fireEvent.click(within(kart()).getByRole('button', { name: 'Gönder' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: /Onay ve canlı/ }).getAttribute('aria-selected')).toBe('true'));
    expect(post.mock.calls.map((x) => x[0])).toEqual(['/plan/planlama-calismasi/taslak-yaz', '/plan/senaryolar/9/onaya-gonder']);
    expect(post.mock.calls[0]?.[1]).toMatchObject({ calismaSurumu: 8, planSurumu: 3 });
    expect(String((post.mock.calls[0]?.[1] as { ad: string }).ad)).toMatch(/^Onay .+ · Ayşe$/);
    expect(post.mock.calls.map((x) => x[0])).not.toContain('/plan/senaryolar/9/canliya-al');
    expect(screen.getByText('Plan onaya gönderildi: 4 iş taslağa yazıldı. Canlıya onaylayan alır.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Onay ve canlı/ }).textContent).toBe('Onay ve canlı2');
    post.mockRestore();
  });

  it('planda yeri olmayan sipariş çubukta, onaya gönder kartında ve kontrolde listeyle aynı sayılır (1786 PLN-3)', () => {
    // İş emri durumu okunmadığı için (depo boş) planda olmayan adım bitmiş sayılır; siparişin adımları motorun yerleştiremedikleri listesindedir.
    const c = guncel(); const plan = c.plan as unknown as { J: Record<string, unknown>; ops: Record<string, { job?: string }>; fail: string[] };
    delete plan.J['3'];
    for (const [id, o] of Object.entries(plan.ops)) if (o.job === '3') { delete plan.ops[id]; plan.fail.push(id); }
    ac({ c });
    const ust = document.querySelector('.tc-pym-tp-ust') as HTMLElement;
    const say = within(ust).getByTitle(/^Geciken sipariş/);
    expect(say.textContent).toBe('2 geciken');
    expect(say.getAttribute('title')).toBe('Geciken sipariş; 1 tanesi planda yerleşmedi (bitişi bilinmiyor)');
    fireEvent.click(within(ust).getByRole('button', { name: 'Onaya gönder' }));
    expect(within(kart()).getByText('1 → 2')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: /Onay ve canlı/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Çalışma planı/ }));
    expect(screen.getByText(/^\d+ iş, 1 sipariş yerleşmedi: .+ \((adım derlenmedi|uygun tezgâh ya da fasoncu yok|önceki adım yerleşmedi|kaynak ya da ufuk yetmedi)\)/)).toBeTruthy();
    expect(screen.queryByText('Bütün işler yerleşti')).toBeNull();
  });

  it('onaya gönder kartı: sunucu reddederse iletisi gösterilir, kart açık kalır, taslaktan vazgeçilir', async () => {
    ac({ c: guncel() });
    fireEvent.click(within(document.querySelector('.tc-pym-tp-ust') as HTMLElement).getByRole('button', { name: 'Onaya gönder' }));
    const post = vi.spyOn(api, 'post').mockImplementation(((yol: string) => (yol.endsWith('/onaya-gonder')
      ? Promise.reject(new ApiHatasi(403, { kod: 'YETKI_YOK', mesaj: 'Bu işlem için yetkiniz yok.' }))
      : Promise.resolve(yol.endsWith('/taslak-yaz') ? { taslak: { id: 9, surum: 1 }, yazilan: 4, atlanan: 0, yazilamaz: [] } : DEPO.senaryolar))) as never);
    fireEvent.click(within(kart()).getByRole('button', { name: 'Gönder' }));
    await waitFor(() => expect(screen.getByText('Plan onaya gönderilemedi: Bu işlem için yetkiniz yok.')).toBeTruthy());
    expect(kart()).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Plan' }).getAttribute('aria-selected')).toBe('true');
    await waitFor(() => expect(post.mock.calls.map((x) => x[0])).toContain('/plan/senaryolar/9/vazgec'));
    post.mockRestore();
  });

  it('canlı farkı sunucudan okunur: açılışta hemen, çalışma değişince kayıt beklemesinden sonra; okunana kadar iddia yok', async () => {
    let cevap: unknown = { planSurumu: 3, ayni: false, guncel: true, tasinan: 2, tezgah: 1, sira: 1, yeni: 1, eksik: 0, isler: [], yazilamaz: [] };
    const get = vi.spyOn(api, 'get').mockImplementation(((yol: string) => (yol.endsWith('/canli-farki') ? Promise.resolve(cevap) : Promise.reject(new Error('yok')))) as never);
    ac();
    const ust = () => document.querySelector('.tc-pym-tp-ust') as HTMLElement;
    await waitFor(() => expect(within(ust()).getByTitle('Canlı plandan farklı').textContent).toBe('Taslak · 3 değişiklik'));
    expect(get).toHaveBeenCalledWith('/plan/planlama-calismasi/canli-farki');
    cevap = { ...(cevap as object), ayni: true, tasinan: 0, tezgah: 0, sira: 0, yeni: 0 };
    cleanup();
    ac();
    await waitFor(() => expect(within(ust()).getByTitle('Çalışma planı canlı planla aynı')).toBeTruthy());
    cevap = { ...(cevap as object), planSurumu: 0 };
    cleanup();
    ac();
    await waitFor(() => expect(within(ust()).getByTitle('Henüz canlıya alınmış plan yok')).toBeTruthy());
    get.mockRestore();
  });

  it('onaya gönder kartı: eski veriyle çözülmüş plan gönderilmez; neden kartta önceden yazılır, düğme Onay sekmesine götürür (1786 PLN-1)', () => {
    ac();
    const post = vi.spyOn(api, 'post');
    fireEvent.click(within(document.querySelector('.tc-pym-tp-ust') as HTMLElement).getByRole('button', { name: 'Onaya gönder' }));
    expect(within(kart()).queryByRole('button', { name: 'Gönder' })).toBeNull();
    expect(within(kart()).getByText(/^Gönderilemez: 1 bekleyen değişiklik plana uygulanmadı/)).toBeTruthy();
    fireEvent.click(within(kart()).getByRole('button', { name: 'Onay sekmesine git' }));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: /Onay ve canlı/ }).getAttribute('aria-selected')).toBe('true');
    post.mockRestore();
  });

  it('Onay sekmesi, bekleyen değişiklikler (755 a): kontrolde kırmızı, satırda kim ve etkilenen iş; reddet çalışmada, uygula sunucuda; kayıtsız eski değişiklik reddedilmez', async () => {
    const c = ornekCalisma(); const s1 = c.D.siparisler[0]!;
    c.dataVer = (c.plan?.dataVer ?? 0) + 2;
    c.bekleyen = [
      { id: ESKI_DEGISIKLIK, ne: 'Kaydı olmayan önceki değişiklikler', ayrinti: '', kim: '', t: 0, isler: ['*'], geri: null },
      { id: 'b1', ne: 'Adet değişti', ayrinti: '', kim: 'Deneme Planlamaci', t: Date.parse('2026-10-20T08:00:00Z'), isler: [s1.id], geri: [{ yol: ['D', 'siparisler'], id: s1.id, once: s1 }] },
    ];
    const { komut } = komutKur(c);
    const reddet = vi.fn((_idler: readonly string[], _gerekce: string) => null);
    ac({ c, komut: { ...komut, bekleyeniReddet: reddet } as CalismaKomutu });
    const get = vi.spyOn(api, 'get').mockImplementation(((yol: string) => (yol === '/plan/senaryolar' ? Promise.resolve(DEPO.senaryolar) : Promise.reject(new Error('yok')))) as never);
    const post = vi.spyOn(api, 'post').mockImplementation((() => Promise.reject(new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'x' }))) as never);
    fireEvent.click(screen.getByRole('tab', { name: /Onay ve canlı/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Çalışma planı/ }));
    expect(screen.getByText('2 bekleyen değişiklik var; aşağıda uygulayın ya da reddedin')).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Onaya gönder' }) as HTMLButtonElement).disabled).toBe(true);
    const bolum = screen.getByRole('heading', { name: /Bekleyen değişiklikler \(2\)/ }).closest('section') as HTMLElement;
    const [eski, yeni] = within(bolum).getAllByRole('listitem');
    expect(yeni!.textContent).toContain('Deneme Planlamaci');
    expect(yeni!.textContent).toContain(`Etkilenen: ${s1.ad ?? s1.id}`);
    expect(eski!.textContent).toContain('Etkilenen: Bütün işler');
    expect((within(eski!).getByRole('button', { name: 'Reddet' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(yeni!).getByRole('button', { name: 'Reddet' }));
    // 2129-2 b: ret gerekçe ister; gerekçe yazılmadan gönderilmez, satır düğmeleri form açıkken kapalı.
    let form = screen.getByRole('form', { name: 'Ret gerekçesi' });
    expect((within(form).getByRole('button', { name: 'Reddet' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(yeni!).getByRole('button', { name: 'Uygula' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(form).getByLabelText('Reddetme gerekçesi'), { target: { value: 'Termin değişmedi' } });
    fireEvent.click(within(form).getByRole('button', { name: 'Reddet' }));
    expect(reddet).toHaveBeenCalledWith(['b1'], 'Termin değişmedi');
    expect(screen.queryByRole('form', { name: 'Ret gerekçesi' })).toBeNull();
    fireEvent.click(within(yeni!).getByRole('button', { name: 'Uygula' }));
    await waitFor(() => expect(post.mock.calls[0]?.slice(0, 2)).toEqual(['/plan/planlama-degerlendirmesi', { surum: 8, istek: { tur: 'plan-uygula', isler: [s1.id] } }]));
    await waitFor(() => expect((within(bolum).getByRole('button', { name: 'Hepsini reddet' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(bolum).getByRole('button', { name: 'Hepsini reddet' }));
    form = screen.getByRole('form', { name: 'Ret gerekçesi' });
    fireEvent.change(within(form).getByLabelText('Reddetme gerekçesi'), { target: { value: 'Yanlış giriş' } });
    fireEvent.submit(form);
    expect(reddet).toHaveBeenLastCalledWith(['b1'], 'Yanlış giriş');
    post.mockRestore();
    get.mockRestore();
  });

  it('Onay sekmesi, çalışma: notla onaya gönderir; Onayla ve canlıya al ayrı düğmedir, ret sunucunun iletisiyle gösterilir ve plan onayda kalır', async () => {
    ac({ c: guncel(), mudur: true });
    const get = vi.spyOn(api, 'get').mockImplementation(((yol: string) => (yol === '/plan/senaryolar' ? Promise.resolve(DEPO.senaryolar) : Promise.reject(new Error('yok')))) as never);
    fireEvent.click(screen.getByRole('tab', { name: /Onay ve canlı/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Çalışma planı/ }));
    const post = vi.spyOn(api, 'post').mockImplementation(((yol: string) => {
      if (yol.endsWith('/canliya-al')) return Promise.reject(new ApiHatasi(422, { kod: 'GECERSIZ', mesaj: 'Kendi gönderdiğiniz planı canlıya alamazsınız.' }));
      return Promise.resolve(yol.endsWith('/taslak-yaz') ? { taslak: { id: 9, surum: 1 }, yazilan: 4, atlanan: 0, yazilamaz: [] }
        : { ...DEPO.senaryolar, senaryolar: [...DEPO.senaryolar!.senaryolar, senaryo(9, 'onayda')] });
    }) as never);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'M2 boşaldı' } });
    fireEvent.click(screen.getByRole('button', { name: 'Onaya gönder' }));
    await waitFor(() => expect(post.mock.calls.map((x) => x[0])).toEqual(['/plan/planlama-calismasi/taslak-yaz', '/plan/senaryolar/9/onaya-gonder']));
    expect(post.mock.calls[1]?.[1]).toEqual({ surum: 1, not: 'M2 boşaldı' });
    await waitFor(() => expect(document.querySelector('.tc-pym-pa-aday[aria-current="true"]')?.textContent).toContain('Senaryo 9'));
    post.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /^Çalışma planı/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Onayla ve canlıya al' }));
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /canlıya al$/ }));
    await waitFor(() => expect(screen.getByText('Plan canlıya alınamadı, onayda bekliyor: Kendi gönderdiğiniz planı canlıya alamazsınız.')).toBeTruthy());
    expect(post.mock.calls.map((x) => x[0])).toEqual(['/plan/planlama-calismasi/taslak-yaz', '/plan/senaryolar/9/onaya-gonder', '/plan/senaryolar/9/canliya-al']);
    expect(get).toHaveBeenCalledWith('/plan/senaryolar');
    post.mockRestore();
    get.mockRestore();
  });

  it('Onay sekmesi, senaryo: Çalışmaya aç önce sorar, taslağı çalışmaya yazar, sayfayı yeniden okur; bildirimden geri alınır', async () => {
    const { yenile } = ac({ c: guncel() });
    const get = vi.spyOn(api, 'get').mockImplementation(((yol: string) => (yol === '/plan/senaryolar' ? Promise.resolve(DEPO.senaryolar) : Promise.reject(new Error('yok')))) as never);
    fireEvent.click(screen.getByRole('tab', { name: /Onay ve canlı/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Senaryo 2/ }));
    const post = vi.spyOn(api, 'post').mockImplementation(((yol: string) => Promise.resolve(yol.endsWith('/taslaktan-yaz')
      ? { calismaSurumu: 9, oncekiSurum: 8, yazilan: 3, kilitli: 0, atlanan: [] }
      : { calismaSurumu: 10, donulenSurum: 8 })) as never);
    fireEvent.click(screen.getByRole('button', { name: 'Çalışmaya aç' }));
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Yükle' }));
    await waitFor(() => expect(post.mock.calls[0]?.slice(0, 2)).toEqual(['/plan/planlama-calismasi/taslaktan-yaz', { taslakId: 2, taslakSurumu: 4, calismaSurumu: 8 }]));
    await waitFor(() => expect(screen.getByText('"Senaryo 2" çalışmaya yüklendi: 3 iş çalışmaya yazıldı. Plan yeniden çözülmeli.')).toBeTruthy());
    expect(yenile).toHaveBeenCalledTimes(1);
    fireEvent.click(within(screen.getByRole('region', { name: 'Bildirimler' })).getByRole('button', { name: 'Geri al' }));
    await waitFor(() => expect(post.mock.calls[1]?.slice(0, 2)).toEqual(['/plan/planlama-calismasi/geri-al', { calismaSurumu: 9 }]));
    await waitFor(() => expect(yenile).toHaveBeenCalledTimes(2));
    post.mockRestore();
    get.mockRestore();
  });

  it('Onay sekmesi, senaryo: ek mesai kıyası, veri farkı ve bütçe kontrolü sunucunun ek mesaisinden; bütçe aşımı onaya göndermeyi kapatır', async () => {
    const em = (gun: string, asildi: boolean) => ({ satirlar: [{ makineId: 1, gun, vardiyaId: 3, saat: 8 }], toplamSaat: 8, haftaSiniriSaat: 8, haftalar: [], asanHaftalar: [], asildi });
    const plan = (e: unknown) => ({ kaynaklar: [{ tur: 'makine', id: 1, kod: 'M1', ad: 'M1' }], yerlesimler: [], emirler: [], gostergeler: GOSTERGE, ekMesai: e });
    const get = vi.spyOn(api, 'get').mockImplementation(((yol: string) => (yol === '/plan' ? Promise.resolve(plan(em('2026-10-27', false)))
      : yol.startsWith('/plan?taslak=') ? Promise.resolve(plan({ ...em('2026-10-26', true), satirlar: [{ makineId: 1, gun: '2026-10-26', vardiyaId: 3, saat: 8 }, { makineId: 1, gun: '2026-10-27', vardiyaId: 3, saat: 8 }], toplamSaat: 16 }))
        : Promise.reject(new Error('yok')))) as never);
    ac({ c: guncel() });
    fireEvent.click(screen.getByRole('tab', { name: /Onay ve canlı/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Senaryo 2/ }));
    await waitFor(() => expect(screen.getByText('Ek mesai: M1, 26.10 Pzt, vardiya 3')).toBeTruthy());
    expect(screen.getByText('16,0 sa')).toBeTruthy();
    expect(screen.getByText('Haftalık ek mesai bütçesi (8 sa) aşılıyor')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Onaya gönder' }).hasAttribute('disabled')).toBe(true);
    get.mockRestore();
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
    expect(within(ray).getByText(/Çözüm yolu: öne alın/).textContent).not.toContain(MOTOR_NOTU);
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

  it('taşı (1981 b, 1982 a): iş kartındaki saat ve tezgâh düğmeleri sunucu komutudur; çalışma önce kaydedilir, cevaptan sonra sayfa yenilenir', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ calismaSurumu: 9, oncekiSurum: 8 });
    const c = ornekCalisma(); const { komut } = komutKur(c);
    const { yenile } = ac({ c, komut });
    fireEvent.click(document.querySelector('[data-id="2.40"]') as HTMLElement);
    expect(within(kart()).getByRole('button', { name: '5', pressed: true })).toBeTruthy();
    fireEvent.click(within(kart()).getByRole('button', { name: '+1 sa' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/plan/planlama-calismasi/is-tasi', { isId: '2.40', tezgah: '5', baslangic: 209, calismaSurumu: 8 }, expect.anything()));
    await waitFor(() => expect(yenile).toHaveBeenCalledTimes(1));
    // 2791: komut geri alma geçmişine girer (sayfa yeniden okununca adım olur); düşmediği için komutDustu çağrılmaz.
    expect(komut.komutBasladi).toHaveBeenCalledWith('İş taşındı');
    expect(komut.komutDustu).not.toHaveBeenCalled();
    post.mockRestore();
  });

  it('2791: taşıma komutu düşerse komutDustu çağrılır, geri alma adımı bırakmaz; sayfa yenilenmez', async () => {
    const post = vi.spyOn(api, 'post').mockRejectedValue(new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Başlamış iş taşınamaz.' }));
    const c = ornekCalisma(); const { komut } = komutKur(c);
    const { yenile } = ac({ c, komut });
    fireEvent.click(document.querySelector('[data-id="2.40"]') as HTMLElement);
    fireEvent.click(within(kart()).getByRole('button', { name: '+1 sa' }));
    await waitFor(() => expect(komut.komutDustu).toHaveBeenCalledTimes(1));
    expect(komut.komutBasladi).toHaveBeenCalledWith('İş taşındı');
    expect(vi.mocked(komut.komutBasladi!).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(komut.komutDustu!).mock.invocationCallOrder[0]!);
    expect(yenile).not.toHaveBeenCalled();
    post.mockRestore();
  });

  it('sürükle-bırak taşır, kısa dokunuş kartı açar; sunucu reddederse iletisi gösterilir, sayfa yenilenmez', async () => {
    const post = vi.spyOn(api, 'post').mockRejectedValue(new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Başlamış iş taşınamaz.' }));
    const { yenile } = ac();
    const cubuk = document.querySelector('[data-id="2.40"]') as HTMLElement;
    fireEvent.pointerDown(cubuk, { button: 0, clientX: 100, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(cubuk, { clientX: 160, clientY: 10, pointerId: 1 });
    expect(cubuk.dataset['surukle']).toBe('');
    fireEvent.pointerUp(cubuk, { clientX: 160, clientY: 10, pointerId: 1 });
    fireEvent.click(cubuk);
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(cubuk.dataset['surukle']).toBeUndefined();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    const [yol, govde] = post.mock.calls[0] as [string, { isId: string; tezgah: string; baslangic: number }];
    expect(yol).toBe('/plan/planlama-calismasi/is-tasi');
    expect(govde).toMatchObject({ isId: '2.40', tezgah: '5' });
    expect(govde.baslangic).toBeGreaterThan(208);
    expect(govde.baslangic * 4).toBe(Math.round(govde.baslangic * 4));
    await waitFor(() => expect(screen.getByText(/Başlamış iş taşınamaz/)).toBeTruthy());
    expect(yenile).not.toHaveBeenCalled();
    // Komut düşünce bırakılan çubuk kısa süre sonra eski yerine döner.
    await waitFor(() => expect(cubuk.style.getPropertyValue('--dx')).toBe(''), { timeout: 4000 });
    fireEvent.pointerDown(cubuk, { button: 0, clientX: 100, clientY: 10, pointerId: 2 });
    fireEvent.pointerUp(cubuk, { clientX: 102, clientY: 10, pointerId: 2 });
    fireEvent.click(cubuk);
    expect(within(kart()).getByText('Neden bu saatte')).toBeTruthy();
    expect(post).toHaveBeenCalledTimes(1);
    post.mockRestore();
  });

  it('2789: sürükleme durunca itme önizlemesi sorulur; itilenler kesikli çubukla çizilir, eski cevap atılır, bırakınca sunucunun nedeni bildirimde', async () => {
    let cevapla: ((c: unknown) => void)[] = [];
    const get = vi.spyOn(api, 'get').mockImplementation(((yol: string) => (yol.startsWith('/plan/planlama-calismasi/is-tasi-onizlemesi')
      ? new Promise((r) => { cevapla.push(r); }) : Promise.reject(new Error('yok')))) as never);
    const post = vi.spyOn(api, 'post').mockResolvedValue({ calismaSurumu: 9, oncekiSurum: 8, ileti: 'Aynı emrin 1 adımı itildi.' });
    ac();
    const cubuk = document.querySelector('[data-id="2.40"]') as HTMLElement;
    const m = cubuk.closest<HTMLElement>('.tc-pym-tp-satir')?.dataset['m'] ?? '';
    fireEvent.pointerDown(cubuk, { button: 0, clientX: 100, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(cubuk, { clientX: 140, clientY: 10, pointerId: 1 });
    // Her harekette değil, durunca sorulur.
    expect(get.mock.calls.filter(([y]) => String(y).includes('is-tasi-onizlemesi'))).toHaveLength(0);
    await waitFor(() => expect(cevapla).toHaveLength(1));
    const ilkYol = String(get.mock.calls.find(([y]) => String(y).includes('is-tasi-onizlemesi'))?.[0]);
    expect(ilkYol).toContain('isId=2.40'); expect(ilkYol).toContain(`tezgah=${encodeURIComponent(m)}`);
    const ilk = cevapla[0]!;
    fireEvent.pointerMove(cubuk, { clientX: 170, clientY: 10, pointerId: 1 });
    await waitFor(() => expect(cevapla).toHaveLength(2));
    // Önceki yerin geç gelen cevabı atılır: hayalet çizilmez.
    ilk({ gecerli: true, ileti: null, isler: [{ isId: 'X1', tezgah: m, S: 300, C: 302, eskiTezgah: m, eskiS: 299, tur: 'itilen' }] });
    await new Promise((r) => { setTimeout(r, 20); });
    expect(document.querySelector('.tc-pym-tp-hayalet[data-itme]')).toBeNull();
    cevapla[1]!({ gecerli: true, ileti: 'Aynı emrin 1 adımı itilecek.', isler: [
      { isId: '2.40', tezgah: m, S: 210, C: 212, eskiTezgah: m, eskiS: 208, tur: 'tasinan' },
      { isId: 'X1', tezgah: m, S: 300, C: 302, eskiTezgah: m, eskiS: 299, tur: 'itilen' },
    ] });
    await waitFor(() => expect(document.querySelectorAll('.tc-pym-tp-hayalet[data-itme="itilen"]')).toHaveLength(1));
    expect(document.querySelector('.tc-pym-tp-hayalet[data-itme="tasinan"]')).toBeNull();
    expect(cubuk.dataset['cakisma']).toBeUndefined();
    expect(screen.getByText('Aynı emrin 1 adımı itilecek.')).toBeTruthy();
    fireEvent.pointerUp(cubuk, { clientX: 170, clientY: 10, pointerId: 1 });
    expect(document.querySelector('.tc-pym-tp-hayalet[data-itme]')).toBeNull();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByText(/Aynı emrin 1 adımı itildi\./)).toBeTruthy());
    cevapla = [];
    get.mockRestore(); post.mockRestore();
  });

  it('2789-2: önizleme sürükleme başına bir kez kaydedilen sürümle karşılaştırılır; sürümü tutmayan hesap gösterilmez', async () => {
    let surum = 7;
    const get = vi.spyOn(api, 'get').mockImplementation(((yol: string) => (yol.startsWith('/plan/planlama-calismasi/is-tasi-onizlemesi')
      ? Promise.resolve({ gecerli: true, ileti: `Sürüm ${String(surum)}`, calismaSurumu: surum, isler: [{ isId: 'X1', tezgah: '5', S: 300, C: 302, eskiTezgah: '5', eskiS: 299, tur: 'itilen' }] })
      : Promise.reject(new Error('yok')))) as never);
    const c = ornekCalisma(); const { komut } = komutKur(c);
    ac({ c, komut });
    const cubuk = document.querySelector('[data-id="2.40"]') as HTMLElement;
    const onizlemeler = () => get.mock.calls.filter(([y]) => String(y).includes('is-tasi-onizlemesi')).length;
    fireEvent.pointerDown(cubuk, { button: 0, clientX: 100, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(cubuk, { clientX: 140, clientY: 10, pointerId: 1 });
    await waitFor(() => expect(onizlemeler()).toBe(1));
    await new Promise((r) => { setTimeout(r, 20); });
    expect(screen.queryByText('Sürüm 7')).toBeNull();
    expect(document.querySelector('.tc-pym-tp-hayalet[data-itme]')).toBeNull();
    surum = 8;
    fireEvent.pointerMove(cubuk, { clientX: 170, clientY: 10, pointerId: 1 });
    await waitFor(() => expect(screen.getByText('Sürüm 8')).toBeTruthy());
    expect(komut.kaydet).toHaveBeenCalledTimes(1);
    fireEvent.pointerCancel(cubuk, { pointerId: 1 });
    get.mockRestore();
  });

  it('2789: sunucu taşımayı geçersiz sayarsa çubuk kırmızı çerçeve alır, ipucunda nedeni yazar; uç yoksa eski önizleme sürer', async () => {
    let gecerli = false;
    const get = vi.spyOn(api, 'get').mockImplementation(((yol: string) => (yol.startsWith('/plan/planlama-calismasi/is-tasi-onizlemesi')
      ? (gecerli ? Promise.reject(new ApiHatasi(404, { kod: 'BULUNAMADI', mesaj: 'yok' })) : Promise.resolve({ gecerli: false, ileti: 'Plan ufku aşılır; taşıma yapılmaz.', isler: [] }))
      : Promise.reject(new Error('yok')))) as never);
    ac();
    const cubuk = document.querySelector('[data-id="2.40"]') as HTMLElement;
    fireEvent.pointerDown(cubuk, { button: 0, clientX: 100, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(cubuk, { clientX: 160, clientY: 10, pointerId: 1 });
    await waitFor(() => expect(cubuk.dataset['cakisma']).toBe(''));
    expect(screen.getByText('Plan ufku aşılır; taşıma yapılmaz.')).toBeTruthy();
    gecerli = true;
    fireEvent.pointerMove(cubuk, { clientX: 175, clientY: 10, pointerId: 1 });
    await waitFor(() => expect(get.mock.calls.filter(([y]) => String(y).includes('is-tasi-onizlemesi'))).toHaveLength(2));
    await waitFor(() => expect(screen.queryByText('Plan ufku aşılır; taşıma yapılmaz.')).toBeNull());
    fireEvent.keyDown(cubuk, { key: 'Escape' });
    fireEvent.pointerCancel(cubuk, { pointerId: 1 });
    get.mockRestore();
  });

  it('2788: bırakılan çubuk yeni yeri gelene kadar bırakıldığı yerde durur, sayfa yeniden kurulmaz; yeni planda geçişsiz oturur', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ calismaSurumu: 9, oncekiSurum: 8 });
    const c = ornekCalisma();
    const yenile = vi.fn();
    const oz = (calisma: PlanlamaCalismasi): Omit<PlanlamaEkranOzellikleri, 'olcek' | 'olcekSec' | 'kaydir' | 'secim' | 'sec'> => ({
      depo: DEPO, calisma, komut: komutKur(c).komut, git: vi.fn(), yenile, istek: null, yetki: yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz', 'plan.studyo']),
    });
    const { rerender } = render(<MemoryRouter><BildirimSaglayici><Iskelet {...oz(c)} /></BildirimSaglayici></MemoryRouter>);
    const cubuk = document.querySelector('[data-id="2.40"]') as HTMLElement;
    fireEvent.pointerDown(cubuk, { button: 0, clientX: 100, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(cubuk, { clientX: 160, clientY: 10, pointerId: 1 });
    fireEvent.pointerUp(cubuk, { clientX: 160, clientY: 10, pointerId: 1 });
    await waitFor(() => expect(yenile).toHaveBeenCalledTimes(1));
    expect(cubuk.dataset['surukle']).toBeUndefined();
    expect(cubuk.dataset['birakildi']).toBe('');
    const dx = cubuk.style.getPropertyValue('--dx');
    expect(dx).not.toBe('');
    // Yeniden okunan çalışma (yalnız kilit yazılmış, yer aynı) çubuğu bırakmaz.
    const kilitli = structuredClone(c);
    rerender(<MemoryRouter><BildirimSaglayici><Iskelet {...oz(kilitli)} /></BildirimSaglayici></MemoryRouter>);
    expect(cubuk.style.getPropertyValue('--dx')).toBe(dx);
    // Uygulanan planda iş yeni saatindedir: çubuk aynı öğe kalır, kayma silinir, geçişsiz oturur.
    const yeni = structuredClone(c);
    const plan = yeni.plan as unknown as { ops: Record<string, { S: number; C: number }> } | null;
    const op = plan?.ops['2.40'];
    if (!op || !plan) throw new Error('örnek planda 2.40 yok');
    plan.ops['2.40'] = { ...op, S: op.S + 2, C: op.C + 2 };
    rerender(<MemoryRouter><BildirimSaglayici><Iskelet {...oz(yeni)} /></BildirimSaglayici></MemoryRouter>);
    const sonra = document.querySelector('[data-id="2.40"]') as HTMLElement;
    expect(sonra).toBe(cubuk);
    expect(cubuk.style.getPropertyValue('--dx')).toBe('');
    expect(cubuk.dataset['birakildi']).toBe('');
    await waitFor(() => expect(cubuk.dataset['birakildi']).toBeUndefined());
    post.mockRestore();
  });

  it('2725: yavaş sürüklemede imlecin altındaki sürüklenen çubuk hedef satırı belirlemez; hedef titremez', () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ calismaSurumu: 9, oncekiSurum: 8 });
    ac();
    const cubuk = document.querySelector('[data-id="2.40"]') as HTMLElement;
    const kendi = cubuk.closest('.tc-pym-tp-satir[data-m]') as HTMLElement;
    const diger = [...document.querySelectorAll<HTMLElement>('.tc-pym-tp-satir[data-m]')].find((e) => e !== kendi) as HTMLElement;
    expect(diger).toBeTruthy();
    // Çubuk imlecin altında kalır (iz sürerken üstte çizilir); altında başka tezgâhın satırı vardır.
    const ust = (cubuk.firstElementChild as HTMLElement | null) ?? cubuk;
    const eski = document.elementsFromPoint;
    document.elementsFromPoint = () => [ust, cubuk, diger];
    const hedefler: string[] = [];
    try {
      fireEvent.pointerDown(cubuk, { button: 0, clientX: 100, clientY: 10, pointerId: 1 });
      for (let i = 1; i <= 8; i++) {
        fireEvent.pointerMove(cubuk, { clientX: 100 + i * 2, clientY: 10 + i * 4, pointerId: 1 });
        hedefler.push([...document.querySelectorAll<HTMLElement>('.tc-pym-tp-satir[data-hedef]')].map((e) => e.dataset['m'] ?? '').join(','));
      }
    } finally {
      document.elementsFromPoint = eski;
    }
    // İlk hareketler eşiğin altında (6 px); eşik geçilince hedef hep alttaki satırdır, kendi satırına dönmez.
    const dolu = hedefler.filter((h) => h !== '');
    expect(dolu.length).toBeGreaterThan(0);
    expect(new Set(dolu)).toEqual(new Set([diger.dataset['m']]));
    fireEvent.pointerCancel(cubuk, { pointerId: 1 });
    post.mockRestore();
  });

  it('2081-1, 2, 5: sürüklerken eski yerde kesikli kutu ve ipucu; bırakınca kalkar. Klavyede oklar önizler, Enter taşır, Esc vazgeçer', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ calismaSurumu: 9, oncekiSurum: 8 });
    ac();
    const cubuk = document.querySelector('[data-id="2.40"]') as HTMLElement;
    const hayalet = () => document.querySelector('.tc-pym-tp-hayalet');
    const ipucu = () => document.querySelector('.tc-pym-tp-yuzen[data-acik]');
    fireEvent.pointerDown(cubuk, { button: 0, clientX: 100, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(cubuk, { clientX: 160, clientY: 10, pointerId: 1 });
    expect(hayalet()).not.toBeNull();
    expect(ipucu()?.textContent).toMatch(/^5 · /);
    fireEvent.pointerUp(cubuk, { clientX: 160, clientY: 10, pointerId: 1 });
    expect(hayalet()).toBeNull();
    expect(ipucu()).toBeNull();
    await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    post.mockClear();
    cubuk.focus();
    fireEvent.keyDown(cubuk, { key: 'ArrowRight' });
    fireEvent.keyDown(cubuk, { key: 'ArrowRight' });
    expect(hayalet()).not.toBeNull();
    expect(ipucu()?.textContent).toContain('Enter taşır');
    fireEvent.keyDown(cubuk, { key: 'Escape' });
    expect(hayalet()).toBeNull();
    expect(post).not.toHaveBeenCalled();
    fireEvent.keyDown(cubuk, { key: 'ArrowRight' });
    fireEvent.keyDown(cubuk, { key: 'ArrowRight' });
    fireEvent.keyDown(cubuk, { key: 'Enter' });
    await waitFor(() => expect(post).toHaveBeenCalledWith('/plan/planlama-calismasi/is-tasi', expect.objectContaining({ isId: '2.40', tezgah: '5', baslangic: 208.5 }), expect.anything()));
    post.mockRestore();
  });

  it('kurum Gantt yardımlarını kapattıysa kesikli kutu ve ipucu çizilmez, iş bilgisi tarayıcı başlığında kalır; taşıma çalışır', async () => {
    document.documentElement.setAttribute('data-etki-kapali', 'gantt-yardim');
    const post = vi.spyOn(api, 'post').mockResolvedValue({ calismaSurumu: 9, oncekiSurum: 8 });
    try {
      ac();
      const cubuk = document.querySelector('[data-id="2.40"]') as HTMLElement;
      expect(cubuk.getAttribute('title')).toContain(' → ');
      fireEvent.pointerDown(cubuk, { button: 0, clientX: 100, clientY: 10, pointerId: 1 });
      fireEvent.pointerMove(cubuk, { clientX: 160, clientY: 10, pointerId: 1 });
      expect(document.querySelector('.tc-pym-tp-hayalet')).toBeNull();
      expect(document.querySelector('.tc-pym-tp-yuzen[data-acik]')).toBeNull();
      fireEvent.pointerUp(cubuk, { clientX: 160, clientY: 10, pointerId: 1 });
      await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
    } finally {
      document.documentElement.removeAttribute('data-etki-kapali');
      post.mockRestore();
    }
  });

  it('ek mesai (2053): tezgâh günlüğündeki düğme boş vardiyaları gösterir, seçilen sunucuya gider; arıza bildir olay formunu o tezgâhla açar', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ calismaSurumu: 9, oncekiSurum: 8 });
    const c = ornekCalisma();
    const m = c.D.tezgahlar[0]!.id;
    c.D.tezgahlar[0]!.vardiyalar = ['1'];
    const { yenile } = ac({ c });
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(`^${m}\\b`) })[0]!);
    const gunlukDugmesi = screen.queryByRole('button', { name: 'Ek mesai' });
    if (gunlukDugmesi === null) { post.mockRestore(); throw new Error('Tezgâh günlüğü açılamadı'); }
    fireEvent.click(gunlukDugmesi);
    const k = screen.getByRole('dialog', { name: `${m} ek mesai` });
    const cip = within(k).getAllByRole('button').find((b) => b.classList.contains('tc-pym-tp-cip'))!;
    expect(cip.textContent).toContain(' 2 ');
    fireEvent.click(cip);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/plan/planlama-calismasi/ek-mesai-ekle', expect.objectContaining({ tezgah: m, vardiya: '2', calismaSurumu: 8 }), expect.anything()));
    await waitFor(() => expect(yenile).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getAllByRole('button', { name: new RegExp(`^${m}\\b`) })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Arıza bildir' }));
    expect((within(screen.getByRole('dialog', { name: 'Olay ekle' })).getByLabelText('Tezgâh') as HTMLSelectElement).value).toBe(m);
    post.mockRestore();
  });

  it('2053-1 a: komut çalışmayı değiştirdiyse yenilenen sayfa bekleyen değişiklikleri kendiliğinden uygular; değişmeyen komut uygulatmaz', async () => {
    const post = vi.spyOn(api, 'post').mockImplementation((() => new Promise(() => undefined)) as never);
    const c = ornekCalisma();
    const { komut } = komutKur(c);
    otomatikUygulaIste({ calismaSurumu: 8, oncekiSurum: 8 });
    ac({ c, komut, depo: { ...DEPO, calismaSurumu: 8 } as PlanlamaDeposu });
    await new Promise((r) => setTimeout(r, 0));
    expect(komut.kaydet).not.toHaveBeenCalled();
    cleanup();
    otomatikUygulaIste({ calismaSurumu: 9, oncekiSurum: 8 });
    ac({ c, komut, depo: { ...DEPO, calismaSurumu: 9 } as PlanlamaDeposu });
    await waitFor(() => expect(post).toHaveBeenCalledWith(expect.stringContaining('degerlendirme'), { surum: 8, istek: { tur: 'plan-uygula', isler: ['*'] } }, expect.anything()));
    post.mockRestore();
    planKurSifirla();
  });

  it('olay ekle (1982 a): formdan sunucuya gider, kart kapanır; yazamayan için Olay pasif, taşı düğmesi ve sürükleme yok', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ calismaSurumu: 9, oncekiSurum: 8 });
    const { yenile } = ac();
    fireEvent.click(screen.getByRole('button', { name: /^Olay:/ }));
    const k = screen.getByRole('dialog', { name: 'Olay ekle' });
    // Başlangıç tarih ve saatle seçilir: plan saati 10 (şimdi 8 + 2).
    const on = new Date((tabanMs(ornekCalisma().D) ?? 0) + 10 * 3_600_000).toISOString().slice(0, 16);
    fireEvent.change(within(k).getByLabelText('Başlangıç (boşsa şimdi)'), { target: { value: on } });
    fireEvent.change(within(k).getByLabelText('Süre (saat)'), { target: { value: '6' } });
    fireEvent.click(within(k).getByRole('button', { name: 'Olayı ekle' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/plan/planlama-calismasi/olay-ekle', { calismaSurumu: 8, olay: { tip: 'ariza', m: '5', bas: 10, saat: 6 } }, expect.anything()));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(yenile).toHaveBeenCalledTimes(1);
    // Eksik alanla gönderilmez.
    fireEvent.click(screen.getByRole('button', { name: /^Olay:/ }));
    fireEvent.click(within(kart()).getByRole('button', { name: 'Acil sipariş' }));
    fireEvent.click(within(kart()).getByRole('button', { name: 'Olayı ekle' }));
    expect(within(kart()).getByRole('button', { name: 'Olayı ekle' }).getAttribute('aria-disabled')).toBe('true');
    expect(post.mock.calls.map((c) => c[0])).toEqual(['/plan/planlama-calismasi/olay-ekle']);
    cleanup();
    ac({ yaz: false });
    expect(screen.getByRole('button', { name: /^Olay:/ }).getAttribute('aria-disabled')).toBe('true');
    const cubuk = document.querySelector('[data-id="2.40"]') as HTMLElement;
    fireEvent.pointerDown(cubuk, { button: 0, clientX: 100, clientY: 10, pointerId: 1 });
    fireEvent.pointerMove(cubuk, { clientX: 160, clientY: 10, pointerId: 1 });
    expect(cubuk.dataset['surukle']).toBeUndefined();
    fireEvent.click(cubuk);
    expect(within(kart()).queryByRole('button', { name: '+1 sa' })).toBeNull();
    post.mockRestore();
  });

  it('geçmiş bir başlangıç seçilse de arıza şimdiden başlar (kart 3042 madde 5)', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ calismaSurumu: 9, oncekiSurum: 8 });
    ac();
    fireEvent.click(screen.getByRole('button', { name: /^Olay:/ }));
    const k = screen.getByRole('dialog', { name: 'Olay ekle' });
    // Plan saati 6, şimdi 8: geçmiş an.
    const once = new Date((tabanMs(ornekCalisma().D) ?? 0) + 6 * 3_600_000).toISOString().slice(0, 16);
    fireEvent.change(within(k).getByLabelText('Başlangıç (boşsa şimdi)'), { target: { value: once } });
    fireEvent.change(within(k).getByLabelText('Süre (saat)'), { target: { value: '3' } });
    fireEvent.click(within(k).getByRole('button', { name: 'Olayı ekle' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/plan/planlama-calismasi/olay-ekle', { calismaSurumu: 8, olay: { tip: 'ariza', m: '5', bas: 8, saat: 3 } }, expect.anything()));
    post.mockRestore();
  });

  it('saat ilerledikten sonra eklenen arıza yeni saatten başlar; şimdi sayfa açıkken donmaz (2506 a)', async () => {
    const post = vi.spyOn(api, 'post').mockResolvedValue({ calismaSurumu: 9, oncekiSurum: 8 });
    ac();
    fireEvent.click(screen.getByRole('button', { name: /^Olay:/ }));
    const k = screen.getByRole('dialog', { name: 'Olay ekle' });
    fireEvent.change(within(k).getByLabelText('Süre (saat)'), { target: { value: '6' } });
    // Form açıkken üç saat geçer; olay gönderme anının saatine yazılır (8 → 11).
    vi.setSystemTime(Date.now() + 3 * 3_600_000);
    fireEvent.click(within(k).getByRole('button', { name: 'Olayı ekle' }));
    await waitFor(() => expect(post).toHaveBeenCalledWith('/plan/planlama-calismasi/olay-ekle', { calismaSurumu: 8, olay: { tip: 'ariza', m: '5', bas: 11, saat: 6 } }, expect.anything()));
    post.mockRestore();
  });

  it('akış oku çubukların planlı saatinden çizilir: geçiş sürerken ölçülen eski yere kaymaz (1980)', () => {
    ac();
    fireEvent.click(document.querySelector('[data-id="2.40"]') as HTMLElement);
    const yer = (id: string) => {
      const s = (document.querySelector(`[data-id="${id}"]`) as HTMLElement).style;
      return { x: parseFloat(s.getPropertyValue('--x')), w: parseFloat(s.getPropertyValue('--w')) };
    };
    const yollar = [...document.querySelectorAll('.tc-pym-tp-oklar > path')].map((p) => p.getAttribute('d') ?? '');
    expect(yollar.length).toBeGreaterThan(0);
    // Etiket sütunu jsdom'da ölçülemez, varsayılan genişliği (115 px) kullanılır.
    const once = yer('2.30'), sonra = yer('2.40');
    const yol = yollar.find((d) => d.startsWith(`M${String(115 + once.x + once.w)},`));
    expect(yol, yollar.join(' | ')).toBeTruthy();
    expect(yol?.split(' ').at(-1)?.split(',')[0]).toBe(String(115 + sonra.x - 3));
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
  });

  it('Atölye ekranı: Diğer menüsünden açılır; canlı plan sunucudan, okunurken, canlı yokken ve varken; tezgâh durumu, sıradaki, geciken; Esc ve Çık kapatır; her rolde aynı', async () => {
    let cevap: Promise<unknown> = new Promise(() => undefined);
    const get = vi.spyOn(api, 'get').mockImplementation(((yol: string) => (yol.endsWith('/taban-ve-canli') ? cevap : Promise.reject(new Error('yok')))) as never);
    const ekran = () => screen.getByRole('region', { name: 'Atölye ekranı' });
    const ekranAc = (yaz = true) => { ac({ yaz }); fireEvent.click(screen.getByRole('button', { name: 'Diğer' })); fireEvent.click(within(kart()).getByRole('button', { name: 'Atölye ekranı' })); };
    ekranAc();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(within(ekran()).getByText('Canlı plan okunuyor.')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'Atölye ekranı' })).toBeNull();
    cleanup();
    cevap = Promise.resolve({ planSurumu: 0, isler: [] });
    ekranAc();
    await waitFor(() => expect(within(ekran()).getByText(/Henüz canlı plan yok/)).toBeTruthy());
    cleanup();
    const iso = (t: number) => new Date(Date.UTC(2026, 9, 19) - 3 * 3_600_000 + t * 3_600_000).toISOString();
    const is = (k: string, m: number, S: number, C: number) => ({ k, anahtar: `E|${k}`, isEmriId: 1, uretimEmriId: 1, taban: null, canli: { kaynak: { tur: 'makine', id: m }, baslangic: iso(S), bitis: iso(C), parcalar: [] } });
    cevap = Promise.resolve({ planSurumu: 3, isler: [is('3.10', 1, 7, 9), is('3.20', 1, 20, 400)] });
    const gor = async (yaz: boolean) => {
      ekranAc(yaz);
      const t1 = await within(ekran()).findByRole('region', { name: 'Tezgâh 1' });
      const l = ekran().textContent;
      expect(t1.getAttribute('data-durum')).toBe('calisiyor');
      expect(within(t1).getByText(/Sıradaki:/).textContent).toContain('3');
      expect(within(ekran()).getByRole('region', { name: 'Tezgâh 4' }).getAttribute('data-durum')).toBe('bos');
      expect(within(screen.getByRole('complementary', { name: 'Geciken' })).getByText(/^Geciken · \d+$/)).toBeTruthy();
      fireEvent.click(within(ekran()).getByRole('button', { name: 'Çık' }));
      expect(screen.queryByRole('region', { name: 'Atölye ekranı' })).toBeNull();
      cleanup(); return l;
    };
    expect(await gor(false)).toEqual(await gor(true));
    get.mockRestore();
  });

  it('sabah brifingi katlı başlar, günün ilk açılışında düğmesi vurgulu (gün tarayıcıda); gün başı açılışta çalışmaya sessiz yazılır', () => {
    localStorage.removeItem(BRIF);
    const c = ornekCalisma();
    const { komut, yazilan } = komutKur(c);
    ac({ c, komut });
    expect(screen.queryByRole('region', { name: 'Sabah brifingi' })).toBeNull();
    const d = screen.getByRole('button', { expanded: false, name: /brifing/ });
    expect(d.hasAttribute('data-yeni')).toBe(true);
    fireEvent.click(d);
    const b = screen.getByRole('region', { name: 'Sabah brifingi' });
    expect(within(b).getByText('1 geciken, 1 riskli sipariş')).toBeTruthy();
    expect(localStorage.getItem(BRIF)).toBe(bugunAnahtari());
    fireEvent.click(within(b).getByRole('button', { name: 'Brifingi katla' }));
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
    // Planı kur sunucudaki motorla açık (576): boş kartta ve Onay sekmesinin çalışma planı kutusunda
    expect((screen.getByRole('button', { name: 'Planı kur' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('tab', { name: 'Onay ve canlı' }));
    expect((screen.getByRole('button', { name: 'Planı kur' }) as HTMLButtonElement).disabled).toBe(false);
    cleanup();
    ac({ c: { ...ornekCalisma(), plan: null } as PlanlamaCalismasi, yaz: false });
    fireEvent.click(screen.getByRole('tab', { name: 'Onay ve canlı' }));
    expect((screen.getByRole('button', { name: 'Planı kur' }) as HTMLButtonElement).disabled).toBe(true);
  });
});

// 2531 a: Düzenle ve Yapılacaklar atölyede de; motor isteyen pasif düğmeler bağlandı, gerçek başlama ve sayım terminalin göstergesi kaldı.
describe('PlanlamaAtolyesi 2531 a', () => {
  it('Şu olursa: denemeler Geçmiş > Senaryolar açar', () => {
    const altSec = vi.fn();
    ac({ altSec });
    const d = screen.getByRole('button', { name: 'Şu olursa: denemeler' });
    expect(d.getAttribute('aria-disabled')).toBeNull();
    expect(d.getAttribute('title')).not.toContain(MOTOR_NOTU);
    fireEvent.click(d);
    expect(altSec).toHaveBeenCalledWith({ ekran: 'gecmis', bolum: 'senaryolar' });
  });

  it('raydaki ve Bugün\'deki Öne al motorun öne al hamlesini ister; plan bayatsa nedeniyle pasif', async () => {
    const post = vi.spyOn(api, 'post').mockImplementation((() => new Promise(() => {})) as never);
    ac({ c: guncel() });
    const ray = screen.getByRole('complementary', { name: 'Siparişler' });
    fireEvent.click(within(ray).getAllByRole('button', { expanded: false })[0] as HTMLElement);
    const acik = within(ray).getAllByRole('button', { expanded: true })[0] as HTMLElement;
    const j = acik.closest('.tc-pym-tp-sip')?.querySelector('.tc-pym-tp-sip-ad b')?.textContent ?? '';
    const one = within(ray).getByRole('button', { name: 'Öne al' });
    expect(one.getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(one);
    await waitFor(() => expect(post).toHaveBeenCalledWith('/plan/planlama-degerlendirmesi', { surum: 8, istek: { tur: 'one-al', siparisId: j } }, expect.anything()));
    post.mockRestore();
    cleanup();
    ac();
    fireEvent.click(screen.getByRole('button', { name: /^Bugün/ }));
    const b = screen.getByRole('region', { name: 'Bugün' });
    const l = within(b).getAllByRole('button', { name: /öne al$/ });
    expect(l.length).toBeGreaterThan(0);
    expect(l[0]?.getAttribute('aria-disabled')).toBe('true');
    expect(l[0]?.getAttribute('title')).toContain('Plan verinin gerisinde');
  });

  it('elle sıra: açık siparişte Listede aşağı ve Alt+↓ rayın sırasını çalışmaya yazar (plan korunur)', () => {
    const c = ornekCalisma();
    const { komut, yazilan } = komutKur(c);
    ac({ c, komut });
    const ray = screen.getByRole('complementary', { name: 'Siparişler' });
    const ilk = within(ray).getAllByRole('button', { expanded: false })[0] as HTMLElement;
    fireEvent.click(ilk);
    fireEvent.click(within(ray).getByRole('button', { name: 'Listede aşağı' }));
    const sira = yazilan.at(-1)?.tpSira as string[];
    expect(sira.length).toBeGreaterThan(1);
    expect(komut.degistir).toHaveBeenLastCalledWith('Sipariş sırası', expect.any(Function), { planKoru: true });
    expect(within(ray).getByRole('button', { name: 'Listede yukarı' }).getAttribute('aria-disabled')).toBe('true');
    fireEvent.keyDown(ilk, { key: 'ArrowDown', altKey: true });
    expect(yazilan.at(-1)?.tpSira).toEqual(sira);
  });

  it('Yapılacaklar ve Düzenle panoda: seçili işte E Düzenle menüsünü açar, Y Yapılacaklar\'ı; yazamayana yok', () => {
    ac();
    const yp = screen.getByRole('button', { name: /^Yapılacaklar: / });
    fireEvent.click(yp);
    expect(screen.getByRole('dialog', { name: 'Yapılacaklar' })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Yapılacaklar' })).toBeNull();
    fireEvent.keyDown(document.body, { key: 'y' });
    expect(screen.getByRole('dialog', { name: 'Yapılacaklar' })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'y' });
    fireEvent.click(document.querySelector('[data-id="2.40"]') as HTMLElement);
    expect(screen.getByRole('button', { name: /Düzenle/ })).toBeTruthy();
    fireEvent.keyDown(document.body, { key: 'e' });
    const m = screen.getByRole('dialog', { name: 'Düzenle' });
    expect(within(m).getAllByRole('button').some((x) => /Böl/.test(x.textContent ?? ''))).toBe(true);
    cleanup();
    ac({ yaz: false });
    expect(screen.queryByRole('button', { name: /^Yapılacaklar: / })).toBeNull();
  });

  it('Geri al kartı: Yinele geri alınanı yeniden uygular; Taslağı sıfırla ikinci basışla bütün kararları geri alır', () => {
    const c = ornekCalisma();
    const geriDon = vi.fn(); const yinele = vi.fn();
    const komut = { degistir: vi.fn(() => true), geriAl: vi.fn(), geriAlinabilir: () => true, geriAdimlari: () => [{ ne: 'Bir', t: 1 }, { ne: 'İki', t: 2 }], geriDon,
      yinele, yinelenebilir: () => true, kaydet: vi.fn(async () => 8) } as unknown as CalismaKomutu;
    ac({ c, komut });
    fireEvent.click(screen.getByRole('button', { name: 'Karar geçmişi ve taslağı sıfırla' }));
    // 2792 (Atölye): geçmişin sayfa yenilenince gittiği tek yerde yazılır.
    expect(within(kart()).getByText(/sayfa yenilenince silinir/)).toBeTruthy();
    fireEvent.click(within(kart()).getByRole('button', { name: 'Yinele' }));
    expect(yinele).toHaveBeenCalledTimes(1);
    fireEvent.click(within(kart()).getByRole('button', { name: 'Taslağı sıfırla' }));
    expect(geriDon).not.toHaveBeenCalled();
    fireEvent.click(within(kart()).getByRole('button', { name: '2 kararı geri al' }));
    expect(geriDon).toHaveBeenCalledWith(2);
    fireEvent.keyDown(document.body, { key: 'Z', ctrlKey: true, shiftKey: true });
    expect(yinele).toHaveBeenCalledTimes(2);
  });

  it('termin kartında Öne alarak kısalt; gerçek başlama ve sayım çipleri terminalin göstergesi', () => {
    ac();
    const ray = screen.getByRole('complementary', { name: 'Siparişler' });
    fireEvent.click(within(ray).getAllByRole('button', { expanded: false })[0] as HTMLElement);
    fireEvent.click(within(ray).getByRole('button', { name: 'Termin konuş' }));
    const k = within(kart()).getByRole('button', { name: 'Öne alarak kısalt' });
    expect(k.getAttribute('aria-disabled')).toBe('true');
    expect(within(kart()).queryByText(new RegExp(MOTOR_NOTU))).toBeNull();
  });

  it('Kilit ve dondurma paneli (2539 a): üst çubuktan açılır; donuk bölge, Sabitleri kaldır (ikinci basışla) ve günü dondur aynı komutlarla yazılır', () => {
    const c = ornekCalisma(); c.locks = { '2.40': { m: '5', S: 1 } };
    const { komut, yazilan } = komutKur(c);
    ac({ c, komut });
    const d = screen.getByRole('button', { name: /^Kilit ve dondurma: donuk \d+ sa · 1 sabit · 0 gün$/ });
    fireEvent.click(d);
    const k = screen.getByRole('dialog', { name: 'Kilit ve dondurma' });
    fireEvent.click(within(k).getByRole('button', { name: '16 sa' }));
    expect(yazilan.at(-1)?.w.dondurma).toBe(16);
    fireEvent.click(within(k).getByRole('button', { name: 'Sabitleri kaldır' }));
    fireEvent.click(within(k).getByRole('button', { name: '1 sabiti kaldır' }));
    expect(komut.degistir).toHaveBeenLastCalledWith('Sabitler kaldırıldı', expect.any(Function), { ayrinti: 'dondurulmuş günler korundu', planKoru: true });
    expect(yazilan.at(-1)?.locks).toEqual({});
    const gun = within(k).getAllByRole('button', { name: 'Günü dondur' }).find((b) => b.getAttribute('aria-disabled') === null);
    expect(gun).toBeTruthy();
    fireEvent.click(gun!);
    expect(komut.degistir).toHaveBeenLastCalledWith('Gün donduruldu', expect.any(Function), expect.objectContaining({ planKoru: true }));
    // Deneme komutu her yazmayı açılıştaki çalışmanın kopyasına uygular: elle sabit yerinde, gün kilitleri eklenir.
    const l = yazilan.at(-1)?.locks ?? {};
    expect(l['2.40']).toEqual({ m: '5', S: 1 });
    expect(Object.values(l).some((x) => typeof (x as { gun?: unknown }).gun === 'number')).toBe(true);
    expect(within(k).getByText(/Başlamış iş bu ayarlardan bağımsızdır/)).toBeTruthy();
  });
});

