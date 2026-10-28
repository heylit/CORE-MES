import type { Bagimlilik, GerceklesenKaynagi, GerceklesenTuru, MakineKullanimi, ParametreDegeri, ParametreDegerleri, ParametreTuru, RevizyonDurumu, RevizyonKomutu, SartnameKapsami } from '#paylasilan/sozlesme/rota.ts';

export const YAZ = 'rota.yaz';
export const ONAYLA = 'rota.onayla';
export const TALIMAT_YAZ = 'rota.talimat-yaz';

/* ---------------- revizyon harfi (RT-03) ---------------- */

const HARFLER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

// A=0 ... Z=25, AA=26 ... ZZ=701. Biçim dışı harf -1.
export function harfSirasi(harf: string): number {
  if (/^[A-Z]$/.test(harf)) return HARFLER.indexOf(harf);
  if (/^[A-Z]{2}$/.test(harf)) return 26 + HARFLER.indexOf(harf[0] ?? '') * 26 + HARFLER.indexOf(harf[1] ?? '');
  return -1;
}

function sirayaHarf(sira: number): string | null {
  if (sira < 26) return HARFLER[sira] ?? null;
  const kalan = sira - 26;
  if (kalan >= 26 * 26) return null;
  return `${HARFLER[Math.floor(kalan / 26)] ?? ''}${HARFLER[kalan % 26] ?? ''}`;
}

// İptal edilen revizyonun harfi de kullanılmış sayılır: yeni harf hep en büyüğün bir sonrasıdır. ZZ'den sonra null.
export function revizyonHarfi(kullanilanlar: readonly string[]): string | null {
  const enBuyuk = kullanilanlar.reduce((m, h) => Math.max(m, harfSirasi(h)), -1);
  return sirayaHarf(enBuyuk + 1);
}

/* ---------------- durum geçişleri (RT-15) ---------------- */

// Veritabanındaki rota_revizyon_kilitli tetikleyicisiyle aynı tablo.
export const DURUM_GECISLERI: Record<RevizyonDurumu, readonly RevizyonDurumu[]> = {
  taslak: ['onay_bekliyor', 'iptal'],
  onay_bekliyor: ['taslak', 'onayli', 'yururlukte'],
  onayli: ['yururlukte'],
  yururlukte: ['onayli'],
  iptal: [],
};

export function durumGecisiGecerliMi(eski: RevizyonDurumu, yeni: RevizyonDurumu): boolean {
  return DURUM_GECISLERI[eski].includes(yeni);
}

/* ---------------- OP numarası (RT-30, RT-31) ---------------- */

export const OP_ARALIGI = 10;

// Ürüne bir kez verilmiş numara yeniden verilmez: yeni numara bütün kullanılmışların en büyüğünün üstündedir,
// aradaki boş ya da silinmiş numaralar atlanır.
export function yeniOpNo(kullanilmislar: readonly number[]): number {
  return kullanilmislar.reduce((m, n) => Math.max(m, n), 0) + OP_ARALIGI;
}

export function opNolariVer(kullanilmislar: readonly number[], adet: number): number[] {
  const verilen: number[] = [];
  let son = yeniOpNo(kullanilmislar) - OP_ARALIGI;
  for (let i = 0; i < adet; i += 1) {
    son += OP_ARALIGI;
    verilen.push(son);
  }
  return verilen;
}

/* ---------------- komutlar ve dört göz (RT-18) ---------------- */

export interface KomutBaglami {
  durum: RevizyonDurumu;
  islemler: readonly string[];
  kisiId: number;
  gonderenKisiId: number | null;
  duzenleyenKisiIdleri: readonly number[];
  // Ayar kapalıyken dört göz uygulanmaz.
  dortGozAcik: boolean;
}

// Dört göz: revizyonu onaya gönderen ve taslağı düzenleyen kişi onaylayamaz. Kuralın tek yeri burasıdır.
export function dortGozEngeli(b: Pick<KomutBaglami, 'kisiId' | 'gonderenKisiId' | 'duzenleyenKisiIdleri' | 'dortGozAcik'>): boolean {
  if (!b.dortGozAcik) return false;
  return b.kisiId === b.gonderenKisiId || b.duzenleyenKisiIdleri.includes(b.kisiId);
}

export function izinliKomutlar(b: KomutBaglami): RevizyonKomutu[] {
  const yazar = b.islemler.includes(YAZ);
  const onaylar = b.islemler.includes(ONAYLA);
  const k: RevizyonKomutu[] = [];
  if (b.durum === 'taslak' && yazar) k.push('kaydet', 'onaya-gonder', 'iptal');
  if (b.durum === 'onay_bekliyor' && onaylar) {
    k.push('geri-gonder');
    if (!dortGozEngeli(b)) k.push('onayla');
  }
  if (b.durum === 'onayli' && onaylar) k.push('yururluge-al');
  if (b.durum !== 'iptal' && yazar) k.push('kopyala');
  return k;
}

export type KomutReddi = { tur: 'yetki' | 'durum'; ileti: string };

export function komutDenetle(komut: RevizyonKomutu, b: KomutBaglami): KomutReddi | null {
  if (izinliKomutlar(b).includes(komut)) return null;
  if (komut === 'onayla' && b.durum === 'onay_bekliyor' && b.islemler.includes(ONAYLA) && dortGozEngeli(b)) {
    return { tur: 'yetki', ileti: 'Onaya gönderdiğin ya da düzenlediğin revizyonu onaylayamazsın.' };
  }
  return { tur: 'durum', ileti: `Revizyon ${DURUM_ADI[b.durum]} durumundayken bu işlem yapılamaz.` };
}

export const DURUM_ADI: Record<RevizyonDurumu, string> = {
  taslak: 'taslak', onay_bekliyor: 'onay bekliyor', onayli: 'onaylı', yururlukte: 'yürürlükte', iptal: 'iptal',
};

/* ---------------- taslak denetimi (RT-30, RT-33, RT-34, RT-39, RT-42, RT-47) ---------------- */

