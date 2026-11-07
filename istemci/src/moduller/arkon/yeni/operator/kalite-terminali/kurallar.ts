import type { SimgeAdi } from '../../../../../ortak/tasarim/simgeler.ts';
import type { FormIcerigi, FormKaydi, GirisBekleyeni, HataliBekleyeni, IlkParcaBekleyeni } from '../../../../kalite-merkezi/disari.ts';

// 2196: kalite istasyonu terminalinin karar kuyruğu ve form adımları (saf kurallar). Kararın kuralı Kalite Merkezi sunucusundadır;
// buradaki yalnız ekranın düzenidir: hangi tür, hangi karar düğmeleri, hangisi gerekçe ister ve basılı tutulur.

export type KuyrukTuru = 'ilk' | 'hatali' | 'giris' | 'form';
export const KUYRUK_TURLERI: readonly { tur: KuyrukTuru; ad: string }[] = [
  { tur: 'ilk', ad: 'İlk parça' }, { tur: 'hatali', ad: 'Hatalı' }, { tur: 'giris', ad: 'Giriş' }, { tur: 'form', ad: 'Form onayı' },
];

export type KuyrukOgesi =
  | { tur: 'ilk'; anahtar: string; kayit: IlkParcaBekleyeni }
  | { tur: 'hatali'; anahtar: string; kayit: HataliBekleyeni }
  | { tur: 'giris'; anahtar: string; kayit: GirisBekleyeni }
  | { tur: 'form'; anahtar: string; kayit: FormKaydi };

export interface KuyrukGirdisi {
  ilkParca: readonly IlkParcaBekleyeni[];
  hatali: readonly HataliBekleyeni[];
  giris: readonly GirisBekleyeni[];
  formOnayi: readonly FormKaydi[];
}

export function kuyrukOgeleri(g: KuyrukGirdisi, tur: KuyrukTuru): KuyrukOgesi[] {
  if (tur === 'ilk') return g.ilkParca.map((k) => ({ tur, anahtar: `${String(k.uretimEmriId)}:${String(k.isEmriId ?? '')}`, kayit: k }));
  if (tur === 'hatali') return g.hatali.map((k) => ({ tur, anahtar: String(k.id), kayit: k }));
  if (tur === 'giris') return g.giris.map((k) => ({ tur, anahtar: String(k.malKabulSatirId), kayit: k }));
  return g.formOnayi.map((k) => ({ tur, anahtar: k._id, kayit: k }));
}

export const kuyrukSayisi = (g: KuyrukGirdisi, tur: KuyrukTuru): number =>
  tur === 'ilk' ? g.ilkParca.length : tur === 'hatali' ? g.hatali.length : tur === 'giris' ? g.giris.length : g.formOnayi.length;

export const kuyrukToplami = (g: KuyrukGirdisi): number => KUYRUK_TURLERI.reduce((t, k) => t + kuyrukSayisi(g, k.tur), 0);

// Boş türde açılmasın: seçili tür boşsa sıradaki dolu tür.
export function acilacakTur(g: KuyrukGirdisi, secili: KuyrukTuru): KuyrukTuru {
  if (kuyrukSayisi(g, secili) > 0) return secili;
  return KUYRUK_TURLERI.find((k) => kuyrukSayisi(g, k.tur) > 0)?.tur ?? secili;
}

export type KararTonu = 'iyi' | 'sart' | 'kotu' | 'mavi';
export interface KararSecenegi {
  deger: string;
  ad: string;
  alt: string;
  ton: KararTonu;
  simge: SimgeAdi;
  // Gerekçe adımı açılır (ciddiyet, kusur, not); şartlı kabulde not şarttır.
  gerekce: boolean;
  // Geri alınmaz: seçilir, sonra basılı tutulur.
  tehlikeli: boolean;
}

const S = (deger: string, ad: string, alt: string, ton: KararTonu, simge: SimgeAdi, gerekce = false, tehlikeli = false): KararSecenegi =>
  ({ deger, ad, alt, ton, simge, gerekce, tehlikeli });

// Seçenekler Kalite Merkezi > Bugün'deki listelerle aynıdır (ilk parça onay/red; hatalı 5 karar; giriş 3 karar; form onayı 2).
export function kararSecenekleri(o: KuyrukOgesi): readonly KararSecenegi[] {
  if (o.tur === 'ilk') return [S('onay', 'Onay', 'İlk parça uygun', 'iyi', 'check'), S('ret', 'Red', 'Karar bekleyen adet ret olur', 'kotu', 'x', false, true)];
  if (o.tur === 'hatali') {
    return [
      S('rework', 'Rework', 'Planlamaya düşer', 'mavi', 'rotate', true), S('kabul', 'Olduğu gibi kabul', 'Ana partiye katılır', 'iyi', 'check', true),
      S('sartli_kabul', 'Şartlı kabul', 'Şart yazılır; stok şartlı', 'sart', 'alert', true, true), S('hurda', 'Hurda', 'Kolu kapatır', 'kotu', 'trash', true, true),
      S('red', 'Red (MRB sonra)', 'Karantinada kalır', 'kotu', 'x', true, true),
    ];
  }
  if (o.tur === 'giris') {
    return [
      S('kabul', 'Kabul', 'Olduğu gibi; kabul alanına', 'iyi', 'check', true), S('sartli_kabul', 'Şartlı kabul', 'Şart yazılır; stok şartlı', 'sart', 'alert', true, true),
      S('red', 'Red', 'Tedarikçiye iade; NCR açılır', 'kotu', 'truck', true, true),
    ];
  }
  return [S('onay', 'Onayla', 'Kayıt onaylanır', 'iyi', 'check'), S('iade', 'Düzeltme için iade et', 'Doldurana geri döner', 'sart', 'back')];
}

