import { dalDenetle, dalliMi, oncullerCikar } from '#paylasilan/sozlesme/rota-dal-kurali.ts';
import type { DurumMalzemesi, DurumRotaAdimi, DurumRotaRevizyonu } from '#paylasilan/sozlesme/recete-rota.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { RevizyonSartnameleriCevabi, SartnameKapsami, SartnameOzeti } from '#paylasilan/sozlesme/rota.ts';

// R1 saf kuralları (205 a): bugünkü ekranın tarayıcı kuralları (rotaEksikleri, islemSuresiEksik, girdiOlur, stepFactors, matCost) ve
// rota düzenlemesi. Veri bağlı durumun biçimidir (prototipin `st` alan adları). Kural ve yetki sahibinin ucundadır; buradakiler ekranın
// önceden göstermesi ve kaydet gövdesini kurmasıdır.

export type Malzeme = DurumMalzemesi;
export type Operasyon = NonNullable<DurumCevabi['opdefs']>[number];
export type Istasyon = NonNullable<DurumCevabi['stations']>[number];
export type Makine = NonNullable<DurumCevabi['machines']>[number];
export type IsMerkezi = NonNullable<DurumCevabi['wcs']>[number];
export type Revizyon = DurumRotaRevizyonu;
export type RevDurumu = Revizyon['status'];
// Yeni eklenen adımın OP numarası yoktur; sunucu kaydette verir. Kimlik ekranın geçici kimliğidir.
export type Adim = Omit<DurumRotaAdimi, 'opNo'> & { opNo: number | null };
export type Giren = Adim['ins'][number];
export type YanUrun = Adim['outs'][number];
export type Bagimlilik = Adim['dep'];

export const TUR_KISA: Readonly<Record<string, string>> = { ham: 'HM', yari: 'YM', mamul: 'MM' };
export const TUR_ADI: Readonly<Record<string, string>> = {
  ham: 'Ham madde', yari: 'Yarı mamul', mamul: 'Mamul', sarf: 'Sarf malzemesi', demirbas: 'Demirbaş', hizmet: 'Hizmet',
};
export const REV_DURUMU: Readonly<Record<RevDurumu, string>> = { taslak: 'Taslak', onay: 'Onay bekliyor', yururlukte: 'Yürürlükte', onayli: 'Onaylı' };
export const BAGIMLILIK_SIRASI: readonly Bagimlilik[] = ['bagimli', 'ortulu', 'bagimsiz'];
// Operasyon grupları bugünkü ekranın sırasıyla (İstasyonlar'ın grup kodları); durumdaki grup adı önceliklidir.
export const OP_GRUPLARI: readonly (readonly [string, string])[] = [
  ['KES', 'Kesim'], ['SKL', 'Şekillendirme'], ['TAL', 'Talaşlı imalat'], ['KYN', 'Kaynak'], ['ISL', 'Isıl işlem'], ['YZY', 'Yüzey hazırlık'],
  ['KAP', 'Kaplama'], ['BOY', 'Boya'], ['MRK', 'Markalama'], ['MON', 'Montaj'], ['KAL', 'Kalite kontrol'], ['PAK', 'Paketleme ve sevk'], ['FAS', 'Fason'],
];

export const turKisa = (tur: string): string => TUR_KISA[tur] ?? tur;
export const kucuk = (m: string): string => m.toLocaleLowerCase('tr-TR');

/* ---------------- süreler ---------------- */

export const sureSayisi = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
// Çevrim = işlem + değişim (dk / baz miktar); boş alan toplama girmez, sıfır uydurulmaz.
export const cevrimToplami = (islem: number | null, degisim: number | null): number => (sureSayisi(islem) ?? 0) + (sureSayisi(degisim) ?? 0);
export function degisimOrani(islem: number | null, degisim: number | null): number | null {
  const i = sureSayisi(islem); const d = sureSayisi(degisim);
  return i === null || d === null || !(i > 0) ? null : (d / i) * 100;
}
const SURE_ETIKETI = { hazirlik: 'Hazırlık', islem: 'İşlem', degisim: 'Değişim' } as const;
export type SureAlani = keyof typeof SURE_ETIKETI;
// Teorik süre girişi: boş metin boştur (null); geçersizde ileti döner ve alan boş kalır.
export function sureGirisi(ham: string, alan: SureAlani): { ok: true; deger: number | null } | { ok: false; deger: null; ileti: string } {
  const metin = ham.trim();
  if (metin === '') return { ok: true, deger: null };
  if (!/^[0-9]+([.,][0-9]+)?$/.test(metin)) {
    return { ok: false, deger: null, ileti: `${SURE_ETIKETI[alan]} süresi sıfır ya da sıfırdan büyük bir sayı olmalı; alan boş bırakıldı.` };
  }
  return { ok: true, deger: parseFloat(metin.replace(',', '.')) };
}
// Operasyon tipinin sahibine giden süre metni (İstasyonlar ondalık metin ister).
export const sureMetni = (n: number | null, ondalik: number): string | null => (n === null ? null : String(Math.round(n * 10 ** ondalik) / 10 ** ondalik));
export function sayiGirisi(ham: string): number | null {
  const m = ham.trim().replace(',', '.');
  if (m === '') return null;
  const n = Number(m);
  return Number.isFinite(n) ? n : null;
}

/* ---------------- rota ---------------- */

