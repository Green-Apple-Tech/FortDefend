import { Card, Button } from '../components/ui';
import { SectionHeader } from '../components/fds';

const sections = [
  {
    id: 'authentication',
    title: 'Authentication',
    endpoints: [
      { method: 'POST', path: '/api/auth/login', description: 'Sign in with email and password.' },
      { method: 'POST', path: '/api/auth/login/totp', description: 'Complete two-step sign-in.' },
      { method: 'POST', path: '/api/auth/refresh', description: 'Get a fresh access token.' },
    ],
  },
  {
    id: 'device-management',
    title: 'Devices',
    endpoints: [
      { method: 'GET', path: '/api/integrations/devices', description: 'List all connected devices.' },
      { method: 'GET', path: '/api/msp/clients/:clientOrgId/devices', description: 'List devices for one MSP client.' },
      { method: 'POST', path: '/api/integrations/devices/:id/sync', description: 'Refresh one device now.' },
      { method: 'POST', path: '/api/agent/heartbeat', description: 'Send agent status and metrics.' },
    ],
  },
  {
    id: 'alerts-reports',
    title: 'Alerts',
    endpoints: [
      { method: 'GET', path: '/api/v1/alerts', description: 'List open and recent alerts.' },
      { method: 'POST', path: '/api/reports/dashboard', description: 'Get dashboard summary data.' },
      { method: 'GET', path: '/api/msp/overview', description: 'Get aggregate MSP report stats.' },
    ],
  },
  {
    id: 'reports',
    title: 'Reports',
    endpoints: [
      { method: 'GET', path: '/api/reports/dashboard', description: 'Executive dashboard metrics.' },
      { method: 'GET', path: '/api/msp/clients/:clientOrgId/dashboard', description: 'Dashboard for a client account.' },
      { method: 'GET', path: '/api/msp/clients', description: 'Client report summaries and health.' },
    ],
  },
  {
    id: 'scripts',
    title: 'Scripts',
    endpoints: [
      { method: 'GET', path: '/api/scripts', description: 'List custom scripts.' },
      { method: 'POST', path: '/api/scripts', description: 'Create a new script.' },
      { method: 'POST', path: '/api/scripts/:id/run', description: 'Run a script on selected devices.' },
    ],
  },
  {
    id: 'integrations',
    title: 'Integrations',
    endpoints: [
      { method: 'POST', path: '/api/integrations/intune/connect', description: 'Connect Microsoft Intune.' },
      { method: 'POST', path: '/api/integrations/google/connect', description: 'Connect Google Admin.' },
      { method: 'GET', path: '/api/agent/download', description: 'Download the Windows agent.' },
    ],
  },
  {
    id: 'webhooks',
    title: 'Webhooks',
    endpoints: [
      { method: 'POST', path: '/api/webhooks/stripe', description: 'Receive Stripe webhook events.' },
      { method: 'POST', path: '/api/integrations/test-webhook', description: 'Send a webhook test ping.' },
    ],
  },
];

function CodeBlock({ code }) {
  return <pre className="mt-2 overflow-x-auto rounded-lg bg-gray-900 p-4 text-xs text-gray-100">{code}</pre>;
}

export default function ApiDocs() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeader
          className="mb-0"
          title="FortDefend API"
          description="Everything you need to connect FortDefend into your app."
        />
        <a href="#authentication">
          <Button>Start with authentication</Button>
        </a>
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-gray-900">Authentication instructions</h2>
        <p className="mt-2 text-sm text-gray-600">Use your organization API key in the `Authorization` header as `Bearer YOUR_API_KEY`.</p>
        <CodeBlock
          code={`curl -X GET "$BASE_URL/api/reports/dashboard" \\\n  -H "Authorization: Bearer YOUR_API_KEY"\n\nfetch("/api/reports/dashboard", {\n  headers: { Authorization: "Bearer YOUR_API_KEY" }\n})`}
        />
      </Card>

      {sections.map((section) => (
        <Card key={section.id}>
          <h3 id={section.id} className="text-lg font-semibold text-gray-900">
            {section.title}
          </h3>
          <div className="mt-4 space-y-4">
            {section.endpoints.map((ep) => (
              <div key={`${section.id}-${ep.method}-${ep.path}`} className="rounded-lg border border-gray-200 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded px-2 py-1 text-xs font-semibold ${ep.method === 'GET' ? 'bg-emerald-100 text-emerald-700' : 'bg-brand-light text-brand'}`}>
                    {ep.method}
                  </span>
                  <code className="text-sm text-gray-900">{ep.path}</code>
                </div>
                <p className="mt-2 text-sm text-gray-600">{ep.description}</p>
                <CodeBlock
                  code={`curl -X ${ep.method} "$BASE_URL${ep.path}" \\\n  -H "Authorization: Bearer YOUR_API_KEY" \\\n  -H "Content-Type: application/json"\n\nawait fetch("${ep.path}", {\n  method: "${ep.method}",\n  headers: {\n    Authorization: "Bearer YOUR_API_KEY",\n    "Content-Type": "application/json"\n  }\n});`}
                />
                <CodeBlock code={`{\n  "ok": true,\n  "message": "Example response for ${ep.path}"\n}`} />
              </div>
            ))}
          </div>
        </Card>
      ))}
    </div>
  );
}
