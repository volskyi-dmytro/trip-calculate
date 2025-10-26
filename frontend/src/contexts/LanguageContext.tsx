import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { Language } from '../types';

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
    'header.title': 'Split expenses simply!',
    'header.createTrip': 'Create a trip',
    'header.calculate': 'Calculate now',
    'header.login': 'Sign in with Google',
    'header.logout': 'Logout',
    'header.loginRequired': 'Login required',

    // Intro
    'intro.title': 'All-In-One Trip Manager',
    'intro.description': 'Are you bored and annoyed when it comes to fuel cost calculation before or after the trip? You can use quick calculation instead! Spend more time on your journey rather arguing about expenses with our platform!',
    'intro.userFriendly.title': 'User-Friendly',
    'intro.userFriendly.text': 'Our interface is designed with simplicity in mind. Easily navigate through trip planning and expense splitting.',
    'intro.routePlanner.title': 'Route Planner',
    'intro.routePlanner.text': 'Plan the most efficient routes to save fuel and time.',
    'intro.quickLookup.title': 'Quick Lookup',
    'intro.quickLookup.text': 'Quickly find routes, fuel stops, and more with Quick Lookup.',

    // FAQ
    'faq.title': 'Frequently Asked Questions',
    'faq.howWorks.question': 'How does Trip Planner work?',
    'faq.howWorks.answer': 'Trip Planner allows you to easily plan and split expenses among your trip participants. Simply enter your trip details, and we\'ll do the rest.',
    'faq.free.question': 'Is Trip Planner free to use?',
    'faq.free.answer': 'Yes, Trip Planner offers a free version with basic features. Additional premium features will be available for a small fee.',
    'faq.abroad.question': 'Can I use Trip Planner abroad?',
    'faq.abroad.answer': 'Absolutely! Trip Planner works globally, making it easy to plan trips and split expenses with friends and family anywhere in the world.',

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

    // Footer
    'footer.connectWith': 'Connect with me on:',
  },
  uk: {
    // Header
    'header.title': 'Просто поділіть витрати!',
    'header.createTrip': 'Створити поїздку',
    'header.calculate': 'Швидкий розрахунок',
    'header.login': 'Увійти через Google',
    'header.logout': 'Вийти',
    'header.loginRequired': 'Потрібен вхід',

    // Intro
    'intro.title': 'Менеджер поїздок все-в-одному',
    'intro.description': 'Чи втомилися ви від розрахунку вартості палива до чи після поїздки? Використовуйте Швидкий Розрахунок замість цього! Не сперечайтеся про витрати - проведіть більше часу в подорожі за допомогою нашої платформи!',
    'intro.userFriendly.title': 'Зручний у використанні',
    'intro.userFriendly.text': 'Наш інтерфейс розроблений з урахуванням простоти. Легко перемикайтеся між плануванням поїздок та розподілом витрат.',
    'intro.routePlanner.title': 'Планування маршрутів',
    'intro.routePlanner.text': 'Плануйте найефективніші маршрути для економії палива та часу.',
    'intro.quickLookup.title': 'Швидкий пошук',
    'intro.quickLookup.text': 'Знаходьте маршрути, зупинки для заправки тощо за допомогою Швидкого Пошуку.',

    // FAQ
    'faq.title': 'Часто задавані питання',
    'faq.howWorks.question': 'Як працює Trip Planner?',
    'faq.howWorks.answer': 'Trip Planner дозволяє легко планувати та розподіляти витрати між учасниками поїздки. Просто введіть деталі поїздки, і ми зробимо все інше.',
    'faq.free.question': 'Чи є Trip Planner безкоштовним для використання?',
    'faq.free.answer': 'Так, Trip Planner пропонує безкоштовну версію з базовими функціями. Додаткові преміум-функції будуть доступні за невелику плату.',
    'faq.abroad.question': 'Чи можу я використовувати Trip Planner за кордоном?',
    'faq.abroad.answer': 'Звичайно! Trip Planner працює по всьому світу, що дозволяє легко планувати поїздки та розподіляти витрати з друзями та родиною будь-де у світі.',

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

    // Footer
    'footer.connectWith': 'Зв\'яжіться зі мною:',
  },
};

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const savedLang = localStorage.getItem('language');
    return (savedLang as Language) || 'uk';
  });

  useEffect(() => {
    document.documentElement.setAttribute('lang', language);
    localStorage.setItem('language', language);
  }, [language]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
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
