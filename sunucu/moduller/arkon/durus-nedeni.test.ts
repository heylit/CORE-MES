import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  IS_DEGISIMI, durusToplamlari, enCokPlansiz, isDegisiminiDurusSay, nedenAdi, nedenToplamlari, nedenToplamlariniBirlestir, paretoSatirlari, type DurusParcasi,
} from '../../../arkon/web/src/data/durus-nedeni.ts';

const DK = 60_000;
const planliMi = (kod: string): boolean => kod === 'MOLA';
const adi = (kod: string): string | null => ({ ARIZA: 'Arıza', MOLA: 'Mola' } as Record<string, string>)[kod] ?? null;

describe('Arkon duruş nedeni dağılımı: nedeni belirsiz ayrı görünür', () => {
  it('nedensiz duruş ayrı anahtarda toplanır; başka nedene eklenmez, atılmaz', () => {
    const parcalar: DurusParcasi[] = [
      { f: 0, t: 10 * DK, s: 'stopped', n: 'ARIZA' },
      { f: 10 * DK, t: 14 * DK, s: 'stopped', n: null },
      { f: 14 * DK, t: 15 * DK, s: 'stopped', n: '' },
      { f: 15 * DK, t: 16 * DK, s: 'stopped' },
    ];
    assert.deepEqual(nedenToplamlari(parcalar), {
      ARIZA: { ms: 10 * DK, n: 1 },
      '—': { ms: 6 * DK, n: 3 },
    });
  });

  it('nedensiz duraklatma da nedensiz satıra girer; çalışan parça girmez', () => {
    const parcalar: DurusParcasi[] = [
      { f: 0, t: 5 * DK, s: 'paused', n: null },
      { f: 5 * DK, t: 6 * DK, s: 'running', n: null },
      { f: 6 * DK, t: 8 * DK, s: 'stopped', n: 'ARIZA' },
      { f: 8 * DK, t: 9 * DK, s: 'stopped', n: null },
    ];
    assert.deepEqual(nedenToplamlari(parcalar), { '—': { ms: 6 * DK, n: 2 }, ARIZA: { ms: 2 * DK, n: 1 } });
  });

  it('nedeni olan duraklatma kendi nedeninde kalır', () => {
    assert.deepEqual(nedenToplamlari([{ f: 0, t: 3 * DK, s: 'paused', n: 'MOLA' }]), { MOLA: { ms: 3 * DK, n: 1 } });
  });

  it('pareto: nedensiz satır "Nedeni belirsiz" adıyla ayrı durur ve plansız sayılır', () => {
    const satirlar = paretoSatirlari({ ARIZA: { ms: 10 * DK, n: 1 }, '—': { ms: 20 * DK, n: 2 }, MOLA: { ms: 5 * DK, n: 1 } }, adi, planliMi);
    assert.deepEqual(satirlar, [
      { k: '—', l: 'Nedeni belirsiz', ms: 20 * DK, n: 2, p: false },
      { k: 'ARIZA', l: 'Arıza', ms: 10 * DK, n: 1, p: false },
      { k: 'MOLA', l: 'Mola', ms: 5 * DK, n: 1, p: true },
    ]);
  });

  it('istasyonların toplamları neden başına birleşir', () => {
    const birlesik = nedenToplamlariniBirlestir([{ '—': { ms: DK, n: 1 }, ARIZA: { ms: DK, n: 1 } }, { '—': { ms: 2 * DK, n: 1 } }]);
    assert.deepEqual(birlesik, { '—': { ms: 3 * DK, n: 2 }, ARIZA: { ms: DK, n: 1 } });
  });

  it('en çok duruş nedeni yalnız duruşlardan okunur: duraklatma sıralamayı etkilemez', () => {
    const parcalar: DurusParcasi[] = [
      { f: 0, t: 50 * DK, s: 'paused', n: null },
      { f: 50 * DK, t: 55 * DK, s: 'stopped', n: 'ARIZA' },
    ];
    assert.equal(enCokPlansiz(durusToplamlari(parcalar), planliMi), 'ARIZA');
    assert.equal(enCokPlansiz(durusToplamlari([{ f: 0, t: DK, s: 'stopped', n: null }]), planliMi), '—');
    assert.equal(enCokPlansiz({ MOLA: { ms: DK, n: 1 } }, planliMi), null);
  });

  it('ekran adı: nedensiz anahtar etiket alır, bilinmeyen kod olduğu gibi kalır', () => {
    assert.equal(nedenAdi('—', adi), 'Nedeni belirsiz');
    assert.equal(nedenAdi('ARIZA', adi), 'Arıza');
    assert.equal(nedenAdi('X-9', adi), 'X-9');
  });
});

// Kullanıcı kararı (soru 33/50): iş değişiminde makine boşta kalırsa geçen süre "İş değişimi" nedeniyle plansız duruştur; makinede
// başka iş sürüyorsa duruş değildir.
describe('Arkon iş değişimi duraklatması', () => {
  it('makine boşta kaldığı süre İş değişimi duruşudur; elle duraklatma ve çalışma değişmez', () => {
    const parcalar: DurusParcasi[] = [
      { f: 0, t: 10 * DK, s: 'running', n: null },
      { f: 10 * DK, t: 25 * DK, s: 'paused', n: IS_DEGISIMI },
      { f: 25 * DK, t: 40 * DK, s: 'running', n: null },
      { f: 40 * DK, t: 45 * DK, s: 'paused', n: null },
    ];
    const sonuc = isDegisiminiDurusSay(parcalar);
    assert.deepEqual(sonuc.map((x) => x.s), ['running', 'stopped', 'running', 'paused']);
    assert.deepEqual(durusToplamlari(sonuc), { [IS_DEGISIMI]: { ms: 15 * DK, n: 1 } });
    assert.equal(enCokPlansiz(durusToplamlari(sonuc), planliMi), IS_DEGISIMI);
    assert.equal(nedenAdi(IS_DEGISIMI, adi), 'İş değişimi');
  });

  it('yeni iş hemen başlarsa duruş kalmaz: zaman çizgisinde duraklatma parçası oluşmaz', () => {
    const parcalar: DurusParcasi[] = [
      { f: 0, t: 10 * DK, s: 'running', n: null },
      { f: 10 * DK, t: 20 * DK, s: 'running', n: null },
    ];
    assert.deepEqual(durusToplamlari(isDegisiminiDurusSay(parcalar)), {});
  });
});
