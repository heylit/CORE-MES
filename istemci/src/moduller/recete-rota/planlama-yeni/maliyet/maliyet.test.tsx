import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Islem } from '#paylasilan/islemler.ts';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { MALIYETSIZ, YONETICI, ac, sunucuKur } from '../test-ortak.tsx';
import { PLANLAMA_ANAHTARI } from '../veri.ts';
import { ornekDeger } from './test-verisi.ts';

// P3 görünümleri iskeletin içinde açılır: izinli ve reddedilen yollar, para gizleme, salt okuma ve komutla yazma. Veri uydurmadır.
const kayit = (ek: Parameters<typeof ornekDeger>[0] = {}) => [{ anahtar: PLANLAMA_ANAHTARI, bicim: 'json' as const, deger: ornekDeger(ek), surum: 4 }];
const PLANLAMACI = { ...MALIYETSIZ, islemler: [...MALIYETSIZ.islemler, 'plan.yaz' as Islem] };
const BEKLE = { timeout: 10000 };
type Govde = { anahtar: string; beklenenSurum: number; deger: Record<string, unknown> & { D: Record<string, unknown> } };

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const tikla = (ad: string | RegExp) => { fireEvent.click(screen.getByRole('button', { name: ad })); };

describe('P3 Maliyetler', () => {
  it('sipariş × kalem haritası çizilir; hücrede dolu gelen form tezgâh ücretini komutla yazar (izinli)', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, kayit(), { govdeler });
    ac('/recete-rota/planlama-yeni/maliyet');
    expect(await screen.findByRole('table', { name: 'Sipariş × maliyet kalemi, toplam içindeki payı' }, BEKLE)).toBeTruthy();
    expect(document.querySelector('.tc-pyk-durum')?.textContent).toContain('Zarar eden sipariş yok');
    fireEvent.click(screen.getByRole('button', { name: /^S1, Tezgâh: Tezgâh 190 TL/ }));
    const ac_ = screen.getByRole('region', { name: 'S1 · Tezgâh' });
    const ucret = within(ac_).getByLabelText(/Saat ücreti/) as HTMLInputElement;
    expect(ucret.value).toBe('100');
    fireEvent.change(ucret, { target: { value: '120' } });
    fireEvent.click(within(ac_).getByRole('button', { name: 'Kontrol et' }));
    fireEvent.click(within(ac_).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('T1 saat ücreti 120 TL/sa oldu')).toBeTruthy();
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    const g = govdeler[0] as Govde;
    expect(g).toMatchObject({ anahtar: PLANLAMA_ANAHTARI, beklenenSurum: 4 });
    expect(g.deger.D.tezgahlar).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'T1', ucret: 120 })]));
  }, 30000);

  it('değer değişmeden kaydedilmez: "Hiçbir şey değişmedi."', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, kayit(), { govdeler });
    ac('/recete-rota/planlama-yeni/maliyet');
    fireEvent.click(await screen.findByRole('button', { name: /^S1, Tezgâh: / }, BEKLE));
    fireEvent.click(screen.getByRole('button', { name: 'Kontrol et' }));
    expect(screen.getByRole('alert').textContent).toContain('Hiçbir şey değişmedi.');
    expect(govdeler).toEqual([]);
  }, 30000);

  it('kayıt yazma izni yoksa harita görünür, form yerine yetki iletisi çıkar, yazma gitmez (reddedilen)', async () => {
    const istekler = sunucuKur(YONETICI, kayit(), { yazabilir: false });
    ac('/recete-rota/planlama-yeni/maliyet');
    fireEvent.click(await screen.findByRole('button', { name: /^S1, Tezgâh: / }, BEKLE));
    expect(screen.getByText(/Bunu değiştirme yetkiniz yok/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Kontrol et' })).toBeNull();
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
  }, 30000);

  it('plan yoksa boş durum metni gösterilir, sıfır uydurulmaz', async () => {
    sunucuKur(YONETICI, kayit({ plan: null }));
    ac('/recete-rota/planlama-yeni/maliyet');
    expect(await screen.findByText('Plan kurulunca her siparişin maliyeti kalem kalem burada görünür.', {}, BEKLE)).toBeTruthy();
  }, 30000);
});

