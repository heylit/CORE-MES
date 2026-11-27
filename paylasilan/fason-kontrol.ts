// 3708: fason adımının arkasındaki kontrol türü. Seçim rota adımında durur, emre adım ayarı gibi kopyalanır; rota, üretim emirleri ve plan
// aynı kuralı kullanır.
export const FASON_KONTROLLERI = ['gkk', 'kaynakta', 'kontrolsuz'] as const;
export type FasonKontrol = (typeof FASON_KONTROLLERI)[number];

// 3809: GKK yazısı kurumun adını Sistem Ayarları'ndan (kabuk.kurum-adi) alır; ayar boşsa yansız "bizde" yazılır.
export function fasonKontrolAdlari(kurumAdi: string | null): Readonly<Record<FasonKontrol, { baslik: string; not: string }>> {
  const ad = kurumAdi?.trim() ? kurumAdi.trim() : null;
  return {
    gkk: { baslik: ad === null ? 'GKK (bizde)' : `GKK (${ad})`, not: `${ad === null ? 'Parça bize döner' : `Parça ${ad} deposuna döner`}, mal kabul, GKK` },
    kaynakta: { baslik: 'Kaynağında muayene (firmada)', not: 'Muayene firmada; sonraki adım fasonsa parça doğrudan oraya gider' },
    kontrolsuz: { baslik: 'Kontrolsüz (doğrudan sonraki firmaya)', not: 'Aktarım kaydıyla sonraki firmaya gider' },
  };
}

// 3809: fason adımının arkasına konan kontrol adımının operasyon tipi addan değil koddan bulunur (kalite grubu); ad değişse de eşleme bozulmaz.
export const KONTROL_TIPI_KODU: Readonly<Record<Exclude<FasonKontrol, 'kontrolsuz'>, string>> = { gkk: 'GKK', kaynakta: 'KYM' };
// Tip yoksa adım konamaz: emirde, rotada ve Hazırlık'ta aynı cümleyle uyarılır (sessiz atlama yok).
export function kontrolTipiEksikIletisi(kontrol: Exclude<FasonKontrol, 'kontrolsuz'>, opNo: number | null): string {
  const yer = opNo === null ? 'fason adımının' : `OP ${String(opNo)} adımının`;
  return kontrol === 'gkk'
    ? `GKK operasyon tipi (kod GKK, kalite grubu) tanımlı ya da aktif değil; ${yer} arkasına GKK adımı konamaz.`
    : `Kaynağında muayene operasyon tipi (kod KYM, kalite grubu) tanımlı ya da aktif değil; ${yer} arkasına muayene adımı konamaz.`;
}

export const KONTROLSUZ_SONRAKI_FASON_DEGIL = 'Kontrolsüz geçiş yalnız sonraki adım da fason ise seçilebilir.';
export const MUAYENE_SURESI_YOK = 'Kaynağında muayene süresi girilmedi; plan süre yok sayar.';
export const KONTROLSUZ_GKKYA_DONDU = 'Sonraki adım fason olmaktan çıktı; kontrol GKK\'ya döndü.';

// Kontrolsüz yalnız ara fasonda seçilebilir: zincirin son fason adımında kontrol her zaman vardır.
export function fasonKontrolSecilebilir(kontrol: FasonKontrol, sonrakiFason: boolean): boolean {
  return kontrol !== 'kontrolsuz' || sonrakiFason;
}

// Rota değişince geçersiz kalan seçim GKK'ya döner ve uyarı verir; geçerli seçim olduğu gibi kalır.
export function fasonKontrolDuzelt(kontrol: FasonKontrol, sonrakiFason: boolean): { kontrol: FasonKontrol; uyari: string | null } {
  return fasonKontrolSecilebilir(kontrol, sonrakiFason) ? { kontrol, uyari: null } : { kontrol: 'gkk', uyari: KONTROLSUZ_GKKYA_DONDU };
}

// Rota adımı uyarısı: kaynağında muayenede süre boşsa "süre yok"; başka seçimde süre anlamsızdır.
export function fasonKontrolUyarisi(kontrol: FasonKontrol, muayeneSaat: number | null): string | null {
  return kontrol === 'kaynakta' && muayeneSaat === null ? MUAYENE_SURESI_YOK : null;
}

export type KonanAdim = 'gkk' | 'kaynakta' | null;
export type MalKabulKapsami = 'gkk' | 'adet-hasar' | 'yok';

export interface FasonYolu {
  // Fason adımının arkasına kendiliğinden konan adım.
  konanAdim: KonanAdim;
  // Parça firmadan doğrudan ikinci firmaya gider (TMI'ye uğramaz).
  dogrudanSonrakiFirmaya: boolean;
  // Fason adımı bu kayıtla kapanır: aktarım (sonraki fason) ya da dönüş (mal kabulden).
  kapanis: 'aktarim' | 'donus';
  // Mal kabulde dönüş kaydı: GKK'ya bağlı tam kabul, yalnız adet ve hasar kontrolü ya da hiç.
  malKabul: MalKabulKapsami;
  // Fason dönüş payı (TMI'ye dönüş) plana eklenir mi.
  donusPayi: boolean;
}

// 2. madde tablosu; sonrakiFason yoksa kontrolsüz GKK sayılır (seçilemez, rota uyarır).
export function fasonYolu(kontrol: FasonKontrol, sonrakiFason: boolean): FasonYolu {
  const k = fasonKontrolDuzelt(kontrol, sonrakiFason).kontrol;
  if (k === 'gkk') {
    return { konanAdim: 'gkk', dogrudanSonrakiFirmaya: false, kapanis: 'donus', malKabul: 'gkk', donusPayi: true };
  }
  if (k === 'kaynakta') {
    return sonrakiFason
      ? { konanAdim: 'kaynakta', dogrudanSonrakiFirmaya: true, kapanis: 'aktarim', malKabul: 'yok', donusPayi: false }
      : { konanAdim: 'kaynakta', dogrudanSonrakiFirmaya: false, kapanis: 'donus', malKabul: 'adet-hasar', donusPayi: true };
  }
  return { konanAdim: null, dogrudanSonrakiFirmaya: true, kapanis: 'aktarim', malKabul: 'yok', donusPayi: false };
}
