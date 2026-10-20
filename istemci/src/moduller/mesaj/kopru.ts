import type {
  BelgeCevabi, EkCevabi, EkIcerikCevabi, KilitCevabi, KisilerCevabi, OdaCevabi, SorguCevabi,
} from '#paylasilan/sozlesme/mesaj.ts';
import { api, ApiHatasi } from '../../ortak/veri/api.ts';

// Çerçevedeki köprünün istekleri (kanal "mesaj") TMI uçlarına çevrilir. Kural ve yetki sunucudadır; burası yalnız taşır ve
// yalnız bilinen istek türlerini geçirir.
export type KopruIsleyici = (tip: string, veri: unknown) => Promise<unknown>;
export interface KopruHatasi { hata: string; durum: number }

type Nesne = Record<string, unknown>;
const nesne = (v: unknown): Nesne => (v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Nesne : {});
const metin = (v: unknown, alan: string): string => {
  if (typeof v !== 'string' || v === '') throw new Error(`Geçersiz ${alan}.`);
  return v;
};
const q = encodeURIComponent;

export function kopruKur(): KopruIsleyici {
  return async (tip, veri) => {
    const v = nesne(veri);
    switch (tip) {
      case 'damga':
        return api.get<{ damga: number }>('/mesaj/damga');
      case 'db-sorgu': {
        const p = new URLSearchParams({ koleksiyon: metin(v['koleksiyon'], 'koleksiyon') });
        if (Array.isArray(v['filtreler'])) p.set('filtreler', JSON.stringify(v['filtreler']));
        if (v['sira'] !== undefined) p.set('sira', JSON.stringify(v['sira']));
        if (typeof v['sinir'] === 'number') p.set('sinir', String(v['sinir']));
        return api.get<SorguCevabi>(`/mesaj/sorgu?${p.toString()}`);
      }
      case 'db-getir':
        return api.get<BelgeCevabi>(`/mesaj/belge?yol=${q(metin(v['yol'], 'yol'))}`);
      case 'db-yaz':
        return api.post<BelgeCevabi>('/mesaj/belge/yaz', {
          yol: metin(v['yol'], 'yol'), veri: nesne(v['veri']), kip: v['kip'] === 'birlestir' ? 'birlestir' : 'tam',
          ...(v['beklenenSurum'] === undefined ? {} : { beklenenSurum: v['beklenenSurum'] }),
        });
      case 'db-sil':
        return api.post<{ silindi: boolean }>('/mesaj/belge/sil', { yol: metin(v['yol'], 'yol') });
      case 'db-kilit':
        return api.post<KilitCevabi>('/mesaj/belge/kilitle', {
          yol: metin(v['yol'], 'yol'), sahip: metin(v['sahip'], 'sahip'), sureMs: v['sureMs'], ...(v['veri'] === undefined ? {} : { veri: nesne(v['veri']) }),
        });
      case 'kisiler':
        return api.get<KisilerCevabi>('/mesaj/kisiler');
      case 'oda': {
        const durum = nesne(v['durum']);
        return api.get<OdaCevabi>(`/mesaj/oda${Object.keys(durum).length > 0 ? `?durum=${q(JSON.stringify(durum))}` : ''}`);
      }
      case 'ek-yukle':
        return api.post<EkCevabi>('/mesaj/ekler/yukle', { ad: metin(v['ad'], 'ad'), tur: metin(v['tur'], 'tür'), veri: metin(v['veri'], 'veri') });
      case 'ek-oku': {
        const id = metin(v['id'], 'kimlik');
        if (!/^[0-9a-f]{32}$/.test(id)) throw new Error('Geçersiz kimlik.');
        return api.get<EkIcerikCevabi>(`/mesaj/ekler/${id}`);
      }
      default:
        throw new Error(`Bilinmeyen istek: ${tip}`);
    }
  };
}

// Sunucu iletisi ve durum kodu çerçeveye taşınır (köprü durum kodunu depo hata koduna çevirir); ağ hatasının tarayıcı metni
// gösterilmez.
export function kopruHatasi(hata: unknown): KopruHatasi {
  if (hata instanceof ApiHatasi) return { hata: hata.sunucuIletisi ?? 'İşlem yapılamadı.', durum: hata.durum };
  if (hata instanceof Error && /^(Geçersiz|Bilinmeyen)/.test(hata.message)) return { hata: hata.message, durum: 400 };
  return { hata: 'Sunucuya ulaşılamadı. Bağlantıyı denetleyip yeniden deneyin.', durum: 0 };
}
