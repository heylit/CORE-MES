import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { GozKalemi } from '#paylasilan/sozlesme/atolye.ts';
import { Dugme, DurumKutusu, Simge } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { useDepoYazimi } from './depo-yazimi.ts';
import { KalemGorunumuFormu, kalemBul } from './KalemGorunumu.tsx';
import { AMBALAJ_ADI, dolulukKademesi, sayiMetni } from './kurallar.ts';
import { stokOkurMu, useGozMalzemeleri, useGozStogu, useGozler, useKalemGorunumleri } from './veri.ts';

// Bir gözün içi: Stok'taki malzeme ve miktar (salt okunur, 3012 a). Elle yazılmış eski kayıtlar yalnız görünür; kalemin
// rafta görünümü (ambalaj ya da 3B model) buradan seçilir.

interface Ozellikler {
  rafId: number;
  bolme: number;
  kat: number;
  goz: number;
  // Bu gözdeki kalemler (çok dolduran önce).
  kalemler: readonly GozKalemi[];
  yazabilir: boolean;
  rafAktif: boolean;
  kapat?: () => void;
}

function DolulukCubugu({ yuzde }: { yuzde: number }) {
  return (
    <svg className="tc-atolye-doluluk" data-kademe={dolulukKademesi(yuzde)} viewBox="0 0 100 4" preserveAspectRatio="none" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={yuzde} aria-label="Doluluk">
      <rect className="tc-atolye-doluluk-yol" x="0" y="0" width="100" height="4" rx="2" />
      <rect className="tc-atolye-doluluk-dolu" x="0" y="0" width={Math.min(100, Math.max(0, yuzde))} height="4" rx="2" />
    </svg>
  );
}

// 3012 a: elle yazılmış eski kayıt yalnız görünür (kod, ad, doluluk); düzeltme ve silme yok. Rafta görünümü seçimi kalır.
function EskiKayit({ k, yazabilir, gorunumAcik, gorunumAc }: { k: GozKalemi; yazabilir: boolean; gorunumAcik: boolean; gorunumAc: () => void }) {
  const gorunumler = useKalemGorunumleri();
  const depo = useDepoYazimi();
  const g = kalemBul(gorunumler.data?.kalemler, k.kod);
  const gorunumMetni = g ? (g.rafta === 'model' && g.model ? `3B: ${g.model.ad}` : AMBALAJ_ADI[g.ambalaj]) : 'Görünüm yok';
  return (
    <li className="tc-atolye-goz-kalem">
      <div className="tc-atolye-goz-kalem-ust">
        <b className="mono">{k.kod}</b>
        <span>{k.malzeme?.ad ?? k.ad}</span>
        <Dugme simge="cube" aria-pressed={gorunumAcik} onClick={gorunumAc} title="Rafta görünümü (ambalaj ya da 3B model)">{gorunumMetni}</Dugme>
      </div>
      <div className="tc-atolye-goz-kalem-alt">
        <DolulukCubugu yuzde={k.doluluk} />
        <span className="mono">%{k.doluluk}</span>
      </div>
      {gorunumAcik && <KalemGorunumuFormu key={k.kod} kod={k.kod} yazabilir={yazabilir && depo === null} />}
    </li>
  );
}

// Gözün içi Stok'tan (3012 a): malzeme, parti ve miktar salt okunur. Stok okuma yetkisi yoksa hiç istek atılmaz ve
// miktar görünmez; yalnız içeriğin nereden geldiği söylenir.
function GozStogu({ gozId, okur }: { gozId: number | null; okur: boolean }) {
  const stok = useGozStogu(gozId, okur);
  const { icerik, birim } = useGozMalzemeleri(stok.data?.konumId ?? null, okur);
  if (!okur) return <p className="tc-atolye-ipucu">Gözün içeriği Stok'tan gelir; görmek için stok görme yetkisi gerekir.</p>;
  if (gozId === null) return null;
  if (stok.isError || icerik.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(stok.error ?? icerik.error, 'Gözün stoğu alınamadı')} yenile={() => { void stok.refetch(); void icerik.refetch(); }} />;
  if (stok.isPending || (stok.data && icerik.isPending)) return <p className="tc-atolye-ipucu">Stok okunuyor…</p>;
  const satirlar = icerik.data ?? [];
  if (!stok.data || satirlar.length === 0) return <p className="tc-atolye-ipucu">Stokta yok.</p>;
  return (
    <section className="tc-atolye-goz-stok" aria-label="Stoktaki malzemeler">
      <div className="tc-atolye-goz-stok-ust">
        <Simge ad="box" />
        <b>Stokta {satirlar.length} kalem</b>
        <Link to={`/stok/konumlar/${stok.data.konumId}`}>Stok konumu</Link>
      </div>
      <ul className="tc-atolye-goz-stok-liste">
        {satirlar.map((b) => (
          <li key={b.id}>
            <span>{b.malzemeAd ?? `Malzeme ${String(b.malzemeId)}`}</span>
            <b className="mono">{sayiMetni(Number(b.miktar))}{birim.get(b.malzemeId) ? ` ${birim.get(b.malzemeId) ?? ''}` : ''}</b>
            {b.partiEtiketi && <small className="mono">{b.partiEtiketi}</small>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export { DolulukCubugu };

export function GozPaneli({ rafId, bolme, kat, goz, kalemler, yazabilir, kapat }: Ozellikler) {
  // Göz kimliği ve adresi o bölmenin göz listesinden (boş gözün kaydı yalnız orada).
  const gozler = useGozler(rafId, 1, bolme);
  const [gorunum, gorunumYaz] = useState<string | null>(null);
  const kayit = gozler.data?.satirlar.find((s) => s.kat === kat && s.goz === goz);
  const toplam = kalemler.reduce((t, k) => t + k.doluluk, 0);
  const oturum = useOturum();
  const okur = oturum.data?.islemler.some(stokOkurMu) === true;
  return (
    <section className="tc-atolye-goz-paneli" aria-label={`Göz ${kayit?.adres ?? ''}`}>
      <header className="tc-atolye-goz-paneli-ust">
        <div>
          <p className="tc-atolye-ust-baslik">Bölme {bolme} · Kat {kat} · Göz {goz}</p>
          <h4 className="mono">{kayit?.adres ?? '…'}</h4>
        </div>
        {kapat && <Dugme simge="x" aria-label="Göz panelini kapat" onClick={kapat} />}
      </header>
      {gozler.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(gozler.error, 'Göz alınamadı')} yenile={() => { void gozler.refetch(); }} />}
      <GozStogu gozId={kayit?.id ?? null} okur={okur} />
      {kalemler.length > 0 && (
        <details className="tc-atolye-goz-eski">
          <summary>Eski elle yazılan kayıtlar ({kalemler.length}) · %{toplam}</summary>
          <p className="tc-atolye-ipucu">Yalnız görünür; gözün içeriği artık Stok'tan gelir.</p>
          <ul className="tc-atolye-goz-kalemler">
            {kalemler.map((k) => (
              <EskiKayit
                key={k.id}
                k={k}
                yazabilir={yazabilir}
                gorunumAcik={gorunum === k.kod}
                gorunumAc={() => gorunumYaz((g) => (g === k.kod ? null : k.kod))}
              />
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
