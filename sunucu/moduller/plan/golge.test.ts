import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
  adimSuresiDk, baslangicDk, farklar, fikstur, isKodu, normalBicim, takvimAraliklari, teslimDk,
} from '#paylasilan/test-fiksturleri/plan-golge.ts';
import type { Normal, Satir, Senaryo } from '#paylasilan/test-fiksturleri/plan-golge.ts';
import { ayniKaynak, kaynakAnahtari, kesisimDk, oner, verimliSure } from './kurallar.ts';
import type { Kaynak, MotorIsi, Sabit } from './kurallar.ts';

// Gölge test: aynı fikstürü tarayıcı motoru da koşar (recete-rota/plan-golge.test.tsx). Burada sunucu motorunun bugünkü çıktısı sabitlenir.

const makineler = new Map<string, { ad: string; kaynak: Kaynak }[]>();
{
  let id = 0;
  for (const i of fikstur.istasyonlar) {
    makineler.set(i.kod, Array.from({ length: i.makine }, (_, k) => ({ ad: `${i.kod}/${k + 1}`, kaynak: { tur: 'makine' as const, id: (id += 1) } })));
  }
}

// Kaynak adı makinede `<istasyon>/<sıra>`, kişide kişinin kodu.
function sunucuCalistir(s: Senaryo): Normal {
  const araliklar = takvimAraliklari(fikstur.takvim, s.tatilGunleri);
  const kisiler = new Map((s.kisiler ?? []).map((k, n) => [k, { ad: k, kaynak: { tur: 'kisi' as const, id: n + 1 } }]));
  const adlar = new Map([...[...makineler.values()].flat(), ...kisiler.values()].map((m) => [kaynakAnahtari(m.kaynak), m.ad]));
  const kaynagi = (ad: string): Kaynak => [...makineler.values()].flat().concat([...kisiler.values()]).find((m) => m.ad === ad)!.kaynak;
  const istasyonu = (k: Kaynak) => [...makineler].find(([, l]) => l.some((m) => ayniKaynak(m.kaynak, k)))?.[0];
  const verim = (k: Kaynak) => (s.verimYuzde?.[istasyonu(k) ?? ''] ?? 100) / 100;
  const isler: MotorIsi[] = [];
  const kodlar = new Map<number, string>();
  const idler = new Map<string, number>();
  s.emirler.forEach((e, ei) => {
    let fasonDk = 0;
    let oncul: { hazirlikDk?: number; cevrimDk?: number } | null = null;
    e.adimlar.forEach((a, ai) => {
      if (a.fasonGun !== undefined) { fasonDk += a.fasonGun * 24 * 60; return; }
      const id = isler.length + 1;
      kodlar.set(id, isKodu(e, a));
      idler.set(isKodu(e, a), id);
      // Devir süreleri servisle aynı: öncülün ayarı + devir adedi x öncülün birim süresi; son parti devir adedi x kendi birim süresi.
      const devir = a.bagimlilik === 'akisli' && a.devirAdet !== undefined ? Math.min(a.devirAdet, e.adet) : null;
      isler.push({
        id, uretimEmriId: ei + 1, sira: ai + 1, teslimDk: teslimDk(fikstur.takvim, e), oncelik: e.oncelik, emirBaslangicDk: baslangicDk(e), elleSira: e.elleSira ?? null,
        kaynak: null, adaylar: a.kisi ? [kisiler.get(a.kisi)!.kaynak] : [a.istasyon!, ...a.alternatifler ?? []].flatMap((i) => makineler.get(i)!.map((m) => m.kaynak)),
        sureDk: adimSuresiDk(e, a), ayarDk: a.hazirlikDk ?? 0, bagimlilik: a.bagimlilik ?? 'bekleyen',
        devirDk: devir === null || oncul === null ? null : (oncul.hazirlikDk ?? 0) + devir * (oncul.cevrimDk ?? 0), devirAyarDk: oncul?.hazirlikDk ?? 0,
        devirSonDk: devir === null ? null : devir * (a.cevrimDk ?? 0),
        ...(fasonDk > 0 ? { fasonBekleDk: fasonDk } : {}),
        ...(a.parcaAdetleri ? { parcalar: a.parcaAdetleri.map((adet, n) => ({ no: n + 1, sureDk: (a.hazirlikDk ?? 0) + adet * (a.cevrimDk ?? 0), kaynak: null })) } : {}),
      });
      fasonDk = 0;
      oncul = a;
    });
  });
  // Senaryodaki adımın sabiti o işin yeridir; başka işin sabiti kaynağı yalnız işgal eder.
  const sabitler: Sabit[] = (s.sabitler ?? []).map((x, n) => {
    const id = idler.get(x.kod);
    const is = isler.find((i) => i.id === id);
    return { isEmriId: id ?? -(n + 1), uretimEmriId: is?.uretimEmriId ?? -(n + 1), sira: is?.sira ?? 1, kaynak: kaynagi(x.kaynak), baslangic: x.basDk, bitis: x.bitDk };
  });
  const ayar = { kural: s.ayar.kural, yon: s.ayar.yon, tamponDk: s.ayar.tamponGun * 24 * 60 };
  const sonuc = oner(isler, sabitler, 0, ayar, () => araliklar, verim);
  // Çalışma dakikası adımın kendi süresidir: akışlı adımın parça beklediği uzama (prototip gibi) sayılmaz.
  const satir = (isEmriId: number, k: Kaynak, bas: number, bit: number, araliktan = false): Satir => {
    const is = isler.find((i) => i.id === isEmriId);
    const kendi = !araliktan && is?.sureDk != null ? verimliSure(is.sureDk, is.ayarDk, verim(k)) : Number.POSITIVE_INFINITY;
    return { kod: kodlar.get(isEmriId)!, kaynak: adlar.get(kaynakAnahtari(k))!, bas, bit, dk: Math.min(kesisimDk(araliklar, bas, bit), kendi) };
  };
  const satirlar: Satir[] = [
    ...sabitler.filter((x) => kodlar.has(x.isEmriId)).map((x) => satir(x.isEmriId, x.kaynak, x.baslangic, x.bitis, true)),
    ...sonuc.yerlesimler.flatMap((y) => (y.parcalar?.length ? y.parcalar.map((p) => satir(y.isEmriId, p.kaynak, p.baslangic, p.bitis, true)) : [satir(y.isEmriId, y.kaynak, y.baslangic, y.bitis)])),
  ];
  return normalBicim(s.emirler, satirlar, sonuc.yerlesmeyen.map((y) => kodlar.get(y.isEmriId)!));
}

