import { DurumKutusu } from '../../../../ortak/arayuz/index.ts';
import { FasonKabulOnayi } from '../../../stok/disari.ts';
import { Simge } from '../../../../ortak/arayuz/index.ts';
import { kabulArtiNedeni, kabulHesabi, useKabulTuru } from '../hazirlik/kabul-adimi.ts';

// 3703: mal kabul modundaki depo adımında Bitir'in açtığı "Kabulü yaz" penceresinin içeriği. Fasonda Stok'un fason dönüşü onayı (karantina, GKK),
// ara stokta kayıt yazılmaz, adım yalnız sayılır. Kabul edilince `yazildi(adet, ileti)` terminale döner; terminal sayacı kapatır ya da (eksik adette) işi açık bırakır.
export function KabulYazma({ emirNo, fasonDonusu, sayilan, yazilan, hedef, yazildi, vazgec }: {
  emirNo: string; fasonDonusu?: boolean | undefined; sayilan: number; yazilan: number; hedef: number;
  yazildi: (adet: number, ileti: string) => void; vazgec: () => void;
}) {
  const k = useKabulTuru(emirNo, fasonDonusu);
  const h = kabulHesabi(sayilan, yazilan, hedef);
  const uyari = h.durum === 'sifir'
    ? <p className="tc-stok-fd-uyari" role="alert">0 adet kabul edilemez. Fasonda malzeme dönmediyse "Malzeme dönmedi" yazılır. Önce Kabul +1 ya da Toplu giriş ile sayın, sonra Bitir'e basın.</p>
    : h.durum === 'yarim'
      ? <p className="tc-stok-not" role="status">Yarım kabul: {h.yazilacak} / {hedef - yazilan} adet kabul edilir, {h.kalan} adet kalır; iş açık kalır.</p>
      : null;
  if (k.yukleniyor) return <DurumKutusu durum="yukleniyor" />;
  if (k.hata) return <DurumKutusu durum="hata" mesaj={k.hata} />;
  // Ara stokta Stok'a kayıt yazılmaz (kullanıcı kararı 25.11, ADR 0022 1482 a: yarı mamul stok hareketi olmadan akar); adım yalnız sayılır.
  if (k.tur === 'ara') {
    return (
      <div>
        {uyari}
        {h.durum === 'sifir' ? <button type="button" className="tc-ay1-tus" onClick={vazgec}>Vazgeç</button> : (
          <>
            <p className="tc-stok-not" role="status">{h.yazilacak} adet ara stok olarak sayılır; Stok'a kayıt yazılmaz.</p>
            <button type="button" className="tc-ay1-tus" onClick={vazgec}>Vazgeç</button>
            <button type="button" className="tc-ay1-tus" data-tur="iyi" onClick={() => yazildi(h.yazilacak, `${String(h.yazilacak)} adet ara stok olarak sayıldı (Stok'a yazılmadı).`)}>Kabulü onayla</button>
          </>
        )}
      </div>
    );
  }
  if (k.tur === null) return <p className="tc-stok-not tc-stok-uyari-yazi" role="alert">Fason dönüşü Stok'a karantina kaydı yazar ve stok girişi yetkisi ister; ya da kabul türü bilinemiyor. Adım kapatılmaz; yetkili bir kullanıcıyla giriş yapın.</p>;
  return (
    <div>
      {uyari}
      {k.fason
        ? <FasonKabulOnayi is={k.fason} kabul={h.yazilacak} vazgec={vazgec} yazildi={(m) => yazildi(h.yazilacak, m)} />
        : <p className="tc-stok-not tc-stok-uyari-yazi" role="alert">Bu emrin fason dönüş satırı bulunamadı.</p>}
    </div>
  );
}

// Sayacın altındaki not: hedefe varılınca Kabul +1'in neden kapalı olduğu, daha önce kabul edilen adet (yarım kabulde iş açık kalır).
export function KabulNotu({ sayilan, yazilan, hedef }: { sayilan: number; yazilan: number; hedef: number }) {
  const neden = kabulArtiNedeni(sayilan, hedef);
  if (neden === null && yazilan === 0) return null;
  return (
    <p className="tc-ay1-depo-ileti" role="status">
      <Simge ad={neden === null ? 'check' : 'alert'} />
      <span>{[neden === null ? null : `${neden} Kabul +1 kapalı.`, yazilan > 0 ? `Kabul edilen: ${String(yazilan)} adet.` : null].filter(Boolean).join(' ')}</span>
    </p>
  );
}
