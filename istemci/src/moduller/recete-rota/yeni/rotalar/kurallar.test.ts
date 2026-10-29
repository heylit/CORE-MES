import { describe, expect, it } from 'vitest';
import {
  acikRevizyon, adimArkasinaTasi, adimSartnameKilidi, eklenebilirSartnameler, kapsamaUyar, adimCarpanlari, adimEkle, adimSil, adimSurukle, adimTasi, agacKur, agacUrunleri, akisKarti, bagimlilikYaz, cevrimToplami,
  degisimOrani, fasonaCevir, gkkUyarilari, girdiOlur, girenTekrari, kartBirimi, islemSuresiEksik, istasyonYaz, kaydetGovdesi, kartBasligi, katalogdanFarkli, malzemeAra, malzemeMaliyeti, ortalamaGunSaati,
  operasyonYaz, revizyonlari, rotaEksikleri, rotaFarki, rotaHataMetni, rotaSahibiOlur, sirali, sonrakiBagimlilik, sureGirisi, sureMetni,
  tuketilenAdimlar, yeniAdim, yururlukteki, type Adim, type Malzeme, type Operasyon, type Revizyon,
} from './kurallar.ts';

// Uydurma kartlar ve operasyonlar (gerçek veri değil).
const malzeme = (id: string, type: Malzeme['type'], ek: Partial<Malzeme> = {}): Malzeme => ({
  id, kayitNo: Number(id), code: `K-${id}`, name: `Kart ${id}`, type, unit: 'adet', cost: null, stock: null, min: null, aktif: true,
  kategori: null, kategoriAdi: null, girdiOlabilir: true, ...ek,
});
const op = (id: string, ek: Partial<Operasyon> = {}): Operasyon => ({
  id, code: `OP${id}`, abbr: `A${id}`, name: `Operasyon ${id}`, group: 'KES', groupName: 'Kesim', stationId: '31', setup: 10, cycle: 3, aktif: true, ...ek,
});
const adim = (id: string, seq: number, ek: Partial<Adim> = {}): Adim => ({ ...yeniAdim(op('21'), id), seq, opNo: seq, ...ek });
const rev = (id: string, status: Revizyon['status'], created: number, steps: Adim[] = []): Revizyon => ({
  id, itemId: '11', no: id, status, surum: 1, note: '', created, approvedAt: null,
  data: { base: null, steps: steps.map((s) => ({ ...s, opNo: s.opNo ?? 0 })) },
});
const var_ = () => true;
const opAdi = (id: string) => (id === '21' ? 'Kesim' : null);

describe('süreler', () => {
  it('teorik süre girişi: boş null, virgül ondalık, harf ve eksi reddedilir', () => {
    expect(sureGirisi('', 'islem')).toEqual({ ok: true, deger: null });
    expect(sureGirisi('2,5', 'islem')).toEqual({ ok: true, deger: 2.5 });
    expect(sureGirisi('-1', 'hazirlik')).toMatchObject({ ok: false, deger: null });
    expect(sureGirisi('abc', 'degisim')).toMatchObject({ ok: false });
  });

  it('çevrim işlem ile değişimin toplamıdır; boş alan sıfır uydurmaz, oran işlem yoksa bilinmez', () => {
    expect(cevrimToplami(2, null)).toBe(2);
    expect(cevrimToplami(null, null)).toBe(0);
    expect(degisimOrani(4, 1)).toBe(25);
    expect(degisimOrani(0, 1)).toBeNull();
    expect(degisimOrani(4, null)).toBeNull();
    expect(sureMetni(1.23456, 2)).toBe('1.23');
    expect(sureMetni(null, 2)).toBeNull();
  });
});

