import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { Hamleler, type HamleOzellikleri } from './Hamleler.tsx';
import { durumYazisi, type KokpitEmri, type KokpitModeli } from './kurallar.ts';

// Sorunları sırayla çöz: her sorunlu emir bir adımdır (geç, sonra riskli). En iyi hamle öne çıkar ve tahtada yeri gösterilir, ötekiler "Başka çözüm"dür. Karar uygula ya da atla'dır; Önceki adım son kararı geri alıp o
// adıma döner, Sonraki adım geri alınmış kararı yeniden verir. Uygulanan hamle taslağa (planlama çalışmasına) o anda yazılır, çünkü sonraki
// adımın önizlemesini sunucu kayıtlı çalışmadan hesaplar; Vazgeç turda uygulananların hepsini geri alır, "Taslağa yaz" turu tek
// değişiklik olarak bırakır (sayfanın Geri'si hepsini birlikte alır).
export interface TurKarari { i: number; uygulandi: boolean }
export interface TurDurumu { idler: string[]; i: number; gecmis: TurKarari[]; ileri: TurKarari[] }
export interface TurOzellikleri extends Pick<HamleOzellikleri, 'zaman' | 'uygula' | 'oneri'> {
  m: KokpitModeli; tur: TurDurumu;
  // Sıradaki emir; tur bittiyse ya da emir plandan düştüyse null.
  e: KokpitEmri | null;
  atla: () => void; onceki: () => void; sonraki: () => void;
  bitir: () => void; vazgec: () => void;
  mesgul: boolean;
}

const Sayi = ({ n }: { n: number }) => (n > 0 ? <b className="tc-pyq-rozet" aria-hidden="true">{n}</b> : null);

export function Tur({ m, tur, e, zaman, uygula, oneri, atla, onceki, sonraki, bitir, vazgec, mesgul }: TurOzellikleri) {
  const bitti = tur.i >= tur.idler.length;
  const uygulanan = tur.gecmis.filter((k) => k.uygulandi).length;
  return (
    <aside className="tc-pyq-ayrinti tc-pyq-tur" aria-label="Sorunları sırayla çöz">
      <header>
        <div><b>Sorunları sırayla çöz</b><small>{bitti ? 'tur bitti' : `${String(tur.i + 1)} / ${String(tur.idler.length)}`} · {uygulanan} hamle uygulandı</small></div>
        <button type="button" className="tc-pyq-kucuk" onClick={vazgec} disabled={mesgul}>Vazgeç</button>
      </header>
      {bitti ? (
        <>
          <p className="tc-pyq-not" role="status">{uygulanan} hamle uygulandı, {tur.gecmis.length - uygulanan} emir atlandı. Atlananlara tahtadan elle bakın.</p>
          <div className="tc-pyq-ayak">
            <Dugme tur="birincil" simge="check" onClick={bitir} disabled={mesgul}>Taslağa yaz</Dugme>
          </div>
        </>
      ) : e ? (
        <>
          <dl>
            <div><dt>Emir</dt><dd>{e.no} · {e.urun}</dd></div>
            <div><dt>Sorun</dt><dd data-d={e.durum}>{durumYazisi(e)}</dd></div>
            <div><dt>Termin</dt><dd>{e.termin === null ? '–' : zaman(e.termin)}</dd></div>
          </dl>
          <h3>Hamle</h3>
          <Hamleler m={m} e={e} isId={null} zaman={zaman} uygula={uygula} tek oneri={oneri} />
        </>
      ) : <p className="tc-pyq-not">Bu emir artık planda değil.</p>}
      <div className="tc-pyq-ayak" data-tur-ayak="">
        {!bitti && <Dugme simge="next" onClick={atla} disabled={mesgul}>Atla</Dugme>}
        <button type="button" className="tc-pyq-ok" aria-label="Önceki adım" title="Önceki adım (←)" disabled={mesgul || !tur.gecmis.length} onClick={onceki}><Simge ad="chev-left" boyut="k" /><span>Önceki adım</span><Sayi n={tur.gecmis.length} /></button>
        <button type="button" className="tc-pyq-ok" aria-label="Sonraki adım" title="Sonraki adım (→)" disabled={mesgul || !tur.ileri.length} onClick={sonraki}><span>Sonraki adım</span><Simge ad="chev-right" boyut="k" /><Sayi n={tur.ileri.length} /></button>
      </div>
    </aside>
  );
}
