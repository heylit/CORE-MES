import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { adimSuresiDk, farklar, fikstur, isKodu, normalBicim, tarayiciDakikasi, tarih, yuvarla } from '#paylasilan/test-fiksturleri/plan-golge.ts';
import type { Emir, Normal, Satir, Senaryo } from '#paylasilan/test-fiksturleri/plan-golge.ts';
import { ONEK } from './ReceteRotaCercevesi.tsx';
import { HAM, HAM_GIRDISI, YAZAR, ac, prototipiCalistir, sunucuKur, yazmaDinleyiciKapat } from './test-yardimcilari.tsx';

// Gölge test: aynı fikstürü sunucu motoru da koşar (sunucu/moduller/plan/golge.test.ts). Burada tarayıcı motorunun bugünkü çıktısı sabitlenir.
const T = fikstur.takvim;

// Başka emrin kilitli işi (genişleme sabitleri) tarayıcıda dondurulmuş ayrı bir emirdir; çıktıya girmez.
const YABANCI = 'oY';
// Kişi kaynağı tarayıcıda personel saatli istasyondur (kendi iş merkezinde, kişi sınırı makine istasyonlarına düşmesin); kaynak adı `kod/P1`.
const kisiIstasyonu = (n: number) => `k${n + 1}`;

// Rota adımı kimliği emir ve sıradan türer; ilk adım hammadde tüketir (rota eksik sayılmasın).
function depo(s: Senaryo) {
  const istasyonlar = [
    ...fikstur.istasyonlar.map((i, n) => ({ id: `s${n + 1}`, code: i.kod, name: `İstasyon ${i.kod}`, wcId: 'w1', cost: 500, eff: s.verimYuzde?.[i.kod] ?? 100, count: i.makine, opPer: 1 })),
    ...(s.kisiler ?? []).map((k, n) => ({ id: kisiIstasyonu(n), code: k, name: `Kişi ${k}`, wcId: 'w2', cost: 500, eff: 100, count: 1, opPer: 1, capSrc: 'insan' })),
  ];
  const istasyonId = (kod: string) => istasyonlar.find((i) => i.code === kod)!.id;
  const yabancilar = (s.sabitler ?? []).filter((x) => !s.emirler.some((e) => x.kod.startsWith(`${e.no}/`)));
  const opdefler: unknown[] = [];
  const rota = (e: Emir, ei: number) => ({
    base: 1,
    steps: e.adimlar.map((a, ai) => {
      const od = `d${ei + 1}-${ai + 1}`;
      const fason = a.fasonGun !== undefined;
      const yer = fason ? '' : istasyonId(a.kisi ?? a.istasyon!);
      opdefler.push({ id: od, code: `OP-${ei + 1}${ai + 1}`, abbr: `A${ei + 1}${ai + 1}`, name: `Adım ${a.seq}`, stationId: yer, setup: a.hazirlikDk ?? 0, cycle: a.cevrimDk ?? 0 });
      return {
        id: `e${ei + 1}p${ai + 1}`, seq: a.seq, opId: od, stationId: yer, setup: fason ? null : a.hazirlikDk, cycle: fason ? null : a.cevrimDk,
        ...(fason ? { fasonId: '41', terminGun: a.fasonGun } : {}), ...(a.alternatifler ? { alts: a.alternatifler.map(istasyonId) } : {}),
        // Sunucunun akışlı adımı tarayıcının örtülü adımıdır: devir adedi bitince başlar.
        ins: ai === 0 ? [HAM_GIRDISI] : [], outs: [], dep: a.bagimlilik === 'akisli' ? 'ortulu' : a.bagimlilik === 'bagimsiz' ? 'bagimsiz' : 'bagimli', depQty: a.devirAdet ?? 1, outStatus: '', rejectPct: 0,
      };
    }),
  });
  const hafta = { 0: [], 1: ['v1'], 2: ['v1'], 3: ['v1'], 4: ['v1'], 5: ['v1'], 6: [] };
  const routes: Record<string, unknown> = Object.fromEntries(s.emirler.map((e, ei) => [`i${ei + 1}`, rota(e, ei)]));
  yabancilar.forEach((x, n) => {
    const istasyon = istasyonId(x.kaynak.split('/')[0]!);
    opdefler.push({ id: `dy${n + 1}`, code: `OP-Y${n + 1}`, abbr: `Y${n + 1}`, name: 'Kilitli iş', stationId: istasyon, setup: 0, cycle: x.bitDk - x.basDk });
    routes[`iy${n + 1}`] = { base: 1, steps: [{ id: `y${n + 1}p1`, seq: 10, opId: `dy${n + 1}`, stationId: istasyon, setup: 0, cycle: x.bitDk - x.basDk, ins: [HAM_GIRDISI], outs: [], dep: 'bagimli', depQty: 1, outStatus: '', rejectPct: 0 }] };
  });
  return {
    version: 7, name: 'Deneme fabrika',
    cal: { shifts: [{ id: 'v1', name: '1. vardiya', start: '08:00', end: '16:00', breaks: [] }], holidays: (s.tatilGunleri ?? []).map((g) => tarih(T, g)) },
    wcs: [{ id: 'w1', code: 'IM-1', name: 'Talaşlı imalat', week: hafta }, ...(s.kisiler?.length ? [{ id: 'w2', code: 'EL-1', name: 'El işçiliği', week: hafta }] : [])],
    stations: istasyonlar, machines: [], opdefs: opdefler,
    people: (s.kisiler ?? []).map((k, n) => ({ id: `pk${n + 1}`, name: `Kişi ${k}`, wcId: 'w2', shiftId: 'v1', skills: [kisiIstasyonu(n)], active: true, cost: 0 })),
    items: [
      ...s.emirler.map((e, ei) => ({ id: `i${ei + 1}`, code: `MM-${e.no}`, name: `Deneme mamul ${e.no}`, type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 })),
      ...yabancilar.map((_x, n) => ({ id: `iy${n + 1}`, code: `MM-Y${n + 1}`, name: `Kilitli iş ${n + 1}`, type: 'mamul', unit: 'adet', cost: 0, stock: 0, min: 0 })), HAM,
    ],
    routes,
    orders: [
      ...s.emirler.map((e, ei) => ({
        id: `o${ei + 1}`, no: e.no, itemId: `i${ei + 1}`, qty: e.adet, start: tarih(T, e.baslangicGun), due: tarih(T, e.teslimGun), priority: e.oncelik,
        status: 'serbest', note: '', created: ei + 1, tur: 'seri',
      })),
      ...yabancilar.map((_x, n) => ({ id: `${YABANCI}${n + 1}`, no: `Y${n + 1}`, itemId: `iy${n + 1}`, qty: 1, start: tarih(T, 0), due: tarih(T, 10), priority: 3, status: 'serbest', note: '', created: 100 + n, tur: 'seri' })),
    ],
  };
}

