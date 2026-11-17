import { FasonKabulOnayi, SatinAlmaKabulu, kabulKalani, useKabulIsleri, type KabulIsi } from '../../../stok/disari.ts';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { DepoTerminali, sayimEklenir, type DepoIsi, type DepoMetinleri } from './DepoTerminali.tsx';

// 3388 a: mal kabul standart terminal düzeninde. Fason dönüşü Kabul +1 ile sayılır (en çok firmada kalan), Bitir'de dönen kart
// karantinaya tek kayıtla yazılır. Ret yoktur: uygunsuzluk GKK'nin kararıdır, mal kabul yalnız sayar. Satın alma kabulü okutmayla yapılır (sipariş, parti, raf Stok'un hızlı kabulünde); sayım tuşu kapalıdır.
export const KABUL_METINLERI: DepoMetinleri = {
  serit: 'Bekleyen kabuller', birim: 'kabul', olcu: 'adet', calisiyor: 'Kabulde', sayac: 'Kabul', arti: 'Kabul +1', basla: 'Kabulü başlat',
  bos: 'Bekleyen kabul yok; siparişsiz mal diğer giriş olarak alınır.',
};
const OKUTMA_NEDENI = 'Satın alma kabulü okutmayla: "Okut ve kabul et".';

export function kabulDepoIsi(k: KabulIsi): DepoIsi {
  const x = k.satir;
  const fason = k.tur === 'fason';
  const donen = k.fason ? [k.fason.donenKart.kod, k.fason.donenKart.ad].filter(Boolean).join(' · ') : null;
  return {
    anahtar: `kabul:${String(x.id)}`,
    no: (fason ? x.emirNo : null) || x.siparisNo || x.talepNo,
    ad: x.kalemAdi,
    tur: fason ? 'Fason dönüşü' : 'Satın alma',
    hedef: k.hedef,
    sunucuSayisi: null,
    alanlar: fason ? [
      { etiket: 'İş emri', deger: x.emirNo ?? null, mono: true },
      { etiket: 'Op', deger: k.fason ? `Op ${String(k.fason.opNo)}${k.fason.adim ? ` ${k.fason.adim}` : ''}` : null },
      { etiket: 'Firma', deger: x.tedarikciAdi },
      { etiket: 'Dönen kart', deger: donen, mono: true },
      { etiket: 'Sipariş', deger: x.siparisNo || x.talepNo, mono: true },
      { etiket: 'Firmada', deger: k.hedef === null ? null : `${String(k.hedef)} adet`, mono: true },
    ] : [
      { etiket: 'Sipariş', deger: x.siparisNo || x.talepNo, mono: true },
      { etiket: 'Malzeme', deger: x.kalemAdi },
      { etiket: 'Tedarikçi', deger: x.tedarikciAdi },
      { etiket: 'Beklenen', deger: kabulKalani(k), mono: true },
      { etiket: 'Termin', deger: x.beklenenTeslim, mono: true },
    ],
    adimlar: fason ? [
      { t: 'Dönen malzemeyi doğrula', d: `${donen ?? 'Dönen kart'} · ${x.tedarikciAdi}`, r: true },
      { t: 'Adedi say', d: k.hedef === null ? 'Firmadaki adet bilinmiyor' : `Firmada ${String(k.hedef)} adet var; fazlası girilmez`, r: true },
      { t: 'Karantina rafına koy', d: 'Kabulden sonra GKK kuyruğuna düşer', r: false },
    ] : [
      { t: 'İrsaliyeyi siparişle karşılaştır', d: `${x.siparisNo || x.talepNo} · kalan ${kabulKalani(k)}`, r: true },
      { t: 'Malzemeyi okut ve say', d: 'Okut ve kabul et; parti ve ambalaj kabul formunda', r: true },
      { t: 'Rafa koy', d: 'Raf okutulmazsa mal kabul alanına girer', r: false },
    ],
  };
}

export function MalKabulTerminali({ dar }: { dar: boolean }) {
  const v = useKabulIsleri();
  const kabuller = v.isler ?? [];
  const isler = v.isler ? kabuller.map(kabulDepoIsi) : null;
  const kaynak = (anahtar: string) => kabuller.find((k) => `kabul:${String(k.satir.id)}` === anahtar) ?? null;
  return (
    <DepoTerminali kip="kabul" dar={dar} metin={KABUL_METINLERI} isler={isler} yukleniyor={v.yukleniyor} hata={v.hata} yenile={v.yenile} toplu
      artiKapali={(is) => (kaynak(is.anahtar)?.tur === 'satin-alma' ? OKUTMA_NEDENI : null)}
      arti={(b) => { if (sayimEklenir(b.sayim.sayilan, b.is.hedef)) b.guncelle({ sayilan: b.sayim.sayilan + 1 }); }}
      bitir={(b) => {
        const k = kaynak(b.is.anahtar);
        if (!k) return;
        if (k.tur === 'satin-alma') { b.bitti(true); return; }
        b.ac('Fason dönüşünü bitir', <FasonKabulOnayi is={k} kabul={b.sayim.sayilan} vazgec={b.kapat} yazildi={(m) => { b.bitti(k.hedef !== null && b.sayim.sayilan < k.hedef); b.bildir(m); }} />);
      }}
      sahneEk={(b) => (kaynak(b.is.anahtar)?.tur === 'satin-alma' && b.sayim.durum === 'running'
        ? <Dugme tur="birincil" simge="scan" onClick={() => b.ac('Okut ve kabul et', <SatinAlmaKabulu />)}>Okut ve kabul et</Dugme>
        : null)}
      sekmeler={() => []} />
  );
}
