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
    expect(await screen.findByRole('group', { name: 'Sipariş × maliyet kalemi, toplam içindeki payı' }, BEKLE)).toBeTruthy();
    expect(document.querySelector('.tc-pyk-durum')?.textContent).toContain('Zarar eden sipariş yok');
    fireEvent.click(screen.getByRole('button', { name: /^S1, Tezgâh: Tezgâh 190 TL/ }));
    const ac_ = screen.getByRole('region', { name: 'S1 · Tezgâh' });
    const ucret = within(ac_).getByLabelText(/Saat ücreti/) as HTMLInputElement;
    expect(ucret.value).toBe('100');
    fireEvent.change(ucret, { target: { value: '120' } });
    fireEvent.click(within(ac_).getByRole('button', { name: 'İleri' }));
    fireEvent.click(within(ac_).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('T1 saat ücreti 120 TL/sa oldu')).toBeTruthy();
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    const g = govdeler[0] as Govde;
    expect(g).toMatchObject({ anahtar: PLANLAMA_ANAHTARI, beklenenSurum: 4 });
    expect(g.deger.D.tezgahlar).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'T1', ucret: 120 })]));
  }, 30000);

  it('amortismanı girilmemiş tezgâhta genel gider hücresi "—", açılım nedenini yazar; sıfır yazılmaz', async () => {
    sunucuKur(YONETICI, kayit());
    ac('/recete-rota/planlama-yeni/maliyet');
    await screen.findByRole('group', { name: 'Sipariş × maliyet kalemi, toplam içindeki payı' }, BEKLE);
    const h = screen.getByRole('button', { name: /^S1, Genel gider: Genel gider bilinmiyor/ });
    expect(h.textContent).toBe('—');
    fireEvent.click(h);
    expect(within(screen.getByRole('region', { name: 'S1 · Genel gider' })).getByText(/S1 genel gider bilinmiyor/)).toBeTruthy();
  }, 30000);

  it('hücre seçilince odak formun ilk alanına gider; kayıttan sonra plan eski notu, pasif "Planı iyileştir" ve "Yeniden düzenle"; Esc açılımı kapatır, odak hücreye döner', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, kayit(), { govdeler });
    ac('/recete-rota/planlama-yeni/maliyet');
    const h = await screen.findByRole('button', { name: /^S1, Tezgâh: / }, BEKLE);
    fireEvent.click(h);
    const ac_ = screen.getByRole('region', { name: 'S1 · Tezgâh' });
    const ucret = within(ac_).getByLabelText(/Saat ücreti/);
    await waitFor(() => { expect(document.activeElement).toBe(ucret); });
    fireEvent.change(ucret, { target: { value: '125' } });
    fireEvent.click(within(ac_).getByRole('button', { name: 'İleri' }));
    fireEvent.click(within(ac_).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('T1 saat ücreti 125 TL/sa oldu')).toBeTruthy();
    expect(screen.getByText(/Plan bu değişikliği henüz içermiyor/)).toBeTruthy();
    expect((screen.getByRole('button', { name: 'Planı iyileştir' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Yeniden düzenle' }));
    expect((within(screen.getByRole('region', { name: 'S1 · Tezgâh' })).getByLabelText(/Saat ücreti/) as HTMLInputElement).value).toBe('125');
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(screen.queryByRole('region', { name: 'S1 · Tezgâh' })).toBeNull();
    expect((document.activeElement as HTMLElement | null)?.getAttribute('aria-label')).toMatch(/^S1, Tezgâh: /);
  }, 30000);

  it('Tüm satırlarda erken sevk kartı siparişin bayrağını yazar', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, kayit(), { govdeler });
    ac('/recete-rota/planlama-yeni/maliyet');
    fireEvent.click(await screen.findByText('Tüm satırlar', {}, BEKLE));
    const k = await screen.findByRole('region', { name: 'Erken sevk kabul eden siparişler' });
    fireEvent.click(within(k).getByRole('checkbox', { name: 'S1' }));
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect((govdeler[0] as Govde).deger.D.siparisler).toEqual([expect.objectContaining({ id: 'S1', erkenSevk: true })]);
  }, 30000);

  it('değer değişmeden kaydedilmez: "Hiçbir şey değişmedi."', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, kayit(), { govdeler });
    ac('/recete-rota/planlama-yeni/maliyet');
    fireEvent.click(await screen.findByRole('button', { name: /^S1, Tezgâh: / }, BEKLE));
    fireEvent.click(screen.getByRole('button', { name: 'İleri' }));
    expect(screen.getByRole('alert').textContent).toContain('Hiçbir şey değişmedi.');
    expect(govdeler).toEqual([]);
  }, 30000);

  it('kayıt yazma izni yoksa harita görünür, form yerine yetki iletisi çıkar, yazma gitmez (reddedilen)', async () => {
    const istekler = sunucuKur(YONETICI, kayit(), { yazabilir: false });
    ac('/recete-rota/planlama-yeni/maliyet');
    fireEvent.click(await screen.findByRole('button', { name: /^S1, Tezgâh: / }, BEKLE));
    expect(screen.getByText(/Bunu değiştirme yetkiniz yok/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'İleri' })).toBeNull();
    fireEvent.click(screen.getByText('Tüm satırlar'));
    expect((await screen.findByLabelText('T1 saat maliyeti') as HTMLInputElement).disabled).toBe(true);
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
  }, 30000);

  it('Tüm satırlarda satır içi girdi alandan çıkınca tek alanı yazar; geçersiz sayı yazılmaz (izinli)', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, kayit(), { govdeler });
    ac('/recete-rota/planlama-yeni/maliyet');
    fireEvent.click(await screen.findByText('Tüm satırlar', {}, BEKLE));
    const u = await screen.findByLabelText('T1 saat maliyeti') as HTMLInputElement;
    fireEvent.change(u, { target: { value: 'abc' } });
    fireEvent.blur(u);
    expect(await screen.findByText('Geçerli bir sayı girin.')).toBeTruthy();
    expect(govdeler).toEqual([]);
    fireEvent.change(u, { target: { value: '150' } });
    fireEvent.keyDown(u, { key: 'Enter' });
    expect(await screen.findByText(/Tezgâh saat maliyeti değişti/)).toBeTruthy();
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    const g = govdeler[0] as Govde;
    expect(g.deger.D.tezgahlar).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'T1', ucret: 150 })]));
  }, 30000);

  it('maliyet okuma yetkisi olmayan sayfayı açamaz, Tüm satırlar ve girdi gelmez (reddedilen)', async () => {
    const istekler = sunucuKur(PLANLAMACI, kayit());
    ac('/recete-rota/planlama-yeni/maliyet');
    expect(await screen.findByText('Bu sayfayı görme yetkiniz yok.', {}, BEKLE)).toBeTruthy();
    expect(screen.queryByText('Tüm satırlar')).toBeNull();
    expect(screen.queryByLabelText('T1 saat maliyeti')).toBeNull();
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
  }, 30000);

  it('plan yoksa boş durum metni gösterilir, sıfır uydurulmaz', async () => {
    sunucuKur(YONETICI, kayit({ plan: null }));
    ac('/recete-rota/planlama-yeni/maliyet');
    expect(await screen.findByText('Plan kurulunca her siparişin maliyeti kalem kalem burada görünür.', {}, BEKLE)).toBeTruthy();
  }, 30000);
});

