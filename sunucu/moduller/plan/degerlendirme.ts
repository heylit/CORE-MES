import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, cokIstek, dogrulama, eskiSurum, mesgul, UygulamaHatasi } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { TESIS_SAAT_DILIMI, tesisGunu } from '#paylasilan/zaman.ts';
import type { HataKodu } from '#paylasilan/hata.ts';
import type { DegerlendirmeCevabi, DegerlendirmeDurumuCevabi, DegerlendirmeIstegi, DegerlendirmeSonucu } from '#paylasilan/sozlesme/planlama.ts';
import { BIRLESTIRME_ADRESI, ISCI_TIPLI_KAYNAK } from './girdi/birlestirme.ts';
import type { KaynakDilimiOkumasi } from './girdi/kaynaklar-kurallar.ts';
import { planGirdisi, type KaynakOkumasi } from './plan-girdisi.ts';
import { planlamaGirdisi, type PlanCozumKaynagi } from './planlama-servis.ts';
import { mesaiSaatGirdisi } from './mesai-maliyeti.ts';
import { izlemeIletisi } from './isci-iletisi.ts';

// Planlama değerlendirmesi (Soru 357 a): planlama sayfasının tarayıcıda motoru koşturan kartları burada, sayfanın motor kancaları
// (motor/kancalar.js) ve kart hesaplarıyla (motor/degerlendir.js) koşar. Girdi planlama çalışması ucunun birleştirdiğidir (288 a);
// bağlam her çağrıda yenidir ve hiçbir şey yazılmaz. Çözüm olay döngüsünü tutmasın diye ayrı iş parçacığında, süre sınırıyla koşar.
// Arama sayfanınkidir (457 1-3 b); bütçesi betikte sabit adımlı saatle sayılır, gerçek süreyi buradaki sınır keser.
const MOTOR = join(dirname(fileURLToPath(import.meta.url)), 'motor');
export const DEGERLENDIRME_DOSYALARI = ['engine', 'kisitlar', 'girdi', 'durum', 'kancalar', 'degerlendir'] as const;

let kod: string | null = null;
export function degerlendirmeKodu(): string {
  kod ??= `${DEGERLENDIRME_DOSYALARI.map((m) => readFileSync(join(MOTOR, `${m}.js`), 'utf8')).join('\n')}\n;({ degerlendir });`;
  return kod;
}

// kaynakDilimi: 1720, bayrak (plan.tipli-girdi) açıksa kaynak alanlarını tipli dilim kurar (girdi/birlestirme.ts).
export interface DegerlendirmeGirdisi {
  calisma: unknown; kayit: unknown; kaynak: KaynakOkumasi | null; bugun?: string; istek: DegerlendirmeIstegi; sira?: number; kaynakDilimi?: KaynakDilimiOkumasi | null;
}
// Betiğin dönüşü: çalışma yoksa null, isteğin çalışmayla uyuşmadığı durum hata kodu, aksi halde cevabın zarfı (sonuç sözleşmenin biçimindedir).
export type DegerlendirmeHatasi = 'plan-yok' | 'plan-bayat' | 'siparis-yok' | 'adet' | 'basladi';
export interface DegerlendirmeZarfi { dataVer: number; baslangic: string | null; simdi: number; sonuc: Record<string, unknown> & { tur: DegerlendirmeIstegi['tur'] } }
export type DegerlendirmeDonusu = { hata: DegerlendirmeHatasi } | DegerlendirmeZarfi | null;

// `self`: sayfanın kancaları bir kez kurulduklarını iş parçacığının genel nesnesinde işaretler.
const ISCI = `
const { parentPort, workerData } = require('node:worker_threads');
const vm = require('node:vm');
${ISCI_TIPLI_KAYNAK}
(async () => {
  const b = vm.createContext({ GIRDI_SAAT_DILIMI: workerData.dilim });
  b.self = b;
  const m = vm.runInContext(workerData.kod, b, { filename: 'planlama-degerlendirmesi.js' });
  const i = workerData.girdi;
  await tipliKaynakBagla(b, i.kaynakDilimi, workerData.birlestirmeAdresi);
  parentPort.postMessage(m.degerlendir(i.calisma, i.kayit, i.kaynak, i.bugun, workerData.simdi, i.sira == null ? i.istek : { ...i.istek, sira: i.sira }));
})();
`;

