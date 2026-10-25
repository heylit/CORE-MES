import { icsKatla } from '../disa-aktar.ts';
import { KDUR, KSON } from '../icerik/kalibrasyon.ts';
import { KYSB, ROLES, RT, RTF, type RolTanimi } from '../icerik/kys-yapi.ts';
import { PTYPE } from '../icerik/programlar.ts';
import { cihazDurumu, cihazVadesi } from '../kurallar/kalibrasyon.ts';
import { gostergeAylari, gostergeSon, kysSonrakiGozden, rolAdi } from '../kurallar/kys.ts';
import { programKullaniliyor } from '../kurallar/puan.ts';
import { yeniKimlik } from '../normalize.ts';
import { ayEkle, bugunTarihi, gunEkle, pazartesi, tarihMetni } from '../tarih.ts';
import type { Cihaz, DokumanKaydi, Kys, KysMaddesi, Profil, ProgramKodu, Surec, UretilenDokuman } from '../tipler.ts';
import { DOCT } from './dokuman-sablonlari.ts';

// KYS'nin saf yordamları: doküman kodu, şablon değişkenleri, yayın ve revizyon, klasör ağacı, görev tanımı metni, takvim dosyaları.
// Prototip karşılıkları (denetim-hazirlik.html 3830-4330) her işlevin üstünde yazılıdır.

export type DokumanGrubu = 'temel' | 'pr' | 'form' | 'surec' | 'gorev' | 'as';
export interface DokumanSablonu {
  id: string; type: string; name: string; bl: string; g: DokumanGrubu;
  secs: readonly (readonly [string, string, string])[];
  nosec?: number; hint?: string; land?: number; dyn?: number;
}

export const DTYPES: readonly (readonly [string, string, string])[] = [
  ['EL', 'El kitabı', 'İsteğe bağlı; kapsam, politika ve süreç haritasını bir araya getirir'],
  ['PR', 'Prosedür / süreç tanımı', 'Süreç kartı ve süreç kuralları'],
  ['TL', 'Talimat', 'İş, makine, ölçüm ve muayene talimatları'],
  ['FR', 'Form', 'Kayıt oluşturmak için boş şablon'],
  ['LS', 'Liste', 'Ana liste, cihaz listesi, onaylı tedarikçi listesi'],
  ['PL', 'Plan', 'Kalibrasyon, bakım, eğitim, iç denetim planları'],
  ['TB', 'Tablo / matris', 'Risk tablosu, yetkinlik matrisi'],
  ['DK', 'Dış kaynaklı', 'Müşteri şartnamesi, standart, mevzuat'],
  ['GT', 'Görev tanımı', 'Rol bazlı görev, yetki ve sorumluluklar'],
];
// Doküman ana listesine elle eklenen türler (prototipte GT sonradan eklenir, ekleme listesinde de görünür).
export const turAdi = (t: string): string => DTYPES.find((q) => q[0] === t)?.[1] ?? t;

export const FOLDERS: readonly (readonly [string, readonly string[] | null])[] = [
  ['00_KYS_Yonetimi', ['01_Kapsam_Politika_Hedefler', '02_Organizasyon_Gorev_Tanimlari', '03_Baglam_Risk_Firsat', '04_Yonetimin_Gozden_Gecirmesi']],
  ['01_Surecler', null],
  ['02_Formlar_Sablonlar', []],
  ['03_Kayitlar', ['{YIL}']],
  ['04_Dis_Kaynakli_Dokumanlar', ['Standartlar', 'Musteri_Sartnameleri', 'Mevzuat']],
  ['05_Denetimler', ['Ic_Denetim', 'Belgelendirme', 'Musteri_Denetimleri']],
  ['06_DOF_Iyilestirme', []],
  ['07_Egitim_Yetkinlik', []],
  ['08_Olcum_Kalibrasyon', []],
  ['99_Arsiv_Gecersiz', ['Eski_Revizyonlar']],
];

export const RETAIN: readonly (readonly [string, string, string])[] = [
  ['Muayene, test ve serbest bırakma kayıtları', 'Havacılık/savunmada çoğunlukla 10 yıl veya daha uzun; müşteri şartı esas', 'Kalite'],
  ['İş emri, rota kartı, izlenebilirlik kayıtları', 'Ürün ömrü veya müşteri şartı', 'Üretim / Kalite'],
  ['FAI raporları (AS9100)', 'Parça üretimde olduğu sürece ve sonrasında müşteri şartı kadar', 'Kalite'],
  ['Uygunsuzluk ve DÖF kayıtları', 'En az 5 yıl', 'KYS sorumlusu'],
  ['Kalibrasyon sertifikaları', 'Cihaz kullanımda olduğu sürece + 2 yıl', 'Kalibrasyon sorumlusu'],
  ['İç denetim ve YGG kayıtları', 'En az bir belgelendirme döngüsü (3 yıl) + 1 yıl', 'KYS sorumlusu'],
  ['Eğitim ve yetkinlik kayıtları', 'Çalışan firmada olduğu sürece + 2 yıl', 'İK'],
  ['Tedarikçi değerlendirme kayıtları', 'Tedarikçi aktif olduğu sürece + 3 yıl', 'Satınalma'],
  ['Teklif ve sözleşme gözden geçirme kayıtları', 'Sözleşme süresi + garanti süresi', 'Satış'],
];

