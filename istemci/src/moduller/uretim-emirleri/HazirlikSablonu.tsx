import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { HazirlikSablonuCevabi, HazirlikSablonuYazGovdesi, HazirlikSablonuYazCevabi } from '#paylasilan/sozlesme/uretim-emirleri.ts';
import { CokSatir, Dugme, DurumKutusu, Kart, Rozet, Secim, useBildirim } from '../../ortak/arayuz/index.ts';
import { api, hataIletisi } from '../../ortak/veri/api.ts';
import { yeniIstekKimligi, yenidenDenenebilirMi } from '../../ortak/veri/istek-kimligi.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';
import { tarihSaatMetni } from '../../ortak/veri/zaman-metni.ts';
import { anahtarlar } from './anahtarlar.ts';
import { maddeGorunumu, useHazirlikMaddeleri } from './hazirlik-maddeleri.ts';
import { YeniMaddePenceresi } from './YeniMaddePenceresi.tsx';
import './hazirlik-sablonu.css';

// 3688: hazırlık şablonu (Adım Durumu › Şablon). Operasyon türüne göre hangi maddenin gerekli olduğu; kaydet yeni sürüm yazar, geçmiş silinmez.
// Gerekli olmayan madde o türün adımında "Gerekmez" görünür. Yazma yetkisi sunucudan gelir (yazar); yetkisizde yalnız okunur.
// 3739: madde ayarı yetkisi olan yeni hazırlık maddesi ekler (Projeler'deki formla aynı uç; form oradan ithal edilemez, aynı kat). 3740: durduran madde varsayılan gerekli ve kilitlidir;
// yalnız müdür (sunucudan gelen durduranAcabilir) gerekçe yazarak kapatır.
type Tur = HazirlikSablonuCevabi['turler'][number];

const sablonAnahtari = ['uretim-emirleri', 'hazirlik-sablonu'] as const;

export function HazirlikSablonu() {
  const sorgu = useQuery({ queryKey: sablonAnahtari, queryFn: () => api.get<HazirlikSablonuCevabi>('/hazirlik-sablonu') });
  const [secili, seciliYaz] = useState<string>('varsayilan');
  const [kirli, kirliYaz] = useState(false);
  const [yeniMadde, yeniMaddeYaz] = useState(false);
  const maddeler = useHazirlikMaddeleri();
  const ekleyebilir = useOturum().data?.islemler.includes('uretim-emirleri.hazirlik-ayar') === true;
  if (sorgu.isPending) return <Kart><DurumKutusu durum="yukleniyor" /></Kart>;
  if (sorgu.isError) return <Kart><DurumKutusu durum="hata" mesaj={hataIletisi(sorgu.error, 'Şablon alınamadı.')} yenile={() => { void sorgu.refetch(); }} /></Kart>;
  const turler = sorgu.data.turler;
  const tur = turler.find((t) => (t.operasyonTipiId === null ? 'varsayilan' : String(t.operasyonTipiId)) === secili) ?? turler[0];
  if (tur === undefined) return <Kart><DurumKutusu durum="bos" mesaj="Operasyon türü yok." /></Kart>;
  return (
    <Kart baslik="Hazırlık şablonu" simge="list" sag={ekleyebilir && <Dugme className="tc-hs-yeni" simge="plus" onClick={() => { yeniMaddeYaz(true); }}>Yeni madde</Dugme>}>
      <p className="tc-hs-not">Her operasyon türü için hangi hazırlık maddesinin gerekli olduğunu seçin. Gerekli olmayan madde o türün adımlarında “Gerekmez” görünür. Başlatmayı durduran maddeler (CNC, çizim, yayın) varsayılan olarak gerekli ve kilitlidir; yalnız müdür gerekçe yazarak kapatabilir. Şablonu olmayan tür, varsayılan şablonu kullanır.</p>
      <Secim etiket="Operasyon türü" value={secili} disabled={kirli} ipucu={kirli ? 'Kaydedilmemiş işaretler var: kaydedin ya da vazgeçin, sonra tür değiştirin.' : undefined} onChange={(o) => seciliYaz(o.target.value)}
        secenekler={turler.map((t) => ({ deger: t.operasyonTipiId === null ? 'varsayilan' : String(t.operasyonTipiId), baslik: `${t.ad}${t.surum === null ? '' : ` · v${String(t.surum)}`}` }))} />
      <Duzenleyici key={`${secili}:${String(tur.surum)}`} tur={tur} yazar={sorgu.data.yazar} durduranAcabilir={sorgu.data.durduranAcabilir} kirli={kirliYaz} />
      {yeniMadde && <YeniMaddePenceresi sonraki={Math.min(999, (maddeler.data?.maddeler.at(-1)?.sira ?? 0) + 10)} kapat={() => { yeniMaddeYaz(false); }} />}
    </Kart>
  );
}

