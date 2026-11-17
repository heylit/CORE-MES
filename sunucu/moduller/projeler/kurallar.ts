// Saf iş kuralları; veritabanı ve saat yok. Kural numaraları KURAL-TEST.md'de testlerine bağlıdır.

export const PROJE_YOK = 'Proje bulunamadı.';
export const KOD_KULLANILIYOR = 'Bu proje kodu kullanılıyor.';
export const FIRMA_YOK = 'Firma bulunamadı.';
export const FIRMA_PASIF = 'Pasif firma projeye seçilemez.';
export const SIPARIS_ONAYSIZ = 'Proje yalnız onaylı siparişten açılır.';
export const FIRMA_SIPARISTEN = 'Siparişe bağlı projenin firması siparişin firmasıdır; değiştirilemez.';

// PRJ-05: pasif firma yeni seçilemez; projenin zaten bağlı olduğu firma pasifleşse de proje onda kalabilir.
export function firmaReddi(
  firma: { var: boolean; aktif: boolean }, firmaId: number, mevcutFirmaId: number | null,
): string | null {
  if (!firma.var) return FIRMA_YOK;
  if (!firma.aktif && firmaId !== mevcutFirmaId) return FIRMA_PASIF;
  return null;
}

// Aramada kod büyük harfle tutulur; ad büyük-küçük harf duyarsız aranır (SQL tarafı ILIKE).
export function aramaKalibi(ara: string | undefined): string | null {
  const m = ara?.trim();
  if (!m) return null;
  return `%${m.replace(/[\\%_]/g, (k) => `\\${k}`)}%`;
}

// PRJ-07: proje yalnız onaylı siparişten açılır; taslak, kapanmış ve iptal sipariş reddedilir.
export function siparisReddi(durum: string): string | null {
  return durum === 'onayli' ? null : SIPARIS_ONAYSIZ;
}

// PRJ-08: siparişe bağlı projenin firması siparişten gelir ve düzenlemede değişmez.
export function siparisFirmasiReddi(siparisId: number | null, mevcutFirmaId: number | null, yeniFirmaId: number | null): string | null {
  if (siparisId === null) return null;
  return yeniFirmaId === mevcutFirmaId ? null : FIRMA_SIPARISTEN;
}

// PRJ-09: bütçeyi yalnız maliyet gören yazar; görmeyenin gövdesindeki bütçe yok sayılır ve var olan değer kalır. Tutar varsa
// para birimi verilmediğinde TRY'dir, tutar yoksa para birimi de yoktur.
export interface Butce { butceTutari: string | null; butceParaBirimi: string | null }
// PRJ-16: düzenlemede gönderilmeyen tutar (`undefined`) var olanı korur; `null` siler.
export function butce(gorur: boolean, tutar: string | null | undefined, paraBirimi: string | null | undefined, mevcut: Butce | null): Butce {
  if (!gorur || tutar === undefined) return mevcut ?? { butceTutari: null, butceParaBirimi: null };
  if (tutar === null) return { butceTutari: null, butceParaBirimi: null };
  return { butceTutari: tutar, butceParaBirimi: paraBirimi ?? 'TRY' };
}

// --- Proje yönetimi (890 c) ---

export const STATU_YOK = 'Statü bulunamadı.';
export const STATU_ETKIN_DEGIL = 'Bu statü artık seçilemiyor.';
export const SERBEST_STATU_KAPALI = 'Statü yalnız listeden seçilebilir.';
export const PROJE_KAPALI = 'Tamamlanmış ya da iptal edilmiş projede görev ve kilometre taşı yazılmaz.';
export const KILOMETRE_TASI_YOK = 'Kilometre taşı bulunamadı.';
export const GOREV_YOK = 'Görev bulunamadı.';
export const TABAN_AYNI = 'Yeni taban tarih eskisiyle aynı.';
export const BITTI_GERCEK_BITIS = 'Biten görevin gerçekleşen bitiş tarihi zorunlu.';
export const GERCEK_BASLANGIC_GEREKLI = 'Gerçekleşen bitiş için gerçekleşen başlangıç da gerekli.';
export const GERCEK_SIRASI = 'Gerçekleşen bitiş başlangıçtan önce olamaz.';
export const ONCEKI_DONGU = 'Önce bitmesi gereken görev zinciri kendine dönüyor.';

