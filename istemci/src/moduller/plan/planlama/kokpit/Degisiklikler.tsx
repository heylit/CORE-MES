import { Dugme, Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import { BASLIK_ADI, BASLIK_NOTU, BASLIKLAR, degisiklikDokumu, type Degisiklik } from './degisiklikler.ts';

// Planı etkileyen değişiklikler (3317 a, 1. adım). İki parça: plan şeridinin satırındaki özet ("N değişiklik", döküm, "Gör ve uygula") ve
// şeridin altında açılan liste (üç başlık, satırda "Göster"). Liste yalnız gösterir; veri değişiklikleri şeritteki toplu düğmeyle uygulanır.
export function DegisiklikOzeti({ l, acik, ac }: { l: readonly Degisiklik[]; acik: boolean; ac: (a: boolean) => void }) {
  if (l.length === 0) return <span className="tc-pyq-dg-ozet" data-degisiklik-ozeti=""><Rozet ton="tamam">Plan güncel</Rozet></span>;
  return (
    <span className="tc-pyq-dg-ozet" data-degisiklik-ozeti="">
      <b>{l.length} değişiklik</b>
      <span className="tc-pyq-dg-dokum">{degisiklikDokumu(l)}</span>
      <button type="button" className="tc-dugme tc-pym-kucuk" aria-label={acik ? 'Değişiklikleri kapat' : 'Gör ve uygula'} aria-expanded={acik} aria-controls="tc-pyq-dg-liste" onClick={() => { ac(!acik); }}>
        <span>{acik ? 'Kapat' : 'Gör ve uygula'}</span><Simge ad={acik ? 'up' : 'down'} boyut="k" />
      </button>
    </span>
  );
}

export interface DegisikliklerOzellikleri {
  l: readonly Degisiklik[];
  // Seçili kartın emirleri ve adı: süzgeç açıkken yalnız bu emirlerin satırları görünür.
  kart: { ad: string; emirler: ReadonlySet<string> } | null;
  suzgec: boolean;
  suzgecKoy: (a: boolean) => void;
  // Satırın emrini (ve varsa işini) seçer; liste kapanır.
  goster: (d: Degisiklik) => void;
  // Toplu düğmenin uygulayacağı veri değişikliği sayısı; düğme yoksa (yazamayan kişi, uygulanacak yok) null.
  toplu: number | null;
}

export function Degisiklikler({ l, kart, suzgec, suzgecKoy, goster, toplu }: DegisikliklerOzellikleri) {
  const kartta = kart === null ? [] : l.filter((d) => d.emirId !== null && kart.emirler.has(d.emirId));
  const suzulu = suzgec && kart !== null && kartta.length > 0;
  const gorunen = suzulu ? kartta : l;
  return (
    <section className="tc-pyq-dg" id="tc-pyq-dg-liste" aria-label="Planı etkileyen değişiklikler">
      {kart !== null && kartta.length > 0 && (
        <p className="tc-pyq-dg-suzgec">
          {suzulu ? <><b>{kart.ad} için</b> · {kartta.length} değişiklik</> : <>{kart.ad} için {kartta.length} değişiklik var</>}
          <button type="button" className="tc-pyq-kucuk" aria-pressed={suzulu} onClick={() => { suzgecKoy(!suzulu); }}>{suzulu ? 'Tümünü göster' : `Yalnız ${kart.ad}`}</button>
        </p>
      )}
      {BASLIKLAR.map((b) => {
        const satirlar = gorunen.filter((d) => d.baslik === b);
        if (satirlar.length === 0) return null;
        return (
          <section key={b} aria-label={BASLIK_ADI[b]} data-baslik={b}>
            <h3><b>{BASLIK_ADI[b]}</b> <span>{satirlar.length} · {BASLIK_NOTU[b]}</span></h3>
            <ul>
              {satirlar.map((d) => (
                <li key={d.anahtar}>
                  <div className="tc-pyq-dg-ne"><b>{d.ne}</b><small>{d.alt}</small></div>
                  {d.emirId !== null && <Dugme className="tc-pyq-dg-dugme" tur="ikincil" simge="eye" onClick={() => { goster(d); }}>Göster</Dugme>}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
      <p className="tc-pyq-not">
        {toplu !== null ? `"Veri değişikliklerini uygula (${String(toplu)})" yalnız "Veri değişti" satırlarının etkilediği işleri yeniden dizer. ` : ''}
        "Sahada oldu" ve "Plan geride" satırları bilgi içindir: "Göster" ile emre gidilir, düzeltme aşağıda elle yapılır.
      </p>
    </section>
  );
}
