import type { Kalite, OzellikDegerleri, Sinif, Sozluk } from './tipler.ts';
import type { IzinliSecenek } from './uyumluluk.ts';

// 3246: CNC atölyesinde sık geçen metal kaliteleri, sınıfları ve durum (temper) seçenekleri. Yalnız ekleme yapar; var olan kodlar, adlar
// ve kayıtlı kartlar değişmez. Özellik değerleri ana standardın tipik ya da en az değerleridir; emin olunmayan alan boş bırakılır.
// `durum.ts` bunu sınıf tablosu kurulurken çağırır; döngüsel ithali önlemek için `G` yerine yerel yardımcı kullanılır.
function K(ad: string, kod: string, p: OzellikDegerleri, std: string, eq: Sozluk<string> = {}): Kalite {
    return { ad, kod, p, std, eq };
}

const DURUM_EKLERI: Sozluk<string[]> = {
    karbon: ['Normalize + temperlenmiş (+NT)', 'Soğuk çekilmiş (+C)'],
    sac: ['Termomekanik hadde (+M)', 'Soğuk hadde, tavsız (+C, tam sert)'],
    islah: ['Küreselleştirme tavlı (+AC)', 'Islah + soğuk çekilmiş (+QT+C)', 'Islah + kabuk soyulmuş (+QT+SH)', 'Sertleşebilirlik garantili (+H)',
        'Yumuşak tavlı + soğuk çekilmiş (+A+C)', 'Normalize + soğuk çekilmiş (+N+C)', 'Küreselleştirme tavlı + soğuk çekilmiş (+AC+C)', 'Gerilim giderilmiş'],
    yay: ['Islah (+QT)', 'Sıcak hadde (+AR)', 'Yumuşak tavlı (+A)', 'Patentlenmiş (tel)'],
    takim: ['Vakumda sertleştirilmiş + temperlenmiş', 'Ön sertleştirilmiş (~40 HRC)', 'Gerilim giderilmiş'],
    paslanmaz: ['Çökelme sertleştirilmiş (H925)', 'Çökelme sertleştirilmiş (H950)',
        'Çökelme sertleştirilmiş (H1000)', 'Çökelme sertleştirilmiş (H1050)', 'Çökelme sertleştirilmiş (H1075)','Çökelme sertleştirilmiş (H1100)', 'Çökelme sertleştirilmiş (H1150M)',
        'Islah (+QT700)', 'Islah (+QT800)', 'Islah (+QT900)', 'Tavlanmış + soğuk çekilmiş (+AT+C)',
        'Çökelme sertleştirilmiş (H1150D)', 'Çökelme sertleştirilmiş (TH1050)', 'Çökelme sertleştirilmiş (RH950)', 'Çökelme sertleştirilmiş (CH900)',
        'Soğuk sertleştirilmiş (+C1000)', 'Soğuk sertleştirilmiş (+C1150)', 'Soğuk sertleştirilmiş (+C1300)',
        '¼ sert (ASTM A666)', '½ sert (ASTM A666)', '¾ sert (ASTM A666)', 'Tam sert (ASTM A666)', 'Islah (+QT650)', 'Islah (+QT780)', 'Gerilim giderilmiş'],
    aluminyum: ['T3511', 'T42', 'T61', 'T62', 'T652', 'T73511', 'T76', 'T7651', 'T851', 'H19', 'H26', 'H38',
        'W (çözeltiye alınmış, kararsız)', 'T1', 'T2', 'T3510', 'T451', 'T4510', 'T4511', 'T6510', 'T73510', 'T7352', 'T74', 'T7452', 'T76511', 'T8', 'T81', 'T852', 'T9',
        'H13', 'H15', 'H17', 'H23', 'H25', 'H27', 'H28', 'H36'],
    aldokum: ['O (tavlı)', 'T4', 'T7', 'T1'],
    bakir: ['R550', 'R600', 'R700', 'TB00 (çözeltiye alınmış)', 'TD04 (çözelti + soğuk işlem)', 'TF00 (yaşlandırılmış)', 'TH04 (soğuk işlem + yaşlandırılmış)',
        'M (üretim hâli)', 'D (çekilmiş)', 'H040', 'H065', 'H090', 'H110', 'H150',
        'O60 (yumuşak tavlı)', 'H01 (¼ sert)', 'H02 (½ sert)', 'H04 (sert)', 'H06 (ekstra sert)', 'H08 (yay sertliği)', 'M30 (sıcak ekstrüzyon)', 'TQ50 (su verilmiş + temperlenmiş)'],
    titanyum: ['Çözeltiye alınmış (ST)', 'Çift tavlı (duplex annealed)', 'Gerilim giderilmiş', 'Yeniden kristalleşme tavlı (RA)', 'Soğuk işlenmiş + gerilim giderilmiş (CWSR)', 'Döküm hâli'],
    nikel: ['Çözeltiye alınmış + çift yaşlandırılmış', 'Yaşlandırılmış', 'Sıcak işlenmiş', 'Gerilim giderilmiş', 'Döküm hâli', 'Soğuk işlenmiş + yaşlandırılmış', 'Sıcak işlenmiş + yaşlandırılmış'],
    dokme: ['Su verilmiş + temperlenmiş', 'Grafitleştirme tavlı', 'İndüksiyonla sertleştirilmiş', 'Normalize + temperlenmiş', 'Alevle sertleştirilmiş'],
    celikdokum: ['Tavlanmış (+A)', 'Gerilim giderilmiş'],
    magnezyum: ['H26'],
    cinko: ['Yaşlandırılmış (kararlı hâle getirilmiş)'],
    refrakter: ['Tavlanmış', 'Soğuk işlenmiş'],
    kobalt: ['Yaşlandırılmış', 'Soğuk çekilmiş', 'HIP']
};

