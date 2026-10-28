import type { FirmaTuru } from '#paylasilan/sozlesme/musteri-tedarikci.ts';

// Finans iş kuralları (saf). Numara (FNS-n) ON-PAKET-finans ve KURAL-TEST.md ile aynıdır.

export interface AlanHatasi { alan: string; ileti: string }

// Firma kartının kuralları (vergi no, Logo kilidi, aktiflik geçişi, arama sınırı) musteri-tedarikci modülündedir (kart #1164).

// FNS-60: kapanmamış faturası, dağıtılmamış ödemesi (avans) ya da sonuçlanmamış çeki olan firma pasife alınamaz.
// Tutarlar yalnız finans rakamlarını görebilen kullanıcıya yazılır (FNS-48); öteki kullanıcı yalnız ne kaldığını görür.
export interface AcikKayitOzeti { belge: number; belgeTl: string; avans: number; avansTl: string; cek: number; cekTl: string }
export function pasifeAlmaEngeli(o: AcikKayitOzeti, rakamGoster: boolean): string | null {
  const tl = (v: string): string => (rakamGoster ? ` (${Number(v).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} TL)` : '');
  const kalan: string[] = [];
  if (o.belge > 0) kalan.push(`${o.belge} açık fatura${tl(o.belgeTl)}`);
  if (o.avans > 0) kalan.push(`${o.avans} faturaya dağıtılmamış ödeme${tl(o.avansTl)}`);
  if (o.cek > 0) kalan.push(`${o.cek} sonuçlanmamış çek/senet${tl(o.cekTl)}`);
  if (kalan.length === 0) return null;
  return `Firma pasife alınamaz: ${kalan.join(', ')} var. Alınacak ve verilecek ödeme kalmayınca pasife alınabilir.`;
}

// =====================================================================
// Para kuralları (saf). Veritabanı tetikleyicileri aynı kuralları ikinci kez tutar.
// =====================================================================
export type Yon = 'gelir' | 'gider';
const kurus = (tutar: string | number): number => Math.round(Number(tutar) * 100);
const tl = (k: number): string => (k / 100).toFixed(2);

// FNS-1: KDV oranı belge tarihinde geçerli oranlardan biridir.
export interface KdvOraniKaydi { oran: string; gecerlilikBaslangic: string; gecerlilikBitis: string | null }
export function kdvOraniGecerliMi(oranlar: readonly KdvOraniKaydi[], oran: string, tarih: string): boolean {
  return oranlar.some((o) => Number(o.oran) === Number(oran) && o.gecerlilikBaslangic <= tarih && (o.gecerlilikBitis === null || tarih < o.gecerlilikBitis));
}

// FNS-51: satış yalnız müşteri ya da "ikisi", alış yalnız tedarikçi ya da "ikisi" türündeki firmaya açılır.
export function firmaYonaUygunMu(tur: FirmaTuru, yon: Yon): boolean {
  return tur === 'ikisi' || (yon === 'gelir' ? tur === 'musteri' : tur === 'tedarikci');
}

// FNS-51'in alış yanı başka modüllere: malzemeler ve satın alma tedarikçi seçerken kuralı kopyalamaz, buradan sorar.
export const tedarikciOlabilirMi = (tur: FirmaTuru): boolean => firmaYonaUygunMu(tur, 'gider');

// FNS-62 (karar D6 b): satın alma siparişine yalnız iptal edilmemiş alış faturası, siparişin tedarikçisinin faturası bağlanır.
export function siparisBagiHatasi(belge: { yon: Yon; durum: string; firmaId: number | null }, siparisFirmaId: number): string | null {
  if (belge.yon !== 'gider') return 'Siparişe yalnız alış faturası bağlanır.';
  if (belge.durum === 'iptal') return 'İptal edilmiş belge siparişe bağlanmaz.';
  if (belge.firmaId !== siparisFirmaId) return 'Faturanın firması siparişin tedarikçisi değil.';
  return null;
}

// FNS-66 (260 a): sipariş bağı yalnız satış faturasında; sipariş onaylı ya da kapanmış ve müşterisi faturanın firmasıdır.
// Sevk bağı yalnız siparişle birlikte olur. Sipariş yoksa (null) bağ istenmemiştir.
export function satisBagiHatasi(belge: { yon: Yon; tur: string; firmaId: number | null; sevkVar: boolean },
  siparis: { durum: string; firmaId: number } | null | undefined): string | null {
  if (siparis === null) return belge.sevkVar ? 'Sevk bağı yalnız siparişle birlikte girilir.' : null;
  if (siparis === undefined) return 'Sipariş bulunamadı.';
  if (belge.yon !== 'gelir' || belge.tur !== 'fatura') return 'Siparişe yalnız satış faturası bağlanır.';
  if (siparis.durum !== 'onayli' && siparis.durum !== 'kapandi') return 'Fatura yalnız onaylı ya da kapanmış siparişe bağlanır.';
  if (siparis.firmaId !== belge.firmaId) return 'Faturanın firması siparişin müşterisi değil.';
  return null;
}

