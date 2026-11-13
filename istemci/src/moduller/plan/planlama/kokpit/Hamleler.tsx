import { useEffect, useMemo, useState } from 'react';
import { Dugme } from '../../../../ortak/arayuz/index.ts';
import { isTasiOnizle } from '../motor/atolye/gonder.ts';
import { planaAlOnizle } from './plana-al.ts';
import { onizlemeBitisi, sureYaz, turAdaylari, type KokpitEmri, type KokpitModeli, type TurAdayi } from './kurallar.ts';

// Bir emrin (ya da seçili adımının) tek işi taşıyan hamle seçenekleri. Yerleri istemci seçer, sonucu sunucu önizlemesi verir: önizlemeler
// sırayla istenir, bileşen kapanınca ya da plan değişince kalanlar istenmez. Önizleme okunamazsa seçenek sonuçsuz gösterilir; taşımayı
// sunucu yine denetler.
export interface HamleOzellikleri {
  m: KokpitModeli; e: KokpitEmri; isId: string | null;
  zaman: (t: number) => string;
  // Yazamayan kişide ve komut sürerken null.
  uygula: ((a: TurAdayi, gecBirakir: boolean) => void) | null;
  // Tur: en iyi hamle tek başına durur, ötekiler "Başka çözüm" altında tek dokunuşla onun yerine geçer.
  tek?: boolean;
  // Öne çıkan hamle (tahtada yeri gösterilir); hamle kalmayınca null.
  oneri?: (a: TurAdayi | null) => void;
  // Sayfanın gördüğü çalışma sürümü: plana alma önizlemesi eski plana göre yer göstermez.
  surum: number | null;
  // Kalanını oynat: önizlemeler bitince öne çıkan hamle (yoksa ya da onay istiyorsa null) bir kez bildirilir; kararı sayfa verir.
  oynat?: ((a: TurAdayi | null) => void) | null;
  // Matris: seçili adımın seçenekleri de yalnız emri erken bitirenlerdir ve ilki öne çıkar.
  yalnizKazanc?: boolean;
}

// Taşıma ve plana alma önizlemesinin ortak yüzü. bitis: plana almada sunucunun verdiği tahmin (fason adımlı emirde null).
interface Onizleme { gecerli: boolean; ileti: string | null; isler: { isId: string; S: number; C: number; tur?: string }[]; bitis?: number | null }
type Sonuc = Onizleme | 'okunamadi';
const onizle = (a: TurAdayi, surum: number | null): Promise<Onizleme | null> =>
  (a.planaAl === undefined ? isTasiOnizle(a) : surum === null ? Promise.resolve(null) : planaAlOnizle({ emirId: a.planaAl, tezgah: a.tezgah, baslangic: a.baslangic }, surum));
const anahtar = (a: TurAdayi): string => `${a.isId}|${a.tezgah}|${String(a.baslangic)}`;

