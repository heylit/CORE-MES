import type {
  AlanKaydi, AramaTuru, Bulgu, DuvarKaydi, GecisKaydi, KapiKaydi, RafKaydi, YerlesimKaydi,
} from '#paylasilan/sozlesme/atolye.ts';
import { ARAMA_AZAMI_SONUC, MODEL_PARCA_BAYT } from '#paylasilan/sozlesme/atolye.ts';

// Kural numaraları (ATL-xx) KURAL-TEST.md'de test ya da kısıt adıyla eşleşir.

// ATL-07: 1 cm'den az değme ya da örtüşme çakışma sayılmaz (ölçü yuvarlaması ve dayalı yerleşim).
export const CAKISMA_PAYI = 0.01;
export const GOZ_SAYFA_BOYU = 200;
// ATL-20: rota ızgarasının en küçük adımı ve yürüyenin gövde yarıçapı (katı öğeye bu kadar yaklaşılmaz).
export const ROTA_IZGARASI = 0.5;
export const GOVDE_YARICAPI = 0.3;
// Yürüyüş yolu dışındaki adım bu kat pahalıdır: rota yolu yeğler ama yol yoksa yine bulur.
export const YOL_DISI_MALIYETI = 1.6;

// ---------- ATL-03: yuvarlama ----------

export const yuvarla = (deger: number, basamak = 2): number => {
  const carpan = 10 ** basamak;
  const sonuc = Math.round(deger * carpan) / carpan;
  return Object.is(sonuc, -0) ? 0 : sonuc;
};

// Dönüş 0,1 dereceye yuvarlanır ve [0, 360) aralığına indirgenir.
export function donusIndirge(derece: number): number {
  const d = yuvarla(((derece % 360) + 360) % 360, 1);
  return d >= 360 ? 0 : d;
}

export function yerlesimiYuvarla(k: YerlesimKaydi): YerlesimKaydi {
  const m = (v: number) => yuvarla(v);
  return {
    surum: k.surum,
    salon: {
      ...k.salon,
      genislik: m(k.salon.genislik), derinlik: m(k.salon.derinlik), hucreBoyu: m(k.salon.hucreBoyu),
      giris: k.salon.giris === null ? null : { x: m(k.salon.giris.x), z: m(k.salon.giris.z) },
    },
    istasyonYerleri: k.istasyonYerleri.map((y) => ({
      ...y, x: m(y.x), z: m(y.z), donus: donusIndirge(y.donus), genislik: m(y.genislik), derinlik: m(y.derinlik),
    })),
    ...(k.makineYerleri === undefined ? {} : {
      makineYerleri: k.makineYerleri.map((y) => ({
        ...y, x: m(y.x), z: m(y.z), donus: donusIndirge(y.donus), genislik: m(y.genislik), derinlik: m(y.derinlik),
      })),
    }),
    raflar: k.raflar.map((r) => ({
      ...r, x: m(r.x), z: m(r.z), donus: donusIndirge(r.donus),
      bolmeGenisligi: m(r.bolmeGenisligi), derinlik: m(r.derinlik), yukseklik: m(r.yukseklik),
      katYukseklikleri: r.katYukseklikleri === null ? null : r.katYukseklikleri.map(m),
      gozGenisligi: r.gozGenisligi === null ? null : m(r.gozGenisligi),
      gozDerinligi: r.gozDerinligi === null ? null : m(r.gozDerinligi),
    })),
    alanlar: k.alanlar.map((a) => ({
      ...a, x: m(a.x), z: m(a.z), donus: donusIndirge(a.donus), genislik: m(a.genislik), derinlik: m(a.derinlik),
      kapi: a.kapi === null ? null : { ...a.kapi, ofset: m(a.kapi.ofset), genislik: m(a.kapi.genislik) },
    })),
    duvarlar: k.duvarlar.map((d) => ({
      ...d, basX: m(d.basX), basZ: m(d.basZ), sonX: m(d.sonX), sonZ: m(d.sonZ), kalinlik: m(d.kalinlik),
    })),
    ...(k.gecisler === undefined ? {} : { gecisler: k.gecisler.map((g) => ({ ...g, ofset: m(g.ofset), genislik: m(g.genislik) })) }),
  };
}

// ---------- ATL-02: hücre adı ----------

// 0 -> A, 25 -> Z, 26 -> AA (sütun harfi elektronik tablo gibi).
export function sutunAdi(sira: number): string {
  let n = sira + 1;
  let ad = '';
  while (n > 0) {
    const kalan = (n - 1) % 26;
    ad = String.fromCharCode(65 + kalan) + ad;
    n = Math.floor((n - 1) / 26);
  }
  return ad;
}

export interface SalonOlcusu {
  genislik: number;
  derinlik: number;
  hucreBoyu: number;
}

export const sutunSayisi = (s: SalonOlcusu): number => Math.max(1, Math.ceil(s.genislik / s.hucreBoyu - 1e-9));
export const satirSayisi = (s: SalonOlcusu): number => Math.max(1, Math.ceil(s.derinlik / s.hucreBoyu - 1e-9));

export function izgaraAdlari(s: SalonOlcusu): { sutunlar: string[]; satirlar: string[] } {
  return {
    sutunlar: Array.from({ length: sutunSayisi(s) }, (_, i) => sutunAdi(i)),
    satirlar: Array.from({ length: satirSayisi(s) }, (_, i) => String(i + 1)),
  };
}

// Kenardaki nokta son hücreye düşer; salon dışındaki nokta en yakın kenar hücresine.
export function hucreAdi(x: number, z: number, s: SalonOlcusu): string {
  const sinirla = (deger: number, ust: number) => Math.min(ust - 1, Math.max(0, Math.floor(deger / s.hucreBoyu + 1e-9)));
  return `${sutunAdi(sinirla(x, sutunSayisi(s)))}${sinirla(z, satirSayisi(s)) + 1}`;
}

// ATL-41 (kart #1304): hücre adı ("C4") bölümdeki kareye çözülür; ızgara dışı ya da bozuk ad null. Son sütun ve satır bölüm
// kenarında kesilir. Stok Merkezi karelere bu adla alan ve istasyon atar.
export function hucreKutusu(hucre: string, s: SalonOlcusu): { x: number; z: number; genislik: number; derinlik: number } | null {
  const p = /^([A-Z]{1,3})([1-9][0-9]{0,3})$/.exec(hucre.trim().toUpperCase());
  if (!p) return null;
  const sutun = [...p[1]!].reduce((t, h) => t * 26 + (h.charCodeAt(0) - 64), 0) - 1;
  const satir = Number(p[2]) - 1;
  if (sutun >= sutunSayisi(s) || satir >= satirSayisi(s)) return null;
  const x0 = sutun * s.hucreBoyu, x1 = Math.min(s.genislik, x0 + s.hucreBoyu);
  const z0 = satir * s.hucreBoyu, z1 = Math.min(s.derinlik, z0 + s.hucreBoyu);
  return { x: (x0 + x1) / 2, z: (z0 + z1) / 2, genislik: x1 - x0, derinlik: z1 - z0 };
}

// ---------- geometri: dönmüş dikdörtgen ----------

export interface Kutu {
  x: number;
  z: number;
  donus: number;
  genislik: number;
  derinlik: number;
}

export type Nokta = readonly [number, number];

export function koseler(k: Kutu): Nokta[] {
  const a = (k.donus * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  const yg = k.genislik / 2;
  const yd = k.derinlik / 2;
  return ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([sx, sz]) => [
    k.x + sx * yg * c - sz * yd * s,
    k.z + sx * yg * s + sz * yd * c,
  ] as const);
}

