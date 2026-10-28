import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DurumKutusu, Dugme, SayfaBasligi, Simge } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { STUDYO_YOLU, type EkranOzellikleri, type KmSayaci } from '../sekmeler.ts';
import type { FormKaydi } from '../tipler.ts';
import { FormOnayi } from './FormOnayi.tsx';
import { HataliKarari } from './HataliKarari.tsx';
import { IlkParcaKarari } from './IlkParcaKarari.tsx';
import { bugunGorevleri, bugunOzeti, gruplara, type BugunOzeti, type Gorev, type GorevEylemi } from './gorevler.ts';
import './bugun.css';

const GRUP_SINIRI = 8;
const ATOLYE_GRUP_SINIRI = 20;

// Bölüm sayacı uygulamanın "Bugün" rozetidir: acil (öncelik 0-1) iş sayısı.
export const BugunSayaci: KmSayaci = (veri) => {
  const n = bugunGorevleri(veri, false).filter((g) => g.oncelik <= 1).length;
  return { n, kotu: n > 0 };
};

const tarihMetni = (): string => new Date().toLocaleDateString('tr-TR', { weekday: 'long', day: 'numeric', month: 'long' });

// Atölye modu düğmesi ve tercihi kabuktadır; Bugün'de iş listesi uzar, özet şeridi gizlenir (uygulamadaki gibi).
export function Bugun({ veri, yetki, git, atolye }: EkranOzellikleri) {
  const gezin = useNavigate();
  const [onaylanan, onaylananYaz] = useState<FormKaydi | null>(null);
  const gorevler = bugunGorevleri(veri, yetki.kapat);
  const gruplar = gruplara(gorevler);
  const ozet = bugunOzeti(veri);
  const sinir = atolye ? ATOLYE_GRUP_SINIRI : GRUP_SINIRI;
  const ad = veri.kisi.trim().split(/\s+/)[0];

  const uygula = (e: GorevEylemi) => {
    if (e.tur === 'yol') void gezin(e.yol);
    else if (e.tur === 'formOnayi') onaylananYaz(e.kayit);
    else git(e.gorunum, e.gecis);
  };

  const kisayollar: { anahtar: string; baslik: string; alt: string; simge: SimgeAdi; yap: () => void }[] = [
    { anahtar: 'olcum', baslik: 'Ölçüm yap', alt: 'Resim veya model üzerinde adım adım', simge: 'ruler', yap: () => { void gezin(STUDYO_YOLU); } },
    { anahtar: 'lot', baslik: 'Lot kabul', alt: 'AQL ile numune ve karar', simge: 'box', yap: () => { git('lot-kabul', { ac: 'yeni' }); } },
    { anahtar: 'giris', baslik: 'Giriş muayenesi', alt: 'Tedarikçiden gelen parça', simge: 'check', yap: () => { git('muayeneler', { ac: 'yeni', on: { tur: 'Giriş' } }); } },
    { anahtar: 'ncr', baslik: 'Uygunsuzluk bildir', alt: 'NCR aç', simge: 'alert', yap: () => { git('uygunsuzluklar', { ac: 'yeni' }); } },
    { anahtar: 'yukle', baslik: 'Resim / model yükle', alt: 'PDF, görüntü veya STEP', simge: 'cube', yap: () => { void gezin(STUDYO_YOLU); } },
  ];

  return (
    <div className="tc-km1-bugun">
      <SayfaBasligi
        baslik={ad ? `Merhaba ${ad}` : 'Bugün'} simge="bell"
        alt={`${tarihMetni()}${gorevler.length ? `, ${String(gorevler.length)} iş bekliyor` : ', bekleyen iş yok'}`}
      />
      {yetki.onayla && <IlkParcaKarari />}
      {yetki.onayla && <HataliKarari ncrler={veri.ncr} />}
      {yetki.yaz && (
        <section className="tc-km1-kisayollar" aria-label="Hızlı işler">
          {kisayollar.map((k) => (
            <button key={k.anahtar} type="button" className="tc-km1-kisayol" onClick={k.yap}>
              <Simge ad={k.simge} />
              <b>{k.baslik}</b>
              <small>{k.alt}</small>
            </button>
          ))}
        </section>
      )}
      {!atolye && <OzetSeridi ozet={ozet} git={git} />}
      {gruplar.length > 0
        ? gruplar.map((g) => (
          <section key={g.grup} className="tc-km1-grup" aria-label={g.grup}>
            <h3 className="tc-km1-grup-baslik">{g.grup} <span className="tc-km1-soluk">{g.gorevler.length}</span></h3>
            <ul className="tc-km1-liste">
              {g.gorevler.slice(0, sinir).map((t, i) => <GorevSatiri key={`${t.baslik}-${String(i)}`} gorev={t} uygula={uygula} />)}
            </ul>
            {g.gorevler.length > sinir && <p className="tc-km1-soluk tc-km1-daha">+{g.gorevler.length - sinir} daha</p>}
          </section>
        ))
        : (
          <DurumKutusu durum="bos" mesaj="Bekleyen iş yok">
            <p>Karantinada ürün, geciken DÖF, yarım ölçüm ya da geçersiz cihaz bulunmuyor.</p>
          </DurumKutusu>
        )}
      {onaylanan && <FormOnayi kayit={onaylanan} rol={yetki.rol} kapat={() => { onaylananYaz(null); }} />}
    </div>
  );
}

function GorevSatiri({ gorev, uygula }: { gorev: Gorev; uygula: (e: GorevEylemi) => void }) {
  return (
    <li className="tc-km1-gorev" data-oncelik={gorev.oncelik <= 1 ? String(gorev.oncelik) : undefined}>
      <div className="tc-km1-gorev-metin">
        <b>{gorev.baslik}</b>
        <small>{gorev.alt}</small>
      </div>
      <span className="tc-km1-gorev-eylem">
        <Dugme tur={gorev.oncelik <= 1 ? 'birincil' : 'ikincil'} onClick={() => { uygula(gorev.eylem); }}>{gorev.eylemMetni}</Dugme>
      </span>
    </li>
  );
}

function OzetSeridi({ ozet, git }: { ozet: BugunOzeti; git: EkranOzellikleri['git'] }) {
  const ogeler = [
    { anahtar: 'ncr', sayi: ozet.acikNcr, metin: 'Açık uygunsuzluk', ton: ozet.acikNcr ? 'uyari' : undefined, yap: () => { git('uygunsuzluklar'); } },
    { anahtar: 'karantina', sayi: ozet.karantinada, metin: 'Karantinada bekleyen', ton: ozet.karantinada ? 'hata' : undefined, yap: () => { git('gostergeler'); } },
    { anahtar: 'yarim', sayi: ozet.yarim, metin: 'Yarım ölçüm', ton: undefined, yap: () => { git('muayeneler'); } },
    { anahtar: 'cihaz', sayi: ozet.gecersizCihaz, metin: 'Geçersiz cihaz', ton: ozet.gecersizCihaz ? 'hata' : undefined, yap: () => { git('cihazlar'); } },
  ] as const;
  return (
    <section className="tc-km1-serit" aria-label="Özet">
      {ogeler.map((o) => (
        <button key={o.anahtar} type="button" className="tc-km1-serit-oge" onClick={o.yap}>
          <b data-ton={o.ton}>{o.sayi}</b>
          <span>{o.metin}</span>
        </button>
      ))}
    </section>
  );
}
