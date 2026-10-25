import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { bulunamadi, cakisma } from '#cekirdek/hata.ts';
import type { YillikCozDurumuCevabi, YillikCozGovdesi, YillikCozumu } from '#paylasilan/sozlesme/recete-rota.ts';

// Yıllık planın HiGHS çözücüsü (454/6 a): planlama sayfasının kurduğu kaba kapasite modelini (LP metni) çözer. Plan motoru değildir:
// kayıt okumaz, yazmaz, plana dokunmaz. Paket (highs, kök package.json) ayrı iş parçacığında yüklenir; çözüm olay döngüsünü tutmaz.
// Uç transaction'ı 60 saniyelik çözümü bekleyemez (bekleyen işlem sınırı): başlatma kimlik döner, sonuç bellekte kısa süre tutulur.
const HIGHS = createRequire(import.meta.url).resolve('highs');

// Kişi başına aynı anda tek çözüm; bütün sunucuda en çok iki (çözücü işlemciyi tam kullanır).
export const ESZAMANLI_AZAMI = 2;
// Paketin yüklenmesi ve iş parçacığının kapanması için HiGHS'in kendi zaman sınırının üstüne pay.
const PAY_MS = 15_000;
// Okunmayan sonuç bu süreden sonra silinir; sayfa sonucu saniyeler içinde okur.
export const SONUC_OMRU_MS = 5 * 60_000;

const ISCI = `
const { parentPort, workerData } = require('node:worker_threads');
const sonlu = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
require(workerData.highs)().then((H) => {
  const { lp, sure, want } = workerData.istek;
  const md = H.createModel({ format: 'lp', data: lp });
  try {
    md.options.set({ output_flag: false, time_limit: sure, mip_rel_gap: 0 });
    md.run();
    const so = md.getSolution(); const val = {}; const dual = {};
    for (const ad of want) {
      let i = -1;
      try { i = md.getColByName(ad); } catch { i = -1; }
      const v = i >= 0 ? sonlu(so.colValue[i]) : null;
      if (v !== null) val[ad] = v;
      dual[ad] = i >= 0 && so.colDual ? sonlu(so.colDual[i]) : null;
    }
    parentPort.postMessage({ cozum: { s: md.getModelStatus(), ob: sonlu(md.getObjectiveValue()), val, dual } });
  } finally { md.dispose(); }
}).catch((e) => { parentPort.postMessage({ hata: String((e && e.message) || e) }); });
`;

type Is =
  | { kisi: number; durum: 'suruyor' }
  | { kisi: number; durum: 'bitti'; cozum: YillikCozumu; bitis: number }
  | { kisi: number; durum: 'hata'; mesaj: string; bitis: number };
const isler = new Map<string, Is>();

function temizle(simdi: number): void {
  for (const [k, i] of isler) if (i.durum !== 'suruyor' && simdi - i.bitis > SONUC_OMRU_MS) isler.delete(k);
}

// Tek modeli iş parçacığında çözer. Süre aşılırsa iş parçacığı durdurulur.
export function modelCoz(istek: YillikCozGovdesi, sureMs: number = istek.sure * 1000 + PAY_MS): Promise<YillikCozumu> {
  return new Promise((coz, reddet) => {
    const isci = new Worker(ISCI, { eval: true, workerData: { highs: HIGHS, istek } });
    let bitti = false;
    const sonlan = (f: () => void): void => { if (bitti) return; bitti = true; clearTimeout(sayac); f(); void isci.terminate(); };
    const sayac = setTimeout(() => sonlan(() => reddet(new Error(`Yıllık plan ${String(Math.round(sureMs / 1000))} saniyede çözülemedi.`))), sureMs);
    isci.once('message', (m: { cozum?: YillikCozumu; hata?: string }) => sonlan(() => {
      if (m.cozum) coz(m.cozum); else reddet(new Error(`HiGHS modeli çözemedi: ${m.hata ?? 'bilinmeyen hata'}`));
    }));
    isci.once('error', (e) => sonlan(() => reddet(e)));
    isci.once('exit', (kodu) => sonlan(() => reddet(new Error(`Yıllık plan çözücüsü ${String(kodu)} koduyla kapandı.`))));
  });
}

// Çözümü başlatır ve hemen döner. Akış: oturum ve recete-rota.planlama-oku uçta; burada eşzamanlılık sınırı.
export function yillikCozBaslat(kisi: number, istek: YillikCozGovdesi, simdi: number = Date.now(), coz: typeof modelCoz = modelCoz): { is: string } {
  temizle(simdi);
  const suren = [...isler.values()].filter((i) => i.durum === 'suruyor');
  if (suren.some((i) => i.kisi === kisi)) throw cakisma('Önceki yıllık plan çözümünüz sürüyor; bitince yeniden deneyin.');
  if (suren.length >= ESZAMANLI_AZAMI) throw cakisma('Yıllık plan çözücüsü şu an dolu; biraz sonra yeniden deneyin.');
  const is = randomUUID();
  isler.set(is, { kisi, durum: 'suruyor' });
  coz(istek).then(
    (cozum) => { isler.set(is, { kisi, durum: 'bitti', cozum, bitis: Date.now() }); },
    (e: unknown) => { isler.set(is, { kisi, durum: 'hata', mesaj: e instanceof Error ? e.message : String(e), bitis: Date.now() }); },
  );
  return { is };
}

// Sonucu yalnız başlatan kişi okur; başkasının kimliği yokmuş gibi döner. Biten sonuç okununca silinir.
export function yillikCozDurumu(kisi: number, is: string, simdi: number = Date.now()): YillikCozDurumuCevabi {
  temizle(simdi);
  const i = isler.get(is);
  if (i === undefined || i.kisi !== kisi) throw bulunamadi('Yıllık plan çözümü bulunamadı; yeniden çözün.');
  if (i.durum === 'suruyor') return { durum: 'suruyor' };
  isler.delete(is);
  return i.durum === 'bitti' ? { durum: 'bitti', cozum: i.cozum } : { durum: 'hata', mesaj: i.mesaj };
}

// Testler için: bellekteki işleri boşaltır.
export function yillikIsleriSifirla(): void { isler.clear(); }