// ATL-06: bütün köşeler salonun içinde (1 cm pay).
export function salondaMi(k: Kutu, s: { genislik: number; derinlik: number }): boolean {
  return koseler(k).every(([x, z]) => x >= -CAKISMA_PAYI && x <= s.genislik + CAKISMA_PAYI && z >= -CAKISMA_PAYI && z <= s.derinlik + CAKISMA_PAYI);
}

// Rota uçları salonun içinde olmalı: dışarıdaki hedef kenara kadar yürütülmez, kullanıcıya söylenir.
export function rotaNoktasiIhlali(n: { x: number; z: number }, s: { genislik: number; derinlik: number }, ad: 'Başlangıç' | 'Hedef'): string | null {
  const icinde = n.x >= -CAKISMA_PAYI && n.x <= s.genislik + CAKISMA_PAYI && n.z >= -CAKISMA_PAYI && n.z <= s.derinlik + CAKISMA_PAYI;
  return icinde ? null : `${ad} noktası bu bölümün dışında (${s.genislik} × ${s.derinlik} m); rota çizilmedi.`;
}

function eksenler(k: Kutu): Nokta[] {
  const a = (k.donus * Math.PI) / 180;
  return [[Math.cos(a), Math.sin(a)], [-Math.sin(a), Math.cos(a)]];
}

function izdusum(noktalar: readonly Nokta[], eksen: Nokta): [number, number] {
  let enaz = Infinity;
  let encok = -Infinity;
  for (const [x, z] of noktalar) {
    const d = x * eksen[0] + z * eksen[1];
    enaz = Math.min(enaz, d);
    encok = Math.max(encok, d);
  }
  return [enaz, encok];
}

// Ayırıcı eksen sınaması: iç içe geçme payı CAKISMA_PAYI'nı aşarsa çakışır (ATL-07).
export function cakisirMi(a: Kutu, b: Kutu, pay = CAKISMA_PAYI): boolean {
  const ka = koseler(a);
  const kb = koseler(b);
  for (const eksen of [...eksenler(a), ...eksenler(b)]) {
    const [a1, a2] = izdusum(ka, eksen);
    const [b1, b2] = izdusum(kb, eksen);
    if (Math.min(a2, b2) - Math.max(a1, b1) <= pay) return false;
  }
  return true;
}

export function noktaKutudaMi(x: number, z: number, k: Kutu, pay = 0): boolean {
  const a = (-k.donus * Math.PI) / 180;
  const dx = x - k.x;
  const dz = z - k.z;
  const yx = dx * Math.cos(a) - dz * Math.sin(a);
  const yz = dx * Math.sin(a) + dz * Math.cos(a);
  return Math.abs(yx) <= k.genislik / 2 + pay && Math.abs(yz) <= k.derinlik / 2 + pay;
}

export function duvarKutusu(d: Pick<DuvarKaydi, 'basX' | 'basZ' | 'sonX' | 'sonZ' | 'kalinlik'>): Kutu {
  const dx = d.sonX - d.basX;
  const dz = d.sonZ - d.basZ;
  return {
    x: (d.basX + d.sonX) / 2,
    z: (d.basZ + d.sonZ) / 2,
    donus: (Math.atan2(dz, dx) * 180) / Math.PI,
    genislik: Math.hypot(dx, dz),
    derinlik: d.kalinlik,
  };
}

export const rafBoyu = (r: Pick<RafKaydi, 'bolmeSayisi' | 'bolmeGenisligi'>): number => yuvarla(r.bolmeSayisi * r.bolmeGenisligi);

export const rafKutusu = (r: Pick<RafKaydi, 'x' | 'z' | 'donus' | 'bolmeSayisi' | 'bolmeGenisligi' | 'derinlik'>): Kutu => ({ x: r.x, z: r.z, donus: r.donus, genislik: rafBoyu(r), derinlik: r.derinlik });

export const ODA_TURLERI: readonly string[] = ['oda', 'cam_oda'];
const ODA_DUVARI = 0.12;

// Oda dört duvardır; kapı bulunduğu kenarda boşluk bırakır. İçine istasyon konabilir (kalite odası gibi).
export function odaDuvarlari(a: AlanKaydi): Kutu[] {
  const kenarlar: { kenar: KapiKaydi['kenar']; yerel: [Nokta, Nokta] }[] = [
    { kenar: 'arka', yerel: [[-a.genislik / 2, -a.derinlik / 2], [a.genislik / 2, -a.derinlik / 2]] },
    { kenar: 'sag', yerel: [[a.genislik / 2, -a.derinlik / 2], [a.genislik / 2, a.derinlik / 2]] },
    { kenar: 'on', yerel: [[a.genislik / 2, a.derinlik / 2], [-a.genislik / 2, a.derinlik / 2]] },
    { kenar: 'sol', yerel: [[-a.genislik / 2, a.derinlik / 2], [-a.genislik / 2, -a.derinlik / 2]] },
  ];
  const r = (a.donus * Math.PI) / 180;
  const dunya = ([x, z]: Nokta): Nokta => [a.x + x * Math.cos(r) - z * Math.sin(r), a.z + x * Math.sin(r) + z * Math.cos(r)];
  const parca = (p: Nokta, q: Nokta): Kutu => duvarKutusu({ basX: p[0], basZ: p[1], sonX: q[0], sonZ: q[1], kalinlik: ODA_DUVARI });
  const sonuc: Kutu[] = [];
  for (const { kenar, yerel: [p, q] } of kenarlar) {
    if (a.kapi === null || a.kapi.kenar !== kenar) {
      sonuc.push(parca(dunya(p), dunya(q)));
      continue;
    }
    // Kapı ofseti kenarın ortasından, kenarın yönünde ölçülür (on ve sol kenarlar ters yönde çizilir).
    const boy = Math.hypot(q[0] - p[0], q[1] - p[1]);
    const ux = (q[0] - p[0]) / boy;
    const uz = (q[1] - p[1]) / boy;
    const yon = kenar === 'on' || kenar === 'sol' ? -1 : 1;
    const orta = boy / 2 + yon * a.kapi.ofset;
    const k1 = orta - a.kapi.genislik / 2;
    const k2 = orta + a.kapi.genislik / 2;
    if (k1 > 0.01) sonuc.push(parca(dunya(p), dunya([p[0] + ux * k1, p[1] + uz * k1])));
    if (boy - k2 > 0.01) sonuc.push(parca(dunya([p[0] + ux * k2, p[1] + uz * k2]), dunya(q)));
  }
  return sonuc;
}

// ---------- ATL-34: bölüm geçişleri ----------

export const kenarBoyu = (kenar: GecisKaydi['kenar'], salon: { genislik: number; derinlik: number }): number =>
  kenar === 'on' || kenar === 'arka' ? salon.genislik : salon.derinlik;

