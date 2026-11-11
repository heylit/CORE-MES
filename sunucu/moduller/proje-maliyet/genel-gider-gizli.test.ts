import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { MALIYET_KALEMLERI, projeMaliyetCevabi } from '#paylasilan/sozlesme/proje-maliyet.ts';
import {
  beklemeFinansmani, defteriUygula, eksikKalemler, gecikmeCezasi, genelGiderGizliMaskesi, genelGiderGizliMi, gostergeler, haftalikBirikim, isEmriKaydi,
  kalemKirilimi, karRiski, sapanIsEmirleri, tabanMaskesi,
} from './kurallar.ts';
import type { IsEmriGirdisi, MaliyetKaydi, MaskelenecekMaliyet } from './kurallar.ts';

// 2663 (2661 a, Maliyet C2, Güvenlik K1): türeme denetimi. Cevabın oranla değişen her sayısı gizli ayda null olmalı; liste elle tutulmaz,
// oran oynatılarak bulunur. Fikstür: bitmiş, başlamış ve başlamamış iş emri, plan tarihleri, gelir, faiz ve vade dolu (Maliyet koşulu).
const BUGUN = '2026-10-19';
const isEmri = (id: number, bitisZamani: string | null = null) => ({ isEmriId: id, emirNo: `UE-${id}`, opNo: 10, istasyonAd: null, bitisZamani });

function kayitlar(saatBasi: number, gizli: boolean): MaliyetKaydi[] {
  const oran = { saatBasi, amortismanDahil: true, gizli };
  const ortak = {
    kaynakTur: 'makine', adet: 10, birimSureDk: 6, ayarSureDk: 30, istasyonSaat: 600, genelGider: oran,
    kisiSaat: new Map([[5, 200]]), fason: { satirlar: [], toplam: 0 },
  } satisfies Partial<IsEmriGirdisi>;
  const k = [
    isEmriKaydi({ ...ortak, isEmri: isEmri(1, '2026-10-05T10:00:00Z'), durum: 'tamam', saglam: 10, sure: { islemeSn: 4000, ayarSn: 1500, katilim: [{ kisiId: 5, saniye: 5400 }] }, planBitisGunu: '2026-10-03', bitisGunu: '2026-10-05' }, BUGUN),
    isEmriKaydi({ ...ortak, isEmri: isEmri(2), durum: 'calisiyor', saglam: 4, sure: { islemeSn: 1500, ayarSn: 1800, katilim: [{ kisiId: 5, saniye: 1800 }] }, planBitisGunu: '2026-10-20', bitisGunu: null }, BUGUN),
    isEmriKaydi({ ...ortak, isEmri: isEmri(3), durum: 'bekliyor', saglam: null, sure: null, planBitisGunu: '2026-10-28', bitisGunu: null }, BUGUN),
  ];
  // İşçiliğin planı motorda yok (PM-18); katkı ve kâr riski de denensin diye fikstürde plan verilir.
  return k.map((x) => ({ ...x, plan: { ...x.plan, iscilik: 100 } }));
}

function cevap(saatBasi: number, gizli: boolean, butce: number | null): MaskelenecekMaliyet & { genelGiderGizli: boolean } {
  const ham = kayitlar(saatBasi, gizli);
  const dahilIlk = MALIYET_KALEMLERI.filter((x) => !eksikKalemler(ham).includes(x));
  const finansman = beklemeFinansmani(ham, dahilIlk, 0.001, 30, BUGUN);
  const tum = finansman === null ? ham : [...ham, finansman];
  const eksik = eksikKalemler(tum);
  const dahil = MALIYET_KALEMLERI.filter((x) => !eksik.includes(x));
  const gelir = 20000;
  const g = gostergeler(tum, dahil, gelir, butce, eksik.length === 0);
  return {
    butce, hedef: g.hedef, plan: g.plan, gerceklesen: g.gerceklesen, bugunePlan: g.bugunePlan, kalanPlan: g.kalanPlan, sapma: g.sapma,
    katkiPayi: g.katkiPayi, katkiOrani: g.katkiOrani, planlananKatkiOrani: g.planlananKatkiOrani,
    karRiski: { gecikmeGunu: 4, gunlukOran: 0.3, tutar: karRiski(g.katkiPayi, 0.3, 4), ceza: gecikmeCezasi(gelir, 0.1, null, 4) },
    kalemler: kalemKirilimi(tum), haftalar: haftalikBirikim(tum, dahil), sapanIsEmirleri: sapanIsEmirleri(tum, dahil),
    genelGiderGizli: genelGiderGizliMi(tum),
  };
}

// Sayısal yapraklar yol adıyla; kalem satırı kalem adıyla anahtarlanır (sıra değişse de aynı yaprak).
function yapraklar(o: unknown, yol = ''): Map<string, number | null> {
  const m = new Map<string, number | null>();
  if (o === null || typeof o === 'number') { m.set(yol, o as number | null); return m; }
  if (Array.isArray(o)) {
    o.forEach((x, i) => {
      const ad = typeof x === 'object' && x !== null && 'kalem' in x ? String((x as { kalem: string }).kalem) : String(i);
      for (const [k, v] of yapraklar(x, `${yol}[${ad}]`)) m.set(k, v);
    });
    return m;
  }
  if (typeof o === 'object') for (const [k, v] of Object.entries(o)) for (const [a, b] of yapraklar(v, `${yol}.${k}`)) m.set(a, b);
  return m;
}