// FNS-68 (260 a): faturaya iptal edilmemiş teslimat sevki bağlanır; sevkin bilinen müşterisi ve siparişi faturanınkidir.
// Sevkiyat bilmediğini null verir (noktası firmasız, ürünsüz ya da siparişsiz iş); bilinmeyen alan bağı engellemez.
// Bir sevk tek satış faturasıyla faturalanır; iptal edilen fatura ve iadeler sayılmaz (iade asılın sevkini taşır).
export function sevkBagiHatasi(fatura: { firmaId: number | null; siparisId: number | null },
  sevk: { tur: string; firmaId: number | null; siparisId: number | null; iptal: boolean } | null,
  oncekiFatura: { belgeNo: string | null } | null = null): string | null {
  if (sevk === null) return 'Sevk işi bulunamadı.';
  if (sevk.iptal) return 'İptal edilmiş sevk işine fatura bağlanmaz.';
  if (sevk.tur !== 'teslimat') return 'Faturaya yalnız teslimat sevki bağlanır.';
  if (sevk.firmaId !== null && sevk.firmaId !== fatura.firmaId) return 'Faturanın firması sevkin müşterisi değil.';
  if (sevk.siparisId !== null && sevk.siparisId !== fatura.siparisId) return 'Sevk başka bir siparişin.';
  if (oncekiFatura !== null) return `Bu sevk zaten faturalandı${oncekiFatura.belgeNo ? ` (${oncekiFatura.belgeNo})` : ''}; önce o faturayı iptal edin.`;
  return null;
}

// 302 a: satış formundaki sevk seçimi. Sevkiyat işi ürün satırı başına verir; iş bir kez, geldiği sırayla gösterilir, iptal edilen gösterilmez.
export function satisSevkleri(satirlar: readonly { isId: number; tarih: string; belgeNo: string | null; durum: string; iptal: boolean }[]):
  { id: number; tarih: string; belgeNo: string | null; durum: string }[] {
  const gorulen = new Set<number>();
  const sonuc = [];
  for (const s of satirlar) {
    if (s.iptal || gorulen.has(s.isId)) continue;
    gorulen.add(s.isId);
    sonuc.push({ id: s.isId, tarih: s.tarih, belgeNo: s.belgeNo, durum: s.durum });
  }
  return sonuc;
}

// FNS-67 (260 a): iade faturası iptal edilmemiş bir faturanın ters yönündedir (satış iadesi gider, alış iadesi gelir); firması ve para
// birimi asıl faturanınkidir. Asıl faturanın iadeleri toplamı asıl faturanın toplamını geçmez (kuruş olarak karşılaştırılır).
export function iadeHatasi(
  asil: { yon: Yon; tur: string; durum: string; firmaId: number | null; paraBirimi: string; toplam: string } | null,
  iade: { yon: Yon; kategori: string; firmaId: number | null; paraBirimi: string },
): string | null {
  if (asil === null) return 'İade edilen fatura bulunamadı.';
  if (asil.tur !== 'fatura') return 'Yalnız faturanın iadesi girilir.';
  if (asil.durum === 'iptal') return 'İptal edilmiş faturanın iadesi girilmez.';
  if (iade.yon === asil.yon) return 'İade faturası asıl faturanın ters yönündedir (satış iadesi gider, alış iadesi gelirdir).';
  if (iade.kategori !== (asil.yon === 'gelir' ? 'satis_iadesi' : 'alis_iadesi')) return 'İade faturasının kategorisi satış ya da alış iadesidir.';
  if (iade.firmaId !== asil.firmaId) return 'İade faturasının firması asıl faturanın firmasıdır.';
  if (iade.paraBirimi !== asil.paraBirimi) return 'İade faturasının para birimi asıl faturanınkidir.';
  return null;
}
export const iadeAsimi = (asilToplam: string, oncekiIadeler: string, buIade: string): boolean =>
  Math.round(Number(oncekiIadeler) * 100) + Math.round(Number(buIade) * 100) > Math.round(Number(asilToplam) * 100);

