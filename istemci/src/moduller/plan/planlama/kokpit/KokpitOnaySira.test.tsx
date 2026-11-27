import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { CanliyaAlOnizlemesiCevabi } from '#paylasilan/sozlesme/plan.ts';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { api, ApiHatasi } from '../../../../ortak/veri/api.ts';
import { PLANLAMA_ISLEMI } from '../../planlama-menusu.ts';
import { ACILIS_OLCEGI, BOS_SECIM } from '../gorunumler.ts';
import type { CalismaKomutu } from '../kayit.ts';
import { otomatikUygulaSifirla } from '../motor/atolye/gonder.ts';
import { KomsuKilitler } from '../motor/atolye/CanliOnizleme.tsx';
import { careCumlesi, gunSaat, kilidiKaldir, kilitCakismasiAyrintidan, kilitCakismasiIsi, kilitCakismasiNedeni, itilenSatiri, kaymaCumlesi, oneriYokMetni, kaydirmaDugmesi, kaydirmaSaati, komsuAdi, komsuKilitKaymalari, yazilanOneri, kapaliListeFarkli, onizlemeEngeli, ONIZLEME_BEKLEME_MS, ONIZLEME_ZAMAN_ASIMI_MS, sureMetni, useGondermeOnizlemesi } from '../motor/atolye/canli-onizleme.ts';
import { planKurSifirla } from '../motor/coz.ts';
import { saatOku } from '../motor/kurallar.ts';
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
function sayfayiAc(kapali: string[] = [], islemler: string[] = ['plan.kilitle'], guncel = true, ek: { locks?: Record<string, unknown>; kayit?: unknown; degistir?: CalismaKomutu['degistir'] } = {}) {
  const geriAl = vi.fn(() => true);
  const komut = { degistir: ek.degistir ?? (() => false), geriAl, geriAlinabilir: () => true, geriAdimlari: () => [], geriDon: () => true, kaydet: () => Promise.resolve(4), komutBasladi: vi.fn(), komutDustu: vi.fn() } as unknown as CalismaKomutu;
  const yenile = vi.fn();
  const depo = { ben: { kisi: { ad: 'ORN-Planlamaci' } }, durum: null, planSurumu: { planSurumu: 3, sonCanliyaAlma: null, bayat: null }, senaryolar: { canli: null, canliSurum: 3, senaryolar: [] }, calismaSurumu: 4, receteRotaKaydi: ek.kayit ?? null } as unknown as PlanlamaDeposu;
  render(
    <MemoryRouter initialEntries={['/?duzen=klasik']}><BildirimSaglayici>
      <Kokpit
        depo={depo} calisma={{ ...(guncel ? guncelCalisma(kapali) : { ...guncelCalisma(kapali), dataVer: 9999 }), ...(ek.locks ? { locks: ek.locks } : {}) }} komut={komut} git={vi.fn()} yenile={yenile} yetki={yetkiKur([PLANLAMA_ISLEMI, 'plan.yaz', 'plan.canliya-al', ...islemler])}
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
    const post = vi.spyOn(api, 'post').mockImplementation(((yol: string) => (yol === ONIZLEME ? new Promise((r) => { bitir = r as never; }) : Promise.reject(new Error('x')))) as never);
    sayfayiAc();
    expect((await sayfaDugmesi()).hasAttribute('disabled')).toBe(true);
    expect(screen.getByText('Sıra denetimi bitince açılır.')).toBeTruthy();
    await waitFor(() => { expect(post.mock.calls.some((x) => x[0] === ONIZLEME)).toBe(true); });
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
    const kaydirDugmesi = await screen.findByRole('button', { name: "OP 70'i kaydır" }, { timeout: 5000 });
    fireEvent.click(kaydirDugmesi);
    // Gönderildiği andan yeni önizleme gelene kadar düğme kapalıdır (ikinci tıklama olmaz).
    expect(kaydirDugmesi.hasAttribute('disabled')).toBe(true);
    const kutu = await waitFor(() => { const k = document.querySelector<HTMLElement>('.tc-pym-pa-kaydirildi'); if (!k) throw new Error('yok'); return k; });
    expect(kutu.textContent).toContain('21.10 Çar 08:00 → 21.10 Çar 10:30');
    // Yazma bitip yeni önizleme gelmeden düğme yeniden etkinleşmez (K1 aralığı).
    expect(screen.queryAllByRole('button', { name: "OP 70'i kaydır" }).every((d) => d.hasAttribute('disabled'))).toBe(true);
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
  it('komşu kilit listesi: tek başlık, kısa satır, ilk 5 ve "N tane daha", çözülemeyen ad okunur, anahtar görünmez', () => {
    const l = Array.from({ length: 7 }, (_, i) => ({ k: i === 6 ? 'a1' : `3${String(i)}.20`, eski: 10 + i, yeni: 10.5 + i }));
    render(<KomsuKilitler komsular={l} D={ornekCalisma().D} emirNo={(j) => `MM-${j}`} />);
    expect(screen.getByText('Bu adımların kilidi de kaydı:')).toBeTruthy();
    expect(document.querySelectorAll('li').length).toBe(5);
    expect(document.body.textContent).toContain('MM-30 OP 20: ');
    expect(document.body.textContent).not.toContain('ileri itildi');
    expect(document.body.textContent).not.toMatch(/\b30\.20\b/);
    fireEvent.click(screen.getByRole('button', { name: '2 tane daha' }));
    expect(document.querySelectorAll('li').length).toBe(7);
    expect(document.body.textContent).toContain('Başka bir kilitli adım: ');
  });
  it('kutu kilide yazılan (çeyrek saate yukarı yuvarlanmış) saati ve ona göre emir bitişini gösterir (O1)', () => {
    const o = { ...ONERI, adimlar: [{ ...ONERI.adimlar[0]!, yeniBaslangic: '2026-10-21T05:46:00.000Z', yeniBitis: '2026-10-21T06:46:00.000Z' }], emirler: [{ ...ONERI.emirler[0]!, sonra: '2026-10-21T07:46:00.000Z' }] };
    const y = yazilanOneri(o, [{ k: 'a', tezgah: 'm', S: 1184 + 46 / 60 }], 0);
    expect(y.adimlar[0]!.yeniBaslangic).toBe('2026-10-21T06:00:00.000Z');
    expect(y.adimlar[0]!.yeniBitis).toBe('2026-10-21T07:00:00.000Z');
    expect(y.emirler[0]!.sonra).toBe('2026-10-21T08:00:00.000Z');
  });
  it('başka kilitli adımın kayması kutuya girer; kaydırılan adımlar ve 30 sn altı fark girmez (O2)', () => {
    const once = { '30.20': 1186.85, '27.20': 1184.75, '12.10': 5 };
    const simdi = { '30.20': { m: 'x', S: 1187.009 }, '27.20': { m: 'x', S: 1185 }, '12.10': { m: 'x', S: 5.004 } };
    expect(komsuKilitKaymalari(once, simdi, new Set(['27.20']))).toEqual([{ k: '30.20', eski: 1186.85, yeni: 1187.009 }]);
    expect(komsuKilitKaymalari(once, {}, new Set())).toEqual([]);
    expect(komsuAdi('30.20', (j) => `MM-${j}`)).toBe('MM-30 OP 20');
    expect(komsuAdi('S3.a1', (j) => `MM-${j}`)).toBeNull();
    expect(komsuAdi('30.20', (j) => j)).toBeNull();
    expect(komsuAdi('yok', (j) => j)).toBeNull();
  });
  it('kaydırma saati çeyrek saate yukarı yuvarlanır; öncül bitişinden önceye düşmez (K2)', () => {
    // 1184.7667 sa = 05:46: en yakına yuvarlama 05:45 (1184.75) verirdi.
    expect(kaydirmaSaati(1184 + 46 / 60, 1000)).toBe(1184.75 + 0.25);
    expect(kaydirmaSaati(1184.75, 1000)).toBe(1184.75);
    expect(kaydirmaSaati(1184.7501, 1000)).toBe(1185);
    expect(kaydirmaSaati(10, 12.1)).toBe(12.25);
    for (const S of [5.01, 5.1, 5.24, 5.26, 5.5, 5.74, 5.76, 1184.7667]) expect(kaydirmaSaati(S, 0)).toBeGreaterThanOrEqual(S);
  });
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
    expect(onizlemeEngeli({ tur: 'hata', ileti: 'x', kilit: null })).not.toBeNull();
    expect(onizlemeEngeli({ tur: 'hata', ileti: 'x', kilit: null }, false)).toBeNull();
  });
  it('3793: kilitsiz ihlalde engel kilit demez; adım, öncülün canlı bitişi ve taşıma önerisi yazılır', () => {
    const kilitsiz = { ...IHLAL, kilitli: false };
    const e = onizlemeEngeli({ tur: 'hazir', veri: veri({ ihlaller: [kilitsiz] }) })!;
    expect(e).not.toContain('kilidi');
    expect(e).toContain('ORN-E-1 OP 70');
    expect(e).toContain(gunSaat(IHLAL.oncul!.bitis));
    expect(careCumlesi(kilitsiz)).toContain('parçalarını');
    expect(careCumlesi(kilitsiz, true)).toBe(`Öneri: OP 70'in parçalarını OP 60 canlıda bittikten sonraya, ${gunSaat(IHLAL.oncul!.bitis)} ve sonrasına taşıyın ya da bölmeyi kaldırın.`);
    expect(careCumlesi(kilitsiz, false)).not.toContain('bölme');
    expect(careCumlesi({ ...kilitsiz, oncul: null })).toContain('yeniden çözün');
    expect(onizlemeEngeli({ tur: 'hazir', veri: veri({ ihlaller: [kilitsiz, IHLAL] }) })).toContain('kilidi');
    expect(itilenSatiri({ emirNo: 'ORN-E-1', opNo: 70, parca: 2, k: K2, onizleme: '2026-10-21T08:00:00.000Z', yeni: '2026-10-21T10:30:00.000Z' }))
      .toBe(`ORN-E-1 OP 70 parça 2: Kokpit ${gunSaat('2026-10-21T08:00:00.000Z')} → canlıya alınınca ${gunSaat('2026-10-21T10:30:00.000Z')} (öncülün arkasına itildi)`);
  });
  it('3793 3a: ihlalin kaynağı bilindiğinde metin onu söyler ve "yeniden çözün" demez', () => {
    const engel = { emirNo: 'ORN-E-9', opNo: 10, kaynak: 'ORN-T1', baslangic: '2026-10-20T05:00:00.000Z', bitis: '2026-10-21T05:40:00.000Z', neden: 'sahada' as const };
    const kayan = { ...IHLAL, kilitli: false, neden: { ilkOp: 10, sonOp: 50, kaymaDk: 990, engel } };
    expect(kaymaCumlesi(kayan)).toBe(`ORN-T1 üzerinde sahada süren ORN-E-9 OP 10 canlıda ${gunSaat(engel.bitis)} bitişine kadar yerinde kalıyor; bu yüzden ORN-E-1 OP 10-OP 50 16 sa 30 dk kayıyor.`);
    expect(careCumlesi({ ...kayan, oncul: null })).not.toContain('yeniden çözün');
    expect(careCumlesi(kayan, false)).toBe(`${kaymaCumlesi(kayan)!} Öneri: OP 70'i OP 60 canlıda bittikten sonraya, ${gunSaat(IHLAL.oncul!.bitis)} ve sonrasına taşıyın.`);
    expect(kaymaCumlesi({ ...kayan, neden: { ...kayan.neden, engel: null } })).toContain("Kokpit'teki yeri canlıda dolu");
    expect(kaymaCumlesi({ ...kayan, neden: null })).toBeNull();
    expect(oneriYokMetni([kayan])).toBe(kaymaCumlesi(kayan));
    expect(oneriYokMetni([{ ...kayan, neden: null }])).toContain('yeniden çözün');
    expect(itilenSatiri({ emirNo: 'ORN-E-1', opNo: 60, parca: null, k: K2, onizleme: '2026-10-21T08:00:00.000Z', yeni: '2026-10-21T10:30:00.000Z' })).toMatch(/^ORN-E-1 OP 60: Kokpit/);
  });
  it('kapalı liste sıradan bağımsız karşılaştırılır', () => {
    expect(kapaliListeFarkli({ kapali: ['a', 'b'] }, ['b', 'a'])).toBe(false);
    expect(kapaliListeFarkli({ kapali: ['a'] }, ['a', 'b'])).toBe(true);
  });
});

