// Başka modül ekranlarının ithal edebildiği tek dosya (597 a, 616 b): Arkon kalite istasyonu ve Hazırlık teknik resmi ortak çizim parçasıyla
// (istemci/src/ortak/cizim) gösterir; Kalite Merkezi'nin balon ve ölçüm kaydını o parçanın biçimine buradaki çeviriciler çevirir.
// Plan ve balon yazımı burada değildir; ölçüm ve numune kararı sunucudaki kalite-merkezi/disari.ts ile yazılır.
export { cizimBalonu, cizimOlcumleri, sonOlcumler } from './studyo/kurallar.ts';
export { useEmirNumuneleri, useEmirOlcumleri, useResimDosyasi, useStudyoParcasi } from './studyo/veri.ts';
// Kalite formu (798): Arkon terminali "Ölç" ile aynı formu açar; ölçüm tek kayıttır, yazımı açan verir.
export { KaliteFormu, type OlcumYazici, type OlcumYazimi } from './studyo/KaliteFormu.tsx';
// 2196: kalite istasyonu terminali Bugün kararlarını ve "terminalde doldurulur" işaretli formları buradan alır; uç ve yetki aynıdır.
export {
  adimEksigi, bosIcerik, formAdimlari, kararEksigi, KM_CIDDIYETLER, terminalFormEksikleri, terminalFormKaydi, terminalFormSonucu,
  useKaliteKarari, useKaliteKuyrugu, useTerminalFormlari,
  type Ciddiyet, type FormAdimi, type FormBaglami, type GerekceliKarar, type GirisBekleyeni, type HataliBekleyeni, type HataliKarari,
  type IlkParcaBekleyeni, type KaliteKarari, type KaliteKuyrugu, type TerminalFormlari, type TerminalFormu,
} from './terminal.ts';
export { LISTE_YANITLARI, type FormIcerigi, type ListeYaniti } from './yeni/formlar/dsl.ts';
export type { FormKaydi } from './yeni/tipler.ts';
