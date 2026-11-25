import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { AlternatifKartiSecenegi } from '#paylasilan/sozlesme/malzeme-alternatifleri.ts';
import type { KalemAlternatifKarti } from '#paylasilan/sozlesme/satin-alma.ts';
import { Dugme, Rozet, Simge } from '../../../ortak/arayuz/index.ts';
import { useKabulZarfi } from './KabulSinirlari.tsx';
import { ALTERNATIF_SAYFASI, SURE, anahtarlar, cagri } from './ortak.ts';

// 3593: talep eden kalemde kartın alternatif kartlarını işaretler (Malzemeler > İkame ve alternatifler). Tam ve üst varsayılan işaretli,
// şartlı varsayılan işaretsiz (talep eden onayı gerekir). Satın alma yalnız işaretli kartla genişler; işaretsizse kalem kabul sınırıyla gider.
export const TUR_ADI = { tam: 'tam', ust: 'üst', sartli: 'şartlı' } as const;
export const varsayilanIsaretler = (l: readonly AlternatifKartiSecenegi[]): number[] => l.filter((x) => x.tur !== 'sartli').map((x) => x.id);

export function AlternatifKartiOzeti({ ad, tur, ozet }: { ad: string; tur: KalemAlternatifKarti['tur']; ozet: string }) {
  return (
    <span className="sa-ak-ozet">
      <b>{ad}</b> <Rozet ton={tur === 'sartli' ? 'uyari' : 'bilgi'} gorunum="cizgi">{TUR_ADI[tur]}</Rozet> <span>{ozet}</span>
    </span>
  );
}

// Ortak işaret kutusu yalnız düz metin etiket alır; burada etiket özet bileşenidir (aynı tc-isaret biçimi).
function Isaret({ checked, degistir, children, ipucu }: { checked: boolean; degistir: (acik: boolean) => void; children: ReactNode; ipucu?: string | undefined }) {
  return (
    <label className="tc-isaret sa-ak-satir">
      <input type="checkbox" checked={checked} onChange={(e) => degistir(e.target.checked)} />
      <span>{children}{ipucu && <span className="sa-talep-not"> {ipucu}</span>}</span>
    </label>
  );
}

// Yeni kalemde kart seçilince varsayılan işaretler yazılır (satır açılmasa da); kalem satırı ve ayrıntı aynı önbelleği okur.
export function useVarsayilanIsaretler(no: number | null, yeni: boolean, secili: readonly number[] | null, degistir: (l: number[]) => void): void {
  const sorgu = useQuery({
    queryKey: anahtarlar.kabulZarfi(no ?? 0),
    queryFn: () => cagri.get('/satin-alma-kabul-zarfi/:no', { parametre: { no: no ?? 0 }, ...SURE }),
    enabled: no !== null,
  });
  useEffect(() => {
    if (yeni && secili === null && (sorgu.data?.alternatifKartlari?.length ?? 0) > 0) degistir(varsayilanIsaretler(sorgu.data!.alternatifKartlari!));
  }, [yeni, secili, sorgu.data, degistir]);
}