export const sirali = (adimlar: readonly Adim[]): Adim[] => [...adimlar].sort((a, b) => a.seq - b.seq);
export const yenidenNumarala = (adimlar: readonly Adim[]): Adim[] => adimlar.map((a, i) => ({ ...a, seq: (i + 1) * 10 }));
// Statünün adı adımın OP numarasıdır; yeni adımda sırası.
export const statuNo = (a: Pick<Adim, 'opNo' | 'seq'>): number => a.opNo ?? a.seq;
export const fasonMu = (a: Pick<Adim, 'fasonId' | 'stationId' | 'machineId'>): boolean => !!a.fasonId && !a.stationId && !a.machineId;
export const girdiOlur = (m: Malzeme | undefined): boolean => !!m && m.girdiOlabilir !== false && m.type !== 'hizmet';

export const revizyonlari = (revler: readonly Revizyon[] | null, urunId: string): Revizyon[] =>
  (revler ?? []).filter((r) => r.itemId === urunId).sort((a, b) => a.created - b.created);
export const yururlukteki = (revler: readonly Revizyon[]): Revizyon | null => revler.find((r) => r.status === 'yururlukte') ?? null;
export const acikRevizyon = (revler: readonly Revizyon[]): Revizyon | null => revler.find((r) => r.status === 'taslak' || r.status === 'onay') ?? null;
export const acikMi = (d: RevDurumu | null): boolean => d === 'taslak' || d === 'onay';

// Rota yalnız mamul ve yarı mamulün olur; başka türde önceden kalmış rota görünür kalsın diye o kart da sayılır.
export function rotaSahibiOlur(m: Malzeme, adimSayisi: number, revSayisi: number): boolean {
  return m.type === 'mamul' || m.type === 'yari' || (m.type !== 'ham' && (adimSayisi > 0 || revSayisi > 0));
}

/* ---------------- çok dallı rota (1248 a) ---------------- */

// Ekranda seçilebilen dallar; sunucu A-Z kabul eder, sekiz dal atölyede yeter [Varsayım].
export const DAL_HARFLERI: readonly string[] = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];
export const adimDali = (a: Pick<Adim, 'dal'>): string | null => a.dal ?? null;
export const adimBirlesen = (a: Pick<Adim, 'birlesen'>): readonly string[] => a.birlesen ?? [];
const SUNUCU_BAGI = { bagimli: 'bekleyen', ortulu: 'akisli', bagimsiz: 'bagimsiz' } as const;

// Öncül kuralı sunucuyla ortaktır (paylasilan): liste sıralıdır, öncüller listedeki adımlardır; tek hatlı rotada her adım için null.
export function adimOnculleri(liste: readonly Adim[]): (Adim[] | null)[] {
  const o = oncullerCikar(liste.map((a, i) => ({
    opNo: i, bagimlilik: SUNUCU_BAGI[a.dep], devirAdedi: a.dep === 'ortulu' ? a.depQty : null, dal: adimDali(a), birlesen: adimBirlesen(a),
  })));
  return o.map((l) => (l === null ? null : l.flatMap((x) => liste[x.opNo] ?? [])));
}
export const dalliRota = (liste: readonly Adim[]): boolean => dalliMi(liste.map((a) => ({ dal: adimDali(a), birlesen: adimBirlesen(a) })));
// Adımdan önce başlamış ve henüz birleşmemiş, adımın kendi dalı olmayan dallar: birleştirme adımında seçilebilenler.
export function birlesebilenDallar(liste: readonly Adim[], i: number): string[] {
  const once = liste.slice(0, i);
  const baslayan = new Set(once.flatMap((a) => adimDali(a) ?? []));
  for (const a of once) for (const d of adimBirlesen(a)) baslayan.delete(d);
  const kendi = liste[i] ? adimDali(liste[i]) : null;
  return [...baslayan].filter((d) => d !== kendi).sort();
}
// Dal çarpanı (1257 a) yalnız dal adımında anlamlıdır; dal kalkınca çarpan da kalkar.
export const dalYaz = (a: Adim, dal: string | null): Adim => ({
  ...a, dal, birlesen: adimBirlesen(a).filter((d) => d !== dal), ...(dal === null && a.adetCarpani != null ? { adetCarpani: null } : {}),
});
export const adimCarpani = (a: Pick<Adim, 'adetCarpani'>): number => a.adetCarpani ?? 1;
export const carpanYaz = (a: Adim, v: number | null): Adim => ({ ...a, adetCarpani: v === null || v <= 1 ? null : Math.min(1000, Math.round(v)) });
export const birlesenYaz = (a: Adim, d: string, sec: boolean): Adim => ({
  ...a, birlesen: sec ? [...new Set([...adimBirlesen(a), d])].sort() : adimBirlesen(a).filter((x) => x !== d),
});

// Adımın tükettiği önceki adımlar (sunucunun akisiCikar kuralı): dallı rotada öncülleri; tek hatlı rotada bağımsız ve ilk adım tüketmez,
// ötekiler zincirdeki bağımsız olmayan önceki adımın ve aradaki bağımsız adımların çıktısını tüketir.
export function tuketilenAdimlar(liste: readonly Adim[], i: number): Adim[] {
  const dalli = adimOnculleri(liste)[i];
  if (dalli) return dalli;
  const adim = liste[i];
  if (i <= 0 || !adim || adim.dep === 'bagimsiz') return [];
  const sonuc: Adim[] = [];
  for (let j = i - 1; j >= 0; j--) {
    const o = liste[j];
    if (!o) break;
    sonuc.unshift(o);
    if (o.dep !== 'bagimsiz' || j === 0) break;
  }
  return sonuc;
}

