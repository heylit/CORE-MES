import { beforeEach, describe, expect, test, vi } from 'vitest';
import { ORNEK_AYAR } from '../ornek-veri.ts';
import type { KartKaydi, KatalogKarti } from '../tipler.ts';
import { ortamKur } from '../veri.ts';
import { malzemeYetkisi } from '../yetki.ts';
import { kuralBaglami, newDraft } from '../kurallar/index.ts';
import { duzenlemeTaslagi, kopyaTaslagi } from './acilis.ts';

// 3633: standardı hiç seçilmemiş eski kart, düzenleme, kopya ve yerel taslak geri yüklemede varsayılan "astm" almaz.
function baglam() {
  const ortam = ortamKur(ORNEK_AYAR);
  return kuralBaglami({ ortam, kartlar: [], kisi: { id: 1, ad: 'Deneme' }, birim: 'met', yetki: malzemeYetkisi(() => true, ortam) });
}
function kart(standart: 'astm' | 'en' | null): KatalogKarti {
  const b = baglam();
  const kayit = { ...(newDraft(b) as KartKaydi), fam: 'metal', cls: 'islah', grade: 'C45', form: 'cubuk', dims: { d: 50, l: 1000 }, id: 'k1' } as KartKaydi;
  const x = kayit as unknown as Record<string, unknown>;
  if (standart === null) delete x['standart']; else x['standart'] = standart;
  return { kimlik: 'k1', no: 1, surum: 1, kayit };
}

describe('standardı seçilmemiş eski kart korunur', () => {
  test('kopya taslağı eski karta standart eklemez, seçilmiş kartın değerini korur', () => {
    const b = baglam();
    expect(kopyaTaslagi(kart(null), b).taslak.standart).toBeUndefined();
    expect(kopyaTaslagi(kart('en'), b).taslak.standart).toBe('en');
    expect(kopyaTaslagi(kart('astm'), b).taslak.standart).toBe('astm');
  });
  test('düzenleme taslağı eski karta standart eklemez', () => {
    const b = baglam();
    expect(duzenlemeTaslagi(kart(null), b).taslak.standart).toBeUndefined();
    expect(duzenlemeTaslagi(kart('en'), b).taslak.standart).toBe('en');
  });
});

describe('yerel taslak geri yükleme', () => {
  beforeEach(() => { vi.resetModules(); });
  // Yeni ekran tarayıcı deposunu değil bellek deposunu kullanır (kurallar/cekirdek/ortam.ts); modül yüklenirken oradaki taslak okunur.
  async function yukle(D: Record<string, unknown>) {
    const ortam = await import('../kurallar/cekirdek/ortam.ts');
    ortam.localStorage.setItem('malzeme-katalog-taslak-v1', JSON.stringify({ D, step: 2 }));
    const m = await import('../kurallar/cekirdek/durum.ts');
    return { D: m.D as unknown as Record<string, unknown>, adim: m.step };
  }
  test('standart alanı olmayan eski taslak öyle kalır', async () => {
    const eski = { ...newDraft(baglam()) } as Record<string, unknown>;
    delete eski['standart'];
    const r = await yukle(eski);
    expect(r.adim).toBe(2);
    expect(r.D['standart']).toBeUndefined();
  });
  test('seçilmiş standart geri yüklenir', async () => {
    const r = await yukle({ ...newDraft(baglam()), standart: 'en' });
    expect(r.adim).toBe(2);
    expect(r.D['standart']).toBe('en');
  });
});
