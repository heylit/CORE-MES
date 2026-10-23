import { senaryo } from '../senaryo.ts';
import type { Rastgele } from '../tohum.ts';
import type { AdimCiktisi, Cevap, SenaryoBaglami } from '../senaryo.ts';
import type { Hesap } from '../../hesaplar.ts';

// S4: aynı kayda aynı anda iki yazma. Biri geçer, öbürü 409 alır; ikisinin de geçmesi kaydın iki kez yazıldığını gösterir (bulgu).
// Uçlar: uretim-emirleri modülü (`npm run harita -- --modul uretim-emirleri`). Gövdeler paylasilan/sozlesme/uretim-emirleri.ts.
// Hesap listesinde tek planlamacı var: ikinci planlamacı yönetici.
const PLANLAMACILAR = ['ornek.planlama', 'ornek.yonetici'] as const satisfies readonly Hesap[];
const OPERATORLER = ['ornek.operator1', 'ornek.operator2'] as const satisfies readonly Hesap[];
const [OPERATOR] = OPERATORLER;
const ONCELIKLER = [1, 2, 3, 4] as const;

export interface PlanlanacakEmir {
  id: number;
  kod: string;
}

export interface CalisanEmir {
  id: number;
  parcaNo: string;
  calisma: 'calisiyor' | 'durakli' | 'durdu';
}

export interface EmirSurumu {
  surum: number;
  oncelik: number;
}

const nesne = (d: unknown): Record<string, unknown> | null => (typeof d === 'object' && d !== null && !Array.isArray(d) ? d as Record<string, unknown> : null);
const tamSayi = (d: unknown): d is number => typeof d === 'number' && Number.isInteger(d);
const liste = (govde: unknown, alan: string): unknown[] => {
  const d = nesne(govde)?.[alan];
  return Array.isArray(d) ? d : [];
};
// Robotun ürettiği kayıt BNZ- önekiyle başlar. Örnek veri emri seçilir ki S1'in aynı anda yürüttüğü emre karışılmasın; yoksa herhangi biri.
const robotunMu = (kod: string): boolean => kod.startsWith('BNZ-');
const oncelikliSec = <T>(adaylar: readonly T[], kod: (a: T) => string, r: Rastgele): T | null => {
  if (adaylar.length === 0) return null;
  const ornek = adaylar.filter((a) => !robotunMu(kod(a)));
  return r.sec(ornek.length > 0 ? ornek : adaylar);
};

// GET /adimli-emirler cevabından önceliği değişebilen (taslak ya da planlı, arşiv dışı) emir.
export function planlanacakEmirSec(govde: unknown, r: Rastgele): PlanlanacakEmir | null {
  const adaylar: PlanlanacakEmir[] = [];
  for (const ham of liste(govde, 'emirler')) {
    const e = nesne(ham);
    if (e === null || !tamSayi(e['id']) || e['arsiv'] !== false) continue;
    if (e['durum'] !== 'taslak' && e['durum'] !== 'planli') continue;
    const kod = nesne(e['urun'])?.['kod'];
    adaylar.push({ id: e['id'], kod: typeof kod === 'string' ? kod : '' });
  }
  return oncelikliSec(adaylar, (a) => a.kod, r);
}

// GET /uretim-emirleri?durum=basladi cevabından terminalde komut alabilecek emir (canlı çalışma durumu dolu).
export function calisanEmirSec(govde: unknown, r: Rastgele): CalisanEmir | null {
  const adaylar: CalisanEmir[] = [];
  for (const ham of liste(govde, 'emirler')) {
    const e = nesne(ham);
    if (e === null || !tamSayi(e['id']) || e['durum'] !== 'basladi') continue;
    const calisma = nesne(e['canli'])?.['calisma'];
    if (calisma !== 'calisiyor' && calisma !== 'durakli' && calisma !== 'durdu') continue;
    adaylar.push({ id: e['id'], parcaNo: typeof e['parcaNo'] === 'string' ? e['parcaNo'] : '', calisma });
  }
  return oncelikliSec(adaylar, (a) => a.parcaNo, r);
}

// GET /adimli-emirler/:id cevabından sürüm ve öncelik; biri yoksa null (uydurulmaz).
export function emirSurumuOku(govde: unknown): EmirSurumu | null {
  const e = nesne(nesne(govde)?.['emir']);
  if (e === null || !tamSayi(e['surum']) || !tamSayi(e['oncelik'])) return null;
  return { surum: e['surum'], oncelik: e['oncelik'] };
}

// İki planlamacının yazacağı iki ayrı öncelik; ikisi de mevcuttan farklı. Mevcutla aynı değer sunucuda yazmasız geçer, yarış sınanmaz.
export function ikiYeniOncelik(mevcut: number, r: Rastgele): [number, number] {
  const kalan = ONCELIKLER.filter((o) => o !== mevcut);
  const birinci = r.sec(kalan);
  const ikinci = r.sec(kalan.filter((o) => o !== birinci));
  return [birinci, ikinci];
}

