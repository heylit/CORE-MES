import type { Departman, Personel } from '../tipler.ts';
import { adSoyadMetni, gunEkle, gunMetni, ibanBicimi, ibanGecerli, sade, sonrakiSicil, tcknGecerli, ucretTarihte, ucretUygula } from './kurallar.ts';

// Personel içe aktarma: Excel'den yapıştırılan ya da CSV dosyasından gelen tablo okunur, sütunlar alanlara eşlenir, satırlar
// yeni / güncellenecek / atlanacak / hatalı diye ayrılır. Excel dosyası okunmaz (yeni paket gerekir; 202 a: bugünkü hal).

export const AKTARIM_ALANLARI = [
  ['isMerkezi', 'İş merkezi'], ['ad', 'Ad'], ['soyad', 'Soyad'], ['adsoyad', 'Ad soyad (birlikte)'], ['tckn', 'T.C. kimlik no'], ['sicilNo', 'Sicil no'],
  ['dogumTarihi', 'Doğum tarihi'], ['cinsiyet', 'Cinsiyet'], ['telefon', 'Telefon'], ['eposta', 'E-posta'], ['adres', 'Adres'], ['il', 'İl'],
  ['iseGiris', 'İşe giriş tarihi'], ['pozisyon', 'Pozisyon'], ['departman', 'Departman'], ['sozlesmeTuru', 'Sözleşme türü'],
  ['calismaSekli', 'Çalışma şekli'], ['egitim', 'Eğitim düzeyi'], ['brutMaas', 'Aylık brüt ücret'], ['iban', 'IBAN'], ['sgkNo', 'SGK sicil no'],
  ['oncekiKullanim', 'Kullanılmış yıllık izin (gün)'],
] as const;
export type AktarimAlani = (typeof AKTARIM_ALANLARI)[number][0];

const ESANLAMLI: Record<AktarimAlani, readonly string[]> = {
  isMerkezi: ['ismerkezi', 'ismerkezikodu', 'merkez', 'tesis', 'fabrika', 'isyeri'],
  ad: ['ad', 'adi', 'isim', 'name', 'firstname'],
  soyad: ['soyad', 'soyadi', 'soyisim', 'surname', 'lastname'],
  adsoyad: ['adsoyad', 'adisoyadi', 'adsoyadi', 'isimsoyisim', 'personel', 'calisan', 'personeladi'],
  tckn: ['tc', 'tckn', 'tckimlikno', 'tcno', 'kimlikno', 'tckimlik', 'tckimliknumarasi'],
  sicilNo: ['sicil', 'sicilno', 'personelno', 'personelsicil'],
  dogumTarihi: ['dogumtarihi', 'dogum', 'dogumt'],
  cinsiyet: ['cinsiyet', 'cinsiyeti'],
  telefon: ['telefon', 'tel', 'gsm', 'cep', 'ceptelefonu', 'telefonno'],
  eposta: ['eposta', 'email', 'mail', 'epostaadresi'],
  adres: ['adres', 'ikametadresi'],
  il: ['il', 'sehir'],
  iseGiris: ['isegiris', 'isegiristarihi', 'giristarihi', 'baslamatarihi', 'isebaslama'],
  pozisyon: ['pozisyon', 'gorev', 'gorevi', 'unvan', 'unvani'],
  departman: ['departman', 'departmani', 'bolum', 'birim', 'bolumu'],
  sozlesmeTuru: ['sozlesme', 'sozlesmeturu'],
  calismaSekli: ['calismasekli'],
  egitim: ['egitim', 'egitimdurumu', 'ogrenim', 'egitimduzeyi'],
  brutMaas: ['brut', 'brutucret', 'brutmaas', 'maas', 'ucret', 'aylikbrut', 'brutucreti'],
  iban: ['iban', 'ibanno'],
  sgkNo: ['sgk', 'sgkno', 'sgksicilno'],
  oncekiKullanim: ['kullanilanizin', 'oncekiizin', 'kullanilmisizin'],
};

