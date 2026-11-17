-- 3391-2 a: cari birden fazla Logo CRM satış müşterisine bağlıysa tekliflerde kullanılacak kod CORE'da seçilir; Logo'ya yazılmaz.
-- Boş sütun eklenir, var olan satır değişmez. Seçim yalnız Logo cari kodu olan firmada durur.
ALTER TABLE musteri_tedarikci_firma
  ADD COLUMN logo_crm_kodu text
    CONSTRAINT musteri_tedarikci_firma_logo_crm_kodu_bicim CHECK (btrim(logo_crm_kodu) = logo_crm_kodu AND length(logo_crm_kodu) BETWEEN 1 AND 40),
  ADD CONSTRAINT musteri_tedarikci_firma_logo_crm_carili CHECK (logo_crm_kodu IS NULL OR logo_cari_kodu IS NOT NULL);
