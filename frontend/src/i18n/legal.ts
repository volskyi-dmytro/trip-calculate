import type { Language } from '../types';

export type { Language } from '../types';

// Legal texts for /{en,uk}/privacy and /{en,uk}/terms. Both languages must keep
// the same structure (section ids, block kinds, list/table sizes): the parity
// test in __tests__/legal.test.ts enforces it.
//
// Inline markup: **bold** and {email} (rendered as a mailto link).

export type LegalPageId = 'privacy' | 'terms';

export type LegalBlock =
  | { kind: 'p'; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'table'; head: string[]; rows: string[][] };

export interface LegalSection {
  id: string;
  heading: string;
  blocks: LegalBlock[];
}

export interface LegalDocument {
  title: string;
  sections: LegalSection[];
}

interface LegalTranslations {
  effectiveDate: string;
  onThisPage: string;
  privacy: LegalDocument;
  terms: LegalDocument;
}

// The day this version was published. Update it with every material change.
export const LEGAL_EFFECTIVE_DATE = '2026-09-25';

export const LEGAL_CONTACT_EMAIL = 'volskyi.dmytro@gmail.com';

export const legalTranslations: Record<Language, LegalTranslations> = {
  en: {
    effectiveDate: 'Effective date',
    onThisPage: 'On this page',
    privacy: {
      title: 'Privacy Policy',
      sections: [
        {
          id: 'who-we-are',
          heading: '1. Who is responsible for your data',
          blocks: [
            { kind: 'p', text: 'TripCalculate (trip-calculate.online) is run by **Dmytro Volskyi**, a private individual based in Lviv, Ukraine ("we", "us"). We decide how and why your personal data is used, which makes us the controller of that data.' },
            { kind: 'p', text: 'Contact for any privacy question or request: {email}' },
          ],
        },
        {
          id: 'scope',
          heading: '2. What this policy covers',
          blocks: [
            { kind: 'p', text: 'This policy explains what data TripCalculate collects when you use the website, why, who it is shared with, how long it is kept, and what rights you have. It covers the website and the AI trip assistant.' },
          ],
        },
        {
          id: 'what-we-collect',
          heading: '3. What we collect and why',
          blocks: [
            { kind: 'p', text: '**When you use the site without an account**' },
            { kind: 'list', items: [
              '**Trip details you enter** (distance, fuel consumption, fuel price, number of passengers): used only to calculate the result. We do not store them unless you save a route or share a receipt.',
              '**Places and route points** you type or pick on the map: sent to our map and routing providers (see section 5) to find addresses and calculate the route.',
              '**Technical data** (IP address, browser type, pages requested, time): our hosting and network providers process it to deliver the site, protect it from attacks and limit abuse. Our server logs may also record it.',
            ] },
            { kind: 'p', text: '**When you sign in with Google**' },
            { kind: 'list', items: [
              '**Your Google profile**: name, email address, Google account ID and profile photo link. We use them to create and run your account.',
              '**Your settings**: language, display name, default fuel consumption and similar preferences.',
              '**What you save**: routes (place names and coordinates), cars and trip receipts.',
            ] },
            { kind: 'p', text: '**When you use the AI trip assistant**' },
            { kind: 'list', items: [
              'Your **messages** and your **current route points** are sent to OpenAI to generate the answer.',
              'We keep an **AI usage record** with your message, your email (if you are signed in), your IP address and the result, to prevent abuse and fix errors.',
              'A technical trace of each AI request (your message and the answer, linked to your account) is stored with our AI monitoring provider Langfuse, in the EU.',
            ] },
            { kind: 'p', text: '**When you share a trip receipt**' },
            { kind: 'list', items: [
              'A receipt contains the trip costs, the From/To labels you chose and the route drawn on a map.',
              '**Anyone who has the link can see it.** Use a city or landmark instead of your home address if you prefer not to reveal it.',
            ] },
            { kind: 'p', text: 'We do not sell your data, show ads or use your data for advertising.' },
          ],
        },
        {
          id: 'legal-basis',
          heading: '4. Why we are allowed to use your data',
          blocks: [
            { kind: 'list', items: [
              '**To provide the service you ask for** (your account, saved routes, receipts, AI answers): this is necessary to perform our agreement with you, the Terms of Use.',
              '**To keep the service secure and working** (technical data, logs, abuse limits, AI usage records): our legitimate interest in protecting the service and its users.',
              '**Where the law requires your consent**, we will ask for it first. Today we use no cookies or similar technology that needs consent (see section 8).',
            ] },
          ],
        },
        {
          id: 'sharing',
          heading: '5. Who we share data with',
          blocks: [
            { kind: 'p', text: 'We use trusted providers who process data on our behalf, only as far as the service needs:' },
            { kind: 'table', head: ['Provider', 'What for', 'What they receive', 'Where'], rows: [
              ['Oracle Cloud', 'Hosting the app and database', 'Everything stored by the service', 'Frankfurt, Germany (EU)'],
              ['Cloudflare', 'Network delivery, security, basic traffic statistics', 'Technical data (IP address, requests)', 'Global network'],
              ['Google', 'Sign-in', 'Your sign-in request; Google sends us your profile', 'USA and worldwide'],
              ['OpenAI', 'AI trip assistant', 'Your AI messages and route points', 'USA'],
              ['Langfuse', 'Monitoring AI quality', 'AI messages, answers, account identifier', 'EU'],
              ['Mapbox', 'Maps and route calculation', 'Route points, technical data', 'USA'],
              ['OpenStreetMap Nominatim', 'Address search', 'Search text or coordinates. Your browser contacts it directly, so it also sees your IP address', 'Europe'],
              ['Public OSRM routing servers', 'Backup route calculation if Mapbox is unavailable', 'Route points', 'Europe'],
              ['Open-Meteo', 'Weather along the route', 'Route coordinates only', 'Europe'],
            ] },
            { kind: 'p', text: 'We may also disclose data if the law requires it.' },
          ],
        },
        {
          id: 'transfers',
          heading: '6. Transfers outside your country',
          blocks: [
            { kind: 'p', text: 'Some providers, such as OpenAI, Mapbox and Google, process data in the USA. Where EU or Ukrainian law requires it, these transfers rely on the safeguards the providers offer, such as the EU Standard Contractual Clauses.' },
          ],
        },
        {
          id: 'retention',
          heading: '7. How long we keep data',
          blocks: [
            { kind: 'table', head: ['Data', 'How long'], rows: [
              ['Your account, saved routes and cars', 'Until you delete them or your account'],
              ['Receipts shared while signed in', 'Until you delete the receipt or your account'],
              ['Receipts shared without an account', '30 days'],
              ['AI usage records (message, email, IP address)', '90 days, then deleted automatically'],
              ['AI monitoring traces (Langfuse)', '30 days'],
              ['Login session', 'Until you sign out, or 24 hours of inactivity'],
              ['Server logs', '14 days'],
              ['Backups', 'Up to 30 days'],
            ] },
            { kind: 'p', text: 'When you delete your account, we immediately delete your profile, saved routes, cars, receipts and AI usage records. Copies in backups disappear when those backups expire.' },
          ],
        },
        {
          id: 'cookies',
          heading: '8. Cookies and local storage',
          blocks: [
            { kind: 'p', text: 'We only use what the site needs to work. **We use no analytics or advertising cookies.**' },
            { kind: 'table', head: ['Name', 'Type', 'Purpose', 'Duration'], rows: [
              ['SESSIONID', 'Cookie, strictly necessary', 'Keeps you signed in', 'Until you sign out, or 24 hours of inactivity'],
              ['XSRF-TOKEN', 'Cookie, strictly necessary', 'Protects forms against cross-site request forgery', 'Browser session'],
              ['language, theme', 'Local storage', 'Remember your language and light or dark mode', 'Until you clear your browser data'],
              ['tripCalculate_*, tc_car_v1', 'Local storage', 'Remember the route, settings and car you last used in the planner', 'Until you clear your browser data or delete your account'],
            ] },
            { kind: 'p', text: 'Cloudflare may set its own strictly necessary security cookies to protect the site from bots. If we ever add analytics or other non-essential cookies, we will ask for your consent first and update this policy.' },
          ],
        },
        {
          id: 'your-rights',
          heading: '9. Your rights',
          blocks: [
            { kind: 'p', text: 'Depending on where you live, you can:' },
            { kind: 'list', items: [
              '**see** the data we hold about you and get a copy of it;',
              '**correct** it (you can edit your display name and settings in your dashboard);',
              '**delete** it (Dashboard → Delete account removes it immediately);',
              '**object to** or **restrict** some uses;',
              '**take your data elsewhere** (data portability).',
            ] },
            { kind: 'p', text: 'To use any of these rights, including to get a copy of your data, email {email}. We answer within 30 days and may ask you to confirm the request from the email address of your account.' },
            { kind: 'p', text: 'You can also complain to a data protection authority. In Ukraine, that is the Ukrainian Parliament Commissioner for Human Rights. In the EU, it is the authority in your country.' },
          ],
        },
        {
          id: 'children',
          heading: '10. Children',
          blocks: [
            { kind: 'p', text: "Anyone can use the trip calculator without an account. To create an account you need a Google account, so Google's minimum age rules apply. If you are under 16 and live in the EU, you may need a parent's permission to create an account. If you believe a child has given us personal data without the permission they needed, contact us and we will delete it." },
          ],
        },
        {
          id: 'security',
          heading: '11. Security',
          blocks: [
            { kind: 'p', text: 'The site is served only over HTTPS. Access to data is limited to what each part of the service needs, and admin tools require an admin account. No system is perfectly secure. If a breach affects your data, we will inform you and the authorities where the law requires it.' },
          ],
        },
        {
          id: 'changes',
          heading: '12. Changes to this policy',
          blocks: [
            { kind: 'p', text: 'We will update this page when our practices change and change the effective date above. If a change is significant, we will point it out on the site.' },
          ],
        },
      ],
    },
    terms: {
      title: 'Terms of Use',
      sections: [
        {
          id: 'about',
          heading: '1. About these terms',
          blocks: [
            { kind: 'p', text: 'These terms apply to your use of TripCalculate (trip-calculate.online), run by Dmytro Volskyi, Lviv, Ukraine. By using the site you accept them. If you do not agree, please do not use the site.' },
          ],
        },
        {
          id: 'service',
          heading: '2. The service',
          blocks: [
            { kind: 'p', text: 'TripCalculate helps you estimate fuel costs, plan routes and split trip costs. The service is currently **free**. We may change, pause or stop any part of it. If we ever introduce paid features, we will tell you in advance and ask for your agreement before you are charged.' },
          ],
        },
        {
          id: 'account',
          heading: '3. Your account',
          blocks: [
            { kind: 'list', items: [
              'You sign in with a Google account. Keep access to it secure: you are responsible for what happens under your account.',
              'You can delete your account at any time in your dashboard.',
            ] },
          ],
        },
        {
          id: 'acceptable-use',
          heading: '4. Acceptable use',
          blocks: [
            { kind: 'p', text: 'Please use TripCalculate the way a person planning trips would. In particular, do not:' },
            { kind: 'list', items: [
              'overload or disrupt the site, for example by sending automated requests at high volume or trying to get around our usage limits;',
              'copy data from the site in bulk with bots or scrapers;',
              "try to break into the site, other users' accounts or our systems, or test their security without our written permission;",
              'use the AI assistant for anything other than trip planning, or try to make it produce harmful content;',
              "share receipts or other content that is illegal, offensive or violates other people's rights;",
              'use the service to break the law.',
            ] },
          ],
        },
        {
          id: 'your-content',
          heading: '5. Your content',
          blocks: [
            { kind: 'p', text: 'Routes, place names, car details and receipts you create stay yours. You allow us to store and show them as far as the service needs. For example, a receipt you share is shown to anyone with its link.' },
          ],
        },
        {
          id: 'estimates',
          heading: '6. Estimates and the AI assistant',
          blocks: [
            { kind: 'list', items: [
              'Costs, distances, travel times, fuel prices and weather are **estimates**. They can be inaccurate or out of date. Actual costs depend on your car, your driving and road conditions.',
              'The AI assistant can make mistakes. Check important details, such as the route and places, yourself.',
              'TripCalculate is not a navigation system. Always follow road signs, traffic rules and local conditions.',
            ] },
          ],
        },
        {
          id: 'no-warranty',
          heading: '7. No warranty',
          blocks: [
            { kind: 'p', text: 'The service is provided **"as is" and "as available"**, without warranties of any kind, to the extent the law allows.' },
          ],
        },
        {
          id: 'liability',
          heading: '8. Limitation of liability',
          blocks: [
            { kind: 'p', text: 'To the extent the law allows, we are not liable for indirect or consequential losses, or for losses caused by relying on estimates or AI answers. Nothing in these terms limits liability that the law does not allow us to limit, or your mandatory rights as a consumer.' },
          ],
        },
        {
          id: 'third-parties',
          heading: '9. Third-party services',
          blocks: [
            { kind: 'p', text: 'The site uses services from other companies, such as Google sign-in, maps, routing and weather. Their own terms apply to them, and we are not responsible for them.' },
          ],
        },
        {
          id: 'suspension',
          heading: '10. Suspension and termination',
          blocks: [
            { kind: 'p', text: 'We may limit, suspend or close access, or delete an account, if it breaks these terms or puts the service or other users at risk. Where reasonable, we will tell you why. You can stop using the service and delete your account at any time.' },
          ],
        },
        {
          id: 'changes',
          heading: '11. Changes to these terms',
          blocks: [
            { kind: 'p', text: 'We may update these terms. We will publish the new version here with a new effective date, and point out significant changes on the site. If you keep using the service after that, you accept the new terms.' },
          ],
        },
        {
          id: 'governing-law',
          heading: '12. Governing law',
          blocks: [
            { kind: 'p', text: 'These terms are governed by the law of Ukraine, and disputes are decided by the courts of Ukraine. This does not take away any mandatory protection you have under the law of the country where you live.' },
          ],
        },
        {
          id: 'languages',
          heading: '13. Language versions',
          blocks: [
            { kind: 'p', text: 'These terms and the Privacy Policy are available in English and Ukrainian with the same meaning. If they differ because of a translation error, the English version prevails.' },
          ],
        },
        {
          id: 'contact',
          heading: '14. Contact',
          blocks: [
            { kind: 'p', text: 'Questions about these terms: {email}' },
          ],
        },
      ],
    },
  },
  uk: {
    effectiveDate: 'Дата набрання чинності',
    onThisPage: 'На цій сторінці',
    privacy: {
      title: 'Політика конфіденційності',
      sections: [
        {
          id: 'who-we-are',
          heading: '1. Хто відповідає за ваші дані',
          blocks: [
            { kind: 'p', text: 'TripCalculate (trip-calculate.online) — сервіс, який веде **Дмитро Вольський**, фізична особа, Львів, Україна («ми»). Ми визначаємо, як і навіщо використовуються ваші персональні дані, тобто є їхнім володільцем.' },
            { kind: 'p', text: 'Для будь-яких питань і запитів щодо персональних даних: {email}' },
          ],
        },
        {
          id: 'scope',
          heading: '2. Про що ця політика',
          blocks: [
            { kind: 'p', text: 'Ця політика пояснює, які дані збирає TripCalculate, коли ви користуєтеся сайтом, навіщо, кому вони передаються, скільки зберігаються і які права ви маєте. Вона стосується сайту та ШІ-помічника з поїздок.' },
          ],
        },
        {
          id: 'what-we-collect',
          heading: '3. Що ми збираємо і навіщо',
          blocks: [
            { kind: 'p', text: '**Коли ви користуєтеся сайтом без облікового запису**' },
            { kind: 'list', items: [
              '**Дані поїздки, які ви вводите** (відстань, витрата пального, ціна пального, кількість пасажирів): потрібні лише для розрахунку. Ми їх не зберігаємо, якщо ви не збережете маршрут і не поділитеся квитанцією.',
              '**Місця й точки маршруту**, які ви вводите або обираєте на мапі: ми надсилаємо їх нашим постачальникам мап і маршрутів (див. розділ 5), щоб знайти адреси та прокласти маршрут.',
              '**Технічні дані** (IP-адреса, тип браузера, сторінки, час запиту): їх обробляють наші постачальники хостингу й мережі, щоб показувати сайт, захищати його від атак і обмежувати зловживання. Їх також можуть записувати журнали нашого сервера.',
            ] },
            { kind: 'p', text: '**Коли ви входите через Google**' },
            { kind: 'list', items: [
              '**Ваш профіль Google**: ім\'я, адреса електронної пошти, ідентифікатор облікового запису Google і посилання на фото профілю. Вони потрібні, щоб створити ваш обліковий запис і забезпечувати його роботу.',
              '**Ваші налаштування**: мова, відображуване ім\'я, типова витрата пального тощо.',
              '**Те, що ви зберігаєте**: маршрути (назви місць і координати), автомобілі та квитанції поїздок.',
            ] },
            { kind: 'p', text: '**Коли ви користуєтеся ШІ-помічником**' },
            { kind: 'list', items: [
              'Ваші **повідомлення** і **поточні точки маршруту** надсилаються до OpenAI, щоб сформувати відповідь.',
              'Ми зберігаємо **запис про використання ШІ**: ваше повідомлення, електронну пошту (якщо ви увійшли), IP-адресу та результат. Це потрібно, щоб запобігати зловживанням і виправляти помилки.',
              'Технічний слід кожного запиту до ШІ (ваше повідомлення й відповідь, пов\'язані з вашим обліковим записом) зберігається в нашого постачальника моніторингу ШІ Langfuse, у ЄС.',
            ] },
            { kind: 'p', text: '**Коли ви ділитеся квитанцією поїздки**' },
            { kind: 'list', items: [
              'Квитанція містить вартість поїздки, обрані вами підписи «Звідки» і «Куди» та маршрут на мапі.',
              '**Її може переглянути будь-хто, хто має посилання.** Якщо не хочете розкривати домашню адресу, вкажіть місто чи орієнтир.',
            ] },
            { kind: 'p', text: 'Ми не продаємо ваші дані, не показуємо рекламу і не використовуємо ваші дані для реклами.' },
          ],
        },
        {
          id: 'legal-basis',
          heading: '4. Чому ми маємо право використовувати ваші дані',
          blocks: [
            { kind: 'list', items: [
              '**Щоб надавати сервіс, який ви просите** (обліковий запис, збережені маршрути, квитанції, відповіді ШІ): це необхідно для виконання нашої з вами угоди — Умов користування.',
              '**Щоб сервіс був безпечним і працював** (технічні дані, журнали, обмеження зловживань, записи про використання ШІ): наш законний інтерес захищати сервіс і його користувачів.',
              '**Якщо закон вимагає вашої згоди**, ми спершу її попросимо. Наразі ми не використовуємо файлів cookie чи подібних технологій, для яких потрібна згода (див. розділ 8).',
            ] },
          ],
        },
        {
          id: 'sharing',
          heading: '5. Кому ми передаємо дані',
          blocks: [
            { kind: 'p', text: 'Ми працюємо з перевіреними постачальниками, які обробляють дані за нашим дорученням (розпорядниками) і лише в обсязі, потрібному для роботи сервісу:' },
            { kind: 'table', head: ['Постачальник', 'Для чого', 'Що отримує', 'Де'], rows: [
              ['Oracle Cloud', 'Хостинг застосунку й бази даних', 'Усе, що зберігає сервіс', 'Франкфурт, Німеччина (ЄС)'],
              ['Cloudflare', 'Доставка сайту, захист, базова статистика трафіку', 'Технічні дані (IP-адреса, запити)', 'Глобальна мережа'],
              ['Google', 'Вхід в обліковий запис', 'Ваш запит на вхід; Google передає нам ваш профіль', 'США та інші країни'],
              ['OpenAI', 'ШІ-помічник', 'Ваші повідомлення до ШІ та точки маршруту', 'США'],
              ['Langfuse', 'Контроль якості ШІ', 'Повідомлення, відповіді ШІ, ідентифікатор облікового запису', 'ЄС'],
              ['Mapbox', 'Мапи та розрахунок маршрутів', 'Точки маршруту, технічні дані', 'США'],
              ['OpenStreetMap Nominatim', 'Пошук адрес', 'Текст пошуку або координати. Ваш браузер звертається до нього напряму, тож він бачить і вашу IP-адресу', 'Європа'],
              ['Публічні сервери OSRM', 'Резервний розрахунок маршруту, якщо Mapbox недоступний', 'Точки маршруту', 'Європа'],
              ['Open-Meteo', 'Погода на маршруті', 'Лише координати маршруту', 'Європа'],
            ] },
            { kind: 'p', text: 'Ми також можемо розкрити дані, якщо цього вимагає закон.' },
          ],
        },
        {
          id: 'transfers',
          heading: '6. Передавання даних за кордон',
          blocks: [
            { kind: 'p', text: 'Деякі постачальники, як-от OpenAI, Mapbox і Google, обробляють дані в США. Якщо цього вимагає право ЄС або України, таке передавання відбувається із запобіжниками, які пропонують постачальники, зокрема стандартними договірними умовами ЄС.' },
          ],
        },
        {
          id: 'retention',
          heading: '7. Скільки ми зберігаємо дані',
          blocks: [
            { kind: 'table', head: ['Дані', 'Строк зберігання'], rows: [
              ['Обліковий запис, збережені маршрути й автомобілі', 'Доки ви їх не видалите або не видалите обліковий запис'],
              ['Квитанції, створені після входу', 'Доки ви не видалите квитанцію або обліковий запис'],
              ['Квитанції, створені без облікового запису', '30 днів'],
              ['Записи про використання ШІ (повідомлення, пошта, IP-адреса)', '90 днів, потім видаляються автоматично'],
              ['Сліди моніторингу ШІ (Langfuse)', '30 днів'],
              ['Сесія входу', 'До виходу або 24 години бездіяльності'],
              ['Журнали сервера', '14 днів'],
              ['Резервні копії', 'До 30 днів'],
            ] },
            { kind: 'p', text: 'Коли ви видаляєте обліковий запис, ми одразу видаляємо ваш профіль, збережені маршрути, автомобілі, квитанції та записи про використання ШІ. Копії в резервних копіях зникають, коли спливає строк їхнього зберігання.' },
          ],
        },
        {
          id: 'cookies',
          heading: '8. Файли cookie та локальне сховище',
          blocks: [
            { kind: 'p', text: 'Ми використовуємо лише те, без чого сайт не працює. **Жодних аналітичних чи рекламних файлів cookie.**' },
            { kind: 'table', head: ['Назва', 'Тип', 'Призначення', 'Строк'], rows: [
              ['SESSIONID', 'Файл cookie, суворо необхідний', 'Зберігає ваш вхід в обліковий запис', 'До виходу або 24 години бездіяльності'],
              ['XSRF-TOKEN', 'Файл cookie, суворо необхідний', 'Захищає форми від підробки міжсайтових запитів', 'Сесія браузера'],
              ['language, theme', 'Локальне сховище', 'Запам\'ятовує мову та світлу чи темну тему', 'Доки ви не очистите дані браузера'],
              ['tripCalculate_*, tc_car_v1', 'Локальне сховище', 'Запам\'ятовує останній маршрут, налаштування та автомобіль у планувальнику', 'Доки ви не очистите дані браузера або не видалите обліковий запис'],
            ] },
            { kind: 'p', text: 'Cloudflare може встановлювати власні суворо необхідні файли cookie для захисту сайту від ботів. Якщо ми колись додамо аналітику чи інші необов\'язкові файли cookie, ми спершу попросимо вашої згоди й оновимо цю політику.' },
          ],
        },
        {
          id: 'your-rights',
          heading: '9. Ваші права',
          blocks: [
            { kind: 'p', text: 'Залежно від країни, де ви живете, ви можете:' },
            { kind: 'list', items: [
              '**дізнатися**, які дані про вас ми маємо, і отримати їхню копію;',
              '**виправити** їх (відображуване ім\'я та налаштування можна змінити в особистому кабінеті);',
              '**видалити** їх (Особистий кабінет → Видалити обліковий запис видаляє їх одразу);',
              '**заперечити** проти певного використання або **обмежити** його;',
              '**перенести** свої дані до іншого сервісу.',
            ] },
            { kind: 'p', text: 'Щоб скористатися будь-яким із цих прав, зокрема отримати копію своїх даних, напишіть на {email}. Ми відповідаємо протягом 30 днів і можемо попросити підтвердити запит з адреси електронної пошти вашого облікового запису.' },
            { kind: 'p', text: 'Ви також можете поскаржитися до органу із захисту персональних даних: в Україні це Уповноважений Верховної Ради України з прав людини, у ЄС — відповідний орган вашої країни.' },
          ],
        },
        {
          id: 'children',
          heading: '10. Діти',
          blocks: [
            { kind: 'p', text: 'Калькулятором поїздок може користуватися будь-хто без облікового запису. Щоб створити обліковий запис, потрібен обліковий запис Google, тож діють вікові обмеження Google. Якщо вам менше 16 років і ви живете в ЄС, для створення облікового запису може знадобитися дозвіл батьків. Якщо ви вважаєте, що дитина передала нам персональні дані без потрібного дозволу, напишіть нам, і ми їх видалимо.' },
          ],
        },
        {
          id: 'security',
          heading: '11. Безпека',
          blocks: [
            { kind: 'p', text: 'Сайт працює лише через HTTPS. Доступ до даних обмежено тим, що потрібно кожній частині сервісу, а адміністративні інструменти доступні лише з обліковим записом адміністратора. Жодна система не є абсолютно захищеною. Якщо витік торкнеться ваших даних, ми повідомимо вас і відповідні органи, коли цього вимагає закон.' },
          ],
        },
        {
          id: 'changes',
          heading: '12. Зміни до цієї політики',
          blocks: [
            { kind: 'p', text: 'Коли наші практики зміняться, ми оновимо цю сторінку та дату набрання чинності вгорі. Про суттєві зміни ми повідомимо на сайті.' },
          ],
        },
      ],
    },
    terms: {
      title: 'Умови користування',
      sections: [
        {
          id: 'about',
          heading: '1. Про ці умови',
          blocks: [
            { kind: 'p', text: 'Ці умови регулюють користування TripCalculate (trip-calculate.online), який веде Дмитро Вольський, Львів, Україна. Користуючись сайтом, ви їх приймаєте. Якщо ви не згодні, будь ласка, не користуйтеся сайтом.' },
          ],
        },
        {
          id: 'service',
          heading: '2. Сервіс',
          blocks: [
            { kind: 'p', text: 'TripCalculate допомагає оцінити витрати на пальне, спланувати маршрут і поділити вартість поїздки. Наразі сервіс **безкоштовний**. Ми можемо змінювати, призупиняти або припиняти будь-яку його частину. Якщо колись з\'являться платні функції, ми заздалегідь повідомимо вас і попросимо згоди, перш ніж щось стягувати.' },
          ],
        },
        {
          id: 'account',
          heading: '3. Ваш обліковий запис',
          blocks: [
            { kind: 'list', items: [
              'Ви входите через обліковий запис Google. Дбайте про його безпеку: ви відповідаєте за дії, виконані через ваш обліковий запис.',
              'Ви можете будь-коли видалити обліковий запис в особистому кабінеті.',
            ] },
          ],
        },
        {
          id: 'acceptable-use',
          heading: '4. Допустиме використання',
          blocks: [
            { kind: 'p', text: 'Користуйтеся TripCalculate так, як користується ним людина, що планує поїздки. Зокрема, не можна:' },
            { kind: 'list', items: [
              'перевантажувати сайт чи порушувати його роботу, наприклад надсилати велику кількість автоматичних запитів або обходити наші обмеження;',
              'масово копіювати дані із сайту за допомогою ботів чи скраперів;',
              'намагатися зламати сайт, облікові записи інших користувачів чи наші системи або перевіряти їхній захист без нашого письмового дозволу;',
              'використовувати ШІ-помічника для чогось, крім планування поїздок, чи намагатися змусити його створити шкідливий вміст;',
              'поширювати квитанції чи інший вміст, що є незаконним, образливим або порушує права інших людей;',
              'використовувати сервіс для порушення закону.',
            ] },
          ],
        },
        {
          id: 'your-content',
          heading: '5. Ваш вміст',
          blocks: [
            { kind: 'p', text: 'Маршрути, назви місць, дані автомобілів і квитанції, які ви створюєте, належать вам. Ви дозволяєте нам зберігати й показувати їх у тому обсязі, який потрібен для роботи сервісу. Наприклад, квитанцію, якою ви поділилися, бачить кожен, хто має посилання.' },
          ],
        },
        {
          id: 'estimates',
          heading: '6. Розрахунки та ШІ-помічник',
          blocks: [
            { kind: 'list', items: [
              'Вартість, відстань, час у дорозі, ціни на пальне й погода — це **орієнтовні оцінки**. Вони можуть бути неточними чи застарілими. Реальні витрати залежать від вашого авто, стилю водіння та стану доріг.',
              'ШІ-помічник може помилятися. Важливі деталі, як-от маршрут і місця, перевіряйте самостійно.',
              'TripCalculate не є навігаційною системою. Завжди дотримуйтеся дорожніх знаків і правил дорожнього руху та зважайте на умови на дорозі.',
            ] },
          ],
        },
        {
          id: 'no-warranty',
          heading: '7. Відмова від гарантій',
          blocks: [
            { kind: 'p', text: 'Сервіс надається **«як є» та «як доступно»**, без будь-яких гарантій, наскільки це дозволяє закон.' },
          ],
        },
        {
          id: 'liability',
          heading: '8. Обмеження відповідальності',
          blocks: [
            { kind: 'p', text: 'Наскільки це дозволяє закон, ми не відповідаємо за непрямі чи опосередковані збитки, а також за збитки через те, що ви покладалися на оцінки чи відповіді ШІ. Ніщо в цих умовах не обмежує відповідальність, яку закон не дозволяє обмежувати, і не зменшує ваших обов\'язкових прав споживача.' },
          ],
        },
        {
          id: 'third-parties',
          heading: '9. Сторонні сервіси',
          blocks: [
            { kind: 'p', text: 'Сайт використовує сервіси інших компаній: вхід через Google, мапи, маршрути, погоду. На них поширюються їхні власні умови, і ми за них не відповідаємо.' },
          ],
        },
        {
          id: 'suspension',
          heading: '10. Обмеження та припинення доступу',
          blocks: [
            { kind: 'p', text: 'Ми можемо обмежити, призупинити чи закрити доступ або видалити обліковий запис, якщо він порушує ці умови чи створює загрозу для сервісу або інших користувачів. Коли це доречно, ми пояснимо причину. Ви можете будь-коли припинити користуватися сервісом і видалити обліковий запис.' },
          ],
        },
        {
          id: 'changes',
          heading: '11. Зміни до цих умов',
          blocks: [
            { kind: 'p', text: 'Ми можемо оновлювати ці умови. Нову версію буде опубліковано тут із новою датою набрання чинності, а про суттєві зміни ми повідомимо на сайті. Якщо після цього ви продовжуєте користуватися сервісом, ви приймаєте нові умови.' },
          ],
        },
        {
          id: 'governing-law',
          heading: '12. Застосовне право',
          blocks: [
            { kind: 'p', text: 'Ці умови регулюються правом України, а спори розглядають суди України. Це не позбавляє вас обов\'язкового захисту, який надає право країни, де ви живете.' },
          ],
        },
        {
          id: 'languages',
          heading: '13. Мовні версії',
          blocks: [
            { kind: 'p', text: 'Ці умови та Політика конфіденційності доступні англійською та українською мовами з однаковим змістом. Якщо через помилку перекладу вони відрізняються, переважає англійська версія.' },
          ],
        },
        {
          id: 'contact',
          heading: '14. Контакти',
          blocks: [
            { kind: 'p', text: 'Питання щодо цих умов: {email}' },
          ],
        },
      ],
    },
  },
};
