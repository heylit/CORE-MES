import { useMemo, useState, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { api } from '../../../../ortak/veri/api.ts';
import { PLANLAMA_ISLEMI } from '../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import type { BekleyenDegisiklik } from '../tipler.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import { SeritYuvasi, type SeritYuvalari } from '../motor/ust/yuva.ts';
import { saatiSabitle } from '../test-saati.ts';
import type { PlanlamaDeposu } from '../veri.ts';
import { yetkiKur } from '../yetki.ts';
import type * as Coz from '../motor/coz.ts';
import { Kokpit } from './index.tsx';

// Kart 3532 (b): gelen değişikliğin gantt'taki işareti ve "Planı güncelle"nin sonucu. "Planı güncelle"nin sunucu yolu (coz.ts planUygula) bu
// testin konusu değildir: uygulayıcı sahtedir, ortak çalışmayı testin verdiği yeni çalışmayla değiştirip başarıyı bildirir. Veri uydurmadır (ORN-).
const sahte = vi.hoisted(() => ({ uygula: null as null | ((uyar: (i: string) => void, tamam: (i: string) => void) => void), kur: null as null | ((c: Calisma) => void) }));
vi.mock('../motor/coz.ts', async (orijinal) => {
  const o = await orijinal<typeof Coz>();
  return {
    ...o,
    useBekleyenUygula: (x: { komut: unknown; yetki: { planYaz: boolean } }, uyar: (i: string) => void, tamam?: (i: string) => void) => (
      x.komut && x.yetki.planYaz ? { uygula: () => { sahte.uygula?.(uyar, tamam ?? uyar); }, suruyor: false, say: 1 } : null
    ),
  };
});

saatiSabitle(ornekCalisma);
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); sahte.uygula = null; sahte.kur = null; });

type Calisma = ReturnType<typeof ornekCalisma>;
type Ops = Record<string, { job: string; m: string; S: number; C: number }>;
const DEPO = { durum: { emirler: [] }, planSurumu: null, senaryolar: null, calismaSurumu: 4, receteRotaKaydi: null } as unknown as PlanlamaDeposu;
const bekleyen = (isler: string[]): BekleyenDegisiklik => ({ id: 'ORN-a', ne: 'Rota değişti ORN-R1', ayrinti: 'ORN-ayrinti', kim: 'Deneme Kisi', t: 1, isler, geri: [] });
const ops = (c: Calisma): Ops => (c.plan as unknown as { ops: Ops }).ops;
// İşi saat kadar kaydırır (plan ve çubuk).
const kaydir = (c: Calisma, isId: string, saat: number): Calisma => {
  const o = ops(c), x = o[isId]!;
  return { ...c, plan: { ...c.plan, ops: { ...o, [isId]: { ...x, S: x.S + saat, C: x.C + saat } } } } as Calisma;
};
function komutKur(o: Partial<CalismaKomutu> = {}): CalismaKomutu {
  return {
    degistir: () => false, geriAl: vi.fn(() => true), geriAlinabilir: () => true, geriAdimlari: () => [{ ne: 'Bekleyen değişiklik uygulandı', t: 0 }],
    geriDon: () => true, yinele: vi.fn(() => true), yinelenebilir: () => false, kaydet: () => Promise.resolve(4), ...o,
  };
}
// Ortak çalışma durumu tutulur: sahte uygulayıcı onu değiştirir (sunucudan dönen plan gibi).
function Sarmal({ ilk, komut, sonra }: { ilk: Calisma; komut: CalismaKomutu; sonra?: Calisma }) {
  const [c, kur] = useState(ilk);
  sahte.uygula = (_uyar, tamam) => { if (sonra) kur(sonra); tamam('Veri değişikliği plana işlendi.'); };
  sahte.kur = kur;
  return (
    <>
      <Kokpit
        depo={DEPO} calisma={c} komut={komut} git={vi.fn()} yenile={vi.fn()} yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz'])}
        olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={BOS_SECIM} sec={vi.fn()}
      />
    </>
  );
}
// Plan şeridinin yuvası (özet oraya taşınır); Kokpit.test.tsx'teki gibi.
function Yuvali({ children }: { children: ReactNode }) {
  const [y, kur] = useState<SeritYuvalari>({ satir: null, alt: null });
  const bag = useMemo(() => ({
    satir: (el: HTMLElement | null) => { kur((x) => (x.satir === el ? x : { ...x, satir: el })); },
    alt: (el: HTMLElement | null) => { kur((x) => (x.alt === el ? x : { ...x, alt: el })); },
  }), []);
  return <SeritYuvasi.Provider value={{ ...y, dis: null }}><div ref={bag.satir} /><div ref={bag.alt} />{children}</SeritYuvasi.Provider>;
}
function ac(o: { ilk?: Calisma; sonra?: Calisma; komut?: CalismaKomutu } = {}) {
  const ilk = o.ilk ?? { ...ornekCalisma(), bekleyen: [bekleyen(['3'])] } as Calisma;
  vi.spyOn(api, 'get').mockImplementation((yol: string) => (yol === '/plan/taslagim' ? Promise.resolve({ taslak: null, calisma: ilk, surum: 4 } as never) : Promise.reject(new Error('yok'))));
  const komut = o.komut ?? komutKur();
  render(<MemoryRouter initialEntries={['/?duzen=klasik']}><BildirimSaglayici><Yuvali><Sarmal ilk={ilk} komut={komut} {...(o.sonra ? { sonra: o.sonra } : {})} /></Yuvali></BildirimSaglayici></MemoryRouter>);
  return { komut };
}
const isaret = (id: string) => document.querySelector<HTMLButtonElement>(`[data-gelen-is="${id}"]`);
const guncelle = async (): Promise<void> => {
  const d = await screen.findByRole('button', { name: 'Plan' }) as HTMLButtonElement;
  await waitFor(() => { expect(d.disabled).toBe(false); }, { timeout: 4000 });
  fireEvent.click(d);
  const s = await waitFor(() => { const x = within(screen.getByRole('menu', { name: 'Plan' })).getByRole('menuitem', { name: /^Planı güncelle \(1\)/ }) as HTMLButtonElement; expect(x.disabled).toBe(false); return x; }, { timeout: 4000 });
  fireEvent.click(s);
};