export const DCRULES: readonly (readonly [string, string])[] = [
  ['Hazırlama', 'Dokümanı süreç sahibi hazırlar; kod ana listeden alınır, şablon kullanılır.'],
  ['Onay', 'Yayından önce yetkili kişi onaylar. Onaysız doküman sahada kullanılmaz.'],
  ['Dağıtım', 'Güncel revizyon, kullanılacağı yerde erişilebilir olmalı (basılı ya da ekran). Kimde olduğu bilinmeli.'],
  ['Revizyon', 'Değişiklik nedeni yazılır, revizyon numarası ve tarihi artırılır, değişen kısım belirtilir.'],
  ['Eski revizyonlar', "Sahadan toplanır; saklanacaksa 'GEÇERSİZ' işaretlenip arşive alınır."],
  ['Dış kaynaklı doküman', 'Müşteri şartnamesi ve standartlar listelenir, revizyonları izlenir.'],
  ['Kayıtlar', 'Okunaklı, kolay bulunur, yetkisiz değişikliğe karşı korunur. Düzeltme tek çizgiyle, tarih ve paraf ile yapılır; silme ve daksil kullanılmaz.'],
  ['Elektronik kayıt', 'Yetkilendirme ve düzenli yedekleme; geri yükleme testi yapılır.'],
];

export const STAMPS: Readonly<Record<Kys['stamp'], string>> = { '': 'Damga yok', kontrollu: 'KONTROLLÜ KOPYA', kontrolsuz: 'KONTROLSÜZ KOPYA', taslak: 'TASLAK' };

export const DGROUPS: readonly (readonly [DokumanGrubu, string])[] = [
  ['temel', 'Temel dokümanlar'], ['pr', 'Prosedürler'], ['form', 'Formlar ve listeler'], ['surec', 'Süreç kartları'], ['gorev', 'Görev tanımları'], ['as', 'AS9100 ekleri'],
];

// fmtNum, fmtVal, tgtText, monthName
export const sayiMetni = (v: number): string => (Math.round(v * 100) / 100).toLocaleString('tr-TR');
export function degerMetni(v: number, u: string): string {
  const s = sayiMetni(v);
  return u === '%' ? `%${s}` : u ? `${s} ${u}` : s;
}
export const hedefMetni = (p: Surec): string => (p.target === '' ? '' : `${p.dir === 'le' ? '≤ ' : '≥ '}${degerMetni(p.target, p.unit)}`);
export const ayAdi = (m: string): string => new Date(`${m}-01T00:00:00`).toLocaleDateString('tr-TR', { month: 'short', year: 'numeric' });

// translit: klasör ve dosya adı için ASCII.
const TR: Readonly<Record<string, string>> = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' };
export const asciiAd = (x: string): string =>
  String(x).replace(/[çÇğĞıİöÖşŞüÜ]/g, (c) => TR[c] ?? c).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);

// kpref
export const kodOneki = (k: Kys): string => k.prefix.trim() || 'KYS';

// folderTree: süreç klasörleri tanımlı süreçlerden, yoksa tipik süreçlerden.
export function klasorAgaci(k: Kys, bugun: string = bugunTarihi()): [string, string[]][] {
  const yil = bugun.slice(0, 4);
  let procs = k.procs.map((p) => asciiAd(p.name)).filter(Boolean);
  if (!procs.length) procs = ['Satis', 'Planlama', 'Satinalma', 'Uretim', 'Kalite_Kontrol', 'Sevkiyat', 'Insan_Kaynaklari', 'Bakim', 'Kalibrasyon'];
  return FOLDERS.map(([ad, alt]) => [
    ad,
    alt === null ? ['00_Prosedurler', ...procs.map((p, i) => `${String(i + 1).padStart(2, '0')}_${p}`)] : alt.map((x) => x.replace('{YIL}', yil)),
  ]);
}
export const kokKlasor = (firma: string): string => `${asciiAd(firma) || 'Firma'}_KYS`;

// kbat: Windows'ta klasörleri açan toplu iş dosyası.
export function klasorBetigi(k: Kys, firma: string): string {
  const L = ['@echo off', 'chcp 65001 >nul', `set "KOK=${kokKlasor(firma)}"`];
  for (const [ad, alt] of klasorAgaci(k)) {
    if (!alt.length) L.push(`mkdir "%KOK%\\${ad}" 2>nul`);
    for (const x of alt) L.push(`mkdir "%KOK%\\${ad}\\${x}" 2>nul`);
  }
  L.push('mkdir "%KOK%\\99_Arsiv_Gecersiz" 2>nul', 'echo Klasor yapisi olusturuldu: %KOK%', 'pause');
  return `${L.join('\r\n')}\r\n`;
}
// ktree
export const klasorMetni = (k: Kys, firma: string): string =>
  [kokKlasor(firma), ...klasorAgaci(k).flatMap(([ad, alt]) => [`  ${ad}`, ...alt.map((x) => `    ${x}`)])].join('\n');

