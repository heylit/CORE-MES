// Genel listeler (sertifika, stok birimi, belge türü), roller ve genel ayarlar (prototipin üst şeritteki "Ayarlar" penceresi).
import { useState } from 'react';
import { Dugme, Girdi, IsaretKutusu, Rozet, Tablo, type Sutun } from '../../../../../ortak/arayuz/index.ts';
import type { Duzen } from '../duzen.ts';
import { ROLLER, TURLER, YETKI, YETKI_AD, birlesmeListesi, mukerrerGruplari, type MukerrerGrubu } from '../kaynak.ts';
import { ListeDuzenleyici } from '../ListeDuzenleyici.tsx';
import { BolumBasligi, Kutu, dosyaIndir } from '../parcalar.tsx';
import { FirmaKodu } from './Kurallar.tsx';

export function Sertifikalar({ d }: { d: Duzen }) {
  return (
    <>
      <BolumBasligi baslik="Sertifikalar" aciklama="Ticari bilgiler adımındaki sertifika ve uygunluk seçimleri." />
      <ListeDuzenleyici d={d} id="sertifika" baslik="Sertifika ve uygunluk" hepAcik />
    </>
  );
}

export function BelgeTurleri({ d }: { d: Duzen }) {
  return (
    <>
      <BolumBasligi baslik="Belge türleri" aciklama="Karta belge eklerken seçilen türler." />
      <ListeDuzenleyici d={d} id="belge" baslik="Belge türleri" hepAcik />
    </>
  );
}

const BIRIM_TURLERI = ['yarimamul', 'mamul', 'sarf', 'demirbas', 'hizmet', 'ticari_mal'] as const;

export function StokBirimleri({ d }: { d: Duzen }) {
  return (
    <>
      <BolumBasligi baslik="Stok birimleri" aciklama="Ticari bilgiler adımındaki stok birimi seçenekleri; her tür için ayrı." />
      <ListeDuzenleyici d={d} id="birim" baslik="Hammadde" />
      {BIRIM_TURLERI.map((t) => <ListeDuzenleyici key={t} d={d} id={`birim|${t}`} baslik={TURLER[t]?.ad ?? t} />)}
    </>
  );
}

const ROL_EYLEMLERI = ['kart', 'talepGonder', 'onay', 'birlestir', 'sil', 'ayar', 'rol'] as const;

export function Roller({ d }: { d: Duzen }) {
  const rol = d.o.ortam.rol;
  const roller = Object.keys(ROLLER);
  const sutunlar: Sutun<string>[] = [
    { anahtar: 'eylem', baslik: 'Yapılabilecekler', hucre: (e) => YETKI_AD[e] ?? e },
    ...roller.map((r): Sutun<string> => ({
      anahtar: r, baslik: ROLLER[r]?.ad ?? r, hizala: 'sag',
      hucre: (e) => (e === 'talepGonder' || (YETKI[e] ?? []).includes(r) ? <span aria-label="var">✓</span> : <span aria-label="yok">—</span>),
    })),
  ];
  return (
    <>
      <BolumBasligi baslik="Roller ve yetkiler" aciklama="Kim kart açar, kim onaylar, kim ayarları değiştirir." />
      {rol && ROLLER[rol] && (
        <p className="tc-ma-rolum"><Rozet ton="tamam">{ROLLER[rol].ad}</Rozet> Senin rolün. {ROLLER[rol].acik}</p>
      )}
      <Tablo etiket="Roller ve yetkiler" sutunlar={sutunlar} satirlar={ROL_EYLEMLERI} satirAnahtari={(e) => e} />
      <p className="tc-ma-uyari">Roller stok uygulamasından (ERP) geliyor.</p>
    </>
  );
}

