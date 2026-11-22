import type { KaliteDurumu } from './sozlesme/stok.ts';

// Etiket kodunun özet biçimi (CM1): `CM1/UE:142/REV:B/LOT:ORN-LT-2041/BT:261122`. İlk alan her zaman önekli kimliktir (kod-sozlugu.ts onu
// çözer); CM1'i tanımayan okuyucu ilk alana düşer. Alanlar kısa anahtarla yazılır; ekranda Türkçe ad görünür, kısaltma yalnız etiketin
// kendisinde kalır. Ad eşlemesi bu dosyadaki tek tablodur: bilgi yazısı ve okuyan ekran aynı yerden okur.
// Saf kural: DOM, ağ ve veritabanı yok.

export interface Cm1Alan { readonly anahtar: string; readonly deger: string }
export interface Cm1Ozeti {
  /** Kimlik dahil, kodda yazıldığı sırayla. */
  readonly alanlar: readonly Cm1Alan[];
  readonly kimlik: Cm1Alan;
  /** Basım tarihi (BT), `YYYY-AA-GG`; kodda yoksa ya da geçersizse null. */
  readonly basim: string | null;
  /** Sığmadığı için koddan düşen alan sayısı (`/+N`); düşen yoksa 0. */
  readonly eksikSayisi: number;
  /** CM1 dışındaki sürüm (CM2...) yalnız kimlik alanı olarak okunur. */
  readonly surumTanindi: boolean;
}

const BASLIK = /^(CM\d+)([/.])/;
const ANAHTAR = /^[A-Z]{1,4}$/;
const EKSIK = /^[+_](\d{1,2})$/;

// El okuyucu ABD klavyesi gibi yazarsa Türkçe Q düzeninde "/" tuşu "." çıkar (VARSAYIM: cihazda denenmedi). Ayraç yalnız kodun hiç "/"
// taşımadığı durumda "." sayılır; ":" ve "-" kaymasını kod-sozlugu.ts okutmaDuzelt geri çevirir.
export function cm1Coz(ham: string): Cm1Ozeti | null {
  const s = ham.trim().replace(/\s+/g, ' ').toUpperCase();
  const b = BASLIK.exec(s);
  if (b === null) return null;
  const ayrac = b[2] === '.' && s.includes('/') ? '/' : b[2]!;
  const parcalar = s.slice(b[0].length).split(ayrac).map((p) => p.trim());
  let eksikSayisi = 0;
  const son = parcalar.at(-1);
  const e = son === undefined ? null : EKSIK.exec(son);
  if (e !== null) { eksikSayisi = Number(e[1]); parcalar.pop(); }
  const alanlar: Cm1Alan[] = [];
  for (const p of parcalar) {
    const i = p.indexOf(':');
    if (i < 1) { if (alanlar.length === 0) return null; continue; }
    const anahtar = p.slice(0, i).trim();
    const deger = p.slice(i + 1).trim();
    if (!ANAHTAR.test(anahtar) || deger === '') { if (alanlar.length === 0) return null; continue; }
    alanlar.push({ anahtar, deger });
  }
  const kimlik = alanlar[0];
  if (kimlik === undefined) return null;
  const bt = alanlar.find((a) => a.anahtar === 'BT');
  return { alanlar, kimlik, basim: bt === undefined ? null : tarihKodundan(bt.deger), eksikSayisi, surumTanindi: b[1] === 'CM1' };
}

// Kimlik alanı kod sözlüğünün bildiği biçime (`UE:142`) çevrilir; kimlikte boşluk yoktur.
export const kimlikKodu = (o: Cm1Ozeti): string => `${o.kimlik.anahtar}:${o.kimlik.deger.replace(/\s+/g, '')}`;

// YYAAGG -> YYYY-AA-GG (2000'ler); gün ayın en çok 31'i, ay 1-12.
export function tarihKodundan(deger: string): string | null {
  const m = /^(\d\d)(\d\d)(\d\d)$/.exec(deger);
  if (m === null) return null;
  const ay = Number(m[2]);
  const gun = Number(m[3]);
  if (ay < 1 || ay > 12 || gun < 1 || gun > 31) return null;
  return `20${m[1]}-${m[2]}-${m[3]}`;
}
export const tarihMetni = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

