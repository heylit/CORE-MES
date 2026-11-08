// Görüntü sürecini yalnız bu dosya yönetir (ADR 0032; geometri/surec.ts ile aynı kalıp): ilk işte fork eder, sırayla tek iş verir,
// süre sınırında ya da bellek eşiğinde öldürür; ölen süreç sonraki işte yeniden açılır. IPC 'advanced': baytlar metne çevrilmez.
import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import type { RenkAyari } from '#paylasilan/pdf-renk.ts';
import { ILETILER, IS_SURE_SINIRI_MS, SUREC_BELLEK_ESIGI_BAYT } from './kurallar.ts';

export interface GoruntuIstegi { kimlik: number; veri: Uint8Array; sayfa: number; res: number; isler: { imza: string; ayar: RenkAyari }[] }
export interface HazirGoruntu { imza: string; genislik: number; yukseklik: number; png: Uint8Array }
export type GoruntuYaniti =
  | { tamam: true; goruntuler: HazirGoruntu[]; sureMs: number; bellek: number }
  | { tamam: false; kalici: boolean; hata: string; bellek?: number };

const GIRIS = fileURLToPath(new URL('./goruntu-sureci.ts', import.meta.url));

// Ana sürecin ortamı (veritabanı parolası dahil TMIV2_*) güvenilmeyen PDF'i okuyan sürece geçmez (ADR 0024 karar 2 kalıbı).
const GECEN_DEGISKENLER = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'TMPDIR'] as const;
export function goruntuOrtami(ortam: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const sonuc: NodeJS.ProcessEnv = {};
  for (const ad of GECEN_DEGISKENLER) {
    const deger = ortam[ad];
    if (deger !== undefined) sonuc[ad] = deger;
  }
  return sonuc;
}

export interface GoruntuSureci {
  hazirla(g: Omit<GoruntuIstegi, 'kimlik'>): Promise<GoruntuYaniti>;
  kapat(): void;
  durum(): { acik: boolean; acilis: number };
}

export function goruntuSureciKur(s: { sureMs?: number; bellekEsigi?: number; giris?: string } = {}): GoruntuSureci {
  const sureMs = s.sureMs ?? IS_SURE_SINIRI_MS;
  const bellekEsigi = s.bellekEsigi ?? SUREC_BELLEK_ESIGI_BAYT;
  let cocuk: ChildProcess | null = null;
  let acilis = 0;
  let sira = 0;
  let zincir: Promise<unknown> = Promise.resolve();

  const ac = (): ChildProcess => {
    if (cocuk !== null && cocuk.exitCode === null && cocuk.signalCode === null && cocuk.connected) return cocuk;
    const yeni = fork(s.giris ?? GIRIS, [], {
      serialization: 'advanced', execArgv: [], env: goruntuOrtami(process.env), stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
    });
    yeni.stderr?.resume();
    yeni.unref();
    yeni.channel?.unref();
    yeni.once('exit', () => { if (cocuk === yeni) cocuk = null; });
    acilis++;
    cocuk = yeni;
    return yeni;
  };

  const oldur = (c: ChildProcess): void => {
    if (cocuk === c) cocuk = null;
    c.kill('SIGKILL');
  };

  const tekIs = (g: Omit<GoruntuIstegi, 'kimlik'>): Promise<GoruntuYaniti> => new Promise((coz) => {
    const c = ac();
    const kimlik = ++sira;
    c.channel?.ref();
    let bitti = false;
    const bitir = (y: GoruntuYaniti): void => {
      if (bitti) return;
      bitti = true;
      clearTimeout(saat);
      c.off('message', mesaj);
      c.off('exit', cikis);
      c.channel?.unref();
      coz(y);
    };
    const mesaj = (m: GoruntuYaniti & { kimlik: number }): void => {
      if (m.kimlik !== kimlik) return;
      if (m.bellek !== undefined && m.bellek > bellekEsigi) oldur(c);
      const { kimlik: _k, ...yanit } = m;
      bitir(yanit);
    };
    const cikis = (): void => bitir({ tamam: false, kalici: false, hata: ILETILER.surecDustu });
    const saat = setTimeout(() => { oldur(c); bitir({ tamam: false, kalici: false, hata: ILETILER.sureAsimi }); }, sureMs);
    c.on('message', mesaj);
    c.once('exit', cikis);
    c.send({ ...g, kimlik } satisfies GoruntuIstegi, (hata) => { if (hata) { oldur(c); bitir({ tamam: false, kalici: false, hata: ILETILER.surecDustu }); } });
  });

  return {
    hazirla(g) {
      const is = zincir.then(() => tekIs(g));
      zincir = is.catch(() => undefined);
      return is;
    },
    kapat() { if (cocuk !== null) oldur(cocuk); },
    durum: () => ({ acik: cocuk !== null, acilis }),
  };
}

let paylasilan: GoruntuSureci | null = null;
export function goruntuSureci(): GoruntuSureci {
  paylasilan ??= goruntuSureciKur();
  return paylasilan;
}