// Geçiş kenarın içindedir; aynı kenardaki iki geçiş üst üste binmez (1 cm'ye kadar değme olur).
export function gecisIhlalleri(gecisler: readonly GecisKaydi[], salon: { genislik: number; derinlik: number }): Bulgu[] {
  const l: Bulgu[] = [];
  gecisler.forEach((g, i) => {
    if (Math.abs(g.ofset) + g.genislik / 2 > kenarBoyu(g.kenar, salon) / 2 + 1e-9) {
      l.push({ kural: 'ATL-34', mesaj: `${GECIS_ADI[g.tur]} bölümün kenarından taşıyor.`, ogeler: [`gecis:${i}`] });
    }
    for (let j = 0; j < i; j++) {
      const o = gecisler[j];
      if (!o || o.kenar !== g.kenar) continue;
      const ortusme = Math.min(g.ofset + g.genislik / 2, o.ofset + o.genislik / 2) - Math.max(g.ofset - g.genislik / 2, o.ofset - o.genislik / 2);
      if (ortusme > CAKISMA_PAYI) l.push({ kural: 'ATL-34', mesaj: `${GECIS_ADI[o.tur]} ile ${GECIS_ADI[g.tur]} aynı yerde.`, ogeler: [`gecis:${j}`, `gecis:${i}`] });
    }
  });
  return l;
}

export const GECIS_ADI: Record<GecisKaydi['tur'], string> = { kepenk: 'Kepenk', acik: 'Açık geçiş', kapi: 'Kapı', yangin_kapisi: 'Yangın kapısı' };

// ATL-21: kapı odanın kenarının içindedir; kapı yalnız odada olur.
export function kapiKenardaMi(a: AlanKaydi): boolean {
  if (a.kapi === null) return true;
  if (!ODA_TURLERI.includes(a.tur)) return false;
  const kenarBoyu = a.kapi.kenar === 'on' || a.kapi.kenar === 'arka' ? a.genislik : a.derinlik;
  return Math.abs(a.kapi.ofset) + a.kapi.genislik / 2 <= kenarBoyu / 2 + 1e-9;
}

// ---------- ATL-04..13, 18, 19, 21: yerleşim kaydının denetimi ----------

export interface IstasyonBilgisi {
  id: number;
  kod: string;
  aktif: boolean;
}

export interface DenetimBaglami {
  // Kayıttaki istasyonların istasyonlar modülündeki karşılığı; olmayan istasyon haritada yoktur.
  istasyonlar: ReadonlyMap<number, IstasyonBilgisi>;
  // Bu salonda zaten yeri olan istasyonlar: pasife alınmış istasyonun yeri kalır (ATL-17).
  yerlesikIstasyonlar: ReadonlySet<number>;
  // Başka salonda yeri olan istasyonlar (istasyon kimliği -> salon kodu): bir istasyonun tek yeri vardır (ATL-04).
  baskaSalondakiler: ReadonlyMap<number, string>;
  // Bu salonun kayıtlı rafları: raf silinmez (ATL-13).
  salonRaflari: readonly { id: number; kod: string }[];
  // Kayıtta geçen modeller (kimlik -> yüklemesi tamam mı); bulunmayan model haritada yoktur (ATL-24).
  modeller?: ReadonlyMap<number, boolean>;
  // Kayıttaki makinelerin istasyonlar modülündeki karşılığı, bu salonda zaten yeri olanlar ve başka salonda yeri
  // olanlar (makine kimliği -> salon kodu); ATL-37.
  makineler?: ReadonlyMap<number, MakineBilgisi>;
  yerlesikMakineler?: ReadonlySet<number>;
  baskaSalondakiMakineler?: ReadonlyMap<number, string>;
}

export interface MakineBilgisi {
  id: number;
  kod: string;
  aktif: boolean;
  istasyonId: number | null;
}

export interface DenetimSonucu {
  ihlaller: Bulgu[];
  uyarilar: Bulgu[];
}

interface Kati {
  anahtar: string;
  ad: string;
  tur: 'istasyon' | 'makine' | 'raf' | 'palet' | 'duvar';
  kutu: Kutu;
}

// ATL-37: makinesi yerleşik istasyon haritada çerçevedir, katı değildir; katı olan makinelerdir.
export function cerceveIstasyonlar(makineYerleri: readonly { makineId: number }[] | undefined, istasyonu: (makineId: number) => number | null): Set<number> {
  return new Set((makineYerleri ?? []).flatMap((y) => { const i = istasyonu(y.makineId); return i === null ? [] : [i]; }));
}

export function katiOgeler(
  k: Pick<YerlesimKaydi, 'istasyonYerleri' | 'makineYerleri' | 'raflar' | 'alanlar' | 'duvarlar'>,
  adlar: (id: number) => string,
  makine: (id: number) => { ad: string; istasyonId: number | null } = (id) => ({ ad: `Makine ${id}`, istasyonId: null }),
): Kati[] {
  const sonuc: Kati[] = [];
  const cerceve = cerceveIstasyonlar(k.makineYerleri, (id) => makine(id).istasyonId);
  for (const y of k.istasyonYerleri) {
    if (!cerceve.has(y.istasyonId)) sonuc.push({ anahtar: `istasyon:${y.istasyonId}`, ad: adlar(y.istasyonId), tur: 'istasyon', kutu: y });
  }
  for (const y of k.makineYerleri ?? []) sonuc.push({ anahtar: `makine:${y.makineId}`, ad: makine(y.makineId).ad, tur: 'makine', kutu: y });
  k.raflar.forEach((r, i) => sonuc.push({ anahtar: `raf:${i}`, ad: `Raf ${r.kod}`, tur: 'raf', kutu: rafKutusu(r) }));
  k.alanlar.forEach((a, i) => {
    if (a.tur === 'palet') sonuc.push({ anahtar: `alan:${i}`, ad: a.ad, tur: 'palet', kutu: a });
    if (ODA_TURLERI.includes(a.tur)) {
      for (const parca of odaDuvarlari(a)) sonuc.push({ anahtar: `alan:${i}`, ad: a.ad, tur: 'duvar', kutu: parca });
    }
  });
  k.duvarlar.forEach((d, i) => sonuc.push({ anahtar: `duvar:${i}`, ad: 'Duvar', tur: 'duvar', kutu: duvarKutusu(d) }));
  return sonuc;
}

