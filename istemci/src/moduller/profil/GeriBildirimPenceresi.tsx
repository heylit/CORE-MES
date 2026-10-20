import { useState, type FormEvent } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { GeriBildirim, GeriBildirimGonderGovdesi, GeriBildirimKonusu, GeriBildirimTuru } from '#paylasilan/sozlesme/profil.ts';
import { CokSatir, Dugme, GrupluSecim, Pencere, Simge, type SecimDugmesi } from '../../ortak/arayuz/index.ts';
import type { SimgeAdi } from '../../ortak/tasarim/simgeler.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { tekrarKorumaliGonder, yeniIstekKimligi } from '../../ortak/veri/istek-kimligi.ts';
import { anahtarlar } from './anahtarlar.ts';
import { KONU_ADI, KONULAR as KONU_LISTESI, METIN_EN_AZ, METIN_EN_COK, TUR_ADI, TURLER as TUR_LISTESI } from './gorunum.ts';

const KONU_SIMGESI: Record<GeriBildirimKonusu, SimgeAdi> = { sirket: 'home', uygulama: 'cpu' };
const TUR_SIMGESI: Record<GeriBildirimTuru, SimgeAdi> = { sikayet: 'alert', istek: 'flag', oneri: 'bolt' };
const KONU_ALT: Record<GeriBildirimKonusu, string> = { sirket: 'İş yeri, düzen, imkânlar', uygulama: 'Bu sistem, ekranlar, hatalar' };
const KONULAR: readonly SecimDugmesi<GeriBildirimKonusu>[] = KONU_LISTESI.map((k) => ({ deger: k, baslik: KONU_ADI[k], alt: KONU_ALT[k], simge: KONU_SIMGESI[k] }));
const TURLER: readonly SecimDugmesi<GeriBildirimTuru>[] = TUR_LISTESI.map((t) => ({ deger: t, baslik: TUR_ADI[t], simge: TUR_SIMGESI[t] }));

// Şikayet, istek ve öneri: konu (şirket ya da uygulama), tür ve serbest metin. Kişi ve zaman sunucudan gelir; gönderilen
// kayıt değişmez. Ağ hatasında aynı kimlikle yeniden gönderilir, ikinci kayıt açılmaz.
export function GeriBildirimPenceresi({ kapat }: { kapat: () => void }) {
  const istemci = useQueryClient();
  const [konu, konuYaz] = useState<GeriBildirimKonusu | null>(null);
  const [tur, turYaz] = useState<GeriBildirimTuru | null>(null);
  const [metin, metinYaz] = useState('');
  const [kimlik] = useState(yeniIstekKimligi);
  const [gidiyor, gidiyorYaz] = useState(false);
  const [hata, hataYaz] = useState<string | null>(null);
  const [gonderilen, gonderilenYaz] = useState<GeriBildirim | null>(null);

  const kisa = metin.trim().length < METIN_EN_AZ;
  const hazir = konu !== null && tur !== null && !kisa;

  const gonder = async (o: FormEvent) => {
    o.preventDefault();
    if (!hazir || gidiyor) return;
    gidiyorYaz(true);
    hataYaz(null);
    try {
      const govde: GeriBildirimGonderGovdesi = { konu, tur, metin: metin.trim() };
      const sonuc = await tekrarKorumaliGonder((d) => api.post<GeriBildirim>('/profil/geri-bildirim-gonder', govde, d), { istekKimligi: kimlik });
      gonderilenYaz(sonuc);
      void istemci.invalidateQueries({ queryKey: anahtarlar.profil });
    } catch (e) {
      hataYaz(hataIletisi(e, 'Gönderilemedi. Bağlantıyı denetleyip yeniden deneyin.'));
    } finally {
      gidiyorYaz(false);
    }
  };

  if (gonderilen !== null) {
    return (
      <Pencere acik kapat={kapat} baslik="Teşekkürler" alt={<Dugme tur="birincil" simge="check" onClick={kapat}>Tamam</Dugme>}>
        <div className="tc-profil-gonderildi" role="status">
          <span className="tc-profil-gonderildi-isaret" aria-hidden="true"><Simge ad="check" /></span>
          <p>{TUR_ADI[gonderilen.tur]} kaydınız alındı. Geçmişinizi profil sayfanızda görebilirsiniz.</p>
        </div>
      </Pencere>
    );
  }

  return (
    <Pencere
      acik
      kapat={kapat}
      baslik="Şikayet, istek ve öneri"
      alt={(
        <>
          <Dugme onClick={kapat}>Vazgeç</Dugme>
          <Dugme tur="birincil" simge="upload" type="submit" form="tc-profil-gb-formu" disabled={!hazir} yukleniyor={gidiyor}>Gönder</Dugme>
        </>
      )}
    >
      <form id="tc-profil-gb-formu" className="tc-profil-form" onSubmit={(o) => { void gonder(o); }} noValidate>
        <GrupluSecim etiket="Konu" gruplar={[{ anahtar: 'konu', baslik: 'Ne ile ilgili?', secenekler: KONULAR }]} secili={konu} sec={konuYaz} />
        <GrupluSecim etiket="Tür" gruplar={[{ anahtar: 'tur', baslik: 'Türü', secenekler: TURLER }]} secili={tur} sec={turYaz} />
        <CokSatir
          etiket="Yazınız"
          rows={5}
          maxLength={METIN_EN_COK}
          value={metin}
          onChange={(o) => metinYaz(o.target.value)}
          ipucu={`Adınızla kaydedilir. ${metin.length}/${METIN_EN_COK}`}
          required
        />
        {hata !== null && <p className="tc-profil-hata" role="alert">{hata}</p>}
      </form>
    </Pencere>
  );
}
