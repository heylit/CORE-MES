import { useState } from 'react';
import type { AcikSiparisSatiri } from '#paylasilan/sozlesme/stok.ts';
import { Girdi } from '../../ortak/arayuz/index.ts';
import { birimliMiktar, miktarGirdisi } from './gorunum.ts';

// 3332: mal kabulde satın alma kaleminin birimi ile kartın stok birimi arasındaki dönüşüm. Katsayıları sunucu karttan verir
// (stok kurallar malKabulDonusumu); ekran yalnız çarpar ve gösterir. Bilinmeyen karşılık yazılmaz, sıfır uydurulmaz.
export type SiparisDonusumu = Pick<AcikSiparisSatiri, 'miktar' | 'kalanMiktar' | 'birim' | 'stokBirimi' | 'donusum'>;
const ad = (b: string | null | undefined): string => (b ?? '').trim().toLocaleLowerCase('tr-TR');
// Gösterim ve öneri en çok 3 ondalık; metin noktalı ondalıktır (miktarMetni biçimler).
const metin = (n: number): string | null => (Number.isFinite(n) && n > 0 ? String(Math.round(n * 1000) / 1000) : null);
// Belirsiz noktalı girdi ("1.250") ve boş girdi karşılık göstermez.
const sayi = (v: string): number | null => { const m = miktarGirdisi(v); const n = m === '' ? NaN : Number(m); return Number.isFinite(n) ? n : null; };

export const birimFarkli = (d: SiparisDonusumu): boolean => !!d.stokBirimi && ad(d.birim) !== ad(d.stokBirimi);
// Kg siparişte tam karşılık birim ağırlığıyla (katsayı 1/kg yuvarlanmış olabilir); öbür birimde sipariş katsayısıyla.
const kgSiparis = (d: SiparisDonusumu): number | null => (ad(d.birim) === 'kg' && d.donusum?.kgBasina ? Number(d.donusum.kgBasina) : null);
// Sipariş birimindeki miktarın stok birimi karşılığı; aynı birimde kendisi, katsayı yoksa null.
export function stokKarsiligi(miktar: string, d: SiparisDonusumu): string | null {
  if (!birimFarkli(d)) return miktar;
  const kg = kgSiparis(d);
  if (kg !== null) return metin(Number(miktar) / kg);
  const k = d.donusum?.siparisKatsayisi;
  return k ? metin(Number(miktar) * Number(k)) : null;
}
// Mal kabul satırının önerilen miktarı (stok biriminde, virgüllü girdi): birim farklı ve dönüşüm yoksa boş kalır, depocu sayar.
export function onerilenMiktar(d: SiparisDonusumu): string {
  const m = stokKarsiligi(d.kalanMiktar, d);
  if (m === null) return '';
  // Çevrilen adet tam sayıya yuvarlanır (kesirli adet önerilmez); aynı birimde kalan olduğu gibi kalır.
  return (birimFarkli(d) && ad(d.stokBirimi) === 'adet' ? String(Math.round(Number(m))) : m).replace('.', ',');
}
// Stok birimindeki bir miktarın öbür birimleri: sipariş birimi (farklıysa), kg (stok kg değilse) ya da parça (kg stokta).
export function digerBirimler(miktar: number, d: SiparisDonusumu): string[] {
  const c: string[] = [];
  const k = d.donusum?.siparisKatsayisi;
  if (birimFarkli(d) && k) { const kg = kgSiparis(d); const m = metin(kg !== null ? miktar * kg : miktar / Number(k)); if (m) c.push(birimliMiktar(m, d.birim)); }
  const kg = d.donusum?.kgBasina;
  if (ad(d.stokBirimi) !== 'kg' && kg && ad(d.birim) !== 'kg') { const m = metin(miktar * Number(kg)); if (m) c.push(birimliMiktar(m, 'kg')); }
  const parca = d.donusum?.parcaKg;
  if (parca) { const m = metin(miktar / Number(parca)); if (m) c.push(`≈ ${birimliMiktar(m, 'parça')}`); }
  return c;
}
// 3332: kalan sipariş biriminde; stok birimi farklıysa ve dönüşüm biliniyorsa stok karşılığı yanında.
export function kalanMetni(x: SiparisDonusumu): string {
  const k = birimFarkli(x) ? stokKarsiligi(x.kalanMiktar, x) : null;
  return `${birimliMiktar(x.kalanMiktar, x.birim)}${k === null ? '' : ` ≈ ${birimliMiktar(k, x.stokBirimi)}`}`;
}
// Tabloda kalan iki satır: üstte sipariş birimi, altta stok karşılığı (dar sütunda kesilmesin).
export function KalanHucresi({ x }: { x: SiparisDonusumu }) {
  const k = birimFarkli(x) ? stokKarsiligi(x.kalanMiktar, x) : null;
  if (k === null) return <>{birimliMiktar(x.kalanMiktar, x.birim)}</>;
  return <span className="tc-stok-kalan"><span>{birimliMiktar(x.kalanMiktar, x.birim)}</span><span>≈ {birimliMiktar(k, x.stokBirimi)}</span></span>;
}
// Kartın dönüşüm kuralı tek satırda: "1 adet = 24 kg", "1 kutu = 50 adet", "1 parça ≈ 12 kg".
export function donusumKurali(d: SiparisDonusumu): string | null {
  const s = d.stokBirimi ?? '';
  const k = d.donusum?.siparisKatsayisi;
  const kg = d.donusum?.kgBasina;
  if (birimFarkli(d) && ad(d.birim) !== 'kg' && k) return `1 ${d.birim} = ${birimliMiktar(k, s)}`;
  if (ad(s) !== 'kg' && kg) return `1 ${s} = ${birimliMiktar(metin(Number(kg)), 'kg')}`;
  if (d.donusum?.parcaKg) return `1 parça ≈ ${birimliMiktar(d.donusum.parcaKg, 'kg')}`;
  return null;
}