function Duzenleyici({ tur, yazar, durduranAcabilir, kirli }: { tur: Tur; yazar: boolean; durduranAcabilir: boolean; kirli: (v: boolean) => void }) {
  const istemci = useQueryClient();
  const { bildir } = useBildirim();
  const maddeler = useHazirlikMaddeleri();
  const gorunum = maddeGorunumu(maddeler.data?.maddeler);
  const acik = (maddeler.data?.maddeler ?? []).filter((m) => m.acik);
  const ilk = new Map(tur.satirlar.map((s) => [s.madde, s]));
  const [gerekli, gerekliYaz] = useState<Record<string, boolean>>(() => Object.fromEntries(acik.map((m) => [m.kod, ilk.get(m.kod)?.gerekli ?? true])));
  const [gerekce, gerekceYaz] = useState('');
  const [catisma, catismaYaz] = useState<string | null>(null);
  const degisti = acik.some((m) => (gerekli[m.kod] ?? true) !== (ilk.get(m.kod)?.gerekli ?? true)) || (tur.surum === null && acik.length > 0);
  // Uç tekrar korumalıdır: istek kimliği zorunlu. Sonucu bilinmeyen hatadan sonra aynı kimlikle yeniden gider; reddedilen (4xx) gönderimden sonra yenilenir.
  const istekKimligi = useRef<string | null>(null);
  const kaydet = useMutation({
    mutationFn: () => {
      istekKimligi.current ??= yeniIstekKimligi();
      const govde: HazirlikSablonuYazGovdesi = {
        satirlar: acik.map((m) => ({ madde: m.kod, gerekli: gerekli[m.kod] ?? true, rolId: ilk.get(m.kod)?.rolId ?? null, gun: ilk.get(m.kod)?.gun ?? 0 })),
        gerekce: gerekce.trim() === '' ? null : gerekce.trim(),
        beklenenSurum: tur.surum,
      };
      return api.put<HazirlikSablonuYazCevabi>(`/hazirlik-sablonu/${tur.operasyonTipiId === null ? 'varsayilan' : String(tur.operasyonTipiId)}`, govde, { istekKimligi: istekKimligi.current });
    },
    onSuccess: async (c) => {
      istekKimligi.current = null;
      bildir('tamam', `Şablon kaydedildi (v${String(c.surum)}).`);
      await Promise.all([
        istemci.invalidateQueries({ queryKey: sablonAnahtari }),
        istemci.invalidateQueries({ queryKey: anahtarlar.hepsi }),
      ]);
    },
    // Hata işaretleri silmez: kişi kendi işaretlerini görerek karar verir (409'da güncel şablonu kendisi yükler).
    onError: (x) => { if (!yenidenDenenebilirMi(x)) istekKimligi.current = null; catismaYaz(hataIletisi(x, 'Şablon kaydedilmedi.')); },
  });
  useEffect(() => { kirli(degisti && tur.surum !== null); return () => { kirli(false); }; }, [degisti, tur.surum, kirli]);
  // Durduran madde bu sürümde yeni kapanıyorsa gerekçe zorunludur (sunucu da ister).
  const yeniKapanan = acik.some((m) => m.durduran && !(gerekli[m.kod] ?? true) && (ilk.get(m.kod)?.gerekli ?? true));
  const neden = !degisti ? 'Değişiklik yok.' : yeniKapanan && gerekce.trim() === '' ? 'Başlatmayı durduran maddeyi kapatmak için gerekçe yazın.' : null;
  const vazgec = () => { gerekliYaz(Object.fromEntries(acik.map((m) => [m.kod, ilk.get(m.kod)?.gerekli ?? true]))); gerekceYaz(''); catismaYaz(null); };
  if (maddeler.isPending) return <DurumKutusu durum="yukleniyor" />;
  return (
    <div className="tc-hs">
      <p className="tc-hs-surum">
        {tur.surum === null
          ? <Rozet ton="uyari">Şablon henüz yok</Rozet>
          : <Rozet ton="bilgi">v{tur.surum}</Rozet>}
        {tur.surum !== null && <span>{tur.kisiAdi ?? 'Bilinmiyor'} · {tur.an === null ? '' : tarihSaatMetni(tur.an)}{tur.gerekce ? ` · ${tur.gerekce}` : ''}</span>}
      </p>
      <ul className="tc-hs-liste" aria-label={`${tur.ad} hazırlık maddeleri`}>
        {acik.map((m) => (
          <li key={m.kod} data-gerekli={(gerekli[m.kod] ?? true) ? '' : 'hayir'}>
            <label className="tc-hs-satir">
              <input type="checkbox" checked={gerekli[m.kod] ?? true} disabled={!yazar || (m.durduran && !durduranAcabilir)} onChange={(o) => gerekliYaz((g) => ({ ...g, [m.kod]: o.target.checked }))} />
              <span className="tc-hs-ad">{gorunum.ad(m.kod, m.ad)}</span>
              {m.durduran && <Rozet ton="uyari" gorunum="cizgi">Başlatmayı durdurur</Rozet>}
              <span className="tc-hs-durum">{m.durduran && !durduranAcabilir && (gerekli[m.kod] ?? true) ? 'Her zaman gerekli' : (gerekli[m.kod] ?? true) ? 'Gerekli' : 'Gerekmez'}</span>
              {m.durduran && !(gerekli[m.kod] ?? true) && <span className="tc-hs-durdur-uyari" role="status">Bu türdeki adımlar bu madde olmadan başlatılabilir.</span>}
            </label>
          </li>
        ))}
      </ul>
      {catisma !== null && (
        <p className="tc-hs-uyari" role="alert">
          {catisma} İşaretleriniz korundu.
          <Dugme onClick={() => { catismaYaz(null); void istemci.invalidateQueries({ queryKey: sablonAnahtari }); }}>Güncel şablonu yükle (işaretlerim silinir)</Dugme>
        </p>
      )}
      {yazar ? (
        <div className="tc-hs-alt">
          <CokSatir etiket={yeniKapanan ? 'Gerekçe (zorunlu)' : 'Gerekçe (isteğe bağlı)'} rows={2} maxLength={450} value={gerekce} onChange={(o) => gerekceYaz(o.target.value)} />
          <div className="tc-hs-dugmeler">
            <Dugme tur="birincil" simge="check" disabled={neden !== null} yukleniyor={kaydet.isPending} onClick={() => kaydet.mutate()}>
              {tur.surum === null ? 'Şablonu oluştur' : 'Yeni sürüm kaydet'}
            </Dugme>
            {degisti && tur.surum !== null && <Dugme onClick={vazgec}>Vazgeç</Dugme>}
            {neden !== null && <span className="tc-hs-not" role="status">{neden}</span>}
          </div>
        </div>
      ) : <p className="tc-hs-not">Şablonu yalnız yetkili kişiler değiştirebilir.</p>}
    </div>
  );
}