// Kaynak: makine ya da kişi; anahtarı "tür:kimlik".
// Kişinin rotadaki istasyonu: o gün geçerli atamalarından en büyük yüzdeli olanı; eşitlikte küçük istasyon kimliği.
// Seçim okuyan modüldedir (IR5 b); istasyonlar bütün atamaları verir.
export function kisiIstasyonlari(atamalar: readonly { kisiId: number; istasyonId: number; yuzde: string }[]): Map<number, number> {
  const enIyi = new Map<number, { istasyonId: number; yuzde: number }>();
  for (const a of atamalar) {
    const yuzde = Number(a.yuzde);
    const onceki = enIyi.get(a.kisiId);
    if (!onceki || yuzde > onceki.yuzde || (yuzde === onceki.yuzde && a.istasyonId < onceki.istasyonId)) {
      enIyi.set(a.kisiId, { istasyonId: a.istasyonId, yuzde });
    }
  }
  return new Map([...enIyi].map(([kisiId, { istasyonId }]) => [kisiId, istasyonId]));
}

// Adımın kaynağı fason firma da olabilir; aday kaynak makine, kişi ya da istasyondur (FS2 a, #1184).
export interface KaynakRef { tur: 'makine' | 'kisi' | 'istasyon' | 'fason'; id: number }
export const kaynakAnahtari = (k: KaynakRef): string => `${k.tur}:${k.id}`;

// Emre kopyada istasyona bağlı adımın iş emri kaynağı atanmamıştır; istasyon iş emrinin istasyonu olur (makineyi plan seçer, #1184).
export function isEmriKaynagi(a: { kaynak: KaynakRef | null; fason: { firmaId: number } | null }):
  { kaynak: { tur: 'makine' | 'kisi' | 'fason'; id: number } | null; istasyonId: number | null } {
  if (a.fason) return { kaynak: { tur: 'fason', id: a.fason.firmaId }, istasyonId: null };
  if (a.kaynak?.tur === 'istasyon') return { kaynak: null, istasyonId: a.kaynak.id };
  return { kaynak: a.kaynak === null || a.kaynak.tur === 'fason' ? null : { tur: a.kaynak.tur, id: a.kaynak.id }, istasyonId: null };
}

export interface TaslakAdimi {
  opNo: number | null;
  kaynak: KaynakRef | null;
  ayarSuresiDk: number | null;
  birimSureDk: number | null;
  terminGun: number | null;
  bagimlilik: Bagimlilik;
  devirAdedi: number | null;
  makineKullanimi: MakineKullanimi;
  enKucukParca: number | null;
  adaylar: readonly { kaynak: KaynakRef }[];
  bilesenler: readonly { malzemeId: number }[];
  yanUrunler: readonly { malzemeId: number }[];
}

// İlk adımın önceki adımı yoktur: bekleyen sayılır ve devir adedi taşımaz.
export function ilkAdimiDuzenle<A extends TaslakAdimi>(adimlar: readonly A[]): A[] {
  return adimlar.map((a, i) => (i === 0 ? { ...a, bagimlilik: 'bekleyen', devirAdedi: null } : a));
}

// Dönen ileti alanı söyler; null: taslak kaydedilebilir.
export function taslakDenetle(
  adimlar: readonly TaslakAdimi[],
  b: { urunId: number; taslaktakiOpNolari: readonly number[] },
): { alan: string; ileti: string } | null {
  const gorulen = new Set<number>();
  for (const [i, a] of adimlar.entries()) {
    const alan = `adimlar.${i}`;
    if (a.opNo !== null) {
      if (!b.taslaktakiOpNolari.includes(a.opNo)) {
        return { alan: `${alan}.opNo`, ileti: `OP ${a.opNo} bu taslakta yok; yeni adımın numarasını sistem verir.` };
      }
      if (gorulen.has(a.opNo)) return { alan: `${alan}.opNo`, ileti: `OP ${a.opNo} iki kez kullanılamaz.` };
      gorulen.add(a.opNo);
    }
    // Fason adım dakikayla değil takvim günüyle ölçülür (FS4 a); fason olmayan adımın termini yoktur.
    if (a.kaynak?.tur === 'fason') {
      if (a.ayarSuresiDk !== null || a.birimSureDk !== null) {
        return { alan: `${alan}.ayarSuresiDk`, ileti: 'Fason adımda ayar ve birim süre girilmez; termin günü girilir.' };
      }
      // RT-69: fason işi firma yapar; aday makine ya da kişi ve paralel bölme planı fason işi atölyeye yükletir.
      if (a.adaylar.length > 0) return { alan: `${alan}.adaylar`, ileti: 'Fason adımda aday makine ya da kişi olmaz; işi firma yapar.' };
      if (a.makineKullanimi !== 'tek') return { alan: `${alan}.makineKullanimi`, ileti: 'Fason adımda paralel bölme olmaz.' };
    } else if (a.terminGun !== null) {
      return { alan: `${alan}.terminGun`, ileti: 'Termin günü yalnız fason adımda girilir.' };
    }
    if ((a.bagimlilik === 'akisli') !== (a.devirAdedi !== null)) {
      return { alan: `${alan}.devirAdedi`, ileti: 'Devir adedi yalnız akışlı adımda ve orada zorunludur.' };
    }
    if (a.makineKullanimi === 'tek' && a.enKucukParca !== null) {
      return { alan: `${alan}.enKucukParca`, ileti: 'En küçük parça yalnız paralel bölmede girilir.' };
    }
    const adaylar = new Set<string>();
    const kendi = a.kaynak ? kaynakAnahtari(a.kaynak) : null;
    for (const aday of a.adaylar) {
      const k = kaynakAnahtari(aday.kaynak);
      if (k === kendi) return { alan: `${alan}.adaylar`, ileti: 'Aday kaynak adımın kendi makinesi ya da kişisi olamaz.' };
      if (adaylar.has(k)) return { alan: `${alan}.adaylar`, ileti: 'Aynı aday kaynak iki kez eklenemez.' };
      adaylar.add(k);
    }
    const bilesenler = new Set<number>();
    for (const bil of a.bilesenler) {
      if (bil.malzemeId === b.urunId) return { alan: `${alan}.bilesenler`, ileti: 'Ürün kendisini bileşen olarak alamaz.' };
      if (bilesenler.has(bil.malzemeId)) return { alan: `${alan}.bilesenler`, ileti: 'Aynı bileşen bir adımda iki kez yazılamaz.' };
      bilesenler.add(bil.malzemeId);
    }
    if (a.yanUrunler.some((y) => y.malzemeId === b.urunId)) {
      return { alan: `${alan}.yanUrunler`, ileti: 'Ürün kendi yan ürünü olamaz.' };
    }
  }
  return null;
}

/* ---------------- onaya hazırlık (RT-08, RT-09) ---------------- */

