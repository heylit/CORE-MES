import type {
  AsamaRengi, BelgelendirmeAsamasi, BulguSeviyesiTanimi, Cevap, Departman, HazirlikDonemi, IzHalkasi, Madde, OzSikligi, ProgramKodu, Soru,
  SurecTuru, ZorunluDokuman,
} from '../tipler.ts';
import { CHAIN_AS, CL_AS, DEPTS_AS, DOCS_AS, PREP_AS, Q_AS, SEV_AS, STAGES_AS } from './as9100.ts';
import { CHAIN_EY, CL_EY, DEPTS_EY, DOCS_EY, EY_KEYS, PHASES_EY, PREP_EY, Q_EY, SEV_EY, STAGES_EY } from './eydep.ts';
import { CHAIN, CL, DEPTS, DOCS, EXAMPLE, GORDER, PHASES, PREP, Q, SEV_ISO, STAGES, TYPES_AS, TYPES_EY, TYPES_ISO } from './iso9001.ts';

// Üç denetim programı ve program başına içerik ile karar kuralları (prototip PROGS). Program değişince aynı ekranlar bu tanımla çizilir.
export type KararTuru = 'ok' | 'warn' | 'bad';
export interface Karar { k: KararTuru; t: string; d: string }
export interface BulguSayilari { major: number; minor: number }
// Başlık için puan özetinin gereken kısmı (kurallar/puan.ts PuanSonucu).
export interface BaslikGirdisi { pct: number | null; isoMajor: number; isoMinor: number }
export interface ZamanCizelgesi { t: string; ev: [string, string, 0 | 1, string][] | null; p: string }

export interface ProgramTanimi {
  k: ProgramKodu;
  n: string;
  s: string;
  unit: string;
  unitGen: string;
  unitPl: string;
  CL: Record<string, Madde>;
  Q: readonly Soru[];
  GORDER: readonly string[];
  DEPTS: readonly Departman[];
  PREP: readonly HazirlikDonemi[];
  STAGES: readonly BelgelendirmeAsamasi[];
  DOCS: readonly ZorunluDokuman[];
  CHAIN: readonly IzHalkasi[];
  EXAMPLE: Record<string, Cevap>;
  PHASES: readonly AsamaRengi[];
  wheelKeys: readonly string[];
  wheelTitle: string;
  defClause: string;
  sev: readonly BulguSeviyesiTanimi[];
  sevTitle: string;
  sevGrid: string;
  lv: Record<string, string>;
  hasDef: boolean;
  types: readonly string[];
  // Denetime kalan gün eşikleri: 8-12 hafta, 4-6 hafta, 2 hafta (EYDEP 3 ay, 1 ay, 15 gün).
  phaseDays: readonly [number, number, number];
  target: number;
  targetLabel: string;
  rehberSub: string;
  stageTitle: string;
  docsTitle: string;
  docsDesc: string;
  docsKpi: string;
  verdict: (pct: number, ci: BulguSayilari) => Karar;
  headline: (r: BaslikGirdisi, v: Karar) => string;
  note?: string;
  info: ZamanCizelgesi;
}

function ncVerdict(t: { bad: string; ok: string; warn: string; risk: string }): ProgramTanimi['verdict'] {
  return (pct, ci) => {
    if (ci.major > 0) return { k: 'bad', t: 'Hazır değil', d: t.bad };
    if (pct >= 85 && ci.minor <= 2) return { k: 'ok', t: 'Denetime hazır', d: t.ok };
    if (pct >= 70) return { k: 'warn', t: 'Kısmen hazır', d: t.warn };
    return { k: 'bad', t: 'Riskli', d: t.risk };
  };
}
const ncHeadline = (r: BaslikGirdisi, v: Karar): string => (v.k === 'ok' ? 'Denetime girebilirsiniz' : r.isoMajor ? `${String(r.isoMajor)} kritik şartta kanıt eksik` : `${String(r.isoMinor)} minör bulgu riski var`);
export const eyGrade = (p: number): string => (p >= 85 ? 'A' : p >= 70 ? 'B' : p >= 50 ? 'C' : '');
export const LV_NC: Record<string, string> = { major: 'Majör risk', minor: 'Minör risk', obs: 'Gözlem', good: 'Tam uygun' };
export const LV_EY: Record<string, string> = { major: 'Kritik açık', minor: 'Puan kaybı', obs: 'Gelişim alanı', good: 'Güçlü' };

