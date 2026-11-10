import { describe, expect, it } from 'vitest';
import {
  beklemeHesabi, bitenAdimMaliyeti, birimMaliyet, calisilir, katkiPayi, fasonDurumu, genelGiderOrani, fasonIsleri, genelGiderHesabi, isTanimlari, maliyetBaglami, malzemeler, malzemeTutari, mesaiAtamasi,
  mesaiBedeli, mesaiSistemi, planMaliyeti, sayiGirdisi, siparisMaliyeti, sonrakiKimlik, sureSapmasi, takvimKur, talasKredisi, kisaTl,
} from './kurallar.ts';
import { mesaiTutari } from './kurallar.ts';
import { ornekCalisma } from './test-verisi.ts';

import { saatiSabitle } from '../test-saati.ts';

saatiSabitle(() => ornekCalisma());

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

  it('1280 a: birim maliyet Satın Alma\'dan (malzemenin fiyatı); planın kg satırındaki eski fiyat okunmaz, yalnız fire payı; formu boş satır kalitenin bütün formlarına geçer', () => {
    const c = ornekCalisma({ D: { kgFiyat: [{ id: 'KG-1', kalite: 'K1', form: '', fiyat: 20, fire: 10 }] } });
    const m = malzemeler(c.D)[0];
    if (!m) throw new Error('malzeme yok');
    expect(birimMaliyet(c.D, m)).toBe(10);
    const s = c.D.siparisler[0];
    if (!s) throw new Error('sipariş yok');
    expect(malzemeTutari(c.D, s)).toBeCloseTo(10 * 1.5 * 1.1 * 2);
  });

  it('1329: fiyatı olmayan malzemede tutar bilinmez; tahmini fiyat ve Satın Alma kg başvurusu okunur', () => {
    const c = ornekCalisma();
    const ham = c.D.malzemeler?.[0];
    if (!ham) throw new Error('malzeme yok');
    const yok = ornekCalisma({ D: { malzemeler: [{ ...ham, birimFiyat: null }] } });
    const s = yok.D.siparisler[0];
    if (!s) throw new Error('sipariş yok');
    expect(malzemeTutari(yok.D, s)).toBeNull();
    const kgRef = { kalite: 'K1', form: 'Çubuk', tarih: '2026-10-01', tlKg: 12, kgFiyati: 12, paraBirimi: 'TRY' };
    const t = malzemeler(ornekCalisma({ D: { malzemeler: [{ ...ham, birimFiyat: 12, fiyatTahmini: true, kgRef }] } }).D)[0];
    expect([t?.kaynakFiyat, t?.fiyatTahmini, t?.kgRef]).toEqual([12, true, kgRef]);
    expect(malzemeler(c.D)[0]?.kgRef).toBeNull();
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

  // 2728 a: brüt ücret kayıtta tutulmaz; eski kayıtta dursa da bedel ondan hesaplanmaz, grup saat maliyeti gelene kadar bilinmez.
  it('ek mesai takvime girer; kişi bazlı bedel bilinmez, eski kayıttaki brüt hesaba girmez', () => {
    const ek = [{ m: 'T1', gun: 5, vardiya: 'V1' }];
    const c = ornekCalisma({ ekMesai: ek });
    const T = takvimKur(c);
    expect(calisilir(T.M.T1?.rw ?? [], 120, 144)).toBe(8);
    const e = { m: 'T1', gun: 5, vardiya: 'V1' };
    expect(mesaiBedeli(c, T, e)).toBeNull();
    const u = ornekCalisma({ ekMesai: ek, D: { mesaiSis: { ucret: { P1: { brut: 1000, yil: 4 } } } } });
    expect(mesaiBedeli(u, takvimKur(u), e)).toBeNull();
    expect(mesaiSistemi(u.D).ucret).toEqual({ P1: { yil: 4 } });
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

  it('kalem kaydı okunmaz: saat ücreti olmayan tezgâhın adımına genel gider yazılmaz, kip ne olursa olsun (2608, 2723)', () => {
    const ms = { kalemler: [{ id: 'K1', ad: 'Kira', tur: 'kira', aylik: 3000, anahtar: 'esit', kapsam: '' }], tez: { T1: { bedel: 120000, omur: 10 }, T2: { bedel: 60000, omur: 10 } } };
    const ucretsiz = [{ id: 'T1', ad: 'Deneme torna', grup: 'TORNA', ucret: null, verim: 1 }, { id: 'T2', ad: 'Deneme freze', grup: 'FREZE', ucret: null, verim: 1 }];
    for (const kip of ['kalem', 'tek']) {
      const c = ornekCalisma({ D: { tezgahlar: ucretsiz, maliyetSis: { ...ms, kip } } });
      const b = maliyetBaglami(c); const s = c.D.siparisler[0];
      if (!b || !s) throw new Error('bağlam yok');
      const mk = siparisMaliyeti(b, s);
      expect(mk?.isl).toBe(0);
      expect(mk?.eksik).toContain('T1 saat maliyeti');
      expect(mk?.gg).toBe(0);
    }
  });

  it('kalem kaydı okunmaz: amortismanı bilinmeyen tezgâhta da oran Finans oranıdır; bilgi hesabı yine null kalır', () => {
    const ms = { kip: 'kalem', kalemler: [{ id: 'K1', ad: 'Kira', tur: 'kira', aylik: 3000, anahtar: 'esit', kapsam: '' }] };
    const c = ornekCalisma({ D: { maliyetSis: ms, planTL: { genelGider: 80 } } });
    const b = maliyetBaglami(c); const s = c.D.siparisler[0];
    if (!b || !s) throw new Error('bağlam yok');
    expect(b.G.tez.every((z) => z.oran === null)).toBe(true);
    expect(b.G.ort).toBeNull();
    expect(genelGiderOrani(c.D)).toBe(80);
    expect(siparisMaliyeti(b, s)?.gg).not.toBeNull();
  });

  it('genel gider tek oranı girilmemişse oran ve siparişin genel gideri bilinmez (null), 120 TL/sa varsayılmaz (2173-1 a); toplam onu atlar', () => {
    for (const kip of ['tek', 'kalem']) {
      const c = ornekCalisma({ D: { planTL: {}, maliyetSis: { kip, kalemler: [] } } });
      const b = maliyetBaglami(c); const s = c.D.siparisler[0];
      if (!b || !s) throw new Error('bağlam yok');
      expect(genelGiderOrani(c.D)).toBeNull();
      const m = siparisMaliyeti(b, s);
      expect(m?.gg).toBeNull();
      expect(m?.top).toBeCloseTo((m?.mal ?? 0) - (m?.talas ?? 0) + (m?.isl ?? 0) + (m?.ayar ?? 0) + (m?.fas ?? 0) + (m?.mes ?? 0));
    }
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

  it('1410 a: sipariş maliyeti ve kârı biten adımları da sayar (iş emri durumundan ya da kayıttaki bitenlerden); planda olan adım iki kez sayılmaz', () => {
    // Tornalama bitti, planda yalnız kaplama kaldı. Gelir 1000; malzeme 30; tornalama 2 adet × 60 dk, acil pay %5 süreye eklenip ücretten düşer: 200; kaplama 10.
    const yari = ornekCalisma({ plan: { dataVer: 1, ops: { 'S1.20': { id: 'S1.20', job: 'S1', m: '@F1', S: 10, C: 58, su: 0, run: 0, fas: true } }, J: { S1: { C: 58, T: 0 } } } });
    const s = yari.D.siparisler[0]!;
    const eski = siparisMaliyeti(maliyetBaglami(yari)!, s);
    expect(eski?.isl).toBe(0);
    expect(eski?.kar).toBeCloseTo(960);
    const emirler = { orders: [], opStatus: { 'S1|root|1': 'tamam' } };
    const m = siparisMaliyeti(maliyetBaglami(yari, emirler)!, s);
    expect(m?.isl).toBeCloseTo(200);
    expect(m?.fas).toBe(10);
    expect(m?.kar).toBeCloseTo(760);
    expect(siparisMaliyeti(maliyetBaglami({ ...yari, bitti: { 'S1.10': 1 } })!, s)?.kar).toBeCloseTo(760);
    // Kaplama hem planda hem biten listesinde olsa da bir kez sayılır.
    expect(siparisMaliyeti(maliyetBaglami({ ...yari, bitti: { 'S1.10': 1, 'S1.20': 1 } })!, s)?.fas).toBe(10);
    // Biten adımın tezgâh ücreti bilinmezse kâr bilinmez (null), sıfır uydurulmaz.
    const ucretsiz = { ...yari, D: { ...yari.D, tezgahlar: yari.D.tezgahlar.map((t) => ({ ...t, ucret: null })) } };
    const u = siparisMaliyeti(maliyetBaglami(ucretsiz, emirler)!, s);
    expect(u?.eksik).toContain('T1 saat maliyeti');
    expect(u?.kar).toBeNull();
  });

  it('1379 a: katkı payı siparişin bütün adımlarıyla; biten adım plana girmese de rotadaki ilk tezgâhın ücretiyle düşülür', () => {
    // Gelir 1000; malzeme 2 × 1,5 kg × 10 = 30; tornalama 2 adet × 60 dk × 100 TL/sa = 200; kaplama 2 × 5 = 10.
    const tam = ornekCalisma();
    expect(katkiPayi(tam, tam.D.siparisler[0]!)).toBe(760);
    // Tornalama bitti: plandan düştü. Eski hesap yalnız kalanı düşerdi: 1000 − 30 − 10 = 960. Yeni hesap 760, tam plandakiyle aynı.
    const yari = ornekCalisma({ plan: { dataVer: 1, ops: { 'S1.20': { id: 'S1.20', job: 'S1', m: '@F1', S: 10, C: 58, su: 0, run: 0, fas: true } }, J: { S1: { C: 58, T: 0 } } } });
    const yariBitti = { ...yari, bitti: { 'S1.10': 1 } };
    expect(katkiPayi(yari, yari.D.siparisler[0]!)).toBe(960);
    expect(bitenAdimMaliyeti(yariBitti, yari.D.siparisler[0]!)).toBe(200);
    expect(katkiPayi(yariBitti, yari.D.siparisler[0]!)).toBe(760);
    // Biten adımın tezgâh ücreti bilinmezse katkı bilinmez (null), sıfır uydurulmaz.
    const ucretsiz = { ...yariBitti, D: { ...yariBitti.D, tezgahlar: yariBitti.D.tezgahlar.map((t) => ({ ...t, ucret: null })) } };
    expect(katkiPayi(ucretsiz, ucretsiz.D.siparisler[0]!)).toBeNull();
  });
});

// 2653: sunucunun mesai tutarı kopyası bu tabloyla sınanır; tablo devir-heylit/2653/ORNEKLER.md ile aynıdır, biri değişirse öteki de değişir.
const MESAI_ORNEKLERI: [string, Parameters<typeof mesaiTutari>[0], number | null][] = [
  ['M1 hafta içi', { h: 8, kisiBazli: true, op: 1, saatDegeri: 400, carpan: 1.5, kisiEk: 150, ucret: null, vardiyasiz: false, mesaiCarpan: undefined }, 4950],
  ['M2 cumartesi, iki operatör', { h: 8, kisiBazli: true, op: 2, saatDegeri: 350, carpan: 2, kisiEk: 100, ucret: null, vardiyasiz: false, mesaiCarpan: undefined }, 11400],
  ['M3 pazar, yarım operatör', { h: 7.5, kisiBazli: true, op: 0.5, saatDegeri: 500, carpan: 2, kisiEk: 0, ucret: null, vardiyasiz: false, mesaiCarpan: undefined }, 3750],
  ['M4 resmî tatil', { h: 8, kisiBazli: true, op: 1, saatDegeri: 420, carpan: 2.5, kisiEk: 120, ucret: null, vardiyasiz: true, mesaiCarpan: 3 }, 8520],
  ['M5 gün çarpanı yok: 1,5', { h: 4, kisiBazli: true, op: 1, saatDegeri: 300, carpan: undefined, kisiEk: null, ucret: null, vardiyasiz: false, mesaiCarpan: undefined }, 1800],
  ['M6 operatör oranı tanımsız: 1', { h: 8, kisiBazli: true, op: undefined, saatDegeri: 400, carpan: 1.5, kisiEk: 150, ucret: null, vardiyasiz: false, mesaiCarpan: undefined }, 4950],
  ['M7 saat değeri yok: mesai ücretine düşer', { h: 8, kisiBazli: true, op: 2, saatDegeri: null, carpan: 2, kisiEk: 100, ucret: 250, vardiyasiz: false, mesaiCarpan: 2 }, 2000],
  ['M8 saat değeri yok, vardiyasız gün', { h: 8, kisiBazli: true, op: 1, saatDegeri: null, carpan: 2, kisiEk: 100, ucret: 250, vardiyasiz: true, mesaiCarpan: 2 }, 4000],
  ['M9 saat değeri ve ücret yok: bilinmez', { h: 8, kisiBazli: true, op: 1, saatDegeri: null, carpan: 1.5, kisiEk: 100, ucret: null, vardiyasiz: false, mesaiCarpan: 2 }, null],
  ['M10 kişi bazlı değil, vardiyasız gün, çarpan yok: 1', { h: 8, kisiBazli: false, op: 1, saatDegeri: 400, carpan: 2, kisiEk: 100, ucret: 300, vardiyasiz: true, mesaiCarpan: undefined }, 2400],
];
describe('mesaiTutari (2653 ortak örnekler)', () => {
  it.each(MESAI_ORNEKLERI)('%s', (_ad, girdi, beklenen) => { expect(mesaiTutari(girdi)).toBe(beklenen); });
});
