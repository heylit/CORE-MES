import type { DurumEmirleri, DurumRotaAdimi } from '#paylasilan/sozlesme/recete-rota.ts';
import type { DurumCevabi } from '#paylasilan/sozlesme/planlama.ts';
import type { StokOkumasi } from '../../kopru.ts';
import { sayi } from '../bicim.ts';
import type { EkranYerlesimi } from '../veri.ts';

// R3 saf hesapları (Üretim emirleri ve Stok). Ekran yalnız gösterir: kural, yetki ve sürüm sahibin ucundadır. Bugünkü çerçevenin ikinci
// plan motoru (`planRun`) taşınmaz (215 a): emir tarihleri plan motorunun yerleşiminden okunur, malzeme ihtiyacı burada ağaçtan çıkarılır.
export type Emir = DurumEmirleri['orders'][number];
type Durum = Pick<DurumCevabi, 'items' | 'routes' | 'routeRevs' | 'opdefs' | 'stations' | 'emirler'>;
type Malzeme = NonNullable<DurumCevabi['items']>[number];

const EPS = 1e-9;
const yuvarla6 = (x: number): number => Math.round(x * 1e6) / 1e6;

export const ONCELIK_ADI: Readonly<Record<number, string>> = { 1: 'Acil', 2: 'Yüksek', 3: 'Normal', 4: 'Düşük' };
export const DURUM_ADI: Readonly<Record<Emir['status'], string>> = {
  taslak: 'Taslak', serbest: 'Serbest', uretimde: 'Üretimde', tamam: 'Üretimi bitti', iptal: 'İptal',
};
// 1082 a: son adımda emir "Üretimi bitti" olur; kalite ve müdür onayından sonra sahibinin kapanış sonucu yazılır.
const KAPANIS_ADI = { tamamlandi: 'Tamamlandı', saglamsiz: 'Kapandı (sağlamsız)' } as const;
export const durumAdi = (o: Pick<Emir, 'status' | 'kapanisSonucu'>): string =>
  (o.status === 'tamam' && o.kapanisSonucu ? KAPANIS_ADI[o.kapanisSonucu] : DURUM_ADI[o.status]);
const ACIK_DURUMLAR: ReadonlySet<Emir['status']> = new Set(['taslak', 'serbest', 'uretimde']);
export const acikMi = (o: Pick<Emir, 'status'>): boolean => ACIK_DURUMLAR.has(o.status);
// Plana giren emir: serbest ve üretimdeki (taslak plana girmez; bugünkü ekranla aynı).
export const plandaMi = (o: Pick<Emir, 'status'>): boolean => o.status === 'serbest' || o.status === 'uretimde';

// Liste süzgeci: bugünkü ekranın altı düğmesi (aktif, serbest, üretimde, taslak, tamamlanan, tümü).
export const DURUM_SUZGECLERI = [
  { deger: 'aktif', baslik: 'Aktif' }, { deger: 'serbest', baslik: 'Serbest' }, { deger: 'uretimde', baslik: 'Üretimde' },
  { deger: 'taslak', baslik: 'Taslak' }, { deger: 'tamam', baslik: 'Üretimi biten' }, { deger: 'tum', baslik: 'Tümü' },
] as const;
export type DurumSuzgeci = (typeof DURUM_SUZGECLERI)[number]['deger'];
export const durumUyar = (o: Emir, s: DurumSuzgeci): boolean =>
  (s === 'tum' ? true : s === 'aktif' ? acikMi(o) : o.status === s);

export interface AgacSatiri { emir: Emir; derinlik: number; alt: boolean }

// Alt emirler (kol ve parti) ana emrin altında girintili; ana emri listede olmayan alt emir kendi başına satırdır. Kökler önce öncelik,
// sonra teslim sırasıyla. Süzgece uymayan ana emir, uyan alt emri varsa yine görünür (bugünkü ekran gibi).
export function emirAgaci(emirler: readonly Emir[], uyar: (o: Emir) => boolean): AgacSatiri[] {
  const kimlikler = new Set(emirler.map((o) => o.id));
  const cocuklar = new Map<string, Emir[]>();
  for (const o of emirler) {
    if (o.parentId !== null && kimlikler.has(o.parentId)) cocuklar.set(o.parentId, [...(cocuklar.get(o.parentId) ?? []), o]);
  }
  const dugum = (o: Emir, derinlik: number): AgacSatiri[] | null => {
    const alt = (cocuklar.get(o.id) ?? []).map((c) => dugum(c, derinlik + 1)).filter((x): x is AgacSatiri[] => x !== null).flat();
    return uyar(o) || alt.length ? [{ emir: o, derinlik, alt: derinlik > 0 }, ...alt] : null;
  };
  return emirler
    .filter((o) => o.parentId === null || !kimlikler.has(o.parentId))
    .sort((a, b) => a.priority - b.priority || String(a.due).localeCompare(String(b.due)))
    .map((o) => dugum(o, 0))
    .filter((x): x is AgacSatiri[] => x !== null)
    .flat();
}

export interface EmirAdimi { sira: number; opNo: number; ad: string; opId: string | null; stationId: string | null; durum: 'bekliyor' | 'calisiyor' | 'tamam' | null }

