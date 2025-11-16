# Bilingual Email Examples

All email notifications are now sent in both English and Ukrainian in a single email body.

## Format

**Subject:** English Subject / Ukrainian Subject

**Body:**
```
[English content]

════════════════════════════════════════════════════════════

[Ukrainian content]
```

## Example 1: Pending Confirmation Email

**Subject:** Beta Access Request Received - Route Planner / Запит на бета-доступ отримано - Route Planner

**Body:**
```
Hello John Doe,

Thank you for requesting beta access to Route Planner!

Your request has been received and is currently pending review. You will receive another email notification once your request has been processed.

This usually takes 1-2 business days.

If you have any questions, please don't hesitate to contact us.

Best regards,
Trip Planner Team

════════════════════════════════════════════════════════════

Вітаємо, John Doe!

Дякуємо за запит на бета-доступ до Route Planner!

Ваш запит отримано і зараз очікує розгляду. Ви отримаєте повідомлення електронною поштою після обробки вашого запиту.

Зазвичай це займає 1-2 робочі дні.

Якщо у вас є запитання, не соромтеся звертатися до нас.

З повагою,
Команда Trip Planner
```

## Example 2: Approval Email

**Subject:** Beta Access Granted - Route Planner / Бета-доступ надано - Route Planner

**Body:**
```
Hello John Doe,

Great news! Your request for beta access to Route Planner has been approved!

You can now access this feature by logging into your account at our platform.

We hope you enjoy using this new feature. If you encounter any issues or have feedback, please let us know.

Best regards,
Trip Planner Team

════════════════════════════════════════════════════════════

Вітаємо, John Doe!

Чудові новини! Ваш запит на бета-доступ до Route Planner схвалено!

Тепер ви можете отримати доступ до цієї функції, увійшовши до свого облікового запису на нашій платформі.

Сподіваємось, вам сподобається використовувати цю нову функцію. Якщо ви зіткнетеся з проблемами або маєте відгуки, будь ласка, дайте нам знати.

З повагою,
Команда Trip Planner
```

## Implementation Details

- **BilingualEmailMessageBuilder.java** - New class containing all bilingual email templates
- **AccessRequestService.java** - Updated to use bilingual templates for all 4 email types:
  1. Admin notification (when user requests access)
  2. Pending confirmation (sent to user when request received)
  3. Approval notification (sent to user when request approved)
  4. Rejection notification (sent to user when request rejected)

## Languages

- **English (en)** - Primary language
- **Ukrainian (uk)** - Secondary language

Both languages are included in every email, ensuring all users receive information in both languages regardless of their preference.