// Doküman ana listesi: yapı taşlarına girilen kodlar (elle eklenmemişse) ve elle eklenenler, koda göre sıralı.
export interface AnaListeSatiri {
  code: string; name: string; type: string; rev: string; date: string; owner: string; loc: string;
  src: 'blok' | 'el'; bid?: string; id?: string; gen?: string;
}
export function anaListe(k: Kys): AnaListeSatiri[] {
  const elle = new Set(k.docs.filter((x) => x.code).map((x) => x.code));
  const oto: AnaListeSatiri[] = [];
  for (const b of KYSB) {
    const it = k.items[b.id];
    if (it?.code && !elle.has(it.code)) oto.push({ code: it.code, name: b.n, type: b.t, rev: it.rev, date: it.date, owner: it.owner, loc: it.note, src: 'blok', bid: b.id });
  }
  const el = k.docs.map((d): AnaListeSatiri => ({
    code: d.code, name: d.name, type: turAdi(d.type), rev: d.rev, date: d.date, owner: d.owner, loc: d.loc, src: 'el', id: d.id, gen: d.gen,
  }));
  return oto.concat(el).sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}
// kcsv: sıralama prototipteki gibi kaynak sırasıdır (önce yapı taşları).
export function anaListeCsvSatirlari(k: Kys): string[][] {
  const elle = new Set(k.docs.filter((x) => x.code).map((x) => x.code));
  const rows = [['Kod', 'Doküman', 'Tür', 'Revizyon', 'Tarih', 'Sorumlu', 'Yer']];
  for (const b of KYSB) {
    const it = k.items[b.id];
    if (it?.code && !elle.has(it.code)) rows.push([it.code, b.n, b.t, it.rev, it.date, it.owner, it.note]);
  }
  for (const x of k.docs) rows.push([x.code, x.name, turAdi(x.type), x.rev, x.date, x.owner, x.loc]);
  return rows;
}

// kdadd: kod boşsa önek-tür-sıra önerilir; sıra o türdeki elle eklenenler ve yapı taşı kodlarından sayılır.
export interface ElleDokuman { type: string; code: string; name: string; rev: string; owner: string; loc: string }
export function elleDokumanKodu(k: Kys, type: string): string {
  const on = `${kodOneki(k)}-${type}-`;
  const used = k.docs.filter((x) => x.type === type).length + KYSB.filter((b) => (k.items[b.id]?.code ?? '').startsWith(on)).length;
  return on + String(used + 1).padStart(3, '0');
}
export function elleDokumanEkle(k: Kys, g: ElleDokuman, bugun: string = bugunTarihi()): DokumanKaydi {
  const code = (g.code.trim() || elleDokumanKodu(k, g.type)).slice(0, 40);
  const kayit: DokumanKaydi = {
    id: `d${yeniKimlik()}`, code, name: g.name.trim().slice(0, 200), type: g.type, rev: g.rev.trim().slice(0, 10) || '00', date: bugun,
    owner: g.owner.trim().slice(0, 100), loc: g.loc.trim().slice(0, 200), gen: '',
  };
  k.docs.push(kayit);
  return kayit;
}

// roleText: kopyalanan görev tanımı metni (ardışık boş satır tekilleşir).
export function gorevMetni(r: RolTanimi, k: Kys, firma: string): string {
  const a = k.roles[r.k];
  const L = [
    `GÖREV TANIMI: ${r.n.toLocaleUpperCase('tr')}`, firma ? `Firma: ${firma}` : '', a?.kisi ? `Görevli: ${a.kisi}` : '', a?.vekil ? `Vekili: ${a.vekil}` : '',
    `Bağlı olduğu: ${r.b}`, '', `Amaç: ${r.a}`, '', 'Sorumluluklar:', ...r.s.map((x) => `- ${x}`), '', 'Yetkiler:', ...r.y.map((x) => `- ${x}`),
    '', `Yetkinlik şartları: ${r.c}`, '', 'Hazırlayan / Onaylayan / Tarih: ______________',
  ];
  return L.filter((x, i, arr) => x !== '' || arr[i - 1] !== '').join('\n');
}

// --- Doküman üretici ---

// dynDocs, allDocs, docById
export function dinamikDokumanlar(k: Kys): DokumanSablonu[] {
  return [
    ...k.procs.map((p): DokumanSablonu => ({ id: `surec:${p.id}`, type: 'PR', name: `Süreç kartı: ${p.name}`, bl: 'b44', g: 'surec', secs: [['sk', '', `{SUREC_KARTI:${p.id}}`]], nosec: 1, dyn: 1 })),
    ...ROLES.map((r): DokumanSablonu => ({ id: `gorev:${r.k}`, type: 'GT', name: `Görev tanımı: ${r.n}`, bl: 'b53', g: 'gorev', secs: [['gt', '', `{GOREV:${r.k}}`]], nosec: 1, dyn: 1 })),
  ];
}
export const butunDokumanlar = (k: Kys): DokumanSablonu[] => [...DOCT, ...dinamikDokumanlar(k)];
export const dokumanBul = (k: Kys, id: string): DokumanSablonu | undefined => butunDokumanlar(k).find((d) => d.id === id);

export const bosUretilen = (): UretilenDokuman => ({ code: '', rev: '00', pub: '', date: '', prep: '', appr: '', st: '', secs: {}, hist: [] });
// GD: kayıtta yoksa taslak nesne açılır (yalnız değiştirilen taslakta çağrılır).
export function uretilen(k: Kys, id: string): UretilenDokuman {
  const v = k.gd[id];
  if (v) return v;
  const y = bosUretilen();
  k.gd[id] = y;
  return y;
}

