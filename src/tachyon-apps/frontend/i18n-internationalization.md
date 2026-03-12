# Tachyon i18n (Internationalization) System

## Overview

Tachyon implements a lightweight internationalization (i18n) system using React Context and Server Components, supporting Japanese and English locales without traditional routing or middleware.

## Architecture

### Design Principles

1. **No Middleware**: Avoid Next.js middleware to comply with project constraints
2. **Server Components First**: Leverage SSR for locale detection and initial rendering
3. **Cookie-Based Persistence**: Store user's locale preference in cookies
4. **Type-Safe**: Full TypeScript support with auto-completion for translation keys

### Locale Detection Priority

```
1. Cookie (tachyon.locale)
   ↓
2. Accept-Language header
   ↓
3. Default (ja)
```

## Implementation

### Core Components

#### 1. Locale Detection (`detectLocale`)

```typescript
// apps/tachyon/src/lib/i18n/detect-locale.ts
import { cookies, headers } from 'next/headers'

export type Locale = 'ja' | 'en'
export const DEFAULT_LOCALE: Locale = 'ja'

export async function detectLocale(): Promise<Locale> {
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get('tachyon.locale')?.value as Locale | undefined

  if (cookieLocale && (cookieLocale === 'ja' || cookieLocale === 'en')) {
    return cookieLocale
  }

  const headersList = await headers()
  const acceptLanguage = headersList.get('accept-language')

  if (acceptLanguage?.includes('ja')) return 'ja'
  if (acceptLanguage?.includes('en')) return 'en'

  return DEFAULT_LOCALE
}
```

#### 2. Translation Dictionary

```typescript
// apps/tachyon/src/lib/i18n/translations.ts
export const translations = {
  ja: {
    common: {
      welcome: 'ようこそ',
      login: 'ログイン',
      // ...
    },
    landing: {
      hero: {
        title: 'AIの力で、ビジネスを加速',
        // ...
      },
    },
    // Namespace structure
  },
  en: {
    common: {
      welcome: 'Welcome',
      login: 'Login',
      // ...
    },
    // Mirror structure
  },
} as const
```

#### 3. I18nProvider (Server Component)

```typescript
// apps/tachyon/src/lib/i18n/i18n-provider.tsx
'use server'

import { I18nClientProvider } from './i18n-client-provider'
import { detectLocale } from './detect-locale'
import { translations } from './translations'

export async function I18nProvider({ children }: { children: React.ReactNode }) {
  const locale = await detectLocale()
  const messages = translations[locale]

  return (
    <I18nClientProvider locale={locale} messages={messages}>
      {children}
    </I18nClientProvider>
  )
}
```

#### 4. Client Provider & Hook

```typescript
// apps/tachyon/src/lib/i18n/i18n-client-provider.tsx
'use client'

import { createContext, useContext } from 'react'
import type { Locale } from './detect-locale'

type I18nContextType = {
  locale: Locale
  messages: typeof translations['ja']
  t: (key: string) => string
  setLocale: (locale: Locale) => void
}

const I18nContext = createContext<I18nContextType | null>(null)

export function I18nClientProvider({ locale, messages, children }) {
  const t = (key: string) => {
    const keys = key.split('.')
    let value: any = messages
    for (const k of keys) {
      value = value?.[k]
    }
    return value || key
  }

  const setLocale = async (newLocale: Locale) => {
    document.cookie = `tachyon.locale=${newLocale}; path=/; max-age=31536000`
    window.location.reload()
  }

  return (
    <I18nContext.Provider value={{ locale, messages, t, setLocale }}>
      {children}
    </I18nContext.Provider>
  )
}

export function useTranslation() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('useTranslation must be used within I18nProvider')
  return context
}
```

### Usage Examples

#### Root Layout Integration

```typescript
// apps/tachyon/src/app/layout.tsx
import { I18nProvider } from '@/lib/i18n/i18n-provider'

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <I18nProvider>
          {children}
        </I18nProvider>
      </body>
    </html>
  )
}
```

#### Language Switcher Component