const KALITE_EKLERI: Sozluk<Kalite[]> = {
    karbon: [
        K('S355JR', 'S355JR', { ro: 7.85, cekme: 470, akma: 355, uzama: 22, emod: 210 }, 'EN 10025-2', { 'W.Nr': '1.0045', 'ASTM': '≈ A572 Gr.50', 'DIN (eski)': 'St 52-3' }),
        K('S355K2+N', 'S355K2', { ro: 7.85, cekme: 470, akma: 355, uzama: 22, emod: 210 }, 'EN 10025-2', { 'W.Nr': '1.0596' }),
        K('S460N', 'S460N', { ro: 7.85, cekme: 540, akma: 460, uzama: 17, emod: 210 }, 'EN 10025-3', { 'W.Nr': '1.8901' }),
        K('P355NL1', 'P355NL1', { ro: 7.85, cekme: 490, akma: 355, uzama: 22, emod: 210 }, 'EN 10028-3', { 'W.Nr': '1.0566', 'ASTM': '≈ A537 Cl.1' }),
        K('16Mo3', '16MO3', { ro: 7.85, cekme: 440, akma: 275, uzama: 24, emod: 210 }, 'EN 10028-2', { 'W.Nr': '1.5415', 'ASTM': '≈ A204 Gr.A' }),
        K('13CrMo4-5', '13CRMO45', { ro: 7.85, cekme: 450, akma: 300, uzama: 19, emod: 210 }, 'EN 10028-2', { 'W.Nr': '1.7335', 'ASTM': '≈ A387 Gr.12' }),
        K('Aşınma sacı 400 HB', 'ASN400', { ro: 7.85, sert: 400, kaynak: 'Orta', isleme: 'Zayıf' }, 'Üretici föyü', { 'Diğer adlar': 'Aşınmaya dayanıklı sac 400' }),
        K('Aşınma sacı 450 HB', 'ASN450', { ro: 7.85, sert: 450, kaynak: 'Orta', isleme: 'Zayıf' }, 'Üretici föyü', { 'Diğer adlar': 'Aşınmaya dayanıklı sac 450' }),
        K('Aşınma sacı 500 HB', 'ASN500', { ro: 7.85, sert: 500, kaynak: 'Zayıf', isleme: 'Zayıf' }, 'Üretici föyü', { 'Diğer adlar': 'Aşınmaya dayanıklı sac 500' })
    ],
    sac: [
        K('DC03', 'DC03', { ro: 7.85, cekme: 270, akma: 240, emod: 210 }, 'EN 10130', { 'W.Nr': '1.0347', 'DIN (eski)': 'St 13', 'JIS': 'SPCD' }),
        K('DC05', 'DC05', { ro: 7.85, cekme: 270, akma: 180, emod: 210 }, 'EN 10130', { 'W.Nr': '1.0312', 'JIS': 'SPCEN' }),
        K('DC06', 'DC06', { ro: 7.85, cekme: 270, akma: 170, emod: 210 }, 'EN 10130', { 'W.Nr': '1.0873' }),
        K('DD12', 'DD12', { ro: 7.85, cekme: 400, akma: 240, emod: 210 }, 'EN 10111', { 'W.Nr': '1.0398' }),
        K('DD13', 'DD13', { ro: 7.85, cekme: 400, akma: 240, emod: 210 }, 'EN 10111', { 'W.Nr': '1.0335' }),
        K('S315MC', 'S315MC', { ro: 7.85, cekme: 390, akma: 315, emod: 210 }, 'EN 10149-2', { 'W.Nr': '1.0972' }),
        K('S355MC', 'S355MC', { ro: 7.85, cekme: 430, akma: 355, emod: 210 }, 'EN 10149-2', { 'W.Nr': '1.0976' }),
        K('S420MC', 'S420MC', { ro: 7.85, cekme: 480, akma: 420, emod: 210 }, 'EN 10149-2', { 'W.Nr': '1.0980' }),
        K('S500MC', 'S500MC', { ro: 7.85, cekme: 550, akma: 500, emod: 210 }, 'EN 10149-2', { 'W.Nr': '1.0984' }),
        K('S700MC', 'S700MC', { ro: 7.85, cekme: 750, akma: 700, emod: 210 }, 'EN 10149-2', { 'W.Nr': '1.8974' }),
        K('DX52D+Z (galvaniz sac)', 'DX52D', { ro: 7.85, cekme: 270, akma: 140, emod: 210, korozyon: 'İyi' }, 'EN 10346', { 'W.Nr': '1.0350' }),
        K('DX53D+Z (galvaniz sac)', 'DX53D', { ro: 7.85, cekme: 270, akma: 140, emod: 210, korozyon: 'İyi' }, 'EN 10346', { 'W.Nr': '1.0355' })
    ],
    islah: [
        K('C15 (sementasyon)', 'C15', { ro: 7.85, emod: 210 }, 'EN 10084', { 'W.Nr': '1.0401', 'AISI/SAE': '≈ 1015' }),
        K('C22', 'C22', { ro: 7.85, emod: 210 }, 'EN 10083-2', { 'W.Nr': '1.0402', 'AISI/SAE': '≈ 1020' }),
        K('C35', 'C35', { ro: 7.85, emod: 210 }, 'EN 10083-2', { 'W.Nr': '1.0501', 'AISI/SAE': '≈ 1035', 'JIS': 'S35C' }),
        K('C60', 'C60', { ro: 7.85, emod: 210 }, 'EN 10083-2', { 'W.Nr': '1.0601', 'AISI/SAE': '≈ 1060', 'JIS': 'S58C' }),
        K('34CrMo4', '34CRMO4', { ro: 7.85, emod: 210, kaynak: 'Zayıf' }, 'EN 10083-3', { 'W.Nr': '1.7220', 'AISI/SAE': '4135 / 4137', 'JIS': 'SCM435' }),
        K('30CrNiMo8', '30CRNIMO8', { ro: 7.85, emod: 210, kaynak: 'Zayıf', isleme: 'Orta' }, 'EN 10083-3', { 'W.Nr': '1.6580' }),
        K('36CrNiMo4', '36CRNIMO4', { ro: 7.85, emod: 210, kaynak: 'Zayıf', isleme: 'Orta' }, 'EN 10083-3', { 'W.Nr': '1.6511', 'AISI/SAE': '≈ 9840' }),
        K('42CrMoS4', '42CRMOS4', { ro: 7.85, emod: 210, kaynak: 'Zayıf' }, 'EN 10083-3', { 'W.Nr': '1.7227', 'AISI/SAE': '≈ 4142H' }),
        K('21NiCrMo2 (8620, sementasyon)', '8620', { ro: 7.85, emod: 210 }, 'EN 10084', { 'W.Nr': '1.6523', 'AISI/SAE': '8620', 'JIS': 'SNCM220' }),
        K('17NiCrMo6-4 (sementasyon)', '17NICRMO64', { ro: 7.85, emod: 210 }, 'EN 10084', { 'W.Nr': '1.6566' }),
        K('11SMn30 (otomat çeliği)', '11SMN30', { ro: 7.85, emod: 210, isleme: 'Mükemmel', kaynak: 'Zayıf' }, 'EN 10087', { 'W.Nr': '1.0715', 'AISI/SAE': '≈ 1215', 'DIN (eski)': '9SMn28' }),
        K('11SMn37 (otomat çeliği)', '11SMN37', { ro: 7.85, emod: 210, isleme: 'Mükemmel', kaynak: 'Zayıf' }, 'EN 10087', { 'W.Nr': '1.0736', 'DIN (eski)': '9SMn36' }),
        K('35S20 (otomat ıslah)', '35S20', { ro: 7.85, emod: 210, isleme: 'Çok iyi', kaynak: 'Zayıf' }, 'EN 10087', { 'W.Nr': '1.0726', 'AISI/SAE': '≈ 1140' }),
        K('44SMn28 (çekme çelik, ETG 100 tipi)', '44SMN28', { ro: 7.85, emod: 210, isleme: 'Çok iyi', kaynak: 'Zayıf' }, 'EN 10087', { 'W.Nr': '1.0762', 'AISI/SAE': '≈ 1144' }),
        K('31CrMoV9 (nitrasyon)', '31CRMOV9', { ro: 7.85, emod: 210, kaynak: 'Zayıf' }, 'EN 10085', { 'W.Nr': '1.8519' }),
        K('34CrAlNi7 (nitrasyon)', '34CRALNI7', { ro: 7.85, emod: 210, kaynak: 'Zayıf' }, 'EN 10085', { 'W.Nr': '1.8550' }),
        K('41CrAlMo7-10 (nitrasyon)', '41CRALMO7', { ro: 7.85, emod: 210, kaynak: 'Zayıf' }, 'EN 10085', { 'W.Nr': '1.8509', 'AISI/SAE': '≈ Nitralloy 135M' })
    ],
    yay: [
        K('100CrMo7-3 (rulman çeliği)', '100CRMO73', { ro: 7.83, emod: 210 }, 'EN ISO 683-17', { 'W.Nr': '1.3536' }),
        K('60SiCr7 (yay çeliği)', '60SICR7', { ro: 7.85, emod: 206 }, 'EN 10089', { 'W.Nr': '1.7108', 'AISI/SAE': '≈ 9262' }),
        K('55Si7 (yay çeliği)', '55SI7', { ro: 7.85, emod: 206 }, 'EN 10089', { 'W.Nr': '1.5026', 'AISI/SAE': '≈ 9255' }),
        K('54SiCr6 (yay çeliği)', '54SICR6', { ro: 7.85, emod: 206 }, 'EN 10089', { 'W.Nr': '1.7102', 'AISI/SAE': '≈ 9254' }),
        K('C75S (yay bandı)', 'C75S', { ro: 7.85, emod: 206 }, 'EN 10132-4', { 'W.Nr': '1.1248', 'AISI/SAE': '≈ 1075' })
    ],
    takim: [
        K('1.2080 (D3)', '2080', { ro: 7.7, emod: 210 }, 'EN ISO 4957', { 'EN kısa ad': 'X210Cr12', 'AISI': 'D3', 'JIS': 'SKD1' }),
        K('1.2363 (A2)', '2363', { ro: 7.85, emod: 210 }, 'EN ISO 4957', { 'EN kısa ad': 'X100CrMoV5', 'AISI': 'A2', 'JIS': 'SKD12' }),
        K('1.2343 (H11)', '2343', { ro: 7.8, emod: 210 }, 'EN ISO 4957', { 'EN kısa ad': 'X37CrMoV5-1', 'AISI': 'H11', 'JIS': 'SKD6' }),
        K('1.2367', '2367', { ro: 7.8, emod: 210 }, 'EN ISO 4957', { 'EN kısa ad': 'X38CrMoV5-3' }),
        K('1.2312 (P20+S)', '2312', { ro: 7.85, emod: 210, isleme: 'İyi' }, 'EN ISO 4957', { 'EN kısa ad': '40CrMnMoS8-6', 'AISI': '≈ P20+S' }),
        K('1.2316 (paslanmaz kalıp)', '2316', { ro: 7.7, emod: 215, korozyon: 'İyi' }, 'EN ISO 4957', { 'EN kısa ad': 'X38CrMo16' }),
        K('1.2085 (paslanmaz kalıp, otomat)', '2085', { ro: 7.7, emod: 215, korozyon: 'Orta', isleme: 'İyi' }, 'EN ISO 4957', { 'EN kısa ad': 'X33CrS16' }),
        K('1.2436', '2436', { ro: 7.7, emod: 210 }, 'EN ISO 4957', { 'EN kısa ad': 'X210CrW12', 'JIS': '≈ SKD2' }),
        K('1.2601', '2601', { ro: 7.7, emod: 210 }, 'EN ISO 4957', { 'EN kısa ad': 'X165CrMoV12' }),
        K('1.2714 (L6)', '2714', { ro: 7.85, emod: 210 }, 'EN ISO 4957', { 'EN kısa ad': '55NiCrMoV7', 'AISI': '≈ L6', 'JIS': 'SKT4' }),
        K('1.2767', '2767', { ro: 7.85, emod: 210 }, 'EN ISO 4957', { 'EN kısa ad': '45NiCrMo16', 'AISI': '≈ 6F7' }),
        K('1.2162 (sementasyon kalıp)', '2162', { ro: 7.85, emod: 210 }, 'EN ISO 4957', { 'EN kısa ad': '21MnCr5' }),
        K('1.1730 (C45U)', '1730', { ro: 7.85, emod: 210, isleme: 'İyi' }, 'EN ISO 4957', { 'EN kısa ad': 'C45U', 'AISI': '≈ 1045' }),
        K('1.3243 (M35 HSS-Co)', '3243', { ro: 8.1, emod: 220 }, 'EN ISO 4957', { 'EN kısa ad': 'HS6-5-2-5', 'AISI': 'M35' }),
        K('1.3247 (M42 HSS-Co)', '3247', { ro: 8.0, emod: 220 }, 'EN ISO 4957', { 'EN kısa ad': 'HS2-9-1-8', 'AISI': 'M42' })
    ],
    paslanmaz: [
        K('1.4306 (304L)', '4306', { ro: 7.9, emod: 200 }, 'EN 10088-2', { 'EN kısa ad': 'X2CrNi19-11', 'AISI': '304L', 'UNS': 'S30403' }),
        K('1.4948 (304H)', '304H', { ro: 7.9, emod: 200 }, 'EN 10088-7', { 'EN kısa ad': 'X6CrNi18-10', 'AISI': '304H', 'UNS': 'S30409' }),
        K('1.4550 (347)', '347', { ro: 7.9, emod: 200 }, 'EN 10088-2', { 'EN kısa ad': 'X6CrNiNb18-10', 'AISI': '347', 'UNS': 'S34700' }),
        K('1.4828 (309)', '309', { ro: 7.9, emod: 200, tmax: 1000 }, 'EN 10095', { 'EN kısa ad': 'X15CrNiSi20-12', 'AISI': '≈ 309' }),
        K('1.4841 (314)', '314', { ro: 7.9, emod: 200, tmax: 1150 }, 'EN 10095', { 'EN kısa ad': 'X15CrNiSi25-21', 'AISI': '314', 'UNS': 'S31400' }),
        K('1.4435 (316L yüksek Mo)', '4435', { ro: 8.0, emod: 200 }, 'EN 10088-2', { 'EN kısa ad': 'X2CrNiMo18-14-3', 'AISI': '316L', 'UNS': 'S31603' }),
        K('1.4441 (316LVM, implant)', '316LVM', { ro: 8.0, emod: 200 }, 'ISO 5832-1', { 'EN kısa ad': 'X2CrNiMo18-15-3', 'ASTM': 'F138' }),
        K('1.4539 (904L)', '904L', { ro: 8.0, emod: 195, korozyon: 'Mükemmel' }, 'EN 10088-2', { 'EN kısa ad': 'X1NiCrMoCu25-20-5', 'UNS': 'N08904' }),
        K('1.4006 (410)', '410', { ro: 7.7, emod: 215 }, 'EN 10088-2', { 'EN kısa ad': 'X12Cr13', 'AISI': '410', 'UNS': 'S41000', 'JIS': 'SUS410' }),
        K('1.4028 (420 yüksek C)', '4028', { ro: 7.7, emod: 215 }, 'EN 10088-2', { 'EN kısa ad': 'X30Cr13', 'AISI': '420', 'JIS': 'SUS420J2' }),
        K('1.4034', '4034', { ro: 7.7, emod: 215 }, 'EN 10088-2', { 'EN kısa ad': 'X46Cr13', 'AISI': '≈ 420' }),
        K('1.4104 (430F otomat)', '430F', { ro: 7.7, emod: 215, isleme: 'İyi' }, 'EN 10088-3', { 'EN kısa ad': 'X14CrMoS17', 'AISI': '≈ 430F' }),
        K('1.4112 (440B)', '440B', { ro: 7.7, emod: 215 }, 'EN 10088-3', { 'EN kısa ad': 'X90CrMoV18', 'AISI': '≈ 440B' }),
        K('1.4125 (440C)', '440C', { ro: 7.7, emod: 200 }, 'EN 10088-3', { 'EN kısa ad': 'X105CrMo17', 'AISI': '440C', 'UNS': 'S44004' }),
        K('1.4122', '4122', { ro: 7.7, emod: 215 }, 'EN 10088-3', { 'EN kısa ad': 'X39CrMo17-1' }),
        K('1.4313 (CA6NM, 13-4)', '4313', { ro: 7.7, emod: 200 }, 'EN 10088-3', { 'EN kısa ad': 'X3CrNiMo13-4', 'UNS': 'S41500' }),
        K('1.4418 (16-5-1)', '4418', { ro: 7.7, emod: 200 }, 'EN 10088-3', { 'EN kısa ad': 'X4CrNiMo16-5-1' }),
        K('1.4568 (17-7PH)', '177PH', { ro: 7.8, emod: 200 }, 'EN 10088-2', { 'EN kısa ad': 'X7CrNiAl17-7', 'AISI': '631', 'UNS': 'S17700' }),
        K('1.4980 (A286)', 'A286', { ro: 7.94, emod: 201, tmax: 700 }, 'AMS 5732', { 'EN kısa ad': 'X6NiCrTiMoVB25-15-2', 'UNS': 'S66286' }),
        K('1.4362 (Dupleks 2304)', '2304', { ro: 7.8, emod: 200 }, 'EN 10088-2', { 'EN kısa ad': 'X2CrNiN23-4', 'UNS': 'S32304' }),
        K('1.4162 (Yalın dupleks 2101)', '2101', { ro: 7.8, emod: 200 }, 'EN 10088-2', { 'EN kısa ad': 'X2CrMnNiN21-5-1', 'UNS': 'S32101' }),
        K('1.4003 (3CR12)', '3CR12', { ro: 7.7, emod: 220, korozyon: 'Orta' }, 'EN 10088-2', { 'EN kısa ad': 'X2CrNi12', 'UNS': 'S41003' }),
        K('Nitronic 50 tipi (XM-19)', 'XM19', { ro: 7.88, emod: 199 }, 'ASTM A276', { 'UNS': 'S20910', 'Ticari adlar': 'Nitronic® 50' }),
        K('Nitronic 60 tipi', 'S21800', { ro: 7.62, emod: 180 }, 'ASTM A276', { 'UNS': 'S21800', 'Ticari adlar': 'Nitronic® 60' })
    ],
    aluminyum: [
        K('EN AW-2011 (otomat)', '2011', { ro: 2.83, emod: 70, isleme: 'Mükemmel', kaynak: 'Zayıf', korozyon: 'Orta' }, 'EN 573-3', { 'EN kimyasal': 'AlCu6BiPb', 'AA': '2011', 'UNS': 'A92011' }),
        K('EN AW-2007 (otomat)', '2007', { ro: 2.85, emod: 70, isleme: 'Mükemmel', kaynak: 'Zayıf', korozyon: 'Orta' }, 'EN 573-3', { 'EN kimyasal': 'AlCu4PbMgMn', 'AA': '2007' }),
        K('EN AW-2014', '2014', { ro: 2.8, emod: 73, kaynak: 'Zayıf', korozyon: 'Orta' }, 'EN 573-3', { 'EN kimyasal': 'AlCu4SiMg', 'AA': '2014', 'UNS': 'A92014' }),
        K('EN AW-2219', '2219', { ro: 2.84, emod: 73, korozyon: 'Orta' }, 'EN 573-3', { 'EN kimyasal': 'AlCu6Mn', 'AA': '2219', 'UNS': 'A92219' }),
        K('EN AW-2618A', '2618', { ro: 2.76, emod: 74, kaynak: 'Zayıf', korozyon: 'Orta' }, 'EN 573-3', { 'EN kimyasal': 'AlCu2Mg1,5Ni', 'AA': '2618', 'UNS': 'A92618' }),
        K('EN AW-5005', '5005', { ro: 2.7, emod: 69 }, 'EN 573-3', { 'EN kimyasal': 'AlMg1(B)', 'AA': '5005', 'UNS': 'A95005' }),
        K('EN AW-5052', '5052', { ro: 2.68, emod: 70 }, 'EN 573-3', { 'EN kimyasal': 'AlMg2,5', 'AA': '5052', 'UNS': 'A95052' }),
        K('EN AW-6005A', '6005A', { ro: 2.7, emod: 69 }, 'EN 573-3', { 'EN kimyasal': 'AlSiMg(A)', 'AA': '6005A' }),
        K('EN AW-6026 (kurşunsuz otomat)', '6026', { ro: 2.72, emod: 69, isleme: 'Mükemmel' }, 'EN 573-3', { 'EN kimyasal': 'AlMgSiBi', 'AA': '6026' }),
        K('EN AW-6101', '6101', { ro: 2.7, emod: 69 }, 'EN 573-3', { 'EN kimyasal': 'EAlMgSi', 'AA': '6101', 'UNS': 'A96101' }),
        K('EN AW-6262', '6262', { ro: 2.72, emod: 69, isleme: 'Mükemmel' }, 'EN 573-3', { 'EN kimyasal': 'AlMg1SiPb', 'AA': '6262', 'UNS': 'A96262' }),
        K('EN AW-7020', '7020', { ro: 2.78, emod: 70 }, 'EN 573-3', { 'EN kimyasal': 'AlZn4,5Mg1', 'AA': '7020' }),
        K('EN AW-7022', '7022', { ro: 2.76, emod: 71, korozyon: 'Orta' }, 'EN 573-3', { 'EN kimyasal': 'AlZn5Mg3Cu', 'AA': '7022' }),
        K('EN AW-7175', '7175', { ro: 2.8, emod: 72, kaynak: 'Zayıf', korozyon: 'Orta' }, 'AMS 4149', { 'AA': '7175', 'UNS': 'A97175' }),
        K('EN AW-7475', '7475', { ro: 2.81, emod: 70, kaynak: 'Zayıf', korozyon: 'Orta' }, 'AMS 4202', { 'AA': '7475', 'UNS': 'A97475' }),
        K('EN AW-5083 dökme kalıp plakası', '5083D', { ro: 2.66, emod: 71 }, 'Üretici föyü', { 'Diğer adlar': 'Döküm, gerilimi giderilmiş, frezelenmiş plaka' })
    ],
    aldokum: [
        K('EN AC-42000 (AlSi7Mg)', 'AC42000', { ro: 2.68, emod: 72 }, 'EN 1706', { 'AA': '≈ 356.0' }),
        K('EN AC-42200 (AlSi7Mg0,6)', 'AC42200', { ro: 2.68, emod: 72 }, 'EN 1706', { 'AA': '≈ A357.0' }),
        K('EN AC-44200 (AlSi12(a))', 'AC44200', { ro: 2.65, emod: 75 }, 'EN 1706', { 'AA': '≈ 413.0' }),
        K('EN AC-45000 (AlSi6Cu4)', 'AC45000', { ro: 2.75, emod: 73 }, 'EN 1706', { 'AA': '≈ 319.0' }),
        K('EN AC-47100 (AlSi12Cu1(Fe))', 'AC47100', { ro: 2.65, emod: 75 }, 'EN 1706', { 'AA': '≈ A413.0' }),
        K('EN AC-51300 (AlMg5)', 'AC51300', { ro: 2.65, emod: 69, korozyon: 'Çok iyi' }, 'EN 1706', { 'AA': '≈ 514.0' }),
        K('EN AC-21000 (AlCu4MgTi)', 'AC21000', { ro: 2.8, emod: 72, korozyon: 'Orta' }, 'EN 1706', { 'AA': '≈ 204.0' })
    ],
    bakir: [
        K('CuZn40Pb2 (CW617N) dövme pirinç', 'CW617N', { ro: 8.43, emod: 96, isleme: 'Çok iyi' }, 'EN 12165', { 'UNS': '≈ C37700', 'DIN (eski)': 'Ms58 (2.0402)' }),
        K('CuZn39Pb2 (CW612N)', 'CW612N', { ro: 8.43, emod: 96, isleme: 'Çok iyi' }, 'EN 12164', { 'UNS': '≈ C37700' }),
        K('CuZn35Pb2 (CW601N)', 'CW601N', { ro: 8.45, emod: 100, isleme: 'İyi' }, 'EN 12164', { 'UNS': '≈ C34200' }),
        K('CuZn21Si3P (CW724R) kurşunsuz pirinç', 'CW724R', { ro: 8.3, emod: 100, isleme: 'İyi' }, 'EN 12164', { 'UNS': 'C69300' }),
        K('CuZn38As (CW511L) DZR pirinç', 'CW511L', { ro: 8.42, emod: 100 }, 'EN 12164', {}),
        K('CuZn40 (CW509L) muntz', 'CW509L', { ro: 8.4, emod: 100 }, 'EN 1652', { 'UNS': 'C28000' }),
        K('CuZn30 (CW505L)', 'CW505L', { ro: 8.53, emod: 114 }, 'EN 1652', { 'UNS': 'C26000' }),
        K('CuZn15 (CW502L) tombak', 'CW502L', { ro: 8.75, emod: 122 }, 'EN 1652', { 'UNS': 'C23000' }),
        K('CuZn23Al6Mn4Fe3Pb (CW704R) yüksek mukavemetli pirinç', 'CW704R', { ro: 8.2, emod: 100 }, 'EN 12163', {}),
        K('CuZn37Mn3Al2PbSi (CW713R) özel pirinç', 'CW713R', { ro: 8.1, emod: 100 }, 'EN 12163', {}),
        K('CuSn6 (CW452K) fosfor bronzu', 'CW452K', { ro: 8.8, emod: 118 }, 'EN 1652', { 'UNS': 'C51900' }),
        K('CuSn12-C (CC483K) döküm bronz', 'CC483K', { ro: 8.7, emod: 95 }, 'EN 1982', { 'UNS': '≈ C90800' }),
        K('CuSn10-C (CC480K) döküm bronz', 'CC480K', { ro: 8.8, emod: 100 }, 'EN 1982', { 'UNS': '≈ C90700' }),
        K('CuSn5Zn5Pb5-C (CC491K) döküm bronz', 'CC491K', { ro: 8.8, emod: 95 }, 'EN 1982', { 'UNS': 'C83600', 'Diğer adlar': 'Rg5' }),
        K('CuAl10Fe3Mn2 (CW306G) alüminyum bronzu', 'CW306G', { ro: 7.6, emod: 120 }, 'EN 12163', {}),
        K('CuNi2Si (CW111C)', 'CW111C', { ro: 8.8, emod: 130 }, 'EN 12163', { 'UNS': '≈ C70250' }),
        K('CuCo2Be (CW104C)', 'CW104C', { ro: 8.8, emod: 130 }, 'EN 12163', { 'UNS': 'C17500' }),
        K('CuTeP (CW118C) otomat bakırı', 'CW118C', { ro: 8.94, emod: 115, isleme: 'Çok iyi' }, 'EN 12164', { 'UNS': 'C14500' }),
        K('CuNi30Mn1Fe (CW354H) bakır-nikel', 'CW354H', { ro: 8.9, emod: 150, korozyon: 'Mükemmel' }, 'EN 12163', { 'UNS': 'C71500' }),
        K('CuNi18Zn20 (CW409J) alpaka', 'CW409J', { ro: 8.7, emod: 135 }, 'EN 1652', { 'UNS': 'C75200', 'Diğer adlar': 'Nikel gümüşü' })
    ],
    titanyum: [
        K('Grade 3 (saf Ti)', 'GR3', { ro: 4.51, emod: 105 }, 'ASTM B265', { 'UNS': 'R50550', 'W.Nr': '3.7055' }),
        K('Grade 9 (Ti-3Al-2,5V)', 'GR9', { ro: 4.48, emod: 107 }, 'ASTM B338', { 'UNS': 'R56320', 'AMS': 'AMS 4943' }),
        K('Grade 12 (Ti-0,3Mo-0,8Ni)', 'GR12', { ro: 4.51, emod: 103 }, 'ASTM B265', { 'UNS': 'R53400' }),
        K('Ti-6Al-2Sn-4Zr-2Mo', 'TI6242', { ro: 4.54, emod: 114 }, 'AMS 4975', { 'UNS': 'R54620' }),
        K('Ti-6Al-7Nb (implant)', 'TI67NB', { ro: 4.52, emod: 105 }, 'ASTM F1295', { 'UNS': 'R56700', 'ISO': 'ISO 5832-11' }),
        K('Ti-5Al-5V-5Mo-3Cr (Ti-5553)', 'TI5553', { ro: 4.65, emod: 112 }, 'AMS 4983', {}),
        K('Grade 19 (Beta C)', 'GR19', { ro: 4.82, emod: 103 }, 'ASTM B348', { 'UNS': 'R58640' })
    ],
    nikel: [
        K('Alloy 200 (saf Ni)', 'A200', { ro: 8.89, emod: 204 }, 'ASTM B160', { 'UNS': 'N02200', 'W.Nr': '2.4066' }),
        K('Alloy 201 (düşük C saf Ni)', 'A201', { ro: 8.89, emod: 207 }, 'ASTM B160', { 'UNS': 'N02201', 'W.Nr': '2.4068' }),
        K('Alloy K-500 (NiCu30Al)', 'AK500', { ro: 8.44, emod: 179 }, 'ASTM B865', { 'UNS': 'N05500', 'W.Nr': '2.4375' }),
        K('Alloy 601 (NiCr23Fe)', 'A601', { ro: 8.11, emod: 207, tmax: 1150 }, 'ASTM B166', { 'UNS': 'N06601', 'W.Nr': '2.4851' }),
        K('Alloy 617 (NiCr23Co12Mo)', 'A617', { ro: 8.36, emod: 211 }, 'ASTM B166', { 'UNS': 'N06617', 'W.Nr': '2.4663' }),
        K('Alloy X (NiCr22Fe18Mo)', 'AX', { ro: 8.22, emod: 205 }, 'AMS 5754', { 'UNS': 'N06002', 'W.Nr': '2.4665' }),
        K('Alloy C-22 (NiCr21Mo14W)', 'AC22', { ro: 8.69, emod: 206, korozyon: 'Mükemmel' }, 'ASTM B574', { 'UNS': 'N06022', 'W.Nr': '2.4602' }),
        K('Alloy X-750 (NiCr15Fe7TiAl)', 'AX750', { ro: 8.28, emod: 214 }, 'AMS 5667', { 'UNS': 'N07750', 'W.Nr': '2.4669' }),
        K('Alloy 80A (NiCr20TiAl)', 'A80A', { ro: 8.19, emod: 222 }, 'EN 10269', { 'UNS': 'N07080', 'W.Nr': '2.4952' }),
        K('Waspaloy tipi', 'WASPA', { ro: 8.19, emod: 211 }, 'AMS 5706', { 'UNS': 'N07001', 'W.Nr': '2.4654' }),
        K('Invar 36 (FeNi36)', 'INVAR36', { ro: 8.05, emod: 141, genl: 1.3 }, 'ASTM F1684', { 'UNS': 'K93600', 'W.Nr': '1.3912' }),
        K('Kovar tipi (FeNi29Co17)', 'KOVAR', { ro: 8.36, emod: 138 }, 'ASTM F15', { 'UNS': 'K94610', 'W.Nr': '1.3981' })
    ],
    dokme: [
        K('EN-GJL-150 (GG15)', 'GJL150', { ro: 7.1 }, 'EN 1561', { 'ASTM': '≈ A48 Class 20' }),
        K('EN-GJL-350 (GG35)', 'GJL350', { ro: 7.3 }, 'EN 1561', { 'ASTM': '≈ A48 Class 50' }),
        K('EN-GJS-400-18-LT (düşük sıcaklık)', 'GJS40018', { ro: 7.1 }, 'EN 1563', { 'ASTM': '≈ A536 60-40-18' }),
        K('EN-GJS-450-10', 'GJS450', { ro: 7.1 }, 'EN 1563', { 'ASTM': '≈ A536 65-45-12' }),
        K('EN-GJS-800-2 (GGG80)', 'GJS800', { ro: 7.2 }, 'EN 1563', { 'ASTM': '≈ A536 120-90-02' }),
        K('EN-GJV-400 (vermiküler)', 'GJV400', { ro: 7.1 }, 'EN 16079', { 'Diğer adlar': 'CGI, kompakt grafitli dökme demir' }),
        K('EN-GJV-450 (vermiküler)', 'GJV450', { ro: 7.1 }, 'EN 16079', { 'Diğer adlar': 'CGI' }),
        K('EN-GJS-800-10 (ADI)', 'ADI800', { ro: 7.1 }, 'EN 1564', { 'ASTM': '≈ A897 Grade 1' }),
        K('EN-GJS-1050-6 (ADI)', 'ADI1050', { ro: 7.1 }, 'EN 1564', { 'ASTM': '≈ A897 Grade 2' }),
        K('EN-GJMW-400-5 (beyaz temper döküm)', 'GJMW400', { ro: 7.4 }, 'EN 1562', {}),
        K('EN-GJSA-XNiCr20-2 (Ni-Resist D-2)', 'NIRESD2', { ro: 7.4, korozyon: 'İyi' }, 'EN 13835', { 'ASTM': 'A439 D-2' })
    ]
};

