import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Birleşmeden sonra devir belgesine elle yazılan kayıt satırlarının taslağı (3022 a). Bilgiler yalnız yerel git'ten okunur:
// ağa çıkmaz, devir belgesine kendisi yazmaz; çıktıyı kayıt yazarı okur ve kendi yamasına koyar.

export interface BirlesmeBilgisi {
  sha: string;
  zaman: Date;
  prNo: number | null;
  baslik: string;
  gocToplam: number;
  yeniGocler: readonly string[];
  sonGoc: string | null;
  windowsBuCommit: boolean;
  sonWindowsYesili: { sha: string; etiket: string } | null;
}

// "Merge pull request #1795 from ..." iletisinden PR numarası ve başlık (boş satırdan sonraki ilk satır).
export function birlesmeIletisiOku(ileti: string): { prNo: number | null; baslik: string } {
  const satirlar = ileti.replaceAll('\r\n', '\n').split('\n');
  const no = /^Merge pull request #(\d+) /.exec(satirlar[0] ?? '');
  const baslik = (no ? satirlar.slice(1).find((s) => s.trim() !== '') : satirlar[0]) ?? '';
  return { prNo: no ? Number(no[1]) : null, baslik: baslik.trim() };
}

// Başlığın sonundaki parantezdeki kart numaraları (PR başlık kuralı, araclar/paket.ts KART_NO_BASLIKTA).
export function basliktakiKartlar(baslik: string): string[] {
  const p = /\(([^()]*)\)\s*$/.exec(baslik.trim());
  return p ? (p[1] ?? '').split(/[,\s]+/).filter((s) => /^\d{3,5}(?:-[\w]+)?$/.test(s)) : [];
}

const iki = (n: number): string => String(n).padStart(2, '0');
export const tarihUtc = (z: Date): string => `${iki(z.getUTCDate())}.${iki(z.getUTCMonth() + 1)}.${String(z.getUTCFullYear())}`;
export const saatUtc = (z: Date): string => `${iki(z.getUTCHours())}:${iki(z.getUTCMinutes())}`;

export function kayitSatirlari(b: BirlesmeBilgisi, simdi: Date): { gunluk: string; ozet: string } {
  const kisa = b.sha.slice(0, 8);
  const kartlar = basliktakiKartlar(b.baslik);
  const pr = b.prNo === null ? 'doğrudan commit' : `#${String(b.prNo)}${kartlar.length ? ` (${kartlar.join(', ')})` : ''}`;
  const goc = b.yeniGocler.length === 0 ? `göç yok (${String(b.gocToplam)})` : `${String(b.yeniGocler.length)} yeni göç (${String(b.gocToplam)}; en yeni ${b.sonGoc ?? '?'})`;
  const win = b.windowsBuCommit
    ? `Windows yeşil ${kisa}`
    : `Windows son yeşil ${b.sonWindowsYesili ? b.sonWindowsYesili.sha.slice(0, 8) : 'yok'}, ${kisa} bekliyor`;
  const etiket = b.windowsBuCommit || b.sonWindowsYesili === null ? '' : ` (etiket ${b.sonWindowsYesili.etiket})`;
  const gunluk = `- ${tarihUtc(simdi)} ${saatUtc(simdi)} UTC DEVIR yazari: kayit-${saatUtc(simdi).replace(':', '')}: CORE-MES ${pr} birlesti, main ${kisa}, ${goc}; ${win}${etiket}. (taslak: araclar/birlesme-kaydi.ts)`;
  const ozet = `- CORE-MES main: \`${kisa}\` (${tarihUtc(b.zaman).slice(0, 5)} ${saatUtc(b.zaman)}Z, ${pr} ${b.baslik.replace(/\s*\([^()]*\)\s*$/, '')}; D: git log --first-parent ${saatUtc(simdi)}Z). `
    + (b.windowsBuCommit ? `Windows yeşil son: \`${kisa}\`.` : `Windows yeşil son: \`${b.sonWindowsYesili?.sha.slice(0, 8) ?? 'yok'}\`${etiket}; ${kisa} bekliyor.`)
    + ` Göç: ${b.sonGoc ?? '?'} (${String(b.gocToplam)}).`;
  return { gunluk, ozet };
}

function git(kok: string, ...arg: string[]): string {
  return execFileSync('git', arg, { cwd: kok, encoding: 'utf8' }).trim();
}

export function birlesmeOku(kok: string, ref: string): BirlesmeBilgisi {
  const sha = git(kok, 'rev-parse', `${ref}^{commit}`);
  const { prNo, baslik } = birlesmeIletisiOku(git(kok, 'log', '-1', '--format=%B', sha));
  const zaman = new Date(git(kok, 'log', '-1', '--format=%cI', sha));
  const gocler = git(kok, 'ls-tree', '--name-only', `${sha}:sunucu/gocler`).split('\n').filter((d) => d.endsWith('.sql')).sort();
  const ebeveyn = git(kok, 'rev-list', '--parents', '-n', '1', sha).split(' ')[1];
  const yeniGocler = ebeveyn === undefined ? [] : git(kok, 'diff', '--name-only', '--diff-filter=A', ebeveyn, sha, '--', 'sunucu/gocler')
    .split('\n').filter((d) => d.endsWith('.sql'));
  const etiketler = git(kok, 'tag', '--points-at', sha, '--list', 'windows-yesil/*');
  let sonWindowsYesili: BirlesmeBilgisi['sonWindowsYesili'] = null;
  try {
    const etiket = git(kok, 'describe', '--tags', '--abbrev=0', '--first-parent', '--match', 'windows-yesil/*', sha);
    sonWindowsYesili = { etiket, sha: git(kok, 'rev-parse', `${etiket}^{commit}`) };
  } catch { /* etiket yoksa son yeşil bilinmiyor */ }
  return {
    sha, zaman, prNo, baslik, gocToplam: gocler.length, yeniGocler, sonGoc: gocler.at(-1)?.replace(/_.*$/, '') ?? null,
    windowsBuCommit: etiketler !== '', sonWindowsYesili,
  };
}

const dogrudanKosuyor = process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

// Kullanım: node araclar/birlesme-kaydi.ts [ref, varsayılan origin/main]. Önce: git fetch origin main --tags
if (dogrudanKosuyor) {
  const ref = process.argv[2] ?? 'origin/main';
  const kok = fileURLToPath(new URL('../', import.meta.url));
  const s = kayitSatirlari(birlesmeOku(kok, ref), new Date());
  console.log(`GUNLUK:\n${s.gunluk}\n\nOZET (CORE-MES main satırı):\n${s.ozet}`);
}
