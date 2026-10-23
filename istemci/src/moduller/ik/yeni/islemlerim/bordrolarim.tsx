import { useState } from 'react';
import {
  Dugme, OnayPenceresi, Rozet, SayfaBasligi, SayiKarti, Sekmeler, Tablo, type Sutun,
} from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { ayAdi, para, paraKisa, tarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import type { Bordro } from '../tipler.ts';
import { useIkKomutu } from '../veri.ts';
import { BordroPusulasi } from './belgeler.tsx';
import { bordroAlani, bordroOnayi, bordroYillari, kesinBordrolar, yilToplami } from './kurallar.ts';
import {
  BagliDegil, Not, useYaz,
} from './parcalar.tsx';

// Sunucunun zaman metni (yerel saat dilimli ISO) -> "gg.aa.yyyy ss:dd" (v3 TmiZaman).
function onayZamani(z: string): string {
  return `${tarih(z.slice(0, 10))} ${z.slice(11, 16)}`;
}

// Bordrolarım (app.js viewMyPays + v3 bordro onayı, IK-43): yalnız kesinleşmiş aylar; onay bordroyu değiştirmez, geri alınmaz.
export function Bordrolarim(o: IkEkranOzellikleri) {
  const [secili, seciliYaz] = useState<string | null>(null);
  const [pusula, pusulaYaz] = useState<Bordro | null>(null);
  const [onaylanacak, onaylanacakYaz] = useState<Bordro | null>(null);
  const komut = useIkKomutu();
  const yaz = useYaz();
  const e = o.ben;
  const hepsi = e ? kesinBordrolar(o.depo.tur('pay'), e.id) : [];
  const yillar = bordroYillari(hepsi);
  const yil = secili && yillar.includes(secili) ? secili : yillar[0] ?? '';
  const yilin = hepsi.filter((r) => (r.donem ?? '').startsWith(yil));
  useSayfaKomutlari('ik-bordrolarim', e ? yilin.map((r) => ({
    anahtar: `pusula-${r.donem}`, baslik: `${ayAdi(r.donem ?? '')} pusulası`, simge: 'printer' as const, aciklama: null,
    sozcukler: ['bordro', 'pusula', r.donem ?? ''], calistir: () => { pusulaYaz(r); },
  })) : null);
  if (!e) return <BagliDegil baslik="Bordrolarım" simge="list" />;

  const toplam = yilToplami(yilin);
  const onayla = async () => {
    const r = onaylanacak;
    if (!r || bordroOnayi(r)) return;
    await yaz(() => komut.bordroGordum(r.id), 'Bordronuzu onayladınız.', 'Onay kaydedilemedi.');
    onaylanacakYaz(null);
  };
  const sutunlar: Sutun<Bordro>[] = [
    { anahtar: 'donem', baslik: 'Dönem', hucre: (r) => ayAdi(r.donem ?? ''), kirilmaz: true },
    { anahtar: 'gun', baslik: 'Gün', hucre: (r) => bordroAlani(r, 'gun'), hizala: 'sag', mono: true },
    { anahtar: 'toplam', baslik: 'Toplam brüt', hucre: (r) => para(bordroAlani(r, 'toplam')), hizala: 'sag', mono: true },
    { anahtar: 'kesinti', baslik: 'Kesintiler', hucre: (r) => para(bordroAlani(r, 'toplam') - bordroAlani(r, 'net')), hizala: 'sag', mono: true },
    { anahtar: 'net', baslik: 'Net', hucre: (r) => <b>{para(bordroAlani(r, 'net'))}</b>, hizala: 'sag', mono: true, csv: (r) => bordroAlani(r, 'net') },
    {
      anahtar: 'onay', baslik: 'Onay', csv: (r) => { const g = bordroOnayi(r); return g ? onayZamani(g) : ''; },
      hucre: (r) => {
        const g = bordroOnayi(r);
        if (g) return <Rozet ton="tamam">Onaylandı: {onayZamani(g)}</Rozet>;
        if (!o.yetki.bordroGordum) return <Rozet ton="uyari">Onay bekliyor</Rozet>;
        return <Dugme tur="birincil" onClick={() => { onaylanacakYaz(r); }}>Gördüm, onaylıyorum</Dugme>;
      },
    },
    { anahtar: 'pusula', baslik: '', csv: false, hucre: (r) => <Dugme simge="printer" onClick={() => { pusulaYaz(r); }}>Pusula</Dugme> },
  ];

  return (
    <>
      <SayfaBasligi baslik="Bordrolarım" simge="list" alt="Kesinleşmiş aylık bordrolarınız ve pusulalarınız." />
      {hepsi.length === 0 ? (
        <Tablo etiket="Bordrolarım" sutunlar={sutunlar} satirlar={[]} satirAnahtari={(r) => r.id}
          bosMesaj="Kesinleşmiş bordronuz yok. Bordrolar insan kaynakları tarafından kesinleştirildikçe burada görünür." />
      ) : (
        <>
          {yillar.length > 1 && (
            <Sekmeler etiket="Yıl" sekmeler={yillar.map((y) => ({ anahtar: y, baslik: y }))} secili={yil} sec={seciliYaz} />
          )}
          <div className="tc-ikm-sayilar">
            <SayiKarti baslik={`${yil} toplam brüt`} simge="lira" metin={paraKisa(toplam.toplam)} />
            <SayiKarti baslik="SGK ve işsizlik payı" simge="building" metin={paraKisa(toplam.sgkIss)} />
            <SayiKarti baslik="Gelir ve damga vergisi" simge="file" metin={paraKisa(toplam.gvDv)} />
            <SayiKarti baslik="Toplam net" simge="check" metin={paraKisa(toplam.net)} />
          </div>
          <Tablo etiket={`${yil} bordrolarım`} sutunlar={sutunlar} satirlar={yilin} satirAnahtari={(r) => r.id} />
          <Not>
            Yalnızca insan kaynaklarının kesinleştirdiği aylar görünür. Her bordroyu inceleyip “Gördüm, onaylıyorum” ile onaylayın; onay
            bordroyu değiştirmez, geri alınmaz. Bordronuzla ilgili sorularınız için İK birimine başvurun.
          </Not>
        </>
      )}
      <OnayPenceresi
        acik={onaylanacak !== null} baslik="Bordronuzu onaylıyor musunuz?" onayMetni="Gördüm, onaylıyorum" yukleniyor={komut.calisiyor}
        onayla={() => { void onayla(); }} vazgec={() => { onaylanacakYaz(null); }}
      >
        <p>
          {ayAdi(onaylanacak?.donem ?? '0000-01')} bordronuzu gördüğünüzü onaylarsınız. Onay geri alınmaz; bordroyu ve tutarları
          değiştirmez.
        </p>
      </OnayPenceresi>
      {pusula && <BordroPusulasi personel={e} bordro={pusula} departmanlar={o.depo.tur('dept')} kapat={() => { pusulaYaz(null); }} />}
    </>
  );
}
