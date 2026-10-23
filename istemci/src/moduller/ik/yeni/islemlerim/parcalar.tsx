import { useCallback, type ReactNode } from 'react';
import { eskiSurumMu } from '#paylasilan/hata.ts';
import { DurumKutusu, SayfaBasligi, useBildirim } from '../../../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../../../ortak/tasarim/simgeler.ts';
import { ApiHatasi, hataIletisi } from '../../../../ortak/veri/api.ts';
import { useYetki } from '../../../../ortak/veri/yetki.ts';
import { adSoyad, YOK } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import type { IkMotoru, IzinBakiyesi } from '../motor.ts';
import { KisiHucresi } from '../ortak/KisiHucresi.tsx';
import type { Departman, Personel } from '../tipler.ts';
import { gunMetni, sureMetni } from './kurallar.ts';
import './islemlerim.css';

export function bugun(): string {
  return gunMetni(new Date());
}

/* Motorun bu ekranda kullanılan yüzü (motor.ts): bakiye tipli, iş günü işlevleri henüz `unknown` döner (M0b). */
export function izinBakiyesi(motor: IkMotoru, p: Personel): IzinBakiyesi {
  return motor.leaveBalance(p, new Date());
}

export function isGunuMu(motor: IkMotoru, d: Date): boolean {
  return motor.isWorkday(d) === true;
}

export function isGunuSay(motor: IkMotoru, a: Date, b: Date): number {
  const n = motor.countDays(a, b, true);
  return typeof n === 'number' ? n : 0;
}

// Ekip maddeleri (Onaylar, Ekip, İzin takvimi) ve Benim sayfam'daki "Ekibim" kartı aynı kurala bağlıdır (214 a): gerçek kişide
// `ik.izin-onay`, önizlemede önizlenen rol. Kabuktaki menü süzgeciyle aynıdır (IkYeni.tsx).
export function useEkipAcik(o: Pick<IkEkranOzellikleri, 'onizleme'>): boolean {
  const genel = useYetki();
  return o.onizleme ? o.onizleme.rol === 'yonetici' : genel.var('ik.izin-onay');
}

// Yazma komutunu çalıştırır: başarıda ileti, hatada sunucunun iletisi. Eski sürüm iletisini komut zaten verir (veri.ts).
export type Yazici = (is: () => Promise<unknown>, tamam: string, hata: string) => Promise<boolean>;

export function useYaz(): Yazici {
  const { bildir } = useBildirim();
  return useCallback<Yazici>(async (is, tamam, hata) => {
    try {
      await is();
    } catch (h) {
      if (!(h instanceof ApiHatasi && eskiSurumMu(h.govde))) bildir('hata', hataIletisi(h, hata));
      return false;
    }
    bildir('tamam', tamam);
    return true;
  }, [bildir]);
}

// Hesabı bir personel kaydına bağlı olmayan kişi (onizlemede seçilen kişi her zaman bağlıdır).
export function BagliDegil({ baslik, simge }: { baslik: string; simge: SimgeAdi }) {
  return (
    <>
      <SayfaBasligi baslik={baslik} simge={simge} />
      <DurumKutusu durum="bos" mesaj="Hesabınız bir personel kaydıyla eşleşmedi">
        <p>İnsan kaynakları biriminden kullanıcı hesabınızın personel kaydınıza bağlanmasını isteyin.</p>
      </DurumKutusu>
    </>
  );
}

// Kişinin başlığı: ad, pozisyon, departman, yönetici ve kıdem (app.js meHead).
export function KisiBasligi({ personel, baslik, personeller, departmanlar }: {
  personel: Personel; baslik: string; personeller: readonly Personel[]; departmanlar: readonly Departman[];
}) {
  const dep = departmanlar.find((d) => d.id === personel.departmanId)?.ad;
  const yonetici = personel.yoneticiId ? personeller.find((p) => p.id === personel.yoneticiId) : undefined;
  const kidem = sureMetni(personel.iseGiris, bugun());
  const alt = [personel.pozisyon, dep, yonetici ? `Yönetici: ${adSoyad(yonetici)}` : null, kidem ? `${kidem} kıdem` : null].filter(Boolean).join(' · ');
  return (
    <header className="tc-ikm-kisi">
      <KisiHucresi personel={personel} />
      <div className="tc-ikm-kisi-govde">
        <h2 className="tc-ikm-kisi-ad">{baslik}</h2>
        {alt && <p className="tc-ikm-soluk">{alt}</p>}
      </div>
    </header>
  );
}

// Kartın büyük sayısı ve yanındaki birim ("12 gün kaldı").
export function BuyukSayi({ deger, birim, ton }: { deger: string; birim: string; ton?: 'hata' | 'uyari' }) {
  return (
    <p className="tc-ikm-buyuk">
      <b className="mono" data-ton={ton}>{deger}</b>
      <span>{birim}</span>
    </p>
  );
}

export function BilgiListesi({ satirlar }: { satirlar: readonly (readonly [string, ReactNode] | null)[] }) {
  return (
    <dl className="tc-ikm-dl">
      {satirlar.filter((s): s is readonly [string, ReactNode] => s !== null).map(([ad, deger]) => (
        <div key={ad} className="tc-ikm-dl-satir">
          <dt>{ad}</dt>
          <dd>{deger === '' || deger === null || deger === undefined ? YOK : deger}</dd>
        </div>
      ))}
    </dl>
  );
}

export function KartAlti({ children }: { children: ReactNode }) {
  return <div className="tc-ikm-kart-alti">{children}</div>;
}

export function Not({ children }: { children: ReactNode }) {
  return <p className="tc-ikm-not">{children}</p>;
}

export function Bos({ children }: { children: ReactNode }) {
  return <p className="tc-ikm-soluk">{children}</p>;
}

// Kısa liste satırı: sol başlık ve alt metin, sağda rozet ya da tarih.
export function KisaListe({ satirlar }: { satirlar: readonly { anahtar: string; baslik: ReactNode; alt?: ReactNode; sag?: ReactNode }[] }) {
  return (
    <ul className="tc-ikm-liste">
      {satirlar.map((s) => (
        <li key={s.anahtar}>
          <span className="tc-ikm-liste-sol">
            <span className="tc-ikm-liste-baslik">{s.baslik}</span>
            {s.alt && <small className="tc-ikm-soluk">{s.alt}</small>}
          </span>
          {s.sag}
        </li>
      ))}
    </ul>
  );
}