// Depoda olmayan plan durumu: elle sıra istasyon kuyruğu, elle bölme, sabit işler dondurma iğnesi (gün + vardiya kesri).
function planDurumu(s: Senaryo) {
  const yer = (a: Senaryo['emirler'][number]['adimlar'][number]) => [a.kisi ?? a.istasyon!, ...a.alternatifler ?? []];
  const istasyonId = (kod: string) => {
    const n = fikstur.istasyonlar.findIndex((i) => i.kod === kod);
    return n >= 0 ? `s${n + 1}` : kisiIstasyonu((s.kisiler ?? []).indexOf(kod));
  };
  const qorder: Record<string, string[]> = {};
  const elle = s.emirler.map((e, ei) => ({ e, ei })).filter((x) => x.e.elleSira !== undefined).sort((a, b) => a.e.elleSira! - b.e.elleSira!);
  for (const { e, ei } of elle) e.adimlar.forEach((a, ai) => { for (const k of yer(a)) (qorder[istasyonId(k)] ??= []).push(`o${ei + 1}|root|e${ei + 1}p${ai + 1}`); });
  const splitManual: Record<string, number[]> = {};
  s.emirler.forEach((e, ei) => e.adimlar.forEach((a, ai) => { if (a.parcaAdetleri) splitManual[`o${ei + 1}|root|e${ei + 1}p${ai + 1}`] = a.parcaAdetleri; }));
  const frozen: Record<string, unknown> = {};
  let yabanci = 0;
  for (const x of s.sabitler ?? []) {
    const ei = s.emirler.findIndex((e) => x.kod.startsWith(`${e.no}/`));
    const ai = ei < 0 ? 0 : s.emirler[ei]!.adimlar.findIndex((a) => isKodu(s.emirler[ei]!, a) === x.kod);
    const anahtar = ei < 0 ? `${YABANCI}${(yabanci += 1)}|root|y${yabanci}p1` : `o${ei + 1}|root|e${ei + 1}p${ai + 1}`;
    const [kod, sira] = x.kaynak.split('/') as [string, string];
    const gun = Math.floor(x.basDk / (24 * 60));
    const f = (x.basDk - gun * 24 * 60 - T.vardiyaBaslangicDk) / (T.vardiyaBitisDk - T.vardiyaBaslangicDk);
    frozen[anahtar] = { parts: [{ rid: `${istasyonId(kod)}#${sira}`, sid: istasyonId(kod), q: ei < 0 ? 1 : s.emirler[ei]!.adet, d: tarih(T, gun), f }] };
  }
  return { qorder, splitManual, frozen };
}

interface Ham { sched: Array<{ orderId: string; seq: number; resCode: string; start: number; end: number; durMin: number }>; yok: Array<{ orderId: string; seq: number }> }

