import { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { Language } from '../types';
import { isSupportedLocale, withLocalePrefix } from '../utils/locale';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// Translation object
const translations: Record<Language, Record<string, string>> = {
  en: {
    // Header
    'header.title': 'Know your trip costs before you leave',
    'header.tagline': 'Plan routes on a live map, estimate fuel costs from real road distances, and split the total between passengers.',
    'header.signInHint': 'Sign in with Google to create and save trips. The quick calculator works without an account.',
    'header.createTrip': 'Create a trip',
    'header.calculate': 'Quick calculation',
    'header.login': 'Sign in with Google',
    'header.logout': 'Logout',
    'header.loginRequired': 'Login required',
    'header.nav.home': 'Home',
    'header.nav.routePlanner': 'Route Planner',
    'header.nav.dashboard': 'Dashboard',
    'header.nav.admin': 'Admin',
    'header.returnHome': 'Return to Homepage',

    // User Menu
    'userMenu.myRoutes': 'My Routes',

    // Intro
    'intro.title': 'Everything a road trip needs',
    'intro.description': 'Trip Calculate covers the practical side of travelling by car: how far it is, what the fuel will cost, and who owes what at the end — plan it yourself, or describe the trip and let a team of AI agents build it for you.',
    'intro.aiAssistant.title': 'AI trip assistant',
    'intro.aiAssistant.text': 'Describe your trip in plain language. Specialist AI agents find the stops, check live country-average fuel prices, and pull a weather forecast for your route and travel date — with every step visible as it runs.',
    'intro.userFriendly.title': 'Clear cost breakdown',
    'intro.userFriendly.text': 'Enter consumption, distance, and fuel price — get the total cost and the per-passenger share in seconds.',
    'intro.routePlanner.title': 'Route planning',
    'intro.routePlanner.text': 'Build multi-stop routes on an interactive map with real road distances and driving times, then hand off to Waze for turn-by-turn navigation.',
    'intro.quickLookup.title': 'Quick calculator',
    'intro.quickLookup.text': 'No account needed for a fast estimate. Repeated calculations are cached, so checking variants stays instant.',
    'intro.carGarage.title': 'Car garage',
    'intro.carGarage.text': "Don't know your car's fuel consumption? Pick your model from a catalog of 130+ cars with real-world consumption figures, or let AI estimate it. Save cars to your garage and your default car fills in every calculation automatically.",

    // FAQ
    'faq.title': 'Frequently Asked Questions',
    'faq.howWorks.question': 'How does the route planner work?',
    'faq.howWorks.answer': 'Type your trip in plain language and AI agents build the route, price the fuel, and check the weather along the way — or place stops on the map yourself. Either way, distances and driving times come from real roads, and estimates update as you edit the trip.',
    'faq.free.question': 'Is Trip Calculate free to use?',
    'faq.free.answer': 'Yes. The expense calculator works without an account, and the route planner is free too — just sign in with Google to build, save, and share routes.',
    'faq.abroad.question': 'Can I use Trip Calculate abroad?',
    'faq.abroad.answer': 'Yes. Routing works worldwide, so you can plan international trips with road-based distances in any country.',
    'faq.consumption.question': "How do I find my car's fuel consumption?",
    'faq.consumption.answer': 'Use the built-in car catalog: 130+ popular models with realistic mixed-cycle consumption for each fuel type (petrol, diesel, LPG). Can’t find your car? Sign in and describe it in plain words to get an AI estimate, or pick a vehicle-class preset — from city car to minivan.',

    // Calculator
    'calculator.title': 'Calculate Trip Expenses',
    'calculator.fuelConsumption': 'Custom Fuel Consumption (L/100km):',
    'calculator.passengers': 'Number of Passengers:',
    'calculator.distance': 'Distance (km):',
    'calculator.fuelCost': 'Fuel Cost (per liter):',
    'calculator.calculate': 'Calculate',
    'calculator.reset': 'Reset',
    'calculator.totalFuelCost': 'Total Fuel Cost',
    'calculator.costPerPassenger': 'Cost Per Passenger',

    // Dashboard
    'dashboard.title': 'User Dashboard',
    'dashboard.subtitle': 'Manage your profile, routes, and settings',
    'dashboard.error.fetchFailed': 'Failed to load dashboard data',
    'dashboard.error.noData': 'No data available',

    'dashboard.profile.title': 'Profile',
    'dashboard.profile.accessGranted': 'Access Granted',
    'dashboard.profile.noAccess': 'No Access',
    'dashboard.profile.joined': 'Joined',
    'dashboard.profile.lastLogin': 'Last login',
    'dashboard.profile.routeAccess': 'Route Planner',

    'dashboard.stats.title': 'Statistics',
    'dashboard.stats.totalRoutes': 'Total Routes',
    'dashboard.stats.totalDistance': 'Total Distance',
    'dashboard.stats.totalFuelCost': 'Total Fuel Cost',
    'dashboard.stats.accountAge': 'Account Age',
    'dashboard.stats.days': 'days',

    'dashboard.routes.title': 'My Routes',
    'dashboard.routes.empty': 'You haven\'t created any routes yet',
    'dashboard.routes.createFirst': 'Create Your First Route',
    'dashboard.routes.sortBy': 'Sort by',
    'dashboard.routes.sortNewest': 'Newest First',
    'dashboard.routes.sortOldest': 'Oldest First',
    'dashboard.routes.sortDistance': 'By Distance',
    'dashboard.routes.waypoints': 'waypoints',
    'dashboard.routes.edit': 'Edit',
    'dashboard.routes.delete': 'Delete',
    'dashboard.routes.deleteSuccess': 'Route deleted successfully',
    'dashboard.routes.deleteError': 'Failed to delete route',
    'dashboard.routes.deleting': 'Deleting...',
    'dashboard.routes.cancel': 'Cancel',
    'dashboard.routes.deleteConfirmTitle': 'Delete Route',
    'dashboard.routes.deleteConfirmMessage': 'Are you sure you want to delete',
    'dashboard.routes.deleteConfirmWarning': 'This action cannot be undone.',

    'dashboard.editProfile.title': 'Edit Profile',
    'dashboard.editProfile.description': 'Update your profile information',
    'dashboard.editProfile.displayName': 'Display Name',
    'dashboard.editProfile.displayNameHint': 'Leave empty to use your Google name',
    'dashboard.editProfile.preferredLanguage': 'Preferred Language',
    'dashboard.editProfile.languageEnglish': 'English',
    'dashboard.editProfile.languageUkrainian': 'Ukrainian',
    'dashboard.editProfile.emailNotifications': 'Enable email notifications',
    'dashboard.editProfile.save': 'Save Changes',
    'dashboard.editProfile.saving': 'Saving...',
    'dashboard.editProfile.cancel': 'Cancel',
    'dashboard.editProfile.success': 'Profile updated successfully',
    'dashboard.editProfile.error.displayNameTooLong': 'Display name is too long (max 50 characters)',
    'dashboard.editProfile.error.updateFailed': 'Failed to update profile',

    'dashboard.quickActions.title': 'Quick Actions',
    'dashboard.quickActions.createRoute': 'Create New Route',
    'dashboard.quickActions.createRouteDesc': 'Plan a new trip with route planner',
    'dashboard.quickActions.calculateTrip': 'Calculate Trip',
    'dashboard.quickActions.calculateTripDesc': 'Quick expense calculator',
    'dashboard.quickActions.downloadData': 'Download My Data',
    'dashboard.quickActions.downloadDataDesc': 'Export your account data (GDPR)',
    'dashboard.quickActions.downloadDataInfo': 'Data export feature coming soon',
    'dashboard.quickActions.downloadDataError': 'Failed to download data',
    'dashboard.quickActions.deleteAccount': 'Delete Account',
    'dashboard.quickActions.deleteAccountDesc': 'Permanently delete your account',
    'dashboard.quickActions.deleteAccountSuccess': 'Account deleted successfully',
    'dashboard.quickActions.deleteAccountError': 'Failed to delete account',
    'dashboard.quickActions.deleteAccountTitle': 'Delete Account',
    'dashboard.quickActions.deleteAccountWarning': 'This action is permanent and cannot be undone!',
    'dashboard.quickActions.deleteAccountWarning1': 'All your routes and data will be deleted',
    'dashboard.quickActions.deleteAccountWarning2': 'Your access to Route Planner will be revoked',
    'dashboard.quickActions.deleteAccountWarning3': 'You will be logged out immediately',
    'dashboard.quickActions.deleteAccountConfirm': 'Are you absolutely sure?',
    'dashboard.quickActions.deleting': 'Deleting...',
    'dashboard.quickActions.cancel': 'Cancel',

    'dashboard.cars.title': 'My Cars',
    'dashboard.cars.empty': 'Add your car so trip calculators fill in automatically.',
    'dashboard.cars.add': 'Add car',
    'dashboard.cars.default': 'Default',
    'dashboard.cars.setDefault': 'Set default',
    'dashboard.cars.setDefaultSuccess': 'Default car updated',
    'dashboard.cars.edit': 'Edit',
    'dashboard.cars.delete': 'Delete',
    'dashboard.cars.deleteTitle': 'Delete car?',
    'dashboard.cars.deleteConfirm': 'This cannot be undone.',
    'dashboard.cars.cancel': 'Cancel',
    'dashboard.cars.name': 'Name',
    'dashboard.cars.consumption': 'Consumption (L/100km)',
    'dashboard.cars.save': 'Save',
    'dashboard.cars.limitReached': 'Car limit reached (10)',
    'dashboard.cars.actionFailed': 'Something went wrong. Please try again.',

    'dashboard.security.title': 'Security',
    'dashboard.security.provider': 'Authentication Provider',
    'dashboard.security.sessionExpires': 'Session Expires',
    'dashboard.security.sessionDuration': '24 hours',
    'dashboard.security.sessionNote': 'Your session will expire after 24 hours of inactivity',
    'dashboard.security.logout': 'Logout',

    // Admin
    'admin.title': 'Admin Dashboard',
    'admin.subtitle': 'Manage users, access requests, and system settings',
    'admin.tabs.overview': 'Overview',
    'admin.tabs.users': 'Users',
    'admin.tabs.accessRequests': 'Access Requests',

    'admin.accessDenied.title': 'Access Denied',
    'admin.accessDenied.message': 'You do not have permission to access this page. Administrator privileges are required.',
    'admin.accessDenied.goHome': 'Go to Home',

    'admin.overview.totalUsers': 'Total Users',
    'admin.overview.activeUsers': 'Active Users',
    'admin.overview.totalRoutes': 'Total Routes',
    'admin.overview.totalWaypoints': 'Total Waypoints',
    'admin.overview.pendingRequests': 'Pending Requests',
    'admin.overview.usersWithAccess': 'Users With Access',
    'admin.overview.newUsers': 'New Users',
    'admin.overview.last24h': 'Last 24 Hours',
    'admin.overview.last7d': 'Last 7 Days',
    'admin.overview.last30d': 'Last 30 Days',
    'admin.overview.error.fetchFailed': 'Failed to load system statistics',
    'admin.overview.error.noData': 'No statistics available',

    'admin.users.title': 'User Management',
    'admin.users.search': 'Search users by name or email',
    'admin.users.empty': 'No users found',
    'admin.users.error.fetchFailed': 'Failed to load users',
    'admin.users.table.user': 'User',
    'admin.users.table.role': 'Role',
    'admin.users.table.access': 'Access',
    'admin.users.table.routes': 'Routes',
    'admin.users.table.lastLogin': 'Last Login',
    'admin.users.table.actions': 'Actions',
    'admin.users.table.granted': 'Granted',
    'admin.users.table.denied': 'None',
    'admin.users.action.viewDetails': 'View Details',
    'admin.users.action.grantAccess': 'Grant Access',
    'admin.users.action.revokeAccess': 'Revoke Access',
    'admin.users.action.promoteToAdmin': 'Promote to Admin',
    'admin.users.action.demoteToUser': 'Demote to User',
    'admin.users.action.deleteUser': 'Delete User',
    'admin.users.action.grantSuccess': 'Access granted successfully',
    'admin.users.action.grantError': 'Failed to grant access',
    'admin.users.action.revokeSuccess': 'Access revoked successfully',
    'admin.users.action.revokeError': 'Failed to revoke access',
    'admin.users.action.roleChangeSuccess': 'User role updated successfully',
    'admin.users.action.roleChangeError': 'Failed to update user role',
    'admin.users.action.deleteSuccess': 'User deleted successfully',
    'admin.users.action.deleteError': 'Failed to delete user',
    'admin.users.delete.title': 'Delete User',
    'admin.users.delete.message': 'Are you sure you want to delete',
    'admin.users.delete.warning': 'This will permanently delete all user data including routes and cannot be undone.',
    'admin.users.delete.confirm': 'Delete User',
    'admin.users.delete.cancel': 'Cancel',
    'admin.users.delete.deleting': 'Deleting...',

    'admin.userDetails.title': 'User Details',
    'admin.userDetails.subtitle': 'View detailed user information',
    'admin.userDetails.basicInfo': 'Basic Information',
    'admin.userDetails.name': 'Name',
    'admin.userDetails.displayName': 'Display Name',
    'admin.userDetails.email': 'Email',
    'admin.userDetails.role': 'Role',
    'admin.userDetails.accountInfo': 'Account Information',
    'admin.userDetails.createdAt': 'Created At',
    'admin.userDetails.lastLogin': 'Last Login',
    'admin.userDetails.featureAccess': 'Feature Access',
    'admin.userDetails.routePlanner': 'Route Planner',
    'admin.userDetails.granted': 'Granted',
    'admin.userDetails.notGranted': 'Not Granted',
    'admin.userDetails.usageStats': 'Usage Statistics',
    'admin.userDetails.totalRoutes': 'Total Routes',
    'admin.userDetails.userId': 'User ID',
    'admin.userDetails.close': 'Close',

    'admin.requests.title': 'Access Requests',
    'admin.requests.empty': 'No access requests found',
    'admin.requests.error.fetchFailed': 'Failed to load access requests',
    'admin.requests.filter.all': 'All',
    'admin.requests.filter.pending': 'Pending',
    'admin.requests.filter.approved': 'Approved',
    'admin.requests.filter.rejected': 'Rejected',
    'admin.requests.status.pending': 'Pending',
    'admin.requests.status.approved': 'Approved',
    'admin.requests.status.rejected': 'Rejected',
    'admin.requests.table.user': 'User',
    'admin.requests.table.feature': 'Feature',
    'admin.requests.table.status': 'Status',
    'admin.requests.table.requestedAt': 'Requested',
    'admin.requests.table.actions': 'Actions',
    'admin.requests.action.approve': 'Approve',
    'admin.requests.action.deny': 'Deny',
    'admin.requests.action.approveSuccess': 'Access request approved',
    'admin.requests.action.approveError': 'Failed to approve request',
    'admin.requests.action.denySuccess': 'Access request denied',
    'admin.requests.action.denyError': 'Failed to deny request',

    // Footer
    'footer.connectWith': 'Connect with me on:',
  },
  uk: {
    // Header
    'header.title': 'Дізнайтеся вартість поїздки заздалегідь',
    'header.tagline': 'Плануйте маршрути на мапі, розраховуйте витрати на паливо за реальними відстанями та діліть суму між пасажирами.',
    'header.signInHint': 'Увійдіть через Google, щоб створювати та зберігати поїздки. Швидкий калькулятор працює без акаунта.',
    'header.createTrip': 'Створити поїздку',
    'header.calculate': 'Швидкий розрахунок',
    'header.login': 'Увійти через Google',
    'header.logout': 'Вийти',
    'header.loginRequired': 'Потрібен вхід',
    'header.nav.home': 'Головна',
    'header.nav.routePlanner': 'Планувальник Маршрутів',
    'header.nav.dashboard': 'Панель',
    'header.nav.admin': 'Адмін',
    'header.returnHome': 'Повернутися на Головну',

    // User Menu
    'userMenu.myRoutes': 'Мої Маршрути',

    // Intro
    'intro.title': 'Усе потрібне для подорожі автомобілем',
    'intro.description': 'Trip Calculate бере на себе практичний бік подорожі: яка відстань, скільки коштуватиме паливо і хто скільки винен наприкінці — сплануйте самостійно або опишіть поїздку, і команда AI-агентів побудує маршрут за вас.',
    'intro.aiAssistant.title': 'AI-асистент подорожі',
    'intro.aiAssistant.text': 'Опишіть поїздку звичайною мовою. Спеціалізовані AI-агенти знаходять зупинки, перевіряють актуальні середні ціни на пальне по країнах і отримують прогноз погоди на маршруті та дату виїзду — кожен крок видно в реальному часі.',
    'intro.userFriendly.title': 'Зрозумілий розрахунок витрат',
    'intro.userFriendly.text': 'Вкажіть витрату палива, відстань і ціну за літр — отримайте загальну вартість і частку кожного пасажира за секунди.',
    'intro.routePlanner.title': 'Планування маршрутів',
    'intro.routePlanner.text': 'Створюйте маршрути з кількома зупинками на інтерактивній мапі з реальними відстанями та часом у дорозі, а потім переходьте до навігації у Waze.',
    'intro.quickLookup.title': 'Швидкий калькулятор',
    'intro.quickLookup.text': 'Для швидкої оцінки акаунт не потрібен. Повторні розрахунки кешуються, тож перевірка варіантів займає мить.',
    'intro.carGarage.title': 'Гараж авто',
    'intro.carGarage.text': 'Не знаєте витрату пального свого авто? Оберіть модель із каталогу 130+ авто з реальними показниками витрати або довірте оцінку AI. Зберігайте авто у гаражі — основне авто автоматично підставляється в усі розрахунки.',

    // FAQ
    'faq.title': 'Часто задавані питання',
    'faq.howWorks.question': 'Як працює планувальник маршрутів?',
    'faq.howWorks.answer': 'Опишіть поїздку звичайною мовою — AI-агенти побудують маршрут, порахують вартість пального та перевірять погоду на шляху, — або додайте зупинки на мапі самостійно. В обох випадках відстані та час у дорозі рахуються реальними дорогами, а оцінки оновлюються під час редагування поїздки.',
    'faq.free.question': 'Чи є Trip Calculate безкоштовним?',
    'faq.free.answer': 'Так. Калькулятор витрат працює без акаунта, а планувальник маршрутів теж безкоштовний — достатньо увійти через Google, щоб створювати, зберігати та ділитися маршрутами.',
    'faq.abroad.question': 'Чи можу я використовувати Trip Calculate за кордоном?',
    'faq.abroad.answer': 'Так. Маршрутизація працює в усьому світі, тож можна планувати міжнародні поїздки з реальними дорожніми відстанями в будь-якій країні.',
    'faq.consumption.question': 'Як дізнатися витрату пального мого авто?',
    'faq.consumption.answer': 'Скористайтеся вбудованим каталогом авто: понад 130 популярних моделей із реалістичною змішаною витратою для кожного типу пального (бензин, дизель, ГБО). Немає вашого авто? Увійдіть і опишіть його своїми словами, щоб отримати оцінку від AI, або оберіть клас авто — від міського хетчбека до мінівена.',

    // Calculator
    'calculator.title': 'Розрахувати витрати на поїздку',
    'calculator.fuelConsumption': 'Власна витрата палива (л/100 км):',
    'calculator.passengers': 'Кількість пасажирів:',
    'calculator.distance': 'Відстань (км):',
    'calculator.fuelCost': 'Вартість палива (за літр):',
    'calculator.calculate': 'Розрахувати',
    'calculator.reset': 'Скинути',
    'calculator.totalFuelCost': 'Загальна вартість палива',
    'calculator.costPerPassenger': 'Вартість на пасажира',

    // Dashboard
    'dashboard.title': 'Панель Користувача',
    'dashboard.subtitle': 'Керуйте своїм профілем, маршрутами та налаштуваннями',
    'dashboard.error.fetchFailed': 'Не вдалося завантажити дані панелі',
    'dashboard.error.noData': 'Дані недоступні',

    'dashboard.profile.title': 'Профіль',
    'dashboard.profile.accessGranted': 'Доступ Надано',
    'dashboard.profile.noAccess': 'Немає Доступу',
    'dashboard.profile.joined': 'Приєднався',
    'dashboard.profile.lastLogin': 'Останній вхід',
    'dashboard.profile.routeAccess': 'Планувальник Маршрутів',

    'dashboard.stats.title': 'Статистика',
    'dashboard.stats.totalRoutes': 'Всього Маршрутів',
    'dashboard.stats.totalDistance': 'Загальна Відстань',
    'dashboard.stats.totalFuelCost': 'Загальна Вартість Палива',
    'dashboard.stats.accountAge': 'Вік Акаунту',
    'dashboard.stats.days': 'днів',

    'dashboard.routes.title': 'Мої Маршрути',
    'dashboard.routes.empty': 'Ви ще не створили жодного маршруту',
    'dashboard.routes.createFirst': 'Створити Перший Маршрут',
    'dashboard.routes.sortBy': 'Сортувати за',
    'dashboard.routes.sortNewest': 'Новіші Спочатку',
    'dashboard.routes.sortOldest': 'Старіші Спочатку',
    'dashboard.routes.sortDistance': 'За Відстанню',
    'dashboard.routes.waypoints': 'точок',
    'dashboard.routes.edit': 'Редагувати',
    'dashboard.routes.delete': 'Видалити',
    'dashboard.routes.deleteSuccess': 'Маршрут успішно видалено',
    'dashboard.routes.deleteError': 'Не вдалося видалити маршрут',
    'dashboard.routes.deleting': 'Видалення...',
    'dashboard.routes.cancel': 'Скасувати',
    'dashboard.routes.deleteConfirmTitle': 'Видалити Маршрут',
    'dashboard.routes.deleteConfirmMessage': 'Ви впевнені, що хочете видалити',
    'dashboard.routes.deleteConfirmWarning': 'Цю дію неможливо скасувати.',

    'dashboard.editProfile.title': 'Редагувати Профіль',
    'dashboard.editProfile.description': 'Оновіть інформацію вашого профілю',
    'dashboard.editProfile.displayName': 'Відображуване Ім\'я',
    'dashboard.editProfile.displayNameHint': 'Залиште порожнім, щоб використовувати ім\'я Google',
    'dashboard.editProfile.preferredLanguage': 'Мова',
    'dashboard.editProfile.languageEnglish': 'Англійська',
    'dashboard.editProfile.languageUkrainian': 'Українська',
    'dashboard.editProfile.emailNotifications': 'Увімкнути сповіщення електронною поштою',
    'dashboard.editProfile.save': 'Зберегти Зміни',
    'dashboard.editProfile.saving': 'Збереження...',
    'dashboard.editProfile.cancel': 'Скасувати',
    'dashboard.editProfile.success': 'Профіль успішно оновлено',
    'dashboard.editProfile.error.displayNameTooLong': 'Відображуване ім\'я занадто довге (макс. 50 символів)',
    'dashboard.editProfile.error.updateFailed': 'Не вдалося оновити профіль',

    'dashboard.quickActions.title': 'Швидкі Дії',
    'dashboard.quickActions.createRoute': 'Створити Новий Маршрут',
    'dashboard.quickActions.createRouteDesc': 'Сплануйте нову поїздку з планувальником маршрутів',
    'dashboard.quickActions.calculateTrip': 'Розрахувати Поїздку',
    'dashboard.quickActions.calculateTripDesc': 'Швидкий калькулятор витрат',
    'dashboard.quickActions.downloadData': 'Завантажити Мої Дані',
    'dashboard.quickActions.downloadDataDesc': 'Експортуйте дані вашого облікового запису (GDPR)',
    'dashboard.quickActions.downloadDataInfo': 'Функція експорту даних незабаром',
    'dashboard.quickActions.downloadDataError': 'Не вдалося завантажити дані',
    'dashboard.quickActions.deleteAccount': 'Видалити Акаунт',
    'dashboard.quickActions.deleteAccountDesc': 'Назавжди видалити ваш обліковий запис',
    'dashboard.quickActions.deleteAccountSuccess': 'Акаунт успішно видалено',
    'dashboard.quickActions.deleteAccountError': 'Не вдалося видалити акаунт',
    'dashboard.quickActions.deleteAccountTitle': 'Видалити Акаунт',
    'dashboard.quickActions.deleteAccountWarning': 'Ця дія є постійною і не може бути скасована!',
    'dashboard.quickActions.deleteAccountWarning1': 'Всі ваші маршрути та дані будуть видалені',
    'dashboard.quickActions.deleteAccountWarning2': 'Ваш доступ до Планувальника Маршрутів буде відкликано',
    'dashboard.quickActions.deleteAccountWarning3': 'Ви будете негайно вийдені з системи',
    'dashboard.quickActions.deleteAccountConfirm': 'Ви абсолютно впевнені?',
    'dashboard.quickActions.deleting': 'Видалення...',
    'dashboard.quickActions.cancel': 'Скасувати',

    'dashboard.cars.title': 'Мої авто',
    'dashboard.cars.empty': 'Додайте своє авто — калькулятори заповнюватимуться автоматично.',
    'dashboard.cars.add': 'Додати авто',
    'dashboard.cars.default': 'За замовчуванням',
    'dashboard.cars.setDefault': 'Зробити основним',
    'dashboard.cars.setDefaultSuccess': 'Основне авто оновлено',
    'dashboard.cars.edit': 'Редагувати',
    'dashboard.cars.delete': 'Видалити',
    'dashboard.cars.deleteTitle': 'Видалити авто?',
    'dashboard.cars.deleteConfirm': 'Цю дію не можна скасувати.',
    'dashboard.cars.cancel': 'Скасувати',
    'dashboard.cars.name': 'Назва',
    'dashboard.cars.consumption': 'Витрата (л/100км)',
    'dashboard.cars.save': 'Зберегти',
    'dashboard.cars.limitReached': 'Досягнуто ліміту авто (10)',
    'dashboard.cars.actionFailed': 'Сталася помилка. Спробуйте ще раз.',

    'dashboard.security.title': 'Безпека',
    'dashboard.security.provider': 'Провайдер Автентифікації',
    'dashboard.security.sessionExpires': 'Сесія Закінчується',
    'dashboard.security.sessionDuration': '24 години',
    'dashboard.security.sessionNote': 'Ваша сесія закінчиться після 24 годин неактивності',
    'dashboard.security.logout': 'Вийти',

    // Admin
    'admin.title': 'Панель Адміністратора',
    'admin.subtitle': 'Керуйте користувачами, запитами на доступ та налаштуваннями системи',
    'admin.tabs.overview': 'Огляд',
    'admin.tabs.users': 'Користувачі',
    'admin.tabs.accessRequests': 'Запити на Доступ',

    'admin.accessDenied.title': 'Доступ Заборонено',
    'admin.accessDenied.message': 'Ви не маєте дозволу на доступ до цієї сторінки. Потрібні привілеї адміністратора.',
    'admin.accessDenied.goHome': 'На Головну',

    'admin.overview.totalUsers': 'Всього Користувачів',
    'admin.overview.activeUsers': 'Активні Користувачі',
    'admin.overview.totalRoutes': 'Всього Маршрутів',
    'admin.overview.totalWaypoints': 'Всього Точок',
    'admin.overview.pendingRequests': 'Запити в Очікуванні',
    'admin.overview.usersWithAccess': 'Користувачів з Доступом',
    'admin.overview.newUsers': 'Нові Користувачі',
    'admin.overview.last24h': 'Останні 24 Години',
    'admin.overview.last7d': 'Останні 7 Днів',
    'admin.overview.last30d': 'Останні 30 Днів',
    'admin.overview.error.fetchFailed': 'Не вдалося завантажити статистику системи',
    'admin.overview.error.noData': 'Статистика недоступна',

    'admin.users.title': 'Управління Користувачами',
    'admin.users.search': 'Пошук користувачів за іменем або email',
    'admin.users.empty': 'Користувачів не знайдено',
    'admin.users.error.fetchFailed': 'Не вдалося завантажити користувачів',
    'admin.users.table.user': 'Користувач',
    'admin.users.table.role': 'Роль',
    'admin.users.table.access': 'Доступ',
    'admin.users.table.routes': 'Маршрути',
    'admin.users.table.lastLogin': 'Останній Вхід',
    'admin.users.table.actions': 'Дії',
    'admin.users.table.granted': 'Надано',
    'admin.users.table.denied': 'Немає',
    'admin.users.action.viewDetails': 'Переглянути Деталі',
    'admin.users.action.grantAccess': 'Надати Доступ',
    'admin.users.action.revokeAccess': 'Відкликати Доступ',
    'admin.users.action.promoteToAdmin': 'Підвищити до Адміністратора',
    'admin.users.action.demoteToUser': 'Понизити до Користувача',
    'admin.users.action.deleteUser': 'Видалити Користувача',
    'admin.users.action.grantSuccess': 'Доступ успішно надано',
    'admin.users.action.grantError': 'Не вдалося надати доступ',
    'admin.users.action.revokeSuccess': 'Доступ успішно відкликано',
    'admin.users.action.revokeError': 'Не вдалося відкликати доступ',
    'admin.users.action.roleChangeSuccess': 'Роль користувача успішно оновлено',
    'admin.users.action.roleChangeError': 'Не вдалося оновити роль користувача',
    'admin.users.action.deleteSuccess': 'Користувача успішно видалено',
    'admin.users.action.deleteError': 'Не вдалося видалити користувача',
    'admin.users.delete.title': 'Видалити Користувача',
    'admin.users.delete.message': 'Ви впевнені, що хочете видалити',
    'admin.users.delete.warning': 'Це назавжди видалить всі дані користувача, включаючи маршрути, і не може бути скасовано.',
    'admin.users.delete.confirm': 'Видалити Користувача',
    'admin.users.delete.cancel': 'Скасувати',
    'admin.users.delete.deleting': 'Видалення...',

    'admin.userDetails.title': 'Деталі Користувача',
    'admin.userDetails.subtitle': 'Перегляд детальної інформації про користувача',
    'admin.userDetails.basicInfo': 'Основна Інформація',
    'admin.userDetails.name': 'Ім\'я',
    'admin.userDetails.displayName': 'Відображуване Ім\'я',
    'admin.userDetails.email': 'Email',
    'admin.userDetails.role': 'Роль',
    'admin.userDetails.accountInfo': 'Інформація про Акаунт',
    'admin.userDetails.createdAt': 'Створено',
    'admin.userDetails.lastLogin': 'Останній Вхід',
    'admin.userDetails.featureAccess': 'Доступ до Функцій',
    'admin.userDetails.routePlanner': 'Планувальник Маршрутів',
    'admin.userDetails.granted': 'Надано',
    'admin.userDetails.notGranted': 'Не Надано',
    'admin.userDetails.usageStats': 'Статистика Використання',
    'admin.userDetails.totalRoutes': 'Всього Маршрутів',
    'admin.userDetails.userId': 'ID Користувача',
    'admin.userDetails.close': 'Закрити',

    'admin.requests.title': 'Запити на Доступ',
    'admin.requests.empty': 'Запитів на доступ не знайдено',
    'admin.requests.error.fetchFailed': 'Не вдалося завантажити запити на доступ',
    'admin.requests.filter.all': 'Всі',
    'admin.requests.filter.pending': 'В Очікуванні',
    'admin.requests.filter.approved': 'Схвалено',
    'admin.requests.filter.rejected': 'Відхилено',
    'admin.requests.status.pending': 'В Очікуванні',
    'admin.requests.status.approved': 'Схвалено',
    'admin.requests.status.rejected': 'Відхилено',
    'admin.requests.table.user': 'Користувач',
    'admin.requests.table.feature': 'Функція',
    'admin.requests.table.status': 'Статус',
    'admin.requests.table.requestedAt': 'Запитано',
    'admin.requests.table.actions': 'Дії',
    'admin.requests.action.approve': 'Схвалити',
    'admin.requests.action.deny': 'Відхилити',
    'admin.requests.action.approveSuccess': 'Запит на доступ схвалено',
    'admin.requests.action.approveError': 'Не вдалося схвалити запит',
    'admin.requests.action.denySuccess': 'Запит на доступ відхилено',
    'admin.requests.action.denyError': 'Не вдалося відхилити запит',

    // Footer
    'footer.connectWith': 'Зв\'яжіться зі мною:',
  },
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const urlLocale = location.pathname.split('/')[1];

  const [language, setLanguageState] = useState<Language>(() => {
    if (isSupportedLocale(urlLocale)) return urlLocale;
    const savedLang = localStorage.getItem('language');
    return (savedLang as Language) || 'uk';
  });

  // The URL is authoritative once it carries a locale: navigating to a
  // /en or /uk path (via a link, back/forward, or a shared URL) must
  // update the active language even if it doesn't match localStorage yet.
  useEffect(() => {
    if (isSupportedLocale(urlLocale) && urlLocale !== language) {
      setLanguageState(urlLocale);
    }
  }, [urlLocale, language]);

  useEffect(() => {
    document.documentElement.setAttribute('lang', language);
    localStorage.setItem('language', language);
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    navigate(withLocalePrefix(location.pathname, lang));
  };

  const t = (key: string): string => {
    return translations[language][key] || key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