// FNS-65 (206 a, 211 a): genel gider her makine saatine aylık genel gider / aylık makine saati olarak eklenir (dört ondalık TL).
// Saat sıfır ya da girilmemişse oran bilinmez (null); sıfır uydurulmaz.
export function genelGiderSaatBasi(aylikGenelGider: string, aylikMakineSaati: string): number | null {
  const saat = Number(aylikMakineSaati);
  if (!(saat > 0)) return null;
  return Math.round((Number(aylikGenelGider) / saat) * 10_000) / 10_000;
}

// FNS-63 (kart #1124): siparişin ödeme planı faturası bağlanana kadar değişir; fatura gelince borcun vadesi faturadadır.
// FNS-64: plan en çok 12 satırdır, avans satırı vadeli satırdan sonra gelmez.
export const SIPARIS_PLANI_EN_COK = 12;
export function siparisOdemePlaniHatasi(satirlar: readonly { tur: 'avans' | 'vade' }[], faturali: boolean): string | null {
  if (faturali) return 'Faturası bağlanmış siparişin ödeme planı değişmez; vade faturadadır.';
  if (satirlar.length > SIPARIS_PLANI_EN_COK) return `Ödeme planı en çok ${SIPARIS_PLANI_EN_COK} satırdır.`;
  const ilkVade = satirlar.findIndex((x) => x.tur === 'vade');
  if (ilkVade >= 0 && satirlar.slice(ilkVade).some((x) => x.tur === 'avans')) return 'Avans satırları vadeli satırlardan önce gelir.';
  return null;
}

// Borç B15 (17.10.2026 onayı): siparişten beklenen ödeme tahmine girer, ama aynı para iki kez sayılmasın diye iki koruma var.
// Vadesi geçmiş plan satırı tahmine girmez (ödendi mi bilinmez, kontrol edilir). Firmaya ödenip faturaya dağıtılmamış para
// avans sayılır ve o firmanın avans satırlarından vade sırasıyla düşülür. Satırlar vade sırasıyla gelir; kuru olmayan satır düşülmez.
export interface BeklenenKoruma { avansDusulenTl: string; tahminTl: string | null; gecikmis: boolean }
export function beklenenOdemeKorumasi(
  satirlar: readonly { firmaId: number; tur: 'avans' | 'vade'; vade: string; tutarTl: string | null }[], avansTl: ReadonlyMap<number, string>, bugun: string,
): BeklenenKoruma[] {
  const kalan = new Map([...avansTl].map(([f, tl]) => [f, Math.max(0, Math.round(Number(tl) * 100))]));
  return satirlar.map((s) => {
    const gecikmis = s.vade < bugun;
    if (s.tutarTl === null) return { avansDusulenTl: '0.00', tahminTl: null, gecikmis };
    const tutar = Math.round(Number(s.tutarTl) * 100);
    const dus = s.tur === 'avans' ? Math.min(kalan.get(s.firmaId) ?? 0, tutar) : 0;
    if (dus > 0) kalan.set(s.firmaId, (kalan.get(s.firmaId) ?? 0) - dus);
    return { avansDusulenTl: (dus / 100).toFixed(2), tahminTl: ((tutar - dus) / 100).toFixed(2), gecikmis };
  });
}
// Ana sayfadaki "7 gün içinde ödeme" yanındaki sipariş tahmini: vadesi gelmemiş ve avansla kapanmamış satırlar; kuru eksik satır varsa tutar null.
export function yaklasanSiparisTahmini(satirlar: readonly BeklenenKoruma[]): { sayi: number; tutarTl: string | null } {
  const sayilan = satirlar.filter((s) => !s.gecikmis && s.tahminTl !== '0.00');
  if (sayilan.some((s) => s.tahminTl === null)) return { sayi: sayilan.length, tutarTl: null };
  return { sayi: sayilan.length, tutarTl: (sayilan.reduce((t, s) => t + Math.round(Number(s.tahminTl) * 100), 0) / 100).toFixed(2) };
}

// FNS-9 ve FNS-10: kapanmış, kısmen kapanmış ya da Logo'dan gelen veya eşleşmiş belgede parasal alan değişmez.
export interface BelgeKilitDurumu { kapanan: string; kaynak: 'elle' | 'logo'; logoEsleme: string | null; durum: string }
export function belgeDuzeltmeHatasi(b: BelgeKilitDurumu, paraAlaniDegisti: boolean): string | null {
  if (b.durum === 'iptal') return 'İptal edilmiş belge düzeltilemez.';
  if (!paraAlaniDegisti) return null;
  if (kurus(b.kapanan) > 0) return 'Kapanmış ya da kısmen kapanmış belgenin tutar, KDV, tevkifat, para birimi, kur, tarih ve firması değişmez; önce ödemesini iptal edin.';
  if (b.kaynak === 'logo' || b.logoEsleme === 'eslesti') return 'Logo\'dan gelen ya da Logo ile eşleşmiş belgenin bu alanları elle değişmez.';
  return null;
}

