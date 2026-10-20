import { Dugme, Girdi, IsaretKutusu, Secim } from '../../ortak/arayuz/index.ts';
import type { AlanTuru, GecisTuru, KapiKenari, MerkezModeli, Model, RafTuru } from '#paylasilan/sozlesme/atolye.ts';
import type { Taslak, TaslakBolum } from './duzenleyici-durumu.ts';
import { ogeTuru } from './duzenleyici-durumu.ts';
import { GECIS_TURU_ADI } from './gecis.ts';
import { MerkezModeliSecimi } from './MerkezModeliSecimi.tsx';
import { ALAN_TURU_ADI, ISTASYON_TIPI_ADI, RAF_TURU_ADI } from './kurallar.ts';

// Seçili öğenin ya da (seçim yoksa) salonun alanları. Sayılar metre ve derecedir; denetimi kayıtta sunucu yapar.

interface Ozellikler {
  taslak: Taslak;
  secili: string | null;
  degistir: (anahtar: string, degisim: Record<string, unknown>) => void;
  salonDegistir: (degisim: Partial<Taslak['salon']>) => void;
  kaldir: (anahtar: string) => void;
  // Fabrikada bölümün girişi (bölümün ortasına); tek bölümde salonun.
  girisKoy: (bolum?: TaslakBolum) => void;
  sec: (anahtar: string | null) => void;
  // Atanabilir (yüklemesi tamam) modeller; yüklenmediyse boş.
  modeller: readonly Model[];
  kutuphaneAc: () => void;
  // İstasyonun Çizim Merkezi modeli (açılıştaki yerleşimden, seçimle güncellenir).
  merkezModelleri: ReadonlyMap<number, MerkezModeli | null>;
  merkezModeliDegisti: (istasyonId: number, m: MerkezModeli | null) => void;
}

const RAF_SECENEKLERI = (Object.keys(RAF_TURU_ADI) as RafTuru[]).map((t) => ({ deger: t, baslik: RAF_TURU_ADI[t] }));
const ALAN_SECENEKLERI = (Object.keys(ALAN_TURU_ADI) as AlanTuru[]).map((t) => ({ deger: t, baslik: ALAN_TURU_ADI[t] }));
const KAPI_SECENEKLERI: { deger: KapiKenari; baslik: string }[] = [
  { deger: 'on', baslik: 'Ön' }, { deger: 'arka', baslik: 'Arka' }, { deger: 'sol', baslik: 'Sol' }, { deger: 'sag', baslik: 'Sağ' },
];

const GECIS_SECENEKLERI = (Object.keys(GECIS_TURU_ADI) as GecisTuru[]).map((t) => ({ deger: t, baslik: GECIS_TURU_ADI[t] }));

function Sayi({ etiket, deger, degistir, adim = 0.1, tam = false }: {
  etiket: string;
  deger: number;
  degistir: (n: number) => void;
  adim?: number;
  tam?: boolean;
}) {
  return (
    <Girdi
      etiket={etiket}
      type="number"
      inputMode="decimal"
      step={adim}
      value={Number.isFinite(deger) ? Math.round(deger * 100) / 100 : ''}
      onChange={(o) => {
        const n = Number(o.target.value);
        if (o.target.value !== '' && Number.isFinite(n)) degistir(tam ? Math.round(n) : n);
      }}
    />
  );
}

// Boş bırakılabilen ölçü: boş kutu null (ölçülmedi).
function BosSayi({ etiket, deger, degistir }: { etiket: string; deger: number | null; degistir: (n: number | null) => void }) {
  return (
    <Girdi
      etiket={etiket}
      type="number"
      inputMode="decimal"
      step={0.01}
      placeholder="boş"
      value={deger === null ? '' : Math.round(deger * 100) / 100}
      onChange={(o) => {
        if (o.target.value === '') { degistir(null); return; }
        const n = Number(o.target.value);
        if (Number.isFinite(n)) degistir(n);
      }}
    />
  );
}

