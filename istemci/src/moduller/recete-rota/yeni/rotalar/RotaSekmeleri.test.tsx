import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { UrunRevizyonlariCevabi } from '#paylasilan/sozlesme/rota.ts';
import { json, OKUYAN, rrAc, sunucuKur, YONETICI, type Istek } from '../test-ortak.tsx';
import { revizyonlari } from './kurallar.ts';
import { revizyonOrnegi, rotaDurumu } from './test-veri.ts';

beforeEach(() => { try { localStorage.setItem('tc-rr1-gorunum', 'dikey'); } catch { /* test ortamında depo yoksa */ } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// Uydurma: örnek mamul 11'in Seri (Standart) rotası (1) Rev A yürürlükte, FAI rotası (2) Rev A taslak. Sahibi Standart rotayı
// "Seri" adıyla döner (3411 a).
const standartRev = { ...revizyonOrnegi('71', 'A', 'yururlukte', 3), rotaId: '1', rotaStandart: true };
const faiRev = { ...revizyonOrnegi('81', 'A', 'taslak', 1), rotaId: '2', rotaStandart: false };
type Rota = UrunRevizyonlariCevabi['rotalar'][number];
const rota = (id: number, ad: string, standart: boolean, emirTurleri: Rota['emirTurleri'] = []): Rota => ({ id, ad, standart, surum: 1, emirTurleri, taslakAcilabilir: true });
const cevap = (rotalar: Rota[]): UrunRevizyonlariCevabi => ({
  urun: { id: 11, kod: 'ORN-11', ad: 'Örnek mamul', tur: 'mamul' } as unknown as UrunRevizyonlariCevabi['urun'],
  revizyonlar: [], rotalar, taslakAcilabilir: true, kartOperasyonlari: null,
});

const kur = (kullanici = YONETICI, rotalar: Rota[] = [rota(1, 'Seri', true), rota(2, 'FAI rotası', false, ['fai'])]) => {
  let liste = rotalar;
  const istekler: Istek[] = sunucuKur(kullanici, {
    durum: () => json(200, rotaDurumu([standartRev, faiRev])),
    yazmalar: {
      'GET /rota/urunler/11': () => json(200, cevap(liste)),
      'POST /rota/urunler/11/rotalar': (g) => {
        const { emirTuru: t, ad } = g as { emirTuru: 'numune'; ad?: string };
        liste = [...liste, rota(3, ad ?? (t === 'numune' ? 'Numune' : t), false, [t])];
        return json(200, cevap(liste));
      },
      'POST /rota/urunler/11/rotalar/2/turler': (g) => {
        const t = (g as { emirTurleri: Rota['emirTurleri'] }).emirTurleri;
        liste = liste.map((x) => (x.id === 2 ? { ...x, emirTurleri: t, surum: 2 } : x));
        return json(200, cevap(liste));
      },
      'POST /rota/urunler/11/rotalar/3/turler': (g) => {
        const t = (g as { emirTurleri: Rota['emirTurleri'] }).emirTurleri;
        liste = liste.map((x) => (x.id === 3 ? { ...x, emirTurleri: t, surum: 2 } : x));
        return json(200, cevap(liste));
      },
      'POST /rota/urunler/11/rotalar/4/ad': (g) => {
        const { ad } = g as { ad: string };
        liste = liste.map((x) => (x.id === 4 ? { ...x, ad, surum: 2 } : x));
        return json(200, cevap(liste));
      },
      'POST /rota/urunler/11/taslak-ac': () => json(200, { id: 91, durum: 'taslak', surum: 1 }),
    },
  });
  return istekler;
};

const sekmeler = async () => {
  const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
  return within(bolge).findByRole('group', { name: 'Ürünün rotaları' });
};
// 3295 a: gösterilen revizyon revizyon satırındaki seçicidedir; rota işlemleri "Rota işlemleri" menüsündedir.
const revizyonSecici = (rotaAdi: string) => screen.getByRole('combobox', { name: `${rotaAdi}: gösterilen revizyon` });
const revizyonlar = (rotaAdi: string) => within(revizyonSecici(rotaAdi)).getAllByRole('option').map((o) => o.textContent);
const menudenSec = (bolge: HTMLElement, ad: string) => {
  fireEvent.click(within(bolge).getByRole('button', { name: 'Rota işlemleri' }));
  fireEvent.click(screen.getByRole('menuitem', { name: ad }));
};

describe('Rota sekmeleri (3247 a)', () => {
  it('revizyonlar seçili rotaya göre süzülür; varsayılan Standart', () => {
    const revs = [standartRev, faiRev];
    expect(revizyonlari(revs, '11').map((r) => r.id)).toEqual(['71']);
    expect(revizyonlari(revs, '11', '2').map((r) => r.id)).toEqual(['81']);
    // Rota bilgisi taşımayan eski biçim Standart sayılır.
    expect(revizyonlari([revizyonOrnegi('71', 'A', 'yururlukte', 3)], '11').map((r) => r.id)).toEqual(['71']);
  });

  it('her rota sekmede adı, türleri ve yürürlükteki revizyonuyla durur; sekme seçilince o rotanın revizyonları görünür', async () => {
    kur();
    rrAc('/recete-rota/schema');
    const g = await sekmeler();
    const std = await within(g).findByRole('button', { name: /^Seri/ });
    expect(std.textContent).toBe('SeriSeri ve kendi rotası olmayan türler · Rev A');
    expect(std.getAttribute('aria-pressed')).toBe('true');
    const fai = within(g).getByRole('button', { name: /FAI rotası/ });
    expect(fai.textContent).toBe('FAI rotasıYalnız FAI emirleri · yürürlükte revizyon yok · taslak var');
    expect(revizyonlar('Seri')).toEqual(['Rev A · yürürlükte']);
    fireEvent.click(fai);
    await waitFor(() => { expect(fai.getAttribute('aria-pressed')).toBe('true'); });
    expect(revizyonlar('FAI rotası')).toEqual(['Rev A · taslak']);
  });

  it('3411 a: "Yeni rota" emir türüyle açılır, ad boşsa türün adı olur; rotası olan tür seçilemez; açılan rotaya geçer ve Seri\'nin yürürlükteki revizyonundan taslak açar', async () => {
    const istekler = kur();
    rrAc('/recete-rota/schema');
    const g = await sekmeler();
    const bolge = screen.getByRole('region', { name: 'Ürün ve rotalar' });
    menudenSec(bolge, 'Yeni rota');
    expect((within(bolge).getByRole('textbox', { name: 'Yeni rotanın adı' }) as HTMLInputElement).value).toBe('');
    const turler = within(bolge).getByRole('group', { name: 'Yeni rotanın emir türü' });
    expect(within(turler).queryByRole('button', { name: 'Seri' })).toBeNull();
    expect((within(turler).getByRole('button', { name: 'FAI (var)' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(bolge).getByRole('button', { name: 'Rotayı aç' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(turler).getByRole('button', { name: 'Numune' }));
    expect(within(bolge).getByText('Numune emirleri, bu rota yürürlüğe girene kadar Seri rotasıyla açılmaya devam eder.')).toBeTruthy();
    fireEvent.click(within(bolge).getByRole('button', { name: 'Numune rotasını aç' }));
    const yeni = await within(g).findByRole('button', { name: /^Numune/ });
    await waitFor(() => { expect(yeni.getAttribute('aria-pressed')).toBe('true'); });
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/rota/urunler/11/taslak-ac')).toBe(true); });
    expect(istekler.find((i) => i.yol === '/rota/urunler/11/rotalar')?.govde).toEqual({ emirTuru: 'numune' });
    expect(istekler.some((i) => i.yol.endsWith('/turler'))).toBe(false);
    expect(istekler.find((i) => i.yol === '/rota/urunler/11/taslak-ac')?.govde).toEqual({ kaynak: { tur: 'revizyon', revizyonId: 71 }, rotaId: 3 });
    // 3482-1 b: türüyle açılan rotanın adı sonradan değişir, türü değişmez.
    menudenSec(bolge, 'Rotanın adı ve emir türleri');
    expect(within(bolge).getByText(/Tür rotasının türü değişmez/)).toBeTruthy();
    expect(within(bolge).queryByRole('group', { name: 'Bu rotayı kullanan emir türleri' })).toBeNull();
  });

  it('3482-1 b: yeni rotaya ad yazılırsa o adla açılır', async () => {
    const istekler = kur();
    rrAc('/recete-rota/schema');
    const g = await sekmeler();
    const bolge = screen.getByRole('region', { name: 'Ürün ve rotalar' });
    menudenSec(bolge, 'Yeni rota');
    fireEvent.click(within(within(bolge).getByRole('group', { name: 'Yeni rotanın emir türü' })).getByRole('button', { name: 'Numune' }));
    fireEvent.change(within(bolge).getByRole('textbox', { name: 'Yeni rotanın adı' }), { target: { value: '  ORN Numune hattı ' } });
    fireEvent.click(within(bolge).getByRole('button', { name: 'Numune rotasını aç' }));
    await within(g).findByRole('button', { name: /^ORN Numune hattı/ });
    expect(istekler.find((i) => i.yol === '/rota/urunler/11/rotalar')?.govde).toEqual({ emirTuru: 'numune', ad: 'ORN Numune hattı' });
  });

  it('3482-1 b: tür rotasının adı değişir, türü yazılmaz', async () => {
    const istekler = kur(YONETICI, [rota(1, 'Seri', true), rota(4, 'Numune', false, ['numune'])]);
    rrAc('/recete-rota/schema');
    const g = await sekmeler();
    fireEvent.click(await within(g).findByRole('button', { name: /^Numune/ }));
    const bolge = screen.getByRole('region', { name: 'Ürün ve rotalar' });
    menudenSec(bolge, 'Rotanın adı ve emir türleri');
    fireEvent.change(within(bolge).getByRole('textbox', { name: 'Rota adı' }), { target: { value: 'ORN Numune hattı' } });
    fireEvent.click(within(bolge).getByRole('button', { name: 'Kaydet' }));
    await within(g).findByRole('button', { name: /^ORN Numune hattı/ });
    expect(istekler.find((i) => i.yol === '/rota/urunler/11/rotalar/4/ad')?.govde).toEqual({ ad: 'ORN Numune hattı', surum: 1 });
    expect(istekler.some((i) => i.yol.endsWith('/turler'))).toBe(false);
  });

  it('15.11\'den kalan türsüz rotada "Rotanın adı ve emir türleri" türleri yazar; başka rotadan taşınan tür kaydetmeden önce yazılır', async () => {
    const istekler = kur(YONETICI, [rota(1, 'Seri', true), rota(2, 'FAI rotası', false, []), rota(4, 'Numune rotası', false, ['numune'])]);
    rrAc('/recete-rota/schema');
    const g = await sekmeler();
    fireEvent.click(await within(g).findByRole('button', { name: /FAI rotası/ }));
    const bolge = screen.getByRole('region', { name: 'Ürün ve rotalar' });
    menudenSec(bolge, 'Rotanın adı ve emir türleri');
    const turler = within(bolge).getByRole('group', { name: 'Bu rotayı kullanan emir türleri' });
    fireEvent.click(within(turler).getByRole('checkbox', { name: 'Numune' }));
    expect(within(bolge).getByText('Kaydedince başka rotadan bu rotaya geçer: Numune (Numune rotası).')).toBeTruthy();
    fireEvent.click(within(bolge).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/rota/urunler/11/rotalar/2/turler')).toBe(true); });
    expect(istekler.find((i) => i.yol === '/rota/urunler/11/rotalar/2/turler')?.govde).toEqual({ emirTurleri: ['numune'], surum: 1 });
    expect(istekler.some((i) => i.yol === '/rota/urunler/11/rotalar/2/ad')).toBe(false);
  });

  it('tek rotası olan üründe rota açamayan kullanıcıya sekme satırı çıkmaz', async () => {
    const istekler = kur(OKUYAN, [rota(1, 'Seri', true)]);
    rrAc('/recete-rota/schema');
    const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/rota/urunler/11')).toBe(true); });
    await within(bolge).findByRole('combobox', { name: /gösterilen revizyon$/ });
    expect(within(bolge).queryByRole('group', { name: 'Ürünün rotaları' })).toBeNull();
  });

  it('iki rotalı üründe rota açamayan sekmeleri görür; "Yeni rota" ve "Rotanın adı ve emir türleri" menüde yoktur (3295 a)', async () => {
    kur(OKUYAN);
    rrAc('/recete-rota/schema');
    const g = await sekmeler();
    await within(g).findByRole('button', { name: /FAI rotası/ });
    const bolge = screen.getByRole('region', { name: 'Ürün ve rotalar' });
    const d = within(bolge).queryByRole('button', { name: 'Rota işlemleri' });
    if (d) fireEvent.click(d);
    expect(screen.queryByRole('menuitem', { name: 'Yeni rota' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Rotanın adı ve emir türleri' })).toBeNull();
  });

  // Arayüz ön bakışı (3247): rota listesi okunamazsa ekran sessizce tek rotalı ürün gibi görünmez.
  it('rota listesi okunamazsa sekme satırının yerinde hata ve yeniden dene görünür', async () => {
    let ilk = true;
    sunucuKur(YONETICI, {
      durum: () => json(200, rotaDurumu([standartRev, faiRev])),
      yazmalar: {
        'GET /rota/urunler/11': () => {
          if (ilk) { ilk = false; return json(500, { kod: 'IC_HATA', mesaj: 'Sunucu hatası.' }); }
          return json(200, cevap([rota(1, 'Seri', true), rota(2, 'FAI rotası', false, ['fai'])]));
        },
      },
    });
    rrAc('/recete-rota/schema');
    const uyari = await screen.findByRole('alert');
    expect(uyari.textContent).toContain('Ürünün rotaları alınamadı');
    fireEvent.click(within(uyari).getByRole('button', { name: 'Yeniden dene' }));
    expect(await sekmeler()).toBeTruthy();
  });
});
