import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { TaslakKomutu } from '#paylasilan/sozlesme/planlama.ts';
import { Dugme, Simge } from '../../../../ortak/arayuz/index.ts';
import type { PlanlamaCalismasi } from '../tipler.ts';
import { EtkiBolumu, useEtki } from './etki.tsx';
import { adimEkleri, adimEkYazisi, type KokpitModeli } from './kurallar.ts';
import type { TaslakYazici } from './taslak.ts';

// Adıma sorun bildirme (3335 a, dilim 3b): planda yeri olan adımın kaç saat uzadığı kişinin taslağına komut olarak yazılır ve önce
// etkisiyle gösterilir (etki.tsx, Duruş ve mesai ile aynı akış). Süre adımın plandaki bitişine eklenir; kural ve sınırlar sunucudadır.

const EN_AZ = 0.25, EN_COK = 240;
const ARALIK = 'Uzamayı 0,25 ile 240 saat arasında, çeyrek saat adımıyla girin.';

// Girilen saat: virgül de kabul edilir; çeyrek saatin katı değilse ya da aralık dışındaysa null.
export function ekSaatOku(v: string): number | null {
  const n = Number(v.trim().replace(',', '.'));
  if (v.trim() === '' || !Number.isFinite(n) || n < EN_AZ || n > EN_COK || Math.abs(n * 4 - Math.round(n * 4)) > 1e-9) return null;
  return Math.round(n * 4) / 4;
}

export interface AdimSorunuOzellikleri {
  c: PlanlamaCalismasi;
  m: Pick<KokpitModeli, 'isler' | 'emirler' | 'tezgahlar'>;
  isId: string;
  taslak: TaslakYazici | null;
  yazabilir: boolean;
  zaman: (t: number) => string;
  kapat: () => void;
}

export function AdimSorunu({ c, m, isId, taslak, yazabilir, zaman, kapat }: AdimSorunuOzellikleri) {
  const x = m.isler[isId];
  const emir = m.emirler.find((e) => e.adimlar.some((a) => a.id === isId));
  const kayitli = adimEkleri(c)[isId] ?? null;
  const [saat, setSaat] = useState(() => (kayitli === null ? '' : String(kayitli).replace('.', ',')));
  const [hata, setHata] = useState<string | null>(null);
  const { durum, dene, uygula, vazgec } = useEtki({ c, taslak, sonuc: () => undefined });
  const kilitli = !yazabilir || taslak === null || taslak.mesgul || durum.tur === 'hesap' || durum.tur === 'etki';
  const kok = useRef<HTMLElement>(null);
  useEffect(() => {
    kok.current?.querySelector<HTMLElement>('#tc-pyq-adim-ek')?.focus({ preventScroll: true });
    kok.current?.scrollIntoView?.({ block: 'start' });
  }, []);

  const gonder = (e: FormEvent) => {
    e.preventDefault();
    const n = ekSaatOku(saat);
    setHata(n === null ? ARALIK : null);
    if (n === null) return;
    void dene({ tur: 'adim-uzadi', isId, ekSaat: n } satisfies TaslakKomutu);
  };
  const kaldir = () => { setHata(null); void dene({ tur: 'adim-uzadi-sil', isId } satisfies TaslakKomutu); };
  const ileti = hata ?? (durum.tur === 'hata' ? durum.ileti : null);
  const tezgah = x ? (x.fason ? 'Fason' : m.tezgahlar.find((t) => t.id === x.m)?.kod ?? x.m) : null;

  return (
    <aside ref={kok} className="tc-pyq-ayrinti tc-pyq-ayarlar tc-pyq-adim-sorunu" aria-label="Adıma sorun bildir">
      <header>
        <div><b>Adıma sorun bildir</b><small>Adım beklenenden uzun sürüyorsa kaç saat uzadığını yazın.</small></div>
        <button type="button" className="tc-pyq-simge-dugme" aria-label="Adıma sorun bildirmeyi kapat" onClick={kapat}><Simge ad="x" boyut="k" /></button>
      </header>
      {!x ? <p className="tc-pyq-not">Bu adım planda yerleşmemiş; önce plana alın.</p> : (
        <>
          <dl className="tc-pyq-adim-ozet">
            <div><dt>Operasyon</dt><dd>{emir ? `${emir.no} · ${x.ad}` : x.ad}</dd></div>
            <div><dt>Tezgâh</dt><dd>{tezgah}</dd></div>
            <div><dt>Plandaki bitiş</dt><dd className="tc-pyq-mono">{zaman(x.C)}</dd></div>
            <div><dt>Bildirilen uzama</dt><dd data-adim-ek={kayitli === null ? 'yok' : ''}>{kayitli === null ? 'yok' : adimEkYazisi(kayitli)}</dd></div>
          </dl>
          {!yazabilir && <p className="tc-pyq-not">Adımın uzadığını yalnız planı yazabilen kişi bildirir.</p>}
          {durum.tur === 'etki' ? <EtkiBolumu ad="Uzamanın etkisi" e={durum.e} uygula={() => { void uygula(durum.e); }} vazgec={() => { void vazgec(); }} /> : yazabilir && (
            <form className="tc-pyq-ayar-etki" noValidate aria-label="Adım uzadı" onSubmit={gonder}>
              <div className="tc-pyq-ayar-alan">
                <label htmlFor="tc-pyq-adim-ek">{kayitli === null ? 'Kaç saat uzadı' : 'Toplam kaç saat uzadı'}</label>
                <input id="tc-pyq-adim-ek" className="tc-alan-kutu" type="text" inputMode="decimal" autoComplete="off" value={saat} disabled={kilitli}
                  aria-invalid={hata !== null || undefined} aria-describedby="tc-pyq-adim-ek-not" onChange={(ev) => { setSaat(ev.target.value); }} />
              </div>
              <p className="tc-pyq-not" id="tc-pyq-adim-ek-not">Süre adımın plandaki bitişine eklenir; sonraki adımlar ve tezgâhtaki işler buna göre kayar.</p>
              {ileti !== null && <p className="tc-pyq-ayar-hata" role="alert">{ileti}</p>}
              <div className="tc-pyq-ayar-dugmeler">
                <Dugme type="submit" tur="ikincil" simge="clock" disabled={kilitli}>{durum.tur === 'hesap' ? 'Hesaplanıyor' : 'Etkisini gör'}</Dugme>
                {kayitli !== null && <Dugme tur="ikincil" simge="x" disabled={kilitli} onClick={kaldir}>Uzamayı kaldır</Dugme>}
              </div>
            </form>
          )}
        </>
      )}
    </aside>
  );
}
