import type { SupportedLanguage } from '../types/models';

export interface TranslationDictionary {
  nav: {
    home: string;
    dashboard: string;
    budgets: string;
    todo: string;
    more: string;
    quickAdd: string;
  };
  home: {
    todaySpend: string;
    monthTotal: string;
    toReview: string;
    dueThisWeek: string;
    recentExpenses: string;
    loadSample: string;
    clearSample: string;
    pasteSms: string;
    scanReceipt: string;
    statementImport: string;
    noExpensesYet: string;
  };
  dashboard: {
    title: string;
    vsLastMonth: string;
    categorySplit: string;
    categoryTotals: string;
    dailySpending: string;
    weekdayVsWeekend: string;
    calendarHeatmap: string;
    topMerchants: string;
    topExpenses: string;
    forecastPrefix: string;
  };
  budgets: {
    title: string;
    overallBudget: string;
    categoryBudgets: string;
    recurringTitle: string;
    splitTitle: string;
    cashWalletTitle: string;
    savingsGoalsTitle: string;
  };
  todo: {
    title: string;
    today: string;
    upcoming: string;
    overdue: string;
    completed: string;
    markPaid: string;
    addTask: string;
  };
  more: {
    title: string;
    language: string;
    theme: string;
    appLock: string;
    exportData: string;
    encryptedBackup: string;
    privacyTitle: string;
    testSms: string;
    deleteAll: string;
  };
}

