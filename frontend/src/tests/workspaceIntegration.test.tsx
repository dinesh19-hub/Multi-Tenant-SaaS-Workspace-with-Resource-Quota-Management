import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from '../context/AuthContext';
import { ToastProvider } from '../context/ToastContext';
import { WorkspaceProvider } from '../context/WorkspaceContext';
import { ProjectsPage } from '../pages/ProjectsPage';
import { MembersPage } from '../pages/MembersPage';
import { SettingsPage } from '../pages/SettingsPage';

function renderWithProviders(ui: React.ReactElement) {
  return render(
    <ToastProvider>
      <AuthProvider>
        <WorkspaceProvider>
          <BrowserRouter>{ui}</BrowserRouter>
        </WorkspaceProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

describe('Frontend Workspace Integration & Modals (Phase 10)', () => {
  beforeEach(() => {
    localStorage.clear();
    // Seed authenticated session
    localStorage.setItem(
      'saas_mock_auth_session',
      JSON.stringify({
        userId: 'usr-tester-100',
        email: 'tester@workspace.com',
        emailVerified: true,
      })
    );
  });

  it('renders projects and creates a new project via modal', async () => {
    renderWithProviders(<ProjectsPage />);

    // Check heading
    expect(await screen.findByRole('heading', { name: /Projects/i })).toBeInTheDocument();

    // Click "+ Create Project" button
    const createBtn = screen.getByRole('button', { name: /\+ Create Project/i });
    fireEvent.click(createBtn);

    // Verify modal appeared
    expect(await screen.findByText('Create New Project')).toBeInTheDocument();

    // Fill in project form
    const nameInput = screen.getByPlaceholderText('e.g. Core Service API');
    fireEvent.change(nameInput, { target: { value: 'Frontend Payment Gateway' } });

    // Submit form
    const submitBtn = screen.getByRole('button', { name: 'Create Project' });
    fireEvent.click(submitBtn);

    // Verify new project card appears
    await waitFor(() => {
      expect(screen.getByText('Frontend Payment Gateway')).toBeInTheDocument();
    });
  });

  it('renders members and generates an invite code via modal', async () => {
    renderWithProviders(<MembersPage />);

    // Check heading
    expect(await screen.findByRole('heading', { name: /Members & Access/i })).toBeInTheDocument();

    // Click "+ Generate Invite"
    const inviteBtn = screen.getByRole('button', { name: /\+ Generate Invite/i });
    fireEvent.click(inviteBtn);

    // Verify modal appeared
    expect(await screen.findByText('Invite New Collaborator')).toBeInTheDocument();

    // Click "Generate Code"
    const generateBtn = screen.getByRole('button', { name: 'Generate Code' });
    fireEvent.click(generateBtn);

    // Verify generated code appears
    await waitFor(() => {
      expect(screen.getByText(/Share this single-use invitation code/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
    });
  });

  it('creates an organization via SettingsPage', async () => {
    renderWithProviders(<SettingsPage />);

    expect(await screen.findByRole('heading', { name: /Settings & Workspaces/i })).toBeInTheDocument();

    // Fill in new org name
    const orgInput = screen.getByPlaceholderText('e.g. Acme Innovations');
    fireEvent.change(orgInput, { target: { value: 'Beta Labs Global' } });

    // Select Standard tier
    fireEvent.click(screen.getByText('Standard Tier'));

    // Submit form
    fireEvent.click(screen.getByRole('button', { name: 'Create Organization' }));

    // Verify active details reflect new organization
    await waitFor(() => {
      expect(screen.getAllByText(/Beta Labs Global/).length).toBeGreaterThan(0);
    });
  });
});
