#!/usr/bin/env bash
# Taşıma betiğinin provası: süper kullanıcının kurduğu (göçleri onun uyguladığı) atılacak bir veritabanında
# tasima.sql ve geri-al.sql koşulur; sahiplik, haklar ve bağlanma reddi psql çıkış koduyla doğrulanır.
# Roller önceden açılmış olmalıdır (kurulum.sql). Asıl ve test veritabanına dokunmaz.
# Ortam: VT_SUPER_USER, VT_SUPER_PASSWORD ve TMIV2_PG_* (uygulama ve göç kullanıcısı dahil).
# .env dosyası olmayan ağaçta koşar (CI, yerelde depo dışı kopya): göç koşusu deneme veritabanına yönlendirilir,
# .env görülen ağaçta ortam yükleyicisi bunu çelişki diye durdurur.
set -euo pipefail

: "${VT_SUPER_USER:?}" "${VT_SUPER_PASSWORD:?}" "${TMIV2_PG_HOST:?}" "${TMIV2_PG_PORT:?}"
: "${TMIV2_PG_USER:?}" "${TMIV2_PG_PASSWORD:?}" "${TMIV2_PG_GOC_USER:?}" "${TMIV2_PG_GOC_PASSWORD:?}"

PSQL="${PSQL:-psql}"
# İleti metinleri ASCII dışı harf taşır; karşılaştırma istemci kodlamasına bağlı kalmasın.
export PGCLIENTENCODING=UTF8
KOK="$(cd "$(dirname "$0")/../.." && pwd)"
DENEME=tmiv2_tasima_denemesi
KAPALI=tmiv2_kapali_denemesi
SAHIPLI=tmiv2_sahipli_denemesi
# Adı tmiv2_ ile başlamaz: asıl veritabanının (tmiv2) yerini tutar, ona dokunmadan.
BAYRAKLI=tmiv2x_bayrak_denemesi
ENGELLI=tmiv2_engelli_denemesi
UCUNCU=tmiv2_ucuncu_denemesi
CIKTI="$(mktemp)"
trap 'rm -f "$CIKTI"' EXIT

baglan() { # kullanıcı parola veritabanı [psql argümanları]
  local kullanici="$1" parola="$2" vt="$3"
  shift 3
  PGPASSWORD="$parola" "$PSQL" -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=verbose -h "$TMIV2_PG_HOST" -p "$TMIV2_PG_PORT" -U "$kullanici" -d "$vt" "$@"
}
super() { local vt="$1"; shift; baglan "$VT_SUPER_USER" "$VT_SUPER_PASSWORD" "$vt" "$@"; }
goc() { local vt="$1"; shift; baglan "$TMIV2_PG_GOC_USER" "$TMIV2_PG_GOC_PASSWORD" "$vt" "$@"; }
uygulama() { local vt="$1"; shift; baglan "$TMIV2_PG_USER" "$TMIV2_PG_PASSWORD" "$vt" "$@"; }

kabul() { # ad komut...
  local ad="$1"
  shift
  if ! "$@" >"$CIKTI" 2>&1; then
    echo "HATA: kabul edilmeliydi: $ad"
    cat "$CIKTI"
    exit 1
  fi
  echo "kabul: $ad"
}
# Ret, nedeniyle ölçülür: yanlış parola ya da ulaşılamayan sunucu da sıfırdan farklı çıkış kodu verir.
IZIN_YOK='ERROR:  42501:'
BAGLANAMAZ='FATAL:  permission denied for database'
red() { # ad beklenen-neden komut...
  local ad="$1" neden="$2" kod=0
  shift 2
  "$@" >"$CIKTI" 2>&1 || kod=$?
  if [ "$kod" -eq 0 ]; then
    echo "HATA: reddedilmeliydi: $ad"
    exit 1
  fi
  if ! grep -qF -- "$neden" "$CIKTI"; then
    echo "HATA: beklenen nedenle reddedilmedi: $ad (beklenen: $neden)"
    cat "$CIKTI"
    exit 1
  fi
  echo "red (psql çıkış kodu $kod): $ad: $(grep -m1 -F -- "$neden" "$CIKTI")"
}
tek_ileti() { # son komutun çıktısındaki tek "tamam" iletisi bu olmalı
  if [ "$(grep -c "tamam" "$CIKTI")" != "1" ] || ! grep -qxF -- "$1" "$CIKTI"; then
    echo "HATA: başarı iletisi tek ve '$1' olmalıydı"
    cat "$CIKTI"
    exit 1
  fi
}
dogru() { dogru_vt "$DENEME" "$@"; }
dogru_vt() { # veritabanı ad sql (tek satır, tek sütun; 't' beklenir)
  local vt="$1" ad="$2" sonuc
  shift
  sonuc="$(super "$vt" -At -c "$2")"
  if [ "$sonuc" != "t" ]; then
    echo "HATA: doğrulanamadı: $ad (sonuç: $sonuc)"
    exit 1
  fi
  echo "doğru: $ad"
}
goc_kos() { # göç kullanıcısı parola -> npm run goc, deneme veritabanında
  (cd "$KOK" && TMIV2_PG_DATABASE="$DENEME" TMIV2_PG_GOC_USER="$1" TMIV2_PG_GOC_PASSWORD="$2" npm run -s goc)
}