// Hesap uç transaction'ının dışında koşar (463 a); süre kuyruğa girişten sayılır.
export const DEGERLENDIRME_SURESI_MS = 60_000;
export const MESGUL = 'Planlama değerlendirmesi şu an meşgul; biraz sonra yeniden deneyin.';

// Aynı anda tek değerlendirme: kuyruk sırayla çalışır. Süre kuyruğa girişten sayılır; sırası gelene kalan süre yoksa çağrı koşmadan,
// süre aşılırsa iş parçacığı durdurularak reddedilir.
let sira: Promise<unknown> = Promise.resolve();
export function degerlendirmeYap(girdi: DegerlendirmeGirdisi, simdi: number = Date.now(), sureMs: number = DEGERLENDIRME_SURESI_MS): Promise<DegerlendirmeDonusu> {
  const tam = { ...girdi, bugun: girdi.bugun ?? tesisGunu(simdi) };
  const son = Date.now() + sureMs;
  const is = sira.then(() => { const kalan = son - Date.now(); return kalan > 0 ? kosustur(tam, simdi, kalan) : Promise.reject(mesgul(MESGUL)); });
  sira = is.catch(() => undefined);
  return is;
}

// Plan seçeneklerinin denge konumları (en çok dört) birbirinden bağımsızdır: her biri kendi iş parçacığında aynı girdiyle kurulur, sonuç sırayla
// birleşir. Saat her iş parçacığında sabit adımlı olduğu için sonuç tek iş parçacığındakiyle aynıdır; süre en uzun konum kadardır.
const SECENEK_EN_COK = 4;
async function kosustur(girdi: DegerlendirmeGirdisi, simdi: number, sureMs: number): Promise<DegerlendirmeDonusu> {
  if (girdi.istek.tur !== 'plan-secenekleri') return calistir(girdi, simdi, sureMs);
  const parcalar = await Promise.all(Array.from({ length: SECENEK_EN_COK }, (_, i) => calistir({ ...girdi, istek: girdi.istek, sira: i }, simdi, sureMs)));
  const ilk = parcalar[0] ?? null;
  if (ilk === null || 'hata' in ilk) return ilk;
  const secenekler = parcalar.flatMap((p) => (p !== null && !('hata' in p) ? (p.sonuc['secenekler'] as unknown[]) : []));
  return { ...ilk, sonuc: { ...ilk.sonuc, secenekler } };
}

function calistir(girdi: DegerlendirmeGirdisi, simdi: number, sureMs: number): Promise<DegerlendirmeDonusu> {
  const son = Date.now() + sureMs;
  return new Promise((coz, reddet) => {
    const isci = new Worker(ISCI, { eval: true, workerData: { kod: degerlendirmeKodu(), dilim: TESIS_SAAT_DILIMI, simdi, girdi, birlestirmeAdresi: BIRLESTIRME_ADRESI } });
    let bitti = false;
    const sonlan = (f: () => void): void => { if (bitti) return; bitti = true; clearTimeout(sayac); f(); void isci.terminate(); };
    const sayac = setTimeout(() => sonlan(() => reddet(mesgul(`Planlama değerlendirmesi ${String(sureMs)} ms içinde bitmedi; daha az seçenekle ya da biraz sonra yeniden deneyin.`))), sureMs);
    isci.on('message', (s: DegerlendirmeDonusu) => { if (!izlemeIletisi(s)) sonlan(() => coz(s)); });
    // 1720: tipli dilimle iş parçacığı hata verirse aynı girdi eski yolla, kalan sürede yeniden koşar (bayrak kapalıymış gibi).
    isci.once('error', (e) => sonlan(() => {
      if (girdi.kaynakDilimi) calistir({ ...girdi, kaynakDilimi: null }, simdi, Math.max(1, son - Date.now())).then(coz, reddet);
      else reddet(e);
    }));
    isci.once('exit', (kodu) => sonlan(() => reddet(new Error(`Planlama değerlendirmesi iş parçacığı ${String(kodu)} koduyla kapandı.`))));
  });
}