// allCodes, nextCode: önekli türün en büyük sırasından bir fazlası.
export function sonrakiKod(k: Kys, type: string): string {
  const on = `${kodOneki(k)}-${type}-`;
  const kodlar = [...k.docs.map((d) => d.code), ...Object.values(k.items).map((i) => i.code), ...Object.values(k.gd).map((g) => g.code)].filter(Boolean);
  let mx = 0;
  for (const c of kodlar) {
    if (!c.startsWith(on)) continue;
    const n = parseInt(c.slice(on.length), 10);
    if (n > mx) mx = n;
  }
  return on + String(mx + 1).padStart(3, '0');
}

// Kütüphane açılışında kodu olmayan şablona kod verilir (prototip kysUret); değişen varsa true.
export function sablonKodlariniVer(k: Kys): boolean {
  let degisti = false;
  for (const d of DOCT) {
    const g = uretilen(k, d.id);
    if (!g.code) { g.code = sonrakiKod(k, d.type); degisti = true; }
  }
  return degisti;
}
export const kodlariEksik = (k: Kys): boolean => DOCT.some((d) => !k.gd[d.id]?.code);

// docEditor açılışı: kod, taslak durumu, hazırlayan (KYS sorumlusu) ve onaylayan (üst yönetim) atanır.
export function duzenleyiciAc(k: Kys, d: DokumanSablonu): boolean {
  const g = uretilen(k, d.id);
  let degisti = false;
  if (!g.code) { g.code = sonrakiKod(k, d.type); degisti = true; }
  if (!g.st) {
    g.st = 'taslak';
    if (!g.prep) g.prep = k.roles['kys']?.kisi ?? '';
    if (!g.appr) g.appr = k.roles['ust']?.kisi ?? '';
    degisti = true;
  }
  return degisti;
}
export const duzenleyiciAcikMi = (k: Kys, d: DokumanSablonu): boolean => !!k.gd[d.id]?.code && !!k.gd[d.id]?.st;

export type DokumanDurumKodu = 'yok' | 'taslak' | 'yayin';
export function dokumanDurumu(k: Kys, id: string): { k: DokumanDurumKodu; t: string } {
  const g = k.gd[id];
  if (!g?.st) return { k: 'yok', t: 'Oluşturulmadı' };
  if (g.st === 'yayin') return { k: 'yayin', t: `Yürürlükte · Rev. ${g.rev}` };
  return { k: 'taslak', t: 'Taslak' };
}
// docUsed: AS9100 ekleri yalnız AS9100 kullanılıyorsa sayılır.
export const dokumanKullaniliyor = (d: DokumanSablonu, profil: Profil, program: ProgramKodu): boolean =>
  d.g !== 'as' || programKullaniliyor(profil, 'as9100', program);

// publishDoc: ilk yayın ya da revizyon; ana listedeki satır ve bağlı yapı taşı güncellenir.
export function yayinla(k: Kys, d: DokumanSablonu, not: string, bugun: string = bugunTarihi()): void {
  const g = uretilen(k, d.id);
  if (g.st !== 'yayin') {
    g.st = 'yayin';
    g.pub = g.pub || bugun;
    g.date = bugun;
    if (!g.hist.length) g.hist.push({ rev: g.rev || '00', date: bugun, note: not || 'İlk yayın' });
  } else {
    const n = parseInt(g.rev, 10);
    g.rev = String(Number.isNaN(n) ? 1 : n + 1).padStart(2, '0');
    g.date = bugun;
    g.hist.push({ rev: g.rev, date: bugun, note: not || 'Revizyon' });
  }
  const satir = { code: g.code, name: d.name, type: d.type, rev: g.rev, date: g.date, owner: g.prep, loc: 'Doküman üretici', gen: d.id };
  const ex = k.docs.find((x) => x.gen === d.id);
  if (ex) Object.assign(ex, satir);
  else k.docs.push({ id: `d${yeniKimlik()}`, ...satir });
  if (d.bl) {
    const it: KysMaddesi = k.items[d.bl] ?? { st: 0, date: '', code: '', rev: '', owner: '', note: '' };
    k.items[d.bl] = it;
    it.st = 2;
    it.date = bugun;
    if (d.g !== 'surec' && d.g !== 'gorev') { it.code = g.code; it.rev = g.rev; }
    if (!it.owner) it.owner = g.prep;
  }
}

// --- Şablon değişkenleri (expandTok) ---

export interface MetinBaglami { profil: Profil; cihazlar: readonly Cihaz[] }

const rolEtiketi = (k: Kys, rk: string, t: string): string => { const r = k.roles[rk]; return r?.kisi ? `${t} (${r.kisi})` : t; };
function degiskenler(p: Profil): Record<string, string> {
  const P = p.profile;
  return {
    firma: P.firma || '[Firma adı]', tesis: P.tesis || '[Saha / adres]', tesisSatir: P.tesis ? ` (${P.tesis})` : '',
    kapsam: P.kapsam || '[KYS kapsamını Profil sayfasına veya buraya yazın]', kys: rolEtiketi(p.kys, 'kys', 'KYS sorumlusu'),
    gm: rolEtiketi(p.kys, 'ust', 'Genel Müdür'), yil: bugunTarihi().slice(0, 4),
  };
}
const refDoc = (k: Kys, id: string): string => k.gd[id]?.code || dokumanBul(k, id)?.name || id;
const refDocN = (k: Kys, id: string): string => {
  const g = k.gd[id];
  return (g?.code ? `${g.code} ` : '') + (dokumanBul(k, id)?.name ?? id);
};
export function tabloSatirlari(bas: readonly string[], rows: readonly (readonly (string | number | null | undefined)[])[]): string {
  const hucre = (c: string | number | null | undefined) => String(c ?? '').replace(/\|/g, '/').replace(/\n/g, ' ');
  return `| ${bas.join(' | ')} |\n${rows.map((r) => `| ${r.map(hucre).join(' | ')} |`).join('\n')}`;
}

