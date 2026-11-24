import { useState } from 'react';
import { CokSatir, Dugme, Girdi, GrupluSecim, KodOkuyucu, Pencere, Secim, Simge, Tablo, type Secenek, type Sutun } from '../../ortak/arayuz/index.ts';
import type { AcikTeslim, TakimSatiri } from '#paylasilan/sozlesme/takimhane.ts';
import { IADE_ACIKLAMASI, IADE_ADI, IADE_SIRASI, type IadeDurumu } from './gosterim.ts';
import { IkiGorunum, KompaktListe } from './KompaktListe.tsx';
import './takimhane.css';

const kucuk = (m: string) => m.toLocaleLowerCase('tr');
const teslimAnahtari = (t: AcikTeslim) => `${String(t.konumKimligi)}-${String(t.kartKimlik)}`;
const zamanMetni = (iso: string) => new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

// Takım seçimi: 320 kalemlik açılır liste yerine arama ve okutma. Son çıkışlar aramadan önce tek dokunuşla seçilir.
function TakimSecimi({ takimlar, son, secili, sec }: {
  takimlar: readonly TakimSatiri[];
  son: readonly TakimSatiri[];
  secili: TakimSatiri | null;
  sec: (t: TakimSatiri | null) => void;
}) {
  const [ara, araYaz] = useState('');
  const [okutAcik, okutAcikYaz] = useState(false);
  const [okutMesaj, okutMesajYaz] = useState<string | null>(null);
  // Okunan kod takım kodu olmalı; başka metin seçimi bozmaz, nedeni yazılır.
  const okundu = (kod: string) => {
    const t = takimlar.find((x) => kucuk(x.kod) === kucuk(kod.trim()));
    if (t) { sec(t); okutAcikYaz(false); okutMesajYaz(null); } else okutMesajYaz(`${kod.trim()} bir takım kodu değil.`);
  };
  const aranan = kucuk(ara.trim());
  const sonuc = aranan === '' ? [] : takimlar.filter((t) => kucuk(`${t.kod} ${t.ad}`).includes(aranan)).slice(0, 6);
  if (secili) {
    return (
      <div className="tc-tkm-secili">
        <span className="tc-tkm-ad"><span className="mono">{secili.kod}</span><span>{secili.ad}</span></span>
        <span className="tc-tkm-soluk">Rafta {secili.konumlar.raf ?? '—'} adet</span>
        <Dugme simge="x" onClick={() => { sec(null); }}>Değiştir</Dugme>
      </div>
    );
  }
  return (
    <div className="tc-tkm-secim">
      <div className="tc-tkm-secim-ust">
        <Girdi etiket="Takım ya da aparat" placeholder="Kod ya da ad yazın" value={ara} onChange={(e) => { araYaz(e.target.value); }} />
        <Dugme simge="scan" onClick={() => { okutMesajYaz(null); okutAcikYaz(true); }}>Okut</Dugme>
      </div>
      {aranan === '' && son.length > 0 && (
        <div className="tc-tkm-son" role="group" aria-label="Son çıkışlar">
          <span className="tc-tkm-soluk">Son çıkışlar</span>
          {son.map((t) => <button key={t.kartKimlik} type="button" onClick={() => { sec(t); }}><span className="mono">{t.kod}</span></button>)}
        </div>
      )}
      {sonuc.length > 0 && (
        <ul className="tc-tkm-sonuc" aria-label="Arama sonuçları">
          {sonuc.map((t) => (
            <li key={t.kartKimlik}><button type="button" onClick={() => { sec(t); }}><span className="mono">{t.kod}</span><span>{t.ad}</span></button></li>
          ))}
        </ul>
      )}
      {aranan !== '' && sonuc.length === 0 && <p className="tc-tkm-soluk">Eşleşen takım yok.</p>}
      <Pencere acik={okutAcik} kapat={() => { okutAcikYaz(false); }} baslik="Takım okut" tur="orta">
        <KodOkuyucu okundu={okundu} ipucu="Takımın etiketindeki kod." />
        {okutMesaj !== null && <p role="alert" className="tc-tkm-soluk">{okutMesaj}</p>}
      </Pencere>
    </div>
  );
}

