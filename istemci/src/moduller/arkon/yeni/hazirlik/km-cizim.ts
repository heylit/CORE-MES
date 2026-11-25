import type { KmNumunePlani, KmResim } from '#paylasilan/sozlesme/kalite-merkezi-studyo.ts';
import { cizimBalonu } from '../../../kalite-merkezi/disari.ts';
import type { NumuneKurali, NumuneZamani, Olcen, Pkg, PlanItem } from './tipler.ts';

// Teknik resim ve balonların sahibi Kalite Merkezi'dir (789): TMI emrinden gelen pakette Hazırlık balon tanımını yazmaz, Kalite Merkezi'nden
// alır. Plan maddesi Kalite Merkezi balonunun kimliğini taşır (795 a); operatör ölçüsü sunucuda o kimlikle Kalite Merkezi'ne yazılır.

// Paketin hangi Kalite Merkezi resminden ve hangi sürümünden kurulduğu; sürüm artınca "değişti" görünür.
export interface KmBagi { id: number; surum: number }

export function kmBagi(p: Readonly<Record<string, unknown>>): KmBagi | null {
  const b = p['kmResim'];
  if (b === null || typeof b !== 'object') return null;
  const { id, surum } = b as Record<string, unknown>;
  return typeof id === 'number' && typeof surum === 'number' ? { id, surum } : null;
}

// Balon tanımı yalnız Kalite Merkezi'ndedir; malzemesi olmayan eski paket kendi planını düzenlemeyi sürdürür.
export const kmSahibi = (p: Pick<Pkg, 'malzemeNo'>): boolean => typeof p.malzemeNo === 'number';

// Operasyona (adıma) Kalite Merkezi'nde balon grubu bağlıysa yalnız o grubun balonları gelir; bağlı grup yoksa resmin bütün balonları (3693).
// Eşleşme rotanın güncel operasyon numarasıyladır (paketteki tmi.opNo).
export function kmOpBalonlari(r: Pick<KmResim, 'balonlar'> & { gruplar?: KmResim['gruplar'] }, opNo: number | null): { balonlar: KmResim['balonlar']; grup: string | null } {
  const atanan = opNo === null ? [] : (r.gruplar ?? []).filter((g) => g.operasyonlar.some((o) => o.opNo === opNo));
  if (atanan.length === 0) return { balonlar: r.balonlar, grup: null };
  const nolar = new Set(atanan.flatMap((g) => g.balonlar));
  return { balonlar: r.balonlar.filter((b) => nolar.has(b.no)), grup: atanan.map((g) => g.ad).join(', ') };
}

export function kmPlani(r: Pick<KmResim, 'balonlar'> & { gruplar?: KmResim['gruplar'] }, opNo: number | null = null): PlanItem[] {
  // Ortak parçanın yazı kutusu (ar) dizi, modelin tipi sayı der; Hazırlık balonları aynı biçimde saklar (balonlarYaz).
  return kmOpBalonlari(r, opNo).balonlar.map((b) => ({ freq: 'İlk parça', crit: false, ...cizimBalonu(b), kmBalon: b.id }) as PlanItem);
}

// Kendiliğinden ya da elle alınan planın kaynak satırı: resim adı, revizyon, balon sayısı ve adıma göre ayırma durumu.
export function kmAlimEtiketi(r: Pick<KmResim, 'ad' | 'revizyon' | 'balonlar'> & { gruplar?: KmResim['gruplar'] }, opNo: number | null): string {
  const { balonlar, grup } = kmOpBalonlari(r, opNo);
  return [r.ad, r.revizyon ? 'Rev ' + r.revizyon : null, `${String(balonlar.length)} balon`, grup === null ? 'adıma göre ayırma yok' : `"${grup}" grubu`].filter((x) => x !== null).join(' · ');
}