const urunRevizyonlari = (d: Durum, urunId: string) => (d.routeRevs ?? []).filter((r) => r.itemId === urunId);
export const yururluktekiRevizyon = (d: Durum, urunId: string) => urunRevizyonlari(d, urunId).find((r) => r.status === 'yururlukte') ?? null;
// Emrin açıldığı revizyon (yürürlükte ya da onaylı): sunucu emri onaylı revizyona da bağlı olabilir.
export const emirRevizyonu = (d: Durum, o: Emir) =>
  (o.rev === null ? null : urunRevizyonlari(d, o.itemId).find((r) => r.id === o.rev && (r.status === 'yururlukte' || r.status === 'onayli')) ?? null);

const siraliAdimlar = (adimlar: readonly DurumRotaAdimi[]): DurumRotaAdimi[] => [...adimlar].sort((a, b) => a.seq - b.seq);
// Ürünün yürürlükteki rotası (adımı varsa): ürün üretilir. Rotası olmayan ürün emirde "rotasız" açılır.
export const uretilirMi = (d: Durum, urunId: string): boolean => (d.routes?.[urunId]?.steps.length ?? 0) > 0;

// Emrin adımları 1 tabanlı sırayla: rotasız emirde emrin kendi adımları, öteki emirde açıldığı revizyonun (yoksa yürürlükteki) rotası.
export function emirAdimlari(d: Durum, o: Emir): EmirAdimi[] {
  if (o.rotasiz) {
    return [...(o.adimlar ?? [])].sort((a, b) => a.seq - b.seq)
      .map((a, i) => ({ sira: i + 1, opNo: a.opNo, ad: a.ad, opId: a.opId, stationId: a.stationId, durum: a.durum }));
  }
  const rota = emirRevizyonu(d, o)?.data ?? d.routes?.[o.itemId] ?? null;
  if (rota === null) return [];
  return siraliAdimlar(rota.steps).map((s, i) => ({ sira: i + 1, opNo: s.opNo, ad: s.name, opId: s.opId, stationId: s.stationId, durum: null }));
}

// Emrin kendi adım aralığı (1 tabanlı): kol emri N+1..M-1 adımlarını yapar, öteki emir bütün rotayı.
export const emirAraligi = (o: Pick<Emir, 'kol'>, adimSayisi: number): { ilk: number; son: number } =>
  (o.kol ? { ilk: o.kol.n + 1, son: o.kol.m - 1 } : { ilk: 1, son: adimSayisi });

// Adımın durumu: anahtar `<emir>|root|<emrin iş emri sırası>`; kolda iş emri sırası rota adımından ayrılma adımı kadar kayar.
export function adimDurumu(o: Pick<Emir, 'id' | 'kol'>, rotaSirasi: number, opStatus: Record<string, 'calisiyor' | 'tamam'>): 'bekliyor' | 'calisiyor' | 'tamam' {
  const sira = o.kol ? rotaSirasi - o.kol.n : rotaSirasi;
  return opStatus[`${o.id}|root|${String(sira)}`] ?? 'bekliyor';
}

export interface Ilerleme { biten: number; toplam: number }
export function ilerleme(d: Durum, o: Emir): Ilerleme {
  const adimlar = emirAdimlari(d, o);
  const { ilk, son } = emirAraligi(o, adimlar.length);
  const kendi = adimlar.filter((a) => a.sira >= ilk && a.sira <= son);
  const opStatus = d.emirler?.opStatus ?? {};
  const biten = kendi.filter((a) => (a.durum ?? adimDurumu(o, a.sira, opStatus)) === 'tamam').length;
  return { biten, toplam: kendi.length };
}

// Plan motorunun yerleşimi (215 a): anahtar `emirNo|opNo`, bölünmüş işte `emirNo|opNo~parça`. Adımın plan başlangıcı parçaların en
// erkeni, bitişi en geçidir (468/2 a); bir parçanın bitişi yoksa adımın bitişi bilinmez (null). Yerleşim okunamadıysa (null) tarih
// yoktur; yerleşimde olmayan adım plana yerleşmemiştir.
export interface AdimPlani { baslangic: string; bitis: string | null; makineIdler: string[] }
export function adimPlani(yerlesim: EkranYerlesimi | null, emirNo: string, opNo: number): AdimPlani | null {
  if (yerlesim === null) return null;
  const onek = `${emirNo}|${String(opNo)}`;
  const parcalar = Object.entries(yerlesim).filter(([k]) => k === onek || k.startsWith(`${onek}~`)).flatMap(([, l]) => l);
  if (parcalar.length === 0) return null;
  const baslangic = parcalar.map((p) => p.baslangic).sort()[0] as string;
  const bitisler = parcalar.map((p) => p.bitis ?? null);
  const bitis = bitisler.includes(null) ? null : (bitisler as string[]).sort().at(-1) as string;
  const makineIdler = [...new Set(parcalar.map((p) => p.makineId).filter((m): m is number => m !== null).map(String))];
  return { baslangic, bitis, makineIdler };
}

