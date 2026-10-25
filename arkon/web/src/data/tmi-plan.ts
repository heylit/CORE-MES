import { bolunmusMu } from './parca';

/* Rotalı TMI işinin plan durumu (kart #199, A4). Sunucu iş emri paketine `tmi.plan` yazar: canlı planda yerleşim var mı, yerleştiği kaynaktaki
   sırası ve kaynak iş emrininkiyle eşleşiyor mu; `zorunlu` "Operatöre yalnız canlı plandaki iş düşer" ayarıdır (kart #1257, varsayılan kapalı).
   Ayar açıkken operatör yalnız yayındaki ve canlı planda eşleşen işi görür (sunucu başlatmayı da yalnız onda kabul eder); kapalıyken plan durumu
   yalnız bilgidir. Rotasız TMI emri ve Arkon'un kendi paketi bugünkü gibidir: yayınlanınca düşer. */
export interface PlanKaynagi { tur: 'makine' | 'kisi'; id: number }
// `zorunlu` yazılmamış (eski) plan durumu A4 kuralıyla okunur.
// taslakta: canlıda yok, açık bir plan taslağında yerleşmiş; taslak canlıya alınınca iş canlıya geçer.
// siraOnayi (147 a): canlı işin sırası bir plan taslağında değişmiş; ekrandaki ve operatördeki sıra, taslak onaylanıp canlıya alınana dek canlınınkidir.
export type SiraOnayi = 'taslakta' | 'onayda';
export interface TmiPlan { canli: boolean; sira: number | null; eslesiyor: boolean; kaynak?: PlanKaynagi | null; zorunlu?: boolean; taslakta?: boolean; siraOnayi?: SiraOnayi }
// Kart 527: `kuyruk` Üretim Hazırlık'ın istasyon sırasıdır (yalnız işin bugünkü istasyonunda), `planSaati` canlı plandaki yeri. İkisini de sunucu yazar.
export interface KuyrukSirasi { sira: number; kisi: string; zaman: string }
export interface PlanSaati { baslangic: string; bitis: string }
export interface PlanliPaket {
  id?: string; status?: string;
  tmi?: { isEmriId?: number; plan?: TmiPlan | null; bolunmus?: boolean; parca?: object; kuyruk?: KuyrukSirasi | null; planSaati?: PlanSaati | null; bitti?: boolean } | null;
}

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

// Taslaktaki sıra değişikliğinin etiketi: onaya gönderilmemiş taslak ile onay bekleyen ayrı söylenir; ikisinde de sıra henüz canlı değildir.
export const SIRA_ONAYI: Record<SiraOnayi, string> = { taslakta: 'Sıra taslakta · onaya gönderilmedi', onayda: 'Sıra onay bekliyor' };
export function siraOnayi(p: PlanliPaket | null | undefined): SiraOnayi | null {
  const d = tmiPlani(p);
  return d && d.canli && (d.siraOnayi === 'taslakta' || d.siraOnayi === 'onayda') ? d.siraOnayi : null;
}

/* Sıra (kart 527, 519 1 c; A4 "b"nin yerine): Üretim Hazırlık'ın sıraladığı TMI işi Hazırlık sırasıyla önce gelir; sırasız TMI işi (sıralanmamış
   istasyon ya da plana sonradan giren iş) ardından plan sırasıyla (aynı istasyondaki makineler kendi sırasıyla iç içe), öteki paketler en son
   kendi kuralıyla (Planlama'nın `seq`'i, termin). Taslağa yazılan plan sırası onaylanıp canlıya alınana dek sıralamaya girmez; yalnız etiketiyle
   (`siraOnayi`) görünür. */
