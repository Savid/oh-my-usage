import type { JSX } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import { AccountPage } from '@/pages/accounts/AccountPage';

function Account(): JSX.Element {
  const { accountId } = Route.useParams();

  return <AccountPage accountId={accountId} />;
}

export const Route = createFileRoute('/accounts/$accountId')({
  component: Account,
  head: () => ({ meta: [{ title: 'Account | oh-my-usage' }] }),
});