const YENI_SINIFLAR: Sozluk<Sinif> = {
    celikdokum: { ad: 'Çelik döküm', kod: 'CDK', std: 'EN 10293', def: { korozyon: 'Zayıf', kaynak: 'İyi', isleme: 'İyi' },
        durum: ['Döküm hâli', 'Normalize (+N)', 'Normalize + temperlenmiş (+NT)', 'Su verilmiş + temperlenmiş (+QT)', 'Çözeltiye alınmış (+AT)'],
        yuzey: ['Ham döküm', 'Kumlanmış', 'İşlenmiş', 'Astar boyalı'],
        grades: [
            K('GP240GH (GS-C25)', 'GP240GH', { ro: 7.85, emod: 210 }, 'EN 10213', { 'W.Nr': '1.0619', 'ASTM': '≈ A216 WCB' }),
            K('G20Mn5', 'G20MN5', { ro: 7.85, emod: 210 }, 'EN 10293', { 'W.Nr': '1.6220' }),
            K('G42CrMo4', 'G42CRMO4', { ro: 7.85, emod: 210, kaynak: 'Zayıf' }, 'EN 10293', { 'W.Nr': '1.7231' }),
            K('GX5CrNi19-10 (CF8)', 'CF8', { ro: 7.9, emod: 193, korozyon: 'Çok iyi' }, 'EN 10213', { 'W.Nr': '1.4308', 'ASTM': 'A351 CF8' }),
            K('GX5CrNiMo19-11-2 (CF8M)', 'CF8M', { ro: 8.0, emod: 193, korozyon: 'Çok iyi' }, 'EN 10213', { 'W.Nr': '1.4408', 'ASTM': 'A351 CF8M' }),
            K('GX4CrNi13-4 (CA6NM)', 'CA6NM', { ro: 7.7, emod: 200, korozyon: 'İyi' }, 'EN 10213', { 'W.Nr': '1.4317', 'ASTM': 'A743 CA6NM' })
        ] },
    magnezyum: { ad: 'Magnezyum alaşımları', kod: 'MAG', std: 'ASTM B90', def: { korozyon: 'Zayıf', kaynak: 'Orta', isleme: 'Mükemmel' },
        durum: ['F (üretim hâli)', 'O (tavlı)', 'H24', 'T4', 'T5', 'T6'],
        yuzey: ['Hadde (doğal)', 'Pres yüzeyi (doğal)', 'Kromat dönüşüm kaplama', 'Mikro ark oksidasyon', 'Boyalı'],
        grades: [
            K('AZ31B', 'AZ31B', { ro: 1.77, emod: 45 }, 'ASTM B90', { 'UNS': 'M11311', 'EN': 'EN-MAMgAl3Zn1' }),
            K('AZ61A', 'AZ61A', { ro: 1.8, emod: 45 }, 'ASTM B107', { 'UNS': 'M11610' }),
            K('AZ80A', 'AZ80A', { ro: 1.8, emod: 45 }, 'ASTM B107', { 'UNS': 'M11800' }),
            K('AZ91D (döküm)', 'AZ91D', { ro: 1.81, emod: 45 }, 'ASTM B94', { 'UNS': 'M11917', 'EN': 'EN-MCMgAl9Zn1' }),
            K('ZK60A', 'ZK60A', { ro: 1.83, emod: 45 }, 'ASTM B107', { 'UNS': 'M16600' }),
            K('WE43', 'WE43', { ro: 1.84, emod: 44 }, 'AMS 4427', { 'UNS': 'M18430' })
        ] },
    cinko: { ad: 'Çinko alaşımları', kod: 'CNK', std: 'EN 1774', def: { korozyon: 'İyi', kaynak: 'Zayıf', isleme: 'Çok iyi' },
        durum: ['Basınçlı döküm hâli', 'Kokil döküm hâli', 'Kontinü döküm'],
        yuzey: ['Ham döküm', 'İşlenmiş', 'Krom kaplı', 'Nikel kaplı', 'Boyalı'],
        grades: [
            K('Zamak 3 (ZP3, ZnAl4)', 'ZP3', { ro: 6.6, emod: 96 }, 'EN 1774', { 'ASTM': 'B86 AG40A', 'UNS': 'Z33520' }),
            K('Zamak 5 (ZP5, ZnAl4Cu1)', 'ZP5', { ro: 6.7, emod: 96 }, 'EN 1774', { 'ASTM': 'B86 AC41A', 'UNS': 'Z35531' }),
            K('ZA-27 (ZnAl27Cu2)', 'ZA27', { ro: 5.0, emod: 78 }, 'ASTM B86', { 'UNS': 'Z35841' })
        ] },
    refrakter: { ad: 'Refrakter metaller', kod: 'REF', std: '', def: { korozyon: 'Çok iyi', kaynak: 'Zayıf', isleme: 'Zayıf' },
        durum: ['Sinterlenmiş', 'Dövülmüş / haddelenmiş', 'Gerilim giderilmiş', 'Yeniden kristalleşme tavlı'],
        yuzey: ['İşlenmiş', 'Taşlanmış', 'Kimyasal temizlenmiş'],
        grades: [
            K('Molibden (saf Mo)', 'MO', { ro: 10.22, emod: 329, erime: 2623 }, 'ASTM B387', { 'UNS': 'R03600' }),
            K('TZM (Mo-0,5Ti-0,08Zr)', 'TZM', { ro: 10.16, emod: 320, erime: 2623 }, 'ASTM B387', { 'UNS': 'R03630' }),
            K('Tungsten (saf W)', 'W', { ro: 19.25, emod: 411, erime: 3422 }, 'ASTM B760', { 'UNS': 'R07005' }),
            K('Tantal (saf Ta)', 'TA', { ro: 16.6, emod: 186, erime: 3017 }, 'ASTM B708', { 'UNS': 'R05200' }),
            K('Niyobyum (saf Nb)', 'NB', { ro: 8.57, emod: 105, erime: 2477 }, 'ASTM B393', { 'UNS': 'R04200' }),
            K('Zirkonyum 702', 'ZR702', { ro: 6.51, emod: 99, erime: 1855 }, 'ASTM B551', { 'UNS': 'R60702' }),
            K('Zirkonyum 705', 'ZR705', { ro: 6.64, emod: 97 }, 'ASTM B551', { 'UNS': 'R60705' })
        ] },
    kobalt: { ad: 'Kobalt alaşımları', kod: 'KOB', std: '', def: { korozyon: 'Mükemmel', kaynak: 'Orta', isleme: 'Zayıf' },
        durum: ['Döküm hâli', 'Tavlanmış', 'Çözeltiye alınmış', 'Soğuk işlenmiş + yaşlandırılmış'],
        yuzey: ['İşlenmiş', 'Taşlanmış', 'Parlatılmış'],
        grades: [
            K('CoCr28Mo6 (implant)', 'COCRMO', { ro: 8.3, emod: 210 }, 'ASTM F1537', { 'UNS': 'R31538', 'ISO': 'ISO 5832-12', 'Döküm': 'ASTM F75' }),
            K('Stellite 6 tipi (CoCr28W4)', 'ST6', { ro: 8.44, emod: 209, isleme: 'Zayıf' }, 'AMS 5387', { 'UNS': 'R30006', 'Ticari adlar': 'Stellite® 6' }),
            K('L-605 (CoCr20W15Ni)', 'L605', { ro: 9.13, emod: 225 }, 'AMS 5759', { 'UNS': 'R30605', 'W.Nr': '2.4964' }),
            K('MP35N tipi (CoNi35Cr20Mo10)', 'MP35N', { ro: 8.43, emod: 233 }, 'AMS 5844', { 'UNS': 'R30035' })
        ] }
};