const MALIYET_ISLEMI = 'finans.maliyet-oku';
const FIYAT_ISLEMI = 'siparisler.fiyat-oku';
const CALISMA_YOK = 'Planlama çalışması yok; planlama sayfasını açıp bir kez kaydedin.';
const HATALAR: Record<DegerlendirmeHatasi, () => Error> = {
  'plan-yok': () => cakisma('Önce plan kurulmalı.'),
  'plan-bayat': () => cakisma('Plan verinin gerisinde; önce bekleyen değişiklikleri uygulayın.'),
  'siparis-yok': () => bulunamadi('Sipariş planlama çalışmasında yok.'),
  adet: () => dogrulama('Partilerin toplamı iş emrinin adedi olmalı, her parti en az 1 adet.', 'adetler'),
  basladi: () => dogrulama('Başlamış ya da plana girmemiş iş emri bölünmez.', 'siparisId'),
};

// Okunmayan sonuç bu süreden sonra silinir; ekran sonucu saniyeler içinde okur.
export const SONUC_OMRU_MS = 5 * 60_000;
type Is =
  | { kisi: number; durum: 'suruyor' }
  | { kisi: number; durum: 'bitti'; cevap: DegerlendirmeCevabi; bitis: number }
  | { kisi: number; durum: 'hata'; kod: HataKodu; mesaj: string; bitis: number };
const isler = new Map<string, Is>();
function temizle(simdi: number): void {
  for (const [k, i] of isler) if (i.durum !== 'suruyor' && simdi - i.bitis > SONUC_OMRU_MS) isler.delete(k);
}

// Başlatma (463 a). Akış: oturum ve plan.planlama-oku uçta; burada maliyet görüşü, kişi başına tek iş, girdi ve sürüm. Girdi uç
// transaction'ında okunur; hesap iş parçacığında koşar, sonuç bellekte kısa süre tutulur. Kayıt yazılmaz.
export async function degerlendirmeBaslat(
  db: Db, kullanici: Kullanici, g: { surum: number; istek: DegerlendirmeIstegi }, simdi: number = Date.now(), yap: typeof degerlendirmeYap = degerlendirmeYap,
): Promise<{ is: string }> {
  const maliyetGorunur = islemVarMi(kullanici, MALIYET_ISLEMI);
  const fiyatGorunur = islemVarMi(kullanici, FIYAT_ISLEMI);
  temizle(simdi);
  if ([...isler.values()].some((i) => i.durum === 'suruyor' && i.kisi === kullanici.id)) throw cokIstek('Önceki planlama değerlendirmeniz sürüyor; bitince yeniden deneyin.');
  // İş, girdi okunmadan yer tutar: aynı kişinin eşzamanlı ikinci başlatması okuma sürerken de reddedilir.
  const is = randomUUID();
  const kisi = kullanici.id;
  isler.set(is, { kisi, durum: 'suruyor' });
  let k: Awaited<ReturnType<typeof planlamaGirdisi>>;
  try {
    k = await planlamaGirdisi(db, kullanici);
    if (k.girdi === null || k.surum === null) throw cakisma(CALISMA_YOK);
    if (k.surum !== g.surum) throw eskiSurum();
  } catch (e) { isler.delete(is); throw e; }
  const surum = k.surum;
  const karGizli = genelGiderGizliMi(k.girdi.calisma);
  // Güvenlik K3 (2760 b): ek mesai seçenekleri her rolde aynı İK değeriyle seçilir, görmeyenin TL'si null döner. Öteki türlerde görmeyen
  // yalın kalır: sonuçları kâr farkına göre sıralanabilir (termin uzatma) ve değer sıra yoluyla taşınmasın.
  let girdi = k.girdi;
  try {
    if (maliyetGorunur || g.istek.tur === 'plan-secenekleri') girdi = await mesaiSaatliGirdi(db, girdi, simdi);
  } catch (e) { isler.delete(is); throw e; }
  yap({ ...girdi, bugun: tesisGunu(simdi), istek: g.istek }, simdi).then((r) => {
    if (r === null) throw cakisma(CALISMA_YOK);
    if ('hata' in r) throw HATALAR[r.hata]();
    const sonuc = r.sonuc as DegerlendirmeSonucu;
    const gorunen = !maliyetGorunur ? maliyetsiz(sonuc) : !fiyatGorunur ? fiyatsiz(sonuc) : karGizli ? karsiz(sonuc) : sonuc;
    const cevap = { calismaSurumu: surum, dataVer: r.dataVer, baslangic: r.baslangic, simdi: r.simdi, maliyetGorunur, sonuc: gorunen };
    isler.set(is, { kisi, durum: 'bitti', cevap, bitis: Date.now() });
  }).catch((e: unknown) => {
    // Beklenmeyen hata (iş parçacığı çöktü) iç ayrıntı taşımaz.
    const h = e instanceof UygulamaHatasi ? { kod: e.kod, mesaj: e.message } : { kod: 'SUNUCU' as const, mesaj: 'Planlama değerlendirmesi hesaplanamadı.' };
    isler.set(is, { kisi, durum: 'hata', ...h, bitis: Date.now() });
  });
  return { is };
}