// GET /uretim-emirleri/:id kayıt defterinde bir olayın kaç kez geçtiği.
export function olaySayisi(govde: unknown, olay: string): number | null {
  const kayitlar = nesne(govde)?.['kayitlar'];
  if (!Array.isArray(kayitlar)) return null;
  return kayitlar.filter((k) => nesne(k)?.['olay'] === olay).length;
}

const basarili = (durum: number): boolean => durum >= 200 && durum < 300;

export type YarisSonucu = { tur: 'tek-gecti'; kazanan: 0 | 1 } | { tur: 'iki-kez' } | { tur: 'beklenmedik' };

// İki eşzamanlı yazmanın beklenen sonucu: tam biri 2xx, öbürü 409.
export function yarisSonucu(durumlar: readonly [number, number]): YarisSonucu {
  const [a, b] = durumlar;
  if (basarili(a) && basarili(b)) return { tur: 'iki-kez' };
  if (basarili(a) && b === 409) return { tur: 'tek-gecti', kazanan: 0 };
  if (a === 409 && basarili(b)) return { tur: 'tek-gecti', kazanan: 1 };
  return { tur: 'beklenmedik' };
}

const kisalt = (d: unknown): string => {
  const metin = typeof d === 'string' ? d : JSON.stringify(d) ?? String(d);
  return metin.length > 300 ? `${metin.slice(0, 300)}...` : metin;
};

export function yarisCiktisi(yol: string, cevaplar: readonly [Cevap, Cevap]): AdimCiktisi & { sonuc: 'gecti' | 'dustu' } {
  const ortak = { yontem: 'POST', yol, beklenen: '2xx + 409', gelen: `${String(cevaplar[0].durum)} + ${String(cevaplar[1].durum)}` };
  const s = yarisSonucu([cevaplar[0].durum, cevaplar[1].durum]);
  if (s.tur === 'tek-gecti') return { ...ortak, sonuc: 'gecti' };
  if (s.tur === 'iki-kez') return { ...ortak, sonuc: 'dustu', ileti: 'İki eşzamanlı yazma da geçti: kayıt iki kez yazıldı.' };
  return { ...ortak, sonuc: 'dustu', ileti: `Beklenmedik sonuç: ${kisalt(cevaplar[0].govde)} | ${kisalt(cevaplar[1].govde)}` };
}

// İki isteği aynı anda gönderir; ikisi de yazmadır, yeniden denenmez.
async function yaris(b: SenaryoBaglami, roller: readonly [Hesap, Hesap], yol: string, govdeler: readonly [unknown, unknown]): Promise<[Cevap, Cevap]> {
  const [a, c] = await Promise.all([
    b.rol(roller[0]).istek('POST', yol, govdeler[0]),
    b.rol(roller[1]).istek('POST', yol, govdeler[1]),
  ]);
  return [a, c];
}

async function planlamaYarisi(b: SenaryoBaglami): Promise<void> {
  const [p1, p2] = PLANLAMACILAR;
  const listeGovdesi = await b.bekle(p1, 'planlanacak emirleri oku', 'GET', '/api/adimli-emirler', 200);
  if (listeGovdesi === null) return;
  const emir = planlanacakEmirSec(listeGovdesi, b.rastgele);
  if (emir === null) {
    b.baglanmamis(p1, 'aynı emre eşzamanlı öncelik', 'Taslak ya da planlı emir yok; emir örnek veriyle ya da S1 (uretim) senaryosuyla gelir.');
    return;
  }
  const okuYolu = `/api/adimli-emirler/${String(emir.id)}`;
  const yazYolu = `${okuYolu}/oncelik`;
  const once = emirSurumuOku(await b.bekle(p1, 'emrin sürümünü oku', 'GET', okuYolu, 200));
  if (once === null) return;
  const [o1, o2] = ikiYeniOncelik(once.oncelik, b.rastgele);
  let kazananOncelik: number | null = null;
  const yarisGecti = await b.adim(p1, 'iki planlamacı aynı sürümle öncelik yazar', async () => {
    const cevaplar = await yaris(b, [p1, p2], yazYolu, [{ oncelik: o1, surum: once.surum }, { oncelik: o2, surum: once.surum }]);
    const s = yarisSonucu([cevaplar[0].durum, cevaplar[1].durum]);
    if (s.tur === 'tek-gecti') kazananOncelik = s.kazanan === 0 ? o1 : o2;
    return yarisCiktisi(yazYolu, cevaplar);
  });
  // Yarış düştüyse de son hâl okunur: iki kez yazmanın izi sürümde görünür.
  await b.adim(p1, 'emir tek kez yazıldı', async () => {
    const c = await b.rol(p1).istek('GET', okuYolu);
    const sonra = emirSurumuOku(c.govde);
    const beklenen = `surum ${String(once.surum + 1)}${kazananOncelik === null ? '' : `, oncelik ${String(kazananOncelik)}`}`;
    const ortak = { yontem: 'GET', yol: okuYolu, beklenen };
    if (sonra === null) return { ...ortak, sonuc: 'dustu', gelen: String(c.durum), ileti: kisalt(c.govde) };
    const gelen = `surum ${String(sonra.surum)}, oncelik ${String(sonra.oncelik)}`;
    if (sonra.surum > once.surum + 1) return { ...ortak, gelen, sonuc: 'dustu', ileti: 'Sürüm birden fazla arttı: aynı sürümle iki yazma işlendi ya da araya başka yazma girdi.' };
    if (sonra.surum !== once.surum + 1) return { ...ortak, gelen, sonuc: 'dustu', ileti: 'Sürüm artmadı: hiçbir yazma işlenmedi.' };
    if (kazananOncelik !== null && sonra.oncelik !== kazananOncelik) return { ...ortak, gelen, sonuc: 'dustu', ileti: 'Kalan öncelik 2xx alan isteğin değeri değil.' };
    return { ...ortak, gelen };
  }, { tekrarlanabilir: true });
  if (!yarisGecti) return;
  // Kaybeden ekran sayfayı yenilemeden yeniden gönderirse yine 409 almalı.
  await b.bekle(p2, 'bayat sürümle yeniden yazar', 'POST', yazYolu, 409, { oncelik: once.oncelik, surum: once.surum });
}