// Sipariş satırı seçili mal kabul satırında miktar kutusunun altında: siparişin ve kalanın iki birimi, kartın dönüşümü ve girilen
// miktarın karşılığı. Birim farklı ve dönüşüm yoksa uyarı: depocu stok biriminde sayar.
export function BirimKarsiligi({ d, girilen }: { d: SiparisDonusumu; girilen: string }) {
  const stok = d.stokBirimi ?? '';
  // Siparişteki miktarın stok birimi ve kg ya da parça karşılığı; sipariş biriminin kendisi tekrar yazılmaz.
  const ek = (m: string): string => {
    const s = stokKarsiligi(m, d);
    if (s === null) return '';
    const x = [...(birimFarkli(d) ? [birimliMiktar(s, stok)] : []), ...digerBirimler(Number(s), d).filter((y) => !y.endsWith(` ${d.birim}`))];
    return x.length ? ` ≈ ${x.join(' · ').replace(/^≈ /, '')}` : '';
  };
  const kural = donusumKurali(d);
  const n = sayi(girilen);
  const karsilik = n !== null && n > 0 ? digerBirimler(n, d) : [];
  // Girilen kalandan az ya da fazlaysa fark stok biriminde (kısmi ya da fazla teslim görünür olsun).
  const kalanStok = stokKarsiligi(d.kalanMiktar, d);
  const fark = n !== null && n > 0 && kalanStok !== null ? Math.round((n - Number(kalanStok)) * 1000) / 1000 : 0;
  const farkMetni = fark === 0 ? '' : ` · kalandan ${birimliMiktar(metin(Math.abs(fark)), stok)} ${fark < 0 ? 'az' : 'fazla'}`;
  // Aynı birimde ve kartta ağırlık yokken söylenecek karşılık yoktur.
  if (!birimFarkli(d) && kural === null) return null;
  if (birimFarkli(d) && !d.donusum?.siparisKatsayisi) {
    return (
      <p className="tc-stok-tam tc-stok-bilgi tc-stok-bilgi-uyari" role="status">
        Sipariş {birimliMiktar(d.miktar, d.birim)}, kalan {birimliMiktar(d.kalanMiktar, d.birim)}. Stok birimi {stok}; kartta {ad(d.birim) === 'kg' ? 'birim ağırlığı' : `${d.birim} katsayısı`} yok, dönüşüm hesaplanamaz. Saydığınızı {stok}, siparişe teslimi {d.birim} olarak yazın.
      </p>
    );
  }
  return (
    <div className="tc-stok-tam tc-stok-bilgi tc-stok-donusum" role="status">
      <span>Sipariş <strong>{birimliMiktar(d.miktar, d.birim)}{ek(d.miktar)}</strong> · kalan <strong>{birimliMiktar(d.kalanMiktar, d.birim)}{ek(d.kalanMiktar)}</strong></span>
      {kural && <span>Dönüşüm: {kural} (malzeme kartından)</span>}
      {karsilik.length > 0 && <span>Girilen {birimliMiktar(metin(n!), stok)} = <strong>{karsilik.join(' · ')}</strong>{farkMetni}</span>}
    </div>
  );
}

