import { useState } from 'react';
import { Dugme, OnayPenceresi, Pencere } from '../../../../ortak/arayuz/index.ts';
import { Foy } from '../ortak/Foy.tsx';
import { ResimAlani } from '../ortak/ResimAlani.tsx';
import * as K from '../kurallar/index.ts';
import type { KuralBaglami } from '../kurallar/index.ts';
import type { Gezinti } from '../sekmeler.ts';
import type { KatalogKarti, KartKaydi } from '../tipler.ts';
import type { KgFiyati } from '../veri.ts';
import type { MalzemeYetkisi } from '../yetki.ts';
import { kimlikOf, yerineOf } from './liste.ts';
import { Muadiller, OnayPaneli, Revizyonlar, TalepPaneli, type OnayIslemi, type TalepIslemi } from './paneller.tsx';

interface Ozellikler {
  kart: KatalogKarti;
  kartlar: readonly KatalogKarti[];
  yetki: MalzemeYetkisi;
  b: KuralBaglami;
  git: Gezinti;
  kgFiyati: KgFiyati | null | undefined;
  mesgul: boolean;
  kapat: () => void;
  ac: (kimlik: string) => void;
  onayIslemi: (x: KartKaydi, i: OnayIslemi, neden?: string) => void;
  talepIslemi: (x: KartKaydi, i: TalepIslemi, neden?: string) => void;
  birlestir: (kimlikler: string[]) => void;
  etiket: (kimlikler: string[]) => void;
  saha: (kimlik: string) => void;
  sil: (k: KatalogKarti) => Promise<boolean>;
}

// Prototipin openItem penceresi: birleştirilmiş ve mükerrer uyarısı, talep, onay, föy, muadiller, revizyon geçmişi ve eylemler.
export function KartPenceresi({
  kart, kartlar, yetki, b, git, kgFiyati, mesgul, kapat, ac, onayIslemi, talepIslemi, birlestir, etiket, saha, sil,
}: Ozellikler) {
  const [silSor, silSorYaz] = useState(false);
  const x = kart.kayit;
  const kayitlar = kartlar.map((k) => k.kayit);
  const yerine = yerineOf(x);
  const ayni = yerine ? [] : K.benzerKartlar(x, kayitlar, b).filter((r) => r.seviye === 'ayni');
  const hizmet = x.tur === 'hizmet';
  const kilitli = K.pasifKilitli(x, b);
  const baslik = `${x.com.kod} ${x.com.ad}`.trim();
  return (
    <Pencere
      acik
      kapat={kapat}
      baslik={baslik || 'Malzeme föyü'}
      tur="yan"
      alt={(
        <div className="tc-mk-pencere-alt">
          {yetki.yaz && (
            <>
              {!kilitli && <Dugme tur="birincil" simge="edit" onClick={() => git.yeniKart({ kart: kart.kimlik })}>Düzenle</Dugme>}
              <Dugme simge="layers" onClick={() => git.yeniKart({ kopya: kart.kimlik })}>Kopyasını oluştur</Dugme>
              <Dugme simge="file" onClick={() => git.yeniKart({ sablonYap: kart.kimlik })}>Şablon yap</Dugme>
            </>
          )}
          {!hizmet && <Dugme simge="tag" onClick={() => etiket([kart.kimlik])}>Etiket</Dugme>}
          {!hizmet && yetki.etiketMerkezi && <Dugme simge="printer" onClick={() => git.etiketMerkezi(kart.no)}>Etiket Merkezi'nde bas</Dugme>}
          {yetki.yaz && yetki.onayla && <Dugme tur="tehlike" simge="trash" onClick={() => silSorYaz(true)}>Sil</Dugme>}
          <Dugme simge="scan" onClick={() => saha(kart.kimlik)}>Saha görünümü</Dugme>
          <Dugme className="tc-mk-sona" onClick={kapat}>Kapat</Dugme>
        </div>
      )}
    >
      {yerine && (
        <p className="tc-mk-uyari" data-ton="hata">
          <b>Bu kart birleştirildi.</b> Yerine{' '}
          <button type="button" className="tc-mk-bag" onClick={() => ac(yerine.id)}>{yerine.kod}</button> kartını kullan.
        </p>
      )}
      {ayni.length > 0 && (
        <p className="tc-mk-uyari" data-ton="hata">
          <b>Mükerrer:</b>{' '}
          {ayni.map((r, i) => (
            <span key={kimlikOf(r.x)}>{i > 0 && ', '}<button type="button" className="tc-mk-bag" onClick={() => ac(kimlikOf(r.x))}>{r.x.com.kod}</button></span>
          ))}{' '}
          ile aynı ({ayni[0]!.neden}).
          {yetki.yaz && yetki.onayla && <Dugme onClick={() => birlestir([kart.kimlik, ...ayni.map((r) => kimlikOf(r.x))])}>Birleştir…</Dugme>}
        </p>
      )}
      <TalepPaneli x={x} yetki={yetki} b={b} mesgul={mesgul} islem={(i, n) => talepIslemi(x, i, n)} />
      <OnayPaneli x={x} yetki={yetki} b={b} mesgul={mesgul} islem={(i, n) => onayIslemi(x, i, n)} />
      <Foy veri={K.foyVerisi(x, b)} {...(kgFiyati !== undefined ? { kgFiyati } : {})} />
      <ResimAlani tur={x.tur} no={kart.no} />
      <Muadiller x={x} kayitlar={kayitlar} b={b} ac={ac} />
      <Revizyonlar x={x} />
      <OnayPenceresi
        acik={silSor}
        baslik={`${x.com.kod} silinsin mi?`}
        onayMetni="Sil"
        tehlikeli
        yukleniyor={mesgul}
        vazgec={() => silSorYaz(false)}
        onayla={() => { void sil(kart).then((ok) => { silSorYaz(false); if (ok) kapat(); }); }}
      >
        <p>Kart iptal edilir ve katalogdan kalkar.</p>
      </OnayPenceresi>
    </Pencere>
  );
}