// Net ölçünün ne olduğu rafın türüne göre değişir; kullanıcı ölçerken neyi ölçeceğini görür.
const NET_IPUCU: Record<RafTuru, string> = {
  palet: 'Kat: kirişin üstünden (1. katta zeminden) bir üst kirişin altına. Göz: bir palet yerinin dikmeler ve komşu yük arası net eni ve derinliği.',
  kucuk_parca: 'Kat: raf tablasının üstünden bir üst tablanın altına. Göz: bir gözün net eni ve derinliği.',
  konsol: 'Kat: kolun üstünden bir üst kolun altına. Göz: iki kol arası net genişlik ve kol üstünde bir gözün derinliği.',
  zemin: 'Kat: istif edilebilecek net yükseklik. Göz: bir istif yerinin net eni ve derinliği.',
};

function NetOlculer({ raf, degistir }: { raf: Taslak['raflar'][number]; degistir: (degisim: Record<string, unknown>) => void }) {
  const katlar = raf.katYukseklikleri ?? Array.from({ length: raf.katSayisi }, () => null);
  const dolu = katlar.filter((v) => v !== null).length;
  const katYaz = (i: number, n: number | null) => {
    const yeni = katlar.map((v, j) => (j === i ? n : v));
    degistir({ katYukseklikleri: yeni.some((v) => v !== null) ? yeni : null });
  };
  const acik = raf.katYukseklikleri !== null || raf.gozGenisligi !== null || raf.gozDerinligi !== null;
  return (
    <details className="tc-atolye-net" open={acik}>
      <summary>Net ölçüler (isteğe bağlı)</summary>
      <p className="tc-atolye-ipucu">{NET_IPUCU[raf.tur]} Boş bırakılan ölçü çizimden hesaplanır.</p>
      <div className="tc-atolye-ozellik-ikili">
        <BosSayi etiket="Göz net genişliği (m)" deger={raf.gozGenisligi} degistir={(gozGenisligi) => degistir({ gozGenisligi })} />
        <BosSayi etiket="Göz net derinliği (m)" deger={raf.gozDerinligi} degistir={(gozDerinligi) => degistir({ gozDerinligi })} />
      </div>
      <div className="tc-atolye-ozellik-uclu">
        {katlar.map((v, i) => (
          <BosSayi key={`kat-${i + 1}`} etiket={`${i + 1}. kat net (m)`} deger={v} degistir={(n) => katYaz(i, n)} />
        ))}
      </div>
      {dolu > 0 && dolu < raf.katSayisi && <p className="tc-atolye-net-eksik">{raf.katSayisi} katın hepsi girilmeli ya da hepsi boş kalmalı ({dolu} girildi).</p>}
    </details>
  );
}

