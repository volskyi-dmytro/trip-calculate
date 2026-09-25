import { renderToStaticMarkup } from 'react-dom/server'
import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'

vi.mock('../../../contexts/LanguageContext', () => ({ useLanguage: () => ({ language: 'en', t: (k: string) => k }) }))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))
vi.mock('../../ui/dialog', () => ({
  Dialog: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
}))

const { EditProfileModal } = await import('../EditProfileModal')

describe('EditProfileModal', () => {
  it('does not offer email notifications, because the app sends none', () => {
    const profile = {
      id: 1, email: 'user@example.com', name: 'User', displayName: 'User', pictureUrl: '',
      createdAt: '', lastLogin: '', role: 'USER', preferredLanguage: 'en',
      emailNotificationsEnabled: true, routePlannerAccess: true,
    }
    const html = renderToStaticMarkup(
      <EditProfileModal isOpen profile={profile as never} onClose={() => {}} onSuccess={() => {}} />,
    )

    expect(html).not.toContain('emailNotifications')
    expect(html).toContain('dashboard.editProfile')
  })
})
