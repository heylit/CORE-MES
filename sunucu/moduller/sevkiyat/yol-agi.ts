// Yol ağı ve tek rota: zamana bağlı en kısa süre, en kısa mesafe ve en düşük maliyet yolu; durak sırası.
// Saf: veritabanı, dosya ve saat yok. Trafik saatlik örnek profildir; gerçek değerler araç konum kaydından öğrenilecek.

import { ARAC_HIZ_KATSAYISI, EN_COK_TEK_ROTA_DURAGI, GOOGLE_ARA_DURAK_SINIRI, RAMPA_HIZI, SERBEST_HIZ, VARSAYILAN_MALIYET } from './kurallar.ts';
import type { Amac, AracTuru, GunTipi, MaliyetOranlari, YolSinifi } from './kurallar.ts';

// Yoğunluk hassasiyeti kent merkezine uzaklığa ve ana arter adına göre artar; ikisi de dış veri paketinden gelir
// (yoksa merkez sınır kutusunun ortası, ana arter yok).
const KM_BOYLAM_DERECESI = 111.32, KM_ENLEM_DERECESI = 110.54;

// Dış veri paketinin yol ağı dosyası (OSM'den üretilir; alan adları dosya biçimidir).
export interface YolVerisi {
  bbox: [number, number, number, number]; q: number; classes: string[];
  nodes: number[]; edges: number[]; geom: number[]; names: string[];
  // [boylam, enlem]; düzenli ifade kaynakları (büyük/küçük harf duyarsız).
  merkez?: [number, number]; anaArterler?: string[];
}

export interface YolAgi {
  dugumSayisi: number; boylam: Float64Array; enlem: Float64Array;
  // (komşu, kenar, yön) üçlüleri; yön 1: A'dan B'ye, -1: B'den A'ya
  komsuBaslangici: Int32Array; komsular: Int32Array;
  kenarA: Int32Array; kenarB: Int32Array; kenarSinifi: Uint8Array; tekYon: Int8Array; kenarMetre: Float32Array;
  kenarAdi: Int32Array; rampa: Uint8Array; geometriBaslangici: Int32Array; geometriUzunlugu: Int32Array;
  // Yoğunluk hassasiyeti; kenar merkeze yaklaşıyorsa 1, uzaklaşıyorsa -1.
  hassasiyet: Float32Array; merkezYonu: Int8Array;
  geometri: Float64Array; adlar: string[]; siniflar: YolSinifi[];
  izgara: Map<number, number[]>; izgaraAdimi: number;
}

// Gün içi yoğunluk (0 serbest, ~1.2 zirve) ve yöne göre ek: sabah merkeze, akşam merkezden.
export function yogunluk(gun: GunTipi, dakika: number): { genel: number; giris: number; cikis: number } {
  const saat = dakika / 60;
  const tepe = (orta: number, yayilma: number, buyukluk: number) => buyukluk * Math.exp(-((saat - orta) ** 2) / (2 * yayilma * yayilma));
  let sabah = 0, aksam = 0, oglen = 0;
  if (gun === 'hafta-ici') { sabah = tepe(8.1, 0.85, 1.0); aksam = tepe(18.1, 1.15, 1.0); oglen = tepe(13, 2.2, 0.38); }
  else if (gun === 'cuma') { sabah = tepe(8.1, 0.85, 0.95); aksam = tepe(17.6, 1.45, 1.18); oglen = tepe(13.3, 2.2, 0.5); }
  else if (gun === 'cumartesi') { sabah = tepe(10.5, 1.5, 0.3); aksam = tepe(18.5, 1.6, 0.45); oglen = tepe(14, 2.5, 0.55); }
  else { oglen = tepe(15, 3, 0.33); aksam = tepe(19.5, 1.4, 0.3); }
  const gece = saat < 5.5 || saat > 23 ? -0.1 : 0;
  return { genel: Math.max(0, sabah + aksam + oglen + gece), giris: sabah * 0.4 - aksam * 0.1, cikis: aksam * 0.4 - sabah * 0.1 };
}