```typescript
// apps/tachyon/src/components/language-switcher.tsx
'use client'

import { useTranslation } from '@/lib/i18n/i18n-client-provider'

export function LanguageSwitcher() {
  const { locale, setLocale } = useTranslation()

  return (
    <div>
      <button onClick={() => setLocale('ja')} disabled={locale === 'ja'}>
        日本語
      </button>
      <button onClick={() => setLocale('en')} disabled={locale === 'en'}>
        English
      </button>
    </div>
  )
}
```

#### Using Translations in Components

```typescript
'use client'

import { useTranslation } from '@/lib/i18n/i18n-client-provider'

export function WelcomeMessage() {
  const { t } = useTranslation()

  return (
    <div>
      <h1>{t('common.welcome')}</h1>
      <p>{t('landing.hero.title')}</p>
    </div>
  )
}
```

## Translation Organization

### Namespace Structure

```typescript
translations = {
  ja: {
    common: {},           // Shared UI elements
    landing: {},          // Landing page
    sidebar: {},          // Navigation
    billing: {},          // Billing features
    pricingLlm: {},       // LLM pricing pages
    v1beta: {
      sidebar: {},        // v1beta navigation
    },
    // Feature-specific namespaces
  },
}
```

### Best Practices

1. **Group by Feature**: Organize translations by page/feature
2. **Nested Keys**: Use dot notation for hierarchy (`landing.hero.title`)
3. **Consistent Naming**: Match component structure
4. **Reusable Strings**: Use `common` namespace for shared text
5. **Date Formatting**: Use `date-fns` with locale-aware formatters

## Advanced Features

### Dynamic Date Formatting

```typescript
import { format } from 'date-fns'
import { ja, enUS } from 'date-fns/locale'

const dateLocales = { ja, en: enUS }

function formatDate(date: Date, locale: Locale) {
  return format(date, 'PPP', { locale: dateLocales[locale] })
}
```

### Conditional Rendering

```typescript
const { locale } = useTranslation()

return locale === 'ja' ? (
  <JapaneseSpecificComponent />
) : (
  <EnglishSpecificComponent />
)
```

## Migration Guide

### From Hardcoded Strings

**Before:**
```typescript
<h1>ようこそ</h1>
```

**After:**
```typescript
const { t } = useTranslation()
<h1>{t('common.welcome')}</h1>
```

### Adding New Translations

1. Add keys to both `ja` and `en` dictionaries
2. Use the new key in components via `t()`
3. Test with language switcher

## Testing Considerations

### Storybook Integration

```typescript
// story.tsx
import { I18nClientProvider } from '@/lib/i18n/i18n-client-provider'
import { translations } from '@/lib/i18n/translations'

export default {
  decorators: [
    (Story) => (
      <I18nClientProvider locale="en" messages={translations.en}>
        <Story />
      </I18nClientProvider>
    ),
  ],
}
```

### Playwright Tests

```typescript
// Verify language switching
await page.goto('http://localhost:16000')
await page.click('button:has-text("English")')
await expect(page.locator('h1')).toContainText('Welcome')
```

## Known Limitations

1. **No URL-based Routing**: URLs remain the same regardless of locale
2. **Client-Side Switch**: Language changes require page reload
3. **Static Dictionary**: Translations bundled at build time
4. **Manual Sync**: Must manually maintain parity between `ja` and `en`

## Future Enhancements

- [ ] Extract translations to JSON/YAML files
- [ ] Build-time translation validation
- [ ] Lazy-load translation dictionaries
- [ ] RTL language support
- [ ] Pluralization utilities
- [ ] Translation management UI

## Related Files

- Core: `apps/tachyon/src/lib/i18n/`
- Translations: `apps/tachyon/src/lib/i18n/translations.ts`
- Components: `apps/tachyon/src/components/language-switcher.tsx`

## References

- Task Archive: `/docs/src/tasks/completed/v0.14.0/implement-internationalization/`
- CLAUDE.md: i18n implementation section
- Next.js i18n Docs: https://nextjs.org/docs/app/building-your-application/routing/internationalization
