import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { GozKalemi } from '#paylasilan/sozlesme/atolye.ts';
import { Dugme, DurumKutusu, Girdi, Rozet, Simge, useBildirim } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { useDepoYazimi } from './depo-yazimi.ts';
import { KalemGorunumuFormu, kalemBul } from './KalemGorunumu.tsx';
import { AMBALAJ_ADI, dolulukKademesi } from './kurallar.ts';
import { gozKalemiSil, gozKalemiYaz, stokOkurMu, useGozStogu, useGozler, useKalemGorunumleri } from './veri.ts';

// Bir gözün içi: hangi kalem, gözün yüzde kaçını dolduruyor. Kalem eklenir, doluluğu düzeltilir, kaldırılır; kalemin
// rafta görünümü (ambalaj ya da 3B model) buradan seçilir. Adet ve hareket stok modülünündür; burada yalnız yer.

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

function KalemSatiri({ k, digerToplam, yazabilir, gorunumAcik, gorunumAc }: {
  k: GozKalemi; digerToplam: number; yazabilir: boolean; gorunumAcik: boolean; gorunumAc: () => void;
}) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const gorunumler = useKalemGorunumleri();
  const depo = useDepoYazimi();
  const [doluluk, dolulukYaz] = useState(String(k.doluluk));
  const yenile = () => void istemci.invalidateQueries({ queryKey: ['atolye', 'goz-kalemleri'] });
  const kaydet = useMutation({
    mutationFn: () => (depo?.kalemYaz ?? gozKalemiYaz)({ gozId: k.gozId, kod: k.kod, ad: k.ad, doluluk: Number(doluluk) }),
    onSuccess: () => { bildir('tamam', `${k.kod} doluluğu %${doluluk}.`); yenile(); },
    onError: (hata) => bildir('hata', hataIletisi(hata, 'Doluluk kaydedilemedi.')),
  });
  const kaldir = useMutation({
    mutationFn: () => (depo?.kalemSil ?? gozKalemiSil)(k.id),
    onSuccess: () => { bildir('tamam', `${k.kod} gözden kaldırıldı.`); yenile(); },
    onError: (hata) => bildir('hata', hataIletisi(hata, 'Kalem kaldırılamadı.')),
  });
  const g = kalemBul(gorunumler.data?.kalemler, k.kod);
  const gorunumMetni = g ? (g.rafta === 'model' && g.model ? `3B: ${g.model.ad}` : AMBALAJ_ADI[g.ambalaj]) : 'Görünüm yok';
  const sayi = Number(doluluk);
  const gecerli = Number.isInteger(sayi) && sayi >= 1 && sayi <= 100 - digerToplam;
  return (
    <li className="tc-atolye-goz-kalem">
      <div className="tc-atolye-goz-kalem-ust">
        <b className="mono">{k.kod}</b>
        <span>{k.malzeme?.ad ?? k.ad}</span>
        {!k.malzeme && <Rozet ton="uyari">Kartta yok</Rozet>}
        <Dugme simge="cube" aria-pressed={gorunumAcik} onClick={gorunumAc} title="Rafta görünümü (ambalaj ya da 3B model)">{gorunumMetni}</Dugme>
      </div>
      <div className="tc-atolye-goz-kalem-alt">
        <DolulukCubugu yuzde={k.doluluk} />
        {yazabilir ? (
          <form className="tc-atolye-satir-form" onSubmit={(o) => { o.preventDefault(); if (gecerli && sayi !== k.doluluk) kaydet.mutate(); }}>
            <Girdi
              etiket={`${k.kod} doluluğu %`}
              type="number"
              inputMode="numeric"
              min={1}
              max={100 - digerToplam}
              value={doluluk}
              onChange={(o) => dolulukYaz(o.target.value)}
              hata={doluluk !== '' && !gecerli ? `1 ile ${100 - digerToplam} arası` : undefined}
            />
            <Dugme type="submit" simge="check" aria-label={`${k.kod} doluluğunu kaydet`} title="Kaydet" disabled={!gecerli || sayi === k.doluluk} yukleniyor={kaydet.isPending} />
            <Dugme simge="trash" aria-label={`${k.kod} kalemini gözden kaldır`} title="Gözden kaldır" yukleniyor={kaldir.isPending} onClick={() => kaldir.mutate()} />
          </form>
        ) : (
          <span className="mono">%{k.doluluk}</span>
        )}
      </div>
      {gorunumAcik && <KalemGorunumuFormu key={k.kod} kod={k.kod} yazabilir={yazabilir && depo === null} />}
    </li>
  );
}

