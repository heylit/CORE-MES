import {
  DurumKutusu, Dugme, Kart, SayfaBasligi, Simge,
} from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import { adSoyad, tarih } from '../bicim.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { KisiHucresi } from '../ortak/KisiHucresi.tsx';
import { IzinCipi } from '../ortak/DurumCipi.tsx';
import { ekipKimlikleri } from '../rol.ts';
import type { Izin } from '../tipler.ts';
import { useIkKomutu } from '../veri.ts';
import {
  izinGunuMetni,
  bekleyenTalepler, cakisanEkipIzinleri, calisiyorMu, IZIN_BEKLIYOR, IZIN_ONAYLI, IZIN_RED, sayi, sonKararlar, YILLIK_IZIN, sayiMetni,
} from './kurallar.ts';
import {
  BagliDegil, bugun, izinBakiyesi, KisaListe, useYaz,
} from './parcalar.tsx';

// Onaylar (app.js viewApprovals): ekibin bekleyen izin talepleri ve son kararlar. Karar ucu `ik.izin-onay` ister (214 a).
export function Onaylar(o: IkEkranOzellikleri) {
  const komut = useIkKomutu();
  const yaz = useYaz();
  const me = o.ben;
  const t = bugun();
  const personeller = o.depo.tur('emp');
  const izinler = o.depo.tur('leave');
  const ekip = me ? ekipKimlikleri(personeller.filter((p) => calisiyorMu(p, t)), o.depo.tur('dept'), me.id) : new Set<string>();
  const bekleyen = bekleyenTalepler(izinler, ekip);
  const ad = (id: string | undefined) => adSoyad(personeller.find((p) => p.id === id));
  useSayfaKomutlari('ik-onay', me ? bekleyen.map((l) => ({
    anahtar: l.id, baslik: `${ad(l.empId)}: ${l.tur}`, simge: 'check' as const, aciklama: `${tarih(l.baslangic)} – ${tarih(l.bitis)}`,
    sozcukler: ['onay', 'izin', ad(l.empId)], calistir: () => { document.getElementById(`tc-ikm-talep-${l.id}`)?.focus(); },
  })) : null);
  if (!me) return <BagliDegil baslik="Onaylar" simge="check" />;

  const karar = (l: Izin, durum: typeof IZIN_ONAYLI | typeof IZIN_RED) => yaz(
    () => komut.kaydet({ ...l, durum, karar: t, onaylayanId: me.id }),
    durum === IZIN_ONAYLI ? `${ad(l.empId)} için izin onaylandı.` : 'İzin talebi reddedildi.',
    'Karar kaydedilemedi.',
  );
  const kararlar = sonKararlar(izinler, ekip);

  return (
    <>
      <SayfaBasligi
        baslik="Onaylar" simge="check"
        alt={`Ekibinizden ${bekleyen.length ? `${bekleyen.length} izin talebi onayınızı bekliyor.` : 'bekleyen talep yok.'}`}
      />
      {bekleyen.length === 0 ? (
        <DurumKutusu durum="bos" mesaj="Bekleyen talep yok">
          <p>Ekibinizden yeni izin talepleri geldiğinde burada görünür.</p>
        </DurumKutusu>
      ) : (
        <ul className="tc-ikm-talepler">
          {bekleyen.map((l) => {
            const kisi = personeller.find((p) => p.id === l.empId) ?? null;
            // Motorun kalanı yalnız onaylı izinleri düşer; onaylanırsa kalan için bekleyen talebin günü de düşülür (413/3 b).
            const bakiye = kisi && o.motor && l.tur === YILLIK_IZIN ? izinBakiyesi(o.motor, kisi) : null;
            const cakisan = cakisanEkipIzinleri(l, izinler, ekip);
            const alt = [
              bakiye ? `Onaylanırsa kalan yıllık izin ${sayiMetni(bakiye.kalan - (l.durum === IZIN_BEKLIYOR ? sayi(l.gun) : 0))} gün.` : null,
              l.aciklama ? `Açıklama: ${l.aciklama}.` : null,
              l.talepTarihi ? `Talep ${tarih(l.talepTarihi)}.` : null,
            ].filter(Boolean).join(' ');
            return (
              <li key={l.id} id={`tc-ikm-talep-${l.id}`} tabIndex={-1} className="tc-ikm-talep" data-gecikti={(l.baslangic ?? '') < t ? '' : undefined}>
                <div className="tc-ikm-talep-govde">
                  <KisiHucresi personel={kisi} alt={kisi?.pozisyon} />
                  <b>{l.tur}: {tarih(l.baslangic)} – {tarih(l.bitis)}, {izinGunuMetni(l.gun)}</b>
                  {alt && <small className="tc-ikm-soluk">{alt}</small>}
                  {cakisan.length > 0 && (
                    <small className="tc-ikm-uyari">
                      <Simge ad="alert" boyut="k" />
                      Aynı tarihlerde ekipten {cakisan.length} kişi izinde:{' '}
                      {cakisan.map((x) => `${ad(x.empId)}${x.durum === IZIN_BEKLIYOR ? ' (bekliyor)' : ''}`).join(', ')}
                    </small>
                  )}
                </div>
                {o.yetki.izinOnay && (
                  <div className="tc-ikm-talep-eylem">
                    <Dugme tur="birincil" disabled={komut.calisiyor} onClick={() => { void karar(l, IZIN_ONAYLI); }}>Onayla</Dugme>
                    <Dugme disabled={komut.calisiyor} onClick={() => { void karar(l, IZIN_RED); }}>Reddet</Dugme>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {kararlar.length > 0 && (
        <Kart baslik="Son kararlarınız">
          <KisaListe satirlar={kararlar.map((l) => ({
            anahtar: l.id, baslik: `${ad(l.empId)}: ${l.tur}, ${tarih(l.baslangic)} – ${tarih(l.bitis)}`,
            sag: <span className="tc-ikm-sag"><IzinCipi durum={l.durum} /><small className="tc-ikm-soluk">{tarih(l.karar)}</small></span>,
          }))} />
        </Kart>
      )}
    </>
  );
}
