import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CanliyaAlOnizlemesiCevabi } from '#paylasilan/sozlesme/plan.ts';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { api, ApiHatasi } from '../../../../ortak/veri/api.ts';
import { PLANLAMA_ISLEMI } from '../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import { otomatikUygulaSifirla } from '../motor/atolye/gonder.ts';
import { kaydirmaDugmesi, kapaliListeFarkli, onizlemeEngeli, sureMetni } from '../motor/atolye/canli-onizleme.ts';
import { planKurSifirla } from '../motor/coz.ts';
import { ornekCalisma } from '../motor/ornek.ts';
import { saatiSabitle } from '../test-saati.ts';
import type { PlanlamaDeposu } from '../veri.ts';
import { yetkiKur } from '../yetki.ts';
import { Kokpit } from './index.tsx';

// 3669: onay sayfasında gönderme öncesi sıra denetimi. Sunucu yerine api taklit edilir; örnek çalışma uydurmadır.
saatiSabitle(ornekCalisma);
afterEach(() => { cleanup(); vi.restoreAllMocks(); otomatikUygulaSifirla(); planKurSifirla(); });

const ONIZLEME = '/plan/planlama-calismasi/gonderme-onizlemesi';
const IS_TASI = '/plan/planlama-calismasi/is-tasi';
const guncelCalisma = (kapali: string[] = []) => { const c = ornekCalisma(); return c.plan ? { ...c, kapali, plan: { ...c.plan, dataVer: c.dataVer } } : c; };
const [K1, K2] = Object.keys(guncelCalisma().plan?.ops ?? {}) as [string, string];

const veri = (p: Partial<CanliyaAlOnizlemesiCevabi> = {}): CanliyaAlOnizlemesiCevabi => ({
  kapali: [], kilitYetkisi: true, oneri: null, oneriNedeni: null, ihlaller: [], ...p,
});
const IHLAL: CanliyaAlOnizlemesiCevabi['ihlaller'][number] = {
  isEmriId: 9, emirNo: 'ORN-E-1', opNo: 70, k: K2, kilitli: true, baslangic: '2026-10-21T08:00:00.000Z',
  oncul: { emirNo: 'ORN-E-1', opNo: 60, k: K1, bitis: '2026-10-21T10:30:00.000Z' }, farkDk: 150,
};
const ONERI: NonNullable<CanliyaAlOnizlemesiCevabi['oneri']> = {
  adimlar: [{ isEmriId: 9, emirNo: 'ORN-E-1', opNo: 70, k: K2, eskiBaslangic: '2026-10-21T08:00:00.000Z', yeniBaslangic: '2026-10-21T10:30:00.000Z', yeniBitis: '2026-10-21T12:00:00.000Z' }],
  emirler: [{ emirNo: 'ORN-E-1', once: '2026-10-21T12:00:00.000Z', sonra: '2026-10-21T14:30:00.000Z', termin: '2026-10-30' }], kalanIhlal: 0,
};

const GERI_AL = '/plan/planlama-calismasi/geri-al';
function sunucu(onizleme: CanliyaAlOnizlemesiCevabi | ApiHatasi, tasiSonuclari: (ApiHatasi | null)[] = []) {
  const kalan = [...tasiSonuclari];
  vi.spyOn(api, 'get').mockImplementation(((yol: string) => (yol === '/plan/surum' ? Promise.resolve({ planSurumu: 4, sonCanliyaAlma: null }) : Promise.reject(new Error('yok')))) as never);
  return vi.spyOn(api, 'post').mockImplementation(((yol: string) => {
    if (yol === ONIZLEME) return onizleme instanceof ApiHatasi ? Promise.reject(onizleme) : Promise.resolve(onizleme);
    if (yol === IS_TASI) { const r = kalan.shift() ?? null; return r ? Promise.reject(r) : Promise.resolve({ calismaSurumu: 5 + (tasiSonuclari.length - kalan.length), oncekiSurum: 4, ileti: null }); }
    if (yol === GERI_AL) return Promise.resolve({ calismaSurumu: 9, donulenSurum: 4 });
    return Promise.reject(new Error(`beklenmeyen istek ${yol}`));
  }) as never);
}
function sayfayiAc(kapali: string[] = [], islemler: string[] = ['plan.kilitle'], guncel = true) {
  const geriAl = vi.fn(() => true);
  const komut = { degistir: () => false, geriAl, geriAlinabilir: () => true, geriAdimlari: () => [], geriDon: () => true, kaydet: () => Promise.resolve(4), komutBasladi: vi.fn(), komutDustu: vi.fn() } as unknown as CalismaKomutu;
  const yenile = vi.fn();
  const depo = { ben: { kisi: { ad: 'ORN-Planlamaci' } }, durum: null, planSurumu: { planSurumu: 3, sonCanliyaAlma: null, bayat: null }, senaryolar: { canli: null, canliSurum: 3, senaryolar: [] }, calismaSurumu: 4, receteRotaKaydi: null } as unknown as PlanlamaDeposu;
  render(
    <MemoryRouter initialEntries={['/?duzen=klasik']}><BildirimSaglayici>
      <Kokpit
        depo={depo} calisma={guncel ? guncelCalisma(kapali) : { ...guncelCalisma(kapali), dataVer: 9999 }} komut={komut} git={vi.fn()} yenile={yenile} yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz', 'plan.canliya-al', ...islemler])}
        olcek={ACILIS_OLCEGI} olcekSec={vi.fn()} kaydir={vi.fn()} secim={BOS_SECIM} sec={vi.fn()}
      />
    </BildirimSaglayici></MemoryRouter>,
  );
  fireEvent.click(screen.getByRole('button', { name: /^Canlıya al/ }));
  return { geriAl, yenile, komut };
}
const sayfaDugmesi = () => screen.findByRole('button', { name: 'Canlıya al' }, { timeout: 5000 });

