import { useMemo } from 'react';
import type { GozKalemi, YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';

type Raf = YerlesimCevabi['raflar'][number];
import { Dugme, DurumKutusu, Rozet, Secim } from '../../ortak/arayuz/index.ts';
import { GozPaneli } from './GozPaneli.tsx';
import { RAF_TURU_ADI, gozOzetleri, hucreAnahtari, sayiMetni } from './kurallar.ts';
import type { GozOzeti } from './kurallar.ts';
import { OgeSimgesi, rafSimgesi } from './plan-simgeleri.tsx';
import { BolmeCephesi, RafSeridi } from './RafCephesi.tsx';
import { useBolmeStoklari } from './veri.ts';

// Depo: raflar, bölmeler ve gözler; gözün içi (kalem ve doluluk) burada düzenlenir. Raf listeden seçilir, şeritten
// bölme seçilir; bölme önden çizilir, göze basınca içi açılır. "3B" düğmesi aynı bölmeyi sahnede tam karşıdan gösterir.

export interface DepoSecimi {
  rafId: number;
  bolme: number;
  kat: number | null;
  goz: number | null;
}

interface Ozellikler {
  // Gösterilen bölümlerin rafları (fabrikada hepsi).
  raflar: readonly Raf[];
  // Fabrikada rafın bölüm kodu (raf kimliği -> kod); tek bölümde verilmez.
  bolumKodlari?: ReadonlyMap<number, string>;
  gozKalemleri: readonly GozKalemi[] | undefined;
  hata: string | null;
  yenile: () => void;
  yazabilir: boolean;
  secim: DepoSecimi | null;
  secimYaz: (s: DepoSecimi | null) => void;
  ucBoyut: ((rafId: number, bolme: number) => void) | null;
}

export function rafOzetleri(kalemler: readonly GozKalemi[], rafId: number): Map<string, GozOzeti> {
  return new Map([...gozOzetleri(kalemler.filter((k) => k.raf.id === rafId)).values()].map((o) => [hucreAnahtari(o.bolme, o.kat, o.goz), o]));
}

export function DepoGorunumu({ raflar: hamRaflar, bolumKodlari, gozKalemleri, hata, yenile, yazabilir, secim, secimYaz, ucBoyut }: Ozellikler) {
  const raflar = useMemo(() => [...hamRaflar].sort((a, b) => a.kod.localeCompare(b.kod, 'tr')), [hamRaflar]);
  const doluGoz = useMemo(() => {
    const m = new Map<number, Set<number>>();
    for (const k of gozKalemleri ?? []) m.set(k.raf.id, (m.get(k.raf.id) ?? new Set()).add(k.gozId));
    return m;
  }, [gozKalemleri]);
  const raf = raflar.find((r) => r.id === secim?.rafId) ?? raflar[0];
  const ozetler = useMemo(() => (raf ? rafOzetleri(gozKalemleri ?? [], raf.id) : new Map<string, GozOzeti>()), [gozKalemleri, raf]);
  const stoklu = useBolmeStoklari(raf?.id ?? null, raf ? Math.min(raf.bolmeSayisi, Math.max(1, secim?.rafId === raf.id ? secim.bolme : 1)) : null);

  if (raflar.length === 0) return <DurumKutusu durum="bos" mesaj="Bu bölümde raf yok. Rafı yerleşim düzenleyicisinde ekleyin." />;
  if (!raf) return null;
  const bolme = Math.min(raf.bolmeSayisi, Math.max(1, secim?.rafId === raf.id ? secim.bolme : 1));
  const kat = secim?.rafId === raf.id ? secim.kat : null;
  const goz = secim?.rafId === raf.id ? secim.goz : null;
  const bolmeSec = (b: number) => secimYaz({ rafId: raf.id, bolme: Math.min(raf.bolmeSayisi, Math.max(1, b)), kat: null, goz: null });
  const seciliOzet = kat !== null && goz !== null ? ozetler.get(hucreAnahtari(bolme, kat, goz)) : undefined;
  const toplamGoz = raf.bolmeSayisi * raf.katSayisi * raf.gozSayisi;

  return (
    <div className="tc-atolye-depo">
      <nav className="tc-atolye-depo-raflar" aria-label="Raflar">
        {raflar.map((r) => {
          const dolu = doluGoz.get(r.id)?.size ?? 0;
          return (
            <Dugme
              key={r.id}
              className="tc-atolye-depo-raf"
              aria-pressed={r.id === raf.id}
              onClick={() => secimYaz({ rafId: r.id, bolme: 1, kat: null, goz: null })}
            >
              <OgeSimgesi ad={rafSimgesi(r.tur)} />
              <span><b className="mono">{r.kod}</b> {r.ad}</span>
              <small>{bolumKodlari?.get(r.id) ? `${bolumKodlari.get(r.id) ?? ''} · ` : ''}{sayiMetni(dolu)}/{sayiMetni(r.bolmeSayisi * r.katSayisi * r.gozSayisi)} göz{r.aktif ? '' : ' · pasif'}</small>
            </Dugme>
          );
        })}
      </nav>

      <section className="tc-atolye-depo-ana" aria-label={`Raf ${raf.kod}`}>
        <header className="tc-atolye-depo-ust">
          <div>
            <p className="tc-atolye-ust-baslik">{RAF_TURU_ADI[raf.tur]} · Hücre {raf.hucre} · {raf.bolmeSayisi} bölme × {raf.katSayisi} kat × {raf.gozSayisi} göz</p>
            <h3><span className="mono">{raf.kod}</span> · {raf.ad} {!raf.aktif && <Rozet ton="pasif">Pasif</Rozet>}</h3>
          </div>
          <span className="tc-atolye-ipucu">{sayiMetni(doluGoz.get(raf.id)?.size ?? 0)} / {sayiMetni(toplamGoz)} göz dolu</span>
        </header>

        {hata && <DurumKutusu durum="hata" mesaj={hata} yenile={yenile} />}

        <div className="tc-atolye-depo-gezinti">
          <Dugme className="tc-atolye-ok" aria-label="Önceki bölme" title="Önceki bölme" disabled={bolme <= 1} onClick={() => bolmeSec(bolme - 1)}>‹</Dugme>
          <Secim
            etiket="Bölme"
            secenekler={Array.from({ length: raf.bolmeSayisi }, (_, i) => ({ deger: String(i + 1), baslik: `Bölme ${String(i + 1).padStart(2, '0')}` }))}
            value={String(bolme)}
            onChange={(o) => bolmeSec(Number(o.target.value))}
          />
          <Dugme className="tc-atolye-ok" aria-label="Sonraki bölme" title="Sonraki bölme" disabled={bolme >= raf.bolmeSayisi} onClick={() => bolmeSec(bolme + 1)}>›</Dugme>
          {ucBoyut && <Dugme simge="cube" onClick={() => ucBoyut(raf.id, bolme)}>3B karşıdan bak</Dugme>}
        </div>
        <div className="tc-atolye-depo-serit">
          <RafSeridi raf={raf} ozetler={ozetler} bolme={bolme} sec={bolmeSec} />
        </div>

        <div className="tc-atolye-depo-govde">
          <div className="tc-atolye-depo-cephe">
            <BolmeCephesi
              raf={raf}
              bolme={bolme}
              ozetler={ozetler}
              stoklu={stoklu}
              secili={kat !== null && goz !== null ? { kat, goz } : null}
              sec={(k, g) => secimYaz({ rafId: raf.id, bolme, kat: k, goz: g })}
            />
            <p className="tc-atolye-gosterge-acik" aria-hidden="true">
              <i data-kademe="bos" />boş <i data-kademe="az" />%1-60 <i data-kademe="dolu" />%61-90 <i data-kademe="tam" />%91-100
            </p>
          </div>
          {kat !== null && goz !== null ? (
            <GozPaneli
              key={`${raf.id}-${bolme}-${kat}-${goz}`}
              rafId={raf.id}
              bolme={bolme}
              kat={kat}
              goz={goz}
              kalemler={seciliOzet?.kalemler ?? []}
              yazabilir={yazabilir}
              rafAktif={raf.aktif}
              kapat={() => secimYaz({ rafId: raf.id, bolme, kat: null, goz: null })}
            />
          ) : (
            <p className="tc-atolye-ipucu tc-atolye-depo-bos">Gözün içini görmek ve düzenlemek için göze basın.</p>
          )}
        </div>
      </section>
    </div>
  );
}
