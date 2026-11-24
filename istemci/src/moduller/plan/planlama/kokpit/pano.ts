import type { PlanlamaCalismasi } from '../tipler.ts';
import { adimBaglari, sureYaz, tasinabilir, turAdaylari, type KokpitEmri, type KokpitIsi, type KokpitModeli } from './kurallar.ts';

// 3663: adım bilgi panosunun saf kuralları. Yeni hesap yoktur, yalnız bugünkü verinin sunumu: sayım sunucunun durum okumasındandır,
// taşıma tahmini yalnız sürüklerken ilk gösterimdir (kural ve doğrulama sunucudadır; imleç durunca sunucu önizlemesi rakamları değiştirir).
type Nesne = Record<string, unknown>;
const nesneMi = (x: unknown): x is Nesne => typeof x === 'object' && x !== null && !Array.isArray(x);

// say: adımın sağlam adedi (süren adımda canlı sayaç, biten adımda kapanış değeri). Kök emirde anahtar "<emir>|root|<rota sırası, 1'den>";
// çok katmanlı (düğümlü) emirde sayım bu okumada yoktur, hiç yazılmaz (sıfır uydurulmaz).
export interface AdimSayimi { say: number; bitti: boolean }
export function adimSayimlari(c: PlanlamaCalismasi, emirler: unknown): Record<string, AdimSayimi> {
  const y: Record<string, AdimSayimi> = {};
  if (!nesneMi(emirler)) return y;
  const prog = nesneMi(emirler['opProg']) ? emirler['opProg'] : {}, saglam = nesneMi(emirler['opSaglam']) ? emirler['opSaglam'] : {};
  const urun = new Map(c.D.urunler.map((u) => [u.id, u]));
  for (const s of c.D.siparisler) {
    if (s['dugum']) continue;
    (urun.get(s.urun)?.rota ?? []).forEach((a, i) => {
      const anahtar = `${s.id}|root|${String(i + 1)}`, b = saglam[anahtar], p = prog[anahtar];
      if (typeof b === 'number') y[`${s.id}.${a.k}`] = { say: b, bitti: true };
      else if (typeof p === 'number') y[`${s.id}.${a.k}`] = { say: p, bitti: false };
    });
  }
  return y;
}

export interface IlerlemeOzeti {
  // Çubuk dolgusu 0..1; veri yoksa null.
  oran: number | null;
  // Ana yazı ("312 / 500 adet · %62", "Başlamadı", "Bitti").
  yazi: string;
  // Plana göre beklenen oran (yalnız süren adımda) ve sayımla farkı ("plana göre %67 · 5 puan geride").
  planOran: number | null;
  plan: string | null;
}
export function ilerlemeOzeti(x: KokpitIsi, adet: number, sayim: AdimSayimi | undefined, simdi: number): IlerlemeOzeti {
  const yuz = (o: number): number => Math.round(Math.min(1, Math.max(0, o)) * 100);
  if (x.bitti === true) return { oran: 1, yazi: sayim?.bitti ? `Bitti · ${String(sayim.say)} / ${String(adet)} adet` : 'Bitti', planOran: null, plan: null };
  if (!x.basladi) return { oran: null, yazi: 'Başlamadı', planOran: null, plan: null };
  const plan = Math.min(1, Math.max(0, (simdi - x.S) / Math.max(0.01, x.C - x.S)));
  if (sayim === undefined || adet <= 0) return { oran: null, yazi: 'Sürüyor · sayım bilgisi yok', planOran: plan, plan: `plana göre %${String(yuz(plan))}` };
  const oran = sayim.say / adet, fark = yuz(plan) - yuz(oran);
  const yon = fark >= 1 ? `${String(fark)} puan geride` : fark <= -1 ? `${String(-fark)} puan önde` : 'plana uygun';
  return { oran: Math.min(1, oran), yazi: `${String(sayim.say)} / ${String(adet)} adet · %${String(yuz(oran))}`, planOran: plan, plan: `plana göre %${String(yuz(plan))} · ${yon}` };
}

// Seçili adımın öncesi ve sonrası (rotadaki komşu adımlar) ve emrin termin payı.
export interface KomsuOzeti { once: { ad: string; bitis: number } | null; sonra: { ad: string; baslangic: number } | null; pay: number | null }
export function komsuOzeti(m: Pick<KokpitModeli, 'isler'>, e: KokpitEmri, isId: string): KomsuOzeti {
  const i = e.adimlar.findIndex((a) => a.id === isId);
  const o = i > 0 ? e.adimlar.slice(0, i).reverse().find((a) => m.isler[a.id] !== undefined) : undefined;
  const s = i >= 0 ? e.adimlar.slice(i + 1).find((a) => m.isler[a.id] !== undefined) : undefined;
  return {
    once: o ? { ad: o.ad, bitis: m.isler[o.id]!.C } : null,
    sonra: s ? { ad: s.ad, baslangic: m.isler[s.id]!.S } : null,
    pay: e.termin !== null && e.bitis !== null ? e.termin - e.bitis : null,
  };
}

