import { Dugme, Rozet, Simge } from '../../../../ortak/arayuz/index.ts';
import { useDenetim } from '../baglam.tsx';
import { KYSB, KYSG } from '../icerik/kys-yapi.ts';
import { PROGRAMLAR } from '../icerik/programlar.ts';
import type { KysIstatistigi } from '../kurallar/kys.ts';
import { profilAdi } from '../kurallar/profil.ts';
import { Bolum, Halka, Nokta } from './ortak.tsx';

// Genel bakış (prototip vKys üst kartı ve kysNedir).

export function Olgunluk({ ist: st }: { ist: KysIstatistigi }) {
  const d = useDenetim();
  const baslik = st.live === st.n && !st.late ? 'Tüm yapı taşları yürürlükte'
    : st.miss === st.n ? "KYS'yi kurmaya başlayın" : `${String(st.live)}/${String(st.n)} yapı taşı yürürlükte`;
  return (
    <section className="tc-dhk-kart tc-dhk-olgunluk">
      <Halka yuzde={st.pct} etiket={`KYS olgunluğu %${String(st.pct)}`} />
      <div>
        <div className="tc-dhk-ust-yazi">KYS olgunluğu · {profilAdi(d.profil)}</div>
        <h3 className="tc-dhk-olgunluk-baslik">{baslik}</h3>
        <div className="tc-dhk-cipler">
          <Rozet ton="tamam">{`${String(st.live)} yürürlükte`}</Rozet>
          <Rozet ton="uyari">{`${String(st.draft)} taslak`}</Rozet>
          <Rozet ton="pasif">{`${String(st.miss)} yok`}</Rozet>
          {st.late > 0 && <Rozet ton="hata">{`${String(st.late)} gözden geçirme gecikti`}</Rozet>}
          {st.zmiss > 0 && <Rozet ton="uyari">{`${String(st.zmiss)} zorunlu doküman eksik`}</Rozet>}
        </div>
        <p className="tc-dhk-not">Olgunluk: yürürlükte olanlar tam, taslaklar kısmi sayılır; gözden geçirmesi geciken yapı taşları puanı düşürür.</p>
      </div>
    </section>
  );
}

const ILKELER: readonly [Parameters<typeof Simge>[0]['ad'], string, string][] = [
  ['rotate', 'Süreç yaklaşımı', 'İşler girdisi, çıktısı, sahibi ve göstergesi olan süreçler olarak yönetilir.'],
  ['target', 'PUKÖ döngüsü', 'Planla, uygula, kontrol et, önlem al; her süreçte ve KYS\'nin bütününde.'],
  ['alert', 'Risk temelli düşünme', 'Ters gidebilecekler önceden düşünülür, önlem alınır.'],
  ['chart', 'Kanıta dayalı karar', 'Kararlar sezgiye değil veriye ve kayda dayanır.'],
];
const SORULAR: readonly [string, string, string][] = [
  ['1', 'Tanımlı mı?', 'Şart için bir kural, süreç veya doküman var mı?'],
  ['2', 'Uygulanıyor mu?', 'Sahada o kurala göre mi çalışılıyor, kaydı var mı?'],
  ['3', 'Etkin mi?', 'İstenen sonuç alınıyor mu, gösterge hedefi tutuyor mu?'],
  ['4', 'İyileştiriliyor mu?', 'Sapmalarda kök neden bulunup önlem alınıyor mu?'],
];
const KIM: readonly [string, string][] = [
  ['Üst yönetim', "Politika, hedefler, kaynak, YGG kararları. KYS'nin sahibidir; denetçi liderliği doğrudan onunla konuşur."],
  ['KYS sorumlusu / kalite', 'Sistemi koordine eder: doküman kontrolü, iç denetim, DÖF takibi, raporlama. Sistemi tek başına yürütmez.'],
  ['Süreç sahipleri', 'Kendi süreçlerinin talimatları, riskleri, göstergeleri ve kayıtları. Denetçi süreci sahibine sorar.'],
  ['Çalışanlar', 'Talimata göre çalışır, kaydı tutar, uygunsuzluğu bildirir. Politikayı ve kendi işlerinin kaliteye etkisini bilir.'],
];
const PROGRAM_KYS: readonly ['iso9001' | 'as9100' | 'eydep', string, string][] = [
  ['iso9001', 'Temel', "ISO 9001 KYS'nin iskeletidir: bütün yapı taşları buradan gelir."],
  ['as9100', 'ISO 9001 + havacılık', "Aynı KYS'ye konfigürasyon, ürün güvenliği, sahte parça, FAI, FOD ve operasyonel risk eklenir."],
  ['eydep', 'KYS + kurumsal yetkinlik', 'Kalite yönetimi başlığında KYS değerlendirilir; ayrıca YETEN, bilgi güvenliği ve finans gibi kurumsal konulara bakılır.'],
];