export function yerlesimiDenetle(k: YerlesimKaydi, b: DenetimBaglami): DenetimSonucu {
  const ihlaller: Bulgu[] = [];
  const uyarilar: Bulgu[] = [];
  const ihlal = (kural: string, mesaj: string, ogeler: string[]) => ihlaller.push({ kural, mesaj, ogeler });
  const salon = k.salon;
  const istasyonAdi = (id: number) => b.istasyonlar.get(id)?.kod ?? `İstasyon ${id}`;

  // ATL-04: bir istasyonun tek yeri.
  const gorulen = new Set<number>();
  for (const y of k.istasyonYerleri) {
    if (gorulen.has(y.istasyonId)) ihlal('ATL-04', `${istasyonAdi(y.istasyonId)} iki kez yerleştirilmiş.`, [`istasyon:${y.istasyonId}`]);
    gorulen.add(y.istasyonId);
    const baskaSalon = b.baskaSalondakiler.get(y.istasyonId);
    if (baskaSalon !== undefined) {
      ihlal('ATL-04', `${istasyonAdi(y.istasyonId)} ${baskaSalon} salonunda yerleşik; önce oradan kaldırın.`, [`istasyon:${y.istasyonId}`]);
    }
    // ATL-24: istasyona yalnız yüklemesi tamamlanmış model atanır.
    if (y.modelId !== null) {
      const tamam = b.modeller?.get(y.modelId);
      if (tamam === undefined) ihlal('ATL-24', `${istasyonAdi(y.istasyonId)} için seçilen model bulunamadı.`, [`istasyon:${y.istasyonId}`]);
      else if (!tamam) ihlal('ATL-24', `${istasyonAdi(y.istasyonId)} için seçilen modelin yüklemesi tamamlanmamış.`, [`istasyon:${y.istasyonId}`]);
    }
    // ATL-05: yalnız var olan ve aktif istasyon yeni yerleştirilir; yerleşik pasif istasyonun yeri kalır.
    const bilgi = b.istasyonlar.get(y.istasyonId);
    if (!bilgi) ihlal('ATL-05', `İstasyon ${y.istasyonId} bulunamadı.`, [`istasyon:${y.istasyonId}`]);
    else if (!bilgi.aktif && !b.yerlesikIstasyonlar.has(y.istasyonId)) {
      ihlal('ATL-05', `${bilgi.kod} pasif; pasif istasyon yeni yerleştirilemez.`, [`istasyon:${y.istasyonId}`]);
    }
  }

  // ATL-37: bir makinenin tek yeri; var olan ve aktif makine yeni yerleştirilir (yerleşik pasif makinenin yeri kalır);
  // modeli tamamlanmış olmalı (ATL-24).
  const makineAdi = (id: number) => b.makineler?.get(id)?.kod ?? `Makine ${id}`;
  const gorulenMakine = new Set<number>();
  for (const y of k.makineYerleri ?? []) {
    const anahtar = `makine:${y.makineId}`;
    if (gorulenMakine.has(y.makineId)) ihlal('ATL-37', `${makineAdi(y.makineId)} iki kez yerleştirilmiş.`, [anahtar]);
    gorulenMakine.add(y.makineId);
    const baskaSalon = b.baskaSalondakiMakineler?.get(y.makineId);
    if (baskaSalon !== undefined) ihlal('ATL-37', `${makineAdi(y.makineId)} ${baskaSalon} salonunda yerleşik; önce oradan kaldırın.`, [anahtar]);
    if (y.modelId !== null) {
      const tamam = b.modeller?.get(y.modelId);
      if (tamam === undefined) ihlal('ATL-24', `${makineAdi(y.makineId)} için seçilen model bulunamadı.`, [anahtar]);
      else if (!tamam) ihlal('ATL-24', `${makineAdi(y.makineId)} için seçilen modelin yüklemesi tamamlanmamış.`, [anahtar]);
    }
    const bilgi = b.makineler?.get(y.makineId);
    if (!bilgi) ihlal('ATL-37', `Makine ${y.makineId} bulunamadı.`, [anahtar]);
    else if (!bilgi.aktif && !b.yerlesikMakineler?.has(y.makineId)) {
      ihlal('ATL-37', `${bilgi.kod} pasif; pasif makine yeni yerleştirilemez.`, [anahtar]);
    }
  }

  // ATL-09: raf kodu kayıt içinde de tektir (veritabanı bütün salonlarda korur).
  const kodlar = new Map<string, number>();
  k.raflar.forEach((r, i) => {
    const onceki = kodlar.get(r.kod);
    if (onceki !== undefined) ihlal('ATL-09', `Raf kodu ${r.kod} iki kez kullanılmış.`, [`raf:${onceki}`, `raf:${i}`]);
    kodlar.set(r.kod, i);
  });

  // ATL-33: rafın net ölçüleri rafın kendisine sığar.
  k.raflar.forEach((r, i) => {
    for (const m of rafNetOlcuIhlalleri(r)) ihlal('ATL-33', `Raf ${r.kod}: ${m}`, [`raf:${i}`]);
  });

  // ATL-13: raf silinmez; bu salonun her rafı kayıtta olmalıdır, başka salonun rafı buraya gelmez.
  const gelenIdler = new Set(k.raflar.flatMap((r) => (r.id === null ? [] : [r.id])));
  const salonIdleri = new Set(b.salonRaflari.map((r) => r.id));
  for (const r of b.salonRaflari) {
    if (!gelenIdler.has(r.id)) ihlal('ATL-13', `Raf ${r.kod} silinemez; pasife alın.`, []);
  }
  k.raflar.forEach((r, i) => {
    if (r.id !== null && !salonIdleri.has(r.id)) ihlal('ATL-13', `Raf ${r.kod} bu salonda kayıtlı değil.`, [`raf:${i}`]);
  });

  // ATL-21: kapı odada ve kenarın içinde.
  k.alanlar.forEach((a, i) => {
    if (!kapiKenardaMi(a)) ihlal('ATL-21', `${a.ad}: kapı yalnız odada olur ve kenarın içinde kalır.`, [`alan:${i}`]);
  });

  // ATL-06: her öğe salonun içinde.
  const disarida = (kutu: Kutu) => !salondaMi(kutu, salon);
  for (const y of k.istasyonYerleri) {
    if (disarida(y)) ihlal('ATL-06', `${istasyonAdi(y.istasyonId)} salonun dışına taşıyor.`, [`istasyon:${y.istasyonId}`]);
  }
  for (const y of k.makineYerleri ?? []) {
    if (disarida(y)) ihlal('ATL-06', `${makineAdi(y.makineId)} salonun dışına taşıyor.`, [`makine:${y.makineId}`]);
  }
  k.raflar.forEach((r, i) => { if (disarida(rafKutusu(r))) ihlal('ATL-06', `Raf ${r.kod} salonun dışına taşıyor.`, [`raf:${i}`]); });
  k.alanlar.forEach((a, i) => { if (disarida(a)) ihlal('ATL-06', `${a.ad} salonun dışına taşıyor.`, [`alan:${i}`]); });
  k.duvarlar.forEach((d, i) => {
    const uclar: Nokta[] = [[d.basX, d.basZ], [d.sonX, d.sonZ]];
    if (uclar.some(([x, z]) => x < -CAKISMA_PAYI || z < -CAKISMA_PAYI || x > salon.genislik + CAKISMA_PAYI || z > salon.derinlik + CAKISMA_PAYI)) {
      ihlal('ATL-06', 'Duvar salonun dışına taşıyor.', [`duvar:${i}`]);
    }
    if (d.basX === d.sonX && d.basZ === d.sonZ) ihlal('ATL-22', 'Duvarın uzunluğu sıfır olamaz.', [`duvar:${i}`]);
  });

  // ATL-07: katı öğeler iç içe geçmez. Duvar ile duvar (oda duvarı dahil) karşılaştırılmaz: köşede birleşirler.
  const katilar = katiOgeler(k, istasyonAdi, (id) => ({ ad: makineAdi(id), istasyonId: b.makineler?.get(id)?.istasyonId ?? null }));
  // Sınır kutuları önce karşılaştırılır: dönmüş kutu sınaması yalnız yakın çiftlerde yapılır.
  const sinirlar = katilar.map((o) => {
    const kose = koseler(o.kutu);
    return [Math.min(...kose.map((p) => p[0])), Math.max(...kose.map((p) => p[0])), Math.min(...kose.map((p) => p[1])), Math.max(...kose.map((p) => p[1]))] as const;
  });
  const bildirilen = new Set<string>();
  for (let i = 0; i < katilar.length; i++) {
    for (let j = i + 1; j < katilar.length; j++) {
      const a = katilar[i];
      const c = katilar[j];
      const sa = sinirlar[i];
      const sc = sinirlar[j];
      if (!a || !c || !sa || !sc || a.anahtar === c.anahtar) continue;
      if (a.tur === 'duvar' && c.tur === 'duvar') continue;
      if (sa[1] <= sc[0] || sc[1] <= sa[0] || sa[3] <= sc[2] || sc[3] <= sa[2]) continue;
      const cift = [a.anahtar, c.anahtar].sort().join('|');
      if (bildirilen.has(cift) || !cakisirMi(a.kutu, c.kutu)) continue;
      bildirilen.add(cift);
      ihlal('ATL-07', `${a.ad} ile ${c.ad} çakışıyor.`, [a.anahtar, c.anahtar]);
    }
  }

  // ATL-18: giriş salonun içinde; katı öğenin üstündeyse uyarı.
  if (salon.giris !== null) {
    const { x, z } = salon.giris;
    if (x < 0 || z < 0 || x > salon.genislik || z > salon.derinlik) ihlal('ATL-18', 'Giriş noktası salonun dışında.', ['giris']);
    else if (katilar.some((s) => noktaKutudaMi(x, z, s.kutu, 0.2))) {
      uyarilar.push({ kural: 'ATL-18', mesaj: 'Giriş noktası bir öğenin üstünde.', ogeler: ['giris'] });
    }
  }

  ihlaller.push(...gecisIhlalleri(k.gecisler ?? [], salon));

  // ATL-19: yürüyüş yolunu kapatan katı öğe uyarıdır, kaydı engellemez.
  const yollar = k.alanlar.map((a, i) => ({ a, i })).filter(({ a }) => a.tur === 'yuruyus_yolu');
  for (const s of katilar) {
    if (s.tur === 'duvar') continue;
    for (const { a, i } of yollar) {
      if (cakisirMi(s.kutu, a, 0.1)) uyarilar.push({ kural: 'ATL-19', mesaj: `${s.ad} yürüyüş yolunu kapatıyor.`, ogeler: [s.anahtar, `alan:${i}`] });
    }
  }

  return { ihlaller, uyarilar };
}