// Adımın taşıdığı malzeme: önceki adımın çıktısını tüketiyorsa onunki; ilk ve bağımsız adımda ilk girdisi; girdisi yoksa rota sahibi.
export function tasinanMalzeme(sahipId: string, liste: readonly Adim[], i: number, malzemeVar: (id: string) => boolean): string {
  const ana = tuketilenAdimlar(liste, i)[0];
  if (ana) return tasinanMalzeme(sahipId, liste, liste.indexOf(ana), malzemeVar);
  const g = (liste[i]?.ins ?? []).find((x) => malzemeVar(x.itemId));
  return g ? g.itemId : sahipId;
}

// Adımın akış kartı: son adımda ürünün kendisi, öteki adımlarda taşınan malzemenin statülü kartı (adımın OP numarasıyla).
export interface AkisKarti { itemId: string; adim: Adim | null }
export function akisKarti(sahipId: string, liste: readonly Adim[], i: number, malzemeVar: (id: string) => boolean): AkisKarti {
  if (i === liste.length - 1) return { itemId: sahipId, adim: null };
  return { itemId: tasinanMalzeme(sahipId, liste, i, malzemeVar), adim: liste[i] ?? null };
}

// Statülü kart adı: tür + OP numarası + operasyon adı (ör. "YM OP 30 Kaynak").
export function kartBasligi(m: Malzeme | undefined, adim: Adim | null, opAdi: (opId: string) => string | null): string {
  if (!adim) return m ? m.code : '?';
  return `${m ? turKisa(m.type) : ''} OP ${String(statuNo(adim))} ${opAdi(adim.opId) ?? 'Adım'}`.trim();
}

// Ara kart (statülü kart) emrin adediyle sayılır, birimi adettir; son adımın çıktısı (adım yok) malzemenin kendi birimini korur.
export const kartBirimi = (m: Malzeme | undefined, adim: Adim | null): string => (adim ? 'adet' : m?.unit ?? '');

// Bir adımda aynı malzeme iki kez giren olamaz (rota modülü de reddeder, RT-55); ekran eklemeden önce engeller. Değiştirilen girenin kendi
// sırası (haric) sayılmaz: gireni kendi malzemesiyle değiştirmek serbesttir. Dönen, var olan girenin sırasıdır.
export function girenTekrari(a: Pick<Adim, 'ins'>, malzemeId: string, haric: number | null = null): number | null {
  const i = a.ins.findIndex((g, j) => j !== haric && g.itemId === malzemeId);
  return i < 0 ? null : i;
}
export const girenTekrarIletisi = (kod: string): string => `${kod} bu adımda zaten giren; var olan giren seçildi. Miktarı onun üzerinden değiştir.`;

export interface RotaEksigi { adimId: string; metin: string }
// Terminal adımda neyi tüketip neyi üreteceğini rotadan okur: ilk adımda ve bağımsız adımda en az bir giren zorunludur. Eksik rota onaya
// gidemez, onaylanamaz, yürürlüğe alınamaz; taslak kaydı sürer.
export function rotaEksikleri(adimlar: readonly Adim[], malzemeVar: (id: string) => boolean, opAdi: (opId: string) => string | null): RotaEksigi[] {
  const ss = sirali(adimlar);
  const l: RotaEksigi[] = [];
  const onculler = adimOnculleri(ss);
  const dal = dalDenetle(ss.map((a) => ({ dal: adimDali(a), birlesen: adimBirlesen(a) })));
  const dalAdimi = dal ? ss[Number(/^adimlar\.(\d+)/.exec(dal.alan)?.[1] ?? ss.length - 1)] : undefined;
  ss.forEach((s, i) => {
    const m: string[] = [];
    const o = onculler[i];
    if (s.ins.some((x) => !malzemeVar(x.itemId))) m.push('girenlerden biri silinmiş bir karta bağlı');
    else if (i === 0 && s.ins.length === 0) m.push('giren (hammadde ya da yarı mamul) seçilmeli');
    else if (o && o.length === 0 && s.ins.length === 0) m.push('hiçbir adımı beklemediği için giren seçilmeli');
    else if (!o && s.dep === 'bagimsiz' && s.ins.length === 0) m.push('önceki adımı beklemediği için giren seçilmeli');
    if (dal && dalAdimi === s) m.push(dal.ileti.replace(/\.$/, ''));
    if (!fasonMu(s) && s.ayarli === true && s.ayarDk == null) m.push('ayar işaretli; ayar süresi girilmeli');
    if (m.length) {
      const ad = opAdi(s.opId);
      l.push({ adimId: s.id, metin: `OP ${String(s.seq)}${ad ? ` ${ad}` : ''}: ${m.join(', ')}` });
    }
  });
  return l;
}

// 1210 b: fason adımının hemen arkasında GKK kodlu adım yoksa yalnız uyarılır; onay durmaz, emir açılınca araya otomatik GKK girer (1208).
export const GKK_KODU = 'GKK';
export function gkkUyarilari(adimlar: readonly Adim[], opKodu: (opId: string) => string | null, opAdi: (opId: string) => string | null): RotaEksigi[] {
  const ss = sirali(adimlar);
  return ss.flatMap((s, i) => {
    const sonraki = ss[i + 1];
    if (!fasonMu(s) || (sonraki && opKodu(sonraki.opId) === GKK_KODU)) return [];
    const ad = opAdi(s.opId);
    return [{ adimId: s.id, metin: `OP ${String(s.seq)}${ad ? ` ${ad}` : ''}` }];
  });
}

// Fason olmayan her adımda işlem süresi zorunludur; hazırlık ve değişim 0 olabilir.
export const islemSuresiEksik = (adimlar: readonly Adim[]): Adim | null =>
  sirali(adimlar).find((s) => !fasonMu(s) && !((sureSayisi(s.proc) ?? 0) > 0)) ?? null;