// Emrin tampon durumu (477 a, eski ekranın hesabı): bolluk teslim günü sonuna kalan takvim günüdür (kesirli); plan ayarının tampon günüyle
// kıyaslanır. Tampon 0 ise geç olmayan emir yeterli sayılır.
export type TamponDurumu = 'gec' | 'kirmizi' | 'sari' | 'yesil';
const GUN_MS = 86_400_000;
const PAY = 1e-9;
export function tamponDurumu(bolluk: number, tamponGun: number): TamponDurumu {
  if (bolluk < -PAY) return 'gec';
  if (tamponGun <= PAY) return 'yesil';
  return bolluk < tamponGun / 3 ? 'kirmizi' : bolluk < (2 * tamponGun) / 3 ? 'sari' : 'yesil';
}
const teslimGunuSonu = (due: string): number => { const t = new Date(`${due}T00:00:00`); t.setDate(t.getDate() + 1); return t.getTime(); };

// Emrin plan özeti: ilk açık adımın başlangıcı ve açık adımların en geç bitişi (eski ekrandaki "Plan bitiş"). Yerleşen bir adımın bitişi
// yoksa emrin bitişi bilinmez (null) ve gecikme hesaplanmaz. Motorun yerleştiremediği açık adım varsa emir eski ekrandaki gibi
// planlanamaz ve geç sayılır; yerleşimde de listede de olmayan açık adımı (çalışan, fason) motor hesaba katmıştır. Bolluk ve tampon
// yalnız bitiş ve teslim biliniyorsa vardır (teslimsiz emre tarih uydurulmaz, 468/1 a).
// 487/1 c: `kok` motorun asıl nedeniyle bırakılan adımlardır; önceki adım ya da bağlı parti yerleşmediği için bırakılan ardıllar sayılmaz.
// 487/2 b: `calisanPlanDisi` plana girmemiş çalışan adımlardır (makinesi bilinmiyor ya da plan kapsamı dışında); tarih ve gecikme değişmez.
export type PlanOzeti =
  | { tur: 'tamam'; metin: string } | { tur: 'plan-disi' } | { tur: 'motor-yok' } | { tur: 'yerlesmedi'; acikAdim: number; calisanPlanDisi: number[] }
  | { tur: 'planlanamiyor'; adimlar: { opNo: number; neden: string }[]; kok: { opNo: number; neden: string }[] }
  | { tur: 'plan'; ilk: string; bitis: string | null; gecikiyor: boolean; bolluk: number | null; tampon: TamponDurumu | null; calisanPlanDisi: number[] };
// Plan motorunun ardıl nedenleri (`sunucu/moduller/plan/kurallar.ts`): kök adım yerleşmeyince arkasındakiler bunlarla bırakılır.
const ARDIL_NEDENLERI: ReadonlySet<string> = new Set(['Önceki iş emri yerleşmedi.', 'Bağlı parti yerleşmedi.']);
export function planOzeti(
  d: Durum & Pick<DurumCevabi, 'settings'> & { planYerlesmeyen?: Record<string, string> }, yerlesim: EkranYerlesimi | null, o: Emir,
): PlanOzeti {
  if (o.status === 'tamam') return { tur: 'tamam', metin: durumAdi(o) };
  if (!plandaMi(o)) return { tur: 'plan-disi' };
  if (yerlesim === null) return { tur: 'motor-yok' };
  const adimlar = emirAdimlari(d, o);
  const { ilk, son } = emirAraligi(o, adimlar.length);
  const opStatus = d.emirler?.opStatus ?? {};
  const durumu = (a: EmirAdimi) => a.durum ?? adimDurumu(o, a.sira, opStatus);
  const acik = adimlar.filter((a) => a.sira >= ilk && a.sira <= son && durumu(a) !== 'tamam');
  const yerlesmeyen = acik.flatMap((a) => { const neden = d.planYerlesmeyen?.[`${o.no}|${String(a.opNo)}`]; return neden === undefined ? [] : [{ opNo: a.opNo, neden }]; });
  if (yerlesmeyen.length > 0) {
    // Kök adım başka emirdeyse (bağlı parti) bu emirde yalnız ardıl kalır; o zaman ardıllar gösterilir, boş neden yazılmaz.
    const kok = yerlesmeyen.filter((y) => !ARDIL_NEDENLERI.has(y.neden));
    return { tur: 'planlanamiyor', adimlar: yerlesmeyen, kok: kok.length > 0 ? kok : yerlesmeyen };
  }
  const calisanPlanDisi = acik.filter((a) => durumu(a) === 'calisiyor' && adimPlani(yerlesim, o.no, a.opNo) === null).map((a) => a.opNo);
  const planlar = acik.map((a) => adimPlani(yerlesim, o.no, a.opNo)).filter((p): p is AdimPlani => p !== null);
  if (planlar.length === 0) return { tur: 'yerlesmedi', acikAdim: acik.length, calisanPlanDisi };
  const bitisler = planlar.map((p) => p.bitis);
  const bitis = bitisler.includes(null) ? null : (bitisler as string[]).sort().at(-1) as string;
  // Teslim günü sonuna (yerel saat; teslim yerel tarihtir) kadar biten emir geç sayılmaz.
  const bolluk = o.due !== null && bitis !== null ? (teslimGunuSonu(o.due) - Date.parse(bitis)) / GUN_MS : null;
  const tampon = bolluk === null ? null : tamponDurumu(bolluk, d.settings.buffer);
  return {
    tur: 'plan', ilk: planlar.map((p) => p.baslangic).sort()[0] as string, bitis, gecikiyor: tampon === 'gec', bolluk, tampon, calisanPlanDisi,
  };
}

