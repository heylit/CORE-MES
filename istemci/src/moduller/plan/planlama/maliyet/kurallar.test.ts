import { describe, expect, it } from 'vitest';
import {
  beklemeHesabi, birimMaliyet, calisilir, fasonDurumu, genelGiderOrani, fasonIsleri, genelGiderHesabi, isTanimlari, maliyetBaglami, malzemeler, malzemeTutari, mesaiAtamasi,
  mesaiBedeli, planMaliyeti, sayiGirdisi, siparisMaliyeti, sonrakiKimlik, sureSapmasi, takvimKur, talasKredisi, kisaTl,
} from './kurallar.ts';
import { ornekCalisma } from './test-verisi.ts';

describe('P3 saf hesaplar', () => {
  it('sipariş maliyeti: malzeme, tezgâh saati ve fason; amortisman girilmemişse genel gider bilinmez (null), kâr tutardan', () => {
    const c = ornekCalisma();
    const b = maliyetBaglami(c);
    expect(b).not.toBeNull();
    if (!b) return;
    const s = c.D.siparisler[0];
    if (!s) throw new Error('sipariş yok');
    const m = siparisMaliyeti(b, s);
    // Kg fiyat listesi yokken kaynağın birim maliyeti: 10 TL × 1,5 kg × 2 adet.
    expect(m?.mal).toBe(30);
    // Tampon açıkken acil pay (%5) çalışma süresinden düşer: 2 sa × 0,95 × 100 TL.
    expect(m?.isl).toBeCloseTo(190);
    expect(m?.fas).toBe(10);
    expect(m?.gg).toBeNull();
    expect(m?.top).toBeCloseTo(230);
    expect(m?.kar).toBeCloseTo(770);
    expect(m?.eksik).toEqual([]);
    expect(planMaliyeti(b).mesTop).toBe(0);
  });

  it('fiyat eksikse kâr bilinmez (null), sıfır uydurulmaz', () => {
    const c = ornekCalisma({ D: { tezgahlar: [{ id: 'T1', ad: 'Deneme torna', grup: 'TORNA', ucret: null, verim: 1 }] } });
    const b = maliyetBaglami(c);
    const s = c.D.siparisler[0];
    if (!b || !s) throw new Error('bağlam yok');
    const m = siparisMaliyeti(b, s);
    expect(m?.eksik).toContain('T1 saat maliyeti');
    expect(m?.kar).toBeNull();
    expect(m?.net).toBeNull();
  });

  it('plan yoksa ya da başlangıç günü okunamazsa bağlam yoktur', () => {
    expect(maliyetBaglami(null)).toBeNull();
    expect(maliyetBaglami(ornekCalisma({ plan: null }))).toBeNull();
    expect(maliyetBaglami(ornekCalisma({ D: { meta: {} } }))).toBeNull();
  });

  it('kg fiyat listesi varsa birim maliyet kalite ve formdan gelir; formu boş satır kalitenin bütün formlarına geçer; fire ihtiyacı büyütür', () => {
    const c = ornekCalisma({ D: { kgFiyat: [{ id: 'KG-1', kalite: 'K1', form: '', fiyat: 20, fire: 10 }] } });
    const m = malzemeler(c.D)[0];
    if (!m) throw new Error('malzeme yok');
    expect(birimMaliyet(c.D, m)).toBe(20);
    const s = c.D.siparisler[0];
    if (!s) throw new Error('sipariş yok');
    expect(malzemeTutari(c.D, s)).toBeCloseTo(20 * 1.5 * 1.1 * 2);
    const yok = ornekCalisma({ D: { kgFiyat: [{ id: 'KG-1', kalite: 'BASKA', form: '', fiyat: 20 }] } });
    const m2 = malzemeler(yok.D)[0];
    if (!m2) throw new Error('malzeme yok');
    expect(birimMaliyet(yok.D, m2)).toBeNull();
  });

  it('talaş kredisi net ağırlık ve talaş fiyatıyla; fiyat yoksa null', () => {
    const s = ornekCalisma().D.siparisler[0];
    if (!s) throw new Error('sipariş yok');
    expect(talasKredisi(ornekCalisma().D, s)).toBeNull();
    const c = ornekCalisma({ D: { talasFiyat: [{ kalite: 'K1', fiyat: 4 }] } });
    expect(talasKredisi(c.D, s)).toEqual({ kg: 1, tl: 4 });
  });

  it('genel gider: kalem eşit dağılır, amortisman tezgâha yazılır, oran 30 günün pratik kapasitesine bölünür', () => {
    const c = ornekCalisma({ D: { maliyetSis: { kalemler: [{ id: 'K1', ad: 'Kira', tur: 'kira', aylik: 3000, anahtar: 'esit', kapsam: '' }], tez: { T1: { bedel: 120000, omur: 10, hurda: 0 } } } } });
    const G = genelGiderHesabi(c, takvimKur(c));
    const t1 = G.tez.find((z) => z.tezgah.id === 'T1');
    expect(t1?.amort).toBe(1000);
    expect(t1?.pay).toBe(1500);
    // 5 Ocak 07:00'den 30 gün: 22 iş günü × 8 saat × %85 verim.
    expect(t1?.kap).toBeCloseTo(22 * 8 * 0.85);
    expect(t1?.oran).toBeCloseTo(2500 / (22 * 8 * 0.85));
    expect(G.aylik).toBe(4000);
  });

  it('bedel ya da ömür girilmemiş tezgâhın amortismanı bilinmez (null); toplam onu atlar, hiçbiri bilinmiyorsa null', () => {
    const c = ornekCalisma({ D: { maliyetSis: { tez: { T1: { bedel: 120000, omur: 10, hurda: 0 } } } } });
    const G = genelGiderHesabi(c, takvimKur(c));
    expect(G.tez.find((z) => z.tezgah.id === 'T1')?.amort).toBe(1000);
    expect(G.tez.filter((z) => z.tezgah.id !== 'T1').every((z) => z.amort === null)).toBe(true);
    expect(G.amort).toBe(1000);
    const bos = ornekCalisma();
    const B = genelGiderHesabi(bos, takvimKur(bos));
    expect(B.tez.every((z) => z.amort === null)).toBe(true);
    expect(B.amort).toBeNull();
  });

  it('amortismanı bilinmeyen tezgâhın emilen ve atıl tutarı bilinmez (null); toplam onları atlar, hiçbiri bilinmiyorsa null', () => {
    const c = ornekCalisma({ D: { maliyetSis: { tez: { T1: { bedel: 120000, omur: 10, hurda: 0 } } } } });
    const G = genelGiderHesabi(c, takvimKur(c));
    const t1 = G.tez.find((z) => z.tezgah.id === 'T1');
    expect(t1?.absorbe).not.toBeNull();
    expect(t1?.atil).not.toBeNull();
    const digerleri = G.tez.filter((z) => z.tezgah.id !== 'T1' && z.kap > 0);
    expect(digerleri.length).toBeGreaterThan(0);
    expect(digerleri.every((z) => z.oran === null && z.absorbe === null && z.atil === null)).toBe(true);
    expect(G.absorbe).toBeCloseTo(t1?.absorbe ?? Number.NaN);
    expect(G.atil).toBeCloseTo(t1?.atil ?? Number.NaN);
    const bos = ornekCalisma();
    const B = genelGiderHesabi(bos, takvimKur(bos));
    expect(B.absorbe).toBeNull();
    expect(B.atil).toBeNull();
  });

  it('ek mesai takvime girer; bedeli kişi ücreti yoksa bilinmez, girilince cumartesi çarpanıyla hesaplanır', () => {
    const ek = [{ m: 'T1', gun: 5, vardiya: 'V1' }];
    const c = ornekCalisma({ ekMesai: ek });
    const T = takvimKur(c);
    expect(calisilir(T.M.T1?.rw ?? [], 120, 144)).toBe(8);
    const e = { m: 'T1', gun: 5, vardiya: 'V1' };
    expect(mesaiBedeli(c, T, e)).toBeNull();
    const u = ornekCalisma({ ekMesai: ek, D: { mesaiSis: { ucret: { P1: { brut: 22500 } } } } });
    expect(mesaiBedeli(u, takvimKur(u), e)).toBeCloseTo(8 * ((22500 * 1.2875) / 225) * 1.5);
    const A = mesaiAtamasi(u);
    expect(A.liste[0]?.kisiler.map((k) => k.id)).toEqual(['P1']);
    expect(A.liste[0]?.ihlal).toEqual([]);
  });

  // 570 a: aynı gün, vardiya ve gruptaki ek vardiyalar operatörü paylaşır.
  it('ek mesaide oranı 0,5 olan iki tezgâh tek kişiyle, oranı 1 olan iki tezgâh iki kişiyle; başka grup ayrı sayılır', () => {
    const D = (op: number) => ({
      tezgahlar: [
        { id: 'T1', ad: 'Deneme torna 1', grup: 'TORNA', ucret: 100, verim: 1, opOran: op }, { id: 'T3', ad: 'Deneme torna 2', grup: 'TORNA', ucret: 100, verim: 1, opOran: op },
        { id: 'T2', ad: 'Deneme freze', grup: 'FREZE', ucret: null, verim: 1, opOran: op },
      ],
      personel: [{ id: 'P1', ad: 'Deneme Bir', vardiya: 'V1', gruplar: ['TORNA', 'FREZE'] }, { id: 'P2', ad: 'Deneme Iki', vardiya: 'V1', gruplar: ['TORNA', 'FREZE'] }],
    });
    const ek = [{ m: 'T1', gun: 5, vardiya: 'V1' }, { m: 'T3', gun: 5, vardiya: 'V1' }, { m: 'T2', gun: 5, vardiya: 'V1' }];
    const yarim = mesaiAtamasi(ornekCalisma({ ekMesai: ek, D: D(0.5) }));
    expect(yarim.liste.map((a) => [a.tezgah.id, a.kisiler.map((k) => k.id), a.ihlal])).toEqual([['T1', ['P1'], []], ['T3', ['P1'], []], ['T2', ['P2'], []]]);
    expect(yarim.plan).toEqual({ P1: 8, P2: 8 });
    const tam = mesaiAtamasi(ornekCalisma({ ekMesai: ek, D: D(1) }));
    expect(tam.liste.slice(0, 2).map((a) => [a.tezgah.id, a.kisiler.map((k) => k.id)])).toEqual([['T1', ['P1']], ['T3', ['P2']]]);
  });

  it('fason dönüşü: termin yoksa ve iş bir hafta içinde çıkıyorsa hata; termin siparişi karşılıyorsa tamam', () => {
    const c = ornekCalisma();
    const L = fasonIsleri(c, isTanimlari(c, takvimKur(c)));
    expect(L.map((x) => x.id)).toEqual(['S1.20']);
    const x = L[0];
    if (!x) throw new Error('fason işi yok');
    expect(x.ger).toBe(112);
    expect(fasonDurumu(x)).toEqual(['Termin yok, bir hafta içinde çıkıyor', 'hata']);
    const t = ornekCalisma({ D: { fasonTermin: { 'S1.20': '2026-01-07 16:00' } } });
    const y = fasonIsleri(t, isTanimlari(t, takvimKur(t)))[0];
    if (!y) throw new Error('fason işi yok');
    expect(y.T).toBe(64);
    expect(fasonDurumu(y)).toEqual(['Karşılıyor', 'tamam']);
  });

  it('kayıtlı olaylar: süre sapması adımın süresini çarpar, sonraki olay ezer; fason gecikmesi dönüş tahminini uzatır', () => {
    const c = ornekCalisma();
    const T = takvimKur(c);
    const once = isTanimlari(c, T).get('S1.10')?.secenekler[0]?.run ?? 0;
    const tahmin0 = fasonIsleri(c, isTanimlari(c, T))[0]?.tahmini ?? 0;
    c.olaylar.push({ tip: 'sure', urun: 'U1', k: '10', oran: 2 }, { tip: 'sureOp', id: 'S1.10', oran: 1.5 }, { tip: 'fason', f: 'F1', gun: 3 });
    expect(sureSapmasi(c)).toEqual({ 'S1.10': 1.5 });
    expect(isTanimlari(c, T).get('S1.10')?.secenekler[0]?.run).toBeCloseTo(once * 1.5);
    const tahmin1 = fasonIsleri(c, isTanimlari(c, T))[0]?.tahmini ?? 0;
    expect(tahmin1).toBeGreaterThan(tahmin0);
  });

  it('girdi denetimi ve yardımcılar', () => {
    expect(sayiGirdisi('12,5')).toEqual({ tamam: true, deger: 12.5 });
    expect(sayiGirdisi('')).toEqual({ tamam: true, deger: null });
    expect(sayiGirdisi('x').tamam).toBe(false);
    expect(sayiGirdisi('-1').tamam).toBe(false);
    expect(sayiGirdisi('150', { max: 100 }).tamam).toBe(false);
    expect(sonrakiKimlik([{ id: 'K3' }, { id: 'K1' }], 'K')).toBe('K4');
    expect(kisaTl(25000)).toBe('25 bin');
    expect(kisaTl(null)).toBe('');
  });

  it('kalem kipinde genel gider saat ücreti olmayan tezgâhın adımına da yazılır; tek oranda yazılmaz (msGgOran, ymSipMaliyet)', () => {
    const ms = { kalemler: [{ id: 'K1', ad: 'Kira', tur: 'kira', aylik: 3000, anahtar: 'esit', kapsam: '' }], tez: { T1: { bedel: 120000, omur: 10 }, T2: { bedel: 60000, omur: 10 } } };
    const ucretsiz = [{ id: 'T1', ad: 'Deneme torna', grup: 'TORNA', ucret: null, verim: 1 }, { id: 'T2', ad: 'Deneme freze', grup: 'FREZE', ucret: null, verim: 1 }];
    const kalem = ornekCalisma({ D: { tezgahlar: ucretsiz, maliyetSis: { ...ms, kip: 'kalem' } } });
    const bk = maliyetBaglami(kalem);
    const s = kalem.D.siparisler[0];
    if (!bk || !s) throw new Error('bağlam yok');
    const mk = siparisMaliyeti(bk, s);
    expect(mk?.isl).toBe(0);
    expect(mk?.eksik).toContain('T1 saat maliyeti');
    expect(mk?.gg).toBeCloseTo(2 * (genelGiderOrani(kalem.D, bk.G, 'T1') ?? Number.NaN));
    expect(mk?.gg ?? 0).toBeGreaterThan(0);
    const tek = ornekCalisma({ D: { tezgahlar: ucretsiz, maliyetSis: { ...ms, kip: 'tek' } } });
    const bt = maliyetBaglami(tek);
    if (!bt) throw new Error('bağlam yok');
    expect(siparisMaliyeti(bt, s)?.gg).toBe(0);
  });

  it('kalem kipinde amortismanı bilinmeyen tezgâhın oranı ve siparişin genel gideri bilinmez (null); toplam onu atlar', () => {
    const ms = { kip: 'kalem', kalemler: [{ id: 'K1', ad: 'Kira', tur: 'kira', aylik: 3000, anahtar: 'esit', kapsam: '' }] };
    const c = ornekCalisma({ D: { maliyetSis: ms } });
    const b = maliyetBaglami(c); const s = c.D.siparisler[0];
    if (!b || !s) throw new Error('bağlam yok');
    expect(b.G.tez.every((z) => z.oran === null)).toBe(true);
    expect(b.G.ort).toBeNull();
    expect(genelGiderOrani(c.D, b.G, 'T1')).toBeNull();
    const m = siparisMaliyeti(b, s);
    expect(m?.gg).toBeNull();
    expect(m?.top).toBeCloseTo((m?.mal ?? 0) - (m?.talas ?? 0) + (m?.isl ?? 0) + (m?.ayar ?? 0) + (m?.fas ?? 0) + (m?.mes ?? 0));
  });

  it('tezgâhın oranı yoksa atölye ortalaması; ortalama yoksa ya da sıfırsa tek orana düşer', () => {
    const c = ornekCalisma({ D: { maliyetSis: { kip: 'kalem', kalemler: [] }, planTL: { genelGider: 80 } } });
    const G = genelGiderHesabi(c, takvimKur(c));
    expect(genelGiderOrani(c.D, { ...G, tez: [], ort: 0 }, 'T1')).toBe(80);
    expect(genelGiderOrani(c.D, { ...G, tez: [], ort: null }, 'T1')).toBe(80);
    expect(genelGiderOrani(c.D, { ...G, tez: [], ort: 12 }, 'T1')).toBe(12);
  });

  it('erken sevki kabul eden siparişte vade üretim bitince başlar: termine kalan süre bekleme değil erken tahsilattır', () => {
    const sip = (erkenSevk: boolean) => [{ id: 'S1', urun: 'U1', adet: 2, termin: '2026-01-09 16:00', gelir: 1000, erkenSevk, malzeme: [{ kod: 'M1', miktar: 1.5 }] }];
    const W = (erkenSevk: boolean) => {
      const c = ornekCalisma({ D: { siparisler: sip(erkenSevk), planTL: { wip: { vadeBas: 'termin' } } } });
      const T = takvimKur(c);
      return beklemeHesabi(c, T, isTanimlari(c, T)).J['S1'];
    };
    expect(W(false)?.tah).toBe(0);
    expect(W(false)?.son ?? 0).toBeGreaterThan(0);
    expect(W(true)?.son).toBe(0);
    expect(W(true)?.tah ?? 0).toBeLessThan(0);
  });
});