// PRJ-11: listeden seçilen statü var ve etkin olmalı; elle yazılan statü yalnız ayar açıkken kabul edilir.
export function statuReddi(
  g: { statuId: number | null; metin: string | null }, statu: { etkin: boolean } | null, serbestIzin: boolean,
): { ileti: string; alan: string } | null {
  if (g.statuId !== null) {
    if (statu === null) return { ileti: STATU_YOK, alan: 'statuId' };
    if (!statu.etkin) return { ileti: STATU_ETKIN_DEGIL, alan: 'statuId' };
    return null;
  }
  return serbestIzin ? null : { ileti: SERBEST_STATU_KAPALI, alan: 'metin' };
}

// PRJ-17: kapanmış (tamamlandı ya da iptal) proje gerekçesiz yeniden aktife alınmaz; açılış statü geçmişine bu adla yazılır.
export const YENIDEN_ACILDI = 'Yeniden açıldı';
export const YENIDEN_ACMA_GEREKCESI = 'Kapanmış projeyi yeniden açmak için gerekçe yazın.';
export function yenidenAcmaMi(eski: string, yeni: string): boolean {
  return eski !== 'aktif' && yeni === 'aktif';
}
export function yenidenAcmaReddi(eski: string, yeni: string, gerekce: string | null): string | null {
  return yenidenAcmaMi(eski, yeni) && gerekce === null ? YENIDEN_ACMA_GEREKCESI : null;
}

// PRJ-15: görev ve kilometre taşı yalnız aktif projede yazılır; statü her durumda yazılır (kapanış notu için).
export function projeAcikReddi(durum: string): string | null {
  return durum === 'aktif' ? null : PROJE_KAPALI;
}

// PRJ-12: görevin gerçekleşen tarihleri ve durumu tutarlı olmalı. "Bitti" gerçekleşen bitiş ister ve ilerlemeyi 100'e çeker;
// geri açılan görevde ilerleme kişinin yazdığıdır.
export function gorevDurumuDuzelt(g: {
  durum: string; ilerleme: number; gercekBaslangic: string | null; gercekBitis: string | null;
}): { ilerleme: number } | { ileti: string; alan: string } {
  if (g.gercekBitis !== null && g.gercekBaslangic === null) return { ileti: GERCEK_BASLANGIC_GEREKLI, alan: 'gercekBaslangic' };
  if (g.gercekBitis !== null && g.gercekBaslangic !== null && g.gercekBitis < g.gercekBaslangic) return { ileti: GERCEK_SIRASI, alan: 'gercekBitis' };
  if (g.durum === 'bitti') return g.gercekBitis === null ? { ileti: BITTI_GERCEK_BITIS, alan: 'gercekBitis' } : { ilerleme: 100 };
  return { ilerleme: g.ilerleme };
}

// PRJ-12: "önce bitmesi gereken" zinciri döngü kuramaz. `oncekiler` projedeki görev -> önceki görev eşlemesidir (yazılacak bağ hariç).
export function oncekiDonguVarMi(gorevId: number, oncekiId: number | null, oncekiler: ReadonlyMap<number, number | null>): boolean {
  const gorulen = new Set<number>();
  for (let s: number | null = oncekiId; s !== null; s = oncekiler.get(s) ?? null) {
    if (s === gorevId) return true;
    if (gorulen.has(s)) return false;
    gorulen.add(s);
  }
  return false;
}

// PRJ-13: taban tarih yalnız gerekçeyle ve gerçekten değişince yenilenir.
export function tabanReddi(eski: string, yeni: string): string | null {
  return eski === yeni ? TABAN_AYNI : null;
}

// PRJ-14: proje ilerlemesi, iptal dışındaki görevlerin plan süresi (gün, uçlar dahil) ağırlıklı ortalaması; görev yoksa null.
export function projeIlerlemesi(gorevler: readonly { durum: string; ilerleme: number; planBaslangic: string; planBitis: string }[]): number | null {
  let agirlik = 0;
  let toplam = 0;
  for (const g of gorevler) {
    if (g.durum === 'iptal') continue;
    const gun = Math.round((Date.parse(`${g.planBitis}T00:00:00Z`) - Date.parse(`${g.planBaslangic}T00:00:00Z`)) / 864e5) + 1;
    agirlik += gun;
    toplam += gun * g.ilerleme;
  }
  return agirlik === 0 ? null : Math.round(toplam / agirlik);
}

// PRJ-18 (3244 b): siparişten açılan projede bitiş girilmezse ya da siparişin terminine eşitse bitiş termindir ve ona bağlı kalır;
// başka tarih girilirse bağsızdır. Başlangıç terminden sonraysa bitiş boş ve bağsız kalır (PRJ-04 bozulmaz).
export function acilisBitisi(girilen: string | null, baslangic: string | null, termin: string): { bitis: string | null; bagli: boolean } {
  if (girilen !== null && girilen !== termin) return { bitis: girilen, bagli: false };
  if (baslangic !== null && baslangic > termin) return { bitis: girilen, bagli: false };
  return { bitis: termin, bagli: true };
}

