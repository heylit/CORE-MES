import { Tablo, type Sutun } from '../../../ortak/arayuz/index.ts';
import { awardOrders, orderDue, supName, type OrderInfo } from '../merkez/calc.ts';
import type { IsSatiri } from '../merkez/is-tablosu.ts';
import { teslimatOf } from '../merkez/is-tablosu.ts';
import { S } from '../merkez/store.ts';
import type { PurchaseRequest, RequestItem } from '../merkez/tipler.ts';
import { fiyatKilitli, fmtDate, isNum, money, nfx } from '../merkez/util.ts';
import { IsRozeti } from './IsTablosu.tsx';

// 3798 (Öneri A): Talepler ve Siparişler satırı açılınca altında kalemleri. Bugün sayfasındaki kalem bilgisi talebin altında
// toplanır; satır seçimi (talebi açmak) değişmez.
const miktarYaz = (qty: number | null | undefined, birim: string | undefined) => (isNum(qty) ? `${nfx.format(qty)} ${birim ?? ''}`.trim() : '–');

interface TalepKalemi { it: RequestItem; siparis: OrderInfo | undefined }

export function TalepKalemleri({ r, is }: { r: PurchaseRequest; is: IsSatiri | undefined }) {
  const siparisler = awardOrders(r);
  const verildi = r.status === 'ordered' || r.status === 'received';
  const satirlar: TalepKalemi[] = (r.items ?? []).map((it) => ({ it, siparis: siparisler.find((o) => o.items.some((x) => x.id === it.id)) }));
  const teslimat = teslimatOf(r);
  const sutunlar: Sutun<TalepKalemi>[] = [
    {
      anahtar: 'kalem', baslik: 'Malzeme', kartTamSatir: true, csv: (x) => x.it.name,
      hucre: (x) => <span className="sa-ekran-govde"><span>{x.it.name}</span>{x.it.spec.trim() && <small>{x.it.spec}</small>}</span>,
    },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', kirilmaz: true, hucre: (x) => miktarYaz(x.it.qty, x.it.unit) },
    { anahtar: 'istenen', baslik: 'İstenen termin', kirilmaz: true, bossaGizle: true, hucre: (x) => { const d = x.it.istenenTermin ?? r.needDate; return d ? fmtDate(d) : null; } },
    { anahtar: 'tedarikci', baslik: 'Tedarikçi', bossaGizle: true, hucre: (x) => (x.siparis ? supName(x.siparis.q) : null) },
    { anahtar: 'teslim', baslik: verildi ? 'Sipariş termini' : 'Beklenen teslim', kirilmaz: true, bossaGizle: true, hucre: (x) => { const d = x.siparis && verildi ? orderDue(x.siparis) : teslimat.tarih; return d ? fmtDate(d) : null; } },
  ];
  return (
    <div className="sa-ekran-ayrinti">
      {is && <p className="sa-ekran-ayrinti-ust"><span>Sıradaki iş</span> <IsRozeti tur={is.tur} /></p>}
      <Tablo etiket={`${r.no} kalemleri`} sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(x) => x.it.id} bosMesaj="Kalem yok." />
    </div>
  );
}

interface SiparisKalemi { it: RequestItem; qty: number | null; birim: string; fiyat: number | null; gelen: number | null; termin: string }

/** Siparişin kalemleri: miktar, birim fiyat (fiyat görene), satır termini (boşsa siparişin) ve gelen. */
export function SiparisKalemleri({ talepId, anahtar }: { talepId: string; anahtar: string }) {
  const r = S.requests[talepId];
  const qid = anahtar.slice(talepId.length + 1);
  const o = r ? awardOrders(r).find((x) => x.qid === qid) : undefined;
  if (!r || !o) return null;
  const hatlar = (r.award?.lines ?? []).filter((l) => l.quoteId === qid);
  const satirlar: SiparisKalemi[] = o.items.map((it) => {
    const h = hatlar.find((l) => l.itemId === it.id);
    const fiyat = o.q.prices?.[it.id];
    return { it, qty: h?.qty ?? it.qty, birim: h?.unit ?? it.unit, fiyat: isNum(fiyat) ? fiyat : null, gelen: h?.received ?? null, termin: h?.expectedDate || orderDue(o) };
  });
  const sutunlar: Sutun<SiparisKalemi>[] = [
    { anahtar: 'kalem', baslik: 'Kalem', kartTamSatir: true, hucre: (x) => x.it.name },
    { anahtar: 'miktar', baslik: 'Miktar', hizala: 'sag', kirilmaz: true, hucre: (x) => miktarYaz(x.qty, x.birim) },
    ...(fiyatKilitli() ? [] : [{ anahtar: 'fiyat', baslik: 'Birim fiyat', hizala: 'sag', kirilmaz: true, hucre: (x) => (x.fiyat === null ? '–' : money(x.fiyat, o.q.currency)) } satisfies Sutun<SiparisKalemi>]),
    { anahtar: 'termin', baslik: 'Termin', kirilmaz: true, hucre: (x) => (x.termin ? fmtDate(x.termin) : '–') },
    { anahtar: 'gelen', baslik: 'Gelen', hizala: 'sag', kirilmaz: true, bossaGizle: true, hucre: (x) => (x.gelen === null ? null : miktarYaz(x.gelen, x.birim)) },
  ];
  return (
    <div className="sa-ekran-ayrinti">
      <Tablo etiket={`${o.orderNo || r.no} kalemleri`} sutunlar={sutunlar} satirlar={satirlar} satirAnahtari={(x) => x.it.id} bosMesaj="Kalem yok." />
    </div>
  );
}
