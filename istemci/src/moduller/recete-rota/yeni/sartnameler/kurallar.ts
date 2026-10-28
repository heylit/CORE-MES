import type {
  AtifGirdisi, KontrolNoktasi, ParametreDegeri, ParametreTuru, SartnameKapsami, SartnameParametresiSatiri, SartnameSurumu, TalimatAdimi, TalimatAdimiGirdisi,
  TalimatMedyasi,
} from '#paylasilan/sozlesme/rota.ts';

// Şartname ve talimat sayfasının saf kuralları: etiketler, adım taslağı ve sunucuya gidecek girdi, medya sınırları.

// Sözleşmenin sınırları (paylasilan/sozlesme/rota.ts): sözleşme zod taşıdığı için istemciye değer olarak girmez, burada sayı olarak durur.
// Listeler tiple bağlıdır: sözleşmeye yeni tür gelirse aşağıdaki etiket tabloları derlenmez.
export const AZAMI_TALIMAT_ADIMI = 30;
export const AZAMI_ADIM_MEDYASI = 5;
export const AZAMI_KONTROL_SECENEGI = 10;
export const AZAMI_PARAMETRE = 40;
export const AZAMI_ATIF = 30;
export const AZAMI_BELGE = 20;
export const MEDYA_SINIRI = { resimBayt: 10 * 1024 ** 2, videoBayt: 200 * 1024 ** 2, videoSaniye: 180 } as const;

export type KontrolTuru = KontrolNoktasi['tur'];
export const KONTROL_ADLARI: Readonly<Record<KontrolTuru, string>> = { yok: 'Yok', onay: 'Onay', olcum: 'Ölçüm', foto: 'Fotoğraf', secim: 'Seçim' };
export const KAPSAM_ADLARI: Readonly<Record<SartnameKapsami, string>> = { ic: 'iç', fason: 'fason', ikisi: 'iç ve fason' };
export const SURUM_DURUMU_ADLARI: Readonly<Record<SartnameSurumu['durum'], string>> = { taslak: 'taslak', yururlukte: 'yürürlükte', eski: 'eski' };
export const ATIF_ROLU_ADLARI: Readonly<Record<AtifGirdisi['rol'], string>> = {
  yontem: 'Yöntem', kabul: 'Kabul', test: 'Test', olcum: 'Ölçüm', malzeme: 'Malzeme', gosterim: 'Gösterim',
};
export const PARAMETRE_TURU_ADLARI: Readonly<Record<ParametreTuru, string>> = {
  sayi: 'Sayı', aralik: 'Aralık', secim: 'Seçim', coklu: 'Çoklu seçim', metin: 'Metin', evet: 'Evet / hayır',
};
const anahtarlari = <K extends string>(t: Readonly<Record<K, string>>): readonly K[] => Object.keys(t) as K[];
export const KONTROL_TURLERI = anahtarlari(KONTROL_ADLARI);
export const SARTNAME_KAPSAMLARI = anahtarlari(KAPSAM_ADLARI);
export const ATIF_ROLLERI = anahtarlari(ATIF_ROLU_ADLARI);
export const PARAMETRE_TURLERI = anahtarlari(PARAMETRE_TURU_ADLARI);

const sayiMetni = (n: number): string => String(n).replace('.', ',');

// Kontrol noktasının tek satırlık özeti (önizleme çipi ve adım listesi). Sınırı boş ölçüm "sınır talimatta" der: şablonda değer üründen ürüne değişir.
export function kontrolOzeti(k: KontrolNoktasi): string | null {
  switch (k.tur) {
    case 'yok': return null;
    case 'onay': return 'Onay';
    case 'foto': return k.aciklama ? `Fotoğraf: ${k.aciklama}` : 'Fotoğraf';
    case 'secim': return `Seçim: ${k.secenekler.join(' / ')}`;
    case 'olcum': {
      const birim = k.birim ? ` ${k.birim}` : '';
      const sinir = k.alt === null && k.ust === null ? 'sınır talimatta'
        : `${k.alt === null ? '…' : sayiMetni(k.alt)} – ${k.ust === null ? '…' : sayiMetni(k.ust)}${birim}`;
      return `Ölçüm: ${k.ad} (${sinir})`;
    }
  }
}

// Tür değişince o türün boş noktası; aynı tür seçilirse eldeki korunur.
export function kontrolKur(tur: KontrolTuru, eldeki: KontrolNoktasi): KontrolNoktasi {
  if (eldeki.tur === tur) return eldeki;
  switch (tur) {
    case 'yok': return { tur };
    case 'onay': return { tur };
    case 'foto': return { tur, aciklama: null };
    case 'secim': return { tur, secenekler: ['Uygun', 'Uygun değil'] };
    case 'olcum': return { tur, ad: '', alt: null, ust: null, birim: '' };
  }
}

