import { Link } from 'react-router-dom';
import { DurumKutusu } from '../../../ortak/arayuz/index.ts';
import type { Depo } from './tipler.ts';

// Soru 230 a: sahibinin ekranı olan iş yeni ekrana taşınmaz; salt okunur özet ve "sahibinde aç". Portal kayıtları portalın kendi
// belge deposundadır, sahip modülün kaydı değildir: bağlantı kayda değil sahibin listesine gider. Sahibinin ekranı olmayan iş
// (çek, cari, mutabakat, karne, RFQ, firma kartı, sözleşme, yönetim, fiyat talebi) eski portal ekranında kalır.

export interface Sahip { yol: string; ad: string }

// Eski çerçevenin yolu (PortalCercevesi KOK); çerçeve modülü buraya çekilmesin diye ayrıca yazılır.
const ESKI_PORTAL = '/portal';

const SIPARISLER: Sahip = { yol: '/siparisler', ad: 'Siparişler' };
const SATIN_ALMA: Sahip = { yol: '/satin-alma', ad: 'Satın alma' };
const ESKI: Sahip = { yol: ESKI_PORTAL, ad: 'Müşteri ve Tedarikçi Portalı (eski ekran)' };

// Sipariş görünümünün sahibi türüne göre ayrılır; tür bilinmiyorsa eski ekran.
export function sahibi(gorunum: string, tur?: string | null): Sahip {
  if (gorunum === 'sorders') return SIPARISLER;
  if (gorunum === 'porders') return SATIN_ALMA;
  if (gorunum === 'order' || gorunum === 'neworder') return tur === 'sales' ? SIPARISLER : tur === 'purchase' ? SATIN_ALMA : ESKI;
  return ESKI;
}

// İş merkezindeki işin türü: sipariş kaydından okunur, yeni siparişte prototip türü kimlik yerine verir.
export function isTuru(d: Depo, gorunum: string, id: string | undefined | null): string | null {
  if (gorunum === 'order') return id ? d.orders[id]?.type ?? null : null;
  if (gorunum === 'neworder') return id ?? null;
  return null;
}

export function SahibindeAc({ gorunum, tur }: { gorunum: string; tur?: string | null }) {
  const s = sahibi(gorunum, tur);
  return (
    <DurumKutusu durum="bos" mesaj={`Bu iş ${s.ad} ekranında yapılır.`}>
      <Link className="tc-pt-sahip" to={s.yol}>{`${s.ad} ekranında aç`}</Link>
    </DurumKutusu>
  );
}
