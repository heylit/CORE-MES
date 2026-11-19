import { constants, existsSync, readFileSync, statSync } from 'node:fs';
import { copyFile, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv, parseArgs } from 'node:util';
import { GOSTERGE_DOSYASI, yardimciGuncellemeAyariOku } from './logo-yardimcisi-guncelle.ts';

// 3432: 3314'ün canlıda bir kez elle yapılan ayarını tek komuta toplar. Yardımcıyı durdurmaz, başlatmaz, Logo'ya bağlanmaz:
// aynı anda iki yardımcı (tek Logo lisansı) ancak betik çalışınca olabilir, betiğin kapı denetimine dokunulmaz. Elle yazılmış
// betik yeniden yazılmaz; yalnız exe yolunu taşıyan tek satır değişir, gösterge okunamazsa betik bugünkü exe'yi açar.
export const DURUM_DOSYASI = 'logo-yardimci-ayar.json';
export const EXE_DEGISKENI = 'LOGO_YARDIMCI_EXE';
// cmd `set /p` dosyayı konsol kod sayfasıyla okur; ASCII dışı harf ya da cmd'nin özel karakteri yolu bozar, yardımcı açılmaz.
const GUVENLI_YOL = /^[A-Za-z0-9 _.\-:\\/()]+$/;
const EXE_SATIRI = /logo-yardimcisi\.exe/i;
const TIRNAKLI_EXE = /"([^"]*logo-yardimcisi\.exe)"/gi;

export interface AyarGirdisi {
  betikYolu: string;
  betik: string;
  // null: ilk kurulumun .env'i bulunamadı (ilk geçiş); .env'e dokunulmaz, plan uyarı taşır.
  envYolu: string | null;
  env: string;
  // Verilmezse exe yolundan çıkarılır: <kurulum>\logo-yardimcisi-<sürüm>\cikti\logo-yardimcisi.exe
  kurulum: string | null;
  gostergeOku: (kurulum: string) => string | null;
  dosyaVarMi: (yol: string) => boolean;
  klasorVarMi: (yol: string) => boolean;
}

export type AyarPlani =
  | { tur: 'red'; ileti: string }
  | { tur: 'zaten'; ileti: string; uyarilar: string[] }
  | { tur: 'yaz'; kurulum: string; betik: string | null; env: string | null; gosterge: string | null; ozet: string[]; uyarilar: string[] };

const red = (ileti: string): AyarPlani => ({ tur: 'red', ileti: `${ileti} Hiçbir dosya değişmedi; elle adımlar: kurulum/logo-yardimcisi.md.` });

function guvenliMi(yol: string): boolean { return GUVENLI_YOL.test(yol) && isAbsolute(yol); }