// K-9: dağıtım satırı belgenin para biriminde kapanan ve ödemenin para biriminde ödenen tutarı ve aradaki kuru taşır.
// Aynı para biriminde kur 1, iki tutar eşittir; farklı para biriminde kur zorunludur ve ödenen = kapanan x kur.
export interface DagitimIstegi { belgeId: number; belgeTutari: string; caprazKur: string | null }
export interface HesaplananDagitim { belgeId: number; belgeTutari: string; odemeTutari: string; caprazKur: string }
export function dagitimHesapla(belgeParaBirimi: string, odemeParaBirimi: string, d: DagitimIstegi): HesaplananDagitim | string {
  if (belgeParaBirimi === odemeParaBirimi) {
    if (d.caprazKur !== null && Number(d.caprazKur) !== 1) return 'Aynı para biriminde kur 1\'dir.';
    return { belgeId: d.belgeId, belgeTutari: d.belgeTutari, odemeTutari: d.belgeTutari, caprazKur: '1.00000000' };
  }
  if (d.caprazKur === null) return `Farklı para birimindeki belge için kur gerekli (1 ${belgeParaBirimi} = ? ${odemeParaBirimi}).`;
  // Veritabanı `round(belge_tutari * capraz_kur, 2)` ile denetler; kayan nokta yarım kuruşta ayrışmasın diye tamsayıyla.
  const odemeTutari = tl(Number((BigInt(kurus(d.belgeTutari)) * olcekli(d.caprazKur, 8) + 50_000_000n) / 100_000_000n));
  if (kurus(odemeTutari) <= 0) return 'Kurla hesaplanan ödeme tutarı sıfır olamaz.';
  return { belgeId: d.belgeId, belgeTutari: d.belgeTutari, odemeTutari, caprazKur: d.caprazKur };
}
// Ondalık metni 10^basamak ölçekli tamsayıya çevirir ("35.5" -> 3550000000 için basamak 8); fazla basamak yarım yukarı yuvarlanır.
function olcekli(metin: string, basamak: number): bigint {
  const [tam = '0', kesir = ''] = Number(metin).toFixed(basamak + 1).split('.');
  const deger = BigInt(tam + kesir);
  return (deger + 5n) / 10n;
}