export const SIPARISSIZ_BAGLANMAZ = 'Bu proje siparişten açılmadı; bitiş bir termine bağlanamaz.';
export const KAPALI_BAGLANMAZ = 'Kapanmış projenin bitişi termine bağlanmaz.';
export const BASLANGIC_TERMINDEN_SONRA = 'Başlangıç sipariş termininden sonra; bitiş termine bağlanamaz.';
// PRJ-18: bitiş yalnız siparişten açılan aktif projede ve başlangıç terminden sonra değilse yeniden bağlanır.
export function bitisBaglaReddi(p: { siparisId: number | null; durum: string; baslangic: string | null }, termin: string | null): string | null {
  if (p.siparisId === null || termin === null) return SIPARISSIZ_BAGLANMAZ;
  if (p.durum !== 'aktif') return KAPALI_BAGLANMAZ;
  return p.baslangic !== null && p.baslangic > termin ? BASLANGIC_TERMINDEN_SONRA : null;
}

// --- 3269: görev atama, akış ve şablon ---

export const GOREV_KAPALI = 'Bitmiş ya da iptal edilmiş görev işlenmez.';
export const USTLENILEMEZ = 'Bu görev rolüne açık değil.';
export const BASKASI_USTLENDI = 'Bu görevi başka biri üstlendi.';
export const SANA_ATANMADI = 'Bu görev sana atanmadı.';
export const BASLANAMAZ = 'Görev yalnız "Yapılacak" ya da "Bekliyor" iken başlar.';
export const BITIRILEMEZ = 'Görev kontrolde, bitmiş ya da iptal; yeniden bitirilemez.';
export const KONTROLDE_DEGIL = 'Görev kontrolde değil.';
export const KONTROLUN_DEGIL = 'Bu görevin kontrolü sana atanmadı.';
export const KENDI_ISIN = 'Kendi yaptığın görevi kontrol edemezsin.';
export const KONTROLLU_DURUM = 'Kontrol edeni olan görev düzenlemeyle bitmez ya da kontrole geçmez; yapan "Bitti" der, kontrol eden onaylar.';
export const KONTROLSUZ_KONTROLDE = 'Kontrol edeni olmayan görev kontrole geçmez.';
export const SABLON_YOK = 'Şablon bulunamadı.';
export const SABLON_KAPALI = 'Bu şablon kapatılmış; seçilemez.';
export const ONCEKI_KALEM_SIRASI = 'Önceki görev listede bu görevden önce olmalı.';

// Kontrol bu kadar gün kontrolde kalırsa (ya da asıl kontrol eden işi yapan kişiyse) yedek kontrol eden de onaylar (3269 V9).
export const YEDEK_GUN = 2;

export interface GorevAtamasi {
  durum: string;
  sorumluKisiId: number | null;
  yapanRolId: number | null;
  kontrolKisiId: number | null;
  kontrolRolId: number | null;
  yedekKontrolKisiId: number | null;
  yedekKontrolRolId: number | null;
}
export interface Isleyen { kisiId: number; rolIdleri: readonly number[] }

export const kontrolluMu = (g: Pick<GorevAtamasi, 'kontrolKisiId' | 'kontrolRolId'>): boolean => g.kontrolKisiId !== null || g.kontrolRolId !== null;
const kapaliMi = (durum: string): boolean => durum === 'bitti' || durum === 'iptal';
// 3303-1 c: görev silinmez, iptal edilir; iptal görev listede kalır, proje ilerlemesine sayılmaz (PRJ-14). Kontrolde bekleyen de
// iptal edilebilir: iptal onay değildir, görevi bitmiş saymaz.
export const IPTAL_EDILEMEZ = 'Bitmiş ya da zaten iptal edilmiş görev iptal edilemez.';
export const iptalReddi = (durum: string): string | null => (kapaliMi(durum) ? IPTAL_EDILEMEZ : null);
const rolde = (rolId: number | null, k: Isleyen): boolean => rolId !== null && k.rolIdleri.includes(rolId);

// Üstlenme: kişiye atanmamış, kişinin rolüne açık, kapanmamış ve kontrolde olmayan görev. Zaten kendisindeyse red yoktur (servis yazmaz).
export function ustlenReddi(g: GorevAtamasi, k: Isleyen): string | null {
  if (kapaliMi(g.durum) || g.durum === 'kontrolde') return GOREV_KAPALI;
  if (g.sorumluKisiId !== null) return g.sorumluKisiId === k.kisiId ? null : BASKASI_USTLENDI;
  return rolde(g.yapanRolId, k) ? null : USTLENILEMEZ;
}

