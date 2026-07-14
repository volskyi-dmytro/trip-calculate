import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { AdminDashboard } from '../AdminDashboard'

vi.mock('../../contexts/LanguageContext', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}))
vi.mock('../../components/common/Header', () => ({ Header: () => <header /> }))
vi.mock('../../components/admin/SystemOverview', () => ({ SystemOverview: () => <div>overview</div> }))
vi.mock('../../components/admin/UsersTable', () => ({ UsersTable: () => <div>users</div> }))
vi.mock('../../components/admin/AccessRequestsTable', () => ({ AccessRequestsTable: () => <div>requests</div> }))

describe('AdminDashboard automatic access policy', () => {
  it('does not offer a manual access-request workflow', () => {
    const html = renderToStaticMarkup(<AdminDashboard />)

    expect(html).not.toContain('admin.tabs.accessRequests')
  })
})