// B-008, B-009 (kullanıcı kararı FK1): çapraz kur (1 birim belge/satış para birimi = ? birim ödeme/alış para birimi) iki para biriminin
// o günkü TL kurlarının oranından en çok `payYuzde` kadar sapar. O gün için kur girilmemişse kaydın kendi kuru kullanılır (sorgu);
// referans bulunamazsa denetim atlanmaz, kur istenir. Pay finans ayarındadır; veritabanı aynı ayarı okur.
export interface CaprazReferans { referans: number | null; payYuzde: number }
export function caprazKurHatasi(capraz: number, r: CaprazReferans, kaynakPb: string, hedefPb: string): string | null {
  if (r.referans === null || !(r.referans > 0)) return `1 ${kaynakPb} kaç ${hedefPb} bilinmiyor; Ayarlar > Kurlar'da o günün kurunu girin.`;
  const alt = r.referans * (1 - r.payYuzde / 100);
  const ust = r.referans * (1 + r.payYuzde / 100);
  if (capraz >= alt && capraz <= ust) return null;
  const k = (v: number): string => v.toLocaleString('tr-TR', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
  return `Girilen kur 1 ${kaynakPb} = ${k(capraz)} ${hedefPb}; referans kur ${k(r.referans)}, izin verilen aralık ${k(alt)} - ${k(ust)} (±%${r.payYuzde}). `
    + 'Kur doğruysa Ayarlar > Kurlar\'da o günün kurunu girin.';
}

// B-003: KDV dahil tutardan net tutar. Veritabanı KDV'yi netten `round(net * oran / 100, 2)` ile hesaplar; net, toplamı girilen
// tutara tam eşit veren kuruştur. Tek oranla hiçbir net o toplamı vermiyorsa (ör. %20'de 0,15) null döner.
export function kdvDahildenNet(brut: string, oran: string): string | null {
  const g = BigInt(kurus(brut));
  const o = olcekli(oran, 2);
  const kdv = (n: bigint): bigint => (n * o + 5_000n) / 10_000n;
  const tahmin = (g * 10_000n) / (10_000n + o);
  for (let n = tahmin - 2n; n <= tahmin + 2n; n += 1n) if (n > 0n && n + kdv(n) === g) return tl(Number(n));
  return null;
}

export function toplamOdeme(dagitimlar: readonly { odemeTutari: string }[]): string {
  return tl(dagitimlar.reduce((a, d) => a + kurus(d.odemeTutari), 0));
}
export function asiyorMu(a: string, sinir: string): boolean { return kurus(a) > kurus(sinir); }
export function farkTutar(a: string, b: string): string { return tl(kurus(a) - kurus(b)); }

// K-12: mahsupta aynı para biriminde iki taraf eşit kapanır; farklı para biriminde alış tarafı tutarı zorunludur.
export function mahsupTutarlari(satisPb: string, alisPb: string, satisTutari: string, alisTutari: string | null): { satisTutari: string; alisTutari: string } | string {
  if (satisPb === alisPb) {
    if (alisTutari !== null && kurus(alisTutari) !== kurus(satisTutari)) return 'Aynı para biriminde iki taraf eşit kapanır.';
    return { satisTutari, alisTutari: satisTutari };
  }
  if (alisTutari === null) return `Belgeler farklı para biriminde: alış belgesinde kapanacak tutarı (${alisPb}) girin.`;
  return { satisTutari, alisTutari };
}

// Ödeme yöntemi ile hesap türü (FNS-15).
export const YONTEM_HESAP_TURU = { nakit: 'kasa', banka: 'banka', kredi_karti: 'kredi_karti' } as const;

// FNS-22: çek ve senet durum geçişleri. İleri geçişler finans.yaz; karşılıksız, geri alma ve iptal finans.yonet (uç ayırır).
export type CekDurumu = 'portfoy' | 'tahsilde' | 'tahsil' | 'ciro' | 'karsiliksiz' | 'bekliyor' | 'odendi' | 'iptal';
export type CekKomutu = 'tahsile-ver' | 'tahsil' | 'odendi' | 'ciro' | 'karsiliksiz' | 'geri-al' | 'iptal';
const GECISLER: Record<CekKomutu, { yon: 'alinan' | 'verilen' | 'ikisi'; kaynak: CekDurumu[] }> = {
  'tahsile-ver': { yon: 'alinan', kaynak: ['portfoy'] },
  tahsil: { yon: 'alinan', kaynak: ['portfoy', 'tahsilde'] },
  odendi: { yon: 'verilen', kaynak: ['bekliyor'] },
  ciro: { yon: 'alinan', kaynak: ['portfoy'] },
  karsiliksiz: { yon: 'alinan', kaynak: ['portfoy', 'tahsilde', 'ciro'] },
  'geri-al': { yon: 'ikisi', kaynak: ['tahsilde', 'tahsil', 'ciro', 'odendi'] },
  iptal: { yon: 'ikisi', kaynak: ['portfoy', 'bekliyor'] },
};
export function cekGecisiHatasi(yon: 'alinan' | 'verilen', durum: CekDurumu, komut: CekKomutu): string | null {
  const g = GECISLER[komut];
  if (g.yon !== 'ikisi' && g.yon !== yon) return yon === 'alinan' ? 'Bu işlem yalnız verilen çekte yapılır.' : 'Bu işlem yalnız alınan çekte yapılır.';
  if (!g.kaynak.includes(durum)) return `Çek bu durumdayken (${durum}) bu işlem yapılamaz.`;
  return null;
}
// Geri almada önceki durum: tahsilde ve tahsil portföye, ciro portföye, ödendi beklemeye döner.
export function geriAlinanDurum(durum: CekDurumu): CekDurumu { return durum === 'odendi' ? 'bekliyor' : 'portfoy'; }

// FNS-32: bakiyesi sıfır olmayan hesap pasife alınamaz. FNS-59: hareketi olan hesabın açılış bakiyesi, tarihi ve para birimi değişmez.
export function hesapPasifHatasi(bakiye: string): string | null {
  return kurus(bakiye) === 0 ? null : 'Bakiyesi sıfır olmayan hesap pasife alınamaz; önce bakiyeyi aktarın ya da eşitleyin.';
}
export function hesapAcilisHatasi(hareketVar: boolean, degisti: boolean): string | null {
  return hareketVar && degisti ? 'Hareketi olan hesabın açılış bakiyesi, açılış tarihi ve para birimi değişmez.' : null;
}

// FNS-50: toplu içe aktarmada firma, koduyla ya da (kodla eşleşmezse) adıyla tek ve tam eşleşmelidir; büyük/küçük harf
// ve baştaki/sondaki boşluk farkı yok sayılır.
export interface EslesecekFirma { id: number; kod: string | null; ad: string; aktif: boolean; tur: FirmaTuru }
// Türkçe büyük harfte İ ile I ayrıdır; Excel'den gelen "FIRMA" ile kayıttaki "Firma" aynı sayılır.
const normal = (s: string): string => s.trim().toLocaleUpperCase('tr-TR').replace(/İ/g, 'I');
export function firmaEsle(metin: string, firmalar: readonly EslesecekFirma[]): EslesecekFirma | string {
  const m = normal(metin);
  const koda = firmalar.filter((f) => f.kod !== null && normal(f.kod) === m);
  const aday = koda.length > 0 ? koda : firmalar.filter((f) => normal(f.ad) === m);
  if (aday.length === 0) return `"${metin}" adlı ya da kodlu firma bulunamadı.`;
  if (aday.length > 1) return `"${metin}" birden çok firmaya uyuyor; firma kodunu yazın.`;
  const f = aday[0] as EslesecekFirma;
  if (!f.aktif) return `"${metin}" pasif bir firma.`;
  return f;
}

// FNS-61: düzeltme ve iptal deftere değişen her alanın önceki ve yeni değerini bırakır (çekirdek denetim eki: satır başına
// en çok 8 alan ve 512 bayt, en çok 100 satır). Sürüm ve kayıt zamanı her yazımda değiştiği için satır olmaz.
export type DefterDegeri = string | number | boolean | null;
export type DefterSatiri = Readonly<Record<string, DefterDegeri>>;
export const DEFTER_SATIR_SINIRI = 100;
// Metin değeri JSON biçimindeki bayt boyuyla kısaltılır (kaçış karakterleri dahil): iki değer ve kayıt adı birlikte satır
// sınırının altında kalır.
export const DEFTER_DEGER_BAYT_SINIRI = 200;
const DEFTER_DISI = new Set(['surum', 'olusturma', 'guncelleme']);
const kodlayici = new TextEncoder();
const jsonBayti = (metin: string): number => kodlayici.encode(JSON.stringify(metin)).length;

function defterDegeri(deger: unknown): DefterDegeri {
  if (deger === undefined || deger === null) return null;
  if (typeof deger === 'boolean' || (typeof deger === 'number' && Number.isFinite(deger))) return deger;
  const metin = typeof deger === 'string' ? deger : JSON.stringify(deger);
  if (jsonBayti(metin) <= DEFTER_DEGER_BAYT_SINIRI) return metin;
  let kisa = '';
  for (const harf of metin) {
    if (jsonBayti(`${kisa}${harf}…`) > DEFTER_DEGER_BAYT_SINIRI) break;
    kisa += harf;
  }
  return `${kisa}…`;
}

export function defterFarki(kayit: string, onceki: Readonly<Record<string, unknown>>, sonraki: Readonly<Record<string, unknown>>): DefterSatiri[] {
  const alanlar = [...new Set([...Object.keys(onceki), ...Object.keys(sonraki)])].filter((a) => !DEFTER_DISI.has(a));
  // Karşılaştırma kısaltmadan önce yapılır: başı aynı iki uzun metin değişiklik olarak kalır.
  const satirlar = alanlar
    .filter((alan) => JSON.stringify(onceki[alan] ?? null) !== JSON.stringify(sonraki[alan] ?? null))
    .map((alan) => ({ kayit, alan, onceki: defterDegeri(onceki[alan]), yeni: defterDegeri(sonraki[alan]) }));
  if (satirlar.length <= DEFTER_SATIR_SINIRI) return satirlar;
  return [...satirlar.slice(0, DEFTER_SATIR_SINIRI - 1), { kayit, alan: 'kesildi', onceki: null, yeni: satirlar.length }];
}

// ---- Amortisman (yönetim amaçlı) ----
// Ay 'YYYY-MM' biçimindedir. Amortisman alış ayından başlar, ömür ayı kadar sürer; pasif ayından sonra durur.
// Azalan bakiyeler: yıllık oran normalin iki katı, en çok yüzde 50; son yıl kalan değerin tamamı yazılır.
// Devirde, devir ayına kadarki tutar elle girilen birikmiştir; kalan tutar planın kalan aylarına aynı biçimle yayılır.
export interface AmortismanGirdisi {
  bedelTl: number; kalintiTl: number; alisAyi: string; omurAy: number; yontem: 'normal' | 'azalan';
  devirAyi: string | null; devirBirikmisTl: number | null; pasifAyi: string | null;
}
const ayNo = (ay: string): number => Number(ay.slice(0, 4)) * 12 + Number(ay.slice(5, 7)) - 1;
export const ayFarki = (bas: string, son: string): number => ayNo(son) - ayNo(bas);
export const ayEkle = (ay: string, n: number): string => {
  const t = ayNo(ay) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, '0')}`;
};

// Takvim günü kaydırma (UTC gece yarısı; saat dilimi kaymaz).
export function gunEkle(tarih: string, n: number): string {
  const t = new Date(`${tarih}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}