export const TRANSLATIONS: Record<SupportedLanguage, TranslationDictionary> = {
  en: {
    nav: {
      home: 'Home',
      dashboard: 'Dashboard',
      budgets: 'Budgets',
      todo: 'To-Do',
      more: 'More',
      quickAdd: 'Quick Add',
    },
    home: {
      todaySpend: "Today's Spend",
      monthTotal: 'This Month',
      toReview: 'To Review Inbox',
      dueThisWeek: 'Tasks Due This Week',
      recentExpenses: 'Recent & Filtered Expenses',
      loadSample: 'Load Sample Data',
      clearSample: 'Clear Sample Data',
      pasteSms: 'Paste Bank SMS',
      scanReceipt: 'Scan Receipt',
      statementImport: 'Import Statement',
      noExpensesYet: 'No expenses logged yet',
    },
    dashboard: {
      title: 'Month-End Analytics Dashboard',
      vsLastMonth: 'vs last month',
      categorySplit: 'Category Split (Donut)',
      categoryTotals: 'Category Totals (Bar)',
      dailySpending: 'Daily Spending Pace',
      weekdayVsWeekend: 'Weekday vs Weekend',
      calendarHeatmap: 'Daily Spend Heatmap',
      topMerchants: 'Top 5 Merchants',
      topExpenses: 'Top 5 Biggest Expenses',
      forecastPrefix: "At this pace you'll finish the month at",
    },
    budgets: {
      title: 'Budgets & Smarter Tracking',
      overallBudget: 'Overall Monthly Budget',
      categoryBudgets: 'Category Budgets',
      recurringTitle: 'Recurring Bills, Rent & EMIs',
      splitTitle: 'Split & Shared Expenses',
      cashWalletTitle: 'Cash in Hand Tracker',
      savingsGoalsTitle: 'Savings Goals',
    },
    todo: {
      title: 'Built-In To-Do & Bill Reminders',
      today: 'Today',
      upcoming: 'Upcoming',
      overdue: 'Overdue',
      completed: 'Completed',
      markPaid: 'Mark Paid',
      addTask: 'New Task',
    },
    more: {
      title: 'Settings, Data & Privacy',
      language: 'App Language',
      theme: 'Appearance',
      appLock: 'App Lock (PIN & Biometrics)',
      exportData: 'Export CSV, Excel & PDF Report',
      encryptedBackup: 'Encrypted Backup & Restore',
      privacyTitle: 'On-Device Privacy Architecture',
      testSms: 'Load 5 Test Bank SMS',
      deleteAll: 'Delete All Data',
    },
  },
  ta: {
    nav: {
      home: 'முகப்பு',
      dashboard: 'டாஷ்போர்டு',
      budgets: 'பட்ஜெட்',
      todo: 'பணிகள்',
      more: 'மேலும்',
      quickAdd: 'புதிய செலவு',
    },
    home: {
      todaySpend: 'இன்றைய செலவு',
      monthTotal: 'இந்த மாத மொத்தம்',
      toReview: 'சரிபார்க்க வேண்டியவை',
      dueThisWeek: 'இந்த வார பணிகள்',
      recentExpenses: 'சமீபத்திய செலவுகள்',
      loadSample: 'மாதிரி தரவை ஏற்று',
      clearSample: 'மாதிரி தரவை நீக்கு',
      pasteSms: 'SMS ஒட்டவும்',
      scanReceipt: 'ரசீது ஸ்கேன்',
      statementImport: 'வங்கி அறிக்கை',
      noExpensesYet: 'இன்னும் செலவுகள் பதிவு செய்யப்படவில்லை',
    },
    dashboard: {
      title: 'மாத இறுதி பகுப்பாய்வு',
      vsLastMonth: 'கடந்த மாதத்துடன் ஒப்பீடு',
      categorySplit: 'வகை வாரியான பிரிவு',
      categoryTotals: 'வகை மொத்த செலவு',
      dailySpending: 'தினசரி செலவு போக்கு',
      weekdayVsWeekend: 'வார நாட்கள் vs வார இறுதி',
      calendarHeatmap: 'தினசரி செலவு நாட்காட்டி',
      topMerchants: 'முதல் 5 வணிகர்கள்',
      topExpenses: 'முதல் 5 பெரிய செலவுகள்',
      forecastPrefix: 'இந்த வேகத்தில் மாத இறுதியில் மொத்த செலவு',
    },
    budgets: {
      title: 'பட்ஜெட் & ஸ்மார்ட் கண்காணிப்பு',
      overallBudget: 'மொத்த மாத பட்ஜெட்',
      categoryBudgets: 'வகை வாரியான பட்ஜெட்',
      recurringTitle: 'மாதாந்திர வாடகை & EMI',
      splitTitle: 'பகிர்ந்த செலவுகள் (Split)',
      cashWalletTitle: 'கையிருப்பு ரொக்கம் (Cash)',
      savingsGoalsTitle: 'சேமிப்பு இலக்குகள்',
    },
    todo: {
      title: 'பணிகள் & பில் நினைவூட்டல்கள்',
      today: 'இன்று',
      upcoming: 'வரவிருப்பவை',
      overdue: 'தாமதமானவை',
      completed: 'முடிந்தவை',
      markPaid: 'செலுத்தப்பட்டது',
      addTask: 'புதிய பணி',
    },
    more: {
      title: 'அமைப்புகள், தரவு & தனியுரிமை',
      language: 'மொழி (Language)',
      theme: 'தோற்றம் (Theme)',
      appLock: 'ஆப் லாக் (PIN & Biometrics)',
      exportData: 'CSV, Excel & PDF பதிவிறக்கம்',
      encryptedBackup: 'பாதுகாப்பான பேக்கப் (Encrypted)',
      privacyTitle: 'தனியுரிமை பாதுகாப்பு',
      testSms: '5 மாதிரி வங்கி SMS சோதனை',
      deleteAll: 'அனைத்து தரவையும் அழி',
    },
  },
  hi: {
    nav: {
      home: 'होम',
      dashboard: 'डैशबोर्ड',
      budgets: 'बजट',
      todo: 'कार्य सूची',
      more: 'अधिक',
      quickAdd: 'नया खर्च',
    },
    home: {
      todaySpend: 'आज का खर्च',
      monthTotal: 'इस महीने का कुल',
      toReview: 'समीक्षा के लिए इनबॉक्स',
      dueThisWeek: 'इस सप्ताह के कार्य',
      recentExpenses: 'हाल के खर्च',
      loadSample: 'सैंपल डेटा लोड करें',
      clearSample: 'सैंपल डेटा हटाएं',
      pasteSms: 'बैंक SMS पेस्ट करें',
      scanReceipt: 'रसीद स्कैन करें',
      statementImport: 'स्टेटमेंट इम्पोर्ट',
      noExpensesYet: 'अभी तक कोई खर्च दर्ज नहीं किया गया है',
    },
    dashboard: {
      title: 'महीने के अंत का डैशबोर्ड',
      vsLastMonth: 'पिछले महीने की तुलना में',
      categorySplit: 'श्रेणी के अनुसार खर्च',
      categoryTotals: 'श्रेणी कुल खर्च',
      dailySpending: 'दैनिक खर्च ग्राफ',
      weekdayVsWeekend: 'कार्यदिवस बनाम सप्ताहांत',
      calendarHeatmap: 'दैनिक खर्च कैलेंडर',
      topMerchants: 'शीर्ष 5 मर्चेंट',
      topExpenses: 'शीर्ष 5 सबसे बड़े खर्च',
      forecastPrefix: 'इस गति से महीने के अंत तक कुल खर्च होगा',
    },
    budgets: {
      title: 'बजट और स्मार्ट ट्रैकिंग',
      overallBudget: 'कुल मासिक बजट',
      categoryBudgets: 'श्रेणी बजट',
      recurringTitle: 'मासिक किराया, सब्सक्रिप्शन और EMI',
      splitTitle: 'साझा खर्च (Split)',
      cashWalletTitle: 'नकद ट्रैकर (Cash in Hand)',
      savingsGoalsTitle: 'बचत लक्ष्य',
    },
    todo: {
      title: 'कार्य सूची और बिल रिमाइंडर',
      today: 'आज',
      upcoming: 'आगामी',
      overdue: 'अतिदेय (Overdue)',
      completed: 'पूर्ण',
      markPaid: 'भुगतान किया',
      addTask: 'नया कार्य',
    },
    more: {
      title: 'सेटिंग्स, डेटा और गोपनीयता',
      language: 'भाषा (Language)',
      theme: 'थीम (Theme)',
      appLock: 'ऐप लॉक (PIN और बायोमेट्रिक)',
      exportData: 'CSV, Excel और PDF रिपोर्ट',
      encryptedBackup: 'एन्क्रिप्टेड बैकअप और रीस्टोर',
      privacyTitle: 'डेटा गोपनीयता जानकारी',
      testSms: '5 टेस्ट बैंक SMS लोड करें',
      deleteAll: 'सारा डेटा मिटाएं',
    },
  },
};