// 3669 K1/O2: önizleme çalışma değişince eskir ve yazılan sürümle yeniden istenir.
describe('önizleme çalışmaya bağlıdır (kaydırma sonrası ve eski sürüm)', () => {
  afterEach(() => { vi.useRealTimers(); });
  const ilerle = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  function kur(postSonuclari: (CanliyaAlOnizlemesiCevabi | ApiHatasi)[]) {
    vi.useFakeTimers();
    const sira: string[] = [];
    const kalan = [...postSonuclari];
    const post = vi.spyOn(api, 'post').mockImplementation(((yol: string, g: { calismaSurumu: number }) => {
      sira.push(`post:${String(g.calismaSurumu)}`);
      const r = kalan.shift() ?? veri();
      return yol === ONIZLEME ? (r instanceof ApiHatasi ? Promise.reject(r) : Promise.resolve(r)) : Promise.reject(new Error('x'));
    }) as never);
    let surum = 10;
    const komut = { kaydet: vi.fn(() => { sira.push('kaydet'); surum += 1; return Promise.resolve(surum); }) } as unknown as CalismaKomutu;
    const c1 = guncelCalisma();
    const h = renderHook((p: { c: typeof c1 }) => useGondermeOnizlemesi({ calisma: p.c, komut, ilkSurum: 4, etkin: true, ad: 'Önizleme' }), { initialProps: { c: c1 } });
    return { h, komut, post, sira, c1 };
  }

  it('çalışma değişince durum hemen yükleniyor olur ve kaydırma önceki sonuçla açık kalmaz; istek yazma bittikten sonra yeni sürümle gider', async () => {
    const { h, post, sira, c1 } = kur([veri({ oneri: ONERI, ihlaller: [IHLAL] }), veri()]);
    await ilerle(ONIZLEME_BEKLEME_MS + 10);
    expect(h.result.current.durum.tur).toBe('hazir');
    expect(sira).toEqual(['kaydet', 'post:11']);
    h.rerender({ c: { ...c1, dataVer: c1.dataVer + 1 } });
    const d = h.result.current.durum;
    expect(d.tur).toBe('yukleniyor');
    expect(d.tur === 'yukleniyor' && d.onceki?.oneri).toBeTruthy();
    // Bekleme dolmadan eski çalışma için yeni istek gitmez; art arda değişim tek isteğe birleşir.
    h.rerender({ c: { ...c1, dataVer: c1.dataVer + 2 } });
    await ilerle(ONIZLEME_BEKLEME_MS + 10);
    expect(post.mock.calls.length).toBe(2);
    expect(sira).toEqual(['kaydet', 'post:11', 'kaydet', 'post:12']);
    expect(h.result.current.durum).toEqual({ tur: 'hazir', veri: veri() });
  });

  it('eski sürüm (409) bir kez yeniden yazılıp denenir; yine olmazsa ileti ve yeniden dene kalır', async () => {
    const cakisma = () => new ApiHatasi(409, { kod: 'CAKISMA', mesaj: 'Çalışma bu arada değişti.' } as never);
    const a = kur([cakisma(), veri()]);
    await ilerle(ONIZLEME_BEKLEME_MS + 1000);
    expect(a.sira).toEqual(['kaydet', 'post:11', 'kaydet', 'post:12']);
    expect(a.h.result.current.durum.tur).toBe('hazir');
    a.h.unmount();
    vi.restoreAllMocks();
    const b = kur([cakisma(), cakisma()]);
    await ilerle(ONIZLEME_BEKLEME_MS + 1000);
    expect(b.post.mock.calls.length).toBe(2);
    expect(b.h.result.current.durum).toEqual({ tur: 'hata', ileti: 'Çalışma bu arada değişti.', kilit: null });
  });

  it('çalışma kaydedilemezse (null sürüm) istek gitmez ve hata söylenir', async () => {
    vi.useFakeTimers();
    const post = vi.spyOn(api, 'post');
    const komut = { kaydet: () => Promise.resolve(null) } as unknown as CalismaKomutu;
    const c = guncelCalisma();
    const h = renderHook(() => useGondermeOnizlemesi({ calisma: c, komut, ilkSurum: 4, etkin: true, ad: 'Önizleme' }));
    await ilerle(ONIZLEME_BEKLEME_MS + 10);
    expect(post).not.toHaveBeenCalled();
    expect(h.result.current.durum.tur).toBe('hata');
  });
  it('yanıt gelmezse zaman aşımında hata olur; geç gelen sonuç yine kabul edilir; Yeniden dene yeniden sorar', async () => {
    vi.useFakeTimers();
    let coz: (v: CanliyaAlOnizlemesiCevabi) => void = () => undefined;
    const post = vi.spyOn(api, 'post').mockImplementation((() => new Promise((r) => { coz = r as typeof coz; })) as never);
    const komut = { kaydet: () => Promise.resolve(11) } as unknown as CalismaKomutu;
    const c = guncelCalisma();
    const h = renderHook(() => useGondermeOnizlemesi({ calisma: c, komut, ilkSurum: 4, etkin: true, ad: 'Önizleme' }));
    await ilerle(ONIZLEME_BEKLEME_MS + 10);
    expect(h.result.current.durum.tur).toBe('yukleniyor');
    await ilerle(ONIZLEME_ZAMAN_ASIMI_MS + 10);
    expect(h.result.current.durum).toEqual({ tur: 'hata', ileti: 'Sıra denetimi zamanında dönmedi; yeniden deneyin.', kilit: null });
    expect(onizlemeEngeli(h.result.current.durum, true)).toBe('Sıra denetimi alınamadığı için kapalı; yeniden deneyin.');
    await act(async () => { coz(veri()); await Promise.resolve(); });
    expect(h.result.current.durum.tur).toBe('hazir');
    expect(post.mock.calls.length).toBe(1);
  });

  it('komut nesnesi her çizimde yeni olsa da bekleme sıfırlanmaz ve tek istek gider', async () => {
    vi.useFakeTimers();
    const post = vi.spyOn(api, 'post').mockImplementation((() => Promise.resolve(veri())) as never);
    const c = guncelCalisma();
    const yeniKomut = () => ({ kaydet: () => Promise.resolve(11) }) as unknown as CalismaKomutu;
    const h = renderHook((p: { n: number }) => useGondermeOnizlemesi({ calisma: c, komut: yeniKomut(), ilkSurum: 4, etkin: true, ad: 'Önizleme' }), { initialProps: { n: 0 } });
    for (let i = 1; i <= 5; i++) {
      await ilerle(ONIZLEME_BEKLEME_MS / 2);
      h.rerender({ n: i });
    }
    await ilerle(ONIZLEME_BEKLEME_MS + 10);
    expect(post.mock.calls.length).toBe(1);
    expect(h.result.current.durum.tur).toBe('hazir');
  });
});

