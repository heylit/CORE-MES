import { useEffect, useState, type ReactNode } from 'react';
import { tesisGunu } from '#paylasilan/tesis-zamani.ts';
import { CokSatir, Dugme, DurumKutusu, Girdi, IsaretKutusu, Pencere, Rozet, Secim, Simge, useBildirim } from '../../../../ortak/arayuz/index.ts';
import { useSayfaKomutlari } from '../../../../ortak/rota/sayfa-komutlari.ts';
import type { IkEkranOzellikleri } from '../gorunumler.ts';
import { ikSabitleri, MOTOR_HAZIRLANIYOR, type IkMotoru } from '../motor.ts';
import { useIkKomutu } from '../veri.ts';
import { AYAR_BOLUMU_ICERIGI } from './ayar-bolumleri.tsx';
import { DonemPenceresi, DonemlerPenceresi } from './DonemPencereleri.tsx';
import { Hesaplayici, donemEtiketi } from './Hesaplamalar.tsx';
import { ayarDegeri, ayarKaydiKur, type DonemKaydi } from './kurallar.ts';
import { donemAyari, donemDurumu, donemler, donemTarihte, type Donem } from './motor-yuzu.ts';
import { Baslik, DugmeGrubu, useYaz } from './parcalar.tsx';

export type AyarBolumu = 'genel' | 'ucret' | 'yanhak' | 'tesvik' | 'calisma' | 'aktarim' | 'ilan' | 'listeler' | 'veri';
export const AYAR_BOLUMLERI: readonly (readonly [AyarBolumu, string])[] = [
  ['genel', 'Şirket ve takvim'], ['ucret', 'Ücret, vergi ve SGK'], ['yanhak', 'Yemek, yol ve prim'], ['tesvik', 'Teşvikler'], ['calisma', 'Çalışma, izin ve ihbar'],
  ['aktarim', 'Bordro aktarımı'], ['ilan', 'İlan ve kanallar'], ['listeler', 'Listeler'], ['veri', 'Veri yönetimi'],
];
// Bu bölümlerin değerleri seçili parametre dönemine aittir.
const DONEMLI: readonly AyarBolumu[] = ['ucret', 'yanhak', 'tesvik', 'calisma'];

export function Ayarlar(o: IkEkranOzellikleri) {
  if (!o.motor) {
    return (
      <section className="tc-ikb">
        <Baslik baslik="Ayarlar" simge="gear" />
        <DurumKutusu durum="yukleniyor" mesaj={MOTOR_HAZIRLANIYOR} />
      </section>
    );
  }
  return <AyarFormu o={o} m={o.motor} />;
}

// Bölüm içeriğinin alan yardımcıları (app.js viewSettings nf/ta/sf/tf).
export interface AyarAlanlari {
  m: IkMotoru;
  o: IkEkranOzellikleri;
  kapali: boolean;
  deger: (k: string) => unknown;
  yaz: (k: string, v: unknown) => void;
  sayi: (k: string, etiket: string, ipucu?: string, birim?: string) => ReactNode;
  metin: (k: string, etiket: string, ipucu?: string) => ReactNode;
  uzun: (k: string, etiket: string, ipucu?: string, satir?: number) => ReactNode;
  secim: (k: string, etiket: string, secenekler: readonly (readonly [string, string])[], ipucu?: string) => ReactNode;
  isaret: (k: string, baslik: string, etiket: string, ipucu?: string, varsayilanAcik?: boolean) => ReactNode;
  liste: (k: string) => Record<string, unknown>[];
  donemKilitli: boolean;
}