// kalTable: ölçü aletleri Kalibrasyon modülünden gelir (329 a); hurda dışındakiler, cihaz numarasına göre.
function kalTablosu(cihazlar: readonly Cihaz[]): string {
  const D = cihazlar.filter((d) => d.st !== 'hurda').slice().sort((a, b) => (a.no < b.no ? -1 : 1));
  if (!D.length) {
    return `| Cihaz no | Cihaz adı / tip | Ölçüm aralığı | Çözünürlük | Yeri | Periyot | Son kalibrasyon | Sonraki | Sonuç |\n${
      Array.from({ length: 10 }, () => '| | | | | | | | | |').join('\n')}`;
  }
  return tabloSatirlari(['Cihaz no', 'Cihaz adı / tip', 'Ölçüm aralığı', 'Çözünürlük', 'Yeri', 'Periyot', 'Son kalibrasyon', 'Sonraki', 'Durum'], D.map((d) => {
    const st = cihazDurumu(d), n = cihazVadesi(d);
    return [d.no, d.ad + (d.marka ? ` (${d.marka})` : ''), d.aralik, d.coz, d.yer, `${String(d.per)} ay`, d.last ? tarihMetni(d.last) : '', n ? tarihMetni(n) : '',
      st.k === 'pasif' ? KDUR[d.st] : (d.res ? `${KSON[d.res]} · ` : '') + st.t];
  }));
}

export function degiskenAc(t: string, c: MetinBaglami): string {
  const K = c.profil.kys, V = degiskenler(c.profil);
  let s = t.replace(/\{refn:([a-z_]+)\}/g, (_, id: string) => refDocN(K, id));
  s = s.replace(/\{ref:([a-z_]+)\}/g, (_, id: string) => refDoc(K, id));
  s = s.replace(/\{(firma|tesis|tesisSatir|kapsam|kys|gm|yil)\}/g, (_, k: string) => V[k] ?? '');
  s = s.replace('{ROLLER}', () => tabloSatirlari(['Rol', 'Görevli', 'Vekili'], ROLES.map((r) => [r.n, K.roles[r.k]?.kisi ?? '', K.roles[r.k]?.vekil ?? ''])));
  s = s.replace('{SUREC_TABLOSU}', () => (K.procs.length
    ? tabloSatirlari(['Süreç', 'Türü', 'Sahibi', 'Gösterge', 'Hedef'], K.procs.map((p) => [p.name, PTYPE[p.type], p.owner, p.kpi, hedefMetni(p)]))
    : '[Süreçler sekmesinde süreçlerinizi tanımlayın; tablo otomatik oluşur.]'));
  s = s.replace('{MADDE_TABLOSU}', () => tabloSatirlari(['Madde', 'Konu', 'Doküman / kayıt'], KYSB.filter((b) => !b.tag).map((b) => {
    const it = K.items[b.id], gen = DOCT.find((d) => d.bl === b.id);
    return [b.c, b.n, it?.code ? it.code : (gen ? K.gd[gen.id]?.code ?? '' : '')];
  })));
  s = s.replace('{HEDEF_TABLOSU}', () => (K.procs.length
    ? tabloSatirlari(['Süreç', 'Gösterge', 'Hedef', 'Sorumlu', 'Son gerçekleşme'], K.procs.filter((p) => p.kpi).map((p) => {
      const l = gostergeSon(p);
      return [p.name, p.kpi, hedefMetni(p), p.owner, l ? `${degerMetni(l.v, p.unit)} (${ayAdi(l.m)})` : ''];
    }))
    : '| Süreç | Gösterge | Hedef | Sorumlu | Gerçekleşme |\n| | | | | |\n| | | | | |\n| | | | | |'));
  s = s.replace('{KODLAMA}', () => tabloSatirlari(['Kod', 'Tür', 'Açıklama'], DTYPES.map((d) => [`${kodOneki(K)}-${d[0]}-nnn`, d[1], d[2]])));
  s = s.replace('{KURALLAR}', () => DCRULES.map((r, i) => `${String(i + 1)}. **${r[0]}:** ${r[1]}`).join('\n'));
  s = s.replace('{KLASOR}', () => klasorAgaci(K).map(([ad, alt]) => `- ${ad}${alt.length ? `: ${alt.join(', ')}` : ''}`).join('\n'));
  s = s.replace('{SAKLAMA}', () => tabloSatirlari(['Kayıt', 'Asgari saklama', 'Sorumlu'], RETAIN));
  s = s.replace('{KAL_LISTE}', () => kalTablosu(c.cihazlar));
  s = s.replace('{ANA_LISTE}', () => {
    const rows: string[][] = [];
    for (const b of KYSB) { const it = K.items[b.id]; if (it?.code) rows.push([it.code, b.n, it.rev, it.date ? tarihMetni(it.date) : '', it.owner]); }
    for (const d of K.docs) rows.push([d.code, d.name, d.rev, d.date ? tarihMetni(d.date) : '', d.owner]);
    const gorulen = new Set<string>();
    const tek = rows.filter((r) => { const kod = r[0] ?? ''; if (gorulen.has(kod)) return false; gorulen.add(kod); return true; })
      .sort((a, b) => ((a[0] ?? '') < (b[0] ?? '') ? -1 : 1));
    return tek.length ? tabloSatirlari(['Kod', 'Doküman', 'Rev.', 'Tarih', 'Sorumlu'], tek) : '[Henüz kodlanmış doküman yok.]';
  });
  s = s.replace(/\{SUREC_KARTI:([^}]+)\}/, (_, pid: string) => {
    const p = K.procs.find((x) => x.id === pid);
    if (!p) return '[Süreç bulunamadı]';
    const ms = gostergeAylari(6);
    return `${tabloSatirlari(['Alan', 'Tanım'], [['Süreç adı', p.name], ['Süreç türü', `${PTYPE[p.type]} süreci`], ['Süreç sahibi', p.owner], ['Girdiler', p.inputs],
      ['Çıktılar', p.outputs], ['Performans göstergesi', p.kpi], ['Hedef', hedefMetni(p)], ['İzleme sıklığı', 'Aylık']])}\n\n## Son 6 ay\n\n${
      tabloSatirlari(ms.map(ayAdi), [ms.map((m) => p.vals[m] ?? '')])}\n\n## Riskler ve önlemler\n\n| Risk | Olasılık | Etki | Önlem | Sorumlu |\n| | | | | |\n| | | | | |` +
      '\n\n## İlgili dokümanlar ve kayıtlar\n\n| Doküman / kayıt | Kod |\n| | |\n| | |';
  });
  s = s.replace(/\{GOREV:([a-z]+)\}/, (_, rk: string) => {
    const r = ROLES.find((x) => x.k === rk);
    if (!r) return '';
    const a = K.roles[r.k];
    return `${tabloSatirlari(['Alan', 'Tanım'], [['Görev', r.n], ['Görevli', a?.kisi ?? ''], ['Vekili', a?.vekil ?? ''], ['Bağlı olduğu', r.b], ['Amaç', r.a]])}\n\n## Sorumluluklar\n\n${
      r.s.map((x) => `- ${x}`).join('\n')}\n\n## Yetkiler\n\n${r.y.map((x) => `- ${x}`).join('\n')}\n\n## Yetkinlik şartları\n\n${r.c}\n\n## Tebellüğ\n\n| Görevli | İmza | Tarih |\n| ${a?.kisi ?? ''} | | |`;
  });
  return s;
}

