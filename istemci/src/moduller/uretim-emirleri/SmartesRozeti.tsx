import { useQueries } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import type { SmartesEmirDurumlariCevabi, SmartesRozetDurumu } from '#paylasilan/sozlesme/smartes.ts';
import { Rozet, Simge, useTelefon, type RozetTonu } from '../../ortak/arayuz/index.ts';
import { api } from '../../ortak/veri/api.ts';
import { useOturum } from '../../ortak/veri/oturum.ts';

// 3346: emrin ve adımın SmartES'e gidiş rozeti. Ad ve ton Logo rozetiyle (3344) aynı dildedir: gitti yeşil, sırada gri, yeniden denenecek
// turuncu, durdu kırmızı. İki rozet bağlamada tek ortak bileşene iner (UYUM-BORCU).
export type SmartesEmirBilgisi = SmartesEmirDurumlariCevabi['emirler'][number];
export type SmartesAdimBilgisi = SmartesEmirBilgisi['adimlar'][number];
type Gonderilmez = SmartesAdimBilgisi['gonderilmez'];
// Sunucudaki SMARTES_EMIR_DURUMU_AZAMI ile aynı (paylasilan sözleşmesi zod taşır, istemciye değer olarak alınmaz).
const PAKET = 200;

export const SMARTES_DURUM_ADI: Record<SmartesRozetDurumu, string> = {
  gonderildi: 'SmartES\'te', sirada: 'Sırada', 'yeniden-denenecek': 'Yeniden denenecek', durdu: 'Durdu',
};
export const SMARTES_DURUM_TONU: Record<SmartesRozetDurumu, RozetTonu> = {
  gonderildi: 'tamam', sirada: 'pasif', 'yeniden-denenecek': 'uyari', durdu: 'hata',
};
// "—" tek başına üç ayrı şey diyebilir; ipucu ve ekran okuyucu hangisi olduğunu söyler.
export function gonderilmezMetni(g: Gonderilmez): string {
  if (g === 'esleme-yok') return 'SmartES\'e gönderilmez: istasyonun SmartES eşlemesi yok';
  if (g === 'baglanti-kapali') return 'SmartES\'e gönderilmez: SmartES bağlantısı kapalı';
  return 'SmartES\'e gönderilmez: adım gönderilecek durumda değil (taslak, bitmiş ya da fason)';
}

// Görünen emirlerin rozeti 200'lük paketlerle sorulur (açık emir listesi sayfasızdır). Okunamazsa `hata`: ekran "Okunamadı" yazar,
// "—" (gönderilmez) ile karışmasın.
export function useSmartesRozetleri(emirIdleri: readonly number[], etkin = true): { emir: (id: number) => SmartesEmirBilgisi | null; hata: boolean } {
  const tekil = [...new Set(emirIdleri)].sort((a, b) => a - b);
  const paketler: number[][] = [];
  for (let i = 0; i < tekil.length; i += PAKET) paketler.push(tekil.slice(i, i + PAKET));
  const sorgular = useQueries({
    queries: paketler.map((p) => ({
      queryKey: ['smartes', 'emir-durumlari', p.join(',')],
      queryFn: () => api.get<SmartesEmirDurumlariCevabi>(`/smartes/emir-durumlari?emir=${p.join(',')}`),
      enabled: etkin,
      staleTime: 30_000,
      retry: false,
    })),
  });
  const harita = new Map(sorgular.flatMap((s) => s.data?.emirler ?? []).map((e) => [e.emirId, e]));
  return { emir: (id) => harita.get(id) ?? null, hata: sorgular.some((s) => s.isError) };
}

// Başlıkta `baslik` ile "SmartES: Durdu" biçimi (yalnız "Durdu" emrin kendi durumu gibi okunur); "SmartES'te" aynı kalır.
export function SmartesRozeti({ durum, gonderilmez, ipucu, hata = false, baslik = false }: {
  durum: SmartesRozetDurumu | null; gonderilmez: Gonderilmez; ipucu?: string | null; hata?: boolean; baslik?: boolean;
}) {
  if (hata) return <span className="tc-smartes-rozet-yok">{baslik ? 'SmartES: okunamadı' : 'Okunamadı'}</span>;
  if (durum === null) {
    if (baslik) return null;
    const metin = gonderilmezMetni(gonderilmez);
    return <span className="tc-smartes-rozet-yok" title={metin} aria-label={metin}>—</span>;
  }
  const ad = SMARTES_DURUM_ADI[durum];
  return (
    <span className="tc-smartes-rozet" {...(ipucu ? { title: ipucu } : {})}>
      <Rozet ton={SMARTES_DURUM_TONU[durum]}>
        {durum === 'gonderildi' && <Simge ad="check" boyut="k" />}
        {durum === 'durdu' && <Simge ad="alert" boyut="k" />}
        {durum === 'yeniden-denenecek' && <Simge ad="rotate" boyut="k" />}
        {durum === 'sirada' && <Simge ad="clock" boyut="k" />}
        {baslik && durum !== 'gonderildi' ? `SmartES: ${ad}` : ad}
      </Rozet>
    </span>
  );
}

