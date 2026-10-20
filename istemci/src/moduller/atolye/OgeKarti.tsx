import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import type { Goz, GozKalemi, YerlesimCevabi } from '#paylasilan/sozlesme/atolye.ts';
import type { Emir } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { Dugme, DurumKutusu, DurumRozeti, Rozet, Tablo } from '../../ortak/arayuz/index.ts';
import type { Sutun } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import {
  ALAN_TURU_ADI, ISTASYON_TIPI_ADI, RAF_TURU_ADI, hucreAnahtari, istasyonGorunumu, istasyonunParcalari, makineCinsi, olcuMetni, saatMetni, sayi, sayiMetni,
} from './kurallar.ts';
import type { GozOzeti, NesneCanli, ParcaModeli } from './kurallar.ts';
import { rafOzetleri } from './DepoGorunumu.tsx';
import { GozPaneli } from './GozPaneli.tsx';
import { OgeSimgesi, rafSimgesi } from './plan-simgeleri.tsx';
import type { PlanSimgesiAdi } from './plan-simgeleri.tsx';
import { useGozler } from './veri.ts';

interface Ozellikler {
  yerlesim: YerlesimCevabi;
  anahtar: string;
  emirler: ReadonlyMap<number, Emir>;
  // Nesne anahtarı -> canlı hal (makine kartı: kendi iş emri, arıza ve bakım).
  canli: ReadonlyMap<string, NesneCanli>;
  // İstasyon kimliği -> işlenen (ya da sıradaki) parçanın modeli.
  parcalar: ReadonlyMap<number, ParcaModeli>;
  // İstasyon kimliği -> sıradaki planlı emir (başlamamış); okunamadıysa boş.
  siradakiler: ReadonlyMap<number, Emir>;
  // Salonun göz kalemleri; okunamadıysa undefined.
  gozKalemleri: readonly GozKalemi[] | undefined;
  // Bütün emirler (makinede üretilen parçalar); okunamadıysa null.
  tumEmirler: readonly Emir[] | null;
  yazabilir: boolean;
  depodaAc: (rafId: number, bolme: number, kat: number | null, goz: number | null) => void;
  ucBoyut: ((rafId: number, bolme: number) => void) | null;
  vurguAdres: string | null;
  kapat: () => void;
  yolGoster: (hedef: { x: number; z: number }) => void;
  yakinlas: (hedef: { x: number; z: number }) => void;
  girisVar: boolean;
}

const GOZ_SUTUNLARI: readonly Sutun<Goz>[] = [
  { anahtar: 'adres', baslik: 'Adres', hucre: (g) => g.adres, mono: true, kirilmaz: true },
  { anahtar: 'bolme', baslik: 'Bölme', hucre: (g) => g.bolme, hizala: 'sag' },
  { anahtar: 'kat', baslik: 'Kat', hucre: (g) => g.kat, hizala: 'sag' },
  { anahtar: 'goz', baslik: 'Göz', hucre: (g) => g.goz, hizala: 'sag' },
];