function MukerrerTarama({ d }: { d: Duzen }) {
  const [gruplar, gruplarYaz] = useState<readonly MukerrerGrubu[] | null>(null);
  const listeyiIndir = () => {
    const l = birlesmeListesi(d.b);
    if (!l.length) { d.bildir('bilgi', 'Henüz birleştirilmiş kart yok.'); return; }
    const hucre = (x: unknown) => { const s = String(x ?? ''); return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const satirlar = [['Eski kod', 'Eski ad', 'Yeni kod', 'Tarih', 'Neden'], ...l.map((r) => [r.eski_kod, r.eski_ad, r.yeni_kod, r.tarih, r.neden])];
    dosyaIndir('birlestirme-listesi.csv', `﻿${satirlar.map((r) => r.map(hucre).join(';')).join('\r\n')}`, 'text/csv');
  };
  const kod = (x: MukerrerGrubu['kartlar'][number]) => String((x.kayit as { com?: { kod?: string } }).com?.kod ?? x.kimlik);
  const ad = (x: MukerrerGrubu['kartlar'][number]) => String((x.kayit as { com?: { ad?: string } }).com?.ad ?? '');
  return (
    <Kutu baslik="Mükerrer tarama">
      <p className="tc-ma-yardim">Katalogdaki aynı kartları (aynı kalite ve ölçü, aynı teknik resim, aynı seri no …) gruplar hâlinde listeler.</p>
      <div className="tc-ma-eylemler">
        <Dugme simge="search" onClick={() => gruplarYaz(mukerrerGruplari(d.b))}>Kataloğu tara</Dugme>
        <Dugme simge="download" onClick={listeyiIndir}>Birleştirme listesini indir</Dugme>
      </div>
      {gruplar && (gruplar.length === 0
        ? <p className="tc-ma-tamam">Mükerrer kart bulunamadı.</p>
        : (
          <>
            <p className="tc-ma-yardim">{gruplar.length} grup bulundu. Fazla kartları pasife alıp hareketleri tek karta taşıyabilirsin.</p>
            {gruplar.map((g) => (
              <div key={g.kartlar.map((x) => x.kimlik).join(',')} className="tc-ma-uyari">
                <b>{g.neden}</b>
                <ul>
                  {g.kartlar.map((x) => (
                    <li key={x.kimlik}><button type="button" className="tc-ma-bag" onClick={() => d.o.git.katalog(x.kimlik)}>{kod(x)}</button> {ad(x)}</li>
                  ))}
                </ul>
              </div>
            ))}
          </>
        ))}
    </Kutu>
  );
}

// TMI'de onay akışı, kod yapısı, QR ve açıklama ayarları sunucudan gelir ve burada yalnız görünür (prototipte `onayAyarKilit`).
export function GenelAyarlar({ d }: { d: Duzen }) {
  const g = d.genel as { onayAkisi?: boolean; kodYapisi?: string; qrAdres?: string; acUzunluk?: number; acBuyuk?: boolean };
  const kilit = true;
  return (
    <>
      <BolumBasligi baslik="Genel" />
      <Kutu baslik="Onay akışı">
        <IsaretKutusu etiket="Yeni ve değişen kartlar onaydan sonra aktif olsun" checked={g.onayAkisi !== false} disabled={kilit} readOnly />
        <IsaretKutusu etiket="Dört göz kuralı: kartı gönderen kişi kendi kartını onaylayamasın" checked={d.o.ortam.dortGoz} disabled={kilit} readOnly />
        <IsaretKutusu etiket="Bu kullanıcının onay yetkisi var" checked={d.o.yetki.onayla} disabled={kilit} readOnly />
        <p className="tc-ma-yardim">Bu ayarlar stok uygulaması tarafından yönetiliyor.</p>
      </Kutu>
      <Kutu baslik="Malzeme kodu">
        <label className="tc-isaret"><input type="radio" name="tc-ma-kod-yapisi" checked={g.kodYapisi !== 'teknik'} disabled={kilit} readOnly /><span>Standart: tür-grup-sıra (ör. HM-PAS-00042)</span></label>
        <label className="tc-isaret"><input type="radio" name="tc-ma-kod-yapisi" checked={g.kodYapisi === 'teknik'} disabled={kilit} readOnly /><span>Teknik: anlamlı kod (ör. MET-PAS-316L-LV-2x1000x2000)</span></label>
        <p className="tc-ma-yardim">Standart yapıda anlamlı kod "teknik kod" olarak ayrıca saklanır ve aramada kullanılır.</p>
        <FirmaKodu d={d} kilitli={kilit} />
      </Kutu>
      <Kutu baslik="QR içeriği">
        <p className="tc-ma-yardim">
          Etiketteki QR kodunun içeriği. Boşsa kart kodu yazılır (MK:HM-PAS-00001) ve bu uygulamadaki "QR okut" ile açılır. Stok uygulamanın kart sayfası varsa bağlantı şablonu yaz; telefonun kamerası doğrudan o sayfayı açar.
        </p>
        <Girdi etiket="Bağlantı şablonu ({kod} ve {id} yer tutucuları)" value={g.qrAdres ?? ''} placeholder="ör. https://stok.example/malzeme#kart={kod}" disabled={kilit} readOnly />
      </Kutu>
      <Kutu baslik="Açıklama 1, 2, 3">
        <div className="tc-ma-dar"><Girdi etiket="Azami uzunluk (karakter)" inputMode="numeric" value={String(g.acUzunluk ?? 50)} disabled={kilit} readOnly /></div>
        <IsaretKutusu etiket="Büyük harfle yaz" checked={Boolean(g.acBuyuk)} disabled={kilit} readOnly />
      </Kutu>
      <MukerrerTarama d={d} />
    </>
  );
}