describe('P3 Genel gider', () => {
  it('Tüm satırlarda gider kalemi eklenir; kalem satırı haritaya girer; yazma planı korur', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(YONETICI, kayit(), { govdeler });
    ac('/recete-rota/planlama-yeni/giderler');
    expect(await screen.findByRole('group', { name: 'Gider kalemi × tezgâh grubu, aylık pay' }, BEKLE)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Genel gider: diğer işlemler' })).toBeNull();
    fireEvent.click(screen.getByText('Tüm satırlar'));
    const f = await screen.findByRole('form', { name: 'Gider kalemi ekle' });
    fireEvent.change(within(f).getByLabelText('Kalem adı'), { target: { value: 'Kira' } });
    fireEvent.change(within(f).getByLabelText('Aylık TL'), { target: { value: '3000' } });
    fireEvent.click(within(f).getByRole('button', { name: 'Ekle' }));
    expect(await screen.findByText('Gider kalemi eklendi.')).toBeTruthy();
    expect(screen.getByText('Kira', { selector: '.tc-pyk-ad b' })).toBeTruthy();
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect((govdeler[0] as Govde).deger.D.maliyetSis).toMatchObject({ kalemler: [{ id: 'K1', ad: 'Kira', aylik: 3000 }] });
  }, 30000);
});