// Fire payı olan adımdan önceki her adım ve girenleri fazladan işlenir.
export function adimCarpanlari(adimlar: readonly Adim[]): number[] {
  const f = new Array<number>(adimlar.length).fill(1);
  let acc = 1;
  for (let j = adimlar.length - 1; j >= 0; j--) {
    const rj = Math.min(0.95, Math.max(0, (adimlar[j]?.rejectPct ?? 0) / 100));
    acc /= 1 - rj;
    f[j] = acc;
  }
  return f;
}

// Malzeme maliyeti (prototipte matCost): rotası olan kartta girenlerin toplamı, olmayanda birim maliyet. Birim maliyeti bilinmeyen kalem
// varsa toplam bilinmez (null); sıfır uydurulmaz.
export function malzemeMaliyeti(
  id: string, rotaOf: (id: string) => readonly Adim[], malzeme: (id: string) => Malzeme | undefined,
  birimMaliyet: (id: string) => number | null, yol: readonly string[] = [],
): number | null {
  const m = malzeme(id);
  if (!m || yol.includes(id)) return 0;
  const ss = sirali(rotaOf(id));
  if (m.type === 'ham' || ss.length === 0) return birimMaliyet(id);
  const fs = adimCarpanlari(ss);
  let c = 0;
  for (let j = 0; j < ss.length; j++) {
    for (const x of ss[j]?.ins ?? []) {
      if (!malzeme(x.itemId)) continue;
      const alt = malzemeMaliyeti(x.itemId, rotaOf, malzeme, birimMaliyet, [...yol, id]);
      if (alt === null) return null;
      c += (x.qty || 0) * (1 + (x.scrap || 0) / 100) * (fs[j] ?? 1) * alt;
    }
  }
  return c;
}

// Adımın süresi (prototipte opDays): hazırlık + çevrim * miktar / verim; gün, iş merkezinin ortalama günlük saatiyle.
export function adimSuresi(a: Adim, miktar: number, istasyon: Istasyon | undefined, gunSaati: number): { dk: number; gun: number } | null {
  if (!istasyon) return null;
  const verim = Math.max(0.05, (istasyon.eff ?? 100) / 100);
  const dk = (sureSayisi(a.setup) ?? 0) + (cevrimToplami(a.proc, a.chg) * miktar) / verim;
  return { dk, gun: dk / 60 / gunSaati };
}
// İş merkezinin çalışılan günlerinin ortalama net saati; hafta okunamazsa 8 saat.
export function ortalamaGunSaati(hafta: Record<number, string[]> | undefined, vardiyaDk: (id: string) => number): number {
  if (!hafta) return 8;
  let h = 0; let n = 0;
  for (let g = 0; g < 7; g++) {
    const x = (hafta[g] ?? []).reduce((t, id) => t + vardiyaDk(id) / 60, 0);
    if (x > 0) { h += x; n++; }
  }
  return n ? h / n : 8;
}

/* ---------------- ağaç ---------------- */

export interface AgacAdimi { a: Adim; miktar: number; girenler: { x: Giren; sira: number; dugum: Dugum }[]; yanlar: { y: YanUrun; sira: number; miktar: number }[] }
export interface Dugum { id: string; miktar: number; nid: string; adimlar: AgacAdimi[]; dongu: boolean }

// Ürün ağacı: her giren rotası varsa kendi düğümüdür. Baz miktar sunucuda yoktur: 1 sayılır.
export function agacKur(id: string, miktar: number, rotaOf: (id: string) => readonly Adim[], malzeme: (id: string) => Malzeme | undefined,
  yol: readonly string[] = [], nid = 'kok'): Dugum {
  const n: Dugum = { id, miktar, nid, adimlar: [], dongu: false };
  if (yol.includes(id)) { n.dongu = true; return n; }
  const m = malzeme(id);
  if (!m || m.type === 'ham') return n;
  const ss = sirali(rotaOf(id));
  const fs = adimCarpanlari(ss);
  ss.forEach((a, j) => {
    const k = fs[j] ?? 1;
    n.adimlar.push({
      a, miktar: miktar * k,
      girenler: a.ins.map((x, sira) => ({ x, sira })).filter(({ x }) => malzeme(x.itemId)).map(({ x, sira }) => ({
        x, sira, dugum: agacKur(x.itemId, miktar * k * (x.qty || 0) * (1 + (x.scrap || 0) / 100), rotaOf, malzeme, [...yol, id], `${nid}>${a.id}.${String(sira)}`),
      })),
      yanlar: a.outs.map((y, sira) => ({ y, sira })).filter(({ y }) => malzeme(y.itemId)).map(({ y, sira }) => ({ y, sira, miktar: miktar * k * (y.qty || 0) })),
    });
  });
  return n;
}
export function dugumBul(kok: Dugum, urunId: string): Dugum | null {
  if (kok.id === urunId) return kok;
  for (const s of kok.adimlar) for (const g of s.girenler) { const d = dugumBul(g.dugum, urunId); if (d) return d; }
  return null;
}
// Şemadaki rotalar: kök ve rotası olan ya da açık taslağı olan alt montajlar, her biri bir kez.
export function agacUrunleri(kok: string, rotaOf: (id: string) => readonly Adim[], malzeme: (id: string) => Malzeme | undefined,
  rotaVar: (id: string) => boolean): string[] {
  const out: string[] = []; const gorulen = new Set<string>();
  const gez = (id: string) => {
    const m = malzeme(id);
    if (gorulen.has(id) || !m) return;
    gorulen.add(id);
    if (m.type !== 'ham') out.push(id);
    for (const s of rotaOf(id)) for (const x of s.ins) if (rotaVar(x.itemId)) gez(x.itemId);
  };
  gez(kok);
  return out;
}

