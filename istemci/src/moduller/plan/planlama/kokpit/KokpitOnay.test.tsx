import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { api, ApiHatasi } from '../../../../ortak/veri/api.ts';
import { PLANLAMA_ISLEMI } from '../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import { otomatikUygulaSifirla } from '../motor/atolye/gonder.ts';
import { planKurSifirla } from '../motor/coz.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import { saatiSabitle } from '../test-saati.ts';
import type { PlanlamaDeposu } from '../veri.ts';
import { yetkiKur } from '../yetki.ts';
import { Kokpit } from './index.tsx';

// Çalışma planının tek komutla canlıya alınması (3308-5 a): sunucunun iki sorusu (4 saat kuralı, canlı değişti) pencereyle sorulur ve
// komut cevapla yeniden gider. Örnek çalışma uydurmadır; sunucu yerine api taklit edilir.
saatiSabitle(ornekCalisma);
afterEach(() => { cleanup(); vi.restoreAllMocks(); otomatikUygulaSifirla(); planKurSifirla(); });

const CANLI = '/plan/planlama-calismasi/canliya-al';
const DORT_SAAT = new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'İş 4 saatten kısa sürede başlayacak.', ayrinti: { neden: 'dort-saat', gerekceIle: true } });
const CANLI_DEGISTI = new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Canlı plan değişti.', ayrinti: { neden: 'canli-degisti', tabanSurumu: 3, canliSurumu: 4 } });
const TAMAM = { taslak: { id: 12, surum: 1 }, yazilan: 5, atlanan: 0, yazilamaz: [], senaryolar: { canli: null, canliSurum: 4, senaryolar: [] } };
const komut = { degistir: () => false, geriAl: () => true, geriAlinabilir: () => false, geriAdimlari: () => [], geriDon: () => true, yinele: () => true, yinelenebilir: () => false, kaydet: () => Promise.resolve(4) } as unknown as CalismaKomutu;

// Plan veriyle günceldir; bekleyen değişiklik gönderme düğmelerini kapatırdı.
const guncelCalisma = () => { const c = ornekCalisma(); return c.plan ? { ...c, plan: { ...c.plan, dataVer: c.dataVer } } : c; };

// Sunucu sıradaki cevabı verir; liste bitince kabul eder.
function sunucu(retler: ApiHatasi[]) {
  const kalan = [...retler];
  vi.spyOn(api, 'get').mockImplementation(((yol: string) => (yol === '/plan/surum' ? Promise.resolve({ planSurumu: 4, sonCanliyaAlma: null }) : Promise.reject(new Error('yok')))) as never);
  return vi.spyOn(api, 'post').mockImplementation(((yol: string) => {
    if (yol !== CANLI) return Promise.reject(new Error(`beklenmeyen istek ${yol}`));
    const ret = kalan.shift();
    return ret ? Promise.reject(ret) : Promise.resolve(TAMAM);
  }) as never);
}
const govdeler = (post: { mock: { calls: unknown[][] } }) => post.mock.calls.filter((x) => x[0] === CANLI).map((x) => x[1] as Record<string, unknown>);

function sayfayiAc(senaryolar: unknown = { canli: null, canliSurum: 3, senaryolar: [] }) {
  const depo = { ben: { kisi: { ad: 'ORN-Planlamaci' } }, durum: null, planSurumu: { planSurumu: 3, sonCanliyaAlma: null, bayat: null }, senaryolar, calismaSurumu: 4, receteRotaKaydi: null } as unknown as PlanlamaDeposu;
  render(
    <MemoryRouter><BildirimSaglayici>
      <Kokpit
        depo={depo} calisma={guncelCalisma()} komut={komut} git={vi.fn()} yenile={vi.fn()} yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz', 'plan.canliya-al'])}
        olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={BOS_SECIM} sec={vi.fn()}
      />
    </BildirimSaglayici></MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: /^Canlıya al/ }));
}
async function canliyaAlBas() {
  sayfayiAc();
  fireEvent.click(await sayfaDugmesi());
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: /canlıya al/i }));
}
// Onay sayfasının "Planım" sekmesindeki birincil düğme (üst çubuk sayfa açılınca kalkar).
const sayfaDugmesi = () => screen.findByRole('button', { name: 'Canlıya al' }, { timeout: 5000 });
const pencere = (baslik: string) => screen.findByRole('dialog', { name: baslik });

