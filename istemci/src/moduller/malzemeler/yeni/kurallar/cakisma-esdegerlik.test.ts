import { describe, expect, test } from 'vitest';
import { ORNEK_AYAR } from '../ornek-veri.ts';
import type { KartKaydi } from '../tipler.ts';
import { ortamKur } from '../veri.ts';
import { malzemeYetkisi } from '../yetki.ts';
import { benzerKartlar, cakismaBosAlanlari, kuralBaglami, newDraft, type KuralBaglami } from './index.ts';

// 1879: ayarda çakışma alanı seçiliyken ekran ve sunucu aynı kartları "aynı" sayar. Aynı örnek tablosu sunucuda
// `sunucu/moduller/malzemeler/cakisma-kurali.test.ts` içinde `katalogKuralAnahtari` ile sınanır; biri değişirse öteki de değişir.
// Veri sentetiktir (kalite K1/K2, adlar "Deneme"); varsayılan kural örneklerinde ekranın kalite tablosundaki genel C45 kullanılır.

type Kart = Partial<KartKaydi> & { tur: string };
const HM = (ek: Partial<KartKaydi> = {}): Kart => ({
  tur: 'hammadde', fam: 'metal', grade: 'K1', form: 'cubuk', dims: { d: 20, l: 3000 }, opts: { durum: 'D1', yuzey: 'Y1' },
  com: { ad: 'Deneme bir' } as KartKaydi['com'], g: {}, ...ek,
});
const HMV = (ek: Partial<KartKaydi> = {}): Kart => HM({ grade: 'C45', cls: 'islah', ...ek });
const ORNEKLER: { ad: string; alanlar: string[]; a: Kart; b: Kart; sonuc: 'ayni' | 'farkli' | 'denetimsiz' }[] = [
  { ad: 'kalite, form, ölçü: yalnız adı farklı kart aynı', alanlar: ['_kalite', '_form', '_olcu'], a: HM(), b: HM({ com: { ad: 'Deneme iki' } as KartKaydi['com'] }), sonuc: 'ayni' },
  { ad: 'ölçü binde bire yuvarlanır', alanlar: ['_kalite', '_olcu'], a: HM(), b: HM({ dims: { d: 20.0004, l: 3000 } }), sonuc: 'ayni' },
  { ad: 'ölçüde noktalama karışmaz (12,5 ile 1,25)', alanlar: ['_olcu'], a: HM({ dims: { d: 12.5, l: 3000 } }), b: HM({ dims: { d: 1.25, l: 3000 } }), sonuc: 'farkli' },
  { ad: 'aynı sayılar başka formda farklı ölçüdür', alanlar: ['_olcu'], a: HM(), b: HM({ form: 'altigen', dims: { s: 20, l: 3000 } }), sonuc: 'farkli' },
  { ad: 'farklı kalite', alanlar: ['_kalite', '_form', '_olcu'], a: HM(), b: HM({ grade: 'K2' }), sonuc: 'farkli' },
  {
    ad: 'özel kalite kodu harf ve noktalama farkı yok sayılarak', alanlar: ['_kalite'],
    a: HM({ grade: '__ozel', custom: { kod: 'OZ-1', ad: 'Deneme A' } as KartKaydi['custom'] }),
    b: HM({ grade: '__ozel', custom: { kod: 'oz 1', ad: 'Deneme B' } as KartKaydi['custom'] }), sonuc: 'ayni',
  },
  { ad: 'durum farkı', alanlar: ['_kalite', '_durum'], a: HM(), b: HM({ opts: { durum: 'D2', yuzey: 'Y1' } }), sonuc: 'farkli' },
  { ad: 'yüzey aynı', alanlar: ['_yuzey'], a: HM(), b: HM({ opts: { durum: 'D2', yuzey: 'y 1' } }), sonuc: 'ayni' },
  { ad: 'yalnız kart adı seçiliyse kalite ve ölçüsü aynı, adı farklı kart çakışmaz', alanlar: ['_ad'], a: HM(), b: HM({ com: { ad: 'Deneme iki' } as KartKaydi['com'] }), sonuc: 'farkli' },
  { ad: 'eksik ölçülü kart denetlenmez', alanlar: ['_kalite', '_olcu'], a: HM({ dims: { d: 20 } }), b: HM({ dims: { d: 20 } }), sonuc: 'denetimsiz' },
  { ad: 'boş durumlu kart denetlenmez', alanlar: ['_durum'], a: HM({ opts: {} }), b: HM({ opts: {} }), sonuc: 'denetimsiz' },
  { ad: 'başka türde g alanı okunur', alanlar: ['musteri'], a: { tur: 'mamul', g: { musteri: 'M-1' }, com: { ad: 'Deneme' } as KartKaydi['com'] }, b: { tur: 'mamul', g: { musteri: 'm1' }, com: { ad: 'Deneme 2' } as KartKaydi['com'] }, sonuc: 'ayni' },
  // Varsayılan kural seçim olarak (1879): değeri kartın varsayılan anahtarıdır; kalite tablodaki bir kalite olmalı (ekran kaliteyi tablodan okur).
  { ad: 'varsayılan ve kart adı: ikisi de aynıysa aynı', alanlar: ['_varsayilan', '_ad'], a: HMV(), b: HMV(), sonuc: 'ayni' },
  { ad: 'varsayılan ve kart adı: adı farklıysa farklı', alanlar: ['_varsayilan', '_ad'], a: HMV(), b: HMV({ com: { ad: 'Deneme iki' } as KartKaydi['com'] }), sonuc: 'farkli' },
  { ad: 'varsayılan ve kart adı: ölçüsü farklıysa farklı', alanlar: ['_varsayilan', '_ad'], a: HMV(), b: HMV({ dims: { d: 25, l: 3000 } }), sonuc: 'farkli' },
  { ad: 'varsayılanın ölçüsünde noktalama karışmaz', alanlar: ['_varsayilan', '_ad'], a: HMV({ dims: { d: 12.5, l: 3000 } }), b: HMV({ dims: { d: 125, l: 3000 } }), sonuc: 'farkli' },
  { ad: 'varsayılan anahtarı kurulamayan kart denetlenmez', alanlar: ['_varsayilan', '_ad'], a: HMV({ grade: null }), b: HMV({ grade: null }), sonuc: 'denetimsiz' },
  { ad: 'mamulde varsayılan ve kart adı', alanlar: ['_varsayilan', '_ad'], a: { tur: 'mamul', g: { resim: 'R-1' }, com: { ad: 'Deneme' } as KartKaydi['com'] }, b: { tur: 'mamul', g: { resim: 'r1' }, com: { ad: 'deneme' } as KartKaydi['com'] }, sonuc: 'ayni' },
];

function baglam(tur: string, alanlar: string[]): KuralBaglami {
  const ortam = ortamKur({ ...ORNEK_AYAR, malzeme: { ...(ORNEK_AYAR.malzeme as object), kurallar: { [tur]: { cakisma: alanlar } } } });
  return kuralBaglami({ ortam, kartlar: [], kisi: { id: 1, ad: 'Deneme' }, birim: 'met', yetki: malzemeYetkisi(() => true, ortam) });
}

const kart = (b: KuralBaglami, k: Kart, id: string): KartKaydi => ({ ...(newDraft(b) as KartKaydi), ...k, id } as KartKaydi);

describe('1879 çakışma kuralı, ekran tarafı', () => {
  for (const o of ORNEKLER) {
    test(o.ad, () => {
      const b = baglam(o.a.tur, o.alanlar);
      const a = kart(b, o.a, 'a');
      const x = kart(b, o.b, 'x');
      const ayni = benzerKartlar(a, [x], b).some((r) => r.seviye === 'ayni');
      const bos = cakismaBosAlanlari(a, b);
      expect(o.sonuc === 'denetimsiz' ? bos.length > 0 && !ayni : ayni === (o.sonuc === 'ayni') && bos.length === 0).toBe(true);
    });
  }
});