// Ayarlar (app.js viewSettings): dokuz bölüm; dönemli bölümlerde parametre dönemi şeridi. Değişiklikler bölümler arasında taslakta
// durur ve yalnız "Ayarları kaydet" ile sürüm denetimli yazılır (ik.ayar-yaz).
function AyarFormu({ o, m }: { o: IkEkranOzellikleri; m: IkMotoru }) {
  const komut = useIkKomutu();
  const yazici = useYaz();
  const { bildir } = useBildirim();
  const sabit = ikSabitleri();
  const bugun = tesisGunu(Date.now());
  const liste = donemler(m);
  const kimlikDonem = liste.find((d) => d.id === o.kimlik) ?? null;
  // Adresin kimlik parçası dönem ya da bölüm olabilir (Kılavuzdaki "İlgili sayfayı aç" bölümü seçer).
  const kimlikBolum = AYAR_BOLUMLERI.find(([k]) => k === o.kimlik)?.[0] ?? null;
  const [bolum, bolumYaz] = useState<AyarBolumu>(kimlikBolum ?? (kimlikDonem ? 'ucret' : 'genel'));
  useEffect(() => { if (kimlikBolum) bolumYaz(kimlikBolum); }, [kimlikBolum]);
  const [donemId, donemIdYaz] = useState(kimlikDonem?.id ?? donemTarihte(m, bugun).id);
  const [taslak, taslakYaz] = useState<Readonly<Record<string, unknown>>>({});
  const [pencere, pencereYaz] = useState<'yeni' | 'yonet' | 'hesap' | null>(null);
  // Aramadaki "Yeni parametre dönemi" oluşan dönemin adresine gelir; sayfa açıkken de o dönem seçilir.
  const kimlikDonemId = kimlikDonem?.id ?? null;
  useEffect(() => { if (kimlikDonemId) { donemIdYaz(kimlikDonemId); taslakYaz({}); bolumYaz((b) => (DONEMLI.includes(b) ? b : 'ucret')); } }, [kimlikDonemId]);
  const donem: Donem = liste.find((d) => d.id === donemId) ?? donemTarihte(m, bugun);
  const durum = donemDurumu(m, donem);
  const donemli = DONEMLI.includes(bolum);
  const kilitli = donemli && Boolean(durum.lock);
  const kapali = !o.yetki.ayarYaz || kilitli;
  const donemAnahtarlari = sabit?.PERIOD_KEYS ?? [];
  const tamAyar: Record<string, unknown> = { ...(sabit?.DEFAULT_SETTINGS ?? {}), ...o.depo.ayarlar };
  const ayarDonem = donemAyari(m, donem);
  const deger = (k: string): unknown => (Object.hasOwn(taslak, k) ? taslak[k] : donemAnahtarlari.includes(k) ? ayarDonem[k] : tamAyar[k]);
  const yaz = (k: string, v: unknown) => { taslakYaz((t) => ({ ...t, [k]: v })); };
  const adet = Object.keys(taslak).length;

  const metin = (v: unknown): string => (v === undefined || v === null ? '' : String(v));
  const a: AyarAlanlari = {
    m, o, kapali, deger, yaz, donemKilitli: kilitli,
    sayi: (k, etiket, ipucu, birim) => (
      <Girdi key={k} etiket={birim ? `${etiket} (${birim})` : etiket} type="number" step="any" value={metin(deger(k))} disabled={kapali} {...(ipucu ? { ipucu } : {})}
        onChange={(e) => { yaz(k, ayarDegeri('sayi', e.target.value)); }} />
    ),
    metin: (k, etiket, ipucu) => (
      <Girdi key={k} etiket={etiket} value={metin(deger(k))} disabled={kapali} {...(ipucu ? { ipucu } : {})} onChange={(e) => { yaz(k, e.target.value); }} />
    ),
    uzun: (k, etiket, ipucu, satir = 6) => (
      <div key={k} className="tc-ikb-tam">
        <CokSatir etiket={etiket} rows={satir} value={metin(deger(k))} disabled={kapali} {...(ipucu ? { ipucu } : {})} onChange={(e) => { yaz(k, e.target.value); }} />
      </div>
    ),
    secim: (k, etiket, secenekler, ipucu) => (
      <Secim key={k} etiket={etiket} value={metin(deger(k))} disabled={kapali} {...(ipucu ? { ipucu } : {})} onChange={(e) => { yaz(k, e.target.value); }}
        secenekler={secenekler.map(([d, b]) => ({ deger: d, baslik: b }))} />
    ),
    isaret: (k, baslik, etiket, ipucu, varsayilanAcik = false) => (
      <div key={k} className="tc-ikb-isaret">
        <span className="tc-ikb-etiket">{baslik}</span>
        <IsaretKutusu etiket={etiket} checked={varsayilanAcik ? deger(k) !== false : Boolean(deger(k))} disabled={kapali} onChange={(e) => { yaz(k, e.target.checked); }} />
        {ipucu && <small className="tc-ikb-soluk">{ipucu}</small>}
      </div>
    ),
    liste: (k) => (Array.isArray(deger(k)) ? deger(k) as Record<string, unknown>[] : []),
  };

  const kaydet = async () => {
    const r = ayarKaydiKur({
      ayarlar: tamAyar, taslak, donemAnahtarlari, donemler: liste as unknown as DonemKaydi[], seciliDonem: donem.id, seciliKilitli: Boolean(durum.lock),
    });
    if (r.tur === 'kilitli') {
      bildir('hata', 'Bu parametre dönemi kilitli. Değişikliği ileri tarihli yeni bir dönemle yapın.');
      return;
    }
    const tamam = await yazici(() => komut.ayarKaydet(r.govde), r.donemli ? `Ayarlar kaydedildi: ${donem.ad} dönemi.` : 'Ayarlar kaydedildi.', 'Ayarlar kaydedilemedi.');
    if (tamam) taslakYaz({});
  };
  const donemSec = (id: string) => { donemIdYaz(id); taslakYaz({}); };

  useSayfaKomutlari('ik-ayarlar', AYAR_BOLUMLERI.map(([k, ad]) => ({
    anahtar: k, baslik: `Ayarlar: ${ad}`, simge: 'gear' as const, aciklama: null, sozcukler: [ad, 'ayar'], calistir: () => { bolumYaz(k); },
  })));

  return (
    <section className="tc-ikb">
      <Baslik
        baslik="Ayarlar" simge="gear"
        alt="Şirket bilgileri, resmî tatiller, dönemlere göre ücret ve vergi parametreleri, çalışma ve izin kuralları."
        dugmeler={[{ anahtar: 'hesap', etiket: 'Hesaplamalar', simge: 'ruler', yap: () => { o.git('hesap'); } }]}
      />
      <DugmeGrubu etiket="Ayar bölümü" secenekler={AYAR_BOLUMLERI} secili={bolum} sec={bolumYaz} />
      {donemli && (
        <div className="tc-ikb-donem" data-kilitli={durum.lock ? '' : undefined}>
          <div className="tc-ikb-donem-satir">
            <Secim etiket="Parametre dönemi" value={donem.id} onChange={(e) => { donemSec(e.target.value); }} secenekler={liste.map((d) => ({ deger: d.id, baslik: donemEtiketi(m, d) }))} />
            <Rozet ton={durum.k === 'active' ? 'tamam' : durum.k === 'future' ? 'bilgi' : 'pasif'}>{durum.l}</Rozet>
            <span className="tc-ikb-uzar" />
            {o.yetki.ayarYaz && <Dugme simge="plus" onClick={() => { taslakYaz({}); pencereYaz('yeni'); }}>Yeni dönem</Dugme>}
            {o.yetki.ayarYaz && <Dugme onClick={() => { pencereYaz('yonet'); }}>Dönemleri yönet</Dugme>}
            <Dugme simge="ruler" onClick={() => { pencereYaz('hesap'); }}>Bu dönemle hesap dene</Dugme>
          </div>
          {durum.lock && <p className="tc-ikb-donem-kilit"><Simge ad="lock" /><span>{durum.lock}</span></p>}
          {donem.not && <p className="tc-ikb-soluk">{donem.not}</p>}
        </div>
      )}
      {!kapali && bolum !== 'veri' && (
        <div className="tc-ikb-kaydet">
          {adet
            ? <><Rozet ton="uyari">{`${adet} kaydedilmemiş değişiklik`}</Rozet><Dugme onClick={() => { taslakYaz({}); }}>Vazgeç</Dugme></>
            : <span className="tc-ikb-soluk">Değişiklikler sekmeler arasında korunur; kaydedene kadar hesaplamalara yansımaz.</span>}
          <span className="tc-ikb-uzar" />
          <Dugme tur="birincil" simge="check" yukleniyor={komut.calisiyor} onClick={() => { void kaydet(); }}>Ayarları kaydet</Dugme>
        </div>
      )}
      <form className="tc-ikb-yigin" onSubmit={(e) => { e.preventDefault(); }}>
        {AYAR_BOLUMU_ICERIGI[bolum](a, donem)}
      </form>
      {pencere === 'yeni' && <DonemPenceresi o={o} m={m} secili={donem} kapat={() => { pencereYaz(null); }} olustu={(id) => { donemSec(id); if (!donemli) bolumYaz('ucret'); }} />}
      {pencere === 'yonet' && <DonemlerPenceresi o={o} m={m} kapat={() => { pencereYaz(null); }} silindi={(id) => { if (id === donem.id) donemSec(donemTarihte(m, bugun).id); }} />}
      {pencere === 'hesap' && (
        <Pencere
          acik tur="yan" baslik="Brüt → net" kapat={() => { pencereYaz(null); }}
          alt={(
            <>
              <span className="tc-ikb-soluk">Tüm hesaplayıcılar için Hesaplamalar sayfasını kullanabilirsiniz.</span>
              <Dugme onClick={() => { pencereYaz(null); o.git('hesap'); }}>Hesaplamalar sayfası</Dugme>
              <Dugme tur="birincil" onClick={() => { pencereYaz(null); }}>Kapat</Dugme>
            </>
          )}
        >
          <Hesaplayici o={o} m={m} ilkSekme="brutnet" ilkDonem={donem.id} gomulu />
        </Pencere>
      )}
    </section>
  );
}
