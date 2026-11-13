import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { MrpIhtiyaciCevabi } from '#paylasilan/sozlesme/plan.ts';
import type { EmirFisleriCevabi } from '#paylasilan/sozlesme/stok.ts';
import { EmirFisleri } from './EmirFisleri.tsx';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

// 3175 a: emrin Fişler sekmesi. Veriler uydurmadır (ORN-).
const kart = (tur: EmirFisleriCevabi['kartlar'][number]['tur'], p: Partial<EmirFisleriCevabi['kartlar'][number]> = {}) => ({
  tur, no: null, belgeSayisi: 0, satirSayisi: 0, toplam: null, birim: null, sonHareket: null, logo: null, ...p,
});
const hareket = (id: number, tur: 'sarf' | 'fire', kaynak: 'terminal' | 'elle', miktar = '4') => ({
  id, zaman: '2030-01-02T08:00:00Z', tur, geriAlma: false, belgeNo: tur === 'sarf' ? 'SR-000101' : 'FR-000102', malzemeId: 7, malzemeKod: 'ORN-HM-01',
  malzemeAd: 'Örnek çubuk', birim: 'adet', partiEtiketi: 'ORN-LOT-1', miktar, kaynakKonumKod: 'ORN-A1', hedefKonumKod: null, opNo: 10, kaynak, kisiAd: 'Örnek Kişi', aciklama: null,
});
const rezerve = (id: number, miktar: string, aciklama: string) => ({
  ...hareket(id, 'sarf', 'elle', miktar), tur: 'rezerve' as const, belgeNo: null, partiEtiketi: null, kaynakKonumKod: null, opNo: null, kaynak: 'emir' as const, aciklama,
});
const cevap = (dolu: boolean): EmirFisleriCevabi => ({
  kartlar: [
    kart('uretim_girisi', { no: 'UG-000100', belgeSayisi: 1, logo: 'bekliyor' }),
    kart('fire', dolu ? { no: 'FR-000102', belgeSayisi: 1, satirSayisi: 1, toplam: '1', birim: 'adet', sonHareket: '2030-01-02T08:00:00Z', logo: 'gonderilmez' } : {}),
    kart('sarf', dolu ? { no: 'SR-000101', belgeSayisi: 1, satirSayisi: 1, toplam: '4', birim: 'adet', sonHareket: '2030-01-02T08:00:00Z', logo: 'gonderildi' } : {}),
    kart('ambar'), kart('teslim'),
    kart('rezerve', dolu ? { belgeSayisi: 0, satirSayisi: 2, toplam: '0', birim: 'adet', sonHareket: '2030-01-03T08:00:00Z' } : {}),
  ],
  hareketler: dolu ? [hareket(1, 'sarf', 'terminal'), hareket(2, 'fire', 'elle', '1'), rezerve(1, '6', 'Emir açılışı'), rezerve(2, '-6', 'Emir iptal edildi')] : [],
});
const mrp: MrpIhtiyaciCevabi = {
  hesaplanan: '2030-01-02T08:00:00Z', stokGorunur: false, satinAlmaGorunur: false, urunsuzEmir: 0,
  satirlar: [{
    malzeme: { id: 7, kod: 'ORN-HM-01', ad: 'Örnek çubuk', tur: 'hammadde', birim: 'adet' }, brut: 10, serbest: null, acikSiparis: null, net: null, emniyetPayi: null,
    ihtiyacTarihi: '2030-01-05', eksikTarihi: null, emirler: ['ORN-E1'], acilanlar: [], acildi: false,
  }],
};
const ekran = (mrpGorur: boolean) => [{ yol: '/e/:id', ekran: () => <EmirFisleri emirId={3} emirNo="ORN-E1" mrpGorur={mrpGorur} /> }];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Emrin fişleri (3175)', () => {
  it('yeni emirde emir fişi numarasıyla, ambar ve teslim "ilk harekette açılır", rezerve "ayrılan yok"; liste boş', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/uretim-emirleri/3/fisler': () => json(200, cevap(false)) });
    ac(ekran(false), '/e/3');
    const kartlar = await screen.findByRole('region', { name: 'Emrin fişleri' });
    expect(within(kartlar).getAllByRole('button')).toHaveLength(6);
    expect(within(kartlar).getByText('UG-000100')).toBeTruthy();
    expect(within(kartlar).getAllByText('İlk harekette açılır')).toHaveLength(4);
    expect(within(kartlar).getByText('Ayrılan yok')).toBeTruthy();
    expect(within(kartlar).getAllByText("Logo'ya gitmez")).toHaveLength(6);
    expect(screen.getByText('Bu emrin henüz malzeme hareketi yok.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /MRP/ })).toBeNull();
  });

  it('dolu kart fiş no, satır ve toplam yazar; karta dokununca liste o türe süzülür; kaynak sunucudan', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/uretim-emirleri/3/fisler': () => json(200, cevap(true)) });
    ac(ekran(false), '/e/3');
    const sarf = await screen.findByRole('button', { name: /Sarf.*SR-000101/ });
    expect(sarf.textContent).toContain('1 satır · 4 adet');
    expect(sarf.textContent).toContain("Logo'da");
    const tablo = screen.getByRole('table', { name: 'ORN-E1 malzeme hareketleri' });
    expect(within(tablo).getAllByRole('row')).toHaveLength(5);
    expect(tablo.textContent).toContain('Terminal');
    expect(tablo.textContent).toContain('Elle');
    fireEvent.click(sarf);
    expect(sarf.getAttribute('aria-pressed')).toBe('true');
    expect(within(screen.getByRole('table', { name: 'ORN-E1 malzeme hareketleri' })).getAllByRole('row')).toHaveLength(2);
  });

  it('rezerve kartı ayırma ve kaldırmayı nedeniyle gösterir; Logo\'ya gitmez (3179 a)', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/uretim-emirleri/3/fisler': () => json(200, cevap(true)) });
    ac(ekran(false), '/e/3');
    const kartRezerve = await screen.findByRole('button', { name: /Rezerve.*Ayrılan yok/ });
    expect(kartRezerve.textContent).toContain('Ayrılan yok');
    expect(kartRezerve.textContent).toContain("Logo'ya gitmez");
    fireEvent.click(kartRezerve);
    const tablo = screen.getByRole('table', { name: 'ORN-E1 malzeme hareketleri' });
    expect(within(tablo).getAllByRole('row')).toHaveLength(3);
    expect(tablo.textContent).toContain('Ayrıldı · Emir açılışı');
    expect(tablo.textContent).toContain('Kaldırıldı · Emir iptal edildi');
    expect(tablo.textContent).toContain('Sistem');
  });

  it('MRP fişi yalnız planlama okuyana; açılınca hesap tablosu gelir, null bilinmiyor diye çizgi', async () => {
    const istekler = sunucuKur(OKUYUCU, {
      'GET /stok/uretim-emirleri/3/fisler': () => json(200, cevap(false)),
      'GET /plan/uretim-emirleri/3/mrp': () => json(200, mrp),
    });
    ac(ekran(true), '/e/3');
    const kartMrp = await screen.findByRole('button', { name: /MRP/ });
    expect(kartMrp.textContent).toContain("Logo'ya gitmez");
    fireEvent.click(kartMrp);
    const tablo = await screen.findByRole('table', { name: 'ORN-E1 MRP fişi' });
    expect(tablo.textContent).toContain('ORN-HM-01');
    expect(tablo.textContent).toContain('—');
    expect(istekler.some((i) => i.yol === '/plan/uretim-emirleri/3/mrp')).toBe(true);
  });

  it('okuma reddedilirse ileti çıkar, kart uydurulmaz', async () => {
    sunucuKur(OKUYUCU, { 'GET /stok/uretim-emirleri/3/fisler': () => json(403, { kod: 'YETKI_YOK', mesaj: 'Stok okuma yetkiniz yok.' }) });
    ac(ekran(false), '/e/3');
    await screen.findByText('Stok okuma yetkiniz yok.');
    expect(screen.queryByRole('region', { name: 'Emrin fişleri' })).toBeNull();
  });
});
