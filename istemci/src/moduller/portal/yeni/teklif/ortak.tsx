import type { ReactNode } from 'react';
import { Rozet, type RozetTonu } from '../../../../ortak/arayuz/index.ts';
import { kalanGun, para, sayi, sureMetni, tarih, tarihSaat, YOK } from '../bicim.ts';
import { talepDurumu, teklifTutari, type Ton } from '../kurallar.ts';
import type { Depo, Firma, Gecmis, Kalem, ParaBirimi, TeklifSurumu, TeklifTalebi } from '../tipler.ts';
import { kaydet } from '../veri.ts';

// Müşteri teklifleri parçasının ortak parçaları: kaydın ekranın okuduğu alanları, durum adları, kalem ve teklif tabloları.

// Belgede duran ama ortak tipte yazılmayan alanlar (prototip requests). Değişiklik isteği iskelet yazarına gider; o güne kadar burada.
export interface Surum extends TeklifSurumu {
  deliveryDays?: number;
  payment?: string;
  note?: string;
}

export interface Talep extends Omit<TeklifTalebi, 'versions'> {
  versions?: Surum[];
  currency?: ParaBirimi;
  neededBy?: string;
  note?: string;
  photos?: string[];
  revisionNote?: string;
  rejectNote?: string;
  orderId?: string;
  acceptedAt?: string;
}

export const talepler = (d: Depo): Talep[] => Object.values(d.requests) as Talep[];
export const talep = (d: Depo, id: string | null): Talep | null => (id === null ? null : (d.requests[id] as Talep | undefined) ?? null);

// Talep belgesi bütün yazılır; ortak tipte olmayan alanlar da gövdede kalır.
export const talepYaz = (q: Omit<Talep, 'surum'> & { surum?: number }) => kaydet('requests', q as Omit<TeklifTalebi, 'surum'> & { surum?: number });

export const sonSurumu = (q: Talep): Surum | null => q.versions?.[q.versions.length - 1] ?? null;

// Prototipin ödeme koşulları ve birimleri (portal.html PAY, UNITS).
export const ODEME_KOSULLARI = ['Peşin', '30 gün vadeli', '45 gün vadeli', '60 gün vadeli', '90 gün vadeli'] as const;
export const BIRIMLER = ['adet', 'kg', 'ton', 'm', 'm²', 'rulo', 'takım', 'litre'] as const;
export const VARSAYILAN_VADE = 30;
export const GECERLILIK_GUNU = 15;
export const TESLIM_GUNU = 21;

// Firma tarafının durum adları (prototip REQ_FIRM).
export const DURUM_ADLARI: Readonly<Record<ReturnType<typeof talepDurumu>, readonly [string, Ton]>> = {
  new: ['Yeni talep', 'uyari'], quoted: ['Teklif gönderildi', 'bilgi'], revision: ['Revizyon istendi', 'uyari'], accepted: ['Kabul edildi', 'iyi'],
  ordered: ['Siparişe dönüştü', 'iyi'], rejected: ['Reddedildi', 'hata'], expired: ['Süresi doldu', 'notr'], cancelled: ['İptal edildi', 'notr'],
};

const ROZET: Readonly<Record<Ton, RozetTonu>> = { iyi: 'tamam', uyari: 'uyari', hata: 'hata', bilgi: 'bilgi', notr: 'pasif' };
export const rozetTonu = (t: Ton): RozetTonu => ROZET[t];

export function DurumRozeti({ q, simdi }: { q: Talep; simdi: number }) {
  const [ad, ton] = DURUM_ADLARI[talepDurumu(q as TeklifTalebi, simdi)];
  return <Rozet ton={rozetTonu(ton)}>{ad}</Rozet>;
}

export const tutar = (q: Talep, v: Surum) => teklifTutari(q.items, v.prices, v.discount);

// Müşteri adları sıralı (prototip partiesOf).
export const musteriler = (d: Depo): Firma[] =>
  Object.values(d.parties).filter((p) => p.type === 'customer').sort((a, b) => a.name.localeCompare(b.name, 'tr'));

