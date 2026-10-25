import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MALIYETSIZ, YONETICI, ac, sunucuKur } from '../test-ortak.tsx';
import { calismaKaydi } from './test-verisi.ts';
import { yillikDurumSifirla } from './yillik-durum.ts';

// Çözüm sunucudadır (454/6 a); model kurallar.test.ts'te gerçek HiGHS'le sınanır. Burada sahte sunucunun çözüm ucu her sütunu sıfır döndürür;
// verilmezse uç yoktur (ortak sahte sunucu bilinmeyen yazmaya 405 döner).
function cozucuKur(istekler: { lp: string; sure: number; want: string[] }[] = []) {
  const onceki = globalThis.fetch;
  const sonuclar = new Map<string, unknown>();
  vi.stubGlobal('fetch', vi.fn(async (adres: string, istek?: RequestInit) => {
    const json = (g: unknown) => new Response(JSON.stringify(g), { status: 200 });
    if (adres === '/api/recete-rota/yillik-plan/coz' && istek?.method === 'POST') {
      const g = JSON.parse(String(istek.body)) as { lp: string; sure: number; want: string[] };
      istekler.push(g);
      const is = `00000000-0000-4000-8000-${String(istekler.length).padStart(12, '0')}`;
      sonuclar.set(is, { s: 7, ob: 1234, val: Object.fromEntries(g.want.map((w) => [w, 0])), dual: {} });
      return json({ is });
    }
    const m = /^\/api\/recete-rota\/yillik-plan\/coz\/(.+)$/.exec(adres);
    if (m?.[1] !== undefined) return json({ durum: 'bitti', cozum: sonuclar.get(m[1]) });
    return onceki(adres, istek);
  }));
  return istekler;
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yillikDurumSifirla(); });
const BEKLE = { timeout: 10000 };