export type AlanTuru = 'metin' | 'tarih' | 'liste' | 'islemler' | 'durum' | 'sira';
interface AlanTanimi { readonly ad: string; readonly tur: AlanTuru; /** Sık değişir: çevrimdışı gösterimde soluk ve "doğrulanmadı". */ readonly eskir?: true }
export const ALANLAR: Readonly<Record<string, AlanTanimi>> = {
  LOC: { ad: 'Konum', tur: 'metin' }, RAF: { ad: 'Raf', tur: 'metin' }, MLZ: { ad: 'Malzeme', tur: 'metin' }, LOT: { ad: 'Lot', tur: 'liste' },
  UE: { ad: 'Üretim emri', tur: 'metin' }, RP: { ad: 'Refakat partisi', tur: 'metin' }, KOL: { ad: 'Koli', tur: 'metin' }, HP: { ad: 'Hatalı parça kaydı', tur: 'metin' },
  AD: { ad: 'Ad', tur: 'metin' }, YER: { ad: 'Yer', tur: 'metin' }, SK: { ad: 'Stok kodu', tur: 'metin' }, OL: { ad: 'Ölçü', tur: 'metin' }, KL: { ad: 'Kalite', tur: 'metin' },
  TPN: { ad: 'Tedarikçi lotu', tur: 'metin' }, DKM: { ad: 'Döküm no', tur: 'metin' }, SRT: { ad: 'Sertifika no', tur: 'metin' }, SKT: { ad: 'Son kullanma', tur: 'tarih' },
  MK: { ad: 'Mal kabul no', tur: 'metin' }, GT: { ad: 'Giriş tarihi', tur: 'tarih' }, TDR: { ad: 'Tedarikçi', tur: 'metin' }, DRM: { ad: 'Durum', tur: 'durum', eskir: true },
  PRC: { ad: 'Parça', tur: 'metin' }, REV: { ad: 'Revizyon', tur: 'metin' }, RRV: { ad: 'Rota revizyonu', tur: 'metin' }, ADT: { ad: 'Adet', tur: 'metin' },
  TRM: { ad: 'Termin', tur: 'tarih', eskir: true }, OPS: { ad: 'İşlemler', tur: 'islemler' }, KPY: { ad: 'Kopya', tur: 'metin' }, BT: { ad: 'Basım', tur: 'tarih' },
  NN: { ad: 'Koli sırası', tur: 'sira' }, SVK: { ad: 'Sevk no', tur: 'metin' }, MSN: { ad: 'Müşteri sipariş no', tur: 'metin' }, UT: { ad: 'Üretim tarihi', tur: 'tarih' },
  OP: { ad: 'Operasyon', tur: 'metin' }, KRR: { ad: 'Karar', tur: 'metin' },
};

// DRM alanı stok kalite durumudur (KALITE_DURUMLARI); kod ve ekran adı her durum için burada zorunludur, yeni durum eklenince tip derlemeyi
// durdurur. Kod kısa ve yalnız A-Z (el okuyucu kayması için); yazan taraf (dilim 2) bu tabloyu kullanır, bilinmeyen kod olduğu gibi gösterilir.
export const KALITE_DURUM_KODLARI: Readonly<Record<KaliteDurumu, { readonly kod: string; readonly ad: string }>> = {
  serbest: { kod: 'SRB', ad: 'Serbest' }, karar_bekliyor: { kod: 'KBK', ad: 'Karar bekliyor' }, sartli: { kod: 'SRL', ad: 'Şartlı kabul' }, red: { kod: 'RED', ad: 'Red' },
};
export const DURUM_ADLARI: Readonly<Record<string, string>> = Object.fromEntries(Object.values(KALITE_DURUM_KODLARI).map((d) => [d.kod, d.ad]));

export const alanAdi = (anahtar: string): string => ALANLAR[anahtar]?.ad ?? anahtar;

// Sığmayan içerikte alanlar sondan düşer (KURGU 3.4 sırası = öncelik). Kimlikten sonra bu sırayla yazılır; BT hiç düşmez.
const TUR_SIRASI: Readonly<Record<string, readonly string[]>> = {
  LOC: ['LOC', 'AD'], RAF: ['RAF', 'AD', 'YER'], MLZ: ['MLZ', 'SK', 'OL', 'KL'],
  LOT: ['LOT', 'TPN', 'DKM', 'SRT', 'SKT', 'MK', 'GT', 'TDR', 'DRM', 'BT'],
  UE: ['UE', 'PRC', 'REV', 'RRV', 'LOT', 'ADT', 'TRM', 'OPS', 'KPY', 'BT'], RP: ['RP', 'PRC', 'REV', 'RRV', 'LOT', 'ADT', 'TRM', 'OPS', 'KPY', 'BT'],
  KOL: ['KOL', 'NN', 'SVK', 'MSN', 'PRC', 'REV', 'ADT', 'LOT', 'UT', 'BT'], HP: ['HP', 'UE', 'OP', 'ADT', 'KRR', 'BT'],
};

