import { bolunmusMu } from './parca';

/* Rotalı TMI işinin plan durumu (kart #199, A4). Sunucu iş emri paketine `tmi.plan` yazar: canlı planda yerleşim var mı, yerleştiği kaynaktaki
   sırası ve kaynak iş emrininkiyle eşleşiyor mu; `zorunlu` "Operatöre yalnız canlı plandaki iş düşer" ayarıdır (kart #1257, varsayılan kapalı).
   Ayar açıkken operatör yalnız yayındaki ve canlı planda eşleşen işi görür (sunucu başlatmayı da yalnız onda kabul eder); kapalıyken plan durumu
   yalnız bilgidir. Rotasız TMI emri ve Arkon'un kendi paketi bugünkü gibidir: yayınlanınca düşer. */
export interface PlanKaynagi { tur: 'makine' | 'kisi'; id: number }
// `zorunlu` yazılmamış (eski) plan durumu A4 kuralıyla okunur.
// taslakta: canlıda yok, açık bir plan taslağında yerleşmiş; taslak canlıya alınınca iş canlıya geçer.
export interface TmiPlan { canli: boolean; sira: number | null; eslesiyor: boolean; kaynak?: PlanKaynagi | null; zorunlu?: boolean; taslakta?: boolean }
export interface PlanliPaket { id?: string; status?: string; tmi?: { isEmriId?: number; plan?: TmiPlan | null; bolunmus?: boolean; parca?: object } | null }

// Sunucu açık iş emrinin paketine her okumada `tmi.plan` yazar; bitmiş (ya da plan dışı kalmış) iş emrinin paketinde plan yoktur ve
// rotasız gibi sayılır: etiket yok, Pano özetine girmez, yayındaysa düşer (sunucu başlatmayı yine planla denetler).
export const tmiPlani = (p: PlanliPaket | null | undefined): TmiPlan | null =>
  p && p.tmi && typeof p.tmi.isEmriId === 'number' && p.tmi.plan ? p.tmi.plan : null;

const planAcik = (d: TmiPlan | null): boolean => d === null || d.zorunlu === false || (d.canli && d.eslesiyor);

// Bölünmüş işin bütün paketi operatöre düşmez; parçaları düşer (data/parca.ts).
export const operatoreAcik = (p: PlanliPaket | null | undefined): boolean => !!p && p.status !== 'draft' && !bolunmusMu(p) && planAcik(tmiPlani(p));

export type PlanEtiketi = 'planlanmadi' | 'kaynak-farkli' | 'hazirlik-bekliyor';
export const PLAN_ETIKETI: Record<PlanEtiketi, string> = {
  planlanmadi: 'Planlanmadı', 'kaynak-farkli': 'Plan başka kaynakta', 'hazirlik-bekliyor': 'Plan canlı · hazırlık bekliyor',
};

export function planEtiketi(p: PlanliPaket | null | undefined): PlanEtiketi | null {
  const d = tmiPlani(p);
  if (d === null) return null;
  if (!d.canli) return 'planlanmadi';
  if (!d.eslesiyor) return 'kaynak-farkli';
  return p!.status === 'draft' ? 'hazirlik-bekliyor' : null;
}

/* Sıra (A4, kullanıcı kararı "b"): canlı planda yerleşmiş TMI işi plan sırasıyla önce gelir (aynı istasyondaki makineler kendi sırasıyla
   iç içe), öteki paketler ardından kendi kuralıyla (Planlama'nın `seq`'i, termin). Taslağa yazılan sıra müdür canlıya alana dek görünmez. */
const planliSira = (p: PlanliPaket | null | undefined): TmiPlan | null => {
  const d = tmiPlani(p);
  return d && d.canli && d.sira != null ? d : null;
};
export function planOnce(a: PlanliPaket | null | undefined, b: PlanliPaket | null | undefined): number {
  const x = planliSira(a), y = planliSira(b);
  if (x && y) return x.sira! - y.sira! || (x.kaynak?.tur ?? '').localeCompare(y.kaynak?.tur ?? '') || (x.kaynak?.id ?? 0) - (y.kaynak?.id ?? 0);
  return x ? -1 : y ? 1 : 0;
}

// İstasyonun operatöre düşen paketleri, sırasıyla (operatör kuyruğu ve Pano istasyon kutusu aynı süzgeçle).
export const istasyonPaketleri = <T extends PlanliPaket & { machine?: string }>(pk: readonly T[], istasyon: string): T[] =>
  pk.filter((p) => p.machine === istasyon && operatoreAcik(p)).sort(planOnce);

export interface SiralamaIstegi { kaynak: PlanKaynagi; onceki: number[]; yeni: number[] }

// Planlama'da TMI işi şeritte taşınınca plana giden istek: yalnız taşınan işle aynı kaynaktaki, canlı planda yerleşmiş TMI işleri; sıra
// değişmediyse null. Plana yerleşmemiş iş sıralanamaz (null).
export function siralamaIstegi(once: readonly PlanliPaket[], sonra: readonly PlanliPaket[], tasinan: PlanliPaket): SiralamaIstegi | null {
  const k = planliSira(tasinan)?.kaynak;
  if (!k) return null;
  const kuyruk = (L: readonly PlanliPaket[]) => L.flatMap((p) => {
    const d = planliSira(p);
    return d && d.kaynak && d.kaynak.tur === k.tur && d.kaynak.id === k.id ? [p.tmi!.isEmriId!] : [];
  });
  const onceki = kuyruk(once), yeni = kuyruk(sonra);
  return onceki.length > 1 && onceki.some((x, i) => x !== yeni[i]) ? { kaynak: { tur: k.tur, id: k.id }, onceki, yeni } : null;
}