DIS="schemaname !~ '^pg_' AND schemaname <> 'information_schema'"
HEPSI_GOCUN="SELECT count(*) > 0 AND bool_and(tableowner = '$TMIV2_PG_GOC_USER') FROM pg_tables WHERE $DIS"
# PUBLIC'in (grantee 0) açık hakkı; hak listesi boşsa (hiç dokunulmamış nesne) varsayılanlar geçerlidir.
HERKES_VT="SELECT datacl IS NULL OR EXISTS (SELECT FROM aclexplode(datacl) a WHERE a.grantee = 0) FROM pg_database WHERE datname = current_database()"
HERKES_SEMA="SELECT nspacl IS NULL OR EXISTS (SELECT FROM aclexplode(nspacl) a WHERE a.grantee = 0) FROM pg_namespace WHERE nspname = 'public'"
hak() { # hak adı, beklenen toplama (bool_and | NOT bool_or), [ek süzgeç]
  echo "SELECT $2(has_table_privilege('$TMIV2_PG_USER', format('%I.%I', schemaname, tablename), '$1')) FROM pg_tables WHERE $DIS ${3:+AND $3}"
}
# Göç kaydı ayrı ölçülür: uygulama kullanıcısı yalnız okur.
KAYIT_HARIC="tablename <> 'goc_kaydi'"
KAYIT_YAZILIR="has_table_privilege('$TMIV2_PG_USER', 'public.goc_kaydi', 'INSERT, UPDATE, DELETE')"
KAYIT_SALT_OKUNUR="SELECT has_table_privilege('$TMIV2_PG_USER', 'public.goc_kaydi', 'SELECT') AND NOT $KAYIT_YAZILIR"

echo "== Hazırlık: süper kullanıcının kurduğu veritabanı"
super postgres -c "DROP DATABASE IF EXISTS $DENEME" -c "DROP DATABASE IF EXISTS $KAPALI" -c "DROP DATABASE IF EXISTS $SAHIPLI" -c "DROP DATABASE IF EXISTS $BAYRAKLI" -c "DROP DATABASE IF EXISTS $ENGELLI" -c "DROP ROLE IF EXISTS $UCUNCU"
super postgres -c "CREATE DATABASE $DENEME" -c "CREATE DATABASE $KAPALI" -c "REVOKE CONNECT ON DATABASE $KAPALI FROM PUBLIC"
kabul "göçleri süper kullanıcı uygular" goc_kos "$VT_SUPER_USER" "$VT_SUPER_PASSWORD"
super "$DENEME" <<'SQL'
INSERT INTO kisi (ad) VALUES ('Tasima Deneme');
CREATE SEQUENCE tek_basina_sayac;
CREATE TABLE serili (id serial PRIMARY KEY);
CREATE SCHEMA t_artik_1_aaaaaaaaaaaa;
CREATE TABLE t_artik_1_aaaaaaaaaaaa.kalem (id int);
SQL
red "taşımadan önce göç kullanıcısı tabloyu değiştiremez" "$IZIN_YOK" goc "$DENEME" -c "ALTER TABLE kisi ADD COLUMN deneme int"

