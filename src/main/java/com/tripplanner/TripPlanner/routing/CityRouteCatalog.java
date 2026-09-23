package com.tripplanner.TripPlanner.routing;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * Static catalog of ~20 popular domestic Ukrainian city-pair routes, used to
 * power programmatic SEO landing pages ({@code /{locale}/route/{slug}}).
 * Coordinates are city-center approximations; distance/duration are curated
 * road-trip estimates used as a fallback when live routing is unavailable.
 */
public final class CityRouteCatalog {

    public record City(String uk, String en, double lat, double lng) {}

    public record CityRoute(String slug, City from, City to, double estDistanceKm, double estDurationMin) {}

    private static City c(String uk, String en, double lat, double lng) {
        return new City(uk, en, lat, lng);
    }

    private static final City KYIV = c("Київ", "Kyiv", 50.4501, 30.5234);
    private static final City LVIV = c("Львів", "Lviv", 49.8397, 24.0297);
    private static final City ODESA = c("Одеса", "Odesa", 46.4825, 30.7233);
    private static final City KHARKIV = c("Харків", "Kharkiv", 49.9935, 36.2304);
    private static final City DNIPRO = c("Дніпро", "Dnipro", 48.4647, 35.0462);
    private static final City ZAPORIZHZHIA = c("Запоріжжя", "Zaporizhzhia", 47.8388, 35.1396);
    private static final City VINNYTSIA = c("Вінниця", "Vinnytsia", 49.2331, 28.4682);
    private static final City IVANO_FRANKIVSK = c("Івано-Франківськ", "Ivano-Frankivsk", 48.9226, 24.7111);
    private static final City TERNOPIL = c("Тернопіль", "Ternopil", 49.5535, 25.5948);
    private static final City UZHHOROD = c("Ужгород", "Uzhhorod", 48.6208, 22.2879);
    private static final City CHERNIVTSI = c("Чернівці", "Chernivtsi", 48.2921, 25.9358);
    private static final City POLTAVA = c("Полтава", "Poltava", 49.5883, 34.5514);
    private static final City ZHYTOMYR = c("Житомир", "Zhytomyr", 50.2547, 28.6587);
    private static final City RIVNE = c("Рівне", "Rivne", 50.6199, 26.2516);
    private static final City LUTSK = c("Луцьк", "Lutsk", 50.7472, 25.3254);
    private static final City KHMELNYTSKYI = c("Хмельницький", "Khmelnytskyi", 49.4229, 26.9871);
    private static final City MYKOLAIV = c("Миколаїв", "Mykolaiv", 46.9750, 31.9946);
    private static final City BUKOVEL = c("Буковель", "Bukovel", 48.3600, 24.4067);

    private static CityRoute r(String slug, City from, City to, double km, double min) {
        return new CityRoute(slug, from, to, km, min);
    }

    public static final List<CityRoute> ALL = List.of(
            r("kyiv-lviv", KYIV, LVIV, 540, 400),
            r("kyiv-odesa", KYIV, ODESA, 475, 330),
            r("kyiv-kharkiv", KYIV, KHARKIV, 480, 320),
            r("kyiv-dnipro", KYIV, DNIPRO, 480, 330),
            r("kyiv-zaporizhzhia", KYIV, ZAPORIZHZHIA, 560, 380),
            r("kyiv-vinnytsia", KYIV, VINNYTSIA, 260, 190),
            r("kyiv-ternopil", KYIV, TERNOPIL, 430, 320),
            r("kyiv-zhytomyr", KYIV, ZHYTOMYR, 140, 110),
            r("kyiv-rivne", KYIV, RIVNE, 330, 250),
            r("kyiv-poltava", KYIV, POLTAVA, 340, 230),
            r("lviv-ivano-frankivsk", LVIV, IVANO_FRANKIVSK, 135, 120),
            r("lviv-uzhhorod", LVIV, UZHHOROD, 265, 250),
            r("lviv-ternopil", LVIV, TERNOPIL, 130, 110),
            r("lviv-chernivtsi", LVIV, CHERNIVTSI, 270, 240),
            r("lviv-lutsk", LVIV, LUTSK, 155, 140),
            r("lviv-khmelnytskyi", LVIV, KHMELNYTSKYI, 205, 170),
            r("odesa-mykolaiv", ODESA, MYKOLAIV, 135, 110),
            r("ivano-frankivsk-bukovel", IVANO_FRANKIVSK, BUKOVEL, 95, 110),
            r("kharkiv-dnipro", KHARKIV, DNIPRO, 215, 160),
            r("dnipro-zaporizhzhia", DNIPRO, ZAPORIZHZHIA, 85, 70)
    );

    private static final Map<String, CityRoute> BY_SLUG =
            ALL.stream().collect(Collectors.toMap(CityRoute::slug, r -> r));

    private CityRouteCatalog() {
    }

    public static CityRoute find(String slug) {
        return BY_SLUG.get(slug);
    }

    /** Up to {@code limit} other routes sharing a city (by name) with {@code route}. */
    public static List<CityRoute> related(CityRoute route, int limit) {
        return ALL.stream()
                .filter(other -> !other.slug().equals(route.slug()))
                .filter(other -> other.from().en().equals(route.from().en()) || other.from().en().equals(route.to().en())
                        || other.to().en().equals(route.from().en()) || other.to().en().equals(route.to().en()))
                .limit(limit)
                .toList();
    }
}
