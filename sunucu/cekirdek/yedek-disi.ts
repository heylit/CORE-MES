// Yedekte satırları alınmayan tablolar (ADR 0032; 2339-S CEO kararı a): tablo yapısı yedeğe girer, satırları girmez. Hepsi türetilmiş
// veridir; sahibi modül geri yüklemeden sonra boş tabloyu kendi işiyle yeniden doldurur. Liste çekirdektedir: yedek `ayarlar` modülündedir,
// alt katta olduğu için sahibi modülü ithal edemez (ADR 0006). Ad şemasız yazılır; yedek şemayla tam adı kurar.
export const YEDEKTE_VERISI_ALINMAYAN_TABLOLAR: readonly string[] = ['arkon_pdf_goruntu'];