// ATL-16: düzenleyicinin açtığı sürüm güncel değilse kayıt reddedilir.
export const surumGuncelMi = (gelen: number, kayitli: number): boolean => gelen === kayitli;

// ---------- ATL-33: rafın net ölçüleri ----------

// Kat sayısı kadar kat yüksekliği; katlar rafın içinde (palet ve konsolda en üst kat rafın üstüne açıktır, küçük
// parça rafında üst raf tavandır); gözler bölmeye (konsolda kol boyuna) sığar. Toleranslar santimetre yuvarlaması için.
export function rafNetOlcuIhlalleri(r: Pick<RafKaydi, 'tur' | 'katSayisi' | 'gozSayisi' | 'bolmeGenisligi' | 'derinlik' | 'yukseklik' | 'katYukseklikleri' | 'gozGenisligi' | 'gozDerinligi'>): string[] {
  const l: string[] = [];
  const pay = 0.005;
  const katlar = r.katYukseklikleri;
  if (katlar !== null) {
    if (katlar.length !== r.katSayisi) l.push(`${r.katSayisi} katın her biri için net yükseklik girilmeli (${katlar.length} girildi).`);
    else if (r.tur !== 'zemin') {
      const kapali = r.tur === 'kucuk_parca' ? katlar : katlar.slice(0, -1);
      const toplam = kapali.reduce((a, b) => a + b, 0);
      if (toplam > r.yukseklik + pay) l.push(`kat yükseklikleri toplamı ${toplam.toFixed(2)} m, raf yüksekliği ${r.yukseklik.toFixed(2)} m.`);
    }
  }
  const g = r.gozGenisligi;
  const d = r.gozDerinligi;
  if (r.tur === 'konsol') {
    if (g !== null && g > r.bolmeGenisligi + pay) l.push(`göz genişliği ${g.toFixed(2)} m, kol aralığından (${r.bolmeGenisligi.toFixed(2)} m) büyük.`);
    if (d !== null && d * r.gozSayisi > r.derinlik + pay) l.push(`${r.gozSayisi} göz x ${d.toFixed(2)} m kol boyunu (${r.derinlik.toFixed(2)} m) aşıyor.`);
  } else {
    if (g !== null && g * r.gozSayisi > r.bolmeGenisligi + pay) l.push(`${r.gozSayisi} göz x ${g.toFixed(2)} m bölme genişliğini (${r.bolmeGenisligi.toFixed(2)} m) aşıyor.`);
    // Palet rafta yük kirişten taşabilir (palet derinliği); 30 cm'ye kadar kabul.
    const sinir = r.derinlik + (r.tur === 'palet' ? 0.3 : 0);
    if (d !== null && d > sinir + pay) l.push(`göz derinliği ${d.toFixed(2)} m, raf derinliğinden (${r.derinlik.toFixed(2)} m) büyük.`);
  }
  return l;
}

// ---------- ATL-11: göz adresi ----------

export const gozAdresi = (rafKodu: string, bolme: number, kat: number, goz: number): string =>
  `${rafKodu}-${String(bolme).padStart(2, '0')}-${kat}-${goz}`;

export interface AdresParcasi {
  rafKodu: string;
  bolme: number | null;
  kat: number | null;
  goz: number | null;
}

// "R1-02-3-1", "r1-2-3", "R1-02" adres sayılır; yalnız raf kodu ("R1") adres değildir, raf aramasıdır.
export function adresCoz(metin: string): AdresParcasi | null {
  const m = /^([A-Z][A-Z0-9]{0,4})-(\d{1,2})(?:-(\d{1,2})(?:-(\d))?)?$/.exec(aramaBuyut(metin.trim()));
  if (!m || m[1] === undefined || m[2] === undefined) return null;
  const sayi = (s: string | undefined) => (s === undefined ? null : Number(s));
  return { rafKodu: m[1], bolme: Number(m[2]), kat: sayi(m[3]), goz: sayi(m[4]) };
}

// ---------- ATL-14, 15: arama ----------

const KATLAMA: Record<string, string> = { ı: 'i', İ: 'i', i: 'i', I: 'i', ş: 's', Ş: 's', ğ: 'g', Ğ: 'g', ü: 'u', Ü: 'u', ö: 'o', Ö: 'o', ç: 'c', Ç: 'c' };