describe('P3 Ek mesai planı', () => {
  it('planlamacı (maliyetsiz, plan.yaz) ek vardiya açar; para sütunu gizlidir', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(PLANLAMACI, kayit(), { govdeler });
    ac('/recete-rota/planlama-yeni/mesaiplan');
    expect(await screen.findByRole('group', { name: 'Tezgâh × gün, doluluk ve ek mesai' }, BEKLE)).toBeTruthy();
    tikla(/2 satır daha göster/);
    fireEvent.click(screen.getByRole('button', { name: /^T1, 05\.01 Pzt: %25 dolu/ }));
    const ac_ = screen.getByRole('region', { name: 'T1 · 05.01 Pzt' });
    expect(within(ac_).getByRole('button', { name: /Önerileri hesapla/ }).hasAttribute('disabled')).toBe(true);
    expect(within(ac_).getByText('Plan motoru bağlanınca açılır.')).toBeTruthy();
    const ust = document.querySelector('.tc-pyk-durum');
    expect(ust && within(ust as HTMLElement).getByRole('button', { name: 'Önerileri hesapla' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(within(ac_).getByRole('button', { name: 'İleri' }));
    fireEvent.click(within(ac_).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('T1 için 2026-01-05 V1 ek vardiyası eklendi')).toBeTruthy();
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect((govdeler[0] as Govde).deger.ekMesai).toEqual([{ m: 'T1', gun: 0, vardiya: 'V1' }]);
    fireEvent.click(screen.getByText('Tüm satırlar'));
    expect(await screen.findByRole('button', { name: /^T1 .* V1 ek mesaisini kaldır$/ })).toBeTruthy();
    expect(screen.queryByRole('columnheader', { name: 'Maliyet' })).toBeNull();
  }, 30000);

  it('plan.yaz işlemi olmayan kişide yazma yoktur (reddedilen)', async () => {
    const istekler = sunucuKur(MALIYETSIZ, kayit({ ekMesai: [{ m: 'T1', gun: 0, vardiya: 'V1' }] }));
    ac('/recete-rota/planlama-yeni/mesaiplan');
    fireEvent.click(await screen.findByRole('button', { name: /^T1, 05\.01 Pzt: / }, BEKLE));
    expect(screen.queryByRole('button', { name: /ek vardiyasını kaldır/ })).toBeNull();
    expect(document.querySelector('.tc-pyk-durum button')).toBeNull();
    fireEvent.click(screen.getByText('Tüm satırlar'));
    expect(await screen.findByText('Elle girildi')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /ek mesaisini kaldır/ })).toBeNull();
    expect(istekler.filter((i) => !i.startsWith('GET'))).toEqual([]);
  }, 30000);
});

describe('P3 Fason planı', () => {
  it('fasoncu × gün çizilir; hücreden dönüş termini girilir', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(PLANLAMACI, kayit(), { govdeler });
    ac('/recete-rota/planlama-yeni/fasonplan');
    expect(await screen.findByRole('group', { name: 'Fasoncu × gün, kapasite ve gecikme' }, BEKLE)).toBeTruthy();
    expect(document.querySelector('.tc-pyk-durum')?.textContent).toContain('1 fason işinden 1 tanesi siparişi geciktiriyor, 1 tanesinin dönüş tarihi yok');
    fireEvent.click(screen.getByRole('button', { name: /^Deneme kaplama, 05\.01 Pzt: 1 iş fasoncuda/ }));
    const ac_ = screen.getByRole('region', { name: 'Deneme kaplama · 05.01 Pzt' });
    fireEvent.change(within(ac_).getByLabelText(/Dönüş günü/), { target: { value: '2026-01-07' } });
    fireEvent.click(within(ac_).getByRole('button', { name: 'İleri' }));
    fireEvent.click(within(ac_).getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByText('S1.20 dönüş termini 2026-01-07 oldu')).toBeTruthy();
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect((govdeler[0] as Govde).deger.D).toMatchObject({ fasonTermin: { 'S1.20': '2026-01-07 16:00' }, fasonRef: { 'S1.20': '2026-01-07 10:00' } });
  }, 30000);

  it('Tüm satırlarda öneri düğmesi kapalıdır; dönüş termini satırdan yazılır', async () => {
    const govdeler: unknown[] = [];
    sunucuKur(PLANLAMACI, kayit(), { govdeler });
    ac('/recete-rota/planlama-yeni/fasonplan');
    fireEvent.click(await screen.findByText('Tüm satırlar', {}, BEKLE));
    expect((await screen.findByRole('button', { name: 'Önerileri hesapla' })).hasAttribute('disabled')).toBe(true);
    fireEvent.change(screen.getByLabelText('S1.20 fason dönüş termini'), { target: { value: '2026-01-08' } });
    await waitFor(() => { expect(govdeler).toHaveLength(1); }, { timeout: 5000 });
    expect((govdeler[0] as Govde).deger.D).toMatchObject({ fasonTermin: { 'S1.20': '2026-01-08 16:00' } });
  }, 30000);
});