export interface HazirlikAdimi {
  opNo: number;
  operasyonTipiAktif: boolean;
  // null: kaynağı henüz atanmamış adım.
  kaynakAktif: boolean | null;
  adaylarAktif: readonly boolean[];
  fason: boolean;
  makineKullanimi: MakineKullanimi;
  ayarSuresiDk: number | null;
  birimSureDk: number | null;
  terminGun: number | null;
  bagimlilik: Bagimlilik;
  girenSayisi: number;
}

// Terminal adımda ne tüketeceğini girenden okur (#1372): ilk adım ve önceki adımı beklemeyen adım girensiz olmaz; bekleyen ya da akışlı ara adım
// önceki adımın çıktısını tüketir. Adımlar sıra düzenindedir.
export function girdiEksigi(adimlar: readonly { opNo: number; bagimlilik: Bagimlilik; girenSayisi: number }[]): string | null {
  for (const [i, a] of adimlar.entries()) {
    if (a.girenSayisi > 0) continue;
    if (i === 0) return `OP ${a.opNo}: giren (hammadde ya da yarı mamul) seçilmeli.`;
    if (a.bagimlilik === 'bagimsiz') return `OP ${a.opNo}: önceki adımı beklemediği için giren seçilmeli.`;
  }
  return null;
}

export function onayaHazirMi(adimlar: readonly HazirlikAdimi[]): string | null {
  if (adimlar.length === 0) return 'Adımı olmayan revizyon onaya gönderilemez.';
  const girdi = girdiEksigi(adimlar);
  if (girdi) return girdi;
  for (const a of adimlar) {
    if (!a.operasyonTipiAktif) return `OP ${a.opNo}: operasyon tipi kullanıma kapalı.`;
    if (a.kaynakAktif === false) {
      return a.fason ? `OP ${a.opNo}: fason firma kullanımda değil ya da fason işaretli değil.` : `OP ${a.opNo}: makine ya da kişi kullanımda değil.`;
    }
    // RT-69 onayda yeniden: kural gelmeden kaydedilmiş taslak da onaya gidemez.
    if (a.fason && (a.adaylarAktif.length > 0 || a.makineKullanimi !== 'tek')) return `OP ${a.opNo}: fason adımda aday kaynak ve paralel bölme olmaz.`;
    if (a.adaylarAktif.includes(false)) return `OP ${a.opNo}: aday kaynaklardan biri kullanımda değil.`;
    // Fason adımın termini isteğe bağlıdır: boşsa plan süreyi satın almadaki geçmiş teslimattan ya da varsayılandan alır.
    if (a.fason) continue;
    if (a.birimSureDk === null) return `OP ${a.opNo}: işlem süresi girilmeli; hazırlık ve değişim 0 olabilir.`;
    if (a.ayarSuresiDk === null) return `OP ${a.opNo}: hazırlık süresi girilmeli; yoksa 0 yazın.`;
  }
  return null;
}

// Bileşen olan mamulün onay anında yürürlükte rotası olmalıdır: alt ürünü yapılamayan ürün onaylanmaz.
// Ticari mal alınıp satılır, hizmet malzeme değildir: ikisi de reçetede girdi olmaz (kart #1218).
const GIRDI_OLMAYAN_TURLER: readonly string[] = ['ticari_mal', 'hizmet'];
export function girdiOlabilirMi(tur: string): boolean {
  return !GIRDI_OLMAYAN_TURLER.includes(tur);
}

export function rotasizMamuller(bilesenMamulleri: readonly number[], rotasiOlanlar: ReadonlySet<number>): number[] {
  return [...new Set(bilesenMamulleri)].filter((id) => !rotasiOlanlar.has(id));
}

/* ---------------- akış (RT-22, RT-45, RT-46) ---------------- */

export type Cikti = { tur: 'ara-hal'; opNo: number } | { tur: 'urun' };

export interface AkisAdimi {
  opNo: number;
  tuketir: number[];
  cikti: Cikti;
}

// Adımlar sıralı gelir. Bağımsız adım önceki adımı beklemez ve tüketmez; bekleyen ve akışlı adım zincirdeki önceki
// adımın çıktısını ve aradaki bağımsız adımların çıktısını tüketir. Son adımın çıktısı ürünün kendisidir.
export function akisiCikar(adimlar: readonly { opNo: number; bagimlilik: Bagimlilik }[]): AkisAdimi[] {
  return adimlar.map((a, i) => {
    const cikti: Cikti = i === adimlar.length - 1 ? { tur: 'urun' } : { tur: 'ara-hal', opNo: a.opNo };
    if (i === 0 || a.bagimlilik === 'bagimsiz') return { opNo: a.opNo, tuketir: [], cikti };
    const tuketir: number[] = [];
    for (let j = i - 1; j >= 0; j -= 1) {
      const onceki = adimlar[j];
      if (!onceki) break;
      tuketir.unshift(onceki.opNo);
      if (onceki.bagimlilik !== 'bagimsiz' || j === 0) break;
    }
    return { opNo: a.opNo, tuketir, cikti };
  });
}

/* ---------------- miktar ve süre (RT-26, RT-27, RT-35, RT-36, RT-41, RT-42) ---------------- */

// Adım miktarı: ürün miktarı, kendisi ve sonraki adımların fire paylarıyla büyür: miktar / Π(1 - pay).
export function adimMiktarlari(adimlar: readonly { opNo: number; firePayiYuzde: number }[], urunMiktari: number): Map<number, number> {
  const sonuc = new Map<number, number>();
  let miktar = urunMiktari;
  for (let i = adimlar.length - 1; i >= 0; i -= 1) {
    const a = adimlar[i];
    if (!a) continue;
    miktar /= 1 - a.firePayiYuzde / 100;
    sonuc.set(a.opNo, miktar);
  }
  return sonuc;
}

// Teorik süre (dk) = ayar + birim süre x adım miktarı; süre eksikse null (sıfır uydurulmaz).
export function teorikSure(ayarSuresiDk: number | null, birimSureDk: number | null, miktar: number): number | null {
  if (ayarSuresiDk === null || birimSureDk === null) return null;
  return ayarSuresiDk + birimSureDk * miktar;
}

// Etkin süre: ölçülmüş süre varsa o, yoksa teorik süre.
export function etkinSure(teorik: number | null, olculmus: number | null): number | null {
  return olculmus ?? teorik;
}

