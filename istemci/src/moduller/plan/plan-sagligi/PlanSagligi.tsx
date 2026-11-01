import { useQuery } from '@tanstack/react-query';
import type { PlanSagligiCevabi } from '#paylasilan/sozlesme/plan.ts';
import { DurumKutusu } from '../../../ortak/arayuz/DurumKutusu.tsx';
import { GrafikKarti } from '../../../ortak/arayuz/GrafikKarti.tsx';
import { Kart } from '../../../ortak/arayuz/Kart.tsx';
import { SayfaBasligi } from '../../../ortak/arayuz/SayfaBasligi.tsx';
import { SayiKarti } from '../../../ortak/arayuz/SayiKarti.tsx';
import { Tablo } from '../../../ortak/arayuz/Tablo.tsx';
import { api } from '../../../ortak/veri/api.ts';
import { useOturum } from '../../../ortak/veri/oturum.ts';
import { egilimNoktalari, olcumYok, saatMetni, tablolarGorunur, tarihMetni, yuzdeMetni } from './kurallar.ts';

// Plan sağlığı (1478): planın ne kadar tuttuğu ve ne kadar oynadığı, son 8 hafta. Yalnız okur; her kart neyi neden ölçtüğünü yazar.
export const PLAN_SAGLIGI_YOLU = '/plan/plan-sagligi';

type KayanEmir = PlanSagligiCevabi['kayanEmirler'][number];
type SapanSure = PlanSagligiCevabi['sapanSureler'][number];

export function PlanSagligi() {
  const q = useQuery({ queryKey: ['plan', 'plan-sagligi'], queryFn: () => api.get<PlanSagligiCevabi>(PLAN_SAGLIGI_YOLU) });
  const oturum = useOturum();
  const yenile = () => { void q.refetch(); };
  return (
    <div>
      <SayfaBasligi baslik="Plan sağlığı" simge="gauge" alt="Plan ne kadar tuttu, ne kadar oynadı: son 8 hafta."
        birincil={{ etiket: 'Yenile', simge: 'rotate', yap: yenile, yukleniyor: q.isFetching }} />
      {q.isPending ? <DurumKutusu durum="yukleniyor" />
        : q.isError ? <DurumKutusu durum="hata" yenile={yenile} />
          : <Rapor c={q.data} tablolar={tablolarGorunur(oturum.data?.roller)} />}
    </div>
  );
}

function Rapor({ c, tablolar }: { c: PlanSagligiCevabi; tablolar: boolean }) {
  const { termin, soz, tutarlilik, uyum, veri } = c;
  return (
    <>
      {olcumYok(c) && (
        <p role="status">Canlıya alma ölçüm kaydı henüz yok: söz ve plan tutarlılığı ilk canlıya almalardan sonra dolar.</p>
      )}
      <div className="tc-pano-izgara">
        <GrafikKarti baslik="Termin güvenilirliği" simge="flag" tur="egri" birim="%" noktalar={egilimNoktalari(c, termin.egilim)}
          ozet={yuzdeMetni(termin.yuzde)}
          altMetin={termin.emir === 0 ? 'Bu dönemde terminli biten emir yok.'
            : `${String(termin.emir)} emirden ${String(termin.gecKalan)} geç bitti${termin.ortancaGecikmeGun === null ? '' : `, ortanca ${String(termin.ortancaGecikmeGun)} gün`}. Müşteriye verilen tarihin tutma oranı.`} />
        <GrafikKarti baslik="Söz tutarlılığı" simge="target" tur="egri" birim="saat" noktalar={egilimNoktalari(c, soz.egilim)}
          ozet={saatMetni(soz.ortancaKaymaSaat)}
          altMetin={`${String(soz.izlenenEmir)} emirden ${String(soz.kayanEmir)} tahmini bitişi kaydı. İlk tahmine göre ortanca kayma; eğri canlıya almalar arası ortanca oynama.`} />
        <GrafikKarti baslik="Plan tutarlılığı" simge="rotate" tur="egri" birim="%" noktalar={egilimNoktalari(c, tutarlilik.egilim)}
          ozet={yuzdeMetni(tutarlilik.yuzde)}
          altMetin={`Son 7 gün, ${String(tutarlilik.canliyaAlma)} canlıya almada yeri değişen işlerin oranı${tutarlilik.yakinDegisen === null ? '' : `; ${String(tutarlilik.yakinDegisen)} iş önümüzdeki 72 saatteydi`}. Atölyede "plan sürekli değişiyor" ölçüsü.`} />
        <GrafikKarti baslik="Plan uyumu" simge="gauge" tur="egri" birim="%" noktalar={egilimNoktalari(c, uyum.egilim)}
          ozet={yuzdeMetni(uyum.yuzde)}
          altMetin={uyum.olculenAdim === 0 ? 'Planda yeri olan biten adım yok.'
            : `${String(uyum.olculenAdim)} biten adım; tezgâh dışı ${String(uyum.tezgahDisi)}, sıra dışı ${String(uyum.siraDisi)}, 8 saatten çok kayan ${String(uyum.kaymaDisi)}. Atölyenin plana uyma oranı.`} />
        <SayiKarti baslik="Veri eksikleri" simge="alert" sayi={veri.eksikKonu} ton="uyari" yol="/plan/veri-sagligi"
          altMetin={[
            'Planın varsayımla çalıştığı konu sayısı',
            veri.okunamayanKonu > 0 ? `${String(veri.okunamayanKonu)} konu okunamadı` : null,
            veri.sonOlcum === null ? null
              : `son canlıya almada ${String(veri.yerlesmeyenIs)} iş yerleşmedi, ${String(veri.vardiyasizIs)} iş vardiyasız, ${String(veri.gelirsizEmir)} emir gelirsiz`,
          ].filter(Boolean).join('; ')} />
      </div>
      {tablolar && <Tablolar c={c} />}
    </>
  );
}

