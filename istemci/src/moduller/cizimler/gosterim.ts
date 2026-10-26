import type { BagModulu, BelgeTuru, RevizyonDurumu } from '#paylasilan/sozlesme/cizimler.ts';
import type { DosyaTuru } from '#paylasilan/sozlesme/dosya.ts';
import { tesisSaati } from '#paylasilan/tesis-zamani.ts';
import type { RozetTonu } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import type { ModelBicimi } from './goruntu/model.ts';

// Sözleşme zod taşır, istemci ondan yalnız tip alır: değer listeleri burada tipe bağlı yazılır (eksik ya da fazla tür derlenmez).
export const BELGE_TURLERI = ['teknik-resim', '3b-model', 'fotograf', 'makine', 'sertifika', 'rapor', 'kroki', 'diger'] as const satisfies readonly BelgeTuru[];

export const TUR_ADI: Record<BelgeTuru, string> = {
  'teknik-resim': 'Teknik resim',
  '3b-model': '3B model',
  fotograf: 'Fotoğraf',
  makine: 'Makine dokümanı',
  sertifika: 'Sertifika',
  rapor: 'Rapor',
  kroki: 'Kroki',
  diger: 'Diğer',
};

export const TUR_SIMGESI: Record<BelgeTuru, SimgeAdi> = {
  'teknik-resim': 'ruler', '3b-model': 'cube', fotograf: 'camera', makine: 'cpu', sertifika: 'check', rapor: 'lab', kroki: 'grid', diger: 'layers',
};

export const DURUM_ADI: Record<RevizyonDurumu, string> = { taslak: 'Taslak', yayinda: 'Yayında', eski: 'Eski' };
export const DURUM_TONU: Record<RevizyonDurumu, RozetTonu> = { taslak: 'uyari', yayinda: 'tamam', eski: 'pasif' };

export const BAG_ADI: Record<BagModulu, string> = {
  malzemeler: 'Malzeme kartı',
  istasyonlar: 'Makine',
  atolye: 'Fabrika haritası',
  arkon: 'Üretim Hazırlık',
  kalibrasyon: 'Ölçü aleti',
  rota: 'Rota',
  'uretim-emirleri': 'Üretim emri',
  stok: 'Stok partisi',
  'satin-alma': 'Satın alma siparişi',
};

// Sunucudaki CZ-03 (kurallar.ts IZINLI_DOSYA_TURLERI) ile aynı; burada yalnız seçimi erken uyarmak içindir, karar sunucunundur.
const RESIM: readonly DosyaTuru[] = ['pdf', 'png', 'jpeg', 'webp'];
const FOTO: readonly DosyaTuru[] = ['png', 'jpeg', 'webp'];
const MODEL: readonly DosyaTuru[] = ['step', 'stl', 'iges', 'glb', 'gltf'];
export const IZINLI_DOSYA_TURLERI: Record<BelgeTuru, readonly DosyaTuru[]> = {
  'teknik-resim': RESIM, '3b-model': MODEL, fotograf: FOTO, makine: [...RESIM, ...MODEL], sertifika: RESIM, rapor: RESIM, kroki: RESIM, diger: [...RESIM, ...MODEL],
};

const UZANTILAR: Record<DosyaTuru, readonly string[]> = {
  pdf: ['pdf'], png: ['png'], jpeg: ['jpg', 'jpeg'], webp: ['webp'], step: ['step', 'stp'], stl: ['stl'], iges: ['iges', 'igs'],
  glb: ['glb'], gltf: ['gltf'], dxf: ['dxf'],
};

export function dosyaTuruBul(ad: string): DosyaTuru | null {
  const uzanti = ad.toLowerCase().split('.').pop() ?? '';
  for (const [tur, liste] of Object.entries(UZANTILAR) as [DosyaTuru, readonly string[]][]) if (liste.includes(uzanti)) return tur;
  return null;
}

// <input accept> değeri: dosya seçicide yalnız belge türünün aldığı uzantılar görünür.
export const kabulMetni = (tur: BelgeTuru): string => IZINLI_DOSYA_TURLERI[tur].flatMap((t) => UZANTILAR[t].map((u) => `.${u}`)).join(',');
export const izinliMetni = (tur: BelgeTuru): string => IZINLI_DOSYA_TURLERI[tur].map((t) => t.toUpperCase()).join(', ');

export function boyutMetni(bayt: number): string {
  if (bayt < 1024) return `${bayt} B`;
  if (bayt < 1048576) return `${(bayt / 1024).toLocaleString('tr-TR', { maximumFractionDigits: 0 })} KB`;
  return `${(bayt / 1048576).toLocaleString('tr-TR', { maximumFractionDigits: 1 })} MB`;
}

export const zamanMetni = (iso: string | null): string => (iso === null ? '—' : tesisSaati(new Date(iso)));

export type GorunumTuru = 'pdf' | 'resim' | 'model';
export function gorunumTuru(t: DosyaTuru): GorunumTuru {
  if (t === 'pdf') return 'pdf';
  return MODEL.includes(t) ? 'model' : 'resim';
}

// Görüntülenen model okuyucusu; model olmayan tür için null.
export function modelBicimi(t: DosyaTuru): ModelBicimi | null {
  return t === 'step' || t === 'stl' || t === 'iges' || t === 'glb' || t === 'gltf' ? t : null;
}
