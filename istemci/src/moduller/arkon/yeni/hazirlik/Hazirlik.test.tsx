import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { arkonAc, sunucuKur, YONETICI, type Deneme, type Istek } from '../test-ortak.tsx';
import { DepoPaneli, KalitePaneli, type PanelArayuzu } from './IstasyonPanelleri.tsx';
import { istasyonAyari } from './kurallar.ts';
import type { Order, Pkg } from './tipler.ts';

// Hazırlık ekranı: açılışta yazma yok; izinli kişi düzenler ve yayınlar; yetkisi olmayan yalnız görür (düğmeler yok, alanlar kilitli).
// Paket ve kişi adları uydurmadır.

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear(); });

const HAZIRLIKCI: Deneme = { rol: 'prep', kullanici: { ...YONETICI.kullanici, id: 4, ad: 'Deneme Hazirlikci' } };
const PAKET = {
  id: 'tmi-ue-7', no: 'IE-DENEME-1', opType: 'cnc', st: {}, partNo: 'DN-1', part: 'Deneme parça', rev: 'A', op: 'Op 10 · Torna', machine: 'IST-1',
  target: 20, cycle: 30, due: '', priority: 'normal', material: '', note: '', files: [{ kind: 'pdf', name: 'deneme.pdf', size: 2048 }], primary: 'deneme.pdf',
  plan: [{ id: 1, nom: 'Ø20', tol: '±0.1', min: 19.9, max: 20.1, tool: 'Kumpas', freq: 'İlk parça' }], steps: [{ id: 's1', t: 'Bağla', d: '', r: true }],
  status: 'draft', version: 0, dirty: true, createdAt: 1, updatedAt: 2, by: 'Deneme',
};
const TESIS = { wcs: [{ id: 'TAL', name: 'Deneme merkez' }], sts: [{ id: 'IST-1', name: 'Deneme tezgah', wc: 'TAL', t: 'cnc' }], mcs: [] };
const sunucu = (ek: { kimlik: string; surum: number; govde: unknown }[] = []) => ({
  belgeler: { pkgs: [{ kimlik: PAKET.id, surum: 1, govde: PAKET }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }, ...ek] },
});
const yazmalar = (l: Istek[]) => l.filter((i) => i.yontem !== 'GET' && i.yol !== '/arkon/iletiler');
const paketYazimi = (l: Istek[]) => l.filter((i) => i.yol === `/arkon/belgeler/pkgs/${PAKET.id}/yaz`).map((i) => (i.govde as { govde: Pkg }).govde);
const ileti = (l: Istek[], tur: string) => l.some((i) => i.yol === '/arkon/iletiler' && (i.govde as { ileti?: { type?: string } } | null)?.ileti?.type === tur);
const ekran = async () => screen.findByRole('region', { name: 'İş paketi' }, { timeout: 10000 });

// Çizim Merkezi uçları (köprü cevirisi: arkon/cizim-merkezi.test.ts); belge ve dosya uydurmadır, bayt sentetiktir.
const MERKEZ_BELGESI = { id: 3, ad: 'Deneme flans', tur: 'teknik-resim', harf: 'B', tip: 'pdf', dosyaAdi: 'deneme-b.pdf', ozet: 'a'.repeat(64) };
const MERKEZ_EKLE = '/arkon/cizim-merkezi/belgeler/3/ekle';
const jsonCevap = (v: unknown) => new Response(JSON.stringify(v), { status: 200, headers: { 'content-type': 'application/json' } });
function merkezKur(istekler: Istek[]) {
  const asil = globalThis.fetch;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = new URL(adres, 'http://tmi.yerel').pathname.replace(/^\/api/, '');
    if (yol === '/arkon/cizim-merkezi/belgeler') return jsonCevap({ belgeler: [MERKEZ_BELGESI] });
    if (yol === '/arkon/cizim-merkezi/kontrol') return jsonCevap({ durumlar: [{ belgeId: 3, durum: 'yeni-revizyon', ozet: 'b'.repeat(64) }] });
    if (yol === MERKEZ_EKLE) {
      istekler.push({ yontem: 'POST', yol, govde: null });
      return jsonCevap({ ozet: MERKEZ_BELGESI.ozet, boyut: 3, kayit: { kind: 'pdf', name: 'deneme-b.pdf', merkez: 3, merkezOzet: MERKEZ_BELGESI.ozet } });
    }
    if (yol === `/arkon/dosyalar/${MERKEZ_BELGESI.ozet}`) return new Response(new Uint8Array([1, 2, 3]), { status: 200 });
    return asil(adres, ayar);
  }));
}
const merkezAc = async (d: HTMLElement) => {
  fireEvent.click(within(d).getByRole('button', { name: /Dokümanlar/ }));
  fireEvent.click(await within(d).findByRole('button', { name: /Çizim Merkezi’nden ekle/ }, { timeout: 10000 }));
  return screen.findByRole('dialog', { name: "Çizim Merkezi'nden ekle" }, { timeout: 10000 });
};

