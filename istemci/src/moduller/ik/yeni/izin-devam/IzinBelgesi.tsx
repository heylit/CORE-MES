import { adSoyad, tarih, YOK } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { BelgeYazdir } from '../ortak/BelgeYazdir.tsx';
import type { Izin } from '../tipler.ts';
import { bakiye, listeler, sonrakiIsGunu } from './hesap.ts';
import { izindenSonraKalan, sayi, sayiYaz, YILLIK_IZIN } from './kurallar.ts';
import './izin-devam.css';

// Izin talep ve onay formu (yazdirilir); metin ve imza alanlari bugunku formla ayni.
export function IzinBelgesi({ o, izin, kapat }: { o: IkEkranOzellikleri; izin: Izin; kapat: () => void }) {
  const p = o.depo.tur('emp').find((x) => x.id === izin.empId);
  if (!p) return null;
  const yillik = izin.tur === YILLIK_IZIN;
  const b = o.motor ? bakiye(o.motor, p) : null;
  const departman = o.depo.tur('dept').find((x) => x.id === p.departmanId)?.ad;
  const vekil = o.depo.tur('emp').find((x) => x.id === izin.vekil);
  const isGunuIle = listeler()?.isGunuIzinleri.includes(izin.tur ?? '') ?? false;
  const satirlar: [string, string][] = [
    ['Ad soyad', adSoyad(p)], ['Sicil no', p.sicilNo || YOK], ['Departman / pozisyon', [departman, p.pozisyon].filter(Boolean).join(' / ') || YOK], ['İşe giriş tarihi', tarih(p.iseGiris)],
    ['İzin türü', izin.tur ?? YOK], ['İzin başlangıcı', tarih(izin.baslangic)], ['İzin bitişi', tarih(izin.bitis)],
    ['İşe başlama tarihi', o.motor && izin.bitis ? tarih(sonrakiIsGunu(o.motor, izin.bitis)) : YOK],
    ['İzin süresi', `${sayiYaz(sayi(izin.gun))} ${isGunuIle ? 'iş günü' : 'gün'}`], ['Yerine bakacak kişi', vekil ? adSoyad(vekil) : YOK], ['Açıklama', izin.aciklama || YOK],
    ...(yillik && b ? [['Toplam hak edilen yıllık izin', `${b.hak} gün`], ['Bu izinden sonra kalan', `${sayiYaz(izindenSonraKalan(izin, b.kalan))} gün`]] as [string, string][] : []),
    ['Durum', izin.durum ?? YOK],
  ];
  return (
    <BelgeYazdir baslik={yillik ? 'Yıllık izin talep ve onay formu' : 'İzin talep ve onay formu'} kapat={kapat}>
      <dl className="tc-iki-belge-dl">
        {satirlar.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
      <p>Yukarıda belirtilen tarihlerde izin kullanmak istiyorum. İzin dönüşü belirtilen tarihte işbaşı yapacağımı beyan ederim.</p>
      <div className="tc-iki-imzalar">
        {['Talep eden çalışan', 'Birim yöneticisi', 'İnsan kaynakları'].map((x) => <div key={x} className="tc-iki-imza">{x}</div>)}
      </div>
      {yillik && (
        <p className="tc-iki-belge-dip">
          Yıllık ücretli izin, 4857 sayılı İş Kanunu md. 53–60 ve Yıllık Ücretli İzin Yönetmeliği uyarınca kullandırılır. Bu form, işyerinde tutulması gereken izin kayıt belgesinin parçasıdır.
        </p>
      )}
    </BelgeYazdir>
  );
}
