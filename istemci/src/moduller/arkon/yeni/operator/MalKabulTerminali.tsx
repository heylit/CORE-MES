import { useEffect, useState } from 'react';
import { useBekleyenEtiketler, useDogrudanBasim } from '../../../etiket-merkezi/disari.ts';
import { FasonKabulOnayi, SatinAlmaKabulu, kabulKalani, useKabulIsleri, useKabulLotlari, type KabulIsi, type YazilanKabul } from '../../../stok/disari.ts';
import { yerel } from '../cekirdek/yerel.ts';
import { DepoTerminali, sayimEklenir, type DepoIsi, type DepoMetinleri } from './DepoTerminali.tsx';
import { YAZICI_NEDENI, etiketBekliyor, tarihYazisi, etiketYuvasi, kabulIletisi, kabulKartSatiri, type KabulEtiketi } from './kabul-etiketi.ts';

// 3388 a: mal kabul standart terminal düzeninde. Fason dönüşü Kabul +1 ile sayılır (en çok firmada kalan), Bitir'de dönen kart
// karantinaya tek kayıtla yazılır. Ret yoktur: uygunsuzluk GKK'nin kararıdır, mal kabul yalnız sayar. Satın alma kabulü "Kabul et" ile ekrandaki sipariş satırından açılır, okutma isteğe bağlıdır (parti, raf Stok'un hızlı kabulünde); sayım tuşu kapalıdır.
export const KABUL_METINLERI: DepoMetinleri = {
  serit: 'Bekleyen kabuller', birim: 'kabul', olcu: 'adet', calisiyor: 'Kabulde', sayac: 'Kabul', arti: 'Kabul +1', basla: 'Kabulü başlat',
  bos: 'Bekleyen kabul yok; siparişsiz mal diğer giriş olarak alınır.',
};
// 3584: satın alma kabulü ekrandaki sipariş satırıyla açılır; okutma isteğe bağlıdır (gelen malın üstünde bizim kodumuz yok).
const OKUTMA_NEDENI = 'Satın alma "Kabul et" ile: sipariş satırı seçili gelir, okutma isteğe bağlı.';

// Satın almada kadranın hedefi siparişin kalanıdır (iş satırındaki "Beklenen" ile aynı sayı); yalnız adet birimli ve tam sayıysa,
// başka birimde (kg, m) adet kadranına yazılmaz, kadran "—" gösterir.
export const adetKalani = (kalan: string, birim: string): number | null => {
  const n = Number(kalan);
  return birim.trim().toLocaleLowerCase('tr') === 'adet' && Number.isInteger(n) && n >= 0 ? n : null;
};

export function kabulDepoIsi(k: KabulIsi): DepoIsi {
  const x = k.satir;
  const fason = k.tur === 'fason';
  const donen = k.fason ? [k.fason.donenKart.kod, k.fason.donenKart.ad].filter(Boolean).join(' · ') : null;
  return {
    anahtar: `kabul:${String(x.id)}`,
    no: (fason ? x.emirNo : null) || x.siparisNo || x.talepNo,
    ad: x.kalemAdi,
    tur: fason ? 'Fason dönüşü' : 'Satın alma',
    hedef: fason ? k.hedef : adetKalani(x.kalanMiktar, x.birim),
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
      { etiket: 'Termin', deger: x.beklenenTeslim === null ? null : tarihYazisi(x.beklenenTeslim), mono: true },
    ],
    kartSatiri: kabulKartSatiri(fason, x.beklenenTeslim, fason ? (k.hedef === null ? null : `${String(k.hedef)} adet`) : kabulKalani(k)),
    adimlar: fason ? [
      { t: 'Dönen malzemeyi doğrula', d: `${donen ?? 'Dönen kart'} · ${x.tedarikciAdi}`, r: true },
      { t: 'Adedi say', d: k.hedef === null ? 'Firmadaki adet bilinmiyor' : `Firmada ${String(k.hedef)} adet var; fazlası girilmez`, r: true },
      { t: 'Karantina rafına koy', d: 'Kabulden sonra GKK kuyruğuna düşer', r: false },
    ] : [
      { t: 'İrsaliyeyi siparişle karşılaştır', d: `${x.siparisNo || x.talepNo} · kalan ${kabulKalani(k)}`, r: true },
      { t: 'Malzemeyi say ve kabul et', d: 'Kabul et; okutma isteğe bağlı, parti ve ambalaj kabul formunda', r: true },
      { t: 'Rafa koy', d: "Etiketi lota yapıştır, rafı okut; raf okutulmazsa mal kabul alanına girer", r: false },
    ],
  };
}