describe('onay sayfası: gönderme öncesi sıra denetimi (3669)', () => {
  it('sıraya aykırı kilitli adımı gönderilmeden söyler; iki gönderme düğmesi aynı durumda kapalıdır ve nedeni yazar; Kokpit ve canlı saati ayrı yazılır', async () => {
    sunucu(veri({ ihlaller: [IHLAL], oneri: ONERI }));
    sayfayiAc();
    const uyari = await screen.findByRole('group', { name: 'Sıraya aykırı adımlar' }, { timeout: 5000 });
    expect(uyari.textContent).toContain('Canlıya alınınca 1 adım');
    expect(uyari.textContent).toContain('1 adım öncülünden önce başlar');
    expect(uyari.textContent).toContain('ORN-E-1 OP 70');
    expect(within(uyari).getByText('Kokpit')).toBeTruthy();
    expect(within(uyari).getByText('Canlıya alınınca')).toBeTruthy();
    expect(uyari.textContent).toContain('ORN-E-1 bitişi');
    expect(uyari.textContent).toContain('termin 30.10');
    expect((await sayfaDugmesi()).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Onaya gönder' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText("Önce kilidi kaydırın ya da adımı Kokpit'te düzeltin.")).toBeTruthy();
    expect(within(uyari).getByRole('button', { name: "OP 70'i kaydır" })).toBeTruthy();
  });

  it('kaydır, Kokpit taşıma komutuyla adımı önerilen saate kilitler ve sayfayı yeniler; Geri al Kokpit geri almasıdır', async () => {
    const post = sunucu(veri({ ihlaller: [IHLAL], oneri: ONERI }));
    const { geriAl, yenile, komut } = sayfayiAc();
    fireEvent.click(await screen.findByRole('button', { name: "OP 70'i kaydır" }, { timeout: 5000 }));
    await waitFor(() => expect(yenile).toHaveBeenCalled());
    const tasi = post.mock.calls.filter((x) => x[0] === IS_TASI);
    expect(tasi).toHaveLength(1);
    expect(tasi[0]![1]).toMatchObject({ isId: K2, calismaSurumu: 4 });
    expect(komut.komutBasladi).toHaveBeenCalledOnce();
    fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }));
    expect(geriAl).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Geri al' })).toBeNull());
  });

  it('öneri yoksa nedeni yazar ve kaydır düğmesi çizilmez', async () => {
    sunucu(veri({ ihlaller: [IHLAL], kilitYetkisi: false, oneriNedeni: 'Kilitli adımı kaydırmak plan kilitleme yetkisi ister.' }));
    sayfayiAc();
    const uyari = await screen.findByRole('group', { name: 'Sıraya aykırı adımlar' }, { timeout: 5000 });
    expect(uyari.textContent).toContain('Kilitli adımı kaydırmak plan kilitleme yetkisi ister.');
    expect(within(uyari).queryByRole('button', { name: /kaydır/ })).toBeNull();
  });

  it('aykırı adım yoksa söyler ve gönderme açık kalır', async () => {
    sunucu(veri());
    sayfayiAc();
    expect(await screen.findByText('Sıraya aykırı adım yok.', {}, { timeout: 5000 })).toBeTruthy();
    expect((await sayfaDugmesi()).hasAttribute('disabled')).toBe(false);
  });

  it('önizleme alınamazsa gönderme kapalıdır, nedeni yazar; Yeniden dene yeniden sorar', async () => {
    const post = sunucu(new ApiHatasi(500, { kod: 'SUNUCU', mesaj: 'Sunucu hatası.' }));
    sayfayiAc();
    const dene = await screen.findByRole('button', { name: 'Yeniden dene' }, { timeout: 5000 });
    expect(screen.getAllByText(/Sıra denetimi alınamadı/).length).toBeGreaterThan(0);
    expect((await sayfaDugmesi()).hasAttribute('disabled')).toBe(true);
    expect(screen.getByRole('button', { name: 'Onaya gönder' }).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Sıra denetimi alınamadığı için kapalı; yeniden deneyin.')).toBeTruthy();
    fireEvent.click(dene);
    await waitFor(() => expect(post.mock.calls.filter((x) => x[0] === ONIZLEME).length).toBe(2));
  });

  it('denetim sürerken gönderme kapalıdır; sonuç gelince açılır', async () => {
    let bitir: (v: CanliyaAlOnizlemesiCevabi) => void = () => undefined;
    vi.spyOn(api, 'get').mockImplementation((() => Promise.reject(new Error('yok'))) as never);
    vi.spyOn(api, 'post').mockImplementation(((yol: string) => (yol === ONIZLEME ? new Promise((r) => { bitir = r as never; }) : Promise.reject(new Error('x')))) as never);
    sayfayiAc();
    expect((await sayfaDugmesi()).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Sıra denetimi bitince açılır.')).toBeTruthy();
    bitir(veri());
    await waitFor(async () => { expect((await sayfaDugmesi()).hasAttribute('disabled')).toBe(false); });
  });

  it('uyarıda neden cümlesi ve saatler iki ayrı satırdır', async () => {
    sunucu(veri({ ihlaller: [IHLAL], oneri: ONERI }));
    sayfayiAc();
    const uyari = await screen.findByRole('group', { name: 'Sıraya aykırı adımlar' }, { timeout: 5000 });
    expect(uyari.textContent).toMatch(/Canlı yerleşimde OP 60 .*21\.10 Çar 10:30'de bitiyor; OP 70 kilitli olduğu için 21\.10 Çar 08:00'de başlamaya devam ediyor\./);
    const satirlar = [...uyari.querySelectorAll('.tc-pym-pa-ihlal-saat dd')].map((d) => [...d.children].length);
    expect(satirlar).toEqual([2, 2]);
  });

  it('kaydırma sonrası eski ve yeni saatler, emir bitişi ve termin görünür kalır', async () => {
    sunucu(veri({ ihlaller: [IHLAL], oneri: ONERI }));
    sayfayiAc();
    fireEvent.click(await screen.findByRole('button', { name: "OP 70'i kaydır" }, { timeout: 5000 }));
    const kutu = await waitFor(() => { const k = document.querySelector<HTMLElement>('.tc-pym-pa-kaydirildi'); if (!k) throw new Error('yok'); return k; });
    expect(kutu.textContent).toContain('21.10 Çar 08:00 → 21.10 Çar 10:30');
    expect(kutu.textContent).toContain('ORN-E-1 bitişi');
    expect(kutu.textContent).toContain('termin 30.10');
  });

  it('kilitleme yetkisi yoksa kaydır düğmesi çizilmez, yalnız metin kalır', async () => {
    sunucu(veri({ ihlaller: [IHLAL], oneri: ONERI }));
    sayfayiAc([], []);
    const uyari = await screen.findByRole('group', { name: 'Sıraya aykırı adımlar' }, { timeout: 5000 });
    expect(within(uyari).queryByRole('button', { name: /kaydır/ })).toBeNull();
    expect(uyari.textContent).toContain('Kilitli adımı kaydırmak plan kilitleme yetkisi ister.');
  });

  it('iki adımlı kaydırmada ikincisi reddedilirse birincisi geri alınır; Geri al ve özet görünmez', async () => {
    const iki = { ...ONERI, adimlar: [ONERI.adimlar[0]!, { ...ONERI.adimlar[0]!, isEmriId: 10, opNo: 80, k: K1 }] };
    const ihlal2 = { ...IHLAL, isEmriId: 10, opNo: 80, k: K1 };
    const post = sunucu(veri({ ihlaller: [IHLAL, ihlal2], oneri: iki }), [null, new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Sunucu reddetti.' })]);
    const { komut } = sayfayiAc();
    fireEvent.click(await screen.findByRole('button', { name: "OP 70 ve OP 80'i kaydır" }, { timeout: 5000 }));
    await waitFor(() => expect(post.mock.calls.filter((x) => x[0] === GERI_AL).length).toBe(1));
    expect(post.mock.calls.filter((x) => x[0] === IS_TASI)).toHaveLength(2);
    expect(post.mock.calls.find((x) => x[0] === GERI_AL)![1]).toEqual({ calismaSurumu: 6 });
    expect(komut.komutDustu).toHaveBeenCalledOnce();
    expect(await screen.findByText(/yazılan 1 adım geri alındı/)).toBeTruthy();
    expect(document.querySelector('.tc-pym-pa-kaydirildi')).toBeNull();
  });

  it('kapalı kısıt varken kalıcı satır adlarını yazar, fazlası +N ile açılır; kayıtlı listeden farklıysa uyarır', async () => {
    sunucu(veri({ kapali: ['ayar'] }));
    sayfayiAc(['ayar', 'tatil', 'personel']);
    const satir = await screen.findByText(/Kapalı kısıt:/, {}, { timeout: 5000 });
    const kutu = satir.closest('.tc-pym-pa-kisit') as HTMLElement;
    expect(kutu.textContent).toContain('+1');
    fireEvent.click(within(kutu).getByRole('button', { name: '1 kısıt daha' }));
    expect(within(kutu).getByRole('button', { name: 'Kısıt listesini daralt' })).toBeTruthy();
    await waitFor(() => expect(kutu.dataset.ton).toBe('uyari'));
    expect(kutu.textContent).toContain('kaydedilmemiş kısıt değişikliği');
    expect(within(kutu).getByRole('link', { name: /^Kısıtlar/ }).getAttribute('target')).toBe('_blank');
  });

  it('plan güncel değilken denetim istenmez; sonsuz "yapılıyor" yerine nedeni ve çıkışı yazar', async () => {
    const post = sunucu(veri());
    sayfayiAc([], ['plan.kilitle'], false);
    expect(await screen.findByText(/Plan güncel değil; sıra denetimi plan güncellenince yapılır/, {}, { timeout: 5000 })).toBeTruthy();
    expect(screen.queryByText(/Sıra denetimi yapılıyor/)).toBeNull();
    expect(post.mock.calls.filter((x) => x[0] === ONIZLEME)).toHaveLength(0);
  });

  it('kapalı kısıt yoksa satır çizilmez', async () => {
    sunucu(veri());
    sayfayiAc();
    await screen.findByText('Sıraya aykırı adım yok.', {}, { timeout: 5000 });
    expect(document.querySelector('.tc-pym-pa-kisit')).toBeNull();
  });
});

describe('sıra denetimi yardımcıları', () => {
  it('düğme adı sonucu söyler', () => {
    expect(kaydirmaDugmesi([{ opNo: 70 }])).toBe("OP 70'i kaydır");
    expect(kaydirmaDugmesi([{ opNo: 70 }, { opNo: 80 }])).toBe("OP 70 ve OP 80'i kaydır");
    expect(kaydirmaDugmesi([{ opNo: 70 }, { opNo: 80 }, { opNo: 90 }])).toBe("OP 70, OP 80 ve OP 90'i kaydır");
  });
  it('süre ve engel metinleri', () => {
    expect([sureMetni(45), sureMetni(120), sureMetni(150)]).toEqual(['45 dk', '2 sa', '2 sa 30 dk']);
    expect(onizlemeEngeli({ tur: 'hazir', veri: veri() })).toBeNull();
    expect(onizlemeEngeli({ tur: 'hazir', veri: veri({ ihlaller: [IHLAL] }) })).not.toBeNull();
    expect(onizlemeEngeli({ tur: 'yukleniyor', onceki: veri({ ihlaller: [IHLAL] }) })).not.toBeNull();
    expect(onizlemeEngeli({ tur: 'hata', ileti: 'x' })).not.toBeNull();
    expect(onizlemeEngeli({ tur: 'hata', ileti: 'x' }, false)).toBeNull();
  });
  it('kapalı liste sıradan bağımsız karşılaştırılır', () => {
    expect(kapaliListeFarkli({ kapali: ['a', 'b'] }, ['b', 'a'])).toBe(false);
    expect(kapaliListeFarkli({ kapali: ['a'] }, ['a', 'b'])).toBe(true);
  });
});
