import { useState, useEffect, useMemo, useRef } from 'react';
import { api } from '../lib/api';

const FolderIcon = ({ open }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill={open ? '#185FA5' : '#6B7280'} className="flex-shrink-0">
    {open
      ? <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
      : <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 2h9a2 2 0 012 2v12z"/>}
  </svg>
);

const DeviceIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth="2" className="flex-shrink-0">
    <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
  </svg>
);

const ChevronIcon = ({ open }) => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
    className={`flex-shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}>
    <path d="M9 18l6-6-6-6"/>
  </svg>
);

function ContextMenu({ x, y, items, onClose }) {
  const ref = useRef();
  useEffect(() => {
    const handler = () => onClose();
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} className="fixed z-50 bg-white border border-gray-200 rounded shadow-lg py-1 min-w-40"
      style={{ top: y, left: x }}>
      {items.map((item, i) =>
        item === 'divider'
          ? <div key={i} className="border-t border-gray-100 my-1"/>
          : <button key={i} onClick={() => { item.action(); onClose(); }}
              className={`w-full text-left px-4 py-2 text-sm hover:bg-gray-50 ${item.danger ? 'text-red-600' : 'text-gray-700'}`}>
              {item.label}
            </button>
      )}
    </div>
  );
}

function GroupNode({ group, selectedId, onSelect, onContextMenu, onDrop, depth = 0 }) {
  const [open, setOpen] = useState(depth < 2);
  const [dragOver, setDragOver] = useState(false);
  const hasChildren = group.children && group.children.length > 0;

  return (
    <div>
      <div
        className={`flex items-center gap-1 px-2 py-1.5 rounded cursor-pointer select-none
          ${selectedId === group.id ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'}
          ${dragOver ? 'bg-blue-100 ring-2 ring-blue-400' : ''}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
        onClick={() => onSelect(group)}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(e, group); }}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const deviceId = e.dataTransfer.getData('deviceId');
          const fromGroupId = e.dataTransfer.getData('fromGroupId');
          if (deviceId) onDrop(deviceId, fromGroupId, group.id);
        }}
      >
        {hasChildren
          ? <button onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }} className="p-0.5 text-gray-400 hover:text-gray-600">
              <ChevronIcon open={open}/>
            </button>
          : <span className="w-4"/>}
        <FolderIcon open={open && hasChildren}/>
        <span className="text-sm flex-1 truncate">{group.name}</span>
        {group.device_count > 0 &&
          <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">{group.device_count}</span>}
      </div>
      {open && hasChildren && (
        <div>
          {group.children.map(child => (
            <GroupNode key={child.id} group={child} selectedId={selectedId}
              onSelect={onSelect} onContextMenu={onContextMenu} onDrop={onDrop} depth={depth + 1}/>
          ))}
        </div>
      )}
    </div>
  );
}

function DeviceCard({ device, groupId, onRemove }) {
  const handleDragStart = (e) => {
    e.dataTransfer.setData('deviceId', device.id);
    e.dataTransfer.setData('fromGroupId', groupId);
  };

  const statusColor = {
    online: 'bg-green-100 text-green-700',
    offline: 'bg-gray-100 text-gray-500',
    warning: 'bg-yellow-100 text-yellow-700',
    alert: 'bg-red-100 text-red-700',
  }[device.status] || 'bg-gray-100 text-gray-500';

  return (
    <div draggable onDragStart={handleDragStart}
      className="flex items-center gap-3 p-3 bg-white border border-gray-200 rounded-lg hover:border-blue-300 cursor-grab active:cursor-grabbing group">
      <DeviceIcon/>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{device.name}</div>
        <div className="text-xs text-gray-400">{device.os || 'Unknown OS'}</div>
      </div>
      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
        {device.status || 'unknown'}
      </span>
      <button onClick={() => onRemove(device.id)}
        className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-opacity text-lg leading-none">
        ×
      </button>
    </div>
  );
}

