import { describe, expect, test } from 'vitest';
import { FAMS, GA, HZ_KAT, M_ISLEM } from './durum.ts';
import { newDraft } from './taslak.ts';
import { optStatus } from './uyumluluk.ts';

const metal = () => FAMS.metal!.classes;
const taslak = (cls: string, grade: string, form: string | null = 'cubuk') => ({ ...newDraft(), fam: 'metal', cls, grade, form });
// Sihirbaz "no" alan seçeneği gizler; görünmesi için durumun "no" dönmemesi gerekir.
const gorunur = (cls: string, grade: string, k: string, v: string, form: string | null = 'cubuk') => optStatus(k, v, taslak(cls, grade, form)).s !== 'no';

describe('3294: metal durum ve işlem listeleri', () => {
  test.each([
    ['174PH', 'Çökelme sertleştirilmiş (H1000)'],
    ['155PH', 'Çökelme sertleştirilmiş (H1000)'],
    ['174PH', 'Çökelme sertleştirilmiş (H1150D)'],
    ['174PH', 'Çökelme sertleştirilmiş (H1025)']
  ] as const)('%s kalitesinde "%s" sihirbazda görünür', (grade, v) => {
    expect(gorunur('paslanmaz', grade, 'durum', v)).toBe(true);
  });

  test.each([
    ['islah', '42CRMO4', 'Islah + soğuk çekilmiş (+QT+C)'],
    ['islah', 'C45', 'Yumuşak tavlı + soğuk çekilmiş (+A+C)'],
    ['aluminyum', '7075', 'T7651'],
    ['aluminyum', '6082', 'T6510'],
    ['aluminyum', '2024', 'T851'],
    ['paslanmaz', '304', 'Tavlanmış + soğuk çekilmiş (+AT+C)'],
    ['paslanmaz', '431', 'Islah (+QT900)'],
    ['dokme', 'GJS600', 'İndüksiyonla sertleştirilmiş']
  ] as const)('%s %s: 3246 ve 3294 durumu "%s" kalite izninde', (cls, grade, v) => {
    expect(gorunur(cls, grade, 'durum', v)).toBe(true);
  });

  test('kalite izin listesindeki her durum kendi sınıfının listesinde var (yoksa hiç çıkmaz)', () => {
    const sinifi = new Map(Object.entries(metal()).flatMap(([ck, c]) => c.grades.map(g => [g.kod, ck] as const)));
    const eksik: string[] = [];
    for (const [kod, izin] of Object.entries(GA['metal']!['durum']!)) {
      const ck = sinifi.get(kod);
      if (!ck || !izin.a) continue;
      for (const d of izin.a) if (!metal()[ck]!.durum!.includes(d)) eksik.push(`${kod}: ${d}`);
    }
    expect(eksik).toEqual([]);
  });

  test('sınıf durum listeleri tekrar etmez; PH koşulları sayı sırasında', () => {
    for (const [ck, c] of Object.entries(metal())) expect(new Set(c.durum).size, ck).toBe(c.durum!.length);
    const h = metal()['paslanmaz']!.durum!.filter(d => /^Çökelme sertleştirilmiş \(H\d/.test(d)).map(d => Number(/H(\d+)/.exec(d)![1]));
    expect(h).toEqual([...h].sort((a, b) => a - b));
    const al = metal()['aluminyum']!.durum!;
    expect(al.indexOf('T7351')).toBeLessThan(al.indexOf('T7451'));
    expect(al.indexOf('T6')).toBeLessThan(al.indexOf('T651'));
  });

  test('işlem listesi tekrar etmez ve önceki değerleri korur (kayıtlı kart seçtiği metni saklar)', () => {
    expect(new Set(M_ISLEM).size).toBe(M_ISLEM.length);
    for (const v of ['Gerilim giderme', 'Islah', 'Sementasyon', 'Nitrasyon', 'Pasivasyon', 'Fosfatlama', 'Sert krom', 'Kimyasal nikel', 'Toz boya', 'Sert eloksal']) {
      expect(M_ISLEM).toContain(v);
    }
  });

  test.each([
    ['aluminyum', '6061', 'Eloksal (Tip II, sülfürik)', true],
    ['islah', 'C45', 'Eloksal (Tip II, sülfürik)', false],
    ['islah', '42CRMO4', 'Plazma nitrürleme', true],
    ['aluminyum', '6061', 'Plazma nitrürleme', false],
    ['karbon', 'S355', 'Sıcak daldırma galvaniz', true],
    ['aluminyum', '6061', 'Sıcak daldırma galvaniz', false],
    ['islah', '4340', 'Hidrojen gevrekliği giderme', true],
    ['titanyum', 'GR5', 'Mikro ark oksidasyon (MAO)', true],
    ['paslanmaz', '316L', 'Mikro ark oksidasyon (MAO)', false]
  ] as const)('%s %s: işlem "%s" görünür mü: %s', (cls, grade, v, beklenen) => {
    expect(gorunur(cls, grade, 'islem', v)).toBe(beklenen);
  });

  test('17-7PH koşulları yalnız 17-7PH kalitesinde; ekstrüzyon temperi levhada uyumsuz', () => {
    expect(gorunur('paslanmaz', '177PH', 'durum', 'Çökelme sertleştirilmiş (TH1050)')).toBe(true);
    expect(gorunur('paslanmaz', '410', 'durum', 'Çökelme sertleştirilmiş (TH1050)')).toBe(false);
    expect(gorunur('aluminyum', '7075', 'durum', 'T73511', 'levha')).toBe(false);
  });

  test('ısıl işlem ve yüzey hizmetlerinde yeni çeşitler var; çeşit kodu kategoride tektir', () => {
    const ad = (k: string) => HZ_KAT[k]!.cesitler!.map(c => c.ad);
    expect(ad('isil')).toEqual(expect.arrayContaining(['Tavlama ve normalizasyon', 'Vakum sertleştirme', 'Çökelme sertleştirme (paslanmaz, süper alaşım)']));
    expect(ad('yuzey')).toEqual(expect.arrayContaining(['Sert krom kaplama', 'Sıcak daldırma galvaniz', 'Fosfat kaplama']));
    for (const [k, kat] of Object.entries(HZ_KAT)) {
      const kodlar = kat.cesitler!.map(c => c.kod).filter(x => x !== kat.kod);
      expect(new Set(kodlar).size, k).toBe(kodlar.length);
    }
  });
});