// 3584: bu cihazda kabul edilen ve etiketi henüz basılmamış belgeler (lot etiketi belge kimliğiyle basılır). Kayıt, kural (kabul-etiketi.ts)
// "artık beklemiyor" deyince ya da yuvadan basılınca silinir; iş listeden düşse de kalır.
const ETIKET_ANAHTARI = 'depo:kabul-etiketleri';
function useKabulEtiketleri() {
  const [kayitlar, kayitlarYaz] = useState<KabulEtiketi[]>(() => yerel.oku<KabulEtiketi[]>(ETIKET_ANAHTARI) ?? []);
  useEffect(() => { yerel.yaz(ETIKET_ANAHTARI, kayitlar.length ? kayitlar : null); }, [kayitlar]);
  return {
    kayitlar,
    ekle: (k: YazilanKabul) => kayitlarYaz((l) => [...l.filter((x) => x.belgeId !== k.belgeId), { ...k, zaman: Date.now() }]),
    birak: (idler: readonly number[]) => kayitlarYaz((l) => (l.some((x) => idler.includes(x.belgeId)) ? l.filter((x) => !idler.includes(x.belgeId)) : l)),
  };
}

export function MalKabulTerminali({ dar }: { dar: boolean }) {
  const v = useKabulIsleri();
  const et = useKabulEtiketleri();
  const lotlar = useKabulLotlari(et.kayitlar);
  const liste = useBekleyenEtiketler('mal-kabul');
  const basim = useDogrudanBasim('mal-kabul');
  const simdi = Date.now();
  const lotu = (id: number) => lotlar.get(id) ?? null;
  const bekleyenler = et.kayitlar.filter((k) => etiketBekliyor(k, lotu(k.belgeId), liste, simdi));
  const dusen = et.kayitlar.filter((k) => !bekleyenler.includes(k)).map((k) => k.belgeId);
  useEffect(() => { if (dusen.length) et.birak(dusen); }, [dusen.join(',')]);
  const yuva = etiketYuvasi(bekleyenler, lotu);
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
      rozet={(is) => (kaynak(is.anahtar)?.tur === 'satin-alma' && bekleyenler.length > 0 ? { metin: 'Etiket bekliyor', simge: 'tag' } : null)}
      yuvalar={(b) => {
        // 3583 Y3, 3584 Y1: iki sabit yuva [Kabul et] [Etiket bas]; ikisi de hep yerinde, durum gereği pasif. Etiket bas bu cihazın
        // bekleyen bütün lot etiketlerini tek dokunuşla basar (K2); yazıcı yoksa pasif ve nedeni ileti satırında (K1). Fasonda yuvalar ayrılmış, boş.
        if (kaynak(b.is.anahtar)?.tur !== 'satin-alma') return [null, null];
        const kabulEdildi = (k: YazilanKabul) => { et.ekle(k); b.kapat(); b.bildir(kabulIletisi(basim.eksik)); };
        const bas = () => basim.bas(bekleyenler.map((k) => k.belgeId), (gitti, idler) => {
          if (gitti) { et.birak(idler); b.bildir('Etiket yazıcıya gönderildi'); } else b.bildir('Etiket basılamadı; kabul geçerli, etiket bekliyor', 'kotu');
        });
        return [
          { etiket: 'Kabul et', simge: 'check', tikla: b.sayim.durum === 'running' ? () => b.ac('Mal kabul', <SatinAlmaKabulu kabulEdildi={kabulEdildi} satir={kaynak(b.is.anahtar)!.satir} />) : null, birincil: true },
          {
            etiket: yuva.etiket, alt: yuva.alt, ad: yuva.ad, simge: 'printer', yukleniyor: basim.basiyor,
            tikla: bekleyenler.length > 0 && basim.yazici !== null && !basim.basiyor ? bas : null,
            neden: bekleyenler.length > 0 && basim.eksik !== null ? YAZICI_NEDENI[basim.eksik] : null,
          },
        ];
      }}
      sekmeler={() => []} />
  );
}
