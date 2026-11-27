import { GECIS_ESIKLERI } from '#paylasilan/sozlesme/tezgah-deneme-sabitleri.ts';
import type { DenemePenceresi, GecisOlcutu, ProgramEslesmesi } from '#paylasilan/sozlesme/tezgah-deneme-sabitleri.ts';
import { tesisGunBasi, tesisGunu } from '#paylasilan/zaman.ts';
import { adAnahtari, uretimArtisiMi } from './kurallar.ts';

// Tezgâh deneme sayfasının saf hesapları (kart 3811, 3811-2). Zamanlar milisaniye; veri yoksa null, sıfır uydurulmaz. Hiçbiri yazmaz.

export interface Aralik { bas: number; bit: number }

const GUN_MS = 86_400_000;
export function pencereAraligi(ad: DenemePenceresi, simdi: number): Aralik {
  const bugun = tesisGunBasi(tesisGunu(simdi));
  if (ad === 'dun') return { bas: tesisGunBasi(tesisGunu(bugun - GUN_MS / 2)), bit: bugun };
  if (ad === 'yedi-gun') return { bas: tesisGunBasi(tesisGunu(bugun - 6 * GUN_MS + GUN_MS / 2)), bit: simdi };
  return { bas: bugun, bit: simdi };
}

export const kesisim = (a: Aralik, b: Aralik): Aralik | null => {
  const bas = Math.max(a.bas, b.bas), bit = Math.min(a.bit, b.bit);
  return bit > bas ? { bas, bit } : null;
};
export const sure = (a: readonly Aralik[]): number => a.reduce((t, x) => t + (x.bit - x.bas), 0);
// Aralıkların (sıralı, örtüşmez) bir aralıkla kesişimi.
export const kes = (liste: readonly Aralik[], a: Aralik): Aralik[] => liste.flatMap((x) => kesisim(x, a) ?? []);
export const icinde = (an: number, liste: readonly Aralik[]): boolean => liste.some((x) => an >= x.bas && an < x.bit);

/* ---------------- sayaç artışları ---------------- */
export interface SayacDegisimi { zaman: number; onceki: number | null; deger: number; program: string | null; kip: string | null; dryrun: boolean | null; singleblock: boolean | null }
export interface Artis { zaman: number; adet: number; uretim: boolean; program: string | null; geriGitti: boolean }

// Taban satırı (onceki null) artış değildir; geri gidişte taban yenilenir, artış sayılmaz.
export function artislar(satirlar: readonly SayacDegisimi[]): Artis[] {
  return satirlar.flatMap((s) => {
    if (s.onceki === null) return [];
    const geri = s.deger < s.onceki;
    return [{ zaman: s.zaman, adet: geri ? 0 : s.deger - s.onceki, uretim: uretimArtisiMi(s), program: s.program, geriGitti: geri }];
  });
}

/* ---------------- program eşleşmesi ---------------- */
// Program yolunun dosya adı (son ayraçtan sonrası).
export const dosyaAdi = (yol: string): string => yol.split(/[\\/]/).pop() ?? yol;

// 3811-2: adımın NC program alanı doluysa program onu içeriyor ya da onunla bitiyorsa kesin, değilse uyuşmuyor; alan yoksa programda
// parça no (harf ve rakamla) ve varsa OP numarası aranır: bulunursa tahmin, bulunmazsa bilinmiyor. Program hiç görülmediyse bilinmiyor.
export function programEslesmesi(programlar: readonly string[], ncProgram: string | null, parcaNo: string | null, op: string | null): ProgramEslesmesi {
  if (programlar.length === 0) return 'bilinmiyor';
  if (ncProgram !== null && ncProgram.trim() !== '') {
    const alan = ncProgram.trim().toUpperCase();
    return programlar.some((p) => p.toUpperCase().endsWith(alan) || p.toUpperCase().includes(alan)) ? 'kesin' : 'uyusmuyor';
  }
  if (parcaNo === null || adAnahtari(parcaNo) === '') return 'bilinmiyor';
  const parca = adAnahtari(parcaNo);
  const opNo = op === null ? null : op.replace(/\D/g, '');
  const bulundu = programlar.some((p) => {
    const k = adAnahtari(dosyaAdi(p));
    return k.includes(parca) && (opNo === null || opNo === '' || k.slice(k.indexOf(parca) + parca.length).includes(opNo) || k.slice(0, k.indexOf(parca)).includes(opNo));
  });
  return bulundu ? 'tahmin' : 'bilinmiyor';
}