const DYNA_FIELDS = [
  { id: 'device_name', label: 'Device Name', type: 'text' },
  { id: 'os', label: 'OS', type: 'text' },
  { id: 'os_version', label: 'OS Version', type: 'text' },
  { id: 'last_seen', label: 'Last Seen', type: 'date' },
  { id: 'disk_free', label: 'Disk Free', type: 'number' },
  { id: 'ram', label: 'RAM', type: 'number' },
  { id: 'security_score', label: 'Security Score', type: 'number' },
  { id: 'agent_version', label: 'Agent Version', type: 'text' },
  { id: 'source', label: 'Source', type: 'text' },
  { id: 'location', label: 'Location', type: 'text' },
  { id: 'serial_number', label: 'Serial Number', type: 'text' },
  { id: 'user_email', label: 'User Email', type: 'text' },
];

const DYNA_TEMPLATES = [
  { name: 'Windows 11 Devices', mode: 'all', rows: [{ field: 'os', operator: 'contains', value: 'Windows 11' }] },
  { name: 'Low Disk Space', mode: 'all', rows: [{ field: 'disk_free', operator: 'less_than', value: '10' }] },
  { name: 'Offline > 7 Days', mode: 'all', rows: [{ field: 'last_seen', operator: 'within_last_days', value: '7', invert: true }] },
  { name: 'Needs Agent Update', mode: 'all', rows: [{ field: 'agent_version', operator: 'not_equals', value: '1.0.1' }] },
];

function operatorsForField(fieldId) {
  const field = DYNA_FIELDS.find((f) => f.id === fieldId);
  if (!field) return [];
  if (field.type === 'text') return ['contains', 'starts_with', 'ends_with', 'equals', 'not_equals'];
  if (field.type === 'number') return ['greater_than', 'less_than', 'equals', 'between'];
  if (field.type === 'date') return ['within_last_days', 'before', 'after'];
  if (field.type === 'boolean') return ['is_true', 'is_false'];
  return ['equals'];
}

