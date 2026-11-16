import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { LogoYardimciSurumu } from '#paylasilan/sozlesme/logo.ts';
import type { KopruIstemcisi } from './kopru.ts';

// 3314: çalışan Logo yardımcısı bu paketteki kaynaktan mı derlendi. Kural araclar/logo-yardimcisi/SurumUret.cs ile aynıdır: dışarıdaki
// dört dosya hariç .cs dosyaları ad sırasıyla (sıralı, büyük-küçük harf duyarlı), her biri "ad\n" + LF'li içerik + "\n"; SHA-256.
const OZET_DISI = new Set(['Testler.cs', 'SahteLogo.cs', 'SurumUret.cs', 'Surum.g.cs']);
const YARDIMCI_KLASORU = fileURLToPath(new URL('../../../araclar/logo-yardimcisi/', import.meta.url));

export function yardimciKaynakOzeti(dosyalar: readonly { ad: string; icerik: string }[]): string {
  const h = createHash('sha256');
  for (const d of [...dosyalar].filter((x) => x.ad.endsWith('.cs') && !OZET_DISI.has(x.ad)).sort((a, b) => (a.ad < b.ad ? -1 : a.ad > b.ad ? 1 : 0))) {
    h.update(`${d.ad}\n${d.icerik.replace(/^﻿/, '').replace(/\r\n/g, '\n')}\n`, 'utf8');
  }
  return h.digest('hex');
}

// Paketteki kaynağın özeti; klasör yoksa (kaynaksız kurulum) null. Süreç ömründe değişmez, bir kez okunur.
let paketOzeti: Promise<string | null> | null = null;
export function pakettekiOzet(klasor = YARDIMCI_KLASORU): Promise<string | null> {
  if (klasor !== YARDIMCI_KLASORU) return okuVeOzetle(klasor);
  paketOzeti ??= okuVeOzetle(klasor);
  return paketOzeti;
}
async function okuVeOzetle(klasor: string): Promise<string | null> {
  try {
    const adlar = (await readdir(klasor)).filter((a) => a.endsWith('.cs'));
    if (adlar.length === 0) return null;
    return yardimciKaynakOzeti(await Promise.all(adlar.map(async (ad) => ({ ad, icerik: await readFile(`${klasor}${ad}`, 'utf8') }))));
  } catch {
    return null;
  }
}

// Saf yorum: sürüm ucunun cevabı ve paketteki özet. Eski yardımcıda uç yoktur (404). Ulaşılamayan yardımcı "bilinmiyor"dur; uyarı değil.
export function surumuYorumla(
  paketteki: string | null,
  c: { durum: number; govde: unknown } | { tur: string; ileti: string },
  zaman: Date,
): LogoYardimciSurumu {
  const temel = { pakettekiOzet: paketteki, sonBakis: zaman.toISOString() };
  if ('tur' in c) return { ...temel, durum: 'bilinmiyor', calisanOzet: null, derlemeZamani: null, ileti: `Yardımcıya ulaşılamadı: ${c.ileti}` };
  if (c.durum === 404) {
    return { ...temel, durum: 'eski', calisanOzet: null, derlemeZamani: null, ileti: 'Logo yardımcısı sürüm bildirmiyor; bu paketten eski. Yardımcıyı güncelleyin (kurulum/logo-yardimcisi.md).' };
  }
  const g = c.govde !== null && typeof c.govde === 'object' ? (c.govde as Record<string, unknown>) : {};
  const ozet = typeof g.kaynakOzeti === 'string' ? g.kaynakOzeti : null;
  const derleme = typeof g.derlemeZamani === 'string' ? g.derlemeZamani : null;
  if (c.durum !== 200 || ozet === null) return { ...temel, durum: 'bilinmiyor', calisanOzet: null, derlemeZamani: null, ileti: `Sürüm okunamadı (${c.durum}).` };
  if (paketteki === null) return { ...temel, durum: 'bilinmiyor', calisanOzet: ozet, derlemeZamani: derleme, ileti: 'Paketteki yardımcı kaynağı bulunamadı; karşılaştırılamadı.' };
  if (ozet === paketteki) return { ...temel, durum: 'ayni', calisanOzet: ozet, derlemeZamani: derleme, ileti: 'Yardımcı bu paketin kaynağından derlenmiş.' };
  return {
    ...temel, durum: 'farkli', calisanOzet: ozet, derlemeZamani: derleme,
    ileti: `Logo yardımcısı eski sürümde${derleme ? ` (derleme ${derleme})` : ''}; paketteki kaynak farklı. Yeni işlemler eski yardımcıda çalışmayabilir. Yardımcıyı güncelleyin (kurulum/logo-yardimcisi.md).`,
  };
}

// Son bakış süreç belleğindedir; açılışta ve saatte bir yenilenir. Hazırlık ve bağlantı izleme ekranı okur.
let sonSurum: LogoYardimciSurumu | null = null;
export const yardimciSurumu = (): LogoYardimciSurumu | null => sonSurum;
export async function yardimciSurumunuSor(kopru: KopruIstemcisi, saat: () => Date = () => new Date(), klasor?: string): Promise<LogoYardimciSurumu> {
  const paketteki = await pakettekiOzet(klasor);
  sonSurum = surumuYorumla(paketteki, await kopru.kontrolOku('/api/version'), saat());
  return sonSurum;
}
