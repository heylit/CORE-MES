// Planlama çalışmasının tipleri: bugünkü sayfanın `S` nesnesi (cerceve/planlama/parca/a-durum.betik yeniCalisma) ve onun `D` verisi
// (sunucu/moduller/plan/motor/girdi.betik rrCevir, tmiCevir). Kayıt anahtarı `recete-rota-motoru-v1:planlama`, biçim json.
// Alanlar sunucunun sakladığı belgeden gelir, şeması yoktur: yalnız ekranın kullandığı alanlar adıyla yazılır, gerisi `ExtraAlanlar` ile
// taşınır (belge yazılırsa bilinmeyen alan düşmesin). Saat ekseni planın başlangıç günü 00:00'dan saattir (girdi.betik parseT).

// Belgenin bilinmeyen alanları: ekran okumaz, ama bütün belge yazıldığında olduğu gibi geri gider.
export interface ExtraAlanlar { readonly [alan: string]: unknown }

// Rota adımının tezgâhı ve o tezgâhtaki süresi (dakika).
export interface AdimTezgahi extends ExtraAlanlar { id: string; ayar?: number; cevrim?: number }

// Ürün rotasının adımı. `k` adımın plan içi kimliğidir (yoksa rota sırası); `bag` önceki adımlara bağdır ([k, tür, ...]).
export interface RotaAdimi extends ExtraAlanlar {
  k: string;
  ad?: string;
  tezgahlar?: AdimTezgahi[];
  fason?: string;
  ortusebilir?: boolean;
  transfer?: number;
  minParti?: number;
  bag?: unknown[][];
  aile?: string;
}

export interface Urun extends ExtraAlanlar {
  id: string;
  ad?: string;
  rota?: RotaAdimi[];
  bilesenler?: { urun: string; miktar: number; adim: string }[];
}

// Sipariş planın emridir (Üretim emri ya da elle açılan iş). Termin ve serbest "YYYY-AA-GG SS:DD"; yoksa null (sıfır uydurulmaz).
export interface Siparis extends ExtraAlanlar {
  id: string;
  ad?: string;
  urun: string;
  adet: number;
  termin: string | null;
  serbest?: string | null;
  oncelik?: number;
  havuz?: boolean;
  // 1892 b: Üretim Emirleri'nde iptal edilen emir çalışmada bu işaretle kalır (girdi.betik rrCevir); plana ve hesaplara girmez.
  iptal?: boolean;
  gelir?: number | null;
  cezaGun?: number | null;
  malzeme?: { kod: string; miktar: number }[];
}

// Planın dışındaki sipariş: havuzdaki (taslak, teklif) ya da iptal edilen. Plan, maliyet, malzeme ve gecikme hesapları bunları saymaz.
export const planDisi = (s: Pick<Siparis, 'havuz' | 'iptal'>): boolean => s.havuz === true || s.iptal === true;

// Ekranda adım adıyla söylenir; adı yoksa ya da yalnız boşluksa rota anahtarıyla (baştaki ve sondaki boşluk ekranda ayırt edilmez, sayılmaz). Aynı rotada aynı adlı başka adım varsa ad tek başına hangisi olduğunu söylemez:
// o adın kaçıncısı olduğu başa yazılır ("2. Torna"). Rotadaki ya da tablodaki sıra yazılmaz: bölünen partinin tablosu kendi adımlarını
// 1'den sayar, üst emrin ve partinin aynı adlı adımları aynı sırayı alabilirdi.
export function adimAdi(rota: readonly RotaAdimi[], i: number): string {
  const ad = (a: RotaAdimi | undefined): string => { const t = (a?.ad ?? '').trim(); return t !== '' ? t : a?.k ?? ''; };
  const benim = ad(rota[i]);
  return rota.filter((a) => ad(a) === benim).length < 2 ? benim : `${String(rota.slice(0, i + 1).filter((a) => ad(a) === benim).length)}. ${benim}`;
}