// Planın ya da resmin nereden geldiği (otoKaynak): 'km' Kalite Merkezi, 'rota' rota, 'sablon' şablon, 'el' kişi bilerek değiştirdi ya da boşalttı.
// Alanı 'el' olan paket bir daha kendiliğinden doldurulmaz. Yayın geçmişine yazılmaz; paket kartında ayrı satır olarak okunur.
export type OtoKaynakAlani = 'plan' | 'resim' | 'depo';
export type OtoKaynak = NonNullable<Pkg['otoKaynak']>[OtoKaynakAlani];
export function otoKaynakOku(p: Readonly<Record<string, unknown>>, alan: OtoKaynakAlani): NonNullable<OtoKaynak> | null {
  const o = p['otoKaynak'];
  const k = o !== null && typeof o === 'object' ? (o as Record<string, unknown>)[alan] : undefined;
  if (k === null || typeof k !== 'object') return null;
  const { kaynak } = k as { kaynak?: unknown };
  return kaynak === 'km' || kaynak === 'rota' || kaynak === 'sablon' || kaynak === 'el' ? (k as NonNullable<OtoKaynak>) : null;
}
export function otoKaynakYaz(p: Readonly<Record<string, unknown>>, alan: OtoKaynakAlani, k: NonNullable<OtoKaynak>): { otoKaynak: NonNullable<Pkg['otoKaynak']> } {
  const o = p['otoKaynak'];
  return { otoKaynak: { ...(o !== null && typeof o === 'object' ? (o as NonNullable<Pkg['otoKaynak']>) : {}), [alan]: k } };
}

export type KmResimDurumu = 'pakette' | 'degisti' | 'yok';
export function kmResimDurumu(p: Readonly<Record<string, unknown>>, r: Pick<KmResim, 'id' | 'surum'>): KmResimDurumu {
  const b = kmBagi(p);
  if (!b || b.id !== r.id) return 'yok';
  return b.surum === r.surum ? 'pakette' : 'degisti';
}

export const etkinResimler = (l: readonly KmResim[]): KmResim[] => l.filter((r) => r.aktif);

// Boş ve bağsız paket Kalite Merkezi'nin balonlu etkin resmiyle kendiliğinden kurulur (3687, 3701): tek aday resim varsa alınır, birden çoksa
// kişiye seçtirilir (yanlış resmin planı sessizce gelmez), hiç yoksa nedeni söylenir. Elle girilmiş plan kalemi, bağ ya da kişinin bilerek
// boşalttığı alan ('el') kendiliğinden değiştirilmez. Kendiliğinden dolum yalnız taslakta ve elle konmuş dosyası olmayan pakette yazılır: yayındaki
// paket terminale doğrudan okunur, kişi onaylamadan değişmesin; orada ve elle dosyası olan pakette yalnız "Kalite Merkezi'nden al" önerilir (oner).
export type KmBosNedeni = 'resimsiz' | 'balonsuz';
export type KmKarari = { tur: 'al'; resim: KmResim } | { tur: 'oner'; adaylar: KmResim[] } | { tur: 'sec'; adaylar: KmResim[] } | { tur: 'bos'; neden: KmBosNedeni };
// Elle (Çizim Merkezi dışından) eklenmiş dosya varsa Kalite Merkezi resmi onun yerine geçmez.
export const kmDosyaElle = (p: Readonly<Pick<Pkg, 'files'>>): boolean => p.files.some((f) => typeof f.merkez !== 'number');
export const kmKendiliginden = (p: Readonly<Pick<Pkg, 'files' | 'status'>>): boolean => p.status === 'draft' && !kmDosyaElle(p);
export const kmAdayResimleri = (l: readonly KmResim[]): KmResim[] => etkinResimler(l).filter((r) => r.eski !== true && r.tur === 'resim' && r.balonlar.length > 0);
export function kmOtomatikKarari(p: Readonly<Pick<Pkg, 'malzemeNo' | 'files' | 'status'>> & Readonly<Record<string, unknown>>, resimler: readonly KmResim[]): KmKarari | null {
  if (!kmSahibi(p) || kmBagi(p) !== null || (Array.isArray(p['plan']) && p['plan'].length > 0) || otoKaynakOku(p, 'plan')?.kaynak === 'el') return null;
  const adaylar = kmAdayResimleri(resimler);
  if (adaylar.length === 1) return kmKendiliginden(p) ? { tur: 'al', resim: adaylar[0]! } : { tur: 'oner', adaylar };
  if (adaylar.length > 1) return { tur: 'sec', adaylar };
  return { tur: 'bos', neden: etkinResimler(resimler).some((r) => r.eski !== true && r.tur === 'resim') ? 'balonsuz' : 'resimsiz' };
}
export const KM_BOS_NEDENI: Readonly<Record<KmBosNedeni, string>> = {
  resimsiz: 'Parçanın Kalite Merkezi’nde resmi yok. Teknik resim ve balonlar Kalite Merkezi stüdyosunda hazırlanır.',
  balonsuz: 'Parçanın resmi var ama hiçbirinde balon yok. Balonlar Kalite Merkezi stüdyosunda eklenir.',
};

