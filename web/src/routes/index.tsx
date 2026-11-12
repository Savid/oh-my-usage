import { createFileRoute } from '@tanstack/react-router';
import { AccountsPage } from '@/pages/accounts/AccountsPage';

export const Route = createFileRoute('/')({
  component: () => <AccountsPage />,
  head: () => ({ meta: [{ title: 'Accounts | oh-my-usage' }] }),
});