// Akışlı adım, öncülün teslim ettiği sağlam adetten fazlasını işleyemez.
export function akisliIslenebilirAdet(onculunSaglamTeslimi: number, islenmis: number): number {
  return Math.max(0, onculunSaglamTeslimi - islenmis);
}

// Akışlı adım, öncül devir adedi kadar sağlam parça teslim edince başlayabilir.
export function akisliBaslayabilirMi(onculunSaglamTeslimi: number, devirAdedi: number): boolean {
  return onculunSaglamTeslimi >= devirAdedi;
}

// Aday kaynakta süre boşsa adımın süresi geçerlidir.
export function kaynaktakiSure(
  adim: { ayarSuresiDk: number | null; birimSureDk: number | null },
  aday: { ayarSuresiDk: number | null; birimSureDk: number | null } | null,
): { ayarSuresiDk: number | null; birimSureDk: number | null } {
  return {
    ayarSuresiDk: aday?.ayarSuresiDk ?? adim.ayarSuresiDk,
    birimSureDk: aday?.birimSureDk ?? adim.birimSureDk,
  };
}

// Rotanın toplam teorik süresi; süresi eksik adım varsa toplam yoktur (sıfır uydurulmaz). En uzun adım süresi bilinenlerden seçilir.
export function rotaOzeti(adimlar: readonly { opNo: number; sure: number | null }[]): { toplam: number | null; enUzunOpNo: number | null } {
  const bilinen = adimlar.filter((a): a is { opNo: number; sure: number } => a.sure !== null);
  const enUzun = bilinen.reduce<{ opNo: number; sure: number } | null>((m, a) => (m === null || a.sure > m.sure ? a : m), null);
  return {
    toplam: adimlar.length > 0 && bilinen.length === adimlar.length ? bilinen.reduce((t, a) => t + a.sure, 0) : null,
    enUzunOpNo: enUzun?.opNo ?? null,
  };
}

// Fason adımların termin günleri toplamı; fason adım yoksa ya da birinin termini boşsa null (sıfır uydurulmaz).
export function fasonTerminToplami(terminler: readonly (number | null)[]): number | null {
  if (terminler.length === 0 || terminler.includes(null)) return null;
  return (terminler as number[]).reduce((t, g) => t + g, 0);
}

/* ---------------- ürün ağacı ve döngü (RT-55, RT-56, RT-57) ---------------- */

// Kökten başlayarak kendisine dönen ilk yolu döner (dolaylı bileşen dahil); döngü yoksa null.
export function donguBul(kok: number, cocuklar: ReadonlyMap<number, readonly number[]>): number[] | null {
  const yol: number[] = [];
  const bitti = new Set<number>();
  const gez = (dugum: number): number[] | null => {
    if (yol.includes(dugum)) return [...yol.slice(yol.indexOf(dugum)), dugum];
    if (bitti.has(dugum)) return null;
    yol.push(dugum);
    for (const cocuk of cocuklar.get(dugum) ?? []) {
      const dongu = gez(cocuk);
      if (dongu) return dongu;
    }
    yol.pop();
    bitti.add(dugum);
    return null;
  };
  return gez(kok);
}

export interface AgacRotasi {
  revizyonId: number;
  adimlar: readonly {
    opNo: number;
    firePayiYuzde: number;
    bilesenler: readonly { malzemeId: number; miktar: number; fireYuzde: number }[];
  }[];
}

export interface AgacDugumu {
  derinlik: number;
  ust: number | null;
  malzemeId: number;
  opNo: number;
  birimMiktar: number;
  fireYuzde: number;
  toplamMiktar: number;
  // Açılan mamulün rotası; açılmadıysa null.
  revizyonId: number | null;
}

// Ağacı üstten aşağı açar: bileşen ihtiyacı = adım miktarı (fire payıyla) x bir adet miktarı x (1 + bileşen firesi).
// Rotası verilen mamul bileşen kendi rotasıyla açılır; toplamlar yalnız açılmayan (hammadde, sarf, rotasız) kalemlerdir.
export function agaciAc(
  kok: number,
  miktar: number,
  rotalar: ReadonlyMap<number, AgacRotasi>,
  azamiDerinlik: number,
): { dugumler: AgacDugumu[]; toplamlar: Map<number, number> } {
  const dugumler: AgacDugumu[] = [];
  const toplamlar = new Map<number, number>();
  const ac = (urun: number, urunMiktari: number, derinlik: number, ust: number | null, yol: readonly number[]) => {
    const rota = rotalar.get(urun);
    if (!rota) return;
    const adimMiktari = adimMiktarlari(rota.adimlar, urunMiktari);
    for (const adim of rota.adimlar) {
      for (const b of adim.bilesenler) {
        const toplam = (adimMiktari.get(adim.opNo) ?? urunMiktari) * b.miktar * (1 + b.fireYuzde / 100);
        const altRota = rotalar.get(b.malzemeId);
        const acilir = altRota !== undefined && !yol.includes(b.malzemeId) && derinlik < azamiDerinlik;
        dugumler.push({
          derinlik, ust, malzemeId: b.malzemeId, opNo: adim.opNo, birimMiktar: b.miktar, fireYuzde: b.fireYuzde,
          toplamMiktar: toplam, revizyonId: acilir ? altRota.revizyonId : null,
        });
        const sira = dugumler.length - 1;
        if (acilir) ac(b.malzemeId, toplam, derinlik + 1, sira, [...yol, b.malzemeId]);
        else toplamlar.set(b.malzemeId, (toplamlar.get(b.malzemeId) ?? 0) + toplam);
      }
    }
  };
  ac(kok, miktar, 1, null, [kok]);
  return { dugumler, toplamlar };
}

/* ---------------- süre ayrımı ve gerçekleşen süre (RT-70 ... RT-75) ---------------- */

// Süre sütunları dört basamaklıdır; toplam, yuvarlanmış parçaların toplamıdır (veritabanı kısıtı da öyle karşılaştırır).
const onbinde = (x: number): number => Math.round(x * 10_000);

export interface SureGirdisi { birimSureDk: number | null; islemSuresiDk: number | null; degisimSuresiDk: number | null }