export function yolAgiKur(veri: YolVerisi): YolAgi {
  const [bati, guney] = veri.bbox, olcek = veri.q, n = veri.nodes.length / 2;
  const boylam = new Float64Array(n), enlem = new Float64Array(n);
  for (let i = 0; i < n; i++) { boylam[i] = veri.nodes[2 * i]! / olcek + bati; enlem[i] = veri.nodes[2 * i + 1]! / olcek + guney; }
  const m = veri.edges.length / 9;
  const sutun = (k: number) => { const a = new Int32Array(m); for (let i = 0; i < m; i++) a[i] = veri.edges[i * 9 + k]!; return a; };
  const kenarA = sutun(0), kenarB = sutun(1), kenarSinifi = Uint8Array.from(sutun(2)), tekYon = Int8Array.from(sutun(3));
  const kenarMetre = Float32Array.from(sutun(4)), kenarAdi = sutun(5), rampa = Uint8Array.from(sutun(6));
  const geometriBaslangici = sutun(7), geometriUzunlugu = sutun(8);
  const geometri = new Float64Array(veri.geom.length);
  for (let i = 0; i < veri.geom.length; i += 2) { geometri[i] = veri.geom[i]! / olcek + bati; geometri[i + 1] = veri.geom[i + 1]! / olcek + guney; }
  const merkez = veri.merkez ?? [(veri.bbox[0] + veri.bbox[2]) / 2, (veri.bbox[1] + veri.bbox[3]) / 2];
  const anaArter = veri.anaArterler?.length ? new RegExp(veri.anaArterler.join('|'), 'i') : null;
  const boylamKatsayisi = KM_BOYLAM_DERECESI * Math.cos((merkez[1] * Math.PI) / 180);
  const merkezeUzaklik = (noktaBoylami: number, noktaEnlemi: number) => Math.hypot((noktaBoylami - merkez[0]) * boylamKatsayisi, (noktaEnlemi - merkez[1]) * KM_ENLEM_DERECESI);
  const siniflar = veri.classes as YolSinifi[];
  const hassasiyet = new Float32Array(m), merkezYonu = new Int8Array(m);
  const sinifAgirligi: Record<YolSinifi, number> = { motorway: 0.72, trunk: 1, primary: 1, secondary: 0.82, tertiary: 0.6 };
  for (let i = 0; i < m; i++) {
    const a = kenarA[i]!, b = kenarB[i]!, r = merkezeUzaklik((boylam[a]! + boylam[b]!) / 2, (enlem[a]! + enlem[b]!) / 2);
    const ad = kenarAdi[i]! >= 0 ? veri.names[kenarAdi[i]!]! : '';
    let kenarHassasiyeti = sinifAgirligi[siniflar[kenarSinifi[i]!]!] * (0.45 + 0.75 * Math.exp(-((r / 8.5) ** 2)));
    if (anaArter?.test(ad)) kenarHassasiyeti *= 1.28;
    if (rampa[i]) kenarHassasiyeti *= 1.1;
    hassasiyet[i] = Math.min(1.35, kenarHassasiyeti);
    const merkezeUzaklikA = merkezeUzaklik(boylam[a]!, enlem[a]!), merkezeUzaklikB = merkezeUzaklik(boylam[b]!, enlem[b]!);
    merkezYonu[i] = merkezeUzaklikB < merkezeUzaklikA - 0.05 ? 1 : merkezeUzaklikB > merkezeUzaklikA + 0.05 ? -1 : 0;
  }
  const sayac = new Int32Array(n + 1);
  for (let i = 0; i < m; i++) { if (tekYon[i] !== -1) sayac[kenarA[i]!]!++; if (tekYon[i] !== 1) sayac[kenarB[i]!]!++; }
  const komsuBaslangici = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) komsuBaslangici[i + 1] = komsuBaslangici[i]! + sayac[i]!;
  const komsular = new Int32Array(komsuBaslangici[n]! * 3), yer = komsuBaslangici.slice(0, n);
  for (let i = 0; i < m; i++) {
    if (tekYon[i] !== -1) { const p = yer[kenarA[i]!]!++ * 3; komsular[p] = kenarB[i]!; komsular[p + 1] = i; komsular[p + 2] = 1; }
    if (tekYon[i] !== 1) { const p = yer[kenarB[i]!]!++ * 3; komsular[p] = kenarA[i]!; komsular[p + 1] = i; komsular[p + 2] = -1; }
  }
  // Tek yönlü yollarda çıkışsız kalan parçalar en yakın düğüm olarak seçilmesin: yalnız en büyük güçlü bağlı bileşen.
  const bilesende = enBuyukBilesen(n, komsuBaslangici, komsular, kenarA, kenarB, tekYon, m);
  const izgaraAdimi = 0.01, izgara = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    if (!bilesende[i]) continue;
    const k = Math.floor(boylam[i]! / izgaraAdimi) * 100000 + Math.floor(enlem[i]! / izgaraAdimi);
    let liste = izgara.get(k); if (!liste) izgara.set(k, (liste = [])); liste.push(i);
  }
  return {
    dugumSayisi: n, boylam, enlem, komsuBaslangici, komsular, kenarA, kenarB, kenarSinifi, tekYon, kenarMetre, kenarAdi, rampa,
    geometriBaslangici, geometriUzunlugu, hassasiyet, merkezYonu, geometri, adlar: veri.names, siniflar, izgara, izgaraAdimi,
  };
}

