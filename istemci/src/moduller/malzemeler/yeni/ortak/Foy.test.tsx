import { render, screen, within } from '@testing-library/react';
import { describe, expect, test } from 'vitest';
import { ORNEK_AYAR, ORNEK_KARTLAR } from '../ornek-veri.ts';
import type { KartKaydi, KatalogKarti } from '../tipler.ts';
import { ortamKur } from '../veri.ts';
import { malzemeYetkisi } from '../yetki.ts';
import { foyVerisi, kuralBaglami, newDraft, type KuralBaglami } from '../kurallar/index.ts';
import { Foy } from './Foy.tsx';

const KARTLAR: KatalogKarti[] = ORNEK_KARTLAR.satirlar.flatMap((s) => (s.kayit ? [{ kimlik: s.kimlik, no: s.no, surum: s.surum, kayit: s.kayit as unknown as KartKaydi }] : []));

function baglam(): KuralBaglami {
  const ortam = ortamKur(ORNEK_AYAR);
  return kuralBaglami({ ortam, kartlar: KARTLAR, kisi: { id: 1, ad: 'Deneme' }, birim: 'met', yetki: malzemeYetkisi(() => true, ortam) });
}

function c45(b: KuralBaglami): KartKaydi {
  const d = newDraft(b) as KartKaydi;
  return { ...d, fam: 'metal', cls: 'islah', grade: 'C45', form: 'cubuk', dims: { d: 50, l: 1000 }, com: { ...d.com, sertifika: ['3.1'], not: 'Deneme notu' } };
}

const FIYAT = { kgFiyati: '42.5', birimFiyati: '650', paraBirimi: 'TRY', gecerlilik: '2026-10-01' };

describe('foyVerisi', () => {
  test('hammadde föyü prototipin bölüm sırasıyla; kod ve açıklama bölümü sonda', () => {
    const b = baglam();
    const v = foyVerisi(c45(b), b);
    expect(v.kod).toBe('HM-ISL-00001');
    expect(v.ad).toBe('C45 yuvarlak çubuk Ø50×1000 mm');
    expect(v.bos).toBe(false);
    const basliklar = v.bolumler.map((x) => x.baslik);
    expect(basliklar.slice(0, 3)).toEqual(['Tanım', 'Eşdeğerler ve diğer adlar', 'Form ve ölçüler']);
    expect(basliklar).toContain('Ticari');
    const form = v.bolumler.find((x) => x.baslik === 'Form ve ölçüler');
    expect(form?.satirlar.map((s) => s.ad)).toContain('Parça ağırlığı');
    expect(v.bolumler.find((x) => x.baslik === 'Eşdeğerler ve diğer adlar')?.not).toMatch(/yakın eşdeğer/);
  });

  test('2763: durum ve işlem satırı kartın standardıyla yazılır; öteki listeler ve kart değeri değişmez', () => {
    const b = baglam();
    const d = { ...c45(b), opts: { durum: 'Normalize (+N)', islem: ['Islah'] } } as KartKaydi;
    const satir = (x: KartKaydi) => foyVerisi(x, b).bolumler.find((s) => s.baslik === 'Durum ve işlem')?.satirlar.map((s) => s.deger);
    expect(satir(d)).toEqual(['Normalized (+N)', 'Quench and temper (+QT)']);
    const en = { ...d, standart: 'en' } as KartKaydi;
    expect(satir(en)).toEqual(['+N (Normalized)', '+QT (Quench and temper)']);
    expect(en.opts).toEqual({ durum: 'Normalize (+N)', islem: ['Islah'] });
  });

  test('2763: hizmet föyünde öneri çipinden gelen değer eşli adla, elle yazılan metin olduğu gibi', () => {
    const ortam = ortamKur({ ...ORNEK_AYAR, malzeme: { surum: 1, standartAdlari: { T6: { astm: 'T6-A', en: 'T6-E' } } } });
    const b = kuralBaglami({ ortam, kartlar: KARTLAR, kisi: { id: 1, ad: 'Deneme' }, birim: 'met', yetki: malzemeYetkisi(() => true, ortam) });
    const d = newDraft(b) as KartKaydi;
    const h = (temper: string, standart: string) => ({ ...d, tur: 'hizmet', standart, g: { kat: 'isil', cesit: 'Çözeltiye alma ve yaşlandırma (alüminyum)', temper } }) as unknown as KartKaydi;
    const deger = (x: KartKaydi) => foyVerisi(x, b).bolumler.flatMap((s) => s.satirlar).find((s) => s.ad === 'Hedef temper')?.deger;
    expect(deger(h('T6', 'en'))).toBe('T6-E (T6-A)');
    expect(deger(h('T6', 'astm'))).toBe('T6-A (T6-E)');
    expect(deger(h('Ozel temper', 'en'))).toBe('Ozel temper');
  });

  test('MLZ-7 a (G8): kaliteden dolan teknik özellikler "tipik değer" notuyla gelir', () => {
    const b = baglam();
    const teknik = foyVerisi(c45(b), b).bolumler.find((x) => x.baslik === 'Teknik özellikler');
    expect(teknik?.satirlar.length).toBeGreaterThan(0);
    expect(teknik?.not).toMatch(/tipik değer.*sertifika değeri değildir/);
  });

  test('kısa föy tek bölüm ve ağırlık kutuları; girdi taslağı değişmez', () => {
    const b = baglam();
    const d = c45(b);
    const once = structuredClone(d);
    const v = foyVerisi(d, b, true);
    expect(v.bolumler).toHaveLength(1);
    expect(v.bolumler[0]?.baslik).toBe('');
    expect(v.agirliklar.map((a) => a.ad)).toEqual(['Parça', 'Metre']);
    expect(d).toEqual(once);
  });

  test('aile seçilmemiş taslak boş föy; sarf türü düz satırlardan bölümlenir', () => {
    const b = baglam();
    expect(foyVerisi(newDraft(b) as KartKaydi, b).bos).toBe(true);
    const sarf = foyVerisi(KARTLAR[1]!.kayit, b);
    expect(sarf.tur).toBe('sarf');
    expect(sarf.bolumler[0]?.baslik).toBe('Tanım');
    expect(sarf.bolumler[0]?.satirlar.some((s) => s.ad === 'Kod')).toBe(false);
  });
});