// Terminal komutları sürüm taşımaz; emir kilitlenir ve durum yeniden denetlenir. Aynı komut iki kez gelirse ikincisi 409 almalı.
async function terminalYarisi(b: SenaryoBaglami, ad: string, emirId: number, komut: 'duraklat' | 'devam'): Promise<boolean> {
  const okuYolu = `/api/uretim-emirleri/${String(emirId)}`;
  const yazYolu = `${okuYolu}/${komut}`;
  const once = olaySayisi(await b.bekle(OPERATOR, `${komut} öncesi defteri oku`, 'GET', okuYolu, 200), komut);
  if (once === null) return false;
  const gecti = await b.adim(OPERATOR, ad, async () => yarisCiktisi(yazYolu, await yaris(b, OPERATORLER, yazYolu, [undefined, undefined])));
  await b.adim(OPERATOR, `${komut} defterde tek satır`, async () => {
    const c = await b.rol(OPERATOR).istek('GET', okuYolu);
    const sonra = olaySayisi(c.govde, komut);
    const ortak = { yontem: 'GET', yol: okuYolu, beklenen: `${komut} ${String(once + 1)}` };
    if (sonra === null) return { ...ortak, sonuc: 'dustu', gelen: String(c.durum), ileti: kisalt(c.govde) };
    const gelen = `${komut} ${String(sonra)}`;
    if (sonra > once + 1) return { ...ortak, gelen, sonuc: 'dustu', ileti: 'Aynı komut defterde iki kez var.' };
    if (sonra !== once + 1) return { ...ortak, gelen, sonuc: 'dustu', ileti: 'Komut defterde yok.' };
    return { ...ortak, gelen };
  }, { tekrarlanabilir: true });
  return gecti;
}

async function operatorYarisi(b: SenaryoBaglami): Promise<void> {
  // Operatör emir listesini okuyamaz (terminal.uret yalnız tek emri okur); çalışan emri planlamacı bulur.
  // İki operatör de emrin istasyonunda olmalı; örnek verinin başlamış emri ikisinin ortak istasyonundadır.
  const listeGovdesi = await b.bekle(PLANLAMACILAR[0], 'çalışan emirleri oku', 'GET', '/api/uretim-emirleri?durum=basladi', 200);
  if (listeGovdesi === null) return;
  const emir = calisanEmirSec(listeGovdesi, b.rastgele);
  if (emir === null) {
    b.baglanmamis(OPERATOR, 'aynı iş emrine eşzamanlı komut', 'Başlamış emir yok; emir örnek veriyle ya da S1 (uretim) senaryosuyla gelir.');
    return;
  }
  // Emir bulunduğu hâle döner: çalışıyorsa duraklat sonra devam, duraklamış ya da durmuşsa devam sonra duraklat.
  const sira: readonly ['duraklat' | 'devam', 'duraklat' | 'devam'] = emir.calisma === 'calisiyor' ? ['duraklat', 'devam'] : ['devam', 'duraklat'];
  for (const komut of sira) {
    if (!await terminalYarisi(b, `iki operatör aynı anda ${komut}`, emir.id, komut)) return;
  }
}

export default senaryo({
  ad: 'cakisma',
  roller: [...PLANLAMACILAR, ...OPERATORLER],
  kopya: 1,
  async kos(b) {
    // İki yarış ayrı emirlerdedir; aynı anda koşar.
    await Promise.all([planlamaYarisi(b), operatorYarisi(b)]);
  },
});