describe('A2 Hazırlık ekranı', () => {
  it('açılışta yazmaz; paket listede ve düzenleyicide görünür; yayın operatöre gönderir', async () => {
    const istekler = sunucuKur(YONETICI, sunucu());
    arkonAc('/arkon/hazirlik');
    const d = await ekran();
    expect(within(d).getByRole('heading', { name: /IE-DENEME-1/ })).toBeTruthy();
    expect(within(screen.getByRole('complementary', { name: 'İş paketleri' })).getByRole('button', { name: /IE-DENEME-1/, pressed: true })).toBeTruthy();
    expect(yazmalar(istekler)).toEqual([]);
    fireEvent.click(within(d).getByRole('button', { name: /Yayınla/ }));
    const gonder = await within(d).findByRole('button', { name: /Operatöre gönder/ });
    expect(gonder.hasAttribute('disabled')).toBe(false);
    fireEvent.click(gonder);
    await waitFor(() => { expect(paketYazimi(istekler).some((p) => p.status === 'published' && p.version === 1 && !p.dirty)).toBe(true); }, { timeout: 10000 });
    await waitFor(() => { expect(ileti(istekler, 'pkg')).toBe(true); }, { timeout: 10000 });
    const yayin = paketYazimi(istekler).find((p) => p.status === 'published');
    expect(yayin?.history?.length).toBe(1);
    expect(yayin?.yayinImza).toBeTruthy();
    // Okuma ayarı pakete sabitlenir (kart #731): terminal hazır veriyi aynı anahtarla bulur.
    expect(yayin?.readCfg).toMatchObject({ mesh: expect.any(String), ex: expect.any(Object) });
  }, 40000);

  it('"Operatör gözüyle" sayfanın üstünde pencerede açılır, adres değişmez; pencere açıkken yazma TMI\'ye gitmez', async () => {
    const istekler = sunucuKur(YONETICI, sunucu());
    arkonAc('/arkon/hazirlik');
    const d = await ekran();
    fireEvent.click(within(d).getByRole('button', { name: /Operatör gözüyle/ }));
    const pencere = await screen.findByRole('dialog', { name: 'Operatör gözüyle önizleme' }, { timeout: 10000 });
    expect(within(pencere).getByText(/IST-1 ekranı · kayıt yapılmaz/)).toBeTruthy();
    expect(screen.getByTestId('adres').textContent).toBe('/arkon/hazirlik');
    const once = yazmalar(istekler).length;
    await new Promise((r) => { setTimeout(r, 300); });
    expect(yazmalar(istekler).length).toBe(once);
    fireEvent.click(within(pencere).getByRole('button', { name: /Kapat/ }));
    await waitFor(() => { expect(screen.queryByRole('dialog', { name: 'Operatör gözüyle önizleme' })).toBeNull(); });
  }, 40000);

  it('sayfa başlığında kısayollar ve saat eski yerinde (Çizim, Operatör ekranı)', async () => {
    sunucuKur(YONETICI, sunucu());
    arkonAc('/arkon/hazirlik');
    await ekran();
    expect(screen.getByRole('button', { name: /Çizim stüdyosu/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Operatör ekranı' }));
    await waitFor(() => { expect(screen.getByTestId('adres').textContent).toBe('/uretim-terminali'); });
  }, 40000);

  it('alan değişikliği yarım saniye sonra pakete yazılır; hazır uyarı kural olarak eklenir', async () => {
    const istekler = sunucuKur(YONETICI, sunucu());
    arkonAc('/arkon/hazirlik');
    const d = await ekran();
    fireEvent.change(within(d).getByPlaceholderText('S355J2'), { target: { value: 'Deneme çelik' } });
    await waitFor(() => { expect(paketYazimi(istekler).some((p) => p.material === 'Deneme çelik' && p.dirty)).toBe(true); }, { timeout: 10000 });
    fireEvent.click(within(d).getByRole('button', { name: /Kurallar/ }));
    fireEvent.click(await within(d).findByRole('button', { name: /Koruyucu gözlük/ }));
    await waitFor(() => {
      expect(paketYazimi(istekler).some((p) => (p.rules as { warns?: { t: string }[] } | undefined)?.warns?.some((w) => w.t.startsWith('Koruyucu gözlük')))).toBe(true);
    }, { timeout: 10000 });
  }, 40000);

  it('düzenleme ve yayın yetkisi olmayan kişi yalnız görür: yazma düğmeleri yok, alanlar kilitli, yazma gitmez (reddedilen)', async () => {
    const istekler = sunucuKur(HAZIRLIKCI, sunucu([{ kimlik: 'perms', surum: 1, govde: { v: { prep: ['page.op', 'page.prep'] } } }]));
    arkonAc('/arkon/hazirlik');
    const d = await ekran();
    expect(await within(d).findByText(/düzenleme yetkin yok/)).toBeTruthy();
    expect(within(d).getByPlaceholderText('S355J2').matches(':disabled')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Yeni paket' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Paket dosyası uygula' })).toBeNull();
    fireEvent.click(within(d).getByRole('button', { name: /Yayınla/ }));
    await within(d).findByText('Yayın öncesi kontrol');
    expect(within(d).queryByRole('button', { name: /Operatöre gönder/ })).toBeNull();
    expect(within(d).queryByRole('button', { name: /Paketi sil/ })).toBeNull();
    expect(within(d).queryByRole('button', { name: /geri çek/ })).toBeNull();
    expect(within(d).getByRole('button', { name: /Önizle/ })).toBeTruthy();
    await new Promise((r) => setTimeout(r, 700));
    expect(yazmalar(istekler)).toEqual([]);
  }, 40000);

  it('Kontrol planı sekmesinde teknik resim açılır (yer tutucu yok)', async () => {
    sunucuKur(YONETICI, sunucu());
    arkonAc('/arkon/hazirlik');
    const d = await ekran();
    fireEvent.click(within(d).getByRole('button', { name: /Kontrol planı/ }));
    expect(await within(d).findByRole('toolbar', { name: 'Teknik resim araçları' }, { timeout: 10000 })).toBeTruthy();
    expect(within(d).queryByText('Bu bölüm hazırlanıyor')).toBeNull();
  }, 40000);

  it('Çizim Merkezi seçicisi yayındaki belgeyi listeler; seçilen dosya pakete eklenir', async () => {
    const istekler = sunucuKur(YONETICI, sunucu());
    merkezKur(istekler);
    arkonAc('/arkon/hazirlik');
    const pencere = await merkezAc(await ekran());
    fireEvent.click(await within(pencere).findByRole('button', { name: /Deneme flans/ }, { timeout: 10000 }));
    await waitFor(() => { expect(istekler.some((i) => i.yol === MERKEZ_EKLE)).toBe(true); }, { timeout: 10000 });
    await waitFor(() => {
      expect(paketYazimi(istekler).some((p) => p.primary === 'deneme-b.pdf' && p.files.some((x) => x.merkez === 3) && p.plan.length === 0)).toBe(true);
    }, { timeout: 10000 });
    await waitFor(() => { expect(screen.queryByRole('dialog', { name: "Çizim Merkezi'nden ekle" })).toBeNull(); });
  }, 40000);

  it('merkezden gelen dosyada yeni revizyon rozeti çıkar; Güncelle dosyayı yeniden alır', async () => {
    const MERKEZLI = { ...PAKET, files: [{ kind: 'pdf', name: 'deneme-a.pdf', size: 3, merkez: 3, merkezOzet: 'c'.repeat(64) }], primary: 'deneme-a.pdf' };
    const istekler = sunucuKur(YONETICI, { belgeler: { pkgs: [{ kimlik: PAKET.id, surum: 1, govde: MERKEZLI }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }] } });
    merkezKur(istekler);
    arkonAc('/arkon/hazirlik');
    const d = await ekran();
    fireEvent.click(within(d).getByRole('button', { name: /Dokümanlar/ }));
    expect(await within(d).findByText('Yeni revizyon var', undefined, { timeout: 10000 })).toBeTruthy();
    fireEvent.click(within(d).getByRole('button', { name: /Güncelle/ }));
    await waitFor(() => { expect(istekler.some((i) => i.yol === MERKEZ_EKLE)).toBe(true); }, { timeout: 10000 });
    await waitFor(() => { expect(paketYazimi(istekler).some((p) => p.primary === 'deneme-b.pdf' && p.files.length === 1)).toBe(true); }, { timeout: 10000 });
  }, 40000);

  it('düzenleme yetkisi olmayan kişi Çizim Merkezi\'nden dosya alamaz: kopyalama ve paket yazımı gitmez (reddedilen)', async () => {
    const istekler = sunucuKur(HAZIRLIKCI, sunucu([{ kimlik: 'perms', surum: 1, govde: { v: { prep: ['page.op', 'page.prep'] } } }]));
    merkezKur(istekler);
    arkonAc('/arkon/hazirlik');
    const pencere = await merkezAc(await ekran());
    fireEvent.click(await within(pencere).findByRole('button', { name: /Deneme flans/ }, { timeout: 10000 }));
    await new Promise((r) => setTimeout(r, 700));
    expect(istekler.some((i) => i.yol === MERKEZ_EKLE)).toBe(false);
    expect(yazmalar(istekler)).toEqual([]);
  }, 40000);

  // Karar 732 a: dosyasız TMI taslağı açılınca malzemenin yayındaki çizimi kendiliğinden gelir; yetkisi olmayan için gitmez.
  const TMI_TASLAGI = { ...PAKET, id: 'tmi-ue-8', no: 'IE-DENEME-2', from: 'tmi', files: [], primary: null, plan: [], malzemeCizimleri: [{ belgeId: 3, ad: 'Deneme flans', tip: 'pdf' }] };
  const tmiSunucusu = (ek: { kimlik: string; surum: number; govde: unknown }[] = []) => ({
    belgeler: { pkgs: [{ kimlik: TMI_TASLAGI.id, surum: 1, govde: TMI_TASLAGI }], kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }, ...ek] },
  });
  it('dosyasız TMI taslağı açılınca malzemenin Çizim Merkezi belgesi bir kez pakete gelir; öneri pakete yazılmaz', async () => {
    const istekler = sunucuKur(YONETICI, tmiSunucusu());
    merkezKur(istekler);
    arkonAc('/arkon/hazirlik');
    await ekran();
    await waitFor(() => {
      const yazilan = istekler.filter((i) => i.yol === `/arkon/belgeler/pkgs/${TMI_TASLAGI.id}/yaz`).map((i) => (i.govde as { govde: Pkg }).govde);
      expect(yazilan.some((p) => p.primary === 'deneme-b.pdf' && p.files.some((x) => x.merkez === 3) && p.malzemeCizimleri === undefined)).toBe(true);
    }, { timeout: 10000 });
    expect(istekler.filter((i) => i.yol === MERKEZ_EKLE).length).toBe(1);
  }, 40000);

  it('düzenleme yetkisi olmayan kişide malzeme çizimi kendiliğinden alınmaz (reddedilen)', async () => {
    const istekler = sunucuKur(HAZIRLIKCI, tmiSunucusu([{ kimlik: 'perms', surum: 1, govde: { v: { prep: ['page.op', 'page.prep'] } } }]));
    merkezKur(istekler);
    arkonAc('/arkon/hazirlik');
    await ekran();
    await new Promise((r) => setTimeout(r, 700));
    expect(istekler.some((i) => i.yol === MERKEZ_EKLE)).toBe(false);
    expect(yazmalar(istekler)).toEqual([]);
  }, 40000);

  it('silme iki basış ister; silinen paket duyurulur', async () => {
    const istekler = sunucuKur(YONETICI, sunucu());
    arkonAc('/arkon/hazirlik');
    const d = await ekran();
    fireEvent.click(within(d).getByRole('button', { name: /Yayınla/ }));
    fireEvent.click(await within(d).findByRole('button', { name: 'Paketi sil' }));
    expect(istekler.some((i) => i.yontem === 'POST' && i.yol.includes('/sil'))).toBe(false);
    fireEvent.click(within(d).getByRole('button', { name: /Emin misin/ }));
    await waitFor(() => { expect(ileti(istekler, 'pkg-removed')).toBe(true); }, { timeout: 10000 });
  }, 40000);
});