// Değer birleşmiş çalışmanın tezgâhlarıyla kurulur ve iş parçacığının girdisindeki D.mesaiSaat'e yazılır (birleşme D'nin bilinmeyen alanını
// korur, girdi.js tmiCevir). Okunan çalışma kopyalanır; kayıt ve cevap D taşımaz.
async function mesaiSaatliGirdi(db: Db, girdi: PlanCozumKaynagi, simdi: number): Promise<PlanCozumKaynagi> {
  const c = girdi.calisma as { D?: unknown } | null;
  if (c === null || typeof c !== 'object' || c.D === null || typeof c.D !== 'object') return girdi;
  const D = planGirdisi({ ...girdi, bugun: tesisGunu(simdi) }, simdi)?.S.D ?? c.D;
  const mesaiSaat = await mesaiSaatGirdisi(db, D, new Date(simdi));
  return { ...girdi, calisma: { ...c, D: { ...c.D, mesaiSaat } } };
}

// Sonucu yalnız başlatan kişi okur; başkasının kimliği yokmuş gibi döner. Biten sonuç okununca silinir.
export function degerlendirmeDurumu(kisi: number, is: string, simdi: number = Date.now()): DegerlendirmeDurumuCevabi {
  temizle(simdi);
  const i = isler.get(is);
  if (i === undefined || i.kisi !== kisi) throw bulunamadi('Planlama değerlendirmesi bulunamadı; yeniden başlatın.');
  if (i.durum === 'suruyor') return { durum: 'suruyor' };
  isler.delete(is);
  return i.durum === 'bitti' ? { durum: 'bitti', cevap: i.cevap } : { durum: 'hata', kod: i.kod, mesaj: i.mesaj };
}

// Testler için: bellekteki işleri boşaltır.
export function degerlendirmeIsleriSifirla(): void { isler.clear(); }

