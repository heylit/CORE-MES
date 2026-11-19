import { afterEach, describe, expect, test } from 'vitest';
import { FAMS } from './durum.ts';
import { MA_BOS, malzemeAyarUygula } from './malzeme-ayarlari.ts';
import { kimyasalStandartlari, mekanikStandartlari, varsayilanStandart } from './metal-standartlari.ts';
import { standartlariDoldur } from './standartlar.ts';
import { newDraft } from './taslak.ts';
import { optStatus } from './uyumluluk.ts';

const sinif = (k: string) => FAMS.metal!.classes[k]!;
const taslak = (cls: string, grade: string, form: string | null) => ({ ...newDraft(), fam: 'metal', cls, grade, form });

afterEach(() => { malzemeAyarUygula(MA_BOS()); });

describe('3436: metal sınıflarında kimyasal ve mekanik standart', () => {
  test('alüminyumda kimyasal EN 573-3, mekanik forma göre ayrı standart', () => {
    const c = sinif('aluminyum');
    expect(kimyasalStandartlari(c)[0]).toBe('EN 573-3');
    expect(mekanikStandartlari(c, 'cubuk')[0]).toBe('EN 755-2');
    expect(mekanikStandartlari(c, 'levha')[0]).toBe('EN 485-2');
    expect(mekanikStandartlari(c, 'tel')[0]).toBe('EN 1301-2');
    expect(mekanikStandartlari(c, 'disk')).toContain('EN 586-2');
    expect(mekanikStandartlari(c, 'cubuk')).not.toContain('EN 485-2');
  });

  test('paslanmazda kimyasal EN 10088-1; levha -2, çubuk -3', () => {
    const c = sinif('paslanmaz');
    expect(kimyasalStandartlari(c)[0]).toBe('EN 10088-1');
    expect(mekanikStandartlari(c, 'levha')[0]).toBe('EN 10088-2');
    expect(mekanikStandartlari(c, 'altigen')[0]).toBe('EN 10088-3');
  });

  test('her standartlı sınıfın sihirbaz listesi (mekstd) form listelerinin birleşimi', () => {
    for (const [k, c] of Object.entries(FAMS.metal!.classes)) {
      if (!c.mekform) continue;
      const birlesim = new Set(Object.values(c.mekform as Record<string, string[]>).flat());
      expect(new Set(c.mekstd as string[]), k).toEqual(birlesim);
      expect(kimyasalStandartlari(c).length, k).toBeGreaterThan(0);
    }
  });

  test('varsayılan kalitenin ana standardıdır; eski EN 10083 adı EN ISO 683 adına gider', () => {
    const islah = sinif('islah');
    const kStd = (c: ReturnType<typeof sinif>, kod: string) => c.grades.find(g => g.kod === kod)?.std;
    expect(varsayilanStandart(kimyasalStandartlari(islah), kStd(islah, '42CRMO4'))).toBe('EN ISO 683-2');
    expect(varsayilanStandart(kimyasalStandartlari(islah), kStd(islah, 'C45'))).toBe('EN ISO 683-1');
    const karbon = sinif('karbon');
    expect(varsayilanStandart(mekanikStandartlari(karbon, 'levha'), kStd(karbon, 'S690QL'))).toBe('EN 10025-6');
    expect(varsayilanStandart(['A', 'B'], 'yok')).toBe('A');
  });

  test('forma uymayan mekanik standart uyumsuz, formun varsayılanı yaygın seçimdir', () => {
    expect(optStatus('mekstd', 'EN 485-2', taslak('aluminyum', '6082', 'cubuk')).s).toBe('no');
    expect(optStatus('mekstd', 'EN 755-2', taslak('aluminyum', '6082', 'cubuk')).s).toBe('rec');
    expect(optStatus('mekstd', 'EN 754-2', taslak('aluminyum', '6082', 'cubuk')).s).toBe('ok');
    // Form seçilmemişken süzgeç yok.
    expect(optStatus('mekstd', 'EN 485-2', taslak('aluminyum', '6082', null)).s).not.toBe('no');
  });
});

describe('3436: yeni kartta standart kendiliğinden seçilir', () => {
  test('boş alanlar sınıf, kalite ve forma göre dolar', () => {
    const d = standartlariDoldur(taslak('aluminyum', '6082', 'cubuk'));
    expect(d.opts['kimstd']).toBe('EN 573-3');
    expect(d.opts['mekstd']).toBe('EN 755-2');
  });

  test('kalitenin kendi standardı listenin ilki değilse o seçilir', () => {
    const d = standartlariDoldur(taslak('islah', '42CRMO4', 'cubuk'));
    expect(kimyasalStandartlari(sinif('islah'))[0]).not.toBe('EN ISO 683-2');
    expect(d.opts['kimstd']).toBe('EN ISO 683-2');
    expect(d.opts['mekstd']).toBe('EN ISO 683-2');
  });

  test('form değişince kendiliğinden seçilen mekanik standart yenisiyle değişir', () => {
    const d = standartlariDoldur(taslak('aluminyum', '6082', 'cubuk'));
    d.form = 'levha';
    standartlariDoldur(d, { cls: 'aluminyum', form: 'cubuk', grade: '6082' });
    expect(d.opts['mekstd']).toBe('EN 485-2');
  });

  test('elle seçilen standart form değişince korunur (uyumsuzluk uyarısı verir)', () => {
    const d = standartlariDoldur(taslak('aluminyum', '6082', 'cubuk'));
    d.opts['mekstd'] = 'EN 754-2';
    d.form = 'levha';
    standartlariDoldur(d, { cls: 'aluminyum', form: 'cubuk', grade: '6082' });
    expect(d.opts['mekstd']).toBe('EN 754-2');
    expect(optStatus('mekstd', 'EN 754-2', d).s).toBe('no');
  });

  test('kayıtlı kart (id) ve metal dışı aile değişmez', () => {
    const kayitli = { ...taslak('aluminyum', '6082', 'cubuk'), id: 'mornek1' };
    expect(standartlariDoldur(kayitli).opts['kimstd']).toBeUndefined();
    const plastik = { ...newDraft(), fam: 'plastik', cls: 'muh', grade: 'PA6', form: 'cubuk' };
    expect(standartlariDoldur(plastik).opts['kimstd']).toBeUndefined();
  });
});

describe('3436: ayardaki standart listeleri', () => {
  test('form grubu listesinden kapatılan standart o formlarda ve birleşimde görünmez, eklenen görünür', () => {
    malzemeAyarUygula({ ...MA_BOS(), listeler: { 'std|metal|aluminyum|cubuk': { gizle: ['EN 754-2'], ekle: ['ORN-STD 1'] }, 'std|metal|aluminyum|kim': { ekle: ['ORN-STD 2'] } } });
    const c = sinif('aluminyum');
    for (const f of ['cubuk', 'altigen', 'lama']) {
      expect(mekanikStandartlari(c, f)).not.toContain('EN 754-2');
      expect(mekanikStandartlari(c, f)).toContain('ORN-STD 1');
    }
    // Boru listesinde EN 754-2 kalır; birleşimde de görünür.
    expect(mekanikStandartlari(c, 'boru')).toContain('EN 754-2');
    expect(c.mekstd as string[]).toContain('ORN-STD 1');
    expect(kimyasalStandartlari(c)).toContain('ORN-STD 2');
    expect(kimyasalStandartlari(sinif('paslanmaz'))).not.toContain('ORN-STD 2');
  });
});