describe('plan gölge testi: sunucu motoru', () => {
  for (const s of [...fikstur.senaryolar, ...fikstur.genisleme]) {
    test(`${s.ad}: bugünkü çıktı sabit; öncül ihlali ve yerleşmeyen yok`, () => {
      const normal = sunucuCalistir(s);
      if (s.sunucuAltin === null) { console.log(`ALTIN ${s.ad} ${JSON.stringify(normal)}`); assert.fail('altın değer yok'); }
      assert.deepEqual(normal, s.sunucuAltin);
      assert.deepEqual(normal.ihlal, []);
      assert.deepEqual(normal.yerlesmeyen, []);
    });
  }

  test('iki motorun altın çıktıları arasındaki fark listesi fikstürdekiyle aynı (fark yoksa boş)', () => {
    for (const s of fikstur.senaryolar) {
      assert.ok(s.sunucuAltin && s.tarayiciAltin, `${s.ad}: altın değer eksik`);
      assert.deepEqual(farklar(s.sunucuAltin, s.tarayiciAltin), s.beklenenFark, s.ad);
    }
  });

  test('genişleme senaryoları yalnız sunucuda ölçülür: tarayıcı altını ve fark listesi tarayıcı testi alanları koyunca girer', () => {
    for (const s of fikstur.genisleme) assert.deepEqual([s.tarayiciAltin, s.beklenenFark], [null, null], s.ad);
  });
});