// Kosaraju, yinelemeli: ileri aramanın bitiş sırası, sonra ters çizgede bileşenler.
function enBuyukBilesen(n: number, baslangic: Int32Array, komsular: Int32Array, kenarA: Int32Array, kenarB: Int32Array, tekYon: Int8Array, m: number) {
  const sira: number[] = [], goruldu = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    if (goruldu[s]) continue; goruldu[s] = 1;
    const yigin: [number, number][] = [[s, baslangic[s]!]];
    while (yigin.length) {
      const ust = yigin[yigin.length - 1]!, u = ust[0];
      if (ust[1] < baslangic[u + 1]!) { const v = komsular[ust[1] * 3]!; ust[1]++; if (!goruldu[v]) { goruldu[v] = 1; yigin.push([v, baslangic[v]!]); } }
      else { sira.push(u); yigin.pop(); }
    }
  }
  const tersBaslangic = new Int32Array(n + 1), sayac = new Int32Array(n);
  for (let i = 0; i < m; i++) { if (tekYon[i] !== -1) sayac[kenarB[i]!]!++; if (tekYon[i] !== 1) sayac[kenarA[i]!]!++; }
  for (let i = 0; i < n; i++) tersBaslangic[i + 1] = tersBaslangic[i]! + sayac[i]!;
  const ters = new Int32Array(tersBaslangic[n]!), yer = tersBaslangic.slice(0, n);
  for (let i = 0; i < m; i++) { if (tekYon[i] !== -1) ters[yer[kenarB[i]!]!++] = kenarA[i]!; if (tekYon[i] !== 1) ters[yer[kenarA[i]!]!++] = kenarB[i]!; }
  const bilesen = new Int32Array(n).fill(-1), bilesenBoyutlari: number[] = [];
  for (let k = sira.length - 1; k >= 0; k--) {
    const s = sira[k]!; if (bilesen[s]! >= 0) continue;
    const bilesenNo = bilesenBoyutlari.length; let uyeSayisi = 0; const yigin = [s]; bilesen[s] = bilesenNo;
    while (yigin.length) { const u = yigin.pop()!; uyeSayisi++; for (let p = tersBaslangic[u]!; p < tersBaslangic[u + 1]!; p++) { const v = ters[p]!; if (bilesen[v]! < 0) { bilesen[v] = bilesenNo; yigin.push(v); } } }
    bilesenBoyutlari.push(uyeSayisi);
  }
  const enBuyuk = bilesenBoyutlari.indexOf(Math.max(...bilesenBoyutlari)), sonuc = new Uint8Array(n);
  for (let i = 0; i < n; i++) sonuc[i] = bilesen[i] === enBuyuk ? 1 : 0;
  return sonuc;
}

