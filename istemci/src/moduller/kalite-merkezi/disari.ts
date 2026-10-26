// Başka modül ekranlarının ithal edebildiği tek dosya (597 a, 616 b): Arkon kalite istasyonu ve Hazırlık teknik resmi ortak çizim parçasıyla
// (istemci/src/ortak/cizim) gösterir; Kalite Merkezi'nin balon ve ölçüm kaydını o parçanın biçimine buradaki çeviriciler çevirir.
// Plan ve balon yazımı burada değildir; ölçüm ve numune kararı sunucudaki kalite-merkezi/disari.ts ile yazılır.
export { cizimBalonu, cizimOlcumleri, sonOlcumler } from './studyo/kurallar.ts';
export { useEmirNumuneleri, useEmirOlcumleri, useResimDosyasi, useStudyoParcasi } from './studyo/veri.ts';
