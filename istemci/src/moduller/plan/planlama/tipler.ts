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
  gelir?: number | null;
  cezaGun?: number | null;
  malzeme?: { kod: string; miktar: number }[];
}

// Tezgâh (makine). `grup` istasyondur; ücret okunamazsa null (69 a: sıfır uydurulmaz).
export interface Tezgah extends ExtraAlanlar {
  id: string;
  ad?: string;
  grup?: string;
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
export interface BekleyenDegisiklik { id: string; ne: string; ayrinti: string; kim: string; t: number; isler: string[]; geri: GeriYama[] | null }

export interface PlanAgirliklari extends ExtraAlanlar { dondurma: number; famK: number; mat: string; sure: number }

export interface PlanParametreleri extends ExtraAlanlar {
  tampon: boolean; tamponZ: number; acilPay: number; maxChg: number; chgTL: number;
  bolmeKip: string; bolmeMin: number; bolmeMaks: number; bolmeEsik: number;
}

// Planlama çalışması (`S`). Sürüm 2 dışındaki belge okunmaz (a-durum.betik yukle).
export interface PlanlamaCalismasi extends ExtraAlanlar {
  surum: 2;
  setId?: string;
  D: PlanVerisi;
  down: ExtraAlanlar[];
  ekMesai: ExtraAlanlar[];
  locks: Record<string, unknown>;
  pref: Record<string, unknown>;
  w: PlanAgirliklari;
  param: PlanParametreleri;
  kapali: string[];
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