// 3332 b (kullanıcı 16.11 12:52Z "hem kg hem adet çift taraflı girilebilsin"): stok biriminin yanında ikinci birim kutusu. Adet
// stokta kg (birim ağırlığı), kg stokta parça (parça ağırlığı), ağırlık yoksa kartın alış birimi (ör. kutu). Diğer birim yalnız
// hesap içindir: komuta stok birimindeki miktar gider. Çarpan: 1 stok birimi kaç diğer birim.
export function ikinciBirim(d: SiparisDonusumu): { birim: string; carpan: number } | null {
  const kg = d.donusum?.kgBasina;
  if (ad(d.stokBirimi) !== 'kg' && kg && Number(kg) > 0) return { birim: 'kg', carpan: Number(kg) };
  const parca = d.donusum?.parcaKg;
  if (parca && Number(parca) > 0) return { birim: 'parça', carpan: 1 / Number(parca) };
  const k = d.donusum?.siparisKatsayisi;
  if (birimFarkli(d) && k && Number(k) > 0) return { birim: d.birim, carpan: 1 / Number(k) };
  return null;
}
const virgullu = (m: string | null): string => (m === null ? '' : m.replace('.', ','));
// Yazılan kutu kendi metnini korur (yuvarlama yazarken geri dönmesin); öbür kutu ondan hesaplanır. Stok kutusu çağıranın alanıdır.
// Adet stokta kg'dan çıkan adet tam sayıya yuvarlanır (kesirli adet stoka gitmez); kesir ipucunda yazılır, depocu sayıyı denetler.
// 3332-2 a: ikinci kutu siparişin birimindeyse (kg siparişte tartılan kg) yazılan, siparişe teslim olarak da gider (ikinci argüman).
export function IkinciBirimGirdisi({ d, stokMiktar, degistir }: { d: SiparisDonusumu; stokMiktar: string; degistir: (stok: string, siparisMiktari: string) => void }) {
  const ikinci = ikinciBirim(d);
  const siparisBiriminde = ikinci !== null && birimFarkli(d) && ad(ikinci.birim) === ad(d.birim);
  const [yazilan, setYazilan] = useState<{ metin: string; stok: string; ham: string | null } | null>(null);
  if (ikinci === null) return null;
  const stokAdi = d.stokBirimi ?? 'stok';
  const n = sayi(stokMiktar);
  // Stok kutusu sonradan değiştiyse yazılan metin geçersizdir; değer stoktan hesaplanır.
  const bu = yazilan !== null && yazilan.stok === stokMiktar ? yazilan : null;
  const deger = bu ? bu.metin : virgullu(n === null ? null : metin(n * ikinci.carpan));
  const ipucu = bu === null ? (n === null ? `Yazınca ${stokAdi} miktarı hesaplanır.` : `${stokAdi[0]!.toLocaleUpperCase('tr-TR')}${stokAdi.slice(1)} miktarından hesaplandı.`)
    : bu.ham !== null ? `≈ ${birimliMiktar(bu.ham, stokAdi)}; ${birimliMiktar(bu.stok.replace(',', '.'), stokAdi)} yazıldı, saydığınızı kontrol edin.`
      : `${stokAdi[0]!.toLocaleUpperCase('tr-TR')}${stokAdi.slice(1)} miktarı bundan hesaplandı.`;
  return (
    <Girdi etiket={ikinci.birim === 'kg' ? 'Ağırlık (kg)' : ikinci.birim === 'parça' ? 'Parça sayısı' : `Karşılığı (${ikinci.birim})`} inputMode="decimal" value={deger} ipucu={ipucu}
      onChange={(e) => {
        const v = e.target.value;
        const m = sayi(v);
        const ham = m === null ? null : metin(m / ikinci.carpan);
        const tam = ham !== null && ad(d.stokBirimi) === 'adet' ? String(Math.round(Number(ham))) : ham;
        const stok = tam === null || tam === '0' ? '' : virgullu(tam);
        setYazilan({ metin: v, stok, ham: ham !== null && tam !== ham ? ham : null });
        degistir(stok, siparisBiriminde && m !== null ? v : '');
      }} />
  );
}

// 3332-2 a: sipariş birimi stok biriminden farklı ve kartta dönüşüm yoksa teslim sipariş biriminde ayrıca yazılır (ör. tartılan kg);
// sunucu bu miktar olmadan satırı reddeder.
export function SiparisMiktariGirdisi({ d, deger, degistir }: { d: SiparisDonusumu; deger: string; degistir: (v: string) => void }) {
  if (!birimFarkli(d) || ikinciBirim(d) !== null) return null;
  return <Girdi etiket={`Siparişe teslim (${d.birim})`} inputMode="decimal" value={deger} required onChange={(e) => degistir(e.target.value)}
    ipucu={`Kartta dönüşüm yok; siparişe yazılacak ${d.birim} miktarını girin (ör. tartılan).`} />;
}

