import type { ReactNode } from 'react';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { DurumKutusu } from '../../../../ortak/arayuz/index.ts';
import { adSoyad, para, tarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { MOTOR_HAZIRLANIYOR, type IkMotoru } from '../motor.ts';
import { BelgeYazdir } from '../ortak/BelgeYazdir.tsx';
import type { Personel } from '../tipler.ts';
import { TazminatAdimlari } from './hesaplar.tsx';
import { ayMetni, sayi } from './kurallar.ts';
import {
  ayarSayisi, bordroHesapla, donemde, kalanIzin, primKidemAylik, tazminat, ucretTarihte, yanHakAylik, type AySonucu, type TazminatSonucu,
} from './motor-yuzu.ts';
import { Bolum, eksi, HesapDokumu, Not } from './parcalar.tsx';
import './bordro.css';

// Kişi sayfasının açtığı bordro parçaları (app.js viewEmployee ücret ve çıkış bölümleri, slipDoc, severanceDoc). Hesap motordadır;
// parçalar kayda yazmaz.

const oranlarAy = (m: IkMotoru, ay: string) => donemde(m, `${ay}-01`, () => ({
  sgkIsci: ayarSayisi(m, 'sgkIsciOran'), issIsci: ayarSayisi(m, 'issizlikIsciOran'), bes: ayarSayisi(m, 'besOran'),
  sgkIsveren: ayarSayisi(m, 'sgkIsverenOran'), issIsveren: ayarSayisi(m, 'issizlikIsverenOran'),
}));

// Çıkış tarihindeki ücret, yan haklar, kalan izin ve o ayın kümülatif matrahıyla tazminat (app.js empSeverance).
function kisiTazminati(m: IkMotoru, p: Personel, cikis: string): TazminatSonucu | null {
  const ay = bordroHesapla(m, p, cikis.slice(0, 7));
  return donemde(m, cikis, () => tazminat(m, {
    giris: p.iseGiris ?? '', cikis, brut: ucretTarihte(m, p, cikis),
    yanHak: sayi(p.yanHakTutar) + yanHakAylik(m, p) + primKidemAylik(m, p),
    kod: p.cikisKodu ?? '', izinGun: Math.max(0, kalanIzin(m, p, cikis)), cum: ay ? ay.cumOnce + ay.matrah : '',
  }));
}
const tazminatAyari = (m: IkMotoru, cikis: string) => (k: string): number => donemde(m, cikis, () => ayarSayisi(m, k));

function Motorsuz() {
  return <DurumKutusu durum="yukleniyor" mesaj={MOTOR_HAZIRLANIYOR} />;
}

export function BordroTahmini({ o, personel, ay }: { o: IkEkranOzellikleri; personel: Personel; ay: string }) {
  const m = o.motor;
  if (!m) return null;
  const r = bordroHesapla(m, personel, ay);
  if (!r) return null;
  return (
    <Bolum baslik={`${ayMetni(ay)} bordro tahmini`}>
      <HesapDokumu a={r} oranlar={oranlarAy(m, ay)} />
      <Not>Kümülatif vergi matrahı yılbaşından itibaren hesaplanır. Ayrıntılar için Bordro sayfasını kullanın.</Not>
    </Bolum>
  );
}

export function TazminatHesabi({ o, personel, cikis }: { o: IkEkranOzellikleri; personel: Personel; cikis: string }) {
  const m = o.motor;
  if (!m) return <Motorsuz />;
  return <TazminatAdimlari a={kisiTazminati(m, personel, cikis)} p={tazminatAyari(m, cikis)} />;
}

/* ---------------- yazdırılan belgeler ---------------- */

function BelgeUstu({ o, ek }: { o: IkEkranOzellikleri; ek?: string }) {
  const sirket = typeof o.depo.ayarlar.sirket === 'string' && o.depo.ayarlar.sirket ? o.depo.ayarlar.sirket : 'Şirket';
  return (
    <div className="tc-ikb-belge-ust">
      <span><b>{sirket}</b>{ek ? ` · ${ek}` : ''}</span>
      <span>{`Düzenleme tarihi: ${tarih(tesisGunu(Date.now()))}`}</span>
    </div>
  );
}
function Kunye({ satirlar }: { satirlar: readonly (readonly [string, ReactNode])[] }) {
  return (
    <table className="tc-ikb-kunye">
      <tbody>{satirlar.map(([k, v]) => <tr key={k}><th scope="row">{k}</th><td>{v ?? '—'}</td></tr>)}</tbody>
    </table>
  );
}
function Imzalar({ adlar }: { adlar: readonly string[] }) {
  return (
    <div className="tc-ikb-imza" data-adet={adlar.length}>
      {adlar.map((a) => <div key={a}><span>{a}</span><small>Ad soyad, tarih, imza</small></div>)}
    </div>
  );
}

export function TazminatDokumu({ o, personel: p, cikis, kapat }: { o: IkEkranOzellikleri; personel: Personel; cikis: string; kapat: () => void }) {
  const m = o.motor;
  return (
    <BelgeYazdir baslik="Tazminat hesap dökümü" kapat={kapat}>
      <BelgeUstu o={o} ek={adSoyad(p)} />
      <h1>Kıdem, ihbar ve izin ücreti hesap dökümü</h1>
      <Kunye satirlar={[['Ad soyad', adSoyad(p)], ['T.C. kimlik no', p.tckn || '—'], ['Pozisyon', p.pozisyon || '—'], ['Çıkış nedeni', p.cikisKodu || 'Belirtilmedi']]} />
      {m ? <TazminatAdimlari a={kisiTazminati(m, p, cikis)} p={tazminatAyari(m, cikis)} /> : <Motorsuz />}
      <Imzalar adlar={['Hazırlayan', 'Kontrol eden', 'Çalışan']} />
    </BelgeYazdir>
  );
}

// Ücret hesap pusulası (İş Kanunu md. 37).
function PusulaTablosu({ a }: { a: AySonucu }) {
  const satirlar: [string, string, boolean?][] = [
    ['Aylık brüt ücret', para(a.aylik)],
    ...(a.gun < 30 ? [[`Çalışılan gün üzerinden brüt ücret (${a.gun}/30)`, para(a.brut)] as [string, string]] : []),
    ...(a.ek ? [['Ek ödeme (prim, ikramiye)', para(a.ek)] as [string, string]] : []),
    ...(a.mesaiUcret ? [['Fazla mesai ve tatil ücreti', para(a.mesaiUcret)] as [string, string]] : []),
    ...(a.yemek?.tutar ? [[`Yemek yardımı (${a.yemek.yontem})`, para(a.yemek.tutar)] as [string, string]] : []),
    ...(a.yol?.tutar ? [[`Yol yardımı (${a.yol.yontem})`, para(a.yol.tutar)] as [string, string]] : []),
    ['Toplam brüt', para(a.toplam), true],
    ['SGK işçi payı', eksi(a.sgk)],
    ['İşsizlik sigortası işçi payı', eksi(a.iss)],
    ...(a.ind ? [['Engellilik indirimi (matrahtan)', para(a.ind)] as [string, string]] : []),
    ['Gelir vergisi matrahı', para(a.matrah)],
    ['Gelir vergisi (istisna sonrası)', eksi(a.gv)],
    ['Damga vergisi (istisna sonrası)', eksi(a.dv)],
    ...(a.bes ? [['Bireysel emeklilik (otomatik katılım)', eksi(a.bes)] as [string, string]] : []),
    ...(a.kesinti ? [['Diğer kesintiler', eksi(a.kesinti)] as [string, string]] : []),
    ['Net (yan haklar dahil)', para(a.net), true],
    ...(a.ayni ? [['Kart / ayni ödenen yan haklar', eksi(a.ayni)] as [string, string], ['Bankaya ödenecek', para(a.banka), true] as [string, string, boolean]] : []),
  ];
  return (
    <table className="tc-ikb-pusula">
      <tbody>
        {satirlar.map(([l, v, top], i) => (
          <tr key={i} data-top={top ? '' : undefined}><td>{l}</td><td data-sag="">{v}</td></tr>
        ))}
      </tbody>
    </table>
  );
}

export function BordroPusulasi({ o, personel: p, ay, kapat }: { o: IkEkranOzellikleri; personel: Personel; ay: string; kapat: () => void }) {
  const m = o.motor;
  const r = m ? bordroHesapla(m, p, ay) : null;
  const departman = p.departmanId ? o.depo.tur('dept').find((d) => d.id === p.departmanId)?.ad : undefined;
  return (
    <BelgeYazdir baslik="Bordro pusulası" kapat={kapat}>
      <BelgeUstu o={o} ek={ayMetni(ay)} />
      <h1>Ücret bordrosu (pusula)</h1>
      {!m ? <Motorsuz /> : !r ? <p>Bu dönem için bordro hesaplanamadı.</p> : (
        <>
          <Kunye satirlar={[
            ['Ad soyad', adSoyad(p)], ['Sicil no / SGK no', `${p.sicilNo || '—'} / ${p.sgkNo || '—'}`],
            ['Departman / pozisyon', [departman, p.pozisyon].filter((x) => x && x !== '—').join(' / ')], ['Dönem', ayMetni(ay)], ['Prim günü', `${r.gun} gün`],
          ]} />
          <PusulaTablosu a={r} />
          <Imzalar adlar={['Bordroyu düzenleyen', 'Çalışan']} />
          <p className="tc-ikb-belge-dip">İşveren, ücret ödemesinde çalışana ücret hesap pusulası vermekle yükümlüdür (İş Kanunu md. 37). Tutarlar Ayarlar’daki parametrelerle hesaplanmıştır.</p>
        </>
      )}
    </BelgeYazdir>
  );
}