export function GenelBakis() {
  const d = useDenetim();
  const items = d.profil.kys.items;
  return (
    <>
      <div className="tc-dhk-iki">
        <Bolum baslik="KYS nedir?" simge="help">
          <p className="tc-dhk-giris">
            Kalite yönetim sistemi, bir firmanın müşteri ve yasal şartları sürekli olarak karşılamak için işlerini nasıl{' '}
            <b>planladığını, yürüttüğünü, ölçtüğünü ve iyileştirdiğini</b> tanımlayan kurallar, süreçler ve kayıtlar bütünüdür. Bir klasör ya da el
            kitabı değildir; firmanın gerçekten nasıl çalıştığıdır. Dokümanlar bu çalışmayı tarif eder, kayıtlar ise yapıldığını kanıtlar.
          </p>
          <div className="tc-dhk-ilkeler">
            {ILKELER.map(([s, b, t]) => <div key={b}><Simge ad={s} /><b>{b}</b><span>{t}</span></div>)}
          </div>
        </Bolum>
        <Bolum baslik="Denetçi KYS'ye hangi soruyla bakar?" simge="eye">
          <ol className="tc-dhk-sorular">
            {SORULAR.map(([n, b, t]) => <li key={n}><span>{n}</span><b>{b}</b><small>{t}</small></li>)}
          </ol>
          <p className="tc-dhk-not">
            Doküman var ama uygulanmıyorsa ya da uygulanıyor ama sonuç alınmıyorsa bulgu yazılır. En sık görülen hata, &quot;sertifika için&quot;
            hazırlanmış ama sahada yaşamayan bir sistemdir.
          </p>
        </Bolum>
      </div>
      <Bolum baslik="KYS ne içerir? PUKÖ'ye göre yapı taşları" simge="layers" sag={(
        <>
          <Dugme tur="birincil" simge="flag" onClick={() => { d.ekranDegistir((e) => { e.kys.tab = 'yol'; }); }}>Yol haritası</Dugme>
          <Dugme simge="list" onClick={() => { d.ekranDegistir((e) => { e.kys.tab = 'blok'; }); }}>Yapı taşlarını yönet</Dugme>
        </>
      )}>
        <div className="tc-dhk-puko">
          {KYSG.map((g) => {
            const bs = KYSB.filter((b) => b.g === g.k && !b.tag);
            const live = bs.filter((b) => items[b.id]?.st === 2).length;
            return (
              <div key={g.k} className="tc-dhk-puko-grup">
                <div className="tc-dhk-puko-ust"><b>{g.n}</b><small>{g.d}</small><span className="mono">{`${String(live)}/${String(bs.length)}`}</span></div>
                <ul>{bs.map((b) => <li key={b.id}><Nokta st={items[b.id]?.st ?? 0} /><span>{b.n}</span><small>{b.c}</small></li>)}</ul>
              </div>
            );
          })}
        </div>
      </Bolum>
      <div className="tc-dhk-iki">
        <Bolum baslik="Kim ne oluşturur?" simge="users">
          <dl className="tc-dhk-kim">{KIM.map(([b, t]) => <div key={b}><dt>{b}</dt><dd>{t}</dd></div>)}</dl>
        </Bolum>
        <Bolum baslik="Üç program, tek KYS" simge="target">
          <div className="tc-dhk-programlar">
            {PROGRAM_KYS.map(([k, b, t]) => (
              <div key={k} data-program={k}><span className="tc-dhk-program-etiket">{PROGRAMLAR[k].s}</span><b>{b}</b><small>{t}</small></div>
            ))}
          </div>
          <p className="tc-dhk-not">AS9100 ve EYDEP etiketli ek yapı taşları, firma o programı kullanıyorsa (denetimi, cevabı varsa ya da açıksa) olgunluk puanına katılır.</p>
        </Bolum>
      </div>
    </>
  );
}