// Düzenleyicideki adım: medya türü ve boyu yüklemede bilinir (sunucu girdisi yalnız özet ve ad alır). anahtar listedeki kimliktir.
export interface AdimTaslagi {
  anahtar: string;
  baslik: string;
  metin: string;
  kontrol: KontrolNoktasi;
  zorunlu: boolean;
  medya: TalimatMedyasi[];
}

let sayac = 0;
const yeniAnahtar = (): string => { sayac += 1; return `a${String(sayac)}`; };

export const bosAdim = (): AdimTaslagi => ({ anahtar: yeniAnahtar(), baslik: '', metin: '', kontrol: { tur: 'yok' }, zorunlu: false, medya: [] });
export const taslagaCevir = (a: TalimatAdimi): AdimTaslagi => ({
  anahtar: yeniAnahtar(), baslik: a.baslik, metin: a.metin ?? '', kontrol: a.kontrol, zorunlu: a.zorunlu, medya: a.medya,
});
export const girdiyeCevir = (a: AdimTaslagi): TalimatAdimiGirdisi => ({
  baslik: a.baslik.trim(), metin: a.metin.trim() === '' ? null : a.metin.trim(), kontrol: a.kontrol, zorunlu: a.zorunlu,
  medya: a.medya.map((m) => ({ ozet: m.ozet, ad: m.ad })),
});

// Sunucunun da reddettiği eksikler; gönderilmeden önce gösterilir ki tek tek 400 alınmasın.
export function adimEksikleri(adimlar: readonly AdimTaslagi[]): string[] {
  const eksik: string[] = [];
  if (adimlar.length === 0) eksik.push('En az bir adım gerekir.');
  if (adimlar.length > AZAMI_TALIMAT_ADIMI) eksik.push(`En çok ${String(AZAMI_TALIMAT_ADIMI)} adım olur.`);
  adimlar.forEach((a, i) => {
    const no = `Adım ${String(i + 1)}`;
    if (a.baslik.trim() === '') eksik.push(`${no}: başlık zorunlu.`);
    if (a.kontrol.tur === 'olcum' && a.kontrol.ad.trim() === '') eksik.push(`${no}: ölçümün adı zorunlu.`);
    if (a.kontrol.tur === 'olcum' && a.kontrol.alt !== null && a.kontrol.ust !== null && a.kontrol.alt > a.kontrol.ust) {
      eksik.push(`${no}: alt sınır üst sınırdan büyük.`);
    }
    if (a.kontrol.tur === 'secim' && a.kontrol.secenekler.filter((s) => s.trim() !== '').length < 2) eksik.push(`${no}: seçimde en az iki seçenek olur.`);
    if (a.medya.length > AZAMI_ADIM_MEDYASI) eksik.push(`${no}: en çok ${String(AZAMI_ADIM_MEDYASI)} resim ya da video.`);
  });
  return eksik;
}

export function adimTasi<T>(liste: readonly T[], i: number, yon: -1 | 1): T[] {
  const j = i + yon;
  if (j < 0 || j >= liste.length) return [...liste];
  const yeni = [...liste];
  [yeni[i], yeni[j]] = [yeni[j] as T, yeni[i] as T];
  return yeni;
}

// Sürükle-bırak (1186 b): rota şemasındaki gibi bırakılan adım hedefin ardına girer; hedef null ise başa. Taşınanın yeni sırası da döner.
export function adimArkasinaTasi<T>(liste: readonly T[], kaynak: number, sonra: number | null): { liste: T[]; yeni: number } {
  const oge = liste[kaynak];
  if (oge === undefined || kaynak === sonra || (sonra !== null && liste[sonra] === undefined)) return { liste: [...liste], yeni: kaynak };
  const kalan = liste.filter((_, j) => j !== kaynak);
  const yeni = sonra === null ? 0 : (sonra < kaynak ? sonra + 1 : sonra);
  kalan.splice(yeni, 0, oge);
  return { liste: kalan, yeni };
}

