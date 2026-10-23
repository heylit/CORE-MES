import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { HESAPLAR } from '../../hesaplar.ts';
import { haritaUclariniOku, ornekYol, oturumluYazmalar, yetkisizYazmalar } from '../harita-uclari.ts';
import { oturumsuzIstemci, senaryo } from '../senaryo.ts';
import type { HaritaUcu } from '../harita-uclari.ts';
import type { SenaryoBaglami } from '../senaryo.ts';
import type { Hesap } from '../../hesaplar.ts';

const DEPO_KOKU = fileURLToPath(new URL('../../../', import.meta.url));
// İlk gün bütün liste denenir; sonraki günler tohumlu örnekle: liste bir koşuda değişmez, yük günlere yayılmaz.
const GUNLUK_ORNEK = 20;

// Uç listesi koşu başına bir kez, haritanın kendi çıktısından alınır: sunucu kodu ithal edilmez, liste elle yazılmaz.
let haritaSozu: Promise<HaritaUcu[]> | null = null;
function haritaUclari(): Promise<HaritaUcu[]> {
  haritaSozu ??= promisify(execFile)(process.execPath, ['araclar/harita.ts'], { cwd: DEPO_KOKU, maxBuffer: 64 * 1024 * 1024 })
    .then(({ stdout }) => haritaUclariniOku(stdout));
  return haritaSozu;
}

function ornekle<T>(b: SenaryoBaglami, liste: readonly T[]): T[] {
  if (b.gun === 1 || liste.length <= GUNLUK_ORNEK) return [...liste];
  const kalan = [...liste];
  return Array.from({ length: GUNLUK_ORNEK }, () => kalan.splice(b.rastgele.aralik(0, kalan.length - 1), 1)[0] as T);
}

const islemleriOku = (govde: unknown): string[] | null => {
  const k = (govde as { kullanici?: { islemler?: unknown } } | null)?.kullanici;
  return Array.isArray(k?.islemler) && k.islemler.every((i) => typeof i === 'string') ? k.islemler : null;
};

async function rolTaramasi(b: SenaryoBaglami, rol: Hesap, uclar: readonly HaritaUcu[]): Promise<void> {
  const oturum = await b.bekle(rol, 'yetki: oturumu oku', 'GET', '/api/oturum', 200);
  if (oturum === null) return;
  const islemler = islemleriOku(oturum);
  if (islemler === null) {
    await b.adim(rol, 'yetki: işlem listesi', () => Promise.resolve({ sonuc: 'dustu', ileti: 'oturum cevabında işlem listesi yok' }));
    return;
  }
  const denenecek = yetkisizYazmalar(uclar, islemler);
  await b.adim(rol, 'yetki: yetkisiz yazma listesi', () => Promise.resolve({ ileti: `${String(denenecek.length)} uç` }));
  for (const u of ornekle(b, denenecek)) {
    await b.bekle(rol, `yetki: ${u.yontem} ${u.yol} reddedilir`, u.yontem, `/api${ornekYol(u.yol)}`, 403, {});
  }
}

// Kayıttaki rol alanı Hesap'tır: oturumsuz adımlar ilk role yazılır, adım adı "oturumsuz" ile ayrılır.
async function oturumsuzTarama(b: SenaryoBaglami, uclar: readonly HaritaUcu[]): Promise<void> {
  const istemci = oturumsuzIstemci();
  for (const u of ornekle(b, oturumluYazmalar(uclar))) {
    const yol = `/api${ornekYol(u.yol)}`;
    await b.adim(HESAPLAR[0], `yetki: oturumsuz ${u.yontem} ${u.yol} reddedilir`, async () => {
      const c = await istemci.istek(u.yontem, yol, {});
      const ortak = { yontem: u.yontem, yol, beklenen: '401', gelen: String(c.durum) };
      return c.durum === 401 ? ortak : { ...ortak, sonuc: 'dustu', ileti: JSON.stringify(c.govde).slice(0, 400) };
    });
  }
}

// Her rol yetkisi olmayan yazma uçlarını dener (403), çerezsiz istek oturum isteyen yazma uçlarını dener (401).
export default senaryo({
  ad: 'yetki',
  roller: HESAPLAR,
  kopya: 1,
  async kos(b) {
    let uclar: HaritaUcu[];
    try {
      uclar = await haritaUclari();
    } catch (hata) {
      await b.adim(HESAPLAR[0], 'yetki: uç listesini oku', () => Promise.resolve({
        sonuc: 'dustu', ileti: hata instanceof Error ? hata.message.slice(0, 400) : String(hata),
      }));
      return;
    }
    await Promise.all([...HESAPLAR.map((h) => rolTaramasi(b, h, uclar)), oturumsuzTarama(b, uclar)]);
  },
});