// Başlatma ve bitirme yalnız göreve atanmış kişinin işidir; rol görevi önce üstlenilir.
export function baslaReddi(g: GorevAtamasi, k: Isleyen): string | null {
  if (g.sorumluKisiId !== k.kisiId) return SANA_ATANMADI;
  return g.durum === 'yapilacak' || g.durum === 'bekliyor' ? null : BASLANAMAZ;
}

// Bitirme: kontrollü görev kontrole geçer, kontrolsüz görev biter.
export function bitirSonucu(g: GorevAtamasi, k: Isleyen): { durum: 'kontrolde' | 'bitti' } | { ileti: string } {
  if (g.sorumluKisiId !== k.kisiId) return { ileti: SANA_ATANMADI };
  if (g.durum === 'kontrolde' || kapaliMi(g.durum)) return { ileti: BITIRILEMEZ };
  return { durum: kontrolluMu(g) ? 'kontrolde' : 'bitti' };
}

// Onay ve geri gönderme: kontrol eden kişi ya da rolündeki kişi. İşi bitiren kişi (son "bitti" olayı) ve göreve atanmış yapan
// kontrol edemez. Yedek kontrol eden yalnız asıl kontrol eden işi bitiren kişiyse ya da görev YEDEK_GUN gündür kontroldeyse onaylar.
export function kontrolReddi(g: GorevAtamasi, k: Isleyen, bitirenId: number | null, kontroldeGun: number): string | null {
  if (g.durum !== 'kontrolde') return KONTROLDE_DEGIL;
  if (k.kisiId === bitirenId || k.kisiId === g.sorumluKisiId) return KENDI_ISIN;
  const asil = g.kontrolKisiId === k.kisiId || rolde(g.kontrolRolId, k);
  if (asil) return null;
  const yedek = g.yedekKontrolKisiId === k.kisiId || rolde(g.yedekKontrolRolId, k);
  const asilYapan = g.kontrolKisiId !== null && g.kontrolKisiId === bitirenId;
  return yedek && (asilYapan || kontroldeGun >= YEDEK_GUN) ? null : KONTROLUN_DEGIL;
}

// Düzenleme ucu (görev yazan) kontrollü görevi bitiremez ve kontrole sokamaz: dört göz atlanmasın (Risk 3269 K2). Durumu
// değişmeyen görev olduğu gibi kalır; kontrolsüz görev kontrole geçmez.
export function duzenlemeDurumReddi(eski: string, yeni: string, kontrollu: boolean): string | null {
  if (yeni === eski) return null;
  if (yeni === 'kontrolde') return kontrollu ? KONTROLLU_DURUM : KONTROLSUZ_KONTROLDE;
  if (yeni === 'bitti' && kontrollu) return KONTROLLU_DURUM;
  return null;
}

export const KONTROLDE_ATAMA = 'Kontrol bekleyen görevin kontrol edeni ve yedeği değişmez; önce onaylanmalı ya da geri gönderilmeli.';
type KontrolAtamasi = { kontrolKisiId: number | null; kontrolRolId: number | null; yedekKontrolKisiId: number | null; yedekKontrolRolId: number | null };
// K2: kontrolü kimin yapacağı iş bittikten sonra seçilmez; kontrolde bekleyen görevde kontrol eden ve yedeği sabittir.
export function kontroldeAtamaReddi(durum: string, eski: KontrolAtamasi, yeni: KontrolAtamasi): string | null {
  if (durum !== 'kontrolde') return null;
  const degisti = eski.kontrolKisiId !== yeni.kontrolKisiId || eski.kontrolRolId !== yeni.kontrolRolId
    || eski.yedekKontrolKisiId !== yeni.yedekKontrolKisiId || eski.yedekKontrolRolId !== yeni.yedekKontrolRolId;
  return degisti ? KONTROLDE_ATAMA : null;
}

// Kişinin bu görevde açılan düğmeleri (ekran); yazma aynı kurallarla ayrıca denetlenir.
export function gorevIzinleri(
  g: GorevAtamasi, k: Isleyen, islem: { isle: boolean; kontrol: boolean }, bitirenId: number | null, kontroldeGun: number,
): { ustlenebilir: boolean; baslayabilir: boolean; bitirebilir: boolean; onaylayabilir: boolean } {
  return {
    ustlenebilir: islem.isle && g.sorumluKisiId === null && ustlenReddi(g, k) === null,
    baslayabilir: islem.isle && baslaReddi(g, k) === null,
    bitirebilir: islem.isle && !('ileti' in bitirSonucu(g, k)),
    onaylayabilir: islem.kontrol && kontrolReddi(g, k, bitirenId, kontroldeGun) === null,
  };
}