// Türkçe harf, aksan ve büyük/küçük harf ayrımı kalkar: "ŞAFT" ile "saft" eşleşir.
export function aramaKatla(metin: string): string {
  return [...metin].map((h) => KATLAMA[h] ?? h).join('').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

const aramaBuyut = (metin: string): string => aramaKatla(metin).toUpperCase();

export interface AramaAdayi {
  tur: AramaTuru;
  kimlik: number;
  etiket: string;
  ayrinti: string;
  // Eşleşmenin bakıldığı metinler (kod, ad, adres).
  anahtarlar: readonly string[];
  aktif: boolean;
}

// 0: tam eşleşme, 1: başlangıç, 2: içerme; eşleşmeyen null.
export function eslesmeDerecesi(sorgu: string, anahtarlar: readonly string[]): number | null {
  const s = aramaKatla(sorgu);
  if (s === '') return null;
  let enIyi: number | null = null;
  for (const a of anahtarlar) {
    const k = aramaKatla(a);
    const derece = k === s ? 0 : k.startsWith(s) ? 1 : k.includes(s) ? 2 : null;
    if (derece !== null && (enIyi === null || derece < enIyi)) enIyi = derece;
  }
  return enIyi;
}

const TUR_SIRASI: Record<AramaTuru, number> = { goz: 0, istasyon: 1, raf: 2, alan: 3 };

// Pasif öğe (raf, istasyon) aramada çıkmaz (ATL-13, ATL-17). Tam adres ilk sıradadır; sonra tam eşleşme,
// başlangıç, içerme; eşitlikte tür ve etiket. En çok 20 sonuç.
export function aramaSirala<T extends AramaAdayi>(sorgu: string, adaylar: readonly T[], azami = ARAMA_AZAMI_SONUC): T[] {
  const tamAdres = adresCoz(sorgu);
  const tamAdresMetni = tamAdres && tamAdres.kat !== null && tamAdres.goz !== null
    ? gozAdresi(tamAdres.rafKodu, tamAdres.bolme ?? 0, tamAdres.kat, tamAdres.goz)
    : null;
  return adaylar
    .filter((a) => a.aktif)
    .flatMap((a) => {
      const derece = a.tur === 'goz' && a.etiket === tamAdresMetni ? -1 : eslesmeDerecesi(sorgu, a.anahtarlar);
      return derece === null ? [] : [{ a, derece }];
    })
    .sort((p, q) => p.derece - q.derece || TUR_SIRASI[p.a.tur] - TUR_SIRASI[q.a.tur] || p.a.etiket.localeCompare(q.a.etiket, 'tr'))
    .slice(0, azami)
    .map((x) => x.a);
}

// ---------- ATL-20: rota ----------

export interface RotaGirdisi {
  salon: { genislik: number; derinlik: number };
  engeller: readonly Kutu[];
  yollar: readonly Kutu[];
  bas: { x: number; z: number };
  hedef: { x: number; z: number };
}

export interface Rota {
  noktalar: { x: number; z: number }[];
  uzunluk: number;
}

interface Izgara {
  sutun: number;
  satir: number;
  adim: number;
  serbest: Uint8Array;
  yolda: Uint8Array;
}

// Izgara hücre sayısının üst sınırı: büyük salonda adım büyür, hesap süresi salon boyundan bağımsız kalır.
export const AZAMI_ROTA_HUCRESI = 160_000;

export function rotaAdimi(salon: { genislik: number; derinlik: number }): number {
  return Math.max(ROTA_IZGARASI, Math.sqrt((salon.genislik * salon.derinlik) / AZAMI_ROTA_HUCRESI));
}

// Her öğe yalnız kendi sınır kutusundaki hücrelere işlenir (hücre başına bütün öğeler taranmaz).
function izgaraKur(g: RotaGirdisi): Izgara {
  const adim = rotaAdimi(g.salon);
  const sutun = Math.max(1, Math.floor(g.salon.genislik / adim));
  const satir = Math.max(1, Math.floor(g.salon.derinlik / adim));
  const serbest = new Uint8Array(sutun * satir).fill(1);
  const yolda = new Uint8Array(sutun * satir);
  const isle = (k: Kutu, pay: number, hedef: Uint8Array, deger: number) => {
    const kose = koseler(k);
    const xs = kose.map(([x]) => x);
    const zs = kose.map(([, z]) => z);
    const i0 = Math.max(0, Math.floor((Math.min(...xs) - pay) / adim));
    const i1 = Math.min(sutun - 1, Math.floor((Math.max(...xs) + pay) / adim));
    const j0 = Math.max(0, Math.floor((Math.min(...zs) - pay) / adim));
    const j1 = Math.min(satir - 1, Math.floor((Math.max(...zs) + pay) / adim));
    for (let j = j0; j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        if (noktaKutudaMi((i + 0.5) * adim, (j + 0.5) * adim, k, pay)) hedef[j * sutun + i] = deger;
      }
    }
  };
  for (const e of g.engeller) isle(e, GOVDE_YARICAPI, serbest, 0);
  for (const y of g.yollar) isle(y, 0, yolda, 1);
  return { sutun, satir, adim, serbest, yolda };
}

const hucre = (iz: Izgara, x: number, z: number): [number, number] => [
  Math.min(iz.sutun - 1, Math.max(0, Math.floor(x / iz.adim))),
  Math.min(iz.satir - 1, Math.max(0, Math.floor(z / iz.adim))),
];

// Engelin içindeki nokta en yakın serbest hücreye taşınır (halka halka aranır). Hedef için yalnız başlangıçtan
// ulaşılabilen hücreler sayılır: rafın arkasındaki kapalı cep seçilip yol "yok" çıkmasın.
function serbestYakin(iz: Izgara, i0: number, j0: number, uygun?: Uint8Array): number | null {
  const enCok = Math.max(iz.sutun, iz.satir);
  for (let r = 0; r <= enCok; r++) {
    let enIyi: number | null = null;
    let enIyiUzaklik = Infinity;
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
        const i = i0 + di;
        const j = j0 + dj;
        const k = j * iz.sutun + i;
        if (i < 0 || j < 0 || i >= iz.sutun || j >= iz.satir || !iz.serbest[k] || (uygun && !uygun[k])) continue;
        const u = di * di + dj * dj;
        if (u < enIyiUzaklik) { enIyiUzaklik = u; enIyi = k; }
      }
    }
    if (enIyi !== null) return enIyi;
  }
  return null;
}

// Başlangıçtan sekiz yönde ulaşılan serbest hücreler (A* ile aynı komşuluk; köşeden kesme yok).
function ulasilanlar(iz: Izgara, bas: number): Uint8Array {
  const gorulen = new Uint8Array(iz.sutun * iz.satir);
  const kuyruk = new Int32Array(iz.sutun * iz.satir);
  let bas_ = 0;
  let son = 0;
  kuyruk[son++] = bas;
  gorulen[bas] = 1;
  while (bas_ < son) {
    const k = kuyruk[bas_++] ?? 0;
    const ki = k % iz.sutun;
    const kj = Math.floor(k / iz.sutun);
    for (let dj = -1; dj <= 1; dj++) {
      for (let di = -1; di <= 1; di++) {
        if (di === 0 && dj === 0) continue;
        const i = ki + di;
        const j = kj + dj;
        if (i < 0 || j < 0 || i >= iz.sutun || j >= iz.satir) continue;
        const y = j * iz.sutun + i;
        if (gorulen[y] || !iz.serbest[y]) continue;
        if (di !== 0 && dj !== 0 && (!iz.serbest[kj * iz.sutun + i] || !iz.serbest[j * iz.sutun + ki])) continue;
        gorulen[y] = 1;
        kuyruk[son++] = y;
      }
    }
  }
  return gorulen;
}

// Düzleştirme kısayolu: çizgi engele değmez; atlanan kısım yürüyüş yolundan geçiyorsa kısayol da yoldan çıkmaz
// (yoksa düzleştirme yolu yeğleme kuralını bozar).
function goruyorMu(iz: Izgara, a: number, b: number, yolda: boolean): boolean {
  const ax = (a % iz.sutun) + 0.5;
  const az = Math.floor(a / iz.sutun) + 0.5;
  const bx = (b % iz.sutun) + 0.5;
  const bz = Math.floor(b / iz.sutun) + 0.5;
  const adim = Math.ceil(Math.hypot(bx - ax, bz - az) * 3);
  for (let t = 1; t < adim; t++) {
    const k = Math.floor(az + ((bz - az) * t) / adim) * iz.sutun + Math.floor(ax + ((bx - ax) * t) / adim);
    if (!iz.serbest[k]) return false;
    if (yolda && k !== a && k !== b && !iz.yolda[k]) return false;
  }
  return true;
}