/* ---------------- düzenleme (saf: yeni dizi döner) ---------------- */

export function yeniAdim(op: Operasyon | undefined, id: string): Adim {
  const proc = sureSayisi(op?.cycle ?? null);
  return {
    id, seq: 0, opNo: null, opId: op?.id ?? '', name: op?.name ?? '', stationId: op?.stationId ?? null, machineId: null, kisiId: null, fasonId: null,
    terminGun: null, setup: op ? op.setup : 15, proc: op ? proc : 2, chg: null, cycle: op ? cevrimToplami(proc, null) : 2,
    dep: 'bagimli', depQty: 1, rejectPct: 0, split: 'tek', minLot: null, resetup: true, ilkParca: 'her_kurulum', alts: [], altTimes: {}, digerAdaylar: [], ins: [], outs: [],
  };
}
// Adım `sonraId`den sonra (null: başa) eklenir; sıra yeniden 10, 20...
export function adimEkle(adimlar: readonly Adim[], sonraId: string | null, a: Adim): Adim[] {
  const l = sirali(adimlar);
  const i = sonraId === null ? 0 : l.findIndex((x) => x.id === sonraId) + 1;
  l.splice(i <= 0 && sonraId !== null ? l.length : i, 0, a);
  return yenidenNumarala(l);
}
export function adimTasi(adimlar: readonly Adim[], id: string, yon: -1 | 1): Adim[] {
  const l = sirali(adimlar);
  const i = l.findIndex((x) => x.id === id); const j = i + yon;
  const a = l[i]; const b = l[j];
  if (i < 0 || !a || !b) return [...adimlar];
  l[i] = b; l[j] = a;
  return yenidenNumarala(l);
}
// Sürükle bırak: aşağı taşırken hedefin altına, yukarı taşırken üstüne.
export function adimSurukle(adimlar: readonly Adim[], kaynakId: string, hedefId: string): Adim[] {
  const l = sirali(adimlar);
  const from = l.findIndex((x) => x.id === kaynakId); const to = l.findIndex((x) => x.id === hedefId);
  const mv = l[from];
  if (from < 0 || to < 0 || !mv || from === to) return [...adimlar];
  const kalan = l.filter((x) => x.id !== kaynakId);
  let pos = kalan.findIndex((x) => x.id === hedefId);
  if (from < to) pos++;
  kalan.splice(pos, 0, mv);
  return yenidenNumarala(kalan);
}
// Bırakma şeridi: adım `sonraId`nin ardına (null: başa) taşınır; kendi ardına bırakmak sırayı değiştirmez.
export function adimArkasinaTasi(adimlar: readonly Adim[], kaynakId: string, sonraId: string | null): Adim[] {
  const l = sirali(adimlar);
  const mv = l.find((x) => x.id === kaynakId);
  if (!mv || sonraId === kaynakId) return [...adimlar];
  const kalan = l.filter((x) => x.id !== kaynakId);
  const i = sonraId === null ? 0 : kalan.findIndex((x) => x.id === sonraId) + 1;
  if (sonraId !== null && i === 0) return [...adimlar];
  kalan.splice(i, 0, mv);
  return yenidenNumarala(kalan);
}
export const adimSil = (adimlar: readonly Adim[], id: string): Adim[] => yenidenNumarala(sirali(adimlar).filter((x) => x.id !== id));
export const adimGuncelle = (adimlar: readonly Adim[], id: string, f: (a: Adim) => Adim): Adim[] => adimlar.map((a) => (a.id === id ? f(a) : a));

export function sonrakiBagimlilik(d: Bagimlilik): Bagimlilik {
  return BAGIMLILIK_SIRASI[(BAGIMLILIK_SIRASI.indexOf(d) + 1) % BAGIMLILIK_SIRASI.length] ?? 'bagimli';
}
export const bagimlilikYaz = (a: Adim, d: Bagimlilik): Adim => ({ ...a, dep: d, depQty: d === 'ortulu' && !((a.depQty ?? 0) > 0) ? 1 : a.depQty });

// İstasyon değişince makine seçimi kalkar; istasyon seçilen fason adım içeri döner.
export function istasyonYaz(a: Adim, sid: string | null): Adim {
  const b: Adim = { ...a, stationId: sid, machineId: a.stationId === sid ? a.machineId : null };
  return sid && a.fasonId ? { ...b, fasonId: null, terminGun: null } : b;
}
// Operasyon değişince istasyon (fasonda değil), hazırlık ve süreler katalogdan gelir; adım adı operasyonun adı olur.
export function operasyonYaz(a: Adim, op: Operasyon | undefined): Adim {
  if (!op) return { ...a, opId: '' };
  const proc = sureSayisi(op.cycle);
  const b: Adim = { ...a, opId: op.id, name: op.name, setup: op.setup, ...toplamdanBolum(op.setup), proc, chg: null, cycle: cevrimToplami(proc, null) };
  return fasonMu(a) ? b : istasyonYaz(b, op.stationId);
}
export const katalogaDon = (a: Adim, op: Operasyon): Adim => {
  const proc = sureSayisi(op.cycle);
  return { ...istasyonYaz(a, op.stationId), setup: op.setup, ...toplamdanBolum(op.setup), proc, chg: null, cycle: cevrimToplami(proc, null) };
};
export const katalogdanFarkli = (a: Adim, op: Operasyon): boolean =>
  op.stationId !== a.stationId || op.setup !== a.setup || sureSayisi(op.cycle) !== a.proc || a.chg !== null;
