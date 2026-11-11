import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ORNEK_AYAR, ORNEK_KARTLAR } from '../ornek-veri.ts';
import { kuralBaglami, type KuralBaglami } from '../kurallar/index.ts';
import type { KartKaydi, KatalogKarti } from '../tipler.ts';
import { ortamKur } from '../veri.ts';
import { malzemeYetkisi } from '../yetki.ts';
import { QrPenceresi, okunanKart } from './Saha.tsx';

afterEach(() => { cleanup(); });

// 2917 B3: Malzemeler'deki "QR okut" Etiket Merkezi'nin malzeme etiketini (MLZ:<kart no>) tanır.
const KARTLAR: KatalogKarti[] = ORNEK_KARTLAR.satirlar.flatMap((s) => (s.kayit ? [{ kimlik: s.kimlik, no: s.no, surum: s.surum, kayit: s.kayit as unknown as KartKaydi }] : []));

function baglam(): KuralBaglami {
  const ortam = ortamKur(ORNEK_AYAR);
  return kuralBaglami({ ortam, kartlar: KARTLAR, kisi: { id: 1, ad: 'Deneme' }, birim: 'met', yetki: malzemeYetkisi(() => true, ortam) });
}

describe('QR okut: okunan metinden kart', () => {
  const b = baglam();
  const kodu = (metin: string) => okunanKart(metin, KARTLAR, b)?.com.kod ?? null;

  test('MLZ etiketi kart numarasıyla eşleşir; küçük harf, boşluk ve Türkçe Q klavye (Ş) okutması da', () => {
    expect(kodu('MLZ:2')).toBe('SF-GEN-00001');
    expect(kodu('mlz: 1')).toBe('HM-MET-C45-0001');
    expect(kodu('MLZŞ1')).toBe('HM-MET-C45-0001');
  });

  test('listede olmayan kart numarası eşleşmez (reddedilen)', () => {
    expect(okunanKart('MLZ:999', KARTLAR, b)).toBeNull();
  });

  test('MLZ sayı taşımıyorsa bugünkü arama sürer: kart kodu ve MK: öneki', () => {
    expect(okunanKart('MLZ:abc', KARTLAR, b)).toBeNull();
    expect(kodu('HM-MET-C45-0001')).toBe('HM-MET-C45-0001');
    expect(kodu('MK:SF-GEN-00001')).toBe('SF-GEN-00001');
  });
});

describe('QR okut penceresi', () => {
  test('okutulan MLZ etiketi kartın saha görünümünü açar; tanınmayan etiket eşleşmedi der', () => {
    const bulundu = vi.fn();
    render(<QrPenceresi kartlar={KARTLAR} b={baglam()} kapat={() => {}} bulundu={bulundu} />);
    const alan = screen.getByLabelText('Kod');
    fireEvent.change(alan, { target: { value: 'MLZ:2' } });
    fireEvent.submit(alan.closest('form')!);
    expect(bulundu).toHaveBeenCalledWith('mornek2');
    fireEvent.change(alan, { target: { value: 'MLZ:999' } });
    fireEvent.submit(alan.closest('form')!);
    expect(bulundu).toHaveBeenCalledTimes(1);
    expect(screen.getByText('MLZ:999')).toBeTruthy();
  });
});