// secText: düzenlenmiş bölüm varsa o, yoksa şablon değişkenleri açılmış metin.
export function bolumMetni(d: DokumanSablonu, s: readonly [string, string, string], c: MetinBaglami): string {
  const v = c.profil.kys.gd[d.id]?.secs[s[0]];
  return typeof v === 'string' ? v : degiskenAc(s[2], c);
}

// --- Bölüm biçimi (mdHtml): paragraf, "## " alt başlık, "- " madde, "1. " adım, "| a | b |" tablo, "**kalın**", "[ ]" kutucuk, [[AKIS:x]] şema ---

export type SatirParcasi = { t: string; kalin: boolean };
export type Blok =
  | { tur: 'baslik'; satir: SatirParcasi[] }
  | { tur: 'madde' | 'sira'; satirlar: SatirParcasi[][] }
  | { tur: 'tablo'; bas: SatirParcasi[][]; satirlar: SatirParcasi[][][] }
  | { tur: 'paragraf'; satirlar: SatirParcasi[][] }
  | { tur: 'akis'; anahtar: string };

export function satirParcalari(x: string): SatirParcasi[] {
  const out: SatirParcasi[] = [];
  const re = /\*\*(.+?)\*\*/g;
  let son = 0;
  for (let m = re.exec(x); m; m = re.exec(x)) {
    if (m.index > son) out.push({ t: x.slice(son, m.index), kalin: false });
    out.push({ t: m[1] ?? '', kalin: true });
    son = m.index + m[0].length;
  }
  if (son < x.length) out.push({ t: x.slice(son), kalin: false });
  return out.map((p) => ({ ...p, t: p.t.replace(/\[ \]/g, '☐') }));
}

export function bloklar(t: string): Blok[] {
  const out: Blok[] = [];
  for (const bk of String(t).replace(/\r/g, '').split(/\n\s*\n/)) {
    const L = bk.split('\n').filter((x) => x.trim() !== '');
    const ilk = L[0];
    if (ilk === undefined) continue;
    const akis = /^\[\[AKIS:([a-z]+)\]\]$/.exec(ilk.trim());
    if (L.length === 1 && akis) { out.push({ tur: 'akis', anahtar: akis[1] ?? '' }); continue; }
    if (L.length === 1 && /^##\s+/.test(ilk)) { out.push({ tur: 'baslik', satir: satirParcalari(ilk.replace(/^##\s+/, '')) }); continue; }
    if (L.every((x) => /^\s*[-•]\s+/.test(x))) { out.push({ tur: 'madde', satirlar: L.map((x) => satirParcalari(x.replace(/^\s*[-•]\s+/, ''))) }); continue; }
    if (L.every((x) => /^\s*\d+[.)]\s+/.test(x))) { out.push({ tur: 'sira', satirlar: L.map((x) => satirParcalari(x.replace(/^\s*\d+[.)]\s+/, ''))) }); continue; }
    if (L.every((x) => /^\s*\|/.test(x))) {
      const rows = L.map((x) => x.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
      const n = Math.max(...rows.map((r) => r.length));
      const [bas = [], ...govde] = rows;
      out.push({ tur: 'tablo', bas: bas.map(satirParcalari), satirlar: govde.map((r) => Array.from({ length: n }, (_, i) => satirParcalari(r[i] ?? ''))) });
      continue;
    }
    out.push({ tur: 'paragraf', satirlar: L.map(satirParcalari) });
  }
  return out;
}

