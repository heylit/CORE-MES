import { describe, expect, test } from 'vitest';
import type { AyiklamaSonucu, Alan, DisNesne, Kaynaklar, YaziTipi } from './ayiklama.ts';
import { AyiklamaHatasi, ayikla, islemler } from './ayiklama.ts';

const bayt = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));
const metin = (v: Uint8Array) => String.fromCharCode(...v);
// Her harf yazı boyunun yarısı genişliğinde (sentetik).
const YARIM: YaziTipi = { ikiBayt: false, genislik: () => 0.5 };
const BILINMEZ: YaziTipi = { ikiBayt: false, genislik: () => null };

function kaynak(yt: Record<string, YaziTipi>, dis: Record<string, DisNesne> = {}): Kaynaklar {
  return { yaziTipi: (a) => yt[a] ?? null, disNesne: (a) => dis[a] ?? null };
}
const alan = (x: number, y: number, en: number, boy: number): Alan => ({ x, y, en, boy });

describe('İçerik akışı belirteçleri (2123b)', () => {
  test('AY-01: kaçışlı ve onaltılık metin, dizi, sözlük, yorum ve satır içi resim ayrılır', () => {
    const l = islemler(bayt('% yorum\nBT (a\\(b\\)\\101) Tj <4142> Tj [(x) -20 <43>] TJ ET /P <</MCID 0>> BDC EMC BI /W 1 /H 1 ID \x00EI\x01 EI Q'));
    expect(l.map((i) => i.op)).toEqual(['BT', 'Tj', 'Tj', 'TJ', 'ET', 'BDC', 'EMC', 'BI', 'Q']);
    expect(l[1]!.arg).toEqual([{ t: 'metin', v: [...'a(b)A'].map((c) => c.charCodeAt(0)) }]);
    expect(l[2]!.arg).toEqual([{ t: 'metin', v: [0x41, 0x42] }]);
    expect(l[3]!.arg[0]).toEqual({ t: 'dizi', v: [{ t: 'metin', v: [120] }, { t: 'sayi', v: -20 }, { t: 'metin', v: [0x43] }] });
  });

  test('AY-02: bozuk akış hata verir', () => {
    expect(() => islemler(bayt('BT (kapanmayan Tj'))).toThrow(AyiklamaHatasi);
    expect(() => islemler(bayt('[1 2'))).toThrow(AyiklamaHatasi);
    expect(() => islemler(bayt('1 2'))).toThrow(AyiklamaHatasi);
  });
});

