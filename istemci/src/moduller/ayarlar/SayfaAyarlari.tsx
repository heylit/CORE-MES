import { IKINCI_MENULER, KAPATILABILIR_YOLLAR, SAYFALAR, menudeGorunur } from '#paylasilan/sayfalar.ts';
import type { IkinciMenuTanimi } from '#paylasilan/sayfa-tanimi.ts';

const MENULER: readonly IkinciMenuTanimi[] = IKINCI_MENULER;
import { AcKapa, DurumKutusu, Kart, useBildirim } from '../../ortak/arayuz/index.ts';
import { hataIletisi } from '../../ortak/veri/api.ts';
import { useKapaliSayfalarDegistir, useKapaliSayfalarDurumu } from '../../ortak/veri/kapali-sayfalar.ts';

interface Satir { yol: string; baslik: string; altlar: { yol: string; baslik: string }[] }

// Ana menü sırasıyla sayfalar; altlarında ikinci menü maddeleri (sayfanın kendi yolundaki madde sayfanın anahtarıdır).
export const SAYFA_SATIRLARI: readonly Satir[] = SAYFALAR
  .filter((s) => menudeGorunur(s) && KAPATILABILIR_YOLLAR.includes(s.yol))
  .map((s) => ({
    yol: s.yol,
    baslik: s.baslik,
    altlar: (MENULER.find((m) => m.kok === s.yol)?.gruplar ?? [])
      .flatMap((g) => g.maddeler)
      .filter((m) => m.yol !== s.yol && KAPATILABILIR_YOLLAR.includes(m.yol))
      .map((m) => ({ yol: m.yol, baslik: m.baslik })),
  }));

// Kapatmak yalnız görünürlüktür: menüden, aramadan ve ana sayfa kartlarından kalkar, adresle açılınca "kapalı" yazar.
export function SayfaAyarlari() {
  const { kapali, hazir, hata, yenile } = useKapaliSayfalarDurumu();
  const degistir = useKapaliSayfalarDegistir();
  const { bildir } = useBildirim();
  const kilitli = !hazir || degistir.isPending;

  // Yalnız çevrilen sayfa gönderilir; öteki sayfaların durumu sunucuda kalır.
  const cevir = (yol: string, acik: boolean) => {
    degistir.mutate({ yol, kapali: !acik }, {
      onSuccess: () => { bildir('tamam', acik ? 'Sayfa açıldı.' : 'Sayfa kapatıldı.'); },
      onError: (hata) => { bildir('hata', hataIletisi(hata, 'Sayfa ayarı kaydedilemedi.')); },
    });
  };

  return (
    <Kart baslik="Sayfalar">
      <p className="tc-ayar-aciklama">Hazır olmayan sayfayı kapatın: herkesin menüsünden ve ana sayfasından kalkar. Ana sayfa ve Sistem Ayarları kapatılamaz.</p>
      {hata && <DurumKutusu durum="hata" mesaj="Sayfa durumları alınamadı; anahtarlar kilitli." yenile={yenile} />}
      <ul className="tc-ayarlar" aria-label="Sayfalar">
        {SAYFA_SATIRLARI.map((s) => {
          const acik = !kapali.includes(s.yol);
          return (
            <li key={s.yol} className="tc-ayar-sayfa-satiri">
              <div className="tc-ayar">
                <p className="tc-ayar-baslik">{s.baslik}</p>
                <AcKapa etiket={s.baslik} acik={acik} disabled={kilitli} degistir={(yeni) => { cevir(s.yol, yeni); }} />
              </div>
              {s.altlar.length > 0 && (
                <ul className="tc-ayarlar tc-ayar-altlar" aria-label={`${s.baslik} alt sayfaları`}>
                  {s.altlar.map((a) => (
                    <li key={a.yol} className="tc-ayar">
                      <p className="tc-ayar-aciklama">{a.baslik}</p>
                      <AcKapa
                        etiket={`${s.baslik}: ${a.baslik}`}
                        acik={acik && !kapali.includes(a.yol)}
                        disabled={!acik || kilitli}
                        degistir={(yeni) => { cevir(a.yol, yeni); }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </Kart>
  );
}