function hamPlan(baz: number, omur: number, yontem: 'normal' | 'azalan'): number[] {
  if (yontem === 'normal') return new Array<number>(omur).fill(baz / omur);
  const oran = Math.min(24 / omur, 0.5);
  const yillar = Math.ceil(omur / 12);
  const plan: number[] = [];
  let kalan = baz;
  for (let y = 0; y < yillar; y += 1) {
    const aylar = Math.min(12, omur - y * 12);
    const yillik = y === yillar - 1 ? kalan : kalan * oran;
    for (let a = 0; a < aylar; a += 1) plan.push(yillik / aylar);
    kalan -= yillik;
  }
  return plan;
}

// Aylık tutarlar kuruşa birikimli yuvarlanır: toplam bazı kuruşu kuruşuna tutar.
export function amortismanPlani(g: AmortismanGirdisi): number[] {
  const baz = Math.max(0, g.bedelTl - g.kalintiTl);
  let ham = hamPlan(baz, g.omurAy, g.yontem);
  if (g.devirAyi !== null && g.devirBirikmisTl !== null) {
    const d = ayFarki(g.alisAyi, g.devirAyi);
    const kalan = Math.max(0, baz - g.devirBirikmisTl);
    const kuyruk = ham.slice(d + 1).reduce((t, v) => t + v, 0);
    ham = ham.map((v, i) => (i <= d || kuyruk === 0 ? 0 : (v * kalan) / kuyruk));
  }
  const plan: number[] = [];
  let birikim = 0;
  let onceki = 0;
  for (const v of ham) {
    birikim += v;
    const yuvarlak = Math.round(birikim * 100) / 100;
    plan.push(Math.round((yuvarlak - onceki) * 100) / 100);
    onceki = yuvarlak;
  }
  return plan;
}