export function KalemTablosu({ kalemler, birim, fiyatlar }: { kalemler: readonly Kalem[]; birim?: string; fiyatlar?: readonly (number | null)[] }) {
  return (
    <div className="tc-pt-teklif-kaydir">
      <table className="tc-pt-teklif-tablo">
        <thead>
          <tr>
            <th>Kalem</th>
            <th className="tc-pt-teklif-sag">Miktar</th>
            {fiyatlar && <><th className="tc-pt-teklif-sag">Birim fiyat</th><th className="tc-pt-teklif-sag">Tutar</th></>}
          </tr>
        </thead>
        <tbody>
          {kalemler.map((k, i) => {
            const f = fiyatlar?.[i] ?? null;
            return (
              <tr key={`${k.name}-${String(i)}`}>
                <td><span className="tc-pt-teklif-ad">{k.name}</span>{k.spec && <small>{k.spec}</small>}</td>
                <td className="tc-pt-teklif-sag tc-pt-teklif-kirilmaz">{`${sayi(k.qty)} ${k.unit}`}</td>
                {fiyatlar && (
                  <>
                    <td className="tc-pt-teklif-sag tc-pt-teklif-kirilmaz">{para(f, birim)}</td>
                    <td className="tc-pt-teklif-sag tc-pt-teklif-kirilmaz">{f === null ? YOK : para(k.qty * f, birim)}</td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Teklif sayfası (prototip quoteSheet): bir sürümün fiyatları, toplamları, koşulları ve önceki sürüme göre farkı.
export function TeklifSayfasi({ q, v, onceki, simdi }: { q: Talep; v: Surum; onceki?: Surum | undefined; simdi: number }) {
  const c = tutar(q, v);
  const birim = q.currency;
  const kalan = kalanGun(v.validUntil, simdi);
  let fark: ReactNode = null;
  if (onceki) {
    const p = tutar(q, onceki).net;
    const d = c.net - p;
    if (Number.isFinite(d) && Math.abs(d) > 0.005) {
      const isaret = d < 0 ? '' : '+';
      fark = (
        <p className="tc-pt-teklif-fark" data-yon={d < 0 ? 'asagi' : 'yukari'}>
          {`Sürüm ${String(onceki.v)}'e göre ${isaret}${sayi((d / p) * 100)}% (${isaret}${para(d, birim)})`}
        </p>
      );
    }
  }
  return (
    <section className="tc-pt-teklif-sayfa" aria-label={`Teklif sürüm ${String(v.v)}`}>
      <header className="tc-pt-teklif-sayfa-bas">
        <div><small>{`Teklif ${q.no}`}</small><b>{`Sürüm ${String(v.v)}`}</b></div>
        <div><small>Düzenlenme</small>{tarih(v.createdAt)}</div>
      </header>
      <KalemTablosu kalemler={q.items} birim={birim} fiyatlar={v.prices} />
      <dl className="tc-pt-teklif-toplam">
        <dt>Ara toplam</dt><dd>{para(c.sub, birim)}</dd>
        {Number(v.discount) ? <><dt>{`İskonto (%${sayi(v.discount)})`}</dt><dd>{`−${para(c.disc, birim)}`}</dd></> : null}
        <dt>KDV hariç toplam</dt><dd>{para(c.net, birim)}</dd>
        <dt>KDV (%20)</dt><dd>{para(c.kdv, birim)}</dd>
        <dt className="tc-pt-teklif-genel">Genel toplam</dt><dd className="tc-pt-teklif-genel">{para(c.grand, birim)}</dd>
      </dl>
      <div className="tc-pt-teklif-kosullar">
        <div><span>Teslim süresi </span>{v.deliveryDays === undefined ? YOK : `${String(v.deliveryDays)} gün`}</div>
        <div><span>Ödeme </span>{v.payment ?? YOK}</div>
        <div>
          <span>Geçerlilik </span>
          {`${tarih(v.validUntil)} ${kalan !== null && kalan >= 0 ? `(${sureMetni(v.validUntil, simdi)})` : '(süresi doldu)'}`}
        </div>
      </div>
      {v.note && <p className="tc-pt-teklif-not">{v.note}</p>}
      {fark}
    </section>
  );
}

// Yarım kalan form, oturum boyunca görünümler arası korunur (prototip drafts); gönderilince silinir.
const taslaklar = new Map<string, unknown>();
export const taslakOku = <T,>(anahtar: string): T | undefined => taslaklar.get(anahtar) as T | undefined;
export const taslakYaz = (anahtar: string, deger: unknown): void => { taslaklar.set(anahtar, deger); };
export const taslakSil = (anahtar: string): void => { taslaklar.delete(anahtar); };
export const taslaklariSil = (): void => { taslaklar.clear(); };

// İşlem geçmişi (prototip timeline): yeniden eskiye, yapan kişi ve firma.
export function IslemGecmisi({ gecmis, yapan }: { gecmis: readonly Gecmis[] | undefined; yapan: (h: Gecmis) => string }) {
  if (!gecmis || gecmis.length === 0) return null;
  const sirali = [...gecmis].sort((a, b) => b.at.localeCompare(a.at));
  return (
    <section className="tc-pt-pano" aria-labelledby="tc-pt-teklif-gecmis">
      <header className="tc-pt-pano-bas"><h3 id="tc-pt-teklif-gecmis">İşlem geçmişi</h3></header>
      <ul className="tc-pt-teklif-gecmis">
        {sirali.map((h, i) => <li key={`${h.at}-${String(i)}`}>{h.text}<small>{`${yapan(h)}, ${tarihSaat(h.at)}`}</small></li>)}
      </ul>
    </section>
  );
}
