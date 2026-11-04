// Talep açmak ayrı işlemdir: talep eden satın almacı değildir. Teslim alma bu modülde yoktur: mal kabul stokta, kalite GKK'da.
// ayar: satın almanın kendi ayarları (kurlar, ağırlıklar, birimler, onay limitleri, kategoriler).
// fatura-bagla: alış faturasını siparişe bağlar, satın alma kaydı yazmaz (muhasebe, 2077-3 a).
export const SATIN_ALMA_ISLEMLERI = [
  'satin-alma.oku', 'satin-alma.talep-ac', 'satin-alma.yaz', 'satin-alma.onayla', 'satin-alma.ayar', 'satin-alma.fatura-bagla',
] as const;