// Ayırıcı ilk satırdan seçilir (sekme, noktalı virgül, virgül); tırnaklı hücrede satır sonu ve "" kaçışı desteklenir.
export function tabloAyristir(metin: string): string[][] {
  const text = String(metin ?? '').replace(/^﻿/, '');
  const ilk = text.split(/\r?\n/)[0] ?? '';
  const ayirici = (['\t', ';', ','] as const).map((d) => [d, ilk.split(d).length] as const).sort((a, b) => b[1] - a[1])[0]?.[0] ?? ';';
  const satirlar: string[][] = [];
  let satir: string[] = [];
  let hucre = '';
  let tirnak = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (tirnak) {
      if (ch === '"') {
        if (text[i + 1] === '"') { hucre += '"'; i += 1; } else tirnak = false;
      } else hucre += ch;
      continue;
    }
    if (ch === '"' && hucre === '') { tirnak = true; continue; }
    if (ch === ayirici) { satir.push(hucre); hucre = ''; continue; }
    if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i += 1;
      satir.push(hucre);
      hucre = '';
      if (satir.some((c) => c.trim())) satirlar.push(satir);
      satir = [];
      continue;
    }
    hucre += ch;
  }
  satir.push(hucre);
  if (satir.some((c) => c.trim())) satirlar.push(satir);
  return satirlar.map((r) => r.map((c) => c.trim()));
}