// RT-70: değişim işlemsiz girilmez; işlem girilince birim süre (çevrim) işlem + değişimdir, değişim boşsa yalnız işlem.
// Birim süre de gelirse toplamla aynı olmalıdır. Dönen: saklanacak birim süre ya da ileti.
export function sureAyrimi(g: SureGirdisi): { birimSureDk: number | null } | { ileti: string; alan: 'islemSuresiDk' | 'birimSureDk' } {
  if (g.degisimSuresiDk !== null && g.islemSuresiDk === null) return { ileti: 'Değişim süresi işlem süresiyle birlikte girilir.', alan: 'islemSuresiDk' };
  if (g.islemSuresiDk === null) return { birimSureDk: g.birimSureDk };
  const toplam = onbinde(g.islemSuresiDk) + onbinde(g.degisimSuresiDk ?? 0);
  if (g.birimSureDk !== null && onbinde(g.birimSureDk) !== toplam) {
    return { ileti: 'Birim süre işlem ve değişim süresinin toplamıdır.', alan: 'birimSureDk' };
  }
  return { birimSureDk: toplam / 10_000 };
}

// Taslağın bütün adım ve aday sürelerine RT-70 uygulanır; fason adımda işlem ve değişim de girilmez (FS4 a).
export function taslakSureleri<A extends SureGirdisi & { kaynak: KaynakRef | null; adaylar: readonly (SureGirdisi & { kaynak: KaynakRef })[] }>(
  adimlar: readonly A[],
): { hata: { alan: string; ileti: string } } | { adimlar: A[] } {
  const sonuc: A[] = [];
  for (const [i, a] of adimlar.entries()) {
    if (a.kaynak?.tur === 'fason' && (a.islemSuresiDk !== null || a.degisimSuresiDk !== null)) {
      return { hata: { alan: `adimlar.${i}.islemSuresiDk`, ileti: 'Fason adımda işlem ve değişim süresi girilmez; termin günü girilir.' } };
    }
    const kendi = sureAyrimi(a);
    if ('ileti' in kendi) return { hata: { alan: `adimlar.${i}.${kendi.alan}`, ileti: kendi.ileti } };
    const adaylar = [];
    for (const [j, x] of a.adaylar.entries()) {
      const ayrim = sureAyrimi(x);
      if ('ileti' in ayrim) return { hata: { alan: `adimlar.${i}.adaylar.${j}.${ayrim.alan}`, ileti: ayrim.ileti } };
      adaylar.push({ ...x, birimSureDk: ayrim.birimSureDk });
    }
    sonuc.push({ ...a, birimSureDk: kendi.birimSureDk, adaylar });
  }
  return { adimlar: sonuc };
}

// RT-71: ayrılmamış adımda (işlem boş) işlem bugünkü çevrimdir, değişim boştur (S1 a). Değer metin ya da sayı olabilir.
export function teorikAyrim<T>(birim: T | null, islem: T | null, degisim: T | null): { islem: T | null; degisim: T | null } {
  return islem === null ? { islem: birim, degisim: null } : { islem, degisim };
}

// RT-72: değişim oranı (%) = değişim / işlem x 100. Saklanmaz; işlem ya da değişim yoksa, işlem 0 ise null.
export function degisimOrani(islem: number | null, degisim: number | null): number | null {
  if (islem === null || degisim === null || islem <= 0) return null;
  return (degisim / islem) * 100;
}


// RT-75: gerçekleşen işlem süresi sıfır olamaz (birim süre sıfır olmaz); hazırlık ve değişim sıfır olabilir. Boş süre teoriğe dönüştür.
export function gerceklesenDenetle(tur: GerceklesenTuru, sureDk: number | null): string | null {
  return tur === 'islem' && sureDk !== null && sureDk <= 0 ? 'Gerçekleşen işlem süresi sıfırdan büyük olmalı.' : null;
}

export interface GerceklesenSatiri { id: number; tur: GerceklesenTuru; makineId: number | null; sureDk: number | null; kaynak: GerceklesenKaynagi }

// Defterde ölçüm, dolu elle ya da terminal satırıdır; boş elle satırı (boşaltma) ölçümleri kapatır. Kabul satırı kapatmaz: ölçüm revizyon
// yürürlüğe girince boşaltılır (169 c, 171 a).
const olcumMu = (x: Pick<GerceklesenSatiri, 'sureDk' | 'kaynak'>): boolean => x.sureDk !== null && (x.kaynak === 'terminal' || x.kaynak === 'elle');
const kapatirMi = (x: GerceklesenSatiri): boolean => x.kaynak === 'elle' && x.sureDk === null;

// RT-73: bekleyen ölçüm tür başına bu görünümdeki son boşaltmadan sonraki son ölçümdür. Makinesiz görünüm her makinenin ölçümünü
// gösterir, makineye özgü kapatma onu kapatmaz; makine görünümü o makinenin ve makinesiz ölçümü gösterir, makinesiz kapatma da onu kapatır.
export function bekleyenOlcum(satirlar: readonly GerceklesenSatiri[], makineId: number | null): Record<GerceklesenTuru, GerceklesenSatiri | null> {
  const sec = (tur: GerceklesenTuru): GerceklesenSatiri | null => {
    const turun = [...satirlar].filter((x) => x.tur === tur).sort((a, b) => a.id - b.id);
    const sinir = turun.filter((x) => kapatirMi(x) && (x.makineId === null || x.makineId === makineId)).at(-1)?.id ?? 0;
    return turun.filter((x) => olcumMu(x) && x.id > sinir && (makineId === null || x.makineId === null || x.makineId === makineId)).at(-1) ?? null;
  };
  return { hazirlik: sec('hazirlik'), islem: sec('islem'), degisim: sec('degisim') };
}

export interface KabulSatiri { malzemeId: number; opNo: number; tur: GerceklesenTuru; makineId: number | null; kaynak: GerceklesenKaynagi; sureDk: number | null }

// RT-77: kabul edilen satır bu adımın bu türdeki ölçümü (dolu elle ya da terminal satırı) olmalı; makineye özgü kabul başka makinenin
// ölçümünü almaz.
export function kabulDenetle(
  satir: KabulSatiri, hedef: { malzemeId: number; opNo: number; tur: GerceklesenTuru; makineId: number | null },
): string | null {
  if (!olcumMu(satir)) return 'Yalnız ölçülmüş süre kabul edilir.';
  if (satir.malzemeId !== hedef.malzemeId || satir.opNo !== hedef.opNo || satir.tur !== hedef.tur) return 'Ölçüm bu adımın bu süresine ait değil.';
  if (hedef.makineId !== null && satir.makineId !== null && satir.makineId !== hedef.makineId) return 'Ölçüm başka makinenin.';
  return null;
}