export default function Groups({ embedded = false } = {}) {
  const [groups, setGroups] = useState([]);
  const [selectedGroup, setSelectedGroup] = useState(null); // { type: 'regular'|'ungrouped'|'dynagroup', ... }
  const [devices, setDevices] = useState([]);
  const [ungroupedDevices, setUngroupedDevices] = useState([]);
  const [allDevices, setAllDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [contextMenu, setContextMenu] = useState(null);
  const [modal, setModal] = useState(null);
  const [modalInput, setModalInput] = useState('');
  const [dragOverUngrouped, setDragOverUngrouped] = useState(false);
  const [dynagroups, setDynagroups] = useState([]);
  const [builder, setBuilder] = useState({
    open: false,
    name: '',
    mode: 'all',
    rows: [{ field: 'os', operator: 'contains', value: '' }],
    previewDevices: [],
  });

  useEffect(() => {
    loadGroups();
    loadAllDevices();
    loadDynagroups();
  }, []);

  useEffect(() => {
    if (!selectedGroup) return;
    if (selectedGroup.type === 'regular') loadGroupDevices(selectedGroup.id);
    if (selectedGroup.type === 'dynagroup') loadDynagroupDevices(selectedGroup.id);
    if (selectedGroup.type === 'ungrouped') loadUngroupedDevices();
  }, [selectedGroup]);

  useEffect(() => {
    if (!groups.length || !allDevices.length) return;
    loadUngroupedDevices({ forPanel: false });
  }, [groups, allDevices]);

  async function loadGroups() {
    try {
      const data = await api('/api/groups');
      setGroups(data.groups);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function loadAllDevices() {
    try {
      const data = await api('/api/devices');
      setAllDevices(data.devices || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadDynagroups() {
    const data = await api('/api/groups/dynagroups').catch(() => ({ dynagroups: [] }));
    setDynagroups(Array.isArray(data?.dynagroups) ? data.dynagroups : []);
  }

  async function loadGroupDevices(groupId) {
    try {
      const data = await api(`/api/groups/${groupId}/devices`);
      setDevices(data.devices || []);
    } catch (err) {
      console.error(err);
    }
  }

  async function loadDynagroupDevices(id) {
    const data = await api(`/api/groups/dynagroups/${id}/devices`).catch(() => ({ devices: [] }));
    setDevices(Array.isArray(data?.devices) ? data.devices : []);
  }

  async function loadUngroupedDevices(opts = { forPanel: true }) {
    const flat = flattenGroups(groups);
    const members = new Set();
    await Promise.all(
      flat.map(async (g) => {
        const data = await api(`/api/groups/${g.id}/devices`).catch(() => ({ devices: [] }));
        for (const d of data.devices || []) members.add(d.id);
      }),
    );
    const list = allDevices.filter((d) => !members.has(d.id));
    setUngroupedDevices(list);
    if (opts.forPanel) setDevices(list);
  }

  async function createGroup(name, parentId = null) {
    try {
      await api('/api/groups', { method: 'POST', body: { name, parent_id: parentId } });
      await loadGroups();
    } catch (err) {
      console.error(err);
    }
  }

  async function renameGroup(id, name) {
    try {
      await api(`/api/groups/${id}`, { method: 'PATCH', body: { name } });
      await loadGroups();
      if (selectedGroup?.id === id) setSelectedGroup(g => ({ ...g, name }));
    } catch (err) {
      console.error(err);
    }
  }

  async function deleteGroup(id) {
    if (!confirm('Delete this group? Devices will be unassigned.')) return;
    try {
      await api(`/api/groups/${id}`, { method: 'DELETE' });
      if (selectedGroup?.id === id) setSelectedGroup(null);
      await loadGroups();
    } catch (err) {
      console.error(err);
    }
  }

  async function handleDrop(deviceId, fromGroupId, toGroupId) {
    try {
      await api(`/api/groups/devices/${deviceId}/move`, {
        method: 'POST',
        body: { from_group_id: fromGroupId || null, to_group_id: toGroupId || null },
      });
      await loadGroups();
      if (selectedGroup) await loadGroupDevices(selectedGroup.id);
    } catch (err) {
      console.error(err);
    }
  }

  async function removeDeviceFromGroup(deviceId) {
    try {
      if (selectedGroup?.type !== 'regular') return;
      await api(`/api/groups/${selectedGroup.id}/devices/${deviceId}`, { method: 'DELETE' });
      await loadGroupDevices(selectedGroup.id);
      await loadGroups();
    } catch (err) {
      console.error(err);
    }
  }

  function handleContextMenu(e, group) {
    setContextMenu({
      x: e.clientX, y: e.clientY,
      items: [
        { label: '👁️ View Devices', action: async () => { setSelectedGroup({ type: 'regular', ...group }); } },
        'divider',
        { label: '📁 Add subgroup', action: () => { setModal({ type: 'create', parent: group }); setModalInput(''); } },
        { label: '✏️ Rename', action: () => { setModal({ type: 'rename', group }); setModalInput(group.name); } },
        'divider',
        { label: '🗑️ Delete group', danger: true, action: () => deleteGroup(group.id) },
      ],
    });
  }

  async function handleModalSubmit() {
    if (!modalInput.trim()) return;
    if (modal.type === 'create') {
      await createGroup(modalInput.trim(), modal.parent?.id || null);
    } else if (modal.type === 'rename') {
      await renameGroup(modal.group.id, modalInput.trim());
    }
    setModal(null);
    setModalInput('');
  }

  async function previewDynagroup() {
    const data = await api('/api/devices').catch(() => ({ devices: [] }));
    const all = Array.isArray(data?.devices) ? data.devices : [];
    const filtered = all.filter((d) => evaluateDeviceAgainstRules(d, builder.rows, builder.mode));
    setBuilder((b) => ({ ...b, previewDevices: filtered }));
  }

  async function saveDynagroup() {
    if (!builder.name.trim()) return;
    const rules = { mode: builder.mode, rows: builder.rows };
    await api('/api/groups/dynagroups', { method: 'POST', body: { name: builder.name.trim(), rules } });
    setBuilder({ open: false, name: '', mode: 'all', rows: [{ field: 'os', operator: 'contains', value: '' }], previewDevices: [] });
    await loadDynagroups();
  }

  const ungroupedCount = useMemo(() => ungroupedDevices.length, [ungroupedDevices.length]);

  return (
    <div className={`flex h-full bg-gray-50 ${embedded ? 'min-h-[28rem]' : 'min-h-screen'}`}>
      <div className="w-72 bg-white border-r border-gray-200 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="font-semibold text-gray-800 text-sm">Groups</h2>
          <button onClick={() => { setModal({ type: 'create', parent: null }); setModalInput(''); }}
            className="text-blue-600 hover:text-blue-800 text-xl leading-none font-light" title="New group">+</button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="text-center text-gray-400 text-sm py-8">Loading...</div>
          ) : groups.length === 0 ? (
            <div className="text-center text-gray-400 text-sm py-8">
              No groups yet.<br/>
              <button onClick={() => { setModal({ type: 'create', parent: null }); setModalInput(''); }}
                className="text-blue-500 hover:underline mt-1">Create your first group</button>
            </div>
          ) : (
            <>
              <div
                className={`mb-1 flex items-center gap-2 rounded px-2 py-1.5 text-sm cursor-pointer ${
                  selectedGroup?.type === 'ungrouped' ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50 text-gray-700'
                }`}
                onClick={() => setSelectedGroup({ type: 'ungrouped', id: 'ungrouped', name: 'Ungrouped Devices' })}
              >
                <span>📦</span>
                <span className="flex-1">Ungrouped Devices</span>
                <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-xs text-gray-500">{ungroupedCount}</span>
              </div>
              {groups.map(g => (
              <GroupNode key={g.id} group={g} selectedId={selectedGroup?.id}
                onSelect={(group) => setSelectedGroup({ type: 'regular', ...group })} onContextMenu={handleContextMenu} onDrop={handleDrop}/>
              ))}
              <div className="mt-3 border-t border-gray-100 pt-3">
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">DynaGroups</div>
                  <button
                    onClick={() => setBuilder((b) => ({ ...b, open: !b.open }))}
                    className="rounded border border-gray-200 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50"
                  >
                    + New DynaGroup
                  </button>
                </div>
                {dynagroups.map((dg) => (
                  <button
                    key={dg.id}
                    onClick={() => setSelectedGroup({ type: 'dynagroup', ...dg })}
                    className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
                      selectedGroup?.type === 'dynagroup' && selectedGroup?.id === dg.id
                        ? 'bg-blue-50 text-blue-700'
                        : 'hover:bg-gray-50 text-gray-700'
                    }`}
                  >
                    <span>⚡</span>
                    <span className="truncate">{dg.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div
          className={`border-t border-gray-200 p-3 ${dragOverUngrouped ? 'bg-blue-50' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragOverUngrouped(true); }}
          onDragLeave={() => setDragOverUngrouped(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragOverUngrouped(false);
            const deviceId = e.dataTransfer.getData('deviceId');
            const fromGroupId = e.dataTransfer.getData('fromGroupId');
            if (deviceId) handleDrop(deviceId, fromGroupId, null);
          }}
        >
          <div className="text-xs text-gray-400 text-center">Drop here to ungroup</div>
        </div>
      </div>

      <div className="flex-1 p-6">
        {selectedGroup ? (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-xl font-semibold text-gray-800">{selectedGroup.name}</h1>
                <p className="text-sm text-gray-400">{devices.length} device{devices.length !== 1 ? 's' : ''}</p>
              </div>
              {selectedGroup.type === 'regular' ? <div className="flex gap-2">
                <button onClick={() => { setModal({ type: 'rename', group: selectedGroup }); setModalInput(selectedGroup.name); }}
                  className="text-sm px-3 py-1.5 border border-gray-200 rounded hover:bg-gray-50 text-gray-600">
                  Rename
                </button>
                <button onClick={() => { setModal({ type: 'create', parent: selectedGroup }); setModalInput(''); }}
                  className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700">
                  + Add subgroup
                </button>
              </div> : null}
            </div>

            {devices.length === 0 ? (
              <div className="border-2 border-dashed border-gray-200 rounded-xl p-12 text-center text-gray-400">
                <div className="text-4xl mb-2">📂</div>
                <div className="text-sm">No devices in this group</div>
                <div className="text-xs mt-1">Drag devices here to add them</div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2 max-w-2xl">
                {devices.map(d => (
                  <DeviceCard key={d.id} device={d} groupId={selectedGroup.id} onRemove={removeDeviceFromGroup}/>
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-center h-64 text-gray-400">
            <div className="text-center">
              <div className="text-5xl mb-3">📁</div>
              <div className="text-sm">Select a group to view its devices</div>
            </div>
          </div>
        )}
      </div>

      {builder.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35">
          <div className="w-[900px] max-w-[95vw] rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">New DynaGroup</h3>
              <button onClick={() => setBuilder((b) => ({ ...b, open: false }))} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Name</label>
                <input
                  value={builder.name}
                  onChange={(e) => setBuilder((b) => ({ ...b, name: e.target.value }))}
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-gray-700">Devices matching</span>
                <select
                  value={builder.mode}
                  onChange={(e) => setBuilder((b) => ({ ...b, mode: e.target.value }))}
                  className="rounded border border-gray-300 px-2 py-1"
                >
                  <option value="all">ALL</option>
                  <option value="any">ANY</option>
                </select>
                <span className="text-gray-700">of these rules:</span>
              </div>
              {builder.rows.map((row, idx) => {
                const field = DYNA_FIELDS.find((f) => f.id === row.field) || DYNA_FIELDS[0];
                const ops = operatorsForField(field.id);
                return (
                  <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-4">
                    <select
                      value={row.field}
                      onChange={(e) => {
                        const nextField = e.target.value;
                        const nextOps = operatorsForField(nextField);
                        setBuilder((b) => ({
                          ...b,
                          rows: b.rows.map((r, i) => (i === idx ? { ...r, field: nextField, operator: nextOps[0] } : r)),
                        }));
                      }}
                      className="rounded border border-gray-300 px-2 py-2 text-sm"
                    >
                      {DYNA_FIELDS.map((f) => (
                        <option key={f.id} value={f.id}>{f.label}</option>
                      ))}
                    </select>
                    <select
                      value={row.operator}
                      onChange={(e) =>
                        setBuilder((b) => ({
                          ...b,
                          rows: b.rows.map((r, i) => (i === idx ? { ...r, operator: e.target.value } : r)),
                        }))
                      }
                      className="rounded border border-gray-300 px-2 py-2 text-sm"
                    >
                      {ops.map((op) => (
                        <option key={op} value={op}>{op.replace(/_/g, ' ')}</option>
                      ))}
                    </select>
                    <input
                      value={row.value || ''}
                      type={field.type === 'number' ? 'number' : field.type === 'date' && !['within_last_days'].includes(row.operator) ? 'date' : 'text'}
                      placeholder={row.operator === 'within_last_days' ? 'X days' : 'Value'}
                      onChange={(e) =>
                        setBuilder((b) => ({
                          ...b,
                          rows: b.rows.map((r, i) => (i === idx ? { ...r, value: e.target.value } : r)),
                        }))
                      }
                      className="rounded border border-gray-300 px-2 py-2 text-sm"
                    />
                    {row.operator === 'between' ? (
                      <input
                        value={row.valueTo || ''}
                        type="number"
                        placeholder="And"
                        onChange={(e) =>
                          setBuilder((b) => ({
                            ...b,
                            rows: b.rows.map((r, i) => (i === idx ? { ...r, valueTo: e.target.value } : r)),
                          }))
                        }
                        className="rounded border border-gray-300 px-2 py-2 text-sm"
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setBuilder((b) => ({ ...b, rows: b.rows.filter((_, i) => i !== idx) }))}
                        className="rounded border border-red-200 px-2 py-2 text-sm text-red-600 hover:bg-red-50"
                        disabled={builder.rows.length === 1}
                      >
                        Remove
                      </button>
                    )}
                  </div>
                );
              })}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setBuilder((b) => ({ ...b, rows: [...b.rows, { field: 'device_name', operator: 'contains', value: '' }] }))}
                  className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
                >
                  + Add rule
                </button>
                <button onClick={previewDynagroup} className="rounded border border-blue-300 px-3 py-2 text-sm text-blue-700 hover:bg-blue-50">
                  Preview
                </button>
                <button onClick={saveDynagroup} className="rounded bg-blue-600 px-3 py-2 text-sm text-white hover:bg-blue-700">
                  Save DynaGroup
                </button>
              </div>
              <div className="rounded border border-gray-200 bg-gray-50 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Template examples</div>
                <div className="grid gap-2 sm:grid-cols-2">
                  {DYNA_TEMPLATES.map((t) => (
                    <button
                      key={t.name}
                      onClick={() => setBuilder((b) => ({ ...b, name: t.name, mode: t.mode, rows: t.rows }))}
                      className="rounded border border-gray-200 bg-white px-3 py-2 text-left text-sm hover:border-blue-300"
                    >
                      {t.name}
                    </button>
                  ))}
                </div>
              </div>
              {builder.previewDevices.length > 0 ? (
                <div className="max-h-48 overflow-auto rounded border border-gray-200">
                  {builder.previewDevices.map((d) => (
                    <div key={d.id} className="border-b border-gray-100 px-3 py-2 text-sm">
                      {d.name} <span className="text-gray-400">· {d.os || 'Unknown OS'}</span>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {contextMenu && (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} items={contextMenu.items}
          onClose={() => setContextMenu(null)}/>
      )}

      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 w-80">
            <h3 className="font-semibold text-gray-800 mb-4">
              {modal.type === 'create'
                ? modal.parent ? `New subgroup in "${modal.parent.name}"` : 'New group'
                : `Rename "${modal.group.name}"`}
            </h3>
            <input autoFocus value={modalInput} onChange={e => setModalInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleModalSubmit(); if (e.key === 'Escape') setModal(null); }}
              placeholder="Group name" className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 mb-4"/>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setModal(null)} className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 rounded-lg">Cancel</button>
              <button onClick={handleModalSubmit} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                {modal.type === 'create' ? 'Create' : 'Rename'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function flattenGroups(groups, out = []) {
  for (const g of groups || []) {
    out.push(g);
    if (Array.isArray(g.children) && g.children.length) flattenGroups(g.children, out);
  }
  return out;
}

function evaluateDeviceAgainstRules(device, rows, mode) {
  const checks = (rows || []).map((r) => evaluateRule(device, r));
  return mode === 'any' ? checks.some(Boolean) : checks.every(Boolean);
}

function evaluateRule(device, row) {
  const map = {
    device_name: device.name,
    os: device.os,
    os_version: device.os_version,
    last_seen: device.last_seen,
    disk_free: device.disk_free_gb,
    ram: device.ram_total_gb,
    security_score: device.security_score,
    agent_version: device.agent_version,
    source: device.source,
    location: device.location,
    serial_number: device.serial,
    user_email: device.user_email,
  };
  const left = map[row.field];
  const op = row.operator;
  const right = row.value;
  if (op === 'contains') return String(left || '').toLowerCase().includes(String(right || '').toLowerCase());
  if (op === 'starts_with') return String(left || '').toLowerCase().startsWith(String(right || '').toLowerCase());
  if (op === 'ends_with') return String(left || '').toLowerCase().endsWith(String(right || '').toLowerCase());
  if (op === 'equals') return String(left || '').toLowerCase() === String(right || '').toLowerCase();
  if (op === 'not_equals') return String(left || '').toLowerCase() !== String(right || '').toLowerCase();
  const ln = Number(left);
  const rn = Number(right);
  if (op === 'greater_than') return Number.isFinite(ln) && Number.isFinite(rn) && ln > rn;
  if (op === 'less_than') return Number.isFinite(ln) && Number.isFinite(rn) && ln < rn;
  if (op === 'between') {
    const rn2 = Number(row.valueTo);
    return Number.isFinite(ln) && Number.isFinite(rn) && Number.isFinite(rn2) && ln >= Math.min(rn, rn2) && ln <= Math.max(rn, rn2);
  }
  if (op === 'within_last_days') {
    const d = new Date(left);
    const days = Number(right);
    if (Number.isNaN(d.getTime()) || !Number.isFinite(days)) return false;
    return Date.now() - d.getTime() <= days * 86400000;
  }
  if (op === 'before' || op === 'after') {
    const l = new Date(left).getTime();
    const r = new Date(right).getTime();
    if (!Number.isFinite(l) || !Number.isFinite(r)) return false;
    return op === 'before' ? l < r : l > r;
  }
  return false;
}