// 3512: adım ortasından bölünen parti (kol) rotanın yalnız n+1..m-1 yerlerini işler; öteki adımları üst emir yapar, motor onları dizmez
// (motor girdi.js kolAraligi ile aynı kural). Kaynak sunucunun emirleridir (`durum.emirler.orders[]`: parentId, kol { n, m }).
// Dönen: emir kimliği -> yer (1'den) kolun içinde mi; aralık rotaya uymuyorsa emir bütün rotasıyla kalır (her yer içindedir).
export type KolYeri = (yer: number, adimSayisi: number) => boolean;
export function kolYerleri(orders: readonly unknown[]): Map<string, KolYeri> {
  const y = new Map<string, KolYeri>();
  for (const o of orders) {
    if (typeof o !== 'object' || o === null) continue;
    const { id, parentId, kol } = o as { id?: unknown; parentId?: unknown; kol?: unknown };
    if (parentId == null || parentId === '' || typeof kol !== 'object' || kol === null) continue;
    const n = Number((kol as { n?: unknown }).n), m = Number((kol as { m?: unknown }).m);
    if (!Number.isInteger(n) || !Number.isInteger(m)) continue;
    y.set(String(id), (yer, adimSayisi) => !(n >= 0 && m - n >= 2 && m <= adimSayisi + 1) || (yer > n && yer < m));
  }
  return y;
}

// Tezgâh (makine). `grup` istasyondur; ücret okunamazsa null (69 a: sıfır uydurulmaz). Kimlik veritabanı anahtarıdır: ekran tezgâhı
// `kod`, grubu `grupKod` ve `grupAd` ile yazar (1786 PLN-7); eski kayıtta yoksa kimlik yazılır.
export interface Tezgah extends ExtraAlanlar {
  id: string;
  ad?: string;
  kod?: string;
  grup?: string;
  grupKod?: string;
  grupAd?: string;
  ucret?: number | null;
  verim?: number;
  vardiyalar?: string[];
  opOran?: number;
}

export interface Personel extends ExtraAlanlar { id: string; ad?: string; vardiya?: string; gruplar?: string[]; ayar?: boolean }

export interface Malzeme extends ExtraAlanlar { kod: string; ad?: string; birim?: string; stok?: number; birimFiyat?: number; tedarikGun?: number; muayeneGun?: number }

export interface Fasoncu extends ExtraAlanlar { id: string; ad?: string; kapasite?: number; sureGun?: number; cikisGunleri?: string[]; cikisSaat?: number }

// Çalışmanın verisi. Kaynak okuması (tezgâh, kişi, takvim, ürün, malzeme, sipariş, fason) her açılışta sunucudan yeniden kurulur
// (girdi.betik TMI_KAYNAK_ALANLARI); planlamaya özgü alanlar (ağırlık, karar, TL ayarı) yalnız bu belgededir.
export interface PlanVerisi extends ExtraAlanlar {
  siparisler: Siparis[];
  tezgahlar: Tezgah[];
  urunler: Urun[];
  malzemeler?: Malzeme[];
  personel?: Personel[];
  fasoncular?: Fasoncu[];
  vardiyalar?: ExtraAlanlar[];
  calismaGunleri?: Record<string, unknown[]>;
  tatiller?: string[];
  devamsizlik?: ExtraAlanlar[];
  meta?: ExtraAlanlar & { baslangic?: string };
}

// Çözülmüş planın kaydı. `dataVer` çözüldüğü veri sürümüdür: çalışmanın `dataVer`'iyle aynı değilse plan bayattır.
export interface CozulmusPlan extends ExtraAlanlar { dataVer: number }

// Senaryo (sayfanın kendi senaryosu; sunucudaki plan senaryosu `/plan/senaryolar`'dadır, H2). `hafif`: veri kopyası düşmüş, yalnız plan ve özet kalır.
export interface CalismaSenaryosu extends ExtraAlanlar { id: string; ad?: string; zaman?: number; hafif?: boolean }

// Değişiklik izinin satırı (a-durum.betik iz): zaman, kişi, rol, sayfa, ne, ayrıntı.
export interface IzSatiri { t: number; kim: string; rol: string; sayfa: string; ne: string; ayrinti: string }