/* ---------------- sayım ---------------- */
// cevrimdeParca: iş emri adımının değeri (3814 a); OP adımsız kullanımda null, sayım tezgâh eşlemesindeki değere düşer.
export interface IsAraligi { bas: number; bit: number | null; isEmriNo: string; op: string | null; parcaNo: string; ilkParcaOnayi: number | null; cevrimdeParca?: number | null }
export interface SayimAni { zaman: number; saglam: number; hurda: number; red: number; standartSaniye: number; suresizSaglam: number }
export interface ProgramSurumu { ad: string; boyut: number; tarih: string | null; ilkGoruldu: number }

export interface IsSayimi {
  baslangic: number; bitis: number | null; isEmriNo: string; op: string | null; parcaNo: string;
  cevrimdeParca: number; cevrimdeParcaKaynagi: 'emir' | 'tezgah';
  sayacFarki: number | null; tezgahAdedi: number | null; denemeAyarAdedi: number | null; ayarAdedi: number | null;
  saglam: number | null; hurda: number | null; farkAdet: number | null; farkYuzde: number | null;
  programlar: string[]; programEslesmesi: ProgramEslesmesi; sayacGeriGitti: boolean; programDegisti: boolean | null; golgeOneri: number | null;
  // Hesap için: işin üretim artışları (OEE ve geçiş kullanır).
  uretimArtisSayisi: number; ilkEslesme: number | null;
}

const isBitisi = (i: IsAraligi, pencereBit: number): number => Math.min(i.bit ?? pencereBit, pencereBit);

