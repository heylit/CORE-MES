import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { parseEnv } from 'node:util';

type Ortamlar = Record<string, string | undefined>;

const ONEK = 'TMIV2_';
const ORTAM = 'TMIV2_ORTAM';

// Tabloların sahibinin kimliği: yalnız göç koşusu ve testler ister.
export const GOC_KIMLIGI: readonly string[] = ['TMIV2_PG_GOC_USER', 'TMIV2_PG_GOC_PASSWORD'];

// `git worktree` ile açılan ağaçta .env yoktur (depoya girmez); ana çalışma ağacındaki kullanılır.
export function envYolu(agacKoku: string, anaAgacKoku: () => string | null, varMi: (yol: string) => boolean): string | null {
  const yerel = join(agacKoku, '.env');
  if (varMi(yerel)) return yerel;
  const ana = anaAgacKoku();
  if (ana === null) return null;
  const anadaki = join(ana, '.env');
  return varMi(anadaki) ? anadaki : null;
}

// Dosya varken tek kaynak odur. Süreç ortamındaki TMIV2_ değişkeni dosyadakiyle aynı değilse hangisinin
// geçerli olacağı sessizce seçilmez: adıyla durulur. İletiye değer girmez (parola taşıyabilir).
// `haric` değişkenler bu süreçte hiç okunmaz: karşılaştırılmaz, atanmaz. TMIV2_ dışındaki satır alınmaz.
// Ad büyük harfe çevrilerek eşlenir: Windows'ta süreç ortamı harf büyüklüğüne duyarsızdır (`tmiv2_port`
// `TMIV2_PORT`'u okur ve ezer), Linux'ta ayrı değişkendir. İki platformda aynı ad aynı sonucu versin diye
// farklı harfle yazılmış ad da süreç ortamındaki tanım sayılır.
export function dosyadanAta(hedef: Ortamlar, okunan: Ortamlar, yol: string, haric: readonly string[] = []): void {
  const bizim = (ad: string): boolean => ad.toUpperCase().startsWith(ONEK) && !haric.includes(ad.toUpperCase());
  const dosyadaki = new Map(Object.entries(okunan).filter((cift): cift is [string, string] => bizim(cift[0]) && cift[1] !== undefined));
  const surecteki = Object.keys(hedef).filter((ad) => bizim(ad) && hedef[ad] !== undefined);
  const farkli = surecteki.filter((ad) => dosyadaki.has(ad) && dosyadaki.get(ad) !== hedef[ad]);
  const dosyadaYok = surecteki.filter((ad) => !dosyadaki.has(ad));
  if (farkli.length > 0 || dosyadaYok.length > 0) {
    throw new Error(
      `Ortam çelişkisi: .env varken ${ONEK} değişkenleri yalnız ondan okunur (${yol}).` +
      (farkli.length > 0 ? ` Süreç ortamında farklı değerle tanımlı: ${farkli.join(', ')}.` : '') +
      (dosyadaYok.length > 0 ? ` Süreç ortamında tanımlı, .env dosyasında yok: ${dosyadaYok.join(', ')}.` : '') +
      ' Süreç ortamındaki tanımı kaldırın ya da komutu .env dosyası olmayan bir ağaçta çalıştırın.',
    );
  }
  for (const [ad, deger] of dosyadaki) hedef[ad] = deger;
}

// Git'i klasörün dışındaki bir depoya yönelten değişkenler: süreçte tanımlıyken (git kancası, başka aracın
// alt süreci) depo dışı `.env`'siz kopya ana ağacın `.env`'ine düşerdi.
const GIT_YONLENDIRME = new Set(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_COMMON_DIR']);

// Ana çalışma ağacı, ortak .git klasörünün üst klasörüdür. Git yoksa ya da depo değilse null.
// Yalnız `agacKoku` sorulur; ortamdaki git yönlendirmesi git'e geçmez.
export function anaAgacKoku(agacKoku: string, ortam: Ortamlar = process.env): string | null {
  try {
    const ortakGit = execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: agacKoku,
      env: Object.fromEntries(Object.entries(ortam).filter(([ad]) => !GIT_YONLENDIRME.has(ad.toUpperCase()))),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return ortakGit ? dirname(resolve(agacKoku, ortakGit)) : null;
  } catch {
    return null;
  }
}

// Kaynak tektir: .env varsa (ağaçta ya da ana ağaçta) o, yoksa süreç ortamı. Öteki değişkenlerin eksiğini
// açılışta `ayarOku` söyler; ortam adı ise ayar okumayan süreçte de zorunludur.
// `haric` değişkenler dosyadan alınmaz ve ortamda tanımlıysa da silinir: süreç onları hiçbir yoldan taşımaz.
export function ortamiYukle(
  agacKoku: string,
  hedef: Ortamlar = process.env,
  anaAgac: () => string | null = () => anaAgacKoku(agacKoku),
  haric: readonly string[] = [],
): string | null {
  const yol = envYolu(agacKoku, anaAgac, existsSync);
  if (yol !== null) dosyadanAta(hedef, parseEnv(readFileSync(yol, 'utf8')), yol, haric);
  for (const ad of haric) delete hedef[ad];
  if (!hedef[ORTAM]?.trim()) {
    throw new Error(`Ortam değişkeni eksik: ${ORTAM} (kaynak: ${yol ?? 'süreç ortamı; .env dosyası bulunamadı'})`);
  }
  return yol;
}

// Ön yükleme dosyalarının ortak gövdesi: yapılandırma hatası yığın izi yerine tek satırla bitirir.
export function onYukle(agacKoku: string, haric: readonly string[] = []): void {
  try {
    ortamiYukle(agacKoku, process.env, undefined, haric);
  } catch (hata) {
    console.error(hata instanceof Error ? hata.message : String(hata));
    process.exit(1);
  }
}
