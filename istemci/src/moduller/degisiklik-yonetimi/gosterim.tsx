import { ACILIYET_ADLARI, EMIR_DURUM_ADLARI, KARAR_MODU_ADLARI, TALEP_DURUM_ADLARI, type Aciliyet, type EmirDurumu, type HatAsamasi, type KararModu, type Sinif, type TalepDurumu } from '#paylasilan/sozlesme/degisiklik-yonetimi-sabitleri.ts';
import type { EmirListeSatiri } from '#paylasilan/sozlesme/degisiklik-yonetimi.ts';
import { Rozet, type RozetTonu } from '../../ortak/arayuz/index.ts';
import { tarihMetni } from '../../ortak/veri/zaman-metni.ts';

export const KOK = '/degisiklik-yonetimi';
export const talepYolu = (id: number): string => `${KOK}/talepler/${id}`;
export const emirYolu = (id: number): string => `${KOK}/emirler/${id}`;
export const kayitYolu = (tur: 'talep' | 'emir', id: number): string => (tur === 'talep' ? talepYolu(id) : emirYolu(id));

// Listelerdeki kısa sınıf adı; uzun ad (SINIF_ADLARI) form ve künyededir.
export const SINIF_KISA: Readonly<Record<Sinif, string>> = { D1: 'Class I', D2: 'Class II', P1: 'Proses (FAI)', P2: 'Proses' };
export const sinifMetni = (s: Sinif | null): string => (s === null ? '—' : SINIF_KISA[s]);

export const HAT_ADLARI: Readonly<Record<HatAsamasi, string>> = {
  talep: 'Talep', revizyon: 'Revizyon hazırlığı', yayin: 'Yayın onayı', karar: 'Disposition', fai: 'Uygulama ve FAI', kapanis: 'Doğrulama',
};

const TALEP_TONU: Readonly<Record<TalepDurumu, RozetTonu>> = {
  gonderildi: 'bilgi', analizde: 'bilgi', ccb_bekliyor: 'bilgi', musteri_onayi_bekliyor: 'bilgi', onaylandi: 'tamam', emir_acildi: 'pasif', reddedildi: 'pasif',
};
const MOD_TONU: Readonly<Record<KararModu, RozetTonu>> = { otomatik: 'tamam', onayli: 'bilgi', mrb: 'hata' };

export const TalepDurumRozeti = ({ durum }: { durum: TalepDurumu }) => <Rozet ton={TALEP_TONU[durum]}>{TALEP_DURUM_ADLARI[durum]}</Rozet>;
export const EmirDurumRozeti = ({ durum }: { durum: EmirDurumu }) => (
  <Rozet ton={durum === 'kapandi' ? 'tamam' : durum === 'karar' ? 'hata' : 'bilgi'}>{EMIR_DURUM_ADLARI[durum]}</Rozet>
);
export const ModRozeti = ({ mod }: { mod: KararModu }) => <Rozet ton={MOD_TONU[mod]}>{KARAR_MODU_ADLARI[mod]}</Rozet>;

// Normal aciliyet rozet taşımaz; prototipte soluk yazıdır.
export function AciliyetMetni({ aciliyet }: { aciliyet: Aciliyet }) {
  if (aciliyet === 'normal') return <span className="tc-dy-soluk">{ACILIYET_ADLARI.normal}</span>;
  return <Rozet ton={aciliyet === 'acil' ? 'hata' : 'bilgi'}>{ACILIYET_ADLARI[aciliyet]}</Rozet>;
}

export const malzemeMetni = (m: { malzemeId: number; kod: string | null }): string => m.kod ?? `#${m.malzemeId}`;

// Seri numarasının biçimi markalamadadır; burada yalnız sıra numarası yazılır.
export function gecerlilikMetni(g: NonNullable<EmirListeSatiri['gecerlilik']>): string {
  if (g.tur === 'seri') return `${malzemeMetni(g.sonUrun)}, seri ${g.ilkSeri} ve sonrası`;
  if (g.tur === 'tarih') return `${tarihMetni(g.tarih)} ve sonrası başlayan emirler`;
  return 'Tüm açık emirler, karar tablosuna göre';
}