// Depo çıkarır, operatör alır; çıkış kaydı alışkanlığı için tek ekran, az alan (3613 Dilim 2).
export function CikisFormu({ takimlar, son, alicilar, emirler, gonder, ilkKart = null, ilkEmir = '' }: {
  takimlar: readonly TakimSatiri[];
  son: readonly TakimSatiri[];
  alicilar: readonly Secenek[];
  emirler: readonly Secenek[];
  gonder: (g: { kartKimlik: number; adet: number; alici: string; emir: string }) => void;
  // Emir ekranından gelen çıkışta aparat ve emir hazır seçilidir (3651).
  ilkKart?: number | null;
  ilkEmir?: string;
}) {
  const [secili, seciliYaz] = useState<TakimSatiri | null>(() => takimlar.find((t) => t.kartKimlik === ilkKart) ?? null);
  const [adet, adetYaz] = useState('1');
  const [alici, aliciYaz] = useState('');
  const [emir, emirYaz] = useState(ilkEmir);
  const yeter = secili === null || (secili.konumlar.raf ?? 0) >= Number(adet);
  // Kapalı düğmenin sebebi görünür: önce takım, sonra alan, sonra adet.
  const sebep = secili === null ? 'Takım seçin.' : alici === '' ? 'Alan seçin.' : Number(adet) < 1 ? 'Adet en az 1 olmalı.' : yeter ? null : 'Rafta bu kadar yok.';
  return (
    <form className="tc-tkm-form" onSubmit={(e) => { e.preventDefault(); if (sebep === null && secili) gonder({ kartKimlik: secili.kartKimlik, adet: Number(adet), alici, emir }); }}>
      <TakimSecimi takimlar={takimlar} son={son} secili={secili} sec={seciliYaz} />
      <Girdi etiket="Adet" type="number" inputMode="numeric" min={1} value={adet} onChange={(e) => { adetYaz(e.target.value); }} hata={yeter ? undefined : 'Rafta bu kadar yok'} />
      <Secim etiket="Alan (kişi ya da istasyon)" value={alici} onChange={(e) => { aliciYaz(e.target.value); }} bosSecenek="Seçiniz" secenekler={alicilar} />
      <Secim etiket="Üretim emri (isteğe bağlı)" value={emir} onChange={(e) => { emirYaz(e.target.value); }} bosSecenek="Emirsiz" secenekler={emirler} />
      <div className="tc-tkm-eylemler tc-tkm-eylem-sebepli">
        {sebep !== null && <p id="tkm-cikis-sebep" className="tc-tkm-soluk">{sebep}</p>}
        <Dugme tur="birincil" boyut="ana" simge="check" type="submit" disabled={sebep !== null} aria-describedby={sebep === null ? undefined : 'tkm-cikis-sebep'}>Teslim et</Dugme>
      </div>
    </form>
  );
}