// Emir şeridinin renk numarası (0..9, ortak grafik renkleri) plan sırasından, eski ekranın sırasıyla: on rengin hepsi döner ve komşu
// emirler farklı renk alır (çarpan 10 ile aralarında asal).
export const SERIT_SAYISI = 10;
export const seritNo = (sira: number): number => (sira * 3 + 1) % SERIT_SAYISI;

// Emrin rotası yürürlüktekinden eskiyse: rotaya eklenen ve rotadan çıkan adımlar (OP numarasıyla).
export interface RotaFarki { eskiNo: string; yeniNo: string; eklenen: { opNo: number; ad: string }[]; cikan: number[] }
export function rotaFarki(d: Durum, o: Emir): RotaFarki | null {
  if (o.rotasiz === true || o.rev === null || !acikMi(o)) return null;
  const yeni = yururluktekiRevizyon(d, o.itemId);
  const eski = emirRevizyonu(d, o);
  if (yeni === null || eski === null || yeni.id === eski.id) return null;
  const eskiOp = new Set(eski.data.steps.map((s) => s.opNo));
  const yeniOp = new Set(yeni.data.steps.map((s) => s.opNo));
  const ad = (s: DurumRotaAdimi) => d.opdefs?.find((x) => x.id === s.opId)?.name ?? s.name;
  return {
    eskiNo: eski.no, yeniNo: yeni.no,
    eklenen: siraliAdimlar(yeni.data.steps).filter((s) => !eskiOp.has(s.opNo)).map((s) => ({ opNo: s.opNo, ad: ad(s) })),
    cikan: siraliAdimlar(eski.data.steps).filter((s) => !yeniOp.has(s.opNo)).map((s) => s.opNo),
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Malzeme ihtiyacı: emirler plan sırasıyla (başlamış önce, sonra öncelik, teslim, açılış) ürün ağacından patlatılır; serbest stok emirlere
// bu sırayla paylaştırılır (alt seviye üretilen parça da stoktan netleşir). Fire: adım ret yüzdesi önceki adımları büyütür, girdi firesi
// girdiyi büyütür. Ara adım stoğu (stoktaki rota statüsü) da aynı sırayla paylaştırılır: adımın çıktısı olarak bekleyen miktar sonraki adımın
// girdisini karşılar, o adım ve öncekiler o kadar az üretir (461 b; prototipin build kuralı). Yalnız ürünün kendi rota adımının statüsü
// sayılır; kayıt belgesindeki yerel stok kullanılmaz (208 a).
export interface IhtiyacSatiri { malzemeId: string; brut: number; stoktan: number; alinacak: number }
export interface EmirIhtiyaci { hammadde: IhtiyacSatiri[]; yanUrun: { malzemeId: string; miktar: number }[]; eksikler: IhtiyacSatiri[]; uyarilar: string[] }

// Adım ret yüzdesi önceki adımları büyütür: son adım 1, her önceki adım sonrakilerin 1/(1-ret) çarpımı (ret en çok %95).
export function adimCarpanlari(adimlar: readonly Pick<DurumRotaAdimi, 'rejectPct'>[]): number[] {
  const f = new Array<number>(adimlar.length).fill(1);
  let birikim = 1;
  for (let j = adimlar.length - 1; j >= 0; j--) {
    const ret = Math.min(0.95, Math.max(0, (adimlar[j]?.rejectPct ?? 0) / 100));
    birikim /= 1 - ret;
    f[j] = birikim;
  }
  return f;
}

const baslamis = (o: Emir, opStatus: Record<string, unknown>, opProg: Record<string, number>): boolean => {
  const onek = `${o.id}|`;
  return Object.keys(opStatus).some((k) => k.startsWith(onek)) || Object.entries(opProg).some(([k, v]) => k.startsWith(onek) && v > EPS);
};

// Plan sırası: başlamış emir önce, sonra öncelik, teslim ve açılış. Liste yalnız plana giren emirlerdir.
export function planSirasi(d: Durum): Emir[] {
  const e = d.emirler;
  if (!e) return [];
  return e.orders.filter(plandaMi).sort((a, b) =>
    Number(baslamis(b, e.opStatus, e.opProg)) - Number(baslamis(a, e.opStatus, e.opProg))
    || a.priority - b.priority || String(a.due).localeCompare(String(b.due)) || a.created - b.created);
}

const kolIcinde = (kol: { n: number; m: number }, j: number): boolean => j >= kol.n && j <= kol.m - 2;
const kolAraligiGecerli = (n: number, m: number, adimSayisi: number): boolean => n >= 1 && m - n >= 2 && m <= adimSayisi;

// Ara adım havuzu: anahtar `<ürün>|<adım kimliği>`. Statünün kaynak adımı `<ürün no>-o<OP>` biçimindedir; ürünü yazmayan eski biçim
// hangi ürünün olduğu belli olmadığı için sayılmaz. Bir statünün stoğu hangi kartın kırılımında görünürse görünsün toplanır.
export function araStokHavuzu(okuma: StokOkumasi | null): Map<string, number> {
  const havuz = new Map<string, number>();
  const statuler = okuma?.statuler;
  const malzemeler = okuma?.malzemeler;
  if (!statuler || !malzemeler) return havuz;
  const anahtar = new Map<number, string>();
  for (const s of statuler) {
    const m = /^(\d+)-(o\d+)$/.exec(s.kaynakAdim);
    if (m) anahtar.set(s.id, `${m[1] ?? ''}|${m[2] ?? ''}`);
  }
  for (const k of Object.values(malzemeler)) {
    for (const r of k?.kirilim ?? []) {
      const a = r.statuId === null ? undefined : anahtar.get(r.statuId);
      const q = Number(r.miktar);
      if (a !== undefined && Number.isFinite(q) && q > EPS) havuz.set(a, (havuz.get(a) ?? 0) + q);
    }
  }
  return havuz;
}

export function malzemeIhtiyaclari(d: Durum, okuma: StokOkumasi | null = null): Map<string, EmirIhtiyaci> {
  const malzeme = new Map<string, Malzeme>((d.items ?? []).map((i) => [i.id, i]));
  const havuz = new Map<string, number>((d.items ?? []).map((i) => [i.id, Math.max(0, i.stock ?? 0)]));
  const araHavuz = araStokHavuzu(okuma);
  const sira = planSirasi(d);
  const sonuc = new Map<string, EmirIhtiyaci>();

  for (const o of sira) {
    const R: EmirIhtiyaci = { hammadde: [], yanUrun: [], eksikler: [], uyarilar: [] };
    const ham = new Map<string, IhtiyacSatiri>();
    const yan = new Map<string, number>();
    const uyar = (m: string) => { if (!R.uyarilar.includes(m)) R.uyarilar.push(m); };

    const patlat = (urunId: string, miktar: number, yol: readonly string[], kok: boolean, adimlar: readonly DurumRotaAdimi[] | null, tut: ((j: number) => number) | null) => {
      const kart = malzeme.get(urunId);
      if (yol.includes(urunId)) { uyar(`${kart?.code ?? urunId} kendi akışında tekrar kullanılıyor (döngü).`); return; }
      let net = miktar;
      let stoktan = 0;
      if (!kok) {
        const eldeki = havuz.get(urunId) ?? 0;
        stoktan = Math.min(eldeki, miktar);
        if (stoktan > EPS) havuz.set(urunId, eldeki - stoktan);
        net = miktar - stoktan;
      }
      const ss = adimlar ?? (kart?.type !== 'ham' ? d.routes?.[urunId]?.steps ?? null : null);
      if (ss === null || ss.length === 0) {
        const e = ham.get(urunId) ?? { malzemeId: urunId, brut: 0, stoktan: 0, alinacak: 0 };
        e.brut += miktar; e.stoktan += stoktan; e.alinacak += net;
        ham.set(urunId, e);
        if (kart && kart.type !== 'ham' && kart.type !== 'sarf') uyar(`${kart.code} ${kart.name}: rotası yok, satın alınan parça gibi hesaplandı.`);
        return;
      }
      if (net <= EPS) return;
      const sirali = siraliAdimlar(ss);
      const fs = adimCarpanlari(sirali);
      // Adımın yapacağı miktar; ara stok son adımdan geriye doğru düşülür. Kol hesabında (tut) ara stok kullanılmaz (prototipte de öyle).
      const yapilacak = sirali.map((_, j) => net * (fs[j] ?? 1));
      if (!tut && araHavuz.size) {
        for (let k = sirali.length - 2; k >= 0; k--) {
          const a = `${urunId}|${sirali[k]?.id ?? ''}`;
          const kullan = Math.min(araHavuz.get(a) ?? 0, yapilacak[k + 1] ?? 0);
          if (kullan > EPS) araHavuz.set(a, (araHavuz.get(a) ?? 0) - kullan);
          const ret = Math.min(0.95, Math.max(0, (sirali[k]?.rejectPct ?? 0) / 100));
          yapilacak[k] = Math.max(0, (yapilacak[k + 1] ?? 0) - Math.max(0, kullan)) / (1 - ret);
        }
      }
      sirali.forEach((s, j) => {
        const kf = tut ? tut(j) : 1;
        if (!(kf > EPS)) return;
        const carpan = (yapilacak[j] ?? 0) * kf;
        for (const g of s.ins) {
          if (!malzeme.has(g.itemId)) continue;
          patlat(g.itemId, carpan * g.qty * (1 + (g.scrap || 0) / 100), [...yol, urunId], false, null, null);
        }
        for (const c of s.outs) {
          if (c.kind === 'yan' && malzeme.has(c.itemId)) yan.set(c.itemId, (yan.get(c.itemId) ?? 0) + carpan * c.qty);
        }
      });
    };

    const adimlar = o.rotasiz ? [] : (emirRevizyonu(d, o)?.data ?? d.routes?.[o.itemId])?.steps ?? null;
    const n = adimlar?.length ?? 0;
    // Kol emri yalnız N+1..M-1 adımlarını, ana emir bu adımlarda kolların bıraktığı kalanı yapar.
    const kollar = sira.filter((k) => k.parentId === o.id && k.kol !== null && kolAraligiGecerli(k.kol.n, k.kol.m, n) && k.qty > 0 && k.qty < o.qty);
    const olcek = (j: number) => Math.max(0, kollar.reduce((f, k) => (k.kol && kolIcinde(k.kol, j) ? f - k.qty / o.qty : f), 1));
    let tut: ((j: number) => number) | null = kollar.length ? olcek : null;
    if (o.kol !== null && o.parentId !== null) {
      const ana = sira.find((p) => p.id === o.parentId);
      const kol = o.kol;
      const gecerli = kolAraligiGecerli(kol.n, kol.m, n) && (!ana || o.qty < ana.qty);
      tut = gecerli ? (j) => (kolIcinde(kol, j) ? olcek(j) : 0) : () => 0;
      if (!gecerli) uyar('Kol aralığı ya da miktarı ana emre uymuyor; kolun malzemesi hesaplanmadı.');
    }
    if (adimlar !== null && adimlar.length > 0) patlat(o.itemId, o.qty, [], true, adimlar, tut);

    R.hammadde = [...ham.values()].map((e) => ({ ...e, brut: yuvarla6(e.brut), stoktan: yuvarla6(e.stoktan), alinacak: yuvarla6(e.alinacak) }));
    R.yanUrun = [...yan.entries()].map(([malzemeId, miktar]) => ({ malzemeId, miktar: yuvarla6(miktar) }));
    R.eksikler = R.hammadde.filter((e) => e.alinacak > 1e-6);
    sonuc.set(o.id, R);
  }
  return sonuc;
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Bölme (parti ve kol): yalnız seçim toplanır ve önizleme çizilir; geçerliliğe Üretim Emirleri'nin ucu karar verir.
export const AZAMI_PARTI = 20;
export const AZAMI_EK_ADIM = 20;

export type MiktarOkuma = { tamam: true; deger: number | null } | { tamam: false; ileti: string };
// Kutudaki miktar: boş null, virgül ondalık ayırıcıdır. Tek sayı olmalı.
export function miktarOku(metin: string): MiktarOkuma {
  const t = metin.trim();
  if (t === '') return { tamam: true, deger: null };
  const v = Number(t.replace(',', '.'));
  if (!Number.isFinite(v) || !/^\d+([.,]\d+)?$/.test(t)) return { tamam: false, ileti: `Miktar sayı olmalı: "${t}".` };
  return { tamam: true, deger: v };
}

export interface BolmeHucresi { miktar: number; bitti: boolean }
export interface BolmeSatiri { ad: string; tur: 'ana' | 'kol' | 'parti'; hucreler: (BolmeHucresi | null)[]; bos?: (string | null)[] }
export interface MevcutKol { n: number; m: number; miktar: number }
export interface BolmeGirdisi {
  anaAd: string;
  miktar: number;
  adimSayisi: number;
  aralik: { ilk: number; son: number };
  mevcutKollar: readonly MevcutKol[];
  // Bitmiş adım sırası (önizlemede işaretlenir).
  bitti: (sira: number) => boolean;
}
export type BolmeSecimi = { tur: 'parti'; partiler: readonly string[] } | { tur: 'kol'; n: number | null; m: number | null; miktar: string };
export interface BolmeSonucu { hazir: boolean; ileti: string | null; bilgi: boolean; ipucu: string | null; kalan: number | null; satirlar: BolmeSatiri[]; partiler: number[] }

export function bolmeHesapla(g: BolmeGirdisi, s: BolmeSecimi): BolmeSonucu {
  const r: BolmeSonucu = { hazir: false, ileti: null, bilgi: false, ipucu: null, kalan: null, satirlar: [], partiler: [] };
  if (!(g.miktar > 0)) return { ...r, ileti: 'Emir miktarı sıfırdan büyük olmalı.', bilgi: true };
  const sutunlar = Array.from({ length: g.adimSayisi }, (_, i) => i + 1);
  const yukte = (kollar: readonly MevcutKol[], j: number) => kollar.filter((k) => j > k.n && j < k.m).reduce((t, k) => t + k.miktar, 0);
  const icinde = (j: number) => j >= g.aralik.ilk && j <= g.aralik.son;
  const satir = (ad: string, tur: BolmeSatiri['tur'], miktar: (j: number) => number | null, isaret: boolean): BolmeSatiri => ({
    ad, tur, hucreler: sutunlar.map((j) => { const q = miktar(j); return q === null ? null : { miktar: q, bitti: isaret && g.bitti(j) }; }),
  });
  if (s.tur === 'kol') {
    if (s.n === null) return { ...r, ipucu: 'Önce kolun ayrılacağı adımı seçin.' };
    if (s.m === null) return { ...r, ipucu: 'Şimdi ana emre birleşeceği adımı seçin.' };
    const o = miktarOku(s.miktar);
    if (!o.tamam) return { ...r, ileti: o.ileti };
    if (o.deger === null || !(o.deger > 0)) return { ...r, ileti: 'Kol miktarını girin.', bilgi: true };
    const q = o.deger;
    const tum = [...g.mevcutKollar, { n: s.n, m: s.m, miktar: q }];
    let yuk = 0;
    for (let j = s.n + 1; j < s.m; j++) yuk = Math.max(yuk, yukte(tum, j));
    const kol = satir('Yeni kol', 'kol', (j) => (j > s.n! && j < s.m! ? q : null), false);
    kol.bos = sutunlar.map((j) => (j <= s.n! ? 'ana emirde' : j >= s.m! ? 'katıldı' : null));
    return {
      ...r, hazir: true, kalan: yuvarla6(g.miktar - yuk), partiler: [q],
      satirlar: [satir(g.anaAd, 'ana', (j) => (icinde(j) ? yuvarla6(g.miktar - yukte(tum, j)) : null), true), kol],
    };
  }
  const partiler: number[] = [];
  const sira: number[] = [];
  for (const [i, t] of s.partiler.entries()) {
    const o = miktarOku(t);
    if (!o.tamam) return { ...r, ileti: `Parti ${String(i + 1)}: ${o.ileti}` };
    if (o.deger !== null) { partiler.push(o.deger); sira.push(i); }
  }
  if (partiler.length === 0) return { ...r, ileti: 'Alt emir miktarını girin.', bilgi: true };
  const kalan = yuvarla6(g.miktar - partiler.reduce((a, b) => a + b, 0));
  return {
    ...r, hazir: true, kalan, partiler,
    satirlar: [
      satir(g.anaAd, 'ana', (j) => (icinde(j) ? yuvarla6(kalan - yukte(g.mevcutKollar, j)) : null), true),
      ...partiler.map((q, i) => satir(`Parti ${String((sira[i] ?? i) + 1)}`, 'parti', (j) => (icinde(j) ? q : null), true)),
    ],
  };
}

// Eşit bölme: her parti tam sayı; artan ana emirde kalır. Bölünemezse null.
export function esitBol(miktar: number, partiSayisi: number): number | null {
  const b = Math.floor(miktar / (partiSayisi + 1));
  return b >= 1 ? b : null;
}

// Kol: rotada en az 3 adım olmalı; ayrılma ile birleşme arasında en az bir adım kalır.
export const kolOlur = (adimSayisi: number): boolean => adimSayisi >= 3;
// Şeritte seçim: ilk dokunuş ayrılma, ikinci birleşme; birleşme ayrılmadan en az iki sonra olmalı, değilse seçim baştan başlar.
export function kolAdimiSec(n: number | null, m: number | null, j: number, adimSayisi: number): { n: number | null; m: number | null } {
  if (n === null || m !== null) return j < adimSayisi - 1 ? { n: j, m: null } : { n: null, m: null };
  if (j === n) return { n: null, m: null };
  if (j >= n + 2) return { n, m: j };
  return j < adimSayisi - 1 ? { n: j, m: null } : { n, m: null };
}

// Rotasız emre eklenen adımın OP numarası: son adımın onluğunun bir sonrakisi (bugünkü ekranla aynı).
export const yeniOpNo = (adimlar: readonly { opNo: number }[]): number => {
  const son = adimlar.at(-1);
  return son ? (Math.floor(son.opNo / 10) + 1) * 10 : 10;
};

// Süre kutusu: boş null (sıfır uydurulmaz), virgül noktaya.
export const sureMetni = (v: string): string | null => { const t = v.trim().replace(',', '.'); return t === '' ? null : t; };

// ---------------------------------------------------------------------------------------------------------------------------------
// Yeni emir tarihleri: başlangıç bugünden sonraki ilk iş günü, teslim dokuz iş günü sonrası. İş günü hafta içi ve tatil olmayan gündür
// (vardiya haftası durumda yok).
const isoGun = (t: Date): string => `${String(t.getFullYear())}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
export function isGunu(gun: string, tatiller: readonly string[]): boolean {
  const t = new Date(`${gun}T00:00:00`);
  const hg = t.getDay();
  return hg !== 0 && hg !== 6 && !tatiller.includes(gun);
}
export function isGunuEkle(gun: string, kac: number, tatiller: readonly string[]): string {
  const t = new Date(`${gun}T00:00:00`);
  let say = 0;
  for (let g = 0; g < 400; g++) {
    if (isGunu(isoGun(t), tatiller)) { if (say === kac) return isoGun(t); say++; }
    t.setDate(t.getDate() + 1);
  }
  return gun;
}
export const bugun = (simdi: Date = new Date()): string => isoGun(simdi);

// ---------------------------------------------------------------------------------------------------------------------------------
// Stok bölümü.
// Stok okuması en çok 200 kart içindir (köprünün sınırı); Stok ve emir ayrıntısı aynı listeyi kullanır ki okuma tek kez yapılsın.
export const AZAMI_STOK_KARTI = 200;
export const stokKartiIdleri = (items: readonly Malzeme[]): number[] => items.slice(0, AZAMI_STOK_KARTI).map((i) => i.kayitNo);
export interface StokSatiri { malzeme: Malzeme; serbest: number | null; minimumAlti: boolean }
// Serbest stok: stok okunabildiyse statü kırılımının statüsüz satırı, okunamadıysa durumdaki stok. Minimum altı yalnız minimumu olanda.
export function stokSatirlari(items: readonly Malzeme[], okuma: StokOkumasi | null): StokSatiri[] {
  return items.map((m) => {
    const kirilim = okuma?.malzemeler?.[m.id] ?? null;
    const serbest = kirilim ? Number(kirilim.kirilim.find((k) => k.statuId === null)?.miktar ?? 0) : m.stock;
    return { malzeme: m, serbest, minimumAlti: m.min !== null && m.min > 0 && serbest !== null && serbest < m.min };
  });
}

export interface StatuluSatir { malzeme: Malzeme; statuId: number; miktar: number }
export function statuluSatirlar(items: readonly Malzeme[], okuma: StokOkumasi | null): StatuluSatir[] {
  const m = okuma?.malzemeler;
  if (!m) return [];
  return items.flatMap((i) => (m[i.id]?.kirilim ?? []).filter((k) => k.statuId !== null).map((k) => ({ malzeme: i, statuId: k.statuId as number, miktar: Number(k.miktar) })));
}

// Statünün adı: serbest stok (null) "Serbest"; rotanın ara adımı ise tanımın adı; bilinmiyorsa numarasıyla.
export function statuAdi(okuma: StokOkumasi | null, statuId: number | null): string {
  if (statuId === null) return 'Serbest';
  const s = okuma?.statuler?.find((x) => x.id === statuId);
  return s ? s.ad : `Statü ${String(statuId)}`;
}

// Kalemin atlatılabileceği statüler: Reçete ve Rota'daki tanımları (malzeme no kalemin kodu); elle tanımlanan statü stokta yoktur.
export const statuHedefleri = (okuma: StokOkumasi | null, malzemeKodu: string): number[] =>
  (okuma?.statuler ?? []).filter((x) => x.malzemeNo === malzemeKodu).map((x) => x.id);

export interface SurecSatiri { anahtar: string; urun: string; opNo: number; miktar: number; emirler: string }

// Süreçteki malzeme (stok değildir): bir adımı geçmiş, sonraki adımı bekleyen miktar. Biten adımın çıktısı sonraki adımın işleyeceği
// adettir (sunucunun adım adedi, yoksa emir miktarı); bitmemiş adımın çıktısı terminalin sağlam sayacıdır. Sonraki adımın sağlam sayacı
// kadarı tüketilmiş sayılır. Rotanın son adımının çıktısı stoktur, burada yoktur.
export function surectekiMalzeme(d: Pick<DurumCevabi, 'emirler' | 'routes' | 'routeRevs' | 'adimAdetleri'>): SurecSatiri[] {
  const e = d.emirler;
  if (!e) return [];
  const satir = new Map<string, SurecSatiri & { emirMiktari: Map<string, number> }>();
  for (const o of e.orders.filter((x) => x.status === 'serbest' || x.status === 'uretimde')) {
    const rota = o.rotasiz ? null : (d.routeRevs?.find((r) => r.id === o.rev)?.data ?? d.routes?.[o.itemId]) ?? null;
    const adimlar: { opNo: number; bagimsiz: boolean }[] = o.rotasiz
      ? [...(o.adimlar ?? [])].sort((a, b) => a.seq - b.seq).map((a) => ({ opNo: a.opNo, bagimsiz: false }))
      : [...(rota?.steps ?? [])].sort((a, b) => a.seq - b.seq).map((a) => ({ opNo: a.opNo, bagimsiz: a.dep === 'bagimsiz' }));
    const ilk = o.kol ? o.kol.n + 1 : 1;
    const son = o.kol ? o.kol.m - 1 : adimlar.length;
    const anahtar = (j: number) => `${o.id}|root|${String(o.kol ? j - o.kol.n : j)}`;
    for (let j = ilk; j < son; j++) {
      const opNo = adimlar[j - 1]?.opNo;
      const sonrakiOp = adimlar[j]?.opNo;
      if (opNo === undefined || sonrakiOp === undefined) continue;
      // Çıktıyı tüketen sonraki adım bağımsız olmayan ilk adımdır (bağımsız adım önceki adımın parçasını beklemez; eski ekranın kuralı).
      let t = j + 1;
      while (t <= son && adimlar[t - 1]?.bagimsiz) t++;
      const biten = e.opStatus[anahtar(j)] === 'tamam';
      const uretilen = biten ? d.adimAdetleri?.[`${o.no}|${String(sonrakiOp)}`] ?? o.qty : e.opProg[anahtar(j)] ?? 0;
      const tuketilen = t > son ? 0 : e.opStatus[anahtar(t)] === 'tamam' ? uretilen : e.opProg[anahtar(t)] ?? 0;
      const kalan = uretilen - tuketilen;
      if (!(kalan > 1e-6)) continue;
      const k = `${o.itemId}|${String(opNo)}`;
      const s = satir.get(k) ?? { anahtar: k, urun: o.itemId, opNo, miktar: 0, emirler: '', emirMiktari: new Map<string, number>() };
      s.miktar += kalan;
      s.emirMiktari.set(o.no, (s.emirMiktari.get(o.no) ?? 0) + kalan);
      satir.set(k, s);
    }
  }
  return [...satir.values()].map(({ emirMiktari, ...s }) => ({ ...s, emirler: [...emirMiktari].map(([no, q]) => `${no}: ${sayi(q)}`).join(', ') }))
    .sort((a, b) => a.urun.localeCompare(b.urun) || a.opNo - b.opNo);
}