// Programın listede karşılığı: kumandanın verdiği yol listedeki göreli adla biter (büyük-küçük harf ve ayraç farkı yok sayılır).
const programListede = (program: string, ad: string): boolean => {
  const n = (x: string) => x.replace(/\//g, '\\').toUpperCase();
  return n(program).endsWith(n(ad)) && (n(program).length === n(ad).length || n(program).at(-n(ad).length - 1) === '\\' || n(program).at(-n(ad).length - 1) === ':');
};

// Heidenhain "program değişti": işin onaylı program bilgisi, işin programla ilk eşleştiği anda geçerli sürümdür (o ana kadar görülen son
// sürüm; yoksa ilk sürüm). Sonra farklı bir sürüm görüldüyse işaret çıkar. Sürüm listesi yoksa (MTConnect, liste okunmadı) null.
export function programDegistiMi(program: string | null, ilkEslesme: number | null, surumler: readonly ProgramSurumu[] | null): boolean | null {
  if (surumler === null || program === null || ilkEslesme === null) return null;
  const ilgili = surumler.filter((s) => programListede(program, s.ad)).sort((a, b) => a.ilkGoruldu - b.ilkGoruldu);
  if (ilgili.length === 0) return null;
  const onayli = [...ilgili].reverse().find((s) => s.ilkGoruldu <= ilkEslesme) ?? ilgili[0]!;
  return ilgili.some((s) => s.ilkGoruldu > onayli.ilkGoruldu && (s.boyut !== onayli.boyut || s.tarih !== onayli.tarih));
}

export function isSayimlari(
  isler: readonly IsAraligi[], artis: readonly Artis[], sayimlar: readonly SayimAni[], cevrimdeParca: number, pencere: Aralik,
  surumler: readonly ProgramSurumu[] | null, ncProgrami: (i: IsAraligi) => string | null = () => null,
): IsSayimi[] {
  return isler.map((i) => {
    const k = i.cevrimdeParca ?? cevrimdeParca;
    const bit = isBitisi(i, pencere.bit);
    const ici = artis.filter((a) => a.zaman >= i.bas && a.zaman < bit);
    const uretim = ici.filter((a) => a.uretim);
    const toplam = (l: readonly Artis[]) => l.reduce((t, a) => t + a.adet, 0);
    const sayaciVar = ici.length > 0 || artis.some((a) => a.zaman < bit);
    const tezgahAdedi = sayaciVar ? toplam(uretim) * k : null;
    const s = sayimlar.filter((x) => x.zaman >= i.bas && x.zaman < bit);
    const saglam = s.length === 0 ? null : s.reduce((t, x) => t + x.saglam, 0);
    const hurda = s.length === 0 ? null : s.reduce((t, x) => t + x.hurda, 0);
    const terminal = saglam === null ? null : saglam + (hurda ?? 0);
    const farkAdet = tezgahAdedi === null || terminal === null ? null : tezgahAdedi - terminal;
    const programlar = [...new Set(ici.flatMap((a) => (a.program === null ? [] : [a.program])))];
    const eslesme = programEslesmesi(programlar, ncProgrami(i), i.parcaNo, i.op);
    const ilkEslesme = eslesme === 'kesin' || eslesme === 'tahmin' ? (uretim.find((a) => a.program !== null)?.zaman ?? null) : null;
    const ilkProgram = uretim.find((a) => a.program !== null)?.program ?? null;
    return {
      baslangic: i.bas, bitis: i.bit, isEmriNo: i.isEmriNo, op: i.op, parcaNo: i.parcaNo,
      cevrimdeParca: k, cevrimdeParcaKaynagi: i.cevrimdeParca == null ? 'tezgah' : 'emir',
      sayacFarki: sayaciVar ? toplam(ici) : null,
      tezgahAdedi,
      denemeAyarAdedi: sayaciVar ? toplam(ici.filter((a) => !a.uretim)) * k : null,
      ayarAdedi: i.ilkParcaOnayi === null || !sayaciVar ? null : toplam(uretim.filter((a) => a.zaman < (i.ilkParcaOnayi ?? 0))) * k,
      saglam, hurda, farkAdet,
      farkYuzde: farkAdet === null || terminal === null || terminal === 0 ? null : (farkAdet / terminal) * 100,
      programlar, programEslesmesi: eslesme, sayacGeriGitti: ici.some((a) => a.geriGitti),
      programDegisti: eslesme === 'kesin' || eslesme === 'tahmin' ? programDegistiMi(ilkProgram, ilkEslesme, surumler) : null,
      // Geçiş açık olsaydı operatöre düşecek öneri: tezgâh adedinden terminale girilmiş olanı çıkan kalan (eksi olmaz).
      golgeOneri: tezgahAdedi === null ? null : Math.max(0, tezgahAdedi - (terminal ?? 0)),
      uretimArtisSayisi: uretim.length, ilkEslesme,
    };
  });
}

export interface ProgramKullanimi { program: string; ilk: number; son: number; uretimArtisi: number; denemeArtisi: number; isEmirleri: string[] }
export function programKullanimi(isler: readonly IsAraligi[], artis: readonly Artis[], pencereBit: number): ProgramKullanimi[] {
  const harita = new Map<string, ProgramKullanimi>();
  for (const a of artis) {
    if (a.program === null || a.adet === 0) continue;
    const k = harita.get(a.program) ?? { program: a.program, ilk: a.zaman, son: a.zaman, uretimArtisi: 0, denemeArtisi: 0, isEmirleri: [] };
    k.ilk = Math.min(k.ilk, a.zaman);
    k.son = Math.max(k.son, a.zaman);
    if (a.uretim) k.uretimArtisi += a.adet;
    else k.denemeArtisi += a.adet;
    const is = isler.find((i) => a.zaman >= i.bas && a.zaman < isBitisi(i, pencereBit));
    if (is !== undefined && a.uretim && !k.isEmirleri.includes(is.isEmriNo)) k.isEmirleri.push(is.isEmriNo);
    harita.set(a.program, k);
  }
  return [...harita.values()].sort((a, b) => a.ilk - b.ilk);
}

/* ---------------- durum çizgisi ve duruş ---------------- */
export type Hal = 'calisiyor' | 'bekliyor' | 'alarm' | 'baglanti-yok' | 'vardiya-disi';
export interface CizgiParcasi { bas: number; bit: number; hal: Hal }
export interface DurumOrnegi { zaman: number; durum: string }

const halOf = (d: string): Exclude<Hal, 'vardiya-disi'> =>
  d === 'calisiyor' || d === 'bekliyor' || d === 'alarm' ? d : 'baglanti-yok';

// Durum örnekleri (pencere başından önceki son örnek dahil) pencereye yayılır; örnek yoksa bağlantı yok. Plan (vardiya) verilirse plan
// dışında çalışmayan parçalar vardiya dışıdır.
export function durumCizgisi(ornekler: readonly DurumOrnegi[], pencere: Aralik, plan: readonly Aralik[] | null): CizgiParcasi[] {
  const sirali = [...ornekler].sort((a, b) => a.zaman - b.zaman);
  const ham: CizgiParcasi[] = [];
  let hal: Exclude<Hal, 'vardiya-disi'> = 'baglanti-yok';
  let an = pencere.bas;
  for (const o of sirali) {
    if (o.zaman <= pencere.bas) { hal = halOf(o.durum); continue; }
    if (o.zaman >= pencere.bit) break;
    if (o.zaman > an) ham.push({ bas: an, bit: o.zaman, hal });
    an = o.zaman;
    hal = halOf(o.durum);
  }
  if (pencere.bit > an) ham.push({ bas: an, bit: pencere.bit, hal });
  if (plan === null) return birlestir(ham);
  const sonuc: CizgiParcasi[] = [];
  for (const p of ham) {
    if (p.hal === 'calisiyor') { sonuc.push(p); continue; }
    let k = p.bas;
    for (const v of kes(plan, p)) {
      if (v.bas > k) sonuc.push({ bas: k, bit: v.bas, hal: 'vardiya-disi' });
      sonuc.push({ ...v, hal: p.hal });
      k = v.bit;
    }
    if (p.bit > k) sonuc.push({ bas: k, bit: p.bit, hal: 'vardiya-disi' });
  }
  return birlestir(sonuc);
}
function birlestir(l: readonly CizgiParcasi[]): CizgiParcasi[] {
  const s: CizgiParcasi[] = [];
  for (const p of l) {
    const son = s.at(-1);
    if (son !== undefined && son.hal === p.hal && son.bit === p.bas) son.bit = p.bit;
    else s.push({ ...p });
  }
  return s;
}

export type DurusSinifi = 'ariza' | 'olcum' | 'is-yok' | 'neden-sorulacak';
export interface AlarmOlayi { bas: number; bit: number | null; kod: string | null; metin: string }
export interface DurusAdayi { bas: number; bit: number; saniye: number; sinif: DurusSinifi; metin: string | null; isEmriNo: string | null }

// Duruş: plan içinde bekliyor ya da alarm. Eşikten uzun olan adaydır, kısa olanlar kısa duruş olarak toplanır. Sınıf: alarm hâli ya da
// süre içinde alarm olayı arıza; açık iş yoksa iş yok; iş var ama ilk parça onayı henüz yoksa ölçüm (ilk parça ölçümü bekleniyor);
// gerisi neden sorulacak. Kayıtsız duruş: terminalde işin açık olduğu (makine kullanımı sürüyor) duruş süresidir; terminal duruşu
// kullanımı kapattığından terminalde karşılığı olmayan duruştur.
export function duruslar(cizgi: readonly CizgiParcasi[], esikDk: number, isler: readonly IsAraligi[], alarmlar: readonly AlarmOlayi[], pencereBit: number): {
  adaylar: DurusAdayi[]; kisa: { adet: number; saniye: number }; toplamSaniye: number; kayitsizSaniye: number;
} {
  const adaylar: DurusAdayi[] = [];
  const kisa = { adet: 0, saniye: 0 };
  let toplam = 0;
  let kayitsiz = 0;
  const isAraliklari = isler.map((i) => ({ bas: i.bas, bit: isBitisi(i, pencereBit), i }));
  for (const p of cizgi) {
    if (p.hal !== 'bekliyor' && p.hal !== 'alarm') continue;
    const sn = Math.round((p.bit - p.bas) / 1000);
    toplam += sn;
    kayitsiz += Math.round(sure(kes(isAraliklari, p)) / 1000);
    if (sn < esikDk * 60) {
      kisa.adet += 1;
      kisa.saniye += sn;
      continue;
    }
    const alarm = alarmlar.find((a) => a.bas < p.bit && (a.bit ?? pencereBit) > p.bas);
    const is = isAraliklari.find((x) => x.bas < p.bit && x.bit > p.bas)?.i ?? null;
    let sinif: DurusSinifi = 'neden-sorulacak';
    if (p.hal === 'alarm' || alarm !== undefined) sinif = 'ariza';
    else if (is === null) sinif = 'is-yok';
    else if (is.ilkParcaOnayi === null || is.ilkParcaOnayi > p.bas) sinif = 'olcum';
    adaylar.push({ bas: p.bas, bit: p.bit, saniye: sn, sinif, metin: sinif === 'ariza' ? (alarm?.metin ?? null) : null, isEmriNo: is?.isEmriNo ?? null });
  }
  return { adaylar, kisa, toplamSaniye: toplam, kayitsizSaniye: kayitsiz };
}

export const isEmriAninda = (an: number, isler: readonly IsAraligi[], pencereBit: number): string | null =>
  isler.find((i) => an >= i.bas && an < isBitisi(i, pencereBit))?.isEmriNo ?? null;

export interface EnSikAlarm { kod: string | null; metin: string; adet: number; saniye: number }
export function enSikAlarmlar(alarmlar: readonly AlarmOlayi[], pencere: Aralik, sinir = 10): EnSikAlarm[] {
  const h = new Map<string, EnSikAlarm>();
  for (const a of alarmlar) {
    const k = `${a.kod ?? ''}\u0000${a.metin}`;
    const x = h.get(k) ?? { kod: a.kod, metin: a.metin, adet: 0, saniye: 0 };
    x.adet += 1;
    x.saniye += Math.round(sure(kes([{ bas: a.bas, bit: a.bit ?? pencere.bit }], pencere)) / 1000);
    h.set(k, x);
  }
  return [...h.values()].sort((a, b) => b.adet - a.adet || b.saniye - a.saniye).slice(0, sinir);
}

/* ---------------- OEE ---------------- */
export const ortanca = (l: readonly number[]): number | null => {
  if (l.length === 0) return null;
  const s = [...l].sort((a, b) => a - b);
  const o = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[o]! : (s[o - 1]! + s[o]!) / 2;
};

// Gerçek çevrim: ardışık iki üretim artışı arasındaki sürenin artış adedine bölümünün ortancası (saniye, çevrim başına). Araya
// deneme/ayar artışı ya da sayaç geri gidişi girerse o çift sayılmaz.
export function gercekCevrim(artis: readonly Artis[]): number | null {
  const farklar: number[] = [];
  for (let i = 1; i < artis.length; i += 1) {
    const a = artis[i - 1]!, b = artis[i]!;
    if (a.uretim && b.uretim && !b.geriGitti && b.adet > 0) farklar.push((b.zaman - a.zaman) / 1000 / b.adet);
  }
  return ortanca(farklar);
}

// İlerleme oranının %100'ün altında kaldığı çalışma süresi (saniye). Oran örnekleri bir sonraki örneğe kadar geçerlidir.
export function hizDusurme(oranlar: readonly { zaman: number; deger: number }[], calisma: readonly Aralik[], pencereBit: number): number {
  const s = [...oranlar].sort((a, b) => a.zaman - b.zaman);
  let t = 0;
  for (let i = 0; i < s.length; i += 1) {
    if (s[i]!.deger >= 100) continue;
    t += sure(kes(calisma, { bas: s[i]!.zaman, bit: s[i + 1]?.zaman ?? pencereBit }));
  }
  return Math.round(t / 1000);
}

export const bolum = (a: number | null, b: number | null): number | null => (a === null || b === null || b <= 0 ? null : a / b);

/* ---------------- geçiş hazırlığı ---------------- */
export interface Olcut { olcut: GecisOlcutu; tamam: boolean; deger: string | null; neden: string | null }
const yuzdeMetni = (n: number) => `%${(Math.round(n * 1000) / 10).toLocaleString('tr-TR')}`;

export interface GecisGirdisi {
  eslendi: boolean;
  planliMs: number | null;
  baglantiYokMs: number;
  // Kapanan işlerde tezgâh adedi ve terminal toplamı.
  kapananlar: { tezgah: number; terminal: number }[];
  // Üretim artışı olan işlerin program eşleşmeleri.
  eslesmeler: ProgramEslesmesi[];
  ncAlaniVar: boolean;
  alarmTani: string | null;
  saatFarkiSn: number | null;
  saatTani: string | null;
  uretimArtisi: number;
  iseBagliUretimArtisi: number;
}

export function gecisOlcutleri(g: GecisGirdisi): Olcut[] {
  const E = GECIS_ESIKLERI;
  const olcut = (olcut: GecisOlcutu, tamam: boolean, deger: string | null, neden: string | null): Olcut => ({ olcut, tamam, deger, neden: tamam ? null : neden });
  const bosluk = bolum(g.baglantiYokMs, g.planliMs);
  const tezgah = g.kapananlar.reduce((t, k) => t + Math.abs(k.tezgah - k.terminal), 0);
  const terminal = g.kapananlar.reduce((t, k) => t + k.terminal, 0);
  const fark = bolum(tezgah, terminal);
  const eslesen = bolum(g.eslesmeler.filter((e) => e === 'kesin' || e === 'tahmin').length, g.eslesmeler.length);
  const iseBagli = bolum(g.iseBagliUretimArtisi, g.uretimArtisi);
  const uyusmayan = bolum(g.eslesmeler.filter((e) => e === 'uyusmuyor').length, g.eslesmeler.length);
  return [
    olcut('esleme', g.eslendi, g.eslendi ? 'Onaylı' : null, 'Makine eşlemesi onaylanmadı'),
    olcut('veri-boslugu', bosluk !== null && bosluk < E.veriBoslugu, bosluk === null ? null : yuzdeMetni(bosluk),
      bosluk === null ? 'Planlı süre yok (vardiya takvimi ya da eşleme yok)' : 'Bağlantısız süre eşiğin üstünde'),
    olcut('sayac-farki', g.kapananlar.length >= E.enAzIs && fark !== null && fark < E.sayacFarki,
      fark === null ? `${String(g.kapananlar.length)} iş` : `${yuzdeMetni(fark)} · ${String(g.kapananlar.length)} iş`,
      g.kapananlar.length < E.enAzIs ? `En az ${String(E.enAzIs)} kapanan iş gerekir` : fark === null ? 'Terminal sayımı yok' : 'Sayaç farkı eşiğin üstünde'),
    olcut('program-eslesmesi', eslesen !== null && eslesen > E.programEslesmesi, eslesen === null ? null : yuzdeMetni(eslesen),
      eslesen === null ? 'Sayaç artışı olan iş yok' : 'Programı işle eşleşmeyen iş çok'),
    olcut('alarm-okunuyor', g.alarmTani === null, g.alarmTani === null ? 'Okunuyor' : null, g.alarmTani === null ? null : `Ölçülemiyor: ${g.alarmTani}`),
    olcut('saat-farki', g.saatFarkiSn !== null && Math.abs(g.saatFarkiSn) < E.saatFarkiSn, g.saatFarkiSn === null ? null : `${String(Math.round(g.saatFarkiSn))} sn`,
      g.saatFarkiSn === null ? (g.saatTani ?? 'Kumanda saati okunamadı') : 'Saat farkı eşiğin üstünde'),
    olcut('is-eslesmesi', iseBagli !== null && iseBagli > E.isEslesmesi, iseBagli === null ? null : yuzdeMetni(iseBagli),
      iseBagli === null ? 'Üretim artışı yok' : 'İşe bağlanmayan üretim artışı çok'),
    olcut('uyusmazlik', g.ncAlaniVar && uyusmayan !== null && uyusmayan < E.uyusmazlik, g.ncAlaniVar && uyusmayan !== null ? yuzdeMetni(uyusmayan) : null,
      !g.ncAlaniVar ? 'NC program alanı yok; ölçülemiyor' : uyusmayan === null ? 'Sayaç artışı olan iş yok' : '“Uyuşmuyor” oranı eşiğin üstünde'),
  ];
}