const sahteApi = (paket: Partial<Pkg>, is: Partial<Order> = {}) => {
  const yapilan: { etiket: string; sonuc: Partial<Order> }[] = [];
  const o = { no: 'IE', part: '', op: '', due: '', state: 'running', target: 10, good: 0, scrap: 0, cycle: 0, sr: {}, ...is } as Order;
  const api: PanelArayuzu = {
    is: o, paket: paket as Pkg, ayar: istasyonAyari(paket as Pkg), kayit: (o.sr || {}) as PanelArayuzu['kayit'],
    yap: (etiket, _s, _t, f) => { yapilan.push({ etiket, sonuc: f(o) }); }, sessiz: (f) => { yapilan.push({ etiket: '', sonuc: f(o) }); },
    soyle: (m) => { yapilan.push({ etiket: m, sonuc: {} }); }, okut: () => {},
  };
  return { api, yapilan };
};

describe('A2 istasyon panelleri', () => {
  it('depo: okutulan kod bir artırır, listede olmayan kod uyarır', () => {
    const { api, yapilan } = sahteApi({ opType: 'depo', st: { mode: 'pick', items: [{ id: 'a', code: 'KOD-1', name: 'Bir', qty: 2, unit: 'adet', loc: 'A-1' }] } });
    render(<BildirimSaglayici><DepoPaneli api={api} /></BildirimSaglayici>);
    const kod = screen.getByRole('textbox', { name: 'Kod' });
    fireEvent.change(kod, { target: { value: 'kod-1' } });
    fireEvent.submit(kod.closest('form')!);
    expect(yapilan[0]?.etiket).toBe('KOD-1 · 1/2 adet');
    expect(yapilan[0]?.sonuc).toEqual({ sr: { picked: { a: 1 } }, good: 0 });
    fireEvent.change(kod, { target: { value: 'YOK-9' } });
    fireEvent.submit(kod.closest('form')!);
    expect(yapilan[1]?.etiket).toBe('Listede yok: YOK-9');
  });

  it('kalite: bütün ölçüler uygunsa parça kabul olarak kaydedilir ve iyi sayısı artar', () => {
    const plan = [{ id: 1, nom: 'Ø20', tol: '±0.1', min: 19.9, max: 20.1, tool: 'Kumpas' }];
    const { api, yapilan } = sahteApi({ opType: 'kalite', st: { lot: 50, n: 2, ac: 0 }, plan }, { sr: { cur: { vals: { 1: 20 } } }, good: 3 });
    render(<BildirimSaglayici><KalitePaneli api={api} /></BildirimSaglayici>);
    fireEvent.click(screen.getByRole('button', { name: /Parça kabul · kaydet/ }));
    expect(yapilan[0]?.etiket).toBe('Parça 1 · KABUL');
    expect(yapilan[0]?.sonuc.good).toBe(4);
  });
});