/** Koddan düşen alanların anahtarları (düşen sayısı kadar, sondan). Tür tanınmazsa boş: sayı yine `eksikSayisi`ndadır. */
export function eksikAlanlar(o: Cm1Ozeti): string[] {
  const sira = TUR_SIRASI[o.kimlik.anahtar];
  if (sira === undefined || o.eksikSayisi === 0) return [];
  const var_ = new Set(o.alanlar.map((a) => a.anahtar));
  return sira.filter((k) => k !== 'BT' && !var_.has(k)).slice(-o.eksikSayisi);
}

const IKI_AYRAC = /[+_]/;
export interface AlanGosterimi { readonly ad: string; readonly deger: string; readonly eskir: boolean }

// Tarih her yerde GG.AA.YYYY; işlem listesinde sondaki `15K` "15 işlem daha" demektir (kod sığmadığı için kırpıldı).
export function alanGosterimi(a: Cm1Alan): AlanGosterimi {
  const t = ALANLAR[a.anahtar];
  const ad = t?.ad ?? a.anahtar;
  const eskir = t?.eskir === true;
  switch (t?.tur) {
    case 'tarih': { const iso = tarihKodundan(a.deger); return { ad, deger: iso === null ? a.deger : tarihMetni(iso), eskir }; }
    case 'durum': return { ad, deger: DURUM_ADLARI[a.deger] ?? a.deger, eskir };
    case 'liste': return { ad, deger: a.deger.split(IKI_AYRAC).join(' · '), eskir };
    case 'sira': return { ad, deger: a.deger.replace('-', ' / '), eskir };
    case 'islemler': {
      const parca = a.deger.split(IKI_AYRAC);
      const kirpik = /^(\d+)K$/.exec(parca.at(-1) ?? '');
      const liste = (kirpik === null ? parca : parca.slice(0, -1)).join(' · ');
      return { ad, deger: kirpik === null ? liste : `${liste} · ${kirpik[1]} işlem daha`, eskir };
    }
    case 'metin': case undefined: return { ad, deger: a.deger, eskir };
  }
}

/** Okuyan ekranın gösterdiği satırlar: kimlik ve basım ayrı gösterildiği için dışarıda. */
export function ozetSatirlari(o: Cm1Ozeti): AlanGosterimi[] {
  return o.alanlar.filter((a) => a !== o.kimlik && a.anahtar !== 'BT').map(alanGosterimi);
}

export interface EtiketFarki { readonly anahtar: string; readonly ad: string; readonly etikette: string; readonly kayitta: string }
// Sunucu kazanır: kayıttaki değerle etiketteki farklıysa etiket eskidir. `kayit` aynı anahtarlarla, kodun yazım biçiminde (tarih YYAAGG)
// verilir. Kimlik, basım, kopya ve koli sırası kaydın değeri değildir; karşılaştırılmaz.
const KARSILASTIRILMAZ = new Set(['BT', 'KPY', 'NN']);
export function etiketFarklari(o: Cm1Ozeti, kayit: Readonly<Record<string, string>>): EtiketFarki[] {
  const fark: EtiketFarki[] = [];
  for (const a of o.alanlar) {
    if (a === o.kimlik || KARSILASTIRILMAZ.has(a.anahtar)) continue;
    const k = kayit[a.anahtar]?.trim().toUpperCase();
    if (k === undefined || k === a.deger) continue;
    fark.push({ anahtar: a.anahtar, ad: alanAdi(a.anahtar), etikette: alanGosterimi(a).deger, kayitta: alanGosterimi({ anahtar: a.anahtar, deger: k }).deger });
  }
  return fark;
}

// "revizyon B → C" (birden çok farkta virgülle).
export const farkMetni = (f: readonly EtiketFarki[]): string => f.map((x) => `${x.ad.toLocaleLowerCase('tr')} ${x.etikette} → ${x.kayitta}`).join(', ');
