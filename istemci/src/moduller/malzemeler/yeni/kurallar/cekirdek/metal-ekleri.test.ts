import { describe, expect, test } from 'vitest';
import { AUST, CASE_H, CAST, CFORM, DUPLEX, FAMS, FERRO_SS, GA, HARDEN, HM_GRUP, TABAN } from './durum.ts';
import { METAL_EK_GRUP } from './metal-ekleri.ts';
import { newDraft } from './taslak.ts';
import { optStatus } from './uyumluluk.ts';

const metal = () => FAMS.metal!.classes;

describe('3246: metal sınıf, kalite ve durum ekleri', () => {
  test('metal ailesinde her kalite kodu tektir (kart kaliteyi aile + kod ile bulur)', () => {
    const gorulen = new Map<string, string>();
    for (const [ck, c] of Object.entries(metal())) {
      for (const g of c.grades) {
        expect(gorulen.get(g.kod), `${g.kod}: ${ck} ve ${gorulen.get(g.kod)}`).toBeUndefined();
        gorulen.set(g.kod, ck);
      }
    }
  });

  test('her metal kalitesinin yoğunluğu var ve makul aralıkta (ham ağırlığı buradan hesaplanır)', () => {
    for (const c of Object.values(metal())) {
      for (const g of c.grades) {
        const ro = g.p['ro'];
        expect(typeof ro === 'number' && ro > 1 && ro < 20, `${g.kod} ro=${String(ro)}`).toBe(true);
      }
    }
  });

  test('var olan kodlar yerinde kalır (yalnız ekleme)', () => {
    const kod = (ck: string) => metal()[ck]!.grades.map(g => g.kod);
    expect(kod('islah')).toEqual(expect.arrayContaining(['C45', '42CRMO4', '4130']));
    expect(kod('paslanmaz')).toEqual(expect.arrayContaining(['304', '304L', '174PH', '155PH', '138MO']));
    expect(kod('aluminyum')).toEqual(expect.arrayContaining(['6061', '7075', '7050']));
    expect(kod('wha')).toEqual(['W90', 'W95', 'W97']);
  });

  test('yeni sınıfların stok kodu grubu, form listesi ve kalitesi var; grup kodu başka sınıfla çakışmaz', () => {
    const tumGruplar = Object.values(HM_GRUP).flatMap(a => Object.values(a));
    for (const [ck, grup] of Object.entries(METAL_EK_GRUP)) {
      expect(metal()[ck]?.grades.length, ck).toBeGreaterThan(0);
      expect(HM_GRUP['metal']![ck]).toBe(grup);
      expect(tumGruplar.filter(x => x === grup)).toHaveLength(1);
      expect(CFORM[ck]?.length, ck).toBeGreaterThan(0);
    }
    expect(TABAN.HM_GRUP['metal']!['magnezyum']).toBe('MAG');
  });

  test('PH paslanmazda Condition A (+AT) ve H durumları seçilebilir; izin listesindeki her durum sınıfta var', () => {
    const durum = metal()['paslanmaz']!.durum!;
    for (const d of ['Çökelme sertleştirilmiş (H925)', 'Çökelme sertleştirilmiş (H1000)', 'Çökelme sertleştirilmiş (H1075)', 'Çökelme sertleştirilmiş (H1150M)']) {
      expect(durum).toContain(d);
    }
    const izin = GA['metal']!['durum']!;
    expect(izin['138MO']!.a).toContain('Çökelme sertleştirilmiş (H1000)');
    expect(izin['174PH']!.a).toContain('Çözeltiye alınmış (+AT)');
    for (const ph of ['174PH', '155PH', '138MO']) {
      for (const d of izin[ph]!.a!) expect(durum, `${ph}: ${d}`).toContain(d);
    }
  });

  test('alüminyumda yeni temper durumları listede ve tekrar etmez', () => {
    const durum = metal()['aluminyum']!.durum!;
    expect(durum).toEqual(expect.arrayContaining(['T3511', 'T76', 'T7651', 'T851', 'H19']));
    expect(new Set(durum).size).toBe(durum.length);
  });

  // Kurallar (EN 10228-4, ferrit ölçümü, MT, ıslah, indüksiyon, sementasyon, döküm) kaliteyi bu kümelerden tanır; eksik kod yanlış ret verir.
  test.each([
    ['AUST', AUST, ['4306', '304H', '347', '309', '314', '4435', '316LVM', '904L', 'XM19', 'S21800', 'CF8', 'CF8M']],
    ['DUPLEX', DUPLEX, ['2304', '2101']],
    ['FERRO_SS', FERRO_SS, ['155PH', '138MO', '410', '4028', '4034', '430F', '440B', '440C', '4122', '4313', '4418', '177PH', '3CR12', 'CA6NM']],
    ['CASE_H', CASE_H, ['C15', '8620', '17NICRMO64', '2162']],
    ['HARDEN', HARDEN, ['C35', 'C60', '34CRMO4', '30CRNIMO8', '36CRNIMO4', '42CRMOS4', '35S20', '44SMN28', '31CRMOV9', '34CRALNI7', '41CRALMO7', '100CRMO73', '60SICR7', '55SI7', '54SICR6', 'C75S',
      '2080', '2363', '2343', '2367', '2312', '2316', '2085', '2436', '2601', '2714', '2767', '1730', '3243', '3247', '410', '4028', '4034', '440B', '440C', '4122', '4313', '4418',
      'GJS450', 'GJS800', 'GJS40018', 'G42CRMO4', 'CA6NM']],
    ['CAST', CAST, ['GJL150', 'GJL350', 'GJS40018', 'GJS450', 'GJS800', 'GJV400', 'GJV450', 'ADI800', 'ADI1050', 'GJMW400', 'NIRESD2', 'AC42000', 'AC42200', 'AC44200', 'AC45000', 'AC47100',
      'AC51300', 'AC21000', 'CC483K', 'CC480K', 'CC491K', 'GP240GH', 'G20MN5', 'G42CRMO4', 'CF8', 'CF8M', 'CA6NM', 'AZ91D', 'ZP3', 'ZP5', 'ZA27']]
  ] as const)('%s kümesi yeni kodları tanır ve yalnız var olan metal kalitelerini içerir', (_ad, kume, kodlar) => {
    const metalKodlari = new Set(Object.values(metal()).flatMap(c => c.grades.map(g => g.kod)));
    for (const k of kodlar) {
      expect(kume.has(k), k).toBe(true);
      expect(metalKodlari.has(k), k).toBe(true);
    }
  });

  test('östenitik ve dupleks kümeleri ayrık; ferromanyetik paslanmaz östenitik sayılmaz', () => {
    for (const k of AUST) {
      expect(DUPLEX.has(k), String(k)).toBe(false);
      expect(FERRO_SS.has(k), String(k)).toBe(false);
    }
  });

  // Davranış: kural, yeni kaliteyi kendi türüne göre değerlendirir (küme eksikse burada yanlış ret çıkar).
  const taslak = (cls: string, grade: string) => ({ ...newDraft(), fam: 'metal', cls, grade, form: 'cubuk' });
  test.each([
    ['paslanmaz', '904L', 'test', 'Ferrit ölçümü'],
    ['paslanmaz', '2304', 'test', 'Ferrit ölçümü'],
    ['paslanmaz', '440C', 'test', 'Manyetik parçacık (MT)'],
    ['celikdokum', 'CA6NM', 'test', 'Manyetik parçacık (MT)'],
    ['islah', '34CRMO4', 'islem', 'Islah'],
    ['islah', '8620', 'islem', 'Sementasyon']
  ] as const)('%s %s: %s "%s" reddedilmez', (cls, grade, k, v) => {
    expect(optStatus(k, v, taslak(cls, grade)).s).not.toBe('no');
  });

  test('karşı örnek: ferromanyetik olmayan 904L için MT reddedilir', () => {
    expect(optStatus('test', 'Manyetik parçacık (MT)', taslak('paslanmaz', '904L')).s).toBe('no');
  });
});