describe('Yıllık plan', () => {
  it('ısı haritası katmanı: çözülmemişken boş harita ve çöz düğmesi; çözünce durum satırı, lejant, grup × dönem hücreleri; Tüm satırlar asıl sayfayı taşır', async () => {
    sunucuKur(YONETICI, calismaKaydi());
    const cozumler = cozucuKur();
    ac('/recete-rota/planlama-yeni/yillik');
    expect(await screen.findByText(/^Yıllık plan henüz hesaplanmadı; hesaplanınca/, {}, BEKLE)).toBeTruthy();
    expect(screen.queryByRole('tablist', { name: 'Görünüm' })).toBeNull();
    const harita = screen.getByRole('region', { name: 'Isı haritası' });
    fireEvent.click(within(harita).getByRole('button', { name: 'Yıllık planı çöz' }));
    const izgara = await screen.findByRole('group', { name: 'Tezgâh grubu × dönem, kapasite kullanımı' });
    expect(cozumler.map((c) => c.sure)).toEqual([30, 60, 30]);
    expect(cozumler[1]?.lp).toContain('Subject To');
    expect(document.querySelector('.tc-isi-ust h2')?.textContent).toContain('Tezgâh grubu × dönem, kapasite kullanımı');
    expect(document.querySelector('.tc-isi-durum')?.textContent).toBe('En sıcak blok Torna, 05.10–Eyl 27: en çok %0 dolu. Bütün yük karşılanıyor.Yeniden çöz');
    expect(screen.getAllByRole('button', { name: 'Yeniden çöz' })).toHaveLength(2);
    expect(within(izgara).getAllByRole('button')[0]?.getAttribute('aria-label')).toMatch(/^Torna, .+: %\d+ dolu \(/);
    expect(screen.getByText('Tüm satırlar')).toBeTruthy();
    expect(screen.getByText('Plan bedeli')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Darboğaz ve gölge fiyat' })).toBeTruthy();
    // Genel gider girilmemiş: yatırım denenmez ve nedeni bu yazılır (kapasite açığının yokluğu değil).
    expect(screen.getByText('Genel gider (tezgâh bedeli) girilmediği için yatırım denenmedi.')).toBeTruthy();
    expect(screen.queryByText(/kapasite açığı yok/)).toBeNull();
    expect(screen.getByLabelText('Geç teslim bedeli, değerin %/gün')).toBeTruthy();
  }, 20000);

  it('hücre açılımı: neden, Kapasite adımından açılan varsayım sihirbazı (Geri yok); kayıt yalnız yıllık ayara yazılır, plan eskir ve kayıt kartı kalır', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, calismaKaydi(), { govdeler });
    cozucuKur();
    ac('/recete-rota/planlama-yeni/yillik');
    fireEvent.click(within(await screen.findByRole('region', { name: 'Isı haritası' }, BEKLE)).getByRole('button', { name: 'Yıllık planı çöz' }));
    const izgara = await screen.findByRole('group', { name: 'Tezgâh grubu × dönem, kapasite kullanımı' });
    fireEvent.click(within(izgara).getAllByRole('button')[0] as HTMLElement);
    const ac2 = screen.getByRole('region', { name: /^Torna · / });
    expect(within(ac2).getByText(/^Torna .+: %\d+ dolu .*Kapasite yetiyor\.$/)).toBeTruthy();
    expect(within(ac2).getByRole('button', { name: /Yıllık planı yeniden çöz/ })).toBeTruthy();
    expect(within(ac2).queryByRole('button', { name: 'Geri' })).toBeNull();
    const mesai = within(ac2).getByLabelText(/Ek mesai sınırı \(kapasitenin %\)/);
    await waitFor(() => { expect(document.activeElement).toBe(mesai); });
    fireEvent.change(mesai, { target: { value: '80' } });
    fireEvent.click(within(ac2).getByRole('button', { name: 'İleri' }));
    expect(within(ac2).getByRole('alert').textContent).toBe('Ek mesai sınırı (kapasitenin %) en çok 60.');
    fireEvent.change(within(ac2).getByLabelText(/Ek mesai sınırı \(kapasitenin %\)/), { target: { value: '25' } });
    fireEvent.click(within(ac2).getByRole('button', { name: 'İleri' }));
    expect(within(ac2).getByRole('button', { name: 'Geri' })).toBeTruthy();
    fireEvent.click(within(ac2).getByRole('button', { name: 'İleri' }));
    fireEvent.click(within(ac2).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('Yıllık plan varsayımları kaydedildi')).toBeTruthy();
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect(govdeler[0]).toMatchObject({ deger: { D: { yillik: { mesaiMaks: 25 } } } });
    expect(screen.getByText(/^Yıllık plan henüz hesaplanmadı; hesaplanınca/)).toBeTruthy();
    expect(screen.getByText('Veri ya da varsayım değişti; yeniden çözülmeli.')).toBeTruthy();
  }, 20000);

  it('açılım Esc ve Vazgeç ile yazmadan kapanır', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, calismaKaydi(), { govdeler });
    cozucuKur();
    ac('/recete-rota/planlama-yeni/yillik');
    fireEvent.click(within(await screen.findByRole('region', { name: 'Isı haritası' }, BEKLE)).getByRole('button', { name: 'Yıllık planı çöz' }));
    const izgara = await screen.findByRole('group', { name: 'Tezgâh grubu × dönem, kapasite kullanımı' });
    const hucre = within(izgara).getAllByRole('button')[0] as HTMLElement;
    fireEvent.click(hucre);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: /^Torna · / })).toBeNull();
    fireEvent.click(within(izgara).getAllByRole('button')[0] as HTMLElement);
    fireEvent.click(within(screen.getByRole('region', { name: /^Torna · / })).getByRole('button', { name: 'Vazgeç' }));
    expect(screen.queryByRole('region', { name: /^Torna · / })).toBeNull();
    expect(govdeler).toHaveLength(0);
  }, 20000);

  it('plan.yaz olan kişi tahmini Elle yapar (Tüm satırlar): değişiklik yalnız çalışmanın yıllık ayarına yazılır ve sonuç eskir', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, calismaKaydi(), { govdeler });
    cozucuKur();
    ac('/recete-rota/planlama-yeni/yillik');
    fireEvent.click((await screen.findAllByRole('button', { name: 'Yıllık planı çöz' }, BEKLE)).at(-1) as HTMLElement);
    await screen.findByText('Grup yükü, kapasitenin %\'si');
    const grup = screen.getByRole('group', { name: 'Talep tahmini' });
    fireEvent.click(within(grup).getByRole('button', { name: 'Elle' }));
    expect(await screen.findByText('Veri ya da varsayım değişti; yeniden çözülmeli.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Elle tahmin' })).toBeTruthy();
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect(govdeler[0]).toMatchObject({ beklenenSurum: 4, deger: { D: { yillik: { tahmin: 'elle', buyume: 10 } } } });
  }, 20000);

  it('plan.yaz ve maliyet okuması olmayan kişi: haritada çöz düğmesi ve form yok, açılımda yetki notu; ayarlar kapalı, TL görünmez (reddedilen)', async () => {
    sunucuKur(MALIYETSIZ, calismaKaydi());
    cozucuKur();
    ac('/recete-rota/planlama-yeni/yillik');
    const harita = await screen.findByRole('region', { name: 'Isı haritası' }, BEKLE);
    expect(within(harita).queryByRole('button', { name: 'Yıllık planı çöz' })).toBeNull();
    const grup = screen.getByRole('group', { name: 'Talep tahmini' });
    expect((within(grup).getByRole('button', { name: 'Elle' }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.queryByLabelText('Geç teslim bedeli, değerin %/gün')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Yıllık planı çöz' }));
    const izgara = await screen.findByRole('group', { name: 'Tezgâh grubu × dönem, kapasite kullanımı' });
    expect(screen.queryByRole('button', { name: 'Yeniden çöz' })).toBeTruthy();
    expect(within(document.querySelector('.tc-isi-ust') as HTMLElement).queryByRole('button', { name: 'Yeniden çöz' })).toBeNull();
    fireEvent.click(within(izgara).getAllByRole('button')[0] as HTMLElement);
    expect(screen.getByText('Bunu değiştirme yetkiniz yok.')).toBeTruthy();
    expect(screen.queryByRole('form', { name: 'Kapasite varsayımları' })).toBeNull();
    expect(screen.queryByText('Plan bedeli')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Hedefi motora ver' })).toBeNull();
  }, 20000);

  it('sunucuda çözüm ucu yoksa çöz düğmeleri kapanır ve nedeni yazılır; ekranın geri kalanı açık kalır', async () => {
    const istekler = sunucuKur(YONETICI, calismaKaydi());
    ac('/recete-rota/planlama-yeni/yillik');
    const harita = await screen.findByRole('region', { name: 'Isı haritası' }, BEKLE);
    fireEvent.click(within(harita).getByRole('button', { name: 'Yıllık planı çöz' }));
    expect((await screen.findAllByText('Yıllık plan çözücüsü sunucuya bağlanınca açılır.')).length).toBeGreaterThan(0);
    for (const d of screen.getAllByRole('button', { name: 'Yıllık planı çöz' })) expect((d as HTMLButtonElement).disabled).toBe(true);
    expect(istekler.filter((i) => i === 'POST /recete-rota/yillik-plan/coz')).toHaveLength(1);
    expect((within(screen.getByRole('group', { name: 'Talep tahmini' })).getByRole('button', { name: 'Elle' }) as HTMLButtonElement).disabled).toBe(false);
  }, 20000);

  it('çalışmanın başlangıç günü yoksa yıllık plan kurulmaz', async () => {
    sunucuKur(YONETICI, calismaKaydi({ meta: {} }));
    ac('/recete-rota/planlama-yeni/yillik');
    expect(await screen.findByText('Planın başlangıç günü okunamadı; yıllık plan kurulamıyor.', {}, BEKLE)).toBeTruthy();
  }, 20000);
});
