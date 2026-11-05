// Klasör yetkisini değiştirmek ayrı işlemdir ve yalnız yönetici rolündedir (ADR 0030, 2); okuma, yükleme ve arşiv klasör düzeyidir.
export const ORTAK_DOSYALAR_ISLEMLERI = ['ortak-dosyalar.yetki-ver'] as const;
