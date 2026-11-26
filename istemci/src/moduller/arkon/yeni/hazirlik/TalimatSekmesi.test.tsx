import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { arkonAc, sunucuKur, YONETICI, type Deneme, type Istek } from '../test-ortak.tsx';
import type { Pkg } from './tipler.ts';

// 3614 ve 3688 d4: Hazırlık'ta Talimat ve adımlar tek sekme (Rota talimatı salt okunur, paket adımı yerinde düzenlenir) ve önizlemede gerçek talimat.
// Paket ve adımlar uydurmadır (ORN-).
afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.localStorage.clear(); window.sessionStorage.clear(); });

const paket = (id: string, op: string, opType: string, emirId: number) => ({
  id, no: 'ORN-EMIR-1', opType, st: {}, partNo: 'ORN-P1', part: 'ORN parça', rev: 'A', op, machine: 'IST-1', target: 10, cycle: 30, due: '', priority: 'normal',
  material: '', note: '', files: [], primary: null, plan: [], steps: [{ id: 's1', t: 'Yerel adım', d: '', r: 1 }], status: 'published', version: 1, dirty: false,
  createdAt: 1, updatedAt: 2, by: 'ORN', tmi: { emirId, isEmriId: emirId + 100, opNo: 10 },
});
const P1 = paket('tmi-ie-801', 'Op 10 · Torna', 'cnc', 801);
const P2 = paket('tmi-ie-802', 'Op 20 · GKK', 'kalite', 802);
const TESIS = { wcs: [{ id: 'TAL', name: 'ORN merkez' }], sts: [{ id: 'IST-1', name: 'ORN tezgah', wc: 'TAL', t: 'cnc' }], mcs: [] };
const adim = (id: number, ad: string, asama: string, zorunlu: boolean, kontrol: unknown = null) => ({
  id, sira: id, ad, aciklama: null, asama, zorunlu, kontrol, tamam: false, tamamlayan: null, tamamlanma: null, kanit: null, gecenNot: null, buNot: null, talimat: null,
});
const ADIMLAR = [
  adim(1, 'ORN tezgahı temizle', 'hazirlik', true),
  adim(2, 'ORN çap ölç', 'uretim', true, { tur: 'olcum', ad: 'Çap', alt: 9.9, ust: 10.1, birim: 'mm' }),
  adim(3, 'ORN sepete diz', 'bitis', false),
];
const belgeler = { pkgs: [P1, P2].map((p) => ({ kimlik: p.id, surum: 1, govde: p })), kv: [{ kimlik: 'plant', surum: 1, govde: { v: TESIS } }] };
const json = (d: number, g: unknown) => new Response(JSON.stringify(g), { status: d, headers: { 'content-type': 'application/json' } });
// Emir okuması: verilen cevapla; öteki uçlar sahte sunucudadır.
function emirKur(istekler: Istek[], cevap: () => Response) {
  const asil = globalThis.fetch;
  vi.stubGlobal('fetch', vi.fn(async (adres: string, ayar?: RequestInit) => {
    const yol = new URL(adres, 'http://ornek.invalid').pathname.replace(/^\/api/, '');
    if ((ayar?.method ?? 'GET') === 'GET' && /^\/uretim-emirleri\/\d+$/.test(yol)) { istekler.push({ yontem: 'GET', yol, govde: null }); return cevap(); }
    return asil(adres, ayar);
  }));
}
const yazmalar = (l: Istek[]) => l.filter((i) => i.yontem !== 'GET' && i.yol !== '/arkon/iletiler');
const ac = async () => {
  const d = await screen.findByRole('region', { name: 'İş paketi' }, { timeout: 10000 });
  return d;
};

