-- Maliyet anahtarları sahibi modüllerin kaydına bağlanır (kart #1187). Tablolar bu göçten önce boştur; bağ bu yüzden doğrudan eklenir.
ALTER TABLE finans_malzeme_maliyet
  ADD CONSTRAINT finans_malzeme_maliyet_malzeme FOREIGN KEY (malzeme_no) REFERENCES malzeme_katalog_karti (no);
ALTER TABLE finans_istasyon_maliyet
  ADD CONSTRAINT finans_istasyon_maliyet_istasyon FOREIGN KEY (istasyon_id) REFERENCES istasyon (id);
ALTER TABLE finans_kisi_maliyet
  ADD CONSTRAINT finans_kisi_maliyet_kisi FOREIGN KEY (kisi_id) REFERENCES kisi (id);
