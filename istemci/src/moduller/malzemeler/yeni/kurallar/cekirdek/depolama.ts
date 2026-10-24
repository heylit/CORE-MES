import { Store } from './durum.ts';
import { renderCatalog } from './ortam.ts';

// Yakalanan hata her biçimde gelebilir (sunucu reddi, depo hatası, Error).
export interface DepoHatasi { code?: string; message?: string; sunucu?: boolean; [alan: string]: unknown }
export function storeErr(hata: unknown): string | undefined {
    // Okunan yalnız seçmeli alanlardır; null dışındaki her değerde okuma güvenlidir.
    const e = hata as DepoHatasi | null | undefined;
    const c = e && e.code;
    if (c === 'cakisma' || c === 'kategori-yok' || c === 'gerekce-kisa')
        return e!.message;
    // Sunucunun ret nedeni (yetki yok, kart değişmiş, talep başkasının) olduğu gibi gösterilir (#234 madde 18).
    if (e && e.sunucu && e.message)
        return e.message;
    if (c === 'invalid_argument') {
        Store.ro = true;
        renderCatalog();
        return 'Bu katalogda değişiklik yapma iznin yok; yalnızca görüntüleyebilirsin.';
    }
    if (c === 'quota_exceeded')
        return 'Katalog depolama sınırına ulaştı. Bazı kayıtları silip tekrar dene.';
    if (c === 'revoked')
        return 'Kataloğa erişim kapandı.';
    return 'Kayıt yapılamadı, birazdan tekrar dene.';
}