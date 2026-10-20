-- Plan önceliği (177-179 a): gecikme bedeli sipariş tutarı x günlük ceza oranıdır, tavan tutarın yüzdesidir. İkisi de boş olabilir;
-- boşsa plan taban bedel kullanır ve uyarır. Tablo canlıda boştur.
ALTER TABLE siparisler_siparis
  ADD COLUMN gecikme_ceza_orani numeric(6,3) CONSTRAINT siparisler_siparis_gecikme_ceza_orani CHECK (gecikme_ceza_orani BETWEEN 0 AND 100),
  ADD COLUMN ceza_tavani_orani numeric(5,2) CONSTRAINT siparisler_siparis_ceza_tavani_orani CHECK (ceza_tavani_orani BETWEEN 0 AND 100);