// Fason adımın kaynağı fason firmadır: istasyon, makine, aday ve süre yoktur. İçeri alınınca operasyonun istasyonuna döner.
export function fasonaCevir(a: Adim, firmaId: string | null, op: Operasyon | undefined): Adim {
  if (firmaId) {
    return { ...a, machineId: null, stationId: null, kisiId: null, alts: [], altTimes: {}, digerAdaylar: [], split: 'tek', minLot: null, fasonId: firmaId };
  }
  const b: Adim = { ...a, fasonId: null, terminGun: null };
  return b.stationId ? b : { ...b, stationId: op?.stationId ?? null };
}
export function sureYaz(a: Adim, alan: 'setup' | 'proc' | 'chg', deger: number | null): Adim {
  if (alan === 'setup') return toplamYaz(a, deger);
  const b = { ...a, [alan]: deger };
  return { ...b, cycle: cevrimToplami(b.proc, b.chg) };
}

// Hazırlık bölümü (1310 a): setup toplamdır (hazırlık + ayar). Bölümü taşımayan adımda (eski kayıt, katalogdan gelen süre) sunucunun göç
// kuralı geçerlidir: süre varsa ayardır.
export interface HazirlikBolumu { hazirlik: number | null; ayarli: boolean; ayarDk: number | null }
export function toplamdanBolum(setup: number | null): HazirlikBolumu {
  const t = sureSayisi(setup);
  return t !== null && t > 0 ? { hazirlik: 0, ayarli: true, ayarDk: t } : { hazirlik: t, ayarli: false, ayarDk: null };
}
export function hazirlikBolumu(a: Adim): HazirlikBolumu {
  if (a.ayarli === undefined) return toplamdanBolum(a.setup);
  return { hazirlik: a.hazirlik ?? null, ayarli: a.ayarli, ayarDk: a.ayarli ? a.ayarDk ?? null : null };
}
// Yalnız toplam girilen yerde (akış tablosu) sunucunun kuralı: ayar işaretliyse fark ayara, değilse hazırlığa yazılır.
function toplamYaz(a: Adim, toplam: number | null): Adim {
  const h = hazirlikBolumu(a);
  if (toplam === null) return hazirlikYaz(a, { hazirlik: null, ayarDk: null });
  if (!h.ayarli) return hazirlikYaz(a, { hazirlik: toplam });
  const hazirlik = Math.min(h.hazirlik ?? 0, toplam);
  return hazirlikYaz(a, { hazirlik, ayarDk: Math.round((toplam - hazirlik) * 100) / 100 });
}
export function hazirlikYaz(a: Adim, d: Partial<HazirlikBolumu>): Adim {
  const b = { ...hazirlikBolumu(a), ...d };
  const ayarDk = b.ayarli ? b.ayarDk : null;
  const setup = b.hazirlik === null && ayarDk === null ? null : (b.hazirlik ?? 0) + (ayarDk ?? 0);
  return { ...a, hazirlik: b.hazirlik, ayarli: b.ayarli, ayarDk, setup };
}

/* ---------------- revizyon farkı ---------------- */

export interface FarkAdlari { op: (id: string) => string; istasyon: (id: string | null) => string; malzeme: (id: string) => string }
const J = (v: unknown): string => JSON.stringify(v);
const sayiBicim = (v: number, n: number) => v.toLocaleString('tr-TR', { maximumFractionDigits: n });
export function rotaFarki(A: readonly Adim[], B: readonly Adim[], ad: FarkAdlari): string[] {
  const out: string[] = [];
  const nm = (s: Adim) => `OP ${String(s.seq)} ${ad.op(s.opId)}`;
  const am = new Map(A.map((s) => [s.id, s])); const bm = new Map(B.map((s) => [s.id, s]));
  for (const s of B) if (!am.has(s.id)) out.push(`Yeni adım: ${nm(s)}`);
  for (const s of A) if (!bm.has(s.id)) out.push(`Silinen adım: ${nm(s)}`);
  const ao = sirali(A).map((s) => s.id).filter((id) => bm.has(id)); const bo = sirali(B).map((s) => s.id).filter((id) => am.has(id));
  if (J(ao) !== J(bo)) out.push('Adım sırası değişti');
  const dk = (v: number | null) => (v === null ? 'boş' : `${sayiBicim(v, 2)} dk`);
  const ALANLAR: readonly [keyof Adim, string, (v: Adim) => string][] = [
    ['opId', 'operasyon', (v) => ad.op(v.opId)], ['stationId', 'istasyon', (v) => ad.istasyon(v.stationId)],
    ['setup', 'hazırlık', (v) => dk(v.setup)], ['proc', 'işlem', (v) => dk(v.proc)], ['chg', 'değişim', (v) => dk(v.chg)],
    ['dep', 'bağlılık', (v) => ({ bagimli: 'bağımlı', ortulu: 'örtülü', bagimsiz: 'bağımsız' })[v.dep]],
    ['depQty', 'örtüşme', (v) => `${sayiBicim(v.depQty ?? 1, 0)} adet`], ['rejectPct', 'fire payı', (v) => `%${sayiBicim(v.rejectPct, 1)}`],
    ['split', 'makine kullanımı', (v) => (v.split === 'bol' ? 'paralel böl' : 'tek')],
    ['alts', 'alternatif', (v) => v.alts.map((x) => ad.istasyon(x)).join(', ') || 'yok'],
    ['fasonId', 'üretim yeri', (v) => (v.fasonId ? 'dış üretim' : 'iç üretim')],
  ];
  for (const s of B) {
    const o = am.get(s.id);
    if (!o) continue;
    const ch: string[] = [];
    for (const [f, l, fv] of ALANLAR) {
      if (f === 'depQty' && s.dep !== 'ortulu') continue;
      if (J(o[f]) !== J(s[f])) ch.push(`${l} ${fv(o)} → ${fv(s)}`);
    }
    s.ins.forEach((x, i) => {
      const p = o.ins.find((y) => y.itemId === x.itemId) ?? (o.ins[i]?.itemId === x.itemId ? o.ins[i] : undefined);
      if (!p) ch.push(`giren eklendi ${ad.malzeme(x.itemId)} ${sayiBicim(x.qty, 3)}`);
      else if (J(p) !== J(x)) {
        ch.push(`giren ${ad.malzeme(x.itemId)} ${sayiBicim(p.qty, 3)} → ${sayiBicim(x.qty, 3)}${p.scrap !== x.scrap ? `, fire %${sayiBicim(p.scrap, 1)} → %${sayiBicim(x.scrap, 1)}` : ''}`);
      }
    });
    for (const x of o.ins) if (!s.ins.some((y) => y.itemId === x.itemId)) ch.push(`giren çıkarıldı ${ad.malzeme(x.itemId)}`);
    if (J(o.outs) !== J(s.outs)) ch.push('yan ürünler değişti');
    if (adimDali(o) !== adimDali(s)) ch.push(`dal ${adimDali(o) ?? 'ana hat'} → ${adimDali(s) ?? 'ana hat'}`);
    if (J(adimBirlesen(o)) !== J(adimBirlesen(s))) ch.push(`birleşen ${adimBirlesen(o).join(', ') || 'yok'} → ${adimBirlesen(s).join(', ') || 'yok'}`);
    if (ch.length) out.push(`${nm(s)}: ${ch.join('; ')}`);
  }
  return out;
}

