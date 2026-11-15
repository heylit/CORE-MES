import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { UrunRevizyonlariCevabi } from '#paylasilan/sozlesme/rota.ts';
import { json, OKUYAN, rrAc, sunucuKur, YONETICI, type Istek } from '../test-ortak.tsx';
import { revizyonlari } from './kurallar.ts';
import { revizyonOrnegi, rotaDurumu } from './test-veri.ts';

beforeEach(() => { try { localStorage.setItem('tc-rr1-gorunum', 'dikey'); } catch { /* test ortamında depo yoksa */ } });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); try { localStorage.clear(); } catch { /* test ortamında depo yoksa */ } });

// Uydurma: örnek mamul 11'in Standart rotası (1) Rev A yürürlükte, FAI rotası (2) Rev A taslak.
const standartRev = { ...revizyonOrnegi('71', 'A', 'yururlukte', 3), rotaId: '1', rotaStandart: true };
const faiRev = { ...revizyonOrnegi('81', 'A', 'taslak', 1), rotaId: '2', rotaStandart: false };
type Rota = UrunRevizyonlariCevabi['rotalar'][number];
const rota = (id: number, ad: string, standart: boolean, emirTurleri: Rota['emirTurleri'] = []): Rota => ({ id, ad, standart, surum: 1, emirTurleri, taslakAcilabilir: true });
const cevap = (rotalar: Rota[]): UrunRevizyonlariCevabi => ({
  urun: { id: 11, kod: 'ORN-11', ad: 'Örnek mamul', tur: 'mamul' } as unknown as UrunRevizyonlariCevabi['urun'],
  revizyonlar: [], rotalar, taslakAcilabilir: true, kartOperasyonlari: null,
});

const kur = (kullanici = YONETICI, rotalar: Rota[] = [rota(1, 'Standart', true), rota(2, 'FAI rotası', false, ['fai'])]) => {
  let liste = rotalar;
  const istekler: Istek[] = sunucuKur(kullanici, {
    durum: () => json(200, rotaDurumu([standartRev, faiRev])),
    yazmalar: {
      'GET /rota/urunler/11': () => json(200, cevap(liste)),
      'POST /rota/urunler/11/rotalar': (g) => {
        liste = [...liste, rota(3, (g as { ad: string }).ad, false)];
        return json(200, cevap(liste));
      },
      'POST /rota/urunler/11/rotalar/2/turler': (g) => {
        const t = (g as { emirTurleri: Rota['emirTurleri'] }).emirTurleri;
        liste = liste.map((x) => (x.id === 2 ? { ...x, emirTurleri: t, surum: 2 } : x));
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
const revizyonDugmeleri = () => within(screen.getByRole('group', { name: 'Revizyonlar' })).getAllByRole('button').map((b) => b.textContent);

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
    const std = await within(g).findByRole('button', { name: /Standart/ });
    expect(std.textContent).toBe('StandartÖteki bütün türlerRev A yürürlükte');
    expect(std.getAttribute('aria-pressed')).toBe('true');
    const fai = within(g).getByRole('button', { name: /FAI rotası/ });
    expect(fai.textContent).toBe('FAI rotasıFAIYürürlükte revizyon yok · taslak var');
    expect(revizyonDugmeleri()).toEqual(['Rev AYürürlükte']);
    // Ön izleme A: revizyon satırının başlığı seçili rotanın adı; "Yeni rota" ürün başlığının satırında.
    expect(screen.getByText('Standart revizyonları')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Yeni rota' }).closest('.tc-rr1-rv-row')?.textContent).toContain('Örnek');
    fireEvent.click(fai);
    await waitFor(() => { expect(fai.getAttribute('aria-pressed')).toBe('true'); });
    expect(revizyonDugmeleri()).toEqual(['Rev ATaslak']);
    expect(screen.getByText('FAI rotası revizyonları')).toBeTruthy();
  });

  it('"Yeni rota" adla rota açar, ona geçer ve Standart\'ın yürürlükteki revizyonundan taslak açar', async () => {
    const istekler = kur();
    rrAc('/recete-rota/schema');
    const g = await sekmeler();
    const bolge = screen.getByRole('region', { name: 'Ürün ve rotalar' });
    fireEvent.click(within(bolge).getByRole('button', { name: 'Yeni rota' }));
    fireEvent.change(within(bolge).getByRole('textbox', { name: 'Yeni rotanın adı' }), { target: { value: 'Numune rotası' } });
    fireEvent.click(within(bolge).getByRole('button', { name: 'Rotayı aç' }));
    const yeni = await within(g).findByRole('button', { name: /Numune rotası/ });
    await waitFor(() => { expect(yeni.getAttribute('aria-pressed')).toBe('true'); });
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/rota/urunler/11/taslak-ac')).toBe(true); });
    expect(istekler.find((i) => i.yol === '/rota/urunler/11/rotalar')?.govde).toEqual({ ad: 'Numune rotası' });
    expect(istekler.find((i) => i.yol === '/rota/urunler/11/taslak-ac')?.govde).toEqual({ kaynak: { tur: 'revizyon', revizyonId: 71 }, rotaId: 3 });
  });

  it('"Adı ve türleri" türleri yazar; başka rotadan taşınan tür kaydetmeden önce yazılır', async () => {
    const istekler = kur(YONETICI, [rota(1, 'Standart', true), rota(2, 'FAI rotası', false, ['fai']), rota(4, 'Numune rotası', false, ['numune'])]);
    rrAc('/recete-rota/schema');
    const g = await sekmeler();
    fireEvent.click(await within(g).findByRole('button', { name: /FAI rotası/ }));
    const bolge = screen.getByRole('region', { name: 'Ürün ve rotalar' });
    fireEvent.click(within(bolge).getByRole('button', { name: 'Adı ve türleri' }));
    const turler = within(bolge).getByRole('group', { name: 'Bu rotayı kullanan emir türleri' });
    fireEvent.click(within(turler).getByRole('checkbox', { name: 'Numune' }));
    expect(within(bolge).getByText('Kaydedince başka rotadan bu rotaya geçer: Numune (Numune rotası).')).toBeTruthy();
    fireEvent.click(within(bolge).getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/rota/urunler/11/rotalar/2/turler')).toBe(true); });
    expect(istekler.find((i) => i.yol === '/rota/urunler/11/rotalar/2/turler')?.govde).toEqual({ emirTurleri: ['fai', 'numune'], surum: 1 });
    expect(istekler.some((i) => i.yol === '/rota/urunler/11/rotalar/2/ad')).toBe(false);
  });

  it('tek rotası olan üründe rota açamayan kullanıcıya sekme satırı çıkmaz', async () => {
    const istekler = kur(OKUYAN, [rota(1, 'Standart', true)]);
    rrAc('/recete-rota/schema');
    const bolge = await screen.findByRole('region', { name: 'Ürün ve rotalar' });
    await waitFor(() => { expect(istekler.some((i) => i.yol === '/rota/urunler/11')).toBe(true); });
    await within(bolge).findByRole('group', { name: 'Revizyonlar' });
    expect(within(bolge).queryByRole('group', { name: 'Ürünün rotaları' })).toBeNull();
  });
});