// Boş, bağsız ve kişinin bilerek boşaltmadığı paket Kalite Merkezi'nden doldurulabilir (resim bilgisi ayrıca aranır).
export const kmDoldurulabilir = (p: Readonly<Pkg>): boolean =>
  kmSahibi(p) && kmBagi(p) === null && p.plan.length === 0 && otoKaynakOku(p, 'plan')?.kaynak !== 'el' && kmKendiliginden(p);
// Toplu "Kalite Merkezi'nden doldur": yalnız boş ve bağsız paketlere dokunur; aynı kural tek pakette de geçerlidir (kmOtomatikKarari).
// Parçanın verisi okunamadıysa ya da okuma yetkisi yoksa paket atlanır ve nedeni söylenir.
export type KmParcaVerisi = { resimler: readonly KmResim[] } | 'yetkisiz' | 'hata' | 'bekliyor';
export interface KmTopluSatiri { hedef: Pkg; resim: KmResim | null; neden: string | null }
export function kmTopluNedeni(p: Readonly<Pkg>, veri: KmParcaVerisi | undefined): { resim: KmResim | null; neden: string | null } {
  if (!kmSahibi(p)) return { resim: null, neden: 'paket malzeme kartına bağlı değil' };
  if (kmBagi(p) !== null) return { resim: null, neden: 'zaten Kalite Merkezi’ne bağlı' };
  if (p.plan.length > 0) return { resim: null, neden: 'kontrol planı dolu' };
  if (otoKaynakOku(p, 'plan')?.kaynak === 'el') return { resim: null, neden: 'plan bilerek boş bırakıldı' };
  if (p.status !== 'draft') return { resim: null, neden: 'yayında; önce geri çekin ya da paketi açıp tek tek alın' };
  if (kmDosyaElle(p)) return { resim: null, neden: 'elle eklenmiş resim dosyası var; paketi açıp tek tek alın' };
  if (veri === 'yetkisiz') return { resim: null, neden: 'Kalite Merkezi’ni okuma yetkisi yok' };
  if (veri === 'hata') return { resim: null, neden: 'Kalite Merkezi okunamadı' };
  if (veri === undefined || veri === 'bekliyor') return { resim: null, neden: 'Kalite Merkezi okunuyor' };
  const karar = kmOtomatikKarari(p, veri.resimler);
  if (karar?.tur === 'al') return { resim: karar.resim, neden: null };
  if (karar?.tur === 'oner') return { resim: null, neden: 'doldurulamaz' };
  if (karar?.tur === 'sec') return { resim: null, neden: `balonlu ${String(karar.adaylar.length)} resim var, önce resmi seçin` };
  return { resim: null, neden: karar?.tur === 'bos' ? KM_BOS_KISA[karar.neden] : 'doldurulamaz' };
}
const KM_BOS_KISA: Readonly<Record<KmBosNedeni, string>> = { resimsiz: 'parçanın Kalite Merkezi’nde resmi yok', balonsuz: 'resimlerde balon yok' };
export const kmTopluPlani = (hedefler: readonly Pkg[], veri: ReadonlyMap<number, KmParcaVerisi>): KmTopluSatiri[] =>
  hedefler.map((hedef) => ({ hedef, ...kmTopluNedeni(hedef, typeof hedef.malzemeNo === 'number' ? veri.get(hedef.malzemeNo) : undefined) }));