// RT-76: terminal ölçümü (B38). İş emrinin net birim süresi değişim dahil toplam çevrimdir (170 b); "işlem" türü ölçüldüğünde birim süredir.
// Ölçülemeyen ya da sıfır birim süre ölçüm değildir (RT-75); hazırlık ayar olayı yoksa ölçülmemiştir.
export function terminalOlcumleri(olcum: { hazirlikDk: number | null; netBirimDk: number | null }): { hazirlik: number | null; islem: number | null } {
  return {
    hazirlik: olcum.hazirlikDk === null || olcum.hazirlikDk < 0 ? null : onbinde(olcum.hazirlikDk) / 10_000,
    islem: olcum.netBirimDk === null || olcum.netBirimDk <= 0 ? null : onbinde(olcum.netBirimDk) / 10_000,
  };
}

export interface AdimSureleri { ayarSuresiDk: number | null; birimSureDk: number | null; islemSuresiDk: number | null; degisimSuresiDk: number | null }

// RT-78: kabul ölçümü teorik süreye yazar (169 c). Hazırlık ayar süresidir. "İşlem" ölçümü birim süredir (170 b): değişim korunur, işlem
// birimden değişim düşülerek bulunur; ayrılmamış adım ayrılmamış kalır. Değişim ölçümü değişimi değiştirir, birim işlem + değişim olur;
// ayrılmamış adımda işlem bugünkü birim süredir (RT-71). Birim değişimden kısa olamaz.
export function kabulSureleri(eski: AdimSureleri, tur: GerceklesenTuru, deger: number): AdimSureleri | { ileti: string } {
  const sayi = (x: number): number => x / 10_000;
  if (tur === 'hazirlik') return { ...eski, ayarSuresiDk: deger };
  if (tur === 'islem') {
    if (eski.islemSuresiDk === null) return { ...eski, birimSureDk: deger };
    const islem = onbinde(deger) - onbinde(eski.degisimSuresiDk ?? 0);
    if (islem <= 0) return { ileti: 'Ölçülen birim süre değişim süresinden uzun olmalı.' };
    return { ...eski, birimSureDk: deger, islemSuresiDk: sayi(islem) };
  }
  const islem = eski.islemSuresiDk ?? eski.birimSureDk;
  if (islem === null) return { ileti: 'Birim süresi olmayan adıma değişim süresi yazılmaz.' };
  return { ...eski, islemSuresiDk: islem, degisimSuresiDk: deger, birimSureDk: sayi(onbinde(islem) + onbinde(deger)) };
}

// RT-79: revizyon yürürlüğe girince teorik süresi değişen türün ölçümü boşaltılır (171 a). İşlem türü birim ya da işlem süresiyle değişir.
export function degisenTurler(eski: AdimSureleri | null, yeni: AdimSureleri): GerceklesenTuru[] {
  const farkli = (a: number | null | undefined, b: number | null): boolean => (a ?? null) !== b;
  const turler: GerceklesenTuru[] = [];
  if (farkli(eski?.ayarSuresiDk, yeni.ayarSuresiDk)) turler.push('hazirlik');
  if (farkli(eski?.birimSureDk, yeni.birimSureDk) || farkli(eski?.islemSuresiDk, yeni.islemSuresiDk)) turler.push('islem');
  if (farkli(eski?.degisimSuresiDk, yeni.degisimSuresiDk)) turler.push('degisim');
  return turler;
}

export interface TeorikSureler { hazirlikDk: number | null; islemDk: number | null; degisimDk: number | null }
export interface EtkinAdimSuresi {
  ayarSuresiDk: number | null;
  birimSureDk: number | null;
  islemSuresiDk: number | null;
  degisimSuresiDk: number | null;
}

// RT-74: plan yalnız teorik süreyle çalışır (169 c); ölçüm teoriğe ancak kabul ve revizyonla geçer. Birim süre işlem + değişimdir, değişim
// bilinmiyorsa işlem; işlem bilinmiyorsa birim süre yoktur (sıfır uydurulmaz).
export function etkinAdimSuresi(teorik: TeorikSureler): EtkinAdimSuresi {
  return {
    ayarSuresiDk: teorik.hazirlikDk,
    birimSureDk: teorik.islemDk === null ? null : (onbinde(teorik.islemDk) + onbinde(teorik.degisimDk ?? 0)) / 10_000,
    islemSuresiDk: teorik.islemDk,
    degisimSuresiDk: teorik.degisimDk,
  };
}

/* ---------------- fark ---------------- */

export interface FarkAdimi {
  opNo: number;
  sira: number;
  ad: string;
  operasyonTipi: string;
  kaynak: string | null;
  ayarSuresiDk: string | null;
  birimSureDk: string | null;
  islemSuresiDk: string | null;
  degisimSuresiDk: string | null;
  terminGun: number | null;
  bagimlilik: Bagimlilik;
  devirAdedi: number | null;
  firePayiYuzde: string;
  bilesenler: readonly { ad: string; miktar: string }[];
}

const BAGIMLILIK_ADI: Record<Bagimlilik, string> = { bagimsiz: 'bağımsız', bekleyen: 'bekleyen', akisli: 'akışlı' };

