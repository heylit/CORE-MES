import { cagriBanaMi, type CagriEkiplerim } from '../../../../../../arkon/web/src/data/cagri-ekiplerim.ts';
import { tesisListesi, tmiListesiSaltOkunur } from '../../../../../../arkon/web/src/data/tmi-listeleri.ts';
import { ROLLER } from '../cekirdek/sabitler.ts';
import type { Perm, Role, User } from '../cekirdek/tipler.ts';

// Ayarlar ve çağrı bandının saf kuralları (giris-ayarlar-spc.ts SettingsApp, callForMe; ayarlar-uretim.ts AuditView).
// Yeni ekran hep sunucuya bağlıdır: yerel kipin düzenleyicileri (tesis, nedenler, vardiya, sunucu adresi) burada yoktur.

export type AyarSekmesi = 'genel' | 'tesis' | 'kisi' | 'uretim' | 'sistem';
export const AYAR_SEKMELERI: readonly { anahtar: AyarSekmesi; baslik: string }[] = [
  { anahtar: 'genel', baslik: 'Genel' }, { anahtar: 'tesis', baslik: 'Tesis' }, { anahtar: 'kisi', baslik: 'Kişiler ve yetkiler' },
  { anahtar: 'uretim', baslik: 'Üretim' }, { anahtar: 'sistem', baslik: 'Sistem' },
];

export interface AyarGorunurlugu {
  sekmeler: AyarSekmesi[];
  tesisOkur: boolean;
  nedenOkur: boolean;
}

// Sekme ve salt okunur listelerin görünürlüğü; `yonetici` giriş yoksa da doğrudur (eski `!me || me.role === 'admin'`).
export function ayarGorunurlugu(can: (k: Perm) => boolean, yonetici: boolean): AyarGorunurlugu {
  const tesisOkur = tesisListesi(true, can('page.prep'), can('adm.plant'));
  const nedenOkur = tmiListesiSaltOkunur(true, can('page.prep'), false);
  const acik: Record<AyarSekmesi, boolean> = {
    genel: true,
    tesis: tesisOkur,
    kisi: can('adm.users') || yonetici,
    uretim: can('adm.shifts') || can('adm.reasons') || nedenOkur,
    sistem: can('adm.backup') || can('adm.audit') || can('adm.plant'),
  };
  return { sekmeler: AYAR_SEKMELERI.map((s) => s.anahtar).filter((k) => acik[k]), tesisOkur, nedenOkur };
}

// Cihazda kayıtlı sekme görünürse açılır, yoksa Genel.
export const ilkAyarSekmesi = (kayitli: unknown, sekmeler: readonly AyarSekmesi[]): AyarSekmesi =>
  sekmeler.find((s) => s === kayitli) ?? 'genel';

// Kişi listesi: rol sırası, sonra ad (UserEditor).
export function kisiSirasi<K extends Pick<User, 'role' | 'name'>>(liste: readonly K[]): K[] {
  const sira = new Map<string, number>(ROLLER.map(([k], i) => [k, i]));
  return [...liste].sort((a, b) => (sira.get(a.role) ?? 9) - (sira.get(b.role) ?? 9) || a.name.localeCompare(b.name, 'tr'));
}

export interface Cagri {
  type: 'call';
  t0: number;
  k: string;
  l?: string;
  machine?: string | null;
  mc?: string | null;
  wc?: string | null;
  by?: string;
  note?: string | null;
  esc?: boolean;
  orderNo?: string | null;
}

export const cagriMi = (m: { type: string }): m is Cagri =>
  m.type === 'call' && typeof (m as Partial<Cagri>).t0 === 'number' && typeof (m as Partial<Cagri>).k === 'string';

export interface CagriAlicisi {
  ustlenebilir: boolean;
  rol: Role | null;
  // Bu tabletin istasyonu ve açık sayfa: operatör ekranındaki istasyon kendi çağrısını bantta görmez.
  istasyon: string | null;
  sayfa: string;
  ekiplerim: CagriEkiplerim;
}

export function cagriBanaGelir(m: Pick<Cagri, 'k' | 'machine'>, a: CagriAlicisi): boolean {
  if (!a.ustlenebilir) return false;
  if (m.machine && m.machine === a.istasyon && a.sayfa === 'operator') return false;
  return cagriBanaMi(m.k, a.rol, a.ekiplerim);
}

// Bant en çok dört çağrı tutar; aynı çağrı yeniden gelirse sona alınır. Yarım saatten eski çağrı düşer.
export const CAGRI_SINIRI = 4;
export const CAGRI_OMRU_MS = 30 * 60e3;
export const cagriEkle = <C extends Pick<Cagri, 't0'>>(liste: readonly C[], m: C): C[] => liste.filter((x) => x.t0 !== m.t0).concat([m]).slice(-CAGRI_SINIRI);
export const cagriCikar = <C extends Pick<Cagri, 't0'>>(liste: readonly C[], t0: unknown): C[] => liste.filter((x) => x.t0 !== t0);
export const tazeCagrilar = <C extends Pick<Cagri, 't0'>>(liste: readonly C[], simdi: number): C[] => liste.filter((x) => simdi - x.t0 < CAGRI_OMRU_MS);
export const yanitsizDakika = (t0: number, simdi: number): number => Math.round((simdi - t0) / 60000);

// Değişiklik günlüğü (AuditView).
export const GUNLUK_ALANLARI = ['paket', 'plan', 'planlı duruş', 'bakım', 'kalibrasyon', 'tesis', 'kullanıcı', 'yetki', 'vardiya', 'neden', 'kural', 'sistem'] as const;
export const GUNLUK_GUNLERI = [[1, 'Bugün'], [7, '7 gün'], [30, '30 gün']] as const;
export const GUNLUK_GOSTERIM = 400;

export interface GunlukSatiri {
  at: number; cid?: string; userName?: string | null; area?: string; action?: string; target?: string; detail?: string | null; machine?: string | null;
}

const kucuk = (s: string): string => s.toLocaleLowerCase('tr-TR');
export function gunlukSuz<S extends GunlukSatiri>(satirlar: readonly S[], alan: string, ara: string): S[] {
  const q = kucuk(ara);
  return satirlar.filter((r) => (!alan || r.area === alan)
    && (!q || kucuk([r.action, r.target, r.detail, r.userName].join(' ')).includes(q)));
}