// Yeni sınıfların stok kodu grubu (HM-<grup>-) ve form listesi.
export const METAL_EK_GRUP: Sozluk<string> = { celikdokum: 'CDK', magnezyum: 'MAG', cinko: 'CNK', refrakter: 'REF', kobalt: 'KOB' };
export const METAL_EK_FORM: Sozluk<string[]> = {
    celikdokum: ['blok', 'disk', 'cubuk', 'levha'],
    magnezyum: ['levha', 'cubuk', 'lama', 'boru', 'blok', 'disk'],
    cinko: ['blok', 'cubuk', 'levha', 'disk'],
    refrakter: ['cubuk', 'levha', 'tel', 'disk', 'blok', 'boru'],
    kobalt: ['cubuk', 'levha', 'tel', 'disk', 'blok']
};

// Durumu sınıfta zaten olan seçenek ve sınıfta zaten olan kalite kodu iki kez eklenmez. Yeni sınıflar önce girer ki durum ekleri onlara da ulaşsın.
export function metalEkleriniUygula(M: Sozluk<Sinif>): void {
    for (const [ck, c] of Object.entries(YENI_SINIFLAR)) if (!M[ck]) M[ck] = c;
    for (const [ck, l] of Object.entries(DURUM_EKLERI)) {
        const c = M[ck];
        if (!c) continue;
        c.durum = c.durum || [];
        for (const d of l) if (!c.durum.includes(d)) c.durum.push(d);
    }
    for (const [ck, l] of Object.entries(KALITE_EKLERI)) {
        const c = M[ck];
        if (!c) continue;
        for (const g of l) if (!c.grades.some(x => x.kod === g.kod)) c.grades.push(g);
    }
    durumlariSirala(M);
}