// Taşıma tahmini (sürüklerken ilk gösterim). Süre duvar saati sayılır; kapalı saat, mesai ve duruş yalnız sunucuda bilinir, bu yüzden
// çıktıdaki rakamlar "tahmin"dir ve sunucu önizlemesi gelince onun rakamları geçer.
export interface TasimaTahmini {
  yeniS: number; yeniC: number;
  // Hedef tezgâhta yeni aralıkla çakışıp arkaya itilecek iş sayısı ve en büyük kayma (saat).
  itilen: number; enBuyukKayma: number;
  // Sonraki adımların aynı emirde kayma toplamı (en büyük) ve emrin tahmini yeni bitişi.
  ardilKayma: number; bitis: number | null; terminPayi: number | null;
  // Öncül bitmeden başlıyorsa neden cümlesi; yoksa null.
  ihlal: string | null;
}
export function tasimaTahmini(m: KokpitModeli, e: KokpitEmri, x: KokpitIsi, tezgah: string, S: number, saat: (t: number) => string): TasimaTahmini {
  const sure = x.C - x.S, yeniS = S, yeniC = S + sure;
  const cakisan = Object.values(m.isler).filter((y) => y.id !== x.id && y.m === tezgah && y.S < yeniC - 0.01 && y.C > yeniS + 0.01 && !y.basladi && y.bitti !== true);
  const itilen = cakisan.length, enBuyukKayma = cakisan.reduce((a, y) => Math.max(a, yeniC - y.S), 0);
  // Aynı emrin sonraki adımları sırayla: öncülün yeni bitişinden önce başlayamaz.
  const yeni: Record<string, KokpitIsi> = { ...m.isler, [x.id]: { ...x, m: tezgah, S: yeniS, C: yeniC } };
  let onceki = yeniC, ardil = 0;
  const i = e.adimlar.findIndex((a) => a.id === x.id);
  for (const a of e.adimlar.slice(i + 1)) {
    const y = yeni[a.id];
    if (!y) continue;
    if (y.S < onceki - 0.01) { const k = onceki - y.S; ardil = Math.max(ardil, k); yeni[a.id] = { ...y, S: y.S + k, C: y.C + k }; }
    onceki = yeni[a.id]!.C;
  }
  const bitis = e.adimlar.reduce<number | null>((b, a) => { const y = yeni[a.id]; return y ? Math.max(b ?? -Infinity, y.C) : b; }, null);
  // İhlal: bugünkü bağ kuralıyla (adimBaglari) aranır; kendi karşılaştırmamız yok.
  const ters = adimBaglari([e], { ...m.isler, [x.id]: { ...x, m: tezgah, S: yeniS, C: yeniC } }).find((b) => b.kime === x.id && b.ters);
  const oncul = ters ? e.adimlar.find((a) => a.id === ters.kimden) : undefined;
  const ihlal = ters && oncul ? `Önceki adım (${oncul.ad}) ${saat(m.isler[ters.kimden]!.C)}'de bitiyor; bu adım ondan önce başlayamaz.` : null;
  return { yeniS, yeniC, itilen, enBuyukKayma, ardilKayma: ardil, bitis, terminPayi: e.termin !== null && bitis !== null ? e.termin - bitis : null, ihlal };
}

// Seçili adımın tezgâh seçenekleri: yalnız bilgi (karar 3663: salt bilgi). Bugünkü hamle adaylarıdır; kazanç saat olarak erken.
export interface TezgahSecenegi { tezgah: string; baslangic: number; kazanc: number }
export function tezgahSecenekleri(m: KokpitModeli, e: KokpitEmri, x: KokpitIsi): { secenekler: TezgahSecenegi[]; neden: string | null } {
  const neden = tasinabilir(x);
  if (neden !== null) return { secenekler: [], neden };
  return { secenekler: turAdaylari(m, e, x.id, 3).map((t) => ({ tezgah: t.tezgah, baslangic: t.baslangic, kazanc: x.S - t.baslangic })), neden: null };
}

// Tahminin tek cümlesi; boşsa etki yok demektir. Sunucu önizlemesi gelince Tahta kendi cümlesini (etkiCumlesi) verir.
export function tahminCumlesi(t: TasimaTahmini): string {
  const p: string[] = [];
  if (t.itilen > 0) p.push(`aynı tezgâhta ${String(t.itilen)} iş arkaya itilir`);
  if (t.ardilKayma > 0.01) p.push(`sonraki adım ${sureYaz(t.ardilKayma)} kayar`);
  if (t.terminPayi !== null) p.push(t.terminPayi < -0.01 ? `emir termini ${sureYaz(-t.terminPayi)} kaçırır` : `termin payı ${sureYaz(t.terminPayi)}`);
  return p.join(' · ');
}
