// Geometri hesap süreci (1427 a): ana sunucu `surec.ts` ile fork eder; ağa açılmaz, veritabanına bağlanmaz, yalnız IPC ile dosya alır,
// ölçü döner. STEP/IGES güvenilmeyen girdidir: çökmesi ya da asılması ana sunucuyu durdurmaz, yöneten süreç öldürüp yeniden açar.
import { createRequire } from 'node:module';
import { agOlcumu, ILETILER } from './kurallar.ts';
import type { DosyaTuru, UcgenAgi } from './kurallar.ts';
import type { HesapIstegi, HesapYaniti } from './surec.ts';

interface OcctAgi { attributes: { position: { array: ArrayLike<number> } }; index?: { array: ArrayLike<number> } }
interface OcctSonucu { success: boolean; meshes: OcctAgi[] }
interface Occt {
  ReadStepFile(veri: Uint8Array, ayar: object | null): OcctSonucu;
  ReadIgesFile(veri: Uint8Array, ayar: object | null): OcctSonucu;
}

// Ağ inceliği kutu köşegenine oranla; ölçüm için yeterli, hacmin yaklaşıklığını belirler.
const AYAR = { linearUnit: 'millimeter', linearDeflectionType: 'bounding_box_ratio', linearDeflection: 0.001, angularDeflection: 0.5 };

let motor: Promise<Occt> | null = null;
function occt(): Promise<Occt> {
  if (motor === null) {
    const yukle = createRequire(import.meta.url)('occt-import-js') as () => Promise<Occt>;
    motor = yukle();
  }
  return motor;
}

async function hesapla(tur: DosyaTuru, veri: Uint8Array): Promise<HesapYaniti> {
  const baslangic = performance.now();
  const o = await occt();
  let sonuc: OcctSonucu;
  try {
    sonuc = tur === 'step' ? o.ReadStepFile(veri, AYAR) : o.ReadIgesFile(veri, AYAR);
  } catch {
    return { tamam: false, kalici: true, hata: ILETILER.okunamadi, bellek: process.memoryUsage().rss };
  }
  if (!sonuc.success) return { tamam: false, kalici: true, hata: ILETILER.okunamadi, bellek: process.memoryUsage().rss };
  const aglar: UcgenAgi[] = sonuc.meshes.map((m) => ({ konum: m.attributes.position.array, indeks: m.index?.array ?? [] }));
  const olcum = agOlcumu(aglar);
  if (olcum === null) return { tamam: false, kalici: true, hata: ILETILER.bosModel, bellek: process.memoryUsage().rss };
  return { tamam: true, olcum, sureMs: Math.round(performance.now() - baslangic), bellek: process.memoryUsage().rss };
}

process.on('message', (ileti: HesapIstegi) => {
  void hesapla(ileti.tur, ileti.veri).then(
    (yanit) => process.send?.({ ...yanit, kimlik: ileti.kimlik }),
    () => process.send?.({ tamam: false, kalici: true, hata: ILETILER.okunamadi, bellek: process.memoryUsage().rss, kimlik: ileti.kimlik }),
  );
});
// Ana süreç kapanınca kanal kopar: bu süreç de kapanır, öksüz kalmaz.
process.on('disconnect', () => process.exit(0));