describe('P3 Genel gider', () => {
  it('menüden gider kalemi eklenir; kalem satırı haritaya girer', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, kayit(), { govdeler });
    ac('/recete-rota/planlama-yeni/giderler');
    expect(await screen.findByRole('table', { name: 'Gider kalemi × tezgâh grubu, aylık pay' }, BEKLE)).toBeTruthy();
    tikla('Genel gider: diğer işlemler');
    fireEvent.click(screen.getByRole('menuitem', { name: /Gider kalemi ekle/ }));
    const f = screen.getByRole('form', { name: 'Gider kalemi ekle' });
    fireEvent.change(within(f).getByLabelText(/Kalem adı/), { target: { value: 'Kira' } });
    fireEvent.click(within(f).getByRole('button', { name: 'İleri' }));
    fireEvent.change(within(f).getByLabelText(/Aylık tutar/), { target: { value: '3000' } });
    fireEvent.click(within(f).getByRole('button', { name: 'İleri' }));
    fireEvent.click(within(f).getByRole('button', { name: 'Kontrol et' }));
    fireEvent.click(within(f).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText(/Kira eklendi: ayda 3\.000 TL/)).toBeTruthy();
    expect(screen.getByRole('rowheader', { name: /Kira/ })).toBeTruthy();
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect((govdeler[0] as Govde).deger.D.maliyetSis).toMatchObject({ kalemler: [{ id: 'K1', ad: 'Kira', aylik: 3000, anahtar: 'saat' }] });
  }, 30000);
});

describe('P3 Ek mesai planı', () => {
  it('planlamacı (maliyetsiz, plan.yaz) ek vardiya açar; para sütunu gizlidir', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(PLANLAMACI, kayit(), { govdeler });
    ac('/recete-rota/planlama-yeni/mesaiplan');
    expect(await screen.findByRole('table', { name: 'Tezgâh × gün, doluluk ve ek mesai' }, BEKLE)).toBeTruthy();
    tikla(/2 satır daha göster/);
    fireEvent.click(screen.getByRole('button', { name: /^T1, 05\.01 Pzt: %25 dolu/ }));
    const ac_ = screen.getByRole('region', { name: 'T1 · 05.01 Pzt' });
    expect(within(ac_).getByRole('button', { name: /Önerileri hesapla/ }).hasAttribute('disabled')).toBe(true);
    expect(within(ac_).getByText('Plan motoru bağlanınca açılır.')).toBeTruthy();
    fireEvent.click(within(ac_).getByRole('button', { name: 'Kontrol et' }));
    fireEvent.click(within(ac_).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('T1 için 2026-01-05 V1 ek vardiyası eklendi')).toBeTruthy();
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect((govdeler[0] as Govde).deger.ekMesai).toEqual([{ m: 'T1', gun: 0, vardiya: 'V1' }]);
    fireEvent.click(screen.getByText('Tüm satırlar'));
    const t = await screen.findByRole('table', { name: 'Ek mesailer' });
    expect(within(t).queryByRole('columnheader', { name: 'Bedel' })).toBeNull();
  }, 30000);

  it('plan.yaz işlemi olmayan kişide yazma yoktur (reddedilen)', async () => {
    const istekler = sunucuKur(MALIYETSIZ, kayit({ ekMesai: [{ m: 'T1', gun: 0, vardiya: 'V1' }] }));
    ac('/recete-rota/planlama-yeni/mesaiplan');
    fireEvent.click(await screen.findByRole('button', { name: /^T1, 05\.01 Pzt: / }, BEKLE));
    expect(screen.queryByRole('button', { name: /ek vardiyasını kaldır/ })).toBeNull();
    fireEvent.click(screen.getByText('Tüm satırlar'));
    expect(await screen.findByRole('table', { name: 'Ek mesailer' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /ek mesaisini kaldır/ })).toBeNull();
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
  }, 30000);
});

describe('P3 Fason planı', () => {
  it('fasoncu × gün çizilir; hücreden dönüş termini girilir', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(PLANLAMACI, kayit(), { govdeler });
    ac('/recete-rota/planlama-yeni/fasonplan');
    expect(await screen.findByRole('table', { name: 'Fasoncu × gün, kapasite ve gecikme' }, BEKLE)).toBeTruthy();
    expect(document.querySelector('.tc-pyk-durum')?.textContent).toContain('1 fason işinden 1 tanesi siparişi geciktiriyor, 1 tanesinin dönüş tarihi yok');
    fireEvent.click(screen.getByRole('button', { name: /^Deneme kaplama, 05\.01 Pzt: 1 iş fasoncuda/ }));
    const ac_ = screen.getByRole('region', { name: 'Deneme kaplama · 05.01 Pzt' });
    fireEvent.change(within(ac_).getByLabelText(/Dönüş günü/), { target: { value: '2026-01-07' } });
    fireEvent.click(within(ac_).getByRole('button', { name: 'Kontrol et' }));
    fireEvent.click(within(ac_).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('S1.20 dönüş termini 2026-01-07 oldu')).toBeTruthy();
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect((govdeler[0] as Govde).deger.D).toMatchObject({ fasonTermin: { 'S1.20': '2026-01-07 16:00' }, fasonRef: { 'S1.20': '2026-01-07 10:00' } });
  }, 30000);
});