describe('Foy', () => {
  test('kg fiyatı satırları Ticari bölümünde stok biriminden sonra, sertifikalardan önce', () => {
    const b = baglam();
    render(<Foy veri={foyVerisi(c45(b), b)} kgFiyati={FIYAT} />);
    const ticari = within(screen.getByRole('region', { name: 'Ticari' }));
    const adlar = ticari.getAllByRole('term').map((x) => x.textContent);
    const i = adlar.indexOf('Birim fiyat');
    expect(adlar[i - 1]).toBe('Stok birimi');
    expect(adlar[i + 1]).toBe('kg fiyatı (satın alma)');
    expect(adlar[i + 2]).toBe('Sertifikalar');
    expect(ticari.getByText(/01\.10\.2026 itibarıyla/)).toBeTruthy();
  });

  test('fiyatı okuyamayan rolde satır yok; okuyan rolde bilinmeyen fiyat tire', () => {
    const b = baglam();
    const v = foyVerisi(c45(b), b);
    const { unmount } = render(<Foy veri={v} />);
    expect(screen.queryByText('Birim fiyat')).toBeNull();
    unmount();
    render(<Foy veri={v} kgFiyati={null} />);
    const ticari = within(screen.getByRole('region', { name: 'Ticari' }));
    const dt = ticari.getByText('Birim fiyat');
    expect(dt.nextElementSibling?.textContent).toBe('—');
  });

  test('boş taslakta yönlendirici metin', () => {
    const b = baglam();
    render(<Foy veri={foyVerisi(newDraft(b) as KartKaydi, b)} />);
    expect(screen.getByText('Föy, seçimlerini yaptıkça burada oluşur.')).toBeTruthy();
  });
});