// Hedef paket Kalite Merkezi'nden dolduysa benzer paketin resmi ve planı varsayılan olarak alınmaz (üzerine yazılır).
export const kmDolduruldu = (p: Readonly<Record<string, unknown>>): boolean => kmBagi(p) !== null;

// 3689: numune planının sahibi Kalite Merkezi'dir (parça x operasyon). Pakete çevrilmiş kuralı `samp`'ta, hangi sürümden geldiğini `kmNumune`'de
// taşır; terminal ve ilk parça kapısı `samp`'ı okumaya devam eder. Balon numarası plan maddesi kimliğidir (kmPlani).
// Sunucu paket yazarken aynı çeviriyi denetler (sunucu/moduller/arkon/km-numune-ceviri.ts); iki yerin testi aynı beklentiyi taşır.
const ZAMAN: Readonly<Record<'ilk' | 'her' | 'sure' | 'vardiya' | 'son', NumuneZamani>> = { ilk: 'first', her: 'every', sure: 'time', vardiya: 'shift', son: 'last' };
export function kmNumuneKurallari(plan: Pick<KmNumunePlani, 'kurallar'>): NumuneKurali[] {
  return plan.kurallar.map((k) => ({
    id: k.kimlik,
    when: ZAMAN[k.ne],
    ...(k.n === undefined ? {} : { n: k.n }),
    who: k.kim.map((w): Olcen => (w === 'kalite' ? 'q' : 'op')),
    items: k.balonlar === 'hepsi' ? 'all' : k.balonlar === 'kritik' ? 'crit' : [...k.balonlar],
    ...(k.kapi === undefined ? {} : { gate: k.kapi }),
  }));
}

export interface KmNumuneBagi { surum: number }
export function kmNumuneBagi(p: Readonly<Record<string, unknown>>): KmNumuneBagi | null {
  const b = p['kmNumune'];
  if (b === null || typeof b !== 'object') return null;
  const { surum } = b as Record<string, unknown>;
  return typeof surum === 'number' ? { surum } : null;
}
// Paket tek operasyona bağlıdır (tmi.opNo); Kalite Merkezi planı operasyon numarasıyla bulunur.
export function kmNumunePlani(p: Readonly<Record<string, unknown>>, planlar: readonly KmNumunePlani[]): KmNumunePlani | null {
  const t = p['tmi'];
  const opNo = t !== null && typeof t === 'object' ? (t as { opNo?: unknown }).opNo : undefined;
  return typeof opNo === 'number' ? planlar.find((x) => x.opNo === opNo) ?? null : null;
}
// yok: Kalite Merkezi'nde bu operasyonun planı tanımlı değil; pakette: pakettekiyle aynı sürüm; degisti: Kalite Merkezi'nde daha yeni sürüm var;
// bagsiz: plan var ama pakete alınmamış.
export type KmNumuneDurumu = 'yok' | 'pakette' | 'degisti' | 'bagsiz';
export function kmNumuneDurumu(p: Readonly<Record<string, unknown>>, plan: Pick<KmNumunePlani, 'surum'> | null): KmNumuneDurumu {
  if (plan === null) return 'yok';
  const b = kmNumuneBagi(p);
  return b === null ? 'bagsiz' : b.surum === plan.surum ? 'pakette' : 'degisti';
}
// Taslakta, bağı ve elle yazılmış kuralı olmayan pakete kendiliğinden gelir (3687 ile aynı ilke); yayındaki paket "Güncelle" ile elle alır.
export function otomatikKmNumunesi(p: Readonly<Pick<Pkg, 'malzemeNo' | 'status' | 'samp'>> & Readonly<Record<string, unknown>>, planlar: readonly KmNumunePlani[]): KmNumunePlani | null {
  if (!kmSahibi(p) || p.status !== 'draft' || kmNumuneBagi(p) !== null || (Array.isArray(p.samp) && p.samp.length > 0)) return null;
  const plan = kmNumunePlani(p, planlar);
  return plan !== null && plan.kurallar.length > 0 ? plan : null;
}