// Adımlar OP numarasıyla eşlenir: numara kalıcı olduğu için aynı numara aynı adımdır.
export function revizyonFarki(eski: readonly FarkAdimi[], yeni: readonly FarkAdimi[]): string[] {
  const farklar: string[] = [];
  const eskiler = new Map(eski.map((a) => [a.opNo, a]));
  const yeniler = new Map(yeni.map((a) => [a.opNo, a]));
  for (const a of yeni) if (!eskiler.has(a.opNo)) farklar.push(`OP ${a.opNo} eklendi: ${a.ad}`);
  for (const a of eski) if (!yeniler.has(a.opNo)) farklar.push(`OP ${a.opNo} çıkarıldı: ${a.ad}`);
  const ortakEski = eski.filter((a) => yeniler.has(a.opNo)).map((a) => a.opNo);
  const ortakYeni = yeni.filter((a) => eskiler.has(a.opNo)).map((a) => a.opNo);
  if (ortakEski.join(',') !== ortakYeni.join(',')) farklar.push('Adım sırası değişti');
  for (const y of yeni) {
    const e = eskiler.get(y.opNo);
    if (!e) continue;
    const alan = (ad: string, once: string | number | null, sonra: string | number | null) => {
      if (once !== sonra) farklar.push(`OP ${y.opNo} ${ad}: ${once ?? 'yok'} -> ${sonra ?? 'yok'}`);
    };
    alan('ad', e.ad, y.ad);
    alan('operasyon tipi', e.operasyonTipi, y.operasyonTipi);
    alan('makine / kişi', e.kaynak, y.kaynak);
    alan('hazırlık süresi', e.ayarSuresiDk, y.ayarSuresiDk);
    alan('birim süre', e.birimSureDk, y.birimSureDk);
    alan('işlem süresi', e.islemSuresiDk, y.islemSuresiDk);
    alan('değişim süresi', e.degisimSuresiDk, y.degisimSuresiDk);
    alan('termin günü', e.terminGun, y.terminGun);
    alan('bağımlılık', BAGIMLILIK_ADI[e.bagimlilik], BAGIMLILIK_ADI[y.bagimlilik]);
    alan('devir adedi', e.devirAdedi, y.devirAdedi);
    alan('fire payı', e.firePayiYuzde, y.firePayiYuzde);
    const bm = (l: readonly { ad: string; miktar: string }[]) => l.map((b) => `${b.ad} x ${b.miktar}`).sort().join(', ');
    alan('bileşenler', bm(e.bilesenler) || null, bm(y.bilesenler) || null);
  }
  return farklar;
}

/* ---------------- biçim ---------------- */

// Hesaplanan ölçü metin olarak döner (ondalık metin biçimi); sondaki sıfırlar atılır.
export function ondalikMetin(sayi: number, basamak = 4): string {
  const metin = sayi.toFixed(basamak);
  return metin.includes('.') ? metin.replace(/0+$/, '').replace(/\.$/, '') : metin;
}

export const sayiyaCevir = (metin: string | null): number | null => (metin === null ? null : Number(metin));

/* ---------------- emre kopya (K1, RT-66, RT-67) ---------------- */

export const KONTROL_SATIRI_EN_COK = 120;

// Talimat metni iş emrinin kontrol listesi olur: boş olmayan her satır bir madde; uzun satır kısaltılmaz, bölünür.
export function kontrolListesi(talimat: string | null): { ad: string; aciklama: string | null }[] {
  if (!talimat) return [];
  return talimat.split(/\r?\n/).map((x) => x.trim()).filter((x) => x !== '').flatMap((x) => {
    const parcalar: string[] = [];
    for (let i = 0; i < x.length; i += KONTROL_SATIRI_EN_COK) parcalar.push(x.slice(i, i + KONTROL_SATIRI_EN_COK));
    return parcalar.map((ad) => ({ ad, aciklama: null }));
  });
}

// Yalnız yürürlükteki revizyon emre kopyalanır; adımsız rota emir açmaz.
export function emreKopyalanabilirMi(r: { durum: RevizyonDurumu; adimSayisi: number }): string | null {
  if (r.durum !== 'yururlukte') return 'Yalnız yürürlükteki rota emre kopyalanır.';
  if (r.adimSayisi === 0) return 'Adımı olmayan rota emre kopyalanmaz.';
  return null;
}

/* ---------------- karttan taslak (#688) ---------------- */

export interface KartOperasyonu { no: number; kod: string; ad: string | null }
export interface KartAdimi { opNo: number | null; operasyonTipiId: number; ad: string; eslesti: boolean }

// Kartın operasyon kodu katalogdaki aktif tipin koduyla eşlenir (büyük-küçük harf ve boşluk farkı sayılmaz). Eşleşmeyen satır
// düşmez: varsayılan tiple taslakta kalır ve "eslesti: false" ile işaretlenir, kullanıcı tipini düzeltir. Kart numaraları
// geçerli ve tekilse OP numarası olarak korunur; değilse taslak numarayı kendisi verir.
export function karttanAdimlar(
  ops: readonly KartOperasyonu[],
  tipler: readonly { id: number; kod: string; ad: string; aktif: boolean }[],
  varsayilanTipId: number,
): KartAdimi[] {
  const anahtar = (k: string) => k.trim().toLocaleLowerCase('tr-TR');
  const tip = new Map(tipler.filter((t) => t.aktif).map((t) => [anahtar(t.kod), t]));
  const nolar = ops.map((o) => o.no);
  const numaraKorunur = nolar.every((n) => Number.isInteger(n) && n > 0) && new Set(nolar).size === nolar.length;
  return [...ops].sort((a, b) => a.no - b.no).map((o) => {
    const t = tip.get(anahtar(o.kod));
    // Adsız satır tipin adını alır; tipi de bulunmazsa kartın kodunu (rota adımının adı boş olamaz).
    const ad = o.ad?.trim() || t?.ad || o.kod.trim();
    return { opNo: numaraKorunur ? o.no : null, operasyonTipiId: t?.id ?? varsayilanTipId, ad, eslesti: t !== undefined };
  });
}

/* ---------------- işlem şartnamesi (971 a) ---------------- */

export const SARTNAME_YAZ = 'rota.sartname-yaz';
export const SARTNAME_YAYINLA = 'rota.sartname-yayinla';

export interface SartnameAlani {
  anahtar: string; ad: string; tur: ParametreTuru; secenekler: readonly string[] | null; varsayilan: ParametreDegeri; zorunlu: boolean; adimdaDegisir: boolean;
}

// Değer alanın türüne uymalıdır; null "verilmedi" demektir ve her türde geçer (zorunluluk ayrı denetlenir).
export function degerHatasi(a: Pick<SartnameAlani, 'ad' | 'tur' | 'secenekler'>, d: ParametreDegeri): string | null {
  if (d === null) return null;
  const secenek = a.secenekler ?? [];
  switch (a.tur) {
    case 'sayi':
      return typeof d === 'number' ? null : `${a.ad}: sayı olmalı.`;
    case 'aralik':
      if (!Array.isArray(d) || d.length !== 2 || d.some((x) => typeof x !== 'number')) return `${a.ad}: alt ve üst sayı olmalı.`;
      return (d[0] as number) <= (d[1] as number) ? null : `${a.ad}: alt değer üstten büyük olamaz.`;
    case 'secim':
      return typeof d === 'string' && secenek.includes(d) ? null : `${a.ad}: seçeneklerden biri olmalı.`;
    case 'coklu':
      if (!Array.isArray(d) || d.some((x) => typeof x !== 'string' || !secenek.includes(x))) return `${a.ad}: yalnız seçenekler seçilir.`;
      return new Set<unknown>(d).size === d.length ? null : `${a.ad}: aynı seçenek iki kez seçilmez.`;
    case 'metin':
      return typeof d === 'string' && d.trim() !== '' ? null : `${a.ad}: metin olmalı.`;
    case 'evet':
      return typeof d === 'boolean' ? null : `${a.ad}: evet ya da hayır olmalı.`;
  }
}

