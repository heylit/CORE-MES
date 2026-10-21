// HiGHS (highs 1.15.3, MIT; 361 b) planlama çerçevesine kabuktan verilir: çerçevenin politikası her isteği kapatır, wasm dosyasını
// kendisi okuyamaz. Betik ve ikili yalnız çerçeve isteyince, bir kez yüklenir; çerçeve onları kendi iş parçacığında kurar.
// Paket dışa yalnız ES modülü derlemesini ve wasm'ı açar; çerçeve politikasında modül iş parçacığı açılmaz (blob: modül betiği
// reddedilir), betik klasik iş parçacığına çevrilir: modül sözdizimi yalnız sondaki dışa aktarma ve import.meta.url'dir.
export interface HighsKaynagi { betik: string; wasm: ArrayBuffer }

const DISA_AKTARMA = 'export default Module;';
export function klasikBetik(modul: string): string {
  const govde = modul.trimEnd();
  if (!govde.endsWith(DISA_AKTARMA) || govde.indexOf(DISA_AKTARMA) !== govde.length - DISA_AKTARMA.length) throw new Error('HiGHS betiği beklenen biçimde değil.');
  const klasik = govde.slice(0, -DISA_AKTARMA.length).replaceAll('import.meta.url', 'self.location.href');
  if (/\bimport\.meta\b|^\s*(?:import|export)\s/m.test(klasik)) throw new Error('HiGHS betiği beklenen biçimde değil.');
  return klasik;
}

let yukleniyor: Promise<HighsKaynagi> | null = null;

async function yukle(): Promise<HighsKaynagi> {
  const [betik, adres] = await Promise.all([import('highs?raw'), import('highs/runtime?url')]);
  const cevap = await fetch(adres.default);
  if (!cevap.ok) throw new Error('HiGHS yüklenemedi.');
  return { betik: klasikBetik(betik.default), wasm: await cevap.arrayBuffer() };
}

// İleti ikiliyi kopyalar; önbellekteki ikili çerçeveye giden her kopyadan sonra da sağlam kalır.
export function highsYukle(): Promise<HighsKaynagi> {
  yukleniyor ??= yukle();
  yukleniyor.catch(() => { yukleniyor = null; });
  return yukleniyor;
}
