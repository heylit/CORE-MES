import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import { M } from '../bicim.ts';
import { useMesaj } from '../durum.tsx';
import { benimYanitim, katilimciMi, toplantiBitisi, toplantiZamani } from '../kurallar.ts';
import { KisiRozeti, TOPLANTI_YANITLARI } from '../ortak/index.ts';
import type { Kayit, Toplanti } from '../tipler.ts';
import { useIsEylemleri, type Katilim } from './eylemler.ts';
import { KisiIsareti } from './parcalar.tsx';
import './kartlar.css';

const AYLAR = ['OCA', 'ŞUB', 'MAR', 'NİS', 'MAY', 'HAZ', 'TEM', 'AĞU', 'EYL', 'EKİ', 'KAS', 'ARA'];

// Toplantı başlamadan 5 dakika önceden bitişe kadar canlıdır (Katıl görünür).
export const canliMi = (mt: Toplanti, simdi: number) => simdi >= mt.start - 5 * M && simdi < toplantiBitisi(mt);

// Prototipin rsvpChips'i: düzenleyen önce ve "Katılıyor" sayılır.
export function Katilimcilar({ toplanti: mt }: { toplanti: Toplanti }) {
  const { ad } = useMesaj();
  const kisiler = [mt.by, ...(mt.attendees || []).filter((u) => u !== mt.by)];
  return (
    <div className="tc-mi-kisiler">
      {kisiler.map((u) => {
        const r = benimYanitim(mt, u);
        return (
          <KisiIsareti
            key={u} id={u} durum={r === 'yes' ? 'ok' : r === 'no' ? 'no' : r === 'maybe' ? 'maybe' : ''}
            isaret={r ? TOPLANTI_YANITLARI[r].s : '…'}
            baslik={`${ad(u)}: ${r ? TOPLANTI_YANITLARI[r].t : 'yanıt bekleniyor'}${u === mt.by ? ' (düzenleyen)' : ''}`}
          />
        );
      })}
    </div>
  );
}

// Prototipin rsvpBtns'i: düzenleyen, katılımcı olmayan ve geçmiş ya da iptal toplantıda yoktur.
export function KatilimDugmeleri({ toplanti: mt }: { toplanti: Kayit<Toplanti> }) {
  const { ben, yetki } = useMesaj();
  const { katilim } = useIsEylemleri();
  if (!yetki.yaz || mt.cancelled || mt.by === ben.id || !katilimciMi(mt, ben.id) || toplantiBitisi(mt) < Date.now()) return null;
  const r = benimYanitim(mt, ben.id);
  return (
    <div className="tc-mi-katilim" role="group" aria-label="Katılım yanıtı">
      {(Object.keys(TOPLANTI_YANITLARI) as Katilim[]).map((k) => (
        <button
          key={k} type="button" className={`tc-mi-katilim-${k}`} aria-pressed={r === k}
          onClick={(o) => { o.stopPropagation(); katilim(mt.id, k); }}
        >
          {TOPLANTI_YANITLARI[k].t}
        </button>
      ))}
    </div>
  );
}

export function KatilBaglantisi({ toplanti: mt, metin = 'Katıl' }: { toplanti: Toplanti; metin?: string }) {
  if (!mt.link || mt.cancelled || !canliMi(mt, Date.now())) return null;
  return (
    <a className="tc-mi-katil" href={mt.link} target="_blank" rel="noopener noreferrer" onClick={(o) => o.stopPropagation()}>
      <Simge ad="play" />{metin}
    </a>
  );
}

function YerVeBaglanti({ toplanti: mt }: { toplanti: Toplanti }) {
  return (
    <>
      {mt.loc && <span><Simge ad="pin" />{mt.loc}</span>}
      {mt.link && <span><Simge ad="laptop" />Çevrim içi</span>}
    </>
  );
}

// Prototipin meetCard'ı (sohbette davet kartı ve Bugün).
export function ToplantiKarti({ toplanti: mt, iletide }: { toplanti: Kayit<Toplanti>; iletide?: boolean }) {
  const { ayrintiAc } = useMesaj();
  const { toplantiIcs } = useIsEylemleri();
  const d = new Date(mt.start);
  return (
    <div className={`tc-mi-satir tc-mi-toplanti${mt.cancelled ? ' tc-mi-iptal' : ''}${iletide ? ' tc-mi-iletide' : ''}`}>
      <span className="tc-mi-takvim-kutusu" aria-hidden="true"><span>{AYLAR[d.getMonth()]}</span><b>{d.getDate()}</b></span>
      <div className="tc-mi-govde">
        <button type="button" className="tc-mi-baslik" onClick={() => ayrintiAc({ tur: 'toplanti', id: mt.id })}>
          {mt.cancelled ? <><s>{mt.title}</s> (iptal)</> : mt.title}
        </button>
        <div className="tc-mi-ust"><span>{toplantiZamani(mt)}</span><YerVeBaglanti toplanti={mt} /></div>
        <Katilimcilar toplanti={mt} />
        <KatilimDugmeleri toplanti={mt} />
        <div className="tc-mi-eylemler">
          <KatilBaglantisi toplanti={mt} />
          {!mt.cancelled && <Dugme simge="download" onClick={() => toplantiIcs(mt.id)}>Takvimime ekle</Dugme>}
        </div>
      </div>
    </div>
  );
}

// Prototipin meetRow'u (takvim ve ajanda satırı).
export function ToplantiSatiri({ toplanti: mt }: { toplanti: Kayit<Toplanti> }) {
  const { ben, ayrintiAc } = useMesaj();
  const simdi = Date.now();
  const r = benimYanitim(mt, ben.id);
  const gecti = toplantiBitisi(mt) < simdi;
  const ac = () => ayrintiAc({ tur: 'toplanti', id: mt.id });
  const yuzler = [mt.by, ...(mt.attendees || [])].filter((v, i, a) => a.indexOf(v) === i).slice(0, 5);
  return (
    <div className={`tc-mi-satir tc-mi-toplanti${gecti ? ' tc-mi-gecmis' : ''}${mt.cancelled ? ' tc-mi-iptal' : ''}`} onClick={ac}>
      <span className="tc-mi-saat">
        <b>{new Intl.DateTimeFormat('tr-TR', { hour: '2-digit', minute: '2-digit' }).format(mt.start)}</b>
        <span>{mt.dur || 30} dk</span>
      </span>
      <div className="tc-mi-govde">
        <button type="button" className="tc-mi-baslik" onClick={(o) => { o.stopPropagation(); ac(); }}>
          {mt.cancelled ? <><s>{mt.title}</s> (iptal)</> : mt.title}
        </button>
        <div className="tc-mi-ust">
          <YerVeBaglanti toplanti={mt} />
          <span className="tc-mi-yuzler">{yuzler.map((u) => <KisiRozeti key={u} id={u} boyut="s" />)}</span>
          {r
            ? <span className={`tc-mi-yanit tc-mi-yanit-${r}`}>{TOPLANTI_YANITLARI[r].t}</span>
            : katilimciMi(mt, ben.id) && !gecti && <span className="tc-mi-yanit tc-mi-yanit-bekliyor">Yanıt bekleniyor</span>}
        </div>
        {!r && !gecti && <KatilimDugmeleri toplanti={mt} />}
      </div>
      <KatilBaglantisi toplanti={mt} />
    </div>
  );
}