export function OzellikPaneli({ taslak: t, secili, degistir, salonDegistir, kaldir, girisKoy, sec, modeller, kutuphaneAc, merkezModelleri, merkezModeliDegisti }: Ozellikler) {
  if (secili === null && t.bolumler) {
    return (
      <div className="tc-atolye-ozellik">
        <h3 className="tc-atolye-ozellik-baslik">Fabrika</h3>
        <p className="tc-atolye-ipucu">Bölümü başlığından sürükleyin; makine, raf ve alanları bölümden bölüme sürükleyerek taşıyın. Öğe, ortasının düştüğü bölüme kaydedilir.</p>
        <div className="tc-atolye-palet-ogeler">
          {t.bolumler.map((b) => (
            <Dugme key={b.anahtar} className="tc-atolye-palet-oge" simge="layers" onClick={() => sec(b.anahtar)}>{b.kod} · {b.ad}</Dugme>
          ))}
        </div>
      </div>
    );
  }
  const bolum = secili ? t.bolumler?.find((b) => b.anahtar === secili) : undefined;
  if (bolum && secili) {
    return (
      <div className="tc-atolye-ozellik">
        <h3 className="tc-atolye-ozellik-baslik">Bölüm {bolum.kod}</h3>
        <Girdi etiket="Kod" value={bolum.kod} maxLength={24} onChange={(o) => degistir(secili, { kod: o.target.value.toUpperCase() })} />
        <Girdi etiket="Ad" value={bolum.ad} maxLength={120} onChange={(o) => degistir(secili, { ad: o.target.value })} />
        <div className="tc-atolye-ozellik-ikili">
          <Sayi etiket="Genişlik (m)" deger={bolum.genislik} degistir={(genislik) => degistir(secili, { genislik })} adim={1} />
          <Sayi etiket="Derinlik (m)" deger={bolum.derinlik} degistir={(derinlik) => degistir(secili, { derinlik })} adim={1} />
        </div>
        <Sayi etiket="Hücre boyu (m)" deger={bolum.hucreBoyu} degistir={(hucreBoyu) => degistir(secili, { hucreBoyu })} adim={0.5} />
        <p className="tc-atolye-ipucu">Fabrika planındaki yeri: sol üst köşe ve o köşe çevresinde dönüş. İçindekiler birlikte taşınır.</p>
        <div className="tc-atolye-ozellik-uclu">
          <Sayi etiket="X (m)" deger={bolum.x} degistir={(x) => degistir(secili, { x })} />
          <Sayi etiket="Z (m)" deger={bolum.z} degistir={(z) => degistir(secili, { z })} />
          <Sayi etiket="Dönüş (°)" deger={bolum.donus} degistir={(donus) => degistir(secili, { donus })} adim={90} />
        </div>
        {bolum.giris === null && <Dugme simge="flag" onClick={() => girisKoy(bolum)}>Giriş noktası koy</Dugme>}
      </div>
    );
  }
  if (secili === null) {
    const s = t.salon;
    return (
      <div className="tc-atolye-ozellik">
        <h3 className="tc-atolye-ozellik-baslik">Bölüm</h3>
        <Girdi etiket="Kod" value={s.kod} maxLength={24} onChange={(o) => salonDegistir({ kod: o.target.value.toUpperCase() })} />
        <Girdi etiket="Ad" value={s.ad} maxLength={120} onChange={(o) => salonDegistir({ ad: o.target.value })} />
        <div className="tc-atolye-ozellik-ikili">
          <Sayi etiket="Genişlik (m)" deger={s.genislik} degistir={(n) => salonDegistir({ genislik: n })} adim={1} />
          <Sayi etiket="Derinlik (m)" deger={s.derinlik} degistir={(n) => salonDegistir({ derinlik: n })} adim={1} />
        </div>
        <Sayi etiket="Hücre boyu (m)" deger={s.hucreBoyu} degistir={(n) => salonDegistir({ hucreBoyu: n })} adim={0.5} />
        {s.giris === null && <Dugme simge="flag" onClick={() => girisKoy()}>Giriş noktası koy</Dugme>}
        <p className="tc-atolye-ipucu">Öğe seçmek için plana dokunun. Boş alanı sürükleyerek planı kaydırın.</p>
      </div>
    );
  }

  const tur = ogeTuru(secili);
  const sil = (metin: string) => <Dugme tur="tehlike" simge="trash" onClick={() => kaldir(secili)}>{metin}</Dugme>;
  const konum = (o: { x: number; z: number; donus: number }) => (
    <div className="tc-atolye-ozellik-uclu">
      <Sayi etiket="X (m)" deger={o.x} degistir={(x) => degistir(secili, { x })} />
      <Sayi etiket="Z (m)" deger={o.z} degistir={(z) => degistir(secili, { z })} />
      <Sayi etiket="Dönüş (°)" deger={o.donus} degistir={(donus) => degistir(secili, { donus })} adim={5} />
    </div>
  );

  const girisBolumu = tur === 'giris' ? t.bolumler?.find((b) => secili === `giris:${b.salonId}`) : undefined;
  const giris = girisBolumu ? girisBolumu.giris : tur === 'giris' ? t.salon.giris : null;
  if (tur === 'giris' && giris) {
    const g = giris;
    const yaz = (n: { x: number; z: number }) => (girisBolumu ? degistir(secili, n) : salonDegistir({ giris: n }));
    return (
      <div className="tc-atolye-ozellik">
        <h3 className="tc-atolye-ozellik-baslik">Giriş noktası{girisBolumu ? ` · ${girisBolumu.kod}` : ''}</h3>
        <div className="tc-atolye-ozellik-ikili">
          <Sayi etiket="X (m)" deger={g.x} degistir={(x) => yaz({ ...g, x })} />
          <Sayi etiket="Z (m)" deger={g.z} degistir={(z) => yaz({ ...g, z })} />
        </div>
        {sil('Girişi kaldır')}
      </div>
    );
  }

  const gecis = t.gecisler.find((o) => o.anahtar === secili);
  if (gecis) {
    const bolumu = gecis.salonId === null ? undefined : t.bolumler?.find((b) => b.salonId === gecis.salonId);
    return (
      <div className="tc-atolye-ozellik">
        <h3 className="tc-atolye-ozellik-baslik">{GECIS_TURU_ADI[gecis.tur]}{bolumu ? ` · ${bolumu.kod}` : ''}</h3>
        <div className="tc-atolye-ozellik-ikili">
          <Secim etiket="Tür" secenekler={GECIS_SECENEKLERI} value={gecis.tur} onChange={(o) => degistir(secili, { tur: o.target.value })} />
          <Secim etiket="Duvar" secenekler={KAPI_SECENEKLERI} value={gecis.kenar} onChange={(o) => degistir(secili, { kenar: o.target.value })} />
        </div>
        <div className="tc-atolye-ozellik-ikili">
          <Sayi etiket="Duvar ortasından kayma (m)" deger={gecis.ofset} degistir={(ofset) => degistir(secili, { ofset })} adim={0.5} />
          <Sayi etiket="Genişlik (m)" deger={gecis.genislik} degistir={(genislik) => degistir(secili, { genislik })} adim={0.1} />
        </div>
        <p className="tc-atolye-ipucu">Geçişi duvar boyunca sürükleyin; en yakın duvara oturur. İki bölümün ortak duvarındaki geçişten bölümden bölüme yürünür.</p>
        {sil('Geçişi kaldır')}
      </div>
    );
  }

  const istasyon = t.istasyonlar.find((o) => o.anahtar === secili);
  if (istasyon) {
    return (
      <div className="tc-atolye-ozellik">
        <h3 className="tc-atolye-ozellik-baslik">{istasyon.kod}</h3>
        <p className="tc-atolye-ipucu">{istasyon.ad} · {ISTASYON_TIPI_ADI[istasyon.tip]}{istasyon.aktif ? '' : ' · pasif'}</p>
        {konum(istasyon)}
        <div className="tc-atolye-ozellik-ikili">
          <Sayi etiket="Ayak izi genişliği (m)" deger={istasyon.genislik} degistir={(genislik) => degistir(secili, { genislik })} />
          <Sayi etiket="Ayak izi derinliği (m)" deger={istasyon.derinlik} degistir={(derinlik) => degistir(secili, { derinlik })} />
        </div>
        <Secim
          etiket="3B model"
          secenekler={[
            { deger: '', baslik: 'Yok (istasyon tipinden çizilir)' },
            ...modeller.filter((m) => m.tamam).map((m) => ({ deger: String(m.id), baslik: m.ad })),
          ]}
          value={istasyon.modelId === null ? '' : String(istasyon.modelId)}
          onChange={(o) => degistir(secili, { modelId: o.target.value === '' ? null : Number(o.target.value) })}
        />
        <Dugme simge="cube" onClick={kutuphaneAc}>3B modeller</Dugme>
        <MerkezModeliSecimi
          istasyonId={istasyon.istasyonId}
          mevcut={merkezModelleri.get(istasyon.istasyonId) ?? null}
          degisti={(m) => merkezModeliDegisti(istasyon.istasyonId, m)}
        />
        {sil('Plandan kaldır')}
      </div>
    );
  }

  const makine = t.makineler.find((o) => o.anahtar === secili);
  if (makine) {
    const istasyonu = t.istasyonlar.find((i) => i.istasyonId === makine.istasyonId) ?? null;
    return (
      <div className="tc-atolye-ozellik">
        <h3 className="tc-atolye-ozellik-baslik">{makine.kod}</h3>
        <p className="tc-atolye-ipucu">
          {makine.ad}{makine.tip ? ` · ${ISTASYON_TIPI_ADI[makine.tip]}` : ''}{istasyonu ? ` · ${istasyonu.kod}` : makine.istasyonId === null ? ' · makinesiz' : ''}{makine.aktif ? '' : ' · pasif'}
        </p>
        {konum(makine)}
        <div className="tc-atolye-ozellik-ikili">
          <Sayi etiket="Ayak izi genişliği (m)" deger={makine.genislik} degistir={(genislik) => degistir(secili, { genislik })} />
          <Sayi etiket="Ayak izi derinliği (m)" deger={makine.derinlik} degistir={(derinlik) => degistir(secili, { derinlik })} />
        </div>
        <Secim
          etiket="3B model"
          secenekler={[
            { deger: '', baslik: 'Yok (istasyon tipinden çizilir)' },
            ...modeller.filter((m) => m.tamam).map((m) => ({ deger: String(m.id), baslik: m.ad })),
          ]}
          value={makine.modelId === null ? '' : String(makine.modelId)}
          onChange={(o) => degistir(secili, { modelId: o.target.value === '' ? null : Number(o.target.value) })}
        />
        <Dugme simge="cube" onClick={kutuphaneAc}>3B modeller</Dugme>
        {sil('Plandan kaldır')}
      </div>
    );
  }

  const raf = t.raflar.find((o) => o.anahtar === secili);
  if (raf) {
    return (
      <div className="tc-atolye-ozellik">
        <h3 className="tc-atolye-ozellik-baslik">Raf {raf.kod}</h3>
        <div className="tc-atolye-ozellik-ikili">
          <Girdi etiket="Kod" value={raf.kod} maxLength={5} ipucu="Harfle başlar, tire yok" onChange={(o) => degistir(secili, { kod: o.target.value.toUpperCase() })} />
          <Secim etiket="Tür" secenekler={RAF_SECENEKLERI} value={raf.tur} onChange={(o) => degistir(secili, { tur: o.target.value })} />
        </div>
        <Girdi etiket="Ad" value={raf.ad} maxLength={120} onChange={(o) => degistir(secili, { ad: o.target.value })} />
        <div className="tc-atolye-ozellik-uclu">
          <Sayi etiket="Bölme" deger={raf.bolmeSayisi} degistir={(bolmeSayisi) => degistir(secili, { bolmeSayisi })} adim={1} tam />
          <Sayi etiket="Kat" deger={raf.katSayisi} degistir={(katSayisi) => degistir(secili, { katSayisi })} adim={1} tam />
          <Sayi etiket="Göz" deger={raf.gozSayisi} degistir={(gozSayisi) => degistir(secili, { gozSayisi })} adim={1} tam />
        </div>
        <div className="tc-atolye-ozellik-uclu">
          <Sayi etiket="Bölme gen. (m)" deger={raf.bolmeGenisligi} degistir={(bolmeGenisligi) => degistir(secili, { bolmeGenisligi })} />
          <Sayi etiket="Derinlik (m)" deger={raf.derinlik} degistir={(derinlik) => degistir(secili, { derinlik })} />
          <Sayi etiket="Yükseklik (m)" deger={raf.yukseklik} degistir={(yukseklik) => degistir(secili, { yukseklik })} />
        </div>
        <NetOlculer raf={raf} degistir={(d) => degistir(secili, d)} />
        {konum(raf)}
        <IsaretKutusu etiket="Aktif (pasif raf aramada çıkmaz)" checked={raf.aktif} onChange={(o) => degistir(secili, { aktif: o.target.checked })} />
        {raf.id === null ? sil('Rafı sil') : raf.aktif && <Dugme simge="minus" onClick={() => kaldir(secili)}>Pasife al</Dugme>}
      </div>
    );
  }

  const alan = t.alanlar.find((o) => o.anahtar === secili);
  if (alan) {
    const oda = alan.tur === 'oda' || alan.tur === 'cam_oda';
    return (
      <div className="tc-atolye-ozellik">
        <h3 className="tc-atolye-ozellik-baslik">{ALAN_TURU_ADI[alan.tur]}</h3>
        <Girdi etiket="Ad" value={alan.ad} maxLength={120} onChange={(o) => degistir(secili, { ad: o.target.value })} />
        <Secim
          etiket="Tür"
          secenekler={ALAN_SECENEKLERI}
          value={alan.tur}
          onChange={(o) => {
            const yeni = o.target.value as AlanTuru;
            const odaMi = yeni === 'oda' || yeni === 'cam_oda';
            degistir(secili, { tur: yeni, kapi: odaMi ? alan.kapi ?? { kenar: 'on', ofset: 0, genislik: 1 } : null });
          }}
        />
        {konum(alan)}
        <div className="tc-atolye-ozellik-ikili">
          <Sayi etiket="Genişlik (m)" deger={alan.genislik} degistir={(genislik) => degistir(secili, { genislik })} />
          <Sayi etiket="Derinlik (m)" deger={alan.derinlik} degistir={(derinlik) => degistir(secili, { derinlik })} />
        </div>
        {oda && (
          <>
            <IsaretKutusu
              etiket="Kapı var"
              checked={alan.kapi !== null}
              onChange={(o) => degistir(secili, { kapi: o.target.checked ? { kenar: 'on', ofset: 0, genislik: 1 } : null })}
            />
            {alan.kapi && (
              <div className="tc-atolye-ozellik-uclu">
                <Secim etiket="Kapı kenarı" secenekler={KAPI_SECENEKLERI} value={alan.kapi.kenar} onChange={(o) => degistir(secili, { kapi: { ...alan.kapi, kenar: o.target.value } })} />
                <Sayi etiket="Kayma (m)" deger={alan.kapi.ofset} degistir={(ofset) => degistir(secili, { kapi: { ...alan.kapi, ofset } })} />
                <Sayi etiket="Kapı gen. (m)" deger={alan.kapi.genislik} degistir={(genislik) => degistir(secili, { kapi: { ...alan.kapi, genislik } })} />
              </div>
            )}
          </>
        )}
        {sil('Sil')}
      </div>
    );
  }

  const duvar = t.duvarlar.find((o) => o.anahtar === secili);
  if (duvar) {
    return (
      <div className="tc-atolye-ozellik">
        <h3 className="tc-atolye-ozellik-baslik">{duvar.cam ? 'Cam bölme' : 'Duvar'}</h3>
        <div className="tc-atolye-ozellik-ikili">
          <Sayi etiket="Baş X" deger={duvar.basX} degistir={(basX) => degistir(secili, { basX })} />
          <Sayi etiket="Baş Z" deger={duvar.basZ} degistir={(basZ) => degistir(secili, { basZ })} />
          <Sayi etiket="Son X" deger={duvar.sonX} degistir={(sonX) => degistir(secili, { sonX })} />
          <Sayi etiket="Son Z" deger={duvar.sonZ} degistir={(sonZ) => degistir(secili, { sonZ })} />
        </div>
        <Sayi etiket="Kalınlık (m)" deger={duvar.kalinlik} degistir={(kalinlik) => degistir(secili, { kalinlik })} adim={0.05} />
        <IsaretKutusu etiket="Cam" checked={duvar.cam} onChange={(o) => degistir(secili, { cam: o.target.checked })} />
        {sil('Sil')}
      </div>
    );
  }
  return null;
}