describe('2663 genel gider gizli maskesi', () => {
  test('fikstür dolu: katkı, kâr riski, finansman, haftalık birikim ve sapan iş emri hesaplanıyor (denetim boşa koşmasın)', () => {
    const c = cevap(120, false, null);
    assert.notEqual(c.katkiPayi, null);
    assert.notEqual(c.karRiski.tutar, null);
    assert.ok(c.haftalar.length > 0);
    assert.ok(c.sapanIsEmirleri.length > 0);
    assert.notEqual(c.kalemler.find((k) => k.kalem === 'finansman')?.plan ?? null, null);
    assert.equal(c.genelGiderGizli, false);
  });

  for (const butce of [null, 15000]) {
    test(`türeme: oranla değişen her sayı gizli ayda null ya da boş; değişmeyen olduğu gibi kalır (bütçe ${butce ?? 'yok'})`, () => {
      const a = yapraklar(cevap(120, false, butce));
      const b = yapraklar(cevap(150, false, butce));
      const turuyen = [...a.keys()].filter((k) => !Object.is(a.get(k), b.get(k)));
      assert.ok(turuyen.length > 5, turuyen.join(", "));
      const gercek = cevap(120, true, butce);
      assert.equal(gercek.genelGiderGizli, true);
      const maske = yapraklar(genelGiderGizliMaskesi(gercek));
      for (const k of turuyen) assert.ok(!maske.has(k) || maske.get(k) === null, `${k} gizli ayda görünüyor`);
      for (const [k, v] of maske) if (v !== null && !turuyen.includes(k)) assert.equal(v, a.get(k), `${k} gereksiz değişti`);
      // Görünen sayıların hiçbir alt kümesinin toplamı ya da iki sayının farkı genel gider tutarını vermez (Güvenlik K1).
      const ggPlan = cevap(120, false, butce).kalemler.find((k) => k.kalem === 'genel_gider')!.plan!;
      const gorunen = [...maske.values()].filter((v): v is number => v !== null && v !== 0);
      const sinir = Math.min(gorunen.length, 16);
      for (let i = 1; i < 1 << sinir; i += 1) {
        let t = 0;
        for (let j = 0; j < sinir; j += 1) if (i & (1 << j)) t += gorunen[j]!;
        assert.ok(Math.abs(t - ggPlan) > 0.005, 'alt küme toplamı genel gideri veriyor');
      }
      for (const x of gorunen) for (const y of gorunen) assert.ok(Math.abs(x - y - ggPlan) > 0.005, 'iki sayının farkı genel gideri veriyor');
    });
  }

  test('alan listesi sözleşmeyle bağlı: cevaba yeni alan eklenirse bu test maske kararını ister', () => {
    const bilinen = ['proje', 'siparis', 'fiyatGorunur', 'bugun', 'gelir', 'kurFarki', 'butce', 'hedef', 'plan', 'gerceklesen', 'bugunePlan', 'kalanPlan',
      'sapma', 'katkiPayi', 'katkiOrani', 'planlananKatkiOrani', 'karRiski', 'kalemler', 'haftalar', 'sapanIsEmirleri', 'eksikKalemler', 'eksikler',
      'genelGiderGizli', 'ozet'];
    assert.deepEqual(Object.keys(projeMaliyetCevabi.shape).sort(), [...bilinen].sort());
  });

  test('gizli olmayan ayda cevap değişmez; gizlilik yalnız yük alan adımda (kişi ve fason adımı oran almaz)', () => {
    assert.equal(genelGiderGizliMi(kayitlar(120, false)), false);
    const kisi = isEmriKaydi({
      isEmri: isEmri(9), kaynakTur: 'kisi', durum: 'bekliyor', adet: 1, saglam: null, birimSureDk: 6, ayarSureDk: 0, sure: null, istasyonSaat: null,
      genelGider: { saatBasi: 120, amortismanDahil: true, gizli: true }, kisiSaat: new Map(), fason: { satirlar: [], toplam: 0 }, planBitisGunu: null, bitisGunu: null,
    }, BUGUN);
    assert.equal(genelGiderGizliMi([kisi]), false);
  });

  test('defter (199 a): dondurulan iş emrinin gizliliği dondurma anındakidir; bugünün oranı gizli olmasa da gizli kalır, tersi de', () => {
    const acik = kayitlar(120, false);
    const bitmis = acik[0]!;
    const defter = new Map([[1, { isEmriId: 1, plan: bitmis.plan, gercek: bitmis.gercek, genelGiderGizli: true }]]);
    assert.equal(genelGiderGizliMi(defteriUygula([bitmis], defter)), true);
    const gizliBugun = kayitlar(120, true)[0]!;
    const eski = new Map([[1, { isEmriId: 1, plan: bitmis.plan, gercek: bitmis.gercek, genelGiderGizli: false }]]);
    assert.equal(genelGiderGizliMi(defteriUygula([gizliBugun], eski)), false);
  });

  test('taban (Veri 2663): gizli tabanda plan ve genel gider kalemi null, öteki kalemler kalır; gizli olmayan taban değişmez', () => {
    const t = { plan: 1000, kalemler: [{ kalem: 'isleme' as const, plan: 600 }, { kalem: 'genel_gider' as const, plan: 180 }] };
    assert.deepEqual(tabanMaskesi(t, true), { plan: null, kalemler: [{ kalem: 'isleme', plan: 600 }, { kalem: 'genel_gider', plan: null }] });
    assert.deepEqual(tabanMaskesi(t, false), t);
  });
});