// Saf: ne yazılacağını söyler, yazmaz. Önizleme ve uygulama aynı planı kullanır.
export function ayarPlani(g: AyarGirdisi): AyarPlani {
  if (!guvenliMi(g.betikYolu)) return red(`Betik yolu mutlak olmalı ve yalnız İngilizce harf, rakam, boşluk ve . _ - \\ : ( ) içermeli: ${g.betikYolu}`);
  if (g.envYolu !== null && !guvenliMi(g.envYolu)) return red(`.env yolu mutlak olmalı ve yalnız İngilizce harf, rakam, boşluk ve . _ - \\ : ( ) içermeli: ${g.envYolu}`);
  // Sürüm klasöründeki .env ilk kurulumunkinin kopyasıdır; açılışta üzerine yazılır (araclar/guncelleyici.ts envKopyala).
  if (g.envYolu?.split(/[\\/]/).includes('surumler') === true) return red('Verilen .env bir sürüm klasöründe; ilk kurulum klasörünün .env dosyası verilmeli.');

  const eol = g.betik.includes('\r\n') ? '\r\n' : '\n';
  const satirlar = g.betik.split(/\r?\n/);
  const uyarilar: string[] = [];
  const ozet: string[] = [];
  let eskiExe: string | null = null;
  let yeniBetik: string | null = null;
  const betikHazir = g.betik.toLowerCase().includes(GOSTERGE_DOSYASI.toLowerCase());

  if (!betikHazir) {
    const yer = satirlar.flatMap((s, i) => (EXE_SATIRI.test(s) ? [i] : []));
    if (yer.length !== 1) return red(`Betikte logo-yardimcisi.exe geçen ${String(yer.length)} satır var; tam bir satır bekleniyordu (exe başka dosyadaysa o dosyayı verin).`);
    const i = yer[0] ?? 0;
    const satir = satirlar[i] ?? '';
    const eslesme = [...satir.matchAll(TIRNAKLI_EXE)];
    if (eslesme.length !== 1) return red('Exe satırında yol çift tırnak içinde tek kez geçmeli.');
    eskiExe = eslesme[0]?.[1] ?? '';
    if (!guvenliMi(eskiExe)) return red(`Exe yolu mutlak olmalı ve yalnız İngilizce harf, rakam, boşluk ve . _ - \\ : ( ) içermeli: ${eskiExe}`);
    if (!g.dosyaVarMi(eskiExe)) return red(`Betikteki exe bulunamadı: ${eskiExe}`);
  }

  const kurulum = g.kurulum ?? (eskiExe === null ? null : dirname(dirname(dirname(eskiExe))));
  if (kurulum === null) return red('Betik zaten gösterge dosyasını okuyor; --kurulum verilmeli.');
  if (!guvenliMi(kurulum)) return red(`Kurulum klasörü mutlak olmalı ve yalnız İngilizce harf, rakam, boşluk ve . _ - \\ : ( ) içermeli: ${kurulum}`);
  if (!g.klasorVarMi(kurulum)) return red(`Kurulum klasörü yok: ${kurulum}`);
  const gostergeYolu = join(kurulum, GOSTERGE_DOSYASI);
  const gosterge = g.gostergeOku(kurulum);

  if (!betikHazir && eskiExe !== null) {
    const ek = [
      'rem Logo yardimcisi exe yolu gosterge dosyasindan okunur (kurulum/logo-yardimcisi.md); okunamazsa onceki sabit yol acilir.',
      `set "${EXE_DEGISKENI}=${eskiExe}"`,
      `if exist "${gostergeYolu}" set /p ${EXE_DEGISKENI}=<"${gostergeYolu}"`,
      `if not exist "%${EXE_DEGISKENI}%" set "${EXE_DEGISKENI}=${eskiExe}"`,
    ];
    const yer = satirlar.findIndex((s) => EXE_SATIRI.test(s));
    const yeni = [...satirlar];
    yeni[yer] = (yeni[yer] ?? '').replace(`"${eskiExe}"`, `"%${EXE_DEGISKENI}%"`);
    // Değişken betiğin başında atanır: exe satırı parantezli bir bloktaysa %...% blok okunurken açılır, blok içindeki atama görünmez.
    const bas = /^\s*@?echo\s+off\s*$/i.test(yeni[0] ?? '') ? 1 : 0;
    yeni.splice(bas, 0, ...ek);
    yeniBetik = yeni.join(eol);
    ozet.push(`Betik: exe satırı gösterge dosyasından okur, okunamazsa ${eskiExe} açılır (${g.betikYolu}).`);
    if (!/4195|LISTENING|tasklist/i.test(g.betik)) {
      uyarilar.push('Betikte yardımcının zaten çalışıp çalışmadığına bakan bir denetim görülmedi (ör. 4195 kapısı). Bugünkü gibi kalır; iki yardımcı açılmaması betiğe bağlıdır.');
    }
  }

  let yeniGosterge: string | null = null;
  if (gosterge === null) {
    if (eskiExe === null) return red(`Betik gösterge dosyasını okuyor ama ${gostergeYolu} yok ya da boş.`);
    yeniGosterge = `${eskiExe}\r\n`;
    ozet.push(`Gösterge: ${gostergeYolu} bugünkü exe ile yazılır.`);
  } else if (!g.dosyaVarMi(gosterge)) {
    uyarilar.push(`Gösterge dosyasındaki exe yok (${gosterge}); betik ${eskiExe ?? 'önceki sabit yol'} açar.`);
  }

  const ortam = g.envYolu === null ? {} : parseEnv(g.env);
  const istenen = { TMIV2_LOGO_YARDIMCI_KURULUM: kurulum, TMIV2_LOGO_YARDIMCI_BASLAT: g.betikYolu };
  let yeniEnv: string | null = null;
  const eksik: string[] = [];
  for (const [ad, deger] of Object.entries(istenen)) {
    const var_ = ortam[ad]?.trim();
    if (var_ === undefined || var_ === '') { eksik.push(`${ad}=${deger}`); continue; }
    if (var_.toLowerCase() !== deger.toLowerCase()) return red(`.env'de ${ad} başka bir değerle var (${var_}); elle bakılmalı.`);
  }
  if (g.envYolu === null) {
    uyarilar.push('İlk kurulumun .env dosyası bulunamadı; TMIV2_LOGO_YARDIMCI_KURULUM ve TMIV2_LOGO_YARDIMCI_BASLAT eklenmedi. Sonraki paketlerde yardımcı kendiliğinden yenilenmez.');
  } else if (eksik.length > 0) {
    const envEol = g.env.includes('\r\n') ? '\r\n' : '\n';
    const ayrac = g.env === '' || g.env.endsWith('\n') ? '' : envEol;
    yeniEnv = `${g.env}${ayrac}# Logo yardimcisi guncellemesi (kurulum/logo-yardimcisi.md)${envEol}${eksik.join(envEol)}${envEol}`;
    ozet.push(`.env: ${eksik.map((s) => s.split('=')[0] ?? '').join(' ve ')} eklenir (${g.envYolu}); sunucu yeniden başlayınca okunur.`);
  }
  const sonra = yardimciGuncellemeAyariOku({ ...ortam, ...istenen });
  if (g.envYolu !== null && sonra !== null && 'hata' in sonra) uyarilar.push(`Güncelleyici yardımcıya yine dokunmaz: ${sonra.hata}`);

  if (yeniBetik === null && yeniGosterge === null && yeniEnv === null) {
    return { tur: 'zaten', ileti: 'Zaten ayarlı; hiçbir dosya değişmedi.', uyarilar };
  }
  return { tur: 'yaz', kurulum, betik: yeniBetik, env: yeniEnv, gosterge: yeniGosterge, ozet, uyarilar };
}

