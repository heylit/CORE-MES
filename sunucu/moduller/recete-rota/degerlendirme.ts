import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { Db } from '#cekirdek/db.ts';
import { bulunamadi, cakisma, dogrulama, eskiSurum, yetkiYok } from '#cekirdek/hata.ts';
import { islemVarMi } from '#cekirdek/yetki.ts';
import type { Kullanici } from '#cekirdek/yetki.ts';
import { TESIS_SAAT_DILIMI, tesisGunu } from '#paylasilan/zaman.ts';
import type { DegerlendirmeCevabi, DegerlendirmeIstegi, DegerlendirmeSonucu } from '#paylasilan/sozlesme/recete-rota.ts';
import type { KaynakOkumasi } from './plan-girdisi.ts';
import { COZUM_SURESI_MS } from './plan-motoru.ts';
import { planlamaGirdisi } from './servis.ts';

// Planlama değerlendirmesi (Soru 357 a): planlama sayfasının tarayıcıda motoru koşturan kartları burada, sayfanın motor kancaları
// (motor/kancalar.betik) ve kart hesaplarıyla (motor/degerlendir.betik) koşar. Girdi planlama çalışması ucunun birleştirdiğidir (288 a);
// bağlam her çağrıda yenidir ve hiçbir şey yazılmaz. Çözüm olay döngüsünü tutmasın diye ayrı iş parçacığında, süre sınırıyla koşar.
const MOTOR = join(dirname(fileURLToPath(import.meta.url)), 'motor');
export const DEGERLENDIRME_DOSYALARI = ['engine', 'kisitlar', 'girdi', 'durum', 'kancalar', 'degerlendir'] as const;

let kod: string | null = null;
function degerlendirmeKodu(): string {
  kod ??= `${DEGERLENDIRME_DOSYALARI.map((m) => readFileSync(join(MOTOR, `${m}.betik`), 'utf8')).join('\n')}\n;({ degerlendir });`;
  return kod;
}

export interface DegerlendirmeGirdisi { calisma: unknown; kayit: unknown; kaynak: KaynakOkumasi | null; bugun?: string; istek: DegerlendirmeIstegi }
// Betiğin dönüşü: çalışma yoksa null, isteğin çalışmayla uyuşmadığı durum hata kodu, aksi halde cevabın zarfı (sonuç sözleşmenin biçimindedir).
export type DegerlendirmeHatasi = 'plan-yok' | 'siparis-yok' | 'adet' | 'basladi';
export interface DegerlendirmeZarfi { dataVer: number; baslangic: string | null; simdi: number; sonuc: Record<string, unknown> & { tur: DegerlendirmeIstegi['tur'] } }
export type DegerlendirmeDonusu = { hata: DegerlendirmeHatasi } | DegerlendirmeZarfi | null;

// `self`: sayfanın kancaları bir kez kurulduklarını iş parçacığının genel nesnesinde işaretler.
const ISCI = `
const { parentPort, workerData } = require('node:worker_threads');
const vm = require('node:vm');
const b = vm.createContext({ GIRDI_SAAT_DILIMI: workerData.dilim });
b.self = b;
const m = vm.runInContext(workerData.kod, b, { filename: 'planlama-degerlendirmesi.js' });
const i = workerData.girdi;
parentPort.postMessage(m.degerlendir(i.calisma, i.kayit, i.kaynak, i.bugun, workerData.simdi, i.istek));
`;

// Aynı anda tek değerlendirme: kuyruk sırayla çalışır. Süre aşılırsa iş parçacığı durdurulur ve çağrı reddedilir.
let sira: Promise<unknown> = Promise.resolve();
export function degerlendirmeYap(girdi: DegerlendirmeGirdisi, simdi: number = Date.now(), sureMs: number = COZUM_SURESI_MS): Promise<DegerlendirmeDonusu> {
  const tam = { ...girdi, bugun: girdi.bugun ?? tesisGunu(simdi) };
  const is = sira.then(() => calistir(tam, simdi, sureMs));
  sira = is.catch(() => undefined);
  return is;
}