async function tarayiciCalistir(s: Senaryo): Promise<Normal> {
  sunucuKur(YAZAR, [{ anahtar: ONEK, bicim: 'json', deger: depo(s), surum: 1 }]);
  ac('/recete-rota');
  const html = ((await screen.findByTitle('Reçete ve Rota', {}, { timeout: 20000 })).getAttribute('srcdoc') ?? '').replace(/<head>/i, () => '<head><script>window.CSS = window.CSS || { escape: (s) => s };</script>');
  const belge = await prototipiCalistir(html);
  const pencere = belge.defaultView as unknown as Window & { eval: (k: string) => unknown };
  // noNow ve sabit base: sonuç saate bağlı olmaz. Tampon gün cinsindendir (st.settings.buffer ile aynı birim).
  const secenek = JSON.stringify({ useStock: true, noNow: true, base: T.baslangicTarihi, rule: s.ayar.kural, dir: s.ayar.yon, buffer: s.ayar.tamponGun });
  const ham = JSON.parse(String(pencere.eval(`JSON.stringify((function(){ Object.assign(st, ${JSON.stringify(planDurumu(s))}); const P = planRun(activeOrders(), ${secenek});
    return { sched: P.sched.map(e => ({orderId:e.orderId, seq:e.seq, resCode:e.resCode, start:e.start, end:e.end, durMin:e.durMin})),
      yok: P.list.flatMap(R => R.ops.filter(o => !o.fason && !(o.entries||[]).length).map(o => ({orderId:o.orderId, seq:o.seq}))) }; })())`))) as Ham;
  const emirNo = (orderId: string) => s.emirler[Number(orderId.slice(1)) - 1]!;
  const kod = (orderId: string, seq: number) => isKodu(emirNo(orderId), emirNo(orderId).adimlar.find((a) => a.seq === seq)!);
  const kaynak = (resCode: string) => { const k = /^(.+)\/P1$/.exec(resCode)?.[1]; return k !== undefined && (s.kisiler ?? []).includes(k) ? k : resCode; };
  const bizim = (orderId: string) => !orderId.startsWith(YABANCI);
  const satirlar: Satir[] = ham.sched.filter((e) => bizim(e.orderId)).map((e) => ({ kod: kod(e.orderId, e.seq), kaynak: kaynak(e.resCode), bas: tarayiciDakikasi(T, e.start, false), bit: tarayiciDakikasi(T, e.end, true), dk: yuvarla(e.durMin) }));
  return normalBicim(s.emirler, satirlar, ham.yok.filter((o) => bizim(o.orderId)).map((o) => kod(o.orderId, o.seq)));
}

afterEach(() => { cleanup(); vi.unstubAllGlobals(); yazmaDinleyiciKapat(); });

describe('plan gölge testi: tarayıcı motoru', () => {
  for (const s of fikstur.senaryolar) {
    it(`${s.ad}: bugünkü çıktı sabit; öncül ihlali ve yerleşmeyen yok`, async () => {
      const normal = await tarayiciCalistir(s);
      if (s.tarayiciAltin === null) { console.log(`ALTIN ${s.ad} ${JSON.stringify(normal)}`); expect.fail('altın değer yok'); }
      expect(normal).toEqual(s.tarayiciAltin);
      expect(normal.ihlal).toEqual([]);
      expect(normal.yerlesmeyen).toEqual([]);
    }, 60000);
  }

  // Genişleme senaryoları (E-11): yalnız sunucuda ölçülmüş senaryolar tarayıcıda koşar ve sunucu altınıyla aynı çıkar. Tarayıcı altını
  // fikstüre girince senaryo `senaryolar` listesine taşınır.
  // Bir kez ayrışmış alanlarda tarayıcının değeri de sabitlenir: akışlı adım ilk devir partisiyle başlar, verim yalnız işlemeye uygulanır.
  const GENISLEME_TARAYICI: Record<string, Partial<Normal>> = {
    'akisli-devir': { mutlak: { 'E1/20': [502, 558] } },
    'verim': { sureDk: { 'E1/10': 60 }, mutlak: { 'E1/10': [480, 540], 'E1/20': [540, 570] } },
  };
  for (const s of fikstur.genisleme) {
    it(`genişleme ${s.ad}: sunucu altınıyla aynı; öncül ihlali ve yerleşmeyen yok`, async () => {
      const normal = await tarayiciCalistir(s);
      expect(farklar(s.sunucuAltin!, normal), JSON.stringify(normal)).toEqual([]);
      expect(normal).toMatchObject(GENISLEME_TARAYICI[s.ad] ?? {});
      expect(normal.ihlal).toEqual([]);
      expect(normal.yerlesmeyen).toEqual([]);
    }, 60000);
  }

  it('adım süreleri fikstürden gelir: tarayıcı motorunun yerleşen çalışma dakikası adım süresine eşit', () => {
    for (const s of fikstur.senaryolar) {
      if (s.tarayiciAltin === null) continue;
      for (const e of s.emirler) for (const a of e.adimlar) if (a.fasonGun === undefined) expect(s.tarayiciAltin.sureDk[isKodu(e, a)], `${s.ad} ${isKodu(e, a)}`).toBeCloseTo(adimSuresiDk(e, a), 1);
    }
  });
});