describe('3614 ve 3688 d4 Talimat ve adımlar sekmesi', () => {
  it('terminaldeki üç grupla ve sayıyla görünür, işaretleme yok, yazma yok', async () => {
    const istekler = sunucuKur(YONETICI, { belgeler });
    emirKur(istekler, () => json(200, { emir: {}, adimlar: ADIMLAR }));
    arkonAc('/arkon/hazirlik');
    const d = await ac();
    fireEvent.click(await within(d).findByRole('button', { name: /Talimat ve adımlar/ }, { timeout: 10000 }));
    const sekme = await within(d).findByRole('region', { name: 'Talimat ve adımlar' }, { timeout: 10000 });
    await within(sekme).findByText('Başlamadan önce', {}, { timeout: 10000 });
    expect(within(sekme).getByText('Başlamadan önce')).toBeTruthy();
    expect(within(sekme).getByText('Üretim sırasında')).toBeTruthy();
    expect(within(sekme).getByText('Bitince')).toBeTruthy();
    expect(within(sekme).getByText('3 talimat · 1 paket adımı')).toBeTruthy();
    // Her satır kaynağını söyler: üç Rota satırı ve bir Paket satırı; adım şeridindeki rozet iki sayıyı taşır.
    expect(within(sekme).getAllByText('Rota', { selector: 'li em' })).toHaveLength(3);
    expect(within(sekme).getAllByText('Paket', { selector: 'li em' })).toHaveLength(1);
    expect(within(sekme).getByText('Pakete özel adımlar')).toBeTruthy();
    expect(within(d).getByRole('button', { name: /Talimat ve adımlar/ }).textContent).toContain('3 talimat · 1 adım');
    expect(sekme.textContent).toContain('Ölçüm · Çap · 9,9–10,1 mm');
    expect(within(sekme).queryAllByRole('checkbox')).toHaveLength(0);
    expect(yazmalar(istekler)).toEqual([]);
  }, 40000);

  it('okuma yetkisi olmayan rolde "Talimatı görme yetkin yok" der, yetki istemez', async () => {
    const istekler = sunucuKur(YONETICI, { belgeler });
    emirKur(istekler, () => json(403, { error: 'Yetkiniz yok.' }));
    arkonAc('/arkon/hazirlik');
    const d = await ac();
    fireEvent.click(await within(d).findByRole('button', { name: /Talimat ve adımlar/ }, { timeout: 10000 }));
    expect(await within(d).findByText(/Talimatı görme yetkin yok/, {}, { timeout: 10000 })).toBeTruthy();
  }, 40000);

  it('talimatı olmayan işte bunu söyler ve pakettaki yerel adımı kendi başlığında gösterir', async () => {
    const istekler = sunucuKur(YONETICI, { belgeler });
    emirKur(istekler, () => json(200, { emir: {}, adimlar: [] }));
    arkonAc('/arkon/hazirlik');
    const d = await ac();
    fireEvent.click(await within(d).findByRole('button', { name: /Talimat ve adımlar/ }, { timeout: 10000 }));
    expect(await within(d).findByText(/Bu işin talimatı yok/, {}, { timeout: 10000 })).toBeTruthy();
    expect(within(d).getByText('Pakete özel adımlar')).toBeTruthy();
    expect(within(d).getByText('Yerel adım')).toBeTruthy();
  }, 40000);

  it('CORE emrine bağlı olmayan pakette "yok" değil "bilinmiyor" der', async () => {
    const bagsiz = { ...P1, id: 'ORN-bagsiz', tmi: undefined };
    const istekler = sunucuKur(YONETICI, { belgeler: { ...belgeler, pkgs: [{ kimlik: bagsiz.id, surum: 1, govde: bagsiz }] } });
    arkonAc('/arkon/hazirlik');
    const d = await ac();
    fireEvent.click(await within(d).findByRole('button', { name: /Talimat ve adımlar/ }, { timeout: 10000 }));
    expect(await within(d).findByText(/talimat bilinmiyor/, {}, { timeout: 10000 })).toBeTruthy();
    expect(istekler.some((i) => /^\/uretim-emirleri\/\d+$/.test(i.yol))).toBe(false);
  }, 40000);

  it('paket adımı Düzenle ile yerinde açılır; değişiklik pakete yazılır; Rota satırında düzenleme yok', async () => {
    // Kopya verilir: paket nesnesi öteki denemelerle paylaşılmasın.
    const istekler = sunucuKur(YONETICI, { belgeler: structuredClone(belgeler) });
    emirKur(istekler, () => json(200, { emir: {}, adimlar: ADIMLAR }));
    arkonAc('/arkon/hazirlik');
    const d = await ac();
    fireEvent.click(await within(d).findByRole('button', { name: /Talimat ve adımlar/ }, { timeout: 10000 }));
    const sekme = await within(d).findByRole('region', { name: 'Talimat ve adımlar' }, { timeout: 10000 });
    await within(sekme).findByText('ORN tezgahı temizle', {}, { timeout: 10000 });
    expect(within(sekme).getAllByRole('button', { name: /düzenle$/ })).toHaveLength(1);
    fireEvent.click(within(sekme).getByRole('button', { name: 'Yerel adım düzenle' }));
    fireEvent.change(within(sekme).getByRole('textbox', { name: 'Adım başlığı' }), { target: { value: 'ORN pensi değiştir' } });
    fireEvent.click(within(sekme).getByRole('button', { name: 'Bitti' }));
    expect(within(sekme).queryByRole('textbox', { name: 'Adım başlığı' })).toBeNull();
    await waitFor(() => {
      const yazim = istekler.filter((i) => i.yol === `/arkon/belgeler/pkgs/${P1.id}/yaz`).map((i) => (i.govde as { govde: Pkg }).govde);
      expect(yazim.some((p) => p.steps[0]?.t === 'ORN pensi değiştir')).toBe(true);
    }, { timeout: 10000 });
  }, 40000);

  it('paketi düzenleme yetkisi olmayan talimatı da paket adımını da görür; düzenleme ve ekleme düğmesi yok, yazma gitmez', async () => {
    const HAZIRLIKCI: Deneme = { rol: 'prep', kullanici: { ...YONETICI.kullanici, id: 4, ad: 'ORN Hazirlikci' } };
    // Paket ayrı kimlikle gelir: istemcinin paket önbelleği önceki denemenin yazdığı adımı tutabilir.
    const yalniz = { ...P1, id: 'tmi-ie-811', steps: [{ id: 's9', t: 'ORN salt okunur adım', d: '', r: 1 }] };
    const istekler = sunucuKur(HAZIRLIKCI, { belgeler: { pkgs: [{ kimlik: yalniz.id, surum: 1, govde: yalniz }], kv: [...belgeler.kv, { kimlik: 'perms', surum: 1, govde: { v: { prep: ['page.op', 'page.prep'] } } }] } });
    emirKur(istekler, () => json(200, { emir: {}, adimlar: ADIMLAR }));
    arkonAc('/arkon/hazirlik');
    const d = await ac();
    fireEvent.click(await within(d).findByRole('button', { name: /Talimat ve adımlar/ }, { timeout: 10000 }));
    const sekme = await within(d).findByRole('region', { name: 'Talimat ve adımlar' }, { timeout: 10000 });
    expect(await within(sekme).findByText('ORN tezgahı temizle', {}, { timeout: 10000 })).toBeTruthy();
    expect(within(sekme).getByText('ORN salt okunur adım')).toBeTruthy();
    expect(within(sekme).getByText(/paket satırları da yalnız görüntülenir/)).toBeTruthy();
    expect(within(sekme).queryByRole('button', { name: /düzenle$/ })).toBeNull();
    expect(within(sekme).queryByRole('button', { name: /Paket adımı ekle/ })).toBeNull();
    await new Promise((r) => { setTimeout(r, 700); });
    expect(yazmalar(istekler)).toEqual([]);
  }, 40000);

  it('önizlemede aynı emrin öteki operasyonu şeritten seçilir; önizleme açıkken CORE\'a yazma gitmez', async () => {
    const istekler = sunucuKur(YONETICI, { belgeler });
    emirKur(istekler, () => json(200, { emir: {}, adimlar: ADIMLAR }));
    arkonAc('/arkon/hazirlik');
    const d = await ac();
    fireEvent.click(within(d).getByRole('button', { name: /Operatör gözüyle/ }));
    const pencere = await screen.findByRole('dialog', { name: 'Operatör gözüyle önizleme' }, { timeout: 10000 });
    const serit = await within(pencere).findByRole('group', { name: 'Operasyonlar' }, { timeout: 10000 });
    expect(within(serit).getByRole('button', { name: /Op 10/ })).toBeTruthy();
    const once = yazmalar(istekler).length;
    fireEvent.click(within(serit).getByRole('button', { name: /Op 20/ }));
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/uretim-emirleri/802')).toBe(true); }, { timeout: 10000 });
    await new Promise((r) => { setTimeout(r, 300); });
    expect(yazmalar(istekler).length).toBe(once);
  }, 40000);
});