function calistir(girdi: DegerlendirmeGirdisi, simdi: number, sureMs: number): Promise<DegerlendirmeDonusu> {
  return new Promise((coz, reddet) => {
    const isci = new Worker(ISCI, { eval: true, workerData: { kod: degerlendirmeKodu(), dilim: TESIS_SAAT_DILIMI, simdi, girdi } });
    let bitti = false;
    const sonlan = (f: () => void): void => { if (bitti) return; bitti = true; clearTimeout(sayac); f(); void isci.terminate(); };
    const sayac = setTimeout(() => sonlan(() => reddet(new Error(`Planlama değerlendirmesi ${String(sureMs)} ms içinde bitmedi.`))), sureMs);
    isci.once('message', (s: DegerlendirmeDonusu) => sonlan(() => coz(s)));
    isci.once('error', (e) => sonlan(() => reddet(e)));
    isci.once('exit', (kodu) => sonlan(() => reddet(new Error(`Planlama değerlendirmesi iş parçacığı ${String(kodu)} koduyla kapandı.`))));
  });
}

const MALIYET_ISLEMI = 'finans.maliyet-oku';
const CALISMA_YOK = 'Planlama çalışması yok; planlama sayfasını açıp bir kez kaydedin.';
const HATALAR: Record<DegerlendirmeHatasi, () => Error> = {
  'plan-yok': () => cakisma('Önce plan kurulmalı.'),
  'siparis-yok': () => bulunamadi('Sipariş planlama çalışmasında yok.'),
  adet: () => dogrulama('Partilerin toplamı iş emrinin adedi olmalı, her parti en az 1 adet.', 'adetler'),
  basladi: () => dogrulama('Başlamış ya da plana girmemiş iş emri bölünmez.', 'siparisId'),
};

// Akış: oturum ve recete-rota.planlama-oku uçta; burada sürüm ve maliyet görüşü. Kayıt yazılmaz (uç GET, salt okunur transaction).
export async function planlamaDegerlendirmesi(
  db: Db, kullanici: Kullanici, g: { surum: number; istek: DegerlendirmeIstegi }, simdi: number = Date.now(),
): Promise<DegerlendirmeCevabi> {
  const maliyetGorunur = islemVarMi(kullanici, MALIYET_ISLEMI);
  if (g.istek.tur === 'siparis-kari' && !maliyetGorunur) throw yetkiYok('Sipariş maliyeti ve kârı yalnız maliyeti görene açıktır.');
  const k = await planlamaGirdisi(db, kullanici);
  if (k.girdi === null || k.surum === null) throw cakisma(CALISMA_YOK);
  if (k.surum !== g.surum) throw eskiSurum();
  const r = await degerlendirmeYap({ ...k.girdi, bugun: tesisGunu(simdi), istek: g.istek }, simdi);
  if (r === null) throw cakisma(CALISMA_YOK);
  if ('hata' in r) throw HATALAR[r.hata]();
  const sonuc = r.sonuc as DegerlendirmeSonucu;
  return { calismaSurumu: k.surum, dataVer: r.dataVer, baslangic: r.baslangic, simdi: r.simdi, maliyetGorunur, sonuc: maliyetGorunur ? sonuc : maliyetsiz(sonuc) };
}

// 180 a, 200 a: tutar, maliyet, kâr ve TL farkı yalnız maliyeti görene. Saat, adet ve plan kaydı kalır (plan kaydı çalışmaya geri yazılır,
// biçimi bozulmaz). Sipariş maliyeti ve kârı bu durumda hiç hesaplanmaz.
export function maliyetsiz(s: DegerlendirmeSonucu): DegerlendirmeSonucu {
  switch (s.tur) {
    case 'plan-secenekleri':
      return { ...s, secenekler: s.secenekler.map((x) => ({ ...x, ekMesaiTl: null, netKar: null, ekMesai: x.ekMesai.map((e) => ({ ...e, tl: null })) })) };
    case 'termin-secenekleri':
      return { ...s, satirlar: s.satirlar.map((x) => ({ ...x, tutar: null, netKar: null, digerKarFarki: null, toplamKar: null })) };
    case 'termin-uzatma':
      return { ...s, satirlar: s.satirlar.map((x) => ({ ...x, netKarFarki: null })) };
    case 'malzeme-one-cekme':
      return { ...s, taban: { ...s.taban, tl: null }, satirlar: s.satirlar.map((x) => ({ ...x, kazanc: x.kazanc.map((z) => ({ ...z, tl: null })) })) };
    case 'parti-bolme':
      return s.sonuc === null ? s : { ...s, sonuc: { ...s.sonuc, tl: null } };
    case 'malzeme-terminleri':
      return s;
    case 'siparis-kari':
      throw yetkiYok('Sipariş maliyeti ve kârı yalnız maliyeti görene açıktır.');
  }
}