describe('Kokpit Onay ve canlı: çalışma planı tek komutla canlıya alınır', () => {
  // 3335 a: gerekçe pencereyle sorulmaz; karar alanı zorunlu gerekçeye döner, boşken iki düğme kapalıdır ve nedeni yazar.
  it('4 saat kuralı reddederse karar alanı zorunlu gerekçe olur, düğmeler gerekçe yazılana kadar kapalıdır; yazılınca komut gerekçeyle yeniden gider', async () => {
    const post = sunucu([DORT_SAAT]);
    await canliyaAlBas();
    const alan = await screen.findByRole('textbox', { name: /^Gerekçe \(zorunlu: 4 saat kuralı/ });
    expect(screen.queryByRole('dialog', { name: '4 saat kuralı' })).toBeNull();
    // Neden kontrol listesinde uyarı satırıdır.
    expect([...document.querySelectorAll('.tc-pym-pa-kontrol li[data-d="uyari"]')].some((e) => e.textContent.includes('4 saatten kısa sürede başlayacak'))).toBe(true);
    expect(screen.getByText('Gerekçe yazınca açılır.')).toBeTruthy();
    expect((await sayfaDugmesi()).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Onaya gönder' }).hasAttribute('disabled')).toBe(true);
    fireEvent.change(alan, { target: { value: '  ' } });
    expect((await sayfaDugmesi()).hasAttribute('disabled')).toBe(true);
    fireEvent.change(alan, { target: { value: 'Acil sevkiyat' } });
    expect(screen.queryByText('Gerekçe yazınca açılır.')).toBeNull();
    fireEvent.click(await sayfaDugmesi());
    await waitFor(() => expect(govdeler(post)).toHaveLength(2));
    expect(govdeler(post)[0]).toMatchObject({ planSurumu: 3, dortSaatGerekcesi: null });
    expect(govdeler(post)[1]).toMatchObject({ planSurumu: 3, dortSaatGerekcesi: 'Acil sevkiyat' });
    expect(await screen.findByText(/^Plan canlıda:/)).toBeTruthy();
  });

  it('canlı değiştiyse sorulur; onaylanınca komut okunan canlı sürüm olmadan yeniden gider', async () => {
    const post = sunucu([CANLI_DEGISTI]);
    await canliyaAlBas();
    fireEvent.click(within(await pencere('Canlı plan değişti')).getByRole('button', { name: 'Yine de canlıya al' }));
    await waitFor(() => expect(govdeler(post)).toHaveLength(2));
    expect(govdeler(post)[1]).not.toHaveProperty('planSurumu');
  });

  it('Risk 3308-5-2 K1: iki soru art arda gelirse sonraki komut iki cevabı da taşır; soru yinelenmez', async () => {
    const post = sunucu([CANLI_DEGISTI, DORT_SAAT]);
    await canliyaAlBas();
    fireEvent.click(within(await pencere('Canlı plan değişti')).getByRole('button', { name: 'Yine de canlıya al' }));
    fireEvent.change(await screen.findByRole('textbox', { name: /^Gerekçe \(zorunlu/ }), { target: { value: 'Acil sevkiyat' } });
    fireEvent.click(await sayfaDugmesi());
    await waitFor(() => expect(govdeler(post)).toHaveLength(3));
    expect(govdeler(post)[2]).toMatchObject({ dortSaatGerekcesi: 'Acil sevkiyat' });
    expect(govdeler(post)[2]).not.toHaveProperty('planSurumu');
    expect(await screen.findByText(/^Plan canlıda:/)).toBeTruthy();
  });

  // Gönderilen plan artık onay bekleyenler listesindedir; sayfa o sekmeye geçer ve plan seçili gelir.
  it('onaya gönderince sayfa "Onay bekleyenler" sekmesine geçer; gönderilen plan seçilidir', async () => {
    const gonderilen = {
      id: 12, ad: 'ORN-Onay plani', aciklama: null, durum: 'onayda', acan: 'ORN-Planlamaci', benim: true, acilma: '2026-10-20T08:00:00Z', surum: 1, tabanPlanSurumu: 3, canliDegisti: false,
      gostergeler: null, degisiklikler: [], etki: null, bekleyenler: [], onay: null, yapabilir: { onayaGonder: false, onaydanCek: true, geriGonder: false, canliyaAl: false },
    };
    vi.spyOn(api, 'get').mockImplementation(((yol: string) => (yol === '/plan/surum' ? Promise.resolve({ planSurumu: 3, sonCanliyaAlma: null }) : Promise.reject(new Error('yok')))) as never);
    const post = vi.spyOn(api, 'post').mockImplementation(((yol: string) => (yol === '/plan/planlama-calismasi/onaya-gonder'
      ? Promise.resolve({ ...TAMAM, senaryolar: { canli: null, canliSurum: 3, senaryolar: [gonderilen] } }) : Promise.reject(new Error(`beklenmeyen istek ${yol}`)))) as never);
    sayfayiAc();
    await sayfaDugmesi();
    expect(screen.getByRole('tab', { name: 'Planım' }).getAttribute('aria-selected')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Onaya gönder' }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    await waitFor(() => expect(screen.getByRole('tab', { name: 'Onay bekleyenler (1)' }).getAttribute('aria-selected')).toBe('true'));
    expect((await screen.findAllByText('ORN-Onay plani')).length).toBeGreaterThan(0);
    // 3335-1b: sekme sadedir. Dört sayı, kontrol ve karar görünür; karşılaştırma kutusu yoktur, ayrıntı kapalı gelir.
    const ozet = document.querySelector('[data-sekme="bekleyen"] .tc-pym-pa-ozet');
    expect([...(ozet?.querySelectorAll('dt') ?? [])].map((x) => x.textContent)).toEqual(['işin yeri değişti', 'yeni yerleşen iş', 'geciken sipariş', 'ağırlıklı gecikme']);
    expect(screen.queryByRole('checkbox', { name: /karşılaştır/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Onaydan çek' })).toBeTruthy();
    const ayrinti = document.querySelector<HTMLDetailsElement>('details.tc-pym-pa-ayrinti');
    expect(ayrinti?.open).toBe(false);
    expect(ayrinti?.textContent).toContain('Tezgâh başına değişen iş');
  });
});

// 3335-1b: onay bekleyen planın sade kartı. Sayılar iki planın yerleşiminden (GET /plan, GET /plan?taslak=) ve göstergelerden gelir;
// fikstürde yeri değişen (2) ve yeni yerleşen (3) iş sayısı bilerek farklıdır.
describe('Kokpit onay sayfası: onay bekleyen planın sade kartı (3335-1b)', () => {
  const y = (isEmriId: number, kaynak: number, baslangic: string) => ({ isEmriId, kaynak: { tur: 'makine', id: kaynak }, baslangic, bitis: baslangic, kilitli: false, dondurulmus: false, durum: 'planli' });
  const plan = (yerlesimler: unknown[], agirlikliGecikmeSaat: number) => ({
    kaynaklar: [{ tur: 'makine', id: 1, kod: 'M1', ad: 'M1' }, { tur: 'makine', id: 2, kod: 'M2', ad: 'M2' }], yerlesimler, emirler: [], gostergeler: { agirlikliGecikmeSaat },
  });
  const CANLI_PLANI = plan([y(1, 1, '2026-10-21T08:00:00Z'), y(2, 1, '2026-10-21T10:00:00Z'), y(3, 2, '2026-10-21T12:00:00Z')], 4);
  const TASLAK_PLANI = plan([y(1, 2, '2026-10-21T08:00:00Z'), y(2, 1, '2026-10-21T11:00:00Z'), y(3, 2, '2026-10-21T12:00:00Z'), y(4, 2, '2026-10-22T08:00:00Z'), y(5, 2, '2026-10-22T09:00:00Z'), y(6, 2, '2026-10-22T10:00:00Z')], 1.5);
  const gosterge = (geciken: number, agirlikliGecikmeSaat: number) => ({ geciken, zamanindaYuzde: 90, agirlikliGecikmeSaat, yerlesmeyen: 0 });
  const bekleyen = {
    id: 12, ad: 'ORN-Onay plani', aciklama: null, durum: 'onayda', acan: 'ORN-Planlamaci', benim: false, acilma: '2026-10-20T08:00:00Z', surum: 1, tabanPlanSurumu: 3, canliDegisti: false,
    gostergeler: gosterge(1, 1.5), degisiklikler: [{}], etki: null, bekleyenler: [],
    onay: { gonderen: 'ORN-Planlamaci', gonderme: '2026-10-20T09:00:00Z', not: 'ORN gönderme notu' }, yapabilir: { onayaGonder: false, onaydanCek: false, geriGonder: true, canliyaAl: true },
  };
  async function bekleyeniAc(canli: unknown) {
    vi.spyOn(api, 'get').mockImplementation(((yol: string) => (
      yol === '/plan/surum' ? Promise.resolve({ planSurumu: 3, sonCanliyaAlma: null })
        : yol === '/plan' && canli ? Promise.resolve(CANLI_PLANI)
          : yol === '/plan?taslak=12' ? Promise.resolve(TASLAK_PLANI) : Promise.reject(new Error('yok')))) as never);
    sayfayiAc({ canli, canliSurum: 3, senaryolar: [bekleyen] });
    fireEvent.click(await screen.findByRole('tab', { name: 'Onay bekleyenler (1)' }, { timeout: 5000 }));
    return waitFor(() => { const k = document.querySelector<HTMLElement>('[data-sekme="bekleyen"] .tc-pym-pa-planim'); if (!k) throw new Error('kart yok'); return k; });
  }
  const sayilar = (kart: HTMLElement) => [...kart.querySelectorAll('.tc-pym-pa-ozet > div')].map((x) => `${x.querySelector('dt')?.textContent ?? ''}: ${x.querySelector('dd')?.textContent ?? ''}`);

  it('dört sayı iki plandan gelir: yeri değişen ve yeni yerleşen iş ayrı sayılır; Kontrol, Karar ve karar geçmişi görünür', async () => {
    const kart = await bekleyeniAc(gosterge(3, 4));
    await waitFor(() => expect(sayilar(kart)).toEqual(['işin yeri değişti: 2', 'yeni yerleşen iş: 3', 'geciken sipariş: 3 → 1', 'ağırlıklı gecikme: 4,0 → 1,5 sa']));
    expect(kart.querySelector('[data-cizgi-notu]')).toBeNull();
    expect(within(kart).getByRole('heading', { name: 'Kontrol' })).toBeTruthy();
    expect(within(kart).getByText('Geciken sipariş canlıya göre 2 azalıyor')).toBeTruthy();
    expect(within(kart).getByRole('button', { name: 'Onayla ve canlıya al' })).toBeTruthy();
    expect(within(kart).getByRole('button', { name: 'Geri gönder' })).toBeTruthy();
    const gecmis = within(kart).getByRole('heading', { name: 'Karar geçmişi' }).parentElement;
    expect(gecmis?.textContent).toContain('ORN-Planlamaci onaya gönderdi');
    expect(gecmis?.textContent).toContain('ORN gönderme notu');
    // Sıra: sayılar, kontrol, karar, geçmiş; ayrıntı en altta kapalı.
    const basliklar = [...kart.querySelectorAll('h3, details > summary')].map((x) => (x.textContent ?? '').trim().split(':')[0]);
    expect(basliklar.slice(0, 3)).toEqual(['Kontrol', 'Karar', 'Karar geçmişi']);
    expect(basliklar[3]).toBe('Ayrıntı');
  });

  it('canlı plan yokken yeri değişen ve yeni yerleşen iş sayılmaz; çizginin nedeni yazar', async () => {
    const kart = await bekleyeniAc(null);
    await waitFor(() => expect(sayilar(kart)[3]).toBe('ağırlıklı gecikme: 1,5 sa'));
    expect(sayilar(kart).slice(0, 3)).toEqual(['işin yeri değişti: —', 'yeni yerleşen iş: —', 'geciken sipariş: 1']);
    expect(kart.querySelector('[data-cizgi-notu]')?.textContent).toBe('Canlı plan yok; yeri değişen ve yeni yerleşen iş sayılamaz (—).');
  });
});
