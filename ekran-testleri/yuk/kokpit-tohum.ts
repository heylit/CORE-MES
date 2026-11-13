import { parseArgs } from 'node:util';
import { hedefiDenetle } from './hazirla.ts';
import type { Cevap, Istemci } from './hazirla.ts';
import { tohumluUretec } from './senaryo.ts';

// Kokpit yük denemesi (kart 3185 a): test veritabanına uydurma tezgâh ve emir açar; Test hamle başına sunucu süresini bununla ölçer.
// Yalnız canlı olmayan yerel hedefe (hedefiDenetle) ve yalnız modüllerin kendi uçlarıyla yazar; tabloya doğrudan yazılmaz.
// Kodlar ORN-YUK-, adlar "Deneme ..." biçimindedir; gerçek ürün, kişi ya da sayı yoktur. Emirler örnek ürünlerin yürürlükteki
// rotasından açılır; tezgâhı plan seçer (adımın istasyonundaki makineler arasından). Önce `npm run ekran:hazirla` (örnek veri) gerekir.

interface Ayar { emir: number; tezgah: number; tohum: number; taslakYuzde: number }

function ayarOku(argv: readonly string[]): Ayar {
  const { values: s } = parseArgs({
    args: [...argv], strict: true,
    options: { emir: { type: 'string' }, tezgah: { type: 'string' }, tohum: { type: 'string' }, taslak: { type: 'string' } },
  });
  const sayi = (ad: string, d: string | undefined, varsayilan: number, en: number, cok: number): number => {
    const n = d === undefined ? varsayilan : Number(d);
    if (!Number.isInteger(n) || n < en || n > cok) throw new Error(`--${ad} ${String(en)}-${String(cok)} arası tam sayı olmalı.`);
    return n;
  };
  return {
    emir: sayi('emir', s.emir, 300, 0, 2000),
    tezgah: sayi('tezgah', s.tezgah, 40, 2, 200),
    tohum: sayi('tohum', s.tohum, 1, 0, 2 ** 31),
    taslakYuzde: sayi('taslak', s.taslak, 20, 0, 100),
  };
}

const neden = (c: Cevap): string => {
  const mesaj = (c.govde as { mesaj?: unknown } | null)?.mesaj;
  return `durum ${String(c.durum)}${typeof mesaj === 'string' ? `: ${mesaj}` : ''}`;
};

async function iste<T>(i: Istemci, yontem: 'GET' | 'POST', yol: string, govde?: unknown): Promise<T> {
  const c = await i.istek(yontem, yol, govde);
  if (c.durum !== 200) throw new Error(`${yontem} ${yol} başarısız (${neden(c)}).`);
  return c.govde as T;
}

// Yeni tezgâhlar örnek tezgâhların istasyonlarına sırayla eklenir: planlama adayı rota adımının istasyonundaki bütün makinelerdir,
// böylece emirler gerçek atölyedeki gibi aynı istasyonun tezgâhları arasında dağılır. Kontrol istasyonu kişi kapasitelidir; ona tezgâh
// eklenmez. Var olan ORN-YUK tezgâhı başka istasyondaysa yerine taşınır (betik yinelenebilir).
const GRUPLAR = [
  { tip: 'TRN', harf: 'T', ad: 'Deneme torna', ornek: /^ORN-CNC-T/ },
  { tip: 'FRZ', harf: 'F', ad: 'Deneme freze', ornek: /^ORN-CNC-F/ },
] as const;

const gunEkle = (gun: number): string => {
  const t = new Date();
  t.setUTCDate(t.getUTCDate() + gun);
  return t.toISOString().slice(0, 10);
};

interface MakineSatiri {
  id: number; kod: string | null; ad: string; tur: string | null; markaModel: string | null; seriNo: string | null;
  istasyonId: number | null; baglantiTuru: string | null; baglantiAdresi: string | null; aktif: boolean; surum: number;
}

