import { describe, expect, it } from 'vitest';
import {
  acikRevizyon, adimArkasinaTasi, adimSartnameKilidi, eklenebilirSartnameler, kapsamaUyar, adimCarpanlari, adimEkle, adimSil, adimSurukle, adimTasi, agacKur, agacUrunleri, akisKarti, bagimlilikYaz, cevrimToplami,
  degisimOrani, fasonaCevir, gkkUyarilari, girdiOlur, girenTekrari, kartBirimi, islemSuresiEksik, istasyonYaz, kaydetGovdesi, kartBasligi, katalogdanFarkli, malzemeAra, malzemeMaliyeti, ortalamaGunSaati,
  operasyonYaz, revizyonlari, rotaEksikleri, rotaFarki, rotaHataMetni, rotaSahibiOlur, sirali, sonrakiBagimlilik, sureGirisi, sureMetni,
  tuketilenAdimlar, yeniAdim, yururlukteki, type Adim, type Malzeme, type Operasyon, type Revizyon,
} from './kurallar.ts';
import { adimCarpani, adimOnculleri, birlesebilenDallar, birlesenYaz, carpanYaz, dalliRota, dalYaz } from './kurallar.ts';
import { hazirlikBolumu, hazirlikYaz, sureYaz, toplamdanBolum } from './kurallar.ts';
import { hamGirdisiVar, hamOneriMiktari, onerilebilirKartlar } from './kurallar.ts';
import { adimAdi, turKisa, yerelTur } from './kurallar.ts';
import { catalFarki, dalBilgileri, dalCarpaniYaz, dalEtiketi, dalHatasi, kolaEkle, kolaTasi, kollariBirlestir, dalYerlesimi, serbestDal } from './kurallar.ts';
import { sayiAlaniHatasi, SURE_EN_COK } from './ortak.tsx';
import { adimOrnegi } from './test-veri.ts';

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
    // 2558-2: girensiz rota "0 ₺" değil, bilinmez.
    expect(malzemeMaliyeti('1', () => [adim('a', 10, { ins: [] })], (id) => kartlar.get(id), () => 5)).toBeNull();
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

  it('fark adımı sıra numarasıyla değil OP numarasıyla anar (RR-6)', () => {
    const ad = { op: (id: string) => `op${id}`, istasyon: (id: string | null) => id ?? 'yok', malzeme: (id: string) => `m${id}` };
    // Şema OP 40 gösterir; sıra numarası 10 olsa da fark aynı numarayı yazmalı.
    const A = [adim('a', 10, { opNo: 40, proc: 4 })];
    const B = [adim('a', 10, { opNo: 40, proc: 5 })];
    const f = rotaFarki(A, B, ad);
    expect(f.length).toBe(1);
    expect(f[0]).toMatch(/^OP 40 op21: /);
  });

  it('sunucunun katalog türü (yarimamul, hammadde) kısa ada ve yerel türe çevrilir; bilinmeyen tür olduğu gibi kalır (RR-6)', () => {
    expect(turKisa('yarimamul')).toBe('YM');
    expect(turKisa('hammadde')).toBe('HM');
    expect(turKisa('mamul')).toBe('MM');
    expect(turKisa('yari')).toBe('YM');
    expect(yerelTur('yarimamul')).toBe('yari');
    expect(turKisa('sarf')).toBe('sarf');
  });

  it('sayı alanı eksi, sayı olmayan ve üst sınırı aşan girdiyi nedeniyle reddeder; boş ve geçerli girdi geçer (RR-3)', () => {
    expect(sayiAlaniHatasi('-3')).toBe('Eksi olamaz.');
    expect(sayiAlaniHatasi('abc')).toBe('Sayı girin.');
    expect(sayiAlaniHatasi('99999999', SURE_EN_COK)).toBe('En çok 99.999 olabilir.');
    expect(sayiAlaniHatasi('')).toBeNull();
    expect(sayiAlaniHatasi('5,5', SURE_EN_COK)).toBeNull();
    expect(sayiAlaniHatasi('0')).toBeNull();
  });

  it('pozitif sayı alanı boş ve sıfır miktarı reddeder, 0 yazmaz; geçerli miktar geçer (B-2484-6)', () => {
    expect(sayiAlaniHatasi('', undefined, true)).toBe('Miktar zorunlu.');
    expect(sayiAlaniHatasi('  ', undefined, true)).toBe('Miktar zorunlu.');
    expect(sayiAlaniHatasi('0', undefined, true)).toBe('Sıfırdan büyük olmalı.');
    expect(sayiAlaniHatasi('0,25', undefined, true)).toBeNull();
    expect(sayiAlaniHatasi('-1', undefined, true)).toBe('Eksi olamaz.');
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

describe('çok dallı rota (1248 a)', () => {
  const opBul = (id: string) => (id === '21' ? op('21') : undefined);
  const seqler = (l: (Adim[] | null)[]) => l.map((x) => x?.map((a) => a.seq) ?? null);
  // A: 10-20, B: 30, 40 ana hatta A ve B'yi birleştirir.
  const rota = () => [
    adim('a', 10, { dal: 'A' }), adim('b', 20, { dal: 'A' }), adim('c', 30, { dal: 'B' }),
    adim('d', 40, { dal: null, birlesen: ['A', 'B'], dep: 'ortulu', depQty: 4 }),
  ];

  it('öncüller sunucuyla aynı kuraldan: dal başı beklemez, birleştirme adımı dalların son adımını bekler; tek hatlı rotada null', () => {
    expect(dalliRota(rota())).toBe(true);
    expect(seqler(adimOnculleri(rota()))).toEqual([[], [10], [], [20, 30]]);
    expect(tuketilenAdimlar(rota(), 3).map((a) => a.seq)).toEqual([20, 30]);
    expect(tuketilenAdimlar(rota(), 2)).toEqual([]);
    const tek = [adim('a', 10), adim('b', 20)];
    expect(dalliRota(tek)).toBe(false);
    expect(adimOnculleri(tek)).toEqual([null, null]);
    expect(tuketilenAdimlar(tek, 1).map((a) => a.seq)).toEqual([10]);
  });

  it('birleştirilebilen dallar adımdan önce başlamış, birleşmemiş ve adımın kendi dalı olmayanlardır; dal değişince kendi dalı birleşenden düşer', () => {
    expect(birlesebilenDallar(rota(), 2)).toEqual(['A']);
    expect(birlesebilenDallar(rota(), 3)).toEqual(['A', 'B']);
    const l = rota();
    l.push(adim('e', 50, { dal: null }));
    expect(birlesebilenDallar(l, 4)).toEqual([]);
    expect(dalYaz(adim('x', 10, { birlesen: ['A', 'B'] }), 'A')).toMatchObject({ dal: 'A', birlesen: ['B'] });
    expect(birlesenYaz(adim('x', 10, { birlesen: ['B'] }), 'A', true).birlesen).toEqual(['A', 'B']);
    expect(birlesenYaz(adim('x', 10, { birlesen: ['A', 'B'] }), 'A', false).birlesen).toEqual(['B']);
  });

  it('1257 a: dal çarpanı yalnız dal adımında tutulur; 1 ve boş ana değerdir (boş saklanır); dal kalkınca çarpan da kalkar; kayıtta çarpanı bilmeyen adım alanı göndermez', () => {
    expect(adimCarpani(adim('x', 10, { dal: 'A' }))).toBe(1);
    expect(carpanYaz(adim('x', 10, { dal: 'A' }), 2).adetCarpani).toBe(2);
    expect(carpanYaz(adim('x', 10, { dal: 'A', adetCarpani: 2 }), 1).adetCarpani).toBeNull();
    expect(carpanYaz(adim('x', 10, { dal: 'A', adetCarpani: 2 }), null).adetCarpani).toBeNull();
    expect(dalYaz(adim('x', 10, { dal: 'A', adetCarpani: 3 }), 'B').adetCarpani).toBe(3);
    expect(dalYaz(adim('x', 10, { dal: 'A', adetCarpani: 3 }), null).adetCarpani).toBeNull();
    const g = kaydetGovdesi([adim('a', 10, { dal: 'A', adetCarpani: 2 }), adim('b', 20)], [10, 20], (id) => (id === '21' ? op('21') : undefined));
    expect(g[0]).toMatchObject({ dal: 'A', adetCarpani: 2 });
    expect(g[1]).not.toHaveProperty('adetCarpani');
  });

  it('eksikler: dal başı girensiz olmaz; açıkta kalan dal birleştirme eksiği olarak gösterilir', () => {
    const l = rota().map((a, i) => (i === 0 ? { ...a, ins: [{ itemId: '2', qty: 1, scrap: 0 }] } : a));
    expect(rotaEksikleri(l, var_, opAdi).map((x) => x.metin)).toEqual(['OP 30 Kesim: hiçbir adımı beklemediği için giren seçilmeli']);
    const acik = [adim('a', 10, { dal: 'A', ins: [{ itemId: '2', qty: 1, scrap: 0 }] }), adim('b', 20, { dal: 'B', ins: [{ itemId: '2', qty: 1, scrap: 0 }] }), adim('c', 30, { birlesen: ['A'] })];
    expect(rotaEksikleri(acik, var_, opAdi).map((x) => x.metin)).toEqual(['OP 30 Kesim: B dalı hiçbir adımda birleşmiyor; birleştirme adımında seçilmeli']);
  });

  it('kaydet gövdesi dal ve birleşeni taşır; dalı olmayan adım ana hattır; fark listesi dal değişimini söyler', () => {
    const g = kaydetGovdesi(rota(), [10, 20, 30, 40], opBul);
    expect(g.map((x) => [x['dal'], x['birlesen']])).toEqual([['A', []], ['A', []], ['B', []], [null, ['A', 'B']]]);
    expect(kaydetGovdesi([adim('a', 10)], [10], opBul)[0]).toMatchObject({ dal: null, birlesen: [] });
    const ad = { op: () => 'Kesim', istasyon: () => 'İst', malzeme: () => 'K' };
    expect(rotaFarki([adim('a', 10)], [adim('a', 10, { dal: 'A' })], ad)).toEqual(['OP 10 Kesim: dal ana hat → A']);
  });
});

describe('hazırlık bölümü (1310 a)', () => {
  it('bölümü olmayan adımda süre ayardır; ayar açılınca süre alanı gelir, toplam hazırlık + ayar olur; ayar kapanınca ayar süresi düşer', () => {
    expect(toplamdanBolum(25)).toEqual({ hazirlik: 0, ayarli: true, ayarDk: 25 });
    expect(toplamdanBolum(0)).toEqual({ hazirlik: 0, ayarli: false, ayarDk: null });
    const a = adim('a', 10, { setup: 25 });
    expect(hazirlikBolumu(a)).toEqual({ hazirlik: 0, ayarli: true, ayarDk: 25 });
    const b = hazirlikYaz(a, { hazirlik: 10 });
    expect([b.setup, b.hazirlik, b.ayarli, b.ayarDk]).toEqual([35, 10, true, 25]);
    const c = hazirlikYaz(b, { ayarli: false });
    expect([c.setup, c.hazirlik, c.ayarli, c.ayarDk]).toEqual([10, 10, false, null]);
    const d = hazirlikYaz(c, { ayarli: true, ayarDk: 5 });
    expect([d.setup, d.ayarDk]).toEqual([15, 5]);
    expect(hazirlikYaz(adim('b', 20, { setup: null }), { hazirlik: null }).setup).toBeNull();
    const eksik = hazirlikYaz(adim('a', 10, { ins: [{ itemId: '2', qty: 1, scrap: 0 }] }), { hazirlik: 5, ayarli: true, ayarDk: null });
    expect(rotaEksikleri([eksik], () => true, () => null).map((x) => x.metin)).toEqual(['OP 10: ayar işaretli; ayar süresi girilmeli']);
  });

  it('yalnız toplam girilen yerde ayarlı adımda fark ayara, ayarsız adımda hazırlığa yazılır', () => {
    const ayarli = hazirlikYaz(adim('a', 10), { hazirlik: 10, ayarli: true, ayarDk: 20 });
    const x = sureYaz(ayarli, 'setup', 45);
    expect([x.setup, x.hazirlik, x.ayarDk]).toEqual([45, 10, 35]);
    const ayarsiz = hazirlikYaz(adim('b', 20), { hazirlik: 8, ayarli: false });
    const y = sureYaz(ayarsiz, 'setup', 12);
    expect([y.setup, y.hazirlik, y.ayarli, y.ayarDk]).toEqual([12, 12, false, null]);
  });

  it('kaydet gövdesine bölüm gider; fasonda bölüm boştur', () => {
    const opBul = (id: string) => (id === '21' ? op('21') : undefined);
    const a = hazirlikYaz(adim('a', 10), { hazirlik: 5, ayarli: true, ayarDk: 20 });
    expect(kaydetGovdesi([a], [], opBul)[0]).toMatchObject({ ayarSuresiDk: 25, hazirlikDk: 5, ayar: true, ayarDk: 20 });
    const f = adim('f', 10, { stationId: null, fasonId: '7', terminGun: 5 });
    expect(kaydetGovdesi([f], [], opBul)[0]).toMatchObject({ ayarSuresiDk: null, hazirlikDk: null, ayar: false, ayarDk: null });
  });
});

describe('1709 hammadde önerisi (1726 a, 1727 a)', () => {
  const o = { hamHacimMm3: 100_000, yogunluk: 7.85, kesimBoyuMm: 44 };
  it('miktar kartın biriminden: kg hacim x yoğunluk, m ve mm kesim boyu, adet 1; bilinmeyende null', () => {
    expect(hamOneriMiktari(o, 'kg')).toBe(0.785);
    expect(hamOneriMiktari(o, ' KG ')).toBe(0.785);
    expect(hamOneriMiktari(o, 'm')).toBe(0.044);
    expect(hamOneriMiktari(o, 'mm')).toBe(44);
    expect(hamOneriMiktari(o, 'adet')).toBe(1);
    expect(hamOneriMiktari({ ...o, yogunluk: null }, 'kg')).toBeNull();
    expect(hamOneriMiktari({ ...o, kesimBoyuMm: null }, 'm')).toBeNull();
    expect(hamOneriMiktari(o, 'm²')).toBeNull();
    expect(hamOneriMiktari(o, null)).toBeNull();
  });

  it('öneri rotada ham girdi yokken; listede olmayan, pasif ya da girdi olamayan kart önerilmez', () => {
    const kart = (id: string, ek: Partial<Malzeme> = {}): Malzeme => ({
      id, kayitNo: Number(id), code: `HM-${id}`, name: 'Deneme', type: 'ham', unit: 'kg', cost: null, stock: null, min: null, aktif: true,
      kategori: null, kategoriAdi: null, girdiOlabilir: true, ...ek,
    });
    const harita = new Map([['1', kart('1')], ['2', kart('2', { aktif: false })], ['3', kart('3', { girdiOlabilir: false })], ['4', kart('4', { type: 'sarf' })]]);
    expect(hamGirdisiVar([adimOrnegi({ ins: [{ itemId: '4', qty: 1, scrap: 0 }] })], harita)).toBe(false);
    expect(hamGirdisiVar([adimOrnegi({ ins: [] }), adimOrnegi({ id: 'o20', ins: [{ itemId: '1', qty: 1, scrap: 0 }] })], harita)).toBe(true);
    const oneri = (malzemeNo: number) => ({
      malzemeNo, kod: '', ad: null, kalite: null, form: 'cubuk' as const, olcu: { d: 30, l: 3000 }, aile: null, kaliteKodu: null, yogunluk: null, kesimBoyuMm: 44, hamHacimMm3: 1,
    });
    expect(onerilebilirKartlar([1, 2, 3, 9].map(oneri), harita).map((x) => x.kart.id)).toEqual(['1']);
  });
});

describe('2542 çatallı rota kolaylıkları (veri biçimi aynı)', () => {
  // OP 10 ana hat, OP 20 ana hat (çatal), OP 30 ve 40 Dal A, OP 50 ana hat, OP 60 A'yı birleştirir.
  const rota = (): Adim[] => [
    adim('a', 10), adim('b', 20), adim('c', 30, { dal: 'A', adetCarpani: 2 }), adim('d', 40, { dal: 'A', adetCarpani: 2 }), adim('e', 50), adim('f', 60, { birlesen: ['A'] }),
  ];
  it('E: dalın çatalı kendinden önceki son ana hat adımı, birleşmesi birleştiren adım; çarpan dalda aynıysa tek sayı', () => {
    const [b] = dalBilgileri(rota());
    expect(b?.catal?.id).toBe('b');
    expect(b?.birlesme?.id).toBe('f');
    expect(b?.carpan).toBe(2);
    expect(dalEtiketi(b!)).toBe('Dal A: OP 20 ardından başlar, OP 60 adımında birleşir.');
    const bas = dalBilgileri([adim('a', 10, { dal: 'B' }), adim('b', 20)])[0]!;
    expect(dalEtiketi(bas)).toBe('Dal B: rotanın başından başlar, birleşmiyor.');
    expect(dalEtiketi(dalBilgileri([adim('a', 10), adim('b', 20, { dal: 'B' })])[0]!)).toBe('Dal B: OP 10 ardından başlar, rotanın sonuna kadar yürür.');
    expect(dalBilgileri([adim('a', 10, { dal: 'A', adetCarpani: 2 }), adim('b', 20, { dal: 'A' })])[0]?.carpan).toBeNull();
  });
  it('E: taşıma çatal ya da birleşme yerini değiştirirse yeni etiket döner, değiştirmezse boş', () => {
    const l = rota();
    expect(catalFarki(l, adimSurukle(l, 'c', 'd'))).toEqual([]);
    expect(catalFarki(l, adimSurukle(l, 'b', 'a'))).toEqual(['Dal A: OP 10 ardından başlar, OP 60 adımında birleşir.']);
    expect(catalFarki(l, adimSurukle(l, 'f', 'e'))).toEqual([]);
  });
  it('A: rotada kullanılmayan ilk harf; yeni adım verilen kolu açar, ardına eklenen dal adımının dalını ve çarpanını alır', () => {
    expect(serbestDal(rota())).toBe('B');
    expect(serbestDal(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map((d, i) => adim(d, (i + 1) * 10, { dal: d })))).toBeNull();
    const acilan = sirali(kolaEkle(rota(), 'e', adim('y', 0), 'B'));
    expect(acilan.find((x) => x.id === 'y')).toMatchObject({ dal: 'B' });
    expect(dalBilgileri(acilan).find((x) => x.dal === 'B')?.catal?.id).toBe('e');
    expect(sirali(kolaEkle(rota(), 'c', adim('z', 0))).find((x) => x.id === 'z')).toMatchObject({ dal: 'A', adetCarpani: 2 });
    expect(sirali(kolaEkle(rota(), 'b', adim('z', 0))).find((x) => x.id === 'z')?.dal ?? null).toBeNull();
  });
  it('B ve D: açık kolların hepsi birleşir; çarpan dalın bütün adımlarına yazılır, başka dala dokunmaz', () => {
    const l = [adim('a', 10), adim('b', 20, { dal: 'A' }), adim('c', 30, { dal: 'B' }), adim('d', 40)];
    expect(kollariBirlestir(l, 'd').find((x) => x.id === 'd')?.birlesen).toEqual(['A', 'B']);
    expect(dalHatasi(kollariBirlestir(l, 'd'))).toBeNull();
    const c = dalCarpaniYaz(l, 'A', 3);
    expect(c.map((x) => x.adetCarpani ?? null)).toEqual([null, 3, null, null]);
  });
  it('F: dal kuralı düzenlerken hatalı adımla gelir; açık kalan dal rotaya yazılır (adım yok)', () => {
    expect(dalHatasi(rota())).toBeNull();
    const l = [adim('a', 10), adim('b', 20, { dal: 'A' }), adim('c', 30)];
    expect(dalHatasi(l)).toEqual({ adimId: null, ileti: 'A dalı hiçbir adımda birleşmiyor; birleştirme adımında seçilmeli.' });
    expect(dalHatasi([adim('a', 10), adim('b', 20, { birlesen: ['A'] })])?.adimId).toBe('b');
  });
});

describe('2542 C: şemada kollar yan yana', () => {
  const seritler = (l: Adim[]) => Object.fromEntries(l.map((x) => [x.id, dalYerlesimi(l).yer.get(x.id)]));
  it('3188: ana hat tek şeritte kalır; dal ayrıldığı adımın alt satırında yana açılır, birleştiren adım dalların altındadır', () => {
    const l = [adim('a', 10), adim('b', 20, { dal: 'A' }), adim('c', 30, { dal: 'B' }), adim('d', 40, { dal: 'A' }), adim('e', 50), adim('f', 60, { birlesen: ['A', 'B'] }), adim('g', 70)];
    const y = dalYerlesimi(l);
    expect(seritler(l)).toEqual({
      a: { satir: 0, serit: 0 }, b: { satir: 1, serit: 1 }, c: { satir: 1, serit: -1 }, d: { satir: 2, serit: 1 }, e: { satir: 1, serit: 0 },
      f: { satir: 3, serit: 0 }, g: { satir: 4, serit: 0 },
    });
    expect(y.seritler).toEqual([-1, 0, 1]);
    expect(y.satirlar).toEqual([[null, 'a', null], ['c', 'e', 'b'], [null, null, 'd'], [null, 'f', null], [null, 'g', null]]);
    expect([...y.ilkAdimlar]).toEqual(expect.arrayContaining([['b', 'A'], ['c', 'B']]));
    expect(y.acikUclar.size).toBe(0);
  });
  it('3188: dalsız rotada tek şerit, her adım kendi satırında', () => {
    const y = dalYerlesimi([adim('a', 10), adim('b', 20)]);
    expect(y.seritler).toEqual([0]);
    expect(y.satirlar).toEqual([['a'], ['b']]);
  });
  it('3188: sırayla açılıp kapanan dallar aynı şeridi yeniden kullanır; birleşmeyen dal şeridini sona kadar tutar ve ucu açık sayılır', () => {
    const l = [adim('a', 10), adim('b', 20, { dal: 'A' }), adim('c', 30, { birlesen: ['A'] }), adim('d', 40, { dal: 'B' }), adim('e', 50, { birlesen: ['B'] })];
    expect(seritler(l)['b']?.serit).toBe(1);
    expect(seritler(l)['d']?.serit).toBe(1);
    const acik = [adim('a', 10), adim('b', 20, { dal: 'A' }), adim('c', 30), adim('d', 40, { dal: 'B' }), adim('e', 50, { birlesen: ['B'] })];
    const y = dalYerlesimi(acik);
    expect(y.yer.get('b')?.serit).toBe(1);
    expect(y.yer.get('d')?.serit).toBe(-1);
    expect([...y.acikUclar]).toEqual([['b', 'A']]);
  });
  it('3188: rotanın sonuna kadar yürüyen dal açık uç sayılmaz ("Birleşmiyor" uyarısı çıkmaz)', () => {
    const y = dalYerlesimi([adim('a', 10), adim('b', 20, { dal: 'A' }), adim('c', 30), adim('d', 40, { dal: 'A' })]);
    expect(y.acikUclar.size).toBe(0);
    expect(y.yer.get('d')?.serit).toBe(1);
  });
  it('3188: yeni açılan dal var olan dalların şeridini değiştirmez; aynı anda açık iki dal aynı şeritte durmaz', () => {
    const once = [adim('a', 10), adim('b', 20, { dal: 'A' }), adim('c', 30, { dal: 'B' }), adim('f', 60, { birlesen: ['A', 'B'] })];
    const sonra = [adim('a', 10), adim('b', 20, { dal: 'A' }), adim('c', 30, { dal: 'B' }), adim('x', 40, { dal: 'C' }), adim('f', 60, { birlesen: ['A', 'B'] })];
    const y1 = dalYerlesimi(once); const y2 = dalYerlesimi(sonra);
    for (const id of ['a', 'b', 'c']) expect(y2.yer.get(id)?.serit).toBe(y1.yer.get(id)?.serit);
    expect(new Set(['b', 'c', 'x'].map((id) => y2.yer.get(id)?.serit)).size).toBe(3);
  });
  it('kola bırakılan adım o kola geçer, kolun son adımının ardına taşınır ve çarpanını alır; ana hatta dalı kalkar', () => {
    const l = [adim('a', 10), adim('b', 20, { dal: 'A', adetCarpani: 2 }), adim('c', 30, { dal: 'B' }), adim('d', 40, { birlesen: ['A', 'B'] })];
    const t = sirali(kolaTasi(l, 'c', 'A', 'b'));
    expect(t.map((x) => [x.id, x.dal ?? null, x.adetCarpani ?? null])).toEqual([['a', null, null], ['b', 'A', 2], ['c', 'A', 2], ['d', null, null]]);
    expect(sirali(kolaTasi(l, 'b', null, 'a')).map((x) => x.dal ?? null)).toEqual([null, null, 'B', null]);
    expect(sirali(kolaTasi(l, 'c', 'A', 'b')).at(-1)?.birlesen).toEqual(['A']);
    expect(dalHatasi(kolaTasi(l, 'c', 'A', 'b'))).toBeNull();
  });
});

describe('2558-3 adımın erişilebilir adı', () => {
  it('numarası verilmiş adım OP numarasıyla, yeni adım sırasıyla okunur', () => {
    expect(adimAdi({ opNo: 20, seq: 2 })).toBe('OP 20');
    expect(adimAdi({ opNo: null, seq: 3 })).toBe('Yeni adım (3. sıra)');
  });
});