// Proje görevlerim: kişinin göreve göre yeri. Kontrolündeki görev önce gelir; kişinin bitirdiği ve kontrolde bekleyen görev bilgi içindir.
export function gorevlerimTuru(
  g: GorevAtamasi, k: Isleyen, bitirenId: number | null, kontroldeGun: number,
): 'bana' | 'rolume' | 'kontrolumde' | 'yaptim' | null {
  if (kapaliMi(g.durum)) return null;
  if (g.durum === 'kontrolde') {
    if (kontrolReddi(g, k, bitirenId, kontroldeGun) === null) return 'kontrolumde';
    return g.sorumluKisiId === k.kisiId || bitirenId === k.kisiId ? 'yaptim' : null;
  }
  if (g.sorumluKisiId === k.kisiId) return 'bana';
  return g.sorumluKisiId === null && rolde(g.yapanRolId, k) ? 'rolume' : null;
}

const GUN_MS = 864e5;
const tarihEkle = (tarih: string, gun: number): string => new Date(Date.parse(`${tarih}T00:00:00Z`) + gun * GUN_MS).toISOString().slice(0, 10);

// Şablon kalemi tarihleri: dayanak proje başlangıcı ya da bitişi (termin); proje tarihi yoksa bugün. Başlangıç + gün, süre uçlar dahil.
export function sablonTarihleri(
  k: { dayanak: 'baslangic' | 'termin'; gun: number; sureGun: number }, proje: { baslangic: string | null; bitis: string | null }, bugun: string,
): { planBaslangic: string; planBitis: string } {
  const temel = k.dayanak === 'termin' ? proje.bitis ?? proje.baslangic ?? bugun : proje.baslangic ?? bugun;
  const planBaslangic = tarihEkle(temel, k.gun);
  return { planBaslangic, planBitis: tarihEkle(planBaslangic, k.sureGun - 1) };
}

// --- 3396 a: hazırlık görevinin kademeli takibi ---

export interface KademeAyari { hatirlatGun: number; yoneticiGun: number; devretGun: number }
// İş günü: hafta sonu ve İK'nın resmî tatilleri sayılmaz. (bas, bit] aralığındaki iş günü sayısı; bit önce ise eksi.
export function isGunuFarki(bas: string, bit: string, tatiller: ReadonlySet<string>): number {
  if (bas === bit) return 0;
  const yon = bit > bas ? 1 : -1;
  let sayi = 0;
  for (let t = tarihEkle(bas, yon); ; t = tarihEkle(t, yon)) {
    const gun = new Date(`${t}T00:00:00Z`).getUTCDay();
    if (gun !== 0 && gun !== 6 && !tatiller.has(t)) sayi += 1;
    if (t === bit) return yon * sayi;
  }
}

// Görevin bugün ulaşması gereken kademeler. K1 atanınca; K2 son güne en çok `hatirlatGun` iş günü kala; K3 son gün geçince;
// K4 `yoneticiGun`, K5 `devretGun` iş günü gecikince (gecikme son günden sonraki iş günleri). Yapanı olmayan görev K1'e girmez,
// ama gecikince yöneticiye çıkar: atanmamış iş de yapılmamış iştir.
export function gerekenKademeler(g: { planBitis: string; yapanVar: boolean }, ayar: KademeAyari, bugun: string, tatiller: ReadonlySet<string>): number[] {
  const l: number[] = [];
  if (g.yapanVar) l.push(1);
  const kalan = isGunuFarki(bugun, g.planBitis, tatiller);
  if (g.yapanVar && kalan <= ayar.hatirlatGun) l.push(2);
  if (bugun > g.planBitis) {
    const gecikme = isGunuFarki(g.planBitis, bugun, tatiller);
    if (g.yapanVar) l.push(3);
    if (gecikme >= Math.max(1, ayar.yoneticiGun)) l.push(4);
    if (gecikme >= Math.max(1, ayar.devretGun)) l.push(5);
  }
  return l;
}

// Kesintiden sonra yalnız en yüksek yeni kademe bildirilir; aradakiler bildirimsiz deftere girer. K1 hiç bildirilmez (atama zili ayrıdır).
export function bildirilecekKademe(gereken: readonly number[], yazilmis: ReadonlySet<number>): { yeni: number[]; bildirilecek: number | null } {
  const yeni = gereken.filter((k) => !yazilmis.has(k));
  const en = yeni.length === 0 ? null : Math.max(...yeni);
  return { yeni, bildirilecek: en === null || en === 1 ? null : en };
}