echo "== Sahibi uygulama rolü olan veritabanı reddedilir"
super postgres -c "CREATE DATABASE $SAHIPLI OWNER $TMIV2_PG_USER"
DOKUNULMADI="SELECT nspowner = 'pg_database_owner'::regrole AND NOT EXISTS (SELECT FROM pg_default_acl) FROM pg_namespace WHERE nspname = 'public'"
for betik in kurulum tasima; do
  red "$betik.sql, sahibi uygulama rolü olan veritabanında" "Veritabanının sahibi süper kullanıcı ya da tmiv2_goc olmalı"     super "$SAHIPLI" -1 -f "$KOK/araclar/vt/$betik.sql"
done
dogru_vt "$SAHIPLI" "reddedilen koşu veritabanına dokunmadı" "$DOKUNULMADI"

echo "== t_semalarini_sil test veritabanı dışında reddedilir"
super postgres -c "CREATE DATABASE $BAYRAKLI"
super "$BAYRAKLI" -c "CREATE SCHEMA t_gercek_veri" -c "CREATE TABLE t_gercek_veri.kalem (id int)"
red "tasima.sql, adı tmiv2_ ile başlamayan veritabanında t_semalarini_sil ile" "t_semalarini_sil yalnız test veritabanında" super "$BAYRAKLI" -1 -v t_semalarini_sil=1 -f "$KOK/araclar/vt/tasima.sql"
dogru_vt "$BAYRAKLI" "reddedilen koşu t_ şemasını silmedi" "SELECT to_regclass('t_gercek_veri.kalem') IS NOT NULL"

echo "== Yarıda kalan taşıma bütünüyle geri alınır ve tamam demez"
super postgres -c "CREATE ROLE $UCUNCU" -c "CREATE DATABASE $ENGELLI"
super "$ENGELLI" -c "CREATE TABLE baskasinin (id int)" -c "ALTER TABLE baskasinin OWNER TO $UCUNCU"
red "tasima.sql, başka rolün tablosu varken" "Sahibi tmiv2_goc olmayan nesne kaldı" super "$ENGELLI" -1 -f "$KOK/araclar/vt/tasima.sql"
if grep -q "tamam" "$CIKTI"; then
  echo "HATA: geri alınan koşu 'tamam' dedi"
  cat "$CIKTI"
  exit 1
fi
dogru_vt "$ENGELLI" "yarıda kalan taşıma veritabanına dokunmadı" "$DOKUNULMADI"
# Uzantı istisnası yalnız izin listesindeki uzantının kendi nesnesidir: uzantı dışında başka rolün tipi ve listede olmayan
# uzantının süper kullanıcıda kalan tipi taşımayı yine durdurur.
super "$ENGELLI" -c "DROP TABLE baskasinin" -c "CREATE TYPE baskasinin_tipi AS ENUM ('a')" -c "ALTER TYPE baskasinin_tipi OWNER TO $UCUNCU"
red "tasima.sql, uzantı dışında başka rolün tipi varken" "Sahibi tmiv2_goc olmayan nesne kaldı: tip baskasinin_tipi" super "$ENGELLI" -1 -f "$KOK/araclar/vt/tasima.sql"
super "$ENGELLI" -c "DROP TYPE baskasinin_tipi" -c "CREATE EXTENSION citext"
red "tasima.sql, izin listesinde olmayan uzantının nesnesi kalınca" "Sahibi tmiv2_goc olmayan nesne kaldı: tip citext" super "$ENGELLI" -1 -f "$KOK/araclar/vt/tasima.sql"
dogru_vt "$ENGELLI" "reddedilen koşular veritabanına dokunmadı" "$DOKUNULMADI"

echo "== Taşıma (iki kez: yeniden koşulabilir)"
for tur in 1 2; do
  kabul "tasima.sql, koşu $tur" super "$DENEME" -1 -v t_semalarini_sil=1 -f "$KOK/araclar/vt/tasima.sql"
  tek_ileti "Taşıma tamam: $DENEME"
