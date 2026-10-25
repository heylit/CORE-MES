import { adSoyad, ayAdi, para, tarih } from '../bicim.ts';
import { BelgeYazdir, ImzaAlanlari } from '../ortak/BelgeYazdir.tsx';
import type { Bordro, Departman, Personel } from '../tipler.ts';
import { bordroAlani, sureMetni } from './kurallar.ts';
import { bugun } from './parcalar.tsx';

const NOKTALI = '……………';

function depPoz(p: Personel, departmanlar: readonly Departman[]): string {
  return [departmanlar.find((d) => d.id === p.departmanId)?.ad, p.pozisyon].filter(Boolean).join(' / ') || '—';
}

// Çalışma belgesi (İş Kanunu md. 28; app.js workCertDoc). Metin ve imza alanı bugünküyle aynıdır.
export function CalismaBelgesi({ personel, departmanlar, kapat }: { personel: Personel; departmanlar: readonly Departman[]; kapat: () => void }) {
  const cikis = personel.cikisTarihi ? tarih(personel.cikisTarihi) : null;
  const dep = departmanlar.find((d) => d.id === personel.departmanId)?.ad;
  const sure = sureMetni(personel.iseGiris, personel.cikisTarihi ?? bugun());
  return (
    <BelgeYazdir baslik="Çalışma belgesi" kapat={kapat}>
      <p>
        {adSoyad(personel)} (T.C. kimlik no: {personel.tckn || NOKTALI}), {tarih(personel.iseGiris)}{' '}
        {cikis ? `– ${cikis} tarihleri arasında` : 'tarihinden bu yana'} işyerimizde {dep ? `${dep} departmanında ` : ''}
        {personel.pozisyon || NOKTALI} olarak {cikis ? 'çalışmıştır' : 'çalışmaktadır'}.
      </p>
      <p>Toplam hizmet süresi: {sure ?? '—'}.</p>
      <p>Bu belge, ilgilinin talebi üzerine düzenlenmiştir.</p>
      <div className="tc-ikm-imzalar">
        <div />
        <div>İşveren / işveren vekili<br /><small>Ad soyad, unvan, kaşe, imza</small></div>
      </div>
      <p className="tc-ikm-belge-dip">
        4857 sayılı İş Kanunu md. 28 uyarınca, işten ayrılan işçiye işin türü ve süresini gösteren bir belge verilir. İşçinin isteği
        hâlinde iş görmesi ve davranışları da belgeye yazılabilir.
      </p>
    </BelgeYazdir>
  );
}

// Ücret hesap pusulası (İş Kanunu md. 37; app.js slipDoc/slipTable). Yalnız kesinleşmiş bordrodan: tutarlar sunucunun
// hesabıdır (snap), ekran yeniden hesaplamaz.
export function BordroPusulasi({ personel, bordro, departmanlar, kapat }: {
  personel: Personel; bordro: Bordro; departmanlar: readonly Departman[]; kapat: () => void;
}) {
  const r = (a: string) => bordroAlani(bordro, a);
  const snap = (bordro.snap ?? {}) as Record<string, unknown>;
  const yan = (ad: 'yemek' | 'yol') => (snap[ad] && typeof snap[ad] === 'object' ? snap[ad] as { tutar?: number; yontem?: string } : null);
  const yemek = yan('yemek');
  const yol = yan('yol');
  const gun = r('gun');
  const satirlar: [string, string, boolean?][] = [
    ['Aylık brüt ücret', para(r('aylik'))],
    ...(gun < 30 ? [[`Çalışılan gün üzerinden brüt ücret (${gun}/30)`, para(r('brut'))] as [string, string]] : []),
    ...(r('ek') ? [['Ek ödeme (prim, ikramiye)', para(r('ek'))] as [string, string]] : []),
    ...(r('mesaiUcret') ? [['Fazla mesai ve tatil ücreti', para(r('mesaiUcret'))] as [string, string]] : []),
    ...(yemek?.tutar ? [[`Yemek yardımı (${yemek.yontem ?? ''})`, para(yemek.tutar)] as [string, string]] : []),
    ...(yol?.tutar ? [[`Yol yardımı (${yol.yontem ?? ''})`, para(yol.tutar)] as [string, string]] : []),
    ['Toplam brüt', para(r('toplam')), true],
    ['SGK işçi payı', `−${para(r('sgk'))}`],
    ['İşsizlik sigortası işçi payı', `−${para(r('iss'))}`],
    ...(r('ind') ? [['Engellilik indirimi (matrahtan)', para(r('ind'))] as [string, string]] : []),
    ['Gelir vergisi matrahı', para(r('matrah'))],
    ['Gelir vergisi (istisna sonrası)', `−${para(r('gv'))}`],
    ['Damga vergisi (istisna sonrası)', `−${para(r('dv'))}`],
    ...(r('bes') ? [['Bireysel emeklilik (otomatik katılım)', `−${para(r('bes'))}`] as [string, string]] : []),
    ...(r('kesinti') ? [['Diğer kesintiler', `−${para(r('kesinti'))}`] as [string, string]] : []),
    ['Net (yan haklar dahil)', para(r('net')), true],
    ...(r('ayni') ? [
      ['Kart / ayni ödenen yan haklar', `−${para(r('ayni'))}`] as [string, string],
      ['Bankaya ödenecek', para(r('banka')), true] as [string, string, boolean],
    ] : []),
  ];
  const donem = bordro.donem ?? '';
  return (
    <BelgeYazdir baslik="Ücret bordrosu (pusula)" kapat={kapat}>
      <dl className="tc-ikm-dl">
        {([
          ['Ad soyad', adSoyad(personel)], ['Sicil no / SGK no', `${personel.sicilNo || '—'} / ${personel.sgkNo || '—'}`],
          ['Departman / pozisyon', depPoz(personel, departmanlar)], ['Dönem', donem ? ayAdi(donem) : '—'], ['Prim günü', `${gun} gün`],
        ] as const).map(([a, d]) => <div key={a} className="tc-ikm-dl-satir"><dt>{a}</dt><dd>{d}</dd></div>)}
      </dl>
      <table className="tc-ikm-pusula">
        <tbody>
          {satirlar.map(([a, d, top]) => (
            <tr key={a} data-toplam={top ? '' : undefined}><td>{a}</td><td className="mono">{d}</td></tr>
          ))}
        </tbody>
      </table>
      <ImzaAlanlari sol="Bordroyu düzenleyen" sag="Çalışan" />
      <p className="tc-ikm-belge-dip">
        İşveren, ücret ödemesinde çalışana ücret hesap pusulası vermekle yükümlüdür (İş Kanunu md. 37). Tutarlar Ayarlar’daki
        parametrelerle hesaplanmıştır.
      </p>
    </BelgeYazdir>
  );
}