// Örnek doldurma: soru kimliğinden kararlı bir puan (prototip makeExample; her açılışta aynı örnek).
export function ornekCevaplar(qs: readonly Soru[]): Record<string, Cevap> {
  const o: Record<string, Cevap> = {};
  const desen: readonly Cevap[] = ['2', '3', '2', '1', '3', '2', '3', '2', '1', '3', '2', '2'];
  for (const x of qs) {
    if (x.d) continue;
    let h = 0;
    for (let i = 0; i < x.id.length; i++) h = (h * 31 + x.id.charCodeAt(i)) % 9973;
    o[x.id] = desen[h % desen.length] ?? '2';
  }
  return o;
}

export const PROGRAMLAR: Record<ProgramKodu, ProgramTanimi> = {
 iso9001:{k:"iso9001",n:"ISO 9001:2015",s:"ISO 9001",unit:"Madde",unitGen:"maddenin",unitPl:"MADDE",CL:CL,Q:Q,GORDER:GORDER,DEPTS:DEPTS,PREP:PREP,STAGES:STAGES,DOCS:DOCS,CHAIN:CHAIN,EXAMPLE:EXAMPLE,PHASES:PHASES,
  wheelKeys:["4","5","6","7","8","9","10"],wheelTitle:"Standardın yapısı: PDCA çarkı",defClause:"8",sev:SEV_ISO,sevTitle:"Bulgu seviyeleri",sevGrid:"g3",lv:LV_NC,hasDef:true,types:TYPES_ISO,phaseDays:[56,28,14],
  target:85,targetLabel:"hedef",rehberSub:"ISO 9001 denetiminin nasıl işlediğini adım adım keşfedin.",stageTitle:"Belgelendirme yolculuğu",
  docsTitle:"Zorunlu dokümante bilgiler",docsDesc:"Standardın açıkça istediği dokümanlar ve kayıtlar. Hazır olanları işaretleyin; denetçi bunları ilk sorar.",docsKpi:"Zorunlu dokümanlar",
  verdict:ncVerdict({bad:"Kritik bir şartta kanıt yok. Bu denetimde majör bulgu olarak yazılabilir ve sertifika kararını durdurur. Önce kırmızı maddeleri kapatın.",ok:"Sistem genel olarak kanıtlanabilir durumda. Kalan zayıf noktaları kapatarak minör bulgu riskini sıfıra yaklaştırın.",warn:"Majör risk görünmüyor ama birkaç minör bulgu beklenebilir. Turuncu maddeleri denetimden önce kapatın.",risk:"Birçok şartta kanıt eksik. Hazırlık takvimini sıkıştırın ya da denetim tarihini yeniden değerlendirin."}),headline:ncHeadline,
  info:{t:"ISO 9001:2026 geçişi",ev:[["Eyl 2015","ISO 9001:2015 yayımlandı",0,"2015-09-15"],["Şub 2024","İklim değişikliği tadili eklendi",0,"2024-02-23"],["16 Eyl 2026","ISO 9001:2026 yayımlandı",1,"2026-09-16"],["~2027","Belgelendirme kuruluşları 2026 denetimi için akredite olur",0,"2027-09-01"],["30 Eyl 2029","2015 sertifikalarının geçerliliği sona erer",1,"2029-09-30"]],
   p:"ISO 9001:2015 sertifikaları 30 Eylül 2029'a kadar geçerli. Madde yapısı korunuyor; öne çıkanlar kalite kültürü ve etik davranışa vurgu ile 2024 iklim değişikliği tadilinin bağlam maddelerine işlenmesi. İnsan hatasını önleme yeni bir şart değil, 2015 metninde de 8.5.1 g'de yer alıyor. Yakın dönemdeki denetimler çoğunlukla 2015 metnine göre yapılacağından bu araçtaki madde numaraları 2015 metnini esas alır."}},
 as9100:{k:"as9100",n:"AS9100D",s:"AS9100",unit:"Madde",unitGen:"maddenin",unitPl:"MADDE",CL:CL_AS,Q:Q_AS,GORDER:["4","5","6","7","8","9","10"],DEPTS:DEPTS_AS,PREP:PREP_AS,STAGES:STAGES_AS,DOCS:DOCS_AS,CHAIN:CHAIN_AS,EXAMPLE:ornekCevaplar(Q_AS),PHASES:PHASES,
  wheelKeys:["4","5","6","7","8","9","10"],wheelTitle:"Standardın yapısı: ISO 9001 + havacılık şartları",defClause:"8",sev:SEV_AS,sevTitle:"Bulgu seviyeleri (AS9101)",sevGrid:"g3",lv:LV_NC,hasDef:false,types:TYPES_AS,phaseDays:[56,28,14],
  target:85,targetLabel:"hedef",rehberSub:"AS9100D denetiminin nasıl işlediğini ve ISO 9001'den farklarını keşfedin.",stageTitle:"Belgelendirme yolculuğu",
  docsTitle:"Dokümante bilgiler ve AS9100 süreçleri",docsDesc:"ISO 9001'in istedikleri ile AS9100'ün eklediği süreç ve kayıtlar. Hazır olanları işaretleyin.",docsKpi:"Dokümanlar",
  verdict:ncVerdict({bad:"Kritik bir şartta kanıt yok. AS9101'e göre majör yazılabilir; acil kapsama istenebilir ve sertifika kararı durur.",ok:"Süreçler kanıtlanabilir durumda. Kalan zayıf noktaları kapatın; tekrar eden bulgu olmadığından emin olun.",warn:"Majör risk görünmüyor ama minör bulgular beklenebilir. Her biri için 30 gün içinde faaliyet planı gerekecek.",risk:"Birçok şartta kanıt eksik. Hazırlığı sıkıştırın ya da denetim tarihini yeniden değerlendirin."}),headline:ncHeadline,
  info:{t:"AS9100D ve IA9100 geçişi",ev:[["Eyl 2016","AS9100D yayımlandı",0,"2016-09-20"],["16 Eyl 2026","ISO 9001:2026 yayımlandı",0,"2026-09-16"],["2026 sonu","IA9100 yayını bekleniyor",1,"2026-12-15"],["~2027","Kuruluşların IA9100 denetimine hazırlanması",0,"2027-09-01"],["~2029","Geçişin tahmini sonu",1,"2029-12-31"]],
   p:"Güncel sürüm hâlâ AS9100D ve ISO 9001:2015'e dayanıyor. Yeni sürüm IA9100 adıyla ISO 9001:2026'ya uyumlu olarak bekleniyor; geçiş süresi henüz resmi olarak açıklanmadı, kaynaklar 2–3 yıl öngörüyor. Bu araçtaki madde numaraları AS9100D'yi esas alır. Güncel durumu belgelendirme kuruluşunuzdan teyit edin."}},
 eydep:{k:"eydep",n:"EYDEP",s:"EYDEP",unit:"Alan",unitGen:"alanın",unitPl:"ALAN",CL:CL_EY,Q:Q_EY,GORDER:EY_KEYS,DEPTS:DEPTS_EY,PREP:PREP_EY,STAGES:STAGES_EY,DOCS:DOCS_EY,CHAIN:CHAIN_EY,EXAMPLE:ornekCevaplar(Q_EY),PHASES:PHASES_EY,
  wheelKeys:EY_KEYS,wheelTitle:"Değerlendirme alanları: ortak sorular ve Üretim yetkinliği",defClause:"U",sev:SEV_EY,sevTitle:"Puan bantları ve sertifika seviyeleri",sevGrid:"g4",lv:LV_EY,hasDef:false,types:TYPES_EY,phaseDays:[90,30,15],
  target:85,targetLabel:"A",rehberSub:"EYDEP sürecini, değerlendirme alanlarını ve puan bantlarını keşfedin.",stageTitle:"EYDEP süreci",
  docsTitle:"Değerlendirme öncesi belge dosyası",docsDesc:"Heyetin ve SSB'nin sık istediği belgeler. Resmi yazıyla istenen liste her zaman esastır.",docsKpi:"Belge dosyası",
  verdict:(p: number): Karar => {const g=eyGrade(p);
    if(g==="A") return {k:"ok",t:"A seviyesi bölgesinde",d:"Öz değerlendirmeniz A bandında. Kalan açıkları kapatın ve her şeyi sistemde anlık gösterebildiğinizden emin olun."};
    if(g==="B") return {k:"warn",t:"B seviyesi bölgesinde",d:"Öz değerlendirmeniz B bandında. A için en düşük puanlı alanlara ve kritik sorulara odaklanın."};
    if(g==="C") return {k:"warn",t:"C seviyesi bölgesinde",d:"Sertifika eşiğinin üzerindesiniz ama birçok alan olgunlaşmalı. Kritik açıklardan başlayın."};
    return {k:"bad",t:"Sertifika eşiğinin altında",d:"Öz değerlendirmeniz 50 puanın altında. Başvurudan önce gelişim planını uygulamanız önerilir."};},
  headline:(r) => "Tahmini "+String(r.pct)+" puan",
  note:"Bu puan sizin öz değerlendirmenizdir. Resmi puanlama SSB değerlendirme heyetince yapılır ve soru seti ile ağırlıklar kamuya açık değildir.",
  info:{t:"EYDEP hakkında",ev:null,p:"EYDEP, Savunma Sanayii Başkanlığı'nın savunma, havacılık ve uzay sektörlerinde faaliyet gösteren firmaların endüstriyel yetkinliğini değerlendirdiği programdır. SSB'nin 2017 tanıtım sunumuna göre soru setleri bir ortak bölüm (kurumsallık, personel, emniyet/güvenlik, finans) ve alan bölümünden oluşur; Üretim alanında Ar-Ge, altyapı, proje yönetimi, kalite yönetimi, üretim ve teknik alan başlıkları yer alır. Bu araçtaki sorular bu yapıya göre hazırlanmış hazırlık sorularıdır, resmi soru setinin kopyası değildir. A/B/C puan bantları danışmanlık kaynaklarından alınmıştır; resmi puanlama ve ağırlıklar kamuya açık değildir. Olumsuz sonuçta 1 yıl geçmeden yeniden başvurulamaz; belgeler değerlendirmeden en geç 15 gün önce SSB'ye iletilmelidir."}}
};

export const PROGRAM_SIRASI: readonly ProgramKodu[] = ['iso9001', 'as9100', 'eydep'];
export const programTanimi = (k: string): ProgramTanimi => PROGRAMLAR[k as ProgramKodu] ?? PROGRAMLAR.iso9001;
export const seviyeAdi = (pg: ProgramTanimi, l: string): string => pg.lv[l] ?? l;
export const programMi = (k: unknown): k is ProgramKodu => k === 'iso9001' || k === 'as9100' || k === 'eydep';

export const OZF: Record<OzSikligi, { n: string; d: number; rr: string }> = {
  biweekly: { n: '2 haftada bir', d: 14, rr: 'FREQ=WEEKLY;INTERVAL=2' },
  monthly: { n: 'Ayda bir', d: 30, rr: 'FREQ=MONTHLY' },
  quarterly: { n: '3 ayda bir', d: 91, rr: 'FREQ=MONTHLY;INTERVAL=3' },
};
export const OZV: ReadonlySet<string> = new Set(['0', '1', '2', '3', 'na']);
export const PTYPE: Record<SurecTuru, string> = { y: 'Yönetim', a: 'Ana', d: 'Destek' };
