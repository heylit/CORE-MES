import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import { useLocation } from 'react-router-dom';
import type { RefakatPartisi } from '#paylasilan/sozlesme/stok.ts';
import type { Emir, EmirAyrintiCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { Kullanici } from '#paylasilan/kullanici.ts';
import { EmirAyrintisi } from './EmirAyrintisi.tsx';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

const EMIR = {
  id: 12, emirNo: 'UE-000012', durum: 'planli', parcaNo: 'DNM-001', parcaAd: 'Deneme mil', adet: 10, istasyon: { id: 3, ad: 'Deneme Tezgah' },
  acan: { id: 7, ad: 'Deneme Planlamaci' }, acilma: '2026-10-06T08:00:00+00:00', baslama: null, bitis: null, iptal: null, saglamAdet: null, malzemeNo: 901,
} satisfies Emir;
const kart = (id: number, sira: number, ek: Partial<RefakatPartisi> = {}): RefakatPartisi => ({
  id, qr: `RP:${id}`, etiket: `UE-000012-P${sira}`, uretimEmriId: 12, emirNo: 'UE-000012', sira,
  malzemeId: 501, malzemeKod: 'DNM-HM', malzemeAd: 'Deneme çubuk', birim: 'kg',
  partiId: 40 + id, lotNo: `LT-0000${id}`, tedarikciPartiNo: null, dokumNo: null, sertifikaNo: null, lotaBaglanmaZamani: null,
  verilen: '2.5', durum: 'acik', surum: 1, kayitZamani: '2026-10-25T08:00:00+00:00', ust: null, birlestigi: null, birlesmeZamani: null, ...ek,
});
const KARTLAR = [
  kart(1, 1),
  kart(2, 2, { partiId: null, lotNo: null, verilen: '0' }),
  kart(3, 3, { durum: 'iptal' }),
  kart(4, 4, { birlestigi: { id: 1, etiket: 'UE-000012-P1' } }),
];
const STOKCU: Kullanici = { ...OKUYUCU, islemler: [...OKUYUCU.islemler, 'stok.transfer'] };

function Adres() {
  const l = useLocation();
  return <p>{l.pathname + l.search}</p>;
}
const ekran = [{ yol: '/uretim-emirleri/:id', ekran: EmirAyrintisi }, { yol: '/etiket-merkezi', ekran: Adres }];
const yollar = (emir: Emir = EMIR) => ({
  'GET /uretim-emirleri/12': () => json(200, { emir, kayitlar: [], adimlar: [] } satisfies EmirAyrintiCevabi),
  'GET /stok/uretim-emirleri/12/refakat-partileri': () => json(200, { partiler: KARTLAR }),
});
const satir = async (etiket: string) => (await screen.findByText(etiket)).closest('tr')!;
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Refakat kartları (Soru 586)', () => {
  it('stok okuması olana emrin depoda açılmış kartları lot, verilen ve durumla listelenir; eski emir kartı düğmesi yok', async () => {
    sunucuKur(STOKCU, yollar());
    ac(ekran, '/uretim-emirleri/12');
    const ilk = await satir('UE-000012-P1');
    expect(within(ilk).getByText('LT-00001')).toBeTruthy();
    expect(within(ilk).getByText('2,5 kg')).toBeTruthy();
    expect(within(ilk).getByText('Açık')).toBeTruthy();
    expect(within(await satir('UE-000012-P2')).getByText('Lot bekliyor')).toBeTruthy();
    expect(within(await satir('UE-000012-P3')).getByText('İptal')).toBeTruthy();
    expect(within(await satir('UE-000012-P4')).getByText('UE-000012-P1 kartına birleşti')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Refakat kartı bas' })).toBeNull();
  });

  it('stok okuması olmayana bölüm çizilmez ve stok ucu çağrılmaz; ürün kartı olmayan emirde de çizilmez', async () => {
    for (const [kullanici, emir] of [[OKUYUCU, EMIR], [STOKCU, { ...EMIR, malzemeNo: null }]] as const) {
      const istekler = sunucuKur(kullanici, yollar(emir));
      ac(ekran, '/uretim-emirleri/12');
      expect(await screen.findByText('UE-000012')).toBeTruthy();
      expect(screen.queryByRole('heading', { name: 'Refakat kartları' })).toBeNull();
      expect(istekler.some((i) => i.yol.startsWith('/stok/'))).toBe(false);
      cleanup();
    }
  });

  it('Etiket Merkezi sayfası olana yalnız açık, lotlu ve birleşmemiş kartta düğme çıkar ve kartı lotlu refakat kartı olarak açar', async () => {
    sunucuKur({ ...STOKCU, islemler: [...STOKCU.islemler, 'sayfa.etiket-merkezi'] }, yollar());
    ac(ekran, '/uretim-emirleri/12');
    for (const e of ['UE-000012-P2', 'UE-000012-P3', 'UE-000012-P4']) {
      expect(within(await satir(e)).queryByRole('button', { name: "Etiket Merkezi'nde bas" })).toBeNull();
    }
    expect(screen.queryByRole('button', { name: 'Yazdır' })).toBeNull();
    fireEvent.click(within(await satir('UE-000012-P1')).getByRole('button', { name: "Etiket Merkezi'nde bas" }));
    expect(await screen.findByText('/etiket-merkezi?tur=refakat-partisi&id=1')).toBeTruthy();
  });

  it('Etiket Merkezi sayfası olmayana basım düğmesi görünmez; liste yine görünür', async () => {
    sunucuKur(STOKCU, yollar());
    ac(ekran, '/uretim-emirleri/12');
    expect(within(await satir('UE-000012-P1')).queryByRole('button', { name: "Etiket Merkezi'nde bas" })).toBeNull();
  });

  it('karta açılmamış emirde depoya yönlendiren boş mesaj görünür', async () => {
    sunucuKur(STOKCU, { ...yollar(), 'GET /stok/uretim-emirleri/12/refakat-partileri': () => json(200, { partiler: [] }) });
    ac(ekran, '/uretim-emirleri/12');
    expect(await screen.findByText(/Kart depoda, lot emre ayrılınca açılır/)).toBeTruthy();
  });
});