function Gozler({ rafId, rafAktif, vurguAdres, ozetler, yazabilir }: {
  rafId: number; rafAktif: boolean; vurguAdres: string | null; ozetler: ReadonlyMap<string, GozOzeti> | null; yazabilir: boolean;
}) {
  const [sayfa, sayfaYaz] = useState(1);
  // Göz seçilince içi açılır: kalemler, doluluk, görünüm.
  const [secilen, secilenYaz] = useState<Goz | null>(null);
  const sorgu = useGozler(rafId, sayfa);
  if (sorgu.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (sorgu.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Gözler alınamadı')} yenile={() => { void sorgu.refetch(); }} />;
  const { satirlar, toplam, sayfaBoyu } = sorgu.data;
  const sayfaSayisi = Math.max(1, Math.ceil(toplam / sayfaBoyu));
  const ozet = (g: Goz) => ozetler?.get(hucreAnahtari(g.bolme, g.kat, g.goz));
  const icerik: Sutun<Goz> = {
    anahtar: 'icerik',
    baslik: 'İçerik',
    hucre: (g) => {
      if (!ozetler) return 'bilinmiyor';
      const o = ozet(g);
      return o ? `${o.kalemler.map((k) => k.kod).join(', ')} · %${o.toplam}` : 'Boş';
    },
  };
  return (
    <div className="tc-atolye-gozler">
      {vurguAdres && <p className="tc-atolye-ipucu">Aranan göz: <b className="mono">{vurguAdres}</b></p>}
      <Tablo
        etiket="Raf gözleri"
        sutunlar={[...GOZ_SUTUNLARI, icerik]}
        satirlar={satirlar}
        satirAnahtari={(g) => g.id}
        satirSec={(g) => secilenYaz((s) => (s?.id === g.id ? null : g))}
        bosMesaj="Göz yok"
      />
      {secilen && (
        <GozPaneli
          key={secilen.id}
          rafId={rafId}
          bolme={secilen.bolme}
          kat={secilen.kat}
          goz={secilen.goz}
          kalemler={ozet(secilen)?.kalemler ?? []}
          yazabilir={yazabilir}
          rafAktif={rafAktif}
          kapat={() => secilenYaz(null)}
        />
      )}
      {sayfaSayisi > 1 && (
        <div className="tc-atolye-sayfalar">
          <Dugme simge="back" disabled={sayfa <= 1} onClick={() => sayfaYaz((s) => s - 1)}>Önceki</Dugme>
          <span className="mono">{sayfa} / {sayfaSayisi}</span>
          <Dugme simge="next" disabled={sayfa >= sayfaSayisi} onClick={() => sayfaYaz((s) => s + 1)}>Sonraki</Dugme>
        </div>
      )}
    </div>
  );
}

// Modelin kaynağı yazılır: Çizim Merkezi'ndeki malzeme eşleşmesi önce gelir, yoksa harita kütüphanesi (kart #1258).
function parcaModeliMetni(p: ParcaModeli | undefined): string {
  if (!p) return 'Yok (Çizim Merkezi\'nde malzemeye 3B model bağlayın)';
  return p.kaynak === 'merkez' ? `${p.ad} (Çizim Merkezi, Rev ${p.model.harf})` : `${p.ad} (harita kütüphanesi)`;
}

// Sıradaki planlı iş soluk yazılır; makinede başlamış emir yoksa sahnedeki parça önizlemesi de onundur.
function SiradakiIs({ emir, parca }: { emir: Emir | undefined; parca: ParcaModeli | undefined }) {
  if (!emir) return null;
  return (
    <>
      <dt>Sıradaki</dt>
      <dd className="tc-atolye-sirada">
        <span className="mono">{emir.emirNo}</span> · {emir.parcaNo} · {emir.parcaAd} · {sayiMetni(emir.adet)} adet
        {parca && <><br />Model: {parcaModeliMetni(parca)}</>}
      </dd>
    </>
  );
}

function UretilenParcalar({ istasyonId, emirler }: { istasyonId: number; emirler: readonly Emir[] | null }) {
  const parcalar = useMemo(() => (emirler ? istasyonunParcalari(istasyonId, emirler) : null), [istasyonId, emirler]);
  return (
    <section className="tc-atolye-uretilen" aria-label="Bu makinede üretilen parçalar">
      <h4>Bu makinede üretilen parçalar</h4>
      {parcalar === null ? <p className="tc-atolye-ipucu">Bilinmiyor (emirler okunamadı).</p> : parcalar.length === 0 ? <p className="tc-atolye-ipucu">Bu makinede emir yok.</p> : (
        <ul className="tc-atolye-liste">
          {parcalar.slice(0, 8).map((p) => (
            <li key={p.kod}>
              <span className="mono">{p.kod}</span>
              <span>{p.ad}</span>
              {p.suruyor ? <Rozet ton="tamam">Şimdi</Rozet> : <small>{sayiMetni(p.emirSayisi)} emir · {saatMetni(p.son) ?? '—'}</small>}
            </li>
          ))}
        </ul>
      )}
      {parcalar && parcalar.length > 8 && <p className="tc-atolye-ipucu">+{parcalar.length - 8} parça daha (Parçalar sekmesinde).</p>}
    </section>
  );
}

export function OgeKarti({
  yerlesim: y, anahtar, emirler, canli, parcalar, siradakiler, gozKalemleri, tumEmirler, yazabilir, depodaAc, ucBoyut, vurguAdres, kapat, yolGoster, yakinlas, girisVar,
}: Ozellikler) {
  const [tur, kimlikMetni] = anahtar.split(':');
  const kimlik = Number(kimlikMetni);
  const eylemler = (x: string, z: string) => {
    const hedef = { x: sayi(x), z: sayi(z) };
    return (
      <div className="tc-atolye-kart-eylem">
        <Dugme simge="target" onClick={() => yakinlas(hedef)}>Yakınlaş</Dugme>
        <Dugme simge="next" disabled={!girisVar} title={girisVar ? undefined : 'Bölümün giriş noktası tanımlı değil'} onClick={() => yolGoster(hedef)}>Girişten yol</Dugme>
      </div>
    );
  };
  const ust = (simge: PlanSimgesiAdi, eyebrow: string, baslik: string, ek?: ReactNode) => (
    <header className="tc-atolye-kart-ust">
      <OgeSimgesi ad={simge} />
      <div>
        <p className="tc-atolye-ust-baslik">{eyebrow}</p>
        <h3>{baslik}</h3>
      </div>
      {ek}
      <Dugme simge="x" aria-label="Kartı kapat" onClick={kapat} />
    </header>
  );

  if (tur === 'istasyon') {
    const yer = y.istasyonYerleri.find((i) => i.istasyonId === kimlik);
    if (!yer) return null;
    const emir = emirler.get(yer.istasyonId);
    const g = istasyonGorunumu(yer, emir);
    return (
      <section className="tc-atolye-kart" aria-label={`${yer.kod} ayrıntısı`}>
        {ust(makineCinsi(yer.tip, yer.ad), `${ISTASYON_TIPI_ADI[yer.tip]} · Hücre ${yer.hucre}`, yer.kod, <DurumRozeti durum={g.durum}>{g.metin}</DurumRozeti>)}
        <dl className="tc-atolye-dl">
          <dt>Ad</dt><dd>{yer.ad}</dd>
          <dt>Makine</dt>
          <dd>{yer.makineler.length === 0 ? 'Bağlı makine yok' : yer.makineler.map((m) => [m.kod, m.markaModel ?? m.ad, m.tur].filter(Boolean).join(' · ')).join(', ')}</dd>
          {emir ? (
            <>
              <dt>Emir</dt><dd className="mono">{emir.emirNo}</dd>
              <dt>Parça</dt><dd>{emir.parcaNo} · {emir.parcaAd}</dd>
              <dt>Parça modeli</dt><dd>{parcaModeliMetni(parcalar.get(yer.istasyonId))}</dd>
              <dt>Adet</dt><dd className="mono">{emir.canli ? sayiMetni(emir.canli.saglam) : 'sayaç yok'} / {sayiMetni(emir.adet)}{emir.canli && emir.canli.hurda > 0 ? ` · hurda ${sayiMetni(emir.canli.hurda)}` : ''}</dd>
              <dt>Başlama</dt><dd>{saatMetni(emir.baslama) ?? 'bilinmiyor'}</dd>
              {emir.canli?.durusNedeni && <><dt>Neden</dt><dd className="tc-atolye-neden">{emir.canli.durusNedeni.ad}</dd></>}
            </>
          ) : (
            <><dt>Emir</dt><dd>{yer.aktif ? 'Başlamış emir yok' : 'Makine pasif'}</dd></>
          )}
          {yer.aktif && <SiradakiIs emir={siradakiler.get(yer.istasyonId)} parca={emir ? undefined : parcalar.get(yer.istasyonId)} />}
          <dt>Ayak izi</dt><dd>{olcuMetni(sayi(yer.genislik))} × {olcuMetni(sayi(yer.derinlik))}</dd>
          <dt>3B model</dt><dd>{yer.merkezModeli ? `${yer.merkezModeli.ad} (Çizim Merkezi, Rev ${yer.merkezModeli.harf})` : yer.model ? yer.model.ad : 'Yok (tipten çizilir)'}</dd>
        </dl>
        {eylemler(yer.x, yer.z)}
        <UretilenParcalar istasyonId={yer.istasyonId} emirler={tumEmirler} />
      </section>
    );
  }
  if (tur === 'makine') {
    const mk = y.makineYerleri.find((m) => m.makineId === kimlik);
    if (!mk) return null;
    const ist = mk.istasyon;
    // Canlı durum makinenin kendisinindir: iş emrinin makinesi ya da istasyonun ilk makinesi; arıza ve bakım üstündedir.
    const c = canli.get(anahtar);
    const emir = c?.emir ?? undefined;
    const g = c ?? istasyonGorunumu({ aktif: mk.aktif && (ist?.aktif ?? true) }, undefined);
    const tip = ist?.tip ?? 'talasli';
    return (
      <section className="tc-atolye-kart" aria-label={`${mk.kod} ayrıntısı`}>
        {ust(makineCinsi(tip, mk.ad), `${ist ? `${ist.kod} · ${ISTASYON_TIPI_ADI[ist.tip]}` : 'Makinesiz ekipman'} · Hücre ${mk.hucre}`, mk.kod, <DurumRozeti durum={g.durum}>{g.metin}</DurumRozeti>)}
        <dl className="tc-atolye-dl">
          <dt>Ad</dt><dd>{mk.ad}</dd>
          {mk.markaModel && <><dt>Marka, model</dt><dd>{mk.markaModel}</dd></>}
          {mk.tur && <><dt>Tür</dt><dd>{mk.tur}</dd></>}
          <dt>Makine</dt><dd>{ist ? `${ist.kod} · ${ist.ad}` : 'Bağlı değil'}</dd>
          {c?.ariza && <><dt>{c.ariza.durum === 'ariza' ? 'Arıza' : 'Bakım'}</dt><dd className="tc-atolye-neden">{c.ariza.aciklama ?? 'Açıklama yok'}</dd></>}
          {emir ? (
            <>
              <dt>Emir</dt><dd className="mono">{emir.emirNo}</dd>
              <dt>İş emri</dt><dd>{c?.isEmri ?? 'Bilinmiyor (iş emirsiz emir ya da adımlar arası)'}</dd>
              <dt>Parça</dt><dd>{emir.parcaNo} · {emir.parcaAd}</dd>
              <dt>Parça modeli</dt><dd>{parcaModeliMetni(ist ? parcalar.get(ist.id) : undefined)}</dd>
              <dt>Adet</dt><dd className="mono">{emir.canli ? sayiMetni(emir.canli.saglam) : 'sayaç yok'} / {sayiMetni(emir.adet)}{emir.canli && emir.canli.hurda > 0 ? ` · hurda ${sayiMetni(emir.canli.hurda)}` : ''}</dd>
              <dt>Başlama</dt><dd>{saatMetni(emir.baslama) ?? 'bilinmiyor'}</dd>
              {emir.canli?.durusNedeni && <><dt>Neden</dt><dd className="tc-atolye-neden">{emir.canli.durusNedeni.ad}</dd></>}
            </>
          ) : (
            <><dt>Emir</dt><dd>{!mk.aktif ? 'Makine pasif' : ist ? 'Bu makinede başlamış emir yok' : 'Bilinmiyor (istasyona bağlı değil)'}</dd></>
          )}
          {ist && mk.aktif && <SiradakiIs emir={siradakiler.get(ist.id)} parca={emir ? undefined : parcalar.get(ist.id)} />}
          <dt>Ayak izi</dt><dd>{olcuMetni(sayi(mk.genislik))} × {olcuMetni(sayi(mk.derinlik))}</dd>
          <dt>3B model</dt><dd>{mk.model ? mk.model.ad : 'Yok (tipten çizilir)'}</dd>
        </dl>
        {eylemler(mk.x, mk.z)}
        {ist && <UretilenParcalar istasyonId={ist.id} emirler={tumEmirler} />}
      </section>
    );
  }
  if (tur === 'raf') {
    const raf = y.raflar.find((r) => r.id === kimlik);
    if (!raf) return null;
    const ozetler = gozKalemleri ? rafOzetleri(gozKalemleri, raf.id) : null;
    const vurguBolme = vurguAdres ? Number(vurguAdres.split('-')[1]) || 1 : 1;
    return (
      <section className="tc-atolye-kart tc-atolye-kart-genis" aria-label={`Raf ${raf.kod} ayrıntısı`}>
        {ust(rafSimgesi(raf.tur), `${RAF_TURU_ADI[raf.tur]} · Hücre ${raf.hucre}`, `${raf.kod} · ${raf.ad}`, raf.aktif ? undefined : <Rozet ton="pasif">Pasif</Rozet>)}
        <dl className="tc-atolye-dl">
          <dt>Düzen</dt><dd>{raf.bolmeSayisi} bölme × {raf.katSayisi} kat × {raf.gozSayisi} göz</dd>
          <dt>Ölçü</dt><dd>{olcuMetni(sayi(raf.genislik))} × {olcuMetni(sayi(raf.derinlik))}, yükseklik {olcuMetni(sayi(raf.yukseklik))}</dd>
        </dl>
        <div className="tc-atolye-kart-eylem">
          <Dugme simge="target" onClick={() => yakinlas({ x: sayi(raf.x), z: sayi(raf.z) })}>Yakınlaş</Dugme>
          <Dugme simge="next" disabled={!girisVar} title={girisVar ? undefined : 'Bölümün giriş noktası tanımlı değil'} onClick={() => yolGoster({ x: sayi(raf.x), z: sayi(raf.z) })}>Girişten yol</Dugme>
          {ucBoyut && <Dugme simge="cube" onClick={() => ucBoyut(raf.id, vurguBolme)}>Bölmeye karşıdan bak</Dugme>}
          <Dugme simge="box" onClick={() => depodaAc(raf.id, vurguBolme, null, null)}>Depoda düzenle</Dugme>
        </div>
        <Gozler rafId={raf.id} rafAktif={raf.aktif} vurguAdres={vurguAdres} ozetler={ozetler} yazabilir={yazabilir} />
      </section>
    );
  }
  if (tur === 'alan') {
    const alan = y.alanlar.find((a) => a.id === kimlik);
    if (!alan) return null;
    return (
      <section className="tc-atolye-kart" aria-label={`${alan.ad} ayrıntısı`}>
        {ust(alan.tur, `${ALAN_TURU_ADI[alan.tur]} · Hücre ${alan.hucre}`, alan.ad)}
        <dl className="tc-atolye-dl">
          <dt>Ölçü</dt><dd>{olcuMetni(sayi(alan.genislik))} × {olcuMetni(sayi(alan.derinlik))}</dd>
        </dl>
        {eylemler(alan.x, alan.z)}
      </section>
    );
  }
  return null;
}
