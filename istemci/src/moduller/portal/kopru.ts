import type {
  BelgeCevabi, EkCevabi, EkIcerikCevabi, KilitCevabi, KisilerCevabi, OdaCevabi, SorguCevabi,
} from '#paylasilan/sozlesme/portal.ts';
import { api, ApiHatasi } from '../../ortak/veri/api.ts';

// Çerçevedeki köprünün istekleri (kanal "portal") TMI uçlarına çevrilir. Kural ve yetki sunucudadır; burası yalnız taşır ve
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
        return api.get<{ damga: number }>('/portal/damga');
      case 'db-sorgu': {
        const p = new URLSearchParams({ koleksiyon: metin(v['koleksiyon'], 'koleksiyon') });
        if (Array.isArray(v['filtreler'])) p.set('filtreler', JSON.stringify(v['filtreler']));
        if (v['sira'] !== undefined) p.set('sira', JSON.stringify(v['sira']));
        if (typeof v['sinir'] === 'number') p.set('sinir', String(v['sinir']));
        return api.get<SorguCevabi>(`/portal/sorgu?${p.toString()}`);
      }
      case 'db-getir':
        return api.get<BelgeCevabi>(`/portal/belge?yol=${q(metin(v['yol'], 'yol'))}`);
      case 'db-yaz':
        return api.post<BelgeCevabi>('/portal/belge/yaz', {
          yol: metin(v['yol'], 'yol'), veri: nesne(v['veri']), kip: v['kip'] === 'birlestir' ? 'birlestir' : 'tam',
          ...(v['beklenenSurum'] === undefined ? {} : { beklenenSurum: v['beklenenSurum'] }),
        });
      case 'db-sil':
        return api.post<{ silindi: boolean }>('/portal/belge/sil', { yol: metin(v['yol'], 'yol') });
      case 'db-kilit':
        return api.post<KilitCevabi>('/portal/belge/kilitle', {
          yol: metin(v['yol'], 'yol'), sahip: metin(v['sahip'], 'sahip'), sureMs: v['sureMs'], ...(v['veri'] === undefined ? {} : { veri: nesne(v['veri']) }),
        });
      case 'onay-karar': {
        const kimlik = metin(v['kimlik'], 'kimlik');
        if (!/^[A-Za-z0-9_.:@~+%-]{1,128}$/.test(kimlik)) throw new Error('Geçersiz kimlik.');
        return api.post<BelgeCevabi>(`/portal/onaylar/${q(kimlik)}/karar`, { onay: v['onay'] === true, not: typeof v['not'] === 'string' ? v['not'] : '' });
      }
      case 'kisiler':
        return api.get<KisilerCevabi>('/portal/kisiler');
      case 'oda': {
        const durum = nesne(v['durum']);
        return api.get<OdaCevabi>(`/portal/oda${Object.keys(durum).length > 0 ? `?durum=${q(JSON.stringify(durum))}` : ''}`);
      }
      case 'ek-yukle':
        return api.post<EkCevabi>('/portal/ekler/yukle', { ad: metin(v['ad'], 'ad'), tur: metin(v['tur'], 'tür'), veri: metin(v['veri'], 'veri') });
      case 'ek-oku': {
        const id = metin(v['id'], 'kimlik');
        if (!/^[0-9a-f]{32}$/.test(id)) throw new Error('Geçersiz kimlik.');
        return api.get<EkIcerikCevabi>(`/portal/ekler/${id}`);
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