describe('Alandaki nesnelerin ayıklanması (2123b)', () => {
  test('AY-03: yalnız alana değen harf silinir; yeri TJ kaymasıyla korunur, satırın kalanı aynı kalır', () => {
    // Harfler 5 birim: A 100-105, B 105-110, C 110-115, D 115-120. Alan yalnız B'ye değer.
    const s = ayikla(bayt('BT /F1 10 Tf 1 0 0 1 100 100 Tm (ABCD) Tj ET'), kaynak({ F1: YARIM }), [alan(106, 98, 2, 6)]);
    expect(s.degisti).toBe(true);
    expect(s.sayac.yazi).toBe(1);
    expect(metin(s.icerik)).toContain('[<41> -500 <4344>] TJ');
    expect(metin(s.icerik)).not.toContain('(ABCD)');
  });

  test('AY-04: alana değmeyen akış bayt bayt aynı döner', () => {
    const v = bayt('BT /F1 10 Tf 1 0 0 1 100 100 Tm (ABCD) Tj ET 0 0 m 10 10 l S');
    const s = ayikla(v, kaynak({ F1: YARIM }), [alan(300, 300, 10, 10)]);
    expect(s.degisti).toBe(false);
    expect(s.icerik).toBe(v);
  });

  test('AY-05: cm ve Tz dönüşümleri hesaba katılır; TJ içindeki kaymalar korunur', () => {
    // cm 2 kat büyütür: metin 200,200'de başlar, harf 10 birim. Tz 50 yarıya indirir: harf 5 birim.
    const s = ayikla(bayt('q 2 0 0 2 0 0 cm BT /F1 10 Tf 50 Tz 1 0 0 1 100 100 Tm [(AB) -1000 (C)] TJ ET Q'), kaynak({ F1: YARIM }), [alan(201, 198, 2, 6)]);
    expect(metin(s.icerik)).toContain('[-500 <42> -1000 <43>] TJ');
  });

  test("AY-06: ' ve \" silinince satır atlaması ve aralıklar kalır", () => {
    const s = ayikla(bayt('BT /F1 10 Tf 12 TL 1 0 0 1 100 112 Tm (X) \' 2 1 (Y) " ET'), kaynak({ F1: YARIM }), [alan(0, 0, 595, 105)]);
    const m = metin(s.icerik);
    expect(m).toContain('T*\n[-500] TJ');
    expect(m).toContain('2 Tw 1 Tc T*\n[-');
    expect(m).not.toContain('(X)');
    expect(m).not.toContain('(Y)');
  });

  test('AY-07: genişliği bilinmeyen yazı tümüyle silinir; aynı satırda arkasından yazı gelirse iş durur', () => {
    const tek = ayikla(bayt('BT /F9 10 Tf 1 0 0 1 100 100 Tm (GIZLI) Tj 0 -20 Td (KALIR) Tj ET'), kaynak({ F9: BILINMEZ }), [alan(100, 98, 20, 8)]);
    expect(metin(tek.icerik)).not.toContain('GIZLI');
    expect(metin(tek.icerik)).toContain('(KALIR) Tj');
    expect(() => ayikla(bayt('BT /F9 10 Tf 1 0 0 1 100 100 Tm (GIZLI) Tj (KALIR) Tj ET'), kaynak({ F9: BILINMEZ }), [alan(100, 98, 10, 8)]))
      .toThrow('genişliği bilinmiyor');
  });

  test('AY-08: iki baytlık yazı tipinde harf iki bayttır', () => {
    const cid: YaziTipi = { ikiBayt: true, genislik: () => 0.5 };
    const s = ayikla(bayt('BT /C 10 Tf 1 0 0 1 100 100 Tm <000100020003> Tj ET'), kaynak({ C: cid }), [alan(106, 98, 2, 6)]);
    expect(metin(s.icerik)).toContain('[<0001> -500 <0003>] TJ');
  });

  test('AY-09: resmin yarısından çoğu alandaysa silinir; sayfayı kaplayan resim yalnız örtülür ve sayılır', () => {
    const dis: Record<string, DisNesne> = { Logo: { tur: 'resim' }, Tarama: { tur: 'resim' } };
    const s = ayikla(bayt('q 595 0 0 842 0 0 cm /Tarama Do Q q 40 0 0 20 100 100 cm /Logo Do Q BI /W 1 /H 1 ID x EI'), kaynak({}, dis), [alan(95, 95, 50, 30)]);
    expect(s.sayac).toEqual({ yazi: 0, resim: 1, cizim: 0, ortulenResim: 1 });
    expect(metin(s.icerik)).not.toContain('/Logo Do');
    expect(metin(s.icerik)).toContain('/Tarama Do');
    expect([...s.kullanilanNesneler]).toEqual(['Tarama']);
    const ici = ayikla(bayt('q 1 0 0 1 100 100 cm BI /W 1 /H 1 ID x EI Q'), kaynak({}), [alan(95, 95, 50, 30)]);
    expect(metin(ici.icerik)).not.toContain('BI');
  });

  test('AY-10: tümü alanda olan yol silinir; alandan geçen çerçeve ve kırpma yolu kalır', () => {
    const v = bayt('100 100 m 120 110 l S 0 105 m 595 105 l S 90 90 50 50 re W n 100 100 5 5 re f');
    const s = ayikla(v, kaynak({}), [alan(95, 95, 50, 30)]);
    const m = metin(s.icerik);
    expect(s.sayac.cizim).toBe(2);
    expect(m).not.toContain('120 110 l');
    expect(m).toContain('595 105 l');
    expect(m).toContain('90 90 50 50 re');
    expect(m).not.toContain('100 100 5 5 re');
  });

  test('AY-11: form içi ayıklanır ve yeni adla yazılır; değişmeyen form adıyla kalır', () => {
    const yazilan: AyiklamaSonucu[] = [];
    const form = (ic: string): DisNesne => ({
      tur: 'form', matris: [1, 0, 0, 1, 100, 100], icerik: bayt(ic), kaynaklar: kaynak({ F1: YARIM }),
      yaz: (s) => { yazilan.push(s); return 'Yeni1'; },
    });
    const s = ayikla(bayt('/Fm1 Do /Fm2 Do'), kaynak({}, { Fm1: form('BT /F1 10 Tf (AB) Tj ET'), Fm2: form('BT /F1 10 Tf 0 300 Td (AB) Tj ET') }), [alan(100, 98, 20, 8)]);
    expect(yazilan).toHaveLength(1);
    expect(metin(yazilan[0]!.icerik)).toContain('[-500 -500] TJ');
    expect(metin(s.icerik)).toContain('/Yeni1 Do');
    expect(metin(s.icerik)).toContain('/Fm2 Do');
    expect([...s.kullanilanNesneler].sort()).toEqual(['Fm2', 'Yeni1']);
  });

  test('AY-12: silme olan işaretli içeriğin özellikleri (ActualText) düşer; katman (OC) ve dokunulmayan içerik kalır', () => {
    const v = bayt('/Span <</ActualText (GIZLI FIRMA)>> BDC BT /F1 10 Tf 1 0 0 1 100 100 Tm (AB) Tj ET EMC '
      + '/OC /K1 BDC BT /F1 10 Tf 1 0 0 1 100 100 Tm (CD) Tj ET EMC /Span <</ActualText (KALAN)>> BDC BT /F1 10 Tf 1 0 0 1 300 300 Tm (EF) Tj ET EMC');
    const m = metin(ayikla(v, kaynak({ F1: YARIM }), [alan(100, 98, 20, 8)]).icerik);
    expect(m).not.toContain('GIZLI');
    expect(m).toContain('/Span BMC');
    expect(m).toContain('/OC /K1 BDC');
    expect(m).toContain('(KALAN)');
  });
});