/* ---------------- kaydet gövdesi ---------------- */

const kimlik = (v: string, s: Adim, ne: string): number => {
  if (!/^\d+$/.test(v)) throw new Error(`OP ${String(s.seq)}: ${ne} sunucudaki kayıtla eşleşmiyor (eski kayıt); rota rota modülüne kaydedilmedi.`);
  return Number(v);
};
const BAGIMLILIK_SUNUCU: Readonly<Record<Bagimlilik, string>> = { bagimli: 'bekleyen', ortulu: 'akisli', bagimsiz: 'bagimsiz' };

// Taslak rota modülünün kaydet gövdesine çevrilir (prototipte rotaGovdesi). OP numarası yalnız revizyonda zaten varsa gider; yeni adım
// numarasını sunucudan alır. Sunucuya gidemeyecek adım (katalogda olmayan operasyon, eski kimlik) açıklamayla durur.
export function kaydetGovdesi(adimlar: readonly Adim[], izinliOpNolar: readonly number[], operasyon: (id: string) => Operasyon | undefined): Record<string, unknown>[] {
  const izinli = new Set(izinliOpNolar);
  return sirali(adimlar).map((s) => {
    const op = operasyon(s.opId);
    if (!op) throw new Error(`OP ${String(s.seq)}: operasyon tanımı Operasyonlar bölümündeki karta bağlı değil; rota rota modülüne kaydedilmedi.`);
    const mk = s.machineId ? kimlik(s.machineId, s, 'Makine') : null;
    const ist = s.stationId ? kimlik(s.stationId, s, 'İstasyon') : null;
    const kaynak = mk ? { tur: 'makine', id: mk } : ist ? { tur: 'istasyon', id: ist } : s.fasonId ? { tur: 'fason', id: Number(s.fasonId) }
      : s.kisiId ? { tur: 'kisi', id: Number(s.kisiId) } : null;
    const fason = kaynak?.tur === 'fason';
    const proc = (sureSayisi(s.proc) ?? 0) > 0 ? s.proc : null;
    const chg = proc === null ? null : sureSayisi(s.chg);
    return {
      opNo: s.opNo !== null && izinli.has(s.opNo) ? s.opNo : null,
      operasyonTipiId: Number(op.id),
      ad: s.name.trim() !== '' ? s.name : op.name,
      kaynak,
      ayarSuresiDk: fason ? null : sureSayisi(s.setup) ?? 0,
      // Sunucu toplamı bölümden yeniden hesaplar; fasonda süre yoktur.
      ...(fason ? { hazirlikDk: null, ayar: false, ayarDk: null } : (() => {
        const h = hazirlikBolumu(s);
        return { hazirlikDk: h.hazirlik ?? (h.ayarDk === null ? 0 : null), ayar: h.ayarli, ayarDk: h.ayarDk };
      })()),
      islemSuresiDk: fason ? null : proc,
      degisimSuresiDk: fason ? null : chg,
      birimSureDk: null,
      terminGun: fason ? s.terminGun : null,
      bagimlilik: BAGIMLILIK_SUNUCU[s.dep],
      devirAdedi: s.dep === 'ortulu' ? Math.max(1, Math.round(s.depQty ?? 1)) : null,
      firePayiYuzde: Number(s.rejectPct) || 0,
      makineKullanimi: s.split === 'bol' ? 'paralel' : 'tek',
      enKucukParca: s.split === 'bol' && (s.minLot ?? 0) > 0 ? Math.round(s.minLot ?? 0) : null,
      yenidenAyar: s.resetup !== false,
      // Seçimi bilinmeyen adımda alan gönderilmez: sunucu kayıtlı seçimi korur.
      ...(s.ilkParca === undefined ? {} : { ilkParca: s.ilkParca }),
      dal: adimDali(s),
      birlesen: [...adimBirlesen(s)],
      // Çarpanı taşımayan yerel taslakta alan gönderilmez: sunucu kayıtlı çarpanı korur.
      ...(s.adetCarpani === undefined ? {} : { adetCarpani: adimDali(s) === null ? null : s.adetCarpani }),
      adaylar: [
        ...s.alts.map((id) => {
          const t = s.altTimes[id];
          return {
            kaynak: { tur: 'istasyon', id: kimlik(id, s, 'Alternatif istasyon') }, ayarSuresiDk: sureSayisi(t?.setup ?? null),
            birimSureDk: (t?.cycle ?? 0) > 0 ? t?.cycle ?? null : null, islemSuresiDk: null, degisimSuresiDk: null,
          };
        }),
        ...s.digerAdaylar.map((x) => ({
          kaynak: { tur: x.tur, id: Number(x.id) }, ayarSuresiDk: x.setup, birimSureDk: null,
          islemSuresiDk: (x.proc ?? 0) > 0 ? x.proc : null, degisimSuresiDk: (x.proc ?? 0) > 0 ? x.chg : null,
        })),
      ],
      bilesenler: s.ins.map((x) => ({ malzemeId: kimlik(x.itemId, s, 'Girdi kalemi'), miktar: Number(x.qty) || 0, fireYuzde: Number(x.scrap) || 0 })),
      yanUrunler: s.outs.map((x) => ({ malzemeId: kimlik(x.itemId, s, 'Yan ürün'), miktar: Number(x.qty) || 0 })),
    };
  });
}

