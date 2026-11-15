-- Hazırlık listesi maddesinin kontrol noktası (3249-2 a): ölçüm, fotoğraf ya da seçim maddesi türünü ve ayarını (sınırlar, seçenekler,
-- açıklama) emir anında kopyalar; Adım Durumu kanıtı buna göre ister. Boş olabilen sütundur: var olan satırlar değişmez ve onay
-- maddesi sayılır, sütun eklemek satır tetiğini (emir_adimi_degismez) çalıştırmaz. Ayarın biçimini sunucu rota sözleşmesiyle denetler.
ALTER TABLE emir_adimi
  ADD COLUMN kontrol jsonb
    CONSTRAINT emir_adimi_kontrol_turu CHECK (
      kontrol IS NULL OR (jsonb_typeof(kontrol) = 'object' AND kontrol->>'tur' IN ('onay', 'olcum', 'foto', 'secim'))
    );