// Sıralama ekranın okuduğu canlı plan sürümüyle gider; sürüm yoksa gönderilmez. Sürüm yoksa ya da plan değiştiyse (409) ekran önce sürümü,
// sonra paketleri yeniden okur (`yenile`): sürüm paketlerden eski kalabilir (ret çıkar), yeni kalamaz (eski kuyrukla yeni sürüm gitmez).
export type SiraGonderimi = { sonuc: 'yazildi' } | { sonuc: 'hata'; ileti: string; yenile: boolean };
export async function siralamayiGonder(
  istek: SiralamaIstegi, planSurumu: number | null | undefined, gonder: (g: SiralamaIstegi & { planSurumu: number }) => Promise<unknown>,
): Promise<SiraGonderimi> {
  if (planSurumu == null) return { sonuc: 'hata', ileti: 'Plan okunamadı; ekran yeniden yükleniyor', yenile: true };
  try {
    await gonder({ ...istek, planSurumu });
    return { sonuc: 'yazildi' };
  } catch (e) {
    const h = e as { message?: string; status?: number } | null;
    return { sonuc: 'hata', ileti: h?.message || 'Sıra plana yazılamadı', yenile: h?.status === 409 };
  }
}

// Yukarı/aşağı tuşu: şeritte makineler iç içe dizilir; TMI işi kendi kaynağının kuyruğundaki komşusuyla yer değiştirir. Komşu yoksa null.
export function adimIstegi(serit: readonly PlanliPaket[], tasinan: PlanliPaket, yon: -1 | 1): SiralamaIstegi | null {
  const k = planliSira(tasinan)?.kaynak;
  if (!k) return null;
  const kuyruk = serit.filter((p) => { const d = planliSira(p); return d?.kaynak?.tur === k.tur && d.kaynak.id === k.id; });
  const i = kuyruk.indexOf(tasinan), j = i + yon;
  if (i < 0 || j < 0 || j >= kuyruk.length) return null;
  const sonra = [...kuyruk];
  [sonra[i], sonra[j]] = [sonra[j]!, sonra[i]!];
  return siralamaIstegi(kuyruk, sonra, tasinan);
}

/* "Operatöre gönder" (kart #1257, kullanıcı kararı 14.10.2026): iş canlı planda değilse ya da planda başka kaynaktaysa gönderim onay ister:
   neden, plana bağlantı ve "Yine de gönder". Ayar açıksa iş plan canlıya alınana kadar operatörde görünmez; bu da yazılır. İstasyonu seçilmemiş
   iş onayla da gönderilemez (sunucu da reddeder). */
export interface GonderimUyarisi { neden: string; gorunmez: boolean; taslakta?: boolean }
export const ISTASYONSUZ_GONDERIM = 'İstasyon seçilmedi: adımın makinesini ya da kişisini Reçete ve Rota\'da seçin. İstasyonsuz iş operatöre gönderilemez.';
/* Kart #1372: rotasında girdisi seçilmemiş adım olan TMI işi; neden sunucudan gelir, sunucu yayını da reddeder. */
export const rotaEksigi = (p: { tmi?: unknown } | null | undefined): string | null => {
  const n = p && p.tmi && typeof p.tmi === 'object' ? (p.tmi as { rotaEksik?: unknown }).rotaEksik : null;
  return typeof n === 'string' && n !== '' ? n : null;
};
export const istasyonsuzMu = (p: { machine?: unknown } | null | undefined): boolean => !p || typeof p.machine !== 'string' || p.machine.trim() === '';
export function gonderimUyarisi(p: PlanliPaket | null | undefined): GonderimUyarisi | null {
  const d = tmiPlani(p);
  if (d === null || (d.canli && d.eslesiyor)) return null;
  const neden = d.canli ? 'Bu iş canlı planda başka bir kaynağa yerleşmiş.'
    : d.taslakta ? 'Bu iş plan taslağında; plan canlıya alınmadı.' : 'Bu iş canlı planda değil.';
  return { neden, gorunmez: d.zorunlu !== false, ...(!d.canli && d.taslakta ? { taslakta: true } : {}) };
}

// Pano: istasyonda operatöre düşmemiş rotalı işlerin özeti ("2 iş hazırlık bekliyor · 1 iş planlanmadı"); yoksa null.
const OZET: Record<PlanEtiketi, string> = { 'hazirlik-bekliyor': 'hazırlık bekliyor', planlanmadi: 'planlanmadı', 'kaynak-farkli': 'plan başka kaynakta' };
export function istasyonPlanOzeti(pk: readonly (PlanliPaket & { machine?: string })[], istasyon: string): string | null {
  const say = new Map<PlanEtiketi, number>();
  for (const p of pk) {
    const e = p.machine === istasyon && !operatoreAcik(p) ? planEtiketi(p) : null;
    if (e !== null) say.set(e, (say.get(e) ?? 0) + 1);
  }
  const parca = (['hazirlik-bekliyor', 'planlanmadi', 'kaynak-farkli'] as const).filter((e) => say.has(e)).map((e) => `${say.get(e)} iş ${OZET[e]}`);
  return parca.length ? parca.join(' · ') : null;
}
