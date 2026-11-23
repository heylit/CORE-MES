import { useId, useState } from 'react';
import { Dugme, Rozet, Simge } from '../../../ortak/arayuz/index.ts';
import { matOf } from '../merkez/calc.ts';
import { S } from '../merkez/store.ts';
import type { PurchaseRequest, RequestItem } from '../merkez/tipler.ts';

// 3593 (kullanıcı 23.11 05:06Z): satın alma talebin başında kalemin malzemesini bütün ayrıntısıyla ve talep edenin işaretlediği alternatif
// kartlarını görür. Özellikler kartın bugünkü hâlidir; alternatifler işaretlendiği hâliyle (kart sonra değişse de). Çok kalemde kalem seçilir.
const ANA_ALANLAR = [['kalite', 'Kalite'], ['durum', 'Durum'], ['islem', 'İşlem'], ['olcu', 'Ölçü']] as const;
// Dar ekranda ilk dört özellik görünür; kalanı "Tümü" ile açılır.
const KISA = 4;
const sayi = new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 3 });

export function kalemOzellikleri(k: RequestItem): { ad: string; deger: string }[] {
  const m = k.malzeme;
  if (!m) return [];
  const ana = ANA_ALANLAR.flatMap(([a, ad]) => (m[a] ? [{ ad, deger: m[a] }] : []));
  const adlar = new Set(ana.map((x) => x.ad.toLocaleLowerCase('tr-TR')));
  return [...ana, ...m.ayrinti.filter((x) => !adlar.has(x.ad.toLocaleLowerCase('tr-TR')))];
}
// Kısa şerit metni: "6082 · T6 · Ø40 × 3000" (kalite, durum, ölçü).
export const kalemKisaOzeti = (k: RequestItem): string =>
  [k.malzeme?.kalite, k.malzeme?.durum, k.malzeme?.olcu].filter((x): x is string => !!x).join(' · ');

export function MalzemeSeridi({ r }: { r: PurchaseRequest }) {
  const kalemler = r.items ?? [];
  const [secili, seciliYaz] = useState(0);
  const [tumu, tumuYaz] = useState(false);
  const kimlik = useId();
  if (kalemler.length === 0) return null;
  const i = Math.min(secili, kalemler.length - 1);
  const k = kalemler[i]!;
  const mid = matOf(k);
  const kod = mid ? S.materials[mid]?.code ?? '' : '';
  const ozellik = kalemOzellikleri(k);
  const ak = k.alternatifler ?? [];
  const miktar = k.qty === null ? null : `${sayi.format(k.qty)} ${k.unit}`.trim();
  const diger = kalemler.filter((_, j) => j !== i);
  return (
    <section className="sa-mal-serit" aria-label="Kalemin malzemesi ve alternatifleri">
      <div className="sa-mal-serit-ust">
        {kalemler.length > 1 && (
          <label className="sa-mal-serit-kalem">
            <Simge ad="list" boyut="k" />
            <span className="tc-gizli-etiket">Kalem seç</span>
            <select className="tc-alan-kutu" value={i} onChange={(e) => { seciliYaz(Number(e.target.value)); tumuYaz(false); }}>
              {kalemler.map((x, j) => <option key={x.id} value={j}>{`Kalem ${String(j + 1)} / ${String(kalemler.length)}: ${x.name}`}</option>)}
            </select>
          </label>
        )}
        {kod && <span className="sa-mal-serit-kod">{kod}</span>}
        <b className="sa-mal-serit-ad">{k.name}</b>
        {miktar && <span className="sa-mal-serit-miktar">{miktar}</span>}
        {diger.length > 0 && <span className="sa-mal-serit-diger">+{diger.length} kalem: {diger.slice(0, 3).map((x) => x.name).join(', ')}{diger.length > 3 ? '…' : ''}</span>}
      </div>
      {ozellik.length > 0 ? (
        <>
          <dl className="sa-mal-serit-oz" id={`${kimlik}-oz`} data-tumu={tumu ? '' : undefined}>
            {ozellik.map((x, j) => (
              <div key={x.ad} className={j >= KISA ? 'sa-mal-serit-fazla' : undefined}><dt>{x.ad}</dt><dd>{x.deger}</dd></div>
            ))}
          </dl>
          {ozellik.length > KISA && (
            <span className="sa-mal-serit-tumu">
              <Dugme simge={tumu ? 'up' : 'down'} aria-expanded={tumu} aria-controls={`${kimlik}-oz`} onClick={() => tumuYaz(!tumu)}>
                {tumu ? 'Daha az' : `Tümü (${String(ozellik.length)})`}
              </Dugme>
            </span>
          )}
        </>
      ) : <p className="sa-mal-serit-not">{k.materialId ? 'Kartın özellikleri okunamadı.' : 'Kartsız kalem; özellik yok.'}</p>}
      {k.materialId && (
        <div className="sa-mal-serit-ak">
          <span className="sa-mal-serit-baslik"><Simge ad="layers" boyut="k" /> Kabul edilen alternatifler</span>
          {ak.length === 0 ? <span className="sa-mal-serit-not">İşaretli alternatif kartı yok; kalem talep edenin kabul sınırıyla gider.</span>
            : ak.map((a, j) => (
              <span key={`${a.ad}-${String(j)}`} className="sa-mal-serit-ak-satir">
                <b>{a.ad}</b> <Rozet ton={a.tur === 'sartli' ? 'uyari' : 'bilgi'} gorunum="cizgi">{a.tur === 'sartli' ? 'şartlı' : a.tur === 'ust' ? 'üst' : 'tam'}</Rozet> {a.ozet}
                {a.setId === null && <span className="sa-mal-serit-not"> (kart kaldırıldı)</span>}
              </span>
            ))}
        </div>
      )}
    </section>
  );
}