done
dogru "bütün tabloların sahibi göç kullanıcısı" "$HEPSI_GOCUN"
dogru "public şemasının sahibi göç kullanıcısı" "SELECT nspowner = '$TMIV2_PG_GOC_USER'::regrole FROM pg_namespace WHERE nspname = 'public'"
dogru "artık t_ şeması kalmadı" "SELECT NOT EXISTS (SELECT FROM pg_namespace WHERE left(nspname, 2) = 't_')"
dogru "veri yerinde" "SELECT count(*) = 1 FROM kisi WHERE ad = 'Tasima Deneme'"
dogru "pg_trgm kurulu ve süper kullanıcıda kalan tipi taşımayı durdurmadı" "SELECT EXISTS (SELECT FROM pg_extension WHERE extname = 'pg_trgm') AND EXISTS (SELECT FROM pg_type WHERE typname = 'gtrgm' AND typowner <> '$TMIV2_PG_GOC_USER'::regrole)"
dogru "uygulama kullanıcısı her tabloda SELECT yapar" "$(hak SELECT bool_and)"
for h in INSERT UPDATE DELETE; do dogru "uygulama kullanıcısı göç kaydı dışında her tabloda $h yapar" "$(hak "$h" bool_and "$KAYIT_HARIC")"; done
dogru "taşımadan sonra uygulama kullanıcısı göç kaydını okur, yazma hakkı yok" "$KAYIT_SALT_OKUNUR"
for h in TRUNCATE REFERENCES TRIGGER; do dogru "uygulama kullanıcısının hiçbir tabloda $h hakkı yok" "$(hak "$h" 'NOT bool_or')"; done
dogru "veritabanında PUBLIC'in hakkı kalmadı" "SELECT NOT ($HERKES_VT)"
dogru "public şemasında PUBLIC'in hakkı kalmadı" "SELECT NOT ($HERKES_SEMA)"
dogru "göç kullanıcısı süper kullanıcı değil" "SELECT NOT rolsuper AND NOT rolcreatedb AND NOT rolcreaterole FROM pg_roles WHERE rolname = '$TMIV2_PG_GOC_USER'"
dogru "göç kullanıcısının kapalı veritabanına bağlanma hakkı yok" "SELECT NOT has_database_privilege('$TMIV2_PG_GOC_USER', '$KAPALI', 'CONNECT')"

echo "== Taşımadan sonra davranış"
red "göç kullanıcısı bağlanma hakkı alınmış veritabanına bağlanamaz" "$BAGLANAMAZ" goc "$KAPALI" -c "SELECT 1"
red "uygulama kullanıcısı bağlanma hakkı alınmış veritabanına bağlanamaz" "$BAGLANAMAZ" uygulama "$KAPALI" -c "SELECT 1"
kabul "göç kullanıcısı taşınan tabloyu değiştirir ve yeni tablo açar" goc "$DENEME" \
  -c "ALTER TABLE kisi ADD COLUMN deneme int" -c "ALTER TABLE kisi DROP COLUMN deneme" \
  -c "CREATE TABLE tasima_sonrasi (id serial PRIMARY KEY, ad text NOT NULL)"
kabul "uygulama kullanıcısı taşınan ve yeni tabloda okur ve yazar" uygulama "$DENEME" \
  -c "INSERT INTO tasima_sonrasi (ad) VALUES ('a')" -c "UPDATE tasima_sonrasi SET ad = 'b'" -c "DELETE FROM tasima_sonrasi" \
  -c "INSERT INTO kisi (ad) VALUES ('Uygulama Deneme')" -c "UPDATE kisi SET ad = 'Uygulama Deneme 2' WHERE ad = 'Uygulama Deneme'" \
  -c "DELETE FROM kisi WHERE ad = 'Uygulama Deneme 2'" -c "SELECT count(*) FROM goc_kaydi" -c "SELECT nextval('tek_basina_sayac')" \
  -c "INSERT INTO serili DEFAULT VALUES"
red "uygulama kullanıcısı tablo düşüremez" "$IZIN_YOK" uygulama "$DENEME" -c "DROP TABLE kisi CASCADE"
red "uygulama kullanıcısı tablo değiştiremez" "$IZIN_YOK" uygulama "$DENEME" -c "ALTER TABLE kisi ADD COLUMN deneme int"
red "uygulama kullanıcısı tetikleyici kapatamaz" "$IZIN_YOK" uygulama "$DENEME" -c "ALTER TABLE denetim_kaydi DISABLE TRIGGER ALL"
red "uygulama kullanıcısı tetikleyici düşüremez" "$IZIN_YOK" uygulama "$DENEME" -c "DROP TRIGGER denetim_kaydi_degismez ON denetim_kaydi"
red "uygulama kullanıcısı tablo boşaltamaz" "$IZIN_YOK" uygulama "$DENEME" -c "TRUNCATE denetim_kaydi"
red "uygulama kullanıcısı tablo açamaz" "$IZIN_YOK" uygulama "$DENEME" -c "CREATE TABLE uygulamanin (id int)"
for sql in "INSERT INTO goc_kaydi (ad, ozet) VALUES ('uygulamanin.sql', 'x')" "UPDATE goc_kaydi SET ozet = 'x'" "DELETE FROM goc_kaydi"; do
  red "uygulama kullanıcısı göç kaydına yazamaz" "$IZIN_YOK" uygulama "$DENEME" -c "$sql"
