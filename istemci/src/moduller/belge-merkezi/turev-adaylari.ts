import type { BelgeSatiri, Kullanim } from '#paylasilan/sozlesme/belge-merkezi.ts';
import { KULLANIMLAR } from './gosterim.ts';

// "Türev ekle" üç kaynaktan açılır (3609). Düzenleyicinin Kaydet penceresi `belgeAdiYap` ile adın sonuna bu eki yazar;
// ayrı bir işaret alanı yoktur, bu yüzden "düzenlenmiş" ayrımı addan yapılır.
export const DUZENLENMIS_EKI = '(düzenlenmiş)';
export const duzenlenmisMi = (ad: string): boolean => ad.trimEnd().endsWith(DUZENLENMIS_EKI);

// Kayıtlı bir PDF'i türev olarak bağlayabilmek için: etkin, orijinal (türevi de, kendisi türev de değil), PDF ve kaynağın kendisi
// olmayan belge. Düzenleyiciden çıkan belgenin ilk revizyonu taslaktır; taslak aday sayılır (sunucu yalnız kaynak revizyonun
// yayında olmasını ister). Düzenlenmiş adlılar üstte, kendi aralarındaki sıra korunur.
export function turevAdaylari(satirlar: readonly BelgeSatiri[], kaynakId: number): BelgeSatiri[] {
  const uygun = satirlar.filter((s) => s.id !== kaynakId && s.aktif && s.dosyaTuru === 'pdf' && (s.turevSayisi ?? 0) === 0 && (s.kaynak ?? null) === null);
  return [...uygun.filter((s) => duzenlenmisMi(s.ad)), ...uygun.filter((s) => !duzenlenmisMi(s.ad))];
}

// "PDF düzenle" yolu: seçilen kullanım ve kısa ad düzenleyicinin Kaydet penceresine hazır gelir (yönlendirme durumu).
export interface DuzenleyiciTurevi { kullanim: Kullanim; kisaAd: string }
export function duzenleyiciTurevi(durum: unknown): DuzenleyiciTurevi | null {
  if (typeof durum !== 'object' || durum === null || !('turev' in durum)) return null;
  const t = durum.turev;
  if (typeof t !== 'object' || t === null || !('kullanim' in t) || !('kisaAd' in t)) return null;
  const { kullanim, kisaAd } = t;
  if (typeof kisaAd !== 'string' || !KULLANIMLAR.some((k) => k === kullanim)) return null;
  return { kullanim: kullanim as Kullanim, kisaAd: kisaAd.slice(0, 38) };
}