function Tablolar({ c }: { c: PlanSagligiCevabi }) {
  return (
    <>
      <Kart baslik="En çok kayan emirler" simge="target">
        <Tablo<KayanEmir>
          etiket="En çok kayan emirler"
          satirlar={c.kayanEmirler}
          satirAnahtari={(e) => String(e.uretimEmriId)}
          bosMesaj="Tahmini bitişi kayan emir yok."
          sutunlar={[
            { anahtar: 'emir', baslik: 'Emir', hucre: (e) => <span className="mono">{e.emirNo}</span>, csv: (e) => e.emirNo },
            { anahtar: 'termin', baslik: 'Termin', hucre: (e) => e.termin ?? '-' },
            { anahtar: 'ilk', baslik: 'İlk tahmin', hucre: (e) => tarihMetni(e.ilkTahmin) },
            { anahtar: 'son', baslik: 'Son tahmin', hucre: (e) => tarihMetni(e.sonTahmin) },
            { anahtar: 'kayma', baslik: 'Kayma', kirilmaz: true, hucre: (e) => saatMetni(e.kaymaSaat) },
            { anahtar: 'degisim', baslik: 'Kaç kez', hucre: (e) => String(e.degisim) },
            { anahtar: 'gecmis', baslik: 'Geçmiş', hucre: (e) => (
              <details>
                <summary>{`${String(e.gecmis.length)} ölçüm`}</summary>
                <ul>{e.gecmis.map((g) => <li key={g.zaman}>{`${tarihMetni(g.zaman)}: ${g.tahminiBitis === null ? 'yerleşmedi' : tarihMetni(g.tahminiBitis)}`}</li>)}</ul>
              </details>
            ), csv: (e) => e.gecmis.map((g) => `${g.zaman}=${g.tahminiBitis ?? ''}`).join(' ') },
          ]}
        />
      </Kart>
      <Kart baslik="Sürede en çok sapan istasyonlar" simge="clock">
        <Tablo<SapanSure>
          etiket="Sürede en çok sapan istasyonlar"
          satirlar={c.sapanSureler}
          satirAnahtari={(s) => String(s.istasyonId)}
          bosMesaj="En az üç örneği olan istasyon yok."
          sutunlar={[
            { anahtar: 'istasyon', baslik: 'İstasyon', hucre: (s) => s.istasyonAdi },
            { anahtar: 'oran', baslik: 'Gerçek / plan (ortanca)', kirilmaz: true, hucre: (s) => s.ortancaOran.toLocaleString('tr-TR') },
            { anahtar: 'ornek', baslik: 'Örnek', hucre: (s) => String(s.ornek) },
            { anahtar: 'encok', baslik: 'En çok sapan', hucre: (s) => `${s.enCok.emirNo} / ${String(s.enCok.opNo)}: ${s.enCok.oran.toLocaleString('tr-TR')}`,
              csv: (s) => `${s.enCok.emirNo} ${String(s.enCok.opNo)} ${String(s.enCok.oran)}` },
          ]}
        />
      </Kart>
    </>
  );
}
