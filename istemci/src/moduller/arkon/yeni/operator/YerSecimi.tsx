import { useState } from 'react';
import { Dugme, Pencere, Simge } from '../../../../ortak/arayuz/index.ts';

// 3392 a madde 1-2: cihazı yere bağlama iki adımdır: 1 İstasyon, 2 Makine. Geniş ekranda iki sütun yan yana (istasyon seçilince makine
// sütunu açılır, tek birincil "Bağla" makine seçilene kadar pasif), dar ekranda adım adım. Yalnız istasyon yönetimi olan bağlar;
// "Makine sabit değil" her işte planın makinesini kullanır. Ayrılmış makine bağlanabilir: ayrım o saatteki başlatmayı yine engeller.
export interface YerIstasyonu { id: string; ad: string; merkez: string; makineler: readonly { id: string; ad: string }[] }
export const SABIT_DEGIL = '';

export function YerSecimi({ istasyonlar, istasyon, makine, ayrim, dar, bagla, kapat }: {
  istasyonlar: readonly YerIstasyonu[];
  istasyon: string;
  makine: string | null;
  // Makinenin ekrandaki işe göre ayrım açıklaması (yalnız bu istasyonda bilinir).
  ayrim: (makine: string) => string | null;
  dar: boolean;
  bagla: (istasyon: string, makine: string | null) => void;
  kapat: () => void;
}) {
  const [ist, istYaz] = useState(istasyonlar.some((x) => x.id === istasyon) ? istasyon : '');
  const [mk, mkYaz] = useState<string | null>(ist === istasyon ? (makine ?? SABIT_DEGIL) : null);
  const [adim, adimYaz] = useState<1 | 2>(1);
  const secili = istasyonlar.find((x) => x.id === ist) ?? null;
  const istasyonSec = (id: string) => { if (id !== ist) { istYaz(id); mkYaz(null); } };
  // Makinesiz istasyonda makine adımı yoktur: bağ "sabit değil" olur.
  const makinesiz = secili !== null && secili.makineler.length === 0;
  const hazir = secili !== null && (makinesiz || mk !== null);
  const bitir = () => { if (secili && hazir) bagla(secili.id, makinesiz || mk === SABIT_DEGIL ? null : mk); };
  const ikinciAdim = !dar || adim === 2;
  const birinciAdim = !dar || adim === 1;
  const sonAdim = !dar || adim === 2 || makinesiz;

  const istasyonSutunu = (
    <section className="tc-ay1-yer-sutun" aria-label="1 İstasyon">
      <h3><span className="tc-ay1-yer-no" data-tamam={secili ? '' : undefined}>{secili ? <Simge ad="check" boyut="k" /> : '1'}</span>İstasyon</h3>
      <div className="tc-ay1-yer-liste" role="radiogroup" aria-label="İstasyon">
        {istasyonlar.map((x) => (
          <button key={x.id} type="button" role="radio" aria-checked={x.id === ist} className="tc-ay1-yer-oge" data-secili={x.id === ist ? '' : undefined} onClick={() => istasyonSec(x.id)}>
            <Simge ad="pin" />
            <span><b>{x.id}</b><small>{[x.ad, x.merkez, x.makineler.length ? `${String(x.makineler.length)} makine` : 'makinesiz'].filter(Boolean).join(' · ')}</small></span>
            {x.id === ist ? <Simge ad="check" /> : null}
          </button>
        ))}
      </div>
    </section>
  );
  const makineSutunu = (
    <section className="tc-ay1-yer-sutun" aria-label="2 Makine" data-pasif={secili ? undefined : ''}>
      <h3><span className="tc-ay1-yer-no">2</span>Makine{secili ? ` · ${secili.id}` : ''}</h3>
      {!secili ? <p className="tc-ay1-soluk">Önce istasyonu seçin.</p> : makinesiz ? <p className="tc-ay1-soluk">Bu istasyonda makine yok; iş istasyona yazılır.</p> : (
        <div className="tc-ay1-yer-liste" role="radiogroup" aria-label="Makine">
          {secili.makineler.map((m) => {
            const a = secili.id === istasyon ? ayrim(m.id) : null;
            return (
              <button key={m.id} type="button" role="radio" aria-checked={mk === m.id} className="tc-ay1-yer-oge" data-secili={mk === m.id ? '' : undefined} onClick={() => mkYaz(m.id)}>
                <Simge ad="cpu" />
                <span><b>{m.id}</b><small>{m.ad || m.id}</small></span>
                {a ? <span className="tc-ay1-yer-rozet" title={a}>Ayrılmış</span> : null}
              </button>
            );
          })}
          <button type="button" role="radio" aria-checked={mk === SABIT_DEGIL} className="tc-ay1-yer-oge" data-secili={mk === SABIT_DEGIL ? '' : undefined} onClick={() => mkYaz(SABIT_DEGIL)}>
            <Simge ad="calendar" />
            <span><b>Makine sabit değil</b><small>Her işte planın makinesi; yoksa sorulur</small></span>
          </button>
        </div>
      )}
    </section>
  );
  const alt = (
    <>
      {dar && adim === 2 ? <Dugme simge="back" onClick={() => adimYaz(1)}>Geri</Dugme> : <Dugme simge="x" onClick={kapat}>Vazgeç</Dugme>}
      {sonAdim
        ? <Dugme tur="birincil" simge="lock" disabled={!hazir} onClick={bitir}>Bağla</Dugme>
        : <Dugme tur="birincil" simge="next" disabled={!secili} onClick={() => adimYaz(2)}>İleri</Dugme>}
    </>
  );
  return (
    <Pencere acik kapat={kapat} baslik="Bu cihazı yere bağla" alt={alt}>
      <div className="tc-ay1-yer-bagla">
        <p className="tc-ay1-soluk">Bir kez yapılır; operatör seçim görmez. Kayıtlar bağlanan istasyona ve makineye yazılır.</p>
        {dar ? (
          <ol className="tc-ay1-yer-adimlar" aria-label="Adımlar">
            <li aria-current={adim === 1 ? 'step' : undefined} data-tamam={adim === 2 ? '' : undefined}>1 İstasyon</li>
            <li aria-current={adim === 2 ? 'step' : undefined}>2 Makine</li>
          </ol>
        ) : null}
        <div className="tc-ay1-yer-sutunlar">
          {birinciAdim ? istasyonSutunu : null}
          {ikinciAdim && !(dar && makinesiz) ? makineSutunu : null}
        </div>
      </div>
    </Pencere>
  );
}
