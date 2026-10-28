import { useState } from 'react';
import type { SartnameOzeti, TalimatSablonuCevabi } from '#paylasilan/sozlesme/rota.ts';
import { hataIletisi } from '../../../../ortak/veri/api.ts';
import { DurumKutusu, Dugme, Girdi, Pencere, Rozet, Secim, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { AdimDuzenleyici } from './AdimDuzenleyici.tsx';
import { AdimOnizleme } from './AdimOnizleme.tsx';
import { adimEksikleri, eslesir, girdiyeCevir, sablonOzeti, taslagaCevir, type AdimTaslagi } from './kurallar.ts';
import { useSablon, useSablonKomutu, useSablonlar } from './veri.ts';

type Sablon = TalimatSablonuCevabi['sablon'];
// Düzenleyicinin hâli: yeni (boş ya da kopya) ya da var olanın yeni sürümü.
type Duzen = { tur: 'yeni'; kod: string; ad: string; sartnameId: number | null; adimlar: AdimTaslagi[] }
  | { tur: 'surum'; sablon: Sablon; ad: string; sartnameId: number | null; adimlar: AdimTaslagi[] };

interface Ozellikler {
  yazabilir: boolean;
  sartnameler: readonly SartnameOzeti[];
  yeniAcik: boolean;
  yeniKapat: () => void;
}

// Talimat şablonları sekmesi (prototip Main): solda arama ve liste, sağda seçili şablonun adım adım önizlemesi.
export function TalimatSablonlari({ yazabilir, sartnameler, yeniAcik, yeniKapat }: Ozellikler) {
  const liste = useSablonlar();
  const [q, setQ] = useState('');
  const [seciliId, setSeciliId] = useState<number | null>(null);
  const [duzen, setDuzen] = useState<Duzen | null>(null);
  const sablonlar = liste.data?.sablonlar ?? [];
  const gorunen = sablonlar.filter((s) => eslesir(q, s.kod, s.ad, s.sartname?.kod ?? null, s.sartname?.ad ?? null));
  const id = seciliId ?? gorunen[0]?.id ?? null;
  const ayrinti = useSablon(id);
  const acikDuzen: Duzen | null = duzen ?? (yeniAcik ? { tur: 'yeni', kod: '', ad: '', sartnameId: null, adimlar: [] } : null);

  if (liste.isPending) return <DurumKutusu durum="yukleniyor" />;
  if (liste.isError) return <DurumKutusu durum="hata" mesaj={hataIletisi(liste.error, 'Talimat şablonları alınamadı.')} yenile={() => { void liste.refetch(); }} />;

  const sablon = ayrinti.data?.sablon;
  return (
    <div className="tc-st-izgara">
      <section className="tc-st-kutu" aria-label="Şablon listesi">
        <Girdi etiket="Ara" type="search" placeholder="Şablon adı ya da işlem" value={q} onChange={(e) => { setQ(e.target.value); }} />
        {gorunen.length === 0 && <p className="tc-st-soluk">{sablonlar.length ? 'Aramaya uyan şablon yok.' : 'Henüz şablon yok.'}</p>}
        <div className="tc-st-liste">
          {gorunen.map((s) => (
            <button key={s.id} type="button" className="tc-st-satir-sec" aria-current={s.id === id ? 'true' : undefined} onClick={() => { setSeciliId(s.id); }}>
              <span className="tc-st-adim-metin">
                <span className="tc-st-kalin">{s.ad}</span>
                <span className="tc-st-soluk">{`${s.kod} · ${String(s.adimSayisi)} adım${s.kontrolSayisi ? ` · ${String(s.kontrolSayisi)} kontrol noktası` : ''}`}</span>
              </span>
              <span className="tc-st-rozetler">
                {!s.aktif && <Rozet ton="pasif">pasif</Rozet>}
                <span className="tc-st-medya-sayi" aria-label={`${String(s.resimSayisi)} resim, ${String(s.videoSayisi)} video`}>
                  <Simge ad="camera" boyut="k" />{s.resimSayisi}<Simge ad="play" boyut="k" />{s.videoSayisi}
                </span>
              </span>
            </button>
          ))}
        </div>
      </section>

      <section className="tc-st-kutu" aria-label="Şablon önizlemesi">
        {id === null && <p className="tc-st-soluk">Soldan bir şablon seçin.</p>}
        {ayrinti.isPending && id !== null && <DurumKutusu durum="yukleniyor" />}
        {ayrinti.isError && <DurumKutusu durum="hata" mesaj={hataIletisi(ayrinti.error, 'Şablon alınamadı.')} yenile={() => { void ayrinti.refetch(); }} />}
        {sablon && (
          <SablonOnizleme sablon={sablon} yazabilir={yazabilir}
            kopyala={() => { setDuzen({ tur: 'yeni', kod: '', ad: `${sablon.ad} (kopya)`, sartnameId: sablon.sartname?.id ?? null, adimlar: sablon.adimlar.map(taslagaCevir) }); }}
            yeniSurum={() => { setDuzen({ tur: 'surum', sablon, ad: sablon.ad, sartnameId: sablon.sartname?.id ?? null, adimlar: sablon.adimlar.map(taslagaCevir) }); }} />
        )}
      </section>

      {acikDuzen && (
        <SablonDuzenleyici duzen={acikDuzen} sartnameler={sartnameler} degistir={setDuzen}
          kapat={() => { setDuzen(null); yeniKapat(); }}
          kaydedildi={(yeniId) => { setDuzen(null); yeniKapat(); setSeciliId(yeniId); }} />
      )}
    </div>
  );
}

function SablonOnizleme({ sablon, yazabilir, kopyala, yeniSurum }: { sablon: Sablon; yazabilir: boolean; kopyala: () => void; yeniSurum: () => void }) {
  const komut = useSablonKomutu();
  const { bildir } = useBildirim();
  const durumYaz = () => {
    komut.mutate({ ad: 'durum', id: sablon.id, govde: { surum: sablon.surum, aktif: !sablon.aktif } }, {
      onSuccess: () => { bildir('tamam', sablon.aktif ? 'Şablon pasife alındı.' : 'Şablon kullanıma alındı.'); },
      onError: (h) => { bildir('hata', hataIletisi(h, 'Şablonun durumu değişmedi.')); },
    });
  };
  return (
    <>
      <div className="tc-st-satir tc-st-sar">
        <div className="tc-st-adim-metin">
          <span className="tc-st-kod">{`${sablon.kod} · sürüm ${String(sablon.surum)} · ${sablon.aktif ? 'kullanımda' : 'pasif'}`}</span>
          <h2 className="tc-st-baslik">{sablon.ad}</h2>
          <span className="tc-st-soluk">
            {`Bağlı şartname: ${sablon.sartname ? `${sablon.sartname.kod} · ${sablon.sartname.ad}` : 'yok'} · ${sablonOzeti(sablon.adimlar)}`}
          </span>
        </div>
        {yazabilir && (
          <div className="tc-st-araclar">
            <Dugme simge="file" onClick={kopyala}>Kopyala</Dugme>
            <Dugme simge="edit" onClick={yeniSurum}>Yeni sürüm</Dugme>
            <Dugme simge={sablon.aktif ? 'lock' : 'check'} yukleniyor={komut.isPending} onClick={durumYaz}>
              {sablon.aktif ? 'Pasife al' : 'Kullanıma al'}
            </Dugme>
          </div>
        )}
      </div>
      <AdimOnizleme adimlar={sablon.adimlar} />
    </>
  );
}

function SablonDuzenleyici({ duzen, sartnameler, degistir, kapat, kaydedildi }: {
  duzen: Duzen; sartnameler: readonly SartnameOzeti[]; degistir: (d: Duzen) => void; kapat: () => void; kaydedildi: (id: number) => void;
}) {
  const komut = useSablonKomutu();
  const { bildir } = useBildirim();
  const [hata, setHata] = useState<string | null>(null);
  const eksikler = adimEksikleri(duzen.adimlar);
  if (duzen.ad.trim() === '') eksikler.unshift('Şablon adı zorunlu.');
  if (duzen.tur === 'yeni' && !/^[A-Z0-9][A-Z0-9-]{1,29}$/.test(duzen.kod.trim().toUpperCase())) eksikler.unshift('Kod 2-30 karakter: büyük harf, rakam ve tire.');
  const secenekler = sartnameler.filter((s) => s.aktif || s.id === duzen.sartnameId).map((s) => ({ deger: String(s.id), baslik: `${s.kod} · ${s.ad}` }));

  const kaydet = () => {
    setHata(null);
    const adimlar = duzen.adimlar.map(girdiyeCevir);
    const ortak = { ad: duzen.ad.trim(), sartnameId: duzen.sartnameId, adimlar };
    komut.mutate(duzen.tur === 'yeni'
      ? { ad: 'ekle', govde: { kod: duzen.kod.trim().toUpperCase(), ...ortak } }
      : { ad: 'kaydet', id: duzen.sablon.id, govde: { surum: duzen.sablon.surum, ...ortak } }, {
      onSuccess: (c) => { bildir('tamam', duzen.tur === 'yeni' ? 'Şablon eklendi.' : 'Şablonun yeni sürümü kaydedildi.'); kaydedildi(c.sablon.id); },
      onError: (h) => { setHata(hataIletisi(h, 'Şablon kaydedilemedi.')); },
    });
  };

  return (
    <Pencere acik tur="tam" kapat={kapat} baslik={duzen.tur === 'yeni' ? 'Yeni talimat şablonu' : `${duzen.sablon.kod} · yeni sürüm`}>
      <div className="tc-st-duz-govde">
        <div className="tc-st-kunye">
          {duzen.tur === 'yeni' && (
            <Girdi etiket="Kod" value={duzen.kod} maxLength={30} required placeholder="TS-..." onChange={(e) => { degistir({ ...duzen, kod: e.target.value }); }} />
          )}
          <Girdi etiket="Ad" value={duzen.ad} maxLength={120} required onChange={(e) => { degistir({ ...duzen, ad: e.target.value }); }} />
          <Secim etiket="Bağlı şartname" bosSecenek="Yok (iç adım)" secenekler={secenekler} value={duzen.sartnameId === null ? '' : String(duzen.sartnameId)}
            onChange={(e) => { degistir({ ...duzen, sartnameId: e.target.value === '' ? null : Number(e.target.value) }); }} />
        </div>
        <AdimDuzenleyici adimlar={duzen.adimlar} degistir={(adimlar) => { degistir({ ...duzen, adimlar }); }}
          alt={(
            <>
              {eksikler.length > 0 && <ul className="tc-st-eksik">{eksikler.slice(0, 5).map((e) => <li key={e}>{e}</li>)}</ul>}
              {hata && <p className="tc-st-hata" role="alert">{hata}</p>}
              <div className="tc-st-araclar tc-st-sag">
                <Dugme onClick={kapat}>Vazgeç</Dugme>
                <Dugme tur="birincil" simge="check" disabled={eksikler.length > 0} yukleniyor={komut.isPending} onClick={kaydet}>
                  {duzen.tur === 'yeni' ? 'Şablonu ekle' : 'Yeni sürümü kaydet'}
                </Dugme>
              </div>
            </>
          )} />
      </div>
    </Pencere>
  );
}
