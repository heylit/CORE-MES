import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen, within } from '@testing-library/react';
import type { Canli, Emir, EmirAyrintiCevabi, EmirlerCevabi, EmirAdimi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { EmirAyrintisi } from './EmirAyrintisi.tsx';
import { UretimEmirleri } from './UretimEmirleri.tsx';
import { OKUYUCU, ac, json, sunucuKur } from './test-ortak.tsx';

const IST = { id: 3, ad: 'Deneme Tezgah 1' };
const TEMEL = {
  parcaNo: 'DNM-001', parcaAd: 'Deneme mil', adet: 10, istasyon: IST, acan: { id: 7, ad: 'Deneme Planlamaci' },
  acilma: '2026-10-06T08:00:00+00:00', baslama: null, bitis: null, iptal: null, saglamAdet: null, canli: null,
} satisfies Omit<Emir, 'id' | 'emirNo' | 'durum'>;
const CANLI = { calisma: 'calisiyor', saglam: 4, hurda: 0, durusNedeni: null, durusBaslangic: null } satisfies Canli;
const basladi = (id: number, canli: Canli): Emir => ({
  ...TEMEL, id, emirNo: `UE-00000${id}`, durum: 'basladi', baslama: '2026-10-06T09:00:00+00:00', canli,
});

const ekran = [{ yol: '/uretim-emirleri', ekran: UretimEmirleri }, { yol: '/uretim-emirleri/:id', ekran: EmirAyrintisi }];
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('Ayrıntı: canlı durum, adımlar, yeni defter olayları', () => {
  const ayrinti = (emir: Emir, ek: Partial<EmirAyrintiCevabi> = {}) =>
    json(200, { emir, kayitlar: [], adimlar: [], ...ek } satisfies EmirAyrintiCevabi);
  const deger = (ad: string) => screen.getByText(ad, { selector: 'dt' }).nextElementSibling?.textContent;

  async function ayrintiAc(emir: Emir, ek: Partial<EmirAyrintiCevabi> = {}) {
    sunucuKur(OKUYUCU, { [`GET /uretim-emirleri/${emir.id}`]: () => ayrinti(emir, ek) });
    ac(ekran, `/uretim-emirleri/${emir.id}`);
    await screen.findByText(emir.emirNo);
  }

  it('çalışıyor: rozet, sayaçlar; duruş satırı yok', async () => {
    await ayrintiAc(basladi(1, { ...CANLI, hurda: 2 }));
    expect(deger('Durum')).toBe('Çalışıyor');
    expect(deger('Sağlam adet')).toBe('4');
    expect(deger('Hurda')).toBe('2');
    expect(screen.queryByText('Duruş nedeni')).toBeNull();
    expect(screen.queryByText('Duruş başlangıcı')).toBeNull();
  });

  it('duraklı: başlangıç saati ham, neden yok', async () => {
    const saat = '2026-10-06T10:30:00+00:00';
    await ayrintiAc(basladi(2, { ...CANLI, calisma: 'durakli', durusBaslangic: saat }));
    expect(deger('Durum')).toBe('Duraklı');
    expect(deger('Duruş başlangıcı')).toBe(new Date(saat).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }));
    expect(screen.queryByText('Duruş nedeni')).toBeNull();
  });

  it('durdu: neden ve başlangıç görünür', async () => {
    await ayrintiAc(basladi(3, {
      ...CANLI, calisma: 'durdu', durusNedeni: { id: 1, ad: 'Takım kırıldı' }, durusBaslangic: '2026-10-06T10:30:00+00:00',
    }));
    expect(deger('Durum')).toBe('Durdu');
    expect(deger('Duruş nedeni')).toBe('Takım kırıldı');
    expect(deger('Duruş başlangıcı')).toBe(new Date('2026-10-06T10:30:00+00:00').toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' }));
  });

  it('bitmiş: sağlam adet, hurda ve fark; çalışma durumu yok', async () => {
    await ayrintiAc({
      ...basladi(4, { ...CANLI, calisma: null, saglam: 12, hurda: 3 }), durum: 'bitti', bitis: '2026-10-06T11:00:00+00:00', saglamAdet: 12,
    });
    expect(deger('Durum')).toBe('Bitti');
    expect(deger('Sağlam adet')).toBe('12');
    expect(deger('Hurda')).toBe('3');
    expect(deger('Fark')).toBe('Emir adedinden 2 fazla');
  });

  it('planlı: sayaç ve duruş satırı yok, sağlam adet "yok"', async () => {
    await ayrintiAc({ ...TEMEL, id: 5, emirNo: 'UE-000005', durum: 'planli' });
    expect(deger('Durum')).toBe('Planlı');
    expect(deger('Sağlam adet')).toBe('yok');
    expect(screen.queryByText('Hurda', { selector: 'dt' })).toBeNull();
  });

  it('adımlar salt okunur gösterilir; tamamlayan ve saat notta; adımsız emirde bölüm yok', async () => {
    const adimlar: EmirAdimi[] = [
      { id: 1, sira: 1, ad: 'Ölçü kontrol', aciklama: 'Kumpasla', tamam: true, tamamlayan: { id: 5, ad: 'Deneme Operator' }, tamamlanma: '2026-10-06T09:30:00+00:00' },
      { id: 2, sira: 2, ad: 'Yüzey kontrol', aciklama: null, tamam: false, tamamlayan: null, tamamlanma: null },
    ];
    await ayrintiAc(basladi(6, CANLI), { adimlar });
    const grup = screen.getByRole('group', { name: 'Talimat adımları' });
    const kutular = within(grup).getAllByRole('checkbox');
    expect(kutular.map((k) => k.getAttribute('aria-checked'))).toEqual(['true', 'false']);
    expect(kutular.every((k) => k.getAttribute('aria-disabled') === 'true')).toBe(true);
    expect(within(grup).getByText(/Deneme Operator · /)).toBeTruthy();
    expect(within(grup).getByText('1 / 2 tamamlandı')).toBeTruthy();
    cleanup();
    await ayrintiAc(basladi(7, CANLI), { adimlar: [] });
    expect(screen.queryByRole('group', { name: 'Talimat adımları' })).toBeNull();
    expect(screen.queryByText('Bu emirde adım yok')).toBeNull();
  });

  it('defter: hurda +N ve nedeni, düzeltme işaretli, bitişte sağlam adet, duruş nedeni', async () => {
    const kisi = { id: 5, ad: 'Deneme Operator' };
    const k = (id: number, olay: EmirAyrintiCevabi['kayitlar'][number]['olay'], ek: object = {}) => ({
      id, emirId: 8, kisi, istasyon: IST, olay, saglamAdet: null, adet: null, durusNedeni: null, hurdaNedeni: null,
      zaman: `2026-10-06T09:0${id}:00+00:00`, ...ek,
    });
    await ayrintiAc(basladi(8, CANLI), {
      kayitlar: [
        k(1, 'baslat'),
        k(2, 'hurda', { adet: 2, hurdaNedeni: { id: 1, ad: 'Ölçü dışı' } }),
        k(3, 'duzeltme', { adet: -3 }),
        k(4, 'duzeltme', { adet: 5 }),
        k(5, 'durdur', { durusNedeni: { id: 2, ad: 'Takım kırıldı' } }),
        k(6, 'bitir', { saglamAdet: 9 }),
      ],
    });
    const defter = within(screen.getByRole('table', { name: 'Kayıt defteri' }));
    const hucre = (olay: string, baslik: string, sira = 0) =>
      defter.getAllByText(olay)[sira]!.closest('tr')!.querySelector(`td[data-baslik="${baslik}"]`)?.textContent;
    expect(hucre('Hurda', 'Adet')).toBe('+2');
    expect(hucre('Hurda', 'Neden')).toBe('Ölçü dışı');
    expect(hucre('Düzeltme', 'Adet', 0)).toBe('-3');
    expect(hucre('Düzeltme', 'Adet', 1)).toBe('+5');
    expect(hucre('Düzeltme', 'Neden')).toBe('yok');
    expect(hucre('Durduruldu', 'Neden')).toBe('Takım kırıldı');
    expect(hucre('Durduruldu', 'Adet')).toBe('yok');
    expect(hucre('Bitirildi', 'Adet')).toBe('9');
    expect(hucre('Başlatıldı', 'Adet')).toBe('yok');
  });
});