// 3793-2 (madde 8): kilitli adım canlıda yerinde kalan işle üst üste; sunucunun iletisi (servis.ts, 3793 6) çakışan işi ve aralığı yazar.
describe('canlıya al: kilit yerinde kalan işle çakışınca iki çare (3793-2)', () => {
  const nokta = K2.lastIndexOf('.');
  const IS = K2.slice(0, nokta), OP = K2.slice(nokta + 1);
  const KAYIT = { orders: [{ id: IS, no: 'ORN-E-9' }] };
  const emirNo = (id: string) => (id === IS ? 'ORN-E-9' : id);
  const ILETI = `ORN-E-9 OP ${OP} kilitli saatinde CNC-002 üzerinde ORN-E-7 OP 20 ile üst üste. OP 20 sahada çalışıyor, canlıda 2026-10-20 00:40 - 2026-10-21 08:30 arasında yerinde kalıyor. OP ${OP} için kilitli saati 2026-10-21 08:30 sonrasına alın ya da kilidi kaldırın.`;
  const tezgahi = (): string => (guncelCalisma().plan!.ops as Record<string, { m: string }>)[K2]!.m;
  const kilit = () => ({ [K2]: { m: tezgahi(), S: 30 } });
  const X = { emirNo: 'ORN-E-9', opNo: Number(OP), kaynak: 'CNC-002', engelEmirNo: 'ORN-E-7', engelOpNo: 20, neden: 'sahada çalışıyor', baslangic: '2026-10-20 00:40', bitis: '2026-10-21 08:30' } as const;
  const cakisma = () => new ApiHatasi(409, { kod: 'CAKISMA', mesaj: ILETI, ayrinti: { kilitCakismasi: X } });

  it('3805: çakışma ayrıntıdan okunur (emir, OP, kaynak, çakışan iş, neden, aralık); eksik ya da biçimsiz ayrıntı null', () => {
    expect(OP).toMatch(/^\d+$/);
    const x = kilitCakismasiAyrintidan({ kilitCakismasi: X })!;
    expect(x).toEqual(X);
    expect(kilitCakismasiNedeni(x)).toBe('ORN-E-7 OP 20 sahada çalışıyor; canlıda 20.10 00:40 - 21.10 08:30 arasında yerinde kalıyor.');
    expect(kilitCakismasiAyrintidan({ kilitCakismasi: { ...X, neden: 'bu yazımda taşınmıyor' } })?.neden).toBe('bu yazımda taşınmıyor');
    for (const bozuk of [undefined, null, 'x', {}, { kilitCakismasi: null }, { kilitCakismasi: { ...X, neden: 'başka' } }, { kilitCakismasi: { ...X, bitis: '21.10 08:30' } },
      { kilitCakismasi: { ...X, opNo: '20' } }, { kilitCakismasi: { ...X, engelEmirNo: '' } }]) expect(kilitCakismasiAyrintidan(bozuk)).toBeNull();
  });

  it('3803 N7: pay kilidi (adım~N) de adımın kilididir; birden çok payda canlı bitişten önce başlayanların en geç başlayanı alınır', () => {
    const c0 = guncelCalisma();
    const m = tezgahi();
    const bitis = saatOku(c0.D, X.bitis)!;
    const tek = { ...c0, locks: { [`${K2}~2`]: { m, S: 30 } } };
    expect(kilitCakismasiIsi(tek, X, emirNo, 0)).toEqual({ k: `${K2}~2`, tezgah: m, S: bitis + 0.25 });
    const cok = { ...c0, locks: { [K2]: { m, S: bitis - 10 }, [`${K2}~2`]: { m: 'T9', S: bitis - 2 }, [`${K2}~3`]: { m, S: bitis + 5 } } };
    expect(kilitCakismasiIsi(cok, X, emirNo, 0)).toEqual({ k: `${K2}~2`, tezgah: 'T9', S: bitis + 0.25 });
    expect(kilitCakismasiIsi({ ...c0, locks: { [`${K2}~x`]: { m, S: 30 } } }, X, emirNo, 0)).toBeNull();
  });

  it('3803 N2, N3: taslak yazımının uyarıları sıra denetiminde canlıya almadan önce listelenir', async () => {
    const u = ['ORN-E-1 OP 10 terminalde durdurulmayı bekliyor: canlıda eski yerinde kalır, operatör durdurunca kalan adet yeni yerine geçer.', 'Parça ve kişi tezgâhı yerleri üç yazımda oturmadı.'];
    sunucu(veri({ uyarilar: u }));
    sayfayiAc([], ['plan.kilitle'], true, { kayit: KAYIT });
    const kutu = await screen.findByRole('status', { name: 'Yazım uyarıları' }, { timeout: 5000 });
    expect(within(kutu).getAllByRole('listitem').map((x) => x.textContent)).toEqual(u);
  });

  it('3805: ayrıntısız 409 (yalnız ileti) çare kartı açmaz; ileti ve Yeniden dene kalır', async () => {
    sunucu(new ApiHatasi(409, { kod: 'CAKISMA', mesaj: ILETI }));
    sayfayiAc([], ['plan.kilitle'], true, { locks: kilit(), kayit: KAYIT });
    expect(await screen.findByText(/Sıra denetimi alınamadı: ORN-E-9/, undefined, { timeout: 5000 })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yeniden dene' })).toBeTruthy();
    expect(screen.queryByRole('group', { name: 'Kilit çakışması' })).toBeNull();
  });

  it('yeni saat canlı bitişten sonraki ilk çeyrek saattir (dakikaya kesik bitiş aynı dakikada üst üste kalmasın); kilit yoksa null', () => {
    const c = { ...guncelCalisma(), locks: kilit() };
    const x = X;
    const bitis = saatOku(c.D, '2026-10-21 08:30')!;
    expect(kilitCakismasiIsi(c, x, emirNo, 0)).toEqual({ k: K2, tezgah: tezgahi(), S: bitis + 0.25 });
    expect(kilitCakismasiIsi(c, { ...X, bitis: '2026-10-21 08:20' }, emirNo, 0)!.S).toBe(bitis);
    expect(kilitCakismasiIsi({ ...c, locks: {} }, x, emirNo, 0)).toBeNull();
    expect(kilitCakismasiIsi({ ...c, locks: { [K2]: { S: 30 } } }, x, emirNo, 0)).toBeNull();
    expect(kilitCakismasiIsi(c, x, (id) => id, 0)).toBeNull();
  });

  it('kilidi kaldırmak kayıtlı çalışmada tek değişikliktir; kilit yoksa değişiklik olmaz', () => {
    const degistir = vi.fn((_ne: string, fn: (t: ReturnType<typeof guncelCalisma>) => boolean | void) => fn(t) !== false);
    const t = { ...guncelCalisma(), locks: kilit() };
    expect(kilidiKaldir({ degistir } as unknown as CalismaKomutu, K2, `ORN-E-9 OP ${OP}`)).toBe(true);
    expect(t.locks[K2]).toBeUndefined();
    expect(degistir.mock.calls[0]![0]).toBe('Kilit kaldırıldı');
    expect(kilidiKaldir({ degistir } as unknown as CalismaKomutu, K2, 'x')).toBe(false);
  });

  it('"Arkasına al" onay penceresi açar; onaylanınca kilit Kokpit taşıma komutuyla canlı bitişin arkasına yazılır, sayfa yenilenir, Geri al görünür', async () => {
    const post = sunucu(cakisma());
    const { yenile, geriAl } = sayfayiAc([], ['plan.kilitle'], true, { locks: kilit(), kayit: KAYIT });
    const kart = await screen.findByRole('group', { name: 'Kilit çakışması' }, { timeout: 5000 });
    expect(kart.textContent).toContain('ORN-E-7 OP 20 sahada çalışıyor');
    expect(kart.textContent).toContain('CNC-002');
    expect(screen.queryByText(/Sıra denetimi alınamadı/)).toBeNull();
    expect(screen.getByText('Kilitli adım yerinde kalan işle üst üste; önce kilidi arkasına alın ya da kaldırın.')).toBeTruthy();
    expect((await sayfaDugmesi()).hasAttribute('disabled')).toBe(true);
    expect(post.mock.calls.filter((x) => x[0] === IS_TASI)).toHaveLength(0);
    fireEvent.click(within(kart).getByRole('button', { name: /^Arkasına al \(/ }));
    expect(post.mock.calls.filter((x) => x[0] === IS_TASI)).toHaveLength(0);
    const pencere = await screen.findByRole('dialog');
    expect(pencere.textContent).toContain('Geri al ile döner');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Taşı' }));
    await waitFor(() => expect(yenile).toHaveBeenCalled());
    const tasi = post.mock.calls.filter((x) => x[0] === IS_TASI);
    expect(tasi).toHaveLength(1);
    const c = guncelCalisma();
    expect(tasi[0]![1]).toMatchObject({ isId: K2, tezgah: tezgahi(), baslangic: saatOku(c.D, '2026-10-21 08:30')! + 0.25 });
    fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }));
    expect(geriAl).toHaveBeenCalledOnce();
  });

  it('"Kilidi kaldır" onaylanınca kilit çalışmadan kalkar; vazgeçilirse hiçbir şey yazılmaz', async () => {
    sunucu(cakisma());
    const degistir = vi.fn(() => true);
    sayfayiAc([], ['plan.kilitle'], true, { locks: kilit(), kayit: KAYIT, degistir });
    const kart = await screen.findByRole('group', { name: 'Kilit çakışması' }, { timeout: 5000 });
    fireEvent.click(within(kart).getByRole('button', { name: 'Kilidi kaldır' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Vazgeç' }));
    expect(degistir).not.toHaveBeenCalled();
    fireEvent.click(within(kart).getByRole('button', { name: 'Kilidi kaldır' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Kilidi kaldır' }));
    expect(degistir).toHaveBeenCalledOnce();
    expect((degistir.mock.calls[0] as unknown[])[0]).toBe('Kilit kaldırıldı');
    expect(await within(kart).findByText(/kilidi kaldırıldı/)).toBeTruthy();
  });

  it('kilitleme yetkisi yoksa düğmeler kapalıdır ve nedeni yazar; kilit çalışmada yoksa Kokpit\'te elle taşı der', async () => {
    sunucu(cakisma());
    sayfayiAc([], [], true, { locks: kilit(), kayit: KAYIT });
    const kart = await screen.findByRole('group', { name: 'Kilit çakışması' }, { timeout: 5000 });
    expect(within(kart).getByRole('button', { name: 'Kilidi kaldır' }).hasAttribute('disabled')).toBe(true);
    expect(kart.textContent).toContain('plan kilitleme yetkisi ister');
    cleanup();
    sunucu(cakisma());
    sayfayiAc([], ['plan.kilitle'], true, { locks: {}, kayit: KAYIT });
    const kart2 = await screen.findByRole('group', { name: 'Kilit çakışması' }, { timeout: 5000 });
    expect(within(kart2).getByRole('button', { name: 'Arkasına al' }).hasAttribute('disabled')).toBe(true);
    expect(kart2.textContent).toContain("Kokpit'te elle taşıyın");
  });
});