export function AcikTeslimler({ teslimler, iade }: { teslimler: readonly AcikTeslim[]; iade: (t: AcikTeslim) => void }) {
  const sutunlar: readonly Sutun<AcikTeslim>[] = [
    { anahtar: 'kod', baslik: 'Kod', mono: true, kirilmaz: true, hucre: (t) => t.kod },
    { anahtar: 'ad', baslik: 'Takım', hucre: (t) => t.ad },
    { anahtar: 'adet', baslik: 'Adet', mono: true, hizala: 'sag', hucre: (t) => t.adet },
    { anahtar: 'alan', baslik: 'Kimde', hucre: (t) => <span className="tc-tkm-alan"><Simge ad={t.alanTuru === 'kisi' ? 'user' : 'cpu'} boyut="k" />{t.alan}</span> },
    { anahtar: 'verildi', baslik: 'Verildi', kirilmaz: true, hucre: (t) => t.verildi === null ? '—' : zamanMetni(t.verildi) },
    { anahtar: 'iade', baslik: '', csv: false, kartTamSatir: true, hucre: (t) => <Dugme simge="rotate" onClick={() => { iade(t); }}>İade al</Dugme> },
  ];
  return (
    <IkiGorunum
      masa={<Tablo etiket="Teslimdeki takımlar" sutunlar={sutunlar} satirlar={teslimler} satirAnahtari={teslimAnahtari} bosMesaj="Teslimde takım yok" />}
      kompakt={teslimler.length === 0 ? <p className="tc-tkm-bos">Teslimde takım yok</p> : (
        <KompaktListe
          etiket="Teslimdeki takımlar" satirlar={teslimler} satirAnahtari={teslimAnahtari}
          baslik={(t) => t.ad} sag={(t) => `${String(t.adet)} adet`}
          alt={(t) => [t.kod, t.alan].join(' · ')}
          ek={(t) => <Dugme simge="rotate" onClick={() => { iade(t); }}>İade al</Dugme>}
        />
      )}
    />
  );
}

export function IadePenceresi({ teslim, kapat, onayla, ilkDurum = 'saglam' }: {
  teslim: AcikTeslim | null;
  kapat: () => void;
  onayla: (g: { adet: number; durum: IadeDurumu; neden: string }) => void;
  ilkDurum?: IadeDurumu;
}) {
  const [durum, durumYaz] = useState<IadeDurumu>(ilkDurum);
  const [adet, adetYaz] = useState('');
  const [neden, nedenYaz] = useState('');
  const kirik = durum === 'kirik';
  const sayi = adet === '' ? (teslim?.adet ?? 0) : Number(adet);
  const nedenYok = kirik && neden.trim() === '';
  const gecersiz = sayi < 1 || (teslim !== null && sayi > teslim.adet);
  return (
    <Pencere acik={teslim !== null} kapat={kapat} baslik={teslim ? `İade al · ${teslim.kod}` : 'İade al'} tur="orta">
      {teslim && (
        <div className="tc-tkm-form">
          <p>{teslim.ad}: {teslim.alan} üzerinde {teslim.adet} adet.</p>
          <GrupluSecim
            etiket="İade durumu" secili={durum} sec={durumYaz}
            gruplar={[{ anahtar: 'd', baslik: 'Durum', secenekler: IADE_SIRASI.map((d) => ({ deger: d, baslik: IADE_ADI[d], alt: IADE_ACIKLAMASI[d], simge: d === 'saglam' ? 'check' : d === 'asinmis' ? 'alert' : 'x' as const })) }]}
          />
          <Girdi etiket="İade edilen adet" type="number" inputMode="numeric" min={1} max={teslim.adet} value={adet} placeholder={`Tamamı (${String(teslim.adet)})`} onChange={(e) => { adetYaz(e.target.value); }} />
          {kirik && <CokSatir etiket="Kırılma nedeni" required value={neden} onChange={(e) => { nedenYaz(e.target.value); }} ipucu="Kırık iade için neden yazılır." />}
          <div className="tc-tkm-eylemler tc-tkm-eylem-sebepli">
            {(nedenYok || gecersiz) && <p id="tkm-iade-sebep" className="tc-tkm-soluk">{gecersiz ? `Adet 1 ile ${String(teslim.adet)} arasında olmalı.` : 'Kırılma nedenini yazın.'}</p>}
            <Dugme onClick={kapat}>Vazgeç</Dugme>
            <Dugme tur="birincil" simge="check" disabled={gecersiz || nedenYok} aria-describedby={gecersiz || nedenYok ? 'tkm-iade-sebep' : undefined} onClick={() => { onayla({ adet: sayi, durum, neden: neden.trim() }); }}>İade al</Dugme>
          </div>
        </div>
      )}
    </Pencere>
  );
}