// 2677 b: genel gider oranının gizli olduğu ayda (2668 a) plan genel gideri 0 alır; kâr bu yüzden olduğundan yüksek çıkar ve maliyeti
// görene de gitmez. Tutar, ek mesai ve gecikme bedelleri genel giderden bağımsızdır, kalır.
export function genelGiderGizliMi(calisma: unknown): boolean {
  const planTL = (calisma as { D?: { planTL?: unknown } } | null)?.D?.planTL;
  return planTL !== null && typeof planTL === 'object' && (planTL as { genelGiderGizli?: unknown }).genelGiderGizli === true;
}
export function karsiz(s: DegerlendirmeSonucu): DegerlendirmeSonucu {
  switch (s.tur) {
    case 'plan-secenekleri':
      return { ...s, secenekler: s.secenekler.map((x) => ({ ...x, netKar: null })) };
    case 'termin-secenekleri':
      return { ...s, satirlar: s.satirlar.map((x) => ({ ...x, netKar: null, digerKarFarki: null, toplamKar: null })) };
    case 'termin-uzatma':
      return { ...s, satirlar: s.satirlar.map((x) => ({ ...x, netKarFarki: null })) };
    case 'malzeme-one-cekme':
    case 'parti-bolme':
    case 'malzeme-terminleri':
    case 'plan-kur':
    case 'plan-uygula':
    case 'plan-iyilestir':
    case 'one-al':
    case 'sira-degistir':
      return s;
  }
}

// 2918: sipariş fiyatı yalnız siparisler.fiyat-oku ile okunur (siparisler 180); maliyeti görüp fiyatı görmeyene fiyat ve ondan türeyen kâr
// gitmez. Termin seçeneklerinin tutarı siparişin gelirinin kendisidir (motor/degerlendir.js). TL alanları maliyettir, kalır.
export function fiyatsiz(s: DegerlendirmeSonucu): DegerlendirmeSonucu {
  const k = karsiz(s);
  return k.tur === 'termin-secenekleri' ? { ...k, satirlar: k.satirlar.map((x) => ({ ...x, tutar: null })) } : k;
}

// Seçeneğin planı İK değeriyle seçilmiş ek mesaiyle kurulur (2760 b); planın TL toplamı (ozet.tl) görmeyene gitmez (Güvenlik C6).
function tlsizPlan(plan: Record<string, unknown>): Record<string, unknown> {
  const ozet = plan['ozet'];
  return ozet !== null && typeof ozet === 'object' ? { ...plan, ozet: { ...(ozet as Record<string, unknown>), tl: null } } : plan;
}

// 180 a, 200 a: tutar, maliyet, kâr ve TL farkı yalnız maliyeti görene. Saat, adet ve plan kaydı kalır (plan kaydı çalışmaya geri yazılır,
// biçimi bozulmaz). Sipariş maliyeti ve kârı bu durumda hiç hesaplanmaz.
export function maliyetsiz(s: DegerlendirmeSonucu): DegerlendirmeSonucu {
  switch (s.tur) {
    case 'plan-secenekleri':
      return { ...s, secenekler: s.secenekler.map((x) => ({ ...x, ekMesaiTl: null, netKar: null, ekMesai: x.ekMesai.map((e) => ({ ...e, tl: null })), plan: tlsizPlan(x.plan) })) };
    case 'termin-secenekleri':
      return { ...s, satirlar: s.satirlar.map((x) => ({ ...x, tutar: null, netKar: null, digerKarFarki: null, toplamKar: null })) };
    case 'termin-uzatma':
      return { ...s, satirlar: s.satirlar.map((x) => ({ ...x, netKarFarki: null })) };
    case 'malzeme-one-cekme':
      return { ...s, taban: { ...s.taban, tl: null }, satirlar: s.satirlar.map((x) => ({ ...x, kazanc: x.kazanc.map((z) => ({ ...z, tl: null })) })) };
    case 'parti-bolme':
      return s.sonuc === null ? s : { ...s, sonuc: { ...s.sonuc, tl: null } };
    case 'malzeme-terminleri':
    case 'plan-kur':
    case 'plan-uygula':
    case 'plan-iyilestir':
    case 'one-al':
    case 'sira-degistir':
      return s;
  }
}