// Izgarada A*: sekiz yön, köşeden kesme yok; yürüyüş yolu dışı adım pahalı. Sonra görüş hattıyla düzleştirilir.
// Hedef kapalı bir yerdeyse rota ulaşılabilen en yakın noktada biter; salonda hiç serbest yer yoksa null.
export function rotaBul(g: RotaGirdisi): Rota | null {
  const iz = izgaraKur(g);
  const [bi, bj] = hucre(iz, g.bas.x, g.bas.z);
  const [hi, hj] = hucre(iz, g.hedef.x, g.hedef.z);
  const bas = serbestYakin(iz, bi, bj);
  if (bas === null) return null;
  const hedef = serbestYakin(iz, hi, hj, ulasilanlar(iz, bas));
  if (hedef === null) return null;

  const n = iz.sutun * iz.satir;
  const gMaliyet = new Float64Array(n).fill(Infinity);
  const onceki = new Int32Array(n).fill(-1);
  const kapali = new Uint8Array(n);
  const hx = hedef % iz.sutun;
  const hz = Math.floor(hedef / iz.sutun);
  const tahmin = (k: number) => Math.hypot((k % iz.sutun) - hx, Math.floor(k / iz.sutun) - hz);
  const yigin: [number, number][] = [];
  const it = (k: number, f: number) => {
    yigin.push([f, k]);
    let c = yigin.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      const pc = yigin[p];
      const cc = yigin[c];
      if (!pc || !cc || pc[0] <= cc[0]) break;
      yigin[p] = cc;
      yigin[c] = pc;
      c = p;
    }
  };
  const al = (): number | null => {
    const ilk = yigin[0];
    const son = yigin.pop();
    if (ilk === undefined || son === undefined) return null;
    if (yigin.length > 0) {
      yigin[0] = son;
      let c = 0;
      for (;;) {
        const l = 2 * c + 1;
        const r = l + 1;
        let m = c;
        const mv = yigin[m];
        const lv = yigin[l];
        const rv = yigin[r];
        if (lv && mv && lv[0] < mv[0]) m = l;
        const mv2 = yigin[m];
        if (rv && mv2 && rv[0] < mv2[0]) m = r;
        if (m === c) break;
        const a = yigin[m];
        const b = yigin[c];
        if (!a || !b) break;
        yigin[m] = b;
        yigin[c] = a;
        c = m;
      }
    }
    return ilk[1];
  };

  gMaliyet[bas] = 0;
  it(bas, tahmin(bas));
  const YONLER: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  for (;;) {
    const k = al();
    if (k === null) return null;
    if (k === hedef) break;
    if (kapali[k]) continue;
    kapali[k] = 1;
    const ki = k % iz.sutun;
    const kj = Math.floor(k / iz.sutun);
    for (const [di, dj] of YONLER) {
      const i = ki + di;
      const j = kj + dj;
      if (i < 0 || j < 0 || i >= iz.sutun || j >= iz.satir) continue;
      const y = j * iz.sutun + i;
      if (!iz.serbest[y] || kapali[y]) continue;
      if (di !== 0 && dj !== 0 && (!iz.serbest[kj * iz.sutun + i] || !iz.serbest[j * iz.sutun + ki])) continue;
      const adim = (di !== 0 && dj !== 0 ? Math.SQRT2 : 1) * (iz.yolda[y] ? 1 : YOL_DISI_MALIYETI);
      const yeni = (gMaliyet[k] ?? Infinity) + adim;
      if (yeni < (gMaliyet[y] ?? Infinity)) {
        gMaliyet[y] = yeni;
        onceki[y] = k;
        it(y, yeni + tahmin(y));
      }
    }
  }

  const zincir: number[] = [];
  for (let k = hedef; k !== -1; k = onceki[k] ?? -1) zincir.unshift(k);
  const duz: number[] = [];
  let i = 0;
  const icindeYolVar = (p: number, q: number) => zincir.slice(p + 1, q).some((k) => iz.yolda[k] === 1);
  while (i < zincir.length) {
    const a = zincir[i] ?? 0;
    duz.push(a);
    let j = zincir.length - 1;
    while (j > i + 1 && !goruyorMu(iz, a, zincir[j] ?? a, icindeYolVar(i, j))) j--;
    i = j > i ? j : i + 1;
  }
  const noktalar = duz.map((k) => ({ x: yuvarla(((k % iz.sutun) + 0.5) * iz.adim), z: yuvarla((Math.floor(k / iz.sutun) + 0.5) * iz.adim) }));
  let uzunluk = 0;
  for (let t = 1; t < noktalar.length; t++) {
    const p = noktalar[t - 1];
    const q = noktalar[t];
    if (p && q) uzunluk += Math.hypot(q.x - p.x, q.z - p.z);
  }
  return { noktalar, uzunluk: yuvarla(uzunluk, 1) };
}

// ---------- ATL-25, 26: model dosyası ----------

// Dosya MODEL_PARCA_BAYT'lık parçalarla gelir; son parça kalan kadardır.
export const modelParcaSayisi = (boyut: number): number => Math.ceil(boyut / MODEL_PARCA_BAYT);

export function beklenenParcaBoyu(boyut: number, sira: number): number | null {
  const n = modelParcaSayisi(boyut);
  if (!Number.isInteger(sira) || sira < 0 || sira >= n) return null;
  return sira < n - 1 ? MODEL_PARCA_BAYT : boyut - (n - 1) * MODEL_PARCA_BAYT;
}

// GLB 2.0 başlığı: 'glTF' imzası, sürüm 2, başlıktaki toplam uzunluk dosyanın boyu.
export function glbBasligiGecerliMi(bas: Uint8Array, boyut: number): boolean {
  if (bas.length < 12) return false;
  const oku = (i: number) => (bas[i] ?? 0) + (bas[i + 1] ?? 0) * 256 + (bas[i + 2] ?? 0) * 65536 + (bas[i + 3] ?? 0) * 16777216;
  return bas[0] === 0x67 && bas[1] === 0x6c && bas[2] === 0x54 && bas[3] === 0x46 && oku(4) === 2 && oku(8) === boyut;
}

// Base64 metin bayta çevrilince yeniden kodlanmış hali aynı olmalı (yanlış dolgu, kırpık metin reddedilir).
export function base64Coz(metin: string): Uint8Array | null {
  const b = Buffer.from(metin, 'base64');
  return b.toString('base64') === metin ? new Uint8Array(b) : null;
}

// ---------- ATL-29: göz ataması ----------

// Gözün toplam doluluğu %100'ü aşmaz; aynı kalemin eski satırı yenisiyle değişir (sayılmaz).
export function gozDolulukIhlali(mevcut: readonly { kodAnahtari: string; doluluk: number }[], yeni: { kodAnahtari: string; doluluk: number }): string | null {
  const diger = mevcut.filter((k) => k.kodAnahtari !== yeni.kodAnahtari).reduce((t, k) => t + k.doluluk, 0);
  if (diger + yeni.doluluk <= 100) return null;
  return `Gözde yer yok: diğer kalemler %${diger} dolduruyor, en çok %${Math.max(0, 100 - diger)} eklenebilir.`;
}

// ---------- ATL-30: kroki ----------

// PDF dosyası "%PDF-" imzasıyla başlar.
export function pdfBasligiGecerliMi(bas: Uint8Array): boolean {
  return bas.length >= 5 && bas[0] === 0x25 && bas[1] === 0x50 && bas[2] === 0x44 && bas[3] === 0x46 && bas[4] === 0x2d;
}

