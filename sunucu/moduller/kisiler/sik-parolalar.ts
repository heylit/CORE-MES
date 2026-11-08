// Parolanın kökü (Türkçe harfler sadeleşmiş, küçük harf, baştaki ve sondaki rakam ve işaretler atılmış) bu listedeyse parola
// kabul edilmez: "Galatasaray1905!", "parola2024", "Qwerty123456" ilk denenenlerdendir. Liste elle derlendi (genel sık parola
// kökleri, klavye dizileri, sık Türkçe sözcük ve adlar, iş yeri sözcükleri); dış kaynaktan indirilmez, paket değildir.
const KOKLER = `
password parola sifre sifrem sifreniz parolam gizli
qwerty qwertyui qwertyuiop qwertz asdf asdfgh asdfghjkl zxcvbn zxcvbnm qazwsx qazwsxedc wsxedc qweasd qweasdzxc
qwer qwert asdfg zxcv zxcvb poiuyt lkjhgf mnbvcx yxcvbnm qwertzuiop azerty azertyuiop wasd
abc abcd abcde abcdef abcdefg abcdefgh aaa aaaa aaaaa aaaaaa xxx xxxx xxxxx zzz zzzz
admin administrator root superuser sysadmin user kullanici yonetici yonetim misafir guest test deneme demo ornek
login giris girisyap oturum hesap hesabim sistem sistemim server sunucu master default varsayilan changeme degistir
welcome hosgeldin hosgeldiniz merhaba selam selamlar letmein iloveyou iloveu loveyou love lovely sevgi sevgilim
seviyorum seniseviyorum senisevdim askim asik ask canim canimsin hayatim bebegim bebek tatlim birtanem gulum
prenses prens princess prince angel melek melegim sunshine shadow monkey dragon master batman superman spiderman
football soccer baseball basketball hockey futbol basketbol voleybol tenis golf
galatasaray galatasaraylilar cimbom gs fenerbahce fener fb besiktas bjk karakartal trabzonspor trabzon ts bursaspor
goztepe karsiyaka altay kocaelispor sivasspor kayserispor konyaspor antalyaspor
istanbul ankara izmir bursa antalya adana konya kocaeli gebze manisa kayseri gaziantep mersin eskisehir samsun
trabzon diyarbakir denizli sakarya tekirdag balikesir hatay malatya erzurum van sivas aydin mugla
turkiye turkey turk turkum turkiyem ataturk mustafakemal kemal vatan millet bayrak ayyildiz
allah bismillah elhamdulillah mashallah masallah insallah inshallah subhanallah allahuekber muhammed
mehmet mustafa ahmet ali huseyin hasan ibrahim ismail osman yusuf omer murat emre burak can cem mert kemal ramazan
halil suleyman abdullah recep fatih serkan hakan erkan volkan gokhan orhan kadir yasin enes furkan eren kerem baris
ozan onur ugur umut tolga taner tuncay selim sinan cengiz ercan erdem levent kaan berk arda efe emir yigit
ayse fatma emine hatice zeynep elif meryem sultan zehra hulya esra merve busra kubra rabia ebru ozlem derya
sevgi aylin seda sibel gamze tugba ozge pinar burcu dilek gizem yasemin hande melis irem buse damla ece nur
annem babam anne baba ailem kardesim ablam abim oglum kizim esim karim kocam dedem ninem teyzem dayim amcam halam
ocak subat mart nisan mayis haziran temmuz agustos eylul ekim kasim aralik
january february march april may june july august september october november december
pazartesi sali carsamba persembe cuma cumartesi pazar monday tuesday wednesday thursday friday saturday sunday
ilkbahar yaz sonbahar kis bahar spring summer autumn winter
uretim fabrika atolye tezgah torna freze cnc makine makina operator planlama planlamaci kalite depo stok
muhasebe satinalma satis sevkiyat bakim muhendis teknisyen usta vardiya mesai isyeri sirket firma ofis
bilgisayar computer internet wifi modem telefon iphone samsung android windows microsoft google apple
hello hi hey secret private access trust freedom whatever nothing something
kirmizi mavi yesil sari siyah beyaz turuncu mor pembe gri lacivert
red blue green yellow black white orange purple pink
aslan kaplan kartal kurt tilki kedi kopek pamuk boncuk minnos karabas tarcin limon portakal elma cilek kiraz
lion tiger eagle wolf fox cat dog puppy kitty kitten
cocacola pepsi nutella cikolata chocolate cookie
starwars pokemon minecraft fortnite naruto matrix
dunya world gunes gunesli ay yildiz deniz denizli dag nehir gokyuzu
mutluluk mutlu huzur umut sabir basari zafer ozgurluk ozgur hurriyet baris
`;

export const SIK_PAROLA_KOKLERI: ReadonlySet<string> = new Set(KOKLER.split(/\s+/).filter(Boolean));

const SADELE: Record<string, string> = { ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' };

// Kök: Türkçe küçük harf, Türkçe harfler sadeleşir, sık yer değiştirmeler (0→o, 1→i, 3→e, 4→a, 5→s, @→a, $→s) yalnız kökün
// içinde açılır; baştaki ve sondaki rakam ve işaretler atılır, aradaki işaretler silinir.
export function parolaKoku(parola: string): string {
  const kucuk = parola.normalize('NFC').toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, (h) => SADELE[h] ?? h);
  const govde = kucuk.replace(/^[^a-z]+|[^a-z]+$/g, '');
  return govde.replace(/[0@4$5!1|3]/g, (h) => ({ '0': 'o', '@': 'a', '4': 'a', $: 's', '5': 's', '!': 'i', '1': 'i', '|': 'i', '3': 'e' })[h] ?? h)
    .replace(/[^a-z]/g, '');
}

// Kökü olmayan ya da kökü kısa kalan sık diziler bütün olarak (küçük harf, işaretsiz) karşılaştırılır.
const TAM_DIZILER: ReadonlySet<string> = new Set([
  '1234567890', '0123456789', '0987654321', '1122334455', '1qaz2wsx3edc', '1q2w3e4r5t', 'q1w2e3r4t5', 'zaq12wsx', 'qazwsx123',
  '1qazxsw2', 'qwerty1234', 'abc1234567', 'a1b2c3d4e5', '147258369', '159753', '741852963', '123qweasd', 'qwe123asd',
]);

// Kısa bir birimin art arda tekrarı ("1212121212", "123123123123", "abcabcabca") sık sayılır.
function kisaBirimTekrari(dizi: string): boolean {
  for (let boy = 1; boy <= 4 && boy < dizi.length; boy += 1) {
    if ([...dizi].every((h, i) => h === dizi[i % boy])) return true;
  }
  return false;
}

// Kök listede ya da listedeki bir kökün art arda tekrarıysa ("qwertyqwerty", "askimaskim") sık sayılır.
export function sikParolaMi(parola: string): boolean {
  const sade = parola.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (TAM_DIZILER.has(sade) || [...TAM_DIZILER].some((d) => d.length >= 8 && sade.startsWith(d)) || kisaBirimTekrari(sade)) return true;
  const kok = parolaKoku(parola);
  if (kok.length === 0) return false;
  if (SIK_PAROLA_KOKLERI.has(kok)) return true;
  for (let boy = 2; boy <= kok.length / 2; boy += 1) {
    if (kok.length % boy === 0 && SIK_PAROLA_KOKLERI.has(kok.slice(0, boy)) && kok === kok.slice(0, boy).repeat(kok.length / boy)) return true;
  }
  return false;
}