// --- Takvim dosyaları ---

const icsKacis = (v: string): string => String(v || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
const damga = (simdi: Date): string => simdi.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
const ICS_BAS = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Denetim Hazirlik//TR', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
const icsBitir = (L: string[]): string => `${[...L, 'END:VCALENDAR'].map(icsKatla).join('\r\n')}\r\n`;

// kysIcs: yürürlükteki ve tarihli yapı taşlarının sonraki gözden geçirmesi (geçmişse bugün), 7 gün önce hatırlatma. Olay yoksa null.
export function gozdenGecirmeTakvimi(p: Profil, profilId: string, simdi: Date = new Date()): { metin: string; adet: number } | null {
  const t = bugunTarihi(), firma = p.profile.firma, L = [...ICS_BAS];
  let n = 0;
  for (const b of KYSB) {
    const it = p.kys.items[b.id];
    if (!it || it.st !== 2 || !it.date) continue;
    let d = kysSonrakiGozden(b, it);
    if (d < t) d = t;
    n++;
    const baslik = `KYS gözden geçirme: ${b.n}${firma ? ` · ${firma}` : ''}`;
    L.push('BEGIN:VEVENT', `UID:kys-${profilId}-${b.id}@denetim-hazirlik`, `DTSTAMP:${damga(simdi)}`, `DTSTART;VALUE=DATE:${d.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${gunEkle(d, 1).replace(/-/g, '')}`, `SUMMARY:${icsKacis(baslik)}`,
      `DESCRIPTION:${icsKacis(`${b.c} · ${it.code ? `${it.code} ` : ''}${it.owner ? `Sorumlu: ${it.owner}. ` : ''}${b.ct}`)}`, 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:-P7D', `DESCRIPTION:${icsKacis(baslik)}`, 'END:VALARM', 'END:VEVENT');
  }
  return n ? { metin: icsBitir(L), adet: n } : null;
}

const ilkPazartesi = (y: number, m: number): string => {
  const d = new Date(y, m, 1);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return `${String(d.getFullYear())}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// rtIcs: haftalık, aylık, üç aylık ve yıllık görevler için tekrarlayan hatırlatma (ilk pazartesi, 09.00).
export function rutinTakvimi(p: Profil, profilId: string, simdi: Date = new Date()): string {
  const t = bugunTarihi(), firma = p.profile.firma, y = Number(t.slice(0, 4)), m = Number(t.slice(5, 7)) - 1, L = [...ICS_BAS];
  const nextMon = pazartesi(t) === t ? t : gunEkle(pazartesi(t), 7);
  let fm = ilkPazartesi(y, m);
  if (fm < t) fm = ilkPazartesi(m === 11 ? y + 1 : y, (m + 1) % 12);
  let qm = Math.floor(m / 3) * 3, fq = ilkPazartesi(y, qm);
  if (fq < t) { qm += 3; fq = ilkPazartesi(qm > 11 ? y + 1 : y, qm % 12); }
  let fy = ilkPazartesi(y, 0);
  if (fy < t) fy = ilkPazartesi(y + 1, 0);
  const olaylar: [keyof typeof RTF, string, string][] = [
    ['h', nextMon, 'FREQ=WEEKLY;BYDAY=MO'], ['a', fm, 'FREQ=MONTHLY;BYDAY=1MO'], ['c', fq, 'FREQ=MONTHLY;INTERVAL=3;BYDAY=1MO'], ['y', fy, 'FREQ=YEARLY;BYMONTH=1;BYDAY=1MO'],
  ];
  for (const [f, bas, kural] of olaylar) {
    const baslik = `KYS ${RTF[f].toLocaleLowerCase('tr')} görevleri${firma ? ` · ${firma}` : ''}`;
    const acik = RT.filter((x) => x.f === f).map((x) => `- ${x.t} (${rolAdi(x.r)})`).join('\n');
    L.push('BEGIN:VEVENT', `UID:kysrt-${profilId}-${f}@denetim-hazirlik`, `DTSTAMP:${damga(simdi)}`, `DTSTART;VALUE=DATE:${bas.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${gunEkle(bas, 1).replace(/-/g, '')}`, `RRULE:${kural}`, `SUMMARY:${icsKacis(baslik)}`, `DESCRIPTION:${icsKacis(acik)}`, 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'TRIGGER:PT9H', `DESCRIPTION:${icsKacis(baslik)}`, 'END:VALARM', 'END:VEVENT');
  }
  return icsBitir(L);
}

// Gözden geçirme yükü (pano): önümüzdeki 12 ay, geciken bu aya yazılır.
export interface AyYuku { k: string; n: string; c: number; late: number; items: string[] }
export function gozdenGecirmeYuku(p: Profil): { aylar: AyYuku[]; gecikmis: number } {
  const t = bugunTarihi();
  const mon: AyYuku[] = Array.from({ length: 12 }, (_, i) => {
    const d = ayEkle(`${t.slice(0, 8)}01`, i);
    return { k: d.slice(0, 7), n: new Date(`${d}T00:00:00`).toLocaleDateString('tr-TR', { month: 'short' }), c: 0, late: 0, items: [] };
  });
  let gecikmis = 0;
  for (const b of KYSB) {
    const it = p.kys.items[b.id];
    if (!it || it.st !== 2 || !it.date) continue;
    const nx = kysSonrakiGozden(b, it);
    const ilk = mon[0] as AyYuku;
    if (nx < t) { gecikmis++; ilk.late++; ilk.items.push(`${b.n} (gecikti)`); continue; }
    const m = mon.find((x) => x.k === nx.slice(0, 7));
    if (m) { m.c++; m.items.push(b.n); }
  }
  return { aylar: mon, gecikmis };
}

// docPlace, treeItems: dosya ağacında her dokümanın klasörü.
export function dokumanYeri(k: Kys, type: string, id: string): [string, string] {
  if (id.startsWith('surec:')) {
    const i = k.procs.findIndex((x) => `surec:${x.id}` === id);
    const p = k.procs[i];
    return ['01_Surecler', p ? `${String(i + 1).padStart(2, '0')}_${asciiAd(p.name)}` : ''];
  }
  if (id.startsWith('gorev:')) return ['00_KYS_Yonetimi', '02_Organizasyon_Gorev_Tanimlari'];
  if (id === 'f_kal' || (type === 'PL' && /kalib/i.test(id))) return ['08_Olcum_Kalibrasyon', ''];
  if (id === 'f_egitim') return ['07_Egitim_Yetkinlik', ''];
  if (id === 'f_icden') return ['05_Denetimler', 'Ic_Denetim'];
  if (id === 'f_dof') return ['06_DOF_Iyilestirme', ''];
  if (id === 'f_ygg') return ['00_KYS_Yonetimi', '04_Yonetimin_Gozden_Gecirmesi'];
  if (id === 'risk') return ['00_KYS_Yonetimi', '03_Baglam_Risk_Firsat'];
  const tur: Record<string, [string, string]> = {
    EL: ['00_KYS_Yonetimi', '01_Kapsam_Politika_Hedefler'], TB: ['00_KYS_Yonetimi', '01_Kapsam_Politika_Hedefler'], GT: ['00_KYS_Yonetimi', '02_Organizasyon_Gorev_Tanimlari'],
    PR: ['01_Surecler', '00_Prosedurler'], TL: ['01_Surecler', '00_Talimatlar'], FR: ['02_Formlar_Sablonlar', ''], LS: ['00_KYS_Yonetimi', '05_Listeler'],
    PL: ['00_KYS_Yonetimi', '05_Listeler'], DK: ['04_Dis_Kaynakli_Dokumanlar', ''],
  };
  return tur[type] ?? ['99_Arsiv_Gecersiz', ''];
}
export interface AgacDokumani { code: string; n: string; st: 0 | 1 | 2; pl: [string, string] }
export interface AgacKlasoru { ad: string; altlar: { ad: string; dokumanlar: AgacDokumani[] }[]; dogrudan: AgacDokumani[]; adet: number }
export function dosyaAgaci(k: Kys): { klasorler: AgacKlasoru[]; adet: number } {
  const items: AgacDokumani[] = [];
  const gorulen = new Set<string>();
  for (const d of butunDokumanlar(k)) {
    const g = k.gd[d.id];
    if (!g?.code || !g.st) continue;
    gorulen.add(g.code);
    items.push({ code: g.code, n: d.name, st: g.st === 'yayin' ? 2 : 1, pl: dokumanYeri(k, d.type, d.id) });
  }
  for (const x of k.docs) {
    if (x.code && gorulen.has(x.code)) continue;
    gorulen.add(x.code);
    items.push({ code: x.code, n: x.name, st: 2, pl: dokumanYeri(k, x.type, x.gen) });
  }
  for (const b of KYSB) {
    const it = k.items[b.id];
    if (!it?.code || gorulen.has(it.code)) continue;
    gorulen.add(it.code);
    items.push({ code: it.code, n: b.n, st: it.st, pl: dokumanYeri(k, it.code.split('-')[1] ?? '', b.id) });
  }
  const klasorler = klasorAgaci(k).map(([ad, alt]): AgacKlasoru => {
    const altlar = [...alt];
    for (const it of items) if (it.pl[0] === ad && it.pl[1] && !altlar.includes(it.pl[1])) altlar.push(it.pl[1]);
    altlar.sort();
    return {
      ad,
      altlar: altlar.map((a) => ({ ad: a, dokumanlar: items.filter((it) => it.pl[0] === ad && it.pl[1] === a) })),
      dogrudan: items.filter((it) => it.pl[0] === ad && !it.pl[1]),
      adet: items.filter((it) => it.pl[0] === ad).length,
    };
  });
  return { klasorler, adet: items.length };
}