describe('rota kuralları', () => {
  it('ilk adım ve bağımsız adım tüketmez; bağımsız adımdan sonraki adım zincirdeki öncekileri tüketir', () => {
    const l = [adim('a', 10), adim('b', 20, { dep: 'bagimsiz' }), adim('c', 30)];
    expect(tuketilenAdimlar(l, 0)).toEqual([]);
    expect(tuketilenAdimlar(l, 1)).toEqual([]);
    expect(tuketilenAdimlar(l, 2).map((x) => x.id)).toEqual(['a', 'b']);
  });

  it('ilk adımda ve bağımsız adımda giren zorunlu; silinmiş karta bağlı giren eksiktir', () => {
    const l = [adim('a', 10), adim('b', 20, { dep: 'bagimsiz', ins: [{ itemId: '99', qty: 1, scrap: 0 }] })];
    const e = rotaEksikleri(l, (id) => id !== '99', opAdi);
    expect(e.map((x) => x.adimId)).toEqual(['a', 'b']);
    expect(e[0]?.metin).toContain('OP 10 Kesim');
    expect(e[1]?.metin).toContain('silinmiş');
    expect(rotaEksikleri([adim('a', 10, { ins: [{ itemId: '1', qty: 1, scrap: 0 }] })], var_, opAdi)).toEqual([]);
  });

  it('1210 b: arkasında GKK kodlu adım olmayan fason adımı uyarılır; son adım fasonsa da uyarılır', () => {
    const fason = { fasonId: '7', stationId: null, machineId: null };
    const kodu = (id: string) => (id === '41' ? 'GKK' : 'TOR');
    const l = [adim('a', 10), adim('b', 20, fason), adim('c', 30, { opId: '41' }), adim('d', 40, fason), adim('e', 50), adim('f', 60, fason)];
    expect(gkkUyarilari(l, kodu, opAdi).map((x) => x.adimId)).toEqual(['d', 'f']);
    expect(gkkUyarilari(l, kodu, opAdi)[0]?.metin).toBe('OP 40 Kesim');
    expect(gkkUyarilari([adim('a', 10), adim('b', 20)], kodu, opAdi)).toEqual([]);
  });

  it('fason olmayan adımda işlem süresi zorunludur; fason adım sayılmaz', () => {
    expect(islemSuresiEksik([adim('a', 10, { proc: 0 })])?.id).toBe('a');
    expect(islemSuresiEksik([adim('a', 10, { proc: null, stationId: null, fasonId: '5' })])).toBeNull();
    expect(islemSuresiEksik([adim('a', 10, { proc: 1 })])).toBeNull();
  });

  it('fire payı önceki adımları büyütür; bilinmeyen birim maliyet toplamı bilinmez yapar', () => {
    expect(adimCarpanlari([adim('a', 10), adim('b', 20, { rejectPct: 50 })])).toEqual([2, 2]);
    const kartlar = new Map([['1', malzeme('1', 'mamul')], ['2', malzeme('2', 'ham')], ['3', malzeme('3', 'ham')]]);
    const rotalar: Record<string, Adim[]> = { 1: [adim('a', 10, { ins: [{ itemId: '2', qty: 2, scrap: 0 }, { itemId: '3', qty: 1, scrap: 0 }] })] };
    const rotaOf = (id: string) => rotalar[id] ?? [];
    expect(malzemeMaliyeti('1', rotaOf, (id) => kartlar.get(id), (id) => ({ 2: 5, 3: 1 } as Record<string, number>)[id] ?? null)).toBe(11);
    expect(malzemeMaliyeti('1', rotaOf, (id) => kartlar.get(id), (id) => (id === '2' ? 5 : null))).toBeNull();
  });

  it('rota mamul ve yarı mamulün olur; ham maddenin olmaz; hizmet ve girdisi kapalı kart girdi olmaz', () => {
    expect(rotaSahibiOlur(malzeme('1', 'yari'), 0, 0)).toBe(true);
    expect(rotaSahibiOlur(malzeme('1', 'ham'), 3, 1)).toBe(false);
    expect(rotaSahibiOlur(malzeme('1', 'sarf'), 0, 1)).toBe(true);
    expect(girdiOlur(malzeme('1', 'hizmet'))).toBe(false);
    expect(girdiOlur(malzeme('1', 'ham', { girdiOlabilir: false }))).toBe(false);
    expect(girdiOlur(undefined)).toBe(false);
  });

  it('akış kartı: son adımda ürünün kendisi, öncesinde taşınan malzemenin adımlı adı', () => {
    const l = [adim('a', 10, { ins: [{ itemId: '2', qty: 1, scrap: 0 }] }), adim('b', 20)];
    expect(akisKarti('1', l, 1, var_)).toEqual({ itemId: '1', adim: null });
    const k = akisKarti('1', l, 0, var_);
    expect(k.itemId).toBe('2');
    expect(kartBasligi(malzeme('2', 'ham'), k.adim, opAdi)).toBe('HM OP 10 Kesim');
  });

  it('revizyonlar ürün başına oluşturma sırasıyla; açık revizyon taslak ya da onaydır', () => {
    const revs = [rev('B', 'taslak', 2), rev('A', 'yururlukte', 1), { ...rev('C', 'onayli', 3), itemId: '12' }];
    const r = revizyonlari(revs, '11');
    expect(r.map((x) => x.id)).toEqual(['A', 'B']);
    expect(yururlukteki(r)?.id).toBe('A');
    expect(acikRevizyon(r)?.id).toBe('B');
    expect(revizyonlari(null, '11')).toEqual([]);
  });
});

