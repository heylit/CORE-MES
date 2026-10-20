import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Koşu dosyaları depo dışında durur: parola, oturum çerezleri ve hata görüntüleri depoya girmez.
export const CALISMA_KLASORU = join(tmpdir(), 'tmiv2-ekran');
export const HESAP_DOSYASI = join(CALISMA_KLASORU, 'hesaplar.json');
export const oturumDosyasi = (hesap: string): string => join(CALISMA_KLASORU, `oturum-${hesap}.json`);
