// CNC Kurulum'un ham ekranı malzemenin 3B analizini ve ham önerisini buradan okur (1703 a). Yetki denetlemez: çağıran kendi
// okuma işlemini ister; geometri.oku istenmez.
export { malzemeGeometrisi } from './servis.ts';
export type { MalzemeGeometrisi } from './servis.ts';
// Yüzey işaretlemenin işlem listesi (kart 2144, 2140-3): rota yürürlükteki revizyonun yüzey işlemi adımlarını verir; bağı kablolama.ts kurar
// (ADR 0006 madde 6). Bağ kurulmadıysa liste boştur ve neden 'rota-bagli-degil'.
export { yuzeyAdimlariCozucusuKaydet as yuzeyAdimlariCozucusu } from './servis.ts';
export type { YuzeyAdimlariCozucusu } from './servis.ts';
export type { GeometriYuzeyAdimi } from '#paylasilan/sozlesme/geometri.ts';
// Rota talimat sahnesi (3209 a): malzemenin yayındaki 3B model revizyonları; kayıtta model sahipliği denetimi. Yetki denetlemez.
export { malzemeModelRevizyonlari } from './servis.ts';
// Terminalin 3B montaj sahnesi (3209 a): sahnenin model revizyonunun dosyası. Yetki ve sahiplik denetlemez; çağıran (arkon) iş, talimat ve
// sahne bağını, ardından modelin ürünün yayındaki modeli olduğunu denetler.
export { modelDosyasi } from './servis.ts';