// Sunucunun reddettiği alan "adimlar.<n>..." ise ileti adımı ekrandaki OP numarası ve operasyon adıyla başlar.
export function rotaHataMetni(ileti: string, alan: string | null, adimlar: readonly Adim[], opAdi: (id: string) => string | null): string {
  const n = /^adimlar\.(\d+)\b/.exec(alan ?? '');
  const s = n ? sirali(adimlar)[Number(n[1])] : undefined;
  if (!s) return ileti;
  const ad = opAdi(s.opId);
  return `OP ${String(s.seq)}${ad ? ` ${ad}` : ''}: ${ileti.replace(/^OP \d+: /, '')}`;
}

// Malzeme seçici (Girenler, Yan ürünler): koda ve ada göre süzer, türe göre süzgeç; kodu yazılanla başlayan önce gelir.
export const SECICI_TURLERI: readonly (readonly [string, string])[] = [['all', 'Tümü'], ['mamul', 'MM'], ['yari', 'YM'], ['ham', 'HM']];
export function malzemeAra(liste: readonly Malzeme[], q: string, tur: string, girdi: boolean, haricId: string | null): Malzeme[] {
  const s = kucuk(q.trim());
  return liste
    .filter((m) => (tur === 'all' || m.type === tur) && (!girdi || girdiOlur(m)) && m.id !== haricId && (!s || kucuk(`${m.code} ${m.name}`).includes(s)))
    .map((m) => ({ m, bas: s && kucuk(m.code).startsWith(s) ? 0 : 1 }))
    .sort((a, b) => a.bas - b.bas || a.m.code.localeCompare(b.m.code, 'tr'))
    .map((x) => x.m);
}

/* ---------------- adımın şartnameleri (971 a, 989 a) ---------------- */

// Sözleşmedeki AZAMI_ADIM_SARTNAMESI; istemci sözleşmeden yalnız tip alır.
export const AZAMI_ADIM_SARTNAMESI = 5;
export type AdimSartnamesi = RevizyonSartnameleriCevabi['adimlar'][number]['sartnameler'][number];

export const kapsamaUyar = (kapsam: SartnameKapsami, fason: boolean): boolean => kapsam === 'ikisi' || (kapsam === 'fason') === fason;

// Eklenebilen: kullanımda, yayınlanmış sürümü olan, adımın türüne (iç ya da fason) uyan ve adımda olmayan şartname. Sunucu da aynısını reddeder.
export function eklenebilirSartnameler(liste: readonly SartnameOzeti[], bagli: ReadonlySet<number>, fason: boolean): SartnameOzeti[] {
  return liste
    .filter((s) => s.aktif && s.yururlukteSurumNo !== null && !bagli.has(s.id) && kapsamaUyar(s.kapsam, fason))
    .sort((a, b) => a.kod.localeCompare(b.kod, 'tr'));
}

// Satırın durumu: onaya göndermede ve emir açılırken reddedilecek eksikler önce gelir.
export function adimSartnameDurumu(x: AdimSartnamesi): { tamam: boolean; metin: string } {
  if (x.yururlukte === null) return { tamam: false, metin: 'Yayınlanmış sürümü yok' };
  if (x.kapsamUyumsuz) return { tamam: false, metin: x.sartname.kapsam === 'fason' ? 'Yalnız fason adıma uyar' : 'Yalnız iç adıma uyar' };
  if (x.eksikler.length > 0) return { tamam: false, metin: `Eksik: ${x.eksikler.join(', ')}` };
  return { tamam: true, metin: 'Tam' };
}

// Şartname taslak revizyonda ve OP numarası olan adımda değişir. Rotanın kaydı beklerken yazılmaz: iki yazım aynı sürümü okur, biri reddedilir.
export function adimSartnameKilidi(g: { revDurumu: RevDurumu | null; opNo: number | null; kayitBekliyor: boolean }): string | null {
  if (g.revDurumu === null) return 'Rota kaydedilince şartname eklenir.';
  if (g.opNo === null) return 'Adım kaydedilip OP numarası alınca şartname eklenir.';
  if (g.revDurumu === 'onay') return 'Revizyon onayda; şartnameyi değiştirmek için taslağa geri gönder.';
  if (g.revDurumu !== 'taslak') return 'Şartname taslak revizyonda değişir.';
  if (g.kayitBekliyor) return 'Rota değişikliği kaydediliyor…';
  return null;
}
