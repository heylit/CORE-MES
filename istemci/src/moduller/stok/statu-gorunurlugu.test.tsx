import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { BakiyeSatiri, MalzemeAyrintiCevabi, MalzemelerCevabi, MalzemeStokSatiri, PanelCevabi } from '#paylasilan/sozlesme/stok.ts';
import type { Statu } from '#paylasilan/sozlesme/recete-rota.ts';
import { DEPOCU, ac, json, sunucuKur } from './test-ortak.tsx';

// K-X8 (Soru 256 a): Stok Merkezi statüyü rota tanımından gösterir: statülü sekme, statü adıyla arama, ayrıntıda tanımlı ama stoğu
// olmayan statü salt okunur; "statüde" yalnız statülü bakiyedir.
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const SATIR: MalzemeStokSatiri = {
  malzemeId: 901, ad: 'Deneme gövde', stokKodu: 'YM-001', tur: 'yarimamul', birim: 'adet', toplam: '10', serbest: '5', statude: '3', rezerve: '0',
  kritikSeviye: null, durum: 'tanimsiz', konumSayisi: 1, konumlar: [{ kod: 'A-01-02', katNo: 2, miktar: '10' }],
};
const PANEL = {
  malzemeCesidi: 1, gozDolu: 0, gozToplam: 0, kritik: 0, eksi: 0, kabulde: 0, toplamaBekleyen: 0, gunluk: [], kritikListe: [], raflar: [], sonHareketler: [],
  stokDegeri: null, fiyatsizKart: 0, guncelDeger: null, guncelFiyatsizKart: 0, guncelAyri: { kalite: null, hurda: null, fason: null, yolda: null, diger: null, toplam: null }, degerGorunur: false,
} satisfies PanelCevabi;
const liste = (satirlar: MalzemeStokSatiri[]): MalzemelerCevabi => ({ satirlar, toplam: satirlar.length, sayfa: 1, sayfaBoyu: 50 });
const STATULER: Statu[] = [
  { id: 7, malzemeNo: 'YM-001', ad: 'OP 10 Torna', kaynakAdim: '901-o10', urunKodu: 'MM-950', revizyon: 'A', renk: '#336699', tur: 'YM', zaman: '2026-10-05T08:00:00+03:00' },
  { id: 8, malzemeNo: 'YM-001', ad: 'OP 20 Delik', kaynakAdim: '901-o20', urunKodu: 'MM-950', revizyon: 'A', renk: '#336699', tur: 'YM', zaman: '2026-10-05T08:00:00+03:00' },
];

describe('Statü görünürlüğü', () => {
  it('Statülü sekmesi durum=statulu ister; statüde sayısı satırın statude alanıdır, toplam - serbest değildir', async () => {
    const istekler = sunucuKur(DEPOCU, {
      'GET /stok/malzemeler': () => json(200, liste([SATIR])),
      'GET /stok/panel': () => json(200, PANEL),
    });
    ac('/stok/malzemeler');
    expect(await screen.findByText(/statüde 3/)).toBeTruthy();
    expect(screen.getByText(/toplam 10/).textContent).not.toMatch(/statüde 5/);
    fireEvent.click(screen.getByRole('tab', { name: 'Statülü' }));
    await waitFor(() => expect(istekler.some((i) => i.yol.startsWith('/stok/malzemeler?') && i.yol.includes('durum=statulu'))).toBe(true));
  });
  it('yalnız karantinadaki fark statüde yazılmaz; toplam yine görünür', async () => {
    sunucuKur(DEPOCU, {
      'GET /stok/malzemeler': () => json(200, liste([{ ...SATIR, statude: '0', serbest: '8' }])),
      'GET /stok/panel': () => json(200, PANEL),
    });
    ac('/stok/malzemeler');
    expect(await screen.findByText(/toplam 10/)).toBeTruthy();
    expect(screen.queryByText(/statüde/)).toBeNull();
  });
  it('arama kutusu statü adını da arar', async () => {
    sunucuKur(DEPOCU, { 'GET /stok/malzemeler': () => json(200, liste([])), 'GET /stok/panel': () => json(200, PANEL) });
    ac('/stok/malzemeler');
    expect((await screen.findByLabelText('Ara')).getAttribute('placeholder')).toMatch(/statü/);
  });
  it('ayrıntıda stoğu olmayan tanımlı statü "Tanımlı, stok yok" satırıdır; miktar ve rezerve uydurulmaz', async () => {
    const bakiye = {
      id: 11, malzemeId: 901, malzemeAd: 'Deneme gövde', konumId: 3, konumKod: 'A-01-02', partiId: 4, partiEtiketi: 'TP-1',
      miktar: '3.000', ilkGiris: '2026-10-01T08:00:00+03:00', ambalaj: null, statuId: 7,
    } satisfies BakiyeSatiri;
    sunucuKur(DEPOCU, {
      'GET /stok/malzemeler/901': () => json(200, {
        satir: SATIR, bakiyeler: [bakiye], ayar: { kritikSeviye: null, varsayilanAmbalaj: null, varsayilanKonum: null, ambalajlar: [], surum: null }, sonHareketler: [],
        statuKirilimi: [{ statuId: 7, miktar: '3.000', ilkGiris: bakiye.ilkGiris }], tanimliStatuler: [{ statuId: 8 }], rezerveler: [], bekleyenler: [],
      } satisfies MalzemeAyrintiCevabi),
      'GET /stok/statuler': () => json(200, { statuler: STATULER }),
    });
    ac('/stok/malzemeler/901');
    const kirilim = await screen.findByRole('table', { name: 'Statü kırılımı' });
    const satir = (await within(kirilim).findByText('YM-001 (MM-950 · Rev A · OP 20 Delik)')).closest('tr')!;
    expect(within(satir).getByText('Tanımlı, stok yok')).toBeTruthy();
    expect(within(satir).queryByRole('button')).toBeNull();
    expect(within(kirilim).getByText('YM-001 (MM-950 · Rev A · OP 10 Torna)')).toBeTruthy();
  });
  it('yalnız tanımlı statüsü olan kartta da kırılım kartı çıkar', async () => {
    sunucuKur(DEPOCU, {
      'GET /stok/malzemeler/901': () => json(200, {
        satir: { ...SATIR, toplam: '0', serbest: '0', statude: '0', konumSayisi: 0, konumlar: [] }, bakiyeler: [],
        ayar: { kritikSeviye: null, varsayilanAmbalaj: null, varsayilanKonum: null, ambalajlar: [], surum: null }, sonHareketler: [],
        statuKirilimi: [], tanimliStatuler: [{ statuId: 7 }], rezerveler: [], bekleyenler: [],
      } satisfies MalzemeAyrintiCevabi),
      'GET /stok/statuler': () => json(200, { statuler: STATULER }),
    });
    ac('/stok/malzemeler/901');
    const kirilim = await screen.findByRole('table', { name: 'Statü kırılımı' });
    expect(await within(kirilim).findByText('Tanımlı, stok yok')).toBeTruthy();
  });
});