export function metreArasi(a: [number, number], b: [number, number]): number {
  const k = Math.cos((((a[1] + b[1]) / 2) * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * 111320 * k, (a[1] - b[1]) * 110540);
}

// Konuma en yakın, çıkış yapılabilen düğüm ve uzaklığı (metre).
export function enYakinDugum(ag: YolAgi, konum: [number, number]): { dugum: number; metre: number } {
  let enIyi = -1, enKisa = Infinity;
  for (let halka = 0; halka < 6 && enIyi < 0; halka++) {
    const izgaraSutunu = Math.floor(konum[0] / ag.izgaraAdimi), izgaraSatiri = Math.floor(konum[1] / ag.izgaraAdimi);
    for (let sutunAdimi = -halka; sutunAdimi <= halka; sutunAdimi++) for (let satirAdimi = -halka; satirAdimi <= halka; satirAdimi++) {
      if (Math.max(Math.abs(sutunAdimi), Math.abs(satirAdimi)) !== halka) continue;
      for (const i of ag.izgara.get((izgaraSutunu + sutunAdimi) * 100000 + izgaraSatiri + satirAdimi) ?? []) {
        if (ag.komsuBaslangici[i + 1] === ag.komsuBaslangici[i]) continue;
        const d = metreArasi(konum, [ag.boylam[i]!, ag.enlem[i]!]);
        if (d < enKisa) { enKisa = d; enIyi = i; }
      }
    }
  }
  return { dugum: enIyi, metre: enKisa };
}

// Gün tipine göre dakikalık yoğunluk tablosu: [genel, giriş, çıkış] x 1441; bir kez hesaplanır.
const YOGUNLUK_TABLOLARI = new Map<GunTipi, Float64Array>();
export function yogunlukTablosu(gun: GunTipi): Float64Array {
  let tablo = YOGUNLUK_TABLOLARI.get(gun);
  if (!tablo) {
    tablo = new Float64Array(1441 * 3);
    for (let d = 0; d <= 1440; d++) { const y = yogunluk(gun, d % 1440); tablo[d * 3] = y.genel; tablo[d * 3 + 1] = y.giris; tablo[d * 3 + 2] = y.cikis; }
    YOGUNLUK_TABLOLARI.set(gun, tablo);
  }
  return tablo;
}

const serbestHiz = (ag: YolAgi, e: number, arac: AracTuru) => (ag.rampa[e] ? RAMPA_HIZI : SERBEST_HIZ[ag.siniflar[ag.kenarSinifi[e]!]!]) * ARAC_HIZ_KATSAYISI[arac];

// Kenarın serbest akışa oranı; dakikalar arası doğrusal.
function akisOrani(ag: YolAgi, e: number, yon: number, tablo: Float64Array, dakika: number): number {
  const gunDakikasi = ((dakika % 1440) + 1440) % 1440, tamDakika = Math.floor(gunDakikasi), kesir = gunDakikasi - tamDakika, tabloSirasi = tamDakika * 3, sonrakiTabloSirasi = tabloSirasi + 3;
  const giris = ag.merkezYonu[e]! * yon, yonSutunu = giris > 0 ? 1 : giris < 0 ? 2 : 0;
  const genel = tablo[tabloSirasi]! + (tablo[sonrakiTabloSirasi]! - tablo[tabloSirasi]!) * kesir, yonEki = yonSutunu ? tablo[tabloSirasi + yonSutunu]! + (tablo[sonrakiTabloSirasi + yonSutunu]! - tablo[tabloSirasi + yonSutunu]!) * kesir : 0;
  return Math.max(0.16, 1 - 0.7 * Math.min(1.15, ag.hassasiyet[e]! * Math.max(0, genel + yonEki)));
}

// Kenar geçiş süresi (dakika), kavşak payı dahil.
function kenarDakikasi(ag: YolAgi, e: number, yon: number, tablo: Float64Array, dakika: number, arac: AracTuru): number {
  return (ag.kenarMetre[e]! / 1000 / (serbestHiz(ag, e, arac) * akisOrani(ag, e, yon, tablo, dakika))) * 60 + (ag.kenarSinifi[e]! >= 3 ? 0.05 : 0.02);
}

// Haritadaki trafik rengi: kenar başına 0 akıcı, 1 yoğun, 2 yavaş, 3 tıkalı (iki yönün ortalaması).
export const TRAFIK_DILIMI_DAKIKA = 15;
export function trafikSeviyeleri(ag: YolAgi, gun: GunTipi, dakika: number): number[] {
  const tablo = yogunlukTablosu(gun), d = Math.round(dakika / TRAFIK_DILIMI_DAKIKA) * TRAFIK_DILIMI_DAKIKA;
  const sonuc = new Array<number>(ag.kenarA.length);
  for (let e = 0; e < ag.kenarA.length; e++) {
    const ileri = ag.tekYon[e] !== -1 ? akisOrani(ag, e, 1, tablo, d) : 1, geri = ag.tekYon[e] !== 1 ? akisOrani(ag, e, -1, tablo, d) : 1;
    const oran = (ileri + geri) / 2;
    sonuc[e] = oran >= 0.72 ? 0 : oran >= 0.52 ? 1 : oran >= 0.36 ? 2 : 3;
  }
  return sonuc;
}

// Tipli ikili yığın: Dijkstra döngüsünde nesne ayırmaz.
class EnKucukYigin {
  degerler = new Int32Array(4096); anahtarlar = new Float64Array(4096); boy = 0; ust = 0;
  temizle() { this.boy = 0; }
  ekle(deger: number, anahtar: number) {
    if (this.boy === this.degerler.length) {
      const a = new Int32Array(this.boy * 2); a.set(this.degerler); this.degerler = a;
      const b = new Float64Array(this.boy * 2); b.set(this.anahtarlar); this.anahtarlar = b;
    }
    const degerDizisi = this.degerler, anahtarDizisi = this.anahtarlar; let i = this.boy++;
    while (i > 0) { const p = (i - 1) >> 1; if (anahtarDizisi[p]! <= anahtar) break; degerDizisi[i] = degerDizisi[p]!; anahtarDizisi[i] = anahtarDizisi[p]!; i = p; }
    degerDizisi[i] = deger; anahtarDizisi[i] = anahtar;
  }
  // En küçüğü çıkarır; anahtarı `ust` alanında kalır.
  cikar(): number {
    const degerDizisi = this.degerler, anahtarDizisi = this.anahtarlar, v = degerDizisi[0]!; this.ust = anahtarDizisi[0]!; const n = --this.boy;
    if (n > 0) {
      const sonDeger = degerDizisi[n]!, sonAnahtar = anahtarDizisi[n]!; let i = 0;
      for (;;) { let cocuk = 2 * i + 1; if (cocuk >= n) break; if (cocuk + 1 < n && anahtarDizisi[cocuk + 1]! < anahtarDizisi[cocuk]!) cocuk++; if (anahtarDizisi[cocuk]! >= sonAnahtar) break; degerDizisi[i] = degerDizisi[cocuk]!; anahtarDizisi[i] = anahtarDizisi[cocuk]!; i = cocuk; }
      degerDizisi[i] = sonDeger; anahtarDizisi[i] = sonAnahtar;
    }
    return v;
  }
}
const YIGIN = new EnKucukYigin();

export interface KenarAdimi { kenar: number; yon: 1 | -1 }
export interface Ayak { kenarlar: KenarAdimi[]; metre: number; dakika: number }

function izSur(ag: YolAgi, s: number, t: number, onceki: Int32Array, onceYon: Int8Array): { kenarlar: KenarAdimi[]; metre: number } {
  const kenarlar: KenarAdimi[] = []; let v = t, metre = 0;
  while (v !== s) { const e = onceki[v]!, y = onceYon[v] as 1 | -1; kenarlar.push({ kenar: e, yon: y }); metre += ag.kenarMetre[e]!; v = y === 1 ? ag.kenarA[e]! : ag.kenarB[e]!; }
  kenarlar.reverse();
  return { kenarlar, metre };
}

// Zamana bağlı en kısa süre: kenar süresi, kenara girildiği andaki hızla.
export function enHizliYol(ag: YolAgi, s: number, t: number, gun: GunTipi, cikisDakika: number, arac: AracTuru): Ayak | null {
  const n = ag.dugumSayisi, varisDakikasi = new Float64Array(n).fill(Infinity), onceki = new Int32Array(n).fill(-1), onceYon = new Int8Array(n), bitti = new Uint8Array(n);
  const yigin = YIGIN, tablo = yogunlukTablosu(gun); yigin.temizle();
  varisDakikasi[s] = cikisDakika; yigin.ekle(s, cikisDakika);
  while (yigin.boy) {
    const u = yigin.cikar(), dugumDakikasi = yigin.ust;
    if (bitti[u]) continue; bitti[u] = 1;
    if (u === t) break;
    for (let p = ag.komsuBaslangici[u]! * 3, son = ag.komsuBaslangici[u + 1]! * 3; p < son; p += 3) {
      const v = ag.komsular[p]!; if (bitti[v]) continue;
      const e = ag.komsular[p + 1]!, yon = ag.komsular[p + 2]!;
      const komsuDakikasi = dugumDakikasi + kenarDakikasi(ag, e, yon, tablo, dugumDakikasi, arac);
      if (komsuDakikasi < varisDakikasi[v]!) { varisDakikasi[v] = komsuDakikasi; onceki[v] = e; onceYon[v] = yon; yigin.ekle(v, komsuDakikasi); }
    }
  }
  if (!Number.isFinite(varisDakikasi[t]!)) return null;
  return { ...izSur(ag, s, t, onceki, onceYon), dakika: varisDakikasi[t]! - cikisDakika };
}

// Sabit bir yolun verilen çıkış dakikasındaki süresi.
export function ayakSuresi(ag: YolAgi, kenarlar: readonly KenarAdimi[], gun: GunTipi, cikisDakika: number, arac: AracTuru): number {
  const tablo = yogunlukTablosu(gun); let t = cikisDakika;
  for (const { kenar, yon } of kenarlar) t += kenarDakikasi(ag, kenar, yon, tablo, t, arac);
  return t - cikisDakika;
}

// En kısa mesafe yolu; oran verilirse çıkış dakikasındaki hızlarla en düşük TL yolu. Süre o yol üzerinden hesaplanır.
export function enKisaYol(ag: YolAgi, s: number, t: number, gun: GunTipi, cikisDakika: number, arac: AracTuru, oran?: MaliyetOranlari): Ayak | null {
  const n = ag.dugumSayisi, bedel = new Float64Array(n).fill(Infinity), onceki = new Int32Array(n).fill(-1), onceYon = new Int8Array(n), bitti = new Uint8Array(n);
  const yigin = YIGIN, tablo = yogunlukTablosu(gun); yigin.temizle();
  bedel[s] = 0; yigin.ekle(s, 0);
  while (yigin.boy) {
    const u = yigin.cikar(), dugumBedeli = yigin.ust; if (bitti[u]) continue; bitti[u] = 1; if (u === t) break;
    for (let p = ag.komsuBaslangici[u]! * 3, son = ag.komsuBaslangici[u + 1]! * 3; p < son; p += 3) {
      const v = ag.komsular[p]!; if (bitti[v]) continue;
      const e = ag.komsular[p + 1]!, yon = ag.komsular[p + 2]!, kenarKilometresi = ag.kenarMetre[e]! / 1000;
      const komsuBedeli = dugumBedeli + (oran ? kenarKilometresi * oran.kilometre + (kenarKilometresi / (serbestHiz(ag, e, arac) * akisOrani(ag, e, yon, tablo, cikisDakika))) * oran.saat : ag.kenarMetre[e]!);
      if (komsuBedeli < bedel[v]!) { bedel[v] = komsuBedeli; onceki[v] = e; onceYon[v] = yon; yigin.ekle(v, komsuBedeli); }
    }
  }
  if (!Number.isFinite(bedel[t]!)) return null;
  const izSonucu = izSur(ag, s, t, onceki, onceYon);
  return { ...izSonucu, dakika: ayakSuresi(ag, izSonucu.kenarlar, gun, cikisDakika, arac) };
}

// Tek kaynaktan tüm düğümlere statik ağırlık (sıralama için): süre, km ya da TL.
function tumuneAgirlik(ag: YolAgi, s: number, gun: GunTipi, dakika: number, arac: AracTuru, olcut: 'sure' | 'mesafe' | MaliyetOranlari): Float64Array {
  const mesafe = olcut === 'mesafe', oran = typeof olcut === 'object' ? olcut : null, tablo = yogunlukTablosu(gun);
  const agirliklar = new Float64Array(ag.dugumSayisi).fill(Infinity), bitti = new Uint8Array(ag.dugumSayisi), yigin = YIGIN; yigin.temizle();
  agirliklar[s] = 0; yigin.ekle(s, 0);
  while (yigin.boy) {
    const u = yigin.cikar(), dugumAgirligi = yigin.ust; if (bitti[u]) continue; bitti[u] = 1;
    for (let p = ag.komsuBaslangici[u]! * 3, son = ag.komsuBaslangici[u + 1]! * 3; p < son; p += 3) {
      const v = ag.komsular[p]!; if (bitti[v]) continue;
      const e = ag.komsular[p + 1]!, kenarKilometresi = ag.kenarMetre[e]! / 1000;
      const kenarAgirligi = mesafe ? kenarKilometresi : (kenarKilometresi / (serbestHiz(ag, e, arac) * akisOrani(ag, e, ag.komsular[p + 2]!, tablo, dakika))) * (oran ? oran.saat : 60) + (oran ? kenarKilometresi * oran.kilometre : 0);
      if (dugumAgirligi + kenarAgirligi < agirliklar[v]!) { agirliklar[v] = dugumAgirligi + kenarAgirligi; yigin.ekle(v, dugumAgirligi + kenarAgirligi); }
    }
  }
  return agirliklar;
}

// Noktadan yol ağına sokak bağlantısı (dakika, binek): ~18 km/sa, en çok 15 dk; araç katsayısına bölünür.
export const sokakBaglantisiDakika = (metre: number) => Math.min(15, (metre / 1000 / 18) * 60);

export interface Konum { boylam: number; enlem: number }
export interface TekRotaDuragi extends Konum {
  anahtar: string; ad: string; durakSuresiDakika: number;
  // Al-bırak çiftinin ucu: aynı çiftte bırakış alıştan önce gelemez.
  rol: 'al' | 'birak' | null; cift: number | null;
}
export interface TekRotaVarisi { anahtar: string; varis: number; ayrilis: number; sokakMetre: number }
export interface TekRotaPlani {
  sira: string[]; ayaklar: Ayak[]; varislar: TekRotaVarisi[]; fabrikaSokakMetre: number;
  toplamDakika: number; surusDakika: number; kilometre: number; maliyet: number; oranlar: MaliyetOranlari;
  uyarilar: string[];
}
export interface TekRotaSecenegi {
  gun: GunTipi; cikisDakika: number; arac: AracTuru; fabrikayaDon: boolean; siraKorunur: boolean; amac: Amac;
  oranlar?: Partial<MaliyetOranlari>;
}


// Durak sırası 9 durağa kadar tam arama (dal ve sınır), üstünde en yakın komşu + 2-opt; sonra zamana bağlı plan.
export function tekRotaPlani(ag: YolAgi, fabrika: Konum & { ad: string }, duraklar: readonly TekRotaDuragi[], secenek: TekRotaSecenegi): TekRotaPlani | null {
  if (!duraklar.length) return null;
  const oranlar: MaliyetOranlari = { ...VARSAYILAN_MALIYET[secenek.arac], ...secenek.oranlar };
  const ucuz = secenek.amac === 'maliyet', katsayi = ARAC_HIZ_KATSAYISI[secenek.arac];
  const noktalar: (Konum & { ad: string; durakSuresiDakika: number; anahtar: string })[] = [{ ...fabrika, durakSuresiDakika: 0, anahtar: '' }, ...duraklar];
  const dugumler = noktalar.map((p) => enYakinDugum(ag, [p.boylam, p.enlem]));
  const tlBedeli = (yolKilometresi: number, yolDakikasi: number) => yolKilometresi * oranlar.kilometre + (yolDakikasi / 60) * oranlar.saat;
  // once[i]: i'den önce ziyaret edilmesi gereken durağın sırası (noktalar dizisinde; 0 yok).
  const once = new Int32Array(noktalar.length);
  for (let i = 0; i < duraklar.length; i++) {
    const d = duraklar[i]!; if (d.rol !== 'birak' || d.cift === null) continue;
    const al = duraklar.findIndex((x) => x.cift === d.cift && x.rol === 'al');
    if (al >= 0) once[i + 1] = al + 1;
  }
  const kuralaUygun = (sira: number[]) => { const ziyaretEdildi = new Uint8Array(noktalar.length); for (const i of sira) { if (once[i] && !ziyaretEdildi[once[i]!]) return false; ziyaretEdildi[i] = 1; } return true; };
  const siraBul = (olcut: 'sure' | 'mesafe' | MaliyetOranlari): number[] => {
    let sira = duraklar.map((_, i) => i + 1);
    if (secenek.siraKorunur || duraklar.length < 2) return sira;
    const agirlikMatrisi = dugumler.map((d) => { const kaynakAgirliklari = tumuneAgirlik(ag, d.dugum, secenek.gun, secenek.cikisDakika, secenek.arac, olcut); return dugumler.map((hedef) => kaynakAgirliklari[hedef.dugum]!); });
    const durak = (i: number) => (olcut === 'sure' ? noktalar[i]!.durakSuresiDakika : 0);
    const bedel = (s: number[]) => { let c = 0, p = 0; for (const i of s) { c += agirlikMatrisi[p]![i]! + durak(i); p = i; } return c + (secenek.fabrikayaDon ? agirlikMatrisi[p]![0]! : 0); };
    if (duraklar.length <= EN_COK_TEK_ROTA_DURAGI) {
      let enIyi: number[] | null = null, enIyiBedel = Infinity; const yol: number[] = [], kullanildi = new Uint8Array(noktalar.length);
      const ara = (p: number, birikim: number) => {
        if (birikim >= enIyiBedel) return;
        if (yol.length === duraklar.length) { const c = birikim + (secenek.fabrikayaDon ? agirlikMatrisi[p]![0]! : 0); if (c < enIyiBedel) { enIyiBedel = c; enIyi = yol.slice(); } return; }
        for (const i of sira) {
          if (kullanildi[i] || (once[i] && !kullanildi[once[i]!])) continue;
          kullanildi[i] = 1; yol.push(i); ara(i, birikim + agirlikMatrisi[p]![i]! + durak(i)); yol.pop(); kullanildi[i] = 0;
        }
      };
      ara(0, 0); return enIyi ?? sira;
    }
    const kalan = new Set(sira); sira = []; let p = 0;
    while (kalan.size) {
      let enYakinSira = -1, enYakinAgirlik = Infinity;
      for (const i of kalan) if ((!once[i] || !kalan.has(once[i]!)) && agirlikMatrisi[p]![i]! < enYakinAgirlik) { enYakinAgirlik = agirlikMatrisi[p]![i]!; enYakinSira = i; }
      sira.push(enYakinSira); kalan.delete(enYakinSira); p = enYakinSira;
    }
    for (let iyilesti = true; iyilesti;) {
      iyilesti = false;
      for (let i = 0; i < sira.length - 1; i++) for (let j = i + 1; j < sira.length; j++) {
        const aday = sira.slice(0, i).concat(sira.slice(i, j + 1).reverse(), sira.slice(j + 1));
        if (kuralaUygun(aday) && bedel(aday) < bedel(sira) - 0.01) { sira = aday; iyilesti = true; }
      }
    }
    return sira;
  };
  // Ayak: amaca göre yol; maliyette en hızlı, en kısa ve en ucuz yoldan gerçek süreyle TL olarak ucuzu.
  const bellek = new Map<string, Ayak | null>();
  const ayakBul = (a: number, b: number, t: number): Ayak | null => {
    if (secenek.amac === 'mesafe') return enKisaYol(ag, a, b, secenek.gun, t, secenek.arac);
    if (!ucuz) return enHizliYol(ag, a, b, secenek.gun, t, secenek.arac);
    const anahtar = `${a}-${b}-${Math.round(t / 10)}`; if (bellek.has(anahtar)) return bellek.get(anahtar)!;
    let enIyi: Ayak | null = null;
    for (const y of [enHizliYol(ag, a, b, secenek.gun, t, secenek.arac), enKisaYol(ag, a, b, secenek.gun, t, secenek.arac), enKisaYol(ag, a, b, secenek.gun, t, secenek.arac, oranlar)]) {
      if (y && (!enIyi || tlBedeli(y.metre / 1000, y.dakika) < tlBedeli(enIyi.metre / 1000, enIyi.dakika))) enIyi = y;
    }
    bellek.set(anahtar, enIyi); return enIyi;
  };
  const kur = (sira: number[]): TekRotaPlani | null => {
    const dizi = [0, ...sira, ...(secenek.fabrikayaDon ? [0] : [])];
    const ayaklar: Ayak[] = [], varislar: TekRotaVarisi[] = [];
    let t = secenek.cikisDakika, surus = 0, toplamKilometre = 0;
    for (let i = 1; i < dizi.length; i++) {
      const a = dugumler[dizi[i - 1]!]!, b = dugumler[dizi[i]!]!;
      const cikis = sokakBaglantisiDakika(a.metre) / katsayi; t += cikis; surus += cikis;
      const ayak = ayakBul(a.dugum, b.dugum, t);
      if (!ayak) return null;
      ayaklar.push(ayak); t += ayak.dakika; surus += ayak.dakika; toplamKilometre += ayak.metre / 1000;
      const varisBaglantisi = sokakBaglantisiDakika(b.metre) / katsayi; t += varisBaglantisi; surus += varisBaglantisi;
      const nokta = noktalar[dizi[i]!]!, fabrikaMi = dizi[i] === 0;
      varislar.push({ anahtar: nokta.anahtar, varis: t, ayrilis: t + (fabrikaMi ? 0 : nokta.durakSuresiDakika), sokakMetre: b.metre });
      if (!fabrikaMi) t += nokta.durakSuresiDakika;
    }
    const toplam = t - secenek.cikisDakika;
    const uyarilar = kuralaUygun(sira) ? [] : sira
      .filter((i, k) => once[i] && !sira.slice(0, k).includes(once[i]!))
      .map((i) => `${noktalar[i]!.ad}: bırakış, alıştan (${noktalar[once[i]!]!.ad}) önce geliyor`);
    return {
      sira: sira.map((i) => noktalar[i]!.anahtar), ayaklar, varislar, fabrikaSokakMetre: dugumler[0]!.metre,
      toplamDakika: toplam, surusDakika: surus, kilometre: toplamKilometre, maliyet: tlBedeli(toplamKilometre, toplam) + oranlar.gunluk, oranlar, uyarilar,
    };
  };
  if (secenek.amac !== 'maliyet') return kur(siraBul(secenek.amac));
  // Maliyet: üç sıralama adayı gerçek (saate bağlı) maliyetle karşılaştırılır.
  const denenen = new Set<string>(); let enIyi: TekRotaPlani | null = null;
  for (const olcut of [oranlar, 'sure', 'mesafe'] as const) {
    const s = siraBul(olcut), k = s.join(); if (denenen.has(k)) continue; denenen.add(k);
    const p = kur(s); if (p && (!enIyi || p.maliyet < enIyi.maliyet)) enIyi = p;
  }
  return enIyi;
}

// Aynı rota, aynı yollarla, farklı çıkış saatlerinde toplam süre (her 15 dk).
export function cikisTaramasi(ag: YolAgi, plan: TekRotaPlani, gun: GunTipi, arac: AracTuru, ilk = 5 * 60, son = 22 * 60, adim = 15): { cikis: number; toplam: number }[] {
  const katsayi = ARAC_HIZ_KATSAYISI[arac], sonuc: { cikis: number; toplam: number }[] = [];
  for (let s = ilk; s <= son; s += adim) {
    let t = s;
    plan.ayaklar.forEach((ayak, i) => {
      t += sokakBaglantisiDakika(i ? plan.varislar[i - 1]!.sokakMetre : plan.fabrikaSokakMetre) / katsayi;
      t += ayakSuresi(ag, ayak.kenarlar, gun, t, arac);
      const v = plan.varislar[i]!;
      t += sokakBaglantisiDakika(v.sokakMetre) / katsayi + (v.ayrilis - v.varis);
    });
    sonuc.push({ cikis: s, toplam: t - s });
  }
  return sonuc;
}

// Rotada geçilen ana yollar: ardışık aynı adlar birleşir, 250 m altı parça öncekine katılır, 400 m altı gösterilmez.
export function yolOzeti(ag: YolAgi, ayaklar: readonly { kenarlar: readonly KenarAdimi[] }[]): { ad: string; metre: number }[] {
  const ham: { ad: string; metre: number }[] = [];
  for (const ayak of ayaklar) for (const { kenar } of ayak.kenarlar) {
    const ad = ag.kenarAdi[kenar]! >= 0 ? ag.adlar[ag.kenarAdi[kenar]!]! : '(adsız yol)';
    const son = ham[ham.length - 1];
    if (son && son.ad === ad) son.metre += ag.kenarMetre[kenar]!; else ham.push({ ad, metre: ag.kenarMetre[kenar]! });
  }
  const birlesik: { ad: string; metre: number }[] = [];
  for (const r of ham) {
    if (r.metre < 250 && birlesik.length) { birlesik[birlesik.length - 1]!.metre += r.metre; continue; }
    const son = birlesik[birlesik.length - 1];
    if (son && son.ad === r.ad) son.metre += r.metre; else birlesik.push({ ...r });
  }
  return birlesik.filter((r) => r.metre >= 400);
}

// Yolun çizgisi: [boylam, enlem] noktaları.
export function ayakCizgisi(ag: YolAgi, kenarlar: readonly KenarAdimi[]): [number, number][] {
  const noktalar: [number, number][] = [];
  for (const { kenar, yon } of kenarlar) {
    const geometriBasi = ag.geometriBaslangici[kenar]!, geometriBoyu = ag.geometriUzunlugu[kenar]!;
    for (let i = 0; i < geometriBoyu; i++) { const j = yon === 1 ? geometriBasi + i : geometriBasi + geometriBoyu - 1 - i; noktalar.push([ag.geometri[2 * j]!, ag.geometri[2 * j + 1]!]); }
  }
  return noktalar;
}

// Sürücünün telefonunda açılacak bağlantılar: yalnız adres üretilir, sunucu dış servise bağlanmaz.
const enlemBoylam = (k: Konum) => `${k.enlem.toFixed(6)},${k.boylam.toFixed(6)}`;
export function googleBaglantisi(sira: readonly Konum[], fabrika: Konum, fabrikayaDon: boolean): string {
  const hedef = fabrikayaDon ? fabrika : sira[sira.length - 1]!, ara = fabrikayaDon ? sira : sira.slice(0, -1);
  const baglanti = new URL('https://www.google.com/maps/dir/');
  baglanti.searchParams.set('api', '1'); baglanti.searchParams.set('origin', enlemBoylam(fabrika)); baglanti.searchParams.set('destination', enlemBoylam(hedef)); baglanti.searchParams.set('travelmode', 'driving');
  if (ara.length) baglanti.searchParams.set('waypoints', ara.slice(0, GOOGLE_ARA_DURAK_SINIRI).map(enlemBoylam).join('|'));
  return baglanti.toString();
}
export function yandexBaglantisi(sira: readonly Konum[], fabrika: Konum, fabrikayaDon: boolean): string {
  const noktalar = [fabrika, ...sira, ...(fabrikayaDon ? [fabrika] : [])];
  return `https://yandex.com.tr/harita/?rtext=${noktalar.map(enlemBoylam).join('~')}&rtt=auto`;
}

// Gün içi dakikayı "SS:DD" yazar (uyarı iletileri için).
export function saatMetni(dakika: number): string {
  const gunDakikasi = ((Math.round(dakika) % 1440) + 1440) % 1440;
  return `${String(Math.floor(gunDakikasi / 60)).padStart(2, '0')}:${String(gunDakikasi % 60).padStart(2, '0')}`;
}
