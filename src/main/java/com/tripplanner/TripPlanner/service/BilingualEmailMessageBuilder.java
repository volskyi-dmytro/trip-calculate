package com.tripplanner.TripPlanner.service;

/**
 * Builder class for creating bilingual (English/Ukrainian) email messages
 * Each email contains both language versions in a single message body
 */
public class BilingualEmailMessageBuilder {

    private static final String DIVIDER = "\n" + "═".repeat(60) + "\n\n";

    /**
     * Creates a bilingual subject line
     */
    public static String createBilingualSubject(String englishSubject, String ukrainianSubject) {
        return englishSubject + " / " + ukrainianSubject;
    }

    /**
     * Creates a bilingual email body with English first, then Ukrainian
     */
    public static String createBilingualBody(String englishBody, String ukrainianBody) {
        return englishBody + DIVIDER + ukrainianBody;
    }

    /**
     * Creates admin notification email for new access request
     */
    public static class AdminNotification {
        public static String subject(String featureName) {
            return createBilingualSubject(
                "New Feature Access Request - " + featureName,
                "Новий запит на доступ до функції - " + featureName
            );
        }

        public static String body(String userName, String userEmail, String featureName) {
            String english = String.format(
                "New access request received:\n\n" +
                "User: %s\n" +
                "Email: %s\n" +
                "Feature: %s\n\n" +
                "Please review and approve/reject this request in the admin panel.",
                userName, userEmail, featureName
            );

            String ukrainian = String.format(
                "Отримано новий запит на доступ:\n\n" +
                "Користувач: %s\n" +
                "Email: %s\n" +
                "Функція: %s\n\n" +
                "Будь ласка, перегляньте та схваліть/відхиліть цей запит в адмін-панелі.",
                userName, userEmail, featureName
            );

            return createBilingualBody(english, ukrainian);
        }
    }

    /**
     * Creates pending confirmation email sent to user when request is received
     */
    public static class PendingConfirmation {
        public static String subject(String featureName) {
            return createBilingualSubject(
                "Beta Access Request Received - " + featureName,
                "Запит на бета-доступ отримано - " + featureName
            );
        }

        public static String body(String userName, String featureName) {
            String english = String.format(
                "Hello %s,\n\n" +
                "Thank you for requesting beta access to %s!\n\n" +
                "Your request has been received and is currently pending review. " +
                "You will receive another email notification once your request has been processed.\n\n" +
                "This usually takes 1-2 business days.\n\n" +
                "If you have any questions, please don't hesitate to contact us.\n\n" +
                "Best regards,\n" +
                "Trip Planner Team",
                userName, featureName
            );

            String ukrainian = String.format(
                "Вітаємо, %s!\n\n" +
                "Дякуємо за запит на бета-доступ до %s!\n\n" +
                "Ваш запит отримано і зараз очікує розгляду. " +
                "Ви отримаєте повідомлення електронною поштою після обробки вашого запиту.\n\n" +
                "Зазвичай це займає 1-2 робочі дні.\n\n" +
                "Якщо у вас є запитання, не соромтеся звертатися до нас.\n\n" +
                "З повагою,\n" +
                "Команда Trip Planner",
                userName, featureName
            );

            return createBilingualBody(english, ukrainian);
        }
    }

    /**
     * Creates approval email sent to user when request is approved
     */
    public static class Approval {
        public static String subject(String featureName) {
            return createBilingualSubject(
                "Beta Access Granted - " + featureName,
                "Бета-доступ надано - " + featureName
            );
        }

        public static String body(String userName, String featureName) {
            String english = String.format(
                "Hello %s,\n\n" +
                "Great news! Your request for beta access to %s has been approved!\n\n" +
                "You can now access this feature by logging into your account at our platform.\n\n" +
                "We hope you enjoy using this new feature. If you encounter any issues or have feedback, " +
                "please let us know.\n\n" +
                "Best regards,\n" +
                "Trip Planner Team",
                userName, featureName
            );

            String ukrainian = String.format(
                "Вітаємо, %s!\n\n" +
                "Чудові новини! Ваш запит на бета-доступ до %s схвалено!\n\n" +
                "Тепер ви можете отримати доступ до цієї функції, увійшовши до свого облікового запису на нашій платформі.\n\n" +
                "Сподіваємось, вам сподобається використовувати цю нову функцію. Якщо ви зіткнетеся з проблемами або маєте відгуки, " +
                "будь ласка, дайте нам знати.\n\n" +
                "З повагою,\n" +
                "Команда Trip Planner",
                userName, featureName
            );

            return createBilingualBody(english, ukrainian);
        }
    }

    /**
     * Creates rejection email sent to user when request is rejected
     */
    public static class Rejection {
        public static String subject(String featureName) {
            return createBilingualSubject(
                "Beta Access Request Update - " + featureName,
                "Оновлення запиту на бета-доступ - " + featureName
            );
        }

        public static String body(String userName, String featureName) {
            String english = String.format(
                "Hello %s,\n\n" +
                "Thank you for your interest in beta access to %s.\n\n" +
                "After careful consideration, we are unable to grant access at this time. " +
                "This may be due to capacity limitations or other factors.\n\n" +
                "We appreciate your interest and encourage you to check back in the future " +
                "as we expand our beta program.\n\n" +
                "If you have any questions, please don't hesitate to contact us.\n\n" +
                "Best regards,\n" +
                "Trip Planner Team",
                userName, featureName
            );

            String ukrainian = String.format(
                "Вітаємо, %s!\n\n" +
                "Дякуємо за ваш інтерес до бета-доступу до %s.\n\n" +
                "Після ретельного розгляду ми не можемо надати доступ на даний момент. " +
                "Це може бути пов'язано з обмеженнями щодо місткості або іншими факторами.\n\n" +
                "Ми цінуємо ваш інтерес і рекомендуємо повернутися пізніше, " +
                "коли ми розширимо нашу бета-програму.\n\n" +
                "Якщо у вас є запитання, не соромтеся звертатися до нас.\n\n" +
                "З повагою,\n" +
                "Команда Trip Planner",
                userName, featureName
            );

            return createBilingualBody(english, ukrainian);
        }
    }
}