const onePlan = (d: SmartesRozetDurumu | null) => d === 'durdu' || d === 'yeniden-denenecek' || d === 'sirada';

// Liste hücresi: emrin toplam rozeti; altında öne çıkan adım ("OP 20 Freze") ve kısa neden, ya da "2/2 adım" (dokunmatikte ipucu okunmaz).
export function SmartesEmirHucresi({ bilgi, hata }: { bilgi: SmartesEmirBilgisi | null; hata: boolean }) {
  const t = bilgi?.toplam ?? null;
  // Telefonda kartta sütun başlığı yoktur: rozet hangi sistemin durumu olduğunu kendisi söyler.
  const telefon = useTelefon();
  const one = t && onePlan(t.durum) && t.opNo !== null ? bilgi!.adimlar.find((a) => a.opNo === t.opNo) ?? null : null;
  return (
    <span className="tc-smartes-hucre tc-smartes-liste">
      <SmartesRozeti durum={t?.durum ?? null} gonderilmez={t?.gonderilmez ?? 'adim-disi'} hata={hata} ipucu={t?.neden} baslik={telefon && t?.durum != null} />
      {!hata && t?.durum === 'gonderildi' && <small className="tc-smartes-alt">{t.gonderilen}/{t.toplam} adım</small>}
      {!hata && one && <small className="tc-smartes-alt"><span className="tc-smartes-op">OP {one.opNo} {one.ad}</span>{t?.neden && <> · {t.neden}</>}</small>}
    </span>
  );
}

// Ayrıntı başlığı: toplam rozet; duran adım varsa nerede düzeltileceği. Bağlantı izlemeyi gören oraya gider, görmeyen yöneticiye bildirir.
export function SmartesEmirBasligi({ bilgi, hata }: { bilgi: SmartesEmirBilgisi | null; hata: boolean }) {
  const izlemeGorur = useOturum().data?.islemler.includes('sayfa.guvenlik') === true;
  const t = bilgi?.toplam ?? null;
  const ipucu = t?.durum === 'gonderildi' ? `${String(t.gonderilen)}/${String(t.toplam)} adım SmartES'te` : t?.neden ?? null;
  return (
    <>
      <SmartesRozeti durum={t?.durum ?? null} gonderilmez={t?.gonderilmez ?? 'adim-disi'} ipucu={ipucu} hata={hata} baslik />
      {!hata && t?.durum === 'durdu' && (izlemeGorur
        ? <Link className="tc-smartes-izleme" to="/guvenlik/baglantilar">Bağlantı izlemede aç</Link>
        : <small className="tc-smartes-izleme">Yöneticiye bildirin</small>)}
    </>
  );
}

// Adım satırında: adımın rozeti ve nedeni; SmartES iş emri no ipucunda.
// Okuma hatası yalnız başlıkta yazılır; her adımda yinelenmez.
export function SmartesAdimRozeti({ adim, hata }: { adim: SmartesAdimBilgisi | null; hata: boolean }) {
  if (hata || adim === null) return null;
  // Gitmeyen adımda tek başına "—" satırdaki öteki bilgilerle karışır: kısa metin, nedeni ipucunda.
  if (adim.durum === null) {
    const metin = gonderilmezMetni(adim.gonderilmez);
    return <small className="tc-smartes-rozet-yok" title={metin} aria-label={metin}>SmartES'e gitmez</small>;
  }
  return (
    <span className="tc-smartes-hucre tc-smartes-adim">
      <SmartesRozeti durum={adim.durum} gonderilmez={adim.gonderilmez} baslik
        ipucu={adim.durum === 'gonderildi' ? (adim.smartesNo ? `SmartES iş emri ${adim.smartesNo}` : null) : adim.neden} />
      {adim.neden && adim.durum !== 'gonderildi' && <small className="tc-smartes-alt">{adim.neden}</small>}
    </span>
  );
}
