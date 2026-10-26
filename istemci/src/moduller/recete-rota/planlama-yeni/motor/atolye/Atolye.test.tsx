import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { api, ApiHatasi } from '../../../../../ortak/veri/api.ts';
import { BildirimSaglayici } from '../../../../../ortak/arayuz/index.ts';
import { PLANLAMA_ISLEMI } from '../../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM, type PlanlamaEkranOzellikleri, type PlanlamaOlcegi, type PlanlamaSecimi } from '../../gorunumler.ts';
import type { CalismaKomutu } from '../../kayit.ts';
import type { PlanlamaCalismasi } from '../../tipler.ts';
import type { PlanlamaDeposu } from '../../veri.ts';
import { yetkiKur } from '../../yetki.ts';
import { PlanlamaAtolyesi } from '../index.tsx';
import { HAZIRLANIYOR, MOTOR_NOTU } from '../ortak.tsx';
import { planOku } from '../kurallar.ts';
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
  ben: { kisi: { id: 1, ad: 'Ayşe' }, yazabilir: true },
  durum: null, planSurumu: { planSurumu: 3, sonCanliyaAlma: null },
  senaryolar: { canli: GOSTERGE, canliSurum: 3, senaryolar: [
    senaryo(1, 'onayda', { onay: { gonderen: 'Ayşe', gonderme: '2026-10-20T10:00:00Z', not: 'acil', geriGonderen: null, geriGonderme: null, geriNeden: null }, yapabilir: { onayaGonder: false, onaydanCek: false, geriGonder: true, canliyaAl: true } }),
    senaryo(2, 'acik', { yapabilir: { onayaGonder: true, onaydanCek: false, geriGonder: false, canliyaAl: false } }),
  ] },
} as unknown as PlanlamaDeposu;
function ac(o: { c?: PlanlamaCalismasi | null; yaz?: boolean; komut?: CalismaKomutu | null; mudur?: boolean; istek?: PlanlamaEkranOzellikleri['istek']; studyoAc?: PlanlamaEkranOzellikleri['studyoAc'] } = {}) {
  const yaz = o.yaz ?? true;
  const git = vi.fn();
  const yenile = vi.fn();
  const c = o.c === undefined ? ornekCalisma() : o.c;
  const oz: Omit<PlanlamaEkranOzellikleri, 'olcek' | 'olcekSec' | 'kaydir' | 'secim' | 'sec'> = {
    depo: DEPO, calisma: c, komut: o.komut ?? (yaz && c ? komutKur(c).komut : null), git, yenile, istek: o.istek ?? null, ...(o.studyoAc ? { studyoAc: o.studyoAc } : {}),
    yetki: yetkiKur([PLANLAMA_ISLEMI, ...(yaz ? ['plan.yaz', 'plan.studyo'] : []), ...(o.mudur ? ['plan.canliya-al'] : [])], { yazabilir: yaz }),
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
  const komut = { degistir: vi.fn((_ne: string, fn: (t: PlanlamaCalismasi) => void) => { const t = structuredClone(c); fn(t); yazilan.push(t); return true; }), geriAl: vi.fn(), geriAlinabilir: () => false, geriAdimlari: () => [], geriDon: vi.fn(), kaydet: vi.fn(async () => 8) } as unknown as CalismaKomutu;
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

  it('kimlik satırı, üç sekme ve onay sayısı; geri düğmesi motora döner', () => {
    const { git } = ac();
    expect(screen.getByText('Canlı sürüm 3')).toBeTruthy();
    expect(screen.getAllByRole('tab').map((x) => x.textContent)).toEqual(['Plan', 'Onay ve canlı1', 'Plan ve gerçekleşen']);
    fireEvent.click(screen.getByRole('button', { name: 'Planlama motoruna dön' }));
    expect(git).toHaveBeenCalledWith('plan');
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
    expect(get).toHaveBeenCalledWith('/recete-rota/planlama-calismasi/taban-ve-canli');
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
    const get = vi.spyOn(api, 'get').mockImplementation((yol: string) => Promise.resolve(yol === '/plan' ? plan(1, '2026-10-21T08:00:00Z') : plan(2, '2026-10-21T11:00:00Z')) as never);
    ac();
    fireEvent.click(screen.getByRole('tab', { name: /Onay ve canlı/ }));
    expect(screen.getByText(/Çalışma planını canlıyla karşılaştırın/)).toBeTruthy();
    await waitFor(() => expect(screen.getByText('1 tezgâh, 0 saat, 0 yeni')).toBeTruthy());
    expect(get).toHaveBeenCalledWith('/plan?taslak=1');
    expect(screen.getByText('Başlamış işler yerinde')).toBeTruthy();
    expect(screen.getByText('Ağırlıklı gecikme')).toBeTruthy();
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

  it('üst çubuk: geciken ve gecikme, ölçek, motor isteyenler pasif; onaya gönder kartı doğrudan gönderir ve Onay sekmesine götürür', async () => {
    ac({ c: guncel() });
    const ust = document.querySelector('.tc-pym-tp-ust') as HTMLElement;
    expect(within(ust).getByTitle('Geciken sipariş').textContent).toBe('1 geciken');
    expect(within(ust).getByRole('group', { name: 'Ölçek' }).textContent).toBe('Gün3 günHaftaAyYıl');
    for (const ad of ['Şu olursa: denemeler', 'İyileştir']) expect(within(ust).getByRole('button', { name: ad }).getAttribute('title')).toContain(MOTOR_NOTU);
    expect(within(ust).getByRole('button', { name: '1 onayda' })).toBeTruthy();
    fireEvent.click(within(ust).getByRole('button', { name: 'Onaya gönder' }));
    expect(within(kart()).getByText('1 → 1')).toBeTruthy();
    const post = vi.spyOn(api, 'post').mockImplementation(((yol: string) => Promise.resolve(yol.endsWith('/taslak-yaz')
      ? { taslak: { id: 9, surum: 1 }, yazilan: 4, atlanan: 0, yazilamaz: [] }
      : { ...DEPO.senaryolar, senaryolar: [...DEPO.senaryolar!.senaryolar, senaryo(9, 'onayda')] })) as never);
    fireEvent.click(within(kart()).getByRole('button', { name: 'Gönder' }));
    await waitFor(() => expect(screen.getByRole('tab', { name: /Onay ve canlı/ }).getAttribute('aria-selected')).toBe('true'));
    expect(post.mock.calls.map((x) => x[0])).toEqual(['/recete-rota/planlama-calismasi/taslak-yaz', '/plan/senaryolar/9/onaya-gonder']);
    expect(post.mock.calls[0]?.[1]).toMatchObject({ calismaSurumu: 8, planSurumu: 3 });
    expect(String((post.mock.calls[0]?.[1] as { ad: string }).ad)).toMatch(/^Onay .+ · Ayşe$/);
    expect(post.mock.calls.map((x) => x[0])).not.toContain('/plan/senaryolar/9/canliya-al');
    expect(screen.getByText('Plan onaya gönderildi: 4 iş taslağa yazıldı. Canlıya onaylayan alır.')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Onay ve canlı/ }).textContent).toBe('Onay ve canlı2');
    post.mockRestore();
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
    expect(get).toHaveBeenCalledWith('/recete-rota/planlama-calismasi/canli-farki');
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

  it('onaya gönder kartı: eski veriyle çözülmüş plan gönderilmez, Onay sekmesindeki kontrole gidilir', () => {
    ac();
    const post = vi.spyOn(api, 'post');
    fireEvent.click(within(document.querySelector('.tc-pym-tp-ust') as HTMLElement).getByRole('button', { name: 'Onaya gönder' }));
    fireEvent.click(within(kart()).getByRole('button', { name: 'Gönder' }));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole('tab', { name: /Onay ve canlı/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Plan kontrolden geçmedi; Onay sekmesindeki kırmızı maddeleri giderin.')).toBeTruthy();
    post.mockRestore();
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
    await waitFor(() => expect(post.mock.calls.map((x) => x[0])).toEqual(['/recete-rota/planlama-calismasi/taslak-yaz', '/plan/senaryolar/9/onaya-gonder']));
    expect(post.mock.calls[1]?.[1]).toEqual({ surum: 1, not: 'M2 boşaldı' });
    await waitFor(() => expect(document.querySelector('.tc-pym-pa-aday[aria-current="true"]')?.textContent).toContain('Senaryo 9'));
    post.mockClear();
    fireEvent.click(screen.getByRole('button', { name: /^Çalışma planı/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Onayla ve canlıya al' }));
    expect(post).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: /canlıya al$/ }));
    await waitFor(() => expect(screen.getByText('Plan canlıya alınamadı, onayda bekliyor: Kendi gönderdiğiniz planı canlıya alamazsınız.')).toBeTruthy());
    expect(post.mock.calls.map((x) => x[0])).toEqual(['/recete-rota/planlama-calismasi/taslak-yaz', '/plan/senaryolar/9/onaya-gonder', '/plan/senaryolar/9/canliya-al']);
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
    await waitFor(() => expect(post.mock.calls[0]?.slice(0, 2)).toEqual(['/recete-rota/planlama-calismasi/taslaktan-yaz', { taslakId: 2, taslakSurumu: 4, calismaSurumu: 8 }]));
    await waitFor(() => expect(screen.getByText('"Senaryo 2" çalışmaya yüklendi: 3 iş çalışmaya yazıldı. Plan yeniden çözülmeli.')).toBeTruthy());
    expect(yenile).toHaveBeenCalledTimes(1);
    fireEvent.click(within(screen.getByRole('region', { name: 'Bildirimler' })).getByRole('button', { name: 'Geri al' }));
    await waitFor(() => expect(post.mock.calls[1]?.slice(0, 2)).toEqual(['/recete-rota/planlama-calismasi/geri-al', { calismaSurumu: 9 }]));
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
