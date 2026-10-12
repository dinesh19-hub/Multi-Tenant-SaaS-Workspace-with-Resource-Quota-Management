import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import App from '../App';

describe('Frontend Foundation - App & Navigation', () => {
  beforeEach(() => {
    // Provide active mock session so protected routes can be tested
    localStorage.setItem(
      'saas_mock_auth_session',
      JSON.stringify({
        userId: 'usr-test-123',
        email: 'user@example.com',
        emailVerified: true,
      })
    );
  });

  it('renders application layout with brand title', async () => {
    render(<App />);
    expect(await screen.findByText('SaaSWorkspace')).toBeInTheDocument();
  });

  it('renders workspace overview dashboard heading', async () => {
    render(<App />);
    expect(await screen.findByText('Workspace Overview')).toBeInTheDocument();
  });

  it('renders sidebar navigation links', async () => {
    render(<App />);
    const sidebar = await screen.findByRole('complementary');
    expect(within(sidebar).getByRole('link', { name: /Dashboard/i })).toBeInTheDocument();
    expect(within(sidebar).getByRole('link', { name: /Projects/i })).toBeInTheDocument();
    expect(within(sidebar).getByRole('link', { name: /Members/i })).toBeInTheDocument();
    expect(within(sidebar).getByRole('link', { name: /Analytics/i })).toBeInTheDocument();
    expect(within(sidebar).getByRole('link', { name: /Settings/i })).toBeInTheDocument();
  });

  it('displays resource quota utilization widget', async () => {
    render(<App />);
    expect(await screen.findByText('Resource Quotas')).toBeInTheDocument();
    expect(await screen.findByText('Active Projects')).toBeInTheDocument();
    expect(await screen.findByText('Team Members')).toBeInTheDocument();
  });
});