// Medya (995 a): tarayıcının bildirdiği türe göre. Video süresi ayrıca ölçülür (videoSuresiHatasi).
const RESIM_TURLERI = new Set(['image/png', 'image/jpeg', 'image/webp']);
export function medyaTuru(mime: string): 'resim' | 'video' | null {
  if (RESIM_TURLERI.has(mime)) return 'resim';
  if (mime === 'video/mp4') return 'video';
  return null;
}
const mb = (bayt: number): string => `${String(Math.round(bayt / 1024 ** 2))} MB`;
export function medyaHatasi(dosya: { type: string; size: number }, adimdaki: number): string | null {
  if (adimdaki >= AZAMI_ADIM_MEDYASI) return `Bir adımda en çok ${String(AZAMI_ADIM_MEDYASI)} resim ya da video olur.`;
  const tur = medyaTuru(dosya.type);
  if (tur === null) return 'Yalnız PNG, JPEG, WebP resim ya da MP4 video eklenir.';
  const sinir = tur === 'resim' ? MEDYA_SINIRI.resimBayt : MEDYA_SINIRI.videoBayt;
  if (dosya.size > sinir) return `${tur === 'resim' ? 'Resim' : 'Video'} en çok ${mb(sinir)} olur.`;
  return null;
}
// Süre okunamazsa (NaN) video reddedilir: sınırı denetlenemeyen dosya eklenmez.
export function videoSuresiHatasi(saniye: number): string | null {
  if (!Number.isFinite(saniye)) return 'Videonun süresi okunamadı.';
  return saniye > MEDYA_SINIRI.videoSaniye ? `Video en çok ${String(MEDYA_SINIRI.videoSaniye / 60)} dakika olur.` : null;
}
export const MEDYA_IPUCU = `Resim en çok ${mb(MEDYA_SINIRI.resimBayt)}, video en çok ${mb(MEDYA_SINIRI.videoBayt)} ve `
  + `${String(MEDYA_SINIRI.videoSaniye / 60)} dakika. Dosya kurum içi sunucuda saklanır.`;
export const medyaAdresi = (ozet: string): string => `/api/rota/talimat-medyasi/${ozet}`;

// Şablon önizlemesi ve listesinin özeti: "6 adım · 3 kontrol noktası".
export function sablonOzeti(adimlar: readonly Pick<AdimTaslagi, 'kontrol'>[]): string {
  const kontrol = adimlar.filter((a) => a.kontrol.tur !== 'yok').length;
  return `${String(adimlar.length)} adım${kontrol ? ` · ${String(kontrol)} kontrol noktası` : ''}`;
}
export function medyaSayilari(adimlar: readonly { medya: readonly { tur: 'resim' | 'video' }[] }[]): { resim: number; video: number } {
  const hepsi = adimlar.flatMap((a) => a.medya);
  return { resim: hepsi.filter((m) => m.tur === 'resim').length, video: hepsi.filter((m) => m.tur === 'video').length };
}

// Şartname alanının gösterilen değeri: varsayılan yoksa null (sıfır uydurulmaz).
export function degerMetni(p: Pick<SartnameParametresiSatiri, 'tur' | 'birim'>, d: ParametreDegeri): string | null {
  if (d === null) return null;
  const birim = p.birim ? ` ${p.birim}` : '';
  if (typeof d === 'boolean') return d ? 'Evet' : 'Hayır';
  if (typeof d === 'number') return `${sayiMetni(d)}${birim}`;
  if (typeof d === 'string') return d === '' ? null : d;
  if (p.tur === 'aralik' && d.length === 2 && typeof d[0] === 'number' && typeof d[1] === 'number') return `${sayiMetni(d[0])} – ${sayiMetni(d[1])}${birim}`;
  return d.length ? d.join(', ') : null;
}

// Arama: büyük küçük harf ve Türkçe i/ı ayrımı gözetilmez.
const yalin = (m: string): string => m.toLocaleLowerCase('tr').normalize('NFD').replace(/\p{M}/gu, '').replace(/ı/g, 'i');
export const eslesir = (aranan: string, ...alanlar: readonly (string | null)[]): boolean => {
  const q = yalin(aranan.trim());
  return q === '' || alanlar.some((a) => a !== null && yalin(a).includes(q));
};

// Elle girilen sayı: virgül ondalıktır; boş null, sayı olmayan undefined (hata).
export function sayiOku(ham: string): number | null | undefined {
  const t = ham.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
}

// Yeni alanın anahtarı adından türer (küçük harfle başlayan ASCII, deve yazımı); var olan alanın anahtarı değişmez, rota adımının değerleri ona bağlıdır.
const ASCII: Readonly<Record<string, string>> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u' };
export function anahtarUret(ad: string, mevcut: readonly string[]): string {
  const kelimeler = ad.toLocaleLowerCase('tr').replace(/[çğıöşü]/g, (h) => ASCII[h] ?? h).normalize('NFD').replace(/\p{M}/gu, '')
    .split(/[^a-z0-9]+/).filter(Boolean);
  let kok = kelimeler.map((k, i) => (i === 0 ? k : k.charAt(0).toUpperCase() + k.slice(1))).join('').replace(/^[0-9]+/, '').slice(0, 36);
  if (kok === '') kok = 'alan';
  let aday = kok;
  for (let n = 2; mevcut.includes(aday); n += 1) aday = `${kok}${String(n)}`;
  return aday;
}