export const kuyrukSirasi = (p: PlanliPaket | null | undefined): number | null => {
  const k = p && p.tmi && typeof p.tmi.isEmriId === 'number' ? p.tmi.kuyruk : null;
  return k && typeof k.sira === 'number' ? k.sira : null;
};
const planliSira = (p: PlanliPaket | null | undefined): TmiPlan | null => {
  const d = tmiPlani(p);
  return d && d.canli && d.sira != null ? d : null;
};
export function planOnce(a: PlanliPaket | null | undefined, b: PlanliPaket | null | undefined): number {
  const ka = kuyrukSirasi(a), kb = kuyrukSirasi(b);
  if (ka !== null || kb !== null) return ka !== null && kb !== null ? ka - kb : ka !== null ? -1 : 1;
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

/* Kuyruktaki işin plan referansı (kart 527): kuyruk Hazırlık'ın kararıdır, plan yalnız gösterilir. Şeritteki canlı plan işleri kuyruk sırasıyla
   ve plan sırasıyla dizilir; aynı yerdeyse "Planla aynı", değilse "Planda n." (öne ya da geri alındı). Sıralanmış istasyonda Hazırlık sırası
   olmayan plan işi "Yeni" (plana sonradan girdi, kuyruğun sonunda bekler). Canlı planda olmayan ya da başka kaynakta olan iş "Plan dışı". */
export type PlanReferansTuru = 'ayni' | 'farkli' | 'disi' | 'yeni';
export interface PlanReferansi { tur: PlanReferansTuru; metin: string; saat: PlanSaati | null }
const planSaatiOku = (p: PlanliPaket): PlanSaati | null => {
  const s = p.tmi?.planSaati;
  return s && typeof s.baslangic === 'string' && typeof s.bitis === 'string' ? s : null;
};
const planSirasiyla = (a: PlanliPaket, b: PlanliPaket): number => {
  const x = planliSira(a)!, y = planliSira(b)!;
  return x.sira! - y.sira! || (x.kaynak?.tur ?? '').localeCompare(y.kaynak?.tur ?? '') || (x.kaynak?.id ?? 0) - (y.kaynak?.id ?? 0);
};
export function planReferanslari<T extends PlanliPaket>(serit: readonly T[]): Map<T, PlanReferansi> {
  const sonuc = new Map<T, PlanReferansi>();
  const planda = serit.filter((p) => { const d = planliSira(p); return d !== null && d.eslesiyor; });
  const planSirasi = [...planda].sort(planSirasiyla);
  const sirali = serit.some((p) => kuyrukSirasi(p) !== null);
  for (const p of serit) {
    const d = tmiPlani(p);
    if (d === null) continue;
    const saat = planSaatiOku(p);
    const i = planda.indexOf(p);
    if (i < 0) { sonuc.set(p, { tur: 'disi', metin: d.canli ? 'Plan başka kaynakta' : 'Plan dışı', saat: null }); continue; }
    const j = planSirasi.indexOf(p);
    const n = d.sira!;
    if (sirali && kuyrukSirasi(p) === null) sonuc.set(p, { tur: 'yeni', metin: `Yeni · planda ${n}.`, saat });
    else if (i === j) sonuc.set(p, { tur: 'ayni', metin: `Planla aynı · ${n}.`, saat });
    else sonuc.set(p, { tur: 'farkli', metin: `Planda ${n}. · ${i < j ? 'öne alındı' : 'geri alındı'}`, saat });
  }
  return sonuc;
}

// Şerit başındaki fark özeti: kaç iş planla farklı sırada, kaçı plan dışı, kaçı plana yeni girdi. Fark yoksa "Kuyruk planla aynı sırada";
// şeritte plan işi yoksa null.
export function planFarkOzeti(referanslar: Iterable<PlanReferansi>): { tur: PlanReferansTuru; metin: string } | null {
  const say = { ayni: 0, farkli: 0, disi: 0, yeni: 0 };
  for (const r of referanslar) say[r.tur] += 1;
  const fark = say.farkli + say.disi + say.yeni;
  if (fark + say.ayni === 0) return null;
  if (fark === 0) return { tur: 'ayni', metin: 'Kuyruk planla aynı sırada' };
  const parca = [say.farkli && `${say.farkli} iş sırası farklı`, say.disi && `${say.disi} iş plan dışı`, say.yeni && `${say.yeni} iş plana yeni girdi`].filter(Boolean);
  return { tur: say.farkli ? 'farkli' : say.disi ? 'disi' : 'yeni', metin: `Planla ${fark} fark: ${parca.join(' · ')}` };
}

/* Kuyruk sırası isteği (kart 527): istasyonun açık TMI iş emri paketleri, ekranın gördüğü ve yeni dizilişle. Sunucu da aynı işleri sayar
   (bölünmüş işin bütünü ve biten iş girmez); fark varsa 409 ile ekran yenilenir. Sıra değişmediyse null. */
const KUYRUK_PAKETI = /^tmi-ie-\d+(-p\d+)?$/;
export const kuyrukIsiMi = (p: PlanliPaket): boolean => typeof p.id === 'string' && KUYRUK_PAKETI.test(p.id) && !bolunmusMu(p) && p.tmi?.bitti !== true;
export interface KuyrukIstegi { istasyon: string; onceki: string[]; yeni: string[] }
export function kuyrukIstegi(istasyon: string, once: readonly PlanliPaket[], sonra: readonly PlanliPaket[]): KuyrukIstegi | null {
  const onceki = once.filter(kuyrukIsiMi).map((p) => p.id!), yeni = sonra.filter(kuyrukIsiMi).map((p) => p.id!);
  return onceki.length > 1 && onceki.length === yeni.length && onceki.some((x, i) => x !== yeni[i]) ? { istasyon, onceki, yeni } : null;
}

// Taşıma: iş `onceki` kimlikli işin önüne (yoksa sona) konur; `serit` istasyonun bütün paketleridir (gizli tamamlananlar dahil).
export function kuyrukTasimaIstegi(istasyon: string, serit: readonly PlanliPaket[], tasinan: PlanliPaket, onceki?: string | null): KuyrukIstegi | null {
  const yeni = serit.filter((x) => x !== tasinan);
  const i = onceki ? yeni.findIndex((x) => x.id === onceki) : -1;
  yeni.splice(i < 0 ? yeni.length : i, 0, tasinan);
  return kuyrukIstegi(istasyon, serit, yeni);
}
// Yukarı/aşağı: ekranda görünen kuyruk işleri içinde komşuyla yer değiştirir; dönen kimliğin önüne konur (undefined: sona), null: kıpırdamaz.
export function kuyrukAdimHedefi(gorunen: readonly PlanliPaket[], tasinan: PlanliPaket, yon: -1 | 1): string | undefined | null {
  const K = gorunen.filter(kuyrukIsiMi);
  const i = K.indexOf(tasinan), j = i + yon;
  if (i < 0 || j < 0 || j >= K.length) return null;
  return yon < 0 ? K[j]!.id : K[j + 1]?.id;
}

// "Plana öner": kuyruğun dizilişi kaynak başına plan sıralama isteğine çevrilir (A4 komutu; taslağa gider, müdür canlıya alınca geçer).
// Kuyrukla planın aynı olduğu kaynak için istek yoktur.
export function planaOneriIstekleri(serit: readonly PlanliPaket[]): SiralamaIstegi[] {
  const planda = serit.filter((p) => planliSira(p)?.kaynak);
  const kaynaklar = new Map<string, PlanKaynagi>();
  for (const p of planda) { const k = planliSira(p)!.kaynak!; kaynaklar.set(`${k.tur}:${k.id}`, k); }
  const sonuc: SiralamaIstegi[] = [];
  for (const k of kaynaklar.values()) {
    const bu = planda.filter((p) => { const x = planliSira(p)!.kaynak!; return x.tur === k.tur && x.id === k.id; });
    const istek = siralamaIstegi([...bu].sort(planSirasiyla), bu, bu[0]!);
    if (istek) sonuc.push(istek);
  }
  return sonuc;
}