const aktifMi = (g: AmortismanGirdisi, ay: string): boolean => g.pasifAyi === null || ayFarki(g.pasifAyi, ay) <= 0;

export function aylikAmortisman(g: AmortismanGirdisi, ay: string, plan = amortismanPlani(g)): number {
  const i = ayFarki(g.alisAyi, ay);
  if (i < 0 || i >= plan.length || !aktifMi(g, ay)) return 0;
  return plan[i] ?? 0;
}

export function birikmisAmortisman(g: AmortismanGirdisi, ay: string, plan = amortismanPlani(g)): number {
  const son = g.pasifAyi !== null && ayFarki(g.pasifAyi, ay) > 0 ? g.pasifAyi : ay;
  const i = Math.min(ayFarki(g.alisAyi, son), plan.length - 1);
  if (i < 0) return 0;
  const devir = g.devirAyi !== null && g.devirBirikmisTl !== null && ayFarki(g.devirAyi, son) >= 0 ? g.devirBirikmisTl : 0;
  const toplam = plan.slice(0, i + 1).reduce((t, v) => t + v, 0) + devir;
  return Math.round(toplam * 100) / 100;
}

// Birim maliyeti: her tür kendi tablosunda ve anahtar sütunundadır. Sütun adı yalnız bu sabitten SQL'e girer.
export const MALIYET_TABLOLARI = {
  malzeme: { tablo: 'finans_malzeme_maliyet', anahtar: 'malzeme_no', tutar: 'birim_maliyet' },
  istasyon: { tablo: 'finans_istasyon_maliyet', anahtar: 'istasyon_id', tutar: 'saat_maliyeti' },
  kisi: { tablo: 'finans_kisi_maliyet', anahtar: 'kisi_id', tutar: 'saat_maliyeti' },
} as const;
export type MaliyetTuru = keyof typeof MALIYET_TABLOLARI;

// İlk giriş surum olmadan, düzeltme okunan sürümle gelir; ikisi karışırsa kayıt sessizce ezilmez.
export function maliyetYazimi(mevcutSurum: number | null, istenenSurum: number | null): 'ekle' | 'guncelle' | 'cakisma' | 'bulunamadi' {
  if (mevcutSurum === null) return istenenSurum === null ? 'ekle' : 'bulunamadi';
  if (istenenSurum === null) return 'cakisma';
  return istenenSurum === mevcutSurum ? 'guncelle' : 'cakisma';
}

