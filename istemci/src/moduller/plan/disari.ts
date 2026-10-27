// Başka modül ekranlarının ithal edebildiği tek dosya.

// 542 a, 546 a: Satın Alma menüsünün malzeme satın alma planı ve fason planı sayfaları. Özellik almazlar; veriyi kendileri okur
// (GET /plan/planlama-calismasi/satin-alma), salt okunurdur.
export { SatinAlmaFasonPlani, SatinAlmaMalzemePlani } from './planlama/satin-alma/SatinAlmaPlanlari.tsx';

// 933 a: Projeler ekranının "Plan" sekmesi. Projeyi okuyan görür; veriyi kendisi okur (GET /plan/projeler/:projeId/plan-gerceklesen), salt okunurdur.
export { ProjePlani } from './proje/ProjePlani.tsx';
