import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { Hareket, IsKutusuCevabi, MalzemeStokSatiri, PanelCevabi } from '#paylasilan/sozlesme/stok.ts';
import { tesisGunBasi } from '#paylasilan/tesis-zamani.ts';
import { DEPOCU, MUDUR, ac, json, sunucuKur, type Istek } from './test-ortak.tsx';

// Kart 1293: Stok Merkezi Faz 0 istemci düzeltmeleri (sayım bağlantısı, eski not, geri alma nedeni, hareket süzgeçleri, tam CSV).
const HAREKET: Hareket = {
  id: 41, zaman: '2026-10-20T09:15:00+03:00', tur: 'cikis', malzemeId: 9, malzemeAd: 'Deneme mil', partiId: null, partiEtiketi: null, kaynakKonumId: 2, kaynakKonumKod: 'A-01',
  hedefKonumId: null, hedefKonumKod: null, miktar: '2.000', onayliEksi: false, girisKaynagi: null, cikisNedeni: 'diger', uretimEmriId: null, emirNo: null, geriAlinanId: null, geriAlindi: false,
  fisId: null, fisNo: null, kisiAd: 'Deneme Depocu', aciklama: null, kaynakStatuId: null, hedefStatuId: null,
} as Hareket;
const sayfa = <T,>(satirlar: T[], s = 1, toplam: number | null = satirlar.length, boy = 50) => ({ satirlar, toplam, sayfa: s, sayfaBoyu: boy });
const BOS_KUTU = { sayimBekleyen: 2 } as unknown as IsKutusuCevabi;

let indirilen: Blob[] = [];
function indirmeyiYakala() {
  indirilen = [];
  vi.stubGlobal('URL', Object.assign(Object.create(URL) as typeof URL, { createObjectURL: (b: Blob) => { indirilen.push(b); return 'blob:deneme'; }, revokeObjectURL: () => {} }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
}
const metin = (b: Blob) => new Promise<string>((coz) => { const o = new FileReader(); o.onload = () => coz(o.result as string); o.readAsText(b); });
const sorgu = (i: Istek) => new URLSearchParams(i.yol.split('?')[1] ?? '');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('İş kutusu', () => {
  it('eski "elle yapılır" notu yok; ?sayim=1 sayım bekleyen gözleri gösterir ve oraya kaydırır', async () => {
    const kaydir = vi.fn();
    Element.prototype.scrollIntoView = kaydir;
    sunucuKur(DEPOCU, {
      'GET /stok/is-kutusu': () => json(200, { ...BOS_KUTU, kabuldeBekleyen: 0, eksiBakiye: 0, kritik: 0, logoFarki: 0, fasondaEksik: 0, fasonEksikGonderimi: 0, logoHatasi: 0 }),
      'GET /stok/sayim-bekleyenler': () => json(200, { gun: 90, gozler: [{ konumId: 3, kod: 'A-03', sonSayim: null }] }),
    });
    ac('/stok?sayim=1');
    expect(await screen.findByText('Sayım bekleyen gözler (90 gün)')).toBeTruthy();
    await vi.waitFor(() => expect(kaydir).toHaveBeenCalled());
    expect(screen.queryByText(/şimdilik elle yapılır/)).toBeNull();
  });
});

describe('Hareketler', () => {
  it('geri alma nedeni sorulur, boş nedenle istek gitmez, neden gövdeye yazılır', async () => {
    const istekler = sunucuKur(MUDUR, {
      'GET /stok/hareketler': () => json(200, sayfa([HAREKET])),
      'GET /uretim-emirleri': () => json(200, { emirler: [] }),
      'POST /stok/hareketler/41/geri-al': () => json(200, { hareketIdler: [42], onayliEksi: false }),
    });
    ac('/stok/hareketler');
    fireEvent.click(await screen.findByRole('button', { name: 'Geri al' }));
    const pencere = await screen.findByRole('dialog');
    fireEvent.click(within(pencere).getByRole('button', { name: 'Geri al' }));
    expect(istekler.some((i) => i.yontem === 'POST')).toBe(false);
    fireEvent.change(within(pencere).getByLabelText(/Neden/), { target: { value: ' Yanlış göz seçildi ' } });
    fireEvent.click(within(pencere).getByRole('button', { name: 'Geri al' }));
    await vi.waitFor(() => expect(istekler.find((i) => i.yontem === 'POST')?.govde).toEqual({ aciklama: 'Yanlış göz seçildi' }));
  });

  it('gün ve emir süzgeci sunucuya an ve emir kimliği olarak gider; bitiş günü dahildir', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/hareketler': () => json(200, sayfa([HAREKET])),
      'GET /uretim-emirleri': () => json(200, { emirler: [{ id: 7, emirNo: 'UE-7', parcaNo: 'P-1', parcaAd: 'Deneme', durum: 'kapandi', adet: 1 }] }),
    });
    ac('/stok/hareketler?gunBaslangic=2026-10-01&gunBitis=2026-10-31&uretimEmriId=7');
    await screen.findByText('Deneme mil');
    const q = sorgu(istekler.filter((i) => i.yol.startsWith('/stok/hareketler')).at(-1)!);
    expect(q.get('baslangic')).toBe(new Date(tesisGunBasi('2026-10-01')).toISOString());
    expect(q.get('bitis')).toBe(new Date(tesisGunBasi('2026-11-01')).toISOString());
    expect(q.get('uretimEmriId')).toBe('7');
    expect(q.has('gunBaslangic')).toBe(false);
    expect(await screen.findByRole('option', { name: /UE-7/ })).toBeTruthy();
  });

  it('CSV süzgece uyan bütün sayfaları indirir, ekrandaki sayfayla kalmaz', async () => {
    indirmeyiYakala();
    const tam = Array.from({ length: 200 }, (_, i) => ({ ...HAREKET, id: 100 + i }));
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/hareketler': () => json(200, sayfa([HAREKET], 1, 201)),
      'GET /uretim-emirleri': () => json(200, { emirler: [] }),
    });
    // Dışa aktarma istekleri sayfaBoyu=200 taşır: birinci sayfa dolu, ikinci tek satır.
    const ozel = vi.mocked(fetch).getMockImplementation()!;
    vi.mocked(fetch).mockImplementation(async (adres, secenek) => {
      const yol = String(adres);
      if (yol.includes('sayfaBoyu=200')) {
        istekler.push({ yontem: 'GET', yol: yol.replace('/api', ''), govde: undefined });
        return yol.includes('sayfa=1&') ? json(200, sayfa(tam, 1, 201, 200)) : json(200, sayfa([HAREKET], 2, 201, 200));
      }
      return ozel(adres, secenek);
    });
    ac('/stok/hareketler?tur=cikis');
    await screen.findByText('Deneme mil');
    fireEvent.click(screen.getByRole('button', { name: 'CSV indir' }));
    await vi.waitFor(() => expect(indirilen).toHaveLength(1));
    expect((await metin(indirilen[0]!)).trim().split('\r\n')).toHaveLength(202);
    const disa = istekler.filter((i) => i.yol.includes('sayfaBoyu=200'));
    expect(disa.map((i) => sorgu(i).get('sayfa'))).toEqual(['1', '2']);
    expect(disa.every((i) => sorgu(i).get('tur') === 'cikis')).toBe(true);
  });
});

