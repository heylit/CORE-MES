import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { BildirimSaglayici } from '../../../../ortak/arayuz/index.ts';
import { cihazYazicisiKaydet } from '../../../etiket-merkezi/disari.ts';
import { depoDugmeleri, sabitDepoDugmeleri, sayimEklenir } from './DepoTerminali.tsx';
import { MalKabulTerminali, adetKalani } from './MalKabulTerminali.tsx';

// 3388 a: mal kabul üretim terminalinin düzeninde; Kabul +1 en çok firmada kalan kadar, Bitir'de tek kayıt. Değerler uydurmadır.
beforeEach(() => { localStorage.clear(); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const json = (g: unknown, durum = 200) => new Response(JSON.stringify(g), { status: durum });
const satir = (id: number, kalemAdi: string, malzemeTur: string, ek: Record<string, unknown> = {}) => ({
  id, siparisNo: `ORN-S-${String(id)}`, talepNo: '', tedarikciAdi: 'ORN Fason', malzemeId: id, malzemeTur, kalemAdi, miktar: '3.000', kalanMiktar: '3.000', birim: 'adet', beklenenTeslim: null, ...ek,
});
const IS = { isEmriId: 77, emirNo: 'ORN-UE-1', opNo: 20, adim: 'Isıl işlem', gonderilen: 5, donen: 1, hurda: 1, donenKart: { malzemeId: 960, kod: 'ORN-FL-K', ad: 'Flanş ısıl', birim: 'adet' }, statulu: false };
const BELGE = { id: 12, no: 'MK-000012', tur: 'satin_alma', irsaliyeNo: null, zaman: '2026-11-03T10:00:00+03:00', kisiAd: 'D', satirSayisi: 1, farkSayisi: 0, duzeltilenId: null, duzeltenId: null };

type Isleyici = (yol: string, govde: unknown) => Response | null;
function ac(dar = false, islemler: string[] = ['stok.giris'], ek: Isleyici = () => null) {
  const istekler: { yol: string; yontem: string; govde: unknown }[] = [];
  vi.stubGlobal('fetch', vi.fn(async (adres: string, s?: RequestInit) => {
    const yol = String(adres).replace(/^.*\/api/, '');
    const govde = s?.body ? JSON.parse(String(s.body)) : null;
    istekler.push({ yol, yontem: s?.method ?? 'GET', govde });
    const o = ek(yol, govde);
    if (o) return o;
    if (yol.endsWith('/oturum')) return json({ kullanici: { id: 3, ad: 'ORN Depocu', islemler } });
    if (yol.startsWith('/stok/acik-siparis-satirlari')) return json({ satirlar: [satir(41, 'ORN Flanş', 'hizmet', { isEmriId: 77, emirNo: 'ORN-UE-1' }), satir(31, 'ORN Çubuk', 'hammadde')] });
    if (yol.startsWith('/stok/konumlar')) return json({ satirlar: [{ id: 5, kod: 'FSN-1', tur: 'fason', ad: null }], toplam: 1 });
    if (yol.startsWith('/stok/fason-isleri')) return json({ isler: [IS] });
    if (yol === '/stok/mal-kabul') return json({ belge: BELGE, hareketIdler: [1] });
    return json({}, 404);
  }));
  render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <BildirimSaglayici><MemoryRouter><div className="tc-ay1">{<MalKabulTerminali dar={dar} />}</div></MemoryRouter></BildirimSaglayici>
  </QueryClientProvider>);
  return istekler;
}
const durum = () => screen.getByRole('group', { name: 'İş durumu' });
// 3583: iskelet yüklenirken de çizilir; şerit dolana dek beklenir.
const seritHazir = async (ad: string) => {
  const r = await screen.findByRole('region', { name: ad });
  await waitFor(() => { expect(within(r).getAllByRole('listitem').length).toBeGreaterThan(0); });
  return r;
};
const tus = (ad: string) => screen.getByRole('button', { name: ad }) as HTMLButtonElement;

describe('mal kabul terminali (3388 a)', () => {
  it('satın almada kadran hedefi yalnız adet birimli tam sayı kalandır; başka birimde "—"', () => {
    expect(adetKalani('5.000', 'adet')).toBe(5);
    expect(adetKalani('5', 'Adet')).toBe(5);
    expect(adetKalani('2.500', 'kg')).toBeNull();
    expect(adetKalani('2.500', 'adet')).toBeNull();
  });

  it('kurallar: düğmeler üretimdeki sırada, sayım hedefi aşmaz', () => {
    expect(depoDugmeleri('queued', 'Kabulü başlat').map((d) => d.etiket)).toEqual(['Kabulü başlat']);
    expect(depoDugmeleri('running', 'x').map((d) => d.etiket)).toEqual(['Durdur', 'Duraklat', 'Bitir']);
    expect(depoDugmeleri('paused', 'x').map((d) => d.etiket)).toEqual(['Durdur', 'Devam Et', 'Bitir']);
    expect(sayimEklenir(2, 3)).toBe(true);
    expect(sayimEklenir(3, 3)).toBe(false);
    expect(sayimEklenir(500, null)).toBe(true);
  });

  it('bekleyen kabuller şeritte; Başlat ile Kabulde, Kabul +1 firmada kalanda durur, ret tuşu yok (ret GKK işidir); Bitir tek kayıt yazar', async () => {
    const istekler = ac();
    const serit = await seritHazir('Bekleyen kabuller');
    expect(within(serit).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'ORN-UE-1' })).toBeTruthy();
    expect(tus('Kabul +1').disabled).toBe(true);
    fireEvent.click(within(durum()).getByRole('button', { name: /Kabulü başlat/ }));
    expect(screen.getByRole('status', { name: /Kabulde/ })).toBeTruthy();
    for (let i = 0; i < 4; i += 1) fireEvent.click(tus('Kabul +1'));
    // Firmada 5 - 1 - 1 = 3 adet: dördüncü dokunuş sayılmaz.
    expect(screen.getByRole('status', { name: /3 \/ 3/ })).toBeTruthy();
    expect(tus('Kabul +1').disabled).toBe(true);
    expect(screen.queryByRole('button', { name: /Ret/ })).toBeNull();
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    const bitir = within(durum()).getByRole('button', { name: /Bitir/ });
    fireEvent.click(bitir);
    fireEvent.click(bitir);
    const p = await screen.findByRole('dialog', { name: 'Fason dönüşünü bitir' });
    const yaz = within(p).getByRole('button', { name: /Kabulü yaz/ });
    fireEvent.click(yaz);
    fireEvent.click(yaz);
    await waitFor(() => expect(istekler.filter((i) => i.yontem === 'POST')).toHaveLength(1));
    expect(istekler.find((i) => i.yontem === 'POST')!.govde).toEqual({ tur: 'satin_alma', satirlar: [{ malzemeId: 960, miktar: '3', parti: null, siparisSatirId: 41, fasonIsi: { isEmriId: 77 }, ambalaj: null }] });
    expect(await screen.findByText(/3 adet karantinaya girdi/)).toBeTruthy();
  });

  it('sayım cihazda saklanır: ekran yeniden açılınca iş Kabulde ve sayısıyla gelir', async () => {
    ac();
    await seritHazir('Bekleyen kabuller');
    fireEvent.click(within(durum()).getByRole('button', { name: /Kabulü başlat/ }));
    fireEvent.click(tus('Kabul +1'));
    cleanup();
    ac();
    expect(await screen.findByRole('status', { name: /Kabulde.*1 \/ 3/ })).toBeTruthy();
  });

  it('satın alma satırında sayım tuşu kapalı; "Kabul et" Stok\'un kabulünü açar, okutma isteğe bağlı', async () => {
    ac();
    const serit = await seritHazir('Bekleyen kabuller');
    fireEvent.click(within(serit).getByRole('button', { name: /ORN-S-31/ }));
    fireEvent.click(within(durum()).getByRole('button', { name: /Kabulü başlat/ }));
    expect(tus('Kabul +1').disabled).toBe(true);
    expect(document.querySelector('.tc-ay1-depo-ileti')?.textContent).toContain('okutma isteğe bağlı');
    // Satın almada kadranın hedefi siparişin kalanıdır (Beklenen ile aynı sayı).
    expect(document.querySelector('.tc-ay1-kadran-hedef')?.textContent).toBe('/ 3 adet');
    fireEvent.click(screen.getByRole('button', { name: 'Kabul et' }));
    const p = await screen.findByRole('dialog', { name: 'Mal kabul' });
    expect(within(p).getAllByLabelText(/^Kod/).length).toBeGreaterThan(0);
  });

  it('telefonda Kabul +1 alttaki eylem çubuğunda, ret yok; görünümler Kabul, Adımlar, Bilgi', async () => {
    ac(true);
    await seritHazir('Bekleyen kabuller');
    const cubuk = await screen.findByRole('group', { name: 'İş eylemleri' });
    expect(within(cubuk).getByRole('button', { name: /Kabulü başlat/ })).toBeTruthy();
    expect(within(cubuk).getByRole('button', { name: 'Kabul +1' })).toBeTruthy();
    expect(within(cubuk).queryByRole('button', { name: /Ret/ })).toBeNull();
    const nav = screen.getByRole('navigation', { name: 'Terminal görünümleri' });
    expect(within(nav).getAllByRole('button').map((b) => b.textContent)).toEqual(['Kabul', 'Adımlar', 'Bilgi']);
    fireEvent.click(within(nav).getByRole('button', { name: 'Adımlar' }));
    expect(screen.getByRole('list', { name: 'Adımlar' }).textContent).toContain('Dönen malzemeyi doğrula');
  });

  it('3583: sabit yuvalar: yükleniyorken de iskelet çizilir; üç eylem yuvası ve iki düğme yuvası her durumda yerinde', async () => {
    for (const d of ['queued', 'running', 'paused', 'stopped', 'done'] as const) expect(sabitDepoDugmeleri(d, 'Kabulü başlat').map((x) => x.yuva)).toEqual(['ana', 'ara', 'bitir']);
    expect(sabitDepoDugmeleri('queued', 'Kabulü başlat').map((x) => !!x.kapali)).toEqual([false, true, true]);
    expect(sabitDepoDugmeleri('running', 'x').map((x) => x.etiket)).toEqual(['Durdur', 'Duraklat', 'Bitir']);
    expect(sabitDepoDugmeleri('paused', 'x').map((x) => x.etiket)).toEqual(['Devam Et', 'Durdur', 'Bitir']);
    expect(sabitDepoDugmeleri('done', 'Kabulü başlat').map((x) => !!x.kapali)).toEqual([true, true, true]);
    ac();
    // Yüklenirken: şerit, durum, ileti bölgeleri ve üç pasif eylem yuvası var; DurumKutusu yalnız sağ bölmede.
    expect(screen.getByRole('region', { name: 'Bekleyen kabuller' })).toBeTruthy();
    expect(screen.getByRole('status', { name: /Yükleniyor/ })).toBeTruthy();
    const yuvalar = within(durum()).getAllByRole('button') as HTMLButtonElement[];
    expect(yuvalar).toHaveLength(3);
    expect(yuvalar.every((b) => b.disabled)).toBe(true);
    await seritHazir('Bekleyen kabuller');
    // Yüklenince aynı üç yuva; yalnız ilki (Kabulü başlat) açık.
    const sonra = within(durum()).getAllByRole('button') as HTMLButtonElement[];
    expect(sonra.map((b) => b.disabled)).toEqual([false, true, true]);
    fireEvent.click(sonra[0]!);
    expect((within(durum()).getAllByRole('button') as HTMLButtonElement[]).map((b) => b.disabled)).toEqual([false, false, false]);
  });

  it('3583, 3584 Y1: satın alma satırında iki yuva hep yerinde: "Kabul et" başlamadan pasif, Kabulde açılır; Etiket bas bekleyen yokken pasif', async () => {
    ac();
    const serit = await seritHazir('Bekleyen kabuller');
    fireEvent.click(within(serit).getByRole('button', { name: /ORN-S-31/ }));
    const okut = screen.getByRole('button', { name: 'Kabul et' }) as HTMLButtonElement;
    expect(okut.disabled).toBe(true);
    const yuvalar = okut.closest('.tc-ay1-yuvalar')!;
    expect(yuvalar.children).toHaveLength(2);
    expect((screen.getByRole('button', { name: 'Etiket bas · bekleyen etiket yok' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(durum()).getByRole('button', { name: /Kabulü başlat/ }));
    expect((screen.getByRole('button', { name: 'Kabul et' }) as HTMLButtonElement).disabled).toBe(false);
    expect(yuvalar.children).toHaveLength(2);
  });

  it('3583: fason satırında düğme yuvaları ayrılmıştır ama görünmez; ileti satırı hep vardır', async () => {
    ac();
    await seritHazir('Bekleyen kabuller');
    expect(screen.queryByRole('button', { name: 'Kabul et' })).toBeNull();
    const yuvalar = document.querySelector('.tc-ay1-yuvalar')!;
    expect(yuvalar.children).toHaveLength(2);
    expect([...yuvalar.children].every((c) => c.getAttribute('aria-hidden') === 'true')).toBe(true);
    expect(document.querySelector('.tc-ay1-depo-ileti')).toBeTruthy();
  });

  it('3584: mal kabulde Başlat refakat kartı ya da başka kart istemez; pencere açılmaz, istek gitmez', async () => {
    const istekler = ac();
    const serit = await seritHazir('Bekleyen kabuller');
    fireEvent.click(within(serit).getByRole('button', { name: /ORN-S-31/ }));
    const once = istekler.length;
    fireEvent.click(within(durum()).getByRole('button', { name: /Kabulü başlat/ }));
    expect(screen.getByRole('status', { name: /Kabulde/ })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(istekler.slice(once).filter((i) => i.yontem !== 'GET' || /kart/.test(i.yol))).toEqual([]);
  });

  it('3584 iş kartı: satın almada termin ve kalan, fasonda firmadaki adet; sıra termine göre', async () => {
    ac();
    const serit = await seritHazir('Bekleyen kabuller');
    const kartlar = within(serit).getAllByRole('listitem').map((l) => l.querySelector('.tc-ay1-tcark-satir')?.textContent);
    expect(kartlar).toEqual(['Termin — · firmada 3 adet · sıra termine göre', 'Termin — · kalan 3 adet · sıra termine göre']);
  });
});

// 3584 a: kapı çıkışta. Kabul kartsız başlar; kabulden sonra lot etiketi yuvadan tek dokunuşla basılır, basılmayan "Etiket bekliyor" kalır.
describe('mal kabulde etiket kapısı (3584)', () => {
  const OZET = { id: 31, tur: 'hammadde', kod: 'ORN-HM-31', ad: 'ORN Çubuk', onayDurumu: 'aktif', kullanilabilir: true, birim: 'adet' };
  const LOT = { yaziciId: 4, yaziciAd: 'ORN Depo yazıcısı', sablonAnahtar: 'lot-100x50', sablonAd: 'Lot 100x50' };
  const kabulSatiri = (yerler: unknown[]) => ({ satirlar: [{ malKabulId: 12, partiId: 70, lotNo: 'ORN-LT-70', yerler }], toplam: 1, sayfa: 1, sayfaBoyu: 100 });
  const kabulEt = async () => {
    const serit = await seritHazir('Bekleyen kabuller');
    fireEvent.click(within(serit).getByRole('button', { name: /ORN-S-31/ }));
    fireEvent.click(within(durum()).getByRole('button', { name: /Kabulü başlat/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Kabul et' }));
    const p = await screen.findByRole('dialog', { name: 'Mal kabul' });
    // Okutma yok: ekrandaki sipariş satırının malzemesi kimlikle açılır, satır seçili gelir.
    fireEvent.change(await within(p).findByLabelText(/^Sayılan miktar/), { target: { value: '3' } });
    const gonder = within(p).getByRole('button', { name: 'Mal kabul alanına teslim al' }) as HTMLButtonElement;
    await waitFor(() => expect(gonder.disabled).toBe(false));
    fireEvent.click(gonder);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Mal kabul' })).toBeNull());
  };
  const ileti = () => document.querySelector('.tc-ay1-depo-ileti')?.textContent ?? '';
  const etiketYuvasi = () => screen.getByRole('button', { name: /^Etiket bas/ }) as HTMLButtonElement;
  const kodCoz: Isleyici = (yol) => (yol === '/stok/malzemeler/31/ozet' ? json({ ozet: OZET }) : null);

  it('yazıcı yokken: kabulden sonra pencere kapanır, ileti nedeni öne alır (K1), yuva pasif ve bekleyen sayısı ile lot kodunu taşır (K2), rozet çıkar', async () => {
    ac(false, ['stok.giris'], (yol, g) => kodCoz(yol, g) ?? (yol.startsWith('/stok/mal-kabul-satirlari') ? json(kabulSatiri([{ konumId: 1 }])) : null));
    await kabulEt();
    expect(ileti()).toBe("Kabul edildi · Etiket basma yetkisi yok; etiket Basılacaklar'da bekler");
    await waitFor(() => expect(etiketYuvasi().getAttribute('aria-label')).toBe('Etiket bas · 1 bekliyor · ORN-LT-70'));
    expect(etiketYuvasi().disabled).toBe(true);
    expect(screen.getByRole('status', { name: /Kabulde/ }).textContent).toContain('Etiket bekliyor');
    // Başka dokunuş iletiyi silse de neden ileti satırında kalır (kapalı nedeninden önce).
    fireEvent.click(screen.getByRole('button', { name: 'Kabul et' }));
    fireEvent.click(within(await screen.findByRole('dialog')).getAllByRole('button').find((b) => /Kapat/.test(b.getAttribute('aria-label') ?? b.textContent ?? ''))!);
    expect(ileti()).toBe("Etiket basma yetkisi yok; etiket Basılacaklar'da bekler");
  });

  it('varsayılan yazıcı varken tek dokunuş bekleyenlerin hepsini basar, sayı düşer, rozet söner; hata olursa kabul geçerli kalır ve sayı düşmez', async () => {
    cihazYazicisiKaydet('lot', LOT);
    let sonuc: 'gonderildi' | 'hata' = 'hata';
    const istekler = ac(false, ['stok.giris', 'etiket-merkezi.bas'], (yol, g) => kodCoz(yol, g)
      ?? (yol.startsWith('/stok/mal-kabul-satirlari') ? json(kabulSatiri([{ konumId: 1 }])) : null)
      ?? (yol === '/etiket-merkezi/sablonlar/lot-100x50/bas' ? json({ baskiId: 5, sonuc, ileti: sonuc === 'hata' ? 'Kâğıt bitti' : null }) : null));
    await kabulEt();
    expect(ileti()).toBe("Kabul edildi · Etiket bas'a dokunun");
    const kabul = istekler.find((i) => i.yontem === 'POST' && i.yol === '/stok/mal-kabul')!.govde as { satirlar: { malzemeId: number; siparisSatirId: number }[] };
    expect(kabul.satirlar[0]).toMatchObject({ malzemeId: 31, siparisSatirId: 31, miktar: '3' });
    expect(istekler.some((i) => i.yol.startsWith('/stok/kod-coz'))).toBe(false);
    await waitFor(() => expect(etiketYuvasi().disabled).toBe(false));
    fireEvent.click(etiketYuvasi());
    await waitFor(() => expect(ileti()).toBe('Etiket basılamadı; kabul geçerli, etiket bekliyor'));
    expect(etiketYuvasi().getAttribute('aria-label')).toBe('Etiket bas · 1 bekliyor · ORN-LT-70');
    sonuc = 'gonderildi';
    await waitFor(() => expect(etiketYuvasi().disabled).toBe(false));
    fireEvent.click(etiketYuvasi());
    await waitFor(() => expect(etiketYuvasi().getAttribute('aria-label')).toBe('Etiket bas · bekleyen etiket yok'));
    expect(istekler.filter((i) => i.yol.endsWith('/bas')).map((i) => i.govde)).toEqual([
      { yaziciId: 4, adet: 1, kayit: { tur: 'mal-kabul', idler: [12] } }, { yaziciId: 4, adet: 1, kayit: { tur: 'mal-kabul', idler: [12] } },
    ]);
    expect(screen.getByRole('status', { name: /Kabulde/ }).textContent).not.toContain('Etiket bekliyor');
  });

  it('Y4: malzemesi tanımlı olmayan satırda pencere okutmayı zorunlu söyler; tanımlıda okutma isteğe bağlı', async () => {
    ac(false, ['stok.giris'], (yol, g) => kodCoz(yol, g) ?? (yol.startsWith('/stok/acik-siparis-satirlari') ? json({ satirlar: [satir(31, 'ORN Çubuk', 'hammadde'), satir(32, 'ORN Kalem', 'hammadde', { malzemeId: null })] }) : null));
    const serit = await seritHazir('Bekleyen kabuller');
    fireEvent.click(within(serit).getByRole('button', { name: /ORN-S-32/ }));
    fireEvent.click(within(durum()).getByRole('button', { name: /Kabulü başlat/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Kabul et' }));
    const p = await screen.findByRole('dialog', { name: 'Mal kabul' });
    expect(p.textContent).toContain('Bu satırın malzemesi tanımlı değil: malzemenin kodunu okutun.');
    expect(within(p).queryByLabelText(/^Sayılan miktar/)).toBeNull();
  });

  it('R1: kayıt cihazda kalır; lot stoktan çıkınca rozet söner, 31 günlük kabul Basılacaklar listesinde olmasa da bekler', async () => {
    const yaz = (gunOnce: number) => localStorage.setItem('arkon:depo:kabul-etiketleri', JSON.stringify([{ belgeId: 12, belgeNo: 'MK-000012', zaman: Date.now() - gunOnce * 86_400_000 }]));
    const bekleyenler = () => json({ gun: 30, bekleyenler: [] });
    yaz(31);
    ac(false, ['stok.giris', 'etiket-merkezi.oku'], (yol) => (yol.startsWith('/stok/mal-kabul-satirlari') ? json(kabulSatiri([{ konumId: 1 }])) : yol === '/etiket-merkezi/bekleyenler' ? bekleyenler() : null));
    const serit = await seritHazir('Bekleyen kabuller');
    fireEvent.click(within(serit).getByRole('button', { name: /ORN-S-31/ }));
    await waitFor(() => expect(etiketYuvasi().getAttribute('aria-label')).toBe('Etiket bas · 1 bekliyor · ORN-LT-70'));
    cleanup();
    // Lot stokta değil: kayıt düşer.
    ac(false, ['stok.giris'], (yol) => (yol.startsWith('/stok/mal-kabul-satirlari') ? json(kabulSatiri([])) : null));
    const s2 = await seritHazir('Bekleyen kabuller');
    fireEvent.click(within(s2).getByRole('button', { name: /ORN-S-31/ }));
    await waitFor(() => expect(etiketYuvasi().getAttribute('aria-label')).toBe('Etiket bas · bekleyen etiket yok'));
    await waitFor(() => expect(localStorage.getItem('arkon:depo:kabul-etiketleri')).toBeNull());
  });
});