describe('düzenleme', () => {
  const l = [adim('a', 10), adim('b', 20), adim('c', 30)];
  it('ekle, taşı, sürükle ve sil sırayı 10, 20... yeniden numaralar; OP numarası adımda kalır', () => {
    const y = { ...yeniAdim(op('21'), 'y'), opNo: null };
    expect(adimEkle(l, 'a', y).map((x) => [x.id, x.seq])).toEqual([['a', 10], ['y', 20], ['b', 30], ['c', 40]]);
    expect(adimEkle(l, null, y)[0]?.id).toBe('y');
    expect(adimEkle(l, 'yok', y).at(-1)?.id).toBe('y');
    expect(adimTasi(l, 'b', -1).map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(adimSurukle(l, 'a', 'c').map((x) => x.id)).toEqual(['b', 'c', 'a']);
    expect(adimSurukle(l, 'c', 'a').map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(adimArkasinaTasi(l, 'c', null).map((x) => x.id)).toEqual(['c', 'a', 'b']);
    expect(adimArkasinaTasi(l, 'a', 'b').map((x) => x.id)).toEqual(['b', 'a', 'c']);
    expect(adimArkasinaTasi(l, 'a', 'c').map((x) => x.seq)).toEqual([10, 20, 30]);
    expect(adimArkasinaTasi(l, 'b', 'b').map((x) => x.id)).toEqual(['a', 'b', 'c']);
    expect(adimArkasinaTasi(l, 'b', 'yok').map((x) => x.id)).toEqual(['a', 'b', 'c']);
    const s = adimSil(l, 'b');
    expect(s.map((x) => [x.id, x.seq, x.opNo])).toEqual([['a', 10, 10], ['c', 20, 30]]);
  });

  it('bağlılık bağımlı → örtülü → bağımsız döner; örtülüde adet en az 1', () => {
    expect(sonrakiBagimlilik('bagimli')).toBe('ortulu');
    expect(sonrakiBagimlilik('bagimsiz')).toBe('bagimli');
    expect(bagimlilikYaz(adim('a', 10, { depQty: null }), 'ortulu').depQty).toBe(1);
  });

  it('istasyon değişince makine kalkar; operasyon değişince süreler katalogdan gelir; fason dönüşü', () => {
    const a = adim('a', 10, { stationId: '31', machineId: '51' });
    expect(istasyonYaz(a, '32').machineId).toBeNull();
    expect(istasyonYaz(a, '31').machineId).toBe('51');
    const b = operasyonYaz(a, op('22', { stationId: '33', setup: 5, cycle: 7 }));
    expect([b.opId, b.stationId, b.setup, b.proc, b.chg]).toEqual(['22', '33', 5, 7, null]);
    expect(katalogdanFarkli(b, op('22', { stationId: '33', setup: 5, cycle: 7 }))).toBe(false);
    const f = fasonaCevir(a, '7', op('21'));
    expect([f.fasonId, f.stationId, f.machineId, f.alts]).toEqual(['7', null, null, []]);
    expect(fasonaCevir(f, null, op('21')).stationId).toBe('31');
  });
});

describe('kaydet gövdesi', () => {
  const opBul = (id: string) => (id === '21' ? op('21') : undefined);
  it('OP numarası yalnız revizyonda varsa gider; bağımlılık ve kaynak sunucunun adlarıyla', () => {
    const l = [adim('a', 10, { ins: [{ itemId: '2', qty: 1.5, scrap: 2 }] }), { ...adim('b', 20, { dep: 'ortulu', depQty: 3, machineId: '51' }), opNo: null }];
    const g = kaydetGovdesi(l, [10], opBul);
    expect(g[0]).toMatchObject({ opNo: 10, operasyonTipiId: 21, kaynak: { tur: 'istasyon', id: 31 }, bagimlilik: 'bekleyen', devirAdedi: null,
      bilesenler: [{ malzemeId: 2, miktar: 1.5, fireYuzde: 2 }] });
    expect(g[1]).toMatchObject({ opNo: null, kaynak: { tur: 'makine', id: 51 }, bagimlilik: 'akisli', devirAdedi: 3 });
  });

  it('744 a: ilk parça seçimi gider; seçimi bilinmeyen adımda alan gitmez (sunucu kayıtlıyı korur); yeni adım her kurulumda başlar', () => {
    const { ilkParca: _yok, ...bilinmeyen } = adim('b', 20);
    const g = kaydetGovdesi([adim('a', 10, { ilkParca: 'yok' }), bilinmeyen], [10, 20], opBul);
    expect(g[0]).toMatchObject({ ilkParca: 'yok' });
    expect(g[1]).not.toHaveProperty('ilkParca');
    expect(yeniAdim(op('21'), 'x').ilkParca).toBe('her_kurulum');
  });

  it('fason adımda süre gitmez, termin gider; işlem süresi yoksa değişim de gitmez', () => {
    const f = adim('a', 10, { stationId: null, fasonId: '7', terminGun: 5 });
    expect(kaydetGovdesi([f], [], opBul)[0]).toMatchObject({ kaynak: { tur: 'fason', id: 7 }, ayarSuresiDk: null, islemSuresiDk: null, terminGun: 5 });
    expect(kaydetGovdesi([adim('a', 10, { proc: null, chg: 2 })], [], opBul)[0]).toMatchObject({ islemSuresiDk: null, degisimSuresiDk: null });
  });

  it('katalogda olmayan operasyon ve sayı olmayan kimlik açıklamayla durur', () => {
    expect(() => kaydetGovdesi([adim('a', 10, { opId: '99' })], [], opBul)).toThrow(/Operasyonlar/);
    expect(() => kaydetGovdesi([adim('a', 10, { ins: [{ itemId: 'eski-1', qty: 1, scrap: 0 }] })], [], opBul)).toThrow(/Girdi kalemi/);
  });

  it('sunucunun reddettiği adım ekrandaki OP numarasıyla söylenir', () => {
    const l = [adim('a', 10), adim('b', 20)];
    expect(rotaHataMetni('OP 70: İşlem süresi girilmeli.', 'adimlar.1.islemSuresiDk', l, opAdi)).toBe('OP 20 Kesim: İşlem süresi girilmeli.');
    expect(rotaHataMetni('Geçersiz.', null, l, opAdi)).toBe('Geçersiz.');
  });
});

describe('ağaç, fark ve seçici', () => {
  const kartlar = new Map([['1', malzeme('1', 'mamul')], ['2', malzeme('2', 'yari')], ['3', malzeme('3', 'ham')]]);
  const rotalar: Record<string, Adim[]> = {
    1: [adim('a', 10, { ins: [{ itemId: '2', qty: 2, scrap: 50 }] })],
    2: [adim('b', 10, { ins: [{ itemId: '3', qty: 1, scrap: 0 }] })],
  };
  const rotaOf = (id: string) => rotalar[id] ?? [];

  it('ağaç fire ile alt montaj miktarını büyütür; şemadaki rotalar her biri bir kez', () => {
    const k = agacKur('1', 10, rotaOf, (id) => kartlar.get(id));
    expect(k.adimlar[0]?.girenler[0]?.dugum.miktar).toBe(30);
    expect(k.adimlar[0]?.girenler[0]?.dugum.adimlar[0]?.girenler[0]?.dugum.miktar).toBe(30);
    expect(agacUrunleri('1', rotaOf, (id) => kartlar.get(id), (id) => rotaOf(id).length > 0)).toEqual(['1', '2']);
  });

  it('döngü sonsuz ağaç kurmaz', () => {
    const d = agacKur('1', 1, (id) => (id === '1' ? [adim('a', 10, { ins: [{ itemId: '1', qty: 1, scrap: 0 }] })] : []), (id) => kartlar.get(id));
    expect(d.adimlar[0]?.girenler[0]?.dugum.dongu).toBe(true);
  });

  it('fark yeni, silinen adımı ve alan değişikliğini yazar', () => {
    const ad = { op: (id: string) => `op${id}`, istasyon: (id: string | null) => id ?? 'yok', malzeme: (id: string) => `m${id}` };
    const A = [adim('a', 10), adim('b', 20)];
    const B = [adim('a', 10, { setup: 20 }), adim('c', 20)];
    const f = rotaFarki(A, B, ad);
    expect(f).toContain('Yeni adım: OP 20 op21');
    expect(f).toContain('Silinen adım: OP 20 op21');
    expect(f.some((x) => x.includes('hazırlık'))).toBe(true);
    expect(rotaFarki(A, A, ad)).toEqual([]);
  });

  it('seçici koda ve ada göre süzer, koduyla başlayan önce gelir, girdi olamayanı ve kendini atlar', () => {
    const liste = [malzeme('1', 'mamul', { code: 'X-AB' }), malzeme('2', 'ham', { code: 'AB-1' }), malzeme('3', 'hizmet', { code: 'AB-2' })];
    expect(malzemeAra(liste, 'ab', 'all', true, null).map((m) => m.id)).toEqual(['2', '1']);
    expect(malzemeAra(liste, '', 'ham', false, null).map((m) => m.id)).toEqual(['2']);
    expect(malzemeAra(liste, '', 'all', true, '1').map((m) => m.id)).toEqual(['2']);
    expect(sirali([adim('b', 20), adim('a', 10)]).map((x) => x.id)).toEqual(['a', 'b']);
  });
});

describe('R1 gün saati', () => {
  it('iş merkezinin çalışılan günlerinin ortalama net saati; hafta okunamazsa 8', () => {
    const dk = (id: string) => ({ s1: 450, s2: 420 })[id] ?? 0;
    expect(ortalamaGunSaati({ 1: ['s1', 's2'], 2: ['s1'], 0: [] }, dk)).toBeCloseTo((14.5 + 7.5) / 2);
    expect(ortalamaGunSaati(undefined, dk)).toBe(8);
    expect(ortalamaGunSaati({ 1: [] }, dk)).toBe(8);
  });
});

describe('823: giren tekrarı ve ara kart birimi', () => {
  const ins = [{ itemId: '12', qty: 2, scrap: 0 }, { itemId: '13', qty: 1, scrap: 0 }];
  it('aynı malzeme ikinci kez giren olamaz; var olanın sırası döner', () => {
    expect(girenTekrari({ ins }, '12')).toBe(0);
    expect(girenTekrari({ ins }, '14')).toBeNull();
  });
  it('değiştirmede kendi sırası sayılmaz; başka girenin malzemesine değiştirmek engellenir', () => {
    expect(girenTekrari({ ins }, '12', 0)).toBeNull();
    expect(girenTekrari({ ins }, '12', 1)).toBe(0);
  });
  it('ara kart adettir; son adımın çıktısı malzemenin birimini korur', () => {
    const ham = malzeme('12', 'ham', { unit: 'kg' });
    const a = { id: 'o10', seq: 10, opNo: 10 } as Adim;
    expect(kartBirimi(ham, a)).toBe('adet');
    expect(kartBirimi(ham, null)).toBe('kg');
    expect(kartBirimi(undefined, null)).toBe('');
  });
});

describe('adımın şartnameleri (971 a, 1193 a)', () => {
  const sartname = (id: number, kod: string, kapsam: 'ic' | 'fason' | 'ikisi', ek: { aktif?: boolean; yururlukteSurumNo?: number | null } = {}) => ({
    id, kod, ad: kod, kategoriId: 1, kapsam, kaynak: 'varsayilan' as const, musteriFirma: null, musteriBelgeNo: null,
    aktif: ek.aktif ?? true, surum: 1, yururlukteSurumNo: ek.yururlukteSurumNo === undefined ? 1 : ek.yururlukteSurumNo, taslakSurumNo: null, kullanim: 0,
  });
  it('eklenebilen: kullanımda, yayınlanmış, kapsama uyan ve bağlı olmayan; koda göre sıralı', () => {
    const liste = [sartname(1, 'C-FSN', 'fason'), sartname(2, 'B-IKI', 'ikisi'), sartname(3, 'A-IC', 'ic'), sartname(4, 'D-PAS', 'ic', { aktif: false }),
      sartname(5, 'E-YOK', 'ic', { yururlukteSurumNo: null }), sartname(6, 'F-BAG', 'ic')];
    expect(eklenebilirSartnameler(liste, new Set([6]), false).map((s) => s.kod)).toEqual(['A-IC', 'B-IKI']);
    expect(eklenebilirSartnameler(liste, new Set(), true).map((s) => s.kod)).toEqual(['B-IKI', 'C-FSN']);
    expect(kapsamaUyar('ikisi', true) && kapsamaUyar('ic', false) && !kapsamaUyar('fason', false)).toBe(true);
  });
  it('kilit: taslak, OP numarası ve bekleyen rota kaydı', () => {
    expect(adimSartnameKilidi({ revDurumu: 'taslak', opNo: 10, kayitBekliyor: false })).toBeNull();
    expect(adimSartnameKilidi({ revDurumu: null, opNo: 10, kayitBekliyor: false })).toMatch(/Rota kaydedilince/);
    expect(adimSartnameKilidi({ revDurumu: 'taslak', opNo: null, kayitBekliyor: false })).toMatch(/OP numarası/);
    expect(adimSartnameKilidi({ revDurumu: 'onay', opNo: 10, kayitBekliyor: false })).toMatch(/geri gönder/);
    expect(adimSartnameKilidi({ revDurumu: 'yururlukte', opNo: 10, kayitBekliyor: false })).toMatch(/taslak revizyonda/);
    expect(adimSartnameKilidi({ revDurumu: 'taslak', opNo: 10, kayitBekliyor: true })).toMatch(/kaydediliyor/);
  });
});