describe('Malzemeler', () => {
  it('CSV bütün sayfaları alır; sunucu taşan sayfayı geri çekerse durur', async () => {
    indirmeyiYakala();
    const satir = { malzemeId: 1, stokKodu: 'K1', ad: 'Deneme', tur: null, toplam: '1', serbest: '1', statude: '0', rezerve: '0', birim: 'adet', kritikSeviye: null, durum: 'tanimsiz', konumlar: [] } as unknown as MalzemeStokSatiri;
    const tam = Array.from({ length: 200 }, (_, i) => ({ ...satir, malzemeId: i + 1 }));
    sunucuKur(DEPOCU, {
      'GET /stok/malzemeler': () => json(200, sayfa([satir], 1, null)),
      'GET /stok/panel': () => json(200, { malzemeCesidi: 1, kritik: 0, eksi: 0, kabulde: 0 } as PanelCevabi),
    });
    const ozel = vi.mocked(fetch).getMockImplementation()!;
    const disa: string[] = [];
    vi.mocked(fetch).mockImplementation(async (adres, secenek) => {
      const yol = String(adres);
      if (yol.includes('sayfaBoyu=200')) {
        disa.push(yol);
        // toplam sayılmamış (null): ikinci istekte sunucu son sayfayı (1) yeniden döner.
        return json(200, sayfa(tam, 1, null, 200));
      }
      return ozel(adres, secenek);
    });
    ac('/stok/malzemeler');
    await screen.findByText('K1', { exact: false });
    fireEvent.click(screen.getByRole('button', { name: 'CSV' }));
    await vi.waitFor(() => expect(indirilen).toHaveLength(1));
    expect(disa).toHaveLength(2);
    expect((await metin(indirilen[0]!)).trim().split('\r\n')).toHaveLength(201);
  });
});
