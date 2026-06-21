import { PrismaPg } from "@prisma/adapter-pg";
import { GeoSettlementType, PrismaClient } from "@prisma/client";
import "dotenv/config";

const connectionString = process.env["DATABASE_URL"];
if (!connectionString) {
  throw new Error("DATABASE_URL environment variable is not set");
}
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

interface LocalizedName {
  che?: string;
  ru: string;
  en: string;
}

interface SettlementSeed {
  name: LocalizedName;
  type: GeoSettlementType;
}

interface DistrictSeed {
  name: LocalizedName;
  settlements: SettlementSeed[];
}

interface RegionSeed {
  name: LocalizedName;
  districts: DistrictSeed[];
}

interface CountrySeed {
  code: string;
  name: LocalizedName;
  regions: RegionSeed[];
}

const GEO_DATA: CountrySeed[] = [
  {
    code: "RU",
    name: { che: "Росси", ru: "Россия", en: "Russia" },
    regions: [
      {
        name: { che: "Нохчийчоь", ru: "Чеченская Республика", en: "Chechen Republic" },
        districts: [
          {
            name: { che: "Соьлжа-ГIалин район", ru: "Грозненский район", en: "Grozny District" },
            settlements: [
              { name: { che: "Соьлжа-ГIала", ru: "Грозный", en: "Grozny" }, type: GeoSettlementType.city },
              { name: { che: "Іалхан-ГIала", ru: "Алхан-Кала", en: "Alkhan-Kala" }, type: GeoSettlementType.village },
              { name: { che: "Беркат-Йурт", ru: "Беркат-Юрт", en: "Berkat-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Девкар-Эвла", ru: "Толстой-Юрт", en: "Tolstoy-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Галне", ru: "Кень-Юрт", en: "Ken-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Горячеисточненская", ru: "Горячеисточненская", en: "Goryacheistochnenskaya" }, type: GeoSettlementType.village },
              { name: { che: "Петропавловская", ru: "Петропавловская", en: "Petropavlovskaya" }, type: GeoSettlementType.village },
              { name: { ru: "Виноградное", en: "Vinogradnoe" }, type: GeoSettlementType.village },
              { name: { ru: "Октябрьское", en: "Oktyabrskoe" }, type: GeoSettlementType.village },
              { name: { ru: "Правобережное", en: "Pravoberezhnoye" }, type: GeoSettlementType.village },
              { name: { ru: "Ильиновская", en: "Ilinovskaya" }, type: GeoSettlementType.village },
              { name: { ru: "Газгородок", en: "Gazgorodok" }, type: GeoSettlementType.village },
              { name: { ru: "Пригородное", en: "Prigorodnoe" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Шелан район", ru: "Шалинский район", en: "Shali District" },
            settlements: [
              { name: { che: "Шела", ru: "Шали", en: "Shali" }, type: GeoSettlementType.city },
              { name: { che: "Эвтара", ru: "Автуры", en: "Avtury" }, type: GeoSettlementType.village },
              { name: { che: "Эгlашта", ru: "Агишты", en: "Agishty" }, type: GeoSettlementType.village },
              { name: { che: "БелгIатой-Эвла", ru: "Белгатой", en: "Belgatoy" }, type: GeoSettlementType.village },
              { name: { che: "Гермчига", ru: "Герменчук", en: "Germenchuk" }, type: GeoSettlementType.village },
              { name: { che: "Дубин-Эвла", ru: "Дуба-Юрт", en: "Duba-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Мескар-Эвла", ru: "Мескер-Юрт", en: "Mesker-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Жима АтагIа", ru: "Новые Атаги", en: "Novye Atagi" }, type: GeoSettlementType.village },
              { name: { che: "Сиржа-Эвла", ru: "Сержень-Юрт", en: "Serzhen-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Чуьра-Эвла", ru: "Чири-Юрт", en: "Chiri-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Цацан-Эвла", ru: "Цацан-Юрт", en: "Tstatsan-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Йоккха АтагIа", ru: "Старые Атаги", en: "Starye Atagi" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Гудермесан район", ru: "Гудермесский район", en: "Gudermes District" },
            settlements: [
              { name: { che: "Гуьмсе", ru: "Гудермес", en: "Gudermes" }, type: GeoSettlementType.city },
              { name: { che: "Азамат-Йурт", ru: "Азамат-Юрт", en: "Azamat-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Боргlане", ru: "Брагуны", en: "Bragun" }, type: GeoSettlementType.village },
              { name: { che: "Гезлой-Эвла", ru: "Герзель-Аул", en: "Gerzel-Aul" }, type: GeoSettlementType.village },
              { name: { che: "Дарбанхи", ru: "Дарбанхи", en: "Darbankhi" }, type: GeoSettlementType.village },
              { name: { che: "Джалка", ru: "Джалка", en: "Dzhalka" }, type: GeoSettlementType.village },
              { name: { che: "Ишхой-Йурт", ru: "Ишхой-Юрт", en: "Iskhoy-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Кlеди-Йурт", ru: "Кади-Юрт", en: "Kadi-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Боти-Йурт", ru: "Комсомольское", en: "Komsomolskoye" }, type: GeoSettlementType.village },
              { name: { che: "Берза-Боьра", ru: "Кошкельды", en: "Koshkeldy" }, type: GeoSettlementType.village },
              { name: { che: "Мелчхе", ru: "Мелчхи", en: "Melchkhi" }, type: GeoSettlementType.village },
              { name: { che: "Ойсхар", ru: "Ойсхара", en: "Oyskhar" }, type: GeoSettlementType.village },
              { name: { che: "Хьаьнгаш-Йурт", ru: "Хангиш-Юрт", en: "Khangish-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Энгал-Йурт", ru: "Энгель-Юрт", en: "Engel-Yurt" }, type: GeoSettlementType.village },
              { name: { ru: "Новый Энгеной", en: "Novy Enghenoy" }, type: GeoSettlementType.village },
              { name: { ru: "Шуани", en: "Shuani" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Урус-Мартанан район", ru: "Урус-Мартановский район", en: "Urus-Martan District" },
            settlements: [
              { name: { che: "Хьалха-Марта", ru: "Урус-Мартан", en: "Urus-Martan" }, type: GeoSettlementType.city },
              { name: { che: "Олхазар-КIотар", ru: "Алхазурово", en: "Alkhazurovo" }, type: GeoSettlementType.village },
              { name: { che: "Іалхан-Йурт", ru: "Алхан-Юрт", en: "Alkhan-Yurt" }, type: GeoSettlementType.village },
              { name: { ru: "Гехи", en: "Gekhi" }, type: GeoSettlementType.village },
              { name: { che: "Гихчу", ru: "Гехи-Чу", en: "Gekhi-Chu" }, type: GeoSettlementType.village },
              { name: { che: "ГIойтIа", ru: "Гойты", en: "Goity" }, type: GeoSettlementType.village },
              { name: { che: "ГIой-Чу", ru: "Гой-Чу", en: "Goy-Chu" }, type: GeoSettlementType.village },
              { name: { che: "ГIой-Йиста", ru: "Гойское", en: "Goyskoye" }, type: GeoSettlementType.village },
              { name: { che: "Мартан-Чу", ru: "Мартан-Чу", en: "Martan-Chu" }, type: GeoSettlementType.village },
              { name: { che: "Роьшни-Чу", ru: "Рошни-Чу", en: "Roshni-Chu" }, type: GeoSettlementType.village },
              { name: { che: "Таьнги-Чу", ru: "Танги-Чу", en: "Tangi-Chu" }, type: GeoSettlementType.village },
              { name: { che: "Шалажа", ru: "Шалажи", en: "Shalazhi" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Надтеречан район", ru: "Надтеречный район", en: "Nadterechny District" },
            settlements: [
              { name: { che: "ЧIулга-Юрт", ru: "Знаменское", en: "Znamenskoye" }, type: GeoSettlementType.village },
              { name: { che: "Іелин-Юрт", ru: "Гвардейское", en: "Gvardeyskoe" }, type: GeoSettlementType.village },
              { name: { che: "ТIеман-Борзе", ru: "Горагорск", en: "Goragorsk" }, type: GeoSettlementType.village },
              { name: { che: "Бена-Йурт", ru: "Бено-Юрт", en: "Beno-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Лакха-Нёвре", ru: "Верхний Наур", en: "Verkhniy Naur" }, type: GeoSettlementType.village },
              { name: { che: "Макане", ru: "Мекен-Юрт", en: "Meken-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Лаха Нёвре", ru: "Надтеречное", en: "Nadterechnoye" }, type: GeoSettlementType.village },
              { name: { che: "Аьчка-ХитIе", ru: "Зебир-Юрт", en: "Zebir-Yurt" }, type: GeoSettlementType.village },
              { name: { ru: "Братское", en: "Bratskoye" }, type: GeoSettlementType.village },
              { name: { ru: "Калаус", en: "Kalaus" }, type: GeoSettlementType.village },
              { name: { ru: "Комарово", en: "Komarovo" }, type: GeoSettlementType.village },
              { name: { ru: "Подгорное", en: "Podgornoye" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Новр-гlалан район", ru: "Наурский район", en: "Naur District" },
            settlements: [
              { name: { che: "Новр-гlала", ru: "Наурская", en: "Naurskaya" }, type: GeoSettlementType.city },
              { name: { ru: "Алпатово", en: "Alpatovo" }, type: GeoSettlementType.village },
              { name: { ru: "Дальнее", en: "Dalneye" }, type: GeoSettlementType.village },
              { name: { ru: "Ищерская", en: "Ishcherskaya" }, type: GeoSettlementType.village },
              { name: { ru: "Калиновская", en: "Kalinovskaya" }, type: GeoSettlementType.village },
              { name: { ru: "Мекенская", en: "Mekenskaya" }, type: GeoSettlementType.village },
              { name: { ru: "Николаевская", en: "Nikolayevskaya" }, type: GeoSettlementType.village },
              { name: { ru: "Новый Терек", en: "Novy Terek" }, type: GeoSettlementType.village },
              { name: { ru: "Рубежное", en: "Rubezhnoe" }, type: GeoSettlementType.village },
              { name: { ru: "Савельевская", en: "Savelyevskaya" }, type: GeoSettlementType.village },
              { name: { ru: "Свободное", en: "Svobodnoye" }, type: GeoSettlementType.village },
              { name: { ru: "Ульяновское", en: "Ulyanovskoye" }, type: GeoSettlementType.village },
              { name: { ru: "Фрунзенское", en: "Frunzenskoye" }, type: GeoSettlementType.village },
              { name: { ru: "Чернокозово", en: "Chernokozovo" }, type: GeoSettlementType.village },
              { name: { ru: "Юбилейное", en: "Yubileynoye" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Нажи-Йуртан район", ru: "Ножай-Юртовский район", en: "Nozhai-Yurt District" },
            settlements: [
              { name: { che: "Нажи-Йурт", ru: "Ножай-Юрт", en: "Nozhai-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Іалара", ru: "Аллерой", en: "Alleroi" }, type: GeoSettlementType.village },
              { name: { ru: "Алхан-Хутор", en: "Alkhan-Khutor" }, type: GeoSettlementType.village },
              { name: { ru: "Байтарки", en: "Baytarki" }, type: GeoSettlementType.village },
              { name: { ru: "Балансу", en: "Balansu" }, type: GeoSettlementType.village },
              { name: { ru: "Бас-Гордали", en: "Bas-Gordali" }, type: GeoSettlementType.village },
              { name: { che: "Бена", ru: "Беной", en: "Benoy" }, type: GeoSettlementType.village },
              { name: { ru: "Беной-Ведено", en: "Benoy-Vedeno" }, type: GeoSettlementType.village },
              { name: { ru: "Бетти-Мохк", en: "Betti-Mokhk" }, type: GeoSettlementType.village },
              { name: { ru: "Бильты", en: "Bilty" }, type: GeoSettlementType.village },
              { name: { ru: "Галайты", en: "Galaity" }, type: GeoSettlementType.village },
              { name: { ru: "Гансолчу", en: "Gansolchu" }, type: GeoSettlementType.village },
              { name: { ru: "Гендерген", en: "Gendergen" }, type: GeoSettlementType.village },
              { name: { ru: "Гиляны", en: "Gilyany" }, type: GeoSettlementType.village },
              { name: { ru: "Гордали", en: "Gordali" }, type: GeoSettlementType.village },
              { name: { ru: "Гуржи-Мохк", en: "Gurzhi-Mokhk" }, type: GeoSettlementType.village },
              { name: { ru: "Даттах", en: "Dattakh" }, type: GeoSettlementType.village },
              { name: { ru: "Денги-Юрт", en: "Dengi-Yurt" }, type: GeoSettlementType.village },
              { name: { ru: "Замай-Юрт", en: "Zamay-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Зандакъ", ru: "Зандак", en: "Zandak" }, type: GeoSettlementType.village },
              { name: { ru: "Зандак-Ара", en: "Zandak-Ara" }, type: GeoSettlementType.village },
              { name: { ru: "Исай-Юрт", en: "Isai-Yurt" }, type: GeoSettlementType.village },
              { name: { ru: "Корен-Беной", en: "Koren-Benoy" }, type: GeoSettlementType.village },
              { name: { ru: "Мехкешты", en: "Mekhkeshty" }, type: GeoSettlementType.village },
              { name: { ru: "Ожи-Юрт", en: "Ozhi-Yurt" }, type: GeoSettlementType.village },
              { name: { ru: "Пачу", en: "Pachu" }, type: GeoSettlementType.village },
              { name: { che: "Сесана", ru: "Саясан", en: "Sayasan" }, type: GeoSettlementType.village },
              { name: { ru: "Симсир", en: "Simsir" }, type: GeoSettlementType.village },
              { name: { ru: "Согунты", en: "Sogunt" }, type: GeoSettlementType.village },
              { name: { ru: "Стерч-Керч", en: "Sterch-Kerch" }, type: GeoSettlementType.village },
              { name: { che: "ЦIоьнтара", ru: "Центарой", en: "Tsentaroy" }, type: GeoSettlementType.village },
              { name: { ru: "Чечель-Хи", en: "Chechel-Khi" }, type: GeoSettlementType.village },
              { name: { ru: "Шовхал-Берды", en: "Shovkhal-Berdy" }, type: GeoSettlementType.village },
              { name: { ru: "Энгеной", en: "Enghenoy" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Итон-Кхаьллан район", ru: "Итум-Калинский район", en: "Itum-Kali District" },
            settlements: [
              { name: { che: "Итон-Кхаьлла", ru: "Итум-Кали", en: "Itum-Kali" }, type: GeoSettlementType.village },
              { name: { che: "БугIара", ru: "Бугарой", en: "Bugaroy" }, type: GeoSettlementType.village },
              { name: { che: "Виедача", ru: "Ведучи", en: "Veduchi" }, type: GeoSettlementType.village },
              { name: { che: "ГутIа", ru: "Гухой", en: "Gukhoy" }, type: GeoSettlementType.village },
              { name: { che: "Гучан-Кхелли", ru: "Гучум-Кали", en: "Guchum-Kali" }, type: GeoSettlementType.village },
              { name: { che: "Кхокхада", ru: "Кокадой", en: "Kokadoy" }, type: GeoSettlementType.village },
              { name: { che: "ЧIаьнта", ru: "Тазбичи", en: "Tazbichi" }, type: GeoSettlementType.village },
              { name: { che: "Тусхара", ru: "Тусхарой", en: "Tuskharoy" }, type: GeoSettlementType.village },
              { name: { che: "ЧIиннах", ru: "Чиннах", en: "Chinnakh" }, type: GeoSettlementType.village },
              { name: { ru: "Баулой", en: "Bauloy" }, type: GeoSettlementType.village },
              { name: { ru: "Гезах", en: "Gezakh" }, type: GeoSettlementType.village },
              { name: { ru: "Зумсой", en: "Zumsoy" }, type: GeoSettlementType.village },
              { name: { ru: "Кенахо", en: "Kenakho" }, type: GeoSettlementType.village },
              { name: { ru: "Конжухой", en: "Konzhukhoy" }, type: GeoSettlementType.village },
              { name: { ru: "Моцкарой", en: "Motskaroy" }, type: GeoSettlementType.village },
              { name: { ru: "Мулкой", en: "Mulkoy" }, type: GeoSettlementType.village },
              { name: { ru: "Хилдехарой", en: "Khildekharoy" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Веданский район", ru: "Веденский район", en: "Vedeno District" },
            settlements: [
              { name: { che: "Ведана", ru: "Ведено", en: "Vedeno" }, type: GeoSettlementType.village },
              { name: { che: "Эгlашбета", ru: "Агишбатой", en: "Agishbatoy" }, type: GeoSettlementType.village },
              { name: { ru: "Белгатой", en: "Belgatoy" }, type: GeoSettlementType.village },
              { name: { che: "ДаьргIа", ru: "Дарго", en: "Dargo" }, type: GeoSettlementType.village },
              { name: { che: "Гуьна", ru: "Гуни", en: "Guni" }, type: GeoSettlementType.village },
              { name: { ru: "Марзой-Мохк", en: "Marzoy-Mokhk" }, type: GeoSettlementType.village },
              { name: { che: "Махкатlе", ru: "Махкеты", en: "Makhkety" }, type: GeoSettlementType.village },
              { name: { ru: "Меседой", en: "Mesedoy" }, type: GeoSettlementType.village },
              { name: { che: "Макажа", ru: "Макажой", en: "Makazhoy" }, type: GeoSettlementType.village },
              { name: { ru: "Ригахой", en: "Rigakhoy" }, type: GeoSettlementType.village },
              { name: { che: "Селман-Тевзана", ru: "Сельментаузен", en: "Selmentauzen" }, type: GeoSettlementType.village },
              { name: { che: "Хорача", ru: "Харачой", en: "Kharachoy" }, type: GeoSettlementType.village },
              { name: { che: "Хоттане", ru: "Хаттуни", en: "Khattuni" }, type: GeoSettlementType.village },
              { name: { che: "Хуо", ru: "Хой", en: "Khoy" }, type: GeoSettlementType.village },
              { name: { che: "Элистанжа", ru: "Элистанжи", en: "Elistanzhi" }, type: GeoSettlementType.village },
              { name: { che: "Кlоьзана", ru: "Кезеной", en: "Kezenoy" }, type: GeoSettlementType.village },
              { name: { ru: "Ихарой", en: "Ikharoy" }, type: GeoSettlementType.village },
              { name: { ru: "Кулинхой", en: "Kulinkhoy" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Шуьйтан район", ru: "Шатойский район", en: "Shatoy District" },
            settlements: [
              { name: { che: "Шуьйта", ru: "Шатой", en: "Shatoy" }, type: GeoSettlementType.village },
              { name: { che: "Лакха-Варанда", ru: "Большие Варанды", en: "Bolshiye Varandy" }, type: GeoSettlementType.village },
              { name: { ru: "Борзой", en: "Borzoy" }, type: GeoSettlementType.village },
              { name: { ru: "Вашиндарой", en: "Vashindaroy" }, type: GeoSettlementType.village },
              { name: { ru: "Высокогорное", en: "Vysokogornoye" }, type: GeoSettlementType.village },
              { name: { ru: "Вярды", en: "Vyardy" }, type: GeoSettlementType.village },
              { name: { ru: "Горгачи", en: "Gorgachi" }, type: GeoSettlementType.village },
              { name: { che: "ДIай", ru: "Дай", en: "Day" }, type: GeoSettlementType.village },
              { name: { ru: "Дачу-Борзой", en: "Dachu-Borzoy" }, type: GeoSettlementType.village },
              { name: { ru: "Зоны", en: "Zony" }, type: GeoSettlementType.village },
              { name: { ru: "Лаха-Варанды", en: "Lakha-Varandy" }, type: GeoSettlementType.village },
              { name: { ru: "Малый Харсеной", en: "Maly Kharsenoy" }, type: GeoSettlementType.village },
              { name: { ru: "Мускали", en: "Muskali" }, type: GeoSettlementType.village },
              { name: { ru: "Нихалой", en: "Nikhaloy" }, type: GeoSettlementType.village },
              { name: { che: "Пхьаьмта", ru: "Памятой", en: "Pamatoy" }, type: GeoSettlementType.village },
              { name: { ru: "Рядухой", en: "Ryadukhoy" }, type: GeoSettlementType.village },
              { name: { ru: "Саной", en: "Sanoy" }, type: GeoSettlementType.village },
              { name: { ru: "Сатти", en: "Satti" }, type: GeoSettlementType.village },
              { name: { che: "Тумса", ru: "Тумсой", en: "Tumsoy" }, type: GeoSettlementType.village },
              { name: { ru: "Улус-Керт", en: "Ulus-Kert" }, type: GeoSettlementType.village },
              { name: { ru: "Урдюхой", en: "Urdyukhoy" }, type: GeoSettlementType.village },
              { name: { che: "Хьакка", ru: "Хаккой", en: "Khakkoy" }, type: GeoSettlementType.village },
              { name: { ru: "Хал-Келой", en: "Khal-Keloy" }, type: GeoSettlementType.village },
              { name: { che: "Хьорсана", ru: "Харсеной", en: "Kharsenoy" }, type: GeoSettlementType.village },
              { name: { che: "ЧIишка", ru: "Чишки", en: "Chishki" }, type: GeoSettlementType.village },
              { name: { che: "Шара-Орга", ru: "Шаро-Аргун", en: "Sharo-Argun" }, type: GeoSettlementType.village },
              { name: { ru: "Нохчи-Келой", en: "Nokhchi-Keloy" }, type: GeoSettlementType.village },
              { name: { ru: "Юкерч-Келой", en: "Yukherch-Keloy" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Іашхой-Мартанан район", ru: "Ачхой-Мартановский район", en: "Achkhoy-Martan District" },
            settlements: [
              { name: { che: "Іашхой-Марта", ru: "Ачхой-Мартан", en: "Achkhoy-Martan" }, type: GeoSettlementType.city },
              { name: { che: "ВаларгтIе", ru: "Валерик", en: "Valerik" }, type: GeoSettlementType.village },
              { name: { che: "Шовдан-Йурт", ru: "Давыденко", en: "Davydenko" }, type: GeoSettlementType.village },
              { name: { che: "Заки-Эвла", ru: "Закан-Юрт", en: "Zakan-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Котар-Йурт", ru: "Катар-Юрт", en: "Katar-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "ГIулара", ru: "Кулары", en: "Kulary" }, type: GeoSettlementType.village },
              { name: { che: "Керла-Шара", ru: "Новый Шарой", en: "Novy Sharoy" }, type: GeoSettlementType.village },
              { name: { che: "СемаIашка", ru: "Самашки", en: "Samashki" }, type: GeoSettlementType.village },
              { name: { che: "Іашхой-КIотар", ru: "Старый Ачхой", en: "Stary Achkhoy" }, type: GeoSettlementType.village },
              { name: { che: "Хаьмбин-Ирзе", ru: "Хамби-Ирзи", en: "Khambi-Irzi" }, type: GeoSettlementType.village },
              { name: { che: "ШаIми-Йурт", ru: "Шаами-Юрт", en: "Shaami-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Янди-КIотар", ru: "Янди", en: "Yandi" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Курчалойн район", ru: "Курчалойский район", en: "Kurchaloy District" },
            settlements: [
              { name: { che: "Курчалой-гlала", ru: "Курчалой", en: "Kurchaloy" }, type: GeoSettlementType.city },
              { name: { che: "Іалара", ru: "Аллерой", en: "Alleroi" }, type: GeoSettlementType.village },
              { name: { che: "Аьхкинчу-Борзе", ru: "Ахкинчу-Борзой", en: "Akhkinchu-Borzoy" }, type: GeoSettlementType.village },
              { name: { che: "Ахьмад-Йурт", ru: "Ахмат-Юрт", en: "Akhmat-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "Ачаршка", ru: "Ачерешки", en: "Achereshki" }, type: GeoSettlementType.village },
              { name: { che: "БIачи-Йурт", ru: "Бачи-Юрт", en: "Bachi-Yurt" }, type: GeoSettlementType.village },
              { name: { ru: "Бельты", en: "Belty" }, type: GeoSettlementType.village },
              { name: { che: "Гелдагана", ru: "Гелдагана", en: "Geldagana" }, type: GeoSettlementType.village },
              { name: { che: "ЖагIларги", ru: "Джагларги", en: "Dzhaglargi" }, type: GeoSettlementType.village },
              { name: { che: "ЖугIурта", ru: "Джигурты", en: "Dzhigurty" }, type: GeoSettlementType.village },
              { name: { che: "Илсхан-Йурт", ru: "Иласхан-Юрт", en: "Ilaskhan-Yurt" }, type: GeoSettlementType.village },
              { name: { ru: "Корен-Беной", en: "Koren-Benoy" }, type: GeoSettlementType.village },
              { name: { che: "Майртуп", ru: "Майртуп", en: "Mairtup" }, type: GeoSettlementType.village },
              { name: { che: "НикIи-ХитIа", ru: "Ники-Хита", en: "Niki-Khita" }, type: GeoSettlementType.village },
              { name: { che: "РегIатIа", ru: "Регита", en: "Regita" }, type: GeoSettlementType.village },
              { name: { che: "Цоцин-Эвла", ru: "Цоци-Юрт", en: "Tsotsi-Yurt" }, type: GeoSettlementType.village },
              { name: { che: "ЦIоьнтара", ru: "Центорой", en: "Tsentoroy" }, type: GeoSettlementType.village },
              { name: { che: "Энакхаьлла", ru: "Эникали", en: "Enikali" }, type: GeoSettlementType.village },
              { name: { che: "Ялхой-Мохк", ru: "Ялхой-Мохк", en: "Yalkhoy-Mokhk" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Шелковской район", ru: "Шелковской район", en: "Shelkovsky District" },
            settlements: [
              { name: { ru: "Шелковская", en: "Shelkovskaya" }, type: GeoSettlementType.village },
              { name: { ru: "Бороздиновская", en: "Borozdinovskaya" }, type: GeoSettlementType.village },
              { name: { ru: "Бурунское", en: "Burunskoye" }, type: GeoSettlementType.village },
              { name: { ru: "Воскресенское", en: "Voskresenskoye" }, type: GeoSettlementType.village },
              { name: { ru: "Гребенская", en: "Grebenskaya" }, type: GeoSettlementType.village },
              { name: { ru: "Дубовская", en: "Dubovskaya" }, type: GeoSettlementType.village },
              { name: { ru: "Каргалинская", en: "Kargalinskaya" }, type: GeoSettlementType.village },
              { name: { ru: "Карша-Аул", en: "Karsha-Aul" }, type: GeoSettlementType.village },
              { name: { ru: "Курдюковская", en: "Kurdyukovskaya" }, type: GeoSettlementType.village },
              { name: { ru: "Новощедринская", en: "Novoshchedrinskaya" }, type: GeoSettlementType.village },
              { name: { ru: "Ораз-Аул", en: "Oraz-Aul" }, type: GeoSettlementType.village },
              { name: { ru: "Сары-Су", en: "Sary-Su" }, type: GeoSettlementType.village },
              { name: { ru: "Старогладовская", en: "Starogladovskaya" }, type: GeoSettlementType.village },
              { name: { ru: "Старощедринская", en: "Staroshchedrinskaya" }, type: GeoSettlementType.village },
              { name: { ru: "Харьковское", en: "Kharkovskoye" }, type: GeoSettlementType.village },
              { name: { ru: "Червлённая", en: "Chervlyonnaya" }, type: GeoSettlementType.village },
              { name: { ru: "Щелкозаводская", en: "Shelkozavodskaya" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Сунженский район", ru: "Сунженский район", en: "Sunzha District" },
            settlements: [
              { name: { che: "Эна-Хишка", ru: "Серноводское", en: "Sernovodskoye" }, type: GeoSettlementType.city },
              { name: { che: "Эха-Борзе", ru: "Ассиновская", en: "Assinovskaya" }, type: GeoSettlementType.village },
              { name: { che: "Буммат", ru: "Бамут", en: "Bamut" }, type: GeoSettlementType.village },
              { name: { ru: "Закан-Юрт", en: "Zakan-Yurt" }, type: GeoSettlementType.village },
              { name: { ru: "Самашки", en: "Samashki" }, type: GeoSettlementType.village },
              { name: { ru: "Цеча-Ахки", en: "Tsecha-Akhki" }, type: GeoSettlementType.village },
              { name: { ru: "Мужгана", en: "Muzhgana" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Байсангуровский район", ru: "Байсангуровский район (г. Грозный)", en: "Baysangurov District (Grozny)" },
            settlements: [
              { name: { che: "Хан-ГIала", ru: "Ханкала", en: "Khankala" }, type: GeoSettlementType.village },
            ],
          },
          {
            name: { che: "Заводской район", ru: "Заводской район (г. Грозный)", en: "Zavodskoy District (Grozny)" },
            settlements: [
              { name: { che: "Заводской", ru: "Заводской район", en: "Zavodskoy" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Ингушетия", ru: "Республика Ингушетия", en: "Republic of Ingushetia" },
        districts: [
          {
            name: { che: "Магасан", ru: "Магасский район", en: "Magas District" },
            settlements: [
              { name: { che: "Магас", ru: "Магас", en: "Magas" }, type: GeoSettlementType.city },
              { name: { che: "Назрань", ru: "Назрань", en: "Nazran" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Дагестан", ru: "Республика Дагестан", en: "Republic of Dagestan" },
        districts: [
          {
            name: { che: "Хасавюрт", ru: "Хасавюртовский район", en: "Khasavyurt District" },
            settlements: [
              { name: { che: "Хасавюрт", ru: "Хасавюрт", en: "Khasavyurt" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Москох", ru: "Москва", en: "Moscow" },
        districts: [
          {
            name: { che: "Москох", ru: "Москва (город)", en: "Moscow City" },
            settlements: [
              { name: { che: "Москох", ru: "Москва", en: "Moscow" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Санкт-Петербург", ru: "Санкт-Петербург", en: "Saint Petersburg" },
        districts: [
          {
            name: { che: "Санкт-Петербург", ru: "Санкт-Петербург (город)", en: "Saint Petersburg City" },
            settlements: [
              { name: { che: "Санкт-Петербург", ru: "Санкт-Петербург", en: "Saint Petersburg" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Тюмень", ru: "Тюменская область", en: "Tyumen Oblast" },
        districts: [
          {
            name: { che: "Тюмень", ru: "Тюмень (город)", en: "Tyumen City" },
            settlements: [
              { name: { che: "Тюмень", ru: "Тюмень", en: "Tyumen" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "KZ",
    name: { che: "Казахстан", ru: "Казахстан", en: "Kazakhstan" },
    regions: [
      {
        name: { che: "Алма-Атта", ru: "Алматинская область", en: "Almaty Region" },
        districts: [
          {
            name: { che: "Алма-Атта", ru: "Алматы (город)", en: "Almaty City" },
            settlements: [
              { name: { che: "Алма-Атта", ru: "Алматы", en: "Almaty" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Астана", ru: "Акмолинская область", en: "Akmola Region" },
        districts: [
          {
            name: { che: "Астана", ru: "Астана (город)", en: "Astana City" },
            settlements: [
              { name: { che: "Астана", ru: "Астана", en: "Astana" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "DE",
    name: { che: "Германи", ru: "Германия", en: "Germany" },
    regions: [
      {
        name: { che: "Бавари", ru: "Бавария", en: "Bavaria" },
        districts: [
          {
            name: { che: "Мюнхен", ru: "Мюнхен", en: "Munich" },
            settlements: [
              { name: { che: "Мюнхен", ru: "Мюнхен", en: "Munich" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Берлин", ru: "Берлин", en: "Berlin" },
        districts: [
          {
            name: { che: "Берлин", ru: "Берлин (город)", en: "Berlin City" },
            settlements: [
              { name: { che: "Берлин", ru: "Берлин", en: "Berlin" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Северный Рейн-Вестфалия", ru: "Северный Рейн-Вестфалия", en: "North Rhine-Westphalia" },
        districts: [
          {
            name: { che: "Кёльн", ru: "Кёльн", en: "Cologne" },
            settlements: [
              { name: { che: "Кёльн", ru: "Кёльн", en: "Cologne" }, type: GeoSettlementType.city },
            ],
          },
          {
            name: { che: "Дюссельдорф", ru: "Дюссельдорф", en: "Düsseldorf" },
            settlements: [
              { name: { che: "Дюссельдорф", ru: "Дюссельдорф", en: "Düsseldorf" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "TR",
    name: { che: "Туркойчоь", ru: "Турция", en: "Turkey" },
    regions: [
      {
        name: { che: "Истанбул", ru: "Стамбул", en: "Istanbul" },
        districts: [
          {
            name: { che: "Истанбул", ru: "Стамбул (город)", en: "Istanbul City" },
            settlements: [
              { name: { che: "Истанбул", ru: "Стамбул", en: "Istanbul" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Анкара", ru: "Анкара", en: "Ankara" },
        districts: [
          {
            name: { che: "Анкара", ru: "Анкара (город)", en: "Ankara City" },
            settlements: [
              { name: { che: "Анкара", ru: "Анкара", en: "Ankara" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Саkarya", ru: "Сакарья", en: "Sakarya" },
        districts: [
          {
            name: { che: "Адапазары", ru: "Адапазары", en: "Adapazarı" },
            settlements: [
              { name: { che: "Адапазары", ru: "Адапазары", en: "Adapazarı" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "AT",
    name: { che: "Австри", ru: "Австрия", en: "Austria" },
    regions: [
      {
        name: { che: "Вена", ru: "Вена", en: "Vienna" },
        districts: [
          {
            name: { che: "Вена", ru: "Вена (город)", en: "Vienna City" },
            settlements: [
              { name: { che: "Вена", ru: "Вена", en: "Vienna" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "NO",
    name: { che: "Норвегия", ru: "Норвегия", en: "Norway" },
    regions: [
      {
        name: { che: "Осло", ru: "Осло", en: "Oslo" },
        districts: [
          {
            name: { che: "Осло", ru: "Осло (город)", en: "Oslo City" },
            settlements: [
              { name: { che: "Осло", ru: "Осло", en: "Oslo" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "FR",
    name: { che: "Франци", ru: "Франция", en: "France" },
    regions: [
      {
        name: { che: "Париж", ru: "Иль-де-Франс", en: "Île-de-France" },
        districts: [
          {
            name: { che: "Париж", ru: "Париж (город)", en: "Paris City" },
            settlements: [
              { name: { che: "Париж", ru: "Париж", en: "Paris" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "BE",
    name: { che: "Бельгия", ru: "Бельгия", en: "Belgium" },
    regions: [
      {
        name: { che: "Брюссель", ru: "Брюссель", en: "Brussels" },
        districts: [
          {
            name: { che: "Брюссель", ru: "Брюссель (город)", en: "Brussels City" },
            settlements: [
              { name: { che: "Брюссель", ru: "Брюссель", en: "Brussels" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "UA",
    name: { che: "Украина", ru: "Украина", en: "Ukraine" },
    regions: [
      {
        name: { che: "Киев", ru: "Киевская область", en: "Kyiv Oblast" },
        districts: [
          {
            name: { che: "Киев", ru: "Киев (город)", en: "Kyiv City" },
            settlements: [
              { name: { che: "Киев", ru: "Киев", en: "Kyiv" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "PL",
    name: { che: "Польша", ru: "Польша", en: "Poland" },
    regions: [
      {
        name: { che: "Варшава", ru: "Мазовецкое воеводство", en: "Masovian Voivodeship" },
        districts: [
          {
            name: { che: "Варшава", ru: "Варшава (город)", en: "Warsaw City" },
            settlements: [
              { name: { che: "Варшава", ru: "Варшава", en: "Warsaw" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "AE",
    name: { che: "ОАЭ", ru: "ОАЭ", en: "UAE" },
    regions: [
      {
        name: { che: "Дубай", ru: "Дубай", en: "Dubai" },
        districts: [
          {
            name: { che: "Дубай", ru: "Дубай (город)", en: "Dubai City" },
            settlements: [
              { name: { che: "Дубай", ru: "Дубай", en: "Dubai" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Абу-Даби", ru: "Абу-Даби", en: "Abu Dhabi" },
        districts: [
          {
            name: { che: "Абу-Даби", ru: "Абу-Даби (город)", en: "Abu Dhabi City" },
            settlements: [
              { name: { che: "Абу-Даби", ru: "Абу-Даби", en: "Abu Dhabi" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "GE",
    name: { che: "Гуьржийчоь", ru: "Грузия", en: "Georgia" },
    regions: [
      {
        name: { che: "Тбилиси", ru: "Тбилиси", en: "Tbilisi" },
        districts: [
          {
            name: { che: "Тбилиси", ru: "Тбилиси (город)", en: "Tbilisi City" },
            settlements: [
              { name: { che: "Тбилиси", ru: "Тбилиси", en: "Tbilisi" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Панкиси", ru: "Ахметский муниципалитет", en: "Akhmeta Municipality" },
        districts: [
          {
            name: { che: "Панкиси", ru: "Панкисское ущелье", en: "Pankisi Gorge" },
            settlements: [
              { name: { che: "Дуиси", ru: "Дуиси", en: "Duisi" }, type: GeoSettlementType.village },
              { name: { che: "Джоколо", ru: "Джоколо", en: "Jokolo" }, type: GeoSettlementType.village },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "JO",
    name: { che: "Иордани", ru: "Иордания", en: "Jordan" },
    regions: [
      {
        name: { che: "Амман", ru: "Амман", en: "Amman" },
        districts: [
          {
            name: { che: "Амман", ru: "Амман (город)", en: "Amman City" },
            settlements: [
              { name: { che: "Амман", ru: "Амман", en: "Amman" }, type: GeoSettlementType.city },
              { name: { che: "Зарка", ru: "Зарка", en: "Zarqa" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
  {
    code: "US",
    name: { che: "США", ru: "США", en: "USA" },
    regions: [
      {
        name: { che: "Иллинойс", ru: "Иллинойс", en: "Illinois" },
        districts: [
          {
            name: { che: "Чикаго", ru: "Чикаго", en: "Chicago" },
            settlements: [
              { name: { che: "Чикаго", ru: "Чикаго", en: "Chicago" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
      {
        name: { che: "Нью-Йорк", ru: "Нью-Йорк", en: "New York" },
        districts: [
          {
            name: { che: "Нью-Йорк", ru: "Нью-Йорк (город)", en: "New York City" },
            settlements: [
              { name: { che: "Нью-Йорк", ru: "Нью-Йорк", en: "New York" }, type: GeoSettlementType.city },
            ],
          },
        ],
      },
    ],
  },
];

export async function seedGeo() {
  console.log("Seeding geo data...");

  for (const countryData of GEO_DATA) {
    const country = await prisma.geoCountry.upsert({
      where: { code: countryData.code },
      update: { name: countryData.name as object },
      create: { code: countryData.code, name: countryData.name as object },
    });

    for (const regionData of countryData.regions) {
      const region = await prisma.geoRegion.create({
        data: { countryId: country.id, name: regionData.name as object },
      });

      for (const districtData of regionData.districts) {
        const district = await prisma.geoDistrict.create({
          data: { regionId: region.id, name: districtData.name as object },
        });

        for (const settlementData of districtData.settlements) {
          await prisma.geoSettlement.create({
            data: {
              districtId: district.id,
              name: settlementData.name as object,
              type: settlementData.type,
            },
          });
        }
      }
    }

    console.log(`  ✓ ${countryData.name.ru} (${countryData.code})`);
  }

  console.log("Geo seed complete.");
}