// Bekleyen değişiklik (755 a): plan varken planın girdisini değiştiren değişiklik atölyede uygulanana ya da reddedilene kadar burada bekler.
// `isler` etkilediği siparişlerdir ('*': bütün işler); `geri` reddin yol bazlı geri dönüş farkıdır, null ise yalnız uygulanır (787 a).
export interface GeriYama { yol: string[]; id?: string; once: unknown }
export interface BekleyenDegisiklik { id: string; ne: string; ayrinti: string; kim: string; t: number; isler: string[]; geri: GeriYama[] | null; dis?: true }

// ufukGun ve dilimDk sunucunun yazdığı motor ölçeğidir (1477 a, sistem ayarı); sayfa değiştirmez.
export interface PlanAgirliklari extends ExtraAlanlar { dondurma: number; famK: number; mat: string; sure: number; ufukGun?: number; dilimDk?: number }

export interface PlanParametreleri extends ExtraAlanlar {
  tampon: boolean; tamponZ: number; acilPay: number; maxChg: number; chgTL: number;
  bolmeKip: string; bolmeMin: number; bolmeMaks: number; bolmeEsik: number;
}

// Planlama çalışması (`S`). Sürüm 2 dışındaki belge okunmaz (a-durum.betik yukle).
export interface PlanlamaCalismasi extends ExtraAlanlar {
  surum: 2;
  setId?: string;
  D: PlanVerisi;
  // Vardiya'nın planlı duruşlarının okunduğu pencerenin sonu: duruşu okunmayan ilk gün ("YYYY-AA-GG"), sunucunun okumasından. Motor işi
  // bunun ötesine de yerleştirir (takvim iki yıla kadar büyür); oradaki duruş bilinmez. Hiç okunmadıysa yoktur.
  durusOkumaSonu?: string | null;
  down: ExtraAlanlar[];
  ekMesai: ExtraAlanlar[];
  locks: Record<string, unknown>;
  pref: Record<string, unknown>;
  w: PlanAgirliklari;
  param: PlanParametreleri;
  kapali: string[];
  // 3652: aparat, takım ve ölçü aleti kısıtının kipi (acik | uyari | kapali); eksik tür acik, eski kapali listesindeki aparat ve kalibrasyon uyari okunur.
  kisitKipi?: { aparat?: 'acik' | 'uyari' | 'kapali'; takim?: 'acik' | 'uyari' | 'kapali'; olcu?: 'acik' | 'uyari' | 'kapali' };
  // 561 2 a: 2 ise kapali listesi kullanıcının kararıdır; daha eski çalışmada personel kısıtı kapalı sayılır (durum.ts calismaOku).
  kisitSurum?: number;
  bedel: unknown;
  olaylar: ExtraAlanlar[];
  plan: CozulmusPlan | null;
  dataVer: number;
  senaryolar: CalismaSenaryosu[];
  canli: string | null;
  canliSurum: number;
  tabanSurum: number;
  iz: IzSatiri[];
  bekleyen?: BekleyenDegisiklik[];
}

// 3538 b: tezgâhta süren iş uzayıp elle kilitli işin üstüne binince motor kilitli işi onun arkasına kaydırır (nedeni 'kilit-kaydi', o:
// kilidin eski saati); plan çalışmaya alınırken kilit de yeni saate taşınır (sunucuda taslak-kurallar dizUygula). Kilit bu arada
// değiştiyse (saati ya da tezgâhı başka, kalkmış, geçici) dokunulmaz. Dönen: taşınan kilit sayısı.
export function kilitKaydiniAl(locks: Record<string, unknown>, ops: unknown): number {
  if (typeof ops !== 'object' || ops === null) return 0;
  let n = 0;
  for (const [id, r] of Object.entries(ops as Record<string, unknown>)) {
    const x = r as { m?: unknown; S?: unknown; why?: { t?: unknown; o?: unknown } | null } | null;
    const lk = locks[id] as { m?: unknown; S?: unknown; gecici?: unknown } | undefined;
    if (!x || x.why?.t !== 'kilit-kaydi' || typeof x.S !== 'number' || typeof x.why.o !== 'number' || !lk || typeof lk !== 'object' || lk.gecici) continue;
    if (lk.m !== x.m || typeof lk.S !== 'number' || Math.abs(lk.S - x.why.o) > 1e-6) continue;
    locks[id] = { ...lk, S: x.S };
    n++;
  }
  return n;
}
