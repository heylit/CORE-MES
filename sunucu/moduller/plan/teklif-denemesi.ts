import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { TESIS_SAAT_DILIMI, tesisGunu } from '#paylasilan/zaman.ts';
import type { KaynakOkumasi } from './plan-girdisi.ts';
import { COZUM_SURESI_MS } from './plan-motoru.ts';

// Satış teklifi denemesi (Y4): planın girdisi çerçevenin koduyla kurulur (motor/girdi.betik), kalemler motorun acil sipariş olayıyla eklenir
// (motor/teklif.betik). Sayfanın motor kancaları (motor/kancalar.betik) yüklenir (458 a). Aramasız kip: aynı girdi aynı sonuç. Çözüm olay döngüsünü tutmasın diye ayrı iş parçacığında, süre sınırıyla koşar.
const MOTOR = join(dirname(fileURLToPath(import.meta.url)), 'motor');
const DOSYALAR = ['engine', 'kisitlar', 'girdi', 'durum', 'kancalar', 'teklif'] as const;

let kod: string | null = null;
function denemeKodu(): string {
  kod ??= DOSYALAR.map((m) => readFileSync(join(MOTOR, `${m}.betik`), 'utf8')).join('\n');
  return kod;
}

// adimAdetleri: adımın adedi ürün rotasının sırasıyla (dal çarpanı, 1257 a; 1527); verilmezse her adım kalem adedi.
export interface TeklifKalemi { id: string; urun: string; adet: number; adimAdetleri?: number[] }
export interface TeklifTaslagi { id: string; kalemler: Array<TeklifKalemi & { termin: string }>; yerlesim: Record<string, { m: string; S: number }> }
export interface DenemeIstegi {
  calisma: unknown;
  kayit: unknown;
  kaynak: KaynakOkumasi | null;
  bugun?: string;
  kalemler: TeklifKalemi[];
  // İstenen termin planın duvar saatiyle ('GGGG-AA-GG SS:DD'); null: plan dondurulur, kalemler arkaya eklenir.
  termin: string | null;
  // Geçerliliği süren satış taslakları (süresi dolanı çağıran vermez) ve düzenlenen taslak.
  taslaklar: TeklifTaslagi[];
  haric: string | null;
  tamponGun: number;
  // Plan şeridinin penceresi için teklifin geçerlilik günü ('GGGG-AA-GG').
  gecerlilik?: string | null;
}
export interface DenemeIslemi { id: string; adim: string; m: string; fason: boolean; S: number; C: number; ayarSaat: number; islemeSaat: number; tl: number | null }
export interface DenemeKalemi {
  id: string;
  tamam: boolean;
  bitis: number | null;
  planTerminGun: number | null;
  ulasir: boolean | null;
  malzeme: Array<{ kod: string; birim: string; miktar: number; kaynak: string; gelis: number | null }>;
  satinalma: Array<{ kod: string; birim: string; miktar: number; gelis: number; gun: number | null }>;
  islemler: DenemeIslemi[];
  malzemeTl: number | null;
  eksik: string[];
  kilit: Record<string, { m: string; S: number }>;
}
export interface DenemeSonucu {
  // Saatler planın ekseninde: başlangıç günü 00:00'dan saat (tesis duvar saati); günler başlangıç gününden sıra.
  baslangic: string;
  simdi: number;
  kalemler: DenemeKalemi[];
  kayan: Array<{ siparis: string; once: number; sonra: number; termin: number | null }>;
  taslakYeri: Record<string, { m: string; S: number }>;
  plan: DenemePlani | null;
}
// Plan şeridi; saatler yine planın ekseninde. Fason hattın kimliği '@' ile başlar.
export interface DenemePlani {
  bas: number;
  bit: number;
  kapaliGunler: string[];
  hatlar: Array<{ m: string; ad: string; fason: boolean }>;
  bloklar: Array<{ m: string; fason: boolean; tur: 'siparis' | 'satis-taslagi' | 'teklif'; is: string; kalem: number | null; adim: string; S: number; C: number; gecikir: boolean }>;
}

const ISCI = `
const { parentPort, workerData } = require('node:worker_threads');
const vm = require('node:vm');
const b = vm.createContext({ GIRDI_SAAT_DILIMI: workerData.dilim });
b.self = b;
const m = vm.runInContext(workerData.kod + '\\n;({ girdiKur, teklifDene, teklifTabani, stHazirla });', b, { filename: 'teklif-denemesi.js' });
const i = workerData.istek;
const g = m.girdiKur(i.calisma, i.kayit, i.kaynak, i.bugun);
if (!g) parentPort.postMessage(null);
else parentPort.postMessage({ baslangic: g.S.D.meta.baslangic, ...m.teklifDene(m.stHazirla(g.st), m.teklifTabani(g.S), i) });
`;

// Aynı anda tek deneme: kuyruk sırayla çalışır. Süre aşılırsa iş parçacığı durdurulur ve çağrı reddedilir. Çalışma yoksa null.
let sira: Promise<unknown> = Promise.resolve();
export function teklifDenemesi(istek: DenemeIstegi, sureMs: number = COZUM_SURESI_MS, simdi: number = Date.now()): Promise<DenemeSonucu | null> {
  const tam = { ...istek, bugun: istek.bugun ?? tesisGunu(simdi) };
  const is = sira.then(() => calistir(tam, sureMs));
  sira = is.catch(() => undefined);
  return is;
}

function calistir(istek: DenemeIstegi, sureMs: number): Promise<DenemeSonucu | null> {
  return new Promise((coz, reddet) => {
    const isci = new Worker(ISCI, { eval: true, workerData: { kod: denemeKodu(), dilim: TESIS_SAAT_DILIMI, istek } });
    let bitti = false;
    const sonlan = (f: () => void): void => { if (bitti) return; bitti = true; clearTimeout(sayac); f(); void isci.terminate(); };
    const sayac = setTimeout(() => sonlan(() => reddet(new Error(`Teklif denemesi ${String(sureMs)} ms içinde bitmedi.`))), sureMs);
    isci.once('message', (s: DenemeSonucu | null) => sonlan(() => coz(s)));
    isci.once('error', (e) => sonlan(() => reddet(e)));
    isci.once('exit', (kodu) => sonlan(() => reddet(new Error(`Teklif denemesi iş parçacığı ${String(kodu)} koduyla kapandı.`))));
  });
}