// GG.AA.YYYY, GG/AA/YY, YYYY-AA-GG ya da Excel gün sayısı; okunamazsa null, boşsa ''.
export function tarihAyristir(s: string): string | null {
  const t = String(s ?? '').trim();
  if (!t) return '';
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(t);
  if (m) return gunMetni(new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  m = /^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/.exec(t);
  if (m) {
    const yy = Number(m[3]);
    const y = yy < 100 ? (yy > 30 ? 1900 : 2000) + yy : yy;
    const d = new Date(y, Number(m[2]) - 1, Number(m[1]));
    return d.getDate() === Number(m[1]) ? gunMetni(d) : null;
  }
  if (/^\d{4,5}(\.\d+)?$/.test(t) && Number(t) > 3000 && Number(t) < 80000) return gunEkle('1899-12-30', Math.floor(Number(t)));
  return null;
}

// "48.000,00", "48,000.00", "48000 TL" ve "₺48.000" okunur; okunamazsa 0.
export function paraAyristir(s: string): number {
  let t = String(s ?? '').replace(/[₺\s]|tl/gi, '');
  if (!t) return 0;
  const v = t.lastIndexOf(',');
  const n = t.lastIndexOf('.');
  if (v >= 0 && n >= 0) t = v > n ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (v >= 0) t = /,\d{1,2}$/.test(t) ? t.replace(',', '.') : t.replace(/,/g, '');
  else if (n >= 0 && /^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
  const r = Number.parseFloat(t);
  return Number.isFinite(r) ? r : 0;
}

export function alanTahmini(baslik: string): AktarimAlani | '' {
  const n = sade(baslik).replace(/[^a-z0-9]/g, '');
  const girdiler = Object.entries(ESANLAMLI) as [AktarimAlani, readonly string[]][];
  for (const [k, e] of girdiler) if (e.includes(n)) return k;
  for (const [k, e] of girdiler) if (e.some((x) => x.length >= 4 && n.startsWith(x))) return k;
  return '';
}

// Aynı alana ikinci sütun eşlenmez (ilk sütun alır).
export function eslemeTahmini(basliklar: readonly string[]): (AktarimAlani | '')[] {
  const goruldu = new Set<string>();
  return basliklar.map((h) => {
    const f = alanTahmini(h);
    if (!f || goruldu.has(f)) return '';
    goruldu.add(f);
    return f;
  });
}

export function secenekEsle(v: string, secenekler: readonly string[]): string {
  if (!v) return '';
  const n = sade(v);
  return secenekler.find((o) => sade(o) === n) ?? secenekler.find((o) => sade(o).startsWith(n) || n.startsWith(sade(o).slice(0, 3))) ?? '';
}

export type AktarimEylemi = 'yeni' | 'guncelle' | 'atla' | 'hata';
export interface AktarimSatiri { satir: number; ad: string; eylem: AktarimEylemi; hatalar: string[]; uyarilar: string[]; kayit: Personel | null; eslesen: Personel | null }
export interface AktarimSecenegi { departmanOlustur: boolean; eslesen: 'atla' | 'guncelle' }
export interface AktarimBaglami {
  gun: string;
  personeller: readonly Personel[];
  departmanlar: readonly Departman[];
  isMerkezleri: readonly { id: number; kod: string; ad: string }[];
  secenekler: Partial<Record<'cinsiyet' | 'sozlesmeTuru' | 'calismaSekli' | 'egitim', readonly string[]>>;
  yeniKimlik: (tur: 'emp' | 'dept') => string;
  yakaTahmini?: (pozisyon: string) => string;
  kademeTahmini?: (pozisyon: string) => string;
}
export interface AktarimHazirligi { satirlar: AktarimSatiri[]; yeniDepartmanlar: Departman[] }

const KOPYA_ALANLAR = ['telefon', 'eposta', 'adres', 'il', 'pozisyon', 'sgkNo'] as const;
const SECENEKLI_ALANLAR = ['cinsiyet', 'sozlesmeTuru', 'calismaSekli', 'egitim'] as const;

export function aktarimHazirla(tablo: readonly string[][], esleme: readonly (AktarimAlani | '')[], sec: AktarimSecenegi, b: AktarimBaglami): AktarimHazirligi {
  const [baslik = [], ...govde] = tablo;
  const depAdla = new Map(b.departmanlar.map((d) => [sade(d.ad), d]));
  const yeniDep = new Map<string, Departman>();
  let sicil = Number(sonrakiSicil(b.personeller)) - 1;

  const satirlar = govde.map((r, i): AktarimSatiri => {
    const v: Partial<Record<AktarimAlani, string>> = {};
    baslik.forEach((_, c) => { const f = esleme[c]; const x = r[c]; if (f && x !== undefined && x !== '') v[f] = x; });
    const hatalar: string[] = [];
    const uyarilar: string[] = [];
    const o: Personel = { id: '', kind: 'emp' };
    if (v.adsoyad && !v.ad) { const p = v.adsoyad.split(/\s+/); o.soyad = p.pop(); o.ad = p.join(' '); }
    if (v.ad) o.ad = v.ad;
    if (v.soyad) o.soyad = v.soyad;
    if (!o.ad || !o.soyad) hatalar.push('Ad ve soyad gerekli');
    if (v.tckn) { const tc = v.tckn.replace(/\D/g, ''); if (tcknGecerli(tc)) o.tckn = tc; else uyarilar.push('T.C. kimlik no geçersiz, boş bırakıldı'); }
    if (v.iban) { const ib = v.iban.replace(/\s/g, '').toUpperCase(); if (ibanGecerli(ib)) o.iban = ibanBicimi(ib); else uyarilar.push('IBAN geçersiz, boş bırakıldı'); }
    for (const k of ['dogumTarihi', 'iseGiris'] as const) {
      const ham = v[k];
      if (!ham) continue;
      const d = tarihAyristir(ham);
      if (d) o[k] = d; else uyarilar.push(`${k === 'iseGiris' ? 'İşe giriş' : 'Doğum'} tarihi okunamadı`);
    }
    if (!o.iseGiris) uyarilar.push('İşe giriş tarihi yok (izin ve kıdem hesaplanamaz)');
    if (v.brutMaas) { const m = paraAyristir(v.brutMaas); if (m > 0) o.brutMaas = m; else uyarilar.push('Ücret okunamadı'); }
    if (v.oncekiKullanim) o.oncekiKullanim = Number.parseFloat(v.oncekiKullanim.replace(',', '.')) || 0;
    for (const k of KOPYA_ALANLAR) { const x = v[k]; if (x) o[k] = x; }
    if (v.sicilNo) o.sicilNo = String(v.sicilNo);
    for (const k of SECENEKLI_ALANLAR) {
      const x = v[k];
      if (!x) continue;
      const n = secenekEsle(x, b.secenekler[k] ?? []);
      if (n) o[k] = n; else uyarilar.push(`${k}: “${x}” tanınmadı`);
    }
    if (v.departman) {
      const anahtar = sade(v.departman);
      let d = depAdla.get(anahtar) ?? yeniDep.get(anahtar);
      if (!d && sec.departmanOlustur) { d = { id: b.yeniKimlik('dept'), kind: 'dept', ad: v.departman.trim() }; yeniDep.set(anahtar, d); }
      if (d) o.departmanId = d.id; else uyarilar.push('Departman bulunamadı');
    }
    if (o.pozisyon) {
      if (b.yakaTahmini) o.yakaTipi = b.yakaTahmini(o.pozisyon);
      if (b.kademeTahmini) o.kademe = b.kademeTahmini(o.pozisyon);
    }
    // İş merkezi zorunludur: kod ya da adla eşleşir; tek seçenek varsa o kullanılır.
    if (v.isMerkezi) {
      const anahtar = sade(v.isMerkezi);
      const m = b.isMerkezleri.find((x) => sade(x.kod) === anahtar || sade(x.ad) === anahtar);
      if (m) o.isMerkeziId = m.id; else hatalar.push(`İş merkezi “${v.isMerkezi}” tanınmadı`);
    } else if (b.isMerkezleri.length === 1 && b.isMerkezleri[0]) o.isMerkeziId = b.isMerkezleri[0].id;
    else hatalar.push('İş merkezi gerekli');

    const tamAd = sade(`${o.ad ?? ''} ${o.soyad ?? ''}`);
    const eslesen = b.personeller.find((e) => (o.tckn && e.tckn === o.tckn) || (o.sicilNo && e.sicilNo === o.sicilNo)
      || (sade(adSoyadMetni(e)) === tamAd && (!o.iseGiris || e.iseGiris === o.iseGiris))) ?? null;
    const eylem: AktarimEylemi = hatalar.length ? 'hata' : eslesen ? (sec.eslesen === 'guncelle' ? 'guncelle' : 'atla') : 'yeni';
    let kayit: Personel | null = null;
    if (eylem === 'yeni') {
      sicil += 1;
      kayit = { ...o, id: b.yeniKimlik('emp'), kind: 'emp', durum: 'Aktif', sicilNo: o.sicilNo || String(sicil) };
      if (kayit.brutMaas) kayit.ucretGecmisi = [{ tarih: kayit.iseGiris || b.gun, brut: Number(kayit.brutMaas), neden: 'İşe giriş' }];
    }
    if (eylem === 'guncelle' && eslesen) {
      kayit = { ...eslesen };
      for (const [k, x] of Object.entries(o)) if (k !== 'id' && x !== '' && x !== undefined) (kayit as unknown as Record<string, unknown>)[k] = x;
      if (o.brutMaas && Number(o.brutMaas) !== ucretTarihte(eslesen, b.gun)) kayit = ucretUygula(kayit, b.gun, Number(o.brutMaas), 'Düzeltme', 'Aktarım', b.gun);
    }
    return { satir: i + 2, ad: `${o.ad ?? ''} ${o.soyad ?? ''}`.trim() || '—', eylem, hatalar, uyarilar, kayit, eslesen };
  });

  // Yalnız alınan satırların kullandığı yeni departmanlar oluşturulur.
  const kullanilan = new Set(satirlar.filter((s) => s.kayit && (s.eylem === 'yeni' || s.eylem === 'guncelle')).map((s) => s.kayit?.departmanId));
  return { satirlar, yeniDepartmanlar: [...yeniDep.values()].filter((d) => kullanilan.has(d.id)) };
}

// Kaydedilecek kayıtlar: önce yeni departmanlar (personel onlara bağlanır), sonra personel.
export function aktarimKayitlari(h: AktarimHazirligi): (Personel | Departman)[] {
  const personel = h.satirlar.filter((s) => s.kayit && (s.eylem === 'yeni' || s.eylem === 'guncelle')).map((s) => s.kayit as Personel);
  return [...h.yeniDepartmanlar, ...personel];
}

export const AKTARIM_SABLONU = {
  basliklar: ['Ad', 'Soyad', 'T.C. Kimlik No', 'Sicil No', 'Doğum Tarihi', 'Cinsiyet', 'Telefon', 'E-posta', 'İşe Giriş Tarihi', 'Pozisyon', 'Departman', 'Sözleşme Türü', 'Brüt Ücret', 'IBAN', 'Kullanılmış İzin'],
  ornek: ['Ayşe', 'Yılmaz', '', '', '15.04.1990', 'Kadın', '0500 000 00 00', 'ayse@example.com', '01.03.2021', 'Muhasebe Uzmanı', 'Finans', 'Belirsiz süreli', '48.000,00', '', '6'],
} as const;