describe('Liste: canlı sayaç ve çalışma rozeti', () => {
  it('başlamışta canlı sayaç ve hurda, duraklı/durmuş ayrı rozet; bitmişte kapanış adedi', async () => {
    const emirler: Emir[] = [
      basladi(1, { ...CANLI, saglam: 4, hurda: 2 }),
      basladi(2, { ...CANLI, calisma: 'durakli', saglam: 7, durusBaslangic: '2026-10-06T10:00:00+00:00' }),
      basladi(3, { ...CANLI, calisma: 'durdu', saglam: 1, durusNedeni: { id: 1, ad: 'Arıza' }, durusBaslangic: '2026-10-06T10:00:00+00:00' }),
      { ...basladi(4, { ...CANLI, calisma: null, saglam: 9 }), durum: 'bitti', saglamAdet: 9 },
    ];
    sunucuKur(OKUYUCU, { 'GET /uretim-emirleri': () => json(200, { emirler } satisfies EmirlerCevabi) });
    ac(ekran, '/uretim-emirleri');
    await screen.findByText('UE-000001');
    const satir = (no: string) => screen.getByText(no).closest('tr')!;
    const saglam = (no: string) => satir(no).querySelector('td[data-baslik="Sağlam adet"]')?.textContent;
    expect(saglam('UE-000001')).toBe('4 (hurda 2)');
    expect(saglam('UE-000002')).toBe('7');
    expect(saglam('UE-000004')).toBe('9');
    expect(within(satir('UE-000001')).getByText('Çalışıyor')).toBeTruthy();
    expect(within(satir('UE-000002')).getByText('Duraklı')).toBeTruthy();
    expect(within(satir('UE-000003')).getByText('Durdu')).toBeTruthy();
    expect(within(satir('UE-000004')).getByText('Bitti')).toBeTruthy();
  });
});