// Eklenen durumlar listenin sonuna düşer; aranan H1000 ya da T7351 komşusunun yanında görünsün diye sıra yeniden kurulur.
// Yalnız gösterim sırasıdır: kart seçilen metni saklar, değer değişmez.
const TEMPER_HARF = 'FOWHT';
function temperAnahtari(v: string): [number, number, string] | null {
    const m = /^([FOWHT])(\d?)(\d*)\b/.exec(v);
    if (!m) return null;
    return [TEMPER_HARF.indexOf(m[1]!), m[2] ? Number(m[2]) : -1, m[3]!];
}
function temperKarsilastir(a: string, b: string): number {
    const x = temperAnahtari(a)!, y = temperAnahtari(b)!;
    return x[0] - y[0] || x[1] - y[1] || (x[2] < y[2] ? -1 : x[2] > y[2] ? 1 : 0);
}
// Desene uyan öğeler ilk uyanın yerinde, sayısına göre sıralı bir blok olur; ötekiler yerinde kalır.
function blokSirala(l: string[], desen: RegExp, kars: (a: string, b: string) => number): void {
    const ilk = l.findIndex(v => desen.test(v));
    if (ilk < 0) return;
    const blok = l.filter(v => desen.test(v)).sort(kars);
    const kalan = l.filter(v => !desen.test(v));
    const once = l.slice(0, ilk).filter(v => !desen.test(v)).length;
    l.splice(0, l.length, ...kalan.slice(0, once), ...blok, ...kalan.slice(once));
}
const sayi = (desen: RegExp) => (a: string, b: string): number => {
    const x = desen.exec(a)!, y = desen.exec(b)!;
    return Number(x[1]) - Number(y[1]) || (x[2] ?? '').localeCompare(y[2] ?? '');
};
function durumlariSirala(M: Sozluk<Sinif>): void {
    for (const ck of ['aluminyum', 'aldokum', 'magnezyum']) {
        const l = M[ck]?.durum;
        if (l) blokSirala(l, /^[FOWHT]\d*\b/, temperKarsilastir);
    }
    const ps = M['paslanmaz']?.durum;
    if (ps) {
        const H = /^Çökelme sertleştirilmiş \(H(\d+)(\w*)\)$/;
        blokSirala(ps, H, sayi(H));
        const C = /^Soğuk sertleştirilmiş \(\+C(\d+)()\)$/;
        blokSirala(ps, C, sayi(C));
        const QT = /^Islah \(\+QT(\d+)()\)$/;
        blokSirala(ps, QT, sayi(QT));
    }
    const cu = M['bakir']?.durum;
    if (cu) {
        const R = /^R(\d+)()/;
        blokSirala(cu, R, sayi(R));
        const H = /^H(\d{3})()$/;
        blokSirala(cu, H, sayi(H));
    }
}

