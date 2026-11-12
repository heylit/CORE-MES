import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
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
  // 3039: emrin canlı hâli başlıktaki durum rozetinde ve dört özet kutusundadır (Sağlam / emir adedi, Rota ilerlemesi, Şu an, Son hareket).
  const kutu = (baslik: string) => {
    const k = within(screen.getByRole('group', { name: 'Emrin özeti' })).getByText(baslik).closest('.tc-emir-ozet')!;
    return { deger: k.querySelector('.tc-emir-ozet-deger')?.textContent, alt: k.querySelector('.tc-emir-ozet-alt')?.textContent ?? null };
  };
  const saat = (z: string) => new Date(z).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
  const ilerleme = (durum: 'calisiyor' | 'bekliyor'): EmirAyrintiCevabi['ilerleme'] => ({
    esas: 'adim', rota: 0, adimlar: [{ opNo: 10, ad: 'Tornalama', dal: null, durum, hedef: 10, yapilan: 4, yuzde: 40 }],
  });

  async function ayrintiAc(emir: Emir, ek: Partial<EmirAyrintiCevabi> = {}) {
    sunucuKur(OKUYUCU, { [`GET /uretim-emirleri/${emir.id}`]: () => ayrinti(emir, ek) });
    ac(ekran, `/uretim-emirleri/${emir.id}`);
    await screen.findByRole('heading', { name: emir.emirNo });
  }

  it('çalışıyor: rozet, sayaçlar; duruş satırı yok', async () => {
    await ayrintiAc(basladi(1, { ...CANLI, hurda: 2 }), { ilerleme: ilerleme('calisiyor') });
    expect(screen.getByText('Başladı · Çalışıyor')).toBeTruthy();
    expect(kutu('Sağlam / emir adedi')).toEqual({ deger: '4 / 10', alt: 'Hurda 2' });
    expect(kutu('Şu an')).toEqual({ deger: 'OP 10 Tornalama', alt: 'Çalışıyor · 4 / 10' });
    expect(screen.queryByText(/Durdu:/)).toBeNull();
  });

  it('duraklı: rozet duraklı; neden yok', async () => {
    await ayrintiAc(basladi(2, { ...CANLI, calisma: 'durakli', durusBaslangic: '2026-10-06T10:30:00+00:00' }), { ilerleme: ilerleme('calisiyor') });
    expect(screen.getByText('Başladı · Duraklı')).toBeTruthy();
    expect(screen.queryByText(/Durdu:/)).toBeNull();
  });

  it('durdu: neden ve başlangıç görünür', async () => {
    const z = '2026-10-06T10:30:00+00:00';
    await ayrintiAc(basladi(3, { ...CANLI, calisma: 'durdu', durusNedeni: { id: 1, ad: 'Takım kırıldı' }, durusBaslangic: z }), { ilerleme: ilerleme('calisiyor') });
    expect(screen.getByText('Başladı · Durdu')).toBeTruthy();
    expect(kutu('Şu an').alt).toBe(`Durdu: Takım kırıldı · ${saat(z)}`);
  });

  it('bitmiş: sağlam adet, hurda ve fark; çalışma durumu yok', async () => {
    await ayrintiAc({
      ...basladi(4, { ...CANLI, calisma: null, saglam: 12, hurda: 3 }), durum: 'bitti', bitis: '2026-10-06T11:00:00+00:00', saglamAdet: 12,
    });
    expect(screen.getByText('Üretimi bitti', { selector: '.tc-rozet' })).toBeTruthy();
    expect(kutu('Sağlam / emir adedi')).toEqual({ deger: '12 / 10', alt: 'Hurda 3' });
    expect(kutu('Şu an')).toEqual({ deger: 'Bütün adımlar bitti', alt: 'Emir adedinden 2 fazla' });
  });

  it('planlı: sayaç ve duruş yok, sağlam adet "—"', async () => {
    await ayrintiAc({ ...TEMEL, id: 5, emirNo: 'UE-000005', durum: 'planli' });
    expect(screen.getByText('Planlı', { selector: '.tc-rozet' })).toBeTruthy();
    expect(kutu('Sağlam / emir adedi')).toEqual({ deger: '— / 10', alt: null });
  });

  it('adımlar salt okunur gösterilir; tamamlayan ve saat notta; adımsız emirde bölüm yok', async () => {
    const adimlar: EmirAdimi[] = [
      { id: 1, sira: 1, ad: 'Ölçü kontrol', aciklama: 'Kumpasla', asama: 'uretim', tamam: true, tamamlayan: { id: 5, ad: 'Deneme Operator' }, tamamlanma: '2026-10-06T09:30:00+00:00', kanit: null, gecenNot: null, buNot: null, talimat: null },
      { id: 2, sira: 2, ad: 'Yüzey kontrol', aciklama: null, asama: 'uretim', tamam: false, tamamlayan: null, tamamlanma: null, kanit: null, gecenNot: null, buNot: null, talimat: null },
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
    // 3039: kayıt defteri "Kayıtlar" sekmesindedir.
    fireEvent.click(screen.getByRole('tab', { name: 'Kayıtlar' }));
    const defter = within(screen.getByRole('table', { name: 'Kayıt defteri' }));
    const hucre = (olay: string, baslik: string, sira = 0) =>
      defter.getAllByText(olay)[sira]!.closest('tr')!.querySelector(`td[data-baslik="${baslik}"]`)?.textContent;
    expect(hucre('Hurda', 'Adet')).toBe('+2');
    expect(hucre('Hurda', 'Neden')).toBe('Ölçü dışı');
    expect(hucre('Düzeltme', 'Adet', 0)).toBe('-3');
    expect(hucre('Düzeltme', 'Adet', 1)).toBe('+5');
    expect(hucre('Düzeltme', 'Neden')).toBe('—Girilmemiş');
    expect(hucre('Durduruldu', 'Neden')).toBe('Takım kırıldı');
    expect(hucre('Durduruldu', 'Adet')).toBe('—Girilmemiş');
    expect(hucre('Bitirildi', 'Adet')).toBe('9');
    expect(hucre('Başlatıldı', 'Adet')).toBe('—Girilmemiş');
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
    // 3039: liste "Sağlam / adet" sütunudur; hurda yanında.
    const saglam = (no: string) => satir(no).querySelector('td[data-baslik="Sağlam / adet"]')?.textContent;
    expect(saglam('UE-000001')).toBe('4 / 10 (hurda 2)');
    expect(saglam('UE-000002')).toBe('7 / 10');
    expect(saglam('UE-000004')).toBe('9 / 10');
    expect(within(satir('UE-000001')).getByText('Başladı · Çalışıyor')).toBeTruthy();
    expect(within(satir('UE-000002')).getByText('Başladı · Duraklı')).toBeTruthy();
    expect(within(satir('UE-000003')).getByText('Başladı · Durdu')).toBeTruthy();
    expect(within(satir('UE-000004')).getByText('Üretimi bitti')).toBeTruthy();
  });
});