async function tezgahlariKur(y: Istemci, toplam: number): Promise<Map<string, number[]>> {
  const makineler = (await iste<{ makineler: MakineSatiri[] }>(y, 'GET', '/makineler')).makineler;
  const adla = new Map(makineler.map((m) => [m.kod, m]));
  const tipe = new Map<string, number[]>();
  let kalan = toplam;
  for (const [sira, g] of GRUPLAR.entries()) {
    const istasyonlar = [...new Set(makineler.filter((m) => g.ornek.test(m.kod ?? '') && m.istasyonId !== null).map((m) => m.istasyonId as number))];
    if (istasyonlar.length === 0) throw new Error(`${g.ad} için örnek istasyon yok: önce boş test veritabanında \`npm run ekran:hazirla\`.`);
    const sayi = sira === GRUPLAR.length - 1 ? kalan : Math.round(toplam / GRUPLAR.length);
    kalan -= sayi;
    const idler: number[] = [];
    for (let n = 1; n <= sayi; n += 1) {
      const no = String(n).padStart(2, '0');
      const kod = `ORN-YUK-${g.harf}${no}`;
      const istasyonId = istasyonlar[(n - 1) % istasyonlar.length] as number;
      const m = adla.get(kod);
      if (m === undefined) {
        idler.push((await iste<{ id: number }>(y, 'POST', '/makineler', { kod, ad: `${g.ad} ${no}`, istasyonId })).id);
        continue;
      }
      if (m.istasyonId !== istasyonId) {
        const { id, surum, kod: k, ad, tur, markaModel, seriNo, baglantiTuru, baglantiAdresi, aktif } = m;
        await iste(y, 'POST', `/makineler/${String(id)}/guncelle`, { kod: k, ad, tur, markaModel, seriNo, istasyonId, baglantiTuru, baglantiAdresi, aktif, surum });
      }
      idler.push(m.id);
    }
    tipe.set(g.tip, idler);
  }
  return tipe;
}

async function main(): Promise<void> {
  const ayar = ayarOku(process.argv.slice(2));
  const { yonetici: y } = await hedefiDenetle({ yonetici: 'ornek.yonetici' });
  const rastgele = tohumluUretec(ayar.tohum);
  const sec = <T>(dizi: readonly T[]): T => dizi[Math.floor(rastgele() * dizi.length)] as T;

  const tipe = await tezgahlariKur(y, ayar.tezgah);
  process.stdout.write(`Tezgâh: ${[...tipe].map(([t, i]) => `${t} ${String(i.length)}`).join(', ')}\n`);

  const rotalar = (await iste<{ rotalar: Array<{ urun: { id: number }; yururlukte: { id: number } | null }> }>(y, 'GET', '/rota/urunler')).rotalar
    .flatMap((r) => (r.yururlukte === null ? [] : [r.yururlukte.id]));
  if (rotalar.length === 0) throw new Error('Yürürlükte rota yok: önce boş test veritabanında `npm run ekran:hazirla`.');

  const basla = performance.now();
  for (let n = 1; n <= ayar.emir; n += 1) {
    // Teslimler 2-30 gün sonra; bir kısmı sıkışık, böylece Kokpit'te geç ve riskli emir olur.
    await iste(y, 'POST', `/rota/revizyonlar/${String(sec(rotalar))}/emre-kopyala`, {
      adet: 10 + Math.floor(rastgele() * 70), teslim: gunEkle(2 + Math.floor(rastgele() * 29)), oncelik: 1 + Math.floor(rastgele() * 4),
      aciklama: `ORN-YUK deneme emri ${String(n)}`, taslak: rastgele() * 100 < ayar.taslakYuzde, emirTuru: 'stok',
    });
    if (n % 50 === 0) process.stdout.write(`${String(n)} emir açıldı (${String(Math.round((performance.now() - basla) / 1000))} sn)\n`);
  }
  process.stdout.write(`Bitti: ${String(ayar.emir)} emir. Planlama sayfasında planı kurun, sonra Kokpit'i açın.\n`);
}

main().catch((h: unknown) => {
  process.stderr.write(`${h instanceof Error ? h.message : String(h)}\n`);
  process.exitCode = 1;
});