describe('Kokpit gelen değişiklikler (3532)', () => {
  it('veri değişikliği etkilediği emrin çubuklarına işaret koyar; işarete basınca balon açılır ve emir yanar; Esc ve dışına basmak balonu kapatır', async () => {
    ac();
    const ucuncu = Object.keys(ops(ornekCalisma())).filter((id) => id.startsWith('3.'));
    await waitFor(() => { expect(isaret(ucuncu[0]!)).not.toBeNull(); });
    // Yalnız etkilenen emrin çubuklarında; başka emrin çubuğunda işaret yok.
    expect([...document.querySelectorAll('[data-gelen-is]')].map((x) => x.getAttribute('data-gelen-is')).sort()).toEqual(ucuncu.filter((id) => document.querySelector(`[data-is="${id}"]`)).sort());
    const d = isaret(ucuncu[0]!)!;
    expect(d.tagName).toBe('BUTTON');
    expect(d.getAttribute('data-tur')).toBe('veri');
    expect(d.getAttribute('aria-label')).toContain('Veri değişti: Rota değişti ORN-R1');
    fireEvent.click(d);
    const balon = document.querySelector('[data-balon]') as HTMLElement;
    expect(balon.textContent).toContain('Veri değişti: Rota değişti ORN-R1');
    expect(d.getAttribute('aria-expanded')).toBe('true');
    expect(document.querySelector(`[data-is="${ucuncu[0]!}"]`)?.hasAttribute('data-yanan')).toBe(true);
    expect(document.querySelector('[data-is="2.20"]')?.hasAttribute('data-sonuk')).toBe(true);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('[data-balon]')).toBeNull();
    fireEvent.click(d);
    expect(document.querySelector('[data-balon]')).not.toBeNull();
    fireEvent.pointerDown(document.body);
    expect(document.querySelector('[data-balon]')).toBeNull();
  });

  it('şerit özeti etkilenen iş sayısını yazar; basınca etkilenen emirler yanar, yeniden basınca söner', async () => {
    // İlk etkilenen iş görünüme getirilir (jsdom'da CSS.escape yok).
    vi.stubGlobal('CSS', { escape: (x: string) => x });
    ac();
    const dugme = await screen.findByRole('button', { name: /iş etkilendi/ });
    const n = document.querySelectorAll('[data-gelen-is]').length;
    expect(dugme.textContent).toBe(`· ${String(n)} iş etkilendi`);
    fireEvent.click(dugme);
    expect(dugme.getAttribute('aria-pressed')).toBe('true');
    expect(document.querySelector('[data-is="3.10"]')?.hasAttribute('data-yanan')).toBe(true);
    expect(document.querySelector('[data-is="2.20"]')?.hasAttribute('data-sonuk')).toBe(true);
    fireEvent.click(dugme);
    expect(document.querySelector('[data-is="2.20"]')?.hasAttribute('data-sonuk')).toBe(false);
  });

  // Risk R2: sonuç yalnız güncellemeden hemen önceki yerlere göre sayılır; güncellemeden önce elle taşınmış iş sayılmaz.
  it('Planı güncelle: sonuç çubuğu yalnız güncellemenin kaydırdığı işi sayar; eski yer hayalettir, çubukta kayma yazar; Kapat yalnız kapatır', async () => {
    const elle = kaydir({ ...ornekCalisma(), bekleyen: [bekleyen(['3'])] } as Calisma, '2.40', 2);
    const sonra = { ...kaydir(elle, '3.10', 3), bekleyen: [] } as Calisma;
    const { komut } = ac({ ilk: elle, sonra });
    await guncelle();
    const sonuc = await screen.findByRole('group', { name: 'Güncellemenin sonucu' });
    expect(sonuc.textContent).toContain('1 iş kaydı');
    expect(sonuc.textContent).toContain('+3 sa');
    expect(sonuc.textContent).toContain('ortak çalışma planına yazıldı, canlıya değil');
    expect(document.querySelector('[data-eski-is="3.10"]')?.textContent).toMatch(/eski$/);
    expect(document.querySelector('[data-eski-is="2.40"]')).toBeNull();
    const cubuk = document.querySelector('[data-is="3.10"]')!;
    expect(cubuk.hasAttribute('data-kaydi')).toBe(true);
    expect(cubuk.textContent).toContain('+3 sa');
    // Çubuğun üstüne gelince kendi hayaleti vurgulanır.
    fireEvent.pointerEnter(cubuk);
    expect(document.querySelector('[data-eski-is="3.10"]')?.hasAttribute('data-vurgu')).toBe(true);
    // Telefon listesinde hayalet yok; satırda ileri/geri yazar.
    expect(screen.getByRole('group', { name: 'Tezgâhlar ve işler' }).textContent).toContain('3 sa ileri');
    // Risk K1: çubuk açıkken başka yazım gelir (2.40 kayar); sonuç ilk gelen çalışmada donmuştur, sayı ve hayaletler değişmez.
    act(() => { sahte.kur?.(kaydir(sonra, '2.40', 5)); });
    expect(document.querySelector('[data-is="2.40"]')?.hasAttribute('data-kaydi')).toBe(false);
    expect(sonuc.textContent).toContain('1 iş kaydı');
    expect(document.querySelector('[data-eski-is="2.40"]')).toBeNull();
    fireEvent.click(within(sonuc).getByRole('button', { name: 'Kapat' }));
    expect(screen.queryByRole('group', { name: 'Güncellemenin sonucu' })).toBeNull();
    expect(document.querySelector('[data-eski-is]')).toBeNull();
    expect(komut.geriAl).not.toHaveBeenCalled();
  });

  // Risk R3: Geri al ortak çalışmanın son adımını alır; alınamazsa söyler.
  it('Geri al güncellemeyi geri alır; alınamazsa ya da son adım bu güncelleme değilse "Geri alınamadı" der', async () => {
    const ilk = { ...ornekCalisma(), bekleyen: [bekleyen(['3'])] } as Calisma, sonra = { ...kaydir(ilk, '3.10', 3), bekleyen: [] } as Calisma;
    const { komut } = ac({ ilk, sonra });
    await guncelle();
    fireEvent.click(within(await screen.findByRole('group', { name: 'Güncellemenin sonucu' })).getByRole('button', { name: 'Geri al' }));
    expect(komut.geriAl).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('group', { name: 'Güncellemenin sonucu' })).toBeNull();
    cleanup();
    const durdu = ac({ ilk, sonra, komut: komutKur({ geriAl: vi.fn(() => false) }) });
    await guncelle();
    fireEvent.click(within(await screen.findByRole('group', { name: 'Güncellemenin sonucu' })).getByRole('button', { name: 'Geri al' }));
    expect(durdu.komut.geriAl).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Geri alınamadı; başka biri planı değiştirdi.')).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Güncellemenin sonucu' })).toBeTruthy();
    cleanup();
    const baska = ac({ ilk, sonra, komut: komutKur({ geriAdimlari: () => [{ ne: 'ORN-başka değişiklik', t: 0 }] }) });
    await guncelle();
    fireEvent.click(within(await screen.findByRole('group', { name: 'Güncellemenin sonucu' })).getByRole('button', { name: 'Geri al' }));
    expect(baska.komut.geriAl).not.toHaveBeenCalled();
    expect(await screen.findByText('Geri alınamadı; plan bu arada değişti.')).toBeTruthy();
  });

  it('telefon listesi: işaretli satırda ikon; satıra basınca cümle satırın altında açılır, Esc kapatır', async () => {
    ac();
    const liste = await screen.findByRole('group', { name: 'Tezgâhlar ve işler' });
    await waitFor(() => { expect(liste.hasAttribute('data-isaretli')).toBe(true); });
    const satir = liste.querySelector<HTMLElement>('button[data-gelen]')!;
    expect(satir.querySelector('.tc-pyq-liste-gelen[data-tur="veri"]')).not.toBeNull();
    act(() => { fireEvent.click(satir); });
    expect(liste.querySelector('[data-liste-cumle]')?.textContent).toContain('Veri değişti: Rota değişti ORN-R1');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(liste.querySelector('[data-liste-cumle]')).toBeNull();
  });
});
