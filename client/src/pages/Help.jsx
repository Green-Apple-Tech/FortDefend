import { Card } from '../components/ui';
import { Link } from 'react-router-dom';

export default function Help() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-50">Help</h1>
      <Card className="border-fds-border space-y-3 p-6 text-sm text-slate-600 dark:text-slate-300">
        <p>Documentation and support resources will live here.</p>
        <p>
          <Link to="/api-docs" className="font-medium text-brand hover:underline">
            API documentation
          </Link>
        </p>
      </Card>
    </div>
  );
}
