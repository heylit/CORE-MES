// Hesap sürecini yalnız bu dosya yönetir (1427 a): ilk işte fork eder, sırayla tek iş verir, süre sınırında ya da bellek eşiğinde öldürür;
// ölen süreç sonraki işte yeniden açılır. IPC 'advanced' biçimdedir: dosya baytları metne çevrilmeden geçer. Port açılmaz.
import { fork } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ILETILER, IS_SURE_SINIRI_MS, SUREC_BELLEK_ESIGI_BAYT } from './kurallar.ts';
import type { DosyaTuru, Olcum } from './kurallar.ts';

export interface HesapIstegi { kimlik: number; tur: DosyaTuru; veri: Uint8Array }
export type HesapYaniti =
  | { tamam: true; olcum: Olcum; sureMs: number; bellek: number }
  | { tamam: false; kalici: boolean; hata: string; bellek?: number };

const GIRIS = fileURLToPath(new URL('./hesap-sureci.ts', import.meta.url));

// fork env verilmezse ana sürecin bütün ortamı (veritabanı parolası dahil TMIV2_*) güvenilmeyen dosyayı okuyan sürece geçer
// (ADR 0024 karar 2). Yalnız işletim sisteminin süreç açmak için istediği değişkenler geçer; Windows'ta SystemRoot gerekir.
const GECEN_DEGISKENLER = ['PATH', 'Path', 'SystemRoot', 'SYSTEMROOT', 'TEMP', 'TMP', 'TMPDIR'] as const;
export function hesapOrtami(ortam: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const sonuc: NodeJS.ProcessEnv = {};
  for (const ad of GECEN_DEGISKENLER) {
    const deger = ortam[ad];
    if (deger !== undefined) sonuc[ad] = deger;
  }
  return sonuc;
}

export interface GeometriSureci {
  hesapla(tur: DosyaTuru, veri: Uint8Array): Promise<HesapYaniti>;
  kapat(): void;
  // Yalnız test ve sağlık için: süreç şu an açık mı ve kaç kez açıldı.
  durum(): { acik: boolean; acilis: number };
}

export function geometriSureciKur(s: { sureMs?: number; bellekEsigi?: number; giris?: string } = {}): GeometriSureci {
  const sureMs = s.sureMs ?? IS_SURE_SINIRI_MS;
  const bellekEsigi = s.bellekEsigi ?? SUREC_BELLEK_ESIGI_BAYT;
  let cocuk: ChildProcess | null = null;
  let acilis = 0;
  let sira = 0;
  let zincir: Promise<unknown> = Promise.resolve();

  const ac = (): ChildProcess => {
    if (cocuk !== null && cocuk.exitCode === null && cocuk.signalCode === null && cocuk.connected) return cocuk;
    // Ana sürecin --import ve --watch bayrakları geçmez: hesap süreci ortam dosyası yüklemez, dosya izlemez.
    const yeni = fork(s.giris ?? GIRIS, [], {
      serialization: 'advanced', execArgv: [], env: hesapOrtami(process.env), stdio: ['ignore', 'ignore', 'pipe', 'ipc'],
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

  const tekIs = (tur: DosyaTuru, veri: Uint8Array): Promise<HesapYaniti> => new Promise((coz) => {
    const c = ac();
    const kimlik = ++sira;
    c.channel?.ref();
    let bitti = false;
    const bitir = (y: HesapYaniti): void => {
      if (bitti) return;
      bitti = true;
      clearTimeout(saat);
      c.off('message', mesaj);
      c.off('exit', cikis);
      c.channel?.unref();
      coz(y);
    };
    const mesaj = (m: HesapYaniti & { kimlik: number }): void => {
      if (m.kimlik !== kimlik) return;
      if (m.bellek !== undefined && m.bellek > bellekEsigi) oldur(c);
      const { kimlik: _k, ...yanit } = m;
      bitir(yanit);
    };
    const cikis = (): void => bitir({ tamam: false, kalici: false, hata: ILETILER.surecDustu });
    const saat = setTimeout(() => { oldur(c); bitir({ tamam: false, kalici: false, hata: ILETILER.sureAsimi }); }, sureMs);
    c.on('message', mesaj);
    c.once('exit', cikis);
    c.send({ kimlik, tur, veri } satisfies HesapIstegi, (hata) => { if (hata) { oldur(c); bitir({ tamam: false, kalici: false, hata: ILETILER.surecDustu }); } });
  });

  return {
    hesapla(tur, veri) {
      const is = zincir.then(() => tekIs(tur, veri));
      zincir = is.catch(() => undefined);
      return is;
    },
    kapat() { if (cocuk !== null) oldur(cocuk); },
    durum: () => ({ acik: cocuk !== null, acilis }),
  };
}

// Sunucunun tek hesap süreci; zamanlayıcı işi kullanır.
let paylasilan: GeometriSureci | null = null;
export function geometriSureci(): GeometriSureci {
  paylasilan ??= geometriSureciKur();
  return paylasilan;
}