export interface AyarDurumu {
  tarih: string;
  betik: { yol: string; yedek: string } | null;
  env: { yol: string; yedek: string } | null;
  gosterge: string | null;
}

export function damga(t: Date): string { return t.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-'); }

async function yerindeYaz(yol: string, icerik: string): Promise<void> {
  await writeFile(`${yol}.yeni`, icerik, 'utf8');
  await rename(`${yol}.yeni`, yol);
}

// Yedek üzerine yazılmaz (COPYFILE_EXCL); aynı saniyede ikinci uygulama yedeği bozmasın diye durur.
// Ortada hata olursa çağıran, o ana kadar alınan yedekleri `durum`dan okuyup ekrana yazar.
export async function uygula(
  p: Extract<AyarPlani, { tur: 'yaz' }>, betikYolu: string, envYolu: string | null, simdi: Date,
  durum: AyarDurumu = { tarih: simdi.toISOString(), betik: null, env: null, gosterge: null },
): Promise<AyarDurumu> {
  const d = damga(simdi);
  if (p.betik !== null) {
    const yedek = `${betikYolu}.yedek-${d}`;
    await copyFile(betikYolu, yedek, constants.COPYFILE_EXCL);
    durum.betik = { yol: betikYolu, yedek };
  }
  if (p.env !== null && envYolu !== null) {
    const yedek = `${envYolu}.yedek-${d}`;
    await copyFile(envYolu, yedek, constants.COPYFILE_EXCL);
    durum.env = { yol: envYolu, yedek };
  }
  if (p.gosterge !== null) {
    const yol = join(p.kurulum, GOSTERGE_DOSYASI);
    await yerindeYaz(yol, p.gosterge);
    durum.gosterge = yol;
  }
  if (p.env !== null && envYolu !== null) await yerindeYaz(envYolu, p.env);
  // Betik en son: önceki adımlardan biri bozulursa betik bugünkü haliyle kalır.
  if (p.betik !== null) await yerindeYaz(betikYolu, p.betik);
  await yerindeYaz(join(p.kurulum, DURUM_DOSYASI), `${JSON.stringify(durum, null, 2)}\n`);
  return durum;
}

// Geri al: yedekler yerine konur; o anki dosyalar önce ayrıca saklanır. Gösterge dosyası kalır: eski betik onu okumaz.
export async function geriAl(kurulum: string, simdi: Date): Promise<string[]> {
  const yol = join(kurulum, DURUM_DOSYASI);
  const metin = await readFile(yol, 'utf8').catch(() => null);
  if (metin === null) throw new Error(`${yol} yok; bu araçla uygulanmış bir ayar bulunamadı.`);
  const durum = JSON.parse(metin) as AyarDurumu;
  const d = damga(simdi);
  const yapilan: string[] = [];
  for (const k of [durum.betik, durum.env]) {
    if (k === null) continue;
    if (!existsSync(k.yedek)) throw new Error(`Yedek yok: ${k.yedek}; geri alma durdu.`);
  }
  for (const k of [durum.betik, durum.env]) {
    if (k === null) continue;
    await copyFile(k.yol, `${k.yol}.geri-al-oncesi-${d}`, constants.COPYFILE_EXCL);
    await copyFile(k.yedek, `${k.yol}.yeni`);
    await rename(`${k.yol}.yeni`, k.yol);
    yapilan.push(`${k.yol} yedekten geri kondu (${k.yedek}).`);
  }
  await rename(yol, `${yol}.geri-alindi-${d}`);
  if (durum.gosterge !== null) yapilan.push(`${durum.gosterge} kaldı; eski betik onu okumaz.`);
  yapilan.push('Sunucu yeniden başlayınca .env değişikliği geçer. Çalışan yardımcıya dokunulmadı.');
  return yapilan;
}

const KULLANIM = 'Kullanım: npm run logo-yardimci-ayar -- --betik <yardımcı başlatma betiği> --env <ilk kurulum .env> [--kurulum <klasör>] [--uygula]\n'
  + '          npm run logo-yardimci-ayar -- --geri-al --kurulum <klasör>';

export async function kos(arg: string[], simdi = new Date()): Promise<{ kod: number; cikti: string[] }> {
  const { values: v } = parseArgs({
    args: arg, options: {
      betik: { type: 'string' }, env: { type: 'string' }, kurulum: { type: 'string' }, uygula: { type: 'boolean' }, 'geri-al': { type: 'boolean' },
    },
  });
  if (v['geri-al'] === true) {
    if (v.kurulum === undefined) return { kod: 2, cikti: [KULLANIM] };
    try {
      return { kod: 0, cikti: await geriAl(v.kurulum, simdi) };
    } catch (hata) {
      return { kod: 1, cikti: [hata instanceof Error ? hata.message : String(hata)] };
    }
  }
  if (v.betik === undefined || v.env === undefined) return { kod: 2, cikti: [KULLANIM] };
  const betik = await readFile(v.betik, 'utf8').catch(() => null);
  if (betik === null) return { kod: 1, cikti: [`Betik okunamadı: ${v.betik}`] };
  const env = await readFile(v.env, 'utf8').catch(() => null);
  if (env === null) return { kod: 1, cikti: [`.env okunamadı: ${v.env}`] };
  const plan = ayarPlani({
    betikYolu: v.betik, betik, envYolu: v.env, env, kurulum: v.kurulum ?? null,
    gostergeOku: (k) => {
      const y = join(k, GOSTERGE_DOSYASI);
      const t = existsSync(y) && statSync(y).isFile() ? (readFileSync(y, 'utf8').split(/\r?\n/)[0]?.trim() ?? '') : '';
      return t === '' ? null : t;
    },
    dosyaVarMi: (y) => existsSync(y) && statSync(y).isFile(),
    klasorVarMi: (y) => existsSync(y) && statSync(y).isDirectory(),
  });
  if (plan.tur === 'red') return { kod: 1, cikti: [plan.ileti] };
  const uyari = plan.uyarilar.map((u) => `Uyarı: ${u}`);
  if (plan.tur === 'zaten') return { kod: 0, cikti: [plan.ileti, ...uyari] };
  if (v.uygula !== true) {
    return { kod: 0, cikti: ['Önizleme (hiçbir dosya değişmedi):', ...plan.ozet, ...uyari, 'Uygulamak için aynı komutu --uygula ile çalıştırın.'] };
  }
  const durum: AyarDurumu = { tarih: simdi.toISOString(), betik: null, env: null, gosterge: null };
  try {
    await uygula(plan, v.betik, v.env, simdi, durum);
  } catch (hata) {
    return {
      kod: 1,
      cikti: [
        `Uygulama yarıda kaldı: ${hata instanceof Error ? hata.message : String(hata)}`,
        ...[durum.betik, durum.env].flatMap((k) => (k === null ? [] : [`Alınan yedek: ${k.yedek} (asıl dosya: ${k.yol})`])),
        ...(durum.gosterge === null ? [] : [`Yazılan gösterge: ${durum.gosterge}`]),
        'Betik en son yazılır; betik yedeği alındıysa ve betik değiştiyse yedeği elle geri koyun. Çalışan yardımcıya dokunulmadı.',
      ],
    };
  }
  return {
    kod: 0,
    cikti: [
      'Uygulandı:', ...plan.ozet, ...uyari,
      ...[durum.betik, durum.env].flatMap((k) => (k === null ? [] : [`Yedek: ${k.yedek}`])),
      'Çalışan yardımcıya dokunulmadı. Geri almak için: npm run logo-yardimci-ayar -- --geri-al --kurulum ' + plan.kurulum,
    ],
  };
}

const dogrudanKosuyor = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (dogrudanKosuyor) {
  const { kod, cikti } = await kos(process.argv.slice(2));
  for (const s of cikti) console.log(s);
  process.exitCode = kod;
}