// Boş dizi ve boş metin değer sayılmaz: zorunlu çoklu seçimde en az bir seçenek gerekir.
const bosMu = (d: ParametreDegeri | undefined): boolean => d === null || d === undefined || (Array.isArray(d) && d.length === 0) || (typeof d === 'string' && d.trim() === '');

export interface SablonHatasi { alan: string; ileti: string }

// Taslak kaydında şablonun biçimi denetlenir; eksik değer (sabit zorunlu alanın değeri) yayında denetlenir.
export function sartnameSablonuDenetle(
  alanlar: readonly (SartnameAlani & { birim: string | null })[],
  atiflar: readonly { standartId: number; rol: string }[],
): SablonHatasi | null {
  const anahtarlar = new Set<string>();
  for (const [i, a] of alanlar.entries()) {
    if (anahtarlar.has(a.anahtar)) return { alan: `parametreler.${i}.anahtar`, ileti: `${a.anahtar}: aynı anahtar iki kez kullanılmış.` };
    anahtarlar.add(a.anahtar);
    const secimli = a.tur === 'secim' || a.tur === 'coklu';
    if (secimli && (a.secenekler === null || a.secenekler.length === 0)) return { alan: `parametreler.${i}.secenekler`, ileti: `${a.ad}: seçenek girilmeli.` };
    if (!secimli && a.secenekler !== null) return { alan: `parametreler.${i}.secenekler`, ileti: `${a.ad}: bu türde seçenek olmaz.` };
    if (a.secenekler && new Set(a.secenekler).size !== a.secenekler.length) return { alan: `parametreler.${i}.secenekler`, ileti: `${a.ad}: aynı seçenek iki kez yazılmış.` };
    const hata = degerHatasi(a, a.varsayilan);
    if (hata) return { alan: `parametreler.${i}.varsayilan`, ileti: hata };
  }
  const atif = new Set<string>();
  for (const [i, x] of atiflar.entries()) {
    const k = `${x.standartId}|${x.rol}`;
    if (atif.has(k)) return { alan: `atiflar.${i}`, ileti: 'Aynı standart aynı rolde iki kez atıflanmış.' };
    atif.add(k);
  }
  return null;
}

// Sabit (adımda değişmeyen) zorunlu alanın değeri şablondadır; boşsa sürüm yayınlanmaz.
export function yayinEksigi(alanlar: readonly SartnameAlani[]): string | null {
  const eksik = alanlar.filter((a) => a.zorunlu && !a.adimdaDegisir && bosMu(a.varsayilan)).map((a) => a.ad);
  return eksik.length === 0 ? null : `Sabit zorunlu alanın değeri yok: ${eksik.join(', ')}`;
}

// Adım yalnız "adımda değişir" alanlara değer verir; bilinmeyen ya da sabit alan reddedilir.
export function adimDegerleriDenetle(alanlar: readonly SartnameAlani[], degerler: Readonly<ParametreDegerleri>): string | null {
  const harita = new Map(alanlar.map((a) => [a.anahtar, a]));
  for (const [k, d] of Object.entries(degerler)) {
    const a = harita.get(k);
    if (!a) return `${k}: şartnamede böyle bir alan yok.`;
    if (!a.adimdaDegisir) return `${a.ad}: bu alan şartnamede sabittir, adımda değişmez.`;
    const hata = degerHatasi(a, d);
    if (hata) return hata;
  }
  return null;
}

// Emre sabitlenecek değerler: adımda değişen alan adımın değerini (verilmediyse varsayılanı), sabit alan şablonun değerini alır.
// Sürüm değişince alanı kalmayan adım değeri düşer; türü değişen alanın uymayan değeri varsayılana döner.
export function cozulmusDegerler(alanlar: readonly SartnameAlani[], degerler: Readonly<ParametreDegerleri>): ParametreDegerleri {
  const sonuc: ParametreDegerleri = {};
  for (const a of alanlar) {
    const adimdaki = degerler[a.anahtar];
    const gecerli = a.adimdaDegisir && adimdaki !== undefined && !bosMu(adimdaki) && degerHatasi(a, adimdaki) === null;
    sonuc[a.anahtar] = gecerli ? (adimdaki as ParametreDegeri) : a.varsayilan;
  }
  return sonuc;
}

export function eksikZorunlular(alanlar: readonly SartnameAlani[], cozulmus: Readonly<ParametreDegerleri>): string[] {
  return alanlar.filter((a) => a.zorunlu && bosMu(cozulmus[a.anahtar])).map((a) => a.ad);
}

// Fason adım fason ya da ikisi kapsamlı, iç adım (makine, kişi, istasyon ya da kaynaksız) iç ya da ikisi kapsamlı şartname alır (972 a).
export const kapsamUyarMi = (kapsam: SartnameKapsami, fason: boolean): boolean => kapsam === 'ikisi' || kapsam === (fason ? 'fason' : 'ic');

export interface AdimSartnameDurumu {
  opNo: number; kod: string; aktif: boolean; yururlukteVar: boolean; kapsamUyar: boolean; eksikler: readonly string[];
}

// Onaya gönderme ve onayda: bağlı her şartname kullanımda, yayınlanmış, adımın kaynağına uygun ve zorunlu alanları dolu olmalıdır.
export function sartnameOnayEngeli(durumlar: readonly AdimSartnameDurumu[]): string | null {
  for (const d of durumlar) {
    if (!d.aktif) return `OP ${d.opNo}: ${d.kod} şartnamesi kullanımda değil.`;
    if (!d.yururlukteVar) return `OP ${d.opNo}: ${d.kod} şartnamesinin yayınlanmış sürümü yok.`;
    if (!d.kapsamUyar) return `OP ${d.opNo}: ${d.kod} şartnamesi adımın kaynağına uymuyor (iç ya da fason).`;
    if (d.eksikler.length > 0) return `OP ${d.opNo}: ${d.kod} şartnamesinde zorunlu alan boş: ${d.eksikler.join(', ')}`;
  }
  return null;
}
