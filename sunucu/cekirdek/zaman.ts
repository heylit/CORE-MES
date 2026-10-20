// Zaman sütununu (timestamptz) sözleşmenin beklediği metne çeviren tek yol: `SELECT ${zamanMetni('e.acilma')} AS acilma`.
// Çıktı saat dilimi bilgili ISO 8601'dir (`#paylasilan/zaman.ts` `zamanSemasi`); NULL NULL kalır. Sürücü varsayılanı
// zamanı Date nesnesine çevirir: mikrosaniyeyi yitirir ve cevap şemasından (metin) geçmez.
// `ifade` modülün sabit SQL parçasıdır (sütun ya da ifade); istekten gelen değer buraya yazılmaz.
// `json_build_object` ve `json_agg` içindeki zaman kendiliğinden aynı biçimde çıkar, orada sarılmaz.
// Tarih (date) için sarmalayıcı yoktur: sürücü ayarı onu 'YYYY-AA-GG' metni döndürür.
export const zamanMetni = (ifade: string): string => `to_json(${ifade}) #>> '{}'`;
