import { tarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { BelgeYazdir, ImzaAlanlari } from '../ortak/BelgeYazdir.tsx';
import type { Personel } from '../tipler.ts';
import { adSoyadMetni, bugun, sureMetni, uzunTarih } from './kurallar.ts';

// Çalışma belgesi (İş Kanunu md. 28); P6 "Benim sayfam" da bu bileşeni açar.
export function CalismaBelgesi({ o, personel: p, kapat }: { o: IkEkranOzellikleri; personel: Personel; kapat: () => void }) {
  const { depo } = o;
  const gun = bugun();
  const departman = p.departmanId ? depo.tur('dept').find((d) => d.id === p.departmanId)?.ad : undefined;
  const bitis = p.cikisTarihi ? uzunTarih(p.cikisTarihi) : null;
  const sirket = typeof depo.ayarlar.sirket === 'string' && depo.ayarlar.sirket ? depo.ayarlar.sirket : 'Şirket';
  return (
    <BelgeYazdir baslik="Çalışma belgesi" kapat={kapat}>
      <div className="tc-ikp-belge-ust"><b>{sirket}</b><span>{`Düzenleme tarihi: ${tarih(gun)}`}</span></div>
      <h1>Çalışma belgesi</h1>
      <p>
        {`${adSoyadMetni(p)} (T.C. kimlik no: ${p.tckn || '……………'}), ${uzunTarih(p.iseGiris)} `}
        {bitis ? `– ${bitis} tarihleri arasında` : 'tarihinden bu yana'}
        {` işyerimizde ${departman ? `${departman} departmanında ` : ''}${p.pozisyon || '……………'} olarak ${bitis ? 'çalışmıştır' : 'çalışmaktadır'}.`}
      </p>
      <p>{`Toplam hizmet süresi: ${p.iseGiris ? sureMetni(p.iseGiris, p.cikisTarihi || gun) : '—'}.`}</p>
      <p>Bu belge, ilgilinin talebi üzerine düzenlenmiştir.</p>
      <ImzaAlanlari sol="" sag="İşveren / işveren vekili (ad soyad, unvan, kaşe, imza)" />
      <p className="tc-ikp-belge-dip">
        4857 sayılı İş Kanunu md. 28 uyarınca, işten ayrılan işçiye işin türü ve süresini gösteren bir belge verilir. İşçinin isteği hâlinde iş görmesi ve davranışları da belgeye yazılabilir.
      </p>
    </BelgeYazdir>
  );
}
