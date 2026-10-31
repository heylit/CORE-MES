// Sevkiyat iş kuralları: saf fonksiyonlar ve sabitler; veritabanı ve saat yok.
// Algoritma dosyaları (yol-agi.ts, cozucu.ts) kural sabitlerini buradan alır.
import type { Islem } from '#paylasilan/islemler.ts';
import type { KapanisMaddeBilgisi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import type { Arac, ElleTuru, GunPlaniCevabi, KalemKaynagi, KalemYonu, Tasima, TekRotaCevabi, TumIsAsamasi } from '#paylasilan/sozlesme/sevkiyat.ts';
import type { RotaOgesi } from './cozucu.ts';

export type GunTipi = 'hafta-ici' | 'cuma' | 'cumartesi' | 'pazar';
export type AracTuru = 'binek' | 'kamyonet' | 'kamyon';
export type Amac = 'sure' | 'mesafe' | 'maliyet';
export type IsTuru = 'teslimat' | 'alim' | 'aktarma';
export type YolSinifi = 'motorway' | 'trunk' | 'primary' | 'secondary' | 'tertiary';
export const GUN_TIPLERI: readonly GunTipi[] = ['hafta-ici', 'cuma', 'cumartesi', 'pazar'];
export const ARAC_TURLERI: readonly AracTuru[] = ['binek', 'kamyonet', 'kamyon'];
export const AMACLAR: readonly Amac[] = ['sure', 'mesafe', 'maliyet'];

// ---------- onay bekleyen sayısal varsayımlar (ON-PAKET bölüm 1) ----------
// Kent içi serbest akış hızları (km/sa) ve rampa hızı.
export const SERBEST_HIZ: Record<YolSinifi, number> = { motorway: 88, trunk: 66, primary: 50, secondary: 40, tertiary: 32 };
export const RAMPA_HIZI = 38;
// Araç türünün binek hızına oranı.
export const ARAC_HIZ_KATSAYISI: Record<AracTuru, number> = { binek: 1, kamyonet: 0.93, kamyon: 0.8 };
// TL: kilometre başına yakıt + lastik/bakım, sürücünün saatlik işveren maliyeti, aracın kullanıldığı günün sabit gideri.
export interface MaliyetOranlari { kilometre: number; saat: number; gunluk: number }
// Örnek değerlerdir; araç kaydında oran girilmezse bunlar kullanılır.
export const VARSAYILAN_MALIYET: Record<AracTuru, MaliyetOranlari> = {
  binek: { kilometre: 7, saat: 330, gunluk: 600 },
  kamyonet: { kilometre: 10, saat: 330, gunluk: 1000 },
  kamyon: { kilometre: 21, saat: 400, gunluk: 1800 },
};
// Fabrikada teslimat seferi başında yükleme, alım dönüşünde boşaltma; araç başına günde en çok sefer.
export const YUKLEME_DAKIKA = 15;
export const BOSALTMA_DAKIKA = 15;
export const EN_COK_SEFER = 3;
// Amaç bedelleri: en hızlıda her kullanılan araç ve her ek sefer dakika karşılığı, bekleme süresinin ağırlığı;
// en kısada aynı bedellerin kilometre karşılığı. Az araç ve az sefer tercih edilir.
export const ARAC_BEDELI_DAKIKA = 45, SEFER_BEDELI_DAKIKA = 12, BEKLEME_AGIRLIGI = 0.3;
export const ARAC_BEDELI_KILOMETRE = 25, SEFER_BEDELI_KILOMETRE = 4;
// Tek rotada en çok durak (en iyi sıra kesin aranır) ve Google bağlantısının taşıdığı en çok ara durak.
export const EN_COK_TEK_ROTA_DURAGI = 9;
export const GOOGLE_ARA_DURAK_SINIRI = 9;

export const NOKTA_TURLERI = ['fabrika', 'musteri', 'tedarikci', 'fason', 'kargo', 'diger'] as const;
export type NoktaTuru = (typeof NOKTA_TURLERI)[number];
export const IS_TURLERI: readonly IsTuru[] = ['teslimat', 'alim', 'aktarma'];
export const EN_COK_DURAK_SURESI_DAKIKA = 240;

// "YYYY-AA-GG" tarihinin gün tipi; trafik profili buna göre seçilir. Hesap tarih üzerinden, saat dilimine bakmaz.
export function gunTipi(tarih: string): GunTipi {
  const [yil, ay, ayinGunu] = tarih.split('-').map(Number) as [number, number, number];
  const haftaGunu = new Date(Date.UTC(yil, ay - 1, ayinGunu)).getUTCDay();
  return haftaGunu === 0 ? 'pazar' : haftaGunu === 6 ? 'cumartesi' : haftaGunu === 5 ? 'cuma' : 'hafta-ici';
}

// "SS:DD" ya da "SS:DD:ss" saatini gün içi dakikaya çevirir; geçersizse null.
export function saattenDakika(saat: string | null): number | null {
  if (saat === null) return null;
  const eslesme = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(saat);
  if (!eslesme) return null;
  const saatDegeri = Number(eslesme[1]), dakikaDegeri = Number(eslesme[2]);
  if (saatDegeri > 24 || dakikaDegeri > 59 || (saatDegeri === 24 && dakikaDegeri > 0)) return null;
  return saatDegeri * 60 + dakikaDegeri;
}

export interface IsGirdisi {
  tur: IsTuru;
  alisNoktasiId: number | null; birakisNoktasiId: number | null;
  agirlikKilogram: number; paletSayisi: number;
  durakSuresiDakika: number | null;
  alisEnErken: string | null; alisEnGec: string | null; birakisEnErken: string | null; birakisEnGec: string | null;
}

export interface KuralIhlali { alan: string; ileti: string }

function pencereIhlali(alan: string, erken: string | null, gec: string | null): KuralIhlali | null {
  if ((erken === null) !== (gec === null)) return { alan, ileti: 'Zaman aralığının iki ucu birlikte girilir.' };
  if (erken === null || gec === null) return null;
  const baslangicDakikasi = saattenDakika(erken), bitisDakikasi = saattenDakika(gec);
  if (baslangicDakikasi === null || bitisDakikasi === null) return { alan, ileti: 'Saat SS:DD biçiminde girilir.' };
  if (baslangicDakikasi >= bitisDakikasi) return { alan, ileti: 'Aralığın başı sonundan önce olmalı.' };
  return null;
}

// Teslimat fabrikadan bırakış noktasına, alım alış noktasından fabrikaya, al-bırak iki ayrı nokta arasındadır.
export function isIhlalleri(girdi: IsGirdisi): KuralIhlali[] {
  const ihlal: KuralIhlali[] = [];
  if (girdi.tur === 'teslimat') {
    if (girdi.birakisNoktasiId === null) ihlal.push({ alan: 'birakisNoktasiId', ileti: 'Teslimatın bırakış noktası seçilmeli.' });
    if (girdi.alisNoktasiId !== null) ihlal.push({ alan: 'alisNoktasiId', ileti: 'Teslimat fabrikadan yüklenir; alış noktası seçilmez.' });
  } else if (girdi.tur === 'alim') {
    if (girdi.alisNoktasiId === null) ihlal.push({ alan: 'alisNoktasiId', ileti: 'Alımın alış noktası seçilmeli.' });
    if (girdi.birakisNoktasiId !== null) ihlal.push({ alan: 'birakisNoktasiId', ileti: 'Alım fabrikaya getirilir; bırakış noktası seçilmez.' });
  } else {
    if (girdi.alisNoktasiId === null) ihlal.push({ alan: 'alisNoktasiId', ileti: 'Al-bırak işinin alış noktası seçilmeli.' });
    if (girdi.birakisNoktasiId === null) ihlal.push({ alan: 'birakisNoktasiId', ileti: 'Al-bırak işinin bırakış noktası seçilmeli.' });
    if (girdi.alisNoktasiId !== null && girdi.alisNoktasiId === girdi.birakisNoktasiId) ihlal.push({ alan: 'birakisNoktasiId', ileti: 'Alış ve bırakış aynı nokta olamaz.' });
  }
  if (!(girdi.agirlikKilogram >= 0) || !(girdi.paletSayisi >= 0) || !Number.isInteger(girdi.paletSayisi)) ihlal.push({ alan: 'agirlikKilogram', ileti: 'Ağırlık ve palet sayısı eksi olamaz; palet tam sayıdır.' });
  else if (girdi.agirlikKilogram === 0 && girdi.paletSayisi === 0) ihlal.push({ alan: 'agirlikKilogram', ileti: 'Ağırlık ya da palet sayısından en az biri sıfırdan büyük olmalı.' });
  if (girdi.durakSuresiDakika !== null && (!Number.isInteger(girdi.durakSuresiDakika) || girdi.durakSuresiDakika < 0 || girdi.durakSuresiDakika > EN_COK_DURAK_SURESI_DAKIKA)) {
    ihlal.push({ alan: 'durakSuresiDakika', ileti: `Durak süresi 0 ile ${EN_COK_DURAK_SURESI_DAKIKA} dakika arasında olmalı.` });
  }
  const alis = pencereIhlali('alisEnErken', girdi.alisEnErken, girdi.alisEnGec);
  if (alis) ihlal.push(alis);
  else if (girdi.alisEnErken !== null && girdi.tur === 'teslimat') ihlal.push({ alan: 'alisEnErken', ileti: 'Teslimatta alış fabrikadadır; alış aralığı girilmez.' });
  const birakis = pencereIhlali('birakisEnErken', girdi.birakisEnErken, girdi.birakisEnGec);
  if (birakis) ihlal.push(birakis);
  else if (girdi.birakisEnErken !== null && girdi.tur === 'alim') ihlal.push({ alan: 'birakisEnErken', ileti: 'Alımda bırakış fabrikadadır; bırakış aralığı girilmez.' });
  return ihlal;
}

export interface AracGirdisi {
  kapasiteKilogram: number; kapasitePalet: number; musaitBaslangic: string; musaitBitis: string;
  kilometreMaliyeti: number | null; saatMaliyeti: number | null; gunlukMaliyet: number | null;
}

export function aracIhlalleri(girdi: AracGirdisi): KuralIhlali[] {
  const ihlal: KuralIhlali[] = [];
  if (!(girdi.kapasiteKilogram > 0)) ihlal.push({ alan: 'kapasiteKilogram', ileti: 'Ağırlık kapasitesi sıfırdan büyük olmalı.' });
  if (!(girdi.kapasitePalet >= 0) || !Number.isInteger(girdi.kapasitePalet)) ihlal.push({ alan: 'kapasitePalet', ileti: 'Palet kapasitesi sıfır ya da pozitif tam sayıdır.' });
  const a = saattenDakika(girdi.musaitBaslangic), b = saattenDakika(girdi.musaitBitis);
  if (a === null || b === null) ihlal.push({ alan: 'musaitBaslangic', ileti: 'Saat SS:DD biçiminde girilir.' });
  else if (a >= b) ihlal.push({ alan: 'musaitBitis', ileti: 'Müsaitlik bitişi başlangıçtan sonra olmalı.' });
  for (const [alan, deger] of [['kilometreMaliyeti', girdi.kilometreMaliyeti], ['saatMaliyeti', girdi.saatMaliyeti], ['gunlukMaliyet', girdi.gunlukMaliyet]] as const) {
    if (deger !== null && !(deger >= 0)) ihlal.push({ alan, ileti: 'Maliyet eksi olamaz; boş bırakılırsa araç türünün örnek değeri kullanılır.' });
  }
  return ihlal;
}

// ---------- gün planı yapısı ----------

export interface PlandakiIs { id: number; tur: IsTuru }
export interface PlanRotasiGirdisi { aracId: number; kilitli: boolean; ogeler: ({ isId: number; alis: boolean } | { araDonus: true })[] }

// Elle kaydedilen planın yapısı: her işin her ucu en çok bir kez, uç işin türüne uygun, araç ve iş bu güne ait.
// Zaman, kapasite ve sıra ihlalleri yapı hatası değildir: kaydedilir ve uyarı olarak gösterilir.
export function planYapisiIhlalleri(rotalar: readonly PlanRotasiGirdisi[], isler: readonly PlandakiIs[], aracIdleri: readonly number[]): KuralIhlali[] {
  const ihlal: KuralIhlali[] = [], isBul = new Map(isler.map((i) => [i.id, i])), aracVar = new Set(aracIdleri);
  const gorulenArac = new Set<number>(), gorulenUc = new Set<string>();
  for (const r of rotalar) {
    if (!aracVar.has(r.aracId)) ihlal.push({ alan: 'rotalar', ileti: `Araç ${r.aracId} aktif değil ya da yok.` });
    if (gorulenArac.has(r.aracId)) ihlal.push({ alan: 'rotalar', ileti: `Araç ${r.aracId} planda iki kez var.` });
    gorulenArac.add(r.aracId);
    for (const o of r.ogeler) {
      if ('araDonus' in o) continue;
      const is = isBul.get(o.isId);
      if (!is) { ihlal.push({ alan: 'rotalar', ileti: `İş ${o.isId} bu güne ait değil ya da iptal edilmiş.` }); continue; }
      if (o.alis && is.tur === 'teslimat') ihlal.push({ alan: 'rotalar', ileti: `İş ${o.isId} teslimattır; alış ucu yoktur.` });
      if (!o.alis && is.tur === 'alim') ihlal.push({ alan: 'rotalar', ileti: `İş ${o.isId} alımdır; bırakış ucu yoktur.` });
      const anahtar = `${o.isId}:${o.alis}`;
      if (gorulenUc.has(anahtar)) ihlal.push({ alan: 'rotalar', ileti: `İş ${o.isId} planda iki kez var.` });
      gorulenUc.add(anahtar);
    }
  }
  return ihlal;
}

// Al-bırak işinin iki ucu aynı araçta olmalı; tek ucu verilen iş rotaya diğer ucuyla tamamlanır (alış önce, bırakış sonra).
export function rotalariTamamla(rotalar: readonly PlanRotasiGirdisi[], isler: readonly PlandakiIs[]): PlanRotasiGirdisi[] {
  const tur = new Map(isler.map((i) => [i.id, i.tur])), sonuc: PlanRotasiGirdisi[] = [];
  const tasindi = new Map<number, number>(); // al-bırak işi -> ilk görüldüğü araç
  for (const r of rotalar) for (const o of r.ogeler) if (!('araDonus' in o) && tur.get(o.isId) === 'aktarma' && !tasindi.has(o.isId)) tasindi.set(o.isId, r.aracId);
  for (const r of rotalar) {
    const ogeler: PlanRotasiGirdisi['ogeler'] = [];
    for (const o of r.ogeler) {
      if ('araDonus' in o) { ogeler.push(o); continue; }
      if (tur.get(o.isId) === 'aktarma' && tasindi.get(o.isId) !== r.aracId) continue;
      ogeler.push(o);
    }
    for (const o of ogeler.slice()) {
      if ('araDonus' in o || tur.get(o.isId) !== 'aktarma') continue;
      const alisVar = ogeler.some((x) => !('araDonus' in x) && x.isId === o.isId && x.alis), birakisVar = ogeler.some((x) => !('araDonus' in x) && x.isId === o.isId && !x.alis);
      if (!alisVar) ogeler.splice(ogeler.findIndex((x) => !('araDonus' in x) && x.isId === o.isId), 0, { isId: o.isId, alis: true });
      if (!birakisVar) ogeler.push({ isId: o.isId, alis: false });
    }
    sonuc.push({ ...r, ogeler: araDonusleriTemizle(ogeler) });
  }
  return sonuc;
}

// Baştaki, sondaki ve art arda gelen ara dönüşler anlamsızdır.
export function araDonusleriTemizle<T extends { isId: number; alis: boolean } | { araDonus: true }>(ogeler: readonly T[]): T[] {
  const o: T[] = [];
  for (const x of ogeler) { if ('araDonus' in x && (!o.length || 'araDonus' in o[o.length - 1]!)) continue; o.push(x); }
  while (o.length && 'araDonus' in o[o.length - 1]!) o.pop();
  return o;
}

export const cozucuOgeleri = (ogeler: PlanRotasiGirdisi['ogeler']): RotaOgesi[] =>
  ogeler.map((o) => ('araDonus' in o ? { araDonus: true as const } : { is: String(o.isId), alis: o.alis }));

// ---------- nokta ve iş kayıt kuralları ----------

// Aynı anda tek aktif fabrika: başka aktif fabrika varken bir nokta fabrika olamaz.
export const ikinciFabrikaMi = (yeniTur: string, aktifFabrikaId: number | null, kendiId: number | null): boolean =>
  yeniTur === 'fabrika' && aktifFabrikaId !== null && aktifFabrikaId !== kendiId;
// İşte kullanılan nokta fabrikaya çevrilemez (fabrika işin noktası olamaz).
export const fabrikayaCevrilemez = (oncekiTur: string, yeniTur: string, isteKullaniliyor: boolean): boolean =>
  yeniTur === 'fabrika' && oncekiTur !== 'fabrika' && isteKullaniliyor;
// Fabrika kaldırılamaz (karar, açık soru 8): aktif fabrika pasifleştirilmez, türü değiştirilmez; fabrika taşınınca
// konum Sistem Ayarları'nda güncellenir (930 a). Rotalar fabrikadan çıkar; fabrikasız gün planı onaylanamaz.
// Firma bağı yalnız firmanın kendisi olan noktada (kargo, fabrika, diğer firmanın yeri değildir).
export const firmaBaglanabilir = (tur: string): boolean => tur === 'musteri' || tur === 'tedarikci' || tur === 'fason';
// 1264 a: müşteri, tedarikçi ve fason noktası firma kartına bağlı yazılır; adı karttan gelir. Bağsız eski nokta listede kalır,
// düzeltilirken firmaya bağlanır.
export const NOKTA_FIRMASI_GEREKIR = 'Müşteri, tedarikçi ve fason noktası bir firmaya bağlanır; firmayı seçin.';
export const noktaFirmasizMi = (tur: string, firmaId: number | null): boolean => firmaBaglanabilir(tur) && firmaId === null;

export const AKTIF_FABRIKA_KALDIRILAMAZ = 'Aktif fabrika noktası pasifleştirilemez ya da başka türe çevrilemez; fabrika taşındıysa konumunu Sistem Ayarları\'nda güncelleyin.';
export const FABRIKA_KONUMU_AYARDA = 'Fabrikanın konumu Sistem Ayarları > Genel > Firma konumu\'nda girilir; önce orada girin.';
export function fabrikaKaldirilir(onceki: { tur: string; aktif: boolean }, yeniTur: string | null): boolean {
  return onceki.tur === 'fabrika' && onceki.aktif && yeniTur !== 'fabrika';
}

// Onaylı plan korunur (karar, açık soru 12): bugün ya da ileri tarihli onaylı planda kullanılan araç ve nokta, onay
// kaldırılmadan değiştirilemez ve pasifleştirilemez. Geçmiş planlar kayıttır; aracın bugünkü hâlini kilitlemez.
export function onayliPlanIletisi(ne: 'Araç' | 'Nokta', tarihler: readonly string[]): string | null {
  if (tarihler.length === 0) return null;
  const liste = tarihler.slice(0, 3).join(', ') + (tarihler.length > 3 ? ` ve ${tarihler.length - 3} gün daha` : '');
  return `${ne} onaylı planda kullanılıyor (${liste}); önce o günün onayını kaldırın.`;
}

// İşin noktası var, aktif ve fabrika değil.
export function isNoktasiIhlali(alan: string, nokta: { tur: string; aktif: boolean } | null): KuralIhlali | null {
  if (!nokta || !nokta.aktif) return { alan, ileti: 'Seçilen nokta bulunamadı ya da pasif.' };
  if (nokta.tur === 'fabrika') return { alan, ileti: 'Fabrika işin başı ya da sonudur; nokta olarak seçilmez.' };
  return null;
}
// Gün ya da tür değişen iş planda yerini yitirir ve bekleyene döner.
export const plandanCikarilmali = (onceki: { tarih: string; tur: string }, yeni: { tarih: string; tur: string }): boolean =>
  onceki.tarih !== yeni.tarih || onceki.tur !== yeni.tur;
// Ekranın gördüğü sürüm (plan yoksa null) güncel sürümle aynı olmalı; değilse başkası arada yazmıştır.
export const surumGuncel = (guncelSurum: number | null, gorulenSurum: number | null): boolean => guncelSurum === gorulenSurum;

// Onaylı plan değişmez; değiştirmek için önce onay kaldırılır.
export const planDegistirilebilir = (onaylandi: unknown): boolean => onaylandi === null;

// Kural ihlali (geç kalma, kapasite, al-bırak sırası, müsaitlik, sefer sınırı) olan plan onaylanamaz; bekleyen iş kalabilir.
export function onayEngelleri(
  rotalar: readonly { aracAdi: string; kurallaraUygun: boolean }[], haritaVar: boolean, fabrikaVar: boolean, pasifNoktaliIs = 0,
  atanmisIsVar = rotalar.length > 0,
): string[] {
  const engel: string[] = [];
  if (!fabrikaVar) engel.push('Aktif fabrika noktası tanımlı değil.');
  // Harita yokken rota hesabı da yoktur; araçtaki işler varken "iş yok" denmez, engel haritanın kendisidir.
  if (!haritaVar) engel.push('Harita paketi yüklü değil; varış saatleri hesaplanamıyor, plan onaylanamaz.');
  if (!atanmisIsVar) engel.push('Planda araca atanmış iş yok.');
  for (const r of rotalar) if (!r.kurallaraUygun) engel.push(`${r.aracAdi} rotasında kural ihlali var.`);
  if (pasifNoktaliIs > 0) engel.push(`Planda noktası pasifleştirilmiş ${pasifNoktaliIs} iş var.`);
  return engel;
}

// İptal edilen iş onaylı planda olamaz; taslak plandaysa plandan çıkar.
export const isDegistirilebilir = (planOnayli: boolean): boolean => !planOnayli;

// Tek rota: en çok 9 durak; al-bırak çiftinin iki ucu da listede olmalı ve aynı çift numarası bir kez alış, bir kez bırakış olmalı.
export interface TekRotaDuragiGirdisi { noktaId: number; durakSuresiDakika: number | null; rol: 'al' | 'birak' | null; cift: number | null }
export function tekRotaIhlalleri(duraklar: readonly TekRotaDuragiGirdisi[]): KuralIhlali[] {
  const ihlal: KuralIhlali[] = [];
  if (!duraklar.length) ihlal.push({ alan: 'duraklar', ileti: 'En az bir durak seçilmeli.' });
  if (duraklar.length > EN_COK_TEK_ROTA_DURAGI) ihlal.push({ alan: 'duraklar', ileti: `En çok ${EN_COK_TEK_ROTA_DURAGI} durak seçilebilir.` });
  const ciftler = new Map<number, { al: number; birak: number }>();
  for (const d of duraklar) {
    if ((d.rol === null) !== (d.cift === null)) { ihlal.push({ alan: 'duraklar', ileti: 'Al-bırak durağında rol ve çift numarası birlikte verilir.' }); continue; }
    if (d.rol === null || d.cift === null) continue;
    const sayac = ciftler.get(d.cift) ?? { al: 0, birak: 0 }; sayac[d.rol]++; ciftler.set(d.cift, sayac);
  }
  for (const [ciftNo, sayac] of ciftler) if (sayac.al !== 1 || sayac.birak !== 1) ihlal.push({ alan: 'duraklar', ileti: `${ciftNo}. al-bırak çiftinde bir alış ve bir bırakış olmalı.` });
  return ihlal;
}

// Çözücü bütçesi: iş sayısıyla artar, üst sınırlı (istek süresini sınırlar).
export const yinelemeButcesi = (isSayisi: number): number => Math.min(4000, 1500 + 150 * isSayisi);

// ---------- iş durumu ----------
// Havuzda: araca verilmemiş (yapılamayıp dönen de buradadır). Planlandı: taslak plandadır. Yolda: onaylı plandadır.
// Tamamlandı: teslim edildi ya da alındı; yeniden açılırsa havuza döner.
export const IS_DURUMLARI = ['havuzda', 'planlandi', 'yolda', 'tamamlandi'] as const;
export type IsDurumu = (typeof IS_DURUMLARI)[number];
// Elle istenen durum: yapılamadı işi havuza döndürür ve durağa sonuç yazar; yolda, yanlış işaretlenen sonucu geri alır.
export type IstenenDurum = 'tamamlandi' | 'yapilamadi' | 'havuzda' | 'yolda';

// Geçiş kuralı: izin varsa null, yoksa kullanıcıya gösterilecek ileti.
// sonucluDurak: işin onaylı plandaki son durağının sonucu (yoksa null).
export function durumGecisiIhlali(onceki: IsDurumu, hedef: IstenenDurum, sonucluDurak: 'tamamlandi' | 'yapilamadi' | null): string | null {
  if (hedef === 'tamamlandi') {
    if (onceki === 'yolda' || onceki === 'havuzda') return null;
    return onceki === 'planlandi' ? 'İş taslak plandadır; önce planı onaylayın ya da işi plandan çıkarın.' : 'İş zaten tamamlandı.';
  }
  if (hedef === 'yapilamadi') return onceki === 'yolda' ? null : 'Yalnız yoldaki iş yapılamadı olarak işaretlenir.';
  if (hedef === 'havuzda') return onceki === 'tamamlandi' ? null : 'Yalnız tamamlanmış iş yeniden açılır.';
  // Sonucu geri al: iş başka plana girmeden, onaylı plandaki durağın sonucu silinir ve iş yeniden yoldadır.
  if (sonucluDurak === null) return 'Geri alınacak teslim sonucu yok.';
  return onceki === 'havuzda' || onceki === 'tamamlandi' ? null : 'İş başka bir plana alınmış; sonuç geri alınamaz.';
}
// Teslim ya da yapılamadı sonucu planın gününden önce girilmez: ileri tarihli onaylı plandaki araç henüz yola çıkmamıştır.
export function ileriSonucIhlali(hedef: IstenenDurum, yoldakiPlanIleri: boolean): string | null {
  return (hedef === 'tamamlandi' || hedef === 'yapilamadi') && yoldakiPlanIleri
    ? 'Plan ileri bir güne ait; teslim sonucu planın gününde girilir.' : null;
}
export const yeniIsDurumu = (hedef: IstenenDurum): IsDurumu => (hedef === 'yapilamadi' ? 'havuzda' : hedef);
// Yoldaki ya da tamamlanmış iş düzenlenemez ve iptal edilemez; önce sonucu geri alınır ya da yeniden açılır.
export const isDuzenlenebilir = (durum: IsDurumu): boolean => durum === 'havuzda' || durum === 'planlandi';
export const DUZENLENEMEZ_IS = 'Yoldaki ya da tamamlanmış iş değiştirilemez; önce sonucu geri alın ya da işi yeniden açın.';

// ---------- kısmi sevk (261 a) ----------
const ADET_ONDALIK = 4;
// numeric(18, 4) adet sayıya çevrilmeden karşılaştırılır: ölçek 10^4 ile tam sayı.
function binde(metin: string): bigint | null {
  const m = /^(\d+)(?:\.(\d+))?$/.exec(metin);
  if (!m || (m[2] ?? '').replace(/0+$/, '').length > ADET_ONDALIK) return null;
  return BigInt(m[1]! + (m[2] ?? '').padEnd(ADET_ONDALIK, '0').slice(0, ADET_ONDALIK));
}
// Yalnız adedi bilinen ürün kaydı bölünür; parça sıfırdan büyük, kalan da sıfırdan büyük olmalı (bütünü göndermek bölme değildir).
export function bolmeIhlali(kayit: { kaynak: string; adet: string | null }, parca: string): string | null {
  if (kayit.kaynak !== 'urun') return 'Yalnız ürün kaydı bölünür.';
  const toplam = kayit.adet === null ? null : binde(kayit.adet);
  if (toplam === null) return 'Adedi bilinmeyen kayıt bölünemez.';
  const p = binde(parca);
  if (p === null) return `Adet en çok ${ADET_ONDALIK} ondalık basamaklı pozitif sayı olmalı.`;
  if (p <= 0n) return 'Ayrılacak adet sıfırdan büyük olmalı.';
  if (p >= toplam) return 'Ayrılacak adet kayıttaki adetten az olmalı; bütünü göndermek için kaydı bölmeden işe çevirin.';
  return null;
}

// ---------- tüm işler (960) ----------
// Kalemi sahibi modülün yazma işlemi ya da sevkiyat.is-yaz serbest bırakır (941 c). Uç bu listeden biriyle açılır, kalem başına
// sahibin işlemi ayrıca aranır.
export const KALEM_SAHIBI: Record<KalemKaynagi, Islem> = {
  urun: 'uretim-emirleri.yaz', fason: 'uretim-emirleri.fason', 'fason-donus': 'uretim-emirleri.fason', alim: 'satin-alma.yaz', elle: 'sevkiyat.is-yaz',
};
export const SERBEST_BIRAKMA_ISLEMLERI = ['sevkiyat.is-yaz', 'uretim-emirleri.yaz', 'uretim-emirleri.fason', 'satin-alma.yaz'] as const satisfies readonly Islem[];
// Erken çıkışı yalnız sevkiyat sorumlusu ya da yönetici zorlar (956 b, 963 a): planı onaylayan işlem.
export const ERKEN_CIKIS_ISLEMI = 'sevkiyat.onayla' satisfies Islem;
export const KAYNAK_YONU: Record<Exclude<KalemKaynagi, 'elle'>, KalemYonu> = { urun: 'gidis', fason: 'gidis', 'fason-donus': 'gelis', alim: 'gelis' };

// Aşamanın girdisi: kalem yoksa serbest false. erken: gerekçeyle hazır olmadan çıkabilir. depoTamam: depo son çıkışı ya da kabulü bitti.
export interface AsamaGirdisi {
  hazir: boolean; serbest: boolean; erken: boolean; tasima: Tasima | null; depoTamam: boolean;
  is: { durum: IsDurumu; tetiklendi: boolean } | null;
}
// Hazır olmadan gerekçesiz bırakılan kalem bekler (945 a, önceden bırakma); kaynağı bitince sevkiyata düşer.
export function tumIsAsamasi(k: AsamaGirdisi): TumIsAsamasi {
  if (k.depoTamam) return 'tamamlandi';
  if (!k.serbest) return k.hazir ? 'hazir' : 'hazir-degil';
  if (!k.hazir && !k.erken) return 'bekliyor';
  if (k.tasima === 'firma') return 'depoda';
  if (k.is === null) return 'havuzda';
  if (k.is.tetiklendi) return 'depoda';
  return k.is.durum;
}

export type SerbestBirakmaIhlali = { tur: 'yetki' | 'durum'; ileti: string };
// yetkili: kişinin işlemi var mı. Erken gerekçesi yalnız hazır olmayana yazılır; toplu seçimde hazır olan onu yok sayar.
export function serbestBirakmaIhlali(
  k: { kaynak: KalemKaynagi; asama: TumIsAsamasi }, erkenGerekce: string | null, yetkili: (islem: Islem) => boolean,
): SerbestBirakmaIhlali | null {
  if (!yetkili('sevkiyat.is-yaz') && !yetkili(KALEM_SAHIBI[k.kaynak])) return { tur: 'yetki', ileti: 'Bu kalemi serbest bırakma yetkiniz yok.' };
  if (k.asama === 'bekliyor' && erkenGerekce !== null) {
    return yetkili(ERKEN_CIKIS_ISLEMI) ? null : { tur: 'yetki', ileti: ERKEN_YETKISIZ };
  }
  if (k.asama !== 'hazir' && k.asama !== 'hazir-degil') return { tur: 'durum', ileti: 'Bu kalem zaten serbest bırakılmış.' };
  if (k.asama === 'hazir-degil' && erkenGerekce !== null && !yetkili(ERKEN_CIKIS_ISLEMI)) return { tur: 'yetki', ileti: ERKEN_YETKISIZ };
  return null;
}
const ERKEN_YETKISIZ = 'Hazır olmayan kalemi erken çıkışa yalnız sevkiyat sorumlusu ya da yönetici verir; gerekçesiz bırakırsanız hazır olunca düşer.';

// Tetik (Sevk et / Al): işin bütün kalemleri çıkabilir olmalı; dönüş, gidişi depodan çıkmadan alınmaz.
export interface TetikKalemi { hazir: boolean; erken: boolean; gidisCikti: boolean | null }
export function tetikIhlali(is: { durum: IsDurumu; tetiklendi: boolean }, kalemler: readonly TetikKalemi[]): string | null {
  if (is.tetiklendi) return 'Bu iş zaten tetiklendi.';
  if (is.durum === 'tamamlandi') return 'Tamamlanmış iş tetiklenmez.';
  if (kalemler.length === 0) return 'İşte serbest bırakılmış kalem yok; tetik yalnız Tüm işler kalemi taşıyan işte verilir.';
  if (kalemler.some((k) => !k.hazir && !k.erken)) return 'İşte hazır olmayan kalem var; hazır olunca ya da erken çıkışla tetiklenir.';
  if (kalemler.some((k) => k.gidisCikti === false)) return 'Gidiş henüz depodan çıkmadı; dönüş alınamaz.';
  return null;
}
export const tetikGeriAlIhlali = (is: { tetiklendi: boolean }, depoYapildi: boolean): string | null =>
  !is.tetiklendi ? 'Bu iş tetiklenmemiş.' : depoYapildi ? 'Depo çıkışı ya da kabulü yapılmış iş geri alınmaz; önce depoda geri alın.' : null;
// Taşıma depo yapmadan değişir. Tetiklenmiş işin kalemi önce tetiği geri alır; firma taşımasında bırakma tetik sayılır, depo
// başlamadıysa (kısmi kabul yok) sevkiyata geri alınabilir.
export function tasimaIhlali(k: { asama: TumIsAsamasi; tasima: Tasima | null; depoBasladi: boolean }, yeni: Tasima): string | null {
  if (k.tasima === yeni) return null;
  if (k.asama === 'tamamlandi' || k.depoBasladi) return 'Depo yapmış kalemin taşıması değişmez.';
  if (k.asama === 'depoda' && k.tasima !== 'firma') return 'Depoda bekleyen kalemin taşıması değişmez; önce tetiği geri alın.';
  if (k.asama === 'hazir' || k.asama === 'hazir-degil') return 'Taşıma serbest bırakılırken seçilir.';
  return null;
}

// Elle iş (958 a): iade dönüşsüzdür, dönüş yalnız gidişte açılır ve gidişten önce olamaz.
export function elleKalemIhlalleri(g: { tur: ElleTuru; yon: KalemYonu; istenenTarih: string; donusTarihi: string | null }): KuralIhlali[] {
  if (g.donusTarihi === null) return [];
  if (g.tur === 'iade') return [{ alan: 'donusTarihi', ileti: 'İade dönüşsüzdür.' }];
  if (g.yon === 'gelis') return [{ alan: 'donusTarihi', ileti: 'Dönüş yalnız gidişte açılır.' }];
  if (g.donusTarihi < g.istenenTarih) return [{ alan: 'donusTarihi', ileti: 'Dönüş günü gidişten önce olamaz.' }];
  return [];
}

// Aday (kalemi olmayan kaynak). Fason adımı sırası gelmiş ve gidecek parça varsa hazırdır; emir bitince ürün kalemi kendiliğinden açılır,
// bitmemiş emir hazır değildir. Tarihsiz aday ve günü aralığın sonundan önce olan (gecikmiş dahil) listede kalır.
export const fasonAdayiHazir = (g: { siradaki: boolean; gonderilebilir: number; gonderilen: number }): boolean => g.siradaki && g.gonderilebilir > g.gonderilen;
export const adayListede = (hazirTarihi: string | null, bitis: string): boolean => hazirTarihi === null || hazirTarihi <= bitis;
export function emirIlerlemesi(tamam: number, toplam: number, siradakiOp: number | null): string | null {
  if (toplam === 0) return null;
  return siradakiOp === null ? `${String(tamam)}/${String(toplam)} adım` : `${String(tamam)}/${String(toplam)} adım · OP ${String(siradakiOp)} sırada`;
}

// Depo (944, 966 b): gidiş son çıkış, geliş kabul bekler; yalnız tetiklenmiş (firma taşımasında serbest bırakılmış) kalem depodadır.
export function depoIhlali(k: { yon: KalemYonu; asama: TumIsAsamasi }, is: 'cikis' | 'kabul'): string | null {
  if (k.asama === 'tamamlandi') return is === 'cikis' ? 'Bu kalemin son çıkışı yapılmış.' : 'Bu kalemin kabulü tamamlanmış.';
  if ((k.yon === 'gidis') !== (is === 'cikis')) return is === 'cikis' ? 'Geliş kalemi çıkış yapmaz; mal kabulle girer.' : 'Gidiş kalemi kabul edilmez; son çıkışı yapılır.';
  if (k.asama !== 'depoda') return 'Kalem sevkiyatta tetiklenmedi; depo yalnız "Sevk et" ya da "Al" sonrası yapar.';
  return null;
}
// Depo çıkışının geri alınması (943 a, teslim geri almanın yerine): yalnız gidiş; dönüşü kabul edilmişse geri alınmaz.
export function depoGeriAlIhlali(k: { yon: KalemYonu; depoTamam: boolean }, donusKabulu: boolean): string | null {
  if (k.yon !== 'gidis') return 'Kabul mal kabul belgesinin düzeltmesiyle geri alınır.';
  if (!k.depoTamam) return 'Bu kalemin son çıkışı yapılmamış.';
  if (donusKabulu) return 'Dönüşü kabul edilmiş gidişin çıkışı geri alınmaz.';
  return null;
}
// Kısmi kabul (957 a): kalan firmada, kalem açık. Adedi bilinmeyen kalem ilk kabulde kapanır.
export function kabulTamamMi(adet: string | null, onceki: string | null, gelen: string): boolean {
  if (adet === null) return true;
  const a = binde(adet), o = onceki === null ? 0n : binde(onceki), g = binde(gelen);
  return a === null || o === null || g === null || o + g >= a;
}

// Kabulün geri alınması (1405 a): kalemin kabul adedinden geri alınan düşer; kalan sıfırsa adet boştur. Kalan kalemi kapatmıyorsa
// kalem açılır ve depoda yeniden kabul bekler. Kayıttaki adet kalemdekini aşamaz; aşarsa (bozuk veri) kalan sıfır sayılır.
export function kabulGeriAlimi(adet: string | null, kabulAdet: string | null, geriAlinan: string): { kabulAdet: string | null; acik: boolean } {
  const onceki = kabulAdet === null ? 0n : binde(kabulAdet) ?? 0n;
  const g = binde(geriAlinan) ?? 0n;
  const kalan = onceki > g ? onceki - g : 0n;
  if (kalan === 0n) return { kabulAdet: null, acik: true };
  const tam = kalan / 10_000n, kesir = (kalan % 10_000n).toString().padStart(ADET_ONDALIK, '0').replace(/0+$/, '');
  const metin = kesir === '' ? tam.toString() : `${tam.toString()}.${kesir}`;
  return { kabulAdet: metin, acik: !kabulTamamMi(adet, null, metin) };
}

// ---------- maliyet görünürlüğü ----------
// 180, 200 a: araç oranı ve rota maliyeti yalnız finans.maliyet-oku olana gider; öteki için alan null (sıfır uydurulmaz).
// Sıra ve yol seçimi aynı kalır, yalnız rakam gizlenir.
export const MALIYET_OKUMA = 'finans.maliyet-oku';
export const aracMaliyetsiz = (a: Arac): Arac => ({ ...a, kilometreMaliyeti: null, saatMaliyeti: null, gunlukMaliyet: null, varsayilanMaliyet: null });
export function gunPlaniMaliyetsiz(p: GunPlaniCevabi): GunPlaniCevabi {
  return {
    ...p,
    araclar: p.araclar.map(aracMaliyetsiz),
    rotalar: p.rotalar.map((r) => ({ ...r, hesap: r.hesap && { ...r.hesap, maliyet: null } })),
    toplam: p.toplam && { ...p.toplam, maliyet: null },
    karsilastirma: p.karsilastirma.map((k) => ({ ...k, maliyet: null })),
  };
}
export function tekRotaMaliyetsiz(c: TekRotaCevabi): TekRotaCevabi {
  if (c.plan === null) return c;
  return { ...c, plan: { ...c.plan, maliyet: null, oranlar: null, karsilastirma: c.plan.karsilastirma.map((k) => ({ ...k, maliyet: null })) } };
}
// Maliyeti görmeyen aracı düzenlerse gönderemediği oranlar silinmez: kayıttaki değer korunur.
export function korunanOranlar<T extends { kilometreMaliyeti: number | null; saatMaliyeti: number | null; gunlukMaliyet: number | null }>(
  govde: T, onceki: { kilometreMaliyeti: string | null; saatMaliyeti: string | null; gunlukMaliyet: string | null } | null,
): T {
  const sayi = (x: string | null | undefined): number | null => (x == null ? null : Number(x));
  return { ...govde, kilometreMaliyeti: sayi(onceki?.kilometreMaliyeti), saatMaliyeti: sayi(onceki?.saatMaliyeti), gunlukMaliyet: sayi(onceki?.gunlukMaliyet) };
}

// Onaylı kapanışın sevkiyat maddesi (1075 a; hedef 1228 a): emir adedi ile sağlam adedin küçüğü kadar ürün depodan çıktıysa
// tamam; fazla sağlam stokta kalır. Sağlamsız emirde gerekmez (1079 a). Çıkan adet numeric metnidir.
export function kapanisSevki(g: { adet: number; saglamAdet: number; cikan: string }): KapanisMaddeBilgisi {
  if (g.saglamAdet <= 0) return { durum: 'gerekmez', ayrinti: 'Sağlam parça yok' };
  const hedef = Math.min(g.adet, g.saglamAdet);
  const cikan = binde(g.cikan) ?? 0n;
  const metin = `${adetMetni(cikan)} / ${String(hedef)} depodan çıktı`;
  return { durum: cikan >= BigInt(hedef) * 10n ** BigInt(ADET_ONDALIK) ? 'tamam' : 'eksik', ayrinti: metin };
}
function adetMetni(b: bigint): string {
  const olcek = 10n ** BigInt(ADET_ONDALIK);
  const kesir = (b % olcek).toString().padStart(ADET_ONDALIK, '0').replace(/0+$/, '');
  return kesir === '' ? String(b / olcek) : `${String(b / olcek)},${kesir}`;
}