function KalemEkle({ gozId, bos, kapat }: { gozId: number; bos: number; kapat: () => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const depo = useDepoYazimi();
  const [kod, kodYaz] = useState('');
  const [ad, adYaz] = useState('');
  const [doluluk, dolulukYaz] = useState(String(Math.min(bos, 50)));
  const sayi = Number(doluluk);
  const gecerli = kod.trim() !== '' && ad.trim() !== '' && Number.isInteger(sayi) && sayi >= 1 && sayi <= bos;
  const ekle = useMutation({
    mutationFn: () => (depo?.kalemYaz ?? gozKalemiYaz)({ gozId, kod: kod.trim(), ad: ad.trim(), doluluk: sayi }),
    onSuccess: (k) => {
      bildir('tamam', `${k.kod} ${k.adres} gözüne kondu.`);
      void istemci.invalidateQueries({ queryKey: ['atolye', 'goz-kalemleri'] });
      kapat();
    },
    onError: (hata) => bildir('hata', hataIletisi(hata, 'Kalem konamadı.')),
  });
  return (
    <form className="tc-atolye-kalem" onSubmit={(o) => { o.preventDefault(); if (gecerli) ekle.mutate(); }}>
      <Girdi etiket="Kod (parça no ya da malzeme kodu)" value={kod} maxLength={60} onChange={(o) => kodYaz(o.target.value)} autoFocus />
      <Girdi etiket="Ad" value={ad} maxLength={120} onChange={(o) => adYaz(o.target.value)} />
      <Girdi etiket="Doluluk %" type="number" inputMode="numeric" min={1} max={bos} value={doluluk} onChange={(o) => dolulukYaz(o.target.value)} ipucu={`Gözde %${bos} yer var.`} />
      <div className="tc-atolye-kart-eylem">
        <Dugme type="submit" tur="birincil" simge="plus" disabled={!gecerli} yukleniyor={ekle.isPending}>Göze koy</Dugme>
        <Dugme simge="x" onClick={kapat}>Vazgeç</Dugme>
      </div>
    </form>
  );
}

// Gözdeki stok (adet ve hareket stok modülünde): kalem sayısı, ilk malzeme ve stok konumuna bağlantı. Stok okuma
// yetkisi yoksa satır yoktur.

function GozStogu({ gozId }: { gozId: number | null }) {
  const oturum = useOturum();
  const okur = oturum.data?.islemler.some(stokOkurMu) === true;
  const stok = useGozStogu(gozId, okur);
  if (!okur || gozId === null || stok.isError) return null;
  const s = stok.data;
  return (
    <p className="tc-atolye-goz-stok">
      <Simge ad="box" />
      {stok.isPending ? <span>Stok okunuyor…</span>
        : !s ? <span>Stokta yok.</span>
          : (
            <>
              <span>Stokta: <b>{s.kalemSayisi} kalem</b>{s.ilkMalzemeAd ? ` (ilk: ${s.ilkMalzemeAd})` : ''}</span>
              <Link to={`/stok/konumlar/${s.konumId}`}>Stok konumu</Link>
            </>
          )}
    </p>
  );
}

export { DolulukCubugu };

export function GozPaneli({ rafId, bolme, kat, goz, kalemler, yazabilir, rafAktif, kapat }: Ozellikler) {
  // Göz kimliği ve adresi o bölmenin göz listesinden (boş gözün kaydı yalnız orada).
  const gozler = useGozler(rafId, 1, bolme);
  const [ekle, ekleYaz] = useState(false);
  const [gorunum, gorunumYaz] = useState<string | null>(null);
  const kayit = gozler.data?.satirlar.find((s) => s.kat === kat && s.goz === goz);
  const toplam = kalemler.reduce((t, k) => t + k.doluluk, 0);
  const bos = 100 - toplam;
  const oturum = useOturum();
  // ATL-3: doluluk elle girilir; stoğu olan gözde doluluk yoksa "boş" denmez (sorgu GozStogu ile aynı, önbellekten).
  const stok = useGozStogu(kayit?.id ?? null, oturum.data?.islemler.some(stokOkurMu) === true);
  const stokVar = (stok.data?.kalemSayisi ?? 0) > 0;
  return (
    <section className="tc-atolye-goz-paneli" aria-label={`Göz ${kayit?.adres ?? ''}`}>
      <header className="tc-atolye-goz-paneli-ust">
        <div>
          <p className="tc-atolye-ust-baslik">Bölme {bolme} · Kat {kat} · Göz {goz}</p>
          <h4 className="mono">{kayit?.adres ?? '…'}</h4>
        </div>
        <span className="mono">%{toplam}</span>
        {kapat && <Dugme simge="x" aria-label="Göz panelini kapat" onClick={kapat} />}
      </header>
      <DolulukCubugu yuzde={toplam} />
      <GozStogu gozId={kayit?.id ?? null} />
      {gozler.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(gozler.error, 'Göz alınamadı')} yenile={() => { void gozler.refetch(); }} />}
      {kalemler.length === 0 && <p className="tc-atolye-ipucu">{stokVar ? 'Gözde stok var; doluluk girilmedi.' : 'Göz boş.'}</p>}
      {kalemler.length > 0 && (
        <ul className="tc-atolye-goz-kalemler">
          {kalemler.map((k) => (
            <KalemSatiri
              key={`${k.id}-${k.doluluk}`}
              k={k}
              digerToplam={toplam - k.doluluk}
              yazabilir={yazabilir}
              gorunumAcik={gorunum === k.kod}
              gorunumAc={() => gorunumYaz((g) => (g === k.kod ? null : k.kod))}
            />
          ))}
        </ul>
      )}
      {yazabilir && rafAktif && kayit && !ekle && bos > 0 && <Dugme simge="plus" onClick={() => ekleYaz(true)}>Kalem koy</Dugme>}
      {yazabilir && !rafAktif && <p className="tc-atolye-ipucu">Raf pasif: kalem konmaz.</p>}
      {yazabilir && bos <= 0 && <p className="tc-atolye-ipucu">Göz dolu (%100).</p>}
      {ekle && kayit && <KalemEkle key={kayit.id} gozId={kayit.id} bos={bos} kapat={() => ekleYaz(false)} />}
    </section>
  );
}
