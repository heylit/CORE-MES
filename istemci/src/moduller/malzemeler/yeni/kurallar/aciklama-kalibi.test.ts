import { describe, expect, test } from 'vitest';
import { ORNEK_AYAR } from '../ornek-veri.ts';
import type { KartKaydi } from '../tipler.ts';
import { ortamKur } from '../veri.ts';
import { malzemeYetkisi } from '../yetki.ts';
import { aciklamaSigmayan, hammaddeJetonlari, kartOzeti, kuralBaglami, newDraft, type KuralBaglami } from './index.ts';

// 3476-2: hammaddede açıklama kalıbı aile seçeneklerini de yazar; sınıra sığmayan seçim söylenir.
function baglam(uzunluk: number, ac?: string[]): KuralBaglami {
  const ayar = { ...ORNEK_AYAR, genel: { ...ORNEK_AYAR.genel, acUzunluk: uzunluk }, malzeme: { ...ORNEK_AYAR.malzeme, ...(ac ? { kurallar: { hammadde: { ac } } } : {}) } };
  const ortam = ortamKur(ayar as typeof ORNEK_AYAR);
  return kuralBaglami({ ortam, kartlar: [], kisi: { id: 1, ad: 'D' }, birim: 'met', yetki: malzemeYetkisi(() => true, ortam) });
}
function kart(b: KuralBaglami): KartKaydi {
  const d = newDraft(b) as KartKaydi;
  return {
    ...d, fam: 'metal', cls: 'al7', grade: '7075', form: 'levha', dims: { t: 20, w: 1000, l: 2000 }, tol: 'EN 485-4',
    opts: { durum: 'T651', uretim: 'Haddelenmiş', islem: ['Gerilim giderme'], kesim: ['Testere kesim'], ut: 'Class A', test: ['Sertlik', 'Çekme'], ambalaj: 'Sandık' },
    com: { ...d.com, sertifika: ['EN 10204 3.1'] },
  } as unknown as KartKaydi;
}

describe('3476-2 hammadde açıklama kalıbı', () => {
  test('yer tutucu listesi kartın alanlarını ve aile seçeneklerini taşır', () => {
    const b = baglam(50);
    const k = hammaddeJetonlari(b.t.FAMS).map(([x]) => x);
    for (const x of ['kalite', 'olcu', 'sertifika', 'durum', 'ut', 'ambalaj', 'koruma']) expect(k).toContain(x);
  });

  test('kalıp seçenekleri yazar: ambalaj otomatik satırda yokken kalıpla gelir', () => {
    const b = baglam(200, ['', '', '{sertifika}; UT {ut}; {ambalaj}']);
    expect(kartOzeti(kart(b), b).aciklama_3).toBe('EN 10204 3.1; UT Class A; Sandık');
  });

  test('kalıp kartın kendi alanlarını ve çoklu seçimin bütün değerlerini yazar', () => {
    const b = baglam(200, ['{kalite} {form} {olcu}', '{std}; {tol}', '{test}; {islem}']);
    const o = kartOzeti(kart(b), b);
    expect([o.aciklama_1, o.aciklama_2, o.aciklama_3]).toEqual(['EN AW-7075 levha 20×1000×2000 mm', 'EN 573-3; EN 485-4', 'Sertlik, Çekme; Stress relieving']);
  });

  test('3633: durum ve işlem açıklamaya kartın seçtiği standardın adıyla yazılır; kart değeri değişmez', () => {
    const b = baglam(200, ['{durum}; {islem}', '', '']);
    const k = kart(b);
    k.opts = { ...k.opts, durum: 'Gerilim giderilmiş', islem: ['Islah (+QT)'] } as typeof k.opts;
    expect(kartOzeti(k, b).aciklama_1).toBe('Stress relieved; Quenched and tempered');
    const en = { ...k, standart: 'en' } as KartKaydi;
    expect(kartOzeti(en, b).aciklama_1).toBe('+SR; +QT');
    expect(en.opts).toEqual(k.opts);
  });

  test('kaydedilen otomatik satır sınırda kesilir; sığmayan seçim satıra girmez', () => {
    const b = baglam(50);
    const ac = kartOzeti(kart(b), b).aciklama_3 ?? '';
    expect(ac.length).toBeLessThanOrEqual(50);
    expect(ac).toBe('EN 573-3; EN 485-4; EN 10204 3.1; UT Class A');
    expect(ac).not.toContain('Sertlik');
  });

  test('50 karakterde düşen testler söylenir; sınır genişse düşen yok', () => {
    const dar = baglam(50);
    expect(aciklamaSigmayan(kart(dar), dar)[2]).toEqual(['Sertlik', 'Çekme']);
    const genis = baglam(200);
    expect(aciklamaSigmayan(kart(genis), genis)).toEqual([[], [], []]);
  });

  test('elle yazılan satırda sığmayan aranmaz', () => {
    const b = baglam(50);
    const k = kart(b);
    k.acManual = [false, false, true];
    expect(aciklamaSigmayan(k, b)[2]).toEqual([]);
  });
});
