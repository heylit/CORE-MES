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

function sayfayiAc() {
  const depo = { ben: { kisi: { ad: 'ORN-Planlamaci' } }, durum: null, planSurumu: { planSurumu: 3, sonCanliyaAlma: null, bayat: null }, senaryolar: { canli: null, canliSurum: 3, senaryolar: [] }, calismaSurumu: 4, receteRotaKaydi: null } as unknown as PlanlamaDeposu;
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
  });
});
