import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { access, mkdir, open, rename, unlink } from 'node:fs/promises';
import { dirname, isAbsolute, join } from 'node:path';

// Talimat medyasının disk deposu (ADR 0009 eki, 1004 a). Dosya adı içeriğin sha256 özetidir ve dosya hiç değişmez: yedek aynası
// yalnız "bu ad var mı" diye bakar. Yazma geçici adla yapılır, tamamlanınca yeniden adlandırılır; ayna nokta ile başlayanı atlar.

type Ortamlar = Readonly<Record<string, string | undefined>>;

// Okuma ortam değişkenindeki klasörden yapılır; mutlak olmayan yol kabul edilmez.
export function diskDizini(env: Ortamlar = process.env): string | null {
  const d = env['TMIV2_MEDYA_DIZINI']?.trim() ?? '';
  return d !== '' && isAbsolute(d) ? d : null;
}

// Yeni dosya diske yalnız ayna varken yazılır (ADR 0009 eki): ayna gelene kadar canlıda disk deposu kapalıdır, medya veritabanında kalır.
export function diskeYazilabilir(env: Ortamlar = process.env): string | null {
  return env['TMIV2_ORTAM'] === 'canli' ? null : diskDizini(env);
}

export const diskYolu = (dizin: string, ozet: string): string => join(dizin, ozet.slice(0, 2), ozet.slice(2, 4), ozet);

const varMi = (yol: string): Promise<boolean> => access(yol).then(() => true, () => false);

// Aynı özetli dosya varsa yazılmaz. Özet tutmazsa geçici dosya silinir ve hata çıkar: diske yalnız doğrulanmış içerik girer.
export async function diskeYaz(dizin: string, ozet: string, parcalar: AsyncIterable<Buffer>): Promise<void> {
  const hedef = diskYolu(dizin, ozet);
  if (await varMi(hedef)) return;
  await mkdir(dirname(hedef), { recursive: true });
  const gecici = join(dirname(hedef), `.${ozet}.${randomBytes(6).toString('hex')}.tmp`);
  const ozetci = createHash('sha256');
  const f = await open(gecici, 'wx');
  try {
    for await (const p of parcalar) {
      ozetci.update(p);
      await f.write(p);
    }
    await f.sync();
  } finally {
    await f.close();
  }
  if (ozetci.digest('hex') !== ozet) {
    await unlink(gecici);
    throw new Error(`Diske yazılan içerik özetle uyuşmuyor: ${ozet}`);
  }
  await rename(gecici, hedef);
}

export async function* disktenOku(dizin: string, ozet: string): AsyncGenerator<Buffer> {
  for await (const p of createReadStream(diskYolu(dizin, ozet), { highWaterMark: 1024 * 1024 })) yield p as Buffer;
}

export async function disktenSil(dizin: string, ozet: string): Promise<void> {
  await unlink(diskYolu(dizin, ozet)).catch((h: unknown) => {
    if ((h as NodeJS.ErrnoException).code !== 'ENOENT') throw h;
  });
}
