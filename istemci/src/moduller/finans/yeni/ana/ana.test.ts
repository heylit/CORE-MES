import { describe, expect, it } from 'vitest';
import { createContext, runInContext } from 'node:vm';
import { prototipYukle } from '../../prototip.ts';
import { finansMotoru } from '../motor.ts';
import { genisDurum, ornekDurum, ORNEK_BUGUN } from '../ornek-veri.ts';
import { anaSayilar, gununOzeti, nakitHukmu, selam, type Parca } from './ozet.ts';
import { veriTamligi } from './tamlik.ts';
import { yapilacaklar } from './yapilacaklar.ts';

// Ana sayfanın saf hesapları prototiptekiyle aynı girdide aynı sonucu verir (inbox, briefing, completeness).
const html = await prototipYukle();
const kes = (bas: string, son: string): string => html.slice(html.indexOf(bas), html.indexOf(son, html.indexOf(bas)));
const blok = html.slice(html.indexOf('/*ENGINE-START*/'), html.indexOf('/*ENGINE-END*/'));
const ekler = [
  kes('function openFindings(A)', 'const scoreColor'),
  kes('function recoState(id)', 'function openFindings'),
  kes('function inbox()', 'function inboxRow'),
  kes('function briefing()', '{\n  const baseHome'),
  kes('function completeness()', 'function completenessCard'),
].join('\n');

function kur(genis: boolean) {
  const motor = finansMotoru(ORNEK_BUGUN);
  const durum = genis ? genisDurum(motor) : ornekDurum(motor);
  durum.cheques.forEach((q, i) => { q._cekId = i + 1; });
  durum.recurring.push({ id: 'r9', name: 'Kredi taksiti', cat: 'Kredi anapara', amount: 12000, day: 18, _duzenliId: 9 });
  motor.durum = motor.normalize(JSON.parse(JSON.stringify(durum)));
  const baglam = createContext({});
  runInContext(blok + '\n' + ekler, baglam);
  runInContext(`setToday(${JSON.stringify(ORNEK_BUGUN)}); state = normalize(${JSON.stringify(motor.durum)});`, baglam);
  return { motor, baglam };
}

// Prototipin HTML'li cümlesi: kalın tutar <b>, olumsuz <b class="neg">.
const htmlYaz = (p: Parca[][]) => p.map((c) => c.map((x) => (typeof x === 'string' ? x : `<b${x.olumsuz ? ' class="neg"' : ''}>${x.kalin}</b>`)).join('')).join(' ');

describe('F4 ana sayfa: prototip eşitliği', () => {
  for (const genis of [false, true]) {
    const ad = genis ? 'geniş veri' : 'örnek veri';
    it(`yapılacaklar (${ad})`, () => {
      const { motor, baglam } = kur(genis);
      const eski = runInContext('inbox().map(x => ({ g: x.g, date: x.date, kind: x.kind, t: x.t, s: x.s, amt: x.amt, n: x.acts.length }))', baglam) as object[];
      const yeni = yapilacaklar(motor);
      expect(yeni.map((x) => ({ g: x.g, date: x.date, kind: x.kind, t: x.baslik, s: x.alt, amt: x.tutar, n: x.eylemler.length }))).toEqual(JSON.parse(JSON.stringify(eski)));
      expect(yeni.length).toBeGreaterThan(2);
    });
    it(`günün özeti (${ad})`, () => {
      const { motor, baglam } = kur(genis);
      const A = motor.runAnalysis();
      expect(htmlYaz(gununOzeti(motor, A, yapilacaklar(motor)))).toBe(runInContext('briefing()', baglam));
    });
    it(`veri tamlığı (${ad})`, () => {
      const { motor, baglam } = kur(genis);
      const eski = runInContext('completeness().map(x => ({ ok: x.ok, t: x.t }))', baglam) as object[];
      expect(veriTamligi(motor).map((x) => ({ ok: x.ok, t: x.baslik }))).toEqual(JSON.parse(JSON.stringify(eski)));
    });
  }
});

describe('F4 ana sayfa: sayılar ve metinler', () => {
  it('dört temel sayı örnek veride elle hesaplanan değerdir', () => {
    const { motor } = kur(false);
    const s = anaSayilar(motor, []);
    expect(s.nakit).toBe(motor.cashToday());
    expect(s.alacak).toBe(60000);
    expect(s.alacakGeciken).toBe(0);
    expect(s.alacakCek).toBe(5000);
    expect(s.borc).toBe(14400);
    expect(s.borcHafta).toBe(14400);
    expect(s.siparisHafta).toEqual({ adet: 0, tutar: 0 });
  });

  it('çek satırının düğmeleri gruba ve duruma göredir; sunucu kimliği taşır', () => {
    const { motor } = kur(true);
    const ib = yapilacaklar(motor);
    const portfoy = ib.find((x) => x.baslik.includes('Deneme Musteri çeki'))!;
    expect(portfoy.g).toBe(2);
    expect(portfoy.eylemler.map((e) => e.etiket)).toEqual(['Bankaya verdim', 'Tahsil edildi']);
    const verilen = ib.find((x) => x.baslik === 'Verilen çek · hesapta para bulunmalı')!;
    expect(verilen.g).toBe(1);
    expect(verilen.eylemler).toEqual([{ tur: 'cek', etiket: 'Ödendi', durum: 'odendi', birincil: true, cekId: expect.any(Number) }]);
    const kredi = ib.find((x) => x.baslik === 'Kredi taksiti')!;
    expect(kredi.eylemler).toEqual([{ tur: 'duzenli', etiket: 'Ödendi', duzenliId: 9, birincil: true }]);
  });

  it('nakit hükmü tolerans ve eşik olasılığına göre', () => {
    const { motor } = kur(false);
    const A = motor.runAnalysis();
    const mc = A.mc!;
    expect(nakitHukmu(motor, { ...A, mc: { ...mc, pNeg: 0.5 } })).toMatchObject({ ton: 'hata' });
    expect(nakitHukmu(motor, { ...A, mc: { ...mc, pNeg: 0, pBelow: 0.3 } })).toMatchObject({ ton: 'uyari' });
    expect(nakitHukmu(motor, { ...A, mc: { ...mc, pNeg: 0, pBelow: 0 } })).toEqual({ ton: 'tamam', metin: 'Önümüzdeki 13 hafta nakit yeterli görünüyor.' });
    expect(nakitHukmu(motor, { ...A, mc: null })).toBeNull();
  });

  it('selam saate göre', () => {
    expect([selam(9), selam(14), selam(20)]).toEqual(['Günaydın', 'İyi günler', 'İyi akşamlar']);
  });
});
