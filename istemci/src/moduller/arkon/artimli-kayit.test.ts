import { describe, expect, it } from 'vitest';
import {
  ARTIMLI_PAY_MS, TAM_OKUMA_ARALIGI_MS, artimliVaris, bellegiGuncelle, kayitlariBirlestir, type ImlecliOkuma, type VardiyaBellegi,
} from '../../../../arkon/web/src/data/artimli-kayit.ts';

// Kart 1871: terminal vardiya kayıtlarını artımlı okur; birleşik liste her adımda tam okumayla aynı olmalıdır.
// Sunucu benzetimi: kayıt zamanı (`at`, çevrimdışı kuyrukta 12 saate kadar geride) ile varış anı (`varis`, işlem başı) ayrıdır;
// kayıt `gorunur` anından önce okumada görünmez (işlem henüz bitmedi). Sıra sunucudaki gibi zaman, sonra kimlik.
interface SunucuSatiri { id: number; cid: string; at: number; varis: number; gorunur: number; machine: string }
const DK = 60e3;

function oku(db: readonly SunucuSatiri[], an: number, from: number, to: number, since: number | null): ImlecliOkuma {
  const rows = db
    .filter((r) => r.gorunur <= an && r.at >= from && r.at < to && r.machine === 'T-01' && (since === null || r.varis >= since))
    .sort((x, y) => x.at - y.at || x.id - y.id)
    .map((r) => ({ cid: r.cid, at: r.at, machine: r.machine }));
  return { rows, at: an, cut: false };
}

describe('Arkon vardiya kayıtları artımlı okunur (1871)', () => {
  const vardiyaBasi = Date.UTC(2026, 10, 2, 6);
  const a = { machine: 'T-01', vardiyaBasi };
  const evAraligi = [vardiyaBasi - 7 * 864e5, vardiyaBasi + 8 * 3600e3] as const;
  const cnAraligi = [vardiyaBasi, vardiyaBasi + 8 * 3600e3] as const;

  it('her yazmadan sonra artımlı birleşim tam okumayla aynıdır (geç gelen çevrimdışı kayıt ve uzun işlem dahil)', () => {
    const db: SunucuSatiri[] = [];
    let id = 0;
    const yaz = (cid: string, at: number, varis: number, gorunur = varis, machine = 'T-01') => db.push({ id: ++id, cid, at, varis, gorunur, machine });
    for (let i = 0; i < 40; i++) yaz(`e${i}`, vardiyaBasi - 3 * 864e5 + i * 3600e3, vardiyaBasi - 3 * 864e5 + i * 3600e3);
    for (let i = 0; i < 20; i++) yaz(`c${i}`, vardiyaBasi + i * DK, vardiyaBasi + i * DK);

    let simdi = vardiyaBasi + 30 * DK;
    let b: VardiyaBellegi | null = null;
    const turla = () => {
      const since = artimliVaris(b, a, simdi);
      b = bellegiGuncelle(b, a, simdi, since !== null,
        oku(db, simdi, evAraligi[0], evAraligi[1], since), oku(db, simdi, cnAraligi[0], cnAraligi[1], since));
      expect(b).not.toBeNull();
      expect(b?.ev).toEqual(oku(db, simdi, evAraligi[0], evAraligi[1], null).rows);
      expect(b?.cn).toEqual(oku(db, simdi, cnAraligi[0], cnAraligi[1], null).rows);
      return since;
    };
    expect(turla()).toBeNull();
    // Olağan sayım; aynı zamanlı iki kayıt; başka istasyonun kaydı; çevrimdışı kuyruktan saatler sonra gelen sayım ve durum kaydı.
    const adimlar: (() => void)[] = [
      () => yaz('c-yeni', simdi - 1000, simdi - 1000),
      () => { yaz('c-es1', simdi - 500, simdi - 500); yaz('c-es2', simdi - 500, simdi - 400); },
      () => yaz('c-baska', simdi - 100, simdi - 100, simdi - 100, 'T-02'),
      () => yaz('c-cevrimdisi', vardiyaBasi + 5 * DK, simdi - 200),
      () => yaz('e-cevrimdisi', vardiyaBasi - 2 * 864e5, simdi - 200),
      // Varışı bir önceki okumadan önce, görünmesi sonra olan kayıt (işlem uzun sürdü): pay bunu yakalar.
      () => yaz('c-uzun', simdi - 2 * DK, simdi - 2 * DK - 30e3, simdi),
    ];
    for (const adim of adimlar) {
      simdi += 20e3;
      adim();
      simdi += 1000;
      expect(turla()).not.toBeNull();
    }
  });

  it('vardiya, makine değişince ya da tam okuma aralığı dolunca tam okur; okuma kesilir ya da imleçsizse bellek düşer', () => {
    const b: VardiyaBellegi = { ...a, ev: [], cn: [], imlec: vardiyaBasi + 10 * DK, tamAn: vardiyaBasi + 10 * DK };
    expect(artimliVaris(b, a, vardiyaBasi + 11 * DK)).toBe(vardiyaBasi + 10 * DK - ARTIMLI_PAY_MS);
    expect(artimliVaris(b, { ...a, machine: 'T-02' }, vardiyaBasi + 11 * DK)).toBeNull();
    expect(artimliVaris(b, { ...a, vardiyaBasi: vardiyaBasi + 8 * 3600e3 }, vardiyaBasi + 11 * DK)).toBeNull();
    expect(artimliVaris(b, a, b.tamAn + TAM_OKUMA_ARALIGI_MS)).toBeNull();
    const tamam: ImlecliOkuma = { rows: [], at: 1, cut: false };
    expect(bellegiGuncelle(b, a, 0, true, { ...tamam, cut: true }, tamam)).toBeNull();
    expect(bellegiGuncelle(b, a, 0, true, tamam, null)).toBeNull();
  });

  it('birleşim yalnız yeni cid ekler, eski sırayı korur ve sınırda en yenileri bırakır', () => {
    const eski = [{ cid: 'a', at: 1 }, { cid: 'b', at: 2 }];
    expect(kayitlariBirlestir(eski, [{ cid: 'b', at: 2 }])).toBe(eski);
    expect(kayitlariBirlestir(eski, [{ cid: 'c', at: 1 }, { cid: 'd', at: 3 }]).map((r) => r['cid'])).toEqual(['a', 'c', 'b', 'd']);
    expect(kayitlariBirlestir(eski, [{ cid: 'd', at: 3 }], 2).map((r) => r['cid'])).toEqual(['b', 'd']);
  });
});