// Giriş kaydı GKK beklerken önce kabul ve hatalı miktarı yazılır; karar ondan sonra hatalı miktar için verilir.
export const gkkBekliyor = (o: KuyrukOgesi): boolean => o.tur === 'giris' && o.kayit.durum === 'gkk_bekliyor';

export interface OgeOzeti { baslik: string; alt: string; satirlar: readonly { ad: string; deger: string; ton?: 'iyi' | 'kotu' | 'uyari' }[] }

export function ogeOzeti(o: KuyrukOgesi): OgeOzeti {
  if (o.tur === 'ilk') {
    const k = o.kayit;
    return {
      baslik: `${k.emirNo}${k.opNo === null ? '' : ` · OP${String(k.opNo)}`} · ilk parça`, alt: `${k.parcaNo} · ${k.parcaAd}`,
      satirlar: [{ ad: 'Emir', deger: `${String(k.adet)} adet` }, { ad: 'Karar bekleyen', deger: `${String(k.kararBekleyenAdet)} adet`, ton: 'uyari' }],
    };
  }
  if (o.tur === 'hatali') {
    const k = o.kayit;
    return {
      baslik: `${k.uretimEmri.emirNo} · OP${String(k.isEmri.opNo)} · ${String(k.adet)} hatalı`, alt: `${k.uretimEmri.parcaNo} · ${k.kisi.ad ?? ''}${k.aciklama ? ` · ${k.aciklama}` : ''}`,
      satirlar: [{ ad: 'Hatalı', deger: String(k.adet), ton: 'kotu' }, { ad: 'Neden', deger: k.hurdaNedeni.ad, ton: 'kotu' }, { ad: 'Ana emir', deger: k.hedefEmir.emirNo }],
    };
  }
  if (o.tur === 'giris') {
    const k = o.kayit;
    return {
      baslik: `${k.malKabulNo} · ${k.malzemeKod ?? ''}`, alt: [k.tedarikciAdi, k.malzemeAd, k.partiEtiketi].filter(Boolean).join(' · '),
      satirlar: [
        { ad: 'Gelen', deger: `${k.miktar}${k.birim ? ` ${k.birim}` : ''}` },
        { ad: 'Kabul', deger: k.kabulMiktar ?? '—', ton: 'iyi' }, { ad: 'Hatalı', deger: k.hataliMiktar ?? '—', ton: 'kotu' },
        { ad: 'Sertifika', deger: k.sertifikaVar ? 'Var' : 'Yok', ...(k.sertifikaVar ? {} : { ton: 'uyari' as const }) },
      ],
    };
  }
  const k = o.kayit as FormKaydi & { sonuc?: string };
  return {
    baslik: `${k.kod ?? ''} ${k.ad ?? ''}`.trim(), alt: [k.dolduran, k.tarih].filter(Boolean).join(' · '),
    satirlar: [{ ad: 'Sonuç', deger: k.sonuc ?? '—', ...(k.sonuc && /uygunsuz|değil/i.test(k.sonuc) ? { ton: 'kotu' as const } : {}) }],
  };
}

/* ---------------- ondalık tuş girişi ---------------- */

// Eldivenle tuşla girilen sayı metni: yalnız rakam ve tek virgül, en çok 12 karakter. Değer Kalite Merkezi'ne metin olarak gider.
export function tusaBas(metin: string, tus: string): string {
  if (tus === 'sil') return metin.slice(0, -1);
  if (tus === 'temizle') return '';
  if (metin.length >= 12) return metin;
  if (tus === ',') return metin.includes(',') ? metin : `${metin || '0'},`;
  if (tus === '-') return metin.startsWith('-') ? metin.slice(1) : `-${metin}`;
  return /^\d$/.test(tus) ? `${metin === '0' ? '' : metin}${tus}` : metin;
}

// Ekranda virgül, sunucuya nokta (en çok üç ondalık; stok miktar biçimi).
export const miktarMetni = (m: string): string => m.replace(',', '.');
const binde = (m: string): number => Math.round(Number(miktarMetni(m)) * 1000);

// GKK lotun karar bekleyen bütününe verilir: kabul ve hatalı toplamı gelen miktara eşittir (Kalite Merkezi kuralı; sunucu da denetler).
export function gkkEksigi(gelen: string, kabul: string, hatali: string): string | null {
  if (kabul === '' || hatali === '') return 'Kabul ve hatalı miktarını girin.';
  if (!/^\d+(,\d{1,3})?$/.test(kabul) || !/^\d+(,\d{1,3})?$/.test(hatali)) return 'Miktar en çok üç ondalıklı sayı olur.';
  if (binde(kabul) + binde(hatali) !== binde(gelen)) return `Kabul ve hatalı toplamı gelen miktara eşit olmalı: ${gelen.replace('.', ',')}.`;
  return null;
}

/* ---------------- form taslağı ---------------- */

const sozluk = (v: unknown): Record<string, string> =>
  v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).filter(([, d]) => typeof d === 'string')) as Record<string, string> : {};

// Taslak kayıttan terminal içeriği: Kalite Merkezi'nde başlanan taslak da terminalde sürer (anahtarlar aynı).
export function taslakIcerigi(k: FormKaydi): FormIcerigi {
  const t = k.tablo && typeof k.tablo === 'object' ? (k.tablo as Record<string, unknown>) : {};
  return {
    veri: k.veri && typeof k.veri === 'object' ? { ...k.veri } : {},
    liste: sozluk(k.liste),
    listeNot: sozluk(k.listeNot),
    tablo: Object.fromEntries(Object.entries(t).filter(([, v]) => Array.isArray(v)).map(([a, v]) => [a, (v as unknown[]).map(sozluk)])),
  };
}
