import { describe, expect, it } from 'vitest';
import { yeniAdim, type Adim, type Malzeme, type Operasyon } from './kurallar.ts';
import { benzerUrun, eslesenSozcuk, katalogSuresi, onerilenler, sablonAdimlari, sablonuYerlestir, type RotaSablonu } from './sablonSecimi.ts';

// Uydurma şablon, kart ve operasyonlar (gerçek veri değil).
const sablon = (id: number, ad: string, ek: Partial<RotaSablonu> = {}): RotaSablonu => ({
  id, ad, varsayilan: false, surum: 1, aciklama: null, oneriSozcukleri: [], aktif: true, kullanim: { revizyon: 0, son: null },
  adimlar: [
    { sira: 2, operasyonTipi: { id: 22, kod: 'TOR', ad: 'Tornalama', aktif: true }, ad: 'Tornalama' },
    { sira: 1, operasyonTipi: { id: 21, kod: 'KES', ad: 'Kesim', aktif: true }, ad: 'Kesim' },
  ],
  ...ek,
});
const op = (id: string, ek: Partial<Operasyon> = {}): Operasyon => ({
  id, code: `OP${id}`, abbr: null, name: `Operasyon ${id}`, group: 'KES', groupName: 'Kesim', stationId: '31', setup: 10, cycle: 3, aktif: true, ...ek,
});
const malzeme = (id: string, name: string): Malzeme => ({
  id, kayitNo: Number(id), code: `ORN-${id}`, name, type: 'mamul', unit: 'adet', cost: null, stock: null, min: null, aktif: true,
  kategori: null, kategoriAdi: null, girdiOlabilir: true,
});
const adim = (id: string, seq: number, ek: Partial<Adim> = {}): Adim => ({ ...yeniAdim(op('21'), id), seq, opNo: seq, ...ek });

describe('3273 a: şablon önerisi', () => {
  it('öneri sözcüğü büyük-küçük harf ve Türkçe harf farkına bakmadan eşleşir', () => {
    expect(eslesenSozcuk({ oneriSozcukleri: ['MİL'] }, 'Orn mil uzun')).toBe('MİL');
    expect(eslesenSozcuk({ oneriSozcukleri: ['flanş'] }, 'ORN-FLANS kapak')).toBe('flanş');
    expect(eslesenSozcuk({ oneriSozcukleri: ['MIL'] }, 'Emilim parçası')).toBeNull();
  });
  it('sıra: eşleşen, sonra çok kullanılan, sonra varsayılan; kullanımdan kalkan önerilmez', () => {
    const l = [
      sablon(1, 'Varsayılan', { varsayilan: true }),
      sablon(2, 'Çok kullanılan', { kullanim: { revizyon: 7, son: null } }),
      sablon(3, 'Mil', { oneriSozcukleri: ['MİL'] }),
      sablon(4, 'Kalkmış mil', { oneriSozcukleri: ['MİL'], aktif: false }),
    ];
    const o = onerilenler(l, 'ORN mil');
    expect(o.map((x) => x.sablon.id)).toEqual([3, 2]);
    expect(o.map((x) => x.neden)).toEqual(['adında "MİL" geçiyor', '7 rotada kullanıldı']);
    expect(onerilenler(l, 'başka', 9).map((x) => x.sablon.id)).toEqual([2, 1, 3]);
  });
  it('benzer ürün: rotası olan ve adı en çok ortak sözcük taşıyan; yoksa null', () => {
    const hedef = malzeme('1', 'Mil uzun kapak');
    const adaylar = [hedef, malzeme('2', 'Mil kısa'), malzeme('3', 'Mil uzun'), malzeme('4', 'Mil uzun kapak boş')];
    const adimSayisi = (id: string) => (id === '4' ? 0 : 2);
    expect(benzerUrun(hedef, adaylar, adimSayisi)?.urun.id).toBe('3');
    expect(benzerUrun(malzeme('9', 'Pul'), adaylar, adimSayisi)).toBeNull();
  });
});

describe('3273 a: şablondan adım', () => {
  let n = 0;
  const kimlik = () => `y-${String(++n)}`;
  it('adımlar sırayla gelir; istasyon ve süre katalogdan, adı şablondan; katalogda olmayan tip eklenmez', () => {
    const ops = new Map([['21', op('21', { stationId: '40', setup: 5, cycle: 2 })]]);
    const { adimlar, eksik } = sablonAdimlari(sablon(1, 'S'), (id) => ops.get(id), kimlik);
    expect(adimlar.map((a) => [a.opId, a.name, a.stationId, a.setup, a.proc, a.opNo])).toEqual([['21', 'Kesim', '40', 5, 2, null]]);
    expect(eksik).toEqual(['Tornalama']);
  });
  it('katalog süresi tahmini işaretlenir; süre yoksa sıfır gösterilmez', () => {
    expect(katalogSuresi(op('1', { setup: 5, cycle: 2 }))).toBe('hazırlık 5 dk, işlem 2 dk (katalogdan, tahmini)');
    expect(katalogSuresi(op('1', { setup: null, cycle: null }))).toBe('katalogda süre yok');
  });
});

describe('3273 a: dolu taslağa yerleştirme', () => {
  const var_ = [adim('a', 10), adim('d1', 20, { dal: 'B' }), adim('b', 30)];
  const yeni = [adim('n1', 0, { opNo: null }), adim('n2', 0, { opNo: null })];
  const sira = (l: Adim[]) => l.map((a) => `${a.id}${a.dal ? `:${a.dal}` : ''}`);
  it('başa, sona (ana hattın sonu), seçili adımdan sonra (onun hattında) ve yerine', () => {
    expect(sira(sablonuYerlestir(var_, yeni, 'basa', null))).toEqual(['n1', 'n2', 'a', 'd1:B', 'b']);
    expect(sira(sablonuYerlestir([adim('a', 10), adim('b', 20), adim('d1', 30, { dal: 'B' })], yeni, 'sona', null))).toEqual(['a', 'b', 'n1', 'n2', 'd1:B']);
    expect(sira(sablonuYerlestir(var_, yeni, 'sonra', 'd1'))).toEqual(['a', 'd1:B', 'n1:B', 'n2:B', 'b']);
    expect(sira(sablonuYerlestir(var_, yeni, 'yerine', 'd1'))).toEqual(['n1', 'n2']);
    expect(sablonuYerlestir(var_, yeni, 'basa', null).map((a) => a.seq)).toEqual([10, 20, 30, 40, 50]);
  });
  it('seçili adım yoksa "sonra" sona düşer', () => {
    expect(sira(sablonuYerlestir(var_, yeni, 'sonra', null))).toEqual(['a', 'd1:B', 'b', 'n1', 'n2']);
  });
});