// secili null: kalem henüz dokunulmamış. Yeni kalemde varsayılan işaretler yazılır; var olan kalemde değişmeden gönderilmez.
export function AlternatifKartlari({ no, sira, secili, onceki, yeni, degistir, yenile = [], yenileDegistir = () => undefined }: {
  no: number; sira: number; secili: readonly number[] | null; onceki: readonly KalemAlternatifKarti[]; yeni: boolean; degistir: (l: number[]) => void;
  yenile?: readonly number[]; yenileDegistir?: (l: number[]) => void;
}) {
  const [kalsin, kalsinYaz] = useState<number[]>([]);
  const sorgu = useKabulZarfi(no);
  const liste = sorgu.data?.alternatifKartlari ?? [];
  useVarsayilanIsaretler(no, yeni, secili, degistir);
  if (sorgu.isPending) return <p className="sa-talep-not">Alternatif kartları okunuyor</p>;
  if (sorgu.isError) return <p className="sa-talep-not">Alternatif kartları okunamadı; kalem kabul sınırıyla gider.</p>;
  const isaretli = secili ?? onceki.flatMap((x) => (x.setId === null ? [] : [x.setId]));
  // Kartta artık talepte kullanılmayan ama bu kalemde işaretli olan kart işaretlendiği hâliyle görünür; kaldırılabilir, yeniden eklenemez.
  const eski = onceki.filter((x) => x.setId !== null && !liste.some((o) => o.id === x.setId) && isaretli.includes(x.setId));
  const silinen = onceki.filter((x) => x.setId === null);
  const kartAc = <>Yeni alternatif kartı <a href={ALTERNATIF_SAYFASI.yol} target="_blank" rel="noopener">{ALTERNATIF_SAYFASI.baslik}</a> sayfasında açılır; yeni sekmede açılır, bu form açık kalır.</>;
  if (liste.length === 0 && eski.length === 0 && silinen.length === 0) return <p className="sa-talep-not">Bu malzemenin alternatif kartı yok. {kartAc}</p>;
  // Y10: ana kart ölçüsü (ya da kart) değişti; işaret işaretlendiği hâliyle duruyor. Talep eden yeni özeti yazar ya da eskisinde bırakır.
  const degisen = onceki.flatMap((x) => {
    const o = x.setId === null ? undefined : liste.find((y) => y.id === x.setId);
    return o !== undefined && o.ozet !== x.ozet && isaretli.includes(o.id) && !kalsin.includes(o.id) ? [{ eski: x, yeni: o }] : [];
  });
  const tikla = (id: number, acik: boolean) => degistir(acik ? [...isaretli.filter((x) => x !== id), id] : isaretli.filter((x) => x !== id));
  return (
    <fieldset className="sa-ak" aria-label={`Kalem ${String(sira)}: kabul edilen alternatif kartları`}>
      <legend className="sa-kabul-baslik"><span><Simge ad="layers" boyut="k" /> <b>Kabul edilen alternatif kartları</b></span></legend>
      {degisen.map(({ eski, yeni: y }) => (
        <div key={`d${String(y.id)}`} className="sa-ak-degisti" role="status">
          <span><Simge ad="alert" boyut="k" /> {yenile.includes(y.id)
            ? <>{y.ad} kaydedince bugünkü sınırla yazılacak: <b>{y.ozet}</b>.</>
            : <>{y.ad} şu an <b>{y.ozet}</b>; bu talepte <b>{eski.ozet}</b> olarak işaretlenmişti. Talep ve gönderilmiş formlar işaretlendiği hâliyle kalır.</>}</span>
          {!yenile.includes(y.id) && (
            <span className="sa-ak-degisti-eylem">
              <Dugme onClick={() => { yenileDegistir([...yenile, y.id]); degistir([...isaretli]); }}>Yeni sınırla güncelle</Dugme>
              <Dugme onClick={() => kalsinYaz([...kalsin, y.id])}>Eski sınırla kalsın</Dugme>
            </span>
          )}
        </div>
      ))}
      {liste.map((o) => (
        <Isaret key={o.id} checked={isaretli.includes(o.id)} degistir={(acik) => tikla(o.id, acik)}
          ipucu={o.tur === 'sartli' ? 'Şartlı: işaretlerseniz satın alma bu kartla teklif alabilir.' : o.uyanSayisi === 0 ? 'Uyan kart yok; teklif ve siparişe sınır olarak gider.' : undefined}>
          <AlternatifKartiOzeti ad={o.ad} tur={o.tur} ozet={o.ozet} />
        </Isaret>
      ))}
      {eski.map((o) => (
        <Isaret key={`e${String(o.setId)}`} checked degistir={() => tikla(o.setId!, false)} ipucu="Kartta artık talepte kullanılmıyor; işaretlendiği hâliyle kalır.">
          <AlternatifKartiOzeti ad={o.ad} tur={o.tur} ozet={o.ozet} />
        </Isaret>
      ))}
      {silinen.map((o, i) => (
        <p key={`s${String(i)}`} className="sa-talep-not"><AlternatifKartiOzeti ad={o.ad} tur={o.tur} ozet={o.ozet} /> (kart kaldırıldı; işaretlendiği hâliyle kalır)</p>
      ))}
      <p className="sa-talep-not">Satın alma yalnız işaretli kartlardaki alternatifle teklif alabilir; şartlı kart varsayılan işaretsizdir. {kartAc}</p>
    </fieldset>
  );
}
