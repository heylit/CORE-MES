import { CokSatir, DurumKutusu, Girdi, Rozet, Secim, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { FormPenceresi } from '../../../../ortak/arayuz/FormPenceresi.tsx';
import { useForm } from '../../../../ortak/veri/form.ts';
import { tarih } from '../bicim.ts';
import type { IkMotoru } from '../motor.ts';
import { MOTOR_HAZIRLANIYOR, ikSabitleri } from '../motor.ts';
import type { Izin, Personel } from '../tipler.ts';
import { useIkKomutu, useIzinGunu, yeniKimlik } from '../veri.ts';
import {
  gunEkle, gunMetni, IZIN_BEKLIYOR, metindenGun, talepDenetimi, takvimGunu, YILLIK_IZIN, sayiMetni,
} from './kurallar.ts';
import { bugun, isGunuMu, isGunuSay, izinBakiyesi } from './parcalar.tsx';

interface Deger { tur: string; baslangic: string; bitis: string; aciklama: string }

function sonrakiIsGunu(motor: IkMotoru, gun: string): string | null {
  let d = metindenGun(gun);
  if (!d) return null;
  for (let i = 0; i < 20; i++) {
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    if (isGunuMu(motor, d)) return gunMetni(d);
  }
  return gunMetni(d);
}

// Çalışanın izin talebi (app.js myLeaveModal; gün önerisi sunucudan, Soru 74). Kayıt "Beklemede" ve "Çalışan" kaynağıyla gider;
// karar yöneticinin ya da İK'nındır.
export function IzinTalebi({ acik, kapat, personel, kendiIzinleri, motor }: {
  acik: boolean; kapat: () => void; personel: Personel; kendiIzinleri: readonly Izin[]; motor: IkMotoru | null;
}) {
  const komut = useIkKomutu();
  const { bildir } = useBildirim();
  const sabit = ikSabitleri();
  const yarin = gunEkle(bugun(), 1);
  const form = useForm<Deger>({
    ilk: { tur: sabit?.LEAVE_TYPES[0] ?? YILLIK_IZIN, baslangic: yarin, bitis: yarin, aciklama: '' },
    hataIletisi: 'İzin talebi gönderilemedi.',
    // Bugünkü ekran bu durumlarda talebi göndermez; ileti alanın altında kalır.
    dogrula: (): Record<string, string> => {
      if (denetim.ters) return { bitis: 'Bitiş tarihi başlangıçtan önce olamaz.' };
      if (denetim.cakisan.length) return { baslangic: 'Seçtiğiniz tarihlerde başka bir izniniz var.' };
      if (gun === null) return { bitis: 'Süre hesaplanıyor; biraz sonra yeniden deneyin.' };
      if (!gun) return { bitis: 'Seçtiğiniz aralıkta iş günü yok.' };
      return {};
    },
    kaydet: async (d) => {
      if (gun === null) return;
      const kayit: Izin = {
        id: yeniKimlik('leave'), kind: 'leave', empId: personel.id, tur: d.tur, baslangic: d.baslangic, bitis: d.bitis, gun,
        durum: IZIN_BEKLIYOR, talepTarihi: bugun(), aciklama: d.aciklama.trim(), kaynak: 'Çalışan',
      };
      await komut.kaydet(kayit);
    },
    basarili: () => { bildir('tamam', 'İzin talebiniz gönderildi; onaylanınca size bildirilecek.'); kapat(); },
  });
  const { tur, baslangic, bitis } = form.degerler;
  const isGunuIzni = !!sabit?.WORKDAY_LEAVES.includes(tur);
  const denetim = talepDenetimi(kendiIzinleri, baslangic, bitis);
  const sunucu = useIzinGunu(acik && isGunuIzni && !denetim.ters ? personel.id : null, baslangic, bitis);
  const yerel = (() => {
    const a = metindenGun(baslangic);
    const b = metindenGun(bitis);
    if (denetim.ters || !a || !b) return null;
    if (!isGunuIzni) return takvimGunu(baslangic, bitis);
    return motor ? isGunuSay(motor, a, b) : null;
  })();
  const gun = denetim.ters ? null : isGunuIzni ? (sunucu.data?.isGunu ?? yerel) : yerel;
  const donus = motor && !denetim.ters ? sonrakiIsGunu(motor, bitis) : null;
  const bakiye = motor && tur === YILLIK_IZIN ? izinBakiyesi(motor, personel) : null;

  return (
    <FormPenceresi acik={acik} kapat={kapat} baslik="İzin talebi" form={form} kaydetMetni="Talebi gönder">
      {!sabit ? <DurumKutusu durum="yukleniyor" mesaj={MOTOR_HAZIRLANIYOR} /> : (
        <>
          <Secim etiket="İzin türü" secenekler={sabit.LEAVE_TYPES.map((t) => ({ deger: t, baslik: t }))} {...form.alan('tur')} />
          <div className="tc-ikm-iki">
            <Girdi etiket="Başlangıç" type="date" {...form.alan('baslangic')} />
            <Girdi etiket="Bitiş" type="date" {...form.alan('bitis')} />
          </div>
          <CokSatir etiket="Açıklama" placeholder="İsteğe bağlı" rows={2} {...form.alan('aciklama')} />
          <div className="tc-ikm-onizleme" aria-live="polite">
            {denetim.ters ? <Rozet ton="hata">Bitiş tarihi başlangıçtan önce olamaz.</Rozet> : (
              <dl className="tc-ikm-ozet">
                <div><dt>Süre</dt><dd className="mono">{gun === null ? '…' : `${gun} ${isGunuIzni ? 'iş günü' : 'gün'}`}</dd></div>
                {donus && <div><dt>İşe dönüş</dt><dd className="mono">{tarih(donus)}</dd></div>}
                {bakiye && gun !== null && (
                  <div><dt>Kalan izin sonrası</dt><dd className="mono" data-ton={bakiye.kalan - gun < 0 ? 'hata' : undefined}>{sayiMetni(bakiye.kalan - gun)} gün</dd></div>
                )}
              </dl>
            )}
            {denetim.cakisan.length > 0 && (
              <p className="tc-ikm-uyari" role="status">
                <Simge ad="lock" boyut="k" />
                <span>Bu tarihlerde başka bir izin kaydınız var ({denetim.cakisan[0]?.tur}, {tarih(denetim.cakisan[0]?.baslangic)}).</span>
              </p>
            )}
          </div>
        </>
      )}
    </FormPenceresi>
  );
}