// Hizalama saklanan duyarlığa yuvarlanır: ölçek 10 hane, dönüş 0,01 derece [0, 360), konum milimetre.
export function krokiHizalamaYuvarla(h: { olcek: number; donus: number; x: number; z: number }): { olcek: number; donus: number; x: number; z: number } {
  const d = yuvarla(((h.donus % 360) + 360) % 360, 2);
  return { olcek: yuvarla(h.olcek, 10), donus: d >= 360 ? 0 : d, x: yuvarla(h.x, 3), z: yuvarla(h.z, 3) };
}

// ---------- ATL-31, ATL-32: fabrika (bölümler tek planda) ----------

export interface FabrikaKonumu {
  x: number;
  z: number;
  donus: number;
}

// Bölüm noktası -> fabrika noktası: bölümün sol üst köşesi çevresinde dönüş, sonra öteleme.
export function fabrikaNoktasi(k: FabrikaKonumu, p: { x: number; z: number }): { x: number; z: number } {
  const a = (k.donus * Math.PI) / 180;
  return { x: k.x + p.x * Math.cos(a) - p.z * Math.sin(a), z: k.z + p.x * Math.sin(a) + p.z * Math.cos(a) };
}

// Bölümün fabrika planındaki kutusu (orta nokta ve dönüş): çakışma denetimi için.
export function bolumKutusu(o: { genislik: number; derinlik: number }, k: FabrikaKonumu): Kutu {
  const orta = fabrikaNoktasi(k, { x: o.genislik / 2, z: o.derinlik / 2 });
  return { x: orta.x, z: orta.z, donus: k.donus, genislik: o.genislik, derinlik: o.derinlik };
}

export function fabrikaKonumuYuvarla(k: FabrikaKonumu): FabrikaKonumu {
  return { x: yuvarla(k.x), z: yuvarla(k.z), donus: donusIndirge(k.donus) };
}

export interface FabrikaBolumu {
  salonId: number;
  kod: string;
  olcu: { genislik: number; derinlik: number };
  konum: FabrikaKonumu;
}

// ATL-31: kayıttaki bölümler birbiriyle ve kayıt dışındaki bölümlerle üst üste binmez (kenar değebilir).
export function bolumCakismalari(bolumler: readonly FabrikaBolumu[], diger: readonly FabrikaBolumu[]): Bulgu[] {
  const ihlaller: Bulgu[] = [];
  const tumu = [...bolumler, ...diger];
  for (let i = 0; i < bolumler.length; i++) {
    const a = bolumler[i];
    if (!a) continue;
    for (let j = i + 1; j < tumu.length; j++) {
      const c = tumu[j];
      if (!c || c.salonId === a.salonId) continue;
      if (cakisirMi(bolumKutusu(a.olcu, a.konum), bolumKutusu(c.olcu, c.konum))) {
        ihlaller.push({ kural: 'ATL-31', mesaj: `${a.kod} ve ${c.kod} bölümleri fabrika planında üst üste biniyor.`, ogeler: [`bolum:${a.salonId}`, `bolum:${c.salonId}`] });
      }
    }
  }
  return ihlaller;
}

export interface FabrikaBaglami {
  // Kayıttaki bölümlerin kayıtlı rafları (raf kimliği -> bölüm kimliği ve kod): raf silinmez, yalnız bölüm değiştirir.
  kayittakiRaflar: ReadonlyMap<number, { salonId: number; kod: string }>;
  // Kayıtta olmayan bölümlerde kullanılan raf kodları ve yerleşik istasyonlar (istasyon -> bölüm kodu).
  disaridakiRafKodlari: ReadonlySet<string>;
  disaridakiIstasyonlar: ReadonlyMap<number, string>;
  // Kayıtta olmayan bölümlerde yerleşik makineler (makine -> bölüm kodu); ATL-37.
  disaridakiMakineler?: ReadonlyMap<number, string>;
  // Kayıtta olmayan bölümler (çakışma denetimi için kayıtlı yerleriyle).
  digerBolumler: readonly FabrikaBolumu[];
}

// Fabrika kaydının bölümler arası kuralları (bölüm içi kurallar her bölümde ayrıca denetlenir):
// ATL-31 bölümler fabrika planında üst üste binmez (kenar değebilir);
// ATL-32 bir istasyon ve bir raf kayıtta tek bölümdedir; kayıttaki bölümlerin her rafı bir bölümde kalır; raf kodu
// fabrikada tektir; kayıt dışındaki bölümde yerleşik istasyon buraya gelmez.
export function fabrikaDenetle(
  bolumler: readonly (FabrikaBolumu & { istasyonlar: readonly number[]; makineler?: readonly number[]; raflar: readonly { id: number | null; kod: string }[] })[],
  b: FabrikaBaglami,
): Bulgu[] {
  const ihlaller: Bulgu[] = bolumCakismalari(bolumler, b.digerBolumler);
  const ihlal = (kural: string, mesaj: string, ogeler: string[]) => ihlaller.push({ kural, mesaj, ogeler });
  const istasyonBolumu = new Map<number, number>();
  const makineBolumu = new Map<number, number>();
  const rafBolumu = new Map<number, number>();
  const kodlar = new Map<string, number>();
  for (const bl of bolumler) {
    for (const id of bl.istasyonlar) {
      const once = istasyonBolumu.get(id);
      if (once !== undefined && once !== bl.salonId) ihlal('ATL-32', `İstasyon ${id} iki bölüme birden yerleştirilmiş.`, [`salon:${bl.salonId}/istasyon:${id}`]);
      istasyonBolumu.set(id, bl.salonId);
      const disari = b.disaridakiIstasyonlar.get(id);
      if (disari) ihlal('ATL-32', `İstasyon ${id} ${disari} bölümünde yerleşik; önce oradan kaldırın.`, [`salon:${bl.salonId}/istasyon:${id}`]);
    }
    for (const id of bl.makineler ?? []) {
      const once = makineBolumu.get(id);
      if (once !== undefined && once !== bl.salonId) ihlal('ATL-37', `Makine ${id} iki bölüme birden yerleştirilmiş.`, [`salon:${bl.salonId}/makine:${id}`]);
      makineBolumu.set(id, bl.salonId);
      const disari = b.disaridakiMakineler?.get(id);
      if (disari) ihlal('ATL-37', `Makine ${id} ${disari} bölümünde yerleşik; önce oradan kaldırın.`, [`salon:${bl.salonId}/makine:${id}`]);
    }
    bl.raflar.forEach((r, i) => {
      const anahtar = `salon:${bl.salonId}/raf:${i}`;
      if (r.id !== null) {
        if (rafBolumu.has(r.id)) ihlal('ATL-32', `Raf ${r.kod} iki bölümde birden.`, [anahtar]);
        rafBolumu.set(r.id, bl.salonId);
        if (!b.kayittakiRaflar.has(r.id)) ihlal('ATL-32', `Raf ${r.kod} kayıttaki bölümlerin hiçbirinde kayıtlı değil.`, [anahtar]);
      }
      const k = kodlar.get(r.kod);
      if (k !== undefined && k !== bl.salonId) ihlal('ATL-09', `Raf kodu ${r.kod} iki bölümde kullanılıyor.`, [anahtar]);
      kodlar.set(r.kod, bl.salonId);
      if (b.disaridakiRafKodlari.has(r.kod)) ihlal('ATL-09', `Raf kodu ${r.kod} başka bölümde kullanılıyor.`, [anahtar]);
    });
  }
  for (const [id, r] of b.kayittakiRaflar) {
    if (!rafBolumu.has(id)) ihlal('ATL-13', `Raf ${r.kod} silinemez; pasife alın.`, [`bolum:${r.salonId}`]);
  }
  return ihlaller;
}