// Kalite izin listesi (GA) dar kalırsa sihirbaz sınıftaki geçerli durumu "uyumsuz" sayıp gizler (ör. 17-4PH'de H1000).
// Burada yalnız kalitenin standart ya da yaygın ticari teslim durumları eklenir; önerilen durum değişmez.
const KALITE_DURUM_IZIN_EKLERI: Sozluk<string[]> = (() => {
    const ISLAH = ['Küreselleştirme tavlı (+AC)', 'Islah + soğuk çekilmiş (+QT+C)', 'Islah + kabuk soyulmuş (+QT+SH)', 'Yumuşak tavlı + soğuk çekilmiş (+A+C)',
        'Normalize + soğuk çekilmiş (+N+C)', 'Gerilim giderilmiş'];
    const SEMENTASYON = ['Sertleşebilirlik garantili (+H)', 'Küreselleştirme tavlı (+AC)', 'Yumuşak tavlı + soğuk çekilmiş (+A+C)', 'Gerilim giderilmiş'];
    const TAKIM = ['Vakumda sertleştirilmiş + temperlenmiş', 'Gerilim giderilmiş'];
    const OSTENIT = ['Soğuk sertleştirilmiş (+C850)', 'Soğuk sertleştirilmiş (+C1000)', 'Tavlanmış + soğuk çekilmiş (+AT+C)', '¼ sert (ASTM A666)', '½ sert (ASTM A666)', 'Gerilim giderilmiş'];
    const PH = ['Çökelme sertleştirilmiş (H950)', 'Çökelme sertleştirilmiş (H1000)', 'Çökelme sertleştirilmiş (H1050)', 'Çökelme sertleştirilmiş (H1150D)'];
    const AL_SAF = ['H13', 'H15', 'H17', 'H19', 'H23', 'H25', 'H26', 'H27', 'H28'];
    const AL_MG = ['H26', 'H28', 'H36', 'H38'];
    const AL_6 = ['T1', 'T42', 'T451', 'T4510', 'T4511', 'T5', 'T62', 'T6510', 'T652', 'W (çözeltiye alınmış, kararsız)'];
    const TI_SAF = ['Gerilim giderilmiş', 'Yeniden kristalleşme tavlı (RA)', 'Soğuk işlenmiş + gerilim giderilmiş (CWSR)'];
    const CU_SAF = ['M (üretim hâli)', 'D (çekilmiş)', 'H040', 'H065', 'H090', 'O60 (yumuşak tavlı)', 'H01 (¼ sert)', 'H02 (½ sert)', 'H04 (sert)', 'H08 (yay sertliği)'];
    const GJS_EK = ['Su verilmiş + temperlenmiş', 'Normalize + temperlenmiş', 'İndüksiyonla sertleştirilmiş', 'Alevle sertleştirilmiş'];
    const GJL_EK = ['İndüksiyonla sertleştirilmiş', 'Alevle sertleştirilmiş'];
    return {
        S235: ['Soğuk çekilmiş (+C)'], S355: ['Soğuk çekilmiş (+C)'], P265GH: ['Normalize + temperlenmiş (+NT)'],
        C45: ISLAH, '41CR4': [...ISLAH, 'Sertleşebilirlik garantili (+H)'], '42CRMO4': [...ISLAH, 'Sertleşebilirlik garantili (+H)'], '34CRNIMO6': [...ISLAH, 'Sertleşebilirlik garantili (+H)'],
        '11SMNPB30': ['Yumuşak tavlı + soğuk çekilmiş (+A+C)', 'Gerilim giderilmiş'],
        '16MNCR5': SEMENTASYON, '20MNCR5': SEMENTASYON, '18CRNIMO76': SEMENTASYON,
        '4130': ['Islah + soğuk çekilmiş (+QT+C)'], '4340': ['Islah + kabuk soyulmuş (+QT+SH)', 'Gerilim giderilmiş'], '300M': ['Gerilim giderilmiş'], D6AC: ['Gerilim giderilmiş'],
        '100CR6': ['Sıcak hadde (+AR)', 'Yumuşak tavlı (+A)'], '51CRV4': ['Islah (+QT)', 'Sıcak hadde (+AR)', 'Yumuşak tavlı (+A)'],
        '2379': TAKIM, '2344': TAKIM, '2083': TAKIM, '2510': TAKIM, '2842': TAKIM, '3343': TAKIM,
        '2311': ['Gerilim giderilmiş'], '2738': ['Ön sertleştirilmiş (~40 HRC)', 'Gerilim giderilmiş'],
        '304': OSTENIT, '304L': OSTENIT, '316': OSTENIT, '316L': OSTENIT,
        '303': ['Tavlanmış + soğuk çekilmiş (+AT+C)'], '316TI': ['Tavlanmış + soğuk çekilmiş (+AT+C)'], '321': ['Tavlanmış + soğuk çekilmiş (+AT+C)'], '310S': ['Soğuk çekilmiş'],
        '301': ['Soğuk sertleştirilmiş (+C1000)', 'Soğuk sertleştirilmiş (+C1150)', 'Soğuk sertleştirilmiş (+C1300)', '¼ sert (ASTM A666)', '½ sert (ASTM A666)', '¾ sert (ASTM A666)', 'Tam sert (ASTM A666)'],
        '420': ['Islah (+QT700)', 'Islah (+QT800)'], '431': ['Islah (+QT800)', 'Islah (+QT900)'],
        '174PH': PH, '155PH': PH,
        '2205': ['Soğuk çekilmiş', 'Tavlanmış + soğuk çekilmiş (+AT+C)'], '2507': ['Soğuk çekilmiş', 'Tavlanmış + soğuk çekilmiş (+AT+C)'],
        '1050': AL_SAF, '3003': AL_SAF, '5083': AL_MG, '5754': AL_MG,
        '6060': ['T1', 'T64'], '6063': ['T1', 'T64'], '6061': AL_6, '6082': AL_6,
        '2017A': ['T351', 'T3510', 'T3511', 'T451', 'T4510', 'T4511'],
        '2024': ['F (üretim hâli)', 'T3510', 'T3511', 'T42', 'T62', 'T81', 'T851'],
        '7075': ['T6510', 'T6511', 'T73510', 'T73511', 'T7352', 'T76', 'T7651', 'T76511', 'W (çözeltiye alınmış, kararsız)'],
        '7050': ['T74', 'T7452', 'T73511', 'T7651', 'T76511'],
        AC42100: ['T4', 'T5', 'T7'],
        CUETP: CU_SAF, CUOF: CU_SAF, CW614N: ['M (üretim hâli)', 'H04 (sert)'],
        GR1: TI_SAF, GR2: TI_SAF, GR4: TI_SAF, GR7: TI_SAF,
        GR5: ['Çözeltiye alınmış (ST)', 'Çift tavlı (duplex annealed)', 'Yeniden kristalleşme tavlı (RA)', 'Gerilim giderilmiş'],
        GR23: ['Yeniden kristalleşme tavlı (RA)', 'Gerilim giderilmiş'],
        A400: ['Sıcak işlenmiş', 'Gerilim giderilmiş'], A600: ['Sıcak işlenmiş', 'Gerilim giderilmiş'], A825: ['Sıcak işlenmiş', 'Gerilim giderilmiş'],
        A625: ['Soğuk çekilmiş', 'Sıcak işlenmiş'], C276: ['Sıcak işlenmiş'],
        A718: ['Çözeltiye alınmış + çift yaşlandırılmış', 'Yaşlandırılmış', 'Sıcak işlenmiş'],
        GJL200: GJL_EK, GJL250: GJL_EK, GJL300: GJL_EK,
        GJS400: GJS_EK, GJS500: GJS_EK, GJS600: GJS_EK, GJS700: GJS_EK
    };
})();

// GA kurulduktan sonra çağrılır; listesi olmayan (sınırsız) kaliteye dokunmaz, var olan seçeneği iki kez eklemez.
export function kaliteIzinleriniGenislet(izin: Sozluk<IzinliSecenek>): void {
    for (const [kod, l] of Object.entries(KALITE_DURUM_IZIN_EKLERI)) {
        const a = izin[kod]?.a;
        if (!a) continue;
        for (const d of l) if (!a.includes(d)) a.push(d);
    }
}