done
# Var olan kurulum: göç kaydı, yazma hakkı verilmişken açılmıştır; hakkı uygulanacak göç olmayan koşu da geri alır.
goc "$DENEME" -c "GRANT INSERT, UPDATE, DELETE ON goc_kaydi TO \"$TMIV2_PG_USER\""
dogru "göç koşusundan önce uygulama kullanıcısının göç kaydında yazma hakkı var" "SELECT $KAYIT_YAZILIR"
kabul "göç kullanıcısı npm run goc koşar" goc_kos "$TMIV2_PG_GOC_USER" "$TMIV2_PG_GOC_PASSWORD"
grep -q "Uygulanacak göç yok." "$CIKTI" || { echo "HATA: taşımadan sonra göç kaydı okunamadı"; cat "$CIKTI"; exit 1; }
dogru "göç koşusundan sonra uygulama kullanıcısı göç kaydını okur, yazma hakkı yok" "$KAYIT_SALT_OKUNUR"
red "göç koşusundan sonra uygulama kullanıcısı göç kaydına yazamaz" "$IZIN_YOK" uygulama "$DENEME" -c "DELETE FROM goc_kaydi"

echo "== Geri alma (iki kez) ve yeniden taşıma"
for tur in 1 2; do
  kabul "geri-al.sql, koşu $tur" super "$DENEME" -1 -f "$KOK/araclar/vt/geri-al.sql"
  tek_ileti "Geri alma tamam: $DENEME"
done
dogru "sahiplik süper kullanıcıya döndü" "SELECT bool_and(tableowner = '$VT_SUPER_USER') FROM pg_tables WHERE $DIS"
dogru "uygulama kullanıcısının tablo hakkı kalmadı" "$(hak SELECT 'NOT bool_or')"
# Geri alma betiğinin başlığı bu ikisine yaslanır: uygulama rolü hakkıyla durur, göç rolünün bağı kalmaz.
dogru "uygulama rolünün bağlanma hakkı yerinde (rol bu yüzden silinemez)" "SELECT EXISTS (SELECT FROM pg_database d, aclexplode(d.datacl) a WHERE d.datname = current_database() AND a.grantee = '$TMIV2_PG_USER'::regrole)"
dogru "göç rolünün bu veritabanında hakkı ve nesnesi kalmadı" "SELECT NOT EXISTS (SELECT FROM pg_shdepend s JOIN pg_database d ON d.oid = s.dbid OR s.dbid = 0 WHERE d.datname = current_database() AND s.refobjid = '$TMIV2_PG_GOC_USER'::regrole AND (s.dbid <> 0 OR s.objid = d.oid))"
dogru "veritabanı yeniden herkese açık" "$HERKES_VT"
dogru "public şeması yeniden herkese açık" "$HERKES_SEMA"
dogru "göç kullanıcısının varsayılan yetkisi kalmadı" "SELECT NOT EXISTS (SELECT FROM pg_default_acl WHERE defaclrole = '$TMIV2_PG_GOC_USER'::regrole)"
red "geri almadan sonra göç kullanıcısı tabloyu değiştiremez" "$IZIN_YOK" goc "$DENEME" -c "ALTER TABLE kisi ADD COLUMN deneme int"
kabul "geri almadan sonra yeniden taşıma" super "$DENEME" -1 -f "$KOK/araclar/vt/tasima.sql"
dogru "bütün tabloların sahibi yeniden göç kullanıcısı" "$HEPSI_GOCUN"
kabul "yeniden taşımadan sonra uygulama kullanıcısı yazar" uygulama "$DENEME" -c "INSERT INTO kisi (ad) VALUES ('Son Deneme')"

super postgres -c "DROP DATABASE $DENEME" -c "DROP DATABASE $KAPALI" -c "DROP DATABASE $SAHIPLI" -c "DROP DATABASE $BAYRAKLI" -c "DROP DATABASE $ENGELLI" -c "DROP ROLE $UCUNCU"
echo "Taşıma denemesi tamam."
