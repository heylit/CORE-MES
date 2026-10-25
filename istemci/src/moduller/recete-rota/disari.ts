// Başka modül ekranlarının ithal edebildiği tek dosya.

// 542 a, 546 a: Satın Alma menüsünün malzeme satın alma planı ve fason planı sayfaları. Özellik almazlar; veriyi kendileri okur
// (GET /recete-rota/planlama-calismasi/satin-alma), salt okunurdur.
export { SatinAlmaFasonPlani, SatinAlmaMalzemePlani } from './planlama-yeni/satin-alma/SatinAlmaPlanlari.tsx';
