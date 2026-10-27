import { useState } from 'react';
import { Dugme, DurumKutusu, Kart, Rozet, SayiKarti, Tablo } from '../../../../ortak/arayuz/index.ts';
import { csvIndir } from '../../../../ortak/veri/csv.ts';
import { kisaTarih, sayiMetni, tl } from '../bicim.ts';
import { diffDays, gross, pct, type Islem } from '../motor.ts';
import type { EkranOzellikleri } from '../sekmeler.ts';
import { KayitPenceresi } from '../kayitlar/BelgeDuzelt.tsx';
import { CEK_DURUM_ADI, cariOzet, ekstre, EKSTRE_CSV_BASLIKLARI, ekstreCsvSatirlari, NOT_METNI, type EkstreSatiri } from './kurallar.ts';

// Firma kartının altındaki cari hesap (prototipte tam kipte firmad + VIEWS.carid): "Hesap" başlığı, mahsup düğmeleri, cari başlığı, özet,
// açık faturalar, çekler, ekstre.
// Yazma düğmeleri finans.yaz ile görünür; "Tahsil edildi / Ödendi" o faturayı seçili getirerek tahsilat/ödeme formunu açar.

const EKSTRE_KISA = 15;

export function CariHesap({ finans, yetki, kayitGir, party, side }: Required<Pick<EkranOzellikleri, 'yetki' | 'kayitGir'>> & {
  finans: NonNullable<EkranOzellikleri['finans']>;
  party: string;
  side: 'gelir' | 'gider';
}) {
  const { motor } = finans;
  const [tumu, tumuYaz] = useState(false);
  const [secili, seciliYaz] = useState<string | null>(null);
  const isC = side === 'gelir';
  const c = isC ? motor.runAnalysis().cs.byParty[party] : undefined;
  const o = cariOzet(motor, party, side);
  const rows = ekstre(motor, party, side);
  const gorunen = (tumu ? rows : rows.slice(-EKSTRE_KISA)).slice().reverse();
  const bugun = motor.bugun;
  const notSatiri = isC
    ? (c && c.grade
      ? `Risk notu ${c.grade} · ${NOT_METNI[c.grade] ?? ''}${c.avgDelay !== null ? ` · ağırlıklı ortalama gecikme ${sayiMetni(c.avgDelay)} gün` : ''}${c.term ? ` · olağan vade ${sayiMetni(c.term)} gün` : ''}`
      : 'Henüz ödeme geçmişi yok')
    : 'Tedarikçi hesabı';

  return (
    <section className="tc-fk" aria-label="Hesap">
      <h2 className="tc-fk-bolum">Hesap</h2>
      {yetki.yaz && (
        <div className="tc-fk-dugmeler">
          <Dugme simge="sort" onClick={() => kayitGir('mahsup', { party })}>Alacak ve borcu mahsup et</Dugme>
          <Dugme simge="check" onClick={() => kayitGir('avans', { party })}>Avansı faturaya mahsup et</Dugme>
        </div>
      )}
      <Kart
        baslik={party}
        sag={yetki.yaz ? (
          <div className="tc-fk-dugmeler">
            {isC ? (
              <>
                <Dugme simge="tag" onClick={() => kayitGir('satis', { party })}>Satış gir</Dugme>
                <Dugme simge="layers" onClick={() => kayitGir('cekal', { party })}>Çek aldım</Dugme>
                <Dugme tur="birincil" simge="download" onClick={() => kayitGir('tahsilat', { party })}>Tahsilat gir</Dugme>
              </>
            ) : (
              <>
                <Dugme simge="cart" onClick={() => kayitGir('alis', { party })}>Alış gir</Dugme>
                <Dugme simge="file" onClick={() => kayitGir('cekver', { party })}>Çek verdim</Dugme>
                <Dugme tur="birincil" simge="upload" onClick={() => kayitGir('odeme', { party })}>Ödeme gir</Dugme>
              </>
            )}
          </div>
        ) : undefined}
      >
        <p className="tc-fk-not">{notSatiri}</p>
      </Kart>
      <div className="tc-fk-ozet">
        <SayiKarti simge="lira" baslik={isC ? 'Bize borcu' : 'Bizim borcumuz'} metin={tl(o.acikToplam)} altMetin={`${o.acik.length} açık fatura`} />
        <SayiKarti simge="alert" baslik="Gecikmiş" metin={tl(o.gecikmis)} {...(o.gecikmis ? { ton: 'hata' as const } : {})} />
        <SayiKarti simge="layers" baslik={isC ? 'Elimizdeki çekleri' : 'Verdiğimiz çekler'} metin={tl(o.elimizdekiCekler)} />
        <SayiKarti
          simge="chart" baslik={`Son 12 ay ${isC ? 'satış' : 'alış'}`} metin={tl(o.hacim12)}
          altMetin={`KDV hariç${isC && c ? ` · cironun ${pct(c.share, 0)}'i` : ''}`}
        />
      </div>
      {isC && c && c.bounced > 0 && (
        <DurumKutusu
          durum="hata"
          mesaj={`Bu müşteriden ${c.bounced} karşılıksız çek var (${tl(c.bouncedAmt)}). Yeni satışlarda peşin veya teminatlı çalışmanız önerilir.`}
        />
      )}
      <div className="tc-fk-iki">
        <Kart baslik="Açık faturalar">
          <p className="tc-fk-not">Vadesi en eski olan üstte</p>
          <Tablo<Islem>
            etiket="Açık faturalar" satirlar={o.acik} satirAnahtari={(t) => t.id} satirSec={(t) => seciliYaz(t.id)} bosMesaj="Açık fatura yok."
            sutunlar={[
              { anahtar: 'tarih', baslik: 'Fatura tarihi', kirilmaz: true, hucre: (t) => kisaTarih(t.date) },
              { anahtar: 'aciklama', baslik: 'Açıklama', hucre: (t) => t.desc ?? '' },
              {
                anahtar: 'vade', baslik: 'Vade',
                hucre: (t) => { const l = diffDays(bugun, t.due); return l > 0 ? <Rozet ton="hata">{`${l} gün gecikti`}</Rozet> : <Rozet ton="uyari">{kisaTarih(t.due)}</Rozet>; },
              },
              { anahtar: 'tutar', baslik: 'Tutar', hizala: 'sag', mono: true, kirilmaz: true, hucre: (t) => tl(gross(t)) },
              ...(yetki.yaz ? [{
                anahtar: 'eylem', baslik: '',
                hucre: (t: Islem) => (
                  <Dugme
                    simge="check"
                    onClick={(e) => { e.stopPropagation(); kayitGir(isC ? 'tahsilat' : 'odeme', { party, secili: [t.id] }); }}
                  >
                    {isC ? 'Tahsil edildi' : 'Ödendi'}
                  </Dugme>
                ),
              }] : []),
            ]}
          />
        </Kart>
        <Kart baslik="Çek ve senetler">
          {o.cekler.length === 0 ? <p className="tc-fk-not">Kayıtlı çek veya senet yok.</p> : (
            <ul className="tc-fk-cekler">
              {o.cekler.slice(0, 10).map((q) => (
                <li key={q.id} className="tc-fk-cek">
                  <span>
                    {q.kind} · vade {kisaTarih(q.due)}
                    <small className="tc-fk-not">{q.bank ?? '—'} · {CEK_DURUM_ADI[q.status] ?? q.status}</small>
                  </span>
                  <b className={q.status === 'karsiliksiz' ? 'tc-fk-eksi' : undefined}>{tl(q.amount)}</b>
                </li>
              ))}
            </ul>
          )}
        </Kart>
      </div>
      <Kart
        baslik="Hesap ekstresi"
        sag={(
          <div className="tc-fk-dugmeler">
            {rows.length > EKSTRE_KISA && (
              <Dugme onClick={() => tumuYaz((x) => !x)}>{tumu ? `Son ${EKSTRE_KISA} hareket` : `Tüm hareketler (${rows.length})`}</Dugme>
            )}
            <Dugme simge="download" disabled={rows.length === 0} onClick={() => csvIndir(`ekstre-${party.replace(/[^\wçğıöşüÇĞİÖŞÜ]+/g, '-')}`, EKSTRE_CSV_BASLIKLARI, ekstreCsvSatirlari(rows))}>
              Ekstreyi indir
            </Dugme>
          </div>
        )}
      >
        <Tablo<EkstreSatiri>
          etiket="Hesap ekstresi" satirlar={gorunen} satirAnahtari={(r) => r.no} bosMesaj="Hareket yok."
          sutunlar={[
            { anahtar: 'tarih', baslik: 'Tarih', kirilmaz: true, hucre: (r) => kisaTarih(r.date) },
            { anahtar: 'aciklama', baslik: 'Açıklama', hucre: (r) => r.desc },
            { anahtar: 'borc', baslik: isC ? 'Satış' : 'Alış', hizala: 'sag', mono: true, hucre: (r) => (r.d ? tl(r.d) : '') },
            { anahtar: 'alacak', baslik: isC ? 'Tahsilat' : 'Ödeme', hizala: 'sag', mono: true, hucre: (r) => (r.c ? <span className="tc-fk-arti">{tl(r.c)}</span> : '') },
            { anahtar: 'bakiye', baslik: 'Bakiye', hizala: 'sag', mono: true, hucre: (r) => <b>{tl(r.bal)}</b> },
          ]}
        />
        <p className="tc-fk-not">Bakiye; faturalar eklenip tahsilat, ödeme ve çekler düşülerek hesaplanır. Çekle kapanan faturalar çek alındığı gün düşülür.</p>
      </Kart>
      {secili !== null && <KayitPenceresi key={secili} txId={secili} finans={finans} yetki={yetki} kapat={() => seciliYaz(null)} />}
    </section>
  );
}
