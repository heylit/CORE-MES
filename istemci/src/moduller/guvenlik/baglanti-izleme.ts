import type { LogoGidenIzlemeCevabi, LogoGidenIzlemeDurumu } from '#paylasilan/sozlesme/logo.ts';
import type { SmartesGidenIzlemeCevabi } from '#paylasilan/sozlesme/smartes.ts';
import { LOGO_DURUM_ADI, LOGO_DURUM_TONU, type RozetTonu } from '../../ortak/arayuz/index.ts';

// Bağlantı izleme (3313): Logo ve SmartES'e gitmeyen belgeler tek listede. SmartES'in kesin reddettiği iş emri durur; öteki hatalar yinelenir.
export type IzlemeDurumu = LogoGidenIzlemeDurumu;
export interface IzlemeSatiri {
  anahtar: string;
  kaynak: 'Logo' | 'SmartES';
  belge: string;
  belgeAdi: string;
  no: number;
  islem: 'gonder' | 'pasif';
  durum: IzlemeDurumu;
  neden: string | null;
  neYapmali: string;
  yenidenGonderilebilir: boolean;
  denemeSayisi: number | null;
  sonDeneme: string | null;
  sonrakiDeneme: string | null;
}

// Ad ve ton rozetle tek tablodan (3344): belgedeki Logo rozeti ile izlemedeki durum aynı görünür.
export const DURUM_ADI: Record<IzlemeDurumu, string> = LOGO_DURUM_ADI;
export const DURUM_TONU: Record<IzlemeDurumu, RozetTonu> = LOGO_DURUM_TONU;
const SMARTES_NE_YAPMALI = 'Bir şey yapmanız gerekmez: kendiliğinden yeniden denenir. Uzun sürerse SmartES bağlantısını denetleyin.';
const SMARTES_DURDU_NE_YAPMALI = 'Nedeni düzeltin (istasyon, operasyon ya da iş emri eşlemesi), sonra "Yeniden gönder". İş emri değişirse kendiliğinden yeniden gider.';

export function izlemeSatirlari(logo: LogoGidenIzlemeCevabi | undefined, smartes: SmartesGidenIzlemeCevabi | undefined): IzlemeSatiri[] {
  const l = (logo?.belgeler ?? []).map((b): IzlemeSatiri => ({ ...b, anahtar: `logo:${b.belge}:${b.no}:${b.islem}`, kaynak: 'Logo' }));
  const s = (smartes?.belgeler ?? []).map((b): IzlemeSatiri => ({
    anahtar: `smartes:${b.isEmriId}`, kaynak: 'SmartES', belge: 'is-emri', belgeAdi: `İş emri ${b.smartesIsEmriNo}`, no: b.isEmriId, islem: 'gonder',
    durum: b.durdu ? 'durdu' : 'yeniden-denenecek', neden: b.neden, neYapmali: b.durdu ? SMARTES_DURDU_NE_YAPMALI : SMARTES_NE_YAPMALI,
    yenidenGonderilebilir: b.durdu, denemeSayisi: b.denemeSayisi, sonDeneme: b.sonDeneme, sonrakiDeneme: b.durdu ? null : b.sonrakiDeneme,
  }));
  return [...l, ...s];
}

export const sayac = (satirlar: readonly IzlemeSatiri[]): Record<IzlemeDurumu, number> => ({
  durdu: satirlar.filter((s) => s.durum === 'durdu').length,
  'yeniden-denenecek': satirlar.filter((s) => s.durum === 'yeniden-denenecek').length,
  'kart-bekliyor': satirlar.filter((s) => s.durum === 'kart-bekliyor').length,
  'proje-bekliyor': satirlar.filter((s) => s.durum === 'proje-bekliyor').length,
  sirada: satirlar.filter((s) => s.durum === 'sirada').length,
});

// Toplu yeniden gönderim yalnız duran belgeyi, nedenine göre gruplu alır; kullanıcı yalnız düzelttiği nedenleri seçer.
export interface NedenGrubu { neden: string; belgeler: IzlemeSatiri[] }
export function duranGruplari(satirlar: readonly IzlemeSatiri[]): NedenGrubu[] {
  const gruplar = new Map<string, IzlemeSatiri[]>();
  for (const s of satirlar) {
    if (!s.yenidenGonderilebilir) continue;
    const neden = s.neden ?? 'Neden yazılmamış';
    gruplar.set(neden, [...(gruplar.get(neden) ?? []), s]);
  }
  return [...gruplar].map(([neden, belgeler]) => ({ neden, belgeler })).sort((a, b) => b.belgeler.length - a.belgeler.length || a.neden.localeCompare(b.neden, 'tr'));
}

// Uç bir istekte en çok 200 belge alır.
export const YENIDEN_GONDER_PARCASI = 200;
export function parcalara<T>(liste: readonly T[], boy = YENIDEN_GONDER_PARCASI): T[][] {
  const parcalar: T[][] = [];
  for (let i = 0; i < liste.length; i += boy) parcalar.push(liste.slice(i, i + boy));
  return parcalar;
}