// Kur ve faiz toplu yükleme (1085 a): kayıtlı olmayan satır eklenir; kayıtlı günle aynı değer de farklı değer de atlanır, düzeltme
// tek tek yapılır ki aynı günün kuru dosyayla sessizce değişmesin. Karşılaştırma sayıdır: '41.85' ile '41.850000' aynıdır.
export type TopluKurFaizKarari = 'ekle' | 'ayni' | 'farkli';
export function topluKurFaizKarari(deger: string, kayitli: string | undefined): TopluKurFaizKarari {
  if (kayitli === undefined) return 'ekle';
  return Number(kayitli) === Number(deger) ? 'ayni' : 'farkli';
}
// 1086 a: kur bugün ya da geçmiş günündür, faiz ileri tarihten başlayabilir. İlk ileri tarihli kur satırının sırası (0'dan), yoksa null.
export function ileriTarihliKurSirasi(satirlar: readonly { tur: 'kur' | 'faiz'; tarih: string }[], bugun: string): number | null {
  const i = satirlar.findIndex((s) => s.tur === 'kur' && s.tarih > bugun);
  return i < 0 ? null : i;
}

// Vergi takvimi (891, 1162 b): Finans ekranının vergi takvimiyle aynı genel kural (istemci finans motoru `taxDay` ve
// `taxCalendar`; iki kopya UYUM-BORCU'dadır). Son gün ayın verilen günüdür, ay kısaysa son günü; cumartesi ve pazar
// pazartesiye kayar. Resmî tatil ve süre uzatma sirküleri hesaba katılmaz. Dönem bir önceki aydır.
export interface VergiGunu { tarih: string; kod: string; ad: string; donem: string }

const AY_ADLARI = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const ikiHane = (n: number): string => String(n).padStart(2, '0');

export function vergiSonGunu(yil: number, ay: number, gun: number): string {
  const ayinSonu = new Date(Date.UTC(yil, ay, 0)).getUTCDate();
  const t = new Date(Date.UTC(yil, ay - 1, Math.min(gun, ayinSonu)));
  const hg = t.getUTCDay();
  if (hg === 6) t.setUTCDate(t.getUTCDate() + 2);
  if (hg === 0) t.setUTCDate(t.getUTCDate() + 1);
  return `${String(t.getUTCFullYear())}-${ikiHane(t.getUTCMonth() + 1)}-${ikiHane(t.getUTCDate())}`;
}

// [baslangic, bitis] içine düşen son günler, tarih sırasıyla. Kayma ayı aşabildiği için bir ay önceden başlanır.
export function vergiTakvimi(baslangic: string, bitis: string): VergiGunu[] {
  const sonuc: VergiGunu[] = [];
  let yil = Number(baslangic.slice(0, 4));
  let ay = Number(baslangic.slice(5, 7)) - 1;
  if (ay === 0) { ay = 12; yil -= 1; }
  const sonYil = Number(bitis.slice(0, 4));
  const sonAy = Number(bitis.slice(5, 7));
  while (yil < sonYil || (yil === sonYil && ay <= sonAy)) {
    const onceki = ay === 1 ? { y: yil - 1, a: 12 } : { y: yil, a: ay - 1 };
    const donem = `${AY_ADLARI[onceki.a - 1] ?? ''} ${String(onceki.y)}`;
    const ekle = (gun: number, kod: string, ad: string, d = donem) => { sonuc.push({ tarih: vergiSonGunu(yil, ay, gun), kod, ad, donem: d }); };
    ekle(25, 'kdv-tevkifat', "KDV tevkifatı (2 no'lu) beyanı ve ödemesi");
    ekle(26, 'muhtasar', 'Muhtasar ve prim hizmet beyannamesi');
    ekle(28, 'kdv', 'KDV beyannamesi ve ödemesi');
    if ([2, 5, 8, 11].includes(ay)) ekle(17, 'gecici-vergi', 'Geçici vergi beyanı ve ödemesi', 'Önceki çeyrek');
    if (ay === 4) ekle(30, 'kurumlar-vergisi', 'Yıllık kurumlar vergisi beyannamesi', 'Önceki yıl');
    if (ay === 3) ekle(31, 'gelir-vergisi', 'Yıllık gelir vergisi beyannamesi', 'Önceki yıl');
    ay += 1;
    if (ay === 13) { ay = 1; yil += 1; }
  }
  return sonuc.filter((v) => v.tarih >= baslangic && v.tarih <= bitis)
    .sort((a, b) => (a.tarih < b.tarih ? -1 : a.tarih > b.tarih ? 1 : a.kod < b.kod ? -1 : 1));
}