export function Hamleler({ m, e, isId, zaman, uygula, tek = false, oneri, surum, oynat = null, yalnizKazanc = false }: HamleOzellikleri) {
  const adaylar = useMemo(() => turAdaylari(m, e, isId), [m, e, isId]);
  const [sonuc, setSonuc] = useState<Record<string, Sonuc>>({});
  const [secilen, setSecilen] = useState<string | null>(null);
  // Önizlemelerin hangi aday listesi ve sürüm için bittiği: eski planın sonuçlarıyla otomatik karar verilmez.
  const [biten, setBiten] = useState<{ adaylar: readonly TurAdayi[]; surum: number | null } | null>(null);
  useEffect(() => {
    let gecerli = true;
    setSonuc({}); setSecilen(null);
    void (async () => {
      for (const a of adaylar) {
        const r = await onizle(a, surum);
        if (!gecerli) return;
        setSonuc((s) => ({ ...s, [anahtar(a)]: r ?? 'okunamadi' }));
      }
      if (gecerli) setBiten({ adaylar, surum });
    })();
    return () => { gecerli = false; };
  }, [adaylar, surum]);

  const kod = (id: string): string => m.tezgahlar.find((t) => t.id === id)?.kod ?? id;
  // Emrin bütünü için önerilen hamle (adım seçilmeden) emri erken bitirmiyorsa öneri değildir: ara adımı öne almak, son adım yerinde kaldıkça
  // bitişi değiştirmez. Seçili adımın tezgâh seçenekleri ise olduğu gibi gösterilir.
  const gecerliler = adaylar.filter((a) => {
    const r = sonuc[anahtar(a)];
    if (!r || r === 'okunamadi') return true;
    if (!r.gecerli) return false;
    if (a.planaAl !== undefined || (isId !== null && !yalnizKazanc) || e.bitis === null) return true;
    const bitis = onizlemeBitisi(m, e, r.isler.map((y) => ({ isId: y.isId, C: y.C })));
    return bitis === null || bitis < e.bitis - 0.01;
  });
  const one = tek ? gecerliler.find((a) => anahtar(a) === secilen) ?? gecerliler[0] ?? null : null;
  const oneAnahtari = one ? anahtar(one) : null;
  useEffect(() => {
    if (!oneri) return undefined;
    oneri(one);
    return () => { oneri(null); };
    // Aday nesnesi her çizimde yenidir; öne çıkan hamle anahtarıyla izlenir.
  }, [oneAnahtari, oneri]);
  const hazir = biten !== null && biten.adaylar === adaylar && biten.surum === surum && uygula !== null;
  useEffect(() => {
    if (!oynat || !hazir) return;
    const r = one ? sonuc[anahtar(one)] : undefined;
    if (!one || !r || r === 'okunamadi') { oynat(null); return; }
    const bitis = one.planaAl !== undefined ? r.bitis ?? null : onizlemeBitisi(m, e, r.isler.map((y) => ({ isId: y.isId, C: y.C })));
    const gecBirakir = bitis !== null && e.termin !== null && bitis - e.termin > 0.01 && e.durum !== 'gec';
    oynat(gecBirakir ? null : one);
    // Karar adım başına bir kez: plan ya da adım değişince önizlemeler yeniden biter.
  }, [oynat !== null, hazir]);
  if (!gecerliler.length) {
    if (e.durum !== 'plansiz') return <p className="tc-pyq-not">{isId !== null && yalnizKazanc ? 'Bu adımı taşımak emri erken bitirmiyor.' : 'Tek işi taşıyarak daha erkene alınacak boş yer yok; tahtadan elle bakın.'}</p>;
    const neden = adaylar.map((a) => sonuc[anahtar(a)]).find((r) => r && r !== 'okunamadi' && r.ileti);
    return <p className="tc-pyq-not">{neden && neden !== 'okunamadi' ? neden.ileti : 'Bu emir buradan plana alınamıyor; planı Planlama motoru sayfasında yeniden kurun.'}</p>;
  }
  const ozet = (a: TurAdayi) => {
    const r = sonuc[anahtar(a)];
    const oz = r && r !== 'okunamadi' ? r : null;
    const al = a.planaAl !== undefined;
    const bitis = !oz ? null : al ? oz.bitis ?? null : onizlemeBitisi(m, e, oz.isler.map((y) => ({ isId: y.isId, C: y.C })));
    const kazanc = bitis !== null && e.bitis !== null ? e.bitis - bitis : null;
    const gec = bitis !== null && e.termin !== null ? bitis - e.termin : null;
    const itilen = oz && !al ? oz.isler.filter((y) => y.tur !== 'tasinan').length : 0;
    // Plana almada ilk adımın oturduğu saat sunucudan gelir (dolu ya da kapalı saatte kayar).
    const S = al ? oz?.isler[0]?.S ?? a.baslangic : a.baslangic;
    const ad = al ? e.adimlar[0]?.ad ?? '' : m.isler[a.isId]?.ad ?? '';
    return { r, bitis, kazanc, gec, itilen, al, belirsiz: al && oz !== null && bitis === null, yer: `${ad} → ${kod(a.tezgah)} · ${zaman(S).slice(6)}` };
  };
  const satir = (a: TurAdayi, sira = 0) => {
    const { r, bitis, kazanc, gec, itilen, al, belirsiz, yer } = ozet(a);
    const gecBirakir = gec !== null && gec > 0.01 && e.durum !== 'gec';
    const dugme = al ? 'Plana al' : 'Uygula';
    return (
      <li key={anahtar(a)} data-hamle={a.tezgah}>
        <span>
          <b>{yer}</b>
          <small>
            {r === undefined ? 'hesaplanıyor'
              : belirsiz ? 'bitişi plan dizilince belli olur' : bitis === null ? 'sonucu sunucu taşırken denetler'
                : `biter ${zaman(bitis).slice(6)}${kazanc !== null && kazanc > 0.01 ? ` · ${sureYaz(kazanc)} erken` : ''}${gec === null ? '' : gec > 0.01 ? ` · ${al ? '' : 'yine '}${sureYaz(gec)} geç` : ' · termine yetişir'}${itilen ? ` · aynı emrin ${String(itilen)} adımı kayar` : ''}`}
          </small>
        </span>
        <Dugme tur={sira === 0 && (yalnizKazanc || (gec !== null && gec <= 0.01)) ? 'birincil' : 'ikincil'} simge="check" disabled={!uygula || r === undefined} onClick={() => { uygula?.(a, gecBirakir); }}>{tek ? (gecBirakir ? `Yine de ${al ? 'plana al' : 'uygula'}` : `${dugme}, sıradaki`) : dugme}</Dugme>
      </li>
    );
  };
  if (!one) return <ul className="tc-pyq-hamleler">{gecerliler.map((a, i) => satir(a, i))}</ul>;
  const baska = gecerliler.filter((a) => a !== one);
  return (
    <>
      <ul className="tc-pyq-hamleler" data-tek="">{satir(one)}</ul>
      {baska.length > 0 && (
        <div className="tc-pyq-baska" role="group" aria-label="Başka çözüm">
          <small>Başka çözüm</small>
          {baska.map((a) => {
            const { bitis, yer } = ozet(a);
            return <button type="button" key={anahtar(a)} data-baska={a.tezgah} onClick={() => { setSecilen(anahtar(a)); }}><b>{yer}</b>{bitis !== null && <small>biter {zaman(bitis).slice(6)}</small>}</button>;
          })}
        </div>
      )}
    </>
  );
}
